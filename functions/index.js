import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Environment variables are loaded from functions/.env.production at deploy time.
// Required vars: EMAIL_USER, EMAIL_PASS, VITE_GEMINI_API_KEY, VITE_FIREBASE_API_KEY
// See functions/.env.production.example for the template.
export const api = onRequest({
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    cors: true,
}, app);
