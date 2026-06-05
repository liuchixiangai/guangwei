/**
 * server.js - 光为云篮球记分系统 v3.1（安全加固+token鉴权）
 * 极简目录：静态文件与 server.js 同级，express.static(__dirname)
 */
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3002;
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '64kb' }));
// 安全：阻止敏感文件被静态下载
app.use((req, res, next) => {
  if (/\.(db|sqlite|sqlite3|json)$/i.test(req.path)) return res.status(403).send('Forbidden');
  if (/\.db-(wal|shm|journal)$/i.test(req.path)) return res.status(403).send('Forbidden');
  next();
});
app.use(express.static(__dirname));

// ========== WebSocket ==========
const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> { roomId, operatorId }

function broadcastToRoom(roomId, msg, excludeWs) {
  const json = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) {
      const info = clients.get(ws);
      if (info && info.roomId === roomId && ws !== excludeWs) {
        ws.send(json);
      }
    }
  });
}

function broadcastAll(msg) {
  const json = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(json);
  });
}

wss.on('connection', (ws) => {
  let clientInfo = { roomId: null, roomToken: null, operatorId: null };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'join') {
        clientInfo.roomId = msg.roomId;
        clientInfo.roomToken = msg.roomToken || null;
        clientInfo.operatorId = msg.operatorId || null;
        clients.set(ws, clientInfo);
        const state = getRoom(msg.roomId);
        const publicState = { ...state };
        delete publicState.roomToken;
        ws.send(JSON.stringify({ type: 'state', data: publicState }));
        // 发送活跃操作员
        ws.send(JSON.stringify({ type: 'active_operators', data: db.getActiveOperators() }));
        // 发送历史操作日志
        const history = db.getOperations(msg.roomId, 50);
        if (history.length) {
          history.reverse().forEach(op => {
            ws.send(JSON.stringify({
              type: 'op_log',
              data: {
                ts: new Date(op.created_at).getTime(),
                operatorName: op.operator_name || '',
                action: op.action,
                detail: op.detail || ''
              }
            }));
          });
        }
        return;
      }

      if (msg.type === 'update' && clientInfo.roomId) {
        const roomId = clientInfo.roomId;
        if (!rooms.has(roomId)) return;
        const state = rooms.get(roomId);
        if (state.roomToken && clientInfo.roomToken !== state.roomToken) return;
        const data = sanitizeState(msg.data || {});
        // 计时器控制字段单独处理（不在白名单内）
        const timerRunningChanged = msg.data && msg.data.timerRunning !== undefined && msg.data.timerRunning !== state.timerRunning;
        const shotClockRunningChanged = msg.data && msg.data.shotClockRunning !== undefined && msg.data.shotClockRunning !== state.shotClockRunning;
        // 合并更新（仅白名单字段）
        Object.assign(state, data);
        if (timerRunningChanged) {
          if (msg.data.timerRunning) startMainTimer(roomId);
          else stopMainTimer(roomId);
        }
        if (shotClockRunningChanged) {
          if (msg.data.shotClockRunning) startShotClock(roomId);
          else stopShotClock(roomId);
        }
        db.saveRoomSnapshot(roomId, state);
        broadcastToRoom(roomId, { type: 'state', data: publicState(state) }, ws);
        if (msg.action) {
          const sanitizedAction = String(msg.action || '').slice(0, 100);
          const sanitizedName = String(msg.operatorName || '').slice(0, 50);
          const sanitizedDetail = String(msg.detail || '').slice(0, 200);
          db.logOperation(roomId, clientInfo.operatorId, sanitizedName, sanitizedAction, sanitizedDetail);
          broadcastToRoom(roomId, {
            type: 'op_log',
            data: {
              ts: Date.now(),
              operatorName: sanitizedName,
              action: sanitizedAction,
              detail: sanitizedDetail
            }
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

// 安全：状态字段白名单，防止客户端注入任意字段
const STATE_WHITELIST = [
  'eventName', 'homeTeam', 'awayTeam',
  'homeScore', 'awayScore', 'quarter',
  'homeColor', 'awayColor', 'barBg',
  'overlayVisible', 'show'
];
function sanitizeState(data) {
  const clean = {};
  for (const key of STATE_WHITELIST) {
    if (key in data) clean[key] = data[key];
  }
  return clean;
}

function publicState(state) {
  const s = { ...state };
  delete s.roomToken;
  return s;
}

function createRoomState() {
  return {
    eventName: '篮球联赛',
    homeTeam: '自定义主队',
    awayTeam: '自定义客队',
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    quarterNames: ['', '第1节', '第2节', '第3节', '第4节', '加时'],
    timeLeft: '10:00',
    timerRunning: false,
    timerSeconds: 600,
    shotClock: 24,
    shotClockRunning: false,
    shotClockSeconds: 24,
    overlayVisible: true,
    homeColor: '#FF6B00',
    awayColor: '#0057A8',
    barBg: 'rgba(15,20,40,0.82)',
    show: { mainTimer: true, shotClock: true },
    roomToken: crypto.randomBytes(12).toString('hex')
  };
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    const snapshot = db.loadRoomSnapshot(roomId);
    if (snapshot) {
      const age = Math.round((snapshot._snapshotAge || 0) / 60000);
      console.log(`[Room ${roomId}] 恢复快照（${age}分钟前）`);
      delete snapshot._snapshotAge;
      if (snapshot.timerRunning) snapshot.timerRunning = false;
      if (!snapshot.show) snapshot.show = { mainTimer: true, shotClock: true };
      if (typeof snapshot.timerSeconds !== 'number') snapshot.timerSeconds = 600;
      if (typeof snapshot.shotClockSeconds !== 'number') snapshot.shotClockSeconds = 24;
      if (!snapshot.roomToken) snapshot.roomToken = crypto.randomBytes(12).toString('hex');
      rooms.set(roomId, snapshot);
    } else {
      rooms.set(roomId, createRoomState());
    }
    initRoomTimer(roomId);
  }
  return rooms.get(roomId);
}

function roomExists(roomId) {
  if (rooms.has(roomId)) return true;
  return db.loadRoomSnapshot(roomId) !== null;
}

// ========== 每房间计时器 ==========
const roomTimers = new Map();

function initRoomTimer(roomId) {
  if (roomTimers.has(roomId)) {
    const rt = roomTimers.get(roomId);
    if (rt.mainInterval) clearInterval(rt.mainInterval);
    if (rt.shotInterval) clearInterval(rt.shotInterval);
  }
  roomTimers.set(roomId, { mainInterval: null, shotInterval: null });
}

function startMainTimer(roomId) {
  const rt = roomTimers.get(roomId) || {};
  if (rt.mainInterval) return;
  const state = getRoom(roomId);
  state.timerRunning = true;
  rt.mainInterval = setInterval(() => {
    const s = getRoom(roomId);
    if (s.timerSeconds > 0) {
      s.timerSeconds--;
      const m = Math.floor(s.timerSeconds / 60).toString().padStart(2, '0');
      const sec = (s.timerSeconds % 60).toString().padStart(2, '0');
      s.timeLeft = `${m}:${sec}`;
      broadcastToRoom(roomId, { type: 'state', data: s });
      db.saveRoomSnapshot(roomId, s);
    } else {
      stopMainTimer(roomId);
      broadcastToRoom(roomId, { type: 'state', data: s });
    }
  }, 1000);
  roomTimers.set(roomId, rt);
}

function stopMainTimer(roomId) {
  const rt = roomTimers.get(roomId);
  if (rt && rt.mainInterval) {
    clearInterval(rt.mainInterval);
    rt.mainInterval = null;
  }
  const state = getRoom(roomId);
  state.timerRunning = false;
}

function startShotClock(roomId) {
  const rt = roomTimers.get(roomId) || {};
  if (rt.shotInterval) return;
  const state = getRoom(roomId);
  state.shotClockRunning = true;
  rt.shotInterval = setInterval(() => {
    const s = getRoom(roomId);
    if (s.shotClockSeconds > 0) {
      s.shotClockSeconds--;
      s.shotClock = s.shotClockSeconds;
      broadcastToRoom(roomId, { type: 'state', data: s });
    } else {
      stopShotClock(roomId);
      broadcastToRoom(roomId, { type: 'state', data: s });
    }
  }, 1000);
  roomTimers.set(roomId, rt);
}

function stopShotClock(roomId) {
  const rt = roomTimers.get(roomId);
  if (rt && rt.shotInterval) {
    clearInterval(rt.shotInterval);
    rt.shotInterval = null;
  }
  const state = getRoom(roomId);
  state.shotClockRunning = false;
}

// ========== API 路由 ==========
app.post('/api/register', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: '请填写姓名和房间号' });
  if (!name.trim()) return res.status(400).json({ error: '姓名不能为空' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: '房间号必须为4位数字' });
  try {
    const op = db.registerOperator(name, String(pin));
    // 确保房间存在
    getRoom(String(pin));
    broadcastAll({ type: 'active_operators', data: db.getActiveOperators() });
    res.json({ success: true, operator: op });
  } catch (e) {
    res.status(400).json({ error: e.message || '注册失败' });
  }
});

app.post('/api/login', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: '请填写姓名和房间号' });
  const op = db.loginOperator(name, String(pin));
  if (op) {
    getRoom(String(pin));
    broadcastAll({ type: 'active_operators', data: db.getActiveOperators() });
    res.json({ success: true, operator: op });
  } else {
    res.status(401).json({ error: '姓名或房间号错误' });
  }
});

// ========== v4.0+ 房间API（姓名+自动生成房间ID） ==========
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 排除 0/O/1/l/I
function genRoomId() {
  let id = '';
  for (let i = 0; i < 6; i++) id += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  return id;
}

app.post('/api/room/create', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  const roomId = genRoomId();
  try {
    const op = db.registerOperator(name.trim(), roomId);
    getRoom(roomId);
    broadcastAll({ type: 'active_operators', data: db.getActiveOperators() });
    res.json({ success: true, roomId, roomToken: getRoom(roomId).roomToken, operator: op });
  } catch (e) {
    res.status(400).json({ error: e.message || '创建失败' });
  }
});

app.post('/api/room/join', (req, res) => {
  const { name, roomId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  if (!roomId) return res.status(400).json({ error: '缺少房间号' });
  if (!roomExists(roomId)) return res.status(404).json({ error: '房间不存在' });
  try {
    const op = db.registerOperator(name.trim(), roomId);
    broadcastAll({ type: 'active_operators', data: db.getActiveOperators() });
    res.json({ success: true, operator: op });
  } catch (e) {
    res.status(400).json({ error: e.message || '加入失败' });
  }
});

app.get('/api/operators', (req, res) => {
  res.json(db.getActiveOperators());
});

app.get('/api/state/:roomId', (req, res) => {
  if (!roomExists(req.params.roomId)) return res.status(404).json({ error: '房间不存在' });
  res.json(getRoom(req.params.roomId));
});

app.post('/api/state/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  if (!rooms.has(roomId)) return res.status(404).json({ error: '房间不存在' });
  const state = rooms.get(roomId);
  const update = sanitizeState(req.body);

  // 处理计时器
  if (req.body.timerRunning === true && !state.timerRunning) startMainTimer(roomId);
  if (req.body.timerRunning === false && state.timerRunning) stopMainTimer(roomId);
  if (req.body.shotClockRunning === true && !state.shotClockRunning) startShotClock(roomId);
  if (req.body.shotClockRunning === false && state.shotClockRunning) stopShotClock(roomId);

  Object.assign(state, update);
  db.saveRoomSnapshot(roomId, state);
  broadcastToRoom(roomId, { type: 'state', data: state });
  res.json({ success: true });
});

app.get('/api/operations/:roomId', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(db.getOperations(req.params.roomId, limit));
});

app.post('/api/timer/:roomId/start', (req, res) => {
  startMainTimer(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/timer/:roomId/stop', (req, res) => {
  stopMainTimer(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/timer/:roomId/reset', (req, res) => {
  stopMainTimer(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.timerSeconds = req.body.seconds || 600;
  const m = Math.floor(state.timerSeconds / 60).toString().padStart(2, '0');
  const s = (state.timerSeconds % 60).toString().padStart(2, '0');
  state.timeLeft = `${m}:${s}`;
  state.timerRunning = false;
  db.saveRoomSnapshot(req.params.roomId, state);
  broadcastToRoom(req.params.roomId, { type: 'state', data: state });
  res.json({ success: true });
});

app.post('/api/shotclock/:roomId/start', (req, res) => {
  startShotClock(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/shotclock/:roomId/stop', (req, res) => {
  stopShotClock(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/shotclock/:roomId/reset', (req, res) => {
  stopShotClock(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.shotClockSeconds = req.body.seconds || 24;
  state.shotClock = state.shotClockSeconds;
  state.shotClockRunning = false;
  db.saveRoomSnapshot(req.params.roomId, state);
  broadcastToRoom(req.params.roomId, { type: 'state', data: state });
  res.json({ success: true });
});

// ========== XML 数据源 ==========
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.get('/xml/:roomId', (req, res) => {
  const rid = req.params.roomId;
  if (!roomExists(rid)) return res.status(404).json({ error: '房间不存在' });
  const state = getRoom(rid);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scoreboard>
  <eventName>${escXml(state.eventName || '')}</eventName>
  <homeTeam>${escXml(state.homeTeam || '')}</homeTeam>
  <awayTeam>${escXml(state.awayTeam || '')}</awayTeam>
  <homeScore>${state.homeScore || 0}</homeScore>
  <awayScore>${state.awayScore || 0}</awayScore>
  <quarter>${state.quarter || 1}</quarter>
  <quarterName>${escXml((state.quarterNames || [])[state.quarter] || '')}</quarterName>
  <timeLeft>${state.timeLeft || '10:00'}</timeLeft>
  <shotClock>${state.shotClock != null ? state.shotClock : ''}</shotClock>
  <timerRunning>${!!state.timerRunning}</timerRunning>
  <homeColor>${state.homeColor || '#FF6B00'}</homeColor>
  <awayColor>${state.awayColor || '#0057A8'}</awayColor>
</scoreboard>`;
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  res.send(xml);
});

// ========== JSON 数据源 ==========
app.get('/json/:roomId', (req, res) => {
  const rid = req.params.roomId;
  if (!roomExists(rid)) return res.status(404).json({ error: '房间不存在' });
  const state = getRoom(rid);
  const jsonData = {
    eventName: state.eventName || '',
    homeTeam: state.homeTeam || '',
    awayTeam: state.awayTeam || '',
    homeScore: state.homeScore || 0,
    awayScore: state.awayScore || 0,
    quarter: state.quarter || 1,
    quarterName: (state.quarterNames || [])[state.quarter] || '',
    timeLeft: state.timeLeft || '10:00',
    timerRunning: !!state.timerRunning,
    shotClock: state.shotClock != null ? state.shotClock : '',
    shotClockRunning: !!state.shotClockRunning,
    homeColor: state.homeColor || '#FF6B00',
    awayColor: state.awayColor || '#0057A8',
  };
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  res.json(jsonData);
});

// ========== 启动 ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Basketball] 光为云篮球记分系统 v3.0 运行于端口 ${PORT}`);
});
