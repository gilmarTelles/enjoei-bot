const puppeteer = require('puppeteer');

let browser = null;

async function launchBrowser() {
  if (browser && browser.connected) return browser;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  browser.on('disconnected', () => {
    browser = null;
  });

  return browser;
}

async function searchProducts(keyword) {
  const b = await launchBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });

    const encoded = encodeURIComponent(keyword);
    await page.goto(`https://www.enjoei.com.br/s?q=${encoded}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for product cards to render
    await page.waitForSelector('.c-product-card', { timeout: 15000 }).catch(() => null);

    // Small delay for any lazy-loaded content
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.c-product-card');

      for (const card of cards) {
        const linkEl = card.querySelector('a[href*="/p/"]');
        if (!linkEl) continue;

        const href = linkEl.getAttribute('href') || '';
        const match = href.match(/\/p\/(.+?)(?:\?|$)/);
        if (!match) continue;

        const productSlug = match[1];

        // Title from h2 or data-test attribute
        const titleEl = card.querySelector('[data-test="div-nome-prod"], h2.c-product-card__title');
        const title = titleEl ? titleEl.textContent.trim() : productSlug;

        // Price: get the current price (first non-discount span inside price container)
        const priceContainer = card.querySelector('[data-test="div-preco"], .c-product-card__price');
        let price = '';
        if (priceContainer) {
          // The current price is in a span that is NOT .c-product-card__price-discount
          const spans = priceContainer.querySelectorAll('span');
          for (const span of spans) {
            if (!span.classList.contains('c-product-card__price-discount') && !span.classList.contains('c-product-card__price')) {
              const text = span.textContent.trim();
              if (text.match(/R\$\s*[\d.,]+/)) {
                price = text;
                break;
              }
            }
          }
          // Fallback: any R$ in the container
          if (!price) {
            const priceMatch = priceContainer.textContent.match(/R\$\s*[\d.,]+/);
            if (priceMatch) price = priceMatch[0];
          }
        }

        // Clean the URL (remove tracking params)
        const cleanHref = href.split('?')[0];
        const url = `https://www.enjoei.com.br${cleanHref}`;

        results.push({ id: productSlug, title, price, url });
      }

      return results;
    });

    return products;
  } catch (err) {
    console.error(`[scraper] Error searching for "${keyword}":`, err.message);
    return [];
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

module.exports = { launchBrowser, searchProducts, closeBrowser };
