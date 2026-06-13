/**
 * 直播落地页后端 — 祝福语系统
 * 7天自动清理，SQLite存储
 */
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3006;
const app = express();
app.use(express.json({ limit: '16kb' }));

// 数据库
const db = new Database(path.join(__dirname, 'data', 'blessings.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS blessings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_bless_time ON blessings(created_at);
`);

// 7天清理
function cleanOld() {
  db.prepare("DELETE FROM blessings WHERE created_at < datetime('now','localtime','-7 days')").run();
}
cleanOld();
setInterval(cleanOld, 3600000); // 每小时清理

// 提交祝福
app.post('/api/blessing', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入姓名' });
  const n = name.trim().slice(0, 20);
  db.prepare('INSERT INTO blessings (name) VALUES (?)').run(n);
  const total = db.prepare('SELECT COUNT(*) as c FROM blessings').get().c;
  res.json({ success: true, name: n, total });
});

// 获取祝福列表（最近100条）
app.get('/api/blessings', (req, res) => {
  const rows = db.prepare('SELECT name, created_at FROM blessings ORDER BY created_at DESC LIMIT 100').all();
  const total = db.prepare('SELECT COUNT(*) as c FROM blessings').get().c;
  res.json({ blessings: rows, total });
});

// 静态文件
app.use(express.static(__dirname, {
  setHeaders: function(res) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LiveLanding] running on port ${PORT}`);
});
