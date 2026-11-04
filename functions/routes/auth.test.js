// Davetiye sorgusunun saf kısmı.
//
// Bu uç KİMLİK İSTEMİYOR (hesap henüz yok), dolayısıyla döndürdüğü her alan
// kimliksiz bir istemciye verilmiş sayılır. Testlerin işi tam olarak bu:
// sadece gerekli üç alanın çıktığını ve departman listesinin kuraldaki
// karşılığıyla aynı şekle geldiğini sabitlemek.
import { describe, expect, it } from 'vitest';

import { googleTokenEmail, invitationPayload, sameAccount } from './auth.js';

/** Firestore doküman görünümü — test için asgari şekil. */
const belge = (id, data) => ({ id, data: () => data });

describe('invitationPayload', () => {
    it('yalnızca üç alan dönüyor', () => {
        const out = invitationPayload(belge('inv-1', {
            email: 'aday@ornek.com',
            role: 'department_user',
            departments: ['Yazılım'],
            status: 'pending',
            invitedBy: 'ik@ornek.com',
            createdAt: 'zaman-damgasi',
        }));
        expect(Object.keys(out).sort()).toEqual(['departments', 'inviteId', 'role']);
        expect(out.inviteId).toBe('inv-1');
        expect(out.role).toBe('department_user');
    });

    it('DAVET EDENİN KİMLİĞİ SIZMIYOR', () => {
        // Kimliksiz bir uçtan davet dokümanını olduğu gibi vermek, davet eden
        // kişinin e-postasını ve zaman damgalarını da vermek olurdu.
        const out = invitationPayload(belge('inv-1', { invitedBy: 'ik@ornek.com', email: 'aday@ornek.com' }));
        expect(JSON.stringify(out)).not.toContain('ik@ornek.com');
        expect(JSON.stringify(out)).not.toContain('aday@ornek.com');
    });

    it('ESKİ TEKİL ALAN LİSTEYE ÇEVRİLİYOR', () => {
        // Aynı geri düşme zinciri firestore.rules içinde de var
        // (inviteDepartments). İkisi ayrışırsa kural, istemcinin yazdığı
        // profili reddeder ve kayıt sessizce başarısız olur.
        expect(invitationPayload(belge('i', { department: 'Satış' })).departments).toEqual(['Satış']);
    });

    it('departman yoksa boş liste — undefined değil', () => {
        expect(invitationPayload(belge('i', {})).departments).toEqual([]);
    });

    it('rol yazılmamışsa recruiter varsayılıyor', () => {
        expect(invitationPayload(belge('i', {})).role).toBe('recruiter');
    });

    it('bozuk belge çökertmiyor', () => {
        expect(invitationPayload({ id: 'i' }).role).toBe('recruiter');
        expect(invitationPayload({ id: 'i', data: () => null }).departments).toEqual([]);
    });
});

describe('Google jetonunun sahibi', () => {
    const yanit = (status, body) => async () => ({ ok: status === 200, status, json: async () => body });

    it('e-postayı Google yanıtından okur', async () => {
        expect(await googleTokenEmail('j', yanit(200, { email: 'a@ornek.com', email_verified: true }))).toBe('a@ornek.com');
    });
    it('geçersiz jeton ya da doğrulanmamış e-posta sahip sayılmaz', async () => {
        expect(await googleTokenEmail('j', yanit(401, {}))).toBeNull();
        expect(await googleTokenEmail('j', yanit(200, { email: 'a@ornek.com', email_verified: false }))).toBeNull();
        expect(await googleTokenEmail('j', yanit(200, { email_verified: true }))).toBeNull();
    });
    it('hesap karşılaştırması: büyük/küçük harf fark etmez, boş eşleşmez', () => {
        expect(sameAccount('A@ornek.com', 'a@ornek.com')).toBe(true);
        expect(sameAccount('b@ornek.com', 'a@ornek.com')).toBe(false);
        expect(sameAccount(null, 'a@ornek.com')).toBe(false);
        expect(sameAccount('', '')).toBe(false);
    });
});
