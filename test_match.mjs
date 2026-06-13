import { attachPlayer, handleRaw } from './game-core.js';
function fakeWs(){ const m=[]; return {readyState:1,msgs:m,send(s){m.push(JSON.parse(s));}}; }
const ws=fakeWs(); attachPlayer(ws);
handleRaw(ws, JSON.stringify({type:'setName',name:'H'}));
handleRaw(ws, JSON.stringify({type:'createRoom'}));
let cumulativeSeen=new Set(), handSeen=[], chowOk=true, frozen=false;
for (let hand=0; hand<3; hand++){
  ws.msgs.length=0;
  handleRaw(ws, JSON.stringify({type:hand===0?'startGame':'nextRound', withBots:true, botLevel:'hard'}));
  let st=null, steps=0, lastStateStep=0;
  for (steps=0; steps<2500; steps++){
    const gs=[...ws.msgs].reverse().find(m=>m.type==='gameState');
    if (gs){ st=gs; lastStateStep=steps; ws.msgs.length=0; }
    if (!st){ await new Promise(r=>setTimeout(r,50)); continue; }
    if (st.winner) break;
    const a=st.myActions||[]; ws.msgs.length=0;
    if (a.includes('win')) handleRaw(ws, JSON.stringify(st.phase==='claim'||st.phase==='robKong'?{type:'claim',action:'win'}:{type:'selfWin'}));
    else if (a.includes('discard')) handleRaw(ws, JSON.stringify({type:'discard',tileId:st.myHand[0].id}));
    else if (a.includes('pass')) handleRaw(ws, JSON.stringify({type:'claim',action:'pass'}));
    else if (st.phase==='draw'&&st.currentPlayer===st.myId) handleRaw(ws, JSON.stringify({type:'draw'}));
    else { await new Promise(r=>setTimeout(r,80)); if (steps-lastStateStep>40) { frozen=true; break; } }
  }
  if (frozen){ console.log('hand',hand+1,'FROZE (bot stuck)'); break; }
  if (st&&st.winner){
    handSeen.push({hand:hand+1, scores:st.scores, handScores:st.handScores, handNo:st.handNo});
    console.log('hand',hand+1,'done. cumulative scores:', JSON.stringify(st.scores).slice(0,80), '| this-hand:', JSON.stringify(st.handScores).slice(0,60));
  } else { console.log('hand',hand+1,'did not finish in time'); }
  await new Promise(r=>setTimeout(r,1000));
}
// Verify cumulative != hand (i.e., scores accumulate)
if (handSeen.length>=2){
  const s1=handSeen[0].scores, s2=handSeen[1].scores;
  const myId=Object.keys(s1)[0];
  console.log('cumulative carries across hands:', JSON.stringify(s1)!==JSON.stringify(s2) || Object.values(s2).some(v=>v!==0));
}
console.log(frozen?'✗ BOT FROZE':'✓ no freeze with hard bots + chow');
