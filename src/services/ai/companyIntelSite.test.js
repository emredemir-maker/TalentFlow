// SİTEYE ÇAPALANMIŞ ARAŞTIRMA SORGUSU.
//
// Bu testler modeli çağırmıyor: sorulan sorunun doğru olup olmadığını ölçüyor.
// Yanlış çapalanmış bir sorgu, aynı adı taşıyan başka bir şirketin verisini
// adayın geçmişine yapıştırır — ve bu, çağrı başarılı olduğu için hiçbir
// hata olarak görünmez.
import { describe, expect, it } from 'vitest';
import { buildSiteQuery } from './companyIntel';

describe('buildSiteQuery', () => {
    it('şirket adını ve alan adını birlikte veriyor', () => {
        const q = buildSiteQuery('Delta Yazılım', 'delta.com.tr');
        expect(q).toContain('ŞİRKET ADI: Delta Yazılım');
        expect(q).toContain('ŞİRKETİN ALAN ADI: delta.com.tr');
    });

    it('ARAŞTIRMAYI ALAN ADINA ÇAPALIYOR', () => {
        const q = buildSiteQuery('Delta', 'delta.com.tr');
        expect(q).toContain('BU ALAN ADINA ÇAPALA');
        expect(q).toContain('BENZER ADLI BAŞKA BİR ŞİRKETİ ANLATMA');
    });

    it('ULAŞILAMAYAN SİTEDE UYDURMA İSTENMİYOR', () => {
        expect(buildSiteQuery('Delta', 'delta.com.tr')).toContain('park edilmiş alan');
    });

    it('kaynaksız cevabın gösterilmeyeceği kuralı korunuyor', () => {
        // Ana yönerge de ekleniyor: arama zorunlu, kaynaksız satır yazılmıyor.
        const q = buildSiteQuery('Delta', 'delta.com.tr');
        expect(q).toContain('ARAMA ZORUNLU');
        expect(q).toContain('EKRANDA GÖSTERİLMEZ');
    });

    it('ek bağlam verilirse ekleniyor, verilmezse boş satır bırakmıyor', () => {
        expect(buildSiteQuery('Delta', 'delta.com.tr', { hint: 'İzmir' })).toContain('EK BAĞLAM: İzmir');
        expect(buildSiteQuery('Delta', 'delta.com.tr')).not.toContain('EK BAĞLAM');
    });

    it('etiketli alanlar isteniyor — ayrıştırıcı bunları okuyor', () => {
        const q = buildSiteQuery('Delta', 'delta.com.tr');
        for (const alan of ['VAR_MI', 'WEB_SITESI', 'KURULUS_YILI', 'OLCEK', 'SEKTOR', 'MERKEZ']) {
            expect(q).toContain(alan);
        }
    });
});
