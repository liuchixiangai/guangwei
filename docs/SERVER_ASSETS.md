# 光为云记分系统 — 服务器资产清单 & 迁移方案（SERVER_ASSETS.md）

> **整理人**：Rex（SRE 工程师）
> **资产来源**：腾讯云轻量服务器 43.129.194.168
> **整理日期**：2026-05-24
> **目的**：完整记录当前服务器上的所有资产，支撑后续迁移到 daobo.live

---

## 一、服务器基础信息

| 属性 | 值 |
|------|-----|
| **IP 地址** | 43.129.194.168 |
| **云服务商** | 腾讯云轻量应用服务器 |
| **操作系统** | Ubuntu 22.04 LTS |
| **CPU** | 2 核 |
| **内存** | 1.9 GB RAM |
| **Swap** | 10 GB |
| **磁盘** | 40 GB SSD |
| **磁盘已用** | 29 GB（72.5%） |
| **磁盘可用** | 9 GB（22.5%） |
| **Node.js** | v20.20.2 |
| **npm** | 10.8.2 |
| **PM2** | v7.0.1 |
| **Git** | 已安装 |
| **Nginx** | 已安装 |
| **Certbot** | 已安装（Let's Encrypt） |

---

## 二、PM2 进程清单（guangwei 项目相关）

| PM2 ID | 进程名 | 端口 | 版本 | 入口文件 | 内存占用 | 重启次数 | 状态 |
|--------|--------|------|------|----------|----------|----------|------|
| 1 | **gw-football** | 3004 | 3.0.0 | `/var/www/guangwei_cloud/football/server.js` | ~11 MB | 3 | online |
| 8 | **gw-basketball** | 3002 | 3.0.0 | `/var/www/guangwei_cloud/basketball/server.js` | ~20 MB | 1 | online |
| 7 | **gw-namebar** | 3003 | 1.0.0 | `/var/www/guangwei_cloud/namebar/server.js` | ~13 MB | 16 | online |

> **注意**：gw-namebar 重启次数 16 次异常偏高，迁移后需排查稳定性问题。

### 非本项目进程

| PM2 ID | 进程名 | 端口 | 说明 |
|--------|--------|------|------|
| 6 | daobo-live | 3001 | Next.js 应用，属于 daobo.live 项目，**不在本次迁移范围** |

### 端口占用总览

| 端口 | 进程 | 类型 |
|------|------|------|
| 3001 | daobo-live（非本项目） | HTTP |
| 3002 | gw-basketball | HTTP + WebSocket |
| 3003 | gw-namebar | HTTP + WebSocket |
| 3004 | gw-football | HTTP + WebSocket |

---

## 三、项目目录结构（/var/www/guangwei_cloud/）

### 3.1 完整文件树

```
/var/www/guangwei_cloud/
│
├── landing/                          ← 静态首页（生产级，Nginx 直接 serve）
│   ├── index.html                    ★ 产品首页
│   ├── favicon.svg                   ★
│   ├── robots.txt                    ★ SEO
│   ├── sitemap.xml                   ★ SEO
│   ├── basketball/                   ★ 篮球子页面（静态）
│   ├── football/                     ★ 足球子页面（静态）
│   ├── scoreboard/                   ★ 记分子页面（静态）
│   ├── compare/                      ★ 对比子页面（静态）
│   ├── embed/                        ★ 嵌入子页面（静态）
│   └── faq/                          ★ FAQ 子页面（静态）
│
├── namebar/                          ★ 人名条应用（生产级）
│   ├── server.js                     ★ 主服务（v2.2）
│   ├── db.js                         ★ 数据库操作模块
│   ├── admin.html                    ★ 管理端
│   ├── view.html                     ★ 展示端
│   ├── package.json                  ★ 依赖声明
│   ├── node_modules/                 ★ 运行时依赖
│   └── data/
│       ├── scoreboard.db             ★★★ SQLite 主库
│       ├── scoreboard.db-wal         ★★★ WAL 日志（必须一同备份）
│       └── scoreboard.db-shm         ★★★ 共享内存文件（必须一同备份）
│
├── basketball/                       ★ 篮球记分应用（生产级）
│   ├── server.js                     ★ 主服务（v3.1）
│   ├── db.js                         ★ 数据库操作模块
│   ├── admin.html                    ★ 管理端
│   ├── view.html                     ★ 展示端
│   ├── cast.html                     ★ 投屏端
│   ├── package.json                  ★ 依赖声明
│   ├── node_modules/                 ★ 运行时依赖
│   └── data/
│       ├── scoreboard.db             ★★★ SQLite 主库
│       ├── scoreboard.db-wal         ★★★ WAL 日志
│       └── scoreboard.db-shm         ★★★ 共享内存文件
│
├── football/                         ★ 足球记分应用（生产级）
│   ├── server.js                     ★ 主服务（v5.2）
│   ├── db.js                         ★ 数据库操作模块
│   ├── admin.html                    ★ 管理端
│   ├── view.html                     ★ 展示端
│   ├── cast.html                     ★ 投屏端
│   ├── package.json                  ★ 依赖声明
│   ├── node_modules/                 ★ 运行时依赖
│   └── data/
│       ├── scoreboard.db             ★★★ SQLite 主库
│       ├── scoreboard.db-wal         ★★★ WAL 日志
│       └── scoreboard.db-shm         ★★★ 共享内存文件
│
├── node_modules/                     ⚠ 遗留顶层依赖（可清理）
├── server.js.DISABLED                ⚠ 旧入口已禁用
├── server.js.backup.20260512_081722  ⚠ 备份文件
├── game_state.json                   ⚠ 遗留数据
├── rooms_persistent_data.json        ⚠ 遗留数据
├── package.json                      ⚠ 遗留
├── package-lock.json                 ⚠ 遗留
├── admin/                            ⚠ 遗留目录
├── data/                             ⚠ 遗留目录
├── public/                           ⚠ 遗留目录
└── shared/                           ⚠ 遗留目录
```

**图例**：
- ★ = 生产必须文件，迁移不可遗漏
- ★★★ = 核心数据资产，丢失即数据永久丢失
- ⚠ = 遗留文件，建议清理，不需要迁移

---

## 四、数据库资产（核心数据）

### 4.1 数据库文件清单

| 序号 | 应用 | 数据库文件组 | 表名 | 用途 | 重要程度 |
|------|------|------------|------|------|----------|
| 1 | namebar | `namebar/data/scoreboard.db` + `.db-wal` + `.db-shm` | `room_snapshots` | 人名条房间状态快照 | 🔴 核心 |
| 2 | basketball | `basketball/data/scoreboard.db` + `.db-wal` + `.db-shm` | `operators`, `room_snapshots`, `operations` | 篮球操作员、房间状态、操作日志 | 🔴 核心 |
| 3 | football | `football/data/scoreboard.db` + `.db-wal` + `.db-shm` | `operators`, `room_snapshots`, `operations` | 足球操作员、房间状态、操作日志 | 🔴 核心 |

### 4.2 数据库表结构

#### namebar/scoreboard.db
```
room_snapshots
  — 存储人名条每个房间的当前快照
  — 包含：房间ID、人名列表、显示配置等
```

#### basketball/scoreboard.db & football/scoreboard.db
```
operators
  — 操作员/管理员账号信息
  — 包含：用户名、密码哈希、权限等

room_snapshots
  — 每个记分房间的完整状态快照
  — 包含：比分、队伍信息、球员信息、计时器状态等

operations
  — 操作日志记录
  — 包含：操作时间、操作类型、操作前后状态等
```

### 4.3 数据库备份关键提醒

> **⚠️ SQLite WAL 模式下的备份陷阱**：
> 
> 这些数据库使用 WAL（Write-Ahead Logging）模式，数据可能分布在三个文件中：
> - `scoreboard.db` — 主数据库文件
> - `scoreboard.db-wal` — 写入前日志（未合并到主库的事务）
> - `scoreboard.db-shm` — 共享内存索引
> 
> **只复制 .db 文件会导致 WAL 中未合并的数据永久丢失！**
> 
> **正确做法**：
> 1. 先停止应用（`pm2 stop gw-xxx`），触发 WAL checkpoint，再复制
> 2. 或使用 `sqlite3 scoreboard.db "VACUUM INTO '/backup/path.db'"` 导出
> 3. 或至少三个文件一起复制（`.db` + `.db-wal` + `.db-shm`）

---

## 五、Nginx 配置资产

### 5.1 配置文件位置

| 配置项 | 文件路径 | 用途 |
|--------|----------|------|
| 主配置 | `/etc/nginx/nginx.conf` | Nginx 全局设置 |
| Landing 站点 | `/etc/nginx/sites-available/guangwei.cloud` | guangwei.cloud 首页 + /namebar/ 代理 |
| 篮球站点 | `/etc/nginx/sites-available/basketball.guangwei.cloud` | basketball.guangwei.cloud |
| 足球站点 | `/etc/nginx/sites-available/football.guangwei.cloud` | football.guangwei.cloud |
| 启用链接 | `/etc/nginx/sites-enabled/guangwei.cloud` → `../sites-available/guangwei.cloud` | |
| 启用链接 | `/etc/nginx/sites-enabled/basketball.guangwei.cloud` → `../sites-available/basketball.guangwei.cloud` | |
| 启用链接 | `/etc/nginx/sites-enabled/football.guangwei.cloud` → `../sites-available/football.guangwei.cloud` | |

### 5.2 站点配置摘要

#### guangwei.cloud（Landing + Namebar 代理）
```
server_name: guangwei.cloud www.guangwei.cloud
监听: 80 (HTTP) + 443 (HTTPS)
根目录: /var/www/guangwei_cloud/landing  (静态文件)
/namebar/ → proxy_pass http://localhost:3003/  (WebSocket 支持)
/ → try_files $uri $uri/ =404
```

#### basketball.guangwei.cloud
```
server_name: basketball.guangwei.cloud
监听: 80 (HTTP) + 443 (HTTPS)
/ → proxy_pass http://127.0.0.1:3002  (含 WebSocket 升级头)
/ws → proxy_pass http://127.0.0.1:3002 (纯 WebSocket, read_timeout=86400s)
```

#### football.guangwei.cloud ⚠️ 存在配置 BUG
```
server_name: football.guangwei.cloud
监听: 80 (HTTP) + 443 (HTTPS)
当前配置: proxy_pass → http://127.0.0.1:3003  ← 错误的端口！
正确应该: proxy_pass → http://127.0.0.1:3004  ← 足球实际运行端口
```

### 5.3 已知配置问题

| 问题 | 严重程度 | 详情 |
|------|----------|------|
| **football Nginx 端口错误** | 🔴 严重 | `proxy_pass` 指向 3003（namebar 的端口），但 football 进程运行在 3004。意味着通过 Nginx 代理的 football 流量实际上被路由到了 namebar 服务。需立即修复。 |
| namebar 重启次数异常 | 🟡 警告 | 16 次重启，可能存在内存泄漏或未处理的异常。迁移后需排查。 |
| 磁盘使用 72.5% | 🟡 注意 | 可用空间仅 9GB，建议清理遗留文件。 |

---

## 六、SSL 证书资产

| 属性 | 值 |
|------|-----|
| **颁发机构** | Let's Encrypt（通过 Certbot） |
| **证书路径** | `/etc/letsencrypt/live/guangwei.cloud-0001/` |
| **完整证书链** | `/etc/letsencrypt/live/guangwei.cloud-0001/fullchain.pem` |
| **私钥** | `/etc/letsencrypt/live/guangwei.cloud-0001/privkey.pem` |
| **覆盖域名** | `guangwei.cloud`、`www.guangwei.cloud`、`basketball.guangwei.cloud`、`football.guangwei.cloud` |
| **续期方式** | Certbot systemd timer 自动续期 |
| **Certbot 配置** | `/etc/letsencrypt/renewal/guangwei.cloud-0001.conf` |

> **迁移说明**：SSL 证书**不能直接复制到新服务器**。需要在目标服务器上重新申请（`certbot --nginx`），或将域名 DNS 先指向新服务器 IP 后再申请。

---

## 七、域名资产

| 域名 | DNS 类型 | 记录值 | 用途 |
|------|----------|--------|------|
| `guangwei.cloud` | A 记录 | 43.129.194.168 | 产品首页（Landing） |
| `www.guangwei.cloud` | A 记录 | 43.129.194.168 | www 子域名（跳转到主域名） |
| `basketball.guangwei.cloud` | A 记录 | 43.129.194.168 | 篮球记分应用 |
| `football.guangwei.cloud` | A 记录 | 43.129.194.168 | 足球记分应用 |

> **迁移说明**：迁移到 daobo.live 后，这些域名的 DNS A 记录需要更新为新服务器 IP。建议先降低 TTL 值（如 300 秒），迁移完成后切 DNS，最小化切换时间。

---

## 八、必须备份和迁移的文件清单

### 8.1 绝对不可遗漏（数据资产 🔴）

| 路径 | 说明 | 备份方式 |
|------|------|----------|
| `/var/www/guangwei_cloud/namebar/data/scoreboard.db` | 人名条数据库 | 停服后直接复制 3 个文件 |
| `/var/www/guangwei_cloud/namebar/data/scoreboard.db-wal` | 人名条 WAL 日志 | 同上 |
| `/var/www/guangwei_cloud/namebar/data/scoreboard.db-shm` | 人名条共享内存 | 同上 |
| `/var/www/guangwei_cloud/basketball/data/scoreboard.db` | 篮球数据库 | 停服后直接复制 3 个文件 |
| `/var/www/guangwei_cloud/basketball/data/scoreboard.db-wal` | 篮球 WAL 日志 | 同上 |
| `/var/www/guangwei_cloud/basketball/data/scoreboard.db-shm` | 篮球共享内存 | 同上 |
| `/var/www/guangwei_cloud/football/data/scoreboard.db` | 足球数据库 | 停服后直接复制 3 个文件 |
| `/var/www/guangwei_cloud/football/data/scoreboard.db-wal` | 足球 WAL 日志 | 同上 |
| `/var/www/guangwei_cloud/football/data/scoreboard.db-shm` | 足球共享内存 | 同上 |

### 8.2 生产必须文件（代码资产 🟡）

| 路径 | 说明 |
|------|------|
| `/var/www/guangwei_cloud/landing/` | 整个静态首页目录（含所有子页面） |
| `/var/www/guangwei_cloud/namebar/server.js` | 人名条主服务 |
| `/var/www/guangwei_cloud/namebar/db.js` | 人名条数据库模块 |
| `/var/www/guangwei_cloud/namebar/admin.html` | 人名条管理端 |
| `/var/www/guangwei_cloud/namebar/view.html` | 人名条展示端 |
| `/var/www/guangwei_cloud/namebar/package.json` | 人名条依赖声明 |
| `/var/www/guangwei_cloud/basketball/server.js` | 篮球主服务 |
| `/var/www/guangwei_cloud/basketball/db.js` | 篮球数据库模块 |
| `/var/www/guangwei_cloud/basketball/admin.html` | 篮球管理端 |
| `/var/www/guangwei_cloud/basketball/view.html` | 篮球展示端 |
| `/var/www/guangwei_cloud/basketball/cast.html` | 篮球投屏端 |
| `/var/www/guangwei_cloud/basketball/package.json` | 篮球依赖声明 |
| `/var/www/guangwei_cloud/football/server.js` | 足球主服务 |
| `/var/www/guangwei_cloud/football/db.js` | 足球数据库模块 |
| `/var/www/guangwei_cloud/football/admin.html` | 足球管理端 |
| `/var/www/guangwei_cloud/football/view.html` | 足球展示端 |
| `/var/www/guangwei_cloud/football/cast.html` | 足球投屏端 |
| `/var/www/guangwei_cloud/football/package.json` | 足球依赖声明 |

### 8.3 基础设施配置文件（配置资产 🟢）

| 路径 | 说明 |
|------|------|
| `/etc/nginx/sites-available/guangwei.cloud` | Landing + Namebar Nginx 配置 |
| `/etc/nginx/sites-available/basketball.guangwei.cloud` | 篮球 Nginx 配置 |
| `/etc/nginx/sites-available/football.guangwei.cloud` | 足球 Nginx 配置 |
| `/etc/nginx/nginx.conf` | Nginx 主配置 |
| `/var/www/guangwei_cloud/backup.sh` | 数据库备份脚本（如已创建） |

### 8.4 不需要迁移（可忽略 ⚪）

| 路径 | 原因 |
|------|------|
| `*/node_modules/` | 由 `npm install` 重新生成 |
| `server.js.DISABLED` | 已禁用的旧文件 |
| `server.js.backup.*` | 历史备份 |
| `game_state.json` | 遗留数据 |
| `rooms_persistent_data.json` | 遗留数据 |
| `/var/www/guangwei_cloud/node_modules/` | 遗留顶层依赖 |
| `/var/www/guangwei_cloud/admin/` | 遗留目录 |
| `/var/www/guangwei_cloud/data/` | 遗留目录 |
| `/var/www/guangwei_cloud/public/` | 遗留目录 |
| `/var/www/guangwei_cloud/shared/` | 遗留目录 |
| `/var/www/guangwei_cloud/package.json` | 遗留 |
| `/var/www/guangwei_cloud/package-lock.json` | 遗留 |

---

## 九、当前服务器资源使用情况

### 9.1 磁盘

```
总量:     40 GB
已用:     29 GB  (72.5%)
可用:      9 GB  (22.5%)

占用分析（估算）:
├── /var/www/guangwei_cloud/       ~500 MB   (项目代码+依赖)
├── /var/log/                      ~2 GB     (Nginx + 系统日志)
├── /usr/                          ~8 GB     (系统软件)
├── node_modules (各子目录)         ~300 MB   (npm 依赖)
├── PM2 日志                       ~数百MB
└── 其他系统文件                    ~18 GB
```

> **风险评估**：可用空间仅 9GB，如果有大量日志堆积或数据库增长，可能在 3-6 个月内耗尽。建议迁移前清理不必要的文件，或在迁移后配置日志轮转。

### 9.2 内存

```
总量:     1.9 GB
Swap:     10 GB

PM2 进程内存占用:
├── gw-basketball     ~20 MB
├── gw-namebar        ~13 MB
├── gw-football       ~11 MB
├── daobo-live        ~11 MB
└── 其他(Nginx/系统)   ~500 MB
─────────────────────────────
总计:                 ~555 MB

剩余可用: ~1.3 GB（充足）
```

> **评估**：内存使用正常，远未达到 1.9GB 上限。各 Node 进程内存占用合理。

### 9.3 进程资源占用

| 进程 | CPU | 内存 | 说明 |
|------|-----|------|------|
| gw-basketball | 低 | ~20 MB | 正常 |
| gw-football | 低 | ~11 MB | 正常 |
| gw-namebar | 低 | ~13 MB | 正常但重启 16 次，需排查 |
| Nginx | 极低 | ~5 MB | 正常 |

---

## 十、复制部署到 daobo.live 新服务器

> **关键澄清**：这是**复制**（Copy），不是**迁移**（Migrate）。
> 源服务器 43.129.194.168 **全程不停止、不删除、不切换 DNS**。新服务器独立运行，两套系统并行。

### 10.1 复制策略总览

```
目标: 将 guangwei.cloud 的记分系统复制到 daobo.live 服务器（1.13.187.173）
策略: 整体复制（Copy & Deploy），不做代码改动
原则: 源站零停机、源站零影响、各自独立运行、可随时废弃新站
```

### 10.2 目标服务器前提条件

在目标服务器（1.13.187.173 / daobo.live）上需满足：

| 条件 | 要求 |
|------|------|
| OS | Ubuntu 20.04+ 或 22.04 LTS |
| Node.js | v18+（建议 v20 LTS） |
| 磁盘 | 至少 5GB 可用空间 |
| 内存 | 至少 512MB 可用（三个 Node 进程共需 ~50MB） |
| 端口 | 3002、3003、3004 未被占用 |
| 网络 | 可访问外网（npm install 需要） |

### 10.3 复制步骤（源站零停机）

#### Step 1: 环境准备（目标服务器）

```bash
ssh ubuntu@1.13.187.173

# 安装 PM2
npm i -g pm2

# better-sqlite3 编译依赖
sudo apt install -y build-essential python3

# 创建目录
sudo mkdir -p /var/www/guangwei_cloud
sudo chown -R ubuntu:ubuntu /var/www/guangwei_cloud

# 确认端口
lsof -i :3002 :3003 :3004
# 应无输出（端口未被占用）
```

#### Step 2: 代码部署（推荐从 GitHub 直接克隆）

```bash
cd /var/www/guangwei_cloud
git clone https://github.com/liuchixiangai/guangwei.git .

# 三项目安装依赖
cd namebar && npm install && cd ..
cd basketball && npm install && cd ..
cd football && npm install && cd ..
```

> 备选方案：如果 GitHub 不可用，从本地 scp 上传整个 `guangwei/` 目录。

#### Step 3: 创建数据库目录 & 启动服务

```bash
# 为 SQLite 创建数据目录
mkdir -p /var/www/guangwei_cloud/{namebar,basketball,football}/data

# 启动三个服务
pm2 start basketball/server.js --name gw-basketball --env PORT=3002
pm2 start namebar/server.js --name gw-namebar --env PORT=3003
pm2 start football/server.js --name gw-football --env PORT=3004

pm2 save
pm2 startup   # 设置开机自启
```

#### Step 4: 本地验证

```bash
curl -s http://127.0.0.1:3002/ | head -5   # 篮球首页
curl -s http://127.0.0.1:3003/ | head -5   # 人名条首页
curl -s http://127.0.0.1:3004/ | head -5   # 足球首页

pm2 list
# 确认 3 个进程状态为 online，restart 计数为 0
```

#### Step 5: 配置外部访问（可选，按需配置）

两种模式任选其一：

**模式 A — 独立子域名**（推荐，结构清晰）
```
score.daobo.live      → 工具首页（改造 landing）
bball.daobo.live      → 篮球 → proxy_pass http://127.0.0.1:3002
fball.daobo.live      → 足球 → proxy_pass http://127.0.0.1:3004
namebar.daobo.live    → 人名条 → proxy_pass http://127.0.0.1:3003
```

**模式 B — 路径前缀**（省域名，更易整合到 daobo.live 主站）
```
daobo.live/tools/         → 工具首页
daobo.live/tools/bball/   → 篮球 → proxy_pass http://127.0.0.1:3002/
daobo.live/tools/fball/   → 足球 → proxy_pass http://127.0.0.1:3004/
daobo.live/tools/namebar/ → 人名条 → proxy_pass http://127.0.0.1:3003/
```

> ⚠️ **注意**：足球 proxy_pass 必须指向 **3004**（不是 3003！namebar 用 3003）

#### Step 6: SSL 证书（如有域名）

```bash
sudo certbot --nginx -d score.daobo.live -d bball.daobo.live ...
```

### 10.4 时间线估算（源站零停机）

| 步骤 | 操作 | 耗时 | 源站影响 |
|------|------|------|----------|
| Step 1 | 环境准备 | 5 分钟 | 无 |
| Step 2 | 代码克隆 + npm install | 10 分钟 | 无 |
| Step 3 | 启动服务 | 2 分钟 | 无 |
| Step 4 | 本地验证 | 3 分钟 | 无 |
| Step 5-6 | Nginx + SSL | 15 分钟 | 无 |
| **总计** | | **约 35 分钟** | **零！** |

### 10.5 源站 vs 新站对照

| | 源站（保持运行） | 新站（新增） |
|------|------|------|
| **服务器** | 43.129.194.168 | 1.13.187.173 |
| **域名** | guangwei.cloud / *.guangwei.cloud | daobo.live 子域名/路径 |
| **数据库** | 独立（已有数据） | 独立（全新空库） |
| **用户** | 现有用户继续使用 | 新用户/测试用户 |
| **维护** | 继续维护 | 独立维护 |
| **关系** | — | 两套系统互不影响 |

### 10.6 上线通知方式

新站测试通过后，引导用户的方式：

1. **首页横幅**：在源站 landing 页加一行 `"光为云已入驻导播星球 → score.daobo.live"`
2. **渐进迁移**：新旧两套并行，用户自行选择
3. **不强制切换**：源站持续运行，不做 DNS 重定向

### 10.7 风险提示

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| better-sqlite3 编译失败 | 新站部署阻塞 | 确认已安装 build-essential + python3 |
| 端口冲突 | 新站无法启动 | `lsof -i :3002,3003,3004` 提前检查 |
| football 端口配错 | 新站足球不可用 | 牢记：football=3004，namebar=3003 |
| Nginx WebSocket 遗漏 | 实时同步失效 | 确保复制了源站的 `/ws` 代理规则 |
| 源站受影响？ | **不会** | 整个过程完全不接触源服务器 |

---

## 附录：一键备份脚本（如需）

> **注意**：如果从 GitHub 直接克隆代码（推荐），则不需要此备份脚本。
> 以下脚本适用于需要从源服务器完整打包的场景。

在源服务器上执行，生成 Nginx 配置参考包（**不会停止服务**）：

```bash
#!/bin/bash
# 光为云记分系统 — Nginx 配置备份
# 执行位置：源服务器（43.129.194.168）
# 注意：不停止任何服务，仅复制配置文件作为参考

BACKUP_ROOT="/tmp/guangwei_nginx_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_ROOT"

echo "=== 备份 Nginx 配置（参考用） ==="
cp /etc/nginx/sites-available/guangwei.cloud "$BACKUP_ROOT/"
cp /etc/nginx/sites-available/basketball.guangwei.cloud "$BACKUP_ROOT/"
cp /etc/nginx/sites-available/football.guangwei.cloud "$BACKUP_ROOT/"
cp /etc/nginx/nginx.conf "$BACKUP_ROOT/"
echo "  ✓ Nginx 配置已备份到 $BACKUP_ROOT"
echo ""
echo "查看后 scp 到本地参考："
echo "  scp -r ubuntu@43.129.194.168:$BACKUP_ROOT ./"
```

---

> **文档维护**：本清单随服务器环境变化同步更新。复制部署完成后，在新服务器上创建新版本的资产清单。
