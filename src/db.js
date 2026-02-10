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

  return db;
}

function addKeyword(chatId, keyword) {
  const normalized = keyword.toLowerCase().trim();
  try {
    db.prepare('INSERT INTO keywords (chat_id, keyword) VALUES (?, ?)').run(chatId, normalized);
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
  return db.prepare('SELECT keyword FROM keywords WHERE chat_id = ? ORDER BY created_at').all(chatId).map(r => r.keyword);
}

function getAllUserKeywords() {
  return db.prepare('SELECT DISTINCT chat_id, keyword FROM keywords').all();
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

function getDb() {
  return db;
}

module.exports = { init, addKeyword, removeKeyword, listKeywords, getAllUserKeywords, isProductSeen, markProductSeen, getDb };
