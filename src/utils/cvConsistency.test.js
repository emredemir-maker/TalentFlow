// TUTARLILIK DENETİMİ — bir bayrak, bir insan hakkında şüphedir.
//
// Bu testlerin en önemlileri BAYRAK ÜRETMEYENLER. Yanlış pozitif burada
// ucuz değil: "beyan ettiğinden az deneyimi var" diyen bir satır, aslında
// bizim CV ayrıştırıcımızın iki kaydı kaçırmasından doğmuşsa, sistem kendi
// eksiğini adayın yalanı gibi gösterir.
//
// Bu yüzden kapsam (coverage) testleri en az çelişki testleri kadar önemli.
import { describe, expect, it } from 'vitest';

import {
    seniorityBand,
    extractRequiredYears,
    measureExperiences,
    checkAgainstRequirement,
    buildConsistencyReport,
    SEVERITY,
} from './cvConsistency';

const TODAY = { year: 2026, month: 8 };

const exp = (company, role, duration) => ({ company, role, duration, desc: '' });

const report = (candidate, options = {}) =>
    buildConsistencyReport(candidate, { today: TODAY, ...options });

const idsOf = (r) => r.flags.map((f) => f.id);
const byId = (r, id) => r.flags.find((f) => f.id === id);

describe('seniorityBand', () => {
    it('places common titles on the ladder', () => {
        expect(seniorityBand('Stajyer')).toBe(0);
        expect(seniorityBand('Junior Developer')).toBe(1);
        expect(seniorityBand('Yazılım Uzmanı')).toBe(2);
        expect(seniorityBand('Senior Data Analyst')).toBe(3);
        expect(seniorityBand('Growth Manager')).toBe(4);
        expect(seniorityBand('Marketing Director')).toBe(5);
        expect(seniorityBand('CTO')).toBe(6);
    });

    // "Genel Müdür" içinde "müdür" geçiyor — tepe yönetim, yönetici basamağı
    // değil. Merdiven yukarıdan aşağı eşleşmezse bu kayıt yanlış basamağa düşer.
    it('does not let a lower rung swallow a higher title', () => {
        expect(seniorityBand('Genel Müdür')).toBe(6);
        expect(seniorityBand('Kurucu Ortak')).toBe(6);
    });

    // GERÇEK HATA: "Marketing Dire(cto)r" içinde "cto" geçiyor ve alt dize
    // aramasıyla bir pazarlama direktörü CTO sayılıyordu. Kısaltmalar tam
    // kelime olarak eşleşmek zorunda.
    it('does not read an acronym out of the middle of a word', () => {
        expect(seniorityBand('Marketing Director')).toBe(5);
        expect(seniorityBand('Logistics Coordinator')).toBe(2);
        expect(seniorityBand('Ürün Direktörü')).toBe(5);
    });

    it('still reads acronyms that stand on their own', () => {
        expect(seniorityBand('CTO')).toBe(6);
        expect(seniorityBand('VP of Engineering')).toBe(6);
        expect(seniorityBand('Sr. Backend Developer')).toBe(3);
        expect(seniorityBand('Jr. Analyst')).toBe(1);
    });

    it('falls back to mid-level for titles it does not know', () => {
        expect(seniorityBand('Büyüme Simyacısı')).toBe(2);
        expect(seniorityBand('')).toBe(2);
    });
});

describe('extractRequiredYears', () => {
    it('reads the usual phrasings', () => {
        expect(extractRequiredYears('En az 5 yıl deneyim')).toBe(5);
        expect(extractRequiredYears('5+ yıl SaaS tecrübesi')).toBe(5);
        expect(extractRequiredYears('3 sene benzer pozisyonda')).toBe(3);
        expect(extractRequiredYears('at least 4 years experience')).toBe(4);
    });

    it('takes the lower bound of a range', () => {
        expect(extractRequiredYears('3-5 yıl deneyim')).toBe(3);
    });

    // "İlan yıl istemiyor" ile "aday sıfır yıl karşılıyor" bambaşka iki şey.
    it('returns null, not zero, when the posting asks for no years', () => {
        expect(extractRequiredYears('SQL ve Python bilgisi')).toBeNull();
        expect(extractRequiredYears('')).toBeNull();
    });
});

describe('measureExperiences', () => {
    it('reports full coverage when every date parses', () => {
        const m = measureExperiences([
            exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2021'),
            exp('B A.Ş.', 'Senior Developer', 'Oca 2022 - Ara 2023'),
        ], TODAY);
        expect(m.coverage).toBe('full');
        expect(m.totalMonths).toBe(48);
        expect(m.measuredCount).toBe(2);
    });

    it('flags partial coverage when some dates are unreadable', () => {
        const m = measureExperiences([
            exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2021'),
            exp('B A.Ş.', 'Developer', 'uzun yıllar'),
        ], TODAY);
        expect(m.coverage).toBe('partial');
        expect(m.unmeasuredCount).toBe(1);
    });

    it('reports no coverage for an empty history', () => {
        expect(measureExperiences([], TODAY).coverage).toBe('none');
        expect(measureExperiences(null, TODAY).coverage).toBe('none');
    });

    // Paralel görevler toplanırsa 4 yıllık kariyer 8 yıl görünür.
    it('counts overlapping roles once in the total', () => {
        const m = measureExperiences([
            exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2023'),
            exp('B Danışmanlık', 'Danışman', 'Oca 2021 - Ara 2022'),
        ], TODAY);
        expect(m.totalMonths).toBe(48);
    });
});

describe('buildConsistencyReport — the Erkut case', () => {
    // Beyanı 6 yıl, kayıtları 2 yıl. Skor 90 verilmişti; sistemin bunu
    // söylememesi asıl sorundu.
    it('contradicts a claim that the listed roles do not support', () => {
        const r = report({
            experience: 6,
            experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
        });
        const f = byId(r, 'beyan-fazla');
        expect(f.severity).toBe(SEVERITY.CONTRADICTION);
        expect(f.detail).toContain('2 yıl');
        expect(f.question).toBeTruthy();
    });

    // ASIL TEHLİKE: eksik ayrıştırma, adayın yalanı gibi görünmemeli.
    it('downgrades the same finding to attention when coverage is partial', () => {
        const r = report({
            experience: 6,
            experiences: [
                exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026'),
                exp('Eski Şirket', 'Analyst', 'bilinmiyor'),
            ],
        });
        const f = byId(r, 'beyan-fazla');
        expect(f.severity).toBe(SEVERITY.ATTENTION);
        expect(f.detail).toContain('okunamadı');
    });

    it('stays silent when the claim matches the records', () => {
        const r = report({
            experience: 4,
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2021'),
                exp('B A.Ş.', 'Senior Developer', 'Oca 2022 - Ara 2023'),
            ],
        });
        expect(idsOf(r)).not.toContain('beyan-fazla');
    });

    // Bir yıllık sapma gürültüdür — CV'ler kısa görevleri atlar.
    it('tolerates a small gap rather than crying wolf', () => {
        const r = report({
            experience: 5,
            experiences: [exp('A Ltd', 'Developer', 'Oca 2022 - Ara 2025')],
        });
        expect(idsOf(r)).not.toContain('beyan-fazla');
    });
});

describe('buildConsistencyReport — other findings', () => {
    it('reports overlapping employment as something to ask about, not a lie', () => {
        const r = report({
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2023'),
                exp('B Danışmanlık', 'Danışman', 'Oca 2021 - Ara 2022'),
            ],
        });
        const f = byId(r, 'cakisan-donem');
        expect(f.severity).toBe(SEVERITY.ATTENTION);
        expect(f.question).toContain('danışmanlık');
    });

    // Devir teslim dönemleri normalde birkaç ay çakışma üretir.
    it('ignores a short overlap', () => {
        const r = report({
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Mar 2022'),
                exp('B A.Ş.', 'Developer', 'Oca 2022 - Ara 2023'),
            ],
        });
        expect(idsOf(r)).not.toContain('cakisan-donem');
    });

    it('notices a two-rung title jump inside two years', () => {
        const r = report({
            experiences: [
                exp('A Ltd', 'Junior Analyst', 'Oca 2024 - Ara 2024'),
                exp('B A.Ş.', 'Marketing Director', 'Oca 2025 - Ağu 2026'),
            ],
        });
        expect(byId(r, 'unvan-sicramasi').severity).toBe(SEVERITY.ATTENTION);
    });

    it('accepts a normal one-rung promotion', () => {
        const r = report({
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2022'),
                exp('B A.Ş.', 'Senior Developer', 'Oca 2023 - Ara 2025'),
            ],
        });
        expect(idsOf(r)).not.toContain('unvan-sicramasi');
    });

    it('treats a future end date as a hard contradiction', () => {
        const r = report({
            experiences: [exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2029')],
        });
        expect(byId(r, 'gelecek-tarih').severity).toBe(SEVERITY.CONTRADICTION);
    });

    it('does not mistake an ongoing role for a future date', () => {
        const r = report({
            experiences: [exp('A Ltd', 'Developer', 'Oca 2020 - Halen')],
        });
        expect(idsOf(r)).not.toContain('gelecek-tarih');
    });
});

describe('buildConsistencyReport — honesty about its own measurement', () => {
    it('says out loud when it could not measure anything', () => {
        const r = report({ experience: 8, experiences: [] });
        expect(byId(r, 'olcum-yapilamadi').severity).toBe(SEVERITY.INFO);
        // Ölçüm yoksa çelişki de iddia edilmez.
        expect(idsOf(r)).not.toContain('beyan-fazla');
        expect(r.counts.celiski).toBe(0);
    });

    it('warns that the numbers below rest on partial data', () => {
        const r = report({
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2021'),
                exp('B A.Ş.', 'Developer', 'bir süre'),
            ],
        });
        expect(byId(r, 'olcum-eksik').detail).toContain('1 tanesinin');
    });

    it('produces nothing at all for a clean, complete CV', () => {
        const r = report({
            experience: 6,
            experiences: [
                exp('A Ltd', 'Developer', 'Oca 2020 - Ara 2022'),
                exp('B A.Ş.', 'Senior Developer', 'Oca 2023 - Ağu 2026'),
            ],
        });
        expect(r.flags).toEqual([]);
        expect(r.questions).toEqual([]);
    });
});

describe('checkAgainstRequirement', () => {
    const measured = (list) => measureExperiences(list, TODAY);

    it('flags a candidate well under the posted year threshold', () => {
        const m = measured([exp('A Ltd', 'Developer', 'Oca 2025 - Ağu 2026')]);
        expect(checkAgainstRequirement(m, 5).severity).toBe(SEVERITY.ATTENTION);
    });

    it('lets a near miss pass — 4 yıl 8 ay is arguable for a 5-year posting', () => {
        const m = measured([exp('A Ltd', 'Developer', 'Oca 2022 - Ağu 2026')]);
        expect(checkAgainstRequirement(m, 5)).toBeNull();
    });

    it('does nothing without a threshold or without a measurement', () => {
        const m = measured([exp('A Ltd', 'Developer', 'Oca 2025 - Ağu 2026')]);
        expect(checkAgainstRequirement(m, null)).toBeNull();
        expect(checkAgainstRequirement(measured([]), 5)).toBeNull();
    });
});

describe('report shape', () => {
    it('sorts contradictions above attention above info', () => {
        const r = report({
            experience: 9,
            experiences: [
                exp('A Ltd', 'Junior Analyst', 'Oca 2024 - Ara 2024'),
                exp('B A.Ş.', 'Marketing Director', 'Oca 2025 - Ara 2029'),
            ],
        });
        const ranks = r.flags.map((f) => f.severity);
        expect(ranks[0]).toBe(SEVERITY.CONTRADICTION);
        expect(ranks).toEqual([...ranks].sort((a, b) =>
            ['celiski', 'dikkat', 'bilgi'].indexOf(a) - ['celiski', 'dikkat', 'bilgi'].indexOf(b)));
    });

    // Modülün asıl çıktısı bir puan değil, sorulacak sorular.
    it('turns every actionable flag into an interview question', () => {
        const r = report({
            experience: 9,
            experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
        });
        expect(r.questions.length).toBeGreaterThan(0);
        expect(r.questions.every((q) => typeof q === 'string' && q.length > 0)).toBe(true);
    });

    it('does not blow up on a malformed candidate', () => {
        expect(() => report(null)).not.toThrow();
        expect(() => report({ experiences: [null, {}, { duration: 5 }] })).not.toThrow();
    });
});
