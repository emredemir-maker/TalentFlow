// Tests for the domain-detection logic in matchService — Phase 4c.
//
// Scope: pure functions only (detectJobDomain, areDomainsCompatible,
// detectCandidateDomain, detectPositionDomain, filterPositionsByDomain).
// calculateMatchScore is the heavy 200-line scorer that ties together
// skills, experience, and Gemini calls — covered by a follow-up PR.
//
// matchService imports analyzeCandidateMatch from './geminiService' as
// dead code (Phase 4a's no-unused-vars warning surfaced it). We mock the
// whole module so loading matchService doesn't drag in Firebase + AI
// config during tests.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./geminiService', () => ({
    analyzeCandidateMatch: vi.fn(),
}));

const {
    areDomainsCompatible,
    detectCandidateDomain,
    detectJobDomain,
    detectPositionDomain,
    domainLabel,
    filterPositionsByDomain,
} = await import('./matchService.js');

describe('detectJobDomain', () => {
    it('returns general for empty input', () => {
        expect(detectJobDomain('')).toBe('general');
        expect(detectJobDomain(null)).toBe('general');
        expect(detectJobDomain(undefined)).toBe('general');
    });

    it('classifies engineering-shaped text', () => {
        expect(detectJobDomain('Senior React Developer with TypeScript')).toBe('engineering');
        expect(detectJobDomain('Backend developer using Java and Spring Boot')).toBe(
            'engineering'
        );
    });

    it('classifies data-shaped text', () => {
        expect(detectJobDomain('Data Scientist with Pandas and PyTorch')).toBe('data');
    });

    it('classifies sales-shaped text', () => {
        expect(detectJobDomain('Satış müdürü, B2B satış deneyimi')).toBe('sales');
    });

    it('classifies HR-shaped text', () => {
        expect(detectJobDomain('Talent acquisition uzmanı, işe alım')).toBe('hr');
    });

    it('uses count-based scoring — multiple weak signals beat one strong', () => {
        // Both data and engineering have a single keyword each ('python', 'pandas'),
        // but data has more total ('data scientist' is a full keyword too).
        const out = detectJobDomain('Data Scientist using Python and Pandas');
        expect(out).toBe('data');
    });

    it('returns general when no domain keywords match', () => {
        expect(detectJobDomain('professional baker with sourdough experience')).toBe('general');
    });
});

describe('domainLabel', () => {
    it('returns the Turkish label for known domain ids', () => {
        expect(domainLabel('engineering')).toBe('Yazılım');
        expect(domainLabel('hr')).toBe('İnsan Kaynakları');
        expect(domainLabel('legal')).toBe('Hukuk / Uyum');
    });

    it('returns the fallback label for unknown ids', () => {
        expect(domainLabel('not-a-real-domain')).toBe('Genel');
        expect(domainLabel('')).toBe('Genel');
        expect(domainLabel(undefined)).toBe('Genel');
    });
});

describe('areDomainsCompatible', () => {
    it('treats falsy as compatible (defensive default)', () => {
        // Either side missing → don't block the match. Important for partial
        // candidate records where domain detection is empty.
        expect(areDomainsCompatible(null, 'engineering')).toBe(true);
        expect(areDomainsCompatible('engineering', null)).toBe(true);
        expect(areDomainsCompatible(undefined, undefined)).toBe(true);
        expect(areDomainsCompatible('', 'engineering')).toBe(true);
    });

    it('treats general as a wildcard', () => {
        expect(areDomainsCompatible('general', 'engineering')).toBe(true);
        expect(areDomainsCompatible('sales', 'general')).toBe(true);
    });

    it('treats management as a wildcard (managers can match anywhere)', () => {
        expect(areDomainsCompatible('management', 'engineering')).toBe(true);
        expect(areDomainsCompatible('finance', 'management')).toBe(true);
    });

    it('requires exact match for non-wildcard domains', () => {
        expect(areDomainsCompatible('sales', 'engineering')).toBe(false);
        expect(areDomainsCompatible('engineering', 'data')).toBe(false);
        expect(areDomainsCompatible('hr', 'finance')).toBe(false);
    });

    it('returns true for matching non-wildcard domains', () => {
        expect(areDomainsCompatible('engineering', 'engineering')).toBe(true);
        expect(areDomainsCompatible('data', 'data')).toBe(true);
    });
});

describe('detectCandidateDomain', () => {
    it('prefers title/position over body text (more reliable signal)', () => {
        // Title says engineering, body talks about a sales job — title wins.
        const candidate = {
            position: 'Senior Backend Developer',
            cvData: 'Worked at a sales company doing CRM integrations.',
        };
        expect(detectCandidateDomain(candidate)).toBe('engineering');
    });

    it('falls back to body text when title gives no signal', () => {
        const candidate = {
            position: 'Specialist',
            about: 'Pandas, NumPy, machine learning, model training.',
        };
        expect(detectCandidateDomain(candidate)).toBe('data');
    });

    it('combines skills array into the body-text fallback', () => {
        const candidate = {
            position: '',
            skills: ['Figma', 'UI Designer', 'visual identity'],
        };
        expect(detectCandidateDomain(candidate)).toBe('design');
    });

    it('returns general when nothing matches', () => {
        expect(detectCandidateDomain({ position: 'Baker', cvData: 'Bread' })).toBe('general');
    });

    // Production bug fix: 'management' titles like "Project Manager" used to
    // short-circuit the function and return immediately as a wildcard,
    // skipping body inspection. That meant a "Project Manager" with all-HR
    // experience was paired with random open positions because the wildcard
    // skipped filterPositionsByDomain. The rescue: when title is
    // 'management', check the body for a more specific signal.
    describe('management wildcard rescue', () => {
        it('prefers HR body over "Project Manager" title', () => {
            const candidate = {
                position: 'Project Manager',
                cvData:
                    'İK uzmanı olarak işe alım, talent acquisition ve İK Müdürü olarak işe alım uzmanı süreçlerinde 10 yıl deneyim. HR business partner ve performans yönetimi.',
            };
            expect(detectCandidateDomain(candidate)).toBe('hr');
        });

        it('prefers engineering body over "Software Manager" title', () => {
            const candidate = {
                position: 'Software Manager',
                skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
                cvData: 'Frontend developer ve backend developer olarak 8 yıl deneyim.',
            };
            // Title alone matches both 'engineering' and 'management' keywords;
            // the rescue is only used when title === 'management' exactly.
            // For "Software Manager" the title scoring picks 'engineering' so
            // the rescue isn't needed — but verify it lands on engineering
            // either way.
            expect(detectCandidateDomain(candidate)).toBe('engineering');
        });

        it('prefers finance body over "Finance Manager" title (literally management term too)', () => {
            const candidate = {
                position: 'Finance Manager',
                cvData:
                    'Finansal analist ve finans müdürü olarak bütçe planlama ve mali müşavir görevlerinde deneyim.',
            };
            expect(detectCandidateDomain(candidate)).toBe('finance');
        });

        it('keeps "management" wildcard when body is also generic/management', () => {
            // A real cross-functional manager with no specialty signal — the
            // wildcard is correct here.
            const candidate = {
                position: 'General Manager',
                cvData:
                    'Genel müdür olarak yönetim kurulu ve direktör pozisyonlarında deneyim.',
            };
            expect(detectCandidateDomain(candidate)).toBe('management');
        });

    });
});

describe('detectPositionDomain', () => {
    it('uses title + department first', () => {
        const pos = {
            title: 'Hukuk Müşaviri',
            department: 'Legal',
            description: 'Bazı yazılım süreçleri',
        };
        expect(detectPositionDomain(pos)).toBe('legal');
    });

    it('falls back to requirements + description when title is generic', () => {
        const pos = {
            title: 'Specialist',
            requirements: ['Pandas', 'Spark', 'Data analysis'],
        };
        expect(detectPositionDomain(pos)).toBe('data');
    });
});

describe('filterPositionsByDomain', () => {
    const positions = [
        { id: 'p1', title: 'Backend Developer' },
        { id: 'p2', title: 'Data Scientist' },
        { id: 'p3', title: 'Sales Manager' },
        { id: 'p4', title: 'Specialist' }, // detects as general → wildcard match
    ];

    it('keeps positions whose domain matches the candidate', () => {
        const candidate = { position: 'Senior Backend Developer' };
        const out = filterPositionsByDomain(candidate, positions);
        const ids = out.map((p) => p.id);
        // Backend Developer (p1) matches engineering exactly.
        // Specialist (p4) detects as general → wildcard, included.
        expect(ids).toContain('p1');
        expect(ids).toContain('p4');
        // Data Scientist (p2) and Sales Manager (p3) are non-engineering → filtered out
        expect(ids).not.toContain('p2');
        expect(ids).not.toContain('p3');
    });

    it('returns all positions when candidate domain is general', () => {
        const candidate = { position: 'Baker' }; // → general
        const out = filterPositionsByDomain(candidate, positions);
        expect(out).toHaveLength(positions.length);
    });
});
