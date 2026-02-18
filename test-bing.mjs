import puppeteer from 'puppeteer';

async function testBing() {
    const query = 'Elon Musk';
    const SEARCH_URL = `https://www.bing.com/search?q=site%3Alinkedin.com%2Fin+${encodeURIComponent(query)}`;

    console.log(`Searching Bing for: ${SEARCH_URL}`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

        await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 30000 });

        // Take a screenshot to see what's happening
        await page.screenshot({ path: 'bing_result.png' });

        const content = await page.content();
        console.log(`Content length: ${content.length}`);

        const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.includes('linkedin.com/in/') && !href.includes('/dir/'));
        });

        console.log(`Found ${links.length} links:`);
        console.log(links.slice(0, 5));

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
}

testBing();
