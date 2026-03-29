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
    updateProfile,
    signInAnonymously
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
import { auth, db, googleProvider, isFirebaseConfigured } from '../config/firebase';

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
        if (!isFirebaseConfigured || !auth) {
            setError('Firebase yapılandırılmamış. Lütfen VITE_FIREBASE_* ortam değişkenlerini ayarlayın.');
            setLoading(false);
            return;
        }

        let unsubscribeProfile = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // Anonymous sessions are only valid on candidate-facing public routes.
                // If a stale anonymous session is restored on a non-public route (e.g. the
                // dashboard), sign it out immediately so the user lands on the Login page
                // instead of being stuck on /exit.
                if (currentUser.isAnonymous) {
                    const path = window.location.pathname;
                    const isPublicRoute = path.startsWith('/join/') ||
                                         path.startsWith('/live-interview/') ||
                                         path.startsWith('/interview-report/') ||
                                         path.startsWith('/apply/');
                    if (!isPublicRoute) {
                        // Signing out triggers onAuthStateChanged again with null → LoginPage
                        signOut(auth);
                        return;
                    }
                    setUser(currentUser);
                    setUserProfile({ role: 'candidate', isAnonymous: true });
                    setLoading(false);
                    return;
                }

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
            if (!currentUser || !currentUser.email || currentUser.isAnonymous) return;
            try {
                const emailLower = currentUser.email.toLowerCase();
                const emailDomain = emailLower.split('@')[1] || '';
                const isPrimaryAdmin = INITIAL_SUPER_ADMINS.includes(emailLower);

                // Safety check for user doc
                const userDocRef = doc(db, USERS_PATH, currentUser.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setUserProfile(docSnap.data());
                    return;
                }

                // Check allowed domains from Firestore
                let allowedDomains = [];
                try {
                    const systemSnap = await getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'system'));
                    if (systemSnap.exists()) allowedDomains = systemSnap.data().allowedDomains || [];
                } catch { /* ignore */ }

                const isDomainAllowed = allowedDomains.includes(emailDomain);

                if (isPrimaryAdmin) {
                    const firstProfile = {
                        uid: currentUser.uid,
                        email: emailLower,
                        displayName: currentUser.displayName || emailLower.split('@')[0],
                        photoURL: currentUser.photoURL || '',
                        role: 'super_admin',
                        status: 'active',
                        createdAt: serverTimestamp()
                    };
                    await setDoc(userDocRef, firstProfile);
                    setUserProfile(firstProfile);
                } else if (isDomainAllowed) {
                    // Domain whitelist bypass — automatically allow as recruiter
                    const domainProfile = {
                        uid: currentUser.uid,
                        email: emailLower,
                        displayName: currentUser.displayName || emailLower.split('@')[0],
                        photoURL: currentUser.photoURL || '',
                        role: 'recruiter',
                        departments: [],
                        status: 'active',
                        createdAt: serverTimestamp()
                    };
                    await setDoc(userDocRef, domainProfile);
                    setUserProfile(domainProfile);
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
                            departments: invitation.departments ? invitation.departments : (invitation.department ? [invitation.department] : []),
                            status: 'active',
                            createdAt: serverTimestamp()
                        };
                        await setDoc(userDocRef, newProfile);
                        await updateDoc(doc(db, INVITATIONS_PATH, inviteDoc.id), {
                            status: 'accepted',
                            acceptedAt: serverTimestamp()
                        });
                        setUserProfile(newProfile);
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

    // Anonymous SignIn for Public Routes - Separate effect to handle dependency changes correctly
    useEffect(() => {
        const path = window.location.pathname;
        const isPublicRoute = path.startsWith('/join/') ||
                              path.startsWith('/live-interview/') ||
                              path.startsWith('/interview-report/') ||
                              path.startsWith('/apply/');

        if (isPublicRoute && !user && !loading) {
            console.log("[TalentFlow] Public route & unauthenticated. Triggering anonymous sign-in...");
            signInAnonymously(auth).catch(err => console.error("Anonymous Sign-In Error:", err));
        }
    }, [user, loading]);

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
            let msg = "Giriş yapılamadı. Lütfen tekrar deneyin.";
            if (err.code === 'auth/user-not-found')       msg = "Bu e-posta ile kayıtlı bir hesap bulunamadı.";
            if (err.code === 'auth/wrong-password')       msg = "Hatalı şifre. Lütfen tekrar deneyin.";
            if (err.code === 'auth/invalid-credential')   msg = "E-posta veya şifre hatalı.";
            if (err.code === 'auth/invalid-email')        msg = "Geçersiz e-posta adresi.";
            if (err.code === 'auth/user-disabled')        msg = "Bu hesap devre dışı bırakıldı.";
            if (err.code === 'auth/too-many-requests')    msg = "Çok fazla başarısız deneme. Lütfen birkaç dakika bekleyin.";
            setError(msg);
            setLoading(false);
            throw err;
        }
    };

    const registerWithEmail = async (email, password, name) => {
        setLoading(true);
        setError(null);
        console.log(`[Registration] Starting for ${email}...`);
        try {
            // 1. Check if invitation exists OR is primary admin
            const emailLower = email.trim().toLowerCase();
            const isPrimaryAdmin = INITIAL_SUPER_ADMINS.includes(emailLower);

            // Check allowed domains
            const emailDomain = emailLower.split('@')[1] || '';
            let allowedDomains = [];
            try {
                const systemSnap = await getDoc(doc(db, 'artifacts/talent-flow/public/data/settings', 'system'));
                if (systemSnap.exists()) allowedDomains = systemSnap.data().allowedDomains || [];
            } catch { /* ignore */ }
            const isDomainAllowed = allowedDomains.includes(emailDomain);

            console.log(`[Registration] Checking invitations for ${emailLower}...`);
            let invitation = null;
            let inviteDocId = null;

            try {
                const q = query(collection(db, INVITATIONS_PATH),
                    where("email", "==", emailLower),
                    where("status", "==", "pending")
                );
                const inviteSnap = await getDocs(q);
                if (!inviteSnap.empty) {
                    invitation = inviteSnap.docs[0].data();
                    inviteDocId = inviteSnap.docs[0].id;
                    console.log(`[Registration] Found valid invitation.`);
                }
            } catch (snapErr) {
                console.error("[Registration] Invitation check failed:", snapErr);
                if (!isPrimaryAdmin && !isDomainAllowed) {
                    throw new Error(`Davetiye kontrolü başarısız: ${snapErr.message}`);
                }
            }

            if (!invitation && !isPrimaryAdmin && !isDomainAllowed) {
                console.warn(`[Registration] No invitation and not primary admin or allowed domain.`);
                throw new Error("Geçerli bir davetiyeniz bulunmuyor. Lütfen administratörden davet isteyeniz.");
            }

            // 2. Create Auth User
            console.log(`[Registration] Creating auth user...`);
            const userCredential = await createUserWithEmailAndPassword(auth, emailLower, password);
            const newUser = userCredential.user;

            // 3. Set Display Name
            console.log(`[Registration] Updating profile display name...`);
            await updateProfile(newUser, { displayName: name });

            // 4. Create User Profile
            console.log(`[Registration] Creating Firestore profile...`);
            const profile = {
                uid: newUser.uid,
                email: newUser.email,
                displayName: name,
                photoURL: '',
                role: isPrimaryAdmin ? 'super_admin' : (invitation?.role || 'recruiter'),
                departments: invitation?.departments ? invitation.departments : (invitation?.department ? [invitation.department] : [] ),
                status: 'active',
                createdAt: serverTimestamp()
            };

            try {
                await setDoc(doc(db, USERS_PATH, newUser.uid), profile);
                console.log(`[Registration] Firestore profile created.`);
            } catch (profileErr) {
                console.error("[Registration] Profile creation error:", profileErr);
                throw new Error(`Profil oluşturulamadı: ${profileErr.message}`);
            }

            // 5. Mark invitation as accepted (if it existed)
            if (inviteDocId) {
                try {
                    await updateDoc(doc(db, INVITATIONS_PATH, inviteDocId), {
                        status: 'accepted',
                        acceptedAt: serverTimestamp()
                    });
                    console.log(`[Registration] Invitation marked as accepted.`);
                } catch (inviteUpdateErr) {
                    console.error("[Registration] Failed to update invitation status:", inviteUpdateErr);
                    // Non-critical error, we still continue
                }
            }

            setUserProfile(profile);
            console.log(`[Registration] Success!`);
            return newUser;
        } catch (err) {
            console.error("[Registration] General error:", err);
            let msg = err.message;
            if (err.code === 'auth/email-already-in-use') {
                msg = '__EMAIL_IN_USE__Bu e-posta adresi zaten kayıtlı. Mevcut hesabınızla giriş yapmayı deneyin veya şifrenizi sıfırlayın.';
            } else if (err.code === 'auth/invalid-email') {
                msg = 'Geçersiz e-posta adresi.';
            } else if (err.code === 'auth/weak-password') {
                msg = 'Şifre çok kısa — en az 6 karakter kullanın.';
            } else if (err.code === 'auth/operation-not-allowed') {
                msg = 'E-posta ile kayıt şu an devre dışı.';
            }
            setError(msg);
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
        isDepartmentUser: userProfile?.role === 'department_user',
        userDepartments: userProfile?.departments || (userProfile?.department ? [userProfile.department] : []),
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
