import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:3000');
await p.fill('#nameIn','Host'); await p.click('text=Continue →');
await p.waitForSelector('#lobbyScreen.active'); await p.click('text=Create New Room');
await p.waitForSelector('#waitingScreen.active'); await p.click('#startBtn');
await p.waitForTimeout(3000);
console.log('isHost at start:', await p.evaluate(()=>isHost));
// Drive to a finish: discard fast, pass claims
let finished=false;
for(let i=0;i<400 && !finished;i++){
  await p.evaluate(()=>{
    if(G&&G.currentPlayer===G.myId){ if((G.myActions||[]).includes('discard')&&G.myHand?.length){const id=G.myHand[0].id;tileClick(id);tileClick(id);} else if(G.phase==='draw')tx({type:'draw'}); }
    const x=document.querySelector('#actionOverlay .abtn.pass'); if(x)x.click();
    const w=document.querySelector('#actionOverlay .abtn.win'); if(w)w.click(); // take wins to finish faster
  });
  finished = await p.evaluate(()=>!!(G&&G.winner));
  await p.waitForTimeout(700);
}
console.log('game finished:', finished, '| winner:', await p.evaluate(()=>G?.winner===myId?'me':G?.winner));
await p.waitForTimeout(2000); // let win screen appear
const winShown = await p.evaluate(()=>getComputedStyle(document.getElementById('winScreen')).display!=='none');
const btnShown = await p.evaluate(()=>{const e=document.getElementById('nextRoundBtn');return getComputedStyle(e).display!=='none';});
const hintShown = await p.evaluate(()=>{const e=document.getElementById('nextHint');return getComputedStyle(e).display!=='none';});
const isHostNow = await p.evaluate(()=>isHost);
console.log('win screen shown:', winShown, '| nextRoundBtn visible:', btnShown, '| waiting-hint visible:', hintShown, '| isHost:', isHostNow);
// Click Next Round
const roundBefore = await p.evaluate(()=>G?.round);
await p.evaluate(()=>requestNextRound());
await p.waitForTimeout(3500);
const afterWinner = await p.evaluate(()=>G?.winner);
const afterRound = await p.evaluate(()=>G?.round);
const backInGame = await p.evaluate(()=>document.getElementById('gameScreen').classList.contains('active') && getComputedStyle(document.getElementById('winScreen')).display==='none');
console.log('after Next Round → new hand dealt:', afterWinner==null && backInGame, '| round', roundBefore, '→', afterRound);
console.log('errors:', errs.slice(0,5));
await b.close();
