
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

async function checkRoot() {
    console.log("Checking ROOT 'positions'...");
    const snap = await getDocs(collection(db, "positions"));
    console.log(`Root 'positions' count: ${snap.size}`);
    snap.forEach(doc => {
        console.log(`- ID: ${doc.id}, Title: ${doc.data().title}`);
    });
}

checkRoot().catch(console.error);
