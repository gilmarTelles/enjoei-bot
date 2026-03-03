const platformKey = 'ml';
const platformName = 'Mercado Livre';

const ML_SIZE_IDS = {
  pp: '13853810',
  p: '13853811',
  m: '13853813',
  g: '13853814',
  gg: '13853815',
  xg: '13853816',
  xgg: '13853817',
};

const ML_SIZE_LABELS = {
  pp: 'PP', p: 'P', m: 'M', g: 'G', gg: 'GG', xg: 'XG',
};

function buildSearchUrl(keyword, filters) {
  const slug = keyword.trim().replace(/\s+/g, '-');
  let url = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;

  const segments = [];

  if (filters) {
    if (filters.cond === 'usado') segments.push('_ITEM*CONDITION_2230581');
    if (filters.cond === 'novo') segments.push('_ITEM*CONDITION_2230284');
    if (filters.sz && ML_SIZE_IDS[filters.sz]) segments.push(`_FILTRABLE*SIZE_${ML_SIZE_IDS[filters.sz]}`);
    if (filters.sort === 'price_asc') segments.push('_OrderId_PRICE');
    if (filters.sort === 'price_desc') segments.push('_OrderId_PRICE*DESC');
    if (filters.ship) segments.push('_CustoFrete_Gratis');
  }

  if (segments.length > 0) {
    url += segments.join('');
  }

  url += '_NoIndex_True';

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

    await page.waitForSelector('li.ui-search-layout__item', { timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate(() => {
      const results = [];
      const items = document.querySelectorAll('li.ui-search-layout__item');

      for (const item of items) {
        const titleEl = item.querySelector('a.poly-component__title');
        if (!titleEl) continue;

        const href = titleEl.getAttribute('href') || '';
        const title = titleEl.textContent.trim();

        // Extract ML item ID from tracking URL (e.g., MLB100885424155)
        let productId = '';
        const allEls = item.querySelectorAll('*');
        for (const el of allEls) {
          for (const attr of el.attributes) {
            const match = attr.value.match(/MLB-?\d+/i);
            if (match) { productId = match[0]; break; }
          }
          if (productId) break;
        }
        if (!productId) productId = href;

        const priceEl = item.querySelector('span.andes-money-amount__fraction');
        let price = '';
        if (priceEl) {
          price = `R$ ${priceEl.textContent.trim()}`;
        }

        const imgEl = item.querySelector('img');
        let image = '';
        if (imgEl) {
          image = imgEl.getAttribute('data-zoom') || imgEl.getAttribute('src') || '';
        }

        results.push({ id: productId, title, price, url: href, image });
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

  // Size row
  const sizeButtons = Object.entries(ML_SIZE_LABELS).map(([key, label]) => ({
    text: filters.sz === key ? `\u2705 ${label}` : `\u2B1C ${label}`,
    callback_data: `f:${id}:sz:${key}`,
  }));

  return {
    inline_keyboard: [
      [
        { text: condNovoLabel, callback_data: `f:${id}:cond:novo` },
        { text: condUsadoLabel, callback_data: `f:${id}:cond:usado` },
      ],
      sizeButtons,
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
    case 'sz': {
      updated.sz = updated.sz === filterValue ? undefined : filterValue;
      if (!updated.sz) delete updated.sz;
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
  if (filters.sz && ML_SIZE_LABELS[filters.sz]) parts.push(`tam. ${ML_SIZE_LABELS[filters.sz]}`);
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
