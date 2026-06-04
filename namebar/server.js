/**
 * server.js - 光为云直播字幕条 v2.0（房间系统重构版）
 * 对齐篮球足球：姓名+自动6位房间号+多人协作+透明网页
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = 3003;
const app = express();
const server = http.createServer(app);

app.use(express.json());
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
        const state = getRoom(roomId);
        const data = msg.data || {};
        Object.assign(state, data);
        broadcastToRoom(roomId, { type: 'state', data: state }, ws);
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

function createRoomState() {
  return {
    persons: [],
    currentIndex: -1,
    currentTemplate: 'A',
    visible: false,
    // 自定义样式
    barBg: 'rgba(0,0,0,0.72)',
    barBd: 'rgba(255,255,255,0.15)',
    textColor: '#ffffff',
    accentColor: '#FF6B00',
    fontSize: 'normal', // small | normal | large
    position: 'bottom-left', // bottom-left | bottom-center | bottom-right | top-center
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoomState());
  }
  return rooms.get(roomId);
}

// ========== 房间ID生成 ==========
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 排除 0/O/1/l/I
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
  getRoom(roomId);
  res.json({ success: true, roomId, operator });
});

app.post('/api/room/join', (req, res) => {
  const { name, roomId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  if (!roomId) return res.status(400).json({ error: '缺少房间号' });
  getRoom(roomId);
  const operator = { id: Date.now().toString(36), name: name.trim(), role: '副控' };
  res.json({ success: true, operator });
});

app.get('/api/state/:roomId', (req, res) => {
  res.json(getRoom(req.params.roomId));
});

// ========== 启动 ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Namebar] 光为云直播字幕条 v2.0 运行于端口 ${PORT}`);
});
