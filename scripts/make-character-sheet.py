"""캐릭터 원본(4×4 시트 이미지) → public/assets/avatar/character-walk.png
  python3 scripts/make-character-sheet.py <원본> [출력]
흰 배경을 투명하게 하고, 모든 프레임을 같은 배율·발 높이·가로 중심으로 맞춘다. 모자를 얹을 머리 위 여유(HEADROOM)를 둔다."""
import sys
from PIL import Image, ImageDraw
import numpy as np
FW, FH, HEAD_H = 224, 304, 244   # 프레임 크기, 캐릭터 최대 높이(위쪽 여유 = FH-4-HEAD_H = 56px)
src = Image.open(sys.argv[1]).convert('RGBA'); out = sys.argv[2] if len(sys.argv) > 2 else 'public/assets/avatar/character-walk.png'
W, H = src.size; cw, ch = W / 4, H / 4; img = src.copy()
for r in range(4):
    for c in range(4):
        for (x, y) in [(int(c * cw) + 2, int(r * ch) + 2), (int((c + 1) * cw) - 3, int(r * ch) + 2), (int(c * cw) + 2, int((r + 1) * ch) - 3), (int((c + 1) * cw) - 3, int((r + 1) * ch) - 3)]:
            if img.getpixel((x, y))[3] != 0: ImageDraw.floodfill(img, (x, y), (255, 255, 255, 0), thresh=42)
a = np.array(img); near = (a[..., 0] > 225) & (a[..., 1] > 225) & (a[..., 2] > 225); al = a[..., 3] > 0; pad = np.pad(al, 1)
a[al & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]) & near, 3] = 0; img = Image.fromarray(a)
cells = []
for r in range(4):
    for c in range(4):
        cell = img.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch))); bb = cell.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox(); cells.append((cell, bb))
mh = max(b[3] - b[1] for _, b in cells); mw = max(b[2] - b[0] for _, b in cells); sc = min(HEAD_H / mh, (FW - 12) / mw)
sheet = Image.new('RGBA', (FW * 4, FH * 4), (0, 0, 0, 0))
for i, (cell, bb) in enumerate(cells):
    r, c = divmod(i, 4); f = cell.crop(bb); f = f.resize((max(1, round(f.width * sc)), max(1, round(f.height * sc))), Image.LANCZOS)
    al = np.array(f)[..., 3].astype(float); cx = (al.sum(0) * np.arange(al.shape[1])).sum() / max(1, al.sum())
    sheet.paste(f, (c * FW + int(round(FW / 2 - cx)), r * FH + FH - 4 - f.height), f)
sheet.save(out); print(out, sheet.size, 'scale', round(sc, 3))
