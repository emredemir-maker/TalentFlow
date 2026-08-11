// Düzenleyici prompt'u.
//
// Bu prompt ilanın METNİNİ değiştiriyor — projedeki en yüksek etkili AI
// çağrısı. Üç kayma riski var:
//   1. Fazla bölme: "3-5 yıl deneyim, en az 1-2 yılı growth odaklı" ikiye
//      bölünürse iki anlamsız madde çıkar (bu hatayı daha önce virgülle
//      bölen kodda yaşadık).
//   2. Uydurma: girdide olmayan bir şart gerçek adayları eler.
//   3. Öncelik ifadesini metinde bırakma: değerlendiren model işarete değil
//      metne inanıyor — canlıda "(tercih sebebi)" yazan ZORUNLU madde
//      yüzünden kritik eksik görünmez oldu.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'requirementNormalizer.js'),
    'utf8'
);
const flat = source.replace(/\s+/g, ' ');

describe('NORMALIZER_PROMPT', () => {
    it('explains WHY splitting matters — otherwise the model splits by taste', () => {
        expect(flat).toMatch(/Sistem her maddeye tek bir damga veriyor/);
        expect(flat).toMatch(/Kritik bir eksik bu yüzden görünmez olur/);
    });

    it('gives the real compound requirement as the split example', () => {
        expect(flat).toMatch(/PLG\/self-servis akış, fiyatlandırma-paketleme, CX-helpdesk-CRM/);
        expect(flat).toMatch(/üç farklı uzmanlık/);
    });

    it('gives counter-examples so it does NOT over-split', () => {
        // Nitelendiren yan cümleyi ayırmak iki anlamsız madde üretir
        expect(flat).toMatch(/BÖLÜNMEMELİ: '3-5 yıl ürün yönetimi deneyimi, en az 1-2 yılı growth odaklı'/);
        expect(flat).toMatch(/BÖLÜNMEMELİ: 'Funnel sahipliği: kayıt, aktivasyon, elde tutma, gelir'/);
    });

    it('gives a decidable test for the split, not a vague instruction', () => {
        expect(flat).toMatch(/parçalardan biri tek başına bir iş ilanı maddesi olabiliyor mu/);
    });

    it('moves priority language out of the text and into the flag', () => {
        expect(flat).toMatch(/ÖNCELİĞİ METİNDEN ÇIKAR, İŞARETE TAŞI/);
        expect(flat).toMatch(/madde metninde KALMAMALI/);
        // Nedeni yazılmazsa model kuralı geçiştirir
        expect(flat).toMatch(/işarete değil metne inanır/);
        expect(flat).toMatch(/tercih sebebi/);
    });

    it('forbids adding anything, with the consequence spelled out', () => {
        expect(flat).toMatch(/HİÇBİR ŞEY EKLEME/);
        expect(flat).toMatch(/Bu kural mutlaktır: uydurulmuş bir şart gerçek adayları eler/);
    });

    it('forbids dropping anything', () => {
        expect(flat).toMatch(/HİÇBİR ŞEY DÜŞÜRME/);
        expect(flat).toMatch(/her konu çıktıda bir maddeye girmeli/);
    });

    it('protects the user\'s own wording', () => {
        // Bu onun ilanı; AI diline çevirmek sahiplik hissini bozar
        expect(flat).toMatch(/KULLANICININ SÖZCÜKLERİNİ KORU/);
        expect(flat).toMatch(/yeniden yazma, sadece ayır ve temizle/);
    });

    it('keeps the quote rule that broke JSON parsing before', () => {
        expect(flat).toMatch(/TIRNAK KURALI/);
        expect(flat).toMatch(/Kaçışsız tırnak/);
    });
});

describe('normalizeRequirements', () => {
    it('documents that the output is never applied directly', () => {
        expect(flat).toMatch(/Çıktı DOĞRUDAN UYGULANMAZ/);
        expect(flat).toMatch(/verifyNormalization/);
    });

    it('sanitizes every free-text value it sends', () => {
        expect(flat).toMatch(/POZISYON: sanitizeForPrompt/);
        expect(flat).toMatch(/ZORUNLU_KUTUSU: sanitizeForPrompt/);
        expect(flat).toMatch(/TERCIHEN_KUTUSU: sanitizeForPrompt/);
    });

    it('never sends candidate data — this is about the job ad only', () => {
        expect(source).not.toMatch(/candidate|cvText|cvData|positionAnalyses/);
    });

    it('caps the item count so a pasted document cannot explode the position', () => {
        expect(flat).toMatch(/En fazla 30 madde üret/);
        expect(flat).toMatch(/\.slice\(0, 30\)/);
    });
});
