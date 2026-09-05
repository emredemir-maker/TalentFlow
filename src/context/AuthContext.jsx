// src/context/AuthContext.jsx
// Authentication Context - Rule 3 Compliance
// Uses onAuthStateChanged to bind user session to global state

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
    serverTimestamp,
    onSnapshot
} from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '../config/firebase';

const AuthContext = createContext(null);

const USERS_PATH = 'artifacts/talent-flow/public/data/users';

/**
 * Bekleyen daveti SUNUCUDAN sorar.
 *
 * ── NEDEN İSTEMCİDEN SORGULANMIYOR ──────────────────────────────────────────
 * Kayıt sırasında hesap henüz yok, dolayısıyla bu sorgu kimliksiz atılıyordu
 * ve davetiye koleksiyonu bunun için `allow read: if true` ile açıktı.
 * Firestore'da `read` hem `get` hem `list` demek: aynı kural, kimliksiz bir
 * istemcinin koleksiyonun TAMAMINI — davet edilmiş bütün e-postaları ve
 * rollerini — tek istekte okumasına izin veriyordu. Uygulama bunu yapmıyordu
 * ama yapılmasını engelleyen bir şey de yoktu.
 *
 * Sorgu artık sunucuda (Admin SDK kuralların dışında çalışır) ve koleksiyon
 * super_admin'e kapalı.
 *
 * @returns {Promise<{inviteId: string, role: string, departments: string[]}|null>}
 *   davet yoksa null; sorgu YAPILAMADIYSA hata fırlatır — çağıran ikisini
 *   ayırt edebilsin diye ("davetin yok" ile "kontrol edemedik" aynı şey değil).
 */
async function lookupInvitation(emailLower) {
    const res = await fetch('/api/auth/invitation-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailLower }),
    });
    if (!res.ok) throw new Error(`Davetiye servisi yanıt vermedi (${res.status})`);
    const data = await res.json();
    return data?.found ? data : null;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null); // { role, status, etc }
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // ── E2E mock-auth short-circuit ──────────────────────────────────
        // Vite resolves `import.meta.env.VITE_E2E_MOCK_AUTH` at build time.
        // When the env var is set to 'true' (only the Playwright "auth"
        // project does this), AuthContext skips Firebase entirely and
        // hands the rest of the app a fixed authenticated session. The
        // production build is unaffected because the env var is not set
        // there — the dead branch is removed by Rollup's tree shaker.
        //
        // The mock user is a recruiter (not super_admin) so any test that
        // *does* exercise super-admin gates surfaces the right error,
        // and not a falsely-allowed path.
        if (import.meta.env.VITE_E2E_MOCK_AUTH === 'true') {
            setUser({
                uid: 'e2e-test-recruiter',
                email: 'e2e@test.local',
                displayName: 'E2E Test Recruiter',
                isAnonymous: false,
            });
            setUserProfile({
                uid: 'e2e-test-recruiter',
                email: 'e2e@test.local',
                displayName: 'E2E Test Recruiter',
                name: 'E2E Test Recruiter',
                role: 'recruiter',
                departments: [],
                status: 'active',
            });
            setLoading(false);
            return;
        }

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

                if (isDomainAllowed) {
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
                    const invitation = await lookupInvitation(emailLower);

                    if (invitation) {
                        const newProfile = {
                            uid: currentUser.uid,
                            email: emailLower,
                            displayName: currentUser.displayName || emailLower.split('@')[0],
                            photoURL: currentUser.photoURL || '',
                            role: invitation.role,
                            // Sunucu eski tekil `department` alanını da tekilden
                            // listeye çeviriyor; kuraldaki karşılaştırma bunu bekliyor.
                            departments: invitation.departments,
                            status: 'active',
                            // Firestore rules verify the requested role against this
                            // invitation doc — without it the create is denied.
                            inviteId: invitation.inviteId,
                            createdAt: serverTimestamp()
                        };
                        await setDoc(userDocRef, newProfile);
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
        // Accessible in catch block for "email-already-in-use" reinvite flow
        let _invitation = null;
        let _emailLower = '';
        try {
            // 1. Check if invitation exists or domain is allow-listed.
            // Super-admin bootstrapping is no longer hard-coded by email;
            // run scripts/grant-super-admin.mjs after the account exists.
            _emailLower = email.trim().toLowerCase();
            const emailLower = _emailLower;

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
                const found = await lookupInvitation(emailLower);
                if (found) {
                    invitation = found;
                    _invitation = invitation; // accessible in outer catch
                    inviteDocId = found.inviteId;
                    console.log(`[Registration] Found valid invitation.`);
                }
            } catch (snapErr) {
                console.error("[Registration] Invitation check failed:", snapErr);
                if (!isDomainAllowed) {
                    throw new Error(`Davetiye kontrolü başarısız: ${snapErr.message}`);
                }
            }

            if (!invitation && !isDomainAllowed) {
                console.warn(`[Registration] No invitation and domain not allow-listed.`);
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
                role: invitation?.role || 'recruiter',
                departments: invitation?.departments || [],
                status: 'active',
                // Firestore rules verify the requested role against this
                // invitation doc; domain-allowed signups have no invite.
                ...(inviteDocId ? { inviteId: inviteDocId } : {}),
                createdAt: serverTimestamp()
            };

            try {
                await setDoc(doc(db, USERS_PATH, newUser.uid), profile);
                console.log(`[Registration] Firestore profile created.`);
            } catch (profileErr) {
                console.error("[Registration] Profile creation error:", profileErr);
                throw new Error(`Profil oluşturulamadı: ${profileErr.message}`);
            }

            // 5. DAVET "KABUL EDİLDİ" OLARAK İŞARETLENMİYOR — bilinen boşluk.
            //
            // Burada bir `updateDoc` duruyordu ama koleksiyonun yazma kuralı
            // zaten super_admin'e kapalıydı: yeni kaydolan kullanıcı bu yazmayı
            // hiçbir zaman yapamadı, çağrı yalnızca konsola hata basıyordu.
            // Sorgu sunucuya taşındıktan sonra istemcinin koleksiyona hiç
            // erişimi kalmadı, dolayısıyla çağrı kesin olarak ölüydü.
            //
            // Sonucu: davetler "pending" kalıyor ve super_admin ekranında
            // bekliyormuş gibi görünüyor. Aynı daveti başkası kullanamaz
            // (kural, davetteki e-posta ile giriş yapanın e-postasını
            // karşılaştırıyor), o yüzden bu bir güvenlik açığı değil — ama
            // düzeltilmesi gereken ayrı bir iş: kabul işaretini sunucu atmalı.

            setUserProfile(profile);
            console.log(`[Registration] Success!`);
            return newUser;
        } catch (err) {
            console.error("[Registration] General error:", err);
            let msg = err.message;
            if (err.code === 'auth/email-already-in-use') {
                if (_invitation) {
                    // User was deleted from Firestore but Auth account still exists.
                    // Send a password reset email so they can access their existing Auth account.
                    try {
                        await sendPasswordResetEmail(auth, _emailLower);
                        console.log('[Registration] Reinvite: password reset email sent to', _emailLower);
                    } catch (resetErr) {
                        console.warn('[Registration] Reinvite: password reset failed:', resetErr.message);
                    }
                    msg = '__EMAIL_REINVITE__Bu e-posta daha önce sisteme kayıtlıydı — davet kabul edildi. Şifre sıfırlama bağlantısı e-postanıza gönderildi. E-postanızı kontrol edin, yeni şifrenizi belirleyin ve giriş yapın.';
                } else {
                    msg = '__EMAIL_IN_USE__Bu e-posta adresi zaten kayıtlı. Mevcut hesabınızla giriş yapmayı deneyin veya şifrenizi sıfırlayın.';
                }
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

    /**
     * DEPARTMAN LİSTESİ HER RENDER'DA YENİ DİZİ OLMAMALI.
     *
     * Eskiden burada her render'da taze bir dizi üretiliyordu: departmanı
     * olmayan bir recruiter için bile `[]` yeni bir referanstı. Bu dizi
     * CandidatesContext'teki aday dinleyicisinin bağımlılık dizisinde
     * duruyor — yani her render aboneliği yıkıp yeniden kuruyordu.
     * Ölçüldü: tek sayfa açılışında koleksiyon dinleyicisi BEŞ KEZ
     * kuruluyordu ve her biri tüm aday belgelerini baştan indiriyordu.
     * "Ekran önce boş geliyor, sonra doluyor" bunun görünen yüzüydü.
     */
    const userDepartments = useMemo(
        () => userProfile?.departments || (userProfile?.department ? [userProfile.department] : []),
        [userProfile?.departments, userProfile?.department]
    );

    /**
     * Context değeri de memoize: düz nesne her render'da yeni referans
     * üretiyor ve bu context'i tüketen HER bileşeni yeniden render ettiriyordu.
     *
     * Fonksiyonlar bilerek bağımlılıkta yok: hiçbiri bileşen state'ini
     * okumuyor, yalnızca stabil setter'ları (setLoading/setError) ve firebase
     * API'lerini çağırıyorlar. Bağımlılığa eklenselerdi memo hiç tutmazdı.
     */
    const value = useMemo(() => ({
        user,
        userProfile,
        role: userProfile?.role || null,
        isSuperAdmin: userProfile?.role === 'super_admin',
        isDepartmentUser: userProfile?.role === 'department_user',
        userDepartments,
        userId: user?.uid || null,
        isAuthenticated: !!user && !!userProfile,
        loading,
        error,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout
     
    }), [user, userProfile, userDepartments, loading, error]);

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
