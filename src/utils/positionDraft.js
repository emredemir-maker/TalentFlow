// POZİSYON TASLAĞI — modelin ürettiği ilanın KOD TARAFI.
//
// Asistan artık bir taslak üretebiliyor. Bu, projede modelin ilk kez METİN
// ÖNERDİĞİ yer: bugüne kadar hep kodun hesapladığı sayıyı anlatıyordu.
// Yeni bir risk açıyor ve kural aynı kalıyor: MODEL ÖNERİR, KULLANICI KAYDEDER.
// Asistan `positions` koleksiyonuna hiçbir koşulda kendi başına yazmaz.
//
// ── HER MADDE NEREDEN GELDİ ─────────────────────────────────────────────────
// Bir taslak, tanımı gereği kullanıcının söylemediği şeyler önerir — yoksa
// taslak değil, dikte olurdu. Tehlike şurada: "3-5 yıl deneyim" gibi bir madde
// makul görünür, kullanıcı onu kendi yazmış sanır ve o madde GERÇEK ADAYLARI
// eler. O yüzden her madde kaynağını taşır: kullanıcı mı söyledi, model mi
// önerdi. Ekran ikisini ayrı gösterir; onaylanan şeyin ne olduğu görünür.
//
// ── DENETİM MODELDE DEĞİL KODDA ─────────────────────────────────────────────
// Prompt'a "öncelik kelimesini metne yazma" demek bir dilek. `lintDraft` onu
// ölçer: metinde kalmış bir 'tercihen', damgalama yapan modele işaretle
// ÇELİŞEN bir sinyal verir ve model metne inanır (aynı gerekçe:
// services/ai/requirementNormalizer.js).

import { foldTr } from './turkishText';
import { normalizeBand } from './salaryBand';

/** Taslakta en fazla kaç madde olur. */
export const MAX_ITEMS = 20;

/** Bundan uzun madde muhtemelen birden çok şey soruyor. */
export const MAX_ITEM_CHARS = 140;

/**
 * Bundan fazla zorunlu madde havuzu daraltır.
 *
 * Sayı keyfi değil: bu projedeki gözden geçirme paneli zorunlu maddelerin
 * adayları elemesini zaten ölçüyor ve canlıda 34 adayın 31'ini eleyen bir
 * zorunlu madde görüldü. Taslak aşamasında ölçüm yok, o yüzden yalnızca
 * UYARIRIZ — engellemeyiz.
 */
export const MANY_MUST = 5;

/**
 * Öncelik ifadeleri MADDE METNİNDE durmamalı; `must` işaretine taşınmalı.
 * Metinde kalırsa değerlendirme yapan model işarete değil metne inanır.
 */
// Liste gerçek bir ilandan büyüdü: "B2B SaaS deneyimi güçlü artı" ifadesi
// zorunlu bir maddenin İÇİNDE duruyordu ve 'artı olur' kalıbına uymadığı için
// yakalanmıyordu.
const PRIORITY_WORDS = [
    'tercihen', 'tercih sebebi', 'tercih edilir', 'zorunlu', 'şart',
    'artı olur', 'güçlü artı', 'artı sağlar', 'olmazsa olmaz',
    'nice to have', 'must have',
];

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const strList = (v, max, count) => (Array.isArray(v) ? v : [])
    .map((x) => str(x, max))
    .filter(Boolean)
    .slice(0, count);

/**
 * Modelin ürettiği ham taslağı güvenli hâle getirir.
 *
 * @returns {object|null} başlığı ve maddesi olmayan taslak yoktur.
 */
export function normalizeDraft(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((it) => ({
            text: str(it?.text, 300),
            must: it?.must === true,
            // KAYNAK VARSAYILANI "model". Kullanıcının söylediğini model
            // işaretlemeyi unutursa madde "öneri" görünür — yanlış tarafa
            // düşmesi gereken yön bu: kullanıcı fazladan bir maddeyi gözden
            // geçirir, eksik gözden geçirmez.
            source: (it?.source === 'kullanici' || it?.source === 'user') ? 'user' : 'model',
        }))
        .filter((it) => it.text)
        .slice(0, MAX_ITEMS);

    const title = str(raw.title, 120);
    if (!title && items.length === 0) return null;

    return {
        title,
        department: str(raw.department, 80),
        // İlan METNİ değil özet — form da 280-320 karakter bekliyor.
        summary: str(raw.summary, 320),
        level: str(raw.level, 40),
        location: str(raw.location, 80),
        items,
        // Modelin neyi VARSAYDIĞI ve kullanıcının neyi SÖYLEMEDİĞİ ayrı durur:
        // biri modelin sorumluluğu, diğeri kullanıcıya sorulacak şey.
        assumptions: strList(raw.assumptions, 200, 6),
        gaps: strList(raw.gaps, 200, 6),
        band: normalizeBand(raw.band) || null,
        // Bandın nereden geldiği: piyasa araştırması mı, kendi ilanlarınız mı.
        bandSource: raw.bandSource === 'market' || raw.bandSource === 'internal' ? raw.bandSource : null,
    };
}

/**
 * Taslağın KOD TARAFINDAN ölçülebilen kusurları.
 *
 * Hiçbiri kaydetmeyi engellemez — bunlar yargı değil gözlem. Engellemek,
 * kullanıcının kendi ilanı hakkındaki kararını sisteme devretmek olurdu.
 *
 * @returns {Array<{code: string, level: 'warn'|'info', text: string, index?: number}>}
 */
export function lintDraft(draft) {
    const items = draft?.items || [];
    const out = [];

    const seen = new Map();
    items.forEach((item, i) => {
        const folded = foldTr(item.text);

        const hit = PRIORITY_WORDS.find((w) => folded.includes(foldTr(w)));
        if (hit) {
            out.push({
                code: 'priority-in-text', level: 'warn', index: i,
                text: `${i + 1}. maddede "${hit}" ifadesi metinde kalmış. Öncelik işarette durmalı: `
                    + 'değerlendirmeyi yapan model metni okur ve işarete değil metne inanır.',
            });
        }

        if (item.text.length > MAX_ITEM_CHARS) {
            out.push({
                code: 'too-long', level: 'warn', index: i,
                text: `${i + 1}. madde uzun (${item.text.length} karakter) — muhtemelen birden çok şey `
                    + 'soruyor. Sistem her maddeye TEK damga veriyor; birleşik madde "kısmen" üretir '
                    + 've kritik eksik yarım puanla geçiştirilir.',
            });
        }

        const prev = seen.get(folded);
        if (prev !== undefined) {
            out.push({
                code: 'duplicate', level: 'info', index: i,
                text: `${i + 1}. madde ${prev + 1}. maddeyle aynı.`,
            });
        } else {
            seen.set(folded, i);
        }
    });

    const musts = items.filter((it) => it.must).length;
    if (items.length > 0 && musts === 0) {
        out.push({
            code: 'no-must', level: 'warn',
            text: 'Hiç zorunlu madde yok — eleme kapısı çalışmaz ve hiçbir aday zorunlulukta elenmez.',
        });
    }
    if (musts > MANY_MUST) {
        out.push({
            code: 'many-must', level: 'warn',
            text: `${musts} zorunlu madde var. Her zorunlu madde havuzu eler; emin olmadıklarınızı `
                + 'tercihen yapmak, aynı şeyi ölçüp adayı kaybetmez.',
        });
    }

    const suggested = items.filter((it) => it.source === 'model').length;
    if (suggested > 0) {
        out.push({
            code: 'model-suggested', level: 'info',
            text: `${suggested} madde sizin söylediğiniz bir şey değil, benim önerim. Kaydetmeden önce `
                + 'okuyun: gereksiz bir şart gerçek adayları eler.',
        });
    }

    return out;
}

/**
 * Sohbet turunda ve bağlamda taşınacak kısa özet.
 *
 * Takip sorusu ("SQL'i tercihene al") bir öncekinin ÜSTÜNE çalışır; model
 * taslağı görmeden düzeltemez.
 */
export function draftForPrompt(draft) {
    if (!draft) return null;
    return {
        baslik: draft.title,
        departman: draft.department || null,
        ozet: draft.summary || null,
        seviye: draft.level || null,
        konum: draft.location || null,
        maddeler: draft.items.map((it) => ({
            metin: it.text,
            oncelik: it.must ? 'zorunlu' : 'tercihen',
            kaynak: it.source === 'user' ? 'kullanici' : 'oneri',
        })),
    };
}

/**
 * Taslağı ilan formunun beklediği şekle çevirir.
 *
 * ── BAZI OLMAYAN BANDI FORMA TAŞIMIYORUZ ────────────────────────────────────
 * Formdaki brüt/net seçicisinin boş seçeneği yok; varsayılanı "brüt". Bazı
 * bilinmeyen bir bandı oraya yazmak, bilinmeyen bir şeyi BRÜT diye iddia
 * etmek olur — ve bu hata %30-40 kaydırır, üstelik makul göründüğü için fark
 * edilmez. Rakamı taşımamak, yanlış etiketle taşımaktan iyidir; ekran bunu
 * söyler.
 */
export function draftToFormData(draft, { department = '' } = {}) {
    const d = draft || {};
    const band = d.band && d.band.basis ? d.band : null;
    return {
        title: d.title || '',
        department: d.department || department || '',
        minExperience: '',
        reqItems: (d.items || []).map((it) => ({ text: it.text, must: it.must })),
        description: d.summary || '',
        salaryMin: band?.min != null ? String(band.min) : '',
        salaryMax: band?.max != null ? String(band.max) : '',
        salaryCurrency: band?.currency || 'TRY',
        salaryPeriod: band?.period || 'monthly',
        salaryBasis: band?.basis || 'gross',
        screeningEnabled: false,
        screeningQuestions: [''],
    };
}

/** Band taslağa KULLANICI eylemiyle eklenir; kaynağı da yazılır. */
export function withBand(draft, band, source) {
    const b = normalizeBand(band);
    if (!draft || !b) return draft;
    return { ...draft, band: b, bandSource: source === 'market' ? 'market' : 'internal' };
}
