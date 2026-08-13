// MÜLAKAT PLANI — neyin sorulacağına tarama karar verir.
//
// Tarama zaten her aday için neyin belirsiz olduğunu biliyor: hangi zorunlu
// madde karşılanmıyor, hangisi kısmen, hangi maddede "karşılıyor ama fark
// var" notu düşülmüş, hangi STAR boyutunda kanıt zayıf. Mülakat tam da bu
// belirsizlikleri çözecek araç.
//
// Buna rağmen mevcut soru üreticileri ham CV'den üretiyordu: aynı pozisyona
// başvuran iki aday, biri zorunlu maddelerin hepsini karşılasa diğeri üçünü
// karşılamasa bile aynı soruları alıyordu. Mülakat, taramanın bıraktığı
// soruyu sormuyordu.
//
// AYRIM: bu dosya NE sorulacağına karar verir — hangi madde, hangi öncelik,
// kaç dakika. AI yalnızca o maddeyi Türkçe bir soruya çevirir. Öncelik ve
// süre modele bırakılsaydı plan her çalıştırmada değişirdi; oysa aynı tarama
// aynı planı vermeli.

import { requirementsOf, requirementsFingerprint } from './positionRequirements';

/** Plan şeması — kural değişirse artar, kayıtlı planlar ayırt edilebilsin. */
export const PLAN_SCHEMA = 1;

// ── Öncelik kademeleri ───────────────────────────────────────────────────────
// Sıra kritik: bir mülakatta zaman biterse ALTTAKİLER düşer. O yüzden kademe
// "ne kadar önemli" değil, "kesilirse en az zararı hangisi verir" sorusunun
// cevabı. Zorunlu bir maddenin karşılanıp karşılanmadığını bilmeden görüşmeden
// çıkmak, tercih edilen bir maddeyi hiç sormamaktan çok daha pahalı.
export const CRITICAL = 'kritik';
export const HIGH = 'yuksek';
export const MEDIUM = 'orta';
export const LOW = 'dusuk';

/**
 * DOĞRULAMA — karşılanan zorunlu maddeyi odada teyit etmek.
 *
 * Plan başta yalnızca AÇIK maddeleri soruyordu ve bu, canlıda 30 dakikalık
 * bir görüşmeye üç soru üretti: kalan 8 dakika boşta kaldı. Aday %79 almıştı,
 * yani maddelerin çoğu "karşılanıyor" damgalıydı ve sistem "sorulacak bir şey
 * yok" diyordu.
 *
 * Ama karşılanıyor damgası CV'ye dayanıyor. Zorunlu bir maddenin tek kanıtı
 * bir belgeyse, onu odada teyit etmek boş geçmekten iyidir — hele vakit
 * varken.
 *
 * EN SONDA duruyor: açık maddeler her zaman önce sorulur, doğrulama yalnızca
 * artan zamana girer. Kısa bir görüşmede hiç görünmez.
 */
export const VERIFY = 'dogrulama';

const PRIORITY_ORDER = [CRITICAL, HIGH, MEDIUM, LOW, VERIFY];

/**
 * Kademe başına ayrılan dakika.
 *
 * İlk değerler (8/6/4/3) fazla cömertti: kullanıcı 30 dakikalık bir görüşme
 * için yalnızca ÜÇ soru çıktığını bildirdi ve haklıydı. Bir maddeyi STAR
 * derinliğinde konuşmak — soru, cevap, bir derinleştirme — 5-6 dakika sürer,
 * 8 değil.
 */
const MINUTES_BY_PRIORITY = {
    [CRITICAL]: 6,
    [HIGH]: 5,
    [MEDIUM]: 4,
    [LOW]: 3,
    // Doğrulama kısa: "bunu gerçekten siz mi yaptınız" sorusu bir örnekle
    // cevaplanır, STAR derinliği gerekmez.
    [VERIFY]: 3,
};

/**
 * Açılış ve kapanış — soru bütçesinden ÖNCE ayrılır.
 *
 * Eski değerler 5 ve 8'di: 30 dakikalık bir görüşmenin 13 dakikası, yani
 * %43'ü soru sorulmayan zamana gidiyordu. Tanışma üç dakikada olur; adayın
 * soruları ve sonraki adım beş dakikada.
 */
export const OPENING_MINUTES = 3;
export const CLOSING_MINUTES = 5; // adayın soruları + sonraki adım

const STAR_KEYS = ['Situation', 'Task', 'Action', 'Result'];

/**
 * STAR boyutu adı → mülakatta ne yapılacağı.
 * Kanıt zayıflığı adayın niteliği değil, CV'nin suskunluğudur; odada
 * kapatılabilir. O yüzden düşük STAR bir eksik değil, bir SORU.
 */
const STAR_PROBE = {
    Situation: {
        label: 'Bağlam',
        why: "CV'de çalıştığı ortamın büyüklüğü ve koşulları anlatılmamış.",
    },
    Task: {
        label: 'Sorumluluk',
        why: 'Neyin sahibi olduğu, neye yalnızca katkı verdiği ayrışmıyor.',
    },
    Action: {
        label: 'Yaptığı iş',
        why: 'Somut adımlar yerine rol adı ve görev tanımı yazılmış.',
    },
    Result: {
        label: 'Sonuç',
        why: 'Yaptığı işin ne değiştirdiği ölçülmemiş — en sık rastlanan boşluk.',
    },
};

/** Analiz kaydından madde değerlendirmeleri (iki olası yerleşim). */
function assessmentsOf(analysis) {
    const direct = analysis?.requirementCoverage?.assessments;
    if (Array.isArray(direct)) return direct;
    const nested = analysis?.scoreData?.requirementCoverage?.assessments;
    return Array.isArray(nested) ? nested : null;
}

/** STAR puanı — hem {score: 2} hem düz sayı biçimini kabul eder. */
function starScore(raw) {
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : Number(raw?.score);
    return Number.isFinite(n) ? n : null;
}

function clean(raw) {
    const text = String(raw ?? '').trim();
    if (!text || text === '-' || text.toLowerCase() === 'yok') return '';
    return text;
}

/**
 * Bir maddenin kademesi ve neden sorulduğu.
 *
 * `must === null` (işaretlenmemiş eski ilan) zorunlu SAYILMAZ — skorlamadaki
 * geriye dönük nötrlüğün aynısı. İşaretlenmemiş bir listeyi zorunluymuş gibi
 * ele almak, kullanıcının hiç vermediği bir kararı ona atfetmek olur.
 */
function classify({ must, status, gap }) {
    const isMust = must === true;

    if (status === 'missing') {
        return isMust
            ? { priority: CRITICAL, why: 'Zorunlu madde, CV\'de karşılığı bulunamadı. Kapı burada açılır ya da kapanır.' }
            : { priority: MEDIUM, why: 'Tercih edilen madde, CV\'de karşılığı yok. Varsa öğrenmeye değer.' };
    }
    if (status === 'partial') {
        return isMust
            ? { priority: HIGH, why: 'Zorunlu madde kısmen karşılanıyor. Analog alandan mı geliyor, yoksa dar kapsamdan mı — mülakat ayırır.' }
            : { priority: LOW, why: 'Tercih edilen madde kısmen karşılanıyor.' };
    }
    if (status === 'met' && gap) {
        return isMust
            ? { priority: MEDIUM, why: `Karşılıyor ama taramada fark notu var: ${gap}` }
            : { priority: LOW, why: `Karşılıyor ama taramada fark notu var: ${gap}` };
    }
    // ZORUNLU + karşılanıyor + fark notu yok → DOĞRULAMA.
    //
    // Eskiden buradan null dönüyordu ve madde plandan tamamen düşüyordu.
    // Canlıda sonucu şuydu: %79 alan bir aday için 30 dakikalık görüşmeye
    // yalnızca 3 soru çıktı, 8 dakika boşta kaldı.
    //
    // "Karşılıyor" damgası CV'ye dayanıyor. Zorunlu bir maddenin tek kanıtı
    // bir belgeyse odada teyit etmek boş geçmekten iyi — ama açık maddelerin
    // ARDINDAN, artan zamanda.
    if (status === 'met' && isMust) {
        return {
            priority: VERIFY,
            why: 'Zorunlu madde karşılanıyor ama kanıt yalnızca CV\'de. Vakit varsa odada teyit edin.',
        };
    }
    // Tercih edilen madde karşılanıyor ve fark yok — mülakat vakti harcamaya
    // değmez.
    return null;
}

/**
 * Zaman bütçesi. Açılış ve kapanış sabit; kalanı kademe sırasıyla dağıtılır.
 *
 * ÖNCELİK MUTLAKTIR — sığmayan bir maddeyi atlayıp altındakini almak YOK.
 * İlk yazdığım hâli açgözlüydü ve testler bunu yakaladı: 20 dakikalık bir
 * görüşmede iki kritik zorunlu madde (8'er dakika) bütçeye sığmıyor, ama
 * "GA4 hakimiyeti" (3 dakika) sığıyordu. Plan, zorunluları atlayıp tercih
 * edilen bir maddeyi soruyordu. Sığmayan yerde dururuz.
 *
 * EN AZ BİR SORU KALIR: sıfır soruluk bir plan plan değildir. En yüksek
 * öncelikli madde bütçeyi aşsa bile korunur ve `overBudget` ile işaretlenir —
 * mülakatçı "bu görüşme dar" bilgisini alır, boş bir liste değil.
 *
 * SESSİZ KIRPMA YOK: sığmayanlar `dropped` olarak döner ve arayüz sayar.
 * "Her şeyi kapsıyor" gibi görünüp zorunlu bir maddeyi atlayan bir plan,
 * plan olmamasından kötüdür.
 */
function fitToBudget(candidates, totalMinutes) {
    const available = Math.max(0, totalMinutes - OPENING_MINUTES - CLOSING_MINUTES);
    const kept = [];
    let used = 0;

    for (let i = 0; i < candidates.length; i++) {
        const probe = candidates[i];
        const cost = MINUTES_BY_PRIORITY[probe.priority];
        const fits = used + cost <= available;
        if (!fits && kept.length > 0) break;

        kept.push({ ...probe, minutes: cost });
        used += cost;
        if (!fits) break; // ilk madde bütçeyi aştı — korundu ama devamı yok
    }

    return {
        kept,
        dropped: candidates.slice(kept.length),
        used,
        available,
        overBudget: used > available,
    };
}

/**
 * Adayın bu pozisyondaki taramasından mülakat planı çıkarır.
 *
 * BAYAT ANALİZDE PLAN ÜRETİLMEZ. Değerlendirmeler madde NUMARASINA bağlı;
 * gereksinim listesi taramadan sonra değiştiyse o numara başka bir maddeye
 * denk gelir. Skor, kırılım ve zorunlu kapısında tam olarak bu hata görüldü —
 * plan da aynı hatayı yapıp mülakatçıyı yanlış maddeyi sormaya gönderirdi,
 * üstelik bu sefer hata odada, adayın karşısında ortaya çıkardı.
 *
 * @param {object} analysis — candidate.positionAnalyses[position.title]
 * @param {object} position
 * @param {{minutes?: number}} options
 * @returns {{
 *   schema: number,
 *   scanned: boolean,
 *   stale: boolean,
 *   probes: Array<object>,
 *   starGaps: Array<{key: string, label: string, score: number, why: string}>,
 *   dropped: Array<object>,
 *   minutes: {total: number, opening: number, probes: number, closing: number, slack: number},
 *   fingerprint: string|null
 * }}
 */
export function buildInterviewPlan(analysis, position, { minutes = 45 } = {}) {
    const empty = {
        schema: PLAN_SCHEMA,
        scanned: false,
        stale: false,
        probes: [],
        starGaps: [],
        dropped: [],
        minutes: { total: minutes, opening: OPENING_MINUTES, probes: 0, closing: CLOSING_MINUTES, slack: 0 },
        fingerprint: null,
    };

    const assessments = assessmentsOf(analysis);
    if (!assessments || assessments.length === 0) return empty;

    const fingerprint = requirementsFingerprint(position);
    if (analysis?.requirementsFingerprint !== fingerprint) {
        return { ...empty, scanned: true, stale: true, fingerprint };
    }

    const requirements = requirementsOf(position);
    const byIndex = new Map();
    for (const a of assessments) {
        const idx = Number(a?.index);
        if (!Number.isFinite(idx)) continue;
        byIndex.set(idx, a);
    }

    // ── Madde bazlı sondalar
    const candidates = [];
    requirements.forEach((req, i) => {
        const index = i + 1;
        const a = byIndex.get(index);
        if (!a) return;
        const status = String(a.status || '').toLowerCase();
        const gap = clean(a.gap);
        const verdict = classify({ must: req.must, status, gap });
        if (!verdict) return;

        candidates.push({
            requirementIndex: index,
            text: req.text,
            must: req.must === true,
            status,
            gap,
            evidence: clean(a.evidence),
            note: clean(a.note),
            priority: verdict.priority,
            why: verdict.why,
        });
    });

    // Kademe sırası, kademe içinde madde numarası — aynı tarama aynı planı
    // versin diye sıralama tamamen deterministik.
    candidates.sort((a, b) => {
        const d = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        return d !== 0 ? d : a.requirementIndex - b.requirementIndex;
    });

    const { kept, dropped, used, available, overBudget } = fitToBudget(candidates, minutes);

    // ── STAR boşlukları
    // Bunlar madde sorusu DEĞİL, dinleme talimatı: mülakatçı hangi boyutta
    // bastıracağını bilsin. Ayrı bir soru olarak zaman harcamıyorlar.
    const starGaps = STAR_KEYS
        .map((key) => ({ key, score: starScore(analysis?.starAnalysis?.[key]) }))
        .filter((d) => d.score !== null && d.score <= 1)
        .map((d) => ({ key: d.key, label: STAR_PROBE[d.key].label, score: d.score, why: STAR_PROBE[d.key].why }));

    return {
        schema: PLAN_SCHEMA,
        scanned: true,
        stale: false,
        probes: kept,
        starGaps,
        dropped,
        minutes: {
            total: minutes,
            opening: OPENING_MINUTES,
            probes: used,
            closing: CLOSING_MINUTES,
            slack: Math.max(0, available - used),
            overBudget,
        },
        fingerprint,
    };
}

/**
 * Adayın bu pozisyon için KAYITLI planı — hâlâ geçerliyse.
 *
 * Plan üretildiği andaki gereksinim listesinin parmak izini taşır. İlan o
 * günden sonra değiştiyse plandaki madde numaraları artık başka maddelere
 * denk gelir; saklanmış olması geçerli olduğu anlamına gelmez.
 *
 * Bugün aynı hatanın dört ayrı görünümünü düzelttik. Kayıtlı plan beşincisi
 * olurdu ve en sinsisi: ekranda "hazır plan" yazıp mülakatçıyı yanlış maddeyi
 * sormaya gönderirdi.
 *
 * @returns {object|null}
 */
export function savedPlanFor(candidate, position) {
    // Tek kaynak: kararı planStatus veriyor, bu yalnızca planı çıkarıyor.
    // İki ayrı kontrol yazılsaydı biri "kullanılabilir" derken diğeri
    // "kullanılamaz" diyebilirdi.
    return planStatus(candidate, position).plan;
}

/**
 * Kayıtlı plan neden kullanılamıyor?
 *
 * `savedPlanFor` yalnızca null döndürüyordu ve sebebi yutuyordu. Canlıda
 * bedeli şu oldu: kullanıcı manuel görüşmeyi kaydetti, AI çağrıları yapıldı,
 * para gitti ve ancak SONUNDA "sorular ilanın maddelerine bağlı değil"
 * yazısını gördü. Hangi sebeple bağlı olmadığı da yazmıyordu.
 *
 * Dört ayrı durum, dört ayrı eylem gerektiriyor. Arayüz bunu KAYDETMEDEN
 * ÖNCE söyleyebilsin diye ayrıştırılıyor.
 *
 * @returns {{ok: boolean, reason: string, plan: object|null}}
 */
export function planStatus(candidate, position) {
    const title = position?.title;
    if (!title) {
        return { ok: false, reason: 'no-position', plan: null };
    }
    const plan = candidate?.interviewPlans?.[title];
    if (!plan || !Array.isArray(plan.probes) || plan.probes.length === 0) {
        return { ok: false, reason: 'no-plan', plan: null };
    }
    if (plan.fingerprint !== requirementsFingerprint(position)) {
        // Plan üretildikten sonra ilan değişmiş. Madde numaraları artık başka
        // maddelere denk geliyor; kullanmak cevabı yanlış maddeye yazardı.
        return { ok: false, reason: 'stale-plan', plan: null };
    }
    return { ok: true, reason: 'ok', plan };
}

/** Her sebebin kullanıcıya söylediği şey — ve ne yapması gerektiği. */
export const PLAN_STATUS_TEXT = {
    'no-position': 'Pozisyon seçilmedi. Madde bazlı sonuç için görüşmenin hangi ilana ait olduğu gerekiyor.',
    'no-plan': 'Bu aday için bu ilana ait kayıtlı mülakat planı yok. Aday sayfasındaki '
        + 'Mülakat Planı bölümünden "Soruları yaz" deyin; sorular buraya kendiliğinden gelir.',
    'stale-plan': 'Kayıtlı plan ilanın ESKİ hâline ait — ilan o günden beri değişti. '
        + 'Planı yeniden üretin, yoksa cevaplar yanlış maddelere yazılır.',
};

/**
 * Planı odaya götürülebilir düz metne çevirir.
 *
 * Mülakat ekran başında yapılmıyor: kullanıcı planı kopyalayıp yazdıracak ya
 * da telefonuna alacak. Bu yüzden çıktı biçimlendirme değil, OKUNABİLİRLİK
 * için düzenleniyor — hangi maddeyi neden sorduğu, kaç dakika ayıracağı ve
 * iyi cevabın neye benzediği yan yana dursun.
 *
 * @param {object} plan — buildInterviewPlan çıktısı
 * @param {Array} probes — soru metni eklenmiş sondalar (generateProbeQuestions)
 * @param {{candidateName?: string, positionTitle?: string}} meta
 */
export function planToText(plan, probes, { candidateName = '', positionTitle = '' } = {}) {
    if (!plan?.scanned || plan.stale) return '';

    const lines = [];
    lines.push(`MÜLAKAT PLANI — ${candidateName || 'Aday'}`);
    if (positionTitle) lines.push(`Pozisyon: ${positionTitle}`);
    lines.push(`Süre: ${plan.minutes.total} dakika`);
    lines.push('');
    lines.push(`[${plan.minutes.opening} dk] AÇILIŞ — tanışma, sürecin akışı, adayın son rolü`);
    lines.push('');

    (probes || []).forEach((p, i) => {
        // Etiket OLDUĞU GİBİ yazılıyor. `.toUpperCase()` çağırmak cazipti ama
        // JS'in Türkçesi yok: 'Kritik'.toUpperCase() → 'KRITIK', noktasız I ile.
        // Aynı tuzağa bugün beşinci kez düşüldü; dönüşüm yapmamak en temizi.
        const tier = priorityLabel(p.priority).text;
        lines.push(`${i + 1}. [${p.minutes} dk] [${tier}] ${p.text}${p.must ? ' (ZORUNLU)' : ''}`);
        lines.push(`   Neden: ${p.why}`);
        // Soru YAZILMAMIŞ olabilir — kullanıcı "Soruları yaz"a basmamış ya da
        // AI çağrısı hiç yapılamamış olabilir (canlıda oldu: harcama tavanı).
        // Böyle bir durumda plan yine de işe yarar; hangi maddeyi neden
        // soracağını söylüyor. Ama `${undefined}` basmak planı çöpe çevirir.
        if (p.question) {
            lines.push(`   SORU: ${p.question}`);
        } else {
            lines.push('   SORU: (yazılmadı — bu maddeyi kendi sözlerinizle sorun)');
        }
        if (p.followUp) lines.push(`   Yüzeysel kalırsa: ${p.followUp}`);
        if (p.listenFor) lines.push(`   İyi cevapta: ${p.listenFor}`);
        lines.push('');
    });

    if (plan.starGaps.length > 0) {
        lines.push('DİNLERKEN BASTIR — CV bu boyutlarda suskun:');
        for (const g of plan.starGaps) lines.push(`   · ${g.label}: ${g.why}`);
        lines.push('');
    }

    if (plan.dropped.length > 0) {
        lines.push(`SÜREYE SIĞMADI (${plan.dropped.length} madde) — ikinci görüşmeye:`);
        for (const d of plan.dropped) lines.push(`   · ${d.text}${d.must ? ' (ZORUNLU)' : ''}`);
        lines.push('');
    }

    lines.push(`[${plan.minutes.closing} dk] KAPANIŞ — adayın soruları, sonraki adım ve zamanlama`);
    return lines.join('\n');
}

/** Kademe rozetinin metni ve tonu. */
export function priorityLabel(priority) {
    switch (priority) {
        case CRITICAL: return { text: 'Kritik', tone: 'red' };
        case HIGH: return { text: 'Yüksek', tone: 'amber' };
        case MEDIUM: return { text: 'Orta', tone: 'sky' };
        case LOW: return { text: 'Düşük', tone: 'slate' };
        case VERIFY: return { text: 'Doğrulama', tone: 'emerald' };
        default: return { text: '—', tone: 'slate' };
    }
}

/**
 * Planın tek satırlık özeti — düğmenin yanında gösterilir.
 * "Plan hazırla" demeden önce kullanıcı neyle karşılaşacağını bilsin.
 */
export function planSummary(plan) {
    if (!plan?.scanned) return 'Bu pozisyon için derin tarama yapılmamış.';
    if (plan.stale) return 'Tarama eski gereksinim listesine ait — önce yeniden tarayın.';
    // "Sorulacak bir şey yok" ile "sorulacak vardı ama süre yetmedi" farklı
    // haberler; ikisini aynı cümleyle geçmek planı olduğundan tam gösterir.
    if (plan.probes.length === 0 && plan.dropped.length === 0) {
        return 'Taramada açık kalan madde yok; plan yalnızca doğrulama içerir.';
    }

    const critical = plan.probes.filter((p) => p.priority === CRITICAL).length;
    const verify = plan.probes.filter((p) => p.priority === VERIFY).length;
    const parts = [`${plan.probes.length} madde`];
    if (critical > 0) parts.push(`${critical} kritik`);
    // Doğrulama soruları "açık madde" değil; sayıyı okuyan kişi bunu bilmeli
    // ki 5 sorunun 2'sinin teyit olduğunu anlasın.
    if (verify > 0) parts.push(`${verify} doğrulama`);
    if (plan.dropped.length > 0) parts.push(`${plan.dropped.length} madde süreye sığmadı`);
    return parts.join(' · ');
}
