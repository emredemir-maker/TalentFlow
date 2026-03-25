import { onRequest } from "firebase-functions/v2/https";
import app from "./server.js";

// Export the API with common configurations for heavy processing.
// invoker: "public" is required so Firebase Hosting rewrites (and direct
// calls) are allowed without an IAM authentication token.  Route-level
// auth is enforced by the requireAuth middleware inside server.js.
export const api = onRequest({
    region: "us-central1",
    memory: "2GiB",
    timeoutSeconds: 300,
    cors: true,
    invoker: "public",
}, app);
