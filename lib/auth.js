/**
 * lib/auth.js
 * --------------------------------------------------------------
 * Xác thực API key admin cho toàn bộ nhóm route /api/*.
 *
 * Cách dùng: client phải gửi header
 *    x-api-key: <ADMIN_API_KEY>
 * Thiếu hoặc sai key → 401 KEY_REQUIRED / 403 KEY_INVALID.
 *
 * Các trang công khai (trang chủ, trang redirect) KHÔNG gọi qua
 * /api/* mà gọi qua nhóm route /public/* riêng (xem routes/public.js)
 * — nhóm này không cần key vì chạy trong trình duyệt người dùng,
 * không thể giấu key tuyệt đối ở phía client.
 * --------------------------------------------------------------
 */

const crypto = require('crypto');
const logger = require('./logger');

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireApiKey(req, res, next) {
  if (!ADMIN_API_KEY) {
    // Server cấu hình sai (quên đặt ADMIN_API_KEY) — chặn luôn,
    // không cho API hoạt động "mở cửa" ngoài ý muốn.
    logger.error(
      'ADMIN_API_KEY chưa được cấu hình trên server — chặn toàn bộ request /api',
      null,
      req.requestId
    );
    return res.status(503).json({
      success: false,
      error: { code: 'SERVER_MISCONFIGURED', message: 'Hệ thống đang bảo trì. Vui lòng thử lại sau.' },
    });
  }

  const provided = req.get('x-api-key');

  if (!provided) {
    logger.warn('Thiếu header x-api-key', req.requestId);
    return res.status(401).json({
      success: false,
      error: { code: 'KEY_REQUIRED', message: 'Thiếu API key. Vui lòng gửi header "x-api-key".' },
    });
  }

  if (!safeEqual(provided, ADMIN_API_KEY)) {
    logger.warn(`API key không hợp lệ (độ dài nhận được: ${provided.length})`, req.requestId);
    return res.status(403).json({
      success: false,
      error: { code: 'KEY_INVALID', message: 'API key không hợp lệ.' },
    });
  }

  next();
}

module.exports = { requireApiKey };
