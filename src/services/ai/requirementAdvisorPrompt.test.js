// Danışman prompt'u: model yalnızca VERİLEN bulguyu iddia edebilir.
//
// Gerçek çıktıda yakalandı: yalnızca "tool-must" bulgusu verilen bir madde
// için model "…havuzu gereksiz yere daralttığını göstermektedir" yazdı. Oysa
// o madde 86 adayın 17'sini eliyordu (%20) ve "over-restrictive" bayrağı SET
// EDİLMEMİŞTİ. Model kendi kafasından bulgu ekledi.
//
// Aynı istekte başka bir madde için doğru davranmıştı ("daraltmadan") — yani
// tutarsız da. Kural açıkça yazılmadan bu düzelmez.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raw = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'requirementAdvisor.js'),
    'utf8'
);
const prompt = raw.replace(/\s+/g, ' ');

describe('ADVISOR_PROMPT', () => {
    it('forbids claiming a finding that was not supplied', () => {
        expect(prompt).toMatch(/SANA VERİLMEYEN BULGUYU İDDİA ETME/);
    });

    it('ties each claim to the flag that licenses it', () => {
        expect(prompt).toMatch(/over-restrictive.{0,40}OLMALI/);
        expect(prompt).toMatch(/no-signal.{0,40}OLMALI/);
        expect(prompt).toMatch(/redundant.{0,40}OLMALI/);
    });

    it('shows the exact mistake the model made, as a counter-example', () => {
        expect(prompt).toMatch(/YANLIŞ \(bulgularda over-restrictive yokken\)/);
        expect(prompt).toMatch(/gereksiz yere daralttığını göstermektedir/);
    });

    it('still requires citing the supplied number', () => {
        expect(prompt).toMatch(/SANA VERİLEN SAYIYI kullan/);
        expect(prompt).toMatch(/Sayı uydurma/);
    });

    it('still bans generic filler', () => {
        expect(prompt).toMatch(/Genel geçer cümle YASAK/);
        expect(prompt).toMatch(/BAŞKA bir ilana da aynen uyuyorsa/);
    });

    it('keeps the quote rule that protects the JSON', () => {
        expect(prompt).toMatch(/TIRNAK KURALI/);
    });
});
