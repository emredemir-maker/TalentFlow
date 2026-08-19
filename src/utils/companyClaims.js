// ŞİRKET İDDİASI ↔ KANIT — CV'de yazan ile dışarıda bulunanı karşılaştırır.
//
// Bu dosya internete çıkmaz: companyIntel.js'in topladığı kanıtı alır ve
// adayın iddiasıyla karşılaştırır. Ayrı durmasının sebebi, karşılaştırma
// kurallarının ağ çağrısı olmadan test edilebilmesi — bir insan hakkında
// şüphe üreten mantık, mock'a bağlı kalmamalı.
//
// ── ÜÇ HÜKÜM, VE "YALAN" HİÇBİRİ DEĞİL ──────────────────────────────────────
//   dogrulandi     — bağımsız kaynak iddiayla uyuşuyor
//   dogrulanamadi  — kaynak bulunamadı. SUÇLAMA DEĞİL: küçük şirket, yurtdışı,
//                    kapanmış ya da hiç dijital iz bırakmamış olabilir.
//                    Türkiye'de web sitesi olmayan gerçek şirket sayısı çok.
//   celiski        — bulunan kaynak iddiayla ÇELİŞİYOR. Kırmızı bayrak yalnızca bu.
//
// "Doğrulanamadı"yı "şüpheli" gibi göstermek bu aracın yapabileceği en büyük
// haksızlık olurdu: küçük şehirdeki bir aile şirketinde çalışmış adayı,
// kurumsal geçmişli adaya göre sistematik olarak cezalandırırdı.
//
// ── KANIT GÜCÜ SIRALI ───────────────────────────────────────────────────────
// Ticaret sicili > domain yaşı > web araması. Sicil hukuken yayımlanmak üzere
// üretilmiş kayıt; domain yaşı dolaylı; arama sonucu yorum. Bu yüzden aynı
// belirti farklı kaynaktan geldiğinde farklı AĞIRLIK üretir.

import { seniorityBand, SEVERITY } from './cvConsistency.js';

export const CLAIM_VERDICT = {
    VERIFIED: 'dogrulandi',
    UNVERIFIED: 'dogrulanamadi',
    CONTRADICTED: 'celiski',
};

/** Şirket ölçek bantları — küçükten büyüğe. */
export const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-1000', '1000+'];

/** "Küçük" sayılan bantlar — unvan/ölçek çelişkisi bu eşikte anlamlı. */
const TINY_BANDS = new Set(['1-10']);

/** Yönetici ve üzeri kıdem — cvConsistency merdiveninde 4 ve yukarısı. */
const MANAGER_BAND = 4;

const fold = (s) => String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * İki kişi adı aynı kişiyi mi gösteriyor?
 *
 * HEM AD HEM SOYAD tutmak zorunda. Yalnızca soyada bakmak Türkiye'de yaygın
 * soyadlarında (Yılmaz, Kaya, Demir) sürekli yanlış eşleşme üretirdi — ve bu
 * yanlış eşleşmenin çıktısı "aday şirketin sahibi" gibi ağır bir iddia.
 *
 * Orta ad yok sayılır: "Mehmet Ali Yılmaz" ile "Mehmet Yılmaz" aynı sayılır.
 * Ters yazım ("YILMAZ Mehmet") da tanınır.
 */
export function namesMatch(a, b) {
    const ta = fold(a).split(' ').filter(Boolean);
    const tb = fold(b).split(' ').filter(Boolean);
    if (ta.length < 2 || tb.length < 2) return false;

    const pair = (t) => [t[0], t[t.length - 1]];
    const [firstA, lastA] = pair(ta);
    const [firstB, lastB] = pair(tb);
    if (firstA === firstB && lastA === lastB) return true;
    // Ters yazım: "YILMAZ Mehmet" ↔ "Mehmet Yılmaz"
    return firstA === lastB && lastA === firstB;
}

/** Adayın adı, kurucular listesinde geçiyor mu? Geçiyorsa eşleşen adı döndürür. */
export function matchFounder(candidateName, founders) {
    if (!candidateName || !Array.isArray(founders)) return null;
    return founders.find((f) => namesMatch(candidateName, f)) || null;
}

const flag = (id, severity, title, detail, question) => ({ id, severity, title, detail, question });

/** Kanıtta gerçekten bir şey bulunmuş mu? */
function hasEvidence(evidence) {
    return Boolean(
        evidence?.registry
        || evidence?.website
        || evidence?.foundedYear
        || (Array.isArray(evidence?.sources) && evidence.sources.length > 0)
    );
}

/**
 * Bir şirket iddiasını kanıtla karşılaştırır.
 *
 * @param {object} input
 *   claim         — {company, role, startYear, duration} CV'den gelen iddia
 *   evidence      — companyIntel çıktısı; yoksa null
 *   candidateName — kurucu eşleşmesi için
 * @returns {{company: string, verdict: string, flags: Array}}
 */
export function verifyCompanyClaim({ claim, evidence, candidateName } = {}) {
    const company = String(claim?.company || '').trim();
    const flags = [];

    if (!hasEvidence(evidence)) {
        flags.push(flag(
            'sirket-dogrulanamadi',
            SEVERITY.INFO,
            'Şirket doğrulanamadı',
            `"${company}" için bağımsız bir kayıt bulunamadı. Bu, şirketin var olmadığı anlamına GELMEZ — küçük ölçekli, yurtdışı merkezli ya da dijital izi olmayan şirketler de bu sonucu verir.`,
            `${company} hakkında biraz bilgi verir misiniz — kaç kişilik bir ekipti, ne iş yapıyordu?`
        ));
        return { company, verdict: CLAIM_VERDICT.UNVERIFIED, flags };
    }

    // ── Kurucu eşleşmesi — adayın kendi şirketi ──────────────────────────────
    // Bu bir SUÇLAMA DEĞİL. Kendi şirketinde çalışmak meşru ve yaygın; ama
    // "Growth Manager" unvanının ne anlama geldiği, kendi şirketinde ile
    // 200 kişilik bir şirkette aynı şey değil. İşe alımcının bilmesi gereken
    // bir bağlam, elenme sebebi değil.
    const founder = matchFounder(candidateName, evidence.registry?.founders || evidence.founders);
    if (founder) {
        flags.push(flag(
            'aday-kurucu',
            SEVERITY.ATTENTION,
            'Aday, şirketin kurucuları arasında görünüyor',
            `"${company}" kayıtlarında kurucu/ortak olarak "${founder}" geçiyor — adayın adıyla eşleşiyor.`
                + (evidence.registry ? ' Kaynak: ticaret sicili.' : ' Kaynak: web araması — sicil kaydıyla teyit edilmedi.'),
            `${company} sizin kurucusu olduğunuz bir şirket mi? Öyleyse ekip büyüklüğü, raporlama yapınız ve bu unvanla üstlendiğiniz sorumlulukları anlatır mısınız?`
        ));
    }

    // ── Kuruluş tarihi çelişkisi — KANIT GÜCÜNE GÖRE BASAMAKLI ──────────────
    //
    // En güçlü kaynak soruyu cevaplarsa aşağıdakilere BAKILMAZ. Sicil kaydı
    // "şirket 2021'de kuruldu" diyorsa, alan adının 2026'da alınmış olması
    // artık hiçbir şey anlatmaz — sadece gürültü üretir ve raporu
    // kalabalıklaştırıp asıl bulguyu gölgeler.
    const startYear = Number(claim?.startYear);
    if (Number.isInteger(startYear)) {
        const registryYear = Number(evidence.registry?.foundedYear);
        const searchYear = Number(evidence.foundedYear);
        const domainYear = Number(evidence.domainCreatedYear);

        // 1 yıl tolerans — kuruluş ile fiilî faaliyet arasında fark olabilir.
        const foundingConflict = (year) => Number.isInteger(year) && startYear < year - 1;

        if (Number.isInteger(registryYear)) {
            // Ticaret sicili hukuki belge: şirket kurulmadan orada çalışılamaz.
            if (foundingConflict(registryYear)) {
                flags.push(flag(
                    'kurulus-sonrasi',
                    SEVERITY.CONTRADICTION,
                    'Şirket kuruluşundan önceki bir başlangıç tarihi',
                    `CV'de "${company}" için başlangıç ${startYear}; ticaret sicilinde şirketin kuruluşu ${registryYear}.`,
                    `${company} sicilde ${registryYear} kuruluşlu görünüyor ama CV'nizde ${startYear} yazıyor. Şirket önce başka bir unvanla mı faaliyet gösteriyordu?`
                ));
            }
        } else if (Number.isInteger(searchYear)) {
            // Arama sonucundan gelen kuruluş yılı sicil değil — bir web
            // sayfasının iddiası. Aynı belirti, bir basamak düşük ağırlıkla.
            if (foundingConflict(searchYear)) {
                flags.push(flag(
                    'kurulus-sonrasi',
                    SEVERITY.ATTENTION,
                    'Şirket kuruluşundan önceki bir başlangıç tarihi',
                    `CV'de "${company}" için başlangıç ${startYear}; web kaynaklarında kuruluş ${searchYear} görünüyor. Sicil kaydıyla teyit edilmedi.`,
                    `${company} kaynaklarda ${searchYear} kuruluşlu görünüyor ama CV'nizde ${startYear} yazıyor. Şirket önce başka bir unvanla mı faaliyet gösteriyordu?`
                ));
            }
        } else if (Number.isInteger(domainYear) && startYear < domainYear - 2) {
            // Domain yaşı EN DOLAYLI kanıt: şirket kurumsal siteye geç geçmiş
            // olabilir. Yalnızca kuruluş yılı hiç bulunamadığında anlamlı.
            flags.push(flag(
                'domain-yasi',
                SEVERITY.ATTENTION,
                'Şirket web sitesi, iddia edilen dönemden çok sonra alınmış',
                `CV'de başlangıç ${startYear}; "${company}" alan adı ${domainYear} yılında kaydedilmiş. Alan adı şirketten sonra alınmış olabilir — tek başına kesin değil.`,
                `${company} ile çalışmaya ${startYear}'te başlamışsınız. Şirket o dönemde hangi isimle faaliyet gösteriyordu?`
            ));
        }
    }

    // ── Unvan ile ölçek çelişkisi ───────────────────────────────────────────
    if (TINY_BANDS.has(evidence.sizeBand) && seniorityBand(claim?.role) >= MANAGER_BAND) {
        flags.push(flag(
            'unvan-olcek',
            SEVERITY.ATTENTION,
            'Yönetici unvanı, çok küçük bir şirkette',
            `"${claim.role}" unvanı bildirilmiş; "${company}" için bulunan ölçek ${evidence.sizeBand} kişi.`,
            `${company}'de ${claim.role} olarak kaç kişilik bir ekibi yönetiyordunuz?`
        ));
    }

    const contradicted = flags.some((f) => f.severity === SEVERITY.CONTRADICTION);
    if (contradicted) return { company, verdict: CLAIM_VERDICT.CONTRADICTED, flags };

    // Kanıt var ve çelişki yok — doğrulandı. Dikkat bayrakları bunu bozmaz:
    // adayın kendi şirketi olması, şirketin varlığını yalanlamaz.
    return { company, verdict: CLAIM_VERDICT.VERIFIED, flags };
}

/**
 * Tüm şirket sonuçlarını tek özete indirir.
 *
 * Sayılar ayrı tutulur: "3 şirketten 1'i doğrulandı, 1'inde çelişki var,
 * 1'i doğrulanamadı" cümlesi kurulabilsin diye. Tek bir yüzdeye ezmek,
 * doğrulanamayanı çelişkiyle aynı kefeye koyardı.
 */
export function summarizeCompanyVerification(results) {
    const list = Array.isArray(results) ? results : [];
    const counts = { dogrulandi: 0, dogrulanamadi: 0, celiski: 0 };
    for (const r of list) {
        if (counts[r?.verdict] !== undefined) counts[r.verdict] += 1;
    }
    return {
        total: list.length,
        counts,
        flags: list.flatMap((r) => r?.flags || []),
        hasContradiction: counts.celiski > 0,
    };
}
