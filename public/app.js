// BookRest 1차 MVP 프론트엔드 (빌드 없이 동작하는 해시 라우터 SPA)
const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');

// ---------- 안전한 템플릿 (기본 이스케이프) ----------
class Raw { constructor(s) { this.s = s; } }
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const conv = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(conv).join('') : v === false || v == null ? '' : esc(v));
const h = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? conv(vals[i]) : ''), ''));
const render = (raw) => { main.innerHTML = raw.s; main.focus({ preventScroll: true }); window.scrollTo(0, 0); };

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
document.addEventListener('error', (e) => { // 표지 로드 실패 → 자동 생성 표지
  const img = e.target;
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

function workCard(c, { book } = {}) {
  const img = c.attachments[0];
  return h`<article class="card work">
    ${img && h`<img class="thumb" src="${img.url}" alt="${img.alt || c.title + ' 이미지'}" loading="lazy">`}
    <div style="min-width:0;flex:1">
      <div class="row"><span class="badge">${c.kind_label}</span>${c.mine && h`<span class="badge ${c.visibility === 'public' ? 'pub' : ''}">${c.visibility === 'public' ? '공개' : '비공개'}</span>`}${c.hidden && h`<span class="badge hid">숨김</span>`}</div>
      <h3><a href="#/work/${c.id}">${c.title || '(제목 없음)'}</a></h3>
      <p>${(c.body || '').slice(0, 160)}${(c.body || '').length > 160 ? '…' : ''}</p>
      <div class="row small muted">
        ${book && h`<a href="#/book/${book.id}">${book.title}</a>`}
        ${c.author && h`<a href="#/user/${c.author.id}">${c.author.nickname}</a>`}<span>${fmtDate(c.published_at || c.created_at)}</span><span aria-label="좋아요 ${c.likes}개">♥ ${c.likes}</span>
      </div>
    </div></article>`;
}

// ---------- 내비게이션 ----------
function renderNav() {
  const top = $('#topbar'); const nav = $('#nav');
  top.hidden = !state.me;
  if (!state.me) return;
  const cur = location.hash;
  const link = (href, text) => `<a href="${href}" ${cur.startsWith(href) ? 'aria-current="page"' : ''}>${text}</a>`;
  nav.innerHTML = [link('#/home', '마을'), link('#/library', '대도서관'), link('#/shelf', '내 서재'), link('#/settings', '설정'),
    state.me.role === 'admin' ? link('#/admin', '운영') : ''].join('');
}

// ---------- 픽셀 마을 ----------
function village() {
  const R = (x, y, w, hh, c) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`;
  const tree = (x, y) => R(x + 3, y + 12, 4, 8, '#7a4b25') + R(x, y + 4, 10, 10, '#2f7a3f') + R(x + 2, y, 6, 6, '#3d9650');
  const flower = (x, y, c) => R(x, y, 2, 2, c) + R(x + 1, y + 2, 1, 3, '#2f7a3f');
  const building = ({ x, y, w, hh, wall, roof, label, go, soon, aria, door = '#6b3f1f' }) => {
    const roofRows = [0, 1, 2, 3].map((i) => R(x - 4 + i * 3, y - 16 + i * 4, w + 8 - i * 6, 4, roof)).join('');
    const body = R(x, y, w, hh, wall) + R(x, y + hh - 3, w, 3, '#00000022') + R(x + w / 2 - 6, y + hh - 18, 12, 18, door) + R(x + w / 2 + 3, y + hh - 10, 2, 2, '#f2c14e')
      + R(x + 6, y + 8, 10, 10, '#a9d8ee') + R(x + w - 16, y + 8, 10, 10, '#a9d8ee');
    return `<g class="bld" role="link" tabindex="0" aria-label="${aria}" ${go ? `data-go="${go}"` : `data-soon="${soon}"`}>
      ${roofRows}${body}${soon ? R(x, y, w, hh, '#ffffff55') : ''}
      <g class="sign">${R(x + 2, y + hh + 3, w - 4, 11, '#3a2a1f')}<text x="${x + w / 2}" y="${y + hh + 12}" font-size="8" text-anchor="middle">${label}</text></g>${soon ? `<text x="${x + w / 2}" y="${y - 20}" font-size="7" text-anchor="middle">준비 중</text>` : ''}</g>`;
  };
  return h`<div class="village-wrap"><svg class="village" viewBox="0 0 320 232" role="group" aria-label="픽셀 마을 지도. 건물을 선택하면 이동합니다. 아래 메뉴 목록으로도 이동할 수 있습니다.">
    <rect width="320" height="232" fill="#8bc16a"/><rect width="320" height="52" fill="#bfe3f0"/>
    <g fill="#fff"><rect x="30" y="12" width="28" height="6"/><rect x="38" y="8" width="14" height="6"/><rect x="220" y="20" width="34" height="6"/><rect x="230" y="16" width="16" height="6"/></g>
    <rect y="46" width="320" height="8" fill="#6aa653"/>
    <rect x="0" y="138" width="320" height="14" fill="#e3c88f"/><rect x="148" y="100" width="24" height="40" fill="#e3c88f"/>
    ${tree(8, 60)}${tree(296, 64)}${tree(6, 196)}${tree(304, 200)}${flower(100, 160, '#e85d75')}${flower(108, 166, '#f2c14e')}${flower(214, 162, '#fff')}${flower(222, 168, '#e85d75')}
    ${new Raw(building({ x: 112, y: 62, w: 96, hh: 44, wall: '#e9d3a4', roof: '#b5653a', label: '대도서관', go: '#/library', aria: '대도서관으로 이동' }))}
    ${new Raw(building({ x: 28, y: 88, w: 56, hh: 34, wall: '#f0c9a0', roof: '#4f8a5b', label: '내 서재', go: '#/shelf', aria: '내 서재로 이동' }))}
    ${new Raw(building({ x: 236, y: 88, w: 56, hh: 34, wall: '#c9d6ea', roof: '#7a6ab5', label: '미술관', soon: '미술관', aria: '미술관, 준비 중' }))}
    ${new Raw(building({ x: 32, y: 180, w: 56, hh: 30, wall: '#e8d9f0', roof: '#c06c9a', label: '글 작업실', soon: '글 작업실', aria: '글 작업실, 준비 중' }))}
    ${new Raw(building({ x: 132, y: 180, w: 56, hh: 30, wall: '#d9ecd9', roof: '#3f8f8f', label: '웹툰 공간', soon: '웹툰 공간', aria: '웹툰 공간, 준비 중' }))}
    ${new Raw(building({ x: 232, y: 180, w: 56, hh: 30, wall: '#f5e0b8', roof: '#c9a02e', label: '굿즈 상점', soon: '굿즈 상점', aria: '굿즈 상점, 준비 중' }))}
  </svg></div>`;
}

const SOON = [['미술관', '팬아트를 전시하는 공간'], ['글 작업실', '외전·웹소설을 쓰는 공간'], ['웹툰 공간', '연재 작품을 모으는 공간'], ['굿즈 상점', '굿즈 기획과 관심 표현']];

// ---------- 뷰 ----------
const views = {};

views.landing = async () => {
  if (state.me) return (location.hash = state.me.onboarded ? '#/home' : '#/onboarding');
  const failed = location.hash.includes('login=failed');
  render(h`<section class="hero">
    <div class="brand px" style="justify-content:center;font-size:2rem"><span class="brand-mark" aria-hidden="true"></span>BookRest</div>
    <h1>북레스트</h1>
    <p class="quote">내가 읽은 책은 나의 이야기가 되고,<br>우리의 이야기는 하나의 도서관이 됩니다.</p>
    <div class="login-box" aria-label="로그인">
      ${failed && h`<p class="err" role="alert">로그인에 실패했습니다. 다시 시도해 주세요.</p>`}
      ${state.auth.providers.map((p) => h`<a class="btn" href="/api/auth/${p.id}/start">${p.label}(으)로 시작하기</a>`)}
      ${state.auth.devLogin && h`<form id="dev" class="card stack" style="text-align:left"><label for="dn" style="margin-top:0">개발용 간편 로그인</label><input id="dn" maxlength="20" placeholder="닉네임" required><button class="btn">입장하기</button><button type="button" id="adm" class="btn secondary small">운영자로 입장</button></form>`}
      ${!state.auth.providers.length && !state.auth.devLogin && h`<p class="muted">현재 사용할 수 있는 로그인 방식이 없습니다.</p>`}
    </div>
    <div class="menu-list" style="max-width:720px;margin:32px auto 0;text-align:left">
      <div class="card"><b>기록</b><br><span class="muted small">읽은 책을 책장에 꽂고 비공개 감상과 공개 한 줄 평을 남겨요.</span></div>
      <div class="card"><b>창작</b><br><span class="muted small">팬아트, 외전, 굿즈 기획까지 책을 바탕으로 만들어요.</span></div>
      <div class="card"><b>발견</b><br><span class="muted small">같은 책에 쌓인 다른 사람의 관점과 작품을 감상해요.</span></div>
    </div></section>`);
  const login = async (name, admin) => { try { await api('POST', '/api/auth/dev', { name, admin }); await boot(); } catch (e) { toast(e.message); } };
  $('#dev')?.addEventListener('submit', (e) => { e.preventDefault(); login($('#dn').value, false); });
  $('#adm')?.addEventListener('click', () => login('운영자', true));
};

views.onboarding = async () => {
  if (!state.me) return (location.hash = '#/');
  const picked = new Set(state.me.interests);
  render(h`<div class="card stack" style="max-width:560px;margin:0 auto"><h1>처음 오셨군요!</h1>
    <form id="f"><label for="nn">닉네임</label><input id="nn" maxlength="20" required value="${state.me.nickname}" placeholder="마을에서 불릴 이름">
    <label>관심 분야 <span class="muted small">(최대 5개 · 건너뛸 수 있어요)</span></label>
    <div class="chips" id="chips">${state.cfg.categories.filter((c) => c !== '기타').map((c) => h`<button type="button" class="chip" aria-pressed="${picked.has(c)}" data-c="${c}">${c}</button>`)}</div>
    <p class="err" id="e" role="alert"></p>
    <div class="row" style="margin-top:16px"><button class="btn">시작하기</button><button type="button" class="btn secondary" id="skip">관심 분야 건너뛰기</button></div></form></div>`);
  $('#chips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (!picked.has(b.dataset.c) && picked.size >= 5) return toast('관심 분야는 최대 5개까지 고를 수 있어요.');
    picked.has(b.dataset.c) ? picked.delete(b.dataset.c) : picked.add(b.dataset.c);
    b.setAttribute('aria-pressed', picked.has(b.dataset.c));
  };
  const save = async (interests) => {
    try { state.me = (await api('PATCH', '/api/me', { nickname: $('#nn').value, interests })).user; renderNav(); location.hash = '#/home'; } catch (e) { $('#e').textContent = e.message; }
  };
  $('#f').onsubmit = (e) => { e.preventDefault(); save([...picked]); };
  $('#skip').onclick = () => { if ($('#nn').reportValidity()) save([]); };
};

views.home = async () => {
  render(h`<h1>안녕하세요, ${state.me.nickname}님</h1><p class="muted">건물을 눌러 이동하세요. 지도를 쓰기 어렵다면 아래 메뉴를 이용할 수 있어요.</p>
    ${village()}
    <nav class="menu-list" aria-label="공간 이동 메뉴">
      <a href="#/library"><svg class="ic" viewBox="0 0 8 8" aria-hidden="true"><rect width="8" height="8" fill="#b5653a"/><rect x="1" y="2" width="6" height="5" fill="#e9d3a4"/><rect x="3" y="4" width="2" height="3" fill="#6b3f1f"/></svg><span><b>대도서관</b><br><span class="muted small">책 검색 · 탐색 · 추천</span></span></a>
      <a href="#/shelf"><svg class="ic" viewBox="0 0 8 8" aria-hidden="true"><rect width="8" height="8" fill="#4f8a5b"/><rect x="1" y="2" width="6" height="5" fill="#f0c9a0"/><rect x="3" y="4" width="2" height="3" fill="#6b3f1f"/></svg><span><b>내 서재</b><br><span class="muted small">책장 · 내 기록과 작품</span></span></a>
      ${SOON.map(([n, d]) => h`<button type="button" aria-disabled="true" data-soon="${n}"><svg class="ic" viewBox="0 0 8 8" aria-hidden="true"><rect width="8" height="8" fill="#aaa"/><rect x="1" y="2" width="6" height="5" fill="#ddd"/></svg><span><b>${n}</b> <span class="badge">준비 중</span><br><span class="muted small">${d}</span></span></button>`)}
    </nav>`);
};

views.library = async (_, qs) => {
  const q = qs.get('q') || ''; const cat = qs.get('c') || '';
  render(h`<h1>대도서관</h1>
    <form id="s" role="search" class="row" style="flex-wrap:nowrap"><label for="q" class="sr" style="position:absolute;left:-999px">제목 또는 작가 검색</label>
      <input id="q" type="search" placeholder="제목 또는 작가로 검색" value="${q}" maxlength="100"><button class="btn">검색</button></form>
    <div class="chips" style="margin-top:12px" role="group" aria-label="장르·주제"><button class="chip" aria-pressed="${!cat}" data-c="">전체</button>${state.cfg.categories.map((c) => h`<button class="chip" aria-pressed="${cat === c}" data-c="${c}">${c}</button>`)}</div>
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
  const tabs = [['oneline', '한 줄 평'], ['review', '감상문·서평'], ['creative', '2차 창작']];
  let tab = 'oneline'; let sort = 'latest';
  render(h`<div class="detail"><div class="cover-lg">${cover(b, 'cover-lg')}</div>
    <div style="flex:1;min-width:240px" class="stack"><div><h1>${b.title}</h1><p class="muted">${b.author}${b.publisher && ' · ' + b.publisher} <span class="badge">${b.category}</span></p></div>
      ${b.description && h`<p>${b.description}</p>`}
      <div class="row" id="act"></div></div></div>
    ${d.top.length > 0 && h`<section aria-labelledby="top"><h2 id="top" style="margin-top:24px">인기 작품 TOP ${d.top.length}</h2><div class="stack">${d.top.map((c, i) => h`<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="rank" aria-label="${i + 1}위">${i + 1}</span><div style="flex:1;min-width:0">${workCard(c)}</div></div>`)}</div></section>`}
    <div class="tabs" role="tablist" aria-label="이 책의 공개 기록">${tabs.map(([k, l]) => h`<button class="tab" role="tab" id="t-${k}" aria-selected="${k === tab}" data-t="${k}">${l} <span class="muted small">${d.counts[k]}</span></button>`)}</div>
    <div id="sortbar" class="row" hidden><span class="small muted">정렬</span><button class="chip" data-s="latest" aria-pressed="true">최신순</button><button class="chip" data-s="likes" aria-pressed="false">좋아요순</button></div>
    <div id="list" class="stack" role="tabpanel" style="margin-top:12px" aria-live="polite"></div><div id="more" class="row" style="justify-content:center;margin-top:12px"></div>`);
  const act = $('#act');
  const drawAct = () => {
    act.innerHTML = d.inShelf ? h`<span class="badge pub">내 책장에 있음</span><a class="btn" href="#/shelf/${b.id}">내 서재에서 보기</a>`.s : '<button class="btn" id="add">내 책장에 추가</button>';
    $('#add')?.addEventListener('click', async () => {
      try { await api('POST', '/api/shelf', { bookId: b.id }); d.inShelf = true; drawAct(); toast('내 책장에 꽂았어요.'); } catch (e) { toast(e.message); }
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
    $('#sortbar').hidden = tab !== 'creative'; loadList(false);
  };
  $('#sortbar').onclick = (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    sort = c.dataset.s; document.querySelectorAll('#sortbar .chip').forEach((x) => x.setAttribute('aria-pressed', x === c)); loadList(false);
  };
  loadList(false);
};

views.shelf = async () => {
  loading();
  let d;
  try { d = await api('GET', '/api/shelf'); } catch (e) { return failure(e, views.shelf); }
  render(h`<div class="row between"><h1>내 서재</h1><a class="btn secondary" href="#/user/${state.me.id}">내 공개 서재 보기</a></div>
    <p class="muted">${state.me.nickname}님의 책장 · ${d.books.length}권</p>
    ${d.books.length ? h`<div class="shelf">${d.books.map((b) => h`<a class="book" href="#/shelf/${b.id}">${cover(b)}<b>${b.title}</b><span>기록 ${b.total} · 공개 ${b.pub}</span></a>`)}</div>`
      : h`<div class="empty card"><p><b>책장이 비어 있어요.</b></p><p>대도서관에서 읽은 책을 찾아 책장에 꽂아 보세요.</p><a class="btn" href="#/library">대도서관 가기</a></div>`}`);
};

views.myBook = async ([id]) => {
  loading();
  let d;
  try { d = await api('GET', `/api/me/books/${id}/contents`); } catch (e) { return failure(e, () => views.myBook([id])); }
  const b = d.book;
  render(h`<a href="#/shelf">← 내 서재</a>
    <div class="detail" style="margin-top:12px"><div class="cover-lg">${cover(b, 'cover-lg')}</div><div style="flex:1;min-width:240px" class="stack">
      <h1>${b.title}</h1><p class="muted">${b.author}</p>
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
  $('#rm').onclick = async () => {
    const v = await dialog(h`<h2>책장에서 뺄까요?</h2><p>이 책에 남긴 내 기록 ${d.contents.length}개는 어떻게 할까요?</p>
      <div class="stack"><button class="btn" data-v="keep" style="width:100%">기록은 비공개로 보관 (다시 꽂으면 복원)</button>
      <button class="btn danger" data-v="delete" style="width:100%">기록도 모두 삭제</button><button class="btn secondary" data-v="" style="width:100%">취소</button></div>`);
    if (!v) return;
    try { await api('DELETE', `/api/shelf/${id}?records=${v}`); toast('책장에서 뺐어요.'); location.hash = '#/shelf'; } catch (e) { toast(e.message); }
  };
};

views.write = async ([bookId, contentId]) => {
  loading();
  let book; let existing = null;
  try {
    const d = await api('GET', `/api/me/books/${bookId}/contents`); book = d.book;
    if (contentId) { existing = d.contents.find((c) => c.id === Number(contentId)); if (!existing) throw new Error('기록을 찾을 수 없습니다.'); }
  } catch (e) { return failure(e, () => views.write([bookId, contentId])); }
  const L = state.cfg.limits;
  const files = []; // {file, alt}
  const removed = new Set();
  let kind = existing?.kind || 'oneline';
  render(h`<a href="#/shelf/${book.id}">← ${book.title}</a>
    <form id="f" class="card stack" style="margin-top:12px" novalidate><h1>${existing ? '기록 수정' : '새 기록'}</h1>
      <div><label for="kind" style="margin-top:0">종류</label><select id="kind" ${existing && 'disabled'}>${state.cfg.kinds.map((k) => h`<option value="${k.id}" ${k.id === kind && 'selected'}>${k.label}</option>`)}</select></div>
      <div><label for="title">제목 <span class="muted small" id="treq"></span></label><input id="title" maxlength="${L.titleMax}" value="${existing?.title || ''}"></div>
      <div><label for="body">본문 <span class="muted small" id="cnt"></span></label><textarea id="body">${existing?.body || ''}</textarea></div>
      <div id="imgbox"><label for="file">이미지 <span class="muted small">PNG·JPG·WEBP·GIF, 파일당 ${L.maxImageBytes / 1024 / 1024}MB 이하, 최대 ${L.maxImages}장</span></label><input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple><div class="previews" id="pv"></div></div>
      <fieldset style="border:2px solid var(--line);padding:10px 14px"><legend>공개 설정</legend>
        <label style="font-weight:400"><input type="radio" name="vis" value="private" ${existing?.visibility !== 'public' && 'checked'} style="width:auto;min-height:0"> 비공개 — 나만 볼 수 있어요 (기본)</label>
        <label style="font-weight:400"><input type="radio" name="vis" value="public" ${existing?.visibility === 'public' && 'checked'} style="width:auto;min-height:0"> 공개 — 대도서관과 내 공개 서재에 표시돼요</label>
        <div id="rights" class="small card" hidden><p style="margin-top:0">공개 전 확인해 주세요: 타인의 저작물, 개인정보, 타인의 사진·초상이 포함되어 있지 않아야 합니다. 이용 규칙을 위반한 콘텐츠는 신고에 따라 숨김 처리될 수 있어요.</p>
          <label style="font-weight:400;margin:0"><input type="checkbox" id="agree" style="width:auto;min-height:0"> 위 내용을 확인했고 공개할 권리가 있습니다.</label></div></fieldset>
      <p class="err" id="e" role="alert"></p>
      <div class="row"><button class="btn" id="save">저장</button><a class="btn secondary" href="#/shelf/${book.id}">취소</a></div></form>`);
  const total = () => existing ? existing.attachments.filter((a) => !removed.has(a.id)).length + files.length : files.length;
  const refresh = () => {
    kind = $('#kind').value;
    const info = state.cfg.kinds.find((k) => k.id === kind);
    $('#imgbox').hidden = !info.creative;
    $('#treq').textContent = kind === 'oneline' ? '(선택)' : '(필수)';
    const max = kind === 'oneline' ? L.onelineMax : L.bodyMax;
    $('#body').maxLength = max; $('#cnt').textContent = `${$('#body').value.length}/${max}`;
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
        if (total() >= L.maxImages) { toast(`이미지는 최대 ${L.maxImages}장까지예요.`); break; }
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
    const err = $('#e'); err.textContent = '';
    const vis = document.querySelector('[name=vis]:checked').value;
    if (kind !== 'oneline' && !$('#title').value.trim()) return (err.textContent = '제목을 입력해 주세요.', $('#title').focus());
    if (!$('#body').value.trim() && !total()) return (err.textContent = '본문 또는 이미지를 입력해 주세요.', $('#body').focus());
    if (vis === 'public' && !$('#agree').checked) return (err.textContent = '공개하려면 권리 확인에 동의해 주세요.', $('#agree').focus());
    const fd = new FormData();
    fd.append('bookId', book.id); fd.append('kind', kind); fd.append('title', $('#title').value); fd.append('body', $('#body').value); fd.append('visibility', vis);
    fd.append('alts', JSON.stringify(files.map((f) => f.alt)));
    if (existing) fd.append('removeAttachments', JSON.stringify([...removed]));
    files.forEach((f) => fd.append('images', f.file));
    $('#save').disabled = true;
    try {
      const r = existing ? await api('PUT', `/api/contents/${existing.id}`, fd) : await api('POST', '/api/contents', fd);
      toast(vis === 'public' ? '공개로 저장했어요.' : '비공개로 저장했어요.'); location.hash = `#/shelf/${book.id}`; void r;
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
    <p style="white-space:pre-wrap;overflow-wrap:anywhere">${c.body}</p>
    <div class="row">
      ${c.visibility === 'public' && !c.hidden && h`<button class="btn ${c.liked ? 'liked' : 'secondary'}" id="like" aria-pressed="${c.liked}" ${c.mine && 'disabled'}>♥ <span id="lc">${c.likes}</span></button>`}
      ${c.mine ? h`<a class="btn secondary" href="#/write/${b.id}/${c.id}">수정</a>` : c.visibility === 'public' && h`<button class="btn secondary small" id="rep">신고</button>`}
      <a class="btn secondary" href="#/user/${c.author.id}">작성자 서재 방문</a></div></article>`);
  $('#like')?.addEventListener('click', async () => {
    try { const r = await api(c.liked ? 'DELETE' : 'PUT', `/api/contents/${c.id}/like`); c.liked = r.liked; c.likes = r.likes; $('#lc').textContent = r.likes; const l = $('#like'); l.setAttribute('aria-pressed', r.liked); l.className = `btn ${r.liked ? 'liked' : 'secondary'}`; } catch (e) { toast(e.message); }
  });
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
  render(h`<div class="row between"><div><h1>${d.user.nickname}님의 서재</h1><p class="muted">공개된 책과 콘텐츠만 보여요.</p></div>${!d.isMe && h`<button class="btn secondary small" id="rep">프로필 신고</button>`}</div>
    ${d.books.length ? d.books.map((b) => h`<section class="card" style="margin-bottom:16px"><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><a href="#/book/${b.id}" style="width:80px;flex:none">${cover(b)}</a>
      <div style="flex:1;min-width:0" class="stack"><h2><a href="#/book/${b.id}">${b.title}</a></h2>${b.contents.map((c) => workCard(c))}</div></div></section>`)
      : h`<div class="empty card">아직 공개된 기록이 없어요.</div>`}`);
  $('#rep')?.addEventListener('click', () => reportDialog('profile', Number(id)));
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
  [/^\/work\/(\d+)$/, 'work'], [/^\/user\/(\d+)$/, 'user'], [/^\/settings$/, 'settings'], [/^\/admin$/, 'admin'],
];
async function route() {
  main.onclick = null;
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  renderNav();
  const hit = routes.map(([re, name]) => [re.exec(path), name]).find(([m]) => m);
  if (!hit) return render(h`<div class="empty card"><p><b>페이지를 찾을 수 없어요.</b></p><a class="btn" href="#/home">마을로 돌아가기</a></div>`);
  const [m, name] = hit;
  if (name !== 'landing' && !state.me) return (location.hash = '#/');
  if (state.me && !state.me.onboarded && name !== 'onboarding' && name !== 'landing') return (location.hash = '#/onboarding');
  try { await views[name](m.slice(1), new URLSearchParams(query)); } catch (e) { failure(e, route); }
}
window.addEventListener('hashchange', route);

// 마을 건물/준비 중 안내 (이벤트 위임)
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); const s = e.target.closest('[data-soon]');
  if (g) location.hash = g.dataset.go; else if (s) toast(`${s.dataset.soon}은(는) 준비 중이에요. 곧 만나요!`);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.bld')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});

async function boot() {
  try {
    const [cfg, auth, me] = await Promise.all([api('GET', '/api/categories'), api('GET', '/api/auth/config'), api('GET', '/api/me')]);
    Object.assign(state, { cfg, auth, me: me.user });
  } catch (e) { return render(h`<div class="empty card"><p class="err" role="alert">${e.message}</p><button class="btn" id="rt">다시 시도</button></div>`), ($('#rt').onclick = boot); }
  if (state.me && (!location.hash || location.hash === '#/' || location.hash === '#')) location.hash = state.me.onboarded ? '#/home' : '#/onboarding';
  else route();
}
boot();
