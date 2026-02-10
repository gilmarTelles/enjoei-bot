// Set ALLOWED_USERS before requiring commands
process.env.ALLOWED_USERS = '6397962194,7653440251';

const db = require('../src/db');

jest.mock('../src/telegram', () => ({
  sendMessage: jest.fn(async () => {}),
  sendPhoto: jest.fn(async () => {}),
}));

const telegram = require('../src/telegram');

function createMockBot() {
  const messageHandlers = [];
  return {
    on: (event, handler) => {
      if (event === 'message') messageHandlers.push(handler);
    },
    onText: () => {},
    async simulate(chatId, text) {
      const msg = { chat: { id: parseInt(chatId) }, text };
      for (const handler of messageHandlers) {
        await handler(msg);
      }
    },
  };
}

beforeAll(() => {
  db.init();
});

afterAll(() => {
  const instance = db.getDb();
  if (instance) instance.close();
});

beforeEach(() => {
  const instance = db.getDb();
  instance.exec('DELETE FROM keywords');
  instance.exec('DELETE FROM seen_products');
  telegram.sendMessage.mockClear();
});

const commands = require('../src/commands');

describe('Commands', () => {
  const ALLOWED = '6397962194';
  const BLOCKED = '9999999999';

  test('usuario nao autorizado recebe acesso negado', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(BLOCKED, '/ajuda');
    expect(telegram.sendMessage).toHaveBeenCalledWith(BLOCKED, 'Acesso negado.');
  });

  test('/ajuda mostra comandos', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/ajuda');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('/adicionar');
    expect(msg).toContain('/remover');
    expect(msg).toContain('/listar');
    expect(msg).toContain('/buscar');
    expect(msg).toContain('/status');
  });

  test('/start mostra comandos', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/start');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Comandos');
  });

  test('/adicionar sem argumento mostra uso', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Uso:');
  });

  test('/adicionar com palavra confirma', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar ceni');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('adicionada');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('ceni');
  });

  test('/adicionar duplicada avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar ceni');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/adicionar ceni');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('ja existe');
  });

  test('/adicionar com filtro de preco', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar nike < 200');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('adicionada');
    expect(msg).toContain('nike');
    expect(msg).toContain('max R$');
    expect(msg).toContain('200');
  });

  test('/adicionar com filtro de preco salva no banco', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar nike air max < 150');
    const keywords = db.listKeywords(ALLOWED);
    expect(keywords[0].keyword).toBe('nike air max');
    expect(keywords[0].max_price).toBe(150);
  });

  test('/remover sem argumento mostra uso', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/remover');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Uso:');
  });

  test('/remover palavra existente confirma', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar ceni');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/remover ceni');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('removida');
  });

  test('/remover palavra inexistente avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/remover naoexiste');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('nao encontrada');
  });

  test('/listar sem palavras mostra mensagem', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/listar');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Nenhuma');
  });

  test('/listar com palavras mostra lista', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar nike');
    await bot.simulate(ALLOWED, '/adicionar adidas');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/listar');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('nike');
    expect(msg).toContain('adidas');
  });

  test('/listar mostra filtro de preco', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar nike < 200');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/listar');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('nike');
    expect(msg).toContain('max R$');
  });

  test('/status sem verificacao anterior', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/status');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Nenhuma verificacao');
  });

  test('/status com dados', async () => {
    commands.setStatusData({
      lastCheckTime: '10/02/2026 14:30',
      keywordsChecked: 3,
      newProductsFound: 2,
      priceDrops: 1,
    });
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/status');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('14:30');
    expect(msg).toContain('3');
    expect(msg).toContain('2');
    expect(msg).toContain('1');
  });

  test('comando desconhecido avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/comandoinvalido');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Comando desconhecido');
  });

  test('mensagem sem / e ignorada', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, 'ola mundo');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  test('/adicionar palavra muito curta', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar a');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('muito curta');
  });

  test('/adicionar palavra muito longa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    const longWord = 'a'.repeat(51);
    await bot.simulate(ALLOWED, `/adicionar ${longWord}`);
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('muito longa');
  });

  test('/adicionar limite de palavras-chave', async () => {
    const bot = createMockBot();
    commands.register(bot);
    for (let i = 1; i <= 10; i++) {
      await bot.simulate(ALLOWED, `/adicionar palavra${i}`);
    }
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/adicionar palavra11');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Limite');
  });
});

describe('parsePrice', () => {
  const { parsePrice } = commands;

  test('parse R$ 150,00', () => {
    expect(parsePrice('R$ 150,00')).toBe(150);
  });

  test('parse R$ 1.500,00', () => {
    expect(parsePrice('R$ 1.500,00')).toBe(1500);
  });

  test('parse R$50', () => {
    expect(parsePrice('R$50')).toBe(50);
  });

  test('parse string vazia retorna null', () => {
    expect(parsePrice('')).toBeNull();
  });

  test('parse null retorna null', () => {
    expect(parsePrice(null)).toBeNull();
  });

  test('parse texto invalido retorna null', () => {
    expect(parsePrice('sem preco')).toBeNull();
  });
});
