const enjoei = require('../../src/platforms/enjoei');

describe('enjoei.buildSearchUrl', () => {
  test('URL basica sem filtros - inclui lp=24h por padrao', () => {
    const url = enjoei.buildSearchUrl('nike', null);
    expect(url).toBe('https://www.enjoei.com.br/s?q=nike&lp=24h');
  });

  test('URL com filtros vazio - inclui lp=24h por padrao', () => {
    const url = enjoei.buildSearchUrl('nike', {});
    expect(url).toContain('lp=24h');
  });

  test('URL com lp=48h', () => {
    const url = enjoei.buildSearchUrl('nike', { lp: '48h' });
    expect(url).toContain('lp=48h');
    expect(url).not.toContain('lp=24h');
  });

  test('URL com lp=all nao inclui lp param', () => {
    const url = enjoei.buildSearchUrl('nike', { lp: 'all' });
    expect(url).not.toContain('lp=');
  });

  test('URL com filtro usado', () => {
    const url = enjoei.buildSearchUrl('nike', { used: true });
    expect(url).toContain('u=true');
  });

  test('URL com filtro departamento', () => {
    const url = enjoei.buildSearchUrl('nike', { dep: 'masculino' });
    expect(url).toContain('dep=masculino');
  });

  test('URL com filtro tamanho', () => {
    const url = enjoei.buildSearchUrl('nike', { sz: 'm' });
    expect(url).toContain('size=m');
  });

  test('URL com filtro sort', () => {
    const url = enjoei.buildSearchUrl('nike', { sort: 'price_asc' });
    expect(url).toContain('sort=price_asc');
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
      filters: '{"used":true,"dep":"masculino","sz":"m","sr":true,"sort":"price_asc"}',
    });
    const rows = keyboard.inline_keyboard;
    expect(rows[1][0].text).toContain('\u2705'); // used active
    expect(rows[2][0].text).toContain('\u2705'); // masculino active
    expect(rows[3][2].text).toContain('\u2705'); // M active
    expect(rows[4][0].text).toContain('\u2705'); // same country active
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

  test('toggle lp to 48h', () => {
    const result = enjoei.applyFilterToggle({}, 'lp', '48h');
    expect(result.lp).toBe('48h');
  });

  test('toggle lp off (same value)', () => {
    const result = enjoei.applyFilterToggle({ lp: '48h' }, 'lp', '48h');
    expect(result.lp).toBeUndefined();
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
    expect(enjoei.formatFiltersSummary({ lp: '48h' })).toBe(' [periodo: 48h]');
  });

  test('nao mostra periodo 24h (padrao)', () => {
    expect(enjoei.formatFiltersSummary({ lp: '24h' })).toBe('');
  });

  test('formata multiplos filtros', () => {
    const result = enjoei.formatFiltersSummary({ used: true, dep: 'masculino', sz: 'g', sr: true, sort: 'price_asc' });
    expect(result).toContain('usado');
    expect(result).toContain('masculino');
    expect(result).toContain('tam: G');
    expect(result).toContain('mesmo pais');
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
});
