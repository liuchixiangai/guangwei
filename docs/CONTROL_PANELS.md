# 光为云篮球 + 足球控制面板 — 完整开发文档

> **版本**: v5.x（篮球）/ v5.5（足球）  
> **日期**: 2026-06-12  
> **技术栈**: 纯 HTML/CSS/JS + WebSocket + REST API  
> **部署**: Express 静态文件服务 + WS 服务端时钟

---

## 一、篮球控制面板（basketball/admin.html）

### 1.1 文件概述

| 项目 | 说明 |
|------|------|
| 行数 | 997 行 |
| 入口方式 | URL 驱动：`?room=xxxxxx`（接班）或 无参数（创建新房间） |
| 房间ID | 6 位字母数字（排除 0/O/1/l/I） |
| 核心协议 | WebSocket（`/` 路径） + REST API 辅助 |

### 1.2 全局变量

```javascript
let roomId = '';           // 当前房间号（6位）
let currentRoomToken = ''; // 房间鉴权 token（24位hex）
let currentOp = null;      // 当前操作员 {id, name}
let ws = null;             // WebSocket 实例
let wsPingTimer = null;    // 心跳定时器（25秒间隔）
let state = {};            // 本地状态缓存
let shotWasRunningBeforePause = false;  // 比赛暂停前24秒是否运行
let opLogs = [];           // 操作日志（最多100条，12小时清理）
const LS_KEY = 'bs-v4';    // localStorage 键名
```

### 1.3 入口逻辑（doEntry）

```
┌─ 页面加载
│
├─ URL 有 ?room=xxx
│   └─ "接力模式"：输入姓名 → POST /api/room/join → enterMain()
│     如果 localStorage 有同房间记录 → 跳过输入直接进入
│
├─ URL 无参数
│   └─ "创建模式"：输入姓名 → POST /api/room/create
│     返回 {roomId, roomToken} → URL 跳转 ?room=xxx&token=xxx
│     如果 localStorage 有上次记录 → 显示"返回房间"链接
│
└─ enterMain()
   ├─ 隐藏入口层，显示主界面
   ├─ 显示操作员头像和姓名
   ├─ connectWS() → WebSocket 连接
   └─ loadState() → REST API 加载初始状态
```

### 1.4 WebSocket 通信

```
连接: new WebSocket(ws://host/)
心跳: 每 25 秒发送 {type:'ping'}，服务端回复 {type:'pong'}
join: {type:'join', roomId, roomToken, operatorId}
update:{type:'update', data, action, operatorName, detail}

接收:
  {type:'state', data}  → applyState(data)
  {type:'op_log', data} → appendLog(data)

断线重连: 3 秒自动重试
```

### 1.5 状态管理（applyState）

状态字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| eventName | string | "篮球联赛" | 赛事名称 |
| homeTeam | string | "自定义主队" | 主队队名（≤8字符） |
| awayTeam | string | "自定义客队" | 客队队名（≤8字符） |
| homeScore | number | 0 | 主队分数 |
| awayScore | number | 0 | 客队分数 |
| quarter | number | 1 | 当前节数（1-5） |
| quarterNames | array | ["","第1节"...] | 节名映射 |
| timeLeft | string | "10:00" | 比赛剩余时间 |
| timerRunning | boolean | false | 比赛计时是否运行 |
| timerSeconds | number | 600 | 计时器秒数 |
| shotClock | number | 24 | 进攻计时 |
| shotClockRunning | boolean | false | 进攻计时是否运行 |
| shotClockSeconds | number | 24 | 进攻计时秒数 |
| homeColor | string | "#FF6B00" | 主队色 |
| awayColor | string | "#0057A8" | 客队色 |
| barBg | string | "rgba(...)" | 底框背景色 |
| show | object | {mainTimer:true, shotClock:true} | 模块显隐 |

applyState 执行步骤：
```
1. 记录旧比分 → 对比触发 bump 动画
2. 更新队名/比分/计时器 DOM
3. 更新"开始/暂停"按钮文字和颜色
4. 更新小节按钮 active 状态
5. 更新模块开关按钮状态和标签
6. 根据 show.shotClock 控制 24 秒列显隐
7. 同步颜色选择器 value
```

### 1.6 角色颜色系统

```css
:root {
  --primary: #FF6B00;  /* 主色调（橙） */
  --blue:   #0057A8;   /* 辅助蓝 */
  --bg:     #0f1428;   /* 深蓝背景 */
  --bg2:    #1a2040;   /* 卡片背景 */
  --bg3:    #232b50;   /* 暗按钮背景 */
  --green:  #00c853;   /* 开始/加分 */
  --red:    #ff3d3d;   /* 暂停/减分 */
  --gold:   #FFD700;   /* 24秒按钮 */
}
```

### 1.7 计时器系统（FIBA 规则）

#### 主计时器（倒计时）

| 按钮 | 函数 | 行为 |
|------|------|------|
| **开始** | `toggleTimer()` | 倒计时开始，24秒同步恢复 |
| **暂停** | `toggleTimer()` | 倒计时暂停，24秒同步暂停 |
| **重置** | `resetTimer()` | 重置到自定义秒数（默认600=10:00），POST /api/timer/xxx/reset |
| **设时** | `setCustomTimer()` | prompt 输入分钟数（1-99），重置到该时长 |
| **加时5:00** | `resetTimerOT()` | 重置到 300 秒（5:00） |

**关键状态**: `shotWasRunningBeforePause` 
- 比赛暂停时记录 24 秒是否在运行
- 比赛恢复时自动恢复 24 秒状态

#### 进攻计时器（24秒）

| 按钮 | 函数 | 行为 |
|------|------|------|
| **24s 回表** | `shotReset24()` | 重置到 24 秒 + 自动启动 |
| **14s 回表** | `shotReset14()` | 重置到 14 秒 + 自动启动 |
| **暂停/继续** | `shotTogglePause()` | 切换运行/暂停 |

**回表行为**: 先 POST reset → 再 POST start，保证服务端一致

### 1.8 加减分（乐观更新）

```
changeScore(side, delta) {
  1. 本地立即修改 state[side+'Score']
  2. 立即更新 DOM + bump 动画（scale:1.15, 150ms）
  3. WS 异步发送 {homeScore/awayScore: val}
}
```

### 1.9 小节切换

5 个按钮：第1节/第2节/第3节/第4节/加时 → `setQuarter(q)`
- 乐观更新本地 state + DOM active 样式
- WS 广播 `{quarter: q}`

### 1.10 模块显隐

3 个开关：📋小节 / ⏱大计时器 / 🎯24秒

```
toggleMod(mod) {
  1. 翻转 state.show[mod]
  2. 更新按钮 on/off 样式 + 标签文字
  3. shotClock 特殊：直接控制 DOM 显示
  4. WS 广播 {show: {...}}
}
```

### 1.11 队伍颜色编辑

- `homeColor` / `awayColor`: `<input type="color">` picker
- `barBg`: 底框颜色。输入纯 HEX（如 `#ff0000`）→ 自动转为 `rgba(r,g,b,0.85)`
- WS 实时广播颜色变化

### 1.12 队名编辑

- `contenteditable="true"` div，最大 8 字符
- keydown 拦截超长输入（允许 Backspace/Delete/方向键）
- blur 时校验 → 空值恢复默认文本 → 有变化发 WS

### 1.13 分享系统

#### 分享弹窗（3 Tab）

| Tab | 链接 | 用途 |
|-----|------|------|
| 🏠 透明网页 | `/view.html?room=xxx` | OBS/vMix Browser Source 叠加层 |
| 📺 投屏 | `/cast.html?room=xxx` | 大屏全屏展示 |
| 🔗 多人计分 | `/admin.html?room=xxx&token=xxx` | 其他裁判接力操作 |

#### 数据源弹窗（2 Tab）

| Tab | 链接 | 用途 |
|-----|------|------|
| 📋 JSON | `/json/xxx` | vMix Data Source 轮询 |
| 📄 XML | `/xml/xxx` | 芯象数据源导入 |

实时预览功能：
- `updateJsonPreview()`: 基于当前 state 生成完整 JSON
- `updateXmlPreview()`: 生成 XML 字符串

### 1.14 操作日志

- 服务端通过 WS 广播 `{type:'op_log', data:{ts, operatorName, action, detail}}`
- 前端最多保留 100 条，超过 12 小时自动清除
- DOM 操作使用 `createElement/textContent`（XSS 安全）
- 渲染格式: `[时间] [操作员] [操作内容]`

### 1.15 mobile 适配

- max-width: 480px（居中容器）
- viewport: `user-scalable=no`
- 按钮最小 44px（触控友好）
- Color picker 32×28px
- Toast 使用 `env(safe-area-inset-top)` 适配刘海屏

---

## 二、足球控制面板（football/admin.html）

### 2.1 与篮球的区别

| 特性 | 篮球 | 足球 |
|------|------|------|
| 计时方式 | 倒计时（10:00→0） | **正计时**（0→∞） |
| 进攻计时 | 24 秒 / 14 秒 | 无 |
| 比赛阶段 | 5 节（1-4 + 加时） | **5 阶段**（上半场/中场/下半场/加时/点球） |
| 伤停补时 | 无 | **有**（adjust→confirm→cancel 三步流程） |
| 重置行为 | 回到初始时长 | 回到 00:00 |
| 设时操作 | 自定义分钟数 | 无（正计时不需要） |
| 结束/新比赛 | 无 | **有**（新比赛/比赛结束按钮） |

### 2.2 独有的全局变量

```javascript
let pendingInjury = 0;  // 待确认的补时分钟数
const qNames = ['', '上半场', '中场休息', '下半场', '加时赛', '点球大战'];
```

### 2.3 计时器（正计时）

```
toggleTimer():
  开始 → timerSeconds 从 0 开始累加，每秒钟 +1
  暂停 → 停止累加
  重置 → timerSeconds = 0, timeLeft = '00:00'

服务端实现（server.js）:
  setInterval 每秒递增 timerSeconds
  格式: MM:SS（无上限，可超过 99:59）
```

### 2.4 比赛阶段（足球特有）

5 个按钮对应 5 个阶段：
```
上半场(q=1) → 中场休息(q=2) → 下半场(q=3) → 加时赛(q=4) → 点球大战(q=5)
```

`setQuarter(q)`: 乐观更新 + WS 广播，与篮球完全相同的逻辑。

**注意**: 这只是改变显示标签，不影响计时器。计时器始终是正计时，不会因为阶段切换而重置。

### 2.5 伤停补时（足球独有功能）

```
adjustInjury(mins) → 累加 pendingInjury（设置待确认的补时分钟数）
confirmInjury()   → 确认补时 → WS 广播 {injuryTime, injuryConfirmed:true}
cancelInjury()    → 取消补时 → WS 广播 {injuryTime:0, injuryConfirmed:false}

显示逻辑:
  ┌─ 未启用:       补时区显示 "+0"，状态"未启用"
  ├─ 待确认:       补时区显示 "+N"，状态"待确认：N 分钟"
  └─ 已确认:       补时区显示 "+N"，状态"已确认 N 分钟"
```

### 2.6 模块显隐

3 个开关（与篮球类似但不同模块）：
- ⏱ 计时器（`mainTimer`）
- 🤕 补时（`injuryTime`）
- 📋 半场（`quarter`）

`toggleMod(mod)`: 与篮球相同的乐观更新逻辑。

### 2.7 队伍颜色

足球使用预设颜色（非 color picker）：

```
主队可选颜色:
  #FF6B00(橙) #E53935(红) #1E88E5(蓝) #43A047(绿)
  #8E24AA(紫) #FDD835(黄) #00ACC1(青)

客队可选颜色:
  #0057A8(深蓝) #1B5E20(深绿) #37474F(灰) #FF8F00(琥珀)
  #D32F2F(深红) #283593(靛蓝) #6A1B9A(深紫)
```

`setTeamColor(side, color)`: 更新颜色条 DOM + WS 广播。

### 2.8 足球独有操作按钮

| 按钮 | 函数 | 说明 |
|------|------|------|
| 📋 上半场 | `setQuarter(1)` | 显示"上半场"标签 |
| ⏸️ 中场 | `setQuarter(2)` | 显示"中场休息" |
| 📋 下半场 | `setQuarter(3)` | 显示"下半场"，常用快捷跳转 |
| ⏱️ 加时 | `setQuarter(4)` | 显示"加时赛" |
| ⚽ 点球 | `setQuarter(5)` | 显示"点球大战" |
| 🏁 比赛结束 | `endMatch()` | 停止计时器 |
| 🔄 新比赛 | `newMatch()` | 重置所有数据（比分→0，计时→00:00） |
| 🤕 +1 分钟 | `adjustInjury(1)` | 累加 1 分钟待确认补时 |
| ✅ 确认 | `confirmInjury()` | 确认补时 |
| ❌ 取消 | `cancelInjury()` | 取消补时 |

### 2.9 操作日志（增强版）

足球的操作日志比篮球更详细：

| action | 展示文本 |
|--------|---------|
| `home_score` | 🏠 主队得分 |
| `away_score` | ✈️ 客队得分 |
| `quarter` | 📋 半场切换 |
| `home_name` | 🏠 主队改名 |
| `away_name` | ✈️ 客队改名 |
| `home_color` | 🎨 主队颜色 |
| `away_color` | 🎨 客队颜色 |
| `injury_time` | 🤕 补时 |
| `toggle_mainTimer` | ⏱ 计时器显隐 |
| `toggle_injuryTime` | 🤕 补时显隐 |
| `toggle_quarter` | 📋 半场显隐 |
| `timer` | ⏱ 计时器 |

---

## 三、共享架构模式

### 3.1 房间生命周期

```
1. 创建房间: POST /api/room/create {name} → {roomId, roomToken, operator}
2. 加入房间: POST /api/room/join {roomId, name} → {operator}
3. WebSocket 连接: join 消息携带 roomToken → 写操作鉴权
4. localStorage 持久化: {roomId, roomToken, operator, name}
5. 退出: 清空 localStorage → 回到入口页
```

### 3.2 乐观更新模式

所有操作遵循相同模式：
```
1. 本地立即修改 state
2. 立即更新 DOM（比分动画/按钮状态）
3. 异步 WS 广播给服务端 + 其他客户端
4. 服务端 timer callback 会推送最新 state（覆盖本地）
```

### 3.3 Token 鉴权机制

```
房间创建时: roomToken = crypto.randomBytes(12).toString('hex')
返回给创建者: API 响应 + URL 参数
存储在: localStorage → WS join → WS update 携带

服务端校验:
  GET  /api/state/:id → 公开（不含 token）
  POST 写操作        → 校验 token（query/body/header 三选一）
  WS update 消息     → 校验 clientInfo.roomToken === state.roomToken
```

### 3.4 localStorage 恢复

```
篮球: 键名 'bs-v4'
足球: 相同模式

包含: {roomId, roomToken, operator, name}
入口检测:
  - 有 URL ?room=xxx: 匹配 saved.roomId 则自动进入
  - 无 URL 参数: 显示"上次房间仍在 → 返回房间"链接
```

### 3.5 分享链接生成

```
透明网页 (OBS):  {origin}/view.html?room={roomId}
投屏链接:        {origin}/cast.html?room={roomId}
多人计分（接力）:{origin}/admin.html?room={roomId}&token={roomToken}
JSON 数据源:     {origin}/json/{roomId}
XML 数据源:      {origin}/xml/{roomId}
```

> **关键**: 观看链接（view/cast）不带 token，接力链接带 token。

---

## 四、目录文件清单

### 篮球板块 (`basketball/`)
```
admin.html    ← 控制面板（本文档详细描述）
view.html     ← OBS 透明叠加层（1920×1080, 透明度 inherit）
cast.html     ← 投屏专用页（16:9, 深蓝渐变, 不透明）
server.js     ← Express + WebSocket 服务端（端口 3002）
db.js         ← SQLite 持久化（房间快照 + 操作日志）
package.json  ← 依赖: express, ws, better-sqlite3, cors
```

### 足球板块 (`football/`)
```
admin.html    ← 控制面板（本文档详细描述）
view.html     ← OBS 透明叠加层
cast.html     ← 投屏专用页（深绿渐变）
server.js     ← Express + WebSocket 服务端（端口 3004）
db.js         ← SQLite 持久化
package.json  ← 依赖: express, ws, better-sqlite3
```

---

## 五、服务端关键逻辑

### 5.1 每房间独立计时器

```javascript
// 每个 roomId 独立的 setInterval
roomTimers.set(roomId, { mainInterval, shotInterval })

startMainTimer(roomId) {
  rt.mainInterval = setInterval(() => {
    s.timerSeconds--;  // 篮球: 倒计时
    // 或
    s.timerSeconds++;  // 足球: 正计时
    broadcastToRoom(roomId, { type: 'state', data: s });
    db.saveRoomSnapshot(roomId, s);
  }, 1000);
}
```

### 5.2 状态白名单

```javascript
const STATE_WHITELIST = [
  'eventName','homeTeam','awayTeam','homeScore','awayScore',
  'quarter','homeColor','awayColor','barBg','overlayVisible','show'
];
// sanitizeState() 过滤不在白名单的字段
```

### 5.3 房间快照持久化

- 每次状态变更自动 `db.saveRoomSnapshot(roomId, state)`
- 房间首次访问时 `db.loadRoomSnapshot(roomId)` 恢复
- 超过 12 小时的快照自动清理
- 恢复时强制 `timerRunning = false`（安全）

---

## 六、重建检查清单

### 篮球
- [ ] 入口：无 URL → 创建房间；有 URL → 接力加入
- [ ] localStorage 记忆上次房间
- [ ] WebSocket 连接/重连/心跳
- [ ] 队名 contenteditable 编辑（8 字符限制）
- [ ] 主计时器：开始/暂停/重置/设时(1-99分)/加时5:00
- [ ] 24秒：回表24/回表14/暂停-继续
- [ ] 比赛暂停时 24 秒同步暂停，比赛恢复时 24 秒同步恢复
- [ ] 加减分乐观更新 + bump 动画
- [ ] 小节切换 Q1-Q5
- [ ] 模块开关（小节/大计时器/24秒）
- [ ] 队伍颜色 color picker + barBg 自动转 rgba
- [ ] 分享弹窗 3 Tab + 数据源弹窗 2 Tab
- [ ] 操作日志最多 100 条，12 小时清理
- [ ] Token 鉴权（接力链接含 token，观看链接不含）

### 足球
- [ ] 入口流程同上
- [ ] **正计时**（从 00:00 向上，无上限）
- [ ] 比赛阶段 5 选（上半场/中场/下半场/加时/点球）
- [ ] **伤停补时三步流程**：adjust → confirm → cancel
- [ ] 补时状态显示：未启用/待确认/已确认
- [ ] 模块开关（计时器/补时/半场）
- [ ] 预设队名颜色（7 色按钮）
- [ ] 加减分乐观更新
- [ ] 操作日志（含 action→emoji 映射）
- [ ] 分享/数据源/Token 鉴权同上
