// Teknik hata ile "uygun değil" ayrımı.
//
// NEDEN: deepScanCandidate ve rescanCandidateForPosition, AI çağrısının
// hatasını BOŞ bir catch ile yutup 'no_result' dönüyordu. Ekranda bu
// "Analiz sonuç üretmedi. Adayın CV metnini kontrol edip tekrar deneyin."
// mesajına dönüşüyordu — kullanıcı 2026-08-06'da kusursuz CV'si olan bir
// adayda bu hatayı bildirdi ve CV'de hata aradı. Gerçek sebep kota aşımı ya
// da bozuk AI yanıtı olabilir; ikisi de CV ile ilgisiz.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./geminiService', () => ({ analyzeCandidateMatch: vi.fn() }));
vi.mock('./matchService', () => ({
    calculateMatchScore: vi.fn(() => ({ score: 50 })),
    filterPositionsByDomain: vi.fn((_c, positions) => positions),
    findBestPositionMatch: vi.fn((_c, positions) => positions[0]),
}));

const { analyzeCandidateMatch } = await import('./geminiService');
const { deepScanCandidate, rescanCandidateForPosition } = await import('./scanService');

const CANDIDATE = {
    id: 'c1',
    cvText: 'Growth ürün yöneticisi olarak funnel sahipliği ve A/B test deneyimi. '.repeat(3),
};
const POSITIONS = [
    { id: 'p1', title: 'Growth Product Manager', requirements: ['Funnel sahipliği'] },
    { id: 'p2', title: 'Product Manager', requirements: ['Ürün yönetimi'] },
];

beforeEach(() => {
    vi.clearAllMocks();
});

describe('deepScanCandidate — teknik hata ayrımı', () => {
    it('reports analysis_failed (not no_result) when every AI call throws', async () => {
        analyzeCandidateMatch.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('analysis_failed');
        expect(out.updates).toBeUndefined();
    });

    it('carries the real error message so the UI can stop blaming the CV', async () => {
        analyzeCandidateMatch.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.failures[0].message).toContain('429');
        expect(out.failures[0].position).toBeTruthy();
    });

    it('still says no_result when the calls succeed but nothing scores above zero', async () => {
        // Bu GERÇEKTEN bir uygunluk sonucudur; teknik hata değil
        analyzeCandidateMatch.mockResolvedValue({ score: 0, summary: 's' });

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('no_result');
        expect(out.failures).toEqual([]);
    });

    it('succeeds when at least one position works, even if others fail', async () => {
        // Kısmi hata taramayı durdurmamalı — eski davranışın doğru yanı
        analyzeCandidateMatch
            .mockRejectedValueOnce(new Error('bozuk yanıt'))
            .mockResolvedValueOnce({ score: 72, summary: 'iyi' });

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('scanned');
        expect(out.updates.aiScore).toBe(72);
    });

    it('keeps skipped_no_cv for candidates that genuinely have no CV', async () => {
        const out = await deepScanCandidate({ id: 'c2', cvText: '' }, POSITIONS);

        expect(out.status).toBe('skipped_no_cv');
        expect(analyzeCandidateMatch).not.toHaveBeenCalled();
    });
});

describe('rescanCandidateForPosition — teknik hata ayrımı', () => {
    const POSITION = POSITIONS[0];

    it('reports analysis_failed with the reason when the AI call throws', async () => {
        analyzeCandidateMatch.mockRejectedValue(new Error('AI yanıtı JSON olarak okunamadı'));

        const out = await rescanCandidateForPosition(CANDIDATE, POSITION);

        expect(out.status).toBe('analysis_failed');
        expect(out.failures[0].message).toContain('JSON');
    });

    it('keeps no_result for a genuine zero score', async () => {
        analyzeCandidateMatch.mockResolvedValue({ score: 0 });

        const out = await rescanCandidateForPosition(CANDIDATE, POSITION);

        expect(out.status).toBe('no_result');
    });

    it('scans normally on success', async () => {
        analyzeCandidateMatch.mockResolvedValue({ score: 64, summary: 'ok' });

        const out = await rescanCandidateForPosition(CANDIDATE, POSITION);

        expect(out.status).toBe('scanned');
        expect(out.updates.positionAnalyses['Growth Product Manager'].score).toBe(64);
    });
});
