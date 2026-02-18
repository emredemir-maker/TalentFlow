// src/context/AuthContext.jsx
// Authentication Context - Rule 3 Compliance
// Waits for signInAnonymously before allowing any operations
// Uses onAuthStateChanged to bind user session to global state

import { createContext, useContext, useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Listen for auth state changes (Rule 3)
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setLoading(false);
                setError(null);
            } else {
                // No user signed in, attempt anonymous sign-in
                signInAnonymously(auth)
                    .then((userCredential) => {
                        // onAuthStateChanged will fire again with the new user
                        console.log('[TalentFlow] Anonymous auth successful:', userCredential.user.uid);
                    })
                    .catch((err) => {
                        console.error('[TalentFlow] Anonymous auth failed:', err);
                        setError(err.message);
                        setLoading(false);
                    });
            }
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    const value = {
        user,
        userId: user?.uid || null,
        isAuthenticated: !!user,
        isAnonymous: user?.isAnonymous || false,
        loading,
        error,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
