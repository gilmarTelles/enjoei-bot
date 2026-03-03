const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_IMAGES = 20;

const TEXT_SYSTEM_PROMPT = 'You are a relevance filter for Brazilian marketplace products. Given a search keyword and a list of product titles, determine which products are relevant to what the user is looking for. Consider that keywords may refer to people, brands, characters, teams, etc. Respond with ONLY a JSON array of the product indices (0-based) that ARE relevant.';

const VISION_SYSTEM_PROMPT = 'You are a relevance filter for Brazilian marketplace products. Given a search keyword, product titles, and product images, determine which products are relevant to what the user is looking for based on BOTH the title text AND the product image. Consider that keywords may refer to people, brands, characters, teams, etc. Respond with ONLY a JSON array of the product indices (0-based) that ARE relevant.';

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildTextContent(products, keyword) {
  const numberedList = products.map((p, i) => `${i}. ${p.title}`).join('\n');
  return `Keyword: "${keyword}"\n\nProducts:\n${numberedList}`;
}

function buildVisionContent(products, keyword) {
  const blocks = [{ type: 'text', text: `Keyword: "${keyword}"\n\nProducts:\n` }];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (i < MAX_IMAGES && isValidImageUrl(p.image)) {
      blocks.push({ type: 'image', source: { type: 'url', url: p.image } });
    }
    blocks.push({ type: 'text', text: `${i}. ${p.title}` });
  }
  return blocks;
}

function parseResponse(response) {
  const raw = response.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(raw);
}

async function callFilter(content, systemPrompt) {
  const response = await client.messages.create({
    model: 'claude-3-5-haiku-latest',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });
  return parseResponse(response);
}

async function filterByRelevance(products, keyword) {
  if (process.env.ENABLE_RELEVANCE_FILTER !== 'true') return products;
  if (!products || products.length === 0) return products;

  const useVision = process.env.ENABLE_IMAGE_FILTER === 'true';

  try {
    let indices;

    if (useVision) {
      try {
        const visionContent = buildVisionContent(products, keyword);
        indices = await callFilter(visionContent, VISION_SYSTEM_PROMPT);
        console.log(`[relevance] "${keyword}": modo visao utilizado`);
      } catch (visionErr) {
        console.warn(`[relevance] Erro no filtro com visao: ${visionErr.message}. Tentando modo texto...`);
        const textContent = buildTextContent(products, keyword);
        indices = await callFilter(textContent, TEXT_SYSTEM_PROMPT);
      }
    } else {
      const textContent = buildTextContent(products, keyword);
      indices = await callFilter(textContent, TEXT_SYSTEM_PROMPT);
    }

    if (!Array.isArray(indices)) {
      console.warn('[relevance] Resposta nao e um array, retornando todos os produtos.');
      return products;
    }

    const filtered = indices
      .filter(idx => Number.isInteger(idx) && idx >= 0 && idx < products.length)
      .map(idx => products[idx]);

    console.log(`[relevance] "${keyword}": ${products.length} -> ${filtered.length} produto(s) relevante(s)`);
    return filtered;
  } catch (err) {
    console.warn(`[relevance] Erro no filtro de relevancia: ${err.message}. Retornando todos os produtos.`);
    return products;
  }
}

module.exports = { filterByRelevance, buildTextContent, buildVisionContent, isValidImageUrl, MAX_IMAGES };
