// DEMO KİLİDİ.
//
// Bu testlerin ikisi kritik ve zıt yönde:
//   • demo KAPALIYKEN hiçbir şeyi engellememeli — yanlış pozitif, üretimde
//     e-posta gönderimini kapatmak demek
//   • demo AÇIKKEN dışarı çıkan uçları geçirmemeli — yanlış negatif,
//     kurulumu işletenin hesabından spam gönderilmesi demek
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { demoBlock, isDemoMode } from './demoMode.js';

/** Express üçlüsünün asgari taklidi. */
function cagir(method, path) {
    const res = {
        code: null,
        body: null,
        status(c) { this.code = c; return this; },
        json(b) { this.body = b; return this; },
    };
    const next = vi.fn();
    demoBlock({ method, path }, res, next);
    return { res, next };
}

beforeEach(() => { delete process.env.DEMO_MODE; });
afterEach(() => { delete process.env.DEMO_MODE; });

describe('isDemoMode', () => {
    it('VARSAYILAN HAYIR — üretim davranışı', () => {
        expect(isDemoMode()).toBe(false);
        process.env.DEMO_MODE = '';
        expect(isDemoMode()).toBe(false);
        process.env.DEMO_MODE = 'false';
        expect(isDemoMode()).toBe(false);
    });

    it('yalnızca açık "true" açıyor', () => {
        process.env.DEMO_MODE = 'true';
        expect(isDemoMode()).toBe(true);
        process.env.DEMO_MODE = 'TRUE';
        expect(isDemoMode()).toBe(true);
        // "1" ya da "yes" kabul EDİLMİYOR: yarım yanlış yazılmış bir değer,
        // demoyu açık sanıp e-postayı serbest bırakmamalı.
        process.env.DEMO_MODE = '1';
        expect(isDemoMode()).toBe(false);
    });
});

describe('demo kapalıyken', () => {
    it('HİÇBİR ŞEYİ ENGELLEMİYOR', () => {
        const { res, next } = cagir('POST', '/api/send-invite');
        expect(next).toHaveBeenCalled();
        expect(res.code).toBeNull();
    });
});

describe('demo açıkken', () => {
    beforeEach(() => { process.env.DEMO_MODE = 'true'; });

    it('E-POSTA UÇLARI KAPALI', () => {
        for (const yol of [
            '/api/send-invite',
            '/api/send-feedback',
            '/api/send-interview-invite',
            '/api/send-info-request',
            '/api/send-participant-invite',
        ]) {
            const { res, next } = cagir('POST', yol);
            expect(next, yol).not.toHaveBeenCalled();
            expect(res.code, yol).toBe(403);
        }
    });

    it('HENÜZ YAZILMAMIŞ BİR send- UCU DA KAPALI DOĞUYOR', () => {
        // Önek eşleşmesinin sebebi bu: listeye eklenmesi unutulan bir uç
        // sessizce açık kalmamalı.
        const { res, next } = cagir('POST', '/api/send-yeni-bir-sey');
        expect(next).not.toHaveBeenCalled();
        expect(res.code).toBe(403);
    });

    it('toplu yükleme kapalı', () => {
        expect(cagir('POST', '/api/bulk-import').res.code).toBe(403);
    });

    it('aday yanıt bildirimi kapalı', () => {
        expect(cagir('POST', '/api/candidate-respond').res.code).toBe(403);
    });

    it('SESSİZCE BAŞARI DÖNMÜYOR — sebep yazılı', () => {
        // Arayüz "gönderildi" deyip hiçbir şey göndermezse kullanıcı
        // e-postanın yolda olduğunu sanır.
        const { res } = cagir('POST', '/api/send-invite');
        expect(res.body.demoMode).toBe(true);
        expect(res.body.error).toMatch(/kapalı/);
        expect(res.body.error).toMatch(/kendi kurulumunuzda/i);
    });

    it('ÜRÜNÜN ANLATTIĞI ÖZELLİKLER AÇIK KALIYOR', () => {
        // Demo bunları göstermek için var; kapatırsak geriye "bak ama dokunma"
        // kalır. Maliyet tarafını günlük AI tavanları tutuyor.
        for (const yol of [
            '/api/process-cv',
            '/api/ai/generate',
            '/api/create-manual-interview',
            '/api/admin/usage',
        ]) {
            const { next } = cagir('POST', yol);
            expect(next, yol).toHaveBeenCalled();
        }
    });

    it('iş durumu okumak serbest', () => {
        // GET dışarı bir şey göndermiyor: yüklenen işin durumu görülebilmeli.
        const { next } = cagir('GET', '/api/bulk-import/abc');
        expect(next).toHaveBeenCalled();
    });
});
