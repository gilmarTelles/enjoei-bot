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
  instance.exec('DELETE FROM blocked_sellers');
});

describe('blockSeller', () => {
  test('bloquear vendedor novo retorna true', () => {
    expect(db.blockSeller('user1', 'vendedor1')).toBe(true);
  });

  test('bloquear vendedor duplicado retorna true (INSERT OR IGNORE)', () => {
    db.blockSeller('user1', 'vendedor1');
    expect(db.blockSeller('user1', 'vendedor1')).toBe(true);
  });

  test('normaliza para minusculo', () => {
    db.blockSeller('user1', 'VendedorMaiusculo');
    const sellers = db.listBlockedSellers('user1');
    expect(sellers).toEqual(['vendedormaiusculo']);
  });

  test('mesmo vendedor para usuarios diferentes', () => {
    db.blockSeller('user1', 'vendedor1');
    db.blockSeller('user2', 'vendedor1');
    expect(db.listBlockedSellers('user1')).toEqual(['vendedor1']);
    expect(db.listBlockedSellers('user2')).toEqual(['vendedor1']);
  });
});

describe('unblockSeller', () => {
  test('desbloquear vendedor existente retorna true', () => {
    db.blockSeller('user1', 'vendedor1');
    expect(db.unblockSeller('user1', 'vendedor1')).toBe(true);
  });

  test('desbloquear vendedor inexistente retorna false', () => {
    expect(db.unblockSeller('user1', 'naoexiste')).toBe(false);
  });

  test('desbloquear nao afeta outro usuario', () => {
    db.blockSeller('user1', 'vendedor1');
    db.blockSeller('user2', 'vendedor1');
    db.unblockSeller('user1', 'vendedor1');
    expect(db.listBlockedSellers('user1')).toEqual([]);
    expect(db.listBlockedSellers('user2')).toEqual(['vendedor1']);
  });
});

describe('listBlockedSellers', () => {
  test('retorna lista vazia quando nenhum bloqueado', () => {
    expect(db.listBlockedSellers('user1')).toEqual([]);
  });

  test('retorna todos os vendedores bloqueados', () => {
    db.blockSeller('user1', 'beta');
    db.blockSeller('user1', 'alpha');
    const sellers = db.listBlockedSellers('user1');
    expect(sellers.sort()).toEqual(['alpha', 'beta']);
  });

  test('nao retorna vendedores de outro usuario', () => {
    db.blockSeller('user1', 'vendedor1');
    db.blockSeller('user2', 'vendedor2');
    expect(db.listBlockedSellers('user1')).toEqual(['vendedor1']);
  });
});

describe('getBlockedSellerSet', () => {
  test('retorna Set vazio quando nenhum bloqueado', () => {
    const set = db.getBlockedSellerSet('user1');
    expect(set).toBeInstanceOf(Set);
    expect(set.size).toBe(0);
  });

  test('retorna Set com vendedores bloqueados', () => {
    db.blockSeller('user1', 'vendedor1');
    db.blockSeller('user1', 'vendedor2');
    const set = db.getBlockedSellerSet('user1');
    expect(set.size).toBe(2);
    expect(set.has('vendedor1')).toBe(true);
    expect(set.has('vendedor2')).toBe(true);
  });

  test('vendedores sao lowercase no Set', () => {
    db.blockSeller('user1', 'VendedorX');
    const set = db.getBlockedSellerSet('user1');
    expect(set.has('vendedorx')).toBe(true);
  });
});
