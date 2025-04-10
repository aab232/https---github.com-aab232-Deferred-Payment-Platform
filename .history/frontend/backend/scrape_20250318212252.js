const puppeteer = require('puppeteer');

(async () => {
  // Launch Puppeteer with custom Chrome path
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome
    headless: false, // Set to true if you want headless mode
    defaultViewport: null, // Use the full screen (or adjust viewport as needed)
    args: ['--start-maximized'], // Open Chrome maximized
  });

  const page = await browser.newPage();
  await page.goto('https://www.johnlewis.com', { waitUntil: 'domcontentloaded' });

  // Wait for the product image container to be visible
  await page.waitForSelector('.product-card_c-product-card__image-container__5F0Fj'); // Use the correct class for the image container

  // Scrape the data
  const products = await page.evaluate(() => {
    const productList = [];
    const productElements = document.querySelectorAll('.product-card_c-product-card__image-container__5F0Fj'); // Update this to match the container class
    
    productElements.forEach(product => {
      const title = product.closest('.product-card').querySelector('.product-card-title') ? 
                    product.closest('.product-card').querySelector('.product-card-title').innerText : null;
      const price = product.closest('.product-card').querySelector('.price') ? 
                    product.closest('.product-card').querySelector('.price').innerText : null;

      if (title && price) {
        productList.push({ title, price });
      }
    });

    return productList;
  });

  // Log the result to the console
  console.log(products);

  // Pause the execution for a while so the browser stays open
  await page.waitForTimeout(5000); // Wait 5 seconds before closing the browser

  await browser.close();
})();