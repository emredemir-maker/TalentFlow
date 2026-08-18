// TUTARLILIK DENETİMİ — CV'nin KENDİ İÇİNDEKİ çelişkileri.
//
// Bu modül internete çıkmaz, AI çağırmaz, hiçbir üçüncü kaynağa bakmaz.
// Yalnızca adayın verdiği bilginin kendi içinde tutarlı olup olmadığına bakar:
// tarihler birbirini tutuyor mu, beyan edilen deneyim yılı kayıtlarla
// örtüşüyor mu, unvan sıçraması makul mü.
//
// ── NEDEN ÖNCE BU, WEB ARAMASI DEĞİL ────────────────────────────────────────
// Sahtecilik şüphesinin büyük kısmı web'e çıkmadan görülebilir ve buradan
// gelen sinyal DAHA GÜVENİLİR: dış kaynak bulunamaması bir şey kanıtlamaz
// (küçük şirket, yurtdışı, kapanmış olabilir) ama adayın kendi CV'sindeki iki
// ifadenin çelişmesi ölçülebilir bir olgudur. Kaynağa ihtiyaç duymaz, ücretsiz
// çalışır, aynı girdide her zaman aynı sonucu verir.
//
// ── ÜÇ AĞIRLIK, VE HİÇBİRİ "YALAN" DEMEZ ────────────────────────────────────
//   celiski — iki beyan birbirini tutmuyor. Sorulması gereken tek şey bu.
//   dikkat  — alışılmadık ama açıklanabilir. Merak, suçlama değil.
//   bilgi   — ölçüm sonucu. Bayrak bile sayılmaz, bağlam verir.
//
// Kimse "aday yalan söylüyor" demiyor. En ağır bayrak bile bir SORU üretiyor.
// Bu, projenin her yerindeki kuralın aynısı: sistem önerir, insan karar verir.
//
// ── NEDEN İSTİHDAM BOŞLUKLARINI BAYRAKLAMIYORUZ ─────────────────────────────
// Kariyer boşluğu tespiti teknik olarak kolay ve bilerek DIŞARIDA bırakıldı.
// Boşluklar sahtecilik göstergesi değil — doğum izni, hastalık, bakım
// yükümlülüğü, askerlik. Bu yükü orantısız biçimde belirli gruplar taşıyor.
// Sahteciliği aramak için kurulan bir aracın, aramadığı bir şeyi cezalandıran
// bir ayrımcılık aracına dönüşmesinin en kısa yolu bu olurdu.

import {
    parseDuration,
    toWindow,
    unionMonths,
    overlapMonths,
    formatMonths,
    currentYearMonth,
} from './cvDates.js';

export const SEVERITY = { CONTRADICTION: 'celiski', ATTENTION: 'dikkat', INFO: 'bilgi' };

/** Ağırlık sırası — rapor bunu kullanarak bayrakları sıralar. */
const SEVERITY_RANK = { celiski: 0, dikkat: 1, bilgi: 2 };

const fold = (s) => String(s ?? '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase();

/**
 * KIDEM MERDİVENİ — unvan sıçraması ölçümü için kaba bir sıralama.
 *
 * Şirketten şirkete değişir ve KESİN DEĞİLDİR: bir startup'ta "Head of
 * Growth" üç kişilik ekibin başıdır, kurumsalda kırk kişinin. Bu yüzden
 * merdiven yalnızca BÜYÜK sıçramaları (iki basamak ve üzeri) yakalamak için
 * kullanılır ve ürettiği bayrak asla "celiski" değil "dikkat" ağırlığındadır.
 *
 * Sıra önemli: yukarıdan aşağı eşleşir. "Genel Müdür" içinde "müdür" geçtiği
 * için yönetici basamağından ÖNCE tepe yönetim basamağı denenmeli.
 *
 * ── KISALTMALAR ALT DİZE OLARAK ARANMAZ ─────────────────────────────────────
 * `phrases` alt dize olarak, `tokens` TAM KELİME olarak eşleşir. Bu ayrım
 * şart: "Marketing Dire(cto)r" içinde "cto" geçiyor ve alt dize aramasıyla
 * bir pazarlama direktörü CTO sayılıyordu — testin yakaladığı gerçek hata.
 * Aynı tuzak 'ceo' (a(ceo)unting değil ama benzerleri), 'coo' (c(oo)rdinator),
 * 'cmo' ve 'vp' için de kuruluydu.
 */
const LADDER = [
    {
        band: 6,
        tokens: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'vp'],
        phrases: ['chief', 'vice president', 'genel mudur', 'kurucu', 'founder', 'yonetim kurulu'],
    },
    { band: 5, tokens: [], phrases: ['director', 'direktor'] },
    { band: 4, tokens: ['sef'], phrases: ['manager', 'mudur', 'head of', 'yonetici', 'supervisor'] },
    { band: 3, tokens: ['sr'], phrases: ['senior', 'kidemli', 'lead', 'principal', 'staff', 'takim lideri'] },
    { band: 1, tokens: ['jr'], phrases: ['junior', 'asistan', 'assistant', 'entry level'] },
    { band: 0, tokens: [], phrases: ['stajyer', 'intern', 'trainee', 'cirak', 'bursiyer'] },
];

/** Orta seviye — merdivende hiçbir anahtar kelime tutmazsa varsayılan. */
const DEFAULT_BAND = 2;

/**
 * Unvanı kıdem basamağına çevirir.
 * @returns {number} 0-6 arası basamak; bilinmiyorsa DEFAULT_BAND.
 */
export function seniorityBand(role) {
    // Noktalama boşluğa çevrilir: "Sr." → "sr", "Co-Founder" → "co founder".
    const normalized = fold(role).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!normalized) return DEFAULT_BAND;
    const padded = ` ${normalized} `;
    const tokens = new Set(normalized.split(' '));

    for (const step of LADDER) {
        if (step.tokens.some((t) => tokens.has(t))) return step.band;
        if (step.phrases.some((p) => padded.includes(p))) return step.band;
    }
    return DEFAULT_BAND;
}

/**
 * İlan metninden istenen asgari deneyim yılını çıkarır.
 *
 * "en az 5 yıl", "5+ yıl deneyim", "3-5 yıl" — sonuncuda ALT sınır alınır:
 * bant veriliyorsa aday alt sınırı karşılıyorsa yeterlidir.
 *
 * @returns {number|null} bulunamazsa null — SIFIR DEĞİL. "İlan yıl istemiyor"
 *   ile "aday sıfır yıl karşılıyor" bambaşka iki şey.
 */
export function extractRequiredYears(text) {
    const s = fold(text);
    if (!s) return null;
    let best = null;
    // "3-5 yıl" → 3;  "5+ yıl" → 5;  "en az 5 yıl" → 5;  "5 yıl" → 5
    const re = /(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:yil|yillik|sene|year|years)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0 && n <= 40) best = best === null ? n : Math.min(best, n);
    }
    return best;
}

/**
 * İlanın istediği asgari yılı, ilanın TÜM metinlerinden çıkarır.
 *
 * Burada duruyor çünkü extractRequiredYears de burada ve iki ayrı çağıranı
 * var: doğrulama raporu (services/cvVerification.js) ve liste rozetleri
 * (utils/candidateBadges.js). Rozet tarafının bu tek satır için tüm doğrulama
 * zincirini — dolayısıyla Firestore'u — import etmesi saçma olurdu.
 */
export function requiredYearsOf(position) {
    if (!position) return null;
    const parts = [
        position.title,
        position.description,
        ...(Array.isArray(position.requirements)
            ? position.requirements.map((r) => (typeof r === 'string' ? r : r?.text || ''))
            : []),
    ];
    return extractRequiredYears(parts.filter(Boolean).join('\n'));
}

/** Adayın beyan ettiği deneyim yılı — string de gelebilir, ay cinsine çevrilir. */
function claimedMonthsOf(candidate) {
    const raw = candidate?.experience;
    const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 60) return null;
    return Math.round(n * 12);
}

/**
 * Kayıtları ölçülebilir pencerelere çevirir ve kapsamı raporlar.
 *
 * KAPSAM (coverage) bu modülün en önemli kavramı. `experiences` alanı CV'den
 * AI ile çıkarılıyor ve havuzun büyük kısmında EKSİK (bkz. functions/services/
 * enrich.js — alan eski içe aktarma şemasında hiç istenmemiş). Eksik veriden
 * hesaplanan toplam süre, adayın beyanından küçük çıkar ve tam da "deneyimini
 * şişirmiş" bayrağını tetikler.
 *
 * Yani ölçüm eksikliği, ölçüm sonucu gibi görünür. Bunu engellemenin tek yolu
 * kapsamı taşımak ve eksikken ağır bayrak üretmemek.
 */
export function measureExperiences(experiences, today) {
    const list = Array.isArray(experiences) ? experiences : [];
    const rows = list.map((e, index) => {
        const range = parseDuration(e?.duration);
        return {
            index,
            role: String(e?.role || '').trim(),
            company: String(e?.company || '').trim(),
            duration: String(e?.duration || '').trim(),
            range,
            window: range ? toWindow(range, today) : null,
        };
    });

    const measurable = rows.filter((r) => r.window);
    const totalMonths = unionMonths(measurable.map((r) => r.window));

    let coverage = 'full';
    if (list.length === 0 || measurable.length === 0) coverage = 'none';
    else if (measurable.length < list.length) coverage = 'partial';

    return {
        rows,
        measurable,
        totalCount: list.length,
        measuredCount: measurable.length,
        unmeasuredCount: list.length - measurable.length,
        coverage,
        totalMonths,
        ongoingCount: rows.filter((r) => r.range?.current).length,
        avgTenureMonths: measurable.length
            ? Math.round(measurable.reduce((sum, r) => sum + (r.window.to - r.window.from), 0) / measurable.length)
            : null,
    };
}

const flag = (id, severity, title, detail, question) => ({ id, severity, title, detail, question });

/** Beyan edilen deneyim ile kayıtlardan hesaplanan toplam çelişiyor mu? */
function checkClaimedExperience(candidate, measured) {
    const claimed = claimedMonthsOf(candidate);
    if (claimed === null || measured.coverage === 'none') return null;

    const diff = claimed - measured.totalMonths;
    // Eşik neden 24 ay: CV'ler eski/kısa görevleri atlar, AI ayrıştırması da
    // birkaç kayıt kaçırır. Bir yıllık sapma gürültüdür. İki yılın üzerindeki
    // fark, "unutulmuş bir iş" ile açıklanamayacak kadar büyük.
    const bigGap = diff >= 24;
    const doubled = measured.totalMonths > 0 && claimed >= measured.totalMonths * 2 && diff >= 12;
    if (!bigGap && !doubled) return null;

    // Ölçüm eksikse bu bir ÇELİŞKİ DEĞİL — büyük ihtimalle bizim kaydımız
    // eksik. Ağırlığı düşürüyoruz ve nedenini yazıyoruz.
    const partial = measured.coverage === 'partial';
    return flag(
        'beyan-fazla',
        partial ? SEVERITY.ATTENTION : SEVERITY.CONTRADICTION,
        'Beyan edilen deneyim, kayıtlardan fazla',
        `CV'de ${formatMonths(claimed)} deneyim beyan edilmiş; listelenen görevlerden hesaplanan toplam ${formatMonths(measured.totalMonths)}`
            + (partial
                ? `. ${measured.unmeasuredCount} görevin tarihi okunamadı, fark bundan kaynaklanıyor olabilir.`
                : `. ${measured.measuredCount} görevin tamamı okunabildi.`),
        `CV'nizde ${formatMonths(claimed)} deneyimden söz ediliyor ancak listelenen görevler ${formatMonths(measured.totalMonths)} tutuyor. Listede yer almayan bir çalışma dönemi var mı?`
    );
}

/** Aynı anda birden fazla tam zamanlı görev görünüyor mu? */
function checkOverlaps(measured) {
    const found = [];
    for (let i = 0; i < measured.measurable.length; i += 1) {
        for (let j = i + 1; j < measured.measurable.length; j += 1) {
            const a = measured.measurable[i];
            const b = measured.measurable[j];
            // 3 aylık tolerans: devir teslim dönemleri ve yıl hassasiyetli
            // kayıtların yuvarlaması normalde birkaç ay çakışma üretir.
            const months = overlapMonths(a.window, b.window);
            if (months > 3) found.push({ a, b, months });
        }
    }
    if (found.length === 0) return null;

    const worst = found.reduce((max, f) => (f.months > max.months ? f : max), found[0]);
    return flag(
        'cakisan-donem',
        SEVERITY.ATTENTION,
        'Çakışan çalışma dönemi',
        `${found.length} görev çifti aynı döneme denk geliyor. En uzunu: "${worst.a.company}" (${worst.a.duration}) ve "${worst.b.company}" (${worst.b.duration}) — ${formatMonths(worst.months)} çakışma.`,
        `${worst.a.company} ve ${worst.b.company} dönemleri çakışıyor. Bu görevlerden biri yarı zamanlı, danışmanlık ya da yan proje miydi?`
    );
}

/** İki basamak birden atlayan unvan yükselişi. */
function checkTitleJump(measured) {
    const ordered = measured.measurable
        .filter((r) => r.role)
        .slice()
        .sort((a, b) => a.window.from - b.window.from);

    for (let i = 0; i < ordered.length - 1; i += 1) {
        const from = ordered[i];
        const to = ordered[i + 1];
        const jump = seniorityBand(to.role) - seniorityBand(from.role);
        const gap = to.window.from - from.window.from;
        if (jump >= 2 && gap < 24) {
            return flag(
                'unvan-sicramasi',
                SEVERITY.ATTENTION,
                'Hızlı unvan yükselişi',
                `"${from.role}" (${from.company}) görevinden ${formatMonths(gap)} sonra "${to.role}" (${to.company}). Kıdem merdiveninde ${jump} basamak.`,
                `${from.role} pozisyonundan ${formatMonths(gap)} içinde ${to.role} pozisyonuna geçmişsiniz. Bu geçişte sorumluluklarınız ve ekip büyüklüğünüz nasıl değişti?`
            );
        }
    }
    return null;
}

/** Gelecekte biten ama "halen" denmemiş bir görev — sert çelişki. */
function checkFutureDates(measured, today) {
    const nowAbs = today.year * 12 + (today.month - 1);
    const future = measured.measurable.filter((r) => !r.range.current && r.window.to - 1 > nowAbs + 1);
    if (future.length === 0) return null;
    const first = future[0];
    return flag(
        'gelecek-tarih',
        SEVERITY.CONTRADICTION,
        'Gelecek tarihli görev',
        `"${first.company}" görevinin bitiş tarihi (${first.duration}) bugünden ileride ve "halen devam ediyor" olarak işaretlenmemiş.`,
        `${first.company} görevi için ${first.duration} yazılmış. Bu tarih ileri bir tarih — kayıtta bir yazım hatası mı var?`
    );
}

/** Ortalama görev süresi — yorum değil, ölçüm. */
function checkTenurePattern(measured) {
    if (measured.measuredCount < 3 || measured.avgTenureMonths === null) return null;
    if (measured.avgTenureMonths >= 12) return null;
    return flag(
        'kisa-gorevler',
        SEVERITY.INFO,
        'Ortalama görev süresi kısa',
        `${measured.measuredCount} görevde ortalama ${formatMonths(measured.avgTenureMonths)}.`,
        'Görev sürelerinizin kısa olmasının ardında nasıl bir tercih ya da koşul vardı?'
    );
}

/** Ölçümün kendisi hakkında dürüstlük — sessiz kalmak yanlış güven verir. */
function checkCoverage(measured) {
    if (measured.coverage === 'none') {
        return flag(
            'olcum-yapilamadi',
            SEVERITY.INFO,
            'Tarih ölçümü yapılamadı',
            measured.totalCount === 0
                ? 'CV\'den yapılandırılmış kariyer geçmişi çıkarılamamış — tutarlılık denetimi çalıştırılamıyor.'
                : `${measured.totalCount} görevin hiçbirinin tarihi okunamadı — tutarlılık denetimi çalıştırılamıyor.`,
            ''
        );
    }
    if (measured.coverage === 'partial') {
        return flag(
            'olcum-eksik',
            SEVERITY.INFO,
            'Ölçüm kısmi',
            `${measured.totalCount} görevden ${measured.unmeasuredCount} tanesinin tarihi okunamadı. Aşağıdaki süre hesapları eksik veriye dayanıyor.`,
            ''
        );
    }
    return null;
}

/**
 * İlanın istediği asgari yıl ile hesaplanan deneyimi karşılaştırır.
 *
 * AYRI BİR FONKSİYON, çünkü pozisyon bağlamı her zaman yok: aday havuzda
 * pozisyonsuz da durabiliyor. Rapor kurucusu bunu yalnızca ilan verildiğinde
 * çağırır.
 */
export function checkAgainstRequirement(measured, requiredYears) {
    if (!Number.isFinite(requiredYears) || requiredYears <= 0) return null;
    if (measured.coverage === 'none') return null;
    const requiredMonths = requiredYears * 12;
    // 6 ay tolerans: "5 yıl" isteyen ilan için 4 yıl 8 ay tartışılabilir,
    // 2 yıl tartışılamaz.
    if (measured.totalMonths >= requiredMonths - 6) return null;
    return flag(
        'ilan-yil-esigi',
        measured.coverage === 'partial' ? SEVERITY.INFO : SEVERITY.ATTENTION,
        'İlanın istediği deneyim yılının altında',
        `İlan en az ${requiredYears} yıl istiyor; kayıtlardan hesaplanan toplam ${formatMonths(measured.totalMonths)}.`
            + (measured.coverage === 'partial' ? ' Ölçüm kısmi — fark eksik kayıttan da kaynaklanabilir.' : ''),
        `İlan ${requiredYears} yıl deneyim istiyor. CV'nizdeki görevler ${formatMonths(measured.totalMonths)} tutuyor — bu alanda listelenmemiş bir deneyiminiz var mı?`
    );
}

/**
 * Adayın CV'si için tutarlılık raporu üretir.
 *
 * @param {object} candidate Firestore aday dokümanı
 * @param {{today?: {year: number, month: number}, requiredYears?: number|null}} options
 *   today — testlerin zamanı sabitlemesi için; verilmezse bugün.
 *   requiredYears — ilan asgari yıl eşiği; yoksa o kontrol atlanır.
 * @returns {{
 *   measured: object,
 *   flags: Array<{id, severity, title, detail, question}>,
 *   questions: string[],
 *   counts: {celiski: number, dikkat: number, bilgi: number},
 * }}
 *   questions — bayraklardan türeyen MÜLAKAT SORULARI. Bu modülün asıl
 *   çıktısı budur: bir puan değil, sorulacak somut sorular.
 */
export function buildConsistencyReport(candidate, { today = currentYearMonth(), requiredYears = null } = {}) {
    const measured = measureExperiences(candidate?.experiences, today);

    const flags = [
        checkCoverage(measured),
        checkFutureDates(measured, today),
        checkClaimedExperience(candidate, measured),
        checkOverlaps(measured),
        checkTitleJump(measured),
        checkAgainstRequirement(measured, requiredYears),
        checkTenurePattern(measured),
    ].filter(Boolean);

    flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const counts = { celiski: 0, dikkat: 0, bilgi: 0 };
    for (const f of flags) counts[f.severity] += 1;

    return {
        measured,
        flags,
        questions: flags.map((f) => f.question).filter(Boolean),
        counts,
    };
}
