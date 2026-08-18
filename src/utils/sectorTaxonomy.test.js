// SEKTÖR SÖZLÜĞÜ — kanonik kimlik olmadan "kariyerinin %62'si bu sektörde"
// diye bir cümle kurulamaz.
//
// Buradaki testlerin çoğu Türkçe yazım varyantlarıyla ilgili: "e-ticaret",
// "eticaret", "E-Ticaret" ve "e commerce" AYNI şeydir ve dördü de havuzda
// geçiyor. Biri kaçarsa o adayın o dönemi "bilinmeyen sektör" sayılır ve
// ölçüm sessizce eksilir.
import { describe, expect, it } from 'vitest';

import {
    resolveSector,
    resolveModel,
    resolveType,
    sectorAffinity,
    neighborsOf,
    sectorLabel,
    SECTOR_OPTIONS,
    MODEL_OPTIONS,
    TYPE_OPTIONS,
    NEAR_WEIGHT,
} from './sectorTaxonomy';

describe('resolveSector', () => {
    it('reads the canonical id, the label and the aliases alike', () => {
        expect(resolveSector('fintech')).toBe('fintech');
        expect(resolveSector('Fintech')).toBe('fintech');
        expect(resolveSector('Finansal Teknoloji')).toBe('fintech');
        expect(resolveSector('ödeme sistemleri')).toBe('fintech');
    });

    it('collapses Turkish spelling variants', () => {
        for (const raw of ['e-ticaret', 'eticaret', 'E-Ticaret', 'e commerce', 'eCommerce', 'Online Perakende']) {
            expect(resolveSector(raw), raw).toBe('e ticaret');
        }
    });

    // Infoset'in alanı: çağrı merkezi / müşteri iletişimi yazılımı. Bu
    // etiketin her söyleniş biçimi aynı kimliğe düşmezse hedef sektör
    // tanımlanamaz.
    it('recognises the customer-experience space by every common name', () => {
        for (const raw of ['CX', 'Customer Experience', 'çağrı merkezi', 'call center', 'contact center', 'müşteri hizmetleri', 'Help Desk', 'müşteri iletişimi']) {
            expect(resolveSector(raw), raw).toBe('musteri deneyimi');
        }
    });

    it('finds the sector inside a resolver sentence', () => {
        expect(resolveSector('B2B SaaS müşteri iletişim platformu')).toBe('musteri deneyimi');
        expect(resolveSector('Türkiye merkezli bir kargo ve taşımacılık şirketi')).toBe('lojistik');
    });

    // Uzun anahtar önce denenmezse "e ticaret" içindeki genel terim kazanır.
    it('prefers the more specific match', () => {
        expect(resolveSector('e-ticaret pazaryeri')).toBe('e ticaret');
    });

    it('returns null rather than guessing', () => {
        expect(resolveSector('')).toBeNull();
        expect(resolveSector(null)).toBeNull();
        expect(resolveSector('bir şirket')).toBeNull();
    });
});

describe('resolveModel / resolveType', () => {
    it('reads the business model', () => {
        expect(resolveModel('B2B')).toBe('b2b');
        expect(resolveModel('kurumsal satış')).toBe('b2b');
        expect(resolveModel('B2C')).toBe('b2c');
        expect(resolveModel('tüketici')).toBe('b2c');
    });

    it('reads the revenue type', () => {
        expect(resolveType('SaaS')).toBe('saas');
        expect(resolveType('Software as a Service')).toBe('saas');
        expect(resolveType('marketplace')).toBe('pazaryeri');
        expect(resolveType('imalat')).toBe('uretim');
    });

    it('returns null for unknown input', () => {
        expect(resolveModel('belirsiz')).toBeNull();
        expect(resolveType('')).toBeNull();
    });
});

describe('sectorAffinity', () => {
    it('gives full credit to the same sector', () => {
        expect(sectorAffinity('fintech', 'fintech')).toBe(1);
    });

    it('gives partial credit to a neighbour, in both directions', () => {
        expect(sectorAffinity('fintech', 'bankacilik')).toBe(NEAR_WEIGHT);
        expect(sectorAffinity('bankacilik', 'fintech')).toBe(NEAR_WEIGHT);
    });

    it('gives nothing to unrelated sectors', () => {
        expect(sectorAffinity('fintech', 'insaat')).toBe(0);
    });

    // Bilinmeyen sektör 0 döner ama çağıran bunu "ilgisiz" saymamalı —
    // sectorFit.js bu ayrımı ayrı bir kova ile taşıyor.
    it('returns zero for an unknown sector', () => {
        expect(sectorAffinity(null, 'fintech')).toBe(0);
        expect(sectorAffinity('fintech', null)).toBe(0);
    });
});

describe('neighborsOf', () => {
    it('collects neighbours written in either direction, without duplicates', () => {
        const n = neighborsOf('fintech');
        expect(n).toContain('bankacilik');
        expect(n).toContain('sigorta');
        expect(new Set(n).size).toBe(n.length);
        expect(n).not.toContain('fintech');
    });

    it('is empty for an unknown sector', () => {
        expect(neighborsOf('yok-boyle-bir-sey')).toEqual([]);
    });
});

describe('option lists', () => {
    it('exposes every sector with a human label', () => {
        expect(SECTOR_OPTIONS.length).toBeGreaterThan(20);
        expect(SECTOR_OPTIONS.every((o) => o.id && o.label)).toBe(true);
        expect(MODEL_OPTIONS.map((o) => o.id).sort()).toEqual(['b2b', 'b2b2c', 'b2c']);
        expect(TYPE_OPTIONS.every((o) => o.id && o.label)).toBe(true);
    });

    it('labels a sector for display', () => {
        expect(sectorLabel('musteri deneyimi')).toBe('Müşteri Deneyimi / CX');
        expect(sectorLabel('yok')).toBe('');
    });

    // Her sektörün `near` listesi gerçek kimliklere işaret etmeli; yazım
    // hatası sessizce yakınlığı yok eder.
    it('has no dangling neighbour references', () => {
        const ids = new Set(SECTOR_OPTIONS.map((o) => o.id));
        for (const { id } of SECTOR_OPTIONS) {
            for (const n of neighborsOf(id)) {
                expect(ids.has(n), `${id} -> ${n}`).toBe(true);
            }
        }
    });
});
