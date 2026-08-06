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
    calculateMatchScore,
    detectCandidateDomain,
    detectJobDomain,
    detectPositionDomain,
    domainLabel,
    filterPositionsByDomain,
    termMatches,
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


// ─────────────────────────────────────────────────────────────────────────────
// Ürün/growth skorlaması — bir Growth PM ilanı, gereksinim metnindeki
// "vibecoding" yüzünden Yazılım domainine düşüyordu ve ilanın ayırt edici
// gereksinimleri (funnel, aktivasyon, A/B test, PLG, analitik araçlar)
// skorlamaya hiç girmiyordu. Ölçüm: aranan profile birebir uyan aday 59,
// alakasız bir backend geliştirici 40 alıyordu ve ikisi de derin taramaya
// giriyordu.
// ─────────────────────────────────────────────────────────────────────────────
const GROWTH_PM = {
    id: 'gpm',
    title: 'Growth Product Manager',
    department: 'Ürün',
    minExperience: 3,
    requirements: [
        '3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth/funnel odaklı',
        'Tercihen B2B SaaS',
        'Funnel sahipliği: kayıt, aktivasyon, elde tutma, gelir',
        'A/B test ve deney kurma deneyimi',
        'Analitik araç hakimiyeti (GA4, Amplitude, Mixpanel, Metabase) ve temel SQL',
        'AI ile çalışabiliyor olması; tercihen vibecoding ve AI ürünleştirme deneyimi',
        'İyi seviye İngilizce',
        'Artı: PLG/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM ürün geçmişi',
    ],
    description: '',
};

const GROWTH_PM_CANDIDATE = {
    position: 'Senior Product Manager',
    experience: 5,
    department: 'Ürün',
    skills: ['Product Management', 'Growth', 'Funnel Optimization', 'A/B Testing',
        'Amplitude', 'Mixpanel', 'GA4', 'SQL', 'PLG', 'B2B SaaS', 'Retention'],
    about: 'B2B SaaS ürünlerinde growth ve funnel sahipliği, aktivasyon ve retention deneyleri.',
    experiences: [{ title: 'Product Manager', company: 'SaaS Co', description: 'Funnel, aktivasyon, A/B test' }],
};

const BACKEND_CANDIDATE = {
    position: 'Backend Developer',
    experience: 5,
    skills: ['Java', 'Spring', 'PostgreSQL', 'SQL', 'Docker', 'Kubernetes', 'Kafka', 'Microservices'],
    about: 'Mikroservis mimarisi, distributed system, performance.',
    experiences: [{ title: 'Backend Developer', company: 'Tech', description: 'Java, Spring, SQL' }],
};

describe('termMatches', () => {
    it('does not match a term inside a longer word (vibecoding ≠ coding)', () => {
        expect(termMatches('vibecoding ve ai ürünleştirme', 'coding')).toBe(false);
    });

    it('allows Turkish suffixes on a real occurrence', () => {
        expect(termMatches('aktivasyonu artırdı', 'aktivasyon')).toBe(true);
        expect(termMatches("funnel'ı optimize etti", 'funnel')).toBe(true);
    });

    it('is suffix-permissive by design, so prefix-colliding terms stay out of the vocabulary', () => {
        // Türkçe ekleri yakalayabilmek için sondan sınır aranmaz — bunun bedeli
        // 'deney' gibi terimlerin "deneyimi" içinde eşleşmesidir. Bu yüzden
        // TECH_GROUPS'a 'deney' / 'gelir' / 'kayıt' gibi yaygın kelime önekleri
        // EKLENMEZ; sözlük 'a/b test', 'revenue', 'signup' kullanır.
        expect(termMatches('5 yıl deneyimi var', 'deney')).toBe(true);
        // Sonuç olarak sıradan bir "deneyim" cümlesi ürün domainine düşmez:
        expect(detectJobDomain('5 yıl deneyimi olan bir aday')).toBe('general');
    });

    it('requires a whole word for short terms (go ≠ good)', () => {
        expect(termMatches('good communication', 'go')).toBe(false);
        expect(termMatches('go ve rust deneyimi', 'go')).toBe(true);
    });

    it('falls back to substring for multi-word or punctuated terms', () => {
        expect(termMatches('a/b test kurgusu', 'a/b test')).toBe(true);
        expect(termMatches('node.js ile', 'node.js')).toBe(true);
    });
});

describe('Growth PM ilanı — domain ve skor ayrımı', () => {
    it('classifies a Growth Product Manager position as product, not engineering', () => {
        expect(detectPositionDomain(GROWTH_PM)).toBe('product');
    });

    it('no longer lets "vibecoding" pull the position into engineering', () => {
        const reqTextOnly = { title: '', department: '', requirements: GROWTH_PM.requirements };
        expect(detectPositionDomain(reqTextOnly)).not.toBe('engineering');
    });

    it('feeds the differentiating requirements into scoring, not just SQL/AI', () => {
        const { reasons } = calculateMatchScore(GROWTH_PM_CANDIDATE, GROWTH_PM);
        // Eskiden yalnızca 4 token (sql/ai/analitik/yönetim) skorlanıyordu ve
        // eşleşme sayısı 3'ü geçemiyordu.
        const hit = reasons.find((r) => r.includes('teknik yetkinlik'));
        expect(hit).toBeTruthy();
        expect(parseInt(hit, 10)).toBeGreaterThan(3);
    });

    it('separates the matching candidate from an unrelated backend developer', () => {
        const good = calculateMatchScore(GROWTH_PM_CANDIDATE, GROWTH_PM).score;
        const bad = calculateMatchScore(BACKEND_CANDIDATE, GROWTH_PM).score;
        expect(good).toBeGreaterThan(60);
        expect(bad).toBeLessThan(20);
        // Ölçülen eski davranış: 59 vs 40 (yalnızca 19 puan fark)
        expect(good - bad).toBeGreaterThan(40);
    });

    it('keeps the unrelated backend developer out of the deep scan entirely', () => {
        expect(filterPositionsByDomain(BACKEND_CANDIDATE, [GROWTH_PM])).toHaveLength(0);
        expect(filterPositionsByDomain(GROWTH_PM_CANDIDATE, [GROWTH_PM])).toHaveLength(1);
    });
});
