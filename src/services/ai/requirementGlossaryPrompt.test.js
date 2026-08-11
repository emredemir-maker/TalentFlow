// Sözlük prompt'u.
//
// Bu prompt'ta iki kayma riski var, ikisini de bu projede yaşadık:
//   1. Genel geçer cümle. Danışman prompt'unda model her ilana uyan
//      ("bu madde gözden geçirilebilir") cümleler üretti; kural açıkça
//      yazılmadan düzelmedi.
//   2. Rol karışması. Sözlüğün işi TANIMLAMAK; maddenin gerekli olup
//      olmadığını tartışmak ölçüm katmanının işi. Model bu sınırı kendiliğinden
//      korumaz.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'requirementGlossary.js'),
    'utf8'
);
const flat = source.replace(/\s+/g, ' ');

describe('GLOSSARY_PROMPT', () => {
    it('asks for all three fields', () => {
        expect(flat).toMatch(/"olcut"/);
        expect(flat).toMatch(/"sinyaller"/);
        expect(flat).toMatch(/"olcmez"/);
    });

    it('forbids restating the requirement instead of defining it', () => {
        expect(flat).toMatch(/Maddeyi TEKRARLAMA/);
        expect(flat).toMatch(/YANLIŞ: 'GA4 hakimiyeti, GA4 aracına hakim olmayı ölçer\.' \(tekrar\)/);
    });

    it('explains WHY "olcmez" matters — the field is the whole point', () => {
        // Bu alan olmadan madde olduğundan fazlasını ifade eder ve haksız
        // eleme yapılır; modele nedenini söylemezsek alanı geçiştirir
        expect(flat).toMatch(/ölçMEDİĞİ ama ölçüyor SANILAN/);
        expect(flat).toMatch(/haksız eleme/);
    });

    it('demands position-specific wording and gives the transfer test', () => {
        expect(flat).toMatch(/İLANA ÖZEL yaz/);
        expect(flat).toMatch(/BAŞKA bir ilana da aynen uyuyorsa YANLIŞTIR/);
        // Aynı terimin ilana göre farklı şey ölçtüğü örneği
        expect(flat).toMatch(/veri analisti ilanında başka, bir ürün müdürü ilanında başka/);
    });

    it('bans the generic filler that broke the advisor before', () => {
        expect(flat).toMatch(/Genel geçer cümle YASAK/);
        expect(flat).toMatch(/pozisyonun gereklilikleri doğrultusunda/);
    });

    it('keeps the glossary out of the measurement layer\'s job', () => {
        expect(flat).toMatch(/GEREKLİ olup olmadığını TARTIŞMA/);
        expect(flat).toMatch(/havuzu daraltır.{0,30}yorum YAPMA/);
        expect(flat).toMatch(/senin işin tanımlamak, değerlendirmek değil/);
    });

    it('keeps the quote rule that broke JSON parsing before', () => {
        expect(flat).toMatch(/TIRNAK KURALI/);
        expect(flat).toMatch(/Kaçışsız tırnak/);
    });
});

describe('sözlük girdisi sınırı', () => {
    it('never sends candidate data to the model', () => {
        // Sözlük ilana aittir. Aday verisi girerse tanım o adaya göre
        // eğrilir ve sonra HERKESE uygulanır.
        expect(flat).toMatch(/ADAY hakkında hiçbir şey yazma/);
        expect(source).not.toMatch(/candidate|cvText|cvData|positionAnalyses/);
    });

    it('sanitizes the position text it does send', () => {
        expect(flat).toMatch(/POZISYON: sanitizeForPrompt/);
        expect(flat).toMatch(/GEREKSINIMLER: sanitizeForPrompt/);
        expect(flat).toMatch(/ILAN_ACIKLAMASI: sanitizeForPrompt/);
    });

    it('caps the free-text description it forwards', () => {
        // İlan açıklaması serbest metin; sınırsız geçirmek hem pahalı hem
        // de prompt'u boğar
        expect(flat).toMatch(/\.slice\(0, 1500\)/);
    });
});
