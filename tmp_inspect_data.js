
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

async function inspectData() {
    console.log("--- Inspecting Positions ---");
    const posRef = collection(db, "artifacts/talent-flow/public/data/positions");
    const posSnap = await getDocs(query(posRef, limit(3)));
    posSnap.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });

    console.log("\n--- Inspecting Sources ---");
    const sourceRef = collection(db, "artifacts/talent-flow/public/data/sources");
    const sourceSnap = await getDocs(query(sourceRef, limit(3)));
    sourceSnap.forEach(doc => {
        console.log(`ID: ${doc.id}`);
        console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
}

inspectData().catch(console.error);
