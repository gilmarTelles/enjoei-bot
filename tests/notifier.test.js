jest.mock('../src/telegram', () => ({
  sendMessage: jest.fn(async () => true),
  sendPhoto: jest.fn(async () => true),
  escapeMd: (text) => text ? String(text).replace(/([_*`\[\]])/g, '\\$1') : '',
}));

const { formatProduct, notifyNewProducts } = require('../src/notifier');
const telegram = require('../src/telegram');

describe('formatProduct', () => {
  test('formatar produto com todos os campos (default enjoei)', () => {
    const product = {
      title: 'Camiseta Nike',
      price: 'R$ 50',
      url: 'https://www.enjoei.com.br/p/camiseta-nike-123',
    };
    const result = formatProduct(product, 'nike');

    expect(result).toContain('Novo item no Enjoei');
    expect(result).toContain('Camiseta Nike');
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

describe('notifyNewProducts', () => {
  beforeEach(() => {
    telegram.sendMessage.mockClear();
    telegram.sendPhoto.mockClear();
  });

  test('returns only successfully notified products', async () => {
    telegram.sendPhoto.mockResolvedValueOnce(true);
    telegram.sendMessage.mockResolvedValueOnce(false);
    telegram.sendPhoto.mockResolvedValueOnce(true);

    const products = [
      { id: '1', title: 'A', price: 'R$ 10', url: 'http://a', image: 'http://img' },
      { id: '2', title: 'B', price: 'R$ 20', url: 'http://b' },
      { id: '3', title: 'C', price: 'R$ 30', url: 'http://c', image: 'http://img3' },
    ];

    const notified = await notifyNewProducts(products, 'test', '123', 'enjoei');
    expect(notified).toHaveLength(2);
    expect(notified[0].id).toBe('1');
    expect(notified[1].id).toBe('3');
  });
});

