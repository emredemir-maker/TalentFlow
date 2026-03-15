// src/context/PositionsContext.jsx
// Context provider for managing job positions

import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../config/firebase';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy
} from 'firebase/firestore';

const POSITIONS_COLLECTION = 'artifacts/talent-flow/public/data/positions';

const PositionsContext = createContext();

export function usePositions() {
    return useContext(PositionsContext);
}

export function PositionsProvider({ children }) {
    const { isAuthenticated } = useAuth();
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Initial listener for real-time updates
    useEffect(() => {
        if (!isAuthenticated) return;

        setLoading(true);
        const positionsRef = collection(db, POSITIONS_COLLECTION);

        const unsubscribe = onSnapshot(positionsRef, (snapshot) => {
            const positionsList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAtLabel: (typeof doc.data().createdAt?.toDate === 'function') 
                    ? doc.data().createdAt.toDate().toLocaleDateString('tr-TR') 
                    : new Date().toLocaleDateString('tr-TR')
            }));

            // Client-side sorting (Rule 2)
            positionsList.sort((a, b) => {
                const aTime = (typeof a.createdAt?.toMillis === 'function') ? a.createdAt.toMillis() : 0;
                const bTime = (typeof b.createdAt?.toMillis === 'function') ? b.createdAt.toMillis() : 0;
                return bTime - aTime;
            });

            setPositions(positionsList);
            setLoading(false);
            setError(null);
        }, (err) => {
            console.error("[TalentFlow] Positions listener error:", err);
            setError("Pozisyonlar yüklenirken hata oluştu.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthenticated]);

    // Add a new position (recruiter/admin creates directly as open)
    const addPosition = async (positionData, initialStatus = 'open') => {
        try {
            await addDoc(collection(db, POSITIONS_COLLECTION), {
                ...positionData,
                status: initialStatus,
                matchedCandidates: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error adding position:", err);
            throw err;
        }
    };

    // Department user requests a position (pending_approval)
    const addPositionRequest = async (positionData, requestedBy) => {
        try {
            await addDoc(collection(db, POSITIONS_COLLECTION), {
                ...positionData,
                status: 'pending_approval',
                requestedBy: requestedBy || null,
                matchedCandidates: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error requesting position:", err);
            throw err;
        }
    };

    // Recruiter approves a pending position request
    const approvePosition = async (id) => {
        try {
            const docRef = doc(db, POSITIONS_COLLECTION, id);
            await updateDoc(docRef, {
                status: 'open',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error approving position:", err);
            throw err;
        }
    };

    // Reject a pending position request
    const rejectPosition = async (id, reason = '') => {
        try {
            const docRef = doc(db, POSITIONS_COLLECTION, id);
            await updateDoc(docRef, {
                status: 'rejected',
                rejectionReason: reason,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error rejecting position:", err);
            throw err;
        }
    };

    // Update an existing position
    const updatePosition = async (id, updates) => {
        try {
            const docRef = doc(db, POSITIONS_COLLECTION, id);
            await updateDoc(docRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error updating position:", err);
            throw err;
        }
    };

    // Delete a position
    const deletePosition = async (id) => {
        try {
            await deleteDoc(doc(db, POSITIONS_COLLECTION, id));
        } catch (err) {
            console.error("Error deleting position:", err);
            throw err;
        }
    };

    // Toggle position status (open/closed)
    const togglePositionStatus = async (id, currentStatus) => {
        const newStatus = currentStatus === 'open' ? 'closed' : 'open';
        await updatePosition(id, { status: newStatus });
    };

    const value = {
        positions,
        loading,
        error,
        addPosition,
        addPositionRequest,
        approvePosition,
        rejectPosition,
        updatePosition,
        deletePosition,
        togglePositionStatus
    };

    return (
        <PositionsContext.Provider value={value}>
            {children}
        </PositionsContext.Provider>
    );
}
