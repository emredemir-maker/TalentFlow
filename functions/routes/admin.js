// Yönetim uçları — iki ayrı yetki:
//
//   ŞİRKET YÖNETİCİSİ (requireTenant(['admin'])) — yalnız kendi şirketi:
//     DELETE /api/admin/members/:uid       — üyeliği kaldırır (Firebase hesabı
//                                            SİLİNMEZ: Hub/CX ile ortak).
//     DELETE /api/admin/auth-user/:uid     — eski istemci adı; aynı iş.
//     GET    /api/admin/usage              — şirketin AI kullanımı.
//     GET/POST /api/admin/retention, POST /api/admin/retention/purge
//                                          — saklama süresi ve imha.
//
//   PLATFORM YÖNETİCİSİ (requirePlatformAdmin, PLATFORM_ADMIN_EMAILS) — şirket
//   verisi GÖRMEZ, yalnız platform ayarları:
//     GET/POST/DELETE /api/admin/integrations — OAuth uygulaması (Google, M365).
//                                          clientSecret istemciye dönmez.
//     GET/POST /api/admin/api-keys         — platformun Gemini anahtarı.
//     GET    /api/platform/usage           — tüm şirketlerin AI toplamı.
import { Router } from 'express';

import { requireTenant, requirePlatformAdmin } from '../middleware/auth.js';
import { PLATFORM_PATHS, storagePaths } from '../services/tenantPaths.js';
import { admin, db } from '../config/firebaseAdmin.js';
import { integrationConfigs } from '../config/integrations.js';
import { summarize } from '../services/usage.js';
import { budgetLimits, todayUsage } from '../services/aiBudget.js';
import { splitByRetention, storagePathFromUrl } from '../services/retention.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('admin');

const router = Router();

const INTEGRATIONS_DOC = PLATFORM_PATHS.integrations;
const API_KEYS_DOC = PLATFORM_PATHS.apiKeys;
const requireTenantAdmin = requireTenant(['admin']);

// ── Üyelik kaldırma ──────────────────────────────────────────────────────────
// Firebase Auth hesabı burada SİLİNMEZ: giriş Clyro Hub, CX ve Talent'ta ortak;
// hesabı silmek kişinin diğer uygulamalardaki hesabını da siler. Şirket
// yöneticisi yalnız KENDİ şirketindeki üyeliği kaldırır (status: removed) ve
// kişinin şirket listesinden (userTenants) bu şirketi siler.
//
// Son yönetici kilidi: şirketin son etkin yöneticisi kaldırılamaz — şirket
// yönetilemez kalırdı. Sayım ve yazım tek işlemde (transaction): iki yönetici
// aynı anda birbirini kaldıramasın.
export async function removeMembership({ db: fdb, paths, tenantId, uid, by, now = new Date() }) {
    const memberRef = fdb.doc(paths.member(uid));
    return fdb.runTransaction(async (tx) => {
        const snap = await tx.get(memberRef);
        if (!snap.exists || snap.data()?.status === 'removed') return { status: 404 };
        const target = snap.data();
        if (target.role === 'admin' && target.status === 'active') {
            const admins = await tx.get(
                fdb.collection(paths.members()).where('role', '==', 'admin').where('status', '==', 'active')
            );
            if (admins.size <= 1) return { status: 409 };
        }
        tx.update(memberRef, { status: 'removed', removedAt: now.toISOString(), removedBy: by });
        tx.set(
            fdb.doc(PLATFORM_PATHS.userTenants(uid)),
            { tenants: { [tenantId]: admin.firestore.FieldValue.delete() } },
            { merge: true }
        );
        return { status: 200 };
    });
}

async function removeMemberHandler(req, res) {
    try {
        const r = await removeMembership({
            db,
            paths: req.paths,
            tenantId: req.tenant.id,
            uid: req.params.uid,
            by: req.user.uid,
        });
        if (r.status === 404) return res.status(404).json({ error: 'Üye bulunamadı.' });
        if (r.status === 409) return res.status(409).json({ error: 'Şirketin son yöneticisi kaldırılamaz.' });
        await db.collection(req.paths.accessLogs()).add({
            action: 'member_removed',
            uid: req.user.uid,
            email: req.user.email || '',
            target: req.params.uid,
            at: new Date().toISOString(),
        });
        res.json({ success: true, note: 'Ortak Clyro hesabı silinmez; yalnız bu şirketteki üyelik kaldırıldı.' });
    } catch (err) {
        if (err?.name === 'TenantPathError') return res.status(400).json({ error: err.message });
        log.error({ err: err.message }, '[admin/members DELETE]');
        res.status(500).json({ error: 'Üyelik kaldırılamadı.' });
    }
}

router.delete('/api/admin/members/:uid', requireTenantAdmin, removeMemberHandler);
router.delete('/api/admin/auth-user/:uid', requireTenantAdmin, removeMemberHandler);

// Admin SDK ile okunur/yazılır: firestore.rules platform/** belgelerini
// istemciye tamamen kapatır. Platform ayarı — yalnız platform yöneticisi.
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

router.get('/api/admin/integrations', requirePlatformAdmin, async (req, res) => {
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

router.post('/api/admin/integrations', requirePlatformAdmin, async (req, res) => {
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

router.delete('/api/admin/integrations/:provider', requirePlatformAdmin, async (req, res) => {
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
// POST yeni anahtarı yazar. Platformun anahtarı (tüm şirketler kullanır) —
// yalnız platform yöneticisi; şirket yöneticisi göremez/değiştiremez.
router.get('/api/admin/api-keys', requirePlatformAdmin, async (req, res) => {
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

router.post('/api/admin/api-keys', requirePlatformAdmin, async (req, res) => {
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
// işletme bilgisi. Admin SDK kuralların dışında çalışıyor ve uç şirket yöneticisine
// bağlı.
// Şirket yöneticisi yalnız KENDİ şirketinin kullanımını görür
// (tenants/{t}/usage). Platform toplamı başka şirketlerin hacmini ele verir;
// o yalnız platform yöneticisine (/api/platform/usage). Şirket başına ölçümün
// yazımı PR 7'de; o zamana kadar liste boş gelebilir.
function usageDays(req) {
    // 1-90 gün. Üst sınır Firestore okuma maliyetini bağlıyor: ölçümü okumak
    // ölçtüğü şeyden pahalı olmamalı.
    return Math.min(Math.max(parseInt(req.query?.days, 10) || 14, 1), 90);
}

router.get('/api/admin/usage', requireTenantAdmin, async (req, res) => {
    try {
        const snap = await db.collection(req.paths.usage())
            .orderBy('day', 'desc')
            .limit(usageDays(req))
            .get();
        const gunler = snap.docs.map((d) => ({ day: d.id, ...summarize(d.data()) }));
        const bugunKey = new Date().toISOString().slice(0, 10);
        const bugunDoc = snap.docs.find((d) => d.id === bugunKey)?.data() || {};
        res.json({
            days: gunler,
            limits: budgetLimits(),
            today: {
                tokens: Number(bugunDoc?.totals?.totalTokens) || 0,
                groundedCalls: Number(bugunDoc?.byLabel?.grounded?.calls) || 0,
            },
        });
    } catch (err) {
        log.error({ err }, '[admin/usage]');
        res.status(500).json({ error: 'Kullanım kaydı okunamadı.' });
    }
});

router.get('/api/platform/usage', requirePlatformAdmin, async (req, res) => {
    try {
        const snap = await db.collection(PLATFORM_PATHS.usage)
            .orderBy('day', 'desc')
            .limit(usageDays(req))
            .get();
        const gunler = snap.docs.map((d) => ({ day: d.id, ...summarize(d.data()) }));
        const bugun = await todayUsage(new Date());
        res.json({
            days: gunler,
            limits: budgetLimits(),
            // Bugünün sayacı FRENİN gördüğü değer — ölçüm dokümanındaki sayı
            // değil. İkisi arasında bir dakikaya kadar fark olabilir.
            today: bugun,
        });
    } catch (err) {
        log.error({ err }, '[platform/usage]');
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

/** Şirketin adaylarını okur ve saklama kararına göre ayırır. */
async function retentionDurumu(paths) {
    const snap = await db.collection(paths.candidates()).get();
    const adaylar = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const sys = await db.doc(paths.settings('system')).get();
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

router.get('/api/admin/retention', requireTenantAdmin, async (req, res) => {
    try {
        const d = await retentionDurumu(req.paths);
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

router.post('/api/admin/retention', requireTenantAdmin, async (req, res) => {
    const months = Number(req.body?.months);
    const enabled = req.body?.enabled === true;
    // 1-120 ay. Üst sınır yazım hatasına karşı: "600" yazan biri aslında
    // hiç silmemeyi kastediyor olabilir ama sınırsız bir değer ayarı
    // anlamsızlaştırır.
    if (!Number.isFinite(months) || months < 1 || months > 120) {
        return res.status(400).json({ error: 'Saklama süresi 1-120 ay arasında olmalı.' });
    }
    try {
        await db.doc(req.paths.settings('system')).set({
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

router.post('/api/admin/retention/purge', requireTenantAdmin, async (req, res) => {
    try {
        const d = await retentionDurumu(req.paths);
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
            for (const c of dilim) batch.delete(db.doc(req.paths.candidate(c.id)));
            await batch.commit();

            // Dosyalar kayıttan SONRA siliniyor: dosya silinip kayıt kalırsa
            // ekranda açılmayan bir CV bağlantısı kalır. Tersi durumda yetim
            // bir dosya kalır ve o bir sonraki turda temizlenebilir.
            for (const c of dilim) {
                const yol = storagePathFromUrl(c.cvUrl);
                if (!yol) continue;
                // YALNIZ BU ŞİRKETİN DOSYASI. cvUrl aday kaydında duruyor ve
                // şirketin kendi kullanıcıları yazabiliyor: başka şirketin
                // dosyasını gösteren bir adres imhada o dosyayı sildirirdi.
                if (!yol.startsWith(storagePaths.tenantPrefix(req.tenant.id))) {
                    log.warn({ yol }, 'şirket dışı CV yolu imhada atlandı');
                    continue;
                }
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
        await db.collection(req.paths.accessLogs()).add({
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
