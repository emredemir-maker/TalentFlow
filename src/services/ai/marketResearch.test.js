// PİYASA ARAŞTIRMASI — en önemli test KAYNAKSIZ RAKAMI GİZLEYEN test.
//
// Prompt'a "kaynaksız sayı yazma" demek bir dilektir; kural kodda durmalı.
// Bu zincirin çıktısı birine yapılacak teklif: izlenemeyen bir sayıyla teklif
// verdirmek, uydurmayı veri diye sunmaktır.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const askGrounded = vi.fn();
vi.mock('./grounded.js', () => ({ askGrounded: (...args) => askGrounded(...args) }));

const { buildMarketQuery, parseMarketAnswer, researchMarket } = await import('./marketResearch.js');

const ANSWER = [
    'BANT_ALT: 90.000',
    'BANT_UST: 130000',
    'PARA_BIRIMI: TRY',
    'DONEM: aylik',
    'BAZ: brut',
    'TARIH: 2026 ilk yarı',
    'KAPSAM: Türkiye, İstanbul; senior seviye; 40 ilan taraması',
    'YAN_HAKLAR: özel sağlık sigortası; yemek kartı; uzaktan çalışma',
    'UYARI: Bant yalnızca ürün şirketlerini kapsıyor.',
].join('\n');

const SOURCE = { title: 'Maaş raporu 2026', uri: 'https://example.com/rapor' };

const reply = (over = {}) => ({
    text: ANSWER, sources: [SOURCE], searchSuggestionHtml: '<div>öneri</div>',
    searchQueries: ['growth pm maaş'], grounded: true, ...over,
});

beforeEach(() => { askGrounded.mockReset(); });

describe('buildMarketQuery', () => {
    it('builds the query from title, level and location', () => {
        const q = buildMarketQuery({ title: 'Growth PM', level: 'senior', location: 'İstanbul' });
        expect(q).toContain('Growth PM');
        expect(q).toContain('senior');
        expect(q).toContain('İstanbul');
    });

    // Söylenmemiş seviyeyi "senior" varsaymak bandı sessizce yukarı çeker.
    it('marks missing parts as unstated instead of inventing them', () => {
        const q = buildMarketQuery({ title: 'Growth PM' });
        expect(q).toContain('SEVİYE: belirtilmemiş');
        expect(q).toContain('KONUM: belirtilmemiş');
    });

    it('shifts the emphasis for a benefits question', () => {
        expect(buildMarketQuery({ title: 'X', subject: 'yan_haklar' })).toContain('YAN HAKLARDA');
    });
});

describe('parseMarketAnswer', () => {
    it('reads the labelled lines', () => {
        expect(parseMarketAnswer(ANSWER)).toMatchObject({
            min: 90000, max: 130000, currency: 'TRY', period: 'monthly', basis: 'gross',
            date: '2026 ilk yarı',
            benefits: ['özel sağlık sigortası', 'yemek kartı', 'uzaktan çalışma'],
            caution: 'Bant yalnızca ürün şirketlerini kapsıyor.',
        });
    });

    // BAZIN VARSAYILANI YOK: kaynak söylemiyorsa boş kalır ve karşılaştırmaya
    // girmez. Türkiye'de yanlış baz %30-40 kaydırır ve makul görünür.
    it('leaves the basis empty when the sources do not state one', () => {
        expect(parseMarketAnswer(ANSWER.replace('BAZ: brut', 'BAZ: bilinmiyor')).basis).toBeNull();
    });

    it('treats "yok" as no number, not as zero', () => {
        const out = parseMarketAnswer(ANSWER.replace('BANT_ALT: 90.000', 'BANT_ALT: yok').replace('BANT_UST: 130000', 'BANT_UST: yok'));
        expect(out.min).toBeNull();
        expect(out.max).toBeNull();
    });

    it('survives an unparseable answer', () => {
        expect(parseMarketAnswer('serbest metin')).toMatchObject({ min: null, max: null, benefits: [] });
        expect(parseMarketAnswer('')).toMatchObject({ min: null, max: null });
    });
});

describe('researchMarket', () => {
    it('returns a band when the answer is backed by sources', async () => {
        askGrounded.mockResolvedValue(reply());
        const out = await researchMarket({ title: 'Growth PM', level: 'senior', location: 'İstanbul' });
        expect(out.band).toEqual({ min: 90000, max: 130000, currency: 'TRY', period: 'monthly', basis: 'gross' });
        expect(out.withheld).toBe(false);
        expect(out.sources).toEqual([SOURCE]);
    });

    // KABUL KRİTERİ: kaynak listesi boşken ekranda maaş rakamı GÖRÜNMEZ.
    it('withholds the numbers when there are no sources', async () => {
        askGrounded.mockResolvedValue(reply({ sources: [] }));
        const out = await researchMarket({ title: 'Growth PM' });
        expect(out.band).toBeNull();
        // "bulunamadı" ile "bulundu ama gösteremiyoruz" ayrı şeyler; ekran
        // ikincisini söylemek zorunda.
        expect(out.withheld).toBe(true);
    });

    // CANLIDA GÖRÜLDÜ: Google'ın arama bloğu ekranda dururken "hiçbir kaynağa
    // dayanmıyor" yazıyordu — kullanıcı haklı olarak çelişki gördü. Arama
    // yapılmış olmakla iddianın izlenebilir olması ayrı şeyler.
    it('separates "searched but cited nothing" from "never searched"', async () => {
        askGrounded.mockResolvedValue(reply({ sources: [], searchQueries: ['growth pm salary'] }));
        const searched = await researchMarket({ title: 'Growth PM' });
        expect(searched.withheldReason).toBe('searched-uncited');
        expect(searched.searchQueries).toEqual(['growth pm salary']);

        askGrounded.mockResolvedValue(reply({ sources: [], searchQueries: [] }));
        expect((await researchMarket({ title: 'Growth PM' })).withheldReason).toBe('not-searched');
    });

    it('leaves the reason empty when sources did arrive', async () => {
        askGrounded.mockResolvedValue(reply());
        expect((await researchMarket({ title: 'Growth PM' })).withheldReason).toBe('');
    });

    it('does not claim withholding when the model found nothing either', async () => {
        askGrounded.mockResolvedValue(reply({ sources: [], text: 'BANT_ALT: yok\nBANT_UST: yok' }));
        const out = await researchMarket({ title: 'Growth PM' });
        expect(out.band).toBeNull();
        expect(out.withheld).toBe(false);
    });

    it('passes the ungrounded flag through so the screen can say so', async () => {
        askGrounded.mockResolvedValue(reply({ grounded: false, sources: [] }));
        expect((await researchMarket({ title: 'X' })).grounded).toBe(false);
    });

    it('reports back what was actually searched', async () => {
        askGrounded.mockResolvedValue(reply());
        const out = await researchMarket({ title: ' Growth PM ', level: 'senior', location: '' });
        expect(out.query).toEqual({ title: 'Growth PM', level: 'senior', location: '' });
    });
});
