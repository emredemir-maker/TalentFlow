// test-firebase-connection.mjs
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// .env dosyasını oku
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

const getEnv = (key) => {
    const match = envContent.match(new RegExp(`${key}=(.*)`));
    return match ? match[1].trim() : null;
};

const firebaseConfig = {
    apiKey: getEnv('VITE_FIREBASE_API_KEY'),
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnv('VITE_FIREBASE_APP_ID')
};

console.log("🔥 Firebase Config Okundu:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFirestore() {
    console.log("📡 Firestore Bağlantısı Test Ediliyor...");

    try {
        // 1. Yazma Testi
        const docRef = await addDoc(collection(db, "test_collection"), {
            message: "Hello form Antigravity Test Script",
            timestamp: new Date()
        });
        console.log("✅ Yazma Başarılı! Doküman ID:", docRef.id);

        // 2. Okuma Testi
        const querySnapshot = await getDocs(collection(db, "test_collection"));
        console.log(`✅ Okuma Başarılı! Koleksiyonda ${querySnapshot.size} doküman var.`);

        // 3. Temizlik (Silme Testi)
        await deleteDoc(doc(db, "test_collection", docRef.id));
        console.log("✅ Silme Başarılı! Test verisi temizlendi.");

        console.log("\n🎉 Firebase Entegrasyonu Tamamen Çalışıyor!");

    } catch (e) {
        console.error("❌ Firebase Hatası:", e.message);
        if (e.message.includes("permission-denied")) {
            console.error("⚠️ İpucu: Firestore Kuralları 'Test Mode' değilse yazma izni olmayabilir.");
        }
    }
}

testFirestore();
