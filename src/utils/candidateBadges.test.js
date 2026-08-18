// ADAY ROZETLERİ.
//
// Bir rozet, listedeki adayın yanına basılan bir yargıdır ve işe alımcı çoğu
// zaman Doğrulama sekmesini açmadan ona bakarak eleyecek. Bu yüzden en önemli
// testler ROZET BASMAYANLAR: doğrulama hiç çalışmadıysa sektör rozeti çıkmaz,
// taraması eksik kalan aday "teyitsiz" damgası yemez.
import { describe, expect, it } from 'vitest';

import { buildCandidateBadges, isVerified, TONE } from './candidateBadges';
import { VERDICT } from './sectorFit';

const TODAY = { year: 2026, month: 8 };

const exp = (company, role, duration) => ({ company, role, duration, desc: '' });

const candidate = (over = {}) => ({
    name: 'Aday Kişi',
    position: 'Growth Manager',
    experiences: [exp('A Ltd', 'Growth Manager', 'Oca 2020 - Ağu 2026')],
    ...over,
});

const badges = (c, opts = {}) => buildCandidateBadges(c, { today: TODAY, ...opts });
const idsOf = (list) => list.map((b) => b.id);

describe('Katman 1 rozetleri — canlı ve bedava', () => {
    it('flags a measured contradiction', () => {
        const list = badges(candidate({
            experience: 8,
            experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
        }));
        const b = list.find((x) => x.id === 'celiski');
        expect(b.tone).toBe(TONE.RED);
        expect(b.title).toContain('Doğrulama');
    });

    it('counts multiple contradictions in the label', () => {
        const list = badges(candidate({
            experience: 9,
            experiences: [exp('X', 'Dev', 'Oca 2025 - Ara 2029')],
        }));
        expect(list.find((x) => x.id === 'celiski').label).toMatch(/\d+ çelişki/);
    });

    it('flags thin experience against the posting threshold', () => {
        const list = badges(
            candidate({ experiences: [exp('A', 'Dev', 'Oca 2025 - Ağu 2026')] }),
            { requiredYears: 5 }
        );
        expect(idsOf(list)).toContain('tecrube-eksik');
    });

    // Rozetler CV'den canlı hesaplanıyor; doğrulama çalıştırılmasa da çıkar.
    it('does not need a stored verification to work', () => {
        const list = badges(candidate({
            experience: 8,
            experiences: [exp('Tek Şirket', 'Dev', 'Eyl 2024 - Ağu 2026')],
        }));
        expect(list.length).toBeGreaterThan(0);
    });

    it('stays silent for a clean CV', () => {
        expect(badges(candidate({ experience: 6 }))).toEqual([]);
    });
});

describe('alan ile sektör ayrı rozetler', () => {
    // İnşaattan gelen bir Growth Manager ALAN olarak uyumlu olabilir ama
    // SEKTÖR olarak değil. Tek rozete indirmek hangisinin uymadığını gizlerdi.
    it('reports sector mismatch separately from job-domain mismatch', () => {
        const list = badges(candidate({
            verification: { at: 'x', sector: { verdict: VERDICT.NONE } },
        }));
        expect(idsOf(list)).toContain('sektor-disi');
        expect(idsOf(list)).not.toContain('alan-disi');
    });

    it('flags a job-domain mismatch when a position is selected', () => {
        const list = badges(
            candidate({ position: 'Muhasebe Uzmanı', experiences: [exp('A', 'Muhasebe Uzmanı', 'Oca 2020 - Ağu 2026')] }),
            { position: { title: 'Senior Frontend Developer', requirements: ['React', 'TypeScript'] } }
        );
        expect(idsOf(list)).toContain('alan-disi');
    });

    it('does not judge the job domain when no position is selected', () => {
        expect(idsOf(badges(candidate()))).not.toContain('alan-disi');
    });
});

// ── CANLIDA GÖRÜLEN HATA ────────────────────────────────────────────────────
// Hasan Asgar'ın çelişkisi ŞİRKET katmanından geliyordu (şirket kuruluşundan
// önceki başlangıç tarihi). Skor bu yüzden düşüyordu ama listede yalnızca
// "Sektör dışı" görünüyordu — sistem adayı bir sebeple aşağı çekiyor ve o
// sebebi göstermiyordu.
//
// Canlı hesap yalnızca Katman 1'i görüyor; şirket çelişkileri ağ çağrısı
// gerektirdiği için sadece kayıtlı özette duruyor.
describe('şirket katmanından gelen çelişki', () => {
    it('shows a contradiction badge that only the stored summary knows about', () => {
        const list = badges(candidate({
            // CV'nin kendi içinde tutarlı — canlı hesap hiçbir çelişki bulmaz
            experience: 6,
            experiences: [exp('Asgar Digital', 'Growth Manager', 'Oca 2020 - Ağu 2026')],
            verification: { at: 'x', counts: { celiski: 1, dikkat: 2, bilgi: 0 }, sector: { verdict: VERDICT.NONE } },
        }));
        const b = list.find((x) => x.id === 'celiski');
        expect(b).toBeTruthy();
        expect(b.title).toContain('şirket doğrulamasından');
    });

    // Rozetin gösterdiği sayı ile skorun cezalandırdığı sayı ayrışamaz.
    it('reports the same count the score multiplier penalises', () => {
        const list = badges(candidate({
            verification: { at: 'x', counts: { celiski: 3 } },
        }));
        expect(list.find((x) => x.id === 'celiski').label).toBe('3 çelişki');
    });

    // TOPLAMA DEĞİL: kayıtlı sayaç tarama anındaki Katman 1 çelişkilerini
    // zaten içeriyor; toplasaydık aynı çelişki iki kez sayılırdı.
    it('does not double-count a contradiction present in both sources', () => {
        const list = badges(candidate({
            experience: 8,
            experiences: [exp('Tek Şirket', 'Dev', 'Eyl 2024 - Ağu 2026')],
            verification: { at: 'x', counts: { celiski: 1 } },
        }));
        expect(list.find((x) => x.id === 'celiski').label).toBe('Çelişki');
    });

    // CV tarama sonrası değiştiyse yeni Katman 1 çelişkileri de görünmeli.
    it('prefers the live count when the CV has gained contradictions since the scan', () => {
        const list = badges(candidate({
            experience: 20,
            experiences: [exp('Tek Şirket', 'Dev', 'Eyl 2024 - Ağu 2026'), exp('X', 'Dev', 'Oca 2020 - Ara 2029')],
            verification: { at: 'x', counts: { celiski: 1 } },
        }));
        expect(list.find((x) => x.id === 'celiski').label).toBe('2 çelişki');
    });

    // Listede ilan seçili değilken yıl eşiği hesaplanamaz; tarama sırasında
    // ilan bağlamı vardıysa kayıttan gelmeli.
    it('reads flag ids from the stored summary too', () => {
        const list = badges(candidate({
            verification: { at: 'x', counts: { celiski: 0 }, flagIds: ['ilan-yil-esigi'] },
        }));
        expect(idsOf(list)).toContain('tecrube-eksik');
    });
});

describe('sektör rozetleri — yalnızca kayıtlı özetten', () => {
    const withSector = (sector) => candidate({ verification: { at: 'x', sector } });

    it('distinguishes no-fit from neighbour-fit from stale', () => {
        expect(idsOf(badges(withSector({ verdict: VERDICT.NONE })))).toContain('sektor-disi');
        expect(idsOf(badges(withSector({ verdict: VERDICT.NEAR })))).toContain('sektor-komsu');
        expect(idsOf(badges(withSector({ verdict: VERDICT.PARTIAL, stale: true })))).toContain('sektor-bayat');
    });

    it('says nothing for a strong fit', () => {
        expect(badges(withSector({ verdict: VERDICT.STRONG }))).toEqual([]);
    });

    // YOKLUK OLUMSUZLUK DEĞİLDİR: ölçülemeyen ya da hedefi tanımsız sektör
    // rozet üretmez.
    it('is silent when the sector could not be measured or has no target', () => {
        expect(badges(withSector({ verdict: VERDICT.UNMEASURED }))).toEqual([]);
        expect(badges(withSector({ verdict: VERDICT.NO_TARGET }))).toEqual([]);
    });

    it('produces no sector badge at all when verification never ran', () => {
        const list = badges(candidate({ verification: undefined }));
        expect(idsOf(list).some((id) => id.startsWith('sektor'))).toBe(false);
    });
});

describe('şirket teyidi rozeti', () => {
    const withCompanies = (total, unverified, lookupComplete = true) => candidate({
        verification: {
            at: 'x',
            lookupComplete,
            companies: { total, dogrulandi: total - unverified, dogrulanamadi: unverified, celiski: 0 },
        },
    });

    it('flags a candidate whose companies mostly could not be confirmed', () => {
        const b = badges(withCompanies(4, 3)).find((x) => x.id === 'sirket-teyitsiz');
        expect(b.tone).toBe(TONE.SLATE);
        // Rozetin kendisi suçlamayı reddetmeli.
        expect(b.title).toContain('var olmadığı anlamına gelmez');
    });

    it('ignores a single unconfirmed company', () => {
        expect(idsOf(badges(withCompanies(4, 1)))).not.toContain('sirket-teyitsiz');
        expect(idsOf(badges(withCompanies(1, 1)))).not.toContain('sirket-teyitsiz');
    });

    // ASIL KORUMA: atlanan şirket bizim kısıtımız, adayın kusuru değil.
    it('does not brand a candidate whose scan WE left incomplete', () => {
        expect(idsOf(badges(withCompanies(5, 5, false)))).not.toContain('sirket-teyitsiz');
    });
});

describe('sıra ve sınır', () => {
    it('puts the most serious badge first', () => {
        const list = badges(candidate({
            experience: 9,
            experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
            verification: { at: 'x', sector: { verdict: VERDICT.NONE } },
        }));
        expect(list[0].id).toBe('celiski');
    });

    it('caps the number of badges when asked', () => {
        const list = badges(
            candidate({
                experience: 9,
                experiences: [exp('Tek Şirket', 'Growth Specialist', 'Eyl 2024 - Ağu 2026')],
                verification: { at: 'x', sector: { verdict: VERDICT.NONE } },
            }),
            { max: 2 }
        );
        expect(list).toHaveLength(2);
    });

    it('does not throw on a malformed candidate', () => {
        expect(buildCandidateBadges(null)).toEqual([]);
        expect(() => badges({ experiences: [null, {}] })).not.toThrow();
        expect(() => badges({ verification: {} })).not.toThrow();
    });
});

describe('isVerified', () => {
    it('reports whether verification has ever run', () => {
        expect(isVerified({ verification: { at: '2026-08-18T00:00:00Z' } })).toBe(true);
        expect(isVerified({ verification: {} })).toBe(false);
        expect(isVerified({})).toBe(false);
        expect(isVerified(null)).toBe(false);
    });
});
