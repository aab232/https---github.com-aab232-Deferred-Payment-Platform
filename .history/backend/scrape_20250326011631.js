const puppeteer = require('puppeteer'); // Puppeteer for web scraping

// Web scraping function using Puppeteer to scrape laptops from Argos
const scrapeLaptops = async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/', {
        waitUntil: 'networkidle2'
    });

    const laptops = await page.evaluate(() => {
        const items = [];
        const laptopElements = document.querySelectorAll('.ProductCard__Title');

        laptopElements.forEach(element => {
            const title = element.innerText;
            const price = element.closest('.ProductCard').querySelector('.ProductCard__Price').innerText;
            const link = element.closest('.ProductCard').querySelector('a').href;
            items.push({ title, price, link });
        });

        return items;
    });

    await browser.close();
    return laptops;
};

// Export the scrapeLaptops function to be used in other files
module.exports = {
    scrapeLaptops
};