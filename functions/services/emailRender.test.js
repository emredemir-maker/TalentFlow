// Sunucu tarafı şablon işleme (PR 7b): şirketin şablonu, kaçışlı değişkenler,
// güvenli bağlantılar.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/firebaseAdmin.js', () => ({ db: {}, admin: {} }));
const { renderEmail, cleanVars, safeLink, escapeHtml, applyVars, brandingOf, sanitizeTemplateHtml } = await import('./emailRender.js');

const APP = 'https://talent.clyro.test';

describe('safeLink', () => {
    it('uygulamanın kendi adresi ve bilinen toplantı hizmetleri; gerisi atılır', () => {
        expect(safeLink(`${APP}/join/abc`, APP)).toBe(`${APP}/join/abc`);
        expect(safeLink('https://meet.google.com/abc-defg-hij', APP)).toBe('https://meet.google.com/abc-defg-hij');
        expect(safeLink('https://us02web.zoom.us/j/1', APP)).toBe('https://us02web.zoom.us/j/1');
        expect(safeLink('https://kotu.example/phish', APP)).toBe('');
        expect(safeLink('javascript:alert(1)', APP)).toBe('');
        expect(safeLink('http://talent.clyro.test/join', APP)).toBe('');
        expect(safeLink('https://user:pw@talent.clyro.test/x', APP)).toBe('');
        expect(safeLink('https://talent.clyro.test.kotu.example/x', APP)).toBe('');
    });
});

describe('cleanVars', () => {
    it('yalnız şablonun değişkenleri; bağlantılar süzülür; uzunluk sınırlı', () => {
        const v = cleanVars('invite', { candidateName: 'A'.repeat(500), joinLink: 'https://kotu.example', evil: 'x', date: '2026-11-03' }, { appUrl: APP });
        expect(v.candidateName).toHaveLength(300);
        expect(v.joinLink).toBeUndefined();
        expect(v.evil).toBeUndefined();
        expect(v.date).toBe('2026-11-03');
    });
});

describe('renderEmail', () => {
    it('ŞİRKETİN KAYITLI ŞABLONU kullanılır; değişkenler HTML\'e kaçışlı girer', () => {
        const r = renderEmail(
            'feedback',
            cleanVars('feedback', { candidateName: '<img src=x onerror=alert(1)>', feedbackText: 'satır1\nsatır2', outcome: 'positive' }),
            { templates: { feedback: { subject: '{{companyName}}: {{outcome}}', html: '<h1>{{companyName}}</h1><p>{{candidateName}}</p><div>{{feedbackText}}</div>{{bilinmeyen}}' } }, branding: { companyName: 'Acme & Co' } }
        );
        expect(r.source).toBe('tenant');
        expect(r.subject).toBe('Acme & Co: Olumlu');
        expect(r.html).toContain('<h1>Acme &amp; Co</h1>');
        expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(r.html).not.toContain('<img src=x');
        expect(r.html).toContain('satır1<br/>satır2');
        expect(r.html).not.toContain('{{bilinmeyen}}');
    });

    it('kayıt yoksa yerleşik şablon; şirket adı markadan, yoksa şirket belgesinden', () => {
        const r = renderEmail('invite', cleanVars('invite', { candidateName: 'Ayşe', joinLink: `${APP}/join/1`, date: '3 Kasım' }, { appUrl: APP }), { tenantName: 'Beta Ltd' });
        expect(r.source).toBe('built-in');
        expect(r.html).toContain('Beta Ltd');
        expect(r.html).toContain(`href="${APP}/join/1"`);
        expect(r.subject).toMatch(/Mülakat Davetiniz/);
    });

    it('iki şirket: aynı değişkenler, her biri kendi şablonu/markası', () => {
        const vars = cleanVars('feedback', { candidateName: 'Ali', feedbackText: 't' });
        const a = renderEmail('feedback', vars, { templates: { feedback: { html: 'A-{{candidateName}}' } }, branding: { companyName: 'A' } });
        const b = renderEmail('feedback', vars, { branding: { companyName: 'B' } });
        expect(a.html).toBe('A-Ali');
        expect(b.html).toContain('>B<');
        expect(b.html).not.toContain('A-Ali');
    });

    it('marka rengi/logo style özniteliğine güvenli girer', () => {
        const brand = brandingOf({ companyName: 'X', primaryColor: 'red;background:url(x)', logoUrl: 'javascript:alert(1)' });
        expect(brand.primaryColor).toBe('#0E7490');
        expect(brand.logoUrl).toBe('');
        expect(applyVars('{{primaryColor}}', {}, brand)).toBe('#0E7490');
    });

    it('istenen öğeler listesi kaçışlı', () => {
        const r = renderEmail('infoRequest', cleanVars('infoRequest', { requestedItems: ['<b>Diploma</b>', 5] }), {});
        expect(r.html).toContain('&lt;b&gt;Diploma&lt;/b&gt;');
        expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
    });
});

describe('sanitizeTemplateHtml — kayıtlı şablon ortak alan adından gider', () => {
    it('betik/form/olay öznitelikleri atılır; izin dışı bağlantı ölür; değişken ve mailto kalır', () => {
        const out = sanitizeTemplateHtml(
            '<script>x</script><form action="https://kotu.test"><input name=p></form>'
            + '<a href="https://kotu.test/giris" onclick="x()">Giriş</a>'
            + `<a href="${APP}/join/1">Katıl</a><a href="{{joinLink}}">K</a><a href="mailto:ik@a.test">İK</a>`
            + '<img src="http://x.test/a.png"><img src="https://cdn.test/l.png" onerror=alert(1)>',
            APP
        );
        expect(out).not.toMatch(/<script|<form|<input|onclick|onerror|kotu\.test|http:\/\/x\.test/);
        expect(out).toContain('href="#"');
        expect(out).toContain(`href="${APP}/join/1"`);
        expect(out).toContain('href="{{joinLink}}"');
        expect(out).toContain('href="mailto:ik@a.test"');
        expect(out).toContain('src="https://cdn.test/l.png"');
        // Metin değişkeniyle bağlantı kurulamaz.
        expect(sanitizeTemplateHtml('<a href="{{position}}">x</a>', APP)).toBe('<a href="#">x</a>');
    });

    it('renderEmail kayıtlı şablonu temizleyerek kullanır', () => {
        const r = renderEmail('feedback', {}, { templates: { feedback: { html: '<a href="https://kotu.test">x</a>' } }, appUrl: APP });
        expect(r.html).toBe('<a href="#">x</a>');
    });
});
