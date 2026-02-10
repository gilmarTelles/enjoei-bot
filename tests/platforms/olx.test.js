const olx = require('../../src/platforms/olx');

describe('olx.buildSearchUrl', () => {
  test('URL basica sem filtros - inclui sf=1 (date sort) por padrao', () => {
    const url = olx.buildSearchUrl('nike', null);
    expect(url).toContain('olx.com.br/brasil?');
    expect(url).toContain('q=nike');
    expect(url).toContain('sf=1');
  });

  test('URL com sort by date', () => {
    const url = olx.buildSearchUrl('nike', { sort: 'date' });
    expect(url).toContain('sf=1');
  });

  test('URL com sort by price_asc', () => {
    const url = olx.buildSearchUrl('nike', { sort: 'price_asc' });
    expect(url).toContain('sf=2');
  });

  test('URL com sort by price_desc', () => {
    const url = olx.buildSearchUrl('nike', { sort: 'price_desc' });
    expect(url).toContain('sf=3');
  });

  test('URL com sort by relevance nao inclui sf (mas nao inclui default sf=1)', () => {
    const url = olx.buildSearchUrl('nike', { sort: 'relevance' });
    expect(url).not.toContain('sf=');
  });

  test('URL com price min/max', () => {
    const url = olx.buildSearchUrl('nike', { ps: '100', pe: '500' });
    expect(url).toContain('ps=100');
    expect(url).toContain('pe=500');
  });
});

describe('olx.buildFilterKeyboard', () => {
  test('constroi teclado com filtros inativos', () => {
    const keyboard = olx.buildFilterKeyboard({ id: 1, keyword: 'nike', filters: null });
    expect(keyboard).toHaveProperty('inline_keyboard');
    const rows = keyboard.inline_keyboard;
    // sort row 1, sort row 2, clear = 3 rows
    expect(rows).toHaveLength(3);
  });

  test('constroi teclado com sort date ativo', () => {
    const keyboard = olx.buildFilterKeyboard({
      id: 1,
      keyword: 'nike',
      filters: '{"sort":"date"}',
    });
    const rows = keyboard.inline_keyboard;
    expect(rows[0][1].text).toContain('\u2705'); // date active
    expect(rows[0][0].text).toContain('\u2B1C'); // relevance inactive
  });
});

describe('olx.applyFilterToggle', () => {
  test('toggle sort date on', () => {
    const result = olx.applyFilterToggle({}, 'sort', 'date');
    expect(result.sort).toBe('date');
  });

  test('toggle sort date off', () => {
    const result = olx.applyFilterToggle({ sort: 'date' }, 'sort', 'date');
    expect(result.sort).toBeUndefined();
  });

  test('toggle sort price_asc', () => {
    const result = olx.applyFilterToggle({}, 'sort', 'a');
    expect(result.sort).toBe('price_asc');
  });
});

describe('olx.formatFiltersSummary', () => {
  test('retorna vazio para filtros null', () => {
    expect(olx.formatFiltersSummary(null)).toBe('');
  });

  test('formata sort date', () => {
    expect(olx.formatFiltersSummary({ sort: 'date' })).toBe(' [mais recente]');
  });

  test('formata sort price_asc', () => {
    expect(olx.formatFiltersSummary({ sort: 'price_asc' })).toBe(' [menor preco]');
  });
});

describe('olx module exports', () => {
  test('platformKey is olx', () => {
    expect(olx.platformKey).toBe('olx');
  });

  test('platformName is OLX', () => {
    expect(olx.platformName).toBe('OLX');
  });
});
