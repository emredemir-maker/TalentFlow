// Yeniden taramada kimler taranacak?
//
// Canlıda çıktı: bir adayı tek bir ilana karşı taratmanın yolu yoktu. En dar
// kapsam 87 aday, en genişi 440 — tek aday için 87 AI çağrısı. Kullanıcı
// "aday seçimi yok" dedi ve haklıydı.
import { describe, expect, it } from 'vitest';

import { resolveTargets, searchableTargets } from './rescanTargets';

const row = (id, name, score, extra = {}) => ({
    candidate: { id, name, email: `${id}@x.com` },
    score,
    ...extra,
});

const SCORED = [
    row('a', 'Mustafa Enc', 39, { stale: true, scanned: true }),
    row('b', 'Öykü Aydın', 72, { stale: false, scanned: true }),
    row('c', 'Ali Deniz', 65, { stale: true, scanned: true }),
    row('d', 'Zeynep Kaya', 12, { stale: false, scanned: false }),
];

// "Analizi eskimiş olanlar" kapsamı
const STALE_SCOPE = SCORED.filter((s) => s.stale);

describe('resolveTargets — kapsam + eşik (eski davranış)', () => {
    it('applies the threshold inside the chosen scope', () => {
        const out = resolveTargets({ scored: SCORED, inScope: STALE_SCOPE, threshold: 50, picked: new Set() });
        expect(out.map((s) => s.candidate.id)).toEqual(['c']);
    });

    it('takes the whole scope when the threshold is zero', () => {
        const out = resolveTargets({ scored: SCORED, inScope: STALE_SCOPE, threshold: 0, picked: new Set() });
        expect(out).toHaveLength(2);
    });

    it('behaves identically when no selection is passed at all', () => {
        // Toplu akış bu eklemeden etkilenmemeli
        const withEmpty = resolveTargets({ scored: SCORED, inScope: STALE_SCOPE, threshold: 40, picked: new Set() });
        const withNone = resolveTargets({ scored: SCORED, inScope: STALE_SCOPE, threshold: 40 });
        expect(withEmpty).toEqual(withNone);
    });
});

describe('resolveTargets — tek tek seçim', () => {
    it('scans exactly one candidate when exactly one is picked', () => {
        // Asıl mesele buydu: 87 çağrı yerine 1
        const out = resolveTargets({
            scored: SCORED, inScope: STALE_SCOPE, threshold: 0, picked: new Set(['a']),
        });
        expect(out.map((s) => s.candidate.id)).toEqual(['a']);
    });

    it('overrides the threshold — a low-scoring pick is still scanned', () => {
        // Mustafa %39; eşik 60 olsa bile seçildiyse taranmalı
        const out = resolveTargets({
            scored: SCORED, inScope: STALE_SCOPE, threshold: 60, picked: new Set(['a']),
        });
        expect(out.map((s) => s.candidate.id)).toEqual(['a']);
    });

    it('overrides the scope — a pick outside the scope is still scanned', () => {
        // Aranan aday çoğu zaman seçili kapsamın dışında kalıyor ve asıl
        // ihtiyaç tam da onu taratmak
        const out = resolveTargets({
            scored: SCORED, inScope: STALE_SCOPE, threshold: 0, picked: new Set(['d']),
        });
        expect(out.map((s) => s.candidate.id)).toEqual(['d']);
    });

    it('keeps the requested order stable across calls', () => {
        const picked = new Set(['d', 'a']);
        const first = resolveTargets({ scored: SCORED, inScope: [], threshold: 0, picked });
        const second = resolveTargets({ scored: SCORED, inScope: [], threshold: 0, picked });
        expect(first.map((s) => s.candidate.id)).toEqual(second.map((s) => s.candidate.id));
    });

    it('ignores a picked id that is not in the pool', () => {
        const out = resolveTargets({ scored: SCORED, inScope: [], threshold: 0, picked: new Set(['hayalet']) });
        expect(out).toEqual([]);
    });

    it('survives junk input', () => {
        expect(resolveTargets()).toEqual([]);
        expect(resolveTargets({})).toEqual([]);
        expect(resolveTargets({ scored: null, inScope: null, threshold: NaN })).toEqual([]);
    });
});

describe('searchableTargets', () => {
    it('filters by name and by email', () => {
        expect(searchableTargets(SCORED, 'mustafa', new Set()).map((s) => s.candidate.id)).toEqual(['a']);
        expect(searchableTargets(SCORED, 'c@x.com', new Set()).map((s) => s.candidate.id)).toEqual(['c']);
    });

    it('keeps a picked candidate visible even when the search excludes them', () => {
        // Arama daraltınca seçim görünmez olursa kullanıcı kaç kişi seçtiğini
        // kaybeder ve yanlışlıkla fazladan tarama başlatır
        const out = searchableTargets(SCORED, 'öykü', new Set(['a']));
        expect(out.map((s) => s.candidate.id)).toEqual(['a', 'b']);
    });

    it('does not list a picked candidate twice', () => {
        const out = searchableTargets(SCORED, 'mustafa', new Set(['a']));
        expect(out.map((s) => s.candidate.id)).toEqual(['a']);
    });

    it('returns the whole pool for an empty search', () => {
        expect(searchableTargets(SCORED, '', new Set())).toHaveLength(4);
        expect(searchableTargets(SCORED, '   ', new Set())).toHaveLength(4);
    });

    it('caps the list so a 440-candidate pool does not freeze the dialog', () => {
        const big = Array.from({ length: 500 }, (_, i) => row(`id${i}`, `Aday ${i}`, i % 100));
        expect(searchableTargets(big, '', new Set(), 60)).toHaveLength(60);
    });

    it('survives junk input', () => {
        expect(searchableTargets(null, 'x', new Set())).toEqual([]);
        expect(searchableTargets(SCORED, null, undefined)).toHaveLength(4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ALAN DIŞI ADAYI DA TARATABİLMEK.
//
// Kullanıcı sordu: "bir aday benim growth pozisyonum için uygun değildir ama
// daha uygun olduğu bir pozisyon olabilir, ona uyumunu nasıl ölçerim?"
//
// Ölçemiyordu. Domain filtresi adayı havuza sokmuyordu; ne "Yeniden Analiz
// Et" o ilanı deniyordu ne de yeniden tarama diyaloğunda aday listede
// çıkıyordu. Yani "bence bu aday bu ilana uyar" cümlesini sisteme
// söyleyemiyordunuz.
//
// Karar makinede değil insanda olmalı. Arama artık TÜM havuzu görüyor;
// kapsam ve eşik ise eski (alan uyumlu) havuzla çalışmaya devam ediyor.
// ─────────────────────────────────────────────────────────────────────────────
describe('alan dışı aday', () => {
    // Kapsam havuzu: ilanın alanına uyanlar
    const related = [row('a', 'Mustafa Enc', 39, { stale: true, scanned: true })];
    // Tüm havuz: alan dışı Onol da içinde
    const everyone = [...related, row('z', 'Onol Ustun', 8, { stale: false, scanned: false })];

    it('finds an off-domain candidate the scope pool never contained', () => {
        expect(searchableTargets(related, 'onol', new Set())).toEqual([]);
        expect(searchableTargets(everyone, 'onol', new Set()).map((s) => s.candidate.id)).toEqual(['z']);
    });

    it('scans exactly the off-domain candidate when picked', () => {
        const out = resolveTargets({
            scored: everyone,
            inScope: related,
            threshold: 0,
            picked: new Set(['z']),
        });
        expect(out.map((s) => s.candidate.id)).toEqual(['z']);
    });

    it('leaves the bulk path on the scope pool — picking is the only override', () => {
        // Seçim yoksa alan dışı aday HİÇ taranmamalı; toplu akış değişmedi
        const out = resolveTargets({
            scored: everyone,
            inScope: related,
            threshold: 0,
            picked: new Set(),
        });
        expect(out.map((s) => s.candidate.id)).toEqual(['a']);
    });
});
