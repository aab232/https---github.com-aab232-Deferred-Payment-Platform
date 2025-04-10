const puppeteer = require('puppeteer');

(async () => {
  // Launch Puppeteer with custom Chrome path
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome
    headless: false, // Set to true if you want headless mode
    defaultViewport: null, // Use the full screen (or adjust viewport as needed)
    args: ['--start-maximized'], // Open Chrome maximized
  });

  const page = await browser.newPage();
  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f#intcmp=ic_20240122_laptopsnavcard_sc_ele_a_txtb_', { waitUntil: 'domcontentloaded' });

  // Wait for a specific element to be loaded
  await page.waitForSelector('.product-card'); // Adjust this selector to match the products

  // Scrape the data
  const products = await page.evaluate(() => {
    const productList = [];
    const productElements = document.querySelectorAll('.product-card'); // Update this selector if necessary
    
    productElements.forEach(product => {
      const title = product.querySelector('.product-card-title') ? product.querySelector('.product-card-title').innerText : null;
      const price = product.querySelector('.price') ? product.querySelector('.price').innerText : null;
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