/**
 * routes/apiPosts.js
 * --------------------------------------------------------------
 * Nhóm route /api/posts/* — QUẢN TRỊ bài viết.
 * Toàn bộ route trong file này yêu cầu header x-api-key hợp lệ
 * (áp middleware requireApiKey ở server.js trước khi mount router).
 *
 * Đây cũng là nơi duy nhất để TẠO/SỬA/XOÁ bài viết — vì trang
 * /create đã bị gỡ khỏi giao diện web theo yêu cầu, việc đăng bài
 * giờ chỉ thực hiện được qua API trực tiếp (Postman/curl/app khác)
 * kèm API key admin.
 * --------------------------------------------------------------
 */

const express = require('express');
const store = require('../store');
const logger = require('../lib/logger');
const { ok, fail, isValidUrl, getBaseUrl } = require('../lib/respond');

const router = express.Router();

/**
 * POST /api/posts
 */
router.post('/', (req, res) => {
  const { title, content, author, tags, coverImage } = req.body || {};
  logger.debug('Tạo bài viết mới', req.requestId, { title, author, tags });

  if (!title || typeof title !== 'string' || !title.trim()) {
    return fail(res, 400, 'TITLE_REQUIRED', 'Thiếu trường "title" (tiêu đề bài viết).', req.requestId);
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return fail(res, 400, 'CONTENT_REQUIRED', 'Thiếu trường "content" (nội dung bài viết).', req.requestId);
  }
  if (title.length > 200) {
    return fail(res, 400, 'TITLE_TOO_LONG', 'Tiêu đề tối đa 200 ký tự.', req.requestId);
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return fail(res, 400, 'TAGS_INVALID', 'tags phải là một mảng chuỗi.', req.requestId);
  }
  if (coverImage !== undefined && coverImage !== null && !isValidUrl(coverImage)) {
    return fail(res, 400, 'COVER_IMAGE_INVALID', 'coverImage phải là URL hợp lệ.', req.requestId);
  }

  try {
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
  } catch (err) {
    logger.error('Lỗi khi tạo bài viết', err, req.requestId, { title, author });
    return fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra khi tạo bài viết.', req.requestId);
  }
});

/**
 * GET /api/posts?limit=&offset=&tag=
 */
router.get('/', (req, res) => {
  // Không giới hạn: nếu không truyền "limit", trả về TOÀN BỘ bài viết.
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
 */
router.get('/:idOrSlug', (req, res) => {
  const key = req.params.idOrSlug;
  const record = store.getPostById(key) || store.getPostBySlug(key);

  if (!record) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.', req.requestId);
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
 */
router.put('/:id', (req, res) => {
  const { title, content, tags, coverImage } = req.body || {};

  if (title !== undefined && (!title.trim() || title.length > 200)) {
    return fail(res, 400, 'TITLE_INVALID', 'Tiêu đề không hợp lệ (rỗng hoặc quá 200 ký tự).', req.requestId);
  }
  if (content !== undefined && !content.trim()) {
    return fail(res, 400, 'CONTENT_INVALID', 'Nội dung không được để rỗng.', req.requestId);
  }
  if (tags !== undefined && !Array.isArray(tags)) {
    return fail(res, 400, 'TAGS_INVALID', 'tags phải là một mảng chuỗi.', req.requestId);
  }

  try {
    const record = store.updatePost(req.params.id, { title, content, tags, coverImage });
    if (!record) {
      return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết để cập nhật.', req.requestId);
    }
    return ok(res, { id: record.id, updatedAt: record.updatedAt });
  } catch (err) {
    logger.error('Lỗi khi cập nhật bài viết', err, req.requestId, { id: req.params.id });
    return fail(res, 500, 'INTERNAL_ERROR', 'Đã có lỗi xảy ra khi cập nhật bài viết.', req.requestId);
  }
});

/**
 * DELETE /api/posts/:id
 */
router.delete('/:id', (req, res) => {
  const removed = store.deletePost(req.params.id);
  if (!removed) {
    return fail(res, 404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết để xoá.', req.requestId);
  }
  return ok(res, { id: req.params.id, deleted: true });
});

module.exports = router;
