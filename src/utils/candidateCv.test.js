import { describe, expect, it } from 'vitest';
import {
    cvFileExtension,
    isEmbeddableCv,
    hasOriginalCvFile,
    cvTextOf,
    defaultCvMode,
    hasNoCv,
    cvProfileFields,
    normalizeExperiences,
} from './candidateCv.js';

describe('cvFileExtension', () => {
    it('reads the extension from a plain URL', () => {
        expect(cvFileExtension('https://x.com/cv.pdf')).toBe('pdf');
        expect(cvFileExtension('https://x.com/cv.DOCX')).toBe('docx');
    });

    it('ignores the query string Firebase Storage appends', () => {
        // Sorgu atılmazsa uzantı ".pdf?alt=media" olur ve hiç eşleşmez
        expect(cvFileExtension('https://x.com/cv.pdf?alt=media&token=abc')).toBe('pdf');
    });

    it('decodes the percent-encoded path Storage uses for folders', () => {
        // Gerçek Storage bağlantısı: /o/cvs%2Fcv-1.pdf
        expect(cvFileExtension(
            'https://firebasestorage.googleapis.com/v0/b/b/o/cvs%2Fcv-1.pdf?alt=media'
        )).toBe('pdf');
    });

    it('survives malformed percent-encoding instead of throwing', () => {
        // decodeURIComponent('%E0%A4%A') fırlatır; kullanıcının ekranı çökmemeli
        expect(() => cvFileExtension('https://x.com/%E0%A4%A/cv.pdf')).not.toThrow();
        expect(cvFileExtension('https://x.com/%E0%A4%A/cv.pdf')).toBe('pdf');
    });

    it('returns empty for missing or extensionless input', () => {
        expect(cvFileExtension('')).toBe('');
        expect(cvFileExtension(null)).toBe('');
        expect(cvFileExtension('https://x.com/download')).toBe('');
    });
});

describe('isEmbeddableCv', () => {
    it('embeds PDFs only', () => {
        expect(isEmbeddableCv({ cvUrl: 'https://x.com/cv.pdf' })).toBe(true);
        // DOCX bir iframe'de indirme diyaloğu açar; bozuk çerçeve göstermeyelim
        expect(isEmbeddableCv({ cvUrl: 'https://x.com/cv.docx' })).toBe(false);
    });

    it('falls back to the stored file name when the URL has no extension', () => {
        expect(isEmbeddableCv({ cvUrl: 'https://x.com/download', cvFileName: 'ali.pdf' })).toBe(true);
    });

    it('is false without a file', () => {
        expect(isEmbeddableCv({ cvText: 'uzun metin' })).toBe(false);
        expect(isEmbeddableCv(null)).toBe(false);
    });
});

describe('cvTextOf', () => {
    it('prefers whichever field actually carries the CV', () => {
        expect(cvTextOf({ cvData: 'ayrıntılı döküm', cvText: 'kısa' })).toBe('ayrıntılı döküm');
        expect(cvTextOf({ cvData: 'kısa', cvText: 'çok daha uzun bir metin' })).toBe('çok daha uzun bir metin');
    });

    it('uses whichever one exists', () => {
        expect(cvTextOf({ cvText: 'yalnız bu' })).toBe('yalnız bu');
        expect(cvTextOf({ cvData: 'yalnız bu' })).toBe('yalnız bu');
    });

    it('treats whitespace-only as empty', () => {
        expect(cvTextOf({ cvData: '   \n ' })).toBe('');
        expect(cvTextOf({})).toBe('');
    });
});

describe('defaultCvMode', () => {
    it('opens the original PDF when there is one', () => {
        expect(defaultCvMode({ cvUrl: 'https://x.com/cv.pdf' })).toBe('pdf');
    });

    it('opens the form when the file cannot be embedded', () => {
        // DOCX var ama gösterilemiyor → boş çerçeve yerine form
        expect(defaultCvMode({ cvUrl: 'https://x.com/cv.docx', cvText: 'metin' })).toBe('form');
        expect(defaultCvMode({ cvText: 'metin' })).toBe('form');
    });
});

describe('hasNoCv', () => {
    it('is true only when neither a file nor text exists', () => {
        expect(hasNoCv({})).toBe(true);
        expect(hasNoCv({ cvUrl: 'https://x.com/cv.pdf' })).toBe(false);
        expect(hasNoCv({ cvText: 'metin' })).toBe(false);
    });
});

describe('hasOriginalCvFile', () => {
    it('reports a stored original regardless of format', () => {
        expect(hasOriginalCvFile({ cvUrl: 'https://x.com/cv.docx' })).toBe(true);
        expect(hasOriginalCvFile({ cvText: 'metin' })).toBe(false);
    });
});

describe('cvProfileFields', () => {
    it('drops empty fields so the form is not a wall of "Belirtilmemiş"', () => {
        const fields = cvProfileFields({ name: 'Ali Veli', email: '', phone: '   ', location: 'İstanbul' });
        expect(fields.map((f) => f.label)).toEqual(['Ad Soyad', 'Konum']);
    });

    it('combines source with its detail when both exist', () => {
        const [field] = cvProfileFields({ source: 'application', sourceDetail: 'LinkedIn' });
        expect(field.value).toBe('application → LinkedIn');
    });

    it('shows the bare source when there is no detail', () => {
        const [field] = cvProfileFields({ source: 'manual' });
        expect(field.value).toBe('manual');
    });

    it('returns nothing for a null candidate', () => {
        expect(cvProfileFields(null)).toEqual([]);
    });
});

describe('normalizeExperiences', () => {
    it('accepts the different role keys the three import flows write', () => {
        const out = normalizeExperiences({
            experiences: [
                { title: 'Growth PM', company: 'Trendyol', duration: '2021-2024' },
                { role: 'Analist', company: 'Getir' },
                { position: 'Stajyer', company: 'X' },
            ],
        });
        expect(out.map((e) => e.role)).toEqual(['Growth PM', 'Analist', 'Stajyer']);
    });

    it('falls back to careerHistory when experiences is empty', () => {
        const out = normalizeExperiences({ experiences: [], careerHistory: [{ role: 'PM', company: 'A' }] });
        expect(out).toHaveLength(1);
        expect(out[0].company).toBe('A');
    });

    it('drops entries with no identifying content', () => {
        const out = normalizeExperiences({ experiences: [{ duration: '2020' }, { role: 'PM' }, null] });
        expect(out).toHaveLength(1);
    });

    it('returns an empty list when there is nothing', () => {
        expect(normalizeExperiences({})).toEqual([]);
        expect(normalizeExperiences(null)).toEqual([]);
    });
});
