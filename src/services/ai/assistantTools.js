// ASİSTANIN ARAÇ KAYDI — asistanın YAPABİLDİKLERİNİN tek listesi.
//
// Asistan bugüne kadar tek iş yapıyordu: aday havuzunda filtre çalıştırmak.
// Alan sözlüğü sabitti ve dışına çıkan her soru "unsupported" dalına
// düşüyordu. Mülakat incelemesi, pozisyon teşhisi, piyasa araştırması,
// ilan taslağı — hedeflenen yeteneklerin hiçbiri o sözlükle ifade edilemiyor.
//
// Bu dosya araçları TEK YERDE tanımlar. Yeni bir araç eklemek artık prompt
// yeniden yazmak değil, buraya bir kayıt ve bir çalıştırıcı eklemek.
//
// ── NEDEN AYRI BİR YÖNLENDİRİCİ ÇAĞRISI YOK ─────────────────────────────────
// Araç seçimini ayrı bir model çağrısına vermek en temiz tasarım olurdu ama
// her soruda İKİ çağrı demek: gecikme ve maliyet iki katı. Araç sayısı azken
// bunun karşılığı yok. Seçim, zaten var olan çeviri çağrısının çıktısına bir
// alan olarak eklendi.
//
// Araçlar çoğalıp her birinin şeması büyüdüğünde tek prompt'a hepsini
// sığdırmak zorlaşacak; o noktada yönlendirme ayrı bir çağrıya bölünmeli.
// Bugün değil.

/**
 * @typedef {object} AssistantTool
 * @property {string} id — modelin yazacağı kimlik
 * @property {string} label — kullanıcıya görünen ad
 * @property {string} description — modelin seçim yaparken okuduğu tanım
 * @property {string[]} examples — kullanıcıya gösterilen örnek sorular
 */

/** @type {AssistantTool[]} */
export const TOOLS = [
    {
        id: 'aday_sorgusu',
        label: 'Aday havuzu sorgusu',
        description:
            'Aday havuzunu listeler, sayar ya da gruplar. Kullanabildiği alanlar: '
            + 'pozisyon puanı, gereksinim maddeleri, zorunlu madde kapısı, STAR kanıt '
            + 'yüzdesi, tarama durumu, konum, beceri, süreç aşaması ve serbest metin.',
        examples: [
            'Tüm zorunlulukları karşılayan en iyi 5 aday',
            'SQL bilen ama hiç taranmamış adaylar',
            'Adaylar hangi şehirlerde',
        ],
    },
    {
        id: 'mulakat_incelemesi',
        label: 'Mülakat incelemesi',
        description:
            'Yapılmış görüşmeleri inceler: damga dağılımı, hangi gereksinim maddesi '
            + 'kapandı, hangi madde hiç sorulmadı, hangi görüşmede sayısal sonuç çıkmadı. '
            + 'Adayın cevabından alıntılarla yorumlar. Bir pozisyona ya da tek bir adaya '
            + 'bağlı sorulabilir. Yalnızca GÖRÜŞME YAPILMIŞ adaylar için çalışır.',
        examples: [
            'Bu pozisyonda görüştüğümüz adaylar nasıldı',
            'Mülakatlarda hangi madde hiç sorulmamış',
        ],
    },
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

/** Kimliğe göre araç; tanınmayan kimlikte null. */
export function toolById(id) {
    return BY_ID.get(String(id || '')) || null;
}

/** Modelin seçim yaparken okuyacağı araç listesi. */
export function toolMenu() {
    return TOOLS.map((t) => `- ${t.id}: ${t.description}`).join('\n');
}

/**
 * Soru hiçbir araca uymadığında kullanıcıya söylenecek şey.
 *
 * "Bunu yapamam" demek yetmez: kullanıcı neyi sorabileceğini bilmiyorsa
 * denemeyi bırakır. Yapabildiklerimizi SAYMAK, yapamadığımızı söylemenin
 * kullanışlı hâli.
 */
export function capabilityMessage(reason = '') {
    const list = TOOLS.map((t) => `• ${t.label}: ${t.description}`).join('\n');
    const head = String(reason || '').trim();
    return `${head ? `${head}\n\n` : ''}Şu an yapabildiklerim:\n${list}`;
}
