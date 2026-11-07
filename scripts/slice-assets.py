"""에셋 시트(3×3)를 칸별 투명 PNG로 자른다.  python3 scripts/slice-assets.py <상점시트> <종류아이콘시트>
- 흰 배경만 투명하게(캐릭터·물건 안의 흰색은 보존), 칸마다 여백을 잘라 정사각 캔버스에 가운데 정렬한다."""
import sys
from PIL import Image, ImageDraw
import numpy as np

def clear_bg(im, thresh=40):
    im = im.convert('RGBA'); w, h = im.size
    for (x, y) in [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)]:
        if im.getpixel((x, y))[3] != 0: ImageDraw.floodfill(im, (x, y), (255, 255, 255, 0), thresh=thresh)
    return im

def slice_grid(path, names, out_dir, size):
    src = Image.open(path).convert('RGBA'); W, H = src.size; cw, ch = W / 3, H / 3
    for i, name in enumerate(names):
        r, c = divmod(i, 3)
        cell = src.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
        cell = clear_bg(cell)
        a = np.array(cell)
        # 가장자리의 흰 후광 제거
        alpha = a[..., 3] > 0; pad = np.pad(alpha, 1); inner = pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
        near = (a[..., 0] > 225) & (a[..., 1] > 225) & (a[..., 2] > 225); a[alpha & ~inner & near, 3] = 0
        cell = Image.fromarray(a); bb = cell.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox(); cell = cell.crop(bb)
        s = (size - 8) / max(cell.size); cell = cell.resize((max(1, round(cell.width * s)), max(1, round(cell.height * s))), Image.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0)); canvas.paste(cell, ((size - cell.width) // 2, (size - cell.height) // 2), cell)
        canvas.save(f'{out_dir}/{name}.png'); print(name, cell.size)

SHOP = ['hat_scholar', 'hat_beret', 'hat_crown', 'outfit_cardigan', 'outfit_cape', 'outfit_pilot', 'acc_quill', 'acc_bookrest', 'acc_rose']
KINDS = ['oneline', 'review', 'fanart', 'goods', 'cosplay', 'sidestory', 'webnovel', 'webtoon', 'other']
slice_grid(sys.argv[1], SHOP, 'public/assets/shop', 256)
slice_grid(sys.argv[2], KINDS, 'public/assets/kinds', 128)
