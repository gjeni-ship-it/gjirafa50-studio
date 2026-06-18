const { chromium } = require('playwright');
(async()=>{
  const tries = [
    {name:'shell std', opts:{args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}},
    {name:'full chrome new-headless', opts:{executablePath:process.env.CHROME, args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}},
  ];
  for(const t of tries){
    try{
      const b=await chromium.launch(t.opts);
      const p=await b.newPage({viewport:{width:300,height:300}});
      await p.setContent('<div style="width:300px;height:300px;background:#E4002B"></div>');
      await p.screenshot({path:'/tmp/probe_'+t.name.replace(/\W/g,'_')+'.png'});
      await b.close();
      console.log('OK ->',t.name);
    }catch(e){ console.log('FAIL ->',t.name,'::',String(e).split('\n')[0]); }
  }
})();
