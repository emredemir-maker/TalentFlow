// src/services/cvParser.js
import * as mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const extractTextFromFile = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            const pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                disableFontFace: true,
                standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`
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
