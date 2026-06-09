/**
 * server.js - 导播星球平台后端
 * 端口 3005: 首页 + 留言墙 + 支持者 + 使用日志 API
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3005;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'daobo-admin-2026';
const app = express();

app.use(cors());
app.use(express.json({ limit: '64kb' }));

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// ===== 公开 API =====

// 最近使用
app.get('/api/usage', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(db.getRecentUsage(limit));
});

// 留言墙 - 获取
app.get('/api/messages', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  res.json(db.getApprovedMessages(page, limit));
});

// 留言墙 - 提交
app.post('/api/messages', (req, res) => {
  const { city, content } = req.body;
  if (!city || !city.trim()) return res.status(400).json({ error: '请填写城市' });
  if (!content || !content.trim()) return res.status(400).json({ error: '请填写留言内容' });
  if (content.length > 500) return res.status(400).json({ error: '留言不能超过500字' });
  db.addMessage(city.trim(), content.trim());
  res.json({ success: true, message: '留言已提交，审核通过后展示' });
});

// 留言墙 - 点赞
app.post('/api/messages/:id/like', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  const result = db.likeMessage(id);
  res.json({ success: true, likes: result ? result.likes : 0 });
});

// 支持者列表
app.get('/api/supporters', (req, res) => {
  res.json(db.getApprovedSupporters());
});

// ===== 管理 API（简单 token 鉴权）=====
function requireAdmin(req, res, next) {
  const token = req.query.token || (req.body && req.body.token) || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: '无权限' });
  next();
}

// 消息管理
app.get('/admin/messages', requireAdmin, (req, res) => {
  res.json(db.getAllMessages(parseInt(req.query.page) || 1));
});

app.post('/admin/messages/:id/approve', requireAdmin, (req, res) => {
  db.approveMessage(parseInt(req.params.id));
  res.json({ success: true });
});

app.post('/admin/messages/:id/pin', requireAdmin, (req, res) => {
  db.togglePinMessage(parseInt(req.params.id));
  res.json({ success: true });
});

app.post('/admin/messages/:id/hide', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const row = db.getAllMessages(1, 999).rows.find(r => r.id === id);
  if (row && row.is_hidden) db.unhideMessage(id);
  else db.hideMessage(id);
  res.json({ success: true });
});

app.post('/admin/messages/:id/likes', requireAdmin, (req, res) => {
  const likes = parseInt(req.body.likes) || 0;
  db.setMessageLikes(parseInt(req.params.id), likes);
  res.json({ success: true });
});

app.delete('/admin/messages/:id', requireAdmin, (req, res) => {
  db.deleteMessage(parseInt(req.params.id));
  res.json({ success: true });
});

// 支持者管理
app.get('/admin/supporters', requireAdmin, (req, res) => {
  res.json(db.getAllSupporters());
});

app.post('/admin/supporters', requireAdmin, (req, res) => {
  const { name, slug, amount, logo_url, bio, contact, custom_html } = req.body;
  if (!name || !slug || !amount) return res.status(400).json({ error: 'name, slug, amount 必填' });
  try {
    db.addSupporter({ name, slug, amount, logo_url, bio, contact, custom_html });
    db.approveSupporter(db.getAllSupporters()[0]?.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/admin/supporters/:id', requireAdmin, (req, res) => {
  db.updateSupporter(parseInt(req.params.id), req.body);
  res.json({ success: true });
});

app.post('/admin/supporters/:id/approve', requireAdmin, (req, res) => {
  db.approveSupporter(parseInt(req.params.id));
  res.json({ success: true });
});

app.delete('/admin/supporters/:id', requireAdmin, (req, res) => {
  db.deleteSupporter(parseInt(req.params.id));
  res.json({ success: true });
});

// 模拟使用日志（测试用）
app.post('/admin/usage/seed', requireAdmin, (req, res) => {
  db.seedMockUsage();
  res.json({ success: true, message: 'Mock data seeded' });
});

// ===== 支持者主页 =====
app.get('/u/:slug', (req, res) => {
  const supporter = db.getSupporterBySlug(req.params.slug);
  if (!supporter) return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  if (supporter.custom_html) {
    // 渲染自定义 HTML
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(supporter.name)} - 导播星球</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#0a0f1e;color:#e0e4f0;min-height:100vh}
.page-header{text-align:center;padding:40px 20px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
.page-header h1{font-size:24px;color:#fff}
.page-header .back{display:inline-block;margin-top:12px;color:#6366F1;text-decoration:none;font-size:14px}
.content{padding:20px;max-width:800px;margin:0 auto}
</style>
</head>
<body>
<div class="page-header">
  <h1>${escapeHtml(supporter.name)}</h1>
  <a class="back" href="/">← 返回导播星球</a>
</div>
<div class="content">${supporter.custom_html}</div>
</body>
</html>`;
    return res.send(html);
  }
  // 默认展示
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(supporter.name)} - 导播星球</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#0a0f1e;color:#e0e4f0;min-height:100vh}
.page-header{text-align:center;padding:60px 20px 40px}
.logo{width:80px;height:80px;border-radius:16px;background:rgba(99,102,241,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px}
.page-header h1{font-size:28px;color:#fff;margin-bottom:8px}
.page-header .bio{font-size:14px;color:rgba(255,255,255,.45);max-width:400px;margin:0 auto;line-height:1.6}
.page-header .back{display:inline-block;margin-top:16px;color:#6366F1;text-decoration:none;font-size:14px}
.page-header .contact{font-size:13px;color:rgba(255,255,255,.3);margin-top:8px}
</style>
</head>
<body>
<div class="page-header">
  <div class="logo">${escapeHtml((supporter.logo_url || '🏠').slice(0, 2))}</div>
  <h1>${escapeHtml(supporter.name)}</h1>
  <p class="bio">${escapeHtml(supporter.bio || '感谢对导播星球的支持')}</p>
  ${supporter.contact ? `<p class="contact">${escapeHtml(supporter.contact)}</p>` : ''}
  <a class="back" href="/">← 返回导播星球</a>
</div>
</body>
</html>`;
  res.send(html);
});

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 启动 =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Daobo] 导播星球平台运行于端口 ${PORT}`);
  db.seedMockUsage();
});
