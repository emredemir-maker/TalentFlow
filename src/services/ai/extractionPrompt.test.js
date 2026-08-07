// STAR gerekçeleri CV'ye özel olmalı.
//
// NEDEN: Prompt eskiden yalnızca "Pozitif (+): [Adayın öne çıkan güçlü yanı]"
// diyordu. Model de doğal olarak HER adaya uyan cümleler üretti — kullanıcı
// 2026-08-06'da "STAR değerlendirmeleri çok genel ifadeler içeriyor, CV'den
// örnek vermeli" diye bildirdi. Ekrandaki gerçek çıktı şuydu:
// "Aday, üstlendiği sorumlulukların ve karşılaştığı sorunların bağlamını net
// bir şekilde ortaya koyuyor." — bu cümle hiçbir CV'yi tarif etmiyor.
//
// Bu test prompt'un somut kanıt talebini koruduğunu doğrular. Prompt sadeleştirilirken
// bu kurallar düşerse çıktı sessizce eski genel haline döner; kırılması gereken yer burası.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawSource = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'extraction.js'),
    'utf8'
);
// Prompt 80 sütunda sarmalandığı için aranan kalıplar satır bölebiliyor;
// boşlukları tekleştirip satır sonlarını yok sayarak arıyoruz.
const promptSource = rawSource.replace(/\s+/g, ' ');

describe('EXTRACTOR_PROMPT — STAR gerekçeleri', () => {
    it('demands concrete evidence from the CV', () => {
        expect(promptSource).toMatch(/SOMUT KANIT/);
        // Neyin kanıt sayıldığı sayılmalı, yoksa "somut ol" tek başına işe yaramıyor
        expect(promptSource).toMatch(/Şirket adı/);
    });

    it('bans the generic phrasing the model actually produced', () => {
        // Ekranda görülen kalıplar prompt'ta AÇIKÇA yasaklı olmalı
        for (const phrase of ['net bir şekilde ortaya koyuyor', 'daha fazla vurgulanabilir']) {
            expect(promptSource).toContain(phrase);
        }
    });

    it('gives the model a portability test instead of only telling it to be specific', () => {
        // "Başka adaya da uyuyorsa yanlıştır" kuralı, soyut "somut ol"
        // talimatından çok daha iyi çalışıyor
        expect(promptSource).toMatch(/BAŞKA bir adayın CV'sine de aynen uyuyorsa/);
    });

    it('forbids inventing evidence when the CV genuinely lacks it', () => {
        // Somutluk baskısının bilinen yan etkisi uydurmadır; prompt buna
        // açık bir kaçış yolu vermeli
        expect(promptSource).toMatch(/KANIT UYDURMA/);
        expect(promptSource).toContain('kusur icat etme');
    });

    it('forbids raw double quotes inside string values', () => {
        // #89 modelden "CV'den alıntı" isteyince model alıntıyı çift tırnakla
        // yazdı ve JSON kırıldı (2026-08-07, 7572 karakterlik sağlam yanıt
        // okunamadı). Kural düşerse aynı hata geri gelir.
        expect(promptSource).toMatch(/TIRNAK KURALI/);
        expect(promptSource).toMatch(/TEK tırnak/);
    });

    it('keeps the Pozitif/Negatif shape the UI parses', () => {
        // CandidateProcessPage.parseFeedback bu iki etikete göre bölüyor;
        // biçim değişirse ekranda tek blok halinde görünür
        expect(promptSource).toContain('Pozitif (+)');
        expect(promptSource).toContain('Negatif (-)');
    });
});
