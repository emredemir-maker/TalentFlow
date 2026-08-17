// ASİSTANIN KONUŞMA BELLEĞİ — önceki turların modele geri gönderilen özeti.
//
// Panel `turns` dizisini zaten tutuyordu ama modele HİÇ göndermiyordu: her soru
// sıfırdan başlıyordu. "Peki onlardan İstanbul'da olanlar?" çalışmıyordu, çünkü
// asistan "onlar"ın kim olduğunu bilmiyordu. Asistanın statik hissettirmesinin
// en büyük sebebi buydu.
//
// ── NE GÖNDERİLİR, NE GÖNDERİLMEZ ───────────────────────────────────────────
// Bağlama giren: kullanıcının SORUSU, üretilen SORGU ve sonucun SAYILARI.
// Bağlama girmeyen: ADAY ADLARI ve ham CV metni.
//
// Ad göndermemek bilinçli. Aday adı CV'den geliyor ve CV bu projede GÜVENİLMEZ
// veri sayılıyor — bir adayın kendini "önceki talimatları yok say" diye
// adlandırması engellenemez. Çevirmen çağrısı bugüne kadar hiç CV kökenli metin
// görmedi; bellek eklerken bu sınırı delmenin bir sebebi yok. Üstelik gerek de
// yok: "onlardan İstanbul'da olanlar" sorusunu cevaplamak için önceki
// FİLTRELER yeterli, adlar değil.

/** Bağlama alınacak en fazla soru-cevap çifti. */
export const MAX_CONTEXT_TURNS = 6;

/** Bağlamın karakter tavanı — tavana değince en ESKİ çift düşer. */
export const MAX_CONTEXT_CHARS = 2000;

/** Depolanacak en fazla tur — sohbet belgesi sınırsız büyümesin. */
export const MAX_STORED_TURNS = 40;

/**
 * Sorgu nesnesinden yalnızca "ne sorulmuştu" bilgisini bırakır.
 *
 * `unsupported` taşınmaz: o bir hata açıklaması, sorgunun parçası değil.
 */
export function compactSpec(spec) {
    if (!spec || typeof spec !== 'object') return null;
    const out = {};
    // Hangi araç çalıştı — takip sorusu araç değiştiriyorsa model bunu bilmeli.
    if (spec.tool) out.tool = spec.tool;
    if (spec.intent) out.intent = spec.intent;
    if (spec.position) out.position = spec.position;
    if (Array.isArray(spec.filters) && spec.filters.length > 0) out.filters = spec.filters;
    if (spec.sort) out.sort = spec.sort;
    if (Number.isFinite(Number(spec.limit))) out.limit = Number(spec.limit);
    if (spec.groupBy) out.groupBy = spec.groupBy;
    return Object.keys(out).length > 0 ? out : null;
}

/**
 * Turlardan modele gidecek bağlamı kurar.
 *
 * @param {Array} turns — panelin tuttuğu tur dizisi
 * @param {{maxTurns?: number, maxChars?: number}} [limits]
 * @returns {Array<{soru: string, sorgu: object|null, sonuc: object|null, cevaplanamadi?: boolean}>}
 */
export function buildContext(turns = [], limits = {}) {
    const { maxTurns = MAX_CONTEXT_TURNS, maxChars = MAX_CONTEXT_CHARS } = limits;
    const list = Array.isArray(turns) ? turns : [];
    const pairs = [];

    for (let i = 0; i < list.length - 1; i += 1) {
        const q = list[i];
        const a = list[i + 1];
        if (q?.role !== 'user' || a?.role !== 'assistant') continue;
        // Hatayla biten tur bağlama girmez: başarısız bir sorguyu "önceki
        // sorgu" diye sunmak, modeli olmayan bir sonuca atıf yapmaya iter.
        if (a.error) continue;
        pairs.push({
            soru: String(q.text || '').slice(0, 300),
            sorgu: compactSpec(a.spec),
            sonuc: a.result
                ? { pozisyon: a.result.positionTitle || null, eslesen: a.result.total ?? null }
                : null,
            ...(a.unsupported ? { cevaplanamadi: true } : {}),
        });
    }

    let recent = pairs.slice(-maxTurns);
    // Karakter tavanı: en ESKİ çiftten düşürerek in. Yeni turlar her zaman
    // kalır — kullanıcının az önce sorduğu şey bağlamın en değerli parçası.
    while (recent.length > 1 && JSON.stringify(recent).length > maxChars) {
        recent = recent.slice(1);
    }
    return recent;
}

/**
 * Mülakat incelemesinin EKRANDA KULLANILAN parçası.
 *
 * `perCandidate` alıntılarıyla birlikte büyük ve ekranda hiç gösterilmiyor;
 * saklanan yalnızca panelin okuduğu sayılar.
 */
function compactReview(review) {
    return {
        position: review.position ?? null,
        interviewCount: review.interviewCount ?? 0,
        scored: review.scored ?? 0,
        tally: review.tally || { met: 0, partial: 0, missing: 0, inconclusive: 0 },
        unscored: (Array.isArray(review.unscored) ? review.unscored : [])
            .map((u) => ({ name: String(u?.name || ''), reason: String(u?.reason || '') })),
        staleCount: review.staleCount ?? 0,
    };
}

/**
 * Google'ın arama önerisi bloğu için tavan.
 *
 * Blok grounding kullanıldığında OLDUĞU GİBİ gösterilmek zorunda — süs değil,
 * kullanım şartı. Kırpılmış HTML bozuk render eder; tavana sığmıyorsa cevabın
 * TAMAMI saklanmaz ve tur "ayrıntısı saklanmadı" der. Kaynakları gösterip
 * şartı düşürmek, iki kötüden kötü olanı.
 */
export const MAX_SUGGESTION_HTML = 8000;

/** Piyasa araştırmasının saklanabilir hâli; şart sığmıyorsa null. */
function compactMarket(market) {
    const html = String(market.searchSuggestionHtml || '');
    if (html.length > MAX_SUGGESTION_HTML) return null;
    return {
        band: market.band || null,
        withheld: Boolean(market.withheld),
        grounded: Boolean(market.grounded),
        date: String(market.date || ''),
        scope: String(market.scope || ''),
        benefits: (Array.isArray(market.benefits) ? market.benefits : []).map(String).slice(0, 8),
        caution: String(market.caution || ''),
        sources: (Array.isArray(market.sources) ? market.sources : [])
            .slice(0, 6)
            .map((s) => ({ title: String(s?.title || ''), uri: String(s?.uri || '') })),
        searchSuggestionHtml: html,
        query: market.query || null,
    };
}

/**
 * Turları Firestore'a yazılabilir hâle getirir.
 *
 * Canlı `result.rows` her adayın TAM belgesini taşıyor (cvText dahil). Onu
 * olduğu gibi yazmak hem 1MB belge sınırını zorlar hem de aday verisini
 * gereksiz yere ikinci bir yere kopyalar. Ekranın gerçekten kullandığı alanlar
 * kalır: id, ad, konum, puan.
 *
 * ── ARAÇ ÇIKTISI SAKLANMAZSA TUR ÇÖKER ──────────────────────────────────────
 * Burası uzun süre yalnızca aday sorgusunu tanıdı. Mülakat incelemesi turu
 * kaydedilirken `review` düşüyor, sayfa yenilenince panel o turu aday sorgusu
 * sanıp `result.groups` okumaya çalışıyor ve TÜM sohbet çöküyordu. Yeni bir
 * araç eklenirken çıktısının buraya da eklenmesi gerekiyor; eklenmezse tur
 * sessizce boşalır.
 */
export function serializeTurns(turns = [], maxTurns = MAX_STORED_TURNS) {
    const list = (Array.isArray(turns) ? turns : []).slice(-maxTurns);
    return list.map((t) => {
        if (t?.role === 'user') return { role: 'user', text: String(t.text || '') };
        const out = { role: 'assistant' };
        if (t?.comment) out.comment = String(t.comment);
        if (t?.unsupported) out.unsupported = String(t.unsupported);
        if (t?.error) out.error = String(t.error);
        // Verilmiş geri bildirim korunur: sayfa yenilenince düğmeler yeniden
        // boş görünürse kullanıcı aynı cevaba ikinci kez oy verir ve sayım
        // bozulur.
        if (t?.feedback) out.feedback = String(t.feedback);
        const spec = compactSpec(t?.spec);
        if (spec) out.spec = spec;
        // Soru turda saklanır: pozisyon seçici aynı soruyu yeniden çalıştırıyor.
        if (t?.question) out.question = String(t.question).slice(0, 300);

        if (t?.review) {
            out.review = compactReview(t.review);
            out.loaded = {
                matchedCandidates: t.loaded?.matchedCandidates ?? 0,
                withoutInterview: t.loaded?.withoutInterview ?? 0,
                truncated: t.loaded?.truncated ?? 0,
                totalSessions: t.loaded?.totalSessions ?? 0,
            };
            if (t.narration) out.narration = t.narration;
            if (t.narrationError) out.narrationError = String(t.narrationError);
        }

        // Taslak olduğu gibi saklanır: küçük bir nesne ve kullanıcı sayfayı
        // yenileyince onayladığı maddeleri kaybetmemeli. Düzeltme isteği de
        // en son taslağın üstüne çalışıyor — saklanmazsa "zorunluları üçe
        // indir" sıfırdan yeni bir ilan üretir.
        if (t?.draft) out.draft = t.draft;

        if (t?.market) {
            const market = compactMarket(t.market);
            // Google'ın gösterim şartı sığmadıysa cevabı hiç saklamıyoruz;
            // tur bunu söyleyecek. Sessizce yarısını göstermek olmaz.
            if (market) out.market = market;
            else out.detailOmitted = true;
        }
        if (t?.result) {
            const r = t.result;
            out.result = {
                positionTitle: r.positionTitle || null,
                pool: r.pool ?? 0,
                total: r.total ?? 0,
                skipped: r.skipped ?? 0,
                truncated: Boolean(r.truncated),
                limit: r.limit ?? null,
                applied: Array.isArray(r.applied) ? r.applied : [],
                ignored: Array.isArray(r.ignored) ? r.ignored : [],
                groups: Array.isArray(r.groups) ? r.groups : null,
                rows: (Array.isArray(r.rows) ? r.rows : []).map((v) => ({
                    score: Number.isFinite(v?.score) ? v.score : null,
                    candidate: {
                        id: v?.candidate?.id || '',
                        name: v?.candidate?.name || '',
                        location: v?.candidate?.location || '',
                    },
                })),
            };
        }
        return out;
    });
}
