jest.mock('../src/telegram', () => ({
  sendMessage: jest.fn(async () => {}),
  sendPhoto: jest.fn(async () => {}),
}));

const { formatProduct, formatPriceDrop } = require('../src/notifier');

describe('formatProduct', () => {
  test('formatar produto com todos os campos (default enjoei)', () => {
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

  test('formatar produto com platform ml', () => {
    const product = {
      title: 'Camiseta Nike',
      price: 'R$ 50',
      url: 'https://www.mercadolivre.com.br/camiseta-nike',
    };
    const result = formatProduct(product, 'nike', 'ml');

    expect(result).toContain('Novo item no Mercado Livre');
    expect(result).toContain('R$ 50');
    expect(result).toContain('"nike"');
  });

  test('formatar produto com platform olx', () => {
    const product = {
      title: 'Camiseta Nike',
      price: 'R$ 50',
      url: 'https://www.olx.com.br/d/camiseta-nike',
    };
    const result = formatProduct(product, 'nike', 'olx');

    expect(result).toContain('Novo item no OLX');
  });
});

describe('formatPriceDrop', () => {
  test('formatar queda de preco (default enjoei)', () => {
    const product = {
      title: 'Camiseta Nike',
      url: 'https://www.enjoei.com.br/p/camiseta-nike-123',
    };
    const result = formatPriceDrop(product, 'nike', 'R$ 150,00', 'R$ 100,00');

    expect(result).toContain('Queda de preco no Enjoei');
    expect(result).toContain('R$ 150,00');
    expect(result).toContain('R$ 100,00');
    expect(result).toContain('"nike"');
    expect(result).toContain('https://www.enjoei.com.br/p/camiseta-nike-123');
  });

  test('formatar queda de preco com platform ml', () => {
    const product = {
      title: 'Camiseta Nike',
      url: 'https://www.mercadolivre.com.br/camiseta-nike',
    };
    const result = formatPriceDrop(product, 'nike', 'R$ 150,00', 'R$ 100,00', 'ml');

    expect(result).toContain('Queda de preco no Mercado Livre');
  });

  test('formatar queda de preco com platform olx', () => {
    const product = {
      title: 'Camiseta Nike',
      url: 'https://www.olx.com.br/d/camiseta-nike',
    };
    const result = formatPriceDrop(product, 'nike', 'R$ 150,00', 'R$ 100,00', 'olx');

    expect(result).toContain('Queda de preco no OLX');
  });
});
