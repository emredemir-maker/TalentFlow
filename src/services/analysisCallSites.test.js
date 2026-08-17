// Mimari koruma testi: her analyzeCandidateMatch çağrısı ilan metnini ortak
// yardımcıyla kurmalı ve gereksinim önceliklerini geçmeli.
//
// NEDEN: Bu proje aynı derin-analiz çağrısını BEŞ ayrı yerde yapıyor
// (SystemScanner, scanService×2, CandidateDrawer, ApplyPage, AddCandidateModal).
// 2026-08-06'da zorunlu/tercihen ayrımı eklenirken yalnızca scanService
// güncellendi; kullanıcının fiilen kullandığı "otonom tarama" (SystemScanner)
// eski düz birleştirmeyi (`${title}\n${requirements.join(', ')}`) kullanmaya
// devam etti. Sonuç: ayrım ne skora ne anlatıma yansıdı ve kullanıcı "hâlâ
// aynı" diye bildirdi. Kopyalardan biri unutulduğunda bu test kırılır.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** src/ altındaki tüm .js/.jsx dosyaları (testler hariç). */
function sourceFiles(dir = SRC, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) sourceFiles(full, acc);
        else if (/\.(js|jsx)$/.test(entry.name) && !entry.name.includes('.test.')) acc.push(full);
    }
    return acc;
}

// Kullanımdan kalkmış, hiçbir yerden import edilmeyen dosyalar (bkz. ölü kod
// envanteri). Canlı akışlarda değiller; güncellenmeleri gerekmiyor.
const DEAD_FILES = ['AIMatchPage.jsx', 'agenticWorkflow.js'];

const callSites = sourceFiles()
    .filter((f) => !DEAD_FILES.some((d) => f.endsWith(d)))
    .map((f) => ({ file: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }))
    // Fonksiyonun kendi tanımı (geminiService) hariç, ÇAĞRI yapan dosyalar
    .filter((f) => /analyzeCandidateMatch\s*\(/.test(f.text) && !f.text.includes('export async function analyzeCandidateMatch'));

describe('analyzeCandidateMatch çağrı noktaları', () => {
    it('finds the known call sites (test kendi kapsamını doğrular)', () => {
        expect(callSites.length).toBeGreaterThanOrEqual(4);
    });

    it.each(callSites.map((c) => c.file))(
        '%s ilan metnini buildJobDescription ile kurar',
        (file) => {
            const { text } = callSites.find((c) => c.file === file);
            expect(text).toContain('buildJobDescription');
            // Elle birleştirme kalıntısı kalmamalı
            expect(text).not.toMatch(/requirements\s*\|\|\s*\[\]\)\.join\(', '\)/);
        }
    );

    it.each(callSites.map((c) => c.file))(
        '%s gereksinim önceliklerini geçer (requirementsOf)',
        (file) => {
            const { text } = callSites.find((c) => c.file === file);
            expect(text).toContain('requirementsOf(');
        }
    );
});

// DAMGASIZ ANALİZ YAZAN YOL OLMAMALI.
//
// Madde yargıları madde NUMARASINA bağlı: {index: 6, status: 'partial'}. İlan
// sonradan değişince o numara başka bir maddeye denk gelir ve eski yargı
// yanlış maddeye yapışır. Canlıda ölçüldü: aynı aday, aynı formül — bayat
// değerlendirmeyle 77, taze taramayla 65.
//
// `requirementsFingerprint` bunu görünür kılan tek şey, ama yalnızca YAZILDIYSA.
// 2026-08-17'de iki yol damgayı hiç yazmıyordu: CandidateDrawer'ın "yeniden
// analiz"i ve — daha kötüsü — kullanıcının fiilen kullandığı otonom tarama
// (SystemScanner). O analizler damgasız oldukları için "hangi listeye ait"
// sorusuna cevap veremiyor, dolayısıyla bayatlıkları da fark edilemiyordu.
const analysisWriters = sourceFiles()
    .filter((f) => !DEAD_FILES.some((d) => f.endsWith(d)))
    .map((f) => ({ file: path.relative(SRC, f), text: fs.readFileSync(f, 'utf8') }))
    // Analizi ÜRETİP kaydeden dosyalar: hem çağrıyı hem yazımı yapanlar.
    .filter((f) => /analyzeCandidateMatch\s*\(/.test(f.text) && /positionAnalyses/.test(f.text));

describe('positionAnalyses yazan yollar', () => {
    it('finds the known writers (test kendi kapsamını doğrular)', () => {
        expect(analysisWriters.length).toBeGreaterThanOrEqual(3);
    });

    it.each(analysisWriters.map((c) => c.file))(
        '%s analizi gereksinim parmak iziyle damgalar',
        (file) => {
            const { text } = analysisWriters.find((c) => c.file === file);
            expect(text).toContain('requirementsFingerprint');
            // Damganın yanında ölçü sürümü de durmalı; ikisi ayrı sorulara
            // cevap veriyor (hangi liste / hangi damgalama kuralı).
            expect(text).toContain('COVERAGE_SCHEMA');
        }
    );
});
