/**
 * lib/respond.js
 * --------------------------------------------------------------
 * Chuẩn hoá response trả về client.
 *
 * QUAN TRỌNG: hàm fail() ở đây là response trả cho NGƯỜI DÙNG,
 * luôn gọn, không chứa chi tiết kỹ thuật (stack trace, SQL, path
 * nội bộ...). Chi tiết kỹ thuật đầy đủ phải được log riêng bằng
 * lib/logger.js (chỉ hiển thị trong Render Logs).
 * --------------------------------------------------------------
 */

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

/**
 * @param {object} res
 * @param {number} status
 * @param {string} code
 * @param {string} message - thông báo NGẮN, thân thiện, không lộ chi tiết kỹ thuật
 * @param {string} [requestId] - mã tham chiếu để người dùng báo lỗi cho admin
 */
function fail(res, status, code, message, requestId) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(requestId ? { reference: requestId } : {}),
    },
  });
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function getBaseUrl(req) {
  const BASE_URL = process.env.BASE_URL || null;
  if (BASE_URL) return BASE_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

module.exports = { ok, fail, isValidUrl, getBaseUrl };
