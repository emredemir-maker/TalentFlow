// @vitest-environment happy-dom
// POZİSYON — BOZUK TİPLE RENDER TARAMASI
//
// Aday detayı için yazılan taramanın (tests/candidateDetailCrash.test.jsx)
// pozisyon karşılığı. İlk çalıştırmada dört alanda 7 çökme buldu:
// `title`, `department`, `minExperience` nesne geldiğinde React ağacı
// düşüyor; `matchedCandidates` metin geldiğinde `.reduce` yok.
//
// ADAY LİSTESİ BOŞ BIRAKILMAMALI: ilk denemede boştu ve eşleştirme/alan
// tespiti yolları hiç çalışmadı — canlıda yaşanan `toLowerCase` çökmesi
// tam o yoldaydı. Fikstürde bir aday var.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizePosition } from '../src/utils/normalizePosition';
globalThis.React = React;

vi.mock('../src/config/firebase', () => ({ db: {}, auth: {}, storage: {}, googleProvider: {} }));
vi.mock('firebase/firestore', () => ({
    doc: () => ({}),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    getDocs: async () => ({ docs: [] }),
    onSnapshot: () => () => {},
    setDoc: async () => {},
    serverTimestamp: () => ({}),
    collection: () => ({}),
    query: () => ({}),
    where: () => ({}),
    updateDoc: async () => {},
    addDoc: async () => ({ id: 'x' }),
    deleteDoc: async () => {},
    arrayUnion: (...a) => a,
    orderBy: () => ({}),
    limit: () => ({}),
}));
vi.mock('../src/services/geminiService', () => ({ extractPositionFromJD: async () => ({}) }));
vi.mock('../src/services/scanService', () => ({
    rescanCandidateForPosition: async () => ({}),
    hasAnalysisForPosition: () => false,
}));
vi.mock('../src/services/ai/requirementGlossary', () => ({
    buildRequirementGlossary: async () => ({}),
}));
vi.mock('../src/services/ai/config', () => ({ getAuthHeaders: async () => ({}) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
vi.mock('../src/context/PositionsContext', () => ({ usePositions: () => globalThis.__POSCTX__ }));
vi.mock('../src/context/CandidatesContext', () => ({
    useCandidates: () => globalThis.__CANDCTX__,
}));
vi.mock('../src/context/AuthContext', () => ({
    useAuth: () => ({
        user: { uid: 'u1' },
        userProfile: { role: 'super_admin' },
        role: 'super_admin',
        isAuthenticated: true,
        loading: false,
        isDepartmentUser: false,
        userDepartments: [],
        logout: () => {},
    }),
}));
vi.mock('../src/context/NotificationContext', () => ({
    useNotifications: () => ({
        notifications: [],
        unreadCount: 0,
        markAsRead: () => {},
        markAllAsRead: () => {},
        clearAll: () => {},
        addNotification: () => {},
    }),
}));
vi.mock('../src/context/MessageQueueContext', () => ({
    useMessageQueue: () => ({ queue: [], items: [], enqueue: () => {}, pending: 0 }),
}));
vi.mock('../src/context/UserSettingsContext', () => ({
    useUserSettings: () => ({ settings: {}, loading: false, updateSettings: async () => {} }),
}));

const HOSTILE = {
    metin: 'React, SQL',
    sayi: 42,
    nesne: { a: 1 },
    nesne_dizisi: [{ a: 1 }],
    mantiksal: true,
    bos: null,
    bos_metin: '',
};
const FIELDS = [
    'title',
    'department',
    'description',
    'requirements',
    'requirementsMeta',
    'status',
    'minExperience',
    'location',
    'salaryBand',
    'matchedCandidates',
    'releasedToDepartment',
    'rejectionReason',
    'requestedBy',
    'screeningQuestions',
    'createdAt',
    'glossary',
    'company',
    'experience',
];
const BASE = {
    id: 'p1',
    title: 'Frontend Developer',
    department: 'Teknoloji',
    status: 'open',
    requirements: ['React'],
    description: 'React',
};

let Page;
beforeAll(async () => {
    Page = (await import('../src/pages/PositionsPage.jsx')).default;
}, 120000);

function render(hamPos) {
    const pos = normalizePosition(hamPos);
    globalThis.__POSCTX__ = {
        positions: [pos],
        loading: false,
        error: null,
        addPosition: async () => {},
        updatePosition: async () => {},
        deletePosition: async () => {},
        positionDraft: null,
        setPositionDraft: () => {},
    };
    const aday = {
        id: 'c1',
        name: 'Aday',
        position: 'Frontend Developer',
        matchedPositionTitle: 'Frontend Developer',
        skills: ['React'],
        cvText: 'React ve SQL deneyimi',
        bestScore: 70,
        status: 'review',
        source: 'LinkedIn',
    };
    globalThis.__CANDCTX__ = {
        candidates: [aday],
        enrichedCandidates: [aday],
        filteredCandidates: [aday],
        loading: false,
        error: null,
        setViewCandidateId: () => {},
        updateCandidate: async () => {},
        sourceColors: {},
    };
    try {
        renderToStaticMarkup(React.createElement(Page));
        return null;
    } catch (e) {
        return `${e.name}: ${e.message}`.slice(0, 120);
    }
}

describe('pozisyon ekranı bozuk tiplerle çökmemeli', () => {
    it('sağlam kayıtla açılır', () => {
        expect(render({ ...BASE })).toBeNull();
    });

    it('her alan × her bozuk tip render edilebilir', { timeout: 600000 }, () => {
        const cokmeler = [];
        for (const f of FIELDS) {
            for (const [k, v] of Object.entries(HOSTILE)) {
                const hata = render({ ...BASE, [f]: v });
                if (hata) cokmeler.push(`${f} = ${k} -> ${hata}`);
            }
        }
        expect(cokmeler, cokmeler.join(String.fromCharCode(10))).toEqual([]);
    });
});
