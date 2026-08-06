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

export async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Kimlik doğrulama gereklidir.' });
    try {
        // Admin SDK imza + audience doğrular ve token içeriğini çözümler.
        // Eski Identity Toolkit REST kontrolü tokenı yalnızca doğruluyor,
        // uid'yi ÇIKARMIYORDU — bu yüzden /api/auth/* uçları userId'yi
        // istemcinin gönderdiği değerden almak zorunda kalıyordu (IDOR).
        const decoded = await admin.auth().verifyIdToken(token);
        req.firebaseToken = token;
        req.authUser = {
            uid: decoded.uid,
            provider: decoded.firebase?.sign_in_provider || '',
            email: decoded.email || '',
        };
        return next();
    } catch {
        return res.status(401).json({ error: 'Geçersiz kimlik bilgileri.' });
    }
}

// Anonim oturumları reddeden ek katman — verifyFirebaseToken'dan SONRA
// kullanılır. Kullanıcı hesabına veri yazan uçlar (OAuth token persist)
// public sayfaların otomatik anon oturumlarıyla çağrılamamalıdır.
export function rejectAnonymous(req, res, next) {
    if (!req.authUser || req.authUser.provider === 'anonymous') {
        return res.status(403).json({ error: 'Bu işlem için hesapla giriş yapılmalıdır.' });
    }
    return next();
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
