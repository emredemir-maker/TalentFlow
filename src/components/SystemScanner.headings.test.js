// SystemScanner pencereleri body'ye portal'lanıyor. Orada index.css'teki
// katmansız `h1, h2, h3, h4 { color: var(--on-surface) }` kuralı, Tailwind'in
// katmanlı `text-white` yardımcısını eziyor: koyu zeminde koyu başlık
// ("Detaylı Analiz" neredeyse görünmüyordu). Başlıklar `!text-white` taşımalı.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'SystemScanner.jsx'), 'utf8');

describe('SystemScanner başlık rengi', () => {
    it('beyaz başlıklar global başlık rengine ezilmez', () => {
        const headings = [...src.matchAll(/<h[1-4] className="([^"]*)"/g)].map((m) => m[1]);
        const white = headings.filter((c) => /(^|\s)!?text-white(\s|$)/.test(c));
        expect(white.length).toBeGreaterThan(0);
        for (const c of white) expect(c).toMatch(/(^|\s)!text-white(\s|$)/);
    });
    it('"Detaylı Analiz" penceresinin başlığı okunur renktedir', () => {
        expect(src).toMatch(/<h3 className="[^"]*!text-white[^"]*">Detaylı Analiz<\/h3>/);
    });
});
