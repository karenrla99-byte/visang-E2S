import { CATEGORIES } from './seed.js';

const CATEGORY_HINTS = [
  ['판타지', /fantasy|판타지/i], ['SF', /science fiction|sci-fi|SF/i], ['미스터리', /mystery|thriller|detective|crime|추리|스릴러/i],
  ['로맨스', /romance|love|로맨스/i], ['역사', /history|역사/i], ['과학', /science|nature|과학/i],
  ['인문', /philosophy|psychology|social|인문|철학/i], ['자기계발', /self-help|business|자기계발/i],
  ['청소년', /juvenile|young adult|청소년/i], ['만화·웹툰', /comics|graphic|만화/i],
  ['시·에세이', /poetry|essay|시집|에세이/i], ['소설', /fiction|novel|소설|literary/i],
];
const mapCategory = (cats = []) => {
  const s = cats.join(' ');
  for (const [name, re] of CATEGORY_HINTS) if (re.test(s)) return name;
  return '기타';
};

/** Google Books 검색. 실패 시 throw → 호출 측이 안내(LIB-05)하고 로컬 결과로 대체한다. */
export async function searchGoogleBooks(q, { apiKey, fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('printType', 'books');
  if (apiKey) url.searchParams.set('key', apiKey);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`google books ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => {
    const v = it.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn = (ids.find((x) => x.type === 'ISBN_13') || ids[0] || {}).identifier || null;
    const cover = (v.imageLinks?.thumbnail || '').replace(/^http:/, 'https:');
    return {
      external_id: `gb:${it.id}`, isbn, title: v.title || '', author: (v.authors || []).join(', '),
      publisher: v.publisher || '', cover_url: cover, description: (v.description || '').slice(0, 1500),
      category: mapCategory(v.categories),
    };
  }).filter((b) => b.title);
}

export function cacheBooks(db, list) {
  const ins = db.prepare(`INSERT OR IGNORE INTO books (external_id, isbn, title, author, publisher, cover_url, description, category, source)
    VALUES (?,?,?,?,?,?,?,?, 'google')`);
  for (const b of list) ins.run(b.external_id, b.isbn, b.title, b.author, b.publisher, b.cover_url, b.description, b.category);
}

export const isCategory = (c) => CATEGORIES.includes(c);
