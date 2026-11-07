"""상점 아이템 그림 + 캐릭터 시트 → 캐릭터에 입히는 겹침 시트 public/assets/avatar/item-<id>.png (캐릭터와 같은 4×4 규격)
  python3 scripts/make-item-sprites.py
모자·소품은 프레임마다 머리/몸 위치를 찾아 아이템 그림을 얹고, 옷은 셔츠 색만 바꾼다."""
from PIL import Image
import numpy as np, colorsys
FW, FH = 224, 304
base = Image.open('public/assets/avatar/character-walk.png').convert('RGBA'); A = np.array(base)
icon = lambda n: Image.open(f'public/assets/shop/{n}.png').convert('RGBA')
trim = lambda im: im.crop(im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
OUTFIT = {'outfit_cardigan': (154, 91, 44), 'outfit_cape': (58, 62, 128), 'outfit_pilot': (184, 101, 30)}
def frame_info(r, c):
    al = A[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW, 3] > 200; ys, xs = np.where(al); top, bot = ys.min(), ys.max(); H = bot - top
    row = np.where(al[top + max(8, int(0.10 * H))])[0]                      # 머리 윗부분의 폭
    return dict(top=top, bot=bot, H=H, x0=xs.min(), x1=xs.max(), hx=(row.min() + row.max()) / 2, hw=row.max() - row.min() + 1)
def put(sheet, im, r, c, cx, cy_bottom):
    x = int(round(cx - im.width / 2)); y = int(round(cy_bottom - im.height))
    layer = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); layer.paste(im, (x, y), im)          # 프레임 밖은 잘린다
    sheet.alpha_composite(layer, (c * FW, r * FH))
def make(item):
    sheet = Image.new('RGBA', (FW * 4, FH * 4), (0, 0, 0, 0))
    for r in range(4):
        for c in range(4):
            f = frame_info(r, c)
            if item.startswith('hat_'):
                im = trim(icon(item)); w = int(f['hw'] * (1.0 if item != 'hat_crown' else 0.95)); im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
                put(sheet, im, r, c, f['hx'], f['top'] + int(f['hw'] * 0.30))
            elif item.startswith('acc_'):
                im = trim(icon(item)); h = int(f['H'] * 0.24); im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
                side = 1 if r in (0, 2, 3) else -1                                   # 정면·오른쪽·뒤: 몸의 오른쪽(화면 기준), 왼쪽 향함: 왼쪽
                cx = (f['x0'] + f['x1']) / 2 + side * 0.30 * (f['x1'] - f['x0']); put(sheet, im, r, c, cx, f['top'] + int(f['H'] * 0.74))
            else:                                                                       # 옷: 셔츠 색만 바꾼 겹침
                tr = OUTFIT[item]; blk = A[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW].copy(); out = np.zeros_like(blk)
                y0, y1 = f['top'] + int(0.34 * f['H']), f['top'] + int(0.68 * f['H'])
                for y in range(y0, min(y1, FH)):
                    for x in range(FW):
                        p = blk[y, x]
                        if p[3] < 200: continue
                        h_, s_, v_ = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255); gr = p[1] / max(1, p[0])
                        if gr >= 0.82 and p[0] >= 120 and s_ <= 0.52 and h_ <= 0.17:        # 베이지 셔츠는 G/R이 높다(≈0.89). 피부는 ≈0.70~0.78, 가방·바지는 채도가 훨씬 높다
                            k = max(0.45, min(1.15, v_ / 0.85)); out[y, x] = [min(255, int(tr[0] * k)), min(255, int(tr[1] * k)), min(255, int(tr[2] * k)), 255]
                sheet.alpha_composite(Image.fromarray(out), (c * FW, r * FH))
    sheet.save(f'public/assets/avatar/item-{item}.png'); print(item)
for it in ['hat_scholar', 'hat_beret', 'hat_crown', 'outfit_cardigan', 'outfit_cape', 'outfit_pilot', 'acc_quill', 'acc_bookrest', 'acc_rose']: make(it)
