# 导播星球（精简版）

直播导播工具平台首页 — 独立于光为云字幕计分系统。

## 功能

- 🏠 产品首页（Banner + 工具导航 + 最近使用 + 留言墙 + 支持者）
- 🎤 会议字幕页
- ⚽ 赛事字幕页
- 📝 留言墙（提交 / 审核 / 点赞）
- 🙏 支持者模块 + 个人主页（`/u/:slug`）
- 📊 最近使用动态

## 技术栈

- Node.js + Express
- SQLite（better-sqlite3）
- 纯 HTML/CSS/JS（无框架，移动端优先）

## 快速开始

```bash
npm install
mkdir -p data
node server.js    # 默认端口 3005
```

## 部署地址

http://1.13.187.173/

## 关联服务

本项目的工具入口链接到以下独立服务（同一服务器）：

| 工具 | 端口 | Nginx 路由 |
|------|------|-----------|
| 篮球计分板 | 3002 | `/tools/bball/` |
| 会议人名条 | 3003 | `/tools/namebar/` |
| 足球计分板 | 3004 | `/tools/fball/` |

## 管理后台

管理员 Token: 环境变量 `ADMIN_TOKEN`（默认 `daobo-admin-2026`）

```bash
# 审核留言
curl -X POST '/admin/messages/1/approve?token=daobo-admin-2026'

# 添加支持者
curl -X POST '/admin/supporters?token=daobo-admin-2026' \
  -H 'Content-Type: application/json' \
  -d '{"name":"...","slug":"...","amount":"...","bio":"..."}'
```
