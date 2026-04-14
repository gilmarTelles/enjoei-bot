jest.mock('../src/telegram', () => ({
  sendMessage: jest.fn(async () => true),
  sendPhoto: jest.fn(async () => true),
  escapeMd: (text) => (text ? String(text).replace(/([_*`\[\]])/g, '\\$1') : ''),
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

    expect(result).toContain('R$ 50 | Camiseta Nike');
    expect(result).toContain('"nike"');
    expect(result).toContain('https://www.enjoei.com.br/p/camiseta-nike-123');
  });

  test('formatar produto sem preco', () => {
    const product = {
      title: 'Camiseta',
      price: '',
      url: 'https://www.enjoei.com.br/p/camiseta-123',
    };
    const result = formatProduct(product, 'camiseta');

    expect(result).toContain('N/A');
    expect(result).toContain('Camiseta');
  });

  test('formatar produto sem titulo', () => {
    const product = {
      title: '',
      price: 'R$ 30',
      url: 'https://www.enjoei.com.br/p/123',
    };
    const result = formatProduct(product, 'bone');

    expect(result).toContain('R$ 30');
    expect(result).not.toContain('|');
  });

  test('primeira linha contem preco e titulo', () => {
    const product = {
      title: 'Vestido Zara',
      price: 'R$ 89,90',
      url: 'https://www.enjoei.com.br/p/vestido-456',
    };
    const result = formatProduct(product, 'zara');
    const firstLine = result.split('\n')[0];

    expect(firstLine).toContain('R$ 89,90');
    expect(firstLine).toContain('Vestido Zara');
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
