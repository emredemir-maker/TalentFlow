// ANLATIM ÇAĞRISI DÜŞERSE SESSİZ KALINMAZ.
//
// Skor ve anlatım paralel iki çağrı; `Promise.allSettled` ikisini birlikte
// bekliyor ve anlatımın reddini YUTUYORDU. Sonuç: skor kurtuluyor, tarama
// "başarılı" görünüyor, kayda BOŞ metinler yazılıyor.
//
// Ekrandaki hâli: puanları olan ama tek satır gerekçesi olmayan STAR
// kartları. Kullanıcı bunu defalarca yeniden analiz ederek çözmeye çalıştı
// ve neden dolmadığını hiçbir yerden öğrenemedi — çünkü sistem eksikliği
// hiç bildirmiyordu.
//
// Kısmi bir başarısızlığı tam bir sonuç gibi göstermek, bu projede tekrar
// eden hata. Sebep artık kayda giriyor ve ekran onu yazıyor.
import { describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('./config.js', () => ({
    getModel: vi.fn(async () => ({ generateContent })),
    getAuthHeaders: vi.fn(),
}));

const SCORE_OK = JSON.stringify({
    assessments: [{ index: 1, status: 'met', kind: 'deneyim' }],
    star: { Situation: 3, Task: 3, Action: 3, Result: 3 },
});

const { extractCandidateEvidence } = await import('./extraction.js');

/** Skor çağrısı başarılı, anlatım çağrısı verilen şekilde davranır. */
function mockCalls({ narrative }) {
    generateContent.mockReset();
    generateContent.mockImplementation(async (_prompt, opts) => {
        if (opts?.label === 'coverage') return { response: { text: () => SCORE_OK } };
        return { response: { text: () => narrative } };
    });
}

describe('narrativeError', () => {
    it('is null when the narrative call succeeds', async () => {
        mockCalls({
            narrative: JSON.stringify({
                extractedData: {
                    totalYearsOfExperience: 5,
                    requirementCoverage: { notes: [{ index: 1, note: 'var', evidence: 'CV dayanağı' }] },
                    starAnalysis: { Situation: { evidence: 'Rol yazılmış' } },
                },
                evidence: { reasoning: [], summary: 'özet' },
            }),
        });
        const out = await extractCandidateEvidence('ilan', { cvData: 'metin' });
        expect(out.narrativeError).toBeNull();
        expect(out.extractedData.starAnalysis.Situation.evidence).toBe('Rol yazılmış');
    });

    it('carries the reason when the narrative call fails', async () => {
        // Okunamayan yanıt: runNarrative hata fırlatır
        mockCalls({ narrative: 'bu JSON değil' });
        const out = await extractCandidateEvidence('ilan', { cvData: 'metin' });
        expect(out.narrativeError).toMatch(/JSON olarak okunamadı/);
    });

    it('still returns the score when the narrative failed', async () => {
        // Ayrı çağrı olmasının bütün amacı bu: anlatım düşse bile skor ayakta
        mockCalls({ narrative: 'bu JSON değil' });
        const out = await extractCandidateEvidence('ilan', { cvData: 'metin' });
        expect(out.extractedData.requirementCoverage.assessments).toHaveLength(1);
        expect(out.extractedData.starAnalysis.Situation.score).toBe(3);
    });

    it('leaves the texts empty rather than inventing them', async () => {
        mockCalls({ narrative: 'bu JSON değil' });
        const out = await extractCandidateEvidence('ilan', { cvData: 'metin' });
        expect(out.extractedData.starAnalysis.Situation.evidence).toBe('');
        expect(out.extractedData.requirementCoverage.assessments[0].note).toBe('');
    });
});
