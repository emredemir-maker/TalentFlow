// Tests for the bulk-import worker — Phase 4c.
//
// Scope: extractCvText (the dispatch logic for PDF/DOCX parsing).
// The worker loop itself (claimNextQueuedJob, runBulkWorkerLoop) interacts
// with Firestore + admin SDK and belongs in integration tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock pdf.js (ESM) — vi.mock intercepts. Mammoth is loaded via
// createRequire(import.meta.url) in bulkWorker.js, which bypasses vi.mock,
// so docx-path coverage is left for an integration test or a future PR
// that converts the createRequire import to ESM.
const mockPdf = vi.hoisted(() => vi.fn());
vi.mock('./pdf.js', () => ({ pdf: mockPdf }));

// Avoid pulling firebase-admin into tests. `mockWhereGet(field, value)`
// stands in for collection().where(field,'==',value).limit(1).get() so
// findDuplicateCandidate's query fan-out is testable.
const mockWhereGet = vi.hoisted(() => vi.fn());
vi.mock('../config/firebaseAdmin.js', () => ({
    db: {
        collection: () => ({
            where: (field, _op, value) => ({ limit: () => ({ get: () => mockWhereGet(field, value) }) }),
        }),
        runTransaction: vi.fn(),
    },
    admin: {
        firestore: { FieldValue: { serverTimestamp: () => ({}) } },
    },
}));

const {extractCvText, findDuplicateCandidate, resolvePreScore, matchOpenTitle, sanitizeSuggestedRole,
    calculateSimpleMatchScore, positionRequirements,
} = await import('./bulkWorker.js');

beforeEach(() => {
    mockPdf.mockReset();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('extractCvText', () => {
    it('routes pdf buffers to the pdf-parse helper', async () => {
        mockPdf.mockResolvedValue({ text: 'PDF body content here' });
        const buf = Buffer.from('fake-pdf-bytes');

        const result = await extractCvText(buf, 'pdf');

        expect(result).toBe('PDF body content here');
        expect(mockPdf).toHaveBeenCalledTimes(1);
        expect(mockPdf).toHaveBeenCalledWith(buf);
    });

    it('trims surrounding whitespace from extracted text', async () => {
        mockPdf.mockResolvedValue({ text: '\n\n   actual content   \n\n' });
        const result = await extractCvText(Buffer.from('x'), 'pdf');
        expect(result).toBe('actual content');
    });

    it('returns empty string when the parser yields no text', async () => {
        mockPdf.mockResolvedValue({ text: undefined });
        const result = await extractCvText(Buffer.from('x'), 'pdf');
        expect(result).toBe('');
    });

    it('throws on unsupported format with a Turkish error (caught + reported by the worker)', async () => {
        await expect(extractCvText(Buffer.from('x'), 'txt')).rejects.toThrow(
            /Desteklenmeyen format: txt/
        );
        await expect(extractCvText(Buffer.from('x'), 'jpg')).rejects.toThrow(
            /Desteklenmeyen format: jpg/
        );
    });

    it('propagates parser errors to the caller (worker treats them as item failure)', async () => {
        mockPdf.mockRejectedValue(new Error('corrupt PDF'));
        await expect(extractCvText(Buffer.from('x'), 'pdf')).rejects.toThrow(/corrupt PDF/);
    });
});

describe('findDuplicateCandidate', () => {
    const emptySnap = { empty: true, docs: [] };
    const hitSnap = { empty: false, docs: [{ id: 'existing-1', data: () => ({}) }] };

    beforeEach(() => {
        mockWhereGet.mockReset();
    });

    it('returns null without querying when neither email nor phone exists', async () => {
        const result = await findDuplicateCandidate({ name: 'Ali' }, {});
        expect(result).toBeNull();
        expect(mockWhereGet).not.toHaveBeenCalled();
    });

    it('finds an existing candidate by lowercased email', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'email' && value === 'ali@firma.com' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate({ email: '  Ali@Firma.com ' }, {});
        expect(result).toEqual({ id: 'existing-1', foundBy: 'email' });
    });

    it('uses the item email when the parsed profile has none', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'email' && value === 'json@kayit.com' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate(null, { email: 'json@kayit.com' });
        expect(result).toEqual({ id: 'existing-1', foundBy: 'email' });
    });

    it('falls back to normalized phone matching when email misses', async () => {
        mockWhereGet.mockImplementation((field, value) =>
            Promise.resolve(field === 'phone' && value === '905551112233' ? hitSnap : emptySnap)
        );
        const result = await findDuplicateCandidate({ email: 'yeni@aday.com', phone: '+90 555 111 22 33' }, {});
        expect(result).toEqual({ id: 'existing-1', foundBy: 'phone' });
    });

    it('returns null when no email or phone matches', async () => {
        mockWhereGet.mockResolvedValue(emptySnap);
        const result = await findDuplicateCandidate({ email: 'yok@aday.com', phone: '+90 555 000 00 00' }, {});
        expect(result).toBeNull();
    });
});

describe('sanitizeSuggestedRole', () => {
    it('keeps titles, joins multi-role lists, strips punctuation', () => {
        expect(sanitizeSuggestedRole('Growth Product Manager')).toBe('Growth Product Manager');
        expect(sanitizeSuggestedRole('Product Manager / Growth Lead')).toBe('Product Manager, Growth Lead');
        expect(sanitizeSuggestedRole('"Senior UI Engineer."')).toBe('Senior UI Engineer');
    });
    it('rejects commentary sentences → falls back to the CV role', () => {
        const yorum = 'Adayin profili dijital pazarlama alaninda cok guclu oldugu icin kendisine growth odakli roller onerilir';
        expect(sanitizeSuggestedRole(yorum, 'Marketing Specialist')).toBe('Marketing Specialist');
        expect(sanitizeSuggestedRole(null, 'X')).toBe('X');
    });
});

describe('matchOpenTitle', () => {
    it('matches case- and whitespace-insensitively, returning the canonical title', () => {
        expect(matchOpenTitle('  frontend developer ', ['Frontend Developer', 'İK Uzmanı'])).toBe('Frontend Developer');
        expect(matchOpenTitle('Backend Dev', ['Frontend Developer'])).toBeNull();
        expect(matchOpenTitle('', ['Frontend Developer'])).toBeNull();
        expect(matchOpenTitle(null, ['Frontend Developer'])).toBeNull();
    });
});

describe('resolvePreScore', () => {
    const OPEN = ['Frontend Dev', 'İK Uzmanı'];

    it('uses the Gemini score when valid and clamps to 0-100', () => {
        expect(resolvePreScore({ matchScore: 82, matchedPosition: 'Frontend Dev' }, '', OPEN)).toEqual({ score: 82, matchedTitle: 'Frontend Dev' });
        expect(resolvePreScore({ matchScore: 140, matchedPosition: 'Frontend Dev' }, '', OPEN).score).toBe(100);
        expect(resolvePreScore({ matchScore: 76.6, matchedPosition: 'Frontend Dev' }, '', OPEN).score).toBe(77);
    });

    it('the upload selection is binding — Gemini cannot override it', () => {
        expect(resolvePreScore({ matchScore: 60, matchedPosition: 'Backend Dev' }, 'İK Uzmanı', OPEN).matchedTitle).toBe('İK Uzmanı');
        expect(resolvePreScore({ matchScore: 60 }, 'İK Uzmanı', OPEN).matchedTitle).toBe('İK Uzmanı');
    });

    it('rejects an AI title that is not an open position and falls back to the keyword best', () => {
        const parsed = { matchScore: 60, matchedPosition: 'Uydurma Pozisyon', position: 'frontend developer', skills: ['react'] };
        const { matchedTitle, score } = resolvePreScore(parsed, '', OPEN);
        expect(matchedTitle).toBe('Frontend Dev'); // anahtar-kelime en iyisi, uydurma başlık değil
        expect(score).toBeGreaterThan(0);
    });

    it('returns a null title when nothing matches any open position', () => {
        const parsed = { matchScore: 60, matchedPosition: 'Uydurma Pozisyon', position: 'muhasebeci', skills: [] };
        expect(resolvePreScore(parsed, '', OPEN)).toEqual({ score: 0, matchedTitle: null });
    });

    it('keeps the profile-quality score with a null title when there are no open positions', () => {
        expect(resolvePreScore({ matchScore: 82, matchedPosition: 'Herhangi' }, '', [])).toEqual({ score: 82, matchedTitle: null });
    });

    it('falls back to the keyword score when the AI score is missing or zero', () => {
        const parsed = { position: 'frontend developer', skills: ['react'], matchScore: 0 };
        const { score, matchedTitle } = resolvePreScore(parsed, 'Frontend Developer', OPEN);
        expect(matchedTitle).toBe('Frontend Developer');
        expect(score).toBeGreaterThan(0); // anahtar-kelime eşleşmesi ('frontend', 'developer')
        expect(resolvePreScore({ matchScore: 'abc', position: '' }, '', []).score).toBe(0);
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Ön skor artık ilanın GEREKSİNİMLERİNE de bakar.
// Eskiden yalnızca pozisyon BAŞLIĞININ kelimeleri aday metninde aranıyordu:
// "Growth Product Manager" başlığındaki üç kelime tüm ön elemeyi belirliyor,
// gereksinimleri değiştirmek skoru hiç oynatmıyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateSimpleMatchScore — gereksinim duyarlılığı', () => {
    const GROWTH_PM = {
        title: 'Growth Product Manager',
        requirements: [
            'Funnel sahipliği: kayıt, aktivasyon, elde tutma',
            'A/B test ve deney kurma deneyimi',
            'Amplitude, Mixpanel, GA4 hakimiyeti',
            'PLG ve self-servis akış deneyimi',
        ],
    };
    const growthCandidate = {
        position: 'Growth Product Manager',
        skills: ['funnel', 'aktivasyon', 'retention', 'A/B test', 'Amplitude', 'Mixpanel', 'GA4', 'PLG'],
    };
    const titleOnlyCandidate = {
        // Unvanı birebir aynı ama gereksinimlerden hiçbirine kanıtı yok
        position: 'Growth Product Manager',
        skills: ['Excel', 'SAP', 'Muhasebe'],
    };

    it('scores a candidate who actually meets the requirements higher than a title-only match', () => {
        const real = calculateSimpleMatchScore(growthCandidate, GROWTH_PM);
        const titleOnly = calculateSimpleMatchScore(titleOnlyCandidate, GROWTH_PM);
        expect(real).toBeGreaterThan(titleOnly);
        expect(real - titleOnly).toBeGreaterThan(20);
    });

    it('keeps the legacy title-only behaviour when given a plain string', () => {
        // Eski çağrı biçimi bozulmamalı: başlık kelimeleri tam eşleşiyor
        expect(calculateSimpleMatchScore(titleOnlyCandidate, 'Growth Product Manager')).toBe(100);
    });

    it('treats a position document with no requirements like the title-only case', () => {
        expect(calculateSimpleMatchScore(titleOnlyCandidate, { title: 'Growth Product Manager', requirements: [] }))
            .toBe(100);
    });

    it('reacts when the requirements change', () => {
        const before = calculateSimpleMatchScore(growthCandidate, GROWTH_PM);
        const after = calculateSimpleMatchScore(growthCandidate, {
            title: 'Growth Product Manager',
            requirements: ['Kurumsal satış kotası yönetimi', 'Saha ziyaretleri', 'Bayi ağı geliştirme'],
        });
        expect(after).toBeLessThan(before);
    });

    it('handles missing candidate/position input', () => {
        expect(calculateSimpleMatchScore(null, GROWTH_PM)).toBe(0);
        expect(calculateSimpleMatchScore(growthCandidate, null)).toBe(0);
        expect(calculateSimpleMatchScore(growthCandidate, { requirements: ['x'] })).toBe(0);
    });
});

describe('resolvePreScore — pozisyon dokümanı desteği', () => {
    const OPEN = [
        { title: 'Growth Product Manager', requirements: ['funnel', 'aktivasyon', 'A/B test'] },
        { title: 'Backend Developer', requirements: ['Java', 'Spring', 'PostgreSQL'] },
    ];

    it('picks the position whose requirements the candidate actually matches', () => {
        const parsed = { position: 'Yazılım Geliştirici', skills: ['Java', 'Spring', 'PostgreSQL'] };
        expect(resolvePreScore(parsed, '', OPEN).matchedTitle).toBe('Backend Developer');
    });

    it('still honours a binding upload selection', () => {
        const parsed = { position: 'Bir şey', skills: [] };
        expect(resolvePreScore(parsed, 'Growth Product Manager', OPEN).matchedTitle).toBe('Growth Product Manager');
    });

    it('accepts a legacy array of title strings', () => {
        const parsed = { position: 'Backend Developer', skills: ['Java'] };
        expect(resolvePreScore(parsed, '', ['Backend Developer']).matchedTitle).toBe('Backend Developer');
    });
});


// ─────────────────────────────────────────────────────────────────────────────
// Ön skor da zorunlu/tercihen ayrımına uymalı.
//
// Dengesizlik: derin tarama zorunlu %85 / tercihen %15 agirlikliyordu ama ilk
// yuklemedeki on skor iki kefeyi ESIT sayiyordu. Ayni aday iki asamada farkli
// mantikla puanlaniyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('positionRequirements (sunucu)', () => {
    it('reads priorities from requirementsMeta', () => {
        expect(positionRequirements({
            title: 'X',
            requirementsMeta: [{ text: 'A', must: true }, { text: 'B', must: false }],
        })).toEqual([{ text: 'A', must: true }, { text: 'B', must: false }]);
    });

    it('returns must:null for legacy positions', () => {
        expect(positionRequirements({ title: 'X', requirements: ['A'] }))
            .toEqual([{ text: 'A', must: null }]);
    });

    it('returns [] for a plain title string', () => {
        expect(positionRequirements('Growth PM')).toEqual([]);
    });
});

describe('calculateSimpleMatchScore — zorunlu/tercihen', () => {
    const PRIORITIZED = {
        title: 'Growth Product Manager',
        requirementsMeta: [
            { text: 'Funnel sahipliği aktivasyon retention', must: true },
            { text: 'A/B test deneyimi', must: true },
            { text: 'Amplitude Mixpanel GA4 hakimiyeti', must: false },
        ],
    };

    const mustCandidate = {
        position: 'Growth Product Manager',
        skills: ['funnel', 'aktivasyon', 'retention', 'A/B', 'test'],
    };
    const niceOnlyCandidate = {
        position: 'Growth Product Manager',
        skills: ['Amplitude', 'Mixpanel', 'GA4', 'hakimiyeti'],
    };

    it('rates meeting the must-haves above meeting only the nice-to-haves', () => {
        const must = calculateSimpleMatchScore(mustCandidate, PRIORITIZED);
        const nice = calculateSimpleMatchScore(niceOnlyCandidate, PRIORITIZED);
        expect(must).toBeGreaterThan(nice);
        expect(must - nice).toBeGreaterThan(20);
    });

    it('caps the nice-to-have contribution', () => {
        const titleOnly = calculateSimpleMatchScore(
            { position: 'Growth Product Manager', skills: [] }, PRIORITIZED
        );
        const withNice = calculateSimpleMatchScore(niceOnlyCandidate, PRIORITIZED);
        expect(withNice - titleOnly).toBeLessThanOrEqual(15);
    });

    it('keeps the legacy 40/60 behaviour when the position has no priorities', () => {
        const legacy = { title: 'Growth Product Manager', requirements: ['Funnel sahipliği aktivasyon retention'] };
        // Başlık tam + gereksinim tam → 100
        expect(calculateSimpleMatchScore(
            { position: 'Growth Product Manager', skills: ['funnel', 'aktivasyon', 'retention', 'sahipliği'] },
            legacy
        )).toBe(100);
    });

    it('still scores a title-only string exactly as before', () => {
        expect(calculateSimpleMatchScore(
            { position: 'Growth Product Manager', skills: [] }, 'Growth Product Manager'
        )).toBe(100);
    });
});
