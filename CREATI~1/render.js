#!/usr/bin/env node
/* ============================================================================
   Gjirafa50 Creative Engine — automated renderer (Playwright)
   Reads a variables file, renders Feed/Story/Reel PNGs into an output folder.

     node render.js --data data/variables.json --out output --formats feed,story,reel

   Each product -> one PNG per format:  <out>/<id-or-slot>_<format>.png
   Writes <out>/render_manifest.json with per-image image_status (ok|fallback|none|error).
   No publishing. Puppeteer: swap require('playwright').chromium for require('puppeteer').
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SIZES = {
  feed:  { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  reel:  { width: 1080, height: 1920 },
};

function arg(flag, def) { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : def; }
function slug(s){ return String(s||'item').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40); }

(async () => {
  const dataPath = path.resolve(arg('--data', 'data/variables.json'));
  const outDir   = path.resolve(arg('--out', 'output'));
  const formats  = arg('--formats', '').split(',').filter(Boolean);
  const templateUrl = 'file://' + path.resolve(__dirname, 'templates/creative.html');

  const cfg = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const brand = cfg.brand || {};
  const products = cfg.products || [];
  const useFormats = formats.length ? formats : (cfg.formats || ['feed', 'story', 'reel']);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,            // normal machines: leave unset
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const manifest = [];
  try {
    for (const product of products) {
      for (const format of useFormats) {
        const size = SIZES[format];
        if (!size) { console.warn('Unknown format:', format); continue; }
        const name = slug(product.id || product.product_id || product.slot) + '_' + format + '.png';
        const entry = { product_id: product.id || product.product_id, product: product.product_name,
                        slot: product.slot, format, file: name, image_status: 'unknown' };
        const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
        try {
          await page.goto(templateUrl, { waitUntil: 'load' });
          await page.evaluate(([f, p, b]) => window.renderCreative(f, p, b), [format, product, brand]);
          await page.evaluate(async () => {
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            const settle = img => (img.complete && img.naturalWidth > 0)
              ? Promise.resolve()
              : new Promise(r => {
                  img.onload = () => r();
                  img.onerror = () => { if (window.__imgFail) window.__imgFail(img); r(); };
                  setTimeout(r, 4000);                       // don't hang on blocked requests
                });
            await Promise.all([...document.images].map(settle));
            // any product image still broken -> force brand fallback, then let it settle
            document.querySelectorAll('#canvas .photo img').forEach(img => {
              if (!img.complete || img.naturalWidth === 0) { if (window.__imgFail) window.__imgFail(img); }
            });
            await Promise.all([...document.images].map(settle));
          });
          await page.waitForTimeout(120);
          entry.image_status = await page.evaluate(() => window.__imgStatus || 'unknown');
          const el = await page.$('#canvas');
          await el.screenshot({ path: path.join(outDir, name) });
          console.log('rendered', name, '(' + entry.image_status + ')');
        } catch (err) {
          entry.image_status = 'error';
          entry.error = String(err && err.message ? err.message : err);
          console.error('FAILED', name, '::', entry.error);   // one failure does not abort the batch
        } finally {
          manifest.push(entry);
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'render_manifest.json'), JSON.stringify(manifest, null, 2));
  const bad = manifest.filter(m => m.image_status === 'error').length;
  const fb  = manifest.filter(m => m.image_status === 'fallback').length;
  console.log('\nDone. ' + manifest.length + ' images in ' + outDir + ' (fallback: ' + fb + ', errors: ' + bad + ')');
})().catch(e => { console.error(e); process.exit(1); });
