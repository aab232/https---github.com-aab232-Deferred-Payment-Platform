const puppeteer = require('puppeteer');

(async () => {
  // Launch Puppeteer with Chrome
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome in Program Files (x86)
    headless: false, // Set to true if you want headless mode
    defaultViewport: null, // Use the full screen (or adjust viewport as needed)
    args: ['--start-maximized'], // Open Chrome maximized
  });

  const page = await browser.newPage();
  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f#intcmp=ic_20240122_laptopsnavcard_sc_ele_a_txtb_', { waitUntil: 'domcontentloaded' });

  // Wait for the product card container to be visible
  await page.waitForSelector('.product-card_c-product-card__image-container__5F0Fj', { timeout: 5000 });

  // Scrape the data
  const products = await page.evaluate(() => {
    const productList = [];
    const productElements = document.querySelectorAll('.product-card_c-product-card__image-container__5F0Fj'); // Correct product card selector
    
    // Loop through each product element
    productElements.forEach(product => {
      const titleElement = product.closest('.product-card').querySelector('.product-card-title');
      const priceElement = product.closest('.product-card').querySelector('.price');

      // Ensure the title and price exist
      const title = titleElement ? titleElement.innerText : 'No title';
      const price = priceElement ? priceElement.innerText : 'No price';

      if (title !== 'No title' && price !== 'No price') {
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