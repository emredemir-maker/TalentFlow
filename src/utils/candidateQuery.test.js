// Doğal dil sorgusunun çalıştırılması.
//
// Bu dosyanın tek bir işi var: asistanın verdiği HER sayının burada
// hesaplandığını ve doğru olduğunu garanti etmek. Model sorguyu üretir,
// cevabı değil — dolayısıyla asistanın güvenilirliği tamamen buraya bağlı.
import { describe, expect, it } from 'vitest';

import {
    runCandidateQuery, resolvePosition, QUERY_FIELDS, DEFAULT_LIMIT, MAX_LIMIT,
} from './candidateQuery';
import { requirementsFingerprint } from './positionRequirements';

const position = {
    id: 'p1',
    title: 'Growth PM',
    requirements: ['GA4 hakimiyeti', 'Funnel sahipliği', 'B2B SaaS'],
    requirementsMeta: [
        { text: 'GA4 hakimiyeti', must: true },
        { text: 'Funnel sahipliği', must: true },
        { text: 'B2B SaaS', must: false },
    ],
};
const FP = requirementsFingerprint(position);

/** Bu pozisyon için analizi olan aday. */
function scanned(name, { score, statuses, star, location, skills, status, fp = FP } = {}) {
    return {
        id: name,
        name,
        location,
        status,
        skills,
        bestScore: score,
        positionAnalyses: {
            'Growth PM': {
                score,
                requirementsFingerprint: fp,
                starAnalysis: star
                    ? { Situation: star, Task: star, Action: star, Result: star }
                    : undefined,
                requirementCoverage: {
                    assessments: (statuses || []).map((s, i) => ({ index: i + 1, status: s })),
                },
            },
        },
    };
}

/** Bu pozisyon için hiç taranmamış aday. */
function unscanned(name, extra = {}) {
    return { id: name, name, bestScore: 0, ...extra };
}

const POOL = [
    scanned('Ayşe', { score: 88, statuses: ['met', 'met', 'met'], star: 3, location: 'İstanbul', skills: ['SQL', 'Amplitude'] }),
    scanned('Burak', { score: 72, statuses: ['met', 'met', 'missing'], star: 2, location: 'Ankara', skills: ['SQL'] }),
    scanned('Ceren', { score: 54, statuses: ['missing', 'met', 'met'], star: 1, location: 'İstanbul', skills: ['Excel'] }),
    scanned('Deniz', { score: 61, statuses: ['partial', 'met', 'met'], star: 2, location: 'İzmir', skills: [] }),
    unscanned('Emre', { location: 'İstanbul', skills: ['SQL'] }),
];

// Skorlar artık SAKLANAN sayıdan değil, kayıtlı analizden yeniden hesaplanıyor
// (bkz. positionScore.js). Havuzun gerçek skorları:
//   Ayşe  : uyum 100 (2/2 zorunlu + 1/1 tercihen), STAR 100 → güven 1,00 → 100
//   Burak : uyum  85 (2/2 zorunlu, tercihen yok),  STAR  67 → güven 0,90 →  77
//   Deniz : uyum  79 (1,5/2 zorunlu + tercihen),   STAR  67 → güven 0,90 →  71
//   Ceren : uyum  58 (1/2 zorunlu + tercihen),     STAR  33 → güven 0,80 →  46
//   Emre  : bu pozisyon için taranmamış
const run = (spec) => runCandidateQuery(spec, { candidates: POOL, positions: [position] });
const names = (r) => r.rows.map((v) => v.candidate.name);

describe('resolvePosition', () => {
    it('matches exactly, loosely, and through the Turkish lowercase trap', () => {
        expect(resolvePosition('Growth PM', [position])).toBe(position);
        expect(resolvePosition('growth pm', [position])).toBe(position);
        expect(resolvePosition('growth', [position])).toBe(position);
        // 'İ'.toLowerCase() birleşik nokta üretir; katlama bunu yutmalı
        expect(resolvePosition('GROWTH PM', [{ ...position, title: 'GROWTH PM' }])).toBeTruthy();
    });

    it('returns null when nothing matches', () => {
        expect(resolvePosition('Backend Developer', [position])).toBeNull();
        expect(resolvePosition('', [position])).toBeNull();
        expect(resolvePosition('Growth PM', [])).toBeNull();
    });
});

describe('score filtresi', () => {
    it('filters by the position score, not the global best score', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'score', op: 'gte', value: 75 }] });
        expect(names(r)).toEqual(['Ayşe', 'Burak']);
        expect(r.total).toBe(2);
    });

    it('uses the live formula, not the number stored at scan time', () => {
        // Ayşe'nin kaydında score: 88 yazıyor; bugünkü kurala göre 100.
        // Liste ile skor kırılımının ayrışmaması buna bağlı.
        const r = run({ position: 'Growth PM', filters: [{ field: 'score', op: 'gte', value: 95 }] });
        expect(names(r)).toEqual(['Ayşe']);
    });

    it('leaves unscanned candidates out of the count and SAYS so', () => {
        // Sessizce düşürmek, yanlış sayıyı doğru gibi göstermek olurdu
        const r = run({ position: 'Growth PM', filters: [{ field: 'score', op: 'gte', value: 0 }] });
        expect(names(r)).not.toContain('Emre');
        expect(r.skipped).toBe(1);
        expect(r.evaluated).toBe(4);
        expect(r.pool).toBe(5);
    });

    it('supports lte and eq', () => {
        expect(names(run({ position: 'Growth PM', filters: [{ field: 'score', op: 'lte', value: 60 }] }))).toEqual(['Ceren']);
        expect(names(run({ position: 'Growth PM', filters: [{ field: 'score', op: 'eq', value: 77 }] }))).toEqual(['Burak']);
    });
});

describe('gereksinim filtresi', () => {
    it('finds who meets a given requirement', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'requirement', index: 1, value: 'met' }] });
        expect(names(r)).toEqual(['Ayşe', 'Burak']);
    });

    it('finds who misses one', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'requirement', index: 3, value: 'missing' }] });
        expect(names(r)).toEqual(['Burak']);
    });

    it('combines "meets one but misses another"', () => {
        const r = run({
            position: 'Growth PM',
            filters: [
                { field: 'requirement', index: 2, value: 'met' },
                { field: 'requirement', index: 1, value: 'missing' },
            ],
        });
        expect(names(r)).toEqual(['Ceren']);
    });

    it('names the requirement in the audit trail', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'requirement', index: 1, value: 'met' }] });
        expect(r.applied[0]).toContain('GA4 hakimiyeti');
    });

    it('ignores an out-of-range index instead of matching nothing silently', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'requirement', index: 99, value: 'met' }] });
        expect(r.applied).toHaveLength(1); // metin bulunamaz ama filtre geçerli
        expect(r.total).toBe(0);
    });
});

describe('zorunlu kapısı', () => {
    it('finds candidates who clear every must-have', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'gate', value: 'ok' }] });
        expect(names(r)).toEqual(['Ayşe', 'Burak']);
    });

    it('finds knockouts', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'gate', value: 'missing' }] });
        expect(names(r)).toEqual(['Ceren']);
    });

    it('treats a partial must as its own bucket', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'gate', value: 'partial' }] });
        expect(names(r)).toEqual(['Deniz']);
    });
});

describe('konum filtresi', () => {
    it('survives the İstanbul lowercase trap', () => {
        // 'İstanbul'.toLowerCase() → 'i̇stanbul' (birleşik nokta). Bu tuzak
        // daha önce konum filtresini bozdu.
        const r = run({ filters: [{ field: 'location', op: 'includes', value: 'istanbul' }] });
        expect(names(r)).toEqual(expect.arrayContaining(['Ayşe', 'Ceren', 'Emre']));
    });

    it('excludes', () => {
        const r = run({ filters: [{ field: 'location', op: 'excludes', value: 'İstanbul' }] });
        expect(names(r)).toEqual(expect.arrayContaining(['Burak', 'Deniz']));
        expect(names(r)).not.toContain('Ayşe');
    });

    it('does not require a scan', () => {
        const r = run({ filters: [{ field: 'location', op: 'includes', value: 'İstanbul' }] });
        expect(r.skipped).toBe(0);
        expect(names(r)).toContain('Emre');
    });
});

describe('beceri filtresi', () => {
    it('matches a listed skill', () => {
        const r = run({ filters: [{ field: 'skill', value: 'SQL' }] });
        expect(names(r)).toEqual(expect.arrayContaining(['Ayşe', 'Burak', 'Emre']));
    });

    it('uses the skill graph, not just string equality', () => {
        // Amplitude ile Mixpanel kardeş araç; graf bunu yakalamalı
        const r = run({ filters: [{ field: 'skill', value: 'Mixpanel' }] });
        expect(names(r)).toContain('Ayşe');
    });
});

describe('tarama durumu', () => {
    it('finds unscanned candidates — and does not skip them as unevaluable', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'scan', value: 'unscanned' }] });
        expect(names(r)).toEqual(['Emre']);
        expect(r.skipped).toBe(0);
    });

    it('separates fresh from stale by the requirements fingerprint', () => {
        const stale = scanned('Fatma', { score: 50, statuses: ['met'], fp: 'rESKI' });
        const data = { candidates: [...POOL, stale], positions: [position] };
        const r = runCandidateQuery({ position: 'Growth PM', filters: [{ field: 'scan', value: 'stale' }] }, data);
        expect(r.rows.map((v) => v.candidate.name)).toEqual(['Fatma']);
    });
});

describe('STAR filtresi', () => {
    it('filters on the shared STAR percentage', () => {
        // 3/3 dört boyutta → %100, 2/3 → %67, 1/3 → %33
        const r = run({ position: 'Growth PM', filters: [{ field: 'star', op: 'gte', value: 60 }] });
        expect(names(r)).toEqual(expect.arrayContaining(['Ayşe', 'Burak', 'Deniz']));
        expect(names(r)).not.toContain('Ceren');
    });
});

describe('sıralama, sınır ve gruplama', () => {
    it('sorts by score descending by default', () => {
        expect(names(run({ position: 'Growth PM', filters: [] }))).toEqual(['Ayşe', 'Burak', 'Deniz', 'Ceren', 'Emre']);
    });

    it('sorts by name', () => {
        const r = run({ filters: [], sort: { field: 'name', dir: 'desc' } });
        expect(names(r)[0]).toBe('Ayşe');
    });

    it('caps the list and reports truncation', () => {
        const r = run({ filters: [], limit: 2 });
        expect(r.rows).toHaveLength(2);
        expect(r.total).toBe(5);
        expect(r.truncated).toBe(true);
    });

    it('clamps a nonsense limit', () => {
        expect(run({ filters: [], limit: -5 }).limit).toBe(DEFAULT_LIMIT);
        expect(run({ filters: [], limit: 99999 }).limit).toBe(MAX_LIMIT);
        expect(run({ filters: [] }).limit).toBe(DEFAULT_LIMIT);
    });

    it('groups by location', () => {
        const r = run({ filters: [], groupBy: 'location' });
        expect(r.groups).toEqual(expect.arrayContaining([{ key: 'İstanbul', count: 3 }]));
    });
});

describe('modelin uydurduğu sorgular', () => {
    it('drops an unknown field and REPORTS it', () => {
        // Sessizce yok saymak, kullanıcıya uygulanmamış bir filtreyi
        // uygulanmış gibi göstermek olurdu
        const r = run({ filters: [{ field: 'maasBeklentisi', op: 'lte', value: 100 }] });
        expect(r.applied).toHaveLength(0);
        expect(r.ignored).toContain('maasBeklentisi: 100');
        expect(r.total).toBe(5);
    });

    it('drops a known field with a nonsense value', () => {
        expect(run({ filters: [{ field: 'gate', value: 'harika' }] }).ignored).toHaveLength(1);
        expect(run({ filters: [{ field: 'score', op: 'gte', value: 'çok' }] }).ignored).toHaveLength(1);
        expect(run({ filters: [{ field: 'requirement', index: 'iki', value: 'met' }] }).ignored).toHaveLength(1);
    });

    it('falls back to a sane comparison when the operator is unknown', () => {
        const r = run({ position: 'Growth PM', filters: [{ field: 'score', op: 'yaklasik', value: 75 }] });
        expect(names(r)).toEqual(['Ayşe', 'Burak']);
    });

    it('survives a completely empty or malformed spec', () => {
        expect(runCandidateQuery(null, { candidates: POOL, positions: [position] }).total).toBe(5);
        expect(runCandidateQuery({}, {}).total).toBe(0);
        expect(run({ filters: 'hepsi' }).total).toBe(5);
    });

    it('ignores a position it cannot find rather than returning nothing', () => {
        const r = run({ position: 'Olmayan Pozisyon', filters: [{ field: 'location', op: 'includes', value: 'İstanbul' }] });
        expect(r.positionTitle).toBeNull();
        expect(r.total).toBe(3);
    });
});

describe('alan sözlüğü', () => {
    it('marks exactly the fields that need a deep scan', () => {
        // Bu ayrım "taranmamış aday sayıma girmez" kuralının kaynağı
        const needsScan = Object.entries(QUERY_FIELDS)
            .filter(([, v]) => v.needsScan).map(([k]) => k).sort();
        expect(needsScan).toEqual(['gate', 'requirement', 'score', 'star']);
    });
});
