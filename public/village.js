// 마을 홈(전체화면): 숲 마을 지도 위를 캐릭터가 걸어 다니고, 건물 문 앞에서 입장한다.
// 지도는 화면을 가득 채우도록 확대(cover)되고, 화면이 작으면 카메라가 캐릭터를 따라간다.
// 지도 이미지: public/assets/village/plaza-map.jpg (1376×768). 건물 핀·문 위치는 지도 위 건물에 맞춘 % 좌표다.
import { avatarHtml, hasSprites } from './avatar.js';

const MAP_SRC = '/assets/village/plaza-map.jpg';
const MAP_W = 1376; const MAP_H = 768;
const SPEED = 30;                         // 지도 가로 기준 %/초
const BOUNDS = { x1: 6, x2: 94, y1: 22, y2: 92 };
const NEAR = 8;                           // 문 앞 판정 거리(가로 %)
const A = MAP_H / MAP_W;                  // 세로 %를 가로 %와 같은 픽셀 거리로 맞추는 보정

export const BUILDINGS = [
  { id: 'library', name: '대도서관', sub: 'Great Library', go: '#/library', pin: [25, 34], door: [25, 57], desc: '책 검색·탐색·추천, 책별 독자 기록' },
  { id: 'gallery', name: '창작 전시관', sub: 'Creative Pavilion', go: '#/gallery', pin: [52, 26], door: [52, 50], desc: '독자들의 팬아트·굿즈 기획·웹툰 전시' },
  { id: 'shelf', name: '내 서재', sub: 'My Study Cabin', go: '#/shelf', pin: [79, 42], door: [79, 65], desc: '내 책장과 개인 기록 관리' },
  { id: 'shop', name: '꾸미기 상점', sub: '준비 중', soon: '꾸미기 상점', pin: [22, 69], door: [23, 77], desc: '캐릭터 꾸미기(준비 중)' },
  { id: 'funding', name: '굿즈 펀딩', sub: 'Goods Funding', go: '#/funding', pin: [74, 20], door: [74, 26], desc: '굿즈 기획에 관심을 모으고 제작을 응원' },
];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * 마을을 container(화면 전체)에 그린다. 반환값은 정리 함수.
 * @param {{go:(hash:string)=>void, soon:(name:string)=>void}} cb
 * @param {{nickname:string, avatar:object}} user
 */
export async function mountVillage(container, cb, user) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pins = BUILDINGS.map((b, i) => `<button type="button" class="vpin ${b.soon ? 'soon' : ''}" data-id="${b.id}" style="left:${b.pin[0]}%;top:${b.pin[1]}%" aria-label="${esc(b.name)}${b.soon ? ', 준비 중' : ''}. ${esc(b.desc)}">
      <span class="vsign"><span class="vno" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(b.name)}</span><span class="vsub" aria-hidden="true">${esc(b.sub)}</span>
      <span class="vprompt" aria-hidden="true"><span class="key">Enter</span>들어가기</span></button>
      <i class="vdoor" style="left:${b.door[0]}%;top:${b.door[1]}%" aria-hidden="true"></i>`).join('');
  container.innerHTML = `<div class="pcam" tabindex="0" role="group" aria-label="픽셀 숲 마을. 방향키나 WASD로 걷고 건물 문 앞에서 Enter를 누르면 들어갑니다. 건물을 누르거나 Tab으로 선택해도 되고, 위쪽 메뉴로도 이동할 수 있습니다.">
    <div class="pworld"><img class="pmap" src="${MAP_SRC}" alt="" draggable="false"><div class="pwarm" aria-hidden="true"></div>${pins}
      <div class="vactor vplayer" style="left:50%;top:70%"><span class="vname">${esc(user?.nickname || '탐서가')}</span><div class="vspr">${avatarHtml(user?.avatar, 'up')}</div><div class="vshadow"></div></div></div>
    <div class="vnear" hidden aria-live="polite"></div>
    <div class="vhint" aria-hidden="true">방향키·WASD 걷기 · Enter 들어가기 · 지도를 눌러 이동</div></div>`;

  const cam = container.querySelector('.pcam'); const world = container.querySelector('.pworld'); const player = container.querySelector('.vplayer'); const spr = container.querySelector('.vspr');
  const pinEls = [...container.querySelectorAll('.vpin')]; const nearBox = container.querySelector('.vnear');
  const S = { x: 50, y: 70, face: 'up', target: null, onArrive: null, keys: new Set(), walking: false };
  const bOf = (id) => BUILDINGS.find((b) => b.id === id);
  const clampPos = (x, y) => [Math.max(BOUNDS.x1, Math.min(BOUNDS.x2, x)), Math.max(BOUNDS.y1, Math.min(BOUNDS.y2, y))];
  const nearest = () => BUILDINGS.find((b) => Math.hypot(S.x - b.door[0], (S.y - b.door[1]) * A) <= NEAR);
  const enter = (b) => { if (b.soon) cb.soon(b.soon); else cb.go(b.go); };
  const walkTo = (b) => { S.keys.clear(); if (reduce) { [S.x, S.y] = b.door; paint(true); enter(b); return; } S.target = { x: b.door[0], y: b.door[1] }; S.onArrive = () => enter(b); };
  const winOpen = () => { const w = document.getElementById('win'); return !!w && !w.hidden; };

  // 화면 크기에 맞춰 지도를 cover로 키운다
  let VW = 0; let VH = 0; let WW = 0; let WH = 0; let camX = 0; let camY = 0;
  const fit = () => { VW = cam.clientWidth; VH = cam.clientHeight; const sc = Math.max(VW / MAP_W, VH / MAP_H); WW = MAP_W * sc; WH = MAP_H * sc; world.style.width = `${WW}px`; world.style.height = `${WH}px`; };
  const ro = new ResizeObserver(() => { fit(); paint(true); }); ro.observe(cam); fit();

  let last = performance.now(); let raf = 0; let dead = false; let shownFace = ''; let nearId = null;
  function tick(now) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // 속도 벡터는 화면(픽셀) 기준. 좌표는 %라서 y는 A로 나눠 환산한다.
    let vx = (S.keys.has('right') ? 1 : 0) - (S.keys.has('left') ? 1 : 0); let vy = (S.keys.has('down') ? 1 : 0) - (S.keys.has('up') ? 1 : 0);
    if (vx || vy) { S.target = null; S.onArrive = null; } else if (S.target) {
      const ex = S.target.x - S.x; const ey = (S.target.y - S.y) * A; const d = Math.hypot(ex, ey);
      if (d <= SPEED * dt) { [S.x, S.y] = [S.target.x, S.target.y]; S.target = null; const f = S.onArrive; S.onArrive = null; S.walking = false; paint(); f?.(); raf = requestAnimationFrame(tick); return; }
      vx = ex / d; vy = ey / d;
    }
    if (vx || vy) {
      const len = Math.hypot(vx, vy);
      [S.x, S.y] = clampPos(S.x + (vx / len) * SPEED * dt, S.y + ((vy / len) * SPEED * dt) / A);
      S.face = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
      S.walking = true;
    } else S.walking = false;
    paint(); raf = requestAnimationFrame(tick);
  }
  function paint(snap) {
    player.style.left = `${S.x}%`; player.style.top = `${S.y}%`; player.classList.toggle('walking', S.walking);
    // 카메라: 캐릭터를 화면 가운데에 두되 지도 밖은 보이지 않게
    const tx = Math.max(0, Math.min(WW - VW, (S.x / 100) * WW - VW / 2)); const ty = Math.max(0, Math.min(WH - VH, (S.y / 100) * WH - VH / 2));
    camX = snap ? tx : camX + (tx - camX) * 0.15; camY = snap ? ty : camY + (ty - camY) * 0.15;
    world.style.transform = `translate(${-camX}px, ${-camY}px)`;
    if (S.face !== shownFace) { shownFace = S.face; spr.innerHTML = avatarHtml(user?.avatar, S.face); spr.style.transform = !hasSprites() && S.face === 'left' ? 'scaleX(-1)' : ''; }
    const n = S.walking ? null : nearest(); const id = n ? n.id : null;
    if (id !== nearId) {
      nearId = id; pinEls.forEach((p) => p.classList.toggle('near', p.dataset.id === id));
      nearBox.hidden = !n; nearBox.innerHTML = n ? `<button type="button" class="btn">${esc(n.name)} ${n.soon ? '(준비 중)' : '들어가기'} <span class="key">Enter</span></button>` : '';
      nearBox.querySelector('button')?.addEventListener('click', () => enter(n));
    }
  }

  pinEls.forEach((p) => p.addEventListener('click', (e) => { e.stopPropagation(); walkTo(bOf(p.dataset.id)); }));
  cam.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.vpin') || e.target.closest('.vnear')) return;
    const r = world.getBoundingClientRect(); S.keys.clear();
    const [x, y] = clampPos(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
    if (reduce) { S.x = x; S.y = y; } else { S.target = { x, y }; S.onArrive = null; }
  });
  const typing = (t) => t && (t.closest?.('input, textarea, select') || t.isContentEditable);
  const inScene = () => document.activeElement === document.body || cam.contains(document.activeElement);
  const keyOf = (e) => ({ ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' })[e.key];
  const onDown = (e) => {
    if (winOpen() || typing(e.target) || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || !inScene()) return; // 건물 창이 열려 있으면 걷지 않는다
    const k = keyOf(e);
    if (k) { e.preventDefault(); if (reduce) { const dx = { left: -6, right: 6 }[k] || 0; const dy = { up: -6, down: 6 }[k] || 0; [S.x, S.y] = clampPos(S.x + dx, S.y + dy); S.face = k; } else S.keys.add(k); }
    else if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && (document.activeElement === cam || document.activeElement === document.body)) { const n = nearest(); if (n) { e.preventDefault(); enter(n); } }
  };
  const onUp = (e) => { const k = keyOf(e); if (k) S.keys.delete(k); };
  const onBlur = () => S.keys.clear();
  addEventListener('keydown', onDown); addEventListener('keyup', onUp); addEventListener('blur', onBlur);
  paint(true); raf = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); removeEventListener('blur', onBlur); };
}
