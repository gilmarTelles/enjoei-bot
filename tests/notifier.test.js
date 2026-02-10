const { formatProduct } = require('../src/notifier');

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
