// src/context/AuthContext.jsx
// Kimlik + şirket (tenant) bağlamı.
//
// ── MODEL (docs/coklu-sirket-plani.md §2.2, §2.4) ──────────────────────────
//   • Giriş yalnız Hub'dan (K3): Talent'ın kendi e-posta/şifre ve Google girişi,
//     davet ve izinli alan adıyla kaydı (K4) KALDIRILDI. İstemci profil ya da
//     üyelik YAZMAZ; üyeliği yalnız sunucu yazar (Hub senkronu, PR 4).
//   • Kişinin şirketleri `userTenants/{uid}`'den (yalnız sunucu yazar). Etkin
//     şirket: Hub'dan gelişte Hub'ın verdiği, yoksa son seçilen (localStorage),
//     tek şirket varsa o. Birden çok şirket ve seçim yoksa seçici gösterilir.
//   • Yetki `tenants/{t}/members/{uid}` belgesinden (rol + departmanlar); jeton
//     talebine (`token.role`) bakılmaz. Eski `super_admin` → `admin`.
//   • Şirket durumu (K5): okuma `readUntil`, yazma `writeUntil`; salt okunur
//     bantta uygulama açılır, yazmalar kurallarda/sunucuda reddedilir ve üstte
//     bir şerit gösterilir.
//
// Tüketiciler için `useAuth()` eski alan adlarını korur (userProfile, role,
// isSuperAdmin…): userProfile artık üyelik belgesi + kimlik bilgisi.

import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, signOut, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { IS_DEMO } from '../utils/demoMode';
import {
    getActiveTenantId,
    isValidTenantId,
    memberPath,
    setActiveTenantId,
    tenantFromLocation,
    tenantRoot,
    userTenantsPath,
} from '../config/tenantPaths';

const AuthContext = createContext(null);

/** Hub adresi (giriş ve şirket yönetimi orada). */
export const HUB_INN_URL = import.meta.env.VITE_HUB_INN_URL || 'https://agentinn-nyqpx.web.app';

const LAST_TENANT_KEY = 'tf-active-tenant';
/** HubLaunchPage, Hub'ın gönderdiği şirketi buraya yazar (tek seferlik). */
export const HUB_TENANT_KEY = 'tf-hub-tenant';

const readStore = (store, key) => {
    try {
        return store.getItem(key);
    } catch {
        return null;
    }
};
const writeStore = (store, key, value) => {
    try {
        if (value == null) store.removeItem(key);
        else store.setItem(key, value);
    } catch {
        /* özel mod */
    }
};

const PUBLIC_PREFIXES = ['/join/', '/live-interview/', '/interview-report/', '/apply/', '/respond/', '/face-interview/'];
export function isPublicPath(path = window.location.pathname) {
    return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

/** Firestore Timestamp | Date | ISO → ms. */
function toMillis(v) {
    if (v == null) return NaN;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Date.parse(v);
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    return NaN;
}

/**
 * Şirket durumu — firestore.rules tenantReadable/tenantOpenForWrites ile aynı.
 * @returns {{readable: boolean, writable: boolean, suspended: boolean}}
 */
export function tenantAccessOf(tenant, now = Date.now()) {
    const status = tenant?.status || '';
    const readable = ['trial', 'active', 'readonly'].includes(status) && now < toMillis(tenant?.readUntil);
    const writable =
        readable && ['trial', 'active'].includes(status) && now < toMillis(tenant?.writeUntil);
    return { readable, writable, suspended: status === 'suspended' };
}

/** Üyelik geçerli mi — firestore.rules isMember ile aynı. */
export function memberIsActive(member, now = Date.now()) {
    if (!member || member.status !== 'active') return false;
    if (member.expiresAt != null && !(now < toMillis(member.expiresAt))) return false;
    return ['admin', 'recruiter', 'department_user', 'support'].includes(member.role);
}

/** Etkin şirketi seçer: Hub'ın verdiği > son seçilen > tek şirket. */
export function pickTenant(tenantIds, { hub, last } = {}) {
    if (hub && tenantIds.includes(hub)) return hub;
    if (last && tenantIds.includes(last)) return last;
    if (tenantIds.length === 1) return tenantIds[0];
    return null;
}

/**
 * Etkin şirket kararı. Aday (herkese açık) sayfasında BAĞLANTIDAKİ şirket
 * kazanır: kaydedilmiş seçim ya da üyelik listesi onu ezmez — yoksa iki
 * şirkette üye bir recruiter'ın açtığı A şirketi mülakatının yazımları
 * B'nin ağacına düşerdi.
 * @returns {{ active: string|null, member: string|null }} active: yolların
 *   kurulacağı şirket; member: üyelik/şirket belgesi dinlenecek şirket
 *   (listede değilse null).
 */
export function resolveActiveTenant({ ids, hub, last, publicPath = false, urlTenant = null }) {
    if (publicPath && urlTenant) {
        return { active: urlTenant, member: ids.includes(urlTenant) ? urlTenant : null };
    }
    const picked = pickTenant(ids, { hub, last });
    return { active: picked, member: picked };
}

// E2E mock-auth (yalnız `vite build --mode e2e-auth`; üretimde dal derlenmez).
const MOCK = import.meta.env.VITE_E2E_MOCK_AUTH === 'true';
const MOCK_TENANT = 'e2e-tenant';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [error, setError] = useState(null);

    const [tenants, setTenants] = useState(null); // null = yükleniyor
    const [tenantId, setTenantIdState] = useState(null);
    const [member, setMember] = useState(undefined); // undefined = yükleniyor
    const [tenant, setTenant] = useState(undefined);

    // ── Kimlik ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (MOCK) {
            setUser({ uid: 'e2e-test-recruiter', email: 'e2e@test.local', displayName: 'E2E Test Recruiter', isAnonymous: false });
            setTenants([{ id: MOCK_TENANT, name: 'E2E Şirketi', role: 'recruiter' }]);
            setActiveTenantId(MOCK_TENANT);
            setTenantIdState(MOCK_TENANT);
            setMember({ role: 'recruiter', departments: [], status: 'active', displayName: 'E2E Test Recruiter' });
            setTenant({ name: 'E2E Şirketi', status: 'active', writeUntil: Date.now() + 864e5, readUntil: Date.now() + 864e5 });
            setAuthLoading(false);
            return undefined;
        }
        if (!isFirebaseConfigured || !auth) {
            setError('Firebase yapılandırılmamış. Lütfen VITE_FIREBASE_* ortam değişkenlerini ayarlayın.');
            setAuthLoading(false);
            return undefined;
        }
        return onAuthStateChanged(auth, (currentUser) => {
            if (currentUser?.isAnonymous && !isPublicPath()) {
                // Aday sayfasından kalan anonim oturum iç ekranda geçersiz.
                signOut(auth);
                return;
            }
            setUser(currentUser || null);
            setAuthLoading(false);
        });
    }, []);

    // Aday sayfaları: anonim oturum + şirket bağlantıdan (?tenantId=…).
    useEffect(() => {
        if (MOCK || !auth) return;
        if (isPublicPath()) {
            const t = tenantFromLocation();
            if (t) setActiveTenantId(t);
            if (!user && !authLoading) {
                signInAnonymously(auth).catch((err) => console.error('Anonymous Sign-In Error:', err));
            }
        }
    }, [user, authLoading]);

    // ── Şirket listesi ──────────────────────────────────────────────────
    useEffect(() => {
        if (MOCK) return undefined;
        if (!user || user.isAnonymous) {
            setTenants(user ? [] : null);
            return undefined;
        }
        setTenants(null);
        return onSnapshot(
            doc(db, userTenantsPath(user.uid)),
            (snap) => {
                const map = (snap.exists() && snap.data()?.tenants) || {};
                const list = Object.entries(map)
                    .filter(([id]) => isValidTenantId(id))
                    .map(([id, v]) => ({ id, name: v?.name || id, role: v?.role || '' }))
                    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
                setTenants(list);
            },
            (err) => {
                console.error('userTenants okunamadı:', err);
                setTenants([]);
            }
        );
    }, [user]);

    // ── Etkin şirket seçimi ─────────────────────────────────────────────
    useEffect(() => {
        if (MOCK || !tenants) return;
        const ids = tenants.map((t) => t.id);
        const publicPath = isPublicPath();
        const urlTenant = publicPath ? tenantFromLocation() : null;
        const hub = readStore(sessionStorage, HUB_TENANT_KEY);
        const last = readStore(localStorage, LAST_TENANT_KEY);
        const { active, member: memberTenant } = resolveActiveTenant({ ids, hub, last, publicPath, urlTenant });
        if (hub && !urlTenant) writeStore(sessionStorage, HUB_TENANT_KEY, null);
        // Aday sayfasındaki bağlantı şirketi kalıcı seçim sayılmaz.
        if (active && !urlTenant) writeStore(localStorage, LAST_TENANT_KEY, active);
        setActiveTenantId(active);
        setTenantIdState(memberTenant);
    }, [tenants]);

    // ── Üyelik ve şirket belgesi ────────────────────────────────────────
    useEffect(() => {
        if (MOCK) return undefined;
        if (!user || user.isAnonymous || !tenantId) {
            setMember(undefined);
            setTenant(undefined);
            return undefined;
        }
        setMember(undefined);
        setTenant(undefined);
        const unsubMember = onSnapshot(
            doc(db, memberPath(user.uid, tenantId)),
            (snap) => setMember(snap.exists() ? snap.data() : null),
            () => setMember(null)
        );
        const unsubTenant = onSnapshot(
            doc(db, tenantRoot(tenantId)),
            (snap) => setTenant(snap.exists() ? snap.data() : null),
            () => setTenant(null)
        );
        return () => {
            unsubMember();
            unsubTenant();
        };
    }, [user, tenantId]);

    /** Şirket değiştir: seçimi saklar ve uygulamayı o şirketle baştan açar. */
    const selectTenant = useCallback((id) => {
        if (!isValidTenantId(id)) return;
        writeStore(localStorage, LAST_TENANT_KEY, id);
        if (id === getActiveTenantId()) return;
        // Tüm dinleyiciler ve önbellekler eski şirketin yollarında; temiz bir
        // açılış en güvenlisi (bir ekranın eski şirkete yazması ihtimali yok).
        window.location.assign('/panel');
    }, []);

    /** Giriş Hub'dan (K3). */
    const loginWithHub = useCallback(() => {
        window.location.assign(HUB_INN_URL);
    }, []);

    /** YALNIZ emülatör (E2E) ve demo derlemesi: e-posta/şifre ile giriş. Üretimde kapalı. */
    const loginWithEmulatorPassword = useCallback(async (email, password) => {
        if (import.meta.env.VITE_USE_FIREBASE_EMULATOR !== 'true' && !IS_DEMO) throw new Error('Kullanılamaz.');
        setError(null);
        await signInWithEmailAndPassword(auth, email, password);
    }, []);

    const logout = useCallback(() => {
        setActiveTenantId(null);
        return signOut(auth);
    }, []);

    const anonymous = !!user?.isAnonymous;
    const activeMember = memberIsActive(member) ? member : null;

    const userProfile = useMemo(() => {
        if (!user) return null;
        if (anonymous) return { role: 'candidate', isAnonymous: true };
        if (!activeMember) return null;
        const name = activeMember.displayName || user.displayName || activeMember.email || user.email || '';
        return {
            ...activeMember,
            uid: user.uid,
            email: activeMember.email || user.email || '',
            displayName: name,
            name,
            photoURL: activeMember.photoURL || user.photoURL || '',
        };
    }, [user, anonymous, activeMember]);

    const access = useMemo(() => tenantAccessOf(tenant), [tenant]);

    const userDepartments = useMemo(
        () => (Array.isArray(userProfile?.departments) ? userProfile.departments : []),
        [userProfile?.departments]
    );

    // Yükleniyor: kimlik; ya da iç kullanıcı için şirket listesi/üyelik/şirket.
    const loading =
        authLoading ||
        (!!user && !anonymous && (tenants === null || (!!tenantId && (member === undefined || tenant === undefined))));

    const role = userProfile?.role || null;
    const value = useMemo(
        () => ({
            user,
            userProfile,
            role,
            isAdmin: role === 'admin',
            // Eski ad — tüketiciler değişmesin diye; artık şirket yöneticisi.
            isSuperAdmin: role === 'admin',
            isDepartmentUser: role === 'department_user',
            isSupport: role === 'support',
            userDepartments,
            userId: user?.uid || null,
            isAuthenticated: !!user && !!userProfile && (anonymous || access.readable),
            loading,
            error,
            // Şirket
            tenants: tenants || [],
            tenantId,
            tenant: tenant || null,
            tenantReadable: access.readable,
            tenantWritable: access.writable && role !== 'support',
            tenantSuspended: access.suspended,
            membershipMissing: !!user && !anonymous && !!tenantId && member === null,
            selectTenant,
            loginWithHub,
            loginWithEmulatorPassword,
            logout,
        }),
        [user, userProfile, role, userDepartments, anonymous, access, loading, error, tenants, tenantId, tenant, member, selectTenant, loginWithHub, loginWithEmulatorPassword, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

/** Plan adıyla erişim (TenantContext): şirket alanları useAuth'ta. */
export const useTenant = useAuth;

export default AuthContext;
