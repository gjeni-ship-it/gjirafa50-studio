/* Gjirafa50 Product Browser — frontend.
   Live data via /api/products. Real product images only; if an image fails to load
   the card is flagged and "Gjenero Kreativ" is blocked. Nothing is published. */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const api = (p) => fetch(p).then(r => r.json());

const state = {
  cfg: { imagePattern: 'https://50cdn.gjirafamall.tech/images/{id}/{id}.jpeg', siteBase: 'https://gjirafa50.com', mode: 'snapshot' },
  q: { search: '', category: '', sort: 'discount', onSale: false, inStock: true, offset: 0, limit: 24 },
  total: 0,
  bg: {},
  cutout: {},
  showCutout: true,
  cutoutOn: (localStorage.getItem('g50_cutout') !== '0'),
};

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function ext(m) { return EXT[(m || '').toLowerCase()] || 'jpg'; }
function imageUrl(p) {
  if (!p.picture_guid) return '';
  const pat = localStorage.getItem('g50_img_pattern') || state.cfg.imagePattern;
  // {id} and {guid} both map to the picture GUID; {ext} from mime (pattern may hardcode .jpeg)
  return pat.replace(/\{id\}/g, p.picture_guid).replace(/\{guid\}/g, p.picture_guid).replace(/\{ext\}/g, ext(p.mime));
}
function productUrl(p) { return p.slug ? state.cfg.siteBase + '/' + p.slug : ''; }
function eur(n) { return Number(n).toFixed(2) + '€'; }
function escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ----------------------------------------------------------- data + render
async function load() {
  const p = state.q;
  const qs = new URLSearchParams({
    search: p.search, category: p.category, sort: p.sort,
    onSale: p.onSale ? '1' : '0', inStock: p.inStock ? '1' : '0',
    offset: String(p.offset), limit: String(p.limit),
  });
  $('#grid').innerHTML = '<div class="meta">Po ngarkohet…</div>';
  let data;
  try { data = await api('/api/products?' + qs); }
  catch (e) { $('#grid').innerHTML = '<div class="meta">Gabim: ' + escHtml(String(e)) + '</div>'; return; }
  if (data.error) { $('#grid').innerHTML = '<div class="meta">Gabim: ' + escHtml(data.error) + '</div>'; return; }
  state.total = data.total;
  renderGrid(data.items);
  const from = data.items.length ? p.offset + 1 : 0;
  $('#resultMeta').textContent = `${data.total.toLocaleString()} produkte · duke shfaqur ${from}–${p.offset + data.items.length}`;
  $('#pageInfo').textContent = `${Math.floor(p.offset / p.limit) + 1} / ${Math.max(1, Math.ceil(data.total / p.limit))}`;
  $('#prev').disabled = p.offset <= 0;
  $('#next').disabled = p.offset + p.limit >= data.total;
}

function renderGrid(items) {
  if (!items.length) { $('#grid').innerHTML = '<div class="meta">Asnjë produkt.</div>'; return; }
  const grid = $('#grid');
  grid.innerHTML = '';
  for (const p of items) {
    const url = imageUrl(p), purl = productUrl(p);
    const onSale = p.discount > 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb">
        ${onSale ? `<span class="badge">-${p.discount}%</span>` : ''}
        ${url ? `<img alt="" loading="lazy" src="${escAttr(url)}">`
              : `<div class="warn">⚠ Imazhi mungon</div>`}
      </div>
      <div class="card-body">
        <div class="pname" title="${escAttr(p.product_name)}">${escHtml(p.product_name)}</div>
        <div class="cat">${escHtml(p.category || '—')}</div>
        <div class="prices"><span class="now">${eur(p.price)}</span>${onSale ? `<span class="was">${eur(p.oldprice)}</span>` : ''}</div>
        <div class="stock">Stoku: <b>${Number(p.stock).toLocaleString()}</b> · #${p.product_id}</div>
        <div class="card-actions">
          <button class="gen-btn">Gjenero Kreativ</button>
          ${purl ? `<a href="${escAttr(purl)}" target="_blank" rel="noopener">faqja ↗</a>` : ''}
        </div>
      </div>`;
    const img = card.querySelector('img');
    const genBtn = card.querySelector('.gen-btn');
    const block = (msg) => {
      const thumb = card.querySelector('.thumb');
      thumb.innerHTML = `<div class="warn">⚠ ${escHtml(msg)}</div>`;
      genBtn.disabled = true;
      genBtn.title = 'Imazhi mungon — gjenerimi i bllokuar';
      genBtn.textContent = 'Imazh mungon';
    };
    if (!url) block('Imazhi mungon');
    else if (img) img.onerror = () => block('Imazhi nuk u ngarkua');
    genBtn.onclick = () => { if (!genBtn.disabled) openModal(p, url, purl); };
    grid.appendChild(card);
  }
}

// ----------------------------------------------------------- copy generator (Albanian)
function shortName(n) { const h = String(n || '').split(',')[0].trim(); return h.length >= 8 ? h : n; }
function genCopy(p) {
  const sale = eur(p.price), reg = eur(p.oldprice), disc = p.discount ? `-${p.discount}%` : '';
  const short = shortName(p.product_name);
  const url = productUrl(p);
  const onSale = p.discount > 0;
  const priceBit = onSale ? `tani ${sale} në vend të ${reg} (${disc})` : `vetëm ${sale}`;
  return {
    headline: `${short} — ${onSale ? 'tani ' + sale : sale}`,
    cta: 'Bli tani',
    fb: `🔥 ${short} — ${priceBit}. Sasi e kufizuar, sa të zgjasin gjendjet. Bli tani: ${url}`,
    ig: `${short}\n${priceBit}\nLidhja në bio. #Gjirafa50`,
    meta: `${short} ${onSale ? 'me zbritje ' + disc : ''} — ${sale} në Gjirafa50. Porosit online.`.replace('  ', ' '),
  };
}

// ----------------------------------------------------------- shared derive/theme (mirror creative.html)
const KNOWN_BRANDS=["Samsung","Apple","iPhone","Lenovo","Gigabyte","MSI","Asus","Acer","Dell","HP","Xiaomi","Redmi","Poco","Huawei","Honor","Sony","LG","JBL","Logitech","Razer","Kodak","Nokia","Motorola","Realme","OnePlus","Oppo","Vivo","Nivea","Lattafa","Armaf","Canon","Nikon","GoPro","Bosch","Philips","Tefal","Beko","Tesla","Anker","Sandisk","Kingston","Corsair","TP-Link","Garmin","Fitbit","Sense7","Nintendo","Microsoft","Google","Pixel","Toshiba","Panasonic","Electrolux","Whirlpool","Braun"];
const GENERIC=/^(monitor|laptop|notebook|smartphone|tablet|televizor|tv|kufje|kufjet|mouse|tastier[aë]|tastiera|parfum|edp|edt|edc|eau|de|parfume|toilette|karrige|tavolin[eë]|sahat|or[eë]|sa?at|smartwatch|fotoaparat|kamer[aë]|printer|frigorifer|makin[eë]|aspirator|set|paket[aë]|i|e|t[eë]|me|p[eë]r|gaming|wireless|bluetooth|portativ|smart|inch|inç|cm|mm|ml|gb|tb)$/i;
function deriveBrandModel(name){
  const raw=String(name||'').trim(); if(!raw)return {brand:'',model:''};
  const tokens=raw.split(/\s+/); let brand='',bi=-1;
  for(let i=0;i<tokens.length&&!brand;i++){const t=tokens[i].replace(/[^A-Za-z0-9-]/g,'');for(const b of KNOWN_BRANDS){if(t.toLowerCase()===b.toLowerCase()){brand=tokens[i];bi=i;break;}}}
  const rest=tokens.slice(); if(bi>=0)rest.splice(bi,1);
  const model=[];
  for(const w0 of rest){const w=w0.replace(/[^A-Za-z0-9-]/g,'');if(GENERIC.test(w)){if(model.length)break;else continue;}model.push(w0);if(model.length>=2||model.join(' ').length>=14)break;}
  let modelStr=model.join(' ').trim();
  if(!modelStr){modelStr=tokens.slice(0,2).join(' ');if(!brand&&tokens.length){brand=tokens[0];modelStr=tokens.slice(1,3).join(' ')||tokens[0];}}
  if(!brand&&tokens.length>1)brand=tokens[0];
  return {brand:String(brand||'').toUpperCase(),model:modelStr||raw};
}
function themeFor(p){
  const cat=String(p.category||'').toLowerCase();
  if(/gaming|gamer|konzol|console|playstation|xbox/.test(cat))return 'neon';
  if(/laptop|kompjuter|monitor|telefon|smartphone|tablet|tv|audio|foto|elektronik|teknologj|gadget|aksesor/.test(cat))return 'dark';
  if(/mobilje|sht[eë]pi|kuzhin|home|furnitur|dekor/.test(cat))return 'warm';
  if(/parfum|kozmetik|bukuri|fashion|veshje|mod[eë]|beauty/.test(cat))return 'fashion';
  return 'studio';
}

// ----------------------------------------------------------- creative preview (mirrors creative.html)
function injectCreativeStyle() {
  if ($('#pc-style')) return;
  const s = document.createElement('style'); s.id = 'pc-style';
  s.textContent = `
  .pc{position:relative;overflow:hidden;color:var(--ink,#15202b);background:var(--bg,#f4f3f1);font-family:Inter,"Helvetica Neue",Arial,sans-serif;
    --accent:#E4002B;--ink:#15202b;--muted:#7c8694;--bg:#f4f3f1;--cond:"Oswald","Arial Narrow Bold","Arial Narrow",Impact,sans-serif}
  .pc.feed{width:1080px;height:1080px}.pc.story,.pc.reel{width:1080px;height:1920px}
  .pc.theme-dark{--bg:#0b1220;--ink:#fff;--muted:#aab3c0}
  .pc.theme-neon{--bg:#120a1f;--ink:#fff;--muted:#cbb0e6;--accent:#e23ad6}
  .pc.theme-warm{--bg:#efe7dd;--ink:#2a2117;--muted:#8a7c6a}
  .pc.theme-fashion{--bg:#f3eef0;--ink:#241a22;--muted:#9a8a93}
  .pc .bg2{position:absolute;inset:0;background:radial-gradient(58% 50% at 76% 40%,rgba(0,0,0,.05),transparent 70%)}
  .pc.theme-dark .bg2{background:radial-gradient(60% 52% at 74% 40%,rgba(90,130,230,.22),transparent 72%)}
  .pc.theme-neon .bg2{background:radial-gradient(56% 48% at 74% 42%,rgba(200,70,235,.30),transparent 74%)}
  .pc .bgimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .pc .bgscrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(244,243,241,.94) 0%,rgba(244,243,241,.5) 42%,rgba(244,243,241,0) 66%),linear-gradient(to top,rgba(244,243,241,.92) 0%,rgba(244,243,241,0) 34%)}
  .pc.theme-dark .bgscrim,.pc.theme-neon .bgscrim{background:linear-gradient(90deg,rgba(7,11,22,.92) 0%,rgba(7,11,22,.45) 44%,rgba(7,11,22,0) 68%),linear-gradient(to top,rgba(7,11,22,.9) 0%,rgba(7,11,22,0) 36%)}
  .pc .topbar{position:absolute;display:flex;align-items:flex-start;justify-content:space-between;top:62px;left:70px;right:70px}
  .pc.story .topbar,.pc.reel .topbar{top:96px;left:84px;right:84px}
  .pc .label{font-weight:800;text-transform:uppercase;letter-spacing:.04em;display:inline-flex;align-items:center;gap:14px;font-size:28px;opacity:.92}
  .pc.story .label,.pc.reel .label{font-size:32px}
  .pc .label .sq{width:46px;height:14px;border-radius:4px;background:var(--accent)}
  .pc .wordmark{font-weight:800;font-size:38px}.pc.story .wordmark,.pc.reel .wordmark{font-size:44px}.pc .wordmark .a{color:var(--accent)}
  .pc .hero{position:absolute;display:flex;flex-direction:column;left:70px;top:150px;width:600px}
  .pc.story .hero,.pc.reel .hero{left:84px;top:240px;width:760px}
  .pc .eyebrow{font-weight:800;text-transform:uppercase;letter-spacing:.22em;color:var(--accent);font-size:34px;margin-bottom:10px}
  .pc.story .eyebrow,.pc.reel .eyebrow{font-size:44px;margin-bottom:14px}
  .pc .model{font-family:var(--cond);font-weight:700;text-transform:uppercase;line-height:.86;letter-spacing:-.005em;color:var(--ink);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:148px}
  .pc.story .model,.pc.reel .model{font-size:200px}
  .pc .photo{position:absolute;display:flex;align-items:center;justify-content:center;right:34px;top:352px;width:540px;height:540px}
  .pc.story .photo,.pc.reel .photo{left:140px;right:140px;top:720px;height:640px;width:auto}
  .pc .photo img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 26px 40px rgba(20,30,45,.22))}
  .pc.theme-dark .photo img{filter:drop-shadow(0 0 70px rgba(140,170,255,.22)) drop-shadow(0 26px 44px rgba(0,0,0,.55))}
  .pc.theme-neon .photo img{filter:drop-shadow(0 0 80px rgba(226,58,214,.30)) drop-shadow(0 26px 44px rgba(0,0,0,.55))}
  .pc .info{position:absolute;display:flex;flex-direction:column;left:70px;bottom:78px;width:560px}
  .pc.story .info,.pc.reel .info{left:84px;right:84px;bottom:170px;width:auto}.pc.reel .info{bottom:340px}
  .pc .sub{color:var(--muted);font-weight:500;font-size:28px;margin-bottom:18px}.pc.story .sub,.pc.reel .sub{font-size:34px;margin-bottom:22px}
  .pc .priceline{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}
  .pc .old{color:var(--muted);font-weight:600;text-decoration:line-through;text-decoration-color:var(--accent);text-decoration-thickness:.09em;font-size:40px}
  .pc.story .old,.pc.reel .old{font-size:50px}
  .pc .pill{display:inline-flex;align-items:center;background:var(--accent);color:#fff;font-weight:900;border-radius:7px;font-size:30px;padding:6px 16px}
  .pc.story .pill,.pc.reel .pill{font-size:38px;padding:8px 20px}
  .pc .sale{font-weight:900;color:var(--ink);font-size:104px;margin-top:4px}.pc.story .sale,.pc.reel .sale{font-size:140px;margin-top:6px}
  .pc .cta{align-self:flex-start;background:var(--accent);color:#fff;font-weight:800;text-transform:uppercase;border-radius:8px;font-size:34px;padding:22px 44px;margin-top:26px}
  .pc.story .cta,.pc.reel .cta{font-size:46px;padding:30px 62px;border-radius:10px;margin-top:36px}
  `;
  document.head.appendChild(s);
}
function renderPreview(fmt, p, imgUrl) {
  injectCreativeStyle();
  const onSale = p.discount > 0;
  const bg = (state.bg && state.bg[fmt]) || '';
  const hasBg = !!(state.bg && state.bg[fmt]);
  const hasCut = !!(p && state.cutout[p.product_id]) && state.cutoutOn && state.showCutout;
  const theme = (hasBg || hasCut) ? themeFor(p) : 'studio';
  const bm = deriveBrandModel(p.product_name);
  const heroText = ((bm.brand?bm.brand+' ':'')+bm.model).trim();
  const showSub = p.product_name && p.product_name.toLowerCase() !== heroText.toLowerCase();
  const host = $('#creative');
  host.className = 'pc ' + fmt + ' theme-' + theme;
  host.style.setProperty('--accent', '#E4002B');
  host.innerHTML = `
    ${bg ? `<img class="bgimg" src="${escAttr(bg)}" alt=""><div class="bgscrim"></div>` : `<div class="bg2"></div>`}
    <div class="topbar">
      <div class="label"><span class="sq"></span>${escHtml((p.category || 'Ofertë')).toUpperCase()}</div>
      <div class="wordmark">${(state.cfg.siteBase||'gjirafa50.com').replace(/^https?:\/\//,'').replace(/(50|Mall)/i,'<span class="a">$1</span>')}</div>
    </div>
    <div class="hero">${bm.brand?`<div class="eyebrow">${escHtml(bm.brand)}</div>`:''}<div class="model">${escHtml(bm.model)}</div></div>
    <div class="photo">${imgUrl ? `<img src="${escAttr(imgUrl)}" alt="">` : ''}</div>
    <div class="info">
      ${showSub?`<div class="sub">${escHtml(p.product_name)}</div>`:''}
      <div class="priceline">${onSale ? `<span class="old">${eur(p.oldprice)}</span>` : ''}${onSale && p.discount ? `<span class="pill">-${p.discount}%</span>` : ''}</div>
      <div class="sale">${eur(p.price)}</div>
      <div class="cta">${escHtml($('#cCta').value || 'Bli tani')}</div>
    </div>`;
  // auto-fit big model headline
  const m = host.querySelector('.model');
  if (m) { let fz = parseFloat(getComputedStyle(m).fontSize), g = 0;
    while ((m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1) && fz > 40 && g < 160) { fz -= 4; m.style.fontSize = fz + 'px'; g++; } }
  // scale into fixed clipping viewport
  const baseW = 1080, baseH = fmt === 'feed' ? 1080 : 1920;
  const targetW = 330, sc = targetW / baseW;
  const view = $('#previewScale');
  view.style.position = 'relative'; view.style.overflow = 'hidden'; view.style.margin = '0 auto';
  view.style.width = targetW + 'px'; view.style.height = Math.round(baseH * sc) + 'px';
  host.style.position = 'absolute'; host.style.top = '0'; host.style.left = '0';
  host.style.transformOrigin = 'top left'; host.style.transform = `scale(${sc})`;
}

// ----------------------------------------------------------- modal
let current = null, currentFmt = 'feed';
function hasCut() { return !!(current && state.cutout[current.p.product_id]); }
function productImg() {
  return (state.cutoutOn && state.showCutout && hasCut())
    ? state.cutout[current.p.product_id]
    : (current ? current.imgUrl : '');
}
function updateCutUI() {
  const g = $('#cutGen'), t = $('#cutToggle');
  const can = state.cfg.geminiEnabled && state.cutoutOn;
  if (g) { g.disabled = !can || !current; g.title = !state.cfg.geminiEnabled ? 'Vendos GEMINI_API_KEY në .env' : (!state.cutoutOn ? 'Cutout i çaktivizuar te \u2699 Imazhi' : ''); }
  if (t) { t.disabled = !hasCut(); t.checked = state.showCutout && hasCut(); }
}
function openModal(p, imgUrl, purl) {
  current = { p, imgUrl };
  state.bg = {};
  state.showCutout = true;
  if ($('#bgPrompt')) $('#bgPrompt').value = '';
  $('#dImg').src = imgUrl; $('#dName').textContent = p.product_name;
  $('#dMeta').innerHTML = `${escHtml(p.category || '—')} · #${p.product_id}<br>` +
    `Çmimi: <b>${eur(p.price)}</b>${p.discount ? ` · ishte <s>${eur(p.oldprice)}</s> · <b>-${p.discount}%</b>` : ''}<br>` +
    `Stoku: ${Number(p.stock).toLocaleString()}`;
  $('#dUrl').href = purl || '#';
  const c = genCopy(p);
  $('#cHeadline').value = c.headline; $('#cCta').value = c.cta;
  $('#cFb').value = c.fb; $('#cIg').value = c.ig; $('#cMeta').value = c.meta;
  currentFmt = 'feed';
  document.querySelectorAll('.fmt').forEach(b => b.classList.toggle('active', b.dataset.fmt === 'feed'));
  renderPreview('feed', p, productImg());
  updateCutUI();
  $('#modal').classList.remove('hidden');
  autoGenerate(p);
}

// "System generates": when Gemini is available, auto-make the themed scene + cutout + AI copy.
// User still edits + approves afterwards (manual gate preserved).
async function autoGenerate(p) {
  const cs = $('#cutStatus');
  // AI scene background (themed by category)
  if (state.cfg.geminiEnabled) {
    const bgBtn = $('#bgGen'), bt = bgBtn ? bgBtn.textContent : '';
    if (bgBtn) { bgBtn.disabled = true; bgBtn.textContent = 'Skena AI…'; }
    fetch('/api/generate-bg', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: currentFmt, theme: themeFor(p) }) })
      .then(x => x.json()).then(r => { if (current && current.p === p && r.image) { state.bg[currentFmt] = r.image; renderPreview(currentFmt, current.p, productImg()); } })
      .catch(()=>{}).finally(()=>{ if (bgBtn) { bgBtn.textContent = bt; bgBtn.disabled = !state.cfg.geminiEnabled; } });
    // product cutout
    if (state.cutoutOn) {
      if (cs) { cs.className = 'cutstatus'; cs.textContent = 'Po pastrohet…'; }
      fetch('/api/cutout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: current.imgUrl }) })
        .then(x => x.json()).then(r => {
          if (!current || current.p !== p) return;
          if (r.image) { state.cutout[p.product_id] = r.image; state.showCutout = true; if (cs) { cs.className = 'cutstatus ok'; cs.textContent = r.cached ? 'Cutout (cache)' : 'Cutout u krijua'; } renderPreview(currentFmt, current.p, productImg()); updateCutUI(); }
          else if (cs) { cs.className = 'cutstatus warn'; cs.textContent = 'Cutout dështoi'; }
        }).catch(()=>{ if (cs) { cs.className='cutstatus warn'; cs.textContent='Gabim'; } });
    }
  }
  // AI organic copy
  if (state.cfg.aiCopyEnabled) {
    fetch('/api/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: p.product_name, category: p.category, current_price: eur(p.price),
        old_price: p.discount ? eur(p.oldprice) : '', discount: p.discount ? '-' + p.discount + '%' : '', product_url: productUrl(p) }) })
      .then(x => x.json()).then(r => {
        if (!current || current.p !== p || !r.copy) return;
        const c = r.copy; $('#cHeadline').value = c.headline || ''; $('#cCta').value = c.cta || 'Bli tani';
        $('#cFb').value = c.facebook || ''; $('#cIg').value = c.instagram || ''; $('#cMeta').value = c.meta || '';
        renderPreview(currentFmt, current.p, productImg());
      }).catch(()=>{});
  }
}
function closeModal() { $('#modal').classList.add('hidden'); current = null; }

// ----------------------------------------------------------- wire up
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ----------------------------------------------------------- approval workflow
async function approveCurrent() {
  if (!current) return;
  const btn = $('#approve'), t = btn.textContent;
  btn.disabled = true; btn.textContent = 'Po aprovohet…';
  const p = current.p;
  const bg = (state.bg && state.bg[currentFmt]) ? state.bg[currentFmt] : '';
  const cut = (state.cutoutOn && hasCut()) ? state.cutout[p.product_id] : '';
  const payload = {
    product_id: p.product_id, product_name: p.product_name, product_url: productUrl(p),
    product_image_url: current.imgUrl,
    current_price: eur(p.price), old_price: p.discount ? eur(p.oldprice) : '',
    discount: p.discount ? ('-' + p.discount + '%') : '', category: p.category,
    selected_format: currentFmt,
    background_image: bg, product_image_render: cut || current.imgUrl,
    theme: (bg || cut) ? themeFor(p) : 'studio',
    ai_background_used: !!bg, ai_cutout_used: !!cut,
    headline: $('#cHeadline').value, cta: $('#cCta').value,
    facebook_caption: $('#cFb').value, instagram_caption: $('#cIg').value, meta_description: $('#cMeta').value,
    approved_by: state.cfg.approver,
  };
  try {
    const r = await fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(x => x.json());
    if (r.error) alert('Gabim gjatë aprovimit: ' + r.error);
    else { closeModal(); openHistory(); }
  } catch (e) { alert('Gabim: ' + e); }
  finally { btn.disabled = false; btn.textContent = t; }
}

async function openHistory() {
  $('#historyDetail').classList.add('hidden');
  $('#historyList').classList.remove('hidden');
  $('#history').classList.remove('hidden');
  let posts = [];
  try { posts = (await api('/api/approved')).posts || []; } catch (e) {}
  $('#historyList').innerHTML = !posts.length
    ? '<div class="meta" style="padding:10px 0">Asnjë post i aprovuar ende.</div>'
    : posts.map(histRow).join('');
}
function histRow(r) {
  const when = (r.approved_at || '').slice(0, 16).replace('T', ' ');
  return `<div class="hist-card">
    <img class="hist-thumb" src="${escAttr(r.feed_image_path)}" alt="" onerror="this.style.visibility='hidden'">
    <div class="hist-meta">
      <div class="hist-name">${escHtml(r.product_name)}</div>
      <div class="hist-sub">${escHtml(r.current_price || '')} ${r.discount ? '· ' + escHtml(r.discount) : ''} · ${escHtml(r.category || '')}</div>
      <div class="hist-sub">#${escHtml(String(r.product_id))} · ${escHtml(r.approved_by || '')} · ${escHtml(when)}</div>
      <span class="status ${r.status}">${r.status === 'approved' ? 'APROVUAR' : 'DRAFT'}</span>
    </div>
    <div class="hist-actions">
      <button data-act="open" data-id="${r.id}">Rihap</button>
      <button class="ghost" data-act="status" data-id="${r.id}">${r.status === 'approved' ? 'Kthe në draft' : 'Ri-aprovo'}</button>
      <button class="ghost" data-act="dry" data-id="${r.id}">Dry-run</button>
      <button disabled title="I çaktivizuar">Publiko</button>
    </div></div>`;
}
async function showDry(id) {
  const d = await fetch('/api/approved/' + id + '/dryrun', { method: 'POST' }).then(x => x.json());
  $('#dryOut').textContent = JSON.stringify(d, null, 2);
  $('#dry').classList.remove('hidden');
}
async function toggleStatus(id, to) {
  await fetch('/api/approved/' + id + '/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: to }) });
}
function metaConfirm(text) {
  return new Promise((res) => {
    $('#confirmBody').textContent = text; $('#confirm').classList.remove('hidden');
    const yes = $('#confirmYes'), no = $('#confirmNo'), cl = $('#confirmClose');
    const done = (v) => { $('#confirm').classList.add('hidden'); yes.onclick = no.onclick = cl.onclick = null; res(v); };
    yes.onclick = () => done(true); no.onclick = () => done(false); cl.onclick = () => done(false);
  });
}
async function preflightShow() {
  try { const d = await fetch('/api/meta/preflight').then((x) => x.json()); $('#dryOut').textContent = JSON.stringify(d, null, 2); $('#dry').classList.remove('hidden'); }
  catch (e) { alert('Gabim: ' + e); }
}
async function doPublish(id, platforms) {
  const label = platforms === 'both' ? 'Facebook + Instagram' : (platforms === 'facebook' ? 'Facebook' : 'Instagram');
  if (!await metaConfirm('Postimi do të publikohet LIVE në ' + label + '. Ky veprim nuk kthehet mbrapsht. Vazhdo?')) return;
  const btn = $('#pPublish'); if (btn) { btn.disabled = true; btn.textContent = 'Po publikohet…'; }
  try {
    const r = await fetch('/api/publish/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platforms }) }).then((x) => x.json());
    if (r.error) alert('Gabim: ' + r.error);
  } catch (e) { alert('Gabim: ' + e); }
  openHistoryDetail(id);
}
async function openHistoryDetail(id) {
  const r = (await fetch('/api/approved/' + id).then((x) => x.json())).record;
  if (!r) return;
  $('#historyList').classList.add('hidden');
  const d = $('#historyDetail'); d.classList.remove('hidden');
  const canPublish = (r.status === 'approved' || r.status === 'failed') && state.cfg.metaReady;
  const reason = !state.cfg.metaReady ? 'Kredencialet e Meta mungojnë — publikimi i çaktivizuar'
    : ((r.status !== 'approved' && r.status !== 'failed') ? 'Statusi është "' + r.status + '" — vetëm postet e aprovuara publikohen' : '');
  const pubok = r.status === 'published'
    ? `<div class="pubok">Publikuar ✓ ${r.published_at ? '· ' + escHtml(r.published_at.slice(0, 16).replace('T', ' ')) : ''}${r.facebook_post_id ? ' · FB id: ' + escHtml(String(r.facebook_post_id)) : ''}${r.instagram_media_id ? ' · IG id: ' + escHtml(String(r.instagram_media_id)) : ''}</div>` : '';
  const puberr = r.status === 'failed' ? `<div class="puberr">Dështoi: ${escHtml(r.error_message || '')}</div>` : '';
  d.innerHTML = `
    <button class="ghost" id="histBack">← Kthehu te lista</button>
    <h3 style="margin:10px 0 4px">${escHtml(r.product_name)} <span class="status ${r.status}">${r.status.toUpperCase()}</span></h3>
    <div class="hist-creatives">
      <figure><img src="${escAttr(r.feed_image_path)}"><figcaption>Feed 1080×1080</figcaption></figure>
      <figure><img src="${escAttr(r.story_image_path)}"><figcaption>Story 1080×1920</figcaption></figure>
      <figure><img src="${escAttr(r.reel_cover_path)}"><figcaption>Reel 1080×1920</figcaption></figure>
    </div>
    <div class="hist-fields">
      <div class="kv">${escHtml(r.current_price || '')} ${r.old_price ? '<s>' + escHtml(r.old_price) + '</s>' : ''} ${r.discount ? '· ' + escHtml(r.discount) : ''} · ${escHtml(r.category || '')}</div>
      <div class="kv">AI background: <b>${r.ai_background_used ? 'po' : 'jo'}</b> · AI cutout: <b>${r.ai_cutout_used ? 'po' : 'jo'}</b> · format: <b>${escHtml(r.selected_format || '')}</b> · ${escHtml(r.approved_by || '')}</div>
      <div class="kv"><a href="${escAttr(r.product_url)}" target="_blank" rel="noopener">${escHtml(r.product_url || '')}</a></div>
      <label>Headline <input id="eH" value="${escAttr(r.headline || '')}"></label>
      <label>CTA <input id="eC" value="${escAttr(r.cta || '')}"></label>
      <label>Facebook caption <textarea id="eF" rows="3">${escHtml(r.facebook_caption || '')}</textarea></label>
      <label>Instagram caption <textarea id="eI" rows="3">${escHtml(r.instagram_caption || '')}</textarea></label>
      <label>Meta description <textarea id="eM" rows="2">${escHtml(r.meta_description || '')}</textarea></label>
      <div class="actions"><button id="eSave">Ruaj ndryshimet</button><button class="ghost" id="eStatus">${r.status === 'draft' ? 'Ri-aprovo' : 'Kthe në draft'}</button></div>
    </div>
    <div class="pubbox">
      <div class="kv"><b>Publikimi në Meta (LIVE)</b> — status: <span class="status ${r.status}">${r.status.toUpperCase()}</span></div>
      ${pubok}${puberr}
      <label class="chk2">Platformat
        <select id="pPlat"><option value="both">Facebook + Instagram</option><option value="facebook">Vetëm Facebook</option><option value="instagram">Vetëm Instagram</option></select>
      </label>
      <div class="actions">
        <button id="pPublish" ${canPublish ? '' : 'disabled'} ${reason ? 'title="' + escAttr(reason) + '"' : ''}>${r.status === 'failed' ? '↻ Riprovo publikimin' : 'Publiko në Meta'}</button>
        <button class="ghost" id="pPre">Kontrollo Meta (preflight)</button>
        <button class="ghost" id="eDry">Dry-run Meta</button>
      </div>
      <small class="note">${reason ? escHtml(reason) : 'Publikimi është LIVE dhe kërkon konfirmim. Tokenat nuk shfaqen kurrë në UI.'}</small>
    </div>`;
  $('#histBack').onclick = openHistory;
  $('#eSave').onclick = async () => {
    const body = { id: r.id, product_id: r.product_id, headline: $('#eH').value, cta: $('#eC').value, facebook_caption: $('#eF').value, instagram_caption: $('#eI').value, meta_description: $('#eM').value, selected_format: r.selected_format };
    const x = await fetch('/api/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((y) => y.json());
    if (x.error) alert(x.error); else openHistoryDetail(id);
  };
  $('#eStatus').onclick = async () => { await toggleStatus(id, r.status === 'approved' ? 'draft' : 'approved'); openHistoryDetail(id); };
  $('#eDry').onclick = () => showDry(id);
  $('#pPre').onclick = preflightShow;
  if ($('#pPublish') && canPublish) $('#pPublish').onclick = () => doPublish(id, $('#pPlat').value);
}

async function init() {
  try { state.cfg = await api('/api/config'); } catch (e) {}
  $('#modepill').textContent = state.cfg.mode === 'live' ? 'LIVE DB' : 'SNAPSHOT';
  $('#modepill').classList.toggle('live', state.cfg.mode === 'live');
  $('#imgPattern').value = localStorage.getItem('g50_img_pattern') || state.cfg.imagePattern;

  try {
    const { categories } = await api('/api/categories');
    const sel = $('#category');
    (categories || []).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  } catch (e) {}

  $('#search').oninput = debounce(e => { state.q.search = e.target.value.trim(); state.q.offset = 0; load(); }, 300);
  $('#category').onchange = e => { state.q.category = e.target.value; state.q.offset = 0; load(); };
  $('#sort').onchange = e => { state.q.sort = e.target.value; state.q.offset = 0; load(); };
  $('#onSale').onchange = e => { state.q.onSale = e.target.checked; state.q.offset = 0; load(); };
  $('#inStock').onchange = e => { state.q.inStock = e.target.checked; state.q.offset = 0; load(); };
  $('#prev').onclick = () => { state.q.offset = Math.max(0, state.q.offset - state.q.limit); load(); window.scrollTo(0, 0); };
  $('#next').onclick = () => { state.q.offset += state.q.limit; load(); window.scrollTo(0, 0); };

  $('#settingsBtn').onclick = () => $('#settings').classList.toggle('hidden');
  $('#savePattern').onclick = () => { localStorage.setItem('g50_img_pattern', $('#imgPattern').value.trim()); load(); };
  $('#resetPattern').onclick = () => { localStorage.removeItem('g50_img_pattern'); $('#imgPattern').value = state.cfg.imagePattern; load(); };

  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.querySelectorAll('.fmt').forEach(b => b.onclick = () => {
    document.querySelectorAll('.fmt').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); currentFmt = b.dataset.fmt;
    if (current) renderPreview(currentFmt, current.p, productImg());
  });
  $('#regen').onclick = () => { if (current) { const c = genCopy(current.p); $('#cHeadline').value = c.headline; $('#cCta').value = c.cta; $('#cFb').value = c.fb; $('#cIg').value = c.ig; $('#cMeta').value = c.meta; renderPreview(currentFmt, current.p, productImg()); } };
  $('#aicopy').onclick = async () => {
    if (!current) return;
    const b = $('#aicopy'), t = b.textContent; b.disabled = true; b.textContent = 'Po shkruaj…';
    try {
      const p = current.p;
      const payload = { product_name: p.product_name, category: p.category, current_price: eur(p.price),
        old_price: p.discount ? eur(p.oldprice) : '', discount: p.discount ? '-' + p.discount + '%' : '', product_url: productUrl(p) };
      const r = await fetch('/api/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(x => x.json());
      if (r.error) { alert('Gabim: ' + r.error); }
      else { const c = r.copy; $('#cHeadline').value = c.headline || ''; $('#cCta').value = c.cta || 'Bli tani'; $('#cFb').value = c.facebook || ''; $('#cIg').value = c.instagram || ''; $('#cMeta').value = c.meta || ''; renderPreview(currentFmt, current.p, productImg()); }
    } catch (e) { alert('Gabim: ' + e); }
    finally { b.disabled = false; b.textContent = t; }
  };
  if (!state.cfg.aiCopyEnabled) { const a = $('#aicopy'); if (a) { a.disabled = true; a.title = 'Vendos GEMINI_API_KEY për tekst me AI'; } }
  $('#cCta').oninput = () => { if (current) renderPreview(currentFmt, current.p, productImg()); };

  // AI background (hybrid): Gemini makes the background; product + text stay CSS overlay.
  const bgGen = $('#bgGen'), bgClear = $('#bgClear');
  if (!state.cfg.geminiEnabled) { bgGen.disabled = true; bgGen.title = 'Vendos GEMINI_API_KEY në .env'; }
  bgGen.onclick = async () => {
    if (!current) return;
    const t = bgGen.textContent; bgGen.disabled = true; bgGen.textContent = 'Po gjenerohet…';
    try {
      const r = await fetch('/api/generate-bg', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: currentFmt, prompt: ($('#bgPrompt').value || ''), theme: themeFor(current.p) }) }).then(x => x.json());
      if (r.error) alert('Gemini: ' + r.error);
      else { state.bg[currentFmt] = r.image; renderPreview(currentFmt, current.p, productImg()); }
    } catch (e) { alert('Gabim: ' + e); }
    finally { bgGen.textContent = t; bgGen.disabled = !state.cfg.geminiEnabled; }
  };
  bgClear.onclick = () => { if (current) { state.bg = {}; renderPreview(currentFmt, current.p, productImg()); } };

  // --- product cutout (Gemini) ---
  const cutGen = $('#cutGen'), cutToggle = $('#cutToggle'), cutStatus = $('#cutStatus'), cutSetting = $('#cutSetting');
  cutSetting.checked = state.cutoutOn;
  cutSetting.onchange = (e) => { state.cutoutOn = e.target.checked; localStorage.setItem('g50_cutout', e.target.checked ? '1' : '0'); if (current) renderPreview(currentFmt, current.p, productImg()); updateCutUI(); };
  cutToggle.onchange = (e) => { state.showCutout = e.target.checked; renderPreview(currentFmt, current.p, productImg()); };
  cutGen.onclick = async () => {
    if (!current) return;
    const t = cutGen.textContent; cutGen.disabled = true; cutGen.textContent = 'Po pastrohet…';
    cutStatus.className = 'cutstatus'; cutStatus.textContent = '';
    try {
      const r = await fetch('/api/cutout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: current.imgUrl }) }).then(x => x.json());
      if (r.error) {
        cutStatus.className = 'cutstatus warn'; cutStatus.textContent = 'Cutout dështoi';
        if (confirm('Cutout dështoi: ' + r.error + '\nTë përdor foton origjinale të produktit?')) { state.showCutout = false; renderPreview(currentFmt, current.p, productImg()); }
      } else {
        state.cutout[current.p.product_id] = r.image; state.showCutout = true;
        cutStatus.className = 'cutstatus ok'; cutStatus.textContent = r.cached ? 'Cutout (cache)' : 'Cutout u krijua';
        renderPreview(currentFmt, current.p, productImg());
      }
    } catch (e) {
      cutStatus.className = 'cutstatus warn'; cutStatus.textContent = 'Gabim';
      if (confirm('Gabim: ' + e + '\nTë përdor foton origjinale të produktit?')) { state.showCutout = false; renderPreview(currentFmt, current.p, productImg()); }
    } finally { cutGen.textContent = t; updateCutUI(); }
  };

  $('#approve').onclick = approveCurrent;
  $('#historyBtn').onclick = openHistory;
  $('#historyClose').onclick = () => $('#history').classList.add('hidden');
  $('#dryClose').onclick = () => $('#dry').classList.add('hidden');
  $('#historyList').onclick = async (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.dataset.id, act = b.dataset.act;
    if (act === 'dry') showDry(id);
    else if (act === 'open') openHistoryDetail(id);
    else if (act === 'status') { await toggleStatus(id, b.textContent.indexOf('draft') > -1 ? 'draft' : 'approved'); openHistory(); }
  };

  load();
}
init();
