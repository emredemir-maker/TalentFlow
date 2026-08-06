import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateText = vi.hoisted(() => vi.fn());
vi.mock('./gemini.js', () => ({ generateText: mockGenerateText }));
vi.mock('./pdf.js', () => ({ pdf: vi.fn() }));
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {},
    admin: { firestore: { FieldValue: { serverTimestamp: () => ({}) } } },
}));

const { needsEnrichment, extractExperiences, sanitizeLocation } = await import('./enrich.js');
const { sanitizeExperiences } = await import('./bulkWorker.js');

const LONG_CV = 'Deneyimli yazılım geliştirici. '.repeat(20); // > 200 karakter

describe('needsEnrichment', () => {
    it('true: uzun cvText var, experiences boş, daha önce denenmemiş', () => {
        expect(needsEnrichment({ cvText: LONG_CV, experiences: [] })).toBe(true);
        expect(needsEnrichment({ cvText: LONG_CV })).toBe(true);
    });
    it('false: kariyer geçmişi VE konum zaten dolu', () => {
        expect(needsEnrichment({
            cvText: LONG_CV,
            experiences: [{ company: 'X', duration: '2020' }],
            location: 'İstanbul',
        })).toBe(false);
    });
    it('true: kariyer geçmişi dolu ama konum boş — konum geri doldurulmalı', () => {
        // Konum, adaylar tablosundaki İstanbul içi/dışı filtresini besler ve
        // eski içe aktarma şeması bu alanı hiç istemedi.
        expect(needsEnrichment({
            cvText: LONG_CV,
            experiences: [{ company: 'X', duration: '2020' }],
        })).toBe(true);
    });
    it('false: cvText yok/kısa ya da eski PDF hata sentineli', () => {
        expect(needsEnrichment({ cvText: '' })).toBe(false);
        expect(needsEnrichment({ cvText: 'kısa metin' })).toBe(false);
        expect(needsEnrichment({ cvText: 'PDF Error: bozuk' + LONG_CV })).toBe(false);
    });
    it('false: daha önce denenmiş (enrichedAt damgalı) — boş sonuç sonsuz kuyruk yaratmaz', () => {
        expect(needsEnrichment({ cvText: LONG_CV, experiences: [], enrichedAt: { seconds: 1 } })).toBe(false);
    });
});

describe('extractExperiences', () => {
    beforeEach(() => mockGenerateText.mockReset());

    it('parses and sanitizes the experiences array', async () => {
        mockGenerateText.mockResolvedValue('{"location":"İstanbul, Türkiye","experiences": [{"role":"Dev","company":"Acme","duration":"2020-2023","desc":"x"}, {"role":"Eksik"}]}');
        const result = await extractExperiences(LONG_CV);
        expect(result.experiences).toEqual([{ role: 'Dev', company: 'Acme', duration: '2020-2023', desc: 'x' }]);
        expect(result.location).toBe('İstanbul, Türkiye');
    });

    it('returns empty values for a valid response with no experiences', async () => {
        mockGenerateText.mockResolvedValue('{"experiences": []}');
        expect(await extractExperiences(LONG_CV)).toEqual({ experiences: [], location: '' });
    });

    it('drops a placeholder location instead of persisting it', async () => {
        mockGenerateText.mockResolvedValue('{"location":"Bilinmiyor","experiences":[]}');
        expect((await extractExperiences(LONG_CV)).location).toBe('');
    });
});

describe('sanitizeLocation', () => {
    it('collapses whitespace and keeps a normal city string', () => {
        expect(sanitizeLocation('  İstanbul,   Türkiye ')).toBe('İstanbul, Türkiye');
    });

    it('rejects placeholders and absurdly long output', () => {
        expect(sanitizeLocation('bilinmiyor')).toBe('');
        expect(sanitizeLocation('N/A')).toBe('');
        expect(sanitizeLocation('-')).toBe('');
        expect(sanitizeLocation('x'.repeat(120))).toBe('');
        expect(sanitizeLocation(null)).toBe('');
    });

    it('returns null when the response is unparseable', async () => {
        mockGenerateText.mockResolvedValue('bu json değil');
        expect(await extractExperiences(LONG_CV)).toBeNull();
    });
});

describe('sanitizeExperiences', () => {
    it('drops entries without company or duration and normalizes fields', () => {
        expect(sanitizeExperiences([
            { role: 'Dev', company: 'Acme', duration: '2020' },
            { role: 'Şirketsiz', duration: '2019' },
            { role: 'Tarihsiz', company: 'X' },
            null,
        ])).toEqual([{ role: 'Dev', company: 'Acme', duration: '2020', desc: '' }]);
        expect(sanitizeExperiences('dizi değil')).toEqual([]);
    });
    it('caps the list at 20 entries', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ company: `C${i}`, duration: 'd' }));
        expect(sanitizeExperiences(many)).toHaveLength(20);
    });
});
