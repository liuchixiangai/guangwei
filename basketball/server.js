/**
 * server.js - 光为云篮球记分系统 v3.0（重建版）
 * 极简目录：静态文件与 server.js 同级，express.static(__dirname)
 */
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const db = require('./db');

const PORT = 3002;
const app = express();
const server = http.createServer(app);

// ★ 关键：静态文件与 server.js 同级，不再用 public/ 子目录
app.use(express.json());
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
        const state = getRoom(roomId);
        const data = msg.data || {};
        // 在 Object.assign 之前检测计时器状态变化，避免被覆盖后无法触发
        const timerRunningChanged = data.timerRunning !== undefined && data.timerRunning !== state.timerRunning;
        const shotClockRunningChanged = data.shotClockRunning !== undefined && data.shotClockRunning !== state.shotClockRunning;
        // 合并更新
        Object.assign(state, data);
        // 根据变化前检测的结果触发计时器
        if (timerRunningChanged) {
          if (data.timerRunning) startMainTimer(roomId);
          else stopMainTimer(roomId);
        }
        if (shotClockRunningChanged) {
          if (data.shotClockRunning) startShotClock(roomId);
          else stopShotClock(roomId);
        }
        db.saveRoomSnapshot(roomId, state);
        broadcastToRoom(roomId, { type: 'state', data: state }, ws);
        // 记录操作
        if (msg.action) {
          db.logOperation(roomId, clientInfo.operatorId, msg.operatorName || '', msg.action, msg.detail || '');
          // 广播操作日志给房间内所有人（包括操作者）
          broadcastToRoom(roomId, {
            type: 'op_log',
            data: {
              ts: Date.now(),
              operatorName: msg.operatorName || '',
              action: msg.action,
              detail: msg.detail || ''
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
    show: { mainTimer: true, shotClock: true }
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
      rooms.set(roomId, snapshot);
    } else {
      rooms.set(roomId, createRoomState());
    }
    initRoomTimer(roomId);
  }
  return rooms.get(roomId);
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
    res.json({ success: true, roomId, operator: op });
  } catch (e) {
    res.status(400).json({ error: e.message || '创建失败' });
  }
});

app.post('/api/room/join', (req, res) => {
  const { name, roomId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写姓名' });
  if (!roomId) return res.status(400).json({ error: '缺少房间号' });
  try {
    // 确保房间存在
    getRoom(roomId);
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
  const state = getRoom(req.params.roomId);
  res.json(state);
});

app.post('/api/state/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const state = getRoom(roomId);
  const update = req.body;

  // 处理计时器
  if (update.timerRunning === true && !state.timerRunning) startMainTimer(roomId);
  if (update.timerRunning === false && state.timerRunning) stopMainTimer(roomId);
  if (update.shotClockRunning === true && !state.shotClockRunning) startShotClock(roomId);
  if (update.shotClockRunning === false && state.shotClockRunning) stopShotClock(roomId);

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
  const state = getRoom(req.params.roomId);
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
  const state = getRoom(req.params.roomId);
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
