/**
 * store.js
 * --------------------------------------------------------------
 * Lưu trữ dữ liệu hoàn toàn trong RAM (Map của Node.js).
 * KHÔNG dùng database ngoài (MongoDB/MySQL/Postgres...).
 *
 * Lưu ý quan trọng khi deploy trên Render (free/instance thường):
 * - Dữ liệu sẽ MẤT khi server restart / sleep / redeploy vì RAM
 *   không persistent. Đây là yêu cầu của đề bài (lưu ở cache RAM).
 * - Nếu cần dữ liệu bền vững thực sự, cần gắn thêm DB hoặc disk,
 *   nhưng theo yêu cầu, ta chỉ dùng RAM.
 * --------------------------------------------------------------
 */

const { nanoid } = require('nanoid');

/** Map<code, LinkRecord> */
const links = new Map();

/** Map<id, PostRecord> */
const posts = new Map();

/* ============================ LINKS ============================ */

/**
 * Tạo bản ghi link rút gọn mới.
 * @param {string} originalUrl - URL đích người dùng muốn rút gọn
 * @param {object} [opts]
 * @param {string} [opts.customCode] - mã tuỳ chỉnh (nếu có)
 * @param {number} [opts.ttlMs] - thời gian sống (ms), null = vô hạn
 * @returns {object} LinkRecord vừa tạo
 */
function createLink(originalUrl, opts = {}) {
  let code = opts.customCode && opts.customCode.trim();

  if (code) {
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(code)) {
      throw new Error('CUSTOM_CODE_INVALID');
    }
    if (links.has(code)) {
      throw new Error('CUSTOM_CODE_TAKEN');
    }
  } else {
    // Sinh mã ngẫu nhiên chữ + số, đảm bảo không trùng
    do {
      code = nanoid(7);
    } while (links.has(code));
  }

  const now = Date.now();
  const record = {
    code,
    originalUrl,
    createdAt: now,
    expiresAt: opts.ttlMs ? now + opts.ttlMs : null,
    clicks: 0,
    lastAccessedAt: null,
  };

  links.set(code, record);
  return record;
}

/**
 * Lấy link theo mã, tự xoá nếu đã hết hạn.
 * @param {string} code
 * @returns {object|null}
 */
function getLink(code) {
  const record = links.get(code);
  if (!record) return null;

  if (record.expiresAt && record.expiresAt < Date.now()) {
    links.delete(code);
    return null;
  }
  return record;
}

/** Tăng số lượt click + cập nhật thời gian truy cập cuối */
function hitLink(code) {
  const record = getLink(code);
  if (!record) return null;
  record.clicks += 1;
  record.lastAccessedAt = Date.now();
  return record;
}

function listLinks({ limit = 50, offset = 0 } = {}) {
  const all = Array.from(links.values()).sort((a, b) => b.createdAt - a.createdAt);
  return {
    total: all.length,
    items: all.slice(offset, offset + limit),
  };
}

function deleteLink(code) {
  return links.delete(code);
}

/* ============================ POSTS ============================ */

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu tiếng Việt
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function excerpt(content, length = 180) {
  const plain = content.replace(/\s+/g, ' ').trim();
  if (plain.length <= length) return plain;
  return plain.slice(0, length).trim() + '…';
}

/**
 * Tạo bài viết mới.
 * @param {string} title
 * @param {string} content
 * @param {object} [meta]
 * @returns {object} PostRecord
 */
function createPost(title, content, meta = {}) {
  const id = nanoid(10);
  const now = Date.now();
  const baseSlug = slugify(title) || id;
  let slug = baseSlug;
  let i = 1;
  // Đảm bảo slug không trùng
  const existingSlugs = new Set(Array.from(posts.values()).map((p) => p.slug));
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${i++}`;
  }

  const record = {
    id,
    slug,
    title: String(title).trim(),
    content: String(content),
    excerpt: excerpt(content),
    author: meta.author || 'Ẩn danh',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    coverImage: meta.coverImage || null,
    createdAt: now,
    updatedAt: now,
    views: 0,
  };

  posts.set(id, record);
  return record;
}

function getPostById(id) {
  return posts.get(id) || null;
}

function getPostBySlug(slug) {
  return Array.from(posts.values()).find((p) => p.slug === slug) || null;
}

function hitPostView(id) {
  const record = posts.get(id);
  if (!record) return null;
  record.views += 1;
  return record;
}

/**
 * Danh sách bài viết mới nhất (dùng cho trang chủ & API ping).
 */
function listPosts({ limit = 20, offset = 0, tag = null } = {}) {
  let all = Array.from(posts.values()).sort((a, b) => b.createdAt - a.createdAt);
  if (tag) {
    all = all.filter((p) => p.tags.includes(tag));
  }
  return {
    total: all.length,
    items: all.slice(offset, offset + limit),
  };
}

function updatePost(id, patch = {}) {
  const record = posts.get(id);
  if (!record) return null;
  if (patch.title !== undefined) record.title = String(patch.title).trim();
  if (patch.content !== undefined) {
    record.content = String(patch.content);
    record.excerpt = excerpt(record.content);
  }
  if (patch.tags !== undefined) record.tags = Array.isArray(patch.tags) ? patch.tags : record.tags;
  if (patch.coverImage !== undefined) record.coverImage = patch.coverImage;
  record.updatedAt = Date.now();
  return record;
}

function deletePost(id) {
  return posts.delete(id);
}

/* ============================ STATS ============================ */

const SERVER_STARTED_AT = Date.now();

function getStats() {
  return {
    totalLinks: links.size,
    totalPosts: posts.size,
    totalClicks: Array.from(links.values()).reduce((sum, l) => sum + l.clicks, 0),
    totalViews: Array.from(posts.values()).reduce((sum, p) => sum + p.views, 0),
    serverStartedAt: SERVER_STARTED_AT,
    uptimeSeconds: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
  };
}

/* ============================ CLEANUP JOB ============================ */

// Dọn các link hết hạn mỗi 10 phút để tránh rò rỉ RAM khi dùng TTL
setInterval(() => {
  const now = Date.now();
  for (const [code, record] of links.entries()) {
    if (record.expiresAt && record.expiresAt < now) {
      links.delete(code);
    }
  }
}, 10 * 60 * 1000);

module.exports = {
  // links
  createLink,
  getLink,
  hitLink,
  listLinks,
  deleteLink,
  // posts
  createPost,
  getPostById,
  getPostBySlug,
  hitPostView,
  listPosts,
  updatePost,
  deletePost,
  // stats
  getStats,
};
