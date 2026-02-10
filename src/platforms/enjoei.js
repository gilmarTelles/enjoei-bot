const platformKey = 'enjoei';
const platformName = 'Enjoei';

function buildSearchUrl(keyword, filters) {
  const params = new URLSearchParams();
  params.set('q', keyword);

  // Default: last 24h. Only omit if user explicitly set lp to something else or 'all'
  if (!filters || !filters.lp) {
    params.set('lp', '24h');
  } else if (filters.lp !== 'all') {
    params.set('lp', filters.lp);
  }

  if (filters) {
    if (filters.used) params.set('u', 'true');
    if (filters.dep) params.set('dep', filters.dep);
    if (filters.sr) params.set('sr', 'same_country');
    if (filters.sz) params.set('size', filters.sz);
    if (filters.sort) params.set('sort', filters.sort);
  }

  return `https://www.enjoei.com.br/s?${params.toString()}`;
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

async function scrapeProductPrice(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    const price = await page.evaluate(() => {
      // Platform-specific selectors
      const selectors = ['[data-test="div-preco"]', '.ProductPage__price'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const match = el.textContent.match(/R\$\s*[\d.,]+/);
          if (match) return match[0];
        }
      }
      // Fallback: meta tag
      const meta = document.querySelector('meta[property="product:price:amount"]');
      if (meta) {
        const amount = meta.getAttribute('content');
        if (amount) return `R$ ${amount}`;
      }
      // Fallback: JSON-LD
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'Product' && data.offers) {
            const p = data.offers.price || (data.offers[0] && data.offers[0].price);
            if (p) return `R$ ${p}`;
          }
        } catch {}
      }
      // Fallback: regex on body
      const bodyMatch = document.body.innerText.match(/R\$\s*[\d.,]+/);
      return bodyMatch ? bodyMatch[0] : null;
    });

    return price;
  } catch (err) {
    console.error(`[enjoei] scrapeProductPrice failed for ${url}: ${err.message}`);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

function parseFilters(filtersStr) {
  if (!filtersStr) return {};
  try {
    return JSON.parse(filtersStr);
  } catch {
    return {};
  }
}

function buildFilterKeyboard(keywordRow) {
  const filters = parseFilters(keywordRow.filters);
  const id = keywordRow.id;

  const usedLabel = filters.used ? '\u2705 Somente usados' : '\u274C Somente usados';
  const depMLabel = filters.dep === 'masculino' ? '\u2705 Masculino' : '\u2B1C Masculino';
  const depFLabel = filters.dep === 'feminino' ? '\u2705 Feminino' : '\u2B1C Feminino';
  const srLabel = filters.sr ? '\u2705 Todo o Brasil' : '\u274C Todo o Brasil';
  const sortALabel = filters.sort === 'price_asc' ? '\u2705 Menor preco' : '\u2B1C Menor preco';
  const sortDLabel = filters.sort === 'price_desc' ? '\u2705 Maior preco' : '\u2B1C Maior preco';

  // Last posted filter (lp). Default is 24h when not set.
  const lpValue = filters.lp || '24h';
  const lp24Label = lpValue === '24h' ? '\u2705 24h' : '\u2B1C 24h';
  const lp48Label = lpValue === '48h' ? '\u2705 48h' : '\u2B1C 48h';
  const lp7dLabel = lpValue === '7d' ? '\u2705 7 dias' : '\u2B1C 7 dias';
  const lpAllLabel = lpValue === 'all' ? '\u2705 Todos' : '\u2B1C Todos';

  const szLabels = { pp: 'PP', p: 'P', m: 'M', g: 'G', gg: 'GG' };
  const szRow = Object.entries(szLabels).map(([key, label]) => ({
    text: filters.sz === key ? `\u2705 ${label}` : `\u2B1C ${label}`,
    callback_data: `f:${id}:sz:${key}`,
  }));

  return {
    inline_keyboard: [
      [
        { text: lp24Label, callback_data: `f:${id}:lp:24h` },
        { text: lp48Label, callback_data: `f:${id}:lp:48h` },
        { text: lp7dLabel, callback_data: `f:${id}:lp:7d` },
        { text: lpAllLabel, callback_data: `f:${id}:lp:all` },
      ],
      [{ text: usedLabel, callback_data: `f:${id}:used:t` }],
      [
        { text: depMLabel, callback_data: `f:${id}:dep:m` },
        { text: depFLabel, callback_data: `f:${id}:dep:f` },
      ],
      szRow,
      [{ text: srLabel, callback_data: `f:${id}:sr:t` }],
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
    case 'lp':
      // Toggle: if same value, reset to default (24h)
      if (updated.lp === filterValue) {
        delete updated.lp; // reverts to default 24h
      } else {
        updated.lp = filterValue;
      }
      break;
    case 'used':
      updated.used = !updated.used;
      if (!updated.used) delete updated.used;
      break;
    case 'dep': {
      const depMap = { m: 'masculino', f: 'feminino' };
      const newDep = depMap[filterValue];
      updated.dep = updated.dep === newDep ? undefined : newDep;
      if (!updated.dep) delete updated.dep;
      break;
    }
    case 'sz':
      updated.sz = updated.sz === filterValue ? undefined : filterValue;
      if (!updated.sz) delete updated.sz;
      break;
    case 'sr':
      updated.sr = !updated.sr;
      if (!updated.sr) delete updated.sr;
      break;
    case 'sort': {
      const sortMap = { a: 'price_asc', d: 'price_desc' };
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
  if (filters.lp && filters.lp !== '24h') {
    const lpLabels = { '48h': '48h', '7d': '7 dias', all: 'todos' };
    parts.push(`periodo: ${lpLabels[filters.lp] || filters.lp}`);
  }
  if (filters.used) parts.push('usado');
  if (filters.dep) parts.push(filters.dep);
  if (filters.sz) parts.push(`tam: ${filters.sz.toUpperCase()}`);
  if (filters.sr) parts.push('todo o Brasil');
  if (filters.sort === 'price_asc') parts.push('menor preco');
  if (filters.sort === 'price_desc') parts.push('maior preco');
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

module.exports = {
  platformKey,
  platformName,
  buildSearchUrl,
  scrapePage,
  scrapeProductPrice,
  buildFilterKeyboard,
  applyFilterToggle,
  formatFiltersSummary,
};
