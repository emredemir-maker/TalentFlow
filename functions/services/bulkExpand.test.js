// AÇMA FAZI — ZIP'ten kayıt üretimi.
//
// Bu iş HTTP isteğinin içinden worker'a taşındı çünkü Hosting rewrite'ı isteği
// 60 saniyede kesiyordu. Taşınırken iki eski davranış da düzeltildi ve
// testlerin asıl işi bunları tutmak:
//
//   1. macOS'un `__MACOSX/._ad.pdf` ikizleri CV sanılıyordu — her gerçek
//      adayın yanında içi boş bir hayalet aday üretiyordu.
//   2. Metni okunamayan dosya sessizce düşüyordu; 40 CV yükleyip 37 aday gören
//      kullanıcı eksik üçünü hiçbir yerden öğrenemiyordu.
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

import { zipCvEntries, chunk, expandJobSources } from './bulkExpand.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

// İçerik 200 karakterlik alt sınırı GERÇEKTEN aşmalı. Boşlukla doldurmak
// yetmez: sınır trim edilmiş uzunluğa bakıyor, çünkü taranmış görüntü PDF'ler
// tam olarak böyle (birkaç karakter + bolca boşluk) davranıyor.
const body = (label) => Buffer.from(`${label}${'.'.repeat(400)}`);

function makeZip(entries) {
    const zip = new AdmZip();
    for (const [name, content] of entries) zip.addFile(name, content);
    return zip.toBuffer();
}

describe('zipCvEntries', () => {
    it('keeps only pdf and docx entries', () => {
        const buf = makeZip([
            ['ali.pdf', body('ali')],
            ['veli.docx', body('veli')],
            ['okuma.txt', body('not')],
        ]);
        expect(zipCvEntries(buf).map((e) => e.name)).toEqual(['ali.pdf', 'veli.docx']);
    });

    // macOS ikizleri: `.pdf` ile bitiyor ve klasör değil, bu yüzden eski
    // süzgeçten geçiyordu.
    it('drops the __MACOSX resource-fork twins', () => {
        const buf = makeZip([
            ['ali.pdf', body('ali')],
            ['__MACOSX/._ali.pdf', Buffer.from('junk')],
        ]);
        const names = zipCvEntries(buf).map((e) => e.name);
        expect(names).toEqual(['ali.pdf']);
    });

    it('drops dotfiles wherever they sit', () => {
        const buf = makeZip([
            ['klasor/._gizli.pdf', Buffer.from('junk')],
            ['klasor/ayse.pdf', body('ayse')],
        ]);
        expect(zipCvEntries(buf).map((e) => e.name)).toEqual(['ayse.pdf']);
    });

    it('flattens nested folders to the base name', () => {
        const buf = makeZip([['2026/ocak/mehmet.pdf', body('mehmet')]]);
        expect(zipCvEntries(buf)[0].name).toBe('mehmet.pdf');
    });
});

describe('chunk', () => {
    it('splits into parts no larger than the size', () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('returns nothing for an empty list', () => {
        expect(chunk([], 10)).toEqual([]);
    });
});

/** Testlerin ortak iskeleti: Storage ve Firestore yerine sahte bağımlılıklar. */
function harness({ files, extractText, maxItems, chunkSize } = {}) {
    const written = [];
    const cleaned = [];
    const progress = [];
    return {
        written, cleaned, progress,
        run: (sources) => expandJobSources({
            sources,
            downloadSource: async (path) => {
                if (!(path in files)) throw new Error('not found');
                return files[path];
            },
            extractText: extractText || (async (buffer) => buffer.toString()),
            writeItems: async (items) => { written.push(...items); },
            onProgress: async (p) => { progress.push(p); },
            cleanupSource: async (path) => { cleaned.push(path); },
            ...(maxItems ? { maxItems } : {}),
            ...(chunkSize ? { chunkSize } : {}),
        }),
    };
}

const zipSource = { storagePath: 'p/arsiv.zip', originalName: 'arsiv.zip', ext: 'zip' };

describe('expandJobSources', () => {
    it('turns every zip entry into a pending item with sequential indexes', async () => {
        const h = harness({
            files: { 'p/arsiv.zip': makeZip([['a.pdf', body('a')], ['b.pdf', body('b')]]) },
        });
        const result = await h.run([zipSource]);

        expect(result.totalCount).toBe(2);
        expect(result.failedCount).toBe(0);
        expect(h.written.map((i) => i.index)).toEqual([0, 1]);
        expect(h.written.every((i) => i.status === 'pending')).toBe(true);
        expect(h.written[0].originalName).toBe('a.pdf');
    });

    it('handles a bare pdf source without unzipping', async () => {
        const h = harness({ files: { 'p/ali.pdf': body('ali') } });
        const result = await h.run([{ storagePath: 'p/ali.pdf', originalName: 'ali.pdf', ext: 'pdf' }]);

        expect(result.totalCount).toBe(1);
        expect(h.written[0].cvText).toMatch(/^ali/);
    });

    // Sessizce düşen dosya, olmayan bir başarıdır.
    it('records an unreadable entry as an error item instead of dropping it', async () => {
        const h = harness({
            files: { 'p/arsiv.zip': makeZip([['ok.pdf', body('ok')], ['bozuk.pdf', body('bozuk')]]) },
            extractText: async (buffer) => {
                if (buffer.toString().startsWith('bozuk')) throw new Error('PDF açılamadı');
                return buffer.toString();
            },
        });
        const result = await h.run([zipSource]);

        expect(result.totalCount).toBe(2);
        expect(result.failedCount).toBe(1);
        const failed = h.written.find((i) => i.status === 'error');
        expect(failed.originalName).toBe('bozuk.pdf');
        expect(failed.error).toMatch(/PDF açılamadı/);
    });

    // Taranmış görüntü PDF'i birkaç kırıntı döndürür; onu CV sanmak hem para
    // hem de uydurma aday demek.
    it('rejects text too short to be a CV', async () => {
        const h = harness({
            files: { 'p/arsiv.zip': makeZip([['tarali.pdf', Buffer.from('  \n ')]]) },
        });
        const result = await h.run([zipSource]);

        expect(result.failedCount).toBe(1);
        expect(h.written[0].status).toBe('error');
        expect(h.written[0].error).toMatch(/çok kısa/);
    });

    it('records a source that cannot be downloaded rather than finishing with zero items', async () => {
        const h = harness({ files: {} });
        const result = await h.run([zipSource]);

        expect(result.totalCount).toBe(1);
        expect(h.written[0].status).toBe('error');
        expect(h.written[0].error).toMatch(/Dosya okunamadı/);
        // İndirilemeyen kaynak silinmez — yeniden denenebilmeli.
        expect(h.cleaned).toEqual([]);
    });

    it('deletes the storage copy once a source is expanded', async () => {
        const h = harness({ files: { 'p/arsiv.zip': makeZip([['a.pdf', body('a')]]) } });
        await h.run([zipSource]);
        expect(h.cleaned).toEqual(['p/arsiv.zip']);
    });

    // Firestore batch'i 500 işlemle sınırlı; tek commit'e sığmayan liste patlar.
    it('writes in chunks instead of one oversized batch', async () => {
        const entries = Array.from({ length: 7 }, (_, i) => [`cv${i}.pdf`, body(`cv${i}`)]);
        const writes = [];
        await expandJobSources({
            sources: [zipSource],
            downloadSource: async () => makeZip(entries),
            extractText: async (buffer) => buffer.toString(),
            writeItems: async (items) => { writes.push(items.length); },
            chunkSize: 3,
        });
        expect(writes).toEqual([3, 3, 1]);
    });

    it('stops at the item ceiling and reports the truncation', async () => {
        const entries = Array.from({ length: 5 }, (_, i) => [`cv${i}.pdf`, body(`cv${i}`)]);
        const h = harness({ files: { 'p/arsiv.zip': makeZip(entries) }, maxItems: 3 });
        const result = await h.run([zipSource]);

        expect(result.totalCount).toBe(3);
        expect(result.truncated).toBe(true);
    });

    it('reports a growing total rather than a number it does not know yet', async () => {
        const h = harness({
            files: {
                'p/a.zip': makeZip([['a.pdf', body('a')], ['b.pdf', body('b')]]),
                'p/b.zip': makeZip([['c.pdf', body('c')]]),
            },
            chunkSize: 2,
        });
        await h.run([
            { storagePath: 'p/a.zip', originalName: 'a.zip', ext: 'zip' },
            { storagePath: 'p/b.zip', originalName: 'b.zip', ext: 'zip' },
        ]);
        expect(h.progress.map((p) => p.totalCount)).toEqual([2, 3]);
    });

    it('does not let a cleanup failure abort the job', async () => {
        const written = [];
        const result = await expandJobSources({
            sources: [zipSource],
            downloadSource: async () => makeZip([['a.pdf', body('a')]]),
            extractText: async (buffer) => buffer.toString(),
            writeItems: async (items) => { written.push(...items); },
            cleanupSource: vi.fn(async () => { throw new Error('silinemedi'); }),
        });
        expect(result.totalCount).toBe(1);
        expect(written).toHaveLength(1);
    });
});
