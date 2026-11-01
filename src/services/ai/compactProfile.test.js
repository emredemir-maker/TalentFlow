// Kompakt profil — her canlı çağrıya giden aday bilgisi (~800 token).
import { describe, expect, it } from 'vitest';
import { buildCompactProfile, estimateTokens, COMPACT_PROFILE_MAX_CHARS, COMPACT_MAX_ROLES } from './compactProfile.js';

const huge = {
    id: 'cand-123',
    name: 'Ayşe Yılmaz',
    email: 'ayse.yilmaz@example.com',
    phone: '+90 555 123 45 67',
    linkedinUrl: 'https://linkedin.com/in/ayseyilmaz',
    position: 'Senior Product Manager',
    experience: 9,
    summary: 'Ürün yöneticisi. İletişim: ayse.yilmaz@example.com. ' + 'Büyüme ve aktivasyon odaklı çalıştı. '.repeat(80),
    cvData: 'TÜM CV DÖKÜMÜ '.repeat(3000),
    skills: Array.from({ length: 80 }, (_, i) => `Beceri ${i} ${'uzun açıklama '.repeat(5)}`),
    experiences: Array.from({ length: 12 }, (_, i) => ({
        role: `Rol ${i}`,
        company: `Şirket ${i}`,
        duration: 'Oca 2020 – Günümüz',
        desc: `Telefon +90 555 987 65 43 ile ulaşılabilir. ${'Funnel ve A/B test yönetti. '.repeat(30)}`,
        milestones: ['%30 büyüme'],
    })),
    aiAnalysis: { details: 'x'.repeat(20000) },
    interviewSessions: [{ id: 'iv-1', transcript: 'y'.repeat(10000) }],
};
const position = {
    title: 'Group Product Manager',
    requirements: Array.from({ length: 40 }, (_, i) => `Gereksinim ${i}: ${'detaylı açıklama '.repeat(10)}`),
};

describe('buildCompactProfile', () => {
    it('stays within ~800 tokens even for a very large candidate record', () => {
        const json = JSON.stringify(buildCompactProfile(huge, position));
        expect(json.length).toBeLessThanOrEqual(COMPACT_PROFILE_MAX_CHARS);
        expect(estimateTokens(json)).toBeLessThanOrEqual(800);
        // Eskiden giden yük: stripPII(candidateData) — kat kat büyük.
        expect(JSON.stringify(huge).length).toBeGreaterThan(json.length * 20);
    });

    it('keeps summary, skills, up to 5 roles and position requirements', () => {
        const p = buildCompactProfile(huge, position);
        expect(p.summary).toMatch(/Büyüme ve aktivasyon/);
        expect(p.skills.length).toBeGreaterThan(0);
        expect(p.roles.length).toBeGreaterThan(0);
        expect(p.roles.length).toBeLessThanOrEqual(COMPACT_MAX_ROLES);
        expect(p.targetPosition.title).toBe('Group Product Manager');
        expect(p.targetPosition.requirements.length).toBeGreaterThan(0);
        expect(p.experienceYears).toBe(9);
    });

    it('keeps 5 roles for a normal-sized candidate', () => {
        const normal = {
            ...huge,
            summary: 'Kısa özet.',
            skills: ['SQL', 'Figma'],
            experiences: huge.experiences.map((e) => ({ ...e, desc: 'Kısa.' })),
        };
        expect(buildCompactProfile(normal, { title: 'PM', requirements: ['SQL'] }).roles).toHaveLength(5);
    });

    it('never carries PII or the bulky fields', () => {
        const json = JSON.stringify(buildCompactProfile(huge, position));
        expect(json).not.toMatch(/Ayşe|Yılmaz/);
        expect(json).not.toMatch(/ayse\.yilmaz@example\.com/);
        expect(json).not.toMatch(/555/);
        expect(json).not.toMatch(/linkedin/i);
        expect(json).not.toMatch(/TÜM CV DÖKÜMÜ/);
        expect(json).not.toMatch(/cand-123|iv-1/);
    });

    it('accepts requirements as a comma-separated string and tolerates empty input', () => {
        expect(buildCompactProfile({ skills: [] }, { requirements: 'SQL, Figma' }).targetPosition.requirements)
            .toEqual(['SQL', 'Figma']);
        expect(() => buildCompactProfile(null)).not.toThrow();
    });
});
