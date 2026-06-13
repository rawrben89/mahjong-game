import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto('http://localhost:8899/?local=1');
await p.waitForTimeout(3500); // SW + precache
// Check what got cached
const cached = await p.evaluate(async ()=>{
  const c = await caches.open('hkmj-v1');
  const keys = await c.keys();
  return keys.map(r=>new URL(r.url).pathname);
});
console.log('cached paths:', cached.filter(x=>/game-core|local-core|peerjs|client/.test(x)));
await ctx.setOffline(true);
const p2 = await ctx.newPage();
const e2=[]; p2.on('pageerror',e=>e2.push('ERR:'+e.message)); p2.on('console',m=>{if(m.type()==='error')e2.push('CON:'+m.text());}); p2.on('requestfailed',r=>e2.push('REQFAIL:'+new URL(r.url).pathname));
await p2.goto('http://localhost:8899/?local=1');
await p2.waitForTimeout(3000);
const diag = await p2.evaluate(()=>({ hasPeer:!!window.Peer, hasCore:!!window.__localCore, LOCAL_MODE:typeof LOCAL_MODE!=='undefined'?LOCAL_MODE:'undef' }));
console.log('offline diag:', diag);
console.log('offline events:', [...new Set(e2)].slice(0,8));
await b.close();
