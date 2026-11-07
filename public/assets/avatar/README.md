# 캐릭터 이미지

코드 수정 없이 파일만 넣으면 바뀐다(새로고침). 규격과 이미지 생성 요청문은 [`docs/ASSETS.md`](../../../docs/ASSETS.md) 9장.

| 파일 | 내용 |
|---|---|
| `character-walk.png` | 기본 캐릭터 4×4 시트(896×1216, 칸 224×304). 행 = 아래·왼쪽·오른쪽·위, 열 = 걷기 4프레임. 머리 위 56px 여유 |
| `character-<옷id>.png` | **옷 입은 캐릭터 시트**(위와 같은 규격). 그 옷을 입으면 기본 시트 대신 몸 전체가 이 시트로 바뀐다. 옷 id: `outfit_cardigan` `outfit_cape` `outfit_pilot` |
| `item-<모자·소품id>.png` | 모자·소품 겹침 시트(같은 4×4). 캐릭터 위에 얹힌다. id: `hat_scholar` `hat_beret` `hat_crown` `acc_quill` `acc_bookrest` `acc_rose` |

- 옷 시트가 없는 옷은 기본 캐릭터가 그대로 보이고, 상점에 "그림은 준비 중" 안내가 뜬다(색으로 덧칠하지 않는다).
- 모자·소품 겹침 시트는 `python3 scripts/make-item-sprites.py`로 상점 아이콘에서 자동 생성한다.
- 피부색 선택은 이미지 캐릭터에 적용되지 않는다.
