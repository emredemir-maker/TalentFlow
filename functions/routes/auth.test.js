// Davetiye sorgusunun saf kısmı.
//
// Bu uç KİMLİK İSTEMİYOR (hesap henüz yok), dolayısıyla döndürdüğü her alan
// kimliksiz bir istemciye verilmiş sayılır. Testlerin işi tam olarak bu:
// sadece gerekli üç alanın çıktığını ve departman listesinin kuraldaki
// karşılığıyla aynı şekle geldiğini sabitlemek.
import { describe, expect, it } from 'vitest';

import { invitationPayload } from './auth.js';

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
