// 단독 실행용(standalone) 가짜 백엔드: 서버 없이 브라우저 안에서 /api/* 요청을 처리한다.
// 서버(server/app.js)의 규칙을 같은 모양으로 옮긴 것이다. 데이터는 브라우저 localStorage에 저장되고, 사이트 데이터를 지우면 처음 상태로 돌아간다.
// 빌드(scripts/build-standalone.mjs)가 window.__SEED__ 에 DB 덤프를 넣어 준다.
const SEED = window.__SEED__;
const KEY = 'bookrest-standalone-v2'; // 저장 형식이 바뀌면 숫자를 올려 이전 저장본을 버린다
const FUNDING = { min: 10, max: 1000, def: 50, noteMax: 200 };
const IMAGE_TEMPLATES = ['image', 'goods', 'mixed'];
const REWARDS = { onboarding: 200, shelf: 50, oneline: 30, review: 70, creative: 120 };
const GALLERY_GROUPS = { fanart: ['fanart'], goods: ['goods'], spinoff: ['sidestory', 'webnovel'], webtoon: ['webtoon'], etc: ['cosplay', 'other'] };
const DEFAULT_AVATAR = { skin: '#FBD3AC', outfit: 'outfit_cardigan' };
const { categories: CATEGORIES, kinds: KINDS, reportReasons: REPORT_REASONS, limits: LIMITS } = SEED.categories;
const SHOP = SEED.shop;
const KIND = Object.fromEntries(KINDS.map((k) => [k.id, k]));
const CREATIVE = KINDS.filter((k) => k.creative).map((k) => k.id);

const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.v === 2) return s; } catch { /* 저장소 없음 */ } return null; };
const S = load() || { v: 2, ...structuredClone(SEED.db), likes: [], interests: [], reports: [], notices: [], log: [], meId: null, next: { user: 1000, content: 1000, att: 1000, report: 1, notice: 1 } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 용량 초과 시 이번 변경은 새로고침하면 사라진다 */ } };
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const err = (s, m, c) => new HttpError(s, m, c);
const me = () => S.users.find((u) => u.id === S.meId) || null;
const need = () => { const u = me(); if (!u) throw err(401, '로그인이 필요합니다.'); return u; };
const admin = () => { const u = need(); if (u.role !== 'admin') throw err(403, '운영자만 접근할 수 있습니다.'); return u; };
const book = (id) => S.books.find((b) => b.id === Number(id));
const user = (id) => S.users.find((u) => u.id === Number(id));
const pub = (u) => u && { id: u.id, nickname: u.nickname, interests: u.interests, role: u.role, onboarded: !!u.onboarded, points: u.points, inventory: u.inventory, avatar: u.avatar, bio: u.bio || '' };
const award = (u, kind, ref, delta) => { const k = `${u.id}|${kind}|${ref}`; if (S.log.includes(k)) return 0; S.log.push(k); u.points += delta; return delta; };
const visible = (c) => c.visibility === 'public' && !c.hidden;
const canView = (c, u) => c && (u?.id === c.user_id || u?.role === 'admin' || visible(c));
const likesOf = (c) => c.base_likes + S.likes.filter((l) => l.content_id === c.id).length;
const inShelf = (u, b) => S.shelf.some((s) => s.user_id === u.id && s.book_id === Number(b));

const interestCount = (c) => (c.base_interest || 0) + S.interests.filter((i) => i.content_id === c.id).length;
function funding(c, viewer) {
  if (c.kind !== 'goods') return null; const goal = c.funding_goal || FUNDING.def; const count = interestCount(c);
  return { goal, count, reached: count >= goal, note: c.funding_note || '', interested: !!viewer && S.interests.some((i) => i.content_id === c.id && i.user_id === viewer.id) };
}
function hydrate(c, viewer) {
  const au = user(c.user_id);
  return {
    id: c.id, book_id: c.book_id, kind: c.kind, kind_label: KIND[c.kind]?.label, creative: !!KIND[c.kind]?.creative, title: c.title, body: c.body,
    intro: c.intro || '', template: KIND[c.kind]?.template, visibility: c.visibility, hidden: !!c.hidden, created_at: c.created_at, published_at: c.published_at, book_title: book(c.book_id)?.title,
    attachments: S.attachments.filter((a) => a.content_id === c.id).map((a) => ({ id: a.id, alt: a.alt, url: a.url })),
    likes: likesOf(c), liked: !!viewer && S.likes.some((l) => l.content_id === c.id && l.user_id === viewer.id),
    author: au && { id: au.id, nickname: au.nickname, avatar: au.avatar }, mine: viewer?.id === c.user_id, funding: funding(c, viewer),
  };
}
const bySort = (arr, sort) => arr.sort((a, b) => (sort === 'likes' ? likesOf(b) - likesOf(a) || (a.published_at || '').localeCompare(b.published_at || '') : (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id));

// ---------- 폼/파일 ----------
const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function pickImages(fd) {
  const files = fd.getAll('images').filter((f) => f && f.size);
  const out = [];
  for (const f of files) {
    if (f.size > LIMITS.maxImageBytes) throw err(413, `이미지는 파일당 ${LIMITS.maxImageBytes / 1024 / 1024}MB 이하여야 합니다.`, 'file_too_large');
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) throw err(400, 'PNG, JPG, WEBP, GIF 이미지만 올릴 수 있습니다.', 'bad_image');
    out.push(await readFile(f));
  }
  if (out.length > LIMITS.maxImagesWebtoon) throw err(400, `이미지는 최대 ${LIMITS.maxImagesWebtoon}장까지 올릴 수 있습니다.`, 'too_many_files');
  return out;
}
function fields(body, existing) {
  const kind = body.kind ?? existing?.kind;
  if (!KIND[kind]) throw err(400, '콘텐츠 종류를 선택해 주세요.');
  const title = String(body.title ?? existing?.title ?? '').trim(); const text = String(body.body ?? existing?.body ?? '').trim();
  const visibility = body.visibility ?? existing?.visibility ?? 'private';
  if (!['private', 'public'].includes(visibility)) throw err(400, '공개 여부가 올바르지 않습니다.');
  if (title.length > LIMITS.titleMax) throw err(400, `제목은 ${LIMITS.titleMax}자 이하로 입력해 주세요.`);
  const max = kind === 'oneline' ? LIMITS.onelineMax : LIMITS.bodyMax;
  if (text.length > max) throw err(400, `본문은 ${max}자 이하로 입력해 주세요.`);
  if (kind !== 'oneline' && !title) throw err(400, '제목을 입력해 주세요.');
  const intro = String(body.intro ?? existing?.intro ?? '').trim(); const tpl = KIND[kind].template;
  if (intro.length > LIMITS.introMax) throw err(400, `소개는 ${LIMITS.introMax}자 이하로 입력해 주세요.`);
  if (tpl === 'story' && !intro) throw err(400, '소개를 입력해 주세요. (작품을 짧게 소개하는 글이에요)');
  if (tpl === 'story' && !text) throw err(400, '내용을 입력해 주세요.');
  if (tpl === 'goods' && !intro) throw err(400, '기획 소개를 입력해 주세요.');
  if ((tpl === 'line' || tpl === 'essay') && !text) throw err(400, '내용을 입력해 주세요.');
  let fundingGoal = 0; let fundingNote = '';
  if (kind === 'goods') {
    fundingGoal = body.fundingGoal !== undefined && body.fundingGoal !== '' ? Math.round(Number(body.fundingGoal)) : existing?.funding_goal || FUNDING.def;
    if (!Number.isFinite(fundingGoal) || fundingGoal < FUNDING.min || fundingGoal > FUNDING.max) throw err(400, `목표 관심 수는 ${FUNDING.min}~${FUNDING.max} 사이로 입력해 주세요.`);
    fundingNote = String(body.fundingNote ?? existing?.funding_note ?? '').trim();
    if (fundingNote.length > FUNDING.noteMax) throw err(400, `제작 구상은 ${FUNDING.noteMax}자 이하로 입력해 주세요.`);
  }
  return { kind, title, text, intro, visibility, fundingGoal, fundingNote };
}
/** 종류별 이미지 규칙. count = 저장 후 총 이미지 수 */
function checkImages(f, count) {
  const tpl = KIND[f.kind].template; const max = f.kind === 'webtoon' ? LIMITS.maxImagesWebtoon : LIMITS.maxImages;
  if (count && !IMAGE_TEMPLATES.includes(tpl)) throw err(400, '이 종류에는 이미지를 첨부할 수 없습니다.');
  if (count > max) throw err(400, `이미지는 최대 ${max}장까지 올릴 수 있습니다.`, 'too_many_files');
  if (tpl === 'image' && !count) throw err(400, '이미지를 한 장 이상 올려 주세요.', 'image_required');
  if (tpl === 'mixed' && !count && !f.text && !f.intro) throw err(400, '소개, 내용, 이미지 중 하나는 입력해 주세요.');
}
const alts = (b) => { try { return JSON.parse(b.alts || '[]'); } catch { return []; } };
const addAtts = (c, imgs, al) => imgs.forEach((url, i) => S.attachments.push({ id: S.next.att++, content_id: c.id, url, alt: String(al[i] || '').slice(0, 200) }));
const dropContent = (id) => { S.contents = S.contents.filter((c) => c.id !== id); S.attachments = S.attachments.filter((a) => a.content_id !== id); S.likes = S.likes.filter((l) => l.content_id !== id); S.interests = S.interests.filter((i) => i.content_id !== id); };

// ---------- 라우터 ----------
const routes = [];
const route = (method, pattern, fn) => routes.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn]);

route('GET', '/api/auth/config', () => ({ providers: [], devLogin: true }));
route('POST', '/api/auth/dev', ({ body }) => {
  const name = String(body.name || '').trim().slice(0, LIMITS.nicknameMax); if (!name) throw err(400, '이름을 입력해 주세요.');
  const key = body.admin ? 'admin' : name.toLowerCase();
  let u = S.users.find((x) => x.provider === 'dev' && x.provider_id === key);
  if (!u) { u = { id: S.next.user++, provider: 'dev', provider_id: key, nickname: name, interests: [], role: key === 'admin' ? 'admin' : 'user', onboarded: 0, points: 250, inventory: ['outfit_cardigan'], avatar: { ...DEFAULT_AVATAR }, bio: '' }; S.users.push(u); }
  S.meId = u.id; return { user: pub(u) };
});
route('POST', '/api/auth/logout', () => { S.meId = null; return { ok: true }; });
route('GET', '/api/categories', () => SEED.categories);
route('GET', '/api/me', () => ({ user: pub(me()) }));
route('PATCH', '/api/me', ({ body }) => {
  const u = need(); const first = !u.onboarded;
  if (body.nickname !== undefined) { const n = String(body.nickname).trim(); if (n.length < 1 || n.length > LIMITS.nicknameMax) throw err(400, `닉네임은 1~${LIMITS.nicknameMax}자로 입력해 주세요.`); u.nickname = n; }
  if (body.interests !== undefined) { if (!Array.isArray(body.interests)) throw err(400, '관심 분야 형식이 올바르지 않습니다.'); u.interests = [...new Set(body.interests.filter((c) => CATEGORIES.includes(c)))].slice(0, 5); }
  u.onboarded = 1; let bonus = 0;
  if (first) { for (const id of (Array.isArray(body.bookIds) ? body.bookIds : []).slice(0, 6)) if (book(id) && !inShelf(u, id)) S.shelf.push({ user_id: u.id, book_id: Number(id), created_at: now(), status: 'reading' }); bonus = award(u, 'onboarding', 'done', REWARDS.onboarding); }
  save(); return { user: pub(u), bonus };
});
route('DELETE', '/api/me', () => {
  const u = need(); S.contents.filter((c) => c.user_id === u.id).forEach((c) => dropContent(c.id));
  S.shelf = S.shelf.filter((s) => s.user_id !== u.id); S.likes = S.likes.filter((l) => l.user_id !== u.id); S.interests = S.interests.filter((i) => i.user_id !== u.id); S.users = S.users.filter((x) => x.id !== u.id); S.meId = null; save();
  return { ok: true, message: '계정과 모든 기록이 삭제되었습니다.' };
});
route('GET', '/api/me/notices', () => { const u = need(); const n = S.notices.filter((x) => x.user_id === u.id).reverse(); S.notices.forEach((x) => { if (x.user_id === u.id) x.read = 1; }); save(); return { notices: n }; });
route('PUT', '/api/me/avatar', ({ body }) => {
  const u = need(); const next = { skin: SHOP.skins.includes(body.skin) ? body.skin : u.avatar.skin || DEFAULT_AVATAR.skin };
  for (const slot of ['hat', 'outfit', 'accessory']) { const id = body[slot]; if (!id) continue; const it = SHOP.items.find((i) => i.id === id); if (!it || it.slot !== slot || !u.inventory.includes(id)) throw err(400, '가지고 있지 않은 아이템이에요.'); next[slot] = id; }
  u.avatar = next; save(); return { user: pub(u) };
});
route('GET', '/api/shop', () => { const u = need(); return { items: SHOP.items, skins: SHOP.skins, points: u.points, inventory: u.inventory, avatar: u.avatar }; });
route('POST', '/api/shop/buy', ({ body }) => {
  const u = need(); const it = SHOP.items.find((i) => i.id === body.itemId); if (!it) throw err(404, '없는 아이템입니다.');
  if (u.inventory.includes(it.id)) throw err(400, '이미 가지고 있는 아이템입니다.');
  if (u.points < it.price) throw err(400, `포인트가 부족해요. (필요 ${it.price}P)`, 'not_enough_points');
  u.points -= it.price; u.inventory.push(it.id); save(); return { user: pub(u), message: `${it.name}을(를) 샀어요!` };
});

// 도서
const PAGE = 24;
route('GET', '/api/books/recommended', ({ query }) => {
  const u = need(); const asked = String(query.categories || '').split(',').filter((c) => CATEGORIES.includes(c)); const interests = asked.length ? asked : u.interests;
  let books = interests.length ? S.books.filter((b) => interests.includes(b.category)).slice(0, 12) : [];
  const matched = books.length;
  if (books.length < 8) { const ids = new Set(books.map((b) => b.id)); books = books.concat(S.books.slice(0, 24).filter((b) => !ids.has(b.id))).slice(0, 12); }
  return { books, personalized: matched > 0 };
});
route('GET', '/api/books', ({ query }) => {
  need(); const q = String(query.q || '').trim().toLowerCase(); const cat = CATEGORIES.includes(query.category) ? query.category : ''; const offset = Math.max(0, parseInt(query.offset) || 0);
  const list = S.books.filter((b) => (!q || [b.title, b.author, b.publisher].some((x) => (x || '').toLowerCase().includes(q))) && (!cat || b.category === cat));
  const books = list.slice(offset, offset + PAGE); return { books, degraded: false, hasMore: books.length === PAGE };
});
route('GET', '/api/books/:id', ({ params }) => {
  const u = need(); const b = book(params.id); if (!b) throw err(404, '책을 찾을 수 없습니다.');
  const pubs = S.contents.filter((c) => c.book_id === b.id && visible(c));
  const top = pubs.filter((c) => CREATIVE.includes(c.kind) && likesOf(c) >= 1).sort((x, y) => likesOf(y) - likesOf(x) || (x.published_at || '').localeCompare(y.published_at || '') || x.id - y.id).slice(0, 3);
  const counts = { creative: pubs.filter((c) => CREATIVE.includes(c.kind)).length }; for (const k of Object.keys(KIND)) counts[k] = pubs.filter((c) => c.kind === k).length; // 종류마다 따로 센다
  return { book: b, inShelf: inShelf(u, b.id), top: top.map((c) => hydrate(c, u)), counts };
});
route('GET', '/api/books/:id/contents', ({ params, query }) => {
  const u = need(); const tab = query.tab === 'creative' || KIND[query.tab] ? query.tab : 'oneline'; const offset = Math.max(0, parseInt(query.offset) || 0);
  const rows = bySort(S.contents.filter((c) => c.book_id === Number(params.id) && visible(c) && (tab === 'creative' ? CREATIVE.includes(c.kind) : c.kind === tab)), query.sort === 'likes' ? 'likes' : 'latest').slice(offset, offset + 20);
  return { contents: rows.map((c) => hydrate(c, u)), hasMore: rows.length === 20 };
});

// 내 책장
route('GET', '/api/shelf', () => {
  const u = need();
  return { books: S.shelf.filter((s) => s.user_id === u.id).slice().reverse().map((s) => { const own = S.contents.filter((c) => c.book_id === s.book_id && c.user_id === u.id); return { ...book(s.book_id), added_at: s.created_at, status: s.status, total: own.length, pub: own.filter(visible).length }; }) };
});
route('POST', '/api/shelf', ({ body }) => {
  const u = need(); const b = book(body.bookId); if (!b) throw err(404, '책을 찾을 수 없습니다.');
  if (inShelf(u, b.id)) return { added: false, alreadyInShelf: true, points: 0, _status: 200 };
  S.shelf.push({ user_id: u.id, book_id: b.id, created_at: now(), status: 'reading' }); const points = award(u, 'shelf', b.id, REWARDS.shelf); save();
  return { added: true, alreadyInShelf: false, points, _status: 201 };
});
route('PATCH', '/api/shelf/:bookId', ({ params, body }) => {
  const u = need(); if (!['reading', 'completed', 'want_to_read'].includes(body.status)) throw err(400, '읽기 상태가 올바르지 않습니다.');
  const s = S.shelf.find((x) => x.user_id === u.id && x.book_id === Number(params.bookId)); if (!s) throw err(404, '책장에 없는 책입니다.'); s.status = body.status; save(); return { ok: true, status: s.status };
});
route('DELETE', '/api/shelf/:bookId', ({ params, query }) => {
  const u = need(); if (!['keep', 'delete'].includes(query.records)) throw err(400, '연결된 기록을 보관할지 삭제할지 선택해 주세요.', 'records_required');
  const id = Number(params.bookId); if (!inShelf(u, id)) throw err(404, '책장에 없는 책입니다.');
  if (query.records === 'delete') S.contents.filter((c) => c.user_id === u.id && c.book_id === id).forEach((c) => dropContent(c.id));
  else S.contents.forEach((c) => { if (c.user_id === u.id && c.book_id === id) { c.visibility = 'private'; c.published_at = null; } });
  S.shelf = S.shelf.filter((s) => !(s.user_id === u.id && s.book_id === id)); save(); return { ok: true };
});
route('GET', '/api/me/books/:bookId/contents', ({ params }) => {
  const u = need(); const b = book(params.bookId); if (!b) throw err(404, '책을 찾을 수 없습니다.');
  const s = S.shelf.find((x) => x.user_id === u.id && x.book_id === b.id); if (!s) throw err(404, '내 책장에 없는 책입니다.');
  return { book: b, status: s.status, contents: S.contents.filter((c) => c.user_id === u.id && c.book_id === b.id).sort((x, y) => y.id - x.id).map((c) => hydrate(c, u)) };
});

// 콘텐츠
route('POST', '/api/contents', async ({ body, form }) => {
  const u = need(); const b = book(body.bookId); if (!b) throw err(404, '책을 찾을 수 없습니다.');
  if (!inShelf(u, b.id)) throw err(400, '먼저 책을 내 책장에 추가해 주세요.');
  const f = fields(body); const imgs = await pickImages(form); checkImages(f, imgs.length);
  const c = { id: S.next.content++, user_id: u.id, book_id: b.id, kind: f.kind, title: f.title, body: f.text, intro: f.intro, visibility: f.visibility, hidden: 0, created_at: now(), updated_at: now(), published_at: f.visibility === 'public' ? now() : null, base_likes: 0, funding_goal: f.fundingGoal, funding_note: f.fundingNote, base_interest: 0 };
  S.contents.push(c); addAtts(c, imgs, alts(body));
  const points = award(u, 'content', c.id, KIND[f.kind].creative ? REWARDS.creative : REWARDS[f.kind]); save();
  return { content: hydrate(c, u), points, _status: 201 };
});
const own = (id) => { const u = need(); const c = S.contents.find((x) => x.id === Number(id)); if (!c || c.user_id !== u.id) throw err(404, '콘텐츠를 찾을 수 없습니다.'); return [u, c]; };
route('PUT', '/api/contents/:id', async ({ params, body, form }) => {
  const [u, c] = own(params.id); if (c.hidden) throw err(403, '운영 정책에 따라 숨김 처리된 콘텐츠는 수정할 수 없습니다. 비공개 전환이나 삭제는 가능합니다.', 'hidden');
  const f = fields({ ...body, kind: c.kind }, c); const imgs = await pickImages(form);
  let remove = []; try { remove = JSON.parse(body.removeAttachments || '[]').map(Number); } catch { /* 무시 */ }
  const left = S.attachments.filter((a) => a.content_id === c.id && !remove.includes(a.id)).length;
  checkImages(f, left + imgs.length);
  S.attachments = S.attachments.filter((a) => !(a.content_id === c.id && remove.includes(a.id))); addAtts(c, imgs, alts(body));
  const becamePublic = f.visibility === 'public' && c.visibility !== 'public';
  Object.assign(c, { title: f.title, body: f.text, intro: f.intro, funding_goal: f.fundingGoal, funding_note: f.fundingNote, visibility: f.visibility, updated_at: now(), published_at: becamePublic ? now() : f.visibility === 'private' ? null : c.published_at }); save();
  return { content: hydrate(c, u) };
});
route('PATCH', '/api/contents/:id/visibility', ({ params, body }) => {
  const [u, c] = own(params.id); const v = body.visibility; if (!['private', 'public'].includes(v)) throw err(400, '공개 여부가 올바르지 않습니다.');
  if (c.hidden && v === 'public') throw err(403, '숨김 처리된 콘텐츠는 공개할 수 없습니다.', 'hidden');
  if (v === 'public' && c.visibility !== 'public') c.published_at = now(); if (v === 'private') c.published_at = null; c.visibility = v; c.updated_at = now(); save(); return { content: hydrate(c, u) };
});
route('DELETE', '/api/contents/:id', ({ params }) => { const [, c] = own(params.id); dropContent(c.id); save(); return { ok: true }; });
route('GET', '/api/contents/:id', ({ params }) => {
  const u = need(); const c = S.contents.find((x) => x.id === Number(params.id)); if (!canView(c, u)) throw err(404, '콘텐츠를 찾을 수 없거나 공개되지 않은 콘텐츠입니다.');
  return { content: hydrate(c, u), book: book(c.book_id) };
});
const likeTarget = (id) => { const c = S.contents.find((x) => x.id === Number(id)); if (!c || !visible(c)) throw err(404, '공개된 작품이 아닙니다.'); return c; };
const likeState = (c, u) => ({ likes: likesOf(c), liked: S.likes.some((l) => l.content_id === c.id && l.user_id === u.id) });
route('PUT', '/api/contents/:id/like', ({ params }) => {
  const u = need(); const c = likeTarget(params.id); if (c.user_id === u.id) throw err(400, '내 작품에는 좋아요를 누를 수 없습니다.');
  if (!S.likes.some((l) => l.content_id === c.id && l.user_id === u.id)) S.likes.push({ content_id: c.id, user_id: u.id }); save(); return likeState(c, u);
});
route('DELETE', '/api/contents/:id/like', ({ params }) => { const u = need(); const c = likeTarget(params.id); S.likes = S.likes.filter((l) => !(l.content_id === c.id && l.user_id === u.id)); save(); return likeState(c, u); });

const interestTarget = (id) => { const c = S.contents.find((x) => x.id === Number(id)); if (!c || c.kind !== 'goods' || !visible(c)) throw err(404, '공개된 굿즈 기획이 아닙니다.'); return c; };
route('PUT', '/api/contents/:id/interest', ({ params }) => {
  const u = need(); const c = interestTarget(params.id); if (c.user_id === u.id) throw err(400, '내 기획에는 관심 표시를 할 수 없습니다.');
  if (!S.interests.some((i) => i.content_id === c.id && i.user_id === u.id)) S.interests.push({ content_id: c.id, user_id: u.id }); save(); return { funding: funding(c, u) };
});
route('DELETE', '/api/contents/:id/interest', ({ params }) => { const u = need(); const c = interestTarget(params.id); S.interests = S.interests.filter((i) => !(i.content_id === c.id && i.user_id === u.id)); save(); return { funding: funding(c, u) }; });
route('GET', '/api/funding', ({ query }) => {
  const u = need(); const sort = ['progress', 'latest', 'popular'].includes(query.sort) ? query.sort : 'progress'; const offset = Math.max(0, parseInt(query.offset) || 0);
  const ratio = (c) => interestCount(c) / Math.max(1, c.funding_goal || FUNDING.def);
  const rows = S.contents.filter((c) => visible(c) && c.kind === 'goods').sort({ progress: (a, b) => ratio(b) - ratio(a) || interestCount(b) - interestCount(a) || b.id - a.id, popular: (a, b) => interestCount(b) - interestCount(a) || b.id - a.id, latest: (a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id }[sort]);
  const page = rows.slice(offset, offset + 24); return { contents: page.map((c) => hydrate(c, u)), hasMore: page.length === 24 };
});
route('GET', '/api/gallery', ({ query }) => {
  const u = need(); const kinds = GALLERY_GROUPS[query.category] || CREATIVE; const offset = Math.max(0, parseInt(query.offset) || 0);
  const rows = S.contents.filter((c) => visible(c) && kinds.includes(c.kind));
  rows.sort(query.sort === 'latest' ? (a, b) => (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id : (a, b) => likesOf(b) - likesOf(a) || (b.published_at || '').localeCompare(a.published_at || '') || b.id - a.id);
  const page = rows.slice(offset, offset + 24); return { contents: page.map((c) => hydrate(c, u)), hasMore: page.length === 24 };
});
route('GET', '/api/users/:id', ({ params }) => {
  const v = need(); const u = user(params.id); if (!u) throw err(404, '사용자를 찾을 수 없습니다.');
  const mine = S.contents.filter((c) => c.user_id === u.id && visible(c)); const ids = [...new Set(mine.map((c) => c.book_id))];
  const books = ids.map((id) => ({ ...book(id), contents: mine.filter((c) => c.book_id === id).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).map((c) => hydrate(c, v)) }));
  return { user: { id: u.id, nickname: u.nickname, bio: u.bio || '', avatar: u.avatar }, books, isMe: u.id === v.id };
});

// 신고/운영
route('POST', '/api/reports', ({ body }) => {
  const u = need(); if (!REPORT_REASONS.includes(body.reason)) throw err(400, '신고 사유를 선택해 주세요.');
  if (body.targetType === 'content') { const c = S.contents.find((x) => x.id === Number(body.targetId)); if (!c || !visible(c)) throw err(404, '신고할 공개 콘텐츠를 찾을 수 없습니다.'); if (c.user_id === u.id) throw err(400, '내 콘텐츠는 신고할 수 없습니다.'); }
  else if (body.targetType === 'profile') { if (!user(body.targetId)) throw err(404, '사용자를 찾을 수 없습니다.'); if (Number(body.targetId) === u.id) throw err(400, '내 프로필은 신고할 수 없습니다.'); } else throw err(400, '신고 대상이 올바르지 않습니다.');
  const dup = S.reports.find((r) => r.reporter_id === u.id && r.target_type === body.targetType && r.target_id === Number(body.targetId) && ['received', 'reviewing'].includes(r.status));
  if (dup) return { ok: true, reportId: dup.id, duplicate: true, message: '이미 접수된 신고입니다. 검토 결과를 기다려 주세요.' };
  const r = { id: S.next.report++, reporter_id: u.id, reporter: u.nickname, target_type: body.targetType, target_id: Number(body.targetId), reason: body.reason, detail: String(body.detail || '').slice(0, 1000), status: 'received', note: '', created_at: now() };
  S.reports.push(r); save(); return { ok: true, reportId: r.id, message: '신고가 접수되었습니다.', _status: 201 };
});
route('GET', '/api/admin/reports', ({ query }) => {
  const a = admin(); const rows = S.reports.filter((r) => !['received', 'reviewing', 'resolved', 'rejected'].includes(query.status) || r.status === query.status).slice().reverse();
  return { reports: rows.map((r) => { let target = null; if (r.target_type === 'content') { const c = S.contents.find((x) => x.id === r.target_id); if (c) target = { ...hydrate(c, a), book: book(c.book_id)?.title }; } else { const u = user(r.target_id); if (u) target = { id: u.id, nickname: u.nickname }; } return { ...r, reporter: r.reporter, target }; }) };
});
route('PATCH', '/api/admin/reports/:id', ({ params, body }) => {
  const a = admin(); const r = S.reports.find((x) => x.id === Number(params.id)); if (!r) throw err(404, '신고를 찾을 수 없습니다.');
  if (!['reviewing', 'resolved', 'rejected'].includes(body.status)) throw err(400, '처리 상태가 올바르지 않습니다.');
  r.status = body.status; r.note = String(body.note || '').slice(0, 500); r.handled_by = a.id;
  if (r.target_type === 'content' && body.hide !== undefined) { const c = S.contents.find((x) => x.id === r.target_id); if (c) { c.hidden = body.hide ? 1 : 0; if (body.hide) S.notices.push({ id: S.next.notice++, user_id: c.user_id, read: 0, created_at: now(), message: `운영 정책 검토 결과 "${c.title || KIND[c.kind].label}" 콘텐츠가 숨김 처리되었습니다.${r.note ? ' 사유: ' + r.note : ''}` }); } }
  save(); return { ok: true };
});

// ---------- fetch 가로채기 ----------
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const raw = typeof input === 'string' ? input : input.url; const url = new URL(raw, location.href);
  if (!url.pathname.startsWith('/api/') && !raw.startsWith('/api/')) return realFetch(input, init);
  const path = raw.startsWith('/api/') ? raw.split('?')[0] : url.pathname; const query = Object.fromEntries(new URLSearchParams(raw.includes('?') ? raw.split('?')[1] : ''));
  const method = (init.method || 'GET').toUpperCase(); let body = {}; let form = null;
  if (init.body instanceof FormData) { form = init.body; body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')); } else if (typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch { body = {}; } }
  const hit = routes.map(([m, re, fn]) => (m === method ? [re.exec(path), fn] : null)).find((x) => x && x[0]);
  const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (!hit) return reply(404, { error: '존재하지 않는 API입니다.' });
  try { const out = await hit[1]({ params: hit[0].groups || {}, query, body, form }); const status = out?._status || 200; if (out && '_status' in out) delete out._status; return reply(status, out); }
  catch (e) { if (e instanceof HttpError) return reply(e.status, { error: e.message, code: e.code }); console.error(e); return reply(500, { error: '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' }); }
};
