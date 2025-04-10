const scrapeLaptops = async () => {
    try {
        const browser = await puppeteer.launch({ headless: false }); // Set to true in production
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log('🌍 Navigating to Currys laptops page...');
        await page.goto('https://www.currys.co.uk/search?q=laptop', {
            waitUntil: 'domcontentloaded'
        });

        // Ensure products load
        await page.waitForSelector('.product', { timeout: 10000 }).catch(() => {
            console.warn('⚠️ Products not found within timeout.');
        });

        // Extract laptop data
        const laptops = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.product').forEach(element => {
                const title = element.querySelector('.product-title')?.innerText || 'No title';
                const price = element.querySelector('.product-card_price')?.innerText || 'Price unavailable';
                const link = element.querySelector('a')?.href || '#';
                const img = element.querySelector('img')?.src || 'https://via.placeholder.com/150';

                items.push({ title, price, link, img });
            });

            return items;
        });

        await browser.close();

        if (laptops.length === 0) {
            console.warn('⚠️ No laptops found! Check website structure.');
        } else {
            console.log(`✅ Successfully scraped ${laptops.length} laptops!`);
        }

        return laptops;
    } catch (error) {
        console.error('❌ Scraping error:', error);
        return [];
    }
};