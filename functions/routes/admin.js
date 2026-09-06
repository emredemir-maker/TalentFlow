// Super-admin-only management endpoints. Each is gated by
// requireAuth(['super_admin']) so a regular recruiter or department user
// returns 403 even with a valid Firebase ID token.
//
//   DELETE /api/admin/auth-user/:uid     — purge a Firebase Auth account.
//                                          Self-deletion blocked. 'user-not-
//                                          found' is treated as already-done
//                                          (idempotent).
//   GET  /api/admin/integrations         — read OAuth client config (Microsoft
//                                          365 today; Google added later).
//                                          clientSecret is masked to a boolean
//                                          (clientSecretSet) so the UI never
//                                          sees the actual secret.
//   POST /api/admin/integrations         — write OAuth client config and
//                                          mutate the live integrationConfigs
//                                          cache so subsequent /api/auth/<x>/url
//                                          calls see the new values without
//                                          a server restart.
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { admin, db } from '../config/firebaseAdmin.js';
import { integrationConfigs } from '../config/integrations.js';
import { summarize } from '../services/usage.js';
import { budgetLimits, todayUsage } from '../services/aiBudget.js';
import { splitByRetention, storagePathFromUrl } from '../services/retention.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('admin');

const router = Router();

const INTEGRATIONS_DOC = 'artifacts/talent-flow/public/data/settings/integrations';
const API_KEYS_DOC = 'artifacts/talent-flow/public/data/settings/api_keys';
const USAGE_PATH = 'artifacts/talent-flow/public/data/usage';
const SYSTEM_DOC = 'artifacts/talent-flow/public/data/settings/system';
const CANDIDATES_PATH = 'artifacts/talent-flow/public/data/candidates';
const ACCESS_LOG_PATH = 'artifacts/talent-flow/public/data/accessLogs';

router.delete('/api/admin/auth-user/:uid', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { uid } = req.params;
        if (!uid) return res.status(400).json({ error: 'uid gerekli' });
        if (uid === req.user?.uid) return res.status(403).json({ error: 'Kendi hesabınızı silemezsiniz.' });
        await admin.auth().deleteUser(uid);
        log.info(`[admin] Firebase Auth kullanıcısı silindi: ${uid}`);
        res.json({ success: true });
    } catch (err) {
        if (err.code === 'auth/user-not-found') return res.json({ success: true, note: 'Zaten silinmiş' });
        log.error('[admin/delete-auth-user]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin SDK ile okunur/yazılır: firestore.rules bu dokümanı client'a tamamen
// kapatır (isSecretSetting) — kullanıcı tokenıyla REST erişimi artık mümkün
// değil ve requireAuth zaten req.firebaseToken set etmiyordu (eski kod bu
// yüzden her zaman 500 dönüyordu).
const PROVIDERS = ['google', 'microsoft365'];

// clientSecret ASLA istemciye dönmez — yalnızca "ayarlı mı" bilgisi verilir.
function maskProvider(cfg) {
    if (!cfg) return null;
    return {
        clientId: cfg.clientId || '',
        tenantId: cfg.tenantId || '',
        clientSecretSet: !!cfg.clientSecret,
        redirectUri: cfg.redirectUri || '',
        enabled: cfg.enabled !== false,
        configuredAt: cfg.configuredAt || null,
        configuredBy: cfg.configuredBy || null,
    };
}

router.get('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const snap = await db.doc(INTEGRATIONS_DOC).get();
        const stored = snap.exists ? snap.data() || {} : {};
        res.json({
            google: maskProvider(stored.google),
            microsoft365: maskProvider(stored.microsoft365),
        });
    } catch (err) {
        log.error({ err }, '[admin/integrations GET]');
        res.status(500).json({ error: 'Entegrasyon ayarları okunamadı.' });
    }
});

router.post('/api/admin/integrations', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { provider, config } = req.body;
        if (!provider || !config) return res.status(400).json({ error: 'provider and config required' });
        if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Geçersiz provider.' });

        // Sır istemciye hiç inmediği için, kullanıcı yeni bir değer girmediğinde
        // istek boş clientSecret ile gelir — o durumda kayıtlı sır korunur.
        const next = { ...config };
        if (!next.clientSecret) {
            const snap = await db.doc(INTEGRATIONS_DOC).get();
            const existing = snap.exists ? snap.data()?.[provider] : null;
            if (!existing?.clientSecret) {
                return res.status(400).json({ error: 'Client Secret gereklidir.' });
            }
            next.clientSecret = existing.clientSecret;
        }

        // Önce kalıcı yazım, sonra bellek içi cache — persist başarısızsa
        // cache eski (doğru) değerlerde kalır.
        await db.doc(INTEGRATIONS_DOC).set({ [provider]: next }, { merge: true });
        integrationConfigs[provider] = next;
        log.info(`[integrations] ${provider} config updated by ${req.user.uid}`);
        res.json({ success: true, config: maskProvider(next) });
    } catch (err) {
        log.error({ err }, '[admin/integrations POST]');
        res.status(500).json({ error: 'Entegrasyon ayarları kaydedilemedi.' });
    }
});

router.delete('/api/admin/integrations/:provider', requireAuth(['super_admin']), async (req, res) => {
    try {
        const { provider } = req.params;
        if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Geçersiz provider.' });
        await db.doc(INTEGRATIONS_DOC).set({ [provider]: admin.firestore.FieldValue.delete() }, { merge: true });
        integrationConfigs[provider] = null;
        log.info(`[integrations] ${provider} config removed by ${req.user.uid}`);
        res.json({ success: true });
    } catch (err) {
        log.error({ err }, '[admin/integrations DELETE]');
        res.status(500).json({ error: 'Entegrasyon ayarı silinemedi.' });
    }
});

// ── Gemini API anahtarı yönetimi ─────────────────────────────────────────────
// Anahtar client'a asla dönmez: GET yalnızca "ayarlı mı + son 4 hane" verir,
// POST yeni anahtarı yazar. firestore.rules api_keys dokümanını client'a
// kapattığı için tek erişim yolu budur.
router.get('/api/admin/api-keys', requireAuth(['super_admin']), async (req, res) => {
    try {
        const snap = await db.doc(API_KEYS_DOC).get();
        const key = snap.exists ? String(snap.data()?.gemini || '') : '';
        res.json({
            gemini: key
                ? { set: true, last4: key.slice(-4) }
                : { set: false, last4: null },
        });
    } catch (err) {
        log.error({ err }, '[admin/api-keys GET]');
        res.status(500).json({ error: 'Anahtar durumu okunamadı.' });
    }
});

router.post('/api/admin/api-keys', requireAuth(['super_admin']), async (req, res) => {
    try {
        const raw = req.body?.gemini;
        const key = typeof raw === 'string' ? raw.trim() : '';
        if (key.length < 20 || /\s/.test(key)) {
            return res.status(400).json({ error: 'Geçersiz anahtar formatı.' });
        }
        await db.doc(API_KEYS_DOC).set({
            gemini: key,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.uid,
        }, { merge: true });
        log.info(`[api-keys] Gemini anahtarı güncellendi (by ${req.user.uid})`);
        res.json({ success: true, last4: key.slice(-4) });
    } catch (err) {
        log.error({ err }, '[admin/api-keys POST]');
        res.status(500).json({ error: 'Anahtar kaydedilemedi.' });
    }
});

// ─── AI kullanım raporu ───────────────────────────────────────────────────────
//
// ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
// services/usage.js her AI çağrısının tokenını Firestore'a yazıyordu ama
// HİÇBİR YER OKUMUYORDU: ne bir uç, ne bir ekran. Sayaç vardı, gösterge yoktu.
// "Hangi özellik ne yakıyor" sorusunun cevabı veritabanında duruyor ve kimse
// göremiyordu — kurulum topluluğa açılırken bu kabul edilemez.
//
// ── NEDEN SUNUCUDAN ─────────────────────────────────────────────────────────
// Ölçüm koleksiyonunun firestore.rules'ta açık bir kuralı yok, yani en alttaki
// varsayılan reddediş geçerli ve istemci okuyamıyor. Bilerek: günlük tüketim
// işletme bilgisi. Admin SDK kuralların dışında çalışıyor ve uç super_admin'e
// bağlı.
router.get('/api/admin/usage', requireAuth(['super_admin']), async (req, res) => {
    // 1-90 gün. Üst sınır Firestore okuma maliyetini bağlıyor: ölçümü okumak
    // ölçtüğü şeyden pahalı olmamalı.
    const days = Math.min(Math.max(parseInt(req.query?.days, 10) || 14, 1), 90);
    try {
        const snap = await db.collection(USAGE_PATH)
            .orderBy('day', 'desc')
            .limit(days)
            .get();

        const gunler = snap.docs.map((d) => ({ day: d.id, ...summarize(d.data()) }));
        const bugun = await todayUsage(new Date());

        res.json({
            days: gunler,
            limits: budgetLimits(),
            // Bugünün sayacı FRENİN gördüğü değer — ölçüm dokümanındaki sayı
            // değil. İkisi arasında bir dakikaya kadar fark olabilir ve
            // ekranda "neden durdu" sorusunu cevaplayan sayı budur.
            today: bugun,
        });
    } catch (err) {
        log.error({ err }, '[admin/usage]');
        res.status(500).json({ error: 'Kullanım kaydı okunamadı.' });
    }
});

// ─── Saklama süresi ve imha ───────────────────────────────────────────────────
//
// ── NEDEN VARSAYILAN KAPALI ─────────────────────────────────────────────────
// Süre 6 ay olarak geliyor ama imha AÇIK GELMİYOR. Bu uç geri alınamayan bir
// işlem yapıyor; ayarı görmeden, kaç kaydın gideceğini bilmeden çalışması
// gereken bir şey değil. Ekran önce "şu an X kayıt süresini doldurmuş
// görünüyor" diyor, açma kararını insan veriyor.
//
// ── SİLMEK YALNIZCA KAYIT DEĞİL ─────────────────────────────────────────────
// CV dosyası Storage'da duruyor ve asıl hassas belge o. Kayıt silinip dosya
// kalırsa "imha edildi" demek yanlış olur.

/** Adayları okur ve saklama kararına göre ayırır. */
async function retentionDurumu() {
    const snap = await db.collection(CANDIDATES_PATH).get();
    const adaylar = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const sys = await db.doc(SYSTEM_DOC).get();
    const veri = sys.exists ? sys.data() : {};
    // Varsayılan 6 ay. Ayar hiç yazılmamışsa da ekranda bir sayı görünsün ki
    // "tanımlı değil" ile "6 ay seçilmiş" karışmasın.
    const months = Number.isFinite(Number(veri?.retentionMonths))
        ? Number(veri.retentionMonths)
        : 6;
    const enabled = veri?.retentionEnabled === true;

    const { due, reasons } = splitByRetention(adaylar, { months });
    return { adaylar, due, reasons, months, enabled, total: adaylar.length };
}

router.get('/api/admin/retention', requireAuth(['super_admin']), async (req, res) => {
    try {
        const d = await retentionDurumu();
        res.json({
            months: d.months,
            enabled: d.enabled,
            total: d.total,
            dueCount: d.due.length,
            reasons: d.reasons,
        });
    } catch (err) {
        log.error({ err }, '[admin/retention GET]');
        res.status(500).json({ error: 'Saklama ayarı okunamadı.' });
    }
});

router.post('/api/admin/retention', requireAuth(['super_admin']), async (req, res) => {
    const months = Number(req.body?.months);
    const enabled = req.body?.enabled === true;
    // 1-120 ay. Üst sınır yazım hatasına karşı: "600" yazan biri aslında
    // hiç silmemeyi kastediyor olabilir ama sınırsız bir değer ayarı
    // anlamsızlaştırır.
    if (!Number.isFinite(months) || months < 1 || months > 120) {
        return res.status(400).json({ error: 'Saklama süresi 1-120 ay arasında olmalı.' });
    }
    try {
        await db.doc(SYSTEM_DOC).set({
            retentionMonths: Math.floor(months),
            retentionEnabled: enabled,
            retentionUpdatedAt: new Date().toISOString(),
            retentionUpdatedBy: req.user.uid,
        }, { merge: true });
        log.info({ months, enabled, by: req.user.uid }, 'saklama ayarı güncellendi');
        res.json({ success: true });
    } catch (err) {
        log.error({ err }, '[admin/retention POST]');
        res.status(500).json({ error: 'Saklama ayarı kaydedilemedi.' });
    }
});

router.post('/api/admin/retention/purge', requireAuth(['super_admin']), async (req, res) => {
    try {
        const d = await retentionDurumu();
        if (!d.enabled) {
            return res.status(400).json({ error: 'İmha kapalı. Önce ayarlardan açın.' });
        }
        if (d.due.length === 0) {
            return res.json({ deleted: 0, files: 0 });
        }

        let dosya = 0;
        const bucket = admin.storage().bucket();

        for (let i = 0; i < d.due.length; i += 400) {
            const dilim = d.due.slice(i, i + 400);
            const batch = db.batch();
            for (const c of dilim) batch.delete(db.doc(`${CANDIDATES_PATH}/${c.id}`));
            await batch.commit();

            // Dosyalar kayıttan SONRA siliniyor: dosya silinip kayıt kalırsa
            // ekranda açılmayan bir CV bağlantısı kalır. Tersi durumda yetim
            // bir dosya kalır ve o bir sonraki turda temizlenebilir.
            for (const c of dilim) {
                const yol = storagePathFromUrl(c.cvUrl);
                if (!yol) continue;
                try {
                    await bucket.file(yol).delete();
                    dosya += 1;
                } catch (err) {
                    // Dosya zaten yoksa ya da silinemezse imha durmuyor.
                    log.warn({ yol, err: err.message }, 'CV dosyası silinemedi');
                }
            }
        }

        // İMHA DA DEFTERE YAZILIYOR. Silme, erişimden daha ağır bir işlem;
        // kimin ne zaman kaç kaydı imha ettiği kayıt altında olmalı.
        await db.collection(ACCESS_LOG_PATH).add({
            action: 'purge',
            uid: req.user.uid,
            email: req.user.email || '',
            count: d.due.length,
            note: `${d.months} ay · ${dosya} dosya`,
            at: new Date().toISOString(),
        });

        log.info({ silinen: d.due.length, dosya, by: req.user.uid }, 'saklama süresi imhası');
        res.json({ deleted: d.due.length, files: dosya });
    } catch (err) {
        log.error({ err }, '[admin/retention purge]');
        res.status(500).json({ error: 'İmha tamamlanamadı.' });
    }
});

export default router;
