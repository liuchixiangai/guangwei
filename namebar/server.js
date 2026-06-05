/**
 * server.js - 光为云直播字幕条 v2.1（持久化+配色版）
 * 对齐篮球足球：SQLite快照、12小时持久化、防断电
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const db = require('./db');

const PORT = 3003;
const app = express();
const server = http.createServer(app);

app.use(express.json());
// 安全：阻止敏感文件被静态下载
app.use((req, res, next) => {
  if (/\.(db|sqlite|sqlite3|json)$/i.test(req.path)) return res.status(403).send('Forbidden');
  next();
});
app.use(express.static(__dirname));

// 首页重定向
app.get('/', (req, res) => res.redirect('/admin.html'));

// ========== WebSocket ==========
const wss = new WebSocketServer({ server });
const clients = new Map();

function broadcastToRoom(roomId, msg, excludeWs) {
  const json = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) {
      const info = clients.get(ws);
      if (info && info.roomId === roomId && ws !== excludeWs) ws.send(json);
    }
  });
}

wss.on('connection', (ws) => {
  let clientInfo = { roomId: null, operatorId: null };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join') {
        clientInfo.roomId = msg.roomId;
        clientInfo.operatorId = msg.operatorId || null;
        clients.set(ws, clientInfo);
        const state = getRoom(msg.roomId);
        ws.send(JSON.stringify({ type: 'state', data: state }));
        return;
      }

      if (msg.type === 'update' && clientInfo.roomId) {
        const roomId = clientInfo.roomId;
        if (!rooms.has(roomId)) return;
        const state = rooms.get(roomId);
        const data = sanitizeState(msg.data || {});
        Object.assign(state, data);
        db.saveRoomSnapshot(roomId, state);
        broadcastToRoom(roomId, { type: 'state', data: state }, ws);
        // 广播操作日志
        if (msg.action) {
          const opName = String(msg.operatorName || '').slice(0, 50);
          const action = String(msg.action || '').slice(0, 100);
          const detail = String(msg.detail || '').slice(0, 200);
          broadcastToRoom(roomId, {
            type: 'op_log',
            data: { ts: Date.now(), operatorName: opName, action, detail }
          });
        }
      }
    } catch (e) {
      console.error('[WS msg error]', e.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// ========== 多房间状态 ==========
const rooms = new Map();

// 安全：状态字段白名单
const STATE_WHITELIST = [
  'persons', 'currentIndex', 'currentTemplate', 'visible',
  'colorScheme', 'barBg', 'barBd', 'textColor', 'accentColor',
  'fontSize', 'position'
];

function sanitizeState(data) {
  const clean = {};
  for (const key of STATE_WHITELIST) {
    if (key in data) clean[key] = data[key];
  }
  return clean;
}

function createRoomState() {
  return {
    persons: [],
    currentIndex: -1,
    currentTemplate: 'A',
    visible: true,        // 默认显示字幕
    colorScheme: 'blue',  // 赤橙黄绿青蓝紫之一
    barBg: 'rgba(0,0,0,0.72)',
    barBd: 'rgba(255,255,255,0.15)',
    textColor: '#ffffff',
    accentColor: '#FF6B00',
    fontSize: 'normal',
    position: 'bottom-left',
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    const snapshot = db.loadRoomSnapshot(roomId);
    if (snapshot) {
      const age = Math.round((snapshot._snapshotAge || 0) / 60000);
      console.log('[Room ' + roomId + '] 恢复快照（' + age + '分钟前）');
      delete snapshot._snapshotAge;
      if (!Array.isArray(snapshot.persons)) snapshot.persons = [];
      if (typeof snapshot.visible !== 'boolean') snapshot.visible = true;
      if (!snapshot.colorScheme) snapshot.colorScheme = 'blue';
      rooms.set(roomId, snapshot);
    } else {
      rooms.set(roomId, createRoomState());
    }
  }
  return rooms.get(roomId);
}

function roomExists(roomId) {
  if (rooms.has(roomId)) return true;
  return db.loadRoomSnapshot(roomId) !== null;
}

// ========== 房间ID生成 ==========
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789';
function genRoomId() {
  let id = '';
  for (let i = 0; i < 6; i++) id += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  return id;
}

// ========== API 路由 ==========
app.post('/api/room/create', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  const roomId = genRoomId();
  const operator = { id: Date.now().toString(36), name: name.trim(), role: '主控' };
  const state = getRoom(roomId);
  db.saveRoomSnapshot(roomId, state);
  res.json({ success: true, roomId, operator });
});

app.post('/api/room/join', (req, res) => {
  const { name, roomId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  if (!roomId) return res.status(400).json({ error: '缺少房间号' });
  if (!roomExists(roomId)) return res.status(404).json({ error: '房间不存在' });
  const operator = { id: Date.now().toString(36), name: name.trim(), role: '副控' };
  res.json({ success: true, operator });
});

app.get('/api/state/:roomId', (req, res) => {
  if (!roomExists(req.params.roomId)) return res.status(404).json({ error: '房间不存在' });
  res.json(getRoom(req.params.roomId));
});

// ========== 定期清理旧快照（每小时） ==========
setInterval(() => {
  db.cleanOldSnapshots(12 * 60 * 60 * 1000);
}, 60 * 60 * 1000);

// ========== 启动 ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('[Namebar] 光为云直播字幕条 v2.1 运行于端口 ' + PORT);
});
