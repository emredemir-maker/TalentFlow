// EMEKLİ MODEL EŞLEMESİ.
//
// Bu testin varlık sebebi canlıda yaşanan bir arıza: API anahtarı
// yenilendikten sonra uygulama, KOD HİÇ DEĞİŞMEDEN çalışmayı bıraktı.
// Google `gemini-2.5-flash`'ı yeni anahtarlara kapatmıştı:
//
//   404 — "models/gemini-2.5-flash is no longer available to new users.
//          Please update your code to use models/gemini-3.6-flash"
//
// Eşleme sunucuda tek bir noktada duruyor; istemcinin gönderdiği kimlik
// ne olursa olsun oradan geçiyor. Bu test o noktayı sabitliyor.

import { describe, it, expect } from 'vitest';
import { modeliCozumle } from './gemini.js';

describe('emekli model eşlemesi', () => {
    it('gemini-2.5-flash güncel modele çevriliyor', () => {
        expect(modeliCozumle('gemini-2.5-flash')).toBe('gemini-3.6-flash');
    });

    it('diğer emekli modeller de çevriliyor', () => {
        expect(modeliCozumle('gemini-2.5-pro')).toBe('gemini-3.6-flash');
        expect(modeliCozumle('gemini-1.5-flash')).toBe('gemini-3.6-flash');
        expect(modeliCozumle('gemini-1.5-pro')).toBe('gemini-3.6-flash');
    });

    // Eşleme bir izin listesi DEĞİL. Bilmediği kimliği olduğu gibi geçiriyor;
    // yoksa yeni çıkan her modeli buraya eklemeden kullanamazdık.
    it('tanımadığı model kimliğine dokunmuyor', () => {
        expect(modeliCozumle('gemini-3.6-flash')).toBe('gemini-3.6-flash');
        expect(modeliCozumle('gemini-3.8-flash')).toBe('gemini-3.8-flash');
        expect(modeliCozumle('gemini-flash-latest')).toBe('gemini-flash-latest');
        expect(modeliCozumle('henuz-cikmamis-model')).toBe('henuz-cikmamis-model');
    });

    // Çağıran taraf bazen kimliği hiç vermiyor ya da boş veriyor; eşleme
    // bunu bir çökme sebebine çevirmemeli. Varsayılanı belirlemek çağıranın
    // işi, burası yalnızca çeviriyor.
    it('boş ve tanımsız değerlerle çökmüyor', () => {
        expect(modeliCozumle(undefined)).toBe(undefined);
        expect(modeliCozumle(null)).toBe(null);
        expect(modeliCozumle('')).toBe('');
    });

    // Eşlemenin HEDEFİ kendisi emekli olmamalı — yoksa çeviri, çalışmayan
    // bir modelden başka çalışmayan bir modele gönderir.
    it('hedef model, emekli listesinde değil', () => {
        const hedefler = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro']
            .map((m) => modeliCozumle(m));
        for (const hedef of hedefler) {
            expect(modeliCozumle(hedef)).toBe(hedef);
        }
    });
});
