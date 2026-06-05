/**
 * server.js - 光为云足球记分系统 v5.2（安全加固+token鉴权）
 * 极简目录：静态文件与 server.js 同级，express.static(__dirname)
 */
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3004;
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

// ========== 足球分段封顶常量 ==========
const HALF_FIRST_CAP = 45 * 60;
const HALF_SECOND_CAP = 90 * 60;

function getCap(quarter) {
  if (quarter === 1) return HALF_FIRST_CAP;
  if (quarter === 3) return HALF_SECOND_CAP;
  return Infinity;
}

function formatTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const sec = (totalSec % 60).toString().padStart(2, '0');
  return h > 0 ? h + ':' + m + ':' + sec : m + ':' + sec;
}

// ========== 安全：字段白名单 ==========
const STATE_WHITELIST = [
  'eventName', 'homeTeam', 'awayTeam',
  'homeScore', 'awayScore', 'quarter',
  'homeColor', 'awayColor', 'barBg',
  'overlayVisible', 'show',
  'injuryDisplay', 'matchEnded'
];

function sanitizeState(data) {
  const clean = {};
  for (const key of STATE_WHITELIST) {
    if (key in data) clean[key] = data[key];
  }
  return clean;
}

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
        ws.send(JSON.stringify({ type: 'active_operators', data: db.getActiveOperators() }));
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
        // 写操作校验token
        if (state.roomToken && clientInfo.roomToken !== state.roomToken) return;
        const data = sanitizeState(msg.data || {});
        Object.assign(state, data);
        db.saveRoomSnapshot(roomId, state);
        const publicState = { ...state };
        delete publicState.roomToken;
        broadcastToRoom(roomId, { type: 'state', data: publicState }, ws);
        if (msg.action) {
          const name = String(msg.operatorName || '').slice(0, 50);
          const action = String(msg.action || '').slice(0, 100);
          const detail = String(msg.detail || '').slice(0, 200);
          db.logOperation(roomId, clientInfo.operatorId, name, action, detail);
          broadcastToRoom(roomId, { type: 'op_log', data: { ts: Date.now(), operatorName: name, action, detail } });
        }
      }
    } catch (e) {
      console.error('[WS msg error]', e.message);
    }
  });

  ws.on('close', () => { clients.delete(ws); });
});

// ========== 多房间状态 ==========
const rooms = new Map();

function createRoomState() {
  return {
    eventName: '足球联赛', homeTeam: '主队', awayTeam: '客队',
    homeScore: 0, awayScore: 0,
    quarter: 1,
    quarterNames: ['', '上半场', '中场休息', '下半场', '加时赛', '点球大战'],
    timeLeft: '00:00', timerRunning: false, timerSeconds: 0, timerCountUp: true,
    injuryDisplay: '', matchEnded: false,
    overlayVisible: true,
    homeColor: '#FF6B00', awayColor: '#0057A8',
    barBg: 'rgba(15,20,40,0.82)',
    show: { mainTimer: true, injuryTime: true, quarter: true },
    roomToken: crypto.randomBytes(12).toString('hex')
  };
}

function roomExists(roomId) {
  if (rooms.has(roomId)) return true;
  return db.loadRoomSnapshot(roomId) !== null;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    const snapshot = db.loadRoomSnapshot(roomId);
    if (snapshot) {
      const age = Math.round((snapshot._snapshotAge || 0) / 60000);
      console.log('[Room ' + roomId + '] 恢复快照（' + age + '分钟前）');
      delete snapshot._snapshotAge;
      if (snapshot.timerRunning) snapshot.timerRunning = false;
      if (!snapshot.show) snapshot.show = { mainTimer: true, injuryTime: true };
      if (!snapshot.timerCountUp) { snapshot.timerSeconds = 0; snapshot.timeLeft = '00:00'; }
      snapshot.timerCountUp = true;
      if (typeof snapshot.injuryDisplay === 'undefined') snapshot.injuryDisplay = '';
      if (typeof snapshot.matchEnded === 'undefined') snapshot.matchEnded = false;
      if (!snapshot.show.quarter) snapshot.show.quarter = true;
      if (!snapshot.roomToken) snapshot.roomToken = crypto.randomBytes(12).toString('hex');
      delete snapshot.shotClock; delete snapshot.shotClockRunning;
      delete snapshot.shotClockSeconds; delete snapshot.injuryTime;
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
  }
  roomTimers.set(roomId, { mainInterval: null });
}

function startMainTimer(roomId) {
  const rt = roomTimers.get(roomId) || {};
  if (rt.mainInterval) return;
  const state = getRoom(roomId);
  if (state.matchEnded) return;
  state.timerRunning = true;
  rt.mainInterval = setInterval(() => {
    const s = getRoom(roomId);
    const cap = getCap(s.quarter);
    if (s.timerSeconds >= cap) {
      stopMainTimer(roomId);
      broadcastToRoom(roomId, { type: 'state', data: s });
      db.saveRoomSnapshot(roomId, s);
      return;
    }
    s.timerSeconds++;
    s.timeLeft = formatTime(s.timerSeconds);
    broadcastToRoom(roomId, { type: 'state', data: s });
    db.saveRoomSnapshot(roomId, s);
  }, 1000);
  roomTimers.set(roomId, rt);
}

function stopMainTimer(roomId) {
  const rt = roomTimers.get(roomId);
  if (rt && rt.mainInterval) { clearInterval(rt.mainInterval); rt.mainInterval = null; }
  const state = getRoom(roomId);
  state.timerRunning = false;
}

// ========== API 路由 ==========
app.post('/api/register', (req, res) => {
  const { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: '请填写姓名和房间号' });
  if (!name.trim()) return res.status(400).json({ error: '姓名不能为空' });
  if (!/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: '房间号必须为4位数字' });
  try {
    const op = db.registerOperator(name, String(pin));
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

// ========== v4.0+ 房间API ==========
const CHARSET = 'abcdefghijkmnpqrstuvwxyz23456789';
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
  if (req.body.timerRunning === true && !state.timerRunning) startMainTimer(roomId);
  if (req.body.timerRunning === false && state.timerRunning) stopMainTimer(roomId);
  Object.assign(state, update);
  db.saveRoomSnapshot(roomId, state);
  broadcastToRoom(roomId, { type: 'state', data: state });
  res.json({ success: true });
});

app.get('/api/operations/:roomId', (req, res) => {
  res.json(db.getOperations(req.params.roomId, parseInt(req.query.limit) || 50));
});

// 计时器控制
app.post('/api/timer/:roomId/start', (req, res) => {
  if (!rooms.has(req.params.roomId)) return res.status(404).json({ error: '房间不存在' });
  startMainTimer(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/timer/:roomId/stop', (req, res) => {
  if (!rooms.has(req.params.roomId)) return res.status(404).json({ error: '房间不存在' });
  stopMainTimer(req.params.roomId);
  res.json({ success: true });
});

app.post('/api/timer/:roomId/reset', (req, res) => {
  stopMainTimer(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.timerSeconds = req.body.seconds || 0;
  state.timeLeft = formatTime(state.timerSeconds);
  state.timerRunning = false;
  db.saveRoomSnapshot(req.params.roomId, state);
  broadcastToRoom(req.params.roomId, { type: 'state', data: state });
  res.json({ success: true });
});

// 下半场切换（修复：quarter应设为3而非2）
app.post('/api/timer/:roomId/secondHalf', (req, res) => {
  stopMainTimer(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.timerSeconds = HALF_FIRST_CAP;
  state.timeLeft = '45:00';
  state.timerRunning = false;
  state.quarter = 3; // 下半场=3（此前错误设为2/中场休息）
  state.injuryDisplay = '';
  db.saveRoomSnapshot(req.params.roomId, state);
  broadcastToRoom(req.params.roomId, { type: 'state', data: state });
  res.json({ success: true });
});

app.post('/api/timer/:roomId/endMatch', (req, res) => {
  stopMainTimer(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.timerRunning = false;
  state.matchEnded = true;
  db.saveRoomSnapshot(req.params.roomId, state);
  broadcastToRoom(req.params.roomId, { type: 'state', data: state });
  res.json({ success: true });
});

app.post('/api/timer/:roomId/newMatch', (req, res) => {
  stopMainTimer(req.params.roomId);
  const state = getRoom(req.params.roomId);
  state.timerSeconds = 0; state.timeLeft = '00:00';
  state.timerRunning = false; state.matchEnded = false;
  state.quarter = 1; state.injuryDisplay = '';
  state.homeScore = 0; state.awayScore = 0;
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
  const qNames = ['', '上半场', '中场休息', '下半场', '加时赛', '点球大战'];
  const periodName = qNames[state.quarter] || '上半场';
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<scoreboard>\n' +
    '  <eventName>' + escXml(state.eventName || '') + '</eventName>\n' +
    '  <homeTeam>' + escXml(state.homeTeam || '') + '</homeTeam>\n' +
    '  <awayTeam>' + escXml(state.awayTeam || '') + '</awayTeam>\n' +
    '  <homeScore>' + (state.homeScore || 0) + '</homeScore>\n' +
    '  <awayScore>' + (state.awayScore || 0) + '</awayScore>\n' +
    '  <quarter>' + (state.quarter || 1) + '</quarter>\n' +
    '  <quarterName>' + escXml(periodName) + '</quarterName>\n' +
    '  <timeLeft>' + (state.timeLeft || '00:00') + '</timeLeft>\n' +
    '  <injuryTime>' + escXml(state.injuryDisplay || '') + '</injuryTime>\n' +
    '  <timerRunning>' + (!!state.timerRunning) + '</timerRunning>\n' +
    '  <homeColor>' + (state.homeColor || '#FF6B00') + '</homeColor>\n' +
    '  <awayColor>' + (state.awayColor || '#0057A8') + '</awayColor>\n' +
    '</scoreboard>';
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  res.send(xml);
});

app.get('/json/:roomId', (req, res) => {
  const rid = req.params.roomId;
  if (!roomExists(rid)) return res.status(404).json({ error: '房间不存在' });
  const state = getRoom(rid);
  const qNames = ['', '上半场', '中场休息', '下半场', '加时赛', '点球大战'];
  const jsonData = {
    eventName: state.eventName || '',
    homeTeam: state.homeTeam || '', awayTeam: state.awayTeam || '',
    homeScore: state.homeScore || 0, awayScore: state.awayScore || 0,
    quarter: state.quarter || 1,
    quarterName: qNames[state.quarter] || '上半场',
    timeLeft: state.timeLeft || '00:00', timerRunning: !!state.timerRunning, timerCountUp: true,
    injuryTime: state.injuryDisplay || '',
    homeColor: state.homeColor || '#FF6B00', awayColor: state.awayColor || '#0057A8',
  };
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-cache');
  res.json(jsonData);
});

// ========== 启动 ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('[Football] 光为云足球记分系统 v5.1 运行于端口 ' + PORT);
});
