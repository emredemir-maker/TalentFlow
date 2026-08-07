// Yetkinlik yakınlık grafı — alan bağımsız.
//
// Eski yaklaşım düz gruplardı: bir terim ve aday yeteneği AYNI grupta ise
// yarım puan. İki sorunu vardı:
//   1. İlişki türsüzdü — 'redis' ile 'security' aynı "backend" grubunda
//      olduğu için birbirine yakın sayılıyordu. Değiller.
//   2. Yalnızca yazılım alanını tanıyordu. Satış, İK, finans, tedarik,
//      müşteri deneyimi gibi alanlarda hiçbir yakınlık kurulamıyordu; o
//      ilanlarda skor tamamen birebir kelime eşleşmesine kalıyordu.
//
// Burada ilişki YÖNLÜ ve TÜRLÜ:
//   - alias   : aynı şeyin başka adı ("js" = "javascript")
//   - implies : X biliyorsa Y'yi de bilir ("react" ⇒ "javascript")
//   - sibling : aynı ebeveyni işaret eden iki araç (Amplitude ↔ Mixpanel)
//
// Yön önemli: React bilen JavaScript bilir, ama JavaScript bilen React
// bilmek zorunda değildir. Simetrik bir model bu farkı yok sayardı.

/**
 * Düğümler: kanonik terim → { aliases, implies }
 * Kısa ve Türkçe eklerle çakışabilecek terimler bilinçli olarak dışarıda
 * ('bi' → "bir/bilgi", 'ar' → "araştırma" vb.).
 */
const SKILL_NODES = {
    // ── Yazılım ──────────────────────────────────────────────────────────
    'javascript': { aliases: ['js', 'ecmascript'] },
    'typescript': { aliases: ['ts'], implies: ['javascript'] },
    'react': { aliases: ['react.js', 'reactjs'], implies: ['javascript'] },
    'next.js': { aliases: ['nextjs'], implies: ['react', 'javascript'] },
    'vue': { aliases: ['vue.js', 'vuejs'], implies: ['javascript'] },
    'angular': { implies: ['typescript', 'javascript'] },
    'node': { aliases: ['node.js', 'nodejs'], implies: ['javascript'] },
    'react native': { implies: ['react', 'javascript', 'mobil geliştirme'] },
    'flutter': { implies: ['mobil geliştirme'] },
    'swift': { implies: ['mobil geliştirme'] },
    'kotlin': { implies: ['mobil geliştirme'] },
    'mobil geliştirme': { aliases: ['mobile development'] },
    'django': { implies: ['python'] },
    'spring': { implies: ['java'] },
    'postgresql': { aliases: ['postgres'], implies: ['sql'] },
    'mysql': { implies: ['sql'] },
    'sql': { aliases: ['structured query language'] },
    'python': {},
    'java': {},
    'docker': { implies: ['konteynerizasyon'] },
    'kubernetes': { aliases: ['k8s'], implies: ['konteynerizasyon', 'devops'] },
    'terraform': { implies: ['devops', 'altyapı otomasyonu'] },
    'jenkins': { implies: ['ci/cd', 'devops'] },
    'ci/cd': { implies: ['devops'] },
    'aws': { implies: ['bulut'] },
    'azure': { implies: ['bulut'] },
    'gcp': { aliases: ['google cloud'], implies: ['bulut'] },
    'konteynerizasyon': { aliases: ['containerization'] },
    'altyapı otomasyonu': { aliases: ['infrastructure as code'], implies: ['devops'] },
    'devops': {},
    'bulut': { aliases: ['cloud'] },

    // ── Ürün ─────────────────────────────────────────────────────────────
    'ürün yönetimi': { aliases: ['product management'] },
    'product owner': { implies: ['ürün yönetimi', 'agile'] },
    'roadmap': { aliases: ['yol haritası'], implies: ['ürün yönetimi'] },
    'discovery': { aliases: ['ürün keşfi'], implies: ['ürün yönetimi'] },
    'plg': { aliases: ['product-led growth', 'product led growth'], implies: ['ürün yönetimi', 'growth'] },
    'jira': { implies: ['agile'] },
    'scrum': { implies: ['agile'] },
    'kanban': { implies: ['agile'] },
    'agile': { aliases: ['çevik'] },

    // ── Growth / Pazarlama ───────────────────────────────────────────────
    'growth': { aliases: ['büyüme'] },
    'funnel': { aliases: ['huni', 'funnel sahipliği'], implies: ['growth'] },
    'aktivasyon': { aliases: ['activation'], implies: ['growth', 'funnel'] },
    'retention': { aliases: ['elde tutma'], implies: ['growth'] },
    'churn': { implies: ['retention', 'growth'] },
    'a/b test': { aliases: ['ab test', 'a/b testi', 'split test'], implies: ['deneysel tasarım', 'growth'] },
    'deneysel tasarım': { aliases: ['experimentation'] },
    'seo': { implies: ['dijital pazarlama'] },
    'google ads': { aliases: ['adwords'], implies: ['performans pazarlaması', 'dijital pazarlama'] },
    'meta ads': { aliases: ['facebook ads'], implies: ['performans pazarlaması', 'dijital pazarlama'] },
    'performans pazarlaması': { aliases: ['performance marketing'], implies: ['dijital pazarlama'] },
    'içerik pazarlaması': { aliases: ['content marketing'], implies: ['dijital pazarlama'] },
    'e-posta pazarlaması': { aliases: ['email marketing'], implies: ['dijital pazarlama'] },
    'dijital pazarlama': { aliases: ['digital marketing'] },
    'fiyatlandırma': { aliases: ['pricing'] },

    // ── Analitik ─────────────────────────────────────────────────────────
    'amplitude': { implies: ['ürün analitiği'] },
    'mixpanel': { implies: ['ürün analitiği'] },
    'ga4': { aliases: ['google analytics', 'google analytics 4'], implies: ['web analitiği'] },
    'ürün analitiği': { aliases: ['product analytics'], implies: ['veri analizi'] },
    'web analitiği': { aliases: ['web analytics'], implies: ['veri analizi'] },
    'metabase': { implies: ['veri görselleştirme'] },
    'looker': { implies: ['veri görselleştirme'] },
    'tableau': { implies: ['veri görselleştirme'] },
    'power bi': { implies: ['veri görselleştirme'] },
    'veri görselleştirme': { aliases: ['data visualization'], implies: ['veri analizi'] },
    'veri analizi': { aliases: ['data analysis', 'veri analitiği'] },
    'excel': { aliases: ['microsoft excel'], implies: ['veri analizi'] },
    'pandas': { implies: ['python', 'veri analizi'] },

    // ── Satış ────────────────────────────────────────────────────────────
    'salesforce': { implies: ['crm'] },
    'hubspot': { implies: ['crm', 'pazarlama otomasyonu'] },
    'pipedrive': { implies: ['crm'] },
    'crm': { aliases: ['müşteri ilişkileri yönetimi'] },
    'b2b satış': { aliases: ['b2b sales'], implies: ['satış'] },
    'key account': { aliases: ['kilit müşteri'], implies: ['satış'] },
    'saha satış': { implies: ['satış'] },
    'teklif yönetimi': { implies: ['satış'] },
    'satış': { aliases: ['sales'] },
    'pazarlama otomasyonu': { aliases: ['marketing automation'] },

    // ── Müşteri deneyimi ─────────────────────────────────────────────────
    'zendesk': { implies: ['destek masası'] },
    'intercom': { implies: ['destek masası'] },
    'freshdesk': { implies: ['destek masası'] },
    'destek masası': { aliases: ['helpdesk'], implies: ['müşteri deneyimi'] },
    'nps': { implies: ['müşteri deneyimi'] },
    'müşteri deneyimi': { aliases: ['customer experience'] },

    // ── İnsan kaynakları ─────────────────────────────────────────────────
    'işe alım': { aliases: ['recruitment', 'recruiting', 'talent acquisition'], implies: ['insan kaynakları'] },
    'bordro': { aliases: ['payroll'], implies: ['insan kaynakları'] },
    'özlük': { implies: ['insan kaynakları'] },
    'performans yönetimi': { implies: ['insan kaynakları'] },
    'insan kaynakları': { aliases: ['human resources'] },

    // ── Finans / Muhasebe ────────────────────────────────────────────────
    'muhasebe': { aliases: ['accounting'], implies: ['finans'] },
    'finansal raporlama': { aliases: ['financial reporting'], implies: ['finans'] },
    'bütçe': { aliases: ['budgeting', 'bütçeleme'], implies: ['finans'] },
    'ufrs': { aliases: ['ifrs'], implies: ['finansal raporlama'] },
    'maliyet muhasebesi': { implies: ['muhasebe'] },
    'sap': { implies: ['erp'] },
    'erp': {},
    'finans': { aliases: ['finance'] },

    // ── Operasyon / Tedarik ──────────────────────────────────────────────
    'tedarik zinciri': { aliases: ['supply chain'], implies: ['operasyon'] },
    'satın alma': { aliases: ['procurement'], implies: ['operasyon'] },
    'lojistik': { aliases: ['logistics'], implies: ['operasyon'] },
    'stok yönetimi': { aliases: ['envanter yönetimi', 'inventory management'], implies: ['operasyon'] },
    'operasyon': { aliases: ['operations'] },

    // ── Tasarım ──────────────────────────────────────────────────────────
    'figma': { implies: ['ui tasarımı'] },
    'sketch': { implies: ['ui tasarımı'] },
    'prototipleme': { aliases: ['prototyping'], implies: ['ui tasarımı'] },
    'ui tasarımı': { aliases: ['ui design', 'arayüz tasarımı'], implies: ['tasarım'] },
    'kullanıcı araştırması': { aliases: ['user research', 'ux araştırması'], implies: ['tasarım'] },
    'tasarım': { aliases: ['design'] },
};

// Yakınlık katsayıları. Yönlü ilişki bilinçli:
//   React bilen JavaScript bilir (yüksek), JavaScript bilen React bilmez (düşük).
const AFFINITY = {
    alias: 1,
    implies: 0.9,   // aday üstteki beceriye sahip → gereksinim fiilen karşılanıyor
    impliedBy: 0.4, // aday yalnızca alt/temel beceriye sahip → zayıf sinyal
    sibling: 0.6,   // aynı ebeveyni işaret eden iki araç — gerçekten transfer olur
};

/** term → kanonik ad (alias'lar çözülür). Bulunamazsa null. */
const ALIAS_INDEX = (() => {
    const index = new Map();
    for (const [canonical, node] of Object.entries(SKILL_NODES)) {
        index.set(canonical, canonical);
        for (const alias of node.aliases || []) index.set(alias, canonical);
    }
    return index;
})();

/**
 * Grafın TÜM yüzeyi: kanonik adlar + alias'lar.
 *
 * Yakınlık hesabı tek başına yetmiyor: gereksinim cümlesinden terimleri
 * çıkaran tarayıcı bu kelimeleri tanımıyorsa yakınlık hiç devreye girmez.
 * "CRM deneyimi" gereksinimi, sözlükte 'crm' yoksa hiçbir terim üretmez ve
 * o ilan skorlamaya hiç girmez — satış/İK/finans ilanlarında tam olarak bu
 * oluyordu.
 */
export const SKILL_VOCABULARY = [...ALIAS_INDEX.keys()];

export function canonicalSkill(term) {
    if (!term || typeof term !== 'string') return null;
    return ALIAS_INDEX.get(term.trim().toLowerCase()) || null;
}

/** Bir düğümün doğrudan ve dolaylı olarak ima ettiği her şey. */
function impliedClosure(canonical, seen = new Set()) {
    if (!canonical || seen.has(canonical)) return seen;
    seen.add(canonical);
    for (const next of SKILL_NODES[canonical]?.implies || []) {
        impliedClosure(next, seen);
    }
    return seen;
}

/**
 * Gereksinim terimi ile adayın yetenekleri arasındaki en güçlü yakınlık.
 *
 * @param {string} requirement — gereksinim terimi (ham metin olabilir)
 * @param {string[]} candidateSkills — adayın yetenekleri (ham metin olabilir)
 * @returns {number} 0..1
 */
export function skillAffinity(requirement, candidateSkills) {
    const reqCanonical = canonicalSkill(requirement);
    if (!reqCanonical || !Array.isArray(candidateSkills)) return 0;

    const reqClosure = impliedClosure(reqCanonical);
    let best = 0;

    for (const raw of candidateSkills) {
        const skill = canonicalSkill(raw);
        if (!skill) continue;

        if (skill === reqCanonical) return AFFINITY.alias;

        const skillClosure = impliedClosure(skill);
        // Aday becerisi gereksinimi ima ediyor mu? (react → javascript)
        if (skillClosure.has(reqCanonical)) {
            best = Math.max(best, AFFINITY.implies);
            continue;
        }
        // Gereksinim aday becerisini ima ediyor mu? (req next.js, aday react)
        if (reqClosure.has(skill)) {
            best = Math.max(best, AFFINITY.impliedBy);
            continue;
        }
        // Ortak ebeveyn — kardeş araçlar (amplitude ↔ mixpanel)
        const shared = [...skillClosure].some((s) => s !== skill && reqClosure.has(s));
        if (shared) best = Math.max(best, AFFINITY.sibling);
    }

    return best;
}

/** Test ve bakım için: graf kaç düğüm kapsıyor. */
export function skillGraphSize() {
    return Object.keys(SKILL_NODES).length;
}

/**
 * Graf bütünlüğü: `implies` ile işaret edilen her terim kendisi de düğüm
 * olmalı. Değilse canonicalSkill onu çözemez ve o dal sessizce ölü kalır —
 * 'bulut' eklenirken tam olarak bu oldu, aws/azure/gcp hiçbir yakınlık
 * üretmiyordu. Test bunu kalıcı olarak yakalar.
 */
export function danglingImplications() {
    const missing = new Set();
    for (const node of Object.values(SKILL_NODES)) {
        for (const target of node.implies || []) {
            if (!SKILL_NODES[target]) missing.add(target);
        }
    }
    return [...missing];
}
