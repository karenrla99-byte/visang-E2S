// 숲 마을: 노을빛 하늘이 보이는 3/4 시점의 넓은 땅을 자유롭게 돌아다니는 맵.
// 이미지가 있으면 쓰고, 없으면 코드로 그린 기본 도트를 쓴다. (규격: public/assets/village/README.md)
const W = 2400;            // 세계 너비(논리 px)
const H = 1800;            // 세계 높이
const HORIZON = 300;       // 이 위는 하늘·먼 언덕(걸을 수 없음)
const SPEED = 240;         // 논리 px/초
const CH_H = 100;          // 캐릭터 표시 높이
const INK = '#2B1D12';
const ASSET = (n) => `/assets/village/${n}`;
const START = { x: 1200, y: 950 };
const BOUNDS = { x1: 50, x2: W - 50, y1: HORIZON + 70, y2: H - 20 };

export const PLACES = [
  { id: 'shelf', label: '내 서재', x: 640, y: 900, w: 300, h: 250, go: '#/shelf', file: 'building-shelf.png', roof: '#B2503A', wall: '#EADDBF', chimney: true },
  { id: 'library', label: '대도서관', x: 1200, y: 640, w: 520, h: 400, go: '#/library', file: 'building-library.png', roof: '#B2503A', wall: '#E3D3B0', big: true },
  { id: 'art', label: '미술관', x: 1800, y: 790, w: 380, h: 270, soon: '미술관', file: 'building-art.png', roof: '#B2503A', wall: '#EFE3C8', open: true },
  { id: 'writing', label: '글 작업실', x: 1950, y: 1130, w: 300, h: 240, soon: '글 작업실', file: 'building-writing.png', roof: '#A3603C', wall: '#E8D9BA' },
  { id: 'webtoon', label: '웹툰 공간', x: 360, y: 1250, w: 300, h: 240, soon: '웹툰 공간', file: 'building-webtoon.png', roof: '#6F8F4A', wall: '#EADFC4', chimney: true },
  { id: 'goods', label: '굿즈 상점', x: 1200, y: 1740, w: 300, h: 230, soon: '굿즈 상점', file: 'building-goods.png', roof: '#C08A4A', wall: '#EFE0BE' },
];
const door = (p) => ({ x: p.x, y: p.y + 34 });
const PLAZA = { x: 1200, y: 900, rx: 320, ry: 190 };
const PW = 56; // 길 폭
const PATHS = [ // 문 → 광장 (축에 맞춘 꺾인 길)
  [[1200, 664], [1200, 900]], [[640, 934], [1200, 934]], [[1800, 824], [1800, 860], [1200, 860]],
  [[1950, 1164], [1950, 1000], [1200, 1000]], [[360, 1284], [360, 1060], [1200, 1060]], [[1200, 1774], [1200, 1000]],
];
const STREAM_PTS = [[-20, 1400], [420, 1380], [800, 1435], [1200, 1410], [1650, 1450], [2050, 1395], [2420, 1420]];
const BRIDGE = { x: 1200, x1: 1120, x2: 1280 };
const streamY = (x) => { for (let i = 1; i < STREAM_PTS.length; i++) { const [x0, y0] = STREAM_PTS[i - 1]; const [x1, y1] = STREAM_PTS[i]; if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); } return STREAM_PTS.at(-1)[1]; };
const STREAM_HALF = 34;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rnd = (seed) => { let t = seed; return () => { t = (t * 1664525 + 1013904223) % 4294967296; return t / 4294967296; }; };
const R = (x, y, w, h, c, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${extra}/>`;
const PX = 6;
// 계단식 타원(도트 느낌)
const dome = (cx, cy, rx, ry, color, topOnly = false) => {
  const out = [];
  for (let dy = -ry; dy <= (topOnly ? 0 : ry); dy += PX) {
    const half = Math.round((rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2))) / PX) * PX;
    if (half > 0) out.push(R(cx - half, cy + dy, half * 2, PX + 0.5, color));
  }
  return out.join('');
};
const svgWrap = (w, h, body, cls = '') => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;

// ---------- 기본 도트: 나무 / 소품 / 건물 ----------
function treeArt(kind) {
  if (kind === 2) { // 소나무
    const w = 120; const h = 200; const rows = [];
    for (let i = 0; i < 8; i++) { const ww = 30 + i * 11; rows.push(R(60 - ww / 2, 14 + i * 20, ww, 24, i % 2 ? '#3F6B3A' : '#4C7D43'), R(60 - ww / 2, 14 + i * 20 + 14, ww, 6, '#2F5430')); }
    return { w, h, svg: svgWrap(w, h, `${R(52, 168, 16, 32, '#6B4526')}${rows.join('')}`) };
  }
  const w = kind === 1 ? 190 : 160; const h = kind === 1 ? 210 : 200; const cx = w / 2;
  const body = [R(cx - 10, h - 54, 20, 54, '#6B4526'), R(cx - 10, h - 54, 6, 54, '#85592F'), R(cx - 22, h - 8, 44, 8, '#5A3A20'),
    dome(cx, h - 100, w * 0.5, 86, '#4A7A30'), dome(cx - 10, h - 112, w * 0.43, 70, '#628F38', true), dome(cx - 22, h - 128, w * 0.3, 40, '#7FAE49', true)];
  const r = rnd(kind + 11); for (let i = 0; i < 26; i++) body.push(R(Math.round((cx - w * 0.38 + r() * w * 0.76) / PX) * PX, Math.round((h - 180 + r() * 110) / PX) * PX, PX, PX, r() > 0.5 ? '#A5CC63' : '#3F6A28'));
  return { w, h, svg: svgWrap(w, h, body.join('')) };
}
const DECOR_ART = {
  bench: { w: 100, h: 56, svg: () => svgWrap(100, 56, `${R(8, 40, 10, 16, '#5A3A20')}${R(82, 40, 10, 16, '#5A3A20')}${R(4, 22, 92, 10, '#9A6A3C')}${R(4, 32, 92, 6, '#7A5230')}${R(8, 4, 84, 8, '#9A6A3C')}${R(10, 12, 8, 12, '#5A3A20')}${R(82, 12, 8, 12, '#5A3A20')}`) },
  lamp: { w: 44, h: 150, svg: () => svgWrap(44, 150, `${R(19, 28, 6, 122, '#4A3220')}${R(10, 140, 24, 10, '#4A3220')}${R(6, 8, 32, 30, '#FFD98A')}${R(6, 8, 32, 5, '#5A3A20')}${R(6, 34, 32, 5, '#5A3A20')}${R(16, 14, 12, 18, '#FFF3C4')}`) },
  sign: { w: 84, h: 96, svg: () => svgWrap(84, 96, `${R(38, 56, 8, 40, '#5A3A20')}${R(6, 8, 72, 50, '#7A5230')}${R(10, 12, 32, 42, '#FBF1D8')}${R(42, 12, 32, 42, '#F3E4C0')}${R(41, 10, 3, 46, '#8A6A40')}${[18, 26, 34, 42].map((y) => R(14, y, 24, 3, '#B9A57F') + R(46, y, 24, 3, '#B9A57F')).join('')}`) },
  bush: { w: 96, h: 62, svg: () => svgWrap(96, 62, `${dome(48, 36, 46, 26, '#4E8132')}${dome(36, 28, 32, 20, '#66983B', true)}${dome(60, 22, 22, 14, '#82B24B', true)}${R(30, 14, 6, 6, '#F3B7C0')}${R(58, 24, 6, 6, '#FFF')}${R(44, 8, 6, 6, '#F3B7C0')}`) },
  rock: { w: 68, h: 40, svg: () => svgWrap(68, 40, `${dome(34, 26, 32, 14, '#9C8F78')}${dome(30, 20, 24, 10, '#B7AB93', true)}${R(8, 36, 52, 4, '#6F6553')}`) },
  fence: { w: 180, h: 46, svg: () => svgWrap(180, 46, `${R(0, 14, 180, 6, '#8A5A33')}${R(0, 28, 180, 6, '#8A5A33')}${[4, 50, 96, 142, 172].map((x) => R(x, 4, 8, 42, '#6B4526')).join('')}`) },
  banner: { w: 50, h: 150, svg: () => svgWrap(50, 150, `${R(22, 0, 6, 150, '#5A3A20')}${R(8, 6, 34, 60, '#E9A8A0')}${R(8, 56, 34, 10, '#D98A84')}${R(6, 2, 38, 6, '#5A3A20')}`) },
  flowerbed: { w: 120, h: 50, svg: () => svgWrap(120, 50, `${dome(60, 30, 58, 18, '#4E8132')}${[10, 28, 46, 64, 82, 100].map((x, i) => R(x, 10 + (i % 3) * 6, 8, 8, ['#F3B7C0', '#FFF8E6', '#F6D86B'][i % 3])).join('')}`) },
  bridge: { w: 240, h: 120, svg: () => svgWrap(240, 120, `${R(0, 36, 240, 60, '#CDBB98')}${R(0, 28, 240, 12, '#E1D2B0')}${R(0, 96, 240, 10, '#8E7F63')}${R(60, 66, 120, 40, '#4F8FA8')}${dome(120, 66, 62, 40, '#B7A581', true)}${R(0, 20, 14, 30, '#E1D2B0')}${R(226, 20, 14, 30, '#E1D2B0')}`) },
};

function buildingArt(p) {
  const { w, h } = p; const roofH = Math.round(h * 0.44); const wallY = Math.round(roofH * 0.82);
  const shade = '#8B7355'; const out = [];
  out.push(R(8, wallY, w - 16, h - wallY - 6, p.wall)); // 벽
  for (let y = wallY + 26; y < h - 12; y += 26) out.push(R(8, y, w - 16, 3, '#00000014'));
  out.push(R(8, wallY, 8, h - wallY - 6, '#00000010'), R(w - 16, wallY, 8, h - wallY - 6, '#0000001c'));
  if (p.big) { // 가운데 솟은 아치 창 + 양쪽 날개
    out.push(R(w * 0.3, roofH * 0.28, w * 0.4, wallY, '#EBDDBC'), R(w * 0.3, roofH * 0.28, 6, wallY + 20, '#00000014'));
    out.push(`<path d="M${w * 0.37} ${wallY + 20} V${roofH * 0.52} A${w * 0.13} ${w * 0.13} 0 0 1 ${w * 0.63} ${roofH * 0.52} V${wallY + 20} Z" fill="#FFD98A" stroke="${shade}" stroke-width="5"/>`);
    out.push(...[0.44, 0.5, 0.56].map((k) => R(w * k, roofH * 0.46, 3, wallY - roofH * 0.2, shade)), R(w * 0.37, roofH * 0.72, w * 0.26, 3, shade));
    out.push(`<polygon points="${w * 0.27},${roofH * 0.34} ${w * 0.5},0 ${w * 0.73},${roofH * 0.34}" fill="${p.roof}"/>`, R(w * 0.27, roofH * 0.3, w * 0.46, 6, '#8E3B2B'));
    out.push(`<polygon points="0,${roofH + 6} ${w * 0.1},${roofH * 0.55} ${w * 0.3},${roofH * 0.55} ${w * 0.3},${roofH + 6}" fill="${p.roof}"/><polygon points="${w},${roofH + 6} ${w * 0.9},${roofH * 0.55} ${w * 0.7},${roofH * 0.55} ${w * 0.7},${roofH + 6}" fill="${p.roof}"/>`);
  } else {
    out.push(`<polygon points="0,${roofH + 4} ${w * 0.16},${roofH * 0.1} ${w * 0.84},${roofH * 0.1} ${w},${roofH + 4}" fill="${p.roof}"/>`);
    [0.35, 0.58, 0.8].forEach((k) => out.push(R(w * (0.1 + (1 - k) * 0.08), roofH * k, w * (0.8 - (1 - k) * 0.16), 4, '#00000026')));
    out.push(R(w * 0.16, roofH * 0.1, w * 0.68, 6, '#ffffff30'));
  }
  if (p.chimney) out.push(R(w * 0.7, -2, 34, roofH * 0.7, '#9C8F78'), R(w * 0.7 - 4, -2, 42, 8, '#7F745F'));
  const win = (x, y, ww, hh) => `<path d="M${x} ${y + hh} V${y + ww / 2} A${ww / 2} ${ww / 2} 0 0 1 ${x + ww} ${y + ww / 2} V${y + hh} Z" fill="#FFD98A" stroke="${shade}" stroke-width="4"/>${R(x + ww / 2 - 1.5, y + ww / 2, 3, hh - ww / 2, shade)}${R(x, y + hh * 0.62, ww, 3, shade)}`;
  const ww = Math.round(w * 0.12); const wy = wallY + (h - wallY) * 0.18; const wh = (h - wallY) * 0.42;
  if (!p.open) { out.push(win(w * 0.12, wy, ww, wh), win(w * 0.76, wy, ww, wh)); if (p.big) out.push(win(w * 0.22, wy, ww * 0.9, wh), win(w * 0.66, wy, ww * 0.9, wh)); }
  else { out.push(R(w * 0.16, wallY + 26, w * 0.68, h - wallY - 34, '#6B4A2D'), R(w * 0.18, wallY + 32, w * 0.64, h - wallY - 42, '#F5E3B5'), ...[0.24, 0.45, 0.66].map((k) => R(w * k, wallY + 44, w * 0.12, 44, '#8FB3C4', `stroke="${shade}" stroke-width="3"`))); }
  const dw = Math.round(w * 0.16); const dh = Math.round((h - wallY) * 0.56); const dx = w / 2 - dw / 2;
  if (!p.open) out.push(`<path d="M${dx} ${h - 6} V${h - 6 - dh + dw / 2} A${dw / 2} ${dw / 2} 0 0 1 ${dx + dw} ${h - 6 - dh + dw / 2} V${h - 6} Z" fill="#7A4B2A" stroke="${shade}" stroke-width="4"/>${R(dx + dw / 2 - 1.5, h - 6 - dh + dw / 2, 3, dh - dw / 2, shade)}`);
  out.push(R(w * 0.34, h - 6, w * 0.32, 6, '#CDBB98'), R(w * 0.3, h - 2, w * 0.4, 4, '#B9A57F')); // 계단
  const r = rnd(w + h); for (let i = 0; i < 14; i++) out.push(R(Math.round(8 + r() * (w - 20)), Math.round(roofH * 0.5 + r() * (h - roofH * 0.6)), 6 + r() * 6, 6 + r() * 8, r() > 0.5 ? '#5E8C3A' : '#78A547'));
  return svgWrap(w, h, out.join(''));
}

// ---------- 캐릭터(기본 도트, 정면/뒷모습) ----------
const FRONT = ['....hhhhhh....', '..hhhhhhhhhh..', '.hhhhhhhhhhhh.', '.hhsssssssshh.', '.hhsssssssshh.', '.hssksssskssh.', '.hsspsssspssh.', '..hssssssssh..', '....ssssss....', '...bbbbbbbb...', '..bbbbbbbbbb..', '.sbbbbbbbbbbs.', '.sbbbbbbbbbbs.', '..bbbbbbbbbb..', '..gggggggggg..', '..gggg..gggg..', '..gggg..gggg..', '..wwww..wwww..', '..wwww..wwww..'];
const BACK = ['....hhhhhh....', '..hhhhhhhhhh..', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..', '....hhhhhh....', '...bbbbbbbb...', '..bbyyyyyybb..', '.sbbyyyyyybbs.', '.sbbyyyyyybbs.', '..bbyyyyyybb..', '..gggggggggg..', '..gggg..gggg..', '..gggg..gggg..', '..wwww..wwww..', '..wwww..wwww..'];
const PAL = { h: '#5A3A22', s: '#FBD3AC', k: INK, p: '#F4A7A0', b: '#E8C16A', y: '#D79A3A', g: '#4A4034', w: '#F4EDE0' };
function pixelSvg(rows, px) {
  const w = Math.max(...rows.map((r) => r.length)); const out = [];
  rows.forEach((r, y) => [...r.padEnd(w, '.')].forEach((c, x) => { if (PAL[c]) out.push(`<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${PAL[c]}"/>`); }));
  return `<svg viewBox="0 0 ${w} ${rows.length}" width="${w * px}" height="${rows.length * px}" shape-rendering="crispEdges" aria-hidden="true">${out.join('')}</svg>`;
}

// ---------- 배경 (하늘/언덕/풀밭/광장/길/개울) ----------
function worldSvg(imgs) {
  const r = rnd(5); const snap = (v) => Math.round(v / PX) * PX; const parts = [];
  // 노을 하늘 4단 + 구름 + 먼 언덕 + 먼 소나무
  ['#F6CFA9', '#F8D9B6', '#FAE3C4', '#FCECD4'].forEach((c, i) => parts.push(R(0, (HORIZON * i) / 4, W, HORIZON / 4 + 2, c)));
  [[200, 60, 1.3], [800, 120, 0.9], [1400, 50, 1.5], [1950, 110, 1.0], [2300, 60, 1.1]].forEach(([x, y, k]) => parts.push(dome(x, y + 30, 120 * k, 26 * k, '#F5BFA8', true), dome(x, y + 22, 110 * k, 24 * k, '#FBDCCB', true), dome(x - 70 * k, y + 22, 52 * k, 18 * k, '#FBDCCB', true)));
  [[300, 250, 520, 90, '#B7B988'], [1000, 260, 620, 70, '#A6B07C'], [1700, 250, 560, 85, '#B7B988'], [2250, 262, 440, 65, '#A6B07C']].forEach(([x, y, rx, ry, c]) => parts.push(dome(x, y, rx, ry, c, true)));
  for (let i = 0; i < 70; i++) { const x = snap(r() * W); const hh = 40 + Math.round(r() * 26); parts.push(`<polygon points="${x},${HORIZON - 6} ${x + 11},${HORIZON - 6 - hh} ${x + 22},${HORIZON - 6}" fill="${r() > 0.5 ? '#5F7F52' : '#6F8E5C'}"/>`); }
  parts.push(R(0, HORIZON - 8, W, 14, '#6E8E4A'));
  // 풀밭
  parts.push(R(0, HORIZON, W, H - HORIZON, '#7C9F48'));
  for (let i = 0; i < 2600; i++) parts.push(R(snap(r() * W), HORIZON + snap(r() * (H - HORIZON)), PX * (1 + Math.floor(r() * 2)), PX / 2, r() > 0.45 ? '#6D9040' : '#8FB257'));
  // 개울
  const poly = STREAM_PTS.map(([x, y]) => `${x},${y}`);
  parts.push(`<polyline points="${poly.join(' ')}" fill="none" stroke="#8E7F63" stroke-width="${STREAM_HALF * 2 + 12}" stroke-linejoin="round"/><polyline points="${poly.join(' ')}" fill="none" stroke="#5FA8C6" stroke-width="${STREAM_HALF * 2 - 4}" stroke-linejoin="round"/><polyline points="${poly.join(' ')}" fill="none" stroke="#8FD0E4" stroke-width="10" stroke-dasharray="26 40" stroke-linejoin="round"/>`);
  // 광장 + 길
  const paving = (fn) => { const o = []; for (let i = 0; i < 520; i++) { const [x, y] = fn(); o.push(R(snap(x), snap(y), PX * (1 + Math.floor(r() * 2)), PX, r() > 0.5 ? '#C9B88F' : '#E4D6B5')); } return o.join(''); };
  parts.push(dome(PLAZA.x, PLAZA.y, PLAZA.rx + 6, PLAZA.ry + 6, '#A99870'), dome(PLAZA.x, PLAZA.y, PLAZA.rx, PLAZA.ry, '#D9C9A4'));
  parts.push(paving(() => { const a = r() * 6.283; const k = Math.sqrt(r()); return [PLAZA.x + Math.cos(a) * PLAZA.rx * k, PLAZA.y + Math.sin(a) * PLAZA.ry * k]; }));
  [0.36, 0.68].forEach((k) => parts.push(`<ellipse cx="${PLAZA.x}" cy="${PLAZA.y}" rx="${PLAZA.rx * k}" ry="${PLAZA.ry * k}" fill="none" stroke="#B8A67C" stroke-width="6" stroke-dasharray="14 8"/>`));
  PATHS.forEach((pts) => { for (let i = 1; i < pts.length; i++) { let [x0, y0] = pts[i - 1]; let [x1, y1] = pts[i]; const vert = x0 === x1; const lo = vert ? Math.min(y0, y1) : Math.min(x0, x1); const hi = vert ? Math.max(y0, y1) : Math.max(x0, x1);
    const segs = vert && x0 === BRIDGE.x ? [[lo, Math.min(hi, streamY(x0) - 50)], [Math.max(lo, streamY(x0) + 50), hi]] : [[lo, hi]];
    segs.forEach(([a, b]) => { if (b <= a) return; const rect = vert ? [x0 - PW / 2, a, PW, b - a] : [a, y0 - PW / 2, b - a, PW]; parts.push(R(rect[0] - 4, rect[1], rect[2] + 8, rect[3], '#B9A67D', ''), R(...rect, '#D8C8A2'), paving(() => [rect[0] + r() * rect[2], rect[1] + r() * rect[3]]).slice(0, 4000)); }); } });
  // 꽃밭(길·광장·개울 밖)
  const free = (x, y) => !(((x - PLAZA.x) / (PLAZA.rx + 20)) ** 2 + ((y - PLAZA.y) / (PLAZA.ry + 20)) ** 2 < 1 || Math.abs(y - streamY(x)) < STREAM_HALF + 20 || onPath(x, y, 30));
  for (let i = 0; i < 900; i++) { const x = snap(r() * W); const y = HORIZON + 40 + snap(r() * (H - HORIZON - 60)); if (!free(x, y)) continue; const c = ['#FFF8E6', '#F3B7C0', '#F6D86B', '#E98F9B'][Math.floor(r() * 4)]; parts.push(R(x, y, PX, PX, c), R(x + PX / 2, y + PX, 3, PX, '#4E8132')); }
  return svgWrap(W, H, parts.join(''), 'vstatic');
}
const pathRects = () => PATHS.flatMap((pts) => pts.slice(1).map((p, i) => { const [x0, y0] = pts[i]; const [x1, y1] = p; return x0 === x1 ? { x1: x0 - PW / 2, x2: x0 + PW / 2, y1: Math.min(y0, y1), y2: Math.max(y0, y1) } : { x1: Math.min(x0, x1), x2: Math.max(x0, x1), y1: y0 - PW / 2, y2: y0 + PW / 2 }; }));
const PATH_RECTS = pathRects();
function onPath(x, y, m = 0) { return PATH_RECTS.some((q) => x > q.x1 - m && x < q.x2 + m && y > q.y1 - m && y < q.y2 + m); }

// ---------- 배치: 나무·소품 ----------
function layout() {
  const r = rnd(21); const trees = []; const decor = []; const solids = [];
  const nearPlace = (x, y, m) => PLACES.some((p) => x > p.x - p.w / 2 - m && x < p.x + p.w / 2 + m && y > p.y - p.h - m * 0.5 && y < p.y + m + 40);
  const inPlaza = (x, y, m) => ((x - PLAZA.x) / (PLAZA.rx + m)) ** 2 + ((y - PLAZA.y) / (PLAZA.ry + m)) ** 2 < 1;
  const clear = (x, y) => nearPlace(x, y, 90) || inPlaza(x, y, 80) || onPath(x, y, 70) || Math.abs(y - streamY(x)) < STREAM_HALF + 70 || Math.hypot(x - START.x, y - START.y) < 170;
  // 소품(고정 위치)
  const D = (kind, x, y, solid = false) => { decor.push({ kind, x, y }); if (solid) solids.push({ x1: x - 22, x2: x + 22, y1: y - 12, y2: y }); };
  [[1000, 780], [1400, 780], [1010, 1030], [1390, 1030]].forEach(([x, y]) => D('bench', x, y, true));
  [[1000, 700], [1400, 700], [960, 960], [1440, 960], [740, 1000], [1890, 900], [1200, 1130]].forEach(([x, y]) => D('lamp', x, y, true));
  D('sign', 1080, 680, true); D('sign', 770, 960, true); D('sign', 1620, 800, true);
  D('banner', 1650, 760, true); D('banner', 1960, 760, true);
  D('fence', 520, 1000); D('fence', 700, 1000); D('fence', 450, 880);
  [[860, 790], [1530, 700], [1570, 880], [760, 1170], [1700, 1060], [1000, 1190], [1400, 1190]].forEach(([x, y]) => D('flowerbed', x, y));
  [[820, 1000, 'rock'], [1650, 1020, 'rock'], [900, 1290, 'rock'], [1560, 1330, 'rock'], [1090, 1350, 'rock'], [1310, 1355, 'rock']].forEach(([x, y, k]) => D(k, x, y, true));
  decor.push({ kind: 'bridge', x: BRIDGE.x, y: streamY(BRIDGE.x) + 48, low: true });
  // 나무(가장자리일수록 촘촘)
  for (let gy = HORIZON + 40; gy < H - 10; gy += 96) for (let gx = 40; gx < W; gx += 96) {
    const x = gx + (r() - 0.5) * 70; const y = gy + (r() - 0.5) * 60;
    if (clear(x, y)) continue;
    const edge = Math.min(x, W - x, H - y, y - HORIZON) < 300 ? 1 : 0;
    if (r() > (edge ? 0.78 : 0.2)) continue;
    const kind = r() < 0.18 ? 2 : r() < 0.5 ? 1 : 0; const s = 0.85 + r() * 0.4;
    trees.push({ kind, x, y, s }); solids.push({ x1: x - 14 * s, x2: x + 14 * s, y1: y - 12 * s, y2: y });
  }
  return { trees, decor, solids };
}

const loadImg = (name) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = ASSET(name); });
const ASSET_NAMES = ['backdrop.png', 'ground-tile.png', 'plaza.png', 'character-walk.png', 'tree-1.png', 'tree-2.png', 'tree-3.png', ...Object.keys(DECOR_ART).map((k) => `decor-${k}.png`), ...PLACES.map((p) => p.file)];

/** 숲 마을을 container에 그린다. 반환값은 정리 함수. */
export async function mountVillage(container, cb) {
  const imgs = Object.fromEntries(await Promise.all(ASSET_NAMES.map(async (n) => [n, await loadImg(n)])));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { trees, decor, solids } = layout();
  const items = []; const solidsAll = [...solids];

  // 정적 배경 (이미지가 있으면 이미지로 교체)
  const stat = imgs['backdrop.png'] || imgs['ground-tile.png'] ? '' : worldSvg(imgs);
  const customBg = (imgs['backdrop.png'] ? `<img class="vlayer" src="${ASSET('backdrop.png')}" alt="" style="width:${W}px;height:${HORIZON + 60}px" draggable="false">` : '')
    + (imgs['ground-tile.png'] ? `<div class="vlayer" style="top:${HORIZON}px;width:${W}px;height:${H - HORIZON}px;background:url(${ASSET('ground-tile.png')});background-size:128px 128px"></div>` : '')
    + (imgs['plaza.png'] ? `<img class="vlayer" src="${ASSET('plaza.png')}" alt="" style="left:${PLAZA.x - PLAZA.rx}px;top:${PLAZA.y - PLAZA.ry}px;width:${PLAZA.rx * 2}px;height:${PLAZA.ry * 2}px" draggable="false">` : '');

  const item = (html, x, y, w, h, z, extra = '') => `<div class="vitem" style="left:${x - w / 2}px;top:${y - h}px;width:${w}px;height:${h}px;z-index:${z};${extra}">${html}</div>`;
  const parts = [];
  trees.forEach((t) => {
    const im = imgs[`tree-${t.kind + 1}.png`]; const base = treeArt(t.kind);
    const w = Math.round((im ? (im.naturalWidth * 200) / im.naturalHeight : base.w) * t.s); const h = Math.round((im ? 200 : base.h) * t.s);
    parts.push(item(im ? `<img src="${ASSET(`tree-${t.kind + 1}.png`)}" alt="" style="width:100%;height:100%" draggable="false">` : base.svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"'), t.x, t.y, w, h, Math.round(t.y)));
  });
  const glows = [];
  decor.forEach((d) => {
    const art = DECOR_ART[d.kind]; const im = imgs[`decor-${d.kind}.png`];
    const w = im ? Math.round((im.naturalWidth * art.h) / im.naturalHeight) : art.w;
    parts.push(item(im ? `<img src="${ASSET(`decor-${d.kind}.png`)}" alt="" style="width:100%;height:100%" draggable="false">` : art.svg().replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"'), d.x, d.y, w, art.h, d.low ? 2 : Math.round(d.y)));
    if (d.kind === 'lamp') glows.push(`<div class="vglow" style="left:${d.x - 90}px;top:${d.y - 120 - 90}px"></div>`);
  });
  PLACES.forEach((p, i) => {
    const im = imgs[p.file]; let w = p.w; const hh = p.h; if (im) w = Math.round((im.naturalWidth * hh) / im.naturalHeight);
    const art = im ? `<img src="${ASSET(p.file)}" alt="" width="${w}" height="${hh}" draggable="false">` : buildingArt({ ...p, w, h: hh });
    parts.push(`<button type="button" class="vb ${p.soon ? 'soon' : ''}" data-id="${p.id}" style="left:${p.x - w / 2}px;top:${p.y - hh}px;width:${w}px;height:${hh}px;z-index:${p.y}" aria-label="${esc(p.label)}${p.soon ? ', 준비 중' : ''}">${art}
      <span class="vsign"><span class="vno" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${esc(p.label)}</span>${p.soon ? '<span class="vtag">준비 중</span>' : ''}<span class="vprompt" aria-hidden="true"><span class="key">Enter</span>들어가기</span></button>`);
    solidsAll.push({ x1: p.x - w / 2 + 12, x2: p.x + w / 2 - 12, y1: p.y - 74, y2: p.y - 4 });
  });

  // 캐릭터
  const sheet = imgs['character-walk.png'];
  const chW = sheet ? Math.round((sheet.naturalWidth / 4 / (sheet.naturalHeight / 4)) * CH_H) : Math.round((14 / 19) * CH_H);
  const ROW = { down: 0, left: 1, right: 2, up: 3 };
  const fakeSvg = (face) => pixelSvg(face === 'up' ? BACK : FRONT, CH_H / 19);
  const playerHtml = `<div class="vactor vplayer" style="width:${chW}px;height:${CH_H}px"><div class="vshadow"></div>${sheet
    ? `<div class="vspr real" style="width:${chW}px;height:${CH_H}px;background-image:url(${ASSET('character-walk.png')});background-size:${chW * 4}px ${CH_H * 4}px;--sw:${chW * 4}px"></div>`
    : `<div class="vspr fake" style="width:${chW}px;height:${CH_H}px">${fakeSvg('up')}</div>`}</div>`;

  const mini = `<div class="vmini" aria-hidden="true">${PLACES.map((p) => `<b style="left:${(p.x / W) * 100}%;top:${(p.y / H) * 100}%"></b>`).join('')}<i id="vme"></i></div>`;
  container.innerHTML = `<div class="vcam" tabindex="0" role="group" aria-label="숲 마을. 방향키나 WASD로 걷고 건물 앞에서 Enter로 들어갑니다. 건물을 누르거나 Tab으로 선택해도 됩니다. 아래 메뉴 목록으로도 이동할 수 있습니다.">
    <div class="vworld" style="width:${W}px;height:${H}px">${stat}${customBg}${glows.join('')}${parts.join('')}${playerHtml}</div>
    <div class="vwarm" aria-hidden="true"></div>${mini}<div class="vhint" aria-hidden="true">방향키·WASD 걷기 · Enter 들어가기 · 땅을 눌러 이동</div></div>`;

  const cam = container.querySelector('.vcam'); const world = container.querySelector('.vworld');
  const player = container.querySelector('.vplayer'); const spr = player.querySelector('.vspr'); const me = container.querySelector('#vme');
  const vbs = [...container.querySelectorAll('.vb')];
  const place = (id) => PLACES.find((p) => p.id === id);

  let scale = 1;
  const fit = () => { scale = Math.max(0.45, Math.min(1, cam.clientWidth / 1400)); };
  const ro = new ResizeObserver(fit); ro.observe(cam); fit();

  const S = { x: START.x, y: START.y, face: 'up', walking: false, target: null, onArrive: null, keys: new Set() };
  const hits = (x, y) => {
    if (x < BOUNDS.x1 || x > BOUNDS.x2 || y < BOUNDS.y1 || y > BOUNDS.y2) return true;
    if (Math.abs(y - streamY(x)) < STREAM_HALF - 6 && !(x > BRIDGE.x1 && x < BRIDGE.x2)) return true;
    return solidsAll.some((q) => x > q.x1 - 10 && x < q.x2 + 10 && y > q.y1 && y < q.y2 + 4);
  };
  const near = () => PLACES.find((p) => { const d = door(p); return Math.hypot(S.x - d.x, S.y - d.y) < 110; });
  const enter = (p) => { if (p.soon) cb.soon(p.soon); else cb.go(p.go); };
  const walkTo = (p) => { S.keys.clear(); const d = door(p); if (reduce) { S.x = d.x; S.y = d.y; paint(); enter(p); return; } S.target = { x: d.x, y: d.y }; S.onArrive = () => enter(p); };

  let camX = 0; let camY = 0; let last = performance.now(); let raf = 0; let dead = false; let shownFace = '';
  function tick(now) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let vx = (S.keys.has('right') ? 1 : 0) - (S.keys.has('left') ? 1 : 0); let vy = (S.keys.has('down') ? 1 : 0) - (S.keys.has('up') ? 1 : 0);
    if (vx || vy) { S.target = null; S.onArrive = null; } else if (S.target) {
      const dx = S.target.x - S.x; const dy = S.target.y - S.y; const d = Math.hypot(dx, dy);
      if (d <= SPEED * dt) { S.x = S.target.x; S.y = S.target.y; S.target = null; const f = S.onArrive; S.onArrive = null; S.walking = false; paint(); f?.(); raf = requestAnimationFrame(tick); return; }
      vx = dx / d; vy = dy / d;
    }
    let moved = false;
    if (vx || vy) {
      const len = Math.hypot(vx, vy); const sx = (vx / len) * SPEED * dt; const sy = (vy / len) * SPEED * dt;
      if (sx && !hits(S.x + sx, S.y)) { S.x += sx; moved = true; }
      if (sy && !hits(S.x, S.y + sy)) { S.y += sy; moved = true; }
      if (!moved && S.target) { S.target = null; S.onArrive = null; } // 막히면 멈춘다
      S.face = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    }
    S.walking = moved; paint(); raf = requestAnimationFrame(tick);
  }
  let promptId = null;
  function paint() {
    const vw = cam.clientWidth / scale; const vh = cam.clientHeight / scale;
    const tx = Math.max(0, Math.min(W - vw, S.x - vw / 2)); const ty = Math.max(0, Math.min(H - vh, S.y - vh * 0.7));
    camX += (tx - camX) * 0.18; camY += (ty - camY) * 0.18; if (Math.abs(tx - camX) < 0.5) camX = tx; if (Math.abs(ty - camY) < 0.5) camY = ty;
    world.style.transform = `scale(${scale}) translate(${-camX}px, ${-camY}px)`;
    player.style.transform = `translate(${S.x - player.offsetWidth / 2}px, ${S.y - CH_H}px)`; player.style.zIndex = Math.round(S.y);
    player.classList.toggle('walking', S.walking);
    if (S.face !== shownFace) {
      shownFace = S.face;
      if (sheet) spr.style.backgroundPositionY = `${-ROW[S.face] * CH_H}px`;
      else { spr.innerHTML = fakeSvg(S.face); spr.style.transform = S.face === 'left' ? 'scaleX(-1)' : ''; }
    }
    me.style.left = `${(S.x / W) * 100}%`; me.style.top = `${(S.y / H) * 100}%`;
    const n = near(); const nid = n && !S.walking ? n.id : null;
    if (nid !== promptId) { promptId = nid; vbs.forEach((b) => b.classList.toggle('near', b.dataset.id === nid)); }
  }

  vbs.forEach((b) => b.addEventListener('click', () => walkTo(place(b.dataset.id))));
  // Tab으로 화면 밖 건물에 포커스가 가면 브라우저가 컨테이너를 스크롤하므로 되돌리고 카메라를 그 건물로 옮긴다
  cam.addEventListener('focusin', (e) => {
    cam.scrollLeft = 0; cam.scrollTop = 0;
    const b = e.target.closest?.('.vb'); if (!b) return;
    const p = place(b.dataset.id); const vw = cam.clientWidth / scale; const vh = cam.clientHeight / scale;
    camX = Math.max(0, Math.min(W - vw, p.x - vw / 2)); camY = Math.max(0, Math.min(H - vh, p.y - vh * 0.7));
  });
  cam.addEventListener('scroll', () => { cam.scrollLeft = 0; cam.scrollTop = 0; });
  cam.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.vb')) return;
    const rc = cam.getBoundingClientRect(); S.keys.clear();
    const x = Math.max(BOUNDS.x1, Math.min(BOUNDS.x2, camX + (e.clientX - rc.left) / scale)); const y = Math.max(BOUNDS.y1, Math.min(BOUNDS.y2, camY + (e.clientY - rc.top) / scale));
    if (reduce) { if (!hits(x, y)) { S.x = x; S.y = y; } } else { S.target = { x, y }; S.onArrive = null; }
  });
  const typing = (t) => t && (t.closest?.('input, textarea, select') || t.isContentEditable);
  const inScene = () => document.activeElement === document.body || cam.contains(document.activeElement);
  const keyOf = (e) => ({ ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' })[e.key];
  const onDown = (e) => {
    if (typing(e.target) || document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey || !inScene()) return;
    const k = keyOf(e);
    if (k) { e.preventDefault(); if (reduce) { const dx = { left: -80, right: 80 }[k] || 0; const dy = { up: -80, down: 80 }[k] || 0; if (!hits(S.x + dx, S.y + dy)) { S.x += dx; S.y += dy; S.face = k; } } else S.keys.add(k); }
    else if (e.key === 'Enter' && (document.activeElement === cam || document.activeElement === document.body)) { const n = near(); if (n) { e.preventDefault(); enter(n); } }
  };
  const onUp = (e) => { const k = keyOf(e); if (k) S.keys.delete(k); };
  const onBlur = () => S.keys.clear();
  addEventListener('keydown', onDown); addEventListener('keyup', onUp); addEventListener('blur', onBlur);

  camX = Math.max(0, Math.min(W - cam.clientWidth / scale, S.x - cam.clientWidth / scale / 2)); camY = Math.max(0, Math.min(H - cam.clientHeight / scale, S.y - (cam.clientHeight / scale) * 0.7)); paint();
  raf = requestAnimationFrame(tick);
  return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); removeEventListener('blur', onBlur); };
}

/** 입장 화면용 숲 띠 (나무 실루엣) */
export function forestStrip() {
  const r = rnd(9); const parts = [R(0, 110, 1200, 40, '#7C9F48'), R(0, 106, 1200, 6, '#6D9040')];
  for (let i = 0; i < 22; i++) { const x = i * 56 + r() * 30; const k = r(); const s = 0.6 + k * 0.5; const c = ['#4A7A30', '#628F38', '#3F6B3A'][Math.floor(r() * 3)];
    parts.push(R(x + 18 * s, 90, 10 * s, 36, '#6B4526'), dome(x + 24 * s, 80, 40 * s, 44 * s, c), dome(x + 16 * s, 70, 28 * s, 30 * s, '#7FAE49', true)); }
  return svgWrap(1200, 150, parts.join('')).replace('width="1200" height="150"', 'width="100%" height="100%" preserveAspectRatio="xMidYMax slice"');
}
