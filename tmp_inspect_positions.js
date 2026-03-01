
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

async function inspect() {
    const path = "artifacts/talent-flow/public/data/positions";
    const snap = await getDocs(collection(db, path));
    console.log(`Path: ${path}`);
    console.log(`Count: ${snap.size}`);
    snap.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}, Title: ${data.title}, Dept: ${data.department}, Status: ${data.status}`);
    });
}

inspect().catch(console.error);
