/* AI Copywriter — generates organic Albanian social copy with an LLM (Gemini text by default).
   Returns { headline, cta, facebook, instagram, meta }. Falls back to deterministic templates
   when no key (so the platform always works). Reuses GEMINI_API_KEY; set AI_COPY_MODEL to override.
   Brand voice: short, sales-focused, urgency, NO exaggerated claims, NO clickbait, Albanian.
   Prices/numbers come from the product data, never invented by the model. */
const https = require('https');

const MODEL = process.env.AI_COPY_MODEL || 'gemini-2.5-flash';
function enabled() { return !!process.env.GEMINI_API_KEY; }

function shortName(n) { const h = String(n || '').split(',')[0].trim(); return h.length >= 8 ? h : n; }

// deterministic fallback (same voice as lib/captions in the engine)
function templateCopy(p) {
  const sale = p.current_price, reg = p.old_price, disc = p.discount, url = p.product_url || '';
  const short = shortName(p.product_name);
  const onSale = !!(reg && disc);
  const priceBit = onSale ? `tani ${sale} në vend të ${reg} (${disc})` : `vetëm ${sale}`;
  return {
    headline: `${short} — ${onSale ? 'tani ' + sale : sale}`,
    cta: 'Bli tani',
    facebook: `🔥 ${short} — ${priceBit}. Sasi e kufizuar, sa të zgjasin gjendjet. Bli tani: ${url}`,
    instagram: `${short}\n${priceBit}\nLidhja në bio. #Gjirafa50`,
    meta: `${short}${onSale ? ' me zbritje ' + disc : ''} — ${sale} në Gjirafa50. Porosit online.`,
    source: 'template',
  };
}

function buildPrompt(p) {
  return [
    'Je kopjues (copywriter) për Gjirafa50, dyqan online në Kosovë. Shkruaj SHQIP.',
    'Toni: i shkurtër, i fokusuar te shitja, urgjencë e matur, PA pohime të ekzagjeruara, PA clickbait.',
    'Përdor saktësisht këto të dhëna; MOS shpik çmime, specifika apo detaje:',
    JSON.stringify({
      produkti: p.product_name, kategoria: p.category, cmimi_tani: p.current_price,
      cmimi_vjeter: p.old_price || null, zbritja: p.discount || null, url: p.product_url || null,
    }),
    'Kthe VETËM JSON të vlefshëm me këto fusha (pa tekst tjetër, pa backticks):',
    '{"headline": "...", "cta": "...", "facebook": "...", "instagram": "...", "meta": "..."}',
    'Rregulla: headline ≤ 60 karaktere; cta 2-3 fjalë (p.sh. "Bli tani"); facebook 1-2 fjali + URL nëse ka;',
    'instagram me 1-2 hapsira rreshti + 2-4 hashtag (#Gjirafa50 etj.); meta ≤ 155 karaktere.',
  ].join('\n');
}

function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (r.statusCode >= 400) return reject(new Error('Gemini ' + r.statusCode + ': ' + ((j.error && j.error.message) || '')));
          const text = (((j.candidates || [])[0] || {}).content || {}).parts?.map((x) => x.text).join('') || '';
          resolve(JSON.parse(text));
        } catch (e) { reject(new Error('AI copy parse error: ' + e.message)); }
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('AI copy timed out')));
    req.on('error', reject); req.write(body); req.end();
  });
}

async function generate(p) {
  if (!enabled()) return templateCopy(p);
  try {
    const out = await callGemini(buildPrompt(p));
    return {
      headline: out.headline || '', cta: out.cta || 'Bli tani',
      facebook: out.facebook || '', instagram: out.instagram || '', meta: out.meta || '',
      source: 'ai:' + MODEL,
    };
  } catch (e) {
    const fb = templateCopy(p); fb.source = 'template (AI failed: ' + e.message + ')'; return fb;
  }
}

module.exports = { generate, enabled, MODEL, templateCopy };
