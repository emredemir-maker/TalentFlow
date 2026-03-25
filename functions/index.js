import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Export the API with common configurations for heavy processing.
// Firebase Hosting rewrites (/api/**) authenticate automatically via the
// Firebase Hosting service account, so invoker does not need to be set here.
export const api = onRequest({
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    cors: true,
}, app);
