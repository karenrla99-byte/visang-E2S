# 마을 이미지 에셋

이 폴더에 아래 이름으로 PNG를 넣으면 숲 마을이 자동으로 교체된다. **없는 파일은 코드로 그린 기본 도트가 대신 나온다.** 하나씩만 넣어도 된다.
**자세한 규격과 이미지 생성 요청문은 [`docs/ASSETS.md`](../../../docs/ASSETS.md)**, 디자인 기준은 [`docs/DESIGN.md`](../../../docs/DESIGN.md).

| 파일 | 크기(권장) | 내용 |
|---|---|---|
| `character-walk.png` | 448×608 | 4열×4행. 행 순서 **아래·왼쪽·오른쪽·위**, 한 행 4프레임 걷기, 발이 아래 가장자리에 닿게 |
| `building-library.png` | 1040×800 | 대도서관 |
| `building-shelf.png` | 720×600 | 내 서재 |
| `building-art.png` | 1140×810 | 미술관(준비 중) |
| `building-writing.png` | 750×600 | 글 작업실(준비 중) |
| `building-webtoon.png` | 750×600 | 웹툰 공간(준비 중) |
| `building-goods.png` | 780×600 | 굿즈 상점(준비 중) |
| `backdrop.png` | 2400×360 | 노을 하늘 + 먼 언덕·소나무 (아래 끝이 풀밭 시작선) |
| `ground-tile.png` | 256×256 | 이음새 없는 풀밭 타일 (128px로 표시) |
| `plaza.png` | 640×380 | 타원형 돌 광장, 바깥 투명 |
| `tree-1.png` `tree-2.png` `tree-3.png` | 480×600 / 570×630 / 360×600 | 참나무 / 큰 참나무 / 소나무, 밑동이 아래 가운데 |
| `decor-bench.png` `decor-lamp.png` `decor-sign.png` `decor-bush.png` `decor-rock.png` `decor-fence.png` `decor-banner.png` `decor-flowerbed.png` `decor-bridge.png` | 3× 해상도 | 벤치·등불·책 팻말·덤불·바위·울타리·현수막·꽃밭·돌다리 |

- 건물·나무·소품은 **투명 PNG**, 밑바닥이 이미지 아래 가장자리에 닿게 자른다. 건물은 표시 높이가 고정이고 너비는 그림 비율로 정해진다.
- 길과 개울은 코드로 그린다(색·위치는 `public/village.js`).
- 그림에 글자를 넣지 않는다. 간판·안내는 코드가 얹는다.
- 도트가 번지지 않도록 `image-rendering: pixelated`로 표시한다.
