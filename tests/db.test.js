const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const TEST_DB = path.join(__dirname, '..', 'data', 'test.db');

beforeAll(() => {
  // Override DB path for tests
  process.env.NODE_ENV = 'test';
  db.init();
});

afterAll(() => {
  const instance = db.getDb();
  if (instance) instance.close();
  try { fs.unlinkSync(TEST_DB); } catch {};
});

beforeEach(() => {
  const instance = db.getDb();
  instance.exec('DELETE FROM keywords');
  instance.exec('DELETE FROM seen_products');
});

describe('Keywords', () => {
  test('adicionar palavra-chave', () => {
    const result = db.addKeyword('user1', 'nike');
    expect(result).toBe(true);
  });

  test('nao duplicar palavra-chave para mesmo usuario', () => {
    db.addKeyword('user1', 'nike');
    const result = db.addKeyword('user1', 'nike');
    expect(result).toBe(false);
  });

  test('mesmo keyword para usuarios diferentes', () => {
    const r1 = db.addKeyword('user1', 'nike');
    const r2 = db.addKeyword('user2', 'nike');
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  test('normalizar para minusculo', () => {
    db.addKeyword('user1', 'Nike Air Max');
    const keywords = db.listKeywords('user1');
    expect(keywords).toEqual(['nike air max']);
  });

  test('listar palavras-chave por usuario', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user1', 'adidas');
    db.addKeyword('user2', 'puma');

    expect(db.listKeywords('user1').sort()).toEqual(['adidas', 'nike']);
    expect(db.listKeywords('user2')).toEqual(['puma']);
  });

  test('remover palavra-chave', () => {
    db.addKeyword('user1', 'nike');
    const removed = db.removeKeyword('user1', 'nike');
    expect(removed).toBe(true);
    expect(db.listKeywords('user1')).toEqual([]);
  });

  test('remover palavra-chave inexistente', () => {
    const removed = db.removeKeyword('user1', 'nao-existe');
    expect(removed).toBe(false);
  });

  test('remover nao afeta outro usuario', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user2', 'nike');
    db.removeKeyword('user1', 'nike');

    expect(db.listKeywords('user1')).toEqual([]);
    expect(db.listKeywords('user2')).toEqual(['nike']);
  });
});

describe('getAllUserKeywords', () => {
  test('retornar todos os pares usuario-keyword', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user2', 'adidas');
    db.addKeyword('user2', 'nike');

    const all = db.getAllUserKeywords();
    expect(all).toHaveLength(3);
    expect(all).toEqual(expect.arrayContaining([
      { chat_id: 'user1', keyword: 'nike' },
      { chat_id: 'user2', keyword: 'adidas' },
      { chat_id: 'user2', keyword: 'nike' },
    ]));
  });

  test('retornar vazio quando nao tem keywords', () => {
    expect(db.getAllUserKeywords()).toEqual([]);
  });
});

describe('Seen Products', () => {
  const product = { id: 'produto-123', title: 'Camiseta', price: 'R$ 50', url: 'https://enjoei.com.br/p/produto-123' };

  test('produto novo nao foi visto', () => {
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1')).toBe(false);
  });

  test('marcar produto como visto', () => {
    db.markProductSeen(product, 'camiseta', 'user1');
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1')).toBe(true);
  });

  test('produto visto por usuario nao afeta outro', () => {
    db.markProductSeen(product, 'camiseta', 'user1');
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1')).toBe(true);
    expect(db.isProductSeen('produto-123', 'camiseta', 'user2')).toBe(false);
  });

  test('mesmo produto com keyword diferente nao e visto', () => {
    db.markProductSeen(product, 'camiseta', 'user1');
    expect(db.isProductSeen('produto-123', 'nike', 'user1')).toBe(false);
  });

  test('duplicar markProductSeen nao da erro', () => {
    db.markProductSeen(product, 'camiseta', 'user1');
    expect(() => db.markProductSeen(product, 'camiseta', 'user1')).not.toThrow();
  });
});
