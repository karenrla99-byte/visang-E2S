// PRD 10장 "1차 출시 검수 기준"을 API 수준에서 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, PNG, form } from './helpers.js';

const setup = async (opts) => {
  const s = await startServer(opts);
  const mk = async (name, admin) => { const c = new Client(s.base); c.user = await c.login(name, admin); return c; };
  return { ...s, mk };
};

test('1. 관심 분야 선택/건너뛰기 후 시작', async () => {
  const s = await setup();
  const a = await s.mk('앨리스');
  assert.equal(a.user.onboarded, false);
  let r = await a.patch('/api/me', { nickname: '앨리스', interests: ['판타지', 'SF', '없는분야'] });
  assert.deepEqual(r.data.user.interests, ['판타지', 'SF']);
  assert.equal(r.data.user.onboarded, true);
  const b = await s.mk('밥');
  r = await b.patch('/api/me', { nickname: '밥' }); // 건너뛰기
  assert.deepEqual(r.data.user.interests, []);
  const rec = await b.get('/api/books/recommended');
  assert.ok(rec.data.books.length >= 8, '관심 분야 없이도 기본 목록');
  const rec2 = await a.get('/api/books/recommended');
  assert.ok(['판타지', 'SF'].includes(rec2.data.books[0].category));
  await s.close();
});

test('2. 제목/작가 검색, 책장 중복 방지', async () => {
  const s = await setup();
  const a = await s.mk('앨리스');
  let r = await a.get('/api/books?q=' + encodeURIComponent('호빗'));
  assert.equal(r.data.books[0].title, '호빗');
  r = await a.get('/api/books?q=' + encodeURIComponent('한강'));
  assert.ok(r.data.books.length >= 2);
  r = await a.get('/api/books?q=' + encodeURIComponent('존재하지않는책zzz'));
  assert.equal(r.data.books.length, 0);
  const id = (await a.get('/api/books?q=' + encodeURIComponent('호빗'))).data.books[0].id;
  assert.equal((await a.post('/api/shelf', { bookId: id })).status, 201);
  const again = await a.post('/api/shelf', { bookId: id });
  assert.equal(again.data.alreadyInShelf, true);
  assert.equal((await a.get('/api/shelf')).data.books.length, 1);
  assert.equal((await a.get('/api/books/' + id)).data.inShelf, true);
  await s.close();
});

test('외부 도서 API 실패 시 안내 플래그 + 로컬 결과', async () => {
  const s = await setup({ bookSearch: async () => { throw new Error('down'); } });
  const a = await s.mk('앨리스');
  const r = await a.get('/api/books?q=' + encodeURIComponent('호빗'));
  assert.equal(r.data.degraded, true);
  assert.equal(r.data.books[0].title, '호빗');
  await s.close();
});

async function seedBook(c) {
  const id = (await c.get('/api/books?q=' + encodeURIComponent('듄'))).data.books[0].id;
  await c.post('/api/shelf', { bookId: id });
  return id;
}

test('3·4·6. 비공개/공개 가시성과 직접 주소·파일 차단', async () => {
  const s = await setup();
  const a = await s.mk('작성자'); const b = await s.mk('방문자');
  const book = await seedBook(a);
  const priv = (await a.post('/api/contents', form({ bookId: book, kind: 'review', title: '비밀 감상', body: '혼자 보는 글' }))).data.content;
  assert.equal(priv.visibility, 'private', '기본값은 비공개');
  const art = (await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: '모래벌레', body: '', visibility: 'public' }, [PNG]))).data.content;
  assert.equal(art.visibility, 'public');
  const fileUrl = art.attachments[0].url;

  // 작성자는 둘 다, 타인은 공개 팬아트만
  assert.equal((await a.get(`/api/me/books/${book}/contents`)).data.contents.length, 2);
  assert.equal((await b.get(`/api/contents/${priv.id}`)).status, 404);
  assert.equal((await b.get(`/api/contents/${art.id}`)).status, 200);
  assert.equal((await b.get(fileUrl)).status, 200);
  const pub = (await b.get(`/api/books/${book}/contents?tab=creative`)).data.contents;
  assert.deepEqual(pub.map((c) => c.id), [art.id]);
  assert.equal((await b.get(`/api/books/${book}/contents?tab=review`)).data.contents.length, 0);

  // 6. 타인 서재: 공개 콘텐츠가 있는 책과 그 콘텐츠만
  const priv2Book = (await a.get('/api/books?q=' + encodeURIComponent('호빗'))).data.books[0].id;
  await a.post('/api/shelf', { bookId: priv2Book });
  await a.post('/api/contents', form({ bookId: priv2Book, kind: 'review', title: '호빗 비공개', body: 'x' }));
  const lib = (await b.get(`/api/users/${a.user.id}`)).data;
  assert.equal(lib.books.length, 1);
  assert.deepEqual(lib.books[0].contents.map((c) => c.id), [art.id]);

  // 4. 공개 → 비공개: 모든 곳에서 사라지고 직접 주소/파일 차단
  await b.put(`/api/contents/${art.id}/like`);
  assert.equal((await a.patch(`/api/contents/${art.id}/visibility`, { visibility: 'private' })).status, 200);
  assert.equal((await b.get(`/api/contents/${art.id}`)).status, 404);
  assert.equal((await b.get(fileUrl)).status, 404);
  assert.equal((await a.get(fileUrl)).status, 200, '작성자는 계속 열람');
  assert.equal((await b.get(`/api/books/${book}`)).data.top.length, 0);
  assert.equal((await b.get(`/api/books/${book}/contents?tab=creative`)).data.contents.length, 0);
  assert.equal((await b.get(`/api/users/${a.user.id}`)).data.books.length, 0);
  assert.equal((await b.put(`/api/contents/${art.id}/like`)).status, 404);
  // 타인은 수정/삭제 불가
  assert.equal((await b.del(`/api/contents/${art.id}`)).status, 404);
  assert.equal((await b.put(`/api/contents/${art.id}`, form({ title: 'x' }))).status, 404);
  // 비로그인 파일 접근 차단
  assert.equal((await new Client(s.base).get(fileUrl)).status, 401);
  await s.close();
});

test('5. 좋아요 토글/중복 방지/상위 3위(동점은 먼저 공개)', async () => {
  const s = await setup();
  const a = await s.mk('작성자'); const u1 = await s.mk('독자1'); const u2 = await s.mk('독자2'); const u3 = await s.mk('독자3');
  const book = await seedBook(a);
  const mkWork = async (title) => (await a.post('/api/contents', form({ bookId: book, kind: 'sidestory', title, body: '내용', visibility: 'public' }))).data.content;
  const w1 = await mkWork('첫째'); const w2 = await mkWork('둘째'); const w3 = await mkWork('셋째'); const w4 = await mkWork('넷째'); await mkWork('무좋아요');
  // 서로 다른 시각으로 공개 순서 고정
  const db = s.app.locals.db;
  [w1, w2, w3, w4].forEach((w, i) => db.prepare('UPDATE contents SET published_at = ? WHERE id = ?').run(`2026-01-0${i + 1} 00:00:00`, w.id));

  assert.equal((await u1.put(`/api/contents/${w1.id}/like`)).data.likes, 1);
  assert.equal((await u1.put(`/api/contents/${w1.id}/like`)).data.likes, 1, '중복 좋아요 없음');
  assert.equal((await a.put(`/api/contents/${w1.id}/like`)).status, 400, '자기 작품 좋아요 금지');
  await u1.put(`/api/contents/${w2.id}/like`); await u2.put(`/api/contents/${w2.id}/like`); // w2: 2
  await u1.put(`/api/contents/${w3.id}/like`); await u2.put(`/api/contents/${w3.id}/like`); await u3.put(`/api/contents/${w3.id}/like`); // w3: 3
  await u3.put(`/api/contents/${w4.id}/like`); // w4: 1 (w1과 동점, w1이 먼저 공개)
  let top = (await u1.get(`/api/books/${book}`)).data.top;
  assert.deepEqual(top.map((c) => c.id), [w3.id, w2.id, w1.id]);
  assert.deepEqual(top.map((c) => c.likes), [3, 2, 1]);

  // 취소하면 순위 반영
  assert.equal((await u3.del(`/api/contents/${w3.id}/like`)).data.likes, 2);
  assert.equal((await u3.del(`/api/contents/${w3.id}/like`)).data.likes, 2, '취소 멱등');
  top = (await u1.get(`/api/books/${book}`)).data.top;
  assert.deepEqual(top.map((c) => c.id), [w2.id, w3.id, w1.id], '동점(2)이면 먼저 공개된 w2');

  // 3개 미만이면 있는 것만, 좋아요 0은 제외
  const book2 = (await a.get('/api/books?q=' + encodeURIComponent('호빗'))).data.books[0].id;
  assert.equal((await u1.get(`/api/books/${book2}`)).data.top.length, 0);
  await s.close();
});

test('7. 신고 접수, 운영자 검토·숨김, 작성자 안내', async () => {
  const s = await setup();
  const a = await s.mk('작성자'); const b = await s.mk('신고자'); const admin = await s.mk('운영자', true);
  const book = await seedBook(a);
  const w = (await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: '문제작', body: 'x', visibility: 'public' }, [PNG]))).data.content;

  assert.equal((await b.post('/api/reports', { targetType: 'content', targetId: w.id, reason: '엉터리' })).status, 400);
  const rep = await b.post('/api/reports', { targetType: 'content', targetId: w.id, reason: '저작권 침해', detail: '무단 도용' });
  assert.equal(rep.status, 201);
  assert.equal((await b.post('/api/reports', { targetType: 'content', targetId: w.id, reason: '저작권 침해' })).data.duplicate, true);
  assert.equal((await a.post('/api/reports', { targetType: 'content', targetId: w.id, reason: '스팸' })).status, 400, '본인 글 신고 불가');
  assert.equal((await b.get('/api/admin/reports')).status, 403);

  const list = (await admin.get('/api/admin/reports?status=received')).data.reports;
  assert.equal(list.length, 1);
  assert.equal(list[0].target.title, '문제작');
  assert.equal((await admin.patch(`/api/admin/reports/${list[0].id}`, { status: 'resolved', hide: true, note: '저작권 확인 필요' })).status, 200);

  // 숨김: 공개 목록/직접 주소/파일/순위에서 제외, 운영자와 작성자는 볼 수 있음
  assert.equal((await b.get(`/api/contents/${w.id}`)).status, 404);
  assert.equal((await b.get(w.attachments[0].url)).status, 404);
  assert.equal((await b.get(`/api/books/${book}/contents?tab=creative`)).data.contents.length, 0);
  assert.equal((await b.get(`/api/users/${a.user.id}`)).data.books.length, 0);
  assert.equal((await admin.get(`/api/contents/${w.id}`)).status, 200);
  assert.equal((await a.get(`/api/contents/${w.id}`)).status, 200);
  assert.equal((await a.patch(`/api/contents/${w.id}/visibility`, { visibility: 'public' })).status, 403);
  const notices = (await a.get('/api/me/notices')).data.notices;
  assert.match(notices[0].message, /숨김 처리/);
  await s.close();
});

test('SHELF-07 책장 제거 시 기록 처리 선택, 업로드 검증, 계정 삭제', async () => {
  const s = await setup();
  const a = await s.mk('작성자'); const b = await s.mk('방문자');
  const book = await seedBook(a);
  // 업로드 검증
  const bad = await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: 't', body: '' }, [Buffer.from('not an image')]));
  assert.equal(bad.status, 400);
  const tooMany = await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: 't' }, [PNG, PNG, PNG, PNG, PNG]));
  assert.ok([400].includes(tooMany.status));
  assert.equal((await a.post('/api/contents', form({ bookId: book, kind: 'oneline', body: '' }))).status, 400, '빈 내용');
  assert.equal((await a.post('/api/contents', form({ bookId: 999999, kind: 'oneline', body: 'a' }))).status, 404);
  const w = (await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: '그림', visibility: 'public' }, [PNG]))).data.content;

  // 이미지 수정/삭제
  const upd = await a.put(`/api/contents/${w.id}`, form({ title: '그림2', removeAttachments: JSON.stringify([w.attachments[0].id]), body: '설명' }));
  assert.equal(upd.data.content.attachments.length, 0);

  assert.equal((await a.del(`/api/shelf/${book}`)).status, 400, '선택 필수');
  await a.del(`/api/shelf/${book}?records=keep`);
  assert.equal((await b.get(`/api/contents/${w.id}`)).status, 404, '보관된 기록은 비공개');
  await a.post('/api/shelf', { bookId: book });
  assert.equal((await a.get(`/api/me/books/${book}/contents`)).data.contents.length, 1, '다시 추가하면 기록 복원');
  await a.del(`/api/shelf/${book}?records=delete`);
  await a.post('/api/shelf', { bookId: book });
  assert.equal((await a.get(`/api/me/books/${book}/contents`)).data.contents.length, 0);

  // 책장에 없는 책에는 작성 불가
  const other = (await a.get('/api/books?q=' + encodeURIComponent('호빗'))).data.books[0].id;
  assert.equal((await a.post('/api/contents', form({ bookId: other, kind: 'oneline', body: 'x' }))).status, 400);

  // 계정 삭제
  const w2 = (await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: '그림', visibility: 'public' }, [PNG]))).data.content;
  assert.equal((await a.del('/api/me')).status, 200);
  assert.equal((await b.get(`/api/contents/${w2.id}`)).status, 404);
  assert.equal((await a.get('/api/shelf')).status, 401);
  await s.close();
});

test('인증 필요, 동일 출처 검사, 닉네임 검증', async () => {
  const s = await setup();
  const anon = new Client(s.base);
  assert.equal((await anon.get('/api/shelf')).status, 401);
  assert.equal((await anon.get('/api/me')).data.user, null);
  const a = await s.mk('앨리스');
  assert.equal((await a.patch('/api/me', { nickname: '   ' })).status, 400);
  const res = await fetch(s.base + '/api/me', { method: 'PATCH', headers: { cookie: a.cookie, 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"nickname":"x"}' });
  assert.equal(res.status, 403);
  await a.post('/api/auth/logout');
  assert.equal((await a.get('/api/shelf')).status, 401);
  await s.close();
});
