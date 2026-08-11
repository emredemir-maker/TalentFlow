// Gereksinim sözlüğü.
//
// İki tuzağa karşı: (1) bayat bir sözlük eski madde metnini gösterip
// kullanıcıyı yanıltmasın, (2) numaralar kayınca tanım yanlış maddeye
// yapışmasın. İkisini de bu projede daha önce yaşadık.
import { describe, expect, it } from 'vitest';

import { glossaryFor, glossaryEntry, buildGlossaryRecord, hasContent } from './requirementGlossary';
import { requirementsFingerprint } from './positionRequirements';

const base = () => ({
    id: 'p1',
    title: 'Growth PM',
    requirements: ['GA4 hakimiyeti', 'Funnel sahipliği'],
    requirementsMeta: [
        { text: 'GA4 hakimiyeti', must: true },
        { text: 'Funnel sahipliği', must: true },
    ],
});

const withGlossary = (position, entries, fingerprint) => ({
    ...position,
    requirementGlossary: {
        fingerprint: fingerprint ?? requirementsFingerprint(position),
        generatedAt: 'ts',
        entries,
    },
});

const AI = [
    { index: 1, olcut: 'Ürün verisini okuyup karar verebilme', sinyaller: 'Kendi kurduğu rapor, izleme planı', olcmez: 'Veri altyapısı kurmayı ölçmez' },
    { index: 2, olcut: 'Kayıttan gelire uzanan akışın sahipliği', sinyaller: 'Uçtan uca sorumlu olduğu akış', olcmez: 'Tek bir ekranın tasarımını ölçmez' },
];

describe('glossaryFor', () => {
    it('reports a position that has no glossary yet', () => {
        const g = glossaryFor(base());
        expect(g.missing).toBe(true);
        expect(g.stale).toBe(false);
        expect(g.entries.map((e) => e.text)).toEqual(['GA4 hakimiyeti', 'Funnel sahipliği']);
        expect(g.entries.every((e) => !hasContent(e))).toBe(true);
    });

    it('returns stored definitions against the current requirement text', () => {
        const g = glossaryFor(withGlossary(base(), AI));
        expect(g.missing).toBe(false);
        expect(g.stale).toBe(false);
        expect(g.byIndex.get(1).olcut).toBe('Ürün verisini okuyup karar verebilme');
        expect(g.byIndex.get(1).olcmez).toContain('altyapı');
    });

    it('goes stale when the requirements change', () => {
        const before = withGlossary(base(), AI);
        const after = {
            ...before,
            requirements: ['Ürün analitiği', 'Funnel sahipliği'],
            requirementsMeta: [{ text: 'Ürün analitiği', must: true }, { text: 'Funnel sahipliği', must: true }],
        };
        expect(glossaryFor(after).stale).toBe(true);
    });

    it('shows the CURRENT text even when the glossary is stale', () => {
        // Bayat sözlüğün eski metni göstermesi, düzelttiğimiz hatanın aynısı:
        // kullanıcı ekranda gördüğü metne göre karar veriyor
        const stale = {
            ...withGlossary(base(), AI, 'rESKI'),
            requirements: ['Ürün analitiği', 'Funnel sahipliği'],
            requirementsMeta: [{ text: 'Ürün analitiği', must: true }, { text: 'Funnel sahipliği', must: true }],
        };
        const g = glossaryFor(stale);
        expect(g.stale).toBe(true);
        expect(g.byIndex.get(1).text).toBe('Ürün analitiği');
    });

    it('tolerates a glossary that covers only some requirements', () => {
        const g = glossaryFor(withGlossary(base(), [AI[0]]));
        expect(hasContent(g.byIndex.get(1))).toBe(true);
        expect(hasContent(g.byIndex.get(2))).toBe(false);
        expect(g.entries).toHaveLength(2);
    });

    it('drops an entry pointing past the end of the list', () => {
        const g = glossaryFor(withGlossary(base(), [{ index: 9, olcut: 'hayalet' }]));
        expect(g.entries).toHaveLength(2);
        expect(g.entries.every((e) => !hasContent(e))).toBe(true);
    });

    it('handles a missing or empty position', () => {
        expect(glossaryFor(null).entries).toEqual([]);
        expect(glossaryFor({}).missing).toBe(true);
    });
});

describe('glossaryEntry', () => {
    it('reads one requirement', () => {
        expect(glossaryEntry(withGlossary(base(), AI), 2).olcut).toContain('gelire');
        expect(glossaryEntry(withGlossary(base(), AI), 9)).toBeNull();
    });
});

describe('buildGlossaryRecord', () => {
    it('stamps the fingerprint of the requirements it was built from', () => {
        const pos = base();
        const rec = buildGlossaryRecord(pos, AI, 'ts');
        expect(rec.fingerprint).toBe(requirementsFingerprint(pos));
        expect(rec.generatedAt).toBe('ts');
    });

    it('does NOT store the requirement text a second time', () => {
        // İki kopya tutmak, ikisinin ayrışmasına davetiye
        const rec = buildGlossaryRecord(base(), AI);
        expect(rec.entries[0]).toEqual({
            index: 1,
            olcut: 'Ürün verisini okuyup karar verebilme',
            sinyaller: 'Kendi kurduğu rapor, izleme planı',
            olcmez: 'Veri altyapısı kurmayı ölçmez',
        });
    });

    it('drops empty entries instead of storing blanks', () => {
        const rec = buildGlossaryRecord(base(), [{ index: 1, olcut: 'Bir şey' }, { index: 2 }]);
        expect(rec.entries).toHaveLength(1);
    });

    it('ignores entries the model invented for requirements that do not exist', () => {
        const rec = buildGlossaryRecord(base(), [...AI, { index: 7, olcut: 'uydurma' }]);
        expect(rec.entries.map((e) => e.index)).toEqual([1, 2]);
    });

    it('survives malformed model output', () => {
        expect(buildGlossaryRecord(base(), null).entries).toEqual([]);
        expect(buildGlossaryRecord(base(), 'metin').entries).toEqual([]);
        expect(buildGlossaryRecord(base(), [{ index: 'bir', olcut: 'x' }]).entries).toEqual([]);
        expect(buildGlossaryRecord(base(), [{ index: 1, olcut: 42 }]).entries).toEqual([]);
    });

    it('round-trips: what it writes is what glossaryFor reads', () => {
        const pos = base();
        const stored = { ...pos, requirementGlossary: buildGlossaryRecord(pos, AI, 'ts') };
        const g = glossaryFor(stored);
        expect(g.stale).toBe(false);
        expect(g.missing).toBe(false);
        expect(g.byIndex.get(2).sinyaller).toBe('Uçtan uca sorumlu olduğu akış');
    });
});
