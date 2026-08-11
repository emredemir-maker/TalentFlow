// Skoru belirleyen çağrı ve birleştirme.
//
// Canlıda ölçüldü: aynı aday, aynı ilan, sıcaklık 0 — skor 80'den 65'e
// düştü. İki maddenin damgası değişmişti; en çarpıcısı CX maddesiydi
// ("Employee Engagement ile ilgili → kısmen" ↔ "kanıt yok → yok").
//
// Bu dosya iki şeyi sabitliyor:
//   1. Skoru etkileyen çıktı KÜÇÜK ve savunmalı (modelin ölçek dışı ya da
//      tanımsız değerleri sessizce skora sızmasın)
//   2. Anlatım çağrısı skoru DEĞİŞTİREMESİN — yalnızca metin ekleyebilsin
import { describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { mergeNarrative } = await import('./coverageScorer.js');

const scored = {
    assessments: [
        { index: 1, status: 'met', kind: 'deneyim' },
        { index: 2, status: 'partial', kind: 'deneyim' },
        { index: 3, status: 'missing', kind: 'arac' },
    ],
    star: { Situation: { score: 3 }, Task: { score: 2 }, Action: { score: 2 }, Result: { score: 1 } },
};

describe('mergeNarrative', () => {
    it('keeps the STATUS from the scoring call, not the narrative', () => {
        // Anlatım çağrısı damga göndermeye kalkarsa yok sayılmalı; yoksa
        // kararsızlık tekrar skora sızar
        const merged = mergeNarrative(scored, {
            notes: [{ index: 1, status: 'missing', note: 'Kanıt var', evidence: 'X şirketinde 3 yıl' }],
        });
        expect(merged.assessments[0].status).toBe('met');
        expect(merged.assessments[0].evidence).toBe('X şirketinde 3 yıl');
    });

    it('keeps the STAR score from the scoring call and only adds text', () => {
        const merged = mergeNarrative(scored, {
            star: { Situation: { score: 0, evidence: 'Rol açıkça yazılmış' } },
        });
        expect(merged.starAnalysis.Situation.score).toBe(3);
        expect(merged.starAnalysis.Situation.evidence).toBe('Rol açıkça yazılmış');
    });

    it('produces a complete result when the narrative call failed entirely', () => {
        // Anlatım patlasa bile skor ayakta kalmalı
        const merged = mergeNarrative(scored, null);
        expect(merged.assessments).toHaveLength(3);
        expect(merged.assessments[0].status).toBe('met');
        expect(merged.assessments[0].note).toBe('');
        expect(merged.starAnalysis.Result.score).toBe(1);
    });

    it('matches notes by index, not by order', () => {
        const merged = mergeNarrative(scored, {
            notes: [
                { index: 3, note: 'ucuncu' },
                { index: 1, note: 'birinci' },
            ],
        });
        expect(merged.assessments.find((a) => a.index === 1).note).toBe('birinci');
        expect(merged.assessments.find((a) => a.index === 3).note).toBe('ucuncu');
    });

    it('ignores notes for requirements that do not exist', () => {
        const merged = mergeNarrative(scored, { notes: [{ index: 99, note: 'hayalet' }] });
        expect(merged.assessments).toHaveLength(3);
        expect(merged.assessments.every((a) => a.note === '')).toBe(true);
    });

    it('fills every STAR dimension even when the narrative covers none', () => {
        const merged = mergeNarrative(scored, { notes: [] });
        for (const key of ['Situation', 'Task', 'Action', 'Result']) {
            expect(merged.starAnalysis[key]).toMatchObject({ evidence: '', missing: '', conflict: '', confidentiality: false });
        }
    });

    it('survives malformed narrative payloads', () => {
        expect(mergeNarrative(scored, { notes: 'metin' }).assessments).toHaveLength(3);
        expect(mergeNarrative(scored, { star: 'metin' }).starAnalysis.Task.score).toBe(2);
        expect(mergeNarrative(scored, {}).assessments[1].gap).toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt koruması. Damga tanımı canlıda kararsız çıktı; sınırların yazılı
// kalması bu dosyanın asıl işi.
// ─────────────────────────────────────────────────────────────────────────────
describe('SCORER_PROMPT', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'coverageScorer.js'),
        'utf8'
    );
    const flat = source.replace(/\s+/g, ' ');

    it('defines partial with two decidable cases instead of "dolaylı kanıt"', () => {
        expect(flat).toMatch(/Aynı işi ANALOG bir alanda yapmış/);
        expect(flat).toMatch(/daha dar kapsam, daha kısa süre/);
    });

    it('pins the live CX case so it stops flipping', () => {
        // Kullanıcının kararı: çalışan deneyimi de deneyim tasarımıdır
        expect(flat).toMatch(/Employee Engagement \/ HR-Tech.{0,120}PARTIAL/);
        expect(flat).toMatch(/hedef kitle müşteri değil çalışan/);
    });

    it('gives a tie-break rule so the boundary is not re-decided each run', () => {
        expect(flat).toMatch(/KARARLILIK KURALI/);
        expect(flat).toMatch(/Aynı CV her taramada aynı damgayı almalı/);
    });

    it('keeps the narrative out of the scoring call', () => {
        expect(flat).toMatch(/Farkı bu çağrıda AÇIKLAMA/);
        expect(flat).toMatch(/maxOutputTokens: 2048/);
    });

    it('keeps STAR anchored to evidence, not quality', () => {
        expect(flat).toMatch(/CV'de NE KADAR KANIT var \(adayın niteliği DEĞİL\)/);
        expect(flat).toMatch(/kesin rakam ŞART DEĞİL/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALOG ALAN KURALI — ikinci deneme.
//
// İlk sürümde kural bir ÖRNEK olarak yazılmıştı ve tutmadı: canlıda CX
// maddesi yine "missing" aldı ("Employee Engagement / HR-Tech ürün portföyü"
// CV'de açıkça yazdığı hâlde). Modelin bir kuralı okuması ile uygulaması
// farklı şeyler; kural artık missing vermeden ÖNCE çalışan zorunlu bir
// karar adımı.
// ─────────────────────────────────────────────────────────────────────────────
describe('analog alan kuralı — zorunlu kontrol', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'coverageScorer.js'),
        'utf8'
    );
    const flat = src.replace(/\s+/g, ' ');

    it('makes the check a required step before missing, not an example', () => {
        expect(flat).toMatch(/MISSING VERMEDEN ÖNCE ZORUNLU KONTROL/);
        expect(flat).toMatch(/bu adımı atlama/);
    });

    it('tells the model to reduce the requirement to the WORK, not the product name', () => {
        // Canlıdaki hata tam buydu: madde 'CRM ürünü' dediği için model
        // adayın CRM kategorisinde ürün aradı, işin kendisini değil
        expect(flat).toMatch(/ne YAPILDIĞINA.{0,60}ürün adına ya da sektör etiketine değil/);
        expect(flat).toMatch(/ÜRÜN KATEGORİSİ adı taşıyor diye.{0,120}ARAMA/);
    });

    it('gives the decision as a two-branch rule with an explicit outcome', () => {
        expect(flat).toMatch(/VARSA → "partial"/);
        expect(flat).toMatch(/YOKSA → "missing"/);
    });

    it('walks through the live case that failed', () => {
        expect(flat).toMatch(/Çalışan Bağlılığı \/ Employee Engagement \/ HR-Tech/);
        expect(flat).toMatch(/kitle farklı \(çalışan ↔ müşteri\) → PARTIAL\. "missing" DEĞİL/);
    });

    it('keeps the gap explanation out of this call', () => {
        expect(flat).toMatch(/Farkı yazma, o ayrı bir adımın işi/);
    });
});
