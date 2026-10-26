import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Environment variables come from functions/.env, written by the deploy
// workflow (.github/workflows/firebase-deploy.yml) from GitHub secrets.
// Required vars: EMAIL_USER, EMAIL_PASS, GEMINI_API_KEY, VITE_FIREBASE_API_KEY,
// INTEGRATION_ENCRYPTION_KEY. See functions/.env.production.example.
//
// ── AD, BÖLGE, HESAP: paylaşılan proje (agentinn-nyqpx) ─────────────────────
// Proje Hub-Inn ve CX-Inn ile ortak. Hub-Inn'in `api` adlı fonksiyonu aynı
// bölgede (europe-west1) çalışıyor; aynı adla dağıtmak onun üzerine yazardı.
// Bu yüzden ad `talentflowApi` ve firebase.json'da kendi codebase'i
// (`talentflow`) var. Bölge Firestore'un (eur3) yanında.
// Ad ya da bölge değişirse firebase.json'daki /api/** yönlendirmesi de
// değişmeli (scripts/check-project-config.mjs bunu denetliyor).
//
// serviceAccount: fonksiyon projenin varsayılan hesabıyla (compute) DEĞİL,
// yalnızca TalentFlow'a yetecek rolleri olan kendi hesabıyla çalışıyor —
// varsayılan hesap Hub-Inn/CX-Inn gizli değerlerine erişebiliyor. Sondaki
// "@" ile CLI dağıtılan projenin alan adını ekliyor:
// talentflow-runtime@<proje>.iam.gserviceaccount.com. Hesabı ve rollerini
// scripts/setup-new-project.sh kuruyor; hesap yoksa dağıtım durur.
export const talentflowApi = onRequest({
    region: "europe-west1",
    serviceAccount: "talentflow-runtime@",
    memory: "2GiB",
    timeoutSeconds: 300,
    // v2 varsayılanı 80 eşzamanlı istek/instance: tek ağır istek (tam
    // koleksiyon okuması / toplu AI puanlama) diğer 79 isteğin de üzerinde
    // koştuğu instance'ı OOM ile düşürüyordu (502). Düşük eşzamanlılık +
    // instance tavanı: ağır istekler yayılır, bellek patlaması izole kalır.
    concurrency: 8,
    maxInstances: 5,
    cors: true,
}, app);
