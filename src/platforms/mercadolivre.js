const platformKey = 'ml';
const platformName = 'Mercado Livre';

function buildSearchUrl(keyword, filters) {
  const slug = keyword.trim().replace(/\s+/g, '-');
  let url = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;

  const segments = [];

  // Default: sort by most recent (newly listed)
  let sortApplied = false;

  if (filters) {
    if (filters.cond === 'usado') segments.push('_Desde_USADO');
    if (filters.cond === 'novo') segments.push('_Desde_NOVO');
    if (filters.sort === 'price_asc') { segments.push('_OrderId_PRICE'); sortApplied = true; }
    if (filters.sort === 'price_desc') { segments.push('_OrderId_PRICE*DESC'); sortApplied = true; }
    if (filters.sort === 'recent') { segments.push('_OrderId_PRICE*RELEVANCE'); sortApplied = true; }
    if (filters.ship) segments.push('_Frete_Gr%C3%A1tis');
  }

  // Default to most recent listings if no sort specified
  if (!sortApplied) {
    segments.push('_OrderId_PriceAsc_PublishedToday');
  }

  if (segments.length > 0) {
    url += segments.join('');
  }

  return url;
}

async function scrapePage(browser, keyword, filters) {
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });

    const url = buildSearchUrl(keyword, filters);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    await page.waitForSelector('div.ui-search-result__content-wrapper', { timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('div.ui-search-result__content-wrapper');

      for (const card of cards) {
        const linkEl = card.querySelector('a.ui-search-link');
        if (!linkEl) continue;

        const href = linkEl.getAttribute('href') || '';
        // Extract ML item ID from URL (e.g., MLB-1234567890)
        const idMatch = href.match(/MLB-?\d+/i);
        const productId = idMatch ? idMatch[0] : href;

        const titleEl = card.querySelector('h2.ui-search-item__title');
        const title = titleEl ? titleEl.textContent.trim() : '';

        const priceEl = card.querySelector('span.andes-money-amount__fraction');
        let price = '';
        if (priceEl) {
          price = `R$ ${priceEl.textContent.trim()}`;
        }

        const imgEl = card.closest('.ui-search-result')?.querySelector('img');
        let image = '';
        if (imgEl) {
          image = imgEl.getAttribute('data-zoom') || imgEl.getAttribute('src') || '';
        }

        // Clean URL (remove tracking params)
        const cleanUrl = href.split('?')[0].split('#')[0];

        results.push({ id: productId, title, price, url: cleanUrl, image });
      }

      return results;
    });

    return products;
  } finally {
    await page.close().catch(() => {});
  }
}

function buildFilterKeyboard(keywordRow) {
  let filters = {};
  if (keywordRow.filters) {
    try { filters = JSON.parse(keywordRow.filters); } catch {}
  }
  const id = keywordRow.id;

  const condNovoLabel = filters.cond === 'novo' ? '\u2705 Novo' : '\u2B1C Novo';
  const condUsadoLabel = filters.cond === 'usado' ? '\u2705 Usado' : '\u2B1C Usado';
  const sortALabel = filters.sort === 'price_asc' ? '\u2705 Menor preco' : '\u2B1C Menor preco';
  const sortDLabel = filters.sort === 'price_desc' ? '\u2705 Maior preco' : '\u2B1C Maior preco';
  const shipLabel = filters.ship ? '\u2705 Frete gratis' : '\u274C Frete gratis';

  return {
    inline_keyboard: [
      [
        { text: condNovoLabel, callback_data: `f:${id}:cond:novo` },
        { text: condUsadoLabel, callback_data: `f:${id}:cond:usado` },
      ],
      [
        { text: sortALabel, callback_data: `f:${id}:sort:a` },
        { text: sortDLabel, callback_data: `f:${id}:sort:d` },
      ],
      [{ text: shipLabel, callback_data: `f:${id}:ship:t` }],
      [{ text: '\uD83D\uDDD1 Limpar filtros', callback_data: `f:${id}:clr:0` }],
    ],
  };
}

function applyFilterToggle(filters, filterType, filterValue) {
  const updated = { ...filters };

  switch (filterType) {
    case 'cond': {
      updated.cond = updated.cond === filterValue ? undefined : filterValue;
      if (!updated.cond) delete updated.cond;
      break;
    }
    case 'sort': {
      const sortMap = { a: 'price_asc', d: 'price_desc' };
      const newSort = sortMap[filterValue];
      updated.sort = updated.sort === newSort ? undefined : newSort;
      if (!updated.sort) delete updated.sort;
      break;
    }
    case 'ship':
      updated.ship = !updated.ship;
      if (!updated.ship) delete updated.ship;
      break;
  }

  return updated;
}

function formatFiltersSummary(filters) {
  if (!filters || Object.keys(filters).length === 0) return '';
  const parts = [];
  if (filters.cond) parts.push(filters.cond);
  if (filters.sort === 'price_asc') parts.push('menor preco');
  if (filters.sort === 'price_desc') parts.push('maior preco');
  if (filters.ship) parts.push('frete gratis');
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

module.exports = {
  platformKey,
  platformName,
  buildSearchUrl,
  scrapePage,
  buildFilterKeyboard,
  applyFilterToggle,
  formatFiltersSummary,
};
