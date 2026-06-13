import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
// First online visit to install SW + cache everything (LOCAL_MODE via ?local=1)
await p.goto('http://localhost:8899/?local=1');
await p.waitForTimeout(3000); // SW install + precache
// trigger a game once online so all assets are fetched & cached
await p.fill('#nameIn','Solo'); await p.click('text=Continue →');
await p.waitForSelector('#lobbyScreen.active',{timeout:8000});
await p.click('text=Create New Room'); await p.waitForSelector('#waitingScreen.active',{timeout:8000});
await p.click('#startBtn'); await p.waitForTimeout(3000);
console.log('online solo started OK; caching done');
// NOW GO OFFLINE — reinstall fresh page from cache and play
await ctx.setOffline(true);
const p2 = await ctx.newPage();
const e2=[]; p2.on('pageerror',e=>e2.push(e.message));
await p2.goto('http://localhost:8899/?local=1');
await p2.waitForTimeout(2500);
const shell = await p2.evaluate(()=>!!document.getElementById('nameIn'));
await p2.fill('#nameIn','Offline'); await p2.click('text=Continue →');
await p2.waitForSelector('#lobbyScreen.active',{timeout:8000}).catch(()=>{});
await p2.click('text=Create New Room').catch(()=>{});
await p2.waitForSelector('#waitingScreen.active',{timeout:8000}).catch(()=>{});
await p2.click('#startBtn').catch(()=>{});
await p2.waitForTimeout(3500);
const offlineInGame = await p2.evaluate(()=>document.getElementById('gameScreen')?.classList.contains('active'));
const offlineHand = await p2.evaluate(()=>(typeof G!=='undefined'&&G)?G.myHand?.length:0);
console.log('OFFLINE: shell loaded:', shell, '| solo game in progress:', offlineInGame, '| hand:', offlineHand);
console.log('offline errors:', e2.slice(0,3));
await b.close();
