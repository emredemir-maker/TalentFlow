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

        // Request offline token but don't force consent screen if already granted
        provider.setCustomParameters({
            access_type: 'offline',
            include_granted_scopes: 'true'
        });

        const auth = getAuth();
        const result = await signInWithPopup(auth, provider);

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

export const disconnectGoogleWorkspace = async (userId) => {
    try {
        const userRef = doc(db, USERS_PATH, userId);
        await updateDoc(userRef, {
            'integrations.google': {
                connected: false,
                disconnectedAt: new Date().toISOString()
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Google Workspace Disconnect Error:", error);
        return { success: false, error: error.message };
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
            if (response.status === 401) throw new Error("Oturum süresi dolmuş veya yetki kaldırılmış. Lütfen Google bağlantısını yenileyin.");
            if (response.status === 403) throw new Error("Erişim yetkisi yetersiz (403). Lütfen Google hesabınızı tekrar bağlayıp tüm izinleri onaylayın.");
            throw new Error(data.error?.message || `E-posta gönderilemedi (${response.status})`);
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
            if (response.status === 401) throw new Error("Oturum süresi dolmuş veya yetki kaldırılmış. Lütfen Google bağlantısını yenileyin.");
            if (response.status === 403) throw new Error("Takvime erişim yetkisi yetersiz (403). Lütfen Google hesabınızı tekrar bağlayıp tüm izinleri onaylayın.");
            throw new Error(data.error?.message || `Takvim etkinliği oluşturulamadı (${response.status})`);
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
            if (searchResponse.status === 401) throw new Error("Oturum süresi dolmuş veya yetki kaldırılmış. Lütfen Google bağlantısını yenileyin.");
            if (searchResponse.status === 403) throw new Error("Maillerinizi okuma yetkisi yetersiz (403). Lütfen Google hesabınızı tekrar bağlayıp tüm izinleri onaylayın.");
            const errData = await searchResponse.json();
            throw new Error(errData.error?.message || `Mail aranırken bir hata oluştu (${searchResponse.status})`);
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
