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
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter states (client-side filtering per Rule 2)
    const [searchQuery, setSearchQuery] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [experienceFilter, setExperienceFilter] = useState('all');

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
            const docRef = doc(db, CANDIDATES_COLLECTION, id);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Error updating candidate:', err);
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

    useEffect(() => {
        // Rule 3: Do NOT fetch data until authenticated
        if (authLoading || !isAuthenticated) {
            return;
        }

        setLoading(true);

        // onSnapshot for real-time listening (no complex queries - Rule 2)
        const candidatesRef = collection(db, CANDIDATES_COLLECTION);
        const unsubscribe = onSnapshot(
            candidatesRef,
            (snapshot) => {
                const candidateList = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }));
                // Sort by createdAt desc locally since we can't use complex queries easily
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

        return () => unsubscribe();
    }, [isAuthenticated, authLoading]);

    // Client-side filtering (Rule 2 - no orderBy/limit queries)
    const filteredCandidates = useMemo(() => {
        let result = [...candidates];

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

        return result;
    }, [candidates, searchQuery, departmentFilter, statusFilter, experienceFilter]);

    // Extract unique departments for filter options
    const departments = useMemo(() => {
        const deptSet = new Set(candidates.map((c) => c.department).filter(Boolean));
        return ['all', ...Array.from(deptSet).sort()];
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
