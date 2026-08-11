// Madde bazlı dayanak.
//
// Kritik ayrım: "henüz sorulmadı" ile "soruldu, bulunamadı" aynı şey değil.
// İkisini aynı boş kutuyla göstermek, kullanıcıya adayın dayanağı yokmuş gibi
// gösterir; oysa analiz bu alanlar eklenmeden önce yapılmıştır.
import { describe, expect, it } from 'vitest';

import {
    coverageDetail, coverageDetailState, hasCoverageDetail, usesCurrentRubric, COVERAGE_SCHEMA,
} from './coverageDetail';

const analysis = (assessments, extra = {}) => ({
    score: 70,
    coverageSchema: COVERAGE_SCHEMA,
    requirementCoverage: { assessments },
    ...extra,
});

const RICH = [
    {
        index: 1, status: 'met', kind: 'deneyim', note: 'Açık kanıt',
        evidence: "X'te 3 yıl kayıt-aktivasyon akışının sahibi",
        gap: 'Deneyimi B2C ölçekte; ilan B2B SaaS istiyor',
    },
    { index: 2, status: 'met', evidence: 'Haftalık deney döngüsü kurmuş', gap: '' },
    { index: 3, status: 'missing', evidence: '', gap: '' },
];

describe('hasCoverageDetail', () => {
    it('separates analyses produced before the fields existed', () => {
        expect(hasCoverageDetail(analysis(RICH))).toBe(true);
        expect(hasCoverageDetail({ requirementCoverage: { assessments: RICH } })).toBe(false);
        expect(hasCoverageDetail({ coverageSchema: 1 })).toBe(false);
        expect(hasCoverageDetail(null)).toBe(false);
    });
});

describe('coverageDetail', () => {
    it('returns the evidence and the gap for a requirement', () => {
        const d = coverageDetail(analysis(RICH), 1);
        expect(d.evidence).toContain('kayıt-aktivasyon');
        expect(d.gap).toContain('B2B SaaS');
        expect(d.hasDetail).toBe(true);
        expect(d.outdated).toBe(false);
    });

    it('treats a met requirement with no gap as complete, not lacking', () => {
        // Her maddeye kusur yazmak gerçek farkların görünmesini engeller
        const d = coverageDetail(analysis(RICH), 2);
        expect(d.gap).toBe('');
        expect(d.hasDetail).toBe(true);
    });

    it('has nothing to show for a missing requirement', () => {
        const d = coverageDetail(analysis(RICH), 3);
        expect(d.hasDetail).toBe(false);
        expect(d.status).toBe('missing');
    });

    it('reads assessments from the nested location too', () => {
        const nested = { coverageSchema: COVERAGE_SCHEMA, scoreData: { requirementCoverage: { assessments: RICH } } };
        expect(coverageDetail(nested, 1).evidence).toContain('kayıt-aktivasyon');
    });

    it('flags an analysis made before the fields were added', () => {
        const old = { requirementCoverage: { assessments: [{ index: 1, status: 'met', note: 'Kanıt var' }] } };
        const d = coverageDetail(old, 1);
        expect(d.outdated).toBe(true);
        expect(d.hasDetail).toBe(false);
        expect(d.note).toBe('Kanıt var');
    });

    it('drops filler the model sometimes writes instead of leaving a field empty', () => {
        const filler = analysis([{ index: 1, status: 'met', evidence: '-', gap: 'yok' }]);
        const d = coverageDetail(filler, 1);
        expect(d.evidence).toBe('');
        expect(d.gap).toBe('');
        expect(d.hasDetail).toBe(false);
    });

    it('returns null when there is nothing to read', () => {
        expect(coverageDetail(null, 1)).toBeNull();
        expect(coverageDetail({}, 1)).toBeNull();
        expect(coverageDetail(analysis(RICH), 9)).toBeNull();
    });
});

describe('coverageDetailState', () => {
    it('counts how many requirements actually carry detail', () => {
        const s = coverageDetailState(analysis(RICH));
        expect(s.total).toBe(3);
        expect(s.withDetail).toBe(2);
        expect(s.empty).toBe(false);
        expect(s.outdated).toBe(false);
    });

    it('distinguishes "not asked yet" from "asked, nothing found"', () => {
        // Bu ayrım arayüzün iki farklı mesaj göstermesini sağlıyor
        const old = { requirementCoverage: { assessments: [{ index: 1, status: 'met' }] } };
        expect(coverageDetailState(old)).toMatchObject({ outdated: true, empty: true });

        const asked = analysis([{ index: 1, status: 'missing', evidence: '', gap: '' }]);
        expect(coverageDetailState(asked)).toMatchObject({ outdated: false, empty: true });
    });

    it('handles an analysis with no assessments at all', () => {
        expect(coverageDetailState(null)).toMatchObject({ empty: true, total: 0 });
        expect(coverageDetailState({ coverageSchema: COVERAGE_SCHEMA })).toMatchObject({ total: 0 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// KURAL SÜRÜMÜ.
//
// Damgalama kuralı değişti: "kısmen" artık analog alanı da kapsıyor ve skor
// ayrı bir çağrıda üretiliyor. Eski kayıtların skoru YANLIŞ değil — ama
// bugünkü ölçüyle üretilmemiş. Aynı listede iki farklı ölçü varsa sıralama
// elmayla armudu kıyaslıyor demektir ve bunu gereksinim parmak izi yakalamaz.
// ─────────────────────────────────────────────────────────────────────────────
describe('usesCurrentRubric', () => {
    it('accepts an analysis produced with the current rubric', () => {
        expect(usesCurrentRubric({ coverageSchema: COVERAGE_SCHEMA })).toBe(true);
    });

    it('rejects one produced before the rubric was sharpened', () => {
        // Şema 2: dayanak/fark alanları vardı ama damgalama kuralı muğlaktı
        expect(usesCurrentRubric({ coverageSchema: 2 })).toBe(false);
        expect(usesCurrentRubric({ coverageSchema: 1 })).toBe(false);
        expect(usesCurrentRubric({})).toBe(false);
        expect(usesCurrentRubric(null)).toBe(false);
    });

    it('is separate from having evidence fields', () => {
        // Şema 2 kaydında dayanak VAR ama kural ESKİ — ikisi farklı sorular
        const schema2 = { coverageSchema: 2 };
        expect(hasCoverageDetail(schema2)).toBe(true);
        expect(usesCurrentRubric(schema2)).toBe(false);
    });
});
