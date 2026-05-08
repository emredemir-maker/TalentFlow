// Internal user-directory endpoints used by the interview wizard.
//
//   GET  /api/users                — list participant-eligible accounts
//                                     (recruiter / department_user /
//                                      super_admin) with the bare-minimum
//                                     fields the wizard needs.
//   POST /api/users/availability   — Google Calendar free/busy probe across
//                                     a list of platform users for a single
//                                     1-hour slot. Returns 'available',
//                                     'busy', or 'unknown' per user.
//
// Both gated by requireAuth() (any of the three default roles) so candidates
// and unauth'd traffic can't enumerate platform users.
import { Router } from 'express';

import { requireAuth } from '../middleware/auth.js';
import { db } from '../config/firebaseAdmin.js';

const PARTICIPANT_ROLES = ['super_admin', 'recruiter', 'department_user'];

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

router.get('/api/users', requireAuth(), async (req, res) => {
    try {
        const snap = await db.collection('artifacts/talent-flow/public/data/users').get();
        const users = [];
        snap.forEach(d => {
            const data = d.data();
            const role = data.role || '';
            if (!PARTICIPANT_ROLES.includes(role)) return; // skip candidates and unknown roles
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
        console.error('[API /api/users] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/api/users/availability', requireAuth(), async (req, res) => {
    const { userIds, date, time, timezone } = req.body;
    if (!Array.isArray(userIds) || !date || !time) {
        return res.status(400).json({ error: 'userIds[], date, and time are required.' });
    }
    const slotStartDate = localToUTC(date, time, timezone);
    if (isNaN(slotStartDate.getTime())) return res.status(400).json({ error: 'Invalid date/time format.' });
    const slotStart = slotStartDate.toISOString();
    const slotEnd = new Date(slotStartDate.getTime() + 60 * 60 * 1000).toISOString();

    const results = {};
    await Promise.all(userIds.map(async (uid) => {
        try {
            const userDoc = await db.doc(`artifacts/talent-flow/public/data/users/${uid}`).get();
            if (!userDoc.exists) { results[uid] = 'unknown'; return; }
            const googleIntegration = userDoc.data()?.integrations?.google;
            if (!googleIntegration?.connected || !googleIntegration?.accessToken) { results[uid] = 'unknown'; return; }
            const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${googleIntegration.accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeMin: slotStart, timeMax: slotEnd, items: [{ id: 'primary' }] })
            });
            if (!resp.ok) { results[uid] = 'unknown'; return; }
            const fbData = await resp.json();
            const busy = fbData.calendars?.primary?.busy || [];
            results[uid] = busy.length > 0 ? 'busy' : 'available';
        } catch (err) {
            console.warn(`[Availability] uid=${uid}:`, err.message);
            results[uid] = 'unknown';
        }
    }));
    res.json({ availability: results });
});

export default router;
