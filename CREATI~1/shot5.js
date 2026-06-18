const {chromium}=require('playwright');
(async()=>{try{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const p=await b.newPage({viewport:{width:1200,height:1050}});
  await p.goto('http://localhost:3000/',{waitUntil:'load'});
  await p.waitForTimeout(500);
  await p.click('#historyBtn'); await p.waitForSelector('.hist-card button[data-act="open"]',{timeout:8000});
  await p.click('.hist-card button[data-act="open"]'); await p.waitForTimeout(900);
  await p.screenshot({path:'/sessions/magical-funny-feynman/mnt/outputs/platform/shot_publish_detail.png'});
  await p.click('#pPre'); await p.waitForTimeout(2500);  // preflight (real graph call w/ fake token)
  await p.screenshot({path:'/sessions/magical-funny-feynman/mnt/outputs/platform/shot_preflight.png'});
  console.log('shots ok'); await b.close();
}catch(e){console.log('ERR',e.message);process.exit(1);}})();
