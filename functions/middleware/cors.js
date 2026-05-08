// CORS configuration — explicit allow-list of localhost dev URLs and the
// VITE_APP_URL / APP_URL env values, plus Replit dynamic preview domains
// and Firebase Hosting subdomains.
//
// Usage:
//   import { corsMiddleware } from './middleware/cors.js';
//   app.use(corsMiddleware);
import cors from 'cors';

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5000',
    'http://localhost:3000',
    process.env.VITE_APP_URL,
    process.env.APP_URL
].filter(Boolean);

export const isAllowedOrigin = (origin) => {
    if (!origin) return true; // curl / mobile / server-to-server
    if (allowedOrigins.includes(origin)) return true;
    if (/^https:\/\/.*\.replit\.dev$/.test(origin)) return true;
    if (/^https:\/\/.*\.replit\.app$/.test(origin)) return true;
    if (/^https:\/\/.*\.pike\.replit\.dev$/.test(origin)) return true;
    if (/^https:\/\/.*\.web\.app$/.test(origin)) return true;
    if (/^https:\/\/.*\.firebaseapp\.com$/.test(origin)) return true;
    return false;
};

export const corsMiddleware = cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            console.warn(`🛑 Blocked CORS request from: ${origin}`);
            callback(new Error('CORS Policy: Not allowed origin'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
});
