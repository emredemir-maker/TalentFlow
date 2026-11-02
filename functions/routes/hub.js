// Clyro Hub köprüsü uçları (docs/coklu-sirket-plani.md §2.3, PR 4). Kurallar: services/hubBridge.js.
//
//   POST /api/hub/exchange            — tarayıcı (HubLaunchPage) → Talent sunucusu, { code }.
//                                       Oturumsuz: kimliği Hub'ın tek kullanımlık kodu taşır (256 bit,
//                                       60 sn, tek kullanım). Talent sunucusu kodu Hub'da değiştirir,
//                                       şirket + üyelik + şirket listesini yazar, Firebase giriş jetonunu
//                                       ve şirket kimliğini döner.
//   POST /api/hub/membership-revoked  — Hub → Talent, imzalı (CLYRO-M2M-V1). Üyeliği kapatır.
//   POST /api/hub/support-access      — Hub yönetim konsolu → Talent, imzalı. Süreli destek üyeliği
//                                       açar ya da kapatır (K11).
//
// Bu yönlendirici genel JSON ayrıştırıcısından ÖNCE bağlanır (server.js): imza HAM gövdenin SHA-256'sını
// kapsar, bu yüzden olay uçları gövdeyi kendisi (en çok 4 KB) ham okur. Olay uçları tarayıcıya kapalı
// (Origin taşıyan istek 403); gizli değer tanımsızsa 503 ("uç kapalı"). Yanıtlar kimin hangi şirkette
// olduğunu söylemez: yalnız işlenip işlenmediğini.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { db } from '../config/firebaseAdmin.js';
import {
    applyHubLogin,
    closeMembershipFromHub,
    consumeHubNonce,
    exchangeHubCode,
    grantSupportAccess,
    hubApiBase,
    hubEventsSecret,
    hubExchangeSecret,
    parseMembershipRemoved,
    parseSupportAccess,
    revokeSupportAccess,
    verifyHubSignature,
} from '../services/hubBridge.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('hub');

const CODE_RE = /^[A-Za-z0-9_-]{20,100}$/;
const MAX_EVENT_BODY = 4 * 1024;

/** Sabit pencereli bellek içi sayaç (örnek başına; diğer IP sınırları gibi). */
export function windowCounter(limit, windowMs = 60_000) {
    const hits = new Map();
    return (key) => {
        const now = Date.now();
        if (hits.size > 10_000) hits.clear();
        let e = hits.get(key);
        if (!e || e.resetAt <= now) {
            e = { n: 0, resetAt: now + windowMs };
            hits.set(key, e);
        }
        e.n += 1;
        return e.n <= limit;
    };
}

const DENIAL_MESSAGES = {
    trial_expired: 'Şirketin deneme süresi sona erdi. Devam etmek için Clyro Hub\'dan plan seçin.',
    app_disabled: 'Talent bu çalışma alanında açık değil.',
    inactive: 'Çalışma alanı etkin değil.',
};

/**
 * Hub reddettiyse: kişi o alanın üyesi değilse (ya da Hub gerekçe vermediyse — eski Hub) Talent
 * üyeliği kapatılır. Alanın askıya alınması, uygulamanın kapatılması ve deneme bitişi geri alınabilir
 * durumlar: üyelik kapatılmaz (alan geri açılınca ekip kilitli kalmasın; Hub-Inn PR #67 ile aynı
 * gerekçe). Talent'a erişim bu durumlarda şirket belgesinin süreleri ve Hub doğrulamasının süresiyle kapanır.
 */
async function handleDenial(r) {
    if (r.reason === 'not_member' || r.reason === 'unknown') {
        await closeMembershipFromHub({ db, tenantId: r.tenantId, uid: r.uid, reason: `exchange_denied:${r.reason}` });
    }
}

export function createHubRouter({ fetchImpl = fetch, env = process.env, exchangePerMinute = 20 } = {}) {
    const router = Router();

    const exchangeLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: exchangePerMinute,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Çok fazla giriş denemesi. Lütfen bir dakika sonra tekrar deneyin.' },
    });

    router.post('/api/hub/exchange', exchangeLimiter, express.json({ limit: '2kb' }), async (req, res) => {
        const code = typeof req.body?.code === 'string' ? req.body.code : '';
        if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Giriş bağlantısı geçersiz.' });
        const secret = hubExchangeSecret(env);
        const apiBase = hubApiBase(env);
        if (!secret || !apiBase) {
            log.error('[hub/exchange] HUB_EXCHANGE_SECRET ya da HUB_API_URL tanımlı değil');
            return res.status(503).json({ error: 'Clyro Hub bağlantısı yapılandırılmamış.' });
        }
        try {
            const r = await exchangeHubCode(code, { apiBase, secret, fetch: fetchImpl });
            if (r.kind === 'invalid') {
                return res.status(401).json({ error: 'Giriş bağlantısının süresi dolmuş ya da kullanılmış. Clyro Hub\'dan yeniden açın.' });
            }
            if (r.kind === 'failed') return res.status(502).json({ error: 'Clyro Hub\'a ulaşılamadı.' });
            if (r.kind === 'denied') {
                await handleDenial(r);
                return res.status(403).json({
                    error: DENIAL_MESSAGES[r.reason] || 'Bu çalışma alanına erişiminiz yok.',
                    code: 'WORKSPACE_ACCESS_DENIED',
                });
            }
            const out = await applyHubLogin({ db, hub: r, env });
            if (out.status === 'blocked') {
                return res.status(403).json({
                    error: 'Bu şirketteki üyeliğiniz şirket yöneticisi tarafından kaldırılmış.',
                    code: 'MEMBER_REMOVED',
                });
            }
            // Jeton yalnız yanıtta; günlüğe yazılmaz.
            return res.json({ token: r.token, tenantId: r.tenant.id });
        } catch (err) {
            log.error({ err: err?.message }, '[hub/exchange]');
            return res.status(500).json({ error: 'Giriş tamamlanamadı.' });
        }
    });

    // ── İmzalı olaylar ───────────────────────────────────────────────────────
    const signatureFailures = windowCounter(10);
    const rawBody = express.raw({ type: () => true, limit: MAX_EVENT_BODY });

    /** İmza + nonce + JSON; başarısızsa yanıtı yazar ve null döner. */
    async function verifiedEvent(req, res) {
        if (req.headers.origin !== undefined) {
            res.status(403).json({ error: 'origin' });
            return null;
        }
        const secret = hubEventsSecret(env);
        if (!secret) {
            res.status(503).json({ error: 'disabled' });
            return null;
        }
        const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        const v = verifyHubSignature(secret, { method: req.method, path: req.originalUrl, headers: req.headers, body });
        if (!v.ok) {
            log.warn({ reason: v.reason }, '[hub-olay] imza reddedildi');
            if (!signatureFailures(req.ip || 'unknown')) {
                res.status(429).json({ error: 'rate' });
                return null;
            }
            res.status(401).json({ error: 'unauthorized' });
            return null;
        }
        if (!(await consumeHubNonce(db, v.nonce))) {
            log.warn('[hub-olay] tekrar kullanılan nonce');
            res.status(401).json({ error: 'unauthorized' });
            return null;
        }
        try {
            return JSON.parse(body.toString('utf8'));
        } catch {
            res.status(400).json({ error: 'invalid' });
            return null;
        }
    }

    // Gövde 4 KB'yi aşarsa express.raw 413 atar; genel hata işleyicisine değil buraya düşsün.
    const tooLarge = (err, req, res, next) => {
        if (err?.type === 'entity.too.large' || err?.status === 413) return res.status(413).json({ error: 'too-large' });
        return next(err);
    };

    router.post('/api/hub/membership-revoked', rawBody, tooLarge, async (req, res) => {
        try {
            const json = await verifiedEvent(req, res);
            if (json === null) return undefined;
            const ev = parseMembershipRemoved(json);
            if (!ev) return res.status(400).json({ error: 'invalid' });
            const result = await closeMembershipFromHub({ db, tenantId: ev.tenantId, uid: ev.uid, occurredAt: ev.occurredAt });
            if (result !== 'closed') log.info({ result }, '[hub-olay] üyelikten çıkarma olayı açık üyelik kapatmadı');
            return res.status(202).json({ ok: true });
        } catch (err) {
            log.error({ err: err?.message }, '[hub/membership-revoked]');
            return res.status(500).json({ error: 'internal' });
        }
    });

    router.post('/api/hub/support-access', rawBody, tooLarge, async (req, res) => {
        try {
            const json = await verifiedEvent(req, res);
            if (json === null) return undefined;
            const ev = parseSupportAccess(json);
            if (!ev) return res.status(400).json({ error: 'invalid' });
            if (ev.type === 'support.revoke') {
                const r = await revokeSupportAccess({ db, ev });
                return res.status(200).json({ ok: true, result: r });
            }
            const r = await grantSupportAccess({ db, ev });
            // Hub konsolu bu sonuçları kullanıcıya gösterir; konsol yalnız platform yöneticisine açık.
            if (r === 'no_tenant') return res.status(404).json({ error: 'no_tenant' });
            if (r === 'already_member') return res.status(409).json({ error: 'already_member' });
            return res.status(200).json({ ok: true, result: r });
        } catch (err) {
            log.error({ err: err?.message }, '[hub/support-access]');
            return res.status(500).json({ error: 'internal' });
        }
    });

    return router;
}

export default createHubRouter();
