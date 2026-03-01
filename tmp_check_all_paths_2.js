
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
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
    const paths = [
        "candidates",
        "artifacts/talent-flow/public/data/candidates",
        "sources",
        "artifacts/talent-flow/public/data/sources"
    ];
    for (const p of paths) {
        const snap = await getDocs(collection(db, p));
        console.log(`${p}: ${snap.size} docs`);
    }
}

check().catch(console.error);
