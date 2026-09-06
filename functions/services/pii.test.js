// SUNUCU TARAFI PII MASKELEME.
//
// Bu testlerin işi tek bir cümleyi savunulabilir kılmak: "CV'deki kimlik
// bilgileri modele gönderilmez." Cümle ancak HER YOL aynı şeyi yapıyorsa
// doğru; istemci tarafı maskeliyor, sunucu tarafı maskelemiyordu.
//
// src/utils/pii.test.js aynı beklentileri istemci için sabitliyor. İki dosya
// ayrışırsa iki farklı gizlilik davranışı geri döner.
import { describe, expect, it } from 'vitest';

import { extractNameFromText, extractPiiFromText, redactPiiFromText } from './pii.js';
import { mergeContact } from './gemini.js';

const CV = `Zeynep Aksoy
zeynep.aksoy@ornek-posta.com
+90 532 111 22 33
linkedin.com/in/zeynepaksoy
github.com/zeynepaksoy

DENEYİM
Kıdemli Ürün Yöneticisi — Marbis Teknoloji (2023-04 - Halen)
Zeynep, kayıt akışının sahibiydi ve dönüşümü iki katına çıkardı.`;

describe('extractNameFromText', () => {
    it('ilk satırlardaki adı buluyor', () => {
        expect(extractNameFromText(CV)).toBe('Zeynep Aksoy');
    });

    it('Türkçe harflerle başlayan adları da okuyor', () => {
        expect(extractNameFromText('Şeyma Çağlar\nÜrün Yöneticisi')).toBe('Şeyma Çağlar');
    });

    it('ad yoksa uydurmuyor', () => {
        expect(extractNameFromText('CURRICULUM VITAE\nDeneyim: 8 yil')).toBeNull();
        expect(extractNameFromText(null)).toBeNull();
    });

    it('BİLİNEN ZAYIFLIK: tek başına duran iki kelimelik unvan ad sanılıyor', () => {
        // "Ürün Yöneticisi" ad kalıbına uyuyor. Sonuç FAZLA maskeleme: unvan
        // da [İSİM] olarak gizleniyor ve ada yazılıyor. Gizlilik açısından
        // güvenli yönde bir hata, ama kayıtta yanlış ad üretebiliyor.
        //
        // Davranış src/utils/pii.ts ile AYNI ve bilerek değiştirilmedi: iki
        // dosyanın ayrışması iki farklı gizlilik davranışı demek olurdu.
        // Düzeltilecekse iki tarafta birlikte düzeltilmeli.
        expect(extractNameFromText('Ürün Yöneticisi\nMarbis Teknoloji')).toBe('Ürün Yöneticisi');
    });
});

describe('extractPiiFromText', () => {
    it('dört alanı da ayıklıyor', () => {
        const p = extractPiiFromText(CV);
        expect(p.name).toBe('Zeynep Aksoy');
        expect(p.email).toBe('zeynep.aksoy@ornek-posta.com');
        expect(p.phone).toContain('532');
        expect(p.linkedinUrl).toBe('https://www.linkedin.com/in/zeynepaksoy');
    });

    it('bozuk girdi çökertmiyor', () => {
        expect(extractPiiFromText(null)).toEqual({ name: null, email: null, phone: null, linkedinUrl: null });
    });
});

describe('redactPiiFromText', () => {
    const maskeli = redactPiiFromText(CV, 'Zeynep Aksoy');

    it('KİMLİK BİLGİLERİ METİNDE KALMIYOR', () => {
        expect(maskeli).not.toContain('zeynep.aksoy@ornek-posta.com');
        expect(maskeli).not.toContain('532 111 22 33');
        expect(maskeli).not.toContain('zeynepaksoy');
        expect(maskeli).not.toContain('Zeynep');
        expect(maskeli).not.toContain('Aksoy');
    });

    it('ADIN TEK BAŞINA GEÇTİĞİ YER DE MASKELENİYOR', () => {
        // Metnin ilerisinde yalnızca ilk ad geçiyor: "Zeynep, kayıt akışının..."
        expect(maskeli).toContain('[İSİM], kayıt akışının');
    });

    it('MESLEKİ İÇERİK KORUNUYOR', () => {
        // Maskeleme fazla agresif olursa ayrıştırma işe yaramaz hale gelir.
        expect(maskeli).toContain('Kıdemli Ürün Yöneticisi');
        expect(maskeli).toContain('Marbis Teknoloji');
        expect(maskeli).toContain('dönüşümü iki katına çıkardı');
    });

    it('imler yerli yerinde', () => {
        expect(maskeli).toContain('[E-POSTA]');
        expect(maskeli).toContain('[TELEFON]');
        expect(maskeli).toContain('[LINKEDIN]');
        expect(maskeli).toContain('[GITHUB]');
    });

    it('ad bilinmiyorsa iletişim yine de maskeleniyor', () => {
        const m = redactPiiFromText('a@b.com ve +90 555 444 33 22', null);
        expect(m).toBe('[E-POSTA] ve [TELEFON]');
    });

    it('regex anlamı olan ad çökertmiyor', () => {
        expect(() => redactPiiFromText('metin', 'A. (B) [C]')).not.toThrow();
    });
});

describe('mergeContact', () => {
    const contact = { name: 'Zeynep Aksoy', email: 'z@ornek.com', phone: '+90 532', linkedinUrl: 'https://x' };

    it('iletişim bilgileri modelden değil regex\'ten geliyor', () => {
        const out = mergeContact({ name: null, position: 'Ürün Yöneticisi' }, contact);
        expect(out.name).toBe('Zeynep Aksoy');
        expect(out.email).toBe('z@ornek.com');
        expect(out.position).toBe('Ürün Yöneticisi');
    });

    it('MODEL İMİ KOPYALADIYSA TEMİZLENİYOR', () => {
        // Metin maskeli olduğu için model "[İSİM]" yazabiliyor; bu değer
        // kayda geçerse ekranda aday adı olarak görünürdü.
        const out = mergeContact(
            { name: '[İSİM]', position: '[İSİM] — Ürün Yöneticisi', company: 'Marbis' },
            { name: null, email: null, phone: null, linkedinUrl: null }
        );
        expect(out.name).toBeNull();
        expect(out.position).toBeNull();
        expect(out.company).toBe('Marbis');
    });

    it('modelin uydurduğu e-posta kabul edilmiyor', () => {
        const out = mergeContact({ email: 'uydurma@model.com' }, { name: null, email: null, phone: null });
        expect(out.email).toBeNull();
    });

    it('bozuk girdi çökertmiyor', () => {
        expect(mergeContact(null, contact)).toBeNull();
    });
});
