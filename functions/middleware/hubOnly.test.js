import { describe, expect, it, vi } from 'vitest';
import { blockDirectToken, hubOnlyMode, MAX_IDENTITY_AGE_SECONDS } from './hubOnly.js';

const NOW = 2_000_000_000;
const token = (provider, authTime = NOW - 60) => ({ auth_time: authTime, firebase: { sign_in_provider: provider } });
const enforce = { HUB_ONLY_LOGIN: 'enforce' };

describe('hubOnly', () => {
    it('ayar: varsayılan kapalı; yanlış yazım kaydeder ama kapatmaz', () => {
        expect(hubOnlyMode({})).toBe('off');
        expect(hubOnlyMode({ HUB_ONLY_LOGIN: 'off' })).toBe('off');
        expect(hubOnlyMode(enforce)).toBe('enforce');
        expect(hubOnlyMode({ HUB_ONLY_LOGIN: 'enforcee' })).toBe('report');
    });

    it('enforce: Google ve şifre jetonu reddedilir; Hub jetonu ve aday oturumu geçer', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(blockDirectToken(token('google.com'), enforce, NOW)).toBe(true);
        expect(blockDirectToken(token('password'), enforce, NOW)).toBe(true);
        expect(blockDirectToken({}, enforce, NOW)).toBe(true);
        expect(blockDirectToken(token('custom'), enforce, NOW)).toBe(false);
        expect(blockDirectToken(token('anonymous'), enforce, NOW)).toBe(false);
    });

    it('enforce: 14 günden eski Hub kimliği reddedilir, auth_time yoksa da', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(blockDirectToken(token('custom', NOW - MAX_IDENTITY_AGE_SECONDS), enforce, NOW)).toBe(false);
        expect(blockDirectToken(token('custom', NOW - MAX_IDENTITY_AGE_SECONDS - 1), enforce, NOW)).toBe(true);
        expect(blockDirectToken({ firebase: { sign_in_provider: 'custom' } }, enforce, NOW)).toBe(true);
    });

    it('report ve off reddetmez; report kaydeder, kişi bilgisi yazmaz', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        warn.mockClear();
        expect(blockDirectToken({ ...token('google.com'), email: 'kisi@ornek.test' }, { HUB_ONLY_LOGIN: 'report' }, NOW)).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).not.toContain('kisi@');
        warn.mockClear();
        expect(blockDirectToken(token('google.com'), {}, NOW)).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });
});
