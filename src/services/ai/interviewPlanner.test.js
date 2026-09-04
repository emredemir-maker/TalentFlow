// Mülakat sorularını yazan servis.
//
// Bu dosya iki şeyi sabitliyor:
//   1. Model NE sorulacağına karar VEREMEZ — sonda listesi kodda seçiliyor,
//      modelin bir sondayı atlaması ya da sıraya karışması planı bozmamalı.
//   2. Prompt'taki kurallar yazılı kalmalı: analog alan dersi, açık uçlu
//      soru zorunluluğu, önyargı yasağı. Bunlar canlıda pahalıya öğrenildi.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({ getModel: vi.fn(), getAuthHeaders: vi.fn() }));

const { mergeProbeQuestions, fallbackQuestion, generateProbeQuestions } =
    await import('./interviewPlanner.js');

const PROBES = [
    { requirementIndex: 3, text: 'CX ürünü geliştirmiş olmak', must: true, status: 'missing', priority: 'kritik', minutes: 8 },
    { requirementIndex: 1, text: 'Funnel sahipliği', must: true, status: 'partial', priority: 'yuksek', minutes: 6 },
    { requirementIndex: 5, text: 'SQL bilgisi', must: false, status: 'partial', priority: 'dusuk', minutes: 3 },
];

describe('mergeProbeQuestions', () => {
    it('matches questions by requirement number, not by order', () => {
        // Sırayla eşleştirmek cazip ama yanlış: model sırayı bozarsa soru
        // yanlış maddeye yapışır. Bugün aynı sınıf hata üç yerde çıktı.
        const merged = mergeProbeQuestions(PROBES, [
            { requirementIndex: 5, question: 'SQL sorusu' },
            { requirementIndex: 3, question: 'CX sorusu' },
            { requirementIndex: 1, question: 'Funnel sorusu' },
        ]);
        expect(merged.find((p) => p.requirementIndex === 3).question).toBe('CX sorusu');
        expect(merged.find((p) => p.requirementIndex === 5).question).toBe('SQL sorusu');
    });

    it('keeps the probe order the plan decided, not the order the model replied in', () => {
        const merged = mergeProbeQuestions(PROBES, [{ requirementIndex: 5, question: 'SQL' }]);
        expect(merged.map((p) => p.requirementIndex)).toEqual([3, 1, 5]);
    });

    it('never drops a probe the model skipped — falls back to a written question', () => {
        // Bir maddenin sessizce kaybolması, kötü yazılmış bir sorudan kötüdür
        const merged = mergeProbeQuestions(PROBES, [{ requirementIndex: 3, question: 'CX sorusu' }]);
        expect(merged).toHaveLength(3);
        expect(merged[1].question).toBeTruthy();
        expect(merged[1].generated).toBe(false);
        expect(merged[0].generated).toBe(true);
    });

    it('produces a complete plan when the model returned nothing at all', () => {
        const merged = mergeProbeQuestions(PROBES, null);
        expect(merged).toHaveLength(3);
        expect(merged.every((p) => p.question.length > 10)).toBe(true);
        expect(merged.every((p) => p.followUp.length > 10)).toBe(true);
    });

    it('carries the plan fields through untouched', () => {
        // Kademe ve dakika kodda hesaplandı; birleştirme bunlara dokunmamalı
        const merged = mergeProbeQuestions(PROBES, []);
        expect(merged[0]).toMatchObject({ priority: 'kritik', minutes: 8, must: true, status: 'missing' });
    });

    it('ignores answers for probes that do not exist', () => {
        const merged = mergeProbeQuestions(PROBES, [{ requirementIndex: 99, question: 'hayalet' }]);
        expect(merged).toHaveLength(3);
        expect(merged.every((p) => p.question !== 'hayalet')).toBe(true);
    });

    it('treats a blank question as no question', () => {
        const merged = mergeProbeQuestions(PROBES, [{ requirementIndex: 3, question: '   ' }]);
        expect(merged[0].generated).toBe(false);
        expect(merged[0].question).toContain('CX ürünü geliştirmiş olmak');
    });

    it('survives malformed payloads', () => {
        expect(mergeProbeQuestions(PROBES, 'metin')).toHaveLength(3);
        expect(mergeProbeQuestions(PROBES, [null, 5, {}])).toHaveLength(3);
        expect(mergeProbeQuestions(null, [])).toEqual([]);
    });

    it('collapses whitespace so a multi-line answer stays one question', () => {
        const merged = mergeProbeQuestions(PROBES, [
            { requirementIndex: 3, question: 'Bir\n\n  soru   metni' },
        ]);
        expect(merged[0].question).toBe('Bir soru metni');
    });
});

describe('fallbackQuestion', () => {
    it('invites evidence from an ANALOG field when the requirement is missing', () => {
        // Yedek soru bile analog dersini taşımalı: eksik madde, adayın aynı
        // işi başka bir kitleye yapmış olma ihtimalini kapatmamalı
        const q = fallbackQuestion({ text: 'CX ürünü geliştirmiş olmak', status: 'missing' });
        expect(q).toMatch(/başka bir sektörde|başka bir kitle/);
    });

    it('asks about scope and ownership when the requirement is partial', () => {
        const q = fallbackQuestion({ text: 'Funnel sahipliği', status: 'partial' });
        expect(q).toMatch(/sahibi|katkı/);
    });

    it('is open-ended, never a yes/no gate', () => {
        // 'X yaptınız mı?' sorusu 'evet' cevabı alır ve hiçbir şey öğretmez
        for (const status of ['missing', 'partial', 'met']) {
            expect(fallbackQuestion({ text: 'X', status })).toMatch(/anlatır mısınız/);
        }
    });

    it('does not throw on an empty probe', () => {
        expect(fallbackQuestion(null)).toBeTruthy();
        expect(fallbackQuestion({})).toBeTruthy();
    });
});

describe('generateProbeQuestions — çağrı yapılmayan durumlar', () => {
    it('does not call the model when the plan is stale', async () => {
        // Bayat planda sorulacak madde yok; harcanacak çağrı da yok
        const { getModel } = await import('./config.js');
        getModel.mockClear();
        const out = await generateProbeQuestions({ stale: true, probes: PROBES }, {}, {});
        expect(out.probes).toEqual([]);
        expect(getModel).not.toHaveBeenCalled();
    });

    it('does not call the model when there is nothing to probe', async () => {
        const { getModel } = await import('./config.js');
        getModel.mockClear();
        expect((await generateProbeQuestions({ probes: [] }, {}, {})).probes).toEqual([]);
        expect((await generateProbeQuestions(null, {}, {})).probes).toEqual([]);
        expect(getModel).not.toHaveBeenCalled();
    });

    it('still returns a usable plan when the model call throws', async () => {
        const { getModel } = await import('./config.js');
        getModel.mockRejectedValueOnce(new Error('502 Bad Gateway'));
        const out = await generateProbeQuestions({ probes: PROBES }, {}, { title: 'GPM' });
        expect(out.probes).toHaveLength(3);
        expect(out.probes.every((p) => p.question.length > 10)).toBe(true);
        expect(out.probes.every((p) => p.generated === false)).toBe(true);
        // SEBEP DE DÖNÜYOR: ekran "neden" diye soranı konsola göndermesin.
        expect(out.error).toContain('502');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Prompt koruması. Bu kuralların her biri canlıda bir hataya karşılık geliyor;
// prompt'tan sessizce düşmeleri hatanın geri gelmesi demek.
// ─────────────────────────────────────────────────────────────────────────────
describe('PLANNER_PROMPT', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = fs.readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'interviewPlanner.js'),
        'utf8'
    );
    const flat = source.replace(/\s+/g, ' ');

    it('tells the model which decisions are not its to make', () => {
        expect(flat).toMatch(/SANA AİT OLMAYAN KARARLAR/);
        expect(flat).toMatch(/Hangi maddenin sorulacağı \(zaten seçildi\)/);
        expect(flat).toMatch(/Sıra ve öncelik \(zaten belirlendi\)/);
    });

    it('forbids yes/no questions and demands a concrete instance', () => {
        expect(flat).toMatch(/AÇIK UÇLU olmalı/);
        expect(flat).toMatch(/"evet" cevabı alır ve hiçbir şey öğretmez/);
    });

    it('carries the analog-field lesson into question writing', () => {
        // Skorlamada öğrendiğimiz ders: madde ürün adı taşıyor diye o ürünü
        // arama. Soru da aynı hatayı yapabilir — 'Hangi CRM'i kullandınız?'
        expect(flat).toMatch(/İşin KENDİSİNİ sor, ürün adını ya da sektör etiketini değil/);
        expect(flat).toMatch(/aynı işi başka bir kitle için yapmışsa bunu anlatabilmeli/);
    });

    it('requires listenFor to be observable, because grading anchors to it', () => {
        expect(flat).toMatch(/GÖZLENEBİLİR yaz/);
        expect(flat).toMatch(/Konuya hakim olduğunu göstermesi.{0,20}\(ölçülemez\)/);
    });

    it('keeps the interviewer from putting the scan verdict into the question', () => {
        // 'CV'nizde bu görünmüyor, neden?' sorusu adayı savunmaya iter ve
        // varsa kanıtını göstermesini engeller
        expect(flat).toMatch(/KÖŞEYE SIKIŞTIRAN soru yazma/);
        expect(flat).toMatch(/amaç yakalamak değil öğrenmek/);
        expect(flat).toMatch(/eksik olduğu YARGISINI soruya yazma/);
    });

    it('bans demographic questions outright', () => {
        expect(flat).toMatch(/Cinsiyet, yaş, medeni hâl, memleket, sağlık, inanç/);
    });

    it('pins one question per probe, echoed back by requirement number', () => {
        expect(flat).toMatch(/TAM OLARAK BİR soru/);
        expect(flat).toMatch(/"requirementIndex" değerini AYNEN geri yaz/);
    });

    it('keeps priority and minutes out of the model input', () => {
        // Kademeyi gönderirsek model tonu ve uzunluğu ona göre değiştirir;
        // o karar kodda verildi ve modelin yeniden vermesi istenmiyor
        expect(flat).toMatch(/Kademe ve dakika bilinçli olarak GÖNDERİLMİYOR/);
        expect(flat).not.toMatch(/priority: p\.priority/);
        expect(flat).not.toMatch(/minutes: p\.minutes/);
    });
});
