// 픽셀 아바타: 피부색과 상점 아이템(모자·옷·소품)이 그림에 반영된다. 에셋 이미지가 없어도 코드로 그린다.
const INK = '#2B1D12';
const FRONT = ['....hhhhhh....', '..hhhhhhhhhh..', '.hhhhhhhhhhhh.', '.hhsssssssshh.', '.hhsssssssshh.', '.hssksssskssh.', '.hsspsssspssh.', '..hssssssssh..', '....ssssss....', '...bbbbbbbb...', '..bbbbbbbbbb..', '.sbbbbbbbbbbs.', '.sbbbbbbbbbbs.', '..bbbbbbbbbb..', '..gggggggggg..', '..gggg..gggg..', '..gggg..gggg..', '..wwww..wwww..', '..wwww..wwww..'];
const BACK = ['....hhhhhh....', '..hhhhhhhhhh..', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '.hhhhhhhhhhhh.', '..hhhhhhhhhh..', '....hhhhhh....', '...bbbbbbbb...', '..bbyyyyyybb..', '.sbbyyyyyybbs.', '.sbbyyyyyybbs.', '..bbyyyyyybb..', '..gggggggggg..', '..gggg..gggg..', '..gggg..gggg..', '..wwww..wwww..', '..wwww..wwww..'];

// 상점 아이템의 모양 (id는 server/shop.js와 같다). 겹쳐 그릴 줄과 색.
export const LOOK = {
  hat_scholar: { rows: { 0: '..cccccccccc..', 1: '.cccccccccccc.', 2: '.hcccccccccch.' }, dots: [[2, 12, 'g'], [3, 12, 'g'], [4, 12, 'g']], pal: { c: '#4B5563', g: '#E0B13A' } },
  hat_beret: { rows: { 0: '....rrrrrr....', 1: '..rrrrrrrrrr..', 2: '.rrrrrrrrrrrr.' }, pal: { r: '#9F1239' } },
  hat_crown: { rows: { 0: '..g..g..g..g..', 1: '..gggggggggg..' }, pal: { g: '#E0A21F' } },
  outfit_cardigan: { color: '#9A5B2C' }, outfit_cape: { color: '#2E4FA3' }, outfit_pilot: { color: '#B8651E' },
  acc_quill: { dots: [[7, 13, 'f'], [8, 13, 'f'], [9, 13, 'q'], [10, 13, 'q'], [11, 13, 'q'], [12, 13, 'q']], pal: { f: '#FFFFFF', q: '#8A8F9A' } },
  acc_bookrest: { dots: [[12, 4, 'a'], [12, 5, 'a'], [12, 6, 'a'], [12, 7, 'a'], [12, 8, 'a'], [12, 9, 'a'], [13, 4, 'A'], [13, 5, 'A'], [13, 6, 'A'], [13, 7, 'A'], [13, 8, 'A'], [13, 9, 'A']], pal: { a: '#F2D9A0', A: '#B7791F' }, front: true },
  acc_rose: { dots: [[9, 13, 'R'], [10, 13, 'l'], [11, 13, 'l']], pal: { R: '#DC2626', l: '#2F7A3F' } },
};
const shade = (hex, k) => `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('')}`;

/** 아바타를 SVG 문자열로. face: 'up'이면 뒷모습. px: 도트 한 칸 크기(없으면 100% 크기). */
export function avatarSvg(avatar = {}, face = 'down', px) {
  const rows = (face === 'up' ? BACK : FRONT).map((r) => r.split(''));
  const pal = { h: '#5A3A22', s: avatar.skin || '#FBD3AC', k: INK, p: '#F4A7A0', b: '#E8C16A', y: '#D79A3A', g: '#4A4034', w: '#F4EDE0' };
  const outfit = LOOK[avatar.outfit]; if (outfit?.color) { pal.b = outfit.color; pal.y = shade(outfit.color, 0.78); }
  const apply = (id) => {
    const it = LOOK[id]; if (!it) return; Object.assign(pal, it.pal || {});
    if (it.front && face === 'up') return;
    for (const [r, str] of Object.entries(it.rows || {})) [...str].forEach((c, x) => { if (c !== '.' && rows[r][x] !== undefined) rows[r][x] = c === 'h' ? rows[r][x] : c; });
    for (const [r, x, c] of it.dots || []) if (rows[r]?.[x] !== undefined) rows[r][x] = c;
  };
  apply(avatar.hat); apply(avatar.accessory);
  const rects = [];
  rows.forEach((r, y) => r.forEach((c, x) => { if (pal[c]) rects.push(`<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${pal[c]}"/>`); }));
  const size = px ? `width="${14 * px}" height="${19 * px}"` : 'width="100%" height="100%"';
  return `<svg viewBox="0 0 14 19" ${size} shape-rendering="crispEdges" role="img" aria-label="내 캐릭터" class="avsvg">${rects.join('')}</svg>`;
}
