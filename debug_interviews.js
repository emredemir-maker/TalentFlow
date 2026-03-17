import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

async function checkInterviews() {
    const snap = await db.collection('artifacts/talent-flow/public/data/candidates').get();
    const candidates = snap.docs.map(d => ({id: d.id, ...d.data()}));
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    console.log("Today Str:", todayStr);
    
    candidates.forEach(c => {
        if (c.hasInterview) {
            console.log(`Candidate: ${c.name} (hasInterview: true)`);
            if (c.interviewSessions && Array.isArray(c.interviewSessions)) {
                c.interviewSessions.forEach(s => {
                    console.log(`  - Session: ${s.date} ${s.time} [${s.status}]`);
                });
            } else {
                console.log(`  - NO SESSIONS ARRAY`);
            }
        }
    });
}

checkInterviews();
