import { describe, expect, it, vi } from 'vitest';

import { chooseSttEngine, fetchAudioFallbackEnabled, hasWebSpeech, STT_UNSUPPORTED_TITLE } from './sttEngine.js';

describe('chooseSttEngine', () => {
    it('always uses Web Speech when the browser has it (Chrome path unchanged)', () => {
        expect(chooseSttEngine({ webSpeech: true, audioFallbackEnabled: false })).toBe('webspeech');
        expect(chooseSttEngine({ webSpeech: true, audioFallbackEnabled: true })).toBe('webspeech');
        expect(chooseSttEngine({ webSpeech: true, audioFallbackEnabled: null })).toBe('webspeech');
    });

    it('uses the Gemini fallback only when the server switch is on', () => {
        expect(chooseSttEngine({ webSpeech: false, audioFallbackEnabled: true })).toBe('gemini');
    });

    it('is unsupported without Web Speech when the switch is off', () => {
        expect(chooseSttEngine({ webSpeech: false, audioFallbackEnabled: false })).toBe('unsupported');
    });

    it('waits instead of starting the fallback while the switch is unknown', () => {
        expect(chooseSttEngine({ webSpeech: false, audioFallbackEnabled: null })).toBe('pending');
    });

    it('shows the exact message Emre asked for', () => {
        expect(STT_UNSUPPORTED_TITLE).toBe('Bu özellik için Chrome kullanın');
    });
});

describe('hasWebSpeech', () => {
    it('detects standard and webkit-prefixed APIs', () => {
        expect(hasWebSpeech({ SpeechRecognition: function () {} })).toBe(true);
        expect(hasWebSpeech({ webkitSpeechRecognition: function () {} })).toBe(true);
        expect(hasWebSpeech({})).toBe(false);
        expect(hasWebSpeech(undefined)).toBe(false);
    });
});

describe('fetchAudioFallbackEnabled', () => {
    const headers = async () => ({ Authorization: 'Bearer t' });

    it('returns true only when the server says so', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ audioFallbackEnabled: true }) }));
        expect(await fetchAudioFallbackEnabled(headers, fetchImpl)).toBe(true);
        expect(fetchImpl).toHaveBeenCalledWith('/api/ai/stt-config', { headers: { Authorization: 'Bearer t' } });
    });

    it('treats an odd answer as OFF', async () => {
        expect(await fetchAudioFallbackEnabled(headers, async () => ({ ok: true, json: async () => ({ audioFallbackEnabled: 'true' }) }))).toBe(false);
        expect(await fetchAudioFallbackEnabled(headers, async () => ({ ok: true, json: async () => ({ audioFallbackEnabled: false }) }))).toBe(false);
    });

    it('returns null (unknown, never ON) when the answer cannot be learned', async () => {
        expect(await fetchAudioFallbackEnabled(headers, async () => ({ ok: false, status: 401 }))).toBeNull();
        expect(await fetchAudioFallbackEnabled(headers, async () => { throw new Error('ağ'); })).toBeNull();
    });
});
