import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Environment variables are loaded from functions/.env.production at deploy time.
// Required vars: EMAIL_USER, EMAIL_PASS, VITE_GEMINI_API_KEY, VITE_FIREBASE_API_KEY
// See functions/.env.production.example for the template.
export const api = onRequest({
    region: "us-central1",
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
