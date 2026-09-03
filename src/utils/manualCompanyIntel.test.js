import { describe, it, expect } from 'vitest';
import {
    normalizeWebsite,
    normalizeFoundedYear,
    hasManualEvidence,
    buildManualCompanyRecord,
    isManualRecord,
    formFromRecord,
    MANUAL_SOURCE,
} from './manualCompanyIntel';
import { verifyCompanyClaim, CLAIM_VERDICT, summarizeCompanyVerification } from './companyClaims';

describe('normalizeWebsite', () => {
    it('şema yazmayan kullanıcıyı cezalandırmıyor', () => {
        expect(normalizeWebsite('acme.com.tr')).toBe('https://acme.com.tr/');
        expect(normalizeWebsite('  www.acme.com  ')).toBe('https://www.acme.com/');
    });

    it('yazılmış şemayı koruyor', () => {
        expect(normalizeWebsite('http://acme.com')).toBe('http://acme.com/');
    });

    it('TIKLANABİLİR ALANA KOD ENJEKTE EDİLEMİYOR', () => {
        // Bu değer ekranda <a href> olarak basılıyor.
        expect(normalizeWebsite('javascript:alert(1)')).toBe('');
        expect(normalizeWebsite('data:text/html,<script>')).toBe('');
    });

    it('adres olmayan metni reddediyor', () => {
        expect(normalizeWebsite('acme')).toBe('');
        expect(normalizeWebsite('')).toBe('');
        expect(normalizeWebsite(null)).toBe('');
    });
});

describe('normalizeFoundedYear', () => {
    const now = new Date('2026-09-03T00:00:00Z');

    it('makul yılı kabul ediyor', () => {
        expect(normalizeFoundedYear('2015', now)).toBe(2015);
        expect(normalizeFoundedYear(1998, now)).toBe(1998);
    });

    it('aralık dışını ve sayı olmayanı reddediyor', () => {
        expect(normalizeFoundedYear('1700', now)).toBeNull();
        expect(normalizeFoundedYear('2100', now)).toBeNull();
        expect(normalizeFoundedYear('geçen yıl', now)).toBeNull();
        expect(normalizeFoundedYear('', now)).toBeNull();
    });
});

describe('hasManualEvidence', () => {
    it('BOŞ FORM DOĞRULAMA ÜRETMİYOR', () => {
        // Hiçbir bilgi vermeden "doğrulandı" işaretlemek, raporda kanıtsız
        // bir hüküm üretirdi.
        expect(hasManualEvidence({})).toBe(false);
        expect(hasManualEvidence({ website: '   ', note: '  ' })).toBe(false);
    });

    it('tek bir alan yeterli', () => {
        expect(hasManualEvidence({ website: 'acme.com' })).toBe(true);
        expect(hasManualEvidence({ note: 'Eski çalışanıyla görüştüm' })).toBe(true);
        expect(hasManualEvidence({ sizeBand: '11-50' })).toBe(true);
    });
});

describe('buildManualCompanyRecord', () => {
    const kayit = () => buildManualCompanyRecord('Delta Yazılım', {
        website: 'delta.com.tr',
        foundedYear: '2015',
        sizeBand: '11-50',
        sector: 'yazilim',
        headquarters: 'İzmir',
        note: 'Ticaret sicilinden baktım',
    }, { by: 'Ayşe Yılmaz', at: '2026-09-03T10:00:00.000Z' });

    it('kaynağı ve girenin kimliğini kaydediyor', () => {
        const r = kayit();
        expect(r.source).toBe(MANUAL_SOURCE);
        expect(isManualRecord(r)).toBe(true);
        expect(r.manual).toEqual({
            by: 'Ayşe Yılmaz',
            at: '2026-09-03T10:00:00.000Z',
            note: 'Ticaret sicilinden baktım',
        });
    });

    it('KURULUŞ YILI SİCİL ALANINA YAZILMIYOR', () => {
        // companyClaims sicil kaydını "çelişki", arama sonucunu "dikkat"
        // sayıyor. İnsanın elle girdiği yıl hukuki belge değil — yazım
        // hatası kırmızı bayrak takmamalı.
        const r = kayit();
        expect(r.registry).toBeNull();
        expect(r.foundedYear).toBe(2015);
    });

    it('web sitesi aynı zamanda denetlenebilir bir kaynak', () => {
        expect(kayit().sources).toEqual([
            { title: 'Şirket web sitesi (elle girildi)', uri: 'https://delta.com.tr/' },
        ]);
    });

    it('kurucu adı UYDURULMUYOR — elle kayıt kurucu eşleşmesi üretemez', () => {
        expect(kayit().founders).toEqual([]);
    });

    it('forma geri dönüş kayıpsız', () => {
        const f = formFromRecord(kayit());
        expect(f.foundedYear).toBe(2015);
        expect(f.sizeBand).toBe('11-50');
        expect(f.note).toBe('Ticaret sicilinden baktım');
    });

    it('geçersiz alanlar sessizce düşüyor, kayıt yine kurulabiliyor', () => {
        const r = buildManualCompanyRecord('X', { website: 'javascript:1', foundedYear: '2100', note: 'aradım' });
        expect(r.website).toBe('');
        expect(r.foundedYear).toBeNull();
        expect(r.sources).toEqual([]);
        expect(r.manual.note).toBe('aradım');
    });
});

describe('elle kayıt doğrulama hükmüne nasıl giriyor', () => {
    const claim = { company: 'Delta Yazılım', role: 'Yazılım Uzmanı', startYear: 2018, duration: '4 yıl' };

    it('KAYNAK BULUNAMADI HÜKMÜNÜ KALDIRIYOR', () => {
        const oncesi = verifyCompanyClaim({ claim, evidence: null });
        expect(oncesi.verdict).toBe(CLAIM_VERDICT.UNVERIFIED);

        const evidence = buildManualCompanyRecord('Delta Yazılım', { website: 'delta.com.tr' });
        expect(verifyCompanyClaim({ claim, evidence }).verdict).toBe(CLAIM_VERDICT.MANUAL);
    });

    it('AYRI HÜKÜM — otomatik doğrulamayla aynı kutuya konmuyor', () => {
        const evidence = buildManualCompanyRecord('Delta', { note: 'eski çalışanıyla görüştüm' });
        const sonuc = verifyCompanyClaim({ claim, evidence });
        expect(sonuc.verdict).toBe(CLAIM_VERDICT.MANUAL);
        expect(sonuc.verdict).not.toBe(CLAIM_VERDICT.VERIFIED);
    });

    it('yalnızca not girilse bile "kaynak yok" bayrağı üretmiyor', () => {
        const evidence = buildManualCompanyRecord('Delta', { note: 'şirket kapanmış, arşiv kaydı var' });
        const sonuc = verifyCompanyClaim({ claim, evidence });
        expect(sonuc.flags.some((f) => f.id === 'sirket-dogrulanamadi')).toBe(false);
    });

    it('ÇELİŞKİ ELLE KAYITTA DA ÇELİŞKİDİR — ama dikkat ağırlığında', () => {
        // CV 2018 diyor, elle girilen kuruluş 2022. Sicil olsaydı "çelişki"
        // hükmü çıkardı; elle girilen yıl "dikkat" seviyesinde kalıyor ve
        // hüküm "elle doğrulandı" oluyor.
        const evidence = buildManualCompanyRecord('Delta', { foundedYear: '2022' });
        const sonuc = verifyCompanyClaim({ claim, evidence });
        expect(sonuc.flags.some((f) => f.id === 'kurulus-sonrasi' && f.severity === 'dikkat')).toBe(true);
        expect(sonuc.verdict).toBe(CLAIM_VERDICT.MANUAL);
    });

    it('SKOR CEZASI DÜŞÜYOR — elle doğrulanan "doğrulanamadı" sayılmıyor', () => {
        const ev = buildManualCompanyRecord('B', { website: 'b.com' });
        const ozet = summarizeCompanyVerification([
            verifyCompanyClaim({ claim: { company: 'A' }, evidence: null }),
            verifyCompanyClaim({ claim: { company: 'B' }, evidence: ev }),
        ]);
        expect(ozet.counts.dogrulanamadi).toBe(1);
        expect(ozet.counts.elle_dogrulandi).toBe(1);
        expect(ozet.total).toBe(2);
    });
});
