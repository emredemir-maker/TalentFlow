// SUNUCU İSTEMCİYE GÜVENMEZ.
//
// İstemci beklentiyi utils/salaryBand.normalizeBand ile gönderiyor, ama gövde
// elle de kurulabilir. Para birimi ve dönem AYRI alanlar çünkü bunlarsız sayı
// yarım bir ölçüm — ve bu zincirin çıktısı bir bütçe kararı.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../routes/interview.js'),
    'utf8'
);

describe('sanitizeSalary — sözleşme', () => {
    it('exists and is applied to the stored record', () => {
        expect(source).toMatch(/function sanitizeSalary/);
        expect(source).toMatch(/candidateSalary: sanitizeSalary\(candidateSalary\)/);
    });

    // Boş beklentiyi SIFIR saymak, sorulmamış bir soruyu cevaplanmış
    // göstermek olur ve bütçe raporunu sessizce aşağı çeker.
    it('returns null rather than zero when nothing was entered', () => {
        expect(source).toMatch(/if \(min === null && max === null\) return null;/);
    });

    it('closes the currency and period vocabularies', () => {
        expect(source).toMatch(/SALARY_CURRENCIES = new Set\(\['TRY', 'USD', 'EUR'\]\)/);
        expect(source).toMatch(/SALARY_PERIODS = new Set\(\['monthly', 'yearly'\]\)/);
    });
});
