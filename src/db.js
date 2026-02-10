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

    CREATE TABLE IF NOT EXISTS user_settings (
      chat_id TEXT PRIMARY KEY,
      paused INTEGER NOT NULL DEFAULT 0
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

  // Migration: add platform column to keywords (default 'enjoei')
  try {
    db.exec("ALTER TABLE keywords ADD COLUMN platform TEXT NOT NULL DEFAULT 'enjoei'");
  } catch (err) {
    // Column already exists — ignore
  }

  // Migration: add platform column to seen_products (default 'enjoei')
  try {
    db.exec("ALTER TABLE seen_products ADD COLUMN platform TEXT NOT NULL DEFAULT 'enjoei'");
  } catch (err) {
    // Column already exists — ignore
  }

  // Migration: recreate keywords table with UNIQUE(chat_id, keyword, platform) instead of UNIQUE(chat_id, keyword)
  // Check if we need to migrate by inspecting existing unique index
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='keywords'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes('UNIQUE(chat_id, keyword, platform)')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS keywords_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL,
          keyword TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          max_price REAL,
          filters TEXT,
          platform TEXT NOT NULL DEFAULT 'enjoei',
          UNIQUE(chat_id, keyword, platform)
        );
        INSERT OR IGNORE INTO keywords_new (id, chat_id, keyword, created_at, max_price, filters, platform)
          SELECT id, chat_id, keyword, created_at, max_price, filters, platform FROM keywords;
        DROP TABLE keywords;
        ALTER TABLE keywords_new RENAME TO keywords;
      `);
    }
  } catch (err) {
    console.error('[db] Migration error (keywords unique constraint):', err.message);
  }

  return db;
}

function addKeyword(chatId, keyword, maxPrice, platform = 'enjoei') {
  const normalized = keyword.toLowerCase().trim();
  try {
    db.prepare('INSERT INTO keywords (chat_id, keyword, max_price, platform) VALUES (?, ?, ?, ?)').run(chatId, normalized, maxPrice || null, platform);
    return true;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return false;
    throw err;
  }
}

function removeKeyword(chatId, keyword, platform) {
  const normalized = keyword.toLowerCase().trim();
  if (platform) {
    const result = db.prepare('DELETE FROM keywords WHERE chat_id = ? AND keyword = ? AND platform = ?').run(chatId, normalized, platform);
    return result.changes > 0;
  }
  const result = db.prepare('DELETE FROM keywords WHERE chat_id = ? AND keyword = ?').run(chatId, normalized);
  return result.changes > 0;
}

function listKeywords(chatId) {
  return db.prepare('SELECT keyword, max_price, filters, platform FROM keywords WHERE chat_id = ? ORDER BY created_at').all(chatId);
}

function listKeywordsWithId(chatId) {
  return db.prepare('SELECT id, keyword, max_price, filters, platform FROM keywords WHERE chat_id = ? ORDER BY created_at').all(chatId);
}

function getKeywordByIdAndChat(id, chatId) {
  return db.prepare('SELECT id, keyword, max_price, filters, platform FROM keywords WHERE id = ? AND chat_id = ?').get(id, chatId) || null;
}

function updateFilters(id, filtersJson) {
  db.prepare('UPDATE keywords SET filters = ? WHERE id = ?').run(filtersJson, id);
}

function getAllUserKeywords() {
  return db.prepare('SELECT id, chat_id, keyword, max_price, filters, platform FROM keywords').all();
}

function isProductSeen(productId, keyword, chatId, platform = 'enjoei') {
  const row = db.prepare('SELECT 1 FROM seen_products WHERE product_id = ? AND keyword = ? AND chat_id = ? AND platform = ?').get(productId, keyword, chatId, platform);
  return !!row;
}

function markProductSeen(product, keyword, chatId, platform = 'enjoei') {
  try {
    db.prepare(
      'INSERT INTO seen_products (product_id, keyword, chat_id, title, price, url, platform) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(product.id, keyword, chatId, product.title, product.price, product.url, platform);
  } catch (err) {
    if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw err;
  }
}

function getSeenProductPrice(productId, keyword, chatId, platform = 'enjoei') {
  const row = db.prepare('SELECT price FROM seen_products WHERE product_id = ? AND keyword = ? AND chat_id = ? AND platform = ?').get(productId, keyword, chatId, platform);
  return row ? row.price : null;
}

function updateSeenProductPrice(productId, keyword, chatId, newPrice, platform = 'enjoei') {
  db.prepare('UPDATE seen_products SET price = ? WHERE product_id = ? AND keyword = ? AND chat_id = ? AND platform = ?').run(newPrice, productId, keyword, chatId, platform);
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

function setPaused(chatId, paused) {
  db.prepare('INSERT OR REPLACE INTO user_settings (chat_id, paused) VALUES (?, ?)').run(chatId, paused ? 1 : 0);
}

function isPaused(chatId) {
  const row = db.prepare('SELECT paused FROM user_settings WHERE chat_id = ?').get(chatId);
  return row ? row.paused === 1 : false;
}

function getDb() {
  return db;
}

module.exports = {
  init, addKeyword, removeKeyword, listKeywords, listKeywordsWithId,
  getKeywordByIdAndChat, updateFilters, getAllUserKeywords,
  isProductSeen, markProductSeen, getSeenProductPrice, updateSeenProductPrice,
  countKeywords, purgeOldProducts, backupDb, getDb,
  setPaused, isPaused,
};
