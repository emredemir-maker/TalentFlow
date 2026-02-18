// src/context/PositionsContext.jsx
// Context provider for managing job positions

import { createContext, useContext, useState, useEffect } from 'react';
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

const PositionsContext = createContext();

export function usePositions() {
    return useContext(PositionsContext);
}

export function PositionsProvider({ children }) {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Initial listener for real-time updates
    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, 'positions'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const positionsList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate()?.toLocaleDateString('tr-TR') || new Date().toLocaleDateString('tr-TR')
            }));
            setPositions(positionsList);
            setLoading(false);
        }, (err) => {
            console.error("Positions listener error:", err);
            setError("Pozisyonlar yüklenirken hata oluştu.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Add a new position
    const addPosition = async (positionData) => {
        try {
            await addDoc(collection(db, 'positions'), {
                ...positionData,
                status: 'open',
                matchedCandidates: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error adding position:", err);
            throw err;
        }
    };

    // Update an existing position
    const updatePosition = async (id, updates) => {
        try {
            const docRef = doc(db, 'positions', id);
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
            await deleteDoc(doc(db, 'positions', id));
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
