
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
    const usersPath = "artifacts/talent-flow/public/data/users";
    const snap = await getDocs(collection(db, usersPath));
    console.log(`Nested 'users': ${snap.size} docs`);

    const snapR = await getDocs(collection(db, "users"));
    console.log(`Root 'users': ${snapR.size} docs`);
}

check().catch(console.error);
