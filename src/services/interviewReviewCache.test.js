// İNCELEME DAMGASI — aynı girdi, aynı damga.
//
// Damganın tek işi var: girdi değişmedikçe saklanmış yorumu bulmak, girdi
// değiştiğinde bulmamak. Bu proje aynı sınıf tutarsızlığı bir kez yaşadı —
// aynı aday iki taramada 80 ile 65 aldı — ve çözüm her seferinde aynı oldu:
// damgala ve sakla.
import { describe, expect, it } from 'vitest';

import { reviewFingerprint } from './interviewReviewCache';

const summary = (over = {}) => ({
    pozisyon: 'Growth PM',
    damga_dagilimi: { met: 2, partial: 1, missing: 0, inconclusive: 0 },
    hic_sorulmamis_maddeler: ['B2B pazarlama'],
    ...over,
});

describe('reviewFingerprint', () => {
    it('is stable for identical input', () => {
        expect(reviewFingerprint(summary())).toBe(reviewFingerprint(summary()));
    });

    // Yeni bir görüşme eklendiğinde eski yorumu göstermek, güncel olmayan bir
    // sonucu güncel gibi sunmak olurdu.
    it('changes when the tally changes', () => {
        const a = reviewFingerprint(summary());
        const b = reviewFingerprint(summary({ damga_dagilimi: { met: 3, partial: 1, missing: 0, inconclusive: 0 } }));
        expect(a).not.toBe(b);
    });

    it('changes when the position changes', () => {
        expect(reviewFingerprint(summary())).not.toBe(reviewFingerprint(summary({ pozisyon: 'Data PM' })));
    });

    // Aynı sayılar ama farklı örneklem = farklı cevap gerektirir.
    it('changes when the sample changes', () => {
        const a = reviewFingerprint(summary({ orneklem: { okunan_gorusme: 25, toplam_gorusme: 200 } }));
        const b = reviewFingerprint(summary({ orneklem: { okunan_gorusme: 60, toplam_gorusme: 200 } }));
        expect(a).not.toBe(b);
    });

    it('produces a key safe for a Firestore document id', () => {
        expect(reviewFingerprint(summary())).toMatch(/^r[a-z0-9]+$/);
    });
});
