// SEKTÖR UYUMU — ölçemediğimiz şeyi olumsuz sonuç gibi göstermemek.
//
// En kritik testler paydayla ilgili. Sektörü çözümlenemeyen bir şirketi
// "ilgisiz sektör" saymak, adayın kariyerinin yarısını sessizce aleyhine
// yazar. Bilinmeyen ay, paydaya girmez.
//
// İkinci kritik grup: aynı ayda iki görev. Süreleri toplamak kariyeri iki
// katına çıkarır; her ay tek kez sayılmalı.
import { describe, expect, it } from 'vitest';

import {
    measureSectorFit,
    buildSectorEntries,
    describeSectorFit,
    normalizeTarget,
    VERDICT,
    RECENT_MONTHS,
} from './sectorFit';
import { parseDuration, toWindow } from './cvDates';

const TODAY = { year: 2026, month: 8 };

/** CV satırı taklidi — measureExperiences çıktısının ilgili alanları. */
const row = (company, duration, role = 'Uzman') => ({
    company,
    role,
    duration,
    window: toWindow(parseDuration(duration), TODAY),
});

const entry = (company, duration, info = {}) => ({
    ...row(company, duration),
    sector: info.sector ?? null,
    model: info.model ?? null,
    type: info.type ?? null,
});

// Infoset: B2B SaaS, müşteri iletişimi alanı.
const TARGET = { sector: 'musteri deneyimi', model: 'b2b', type: 'saas' };

const fit = (entries, target = TARGET) => measureSectorFit(entries, target, { today: TODAY });

describe('normalizeTarget', () => {
    it('keeps missing axes null instead of inventing them', () => {
        expect(normalizeTarget({ sector: 'fintech' })).toEqual({ sector: 'fintech', model: null, type: null });
    });

    it('returns null when nothing is configured', () => {
        expect(normalizeTarget({})).toBeNull();
        expect(normalizeTarget(null)).toBeNull();
    });
});

describe('measureSectorFit — verdicts', () => {
    it('calls it strong when the target sector is substantial and recent', () => {
        const r = fit([
            entry('Desk360', 'Oca 2023 - Ağu 2026', { sector: 'musteri deneyimi', model: 'b2b', type: 'saas' }),
        ]);
        expect(r.verdict).toBe(VERDICT.STRONG);
        expect(r.exactMonths).toBe(44);
        expect(r.share).toBe(1);
    });

    // "Sektör deneyimi var ama eski" ile "hiç yok" aynı şey değil — işe
    // alımcının bilmesi gereken tam da bu fark.
    it('separates stale sector experience from none at all', () => {
        const r = fit([
            entry('Eski CX Ltd', 'Oca 2015 - Ara 2017', { sector: 'musteri deneyimi' }),
            entry('Yeni İnşaat', 'Oca 2022 - Ağu 2026', { sector: 'insaat' }),
        ]);
        expect(r.exactMonths).toBe(36);
        expect(r.recentExactMonths).toBe(0);
        expect(r.stale).toBe(true);
        expect(r.verdict).toBe(VERDICT.PARTIAL);
    });

    it('reports a neighbouring sector as its own verdict', () => {
        const r = fit([
            entry('Turkcell', 'Oca 2022 - Ağu 2026', { sector: 'telekomunikasyon' }),
        ]);
        expect(r.verdict).toBe(VERDICT.NEAR);
        expect(r.nearMonths).toBeGreaterThan(0);
        expect(r.exactMonths).toBe(0);
    });

    it('reports no fit when nothing is close', () => {
        const r = fit([entry('Yapı A.Ş.', 'Oca 2020 - Ağu 2026', { sector: 'insaat' })]);
        expect(r.verdict).toBe(VERDICT.NONE);
        expect(r.unrelatedMonths).toBeGreaterThan(0);
    });

    // Üç aylık bir dokunuş "sektör deneyimi" değildir.
    it('does not call a three-month brush with the sector experience', () => {
        const r = fit([
            entry('CX Ltd', 'Oca 2026 - Mar 2026', { sector: 'musteri deneyimi' }),
            entry('Yapı A.Ş.', 'Oca 2020 - Ara 2025', { sector: 'insaat' }),
        ]);
        expect(r.verdict).toBe(VERDICT.NONE);
    });

    it('says the target is missing rather than scoring zero', () => {
        const r = measureSectorFit([entry('A', 'Oca 2020 - Ara 2021', { sector: 'fintech' })], null, { today: TODAY });
        expect(r.verdict).toBe(VERDICT.NO_TARGET);
    });
});

describe('measureSectorFit — honesty about coverage', () => {
    // ASIL TEHLİKE: çözümlenemeyen şirket, aleyhte veri gibi görünmemeli.
    it('keeps unresolved companies out of the denominator', () => {
        const r = fit([
            entry('CX Ltd', 'Oca 2023 - Ağu 2026', { sector: 'musteri deneyimi' }),
            entry('Bilinmeyen Ltd', 'Oca 2019 - Ara 2022'), // sektör çözülemedi
        ]);
        expect(r.coverage).toBe('partial');
        expect(r.unknownMonths).toBe(48);
        // 44 bilinen ayın tamamı hedef sektörde — oran 1, 44/92 değil.
        expect(r.share).toBe(1);
    });

    it('reports unmeasured when no company could be resolved', () => {
        const r = fit([entry('Bilinmeyen Ltd', 'Oca 2020 - Ağu 2026')]);
        expect(r.verdict).toBe(VERDICT.UNMEASURED);
        expect(r.coverage).toBe('none');
        expect(r.share).toBeNull();
    });

    it('handles an empty history without throwing', () => {
        expect(() => fit([])).not.toThrow();
        expect(fit([]).verdict).toBe(VERDICT.UNMEASURED);
        expect(measureSectorFit(null, TARGET, { today: TODAY }).careerMonths).toBe(0);
    });
});

describe('measureSectorFit — overlapping roles', () => {
    // Süreleri toplamak kariyeri iki katına çıkarır.
    it('counts a month once even when two roles cover it', () => {
        const r = fit([
            entry('A Ltd', 'Oca 2022 - Ara 2023', { sector: 'insaat' }),
            entry('B Ltd', 'Oca 2022 - Ara 2023', { sector: 'insaat' }),
        ]);
        expect(r.careerMonths).toBe(24);
    });

    // Aynı ayda hem hedef sektörde hem alakasız bir işte çalışıldıysa, aday o
    // ay hedef sektöre DOKUNMUŞTUR.
    it('takes the best affinity available in a shared month', () => {
        const r = fit([
            entry('Yapı A.Ş.', 'Oca 2022 - Ara 2023', { sector: 'insaat' }),
            entry('CX Danışmanlık', 'Oca 2022 - Ara 2023', { sector: 'musteri deneyimi' }),
        ]);
        expect(r.exactMonths).toBe(24);
        expect(r.unrelatedMonths).toBe(0);
    });
});

describe('measureSectorFit — model and type axes', () => {
    // Trendyol da Infoset de "yazılım" sayılabilir; ayırt eden kime satıldığı.
    it('measures business model and revenue type separately from the sector', () => {
        const r = fit([
            entry('Bir B2B SaaS', 'Oca 2023 - Ağu 2026', { sector: 'fintech', model: 'b2b', type: 'saas' }),
        ]);
        expect(r.exactMonths).toBe(0);
        expect(r.modelMonths).toBe(44);
        expect(r.typeMonths).toBe(44);
    });

    it('does not credit an axis the target leaves undefined', () => {
        const r = measureSectorFit(
            [entry('A', 'Oca 2023 - Ağu 2026', { sector: 'musteri deneyimi', model: 'b2b' })],
            { sector: 'musteri deneyimi' },
            { today: TODAY }
        );
        expect(r.modelMonths).toBe(0);
    });
});

describe('buildSectorEntries', () => {
    it('joins CV rows with resolved company intel', () => {
        const rows = [row('Infoset', 'Oca 2023 - Ağu 2026'), row('Bilinmeyen', 'Oca 2020 - Ara 2022')];
        const entries = buildSectorEntries(rows, { Infoset: { sector: 'musteri deneyimi', model: 'b2b', type: 'saas' } });
        expect(entries[0].sector).toBe('musteri deneyimi');
        expect(entries[1].sector).toBeNull();
    });

    it('accepts a Map as well as a plain object', () => {
        const entries = buildSectorEntries(
            [row('Infoset', 'Oca 2023 - Ağu 2026')],
            new Map([['Infoset', { sector: 'musteri deneyimi' }]])
        );
        expect(entries[0].sector).toBe('musteri deneyimi');
    });

    it('survives an empty intel lookup', () => {
        const entries = buildSectorEntries([row('A', 'Oca 2020 - Ara 2021')], null);
        expect(entries[0].sector).toBeNull();
    });
});

describe('describeSectorFit', () => {
    it('speaks in measured quantities, not adjectives', () => {
        const s = describeSectorFit(fit([
            entry('Desk360', 'Oca 2023 - Ağu 2026', { sector: 'musteri deneyimi' }),
        ]));
        expect(s).toContain('Müşteri Deneyimi / CX');
        expect(s).toMatch(/\d+ yıl|\d+ ay/);
        expect(s).toContain('%100');
    });

    it('says the experience is old when it is old', () => {
        const s = describeSectorFit(fit([
            entry('Eski CX', 'Oca 2015 - Ara 2017', { sector: 'musteri deneyimi' }),
        ]));
        expect(s).toContain(`son ${RECENT_MONTHS / 12} yıldan eski`);
    });

    it('points at the missing configuration instead of reporting zero', () => {
        expect(describeSectorFit({ verdict: VERDICT.NO_TARGET })).toContain('Hedef sektör tanımlı değil');
        expect(describeSectorFit(null)).toContain('Hedef sektör tanımlı değil');
    });

    it('admits when the measurement is partial', () => {
        const s = describeSectorFit(fit([
            entry('CX Ltd', 'Oca 2023 - Ağu 2026', { sector: 'musteri deneyimi' }),
            entry('Bilinmeyen', 'Oca 2019 - Ara 2022'),
        ]));
        expect(s).toContain('çözümlenemedi');
    });
});
