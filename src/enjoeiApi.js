const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const GRAPHQL_URL = 'https://enjusearch.enjoei.com.br/graphql-search-x';
const QUERY_ID = 'c5faa5f85fb47bf0beaa97b67d8a9189';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const PROXY_URL = process.env.PROXY_URL || '';

// Location defaults (Enjoei uses these for search relevance)
const CITY = process.env.ENJOEI_CITY || 'sao-jose-dos-pinhais';
const STATE = process.env.ENJOEI_STATE || 'pr';

let alertCallback = null;

function setAlertCallback(fn) { alertCallback = fn; }

function alert(msg) {
  if (alertCallback) alertCallback(msg).catch(() => {});
}

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
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
  };
}

// Format a Date as Brazil timezone offset string: YYYY-MM-DDTHH:MM:SS-03:00
function formatBrazilTimestamp(date) {
  const utcMs = date.getTime();
  const brMs = utcMs + (-3 * 60 * 60 * 1000); // UTC-3
  const br = new Date(brMs);
  const pad = n => String(n).padStart(2, '0');
  return `${br.getUTCFullYear()}-${pad(br.getUTCMonth() + 1)}-${pad(br.getUTCDate())}T${pad(br.getUTCHours())}:${pad(br.getUTCMinutes())}:${pad(br.getUTCSeconds())}-03:00`;
}

// Convert lp filter value to a last_published_at timestamp
const LP_OFFSETS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function buildSearchParams(term, filters, sinceTimestamp) {
  const params = new URLSearchParams();
  params.set('browser_id', getBrowserId());
  params.set('city', CITY);
  params.set('experienced_seller', 'true');
  params.set('first', '30');

  // Time filter: explicit sinceTimestamp takes priority, then lp filter, default 24h
  if (sinceTimestamp) {
    params.set('last_published_at', formatBrazilTimestamp(new Date(sinceTimestamp)));
  } else {
    const lp = (filters && filters.lp) || '24h';
    const offsetMs = LP_OFFSETS[lp] || LP_OFFSETS['24h'];
    params.set('last_published_at', formatBrazilTimestamp(new Date(Date.now() - offsetMs)));
  }

  params.set('operation_name', 'searchProducts');
  params.set('query_id', QUERY_ID);
  params.set('search_context', 'products_search_default');
  params.set('search_id', `${randomUUID()}-${Date.now()}`);

  if (filters) {
    if (filters.sr) params.set('shipping_range', filters.sr);
    if (filters.used) params.set('used', 'true');
    if (filters.dep) params.set('department', filters.dep);
    if (filters.sz) params.set('size', filters.sz);
  }

  params.set('state', STATE);
  params.set('term', term);

  return params;
}

function normalizeProduct(node) {
  const title = (node.title && node.title.name) || '';

  let price = '';
  if (node.price != null) {
    const priceNum = typeof node.price === 'object'
      ? (node.price.current || node.price.original || 0)
      : node.price;
    const reais = typeof priceNum === 'number' ? priceNum : parseFloat(priceNum) || 0;
    price = `R$ ${reais.toFixed(2).replace('.', ',')}`;
  }

  const slug = node.path || node.id || '';
  const url = slug ? `https://www.enjoei.com.br/p/${slug}` : '';

  let image = '';
  const publicId = node.photo?.image_public_id;
  if (publicId) {
    image = `https://photos.enjoei.com.br/${publicId}/828xN/${publicId}.jpg`;
  }

  const seller = node.store?.displayable?.name || '';

  return {
    id: slug || String(node.id || ''),
    title,
    price,
    url,
    image,
    seller,
  };
}

// Execute curl as a subprocess to avoid Node.js TLS fingerprinting by Cloudflare
function curlFetch(url, headers) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-S', '--max-time', '8', '-k', '-w', '\n%{http_code}'];

    if (PROXY_URL) {
      args.push('--proxy', PROXY_URL);
    }

    for (const [key, value] of Object.entries(headers)) {
      args.push('-H', `${key}: ${value}`);
    }

    args.push(url);

    execFile('curl', args, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`curl failed: ${err.message} ${stderr || ''}`));
      }

      const lines = stdout.trimEnd().split('\n');
      const statusCode = parseInt(lines.pop(), 10);
      const body = lines.join('\n');

      resolve({ status: statusCode, body });
    });
  });
}

async function fetchProducts(term, filters, sinceTimestamp) {
  const params = buildSearchParams(term, filters, sinceTimestamp);
  const url = `${GRAPHQL_URL}?${params.toString()}`;
  const headers = buildHeaders();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await curlFetch(url, headers);

      if (response.status === 429) {
        console.warn(`[enjoeiApi] Rate limited (429), waiting 5s...`);
        alert(`Rate limit (429) ao buscar "${term}". Retry em 5s (tentativa ${attempt}/${MAX_RETRIES}).`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      if (response.status === 403 || response.status === 503) {
        if (response.body.includes('<html') || response.body.includes('cloudflare')) {
          console.error(`[enjoeiApi] Cloudflare block detected (${response.status})`);
          alert(`Cloudflare block (${response.status}) ao buscar "${term}" (tentativa ${attempt}/${MAX_RETRIES}).`);
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
            continue;
          }
          return [];
        }
      }

      if (response.status < 200 || response.status >= 300) {
        console.error(`[enjoeiApi] HTTP ${response.status} for "${term}"`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        return [];
      }

      const json = JSON.parse(response.body);

      // Check for GraphQL errors
      if (json.errors && json.errors.length > 0) {
        console.warn(`[enjoeiApi] GraphQL error for "${term}": ${json.errors[0].message}`);
        return [];
      }

      const edges = json?.data?.search?.products?.edges;
      if (!Array.isArray(edges)) {
        // products can be null when no results for a time window — not an error
        if (json?.data?.search?.products === null) {
          return [];
        }
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

  alert(`Todas as ${MAX_RETRIES} tentativas falharam para "${term}".`);
  console.error(`[enjoeiApi] All ${MAX_RETRIES} attempts failed for "${term}"`);
  return [];
}

module.exports = { fetchProducts, normalizeProduct, getBrowserId, buildSearchParams, setAlertCallback };
