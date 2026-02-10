const puppeteer = require('puppeteer');

let browser = null;
let launchTime = null;
const BROWSER_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

async function launchBrowser() {
  // Restart browser if it's been running for over 24h
  if (browser && browser.connected && launchTime && (Date.now() - launchTime > BROWSER_MAX_AGE_MS)) {
    console.log('[scraper] Reiniciando navegador (24h atingidas)');
    await closeBrowser();
  }

  if (browser && browser.connected) return browser;

  const launchOptions = {
    headless: true,
    timeout: 60000,
    protocolTimeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--no-first-run',
      '--single-process',
      '--no-zygote',
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  browser = await puppeteer.launch(launchOptions);
  launchTime = Date.now();

  browser.on('disconnected', () => {
    browser = null;
    launchTime = null;
  });

  return browser;
}

async function scrapePage(keyword) {
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
      timeout: 60000,
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
          if (!price) {
            const priceMatch = priceContainer.textContent.match(/R\$\s*[\d.,]+/);
            if (priceMatch) price = priceMatch[0];
          }
        }

        // Product image
        const imgEl = card.querySelector('img.c-product-card__img');
        const image = imgEl ? imgEl.getAttribute('src') : '';

        // Clean the URL (remove tracking params)
        const cleanHref = href.split('?')[0];
        const url = `https://www.enjoei.com.br${cleanHref}`;

        results.push({ id: productSlug, title, price, url, image });
      }

      return results;
    });

    return products;
  } finally {
    await page.close().catch(() => {});
  }
}

const MAX_RETRIES = 2;

async function searchProducts(keyword) {
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      return await scrapePage(keyword);
    } catch (err) {
      console.error(`[scraper] Tentativa ${attempt} falhou para "${keyword}": ${err.message}`);
      if (attempt <= MAX_RETRIES) {
        // Wait before retry, longer on second retry
        await new Promise(r => setTimeout(r, attempt * 3000));
      } else {
        console.error(`[scraper] Todas as tentativas falharam para "${keyword}"`);
        return [];
      }
    }
  }
  return [];
}

async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    launchTime = null;
  }
}

module.exports = { launchBrowser, searchProducts, closeBrowser };
