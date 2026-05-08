// Thin pass-throughs for the three Google APIs the SPA hits with the
// per-user OAuth access token (acquired via routes/auth.js). The token is
// supplied in the request body / query — the server does not look it up.
//
//   POST /api/google/send-email             — Gmail.send (text/plain only)
//   GET  /api/google/check-messages         — Gmail.list + Gmail.get for the
//                                              first match (used to confirm a
//                                              candidate replied to an info
//                                              request)
//   POST /api/google/create-calendar-event  — Calendar.events.insert with an
//                                              auto-generated Meet link
//
// These are not rate-limited at the Express layer because Google's own
// per-token quotas are the relevant ceiling; the global generalLimiter still
// applies as a defense-in-depth guard.
import { Router } from 'express';

const router = Router();

router.post('/api/google/send-email', async (req, res) => {
    const { token, to, subject, body } = req.body;
    if (!token || !to) return res.status(400).json({ success: false, error: 'Token and recipient are required.' });

    try {
        // Construct the RFC2822 message
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const str = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            '',
            body
        ].join('\r\n');

        const encodedMail = Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMail })
        });

        const data = await response.json();
        if (data.id) return res.json({ success: true, messageId: data.id });
        res.status(response.status).json({ success: false, error: data.error?.message || 'Gmail Send Error' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/api/google/check-messages', async (req, res) => {
    const { token, q } = req.query;
    if (!token || !q) return res.status(400).json({ success: false, error: 'Token and query are required.' });

    try {
        // 1. Search for messages
        const searchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const searchData = await searchResponse.json();

        if (!searchData.messages || searchData.messages.length === 0) {
            return res.json({ success: true, found: false });
        }

        // 2. Get the latest message content
        const msgId = searchData.messages[0].id;
        const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const msgData = await msgResponse.json();

        // Extract body (this is a bit simplified, but works for plain/html text)
        let body = "";
        if (msgData.payload.parts) {
            const part = msgData.payload.parts.find(p => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            if (part && part.body && part.body.data) {
                body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
        } else if (msgData.payload.body && msgData.payload.body.data) {
            body = Buffer.from(msgData.payload.body.data, 'base64').toString('utf-8');
        }

        const snippet = msgData.snippet;
        const fromHeader = msgData.payload.headers.find(h => h.name === 'From')?.value;
        const dateHeader = msgData.payload.headers.find(h => h.name === 'Date')?.value;

        res.json({
            success: true,
            found: true,
            message: {
                id: msgId,
                snippet,
                body,
                from: fromHeader,
                date: dateHeader
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/google/create-calendar-event', async (req, res) => {
    const { token, summary, description, startDateTime, endDateTime, location, guestEmail } = req.body;
    if (!token || !summary || !startDateTime) return res.status(400).json({ success: false, error: 'Missing parameters.' });

    try {
        const event = {
            summary,
            description,
            location,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
            attendees: guestEmail ? [{ email: guestEmail }] : [],
            conferenceData: {
                createRequest: {
                    requestId: `tf-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        const data = await response.json();
        if (data.id) return res.json({ success: true, eventId: data.id, htmlLink: data.htmlLink, meetLink: data.hangoutLink });
        res.status(response.status).json({ success: false, error: data.error?.message || 'Calendar Create Error' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
