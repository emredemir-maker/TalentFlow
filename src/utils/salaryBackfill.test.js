// GERİYE DÖNÜK MAAŞ TARAMASI — kuralların testi.
//
// En önemlileri LİSTEYE ALMAYANLAR ve EZMEYENLER:
//   - beklentisi kayıtlı görüşme listeye girmez (insanın duyduğu rakamın
//     üstüne modelin okuduğu rakam önerilmez)
//   - toplu brüt/net işareti, adayın kendi sözünden gelen bazı ezmez
//   - baz boş kalabilir ve bu satır kaydedilir ama karşılaştırmaya girmez
import { describe, expect, it } from 'vitest';

import {
    transcriptText, hasSalary, sessionTime, buildBackfillRows, emptyDraft,
    draftFromHint, draftToBand, applyBulkBasis, sourceOf, savableRows, backfillTally,
    MIN_TRANSCRIPT,
} from './salaryBackfill';

const longText = (prefix) => `${prefix} ${'x'.repeat(MIN_TRANSCRIPT)}`;

const entry = (sessionId, session) => ({ sessionId, candidateName: 'Ayşe', session });

describe('transcriptText', () => {
    it('reads a plain-text transcript', () => {
        expect(transcriptText({ transcript: '  net 95 bin isterim  ' })).toBe('net 95 bin isterim');
    });

    // Canlı görüşme dizi tutuyor, manuel giriş metin. Yalnızca birini tanımak
    // havuzun yarısını sessizce "transkripti yok" sayardı.
    it('reads a live-session transcript array', () => {
        expect(transcriptText({
            transcript: [
                { role: 'YÖNETİCİ', text: 'Beklentiniz nedir?' },
                { role: 'ADAY', text: 'Net 95 bin.' },
            ],
        })).toBe('YÖNETİCİ: Beklentiniz nedir?\nADAY: Net 95 bin.');
    });

    it('skips empty entries and survives odd shapes', () => {
        expect(transcriptText({ transcript: [{ text: '' }, 'düz satır', null] })).toBe('düz satır');
        expect(transcriptText({ transcript: 42 })).toBe('');
        expect(transcriptText(null)).toBe('');
    });
});

describe('hasSalary', () => {
    it('is true only for a usable band', () => {
        expect(hasSalary({ candidateSalary: { min: 95000, currency: 'TRY', period: 'monthly' } })).toBe(true);
        expect(hasSalary({ candidateSalary: null })).toBe(false);
        expect(hasSalary({ candidateSalary: { currency: 'TRY' } })).toBe(false);
        expect(hasSalary({})).toBe(false);
    });
});

describe('sessionTime', () => {
    it('sorts undated sessions last', () => {
        expect(sessionTime({ date: '2026-08-14' })).toBeGreaterThan(sessionTime({ date: '2026-01-01' }));
        expect(sessionTime({})).toBe(-Infinity);
    });
});

describe('buildBackfillRows', () => {
    // Odada duyulup yazılmış bir rakamın üstüne çıkarım önermek, ölçülmüş bir
    // şeyi tahminle değiştirmek olurdu.
    it('leaves out interviews that already have an expectation', () => {
        const rows = buildBackfillRows([
            entry('s1', { transcript: longText('a'), candidateSalary: { min: 95000 } }),
            entry('s2', { transcript: longText('b') }),
        ]);
        expect(rows.map((r) => r.sessionId)).toEqual(['s2']);
    });

    // Transkripti kısa olan satır listede DURUR ama taranmaz: model zaten
    // null dönerdi, çağrı yalnızca sıra ve para harcardı.
    it('keeps short-transcript rows but marks them unscannable', () => {
        const rows = buildBackfillRows([
            entry('s1', { transcript: 'kısa' }),
            entry('s2', { transcript: longText('c') }),
        ]);
        expect(rows.map((r) => r.scannable)).toEqual([false, true]);
    });

    it('carries identity from the session when the summary is thin', () => {
        const [row] = buildBackfillRows([{
            sessionId: 's1',
            session: { candidateName: 'Mehmet', positionTitle: 'Growth PM', date: '2026-08-01', transcript: longText('d') },
        }]);
        expect(row).toMatchObject({ candidateName: 'Mehmet', positionTitle: 'Growth PM', date: '2026-08-01' });
    });

    it('ignores entries without a session id', () => {
        expect(buildBackfillRows([{ session: { transcript: longText('e') } }, null])).toEqual([]);
    });
});

describe('draftFromHint', () => {
    it('fills both ends from a single-number suggestion', () => {
        expect(draftFromHint({ min: 95000, max: 95000, currency: 'TRY', period: 'monthly', basis: 'net' }))
            .toEqual({ min: '95000', max: '95000', currency: 'TRY', period: 'monthly', basis: 'net' });
    });

    // BAZ VARSAYILMAZ. Aday "net" demediyse boş kalır ve satırda uyarı çıkar.
    it('leaves the basis empty when the candidate did not say one', () => {
        expect(draftFromHint({ min: 90000, max: 100000, currency: 'TRY', period: 'monthly', basis: null }).basis).toBe('');
    });

    it('returns an empty draft for no hint', () => {
        expect(draftFromHint(null)).toEqual(emptyDraft());
    });
});

describe('draftToBand', () => {
    it('turns a filled draft into a band', () => {
        expect(draftToBand({ min: '90000', max: '100000', currency: 'TRY', period: 'monthly', basis: 'net' }))
            .toEqual({ min: 90000, max: 100000, currency: 'TRY', period: 'monthly', basis: 'net' });
    });

    it('returns null for an untouched draft', () => {
        expect(draftToBand(emptyDraft())).toBeNull();
    });
});

describe('applyBulkBasis', () => {
    it('fills every empty basis in one click', () => {
        const next = applyBulkBasis({
            a: { ...emptyDraft(), min: '90000' },
            b: emptyDraft(),
        }, 'net');
        expect(next.a.basis).toBe('net');
        expect(next.b.basis).toBe('net');
    });

    // KANIT VARSAYIMI EZMEZ: dolu baz adayın kendi sözünden geldi
    // ("net 95 bin isterim"); havuz geneline dair bir kabul onu değiştiremez.
    it('never overwrites a basis that came from the transcript', () => {
        const drafts = { a: { ...emptyDraft(), min: '95000', basis: 'net' } };
        expect(applyBulkBasis(drafts, 'gross').a.basis).toBe('net');
    });

    it('ignores an invalid basis', () => {
        const drafts = { a: emptyDraft() };
        expect(applyBulkBasis(drafts, 'brüt')).toBe(drafts);
    });
});

describe('sourceOf', () => {
    const hint = { min: 95000, max: 95000, currency: 'TRY', period: 'monthly', basis: null, quote: 'net 95 bin isterim' };

    it('marks an accepted suggestion as transcript-sourced, with its quote', () => {
        expect(sourceOf(draftFromHint(hint), hint)).toEqual({ source: 'transcript', quote: 'net 95 bin isterim' });
    });

    // Baz karşılaştırmaya girmez: toplu işaretleme onu sonradan doldurmuş
    // olabilir ama RAKAM yine transkriptten gelmiştir.
    it('still counts as transcript-sourced after a bulk basis mark', () => {
        const draft = { ...draftFromHint(hint), basis: 'net' };
        expect(sourceOf(draft, hint).source).toBe('transcript');
    });

    it('marks an edited number as manual', () => {
        const draft = { ...draftFromHint(hint), min: '80000', max: '80000' };
        expect(sourceOf(draft, hint)).toEqual({ source: 'manual', quote: null });
    });

    it('marks a hand-typed row as manual', () => {
        expect(sourceOf({ ...emptyDraft(), min: '70000' }, null).source).toBe('manual');
    });
});

describe('savableRows / backfillTally', () => {
    const rows = [
        { sessionId: 'a', candidateName: 'Ayşe' },
        { sessionId: 'b', candidateName: 'Mehmet' },
        { sessionId: 'c', candidateName: 'Zeynep' },
    ];
    const drafts = {
        a: { ...emptyDraft(), min: '95000', max: '95000', basis: 'net' },
        b: { ...emptyDraft(), min: '80000' },       // baz yok
        c: emptyDraft(),                             // hiç doldurulmadı
    };

    it('only offers rows with a usable number', () => {
        expect(savableRows(rows, drafts, {}).map((s) => s.row.sessionId)).toEqual(['a', 'b']);
    });

    // Boş satır SIFIR değil "sorulmadı" demek — kaydedilmez.
    it('counts empty rows separately from filled ones', () => {
        expect(backfillTally(rows, drafts)).toEqual({ total: 3, filled: 2, withoutBasis: 1, empty: 1 });
    });
});
