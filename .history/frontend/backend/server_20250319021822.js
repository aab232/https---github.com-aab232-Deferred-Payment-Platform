const puppeteer = require('puppeteer-core');

async function scrapeWebsite() {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set a realistic User-Agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Navigate to the website
  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f', {
    waitUntil: 'domcontentloaded',
  });

  // Wait until the product details container is available
  await page.waitForSelector('.product-card_c-product-card__product-details__WMqbp', { timeout: 15000 });

  // Extract product details
  const products = await page.evaluate(() => {
    // Select all product cards
    const productCards = document.querySelectorAll('.product-card_c-product-card__product-details__WMqbp');
    const productDetails = [];

    productCards.forEach(card => {
      const name = card.querySelector('.product-card_c-product-card__name__XspJz')?.innerText || 'No name available';
      const price = card.querySelector('.price-amount')?.innerText || 'No price available';
      const imageUrl = card.closest('.product-card_c-product-card__image-container__5F0Fj')?.querySelector('img')?.src || 'No image available';

      productDetails.push({ name, price, imageUrl });
    });

    return productDetails;
  });

  console.log(products);

  // Close the browser
  await browser.close();
}

// Run the scraper
scrapeWebsite().catch(console.error);