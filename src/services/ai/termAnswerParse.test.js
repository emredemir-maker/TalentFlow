// Etiketli cevabın ayrıştırılması.
//
// Arama araçları JSON şemasıyla birlikte çalışmıyor, o yüzden modelden düz
// metin isteyip etikete göre ayırıyoruz. Bu kırılgan bir yer: model etiketi
// atlarsa ya da biçimi kaydırırsa kullanıcı BOŞ KUTU görür. Boş kutu, ham
// cevaptan kötüdür — o yüzden ayrıştırma başarısız olduğunda metnin tamamı
// gösterilir.
import { describe, expect, it } from 'vitest';

import { parseTermAnswer } from './termExplainer';

describe('parseTermAnswer', () => {
    it('reads the three labelled lines', () => {
        const r = parseTermAnswer([
            'NEDİR: CAC (Customer Acquisition Cost), bir müşteriyi kazanmanın maliyeti.',
            'BU İŞTE: Growth rolünde büyümenin kârlı olup olmadığını bu sayı belirler.',
            'SÖYLEMEDİĞİ: Terimi kullanmış olmak o metriği yönettiği anlamına gelmez.',
        ].join('\n'));
        expect(r.meaning).toContain('Customer Acquisition Cost');
        expect(r.why).toContain('Growth rolünde');
        expect(r.caution).toContain('yönettiği anlamına gelmez');
    });

    it('accepts the labels in any order and with odd spacing', () => {
        const r = parseTermAnswer('  bu i̇şte :  Önemli.\n\nNEDİR:   Bir şey.');
        expect(r.meaning).toBe('Bir şey.');
        expect(r.why).toBe('Önemli.');
    });

    it('tolerates a missing optional line', () => {
        const r = parseTermAnswer('NEDİR: Bir şey.\nBU İŞTE: Önemli.');
        expect(r.caution).toBe('');
        expect(r.meaning).toBe('Bir şey.');
    });

    it('falls back to the whole text when the model ignores the format', () => {
        // Boş kutu göstermektense ham cevabı göster
        const raw = 'CAC bir müşteriyi kazanmanın maliyetidir ve growth rolünde önemlidir.';
        const r = parseTermAnswer(raw);
        expect(r.meaning).toBe(raw);
        expect(r.why).toBe('');
    });

    it('does not treat a stray colon inside a sentence as a label', () => {
        const raw = 'Şöyle özetlenebilir: bu bir maliyet metriğidir.';
        expect(parseTermAnswer(raw).meaning).toBe(raw);
    });

    it('handles empty and malformed input', () => {
        expect(parseTermAnswer('')).toEqual({ meaning: '', why: '', caution: '' });
        expect(parseTermAnswer(null)).toEqual({ meaning: '', why: '', caution: '' });
        expect(parseTermAnswer('   ')).toEqual({ meaning: '', why: '', caution: '' });
    });
});
