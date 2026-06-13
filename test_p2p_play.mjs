import { chromium } from 'playwright';
const b = await chromium.launch();
const hc = await b.newContext(); const host = await hc.newPage();
const pc = await b.newContext(); const peer = await pc.newPage();
await host.goto('http://localhost:8899/?local=1'); await host.waitForTimeout(700);
await host.fill('#nameIn','Hosty'); await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active'); await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active'); await host.waitForTimeout(1500);
const code=(await host.textContent('#roomCodeDisp')).trim();
await peer.goto('http://localhost:8899/?local=1'); await peer.waitForTimeout(700);
await peer.fill('#nameIn','Peery'); await peer.click('text=Continue →');
await peer.waitForSelector('#lobbyScreen.active'); await peer.fill('#codeIn',code); await peer.click('#codeIn ~ button');
await peer.waitForTimeout(4000);
await host.click('#startBtn'); await host.waitForTimeout(3500);

// Find who is current, have them discard, check the other side's pool grows
async function poolCount(pg){ return await pg.evaluate(()=>G?.allDiscards?.length||0); }
const beforePeerPool = await poolCount(peer);
// host is East/dealer → host discards first
const hostCur = await host.evaluate(()=>G&&G.currentPlayer===G.myId&&(G.myActions||[]).includes('discard'));
console.log('host is current discarder:', hostCur);
if (hostCur) {
  await host.evaluate(()=>{ const id=G.myHand[0].id; tileClick(id); tileClick(id); });
  await host.waitForTimeout(1500);
}
const afterPeerPool = await poolCount(peer);
console.log('peer pool before host discard:', beforePeerPool, '→ after:', afterPeerPool);
console.log('host discard propagated to peer:', afterPeerPool>beforePeerPool);

// Now let bots/peer play a few cycles, ensure no desync errors
const pErr=[]; peer.on('pageerror',e=>pErr.push(e.message));
const hErr=[]; host.on('pageerror',e=>hErr.push(e.message));
for(let i=0;i<4;i++){
  for(const pg of [host,peer]){
    await pg.evaluate(()=>{ if(G&&G.currentPlayer===G.myId){ if((G.myActions||[]).includes('discard')&&G.myHand?.length){const id=G.myHand[0].id;tileClick(id);tileClick(id);} else if(G.phase==='draw'){tx({type:'draw'});} } const pass=document.querySelector('#actionOverlay .abtn.pass'); if(pass)pass.click(); });
    await pg.waitForTimeout(900);
  }
}
const hWall = await host.evaluate(()=>G?.wallCount);
const pWall = await peer.evaluate(()=>G?.wallCount);
console.log('wall — host:',hWall,'peer:',pWall,'| in sync:', hWall===pWall);
console.log('errors host:',hErr.slice(0,3),'peer:',pErr.slice(0,3));
await b.close();
