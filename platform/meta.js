/* Meta Graph API publisher — PROTECTED.
   - Publishes an approved post to a Facebook Page (photo) and/or an Instagram Business account.
   - Reads creds from env ONLY; tokens are NEVER returned to the UI and are masked in logs/dry-run.
   - preflight() answers the 4 required questions before any real publish.
   Required env: META_ACCESS_TOKEN, FACEBOOK_PAGE_ID, INSTAGRAM_BUSINESS_ID, PUBLIC_BASE_URL */
const https = require('https');
const fs = require('fs');
const path = require('path');

const HOST = 'graph.facebook.com';
const VER = 'v21.0';
const DATA = path.join(__dirname, 'data');
const API_LOG = path.join(DATA, 'meta-api-log.json');

function env() {
  return {
    token: process.env.META_ACCESS_TOKEN || '',
    page: process.env.FACEBOOK_PAGE_ID || '',
    ig: process.env.INSTAGRAM_BUSINESS_ID || '',
    base: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  };
}
function ready() { const e = env(); return !!(e.token && e.page && e.ig && e.base); }
function maskToken(t) { return t ? '***' + String(t).slice(-4) : '<META_ACCESS_TOKEN>'; }
function publicUrl(p) { return env().base + p; }

function appendJson(file, entry) {
  let a = []; try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  a.unshift(entry); fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(a, null, 2));
}
// strip the real token anywhere before logging
function scrub(obj) {
  const tok = env().token;
  let s = JSON.stringify(obj);
  if (tok) s = s.split(tok).join('***TOKEN***');
  return JSON.parse(s);
}
function logApi(entry) { try { appendJson(API_LOG, { at: new Date().toISOString(), ...scrub(entry) }); } catch (e) {} }

function call(method, pathname, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const isGet = method === 'GET';
    const p = '/' + VER + pathname + (isGet ? '?' + body : '');
    const opts = { hostname: HOST, path: p, method, headers: {} };
    if (!isGet) opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { j = { raw: d.slice(0, 300) }; }
        if (res.statusCode >= 400) reject(Object.assign(new Error((j.error && j.error.message) || ('Graph HTTP ' + res.statusCode)), { graph: j.error || j }));
        else resolve(j);
      });
    });
    r.setTimeout(20000, () => r.destroy(new Error('Meta request timed out')));
    r.on('error', reject);
    if (!isGet) r.write(body);
    r.end();
  });
}

// The 4 checks the user asked for, plus permission scopes.
async function preflight() {
  const e = env();
  const out = {
    token_masked: maskToken(e.token),
    env_present: {
      FACEBOOK_PAGE_ID: !!e.page, INSTAGRAM_BUSINESS_ID: !!e.ig,
      META_ACCESS_TOKEN: !!e.token, PUBLIC_BASE_URL: !!e.base,
    },
    checks: {
      facebook_page_id: e.page ? 'ok' : 'missing',
      public_base_url: e.base ? (/^https:\/\//.test(e.base) ? 'ok' : 'not-https') : 'missing',
      instagram_linked: e.token && e.page ? 'checking' : 'unknown (need token+page)',
      permissions: e.token ? 'checking' : 'unknown (need token)',
    },
    ready: false,
  };
  if (e.token && e.page) {
    try {
      const pg = await call('GET', '/' + e.page, { fields: 'name,instagram_business_account', access_token: e.token });
      out.page_name = pg.name;
      out.checks.instagram_linked = pg.instagram_business_account ? 'ok' : 'not-linked';
      out.instagram_business_account_on_page = pg.instagram_business_account ? pg.instagram_business_account.id : null;
      if (out.instagram_business_account_on_page && e.ig && out.instagram_business_account_on_page !== e.ig)
        out.checks.instagram_linked = 'mismatch (env IG ≠ page IG)';
    } catch (err) { out.checks.instagram_linked = 'error'; out.page_error = err.message; }
    try {
      const perms = await call('GET', '/me/permissions', { access_token: e.token });
      const granted = (perms.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
      const need = ['pages_manage_posts', 'pages_read_engagement', 'instagram_content_publish'];
      out.permissions = {}; need.concat('instagram_basic').forEach((n) => (out.permissions[n] = granted.includes(n)));
      out.checks.permissions = need.every((n) => granted.includes(n)) ? 'ok' : 'missing-scopes';
    } catch (err) { out.checks.permissions = 'error'; out.permissions_error = err.message; }
  }
  out.ready = ready() && out.checks.facebook_page_id === 'ok' && out.checks.public_base_url === 'ok'
    && out.checks.instagram_linked === 'ok' && out.checks.permissions === 'ok';
  return out;
}

async function publishFacebook(imagePath, caption) {
  const e = env();
  const url = publicUrl(imagePath);
  logApi({ op: 'fb_photo:request', endpoint: `/${e.page}/photos`, params: { url, caption, published: true, access_token: maskToken(e.token) } });
  const res = await call('POST', `/${e.page}/photos`, { url, caption: caption || '', published: 'true', access_token: e.token });
  logApi({ op: 'fb_photo:response', response: res });
  return { id: res.post_id || res.id };
}

async function publishInstagram(imagePath, caption) {
  const e = env();
  const image_url = publicUrl(imagePath);
  logApi({ op: 'ig_container:request', endpoint: `/${e.ig}/media`, params: { image_url, caption, access_token: maskToken(e.token) } });
  const c = await call('POST', `/${e.ig}/media`, { image_url, caption: caption || '', access_token: e.token });
  logApi({ op: 'ig_container:response', response: c });
  logApi({ op: 'ig_publish:request', endpoint: `/${e.ig}/media_publish`, params: { creation_id: c.id, access_token: maskToken(e.token) } });
  const pub = await call('POST', `/${e.ig}/media_publish`, { creation_id: c.id, access_token: e.token });
  logApi({ op: 'ig_publish:response', response: pub });
  return { container_id: c.id, media_id: pub.id };
}

// exact requests that WOULD be sent — token masked, nothing sent
function dryRun(record) {
  const e = env();
  const url = e.base ? publicUrl(record.feed_image_path || '') : '<PUBLIC_BASE_URL>' + (record.feed_image_path || '');
  return {
    note: 'DRY-RUN — nothing was sent to Meta. Token masked. These are the exact requests.',
    ready: ready(), record_id: record.id, status: record.status,
    facebook: { method: 'POST', url: `https://${HOST}/${VER}/${e.page || '<FACEBOOK_PAGE_ID>'}/photos`,
      body: { url, caption: record.facebook_caption, published: true, access_token: maskToken(e.token) } },
    instagram: [
      { step: 1, method: 'POST', url: `https://${HOST}/${VER}/${e.ig || '<INSTAGRAM_BUSINESS_ID>'}/media`,
        body: { image_url: url, caption: record.instagram_caption, access_token: maskToken(e.token) } },
      { step: 2, method: 'POST', url: `https://${HOST}/${VER}/${e.ig || '<INSTAGRAM_BUSINESS_ID>'}/media_publish`,
        body: { creation_id: '<CREATION_ID_FROM_STEP_1>', access_token: maskToken(e.token) } },
    ],
  };
}

module.exports = { ready, preflight, publishFacebook, publishInstagram, dryRun, appendJson, env };
