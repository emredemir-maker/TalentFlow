// TRANSKRİPTTE KİM KONUŞTU?
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Mülakatçı değerlendirmesi transkriptteki MÜLAKATÇI satırlarına bakıyor ve
// canlıda bu satırları hiçbir zaman bulamıyordu:
//
//   services/ai/interview.js  → t.role === 'MÜLAKATÇI' | 'RECRUITER' | 'interviewer'
//   LiveInterviewPage.jsx     → role: isRecruiter ? 'YÖNETİCİ' : 'ADAY'
//
// İki liste hiç kesişmiyor. Manuel görüşmede durum daha da kötü: orada
// transkript bir DİZİ değil, kullanıcının yapıştırdığı DÜZ METİN — rapor
// sayfası modele boş dizi gönderiyordu.
//
// Sonuç: model her seferinde "mülakatçı hiç konuşmamış" görüyor, üç boyuta
// 1/5 veriyor ve "hiç konuşmadığı için önyargılı dil gözlenmedi" diye
// dördüncüsüne 5/5 veriyordu. Bu çıktı otomatik üretilip GERÇEK BİR İNSANIN
// performans kaydı olarak Firestore'a yazılıyordu.
//
// ── ÖLÇEMEZSEK ÖLÇMÜŞ GİBİ YAPMIYORUZ ───────────────────────────────────────
// Konuşmacıyı ayırt edemediğimiz bir transkriptte değerlendirme
// ÇALIŞTIRILMAZ. Boş girdiden üretilen bir puan, puan değil; sessizliğin
// yanlış okunmasıdır.

/** Canlı ve manuel akışların mülakatçı için kullandığı rol etiketleri. */
const RECRUITER_ROLES = new Set([
    'yönetici', 'yonetici',
    'mülakatçı', 'mulakatci',
    'recruiter', 'interviewer',
    'ik', 'hr',
]);

/** Aday tarafı — bu etiketler mülakatçı sayılmaz. */
const CANDIDATE_ROLES = new Set(['aday', 'candidate', 'user']);

/** `[12:31:43] Ad Soyad: metin` ya da `Ad Soyad: metin` */
const LINE_RE = /^(?:\[\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\]\s*)?([^:\n]{1,60}?)\s*:\s*([\s\S]*)$/;

const trim = (v) => String(v ?? '').trim();

/**
 * Düz metin transkripti konuşmacı satırlarına ayırır.
 *
 * Satır sonu yoksa `[ss:dd:ss]` damgalarından bölünür — yapıştırılan
 * transkriptlerin bir kısmı tek satır hâlinde geliyor.
 *
 * @param {string} raw
 * @returns {Array<{speaker: string, text: string}>}
 */
export function parseTranscriptText(raw) {
    const metin = trim(raw);
    if (!metin) return [];

    let parcalar = metin.split(/\r?\n+/).map(trim).filter(Boolean);
    if (parcalar.length <= 1) {
        // Tek satır: zaman damgalarını satır başı say.
        parcalar = metin
            .split(/(?=\[\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\])/)
            .map(trim)
            .filter(Boolean);
    }

    const out = [];
    for (const p of parcalar) {
        const m = LINE_RE.exec(p);
        if (!m) {
            // Konuşmacısı olmayan satır ÖNCEKİNE eklenir; atmak cümleyi
            // yarıda keserdi.
            if (out.length > 0) out[out.length - 1].text += ` ${p}`;
            continue;
        }
        const speaker = trim(m[1]);
        const text = trim(m[2]);
        if (!speaker || !text) continue;
        out.push({ speaker, text });
    }
    return out;
}

/** Türkçe duyarsız karşılaştırma için sadeleştirir. */
function fold(s) {
    return trim(s)
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/Ş/g, 's').replace(/ş/g, 's')
        .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/ü/g, 'u')
        .replace(/Ö/g, 'o').replace(/ö/g, 'o')
        .replace(/Ç/g, 'c').replace(/ç/g, 'c')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** İki ad aynı kişiyi gösteriyor olabilir mi? İlk ad eşleşmesi yeterli. */
function sameSpeaker(a, b) {
    const ta = fold(a).split(' ').filter(Boolean);
    const tb = fold(b).split(' ').filter(Boolean);
    if (ta.length === 0 || tb.length === 0) return false;
    if (fold(a) === fold(b)) return true;
    // "Kerem" ile "Kerem Can Demirtaş" aynı kişi — transkriptte çoğu zaman
    // yalnızca ilk ad yazıyor.
    return ta[0] === tb[0];
}

/**
 * Mülakatçının söyledikleri.
 *
 * @param {Array|string} transcript — canlı akışın dizisi ya da manuel düz metin
 * @param {string} candidateName — adayı ayırt etmek için; düz metinde rol yok
 * @returns {{lines: string[], reason: string|null}}
 *   `reason` doluysa ölçüm YAPILAMAZ ve sebebi ekranda gösterilir.
 */
export function recruiterLinesOf(transcript, candidateName = '') {
    // ── Canlı akış: rol etiketli dizi ───────────────────────────────────────
    if (Array.isArray(transcript) && transcript.length > 0) {
        const lines = transcript
            .filter((t) => RECRUITER_ROLES.has(fold(t?.role).replace(/\s+/g, '')))
            .map((t) => trim(t?.text || t?.content))
            .filter(Boolean);
        if (lines.length > 0) return { lines, reason: null };

        // Rol etiketi tanınmadıysa: adayın satırlarını çıkarıp kalanı al.
        const bilinenAday = transcript.filter((t) => CANDIDATE_ROLES.has(fold(t?.role).replace(/\s+/g, '')));
        if (bilinenAday.length > 0) {
            const kalan = transcript
                .filter((t) => !CANDIDATE_ROLES.has(fold(t?.role).replace(/\s+/g, '')))
                .map((t) => trim(t?.text || t?.content))
                .filter(Boolean);
            if (kalan.length > 0) return { lines: kalan, reason: null };
        }
        return { lines: [], reason: 'Transkriptte mülakatçıya ait satır ayırt edilemedi.' };
    }

    // ── Manuel giriş: düz metin ─────────────────────────────────────────────
    if (typeof transcript === 'string' && transcript.trim()) {
        const satirlar = parseTranscriptText(transcript);
        if (satirlar.length === 0) {
            return { lines: [], reason: 'Transkript konuşmacı satırlarına ayrılamadı.' };
        }
        const aday = trim(candidateName);
        if (!aday) {
            // ADAY BİLİNMEDEN AYRIM YAPILMAZ. Yanlış tarafı mülakatçı sayıp
            // adayın cümleleri üzerinden mülakatçıya not vermek, hiç
            // ölçmemekten kötüdür.
            return { lines: [], reason: 'Aday adı bilinmediği için konuşmacılar ayrılamadı.' };
        }
        const adayinkiler = satirlar.filter((l) => sameSpeaker(l.speaker, aday));
        if (adayinkiler.length === 0) {
            return { lines: [], reason: 'Transkriptte adayın satırları bulunamadı; konuşmacılar ayrılamadı.' };
        }
        const digerleri = satirlar.filter((l) => !sameSpeaker(l.speaker, aday)).map((l) => l.text);
        if (digerleri.length === 0) {
            return { lines: [], reason: 'Transkriptte adaydan başka konuşan yok.' };
        }
        return { lines: digerleri, reason: null };
    }

    return { lines: [], reason: 'Bu görüşmede transkript kaydı yok.' };
}
