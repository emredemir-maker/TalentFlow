// @vitest-environment happy-dom
//
// ADAY DETAYI — BOZUK TİPLE RENDER TARAMASI
//
// ── NEDEN VAR ───────────────────────────────────────────────────────────────
// Canlıda bir adayın detayına girildiğinde ekran BEYAZ kalıyordu. Sebebi
// bulmak için tahmin yürütmek gerekti, çünkü React render sırasında hata
// fırlatıldığında tüm ağacı söküyor ve geriye hiçbir ipucu bırakmıyor.
//
// Aday kayıtları üç ayrı akıştan geliyor ve hiçbir aşamada şema doğrulaması
// yok; aynı alan bir kayıtta dizi, başkasında metin, bir başkasında nesne
// olabiliyor. Ekran kodu ise tipi VARSAYIYOR. Tek tek tahmin etmek yerine bu
// test ekranı bozuk tiplerle sistematik olarak render ediyor:
//
//     8 sekme × alanlar × 7 bozuk tip
//
// İlk çalıştırmada altı alanda 24, "CV & Uyum" sekmesinde 8 daha olmak üzere
// toplam 32 çökme buldu. Hepsi utils/normalizeCandidate ile kapatıldı.
//
// ── NE İŞE YARAR ────────────────────────────────────────────────────────────
// Ekrana yeni bir alan okuması eklendiğinde ve o alan tipi varsayıldığında
// bu test kırmızıya döner. Yani beyaz ekranın bu sınıfı bir daha canlıda
// değil, burada yakalanır.

import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { normalizeCandidate } from '../src/utils/normalizeCandidate';

// vitest'in esbuild dönüşümü klasik JSX runtime kullanıyor (uygulama build'i
// otomatik runtime). Klasik runtime `React.createElement` çağırdığı için
// global gerekiyor — bu bir test aracı ayrıntısı, uygulama davranışı değil.
globalThis.React = React;

// Ağ/SDK bağımlılıkları: test render'ı hiçbir yere bağlanmamalı.
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
vi.mock('../src/services/geminiService', () => ({
    parseExperiencesFromText: async () => [],
    parseCandidateFromText: async () => ({}),
}));
vi.mock('../src/services/scanService', () => ({
    deepScanCandidate: async () => ({}),
    rescanCandidateForPosition: async () => ({}),
}));
vi.mock('../src/services/cvParser', () => ({ extractTextFromFile: async () => '' }));
vi.mock('../src/services/bulkStorageUpload', () => ({ uploadBulkSources: async () => [] }));
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

// Sekme state'ini dışarıdan zorlamak için: her sekme ayrı bir render yüzeyi.
vi.mock('react', async (orig) => {
    const actual = await orig();
    return {
        ...actual,
        useState: (init) =>
            actual.useState(init === 'ai_analysis' ? globalThis.__TAB__ || 'ai_analysis' : init),
    };
});

vi.mock('../src/context/CandidatesContext', () => ({ useCandidates: () => globalThis.__CTX__ }));
vi.mock('../src/context/PositionsContext', () => ({
    usePositions: () => ({ positions: globalThis.__POS__, loading: false, error: null }),
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
    }),
}));
vi.mock('../src/context/MessageQueueContext', () => ({
    useMessageQueue: () => ({ queue: [], items: [], enqueue: () => {}, pending: 0 }),
}));
vi.mock('../src/context/UserSettingsContext', () => ({
    useUserSettings: () => ({ settings: {}, loading: false, updateSettings: async () => {} }),
}));

/** Gerçek kayıtlarda görülebilecek tip sapmaları. */
const HOSTILE = {
    metin: 'React, TypeScript',
    sayi: 42,
    nesne: { a: 1, b: { c: 2 } },
    nesne_dizisi: [{ a: 1 }],
    mantiksal: true,
    bos: null,
    bos_metin: '',
};

/** Detay ekranının okuduğu alanlar. */
const FIELDS = [
    'skills',
    'experiences',
    'careerHistory',
    'education',
    'educationDetail',
    'cvText',
    'cvData',
    'location',
    'experience',
    'hrComments',
    'interviewSessions',
    'positionAnalyses',
    'screeningResult',
    'aiAnalysis',
    'starAnalysis',
    'verification',
    'interviewPlans',
    'source',
    'sourceDetail',
    'position',
    'matchedPositionTitle',
    'suggestedRole',
    'screeningScore',
    'salary',
    'phone',
    'name',
    'email',
    'summary',
];

const TABS = [
    'ai_analysis',
    'cv_file',
    'cv_match',
    'pos_matches',
    'verification',
    'sessions',
    'history',
    'messages',
];

const BASE = { id: 'c1', name: 'Test Aday', email: 'test@example.com', status: 'review' };

let Page;
beforeAll(async () => {
    Page = (await import('../src/pages/CandidateProcessPage.jsx')).default;
});

/** Ekranı bir adayla render eder; çökerse hata metnini döndürür. */
function render(rawCandidate) {
    // Uygulamada bu normalleştirme CandidatesContext içinde yapılıyor;
    // test de aynı yoldan geçirir ki gerçek render yüzeyi ölçülsün.
    const candidate = normalizeCandidate(rawCandidate);
    globalThis.__CTX__ = {
        candidates: [candidate],
        filteredCandidates: [candidate],
        enrichedCandidates: [candidate],
        stats: { total: 1 },
        departments: ['all'],
        loading: false,
        error: null,
        addCandidate: async () => {},
        updateCandidate: async () => {},
        deleteCandidate: async () => {},
        searchQuery: '',
        setSearchQuery: () => {},
        departmentFilter: 'all',
        setDepartmentFilter: () => {},
        statusFilter: 'all',
        setStatusFilter: () => {},
        experienceFilter: 'all',
        setExperienceFilter: () => {},
        positionFilter: 'all',
        setPositionFilter: () => {},
        matchPositions: ['all'],
        sourceFilter: 'all',
        setSourceFilter: () => {},
        sourcesOptions: ['all'],
        subSourceFilter: 'all',
        setSubSourceFilter: () => {},
        subSourcesOptions: ['all'],
        sourceColors: {},
        viewCandidateId: candidate.id,
        setViewCandidateId: () => {},
        preselectedInterviewData: null,
        setPreselectedInterviewData: () => {},
        compareIds: [],
        toggleCompareCandidate: () => {},
        clearCompareSelection: () => {},
    };
    globalThis.__POS__ = [
        {
            id: 'p1',
            title: 'Frontend Developer',
            status: 'open',
            requirements: ['React'],
            description: 'React',
        },
    ];
    try {
        renderToStaticMarkup(React.createElement(Page));
        return null;
    } catch (err) {
        return `${err.name}: ${err.message}`;
    }
}

describe('aday detayı bozuk tiplerle çökmemeli', () => {
    it('sağlam kayıtla her sekme açılır', () => {
        for (const tab of TABS) {
            globalThis.__TAB__ = tab;
            expect(render({ ...BASE }), `sekme: ${tab}`).toBeNull();
        }
    });

    it('her alan × her bozuk tip × her sekme render edilebilir', { timeout: 600000 }, () => {
        const crashes = [];
        for (const tab of TABS) {
            globalThis.__TAB__ = tab;
            for (const field of FIELDS) {
                for (const [kind, value] of Object.entries(HOSTILE)) {
                    const err = render({ ...BASE, [field]: value });
                    if (err) crashes.push(`[${tab}] ${field} = ${kind} → ${err}`);
                }
            }
        }
        expect(crashes, crashes.join('\n')).toEqual([]);
    });
});
