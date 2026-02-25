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
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/google/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, token, ...emailData })
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
};

export const createDirectCalendarEvent = async (userId, token, eventData) => {
    try {
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/google/create-calendar-event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, token, ...eventData })
        });
        return await response.json();
    } catch (error) {
        return { success: false, error: error.message };
    }
};

