#!/usr/bin/env node
/* Verify that an approved creative image is publicly reachable the way Meta will fetch it.
   Usage:
     node scripts/verify-public-image.js                # uses PUBLIC_BASE_URL + latest approved feed image
     node scripts/verify-public-image.js /approved/<id>/<id>_feed.png
     node scripts/verify-public-image.js https://your.domain/approved/<id>/<id>_feed.png
   PASS requires: HTTPS, HTTP 200, and an image/* content-type. */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// load .env
try { for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
} } catch (e) {}

const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
let arg = process.argv[2];

function latestImagePath() {
  try {
    const posts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'approved-posts.json'), 'utf8'));
    return posts.length ? posts[0].feed_image_path : null;
  } catch (e) { return null; }
}

let url;
if (arg && /^https?:\/\//.test(arg)) url = arg;
else {
  const p = arg || latestImagePath();
  if (!p) { console.error('No image path given and no approved posts found.'); process.exit(2); }
  if (!base) { console.error('PUBLIC_BASE_URL is not set in .env — cannot build a public URL.'); process.exit(2); }
  url = base + p;
}

console.log('Checking:', url);
const lib = url.startsWith('https://') ? https : http;
function check(u, depth = 0) {
  if (depth > 3) return done(false, 'too many redirects');
  const req = lib.request(u, { method: 'GET' }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return check(res.headers.location, depth + 1); }
    const ct = res.headers['content-type'] || '';
    let bytes = 0; res.on('data', (c) => (bytes += c.length)); res.on('end', () => {
      const httpsOk = url.startsWith('https://');
      const ok = res.statusCode === 200 && /^image\//.test(ct);
      console.log('  status:', res.statusCode, '| content-type:', ct || '(none)', '| bytes:', bytes, '| https:', httpsOk);
      if (ok && httpsOk) { console.log('\nPASS ✓  Meta can fetch this image.'); process.exit(0); }
      if (ok && !httpsOk) { console.log('\nWARN ⚠  Reachable, but NOT https. Meta requires https in production — set PUBLIC_BASE_URL to your https domain.'); process.exit(1); }
      console.log('\nFAIL ✗  Not a publicly reachable image (need HTTP 200 + image/* + https).'); process.exit(1);
    });
  });
  req.setTimeout(15000, () => { req.destroy(); done(false, 'timeout — not reachable from this network'); });
  req.on('error', (e) => done(false, e.message));
  req.end();
}
function done(ok, msg) { console.log('\nFAIL ✗ ', msg); process.exit(1); }
check(url);
