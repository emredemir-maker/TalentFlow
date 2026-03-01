
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, listCollections } from "firebase/firestore";
// Note: listCollections is only available in server-side SDK. 
// In client SDK we can't easily list root collections without trial/error or search.
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
    const rootColls = ["positions", "candidates", "users", "artifacts", "sources"];
    for (const coll of rootColls) {
        const snap = await getDocs(collection(db, coll));
        console.log(`Root '${coll}': ${snap.size} docs`);
    }

    // Check the specific nested path segments
    const nested = "artifacts/talent-flow/public/data/positions";
    const snapN = await getDocs(collection(db, nested));
    console.log(`Nested '${nested}': ${snapN.size} docs`);

    const nestedS = "artifacts/talent-flow/public/data/sources";
    const snapS = await getDocs(collection(db, nestedS));
    console.log(`Nested '${nestedS}': ${snapS.size} docs`);
}

check().catch(console.error);
