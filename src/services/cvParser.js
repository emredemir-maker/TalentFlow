// src/services/cvParser.js
//
// PDF/DOCX text extractor. Both engines (pdfjs-dist, mammoth) are dynamically
// imported on first use so they don't bloat the initial JS bundle — they're
// only needed when a recruiter actually uploads a CV. Together they account
// for ~600KB of vendor code that would otherwise ship on every page load.
//
// pdfjs-dist also needs its worker URL set on the global config exactly once;
// loadPdfjs() handles that on the first call and caches the configured module.

let pdfjsLibCache = null;
let mammothCache = null;

async function loadPdfjs() {
    if (pdfjsLibCache) return pdfjsLibCache;
    const [{ default: pdfWorker }, pdfjsLib] = await Promise.all([
        import('pdfjs-dist/build/pdf.worker.mjs?url'),
        import('pdfjs-dist'),
    ]);
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
    pdfjsLibCache = pdfjsLib;
    return pdfjsLib;
}

async function loadMammoth() {
    if (mammothCache) return mammothCache;
    mammothCache = await import('mammoth/mammoth.browser');
    return mammothCache;
}

export const extractTextFromFile = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const pdfjsLib = await loadPdfjs();
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                disableFontFace: true,
                standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
            }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }
            return fullText;
        } else if (
            file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.name.endsWith('.docx')
        ) {
            const mammoth = await loadMammoth();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        } else {
            throw new Error('Desteklenmeyen dosya formatı. Lütfen PDF veya DOCX yükleyin.');
        }
    } catch (error) {
        console.error('Doysa okuma hatası:', error);
        throw error;
    }
};
