// ADAY ROZETLERİ.
//
// Bir rozet, listedeki adayın yanına basılan bir yargıdır ve işe alımcı çoğu
// zaman Doğrulama sekmesini açmadan ona bakarak eleyecek. Bu yüzden en önemli
// testler ROZET BASMAYANLAR: doğrulama hiç çalışmadıysa sektör rozeti çıkmaz,
// taraması eksik kalan aday "teyitsiz" damgası yemez.
import { describe, expect, it } from 'vitest';

import { buildCandidateBadges, isVerified, TONE, sectorBucket, verificationBucket, verificationCounts } from './candidateBadges';
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

// ── CANLIDA GÖRÜLEN İKİNCİ EKSİK ────────────────────────────────────────────
// Hasan Asgar'ın raporunda 4 DİKKAT maddesi vardı (çakışan dönem, hızlı unvan
// yükselişi, iki kez unvan/ölçek uyumsuzluğu) ama listede tek rozet bile
// çıkmıyordu: yalnızca çelişki rozetleniyordu.
//
// Gerçek hayatta çelişki nadir, dikkat maddesi sık — yani aracın en çok iş
// yaptığı seviye tamamen görünmezdi.
describe('dikkat seviyesindeki bulgular', () => {
    it('shows an attention counter the list previously hid entirely', () => {
        const list = badges(candidate({
            experience: 6,
            experiences: [exp('Pawn Interactive', 'CEO / Co-Founder', 'Oca 2021 - Halen')],
            verification: { at: 'x', counts: { celiski: 0, dikkat: 4, bilgi: 0 }, sector: { verdict: VERDICT.NONE } },
        }));
        const b = list.find((x) => x.id === 'dikkat');
        expect(b.label).toBe('4 dikkat');
        expect(b.tone).toBe(TONE.AMBER);
        // Rozet eleme sebebi olmadığını söylemeli.
        expect(b.title).toContain('Eleme sebebi değil');
    });

    // Ekranlar ayrışamaz: paneldeki DİKKAT sayacı ile rozet aynı sayı.
    it('reports the same number the verification panel shows', () => {
        const list = badges(candidate({ verification: { at: 'x', counts: { dikkat: 7 } } }));
        expect(list.find((x) => x.id === 'dikkat').label).toBe('7 dikkat');
    });

    it('says nothing when there is no attention finding', () => {
        expect(idsOf(badges(candidate({ experience: 6, verification: { at: 'x', counts: { celiski: 0, dikkat: 0 } } }))))
            .not.toContain('dikkat');
    });

    // Canlı Katman 1 de dikkat üretir (çakışan dönem, unvan sıçraması);
    // tarama yapılmamış adayda da görünmeli.
    it('counts live attention findings with no stored verification', () => {
        const list = badges(candidate({
            experiences: [
                exp('A Ltd', 'Dev', 'Oca 2020 - Ara 2023'),
                exp('B Danışmanlık', 'Danışman', 'Oca 2021 - Ara 2022'),
            ],
        }));
        expect(idsOf(list)).toContain('dikkat');
    });

    // Kendi şirketi bir kusur değil ama bağlam; unvanın ne anlama geldiğini
    // değiştiriyor ve listede görünmesi gerekiyor.
    it('gives the founder match its own badge', () => {
        const list = badges(candidate({
            verification: { at: 'x', counts: { dikkat: 2 }, flagIds: ['aday-kurucu', 'unvan-olcek'] },
        }));
        const b = list.find((x) => x.id === 'kendi-sirketi');
        expect(b.label).toBe('Kendi şirketi');
        expect(b.title).toContain('kusur değil');
    });

    it('puts the founder badge ahead of the generic counter', () => {
        const list = badges(candidate({
            verification: { at: 'x', counts: { dikkat: 3 }, flagIds: ['aday-kurucu'] },
        }));
        expect(idsOf(list).indexOf('kendi-sirketi')).toBeLessThan(idsOf(list).indexOf('dikkat'));
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

// ── Filtre sınıflandırması ──────────────────────────────────────────────────
// Filtre ile rozet AYNI sayaçtan okur. Ayrı hesaplansalardı "çelişkili
// adaylar" filtresi bir küme getirirken listede o adayların bir kısmında
// çelişki rozeti olmazdı.
describe('sectorBucket', () => {
    const withVerdict = (verdict) => candidate({ verification: { at: 'x', sector: { verdict } } });

    it('treats strong and partial fit as the same bucket', () => {
        expect(sectorBucket(withVerdict(VERDICT.STRONG))).toBe('match');
        expect(sectorBucket(withVerdict(VERDICT.PARTIAL))).toBe('match');
    });

    it('keeps neighbour and outside apart', () => {
        expect(sectorBucket(withVerdict(VERDICT.NEAR))).toBe('near');
        expect(sectorBucket(withVerdict(VERDICT.NONE))).toBe('outside');
    });

    // ASIL KORUMA: taranmamış 600 aday "sektör dışı" filtresine düşerse
    // filtre hiçbir işe yaramaz.
    it('puts unmeasurable candidates in their own bucket, not "outside"', () => {
        expect(sectorBucket(withVerdict(VERDICT.UNMEASURED))).toBe('unmeasured');
        expect(sectorBucket(withVerdict(VERDICT.NO_TARGET))).toBe('unmeasured');
        expect(sectorBucket(candidate())).toBe('unmeasured');
        expect(sectorBucket(null)).toBe('unmeasured');
    });
});

describe('verificationBucket', () => {
    const bucket = (c) => verificationBucket(c, { today: TODAY });

    it('ranks contradiction above attention', () => {
        expect(bucket(candidate({ verification: { at: 'x', counts: { celiski: 1, dikkat: 4 } } }))).toBe('contradiction');
        expect(bucket(candidate({ verification: { at: 'x', counts: { celiski: 0, dikkat: 4 } } }))).toBe('attention');
    });

    it('calls a scanned candidate with no findings clean', () => {
        expect(bucket(candidate({ experience: 6, verification: { at: 'x', counts: { celiski: 0, dikkat: 0 } } }))).toBe('clean');
    });

    // Taranmamış adayı "temiz" saymak, bakmadığımız şeyi onaylamak olurdu.
    it('never calls an unscanned candidate clean', () => {
        expect(bucket(candidate({ experience: 6 }))).toBe('unverified');
        expect(bucket(candidate({ experience: 6, verification: { counts: { celiski: 0 } } }))).toBe('unverified');
    });

    // Katman 1 tarama gerektirmiyor: taranmamış adayda da çelişki görünmeli.
    it('finds a live contradiction even with no stored verification', () => {
        expect(bucket(candidate({
            experience: 8,
            experiences: [exp('Tek Şirket', 'Dev', 'Eyl 2024 - Ağu 2026')],
        }))).toBe('contradiction');
    });
});

describe('verificationCounts — rozet ve filtrenin ortak kaynağı', () => {
    it('agrees with what the badges display', () => {
        const c = candidate({ verification: { at: 'x', counts: { celiski: 2, dikkat: 5 } } });
        const counts = verificationCounts(c, { today: TODAY });
        const list = badges(c);
        expect(list.find((b) => b.id === 'celiski').label).toBe(`${counts.contradictions} çelişki`);
        expect(list.find((b) => b.id === 'dikkat').label).toBe(`${counts.attention} dikkat`);
    });

    it('survives a malformed candidate', () => {
        expect(verificationCounts(null).contradictions).toBe(0);
        expect(verificationCounts({}).verified).toBe(false);
    });
});
