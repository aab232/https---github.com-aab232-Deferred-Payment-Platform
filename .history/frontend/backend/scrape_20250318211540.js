const puppeteer = require('puppeteer');

(async () => {
  // Launch Puppeteer with custom Chrome path
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', // Path to Chrome
    headless: false
  });

  const page = await browser.newPage();
  await page.goto('https://www.johnlewis.com');

  const products = await page.evaluate(() => {
    // Select product items using CSS selectors or other methods
    const productList = [];
    const productElements = document.querySelectorAll('.product-card');
    
    productElements.forEach(product => {
      const title = product.querySelector('.product-card-title').innerText;
      const price = product.querySelector('.price').innerText;
      productList.push({ title, price });
    });

    return productList;
  });

  console.log(products);

  await browser.close();
})();