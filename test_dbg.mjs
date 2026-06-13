import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
const logs=[];
p.on('pageerror',e=>logs.push('PAGEERROR: '+e.message));
p.on('console',m=>logs.push(m.type()+': '+m.text()));
p.on('requestfailed',r=>logs.push('REQFAIL: '+r.url()+' '+r.failure()?.errorText));
await p.goto('https://rawrben89.github.io/mahjong-game/', {waitUntil:'networkidle'});
await p.waitForTimeout(3000);
const diag = await p.evaluate(()=>({
  LOCAL_MODE: typeof LOCAL_MODE!=='undefined'?LOCAL_MODE:'undefined',
  hasPeer: !!window.Peer,
  hasLocalCore: !!window.__localCore,
  submitNameType: typeof submitName,
  hostname: location.hostname,
}));
console.log('DIAG:', JSON.stringify(diag,null,1));
console.log('LOGS:'); logs.forEach(l=>console.log('  '+l));
await b.close();
