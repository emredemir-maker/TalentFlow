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

    it('treats an all-zero scan as a RESULT, not a failure', async () => {
        // BU TEST ESKİDEN TERSİNİ SABİTLİYORDU ('no_result' bekliyordu) ve
        // böylece bir hatayı "istenen davranış" diye pinlemişti. Canlıda
        // bedeli görüldü: tüm analizler çöpe gidiyor, aday bayat kalıyor ve
        // kullanıcı yapılandırma hatası sanıp ilan arıyordu.
        //
        // 0 puan bir uygunluk SONUCUDUR ve teknik hata değildir — ama bu,
        // sonucu atmak için değil SAKLAMAK için bir sebep.
        analyzeCandidateMatch.mockResolvedValue({ score: 0, summary: 's' });

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('scanned');
        expect(out.noneScored).toBe(true);
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

    // ADAY KARTINDAN "BU İLANA GÖRE DEĞERLENDİR" BU YOLU ÇAĞIRIYOR.
    //
    // Kaydın hangi madde listesine ve hangi damgalama kuralına ait olduğu
    // yazılmazsa, ilan sonradan değiştiğinde eski yargı yanlış maddeye yapışır
    // ve ekran bayatlığı gösteremez. Tarih POZİSYON BAŞINA tutulur: adayın
    // `lastScannedAt` alanı tek bir tarih taşıyor ve üç ilana karşı üç ayrı
    // günde değerlendirilmiş bir adayda hangisinin ne zaman yapıldığını
    // söyleyemiyor.
    it('stamps the analysis so the screen can tell whether it is stale', async () => {
        analyzeCandidateMatch.mockResolvedValue({ score: 64, summary: 'ok' });

        const out = await rescanCandidateForPosition(CANDIDATE, POSITION);
        const saved = out.updates.positionAnalyses['Growth Product Manager'];

        expect(saved.requirementsFingerprint).toBeTruthy();
        expect(saved.coverageSchema).toBeGreaterThan(0);
        expect(Date.parse(saved.analyzedAt)).not.toBeNaN();
    });

    // Diğer ilanların analizine DOKUNULMAZ: aday kartından tek bir ilanı
    // değerlendirmek, öbür ilanların skorunu silmemeli.
    it('leaves the other positions’ analyses untouched', async () => {
        analyzeCandidateMatch.mockResolvedValue({ score: 64, summary: 'ok' });

        const withOther = { ...CANDIDATE, positionAnalyses: { 'Başka İlan': { score: 42 } } };
        const out = await rescanCandidateForPosition(withOther, POSITION);

        expect(out.updates.positionAnalyses['Başka İlan']).toEqual({ score: 42 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SIFIR BİR SONUÇTUR, HATA DEĞİL.
//
// Canlıda görüldü: kullanıcı bir adayı yeniden analiz etti ve ekranda
// "Analiz tamamlandı ancak hiçbir açık pozisyon için 0'dan büyük skor
// çıkmadı. Adayın alanına uygun bir pozisyon açık mı, kontrol edin." yazdı.
// Kullanıcı bunu bir yapılandırma sorunu sanıp ilan aradı.
//
// Oysa ölçüm YAPILMIŞTI. AI çağrıları gitmiş, para ödenmiş, madde damgaları
// üretilmişti — ve hepsi çöpe atılıyordu, çünkü `bestResult` yalnızca skor
// 0'dan büyükse yazılıyordu. Aday bayat analiziyle kalıyor, kullanıcı tekrar
// tarayıp aynı parayı yeniden ödüyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('deepScanCandidate — sıfır puanlı sonuç', () => {
    const zeroResult = {
        score: 0,
        summary: 'Aday bu ilanın hiçbir maddesini karşılamıyor.',
        starAnalysis: { Situation: { score: 2 }, Task: { score: 2 }, Action: { score: 1 }, Result: { score: 1 } },
        requirementCoverage: { assessments: [{ index: 1, status: 'missing' }] },
    };

    it('saves the analyses instead of throwing the paid work away', async () => {
        analyzeCandidateMatch.mockResolvedValue(zeroResult);

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('scanned');
        expect(out.updates.positionAnalyses['Growth Product Manager']).toBeTruthy();
        expect(out.updates.positionAnalyses['Product Manager']).toBeTruthy();
    });

    it('tells the caller this was a measurement, not a misconfiguration', () => {
        // Arayüz doğru cümleyi ancak bu bayrakla kurabiliyor
        analyzeCandidateMatch.mockResolvedValue(zeroResult);
        return deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false })
            .then((out) => {
                expect(out.noneScored).toBe(true);
                expect(out.produced).toBe(2);
            });
    });

    it('does NOT promote a zero-scoring position to "best match"', async () => {
        // 0 alan bir ilanı en iyi eşleşme diye yazmak, olmayan bir uyumu
        // varmış gibi göstermek olurdu
        analyzeCandidateMatch.mockResolvedValue(zeroResult);
        const withMatch = { ...CANDIDATE, matchedPositionTitle: 'Eski Eşleşme' };

        const out = await deepScanCandidate(withMatch, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.updates.matchedPositionTitle).toBe('Eski Eşleşme');
    });

    it('still promotes the best position when something actually scored', async () => {
        analyzeCandidateMatch
            .mockResolvedValueOnce({ ...zeroResult, score: 0 })
            .mockResolvedValueOnce({ ...zeroResult, score: 42 });

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.noneScored).toBe(false);
        expect(out.updates.matchedPositionTitle).toBe('Product Manager');
        expect(out.updates.aiScore).toBe(42);
    });

    it('keeps analysis_failed distinct — a thrown call is not a zero', async () => {
        // İkisini karıştırmak, kota aşımını "aday uygun değil" diye
        // göstermek olurdu
        analyzeCandidateMatch.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

        const out = await deepScanCandidate(CANDIDATE, POSITIONS, { allowUnrelatedFallback: false });

        expect(out.status).toBe('analysis_failed');
        expect(out.noneScored).toBeUndefined();
    });
});
