// server.js — bootstrap.
//
// All concrete logic now lives in config/, middleware/, services/, and
// routes/. This file's only job is to wire those pieces together, set up
// the express app, expose static /uploads, kick off the bulk-import worker,
// and (in local dev) listen on PORT.
//
// Cloud Functions wraps this file via functions/index.js, which imports
// the default export (`app`) and hands it to onRequest().
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Side-effectful imports for one-time bootstrapping. The Firebase Admin SDK
// initializes itself when config/firebaseAdmin.js is loaded; integrations.js
// schedules its 3-second deferred Firestore fetch in the same way.
import './config/firebaseAdmin.js';
import './config/integrations.js';

// Middleware
import { generalLimiter } from './middleware/rateLimit.js';
import { corsMiddleware } from './middleware/cors.js';
import { helmetMiddleware, hppMiddleware } from './middleware/security.js';

// Routes — one Express Router per functional area, each owning the absolute
// /api/... paths it serves.
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import screeningRoutes from './routes/screening.js';
import scrapeRoutes from './routes/scrape.js';
import cvRoutes from './routes/cv.js';
import interviewRoutes from './routes/interview.js';
import authRoutes from './routes/auth.js';
import googleRoutes from './routes/google.js';
import adminRoutes from './routes/admin.js';
import emailRoutes, { cleanupOldFiles } from './routes/email.js';
import positionsRoutes from './routes/positions.js';
import usersRoutes from './routes/users.js';
import { createBulkRouter } from './routes/bulk.js';

// Bulk-import worker — long-running poller that drains the
// bulkImportJobs queue. Started below via setImmediate.
import {
    recoverStaleJobs,
    runBulkWorkerLoop,
} from './services/bulkWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload base dir for static /uploads serving and the bulk-import worker.
// Cloud Functions / serverless can only write to /tmp; locally we use the
// functions/ dir so files survive hot reloads.
const isServerless = !!process.env.K_SERVICE || !!process.env.FUNCTION_NAME || !!process.env.FUNCTIONS_EMULATOR;
const uploadBaseDir = isServerless ? '/tmp' : __dirname;

const app = express();

// --- Security & infra middleware chain ---
// (helmet+CSP, hpp, trust-proxy, cors, json body parser, global rate limit)
// All concrete configuration lives in middleware/{security,cors,rateLimit}.js.
app.use(helmetMiddleware);
app.use(hppMiddleware);

// Trust the first reverse-proxy hop (Cloud Functions / Replit ingress sets
// X-Forwarded-For). Without this, express-rate-limit keys on the proxy IP
// instead of the real client IP, which both breaks throttling and blocks
// legitimate users en masse during an attack.
app.set('trust proxy', 1);

app.use(corsMiddleware);
app.use(express.json({ limit: '5mb' }));
app.use(generalLimiter);

// Serve static files from uploads directory (CV downloads, etc.)
app.use('/uploads', express.static(path.join(uploadBaseDir, 'uploads')));

// ── Mount all route modules ───────────────────────────────────────────────
// Every router declares absolute /api/... paths inside, so app.use(router)
// without a prefix is intentional.
app.use(healthRoutes);
app.use(aiRoutes);
app.use(screeningRoutes);
app.use(scrapeRoutes);
app.use(cvRoutes);
app.use(interviewRoutes);
app.use(authRoutes);
app.use(googleRoutes);
app.use(adminRoutes);
app.use(emailRoutes);
app.use(positionsRoutes);
app.use(usersRoutes);
// bulk needs the on-disk uploads root, so it's a factory not a default export.
app.use(createBulkRouter(uploadBaseDir));

// ── Start bulk worker in BOTH runtime modes (local server main OR the
// Firebase Functions runtime that imports this module). setImmediate lets
// the module finish loading before the first poll attempt; the 3s setTimeout
// gives integration configs time to load from Firestore first.
setImmediate(() => {
    setTimeout(async () => {
        await recoverStaleJobs();
        runBulkWorkerLoop().catch(err => console.error('[bulk-import] Worker loop fatal:', err));
    }, 3000);
});

// Only listen if this is the main module — Firebase Functions imports the
// default export and provides its own listener.
const PORT = process.env.PORT || 3001;
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
        console.log(`📡 Health: http://localhost:${PORT}/api/health`);
        cleanupOldFiles(uploadBaseDir);
    });
}

export default app;
