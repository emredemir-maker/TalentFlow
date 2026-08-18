// DOĞRULAMA RAPORU — üç ölçümün birleştiği yer.
//
// En önemli testler iki şeyi kanıtlıyor:
//   1. Rapor hiçbir skoru değiştirmiyor; ürettiği şey SORU.
//   2. Taranmayan şirket rapora yazılıyor. Bir kapsam sınırını söylememek,
//      raporu "her şeye baktım" diye okutur.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./companyIntelStore', () => ({ resolveCompanies: vi.fn() }));

const { verifyCandidate, requiredYearsOf, buildVerificationSummary, buildStoredReport } = await import('./cvVerification');

const TODAY = { year: 2026, month: 8 };
const TARGET = { sector: 'musteri deneyimi', model: 'b2b', type: 'saas' };

const exp = (company, role, duration) => ({ company, role, duration, desc: '' });

/** resolveAll yerine geçen sahte çözümleyici — kanıtı doğrudan verir. */
const stubLookup = (byName = {}, extra = {}) => vi.fn(async (companies) => ({
    intel: new Map(companies.flatMap(({ key, name }) =>
        (byName[name] ? [[key, byName[name]], [name, byName[name]]] : []))),
    fromCache: 0,
    looked: companies.length,
    skipped: [],
    failed: [],
    ...extra,
}));

const run = (candidate, options = {}) => verifyCandidate(candidate, {
    today: TODAY,
    targetProfile: TARGET,
    resolveAll: stubLookup(),
    ...options,
});

const idsOf = (r) => r.flags.map((f) => f.id);

beforeEach(() => vi.clearAllMocks());

describe('requiredYearsOf', () => {
    it('finds the year threshold anywhere in the posting', () => {
        expect(requiredYearsOf({ title: 'PM', requirements: ['En az 5 yıl deneyim'] })).toBe(5);
        expect(requiredYearsOf({ description: '3+ yıl SaaS tecrübesi' })).toBe(3);
        expect(requiredYearsOf({ requirements: [{ text: '4 yıl' }] })).toBe(4);
    });

    it('returns null when the posting does not ask for years', () => {
        expect(requiredYearsOf({ title: 'PM', requirements: ['SQL'] })).toBeNull();
        expect(requiredYearsOf(null)).toBeNull();
    });
});

describe('verifyCandidate — the two cases that started this', () => {
    // Erkut: beyanı 6 yıl, kayıtları 2 yıl.
    it('carries the consistency contradiction into the combined report', async () => {
        const r = await run({
            name: 'Erkut Öztürk',
            experience: 6,
            experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
        });
        expect(idsOf(r)).toContain('beyan-fazla');
        expect(r.counts.celiski).toBeGreaterThan(0);
        expect(r.questions.length).toBeGreaterThan(0);
    });

    // Hasan Asgar: kendi şirketi.
    it('surfaces the founder match from the company layer', async () => {
        const r = await run(
            { name: 'Hasan Asgar', experiences: [exp('Asgar Digital', 'Growth Manager', 'Oca 2022 - Ağu 2026')] },
            {
                resolveAll: stubLookup({
                    'Asgar Digital': {
                        name: 'Asgar Digital',
                        sources: [{ title: 's', uri: 'https://x' }],
                        sizeBand: '1-10',
                        registry: { foundedYear: 2021, founders: ['Hasan Asgar'] },
                    },
                }),
            }
        );
        expect(idsOf(r)).toContain('aday-kurucu');
        expect(idsOf(r)).toContain('unvan-olcek');
        expect(r.companySummary.counts.dogrulandi).toBe(1);
    });
});

describe('verifyCandidate — the report changes no score', () => {
    it('returns measurements and questions, never a score', async () => {
        const r = await run({ name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] });
        expect(r).not.toHaveProperty('score');
        expect(r).not.toHaveProperty('matchScore');
        expect(r).not.toHaveProperty('trustScore');
        expect(Array.isArray(r.questions)).toBe(true);
    });

    // Aynı soru iki bayraktan da doğabilir; mülakatçıya iki kez sorulmaz.
    it('does not repeat the same question twice', async () => {
        const r = await run({
            name: 'A B',
            experience: 9,
            experiences: [
                exp('X', 'Junior Analyst', 'Oca 2024 - Ara 2024'),
                exp('Y', 'Marketing Director', 'Oca 2025 - Ağu 2026'),
            ],
        });
        expect(new Set(r.questions).size).toBe(r.questions.length);
    });
});

describe('verifyCandidate — no silent caps', () => {
    it('writes skipped companies into the report', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] },
            { resolveAll: stubLookup({}, { skipped: ['Y Ltd', 'Z A.Ş.'] }) }
        );
        const f = r.flags.find((x) => x.id === 'tarama-tavani');
        expect(f.detail).toContain('Y Ltd');
        expect(f.detail).toContain('Rapor bu şirketleri kapsamıyor');
    });

    it('writes failed lookups into the report', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] },
            { resolveAll: stubLookup({}, { failed: [{ name: 'X', error: 'kota' }] }) }
        );
        expect(r.flags.find((x) => x.id === 'tarama-hatasi')).toBeTruthy();
    });

    it('reports how much came from cache', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] },
            { resolveAll: stubLookup({}, { fromCache: 1, looked: 0 }) }
        );
        expect(r.lookup).toMatchObject({ fromCache: 1, looked: 0, total: 1 });
    });
});

describe('verifyCandidate — one company, several roles', () => {
    // Kuruluş çelişkisi ancak EN ESKİ iddiaya karşı anlamlı; şirket bir kez
    // doğrulanır ama en erken başlangıç kullanılır.
    it('verifies a company once, against its earliest claimed start', async () => {
        const r = await run(
            {
                name: 'A B',
                experiences: [
                    exp('Delta', 'Senior Dev', 'Oca 2022 - Ağu 2026'),
                    exp('Delta', 'Dev', 'Oca 2018 - Ara 2021'),
                ],
            },
            {
                resolveAll: stubLookup({
                    Delta: { name: 'Delta', sources: [{ title: 's', uri: 'https://x' }], registry: { foundedYear: 2021, founders: [] } },
                }),
            }
        );
        expect(r.companies).toHaveLength(1);
        expect(r.companies[0].claim.startYear).toBe(2018);
        expect(idsOf(r)).toContain('kurulus-sonrasi');
    });
});

describe('verifyCandidate — sector fit rides along', () => {
    it('measures sector fit from the same company lookup', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('Desk360', 'PM', 'Oca 2023 - Ağu 2026')] },
            {
                resolveAll: stubLookup({
                    Desk360: {
                        name: 'Desk360', sources: [{ title: 's', uri: 'https://x' }],
                        sector: 'musteri deneyimi', model: 'b2b', type: 'saas',
                    },
                }),
            }
        );
        expect(r.sectorFit.verdict).toBe('guclu');
        expect(r.sectorFit.exactMonths).toBe(44);
    });

    it('says the target is missing rather than reporting zero fit', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] },
            { targetProfile: null }
        );
        expect(r.sectorFit.verdict).toBe('hedef-yok');
    });
});

describe('verifyCandidate — robustness', () => {
    it('handles a candidate with no career history', async () => {
        const r = await run({ name: 'A B', experiences: [] });
        expect(idsOf(r)).toContain('olcum-yapilamadi');
        expect(r.companies).toEqual([]);
        expect(r.counts.celiski).toBe(0);
    });

    it('does not throw on a malformed candidate', async () => {
        await expect(run(null)).resolves.toBeTruthy();
        await expect(run({ experiences: [null, {}] })).resolves.toBeTruthy();
    });

    it('sorts contradictions to the top', async () => {
        const r = await run({
            name: 'A B',
            experience: 9,
            experiences: [exp('X', 'Dev', 'Oca 2025 - Ara 2029')],
        });
        expect(r.flags[0].severity).toBe('celiski');
    });
});

// ── Aday belgesine yazılan özet ─────────────────────────────────────────────
// Bu özet listedeki rozetleri ve skor kesintisini besliyor. Yanlış bir alan
// buradan çıkarsa etkisi tek ekranda değil, tüm sıralamada görünür.
describe('buildVerificationSummary', () => {
    const report = async (over = {}) => {
        const r = await run(
            { name: 'A B', experiences: [exp('X', 'Dev', 'Oca 2020 - Ağu 2026')] },
            over
        );
        return r;
    };

    it('keeps only what the list and the score need', async () => {
        const s = buildVerificationSummary(await report());
        expect(Object.keys(s).sort()).toEqual(['at', 'companies', 'counts', 'flagIds', 'lookupComplete', 'sector']);
    });

    // Firestore undefined kabul etmiyor; tek bir undefined tüm yazımı düşürür.
    it('never emits undefined', async () => {
        const s = buildVerificationSummary(await report());
        const walk = (o) => Object.values(o || {}).forEach((v) => {
            expect(v).not.toBeUndefined();
            if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
        });
        walk(s);
    });

    // ASIL KORUMA: bizim atladığımız şirket adayın skorundan düşmemeli.
    it('marks the lookup incomplete when we skipped or failed companies', async () => {
        expect(buildVerificationSummary(await report()).lookupComplete).toBe(true);

        const skipped = await report({ resolveAll: stubLookup({}, { skipped: ['Y'] }) });
        expect(buildVerificationSummary(skipped).lookupComplete).toBe(false);

        const failed = await report({ resolveAll: stubLookup({}, { failed: [{ name: 'Y', error: 'e' }] }) });
        expect(buildVerificationSummary(failed).lookupComplete).toBe(false);
    });

    it('carries the sector verdict the badges read', async () => {
        const r = await run(
            { name: 'A B', experiences: [exp('Desk360', 'PM', 'Oca 2023 - Ağu 2026')] },
            {
                resolveAll: stubLookup({
                    Desk360: { name: 'Desk360', sources: [{ title: 's', uri: 'https://x' }], sector: 'musteri deneyimi', model: 'b2b', type: 'saas' },
                }),
            }
        );
        expect(buildVerificationSummary(r).sector).toMatchObject({ verdict: 'guclu', target: 'musteri deneyimi', stale: false });
    });

    it('survives a malformed or empty report', () => {
        expect(() => buildVerificationSummary(null)).not.toThrow();
        expect(buildVerificationSummary(null).counts).toEqual({ celiski: 0, dikkat: 0, bilgi: 0 });
        expect(buildVerificationSummary(null).sector).toBeNull();
    });
});

// ── Ekranda yeniden gösterilebilecek rapor ──────────────────────────────────
// Başta yalnızca özet saklanıyordu; rapor "yeniden üretmesi bedava" diye
// atılıyordu. Pratikte bedava değildi: kullanıcı sekmeye her girdiğinde boş
// ekran görüp taramayı yeniden başlatmak zorunda kalıyordu.
describe('buildStoredReport', () => {
    const rich = () => run(
        { name: 'Hasan Asgar', experiences: [exp('Asgar Digital', 'CEO / Co-Founder', 'Oca 2021 - Ağu 2026')] },
        {
            resolveAll: stubLookup({
                'Asgar Digital': {
                    name: 'Asgar Digital',
                    sizeBand: '1-10',
                    sector: 'musteri deneyimi',
                    searchSuggestionHtml: '<div>öneri</div>',
                    sources: Array.from({ length: 20 }, (_, i) => ({ title: `k${i}`, uri: `https://x/${i}` })),
                },
            }),
        }
    );

    it('keeps everything the panel needs to render without re-running', async () => {
        const stored = buildStoredReport(await rich());
        expect(stored.counts).toBeTruthy();
        expect(stored.flags.length).toBeGreaterThan(0);
        expect(stored.flags[0]).toHaveProperty('title');
        expect(stored.flags[0]).toHaveProperty('detail');
        expect(stored.questions.length).toBeGreaterThan(0);
        expect(stored.companies[0]).toMatchObject({ company: 'Asgar Digital' });
        expect(stored.sectorFit).toBeTruthy();
        expect(stored.verifiedAt).toBeTruthy();
    });

    it('caps the source list instead of storing everything', async () => {
        const stored = buildStoredReport(await rich());
        expect(stored.companies[0].evidence.sources.length).toBeLessThanOrEqual(6);
    });

    // Google'ın gösterim şartı önbellekten gösterirken de geçerli.
    it('keeps the search-suggestion block', async () => {
        const stored = buildStoredReport(await rich());
        expect(stored.companies[0].evidence.searchSuggestionHtml).toContain('öneri');
    });

    // Firestore undefined kabul etmiyor; tek bir undefined tüm yazımı düşürür.
    it('never emits undefined', async () => {
        const stored = buildStoredReport(await rich());
        const walk = (o) => {
            if (!o || typeof o !== 'object') return;
            for (const v of Object.values(o)) {
                expect(v).not.toBeUndefined();
                if (Array.isArray(v)) v.forEach(walk); else walk(v);
            }
        };
        walk(stored);
    });

    it('returns null for a missing report rather than an empty shell', () => {
        expect(buildStoredReport(null)).toBeNull();
    });
});
