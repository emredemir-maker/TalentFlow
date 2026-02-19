import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');

async function test() {
    console.log('pdfLib type:', typeof pdfLib);
    console.log('pdfLib keys:', Object.keys(pdfLib));

    const PDFClass = pdfLib.PDFParse || pdfLib.default || pdfLib;
    console.log('PDFClass type:', typeof PDFClass);

    try {
        console.log('Attempting new PDFClass...');
        const instance = new PDFClass({ data: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF') });
        console.log('Instance created');
        const text = await instance.getText();
        console.log('Text extracted:', typeof text);
    } catch (e) {
        console.error('ERROR:', e.message);
        console.error(e.stack);
    }
}

test();
