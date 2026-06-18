const {chromium}=require('playwright');
// original product = phone on a WHITE card (so the "before" shows a white box on the AI bg)
const prodWhite="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#ffffff"/><rect x="105" y="55" width="90" height="190" rx="16" fill="#dfe5ec" stroke="#aeb8c4" stroke-width="3"/><rect x="116" y="72" width="68" height="140" rx="8" fill="#0e1726"/></svg>').toString('base64');
// cutout = phone only, transparent background
const cut="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect x="105" y="55" width="90" height="190" rx="16" fill="#dfe5ec" stroke="#aeb8c4" stroke-width="3"/><rect x="116" y="72" width="68" height="140" rx="8" fill="#0e1726"/></svg>').toString('base64');
const scene="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><defs><radialGradient id="r" cx="70%" cy="38%" r="74%"><stop offset="0" stop-color="#fdeede"/><stop offset="55%" stop-color="#eee6dc"/><stop offset="100%" stop-color="#ddcfbe"/></radialGradient></defs><rect width="1080" height="1080" fill="url(#r)"/><ellipse cx="780" cy="430" rx="380" ry="320" fill="#ffffff" opacity="0.5"/></svg>').toString('base64');
const OUT='/sessions/magical-funny-feynman/mnt/outputs/platform';
(async()=>{try{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const p=await b.newPage({viewport:{width:1200,height:1000}});
  await p.addInitScript(v=>localStorage.setItem('g50_img_pattern',v),prodWhite);
  await p.route('**/api/generate-bg',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({image:scene})}));
  await p.route('**/api/cutout',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({image:cut})}));
  await p.goto('http://localhost:3000/',{waitUntil:'load'});
  await p.waitForSelector('.card .gen-btn',{timeout:8000}); await p.waitForTimeout(300);
  await (await p.$('.card .gen-btn:not([disabled])')).click(); await p.waitForTimeout(500);
  await p.evaluate(()=>{document.querySelector('#bgGen').disabled=false; document.querySelector('#cutGen').disabled=false;});
  await p.click('#bgGen'); await p.waitForTimeout(500);     // apply AI background
  await p.click('#cutGen'); await p.waitForTimeout(700);    // apply cutout (Pas)
  await p.screenshot({path:OUT+'/shot_cutout_after.png'});
  await p.evaluate(()=>{const t=document.querySelector('#cutToggle'); t.checked=false; t.dispatchEvent(new Event('change'));});
  await p.waitForTimeout(500);
  await p.screenshot({path:OUT+'/shot_cutout_before.png'});  // original (white box) on AI bg
  console.log('cutout shots ok'); await b.close();
}catch(e){console.log('ERR',e.message);process.exit(1);}})();
