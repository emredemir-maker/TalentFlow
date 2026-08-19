// Madde bazlı DAYANAK — "karşılıyor ama nasıl?"
//
// "met" damgası tek başına yetmiyordu: iki aday aynı damgayı alıp bambaşka
// insanlar olabilir. Derin tarama artık her madde için iki şey daha üretiyor:
//   evidence — bu damganın CV'deki somut dayanağı
//   gap      — karşılıyor ama ilanın istediğiyle nerede ayrışıyor
//
// SÜRÜM DAMGASI: bu alanlar sonradan eklendi. Eski analizlerde yoklar ve
// gereksinim metni değişmediği için parmak izi de onları "bayat" göstermez.
// O yüzden ayrı bir damga gerekiyor — yoksa arayüz boş kutu gösterip
// "bu adayın dayanağı yok" izlenimi verir, oysa "henüz sorulmadı".

// Şema sürümü. ALAN eklendiğinde de, DAMGALAMA KURALI değiştiğinde de artar:
//   1 → madde bazlı değerlendirme var, dayanak/fark yok
//   2 → dayanak (evidence) ve fark (gap) alanları eklendi
//   3 → damgalama ikiye bölündü ve "kısmen" tanımı netleşti (analog alan)
//
// Üçüncüsü neden sürüm sayılıyor: kural değişince ESKİ kayıtlar bugünkü
// kuralla üretilmemiş olur. Gereksinim metni aynı kaldığı için parmak izi
// bunu yakalamaz — ayrı bir damga olmasa iki farklı kuralla üretilmiş
// skorlar aynı listede sessizce yan yana dururdu.
export const COVERAGE_SCHEMA = 3;

/** Dayanak/fark alanları bu analizde var mı? */
const DETAIL_SCHEMA = 2;
export function hasCoverageDetail(analysis) {
    return Number(analysis?.coverageSchema) >= DETAIL_SCHEMA;
}

/**
 * Analiz BUGÜNKÜ damgalama kuralıyla mı üretildi?
 *
 * Kural değiştiğinde skor yanlış olmaz — ama eski kuralla üretilmiş bir
 * damga, yeni kuralla üretilmiş bir damgayla karşılaştırılamaz. Aynı listede
 * ikisi varsa sıralama iki farklı ölçüyü kıyaslıyor demektir.
 */
export function usesCurrentRubric(analysis) {
    return Number(analysis?.coverageSchema) >= COVERAGE_SCHEMA;
}

/** Madde bazlı değerlendirmeler — iki farklı yerde saklanabiliyor. */
/**
 * Madde değerlendirmeleri İKİ FARKLI YOLDA durabiliyor.
 *
 * analyzeCandidateMatch sonucu `scoreData` altına yazıyor; başka yollardan
 * gelen analizlerde ise kökte duruyor. İki yolu bilen tek bir çözücü olmalı:
 * canlıda görüldü ki yalnızca kök yolu okuyan bir modül, kayıtları `scoreData`
 * altında olan adaylarda "hiç değerlendirme yok" sanıp sessizce boş dönüyor.
 *
 * Dışa açık, çünkü skor dayanağı (utils/scoreProvenance.js) aynı kayıtları
 * okuyor ve kendi kopyasını tutsaydı aynen bu hata tekrarlanırdı.
 */
export function assessmentsOf(analysis) {
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/** Boş/anlamsız serbest metni eler. */
function clean(raw) {
    const text = String(raw ?? '').trim();
    if (!text || text === '-' || text.toLowerCase() === 'yok') return '';
    return text;
}

/**
 * Bir maddenin dayanağı.
 *
 * @returns {{
 *   status: string, note: string, evidence: string, gap: string,
 *   hasDetail: boolean,   // gösterilecek dayanak/fark var mı
 *   outdated: boolean,    // analiz bu alanlar eklenmeden önce yapıldı
 * } | null}
 */
export function coverageDetail(analysis, index) {
    const list = assessmentsOf(analysis);
    if (!list) return null;
    const found = list.find((a) => Number(a?.index) === Number(index));
    if (!found) return null;

    const evidence = clean(found.evidence);
    const gap = clean(found.gap);
    return {
        status: String(found.status || '').toLowerCase(),
        note: clean(found.note),
        evidence,
        gap,
        hasDetail: Boolean(evidence || gap),
        outdated: !hasCoverageDetail(analysis),
    };
}

/**
 * Analizin dayanak durumu — arayüzde bir kez sorulup tüm satırlara uygulanır.
 *
 * `outdated` ile `empty` farklı şeyler ve karıştırılmamalı: birincisi "henüz
 * sorulmadı, yeniden tarayın", ikincisi "soruldu, CV'de dayanak bulunamadı".
 * İkisini aynı boş kutuyla göstermek kullanıcıyı yanıltır.
 */
export function coverageDetailState(analysis) {
    const list = assessmentsOf(analysis);
    if (!list) return { outdated: false, empty: true, withDetail: 0, total: 0 };

    const outdated = !hasCoverageDetail(analysis);
    const withDetail = list.filter((a) => clean(a?.evidence) || clean(a?.gap)).length;
    return { outdated, empty: withDetail === 0, withDetail, total: list.length };
}
