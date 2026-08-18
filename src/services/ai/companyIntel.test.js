// ŞİRKET ÇÖZÜMLEME — en önemli test KAYNAKSIZ KANITI GİZLEYEN test.
//
// marketResearch'teki kuralın aynısı ama burada bahis daha yüksek: oradaki
// yanlış çıktı bir bütçe kararını kaydırır, buradaki bir insanı yalancılıkla
// suçlar. Model "bu şirketi bulamadım" diye hatırlayabilir; hatırlamak arama
// değildir.
//
// İkinci kritik grup: "bulamadım" ile "yok" ayrımı. Türkiye'de web sitesi
// olmayan gerçek şirket sayısı çok; modelin bulamaması şirketin var olmadığı
// anlamına gelmez ve öyle kaydedilirse aday haksız yere şüpheli olur.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const askGrounded = vi.fn();
vi.mock('./grounded.js', () => ({ askGrounded: (...args) => askGrounded(...args) }));

const { buildCompanyQuery, parseCompanyAnswer, resolveCompany, uniqueCompanies, companyKey } =
    await import('./companyIntel.js');

const ANSWER = [
    'Infoset, Türkiye merkezli bir müşteri iletişim yazılımı şirketi.',
    '',
    'VAR_MI: evet',
    'WEB_SITESI: https://www.infoset.app/tr',
    'KURULUS_YILI: 2019',
    'OLCEK: 11-50',
    'SEKTOR: çağrı merkezi ve müşteri iletişimi yazılımı',
    'IS_MODELI: b2b',
    'GELIR_TIPI: saas',
    'MERKEZ: İstanbul, Türkiye',
    'KURUCULAR: Ahmet Yılmaz; Ayşe Kaya',
    'SICIL_KURULUS: 2019',
    'SICIL_KURUCULAR: Ahmet Yılmaz',
    'NOT: Ölçek bilgisi LinkedIn sayfasından, resmî kaynak değil.',
].join('\n');

const SOURCE = { title: 'Infoset hakkında', uri: 'https://example.com/infoset' };

const reply = (over = {}) => ({
    text: ANSWER, sources: [SOURCE], searchSuggestionHtml: '<div>öneri</div>',
    searchQueries: ['infoset şirket'], grounded: true, ...over,
});

beforeEach(() => { askGrounded.mockReset(); });

describe('buildCompanyQuery', () => {
    it('carries the company name and the disambiguating hint', () => {
        const q = buildCompanyQuery('Delta Yazılım', { hint: 'İstanbul, Growth Manager' });
        expect(q).toContain('Delta Yazılım');
        expect(q).toContain('İstanbul, Growth Manager');
    });

    it('omits the hint line when there is no hint', () => {
        expect(buildCompanyQuery('Infoset')).not.toContain('EK BAĞLAM');
    });

    // Prompt'un bu iki talimatı, aracın en tehlikeli iki hatasını engelliyor.
    it('tells the model not to invent people and not to say "does not exist"', () => {
        const q = buildCompanyQuery('Infoset');
        expect(q).toContain('KİŞİ ADI UYDURMA');
        expect(q).toContain('BULAMAMAK BİR SONUÇ DEĞİLDİR');
        expect(q).toContain('ARAMA ZORUNLU');
    });
});

describe('parseCompanyAnswer', () => {
    it('reads every labelled field', () => {
        const p = parseCompanyAnswer(ANSWER);
        expect(p.exists).toBe('evet');
        expect(p.website).toBe('infoset.app');
        expect(p.foundedYear).toBe(2019);
        expect(p.sizeBand).toBe('11-50');
        expect(p.model).toBe('b2b');
        expect(p.type).toBe('saas');
        expect(p.headquarters).toBe('İstanbul, Türkiye');
        expect(p.founders).toEqual(['Ahmet Yılmaz', 'Ayşe Kaya']);
    });

    it('maps the free-text sector onto the canonical taxonomy', () => {
        expect(parseCompanyAnswer(ANSWER).sector).toBe('musteri deneyimi');
    });

    // Model düz metin isterken satırları markdown'la biçimliyor.
    it('reads labels through markdown decoration', () => {
        const p = parseCompanyAnswer('- **VAR_MI:** evet\n* KURULUS_YILI: 2015');
        expect(p.exists).toBe('evet');
        expect(p.foundedYear).toBe(2015);
    });

    it('treats every flavour of "unknown" as empty', () => {
        const p = parseCompanyAnswer([
            'VAR_MI: bilinmiyor', 'WEB_SITESI: bilinmiyor', 'KURULUS_YILI: yok',
            'OLCEK: bilinmiyor', 'SEKTOR: bilinmiyor', 'KURUCULAR: bilinmiyor',
        ].join('\n'));
        expect(p.exists).toBe('bilinmiyor');
        expect(p.website).toBe('');
        expect(p.foundedYear).toBeNull();
        expect(p.sizeBand).toBeNull();
        expect(p.sector).toBeNull();
        expect(p.founders).toEqual([]);
    });

    // Boş bir registry nesnesi, companyClaims'te "hukuki kayıt bulundu" gibi
    // okunur ve oradan ÇELİŞKİ ağırlığı doğar.
    it('leaves registry null unless the registry actually said something', () => {
        expect(parseCompanyAnswer('SICIL_KURULUS: bilinmiyor\nSICIL_KURUCULAR: bilinmiyor').registry).toBeNull();
        expect(parseCompanyAnswer('SICIL_KURULUS: 2019').registry).toMatchObject({ foundedYear: 2019 });
    });

    // Soyadsız eşleşme yapılmıyor; tek kelimelik "isim" işe yaramaz ve
    // tutulursa kurucu listesini gürültüyle doldurur.
    it('drops single-word names', () => {
        expect(parseCompanyAnswer('KURUCULAR: Ahmet; Ayşe Kaya').founders).toEqual(['Ayşe Kaya']);
    });

    it('rejects a size band it does not recognise', () => {
        expect(parseCompanyAnswer('OLCEK: birkaç kişi').sizeBand).toBeNull();
    });

    it('normalises the website down to a bare domain', () => {
        expect(parseCompanyAnswer('WEB_SITESI: HTTPS://WWW.Ornek.com.tr/hakkimizda').website).toBe('ornek.com.tr');
        expect(parseCompanyAnswer('WEB_SITESI: bir sitesi yok').website).toBe('');
    });
});

describe('resolveCompany — sourceless evidence is withheld', () => {
    it('returns nothing but the name when no source backs the answer', async () => {
        askGrounded.mockResolvedValue(reply({ sources: [] }));
        const r = await resolveCompany('Infoset');
        expect(r.withheld).toBe(true);
        expect(r.exists).toBe('bilinmiyor');
        expect(r.founders).toEqual([]);
        expect(r.registry).toBeNull();
        expect(r.sector).toBeNull();
    });

    // "Arama hiç yapılamadı" ile "arama yapıldı ama kaynak gösterilmedi"
    // farklı şeyler; arayüz ikisini aynı cümleyle anlatırsa çelişki görünür.
    it('distinguishes never-searched from searched-but-uncited', async () => {
        askGrounded.mockResolvedValue(reply({ sources: [], searchQueries: ['infoset'] }));
        expect((await resolveCompany('Infoset')).withheldReason).toBe('searched-uncited');

        askGrounded.mockResolvedValue(reply({ sources: [], searchQueries: [] }));
        expect((await resolveCompany('Infoset')).withheldReason).toBe('not-searched');
    });

    it('passes the evidence through when it is sourced', async () => {
        askGrounded.mockResolvedValue(reply());
        const r = await resolveCompany('Infoset');
        expect(r.withheld).toBe(false);
        expect(r.sources).toHaveLength(1);
        expect(r.sector).toBe('musteri deneyimi');
        expect(r.registry.founders).toEqual(['Ahmet Yılmaz']);
        expect(r.resolvedAt).toBeTruthy();
    });

    it('asks for enough output tokens that the answer is not cut off', async () => {
        askGrounded.mockResolvedValue(reply());
        await resolveCompany('Infoset');
        expect(askGrounded.mock.calls[0][1]).toMatchObject({ maxOutputTokens: 4096 });
    });

    it('refuses an empty company name', async () => {
        await expect(resolveCompany('  ')).rejects.toThrow('Şirket adı gerekli');
        expect(askGrounded).not.toHaveBeenCalled();
    });
});

describe('companyKey / uniqueCompanies', () => {
    it('collapses legal suffixes and casing', () => {
        expect(companyKey('Infoset A.Ş.')).toBe(companyKey('INFOSET'));
        expect(companyKey('Delta Yazılım Ltd. Şti.')).toBe(companyKey('Delta Yazılım'));
    });

    it('keeps genuinely different companies apart', () => {
        expect(companyKey('Delta Yazılım')).not.toBe(companyKey('Delta Lojistik'));
    });

    // Aynı şirketi iki kez aratmak iki kat maliyet.
    it('lists each company once even across several roles', () => {
        const list = uniqueCompanies([
            { company: 'Infoset', duration: 'Oca 2020 - Ara 2021' },
            { company: 'Infoset A.Ş.', duration: 'Oca 2022 - Ağu 2026' },
            { company: 'Delta Yazılım', duration: 'Oca 2018 - Ara 2019' },
        ]);
        expect(list).toHaveLength(2);
        expect(list.map((c) => c.name)).toEqual(['Infoset', 'Delta Yazılım']);
    });

    it('skips blank company names', () => {
        expect(uniqueCompanies([{ company: '   ' }, { company: null }, {}])).toEqual([]);
        expect(uniqueCompanies(null)).toEqual([]);
    });
});
