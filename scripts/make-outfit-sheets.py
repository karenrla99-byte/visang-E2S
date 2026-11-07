"""옷 입은 캐릭터 그림(4×4) → public/assets/avatar/character-<옷id>.png
  python3 scripts/make-outfit-sheets.py outfit_cardigan=<그림> outfit_cape=<그림> ...
기본 시트(character-walk.png)와 같은 규격(896×1216, 칸 224×304)으로 맞춘다: 흰 배경 제거, 기본 시트와 같은 배율, 발 높이 고정,
그리고 칸마다 머리 중심을 기본 시트와 같은 자리에 정렬한다(모자·소품 겹침 시트가 옷과 상관없이 맞도록)."""
import sys
from PIL import Image, ImageDraw
import numpy as np
FW, FH = 224, 304
base = np.array(Image.open('public/assets/avatar/character-walk.png').convert('RGBA'))
def info(a):                         # 한 칸(RGBA 배열)의 머리 위치와 몸 높이
    al = a[..., 3] > 200; ys, xs = np.where(al); top, bot = ys.min(), ys.max(); H = bot - top
    row = np.where(al[top + max(8, int(0.10 * H))])[0]; return top, bot, H, (row.min() + row.max()) / 2
binfo = [info(base[(i // 4) * FH:(i // 4 + 1) * FH, (i % 4) * FW:(i % 4 + 1) * FW]) for i in range(16)]
base_maxH = max(b[2] for b in binfo)

def solid_bbox(img, min_px=4):
    """잡티(몇 픽셀짜리 얼룩)를 무시하고 캐릭터가 있는 가로·세로 범위를 찾는다."""
    al = np.array(img)[..., 3] > 20; rows = np.where(al.sum(1) >= min_px)[0]; cols = np.where(al.sum(0) >= min_px)[0]
    return (int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1)

def clear_bg(img, thresh=42):
    w, h = img.size
    for sx in range(0, w, max(1, w // 16)):
        for (x, y) in [(sx, 1), (sx, h - 2)]:
            if img.getpixel((x, y))[3] != 0: ImageDraw.floodfill(img, (x, y), (255, 255, 255, 0), thresh=thresh)
    for sy in range(0, h, max(1, h // 16)):
        for (x, y) in [(1, sy), (w - 2, sy)]:
            if img.getpixel((x, y))[3] != 0: ImageDraw.floodfill(img, (x, y), (255, 255, 255, 0), thresh=thresh)
    a = np.array(img); al = a[..., 3] > 0; pad = np.pad(al, 1); inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    near = (a[..., 0] > 225) & (a[..., 1] > 225) & (a[..., 2] > 225); a[al & ~inner & near, 3] = 0; return Image.fromarray(a)

def bands(profile, n, min_px=3):
    """투영(줄/열별 불투명 픽셀 수)에서 캐릭터가 있는 구간 n개를 찾는다. 균등 격자가 아니어도 된다."""
    on = profile >= min_px; runs = []; start = None
    for i, v in enumerate(on):
        if v and start is None: start = i
        if not v and start is not None: runs.append([start, i]); start = None
    if start is not None: runs.append([start, len(on)])
    while len(runs) > n:                                                    # 너무 많으면 가장 가까운 두 구간을 합친다(잡티·분리된 조각)
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]; k = int(np.argmin(gaps)); runs[k][1] = runs[k + 1][1]; del runs[k + 1]
    return runs

for arg in sys.argv[1:]:
    oid, path = arg.split('=', 1); src = Image.open(path).convert('RGBA')
    if np.array(src)[..., 3].min() > 0: src = clear_bg(src)                 # 투명 배경이 아니면 흰 배경을 지운다
    al = np.array(src)[..., 3] > 20; rb = bands(al.sum(1), 4); assert len(rb) == 4, f'줄 구간 {len(rb)}개'
    cells = []
    for (y0, y1) in rb:
        cb = bands(al[y0:y1].sum(0), 4); assert len(cb) == 4, f'칸 구간 {len(cb)}개'
        for (x0, x1) in cb:
            cell = src.crop((x0, y0, x1, y1)); cells.append(cell.crop(solid_bbox(cell)))
    sc = base_maxH / max(c.height for c in cells)                          # 기본 시트와 같은 키
    sheet = Image.new('RGBA', (FW * 4, FH * 4), (0, 0, 0, 0))
    for i, f in enumerate(cells):
        r, c = divmod(i, 4); f = f.resize((max(1, round(f.width * sc)), max(1, round(f.height * sc))), Image.LANCZOS)
        a = np.array(f); al = a[..., 3] > 120; rows = np.where(al.sum(1) >= 4)[0]; top = rows.min(); Hh = rows.max() - top
        row = np.where(al[top + max(8, int(0.10 * Hh))])[0]; hx = (row.min() + row.max()) / 2
        bottom = binfo[i][1] + 1                                            # 기본 시트와 같은 발 높이
        x = int(round(binfo[i][3] - hx)); y = bottom - f.height
        layer = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); layer.paste(f, (x, y), f); sheet.alpha_composite(layer, (c * FW, r * FH))
    out = f'public/assets/avatar/character-{oid}.png'; sheet.save(out, optimize=True); print(out, sheet.size, 'scale', round(sc, 3))
