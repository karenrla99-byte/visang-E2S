import { createApp } from '../server/app.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function startServer(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookrest-'));
  const app = createApp({ dbPath: ':memory:', uploadDir: dir, googleBooks: false, ...opts });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((r) => server.close(() => { app.locals.close(); fs.rmSync(dir, { recursive: true, force: true }); r(); }));
  return { base, app, close, dir };
}

/** 쿠키를 유지하는 간단한 API 클라이언트 */
export class Client {
  constructor(base) { this.base = base; this.cookie = ''; }
  async req(method, url, body) {
    const headers = { cookie: this.cookie };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(this.base + url, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b ?? {}); }
  patch(u, b) { return this.req('PATCH', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
  async login(name, admin = false) { const r = await this.post('/api/auth/dev', { name, admin }); if (r.status !== 200) throw new Error('login failed'); return r.data.user; }
}

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export function form(fields, files = []) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const buf of files) f.append('images', new Blob([buf]), 'a.png');
  return f;
}
