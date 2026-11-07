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
  const mk = async (kind, title, vis = 'public') => (await a.post('/api/contents', form({ bookId: book, kind, title, body: '내용', visibility: vis }))).data.content;
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
