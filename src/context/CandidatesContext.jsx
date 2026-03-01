// src/context/CandidatesContext.jsx
// Candidates Context - Real-time Firestore listener with client-side filtering
// Rule 2 Compliance: Uses onSnapshot without complex queries, filters client-side

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const CandidatesContext = createContext(null);

// Firestore collection path for general candidate pool
const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';

export function CandidatesProvider({ children }) {
    const { isAuthenticated, loading: authLoading, isDepartmentUser, userDepartments, role } = useAuth();
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewCandidateId, setViewCandidateId] = useState(null);

    // Filter states (client-side filtering per Rule 2)
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [experienceFilter, setExperienceFilter] = useState('all');
    const [positionFilter, setPositionFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [subSourceFilter, setSubSourceFilter] = useState('all');

    // CRUD Operations
    const addCandidate = async (candidateData) => {
        try {
            const docRef = await addDoc(collection(db, CANDIDATES_COLLECTION), {
                ...candidateData,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            return docRef.id;
        } catch (err) {
            console.error('Error adding candidate:', err);
            throw err;
        }
    };

    const updateCandidate = async (id, updates) => {
        try {
            console.log(`[Firestore] Updating candidate ${id}...`, updates);
            const docRef = doc(db, CANDIDATES_COLLECTION, id);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            console.log(`[Firestore] Candidate ${id} updated successfully.`);
        } catch (err) {
            console.error('Error updating candidate in Firestore:', err);
            throw err;
        }
    };

    const deleteCandidate = async (id) => {
        try {
            const docRef = doc(db, CANDIDATES_COLLECTION, id);
            await deleteDoc(docRef);
        } catch (err) {
            console.error('Error deleting candidate:', err);
            throw err;
        }
    };

    const [sourceColors, setSourceColors] = useState({});

    useEffect(() => {
        // Rule 3: Do NOT fetch data until authenticated
        if (authLoading || !isAuthenticated) {
            return;
        }

        setLoading(true);

        // onSnapshot for real-time listening for candidates
        const candidatesRef = collection(db, CANDIDATES_COLLECTION);
        const unsubCandidates = onSnapshot(
            candidatesRef,
            (snapshot) => {
                const candidateList = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                candidateList.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
                setCandidates(candidateList);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('[TalentFlow] Candidates snapshot error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        // onSnapshot for sources to get colors
        const sourcesRef = collection(db, 'artifacts/talent-flow/public/data/sources');
        const unsubSources = onSnapshot(sourcesRef, (snapshot) => {
            const colors = {};
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.name && data.color) {
                    colors[data.name.toLowerCase()] = data.color;
                }
            });
            setSourceColors(colors);
        });

        return () => {
            unsubCandidates();
            unsubSources();
        };
    }, [isAuthenticated, authLoading]);



    // Enrich candidates with best match data and interview scores
    const enrichedCandidates = useMemo(() => {
        return candidates.map(c => {
            let bestAiScore = c.aiScore || c.aiAnalysis?.score || 0;
            let bestTitle = c.matchedPositionTitle || null;

            if (c.positionAnalyses) {
                Object.entries(c.positionAnalyses).forEach(([title, analysis]) => {
                    if (analysis && analysis.score > bestAiScore) {
                        bestAiScore = analysis.score;
                        bestTitle = title;
                    }
                });
            }

            // Calculate Interview Score (if exists, use the latest session's finalScore)
            const sessions = c.interviewSessions || [];
            const hasInterview = sessions.length > 0;
            const interviewScore = hasInterview
                ? sessions[sessions.length - 1].finalScore
                : null;

            // Combined Score Calculation: 
            // If interview exists, it's (AI + Interview) / 2.
            // This is the "True Score" or "Index Score".
            let combinedScore = bestAiScore;
            if (interviewScore !== null) {
                combinedScore = Math.round((bestAiScore + interviewScore) / 2);
            }

            return {
                ...c,
                bestScore: bestAiScore, // Original AI best
                bestTitle,
                interviewScore,
                combinedScore,
                hasInterview
            };
        });

        if (isDepartmentUser && userDepartments?.length > 0) {
            return enrichedCandidates.filter(c =>
                userDepartments.includes(c.department) ||
                (c.visibleToDepartments && c.visibleToDepartments.some(d => userDepartments.includes(d)))
            );
        }

        return enrichedCandidates;
    }, [candidates, isDepartmentUser, userDepartments]);

    // Client-side filtering (Rule 2 - no orderBy/limit queries)
    const filteredCandidates = useMemo(() => {
        let result = [...enrichedCandidates];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(
                (c) =>
                    c.name?.toLowerCase().includes(query) ||
                    c.email?.toLowerCase().includes(query) ||
                    c.position?.toLowerCase().includes(query) ||
                    c.department?.toLowerCase().includes(query) ||
                    c.skills?.some((s) => s.toLowerCase().includes(query))
            );
        }

        // Department filter
        if (departmentFilter !== 'all') {
            result = result.filter((c) => c.department === departmentFilter);
        }

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter((c) => c.status === statusFilter);
        }

        // Experience filter
        if (experienceFilter !== 'all') {
            const [min, max] = experienceFilter.split('-').map(Number);
            result = result.filter((c) => {
                const exp = c.experience || 0;
                if (max) return exp >= min && exp <= max;
                return exp >= min; // "10+" case
            });
        }

        // Position Match filter
        if (positionFilter !== 'all') {
            result = result.filter((c) => c.bestTitle === positionFilter);
        }

        // Source filter
        if (sourceFilter !== 'all') {
            result = result.filter((c) => c.source === sourceFilter);
        }

        // Sub-source filter
        if (subSourceFilter !== 'all') {
            result = result.filter((c) => c.sourceDetail === subSourceFilter);
        }

        return result;
    }, [enrichedCandidates, searchQuery, departmentFilter, statusFilter, experienceFilter, positionFilter, sourceFilter, subSourceFilter]);

    // Extract unique departments and matched positions for filter options
    const departments = useMemo(() => {
        const deptSet = new Set(candidates.map((c) => c.department).filter(Boolean));
        return ['all', ...Array.from(deptSet).sort()];
    }, [candidates]);

    const matchPositions = useMemo(() => {
        const titleSet = new Set(enrichedCandidates.map((c) => c.bestTitle).filter(Boolean));
        return ['all', ...Array.from(titleSet).sort()];
    }, [enrichedCandidates]);

    const sourcesOptions = useMemo(() => {
        const srcSet = new Set(candidates.map((c) => c.source).filter(Boolean));
        return ['all', ...Array.from(srcSet).sort()];
    }, [candidates]);

    const subSourcesOptions = useMemo(() => {
        const subSet = new Set(candidates.map((c) => c.sourceDetail).filter(Boolean));
        return ['all', ...Array.from(subSet).sort()];
    }, [candidates]);

    // Stats
    const stats = useMemo(() => ({
        total: candidates.length,
        filtered: filteredCandidates.length,
        byStatus: candidates.reduce((acc, c) => {
            acc[c.status || 'unknown'] = (acc[c.status || 'unknown'] || 0) + 1;
            return acc;
        }, {}),
        byDepartment: candidates.reduce((acc, c) => {
            acc[c.department || 'unknown'] = (acc[c.department || 'unknown'] || 0) + 1;
            return acc;
        }, {}),
    }), [candidates, filteredCandidates]);

    const value = {
        // Data
        candidates,
        filteredCandidates,
        stats,
        departments,

        // Loading states
        loading,
        error,

        // Actions
        addCandidate,
        updateCandidate,
        deleteCandidate,

        // Filters
        searchQuery,
        setSearchQuery,
        departmentFilter,
        setDepartmentFilter,
        statusFilter,
        setStatusFilter,
        experienceFilter,
        setExperienceFilter,
        positionFilter,
        setPositionFilter,
        matchPositions,
        enrichedCandidates,
        sourceFilter,
        setSourceFilter,
        sourcesOptions,
        subSourceFilter,
        setSubSourceFilter,
        subSourcesOptions,
        sourceColors,

        // Navigation / Detailed View
        viewCandidateId,
        setViewCandidateId,
    };

    return (
        <CandidatesContext.Provider value={value}>
            {children}
        </CandidatesContext.Provider>
    );
}

export function useCandidates() {
    const context = useContext(CandidatesContext);
    if (!context) {
        throw new Error('useCandidates must be used within a CandidatesProvider');
    }
    return context;
}

export default CandidatesContext;
