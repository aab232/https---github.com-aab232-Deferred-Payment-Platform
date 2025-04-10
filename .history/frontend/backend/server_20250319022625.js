const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('https://www.johnlewis.com/browse/electricals/laptops-macbooks/view-all-laptops-macbooks/_/N-a8f', {
    waitUntil: 'networkidle2',
  });

  const products = await page.evaluate(() => {
    const productCards = document.querySelectorAll('.product-card_c-product-card__IiVba');

    return Array.from(productCards).map(card => ({
      name: card.querySelector('.title_title__desc__vXvX_')?.innerText.trim() || 'No name available',
      price: card.querySelector('.price-amount')?.innerText.trim() || 'No price available',
      imageUrl: card.querySelector('img')?.src || 'No image available',
    }));
  });

  console.log(products);

  await browser.close();
})();