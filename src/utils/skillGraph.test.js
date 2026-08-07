import { describe, expect, it } from 'vitest';
import { skillAffinity, canonicalSkill, skillGraphSize, danglingImplications } from './skillGraph.js';

describe('graf bütünlüğü', () => {
    it('has no implication pointing at a term that is not a node', () => {
        // Böyle bir dal sessizce ölü kalır: canonicalSkill hedefi çözemez ve
        // o beceriden hiçbir yakınlık üretilmez. 'bulut' eklenirken tam olarak
        // bu oldu — aws/azure/gcp hiçbir işe yaramıyordu.
        expect(danglingImplications()).toEqual([]);
    });
});

describe('canonicalSkill', () => {
    it('resolves aliases to one canonical name', () => {
        expect(canonicalSkill('js')).toBe('javascript');
        expect(canonicalSkill('JavaScript')).toBe('javascript');
        expect(canonicalSkill('google analytics')).toBe('ga4');
        expect(canonicalSkill('recruitment')).toBe('işe alım');
    });

    it('returns null for unknown or empty input', () => {
        expect(canonicalSkill('kahve demleme')).toBeNull();
        expect(canonicalSkill('')).toBeNull();
        expect(canonicalSkill(null)).toBeNull();
    });
});

describe('skillAffinity — yön önemli', () => {
    it('gives full credit for the same skill under a different name', () => {
        expect(skillAffinity('javascript', ['JS'])).toBe(1);
    });

    it('credits a candidate whose skill IMPLIES the requirement', () => {
        // React bilen JavaScript bilir
        expect(skillAffinity('javascript', ['react'])).toBe(0.9);
    });

    it('credits much less in the reverse direction', () => {
        // JavaScript bilen React bilmek zorunda değil — asimetri kasıtlı
        const forward = skillAffinity('javascript', ['react']);
        const backward = skillAffinity('react', ['javascript']);
        expect(backward).toBeLessThan(forward);
        expect(backward).toBe(0.4);
    });

    it('follows implication chains', () => {
        // next.js → react → javascript
        expect(skillAffinity('javascript', ['next.js'])).toBe(0.9);
    });

    it('credits sibling tools that share a parent', () => {
        // Amplitude ve Mixpanel ikisi de ürün analitiği — bilgi transfer olur
        expect(skillAffinity('amplitude', ['mixpanel'])).toBe(0.6);
    });

    it('gives nothing for genuinely unrelated skills', () => {
        expect(skillAffinity('bordro', ['kubernetes'])).toBe(0);
        expect(skillAffinity('javascript', ['muhasebe'])).toBe(0);
    });

    it('does not link two tools merely because both are software', () => {
        // Eski düz grup yaklaşımının hatası: redis ile security aynı
        // "backend" grubundaydı ve birbirine yakın sayılıyordu
        expect(skillAffinity('terraform', ['postgresql'])).toBe(0);
    });

    it('takes the strongest signal when several skills match', () => {
        expect(skillAffinity('javascript', ['muhasebe', 'react', 'excel'])).toBe(0.9);
    });

    it('handles missing or malformed input safely', () => {
        expect(skillAffinity('javascript', null)).toBe(0);
        expect(skillAffinity(null, ['react'])).toBe(0);
        expect(skillAffinity('javascript', [null, 42, ''])).toBe(0);
    });
});

describe('skillAffinity — alan bağımsızlığı', () => {
    // Kullanıcının açık isteği: "tek bir pozisyon için olmasın".
    // Her alan için en az bir yakınlık kurulabilmeli.
    const CASES = [
        ['Satış',            'crm',                ['salesforce']],
        ['Pazarlama',        'dijital pazarlama',  ['google ads']],
        ['İnsan kaynakları', 'insan kaynakları',   ['bordro']],
        ['Finans',           'finans',             ['muhasebe']],
        ['Operasyon',        'operasyon',          ['tedarik zinciri']],
        ['Müşteri deneyimi', 'destek masası',      ['zendesk']],
        ['Tasarım',          'ui tasarımı',        ['figma']],
        ['Analitik',         'veri görselleştirme', ['power bi']],
        ['Ürün',             'agile',              ['scrum']],
        ['Yazılım',          'bulut',              ['aws']],
    ];

    it.each(CASES)('%s alanında yakınlık kurar', (_domain, requirement, skills) => {
        expect(skillAffinity(requirement, skills)).toBeGreaterThanOrEqual(0.6);
    });

    it('covers a meaningful number of skills', () => {
        expect(skillGraphSize()).toBeGreaterThan(80);
    });
});
