function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseFilters(filtersStr) {
  if (!filtersStr) return {};
  try {
    return JSON.parse(filtersStr);
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
