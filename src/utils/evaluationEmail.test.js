import { describe, expect, it } from 'vitest';
import { prepareEvaluationRows, buildEvaluationEmail, escapeHtml } from './evaluationEmail';

const OPEN = [
    { id: 'p1', title: 'Growth Product Manager' },
    { id: 'p2', title: 'Frontend Developer' },
    { id: 'p3', title: 'İK Uzmanı' },
];

const CANDIDATE = {
    id: 'c1',
    name: 'Eda Paköz',
    matchedPositionTitle: 'Growth Product Manager',
    bestScore: 74,
    position: 'Marketing Specialist',
    suggestedRole: 'Senior Performance Marketing Specialist',
    experience: 9,
    education: 'Marmara University Informatics',
    experiences: [
        { role: 'Performance Lead', company: 'Acme', duration: '2020-2024' },
        { role: 'Specialist', company: 'Beta', duration: '2016-2020' },
        { role: 'Junior', company: 'Gamma', duration: '2014-2016' },
    ],
    positionAnalyses: {
        'Growth Product Manager': { score: 74, summary: 'Growth alanında güçlü teknik profil.' },
        'Frontend Developer': { score: 20 },
    },
    aiAnalysis: { starAnalysis: {}, score: 74, analyzedForPosition: 'Growth Product Manager' },
};

describe('prepareEvaluationRows', () => {
    it('builds a row with score, ANALYSIS TEXT, top-3 fits and career summary', () => {
        const [row] = prepareEvaluationRows([CANDIDATE], OPEN, () => 10);
        expect(row.matchedTitle).toBe('Growth Product Manager');
        expect(row.matchedScore).toBe(74);
        expect(row.scanned).toBe(true);
        expect(row.analysisText).toBe('Growth alanında güçlü teknik profil.');
        expect(row.fits[0]).toEqual({ title: 'Growth Product Manager', score: 74, isAi: true });
        expect(row.fits).toHaveLength(3);
        expect(row.lastRoles).toHaveLength(2); // en fazla son 2 görev
        expect(row.cvRole).toBe('Senior Performance Marketing Specialist');
    });

    it('falls back to aiAnalysis.summary when it was made FOR the matched position', () => {
        const c = { ...CANDIDATE, positionAnalyses: {}, aiAnalysis: { starAnalysis: {}, summary: 'STAR özeti', analyzedForPosition: 'Growth Product Manager' } };
        const [row] = prepareEvaluationRows([c], OPEN, () => 0);
        expect(row.analysisText).toBe('STAR özeti');
    });

    it('leaves analysisText empty when there is no analysis for the matched position', () => {
        const c = { ...CANDIDATE, positionAnalyses: {}, aiAnalysis: { starAnalysis: {}, summary: 'Başka poz.', analyzedForPosition: 'Frontend Developer' } };
        const [row] = prepareEvaluationRows([c], OPEN, () => 0);
        expect(row.analysisText).toBe('');
    });
});

describe('buildEvaluationEmail', () => {
    const rows = prepareEvaluationRows([CANDIDATE], OPEN, () => 10);

    it('includes name, score, POSITION-FIT ANALYSIS and per-position table in the HTML', () => {
        const email = buildEvaluationEmail({ rows, note: 'Değerlendirelim', appUrl: 'https://app.test', includeTable: true, includeLinks: true });
        expect(email.subject).toContain('1 aday');
        expect(email.html).toContain('Eda Paköz');
        expect(email.html).toContain('%74');
        expect(email.html).toContain('Growth alanında güçlü teknik profil.');
        expect(email.html).toContain('Pozisyon Uyumları');
        expect(email.html).toContain('https://app.test/?aday=c1');
        expect(email.text).toContain('Analiz: Growth alanında güçlü teknik profil.');
    });

    it('omits table and links when disabled', () => {
        const email = buildEvaluationEmail({ rows, note: '', appUrl: 'https://app.test', includeTable: false, includeLinks: false });
        expect(email.html).not.toContain('Pozisyon Uyumları');
        expect(email.html).not.toContain('?aday=');
    });

    it('escapes HTML in user-controlled fields', () => {
        const evil = prepareEvaluationRows([{ ...CANDIDATE, name: '<script>x</script>' }], OPEN, () => 0);
        const email = buildEvaluationEmail({ rows: evil, note: '<b>not</b>', appUrl: 'https://app.test' });
        expect(email.html).not.toContain('<script>');
        expect(email.html).toContain('&lt;script&gt;');
        expect(email.html).toContain('&lt;b&gt;not&lt;/b&gt;');
    });
});

describe('escapeHtml', () => {
    it('escapes the four critical characters', () => {
        expect(escapeHtml('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
    });
});
