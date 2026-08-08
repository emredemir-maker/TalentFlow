import { describe, expect, it } from 'vitest';
import {
    normalizeStarDimension,
    normalizeStarAnalysis,
    anchorLabel,
    starConflicts,
    confidentialDimensions,
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
