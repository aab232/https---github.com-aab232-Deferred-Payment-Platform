const puppeteer = require('puppeteer-core'); // using puppeteer-core
const path = require('path');

async function scrapeWebsite() {
  // Set the path to Chrome in your Program Files (x86)
  const browser = await puppeteer.launch({
    headless: true, // Runs the browser in headless mode
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Adjust the path if needed
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Arguments to bypass certain security restrictions
  });

  const page = await browser.newPage();

  // Mimic a real user by setting the User-Agent header
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  // Navigate to the John Lewis page
  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f#intcmp=ic_20240122_laptopsnavcard_sc_ele_a_txtb_', { waitUntil: 'domcontentloaded' });

  // Wait for the product cards to be loaded
  await page.waitForSelector('.product-card_c-product-card__image-container__5F0Fj', { timeout: 10000 });

  // Scrape product data
  const products = await page.evaluate(() => {
    const productCards = document.querySelectorAll('.product-card_c-product-card__image-container__5F0Fj');
    const productDetails = [];

    productCards.forEach(card => {
      const name = card.querySelector('.product-card_c-product-card__name__XspJz') ? card.querySelector('.product-card_c-product-card__name__XspJz').innerText : 'No name available';
      const price = card.querySelector('.price-amount') ? card.querySelector('.price-amount').innerText : 'No price available';
      const imageUrl = card.querySelector('img') ? card.querySelector('img').src : 'No image available';

      productDetails.push({ name, price, imageUrl });
    });

    return productDetails;
  });

  // Log the scraped product details
  console.log(products);

  // Close the browser
  await browser.close();
}

// Run the scraping function
scrapeWebsite().catch(console.error);