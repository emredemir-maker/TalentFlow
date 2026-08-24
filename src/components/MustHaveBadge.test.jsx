// @vitest-environment happy-dom
//
// ZORUNLU MADDE ŞERİDİ OKUNABİLİR KALMALI.
//
// Şerit, madde metnini de ton rengiyle yazıyordu ve okunmuyordu. WCAG
// kontrast oranı (gövde metni için alt sınır 4.5:1):
//
//     warn #E8A13B / warn-bg #FDF4E4 → 2.01:1
//     bad  #E5484D / bad-bg  #FCEAEB → 3.37:1
//     ok   #16A26C / ok-bg   #E6F7EF → 2.95:1
//
// Üçü de yetersiz. Madde metni artık koyu nötr (n900/n700 → 10.7:1 ve üzeri),
// ton rengi yalnızca zeminde ve başlıkta. Bu test o kuralı sabitliyor.

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MustHaveBadge from './MustHaveBadge';

globalThis.React = React;

const GATE = {
    status: 'partial',
    missing: [],
    partial: [
        { index: 1, text: 'Müşteriyle birebir çalışılan bir rolde en az 2-3 yıl deneyime sahip olmak.', note: 'Dış müşterilerle değil, iş ortaklarımızla.' },
        { index: 2, text: 'Süreçleri dokümante etme alışkanlığına sahip olmak.', note: 'Spesifik bir kanıt yoktur.' },
    ],
    totalMust: 6,
    fromInterview: 0,
};
const LABEL = { text: '2 zorunlu kısmen', tone: 'amber', interview: false };

const html = (gate = GATE, label = LABEL) =>
    renderToStaticMarkup(React.createElement(MustHaveBadge, { gate, label }));

describe('MustHaveBadge okunabilirliği', () => {
    it('madde metni ton rengini DEĞİL koyu nötrü kullanır', () => {
        const out = html();
        expect(out).toContain('text-n900');
        expect(out).toContain('text-n700');
    });

    it('ton rengi yalnızca başlıkta kalır, gövdeye sızmaz', () => {
        // `text-warn` bir kez geçmeli: başlık satırı. Kutunun tamamına
        // uygulanırsa madde listesi de o rengi miras alır ve okunmaz.
        const out = html();
        expect(out.split('text-warn').length - 1).toBe(1);
    });

    it('her üç tonda da zemin rengi korunur — uyarı rengi bilgi taşımaya devam eder', () => {
        expect(html(GATE, { ...LABEL, tone: 'amber' })).toContain('bg-warn-bg');
        expect(html({ ...GATE, status: 'missing', missing: GATE.partial }, { ...LABEL, tone: 'red' })).toContain('bg-bad-bg');
        expect(html(GATE, { ...LABEL, tone: 'emerald' })).toContain('bg-ok-bg');
    });

    it('gerekçe kendi satırında durur — madde ile tek satıra sıkışmaz', () => {
        // Eskiden "madde — gerekçe" tek satırdı; ekran genişledikçe nerede
        // maddenin bittiği seçilemiyordu.
        const out = html();
        expect(out).toContain('block text-n700');
        expect(out).not.toContain(' — ');
    });

    it('satır uzunluğu sınırlanır', () => {
        expect(html()).toContain('max-w-[78ch]');
    });

    it('etiket yoksa hiçbir şey çizmez', () => {
        expect(html(GATE, null)).toBe('');
    });
});
