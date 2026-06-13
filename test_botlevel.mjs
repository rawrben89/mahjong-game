import { attachPlayer, handleRaw } from './game-core.js';
function fakeWs(){ const m=[]; return {readyState:1,msgs:m,send(s){m.push(JSON.parse(s));}}; }
for (const level of ['easy','hard']) {
  const ws=fakeWs(); attachPlayer(ws);
  handleRaw(ws, JSON.stringify({type:'setName',name:'H'}));
  handleRaw(ws, JSON.stringify({type:'createRoom'}));
  let err=null, chows=0;
  try {
    ws.msgs.length=0;
    handleRaw(ws, JSON.stringify({type:'startGame',withBots:true,botLevel:level}));
    for (let step=0; step<1500; step++){
      const st=[...ws.msgs].reverse().find(m=>m.type==='gameState');
      if (!st){ await new Promise(r=>setTimeout(r,60)); continue; }
      // count chow melds by bots
      if (st.melds) for (const pid in st.melds) for (const m of st.melds[pid]) if (m.type==='chow') chows=Math.max(chows,1);
      if (st.winner) break;
      const a=st.myActions||[]; ws.msgs.length=0;
      if (a.includes('win')) handleRaw(ws, JSON.stringify(st.phase==='claim'||st.phase==='robKong'?{type:'claim',action:'win'}:{type:'selfWin'}));
      else if (a.includes('discard')) handleRaw(ws, JSON.stringify({type:'discard',tileId:st.myHand[0].id}));
      else if (a.includes('pass')) handleRaw(ws, JSON.stringify({type:'claim',action:'pass'}));
      else if (st.phase==='draw'&&st.currentPlayer===st.myId) handleRaw(ws, JSON.stringify({type:'draw'}));
      else await new Promise(r=>setTimeout(r,90));
    }
  } catch(e){ err=e.message; }
  console.log(level, '→', err?('ERROR: '+err):'ok (ran a hand'+(chows?', bots chowed':'')+')');
}
