import crypto from 'node:crypto';

// AUTH-01: 로그인 사업자는 개발 전 결정 사항 → 구글·카카오·네이버를 모두 지원하고 환경변수로 켠다.
const PROVIDERS = {
  google: {
    label: 'Google', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile',
    profile: (j) => ({ id: j.sub, name: j.name }),
  },
  kakao: {
    label: '카카오', auth: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token',
    userinfo: 'https://kapi.kakao.com/v2/user/me', scope: 'profile_nickname',
    profile: (j) => ({ id: String(j.id), name: j.kakao_account?.profile?.nickname || j.properties?.nickname }),
  },
  naver: {
    label: '네이버', auth: 'https://nid.naver.com/oauth2.0/authorize', token: 'https://nid.naver.com/oauth2.0/token',
    userinfo: 'https://openapi.naver.com/v1/nid/me', scope: '',
    profile: (j) => ({ id: j.response?.id, name: j.response?.nickname || j.response?.name }),
  },
};
const creds = (p) => ({ id: process.env[`OAUTH_${p.toUpperCase()}_CLIENT_ID`], secret: process.env[`OAUTH_${p.toUpperCase()}_CLIENT_SECRET`] });
export const enabledProviders = () => Object.entries(PROVIDERS).filter(([k]) => creds(k).id).map(([k, v]) => ({ id: k, label: v.label }));

export function oauthRoutes(app, { cfg, startSession, upsertSocialUser, wrap }) {
  const states = new Map(); // state -> expiry (단일 인스턴스 가정)
  app.get('/api/auth/:provider/start', wrap((req, res) => {
    const p = PROVIDERS[req.params.provider];
    const c = creds(req.params.provider);
    if (!p || !c.id) return res.status(404).json({ error: '설정되지 않은 로그인 방식입니다.' });
    const state = crypto.randomBytes(16).toString('hex');
    states.set(state, Date.now() + 10 * 60 * 1000);
    const u = new URL(p.auth);
    u.searchParams.set('client_id', c.id);
    u.searchParams.set('redirect_uri', `${cfg.baseUrl}/api/auth/${req.params.provider}/callback`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('state', state);
    if (p.scope) u.searchParams.set('scope', p.scope);
    res.redirect(u.toString());
  }));

  app.get('/api/auth/:provider/callback', wrap(async (req, res) => {
    const p = PROVIDERS[req.params.provider];
    const c = creds(req.params.provider);
    const exp = states.get(String(req.query.state));
    states.delete(String(req.query.state));
    if (!p || !c.id || !exp || exp < Date.now() || !req.query.code) return res.redirect('/#/?login=failed');
    try {
      const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), client_id: c.id, client_secret: c.secret || '',
        redirect_uri: `${cfg.baseUrl}/api/auth/${req.params.provider}/callback`, state: String(req.query.state) });
      const t = await (await fetch(p.token, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000) })).json();
      if (!t.access_token) throw new Error('no token');
      const info = p.profile(await (await fetch(p.userinfo, { headers: { Authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(8000) })).json());
      if (!info.id) throw new Error('no id');
      const user = upsertSocialUser(req.params.provider, info.id, info.name);
      startSession(res, user.id);
      res.redirect('/');
    } catch { res.redirect('/#/?login=failed'); }
  }));
}
