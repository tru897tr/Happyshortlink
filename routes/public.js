/**
 * routes/public.js
 * --------------------------------------------------------------
 * Nhóm route /public/* — dành riêng cho giao diện web (chạy trong
 * trình duyệt người dùng cuối). KHÔNG yêu cầu x-api-key, vì một
 * key nhúng trong JS phía client coi như công khai (không thể
 * giấu tuyệt đối).
 *
 * Để bù lại, nhóm route này:
 *  - CHỈ hỗ trợ các hành động ĐỌC (xem bảng tin, xem 1 bài viết,
 *    resolve link để chuyển hướng) — không tạo/sửa/xoá bất cứ gì.
 *  - KHÔNG bao giờ trả "originalUrl" thô của link trong giai đoạn
 *    đang đếm ngược — xem route /links/:code/peek bên dưới.
 *  - Có rate limit riêng, nhẹ hơn nhưng vẫn áp dụng (xem server.js).
 *
 * Muốn TẠO link rút gọn hoặc TẠO/SỬA/XOÁ bài viết → phải gọi
 * /api/* kèm header x-api-key (xem routes/apiLinks.js, apiPosts.js).
 * --------------------------------------------------------------
 */

const express = require('express');
const store = require('../store');
const logger = require('../lib/logger');
const { ok, fail, getBaseUrl } = require('../lib/respond');

const router = express.Router();

/**
 * GET /public/posts?limit=&offset=&tag=
 * Dùng cho bảng tin ở trang chủ.
 */
router.get('/posts', (req, res) => {
  // Không giới hạn số lượng: nếu không truyền "limit", trả về TOÀN BỘ
  // bài viết hiện có. Nếu người dùng vẫn truyền limit/offset, hệ thống
  // vẫn tôn trọng để hỗ trợ phân trang khi cần.
  const hasLimit = req.query.limit !== undefined;
  const limit = hasLimit ? Math.max(parseInt(req.query.limit, 10) || 0, 0) : Infinity;
  const offset = parseInt(req.query.offset, 10) || 0;
  const tag = req.query.tag || null;

  const { total, items } = store.listPosts({ limit, offset, tag });
  const base = getBaseUrl(req);

  return ok(res, {
    total,
    limit: hasLimit ? limit : null,
    offset,
    items: items.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      author: p.author,
      tags: p.tags,
      coverImage: p.coverImage,
      createdAt: p.createdAt,
      views: p.views,
      url: `${base}/post/${p.slug}`,
    })),
  });
});

/**
 * GET /public/posts/:slug
 * Dùng cho trang xem 1 bài viết. Tăng lượt xem.
 */
router.get('/posts/:slug', (req, res) => {
  const record = store.getPostBySlug(req.params.slug);
  if (!record) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.', req.requestId);
  }
  store.hitPostView(record.id);

  return ok(res, {
    slug: record.slug,
    title: record.title,
    content: record.content,
    author: record.author,
    tags: record.tags,
    coverImage: record.coverImage,
    createdAt: record.createdAt,
    views: record.views,
  });
});

/**
 * GET /public/links/:code/peek
 * Dùng cho trang đếm ngược (redirect.html) NGAY KHI TẢI TRANG.
 * CHỦ Ý KHÔNG trả "originalUrl" — chỉ trả các thông tin không
 * nhạy cảm (link có tồn tại hay không, mã, thời gian hết hạn).
 * Mục đích: che link gốc trong suốt 30 giây đếm ngược, tránh
 * người dùng/bot đọc thẳng link đích từ network tab mà bỏ qua
 * trang trung gian.
 */
router.get('/links/:code/peek', (req, res) => {
  const record = store.getLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy liên kết hoặc đã hết hạn.', req.requestId);
  }
  return ok(res, {
    code: record.code,
    exists: true,
    expiresAt: record.expiresAt,
  });
});

/**
 * POST /public/links/:code/resolve
 * Gọi DUY NHẤT sau khi bộ đếm 30 giây kết thúc (hoặc khi người
 * dùng bấm nút dự phòng). Lúc này mới trả "originalUrl" thật và
 * tăng lượt click.
 */
router.post('/links/:code/resolve', (req, res) => {
  const record = store.hitLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy liên kết hoặc đã hết hạn.', req.requestId);
  }
  logger.debug('Resolve link công khai', req.requestId, { code: record.code });
  return ok(res, {
    code: record.code,
    originalUrl: record.originalUrl,
  });
});

/**
 * GET /public/stats
 * Số liệu tổng quan hiển thị ở trang chủ (không nhạy cảm).
 */
router.get('/stats', (req, res) => {
  const stats = store.getStats();
  return ok(res, {
    totalLinks: stats.totalLinks,
    totalPosts: stats.totalPosts,
    totalClicks: stats.totalClicks,
  });
});

module.exports = router;
