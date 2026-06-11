const { chromium } = require('playwright');
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b = await chromium.launch();
  const p = await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2}).then(c=>c.newPage());
  await p.goto('http://localhost:3000',{waitUntil:'load',timeout:60000});
  await sleep(3000);
  await fetch('http://localhost:8000/api/incidents/trigger',{method:'POST'});
  await sleep(9000);
  await p.screenshot({path:'preflight.png', fullPage:false});
  // quick content probe
  const txt = await p.evaluate(()=>document.body.innerText.slice(0,500));
  console.log('BODY_TEXT_SAMPLE:', JSON.stringify(txt.replace(/\s+/g,' ').slice(0,300)));
  await b.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
