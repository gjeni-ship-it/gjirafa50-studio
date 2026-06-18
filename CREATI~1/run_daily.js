#!/usr/bin/env node
/* ============================================================================
   Gjirafa50 — DAILY PIPELINE (one command)

   Flow:
     1. Pull products from Gjirafa50 KS DB  -> candidates.json (see note below)
     2. Run product selection engine        -> selection_today.json (+csv/md)
     3. Generate Albanian captions           -> captions_today.json
     4. Build variables.json
     5. Render Feed / Story / Reel creatives -> PNGs + render_manifest.json
     6. Save everything into  <outputs>/YYYY-MM-DD/
     7. Generate approval_summary.html  (Human Approval step — NOT published)

   Step 1 note: the DB pull runs engine/candidate_query.sql through the Gjirafa50
   MCP database tool. A standalone script has no DB credentials, so the MCP/agent
   (or scheduled Cowork task) writes the query result to the candidates file and
   this orchestrator does the rest. Point --candidates at that file.

   Usage:
     node run_daily.js
     node run_daily.js --date 2026-06-08 --candidates data/candidates.json --outroot ..
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const captions = require('./lib/captions');

const ROOT = __dirname;                                  // creative-engine/
function arg(f, d){ const i = process.argv.indexOf(f); return i > -1 ? process.argv[i+1] : d; }
function log(...a){ console.log('[run_daily]', ...a); }
function eur(s){ return String(s == null ? '' : s).replace(/EUR/g, '€').replace(/\s+€/, '€').trim(); }
function discPct(s){ const n = parseFloat(String(s).replace('%','')); return isNaN(n) ? String(s) : ('-' + Math.round(Math.abs(n)) + '%'); }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const DATE     = arg('--date', new Date().toISOString().slice(0, 10));
const candPath = path.resolve(arg('--candidates', path.join(ROOT, 'data', 'candidates.json')));
const outRoot  = path.resolve(arg('--outroot', path.join(ROOT, '..')));   // the "outputs" folder
const dayDir   = path.join(outRoot, DATE);
const stateDir = path.join(ROOT, 'state');
const histFile = path.join(stateDir, 'selection_history.json');          // persistent 7-day memory

function fail(step, err){
  console.error(`\n[run_daily] FAILED at step: ${step}\n${err && err.stack ? err.stack : err}`);
  process.exit(1);
}

// selection row -> normalized product object
function toProduct(r){
  return {
    slot: r.slot, id: r.product_id, product_id: r.product_id,
    product_name: r.product_name, category: r.category,
    regular_price: eur(r.regular_price), sale_price: eur(r.discount_price),
    discount_percentage: discPct(r.discount_percentage),
    product_image: r.image_url || '', product_url: r.product_url || '',
  };
}

// ---- 1. candidates ----------------------------------------------------------
if (!fs.existsSync(candPath)) {
  fail('1/pull-candidates',
    `Missing candidates file: ${candPath}\n` +
    `Run engine/candidate_query.sql via the Gjirafa50 MCP tool and save the rows there.\n` +
    `(In Cowork the scheduled agent produces this file before calling run_daily.)`);
}
fs.mkdirSync(dayDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
// clean stale creatives from a previous run of the same day (idempotent reruns)
for (const f of fs.readdirSync(dayDir)) {
  if (/\.png$/i.test(f) || f === 'render_manifest.json') {
    try { fs.rmSync(path.join(dayDir, f), { force: true }); } catch (e) {}
  }
}
log('date', DATE, '| day folder', dayDir);

// ---- 2. selection engine ----------------------------------------------------
try {
  log('2/ selection engine…');
  execFileSync('python3', [
    path.join(ROOT, 'engine', 'select_products.py'),
    '--candidates', candPath, '--outdir', dayDir, '--history', histFile,
  ], { stdio: 'inherit' });
} catch (e) { fail('2/selection', e); }

let selection;
try { selection = JSON.parse(fs.readFileSync(path.join(dayDir, 'selection_today.json'), 'utf8')); }
catch (e) { fail('2/read-selection', e); }
const featured = selection.filter(r => !/backup/i.test(r.slot));   // Product of Day + 4 Happy Hour
log('   featured products:', featured.length);

// ---- brand ------------------------------------------------------------------
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'brand', 'brand.json'), 'utf8'));
// Embed the brand fallback as a data: URI so it renders in any browser/origin
// (file:// subresources can be blocked; a data URI never is). Override by setting
// brand.fallbackImage in brand.json (e.g. a hosted PNG/SVG URL).
if (!(brand.fallbackImage && brand.fallbackImage.length)) {
  try {
    const svg = fs.readFileSync(path.join(ROOT, 'brand', 'fallback.svg'), 'utf8');
    brand.fallbackImage = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
  } catch (e) { brand.fallbackImage = ''; }
}

// ---- 3. captions ------------------------------------------------------------
let caps;
try {
  log('3/ Albanian captions…');
  caps = {
    meta: { brand: brand.name || 'Gjirafa50', store: 'Gjirafa50 KS', language: 'sq-AL',
            currency: 'EUR', date: DATE, generator: 'deterministic templates (lib/captions.js)',
            note: 'Copy only — no images/publish.' },
    products: featured.map(r => captions.generate(toProduct(r), brand)),
  };
  fs.writeFileSync(path.join(dayDir, 'captions_today.json'), JSON.stringify(caps, null, 2));
} catch (e) { fail('3/captions', e); }

// ---- 4. variables.json ------------------------------------------------------
let variables;
try {
  log('4/ variables.json…');
  variables = {
    brand,
    formats: ['feed', 'story', 'reel'],
    products: featured.map(r => {
      const p = toProduct(r);
      if (!p.product_image) p.product_image = brand.fallbackImage;     // pre-emptive fallback
      return {
        id: p.id, slot: p.slot, category: p.category, product_name: p.product_name,
        regular_price: p.regular_price, sale_price: p.sale_price,
        discount_percentage: p.discount_percentage,
        product_image: p.product_image, product_url: p.product_url,
      };
    }),
  };
  fs.writeFileSync(path.join(dayDir, 'variables.json'), JSON.stringify(variables, null, 2));
} catch (e) { fail('4/variables', e); }

// ---- 5. render --------------------------------------------------------------
try {
  log('5/ rendering Feed / Story / Reel…');
  execFileSync('node', [
    path.join(ROOT, 'render.js'),
    '--data', path.join(dayDir, 'variables.json'),
    '--out', dayDir, '--formats', 'feed,story,reel',
  ], { stdio: 'inherit', cwd: ROOT, env: process.env });
} catch (e) { fail('5/render', e); }

// ---- 6. (outputs already in dayDir) ----------------------------------------
let manifest = [];
try { manifest = JSON.parse(fs.readFileSync(path.join(dayDir, 'render_manifest.json'), 'utf8')); }
catch (e) { fail('6/read-manifest', e); }

// ---- 7. approval_summary.html ----------------------------------------------
try {
  log('7/ approval summary…');
  fs.writeFileSync(path.join(dayDir, 'approval_summary.html'),
    buildApproval(DATE, variables, caps, manifest));
} catch (e) { fail('7/approval', e); }

const fbCount  = manifest.filter(m => m.image_status === 'fallback').length;
const errCount = manifest.filter(m => m.image_status === 'error').length;
log(`DONE → ${dayDir}`);
log(`   ${variables.products.length} products · ${manifest.length} images · fallback ${fbCount} · errors ${errCount}`);
log('   Open approval_summary.html to review. Nothing was published.');

// =============================================================================
function buildApproval(date, variables, caps, manifest){
  const byId = {};
  manifest.forEach(m => { (byId[m.product_id] = byId[m.product_id] || {})[m.format] = m; });
  const capById = {};
  caps.products.forEach(c => { capById[c.product_id] = c; });

  const fbCount  = manifest.filter(m => m.image_status === 'fallback').length;
  const errCount = manifest.filter(m => m.image_status === 'error').length;

  const cards = variables.products.map(p => {
    const imgs = byId[p.id] || {};
    const cap = capById[p.id] || {};
    const thumb = (fmt) => {
      const m = imgs[fmt];
      if (!m) return `<div class="miss">— ${fmt} —</div>`;
      const flag = m.image_status === 'fallback'
        ? `<span class="flag warn">imazh fallback</span>`
        : (m.image_status === 'error' ? `<span class="flag err">gabim</span>` : '');
      return `<figure><img src="${esc(m.file)}" alt="${esc(fmt)}"><figcaption>${esc(fmt)} ${flag}</figcaption></figure>`;
    };
    return `
    <section class="card">
      <div class="head">
        <div><span class="slot">${esc(p.slot)}</span>
          <h2>${esc(p.product_name)}</h2>
          <div class="meta">${esc(p.category)} · #${esc(p.id)}</div></div>
        <div class="price">
          <span class="reg">${esc(p.regular_price)}</span>
          <span class="sale">${esc(p.sale_price)}</span>
          <span class="disc">${esc(p.discount_percentage)}</span></div>
      </div>
      <div class="thumbs">${thumb('feed')}${thumb('story')}${thumb('reel')}</div>
      <div class="copy">
        <p><b>Headline:</b> ${esc(cap.headline||'')}</p>
        <p><b>CTA:</b> ${esc(cap.cta||'')}</p>
        <p><b>Facebook:</b> ${esc(cap.facebook_feed_caption||'')}</p>
        <p><b>Instagram:</b> ${esc(cap.instagram_caption||'').replace(/\n/g,'<br>')}</p>
        <p><b>Story:</b> ${esc(cap.story_text||'').replace(/\n/g,'<br>')}</p>
        <p><a href="${esc(p.product_url)}" target="_blank">${esc(p.product_url)}</a></p>
      </div>
      <label class="approve"><input type="checkbox"> Aprovo këtë produkt</label>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="sq"><head><meta charset="utf-8">
<title>Aprovim — ${esc(date)} — Gjirafa50</title>
<style>
  :root{color-scheme:light}
  body{margin:0;background:#f4f6f8;color:#15202b;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}
  .wrap{max-width:1080px;margin:0 auto;padding:24px 18px 80px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#5b636b;font-size:13px;margin-bottom:8px}
  .banner{background:#fff3cd;border:1px solid #ffe69a;color:#7a5a00;border-radius:8px;padding:10px 12px;font-size:13px;margin:10px 0 20px}
  .card{background:#fff;border:1px solid #e6e9ee;border-radius:14px;padding:16px;margin-bottom:18px;box-shadow:0 1px 2px rgba(20,30,40,.05)}
  .head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .slot{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8a6d10}
  .head h2{font-size:16px;margin:4px 0 2px}
  .meta{color:#6b7280;font-size:12px}
  .price{white-space:nowrap;text-align:right}
  .price .reg{color:#9aa3ac;text-decoration:line-through;margin-right:8px}
  .price .sale{font-weight:800;color:#0a7d33;font-size:18px}
  .price .disc{display:inline-block;margin-left:8px;background:#fdecef;color:#c8102e;border-radius:6px;padding:1px 7px;font-weight:800}
  .thumbs{display:flex;gap:12px;margin:14px 0}
  .thumbs figure{margin:0;flex:1}
  .thumbs img{width:100%;border:1px solid #e6e9ee;border-radius:10px;display:block;background:#0E1726}
  .thumbs figcaption{font-size:11px;color:#6b7280;text-align:center;margin-top:4px;text-transform:capitalize}
  .flag{font-weight:700;border-radius:5px;padding:0 6px;font-size:10px}
  .flag.warn{background:#fff3cd;color:#7a5a00}.flag.err{background:#fdecef;color:#c8102e}
  .miss{flex:1;display:flex;align-items:center;justify-content:center;color:#b42318;border:1px dashed #e6a;border-radius:10px;min-height:120px}
  .copy{font-size:13px;line-height:1.5;border-top:1px solid #eef1f4;padding-top:10px}
  .copy p{margin:4px 0}
  .approve{display:inline-flex;gap:8px;align-items:center;margin-top:10px;font-weight:600;font-size:13px}
  .foot{color:#8a929a;font-size:12px;margin-top:18px}
</style></head><body><div class="wrap">
  <h1>Aprovim i postimeve ditore — Gjirafa50 KS</h1>
  <div class="sub">${esc(date)} · ${variables.products.length} produkte · ${manifest.length} kreative</div>
  <div class="banner"><b>DRAFT — pa publikim.</b> Rishiko kreativet dhe tekstet më poshtë. Imazhe fallback: ${fbCount} · gabime: ${errCount}.</div>
  ${cards}
  <div class="foot">Gjeneruar nga run_daily.js — hapi i radhës: Aprovimi njerëzor → Meta Publisher (jo i aktivizuar).</div>
</div></body></html>`;
}
