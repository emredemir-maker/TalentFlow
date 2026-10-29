// Internal user-directory endpoints used by the interview wizard.
//
//   GET  /api/users                — şirketin etkin üyeleri (admin /
//                                     recruiter / department_user) — sihirbazın
//                                     ihtiyaç duyduğu asgari alanlarla. Başka
//                                     şirketin kullanıcısı listelenmez.
//   POST /api/users/availability   — Google Calendar free/busy probe across
//                                     a list of tenant members for a single
//                                     1-hour slot. Returns 'available',
//                                     'busy', or 'unknown' per user.
//
// İkisi de requireTenant() arkasında: yalnız bu şirketin üyeleri görünür;
// müsaitlikte de yalnız bu şirketin üyesi olan uid'ler sorgulanır.
import { Router } from 'express';

import { requireTenant } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';
import { tokenStore } from '../services/integrationTokenStore.js';
import { childLogger } from '../services/logger.js';
const log = childLogger('users');

// Destek üyeliği (K11) katılımcı değil; listede görünmez.
const PARTICIPANT_ROLES = ['admin', 'recruiter', 'department_user'];

// Helper: convert a local date+time string to a UTC Date using the client's
// IANA timezone. Used by /availability so the Free/Busy window aligns with
// the recruiter's wall-clock intent rather than the server's TZ.
const localToUTC = (dateStr, timeStr, timezone) => {
    const naiveUTC = new Date(`${dateStr}T${timeStr}:00Z`);
    if (!timezone) return naiveUTC;
    try {
        const fmt = new Intl.DateTimeFormat('sv', {
            timeZone: timezone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const localStr = fmt.format(naiveUTC).replace(' ', 'T');
        const localAsUTC = new Date(localStr + 'Z');
        const offsetMs = localAsUTC.getTime() - naiveUTC.getTime();
        return new Date(naiveUTC.getTime() - offsetMs);
    } catch (e) {
        return naiveUTC;
    }
};

const router = Router();

router.get('/api/users', requireTenant(), async (req, res) => {
    try {
        const snap = await db.collection(req.paths.members()).where('status', '==', 'active').get();
        const users = [];
        snap.forEach(d => {
            const data = d.data();
            const role = data.role || '';
            if (!PARTICIPANT_ROLES.includes(role)) return; // destek ve bilinmeyen roller
            users.push({
                id: d.id,
                name: data.name || data.displayName || data.email || 'Kullanıcı',
                email: data.email || null,
                role,
                googleConnected: Boolean(data.integrations?.google?.connected),
            });
        });
        res.json({ users });
    } catch (err) {
        log.error({ err: err }, '[API /api/users] Error');
        res.status(500).json({ error: 'Kullanıcılar okunamadı.' });
    }
});

router.post('/api/users/availability', requireTenant(undefined, { write: false }), async (req, res) => {
    const { userIds, date, time, timezone } = req.body;
    if (!Array.isArray(userIds) || !date || !time) {
        return res.status(400).json({ error: 'userIds[], date, and time are required.' });
    }
    if (userIds.length > 50 || userIds.some((u) => typeof u !== 'string')) {
        return res.status(400).json({ error: 'Geçersiz kullanıcı listesi.' });
    }
    const slotStartDate = localToUTC(date, time, timezone);
    if (isNaN(slotStartDate.getTime())) return res.status(400).json({ error: 'Invalid date/time format.' });
    const slotStart = slotStartDate.toISOString();
    const slotEnd = new Date(slotStartDate.getTime() + 60 * 60 * 1000).toISOString();

    const results = {};
    await Promise.all(userIds.map(async (uid) => {
        try {
            // Yalnız bu şirketin etkin üyesi: başka şirketteki kişinin takvimi
            // (o şirkette bağladığı jetonla bile) buradan sorgulanamaz.
            const userDoc = await db.doc(req.paths.member(uid)).get();
            if (!userDoc.exists || userDoc.data()?.status !== 'active') { results[uid] = 'unknown'; return; }
            if (!userDoc.data()?.integrations?.google?.connected) { results[uid] = 'unknown'; return; }
            // Jeton şifreli depodan çözülür (gerekirse yenilenir); bağlantı
            // yenilenmeliyse getAccessToken fırlatır → 'unknown'.
            const accessToken = await tokenStore.getAccessToken(req.tenant.id, uid, 'google');
            const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeMin: slotStart, timeMax: slotEnd, items: [{ id: 'primary' }] })
            });
            if (!resp.ok) { results[uid] = 'unknown'; return; }
            const fbData = await resp.json();
            const busy = fbData.calendars?.primary?.busy || [];
            results[uid] = busy.length > 0 ? 'busy' : 'available';
        } catch (err) {
            log.warn({ err: err.message }, `[Availability] uid=${uid}`);
            results[uid] = 'unknown';
        }
    }));
    res.json({ availability: results });
});

export default router;
