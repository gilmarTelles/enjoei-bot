const fs = require('fs');
const db = require('../src/db');

// Mock telegram module before requiring commands
jest.mock('../src/telegram', () => {
  const messages = [];
  return {
    sendMessage: jest.fn(async (chatId, text) => {
      messages.push({ chatId, text });
    }),
    sendPhoto: jest.fn(async (chatId, url, caption) => {
      messages.push({ chatId, url, caption });
    }),
    getMessages: () => messages,
    clearMessages: () => { messages.length = 0; },
  };
});

const telegram = require('../src/telegram');

// Simulate a Telegram bot with onText and on handlers
function createMockBot() {
  const handlers = [];
  const messageHandlers = [];

  return {
    onText: (regex, handler) => {
      handlers.push({ regex, handler });
    },
    on: (event, handler) => {
      if (event === 'message') messageHandlers.push(handler);
    },
    async simulate(chatId, text) {
      const msg = { chat: { id: parseInt(chatId) }, text };

      // Fire message handlers first
      for (const handler of messageHandlers) {
        await handler(msg);
      }

      // Fire matching onText handlers
      for (const { regex, handler } of handlers) {
        const match = text.match(regex);
        if (match) {
          await handler(msg, match);
        }
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
  telegram.clearMessages();
});

const commands = require('../src/commands');

describe('Commands', () => {
  const ALLOWED_USER = '6397962194';
  const BLOCKED_USER = '9999999999';

  test('usuario nao autorizado recebe acesso negado', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(BLOCKED_USER, '/ajuda');

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      BLOCKED_USER,
      'Acesso negado.'
    );
  });

  test('/ajuda mostra comandos', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/ajuda');

    const calls = telegram.sendMessage.mock.calls;
    const helpMsg = calls.find(c => c[1].includes('Comandos'));
    expect(helpMsg).toBeTruthy();
    expect(helpMsg[1]).toContain('/adicionar');
    expect(helpMsg[1]).toContain('/remover');
    expect(helpMsg[1]).toContain('/listar');
    expect(helpMsg[1]).toContain('/buscar');
  });

  test('/start mostra comandos', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/start');

    const calls = telegram.sendMessage.mock.calls;
    const helpMsg = calls.find(c => c[1].includes('Comandos'));
    expect(helpMsg).toBeTruthy();
  });

  test('/adicionar sem argumento mostra uso', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/adicionar');

    const calls = telegram.sendMessage.mock.calls;
    const usageMsg = calls.find(c => c[1].includes('Uso:'));
    expect(usageMsg).toBeTruthy();
  });

  test('/adicionar com palavra-chave confirma', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/adicionar ceni');

    const calls = telegram.sendMessage.mock.calls;
    const confirmMsg = calls.find(c => c[1].includes('adicionada'));
    expect(confirmMsg).toBeTruthy();
    expect(confirmMsg[1]).toContain('ceni');
  });

  test('/adicionar duplicada avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/adicionar ceni');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED_USER, '/adicionar ceni');

    const calls = telegram.sendMessage.mock.calls;
    const dupeMsg = calls.find(c => c[1].includes('ja existe'));
    expect(dupeMsg).toBeTruthy();
  });

  test('/remover sem argumento mostra uso', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/remover');

    const calls = telegram.sendMessage.mock.calls;
    const usageMsg = calls.find(c => c[1].includes('Uso:'));
    expect(usageMsg).toBeTruthy();
  });

  test('/remover palavra existente confirma', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/adicionar ceni');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED_USER, '/remover ceni');

    const calls = telegram.sendMessage.mock.calls;
    const confirmMsg = calls.find(c => c[1].includes('removida'));
    expect(confirmMsg).toBeTruthy();
  });

  test('/remover palavra inexistente avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/remover naoexiste');

    const calls = telegram.sendMessage.mock.calls;
    const notFoundMsg = calls.find(c => c[1].includes('nao encontrada'));
    expect(notFoundMsg).toBeTruthy();
  });

  test('/listar sem palavras mostra mensagem', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/listar');

    const calls = telegram.sendMessage.mock.calls;
    const emptyMsg = calls.find(c => c[1].includes('Nenhuma'));
    expect(emptyMsg).toBeTruthy();
  });

  test('/listar com palavras mostra lista', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/adicionar nike');
    await bot.simulate(ALLOWED_USER, '/adicionar adidas');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED_USER, '/listar');

    const calls = telegram.sendMessage.mock.calls;
    const listMsg = calls.find(c => c[1].includes('nike') && c[1].includes('adidas'));
    expect(listMsg).toBeTruthy();
  });

  test('comando desconhecido avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);

    await bot.simulate(ALLOWED_USER, '/comandoinvalido');

    const calls = telegram.sendMessage.mock.calls;
    const unknownMsg = calls.find(c => c[1].includes('Comando desconhecido'));
    expect(unknownMsg).toBeTruthy();
  });
});
