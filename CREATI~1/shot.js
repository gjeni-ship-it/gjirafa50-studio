const {chromium}=require('playwright');
const prod="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#c9d2dc"/></linearGradient></defs><rect x="105" y="55" width="90" height="190" rx="16" fill="url(#g)" stroke="#aeb8c4" stroke-width="3"/><rect x="116" y="72" width="68" height="140" rx="8" fill="#0e1726"/><circle cx="150" cy="228" r="9" fill="#aeb8c4"/></svg>').toString('base64');
// sample "AI background" scene (soft studio gradient + blobs) to mock Gemini
const scene="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080"><defs><radialGradient id="r" cx="72%" cy="40%" r="70%"><stop offset="0" stop-color="#fbeee2"/><stop offset="55%" stop-color="#f1ece6"/><stop offset="100%" stop-color="#e7ded4"/></radialGradient></defs><rect width="1080" height="1080" fill="url(#r)"/><ellipse cx="760" cy="430" rx="360" ry="300" fill="#ffffff" opacity="0.5"/><ellipse cx="300" cy="850" rx="380" ry="260" fill="#e3d8ca" opacity="0.4"/></svg>').toString('base64');
const OUT='/sessions/magical-funny-feynman/mnt/outputs/platform';
(async()=>{try{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const p=await b.newPage({viewport:{width:1200,height:1000}});
  await p.addInitScript(v=>localStorage.setItem('g50_img_pattern',v),prod);
  // mock the Gemini background endpoint
  await p.route('**/api/generate-bg',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({image:scene})}));
  await p.goto('http://localhost:3000/',{waitUntil:'load'});
  await p.waitForSelector('.card .gen-btn',{timeout:8000}); await p.waitForTimeout(300);
  await (await p.$('.card .gen-btn:not([disabled])')).click(); await p.waitForTimeout(600);
  // force-enable the button (no key locally) then click to apply mocked bg
  await p.evaluate(()=>{const b=document.querySelector('#bgGen'); b.disabled=false;});
  await p.click('#bgGen'); await p.waitForTimeout(700);
  await p.screenshot({path:OUT+'/shot_hybrid.png'}); console.log('hybrid shot ok');
  await b.close();
}catch(e){console.log('ERR',e.message);process.exit(1);}})();
