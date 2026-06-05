/**
 * db.js - SQLite 持久化层（篮球/足球通用）
 * 防断电：所有状态变更即时写盘
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'scoreboard.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// ========== 建表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS operators (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    pin TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS room_snapshots (
    room_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    operator_id TEXT,
    operator_name TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ops_room ON operations(room_id);
`);

// ========== 操作员 ==========
function registerOperator(name, pin) {
  const id = require('crypto').randomUUID();
  try {
    db.prepare('INSERT INTO operators (id, name, pin, active) VALUES (?, ?, ?, 1)').run(id, name.trim(), pin);
    return { id, name: name.trim() };
  } catch (e) {
    if (e.message.includes('UNIQUE')) throw new Error('该姓名已注册，请直接登录');
    throw e;
  }
}

function loginOperator(name, pin) {
  const row = db.prepare('SELECT id, name FROM operators WHERE name = ? AND pin = ? AND active = 1').get(name.trim(), pin);
  return row || null;
}

function getActiveOperators() {
  return db.prepare('SELECT id, name, created_at FROM operators WHERE active = 1 ORDER BY created_at DESC').all();
}

// ========== 房间快照 ==========
function saveRoomSnapshot(roomId, data) {
  const json = JSON.stringify(data);
  db.prepare(`
    INSERT INTO room_snapshots (room_id, data, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(room_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run(roomId, json);
}

function loadRoomSnapshot(roomId) {
  const row = db.prepare('SELECT data, updated_at FROM room_snapshots WHERE room_id = ?').get(roomId);
  if (!row) return null;
  try {
    const data = JSON.parse(row.data);
    const age = Date.now() - new Date(row.updated_at).getTime();
    data._snapshotAge = age;
    return data;
  } catch { return null; }
}

// ========== 操作记录 ==========
function logOperation(roomId, operatorId, operatorName, action, detail) {
  db.prepare('INSERT INTO operations (room_id, operator_id, operator_name, action, detail) VALUES (?, ?, ?, ?, ?)')
    .run(roomId, operatorId, operatorName, action, detail || '');
}

function getOperations(roomId, limit) {
  limit = limit || 50;
  return db.prepare('SELECT * FROM operations WHERE room_id = ? ORDER BY id DESC LIMIT ?').all(roomId, limit);
}

module.exports = {
  registerOperator,
  loginOperator,
  getActiveOperators,
  saveRoomSnapshot,
  loadRoomSnapshot,
  logOperation,
  getOperations
};
