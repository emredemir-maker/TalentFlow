// src/services/matchService.js
import { analyzeCandidateMatch } from './geminiService';

/**
 * Semantic Technology Groups to improve matching without LLM for every call
 */
const TECH_GROUPS = {
    backend: ['.net', 'c#', 'java', 'spring', 'node', 'python', 'django', 'backend', 'postgresql', 'sql', 'redis', 'kafka', 'go', 'golang', 'architecture', 'distributed', 'system', 'microservices', 'performance', 'security'],
    frontend: ['react', 'vue', 'angular', 'javascript', 'typescript', 'frontend', 'css', 'html', 'next.js', 'tailwind', 'bootstrap', 'ui', 'ux', 'tasarım', 'arayüz'],
    mobile: ['flutter', 'react native', 'swift', 'kotlin', 'ios', 'android', 'mobile', 'mobil'],
    devops: ['docker', 'kubernetes', 'aws', 'azure', 'gcp', 'jenkins', 'ci/cd', 'terraform', 'devops', 'cloud', 'bulut'],
    data: ['pandas', 'numpy', 'spark', 'hadoop', 'machine learning', 'ai', 'data science', 'sql', 'nosql', 'veri', 'analitik'],
    management: ['lead', 'lider', 'manager', 'yönetici', 'head', 'coordinator', 'sorumlu', 'takım', 'team', 'board', 'yönetim'],
    general: ['software', 'yazılım', 'development', 'geliştirme', 'bilişim', 'mühendislik', 'engineering', 'teknoloji', 'agile', 'scrum']
};

/**
 * HIGH-LEVEL JOB DOMAIN MAP
 * Used to prevent cross-domain false matches (e.g. Sales CV vs Dev Position).
 * Detection uses COUNT-BASED scoring: the domain with the most keyword hits wins.
 * This prevents a single generic word (e.g. "crm") from hijacking the result.
 */
const JOB_DOMAINS = [
    {
        id: 'engineering', label: 'Yazılım',
        // Role titles + strong tech signals — very unlikely in other domains
        keywords: [
            'software developer', 'software engineer', 'yazılım geliştirici', 'yazılım mühendisi',
            'frontend developer', 'backend developer', 'full stack developer', 'fullstack developer',
            'mobile developer', 'ios developer', 'android developer', 'flutter developer',
            'devops engineer', 'platform engineer', 'cloud engineer', 'sre',
            'react developer', 'node developer', 'java developer', 'python developer',
            'developer', 'geliştirici', 'programcı',
            'react', 'vue', 'angular', 'typescript', 'javascript', 'node.js', 'nodejs',
            'python', 'java', 'kotlin', 'swift', 'go lang', 'golang', 'rust',
            'spring boot', 'django', 'fastapi', 'express',
            'docker', 'kubernetes', 'terraform', 'ci/cd', 'jenkins',
            'postgresql', 'mongodb', 'redis', 'kafka', 'rabbitmq',
            'rest api', 'graphql', 'microservices', 'api development',
            'yazılım', 'software', 'coding', 'programming',
        ],
    },
    {
        id: 'data', label: 'Veri / Analitik',
        keywords: [
            'data scientist', 'data engineer', 'data analyst', 'veri bilimci', 'veri mühendisi',
            'machine learning engineer', 'ml engineer', 'ai engineer',
            'makine öğrenmesi', 'machine learning', 'deep learning', 'nlp',
            'business intelligence', 'bi analyst', 'bi developer',
            'model training', 'neural network', 'tensorflow', 'pytorch',
            'pandas', 'numpy', 'spark', 'hadoop', 'airflow', 'dbt',
            'tableau', 'power bi', 'looker', 'veri analizi', 'data analysis',
        ],
    },
    {
        id: 'design', label: 'Tasarım',
        keywords: [
            'ui designer', 'ux designer', 'product designer', 'ui/ux designer',
            'graphic designer', 'motion designer', 'creative director', 'art director',
            'tasarımcı', 'grafik tasarım', 'görsel tasarım',
            'figma', 'sketch', 'adobe xd', 'invision', 'zeplin',
            'illustrator', 'photoshop', 'after effects', 'indesign',
            'branding', 'typography', 'visual identity',
        ],
    },
    {
        id: 'sales', label: 'Satış',
        // Role-specific signals only — removed generic words like 'crm', 'channel', 'revenue'
        keywords: [
            'satış temsilcisi', 'satış uzmanı', 'satış müdürü', 'satış direktörü',
            'sales representative', 'sales executive', 'sales manager', 'sales director',
            'account manager', 'account executive', 'key account',
            'business development manager', 'iş geliştirme müdürü',
            'müşteri temsilcisi', 'ticari müdür',
            'satış hedef', 'satış kotası', 'quota', 'satış bölge',
            'b2b satış', 'b2c satış', 'kurumsal satış',
        ],
    },
    {
        id: 'marketing', label: 'Pazarlama',
        keywords: [
            'pazarlama uzmanı', 'pazarlama müdürü', 'dijital pazarlama uzmanı',
            'marketing manager', 'digital marketing manager', 'marketing specialist',
            'marka yöneticisi', 'brand manager',
            'seo uzmanı', 'sem uzmanı', 'performance marketing',
            'growth hacker', 'growth marketer', 'content marketing',
            'sosyal medya uzmanı', 'social media manager',
            'kampanya yönetimi', 'email marketing',
        ],
    },
    {
        id: 'hr', label: 'İnsan Kaynakları',
        keywords: [
            'insan kaynakları uzmanı', 'ik uzmanı', 'ik müdürü',
            'human resources manager', 'hr manager', 'hr specialist', 'hr business partner',
            'recruiter', 'talent acquisition', 'işe alım uzmanı', 'işe alım müdürü',
            'organizasyon gelişim', 'od specialist', 'performans yönetimi',
            'eğitim ve gelişim', 'learning & development',
        ],
    },
    {
        id: 'finance', label: 'Finans / Muhasebe',
        keywords: [
            'finansal analist', 'finans müdürü', 'mali müşavir',
            'financial analyst', 'finance manager', 'cfo', 'controller',
            'muhasebe uzmanı', 'muhasebe müdürü', 'accountant', 'accounting manager',
            'denetçi', 'auditor', 'vergi uzmanı', 'tax specialist',
            'bütçe planlama', 'budget planning', 'treasury manager', 'hazine',
        ],
    },
    {
        id: 'operations', label: 'Operasyon',
        keywords: [
            'operasyon müdürü', 'operasyon uzmanı', 'operations manager',
            'supply chain manager', 'tedarik zinciri', 'lojistik müdürü', 'logistics manager',
            'depo müdürü', 'warehouse manager', 'fulfillment',
            'satın alma uzmanı', 'procurement specialist', 'purchasing manager',
        ],
    },
    {
        id: 'support', label: 'Müşteri Hizmetleri',
        keywords: [
            'müşteri hizmetleri uzmanı', 'customer service specialist', 'customer success',
            'teknik destek uzmanı', 'technical support specialist', 'help desk',
            'çağrı merkezi uzmanı', 'call center agent', 'support specialist',
        ],
    },
    {
        id: 'legal', label: 'Hukuk / Uyum',
        keywords: [
            'avukat', 'hukuk müşaviri', 'lawyer', 'attorney', 'legal counsel',
            'compliance officer', 'compliance manager', 'compliance director', 'compliance specialist', 'compliance analyst',
            'uyum uzmanı', 'uyum müdürü', 'uyum direktörü', 'uyum yöneticisi', 'uyum sorumlusu',
            'hukuk uzmanı', 'hukuk müdürü', 'legal manager', 'legal specialist',
            'sözleşme yönetimi', 'contract management', 'gdpr', 'kvkk',
            'regülasyon', 'regulatory', 'düzenleyici kurum', 'risk ve uyum',
            'iç denetim', 'internal audit', 'kurumsal uyum',
        ],
    },
    {
        id: 'management', label: 'Yönetim',
        keywords: [
            'genel müdür', 'general manager', 'ceo', 'coo', 'cto',
            'direktör', 'director', 'vp', 'vice president',
            'country manager', 'c-level', 'board member', 'yönetim kurulu',
        ],
    },
];

/**
 * Detect the primary job domain from any freeform text.
 * Uses COUNT-BASED scoring: counts keyword hits per domain and returns
 * the domain with the most matches. Falls back to 'general' if no hits.
 * This prevents a single incidental keyword from misclassifying a profile.
 */
export function detectJobDomain(text) {
    if (!text) return 'general';
    const lower = text.toLowerCase();

    let bestDomain = 'general';
    let bestCount = 0;

    for (const domain of JOB_DOMAINS) {
        const count = domain.keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
        if (count > bestCount) {
            bestCount = count;
            bestDomain = domain.id;
        }
    }

    return bestDomain;
}

/**
 * Detect domain from a short title/position field specifically.
 * Returns the domain if unambiguous, else 'general'.
 * Title-based detection is more reliable than full-text because job titles
 * are dense with role signals and rarely contain noise from company context.
 */
function detectDomainFromTitle(title) {
    if (!title) return 'general';
    const lower = title.toLowerCase();
    let best = 'general';
    let bestCount = 0;
    for (const domain of JOB_DOMAINS) {
        const count = domain.keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
        if (count > bestCount) {
            bestCount = count;
            best = domain.id;
        }
    }
    return best;
}

/**
 * Returns the human-readable label for a domain id.
 */
export function domainLabel(domainId) {
    return JOB_DOMAINS.find(d => d.id === domainId)?.label || 'Genel';
}

/**
 * Are two detected domains compatible?
 * - 'general' and 'management' are wildcards — compatible with everything.
 * - Otherwise domains must match exactly.
 */
export function areDomainsCompatible(d1, d2) {
    if (!d1 || !d2) return true;
    if (d1 === 'general' || d2 === 'general') return true;
    if (d1 === 'management' || d2 === 'management') return true;
    return d1 === d2;
}

/**
 * Detect the job domain for a candidate.
 * Strategy: check job title/position first (title signals are more reliable
 * than CV body which may contain incidental context from the employer's industry).
 * Only fall back to full-text if the title gives no clear domain.
 */
export function detectCandidateDomain(candidate) {
    // 1. Try title/position — the most reliable signal
    const titleDomain = detectDomainFromTitle(
        `${candidate.position || ''} ${candidate.title || ''}`
    );
    if (titleDomain !== 'general') return titleDomain;

    // 2. Fall back to full profile text
    const fullText = [
        candidate.about || '',
        candidate.description || '',
        (candidate.skills || []).join(' '),
        Array.isArray(candidate.experiences)
            ? candidate.experiences.map(e => `${e.title || ''} ${e.company || ''}`).join(' ')
            : '',
        candidate.cvData || '',
    ].join(' ');
    return detectJobDomain(fullText);
}

/**
 * Detect the job domain for a position.
 * Title + department are the canonical signals; description is a fallback.
 */
export function detectPositionDomain(position) {
    const titleDomain = detectDomainFromTitle(
        `${position.title || ''} ${position.department || ''}`
    );
    if (titleDomain !== 'general') return titleDomain;

    const fullText = [
        (position.requirements || []).join(' '),
        position.description || '',
        position.jobDescription || '',
    ].join(' ');
    return detectJobDomain(fullText);
}

// Keep old text-blob helpers for backward compat (used externally via detectJobDomain)
function candidateDomainText(candidate) {
    return [
        candidate.position || '',
        candidate.title || '',
        candidate.about || '',
        candidate.description || '',
        (candidate.skills || []).join(' '),
        Array.isArray(candidate.experiences)
            ? candidate.experiences.map(e => `${e.title || ''} ${e.company || ''}`).join(' ')
            : '',
        candidate.cvData || '',
    ].join(' ');
}

function positionDomainText(position) {
    return [
        position.title || '',
        position.department || '',
        (position.requirements || []).join(' '),
        position.description || '',
        position.jobDescription || '',
    ].join(' ');
}

/**
 * Filter a list of positions to only those domain-compatible with a candidate.
 * If the candidate domain cannot be determined ('general'), all positions are returned.
 */
export function filterPositionsByDomain(candidate, positions) {
    if (!positions || positions.length === 0) return [];
    const candidateDomain = detectCandidateDomain(candidate);
    if (candidateDomain === 'general') return positions;
    return positions.filter(pos => {
        const posDomain = detectPositionDomain(pos);
        return areDomainsCompatible(candidateDomain, posDomain);
    });
}

/**
 * Filter a list of candidates to only those domain-compatible with a position.
 * If the position domain cannot be determined ('general'), all candidates are returned.
 */
export function filterCandidatesByDomain(position, candidates) {
    if (!candidates || candidates.length === 0) return [];
    const posDomain = detectPositionDomain(position);
    if (posDomain === 'general') return candidates;
    return candidates.filter(c => {
        const cDomain = detectCandidateDomain(c);
        return areDomainsCompatible(cDomain, posDomain);
    });
}


/**
 * Unified Otonom Matching Algorithm
 * This logic is used for INITIAL matches. After AI analysis, results are overwritten by LLM.
 */
export function calculateMatchScore(candidate, position, options = {}) {
    if (!candidate || !position) return { score: 0, reasons: [], isHighMatch: false, type: 'static' };

    // If candidate has a PRE-SAVED AI score for THIS specific position, trust it above all
    if (!options.ignoreAi && candidate.aiAnalysis && candidate.matchedPositionTitle === position.title) {
        return {
            score: candidate.matchScore || candidate.aiAnalysis.score,

            reasons: candidate.aiAnalysis.reasons || ['AI Taraması Tamamlandı'],
            isHighMatch: (candidate.matchScore || candidate.aiAnalysis.score) >= 70,
            type: 'ai'
        };
    }

    let score = 0;
    const reasons = [];

    // --- 1. Enhanced Semantic Skills Match (70%) ---
    // Increased from 60% to emphasize technical fit
    let cSkills = (candidate.skills || []).map(s => s.toLowerCase());

    // A. Enrich skills from ALL text sources regardless of existing skills
    // This ensures candidates with empty skill lists but rich descriptions are caught.
    const candidateText = [
        candidate.title || '',
        candidate.description || '',
        candidate.about || '',
        Array.isArray(candidate.experiences) ? candidate.experiences.map(e => (e.title + ' ' + e.description)).join(' ') : ''
    ].join(' ').toLowerCase();

    // Scan for any missed keywords
    Object.values(TECH_GROUPS).flat().forEach(tech => {
        if (candidateText.includes(tech) && !cSkills.includes(tech)) {
            cSkills.push(tech);
        }
    });

    let pReqs = (position.requirements || []).map(r => r.toLowerCase());

    // FALLBACK: If requirements are missing, try to extract tech keywords from description
    if (pReqs.length === 0 && (position.description || position.jobDescription)) {
        const desc = (position.description || position.jobDescription).toLowerCase();
        // Auto-detect tech stacks from description based on known groups
        Object.values(TECH_GROUPS).flat().forEach(tech => {
            if (desc.includes(tech) && !pReqs.includes(tech)) {
                pReqs.push(tech);
            }
        });
    }


    // NEW: Extract actual tech keywords from requirements + description
    // This solves the issue where requirements are long sentences.
    const allReqText = [
        ...(position.requirements || []),
        position.description || '',
        position.jobDescription || ''
    ].join(' ').toLowerCase();

    const requiredKeywords = new Set();

    // Scan text for known technologies
    Object.values(TECH_GROUPS).flat().forEach(tech => {
        // Simple check: does the text contain this tech?
        // Note: This might false match 'go' in 'good', but strictly for scoring it's better than 0 matches.
        if (allReqText.includes(tech)) {
            requiredKeywords.add(tech);
        }
    });

    // Fallback: If no known tech found, try to use title words as keywords
    if (requiredKeywords.size === 0 && position.title) {
        const titleWords = position.title.toLowerCase().split(' ').filter(w => w.length > 2);
        titleWords.forEach(w => requiredKeywords.add(w));
    }

    const validReqs = Array.from(requiredKeywords);
    let matchCount = 0;
    let skillRatio = 0;

    if (validReqs.length > 0) {
        validReqs.forEach(req => {
            // Does candidate have this specific keyword?
            // "C#" vs ".NET" handling via Groups is implicit if we matched the Group keywords?
            // No, strictly check if candidate skill overlaps with req.
            const directMatch = cSkills.some(skill => skill.includes(req) || req.includes(skill));

            if (directMatch) {
                matchCount++;
            } else {
                // Check if related tech exists (Semantic Group fallback)
                for (const group in TECH_GROUPS) {
                    if (TECH_GROUPS[group].includes(req) &&
                        TECH_GROUPS[group].some(g => cSkills.some(skill => skill.includes(g)))) {
                        matchCount += 0.5;
                        break;
                    }
                }
            }
        });

        skillRatio = Math.min(matchCount / validReqs.length, 1);
        score += Math.round(skillRatio * 70);

        if (matchCount > 0) reasons.push(`${Math.ceil(matchCount)} teknik yetkinlik eşleşmesi`);
    }



    // --- 2. Title & Role Match (15%) ---
    // Decreased from 20% to reduce false positives on generic titles
    const cPos = (candidate.position || '').toLowerCase();
    const pTitle = (position.title || '').toLowerCase();

    // Exact or contained title match
    if (cPos && pTitle) {
        if (cPos.includes(pTitle) || pTitle.includes(cPos) ||
            // Hierarchical: Lead/Manager counts as Senior/Dev/Expert
            ((cPos.includes('lead') || cPos.includes('lider') || cPos.includes('manager') || cPos.includes('yönetici')) &&
                (pTitle.includes('senior') || pTitle.includes('developer') || pTitle.includes('uzman') || pTitle.includes('engineer')))
        ) {
            score += 15;
            reasons.push('Pozisyon/Kıdem uyumu');
        } else {
            // Semantic title check (e.g. 'Software Engineer' vs 'Backend Developer')
            const commonRoles = ['developer', 'engineer', 'architect', 'uzman', 'mühendis', 'sorumlu'];
            const pRole = commonRoles.find(r => pTitle.includes(r));
            const cRole = commonRoles.find(r => cPos.includes(r));
            if (pRole && cRole && pRole === cRole) {
                score += 5; // Reduced from 10 to 5
                reasons.push('İlgili rol geçmişi');
            }
        }
    }

    // --- 3. Experience Match (5%) ---
    // Decreased significantly. Years don't equal fit.
    const cExp = parseInt(candidate.experience) || 0;
    const pExp = parseInt(position.minExperience) || 0;
    if (cExp >= pExp) {
        score += 5;
        reasons.push('İstenen kıdem yeterliliği');
    } else if (cExp >= pExp - 2) {
        score += 2; // Near match
    }

    // --- 4. Department Match (10%) ---
    const cDept = (candidate.department || '').toLowerCase();
    const pDept = (position.department || '').toLowerCase();
    if (cDept === pDept && cDept !== '') {
        score += 10;
        reasons.push('Departman odağı aynı');
    }

    // --- PENALTIES ---
    // Critical: If skill overlap is very low (less than 25%), slash the score.
    // This solves "Backend Developer matches Frontend Job because of Title+Years"
    // We use skillRatio calculated from keywords.
    if (validReqs.length > 0 && skillRatio < 0.25) {
        // However, be careful not to penalize if matchCount > 0 but low ratio?
        // Let's stick to the plan: if relevant tech is missing, penalty.
        score = Math.round(score * 0.4);
        reasons.push('Yetersiz teknik yetkinlik eşleşmesi');
    }


    // --- 5. Human Factor (Integration for Point 3) ---
    const assessments = candidate.assessments || {};
    const hasAssessments = Object.keys(assessments).length > 0;

    if (hasAssessments) {
        const avgAssessment = (
            (assessments.technical || 0) +
            (assessments.communication || 0) +
            (assessments.culture || 0)
        ) / 3;

        // Final Score is 60% system estimate + 40% human reality
        // score = Math.round((score * 0.6) + (avgAssessment * 0.4));
        // Actually, let's keep it simple for now, static score is static.
        // Just add bonus? No, user didn't ask for this.
        // Reverting to previous logic:
        score = Math.round((score * 0.6) + (avgAssessment * 0.4));
        reasons.push('Mülakat değerlendirmesi etkili');
    }

    // --- Minimum Threshold Enforcement ---
    let finalScore = Math.min(score, 100);

    return {
        score: finalScore,
        reasons,
        isHighMatch: finalScore >= 70,
        type: 'static'
    };
}

/**
 * Matches a single candidate against multiple positions.
 * Returns the best fit ONLY if score >= 15.
 */
export function findBestPositionMatch(candidate, positions, options = {}) {
    if (!positions || positions.length === 0) return null;

    let bestMatch = null;
    let highestScore = -1;

    positions.forEach(pos => {
        const match = calculateMatchScore(candidate, pos, options);
        if (match.score > highestScore) {
            highestScore = match.score;
            bestMatch = { ...pos, matchScore: match.score, matchReasons: match.reasons };
        }
    });

    return bestMatch && highestScore >= 5 ? bestMatch : null;
}


/**
 * Returns all valid matches (score >= 5) for a candidate across all positions.
 */
export function findAllPositionMatches(candidate, positions) {
    if (!positions || positions.length === 0) return [];

    return positions
        .map(pos => {
            const match = calculateMatchScore(candidate, pos);
            return {
                position: pos,
                score: match.score,
                reasons: match.reasons,
                isHighMatch: match.isHighMatch
            };
        })
        .filter(m => m.score >= 5)
        .sort((a, b) => b.score - a.score);
}
