// SKORUN DAYANAĞI.
//
// Buradaki en önemli testler YANLIŞ ATIF YAPMAYANLAR. Yanlış atıf, hiç atıf
// yapmamaktan kötüdür: karar vericiye var olmayan bir örüntü gösterir ve o
// örüntüye bakarak insan hakkında karar verir.
//
// İkinci grup: atfedilemeyen maddeyi SAYAN testler. Yalnızca bağlananları
// göstermek tabloyu olduğundan kesin gösterir — dörtte üçü atfedilememiş bir
// dağılıma bakıp "skorun tamamı şu şirketten" sonucu çıkarmak en kötü hata.
import { describe, expect, it } from 'vitest';

import { companyTokens, attributeEvidence, buildScoreProvenance, dominantSource } from './scoreProvenance';

const exp = (company, role, duration) => ({ company, role, duration, desc: '' });

const EXPERIENCES = [
    exp('Pawn Interactive', 'CEO / Co-Founder', 'Oca 2021 - Halen'),
    exp('F. Kızmaz', 'Software Product Manager', '2024 - Halen'),
    exp('Pera Games', 'Product Manager', 'Oca 2020 - Haz 2020'),
];

const assessment = (index, status, evidence) => ({ index, status, evidence });

const analysisWith = (list) => ({ requirementCoverage: { assessments: list } });

const REQUIREMENTS = ['Funnel sahipliği', 'A/B test', 'B2B SaaS', 'SQL', 'Ekip yönetimi', 'Roadmap'];

const build = (assessments, over = {}) => buildScoreProvenance({
    analysis: analysisWith(assessments),
    requirements: REQUIREMENTS,
    candidate: { experiences: EXPERIENCES, ...over },
});

describe('companyTokens', () => {
    it('drops legal suffixes that appear in every company name', () => {
        expect(companyTokens('Pawn Interactive Ltd. Şti.')).toEqual(['pawn', 'interactive']);
        expect(companyTokens('Delta Yazılım A.Ş.')).toEqual(['delta', 'yazilim']);
    });

    // Üç harfli bir ad dayanak metninde tesadüfen geçer ve maddeyi YANLIŞ
    // şirkete atfeder.
    it('refuses tokens too short to identify anything', () => {
        expect(companyTokens('F. Kızmaz')).toEqual(['kizmaz']);
        expect(companyTokens('ABC')).toEqual([]);
        expect(companyTokens('')).toEqual([]);
    });
});

describe('attributeEvidence', () => {
    it('finds the company named in the evidence', () => {
        expect(attributeEvidence('Pawn Interactive bünyesinde funnel sahipliği yaptı', EXPERIENCES)).toBe(0);
        expect(attributeEvidence('F. Kızmaz döneminde roadmap kurdu', EXPERIENCES)).toBe(1);
    });

    it('survives Turkish suffixes glued to the company name', () => {
        expect(attributeEvidence("Pera Games'te ürün yönetimi", EXPERIENCES)).toBe(2);
        expect(attributeEvidence('Pawn Interactive’de A/B testleri', EXPERIENCES)).toBe(0);
    });

    // EN UZUN EŞLEŞME KAZANIR: aksi hâlde atfı anlamsız bir sıra belirlerdi.
    it('prefers the more specific company when two could match', () => {
        const list = [exp('Delta', 'Dev', '2020'), exp('Delta Yazılım', 'Dev', '2021')];
        expect(attributeEvidence('Delta Yazılım ekibinde çalıştı', list)).toBe(1);
    });

    // ASIL KORUMA: bağlanamayan dayanak yanlış bir şirkete iliştirilmemeli.
    it('returns null rather than guessing', () => {
        expect(attributeEvidence('Beş yıllık ürün yönetimi deneyimi', EXPERIENCES)).toBeNull();
        expect(attributeEvidence('', EXPERIENCES)).toBeNull();
        expect(attributeEvidence('Pawn Interactive', [])).toBeNull();
    });

    it('does not match on a fragment of the name', () => {
        // "Pawn" tek başına yetmez; "Interactive" de geçmeli.
        expect(attributeEvidence('Pawn adlı projede çalıştı', EXPERIENCES)).toBeNull();
    });
});

describe('buildScoreProvenance', () => {
    it('groups the scoring items by the job they came from', () => {
        const p = build([
            assessment(1, 'met', 'Pawn Interactive funnel sahipliği'),
            assessment(2, 'met', 'Pawn Interactive A/B testleri'),
            assessment(3, 'partial', 'F. Kızmaz B2B SaaS ürünü'),
        ]);
        expect(p.total).toBe(3);
        expect(p.attributed).toBe(3);
        expect(p.groups[0]).toMatchObject({ company: 'Pawn Interactive', count: 2 });
        expect(p.groups[1]).toMatchObject({ company: 'F. Kızmaz', count: 1 });
    });

    it('orders the biggest contributor first', () => {
        const p = build([
            assessment(1, 'met', 'F. Kızmaz roadmap'),
            assessment(2, 'met', 'Pawn Interactive funnel'),
            assessment(3, 'met', 'Pawn Interactive SQL'),
            assessment(4, 'met', 'Pawn Interactive ekip'),
        ]);
        expect(p.groups.map((g) => g.count)).toEqual([3, 1]);
    });

    // Karşılanmayan madde skora katkı vermiyor; atfetmek anlamsız satır üretirdi.
    it('ignores requirements the candidate does not meet', () => {
        const p = build([
            assessment(1, 'met', 'Pawn Interactive funnel'),
            assessment(2, 'missing', 'Pawn Interactive hiçbir kanıt yok'),
        ]);
        expect(p.total).toBe(1);
        expect(p.groups).toHaveLength(1);
    });

    // ASIL KORUMA: atfedilemeyen madde gizlenmez, SAYILIR.
    it('counts what it could not attribute instead of hiding it', () => {
        const p = build([
            assessment(1, 'met', 'Pawn Interactive funnel'),
            assessment(2, 'met', 'Beş yıllık genel deneyim'),
            assessment(3, 'met', 'Sektörde uzun süredir çalışıyor'),
        ]);
        expect(p.total).toBe(3);
        expect(p.attributed).toBe(1);
        expect(p.unattributed).toBe(2);
    });

    // "Atfedilemedi" ile "bu analiz eski, dayanak alanı yok" farklı şeyler.
    it('reports whether the analysis carries evidence at all', () => {
        expect(build([assessment(1, 'met', '')]).hasEvidence).toBe(false);
        expect(build([assessment(1, 'met', 'Pawn Interactive funnel')]).hasEvidence).toBe(true);
    });

    it('carries the requirement text so the UI can name the item', () => {
        const p = build([assessment(2, 'met', 'Pawn Interactive A/B testleri')]);
        expect(p.groups[0].items[0]).toMatchObject({ index: 2, text: 'A/B test', status: 'met' });
    });

    it('attaches what the verification layer knows about the company', () => {
        const p = build(
            [assessment(1, 'met', 'Pawn Interactive funnel')],
            {
                verificationReport: {
                    companies: [{
                        company: 'Pawn Interactive',
                        verdict: 'dogrulanamadi',
                        evidence: { sizeBand: '1-10', sectorRaw: 'oyun', founders: ['Hasan Asgar'] },
                    }],
                },
            }
        );
        expect(p.groups[0].facts).toMatchObject({ verdict: 'dogrulanamadi', sizeBand: '1-10', isFounder: true });
    });

    it('leaves facts null when the company was never verified', () => {
        expect(build([assessment(1, 'met', 'Pawn Interactive funnel')]).groups[0].facts).toBeNull();
    });

    it('returns an empty result rather than throwing on missing data', () => {
        expect(buildScoreProvenance({}).total).toBe(0);
        expect(buildScoreProvenance({ analysis: null, candidate: null }).groups).toEqual([]);
        expect(build([]).total).toBe(0);
        expect(buildScoreProvenance({ analysis: analysisWith([assessment(1, 'met', 'x')]), candidate: { experiences: [] } }).total).toBe(0);
    });
});

describe('dominantSource', () => {
    // Bu, ekranın tek cümlelik özeti — "skorun beşte dördü şuradan".
    it('reports the share of the biggest contributor', () => {
        const p = build([
            assessment(1, 'met', 'Pawn Interactive funnel'),
            assessment(2, 'met', 'Pawn Interactive A/B'),
            assessment(3, 'met', 'Pawn Interactive SQL'),
            assessment(4, 'met', 'F. Kızmaz roadmap'),
        ]);
        const d = dominantSource(p);
        expect(d.company).toBe('Pawn Interactive');
        expect(d.share).toBeCloseTo(0.75, 5);
    });

    // Pay ATFEDİLEBİLENLERE oranlanır; atfedilemeyenleri paydaya koymak
    // baskınlığı olduğundan küçük gösterir ve gizlerdi.
    it('divides by what could be attributed, not by everything', () => {
        const p = build([
            assessment(1, 'met', 'Pawn Interactive funnel'),
            assessment(2, 'met', 'Genel deneyim'),
        ]);
        expect(dominantSource(p).share).toBe(1);
    });

    it('returns null when there is nothing to report', () => {
        expect(dominantSource(build([]))).toBeNull();
        expect(dominantSource(null)).toBeNull();
    });
});
