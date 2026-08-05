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
    return cvText.length >= MIN_CV_TEXT_FOR_ENRICH
        && !hasExperiences
        && !candidate?.enrichedAt
        && !cvText.startsWith('PDF Error');
}

/**
 * CV metninden kariyer geçmişini çıkar. Parse edilemezse null (çağıran
 * "başarısız" sayar); geçerli ama boş listeyse [] döner.
 */
export async function extractExperiences(cvText, { useCache = true } = {}) {
    const prompt = `Sen uzman bir CV ayrıştırıcısısın. Aşağıdaki CV metninden adayın İŞ DENEYİMLERİNİ çıkar.
KURALLAR:
- SADECE gerçek iş deneyimleri (şirkette çalışılan pozisyonlar). Eğitim, sertifika, gönüllülük EKLEME.
- Her girdinin MUTLAKA şirket adı ("company") VE tarih aralığı ("duration") olmalı — biri yoksa o girdiyi EKLEME.
Sadece şu JSON formatında yanıt ver (başka hiçbir şey yazma):
{"experiences": [{"role": "Pozisyon", "company": "Şirket", "duration": "Oca 2020 - Mar 2023", "desc": "1 cümle özet"}]}

CV:
${cvText.substring(0, 15000)}`;
    const raw = (await generateText(prompt, { useCache })).replace(/```json|```/gi, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const parsed = JSON.parse(match[0]);
        return sanitizeExperiences(parsed?.experiences);
    } catch {
        return null;
    }
}
