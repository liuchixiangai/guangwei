# 光为云记分系统 — 部署手册（DEPLOY.md）

> **适用对象**：不熟悉 Linux 服务器的运维新手。每一步都配有完整的命令，直接复制粘贴即可执行。
>
> **适用环境**：Ubuntu 22.04 LTS（其他 Ubuntu 版本类似）
>
> **最后更新**：2026-05-24

---

## 目录

1. [安装 Node.js (v20.x)](#1-安装-nodejs-v20x)
2. [安装 Git 并克隆仓库](#2-安装-git-并克隆仓库)
3. [项目目录结构](#3-项目目录结构)
4. [安装项目依赖](#4-安装项目依赖)
5. [PM2 安装与配置](#5-pm2-安装与配置)
6. [Nginx 安装与配置](#6-nginx-安装与配置)
7. [HTTPS 配置（Certbot）](#7-https-配置certbot)
8. [域名 DNS 绑定](#8-域名-dns-绑定)
9. [日常更新流程](#9-日常更新流程)
10. [紧急回滚流程](#10-紧急回滚流程)
11. [日常维护](#11-日常维护)

---

## 1. 安装 Node.js (v20.x)

本项目使用 **Node.js v20**，推荐使用 NodeSource 官方源安装。

### 1.1 添加 NodeSource 仓库并安装

```bash
# 下载并执行 NodeSource v20.x 安装脚本
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# 安装 Node.js（会自动安装 npm）
sudo apt-get install -y nodejs
```

### 1.2 验证安装

```bash
node -v    # 应输出 v20.x.x
npm -v     # 应输出 10.x.x
```

### 1.3 备选方案：使用 nvm（Node Version Manager）

如果你需要同时管理多个 Node 版本，推荐使用 nvm：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js v20
nvm install 20

# 设置为默认版本
nvm alias default 20

# 验证
node -v
```

---

## 2. 安装 Git 并克隆仓库

### 2.1 安装 Git

```bash
sudo apt-get update
sudo apt-get install -y git
```

### 2.2 配置 Git 用户信息

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

### 2.3 创建项目目录并克隆仓库

```bash
# 创建父目录
sudo mkdir -p /var/www

# 设置权限（让当前用户可以操作）
sudo chown -R $USER:$USER /var/www

# 克隆仓库
cd /var/www
git clone https://github.com/liuchixiangai/guangwei.git

# 重命名为项目目录名
mv guangwei guangwei_cloud
cd /var/www/guangwei_cloud
```

### 2.4 确认仓库结构

```bash
ls -la /var/www/guangwei_cloud/
# 你应该看到以下目录：
# landing/      — 静态首页
# namebar/      — 会议人名条
# basketball/   — 篮球记分
# football/     — 足球记分
```

---

## 3. 项目目录结构

部署完成后，服务器上的目录结构如下：

```
/var/www/guangwei_cloud/          ← 项目根目录
├── landing/                      ← 静态首页（Nginx 直接 serve，不经过 Node）
│   ├── index.html                ← 产品首页
│   ├── favicon.svg
│   ├── robots.txt
│   ├── sitemap.xml
│   └── basketball/               ← 篮球子页面（静态）
│   └── football/                 ← 足球子页面（静态）
│   └── scoreboard/               ← 记分子页面（静态）
│   └── compare/                  ← 对比子页面（静态）
│   └── embed/                    ← 嵌入子页面（静态）
│   └── faq/                      ← FAQ 子页面（静态）
│
├── namebar/                      ← 人名条 WebSocket 应用（端口 3003）
│   ├── server.js                 ← 主入口
│   ├── db.js                     ← 数据库操作模块
│   ├── admin.html                ← 管理端页面
│   ├── view.html                 ← 展示端页面
│   ├── package.json
│   ├── node_modules/
│   └── data/
│       └── scoreboard.db         ← SQLite 数据库文件
│
├── basketball/                   ← 篮球记分 WebSocket 应用（端口 3002）
│   ├── server.js                 ← 主入口
│   ├── db.js                     ← 数据库操作模块
│   ├── admin.html                ← 管理端页面
│   ├── view.html                 ← 展示端页面
│   ├── cast.html                 ← 投屏端页面
│   ├── package.json
│   ├── node_modules/
│   └── data/
│       └── scoreboard.db         ← SQLite 数据库文件
│
└── football/                     ← 足球记分 WebSocket 应用（端口 3004）
    ├── server.js                 ← 主入口
    ├── db.js                     ← 数据库操作模块
    ├── admin.html                ← 管理端页面
    ├── view.html                 ← 展示端页面
    ├── cast.html                 ← 投屏端页面
    ├── package.json
    ├── node_modules/
    └── data/
        └── scoreboard.db         ← SQLite 数据库文件
```

**关键说明**：
- `landing/` 是纯静态文件，Nginx 直接返回，不占用 Node 进程
- 三个子应用（namebar / basketball / football）各自独立，每个都是一个 Express + WebSocket 服务
- 每个子应用使用自己的 SQLite 数据库，互不干扰

---

## 4. 安装项目依赖

### 4.1 安装编译工具（必须先执行！）

`better-sqlite3` 是一个 C++ 原生模块，需要在服务器上编译。必须先安装编译工具链：

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

> **为什么需要这一步？** `better-sqlite3` 包含 C++ 代码，npm install 时会自动编译。没有 `build-essential`（含 gcc/g++/make）和 `python3`，编译会失败。

### 4.2 逐个安装各子应用依赖

每个子应用有独立的 `package.json`，需要分别安装：

```bash
# 进入项目根目录
cd /var/www/guangwei_cloud

# 安装人名条应用依赖
cd namebar && npm install && cd ..

# 安装篮球记分应用依赖
cd basketball && npm install && cd ..

# 安装足球记分应用依赖
cd football && npm install && cd ..
```

### 4.3 验证 better-sqlite3 安装成功

```bash
# 在每个子目录下运行，确认没有报错
cd /var/www/guangwei_cloud/namebar
node -e "const db = require('better-sqlite3')('test.db'); console.log('OK'); db.close()"
rm -f test.db

cd /var/www/guangwei_cloud/basketball
node -e "const db = require('better-sqlite3')('test.db'); console.log('OK'); db.close()"
rm -f test.db

cd /var/www/guangwei_cloud/football
node -e "const db = require('better-sqlite3')('test.db'); console.log('OK'); db.close()"
rm -f test.db
```

如果输出 `OK`，说明安装成功。如果报错，请检查：
- `build-essential` 和 `python3` 是否已安装
- Node.js 版本是否为 v20.x

### 4.4 Node 版本升级后的注意事项

> **重要！** 如果以后升级了 Node.js 版本（如从 v20 升到 v22），必须重新编译 native 模块：

```bash
cd /var/www/guangwei_cloud/namebar && npm rebuild better-sqlite3 && cd ..
cd /var/www/guangwei_cloud/basketball && npm rebuild better-sqlite3 && cd ..
cd /var/www/guangwei_cloud/football && npm rebuild better-sqlite3 && cd ..
```

---

## 5. PM2 安装与配置

PM2 是 Node.js 进程守护工具，确保应用崩溃后自动重启，并在服务器重启后自动启动。

### 5.1 安装 PM2

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 验证
pm2 -v    # 应输出版本号
```

### 5.2 启动各个应用

**注意端口分配**（不要搞混）：

| 应用 | 端口 | 说明 |
|------|------|------|
| basketball | 3002 | 篮球记分 |
| namebar | 3003 | 人名条 |
| football | 3004 | 足球记分（不是 3003！） |

```bash
cd /var/www/guangwei_cloud

# 启动篮球记分（端口 3002）
pm2 start basketball/server.js \
  --name gw-basketball \
  --namespace guangwei \
  --env PORT=3002

# 启动人名条（端口 3003）
pm2 start namebar/server.js \
  --name gw-namebar \
  --namespace guangwei \
  --env PORT=3003

# 启动足球记分（端口 3004）
pm2 start football/server.js \
  --name gw-football \
  --namespace guangwei \
  --env PORT=3004
```

### 5.3 验证所有进程启动

```bash
pm2 list
```

你应该看到 3 个进程状态都是 `online`：

```
┌─────┬───────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id  │ name          │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├─────┼───────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 0   │ gw-basketball │ guangwei    │ 3.0.0   │ fork    │ ...      │ ...    │ 0    │ online    │ 0%       │ ~20mb    │ ...      │ disabled │
│ 1   │ gw-namebar    │ guangwei    │ 1.0.0   │ fork    │ ...      │ ...    │ 0    │ online    │ 0%       │ ~13mb    │ ...      │ disabled │
│ 2   │ gw-football   │ guangwei    │ 3.0.0   │ fork    │ ...      │ ...    │ 0    │ online    │ 0%       │ ~11mb    │ ...      │ disabled │
└─────┴───────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

### 5.4 设置 PM2 开机自启

```bash
# 保存当前进程列表
pm2 save

# 设置 PM2 开机自启（自动检测 init 系统）
pm2 startup

# 执行上面命令输出的那条 sudo 命令（类似下面这样）：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u your_user --hp /home/your_user
```

### 5.5 PM2 常用命令速查

```bash
pm2 list                # 查看所有进程状态
pm2 logs gw-football    # 查看足球应用日志（实时）
pm2 logs --lines 100    # 查看最近 100 行日志
pm2 reload gw-football  # 平滑重启（推荐，0 秒停机）
pm2 restart gw-football # 硬重启
pm2 stop gw-football    # 停止
pm2 flush               # 清空日志
pm2 monit               # 实时监控面板
```

---

## 6. Nginx 安装与配置

Nginx 作为反向代理，将外部请求转发到内部的 Node.js 进程。

### 6.1 安装 Nginx

```bash
sudo apt-get update
sudo apt-get install -y nginx

# 验证
nginx -v
```

### 6.2 基本 Nginx 目录说明

| 路径 | 说明 |
|------|------|
| `/etc/nginx/sites-available/` | 站点配置存放处 |
| `/etc/nginx/sites-enabled/` | 启用的站点（软链接到 sites-available） |
| `/etc/nginx/nginx.conf` | 主配置文件 |
| `/var/log/nginx/` | 日志目录 |

### 6.3 配置 guangwei.cloud（Landing 首页）

```bash
sudo nano /etc/nginx/sites-available/guangwei.cloud
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name guangwei.cloud www.guangwei.cloud;

    # 静态首页直接 serve
    root /var/www/guangwei_cloud/landing;
    index index.html;

    # 人名条代理（WebSocket 支持）
    location /namebar/ {
        proxy_pass http://127.0.0.1:3003/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # 其他请求走静态文件
    location / {
        try_files $uri $uri/ =404;
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### 6.4 配置 basketball.guangwei.cloud（篮球记分）

```bash
sudo nano /etc/nginx/sites-available/basketball.guangwei.cloud
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name basketball.guangwei.cloud;

    # 普通 HTTP 请求
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 专用路由（更长的超时时间）
    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 6.5 配置 football.guangwei.cloud（足球记分）

```bash
sudo nano /etc/nginx/sites-available/football.guangwei.cloud
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name football.guangwei.cloud;

    # 普通 HTTP 请求
    location / {
        proxy_pass http://127.0.0.1:3004;   # ← 注意：是 3004，不是 3003！
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 专用路由
    location /ws {
        proxy_pass http://127.0.0.1:3004;   # ← 注意：是 3004，不是 3003！
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

> **⚠️ 重要说明**：足球应用的 PM2 进程运行在端口 **3004**，而不是 3003。3003 是人名条（namebar）的端口。如果你从旧配置迁移，请务必检查 `proxy_pass` 指向正确端口——**旧配置曾误将 football 的 proxy_pass 写成 3003，这是一个历史遗留 bug**。

### 6.6 启用站点

```bash
# 创建软链接启用站点
sudo ln -s /etc/nginx/sites-available/guangwei.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/basketball.guangwei.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/football.guangwei.cloud /etc/nginx/sites-enabled/

# 删除默认站点（如果不删除会冲突）
sudo rm -f /etc/nginx/sites-enabled/default

# 检查配置语法
sudo nginx -t

# 如果显示 "syntax is ok" 和 "test is successful"，则重载 Nginx
sudo systemctl reload nginx
```

### 6.7 验证 Nginx 状态

```bash
sudo systemctl status nginx
# 应显示 active (running)
```

---

## 7. HTTPS 配置（Certbot）

### 7.1 安装 Certbot

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
```

### 7.2 申请 SSL 证书

> **在运行此命令前，确保域名 DNS 已指向服务器 IP（参考第 8 节）。**
> 否则 Let's Encrypt 验证会失败。

```bash
# 为所有域名申请证书（一个证书覆盖多个域名）
sudo certbot --nginx \
  -d guangwei.cloud \
  -d www.guangwei.cloud \
  -d basketball.guangwei.cloud \
  -d football.guangwei.cloud
```

执行过程中：
1. 输入邮箱地址（用于证书到期提醒）
2. 同意服务条款（输入 Y）
3. 选择是否接收推广邮件（选 N）
4. Certbot 会自动修改 Nginx 配置，添加 SSL 设置

### 7.3 证书路径

申请成功后，证书文件位于：

| 文件 | 路径 |
|------|------|
| 完整证书链 | `/etc/letsencrypt/live/guangwei.cloud-0001/fullchain.pem` |
| 私钥 | `/etc/letsencrypt/live/guangwei.cloud-0001/privkey.pem` |
| 证书 | `/etc/letsencrypt/live/guangwei.cloud-0001/cert.pem` |
| 链证书 | `/etc/letsencrypt/live/guangwei.cloud-0001/chain.pem` |

### 7.4 强制 HTTPS 跳转

Certbot 通常会自动添加 HTTP → HTTPS 的重定向。如果没有，可以手动在 Nginx 的 80 端口 server 块中添加：

```nginx
# 在每个 server { listen 80; } 块内添加
return 301 https://$host$request_uri;
```

### 7.5 自动续期

Certbot 安装后会自动添加 systemd timer 来定期续期证书。验证方式：

```bash
sudo systemctl status certbot.timer
# 应显示 active (waiting)
```

手动测试续期（不会真正续期，只做模拟运行）：

```bash
sudo certbot renew --dry-run
```

---

## 8. 域名 DNS 绑定

### 8.1 需要的 DNS 记录

在域名服务商（如阿里云 DNS、Cloudflare、Namecheap 等）的控制台添加以下 A 记录：

| 类型 | 主机记录 | 记录值 | TTL |
|------|---------|--------|-----|
| A | @ | 43.129.194.168 | 600 |
| A | www | 43.129.194.168 | 600 |
| A | basketball | 43.129.194.168 | 600 |
| A | football | 43.129.194.168 | 600 |

### 8.2 验证 DNS 解析

```bash
# 等待 DNS 生效（通常几分钟到几小时）
# 验证命令：
nslookup guangwei.cloud
nslookup basketball.guangwei.cloud
nslookup football.guangwei.cloud

# 都应该返回 43.129.194.168
```

---

## 9. 日常更新流程

当代码仓库有更新时，按以下步骤部署：

### 9.1 标准更新流程

```bash
# 1. 进入项目目录
cd /var/www/guangwei_cloud

# 2. 拉取最新代码
git pull origin main
# 或者指定分支：git pull origin <branch-name>

# 3. 检查每个子应用是否有新依赖
# 如果 package.json 有变化，重新安装依赖
cd namebar && npm install && cd ..
cd basketball && npm install && cd ..
cd football && npm install && cd ..

# 4. 平滑重载所有进程（0 秒停机）
pm2 reload all

# 5. 验证进程状态
pm2 list
```

### 9.2 快速更新（确认没有新依赖时）

```bash
cd /var/www/guangwei_cloud
git pull origin main
pm2 reload all
```

### 9.3 只更新其中一个应用

```bash
cd /var/www/guangwei_cloud
git pull origin main

# 只重载篮球应用
pm2 reload gw-basketball
```

### 9.4 更新后验证

```bash
# 检查进程状态
pm2 list

# 查看最近日志，确认无报错
pm2 logs --lines 50 --nostream

# 浏览器访问各子域名验证功能
# https://guangwei.cloud
# https://basketball.guangwei.cloud
# https://football.guangwei.cloud
```

---

## 10. 紧急回滚流程

当新版本有严重 bug 需要回滚时：

### 10.1 回滚到上一个版本

```bash
cd /var/www/guangwei_cloud

# 查看最近提交，确定要回滚到哪个 commit
git log --oneline -10

# 回滚到上一个版本
git checkout HEAD~1

# 或回滚到指定 commit
# git checkout <commit-hash>

# 重载应用
pm2 reload all
```

### 10.2 回滚到指定 commit

```bash
cd /var/www/guangwei_cloud

# 比如回滚到 commit abc1234
git checkout abc1234

# 重载
pm2 reload all
```

### 10.3 回到最新版本（取消回滚）

```bash
cd /var/www/guangwei_cloud

# 切回 main 分支的最新提交
git checkout main
# 或：git checkout <原来的分支名>

pm2 reload all
```

### 10.4 确认回滚后一切正常

```bash
pm2 list            # 进程状态
pm2 logs --lines 20 # 错误日志
```

---

## 11. 日常维护

### 11.1 PM2 日志查看

```bash
# 实时查看所有应用日志
pm2 logs

# 只看某个应用
pm2 logs gw-football

# 查看最近 200 行
pm2 logs --lines 200 --nostream

# 清空日志（磁盘空间不足时）
pm2 flush
```

### 11.2 数据库备份脚本

创建备份脚本 `/var/www/guangwei_cloud/backup.sh`：

```bash
#!/bin/bash
# 记分系统数据库备份脚本
# 建议通过 crontab 每日执行

BACKUP_DIR="/var/backups/guangwei"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# 备份函数：复制 .db + .db-wal + .db-shm（三者必须一起）
backup_db() {
    local name=$1
    local src_dir=$2
    local dest="$BACKUP_DIR/${name}_${DATE}.tar.gz"

    # 打包所有数据库相关文件
    tar -czf "$dest" -C "$src_dir" \
      scoreboard.db \
      scoreboard.db-wal \
      scoreboard.db-shm 2>/dev/null

    echo "备份完成: $dest ($(du -h "$dest" | cut -f1))"
}

# 备份所有子应用
backup_db "namebar"    "/var/www/guangwei_cloud/namebar/data"
backup_db "basketball" "/var/www/guangwei_cloud/basketball/data"
backup_db "football"   "/var/www/guangwei_cloud/football/data"

# 清理旧备份（保留最近 30 天）
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "备份完成。旧备份已清理（保留 $RETENTION_DAYS 天）。"
```

设置可执行权限并配置定时任务：

```bash
chmod +x /var/www/guangwei_cloud/backup.sh

# 添加 crontab：每天凌晨 3:00 执行
(crontab -l 2>/dev/null; echo "0 3 * * * /var/www/guangwei_cloud/backup.sh >> /var/log/guangwei-backup.log 2>&1") | crontab -
```

### 11.3 手动备份数据库（紧急情况）

```bash
# 直接复制整个 data 目录
cp -r /var/www/guangwei_cloud/namebar/data /tmp/backup_namebar_$(date +%Y%m%d)
cp -r /var/www/guangwei_cloud/basketball/data /tmp/backup_basketball_$(date +%Y%m%d)
cp -r /var/www/guangwei_cloud/football/data /tmp/backup_football_$(date +%Y%m%d)
```

> **重要**：备份数据库时，必须同时备份 `.db`、`.db-wal` 和 `.db-shm` 三个文件。如果只备份 `.db`，WAL 日志中的数据会丢失！

### 11.4 磁盘空间监控

```bash
# 查看磁盘使用情况
df -h

# 查看各目录占用
du -sh /var/www/guangwei_cloud/*
du -sh /var/log/*

# 清理 PM2 日志（如果占用过大）
pm2 flush

# 清理 Nginx 日志（保留最近 7 天）
sudo journalctl --vacuum-time=7d

# 清理 apt 缓存
sudo apt-get clean
```

### 11.5 进程监控与告警

```bash
# 快速健康检查脚本 check_health.sh
#!/bin/bash
# 检查所有服务是否正常

check_port() {
    local name=$1
    local port=$2
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port/ | grep -q "200\|302"; then
        echo "✓ $name (端口 $port) — 正常"
    else
        echo "✗ $name (端口 $port) — 无响应！"
    fi
}

echo "=== 光为云服务健康检查 $(date) ==="
check_port "basketball" 3002
check_port "namebar"    3003
check_port "football"   3004
```

### 11.6 SSL 证书到期检查

```bash
# 查看证书到期时间
sudo certbot certificates

# 手动续期
sudo certbot renew

# 续期后重载 Nginx
sudo systemctl reload nginx
```

### 11.7 系统更新

```bash
# 定期安全更新（建议每周执行）
sudo apt-get update
sudo apt-get upgrade -y

# 如果内核有更新，重启服务器
sudo reboot
```

---

## 附录 A：常见问题排查

### Q1: npm install 报错 "better-sqlite3" 编译失败
**原因**：缺少 C++ 编译工具。
**解决**：
```bash
sudo apt-get install -y build-essential python3
# 然后重新 install
npm install
```

### Q2: Node 升级后 better-sqlite3 报错
**原因**：原生模块与新的 Node 版本不兼容。
**解决**：
```bash
npm rebuild better-sqlite3
```

### Q3: Nginx 报 502 Bad Gateway
**原因**：后端 Node 进程未启动或端口不对。
**解决**：
```bash
pm2 list                        # 确认进程运行中
curl http://127.0.0.1:3004/     # 直接测试端口
sudo nginx -t && sudo systemctl reload nginx
```

### Q4: WebSocket 连接失败
**原因**：Nginx 未正确传递 WebSocket 升级头。
**解决**：检查 Nginx 配置中是否有以下三行：
```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Q5: 足球应用访问不响应
**原因**：Nginx 配置中 `proxy_pass` 错误地指向了 3003 而不是 3004。
**解决**：修改 `/etc/nginx/sites-available/football.guangwei.cloud` 中所有 `proxy_pass` 的端口为 `3004`，然后 `sudo systemctl reload nginx`。

### Q6: SSL 证书过期
**原因**：Certbot 自动续期失败。
**解决**：
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

---

## 附录 B：完整的部署流程（从零开始）

如果你拿到一台全新的 Ubuntu 22.04 服务器，按以下顺序执行即可完成部署：

```bash
# === 1. 基础环境 ===
sudo apt-get update
sudo apt-get install -y build-essential python3 git nginx

# === 2. Node.js ===
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# === 3. PM2 ===
sudo npm install -g pm2

# === 4. 克隆项目 ===
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone https://github.com/liuchixiangai/guangwei.git guangwei_cloud

# === 5. 安装依赖 ===
cd /var/www/guangwei_cloud
cd namebar && npm install && cd ..
cd basketball && npm install && cd ..
cd football && npm install && cd ..

# === 6. 启动应用 ===
pm2 start basketball/server.js --name gw-basketball --env PORT=3002
pm2 start namebar/server.js --name gw-namebar --env PORT=3003
pm2 start football/server.js --name gw-football --env PORT=3004
pm2 save
pm2 startup  # 然后复制执行输出的 sudo 命令

# === 7. 配置 Nginx ===
# 复制上面第 6 节中的 Nginx 配置文件到 /etc/nginx/sites-available/
# 然后：
sudo ln -s /etc/nginx/sites-available/guangwei.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/basketball.guangwei.cloud /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/football.guangwei.cloud /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# === 8. HTTPS ===
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d guangwei.cloud -d www.guangwei.cloud -d basketball.guangwei.cloud -d football.guangwei.cloud

# === 9. 备份脚本 ===
# 复制上面第 11.2 节的 backup.sh，设置 crontab

# === 10. 验证 ===
pm2 list
sudo systemctl status nginx
curl -I https://guangwei.cloud
```

---

> **文档维护**：本文档随项目一起纳入 Git 版本管理。如有环境变化（如新增应用、修改端口等），请同步更新本文档。
