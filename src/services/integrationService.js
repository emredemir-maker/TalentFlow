import { getAuth, GoogleAuthProvider, linkWithPopup, signInWithPopup } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const USERS_PATH = 'artifacts/talent-flow/public/data/users';

export const connectGoogleWorkspace = async (userId) => {
    try {
        const provider = new GoogleAuthProvider();

        // Add required scopes for Gmail (read/write/send) and Calendar
        provider.addScope('https://www.googleapis.com/auth/gmail.modify');
        provider.addScope('https://www.googleapis.com/auth/calendar.events');

        // Force consent screen to potentially get refresh tokens
        provider.setCustomParameters({
            prompt: 'consent',
            access_type: 'offline'
        });

        const auth = getAuth();
        let result;

        // Try linking to existing account first to keep them on the same Firebase user
        if (auth.currentUser) {
            // Some users might already be signed in via Google with basic scopes
            // To get new scopes, we must reauthenticate them or link them
            // In Firebase v9, linkWithPopup can throw if already linked with the same provider. 
            // Better to use signInWithPopup to 're-auth' with extra scopes if they are already a Google user,
            // OR use linkWithPopup if they logged in with Email. 
            // We can safely try linkWithPopup first.
            try {
                result = await linkWithPopup(auth.currentUser, provider);
            } catch (linkError) {
                if (linkError.code === 'auth/credential-already-in-use' || linkError.code === 'auth/provider-already-linked') {
                    // Already linked, so we just need to re-auth to request new scopes
                    result = await signInWithPopup(auth, provider);
                } else {
                    throw linkError;
                }
            }
        } else {
            // Shouldn't happen if they are on settings page, but fallback
            result = await signInWithPopup(auth, provider);
        }

        // Get the OAuth token from the result
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;

        if (!token) {
            throw new Error("Erişim belirteci (Access Token) alınamadı.");
        }

        // Save integration metadata to Firestore
        const userRef = doc(db, USERS_PATH, userId);
        await updateDoc(userRef, {
            'integrations.google': {
                connected: true,
                email: result.user.email,
                accessToken: token, // Note: Tokens should ideally be stored securely, but this acts as MVP for client-side usage
                connectedAt: new Date().toISOString()
            }
        });

        return { success: true, email: result.user.email };
    } catch (error) {
        console.error("Google Workspace Connection Error:", error);

        // Customize error message for Turkish users
        let errorMessage = error.message;
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = "Bağlantı penceresi kapatıldı.";
        }

        return { success: false, error: errorMessage };
    }
};

export const sendDirectEmail = async (userId, token, emailData) => {
    try {
        const { to, subject, body } = emailData;

        // Construct simple RFC822 message
        const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
        const messageParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'Content-Type: text/plain; charset="UTF-8"',
            'MIME-Version: 1.0',
            '',
            body
        ];
        const message = messageParts.join('\n');

        // Base64url encoding
        const encodedMessage = btoa(unescape(encodeURIComponent(message)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: encodedMessage })
        });

        const data = await response.json();
        if (!response.ok) {
            // Check for revoked tokens
            if (response.status === 401) throw new Error("Oturum süresi dolmuş veya yetki kaldırılmış. Lütfen tekrar bağlanın.");
            throw new Error(data.error?.message || 'E-posta gönderilemedi');
        }

        return { success: true, messageId: data.id };
    } catch (error) {
        console.error("Direct Email Error:", error);
        return { success: false, error: error.message };
    }
};

export const createDirectCalendarEvent = async (userId, token, eventData) => {
    try {
        const { summary, description, startDateTime, endDateTime, guestEmail } = eventData;

        const event = {
            summary,
            description,
            start: { dateTime: startDateTime },
            end: { dateTime: endDateTime },
            conferenceData: {
                createRequest: {
                    requestId: `tf-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' }
                }
            }
        };

        if (guestEmail) {
            event.attendees = [{ email: guestEmail }];
        }

        const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) throw new Error("Oturum süresi dolmuş. Lütfen tekrar bağlanın.");
            throw new Error(data.error?.message || 'Takvim etkinliği oluşturulamadı');
        }

        return {
            success: true,
            htmlLink: data.htmlLink,
            meetLink: data.conferenceData?.entryPoints?.[0]?.uri || data.htmlLink
        };
    } catch (error) {
        console.error("Direct Calendar Event Error:", error);
        return { success: false, error: error.message };
    }
};

export const checkGmailMessages = async (token, query) => {
    try {
        const searchResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!searchResponse.ok) {
            if (searchResponse.status === 401) throw new Error("Oturum süresi dolmuş. Lütfen tekrar bağlanın.");
            const errData = await searchResponse.json();
            throw new Error(errData.error?.message || 'Mail aranırken bir hata oluştu');
        }

        const searchData = await searchResponse.json();

        if (!searchData.messages || searchData.messages.length === 0) {
            return { success: true, found: false };
        }

        const msgId = searchData.messages[0].id;
        const msgResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!msgResponse.ok) {
            if (msgResponse.status === 401) throw new Error("Oturum süresi dolmuş. Lütfen tekrar bağlanın.");
            const errData = await msgResponse.json();
            throw new Error(errData.error?.message || 'Mail içeriği alınırken bir hata oluştu');
        }

        const msgData = await msgResponse.json();

        const decodeBase64 = (str) => {
            const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            try {
                return decodeURIComponent(escape(atob(base64)));
            } catch (e) {
                return atob(base64); // Fallback
            }
        };

        let body = "";
        if (msgData.payload.parts) {
            // Priority: text/plain
            const part = msgData.payload.parts.find(p => p.mimeType === 'text/plain') || msgData.payload.parts[0];
            if (part && part.body && part.body.data) {
                body = decodeBase64(part.body.data);
            }
        } else if (msgData.payload.body && msgData.payload.body.data) {
            body = decodeBase64(msgData.payload.body.data);
        }

        return {
            success: true,
            found: true,
            message: {
                id: msgId,
                snippet: msgData.snippet,
                body,
                from: msgData.payload.headers.find(h => h.name === 'From')?.value,
                date: msgData.payload.headers.find(h => h.name === 'Date')?.value
            }
        };
    } catch (error) {
        console.error("Direct Check Messages Error:", error);
        return { success: false, error: error.message };
    }
};
