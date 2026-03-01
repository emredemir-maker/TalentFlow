
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

const POSITIONS_COLLECTION = 'artifacts/talent-flow/public/data/positions';

async function diagnose() {
    console.log("Fetching positions from:", POSITIONS_COLLECTION);
    const snap = await getDocs(collection(db, POSITIONS_COLLECTION));
    console.log(`Found ${snap.size} documents.`);

    const positionsList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    console.log("Positions Sample:");
    positionsList.slice(0, 2).forEach(p => console.log(p));

    // Simulating PositionsPage.jsx logic
    // mock user profile
    const role = "super_admin"; // let's assume super_admin
    const isDepartmentUser = role === 'department_user';
    const userDepartments = [];
    const statusFilter = "all";

    let filtered = positionsList;
    if (isDepartmentUser && userDepartments?.length > 0) {
        filtered = filtered.filter(p => userDepartments.includes(p.department));
    }
    if (statusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === statusFilter);
    }

    console.log(`\nFiltered count (for super_admin): ${filtered.length}`);
}

diagnose().catch(console.error);
