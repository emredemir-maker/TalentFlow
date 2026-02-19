import * as pdfNamespace from 'pdf-parse';
import pdfDefault from 'pdf-parse';

async function test() {
    console.log('Namespace keys:', Object.keys(pdfNamespace));
    console.log('Default type:', typeof pdfDefault);

    if (pdfDefault && pdfDefault.PDFParse) {
        console.log('Default.PDFParse exists');
    }
}

test();
