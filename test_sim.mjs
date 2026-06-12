import { attachPlayer, handleRaw } from './game-core.js';
function fakeWs(){ const msgs=[]; return {readyState:1,msgs,send(s){msgs.push(JSON.parse(s));}}; }
const ws=fakeWs(); attachPlayer(ws);
handleRaw(ws, JSON.stringify({type:'setName',name:'Sim'}));
handleRaw(ws, JSON.stringify({type:'createRoom'}));

let wins=0, draws=0, fanSeen=[], totals=[];
const HANDS=5;
for (let hand=0; hand<HANDS; hand++) {
  ws.msgs.length=0;
  handleRaw(ws, JSON.stringify({type:'startGame', withBots:true}));
  let st=null, done=false;
  for (let step=0; step<4000 && !done; step++) {
    const latest=[...ws.msgs].reverse().find(m=>m.type==='gameState');
    if (latest) { st=latest; ws.msgs.length=0; }
    if (!st) { await new Promise(r=>setTimeout(r,100)); continue; }
    if (st.winner) {
      if (st.winner==='draw') draws++;
      else { wins++; if (st.winScore){ fanSeen.push(st.winScore.fan); totals.push(st.winScore.total); } }
      done=true; break;
    }
    const acts=st.myActions||[];
    if (acts.includes('win')) { handleRaw(ws, JSON.stringify(st.phase==='claim'||st.phase==='robKong'?{type:'claim',action:'win'}:{type:'selfWin'})); st=null; }
    else if (acts.includes('discard')) { const t=st.myHand[Math.floor(Math.random()*st.myHand.length)]; handleRaw(ws, JSON.stringify({type:'discard',tileId:t.id})); st=null; }
    else if (acts.includes('pass')) { handleRaw(ws, JSON.stringify({type:'claim',action:'pass'})); st=null; }
    else if (st.phase==='draw' && st.currentPlayer===st.myId) { handleRaw(ws, JSON.stringify({type:'draw'})); st=null; }
    else { await new Promise(r=>setTimeout(r,150)); }
  }
  console.log(`hand ${hand}: winner=${st?.winner} fan=${st?.winScore?.fan}`); if (!done) console.log('hand', hand, 'did not finish (stuck?) phase:', st?.phase);
  await new Promise(r=>setTimeout(r,1200));
  ws.msgs.length=0;
  handleRaw(ws, JSON.stringify({type:'newGame'}));
  await new Promise(r=>setTimeout(r,150));
}
console.log(`hands=${HANDS} wins=${wins} draws=${draws}`);
console.log('fan:', fanSeen.join(','), '| totals:', totals.join(','));
console.log(fanSeen.every(f=>f>=3) ? 'MIN FAN RESPECTED' : 'MIN FAN VIOLATION!');
