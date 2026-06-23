/**
 * lib/requestId.js
 * --------------------------------------------------------------
 * Gắn một mã ngắn (requestId) vào mỗi request. Mã này:
 * - Được in kèm trong mọi dòng log liên quan tới request đó
 *   (xem lib/logger.js) để admin lọc log trên Render dễ dàng.
 * - Được trả về cho người dùng trong response lỗi (trường
 *   "reference"), KHÔNG kèm chi tiết kỹ thuật, để họ có thể cung
 *   cấp mã này khi báo lỗi cho admin.
 * --------------------------------------------------------------
 */

const crypto = require('crypto');

function attachRequestId(req, res, next) {
  req.requestId = crypto.randomBytes(4).toString('hex'); // ví dụ: "a1b2c3d4"
  res.set('X-Request-Id', req.requestId);
  next();
}

module.exports = { attachRequestId };
