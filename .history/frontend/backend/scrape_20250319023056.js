// argosScraper.js
const axios = require('axios');
const cheerio = require('cheerio');

const url = 'https://www.argos.co.uk/browse/technology/laptops-and-pcs/laptops/c:30049/';

async function scrapeArgos() {
  try {
    // Fetch the webpage
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const products = [];

    // Select product cards
    $('.ProductCardstyles__Wrapper-sc-1fgz1yu-0').each((i, el) => {
      const name = $(el).find('.ProductCardstyles__Title-sc-1fgz1yu-13').text().trim();
      const price = $(el).find('.ProductCardPriceStyle__Price-sc-2vuvzo-2').text().trim();
      const imageUrl = $(el).find('img').attr('src');

      products.push({ name, price, imageUrl });
    });

    console.log(products);
  } catch (error) {
    console.error('Error fetching Argos:', error);
  }
}

scrapeArgos();