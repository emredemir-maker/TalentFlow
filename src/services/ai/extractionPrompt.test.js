// STAR bölümü: kanıt ölçeği, tek kutuplu.
//
// TARİHÇE — iki ayrı hata, iki ayrı düzeltme:
//
// 1) Prompt eskiden yalnızca "Pozitif (+): [Adayın öne çıkan güçlü yanı]"
//    diyordu. Model her adaya uyan cümleler üretti:
//    "Aday, üstlendiği sorumlulukların bağlamını net bir şekilde ortaya
//    koyuyor." Bu cümle hiçbir CV'yi tarif etmiyor.
//
// 2) Somut kanıt istemek yetmedi. Biçim her boyut için bir POZİTİF ve bir
//    NEGATİF istiyordu; ölçülen şey ("CV'de ne kadar kanıt var") tek kutuplu
//    olduğu için negatif tarafta yazacak gerçek bir şey çoğu zaman yoktu ve
//    model kaçamak üretti. Aynı boyutta çelişen iki cümle çıktı:
//      Pozitif: "bağlamı net bir şekilde belirtiyor"
//      Negatif: "başlangıç durumları daha detaylı açıklanabilirdi"
//    Daha kötüsü: o "negatif"lerin çoğu kusur değil EKSİK BİLGİYDİ. Aday
//    gizlilik yükümlülüğü ya da yer kısıtı yüzünden yazmamıştı; sistem bunu
//    cezalandırıyordu.
//
// Bu testler yeni tasarımın kurallarını sabitler. Prompt sadeleştirilirken
// bu kurallar düşerse çıktı sessizce eski haline döner.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'extraction.js'),
    'utf8'
);
// Prompt 80 sütunda sarmalandığı için aranan kalıplar satır bölebiliyor.
const promptSource = rawSource.replace(/\s+/g, ' ');

describe('EXTRACTOR_PROMPT — STAR kanıt ölçeği', () => {
    it('leaves the STAR score to the scoring call and says so', () => {
        // Çapalar artık coverageScorer.js'te: skoru belirleyen çıktı küçük ve
        // ayrı bir çağrıda üretiliyor. Bu istem yalnızca metin yazıyor.
        expect(promptSource).toMatch(/puanı ayrı çağrı verir, sen PUAN YAZMA/);
        expect(promptSource).toMatch(/0 = bilgi yok · 1 = anılmış · 2 = anlatılmış · 3 = ölçülmüş/);
    });

    it('states that this call does not decide any status', () => {
        // Damganın iki yerden gelmesi, kararsızlığın geri dönmesi demekti
        expect(promptSource).toMatch(/BU ÇAĞRI DAMGA VERMEZ/);
        expect(promptSource).toMatch(/senin yazdıkların skoru DEĞİŞTİRMEZ/);
    });

    it('separates evidence, missing information and conflict', () => {
        for (const field of ['"evidence"', '"missing"', '"conflict"']) {
            expect(promptSource).toContain(field);
        }
    });

    it('states plainly that absence is not a fault', () => {
        // Kullanıcının asıl itirazı buydu: "negatif" dediklerimiz aslında
        // adayın paylaşmamayı tercih ettiği ya da paylaşamadığı bilgi.
        expect(promptSource).toMatch(/Bilginin CV'de olmaması bir KUSUR DEĞİLDİR/);
        expect(promptSource).toMatch(/gizlilik/);
    });

    it('frames missing information as an interview question, not a deduction', () => {
        expect(promptSource).toMatch(/mülakatta sorulması gereken/);
        expect(promptSource).toMatch(/puanı düşürmez/);
    });

    it('reserves conflict for genuine inconsistencies and expects it to be rare', () => {
        expect(promptSource).toMatch(/YALNIZCA gerçek bir tutarsızlık/);
        expect(promptSource).toMatch(/BOŞ olacaktır/);
        expect(promptSource).toMatch(/Kusur icat etme/);
    });

    it('forbids the self-contradiction the old format produced', () => {
        // "iyi anlatmış" + "daha detaylı olabilirdi" ikilisi
        expect(promptSource).toMatch(/Bu bir çelişkidir/);
    });

    it('still demands concrete evidence from the CV', () => {
        expect(promptSource).toMatch(/Şirket adı, proje, rol, dönem, sayı/);
        expect(promptSource).toMatch(/KANIT UYDURMA/);
    });

    it('still bans the generic phrasing the model actually produced', () => {
        // Büyük/küçük harfe duyarsız: kalıbın yasaklı olması önemli, cümle
        // başında mı ortasında mı yazıldığı değil.
        const lower = promptSource.toLocaleLowerCase('tr');
        for (const phrase of ['net bir şekilde ortaya koyuyor', 'daha fazla vurgulanabilir']) {
            expect(lower).toContain(phrase);
        }
    });

    it('keeps the portability test that beats an abstract "be specific"', () => {
        expect(promptSource).toMatch(/BAŞKA bir adayın CV'sine de aynen uyuyorsa/);
    });

    it('keeps STAR out of the fit judgement', () => {
        // Uygunluk requirementCoverage'ın işi; STAR yalnızca kanıt yoğunluğu
        expect(promptSource).toMatch(/STAR, ilana uygunluğu ölçmez/);
    });
});

describe('EXTRACTOR_PROMPT — genel kurallar', () => {
    it('forbids raw double quotes inside string values', () => {
        // #89 modelden alıntı isteyince model çift tırnak kullandı ve JSON
        // kırıldı (7572 karakterlik sağlam bir yanıt okunamadı).
        expect(promptSource).toMatch(/TIRNAK KURALI/);
        expect(promptSource).toMatch(/TEK tırnak/);
    });

    it('keeps the must/nice distinction out of the "deficiency" framing', () => {
        expect(promptSource).toMatch(/\[TERCİHEN\] maddeleri ASLA/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gizlilik paradoksu.
//
// En nitelikli adaylar genellikle en sıkı NDA'ye sahip projelerde çalışır ve
// kesin rakam paylaşamaz. Yalnızca kesin rakam arayan bir ölçek, tam da bu
// adayları eler — sistem "gizleyecek bir şeyi olmayan" ortalama adayı
// ödüllendiren bir mekanizmaya döner.
// ─────────────────────────────────────────────────────────────────────────────
describe('EXTRACTOR_PROMPT — gizlilik ve ölçek vekilleri', () => {
    it('accepts ranges and relative change as measured evidence', () => {
        expect(promptSource).toMatch(/kesin rakam ŞART DEĞİL/);
        expect(promptSource).toMatch(/Aralık ya da yaklaşık değer/);
        expect(promptSource).toMatch(/Göreli değişim/);
    });

    it('counts scope proxies as evidence', () => {
        expect(promptSource).toMatch(/ÖLÇEK VEKİLLERİ/);
        for (const proxy of ['kişilik ekip', 'kaç ülke', 'sistem/mimari karmaşıklığı']) {
            expect(promptSource).toContain(proxy);
        }
    });

    it('has a confidentiality flag that is set only on an explicit statement', () => {
        expect(promptSource).toMatch(/"confidentiality"/);
        expect(promptSource).toMatch(/sessiz kalmak gizlilik beyanı değildir/);
    });

    it('makes the flag change the question, not the score', () => {
        // Bayraga puan baglamak "NDA yazan herkes yuksek alir" oyununu acardi
        expect(promptSource).toMatch(/Bu bayrak PUAN KAZANDIRMAZ/);
        expect(promptSource).toMatch(/Yine de puanı "evidence" belirler/);
    });

    it('asks the follow-up in an NDA-safe way', () => {
        expect(promptSource).toMatch(/NDA-GÜVENLİ/);
        expect(promptSource).toMatch(/gizli bilgiyi ifşa etmesini ISTEME/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// NASIL KARŞILIYOR — evidence / gap.
//
// "met" damgası tek başına yetmiyordu: iki aday aynı damgayı alıp bambaşka
// insanlar olabilir. Bu iki alanın tek riski, modelin CV'de olmayan bir şeyi
// çıkarsama yoluyla yazması ya da her maddeye zorlama bir kusur uydurması.
// ─────────────────────────────────────────────────────────────────────────────
describe('madde bazlı dayanak', () => {
    it('asks for both fields in the output schema', () => {
        expect(promptSource).toMatch(/"evidence": "CV'deki somut dayanak"/);
        expect(promptSource).toMatch(/"gap": ""/);
    });

    it('explains why the status alone is not enough', () => {
        expect(promptSource).toMatch(/İki aday aynı damgayı alıp bambaşka insanlar olabilir/);
    });

    it('demands evidence that actually carries something from the CV', () => {
        expect(promptSource).toMatch(/CV'de YAZANI kullan/);
        expect(promptSource).toMatch(/YANLIŞ: 'Bu alanda güçlü deneyime sahip\.' \(CV'den hiçbir şey taşımıyor\)/);
    });

    it('leaves evidence empty for a missing requirement', () => {
        expect(promptSource).toMatch(/"missing" ise BOŞ BIRAK/);
    });

    it('forbids inventing a gap on every requirement', () => {
        // Her maddeye kusur yazmak, GERÇEK farkların görünmesini engeller
        expect(promptSource).toMatch(/Fark YOKSA BOŞ BIRAK/);
        expect(promptSource).toMatch(/Zorlama fark uydurma/);
        expect(promptSource).toMatch(/gerçek farkların görünmesini engeller/);
    });

    it('grounds both fields in the CV and prefers empty over invented', () => {
        expect(promptSource).toMatch(/İKİSİ DE CV'YE DAYANMAK ZORUNDA/);
        expect(promptSource).toMatch(/Boş alan, uydurulmuş alandan iyidir/);
    });

    it('caps each field at one sentence so the JSON does not blow up', () => {
        // 7572 karakterlik yanıt bir kez okunamadı; alanlar sınırsız uzarsa
        // aynı sorun geri gelir
        const gapSection = promptSource.slice(promptSource.indexOf('NASIL KARŞILIYOR'));
        expect(gapSection.match(/En fazla bir cümle/g)?.length).toBeGreaterThanOrEqual(2);
    });
});
