import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { seedBooks, seedDemo, CATEGORIES } from './seed.js';
import { SHOP_ITEMS, SKINS, DEFAULT_AVATAR, DEFAULT_INVENTORY } from './shop.js';
import { searchGoogleBooks, cacheBooks } from './books.js';
import { oauthRoutes, enabledProviders } from './oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KINDS = {
  oneline: { label: '한 줄 평', creative: false },
  review: { label: '서평·독후감', creative: false },
  fanart: { label: '팬아트', creative: true },
  goods: { label: '굿즈 기획', creative: true },
  cosplay: { label: '코스프레', creative: true },
  sidestory: { label: '외전·평행세계 글', creative: true },
  webnovel: { label: '웹소설', creative: true },
  webtoon: { label: '웹툰', creative: true },
  other: { label: '기타', creative: true },
};
const CREATIVE_KINDS = Object.keys(KINDS).filter((k) => KINDS[k].creative);
const CREATIVE_SQL = CREATIVE_KINDS.map((k) => `'${k}'`).join(',');
// 창작 전시관 필터: 프로토타입의 5분류를 우리 종류에 묶는다
export const GALLERY_GROUPS = {
  fanart: ['fanart'], goods: ['goods'], spinoff: ['sidestory', 'webnovel'], webtoon: ['webtoon'], etc: ['cosplay', 'other'],
};
export const REWARDS = { onboarding: 200, shelf: 50, oneline: 30, review: 70, creative: 120 };
export const REPORT_REASONS = ['저작권 침해', '개인정보·초상권 침해', '성인물', '괴롭힘·혐오', '불법·유해', '스팸', '기타'];

export const LIMITS = { maxImageBytes: 5 * 1024 * 1024, maxImages: 4, titleMax: 100, bodyMax: 10000, onelineMax: 300, nicknameMax: 20 };

const sniffImage = (buf) => {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', 'png'];
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return ['image/webp', 'webp'];
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return ['image/gif', 'gif'];
  return null;
};

const err = (status, message, code) => Object.assign(new Error(message), { status, code });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(opts = {}) {
  const cfg = {
    dbPath: opts.dbPath ?? process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'bookrest.db'),
    uploadDir: opts.uploadDir ?? process.env.UPLOAD_DIR ?? path.join(__dirname, '..', 'data', 'uploads'),
    devLogin: opts.devLogin ?? (process.env.DEV_LOGIN ? process.env.DEV_LOGIN !== '0' : process.env.NODE_ENV !== 'production'),
    googleBooks: opts.googleBooks ?? process.env.BOOKS_PROVIDER !== 'local',
    googleKey: opts.googleKey ?? process.env.GOOGLE_BOOKS_API_KEY,
    bookSearch: opts.bookSearch, // 테스트용 주입
    adminUsers: (opts.adminUsers ?? process.env.ADMIN_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    baseUrl: opts.baseUrl ?? process.env.BASE_URL ?? 'http://localhost:3000',
    secureCookie: process.env.NODE_ENV === 'production',
    demo: opts.demo ?? (process.env.SEED_DEMO ? process.env.SEED_DEMO !== '0' : process.env.NODE_ENV !== 'production'),
  };
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const db = openDb(cfg.dbPath);
  seedBooks(db);
  if (cfg.demo) seedDemo(db, cfg.uploadDir);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });

  // ---------- 세션/인증 ----------
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const userRow = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const publicUser = (u) => u && { id: u.id, nickname: u.nickname, interests: JSON.parse(u.interests), role: u.role, onboarded: !!u.onboarded, points: u.points, inventory: JSON.parse(u.inventory), avatar: JSON.parse(u.avatar), bio: u.bio };
  /** 포인트 지급. (kind, ref)당 한 번만 지급되어 반복으로 늘릴 수 없다. 지급액을 돌려준다(이미 받았으면 0). */
  const award = (userId, kind, ref, delta) => {
    const r = db.prepare('INSERT OR IGNORE INTO point_log (user_id, kind, ref, delta) VALUES (?,?,?,?)').run(userId, kind, String(ref), delta);
    if (!r.changes) return 0;
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(delta, userId);
    return delta;
  };

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const ttl = 14 * 24 * 3600;
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, Math.floor(Date.now() / 1000) + ttl);
    res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: cfg.secureCookie, maxAge: ttl * 1000, path: '/' });
  }

  app.use((req, res, next) => {
    // CSRF: 상태 변경 요청은 동일 출처만 허용
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return next(err(403, '허용되지 않은 요청 출처입니다.'));
    }
    const sid = cookies(req).sid;
    req.user = null;
    if (sid) {
      const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(sid);
      if (row && row.expires_at > Date.now() / 1000) req.user = userRow(row.user_id);
    }
    next();
  });
  const requireUser = (req, res, next) => (req.user ? next() : next(err(401, '로그인이 필요합니다.')));
  const requireAdmin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(err(403, '운영자만 접근할 수 있습니다.')));

  function upsertSocialUser(provider, providerId, nickname) {
    let u = db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, providerId);
    const isAdmin = cfg.adminUsers.includes(`${provider}:${providerId}`) || (provider === 'dev' && providerId === 'admin');
    if (!u) {
      const id = db.prepare('INSERT INTO users (provider, provider_id, nickname, role, inventory, avatar) VALUES (?,?,?,?,?,?)')
        .run(provider, providerId, (nickname || '독자').slice(0, LIMITS.nicknameMax), isAdmin ? 'admin' : 'user', JSON.stringify(DEFAULT_INVENTORY), JSON.stringify(DEFAULT_AVATAR)).lastInsertRowid;
      u = userRow(id);
    } else if (isAdmin && u.role !== 'admin') {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
      u = userRow(u.id);
    }
    return u;
  }

  oauthRoutes(app, { cfg, db, startSession, upsertSocialUser, wrap });

  app.get('/api/auth/config', (req, res) => res.json({ providers: enabledProviders(), devLogin: cfg.devLogin }));
  app.post('/api/auth/dev', wrap((req, res) => {
    if (!cfg.devLogin) throw err(404, '개발용 로그인이 꺼져 있습니다.');
    const name = String(req.body?.name || '').trim().slice(0, LIMITS.nicknameMax);
    if (!name) throw err(400, '이름을 입력해 주세요.');
    const key = req.body?.admin ? 'admin' : name.toLowerCase();
    const u = upsertSocialUser('dev', key, name);
    startSession(res, u.id);
    res.json({ user: publicUser(u) });
  }));
  app.post('/api/auth/logout', (req, res) => {
    const sid = cookies(req).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(sid);
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  // ---------- 내 정보 ----------
  app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

  const cleanInterests = (v) => {
    if (!Array.isArray(v)) throw err(400, '관심 분야 형식이 올바르지 않습니다.');
    return [...new Set(v.filter((c) => CATEGORIES.includes(c)))].slice(0, 5);
  };
  const cleanNickname = (v) => {
    const n = String(v ?? '').trim();
    if (n.length < 1 || n.length > LIMITS.nicknameMax) throw err(400, `닉네임은 1~${LIMITS.nicknameMax}자로 입력해 주세요.`);
    return n;
  };
  app.patch('/api/me', requireUser, wrap((req, res) => {
    const u = req.user;
    const nickname = req.body.nickname !== undefined ? cleanNickname(req.body.nickname) : u.nickname;
    const interests = req.body.interests !== undefined ? cleanInterests(req.body.interests) : JSON.parse(u.interests);
    const first = !u.onboarded;
    db.prepare('UPDATE users SET nickname = ?, interests = ?, onboarded = 1 WHERE id = ?').run(nickname, JSON.stringify(interests), u.id);
    let bonus = 0;
    if (first) { // 온보딩: 고른 책을 서재에 담고 보상 지급
      const ids = Array.isArray(req.body.bookIds) ? req.body.bookIds.slice(0, 6) : [];
      for (const id of ids) if (bookRow(id)) db.prepare('INSERT OR IGNORE INTO shelf (user_id, book_id) VALUES (?,?)').run(u.id, Number(id));
      bonus = award(u.id, 'onboarding', 'done', REWARDS.onboarding);
    }
    res.json({ user: publicUser(userRow(u.id)), bonus });
  }));

  // 꾸미기 상점
  app.get('/api/shop', requireUser, (req, res) => res.json({ items: SHOP_ITEMS, skins: SKINS, points: req.user.points, inventory: JSON.parse(req.user.inventory), avatar: JSON.parse(req.user.avatar) }));
  app.post('/api/shop/buy', requireUser, wrap((req, res) => {
    const item = SHOP_ITEMS.find((i) => i.id === req.body?.itemId);
    if (!item) throw err(404, '없는 아이템입니다.');
    const inv = JSON.parse(req.user.inventory);
    if (inv.includes(item.id)) throw err(400, '이미 가지고 있는 아이템입니다.');
    // 포인트가 모자라면 조건부 UPDATE가 실패한다(동시 요청에도 음수가 되지 않음)
    const r = db.prepare('UPDATE users SET points = points - ? WHERE id = ? AND points >= ?').run(item.price, req.user.id, item.price);
    if (!r.changes) throw err(400, `포인트가 부족해요. (필요 ${item.price}P)`, 'not_enough_points');
    inv.push(item.id);
    db.prepare('UPDATE users SET inventory = ? WHERE id = ?').run(JSON.stringify(inv), req.user.id);
    res.json({ user: publicUser(userRow(req.user.id)), message: `${item.name}을(를) 샀어요!` });
  }));
  app.put('/api/me/avatar', requireUser, wrap((req, res) => {
    const inv = JSON.parse(req.user.inventory); const cur = JSON.parse(req.user.avatar); const body = req.body || {};
    const next = { skin: SKINS.includes(body.skin) ? body.skin : cur.skin || DEFAULT_AVATAR.skin };
    for (const slot of ['hat', 'outfit', 'accessory']) {
      const id = body[slot]; if (!id) continue; // 비우면 해제
      const item = SHOP_ITEMS.find((i) => i.id === id);
      if (!item || item.slot !== slot || !inv.includes(id)) throw err(400, '가지고 있지 않은 아이템이에요.');
      next[slot] = id;
    }
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(JSON.stringify(next), req.user.id);
    res.json({ user: publicUser(userRow(req.user.id)) });
  }));

  // AUTH-04: 계정 삭제. 본인 기록·파일·좋아요·책장을 즉시 삭제한다(법적 보관 의무는 정책 확정 후 조정).
  app.delete('/api/me', requireUser, wrap((req, res) => {
    const files = db.prepare('SELECT a.stored_name FROM attachments a JOIN contents c ON c.id = a.content_id WHERE c.user_id = ?').all(req.user.id);
    for (const f of files) fs.rmSync(path.join(cfg.uploadDir, f.stored_name), { force: true });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // contents/likes/shelf/sessions cascade
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true, message: '계정과 모든 기록이 삭제되었습니다.' });
  }));

  app.get('/api/me/notices', requireUser, (req, res) => {
    const notices = db.prepare('SELECT id, message, read, created_at FROM notices WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
    db.prepare('UPDATE notices SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ notices });
  });

  // ---------- 도서 ----------
  app.get('/api/categories', (req, res) => res.json({ categories: CATEGORIES, kinds: Object.entries(KINDS).map(([id, k]) => ({ id, ...k })), reportReasons: REPORT_REASONS, limits: LIMITS }));

  const PAGE = 24;
  function listBooks({ q, category, offset = 0 }) {
    const where = []; const args = [];
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
      where.push("(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR publisher LIKE ? ESCAPE '\\')");
      args.push(like, like, like);
    }
    if (category) { where.push('category = ?'); args.push(category); }
    return db.prepare(`SELECT * FROM books ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id LIMIT ? OFFSET ?`).all(...args, PAGE, offset);
  }

  app.get('/api/books', requireUser, wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    let degraded = false;
    if (q && offset === 0 && (cfg.googleBooks || cfg.bookSearch)) {
      try {
        const found = await (cfg.bookSearch ?? ((s) => searchGoogleBooks(s, { apiKey: cfg.googleKey })))(q);
        cacheBooks(db, found);
      } catch { degraded = true; }
    }
    const books = listBooks({ q, category, offset });
    res.json({ books, degraded, hasMore: books.length === PAGE });
  }));

  // LIB-03: 관심 분야 도서를 상단에, 부족하면 기본 목록으로 보완
  app.get('/api/books/recommended', requireUser, (req, res) => {
    // 온보딩 중에는 아직 저장 전인 선택 분야(?categories=)로도 추천한다
    const asked = String(req.query.categories || '').split(',').filter((c) => CATEGORIES.includes(c));
    const interests = asked.length ? asked : JSON.parse(req.user.interests);
    const matched = interests.length
      ? db.prepare(`SELECT * FROM books WHERE category IN (${interests.map(() => '?').join(',')}) ORDER BY id LIMIT 12`).all(...interests) : [];
    let books = matched;
    if (books.length < 8) {
      const ids = new Set(books.map((b) => b.id));
      books = books.concat(db.prepare('SELECT * FROM books ORDER BY id LIMIT 24').all().filter((b) => !ids.has(b.id))).slice(0, 12);
    }
    res.json({ books, personalized: matched.length > 0 });
  });

  const bookRow = (id) => db.prepare('SELECT * FROM books WHERE id = ?').get(id);

  // ---------- 콘텐츠 가시성 ----------
  const hydrate = (rows, viewer) => rows.map((c) => {
    const atts = db.prepare('SELECT id, alt, external_url FROM attachments WHERE content_id = ? ORDER BY id').all(c.id);
    const likes = c.base_likes + db.prepare('SELECT COUNT(*) n FROM likes WHERE content_id = ?').get(c.id).n;
    const liked = viewer ? !!db.prepare('SELECT 1 FROM likes WHERE content_id = ? AND user_id = ?').get(c.id, viewer.id) : false;
    const au = db.prepare('SELECT id, nickname, avatar FROM users WHERE id = ?').get(c.user_id); const author = au && { id: au.id, nickname: au.nickname, avatar: JSON.parse(au.avatar) };
    return {
      id: c.id, book_id: c.book_id, kind: c.kind, kind_label: KINDS[c.kind]?.label, creative: !!KINDS[c.kind]?.creative,
      title: c.title, body: c.body, visibility: c.visibility, hidden: !!c.hidden, created_at: c.created_at, published_at: c.published_at, book_title: bookRow(c.book_id)?.title,
      attachments: atts.map((a) => ({ id: a.id, alt: a.alt, url: a.external_url || `/api/files/${a.id}` })), likes, liked, author,
      mine: viewer?.id === c.user_id,
    };
  });
  const isPublicVisible = 'c.visibility = \'public\' AND c.hidden = 0';
  /** 단건 접근 규칙: 작성자·운영자 또는 (공개이면서 숨김 아님) */
  const canView = (c, u) => c && (u?.id === c.user_id || u?.role === 'admin' || (c.visibility === 'public' && !c.hidden));

  app.get('/api/books/:id', requireUser, wrap((req, res) => {
    const book = bookRow(req.params.id);
    if (!book) throw err(404, '책을 찾을 수 없습니다.');
    const inShelf = !!db.prepare('SELECT 1 FROM shelf WHERE user_id = ? AND book_id = ?').get(req.user.id, book.id);
    // BOOK-05: 좋아요 1개 이상, 좋아요 많은 순, 동점이면 먼저 공개된 작품, 상위 3
    const top = db.prepare(`SELECT * FROM (SELECT c.*, c.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.content_id = c.id) n FROM contents c
      WHERE c.book_id = ? AND ${isPublicVisible} AND c.kind IN (${CREATIVE_SQL})) WHERE n >= 1 ORDER BY n DESC, published_at ASC, id ASC LIMIT 3`).all(book.id);
    const counts = Object.fromEntries(['oneline', 'review', 'creative'].map((t) => [t, db.prepare(
      `SELECT COUNT(*) n FROM contents c WHERE c.book_id = ? AND ${isPublicVisible} AND ${t === 'creative' ? `c.kind IN (${CREATIVE_SQL})` : 'c.kind = ?'}`,
    ).get(...(t === 'creative' ? [book.id] : [book.id, t])).n]));
    res.json({ book: { ...book, tags: JSON.parse(book.tags || '[]') }, inShelf, top: hydrate(top, req.user), counts });
  }));

  app.get('/api/books/:id/contents', requireUser, wrap((req, res) => {
    const tab = ['oneline', 'review', 'creative'].includes(req.query.tab) ? req.query.tab : 'oneline';
    const sort = req.query.sort === 'likes' ? 'likes' : 'latest';
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const kindSql = tab === 'creative' ? `c.kind IN (${CREATIVE_SQL})` : `c.kind = '${tab}'`;
    const order = sort === 'likes' ? 'n DESC, c.published_at ASC' : 'c.published_at DESC, c.id DESC';
    const rows = db.prepare(`SELECT c.*, c.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.content_id = c.id) n FROM contents c
      WHERE c.book_id = ? AND ${isPublicVisible} AND ${kindSql} ORDER BY ${order} LIMIT 20 OFFSET ?`).all(req.params.id, offset);
    res.json({ contents: hydrate(rows, req.user), hasMore: rows.length === 20 });
  }));

  // ---------- 내 책장 ----------
  app.get('/api/shelf', requireUser, (req, res) => {
    const rows = db.prepare(`SELECT b.*, s.created_at added_at, s.status,
      (SELECT COUNT(*) FROM contents c WHERE c.book_id = b.id AND c.user_id = s.user_id) total,
      (SELECT COUNT(*) FROM contents c WHERE c.book_id = b.id AND c.user_id = s.user_id AND c.visibility = 'public' AND c.hidden = 0) pub
      FROM shelf s JOIN books b ON b.id = s.book_id WHERE s.user_id = ? ORDER BY s.id DESC`).all(req.user.id);
    res.json({ books: rows });
  });
  app.post('/api/shelf', requireUser, wrap((req, res) => {
    const book = bookRow(req.body?.bookId);
    if (!book) throw err(404, '책을 찾을 수 없습니다.');
    const r = db.prepare('INSERT OR IGNORE INTO shelf (user_id, book_id) VALUES (?,?)').run(req.user.id, book.id);
    const points = r.changes ? award(req.user.id, 'shelf', book.id, REWARDS.shelf) : 0;
    res.status(r.changes ? 201 : 200).json({ added: !!r.changes, alreadyInShelf: !r.changes, points });
  }));
  app.patch('/api/shelf/:bookId', requireUser, wrap((req, res) => {
    const status = req.body?.status;
    if (!['reading', 'completed', 'want_to_read'].includes(status)) throw err(400, '읽기 상태가 올바르지 않습니다.');
    const r = db.prepare('UPDATE shelf SET status = ? WHERE user_id = ? AND book_id = ?').run(status, req.user.id, Number(req.params.bookId));
    if (!r.changes) throw err(404, '책장에 없는 책입니다.');
    res.json({ ok: true, status });
  }));
  // SHELF-07: records=keep(기록은 비공개로 보관) | delete(기록도 삭제) — 선택은 사용자가 한다.
  app.delete('/api/shelf/:bookId', requireUser, wrap((req, res) => {
    const records = req.query.records;
    if (!['keep', 'delete'].includes(records)) throw err(400, '연결된 기록을 보관할지 삭제할지 선택해 주세요.', 'records_required');
    const bookId = Number(req.params.bookId);
    if (!db.prepare('SELECT 1 FROM shelf WHERE user_id = ? AND book_id = ?').get(req.user.id, bookId)) throw err(404, '책장에 없는 책입니다.');
    if (records === 'delete') {
      const files = db.prepare('SELECT a.stored_name FROM attachments a JOIN contents c ON c.id = a.content_id WHERE c.user_id = ? AND c.book_id = ?').all(req.user.id, bookId);
      for (const f of files) fs.rmSync(path.join(cfg.uploadDir, f.stored_name), { force: true });
      db.prepare('DELETE FROM contents WHERE user_id = ? AND book_id = ?').run(req.user.id, bookId);
    } else {
      db.prepare("UPDATE contents SET visibility = 'private', updated_at = datetime('now') WHERE user_id = ? AND book_id = ?").run(req.user.id, bookId);
    }
    db.prepare('DELETE FROM shelf WHERE user_id = ? AND book_id = ?').run(req.user.id, bookId);
    res.json({ ok: true });
  }));
  app.get('/api/me/books/:bookId/contents', requireUser, wrap((req, res) => {
    const book = bookRow(req.params.bookId);
    if (!book) throw err(404, '책을 찾을 수 없습니다.');
    const inShelf = !!db.prepare('SELECT 1 FROM shelf WHERE user_id = ? AND book_id = ?').get(req.user.id, book.id);
    if (!inShelf) throw err(404, '내 책장에 없는 책입니다.');
    const rows = db.prepare('SELECT * FROM contents WHERE user_id = ? AND book_id = ? ORDER BY id DESC').all(req.user.id, book.id);
    const status = db.prepare('SELECT status FROM shelf WHERE user_id = ? AND book_id = ?').get(req.user.id, book.id).status;
    res.json({ book, status, contents: hydrate(rows, req.user) });
  }));

  // ---------- 콘텐츠 작성/수정/삭제 ----------
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxImageBytes, files: LIMITS.maxImages } });
  const uploadMw = (req, res, next) => upload.array('images', LIMITS.maxImages)(req, res, (e) => {
    if (!e) return next();
    if (e.code === 'LIMIT_FILE_SIZE') return next(err(413, `이미지는 파일당 ${LIMITS.maxImageBytes / 1024 / 1024}MB 이하여야 합니다.`, 'file_too_large'));
    if (e.code === 'LIMIT_UNEXPECTED_FILE' || e.code === 'LIMIT_FILE_COUNT') return next(err(400, `이미지는 최대 ${LIMITS.maxImages}장까지 올릴 수 있습니다.`, 'too_many_files'));
    next(err(400, '업로드 처리 중 문제가 발생했습니다.'));
  });

  function validateFields(body, existing) {
    const kind = body.kind ?? existing?.kind;
    if (!KINDS[kind]) throw err(400, '콘텐츠 종류를 선택해 주세요.');
    const title = String(body.title ?? existing?.title ?? '').trim();
    const text = String(body.body ?? existing?.body ?? '').trim();
    const visibility = body.visibility ?? existing?.visibility ?? 'private';
    if (!['private', 'public'].includes(visibility)) throw err(400, '공개 여부가 올바르지 않습니다.');
    if (title.length > LIMITS.titleMax) throw err(400, `제목은 ${LIMITS.titleMax}자 이하로 입력해 주세요.`);
    const max = kind === 'oneline' ? LIMITS.onelineMax : LIMITS.bodyMax;
    if (text.length > max) throw err(400, `본문은 ${max}자 이하로 입력해 주세요.`);
    if (kind !== 'oneline' && !title) throw err(400, '제목을 입력해 주세요.');
    return { kind, title, text, visibility };
  }

  function saveImages(files, contentId, alts) {
    const saved = [];
    try {
      files.forEach((f, i) => {
        const type = sniffImage(f.buffer);
        if (!type) throw err(400, 'PNG, JPG, WEBP, GIF 이미지만 올릴 수 있습니다.', 'bad_image');
        const stored = `${crypto.randomUUID()}.${type[1]}`;
        fs.writeFileSync(path.join(cfg.uploadDir, stored), f.buffer);
        saved.push(stored);
        db.prepare('INSERT INTO attachments (content_id, stored_name, mime, size, alt) VALUES (?,?,?,?,?)')
          .run(contentId, stored, type[0], f.size, String(alts[i] || '').slice(0, 200));
      });
    } catch (e) { saved.forEach((s) => fs.rmSync(path.join(cfg.uploadDir, s), { force: true })); throw e; }
  }

  const getAlts = (b) => { try { return Array.isArray(b.alts) ? b.alts : JSON.parse(b.alts || '[]'); } catch { return []; } };

  app.post('/api/contents', requireUser, uploadMw, wrap((req, res) => {
    const book = bookRow(req.body.bookId);
    if (!book) throw err(404, '책을 찾을 수 없습니다.');
    if (!db.prepare('SELECT 1 FROM shelf WHERE user_id = ? AND book_id = ?').get(req.user.id, book.id)) throw err(400, '먼저 책을 내 책장에 추가해 주세요.');
    const f = validateFields(req.body);
    const files = req.files || [];
    if (!f.text && !files.length) throw err(400, '본문 또는 이미지를 입력해 주세요.');
    if (files.length && KINDS[f.kind].creative === false) throw err(400, '이 종류에는 이미지를 첨부할 수 없습니다.');
    db.exec('BEGIN');
    try {
      const id = db.prepare(`INSERT INTO contents (user_id, book_id, kind, title, body, visibility, published_at)
        VALUES (?,?,?,?,?,?, ${f.visibility === 'public' ? "datetime('now')" : 'NULL'})`).run(req.user.id, book.id, f.kind, f.title, f.text, f.visibility).lastInsertRowid;
      saveImages(files, id, getAlts(req.body));
      db.exec('COMMIT');
      const points = award(req.user.id, 'content', id, KINDS[f.kind].creative ? REWARDS.creative : REWARDS[f.kind]);
      res.status(201).json({ content: hydrate([db.prepare('SELECT * FROM contents WHERE id = ?').get(id)], req.user)[0], points });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }));

  const ownContent = (req) => {
    const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(req.params.id);
    if (!c || c.user_id !== req.user.id) throw err(404, '콘텐츠를 찾을 수 없습니다.');
    return c;
  };
  const removeFile = (stored) => fs.rmSync(path.join(cfg.uploadDir, stored), { force: true });

  app.put('/api/contents/:id', requireUser, uploadMw, wrap((req, res) => {
    const c = ownContent(req);
    if (c.hidden) throw err(403, '운영 정책에 따라 숨김 처리된 콘텐츠는 수정할 수 없습니다. 비공개 전환이나 삭제는 가능합니다.', 'hidden');
    const f = validateFields({ ...req.body, kind: c.kind }, c);
    const remove = (() => { try { return JSON.parse(req.body.removeAttachments || '[]').map(Number); } catch { return []; } })();
    const files = req.files || [];
    db.exec('BEGIN');
    try {
      const del = db.prepare('SELECT * FROM attachments WHERE content_id = ?').all(c.id).filter((a) => remove.includes(a.id));
      for (const a of del) db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
      const left = db.prepare('SELECT COUNT(*) n FROM attachments WHERE content_id = ?').get(c.id).n;
      if (left + files.length > LIMITS.maxImages) throw err(400, `이미지는 최대 ${LIMITS.maxImages}장까지 올릴 수 있습니다.`, 'too_many_files');
      if (files.length && !KINDS[c.kind].creative) throw err(400, '이 종류에는 이미지를 첨부할 수 없습니다.');
      if (!f.text && !left && !files.length) throw err(400, '내용을 입력해 주세요.');
      saveImages(files, c.id, getAlts(req.body));
      const becamePublic = f.visibility === 'public' && c.visibility !== 'public';
      db.prepare(`UPDATE contents SET title = ?, body = ?, visibility = ?, updated_at = datetime('now'),
        published_at = CASE WHEN ? THEN datetime('now') WHEN ? = 'private' THEN NULL ELSE published_at END WHERE id = ?`)
        .run(f.title, f.text, f.visibility, becamePublic ? 1 : 0, f.visibility, c.id);
      db.exec('COMMIT');
      del.forEach((a) => removeFile(a.stored_name));
      res.json({ content: hydrate([db.prepare('SELECT * FROM contents WHERE id = ?').get(c.id)], req.user)[0] });
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }));

  // 공개 ↔ 비공개 전환만 따로 (빠른 토글용)
  app.patch('/api/contents/:id/visibility', requireUser, wrap((req, res) => {
    const c = ownContent(req);
    const v = req.body?.visibility;
    if (!['private', 'public'].includes(v)) throw err(400, '공개 여부가 올바르지 않습니다.');
    if (c.hidden && v === 'public') throw err(403, '숨김 처리된 콘텐츠는 공개할 수 없습니다.', 'hidden');
    db.prepare(`UPDATE contents SET visibility = ?, published_at = CASE WHEN ? = 'public' AND visibility != 'public' THEN datetime('now') WHEN ? = 'private' THEN NULL ELSE published_at END,
      updated_at = datetime('now') WHERE id = ?`).run(v, v, v, c.id);
    res.json({ content: hydrate([db.prepare('SELECT * FROM contents WHERE id = ?').get(c.id)], req.user)[0] });
  }));

  app.delete('/api/contents/:id', requireUser, wrap((req, res) => {
    const c = ownContent(req);
    const files = db.prepare('SELECT stored_name FROM attachments WHERE content_id = ?').all(c.id);
    db.prepare('DELETE FROM contents WHERE id = ?').run(c.id);
    files.forEach((f) => removeFile(f.stored_name));
    res.json({ ok: true });
  }));

  app.get('/api/contents/:id', requireUser, wrap((req, res) => {
    const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(req.params.id);
    if (!canView(c, req.user)) throw err(404, '콘텐츠를 찾을 수 없거나 공개되지 않은 콘텐츠입니다.');
    res.json({ content: hydrate([c], req.user)[0], book: bookRow(c.book_id) });
  }));

  // 첨부 파일: 비공개 원본은 서버에서 권한 검사
  app.get('/api/files/:id', requireUser, wrap((req, res) => {
    const a = db.prepare('SELECT a.*, c.user_id, c.visibility, c.hidden FROM attachments a JOIN contents c ON c.id = a.content_id WHERE a.id = ?').get(req.params.id);
    if (!a || !canView(a, req.user)) throw err(404, '파일을 찾을 수 없습니다.');
    res.set({ 'Content-Type': a.mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
    res.sendFile(path.resolve(cfg.uploadDir, a.stored_name));
  }));

  // ---------- 좋아요 ----------
  function likeTarget(req) {
    const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(req.params.id);
    if (!c || c.visibility !== 'public' || c.hidden) throw err(404, '공개된 작품이 아닙니다.');
    return c;
  }
  const likeState = (c, u) => ({ likes: c.base_likes + db.prepare('SELECT COUNT(*) n FROM likes WHERE content_id = ?').get(c.id).n, liked: !!db.prepare('SELECT 1 FROM likes WHERE content_id = ? AND user_id = ?').get(c.id, u.id) });
  app.put('/api/contents/:id/like', requireUser, wrap((req, res) => {
    const c = likeTarget(req);
    if (c.user_id === req.user.id) throw err(400, '내 작품에는 좋아요를 누를 수 없습니다.');
    db.prepare('INSERT OR IGNORE INTO likes (user_id, content_id) VALUES (?,?)').run(req.user.id, c.id); // 중복 불가(PK)
    res.json(likeState(c, req.user));
  }));
  app.delete('/api/contents/:id/like', requireUser, wrap((req, res) => {
    const c = likeTarget(req);
    db.prepare('DELETE FROM likes WHERE user_id = ? AND content_id = ?').run(req.user.id, c.id);
    res.json(likeState(c, req.user));
  }));

  // ---------- 창작 전시관: 모든 책의 공개 2차 창작물 ----------
  app.get('/api/gallery', requireUser, wrap((req, res) => {
    const group = GALLERY_GROUPS[req.query.category]; const kinds = (group || CREATIVE_KINDS).map((k) => `'${k}'`).join(',');
    const sort = req.query.sort === 'latest' ? 'latest' : 'popular'; const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const order = sort === 'popular' ? 'n DESC, published_at DESC, id DESC' : 'published_at DESC, id DESC';
    const rows = db.prepare(`SELECT * FROM (SELECT c.*, c.base_likes + (SELECT COUNT(*) FROM likes l WHERE l.content_id = c.id) n FROM contents c
      WHERE ${isPublicVisible} AND c.kind IN (${kinds})) ORDER BY ${order} LIMIT 24 OFFSET ?`).all(offset);
    res.json({ contents: hydrate(rows, req.user), hasMore: rows.length === 24 });
  }));

  // ---------- 다른 사용자의 서재 (공개 콘텐츠만) ----------
  app.get('/api/users/:id', requireUser, wrap((req, res) => {
    const u = userRow(req.params.id);
    if (!u) throw err(404, '사용자를 찾을 수 없습니다.');
    const books = db.prepare(`SELECT b.* FROM books b WHERE b.id IN (SELECT c.book_id FROM contents c WHERE c.user_id = ? AND ${isPublicVisible})
      ORDER BY (SELECT MAX(c.published_at) FROM contents c WHERE c.book_id = b.id AND c.user_id = ? AND ${isPublicVisible}) DESC`).all(u.id, u.id);
    const out = books.map((b) => ({
      ...b, contents: hydrate(db.prepare(`SELECT c.* FROM contents c WHERE c.user_id = ? AND c.book_id = ? AND ${isPublicVisible} ORDER BY c.published_at DESC`).all(u.id, b.id), req.user),
    }));
    res.json({ user: { id: u.id, nickname: u.nickname, bio: u.bio, avatar: JSON.parse(u.avatar) }, books: out, isMe: u.id === req.user.id });
  }));

  // ---------- 신고 / 운영 ----------
  app.post('/api/reports', requireUser, wrap((req, res) => {
    const { targetType, targetId, reason } = req.body || {};
    const detail = String(req.body?.detail || '').slice(0, 1000);
    if (!REPORT_REASONS.includes(reason)) throw err(400, '신고 사유를 선택해 주세요.');
    if (targetType === 'content') {
      const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(targetId);
      if (!c || c.visibility !== 'public' || c.hidden) throw err(404, '신고할 공개 콘텐츠를 찾을 수 없습니다.');
      if (c.user_id === req.user.id) throw err(400, '내 콘텐츠는 신고할 수 없습니다.');
    } else if (targetType === 'profile') {
      if (!userRow(targetId)) throw err(404, '사용자를 찾을 수 없습니다.');
      if (Number(targetId) === req.user.id) throw err(400, '내 프로필은 신고할 수 없습니다.');
    } else throw err(400, '신고 대상이 올바르지 않습니다.');
    const dup = db.prepare("SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status IN ('received','reviewing')").get(req.user.id, targetType, targetId);
    if (dup) return res.json({ ok: true, reportId: dup.id, duplicate: true, message: '이미 접수된 신고입니다. 검토 결과를 기다려 주세요.' });
    const id = db.prepare('INSERT INTO reports (reporter_id, target_type, target_id, reason, detail) VALUES (?,?,?,?,?)').run(req.user.id, targetType, targetId, reason, detail).lastInsertRowid;
    res.status(201).json({ ok: true, reportId: id, message: '신고가 접수되었습니다.' });
  }));

  app.get('/api/admin/reports', requireUser, requireAdmin, (req, res) => {
    const status = req.query.status;
    const rows = db.prepare(`SELECT r.*, u.nickname reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
      ${['received', 'reviewing', 'resolved', 'rejected'].includes(status) ? 'WHERE r.status = ?' : 'WHERE ? IS NOT NULL'} ORDER BY r.id DESC LIMIT 100`).all(status || 'all');
    const out = rows.map((r) => {
      let target = null;
      if (r.target_type === 'content') {
        const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(r.target_id);
        if (c) target = { ...hydrate([c], req.user)[0], book: bookRow(c.book_id)?.title };
      } else { const u = userRow(r.target_id); if (u) target = { id: u.id, nickname: u.nickname }; }
      return { ...r, target };
    });
    res.json({ reports: out });
  });
  app.patch('/api/admin/reports/:id', requireUser, requireAdmin, wrap((req, res) => {
    const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
    if (!r) throw err(404, '신고를 찾을 수 없습니다.');
    const status = req.body?.status;
    if (!['reviewing', 'resolved', 'rejected'].includes(status)) throw err(400, '처리 상태가 올바르지 않습니다.');
    const note = String(req.body?.note || '').slice(0, 500);
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE reports SET status = ?, note = ?, handled_by = ?, handled_at = datetime('now') WHERE id = ?").run(status, note, req.user.id, r.id);
      if (r.target_type === 'content' && req.body?.hide !== undefined) {
        const c = db.prepare('SELECT * FROM contents WHERE id = ?').get(r.target_id);
        if (c) {
          db.prepare('UPDATE contents SET hidden = ? WHERE id = ?').run(req.body.hide ? 1 : 0, c.id);
          if (req.body.hide) db.prepare('INSERT INTO notices (user_id, message) VALUES (?,?)')
            .run(c.user_id, `운영 정책 검토 결과 "${c.title || KINDS[c.kind].label}" 콘텐츠가 숨김 처리되었습니다.${note ? ' 사유: ' + note : ''}`);
        }
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ ok: true });
  }));

  // ---------- 정적 파일/에러 ----------
  app.use('/api', (req, res, next) => next(err(404, '존재하지 않는 API입니다.')));
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  app.use((e, req, res, _next) => {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ error: status === 500 ? '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' : e.message, code: e.code });
  });

  app.locals.db = db;
  app.locals.close = () => db.close();
  return app;
}
