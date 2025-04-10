const puppeteer = require('puppeteer');

async function scrapeArgos() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto('https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/', {
        waitUntil: 'networkidle2'
    });

    const content = await page.content();
    console.log(content);

    await browser.close();
}

scrapeArgos();