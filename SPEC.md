# 导播星球精简版 — 完整开发说明书

> **版本**: 1.0.0  
> **日期**: 2026-06-09  
> **部署地址**: http://1.13.187.173/  
> **GitHub**: https://github.com/liuchixiangai/guangwei (分支 `daobo-lite`)  
> **本地路径**: D:\daobo-lite\

---

## 一、项目定位

导播星球精简版是一个**直播导播工具平台首页**，作为"光为云字幕"矩阵的替代品牌入口。项目当前包含首页 + 两个子入口页面 + 留言墙 + 支持者模块，为会议直播和赛事直播提供工具聚合入口。

**核心理念**: 工具聚合平台，不是内容社区。当前阶段专注工具导航，预留未来扩展。

---

## 二、技术栈

| 层次 | 技术 |
|------|------|
| 后端框架 | Express 4.x |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 前端 | 纯 HTML/CSS/JS（无框架，零构建） |
| CSS 方案 | 内联 `<style>` 标签，移动端优先 |
| 运行环境 | Node.js ≥ 18，PM2 管理 |
| 反向代理 | Nginx（`/` → 3005） |

---

## 三、目录结构

```
daobo-lite/
├── server.js              ← Express 主入口（端口 3005）
├── db.js                  ← SQLite 数据库层
├── package.json           ← 依赖：express, better-sqlite3, cors
├── .gitignore             ← 排除 node_modules/, data/*.db
├── data/
│   └── daobo.db           ← SQLite 数据库文件（自动创建）
└── public/
    ├── index.html         ← 首页（主页面）
    ├── meeting.html       ← 会议字幕子页面
    ├── sports.html        ← 赛事字幕子页面
    └── u/                 ← 支持者主页目录（预留）
```

---

## 四、数据库设计

### 4.1 数据库文件

- **位置**: `data/daobo.db`
- **模式**: WAL（Write-Ahead Logging）
- **busy_timeout**: 5000ms

### 4.2 表结构

#### messages（留言墙）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| city | TEXT NOT NULL | 城市名，最长 20 字符 |
| content | TEXT NOT NULL | 留言内容，最长 500 字符 |
| likes | INTEGER DEFAULT 0 | 点赞数 |
| is_approved | INTEGER DEFAULT 0 | 0=待审, 1=已通过 |
| is_pinned | INTEGER DEFAULT 0 | 0=普通, 1=置顶 |
| is_hidden | INTEGER DEFAULT 0 | 0=显示, 1=隐藏 |
| created_at | DATETIME | 创建时间（本地时间） |

索引: `(is_approved, is_hidden, is_pinned)`

#### supporters（支持者）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT NOT NULL | 名称 |
| slug | TEXT UNIQUE NOT NULL | URL 标识（/u/:slug） |
| amount | TEXT NOT NULL | 支持金额（如"¥50"） |
| logo_url | TEXT DEFAULT '' | Logo URL |
| bio | TEXT DEFAULT '' | 简介 |
| contact | TEXT DEFAULT '' | 联系方式 |
| custom_html | TEXT DEFAULT '' | 自定义 HTML（主页托管） |
| is_approved | INTEGER DEFAULT 0 | 0=待审, 1=已通过 |
| created_at | DATETIME | 创建时间 |

#### usage_log（使用日志）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| nickname | TEXT NOT NULL | 昵称，最长 20 字符 |
| tool | TEXT NOT NULL | 工具名（会议人名条/篮球计分板/足球计分板） |
| created_at | DATETIME | 使用时间 |

索引: `(created_at)`

### 4.3 模拟数据生成

服务器启动时自动检测 `usage_log` 表是否为空，若为空则生成最近 7 天的模拟数据：

- 每天 20~31 条随机记录
- 时间范围 09:00~20:00
- 昵称池 30 个随机中文昵称（张导/李导/.../阿杰/小陈/...）
- 工具随机三选一
- 未来接入真实数据后：真实记录优先，模拟记录补足

---

## 五、API 完整文档

### 5.1 公开 API（无需鉴权）

#### GET /api/usage — 最近使用日志

**参数**: `?limit=50`（默认 50，最大 200）

**返回**:
```json
[
  {"id":185,"nickname":"老K","tool":"会议人名条","created_at":"2026-06-09 11:48:46"},
  ...
]
```

#### GET /api/messages — 留言列表

**参数**: `?page=1&limit=20`（limit 最大 50）

**返回**:
```json
{
  "rows": [
    {"id":1,"city":"合肥","content":"...","likes":28,"is_pinned":1,"created_at":"..."}
  ],
  "total": 4,
  "page": 1,
  "limit": 20
}
```

> 仅返回已审核（is_approved=1）且未隐藏（is_hidden=0）的留言，置顶优先排列。

#### POST /api/messages — 提交留言

**请求体**: `{"city":"合肥", "content":"留言内容"}`

**校验**: city 非空，content 非空且 ≤ 500 字符

**返回**: `{"success":true,"message":"留言已提交，审核通过后展示"}`

#### POST /api/messages/:id/like — 点赞

**返回**: `{"success":true,"likes":29}`

> 无登录态，纯前端通过 `data-liked` 属性防止重复点击。后端不做去重。

#### GET /api/supporters — 支持者列表

**返回**: 已审核的支持者数组（按创建时间倒序）

#### GET /u/:slug — 支持者主页

动态渲染 HTML 页面：
- 若有 `custom_html`：渲染自定义内容（HTML 托管模式）
- 无 `custom_html`：渲染默认模板（名称 + Logo + 简介 + 联系方式 + 返回链接）

### 5.2 管理 API（需要 Token）

**鉴权方式**: 三种渠道任选其一
- Query: `?token=daobo-admin-2026`
- Body: `{"token":"daobo-admin-2026"}`
- Header: `X-Admin-Token: daobo-admin-2026`

**默认 Token**: `daobo-admin-2026`（可通过环境变量 `ADMIN_TOKEN` 覆盖）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/messages?page=1` | 查看所有留言（含未审核） |
| POST | `/admin/messages/:id/approve` | 审核通过 |
| POST | `/admin/messages/:id/pin` | 切换置顶状态 |
| POST | `/admin/messages/:id/hide` | 切换隐藏/显示 |
| POST | `/admin/messages/:id/likes` | 设置点赞数 `{"likes":100}` |
| DELETE | `/admin/messages/:id` | 删除留言 |
| GET | `/admin/supporters` | 查看所有支持者 |
| POST | `/admin/supporters` | 新增支持者（自动审核通过） |
| PUT | `/admin/supporters/:id` | 更新支持者信息 |
| POST | `/admin/supporters/:id/approve` | 审核通过 |
| DELETE | `/admin/supporters/:id` | 删除支持者 |
| POST | `/admin/usage/seed` | 重新生成模拟数据 |

---

## 六、页面设计规范

### 6.1 全局设计系统

#### 颜色体系

| 用途 | 颜色值 |
|------|--------|
| 页面背景 | `#070b18` |
| 正文颜色 | `#e0e4f0` |
| 主色调（靛蓝） | `#6366F1` |
| 主色调深色 | `#4F46E5` |
| 主色调浅色 | `#A5B4FC` |
| 橙色强调 | `#FF6B00` |
| 绿色强调 | `#22C55E` |
| 红色强调 | `#EF4444` |
| 文字微弱 | `rgba(255,255,255,.15)` ~ `.5` |
| 卡片背景 | `rgba(255,255,255,.02)` ~ `.025` |
| 卡片边框 | `rgba(255,255,255,.04)` ~ `.06` |

#### 字体

```
font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif
```

#### 层级

| 元素 | z-index |
|------|---------|
| 顶部导航 | 100 |
| Toast | 999 |

#### 圆角

- 大卡片: 16px
- 中卡片: 12-14px
- 小元素（按钮/输入框）: 8-10px
- 标签/徽章: 10-20px

### 6.2 首页（index.html）逐区块规格

#### 区块 0: 顶部固定导航

- `position:fixed; top:0; z-index:100`
- 高度自适应（padding:12px 20px）
- 背景: `rgba(7,11,24,.92)` + `backdrop-filter:blur(16px)`
- 底部边框: `1px solid rgba(255,255,255,.06)`
- 左侧: 品牌 Logo "导播·星球"（"星球"为 #6366F1 色）
- 右侧: 水平链接列表（人名条 / 篮球 / 足球）→ 指向 `/tools/namebar/admin.html` 等
- 链接默认 `rgba(255,255,255,.5)`，hover 时 `#6366F1`

#### 区块 1: Hero Banner

- 最小高度: `520px`（移动端 `420px`）
- 三层背景叠加:
  1. 3 个径向渐变光晕（靛蓝/橙色/绿色）
  2. 60px 网格线（opacity:.03）
  3. 6 个行业 Emoji 图标（🎥📡🏟️🎙️💡📺），opacity:.12，grayscale(.5)，固定定位分布
- 内容区 `.hero-content` max-width:680px，z-index:2
- 徽章: 圆角 20px，靛蓝半透背景，"直播导播工具平台"
- 主标题: 渐变文字 `#fff → #A5B4FC`，`font-size: clamp(28px, 5.5vw, 48px)`，weight:900
- 副标题: "服务会议直播 · 赛事直播 · 活动直播"，`rgba(255,255,255,.45)`
- Tagline: 工具列表简述，`rgba(255,255,255,.3)`
- CTA 按钮: 渐变色 `#6366F1 → #4F46E5`，圆角 12px，带 box-shadow 发光，hover 上移 2px

#### 区块 2: 数据统计条

- 三个数字: 1,200+ / 8,500+ / 99.9%
- 标签: 累计导播 / 直播场次 / 运行稳定
- 居中 flex 布局，gap:32px

#### 区块 3: 工具导航（#tools）

- 双列 grid: `grid-template-columns: repeat(2, 1fr)`，max-width:720px
- 左边卡片: 🎤 会议字幕 → `/meeting.html`，hover 靛蓝边框
- 右边卡片: ⚽ 赛事字幕 → `/sports.html`，hover 橙色边框
- 每张卡片: 图标(44px) + 标题(18px/800) + 描述(12px) + 标签行
- hover 上移 4px

#### 区块 4: 最近使用（#recent）

- 列表项: flex 行，左侧紫色圆点(6px) + 时间(100px 最小宽度) + 昵称 + 工具名
- 从 `/api/usage?limit=20` 拉取数据
- 时间格式: MM/DD HH:mm（`toLocaleString('zh-CN')`）
- 空态: "暂无记录"

#### 区块 5: 留言墙（#wall）

包含两部分：

**提交表单**:
- 城市输入框（flex:0 0 120px）+ 留言输入框（flex:1）
- 单按钮:"提交留言"（全宽渐变按钮）
- 提示文字: "留言提交后需审核"
- 提交后清空表单 + 绿色 Toast

**留言列表**:
- 卡片: padding:18px 20px，圆角 12px
- 城市标签（📍前缀 + `#A5B4FC` 色）
- 留言正文（`rgba(255,255,255,.7)`，line-height:1.7）
- 底部: 时间（左对齐）+ 点赞按钮（右对齐，👍 emoji）
- 置顶卡片: 靛蓝边框 + `📌 置顶` 标签
- 点赞按钮: 未点赞时靛蓝 hover，已点赞时红色（`#EF4444`），`data-liked` 防重复

#### 区块 6: 支持者（#support）

- 标题: "感谢以下机构和个人对导播星球的支持"
- 说明: "导播星球目前由个人持续开发和维护..."
- 列表项: 日期(80px) + 名称链接(`/u/:slug`) + 金额（靛蓝色右对齐）
- 名称 hover 变靛蓝

#### 区块 7: SEO 关键词区

- 20 个关键词标签，flex-wrap 排列
- 每个标签: padding:6px 14px，圆角 20px，极淡背景 + 边框
- 关键词: 导播工具/会议直播/体育直播/OBS/vMix/字幕条/计分板/篮球记分/足球记分/导播台/直播字幕/人名条/浏览器源/XML数据源/免费记分牌/赛事直播/活动直播/远程控制/多人协同/手机控制/直播导播

#### 区块 8: 页脚

- 版权信息 + 首页链接
- `border-top` 分隔线
- 文字颜色极淡（opacity:.15）

### 6.3 移动端适配

#### ≤640px 断点

| 元素 | 变更 |
|------|------|
| 导航 | padding 缩小至 10px 14px |
| Hero | 最小高度 420px; 隐藏装饰图标 |
| 工具卡片 | padding 缩小至 28px 16px; 图标 36px |
| 统计条 | gap:20px |
| 最近使用 | flex-wrap:wrap; 时间列不设最小宽度 |
| 留言表单 | 城市和内容输入框纵向堆叠 |
| 留言卡片 | padding 缩小至 14px 16px |

#### ≤380px 断点（窄屏如 iPhone SE）

| 元素 | 变更 |
|------|------|
| Hero 标题 | font-size: 22px |
| 工具卡片 | padding 22px 12px; gap:8px; 标题 15px |
| CTA 按钮 | padding 12px 28px; font-size 14px |

### 6.4 交互行为

#### Toast 通知

- 位置: 底部居中，`position:fixed`
- 成功: `#22C55E` 背景
- 错误: `#EF4444` 背景
- 自动消失: 2.5 秒后 opacity 淡出

#### 点赞

- 单击即变红，`data-liked` 标记防止重复
- 发送 `POST /api/messages/:id/like`
- 显示最新点赞数
- 无登录态限制（简单实现）

#### 留言提交

- 校验城市和内容非空
- 提交后清空输入框
- 提示审核中

#### 数据加载

- 页面加载时同时发起 3 个 fetch（usage/messages/supporters）
- 每个模块独立加载，失败不阻塞其他模块

---

## 七、子页面规格

### 7.1 meeting.html（会议字幕）

- 顶部: 返回链接 + 标题 "🎤 会议字幕" + 副标题
- Grid 布局: `repeat(auto-fill, minmax(260px, 1fr))`
- 四项:
  1. 会议人名条 → `/tools/namebar/admin.html`（已上线）
  2. 嘉宾介绍卡（即将上线）
  3. 倒计时（即将上线）
  4. 议程条（即将上线）
- 已上线工具: 可点击链接，hover 靛蓝边框 + 上移动画
- 未上线工具: 不可点击，灰色"即将上线"标签

### 7.2 sports.html（赛事字幕）

- 同上结构，标题 "⚽ 赛事字幕"
- 四项:
  1. 篮球计分板 → `/tools/bball/admin.html`（已上线）
  2. 足球计分板 → `/tools/fball/admin.html`（已上线）
  3. 排球计分（即将上线）
  4. 羽毛球计分（即将上线）
- hover 橙色边框（区别于会议的靛蓝色）

---

## 八、部署架构

### 8.1 服务器

- **IP**: 1.13.187.173
- **系统**: Ubuntu 24.04 LTS
- **PM2 进程**: `gw-daobo`（端口 3005）
- **数据库文件**: `/var/www/guangwei_cloud/daobo/data/daobo.db`

### 8.2 Nginx 路由

```
/                         → proxy_pass http://127.0.0.1:3005/
/tools/bball/             → proxy_pass http://127.0.0.1:3002/
/tools/namebar/           → proxy_pass http://127.0.0.1:3003/
/tools/fball/             → proxy_pass http://127.0.0.1:3004/
/tools/*/ws               → WebSocket 升级（单独 location）
```

### 8.3 启动命令

```bash
cd /var/www/guangwei_cloud/daobo
npm install
pm2 start server.js --name gw-daobo --env PORT=3005
pm2 save
```

---

## 九、依赖项

```json
{
  "express": "^4.21.0",
  "better-sqlite3": "^11.0.0",
  "cors": "^2.8.5"
}
```

> better-sqlite3 需要在目标服务器上编译，需预装 `build-essential` 和 `python3`。

---

## 十、已知设计决策

1. **前端无框架**: 纯 HTML/CSS/JS，避免构建步骤，适合快速迭代和 OBS/vMix 集成场景
2. **CSS 内联**: 所有样式在 `<style>` 标签中，无外部 CSS 文件，减少请求
3. **SQLite 而非 MySQL**: 轻量部署，零配置，适合单服务器场景
4. **管理员 Token 鉴权**: 简单字符串比对，不涉 JWT/Session，适合内部小团队使用
5. **点赞无去重**: 纯前端 `data-liked` 标记，后续可按需加 IP/Cookie 去重
6. **支持者主页为 HTML 托管**: 允许完全自定义，本质是 CMS-lite
7. **模拟数据在启动时生成**: `seedMockUsage()` 幂等（检测空表），不影响已有数据
8. **留言必须先审核后展示**: `is_approved=0` 的留言不对外暴露

---

## 十一、重建检查清单

重新开发时请逐项验证：

- [ ] 首页 Banner: 三层背景（光晕+网格+图标）、渐变标题、CTA 按钮
- [ ] 顶部导航: 固定定位、毛玻璃效果、品牌色"星球"字样
- [ ] 工具卡片: 双列 grid、hover 效果（会议靛蓝/赛事橙色）
- [ ] 最近使用: 数据加载、时间格式化、空态处理
- [ ] 留言墙: 表单提交→审核→展示→点赞 全流程
- [ ] 支持者: 列表+主页渲染
- [ ] SEO 标签区 20 个关键词
- [ ] 移动端: 640px/380px 双断点
- [ ] 所有 API 返回格式与上述文档一致
- [ ] 管理员 Token 鉴权覆盖所有 `/admin/*` 路由
- [ ] SQLite WAL 模式 + 启动时自动建表
- [ ] 模拟数据幂等生成（检测空表）
- [ ] 会议/赛事子页面: 已上线工具可点击，预留工具有"即将上线"标签
