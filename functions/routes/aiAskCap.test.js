// /api/ai/ask ÇIKTI TAVANI — sessiz kesilmenin önündeki tek engel.
//
// Canlıda yaşandı: tavan 2048 iken piyasa araştırması cevabı yarıda kesildi.
// Gemini 2.5'te DÜŞÜNME token'ları da çıktı bütçesinden yeniyor ve arama yapan
// bir çağrıda düşünme payı tek başına tavanı doldurabiliyor.
//
// Kesilmenin belirtisi hiç de "cevap kesildi" gibi görünmüyor:
//   1. Etiketli satırlar gelmiyor → bant ayrıştırılamıyor
//   2. GROUNDING METADATA DA BOŞALIYOR → kaynak listesi boş
//   3. Kaynaksız cevabı gizleyen kural devreye giriyor
//   → kullanıcı "kaynaklı bant bulunamadı" görüyor ve sebeple hiçbir bağ yok.
//
// Bu test tavanı düşürmeyi zorlaştırmak için var; düşürülecekse bilinçli olsun.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ai.js'),
    'utf8'
);

describe('/api/ai/ask token cap', () => {
    it('leaves room for thinking tokens on grounded calls', () => {
        const clamp = source.match(/const tokenCap = Math\.min\(Math\.max\(parseInt\(maxOutputTokens, 10\) \|\| (\d+), (\d+)\), (\d+)\);/g);
        expect(clamp).toBeTruthy();
        // İki uçta da tokenCap var (generate ve ask); ask olan ikincisi.
        const askClamp = clamp[clamp.length - 1];
        const [, fallback, , ceiling] = askClamp.match(/\|\| (\d+), (\d+)\), (\d+)\)/);
        expect(Number(ceiling)).toBeGreaterThanOrEqual(8192);
        expect(Number(fallback)).toBeGreaterThanOrEqual(2048);
    });

    it('keeps the reason next to the number', () => {
        expect(source).toMatch(/DÜŞÜNME TOKEN'LARI da çıktı bütçesinden yeniyor/);
        expect(source).toMatch(/GROUNDING METADATA DA BOŞ geliyor/);
    });
});
