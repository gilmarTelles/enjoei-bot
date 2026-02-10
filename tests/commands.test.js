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
