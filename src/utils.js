function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

const ALLOWED_FILTER_KEYS = new Set(['lp', 'used', 'dep', 'sz', 'sr', 'sort']);
const ALLOWED_FILTER_VALUES = {
  lp: new Set(['1h', '24h', '7d', '14d', '30d']),
  used: new Set([true, false]),
  dep: new Set(['masculino', 'feminino']),
  sz: new Set(['pp', 'p', 'm', 'g', 'gg']),
  sr: new Set(['near_regions', 'same_country']),
  sort: new Set(['price_asc', 'price_desc']),
};

function validateFilters(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  const validated = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) continue;
    const allowedVals = ALLOWED_FILTER_VALUES[key];
    if (allowedVals && !allowedVals.has(value)) continue;
    validated[key] = value;
  }
  return validated;
}

function parseFilters(filtersStr) {
  if (!filtersStr) return {};
  try {
    const parsed = JSON.parse(filtersStr);
    return validateFilters(parsed);
  } catch {
    return {};
  }
}

function sanitizeKeyword(keyword) {
  return keyword
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, '')
    .replace(/[<>{}[\]|\\^~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { parsePrice, parseFilters, sanitizeKeyword };
