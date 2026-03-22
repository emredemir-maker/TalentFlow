// src/context/CandidatesContext.jsx
// Candidates Context - Real-time Firestore listener with client-side filtering
// Rule 2 Compliance: Uses onSnapshot without complex queries, filters client-side

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, getDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import { useAuth } from './AuthContext';

const CandidatesContext = createContext(null);

// Firestore collection path for general candidate pool
const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';

export function CandidatesProvider({ children }) {
    const { isAuthenticated, loading: authLoading, isDepartmentUser, userDepartments, role, user } = useAuth();
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewCandidateId, setViewCandidateId] = useState(null);
    const [compareIds, setCompareIds] = useState([]);
    const [preselectedInterviewData, setPreselectedInterviewData] = useState(null); // For passing data to InterviewManagementPage

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

    const toggleCompareCandidate = (id) => {
        setCompareIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(i => i !== id);
            }
            if (prev.length >= 4) return prev; // Limit to 4 candidates
            return [...prev, id];
        });
    };

    const clearCompareSelection = () => setCompareIds([]);

    const [sourceColors, setSourceColors] = useState({});

    useEffect(() => {
        // Rule 3: Do NOT fetch data until authenticated
        // EXCEPT for candidate join and live interview routes which handle their own validation
        const isPublicAccessRoute = window.location.pathname.startsWith('/join/') || 
                                     window.location.pathname.startsWith('/live-interview/') ||
                                     window.location.pathname.startsWith('/interview-report/');

        if (authLoading) {
            return;
        }

        if (!isAuthenticated && !isPublicAccessRoute) {
            // Not authenticated and not a public route? Reset loading and wait.
            setLoading(false); 
            return;
        }

        setLoading(true);
        let unsubCandidates = () => {};
        let unsubSources = () => {};

        // onSnapshot for real-time listening for candidates
        const candidatesRef = collection(db, CANDIDATES_COLLECTION);

        // IF UNAUTHENTICATED candidate joining, DO NOT listen to the whole collection automatically
        if (!isAuthenticated && isPublicAccessRoute) {
            console.warn('[TalentFlow] Public access detected. Waiting for anonymous auth before starting listener...');
            // If we are on a public route and not authenticated, and user is null (not even anonymous yet)
            // then trigger anonymous sign-in. This ensures Firestore rules can be evaluated.
            if (!user) {
                console.log("[TalentFlow] Public route & unauthenticated. Triggering anonymous sign-in from CandidatesContext...");
                signInAnonymously(auth).then(cred => {
                    console.log("[TalentFlow] Anonymous sign-in success:", cred.user.uid);
                }).catch(err => {
                    console.error("[TalentFlow] Anonymous Sign-In Error:", err);
                });
            }
            // Still set candidates to empty and loading false, as the actual listener will start
            // once the 'user' object is populated by the anonymous sign-in (triggering re-run of useEffect)
            setCandidates([]);
            setLoading(false);
            setError(null);
            return;
        }

        // IF Anonymous user on a live-interview join route, look up the candidate
        // by reading the public session document (/interviews/{sessionId}) which
        // contains the actual candidateId.  Session IDs are now iv-{uuid}, so
        // we can no longer extract the candidateId from the URL directly.
        if (user?.isAnonymous) {
            const pathParts = window.location.pathname.split('/');
            const sessionIdFromUrl = pathParts.find(p => p.startsWith('iv-'));

            if (sessionIdFromUrl) {
                console.log(`[TalentFlow] Anonymous user detected. Resolving candidateId from session doc: ${sessionIdFromUrl}`);
                let innerUnsub = null;

                // Read the session document (allow read: if true) to get the real candidateId
                getDoc(doc(db, 'interviews', sessionIdFromUrl)).then((sessionSnap) => {
                    if (!sessionSnap.exists()) {
                        console.warn(`[TalentFlow] Session doc not found: ${sessionIdFromUrl}`);
                        setCandidates([]);
                        setLoading(false);
                        return;
                    }
                    const candidateId = sessionSnap.data()?.candidateId;
                    if (!candidateId) {
                        console.warn(`[TalentFlow] Session doc has no candidateId`);
                        setCandidates([]);
                        setLoading(false);
                        return;
                    }
                    console.log(`[TalentFlow] Starting TARGETED listener for candidate: ${candidateId}`);
                    const candidateDocRef = doc(db, CANDIDATES_COLLECTION, candidateId);
                    innerUnsub = onSnapshot(candidateDocRef, (docSnap) => {
                        if (docSnap.exists()) {
                            setCandidates([{ id: docSnap.id, ...docSnap.data() }]);
                            console.log(`[TalentFlow] Targeted candidate data loaded.`);
                        } else {
                            console.warn(`[TalentFlow] Candidate document not found: ${candidateId}`);
                            setCandidates([]);
                        }
                        setLoading(false);
                    }, (err) => {
                        console.error('[TalentFlow] Targeted candidate listener error:', err);
                        setCandidates([]);
                        setLoading(false);
                    });
                }).catch((err) => {
                    console.error('[TalentFlow] Session doc read error:', err);
                    setCandidates([]);
                    setLoading(false);
                });

                unsubCandidates = () => { if (innerUnsub) innerUnsub(); };
                return () => unsubCandidates();
            }
        }

        // Department users: run TWO parallel Firestore queries and merge results.
        // Query 1: candidates whose primary `department` field is in the user's depts.
        // Query 2: candidates from ANY department that a recruiter has released to
        //          the user's dept via the `visibleToDepartments` array.
        // Both result sets are merged by candidate ID so there are no duplicates.
        const safeUserDepts = Array.isArray(userDepartments) ? userDepartments : [];
        if (isDepartmentUser) {
            if (safeUserDepts.length === 0) {
                // No departments assigned — show nothing, no subscription needed
                console.warn('[TalentFlow] department_user has no departments assigned. Showing empty candidate list.');
                setCandidates([]);
                setLoading(false);
                return () => {};
            }

            console.log(`[TalentFlow] Starting DUAL-QUERY candidates listener for departments: [${safeUserDepts.join(', ')}]`);

            // Shared mutable snapshot store — updated independently by each listener
            const snapshots = { dept: [], visible: [] };
            // Count down from 2; when it hits 0 both queries have emitted at least once
            let pendingFirst = 2;

            const mergeAndSet = () => {
                const combined = new Map();
                snapshots.dept.forEach(c => combined.set(c.id, c));
                snapshots.visible.forEach(c => combined.set(c.id, c));
                const merged = Array.from(combined.values()).sort((a, b) => {
                    const aTime = (typeof a.createdAt?.toMillis === 'function') ? a.createdAt.toMillis() : 0;
                    const bTime = (typeof b.createdAt?.toMillis === 'function') ? b.createdAt.toMillis() : 0;
                    return bTime - aTime;
                });
                setCandidates(merged);
                setError(null);
            };

            // Query 1: primary department field ('in' supports up to 30 values)
            const deptQ = query(candidatesRef, where('department', 'in', safeUserDepts.slice(0, 30)));
            const unsubDept = onSnapshot(
                deptQ,
                (snap) => {
                    snapshots.dept = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    if (pendingFirst > 0) { pendingFirst--; if (pendingFirst === 0) setLoading(false); }
                    mergeAndSet();
                },
                (err) => {
                    console.error('[TalentFlow] Dept-query snapshot error:', err);
                    setError(err.message);
                    if (pendingFirst > 0) { pendingFirst--; if (pendingFirst === 0) setLoading(false); }
                }
            );

            // Query 2: released cross-dept candidates ('array-contains-any' supports up to 10 values).
            // NOTE: if a user belongs to more than 10 departments only the first 10 are queried;
            // this is an unlikely edge case for normal HR workflows.
            const visibleQ = query(candidatesRef, where('visibleToDepartments', 'array-contains-any', safeUserDepts.slice(0, 10)));
            const unsubVisible = onSnapshot(
                visibleQ,
                (snap) => {
                    snapshots.visible = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    if (pendingFirst > 0) { pendingFirst--; if (pendingFirst === 0) setLoading(false); }
                    mergeAndSet();
                },
                (err) => {
                    // Non-blocking: if the Firestore index is missing or permission denied,
                    // log at error level so it is discoverable, but do not crash the UI.
                    // Cross-dept released candidates will be invisible until this is fixed.
                    console.error(
                        '[TalentFlow] visibleToDepartments query failed — released cross-dept candidates will NOT be visible to this department user.',
                        'Code:', err.code, '| Message:', err.message
                    );
                    if (pendingFirst > 0) { pendingFirst--; if (pendingFirst === 0) setLoading(false); }
                    mergeAndSet();
                }
            );

            unsubCandidates = () => { unsubDept(); unsubVisible(); };
        } else {
            // Recruiter / super_admin: full collection listener
            console.log(`[TalentFlow] Starting global candidates listener (isAuthenticated: ${isAuthenticated}, isPublicAccessRoute: ${isPublicAccessRoute})`);
            unsubCandidates = onSnapshot(
                candidatesRef,
                (snapshot) => {
                    const candidateList = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    candidateList.sort((a, b) => {
                        const aTime = (typeof a.createdAt?.toMillis === 'function') ? a.createdAt.toMillis() : 0;
                        const bTime = (typeof b.createdAt?.toMillis === 'function') ? b.createdAt.toMillis() : 0;
                        return bTime - aTime;
                    });
                    setCandidates(candidateList);
                    setLoading(false);
                    setError(null);
                },
                (err) => {
                    console.error('[TalentFlow] Candidates snapshot error:', err);
                    // If it's a public route, don't crash the UI with permission errors
                    if (isPublicAccessRoute && err.code === 'permission-denied') {
                        setCandidates([]);
                        setError(null);
                    } else {
                        setError(err.message);
                    }
                    setLoading(false);
                }
            );
        }

            // onSnapshot for sources to get colors
            const sourcesRef = collection(db, 'artifacts/talent-flow/public/data/sources');
            unsubSources = onSnapshot(sourcesRef, (snapshot) => {
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
            if (unsubCandidates) unsubCandidates();
            if (unsubSources) unsubSources();
        };
    }, [isAuthenticated, authLoading, user, isDepartmentUser, userDepartments]); // userDepartments change triggers re-subscription for dept_users



    // Enrich candidates with best match data and interview scores
    const enrichedCandidates = useMemo(() => {
        if (!Array.isArray(candidates)) return [];

        const enriched = candidates.map(c => {
            if (!c) return null;

            let bestAiScore = Number(c.aiScore || c.matchScore || c.initialAiScore || c.aiAnalysis?.score || 0);
            if (isNaN(bestAiScore)) bestAiScore = 0;

            let bestTitle = c.matchedPositionTitle || c.bestTitle || c.position || null;

            if (c.positionAnalyses && typeof c.positionAnalyses === 'object') {
                try {
                    Object.entries(c.positionAnalyses).forEach(([title, analysis]) => {
                        if (!analysis) return;
                        const score = Number(analysis.score || analysis.matchScore || 0);
                        if (!isNaN(score) && score > bestAiScore) {
                            bestAiScore = score;
                            bestTitle = title;
                        }
                    });
                } catch (e) {
                    console.warn("Failed to parse positionAnalyses for candidate:", c.id);
                }
            }

            // Calculate Interview Score (if exists, use the latest session's finalScore)
            const sessions = Array.isArray(c.interviewSessions) ? c.interviewSessions : [];
            const hasInterview = sessions.length > 0;
            let interviewScore = null;

            if (hasInterview) {
                const lastSession = sessions[sessions.length - 1];
                interviewScore = Number(lastSession?.finalScore);
                if (isNaN(interviewScore)) interviewScore = null;
            }

            // Combined Score Calculation:
            let combinedScore = bestAiScore;
            if (interviewScore !== null) {
                combinedScore = Math.round((bestAiScore + interviewScore) / 2);
            }

            return {
                ...c,
                bestScore: bestAiScore,
                bestTitle,
                interviewScore,
                combinedScore,
                hasInterview
            };
        }).filter(Boolean);

        const safeIsDeptUser = !!isDepartmentUser;
        const safeUserDepts = Array.isArray(userDepartments) ? userDepartments : [];

        if (safeIsDeptUser && safeUserDepts.length > 0) {
            return enriched.filter(c =>
                c.department && safeUserDepts.includes(c.department) ||
                (Array.isArray(c.visibleToDepartments) && c.visibleToDepartments.some(d => safeUserDepts.includes(d)))
            );
        }

        return enriched;
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
        preselectedInterviewData,
        setPreselectedInterviewData,

        // Comparison
        compareIds,
        toggleCompareCandidate,
        clearCompareSelection,
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
