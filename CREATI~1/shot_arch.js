const {chromium}=require('playwright');
(async()=>{try{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  const p=await b.newPage({viewport:{width:1520,height:720},deviceScaleFactor:2});
  await p.goto('file:///sessions/magical-funny-feynman/mnt/outputs/docs/architecture.svg',{waitUntil:'load'});
  await p.waitForTimeout(300);
  await p.screenshot({path:'/sessions/magical-funny-feynman/mnt/outputs/docs/architecture.png'});
  await b.close(); console.log('png ok');
}catch(e){console.log('ERR',e.message);process.exit(1);}})();
