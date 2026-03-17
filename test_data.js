import admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

async function run() {
    try {
        const snap = await db.collection('artifacts/talent-flow/public/data/candidates').get();
        console.log("Total candidates:", snap.size);
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`- ${data.name} (hasInterview: ${data.hasInterview})`);
            if (data.interviewSessions) {
                console.log(`  Sessions: ${JSON.stringify(data.interviewSessions)}`);
            }
        });
    } catch (err) {
        console.error("Error:", err);
    }
}
run();
