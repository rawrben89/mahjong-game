import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:3000');
await p.waitForTimeout(2500); // let SW install + cache
const swState = await p.evaluate(async ()=>{
  const reg = await navigator.serviceWorker.getRegistration();
  return { hasSW: !!reg, active: !!reg?.active, controller: !!navigator.serviceWorker.controller };
});
console.log('SW registered:', swState);
// manifest present
const hasManifest = await p.evaluate(()=>!!document.querySelector('link[rel=manifest]'));
console.log('manifest linked:', hasManifest);
// Go offline and reload — should still load from cache
await ctx.setOffline(true);
await p.reload();
await p.waitForTimeout(1500);
const offlineWorks = await p.evaluate(()=>!!document.getElementById('nameIn'));
const title = await p.title();
console.log('OFFLINE reload works:', offlineWorks, '| title:', title);
// can we reach the lobby offline (engine in-browser)? add ?local=1 won't trigger on localhost; just check name screen renders
await p.screenshot({path:'/tmp/pwa_offline.png'});
console.log('errors:', errs.slice(0,3));
await b.close();
