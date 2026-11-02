// Canlı mülakat AI bütçesi — toplu pencere, saatlik sınır, bekleme.
//
// Sabitlenen kurallar (Emre onaylı):
//   - 3 dakikalık pencere, yalnızca 40+ karakterlik yeni aday cümlesi varsa
//   - mülakat başına saatte en çok 20 analiz, "Şimdi analiz et" DAHİL
//   - takip sorusu: 60 sn bekleme, saatte en çok 10
import { describe, expect, it } from 'vitest';
import {
    LIVE_ANALYSIS_INTERVAL_MS,
    LIVE_ANALYSIS_HOURLY_CAP,
    LIVE_ANALYSIS_MIN_CHARS,
    LIVE_WINDOW_MAX_CHARS,
    FOLLOWUP_COOLDOWN_MS,
    FOLLOWUP_HOURLY_CAP,
    HOUR_MS,
    createRateGate,
    selectAnalysisWindow,
    takeLiveAnalysisTurn,
    minutesAgoText,
    gateMessage,
} from './liveInterviewBudget.js';

const LONG = 'Bu projede ölçümleme altyapısını sıfırdan kurdum ve dönüşümü artırdım.';
const aday = (text) => ({ role: 'ADAY', text });
const mul = (text) => ({ role: 'YÖNETİCİ', text });

describe('plan sabitleri', () => {
    it('matches the approved plan', () => {
        expect(LIVE_ANALYSIS_INTERVAL_MS).toBe(3 * 60 * 1000);
        expect(LIVE_ANALYSIS_MIN_CHARS).toBe(40);
        expect(LIVE_ANALYSIS_HOURLY_CAP).toBe(20);
        expect(FOLLOWUP_COOLDOWN_MS).toBe(60 * 1000);
        expect(FOLLOWUP_HOURLY_CAP).toBe(10);
    });
});

describe('selectAnalysisWindow', () => {
    it('skips when there is no new candidate utterance', () => {
        const t = [mul('Kendinizden bahseder misiniz?'), aday(LONG)];
        // İkisi de son analizde kapsandı.
        expect(selectAnalysisWindow(t, 2).hasNewCandidateUtterance).toBe(false);
        expect(selectAnalysisWindow(t, 2).window).toEqual([]);
    });

    it('skips when the new candidate speech is shorter than 40 characters', () => {
        const t = [aday(LONG), mul('Peki sonra?'), aday('Evet, öyle oldu.')];
        const r = selectAnalysisWindow(t, 1);
        expect(r.hasNewCandidateUtterance).toBe(false);
    });

    it('does not count recruiter speech as a reason to analyse', () => {
        const t = [mul('Uzun bir mülakatçı sorusu: bu projede hangi metrikleri takip ettiniz?')];
        expect(selectAnalysisWindow(t, 0).hasNewCandidateUtterance).toBe(false);
    });

    it('takes only what was said since the last analysis, both roles for context', () => {
        const t = [aday('eski cevap ' + LONG), mul('Yeni soru?'), aday(LONG)];
        const r = selectAnalysisWindow(t, 1);
        expect(r.hasNewCandidateUtterance).toBe(true);
        expect(r.window.map((e) => e.text)).toEqual(['Yeni soru?', LONG]);
        expect(r.nextIndex).toBe(3);
    });

    it('caps a long window to its most recent part', () => {
        const big = 'x'.repeat(2500);
        const t = [aday(big + '1'), aday(big + '2'), aday(big + '3'), aday(LONG)];
        const r = selectAnalysisWindow(t, 0);
        const chars = r.window.reduce((s, e) => s + e.text.length, 0);
        expect(chars).toBeLessThanOrEqual(LIVE_WINDOW_MAX_CHARS);
        expect(r.window[r.window.length - 1].text).toBe(LONG);
    });

    it('survives a transcript that got shorter than the last index', () => {
        const r = selectAnalysisWindow([aday(LONG)], 10);
        expect(r.window).toEqual([]);
        expect(r.nextIndex).toBe(1);
    });
});

describe('createRateGate — analiz sınırı', () => {
    it('allows 20 per hour and blocks the 21st', () => {
        const gate = createRateGate({ cap: LIVE_ANALYSIS_HOURLY_CAP });
        let now = 0;
        for (let i = 0; i < 20; i++) {
            expect(gate.check(now).ok).toBe(true);
            gate.record(now);
            now += 60 * 1000;
        }
        const st = gate.check(now);
        expect(st.ok).toBe(false);
        expect(st.reason).toBe('cap');
    });

    it('reopens once the oldest call leaves the 60-minute window (rolling)', () => {
        const gate = createRateGate({ cap: 1 });
        gate.record(0);
        expect(gate.check(HOUR_MS - 1).ok).toBe(false);
        expect(gate.check(HOUR_MS).ok).toBe(true);
    });

    it('reopens once the oldest call leaves the 60-minute window', () => {
        const gate = createRateGate({ cap: 2 });
        gate.record(0);
        gate.record(10 * 60 * 1000);
        const st = gate.check(20 * 60 * 1000);
        expect(st.ok).toBe(false);
        expect(st.retryAt).toBe(HOUR_MS);
        expect(gate.check(HOUR_MS).ok).toBe(true);
    });

    it('stays closed until the next UTC hour after the server says the cap is hit', () => {
        // Sayfa yenilendi → yerel sayaç boş, ama sunucu "doldu" diyor.
        const gate = createRateGate({ cap: 20 });
        const now = 5 * HOUR_MS + 25 * 60 * 1000;
        gate.blockUntilNextHour(now);
        expect(gate.check(now).ok).toBe(false);
        expect(gate.check(6 * HOUR_MS - 1).ok).toBe(false);
        expect(gate.check(6 * HOUR_MS).ok).toBe(true);
    });

    it('marks a server refusal as reason "server", not the local cap', () => {
        const gate = createRateGate({ cap: 20 });
        const now = 5 * HOUR_MS + 25 * 60 * 1000;
        gate.record(now);
        gate.blockUntilNextHour(now);
        const st = gate.check(now);
        expect(st.reason).toBe('server');
        expect(st.retryAt).toBe(6 * HOUR_MS);
    });
});

describe('takeLiveAnalysisTurn — otomatik tur ve "Şimdi analiz et" tek kapı', () => {
    it('runs only when there is new candidate speech, and spends a slot only then', () => {
        const gate = createRateGate({ cap: LIVE_ANALYSIS_HOURLY_CAP });
        const t = [mul('Soru?'), aday('kısa')];
        expect(takeLiveAnalysisTurn({ gate, transcript: t, fromIndex: 0, now: 0 }).action).toBe('skip');
        expect(gate.used(0)).toBe(0);

        t.push(aday(LONG));
        const turn = takeLiveAnalysisTurn({ gate, transcript: t, fromIndex: 0, now: 0 });
        expect(turn.action).toBe('run');
        expect(turn.nextIndex).toBe(3);
        expect(gate.used(0)).toBe(1);
    });

    it('counts manual presses toward the same 20 per hour', () => {
        // 7 otomatik tur (3 dk arayla) + 13 elle basış = 20; 21. hem
        // düğmeden hem zamanlayıcıdan reddedilir.
        const gate = createRateGate({ cap: LIVE_ANALYSIS_HOURLY_CAP });
        const transcript = [];
        let now = 0;
        const turn = () => {
            transcript.push(aday(`${LONG} ${transcript.length}`));
            return takeLiveAnalysisTurn({ gate, transcript, fromIndex: transcript.length - 1, now });
        };
        for (let i = 0; i < 7; i++) {
            expect(turn().action).toBe('run'); // otomatik
            now += LIVE_ANALYSIS_INTERVAL_MS;
        }
        for (let i = 0; i < 13; i++) {
            expect(turn().action).toBe('run'); // "Şimdi analiz et"
            now += 1000;
        }
        const blockedManual = turn();
        expect(blockedManual.action).toBe('blocked');
        expect(blockedManual.state.reason).toBe('cap');
        now += LIVE_ANALYSIS_INTERVAL_MS;
        expect(turn().action).toBe('blocked'); // sonraki otomatik tur da
        expect(gate.used(now)).toBe(20);
    });
});

describe('createRateGate — takip sorusu', () => {
    const make = () => createRateGate({ cap: FOLLOWUP_HOURLY_CAP, cooldownMs: FOLLOWUP_COOLDOWN_MS });

    it('enforces a 60 s cooldown between presses', () => {
        const gate = make();
        gate.record(0);
        const st = gate.check(30 * 1000);
        expect(st.ok).toBe(false);
        expect(st.reason).toBe('cooldown');
        expect(st.retryAt).toBe(60 * 1000);
        expect(gate.check(59 * 1000).ok).toBe(false);
        expect(gate.check(60 * 1000).ok).toBe(true);
    });

    it('allows at most 10 per hour even when the cooldown is respected', () => {
        const gate = make();
        let now = 0;
        for (let i = 0; i < 10; i++) {
            expect(gate.check(now).ok).toBe(true);
            gate.record(now);
            now += FOLLOWUP_COOLDOWN_MS;
        }
        const st = gate.check(now);
        expect(st.ok).toBe(false);
        expect(st.reason).toBe('cap');
    });
});

describe('metinler', () => {
    it('says "Son analiz X dk önce"', () => {
        expect(minutesAgoText(0, 30 * 1000)).toBe('az önce');
        expect(minutesAgoText(0, 4 * 60 * 1000 + 5)).toBe('4 dk önce');
        expect(minutesAgoText(null, 0)).toBe('');
    });

    it('explains why the button is disabled', () => {
        expect(gateMessage({ ok: true })).toBe('');
        expect(gateMessage({ ok: false, reason: 'cooldown', retryAt: 45_000 }, { now: 0 })).toMatch(/45 sn sonra/);
        expect(gateMessage({ ok: false, reason: 'cap', retryAt: Date.UTC(2026, 10, 1, 10, 0) }, { capLabel: 'Saatlik canlı analiz sınırı (20)' }))
            .toMatch(/^Saatlik canlı analiz sınırı \(20\) doldu; .+ itibarıyla yeniden açılır\.$/);
    });

    // Sunucu 429 sonrası istemci sayacı 1'de olabilir; "sınır (20) doldu"
    // yanlış bir sayı söylerdi. Sunucunun metni gösterilmeli, saat korunmalı.
    it('shows the server message after a server 429, still with the reopen time', () => {
        const gate = createRateGate({ cap: 20 });
        const now = Date.UTC(2026, 10, 1, 9, 25);
        gate.record(now);
        gate.blockUntilNextHour(now);
        const msg = gateMessage(gate.check(now), {
            capLabel: 'Saatlik canlı analiz sınırı (20)',
            serverMessage: 'Bu mülakat için saatlik canlı analiz sınırına ulaşıldı.',
            now,
        });
        expect(msg).toMatch(/^Bu mülakat için saatlik canlı analiz sınırına ulaşıldı\. .+ itibarıyla yeniden açılır\.$/);
        expect(msg).not.toMatch(/\(20\) doldu/);
    });

    it('falls back to the cap text when the server gave no message', () => {
        const msg = gateMessage({ ok: false, reason: 'server', retryAt: Date.UTC(2026, 10, 1, 10, 0) }, { capLabel: 'Saatlik takip sorusu sınırı (10)' });
        expect(msg).toMatch(/^Saatlik takip sorusu sınırı \(10\) doldu; /);
    });

    it('keeps the cap text when only the local cap is hit', () => {
        const msg = gateMessage({ ok: false, reason: 'cap', retryAt: Date.UTC(2026, 10, 1, 10, 0) }, {
            capLabel: 'Saatlik canlı analiz sınırı (20)', serverMessage: 'sunucu metni',
        });
        expect(msg).toMatch(/^Saatlik canlı analiz sınırı \(20\) doldu; /);
    });
});
