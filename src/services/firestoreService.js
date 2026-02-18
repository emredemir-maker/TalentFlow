// src/services/firestoreService.js
// Firestore CRUD operations with Match Score support

import {
    collection,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

const CANDIDATES_PATH = 'artifacts/talent-flow/public/data/candidates';
const USERS_PATH = 'artifacts/talent-flow/users';

export async function addCandidate(candidateData) {
    const candidatesRef = collection(db, CANDIDATES_PATH);
    const docRef = await addDoc(candidatesRef, {
        ...candidateData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function getCandidate(candidateId) {
    const docRef = doc(db, CANDIDATES_PATH, candidateId);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() };
    }
    return null;
}

export async function updateCandidate(candidateId, updates) {
    const docRef = doc(db, CANDIDATES_PATH, candidateId);
    await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteCandidate(candidateId) {
    const docRef = doc(db, CANDIDATES_PATH, candidateId);
    await deleteDoc(docRef);
}

export async function getUserSettings(userId) {
    const docRef = doc(db, `${USERS_PATH}/${userId}/settings`, 'preferences');
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserSettings(userId, settings) {
    const docRef = doc(db, `${USERS_PATH}/${userId}/settings`, 'preferences');
    await setDoc(docRef, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ==================== SEED DATA REMOVED FOR PRODUCTION ====================
export async function seedCandidates() {
    console.warn('[TalentFlow] Seeding is disabled in production.');
    return 0;
}
