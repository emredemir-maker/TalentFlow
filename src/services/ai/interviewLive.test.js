// Canlı mülakat çağrılarının istemci tarafı sözleşmesi:
//   - kompakt profil gider, tam aday kaydı gitmez
//   - çıktı tavanı 1024, düşünme 'low', etiket + mülakat kimliği
//   - saatlik sınır hatası arayüze FIRLATILIR (düğme kapansın diye)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('./config.js', () => ({
    getModel: vi.fn(async () => ({ generateContent: (...a) => generateContent(...a) })),
    getAuthHeaders: vi.fn(),
}));

const { analyzeLiveWindow, generateFollowUpQuestion, FOLLOWUP_HISTORY_LINES } = await import('./interview.js');
const { buildCompactProfile } = await import('./compactProfile.js');

const candidate = {
    name: 'Ayşe Yılmaz',
    email: 'ayse@example.com',
    position: 'PM',
    skills: ['SQL'],
    cvData: 'TÜM CV '.repeat(500),
};

beforeEach(() => {
    generateContent.mockReset();
    generateContent.mockResolvedValue({
        response: { text: () => '{"scores":{"technical":70},"insight":"i","suggestion":"s","question":"q"}' },
    });
});

describe('analyzeLiveWindow', () => {
    it('sends the compact profile with live caps, label and interview id', async () => {
        const profile = buildCompactProfile(candidate, { title: 'PM', requirements: ['SQL'] });
        const r = await analyzeLiveWindow(profile, [{ role: 'ADAY', text: 'cevap' }], 'Soru?', { interviewId: 'iv-1' });
        expect(r.scores.technical).toBe(70);
        const [prompt, opts] = generateContent.mock.calls[0];
        expect(opts).toEqual({ maxOutputTokens: 1024, thinking: 'low', label: 'interview-live', interviewId: 'iv-1' });
        expect(prompt).not.toMatch(/TÜM CV|Ayşe|ayse@example/);
        // Önyargı tespiti artık istemcide anahtar kelimeyle; modelden istenmiyor.
        expect(prompt).not.toMatch(/bias_warning/);
    });

    it('rethrows the hourly-limit error so the screen can disable the button', async () => {
        const err = Object.assign(new Error('sınır'), { code: 'INTERVIEW_AI_LIMIT', status: 429 });
        generateContent.mockRejectedValue(err);
        await expect(analyzeLiveWindow({}, [], null, { interviewId: 'iv-1' })).rejects.toMatchObject({ code: 'INTERVIEW_AI_LIMIT' });
    });

    it('returns null on other errors', async () => {
        generateContent.mockRejectedValue(new Error('500'));
        expect(await analyzeLiveWindow({}, [], null, { interviewId: 'iv-1' })).toBeNull();
    });
});

describe('generateFollowUpQuestion', () => {
    it('uses the live label, caps and a bounded history when an interview id is given', async () => {
        const history = Array.from({ length: 40 }, (_, i) => ({ role: 'ADAY', text: `satır-${i}` }));
        await generateFollowUpQuestion(candidate, 'technical', history, 'deepen', null, { interviewId: 'iv-1' });
        const [prompt, opts] = generateContent.mock.calls[0];
        expect(opts).toEqual({ maxOutputTokens: 1024, thinking: 'low', label: 'interview-followup', interviewId: 'iv-1' });
        expect(prompt).toMatch(/satır-39/);
        expect(prompt).not.toMatch(/satır-(?:[0-9]|1[0-9]|2[0-7])"/);
        expect(FOLLOWUP_HISTORY_LINES).toBe(12);
        // Kompakt profil: PII ve CV dökümü yok.
        expect(prompt).not.toMatch(/TÜM CV|Ayşe|ayse@example/);
    });
});
