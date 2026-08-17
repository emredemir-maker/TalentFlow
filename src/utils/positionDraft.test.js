// POZİSYON TASLAĞI — modelin ürettiğini denetleyen katmanın testi.
//
// En önemlileri:
//   - modelin ÖNERDİĞİ madde ile kullanıcının SÖYLEDİĞİ madde ayrı kalıyor
//     (karışırsa kullanıcı uydurulmuş bir şartı kendi yazdığı sanır ve o şart
//      gerçek adayları eler)
//   - öncelik kelimesi metinde kalmışsa yakalanıyor
//   - brüt/net'i bilinmeyen band forma TAŞINMIYOR
import { describe, expect, it } from 'vitest';

import {
    normalizeDraft, lintDraft, draftToFormData, draftForPrompt, withBand,
    MAX_ITEMS, MANY_MUST,
} from './positionDraft';

const item = (text, over = {}) => ({ text, must: false, source: 'kullanici', ...over });

const RAW = {
    title: 'Growth PM',
    department: 'Ürün',
    summary: 'Kullanıcı büyümesinden sorumlu ürün yöneticisi.',
    level: 'senior',
    location: 'İstanbul',
    items: [
        item('Funnel sahipliği yapmış olmak', { must: true }),
        item('SQL ile kendi analizini çıkarabilmek', { source: 'oneri' }),
    ],
    assumptions: ['Ürün ekibine bağlı olduğunu varsaydım.'],
    gaps: ['Kaç yıl deneyim istiyorsunuz?'],
};

describe('normalizeDraft', () => {
    it('reads a full draft', () => {
        const d = normalizeDraft(RAW);
        expect(d).toMatchObject({ title: 'Growth PM', department: 'Ürün', level: 'senior', location: 'İstanbul' });
        expect(d.items).toEqual([
            { text: 'Funnel sahipliği yapmış olmak', must: true, source: 'user' },
            { text: 'SQL ile kendi analizini çıkarabilmek', must: false, source: 'model' },
        ]);
    });

    // KAYNAK VARSAYILANI "model": kullanıcının söylediğini model işaretlemeyi
    // unutursa madde "öneri" görünür. Yanlış tarafa düşmesi gereken yön bu —
    // kullanıcı fazladan bir maddeyi gözden geçirir, eksik gözden geçirmez.
    it('treats an unmarked item as a model suggestion', () => {
        const d = normalizeDraft({ title: 'X', items: [{ text: 'madde' }] });
        expect(d.items[0].source).toBe('model');
    });

    it('drops empty items and caps the list', () => {
        const many = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => item(`madde ${i}`));
        const d = normalizeDraft({ title: 'X', items: [...many, { text: '   ' }] });
        expect(d.items).toHaveLength(MAX_ITEMS);
    });

    it('returns null when there is neither a title nor an item', () => {
        expect(normalizeDraft({ summary: 'yalnızca özet' })).toBeNull();
        expect(normalizeDraft(null)).toBeNull();
    });
});

describe('lintDraft', () => {
    // Öncelik metinde kalırsa değerlendirme yapan model işarete değil metne
    // inanır — çelişkili sinyal.
    it('catches a priority word left inside the item text', () => {
        const d = normalizeDraft({ title: 'X', items: [item('CRM ürün geçmişi (tercih sebebi)')] });
        expect(lintDraft(d).map((f) => f.code)).toContain('priority-in-text');
    });

    // Gerçek bir ilandan: "...en az 2-3 yıl deneyim; B2B SaaS deneyimi güçlü
    // artı" — tercih ifadesi ZORUNLU bir maddenin içinde duruyordu.
    it('catches "güçlü artı" hiding inside a mandatory item', () => {
        const d = normalizeDraft({
            title: 'X',
            items: [item('Müşteriyle birebir çalışılan bir rolde 2-3 yıl deneyim; B2B SaaS deneyimi güçlü artı', { must: true })],
        });
        expect(lintDraft(d).map((f) => f.code)).toContain('priority-in-text');
    });

    it('flags an item long enough to be asking several things', () => {
        const d = normalizeDraft({ title: 'X', items: [item('a'.repeat(200))] });
        expect(lintDraft(d).map((f) => f.code)).toContain('too-long');
    });

    it('catches duplicates regardless of Turkish casing', () => {
        const d = normalizeDraft({ title: 'X', items: [item('İSTANBUL deneyimi'), item('istanbul deneyimi')] });
        expect(lintDraft(d).map((f) => f.code)).toContain('duplicate');
    });

    it('warns when nothing is mandatory — the knockout gate would never fire', () => {
        const d = normalizeDraft({ title: 'X', items: [item('bir madde')] });
        expect(lintDraft(d).map((f) => f.code)).toContain('no-must');
    });

    it('warns when there are too many mandatory items', () => {
        const items = Array.from({ length: MANY_MUST + 1 }, (_, i) => item(`madde ${i}`, { must: true }));
        expect(lintDraft(normalizeDraft({ title: 'X', items })).map((f) => f.code)).toContain('many-must');
    });

    // Kullanıcı neyi onayladığını görmeli: uydurulmuş bir şart gerçek adayları
    // eler.
    it('says how many items are the model’s own suggestion', () => {
        const d = normalizeDraft(RAW);
        const found = lintDraft(d).find((f) => f.code === 'model-suggested');
        expect(found.text).toContain('1 madde');
    });

    it('stays quiet on a clean draft', () => {
        const d = normalizeDraft({
            title: 'X',
            items: [item('Funnel sahipliği', { must: true }), item('SQL bilgisi')],
        });
        expect(lintDraft(d)).toEqual([]);
    });
});

describe('draftToFormData', () => {
    it('maps the draft onto the position form', () => {
        const form = draftToFormData(normalizeDraft(RAW));
        expect(form).toMatchObject({
            title: 'Growth PM',
            department: 'Ürün',
            description: 'Kullanıcı büyümesinden sorumlu ürün yöneticisi.',
        });
        expect(form.reqItems).toEqual([
            { text: 'Funnel sahipliği yapmış olmak', must: true },
            { text: 'SQL ile kendi analizini çıkarabilmek', must: false },
        ]);
    });

    it('carries a band that knows its basis', () => {
        const d = withBand(normalizeDraft(RAW), { min: 90000, max: 130000, currency: 'TRY', period: 'monthly', basis: 'gross' }, 'market');
        expect(draftToFormData(d)).toMatchObject({ salaryMin: '90000', salaryMax: '130000', salaryBasis: 'gross' });
    });

    // Formdaki brüt/net seçicisinin boş seçeneği yok ve varsayılanı "brüt".
    // Bazı bilinmeyen bir bandı oraya yazmak, bilinmeyen bir şeyi BRÜT diye
    // iddia etmek olur — %30-40 kaydırır ve makul göründüğü için fark edilmez.
    it('refuses to carry a band whose basis is unknown', () => {
        const d = withBand(normalizeDraft(RAW), { min: 90000, max: 130000, currency: 'TRY', period: 'monthly' }, 'market');
        expect(d.band.basis).toBeNull();
        expect(draftToFormData(d)).toMatchObject({ salaryMin: '', salaryMax: '' });
    });
});

describe('draftForPrompt', () => {
    // Düzeltme isteği ("zorunluları üçe indir") var olanın üstüne çalışır;
    // model taslağı görmeden düzeltemez.
    it('carries priority and provenance back to the model', () => {
        expect(draftForPrompt(normalizeDraft(RAW)).maddeler).toEqual([
            { metin: 'Funnel sahipliği yapmış olmak', oncelik: 'zorunlu', kaynak: 'kullanici' },
            { metin: 'SQL ile kendi analizini çıkarabilmek', oncelik: 'tercihen', kaynak: 'oneri' },
        ]);
    });

    it('returns null when there is no draft yet', () => {
        expect(draftForPrompt(null)).toBeNull();
    });
});
