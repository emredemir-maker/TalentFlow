import { describe, it, expect } from 'vitest';
import {
    normalizeWebsite,
    normalizeFoundedYear,
    hasManualEvidence,
    buildManualCompanyRecord,
    isManualRecord,
    formFromRecord,
    mergeResearchIntoForm,
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
            // NASIL DOLDURULDU: araştırma yapılmadıysa 'form'.
            method: 'form',
            site: '',
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

describe('siteden araştırma sonucunun forma işlenmesi', () => {
    const bulgu = {
        website: 'https://delta.com.tr/',
        foundedYear: 2015,
        sizeBand: '11-50',
        sector: 'kurumsal yazilim',
        model: 'b2b',
        type: 'saas',
        sectorRaw: 'Kurumsal yazılım',
        headquarters: 'İzmir',
    };

    it('boş alanları dolduruyor ve neyin dolduğunu söylüyor', () => {
        const { form, filled, missing } = mergeResearchIntoForm({ website: 'delta.com.tr' }, bulgu);
        expect(form.foundedYear).toBe(2015);
        expect(form.sizeBand).toBe('11-50');
        expect(filled).toContain('Kuruluş yılı');
        expect(filled).not.toContain('Web sitesi'); // kullanıcı zaten yazmıştı
        expect(missing).toEqual([]);
    });

    it('KULLANICININ YAZDIĞININ ÜSTÜNE YAZMIYOR', () => {
        // İnsan şirketi tanıyor olabilir; girdiğinin sessizce değişmesi,
        // kaydettiğini sandığı şeyin kaybolması demektir.
        const { form, filled } = mergeResearchIntoForm({ sizeBand: '1-10', headquarters: 'Ankara' }, bulgu);
        expect(form.sizeBand).toBe('1-10');
        expect(form.headquarters).toBe('Ankara');
        expect(filled).not.toContain('Ölçek');
        expect(filled).not.toContain('Merkez');
    });

    it('AÇIKTA KALANLAR SÖYLENİYOR — kullanıcı elle tamamlasın diye', () => {
        const { missing, filled } = mergeResearchIntoForm({}, { website: 'delta.com.tr' });
        expect(filled).toEqual(['Web sitesi']);
        expect(missing).toEqual(expect.arrayContaining(['Kuruluş yılı', 'Ölçek', 'Sektör', 'Merkez']));
    });

    it('bulgu yoksa form olduğu gibi kalıyor', () => {
        const { form, filled } = mergeResearchIntoForm({ website: 'x.com' }, null);
        expect(form.website).toBe('x.com');
        expect(filled).toEqual([]);
    });

    it('ARAŞTIRMA KAYNAKLARI KAYDA GİRİYOR ve yöntem yazılı', () => {
        const r = buildManualCompanyRecord('Delta', { website: 'delta.com.tr' }, {
            by: 'Ayşe',
            research: {
                sources: [{ title: 'Hakkımızda', uri: 'https://delta.com.tr/hakkimizda' }],
                searchQueries: ['delta.com.tr hakkında'],
                grounded: true,
                site: 'https://delta.com.tr/',
            },
        });
        expect(r.manual.method).toBe('site');
        expect(r.manual.site).toBe('https://delta.com.tr/');
        expect(r.grounded).toBe(true);
        expect(r.sources.map((s) => s.uri)).toContain('https://delta.com.tr/hakkimizda');
    });

    it('aynı kaynak iki kez listelenmiyor', () => {
        const r = buildManualCompanyRecord('Delta', { website: 'delta.com.tr' }, {
            research: { sources: [{ title: 'Ana sayfa', uri: 'https://delta.com.tr/' }], site: 'https://delta.com.tr/' },
        });
        expect(r.sources).toHaveLength(1);
    });

    it('araştırma yapılmadıysa hüküm yine ELLE DOĞRULANDI', () => {
        // Kaynağın insan olması durumu değiştirmiyor; yöntem alanı ayırıyor.
        const elle = buildManualCompanyRecord('Delta', { note: 'aradım' });
        const site = buildManualCompanyRecord('Delta', { website: 'delta.com.tr' }, {
            research: { sources: [{ title: 'x', uri: 'https://delta.com.tr/x' }] },
        });
        expect(verifyCompanyClaim({ claim: { company: 'Delta' }, evidence: elle }).verdict)
            .toBe(CLAIM_VERDICT.MANUAL);
        expect(verifyCompanyClaim({ claim: { company: 'Delta' }, evidence: site }).verdict)
            .toBe(CLAIM_VERDICT.MANUAL);
    });
});
