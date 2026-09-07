// @vitest-environment happy-dom
//
// sessionStorage'a dokunuyor — DOM globalleri gerekiyor.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    DEMO_CV_LIMITI,
    kullanilanKota,
    kalanKota,
    kotaDus,
    kotayaGoreAyir,
    kotaSifirla,
} from './demoUpload';

describe('demo CV kotası', () => {
    beforeEach(() => {
        kotaSifirla();
    });

    it('başlangıçta tam hak veriyor', () => {
        expect(kullanilanKota()).toBe(0);
        expect(kalanKota()).toBe(DEMO_CV_LIMITI);
    });

    it('düşülen adet kadar hak azalıyor', () => {
        kotaDus(2);
        expect(kullanilanKota()).toBe(2);
        expect(kalanKota()).toBe(1);
    });

    it('limitin üstüne çıkmıyor', () => {
        kotaDus(99);
        expect(kullanilanKota()).toBe(DEMO_CV_LIMITI);
        expect(kalanKota()).toBe(0);
    });

    // Sayaç bir toplama işlemi; geçersiz girdi onu bozmamalı. `Number(null)`
    // 0'dır ve `Number.isInteger(0)` true — bu kod tabanında daha önce üç kez
    // hataya yol açmış bir tuzak, o yüzden burada açıkça sınanıyor.
    it('geçersiz adetleri yok sayıyor', () => {
        for (const kotu of [0, -1, null, undefined, NaN, '2', 1.5, {}]) {
            kotaDus(kotu);
        }
        expect(kullanilanKota()).toBe(0);
    });

    describe('kotayaGoreAyir', () => {
        it('hak yeterliyse hepsini alıyor', () => {
            const { alinan, elenen } = kotayaGoreAyir(['a', 'b']);
            expect(alinan).toEqual(['a', 'b']);
            expect(elenen).toEqual([]);
        });

        // Sessizce kırpmak, ziyaretçinin yüklediğini sandığı bir CV'nin hiç
        // işlenmediğini fark etmemesine yol açar. Elenenler geri dönmeli ki
        // ekran bunu söyleyebilsin.
        it('hak yetmezse fazlasını ayrı döndürüyor', () => {
            kotaDus(2);
            const { alinan, elenen } = kotayaGoreAyir(['a', 'b', 'c']);
            expect(alinan).toEqual(['a']);
            expect(elenen).toEqual(['b', 'c']);
        });

        it('hak bittiyse hiçbirini almıyor', () => {
            kotaDus(DEMO_CV_LIMITI);
            const { alinan, elenen } = kotayaGoreAyir(['a']);
            expect(alinan).toEqual([]);
            expect(elenen).toEqual(['a']);
        });

        it('dizi olmayan girdiyle çökmüyor', () => {
            expect(kotayaGoreAyir(null)).toEqual({ alinan: [], elenen: [] });
            expect(kotayaGoreAyir(undefined)).toEqual({ alinan: [], elenen: [] });
        });
    });

    // Gizli pencerede ve site verisi kapalı tarayıcılarda sessionStorage'a
    // ERİŞİMİN KENDİSİ hata fırlatabiliyor. O durumda kota takip edilemez,
    // ama ziyaretçi dışarıda bırakılmamalı: ölçemediğimiz bir şey yüzünden
    // demoyu kapatmak yanlış olurdu. Sunucudaki günlük tavan yine devrede.
    describe('sessionStorage erişilemediğinde', () => {
        let orijinal;

        beforeEach(() => {
            orijinal = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
            Object.defineProperty(window, 'sessionStorage', {
                configurable: true,
                get() {
                    throw new Error('erişim engellendi');
                },
            });
        });

        afterEach(() => {
            if (orijinal) Object.defineProperty(window, 'sessionStorage', orijinal);
        });

        it('okuma çökmüyor ve hak dolu görünüyor', () => {
            expect(() => kullanilanKota()).not.toThrow();
            expect(kalanKota()).toBe(DEMO_CV_LIMITI);
        });

        it('yazma çökmüyor', () => {
            expect(() => kotaDus(1)).not.toThrow();
            expect(() => kotaSifirla()).not.toThrow();
        });

        it('dosyaları yine de geçiriyor', () => {
            const { alinan } = kotayaGoreAyir(['a', 'b']);
            expect(alinan).toEqual(['a', 'b']);
        });
    });

    it('bozuk sayaç değeri kullanılmamış sayılıyor', () => {
        window.sessionStorage.setItem('tf_demo_cv_sayaci', 'abc');
        expect(kullanilanKota()).toBe(0);
        window.sessionStorage.setItem('tf_demo_cv_sayaci', '-5');
        expect(kullanilanKota()).toBe(0);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});
