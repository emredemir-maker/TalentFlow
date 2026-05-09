// PDF text extraction wrapper.
//
// Why so much defensive code: pdf-parse v2 went through several incompatible
// API shapes (function form, default export, exported PDFParse class). The
// version this project pins (^2.4.5) ships the class-based API but earlier
// installs in CI may resolve to the function form. This wrapper tries the
// class shape first, falls back to the function shape, and returns a uniform
// `{ text }` object so callers never see the underlying mess.
//
// Errors are intentionally swallowed and converted to `{ text: 'PDF Error: ...' }`
// so a single bad PDF in a bulk upload does not abort the entire batch — the
// caller decides how to handle the sentinel string.
import { createRequire } from 'module';
import { childLogger } from './logger.js';
const log = childLogger('pdf');

const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');

export async function pdf(buffer) {
    try {
        const PDFClass = pdfLib.PDFParse || pdfLib.default;
        if (PDFClass && typeof PDFClass === 'function') {
            try {
                // Try as class first
                const instance = new PDFClass({ data: buffer });
                const result = await instance.getText();
                await instance.destroy().catch(() => { });
                return result;
            } catch (err) {
                if (err.message.includes("cannot be invoked without 'new'")) {
                    // This shouldn't happen if we used new, but let's be safe
                    throw err;
                }
                // If it's the old pdf-parse function style
                if (typeof pdfLib === 'function') {
                    return await pdfLib(buffer);
                }
                throw err;
            }
        } else if (typeof pdfLib === 'function') {
            return await pdfLib(buffer);
        }
        throw new Error('PDF parsing library not found or invalid');
    } catch (err) {
        log.error('PDF Error:', err);
        return { text: 'PDF Error: ' + err.message };
    }
}
