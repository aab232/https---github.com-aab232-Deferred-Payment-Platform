const puppeteer = require('puppeteer-core');
const path = require('path');

async function scrapeWebsite() {
  // Launch the browser
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set a User-Agent to make it look like a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

  // Navigate to the website
  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f#intcmp=ic_20240122_laptopsnavcard_sc_ele_a_txtb_', { waitUntil: 'domcontentloaded' });

  // Wait for the necessary element to load
  await page.waitForSelector('.product-card_c-product-card__image-container__5F0Fj', { timeout: 10000 });

  // Scrape the data
  const products = await page.evaluate(() => {
    const productCards = document.querySelectorAll('.product-card_c-product-card__image-container__5F0Fj');
    const productDetails = [];

    productCards.forEach(card => {
      // Update selectors based on actual class names or ids found on the page
      const name = card.querySelector('.product-card_c-product-card__name__XspJz') ? card.querySelector('.product-card_c-product-card__name__XspJz').innerText : 'No item name available';
      const price = card.querySelector('.price-amount') ? card.querySelector('.price-amount').innerText : 'No price available';
      const imageUrl = card.querySelector('img') ? card.querySelector('img').src : 'No image available';

      productDetails.push({ item_name, price, imageUrl });
    });

    return productDetails;
  });

  console.log(products);

  // Close the browser
  await browser.close();
}

// Run the scrape function
scrapeWebsite().catch(console.error);