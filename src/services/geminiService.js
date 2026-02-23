// src/services/geminiService.js
/**
 * REFACTORED AI SERVICE
 * This file acts as a facade for domain-specific AI sub-services.
 */

import { getModel } from './ai/config.js';
import {
    extractCandidateEvidence,
    extractPositionFromJD,
    quickCandidateScreening
} from './ai/extraction.js';
import {
    generateInterviewQuestions,
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion
} from './ai/interview.js';
import {
    generatePersonalizedDM,
    analyzeResponseEmail
} from './ai/communication.js';

export {
    getModel,
    extractCandidateEvidence,
    extractPositionFromJD,
    quickCandidateScreening,
    generateInterviewQuestions,
    generateInterviewPaths,
    scoreInterviewSession,
    generateFollowUpQuestion,
    generatePersonalizedDM,
    analyzeResponseEmail
};

export async function getAvailableModels() {
    return [
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (Fast & Deterministic)' }
    ];
}

/**
 * Internal score calculator (mathematical logic) to ensure 100% determinism.
 */
function calculateHybridScore(data) {
    if (data.starAnalysis) {
        const getScore = (val) => {
            if (typeof val === 'number') return val;
            if (typeof val === 'object' && val !== null && val.score !== undefined) return Number(val.score);
            return 0;
        };

        const s = getScore(data.starAnalysis.Situation);
        const t = getScore(data.starAnalysis.Task);
        const a = getScore(data.starAnalysis.Action);
        const r = getScore(data.starAnalysis.Result);

        const sum = s + t + a + r;
        return Math.min(100, Math.max(0, Math.round((sum / 4) * 10)));
    }

    let score = 0;
    const exp = Number(data.totalYearsOfExperience || 0);
    score += Math.min(exp * 5, 30);
    const matched = Array.isArray(data.matchedTechKeywords) ? data.matchedTechKeywords.length : 0;
    const missing = Array.isArray(data.missingTechKeywords) ? data.missingTechKeywords.length : 0;
    const totalKeywords = (matched + missing) || 1;
    score += Math.round((matched / totalKeywords) * 40);
    return Math.min(score, 100);
}

export async function analyzeCandidateMatch(jobDescription, candidateProfile) {
    const evidence = await extractCandidateEvidence(jobDescription, candidateProfile);
    const score = calculateHybridScore(evidence.extractedData);

    return {
        ...evidence.evidence,
        scoreData: evidence.extractedData,
        score: score,
        starAnalysis: evidence.extractedData.starAnalysis,
        reasons: evidence.evidence.reasoning || [],
        summary: evidence.evidence.summary,
        agentReasoning: evidence.evidence.reasoning,
        nextAction: evidence.extractedData.totalYearsOfExperience > 2 ? "schedule_technical_interview" : "send_rejection",
        topSkills: (evidence.extractedData.matchedTechKeywords || []).map(s => ({ skill: s, relevance: "High" })),
        gapAnalysis: (evidence.extractedData.missingTechKeywords || []).map(s => ({ gap: s, severity: "High", suggestion: "Eğitim önerilir" })),
        personalizedMessage: `Merhabalar ${candidateProfile.name}. Profilinizi inceledim. ${evidence.evidence.summary}`
    };
}
