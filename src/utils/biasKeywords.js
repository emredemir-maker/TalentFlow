// ÖNYARGI UYARISI — anahtar kelimeyle, yapay zekâsız ve anında.
//
// Eskiden önyargı uyarısı canlı STAR analizinin bir yan ürünüydü: her aday
// cümlesinde giden AI çağrısı "mülakatçı sorusunda önyargı var mı" diye de
// bakıyordu. Analiz 3 dakikada bire indiğinde uyarı da 3 dakika gecikirdi —
// soru çoktan sorulmuş, aday cevaplamış olurdu. Uyarının değeri anında
// gelmesinde. Mülakatçının cümlesi düştüğü an burada taranıyor.
//
// Liste bilerek dar: yanlış alarm, uyarıyı kısa sürede görmezden gelinen bir
// gürültüye çevirir. Amaç yasaklı konuları (yaş, medeni hâl, aile planı,
// din, etnik köken, sağlık/engellilik, askerlik, görünüş) yakalamak.

// Türkçe harfleri de sözcük harfi sayan sınır. JavaScript'in \b'si yalnızca
// ASCII bilir; "yaşın" içindeki "ş"de sözcüğü bölerdi.
const L = 'a-zçğıöşüâîû0-9';
const word = (stem) => new RegExp(`(^|[^${L}])${stem}`, 'u');

const RULES = [
    { topic: 'yaş', patterns: [word('kaç yaşında'), word('yaşın(ız)? kaç'), word('doğum (yılın|tarihin)'), word('hangi yıl doğdu')] },
    { topic: 'medeni hâl', patterns: [word('evli mi'), word('evli misin'), word('bekar mı'), word('bekâr mı'), word('nişanlı'), word('sevgilin'), word('eşin(iz)? ne iş')] },
    { topic: 'aile planı', patterns: [word('çocu(ğ|k)un(uz)? var'), word('çocuk düşün'), word('çocuk yapmayı'), word('hamile'), word('gebelik'), word('aile kurma')] },
    { topic: 'din', patterns: [word('dinin'), word('dindar'), word('namaz kıl'), word('oruç tut'), word('inançlı mı'), word('mezheb')] },
    { topic: 'etnik köken', patterns: [word('nerelisin'), word('nerelisiniz'), word('memleketin'), word('aslen nereli'), word('etnik'), word('kökenin')] },
    { topic: 'sağlık / engellilik', patterns: [word('engelin(iz)? var'), word('kronik hastalı'), word('sağlık sorunun'), word('ilaç kullanıyor')] },
    // Mülakatçının ağzından "askerlik" neredeyse her zaman yasak sorudur.
    { topic: 'askerlik', patterns: [word('askerli[kğ]')] },
    { topic: 'görünüş', patterns: [word('kilon'), word('kilonuz'), word('boyun(uz)? kaç'), word('başörtü'), word('türban')] },
];

/**
 * Bir mülakatçı cümlesinde yasaklı konu var mı?
 *
 * @param {string} text
 * @returns {{topics: string[], detail: string} | null}
 */
export function detectBiasKeywords(text) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const lower = text.toLocaleLowerCase('tr-TR');
    const topics = RULES.filter((r) => r.patterns.some((p) => p.test(lower))).map((r) => r.topic);
    if (topics.length === 0) return null;
    return {
        topics,
        detail: `Soruda ${topics.join(', ')} ile ilgili ifade var. Bu konular işe alım kararında kullanılamaz; soruyu yetkinliğe odaklayın.`,
    };
}

/**
 * Transkriptteki en son işaretli MÜLAKATÇI cümlesi (aday cümleleri taranmaz).
 *
 * @param {Array<{role: string, text: string, time?: string}>} transcript
 * @returns {{key: string, detail: string, topics: string[]} | null}
 *   `key`: kapatılan uyarının aynı cümle için yeniden açılmaması için.
 */
export function findLatestBiasHit(transcript) {
    const list = Array.isArray(transcript) ? transcript : [];
    for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (!entry || entry.role === 'ADAY') continue;
        const hit = detectBiasKeywords(entry.text);
        if (hit) return { key: `${entry.time || ''}|${entry.text}`, ...hit };
    }
    return null;
}
