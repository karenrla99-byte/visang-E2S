// zip 프로토타입에서 가져온 기능: 포인트, 꾸미기 상점, 창작 전시관, 보관함 상태, 데모 데이터
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, form, PNG } from './helpers.js';

const setup = async (opts) => {
  const s = await startServer(opts);
  const mk = async (name, admin) => { const c = new Client(s.base); c.user = await c.login(name, admin); return c; };
  return { ...s, mk };
};
const bookId = async (c, q) => (await c.get('/api/books?q=' + encodeURIComponent(q))).data.books[0].id;

test('포인트: 가입 250P, 온보딩 +200P(한 번만), 책 담기 +50P(책당 한 번), 기록 보상', async () => {
  const s = await setup();
  const a = await s.mk('독자');
  assert.equal(a.user.points, 250);
  const b1 = await bookId(a, '호빗'); const b2 = await bookId(a, '듄');
  let r = await a.patch('/api/me', { nickname: '독자', interests: ['소설'], bookIds: [b1] });
  assert.equal(r.data.bonus, 200); assert.equal(r.data.user.points, 450);
  assert.equal((await a.get('/api/shelf')).data.books.length, 1, '온보딩에서 고른 책이 서재에 담김');
  r = await a.patch('/api/me', { nickname: '독자' });
  assert.equal(r.data.bonus, 0, '온보딩 보상은 한 번');
  assert.equal((await a.post('/api/shelf', { bookId: b2 })).data.points, 50);
  await a.del(`/api/shelf/${b2}?records=keep`);
  assert.equal((await a.post('/api/shelf', { bookId: b2 })).data.points, 0, '뺐다 다시 담아도 포인트 반복 지급 없음');
  assert.equal((await a.post('/api/contents', form({ bookId: b2, kind: 'oneline', body: '좋아요' }))).data.points, 30);
  assert.equal((await a.post('/api/contents', form({ bookId: b2, kind: 'review', title: 't', body: 'x' }))).data.points, 70);
  assert.equal((await a.post('/api/contents', form({ bookId: b2, kind: 'fanart', title: 't' }, [PNG]))).data.points, 120);
  assert.equal((await a.get('/api/me')).data.user.points, 450 + 50 + 30 + 70 + 120);
  await s.close();
});

test('상점: 구매/잔액 부족/중복 구매/보유 아이템만 착용', async () => {
  const s = await setup();
  const a = await s.mk('패셔니스타');
  assert.equal((await a.get('/api/shop')).data.items.length, 9);
  assert.equal((await a.post('/api/shop/buy', { itemId: 'hat_crown' })).status, 400, '300P 필요, 250P 보유');
  assert.equal((await a.post('/api/shop/buy', { itemId: 'nope' })).status, 404);
  let r = await a.post('/api/shop/buy', { itemId: 'acc_quill' }); // 120P
  assert.equal(r.status, 200); assert.equal(r.data.user.points, 130);
  assert.equal((await a.post('/api/shop/buy', { itemId: 'acc_quill' })).status, 400, '중복 구매 불가');
  assert.equal((await a.put('/api/me/avatar', { hat: 'hat_scholar' })).status, 400, '없는 아이템 착용 불가');
  assert.equal((await a.put('/api/me/avatar', { outfit: 'acc_quill' })).status, 400, '슬롯이 다른 아이템');
  r = await a.put('/api/me/avatar', { accessory: 'acc_quill', outfit: 'outfit_cardigan', skin: '#7A4E32' });
  assert.deepEqual(r.data.user.avatar, { skin: '#7A4E32', outfit: 'outfit_cardigan', accessory: 'acc_quill' });
  assert.equal((await a.put('/api/me/avatar', { skin: '#123456' })).data.user.avatar.skin, '#7A4E32', '허용되지 않은 피부색은 무시');
  await s.close();
});

test('창작 전시관: 공개 2차 창작물만, 분류 필터, 인기/최신 정렬', async () => {
  const s = await setup();
  const a = await s.mk('작가'); const b = await s.mk('관람객');
  const book = await bookId(a, '듄'); await a.post('/api/shelf', { bookId: book });
  const IMG = ['fanart', 'cosplay', 'webtoon']; const mk = async (kind, title, vis = 'public') => (await a.post('/api/contents', form({ bookId: book, kind, title, intro: '소개', body: '내용', visibility: vis }, IMG.includes(kind) ? [PNG] : []))).data.content;
  const fan = await mk('fanart', '팬아트'); const goods = await mk('goods', '굿즈'); const side = await mk('sidestory', '외전'); await mk('webnovel', '웹소설');
  await mk('fanart', '비공개 그림', 'private'); await mk('review', '서평(2차 창작 아님)');
  const all = (await b.get('/api/gallery')).data.contents;
  assert.equal(all.length, 4, '비공개와 서평은 제외');
  assert.ok(all.every((c) => c.creative && c.visibility === 'public'));
  assert.deepEqual((await b.get('/api/gallery?category=fanart')).data.contents.map((c) => c.id), [fan.id]);
  assert.equal((await b.get('/api/gallery?category=spinoff')).data.contents.length, 2, '외전+웹소설');
  await b.put(`/api/contents/${goods.id}/like`);
  assert.equal((await b.get('/api/gallery?sort=popular')).data.contents[0].id, goods.id, '인기순');
  assert.equal((await b.get('/api/gallery?sort=latest')).data.contents.length, 4);
  void side;
  await s.close();
});

test('보관함 상태 변경', async () => {
  const s = await setup();
  const a = await s.mk('독자'); const id = await bookId(a, '호빗');
  await a.post('/api/shelf', { bookId: id });
  assert.equal((await a.get('/api/shelf')).data.books[0].status, 'reading');
  assert.equal((await a.patch(`/api/shelf/${id}`, { status: 'completed' })).status, 200);
  assert.equal((await a.get('/api/shelf')).data.books[0].status, 'completed');
  assert.equal((await a.patch(`/api/shelf/${id}`, { status: 'x' })).status, 400);
  assert.equal((await a.patch('/api/shelf/99999', { status: 'reading' })).status, 404);
  await s.close();
});

test('데모 데이터: 다른 독자·공개 창작물·이미지·좋아요 수·TOP3', async () => {
  const s = await setup({ demo: true });
  const a = await s.mk('방문자');
  const g = (await a.get('/api/gallery')).data.contents;
  assert.ok(g.length >= 5, '전시관에 데모 작품이 보임');
  assert.equal(g[0].likes, Math.max(...g.map((c) => c.likes)), '인기순 정렬은 데모 좋아요 수 반영');
  const demian = (await a.get('/api/books?q=' + encodeURIComponent('데미안'))).data.books[0];
  const d = (await a.get(`/api/books/${demian.id}`)).data;
  assert.equal(d.book.category, '고전문학'); assert.ok(d.book.tags.length > 0);
  assert.equal(d.top[0].likes, 42);
  const img = d.top[0].attachments[0];
  assert.equal((await a.get(img.url)).status, 200, '번들된 데모 이미지를 서버에서 제공');
  const author = d.top[0].author;
  const lib = (await a.get(`/api/users/${author.id}`)).data;
  assert.ok(lib.books.length > 0 && lib.user.avatar.hat);
  await s.close();
});

test('온보딩: 분야 미리 추천은 저장하지 않고, 완료할 때 책이 서재에 담기며 보상은 한 번', async () => {
  const s = await setup();
  const a = await s.mk('신입');
  const rec = await a.get('/api/books/recommended?categories=' + encodeURIComponent('철학'));
  assert.ok(rec.data.books[0].category === '철학' || rec.data.personalized);
  assert.equal((await a.get('/api/me')).data.user.onboarded, false, '추천 요청만으로 온보딩이 끝나지 않는다');
  const ids = rec.data.books.slice(0, 2).map((b) => b.id);
  const r = await a.patch('/api/me', { nickname: '신입', interests: ['철학'], bookIds: ids });
  assert.equal(r.data.bonus, 200);
  assert.equal((await a.get('/api/shelf')).data.books.length, 2);
  await s.close();
});

test('굿즈 펀딩(관심 표시): 좋아요와 별개, 결제 없음, 본인·비굿즈·비공개 불가, 목표 검증', async () => {
  const s = await setup();
  const a = await s.mk('기획자'); const b = await s.mk('후원자'); const c = await s.mk('구경꾼');
  const book = await bookId(a, '듄'); await a.post('/api/shelf', { bookId: book });
  const goods = (await a.post('/api/contents', form({ bookId: book, kind: 'goods', title: '모래벌레 인형', intro: '기획', visibility: 'public', fundingGoal: '20', fundingNote: '인형 15,000원 예정' }))).data.content;
  assert.deepEqual({ goal: goods.funding.goal, count: goods.funding.count, note: goods.funding.note, reached: goods.funding.reached }, { goal: 20, count: 0, note: '인형 15,000원 예정', reached: false });
  const fan = (await a.post('/api/contents', form({ bookId: book, kind: 'fanart', title: '그림', visibility: 'public' }, [PNG]))).data.content;
  assert.equal(fan.funding, null, '굿즈가 아니면 펀딩 정보 없음');

  let r = await b.put(`/api/contents/${goods.id}/interest`);
  assert.equal(r.status, 200); assert.equal(r.data.funding.count, 1); assert.equal(r.data.funding.interested, true);
  assert.equal((await b.put(`/api/contents/${goods.id}/interest`)).data.funding.count, 1, '중복 관심 없음');
  assert.equal((await c.put(`/api/contents/${goods.id}/interest`)).data.funding.count, 2);
  assert.equal((await b.get(`/api/contents/${goods.id}`)).data.content.likes, 0, '관심 표시는 좋아요 수와 무관');
  assert.equal((await a.put(`/api/contents/${goods.id}/interest`)).status, 400, '본인 기획 불가');
  assert.equal((await b.put(`/api/contents/${fan.id}/interest`)).status, 404, '굿즈만 가능');
  assert.equal((await b.del(`/api/contents/${goods.id}/interest`)).data.funding.count, 1);

  const list = (await b.get('/api/funding')).data.contents;
  assert.deepEqual(list.map((x) => x.id), [goods.id]);
  await a.patch(`/api/contents/${goods.id}/visibility`, { visibility: 'private' });
  assert.equal((await b.put(`/api/contents/${goods.id}/interest`)).status, 404, '비공개로 바꾸면 관심 표시 불가');
  assert.equal((await b.get('/api/funding')).data.contents.length, 0);

  assert.equal((await a.post('/api/contents', form({ bookId: book, kind: 'goods', title: 'x', intro: 'y', fundingGoal: '5' }))).status, 400, '목표 하한');
  assert.equal((await a.post('/api/contents', form({ bookId: book, kind: 'goods', title: 'x', intro: 'y', fundingGoal: '99999' }))).status, 400, '목표 상한');
  assert.equal((await a.post('/api/contents', form({ bookId: book, kind: 'goods', title: 'x', intro: 'y' }))).data.content.funding.goal, 50, '기본 목표 50');
  await s.close();
});

test('굿즈 펀딩 정렬: 진행률순', async () => {
  const s = await setup({ demo: true });
  const a = await s.mk('방문자');
  const list = (await a.get('/api/funding')).data.contents;
  assert.ok(list.length >= 3 && list.every((c) => c.kind === 'goods' && c.funding.goal > 0));
  const ratios = list.map((c) => c.funding.count / c.funding.goal);
  assert.deepEqual(ratios, [...ratios].sort((x, y) => y - x), '진행률 높은 순');
  await s.close();
});

test('대도서관: 종류마다 따로 탭(2차 창작을 합치지 않음)', async () => {
  const s = await setup();
  const a = await s.mk('작가'); const b = await s.mk('독자');
  const book = await bookId(a, '듄'); await a.post('/api/shelf', { bookId: book });
  const IMG = ['fanart', 'cosplay', 'webtoon']; const mk = (kind, title) => a.post('/api/contents', form({ bookId: book, kind, title, intro: '소개', body: '내용', visibility: 'public' }, IMG.includes(kind) ? [PNG] : []));
  await mk('oneline', ''); await mk('review', '서평'); await mk('fanart', 'A'); await mk('fanart', 'B'); await mk('goods', 'G'); await mk('cosplay', 'C'); await mk('sidestory', 'S'); await mk('webnovel', 'W'); await mk('webtoon', 'T'); await mk('other', 'O');
  const d = (await b.get(`/api/books/${book}`)).data;
  assert.deepEqual({ ...d.counts }, { creative: 8, oneline: 1, review: 1, fanart: 2, goods: 1, cosplay: 1, sidestory: 1, webnovel: 1, webtoon: 1, other: 1 });
  for (const [kind, n] of [['fanart', 2], ['goods', 1], ['cosplay', 1], ['sidestory', 1], ['webnovel', 1], ['webtoon', 1], ['other', 1], ['oneline', 1], ['review', 1]]) {
    const r = (await b.get(`/api/books/${book}/contents?tab=${kind}`)).data.contents;
    assert.equal(r.length, n, kind); assert.ok(r.every((c) => c.kind === kind), `${kind} 탭에는 ${kind}만`);
  }
  assert.equal((await b.get(`/api/books/${book}/contents?tab=creative`)).data.contents.length, 8, '합계 탭은 호환용으로 유지');
  assert.equal((await b.get(`/api/books/${book}/contents?tab=evil'`)).data.contents.length, 1, '알 수 없는 탭은 한 줄 평으로');
  await s.close();
});

test('작성 템플릿: 이미지형은 이미지 필수, 글형은 소개칸+내용칸 분리, 굿즈는 소개, 종류별 이미지 규칙', async () => {
  const s = await setup();
  const a = await s.mk('작가'); const book = await bookId(a, '듄'); await a.post('/api/shelf', { bookId: book });
  const post = (fields, files) => a.post('/api/contents', form({ bookId: book, ...fields }, files));
  const kinds = (await a.get('/api/categories')).data.kinds;
  assert.deepEqual(Object.fromEntries(kinds.map((k) => [k.id, k.template])), { oneline: 'line', review: 'essay', fanart: 'image', goods: 'goods', cosplay: 'image', sidestory: 'story', webnovel: 'story', webtoon: 'image', other: 'mixed' });

  // 이미지형(팬아트·코스프레·웹툰): 이미지 필수
  for (const k of ['fanart', 'cosplay', 'webtoon']) {
    const r = await post({ kind: k, title: 't', intro: '소개' }, []);
    assert.equal(r.status, 400, `${k}: 이미지 없이는 저장 불가`); assert.equal(r.data.code, 'image_required');
    const ok = await post({ kind: k, title: 't', intro: '소개' }, [PNG]);
    assert.equal(ok.status, 201, k); assert.equal(ok.data.content.intro, '소개'); assert.equal(ok.data.content.template, 'image');
  }
  // 이미지 수 제한: 팬아트 4장, 웹툰 10장
  assert.equal((await post({ kind: 'fanart', title: 't' }, Array(5).fill(PNG))).status, 400);
  assert.equal((await post({ kind: 'fanart', title: 't' }, Array(4).fill(PNG))).status, 201);
  assert.equal((await post({ kind: 'webtoon', title: 't' }, Array(10).fill(PNG))).status, 201, '웹툰은 컷이 많아 10장까지');
  assert.equal((await post({ kind: 'webtoon', title: 't' }, Array(11).fill(PNG))).status, 400);

  // 글형(외전·웹소설): 소개칸과 내용칸이 따로, 둘 다 필수, 이미지 없음
  for (const k of ['sidestory', 'webnovel']) {
    assert.match((await post({ kind: k, title: 't', body: '본문만' })).data.error, /소개/, `${k}: 소개 없으면 거절`);
    assert.match((await post({ kind: k, title: 't', intro: '소개만' })).data.error, /내용/, `${k}: 내용 없으면 거절`);
    assert.equal((await post({ kind: k, title: 't', intro: '소개', body: '본문' }, [PNG])).status, 400, `${k}: 글형에는 이미지 없음`);
    const ok = await post({ kind: k, title: 't', intro: '짧은 소개', body: '긴 본문' });
    assert.equal(ok.status, 201); assert.deepEqual([ok.data.content.intro, ok.data.content.body], ['짧은 소개', '긴 본문']);
  }
  assert.equal((await post({ kind: 'sidestory', title: 't', intro: 'x'.repeat(501), body: 'b' })).status, 400, '소개 500자 제한');

  // 굿즈: 소개 필수, 이미지는 선택
  assert.equal((await post({ kind: 'goods', title: 't' })).status, 400);
  assert.equal((await post({ kind: 'goods', title: 't', intro: '소개' })).status, 201);
  assert.equal((await post({ kind: 'goods', title: 't', intro: '소개' }, [PNG])).status, 201);
  // 기타: 소개·내용·이미지 중 하나
  assert.equal((await post({ kind: 'other', title: 't' })).status, 400);
  assert.equal((await post({ kind: 'other', title: 't', intro: '소개' })).status, 201);
  // 한 줄 평·서평은 내용 필수, 이미지 불가
  assert.equal((await post({ kind: 'oneline', body: '' })).status, 400);
  assert.equal((await post({ kind: 'review', title: 't', body: '서평' }, [PNG])).status, 400);
  await s.close();
});
