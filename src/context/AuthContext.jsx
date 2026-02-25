// src/context/AuthContext.jsx
// Authentication Context - Rule 3 Compliance
// Uses onAuthStateChanged to bind user session to global state

import { createContext, useContext, useState, useEffect } from 'react';
import {
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updateProfile
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp,
    updateDoc,
    onSnapshot
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../config/firebase';

const AuthContext = createContext(null);

const USERS_PATH = 'artifacts/talent-flow/public/data/users';
const INVITATIONS_PATH = 'artifacts/talent-flow/public/data/invitations';

// List of emails that get super_admin status automatically on their first login
const INITIAL_SUPER_ADMINS = ['emre.demir@infoset.app'];

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null); // { role, status, etc }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let unsubscribeProfile = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);

                // Set up real-time listener for the user profile
                const userDocRef = doc(db, USERS_PATH, currentUser.uid);

                unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const profileData = docSnap.data();
                        if (profileData.status === 'disabled') {
                            signOut(auth);
                            setError('Hesabınız dondurulmuştur. Lütfen sistem yöneticisi ile iletişime geçin.');
                            setUser(null);
                            setUserProfile(null);
                            return;
                        }
                        setUserProfile(profileData);
                    } else {
                        // Profile doesn't exist yet, handle initial creation logic if needed
                        // (Keeping the logic from the previous implementation but making it more robust)
                        handleInitialProfile(currentUser);
                    }
                    setLoading(false);
                }, (err) => {
                    console.error("Profile Listener Error:", err);
                    setLoading(false);
                });
            } else {
                setUser(null);
                setUserProfile(null);
                if (unsubscribeProfile) unsubscribeProfile();
                setLoading(false);
            }
        });

        async function handleInitialProfile(currentUser) {
            try {
                const emailLower = currentUser.email.toLowerCase();
                const isPrimaryAdmin = INITIAL_SUPER_ADMINS.includes(emailLower);
                const allUsersSnap = await getDocs(query(collection(db, USERS_PATH)));
                const isFirstUser = allUsersSnap.empty;

                if (isPrimaryAdmin || isFirstUser) {
                    const firstProfile = {
                        uid: currentUser.uid,
                        email: emailLower,
                        displayName: currentUser.displayName || emailLower.split('@')[0],
                        photoURL: currentUser.photoURL || '',
                        role: 'super_admin',
                        status: 'active',
                        createdAt: serverTimestamp()
                    };
                    await setDoc(doc(db, USERS_PATH, currentUser.uid), firstProfile);
                } else {
                    const q = query(collection(db, INVITATIONS_PATH),
                        where("email", "==", emailLower),
                        where("status", "==", "pending")
                    );
                    const inviteSnap = await getDocs(q);

                    if (!inviteSnap.empty) {
                        const inviteDoc = inviteSnap.docs[0];
                        const invitation = inviteDoc.data();
                        const newProfile = {
                            uid: currentUser.uid,
                            email: emailLower,
                            displayName: currentUser.displayName || emailLower.split('@')[0],
                            photoURL: currentUser.photoURL || '',
                            role: invitation.role || 'recruiter',
                            status: 'active',
                            createdAt: serverTimestamp()
                        };
                        await setDoc(doc(db, USERS_PATH, currentUser.uid), newProfile);
                        await updateDoc(doc(db, INVITATIONS_PATH, inviteDoc.id), {
                            status: 'accepted',
                            acceptedAt: serverTimestamp()
                        });
                    } else {
                        await signOut(auth);
                        setError('Erişim yetkiniz bulunmuyor.');
                    }
                }
            } catch (err) {
                console.error("Initial Profile Creation Error:", err);
            }
        }

        return () => {
            unsubscribeAuth();
            if (unsubscribeProfile) unsubscribeProfile();
        };
    }, []);

    const loginWithGoogle = async () => {
        setLoading(true);
        setError(null);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const loginWithEmail = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            let msg = "Giriş yapılamadı.";
            if (err.code === 'auth/user-not-found') msg = "Kullanıcı bulunamadı.";
            if (err.code === 'auth/wrong-password') msg = "Hatalı şifre.";
            setError(msg);
            setLoading(false);
            throw err;
        }
    };

    const registerWithEmail = async (email, password, name) => {
        setLoading(true);
        setError(null);
        try {
            // 1. Check if invitation exists OR is primary admin OR DB is empty
            const isPrimaryAdmin = INITIAL_SUPER_ADMINS.includes(email.toLowerCase());
            const allUsersSnap = await getDocs(query(collection(db, USERS_PATH)));
            const isFirstUser = allUsersSnap.empty;

            const q = query(collection(db, INVITATIONS_PATH),
                where("email", "==", email.toLowerCase()),
                where("status", "==", "pending")
            );
            const inviteSnap = await getDocs(q);

            if (inviteSnap.empty && !isPrimaryAdmin && !isFirstUser) {
                throw new Error("Geçerli bir davetiyeniz bulunmuyor.");
            }

            const inviteDoc = !inviteSnap.empty ? inviteSnap.docs[0] : null;
            const invitation = inviteDoc ? inviteDoc.data() : null;

            // 2. Create Auth User
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const newUser = userCredential.user;

            // 3. Set Display Name
            await updateProfile(newUser, { displayName: name });

            // 4. Create User Profile
            const profile = {
                uid: newUser.uid,
                email: newUser.email,
                displayName: name,
                photoURL: '',
                role: (isPrimaryAdmin || isFirstUser) ? 'super_admin' : (invitation?.role || 'recruiter'),
                status: 'active',
                createdAt: serverTimestamp()
            };
            await setDoc(doc(db, USERS_PATH, newUser.uid), profile);

            // 5. Mark invitation as accepted (if it existed)
            if (inviteDoc) {
                await updateDoc(doc(db, INVITATIONS_PATH, inviteDoc.id), {
                    status: 'accepted',
                    acceptedAt: serverTimestamp()
                });
            }

            setUserProfile(profile);
            return newUser;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            throw err;
        }
    };

    const resetPassword = async (email) => {
        setLoading(true);
        setError(null);
        try {
            await sendPasswordResetEmail(auth, email);
            setLoading(false);
            return true;
        } catch (err) {
            setError(err.message);
            setLoading(false);
            throw err;
        }
    };

    const logout = () => signOut(auth);

    const value = {
        user,
        userProfile,
        role: userProfile?.role || null,
        isSuperAdmin: userProfile?.role === 'super_admin',
        userId: user?.uid || null,
        isAuthenticated: !!user && !!userProfile,
        loading,
        error,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout
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
