// SKORU BELİRLEYEN çağrı — küçük ve odaklı.
//
// Canlıda ölçüldü: aynı aday, aynı ilan, sıcaklık 0 — iki tarama arasında
// skor 80'den 65'e düştü. İki maddenin damgası değişmişti. En çarpıcısı CX
// maddesi: bir taramada "Employee Engagement ile yakından ilgili → kısmen",
// diğerinde "kanıt bulunmamaktadır → yok".
//
// Sebep tek bir çağrıda 16 bin token'lık belge üretmemizdi: 10 madde için
// durum + tür + not + dayanak + fark, 4 STAR boyutu, özet, gerekçeler. Bu
// uzunlukta sıcaklık 0 bile sınırdaki yargıları sabitlemiyor.
//
// Ayrım şu: SKORU ETKİLEYEN her şey burada ve çıktı minik. Anlatım (dayanak,
// fark, özet, STAR gerekçeleri) ayrı çağrıda ve skoru etkilemiyor. Anlatım
// çağrısı patlasa bile skor ayakta kalır.

import { getModel } from './config.js';
// sanitizeForPrompt burada YOK: aday verisi çağırana ait ve oraya girmeden
// önce zaten temizleniyor (extraction.js). İkinci kez uygulamak metni bozar.
import { parseAIJson, buildStructuredPrompt } from './utils.js';

const SCORER_PROMPT = `
Sana bir iş ilanının NUMARALI gereksinim listesi ve bir adayın CV verisi
veriliyor. Her madde için TEK BİR DAMGA ver. Başka hiçbir şey yazma.

Bu çıktı adayın skorunu belirliyor; kısa ve kararlı olmalı.

DAMGALAR — sınırları net:

- "met": Aday bu işi DOĞRUDAN yapmış ve CV'de açık kanıt var.

- "partial": İkisinden biri:
    (a) Aynı işi ANALOG bir alanda yapmış. Ele aldığı kitle ya da bağlam
        farklı ama yapılan iş özünde aynı.
        ÖRNEK: 'Employee Engagement / HR-Tech ürünü geliştirmiş' bir aday,
        'CX ürünü geliştirmiş olmak' maddesinde PARTIAL alır — kullanıcı
        deneyimi tasarlıyor, hedef kitle müşteri değil çalışan.
    (b) Aynı alanda ama daha dar kapsam, daha kısa süre ya da sahiplik
        yerine katkı düzeyinde.

- "missing": CV'de bu işle kurulabilecek HİÇBİR bağ yok. Analog alan da yok.

KARARLILIK KURALI: Sınırda kaldığında (a) şıkkını uygula, yani "partial" ver.
Aynı CV her taramada aynı damgayı almalı; kararsız bir damga hiçbir damga
vermemekten kötüdür. Farkı bu çağrıda AÇIKLAMA — anlatım ayrı bir adımda.

"kind" — maddenin türü:
- "arac": belirli bir ürün, teknoloji, sertifika ya da dil (GA4, SQL, CRM,
  İngilizce)
- "deneyim": yapılan iş, sahiplenilen alan, üretilen sonuç
Emin olamazsan "deneyim" yaz.

STAR — CV'de NE KADAR KANIT var (adayın niteliği DEĞİL). Her boyuta 0-3:
  0 = bu boyuta dair hiçbir bilgi yok
  1 = anılmış — rol/görev adı geçiyor, içerik yok
  2 = anlatılmış — ne yapıldığı somut yazılmış
  3 = ölçülmüş — büyüklük belirtilmiş (kesin rakam ŞART DEĞİL: aralık,
      göreli değişim, ekip/kullanıcı/pazar mertebesi de sayılır)
Gizlilik yükümlülüğü olan adaylar kesin rakam yerine bu biçimleri kullanır;
yalnızca rakam aramak en nitelikli adayları cezalandırır.

Listedeki HER madde için tam olarak bir kayıt üret.

ÇIKTI (yalnızca JSON, açıklama yok):
{
  "assessments": [{ "index": 1, "status": "met|partial|missing", "kind": "deneyim|arac" }],
  "star": { "Situation": 0, "Task": 0, "Action": 0, "Result": 0 }
}
`;

const STAR_KEYS = ['Situation', 'Task', 'Action', 'Result'];

/** 0-3 aralığına sıkıştır; model bazen ölçek dışına çıkıyor. */
function clampStar(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(3, Math.round(n)));
}

const STATUSES = new Set(['met', 'partial', 'missing']);

/**
 * Madde durumları ve STAR puanları — skoru belirleyen tek çağrı.
 *
 * @param {string} jobDescription — numaralı gereksinim listesi dahil
 * @param {object} candidateData — CV alanları (zaten sanitize edilmiş)
 * @param {string} modelId
 * @returns {Promise<{assessments: Array, star: object}>}
 */
export async function scoreCoverage(jobDescription, candidateData, modelId = 'gemini-2.5-flash') {
    const prompt = buildStructuredPrompt(SCORER_PROMPT, {
        JOB_DESCRIPTION: jobDescription,
        CANDIDATE_DATA: JSON.stringify(candidateData, null, 2),
    });

    const model = await getModel(modelId);
    // Çıktı küçük: 10 madde için üç alan + dört sayı. 2048 fazlasıyla yeter
    // ve dar tavan modeli kısa tutmaya da yardım ediyor.
    const result = await model.generateContent(prompt, { maxOutputTokens: 2048 });
    const parsed = parseAIJson(result.response.text(), { assessments: [], star: {} });

    const assessments = (Array.isArray(parsed?.assessments) ? parsed.assessments : [])
        .map((a) => ({
            index: Number(a?.index),
            status: STATUSES.has(String(a?.status).toLowerCase()) ? String(a.status).toLowerCase() : 'missing',
            kind: String(a?.kind || '').toLowerCase().startsWith('ara') ? 'arac' : 'deneyim',
        }))
        .filter((a) => Number.isInteger(a.index) && a.index > 0);

    const star = {};
    for (const key of STAR_KEYS) star[key] = { score: clampStar(parsed?.star?.[key]) };

    return { assessments, star };
}

/** Anlatım çağrısından gelen metinleri damgalarla birleştirir. */
export function mergeNarrative({ assessments, star }, narrative) {
    const notesByIndex = new Map(
        (Array.isArray(narrative?.notes) ? narrative.notes : [])
            .filter((n) => Number.isFinite(Number(n?.index)))
            .map((n) => [Number(n.index), n])
    );

    const merged = assessments.map((a) => {
        const n = notesByIndex.get(a.index) || {};
        return {
            ...a,
            note: String(n.note || '').trim(),
            evidence: String(n.evidence || '').trim(),
            gap: String(n.gap || '').trim(),
        };
    });

    // STAR puanı SKOR çağrısından gelir; anlatım yalnızca metin ekler.
    // Tersi olsaydı anlatımın kararsızlığı skora sızardı.
    const starAnalysis = {};
    for (const key of STAR_KEYS) {
        const text = narrative?.star?.[key] || {};
        starAnalysis[key] = {
            score: star[key]?.score ?? 0,
            evidence: String(text.evidence || '').trim(),
            missing: String(text.missing || '').trim(),
            conflict: String(text.conflict || '').trim(),
            confidentiality: Boolean(text.confidentiality),
        };
    }

    return { assessments: merged, starAnalysis };
}
