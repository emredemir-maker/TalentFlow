import { describe, it, expect } from 'vitest';
import { STAGES, getStage, nextStageKey, stageOrder, reachedStage } from './pipelineStages';

describe('süreç aşamaları', () => {
    it('kullanıcının tanımladığı yedi aşama, bu sırayla', () => {
        expect(STAGES.map((s) => s.key)).toEqual([
            'ai_analysis',
            'review',
            'interview_scheduled',
            'interview_done',
            'offer',
            'hired',
            'rejected',
        ]);
    });

    it('etiketler süreçteki karşılıklarıyla aynı', () => {
        expect(getStage('ai_analysis').label).toBe('Ön İnceleme');
        expect(getStage('interview_scheduled').label).toBe('Planlı Mülakat');
        expect(getStage('interview_done').label).toBe('Mülakat Tamamlandı');
    });

    it('anahtarlar ve eski anahtarlar çakışmıyor', () => {
        const gorulen = new Set();
        for (const s of [...STAGES]) {
            for (const k of [s.key, ...s.legacy]) {
                expect(gorulen.has(k)).toBe(false);
                gorulen.add(k);
            }
        }
    });

    it('İLERLET DÜĞMESİ ADAYI REDDETMİYOR', () => {
        // Reddedildi sıranın sonunda ama ilerlemenin parçası değil.
        expect(nextStageKey('offer')).toBe('hired');
        expect(nextStageKey('hired')).toBeNull();
        expect(nextStageKey('interview_scheduled')).toBe('interview_done');
        expect(nextStageKey('rejected')).toBeNull();
    });

    it('huni sıralaması reddedileni saymıyor', () => {
        expect(stageOrder('rejected')).toBe(-1);
        expect(reachedStage('offer', 'interview_scheduled')).toBe(true);
        expect(reachedStage('review', 'interview_scheduled')).toBe(false);
        expect(reachedStage('rejected', 'review')).toBe(false);
    });

    it('bilinmeyen anahtar nötr aşamaya düşüyor, çökmüyor', () => {
        expect(getStage('yok').label).toBe('yok');
        expect(getStage(undefined).label).toBe('?');
    });
});
