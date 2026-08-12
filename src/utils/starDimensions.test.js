import { describe, expect, it } from 'vitest';
import {
    normalizeStarDimension,
    normalizeStarAnalysis,
    anchorLabel,
    starConflicts,
    confidentialDimensions,
    starPercent,
} from './starDimensions.js';

describe('normalizeStarDimension — yeni biçim', () => {
    it('reads the three buckets', () => {
        const d = normalizeStarDimension({
            score: 3,
            evidence: "Trendyol'da dönüşümü %2,1'den %3,4'e çıkarmış.",
            missing: 'Ekip büyüklüğü yazılmamış — kaç kişiydi?',
            conflict: '',
        });
        expect(d.score).toBe(3);
        expect(d.max).toBe(3);
        expect(d.evidence).toContain('Trendyol');
        expect(d.missing).toContain('kaç kişiydi');
        expect(d.conflict).toBe('');
        expect(d.legacy).toBe(false);
    });

    it('keeps a genuine conflict separate from missing information', () => {
        const d = normalizeStarDimension({
            score: 1, evidence: 'X', missing: '', conflict: 'Tarihler çakışıyor: 2021-2023 ve 2022-2024.',
        });
        expect(d.conflict).toContain('çakışıyor');
        expect(d.missing).toBe('');
    });
});

describe('normalizeStarDimension — eski biçim', () => {
    it('maps the old negative into "missing", not "conflict"', () => {
        // Eski negatiflerin çoğu kusur değil, CV'de bulunmayan bilgiydi.
        // Çelişki gibi göstermek eski adaylara haksızlık olurdu.
        const d = normalizeStarDimension({
            score: 8,
            reason: 'Pozitif (+): Bağlamı belirtiyor. Negatif (-): Başlangıç durumları açıklanabilirdi.',
        });
        expect(d.evidence).toBe('Bağlamı belirtiyor.');
        expect(d.missing).toBe('Başlangıç durumları açıklanabilirdi.');
        expect(d.conflict).toBe('');
        expect(d.legacy).toBe(true);
    });

    it('detects the legacy 0-10 scale', () => {
        expect(normalizeStarDimension({ score: 8, reason: 'x' }).max).toBe(10);
    });

    it('drops a placeholder negative', () => {
        const d = normalizeStarDimension({ score: 2, reason: 'Pozitif (+): İyi. Negatif (-): Yok.' });
        expect(d.missing).toBe('');
    });

    it('survives a reason with no markers at all', () => {
        const d = normalizeStarDimension({ score: 2, reason: 'Serbest metin' });
        expect(d.evidence).toBe('Serbest metin');
        expect(d.missing).toBe('');
    });
});

describe('normalizeStarDimension — bozuk girdi', () => {
    it('handles null, undefined and bare numbers', () => {
        expect(normalizeStarDimension(null).score).toBe(0);
        expect(normalizeStarDimension(undefined).score).toBe(0);
        expect(normalizeStarDimension(2).score).toBe(2);
        expect(normalizeStarDimension(7).max).toBe(10);
    });
});

describe('normalizeStarAnalysis', () => {
    const legacy = {
        Situation: { score: 8, reason: 'Pozitif (+): A. Negatif (-): B.' },
        Task: { score: 7, reason: 'Pozitif (+): C.' },
        Action: { score: 9, reason: '' },
        Result: { score: 2, reason: '' },
    };

    it('decides the scale from the WHOLE record, not per dimension', () => {
        // Result 2 puan almış ama kayıt eski (diğerleri 7-9). Boyut boyut
        // bakılsaydı Result 0-3 sayılır ve %67 gibi şişkin bir değer üretirdi.
        const dims = normalizeStarAnalysis(legacy);
        expect(dims.every((d) => d.max === 10)).toBe(true);
    });

    it('treats an all-low new record as the 0-3 scale', () => {
        const fresh = {
            Situation: { score: 3, evidence: 'a' }, Task: { score: 2, evidence: 'b' },
            Action: { score: 1, evidence: '' }, Result: { score: 0, evidence: '' },
        };
        expect(normalizeStarAnalysis(fresh).every((d) => d.max === 3)).toBe(true);
    });

    it('returns null when there is no analysis', () => {
        expect(normalizeStarAnalysis(null)).toBeNull();
    });

    it('keeps the four dimensions in order', () => {
        expect(normalizeStarAnalysis(legacy).map((d) => d.key))
            .toEqual(['Situation', 'Task', 'Action', 'Result']);
    });
});

describe('anchorLabel', () => {
    it('names each anchor on the new scale', () => {
        expect(anchorLabel(0, 3)).toBe('Bilgi yok');
        expect(anchorLabel(1, 3)).toBe('Anılmış');
        expect(anchorLabel(2, 3)).toBe('Anlatılmış');
        expect(anchorLabel(3, 3)).toBe('Ölçülmüş');
    });

    it('gives no label on the legacy scale — anchors did not exist then', () => {
        expect(anchorLabel(8, 10)).toBeNull();
    });
});

describe('starConflicts', () => {
    it('collects only genuine conflicts', () => {
        const analysis = {
            Situation: { score: 2, evidence: 'a', missing: 'çok şey eksik', conflict: '' },
            Task: { score: 1, evidence: 'b', conflict: 'Tarihler tutarsız.' },
            Action: { score: 1, evidence: 'c' },
            Result: { score: 0 },
        };
        const found = starConflicts(analysis);
        expect(found).toHaveLength(1);
        expect(found[0].key).toBe('Task');
    });

    it('finds none in a legacy record', () => {
        expect(starConflicts({
            Situation: { score: 8, reason: 'Pozitif (+): A. Negatif (-): B.' },
        })).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gizlilik beyanı.
//
// En nitelikli adaylar genellikle en sıkı NDA'ye sahip projelerde çalışır;
// rakam paylaşamadıkları için sistem onları eliyordu. Bayrak bu durumu
// GÖRÜNÜR kılar — ama puan KAZANDIRMAZ. Bayrağa puan bağlamak "NDA yazan
// herkes yüksek alır" oyununu açardı; kredi kanıttan gelmeli.
// ─────────────────────────────────────────────────────────────────────────────
describe('gizlilik beyanı', () => {
    it('reads the flag from a new record', () => {
        const d = normalizeStarDimension({
            score: 2, evidence: '8 kişilik ekiple çalışmış', missing: '', confidentiality: true,
        });
        expect(d.confidentiality).toBe(true);
    });

    it('defaults to false when the flag is absent', () => {
        expect(normalizeStarDimension({ score: 2, evidence: 'x' }).confidentiality).toBe(false);
        expect(normalizeStarDimension({ score: 8, reason: 'Pozitif (+): x' }).confidentiality).toBe(false);
    });

    it('does not change the score — credit comes from evidence alone', () => {
        const withFlag = normalizeStarDimension({ score: 1, evidence: 'az', confidentiality: true });
        const without = normalizeStarDimension({ score: 1, evidence: 'az', confidentiality: false });
        expect(withFlag.score).toBe(without.score);
    });

    it('lists the dimensions where confidentiality was declared', () => {
        const analysis = {
            Situation: { score: 2, evidence: 'a', confidentiality: true },
            Task: { score: 2, evidence: 'b' },
            Action: { score: 1, evidence: 'c', confidentiality: true },
            Result: { score: 0 },
        };
        expect(confidentialDimensions(analysis)).toEqual(['Situation', 'Action']);
    });

    it('finds none in a legacy record', () => {
        expect(confidentialDimensions({ Situation: { score: 8, reason: 'x' } })).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// starPercent — TEK kaynak.
//
// 2026-08-08: CandidateProcessPage başlığındaki STAR rozeti kendi kopyasını
// taşıyordu ve `(toplam / 4) * 10` ile eski 0-10 ölçeğini varsayıyordu. Yeni
// 0-3 ölçeğine geçince S3+T2+A2+R3 için rozet %25 gösterdi; doğrusu %83'tü.
// Sayı tesadüfen STAR'ın skora KATKISINA eşitti ((toplam/4)*10 ile
// (toplam/12)*100*0.3 cebirsel olarak aynı) — bu da hatayı gizliyordu.
// ─────────────────────────────────────────────────────────────────────────────
describe('starPercent', () => {
    const dims = (a, b, c, d) => ({
        Situation: { score: a, evidence: 'x' }, Task: { score: b, evidence: 'x' },
        Action: { score: c, evidence: 'x' }, Result: { score: d, evidence: 'x' },
    });

    it('reads the new 0-3 scale out of 12, not out of 40', () => {
        // Onur Kayan'ın gerçek verisi: 3+2+2+3 = 10/12
        expect(starPercent(dims(3, 2, 2, 3))).toBe(83);
        expect(starPercent(dims(3, 3, 3, 3))).toBe(100);
        expect(starPercent(dims(0, 0, 0, 0))).toBe(0);
    });

    it('still reads a legacy 0-10 record correctly', () => {
        const legacy = {
            Situation: { score: 8, reason: 'a' }, Task: { score: 8, reason: 'a' },
            Action: { score: 8, reason: 'a' }, Result: { score: 8, reason: 'a' },
        };
        expect(starPercent(legacy)).toBe(80);
    });

    it('returns null when there is no analysis so the badge can show a dash', () => {
        expect(starPercent(null)).toBeNull();
        expect(starPercent(undefined)).toBeNull();
    });

    it('never exceeds 100 on malformed input', () => {
        expect(starPercent(dims(99, 99, 99, 99))).toBe(100);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ÖLÇEK VE ETİKET — canlıda ikisi de yanlıştı.
//
// Kullanıcı ekran görüntüsü gönderdi: kırılım panelinde dört boyut da
// "0/10" yazıyordu, oysa ölçek 0-3. Tam not alan bir boyut "3/10" görünürdü —
// felaket gibi okunan, aslında kusursuz bir sonuç. 0-10'dan 0-3'e geçilirken
// bu ekran atlanmış.
//
// Aynı görüntüde boyut adı **SİTUATİON** yazıyordu: ham 'Situation' anahtarı
// CSS ile büyütülüyor ve sayfa lang="tr" olduğu için tarayıcı Türkçe büyütme
// kuralı uyguluyor. Bugün aynı tuzağa altıncı kez düşüldü — bu sefer JS'te
// değil CSS'te.
// ─────────────────────────────────────────────────────────────────────────────
describe('STAR ölçeği ve etiketleri', () => {
    it('exposes the scale as a shared constant, not a magic number', async () => {
        const { STAR_MAX } = await import('./starDimensions');
        expect(STAR_MAX).toBe(3);
    });

    it('has a Turkish label for every dimension', async () => {
        const { STAR_LABELS, STAR_KEYS } = await import('./starDimensions');
        for (const key of STAR_KEYS) {
            expect(STAR_LABELS[key]).toBeTruthy();
        }
    });

    it('labels survive Turkish uppercasing without growing a dotted İ', async () => {
        // CSS text-transform:uppercase, lang="tr" ile aynı sonucu vermeli.
        // 'Situation' → 'SİTUATİON' olurdu; 'Durum' → 'DURUM' güvenli.
        const { STAR_LABELS } = await import('./starDimensions');
        for (const label of Object.values(STAR_LABELS)) {
            expect(label.toLocaleUpperCase('tr-TR')).not.toContain('İ');
        }
    });

    it('anchors the full scale end to end', async () => {
        const { anchorLabel, STAR_MAX, ANCHOR_LABELS } = await import('./starDimensions');
        expect(anchorLabel(0, STAR_MAX)).toBe(ANCHOR_LABELS[0]);
        expect(anchorLabel(STAR_MAX, STAR_MAX)).toBe(ANCHOR_LABELS[ANCHOR_LABELS.length - 1]);
    });
});

describe('kırılım paneli ölçeği', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/ScoreBreakdownPanel.jsx'),
        'utf8'
    );

    it('never hardcodes a STAR denominator again', () => {
        expect(src).not.toMatch(/\{d\.score\}\/10/);
        expect(src).toMatch(/\{d\.score\}\/\{STAR_MAX\}/);
    });

    it('prints the Turkish label, not the raw English key', () => {
        expect(src).toMatch(/STAR_LABELS\[d\.key\]/);
    });
});
