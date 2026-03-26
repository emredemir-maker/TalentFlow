import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Secret names must match keys set via:
//   firebase functions:secrets:set EMAIL_USER
//   firebase functions:secrets:set EMAIL_PASS
//   firebase functions:secrets:set VITE_GEMINI_API_KEY
//   firebase functions:secrets:set VITE_FIREBASE_API_KEY
const SECRETS = [
    'EMAIL_USER',
    'EMAIL_PASS',
    'VITE_GEMINI_API_KEY',
    'VITE_FIREBASE_API_KEY',
];

// Export the API with common configurations for heavy processing.
// Firebase Hosting rewrites (/api/**) authenticate automatically via the
// Firebase Hosting service account, so invoker does not need to be set here.
export const api = onRequest({
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    cors: true,
    secrets: SECRETS,
}, app);
