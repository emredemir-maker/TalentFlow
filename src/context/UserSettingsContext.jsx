// src/context/UserSettingsContext.jsx
// User Settings Context - Per-user settings from Firestore
// Path: /artifacts/talent-flow/users/{userId}/settings

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

const UserSettingsContext = createContext(null);

const DEFAULT_SETTINGS = {
    theme: 'dark',
    language: 'tr',
    notifications: true,
    dashboardLayout: 'grid',
    candidatesPerPage: 12,
    favoriteFilters: [],
    customPositions: []
};

export function UserSettingsProvider({ children }) {
    const { userId, isAuthenticated, loading: authLoading } = useAuth();
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || !isAuthenticated || !userId) {
            // Load theme from localStorage as fallback even if not logged in
            const localTheme = localStorage.getItem('tf_theme');
            if (localTheme) {
                setSettings(prev => ({ ...prev, theme: localTheme }));
            }
            return;
        }

        // Firestore path corrected: /artifacts/talent-flow/public/data/users/{userId}/settings/preferences
        const settingsPath = `artifacts/talent-flow/public/data/users/${userId}/settings`;
        const settingsDocRef = doc(db, settingsPath, 'preferences');

        const unsubscribe = onSnapshot(
            settingsDocRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    setSettings({ ...DEFAULT_SETTINGS, ...data });
                    if (data.theme) {
                        localStorage.setItem('tf_theme', data.theme);
                    }
                } else {
                    // Initialize default settings for new user
                    setDoc(settingsDocRef, DEFAULT_SETTINGS).catch(console.error);
                    setSettings(DEFAULT_SETTINGS);
                }
                setLoading(false);
            },
            (err) => {
                console.warn('[TalentFlow] Settings snapshot error (possibly permission):', err);
                const localTheme = localStorage.getItem('tf_theme');
                if (localTheme) {
                    setSettings(prev => ({ ...prev, theme: localTheme }));
                }
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [userId, isAuthenticated, authLoading]);

    const updateSettings = useCallback(
        async (updates) => {
            // Optimistic update
            setSettings(prev => {
                const newSettings = { ...prev, ...updates };
                if (updates.theme) {
                    localStorage.setItem('tf_theme', updates.theme);
                }
                return newSettings;
            });

            if (!userId) return;
            const settingsDocRef = doc(db, `artifacts/talent-flow/public/data/users/${userId}/settings`, 'preferences');
            try {
                await updateDoc(settingsDocRef, updates);
            } catch (err) {
                console.error("Firestore updateSettings error:", err);
                try {
                    await setDoc(settingsDocRef, { ...settings, ...updates }, { merge: true });
                } catch (innerErr) {
                    console.error("Firestore setDoc settings error:", innerErr);
                }
            }
        },
        [userId, settings]
    );

    const saveCustomPosition = useCallback(
        async (position) => {
            const newCustomPositions = [...(settings.customPositions || []), position];
            await updateSettings({ customPositions: newCustomPositions });
        },
        [settings.customPositions, updateSettings]
    );

    const value = {
        settings,
        loading,
        updateSettings,
        saveCustomPosition
    };

    return (
        <UserSettingsContext.Provider value={value}>
            {children}
        </UserSettingsContext.Provider>
    );
}

export function useUserSettings() {
    const context = useContext(UserSettingsContext);
    if (!context) {
        throw new Error('useUserSettings must be used within a UserSettingsProvider');
    }
    return context;
}

export default UserSettingsContext;
