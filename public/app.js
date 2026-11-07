// BookRest 1차 MVP 프론트엔드 (빌드 없이 동작하는 해시 라우터 SPA)
const $ = (s, r = document) => r.querySelector(s);
let main = $('#main'); // 마을에서는 건물 창 본문(#winbody)으로 바뀐다

// ---------- 안전한 템플릿 (기본 이스케이프) ----------
class Raw { constructor(s) { this.s = s; } }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const conv = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(conv).join('') : v === false || v == null ? '' : esc(v));
const h = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? conv(vals[i]) : ''), ''));
const render = (raw) => { main.innerHTML = raw.s; main.focus({ preventScroll: true }); if (main.id === 'winbody') main.scrollTop = 0; else window.scrollTo(0, 0); };

// ---------- API ----------
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opt); } catch { throw Object.assign(new Error('네트워크에 연결할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.'), { network: true }); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.me) { state.me = null; renderNav(); location.hash = '#/'; }
  if (!res.ok) throw Object.assign(new Error(data.error || '요청을 처리하지 못했습니다.'), { status: res.status, code: data.code });
  return data;
}
const state = { me: null, cfg: null, auth: { providers: [], devLogin: false } };

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }

function dialog(content, onReady) {
  return new Promise((resolve) => {
    const d = $('#dialog'); d.innerHTML = content.s;
    d.onclose = () => resolve(d.returnValue || null);
    d.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => d.close(b.dataset.v)));
    onReady?.(d);
    d.returnValue = ''; d.showModal();
  });
}
const confirmBox = async (msg, ok = '확인', danger = false) => (await dialog(h`<p>${msg}</p><div class="row" style="justify-content:flex-end"><button class="btn secondary" data-v="">취소</button><button class="btn ${danger ? 'danger' : ''}" data-v="ok">${ok}</button></div>`)) === 'ok';

// ---------- 표지/공통 컴포넌트 ----------
const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const cover = (b, cls = '') => b.cover_url
  ? h`<img class="cover ${cls}" src="${b.cover_url}" alt="${b.title} 표지" loading="lazy" data-title="${b.title}" style="--cv:hsl(${hue(b.title)} 38% 38%)" referrerpolicy="no-referrer">`
  : h`<div class="cover ${cls}" role="img" aria-label="${b.title} 표지(자동 생성)" style="--cv:hsl(${hue(b.title)} 38% 38%)">${b.title}</div>`;
document.addEventListener('error', (e) => { // 표지 로드 실패 → 자동 생성 표지, 작품 이미지 실패 → 안내
  const img = e.target;
  if (img.tagName === 'IMG' && (img.closest?.('.gimg') || img.classList.contains('thumb'))) { const sp = document.createElement('span'); sp.className = 'small muted'; sp.style.cssText = 'padding:8px;text-align:center'; sp.textContent = '이미지를 불러오지 못했어요'; img.replaceWith(sp); return; }
  if (img.tagName !== 'IMG' || !img.classList.contains('cover')) return;
  const d = document.createElement('div');
  d.className = img.className; d.setAttribute('role', 'img'); d.setAttribute('aria-label', `${img.dataset.title} 표지(자동 생성)`);
  d.style.setProperty('--cv', `hsl(${hue(img.dataset.title || '')} 38% 38%)`); d.textContent = img.dataset.title;
  img.replaceWith(d);
}, true);

const bookCard = (b, extra = '') => h`<a class="book" href="#/book/${b.id}">${cover(b)}<b>${b.title}</b><span>${b.author}</span>${extra}</a>`;
const loading = () => render(h`<p class="empty" role="status">불러오는 중…</p>`);
const failure = (e, retry) => { render(h`<div class="empty card"><p class="err" role="alert">${e.message}</p><button class="btn" id="retry">다시 시도</button></div>`); $('#retry').onclick = retry; };
const fmtDate = (s) => (s ? s.slice(0, 10) : '');
const kindLabel = (k) => state.cfg.kinds.find((x) => x.id === k)?.label || k;

// ---------- 굿즈 펀딩(관심 표시) ----------
// 좋아요(공감)와 별개의 기능이다. 결제·후원 약속이 아니라 "제작되면 좋겠다"는 의사 표시이고, 목표에 모이면 제작사 연결을 검토한다(3차 기능).
const FUND_NOTICE = '아직 결제는 없어요. 「관심 표시」는 제작되면 좋겠다는 의사 표시예요. 관심이 목표에 모이면 제작사 연결을 검토해요(준비 중).';
const fpct = (f) => Math.min(100, Math.round((f.count / f.goal) * 100));
const fundingBar = (f) => h`<div class="fund ${f.reached ? 'done' : ''}"><div class="fund-h"><b>${f.reached ? '★ 목표 달성' : '펀딩 관심 모으는 중'}</b><span>${f.count.toLocaleString()} / ${f.goal.toLocaleString()}명 · ${fpct(f)}%</span></div>
  <div class="fbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fpct(f)}" aria-label="펀딩 관심 달성률"><i style="width:${fpct(f)}%"></i></div></div>`;
const interestBtn = (c) => (c.mine ? h`<span class="badge">내 기획</span>` : c.visibility !== 'public' || c.hidden ? '' : h`<button type="button" class="btn small ${c.funding.interested ? 'secondary' : ''}" data-interest="${c.id}" aria-pressed="${c.funding.interested}">${c.funding.interested ? '관심 표시함 (취소)' : '♡ 관심 표시하기'}</button>`);
const fundPanel = (c) => h`${fundingBar(c.funding)}${c.funding.note && h`<p class="fnote">제작 구상: ${c.funding.note}</p>`}<div class="row">${interestBtn(c)}</div><p class="small muted fnotice">${FUND_NOTICE}</p>`;
async function toggleInterest(c) { const r = await api(c.funding.interested ? 'DELETE' : 'PUT', `/api/contents/${c.id}/interest`); c.funding = r.funding; toast(r.funding.interested ? '관심을 표시했어요. (결제는 없어요)' : '관심 표시를 취소했어요.'); return c; }

function workCard(c, { book } = {}) {
  const img = c.attachments[0];
  return h`<article class="card work">
    ${img && h`<img class="thumb" src="${img.url}" alt="${img.alt || c.title + ' 이미지'}" loading="lazy">`}
    <div style="min-width:0;flex:1">
      <div class="row"><span class="badge">${c.kind_label}</span>${c.mine && h`<span class="badge ${c.visibility === 'public' ? 'pub' : ''}">${c.visibility === 'public' ? '공개' : '비공개'}</span>`}${c.hidden && h`<span class="badge hid">숨김</span>`}</div>
      <h3><a href="#/work/${c.id}">${c.title || '(제목 없음)'}</a></h3>
      <p>${(c.intro || c.body || '').slice(0, 160)}${(c.intro || c.body || '').length > 160 ? '…' : ''}</p>
      ${c.funding && fundingBar(c.funding)}
      <div class="row small muted">
        ${book && h`<a href="#/book/${book.id}">${book.title}</a>`}
        ${c.author && h`<a href="#/user/${c.author.id}">${c.author.nickname}</a>`}<span>${fmtDate(c.published_at || c.created_at)}</span><span aria-label="좋아요 ${c.likes}개">♥ ${c.likes}</span>
      </div>
    </div></article>`;
}

// ---------- 내비게이션 ----------
const NAV = [['#/home', '마을 홈'], ['#/library', '대도서관'], ['#/shelf', '내 서재'], ['#/gallery', '창작 전시관'], ['#/funding', '굿즈 펀딩']];
const SHOP_OPEN = false; // 꾸미기는 나중에 구현
function renderNav() {
  const top = $('#topbar'); const nav = $('#nav');
  top.hidden = !state.me;
  if (!state.me) return;
  const cur = location.hash;
  const on = (href) => (href === '#/home' ? ['', '#', '#/', '#/home'].includes(cur) : cur.startsWith(href) || (href === '#/library' && cur.startsWith('#/book/')) || (href === '#/gallery' && cur.startsWith('#/work/') && lastTab === 'gallery') || (href === '#/funding' && cur.startsWith('#/work/') && lastTab === 'funding'));
  const link = (href, text) => `<a href="${href}" ${on(href) ? 'aria-current="page"' : ''}>${text}</a>`;
  nav.innerHTML = NAV.map(([href, t]) => link(href, t)).join('') + (SHOP_OPEN ? link('#/shop', '꾸미기 상점') : '<button type="button" data-soon="꾸미기 상점">꾸미기 <span class="badge">준비 중</span></button>') + '<span class="sp"></span>'
    + `<span class="pts" title="독서 포인트" aria-label="독서 포인트 ${state.me.points}점"><span class="coin" aria-hidden="true"></span><span>${state.me.points.toLocaleString()}</span><span class="small">P</span></span>`
    + (state.me.role === 'admin' ? link('#/admin', '운영') : '')
    + `<a class="me-chip" href="#/settings" title="설정"><span class="avmini">${avatarHtml(state.me.avatar, 'down')}</span><span class="nm small">${esc(state.me.nickname)}</span></a>`;
}
async function refreshMe() { try { state.me = (await api('GET', '/api/me')).user; renderNav(); } catch { /* 표시용 갱신 실패는 무시 */ } }
const pts = (n) => (n ? ` (+${n}P)` : '');

import { mountVillage, BUILDINGS } from './village.js';
import { avatarSvg, avatarHtml, loadSprites, LOOK } from './avatar.js';

const GALLERY_TABS = [['all', '전체'], ['fanart', '팬아트 일러스트'], ['goods', '굿즈 기획'], ['spinoff', '외전·패러렐 글'], ['webtoon', '웹툰 콘티'], ['etc', '기타']];
const STATUS = { reading: '읽는 중', completed: '완독', want_to_read: '읽고 싶은' };

// ---------- 뷰 ----------
const views = {};

views.landing = async () => {
  if (state.me) return (location.hash = state.me.onboarded ? '#/home' : '#/onboarding');
  const failed = location.hash.includes('login=failed');
  render(h`<section class="hero hero-map" aria-labelledby="logo" style="background-image:url(/assets/village/plaza-map.jpg)">
      <h1 class="logo" id="logo">BookRest</h1>
      <p class="tagline">읽은 책은 나의 이야기가 되고,<br>우리의 이야기는 하나의 도서관이 됩니다.</p>
      <div class="login-box" aria-label="로그인">
        ${failed && h`<p class="tagline err" role="alert" style="margin:0">로그인에 실패했습니다. 다시 시도해 주세요.</p>`}
        ${state.auth.providers.map((p) => h`<a class="btn" href="/api/auth/${p.id}/start">${p.label}(으)로 시작하기</a>`)}
        ${state.auth.devLogin && h`<form id="dev" class="card stack"><label for="dn" style="margin-top:0">개발용 간편 로그인</label><input id="dn" maxlength="20" placeholder="닉네임" required><button class="btn">입장하기</button><button type="button" id="adm" class="btn secondary small">운영자로 입장</button></form>`}
        ${!state.auth.providers.length && !state.auth.devLogin && h`<p class="tagline">현재 사용할 수 있는 로그인 방식이 없습니다.</p>`}
      </div></section>
    <div class="features">
      <div class="card"><div class="card-h"><span class="no">01</span>기록</div><p>읽은 책을 책장에 꽂고 비공개 감상과 공개 한 줄 평을 남겨요.</p></div>
      <div class="card"><div class="card-h"><span class="no">02</span>창작</div><p>팬아트, 외전, 굿즈 기획까지 책을 바탕으로 만들어요.</p></div>
      <div class="card"><div class="card-h"><span class="no">03</span>발견</div><p>같은 책에 쌓인 다른 사람의 관점과 작품을 감상해요.</p></div></div>`);
  const login = async (name, admin) => { try { await api('POST', '/api/auth/dev', { name, admin }); await boot(); } catch (e) { toast(e.message); } };
  $('#dev')?.addEventListener('submit', (e) => { e.preventDefault(); login($('#dn').value, false); });
  $('#adm')?.addEventListener('click', () => login('운영자', true));
};

views.onboarding = async () => {
  if (!state.me) return (location.hash = '#/');
  const picked = new Set(state.me.interests); const books = new Set();
  const cats = state.cfg.categories.filter((c) => c !== '기타');
  render(h`<div class="card stack" style="max-width:720px;margin:0 auto"><h1>처음 오셨군요!</h1>
    <form id="f"><label for="nn">닉네임</label><input id="nn" maxlength="20" required value="${state.me.nickname}" placeholder="마을에서 불릴 이름">
    <label>관심 분야 <span class="muted small">(최대 5개 · 건너뛸 수 있어요)</span></label>
    <div class="chips" id="chips">${cats.map((c) => h`<button type="button" class="chip" aria-pressed="${picked.has(c)}" data-c="${c}">${c}</button>`)}</div>
    <label>읽고 있거나 읽고 싶은 책 <span class="muted small">(고르면 내 서재에 꽂아 드려요 · 최대 6권)</span></label>
    <div class="pick" id="pick" aria-live="polite"><p class="muted small">불러오는 중…</p></div>
    <p class="err" id="e" role="alert"></p>
    <div class="row" style="margin-top:16px"><button class="btn">시작하기 (+200P)</button><button type="button" class="btn secondary" id="skip">관심 분야·책 건너뛰기</button></div></form></div>`);
  const drawPick = async () => {
    try {
      const r = await api('GET', `/api/books/recommended?categories=${encodeURIComponent([...picked].join(','))}`);
      $('#pick').innerHTML = r.books.slice(0, 12).map((b) => `<button type="button" class="book" data-b="${b.id}" aria-pressed="${books.has(b.id)}">${cover(b).s}<b>${esc(b.title)}</b><span>${esc(b.author)}</span></button>`).join('');
    } catch (e) { $('#pick').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  $('#chips').onclick = async (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (!picked.has(b.dataset.c) && picked.size >= 5) return toast('관심 분야는 최대 5개까지 고를 수 있어요.');
    picked.has(b.dataset.c) ? picked.delete(b.dataset.c) : picked.add(b.dataset.c);
    b.setAttribute('aria-pressed', picked.has(b.dataset.c));
    drawPick();
  };
  $('#pick').onclick = (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return; const id = Number(b.dataset.b);
    if (!books.has(id) && books.size >= 6) return toast('책은 최대 6권까지 고를 수 있어요.');
    books.has(id) ? books.delete(id) : books.add(id); b.setAttribute('aria-pressed', books.has(id));
  };
  const save = async (interests, bookIds) => {
    try { const r = await api('PATCH', '/api/me', { nickname: $('#nn').value, interests, bookIds }); state.me = r.user; renderNav(); toast(`북레스트에 오신 걸 환영해요!${pts(r.bonus)}`); location.hash = '#/home'; } catch (e) { $('#e').textContent = e.message; }
  };
  $('#f').onsubmit = (e) => { e.preventDefault(); save([...picked], [...books]); };
  $('#skip').onclick = () => { if ($('#nn').reportValidity()) save([], []); };
  drawPick();
};

views.home = async () => {}; // 마을 홈 = 전체화면 마을(건물 창을 닫은 상태). route()가 처리한다.
views.notfound = async () => render(h`<div class="empty card"><p><b>페이지를 찾을 수 없어요.</b></p><a class="btn" href="#/home">마을로 돌아가기</a></div>`);

views.library = async (_, qs) => {
  const q = qs.get('q') || ''; const cat = qs.get('c') || '';
  render(h`<section class="hero-lib" style="background-image:url(/assets/library-hall.jpg)"><span class="badge">대도서관 본관</span><h1>세상의 모든 지혜와 문장이<br>머무르는 대도서관</h1><p>고전문학과 인문학을 탐색하고, 책에 얽힌 독자들의 감상과 팬아트 창작물을 둘러보세요.</p></section>
    <form id="s" role="search" class="row" style="flex-wrap:nowrap"><label for="q" class="sr" style="position:absolute;left:-999px">제목 또는 작가 검색</label>
      <input id="q" type="search" placeholder="제목 또는 작가로 검색" value="${q}" maxlength="100"><button class="btn">검색</button></form>
    <div class="chips" style="margin-top:12px" role="group" aria-label="장르·주제"><button class="chip" aria-pressed="${!cat}" data-c="">전체</button>${state.cfg.categories.filter((c) => c !== '기타').map((c) => h`<button class="chip" aria-pressed="${cat === c}" data-c="${c}">${c}</button>`)}</div>
    <div id="out" style="margin-top:20px" aria-live="polite"><p class="empty">불러오는 중…</p></div>`);
  const go = (nq, nc) => { location.hash = `#/library?${new URLSearchParams({ ...(nq && { q: nq }), ...(nc && { c: nc }) })}`; };
  $('#s').onsubmit = (e) => { e.preventDefault(); go($('#q').value.trim(), cat); };
  document.querySelector('.chips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) go($('#q').value.trim(), b.dataset.c); };
  const out = $('#out');
  const load = async () => {
    try {
      if (!q && !cat) {
        const r = await api('GET', '/api/books/recommended');
        out.innerHTML = h`<h2>${r.personalized ? '관심 분야 추천' : '둘러보기'}</h2>${r.personalized ? '' : h`<p class="muted small">설정에서 관심 분야를 고르면 맞춤 도서가 위에 나타나요.</p>`}<div class="grid">${r.books.map((b) => bookCard(b))}</div>`.s;
        return;
      }
      let offset = 0; let first = true;
      const more = async () => {
        const r = await api('GET', `/api/books?${new URLSearchParams({ q, category: cat, offset })}`);
        if (first) {
          out.innerHTML = '';
          if (r.degraded) out.insertAdjacentHTML('beforeend', h`<p class="card" role="status">외부 도서 정보를 불러오지 못해 저장된 책만 보여드려요. <button class="btn small secondary" id="rt">다시 시도</button></p>`.s);
          out.insertAdjacentHTML('beforeend', '<div class="grid" id="g"></div><div id="m" class="row" style="justify-content:center;margin-top:16px"></div>');
          $('#rt')?.addEventListener('click', () => views.library(null, qs));
          if (!r.books.length) out.insertAdjacentHTML('afterbegin', h`<div class="empty card"><p><b>검색 결과가 없어요.</b></p><p class="small">철자를 확인하거나 작가명으로 검색해 보세요. 찾는 책이 없다면 아직 등록되지 않았을 수 있어요.</p></div>`.s);
          first = false;
        }
        $('#g').insertAdjacentHTML('beforeend', r.books.map((b) => bookCard(b).s).join(''));
        offset += r.books.length;
        $('#m').innerHTML = r.hasMore ? '<button class="btn secondary" id="more">더 보기</button>' : '';
        $('#more')?.addEventListener('click', more);
      };
      await more();
    } catch (e) { out.innerHTML = h`<div class="empty card"><p class="err" role="alert">${e.message}</p><button class="btn" id="rt">다시 시도</button></div>`.s; $('#rt').onclick = load; }
  };
  load();
};

views.book = async ([id]) => {
  loading();
  const bookId = Number(id);
  let d;
  try { d = await api('GET', `/api/books/${bookId}`); } catch (e) { return failure(e, () => views.book([id])); }
  const b = d.book;
  const KINDS = state.cfg.kinds; const tabs = KINDS.map((k) => [k.id, k.label]); // 2차 창작을 합치지 않고 종류마다 따로 보여 준다
  let tab = 'oneline'; let sort = 'latest';
  render(h`<div class="detail"><div class="cover-lg">${cover(b, 'cover-lg')}</div>
    <div style="flex:1;min-width:240px" class="stack"><div><h1>${b.title}</h1><p class="muted">${b.author}${b.translator && ' · 옮김 ' + b.translator}${b.publisher && ' · ' + b.publisher}${b.published_year && ' · ' + b.published_year}${b.page_count && ' · ' + b.page_count + '쪽'} <span class="badge">${b.category}</span></p>
      ${b.tags?.length > 0 && h`<div class="row">${b.tags.map((t) => h`<span class="badge">#${t}</span>`)}</div>`}</div>
      ${b.description && h`<p>${b.description}</p>`}
      <div class="row" id="act"></div></div></div>
    ${d.top.length > 0 && h`<section aria-labelledby="top"><h2 id="top" style="margin-top:24px">인기 작품 TOP ${d.top.length}</h2><div class="stack">${d.top.map((c, i) => h`<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="rank" aria-label="${i + 1}위">${i + 1}</span><div style="flex:1;min-width:0">${workCard(c)}</div></div>`)}</div></section>`}
    <div class="tabs kindtabs" role="tablist" aria-label="이 책의 공개 기록(종류별)">${tabs.map(([k, l]) => h`<button class="tab" role="tab" id="t-${k}" aria-selected="${k === tab}" data-t="${k}">${l} <span class="small ${d.counts[k] ? '' : 'muted'}">${d.counts[k]}</span></button>`)}</div>
    <div id="sortbar" class="row" hidden><span class="small muted">정렬</span><button class="chip" data-s="latest" aria-pressed="true">최신순</button><button class="chip" data-s="likes" aria-pressed="false">좋아요순</button></div>
    <div id="list" class="stack" role="tabpanel" style="margin-top:12px" aria-live="polite"></div><div id="more" class="row" style="justify-content:center;margin-top:12px"></div>`);
  const act = $('#act');
  const drawAct = () => {
    act.innerHTML = d.inShelf ? h`<span class="badge pub">내 책장에 있음</span><a class="btn" href="#/shelf/${b.id}">내 서재에서 보기</a>`.s : '<button class="btn" id="add">내 책장에 추가</button>';
    $('#add')?.addEventListener('click', async () => {
      try { const r = await api('POST', '/api/shelf', { bookId: b.id }); d.inShelf = true; drawAct(); toast(`내 책장에 꽂았어요${pts(r.points)}`); refreshMe(); } catch (e) { toast(e.message); }
    });
  };
  drawAct();
  let offset = 0;
  const loadList = async (append) => {
    const list = $('#list');
    if (!append) { offset = 0; list.innerHTML = ''; }
    try {
      const r = await api('GET', `/api/books/${b.id}/contents?tab=${tab}&sort=${sort}&offset=${offset}`);
      if (!append && !r.contents.length) list.innerHTML = h`<div class="empty">아직 공개된 ${tabs.find((t) => t[0] === tab)[1]}이 없어요.${d.inShelf ? ' 첫 번째로 남겨 보세요!' : ' 책장에 추가하고 첫 기록을 남겨 보세요.'}</div>`.s;
      list.insertAdjacentHTML('beforeend', r.contents.map((c) => workCard(c).s).join(''));
      offset += r.contents.length;
      $('#more').innerHTML = r.hasMore ? '<button class="btn secondary" id="mb">더 보기</button>' : '';
      $('#mb')?.addEventListener('click', () => loadList(true));
    } catch (e) { list.innerHTML = h`<div class="empty"><p class="err" role="alert">${e.message}</p><button class="btn small" id="rt">다시 시도</button></div>`.s; $('#rt').onclick = () => loadList(false); }
  };
  $('.tabs').onclick = (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    tab = t.dataset.t; document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', x === t));
    $('#sortbar').hidden = !KINDS.find((k) => k.id === tab)?.creative; loadList(false);
  };
  $('#sortbar').onclick = (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    sort = c.dataset.s; document.querySelectorAll('#sortbar .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); loadList(false);
  };
  loadList(false);
};

views.shelf = async (_, qs) => {
  loading();
  let d;
  try { d = await api('GET', '/api/shelf'); } catch (e) { return failure(e, views.shelf); }
  const f = qs?.get('s') || 'all'; const list = d.books.filter((b) => f === 'all' || b.status === f);
  const count = (k) => d.books.filter((b) => k === 'all' || b.status === k).length;
  render(h`<div class="row between"><h1>내 서재</h1><a class="btn secondary" href="#/user/${state.me.id}">내 공개 서재 보기</a></div>
    <p class="muted">${state.me.nickname}님의 책장 · ${d.books.length}권</p>
    <div class="chips" role="group" aria-label="읽기 상태">${[['all', '전체'], ...Object.entries(STATUS)].map(([k, l]) => h`<a class="chip" role="button" aria-pressed="${f === k}" href="#/shelf?s=${k}" style="text-decoration:none;display:inline-flex;align-items:center">${l} ${count(k)}</a>`)}</div>
    <div style="margin-top:16px"></div>
    ${list.length ? h`<div class="shelf">${list.map((b) => h`<a class="book" href="#/shelf/${b.id}">${cover(b)}<b>${b.title}</b><span>${STATUS[b.status]} · 기록 ${b.total} · 공개 ${b.pub}</span></a>`)}</div>`
      : h`<div class="empty card"><p><b>${d.books.length ? '이 상태의 책이 없어요.' : '책장이 비어 있어요.'}</b></p><p>대도서관에서 읽은 책을 찾아 책장에 꽂아 보세요.</p><a class="btn" href="#/library">대도서관 가기</a></div>`}`);
};

views.myBook = async ([id]) => {
  loading();
  let d;
  try { d = await api('GET', `/api/me/books/${id}/contents`); } catch (e) { return failure(e, () => views.myBook([id])); }
  const b = d.book;
  render(h`<a href="#/shelf">← 내 서재</a>
    <div class="detail" style="margin-top:12px"><div class="cover-lg">${cover(b, 'cover-lg')}</div><div style="flex:1;min-width:240px" class="stack">
      <h1>${b.title}</h1><p class="muted">${b.author}</p>
      <div class="row"><label for="st" class="small" style="margin:0">읽기 상태</label><select id="st" style="width:auto;min-width:140px">${Object.entries(STATUS).map(([k, l]) => h`<option value="${k}" ${k === d.status && 'selected'}>${l}</option>`)}</select></div>
      <div class="row"><a class="btn" href="#/write/${b.id}">+ 새 기록 쓰기</a><a class="btn secondary" href="#/book/${b.id}">공용 도서관에서 보기</a><button class="btn secondary" id="rm">책장에서 빼기</button></div></div></div>
    <h2 style="margin-top:24px">내 기록과 작품 <span class="muted small">${d.contents.length}</span></h2>
    <div class="stack">${d.contents.length ? d.contents.map((c) => h`<div>${workCard(c)}<div class="row" style="margin-top:6px">
        <a class="btn small secondary" href="#/write/${b.id}/${c.id}">수정</a>
        ${c.hidden ? '' : h`<button class="btn small secondary" data-vis="${c.id}" data-to="${c.visibility === 'public' ? 'private' : 'public'}">${c.visibility === 'public' ? '비공개로 전환' : '공개하기'}</button>`}
        <button class="btn small danger" data-del="${c.id}">삭제</button></div></div>`)
      : h`<div class="empty card">아직 기록이 없어요. 한 줄 평부터 시작해 보세요.</div>`}</div>`);
  main.onclick = async (e) => {
    const vis = e.target.closest('[data-vis]'); const del = e.target.closest('[data-del]');
    try {
      if (vis) {
        if (vis.dataset.to === 'public' && !(await confirmBox('공개하면 대도서관과 내 공개 서재에 표시되고 다른 사람이 볼 수 있어요. 저작권·개인정보를 확인하셨나요?', '공개하기'))) return;
        await api('PATCH', `/api/contents/${vis.dataset.vis}/visibility`, { visibility: vis.dataset.to }); toast(vis.dataset.to === 'public' ? '공개했어요.' : '비공개로 전환했어요.'); views.myBook([id]);
      } else if (del) {
        if (!(await confirmBox('이 기록을 삭제할까요? 삭제하면 되돌릴 수 없어요.', '삭제', true))) return;
        await api('DELETE', `/api/contents/${del.dataset.del}`); toast('삭제했어요.'); views.myBook([id]);
      }
    } catch (er) { toast(er.message); }
  };
  $('#st').onchange = async (e) => { try { await api('PATCH', `/api/shelf/${id}`, { status: e.target.value }); toast('읽기 상태를 바꿨어요.'); } catch (er) { toast(er.message); } };
  $('#rm').onclick = async () => {
    const v = await dialog(h`<h2>책장에서 뺄까요?</h2><p>이 책에 남긴 내 기록 ${d.contents.length}개는 어떻게 할까요?</p>
      <div class="stack"><button class="btn" data-v="keep" style="width:100%">기록은 비공개로 보관 (다시 꽂으면 복원)</button>
      <button class="btn danger" data-v="delete" style="width:100%">기록도 모두 삭제</button><button class="btn secondary" data-v="" style="width:100%">취소</button></div>`);
    if (!v) return;
    try { await api('DELETE', `/api/shelf/${id}?records=${v}`); toast('책장에서 뺐어요.'); location.hash = '#/shelf'; } catch (e) { toast(e.message); }
  };
};

// 종류별 작성 템플릿 안내 (서버의 KINDS.template과 같다)
const TPL_HINT = {
  line: '한 줄로 느낌을 남겨요.', essay: '제목과 본문으로 감상문·서평을 써요.', image: '그림·사진을 올리고 짧은 소개를 적어요. (이미지 필수)',
  story: '글 작품이에요. 작품을 소개하는 칸과 본문을 적는 칸이 따로 있어요.', goods: '굿즈 기획을 소개하고, 펀딩에 쓸 목표 관심 수와 제작 구상을 적어요.', mixed: '소개·내용·이미지 중 원하는 것으로 자유롭게 만들어요.',
};
views.write = async ([bookId, contentId]) => {
  loading();
  let book; let existing = null;
  try {
    const d = await api('GET', `/api/me/books/${bookId}/contents`); book = d.book;
    if (contentId) { existing = d.contents.find((c) => c.id === Number(contentId)); if (!existing) throw new Error('기록을 찾을 수 없습니다.'); }
  } catch (e) { return failure(e, () => views.write([bookId, contentId])); }
  const L = state.cfg.limits;
  const files = []; // {file, url, alt}
  const removed = new Set();
  let kind = existing?.kind || 'oneline';
  const info = () => state.cfg.kinds.find((k) => k.id === kind); const tpl = () => info().template;
  // 이미지형 옛 기록은 설명이 본문에 있었으므로 소개칸으로 옮겨 보여 준다
  const introInit = existing ? existing.intro || (['image', 'goods'].includes(existing.template) ? existing.body : '') : '';
  render(h`<a href="#/shelf/${book.id}">← ${book.title}</a>
    <form id="f" class="card stack" style="margin-top:12px" novalidate><h1>${existing ? '기록 수정' : '새 기록'}</h1>
      <div><label for="kind" style="margin-top:0">종류</label><select id="kind" ${existing && 'disabled'}>${state.cfg.kinds.map((k) => h`<option value="${k.id}" ${k.id === kind && 'selected'}>${k.label}${k.creative ? ' (2차 창작)' : ''}</option>`)}</select>
        <p class="small muted" id="hint" style="margin:6px 0 0"></p></div>
      <div id="titlebox"><label for="title">제목 <span class="muted small" id="treq"></span></label><input id="title" maxlength="${L.titleMax}" value="${existing?.title || ''}"></div>
      <div id="imgbox" class="card"><label for="file" style="margin-top:0" id="imglabel">이미지</label>
        <p class="small muted" id="imgrule" style="margin:0 0 8px"></p>
        <input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple><div class="previews" id="pv"></div></div>
      <div id="introbox"><label for="intro" id="introlabel">소개 <span class="muted small" id="icnt"></span></label><textarea id="intro" maxlength="${L.introMax}" style="min-height:90px">${introInit}</textarea></div>
      <div id="bodybox"><label for="body" id="bodylabel">본문 <span class="muted small" id="cnt"></span></label><textarea id="body">${existing?.body && !['image', 'goods'].includes(existing.template) ? existing.body : ''}</textarea></div>
      <div id="goodsbox" class="card" hidden><h2 style="margin-top:0">굿즈 펀딩 정보</h2>
        <label for="fgoal" style="margin-top:0">목표 관심 수 <span class="muted small">(10~1000명 · 이만큼 모이면 제작사 연결을 검토해요)</span></label><input id="fgoal" type="number" min="10" max="1000" step="1" value="${existing?.funding?.goal || 50}">
        <label for="fnote">제작 구상 <span class="muted small">(가격·수량·소재 등, 최대 200자)</span></label><textarea id="fnote" maxlength="200" style="min-height:80px">${existing?.funding?.note || ''}</textarea>
        <p class="small muted" style="margin-bottom:0">${FUND_NOTICE}</p></div>
      <fieldset style="border:2px solid var(--line);padding:10px 14px"><legend>공개 설정</legend>
        <label style="font-weight:400"><input type="radio" name="vis" value="private" ${existing?.visibility !== 'public' && 'checked'} style="width:auto;min-height:0"> 비공개 — 나만 볼 수 있어요 (기본)</label>
        <label style="font-weight:400"><input type="radio" name="vis" value="public" ${existing?.visibility === 'public' && 'checked'} style="width:auto;min-height:0"> 공개 — 대도서관과 내 공개 서재에 표시돼요</label>
        <div id="rights" class="small card" hidden><p style="margin-top:0">공개 전 확인해 주세요: 타인의 저작물, 개인정보, 타인의 사진·초상이 포함되어 있지 않아야 합니다. 이용 규칙을 위반한 콘텐츠는 신고에 따라 숨김 처리될 수 있어요.</p>
          <label style="font-weight:400;margin:0"><input type="checkbox" id="agree" style="width:auto;min-height:0"> 위 내용을 확인했고 공개할 권리가 있습니다.</label></div></fieldset>
      <p class="err" id="e" role="alert"></p>
      <div class="row"><button class="btn" id="save">저장</button><a class="btn secondary" href="#/shelf/${book.id}">취소</a></div></form>`);
  const maxImg = () => (kind === 'webtoon' ? L.maxImagesWebtoon : L.maxImages);
  const total = () => (existing ? existing.attachments.filter((a) => !removed.has(a.id)).length : 0) + files.length;
  const refresh = () => {
    kind = $('#kind').value; const t = tpl(); const label = info().label;
    $('#hint').textContent = TPL_HINT[t];
    $('#titlebox').hidden = false; $('#treq').textContent = t === 'line' ? '(선택)' : '(필수)';
    // 이미지칸: 이미지형(필수)·굿즈·기타(선택). 글형·한 줄 평·서평에는 없다.
    const imgOn = ['image', 'goods', 'mixed'].includes(t); $('#imgbox').hidden = !imgOn;
    $('#imglabel').innerHTML = `${kind === 'webtoon' ? '웹툰 컷 이미지' : kind === 'cosplay' ? '코스프레 사진' : kind === 'fanart' ? '팬아트 이미지' : '이미지'} <span class="small ${t === 'image' ? 'err' : 'muted'}">${t === 'image' ? '(필수)' : '(선택)'}</span>`;
    $('#imgrule').textContent = `PNG·JPG·WEBP·GIF, 파일당 ${L.maxImageBytes / 1024 / 1024}MB 이하, 최대 ${maxImg()}장${kind === 'webtoon' ? ' · 올린 순서가 컷 순서예요' : ''}${kind === 'cosplay' ? ' · 다른 사람의 얼굴이 나오면 동의를 받아 주세요' : ''}.`;
    // 소개칸: 이미지형(선택)·글형(필수)·굿즈(필수)·기타(선택)
    const introOn = ['image', 'story', 'goods', 'mixed'].includes(t); $('#introbox').hidden = !introOn;
    const introReq = t === 'story' || t === 'goods';
    $('#introlabel').firstChild.textContent = `${t === 'goods' ? '기획 소개' : t === 'image' ? '작품 소개' : '소개'} `;
    $('#icnt').textContent = `${introReq ? '(필수) ' : '(선택) '}${$('#intro').value.length}/${L.introMax}`;
    // 내용칸: 한 줄 평·서평(필수)·글형(필수, 소개와 분리)·기타(선택). 이미지형·굿즈에는 없다.
    const bodyOn = ['line', 'essay', 'story', 'mixed'].includes(t); $('#bodybox').hidden = !bodyOn;
    const max = t === 'line' ? L.onelineMax : L.bodyMax; $('#body').maxLength = max; $('#body').style.minHeight = t === 'story' ? '320px' : t === 'line' ? '90px' : '160px';
    $('#bodylabel').firstChild.textContent = `${t === 'line' ? label : t === 'story' ? '내용 (본문)' : t === 'mixed' ? '내용' : '본문'} `;
    $('#cnt').textContent = `${t === 'mixed' ? '(선택) ' : '(필수) '}${$('#body').value.length}/${max}`;
    $('#goodsbox').hidden = t !== 'goods';
    $('#rights').hidden = document.querySelector('[name=vis]:checked').value !== 'public';
    $('#pv').innerHTML = [
      ...(existing ? existing.attachments.filter((a) => !removed.has(a.id)).map((a) => h`<figure><img src="${a.url}" alt="${a.alt || '첨부 이미지'}"><button type="button" aria-label="이미지 삭제" data-rm="${a.id}">×</button></figure>`) : []),
      ...files.map((f, i) => h`<figure><img src="${f.url}" alt="${f.alt || '새 이미지 미리보기'}"><button type="button" aria-label="이미지 제거" data-fi="${i}">×</button><input aria-label="이미지 설명(대체 텍스트)" placeholder="이미지 설명" maxlength="200" data-alt="${i}" value="${f.alt}" style="width:96px;min-height:32px;font-size:.8rem;padding:2px 4px"></figure>`)].map((x) => x.s).join('');
  };
  $('#f').addEventListener('input', (e) => { if (e.target.dataset.alt !== undefined) files[e.target.dataset.alt].alt = e.target.value; else refresh(); });
  $('#f').addEventListener('change', (e) => {
    if (e.target.id === 'file') {
      for (const f of e.target.files) {
        if (f.size > L.maxImageBytes) { toast(`${f.name}: 파일이 너무 커요.`); continue; }
        if (total() >= maxImg()) { toast(`이미지는 최대 ${maxImg()}장까지예요.`); break; }
        files.push({ file: f, url: URL.createObjectURL(f), alt: '' });
      }
      e.target.value = '';
    }
    refresh();
  });
  $('#pv').onclick = (e) => {
    const r = e.target.closest('[data-rm]'); const f = e.target.closest('[data-fi]');
    if (r) removed.add(Number(r.dataset.rm)); if (f) { URL.revokeObjectURL(files[f.dataset.fi].url); files.splice(f.dataset.fi, 1); } refresh();
  };
  refresh();
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#e'); err.textContent = ''; const t = tpl();
    const bad = (msg, sel) => { err.textContent = msg; $(sel)?.focus(); return true; };
    const vis = document.querySelector('[name=vis]:checked').value;
    const intro = $('#intro').value.trim(); const body = $('#body').value.trim();
    if (t !== 'line' && !$('#title').value.trim()) return bad('제목을 입력해 주세요.', '#title');
    if (t === 'image' && !total()) return bad('이미지를 한 장 이상 올려 주세요.', '#file');
    if (t === 'story' && !intro) return bad('소개를 입력해 주세요. (작품을 짧게 소개하는 글이에요)', '#intro');
    if (t === 'story' && !body) return bad('내용을 입력해 주세요.', '#body');
    if (t === 'goods' && !intro) return bad('기획 소개를 입력해 주세요.', '#intro');
    if ((t === 'line' || t === 'essay') && !body) return bad('내용을 입력해 주세요.', '#body');
    if (t === 'mixed' && !intro && !body && !total()) return bad('소개, 내용, 이미지 중 하나는 입력해 주세요.', '#intro');
    if (t === 'goods' && !($('#fgoal').value >= 10 && $('#fgoal').value <= 1000)) return bad('목표 관심 수는 10~1000명으로 입력해 주세요.', '#fgoal');
    if (vis === 'public' && !$('#agree').checked) return bad('공개하려면 권리 확인에 동의해 주세요.', '#agree');
    const fd = new FormData();
    fd.append('bookId', book.id); fd.append('kind', kind); fd.append('title', $('#title').value); fd.append('visibility', vis);
    // 입력칸이 없는 종류는 그 칸을 비워 보낸다(예: 이미지형의 옛 본문은 소개칸으로 옮겨졌다)
    fd.append('intro', ['image', 'story', 'goods', 'mixed'].includes(t) ? intro : ''); fd.append('body', ['line', 'essay', 'story', 'mixed'].includes(t) ? body : '');
    fd.append('alts', JSON.stringify(files.map((f) => f.alt)));
    if (t === 'goods') { fd.append('fundingGoal', $('#fgoal').value); fd.append('fundingNote', $('#fnote').value); }
    if (existing) fd.append('removeAttachments', JSON.stringify([...removed]));
    files.forEach((f) => fd.append('images', f.file));
    $('#save').disabled = true;
    try {
      const r = existing ? await api('PUT', `/api/contents/${existing.id}`, fd) : await api('POST', '/api/contents', fd);
      toast(`${vis === 'public' ? '공개로 저장했어요' : '비공개로 저장했어요'}${pts(r.points)}`); refreshMe(); location.hash = `#/shelf/${book.id}`;
    } catch (er) { err.textContent = er.message + ' 입력한 내용은 그대로 남아 있어요.'; $('#save').disabled = false; } // 실패해도 입력 유지
  };
};

views.work = async ([id]) => {
  loading();
  let d;
  try { d = await api('GET', `/api/contents/${id}`); } catch (e) { return failure(e, () => views.work([id])); }
  const c = d.content; const b = d.book;
  render(h`<article class="card stack"><div class="row"><span class="badge">${c.kind_label}</span>${c.mine && h`<span class="badge ${c.visibility === 'public' ? 'pub' : ''}">${c.visibility === 'public' ? '공개' : '비공개'}</span>`}${c.hidden && h`<span class="badge hid">운영 정책으로 숨김</span>`}</div>
    <h1>${c.title || '(제목 없음)'}</h1>
    <p class="muted">원본 도서 <a href="#/book/${b.id}">${b.title}</a> · 작성자 <a href="#/user/${c.author.id}">${c.author.nickname}</a> · ${fmtDate(c.published_at || c.created_at)}</p>
    ${c.attachments.map((a) => h`<img src="${a.url}" alt="${a.alt || c.title + ' 이미지'}" style="border:2px solid var(--ink);max-height:70vh">`)}
    ${c.intro && h`<p class="lead">${c.intro}</p>`}
    ${c.body && h`<p style="white-space:pre-wrap;overflow-wrap:anywhere">${c.body}</p>`}
    ${c.funding && h`<section class="card fundcard" id="fund"><h2>굿즈 펀딩 현황</h2>${fundPanel(c)}</section>`}
    <div class="row">
      ${c.visibility === 'public' && !c.hidden && h`<button class="btn ${c.liked ? 'liked' : 'secondary'}" id="like" aria-pressed="${c.liked}" ${c.mine && 'disabled'}>♥ <span id="lc">${c.likes}</span></button>`}
      ${c.mine ? h`<a class="btn secondary" href="#/write/${b.id}/${c.id}">수정</a>` : c.visibility === 'public' && h`<button class="btn secondary small" id="rep">신고</button>`}
      <a class="btn secondary" href="#/user/${c.author.id}">작성자 서재 방문</a></div></article>`);
  $('#like')?.addEventListener('click', async () => {
    try { const r = await api(c.liked ? 'DELETE' : 'PUT', `/api/contents/${c.id}/like`); c.liked = r.liked; c.likes = r.likes; $('#lc').textContent = r.likes; const l = $('#like'); l.setAttribute('aria-pressed', r.liked); l.className = `btn ${r.liked ? 'liked' : 'secondary'}`; } catch (e) { toast(e.message); }
  });
  $('#fund')?.addEventListener('click', async (e) => { if (!e.target.closest('[data-interest]')) return; try { await toggleInterest(c); $('#fund').innerHTML = `<h2>굿즈 펀딩 현황</h2>${fundPanel(c).s}`; } catch (er) { toast(er.message); } });
  $('#rep')?.addEventListener('click', () => reportDialog('content', c.id));
};

async function reportDialog(type, id) {
  const v = await dialog(h`<h2>신고하기</h2><form method="dialog" id="rf"><label for="rr" style="margin-top:0">사유</label><select id="rr">${state.cfg.reportReasons.map((r) => h`<option>${r}</option>`)}</select>
    <label for="rd">설명 (선택)</label><textarea id="rd" maxlength="1000" style="min-height:90px"></textarea>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn secondary" data-v="">취소</button><button type="button" class="btn" data-v="go">신고 접수</button></div></form>`);
  if (v !== 'go') return;
  try { const r = await api('POST', '/api/reports', { targetType: type, targetId: id, reason: $('#rr').value, detail: $('#rd').value }); toast(r.message); } catch (e) { toast(e.message); }
}

views.user = async ([id]) => {
  loading();
  let d;
  try { d = await api('GET', `/api/users/${id}`); } catch (e) { return failure(e, () => views.user([id])); }
  render(h`<div class="row between"><div class="row" style="flex-wrap:nowrap"><span class="avmini" style="width:48px;height:64px">${new Raw(avatarHtml(d.user.avatar, 'down'))}</span><div><h1>${d.user.nickname}님의 서재</h1><p class="muted" style="margin:0">${d.user.bio || '공개된 책과 콘텐츠만 보여요.'}</p></div></div>${!d.isMe && h`<button class="btn secondary small" id="rep">프로필 신고</button>`}</div>
    ${d.books.length ? d.books.map((b) => h`<section class="card" style="margin-bottom:16px"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><a href="#/book/${b.id}" style="width:80px;flex:none">${cover(b)}</a>
      <div style="flex:1;min-width:0" class="stack"><h2><a href="#/book/${b.id}">${b.title}</a></h2>${b.contents.map((c) => workCard(c))}</div></div></section>`)
      : h`<div class="empty card">아직 공개된 기록이 없어요.</div>`}`);
  $('#rep')?.addEventListener('click', () => reportDialog('profile', Number(id)));
};

views.funding = async (_, qs) => {
  const sort = ['progress', 'popular', 'latest'].includes(qs.get('o')) ? qs.get('o') : 'progress';
  render(h`<h1>굿즈 펀딩</h1>
    <section class="card fund-hero"><h2>독자의 굿즈 기획에 관심을 모아요</h2>
      <ol class="steps"><li><b>기획 올리기</b><span>내 서재에서 「굿즈 기획」으로 저장하고 공개해요. 목표 관심 수도 정해요.</span></li>
      <li><b>관심 모으기</b><span>다른 독자가 「관심 표시」로 응원해요. <b>좋아요와는 별개</b>예요.</span></li>
      <li><b>제작 검토</b><span>목표에 모이면 제작사 연결을 검토해요. <em>(준비 중)</em></span></li></ol>
      <p class="small fnotice"><b>결제는 없어요.</b> 지금 단계의 관심 표시는 후원이나 구매 약속이 아니에요. 실제 펀딩은 별도 검토 후 열려요.</p>
      <div class="row"><a class="btn" href="#/shelf">내 굿즈 기획 올리기</a></div></section>
    <div class="row" style="margin-top:12px"><span class="small muted">정렬</span>${[['progress', '진행률순'], ['popular', '관심 많은 순'], ['latest', '최신순']].map(([k, l]) => h`<a class="chip" role="button" aria-pressed="${sort === k}" href="#/funding?o=${k}" style="text-decoration:none;display:inline-flex;align-items:center">${l}</a>`)}</div>
    <div id="out" style="margin-top:16px" aria-live="polite"><p class="empty">불러오는 중…</p></div>`);
  const out = $('#out'); const items = new Map(); let offset = 0; let first = true;
  const card = (c) => h`<article class="gcard fcard" data-id="${c.id}"><a class="gimg" href="#/work/${c.id}" style="display:grid;text-decoration:none;color:inherit">${c.attachments[0] ? h`<img src="${c.attachments[0].url}" alt="${c.attachments[0].alt || c.title}" loading="lazy">` : h`<span class="small" style="padding:12px;text-align:center">${(c.intro || c.body).slice(0, 80)}${(c.intro || c.body).length > 80 ? '…' : ''}</span>`}</a>
    <div class="gb"><span class="badge" style="align-self:flex-start">굿즈 기획</span><h3><a href="#/work/${c.id}">${c.title || '(제목 없음)'}</a></h3><div class="gm"><span>원작 「${c.book_title}」</span><span>${c.author.nickname}</span></div>
    ${fundingBar(c.funding)}${c.funding.note && h`<p class="fnote small">${c.funding.note}</p>`}<div class="row">${interestBtn(c)}<a class="btn small secondary" href="#/work/${c.id}">자세히</a></div></div></article>`;
  const more = async () => {
    try {
      const r = await api('GET', `/api/funding?${new URLSearchParams({ sort, offset })}`);
      if (first) { out.innerHTML = '<div class="gal" id="g"></div><div id="m" class="row" style="justify-content:center;margin-top:16px"></div>'; first = false; if (!r.contents.length) out.innerHTML = '<div class="empty card"><p><b>아직 펀딩 중인 굿즈 기획이 없어요.</b></p><p>첫 번째 기획을 올려 보세요!</p><a class="btn" href="#/shelf">내 서재로</a></div>'; }
      r.contents.forEach((c) => items.set(c.id, c)); $('#g')?.insertAdjacentHTML('beforeend', r.contents.map((c) => card(c).s).join(''));
      offset += r.contents.length; if ($('#m')) $('#m').innerHTML = r.hasMore ? '<button class="btn secondary" id="more">더 보기</button>' : ''; $('#more')?.addEventListener('click', more);
    } catch (e) { out.innerHTML = `<div class="empty card"><p class="err" role="alert">${esc(e.message)}</p><button class="btn" id="rt">다시 시도</button></div>`; $('#rt').onclick = () => views.funding(null, qs); }
  };
  main.onclick = async (e) => {
    const b = e.target.closest('[data-interest]'); if (!b) return; const c = items.get(Number(b.dataset.interest));
    try { await toggleInterest(c); main.querySelector(`.fcard[data-id="${c.id}"]`).outerHTML = card(c).s; } catch (er) { toast(er.message); }
  };
  more();
};

views.gallery = async (_, qs) => {
  const cat = qs.get('c') || 'all'; const sort = qs.get('o') === 'latest' ? 'latest' : 'popular';
  render(h`<h1>창작 전시관</h1><p class="muted">독자들이 책을 바탕으로 만든 팬아트, 굿즈 기획, 외전, 웹툰 콘티를 모아 둔 공간이에요.</p>
    <div class="chips" role="group" aria-label="분류">${GALLERY_TABS.map(([k, l]) => h`<a class="chip" role="button" aria-pressed="${cat === k}" href="#/gallery?c=${k}&o=${sort}" style="text-decoration:none;display:inline-flex;align-items:center">${l}</a>`)}</div>
    <div class="row" style="margin-top:8px"><span class="small muted">정렬</span>${[['popular', '인기순'], ['latest', '최신순']].map(([k, l]) => h`<a class="chip" role="button" aria-pressed="${sort === k}" href="#/gallery?c=${cat}&o=${k}" style="text-decoration:none;display:inline-flex;align-items:center">${l}</a>`)}</div>
    <div id="out" style="margin-top:18px" aria-live="polite"><p class="empty">불러오는 중…</p></div>`);
  const out = $('#out'); let offset = 0; let first = true;
  const card = (c) => h`<a class="gcard" href="#/work/${c.id}"><div class="gimg">${c.attachments[0] ? h`<img src="${c.attachments[0].url}" alt="${c.attachments[0].alt || c.title}" loading="lazy">` : h`<span class="small" style="padding:12px;text-align:center">${(c.intro || c.body).slice(0, 80)}${(c.intro || c.body).length > 80 ? '…' : ''}</span>`}</div>
    <div class="gb"><span class="badge" style="align-self:flex-start">${c.kind_label}</span><h3>${c.title || '(제목 없음)'}</h3><div class="gm"><span>원작 「${c.book_title}」</span></div>${c.funding && fundingBar(c.funding)}<div class="gm"><span>${c.author.nickname}</span><span aria-label="좋아요 ${c.likes}개">♥ ${c.likes}</span></div></div></a>`;
  const more = async () => {
    try {
      const r = await api('GET', `/api/gallery?${new URLSearchParams({ category: cat, sort, offset })}`);
      if (first) { out.innerHTML = '<div class="gal" id="g"></div><div id="m" class="row" style="justify-content:center;margin-top:16px"></div>'; first = false; if (!r.contents.length) out.innerHTML = '<div class="empty card"><p><b>아직 전시된 작품이 없어요.</b></p><p>내 서재에서 2차 창작물을 공개로 저장하면 이곳에 걸려요.</p><a class="btn" href="#/shelf">내 서재로</a></div>'; }
      $('#g')?.insertAdjacentHTML('beforeend', r.contents.map((c) => card(c).s).join(''));
      offset += r.contents.length; if ($('#m')) $('#m').innerHTML = r.hasMore ? '<button class="btn secondary" id="more">더 보기</button>' : ''; $('#more')?.addEventListener('click', more);
    } catch (e) { out.innerHTML = `<div class="empty card"><p class="err" role="alert">${esc(e.message)}</p><button class="btn" id="rt">다시 시도</button></div>`; $('#rt').onclick = () => views.gallery(null, qs); }
  };
  more();
};

views.shop = async () => {
  if (!SHOP_OPEN) return render(h`<div class="empty card"><h1>꾸미기 상점</h1><p>캐릭터 꾸미기는 준비 중이에요. 지금은 독서 포인트만 쌓여요.</p><a class="btn" href="#/home">마을로 돌아가기</a></div>`);
  loading();
  let d;
  try { d = await api('GET', '/api/shop'); } catch (e) { return failure(e, views.shop); }
  const slots = [['hat', '모자'], ['outfit', '옷'], ['accessory', '소품']];
  const draw = () => {
    render(h`<h1>꾸미기 상점</h1><p class="muted">책을 담고 기록을 남기며 모은 독서 포인트로 캐릭터를 꾸며요. 현재 <b>${d.points.toLocaleString()}P</b></p>
      <div class="shop-grid"><div><div class="avprev" aria-label="캐릭터 미리보기">${new Raw(avatarHtml(d.avatar, 'down'))}</div>
        <div class="card" style="margin-top:12px"><b class="small">피부색</b><div class="skins" role="group" aria-label="피부색">${d.skins.map((c) => h`<button type="button" class="skin" data-skin="${c}" style="background:${c}" aria-label="피부색 ${c}" aria-pressed="${d.avatar.skin === c}"></button>`)}</div></div></div>
        <div class="stack">${slots.map(([slot, label]) => h`<section><h2>${label}</h2><div class="items">${d.items.filter((i) => i.slot === slot).map((i) => {
          const own = d.inventory.includes(i.id); const worn = d.avatar[slot] === i.id;
          return h`<div class="item ${worn ? 'on' : ''}"><span class="ic" aria-hidden="true">${i.icon}</span><b>${i.name}</b><p>${i.description}</p>
            ${own ? h`<button class="btn small ${worn ? 'secondary' : ''}" data-wear="${i.id}" data-slot="${slot}" aria-pressed="${worn}">${worn ? '착용 중 (벗기)' : '착용하기'}</button>` : h`<button class="btn small" data-buy="${i.id}" ${d.points < i.price && 'disabled'}>${i.price}P로 구매</button>`}</div>`;
        })}</div></section>`)}</div></div>`);
  };
  draw();
  const sync = (u) => { state.me = u; d.points = u.points; d.inventory = u.inventory; d.avatar = u.avatar; renderNav(); draw(); };
  main.onclick = async (e) => {
    const buy = e.target.closest('[data-buy]'); const wear = e.target.closest('[data-wear]'); const skin = e.target.closest('[data-skin]');
    try {
      if (buy) { const r = await api('POST', '/api/shop/buy', { itemId: buy.dataset.buy }); toast(r.message); sync(r.user); }
      else if (wear) { // 서버는 보낸 슬롯만 착용으로 보므로 전체 모습을 보낸다. 해제는 그 슬롯을 빼고 보낸다.
        const slot = wear.dataset.slot; const next = { ...d.avatar };
        if (d.avatar[slot] === wear.dataset.wear) delete next[slot]; else next[slot] = wear.dataset.wear;
        sync((await api('PUT', '/api/me/avatar', next)).user);
      } else if (skin) sync((await api('PUT', '/api/me/avatar', { ...d.avatar, skin: skin.dataset.skin })).user);
    } catch (er) { toast(er.message); }
  };
};

views.settings = async () => {
  let notices = [];
  try { notices = (await api('GET', '/api/me/notices')).notices; } catch { /* 안내는 선택 */ }
  const picked = new Set(state.me.interests);
  render(h`<h1>설정</h1><div class="card stack"><form id="f"><label for="nn" style="margin-top:0">닉네임</label><input id="nn" maxlength="20" value="${state.me.nickname}" required>
    <label>관심 분야</label><div class="chips" id="chips">${state.cfg.categories.filter((c) => c !== '기타').map((c) => h`<button type="button" class="chip" aria-pressed="${picked.has(c)}" data-c="${c}">${c}</button>`)}</div>
    <p class="err" id="e" role="alert"></p><button class="btn" style="margin-top:12px">저장</button></form></div>
    <h2 style="margin-top:24px">운영 안내</h2><div class="card">${notices.length ? h`<ul>${notices.map((n) => h`<li>${n.message} <span class="muted small">${fmtDate(n.created_at)}</span></li>`)}</ul>` : '<p class="muted">받은 안내가 없어요.</p>'}</div>
    <h2 style="margin-top:24px">계정</h2><div class="card row"><button class="btn secondary" id="out">로그아웃</button><button class="btn danger" id="del">계정 삭제</button></div>`);
  $('#chips').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; if (!picked.has(b.dataset.c) && picked.size >= 5) return toast('최대 5개까지 고를 수 있어요.'); picked.has(b.dataset.c) ? picked.delete(b.dataset.c) : picked.add(b.dataset.c); b.setAttribute('aria-pressed', picked.has(b.dataset.c)); };
  $('#f').onsubmit = async (e) => { e.preventDefault(); try { state.me = (await api('PATCH', '/api/me', { nickname: $('#nn').value, interests: [...picked] })).user; toast('저장했어요.'); renderNav(); } catch (er) { $('#e').textContent = er.message; } };
  $('#out').onclick = async () => { await api('POST', '/api/auth/logout'); state.me = null; renderNav(); location.hash = '#/'; };
  $('#del').onclick = async () => {
    if (!(await confirmBox('계정을 삭제하면 책장, 모든 기록, 업로드한 이미지, 좋아요가 즉시 삭제되고 복구할 수 없어요. 정말 삭제할까요?', '계정 삭제', true))) return;
    try { const r = await api('DELETE', '/api/me'); state.me = null; renderNav(); location.hash = '#/'; toast(r.message); } catch (er) { toast(er.message); }
  };
};

views.admin = async () => {
  if (state.me?.role !== 'admin') return (location.hash = '#/home');
  let status = new URLSearchParams(location.hash.split('?')[1] || '').get('s') || 'received';
  loading();
  let d;
  try { d = await api('GET', `/api/admin/reports?status=${status}`); } catch (e) { return failure(e, views.admin); }
  render(h`<h1>신고 검토</h1><div class="chips" role="group" aria-label="상태">${[['received', '접수'], ['reviewing', '검토 중'], ['resolved', '처리 완료'], ['rejected', '반려']].map(([k, l]) => h`<a class="chip" role="button" aria-pressed="${k === status}" href="#/admin?s=${k}" style="text-decoration:none;display:inline-flex;align-items:center">${l}</a>`)}</div>
    <div class="stack" style="margin-top:16px">${d.reports.length ? d.reports.map((r) => h`<div class="card stack" data-r="${r.id}"><div class="row between"><b>#${r.id} · ${r.reason}</b><span class="muted small">${r.created_at} · 신고자 ${r.reporter || '(탈퇴)'}</span></div>
      ${r.detail && h`<p>${r.detail}</p>`}
      ${r.target_type === 'content' ? (r.target ? h`<div>${workCard(r.target, { book: { id: r.target.book_id, title: r.target.book } })}<p class="small">${r.target.hidden ? '현재 숨김 상태' : r.target.visibility === 'public' ? '현재 공개 중' : '현재 비공개'}</p></div>` : '<p class="muted">대상 콘텐츠가 삭제되었습니다.</p>') : h`<p>프로필 대상: ${r.target ? h`<a href="#/user/${r.target.id}">${r.target.nickname}</a>` : '(없음)'}</p>`}
      <input aria-label="처리 메모(작성자에게 안내돼요)" placeholder="처리 메모 (숨김 시 작성자에게 안내)" maxlength="500" class="note">
      <div class="row"><button class="btn small secondary" data-a="reviewing">검토 중</button>
        ${r.target_type === 'content' && r.target && h`<button class="btn small danger" data-a="resolved" data-hide="1">숨김 처리 후 완료</button><button class="btn small secondary" data-a="resolved" data-hide="0">숨김 해제 후 완료</button>`}
        <button class="btn small secondary" data-a="rejected">반려</button></div></div>`) : h`<div class="empty card">해당 상태의 신고가 없어요.</div>`}</div>`);
  main.onclick = async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const card = b.closest('[data-r]');
    const body = { status: b.dataset.a, note: card.querySelector('.note').value };
    if (b.dataset.hide !== undefined) body.hide = b.dataset.hide === '1';
    try { await api('PATCH', `/api/admin/reports/${card.dataset.r}`, body); toast('처리했어요.'); views.admin(); } catch (er) { toast(er.message); }
  };
};

// ---------- 라우터 ----------
const routes = [
  [/^$|^\/$/, 'landing'], [/^\/onboarding$/, 'onboarding'], [/^\/home$/, 'home'], [/^\/library$/, 'library'],
  [/^\/book\/(\d+)$/, 'book'], [/^\/shelf$/, 'shelf'], [/^\/shelf\/(\d+)$/, 'myBook'], [/^\/write\/(\d+)(?:\/(\d+))?$/, 'write'],
  [/^\/work\/(\d+)$/, 'work'], [/^\/user\/(\d+)$/, 'user'], [/^\/settings$/, 'settings'], [/^\/admin$/, 'admin'], [/^\/gallery$/, 'gallery'], [/^\/funding$/, 'funding'], [/^\/shop$/, 'shop'],
];
let cleanup = null;
let lastTab = 'library';
// ---------- 마을(전체화면)과 건물 창 ----------
let stageOn = false; let stageStop = null; let stageSig = '';
async function ensureStage() {
  const sig = JSON.stringify([state.me.nickname, state.me.avatar]);
  if (stageOn && sig !== stageSig) dropStage(); // 닉네임·캐릭터가 바뀌면 마을을 다시 그린다
  if (stageOn) return;
  stageOn = true; stageSig = sig; document.body.classList.add('in-stage'); const st = $('#stage'); st.hidden = false;
  const stop = await mountVillage(st, { go: (hash) => { location.hash = hash; }, soon: (n) => toast(`${n}은(는) 준비 중이에요. 곧 만나요!`) }, state.me);
  if (!stageOn) stop(); else stageStop = stop;
}
function dropStage() {
  if (!stageOn) return;
  stageOn = false; stageStop?.(); stageStop = null; const st = $('#stage'); st.innerHTML = ''; st.hidden = true; document.body.classList.remove('in-stage');
}
const showWin = (on) => { $('#win').hidden = !on; $('#winback').hidden = !on; };
const WIN_TABS = [['library', '#/library', '대도서관'], ['shelf', '#/shelf', '내 서재'], ['gallery', '#/gallery', '창작 전시관'], ['funding', '#/funding', '굿즈 펀딩']];
const TAB_OF = { library: 'library', book: 'library', shelf: 'shelf', myBook: 'shelf', write: 'shelf', gallery: 'gallery', funding: 'funding' };
function renderWinTabs(name) {
  if (TAB_OF[name]) lastTab = TAB_OF[name];
  const cur = TAB_OF[name] || (name === 'work' || name === 'user' ? lastTab : null);
  $('#wintabs').innerHTML = name === 'settings' ? '<span class="wtab on">설정</span>' : name === 'admin' ? '<span class="wtab on">운영 · 신고 검토</span>'
    : WIN_TABS.map(([id, href, label]) => `<a class="wtab ${cur === id ? 'on' : ''}" href="${href}" ${cur === id ? 'aria-current="page"' : ''}>${label}</a>`).join('');
}
const closeWin = () => { location.hash = '#/home'; };
$('#winclose').addEventListener('click', closeWin); $('#winback').addEventListener('click', closeWin);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#win').hidden && !document.querySelector('dialog[open]')) closeWin(); });

async function route() {
  main.onclick = null;
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const hit = routes.map(([re, nm]) => [re.exec(path), nm]).find(([m]) => m);
  const name = hit ? hit[1] : 'notfound'; const params = hit ? hit[0].slice(1) : [];
  if (name !== 'landing' && !state.me) { location.hash = '#/'; return; }
  if (name === 'landing' && state.me) { location.hash = state.me.onboarded ? '#/home' : '#/onboarding'; return; }
  if (state.me && !state.me.onboarded && name !== 'onboarding') { location.hash = '#/onboarding'; return; }
  renderNav();
  const offstage = !state.me || name === 'landing' || name === 'onboarding';
  // 같은 id(#f, #nn 등)가 겹치지 않도록 쓰지 않는 쪽 영역은 비운다
  if (offstage) { dropStage(); showWin(false); $('#winbody').innerHTML = ''; main = $('#main'); main.hidden = false; }
  else {
    await ensureStage();
    $('#main').hidden = true; $('#main').innerHTML = '';
    if (name === 'home') { cleanup?.(); cleanup = null; showWin(false); return; }
    showWin(true); main = $('#winbody'); renderWinTabs(name); renderNav();
  }
  main.onclick = null; cleanup?.(); cleanup = null;
  try { await views[name](params, new URLSearchParams(query)); } catch (e) { failure(e, route); }
}
window.addEventListener('hashchange', route);

// 마을 건물/준비 중 안내 (이벤트 위임)
document.addEventListener('click', (e) => {
  const s = e.target.closest('[data-soon]');
  if (s) toast(`${s.dataset.soon}은(는) 준비 중이에요. 곧 만나요!`);
});
async function boot() {
  try {
    const [cfg, auth, me] = await Promise.all([api('GET', '/api/categories'), api('GET', '/api/auth/config'), api('GET', '/api/me')]);
    Object.assign(state, { cfg, auth, me: me.user });
    await loadSprites(); // 캐릭터 이미지가 있으면 사용
  } catch (e) { return render(h`<div class="empty card"><p class="err" role="alert">${e.message}</p><button class="btn" id="rt">다시 시도</button></div>`), ($('#rt').onclick = boot); }
  if (state.me && (!location.hash || location.hash === '#/' || location.hash === '#')) location.hash = state.me.onboarded ? '#/home' : '#/onboarding';
  else route();
}
boot();
