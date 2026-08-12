// Sunucu/istemci ikizleri.
//
// Parmak izi iki tarafta ayrı ayrı hesaplanıyor: derin tarama istemcide
// damgalıyor, mülakat değerlendirmesi sunucuda. İki uygulama bir karakter
// ayrışırsa HER kayıt sonsuza kadar "bayat" görünür ve sistem hiçbir zaman
// hüküm veremez — hem de sessizce, çünkü kod her iki tarafta da "doğru"dur.
//
// Bu dosyanın asıl işi o ayrışmayı imkânsız kılmak.
import { describe, expect, it } from 'vitest';

import { positionRequirements, requirementsFingerprint } from './positionRequirements.js';
import {
    requirementsOf as clientRequirementsOf,
    requirementsFingerprint as clientFingerprint,
} from '../../src/utils/positionRequirements.js';

const CASES = [
    {
        name: 'zorunlu/tercihen işaretli ilan',
        position: {
            title: 'Growth Product Manager',
            requirementsMeta: [
                { text: 'Funnel sahipliği', must: true },
                { text: 'GA4 hakimiyeti', must: false },
            ],
        },
    },
    {
        name: 'işaretlenmemiş eski ilan',
        position: { title: 'Eski İlan', requirements: ['Funnel sahipliği', 'SQL'] },
    },
    {
        name: 'Türkçe karakterli maddeler',
        position: {
            title: 'İK Uzmanı',
            requirementsMeta: [
                { text: 'İşe alım süreçlerinde şeffaflık', must: true },
                { text: 'Çalışan bağlılığı ölçümü', must: false },
            ],
        },
    },
    {
        name: 'boş gereksinim listesi',
        position: { title: 'Boş', requirements: [] },
    },
    {
        name: 'boşluklu ve boş satırlı madde',
        position: {
            title: 'Kirli',
            requirementsMeta: [
                { text: '  Baştaki boşluk  ', must: true },
                { text: '   ', must: true },
                { text: 'Geçerli', must: false },
            ],
        },
    },
];

describe('sunucu ↔ istemci ikizleri', () => {
    for (const { name, position } of CASES) {
        it(`produces the same requirement list — ${name}`, () => {
            expect(positionRequirements(position)).toEqual(clientRequirementsOf(position));
        });

        it(`produces the same fingerprint — ${name}`, () => {
            expect(requirementsFingerprint(position)).toBe(clientFingerprint(position));
        });
    }
});

describe('requirementsFingerprint', () => {
    const base = CASES[0].position;

    it('changes when a requirement text changes', () => {
        const edited = {
            ...base,
            requirementsMeta: [{ text: 'Funnel sahipliği (uçtan uca)', must: true }, base.requirementsMeta[1]],
        };
        expect(requirementsFingerprint(edited)).not.toBe(requirementsFingerprint(base));
    });

    it('changes when a requirement is promoted from tercihen to zorunlu', () => {
        // Metin aynı ama AĞIRLIK değişti; skor da kapı da farklı çıkar
        const promoted = {
            ...base,
            requirementsMeta: [base.requirementsMeta[0], { text: 'GA4 hakimiyeti', must: true }],
        };
        expect(requirementsFingerprint(promoted)).not.toBe(requirementsFingerprint(base));
    });

    it('changes when the order changes, because assessments key on the number', () => {
        const reordered = { ...base, requirementsMeta: [...base.requirementsMeta].reverse() };
        expect(requirementsFingerprint(reordered)).not.toBe(requirementsFingerprint(base));
    });

    it('is stable across calls and unaffected by the position title', () => {
        expect(requirementsFingerprint(base)).toBe(requirementsFingerprint(base));
        expect(requirementsFingerprint({ ...base, title: 'Başka Başlık' }))
            .toBe(requirementsFingerprint(base));
    });

    it('does not throw on junk input', () => {
        for (const bad of [null, undefined, 'metin', {}, 5]) {
            expect(typeof requirementsFingerprint(bad)).toBe('string');
        }
    });
});

describe('positionRequirements', () => {
    it('marks meta-listed items and leaves legacy ones unmarked', () => {
        expect(positionRequirements(CASES[0].position)[0].must).toBe(true);
        expect(positionRequirements(CASES[1].position)[0].must).toBeNull();
    });

    it('drops blank entries and trims the rest', () => {
        const out = positionRequirements(CASES[4].position);
        expect(out).toHaveLength(2);
        expect(out[0].text).toBe('Baştaki boşluk');
    });

    it('returns an empty list for a bare title string or missing position', () => {
        expect(positionRequirements('Growth PM')).toEqual([]);
        expect(positionRequirements(null)).toEqual([]);
    });
});
