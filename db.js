/**
 * db.js - 导播星球数据库层
 * SQLite: 留言墙 + 支持者 + 使用日志
 */
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'daobo.db');
const db = new Database(DB_PATH);

// WAL 模式提升并发
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// ===== 建表 =====
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    content TEXT NOT NULL,
    likes INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS supporters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    amount TEXT NOT NULL,
    logo_url TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    contact TEXT DEFAULT '',
    custom_html TEXT DEFAULT '',
    is_approved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    tool TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_approved ON messages(is_approved, is_hidden, is_pinned);
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);
`);

// ===== 消息留言墙 =====

function addMessage(city, content) {
  const stmt = db.prepare('INSERT INTO messages (city, content, is_approved) VALUES (?, ?, 0)');
  return stmt.run(city.slice(0, 20), content.slice(0, 500));
}

function getApprovedMessages(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const stmt = db.prepare(
    'SELECT id, city, content, likes, is_pinned, created_at FROM messages WHERE is_approved = 1 AND is_hidden = 0 ORDER BY is_pinned DESC, created_at DESC LIMIT ? OFFSET ?'
  );
  const rows = stmt.all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM messages WHERE is_approved = 1 AND is_hidden = 0').get();
  return { rows, total: total.c, page, limit };
}

function likeMessage(id) {
  db.prepare('UPDATE messages SET likes = likes + 1 WHERE id = ?').run(id);
  return db.prepare('SELECT likes FROM messages WHERE id = ?').get(id);
}

// 管理员：获取所有消息（含未审核）
function getAllMessages(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const rows = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as c FROM messages').get();
  return { rows, total: total.c };
}

function approveMessage(id) {
  db.prepare('UPDATE messages SET is_approved = 1 WHERE id = ?').run(id);
}
function togglePinMessage(id) {
  const row = db.prepare('SELECT is_pinned FROM messages WHERE id = ?').get(id);
  db.prepare('UPDATE messages SET is_pinned = ? WHERE id = ?').run(row.is_pinned ? 0 : 1, id);
}
function hideMessage(id) {
  db.prepare('UPDATE messages SET is_hidden = 1 WHERE id = ?').run(id);
}
function unhideMessage(id) {
  db.prepare('UPDATE messages SET is_hidden = 0 WHERE id = ?').run(id);
}
function setMessageLikes(id, likes) {
  db.prepare('UPDATE messages SET likes = ? WHERE id = ?').run(Number(likes), id);
}
function deleteMessage(id) {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

// ===== 支持者 =====

function getApprovedSupporters() {
  return db.prepare('SELECT * FROM supporters WHERE is_approved = 1 ORDER BY created_at DESC').all();
}

function getSupporterBySlug(slug) {
  return db.prepare('SELECT * FROM supporters WHERE slug = ? AND is_approved = 1').get(slug);
}

function getAllSupporters() {
  return db.prepare('SELECT * FROM supporters ORDER BY created_at DESC').all();
}

function addSupporter(data) {
  const stmt = db.prepare('INSERT INTO supporters (name, slug, amount, logo_url, bio, contact, custom_html) VALUES (?, ?, ?, ?, ?, ?, ?)');
  return stmt.run(data.name, data.slug, data.amount, data.logo_url || '', data.bio || '', data.contact || '', data.custom_html || '');
}

function approveSupporter(id) {
  db.prepare('UPDATE supporters SET is_approved = 1 WHERE id = ?').run(id);
}
function deleteSupporter(id) {
  db.prepare('DELETE FROM supporters WHERE id = ?').run(id);
}

function updateSupporter(id, data) {
  const fields = [];
  const vals = [];
  for (const k of ['name', 'slug', 'amount', 'logo_url', 'bio', 'contact', 'custom_html', 'is_approved']) {
    if (data[k] !== undefined) { fields.push(`${k}=?`); vals.push(data[k]); }
  }
  if (fields.length) {
    vals.push(id);
    db.prepare(`UPDATE supporters SET ${fields.join(',')} WHERE id = ?`).run(...vals);
  }
}

// ===== 最近使用日志 =====

const MOCK_NICKNAMES = ['张导','李导','王导','陈导','刘导','赵导','杨导','黄导','周导','吴导',
  '孙老师','马老师','朱老师','胡老师','林老师','何老师','阿伟','小明','阿杰','阿涛',
  '直播小王','老张','大刘','小陈','光**','东哥','老K','Ming','阿豪','昊哥'];
const TOOLS = ['会议人名条', '篮球计分板', '足球计分板'];

function seedMockUsage() {
  const count = db.prepare('SELECT COUNT(*) as c FROM usage_log').get().c;
  if (count > 0) return; // 已初始化

  const now = new Date();
  const insert = db.prepare('INSERT INTO usage_log (nickname, tool, created_at) VALUES (?, ?, ?)');
  const seed = db.transaction(() => {
    for (let day = 6; day >= 0; day--) {
      const d = new Date(now);
      d.setDate(d.getDate() - day);
      const numRecords = 20 + Math.floor(Math.random() * 12); // 20~31
      for (let i = 0; i < numRecords; i++) {
        const hour = 9 + Math.floor(Math.random() * 12); // 9~20
        const minute = Math.floor(Math.random() * 60);
        d.setHours(hour, minute, Math.floor(Math.random() * 60));
        const nick = MOCK_NICKNAMES[Math.floor(Math.random() * MOCK_NICKNAMES.length)];
        const tool = TOOLS[Math.floor(Math.random() * TOOLS.length)];
        insert.run(nick, tool, d.toISOString().replace('T', ' ').slice(0, 19));
      }
    }
  });
  seed();
  console.log('[DB] Mock usage data seeded');
}

function getRecentUsage(limit = 50) {
  seedMockUsage();
  return db.prepare('SELECT * FROM usage_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

function addUsageLog(nickname, tool) {
  db.prepare('INSERT INTO usage_log (nickname, tool) VALUES (?, ?)').run(nickname.slice(0, 20), tool);
}

module.exports = {
  // Messages
  addMessage, getApprovedMessages, likeMessage, getAllMessages,
  approveMessage, togglePinMessage, hideMessage, unhideMessage,
  setMessageLikes, deleteMessage,
  // Supporters
  getApprovedSupporters, getSupporterBySlug, getAllSupporters,
  addSupporter, approveSupporter, deleteSupporter, updateSupporter,
  // Usage
  getRecentUsage, addUsageLog, seedMockUsage,
};
