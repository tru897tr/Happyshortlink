/**
 * server.js
 * --------------------------------------------------------------
 * API Server: Rút gọn link + Quản lý bài viết.
 * Lưu trữ: 100% trong RAM (không database ngoài).
 * Phù hợp deploy trên Render (Web Service - Node).
 * --------------------------------------------------------------
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || null; // ví dụ: https://your-app.onrender.com

app.set('trust proxy', 1);

/* ============================ MIDDLEWARES ============================ */

app.use(
  helmet({
    contentSecurityPolicy: false, // tránh chặn inline script/style của frontend đơn giản
  })
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Giới hạn request để tránh spam API (chuyên nghiệp, chống abuse)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // tối đa 60 request/phút/IP cho nhóm API ghi dữ liệu
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.',
    },
  },
});

app.use((req, res, next) => {
  res.set('X-Powered-By', 'shortlink-news-api');
  next();
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

/* ============================ HELPERS ============================ */

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, status, code, message, details) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

function getBaseUrl(req) {
  if (BASE_URL) return BASE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ===================================================================
 * API GROUP 1: RÚT GỌN LINK
 * =================================================================== */

/**
 * POST /api/links
 * Body: { url: string, customCode?: string, ttlMinutes?: number }
 * Tạo link rút gọn mới.
 */
app.post('/api/links', apiLimiter, (req, res) => {
  const { url, customCode, ttlMinutes } = req.body || {};

  if (!url || typeof url !== 'string') {
    return fail(res, 400, 'URL_REQUIRED', 'Thiếu trường "url" (kiểu chuỗi).');
  }
  if (!isValidUrl(url)) {
    return fail(
      res,
      400,
      'URL_INVALID',
      'URL không hợp lệ. URL phải bắt đầu bằng http:// hoặc https://'
    );
  }

  let ttlMs = null;
  if (ttlMinutes !== undefined) {
    const n = Number(ttlMinutes);
    if (!Number.isFinite(n) || n <= 0) {
      return fail(res, 400, 'TTL_INVALID', 'ttlMinutes phải là số dương.');
    }
    ttlMs = n * 60 * 1000;
  }

  try {
    const record = store.createLink(url, { customCode, ttlMs });
    const base = getBaseUrl(req);

    return ok(
      res,
      {
        code: record.code,
        originalUrl: record.originalUrl,
        shortUrl: `${base}/link/${record.code}`,
        redirectInfoUrl: `${base}/link/${record.code}`,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      },
      201
    );
  } catch (err) {
    if (err.message === 'CUSTOM_CODE_TAKEN') {
      return fail(res, 409, 'CUSTOM_CODE_TAKEN', 'Mã rút gọn này đã được sử dụng.');
    }
    if (err.message === 'CUSTOM_CODE_INVALID') {
      return fail(
        res,
        400,
        'CUSTOM_CODE_INVALID',
        'Mã tuỳ chỉnh chỉ gồm 3-32 ký tự chữ, số, gạch ngang hoặc gạch dưới.'
      );
    }
    console.error('createLink error:', err);
    return fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra khi tạo link.');
  }
});

/**
 * GET /api/links/:code
 * Lấy thông tin chi tiết 1 link rút gọn (không tăng lượt click).
 */
app.get('/api/links/:code', (req, res) => {
  const record = store.getLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link rút gọn hoặc đã hết hạn.');
  }
  const base = getBaseUrl(req);
  return ok(res, {
    code: record.code,
    originalUrl: record.originalUrl,
    shortUrl: `${base}/link/${record.code}`,
    clicks: record.clicks,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastAccessedAt: record.lastAccessedAt,
  });
});

/**
 * GET /api/links
 * Danh sách các link đã tạo (phục vụ quản trị / thống kê).
 * Query: limit, offset
 */
app.get('/api/links', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const offset = parseInt(req.query.offset, 10) || 0;
  const { total, items } = store.listLinks({ limit, offset });
  const base = getBaseUrl(req);

  return ok(res, {
    total,
    limit,
    offset,
    items: items.map((r) => ({
      code: r.code,
      originalUrl: r.originalUrl,
      shortUrl: `${base}/link/${r.code}`,
      clicks: r.clicks,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  });
});

/**
 * DELETE /api/links/:code
 * Xoá 1 link rút gọn.
 */
app.delete('/api/links/:code', (req, res) => {
  const removed = store.deleteLink(req.params.code);
  if (!removed) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link để xoá.');
  }
  return ok(res, { code: req.params.code, deleted: true });
});

/**
 * GET /api/links/:code/resolve
 * Dùng cho trang đếm ngược: trả về URL đích + tăng lượt click.
 * (Tách riêng "resolve" khỏi GET chi tiết để không tăng click khi
 *  client chỉ xem thông tin.)
 */
app.post('/api/links/:code/resolve', (req, res) => {
  const record = store.hitLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link rút gọn hoặc đã hết hạn.');
  }
  return ok(res, {
    code: record.code,
    originalUrl: record.originalUrl,
    clicks: record.clicks,
  });
});

/* ===================================================================
 * API GROUP 2: BÀI VIẾT (POSTS)
 * =================================================================== */

/**
 * POST /api/posts
 * Body: { title: string, content: string, author?: string, tags?: string[], coverImage?: string }
 * Tạo bài viết mới.
 */
app.post('/api/posts', apiLimiter, (req, res) => {
  const { title, content, author, tags, coverImage } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return fail(res, 400, 'TITLE_REQUIRED', 'Thiếu trường "title" (tiêu đề bài viết).');
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return fail(res, 400, 'CONTENT_REQUIRED', 'Thiếu trường "content" (nội dung bài viết).');
  }
  if (title.length > 200) {
    return fail(res, 400, 'TITLE_TOO_LONG', 'Tiêu đề tối đa 200 ký tự.');
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return fail(res, 400, 'TAGS_INVALID', 'tags phải là một mảng chuỗi.');
  }
  if (coverImage !== undefined && coverImage !== null && !isValidUrl(coverImage)) {
    return fail(res, 400, 'COVER_IMAGE_INVALID', 'coverImage phải là URL hợp lệ.');
  }

  const record = store.createPost(title, content, { author, tags, coverImage });
  const base = getBaseUrl(req);

  return ok(
    res,
    {
      id: record.id,
      slug: record.slug,
      title: record.title,
      excerpt: record.excerpt,
      author: record.author,
      tags: record.tags,
      coverImage: record.coverImage,
      createdAt: record.createdAt,
      url: `${base}/post/${record.slug}`,
    },
    201
  );
});

/**
 * GET /api/posts
 * API "ping" lấy danh sách bài viết mới nhất.
 * Query: limit (default 20, max 100), offset, tag
 */
app.get('/api/posts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const tag = req.query.tag || null;

  const { total, items } = store.listPosts({ limit, offset, tag });
  const base = getBaseUrl(req);

  return ok(res, {
    total,
    limit,
    offset,
    items: items.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      author: p.author,
      tags: p.tags,
      coverImage: p.coverImage,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      views: p.views,
      url: `${base}/post/${p.slug}`,
    })),
  });
});

/**
 * GET /api/posts/:idOrSlug
 * Lấy đầy đủ nội dung 1 bài viết (theo id hoặc slug), tăng lượt xem.
 */
app.get('/api/posts/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  let record = store.getPostById(key) || store.getPostBySlug(key);

  if (!record) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.');
  }

  store.hitPostView(record.id);
  const base = getBaseUrl(req);

  return ok(res, {
    id: record.id,
    slug: record.slug,
    title: record.title,
    content: record.content,
    excerpt: record.excerpt,
    author: record.author,
    tags: record.tags,
    coverImage: record.coverImage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    views: record.views,
    url: `${base}/post/${record.slug}`,
  });
});

/**
 * PUT /api/posts/:id
 * Cập nhật bài viết.
 */
app.put('/api/posts/:id', apiLimiter, (req, res) => {
  const { title, content, tags, coverImage } = req.body || {};

  if (title !== undefined && (!title.trim() || title.length > 200)) {
    return fail(res, 400, 'TITLE_INVALID', 'Tiêu đề không hợp lệ (rỗng hoặc quá 200 ký tự).');
  }
  if (content !== undefined && !content.trim()) {
    return fail(res, 400, 'CONTENT_INVALID', 'Nội dung không được để rỗng.');
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return fail(res, 400, 'TAGS_INVALID', 'tags phải là một mảng chuỗi.');
  }

  const record = store.updatePost(req.params.id, { title, content, tags, coverImage });
  if (!record) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết để cập nhật.');
  }
  return ok(res, { id: record.id, updatedAt: record.updatedAt });
});

/**
 * DELETE /api/posts/:id
 */
app.delete('/api/posts/:id', (req, res) => {
  const removed = store.deletePost(req.params.id);
  if (!removed) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết để xoá.');
  }
  return ok(res, { id: req.params.id, deleted: true });
});

/* ===================================================================
 * API GROUP 3: HỆ THỐNG
 * =================================================================== */

app.get('/api/health', (req, res) => {
  return ok(res, { status: 'ok', timestamp: Date.now() });
});

app.get('/api/stats', (req, res) => {
  return ok(res, store.getStats());
});

/* ===================================================================
 * FRONTEND ROUTES (SPA-style pages, đều phục vụ static HTML có sẵn
 * và để JS phía client gọi API tương ứng)
 * =================================================================== */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/link/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'redirect.html'));
});

app.get('/post/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'docs.html'));
});

/* ============================ 404 & ERROR HANDLER ============================ */

app.use('/api', (req, res) => {
  fail(res, 404, 'NOT_FOUND', 'Endpoint không tồn tại.');
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi không mong muốn xảy ra trên server.');
});

/* ============================ START SERVER ============================ */

app.listen(PORT, () => {
  console.log(`✅ Server đang chạy tại cổng ${PORT}`);
  console.log(`📦 Dữ liệu lưu trong RAM — không dùng database ngoài.`);
});
