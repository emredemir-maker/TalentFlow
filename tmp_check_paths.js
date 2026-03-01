
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import dotenv from "dotenv";
dotenv.config();

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
    console.log("Checking ROOT 'positions' collection...");
    const q = collection(db, "positions");
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} documents in root 'positions'.`);

    if (snap.size > 0) {
        console.log("First doc sample:", snap.docs[0].id, snap.docs[0].data().title);
    }

    console.log("\nChecking nested 'artifacts/talent-flow/public/data/positions'...");
    const q2 = collection(db, "artifacts/talent-flow/public/data/positions");
    const snap2 = await getDocs(q2);
    console.log(`Found ${snap2.size} documents in nested path.`);
}

check().catch(console.error);
