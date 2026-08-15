// ARAÇ KAYDI — asistanın yapabildiklerinin tek listesi.
//
// Kayıt olmadan her yeni yetenek prompt'u yeniden yazmak demekti ve
// "asistan neyi yapabilir" sorusunun cevabı üç ayrı yere dağılmıştı:
// prompt'un alan sözlüğü, paneldeki örnek soru listesi, ve kullanıcıya
// gösterilen hata metni. Üçü ayrı ayrı güncelleniyordu — yani güncellenmiyordu.
import { describe, expect, it } from 'vitest';

import { TOOLS, toolById, toolMenu, capabilityMessage } from './assistantTools';

describe('araç kaydı', () => {
    it('gives every tool the fields the router and the UI both need', () => {
        for (const tool of TOOLS) {
            expect(tool.id).toMatch(/^[a-z_]+$/);
            expect(tool.label).toBeTruthy();
            expect(tool.description.length).toBeGreaterThan(20);
            expect(Array.isArray(tool.examples)).toBe(true);
        }
    });

    it('has no duplicate ids', () => {
        expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    });

    it('still carries the candidate query as a tool', () => {
        expect(toolById('aday_sorgusu')).toBeTruthy();
    });
});

describe('toolById', () => {
    // ARACI KOD DOĞRULAR. Model uydurma ya da hatırladığı bir kimlik yazarsa
    // dispatch sessizce boşa düşerdi — kullanıcı cevap beklerken hiçbir şey
    // olmazdı.
    it('rejects an id that is not registered', () => {
        expect(toolById('maas_arastirmasi')).toBeNull();
        expect(toolById('')).toBeNull();
        expect(toolById(null)).toBeNull();
        expect(toolById(undefined)).toBeNull();
    });
});

describe('toolMenu', () => {
    it('lists every tool with its id so the model can name one', () => {
        const menu = toolMenu();
        for (const tool of TOOLS) {
            expect(menu).toContain(tool.id);
            expect(menu).toContain(tool.description);
        }
    });
});

describe('capabilityMessage', () => {
    // "Bunu yapamam" tek başına kullanıcıyı denemeyi bırakmaya iter.
    it('names what the assistant CAN do, not just what it cannot', () => {
        const msg = capabilityMessage('Sistemde maaş beklentisi alanı tutulmuyor.');
        expect(msg).toContain('Sistemde maaş beklentisi alanı tutulmuyor.');
        for (const tool of TOOLS) expect(msg).toContain(tool.label);
    });

    it('still lists the capabilities when there is no reason to show', () => {
        const msg = capabilityMessage();
        expect(msg).toContain('Şu an yapabildiklerim');
        expect(msg.startsWith('\n')).toBe(false);
    });
});
