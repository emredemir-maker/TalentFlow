// AI kullanım raporunun hesabı.
//
// Bu ekranın tek işi bir soruyu doğru cevaplamak: "hangi özellik pahalı?"
// Yanlış toplanmış bir tablo, yanlış yeri optimize ettirir — emek harcanır,
// fatura düşmez.
import { describe, expect, it } from 'vitest';

import { aggregateByLabel, usageTotals, limitState, labelText } from './aiUsageReport';

const GUNLER = [
    {
        day: '2026-09-05',
        totalCost: 1.5,
        calls: 30,
        rows: [
            { label: 'coverage', calls: 20, inTokens: 1000, outTokens: 2000, cost: 1.0 },
            { label: 'grounded', calls: 10, inTokens: 100, outTokens: 500, cost: 0.5 },
        ],
    },
    {
        day: '2026-09-04',
        totalCost: 0.5,
        calls: 10,
        rows: [
            { label: 'coverage', calls: 10, inTokens: 500, outTokens: 1000, cost: 0.5 },
        ],
    },
];

describe('aggregateByLabel', () => {
    it('GÜNLER BOYUNCA TOPLUYOR — tek günün dağılımı gürültülü', () => {
        const out = aggregateByLabel(GUNLER);
        const coverage = out.find((r) => r.label === 'coverage');
        expect(coverage.calls).toBe(30);
        expect(coverage.cost).toBeCloseTo(1.5);
        expect(coverage.inTokens).toBe(1500);
    });

    it('pahalıdan ucuza sıralanıyor', () => {
        expect(aggregateByLabel(GUNLER).map((r) => r.label)).toEqual(['coverage', 'grounded']);
    });

    it('ÇAĞRI BAŞI MALİYET HESAPLANIYOR', () => {
        // Toplam eşit olabilir ama 1000 ucuz çağrı ile 10 pahalı çağrı farklı
        // şeyler yapılmasını gerektirir.
        const out = aggregateByLabel(GUNLER);
        expect(out.find((r) => r.label === 'grounded').perCall).toBeCloseTo(0.05);
    });

    it('sıfır çağrıda bölme hatası yok', () => {
        const out = aggregateByLabel([{ rows: [{ label: 'other', calls: 0, cost: 0 }] }]);
        expect(out[0].perCall).toBe(0);
    });

    it('bozuk girdi çökertmiyor', () => {
        expect(aggregateByLabel(null)).toEqual([]);
        expect(aggregateByLabel([null, {}, { rows: 'metin' }])).toEqual([]);
        const out = aggregateByLabel([{ rows: [{ label: 'x', calls: 'iki', cost: null }] }]);
        expect(out[0].calls).toBe(0);
        expect(out[0].cost).toBe(0);
    });

    it('etiketsiz satır kaybolmuyor', () => {
        expect(aggregateByLabel([{ rows: [{ cost: 1 }] }])[0].label).toBe('other');
    });
});

describe('usageTotals', () => {
    it('aralığın toplamı', () => {
        expect(usageTotals(GUNLER)).toEqual({ cost: 2, calls: 40, dayCount: 2 });
    });

    it('boş aralık sıfır', () => {
        expect(usageTotals([])).toEqual({ cost: 0, calls: 0, dayCount: 0 });
        expect(usageTotals(undefined).cost).toBe(0);
    });
});

describe('limitState', () => {
    it('SINIR YOKSA FREN KAPALI DİYOR', () => {
        // Sıfır sınır "her şey doldu" değil, "fren yok" demek. Karıştırmak
        // ekranda kırmızı bir çubuk gösterirdi.
        expect(limitState(5000, 0)).toEqual({ open: false, ratio: 0, tone: 'none' });
        expect(limitState(0, null).tone).toBe('none');
    });

    it('UYARI SINIRA DEĞMEDEN ÖNCE ÇIKIYOR', () => {
        // %80 eşiği bilinçli: dolduğunda uyarmak geç, servis zaten durmuş olur.
        expect(limitState(79, 100).tone).toBe('ok');
        expect(limitState(80, 100).tone).toBe('warn');
        expect(limitState(100, 100).tone).toBe('over');
        expect(limitState(500, 100).tone).toBe('over');
    });

    it('oran çubuğu taşmıyor', () => {
        expect(limitState(500, 100).ratio).toBe(1);
    });

    it('negatif tüketim sıfır sayılıyor', () => {
        expect(limitState(-5, 100).ratio).toBe(0);
    });
});

describe('labelText', () => {
    it('bilinen etiket Türkçeye çevriliyor', () => {
        expect(labelText('coverage')).toBe('Madde damgaları (skor)');
    });

    it('BİLİNMEYEN ETİKET GİZLENMİYOR', () => {
        // Yeni bir özellik eklendiğinde tabloda görünmeli, boş satır değil.
        expect(labelText('yeni-ozellik')).toBe('yeni-ozellik');
        expect(labelText(null)).toBe('Bilinmiyor');
    });
});
