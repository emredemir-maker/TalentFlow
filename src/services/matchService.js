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
 * Keywords are intentionally broader to avoid missing edge cases.
 * Order matters: first match wins.
 */
const JOB_DOMAINS = [
    { id: 'sales',       label: 'Satış',           keywords: ['satış', 'sales', 'account manager', 'business development', 'iş geliştirme', 'ticari', 'commercial', 'müşteri temsilci', 'satış müdür', 'satış uzman', 'revenue', 'quota', 'crm', 'müşteri yönetimi', 'channel'] },
    { id: 'marketing',   label: 'Pazarlama',        keywords: ['pazarlama', 'marketing', 'marka', 'brand', 'dijital pazarlama', 'digital marketing', 'seo', 'sem', 'kampanya', 'campaign', 'growth', 'acquisition', 'retention'] },
    { id: 'design',      label: 'Tasarım',          keywords: ['tasarımcı', 'designer', 'ui/ux', 'ux designer', 'ui designer', 'product design', 'grafik', 'graphic', 'motion', 'figma', 'sketch', 'adobe xd', 'creative director'] },
    { id: 'data',        label: 'Veri / Analitik',  keywords: ['data scientist', 'data engineer', 'data analyst', 'makine öğrenmesi', 'machine learning', 'yapay zeka uzman', 'bi analyst', 'business intelligence', 'nlp', 'deep learning', 'model training'] },
    { id: 'engineering', label: 'Yazılım',          keywords: ['yazılım geliştirici', 'developer', 'software engineer', 'backend', 'frontend', 'full stack', 'fullstack', 'devops', 'cloud engineer', 'mühendis', 'programcı', 'geliştirici', 'sre', 'platform engineer', 'mobile developer', 'ios developer', 'android developer', 'yazılım mühendisi'] },
    { id: 'hr',          label: 'İnsan Kaynakları', keywords: ['insan kaynakları', 'hr', 'recruitment', 'recruiter', 'işe alım', 'organizasyon gelişim', 'human resources', 'ik uzman', 'ik müdür', 'talent acquisition', 'performans yönetimi'] },
    { id: 'finance',     label: 'Finans / Muhasebe',keywords: ['finans', 'finance', 'muhasebe', 'accountant', 'accounting', 'mali', 'treasury', 'bütçe', 'budget', 'cfo', 'controller', 'denetim', 'audit'] },
    { id: 'operations',  label: 'Operasyon',        keywords: ['operasyon', 'operations', 'supply chain', 'lojistik', 'logistics', 'tedarik zinciri', 'procurement', 'satın alma', 'depo', 'warehouse', 'fulfillment'] },
    { id: 'support',     label: 'Müşteri Hizmetleri',keywords: ['müşteri hizmet', 'customer service', 'destek', 'support specialist', 'help desk', 'teknik destek', 'technical support', 'call center', 'çağrı merkezi'] },
    { id: 'legal',       label: 'Hukuk',            keywords: ['hukuk', 'legal', 'avukat', 'lawyer', 'counsel', 'compliance', 'uyum', 'sözleşme', 'contract'] },
    { id: 'management',  label: 'Yönetim',          keywords: ['genel müdür', 'ceo', 'coo', 'cto', 'direktör', 'director', 'vp', 'vice president', 'country manager', 'general manager', 'c-level'] },
];

/**
 * Detect the primary job domain from any freeform text.
 * Returns a domain id string, or 'general' if nothing matches.
 */
export function detectJobDomain(text) {
    if (!text) return 'general';
    const lower = text.toLowerCase();
    for (const domain of JOB_DOMAINS) {
        if (domain.keywords.some(kw => lower.includes(kw))) return domain.id;
    }
    return 'general';
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
 * Build a single text blob for domain detection from a candidate object.
 */
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

/**
 * Build a single text blob for domain detection from a position object.
 */
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
    const candidateDomain = detectJobDomain(candidateDomainText(candidate));
    if (candidateDomain === 'general') return positions;
    return positions.filter(pos => {
        const posDomain = detectJobDomain(positionDomainText(pos));
        return areDomainsCompatible(candidateDomain, posDomain);
    });
}

/**
 * Filter a list of candidates to only those domain-compatible with a position.
 * If the position domain cannot be determined ('general'), all candidates are returned.
 */
export function filterCandidatesByDomain(position, candidates) {
    if (!candidates || candidates.length === 0) return [];
    const posDomain = detectJobDomain(positionDomainText(position));
    if (posDomain === 'general') return candidates;
    return candidates.filter(c => {
        const cDomain = detectJobDomain(candidateDomainText(c));
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
