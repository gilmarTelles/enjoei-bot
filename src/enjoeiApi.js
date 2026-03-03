const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const GRAPHQL_URL = 'https://enjusearch.enjoei.com.br/graphql-search-x';
const QUERY_ID = 'c5faa5f85fb47bf0beaa97b67d8a9189';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

let browserId = null;

function getBrowserId() {
  if (browserId) return browserId;

  const dataDir = path.join(__dirname, '..', 'data');
  const idFile = path.join(dataDir, 'browser_id.txt');

  try {
    browserId = fs.readFileSync(idFile, 'utf8').trim();
    if (browserId) return browserId;
  } catch {}

  browserId = `${randomUUID()}-${Date.now()}`;
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(idFile, browserId);
  } catch (err) {
    console.warn('[enjoeiApi] Could not persist browser_id:', err.message);
  }
  return browserId;
}

function buildHeaders() {
  return {
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://www.enjoei.com.br',
    'Referer': 'https://www.enjoei.com.br/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
  };
}

function buildSearchParams(term, filters, sinceTimestamp) {
  const params = new URLSearchParams();
  params.set('browser_id', getBrowserId());
  params.set('search_id', `${randomUUID()}-${Date.now()}`);
  params.set('term', term);
  params.set('first', '30');
  params.set('operation_name', 'searchProducts');
  params.set('query_id', QUERY_ID);
  params.set('search_context', 'products_search');
  params.set('experienced_seller', 'true');

  if (sinceTimestamp) {
    const iso = new Date(sinceTimestamp).toISOString();
    params.set('last_published_at', iso);
  }

  if (filters) {
    if (filters.used) params.set('used', 'true');
    if (filters.sr === 'near_regions') params.set('shipping_range', 'near_regions');
    if (filters.sr === 'same_country') params.set('shipping_range', 'same_country');
    if (filters.dep) params.set('department', filters.dep);
    if (filters.sz) params.set('size', filters.sz);
    if (filters.sort === 'price_asc') params.set('sort', 'price_asc');
    if (filters.sort === 'price_desc') params.set('sort', 'price_desc');
  }

  return params;
}

function normalizeProduct(node) {
  const title = typeof node.title === 'object' && node.title !== null
    ? (node.title.name || '')
    : (node.title || '');

  let price = '';
  if (node.price != null) {
    const priceNum = typeof node.price === 'object' ? (node.price.listed || node.price.current || 0) : node.price;
    const cents = typeof priceNum === 'number' ? priceNum : parseFloat(priceNum) || 0;
    // API returns price in cents (integer) or reais (float) — detect by magnitude
    const reais = cents >= 10000 ? cents / 100 : cents;
    price = `R$ ${reais.toFixed(2).replace('.', ',')}`;
  }

  const slug = node.path || node.slug || node.id || '';
  const url = slug ? `https://www.enjoei.com.br/p/${slug}` : '';

  let image = '';
  if (node.photo && node.photo.url) {
    image = node.photo.url;
  } else if (node.photos && node.photos.length > 0) {
    image = node.photos[0].url || '';
  }

  const seller = node.user
    ? (node.user.name || node.user.username || '')
    : '';

  return {
    id: slug || String(node.id || ''),
    title,
    price,
    url,
    image,
    seller,
  };
}

async function fetchProducts(term, filters, sinceTimestamp) {
  const params = buildSearchParams(term, filters, sinceTimestamp);
  const url = `${GRAPHQL_URL}?${params.toString()}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        console.warn(`[enjoeiApi] Rate limited (429), waiting ${retryAfter}s...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (response.status === 403 || response.status === 503) {
        const body = await response.text();
        if (body.includes('<html') || body.includes('cloudflare')) {
          console.error(`[enjoeiApi] Cloudflare block detected (${response.status})`);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
            continue;
          }
          return [];
        }
      }

      if (!response.ok) {
        console.error(`[enjoeiApi] HTTP ${response.status} for "${term}"`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        return [];
      }

      const json = await response.json();
      const edges = json?.data?.search?.products?.edges;
      if (!Array.isArray(edges)) {
        console.warn(`[enjoeiApi] Unexpected response structure for "${term}"`);
        return [];
      }

      return edges.map(edge => normalizeProduct(edge.node));
    } catch (err) {
      console.error(`[enjoeiApi] Attempt ${attempt} failed for "${term}": ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
      }
    }
  }

  console.error(`[enjoeiApi] All ${MAX_RETRIES} attempts failed for "${term}"`);
  return [];
}

module.exports = { fetchProducts, normalizeProduct, getBrowserId, buildSearchParams };
