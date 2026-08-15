// KONUŞMA BELLEĞİNİN BORUSU — bağlam gerçekten prompt'a giriyor mu?
//
// `hrAssistantPrompt.test.js` prompt METNİNİ okuyor: kuralın yazılı olduğunu
// doğruluyor ama o kuralın işletilip işletilmediğini bilmiyor. Panel `turns`
// dizisini yıllarca tuttu ve modele hiç göndermedi — kayıp tam da bu boşlukta
// oldu: veri vardı, taşınmıyordu.
//
// Buradaki testler çağrının kendisine bakıyor.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const generateContent = vi.fn();
vi.mock('./config.js', () => ({
    getModel: vi.fn(async () => ({ generateContent })),
    getAuthHeaders: vi.fn(),
}));

const { questionToQuery } = await import('./hrAssistant.js');

const SPEC = JSON.stringify({ intent: 'list', filters: [] });

/** Son çağrının prompt metni. */
const lastPrompt = () => String(generateContent.mock.calls.at(-1)?.[0] || '');

beforeEach(() => {
    generateContent.mockReset();
    generateContent.mockResolvedValue({ response: { text: () => SPEC } });
});

describe('questionToQuery — geçmiş', () => {
    it('puts the previous turns into the prompt', async () => {
        await questionToQuery('peki onlardan İstanbul’da olanlar', {
            positions: [{ title: 'Growth PM' }],
            history: [{
                soru: '70 üstü adaylar',
                sorgu: { intent: 'list', position: 'Growth PM', filters: [{ field: 'score', op: 'gte', value: 70 }] },
                sonuc: { pozisyon: 'Growth PM', eslesen: 8 },
            }],
        });
        const prompt = lastPrompt();
        expect(prompt).toContain('ONCEKI_TURLAR');
        expect(prompt).toContain('70 üstü adaylar');
        expect(prompt).toContain('"value":70');
    });

    // Boş geçmişte "yok" yazmak, modele boş bir dizi göstermekten net.
    it('says "yok" when there is no history', async () => {
        await questionToQuery('kaç aday var', { positions: [] });
        expect(lastPrompt()).toMatch(/ONCEKI_TURLAR[\s\S]{0,40}yok/);
    });

    it('still works with no context argument at all', async () => {
        await expect(questionToQuery('kaç aday var')).resolves.toEqual({ intent: 'list', filters: [] });
    });

    // Bağlamı `assistantContext.buildContext` kuruyor ve aday adı koymuyor.
    // Buradaki test borunun kendisine bakıyor: çağıran taraf ne verdiyse o
    // gider, yani sınırın korunması buildContext'in sorumluluğunda kalır ve
    // orada testli (assistantContext.test.js).
    it('sends exactly the context it was handed, nothing more', async () => {
        await questionToQuery('soru', { positions: [], history: [{ soru: 'önceki', sorgu: null, sonuc: null }] });
        const prompt = lastPrompt();
        expect(prompt).toContain('önceki');
        expect(prompt).not.toContain('candidate');
    });
});
