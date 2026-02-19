export const AGENTIC_WORKFLOW = {
    // 1. Data Ingestion & Enrichment
    ingestion: {
        parsing: {
            description: "Extract structured data from resume text using NLP.",
            service: "geminiService.parseResume",
            output: ["skills", "experience", "education", "contact"]
        },
        enrichment: {
            description: "Augment profile with web data (GitHub, LinkedIn, Blog).",
            status: "planned", // To be implemented via Serper/Firecrawl
            output: ["social_score", "public_repos", "articles"]
        }
    },

    // 2. Skills Inference & Attribute Matching
    inference: {
        attributeMatching: {
            description: "Match nuances like 'rapid growth', 'leadership potential'.",
            service: "matchService.calculateMatchScore (enhanced with semantic analysis)",
            type: "implicit"
        },
        predictive: {
            description: "Predict success probability based on trajectory.",
            service: "geminiService.predictSuccess",
            output: "success_probability_score"
        }
    },

    // 3. Scoring & Explainable AI
    scoring: {
        dynamicscoring: {
            description: "Real-time 0-100 scoring based on job reqs.",
            service: "matchService.findBestPositionMatch"
        },
        explanation: {
            description: "Why this candidate? (Gap analysis, Strong suits).",
            service: "geminiService.analyzeCandidateMatch",
            output: "analysis_report"
        }
    },

    // 4. Engagement (Future)
    engagement: {
        screening: {
            description: "Chatbot for knockout questions (Visa, Shift).",
            service: "chatbotService.screenCandidate",
            status: "planned"
        },
        scheduling: {
            description: "Auto-schedule interview if passed screening.",
            service: "calendarService.schedule",
            status: "planned"
        }
    },

    // 5. Ethics & Human-in-the-Loop
    ethics: {
        anonymization: {
            description: "Hide Name, Age, Gender before initial ranking.",
            service: "privacyService.anonymize",
            active: true // Conceptually active in ranking view
        },
        humanReview: {
            description: "Final decision must be human.",
            enforcement: "UI requires manual 'Approve/Reject' action.",
            active: true
        }
    }
};

/**
 * Orchestrates the Agentic Workflow for a single candidate.
 * Returns the final processed state.
 */
export async function runAgenticWorkflow(candidate, position, services) {
    const { matchService, geminiService } = services;
    let result = { ...candidate };

    // Phase 1 : Ingestion (Already done via upload, but let's simulate enrichment)
    // log("Enriching data..."); 

    // Phase 2 & 3: Inference & Scoring
    const match = matchService.calculateMatchScore(candidate, position);

    // Phase 3.5: Explainable AI (if high potential)
    if (match.score > 40) { // Lower threshold for deep analysis
        const analysis = await geminiService.analyzeCandidateMatch(
            position.description,
            candidate,
            'gemini-2.0-flash'
        );
        result.aiAnalysis = analysis;
        result.matchScore = analysis.score; // AI overrides static
    } else {
        result.matchScore = match.score;
    }

    // Phase 5: Privacy Wrapper (for UI consumption)
    result.displayProfile = {
        ...result,
        name: "*** ***", // Anonymized for initial review
        email: "***",
        phone: "***"
    };

    return result;
}
