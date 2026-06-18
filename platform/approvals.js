/* Approval workflow — saves an approved post package locally and renders the final
   1080 creatives (Feed/Story/Reel) with the existing creative-engine (Playwright).
   Records live in data/approved-posts.json; images in data/approved/<id>/.
   NOTHING is published. Dry-run only shows what WOULD be sent to the Meta Graph API. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;                         // platform/
const DATA = path.join(ROOT, 'data');
const STORE = path.join(DATA, 'approved-posts.json');
const APPROVED_DIR = path.join(DATA, 'approved');
const ENGINE = path.join(ROOT, '..', 'creative-engine');
const GRAPH = 'https://graph.facebook.com/v21.0';

function readAll() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (e) { return []; } }
function writeAll(a) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(a, null, 2)); }
function newId() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + crypto.randomBytes(3).toString('hex');
}

// Render the 3 final creatives via creative-engine/render.js (baked AI bg + cutout + CSS text)
function renderCreatives(id, p) {
  const dir = path.join(APPROVED_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  let brand = {};
  try { brand = JSON.parse(fs.readFileSync(path.join(ENGINE, 'brand', 'brand.json'), 'utf8')); } catch (e) {}
  try {
    const fb = fs.readFileSync(path.join(ENGINE, 'brand', 'fallback.svg'), 'utf8');
    brand.fallbackImage = 'data:image/svg+xml;base64,' + Buffer.from(fb, 'utf8').toString('base64');
  } catch (e) {}
  brand.url = /gjirafamall/i.test(p.product_url || '') ? 'gjirafamall.com' : 'gjirafa50.com';

  const product = {
    id, label: p.category || 'Ofertë', category: p.category, product_name: p.product_name, theme: p.theme || '',
    subtitle: p.subtitle || '', regular_price: p.old_price, sale_price: p.current_price,
    discount_percentage: p.discount, cta_text: p.cta,
    product_image: p.product_image_render || p.product_image_url || '',
    background_image: p.background_image || '',
    product_url: p.product_url || '',
  };
  fs.writeFileSync(path.join(dir, 'variables.json'),
    JSON.stringify({ brand, formats: ['feed', 'story', 'reel'], products: [product] }));
  execFileSync('node', [path.join(ENGINE, 'render.js'),
    '--data', path.join(dir, 'variables.json'), '--out', dir, '--formats', 'feed,story,reel'],
    { cwd: ENGINE, env: process.env, stdio: 'pipe' });

  const base = '/approved/' + id + '/' + id;
  return { feed: base + '_feed.png', story: base + '_story.png', reel: base + '_reel.png' };
}

// Create a new approved record (renders images), OR update text of an existing one (keeps images).
function approve(p) {
  const all = readAll();
  if (p.id) {
    const rec = all.find((r) => r.id === p.id);
    if (rec) {
      Object.assign(rec, {
        facebook_caption: p.facebook_caption, instagram_caption: p.instagram_caption,
        meta_description: p.meta_description, headline: p.headline, cta: p.cta,
        selected_format: p.selected_format || rec.selected_format,
        status: 'approved', approved_by: p.approved_by || rec.approved_by,
        approved_at: new Date().toISOString(),
      });
      writeAll(all);
      return rec;
    }
  }
  const id = newId();
  const imgs = renderCreatives(id, p);
  const rec = {
    id, status: 'approved',
    product_id: p.product_id, product_name: p.product_name, product_url: p.product_url,
    product_image_url: p.product_image_url,
    current_price: p.current_price, old_price: p.old_price, discount: p.discount, category: p.category,
    selected_format: p.selected_format || 'feed',
    feed_image_path: imgs.feed, story_image_path: imgs.story, reel_cover_path: imgs.reel,
    facebook_caption: p.facebook_caption, instagram_caption: p.instagram_caption,
    meta_description: p.meta_description, headline: p.headline, cta: p.cta,
    ai_background_used: !!p.ai_background_used, ai_cutout_used: !!p.ai_cutout_used,
    approved_by: p.approved_by || process.env.APPROVER || 'gjeni@gjirafa.com',
    approved_at: new Date().toISOString(),
  };
  all.unshift(rec);
  writeAll(all);
  return rec;
}

function list() { return readAll(); }
function get(id) { return readAll().find((r) => r.id === id); }
function setStatus(id, status) {
  const all = readAll();
  const r = all.find((x) => x.id === id);
  if (!r) throw new Error('Record not found');
  r.status = status === 'draft' ? 'draft' : 'approved';
  if (status === 'draft') r.reopened_at = new Date().toISOString();
  writeAll(all);
  return r;
}

// What WOULD be sent to Meta — no network call, token masked.
function dryRun(id) {
  const r = get(id);
  if (!r) throw new Error('Record not found');
  const pageId = process.env.FB_PAGE_ID || '<FB_PAGE_ID>';
  const igId = process.env.IG_USER_ID || '<IG_USER_ID>';
  const token = process.env.META_TOKEN ? '***' + String(process.env.META_TOKEN).slice(-4) : '<META_ACCESS_TOKEN>';
  const publicUrl = (process.env.PUBLIC_BASE || '<PUBLIC_BASE>') + r.feed_image_path;
  return {
    note: 'DRY-RUN — nothing was sent to Meta. This only shows the requests that WOULD be made.',
    record_id: r.id, status: r.status,
    requires: 'A publicly reachable image URL (PUBLIC_BASE) + FB_PAGE_ID / IG_USER_ID / META_TOKEN.',
    facebook_page_photo: {
      method: 'POST', url: `${GRAPH}/${pageId}/photos`,
      body: { caption: r.facebook_caption, url: publicUrl, published: true, access_token: token },
    },
    instagram_publish: [
      { step: 1, name: 'create media container', method: 'POST', url: `${GRAPH}/${igId}/media`,
        body: { image_url: publicUrl, caption: r.instagram_caption, access_token: token } },
      { step: 2, name: 'publish container', method: 'POST', url: `${GRAPH}/${igId}/media_publish`,
        body: { creation_id: '<CREATION_ID_FROM_STEP_1>', access_token: token } },
    ],
    meta_description: r.meta_description,
  };
}

function updateRecord(id, patch) {
  const all = readAll();
  const r = all.find((x) => x.id === id);
  if (!r) throw new Error('Record not found');
  Object.assign(r, patch);
  writeAll(all);
  return r;
}

module.exports = { approve, list, get, setStatus, updateRecord, dryRun, APPROVED_DIR };
