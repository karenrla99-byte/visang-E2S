// 걸어 다니는 픽셀 마을. 이미지가 있으면 쓰고, 없으면 코드로 그린 기본 도트를 쓴다.
const WORLD_H = 600;           // 논리 높이(px). 화면에서는 컨테이너 높이에 맞춰 배율을 조정한다
const GROUND = 500;            // 땅(발이 닿는 선)의 y
const SPEED = 260;             // 논리 px/초
const FRAMES = 8;              // character-walk.png 프레임 수
const NAVY = '#0f1b4d';
const ASSET = (n) => `/assets/village/${n}`;

export const PLACES = [
  { id: 'shelf', label: '내 서재', x: 330, w: 250, h: 230, go: '#/shelf', file: 'building-shelf.png', wall: '#f0c9a0', roof: '#4f8a5b' },
  { id: 'library', label: '대도서관', x: 780, w: 400, h: 330, go: '#/library', file: 'building-library.png', wall: '#ead7a8', roof: '#b5653a', big: true },
  { id: 'art', label: '미술관', x: 1230, w: 270, h: 240, soon: '미술관', file: 'building-art.png', wall: '#c9d6ea', roof: '#7a6ab5' },
  { id: 'writing', label: '글 작업실', x: 1600, w: 250, h: 230, soon: '글 작업실', file: 'building-writing.png', wall: '#e8d9f0', roof: '#c06c9a' },
  { id: 'webtoon', label: '웹툰 공간', x: 1950, w: 250, h: 230, soon: '웹툰 공간', file: 'building-webtoon.png', wall: '#d9ecd9', roof: '#3f8f8f' },
  { id: 'goods', label: '굿즈 상점', x: 2300, w: 250, h: 230, soon: '굿즈 상점', file: 'building-goods.png', wall: '#f5e0b8', roof: '#c9a02e' },
];
const WORLD_W = 2650;
const START_X = 140;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- 기본 도트 그래픽(에셋이 없을 때) ----------
function pixelSvg(rows, pal, px, extra = '') {
  const w = Math.max(...rows.map((r) => r.length));
  const rects = [];
  rows.forEach((r, y) => [...r.padEnd(w, '.')].forEach((c, x) => { if (pal[c]) rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${pal[c]}"/>`); }));
  return `<svg viewBox="0 0 ${w} ${rows.length}" width="${w * px}" height="${rows.length * px}" shape-rendering="crispEdges" aria-hidden="true" ${extra}>${rects.join('')}</svg>`;
}
const CHAR_ROWS = ['...hhhhhh...', '..hhhhhhhh..', '..hsssssshh.', '..hsksssksh.', '..hssssssh..', '....ssss....', '...bbbbbb...', '..bbbbbbbb..', '.sbbbbbbbbs.', '.sbbbbbbbbs.', '..bbbbbbbb..', '..gggggggg..', '..ggg..ggg..', '..ggg..ggg..', '..www..www..', '..www..www..'];
const CHAR_PAL = { h: '#7a4b2a', s: '#f6c9a0', k: NAVY, b: '#7fb2e8', g: '#a9d18c', w: '#ffffff' };
const DOG_ROWS = ['..........oooo..', '..........ooooo.', '.....ooo..okooon.', '..oooooooooooo..', '.ooooobbooooo...', 'oooo.obboooo....', '....oooooooo....', '....oo.oo.oo.o..', '....oo.oo.oo.o..', '....dd.dd.dd.d..'];
const DOG_PAL = { o: '#f3c27a', k: NAVY, n: NAVY, b: '#7a4b2a', d: '#c98f4a' };

function buildingSvg(p) {
  const W = p.w; const H = p.h; const roofH = Math.round(H * 0.34); const wallY = roofH - 6; const wallH = H - wallY;
  const st = `stroke="${NAVY}" stroke-width="6" stroke-linejoin="miter"`;
  const win = (x, y) => `<rect x="${x}" y="${y}" width="${W * 0.14}" height="${W * 0.14}" fill="#a9d8ee" ${st}/>`;
  const doorW = W * 0.2; const doorH = wallH * 0.52;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="10" y="${wallY}" width="${W - 20}" height="${wallH - 3}" fill="${p.wall}" ${st}/>
    <polygon points="0,${roofH} ${W * 0.12},${roofH * 0.55} ${W * 0.3},${roofH * 0.15} ${W * 0.7},${roofH * 0.15} ${W * 0.88},${roofH * 0.55} ${W},${roofH}" fill="${p.roof}" ${st}/>
    <rect x="${W * 0.3}" y="${roofH * 0.15 + 8}" width="${W * 0.4}" height="${roofH * 0.2}" fill="#ffffff33"/>
    ${win(W * 0.14, wallY + wallH * 0.2)}${win(W * 0.72, wallY + wallH * 0.2)}${p.big ? win(W * 0.43, wallY + wallH * 0.12) : ''}
    <rect x="${W / 2 - doorW / 2}" y="${H - 3 - doorH}" width="${doorW}" height="${doorH}" fill="#6b3f1f" ${st}/>
    <rect x="${W / 2 + doorW * 0.2}" y="${H - doorH * 0.5}" width="8" height="8" fill="#f2c14e"/>
    ${p.soon ? `<rect x="10" y="${wallY}" width="${W - 20}" height="${wallH - 3}" fill="#ffffff66"/>` : ''}
  </svg>`;
}
const groundSvg = `<svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" shape-rendering="crispEdges" aria-hidden="true"><rect width="100" height="100" fill="#b0713f"/><rect width="100" height="22" fill="#6dbb3a"/><rect y="22" width="100" height="5" fill="#4f9a2c"/></svg>`;

function hillsSvg() {
  const hills = [[0, 420, 520, '#9fd08a'], [380, 440, 640, '#8cc77a'], [900, 410, 560, '#a7d58f'], [1400, 440, 600, '#8cc77a'], [1900, 420, 640, '#9fd08a'], [2300, 440, 560, '#8cc77a']]
    .map(([x, y, w, c]) => `<ellipse cx="${x + w / 2}" cy="${y + 120}" rx="${w / 2}" ry="120" fill="${c}"/>`).join('');
  const trees = Array.from({ length: 26 }, (_, i) => { const x = 40 + i * 100 + (i % 3) * 14; const s = 36 + (i % 4) * 8; return `<rect x="${x + s * 0.4}" y="${GROUND - 14}" width="${s * 0.2}" height="14" fill="#6b4a2a"/><circle cx="${x + s / 2}" cy="${GROUND - 14 - s * 0.45}" r="${s * 0.55}" fill="${i % 2 ? '#3f9a4c' : '#52ad57'}"/>`; }).join('');
  const clouds = [[120, 70], [700, 120], [1250, 60], [1800, 110], [2350, 70]].map(([x, y]) => `<g fill="#fffaf0"><rect x="${x}" y="${y}" width="150" height="26"/><rect x="${x + 24}" y="${y - 22}" width="86" height="26"/><rect x="${x + 90}" y="${y - 10}" width="54" height="18"/></g>`).join('');
  return `<svg viewBox="0 0 ${WORLD_W} ${WORLD_H}" width="${WORLD_W}" height="${WORLD_H}" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3f7"/><stop offset="1" stop-color="#cdeefc"/></linearGradient></defs>
    <rect width="${WORLD_W}" height="${GROUND}" fill="url(#sky)"/>${clouds}${hills}${trees}</svg>`;
}

const loadImg = (name) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = ASSET(name); });

/**
 * 마을 장면을 container에 그린다. 반환값은 정리 함수.
 * @param {{go:(hash:string)=>void, soon:(name:string)=>void}} cb
 */
export async function mountVillage(container, cb) {
  const imgs = Object.fromEntries(await Promise.all(['bg.png', 'ground.png', 'character-walk.png', 'character-idle.png', 'dog.png', ...PLACES.map((p) => p.file)].map(async (n) => [n, await loadImg(n)])));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 캐릭터 표시 크기
  const CH_H = 150; const DOG_H = 70;
  const walk = imgs['character-walk.png'];
  const fw = walk ? walk.naturalWidth / FRAMES : 12 * 11; const fh = walk ? walk.naturalHeight : 16 * 11;
  const chW = Math.round((fw * CH_H) / fh);
  const dog = imgs['dog.png'];
  const dogW = dog ? Math.round((dog.naturalWidth * DOG_H) / dog.naturalHeight) : Math.round((16 * DOG_H) / 10);

  const buildings = PLACES.map((p) => {
    const im = imgs[p.file];
    let w = p.w; let hh = p.h;
    if (im) { hh = p.h; w = Math.round((im.naturalWidth * hh) / im.naturalHeight); }
    const art = im ? `<img src="${ASSET(p.file)}" alt="" width="${w}" height="${hh}" draggable="false">` : buildingSvg({ ...p, w, h: hh });
    return `<button type="button" class="vb ${p.soon ? 'soon' : ''}" data-id="${p.id}" style="left:${p.x - w / 2}px;width:${w}px;height:${hh}px;bottom:${WORLD_H - GROUND - 4}px"
      aria-label="${esc(p.label)}${p.soon ? ', 준비 중' : ''}">${art}
      <span class="vsign px">${esc(p.label)}</span>${p.soon ? '<span class="vtag">준비 중</span>' : ''}<span class="vprompt" aria-hidden="true">Enter · 들어가기</span></button>`;
  }).join('');

  const chStyle = `width:${chW}px;height:${CH_H}px;`;
  const sprite = walk
    ? `<div class="vspr real" style="${chStyle}background-image:url(${ASSET('character-walk.png')});background-size:${chW * FRAMES}px ${CH_H}px;--sw:${chW * FRAMES}px"></div>`
    : `<div class="vspr fake" style="${chStyle}">${pixelSvg(CHAR_ROWS, CHAR_PAL, 11, `style="width:${chW}px;height:${CH_H}px"`)}</div>`;
  const idleImg = imgs['character-idle.png'];

  container.innerHTML = `
    <div class="vcam" tabindex="0" role="group" aria-label="픽셀 마을. 왼쪽·오른쪽 화살표로 걷고 건물 앞에서 Enter로 들어갑니다. 건물을 누르거나 Tab으로 선택해도 됩니다. 아래 메뉴 목록으로도 이동할 수 있습니다.">
      <div class="vworld" style="width:${WORLD_W}px;height:${WORLD_H}px">
        <div class="vbg">${imgs['bg.png'] ? `<img src="${ASSET('bg.png')}" alt="" style="width:100%;height:${GROUND + 10}px" draggable="false">` : hillsSvg()}</div>
        <div class="vground" style="top:${GROUND}px;height:${WORLD_H - GROUND}px;${imgs['ground.png'] ? `background-image:url(${ASSET('ground.png')});background-size:auto 100%;background-repeat:repeat-x` : ''}">${imgs['ground.png'] ? '' : groundSvg}</div>
        ${buildings}
        <div class="vactor vdog" style="width:${dogW}px;height:${DOG_H}px;bottom:${WORLD_H - GROUND - 14}px">${dog ? `<img src="${ASSET('dog.png')}" alt="" draggable="false" style="width:100%;height:100%">` : pixelSvg(DOG_ROWS, DOG_PAL, 6, `style="width:${dogW}px;height:${DOG_H}px"`)}</div>
        <div class="vactor vplayer ${idleImg ? 'has-idle' : ''}" style="width:${chW}px;height:${CH_H}px;bottom:${WORLD_H - GROUND - 14}px">${sprite}${idleImg ? `<img class="vidle" src="${ASSET('character-idle.png')}" alt="" draggable="false" style="width:100%;height:100%">` : ''}</div>
      </div>
      <div class="vhint" aria-hidden="true">← → 걷기 · Enter 들어가기 · 건물을 눌러 이동</div>
    </div>`;

  const cam = container.querySelector('.vcam'); const world = container.querySelector('.vworld');
  const player = container.querySelector('.vplayer'); const spr = container.querySelector('.vspr');
  const dogEl = container.querySelector('.vdog');
  const vbs = [...container.querySelectorAll('.vb')];

  let scale = 1; let camX = 0;
  const fit = () => { scale = cam.clientHeight / WORLD_H; world.style.transform = `scale(${scale})`; };
  const ro = new ResizeObserver(fit); ro.observe(cam); fit();

  const S = { x: START_X, face: 1, target: null, onArrive: null, walking: false, dogX: START_X - 90, dogWalk: false, keys: new Set() };
  const near = () => PLACES.find((p) => Math.abs(S.x - p.x) < 70);
  const place = (id) => PLACES.find((p) => p.id === id);

  function enter(p) { if (p.soon) cb.soon(p.soon); else cb.go(p.go); }
  function walkTo(p) {
    S.keys.clear();
    const tx = p.x;
    if (reduce) { S.x = tx; paint(); enter(p); return; }
    S.target = tx; S.onArrive = () => enter(p);
  }

  let last = performance.now(); let raf = 0; let dead = false;
  function tick(now) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let dir = 0;
    if (S.keys.has('left')) dir -= 1;
    if (S.keys.has('right')) dir += 1;
    if (dir) { S.target = null; S.onArrive = null; }
    let move = 0;
    if (S.target != null) {
      const dx = S.target - S.x; const step = SPEED * dt;
      if (Math.abs(dx) <= step) { move = dx; S.x = S.target; S.target = null; const f = S.onArrive; S.onArrive = null; f?.(); } else { move = Math.sign(dx) * step; S.x += move; }
    } else if (dir) { move = dir * SPEED * dt; S.x = Math.max(60, Math.min(WORLD_W - 60, S.x + move)); }
    if (move) S.face = Math.sign(move);
    S.walking = Math.abs(move) > 0.01;
    const want = S.x - S.face * 95;
    const prev = S.dogX; S.dogX += (want - S.dogX) * Math.min(1, dt * 4.5);
    S.dogWalk = Math.abs(S.dogX - prev) > 0.15;
    paint();
    raf = requestAnimationFrame(tick);
  }
  let promptId = null;
  function paint() {
    const viewW = cam.clientWidth / scale;
    const desired = Math.max(0, Math.min(WORLD_W - viewW, S.x - viewW / 2));
    camX += (desired - camX) * 0.2; if (Math.abs(desired - camX) < 0.5) camX = desired;
    world.style.transform = `scale(${scale}) translateX(${-camX}px)`;
    const chW2 = player.offsetWidth;
    player.style.transform = `translateX(${S.x - chW2 / 2}px) scaleX(${S.face})`;
    dogEl.style.transform = `translateX(${S.dogX - dogEl.offsetWidth / 2}px) scaleX(${S.face})`;
    player.classList.toggle('walking', S.walking); dogEl.classList.toggle('walking', S.dogWalk);
    const n = !S.walking && near(); const nid = n ? n.id : null;
    if (nid !== promptId) { promptId = nid; vbs.forEach((b) => b.classList.toggle('near', b.dataset.id === nid)); }
  }

  vbs.forEach((b) => b.addEventListener('click', () => walkTo(place(b.dataset.id))));
  cam.addEventListener('pointerdown', (e) => { // 빈 땅을 누르면 그쪽으로 걷기
    if (e.target.closest('.vb')) return;
    const r = cam.getBoundingClientRect();
    S.keys.clear(); const tx = Math.max(60, Math.min(WORLD_W - 60, camX + (e.clientX - r.left) / scale));
    if (reduce) S.x = tx; else { S.target = tx; S.onArrive = null; }
  });
  const typing = (t) => t && (t.closest?.('input, textarea, select') || t.isContentEditable);
  const inScene = () => document.activeElement === document.body || cam.contains(document.activeElement);
  const keyOf = (e) => ({ ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' })[e.key];
  const onDown = (e) => {
    if (typing(e.target) || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || !inScene()) return;
    const k = keyOf(e);
    if (k) { e.preventDefault(); S.keys.add(k); if (reduce) { S.x = Math.max(60, Math.min(WORLD_W - 60, S.x + (k === 'left' ? -80 : 80))); S.face = k === 'left' ? -1 : 1; } }
    else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === cam || (e.key === 'Enter' && document.activeElement === document.body)) { const n = near(); if (n) { e.preventDefault(); enter(n); } }
  };
  const onUp = (e) => { const k = keyOf(e); if (k) S.keys.delete(k); };
  const onBlur = () => S.keys.clear();
  addEventListener('keydown', onDown); addEventListener('keyup', onUp); addEventListener('blur', onBlur);

  paint(); camX = Math.max(0, Math.min(WORLD_W - cam.clientWidth / scale, S.x - cam.clientWidth / scale / 2)); paint();
  raf = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); removeEventListener('blur', onBlur); };
}
