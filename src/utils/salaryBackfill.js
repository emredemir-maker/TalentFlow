// GERİYE DÖNÜK MAAŞ TARAMASI — kim taranacak, ne kaydedilecek.
//
// Maaş zincirinin ilk üç halkası (ilan bandı, aday beklentisi, fark raporu)
// bugünden İTİBAREN çalışıyor. Geçmiş görüşmelerde rakam çoğu zaman
// transkriptin içinde duruyor ama `candidateSalary` alanı o kayıtlar
// yazılırken YOKTU. Sonuç: fark raporu bugün açıldığında havuzun neredeyse
// tamamı "beklentisi bilinmiyor" kefesinde görünüyor — elde veri var ama
// hiçbir tabloya girmiyor.
//
// Bu dosya taramanın KARAR VEREN kısmı: hangi görüşme listeye girer, bir
// taslak kaydedilebilir mi, toplu brüt/net işareti neye dokunur. Model çağrısı
// (services/salaryScan.js) ve Firestore yazımı (services/salaryBackfillStore.js)
// ayrı duruyor; buradaki kuralların testi ne ağ ne veritabanı istemeli.
//
// Değişmeyen kural aynen geçerli: MODEL ÖNERİR, KULLANICI KAYDEDER. Buradaki
// hiçbir fonksiyon tek başına bir rakamı kayda çevirmez.

import { normalizeBand, BASES, CURRENCIES, PERIODS } from './salaryBand';

/**
 * Tek ekranda gösterilecek en fazla görüşme.
 *
 * Sınır ekranı değil MALİYETİ ve dikkati koruyor: her satır bir AI çağrısı ve
 * bir onay kararı demek. Kesilen kısım kaybolmuyor — kaydedilen satırlar
 * listeden düştüğü için bir sonraki açılışta sıradakiler geliyor.
 */
export const MAX_ROWS = 60;

/**
 * Modelin bakabileceği en kısa transkript.
 *
 * Altında kalanlar "taranamaz" işaretlenir ve AI çağrısı hiç yapılmaz:
 * extractSalaryFromTranscript zaten null döner, çağrı yalnızca sıra ve para
 * harcar. Kullanıcı o satırı elle doldurabilir.
 */
export const MIN_TRANSCRIPT = 40;

/**
 * Transkripti düz metne indirir.
 *
 * İki ayrı biçim var ve ikisi de canlıda mevcut: canlı/yüz yüze görüşmede
 * `[{role, text}]` dizisi, manuel girişte tek parça metin. Yalnızca birini
 * tanıyan bir tarama, havuzun yarısını sessizce "transkripti yok" sayardı.
 */
export function transcriptText(session) {
    const raw = session?.transcript;
    if (typeof raw === 'string') return raw.trim();
    if (!Array.isArray(raw)) return '';
    return raw
        .map((entry) => {
            if (typeof entry === 'string') return entry.trim();
            const text = String(entry?.text || '').trim();
            if (!text) return '';
            const role = String(entry?.role || '').trim();
            return role ? `${role}: ${text}` : text;
        })
        .filter(Boolean)
        .join('\n')
        .trim();
}

/** Bu görüşmede beklenti zaten kayıtlı mı? */
export function hasSalary(session) {
    return normalizeBand(session?.candidateSalary) !== null;
}

/** Görüşmenin zamanı — sıralama için. Tarihsizler en sona. */
export function sessionTime(source) {
    const raw = source?.date || source?.createdAt || source?.startedAt;
    const ms = raw ? Date.parse(typeof raw === 'string' ? raw : String(raw)) : NaN;
    return Number.isFinite(ms) ? ms : -Infinity;
}

/**
 * Yüklenmiş görüşmelerden ekran satırlarını kurar.
 *
 * BEKLENTİSİ KAYITLI OLAN GÖRÜŞME LİSTEYE GİRMEZ. Girseydi tarama, insanın
 * duyup yazdığı rakamın üstüne modelin okuduğu rakamı öneriyor olurdu —
 * odada duyulmuş bir sayının üstüne çıkarım koymak.
 *
 * @param {Array<{sessionId: string, candidateId?: string, candidateName?: string, session: object}>} entries
 *   — en yeni önce sıralanmış gelmeli (services/salaryBackfillStore.js)
 */
export function buildBackfillRows(entries = []) {
    const rows = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
        const session = entry?.session;
        const sessionId = entry?.sessionId || session?.sessionId;
        if (!session || !sessionId) continue;
        if (hasSalary(session)) continue;

        const transcript = transcriptText(session);
        rows.push({
            sessionId: String(sessionId),
            candidateId: entry.candidateId || session.candidateId || null,
            candidateName: entry.candidateName || session.candidateName || 'İsimsiz aday',
            positionTitle: session.positionTitle || null,
            date: session.date || entry.date || null,
            transcript,
            // Taranabilir değilse AI çağrısı yapılmaz; satır yine de listede
            // durur çünkü kullanıcı elle yazabilir.
            scannable: transcript.length >= MIN_TRANSCRIPT,
        });
    }
    return rows;
}

/** Boş taslak — alanların birimleri makul varsayılanla gelir, baz BOŞ gelir. */
export const emptyDraft = () => ({ min: '', max: '', currency: 'TRY', period: 'monthly', basis: '' });

/**
 * Model önerisini taslağa çevirir — bu, KULLANICI "kabul et" dediğinde olur.
 *
 * Baz burada da varsayılmaz: aday "net" demediyse boş kalır ve satırda
 * "karşılaştırmaya girmez" uyarısı görünür (bkz. utils/salaryBand.js).
 */
export function draftFromHint(hint) {
    if (!hint) return emptyDraft();
    const min = hint.min ?? hint.max ?? null;
    const max = hint.max ?? hint.min ?? null;
    return {
        min: min === null ? '' : String(min),
        max: max === null ? '' : String(max),
        currency: CURRENCIES.includes(hint.currency) ? hint.currency : 'TRY',
        period: PERIODS.includes(hint.period) ? hint.period : 'monthly',
        basis: BASES.includes(hint.basis) ? hint.basis : '',
    };
}

/** Taslak → kaydedilebilir band; geçersizse null. */
export function draftToBand(draft) {
    return normalizeBand(draft);
}

/**
 * TOPLU BRÜT/NET İŞARETLEME.
 *
 * Bir işe alımcının havuzu genelde tutarlıdır ("hepsi net konuşur"), ve baz
 * belirtilmemiş bir rakam karşılaştırmaya HİÇ girmiyor. Tek tek 60 satırda
 * açılır menü tıklatmak bu yüzden yalnızca yorucu değil, tabloyu boş
 * bırakmanın da en olası yolu.
 *
 * ANCAK KANIT VARSAYIMI EZMEZ: bir satırda baz doluysa o damga adayın kendi
 * sözünden geldi ("net 95 bin isterim"). Havuz geneline dair bir kabulün
 * üstüne yazması, ölçülmüş bir şeyi varsayımla değiştirmek olurdu. Kullanıcı
 * o satırı yine tek tek değiştirebilir.
 */
export function applyBulkBasis(drafts, basis) {
    if (!BASES.includes(basis)) return drafts;
    const entries = Object.entries(drafts || {});
    let changed = false;
    const next = {};
    for (const [id, draft] of entries) {
        if (draft?.basis) { next[id] = draft; continue; }
        next[id] = { ...draft, basis };
        changed = true;
    }
    return changed ? next : drafts;
}

/**
 * Rakamın KAYNAĞI — alıntı mı, elle mi.
 *
 * Kayda geçer: "bu sayı nereden geldi" sorusunun cevabı altı ay sonra da
 * durmalı. Baz karşılaştırmaya girmez çünkü toplu işaretleme onu sonradan
 * doldurmuş olabilir — RAKAM yine de transkriptten gelmiştir.
 */
export function sourceOf(draft, hint) {
    const band = normalizeBand(draft);
    const suggested = normalizeBand(hint);
    if (band && suggested
        && band.min === suggested.min
        && band.max === suggested.max
        && band.currency === suggested.currency
        && band.period === suggested.period) {
        return { source: 'transcript', quote: hint?.quote || null };
    }
    return { source: 'manual', quote: null };
}

/**
 * Kaydedilecek satırlar — band + kaynak.
 *
 * @param {Array} rows
 * @param {Record<string, object>} drafts
 * @param {Record<string, object|null>} hints
 */
export function savableRows(rows = [], drafts = {}, hints = {}) {
    const out = [];
    for (const row of rows) {
        const band = normalizeBand(drafts[row.sessionId]);
        if (!band) continue;
        out.push({ row, band, ...sourceOf(drafts[row.sessionId], hints[row.sessionId]) });
    }
    return out;
}

/**
 * Ekranın altındaki sayaç.
 *
 * `withoutBasis` ayrı sayılır ve ayrı gösterilir: baz olmadan kaydedilen bir
 * rakam kayıtta durur ama fark raporuna GİRMEZ. Kullanıcı kaydettiği şeyin
 * hangi tabloya gireceğini kaydetmeden önce bilmeli.
 */
export function backfillTally(rows = [], drafts = {}) {
    let filled = 0;
    let withoutBasis = 0;
    for (const row of rows) {
        const band = normalizeBand(drafts[row.sessionId]);
        if (!band) continue;
        filled += 1;
        if (!band.basis) withoutBasis += 1;
    }
    return { total: rows.length, filled, withoutBasis, empty: rows.length - filled };
}
