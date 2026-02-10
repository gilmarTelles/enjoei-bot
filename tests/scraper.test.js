const { buildSearchUrl } = require('../src/scraper');

describe('buildSearchUrl', () => {
  test('URL basica sem filtros', () => {
    const url = buildSearchUrl('nike', null);
    expect(url).toBe('https://www.enjoei.com.br/s?q=nike');
  });

  test('URL basica com filtros undefined', () => {
    const url = buildSearchUrl('nike', undefined);
    expect(url).toBe('https://www.enjoei.com.br/s?q=nike');
  });

  test('URL basica com filtros vazio', () => {
    const url = buildSearchUrl('nike', {});
    expect(url).toBe('https://www.enjoei.com.br/s?q=nike');
  });

  test('URL com filtro usado', () => {
    const url = buildSearchUrl('nike', { used: true });
    expect(url).toContain('q=nike');
    expect(url).toContain('u=true');
  });

  test('URL com filtro departamento masculino', () => {
    const url = buildSearchUrl('nike', { dep: 'masculino' });
    expect(url).toContain('q=nike');
    expect(url).toContain('dep=masculino');
  });

  test('URL com filtro departamento feminino', () => {
    const url = buildSearchUrl('nike', { dep: 'feminino' });
    expect(url).toContain('dep=feminino');
  });

  test('URL com filtro mesmo pais', () => {
    const url = buildSearchUrl('nike', { sr: true });
    expect(url).toContain('sr=same_country');
  });

  test('URL com filtro tamanho', () => {
    const url = buildSearchUrl('nike', { sz: 'm' });
    expect(url).toContain('size=m');
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
      sr: true,
      sz: 'g',
      sort: 'price_asc',
    });
    expect(url).toContain('q=ceni');
    expect(url).toContain('u=true');
    expect(url).toContain('dep=masculino');
    expect(url).toContain('sr=same_country');
    expect(url).toContain('size=g');
    expect(url).toContain('sort=price_asc');
  });

  test('URL com keyword que precisa de encoding', () => {
    const url = buildSearchUrl('nike air max', null);
    expect(url).toContain('q=nike+air+max');
  });

  test('URL nao inclui parametros para filtros false/undefined', () => {
    const url = buildSearchUrl('nike', { used: false, dep: undefined, sr: false });
    expect(url).toBe('https://www.enjoei.com.br/s?q=nike');
  });
});
