const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const cache = require('./cache');

const GRAPHQL_URL = 'https://enjusearch.enjoei.com.br/graphql-search-x';
const QUERY_ID = 'c5faa5f85fb47bf0beaa97b67d8a9189';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

const PROXY_URL = process.env.PROXY_URL || '';
const CURL_BIN = process.env.CURL_BIN || 'curl';
const CITY = process.env.ENJOEI_CITY || 'sao-jose-dos-pinhais';
const STATE = process.env.ENJOEI_STATE || 'pr';

const CF_COOLDOWN_MS = parseInt(process.env.CF_COOLDOWN_MS, 10) || 300000;
const CF_MAX_COOLDOWN_MS = parseInt(process.env.CF_MAX_COOLDOWN_MS, 10) || 3600000;
const CF_ALERT_THROTTLE_MS = parseInt(process.env.CF_ALERT_THROTTLE_MS, 10) || 600000;
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS, 10) || 30000;
const JITTER_MS = parseInt(process.env.REQUEST_JITTER_MS, 10) || 2000;
const BROWSER_ID_ROTATE_MS = parseInt(process.env.BROWSER_ID_ROTATE_MS, 10) || 1800000;

let cloudflareCooldownUntil = 0;
let cloudflareBackoffMs = CF_COOLDOWN_MS;
let lastCfAlertTime = 0;
let cfBlockedGroupCount = 0;

let alertCallback = null;

function setAlertCallback(fn) {
  alertCallback = fn;
}

function throttledCfAlert(msg) {
  const now = Date.now();
  if (now - lastCfAlertTime < CF_ALERT_THROTTLE_MS) return;
  lastCfAlertTime = now;
  if (alertCallback) alertCallback(msg).catch(() => {});
}

function isCloudflareCooldown() {
  return Date.now() < cloudflareCooldownUntil;
}

function enterCloudflareCooldown() {
  const now = Date.now();
  cloudflareCooldownUntil = now + cloudflareBackoffMs;
  cloudflareBackoffMs = Math.min(cloudflareBackoffMs * 2, CF_MAX_COOLDOWN_MS);
  cfBlockedGroupCount++;
  const retryAt = new Date(cloudflareCooldownUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  throttledCfAlert(
    `Cloudflare bloqueado. Cooldown: ${Math.round(cloudflareBackoffMs / 60000)} min. Proxima tentativa: ${retryAt}.`,
  );
}

function resetCloudflareBackoff() {
  if (cloudflareBackoffMs !== CF_COOLDOWN_MS) {
    console.log('[enjoeiApi] Cloudflare backoff resetado.');
  }
  cloudflareBackoffMs = CF_COOLDOWN_MS;
  cfBlockedGroupCount = 0;
}

let browserId = null;
let browserIdCreatedAt = 0;

function getBrowserId() {
  const now = Date.now();
  if (browserId && now - browserIdCreatedAt < BROWSER_ID_ROTATE_MS) return browserId;

  if (browserId && now - browserIdCreatedAt >= BROWSER_ID_ROTATE_MS) {
    console.log('[enjoeiApi] Rotating browser_id...');
    browserId = null;
  }

  const dataDir = path.join(__dirname, '..', 'data');
  const idFile = path.join(dataDir, 'browser_id.txt');

  if (!browserId) {
    browserId = `${randomUUID()}-${Date.now()}`;
    browserIdCreatedAt = now;
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(idFile, browserId);
    } catch (err) {
      console.warn('[enjoeiApi] Could not persist browser_id:', err.message);
    }
    return browserId;
  }

  try {
    browserId = fs.readFileSync(idFile, 'utf8').trim();
    if (browserId) {
      browserIdCreatedAt = now;
      return browserId;
    }
  } catch {}

  browserId = `${randomUUID()}-${Date.now()}`;
  browserIdCreatedAt = now;
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
    Accept: '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    Origin: 'https://www.enjoei.com.br',
    Referer: 'https://www.enjoei.com.br/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
  };
}

function formatBrazilTimestamp(date) {
  const formatted = date.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const isoLike = formatted.replace(' ', 'T');
  const offset = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', timeZoneName: 'shortOffset' });
  const match = offset.match(/GMT([+-]\d+)/);
  const tzOffset = match ? match[1].replace(/^([+-])(\d)$/, '$10$2') : '-03';
  return `${isoLike}${tzOffset.slice(0, 3)}:${tzOffset.slice(3) || '00'}`;
}

const LP_OFFSETS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '14d': 14 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const LP_DEFAULT = '1h';
const LP_DEFAULT_SWEEP = '24h';

function buildSearchParams(term, filters, sinceTimestamp, useSweepDefault) {
  const params = new URLSearchParams();
  params.set('browser_id', getBrowserId());
  params.set('city', CITY);
  params.set('experienced_seller', 'true');
  params.set('first', '30');

  if (sinceTimestamp) {
    params.set('last_published_at', formatBrazilTimestamp(new Date(sinceTimestamp)));
  } else {
    const defaultLp = useSweepDefault ? LP_DEFAULT_SWEEP : LP_DEFAULT;
    const lp = (filters && filters.lp) || defaultLp;
    const offsetMs = LP_OFFSETS[lp] || LP_OFFSETS[defaultLp];
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
    const priceNum = typeof node.price === 'object' ? node.price.current || node.price.original || 0 : node.price;
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

function getProxyUrl() {
  if (!PROXY_URL) return null;

  if (PROXY_URL.includes('_session-')) return PROXY_URL;

  const sep = PROXY_URL.includes('@') ? '@' : ':';
  const atIndex = PROXY_URL.lastIndexOf('@');
  if (atIndex === -1) return PROXY_URL;

  const credsAndProtocol = PROXY_URL.substring(0, atIndex);
  const hostAndPort = PROXY_URL.substring(atIndex + 1);

  const sessionStr = `_session-${randomUUID().replace(/-/g, '').substring(0, 8)}`;
  const modifiedCreds = credsAndProtocol + sessionStr;

  return `${modifiedCreds}@${hostAndPort}`;
}

function curlFetch(url, headers) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-S', '--max-time', '8', '-w', '\n%{http_code}'];

    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      args.push('--proxy', proxyUrl);
    }

    for (const [key, value] of Object.entries(headers)) {
      args.push('-H', `${key}: ${value}`);
    }

    args.push(url);

    execFile(CURL_BIN, args, { maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`${CURL_BIN} failed: ${err.message} ${stderr || ''}`));
      }

      const lines = stdout.trimEnd().split('\n');
      const statusCode = parseInt(lines.pop(), 10);
      const body = lines.join('\n');

      resolve({ status: statusCode, body });
    });
  });
}

async function fetchProducts(term, filters, sinceTimestamp, useSweepDefault) {
  const cacheKey = `${term}||${JSON.stringify(filters || {})}||${sinceTimestamp || 0}||${useSweepDefault ? '1' : '0'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log(`[enjoeiApi] Cache hit for "${term}"`);
    return cached;
  }

  if (isCloudflareCooldown()) {
    console.log(`[enjoeiApi] Cloudflare cooldown ativo, pulando "${term}"`);
    return [];
  }

  if (JITTER_MS > 0) {
    await new Promise((r) => setTimeout(r, Math.random() * JITTER_MS));
  }

  const params = buildSearchParams(term, filters, sinceTimestamp, useSweepDefault);
  const url = `${GRAPHQL_URL}?${params.toString()}`;
  const headers = buildHeaders();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await curlFetch(url, headers);

      if (response.status === 429) {
        console.warn(`[enjoeiApi] Rate limited (429) for "${term}"`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 5000 * attempt));
          continue;
        }
        return [];
      }

      if (response.status === 403 || response.status === 503) {
        if (response.body.includes('<html') || response.body.includes('cloudflare')) {
          console.error(`[enjoeiApi] Cloudflare block (${response.status}) for "${term}"`);
          enterCloudflareCooldown();
          return [];
        }
      }

      if (response.status < 200 || response.status >= 300) {
        console.error(`[enjoeiApi] HTTP ${response.status} for "${term}" (attempt ${attempt}/${MAX_RETRIES})`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
          continue;
        }
        return [];
      }

      resetCloudflareBackoff();

      const json = JSON.parse(response.body);

      if (json.errors && json.errors.length > 0) {
        console.warn(`[enjoeiApi] GraphQL error for "${term}": ${json.errors[0].message}`);
        return [];
      }

      const edges = json?.data?.search?.products?.edges;
      if (!Array.isArray(edges)) {
        if (json?.data?.search?.products === null) {
          return [];
        }
        console.warn(`[enjoeiApi] Unexpected response structure for "${term}"`);
        return [];
      }

      const products = edges.map((edge) => normalizeProduct(edge.node));
      cache.set(cacheKey, products, CACHE_TTL_MS);
      return products;
    } catch (err) {
      console.error(`[enjoeiApi] Attempt ${attempt} failed for "${term}": ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BASE_MS * attempt));
      }
    }
  }

  console.error(`[enjoeiApi] All ${MAX_RETRIES} attempts failed for "${term}"`);
  return [];
}

cache.startCleanup(CACHE_TTL_MS > 0 ? CACHE_TTL_MS : 60000);

module.exports = {
  fetchProducts,
  normalizeProduct,
  getBrowserId,
  buildSearchParams,
  setAlertCallback,
  isCloudflareCooldown,
};
