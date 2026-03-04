const enjoei = require('../../src/platforms/enjoei');
const { normalizeProduct, buildSearchParams } = require('../../src/enjoeiApi');

describe('enjoeiApi.normalizeProduct', () => {
  test('normalizes a standard API node', () => {
    const node = {
      title: { name: 'Nike Air Max 90' },
      price: { original: 200, current: 150 },
      path: 'nike-air-max-90-abc123',
      photo: { image_public_id: 'abc123def' },
      store: { displayable: { name: 'joao' } },
    };
    const product = normalizeProduct(node);
    expect(product.id).toBe('nike-air-max-90-abc123');
    expect(product.title).toBe('Nike Air Max 90');
    expect(product.price).toBe('R$ 150,00');
    expect(product.url).toBe('https://www.enjoei.com.br/p/nike-air-max-90-abc123');
    expect(product.image).toBe('https://photos.enjoei.com.br/abc123def/828xN/abc123def.jpg');
    expect(product.seller).toBe('joao');
  });

  test('handles title as object with name', () => {
    const node = { title: { name: 'Adidas Superstar' }, price: { current: 99 }, slug: 'adidas-123' };
    const product = normalizeProduct(node);
    expect(product.title).toBe('Adidas Superstar');
  });

  test('handles missing optional fields', () => {
    const node = { id: '12345', title: 'Test', price: 50 };
    const product = normalizeProduct(node);
    expect(product.id).toBe('12345');
    expect(product.image).toBe('');
    expect(product.seller).toBe('');
  });

  test('handles photo without image_public_id', () => {
    const node = { title: { name: 'Test' }, price: 10, path: 'test', photo: {} };
    const product = normalizeProduct(node);
    expect(product.image).toBe('');
  });
});

describe('enjoeiApi.buildSearchParams', () => {
  test('includes required params', () => {
    const params = buildSearchParams('nike', null, null);
    expect(params.get('term')).toBe('nike');
    expect(params.get('first')).toBe('30');
    expect(params.get('operation_name')).toBe('searchProducts');
    expect(params.get('browser_id')).toBeTruthy();
    expect(params.get('search_id')).toBeTruthy();
  });

  test('includes sinceTimestamp in Brazil timezone format', () => {
    const ts = new Date('2026-01-01T00:00:00Z').getTime();
    const params = buildSearchParams('nike', null, ts);
    expect(params.get('last_published_at')).toBe('2025-12-31T21:00:00-03:00');
  });

  test('maps filters correctly', () => {
    const params = buildSearchParams('nike', { used: true, sr: 'near_regions', dep: 'masculino', sz: 'g' }, null);
    expect(params.get('used')).toBe('true');
    expect(params.get('shipping_range')).toBe('near_regions');
    expect(params.get('department')).toBe('masculino');
    expect(params.get('size')).toBe('g');
  });
});

describe('enjoei.searchProducts', () => {
  const mockApiResponse = {
    data: {
      search: {
        products: {
          edges: [
            { node: { title: { name: 'Nike Air' }, price: { current: 100 }, path: 'nike-air-1', photo: { image_public_id: 'img1' }, user: { name: 'seller1' } } },
            { node: { title: { name: 'Nike Dunk' }, price: { current: 200 }, path: 'nike-dunk-2', photo: { image_public_id: 'img2' }, user: { name: 'seller2' } } },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockApiResponse),
      })
    );
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns normalized products from API', async () => {
    const products = await enjoei.searchProducts('nike', null);
    expect(products).toHaveLength(2);
    expect(products[0].title).toBe('Nike Air');
    expect(products[0].url).toContain('/p/nike-air-1');
    expect(products[1].title).toBe('Nike Dunk');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('enjusearch.enjoei.com.br');
    expect(calledUrl).toContain('term=nike');
  });

  test('searchProductsSince passes sinceTimestamp', async () => {
    const ts = Date.now() - 3600000;
    await enjoei.searchProductsSince('nike', null, ts);
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('last_published_at=');
  });

  test('returns empty array on API error', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('error') })
    );
    const products = await enjoei.searchProducts('nike', null);
    expect(products).toEqual([]);
  });
});

describe('enjoei.buildSearchUrl', () => {
  test('URL basica sem filtros - slug no path e lp=24h por padrao', () => {
    const url = enjoei.buildSearchUrl('nike', null);
    expect(url).toBe('https://www.enjoei.com.br/nike/s?q=nike&lp=24h');
  });

  test('URL com keyword multi-palavra usa slug com hifens', () => {
    const url = enjoei.buildSearchUrl('selecao brasileira', null);
    expect(url).toContain('/selecao-brasileira/s?');
    expect(url).toContain('q=selecao-brasileira');
  });

  test('URL com filtros vazio - inclui lp=24h por padrao', () => {
    const url = enjoei.buildSearchUrl('nike', {});
    expect(url).toContain('lp=24h');
  });

  test('URL com lp=14d', () => {
    const url = enjoei.buildSearchUrl('nike', { lp: '14d' });
    expect(url).toContain('lp=14d');
    expect(url).not.toContain('lp=24h');
  });

  test('URL com lp=30d', () => {
    const url = enjoei.buildSearchUrl('nike', { lp: '30d' });
    expect(url).toContain('lp=30d');
    expect(url).not.toContain('lp=24h');
  });

  test('URL com filtro usado', () => {
    const url = enjoei.buildSearchUrl('nike', { used: true });
    expect(url).toContain('u=true');
  });

  test('URL com filtro departamento usa param d', () => {
    const url = enjoei.buildSearchUrl('nike', { dep: 'masculino' });
    expect(url).toContain('d=masculino');
    expect(url).not.toContain('dep=');
  });

  test('URL com filtro tamanho usa param st[sc]', () => {
    const url = enjoei.buildSearchUrl('nike', { sz: 'g' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('st[sc]')).toBe('g');
  });

  test('URL com filtro regiao same_country', () => {
    const url = enjoei.buildSearchUrl('nike', { sr: 'same_country' });
    expect(url).toContain('sr=same_country');
  });

  test('URL com filtro regiao near_regions', () => {
    const url = enjoei.buildSearchUrl('nike', { sr: 'near_regions' });
    expect(url).toContain('sr=near_regions');
  });

  test('URL com filtro sort', () => {
    const url = enjoei.buildSearchUrl('nike', { sort: 'price_asc' });
    expect(url).toContain('sort=price_asc');
  });

  test('URL com todos os filtros corresponde ao formato real do Enjoei', () => {
    const url = enjoei.buildSearchUrl('selecao brasileira', {
      lp: '24h',
      used: true,
      dep: 'masculino',
      sz: 'g',
      sr: 'same_country',
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/selecao-brasileira/s');
    expect(parsed.searchParams.get('q')).toBe('selecao-brasileira');
    expect(parsed.searchParams.get('lp')).toBe('24h');
    expect(parsed.searchParams.get('u')).toBe('true');
    expect(parsed.searchParams.get('d')).toBe('masculino');
    expect(parsed.searchParams.get('st[sc]')).toBe('g');
    expect(parsed.searchParams.get('sr')).toBe('same_country');
  });
});

describe('enjoei.buildFilterKeyboard', () => {
  test('constroi teclado com filtros inativos (lp=24h default highlighted)', () => {
    const keyboard = enjoei.buildFilterKeyboard({ id: 1, keyword: 'nike', filters: null });
    expect(keyboard).toHaveProperty('inline_keyboard');
    const rows = keyboard.inline_keyboard;
    // lp row, used, dep, sz, sr, sort, clear = 7 rows
    expect(rows).toHaveLength(7);
    // First row is lp (24h should be active by default)
    expect(rows[0][0].text).toContain('\u2705'); // 24h active
    expect(rows[0][0].text).toContain('24h');
  });

  test('constroi teclado com filtros ativos', () => {
    const keyboard = enjoei.buildFilterKeyboard({
      id: 1,
      keyword: 'nike',
      filters: '{"used":true,"dep":"masculino","sz":"m","sr":"same_country","sort":"price_asc"}',
    });
    const rows = keyboard.inline_keyboard;
    expect(rows[1][0].text).toContain('\u2705'); // used active
    expect(rows[2][0].text).toContain('\u2705'); // masculino active
    expect(rows[3][2].text).toContain('\u2705'); // M active
    expect(rows[4][1].text).toContain('\u2705'); // Todo o Brasil active
    expect(rows[4][0].text).toContain('\u2B1C'); // Perto de mim inactive
    expect(rows[5][0].text).toContain('\u2705'); // price_asc active
  });
});

describe('enjoei.applyFilterToggle', () => {
  test('toggle used on', () => {
    const result = enjoei.applyFilterToggle({}, 'used', 't');
    expect(result.used).toBe(true);
  });

  test('toggle used off', () => {
    const result = enjoei.applyFilterToggle({ used: true }, 'used', 't');
    expect(result.used).toBeUndefined();
  });

  test('toggle dep masculino', () => {
    const result = enjoei.applyFilterToggle({}, 'dep', 'm');
    expect(result.dep).toBe('masculino');
  });

  test('toggle dep off', () => {
    const result = enjoei.applyFilterToggle({ dep: 'masculino' }, 'dep', 'm');
    expect(result.dep).toBeUndefined();
  });

  test('toggle lp to 14d', () => {
    const result = enjoei.applyFilterToggle({}, 'lp', '14d');
    expect(result.lp).toBe('14d');
  });

  test('toggle lp off (same value)', () => {
    const result = enjoei.applyFilterToggle({ lp: '14d' }, 'lp', '14d');
    expect(result.lp).toBeUndefined();
  });

  test('toggle sr near_regions on', () => {
    const result = enjoei.applyFilterToggle({}, 'sr', 'near');
    expect(result.sr).toBe('near_regions');
  });

  test('toggle sr same_country on', () => {
    const result = enjoei.applyFilterToggle({}, 'sr', 'country');
    expect(result.sr).toBe('same_country');
  });

  test('toggle sr switches between values', () => {
    const result = enjoei.applyFilterToggle({ sr: 'near_regions' }, 'sr', 'country');
    expect(result.sr).toBe('same_country');
  });

  test('toggle sr off (same value)', () => {
    const result = enjoei.applyFilterToggle({ sr: 'same_country' }, 'sr', 'country');
    expect(result.sr).toBeUndefined();
  });
});

describe('enjoei.formatFiltersSummary', () => {
  test('retorna vazio para filtros null', () => {
    expect(enjoei.formatFiltersSummary(null)).toBe('');
  });

  test('retorna vazio para filtros vazios', () => {
    expect(enjoei.formatFiltersSummary({})).toBe('');
  });

  test('formata filtro usado', () => {
    expect(enjoei.formatFiltersSummary({ used: true })).toBe(' [usado]');
  });

  test('formata filtro departamento', () => {
    expect(enjoei.formatFiltersSummary({ dep: 'masculino' })).toBe(' [masculino]');
  });

  test('formata filtro tamanho', () => {
    expect(enjoei.formatFiltersSummary({ sz: 'm' })).toBe(' [tam: M]');
  });

  test('formata filtro periodo nao padrao', () => {
    expect(enjoei.formatFiltersSummary({ lp: '14d' })).toBe(' [periodo: 14 dias]');
  });

  test('nao mostra periodo 24h (padrao)', () => {
    expect(enjoei.formatFiltersSummary({ lp: '24h' })).toBe('');
  });

  test('formata filtro perto de mim', () => {
    expect(enjoei.formatFiltersSummary({ sr: 'near_regions' })).toBe(' [perto de mim]');
  });

  test('formata filtro todo o Brasil', () => {
    expect(enjoei.formatFiltersSummary({ sr: 'same_country' })).toBe(' [todo o Brasil]');
  });

  test('formata multiplos filtros', () => {
    const result = enjoei.formatFiltersSummary({ used: true, dep: 'masculino', sz: 'g', sr: 'same_country', sort: 'price_asc' });
    expect(result).toContain('usado');
    expect(result).toContain('masculino');
    expect(result).toContain('tam: G');
    expect(result).toContain('todo o Brasil');
    expect(result).toContain('menor preco');
  });
});

describe('enjoei module exports', () => {
  test('platformKey is enjoei', () => {
    expect(enjoei.platformKey).toBe('enjoei');
  });

  test('platformName is Enjoei', () => {
    expect(enjoei.platformName).toBe('Enjoei');
  });

  test('exports searchProducts and searchProductsSince', () => {
    expect(typeof enjoei.searchProducts).toBe('function');
    expect(typeof enjoei.searchProductsSince).toBe('function');
  });
});
