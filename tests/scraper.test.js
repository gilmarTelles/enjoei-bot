const { buildSearchUrl } = require('../src/scraper');

describe('buildSearchUrl (backward compat - delegates to enjoei)', () => {
  test('URL basica sem filtros - slug no path e lp=24h', () => {
    const url = buildSearchUrl('nike', null);
    expect(url).toContain('https://www.enjoei.com.br/nike/s?');
    expect(url).toContain('q=nike');
    // Default lp=24h
    expect(url).toContain('lp=24h');
  });

  test('URL basica com filtros undefined', () => {
    const url = buildSearchUrl('nike', undefined);
    expect(url).toContain('https://www.enjoei.com.br/nike/s?');
    expect(url).toContain('q=nike');
  });

  test('URL basica com filtros vazio', () => {
    const url = buildSearchUrl('nike', {});
    expect(url).toContain('https://www.enjoei.com.br/nike/s?');
    expect(url).toContain('q=nike');
  });

  test('URL com filtro usado', () => {
    const url = buildSearchUrl('nike', { used: true });
    expect(url).toContain('q=nike');
    expect(url).toContain('u=true');
  });

  test('URL com filtro departamento masculino usa param d', () => {
    const url = buildSearchUrl('nike', { dep: 'masculino' });
    expect(url).toContain('q=nike');
    expect(url).toContain('d=masculino');
  });

  test('URL com filtro departamento feminino usa param d', () => {
    const url = buildSearchUrl('nike', { dep: 'feminino' });
    expect(url).toContain('d=feminino');
  });

  test('URL com filtro regiao usa valor do filtro', () => {
    const url1 = buildSearchUrl('nike', { sr: 'same_country' });
    expect(url1).toContain('sr=same_country');
    const url2 = buildSearchUrl('nike', { sr: 'near_regions' });
    expect(url2).toContain('sr=near_regions');
  });

  test('URL com filtro tamanho usa param st[sc]', () => {
    const url = buildSearchUrl('nike', { sz: 'm' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('st[sc]')).toBe('m');
  });

  test('URL com filtro menor preco', () => {
    const url = buildSearchUrl('nike', { sort: 'price_asc' });
    expect(url).toContain('sort=price_asc');
  });

  test('URL com filtro maior preco', () => {
    const url = buildSearchUrl('nike', { sort: 'price_desc' });
    expect(url).toContain('sort=price_desc');
  });

  test('URL com todos os filtros', () => {
    const url = buildSearchUrl('ceni', {
      used: true,
      dep: 'masculino',
      sr: 'same_country',
      sz: 'g',
      sort: 'price_asc',
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/ceni/s');
    expect(parsed.searchParams.get('q')).toBe('ceni');
    expect(parsed.searchParams.get('u')).toBe('true');
    expect(parsed.searchParams.get('d')).toBe('masculino');
    expect(parsed.searchParams.get('sr')).toBe('same_country');
    expect(parsed.searchParams.get('st[sc]')).toBe('g');
    expect(parsed.searchParams.get('sort')).toBe('price_asc');
  });

  test('URL com keyword multi-palavra usa slug com hifens', () => {
    const url = buildSearchUrl('nike air max', null);
    expect(url).toContain('/nike-air-max/s?');
    expect(url).toContain('q=nike-air-max');
  });

  test('URL nao inclui parametros para filtros false/undefined', () => {
    const url = buildSearchUrl('nike', { used: false, dep: undefined, sr: false });
    expect(url).toContain('q=nike');
    expect(url).not.toContain('u=true');
    expect(url).not.toContain('d=');
    expect(url).not.toContain('sr=');
  });
});
