"""상점 아이템 그림 + 캐릭터 시트 → 모자·소품 겹침 시트 public/assets/avatar/item-<id>.png (캐릭터와 같은 4×4 규격)
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
def torso_rows(blk, f):
    """몸통 가로 띠: 아래는 바지가 시작하는 줄, 위는 그보다 몸 높이의 27% 위(턱·목 아래)."""
    al = blk[..., 3] > 200; cx = int((f['x0'] + f['x1']) / 2); start = None
    for y in range(f['top'] + int(0.55 * f['H']), f['bot']):
        seg = blk[y, max(0, cx - 22):cx + 22]; dark = [(q[3] > 200) and colorsys.rgb_to_hsv(q[0] / 255, q[1] / 255, q[2] / 255)[2] < 0.45 for q in seg]
        if sum(dark) >= 8: start = y; break
    start = start or f['top'] + int(0.64 * f['H'])
    return start - int(0.225 * f['H']), start + int(0.045 * f['H'])
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
            else:                                                                       # 옷: 몸통 영역을 통째로 칠한다(색으로 셔츠를 가려내면 피부색과 겹쳐 얼룩이 생긴다)
                tr = OUTFIT[item]; blk = A[r * FH:(r + 1) * FH, c * FW:(c + 1) * FW].copy(); out = np.zeros_like(blk)
                y0, y1 = torso_rows(blk, f)
                for y in range(y0, y1):
                    for x in range(FW):
                        p = blk[y, x]
                        if p[3] < 200: continue
                        h_, s_, v_ = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
                        if s_ >= 0.62 or v_ < 0.5: continue                      # 머리카락·가방·바지·그림자(진한 색)는 그대로 둔다
                        k = 0.78 + 0.45 * (v_ - 0.55)                            # 원래 명암을 살짝만 남겨 한 가지 천처럼 보이게
                        out[y, x] = [max(0, min(255, int(tr[0] * k))), max(0, min(255, int(tr[1] * k))), max(0, min(255, int(tr[2] * k))), 255]
                sheet.alpha_composite(Image.fromarray(out), (c * FW, r * FH))
    sheet.save(f'public/assets/avatar/item-{item}.png'); print(item)
# 옷(outfit_*)은 덧칠하지 않고 '옷 입은 캐릭터 시트'(character-<id>.png)를 따로 그려 쓴다. 여기서는 모자·소품만 만든다.
for it in ['hat_scholar', 'hat_beret', 'hat_crown', 'acc_quill', 'acc_bookrest', 'acc_rose']: make(it)
