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

// ==================== SEED DATA FOR TESTING ====================
export async function seedCandidates() {
    const candidates = [
        {
            name: "Oğuzhan Çağlıyan (TEST KAYIT)",
            email: "oguzhan.test@talentflow.ai",
            position: "Senior Backend Developer",
            matchedPositionTitle: "Senior Backend Developer",
            experience: 8,
            skills: ["Go", "Node.js", "Postgres", "Redis", "System Design"],
            department: "Teknoloji",
            status: "ai_analysis",
            source: "İnsan Kaynakları",
            matchScore: 92,
            initialAiScore: 92,
            about: "8+ yıl tecrübeli backend mühendisi. Yüksek ölçekli sistemler ve mikroservis mimarileri konusunda uzman. Trendyol ve Getir gibi firmalarda kritik projelerde yer aldı.",
            aiAnalysis: {
                score: 92,
                summary: "Adayın teknik derinliği oldukça yüksek. Özellikle Go ve Redis deneyimi pozisyonun gereklilikleri ile tam örtüşüyor. STAR metodolojisine göre aksiyonları net."
            }
        },
        {
            name: "Selin Yıldız (TEST KAYIT)",
            email: "selin.test@talentflow.ai",
            position: "Senior Product Manager",
            matchedPositionTitle: "Product Manager",
            experience: 6,
            skills: ["Product Roadmap", "A/B Testing", "Mixpanel", "Jira", "Agile"],
            department: "Ürün Yönetimi",
            status: "ai_analysis",
            source: "Referans",
            sourceDetail: "Ahmet Yılmaz",
            matchScore: 88,
            initialAiScore: 88,
            about: "E-ticaret ve Fintech sektörlerinde 6 yıllık ürün yönetimi tecrübesi. Veri odaklı karar alma mekanizmaları ve kullanıcı deneyimi optimizasyonunda başarılı sonuçlar elde etti.",
            aiAnalysis: {
                score: 88,
                summary: "Ürün vizyonu ve metrik takibi yetkinlikleri güçlü. Fintech projelerindeki başarıları somut kanıtlarla desteklenmiş."
            }
        },
        {
            name: "Mert Demir (TEST KAYIT)",
            email: "mert.test@talentflow.ai",
            position: "HR Team Lead",
            matchedPositionTitle: "HR Manager",
            experience: 12,
            skills: ["Leadership", "Conflict Management", "OKRs", "Strategic Hiring"],
            department: "İş Destek",
            status: "ai_analysis",
            source: "LinkedIn",
            matchScore: 85,
            initialAiScore: 85,
            about: "Küresel ölçekli teknoloji şirketlerinde 10+ yıl İK ve ekip yönetimi deneyimi. Şirket kültürü inşası ve performans sistemleri kurulumunda uzman.",
            aiAnalysis: {
                score: 85,
                summary: "Yönetim becerileri ve şirket kültürüne uyumu oldukça yüksek görünüyor. Stratejik bakış açısı gelişmiş."
            }
        }
    ];

    let count = 0;
    for (const c of candidates) {
        try {
            await addCandidate(c);
            count++;
        } catch (e) {
            console.error("Seeding error for", c.name, e);
        }
    }
    console.log(`✅ [TalentFlow] seeded ${count} candidates.`);
    return count;
}
