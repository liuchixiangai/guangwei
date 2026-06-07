# PROJECT_CONTEXT — 光为云字幕矩阵

> **文档类型**：技术交接 · 项目上下文  
> **最后更新**：2026-05-16  
> **维护者**：工程保障团队 · 多库（Docu）  
> **目标读者**：接手本项目的开发者、运维人员、技术决策者  
> **阅读前提**：具备 Node.js、WebSocket、Nginx 基础知识

---

## 目录

1. [项目定位](#1-项目定位)
2. [当前产品组成](#2-当前产品组成)
3. [技术架构](#3-技术架构)
4. [系统架构说明](#4-系统架构说明)
5. [目录结构说明](#5-目录结构说明)
6. [已知问题与历史包袱](#6-已知问题与历史包袱)
7. [快速参考卡片](#7-快速参考卡片)

---

## 1. 项目定位

### 1.1 项目是什么

**光为云字幕矩阵（Guangwei Cloud Caption Matrix）** 是一个面向体育赛事直播和会议直播的**实时记分/字幕叠加工具平台**。它允许用户在手机上远程控制记分板和字幕条，并通过 OBS Studio / vMix / 芯象等主流直播软件的"浏览器源（Browser Source）"功能，将记分信息实时叠加到直播画面上。

### 1.2 解决什么问题

| 痛点 | 解决方案 |
|------|----------|
| 传统直播需要硬件字幕机（昂贵、笨重） | 纯 Web 方案，零硬件成本 |
| 多机位多场地需要各自独立记分 | 一个手机/浏览器即可远程控制 |
| 体育记分要求毫秒级实时同步 | WebSocket 推送，延迟 < 100ms |
| 小型团队/个人无力维护数据库服务器 | SQLite 嵌入式数据库，零运维 |
| 赛后需要回查操作记录 | 全操作日志，SQLite 持久化 |

### 1.3 服务哪些用户

- **体育赛事直播团队**：篮球、足球比赛的实时记分/计时
- **会议/论坛直播制作团队**：演讲者人名条叠加
- **校园/企业/社区直播**：小型低成本直播场景
- **OBS/vMix 用户**：已有直播流程，需要轻量叠加方案

### 1.4 为什么做

市场上直播字幕/记分方案分为两极：一类是专业硬件字幕机（数万至数十万元），另一类是基础的开源 OBS 叠加脚本（功能简陋）。光为云字幕矩阵定位于**专业功能 × 零成本 × 远程控制**的交叉点，让小型团队也能拥有专业级的直播字幕能力。

---

## 2. 当前产品组成

### 2.1 会议直播人名条（namebar）— `端口 3003`，PM2: `gw-namebar`

**用途**：会议、论坛、圆桌讨论等直播场景中，在画面上叠加当前发言人的姓名和职务信息。

**使用方式**：

1. **入口页（admin.html）**：访问 `https://guangwei.cloud/namebar/`
   - 创建房间：填写姓名 → 自动生成 6 位字母数字房间 ID
   - 加入已有房间：输入房间 ID 加入
2. **控制页**：管理参会人员列表（姓名 + 职务1 + 职务2）、选择当前发言人、切换模板/配色
3. **视图页（view.html）**：在 OBS/vMix 中添加为浏览器源，URL 格式为 `https://guangwei.cloud/namebar/view.html?room=XXXXXX`
   - 1920×1080 透明叠加层
   - 背景透明（CSS `background: transparent`），直接叠加到直播画面

**核心特性**：

- 6 种模板预设（A-F），7 种配色（赤/橙/黄/绿/青/蓝/紫）
- 字体大小和位置可调
- 多人协作：同一房间允许多人同时控制
- 数据持久化：SQLite 保存最近 12 小时快照，服务器重启自动恢复
- 安全：`roomToken` 鉴权机制，写操作需验证 token

---

### 2.2 篮球计分板（basketball）— `端口 3002`，PM2: `gw-basketball`

**用途**：篮球比赛实时记分与计时。

**使用方式**：

1. **控制台（admin.html）**：访问 `https://basketball.guangwei.cloud/`
   - 创建/加入房间（4 位数字 PIN）
   - 控制队名、比分、节数
2. **视图页（view.html）**：浏览器源 URL `https://basketball.guangwei.cloud/view.html?room=XXXX`
3. **投屏页（cast.html）**：辅助投屏显示

**核心计时体系**：

| 计时器 | 说明 |
|--------|------|
| 主计时器 | 倒计时，默认 10 分钟/节 |
| 进攻计时器 | 24 秒倒计时 |

**其他特性**：

- XML/JSON 数据源输出（供芯象、vMix 等通过数据源功能导入）
- 操作日志保留最近 50 条
- SQLite 持久化（操作员信息、快照、操作日志）

---

### 2.3 足球计分板（football）— `端口 3004`，PM2: `gw-football`

**用途**：足球比赛计时与记分。

**使用方式**：

1. **控制台（admin.html）**：访问 `https://football.guangwei.cloud/`
2. **视图页（view.html）**：浏览器源 URL `https://football.guangwei.cloud/view.html?room=XXXX`

**核心计时体系**：

| 机制 | 说明 |
|------|------|
| 计时方式 | **正计时**（从 00:00 开始） |
| 上半场 | 封顶 45 分钟 |
| 下半场 | 封顶 90 分钟 |
| 比赛事件 | 上半场 → 中场休息 → 下半场 → 加时 → 点球 |
| 伤停补时 | 支持显示 |

**其他特性**：

- 比赛结束/新比赛控制按钮
- XML/JSON 数据源输出
- 操作日志 + SQLite 持久化

---

### 2.4 Browser Source 输出

三个子应用各有一个 `view.html`，这是整个系统的**核心交付物**——直播软件通过浏览器源加载这些页面。

**工作原理**：

```
view.html  →  WebSocket 连接 server  →  接收 state 推送  →  DOM 更新渲染
```

**关键要求**：

- 分辨率：1920×1080
- namebar 的背景必须为透明（`background: transparent`）
- basketball/football 可带不透明背景
- 兼容 OBS Studio、vMix、芯象等主流直播软件的内置浏览器
- namebar 的 view.html 为兼容 vMix 老旧浏览器内核，使用 ES5 语法，并保留 XHR 轮询 fallback

---

### 2.5 WebSocket 实时同步

**协议**：WebSocket（`ws` 库 v8.x）

**通信模型**：

```
┌──────────────┐    WS: join(roomId)    ┌──────────┐
│  admin.html  │ ──────────────────────▶│  server  │
│  (控制端)     │◀──── state snapshot ── │          │
│              │    WS: update(data)    │          │
│              │ ──────────────────────▶│          │
└──────────────┘                        │          │
                                        │          │
┌──────────────┐    WS: join(roomId)    │          │
│  view.html   │ ──────────────────────▶│          │
│  (显示端)     │◀──── state broadcast ──│          │
└──────────────┘                        └──────────┘
```

**消息类型**：

| 方向 | 消息 | 说明 |
|------|------|------|
| Client→Server | `join` | 客户端加入房间（携带 roomId 和 token） |
| Server→Client | `state` | 当前房间完整状态快照 |
| Client→Server | `update` | 控制端发起状态变更（需 token 验证） |
| Server→All | `state` | 状态变更后广播给房间内所有客户端 |

---

### 2.6 管理后台（admin.html）

三个子应用各有一个 `admin.html`，作为 Web 端控制台：

- **namebar**：admin.html 包含入口页（创建/加入房间）+ 控制面板（人员列表、模板、配色等）
- **basketball/football**：admin.html 包含入口 + 完整的记分/计时控制界面
- 所有 admin.html 为移动端友好设计（namebar 做了微信 H5 适配）

---

### 2.7 操作日志

**basketball 和 football** 提供操作日志功能：

- 记录每次操作（修改比分、开始/暂停计时、切换节数等）
- 保留最近 **50 条**记录
- 存储于 SQLite 数据库的 `logs` 表中
- 可通过 API 查询（调试/审计用途）

> namebar 当前不包含操作日志功能。

---

### 2.8 XML/JSON 数据源

**basketball 和 football** 提供标准 HTTP 端点，输出 XML 或 JSON 格式的比赛数据：

- 供 **vMix Data Sources**、**芯象数据源** 等功能导入
- XML 格式兼容 vMix 的 `Title` / `Text` 数据源规范
- JSON 格式用于通用集成

---

## 3. 技术架构

### 3.1 技术栈总览

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| **运行时** | Node.js | v20.20.2 |
| **后端框架** | Express | v4.21.0 |
| **实时通信** | WebSocket (ws) | v8.x |
| **数据库** | SQLite (better-sqlite3) | — |
| **数据库模式** | WAL（Write-Ahead Logging） | — |
| **进程管理** | PM2 | v7.0.1 |
| **反向代理** | Nginx | Ubuntu 22.04 默认 |
| **HTTPS 证书** | Let's Encrypt (Certbot) | guangwei.cloud-0001 |
| **服务托管** | 腾讯云轻量服务器 | Ubuntu 22.04, 1.9GB RAM, 40GB 磁盘 |
| **前端** | 原生 HTML/CSS/JS（无框架） | ES5/ES6 混用 |

### 3.2 Node.js 与包管理

- Node 版本：**v20.20.2**
- 包管理器：npm（随 Node 安装）
- 各子应用独立 `package.json`，独立 `node_modules/`
- **注意**：`better-sqlite3` 是原生 C++ 模块，Node 版本升级后**必须**执行 `npm rebuild`

### 3.3 PM2 进程管理

| PM2 应用名 | 端口 | 对应服务 | 源码目录 |
|------------|------|----------|----------|
| `gw-namebar` | 3003 | 会议人名条 | `/var/www/guangwei_cloud/namebar/` |
| `gw-basketball` | 3002 | 篮球计分板 | `/var/www/guangwei_cloud/basketball/` |
| `gw-football` | 3004 | 足球计分板 | `/var/www/guangwei_cloud/football/` |

**常用 PM2 命令**：

```bash
pm2 status                    # 查看所有进程状态
pm2 logs gw-namebar           # 查看人名条日志
pm2 restart gw-basketball     # 重启篮球服务
pm2 save                      # 保存当前进程列表（重启后自动恢复）
pm2 startup                   # 设置开机自启
```

### 3.4 Nginx 配置摘要

Nginx 配置文件位置：`/etc/nginx/sites-available/guangwei.cloud`

| Server 块 | 代理目标 | 用途 |
|-----------|----------|------|
| `guangwei.cloud` | localhost:3003（仅 `/namebar/` 路径） | 主站 + 人名条 |
| `basketball.guangwei.cloud` | localhost:3002 | 篮球计分板 |
| `football.guangwei.cloud` | localhost:3003 ⚠️ | 足球计分板（**注意：指向错误端口**） |
| `daobo.guangwei.cloud` | localhost:3001 | daobo-live Next.js 应用 |

> ⚠️ **已知配置不一致**：football 子域名的 Nginx `proxy_pass` 指向 `localhost:3003`，但实际 football 服务运行在 `localhost:3004`（PM2 管理）。目前依赖某种端口转发或配置修正才能正常工作，详见 [已知问题](#6-已知问题与历史包袱)。

---

## 4. 系统架构说明

### 4.1 系统整体数据流

```
                    ┌──────────────┐
                    │    Nginx      │
                    │  (HTTPS 终止) │
                    └──┬───┬───┬───┘
                       │   │   │
          ┌────────────┼───┼───┼────────────┐
          ▼            ▼   ▼   ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ namebar  │ │basketball│ │ football │
   │  :3003   │ │  :3002   │ │  :3004   │
   │ Express  │ │ Express  │ │ Express  │
   │   + WS   │ │   + WS   │ │   + WS   │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │
        ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │  SQLite  │ │  SQLite  │ │  SQLite  │
   │  (WAL)   │ │  (WAL)   │ │  (WAL)   │
   └──────────┘ └──────────┘ └──────────┘
```

### 4.2 前端工作流程

```
┌─────────────────────────────────────────────────────────┐
│                     admin.html（控制端）                   │
│                                                         │
│  1. 创建/加入房间                                         │
│  2. 建立 WebSocket 连接 → 发送 join(roomId)               │
│  3. 收到 state 快照 → 初始化 UI                           │
│  4. 用户操作 → 发送 update(data) → Server 验证 token       │
│  5. Server 广播 state → 本地 UI 即时更新                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     view.html（显示端）                    │
│                                                         │
│  1. URL 参数获取 roomId（如 ?room=ABC123）                 │
│  2. 建立 WebSocket 连接 → 发送 join(roomId)               │
│  3. 收到 state 快照 → 渲染记分板/字幕条                    │
│  4. 后续收到 state 广播 → 增量更新 DOM                     │
│  5. 断线自动重连                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Browser Source 如何获取数据

在 OBS/vMix 中添加浏览器源时，URL 直接指向线上 view.html：

```
https://guangwei.cloud/namebar/view.html?room=ABC123
https://basketball.guangwei.cloud/view.html?room=1234
https://football.guangwei.cloud/view.html?room=5678
```

view.html 加载后：

1. 解析 URL 参数获取 `roomId`
2. 建立到同源服务器的 WebSocket 连接
3. 加入指定房间
4. 接收并渲染实时状态

> **vMix 兼容注意**：vMix 内置浏览器基于旧版 Chromium，对 ES6+ 特性支持有限。namebar 的 view.html 为此做了降级处理。

### 4.4 控制端同步机制

```
用户操作（如修改比分）
  │
  ▼
admin.html 发送 WS 消息: { type: "update", data: { score: {...} } }
  │
  ▼
server.js 接收 → 验证 token → 更新内存 state → 写入 SQLite
  │
  ▼
server.js 广播: { type: "state", data: <完整 state> }
  │
  ├──▶ 同房间所有 admin.html 客户端收到 → 同步 UI
  └──▶ 同房间所有 view.html 客户端收到 → 更新显示
```

**关键设计**：广播的是**完整 state**而非增量 patch，这简化了客户端逻辑——每个客户端只需"收到什么就渲染什么"。

### 4.5 数据持久化策略

- **写入时机**：每次 state 变更立即写入 SQLite
- **写入模式**：WAL（Write-Ahead Logging），允许多个读操作与一个写操作并发
- **恢复机制**：服务器启动时从 SQLite 读取最后快照恢复内存 state
- **namebar 特殊性**：快照保留 12 小时，超期数据自动清理
- **basketball/football**：额外存储操作日志（最近 50 条）

### 4.6 页面之间如何关联

```
┌──────────────────────────────────────────────────────┐
│                    用户手机/电脑                        │
│                                                      │
│  admin.html ─── WebSocket ───┐                       │
│                              │                       │
│  cast.html ─── WebSocket ────┤                       │
│                              ▼                       │
│                      ┌──────────────┐                │
│                      │  server.js   │                │
│                      │  (状态中枢)   │                │
│                      └──────┬───────┘                │
│                             │ WebSocket              │
│                             │ 广播                   │
│            ┌────────────────┼────────────────┐       │
│            ▼                ▼                ▼       │
│      view.html        view.html        view.html     │
│      (OBS机器A)       (OBS机器B)       (vMix机器C)    │
│                                                      │
│            通过同一个 roomId 关联在一起                  │
└──────────────────────────────────────────────────────┘
```

---

## 5. 目录结构说明

### 5.1 本地开发目录（`D:/guangweicloud/guangwei/`）

```
guangwei/
│
├── basketball/                   # 篮球计分板子应用
│   ├── server.js                 # ★ Express + WebSocket 服务主入口
│   ├── db.js                     # ★ SQLite 数据库封装（操作员/快照/操作日志三表）
│   ├── admin.html                # ★ 控制台（入口页 + 记分控制合一）
│   ├── view.html                 # ★ Browser Source 输出视图（比赛记分板UI）
│   ├── cast.html                 # 投屏视图（辅助显示）
│   └── package.json              # 依赖声明
│
├── football/                     # 足球计分板子应用
│   ├── server.js                 # ★ Express + WebSocket 服务主入口
│   ├── db.js                     # ★ SQLite 数据库封装（同篮球结构）
│   ├── admin.html                # ★ 控制台
│   ├── view.html                 # ★ Browser Source 输出视图
│   ├── cast.html                 # 投屏视图
│   └── package.json              # 依赖声明
│
├── namebar/                      # 会议直播人名条子应用
│   ├── server.js                 # ★ Express + WebSocket 服务主入口
│   ├── db.js                     # ★ SQLite 数据库封装（仅房间快照表）
│   ├── admin.html                # ★ 入口 + 控制台（含微信H5适配）
│   ├── view.html                 # ★ Browser Source 透明叠加层（vMix兼容）
│   └── package.json              # 依赖声明
│
├── landing/                      # 产品首页
│   └── index.html                # ★ SEO 优化的落地页（Nginx 直接 serve）
│
└── .gitignore                    # Git 忽略规则
```

**标注 ★ 为核心文件，理解项目必须阅读。**

### 5.2 服务器部署目录（`/var/www/guangwei_cloud/`）

```
/var/www/guangwei_cloud/
│
├── landing/                      # 静态首页（Nginx 直接 serve）
│
├── namebar/                      # 人名条应用（含 node_modules）
│   ├── server.js
│   ├── db.js
│   ├── admin.html
│   ├── view.html
│   ├── package.json
│   ├── node_modules/             # 生产依赖
│   ├── data/
│   │   └── scoreboard.db         # SQLite 数据库文件
│   └── public/                   # 旧版遗留文件
│       ├── controller.html       # 遗留（不再使用）
│       └── display.html          # 遗留（不再使用）
│
├── basketball/                   # 篮球应用
│   ├── server.js
│   ├── db.js
│   ├── admin.html
│   ├── view.html
│   ├── package.json
│   ├── node_modules/
│   └── data/
│       └── scoreboard.db
│
├── football/                     # 足球应用
│   ├── server.js
│   ├── db.js
│   ├── admin.html
│   ├── view.html
│   ├── package.json
│   ├── node_modules/
│   └── data/
│       └── scoreboard.db
│
├── admin/                        # 旧版遗留（已废弃）
├── data/                         # 旧版遗留数据
├── game_state.json               # 旧版遗留（已被 SQLite 替代）
└── server.js.DISABLED            # 旧版单体服务（已禁用）
```

### 5.3 每个子应用的关键文件说明

#### server.js — Express + WebSocket 服务主入口

| 职责 | 说明 |
|------|------|
| HTTP 路由 | Express 路由：静态文件 serve、API 端点、数据源输出 |
| WebSocket | 升级 HTTP 连接，管理房间、广播状态 |
| Token 生成 | `crypto.randomBytes` 生成 roomToken |
| 输入验证 | 字段白名单校验、XSS 防护 |

**namebar 特有问题**：server.js 使用双路由挂载：
```js
app.use('/api', router);          // 直连兼容
app.use('/namebar/api', router);  // Nginx 代理兼容（/namebar/ 路径前缀）
```

#### db.js — SQLite 数据库封装

| 表 | namebar | basketball | football |
|----|---------|------------|----------|
| `rooms` / 快照表 | ✅ | ✅ | ✅ |
| `operators` / 操作员表 | ❌ | ✅ | ✅ |
| `logs` / 操作日志表 | ❌ | ✅ | ✅ |

**关键特性**：
- 使用 `better-sqlite3`（同步 API，性能优于异步 sqlite3）
- WAL 模式启用：`PRAGMA journal_mode=WAL`
- 写操作使用 `db.prepare().run()` 预编译语句

#### admin.html — 控制台

- 单页应用，无框架依赖
- 包含创建/加入房间逻辑
- WebSocket 连接管理
- 响应式布局（移动端适配）

#### view.html — Browser Source 输出

- 最简 DOM 结构，CSS Grid/Flexbox 布局
- 通过 URL 参数 `?room=XXXX` 获取房间号
- WebSocket 连接 + 断线重连
- namebar 特殊：背景透明 + ES5 兼容 + XHR fallback

#### package.json

三个子应用的依赖基本一致：

```json
{
  "dependencies": {
    "express": "^4.21.0",
    "ws": "^8.x",
    "better-sqlite3": "^x.x.x"
  }
}
```

---

## 6. 已知问题与历史包袱

### 6.1 ⚠️ 足球 Nginx 配置端口不一致

**现象**：`football.guangwei.cloud` 的 Nginx `proxy_pass` 指向 `localhost:3003`，但 football 实际运行在 `localhost:3004`（PM2 `gw-football`）。

**影响**：如果 Nginx 配置未修正，football 子域名将无法访问到正确的服务。

**建议**：将 football 的 Nginx `proxy_pass` 改为 `http://localhost:3004`。

### 6.2 ⚠️ namebar view.html 的 vMix 兼容降级

**现象**：namebar 的 `view.html` 为了兼容 vMix 内置浏览器（基于旧版 Chromium），使用了：
- ES5 语法（避免箭头函数、const/let、模板字符串等）
- XHR 轮询 fallback（当 WebSocket 不可用时降级为 HTTP 轮询）

**影响**：代码可读性差，维护成本高。如果未来不再需要支持 vMix 旧版，建议重构为现代 JS。

### 6.3 ⚠️ 双房间号体系并存

**现象**：
- namebar 使用 **6 位字母数字**房间 ID（如 `ABC123`）
- basketball/football 使用 **4 位数字 PIN**（如 `1234`）

**原因**：namebar 是后来开发的，设计时改为更安全的字母数字混合 + 更长的长度。basketball/football 保留了早期的数字 PIN 系统以向后兼容老用户。

**影响**：房间号生成和验证逻辑不统一，维护两套代码。

### 6.4 ⚠️ better-sqlite3 原生模块兼容性

**现象**：`better-sqlite3` 是 C++ 原生模块（N-API），与 Node.js 版本强绑定。

**影响**：
- Node.js 版本升级后必须执行 `npm rebuild better-sqlite3`（或 `npm rebuild`）
- 跨平台部署（macOS ↔ Linux）需要重新编译
- CI/CD 中需要匹配 Node 版本

**建议**：在部署脚本中加 `npm rebuild` 步骤；考虑锁定 Node 版本（`.nvmrc` 或 `package.json` `engines` 字段）。

### 6.5 ⚠️ namebar 12 小时快照过期清理

**现象**：namebar 的快照数据仅保留 12 小时。

**设计意图**：会议类使用场景通常是短期事件，过期自动清理避免数据库膨胀。

**影响**：如果会议跨度超过 12 小时（罕见），数据可能丢失。但对于绝大多数场景这是合理的设计。

### 6.6 ⚠️ 服务器遗留文件

**现象**：`/var/www/guangwei_cloud/` 目录下存在旧版遗留：
- `admin/` — 旧版单体管理后台
- `data/` — 旧版 JSON 文件数据
- `game_state.json` — 旧版状态文件（已被 SQLite 替代）
- `server.js.DISABLED` — 旧版单体 Express 服务

**影响**：目录结构不够整洁，可能误导新开发者。

**建议**：确认无依赖后进行清理或归档。

### 6.7 ⚠️ namebar 双路由挂载

**现象**：namebar 的 server.js 同时挂载 `/api` 和 `/namebar/api` 两套路由。

**原因**：兼容两种部署模式——直接端口访问（`localhost:3003/api`）和 Nginx 代理访问（`guangwei.cloud/namebar/api`）。

**影响**：路由逻辑冗余，但无功能问题。如需简化可考虑统一部署模式。

### 6.8 ⚠️ 无自动化测试

**现状**：项目目前没有自动化测试（单元测试、集成测试、E2E 测试均为零）。

**影响**：重构和功能变更依赖手动验证，风险较高。

### 6.9 ⚠️ 无 CI/CD

**现状**：部署依赖手动操作（SSH + git pull + pm2 restart）。

**建议**：可考虑添加 GitHub Actions 或简单的部署脚本。

### 6.10 1.9GB 内存压力

**状态**：当前配置 1.9GB RAM，运行 3 个 Node 进程 + Nginx + SQLite，内存在正常情况下足够。

**风险**：如果未来添加更多服务或并发量增长，可能需要考虑升级服务器配置或引入容器化。

---

## 7. 快速参考卡片

### 7.1 端口与服务映射

```
:3002  →  gw-basketball  →  篮球计分板
:3003  →  gw-namebar     →  会议人名条
:3004  →  gw-football    →  足球计分板
:3001  →  daobo-live     →  Next.js（非本项目直接维护）
:80/443 →  Nginx          →  反向代理 + HTTPS 终止
```

### 7.2 URL 快速参考

| 功能 | URL |
|------|-----|
| 产品首页 | `https://guangwei.cloud/` |
| 人名条控制台 | `https://guangwei.cloud/namebar/` |
| 篮球控制台 | `https://basketball.guangwei.cloud/` |
| 足球控制台 | `https://football.guangwei.cloud/` |
| OBS 人名条视图 | `https://guangwei.cloud/namebar/view.html?room=XXXXXX` |
| OBS 篮球视图 | `https://basketball.guangwei.cloud/view.html?room=XXXX` |
| OBS 足球视图 | `https://football.guangwei.cloud/view.html?room=XXXX` |

### 7.3 关键文件路径

| 文件 | 路径 |
|------|------|
| Nginx 配置 | `/etc/nginx/sites-available/guangwei.cloud` |
| SSL 证书 | `/etc/letsencrypt/live/guangwei.cloud-0001/` |
| PM2 进程配置 | `pm2 save` 存储于 `~/.pm2/dump.pm2` |
| SQLite 数据库 | `/var/www/guangwei_cloud/{子应用}/data/scoreboard.db` |
| 本地源码 | `D:/guangweicloud/guangwei/` |

### 7.4 日常运维命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs gw-namebar --lines 50

# 重启单个服务
pm2 restart gw-basketball

# 重启所有服务
pm2 restart all

# Nginx 重载配置
sudo nginx -t && sudo systemctl reload nginx

# 续期 SSL 证书
sudo certbot renew --dry-run   # 先试运行
sudo certbot renew              # 正式续期

# 查看磁盘使用
df -h

# 查看内存使用
free -h
pm2 monit

# 部署更新
cd /var/www/guangwei_cloud/basketball
git pull
npm install                   # 如有依赖更新
npm rebuild                   # 如有 native 模块变更
pm2 restart gw-basketball
```

---

> **文档版本**：v1.0  
> **下次评审**：建议在项目交接完成后 30 天内，由接手开发者反馈补充
