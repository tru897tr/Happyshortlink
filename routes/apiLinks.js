/**
 * routes/apiLinks.js
 * --------------------------------------------------------------
 * Nhóm route /api/links/* — QUẢN TRỊ link rút gọn.
 * Toàn bộ route trong file này yêu cầu header x-api-key hợp lệ
 * (áp middleware requireApiKey ở server.js trước khi mount router).
 * --------------------------------------------------------------
 */

const express = require('express');
const store = require('../store');
const logger = require('../lib/logger');
const { ok, fail, isValidUrl, getBaseUrl } = require('../lib/respond');

const router = express.Router();

/**
 * POST /api/links
 * Body: { url: string, customCode?: string, ttlMinutes?: number }
 */
router.post('/', (req, res) => {
  const { url, customCode, ttlMinutes } = req.body || {};
  logger.debug('Tạo link mới', req.requestId, { url, customCode, ttlMinutes });

  if (!url || typeof url !== 'string') {
    return fail(res, 400, 'URL_REQUIRED', 'Thiếu trường "url" (kiểu chuỗi).', req.requestId);
  }
  if (!isValidUrl(url)) {
    return fail(res, 400, 'URL_INVALID', 'URL không hợp lệ. URL phải bắt đầu bằng http:// hoặc https://', req.requestId);
  }

  let ttlMs = null;
  if (ttlMinutes !== undefined) {
    const n = Number(ttlMinutes);
    if (!Number.isFinite(n) || n <= 0) {
      return fail(res, 400, 'TTL_INVALID', 'ttlMinutes phải là số dương.', req.requestId);
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
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      },
      201
    );
  } catch (err) {
    if (err.message === 'CUSTOM_CODE_TAKEN') {
      return fail(res, 409, 'CUSTOM_CODE_TAKEN', 'Mã rút gọn này đã được sử dụng.', req.requestId);
    }
    if (err.message === 'CUSTOM_CODE_INVALID') {
      return fail(res, 400, 'CUSTOM_CODE_INVALID', 'Mã tuỳ chỉnh chỉ gồm 3-32 ký tự chữ, số, gạch ngang hoặc gạch dưới.', req.requestId);
    }
    logger.error('Lỗi khi tạo link', err, req.requestId, { url, customCode, ttlMinutes });
    return fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra khi tạo link.', req.requestId);
  }
});

/**
 * GET /api/links/:code
 */
router.get('/:code', (req, res) => {
  const record = store.getLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link rút gọn hoặc đã hết hạn.', req.requestId);
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
 * GET /api/links?limit=&offset=
 */
router.get('/', (req, res) => {
  // Không giới hạn: nếu không truyền "limit", trả về TOÀN BỘ link.
  const hasLimit = req.query.limit !== undefined;
  const limit = hasLimit ? Math.max(parseInt(req.query.limit, 10) || 0, 0) : Infinity;
  const offset = parseInt(req.query.offset, 10) || 0;
  const { total, items } = store.listLinks({ limit, offset });
  const base = getBaseUrl(req);

  return ok(res, {
    total,
    limit: hasLimit ? limit : null,
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
 */
router.delete('/:code', (req, res) => {
  const removed = store.deleteLink(req.params.code);
  if (!removed) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link để xoá.', req.requestId);
  }
  return ok(res, { code: req.params.code, deleted: true });
});

/**
 * POST /api/links/:code/resolve
 * Dùng cho admin/test qua API trực tiếp. Trang redirect công khai
 * dùng route riêng /public/links/:code/resolve (không cần key).
 */
router.post('/:code/resolve', (req, res) => {
  const record = store.hitLink(req.params.code);
  if (!record) {
    return fail(res, 404, 'LINK_NOT_FOUND', 'Không tìm thấy link rút gọn hoặc đã hết hạn.', req.requestId);
  }
  return ok(res, {
    code: record.code,
    originalUrl: record.originalUrl,
    clicks: record.clicks,
  });
});

module.exports = router;
