// Eksik profil tamamlama (maintenance/enrich-profiles) — kayıtlı cvText'i
// olan ama kariyer geçmişi (experiences) boş kalmış adaylar için tek odaklı
// bir Gemini çağrısıyla deneyim listesi çıkarır. Eski toplu içe aktarma
// şeması bu alanı hiç istemediğinden mevcut havuzun tamamına yakınında alan
// boş — bu modül geriye dönük doldurur.
import { generateText } from './gemini.js';
import { sanitizeExperiences } from './bulkWorker.js';

export const MIN_CV_TEXT_FOR_ENRICH = 200;

/**
 * Aday geriye dönük deneyim çıkarımına aday mı? Daha önce denenmiş ve
 * "deneyim bulunamadı" sonucu almış kayıtlar (enrichedAt damgalı) tekrar
 * kuyruğa girmez — aksi halde geçerli-ama-boş sonuçlar sonsuza dek
 * "eksik" sayılırdı.
 */
export function needsEnrichment(candidate) {
    const cvText = (candidate?.cvText || '').trim();
    const hasExperiences = Array.isArray(candidate?.experiences) && candidate.experiences.length > 0;
    const hasLocation = Boolean(String(candidate?.location || '').trim());
    return cvText.length >= MIN_CV_TEXT_FOR_ENRICH
        && (!hasExperiences || !hasLocation)
        && !candidate?.enrichedAt
        && !cvText.startsWith('PDF Error');
}

/** Konum metnini tek satıra indirger; saçma uzunluktaki çıktıyı reddeder. */
export function sanitizeLocation(raw) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 80) return '';
    if (/^(bilinmiyor|belirtilmemiş|yok|null|n\/a|-)$/i.test(s)) return '';
    return s;
}

/**
 * CV metninden kariyer geçmişini VE konum bilgisini çıkar.
 * @returns {Promise<{experiences: Array, location: string}|null>} parse
 *   edilemezse null (çağıran "başarısız" sayar); geçerli ama boş CV'de
 *   `{ experiences: [], location: '' }`.
 *
 * Konum, adaylar tablosundaki "İstanbul içi/dışı" filtresini besler; eski
 * içe aktarma şeması bu alanı istemediği için mevcut havuzun büyük kısmında
 * boş — aynı çağrıda doldurulur, ek AI maliyeti yok.
 */
export async function extractExperiences(cvText, { useCache = true } = {}) {
    const prompt = `Sen uzman bir CV ayrıştırıcısısın. Aşağıdaki CV metninden adayın İŞ DENEYİMLERİNİ ve YAŞADIĞI YERİ çıkar.
KURALLAR:
- SADECE gerçek iş deneyimleri (şirkette çalışılan pozisyonlar). Eğitim, sertifika, gönüllülük EKLEME.
- Her girdinin MUTLAKA şirket adı ("company") VE tarih aralığı ("duration") olmalı — biri yoksa o girdiyi EKLEME.
- "location": adayın YAŞADIĞI yer (şirket adresi değil). "Şehir, Ülke" veya "İlçe/Şehir" biçiminde kısa yaz. CV'de yoksa boş string ver, TAHMİN ETME.
Sadece şu JSON formatında yanıt ver (başka hiçbir şey yazma):
{"location": "İstanbul, Türkiye", "experiences": [{"role": "Pozisyon", "company": "Şirket", "duration": "Oca 2020 - Mar 2023", "desc": "1 cümle özet"}]}

CV:
${cvText.substring(0, 15000)}`;
    const raw = (await generateText(prompt, { useCache })).replace(/```json|```/gi, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        return {
            experiences: sanitizeExperiences(parsed?.experiences),
            location: sanitizeLocation(parsed?.location),
        };
    } catch {
        return null;
    }
}
