// TODO: Re-enable when Mercado Livre platform is reactivated
test.skip('Mercado Livre tests disabled — platform inactive', () => {});
/*
const ml = require('../../src/platforms/mercadolivre');

describe('mercadolivre.buildSearchUrl', () => {
  test('URL basica sem filtros - relevancia padrao', () => {
    const url = ml.buildSearchUrl('nike', null);
    expect(url).toContain('lista.mercadolivre.com.br/nike');
    expect(url).toContain('_NoIndex_True');
    expect(url).not.toContain('_PublishedToday');
  });

  test('URL com keyword multi-word usa hifens', () => {
    const url = ml.buildSearchUrl('nike air max', null);
    expect(url).toContain('nike-air-max');
  });

  test('URL com filtro cond usado', () => {
    const url = ml.buildSearchUrl('nike', { cond: 'usado' });
    expect(url).toContain('_ITEM*CONDITION_2230581');
  });

  test('URL com filtro cond novo', () => {
    const url = ml.buildSearchUrl('nike', { cond: 'novo' });
    expect(url).toContain('_ITEM*CONDITION_2230284');
  });

  test('URL com filtro tamanho G', () => {
    const url = ml.buildSearchUrl('camisa', { sz: 'g' });
    expect(url).toContain('_FILTRABLE*SIZE_13853814');
  });

  test('URL inclui NoIndex_True', () => {
    const url = ml.buildSearchUrl('nike', null);
    expect(url).toContain('_NoIndex_True');
  });

  test('URL com sort price_asc', () => {
    const url = ml.buildSearchUrl('nike', { sort: 'price_asc' });
    expect(url).toContain('_OrderId_PRICE');
  });

  test('URL com sort price_desc', () => {
    const url = ml.buildSearchUrl('nike', { sort: 'price_desc' });
    expect(url).toContain('_OrderId_PRICE*DESC');
  });

  test('URL com frete gratis', () => {
    const url = ml.buildSearchUrl('nike', { ship: true });
    expect(url).toContain('Frete');
  });
});

describe('mercadolivre.buildFilterKeyboard', () => {
  test('constroi teclado com filtros inativos', () => {
    const keyboard = ml.buildFilterKeyboard({ id: 1, keyword: 'nike', filters: null });
    expect(keyboard).toHaveProperty('inline_keyboard');
    const rows = keyboard.inline_keyboard;
    // cond, size, sort, ship, clear = 5 rows
    expect(rows).toHaveLength(5);
    // Condition row
    expect(rows[0]).toHaveLength(2);
    expect(rows[0][0].text).toContain('Novo');
    expect(rows[0][1].text).toContain('Usado');
    // Size row
    expect(rows[1].length).toBeGreaterThanOrEqual(5);
  });

  test('constroi teclado com cond novo ativo', () => {
    const keyboard = ml.buildFilterKeyboard({
      id: 1,
      keyword: 'nike',
      filters: '{"cond":"novo"}',
    });
    const rows = keyboard.inline_keyboard;
    expect(rows[0][0].text).toContain('\u2705'); // Novo active
    expect(rows[0][1].text).toContain('\u2B1C'); // Usado inactive
  });
});

describe('mercadolivre.applyFilterToggle', () => {
  test('toggle cond novo on', () => {
    const result = ml.applyFilterToggle({}, 'cond', 'novo');
    expect(result.cond).toBe('novo');
  });

  test('toggle cond novo off', () => {
    const result = ml.applyFilterToggle({ cond: 'novo' }, 'cond', 'novo');
    expect(result.cond).toBeUndefined();
  });

  test('toggle ship on', () => {
    const result = ml.applyFilterToggle({}, 'ship', 't');
    expect(result.ship).toBe(true);
  });

  test('toggle sort price_asc', () => {
    const result = ml.applyFilterToggle({}, 'sort', 'a');
    expect(result.sort).toBe('price_asc');
  });

  test('toggle size g on', () => {
    const result = ml.applyFilterToggle({}, 'sz', 'g');
    expect(result.sz).toBe('g');
  });

  test('toggle size g off', () => {
    const result = ml.applyFilterToggle({ sz: 'g' }, 'sz', 'g');
    expect(result.sz).toBeUndefined();
  });

  test('toggle size switches from m to g', () => {
    const result = ml.applyFilterToggle({ sz: 'm' }, 'sz', 'g');
    expect(result.sz).toBe('g');
  });
});

describe('mercadolivre.formatFiltersSummary', () => {
  test('retorna vazio para filtros null', () => {
    expect(ml.formatFiltersSummary(null)).toBe('');
  });

  test('formata cond novo', () => {
    expect(ml.formatFiltersSummary({ cond: 'novo' })).toBe(' [novo]');
  });

  test('formata frete gratis', () => {
    expect(ml.formatFiltersSummary({ ship: true })).toBe(' [frete gratis]');
  });

  test('formata tamanho G', () => {
    expect(ml.formatFiltersSummary({ sz: 'g' })).toBe(' [tam. G]');
  });

  test('formata cond usado + tamanho G', () => {
    expect(ml.formatFiltersSummary({ cond: 'usado', sz: 'g' })).toBe(' [usado, tam. G]');
  });
});

describe('mercadolivre module exports', () => {
  test('platformKey is ml', () => {
    expect(ml.platformKey).toBe('ml');
  });

  test('platformName is Mercado Livre', () => {
    expect(ml.platformName).toBe('Mercado Livre');
  });
});
*/
