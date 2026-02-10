const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function filterByRelevance(products, keyword) {
  if (process.env.ENABLE_RELEVANCE_FILTER !== 'true') return products;
  if (!products || products.length === 0) return products;

  try {
    const numberedList = products.map((p, i) => `${i}. ${p.title}`).join('\n');

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1024,
      system: 'You are a relevance filter for Brazilian marketplace products. Given a search keyword and a list of product titles, determine which products are relevant to what the user is looking for. Consider that keywords may refer to people, brands, characters, teams, etc. Respond with ONLY a JSON array of the product indices (0-based) that ARE relevant.',
      messages: [
        {
          role: 'user',
          content: `Keyword: "${keyword}"\n\nProducts:\n${numberedList}`,
        },
      ],
    });

    const text = response.content[0].text.trim();
    const indices = JSON.parse(text);

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

module.exports = { filterByRelevance };
