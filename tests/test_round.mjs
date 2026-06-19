import { attachPlayer, handleRaw } from '../game-core.js';
function fakeWs(){ const msgs=[]; return {readyState:1,msgs,send(s){msgs.push(JSON.parse(s));}}; }
const ws=fakeWs(); attachPlayer(ws);
handleRaw(ws, JSON.stringify({type:'setName',name:'Host'}));
handleRaw(ws, JSON.stringify({type:'createRoom'}));

const hands=[];
for (let hand=0; hand<6; hand++){
  ws.msgs.length=0;
  handleRaw(ws, JSON.stringify({type:hand===0?'startGame':'nextRound', withBots:true}));
  let st=null, winner=null, dealer=null, wind=null, round=null, windChanged=null;
  for (let step=0; step<5000; step++){
    const gs=[...ws.msgs].reverse().find(m=>m.type==='gameState');
    const started=[...ws.msgs].find(m=>m.type==='gameStarted');
    if (started && started.windChanged) windChanged=started.windChanged;
    if (gs){ st=gs; wind=gs.prevailingWind; round=gs.round; dealer=gs.players.find(p=>gs.seatWinds[p.id]==='east')?.name; ws.msgs.length=0; }
    if (!st){ await new Promise(r=>setTimeout(r,80)); continue; }
    if (st.winner){ winner = st.winner==='draw'?'draw':(st.players.find(p=>p.id===st.winner)?.name); break; }
    const acts=st.myActions||[];
    if (acts.includes('win')) { handleRaw(ws, JSON.stringify(st.phase==='claim'||st.phase==='robKong'?{type:'claim',action:'win'}:{type:'selfWin'})); st=null; }
    else if (acts.includes('discard')) { handleRaw(ws, JSON.stringify({type:'discard',tileId:st.myHand[0].id})); st=null; }
    else if (acts.includes('pass')) { handleRaw(ws, JSON.stringify({type:'claim',action:'pass'})); st=null; }
    else if (st.phase==='draw'&&st.currentPlayer===st.myId){ handleRaw(ws, JSON.stringify({type:'draw'})); st=null; }
    else { await new Promise(r=>setTimeout(r,120)); }
  }
  hands.push({hand:hand+1, dealer, wind, round, winner, windChanged});
  console.log(`hand ${hand+1}: dealer=${dealer} prevailingWind=${wind} roundNo=${round} winner=${winner}${windChanged?' WIND→'+windChanged:''}`);
  await new Promise(r=>setTimeout(r,1200));
}
// Validate: dealer stays iff dealer won; rotates otherwise
let ok=true;
for(let i=1;i<hands.length;i++){
  const prev=hands[i-1], cur=hands[i];
  const dealerWon = prev.winner===prev.dealer;
  if (dealerWon && cur.dealer!==prev.dealer) { console.log('✗ dealer should have stayed after dealer win at hand',i+1); ok=false; }
  if (!dealerWon && prev.winner!=='draw' && cur.dealer===prev.dealer) { console.log('✗ dealer should have rotated after non-dealer win at hand',i+1); ok=false; }
}
console.log(ok?'✓ ROTATION RULES OK':'✗ rotation issues');
