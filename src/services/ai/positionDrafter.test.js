// TASLAK ÜRETİCİSİ — kesilen cevap ve SEBEBİ DOĞRU SÖYLEMEK.
//
// Canlıda çıktı: gayet somut bir düzeltme isteği ("tercihen maddelere ekle:
// Zendesk/Intercom, İngilizce, CRM…") "Taslak üretilemedi. İsteği biraz daha
// somut yazmayı deneyin." ile döndü. İstek kusursuzdu; modelin JSON'u YARIDA
// KESİLMİŞTİ. Kullanıcı cümlesini yeniden yazarak zaman kaybetti.
//
// Buradaki testler iki şeyi sabitliyor: kesilme ihtimalinde İKİNCİ BİR DENEME
// yapılıyor, ve başarısızlıkta mesaj isteği suçlamıyor.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('./config.js', () => ({
    getModel: vi.fn(async () => ({ generateContent })),
    getAuthHeaders: vi.fn(),
}));

const { draftPosition } = await import('./positionDrafter.js');

const DRAFT = {
    title: 'Customer Success Uzmanı',
    items: [{ text: 'Onboarding deneyimi', must: true, source: 'kullanici' }],
};
const ok = () => ({ response: { text: () => JSON.stringify(DRAFT) } });
const cut = () => ({ response: { text: () => '{"title":"Customer Success Uzmanı","items":[{"text":"Onbo' } });

beforeEach(() => generateContent.mockReset());

describe('draftPosition', () => {
    it('returns the draft on the first try', async () => {
        generateContent.mockResolvedValue(ok());
        expect(await draftPosition('CS uzmanı ilanı hazırla')).toMatchObject({ title: 'Customer Success Uzmanı' });
        expect(generateContent).toHaveBeenCalledTimes(1);
    });

    // Düzeltmede model taslağın TAMAMINI yeniden yazmak zorunda; buna Gemini
    // 2.5'in düşünme token'ları ekleniyor ve ikisi de aynı bütçeden yeniyor.
    it('retries with a bigger budget when the answer was cut off', async () => {
        generateContent.mockResolvedValueOnce(cut()).mockResolvedValueOnce(ok());
        expect(await draftPosition('tercihen maddelere ekle: İngilizce')).toMatchObject({ title: 'Customer Success Uzmanı' });
        expect(generateContent).toHaveBeenCalledTimes(2);
        const [, firstOpts] = generateContent.mock.calls[0];
        const [, secondOpts] = generateContent.mock.calls[1];
        expect(secondOpts.maxOutputTokens).toBeGreaterThan(firstOpts.maxOutputTokens);
    });

    // SEBEBİ DOĞRU SÖYLE: eski mesaj isteği suçluyordu ve tam da isteğin
    // kusursuz olduğu bir durumda çıktı.
    it('blames the truncation, not the user’s wording', async () => {
        generateContent.mockResolvedValue(cut());
        await expect(draftPosition('tercihen maddelere ekle: İngilizce')).rejects.toThrow(/yarıda kesildi/);
        await expect(draftPosition('x')).rejects.toThrow(/Önceki taslak duruyor/);
    });

    it('says the answer was unreadable when it is not a truncation', async () => {
        generateContent.mockResolvedValue({ response: { text: () => 'düz metin cevap' } });
        await expect(draftPosition('x')).rejects.toThrow(/okunamadı/);
    });

    it('gives up after two attempts instead of looping', async () => {
        generateContent.mockResolvedValue(cut());
        await expect(draftPosition('x')).rejects.toThrow();
        expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('passes the previous draft so a refinement builds on it', async () => {
        generateContent.mockResolvedValue(ok());
        await draftPosition('zorunluları üçe indir', { previousDraft: { baslik: 'Growth PM' } });
        expect(generateContent.mock.calls[0][0]).toContain('Growth PM');
    });
});
