// SEKTÖR SÖZLÜĞÜ — "aday hangi sektörlerde çalışmış" sorusunu ölçülebilir kılar.
//
// Üründe bugüne kadar sektör ölçümü YOKTU. AIAnalysisPanel'deki "Sektör"
// halkası `scoreBreakdown.industryFit` alanını okuyor ama o alanı kodda
// üreten hiçbir yer yok — halka boş veri gösteriyordu.
//
// ── NEDEN SERBEST METİN YETMEZ ──────────────────────────────────────────────
// Şirket çözümlemesinden "B2B SaaS müşteri iletişim platformu" gibi bir cümle
// geliyor. İki adayın cümlelerini karşılaştırmak ölçüm değil; "e-ticaret" ile
// "eticaret" farklı sayılır, "çağrı merkezi" ile "call center" hiç eşleşmez.
// Kanonik kimlik olmadan kariyerin yüzde kaçının hedef sektörde geçtiği
// hesaplanamaz.
//
// ── ÜÇ EKSEN, ÇÜNKÜ "SEKTÖR" TEK BAŞINA YANILTIYOR ──────────────────────────
// Trendyol da Infoset de "yazılım" sayılabilir ama biri B2C pazaryeri, diğeri
// B2B SaaS. Bir işe alımda ayırt edici olan çoğu zaman dikey sektör değil,
// KİME ve NASIL satıldığı: B2B SaaS'ta çalışmış biri, başka bir B2B SaaS'ta
// ilk günden tanıdık bir dünyaya girer.
//
//   sector — hangi dikey alan (fintech, sağlık, müşteri deneyimi...)
//   model  — kime satılıyor (b2b / b2c / b2b2c)
//   type   — nasıl para kazanıyor (saas / pazaryeri / hizmet / üretim...)
//
// Üçü ayrı ölçülür ve ayrı raporlanır. Tek bir "sektör uyumu %72" sayısına
// ezmek, hangi eksende uyduğunu görünmez kılardı.

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
 * Dikey sektörler.
 *
 * `near` — kısmi kredi alan komşular. skillGraph.js'teki gibi ilişki TÜRLÜ
 * olsun istedik ama sektörde yön anlamsız: fintech'te çalışan bankacılığa
 * ne kadar yakınsa, tersi de o kadar yakın. Bu yüzden `near` simetrik kabul
 * edilir ve tek yönde yazılması yeter (affinity iki yönü de kontrol eder).
 *
 * `label` — arayüzde gösterilecek ad. Kanonik kimlikler ASCII, çünkü
 * Firestore'da anahtar olarak da kullanılıyorlar.
 */
const SECTORS = {
    'musteri deneyimi': {
        label: 'Müşteri Deneyimi / CX',
        aliases: ['cx', 'customer experience', 'cagri merkezi', 'call center', 'contact center', 'musteri hizmetleri', 'customer support', 'help desk', 'helpdesk', 'destek merkezi', 'musteri iletisimi'],
        near: ['crm', 'kurumsal yazilim', 'telekomunikasyon'],
    },
    'crm': {
        label: 'CRM / Satış Teknolojileri',
        aliases: ['customer relationship management', 'satis teknolojileri', 'sales tech', 'salestech'],
        near: ['kurumsal yazilim', 'pazarlama teknolojileri'],
    },
    'kurumsal yazilim': {
        label: 'Kurumsal Yazılım',
        aliases: ['enterprise software', 'b2b yazilim', 'erp', 'is yazilimi', 'kurumsal cozumler'],
        near: ['bulut altyapi', 'veri analitigi'],
    },
    'pazarlama teknolojileri': {
        label: 'Pazarlama Teknolojileri',
        aliases: ['martech', 'marketing technology', 'reklam teknolojileri', 'adtech'],
        near: ['reklam ajansi', 'medya'],
    },
    'bulut altyapi': {
        label: 'Bulut / Altyapı',
        aliases: ['cloud', 'infrastructure', 'hosting', 'devops platformu', 'siber guvenlik', 'cybersecurity'],
        near: ['kurumsal yazilim', 'telekomunikasyon'],
    },
    'veri analitigi': {
        label: 'Veri / Analitik / Yapay Zeka',
        aliases: ['data', 'analytics', 'business intelligence', 'yapay zeka', 'ai', 'machine learning', 'veri bilimi'],
        near: ['kurumsal yazilim'],
    },
    'fintech': {
        label: 'Fintech',
        aliases: ['finansal teknoloji', 'odeme sistemleri', 'payment', 'financial technology', 'neobank'],
        near: ['bankacilik', 'sigorta', 'kripto'],
    },
    'bankacilik': {
        label: 'Bankacılık / Finans',
        aliases: ['bank', 'banka', 'finans', 'yatirim', 'katilim bankaciligi', 'faktoring', 'leasing'],
        near: ['fintech', 'sigorta'],
    },
    'sigorta': {
        label: 'Sigorta',
        aliases: ['insurance', 'insurtech', 'bes', 'emeklilik'],
        near: ['bankacilik', 'fintech'],
    },
    'kripto': {
        label: 'Kripto / Blokzincir',
        aliases: ['crypto', 'blockchain', 'web3', 'blokzincir'],
        near: ['fintech'],
    },
    'e ticaret': {
        label: 'E-ticaret',
        aliases: ['eticaret', 'e commerce', 'ecommerce', 'online satis', 'online perakende'],
        near: ['perakende', 'pazaryeri', 'lojistik'],
    },
    'pazaryeri': {
        label: 'Pazaryeri',
        aliases: ['marketplace', 'platform ekonomisi', 'ilan sitesi'],
        near: ['e ticaret', 'perakende'],
    },
    'perakende': {
        label: 'Perakende',
        aliases: ['retail', 'magazacilik', 'zincir magaza', 'hizli tuketim', 'fmcg'],
        near: ['e ticaret', 'pazaryeri', 'gida'],
    },
    'lojistik': {
        label: 'Lojistik / Kargo',
        aliases: ['logistics', 'kargo', 'tedarik zinciri', 'supply chain', 'nakliye', 'tasimacilik', 'depolama'],
        near: ['e ticaret', 'ulasim'],
    },
    'ulasim': {
        label: 'Ulaşım / Mobilite',
        aliases: ['transportation', 'mobility', 'havacilik', 'airline', 'toplu tasima', 'ride hailing'],
        near: ['lojistik', 'turizm'],
    },
    'telekomunikasyon': {
        label: 'Telekomünikasyon',
        aliases: ['telekom', 'telecom', 'gsm', 'operator', 'internet servis saglayici'],
        near: ['musteri deneyimi', 'medya', 'bulut altyapi'],
    },
    'medya': {
        label: 'Medya / Yayıncılık',
        aliases: ['media', 'yayincilik', 'publishing', 'televizyon', 'dijital yayin', 'streaming', 'gazete'],
        near: ['reklam ajansi', 'oyun', 'telekomunikasyon'],
    },
    'reklam ajansi': {
        label: 'Reklam / Ajans',
        aliases: ['advertising', 'agency', 'ajans', 'dijital ajans', 'halkla iliskiler', 'pr'],
        near: ['medya', 'pazarlama teknolojileri'],
    },
    'oyun': {
        label: 'Oyun',
        aliases: ['gaming', 'game', 'mobil oyun', 'oyun stüdyosu', 'esports'],
        near: ['medya'],
    },
    'saglik': {
        label: 'Sağlık',
        aliases: ['health', 'healthcare', 'hastane', 'saglik teknolojileri', 'healthtech', 'medikal', 'klinik'],
        near: ['ilac', 'sigorta'],
    },
    'ilac': {
        label: 'İlaç / Biyoteknoloji',
        aliases: ['pharma', 'pharmaceutical', 'biyoteknoloji', 'biotech'],
        near: ['saglik'],
    },
    'egitim': {
        label: 'Eğitim',
        aliases: ['education', 'edtech', 'okul', 'universite', 'egitim teknolojileri', 'kurs'],
        near: ['insan kaynaklari'],
    },
    'insan kaynaklari': {
        label: 'İnsan Kaynakları',
        aliases: ['hr', 'human resources', 'hrtech', 'ik teknolojileri', 'ise alim', 'recruitment', 'bordro'],
        near: ['danismanlik', 'egitim'],
    },
    'danismanlik': {
        label: 'Danışmanlık',
        aliases: ['consulting', 'yonetim danismanligi', 'strateji danismanligi', 'bagimsiz denetim', 'muhasebe'],
        near: ['insan kaynaklari', 'hukuk', 'kurumsal yazilim'],
    },
    'hukuk': {
        label: 'Hukuk',
        aliases: ['legal', 'legaltech', 'avukatlik', 'hukuk burosu'],
        near: ['danismanlik'],
    },
    'uretim': {
        label: 'Üretim / Sanayi',
        aliases: ['manufacturing', 'sanayi', 'fabrika', 'imalat', 'makine', 'endustri', 'tekstil', 'kimya'],
        near: ['otomotiv', 'enerji', 'lojistik'],
    },
    'otomotiv': {
        label: 'Otomotiv',
        aliases: ['automotive', 'otomobil', 'yan sanayi', 'arac'],
        near: ['uretim', 'ulasim'],
    },
    'enerji': {
        label: 'Enerji',
        aliases: ['energy', 'elektrik', 'dogalgaz', 'yenilenebilir', 'petrol', 'utilities'],
        near: ['uretim', 'insaat'],
    },
    'insaat': {
        label: 'İnşaat / Gayrimenkul',
        aliases: ['construction', 'gayrimenkul', 'real estate', 'proptech', 'muteahhit', 'emlak', 'yapi'],
        near: ['enerji', 'uretim'],
    },
    'turizm': {
        label: 'Turizm / Otelcilik',
        aliases: ['tourism', 'hospitality', 'otel', 'hotel', 'seyahat', 'travel', 'acente'],
        near: ['ulasim', 'gida'],
    },
    'gida': {
        label: 'Gıda / Tarım',
        aliases: ['food', 'agriculture', 'tarim', 'restoran', 'yiyecek icecek', 'agritech', 'foodtech'],
        near: ['perakende', 'turizm'],
    },
    'kamu': {
        label: 'Kamu',
        aliases: ['public sector', 'devlet', 'belediye', 'bakanlik', 'kamu kurumu', 'govtech'],
        near: ['savunma'],
    },
    'savunma': {
        label: 'Savunma / Havacılık',
        aliases: ['defence', 'defense', 'savunma sanayi', 'aerospace', 'uzay'],
        near: ['kamu', 'uretim'],
    },
    'stk': {
        label: 'STK / Sosyal Girişim',
        aliases: ['ngo', 'dernek', 'vakif', 'non profit', 'sosyal girisim'],
        near: ['kamu', 'egitim'],
    },
};

/** İş modeli — kime satılıyor. */
const MODELS = {
    b2b: { label: 'B2B', aliases: ['business to business', 'kurumsal', 'kurumsal satis', 'enterprise'] },
    b2c: { label: 'B2C', aliases: ['business to consumer', 'tuketici', 'bireysel', 'consumer'] },
    b2b2c: { label: 'B2B2C', aliases: ['business to business to consumer', 'platform'] },
};

/** Gelir modeli — nasıl para kazanıyor. */
const TYPES = {
    saas: { label: 'SaaS', aliases: ['software as a service', 'abonelik yazilim', 'bulut yazilim', 'yazilim urunu'] },
    pazaryeri: { label: 'Pazaryeri', aliases: ['marketplace', 'platform'] },
    hizmet: { label: 'Hizmet', aliases: ['services', 'ajans', 'danismanlik', 'outsourcing', 'proje bazli'] },
    uretim: { label: 'Üretim', aliases: ['manufacturing', 'imalat', 'fabrika'] },
    perakende: { label: 'Perakende', aliases: ['retail', 'magaza', 'e ticaret satisi'] },
    finans: { label: 'Finansal Kurum', aliases: ['banka', 'sigorta sirketi', 'financial institution'] },
    kamu: { label: 'Kamu Kurumu', aliases: ['public institution', 'devlet kurumu'] },
};

const tokensOf = (s) => fold(s).split(' ').filter(Boolean);

/**
 * En kısa güvenli kök uzunluğu.
 *
 * Bu eşiğin altındaki anahtarlar YALNIZCA birebir eşleşir. 'ai', 'hr', 'crm',
 * 'gida', 'oyun' gibi kısa terimler ek toleransıyla aranırsa alakasız
 * kelimelerin içine düşer ve sektör uydurulur.
 */
const MIN_STEM = 5;

/** Ek toleransı — Türkçe iyelik/hâl ekleri en fazla bu kadar harf ekler. */
const MAX_SUFFIX = 3;

/**
 * İki kelime aynı kökten mi?
 *
 * TÜRKÇE EK SORUNU: sözlükte "müşteri iletişimi" yazıyor, çözümleme cümlesinde
 * "müşteri iletişim platformu" geçiyor. Alt dize araması bunu kaçırır ve o
 * şirketin sektörü "bilinmiyor" sayılır — ölçüm sessizce eksilir. Kısa
 * olan uzun olanın ön eki ise ve fark birkaç harfse aynı kök sayılır.
 */
function sameStem(a, b) {
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return short.length >= MIN_STEM
        && long.startsWith(short)
        && long.length - short.length <= MAX_SUFFIX;
}

/** Anahtar kelime dizisi, metinde ARDIŞIK olarak geçiyor mu? */
function containsSequence(textTokens, keyTokens) {
    if (keyTokens.length === 0) return false;
    outer:
    for (let i = 0; i + keyTokens.length <= textTokens.length; i += 1) {
        for (let j = 0; j < keyTokens.length; j += 1) {
            if (!sameStem(textTokens[i + j], keyTokens[j])) continue outer;
        }
        return true;
    }
    return false;
}

/** Serbest metni kanonik kimliğe çeviren ortak eşleştirici. */
function makeResolver(dictionary) {
    const entries = [];
    for (const [id, def] of Object.entries(dictionary)) {
        const add = (raw) => {
            const tokens = tokensOf(raw);
            if (tokens.length) entries.push({ id, tokens, length: tokens.join(' ').length });
        };
        add(id);
        add(def.label);
        for (const a of def.aliases || []) add(a);
    }
    // SPESİFİK ÖNCE. "e-ticaret pazaryeri" metninde iki anahtar da tutuyor;
    // daha çok kelimeden oluşan anahtar daha dar bir tanımdır ve kazanmalı.
    entries.sort((a, b) => (b.tokens.length - a.tokens.length) || (b.length - a.length));

    return (raw) => {
        const textTokens = tokensOf(raw);
        if (textTokens.length === 0) return null;
        for (const e of entries) {
            if (containsSequence(textTokens, e.tokens)) return e.id;
        }
        return null;
    };
}

export const resolveSector = makeResolver(SECTORS);
export const resolveModel = makeResolver(MODELS);
export const resolveType = makeResolver(TYPES);

export const sectorLabel = (id) => SECTORS[id]?.label || '';
export const modelLabel = (id) => MODELS[id]?.label || '';
export const typeLabel = (id) => TYPES[id]?.label || '';

/** Arayüzün seçim listeleri için — {id, label} dizisi, etikete göre sıralı. */
const optionsOf = (dict) => Object.entries(dict)
    .map(([id, def]) => ({ id, label: def.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));

export const SECTOR_OPTIONS = optionsOf(SECTORS);
export const MODEL_OPTIONS = optionsOf(MODELS);
export const TYPE_OPTIONS = optionsOf(TYPES);

/** Kısmi kredi oranı — komşu sektör, aynı sektörün yarısı kadar sayılır. */
export const NEAR_WEIGHT = 0.5;

/**
 * İki sektörün yakınlığı.
 *
 * @returns {1|0.5|0} 1 aynı, 0.5 komşu, 0 ilgisiz.
 *   Bilinmeyen (null) sektör 0 döndürür — ama çağıran bunu "ilgisiz" değil
 *   "ölçülemedi" olarak saymalı. İkisini karıştırmak, sektörü çözülemeyen bir
 *   şirketi yanlış sektörde çalışılmış gibi gösterir. Bkz. sectorFit.js.
 */
export function sectorAffinity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    // `near` tek yönde yazılıyor; iki yön de kontrol edilir.
    if (SECTORS[a]?.near?.includes(b)) return NEAR_WEIGHT;
    if (SECTORS[b]?.near?.includes(a)) return NEAR_WEIGHT;
    return 0;
}

/** Sektörün komşuları — arayüzde "yakın sektörler" göstermek için. */
export function neighborsOf(id) {
    const direct = SECTORS[id]?.near || [];
    const reverse = Object.entries(SECTORS)
        .filter(([other, def]) => other !== id && def.near?.includes(id))
        .map(([other]) => other);
    return [...new Set([...direct, ...reverse])];
}
