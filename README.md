# BookRest (북레스트)

독서 기록과 책 기반 창작물을 모으고, 공개한 내용을 나누는 픽셀 도서관 웹앱. 기획은 [`BookRest_PRD.md`](./BookRest_PRD.md)를 따르며, 이 저장소는 **1차 MVP**(PRD 3장)를 구현한다.

## 실행

Node.js 22.13+ 필요 (내장 `node:sqlite` 사용, 네이티브 빌드 없음).

```bash
npm install
npm start            # http://localhost:3000
npm test             # PRD 10장 검수 기준 통합 테스트
```

개발 모드에서는 입장 화면의 **개발용 간편 로그인**으로 바로 들어갈 수 있다(`운영자로 입장`은 신고 검토 화면용). 운영 배포 시 `NODE_ENV=production`이면 꺼진다.

## 환경 변수

| 변수 | 설명 |
|---|---|
| `PORT` | 기본 3000 |
| `BASE_URL` | OAuth 콜백 기준 주소 (예: `https://bookrest.example`) |
| `OAUTH_{GOOGLE,KAKAO,NAVER}_CLIENT_ID` / `_CLIENT_SECRET` | 설정한 사업자의 로그인 버튼이 나타난다. 콜백: `{BASE_URL}/api/auth/{provider}/callback` |
| `ADMIN_USERS` | 운영자 지정. `google:1234,kakao:5678` 형식 |
| `DEV_LOGIN` | `1`/`0`으로 개발용 로그인 강제 |
| `BOOKS_PROVIDER` | `local`이면 외부 도서 API를 쓰지 않음 |
| `GOOGLE_BOOKS_API_KEY` | Google Books 호출 한도 상향 (없으면 익명 쿼터) |
| `DB_PATH`, `UPLOAD_DIR` | 기본 `./data/` |

## PRD 미결정 사항에 대해 적용한 기본값

| PRD 13장 | 적용 | 바꾸는 곳 |
|---|---|---|
| 로그인 사업자 | 구글·카카오·네이버 모두 지원, 키를 설정한 것만 노출 | `server/oauth.js` |
| 비로그인 열람 | 불가(입장 화면 소개만 공개). 외부 링크 공유 없음 | `requireUser` |
| 도서 정보 출처 | Google Books 검색 결과를 로컬 DB에 캐시 + 내장 시드 카탈로그. 외부 실패 시 안내 후 로컬 결과로 대체. 표지는 Open Library(ISBN) 또는 실패 시 자동 생성 표지 | `server/books.js`, `server/seed.js` |
| 책장 삭제 시 기록 | 사용자가 선택: 비공개로 보관(다시 꽂으면 복원) / 함께 삭제 | `DELETE /api/shelf/:id?records=` |
| 이미지 제한 | PNG·JPG·WEBP·GIF, 5MB, 콘텐츠당 4장, 서버에서 매직 바이트 검증. 본문 1만 자(한 줄 평 300자) | `LIMITS` in `server/app.js` |
| 공개 기본값·랭킹 | 기본 비공개. 랭킹은 책별 공개 2차 창작물, 좋아요 ≥1, 좋아요순 → 먼저 공개된 순, 상위 3 | `GET /api/books/:id` |
| 본인 작품 좋아요 | 차단(순위 조작 방지) — PRD에 명시 없음 | `PUT /api/contents/:id/like` |
| 계정 삭제 | 본인 기록·파일·좋아요·책장 즉시 삭제 | `DELETE /api/me` |

## 구현 범위

1차 MVP 전부: SNS 로그인, 닉네임·관심 분야(건너뛰기 가능), 마을 홈(숲속 마을을 자유롭게 걸어 다니는 3/4 시점 픽셀 맵 + 동일 기능의 메뉴 목록, 준비 중 건물 안내), 책 검색·장르 탐색·관심 분야 추천, 책 상세, 내 책장/책별 포트폴리오, 한 줄 평·서평·2차 창작(이미지) 작성·수정·삭제, 개별 공개 설정, 공개 서재, 좋아요·TOP 3, 신고·운영자 검토·숨김·작성자 안내, 계정 삭제.

접근 제어는 모두 서버에서 검사한다. 비공개·숨김 콘텐츠와 그 첨부 파일은 작성자(및 운영자)만 열 수 있고, 공개→비공개 전환·삭제는 목록·랭킹·직접 주소·파일에 즉시 반영된다.

**미구현(2차 이후)**: 댓글, 구독·알림, 작가·출판사 필터, 카테고리별 공간, 연재, 굿즈·대회·출판 지원.

## 구조

```
server/   Express API (app.js), SQLite 스키마(db.js), 도서 제공자(books.js), OAuth(oauth.js), 시드(seed.js)
public/   빌드 없는 해시 라우터 SPA (index.html, app.js, style.css, village.js)
public/assets/village/  마을 이미지 에셋 자리 — 규격은 docs/ASSETS.md
docs/     DESIGN.md(디자인 가이드), ASSETS.md(이미지 에셋 목록·요청문)
tests/    node:test 통합 테스트 — PRD 10장 검수 기준 1~7 및 권한·업로드·계정 삭제
```

## 운영 전 확인할 것

- 이용 약관·개인정보 처리방침·미성년자 보호·저작권 침해 신고 접수 절차(PRD 5.7)는 코드로 대체할 수 없는 정책 항목이다.
- 업로드 파일은 로컬 디스크(`UPLOAD_DIR`)에 저장된다. 다중 인스턴스 배포 시 오브젝트 스토리지로 교체하고 백업 절차를 마련한다. OAuth `state` 저장소도 단일 인스턴스 메모리다.
- 로그인·업로드에 대한 요청 빈도 제한은 아직 없다(리버스 프록시 또는 미들웨어로 추가).

## 디자인과 마을 이미지

- 디자인 기준: [`docs/DESIGN.md`](docs/DESIGN.md) — 갈색·초록 메인 컬러, 노을 숲 마을 콘셉트.
- 이미지 에셋 목록과 요소별 생성 요청문: [`docs/ASSETS.md`](docs/ASSETS.md). `public/assets/village/`에 규격에 맞는 PNG를 넣으면 자동으로 교체되고, 없는 파일은 코드로 그린 기본 도트가 나온다.
- 마을 조작: 방향키/WASD 걷기, 건물 앞에서 Enter, 땅·건물 클릭/탭 이동. `prefers-reduced-motion`이면 애니메이션 없이 즉시 이동.
