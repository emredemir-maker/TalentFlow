// Gmail mesajı kurulumu ve alıcı doğrulaması — eskiden istemcideydi, artık
// sunucuda. Başlıklara ham interpolasyon yapıldığı için alıcı listesinin
// CRLF/başlık enjeksiyonunu kesmesi sabitleniyor.
import { describe, expect, it } from 'vitest';

import { buildRawEmail, parseRecipients } from './google.js';

const decode = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

describe('parseRecipients', () => {
    it('virgülle ayrılmış listeyi kabul ediyor', () => {
        expect(parseRecipients('a@x.com, b@y.com.tr')).toEqual(['a@x.com', 'b@y.com.tr']);
    });

    it('BAŞLIK ENJEKSİYONU reddediliyor', () => {
        expect(parseRecipients('a@x.com\r\nBcc: kurban@z.com')).toBeNull();
        expect(parseRecipients('a@x.com\nBcc: kurban@z.com')).toBeNull();
    });

    it('geçersiz ya da boş girdi reddediliyor', () => {
        expect(parseRecipients('')).toBeNull();
        expect(parseRecipients('adres-degil')).toBeNull();
        expect(parseRecipients('a@x.com, bozuk')).toBeNull();
        expect(parseRecipients(['a@x.com'])).toBeNull();
    });
});

describe('buildRawEmail', () => {
    it('düz metin: başlıklar ve UTF-8 konu', () => {
        const msg = decode(buildRawEmail({ to: 'a@x.com', subject: 'Mülakat', body: 'Merhaba', replyTo: 'ik@x.com' }));
        expect(msg).toContain('To: a@x.com');
        expect(msg).toContain(`Subject: =?utf-8?B?${Buffer.from('Mülakat').toString('base64')}?=`);
        expect(msg).toContain('Reply-To: ik@x.com');
        expect(msg.endsWith('Merhaba')).toBe(true);
    });

    it('HTML: multipart/alternative, iki gövde', () => {
        const msg = decode(buildRawEmail({ to: 'a@x.com', subject: 's', body: 'duz', html: '<b>html</b>' }));
        expect(msg).toContain('multipart/alternative');
        expect(msg).toContain('duz');
        expect(msg).toContain('<b>html</b>');
        expect(msg).not.toContain('Reply-To');
    });

    it('HTML + ICS: davet eki ekleniyor', () => {
        const msg = decode(buildRawEmail({ to: 'a@x.com', subject: 's', html: '<p/>', ics: 'BEGIN:VCALENDAR' }));
        expect(msg).toContain('multipart/mixed');
        expect(msg).toContain('Content-Type: text/calendar; method=REQUEST');
        expect(msg).toContain('BEGIN:VCALENDAR');
    });

    it('çıktı base64url (dolgu ve +/ yok)', () => {
        const raw = buildRawEmail({ to: 'a@x.com', subject: '??>>', body: '~~~???' });
        expect(raw).not.toMatch(/[+/=]/);
    });
});
