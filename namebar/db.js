/**
 * db.js - SQLite 持久化层（字幕条用）
 * 防断电：12小时快照保存，重启自动恢复
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'scoreboard.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS room_snapshots (
    room_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

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

// 清理超过12小时的旧快照
function cleanOldSnapshots(maxAgeMs) {
  maxAgeMs = maxAgeMs || 12 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  db.prepare('DELETE FROM room_snapshots WHERE updated_at < ?').run(cutoff);
}

module.exports = { saveRoomSnapshot, loadRoomSnapshot, cleanOldSnapshots };
