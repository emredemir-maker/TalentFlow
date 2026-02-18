import puppeteer from 'puppeteer';

async function testDDG() {
    const query = 'Elon Musk LinkedIn';
    const SEARCH_URL = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        console.log(`Navigating to ${SEARCH_URL}`);
        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.result__a'))
                .map(a => a.href)
                .filter(href => href.includes('linkedin.com/in/'));
        });

        console.log(`Found ${links.length} LinkedIn links:`);
        console.log(links.slice(0, 5));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testDDG();
