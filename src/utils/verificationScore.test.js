// DOĞRULAMANIN SKORA ETKİSİ.
//
// Buradaki testlerin en önemlileri CEZA VERMEYENLER. Bir skor kesintisi
// adayın sıralamadaki yerini değiştiriyor; ölçemediğimiz ya da hiç
// bakmadığımız bir şey yüzünden kesinti yapmak, kendi eksiğimizin faturasını
// adaya kesmek olur.
//
// Katsayılar tahmin ve kalibrasyon bekliyor; bu yüzden testler birebir
// sayıları değil ARALIKLARI ve SIRALAMAYI doğruluyor.
import { describe, expect, it } from 'vitest';

import {
    verificationMultiplier,
    sectorMultiplier,
    verificationEffect,
    applyVerificationToScore,
    CONTRADICTION_FLOOR,
    UNVERIFIED_MIN_COMPANIES,
} from './verificationScore';
import { VERDICT } from './sectorFit';

const summary = (over = {}) => ({
    counts: { celiski: 0, dikkat: 0, bilgi: 0 },
    companies: { total: 0, dogrulandi: 0, dogrulanamadi: 0, celiski: 0 },
    lookupComplete: true,
    sector: null,
    ...over,
});

describe('verificationMultiplier — hiç bakmadığımız şey ceza değildir', () => {
    // Tarama yapılmamış adayı cezalandırmak, işi yapmamamızı onun kusuru
    // saymak olurdu.
    it('is neutral when verification never ran', () => {
        expect(verificationMultiplier(null).multiplier).toBe(1);
        expect(verificationMultiplier(undefined).reasons).toEqual([]);
    });

    it('is neutral for a clean report', () => {
        expect(verificationMultiplier(summary()).multiplier).toBe(1);
    });
});

describe('verificationMultiplier — çelişki', () => {
    it('cuts the score for a single contradiction', () => {
        const r = verificationMultiplier(summary({ counts: { celiski: 1, dikkat: 0, bilgi: 0 } }));
        expect(r.multiplier).toBeLessThan(1);
        expect(r.multiplier).toBeGreaterThanOrEqual(0.85);
        expect(r.reasons[0].code).toBe('celiski');
    });

    it('cuts more for more contradictions, with diminishing steps', () => {
        const one = verificationMultiplier(summary({ counts: { celiski: 1 } })).multiplier;
        const two = verificationMultiplier(summary({ counts: { celiski: 2 } })).multiplier;
        const three = verificationMultiplier(summary({ counts: { celiski: 3 } })).multiplier;
        expect(two).toBeLessThan(one);
        expect(three).toBeLessThan(two);
        // Azalan katkı: ikinciden üçüncüye düşüş, sıfırdan birinciye düşüşten küçük.
        expect(two - three).toBeLessThan(1 - one);
    });

    // Ceza sınırsız olmamalı: çelişki bir soru sebebidir, idam değil.
    it('never falls below the floor no matter how many contradictions', () => {
        const r = verificationMultiplier(summary({ counts: { celiski: 20 } }));
        expect(r.multiplier).toBeGreaterThanOrEqual(CONTRADICTION_FLOOR * 0.95);
    });
});

describe('verificationMultiplier — doğrulanamama oranı', () => {
    const companies = (total, unverified) => summary({
        companies: { total, dogrulandi: total - unverified, dogrulanamadi: unverified, celiski: 0 },
    });

    it('penalises only when most companies are unverified', () => {
        expect(verificationMultiplier(companies(4, 3)).multiplier).toBeLessThan(1);
        expect(verificationMultiplier(companies(4, 1)).multiplier).toBe(1);
    });

    // Tek doğrulanamayan şirket hiçbir şey yapmamalı — küçük şirket geçmişi
    // olan adayı sistematik cezalandırmanın en kısa yolu bu olurdu.
    it('ignores a small sample entirely', () => {
        expect(verificationMultiplier(companies(2, 2)).multiplier).toBe(1);
        expect(UNVERIFIED_MIN_COMPANIES).toBeGreaterThanOrEqual(3);
    });

    it('keeps the unverified penalty much smaller than a contradiction', () => {
        const unverified = 1 - verificationMultiplier(companies(5, 5)).multiplier;
        const contradiction = 1 - verificationMultiplier(summary({ counts: { celiski: 1 } })).multiplier;
        expect(unverified).toBeLessThan(contradiction);
    });

    // ASIL KORUMA: taranmayan şirket bizim eksiğimiz, adayın değil.
    it('does not charge the candidate for companies WE failed to scan', () => {
        const incomplete = { ...companies(5, 5), lookupComplete: false };
        expect(verificationMultiplier(incomplete).multiplier).toBe(1);
    });
});

describe('sectorMultiplier', () => {
    const withSector = (verdict, extra = {}) => summary({ sector: { verdict, ...extra } });

    // NÖTR NOKTA "KISMİ". İlk sürümde güçlü uyum 1.00 idi, yani derin sektör
    // deneyimi hiçbir şey kazandırmıyordu — yalnızca cezadan kurtarıyordu.
    it('rewards a strong sector fit instead of merely not punishing it', () => {
        expect(sectorMultiplier(withSector(VERDICT.STRONG)).multiplier).toBeGreaterThan(1);
        expect(sectorMultiplier(withSector(VERDICT.PARTIAL)).multiplier).toBe(1);
    });

    // Skoru yükselten bir kural da açıklanmalı: sessizce yükselen skor,
    // sessizce düşen kadar açıklanamazdır.
    it('explains the bonus, not just the penalty', () => {
        const r = sectorMultiplier(withSector(VERDICT.STRONG));
        expect(r.reasons).toHaveLength(1);
        expect(r.reasons[0].label).toContain('güçlü');
        expect(r.reasons[0].factor).toBeGreaterThan(1);
    });

    // Ödül ölçülü olmalı: sektör deneyimi bir avantaj, gereksinimlerin
    // yerine geçen bir şey değil.
    it('keeps the bonus modest', () => {
        expect(sectorMultiplier(withSector(VERDICT.STRONG)).multiplier).toBeLessThanOrEqual(1.1);
    });

    it('orders the verdicts sensibly', () => {
        const m = (v) => sectorMultiplier(withSector(v)).multiplier;
        expect(m(VERDICT.STRONG)).toBeGreaterThan(m(VERDICT.PARTIAL));
        expect(m(VERDICT.PARTIAL)).toBeGreaterThan(m(VERDICT.NEAR));
        expect(m(VERDICT.NEAR)).toBeGreaterThan(m(VERDICT.NONE));
    });

    // ÖLÇEMEDİĞİMİZ ŞEY CEZA DEĞİL. Aracın kendi eksiğini adaya fatura
    // etmesinin en sinsi hâli burası olurdu.
    it('is neutral when the sector could not be measured or no target is set', () => {
        expect(sectorMultiplier(withSector(VERDICT.UNMEASURED)).multiplier).toBe(1);
        expect(sectorMultiplier(withSector(VERDICT.NO_TARGET)).multiplier).toBe(1);
        expect(sectorMultiplier(summary()).multiplier).toBe(1);
        expect(sectorMultiplier(null).multiplier).toBe(1);
    });

    it('takes a little extra off when all the sector experience is old', () => {
        const fresh = sectorMultiplier(withSector(VERDICT.PARTIAL, { stale: false })).multiplier;
        const stale = sectorMultiplier(withSector(VERDICT.PARTIAL, { stale: true })).multiplier;
        expect(stale).toBeLessThan(fresh);
        expect(fresh - stale).toBeLessThan(0.05);
    });

    it('ignores an unknown verdict rather than guessing', () => {
        expect(sectorMultiplier(withSector('bilinmeyen-hüküm')).multiplier).toBe(1);
    });
});

describe('verificationEffect — iki eksen ayrı kalır', () => {
    it('keeps the two multipliers reportable on their own', () => {
        const e = verificationEffect(summary({
            counts: { celiski: 1 },
            sector: { verdict: VERDICT.NONE },
        }));
        expect(e.verification.multiplier).toBeLessThan(1);
        expect(e.sector.multiplier).toBeLessThan(1);
        expect(e.multiplier).toBeCloseTo(e.verification.multiplier * e.sector.multiplier, 6);
        expect(e.applied).toBe(true);
    });

    it('reports applied=false only when the score is genuinely untouched', () => {
        expect(verificationEffect(summary()).applied).toBe(false);
        expect(verificationEffect(null).applied).toBe(false);
    });

    // Önceden `multiplier < 1` idi ve skoru YÜKSELTEN etkiyi "etki yok" diye
    // raporluyordu; arayüz de sebebi hiç göstermezdi.
    it('reports applied=true for a bonus, not only for a penalty', () => {
        const e = verificationEffect(summary({ sector: { verdict: VERDICT.STRONG } }));
        expect(e.multiplier).toBeGreaterThan(1);
        expect(e.applied).toBe(true);
    });

    it('gives every deduction a human-readable reason', () => {
        const e = verificationEffect(summary({
            counts: { celiski: 2 },
            companies: { total: 5, dogrulandi: 0, dogrulanamadi: 5, celiski: 0 },
            sector: { verdict: VERDICT.NONE, stale: false },
        }));
        const all = [...e.verification.reasons, ...e.sector.reasons];
        expect(all.length).toBe(3);
        expect(all.every((r) => r.label && r.code && r.factor < 1)).toBe(true);
    });
});

describe('applyVerificationToScore', () => {
    it('leaves a score untouched when there is nothing to deduct', () => {
        expect(applyVerificationToScore(82, null)).toMatchObject({ score: 82, baseScore: 82, applied: false });
    });

    it('cuts proportionally, not by a flat amount', () => {
        const v = summary({ counts: { celiski: 1 } });
        const high = applyVerificationToScore(90, v);
        const low = applyVerificationToScore(20, v);
        // Aynı ORAN: düşük skorlu aday orantısız cezalandırılmıyor.
        expect(high.baseScore - high.score).toBeGreaterThan(low.baseScore - low.score);
        expect(high.score / 90).toBeCloseTo(low.score / 20, 1);
    });

    it('keeps the base score so the UI can show the difference', () => {
        const r = applyVerificationToScore(80, summary({ counts: { celiski: 1 } }));
        expect(r.baseScore).toBe(80);
        expect(r.score).toBeLessThan(80);
    });

    it('survives a missing or malformed score', () => {
        expect(applyVerificationToScore(null, null).score).toBe(0);
        expect(applyVerificationToScore('abc', null).score).toBe(0);
    });
});

// ── Sektör ödülünün tavanı ──────────────────────────────────────────────────
// Çarpan 1'in üstüne çıkabildiği için skor 100'ü aşabilirdi; yüzde varsayan
// tüm arayüz saçmalardı.
describe('tavan', () => {
    const strong = { counts: { celiski: 0 }, companies: { total: 0 }, lookupComplete: true, sector: { verdict: VERDICT.STRONG } };

    it('never lets the sector bonus push a score past 100', () => {
        expect(applyVerificationToScore(98, strong).score).toBe(100);
        expect(applyVerificationToScore(100, strong).score).toBe(100);
    });

    it('does let the bonus lift a mid-range score', () => {
        const r = applyVerificationToScore(80, strong);
        expect(r.score).toBeGreaterThan(80);
        expect(r.baseScore).toBe(80);
    });

    it('never goes below zero', () => {
        expect(applyVerificationToScore(0, { counts: { celiski: 5 } }).score).toBe(0);
    });
});
