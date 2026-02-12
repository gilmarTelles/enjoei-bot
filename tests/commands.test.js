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
  const callbackHandlers = [];
  return {
    on: (event, handler) => {
      if (event === 'message') messageHandlers.push(handler);
      if (event === 'callback_query') callbackHandlers.push(handler);
    },
    onText: () => {},
    sendMessage: jest.fn(async () => {}),
    answerCallbackQuery: jest.fn(async () => {}),
    editMessageText: jest.fn(async () => {}),
    editMessageReplyMarkup: jest.fn(async () => {}),
    async simulate(chatId, text) {
      const msg = { chat: { id: parseInt(chatId) }, text };
      for (const handler of messageHandlers) {
        await handler(msg);
      }
    },
    async simulateCallback(chatId, data, messageId = 1) {
      const query = {
        id: 'query-123',
        message: { chat: { id: parseInt(chatId) }, message_id: messageId },
        data,
      };
      for (const handler of callbackHandlers) {
        await handler(query);
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
  instance.exec('DELETE FROM user_settings');
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
    expect(msg).toContain('/filtros');
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
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('Uso:');
  });

  test('/adicionar com palavra confirma e menciona plataforma Enjoei', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar ceni');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('adicionada');
    expect(msg).toContain('ceni');
    expect(msg).toContain('Enjoei');
    expect(msg).toContain('/filtros');
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

  test('/listar com palavras mostra lista com plataforma', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/adicionar nike');
    await bot.simulate(ALLOWED, '/adicionar adidas');
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/listar');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('nike');
    expect(msg).toContain('Enjoei');
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

  test('/listar mostra filtros ativos', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    db.updateFilters(keywords[0].id, '{"used":true,"dep":"masculino"}');

    const bot = createMockBot();
    commands.register(bot);
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/listar');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('nike');
    expect(msg).toContain('usado');
    expect(msg).toContain('masculino');
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

  test('/buscar com summary mostra resumo', async () => {
    const bot = createMockBot();
    commands.register(bot);
    commands.setCheckCallback(async () => ({
      totalNew: 3,
      byPlatform: { enjoei: 3 },
    }));
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/buscar');
    // First call: "Buscando agora..."
    // Second call: summary
    const summaryMsg = telegram.sendMessage.mock.calls[1][1];
    expect(summaryMsg).toContain('Busca concluida');
    expect(summaryMsg).toContain('3 novo(s)');
    expect(summaryMsg).toContain('Enjoei: 3');
  });

  test('/buscar sem resultados mostra 0', async () => {
    const bot = createMockBot();
    commands.register(bot);
    commands.setCheckCallback(async () => ({
      totalNew: 0,
      byPlatform: {},
    }));
    telegram.sendMessage.mockClear();
    await bot.simulate(ALLOWED, '/buscar');
    const summaryMsg = telegram.sendMessage.mock.calls[1][1];
    expect(summaryMsg).toContain('0 novo(s)');
  });
});

describe('/parar and /retomar commands', () => {
  const ALLOWED = '6397962194';

  test('/parar envia confirmacao e pausa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/parar');
    expect(telegram.sendMessage).toHaveBeenCalledWith(ALLOWED, 'Notificacoes pausadas. Use /retomar para reativar.');
    expect(db.isPaused(ALLOWED)).toBe(true);
  });

  test('/retomar envia confirmacao e reativa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    db.setPaused(ALLOWED, true);
    await bot.simulate(ALLOWED, '/retomar');
    expect(telegram.sendMessage).toHaveBeenCalledWith(ALLOWED, 'Notificacoes reativadas.');
    expect(db.isPaused(ALLOWED)).toBe(false);
  });

  test('/status mostra notificacoes ativas por padrao', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/status');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('Notificacoes: ativas');
  });

  test('/status mostra notificacoes pausadas quando pausado', async () => {
    const bot = createMockBot();
    commands.register(bot);
    db.setPaused(ALLOWED, true);
    await bot.simulate(ALLOWED, '/status');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('Notificacoes: pausadas');
  });

  test('/ajuda inclui /parar e /retomar', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/ajuda');
    const msg = telegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('/parar');
    expect(msg).toContain('/retomar');
  });
});

describe('/filtros command', () => {
  const ALLOWED = '6397962194';

  test('/filtros sem keywords mostra mensagem', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/filtros');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('Nenhuma palavra-chave');
  });

  test('/filtros com uma keyword vai direto pro teclado', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/filtros');
    expect(bot.sendMessage).toHaveBeenCalled();
    const call = bot.sendMessage.mock.calls[0];
    expect(call[0]).toBe(ALLOWED);
    expect(call[1]).toContain('Filtros para');
    expect(call[1]).toContain('nike');
    expect(call[1]).toContain('Enjoei');
    expect(call[2]).toHaveProperty('reply_markup');
    expect(call[2].reply_markup).toHaveProperty('inline_keyboard');
  });

  test('/filtros com varias keywords mostra seletor', async () => {
    db.addKeyword(ALLOWED, 'nike');
    db.addKeyword(ALLOWED, 'adidas');
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/filtros');
    expect(bot.sendMessage).toHaveBeenCalled();
    const call = bot.sendMessage.mock.calls[0];
    expect(call[1]).toContain('Escolha');
    const buttons = call[2].reply_markup.inline_keyboard;
    expect(buttons).toHaveLength(2);
    const buttonTexts = buttons.map(row => row[0].text);
    expect(buttonTexts.some(t => t.includes('Enjoei'))).toBe(true);
  });

  test('/filtros nike vai direto pro teclado da keyword', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/filtros nike');
    expect(bot.sendMessage).toHaveBeenCalled();
    const call = bot.sendMessage.mock.calls[0];
    expect(call[1]).toContain('Filtros para');
    expect(call[1]).toContain('nike');
  });

  test('/filtros com keyword inexistente avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulate(ALLOWED, '/filtros naoexiste');
    expect(telegram.sendMessage.mock.calls[0][1]).toContain('nao encontrada');
  });
});

describe('callback_query handler', () => {
  const ALLOWED = '6397962194';
  const BLOCKED = '9999999999';

  test('usuario nao autorizado no callback recebe acesso negado', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(BLOCKED, 'f:1:used:t');
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('query-123', { text: 'Acesso negado.' });
  });

  test('fs: seleciona keyword e mostra filtros com plataforma', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `fs:${kwId}`);
    expect(bot.editMessageText).toHaveBeenCalled();
    const call = bot.editMessageText.mock.calls[0];
    expect(call[0]).toContain('Filtros para');
    expect(call[0]).toContain('nike');
    expect(call[0]).toContain('Enjoei');
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('query-123');
  });

  test('f:used:t toggle ativa filtro usado (enjoei)', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:used:t`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.used).toBe(true);
    expect(bot.editMessageReplyMarkup).toHaveBeenCalled();
  });

  test('f:used:t toggle desativa filtro usado', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;
    db.updateFilters(kwId, '{"used":true}');

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:used:t`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    expect(updated.filters).toBeNull();
  });

  test('f:dep:m toggle ativa departamento masculino', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:dep:m`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.dep).toBe('masculino');
  });

  test('f:dep:f toggle ativa departamento feminino', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:dep:f`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.dep).toBe('feminino');
  });

  test('f:dep toggle desativa quando ja ativo', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;
    db.updateFilters(kwId, '{"dep":"masculino"}');

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:dep:m`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    expect(updated.filters).toBeNull();
  });

  test('f:sz:m toggle ativa tamanho M', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:sz:m`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.sz).toBe('m');
  });

  test('f:sr:country toggle ativa todo o Brasil', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:sr:country`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.sr).toBe('same_country');
  });

  test('f:sort:a toggle ativa menor preco', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:sort:a`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.sort).toBe('price_asc');
  });

  test('f:sort:d toggle ativa maior preco', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:sort:d`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    const filters = JSON.parse(updated.filters);
    expect(filters.sort).toBe('price_desc');
  });

  test('f:clr:0 limpa todos os filtros', async () => {
    db.addKeyword(ALLOWED, 'nike');
    const keywords = db.listKeywordsWithId(ALLOWED);
    const kwId = keywords[0].id;
    db.updateFilters(kwId, '{"used":true,"dep":"masculino","sz":"m","sr":"same_country","sort":"price_asc"}');

    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, `f:${kwId}:clr:0`);

    const updated = db.getKeywordByIdAndChat(kwId, ALLOWED);
    expect(updated.filters).toBeNull();
  });

  test('callback com keyword inexistente avisa', async () => {
    const bot = createMockBot();
    commands.register(bot);
    await bot.simulateCallback(ALLOWED, 'f:99999:used:t');
    expect(bot.answerCallbackQuery).toHaveBeenCalledWith('query-123', { text: 'Palavra-chave nao encontrada.' });
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

describe('sanitizeKeyword', () => {
  const { sanitizeKeyword } = commands;

  test('remove smart double quotes', () => {
    expect(sanitizeKeyword('\u201Crogerio-ceni\u201D')).toBe('rogerio-ceni');
  });

  test('remove smart single quotes', () => {
    expect(sanitizeKeyword('\u2018nike\u2019')).toBe('nike');
  });

  test('remove angle brackets', () => {
    expect(sanitizeKeyword('<bermuda nuska>')).toBe('bermuda nuska');
  });

  test('remove square brackets', () => {
    expect(sanitizeKeyword('[nike air]')).toBe('nike air');
  });

  test('remove curly braces', () => {
    expect(sanitizeKeyword('{camisa}')).toBe('camisa');
  });

  test('remove backslash and pipe', () => {
    expect(sanitizeKeyword('nike|adidas\\puma')).toBe('nikeadidaspuma');
  });

  test('collapse multiple spaces', () => {
    expect(sanitizeKeyword('nike   air   max')).toBe('nike air max');
  });

  test('trim whitespace', () => {
    expect(sanitizeKeyword('  nike air max  ')).toBe('nike air max');
  });

  test('normal keyword passes through unchanged', () => {
    expect(sanitizeKeyword('camisa sao paulo')).toBe('camisa sao paulo');
  });

  test('keyword with accents passes through', () => {
    expect(sanitizeKeyword('rogério ceni')).toBe('rogério ceni');
  });
});

describe('parseFilters', () => {
  const { parseFilters } = commands;

  test('parse null retorna objeto vazio', () => {
    expect(parseFilters(null)).toEqual({});
  });

  test('parse string vazia retorna objeto vazio', () => {
    expect(parseFilters('')).toEqual({});
  });

  test('parse undefined retorna objeto vazio', () => {
    expect(parseFilters(undefined)).toEqual({});
  });

  test('parse JSON invalido retorna objeto vazio', () => {
    expect(parseFilters('not-json')).toEqual({});
  });

  test('parse JSON valido retorna objeto', () => {
    expect(parseFilters('{"used":true,"dep":"masculino"}')).toEqual({ used: true, dep: 'masculino' });
  });
});

describe('formatFiltersSummary', () => {
  const { formatFiltersSummary } = commands;

  test('retorna vazio para filtros null', () => {
    expect(formatFiltersSummary(null)).toBe('');
  });

  test('retorna vazio para filtros vazios', () => {
    expect(formatFiltersSummary({})).toBe('');
  });

  test('formata filtro usado (enjoei)', () => {
    expect(formatFiltersSummary({ used: true }, 'enjoei')).toBe(' [usado]');
  });

  test('formata filtro departamento (enjoei)', () => {
    expect(formatFiltersSummary({ dep: 'masculino' }, 'enjoei')).toBe(' [masculino]');
  });

  test('formata filtro tamanho (enjoei)', () => {
    expect(formatFiltersSummary({ sz: 'm' }, 'enjoei')).toBe(' [tam: M]');
  });

  test('formata filtro todo o Brasil (enjoei)', () => {
    expect(formatFiltersSummary({ sr: 'same_country' }, 'enjoei')).toBe(' [todo o Brasil]');
  });

  test('formata filtro menor preco (enjoei)', () => {
    expect(formatFiltersSummary({ sort: 'price_asc' }, 'enjoei')).toBe(' [menor preco]');
  });

  test('formata filtro maior preco (enjoei)', () => {
    expect(formatFiltersSummary({ sort: 'price_desc' }, 'enjoei')).toBe(' [maior preco]');
  });

  test('formata multiplos filtros (enjoei)', () => {
    const result = formatFiltersSummary({ used: true, dep: 'masculino', sz: 'g', sr: 'same_country', sort: 'price_asc' }, 'enjoei');
    expect(result).toContain('usado');
    expect(result).toContain('masculino');
    expect(result).toContain('tam: G');
    expect(result).toContain('todo o Brasil');
    expect(result).toContain('menor preco');
  });

});

describe('buildFilterKeyboard', () => {
  const { buildFilterKeyboard } = commands;

  test('constroi teclado enjoei com filtros inativos', () => {
    const keyboard = buildFilterKeyboard({ id: 1, keyword: 'nike', filters: null, platform: 'enjoei' });
    expect(keyboard).toHaveProperty('inline_keyboard');
    const rows = keyboard.inline_keyboard;
    // lp row, used, dep, sz, sr, sort, clear = 7 rows
    expect(rows).toHaveLength(7);
    // Clear row
    expect(rows[6][0].text).toContain('Limpar');
  });

  test('constroi teclado enjoei com filtros ativos', () => {
    const keyboard = buildFilterKeyboard({
      id: 1,
      keyword: 'nike',
      filters: '{"used":true,"dep":"masculino","sz":"m","sr":"same_country","sort":"price_asc"}',
      platform: 'enjoei',
    });
    const rows = keyboard.inline_keyboard;
    expect(rows[1][0].text).toContain('\u2705'); // used active
    expect(rows[2][0].text).toContain('\u2705'); // masculino
    expect(rows[2][1].text).toContain('\u2B1C'); // feminino off
    expect(rows[3][2].text).toContain('\u2705'); // M active
    expect(rows[3][0].text).toContain('\u2B1C'); // PP inactive
    expect(rows[4][0].text).toContain('\u2B1C'); // Perto de mim inactive
    expect(rows[4][1].text).toContain('\u2705'); // Todo o Brasil active
    expect(rows[5][0].text).toContain('\u2705'); // price_asc
    expect(rows[5][1].text).toContain('\u2B1C'); // price_desc off
  });
});
