import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const DEMO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo');
// 1차 MVP 기본 카탈로그. 외부 도서 API가 없거나 실패해도 탐색/검색이 동작하도록 한다.
// cover는 Open Library ISBN 표지를 사용하며, 로드 실패 시 화면에서 자동 생성 표지로 대체한다.
export const CATEGORIES = ['고전문학', '인문학', '철학', '소설', '사회/역사', '과학/예술', '기타'];

const b = (isbn, title, author, publisher, category, description) => ({ isbn, title, author, publisher, category, description });

export const SEED_BOOKS = [
  b('9780547928227', '호빗', 'J.R.R. 톨킨', '아르테', '판타지', '평화로운 마을의 호빗 빌보가 난쟁이들과 함께 용이 지키는 보물을 찾아 떠나는 모험.'),
  b('9780590353427', '해리 포터와 마법사의 돌', 'J.K. 롤링', '문학수첩', '판타지', '평범한 소년이 자신이 마법사임을 알게 되고 호그와트에 입학하며 시작되는 이야기.'),
  b('9780441013593', '듄', '프랭크 허버트', '황금가지', 'SF', '사막 행성 아라키스를 둘러싼 권력과 생태, 신화적 예언의 서사시.'),
  b('9780451524935', '1984', '조지 오웰', '민음사', 'SF', '감시와 통제가 일상이 된 전체주의 사회를 그린 디스토피아 고전.'),
  b('9780156013987', '어린 왕자', '앙투안 드 생텍쥐페리', '열린책들', '소설', '사막에 불시착한 조종사가 작은 별에서 온 왕자를 만나 나누는 이야기.'),
  b('9780141439518', '오만과 편견', '제인 오스틴', '민음사', '로맨스', '사랑과 신분, 편견을 재치 있게 풀어낸 영국 로맨스의 고전.'),
  b('9780486282114', '프랑켄슈타인', '메리 셸리', '문학동네', 'SF', '생명을 창조한 과학자와 그가 만든 존재의 비극.'),
  b('9780486275437', '이상한 나라의 앨리스', '루이스 캐럴', '인디고', '판타지', '토끼굴로 떨어진 앨리스가 만나는 엉뚱하고 환상적인 세계.'),
  b('9780743273565', '위대한 개츠비', 'F. 스콧 피츠제럴드', '민음사', '소설', '1920년대 미국, 한 남자의 이루지 못한 사랑과 화려한 파티.'),
  b('9780062693662', '오리엔트 특급 살인 사건', '애거서 크리스티', '황금가지', '미스터리', '눈에 갇힌 기차 안에서 벌어진 살인, 탐정 푸아로의 추리.'),
  b('9780062316110', '사피엔스', '유발 하라리', '김영사', '역사', '인류가 어떻게 지구의 지배자가 되었는지를 큰 흐름으로 짚는 역사서.'),
  b('9780345539434', '코스모스', '칼 세이건', '사이언스북스', '과학', '우주와 인간의 자리를 사유하게 만드는 교양 과학의 고전.'),
  b('9780553380163', '시간의 역사', '스티븐 호킹', '까치', '과학', '빅뱅부터 블랙홀까지, 우주론을 쉽게 풀어 쓴 책.'),
  b('9780553213690', '변신', '프란츠 카프카', '민음사', '소설', '어느 날 아침 벌레로 변해 버린 남자와 그의 가족 이야기.'),
  b('9780140449136', '죄와 벌', '표도르 도스토옙스키', '열린책들', '소설', '한 청년의 범죄와 죄의식, 구원에 대한 치열한 심리 소설.'),
  b('9780679783275', '앵무새 죽이기', '하퍼 리', '문예출판사', '소설', '편견과 정의를 어린 시선으로 바라본 미국 남부의 이야기.'),
  b('9780316769488', '호밀밭의 파수꾼', 'J.D. 샐린저', '민음사', '청소년', '방황하는 소년 홀든이 뉴욕에서 보낸 며칠.'),
  b('9780061120084', '앵무새 죽이기 (원서)', 'Harper Lee', 'Harper', '소설', ''),
  b('9780439023481', '헝거 게임', '수잔 콜린스', '북폴리오', '청소년', '생존 경기에 자원한 소녀 캣니스의 이야기.'),
  b('9780307474278', '다빈치 코드', '댄 브라운', '문학수첩', '미스터리', '루브르 박물관의 살인 사건에서 시작되는 상징과 비밀의 추적.'),
  b('9780062315007', '연금술사', '파울로 코엘료', '문학동네', '소설', '양치기 소년이 자아의 신화를 찾아 떠나는 여정.'),
  b('9780743269513', '아주 작은 습관의 힘', '제임스 클리어', '비즈니스북스', '자기계발', '작은 습관이 만드는 큰 변화를 설명하는 실용서.'),
  b('', '채식주의자', '한강', '창비', '소설', '어느 날 고기를 먹지 않기로 결심한 여자와 주변 사람들의 이야기.'),
  b('', '소년이 온다', '한강', '창비', '소설', '1980년 5월 광주를 살아낸 사람들의 목소리.'),
  b('', '아몬드', '손원평', '창비', '청소년', '감정을 느끼지 못하는 소년이 세상과 관계 맺는 법을 배우는 성장 소설.'),
  b('', '불편한 편의점', '김호연', '나무옆의자', '소설', '서울 청파동 편의점에서 벌어지는 따뜻한 이웃들의 이야기.'),
  b('', '달러구트 꿈 백화점', '이미예', '팩토리나인', '판타지', '잠든 사람들에게 꿈을 파는 백화점의 이야기.'),
  b('', '종의 기원', '정유정', '은행나무', '미스터리', '악의 기원을 파고드는 심리 스릴러.'),
  b('', '82년생 김지영', '조남주', '민음사', '소설', '평범한 한 여성의 삶을 통해 본 한국 사회.'),
  b('', '토지', '박경리', '다산책방', '역사', '구한말부터 해방까지 이어지는 한국 근현대사의 대하소설.'),
  b('', '향수', '파트리크 쥐스킨트', '열린책들', '미스터리', '완벽한 향기를 찾아 살인을 저지르는 조향사의 이야기.'),
  b('', '나미야 잡화점의 기적', '히가시노 게이고', '현대문학', '미스터리', '시간을 넘어 오가는 고민 상담 편지의 이야기.'),
  b('', '삼국지', '나관중', '민음사', '역사', '후한 말 영웅들의 흥망을 그린 중국 고전 소설.'),
  b('', '난장이가 쏘아올린 작은 공', '조세희', '이성과힘', '소설', '산업화 시대 도시 빈민의 삶을 담은 연작소설.'),
  b('', '언어의 온도', '이기주', '말글터', '시·에세이', '말과 글에 담긴 따뜻함과 차가움에 대한 에세이.'),
  b('', '진짜 나로 살아간다는 것', '김수현', '마음의숲', '자기계발', '나를 이해하고 단단하게 살아가는 방법에 대한 에세이.'),
  b('', '정의란 무엇인가', '마이클 샌델', '와이즈베리', '인문', '일상의 도덕적 딜레마로 풀어 보는 정의의 철학.'),
  b('', '총, 균, 쇠', '재레드 다이아몬드', '문학사상', '역사', '문명의 격차는 어디서 비롯되었는가를 파헤치는 책.'),
  b('', '이기적 유전자', '리처드 도킨스', '을유문화사', '과학', '유전자의 눈으로 진화를 바라보는 고전.'),
  b('', '슬램덩크 1', '이노우에 다케히코', '대원씨아이', '만화·웹툰', '농구를 시작한 불량 소년 강백호의 열정과 성장 이야기.'),
  b('', '미생 1', '윤태호', '위즈덤하우스', '만화·웹툰', '바둑 대신 회사에 들어간 장그래의 직장 생활.'),
  b('', '진달래꽃', '김소월', '문학과지성사', '시·에세이', '한국 근대시의 대표 시집.'),
  b('', '윤동주 시집 하늘과 바람과 별과 시', '윤동주', '소와다리', '시·에세이', '부끄러움과 성찰을 노래한 시인의 대표 시집.'),
];
export const seedCover = (isbn) => (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false` : '');

// 이전 카테고리 → 현재 카테고리
const CLASSICS = new Set(['변신', '위대한 개츠비', '오만과 편견', '프랑켄슈타인', '이상한 나라의 앨리스', '앵무새 죽이기', '호밀밭의 파수꾼', '토지', '삼국지', '난장이가 쏘아올린 작은 공', '향수', '어린 왕자', '죄와 벌']);
const MAP = { '시·에세이': '인문학', 판타지: '소설', SF: '소설', 미스터리: '소설', 로맨스: '소설', 청소년: '소설', 인문: '인문학', 과학: '과학/예술', 자기계발: '인문학', 역사: '사회/역사', '만화·웹툰': '과학/예술' };
const mapCategory = (title, cat) => (CLASSICS.has(title) ? '고전문학' : MAP[cat] || cat);

export function seedBooks(db) {
  const demo = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'seed.json'), 'utf8'));
  const zipTitles = new Set(demo.SEED_BOOKS.map((b) => b.title));
  const ins = db.prepare(`INSERT OR IGNORE INTO books (external_id, isbn, title, author, publisher, cover_url, description, category, source, translator, tags, published_year, page_count)
    VALUES (?,?,?,?,?,?,?,?, 'seed', ?,?,?,?)`);
  if (db.prepare('SELECT COUNT(*) c FROM books').get().c === 0) {
    SEED_BOOKS.forEach((k, i) => {
      if (k.title.includes('(원서)') || zipTitles.has(k.title)) return;
      ins.run(`seed:${i}`, k.isbn || null, k.title, k.author, k.publisher, seedCover(k.isbn), k.description, mapCategory(k.title, k.category), '', '[]', null, null);
    });
  }
  for (const b of demo.SEED_BOOKS) { // 프로토타입의 큐레이션 도서 (없을 때만 추가)
    ins.run(`zip:${b.id}`, b.isbn || null, b.title, b.author, b.publisher || '', b.coverUrl || '', b.description || '', b.category, b.translator || '', JSON.stringify(b.tags || []), b.publishedYear ?? null, b.pageCount ?? null);
  }
}

// 굿즈 기획 데모의 펀딩 관심 현황 (결제 없는 "관심 표시" 모델)
const FUNDING = {
  rec_prince_01: { goal: 100, interest: 61, note: '금속 뱃지 3,900원 · 우드 책갈피 2,500원 예정. 100명이 관심을 보이면 제작사 문의를 시작해요.' },
  rec_cosmos_01: { goal: 80, interest: 53, note: '홀로그램 엽서 세트 4,500원 · 코스터 3,000원 예정. 목표 달성 시 소량 시제품부터 검토해요.' },
};
// 데모 전용 추가 굿즈 기획(실제 사용자 글이 아님)
const EXTRA_GOODS = { user: 'user_stellar', book: 'book_demian', title: '아브락사스 알 모양 무드등 기획서', body: '“새는 알에서 나오려고 투쟁한다.” 구절을 모티프로, 반쯤 깨진 알 안에서 따뜻한 빛이 새어 나오는 탁상 무드등을 기획했어요. 소재는 반투명 레진, 크기 12cm, 밤에 책을 읽을 때 켜 두는 용도예요.', likes: 12, goal: 120, interest: 27, note: '무드등 예상 18,000원 · 한정 수량. 목표 달성 시 제작사 견적부터 받아 볼게요.' };

const KIND_OF = { fanart: 'fanart', goods: 'goods', spinoff: 'sidestory', webtoon: 'webtoon', etc: 'other' };

/** 미리보기용 데모 데이터: 다른 독자 3명과 그들의 공개 기록(팬아트·서평·한 줄 평). DB가 비어 있을 때만 넣는다. */
export function seedDemo(db, uploadDir) {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return;
  const demo = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'seed.json'), 'utf8'));
  const bookId = (zipId) => db.prepare('SELECT id FROM books WHERE external_id = ?').get(`zip:${zipId}`)?.id;
  const uid = {};
  db.exec('BEGIN');
  try {
    for (const u of demo.DEMO_OTHER_USERS) {
      uid[u.id] = db.prepare(`INSERT INTO users (provider, provider_id, nickname, interests, onboarded, points, inventory, avatar, bio) VALUES ('demo',?,?,?,1,?,?,?,?)`)
        .run(u.id, u.nickname, JSON.stringify(u.interestedCategories), u.points, JSON.stringify(u.inventory), JSON.stringify(u.avatar), u.bio).lastInsertRowid;
      for (const b of u.interestedBookIds) { const id = bookId(b); if (id) db.prepare('INSERT OR IGNORE INTO shelf (user_id, book_id) VALUES (?,?)').run(uid[u.id], id); }
    }
    const insC = db.prepare(`INSERT INTO contents (user_id, book_id, kind, title, body, visibility, created_at, updated_at, published_at, base_likes, funding_goal, funding_note, base_interest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insA = db.prepare('INSERT INTO attachments (content_id, stored_name, mime, size, alt, external_url) VALUES (?,?,?,?,?,?)');
    for (const r of demo.INITIAL_RECORDS) {
      const u = uid[r.userId]; const b = bookId(r.bookId); if (!u || !b) continue;
      const kind = r.type === 'creation' ? KIND_OF[r.creationCategory] || 'other' : r.type === 'review' ? 'review' : 'oneline';
      const at = r.createdAt.replace('T', ' ').replace('Z', '');
      const id = insC.run(u, b, kind, r.title || '', r.content || '', r.isPublic ? 'public' : 'private', at, at, r.isPublic ? at : null, r.likesCount || 0, FUNDING[r.id]?.goal || 0, FUNDING[r.id]?.note || '', FUNDING[r.id]?.interest || 0).lastInsertRowid;
      if (r.imageUrl) {
        if (r.imageUrl.startsWith('http')) insA.run(id, '', 'image/jpeg', 0, r.title, r.imageUrl);
        else { // 번들된 데모 이미지를 업로드 폴더로 복사
          const src = path.join(DEMO_DIR, r.imageUrl.includes('demian') ? 'demian.jpg' : 'prince.jpg'); const name = `${crypto.randomUUID()}.jpg`;
          fs.copyFileSync(src, path.join(uploadDir, name)); insA.run(id, name, 'image/jpeg', fs.statSync(src).size, r.title, '');
        }
      }
    }
    const eg = EXTRA_GOODS; const gu = uid[eg.user]; const gb = bookId(eg.book);
    if (gu && gb) { const at = '2026-10-28 10:00:00'; insC.run(gu, gb, 'goods', eg.title, eg.body, 'public', at, at, at, eg.likes, eg.goal, eg.note, eg.interest); }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
