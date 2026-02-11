const platformKey = 'olx';
const platformName = 'OLX';

function buildSearchUrl(keyword, filters) {
  const params = new URLSearchParams();
  params.set('q', keyword);

  // Default to most recent items (sort by date)
  let sortSet = false;
  if (filters) {
    if (filters.ps) params.set('ps', filters.ps);
    if (filters.pe) params.set('pe', filters.pe);
    if (filters.sort === 'relevance') { sortSet = true; /* OLX default, no param */ }
    else if (filters.sort === 'date') { params.set('sf', '1'); sortSet = true; }
    else if (filters.sort === 'price_asc') { params.set('sf', '2'); sortSet = true; }
    else if (filters.sort === 'price_desc') { params.set('sf', '3'); sortSet = true; }
  }

  // Default: sort by date (most recent) when no sort specified
  if (!sortSet) {
    params.set('sf', '1');
  }

  return `https://www.olx.com.br/brasil?${params.toString()}`;
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

    // OLX uses React/Next.js — wait for ad card links
    await page.waitForSelector('a[href*="/d/"]', { timeout: 15000 }).catch(() => null);
    await new Promise(r => setTimeout(r, 2000));

    const products = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/d/"]');
      const seen = new Set();

      for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (seen.has(href)) continue;
        seen.add(href);

        // Extract ID from URL path
        const idMatch = href.match(/(\d+)$/);
        const productId = idMatch ? idMatch[1] : href;

        // Title: look for heading or data attribute within the link card
        const titleEl = link.querySelector('h2, [data-ds-component="DS-Text"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title) continue; // Skip non-ad links

        // Price
        const priceEl = link.querySelector('[data-ds-component="DS-Text"]');
        let price = '';
        const allTexts = link.querySelectorAll('[data-ds-component="DS-Text"], span, p');
        for (const el of allTexts) {
          const text = el.textContent.trim();
          if (text.match(/R\$\s*[\d.,]+/)) {
            price = text;
            break;
          }
        }

        // Image
        const imgEl = link.querySelector('img');
        const image = imgEl ? (imgEl.getAttribute('src') || '') : '';

        const fullUrl = href.startsWith('http') ? href : `https://www.olx.com.br${href}`;

        results.push({ id: productId, title, price, url: fullUrl, image });
      }

      return results;
    });

    return products;
  } catch (err) {
    // OLX has anti-bot measures — graceful failure
    console.error(`[olx] Scrape failed for "${keyword}": ${err.message}`);
    return [];
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

  const sortRelLabel = (!filters.sort || filters.sort === 'relevance') ? '\u2705 Relevancia' : '\u2B1C Relevancia';
  const sortDateLabel = filters.sort === 'date' ? '\u2705 Mais recente' : '\u2B1C Mais recente';
  const sortALabel = filters.sort === 'price_asc' ? '\u2705 Menor preco' : '\u2B1C Menor preco';
  const sortDLabel = filters.sort === 'price_desc' ? '\u2705 Maior preco' : '\u2B1C Maior preco';

  return {
    inline_keyboard: [
      [
        { text: sortRelLabel, callback_data: `f:${id}:sort:rel` },
        { text: sortDateLabel, callback_data: `f:${id}:sort:date` },
      ],
      [
        { text: sortALabel, callback_data: `f:${id}:sort:a` },
        { text: sortDLabel, callback_data: `f:${id}:sort:d` },
      ],
      [{ text: '\uD83D\uDDD1 Limpar filtros', callback_data: `f:${id}:clr:0` }],
    ],
  };
}

function applyFilterToggle(filters, filterType, filterValue) {
  const updated = { ...filters };

  switch (filterType) {
    case 'sort': {
      const sortMap = { rel: 'relevance', date: 'date', a: 'price_asc', d: 'price_desc' };
      const newSort = sortMap[filterValue];
      updated.sort = updated.sort === newSort ? undefined : newSort;
      if (!updated.sort) delete updated.sort;
      break;
    }
  }

  return updated;
}

function formatFiltersSummary(filters) {
  if (!filters || Object.keys(filters).length === 0) return '';
  const parts = [];
  if (filters.sort === 'relevance') parts.push('relevancia');
  if (filters.sort === 'date') parts.push('mais recente');
  if (filters.sort === 'price_asc') parts.push('menor preco');
  if (filters.sort === 'price_desc') parts.push('maior preco');
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
