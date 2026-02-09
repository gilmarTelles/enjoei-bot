const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'bot.db');

let db;

function init() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS seen_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      title TEXT,
      price TEXT,
      url TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, keyword)
    );
  `);

  return db;
}

function addKeyword(keyword) {
  const normalized = keyword.toLowerCase().trim();
  try {
    db.prepare('INSERT INTO keywords (keyword) VALUES (?)').run(normalized);
    return true;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    throw err;
  }
}

function removeKeyword(keyword) {
  const normalized = keyword.toLowerCase().trim();
  const result = db.prepare('DELETE FROM keywords WHERE keyword = ?').run(normalized);
  return result.changes > 0;
}

function listKeywords() {
  return db.prepare('SELECT keyword FROM keywords ORDER BY created_at').all().map(r => r.keyword);
}

function isProductSeen(productId, keyword) {
  const row = db.prepare('SELECT 1 FROM seen_products WHERE product_id = ? AND keyword = ?').get(productId, keyword);
  return !!row;
}

function markProductSeen(product, keyword) {
  try {
    db.prepare(
      'INSERT INTO seen_products (product_id, keyword, title, price, url) VALUES (?, ?, ?, ?, ?)'
    ).run(product.id, keyword, product.title, product.price, product.url);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
  }
}

function getDb() {
  return db;
}

module.exports = { init, addKeyword, removeKeyword, listKeywords, isProductSeen, markProductSeen, getDb };
