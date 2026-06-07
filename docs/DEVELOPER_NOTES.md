# DEVELOPER_NOTES.md — 开发生存指南

> **写给未来接手这个项目的你**。这里记录的不是代码文档（那些在代码里），而是"为什么这么做"、"哪里会要命"、"改什么之前先读哪里"。口语化，说人话。

---

## 1. 项目速览：三个孪生兄弟

这个仓库实际上包含**三个独立但高度相似**的 Node.js 子应用：

| 子应用 | 端口 | 目录 | 特点 |
|--------|------|------|------|
| 篮球记分板 | 3002 | `basketball-score/public/` | 倒计时 + 进攻24秒 |
| 足球记分板 | 3001 | `basketball-score/football/` | 正计时 + 上下半场 |
| 人名条(namebar) | 3003? | 已不在本仓库 | 字幕叠加，vMix兼容 |

它们**共享完全相同的架构模式**（Express + WebSocket + better-sqlite3），但各有各的 server.js 和 db.js。**没有共享代码**——是复制粘贴演化的三个版本。这意味着修一个Bug时，记得检查另外两个是否需要同样修复。

---

## 2. "为什么这样设计？"——关键设计决策

### 2.1 为什么不用 Redis，而用 SQLite？

**答案**：部署简单。这个系统跑在一台 2GB 内存的 VPS 上，同时跑着 Nginx、PM2、两个 Node 进程、WordPress。再加一个 Redis 进程内存就爆了。SQLite 用 WAL 模式，对于"每1秒写一次快照、偶尔查几条操作记录"这种负载完全够用。

> ⚠️ **代价**：SQLite 是文件锁，不是连接池。如果有一天你想加一个后台管理面板同时大量读写，可能会遇到 SQLITE_BUSY。目前单进程访问没问题。

### 2.2 为什么 server.js 里同时有 REST API 和 WebSocket？

**答案**：这是演进的结果。早期版本只有 REST API（HTTP 轮询），后来为了实时性加了 WebSocket 广播，但 REST API 作为写操作的入口保留了下来。目前：

- **REST API**：负责写操作（改分、计时器控制、重置等）。HTTP 请求过来→改状态→写 SQLite→WebSocket 广播。
- **WebSocket**：负责实时广播。客户端通过 WS 接收 `state`、`operation_log`、`room_info` 消息。

> 💡 **V4.0+ 之后**：前端增加了乐观更新——点击按钮时立即本地更新 UI，同时发 WS 命令给服务端。这是为了解决操作卡顿（HTTP 往返 200-500ms 体感很明显）。所以现在**部分写操作走 WS 的 update 消息**，服务端 server.js 里也支持 WS 消息触发 start/stop 计时器。

### 2.3 为什么 namebar 有双路由挂载？

```javascript
mountNamebarRoutes('');          // 匹配 /
mountNamebarRoutes('/namebar');  // 匹配 /namebar/
```

**答案**：因为 Nginx。Nginx 配置里 `/namebar/` 路径被 proxy_pass 到 namebar 的端口，此时 Express 收到的 `req.url` 会带 `/namebar/` 前缀。但本地开发时直接访问 `localhost:3003/` 没有前缀。双路由兼容两种场景。

> ⚠️ **不要删掉任何一个挂载**。删了之后要么本地开发404，要么线上404。

### 2.4 为什么 roomToken 使用 crypto.randomBytes(12)？

**答案**：12字节 = 24个十六进制字符，碰撞概率 ≈ 2^-96，对于几百个房间来说够用了。选择十六进制而不是 base64 是因为 URL 友好，不需要做 encodeURIComponent。

### 2.5 roomToken 只在创建/加入时返回，不在 GET /api/state 里返回？

**答案**：血的教训。最初 `GET /api/state/:roomId` 直接返回完整 state 对象（包含 roomToken），这意味着**任何人只要知道房间号就能拿到 token**，然后冒充操作员。修复方案：返回前 `delete state.roomToken`。

> ⚠️ **永远不要在只读 API 里返回 token**。如果 future 你要加新的 GET 端点，记住这个坑。

---

## 3. 哪些代码不能轻易改

### 3.1 🔴 高敏感：安全中间件

```javascript
app.use((req, res, next) => {
  if (/\.(db|sqlite|sqlite3|json)$/i.test(req.path)) return res.status(403).send('Forbidden');
  if (/\.db-(wal|shm|journal)$/i.test(req.path)) return res.status(403).send('Forbidden');
  next();
});
```

这段代码看起来简单，但它**防住了整条 SQLite 数据库被公开下载的严重漏洞**。三种情况会触发问题：

1. 你加了新的数据库文件扩展名（比如 `.sqlite` 已经在列表里，但万一你换了别的后缀）
2. 你加了新的 JSON 配置文件路由（`/api/config.json`）
3. 你改了静态文件目录使数据库文件暴露在 public 下

> ⚠️ **如果你要加新的文件类型或调整静态目录结构，先检查这个中间件**。

### 3.2 🔴 高敏感：namebar/view.html 的 vMix 兼容

namebar 的 `view.html` 里**不能使用以下 CSS 属性**：
- `backdrop-filter`
- `text-shadow`（在某些场景下）
- `transform`（某些情况下渲染异常）
- CSS 自定义属性（`var(--xxx)`）在某些旧 Chromium 里不支持

**不能使用以下 JavaScript 语法**：
- 箭头函数 `() => {}`
- `const` / `let`（只能用 `var`）
- 模板字符串 `` `${}` ``
- `fetch()`（用 XHR 替代）
- `Array.from()`、`Object.assign()` 等 ES6 方法

**原因**：vMix 内置的 Chromium 版本非常老旧（大概相当于 Chrome 50-55 的水平），这些新特性全不支持。修 namebar view.html 的时候，**写完代码先在 vMix 里实测**，不要相信本地 Chrome 浏览器的表现。

> 💡 **经验法则**：所有 CSS 只用基础属性，所有 JS 用 ES5 语法。如果你不确定某个特性能不能用，答案大概率是"不能用"。

### 3.3 🟡 中敏感：WebSocket 心跳机制

```javascript
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
```

30秒间隔的心跳，配合 Nginx 的 proxy_read_timeout（通常是 60-90 秒）。**不要随意改这个间隔**。如果改为 >60 秒，Nginx 可能在 WS 连接还活着时就把连接断了。如果改为 <10 秒，在微信内置浏览器等弱网环境会增加不必要的断连。

### 3.4 🟡 中敏感：SQLite WAL 模式

```javascript
db.pragma('journal_mode = WAL');
```

**不要改成 DELETE 或 TRUNCATE 模式**。WAL 模式对这个场景是必须的：
- 写操作不阻塞读操作（计时器每秒写一次，同时可能有客户端在读状态）
- 并发性能比默认的 DELETE 模式好很多

但 WAL 的代价是：
- `.db-wal` 和 `.db-shm` 文件必须存在且不被拦截（见上面的中间件）
- 备份时必须**三个文件一起备份**（.db + .db-wal + .db-shm），否则数据不完整
- 长时间运行后 WAL 文件会膨胀（见后文坑记录）

---

## 4. 最容易出 Bug 的地方

### 4.1 计时器状态机

这是整个系统最复杂的状态管理。

**篮球**：
- 主计时器：倒计时，从设定时间往下减，归零自动停止
- 进攻计时器：倒计时，默认24秒，独立启停
- 两个计时器**完全独立**，但共享 `roomTimers` Map
- 当主计时器归零时，进攻计时器**不会自动停止**——这是个设计选择，不是Bug

**最容易出现的Bug**：
1. **停止后无法重新开始**：`startRoomTimer` 检查 `if (rt.mainInterval) return;`——如果 clearInterval 没把引用置 null，start 就无效。确保 stop 时 `rt.mainInterval = null`
2. **setInterval 累积**：每次 start 都创建新的 interval，但如果之前的没清掉，会出现多个 interval 同时跑，计时器跳得飞快。`initRoomTimer` 里做了清理，但 `resetShotClock` 只调了 `stopShotClock` 再改值——这是安全的

### 4.2 房间状态快照恢复

```javascript
function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    const snapshot = db.loadRoomSnapshot(roomId);
    if (snapshot) {
      // 恢复后强制停止计时器
      if (snapshot.timerRunning) snapshot.timerRunning = false;
      // 确保 show 对象存在（旧快照可能没有）
      if (!snapshot.show) snapshot.show = { mainTimer: true, shotClock: true };
      rooms.set(roomId, snapshot);
    }
    // ...
  }
}
```

**这里有两个关键逻辑**：
1. `snapshot.timerRunning = false`：从数据库恢复的快照不能恢复计时器运行状态，因为服务重启后 setInterval 全没了
2. `snapshot.show` 的兜底：旧版本快照里没有 `show` 字段，必须补一个默认值，否则 view.html 会报 undefined

> ⚠️ **如果你新增了 state 字段**，必须在这里加兜底逻辑。否则旧快照恢复后新字段是 undefined。

### 4.3 前端乐观更新的回滚

V4.0 加了乐观更新：点击按钮→立即本地更新 UI→同时发 WS。但如果 WS 失败怎么办？**目前没有回滚机制**。

在局域网环境下基本不会丢包，但如果将来要支持互联网远程操作，需要加：
- WS 消息带 sequence number
- 服务端返回 ack 消息
- 客户端在超时后回滚

### 4.4 足球 quarter 枚举

足球的 `quarter` 值含义：
- `1` = 上半场
- `2` = 中场休息
- `3` = 下半场
- `4` = 加时
- `5` = 点球

篮球的 `quarter` 值含义：
- `1` = 第1节
- `2` = 第2节
- `3` = 第3节
- `4` = 第4节
- `5` = 加时

**两个的 quarter 含义不同！** 尤其是足球在 `secondHalf` 端点里强制 `quarter=3`，篮球没有这种逻辑。如果你要统一代码，这个差异是最大的坑。

### 4.5 足球的计时方向

足球是**正计时**（从0往上计），封顶45/90分钟。篮球是**倒计时**（从设置时间往下减）。

当前代码里篮球的 server.js 和足球的 server.js 看起来几乎一样（都是倒计时），这实际上是足球代码被篮球代码"污染"了。**足球应该用正计时逻辑**，参考足球原始代码的 `formatTime` 函数（超过60分钟显示 h:mm:ss）。

> ⚠️ **这不是Bug，是代码演进过程中发生的合并错误**。如果未来修足球计时逻辑，要改回正计时。

---

## 5. 开发过程中踩过的坑

### 5.1 better-sqlite3 是 native 模块——升级 Node 必须 rebuild

这是最坑的一条。

- better-sqlite3 编译时绑定了 Node.js 的 C++ ABI 版本
- Node.js 大版本升级（如 18→20）后，ABI 不兼容
- 症状：`require('better-sqlite3')` 报错，进程启动失败
- **解决**：`npm rebuild better-sqlite3` 或 `rm -rf node_modules && npm install`

这个问题**导致足球系统在 Node 升级后崩溃了223次**（PM2 不断重启），直到有人发现并 rebuild。

> 💡 **部署检查清单第0条**：Node 版本变更后，先 `npm rebuild`，再 `pm2 restart`。

### 5.2 Nginx 配置里的 shell 转义问题

如果通过 bash 脚本或 `cat <<EOF` 的方式写入 Nginx 配置，`$http_upgrade` 会被 bash 解释为变量（变成空字符串），导致 WebSocket 代理失败。

**解决**：不要用 shell 写 Nginx 配置，用 SFTP 上传。或者用单引号 heredoc：`cat <<'EOF'`。

### 5.3 WAL/SHM 文件暴露

SQLite 在 WAL 模式下会产生 `.db-wal` 和 `.db-shm` 文件。Express 的 `static` 中间件默认会把这些文件当作静态资源提供下载。这意味着**任何人都能下载你的数据库**。

**解决**：在静态文件中间件之前加正则拦截（见 3.1）。

### 5.4 vMix 不显示内容

namebar 的 view.html 在本地浏览器完美，但在 vMix 里一片空白。排查了一圈发现是：
1. `backdrop-filter: blur()` → vMix 内置 Chromium 不支持
2. `text-shadow` → 渲染异常
3. `transform: translate(-50%, -50%)` → 定位错误

**解决**：全部改成纯 CSS（position: absolute + margin 居中），JS 全改 ES5。

> 💡 **vMix 兼容测试**：不要用本地 Chrome 测试。要么在 vMix 里测，要么用一个 Chromium 50 左右的旧版浏览器测。

### 5.5 Nginx proxy_pass 端口写错

足球的 Nginx 配置里 `proxy_pass http://127.0.0.1:3003`，但足球实际跑在 3004 端口（因为 daobo-live 占用了 3003）。这个配置错误没被发现是因为：
- PM2 管理的是 3004 端口
- 足球有自己单独的 Nginx server block
- 那个 server block 直接指向正确的端口

所以**3003 那行 proxy_pass 其实没被任何域名引用**，属于僵尸配置。如果要清理 Nginx 配置，记得确认哪个 server block 在用哪行。

### 5.6 roomToken 泄露

初期版本 `GET /api/state/:roomId` 返回完整 state，包括 roomToken。这意味着：
- 任何人知道房间号就能拿到 token
- 拿到 token 就能操作记分板
- 不需要验证身份

修复：删除 roomToken 再返回。

### 5.7 操作日志的缓存膨胀

`logOperation` 每次插入后检查房间操作数，超过 500 条就删旧。但 COUNT(*) + DELETE 是 O(n) 操作。如果某个房间有大量操作（比如篮球比赛期间每秒一次计时器 tick），每次 logOperation 的性能会下降。

> 💡 **如果房间操作量很大**，可以考虑用 SQLite trigger 自动清理，或者降低清理频率（比如每10次 logOperation 才清理一次）。

### 5.8 微信内置浏览器的坑

微信 H5 环境有几个特性：
1. `backdrop-filter` 在 X5 内核里性能极差，甚至白屏
2. WebSocket 在微信里可能被代理断开（尤其是切换后台）
3. `autoplay` 视频策略限制
4. iOS 微信里 `100vh` 包含底部导航条，导致滚动条

**当前状态**：微信 H5 尚未充分测试。如果要在微信场景使用，需要专门适配。

---

## 6. 历史兼容方案（不能动的"屎山"）

### 6.1 namebar/view.html 的 ES5 兼容

全文件写 ES5 语法，这是为了兼容 vMix 旧版 Chromium。**如果你要重构它**，有两个选择：
1. 继续写 ES5（痛苦但安全）
2. 用 Babel 转译，但增加构建步骤

### 6.2 namebar 的 XHR 轮询 fallback

view.html 里有 XHR 轮询作为 WebSocket 的 fallback。这是因为 vMix 的 WebSocket 实现可能有 bug。**不要删掉**，除非你确认所有使用场景都不需要。

### 6.3 足球旧版 4 位 PIN 房间号

足球的旧版用 4 位数字作为房间号（`1000-9999`），新版用类似篮球的 6 位字母。两者目前在代码里共存。如果你要清理旧版逻辑，确保不影响还在用 4 位 PIN 的旧房间。

### 6.4 POST /api/rooms 兼容两种 roomId

```javascript
if (!roomId || !/^\d{4}$/.test(roomId)) {
  // 自动生成
}
```

这个 API 接受两种输入：
- 带 `roomId` 参数：使用指定房间号（4位数字）
- 不带：自动生成一个不冲突的4位数字

这个设计是为了兼容旧版客户端。新版（v4.0+）用 `POST /api/room/create` 生成6位字母房间号。

---

## 7. 代码之间的强关联（改A必须改B）

### 7.1 admin.html ↔ view.html（状态结构）

两个文件共享完全相同的 state 对象结构。**如果你在 server.js 的 createRoomState 里加了新字段**，必须同步更新：
- `public/admin.html` 里的 state 初始化
- `public/view.html` 里的 state 读取逻辑
- `db.js` 的 `loadRoomSnapshot` 里的兜底逻辑
- 如果有 cast.html（投屏页），也要更新

### 7.2 篮球 server.js ↔ 足球 server.js

这两个文件目前结构几乎一样（连注释都复制粘贴了），但**功能逻辑应该不同**：
- 篮球：倒计时 + 24秒进攻计时器
- 足球：正计时 + 上下半场切换

如果你修了一个通用 Bug（比如安全中间件、WS 心跳），记得两个都修。但如果是业务逻辑改动，只改对应的。

### 7.3 db.js 的两个版本

篮球的 `db.js` 和足球的 `football/db.js` 也是复制粘贴的。表结构完全一样：`operators`、`room_snapshots`、`operations`、`share_tokens`。

**但它们是两个独立的数据库文件**：
- 篮球：`basketball-score/data/score.db`
- 足球：`basketball-score/football/data/score.db`

> ⚠️ 注意 hashPin 里的盐值写死了 `'basketball-score-v3'`——足球版也是这个值。这意味着同一个 PIN 在两个系统里 hash 结果相同（这倒没什么影响，但要知道）。

### 7.4 前端 WS 消息类型协议

三个子应用共享相同的 WS 消息协议：

| type | 方向 | 用途 |
|------|------|------|
| `ping` | 客户端→服务端 | 保活 |
| `pong` | 服务端→客户端 | 保活响应 |
| `join` | 客户端→服务端 | 加入房间（携带 token/operatorName） |
| `update` | 客户端→服务端 | 状态更新（V4.0+ 乐观更新） |
| `state` | 服务端→客户端 | 状态广播 |
| `operation_log` | 服务端→客户端 | 操作日志广播 |
| `room_info` | 服务端→客户端 | 房间信息 |
| `error` | 服务端→客户端 | 错误消息 |

**如果要改消息格式**，所有子应用的 admin.html 和 view.html 都得同步改。

### 7.5 landing/index.html → 各子应用的 admin.html

首页的三个产品卡片链接指向各自的 `admin.html`。如果改了 admin.html 的文件名或路径，首页链接会 404。

---

## 8. 未来重构建议（按优先级）

### 8.1 🟡 中优先级：提取共享模块

三个子应用的 server.js、db.js 有 80% 相同的代码。如果抽出共享的 npm 包或 git submodule，修一个 Bug 三个全受益。但要注意：
- 投入产出比：三个子应用改的频率不高
- 风险：共享模块一旦引入 API 变更，三个都要测
- 建议：先提取 `db.js`（因为它更稳定），server.js 暂缓

### 8.2 🟡 中优先级：统一房间 ID 格式

篮球和足球新版用 6 位字母，足球旧版用 4 位数字。建议全部统一为 6 位字母（排除易混淆字符：0/O/1/l/I），命名规则参考 namebar 的 CHARSET。

### 8.3 🟢 低优先级：足球计时器修正

足球的 server.js 目前是倒计时（篮球逻辑），应该改为正计时。同时需要恢复：
- `formatTime` 超过60分钟显示 `h:mm:ss`
- `secondHalf` 端点强制 quarter=3, timerSeconds=45*60
- quarter 枚举值和篮球区分

### 8.4 🟢 低优先级：加集成测试

目前整个项目没有自动化测试。建议至少加：
- server.js 的 API 端点测试（用 supertest）
- WebSocket 消息流程测试（用 ws 客户端模拟）
- 计时器逻辑单元测试（验证 start/stop/reset 状态转换）

### 8.5 🟢 低优先级：TypeScript 迁移

当前全 JS，没有类型检查。像 state 对象这种在多个文件间共享的结构，TypeScript 能显著减少字段遗漏的 Bug。但不急——先跑起来再说。

### 8.6 🟢 低优先级：WAL 自动 checkpoint

SQLite WAL 文件长时间运行会膨胀（曾膨胀到 4MB）。建议加一个定时任务（每周一次）执行：
```sql
PRAGMA wal_checkpoint(TRUNCATE);
```
或者在 server.js 启动时加 `setInterval(() => db.pragma('wal_checkpoint(TRUNCATE)'), 24*60*60*1000)`。

---

## 9. 部署速查卡

### 9.1 服务器环境

| 项目 | 值 |
|------|-----|
| CPU | 1 core |
| 内存 | 1.9 GB（常年 74% 占用） |
| 磁盘 | 40 GB（57% 占用） |
| Node.js | v20（注意 rebuild better-sqlite3） |
| 进程管理 | PM2 |
| 反向代理 | Nginx |
| SSL | Let's Encrypt (certbot, 自动续期) |

### 9.2 PM2 配置

```bash
pm2 start server.js --name gw-basketball -- --port 3002 --max-memory-restart 200M
pm2 start football/server.js --name gw-football -- --port 3001 --max-memory-restart 200M
```

### 9.3 数据库位置

```
篮球: basketball-score/data/score.db  (+ .db-wal + .db-shm)
足球: basketball-score/football/data/score.db  (+ .db-wal + .db-shm)
```

### 9.4 备份提醒

备份数据库时必须包含三个文件：`.db`、`.db-wal`、`.db-shm`。如果只备份 `.db`，WAL 里未写入的数据会丢失。

> 💡 安全备份方法：先执行 `sqlite3 score.db "PRAGMA wal_checkpoint(TRUNCATE)"`，等 WAL 文件缩小后，再备份 `.db` 文件。

### 9.5 快速启动检查清单

1. [ ] `node -v` 确认 Node 版本
2. [ ] `npm rebuild better-sqlite3`（如果 Node 版本有变）
3. [ ] `pm2 list` 确认 gw-basketball 和 gw-football 在运行
4. [ ] `nginx -t` 确认配置正确
5. [ ] `curl http://localhost:3002/admin.html` 返回 200
6. [ ] `curl http://localhost:3001/admin.html` 返回 200
7. [ ] 检查 `.db-wal` 文件大小（正常 < 200KB）

---

## 10. 黄金法则

1. **改代码前先 grep 全仓库**。三个子应用的代码高度重复，改一个地方可能需要在另外两处同步修改。

2. **namebar/view.html 是特殊的存在**。它是唯一需要 vMix 兼容的文件，写代码不能用现代语法。

3. **永远不要在只读 API 里泄露 token**。这是之前踩过的坑，不要再踩。

4. **SQLite 文件不能被公开访问**。检查静态文件中间件的正则是否覆盖了所有数据库相关扩展名。

5. **计时器状态是系统最脆弱的部分**。任何对 start/stop/reset 逻辑的改动都要仔细测试：启动→暂停→恢复→归零→重置 这条路径。

6. **在服务器上操作前先备份数据库**。`cp score.db score.db.bak.$(date +%s)` 花不了几秒，但能救你一命。

---

> **最后的话**：这个系统不大，但坑不少。大部分坑都记录在这份文档里了。如果你遇到了新的坑，请**补充到这份文档里**——下一个维护者会感谢你的。
>
> *文档作者：科迪（Cody）· 代码审查师，工程保障团队*
> *生成日期：2026-05-24*
