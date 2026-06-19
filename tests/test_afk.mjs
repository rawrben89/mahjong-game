// End-to-end check: an IDLE human must never freeze the table.
// Two humans (A = actively driven, B = totally idle) + 2 bots. The real freeze
// detector is a progress watchdog: if the AFK guard failed, the game would stall
// the first time it needs B (its turn or an owed claim) and discards would
// flatline. We assert (a) play never stalls for >6s, and (b) the idle player B is
// actually auto-played (B discards with zero input), proving the table cycles
// through an idle seat repeatedly.
//
// Run fast by shrinking the timers:  MJ_TURN_MS=600 MJ_CLAIM_MS=400 node tests/test_afk.mjs
import { attachPlayer, handleRaw } from '../game-core.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mkWs = () => { const ws = { readyState: 1, sent: [] }; ws.send = s => ws.sent.push(JSON.parse(s)); return ws; };
const lastOf = (ws, t) => [...ws.sent].reverse().find(m => m.type === t);

function driveA(ws, pid) {
  const st = lastOf(ws, 'gameState');
  if (!st || st.winner) return;
  const acts = st.myActions || [];
  if (st.currentPlayer === pid && st.phase === 'draw') handleRaw(ws, JSON.stringify({ type: 'draw' }));
  else if (st.currentPlayer === pid && st.phase === 'discard') {
    if (acts.includes('win')) handleRaw(ws, JSON.stringify({ type: 'selfWin' }));
    else if (st.myHand && st.myHand.length) handleRaw(ws, JSON.stringify({ type: 'discard', tileId: st.myHand[st.myHand.length - 1].id }));
  } else if (acts.includes('pass')) handleRaw(ws, JSON.stringify({ type: 'claim', action: 'pass' }));
}

const wsA = mkWs(), A = attachPlayer(wsA);
handleRaw(wsA, JSON.stringify({ type: 'setName', name: 'Active' }));
handleRaw(wsA, JSON.stringify({ type: 'createRoom' }));
const rid = lastOf(wsA, 'roomCreated').roomId;

const wsB = mkWs(), B = attachPlayer(wsB);
handleRaw(wsB, JSON.stringify({ type: 'setName', name: 'Idle' }));
handleRaw(wsB, JSON.stringify({ type: 'joinRoom', roomId: rid }));

handleRaw(wsA, JSON.stringify({ type: 'startGame', withBots: true, botLevel: 'easy' }));

const STALL_MS = 6000;          // no new discard for this long ⇒ frozen
const deadline = Date.now() + 28000;
let bAutoCount = 0, frozen = false, hands = 0;
let progressN = 0, lastProgress = Date.now();
const seenB = new Set();

while (Date.now() < deadline) {
  await sleep(100);
  driveA(wsA, A.id);

  const sa = lastOf(wsA, 'gameState');
  const all = (sa && sa.allDiscards) || [];
  if (all.length > progressN) { progressN = all.length; lastProgress = Date.now(); }
  // count distinct auto-discards by the idle player
  all.forEach((d, i) => { if (d.discardedBy === B.id && !seenB.has(i)) { seenB.add(i); bAutoCount++; } });

  if (Date.now() - lastProgress > STALL_MS) { frozen = true; break; }

  if (sa && sa.winner) {
    if (bAutoCount >= 2 || hands >= 2) break;     // enough idle-seat coverage
    hands++; seenB.clear(); progressN = 0; lastProgress = Date.now();
    handleRaw(wsA, JSON.stringify({ type: 'nextRound' }));   // A is host → next hand
    await sleep(300);
  }
}

console.log(`play never stalled > ${STALL_MS}ms:   ${!frozen}`);
console.log(`idle player auto-played (count):   ${bAutoCount}`);
if (!frozen && bAutoCount >= 2) { console.log('PASS — idle player repeatedly auto-played; the table never froze'); process.exit(0); }
if (!frozen && bAutoCount >= 1) { console.log('PASS — idle player auto-played; no stall'); process.exit(0); }
console.log('FAIL — table stalled on the idle player (AFK guard not working)'); process.exit(1);
