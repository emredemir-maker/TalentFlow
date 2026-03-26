// One-time migration: candidates with status='new' → status='ai_analysis'
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
    });
}

const db = admin.firestore();
const CANDIDATES_COLLECTION = 'artifacts/talent-flow/public/data/candidates';

async function migrate() {
    console.log('🔍 Scanning candidates with status="new"...');

    const snapshot = await db
        .collection(CANDIDATES_COLLECTION)
        .where('status', '==', 'new')
        .get();

    if (snapshot.empty) {
        console.log('✅ No candidates with status="new" found. Nothing to migrate.');
        return;
    }

    console.log(`📋 Found ${snapshot.size} candidate(s) to update.`);
    snapshot.docs.forEach(doc => {
        console.log(`  - ${doc.id}: ${doc.data().name || '(no name)'} | ${doc.data().email || ''}`);
    });

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { status: 'ai_analysis' });
    });

    await batch.commit();
    console.log(`✅ Successfully updated ${snapshot.size} candidate(s) from "new" → "ai_analysis".`);
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
