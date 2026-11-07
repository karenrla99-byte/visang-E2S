// 서버 없이 열리는 한 파일 HTML(dist/bookrest-standalone.html)을 만든다.
//   node scripts/build-standalone.mjs      (또는 npm run build:standalone)
// 서버의 데모 시드를 덤프해 가짜 API(public/mock-api.js)에 넣고, 코드·글꼴·이미지를 모두 HTML 안에 넣는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createApp } from '../server/app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...a) => path.join(root, ...a);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bookrest-sa-'));

// 이미지를 줄여서 data URI로 (파이썬 PIL이 있으면 가로 maxW로 재압축, 없으면 원본 그대로)
function dataUri(file, { maxW = 1200, q = 80 } = {}) {
  const out = path.join(tmp, path.basename(file) + '.jpg');
  const r = spawnSync('python3', ['-I', '-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");w=int(sys.argv[3]);im=im.resize((w,int(im.height*w/im.width))) if im.width>w else im;im.save(sys.argv[2],"JPEG",quality=int(sys.argv[4]))', file, out, String(maxW), String(q)]);
  const use = r.status === 0 && fs.existsSync(out) ? out : file;
  return `data:image/jpeg;base64,${fs.readFileSync(use).toString('base64')}`;
}

// 1) 서버 시드 덤프
const uploadDir = path.join(tmp, 'uploads'); fs.mkdirSync(uploadDir);
const app = createApp({ dbPath: ':memory:', uploadDir, demo: true, googleBooks: false });
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const login = await fetch(`${base}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'build' }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const get = async (u) => (await fetch(base + u, { headers: { cookie } })).json();
const categories = await get('/api/categories'); const shop = await get('/api/shop');
const db = app.locals.db; const all = (t) => db.prepare(`SELECT * FROM ${t}`).all();
const J = (v) => { try { return JSON.parse(v); } catch { return v; } };
const users = all('users').filter((u) => u.provider === 'demo').map((u) => ({ id: u.id, provider: 'demo', provider_id: u.provider_id, nickname: u.nickname, interests: J(u.interests), role: 'user', onboarded: 1, points: u.points, inventory: J(u.inventory), avatar: J(u.avatar), bio: u.bio }));
const books = all('books').map((b) => ({ ...b, tags: J(b.tags) }));
const contents = all('contents').map((c) => ({ ...c, hidden: 0 }));
const attachments = all('attachments').map((a) => ({ id: a.id, content_id: a.content_id, alt: a.alt, url: a.external_url || dataUri(path.join(uploadDir, a.stored_name), { maxW: 900, q: 78 }) }));
const shelf = all('shelf').map((s) => ({ user_id: s.user_id, book_id: s.book_id, created_at: s.created_at, status: s.status }));
const seed = { categories, shop: { items: shop.items, skins: shop.skins }, db: { books, users, shelf, contents, attachments } };
server.close(); app.locals.close();

// 2) 번들
const res = await build({ entryPoints: [P('public/standalone-entry.js')], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
let js = res.outputFiles[0].text;
const plaza = dataUri(P('public/assets/village/plaza-map.jpg'), { maxW: 1280, q: 80 }); const hall = dataUri(P('public/assets/library-hall.jpg'), { maxW: 1280, q: 78 });
const sprite = `data:image/png;base64,${fs.readFileSync(P('public/assets/avatar/character-walk.png')).toString('base64')}`;
js = js.replaceAll('/assets/avatar/character-walk.png', sprite).replaceAll('/assets/village/plaza-map.jpg', plaza).replaceAll('/assets/library-hall.jpg', hall).replaceAll('</script', '<\\/script');
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(P('public/fonts', f)).toString('base64')}`;
// 도트 아이콘·아이템 겹침 시트를 {경로: data URI}로 묶는다(public/assets.js 가 읽는다)
const assetMap = {};
for (const [dir, test] of [['shop', () => true], ['kinds', () => true], ['avatar', (n) => n.startsWith('item-') || (n.startsWith('character-') && n !== 'character-walk.png')]]) {
  for (const n of fs.readdirSync(P('public/assets', dir)).filter((x) => x.endsWith('.png') && test(x))) assetMap[`/assets/${dir}/${n}`] = `data:image/png;base64,${fs.readFileSync(P('public/assets', dir, n)).toString('base64')}`;
}
const css = fs.readFileSync(P('public/style.css'), 'utf8').replace('/fonts/Galmuri11.woff2', font('Galmuri11.woff2')).replace('/fonts/Galmuri11-Bold.woff2', font('Galmuri11-Bold.woff2'));

// 3) HTML 조립
let html = fs.readFileSync(P('public/index.html'), 'utf8');
html = html.replace(/<link rel="preload"[^>]*>\s*/, '').replace('<link rel="stylesheet" href="/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="/app.js"></script>', () => `<script>window.__SEED__=${JSON.stringify(seed).replaceAll('</', '<\\/')};window.__ASSETS__=${JSON.stringify(assetMap)};</script>\n<script>${js}</script>`);
fs.mkdirSync(P('dist'), { recursive: true });
fs.writeFileSync(P('dist/bookrest-standalone.html'), html);
fs.writeFileSync(P('dist/index.html'), html); // 정적 호스팅(Vercel 등)용
console.log(`dist/bookrest-standalone.html  ${(html.length / 1024 / 1024).toFixed(2)} MB  (책 ${books.length}권, 독자 ${users.length}명, 기록 ${contents.length}개)`);
