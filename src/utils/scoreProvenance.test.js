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

import { companyTokens, citedCompanies, buildScoreProvenance, dominantSource } from './scoreProvenance';

const exp = (company, role, duration) => ({ company, role, duration, desc: '' });

const EXPERIENCES = [
    exp('Vega Interactive', 'CEO / Co-Founder', 'Oca 2021 - Halen'),
    exp('M. Doruk', 'Software Product Manager', '2024 - Halen'),
    exp('Nova Games', 'Product Manager', 'Oca 2020 - Haz 2020'),
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
        expect(companyTokens('Vega Interactive Ltd. Şti.')).toEqual(['vega', 'interactive']);
        expect(companyTokens('Delta Yazılım A.Ş.')).toEqual(['delta', 'yazilim']);
    });

    // Üç harfli bir ad dayanak metninde tesadüfen geçer ve maddeyi YANLIŞ
    // şirkete atfeder.
    it('refuses tokens too short to identify anything', () => {
        expect(companyTokens('M. Doruk')).toEqual(['doruk']);
        expect(companyTokens('ABC')).toEqual([]);
        expect(companyTokens('')).toEqual([]);
    });
});

describe('citedCompanies', () => {
    it('finds the company named in the evidence', () => {
        expect(citedCompanies('Vega Interactive bünyesinde funnel sahipliği yaptı', EXPERIENCES)).toContain(0);
        expect(citedCompanies('M. Doruk döneminde roadmap kurdu', EXPERIENCES)).toContain(1);
    });

    it('survives Turkish suffixes glued to the company name', () => {
        expect(citedCompanies("Nova Games'te ürün yönetimi", EXPERIENCES)).toContain(2);
        expect(citedCompanies('Vega Interactive’de A/B testleri', EXPERIENCES)).toContain(0);
    });

    // Sıra spesifiklikten: en dar ad önce gelir.
    it('lists the more specific company first', () => {
        const list = [exp('Delta', 'Dev', '2020'), exp('Delta Yazılım', 'Dev', '2021')];
        expect(citedCompanies('Delta Yazılım ekibinde çalıştı', list)[0]).toBe(1);
    });

    // ASIL KORUMA: bağlanamayan dayanak yanlış bir şirkete iliştirilmemeli.
    it('returns null rather than guessing', () => {
        expect(citedCompanies('Beş yıllık ürün yönetimi deneyimi', EXPERIENCES)).toEqual([]);
        expect(citedCompanies('', EXPERIENCES)).toEqual([]);
        expect(citedCompanies('Vega Interactive', [])).toEqual([]);
    });

    it('does not match on a fragment of the name', () => {
        // "Vega" tek başına yetmez; "Interactive" de geçmeli.
        expect(citedCompanies('Vega adlı projede çalıştı', EXPERIENCES)).toEqual([]);
    });
});

describe('buildScoreProvenance', () => {
    it('groups the scoring items by the job they came from', () => {
        const p = build([
            assessment(1, 'met', 'Vega Interactive funnel sahipliği'),
            assessment(2, 'met', 'Vega Interactive A/B testleri'),
            assessment(3, 'partial', 'M. Doruk B2B SaaS ürünü'),
        ]);
        expect(p.total).toBe(3);
        expect(p.attributed).toBe(3);
        expect(p.groups[0]).toMatchObject({ company: 'Vega Interactive', count: 2 });
        expect(p.groups[1]).toMatchObject({ company: 'M. Doruk', count: 1 });
    });

    it('orders the biggest contributor first', () => {
        const p = build([
            assessment(1, 'met', 'M. Doruk roadmap'),
            assessment(2, 'met', 'Vega Interactive funnel'),
            assessment(3, 'met', 'Vega Interactive SQL'),
            assessment(4, 'met', 'Vega Interactive ekip'),
        ]);
        expect(p.groups.map((g) => g.count)).toEqual([3, 1]);
    });

    // Karşılanmayan madde skora katkı vermiyor; atfetmek anlamsız satır üretirdi.
    it('ignores requirements the candidate does not meet', () => {
        const p = build([
            assessment(1, 'met', 'Vega Interactive funnel'),
            assessment(2, 'missing', 'Vega Interactive hiçbir kanıt yok'),
        ]);
        expect(p.total).toBe(1);
        expect(p.groups).toHaveLength(1);
    });

    // ASIL KORUMA: atfedilemeyen madde gizlenmez, SAYILIR.
    it('counts what it could not attribute instead of hiding it', () => {
        const p = build([
            assessment(1, 'met', 'Vega Interactive funnel'),
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
        expect(build([assessment(1, 'met', 'Vega Interactive funnel')]).hasEvidence).toBe(true);
    });

    it('carries the requirement text so the UI can name the item', () => {
        const p = build([assessment(2, 'met', 'Vega Interactive A/B testleri')]);
        expect(p.groups[0].items[0]).toMatchObject({ index: 2, text: 'A/B test', status: 'met' });
    });

    it('attaches what the verification layer knows about the company', () => {
        const p = build(
            [assessment(1, 'met', 'Vega Interactive funnel')],
            {
                verificationReport: {
                    companies: [{
                        company: 'Vega Interactive',
                        verdict: 'dogrulanamadi',
                        evidence: { sizeBand: '1-10', sectorRaw: 'oyun', founders: ['Kerem Aydın'] },
                    }],
                },
            }
        );
        expect(p.groups[0].facts).toMatchObject({ verdict: 'dogrulanamadi', sizeBand: '1-10', isFounder: true });
    });

    it('leaves facts null when the company was never verified', () => {
        expect(build([assessment(1, 'met', 'Vega Interactive funnel')]).groups[0].facts).toBeNull();
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
            assessment(1, 'met', 'Vega Interactive funnel'),
            assessment(2, 'met', 'Vega Interactive A/B'),
            assessment(3, 'met', 'Vega Interactive SQL'),
            assessment(4, 'met', 'M. Doruk roadmap'),
        ]);
        const d = dominantSource(p);
        expect(d.company).toBe('Vega Interactive');
        expect(d.share).toBeCloseTo(0.75, 5);
    });

    // Pay ATFEDİLEBİLENLERE oranlanır; atfedilemeyenleri paydaya koymak
    // baskınlığı olduğundan küçük gösterir ve gizlerdi.
    it('divides by what could be attributed, not by everything', () => {
        const p = build([
            assessment(1, 'met', 'Vega Interactive funnel'),
            assessment(2, 'met', 'Genel deneyim'),
        ]);
        expect(dominantSource(p).share).toBe(1);
    });

    it('returns null when there is nothing to report', () => {
        expect(dominantSource(build([]))).toBeNull();
        expect(dominantSource(null)).toBeNull();
    });
});

// ── CANLIDA GÖRÜLEN HATA ────────────────────────────────────────────────────
// Madde değerlendirmeleri İKİ FARKLI YOLDA durabiliyor: kökte ya da
// `scoreData` altında (analyzeCandidateMatch sonucu oraya yazıyor).
//
// Modül kendi çözücüsünü tutuyordu ve yalnızca kök yolu okuyordu. Sonuç:
// kayıtları `scoreData` altında olan adaylarda blok "hiç karşılanan madde
// yok" sanıp SESSİZCE görünmez oluyordu — hata değil, boşluk. Gerçek bir
// adayda dayanak metinleri şirket adlarıyla dopdolu olduğu hâlde tablo hiç
// çıkmadı.
//
// Çözücü artık coverageDetail.js ile paylaşılıyor; iki kopya olsaydı aynı
// hata er geç tekrarlanırdı.
describe('değerlendirmelerin durduğu yol', () => {
    const items = [
        assessment(1, 'met', 'Vega Interactive funnel sahipliği'),
        assessment(2, 'met', 'M. Doruk roadmap'),
    ];

    const runWith = (analysis) => buildScoreProvenance({
        analysis,
        requirements: REQUIREMENTS,
        candidate: { experiences: EXPERIENCES },
    });

    it('reads assessments stored at the root', () => {
        expect(runWith({ requirementCoverage: { assessments: items } }).total).toBe(2);
    });

    // ASIL HATA: bu yol okunmuyordu ve blok sessizce boş dönüyordu.
    it('reads assessments nested under scoreData', () => {
        const p = runWith({ scoreData: { requirementCoverage: { assessments: items } } });
        expect(p.total).toBe(2);
        expect(p.attributed).toBe(2);
        expect(p.groups.map((g) => g.company)).toEqual(['Vega Interactive', 'M. Doruk']);
    });

    it('prefers the root path when both are present', () => {
        const p = runWith({
            requirementCoverage: { assessments: [assessment(1, 'met', 'Vega Interactive funnel')] },
            scoreData: { requirementCoverage: { assessments: items } },
        });
        expect(p.total).toBe(1);
    });

    it('still returns empty when neither path has anything', () => {
        expect(runWith({}).total).toBe(0);
        expect(runWith({ scoreData: {} }).total).toBe(0);
    });
});

// ── CANLIDA GÖRÜLEN VERİ KAYBI ──────────────────────────────────────────────
// Ham `candidate.experiences` okumak bazı görevleri HİÇ görmüyordu: kayıtların
// bir kısmında geçmiş `careerHistory` altında duruyor ve alan adları değişiyor
// (title/position, period/dates). CV sekmesi doğru listeyi gösterirken
// doğrulama zinciri aynı adayın görevlerinin bir kısmını atlıyordu.
//
// Sessiz eksilme en tehlikeli türünden: görev listede yoksa kapsama (coverage)
// da yakalayamaz — kapsama okunamayan TARİHİ ölçüyor, eksik KAYDI değil.
describe('kariyer geçmişinin durduğu yol', () => {
    const items = [assessment(1, 'met', 'Fashion TV platformu büyüttü')];

    const runWith = (candidate) => buildScoreProvenance({
        analysis: analysisWith(items),
        requirements: REQUIREMENTS,
        candidate,
    });

    it('reads history from experiences', () => {
        const p = runWith({ experiences: [exp('Fashion TV', 'Lead PM', '2018 - 2021')] });
        expect(p.attributed).toBe(1);
        expect(p.groups[0].company).toBe('Fashion TV');
    });

    // ASIL HATA: bu yol okunmuyordu ve görev sessizce kayboluyordu.
    it('falls back to careerHistory when experiences is empty', () => {
        const p = runWith({ experiences: [], careerHistory: [exp('Fashion TV', 'Lead PM', '2018 - 2021')] });
        expect(p.attributed).toBe(1);
        expect(p.groups[0].company).toBe('Fashion TV');
    });

    it('accepts the alternate field names the CV tab already accepted', () => {
        const p = runWith({
            careerHistory: [{ company: 'Fashion TV', title: 'Lead PM', period: '2018 - 2021' }],
        });
        expect(p.attributed).toBe(1);
        expect(p.groups[0].role).toBe('Lead PM');
        expect(p.groups[0].duration).toBe('2018 - 2021');
    });
});

// ── CANLIDA GÖRÜLEN HATA: TEK ŞİRKET SEÇMEK ─────────────────────────────────
// İlk sürümde "en uzun eşleşme kazanır" kuralı vardı ve bir dayanak birden
// fazla şirket ansa bile yalnızca biri seçiliyordu. Oysa dayanak metinleri
// tam da böyle yazılıyor:
//
//   "8 yıllık ürün yönetimi deneyimi var (A, B, C, D). C'de platformu
//    büyütmüş; A'da monetization yönetmiş."
//
// Böyle bir maddeyi tek şirkete yazmak o şirketin payını ŞİŞİRİYOR ve
// diğerlerini tablodan tamamen siliyor — "bu skorun ne kadarı şu işe
// dayanıyor" sorusunu tam da yanlış yönde cevaplıyor.
describe('bir dayanak birden fazla işi anıyorsa', () => {
    const MULTI = 'Adayın 8 yıllık deneyimi var (Vega Interactive, M. Doruk, Nova Games). '
        + "Nova Games'te platformu büyütmüş; Vega Interactive'de monetization yönetmiş.";

    it('returns every company the evidence names, not just the longest', () => {
        const cited = citedCompanies(MULTI, EXPERIENCES);
        expect(cited).toHaveLength(3);
        expect(cited).toEqual(expect.arrayContaining([0, 1, 2]));
    });

    // ASIL HATA: Nova Games tablodan tamamen siliniyordu.
    it('gives every cited job its own row instead of erasing it', () => {
        const p = build([assessment(1, 'met', MULTI)]);
        expect(p.groups.map((g) => g.company).sort())
            .toEqual(['M. Doruk', 'Nova Games', 'Vega Interactive']);
    });

    it('marks the item as shared in every group', () => {
        const p = build([assessment(1, 'met', MULTI)]);
        expect(p.groups.every((g) => g.sharedCount === 1)).toBe(true);
        expect(p.groups.every((g) => g.items[0].shared === true)).toBe(true);
    });

    // Madde BİR KEZ atfedilmiş sayılır; üç grupta görünmesi onu üç madde yapmaz.
    it('counts the item once toward the attributed total', () => {
        const p = build([assessment(1, 'met', MULTI)]);
        expect(p.total).toBe(1);
        expect(p.attributed).toBe(1);
        expect(p.unattributed).toBe(0);
    });

    it('does not mark an item shared when only one job is named', () => {
        const p = build([assessment(1, 'met', 'Vega Interactive funnel sahipliği')]);
        expect(p.groups[0].sharedCount).toBe(0);
        expect(p.groups[0].items[0].shared).toBe(false);
    });
});
