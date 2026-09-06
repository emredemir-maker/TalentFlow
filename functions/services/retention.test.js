// SAKLAMA SÜRESİ KARARI.
//
// Bu modülün verdiği karar GERİ ALINAMAZ bir işlemi tetikliyor. Testlerin
// büyük kısmı bu yüzden "silinmemesi gerekeni silmiyor mu" sorusunu kovalıyor;
// yanlış pozitifin bedeli, gerçek bir adayın kaydının yok olması.
import { describe, expect, it } from 'vitest';

import {
    storagePathFromUrl,
    toDate,
    recordDate,
    retentionCutoff,
    retentionVerdict,
    splitByRetention,
} from './retention.js';

const NOW = new Date('2026-09-06T12:00:00.000Z');
const eski = (iso) => ({ appliedDate: iso, status: 'review' });

describe('toDate', () => {
    it('üç biçimi de okuyor', () => {
        expect(toDate('2026-01-01T00:00:00.000Z')?.getFullYear()).toBe(2026);
        expect(toDate(new Date('2026-01-01'))?.getFullYear()).toBe(2026);
        expect(toDate({ toDate: () => new Date('2026-01-01') })?.getFullYear()).toBe(2026);
    });

    it('okunamayan değer null — sıfır ya da bugün DEĞİL', () => {
        // "Bugün" saysak kayıt hiç silinmez; "sıfır" saysak hepsi silinir.
        // İkisi de sessizce yanlış; null ise çağıranı karar vermeye zorluyor.
        expect(toDate(null)).toBeNull();
        expect(toDate('elma')).toBeNull();
        expect(toDate({})).toBeNull();
        expect(toDate({ toDate: () => new Date('bozuk') })).toBeNull();
    });
});

describe('recordDate', () => {
    it('appliedDate önce', () => {
        const d = recordDate({ appliedDate: '2025-01-01', createdAt: '2026-01-01' });
        expect(d.getFullYear()).toBe(2025);
    });

    it('appliedDate yoksa createdAt', () => {
        expect(recordDate({ createdAt: '2024-05-05' }).getFullYear()).toBe(2024);
    });

    it('hiçbiri yoksa null', () => {
        expect(recordDate({ name: 'X' })).toBeNull();
    });
});

describe('retentionCutoff', () => {
    it('ay sayısı kadar geriye gidiyor', () => {
        expect(retentionCutoff(6, NOW).toISOString().slice(0, 7)).toBe('2026-03');
    });

    it('GEÇERSİZ SÜRE FRENİ KAPATIYOR, HEPSİNİ SİLMİYOR', () => {
        // 0 ya da bozuk bir değer "her şey süresini doldurdu" anlamına
        // gelmemeli — ayarı yanlış yazan biri havuzu kaybederdi.
        expect(retentionCutoff(0, NOW)).toBeNull();
        expect(retentionCutoff(-3, NOW)).toBeNull();
        expect(retentionCutoff('altı ay', NOW)).toBeNull();
        expect(retentionCutoff(undefined, NOW)).toBeNull();
    });
});

describe('retentionVerdict', () => {
    it('süresi dolan kayıt siliniyor', () => {
        const v = retentionVerdict(eski('2025-01-01'), { months: 6, now: NOW });
        expect(v).toEqual({ due: true, reason: 'sure-doldu' });
    });

    it('süresi dolmayan kayıt duruyor', () => {
        expect(retentionVerdict(eski('2026-08-01'), { months: 6, now: NOW }).due).toBe(false);
    });

    it('SINIR GÜNÜ SİLİNMİYOR', () => {
        // Tam eşitlikte silmemek bilinçli: bir günlük belirsizlikte kaydı
        // korumak, kaybetmekten iyi.
        const sinir = retentionCutoff(6, NOW).toISOString();
        expect(retentionVerdict(eski(sinir), { months: 6, now: NOW }).due).toBe(false);
    });

    it('TARİHİ OKUNAMAYAN KAYIT SİLİNMİYOR', () => {
        const v = retentionVerdict({ status: 'review' }, { months: 6, now: NOW });
        expect(v).toEqual({ due: false, reason: 'tarih-okunamadi' });
    });

    it('İŞE ALINMIŞ ADAY İMHA DIŞINDA', () => {
        // Kişi çalışan hâline geldiğinde verisi başka bir hukuki sebeple ve
        // başka bir süreyle saklanıyor.
        const v = retentionVerdict({ appliedDate: '2020-01-01', status: 'hired' }, { months: 6, now: NOW });
        expect(v).toEqual({ due: false, reason: 'ise-alindi' });
    });

    it('süre tanımlı değilken hiçbir şey silinmiyor', () => {
        const v = retentionVerdict(eski('2000-01-01'), { months: 0, now: NOW });
        expect(v).toEqual({ due: false, reason: 'sure-tanimsiz' });
    });

    it('bozuk kayıt çökertmiyor', () => {
        expect(retentionVerdict(null, { months: 6, now: NOW }).due).toBe(false);
        expect(retentionVerdict(undefined, { months: 6, now: NOW }).due).toBe(false);
    });
});

describe('splitByRetention', () => {
    const havuz = [
        eski('2024-01-01'),                                   // süresi doldu
        eski('2026-08-20'),                                   // taze
        { status: 'hired', appliedDate: '2019-01-01' },       // işe alındı
        { status: 'review' },                                 // tarihsiz
    ];

    it('ayırıyor ve sebepleri sayıyor', () => {
        const r = splitByRetention(havuz, { months: 6, now: NOW });
        expect(r.due).toHaveLength(1);
        expect(r.kept).toHaveLength(3);
        expect(r.reasons).toEqual({
            'sure-doldu': 1,
            'sure-dolmadi': 1,
            'ise-alindi': 1,
            'tarih-okunamadi': 1,
        });
    });

    it('boş / bozuk liste çökertmiyor', () => {
        expect(splitByRetention(null, { months: 6 }).due).toEqual([]);
    });

    it('süre tanımsızken HİÇBİRİ silinmiyor', () => {
        const r = splitByRetention(havuz, { months: null, now: NOW });
        expect(r.due).toEqual([]);
        expect(r.kept).toHaveLength(4);
    });
});

describe('storagePathFromUrl', () => {
    const URL_ORNEK = 'https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/cvs%2F1712345_ab.pdf?alt=media&token=abc';

    it('nesne yolunu çözüyor', () => {
        expect(storagePathFromUrl(URL_ORNEK)).toBe('cvs/1712345_ab.pdf');
    });

    it('ÇÖZÜLEMEYEN ADRES null — tahmin edilmiyor', () => {
        // Yanlış çözülmüş bir yol, başka bir dosyayı silmeye çalışmak demek.
        expect(storagePathFromUrl('https://ornek.com/dosya.pdf')).toBeNull();
        expect(storagePathFromUrl('')).toBeNull();
        expect(storagePathFromUrl(null)).toBeNull();
    });

    it('BİLİNMEYEN KLASÖR REDDEDİLİYOR', () => {
        const kotu = 'https://firebasestorage.googleapis.com/v0/b/x/o/branding%2Flogo.png?alt=media';
        expect(storagePathFromUrl(kotu)).toBeNull();
    });
});
