/* Gemini 2.5 Flash Image ("Nano Banana") — hybrid creative helpers.
   Gemini is allowed to do ONLY two things:
     1) generateBackground  -> a clean AI background (no product, no text)
     2) cutoutProduct       -> remove/clean the background of the REAL product photo,
                               WITHOUT altering, recoloring or inventing any product detail.
   The product name, price, old price, discount, CTA, logo and URL are ALWAYS rendered
   by the HTML/CSS layer — never by AI. Nothing here publishes anything.
   Docs: https://ai.google.dev/gemini-api/docs/image-generation */
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const BG_CACHE = path.join(__dirname, 'data', 'bg-cache');
const CUT_CACHE = path.join(__dirname, 'data', 'cutout-cache');

function enabled() { return !!process.env.GEMINI_API_KEY; }
function aspectFor(format) { return format === 'feed' ? '1:1' : '9:16'; }

const SCENE_THEMES = {
  studio:     'Very light off-white studio (#f4f3f1), soft natural shadows, subtle warm gradient, minimalist, premium retail.',
  tech_dark:  'Dark cinematic studio, deep navy-to-black gradient, soft volumetric spotlight and gentle rim light, sleek premium tech launch backdrop.',
  gaming_neon:'Dark moody scene with magenta and electric-purple neon glow, abstract light streaks, energetic high-end gaming launch backdrop.',
  warm_room:  'Modern minimalist room / desk scene, soft daylight, warm neutral wood-and-white tones, tasteful lifestyle interior.',
  fashion:    'Soft seamless pastel studio backdrop, editorial fashion lighting, clean and bright, premium lifestyle.',
};
function defaultBgPrompt(format, theme) {
  const scene = SCENE_THEMES[theme] || SCENE_THEMES.studio;
  return [
    'Premium e-commerce promotional BACKGROUND / SCENE only.', scene,
    'Lots of empty negative space; leave the centre-right open for a product and the left/bottom open for text.',
    'Absolutely NO text, NO words, NO numbers, NO logos, NO watermark, NO product, NO people.',
    format === 'feed' ? 'Square 1:1 framing.' : 'Vertical 9:16 framing.',
  ].join(' ');
}

const CUTOUT_PROMPT = [
  'Remove the background of this product photo completely.',
  'Return ONLY the product as a clean cut-out on a FULLY TRANSPARENT background (PNG with alpha).',
  'Do NOT change, redraw, recolor, stylize, add or remove ANY part of the product itself.',
  'Do NOT invent details, do NOT add text, logos, props, reflections or drop shadows.',
  'Keep the exact same product, exact colors, exact shape and all original details. Output image only.',
].join(' ');

function httpsPost(reqPath, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com', path: reqPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => {
        let j; try { j = JSON.parse(d); } catch (e) { return reject(new Error('Gemini: bad JSON (' + r.statusCode + ') ' + d.slice(0, 200))); }
        if (r.statusCode >= 400) return reject(new Error('Gemini ' + r.statusCode + ': ' + ((j.error && j.error.message) || d.slice(0, 200))));
        resolve(j);
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// fetch a remote image -> { b64, mime } (follows up to 3 redirects)
function fetchImage(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 3) return reject(new Error('Too many redirects fetching product image'));
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return resolve(fetchImage(r.headers.location, depth + 1));
      }
      if (r.statusCode >= 400) { r.resume(); return reject(new Error('Product image fetch ' + r.statusCode)); }
      const chunks = []; r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ b64: Buffer.concat(chunks).toString('base64'), mime: r.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject);
  });
}

function firstImagePart(data) {
  const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
  const p = parts.find((x) => x.inlineData || x.inline_data);
  if (!p) throw new Error('Gemini returned no image (check quota/model access).');
  const inl = p.inlineData || p.inline_data;
  return 'data:' + (inl.mimeType || inl.mime_type || 'image/png') + ';base64,' + inl.data;
}

async function generateBackground({ format = 'feed', prompt, theme } = {}) {
  if (!enabled()) throw new Error('GEMINI_API_KEY not set');
  const finalPrompt = (prompt && prompt.trim()) ? prompt.trim() : defaultBgPrompt(format, theme);
  const aspect = aspectFor(format);
  fs.mkdirSync(BG_CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(MODEL + '|' + aspect + '|' + finalPrompt).digest('hex').slice(0, 16);
  const cf = path.join(BG_CACHE, key + '.txt');
  if (fs.existsSync(cf)) return { dataUri: fs.readFileSync(cf, 'utf8'), cached: true };
  const body = JSON.stringify({ contents: [{ parts: [{ text: finalPrompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } });
  const data = await httpsPost(`/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, body);
  const dataUri = firstImagePart(data);
  try { fs.writeFileSync(cf, dataUri); } catch (e) {}
  return { dataUri, cached: false };
}

// imageUrl: the REAL product image URL. Returns { dataUri } transparent cutout. Cached by URL.
async function cutoutProduct({ imageUrl } = {}) {
  if (!enabled()) throw new Error('GEMINI_API_KEY not set');
  if (!imageUrl) throw new Error('No product image URL');
  fs.mkdirSync(CUT_CACHE, { recursive: true });
  const key = crypto.createHash('sha1').update(MODEL + '|cutout|' + imageUrl).digest('hex').slice(0, 20);
  const cf = path.join(CUT_CACHE, key + '.txt');
  if (fs.existsSync(cf)) return { dataUri: fs.readFileSync(cf, 'utf8'), cached: true };
  const img = await fetchImage(imageUrl);
  const body = JSON.stringify({
    contents: [{ parts: [{ text: CUTOUT_PROMPT }, { inline_data: { mime_type: img.mime, data: img.b64 } }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  });
  const data = await httpsPost(`/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, body);
  const dataUri = firstImagePart(data);
  try { fs.writeFileSync(cf, dataUri); } catch (e) {}
  return { dataUri, cached: false };
}

module.exports = { generateBackground, cutoutProduct, enabled, MODEL, defaultBgPrompt, SCENE_THEMES };
