const puppeteer = require('puppeteer');

const scrapeLaptops = async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/', {
        waitUntil: 'networkidle2'
    });

    const laptops = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.ProductCard').forEach(element => {
            const title = element.querySelector('.ProductCard__Title')?.innerText || 'No title';
            const price = element.querySelector('.ProductCard__Price')?.innerText || 'Price unavailable';
            const link = element.querySelector('a')?.href || '#';
            const img = element.querySelector('.ProductCard__Image img')?.src || 'https://via.placeholder.com/150';
            const description = element.querySelector('.ProductCard__Description')?.innerText || 'No description available';

            items.push({ title, price, link, img, description });
        });

        return items;
    });

    await browser.close();
    return laptops;
};

module.exports = { scrapeLaptops };