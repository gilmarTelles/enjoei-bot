const { formatProduct, formatPriceDrop } = require('../src/notifier');

describe('formatProduct', () => {
  test('formatar produto com todos os campos', () => {
    const product = {
      title: 'Camiseta Nike',
      price: 'R$ 50',
      url: 'https://www.enjoei.com.br/p/camiseta-nike-123',
    };
    const result = formatProduct(product, 'nike');

    expect(result).toContain('Novo item no Enjoei');
    expect(result).toContain('R$ 50');
    expect(result).toContain('https://www.enjoei.com.br/p/camiseta-nike-123');
    expect(result).toContain('"nike"');
  });

  test('formatar produto sem preco', () => {
    const product = {
      title: 'Camiseta',
      price: '',
      url: 'https://www.enjoei.com.br/p/camiseta-123',
    };
    const result = formatProduct(product, 'camiseta');

    expect(result).toContain('N/A');
  });
});

describe('formatPriceDrop', () => {
  test('formatar queda de preco', () => {
    const product = {
      title: 'Camiseta Nike',
      url: 'https://www.enjoei.com.br/p/camiseta-nike-123',
    };
    const result = formatPriceDrop(product, 'nike', 'R$ 150,00', 'R$ 100,00');

    expect(result).toContain('Queda de preco');
    expect(result).toContain('R$ 150,00');
    expect(result).toContain('R$ 100,00');
    expect(result).toContain('"nike"');
    expect(result).toContain('https://www.enjoei.com.br/p/camiseta-nike-123');
  });
});
