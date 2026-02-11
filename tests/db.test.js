const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const TEST_DB = path.join(__dirname, '..', 'data', 'test.db');

beforeAll(() => {
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
  instance.exec('DELETE FROM user_settings');
});

describe('Keywords', () => {
  test('adicionar palavra-chave', () => {
    const result = db.addKeyword('user1', 'nike');
    expect(result).toBe(true);
  });

  test('nao duplicar palavra-chave para mesmo usuario e plataforma', () => {
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
    expect(keywords[0].keyword).toBe('nike air max');
  });

  test('listar palavras-chave por usuario', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user1', 'adidas');
    db.addKeyword('user2', 'puma');

    const u1 = db.listKeywords('user1').map(k => k.keyword).sort();
    expect(u1).toEqual(['adidas', 'nike']);
    expect(db.listKeywords('user2').map(k => k.keyword)).toEqual(['puma']);
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
    expect(db.listKeywords('user2').map(k => k.keyword)).toEqual(['nike']);
  });

  test('adicionar com max_price', () => {
    db.addKeyword('user1', 'nike', 200);
    const keywords = db.listKeywords('user1');
    expect(keywords[0].keyword).toBe('nike');
    expect(keywords[0].max_price).toBe(200);
  });

  test('adicionar sem max_price tem null', () => {
    db.addKeyword('user1', 'nike');
    const keywords = db.listKeywords('user1');
    expect(keywords[0].max_price).toBeNull();
  });

  test('adicionar com platform', () => {
    db.addKeyword('user1', 'nike', null, 'ml');
    const keywords = db.listKeywords('user1');
    expect(keywords[0].platform).toBe('ml');
  });

  test('default platform is enjoei', () => {
    db.addKeyword('user1', 'nike');
    const keywords = db.listKeywords('user1');
    expect(keywords[0].platform).toBe('enjoei');
  });

  test('same keyword on different platforms is allowed', () => {
    const r1 = db.addKeyword('user1', 'nike', null, 'enjoei');
    const r2 = db.addKeyword('user1', 'nike', null, 'ml');
    const r3 = db.addKeyword('user1', 'nike', null, 'olx');
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(db.listKeywords('user1')).toHaveLength(3);
  });

  test('same keyword + same platform is duplicate', () => {
    db.addKeyword('user1', 'nike', null, 'ml');
    const result = db.addKeyword('user1', 'nike', null, 'ml');
    expect(result).toBe(false);
  });

  test('removeKeyword with platform', () => {
    db.addKeyword('user1', 'nike', null, 'enjoei');
    db.addKeyword('user1', 'nike', null, 'ml');
    db.removeKeyword('user1', 'nike', 'enjoei');
    const keywords = db.listKeywords('user1');
    expect(keywords).toHaveLength(1);
    expect(keywords[0].platform).toBe('ml');
  });

  test('removeKeyword without platform removes all', () => {
    db.addKeyword('user1', 'nike', null, 'enjoei');
    db.addKeyword('user1', 'nike', null, 'ml');
    db.removeKeyword('user1', 'nike');
    expect(db.listKeywords('user1')).toHaveLength(0);
  });

  test('listKeywords retorna platform', () => {
    db.addKeyword('user1', 'nike', null, 'ml');
    const keywords = db.listKeywords('user1');
    expect(keywords[0]).toHaveProperty('platform');
    expect(keywords[0].platform).toBe('ml');
  });
});

describe('getAllUserKeywords', () => {
  test('retornar todos os pares usuario-keyword com platform', () => {
    db.addKeyword('user1', 'nike', 150, 'ml');
    db.addKeyword('user2', 'adidas');
    db.addKeyword('user2', 'nike', null, 'olx');

    const all = db.getAllUserKeywords();
    expect(all).toHaveLength(3);
    const nikeUser1 = all.find(k => k.chat_id === 'user1' && k.keyword === 'nike');
    expect(nikeUser1.max_price).toBe(150);
    expect(nikeUser1.platform).toBe('ml');
    expect(nikeUser1).toHaveProperty('id');
  });

  test('retornar vazio quando nao tem keywords', () => {
    expect(db.getAllUserKeywords()).toEqual([]);
  });
});

describe('listKeywordsWithId', () => {
  test('retornar keywords com id e platform', () => {
    db.addKeyword('user1', 'nike', null, 'ml');
    db.addKeyword('user1', 'adidas');

    const keywords = db.listKeywordsWithId('user1');
    expect(keywords).toHaveLength(2);
    expect(keywords[0]).toHaveProperty('id');
    expect(keywords[0]).toHaveProperty('keyword');
    expect(keywords[0]).toHaveProperty('filters');
    expect(keywords[0]).toHaveProperty('platform');
  });

  test('nao retornar keywords de outro usuario', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user2', 'adidas');

    const keywords = db.listKeywordsWithId('user1');
    expect(keywords).toHaveLength(1);
    expect(keywords[0].keyword).toBe('nike');
  });
});

describe('getKeywordByIdAndChat', () => {
  test('retornar keyword pelo id e chat', () => {
    db.addKeyword('user1', 'nike', null, 'ml');
    const keywords = db.listKeywordsWithId('user1');
    const id = keywords[0].id;

    const result = db.getKeywordByIdAndChat(id, 'user1');
    expect(result).not.toBeNull();
    expect(result.keyword).toBe('nike');
    expect(result.platform).toBe('ml');
    expect(result.id).toBe(id);
  });

  test('retornar null para id de outro usuario', () => {
    db.addKeyword('user1', 'nike');
    const keywords = db.listKeywordsWithId('user1');
    const id = keywords[0].id;

    expect(db.getKeywordByIdAndChat(id, 'user2')).toBeNull();
  });

  test('retornar null para id inexistente', () => {
    expect(db.getKeywordByIdAndChat(99999, 'user1')).toBeNull();
  });
});

describe('updateFilters', () => {
  test('atualizar filtros de keyword', () => {
    db.addKeyword('user1', 'nike');
    const keywords = db.listKeywordsWithId('user1');
    const id = keywords[0].id;

    db.updateFilters(id, '{"used":true,"dep":"masculino"}');
    const updated = db.getKeywordByIdAndChat(id, 'user1');
    expect(updated.filters).toBe('{"used":true,"dep":"masculino"}');
  });

  test('limpar filtros com null', () => {
    db.addKeyword('user1', 'nike');
    const keywords = db.listKeywordsWithId('user1');
    const id = keywords[0].id;

    db.updateFilters(id, '{"used":true}');
    db.updateFilters(id, null);
    const updated = db.getKeywordByIdAndChat(id, 'user1');
    expect(updated.filters).toBeNull();
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

  test('isProductSeen with platform parameter', () => {
    db.markProductSeen(product, 'camiseta', 'user1', 'ml');
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1', 'ml')).toBe(true);
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1', 'enjoei')).toBe(false);
  });

  test('markProductSeen with platform', () => {
    db.markProductSeen(product, 'camiseta', 'user1', 'olx');
    expect(db.isProductSeen('produto-123', 'camiseta', 'user1', 'olx')).toBe(true);
  });
});

describe('countKeywords', () => {
  test('contar palavras-chave por usuario', () => {
    db.addKeyword('user1', 'nike');
    db.addKeyword('user1', 'adidas');
    db.addKeyword('user2', 'puma');

    expect(db.countKeywords('user1')).toBe(2);
    expect(db.countKeywords('user2')).toBe(1);
    expect(db.countKeywords('user3')).toBe(0);
  });

  test('contar inclui todas as plataformas', () => {
    db.addKeyword('user1', 'nike', null, 'enjoei');
    db.addKeyword('user1', 'nike', null, 'ml');
    expect(db.countKeywords('user1')).toBe(2);
  });
});

describe('purgeOldProducts', () => {
  test('remover produtos mais antigos que N dias', () => {
    const instance = db.getDb();
    instance.prepare(
      "INSERT INTO seen_products (product_id, keyword, chat_id, title, price, url, first_seen_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-10 days'))"
    ).run('old-product', 'nike', 'user1', 'Old', 'R$ 10', 'url');
    db.markProductSeen({ id: 'new-product', title: 'New', price: 'R$ 20', url: 'url2' }, 'nike', 'user1');

    const purged = db.purgeOldProducts(7);
    expect(purged).toBe(1);
    expect(db.isProductSeen('old-product', 'nike', 'user1')).toBe(false);
    expect(db.isProductSeen('new-product', 'nike', 'user1')).toBe(true);
  });
});

describe('setPaused / isPaused', () => {
  test('isPaused retorna false por padrao (sem registro)', () => {
    expect(db.isPaused('user1')).toBe(false);
  });

  test('setPaused(true) faz isPaused retornar true', () => {
    db.setPaused('user1', true);
    expect(db.isPaused('user1')).toBe(true);
  });

  test('setPaused(false) faz isPaused retornar false', () => {
    db.setPaused('user1', true);
    db.setPaused('user1', false);
    expect(db.isPaused('user1')).toBe(false);
  });

  test('nao afeta outros usuarios', () => {
    db.setPaused('user1', true);
    expect(db.isPaused('user1')).toBe(true);
    expect(db.isPaused('user2')).toBe(false);
  });
});
