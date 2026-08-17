// KONUŞMA BELLEĞİ — ne taşınır, ne taşınmaz.
//
// Panel `turns` tutuyor ama modele hiç göndermiyordu; her soru sıfırdan
// başlıyordu ve "peki onlardan İstanbul'da olanlar" çalışmıyordu.
//
// Bellek eklerken korunması gereken sınır: çevirmen çağrısı bugüne kadar hiç
// CV kökenli metin görmedi. Aday adı CV'den geliyor ve CV bu projede
// GÜVENİLMEZ veri — bir adayın kendini "önceki talimatları yok say" diye
// adlandırması engellenemez. Aşağıdaki testlerin yarısı bu sınırı bekliyor.
import { describe, expect, it } from 'vitest';

import {
    buildContext,
    compactSpec,
    serializeTurns,
    MAX_CONTEXT_TURNS,
    MAX_SUGGESTION_HTML,
} from './assistantContext';

const spec = (over = {}) => ({
    intent: 'list',
    position: 'Growth PM',
    filters: [{ field: 'score', op: 'gte', value: 70 }],
    ...over,
});

const result = (over = {}) => ({
    positionTitle: 'Growth PM',
    pool: 120,
    total: 8,
    skipped: 3,
    truncated: false,
    limit: null,
    applied: ['puan ≥ 70'],
    ignored: [],
    groups: null,
    rows: [{
        score: 82,
        candidate: {
            id: 'c1',
            name: 'Ayşe Yılmaz',
            location: 'İstanbul',
            cvText: 'ÇOK UZUN CV METNİ'.repeat(200),
            email: 'a@b.com',
        },
    }],
    ...over,
});

const pair = (question, assistant) => ([
    { role: 'user', text: question },
    { role: 'assistant', ...assistant },
]);

describe('compactSpec', () => {
    it('keeps the fields that describe what was asked', () => {
        expect(compactSpec(spec({ limit: 5, sort: { field: 'score', dir: 'desc' } }))).toEqual({
            intent: 'list',
            position: 'Growth PM',
            filters: [{ field: 'score', op: 'gte', value: 70 }],
            sort: { field: 'score', dir: 'desc' },
            limit: 5,
        });
    });

    // unsupported bir hata açıklaması, sorgunun parçası değil.
    it('drops the unsupported explanation', () => {
        const out = compactSpec({ intent: 'list', filters: [], unsupported: 'Maaş alanı yok.' });
        expect(out).toEqual({ intent: 'list' });
    });

    it('returns null for junk', () => {
        expect(compactSpec(null)).toBeNull();
        expect(compactSpec({})).toBeNull();
    });
});

describe('buildContext — sınır', () => {
    // ASIL KURAL BU.
    it('never carries a candidate name into the context', () => {
        const ctx = buildContext(pair('70 üstü adaylar', { spec: spec(), result: result() }));
        expect(JSON.stringify(ctx)).not.toContain('Ayşe');
    });

    it('never carries CV text into the context', () => {
        const ctx = buildContext(pair('70 üstü adaylar', { spec: spec(), result: result() }));
        expect(JSON.stringify(ctx)).not.toContain('UZUN CV METNİ');
    });

    it('carries the previous query so a follow-up can inherit it', () => {
        const ctx = buildContext(pair('70 üstü adaylar', { spec: spec(), result: result() }));
        expect(ctx[0].sorgu.filters).toEqual([{ field: 'score', op: 'gte', value: 70 }]);
        expect(ctx[0].sorgu.position).toBe('Growth PM');
        expect(ctx[0].sonuc).toEqual({ pozisyon: 'Growth PM', eslesen: 8 });
    });
});

describe('buildContext — seçim', () => {
    // Başarısız bir turu "önceki sorgu" diye sunmak, modeli olmayan bir sonuca
    // atıf yapmaya iter.
    it('skips a turn that ended in an error', () => {
        const turns = [
            ...pair('bozuk soru', { error: 'Sorgu çalıştırılamadı.' }),
            ...pair('70 üstü adaylar', { spec: spec(), result: result() }),
        ];
        const ctx = buildContext(turns);
        expect(ctx).toHaveLength(1);
        expect(ctx[0].soru).toBe('70 üstü adaylar');
    });

    it('keeps an unsupported turn but marks it', () => {
        const ctx = buildContext(pair('maaşı 100k altı', { unsupported: 'Maaş alanı yok.' }));
        expect(ctx[0].cevaplanamadi).toBe(true);
    });

    it('keeps at most MAX_CONTEXT_TURNS pairs', () => {
        const turns = Array.from({ length: MAX_CONTEXT_TURNS + 4 }, (_, i) =>
            pair(`soru ${i}`, { spec: spec(), result: result() })).flat();
        expect(buildContext(turns)).toHaveLength(MAX_CONTEXT_TURNS);
    });

    // Kullanıcının az önce sorduğu şey bağlamın en değerli parçası.
    it('drops the OLDEST pair when the character cap is hit', () => {
        const turns = [
            ...pair('en eski soru', { spec: spec(), result: result() }),
            ...pair('en yeni soru', { spec: spec(), result: result() }),
        ];
        const ctx = buildContext(turns, { maxChars: 200 });
        expect(ctx).toHaveLength(1);
        expect(ctx[0].soru).toBe('en yeni soru');
    });

    it('handles an empty or malformed list', () => {
        expect(buildContext([])).toEqual([]);
        expect(buildContext(null)).toEqual([]);
        expect(buildContext([{ role: 'user', text: 'cevapsız' }])).toEqual([]);
    });
});

describe('serializeTurns', () => {
    // Canlı satırlar her adayın TAM belgesini taşıyor; onu Firestore'a yazmak
    // hem 1MB sınırını zorlar hem aday verisini ikinci bir yere kopyalar.
    it('strips everything the screen does not use from a row', () => {
        const [stored] = serializeTurns([{ role: 'assistant', result: result() }]);
        expect(stored.result.rows[0].candidate).toEqual({
            id: 'c1', name: 'Ayşe Yılmaz', location: 'İstanbul',
        });
        expect(JSON.stringify(stored)).not.toContain('UZUN CV METNİ');
        expect(JSON.stringify(stored)).not.toContain('a@b.com');
    });

    it('keeps what the audit box renders', () => {
        const [stored] = serializeTurns([{ role: 'assistant', result: result() }]);
        expect(stored.result.pool).toBe(120);
        expect(stored.result.skipped).toBe(3);
        expect(stored.result.applied).toEqual(['puan ≥ 70']);
    });

    it('keeps the spec so a reloaded chat can still be followed up', () => {
        const [stored] = serializeTurns([{ role: 'assistant', spec: spec(), result: result() }]);
        expect(stored.spec.position).toBe('Growth PM');
    });

    it('keeps user turns as plain text', () => {
        expect(serializeTurns([{ role: 'user', text: 'merhaba' }])).toEqual([
            { role: 'user', text: 'merhaba' },
        ]);
    });

    it('caps the stored history', () => {
        const turns = Array.from({ length: 60 }, (_, i) => ({ role: 'user', text: `s${i}` }));
        const stored = serializeTurns(turns, 10);
        expect(stored).toHaveLength(10);
        expect(stored[9].text).toBe('s59');
    });

    it('survives a turn with no result at all', () => {
        expect(serializeTurns([{ role: 'assistant', unsupported: 'yok' }])).toEqual([
            { role: 'assistant', unsupported: 'yok' },
        ]);
    });

    // ARAÇ ÇIKTISI SAKLANMAZSA TUR ÇÖKER. Mülakat incelemesi turu kaydedilirken
    // `review` düşüyordu; sayfa yenilenince panel o turu aday sorgusu sanıp
    // `result.groups` okuyor ve TÜM sohbet çöküyordu.
    it('stores the interview review a turn needs to render itself', () => {
        const [stored] = serializeTurns([{
            role: 'assistant',
            spec: { tool: 'mulakat_incelemesi' },
            question: 'bu pozisyonda kimlerle görüştük',
            review: {
                position: 'Growth PM', interviewCount: 4, scored: 3,
                tally: { met: 5, partial: 2, missing: 1, inconclusive: 0 },
                unscored: [{ name: 'Ayşe', reason: 'bağ yok' }], staleCount: 1,
                // Ekranda hiç görünmeyen ağır alan — saklanmamalı.
                perCandidate: [{ name: 'Ayşe', quotes: [{ quote: 'uzun alıntı' }] }],
            },
            loaded: { matchedCandidates: 6, withoutInterview: 2, truncated: 0, totalSessions: 4 },
            narration: { ozet: 'kısa özet' },
        }]);

        expect(stored.review).toMatchObject({ interviewCount: 4, scored: 3, staleCount: 1 });
        expect(stored.review.perCandidate).toBeUndefined();
        expect(stored.loaded).toMatchObject({ matchedCandidates: 6, totalSessions: 4 });
        expect(stored.narration).toEqual({ ozet: 'kısa özet' });
        expect(stored.question).toBe('bu pozisyonda kimlerle görüştük');
    });

    it('stores a market answer with its sources', () => {
        const [stored] = serializeTurns([{
            role: 'assistant',
            spec: { tool: 'piyasa_arastirmasi' },
            market: {
                band: { min: 90000, max: 130000, currency: 'TRY', period: 'monthly', basis: 'gross' },
                withheld: false, grounded: true, date: '2026', scope: 'İstanbul',
                benefits: ['yemek kartı'], caution: '',
                sources: [{ title: 'Rapor', uri: 'https://example.com' }],
                searchSuggestionHtml: '<div>öneri</div>',
                query: { title: 'Growth PM', level: 'senior', location: 'İstanbul' },
            },
        }]);
        expect(stored.market.band.min).toBe(90000);
        expect(stored.market.sources).toEqual([{ title: 'Rapor', uri: 'https://example.com' }]);
        expect(stored.market.searchSuggestionHtml).toBe('<div>öneri</div>');
    });

    // Google'ın arama önerisi bloğu OLDUĞU GİBİ gösterilmek zorunda. Sığmıyorsa
    // kaynakları gösterip şartı düşürmek yerine cevabın tamamını saklamıyoruz.
    it('drops the whole market answer when the required search block will not fit', () => {
        const [stored] = serializeTurns([{
            role: 'assistant',
            market: {
                band: { min: 1, max: 2, currency: 'TRY', period: 'monthly', basis: null },
                sources: [{ title: 'Rapor', uri: 'https://example.com' }],
                searchSuggestionHtml: 'x'.repeat(MAX_SUGGESTION_HTML + 1),
            },
        }]);
        expect(stored.market).toBeUndefined();
        expect(stored.detailOmitted).toBe(true);
    });
});
