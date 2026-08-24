// src/config/firebase.js
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured =
  !!firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'your_api_key' &&
  !!firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'your_project_id';

let app = null;
let db = null;
let auth = null;
let storage = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);

    // ── YEREL ÖNBELLEK (KALICI) ─────────────────────────────────────────
    //
    // NEDEN: Varsayılan Firestore önbelleği YALNIZCA BELLEKTE tutulur.
    // Sekme her yenilendiğinde aday koleksiyonunun TAMAMI —her adayın CV
    // metni, pozisyon analizleri, mülakat oturumları dahil— ağdan yeniden
    // indiriliyordu. Ekranların "önce boş açılıp bir süre sonra dolması",
    // sayfa geçişlerindeki bekleme ve "aday detayı bazen hiç yüklenmiyor"
    // şikâyetinin ortak sebebi buydu: ilk çizim, koleksiyonun tamamı
    // inene kadar bekliyor.
    //
    // Kalıcı önbellek açıldığında `onSnapshot` önce IndexedDB'den ANINDA
    // sonuç verir, sunucuyla farkı arka planda senkronize eder. İkinci
    // açılıştan itibaren ekran doluyken gelir.
    //
    // VERİ VE HESAP DEĞİŞMİYOR: aynı belgeler, aynı alanlar, aynı sıralama.
    // Değişen tek şey belgelerin NEREDEN okunduğu. Sunucudan gelen her
    // güncelleme yine aynı dinleyiciyi tetikler.
    //
    // `persistentMultipleTabManager`: kullanıcılar uygulamayı birden fazla
    // sekmede açıyor. Tek sekme yöneticisiyle ikinci sekme önbelleği
    // alamaz ve sessizce belleğe düşerdi.
    //
    // Gizli sekme / eski tarayıcı gibi IndexedDB'nin açılamadığı
    // durumlarda kurulum hata verir; o zaman eski davranışa (bellek
    // önbelleği) düşülür — uygulama çalışmaya devam eder.
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (cacheErr) {
      console.warn('[Firebase] Kalıcı önbellek açılamadı, bellek önbelleğine düşülüyor:', cacheErr?.message);
      db = getFirestore(app);
    }
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    storage = getStorage(app);

    // Local emulator wiring. Off in production builds because the env
    // var isn't set there; on for the dedicated test build (see
    // .env.e2e-emulator + playwright.config.emulator.js). Both calls
    // must run BEFORE any auth/firestore call, so we do them here at
    // module load. The disableWarnings flag keeps the test logs clean
    // — the SDK otherwise prints a banner about insecure connections.
    if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      console.info('[Firebase] Connected to local emulators (auth:9099, firestore:8080)');
    }
  } catch (err) {
    console.error('[Firebase] Initialization failed:', err);
  }
} else {
  console.warn('[Firebase] Not configured — set VITE_FIREBASE_* environment variables to enable.');
}

export { db, auth, googleProvider, storage };
export default app;
