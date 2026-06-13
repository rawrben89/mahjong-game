import { chromium } from 'playwright';
const b = await chromium.launch();
// Simulate github.io by appending ?local=1 (the LOCAL_MODE trigger)
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error') errs.push('console: '+m.text()); });
await p.goto('http://localhost:8899/?local=1');
await p.waitForTimeout(500);
await p.fill('#nameIn','Solo'); await p.click('text=Continue →');
await p.waitForSelector('#lobbyScreen.active', {timeout:5000});
console.log('reached lobby (no server)');
await p.click('text=Create New Room');
await p.waitForSelector('#waitingScreen.active', {timeout:5000});
console.log('created room locally');
await p.click('#startBtn');
await p.waitForTimeout(3000);
const inGame = await p.evaluate(()=>document.getElementById('gameScreen').classList.contains('active'));
const handSize = await p.evaluate(()=>G?.myHand?.length||0);
console.log('game started:', inGame, '| my hand size:', handSize);
// play a few discards to confirm the engine + bots are live in-browser
for(let i=0;i<4;i++){
  const acted = await p.evaluate(()=>{ if(G&&(G.myActions||[]).includes('discard')&&G.myHand?.length){const id=G.myHand[0].id;tileClick(id);tileClick(id);return true;} return false; });
  await p.waitForTimeout(1800);
}
const wall = await p.evaluate(()=>G?.wallCount);
await p.screenshot({path:'/tmp/pages_game.png'});
console.log('wall count after turns (engine running):', wall);
console.log('errors:', errs);
await b.close();
