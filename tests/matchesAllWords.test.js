const { matchesAllWords, escapeRegex } = require('../src/index');

// Prevent index.js from actually booting the bot
jest.mock('../src/db', () => ({
  init: jest.fn(),
  getAllUserKeywords: jest.fn(() => []),
  isProductSeen: jest.fn(),
  markProductSeen: jest.fn(),
  isPaused: jest.fn(),
  purgeOldProducts: jest.fn(),
  backupDb: jest.fn(),
  getDb: jest.fn(),
}));
jest.mock('../src/telegram', () => ({
  init: jest.fn(() => ({ on: jest.fn(), onText: jest.fn() })),
  sendMessage: jest.fn(),
  getBot: jest.fn(),
}));
jest.mock('../src/commands', () => ({
  register: jest.fn(),
  setCheckCallback: jest.fn(),
  setStatusData: jest.fn(),
}));
jest.mock('../src/notifier', () => ({ notifyNewProducts: jest.fn() }));
jest.mock('../src/relevanceFilter', () => ({ filterByRelevance: jest.fn(p => p) }));
jest.mock('node-cron', () => ({ schedule: jest.fn() }));

describe('matchesAllWords', () => {
  test('matches when all words appear as whole words in title', () => {
    expect(matchesAllWords('Camisa Rogerio Ceni Autografada', 'rogerio ceni')).toBe(true);
  });

  test('rejects partial word matches', () => {
    expect(matchesAllWords('cenil branco rogerio', 'rogerio ceni')).toBe(false);
  });

  test('is case insensitive', () => {
    expect(matchesAllWords('ROGERIO CENI', 'rogerio ceni')).toBe(true);
    expect(matchesAllWords('rogerio ceni', 'ROGERIO CENI')).toBe(true);
  });

  test('works with single-word keywords', () => {
    expect(matchesAllWords('Camiseta Nike Azul', 'nike')).toBe(true);
    expect(matchesAllWords('Camiseta Adidas Azul', 'nike')).toBe(false);
  });

  test('handles extra spaces in keyword', () => {
    expect(matchesAllWords('Camisa Rogerio Ceni', '  rogerio   ceni  ')).toBe(true);
  });

  test('returns false for null/undefined title', () => {
    expect(matchesAllWords(null, 'rogerio')).toBe(false);
    expect(matchesAllWords(undefined, 'rogerio')).toBe(false);
    expect(matchesAllWords('', 'rogerio')).toBe(false);
  });

  test('handles special regex characters in keyword', () => {
    expect(matchesAllWords('Price is $10.00 today', '$10.00')).toBe(false); // word boundary won't match $ as word char
    expect(matchesAllWords('item (novo) original', 'novo')).toBe(true);
  });

  test('matches words at start and end of title', () => {
    expect(matchesAllWords('nike camisa azul', 'nike')).toBe(true);
    expect(matchesAllWords('camisa azul nike', 'nike')).toBe(true);
  });

  test('rejects when only some words match', () => {
    expect(matchesAllWords('Camisa Rogerio Azul', 'rogerio ceni')).toBe(false);
  });

  test('matches accented titles with unaccented keywords', () => {
    expect(matchesAllWords('Camisa São Paulo', 'sao paulo')).toBe(true);
    expect(matchesAllWords('Seleção Brasileira 2024', 'selecao brasileira')).toBe(true);
    expect(matchesAllWords('Camisa Rogério Ceni', 'rogerio ceni')).toBe(true);
  });

  test('matches unaccented titles with accented keywords', () => {
    expect(matchesAllWords('Camisa Sao Paulo', 'são paulo')).toBe(true);
  });
});

describe('escapeRegex', () => {
  test('escapes special regex characters', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('a*b')).toBe('a\\*b');
    expect(escapeRegex('(test)')).toBe('\\(test\\)');
  });
});
