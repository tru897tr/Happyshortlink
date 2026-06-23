/**
 * lib/logger.js
 * --------------------------------------------------------------
 * Logger tập trung.
 *
 * NGUYÊN TẮC QUAN TRỌNG:
 * - Mọi log ở đây CHỈ in ra console (=> hiển thị trong Render Logs,
 *   hoặc terminal khi chạy local). KHÔNG BAO GIỜ log ở đây được
 *   gửi trả về cho client trong response HTTP.
 * - Log chi tiết (stack trace, request body, headers liên quan...)
 *   giúp admin debug trên Render, nhưng người dùng cuối khi gặp lỗi
 *   chỉ nhận một thông báo gọn, không lộ thông tin nội bộ.
 *
 * Mỗi log có một "requestId" ngắn để admin dò theo một request cụ
 * thể trong Render Logs khi người dùng báo lỗi (yêu cầu họ gửi mã
 * lỗi hiển thị trên giao diện).
 * --------------------------------------------------------------
 */

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const IS_DEBUG = LOG_LEVEL === 'debug';

function timestamp() {
  return new Date().toISOString();
}

function baseLine(level, requestId, msg) {
  return `[${timestamp()}] [${level}]${requestId ? ` [${requestId}]` : ''} ${msg}`;
}

function info(msg, requestId) {
  console.log(baseLine('INFO', requestId, msg));
}

function warn(msg, requestId) {
  console.warn(baseLine('WARN', requestId, msg));
}

/**
 * Log lỗi chi tiết — luôn in stack trace + context ra console,
 * bất kể LOG_LEVEL, vì lỗi luôn cần được nhìn thấy trên Render.
 * Phần "context" (body, params, query...) chỉ in đầy đủ khi
 * LOG_LEVEL=debug để tránh log quá dài trong môi trường production
 * nếu admin không cần chi tiết tới mức đó.
 */
function error(msg, err, requestId, context) {
  console.error(baseLine('ERROR', requestId, msg));
  if (err) {
    console.error(`  ↳ message: ${err.message}`);
    console.error(`  ↳ stack: ${err.stack}`);
  }
  if (context && IS_DEBUG) {
    try {
      console.error(`  ↳ context: ${JSON.stringify(context)}`);
    } catch {
      console.error('  ↳ context: [không thể serialize]');
    }
  }
}

function debug(msg, requestId, context) {
  if (!IS_DEBUG) return;
  console.log(baseLine('DEBUG', requestId, msg));
  if (context !== undefined) {
    try {
      console.log(`  ↳ ${JSON.stringify(context)}`);
    } catch {
      console.log('  ↳ [không thể serialize context]');
    }
  }
}

module.exports = { info, warn, error, debug, IS_DEBUG };
