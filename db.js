const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'wellcoach.db.json');

let db = null;

// Persist DB to disk as JSON (sql.js works in-memory, we serialize)
function saveDB() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer.toString('base64'));
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

function loadDB(SQL) {
  if (fs.existsSync(DB_PATH)) {
    try {
      const base64 = fs.readFileSync(DB_PATH, 'utf8');
      const buffer = Buffer.from(base64, 'base64');
      return new SQL.Database(buffer);
    } catch (e) {
      console.warn('Could not load DB, creating fresh:', e.message);
    }
  }
  return new SQL.Database();
}

async function initDB() {
  const SQL = await initSqlJs();
  db = loadDB(SQL);

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      anthropic_key TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wellness_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      log_date TEXT NOT NULL,
      sleep REAL NOT NULL,
      water INTEGER NOT NULL,
      exercise INTEGER NOT NULL,
      stress INTEGER NOT NULL,
      mood TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, log_date),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  saveDB();
  console.log('✅ Database initialized');
}

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (e) {
    throw new Error('DB query error: ' + e.message);
  }
}

function run(sql, params = []) {
  try {
    db.run(sql, params);
    // Get last insert rowid
    const result = query('SELECT last_insert_rowid() as id');
    saveDB();
    return { lastID: result[0]?.id };
  } catch (e) {
    throw new Error('DB run error: ' + e.message);
  }
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

module.exports = { initDB, query, run, get, saveDB };
