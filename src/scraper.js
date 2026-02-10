const puppeteer = require('puppeteer');
const { getPlatform, DEFAULT_PLATFORM } = require('./platforms');

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

const MAX_RETRIES = 2;

async function searchProducts(keyword, filters, platform) {
  const platformKey = platform || DEFAULT_PLATFORM;
  const platformModule = getPlatform(platformKey);
  if (!platformModule) {
    console.error(`[scraper] Plataforma desconhecida: "${platformKey}"`);
    return [];
  }

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const b = await launchBrowser();
      return await platformModule.scrapePage(b, keyword, filters);
    } catch (err) {
      console.error(`[scraper] Tentativa ${attempt} falhou para "${keyword}" (${platformModule.platformName}): ${err.message}`);
      if (attempt <= MAX_RETRIES) {
        // Wait before retry, longer on second retry
        await new Promise(r => setTimeout(r, attempt * 3000));
      } else {
        console.error(`[scraper] Todas as tentativas falharam para "${keyword}" (${platformModule.platformName})`);
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

// Backward compat: delegate to enjoei buildSearchUrl
function buildSearchUrl(keyword, filters) {
  const enjoei = getPlatform('enjoei');
  return enjoei.buildSearchUrl(keyword, filters);
}

module.exports = { launchBrowser, searchProducts, closeBrowser, buildSearchUrl };
