const {chromium}=require('playwright');
const OUT='/sessions/magical-funny-feynman/mnt/outputs/platform';
(async()=>{try{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const p=await b.newPage({viewport:{width:1200,height:1000}});
  const imgs={ok:0,fail:0};
  p.on('response',r=>{ if(/50cdn\.gjirafamall\.tech/.test(r.url())){ r.status()<400?imgs.ok++:imgs.fail++; }});
  await p.goto('http://localhost:3000/',{waitUntil:'load'});
  await p.waitForSelector('.card',{timeout:8000});
  await p.waitForTimeout(4000); // let CDN images load
  await p.screenshot({path:OUT+'/shot_live_grid.png'});
  console.log('CDN responses seen — ok:',imgs.ok,'fail:',imgs.fail);
  // open Generate on first product with a working image
  const btn=await p.$('.card .gen-btn:not([disabled])');
  if(btn){ await btn.click(); await p.waitForTimeout(2500); await p.screenshot({path:OUT+'/shot_live_modal.png'}); console.log('modal shot ok'); }
  else console.log('all gen buttons disabled (images blocked from sandbox?)');
  await b.close();
}catch(e){console.log('ERR',e.message);process.exit(1);}})();
