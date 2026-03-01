
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
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

async function migrate(from, to) {
    console.log(`Migrating ${from} -> ${to}...`);
    const snap = await getDocs(collection(db, from));
    console.log(`Found ${snap.size} docs in ${from}.`);

    for (const d of snap.docs) {
        const data = d.data();
        await setDoc(doc(db, to, d.id), data);
        console.log(`  Moved ${d.id}`);
        // await deleteDoc(doc(db, from, d.id)); // Keeping originals for safety for now
    }
}

async function run() {
    await migrate("positions", "artifacts/talent-flow/public/data/positions");
    await migrate("candidates", "artifacts/talent-flow/public/data/candidates");
    console.log("Migration complete. Check the app now.");
}

run().catch(console.error);
