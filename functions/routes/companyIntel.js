// Şirket bilgisi uçları (K6) — ortak platform önbelleği + şirkete özel elle
// doğrulama. Gerekçe: services/companyIntel.js.
//
//   POST   /api/company-intel/resolve  {name, force?, cacheOnly?} — önce bu şirketin elle
//          girdiği kayıt, sonra ortak önbellek, yoksa sunucuda kaynaklı arama.
//   PUT    /api/company-intel/manual   {name, record} — elle doğrulama (yalnız
//          bu şirkette görünür).
//   DELETE /api/company-intel/manual   {name}
//
// İstemci önbelleği doğrudan okumaz/yazmaz (firestore.rules platform/** kapalı).
import { Router } from 'express';

import { aiLimiter } from '../middleware/rateLimit.js';
import { requireTenant, WRITER_ROLES } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';
import { generateGrounded } from '../services/gemini.js';
import { sanitizeForPrompt } from '../services/promptGuard.js';
import { PLATFORM_PATHS } from '../services/tenantPaths.js';
import {
    buildCompanyQuery,
    cacheRecordFrom,
    companyKey,
    docIdFor,
    isFresh,
} from '../services/companyIntel.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('companyIntel');

const router = Router();

const MAX_MANUAL_BYTES = 20 * 1024;

// Normalleştirilmiş adın üst sınırları: şirket adı kısa; uzun "ad"lar istem
// enjeksiyonu taşımaya elverişli ve gerçek bir şirketi temsil etmiyor.
const MAX_KEY_CHARS = 80;
const MAX_KEY_WORDS = 8;

/** Addan önbellek kimliği; ad uygun değilse null. */
export function idFromName(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 300) return null;
    const key = companyKey(name);
    if (!key || key.length > MAX_KEY_CHARS || key.split(' ').length > MAX_KEY_WORDS) return null;
    const id = docIdFor(key);
    return id ? { key, id } : null;
}

router.post('/api/company-intel/resolve', aiLimiter, requireTenant(WRITER_ROLES), async (req, res) => {
    const ref = idFromName(req.body?.name);
    if (!ref) return res.status(400).json({ error: 'Şirket adı gerekli.' });
    const force = req.body?.force === true;
    try {
        // 1) Bu şirketin elle doğruladığı kayıt — `force` ile de ezilmez.
        const manual = await db.doc(req.paths.companyIntelManual(ref.id)).get();
        if (manual.exists) {
            return res.json({ key: ref.key, source: 'manual', record: manual.data() });
        }

        // 2) Ortak önbellek.
        const cacheRef = db.doc(PLATFORM_PATHS.companyIntel(ref.id));
        const cached = await cacheRef.get();
        // `force` taze ve kaynaklı ortak kaydı EZMEZ: bir şirketin tek isteği
        // tüm şirketlerin gördüğü kaydı değiştiremesin. Yeniden arama yalnız
        // bayat ya da kaynaksız (withheld) kayıtta.
        const forceAllowed = force && (!cached.exists || cached.data()?.withheld === true);
        if (cached.exists && !forceAllowed && isFresh(cached.data())) {
            const c = cached.data();
            return res.json({ key: ref.key, source: 'cache', answer: c.answer, resolvedAt: c.resolvedAt });
        }
        // Yalnız önbellek sorulduysa canlı aramaya düşülmez (istemci canlı
        // arama tavanını kendisi sayıyor).
        if (req.body?.cacheOnly === true) return res.json({ key: ref.key, source: 'miss' });

        // 3) Canlı, kaynaklı arama — sorgu sunucuda ve ANAHTARDAN kurulur: aynı
        // anahtarın istemi her zaman aynı, ham addaki (anahtara girmeyen, ör.
        // başka alfabeden) ek metin modele ulaşıp ortak kaydı zehirleyemez.
        const answer = await generateGrounded(buildCompanyQuery(ref.key, sanitizeForPrompt), {
            maxOutputTokens: 4096,
        });
        const record = { key: ref.key, ...cacheRecordFrom(ref.key, answer) };
        // Kim sorguladı yazılmaz (yan kanal yok).
        await cacheRef.set(record);
        res.json({ key: ref.key, source: 'live', answer: record.answer, resolvedAt: record.resolvedAt });
    } catch (err) {
        log.warn({ err: err?.message }, '[company-intel/resolve]');
        res.status(500).json({ error: 'Şirket bilgisi alınamadı.' });
    }
});

router.put('/api/company-intel/manual', requireTenant(WRITER_ROLES), async (req, res) => {
    const ref = idFromName(req.body?.name);
    const record = req.body?.record;
    if (!ref) return res.status(400).json({ error: 'Şirket adı kayıt için uygun değil.' });
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return res.status(400).json({ error: 'Geçersiz kayıt.' });
    }
    if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_MANUAL_BYTES) {
        return res.status(400).json({ error: 'Kayıt çok büyük.' });
    }
    try {
        // merge YOK: elle doğrulama kaydın tamamını değiştirir
        // (src/services/companyIntelStore.js#saveManualCompanyIntel ile aynı).
        await db.doc(req.paths.companyIntelManual(ref.id)).set({
            ...record,
            key: ref.key,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.uid,
        });
        res.json({ success: true, key: ref.key });
    } catch (err) {
        log.warn({ err: err?.message }, '[company-intel/manual PUT]');
        res.status(500).json({ error: 'Kayıt kaydedilemedi.' });
    }
});

router.delete('/api/company-intel/manual', requireTenant(WRITER_ROLES), async (req, res) => {
    const ref = idFromName(req.body?.name);
    if (!ref) return res.status(400).json({ error: 'Şirket adı kayıt için uygun değil.' });
    try {
        await db.doc(req.paths.companyIntelManual(ref.id)).delete();
        res.json({ success: true });
    } catch (err) {
        log.warn({ err: err?.message }, '[company-intel/manual DELETE]');
        res.status(500).json({ error: 'Kayıt silinemedi.' });
    }
});

export default router;
