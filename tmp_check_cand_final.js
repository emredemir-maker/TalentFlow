
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
    const p1 = "candidates";
    const p2 = "artifacts/talent-flow/public/data/candidates";
    const snap1 = await getDocs(collection(db, p1));
    const snap2 = await getDocs(collection(db, p2));
    console.log(`Root 'candidates': ${snap1.size}`);
    console.log(`Nested 'candidates': ${snap2.size}`);
}

check().catch(console.error);
