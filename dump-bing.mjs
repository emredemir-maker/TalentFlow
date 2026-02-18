import puppeteer from 'puppeteer';
import fs from 'fs';

async function dumpBing() {
    const query = 'Elon Musk';
    const SEARCH_URL = `https://www.bing.com/search?q=site%3Alinkedin.com%2Fin+${encodeURIComponent(query)}`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36');

        console.log(`Navigating to ${SEARCH_URL}`);
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

        const html = await page.content();
        fs.writeFileSync('bing_dump.html', html);
        console.log(`Dumped HTML to bing_dump.html (${html.length} bytes)`);

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a')).map(a => a.href);
        });
        console.log(`Found ${links.length} total links:`);
        console.log(links);

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

dumpBing();
