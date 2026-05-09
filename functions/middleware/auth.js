// Authentication / authorization middleware.
//
// Two complementary middlewares live here:
//
//   verifyFirebaseToken — validates a Firebase ID token via the Identity
//   Toolkit REST API. This is the lighter check used on candidate-facing
//   email endpoints where any signed-in user is acceptable. It does NOT
//   inspect role; for role-gated routes use requireAuth() below.
//
//   requireAuth(roles?) — verifies the ID token via the Admin SDK and then
//   reads the user's role from Firestore (artifacts/talent-flow/public/
//   data/users/{uid}) and enforces a role allow-list. Returns an Express
//   middleware so callers can curry the role list at registration time:
//
//     app.get('/api/admin/foo', requireAuth(['super_admin']), handler)
//     app.get('/api/users',     requireAuth(),                handler)
//
//   The no-arg form accepts any of the three default roles (super_admin,
//   recruiter, department_user).
import { db, admin } from '../config/firebaseAdmin.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('auth-mw');

export async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Kimlik doğrulama gereklidir.' });
    const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
        log.error('[verifyFirebaseToken] Firebase API key not configured — rejecting request.');
        return res.status(500).json({ error: 'Sunucu yapılandırma hatası.' });
    }
    try {
        const resp = await fetch(
            `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key=${apiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) }
        );
        if (!resp.ok) return res.status(401).json({ error: 'Geçersiz kimlik bilgileri.' });
        req.firebaseToken = token;
        return next();
    } catch {
        return res.status(401).json({ error: 'Kimlik doğrulama başarısız.' });
    }
}

export const ALLOWED_ROLES = ['super_admin', 'recruiter', 'department_user'];

export const requireAuth = (allowedRoles = ALLOWED_ROLES) => async (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing Authorization header.' });
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        // Fetch role from Firestore — JWT custom claims may not carry role
        const userDoc = await db.doc(`artifacts/talent-flow/public/data/users/${decoded.uid}`).get();
        if (!userDoc.exists) {
            return res.status(403).json({ error: 'User profile not found.' });
        }
        const role = userDoc.data().role || '';
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({ error: 'Insufficient permissions.' });
        }
        req.user = { uid: decoded.uid, role };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
};
