/**
 * server.js
 * --------------------------------------------------------------
 * Happyshortlink — API rút gọn link + bảng tin bài viết.
 * Lưu trữ: 100% trong RAM (không database ngoài).
 * Phù hợp deploy trên Render (Web Service - Node).
 *
 * KIẾN TRÚC BẢO MẬT (đọc kỹ trước khi sửa code):
 * ----------------------------------------------------------------
 * 1. /api/*    → BẮT BUỘC header "x-api-key" đúng ADMIN_API_KEY.
 *                Dùng để quản trị toàn bộ (tạo/đọc/sửa/xoá link
 *                và bài viết) qua Postman/curl/app khác.
 *
 * 2. /public/* → KHÔNG cần key. Chỉ phục vụ các hành động ĐỌC mà
 *                giao diện web (trình duyệt người dùng) cần, vì
 *                không thể giấu key tuyệt đối trong JS phía client.
 *                Nhóm này không có route tạo/sửa/xoá.
 *
 * 3. Trang /create (đăng bài) và /docs (tài liệu API) đã được GỠ
 *    khỏi giao diện web theo yêu cầu — chỉ dùng được qua /api/*.
 *
 * 4. Toàn bộ lỗi chi tiết (stack trace...) chỉ được log ra console
 *    (Render Logs) qua lib/logger.js — KHÔNG BAO GIỜ trả chi tiết
 *    đó cho client. Client luôn nhận thông báo gọn + mã "reference"
 *    để báo lại cho admin tìm trong Render Logs.
 * --------------------------------------------------------------
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const store = require('./store');
const logger = require('./lib/logger');
const { attachRequestId } = require('./lib/requestId');
const { requireApiKey } = require('./lib/auth');
const { ok, fail, getBaseUrl } = require('./lib/respond');

const apiLinksRouter = require('./routes/apiLinks');
const apiPostsRouter = require('./routes/apiPosts');
const publicRouter = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

/* ============================ MIDDLEWARES CHUNG ============================ */

app.use(attachRequestId);

app.use(
  helmet({
    contentSecurityPolicy: false, // tránh chặn inline script/style của frontend đơn giản
  })
);
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.set('X-Powered-By', 'happyshortlink');
  next();
});

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`, req.requestId);
  next();
});

/* ============================ RATE LIMIT ============================ */

// Nhóm /api: cho phép nhiều hơn vì admin có thể cần gọi liên tục khi quản trị,
// nhưng vẫn giới hạn để chống brute-force API key.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Vượt rate limit /api', req.requestId);
    return fail(res, 429, 'RATE_LIMITED', 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.', req.requestId);
  },
});

// Nhóm /public: giới hạn lỏng hơn nhưng vẫn có, để chống bot dò link/bài viết ồ ạt.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Vượt rate limit /public', req.requestId);
    return fail(res, 429, 'RATE_LIMITED', 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.', req.requestId);
  },
});

/* ============================ ROUTES: API (cần key) ============================ */

app.use('/api/links', apiLimiter, requireApiKey, apiLinksRouter);
app.use('/api/posts', apiLimiter, requireApiKey, apiPostsRouter);

app.get('/api/health', requireApiKey, (req, res) => {
  return ok(res, { status: 'ok', timestamp: Date.now() });
});

app.get('/api/stats', requireApiKey, (req, res) => {
  return ok(res, store.getStats());
});

/* ============================ ROUTES: PUBLIC (không cần key) ============================ */

app.use('/public', publicLimiter, publicRouter);

/* ============================ STATIC FRONTEND ============================ */

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/link/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'redirect.html'));
});

app.get('/post/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

// /create và /docs đã bị gỡ khỏi giao diện web — chủ động trả 404
// thân thiện thay vì để rơi vào static handler mặc định.
app.get(['/create', '/docs'], (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

/* ============================ 404 & ERROR HANDLER ============================ */

app.use('/api', (req, res) => {
  fail(res, 404, 'NOT_FOUND', 'Endpoint không tồn tại.', req.requestId);
});

app.use('/public', (req, res) => {
  fail(res, 404, 'NOT_FOUND', 'Endpoint không tồn tại.', req.requestId);
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log đầy đủ chi tiết (stack trace, method, url, body) ra Render Logs.
  logger.error('Lỗi không được xử lý (unhandled)', err, req.requestId, {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
  });
  // Người dùng chỉ nhận thông báo gọn kèm mã tham chiếu.
  return fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi không mong muốn xảy ra. Vui lòng thử lại sau.', req.requestId);
});

/* ============================ START SERVER ============================ */

app.listen(PORT, () => {
  logger.info(`✅ Happyshortlink đang chạy tại cổng ${PORT}`);
  logger.info('📦 Dữ liệu lưu trong RAM — không dùng database ngoài.');
  if (!process.env.ADMIN_API_KEY) {
    logger.warn('⚠️  CHƯA đặt ADMIN_API_KEY — toàn bộ /api/* sẽ bị chặn (503) cho tới khi cấu hình.');
  }
});
