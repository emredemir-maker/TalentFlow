import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');

async function test() {
    const PDFClass = pdfLib.PDFParse || pdfLib.default || pdfLib;
    console.log('PDFClass:', PDFClass);
    try {
        const instance = new PDFClass({ data: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF') });
        console.log('Instance created');
        const text = await instance.getText();
        console.log('Success');
    } catch (e) {
        console.error('FAILED:', e.message);
        console.error(e.stack);
    }
}

test();
