/**
 * server.js - 光为云直播字幕条 v2.2（安全加固+token鉴权）
 */
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const db = require('./db');

const PORT = process.env.PORT || 3003;
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '64kb' }));

// 安全：阻止敏感文件被静态下载
app.use((req, res, next) => {
  if (/\.(db|sqlite|sqlite3|json)$/i.test(req.path)) return res.status(403).send('Forbidden');
  if (/(\.db|\.sqlite)-/.test(req.path)) return res.status(403).send('Forbidden');
  if (/\.db-(wal|shm|journal)$/i.test(req.path)) return res.status(403).send('Forbidden');
  next();
});
app.use(express.static(__dirname));

// 首页重定向
app.get('/', (req, res) => res.redirect('/admin.html'));

// ========== WebSocket ==========
const wss = new WebSocketServer({ server, maxPayload: 65536 });
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
  let clientInfo = { roomId: null, roomToken: null, operatorId: null };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }

      if (msg.type === 'join') {
        const state = getRoom(msg.roomId);
        clientInfo.roomId = msg.roomId;
        clientInfo.roomToken = msg.roomToken || null;
        clientInfo.operatorId = msg.operatorId || null;
        clients.set(ws, clientInfo);

        // 读操作不需要token，返回不带token的状态
        const publicState = { ...state };
        delete publicState.roomToken;
        ws.send(JSON.stringify({ type: 'state', data: publicState }));
        return;
      }

      if (msg.type === 'update' && clientInfo.roomId) {
        const roomId = clientInfo.roomId;
        if (!rooms.has(roomId)) return;
        const state = rooms.get(roomId);

        // 写操作必须验证token
        if (state.roomToken && clientInfo.roomToken !== state.roomToken) return;

        const data = validateAndSanitize(msg.data || {});
        Object.assign(state, data);
        db.saveRoomSnapshot(roomId, state);

        const publicState = { ...state };
        delete publicState.roomToken;
        broadcastToRoom(roomId, { type: 'state', data: publicState }, ws);

        if (msg.action) {
          broadcastToRoom(roomId, {
            type: 'op_log',
            data: { ts: Date.now(), operatorName: String(msg.operatorName || '').slice(0, 50), action: String(msg.action || '').slice(0, 100), detail: String(msg.detail || '').slice(0, 200) }
          });
        }
      }
    } catch (e) {
      console.error('[WS error]', e.message);
    }
  });

  ws.on('close', () => clients.delete(ws));
});

// ========== 多房间状态 ==========
const rooms = new Map();

const VALID_COLORS = ['red','orange','yellow','green','cyan','blue','purple'];
const VALID_TEMPLATES = ['A','B','C','D','E','F'];
const VALID_FONTS = ['small','normal','large'];
const VALID_POSITIONS = ['bottom-left','bottom-center','bottom-right','top-center'];
const MAX_PERSONS = 50;

function validateAndSanitize(data) {
  const clean = {};
  if (Array.isArray(data.persons)) {
    clean.persons = data.persons.slice(0, MAX_PERSONS).map(p => ({
      id: String(p.id || '').slice(0, 20),
      name: String(p.name || '').slice(0, 20),
      title: String(p.title || '').slice(0, 40),
      title2: String(p.title2 || '').slice(0, 40)
    }));
  }
  if (typeof data.currentIndex === 'number') clean.currentIndex = Math.max(-1, Math.min(data.currentIndex, (clean.persons || data.persons || []).length - 1));
  if (data.currentTemplate && VALID_TEMPLATES.includes(data.currentTemplate)) clean.currentTemplate = data.currentTemplate;
  if (typeof data.visible === 'boolean') clean.visible = data.visible;
  if (data.colorScheme && VALID_COLORS.includes(data.colorScheme)) clean.colorScheme = data.colorScheme;
  if (typeof data.fontSize === 'string' && VALID_FONTS.includes(data.fontSize)) clean.fontSize = data.fontSize;
  if (typeof data.position === 'string' && VALID_POSITIONS.includes(data.position)) clean.position = data.position;
  return clean;
}

function createRoomState() {
  return {
    persons: [], currentIndex: -1, currentTemplate: 'A',
    visible: true, colorScheme: 'blue',
    fontSize: 'normal', position: 'bottom-left',
    roomToken: crypto.randomBytes(12).toString('hex')
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
      if (!snapshot.colorScheme || !VALID_COLORS.includes(snapshot.colorScheme)) snapshot.colorScheme = 'blue';
      if (!snapshot.roomToken) snapshot.roomToken = crypto.randomBytes(12).toString('hex');
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

// ========== Token 验证中间件 ==========
function requireToken(req, res, next) {
  const roomId = req.params.roomId || req.body.roomId;
  if (!roomId) return res.status(400).json({ error: '缺少房间号' });
  if (!rooms.has(roomId)) return res.status(404).json({ error: '房间不存在' });
  const state = rooms.get(roomId);
  if (state.roomToken && req.query.token !== state.roomToken && req.body.token !== state.roomToken) {
    return res.status(403).json({ error: '无权限' });
  }
  next();
}

// ========== 房间ID生成 ==========
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789';
function genRoomId() {
  for (let retry = 0; retry < 10; retry++) {
    let id = '';
    for (let i = 0; i < 6; i++) id += CHARSET[Math.floor(Math.random() * CHARSET.length)];
    if (!roomExists(id)) return id;
  }
  return 'error'; // should never happen
}

// ========== API 路由（双挂载：根路径 + /namebar 前缀） ==========
function mountNamebarRoutes(prefix) {
  const p = prefix || '';

  app.post(p + '/api/room/create', (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
    const roomId = genRoomId();
    const state = getRoom(roomId);
    db.saveRoomSnapshot(roomId, state);
    const operator = { id: crypto.randomUUID(), name: name.trim().slice(0, 20), role: '主控' };
    res.json({ success: true, roomId, roomToken: state.roomToken, operator });
  });

  app.post(p + '/api/room/join', (req, res) => {
    const { name, roomId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
    if (!roomId) return res.status(400).json({ error: '缺少房间号' });
    if (!roomExists(roomId)) return res.status(404).json({ error: '房间不存在' });
    const operator = { id: crypto.randomUUID(), name: name.trim().slice(0, 20), role: '副控' };
    res.json({ success: true, operator });
  });

  app.get(p + '/api/state/:roomId', (req, res) => {
    if (!roomExists(req.params.roomId)) return res.status(404).json({ error: '房间不存在' });
    const state = getRoom(req.params.roomId);
    const publicState = { ...state };
    delete publicState.roomToken;
    res.json(publicState);
  });
}

// 同时挂载根路径和 /namebar 前缀，兼容直连和Nginx代理两种部署
mountNamebarRoutes('');
mountNamebarRoutes('/namebar');

// ========== 定期清理旧快照 ==========
setInterval(() => {
  db.cleanOldSnapshots(12 * 60 * 60 * 1000);
}, 60 * 60 * 1000);

// ========== 启动 ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('[Namebar] 光为云直播字幕条 v2.2 running on ' + PORT);
});
