const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'bot.db');

let db;

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(chat_id, keyword)
    );

    CREATE TABLE IF NOT EXISTS seen_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      title TEXT,
      price TEXT,
      url TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, keyword, chat_id)
    );
  `);

  // Migration: add max_price column to keywords
  try {
    db.exec('ALTER TABLE keywords ADD COLUMN max_price REAL');
  } catch (err) {
    // Column already exists — ignore
  }

  // Migration: add filters column to keywords
  try {
    db.exec('ALTER TABLE keywords ADD COLUMN filters TEXT');
  } catch (err) {
    // Column already exists — ignore
  }

  return db;
}

function addKeyword(chatId, keyword, maxPrice) {
  const normalized = keyword.toLowerCase().trim();
  try {
    db.prepare('INSERT INTO keywords (chat_id, keyword, max_price) VALUES (?, ?, ?)').run(chatId, normalized, maxPrice || null);
    return true;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    throw err;
  }
}

function removeKeyword(chatId, keyword) {
  const normalized = keyword.toLowerCase().trim();
  const result = db.prepare('DELETE FROM keywords WHERE chat_id = ? AND keyword = ?').run(chatId, normalized);
  return result.changes > 0;
}

function listKeywords(chatId) {
  return db.prepare('SELECT keyword, max_price, filters FROM keywords WHERE chat_id = ? ORDER BY created_at').all(chatId);
}

function listKeywordsWithId(chatId) {
  return db.prepare('SELECT id, keyword, max_price, filters FROM keywords WHERE chat_id = ? ORDER BY created_at').all(chatId);
}

function getKeywordByIdAndChat(id, chatId) {
  return db.prepare('SELECT id, keyword, max_price, filters FROM keywords WHERE id = ? AND chat_id = ?').get(id, chatId) || null;
}

function updateFilters(id, filtersJson) {
  db.prepare('UPDATE keywords SET filters = ? WHERE id = ?').run(filtersJson, id);
}

function getAllUserKeywords() {
  return db.prepare('SELECT id, chat_id, keyword, max_price, filters FROM keywords').all();
}

function isProductSeen(productId, keyword, chatId) {
  const row = db.prepare('SELECT 1 FROM seen_products WHERE product_id = ? AND keyword = ? AND chat_id = ?').get(productId, keyword, chatId);
  return !!row;
}

function markProductSeen(product, keyword, chatId) {
  try {
    db.prepare(
      'INSERT INTO seen_products (product_id, keyword, chat_id, title, price, url) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(product.id, keyword, chatId, product.title, product.price, product.url);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
  }
}

function getSeenProductPrice(productId, keyword, chatId) {
  const row = db.prepare('SELECT price FROM seen_products WHERE product_id = ? AND keyword = ? AND chat_id = ?').get(productId, keyword, chatId);
  return row ? row.price : null;
}

function updateSeenProductPrice(productId, keyword, chatId, newPrice) {
  db.prepare('UPDATE seen_products SET price = ? WHERE product_id = ? AND keyword = ? AND chat_id = ?').run(newPrice, productId, keyword, chatId);
}

function countKeywords(chatId) {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM keywords WHERE chat_id = ?').get(chatId);
  return row.cnt;
}

function purgeOldProducts(days) {
  const result = db.prepare(
    "DELETE FROM seen_products WHERE first_seen_at < datetime('now', ? || ' days')"
  ).run(-days);
  return result.changes;
}

function backupDb() {
  const backupPath = DB_PATH + '.bak';
  db.backup(backupPath);
  return backupPath;
}

function getDb() {
  return db;
}

module.exports = {
  init, addKeyword, removeKeyword, listKeywords, listKeywordsWithId,
  getKeywordByIdAndChat, updateFilters, getAllUserKeywords,
  isProductSeen, markProductSeen, getSeenProductPrice, updateSeenProductPrice,
  countKeywords, purgeOldProducts, backupDb, getDb,
};
