// ŞİRKET İDDİASI ↔ KANIT.
//
// Bu dosyadaki en önemli test, kanıt bulunamadığında ÇELİŞKİ ÜRETMEYEN test.
// "Doğrulanamadı"yı şüphe gibi göstermek, küçük şehirdeki bir aile şirketinde
// çalışmış adayı kurumsal geçmişli adaya göre sistematik olarak cezalandırır.
// Aracın yapabileceği en büyük haksızlık bu olurdu.
//
// İkinci önemli grup: kurucu adı eşleştirme. Yanlış eşleşmenin çıktısı
// "aday şirketin sahibi" gibi ağır bir iddia — ve Türkiye'de Yılmaz, Kaya,
// Demir soyadları çok yaygın.
import { describe, expect, it } from 'vitest';

import {
    namesMatch,
    matchFounder,
    verifyCompanyClaim,
    summarizeCompanyVerification,
    CLAIM_VERDICT,
} from './companyClaims';
import { SEVERITY } from './cvConsistency';

const claim = (over = {}) => ({
    company: 'Aydın Dijital',
    role: 'Growth Manager',
    startYear: 2022,
    duration: 'Oca 2022 - Ağu 2026',
    ...over,
});

const evidence = (over = {}) => ({
    name: 'Aydın Dijital',
    website: 'aydindijital.com',
    sources: [{ title: 'Kaynak', uri: 'https://example.com' }],
    ...over,
});

const idsOf = (r) => r.flags.map((f) => f.id);

describe('namesMatch', () => {
    it('matches the same person written the same way', () => {
        expect(namesMatch('Kerem Aydın', 'Kerem Aydın')).toBe(true);
        expect(namesMatch('KEREM AYDIN', 'kerem aydın')).toBe(true);
    });

    it('ignores middle names and reversed order', () => {
        expect(namesMatch('Mehmet Ali Yılmaz', 'Mehmet Yılmaz')).toBe(true);
        expect(namesMatch('YILMAZ Mehmet', 'Mehmet Yılmaz')).toBe(true);
    });

    it('survives Turkish characters', () => {
        expect(namesMatch('Şule Güngör', 'Sule Gungor')).toBe(true);
        expect(namesMatch('İbrahim Çelik', 'Ibrahim Celik')).toBe(true);
    });

    // Soyada bakmak yetmez: "aday şirketin sahibi" iddiasını yaygın bir
    // soyadın üstüne kuramayız.
    it('does not match on surname alone', () => {
        expect(namesMatch('Ahmet Yılmaz', 'Mehmet Yılmaz')).toBe(false);
        expect(namesMatch('Kerem Aydın', 'Ali Aydın')).toBe(false);
    });

    it('refuses to match a single-word name', () => {
        expect(namesMatch('Hasan', 'Kerem Aydın')).toBe(false);
        expect(namesMatch('', 'Kerem Aydın')).toBe(false);
    });
});

describe('matchFounder', () => {
    it('finds the candidate among the founders', () => {
        expect(matchFounder('Kerem Aydın', ['Ayşe Kaya', 'Kerem Aydın'])).toBe('Kerem Aydın');
    });

    it('returns null when nobody matches', () => {
        expect(matchFounder('Kerem Aydın', ['Ayşe Kaya'])).toBeNull();
        expect(matchFounder('Kerem Aydın', null)).toBeNull();
        expect(matchFounder('', ['Kerem Aydın'])).toBeNull();
    });
});

describe('verifyCompanyClaim — no evidence is not an accusation', () => {
    it('reports unverified, never contradicted, when nothing was found', () => {
        const r = verifyCompanyClaim({ claim: claim(), evidence: null, candidateName: 'Kerem Aydın' });
        expect(r.verdict).toBe(CLAIM_VERDICT.UNVERIFIED);
        expect(r.flags.every((f) => f.severity === SEVERITY.INFO)).toBe(true);
    });

    it('says out loud that absence of evidence is not evidence of absence', () => {
        const r = verifyCompanyClaim({ claim: claim(), evidence: {}, candidateName: 'Kerem Aydın' });
        expect(r.flags[0].detail).toContain('var olmadığı anlamına GELMEZ');
    });
});

describe('verifyCompanyClaim — the founder-match case', () => {
    it('surfaces that the candidate founded the company, as context not a verdict', () => {
        const r = verifyCompanyClaim({
            claim: claim(),
            evidence: evidence({ registry: { source: 'Ticaret Sicil Gazetesi', foundedYear: 2021, founders: ['Kerem Aydın'] } }),
            candidateName: 'Kerem Aydın',
        });
        const f = r.flags.find((x) => x.id === 'aday-kurucu');
        expect(f.severity).toBe(SEVERITY.ATTENTION);
        expect(f.detail).toContain('ticaret sicili');
        expect(f.question).toContain('ekip büyüklüğü');
        // Kendi şirketi olması, şirketin var olduğunu yalanlamaz.
        expect(r.verdict).toBe(CLAIM_VERDICT.VERIFIED);
    });

    it('marks a web-only founder match as weaker evidence', () => {
        const r = verifyCompanyClaim({
            claim: claim(),
            evidence: evidence({ founders: ['Kerem Aydın'] }),
            candidateName: 'Kerem Aydın',
        });
        expect(r.flags.find((x) => x.id === 'aday-kurucu').detail).toContain('sicil kaydıyla teyit edilmedi');
    });

    it('stays quiet when the founder is someone else', () => {
        const r = verifyCompanyClaim({
            claim: claim(),
            evidence: evidence({ registry: { foundedYear: 2015, founders: ['Ayşe Kaya'] } }),
            candidateName: 'Kerem Aydın',
        });
        expect(idsOf(r)).not.toContain('aday-kurucu');
    });

    it('flags a manager title at a three-person company as worth asking about', () => {
        const r = verifyCompanyClaim({
            claim: claim({ role: 'Growth Manager' }),
            evidence: evidence({ sizeBand: '1-10' }),
            candidateName: 'Kerem Aydın',
        });
        expect(r.flags.find((x) => x.id === 'unvan-olcek').severity).toBe(SEVERITY.ATTENTION);
    });

    it('does not flag a non-manager title at a small company', () => {
        const r = verifyCompanyClaim({
            claim: claim({ role: 'Growth Specialist' }),
            evidence: evidence({ sizeBand: '1-10' }),
        });
        expect(idsOf(r)).not.toContain('unvan-olcek');
    });
});

describe('verifyCompanyClaim — evidence strength is ranked', () => {
    // Sicil kaydı hukuki belge: şirket kurulmadan orada çalışılamaz.
    it('treats a registry founding date after the claimed start as a contradiction', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2018 }),
            evidence: evidence({ registry: { foundedYear: 2021, founders: [] } }),
        });
        expect(r.verdict).toBe(CLAIM_VERDICT.CONTRADICTED);
        expect(r.flags.find((x) => x.id === 'kurulus-sonrasi').severity).toBe(SEVERITY.CONTRADICTION);
    });

    // Web sayfasının iddiası sicil değil — aynı belirti, bir basamak düşük.
    it('downgrades the same finding when the founding year came from a search', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2018 }),
            evidence: evidence({ foundedYear: 2021 }),
        });
        const f = r.flags.find((x) => x.id === 'kurulus-sonrasi');
        expect(f.severity).toBe(SEVERITY.ATTENTION);
        expect(f.detail).toContain('Sicil kaydıyla teyit edilmedi');
        expect(r.verdict).toBe(CLAIM_VERDICT.VERIFIED);
    });

    // Domain, şirketten sonra alınmış olabilir — dolaylı kanıt.
    it('treats a late domain registration as attention, not contradiction', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2015 }),
            evidence: evidence({ domainCreatedYear: 2022 }),
        });
        expect(r.verdict).toBe(CLAIM_VERDICT.VERIFIED);
        expect(r.flags.find((x) => x.id === 'domain-yasi').severity).toBe(SEVERITY.ATTENTION);
    });

    it('tolerates a one-year gap between founding and the claimed start', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2020 }),
            evidence: evidence({ registry: { foundedYear: 2021, founders: [] } }),
        });
        expect(idsOf(r)).not.toContain('kurulus-sonrasi');
    });

    it('does not double-report when the registry already settled the date', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2022 }),
            evidence: evidence({ registry: { foundedYear: 2021, founders: [] }, domainCreatedYear: 2026 }),
        });
        expect(idsOf(r)).not.toContain('domain-yasi');
    });

    it('verifies a clean claim with no flags at all', () => {
        const r = verifyCompanyClaim({
            claim: claim({ startYear: 2022, role: 'Growth Specialist' }),
            evidence: evidence({ registry: { foundedYear: 2015, founders: ['Ayşe Kaya'] }, sizeBand: '51-200' }),
            candidateName: 'Kerem Aydın',
        });
        expect(r.verdict).toBe(CLAIM_VERDICT.VERIFIED);
        expect(r.flags).toEqual([]);
    });
});

describe('summarizeCompanyVerification', () => {
    it('keeps the three verdicts apart instead of collapsing them to a percentage', () => {
        const s = summarizeCompanyVerification([
            { verdict: CLAIM_VERDICT.VERIFIED, flags: [] },
            { verdict: CLAIM_VERDICT.UNVERIFIED, flags: [{ id: 'a' }] },
            { verdict: CLAIM_VERDICT.CONTRADICTED, flags: [{ id: 'b' }] },
        ]);
        expect(s.counts).toEqual({ dogrulandi: 1, dogrulanamadi: 1, celiski: 1 });
        expect(s.hasContradiction).toBe(true);
        expect(s.flags).toHaveLength(2);
    });

    it('handles an empty or malformed list', () => {
        expect(summarizeCompanyVerification([]).total).toBe(0);
        expect(summarizeCompanyVerification(null).hasContradiction).toBe(false);
        expect(summarizeCompanyVerification([null, {}]).total).toBe(2);
    });
});
