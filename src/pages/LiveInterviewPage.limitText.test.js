// Canlı mülakat sayfası: sınır metinleri ve görünen arayüz yazıları.
//
// 1) Sunucu 429 INTERVIEW_AI_LIMIT dediğinde sayfa sunucunun metnini
//    göstermeli (istemci sayacı 1'deyken "sınır (20) doldu" yanlış bilgi).
//    Takip sorusunda görünen not ve düğme title'ı aynı metni kullanmalı.
// 2) "MÜLAKATИ BAŞLAT": "И" Kiril harfiydi. Arayüz kaynağında Kiril harfi
//    olmamalı (ekran okuyucu ve aramada yanlış okunur).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(SRC, 'pages/LiveInterviewPage.jsx'), 'utf8');

describe('LiveInterviewPage sınır metinleri', () => {
    it('429 sonrası sunucu metni gateMessage\'a verilir (analiz ve takip sorusu)', () => {
        expect(page).toMatch(/setAnalysisServerMsg\(err\.message\)/);
        expect(page).toMatch(/setFollowUpServerMsg\(err\.message\)/);
        expect(page).toMatch(/gateMessage\(analysisState, .*serverMessage: analysisServerMsg/);
        expect(page).toMatch(/gateMessage\(followUpState, .*serverMessage: followUpServerMsg/);
        // Analiz notu 429 metnini ayrı bir "notice" olarak tutmaz (saat geçince bayat kalırdı).
        expect(page).not.toMatch(/setAnalysisNotice\(err\.message\)/);
    });

    it('takip sorusunun görünen notu ve title\'ı aynı metni kullanır', () => {
        expect(page).not.toMatch(/followUpNotice/);
        expect(page).toMatch(/Takip sorusu: \{followUpBlockedMsg\}/);
        const titles = page.match(/title=\{!candidateData \? 'Aday verisi yüklenemedi' : \(followUpBlockedMsg \|\|/g) || [];
        expect(titles.length).toBe(2);
    });
});

describe('Arayüz kaynağında Kiril harfi yok', () => {
    const files = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\.(js|jsx)$/.test(e.name) && !e.name.includes('.test.')) files.push(full);
        }
    })(SRC);

    it('src/ altındaki hiçbir dosyada U+0400–U+04FF yok', () => {
        const hits = [];
        for (const f of files) {
            fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
                if (/[Ѐ-ӿ]/.test(line)) hits.push(`${path.relative(SRC, f)}:${i + 1}`);
            });
        }
        expect(hits).toEqual([]);
    });

    it('başlat düğmesi Latin "I" ile yazılır', () => {
        expect(page).toContain('MÜLAKATI BAŞLAT');
    });
});
