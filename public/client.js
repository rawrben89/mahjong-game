'use strict';
// ─── State ────────────────────────────────────────────────────────────────────
let ws, myId, myName = '', roomId = null, isHost = false;
let G = null, prevG = null, selTile = null;
let lastDrawnTileId = null, prevHandIds = new Set();
let unreadCount = 0, chatOpen = true, pendingWindBanner = null;
let phaserGame = null;
// Persisted UI settings (sound on by default, hints off by default)
function loadSetting(key, dflt){ try { const v=localStorage.getItem(key); return v==null?dflt:v==='1'; } catch { return dflt; } }
function saveSetting(key, val){ try { localStorage.setItem(key, val?'1':'0'); } catch {} }
let soundEnabled = loadSetting('mj_sound', true);
let hintsEnabled = loadSetting('mj_hints', false);
// Wins this match, tracked client-side (server only sends scores) — keyed by player id
let matchWins = {};

const FONT = '"M PLUS Rounded 1c","Segoe UI",sans-serif';
// Seat-wind accent colours (match the mahjong-scoreboard palette)
const WIND_COL = { east:0xc0392b, south:0x27ae60, west:0xe0a32e, north:0x4a78c8 };
const WIND_INI = { east:'E', south:'S', west:'W', north:'N' };
const WINDS_ARR = ['east','south','west','north'];
const WE = { east:'🀀', south:'🀁', west:'🀂', north:'🀃' };
const WL = { east:'East', south:'South', west:'West', north:'North' };

// ─── Tile helpers ─────────────────────────────────────────────────────────────
const TE = {
  bamboo:     ['🀐','🀑','🀒','🀓','🀔','🀕','🀖','🀗','🀘'],
  characters: ['🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏'],
  circles:    ['🀙','🀚','🀛','🀜','🀝','🀞','🀟','🀠','🀡'],
  wind:   { east:'🀀', south:'🀁', west:'🀂', north:'🀃' },
  dragon: { red:'🀄', green:'🀅', white:'🀆' },
  flower: ['🀢','🀣','🀤','🀥'],
  season: ['🀦','🀧','🀨','🀩'],
};
// Suit colour accents (hex numbers for Phaser Graphics)
const SUIT_COLOR = {
  bamboo:0x1abc9c, characters:0xe74c3c, circles:0x3498db,
  wind:0xf39c12, dragon:0x9b59b6, flower:0xe91e63, season:0x00bcd4,
};
// Tile background tint per suit
const SUIT_BG = {
  bamboo:0xf2fff7, characters:0xfff5f5, circles:0xf5f6ff,
  wind:0xfffdf0, dragon:0xfbf5ff, flower:0xfff0f7, season:0xf0fdff,
};

// Texture key for the SVG tile art (assets/tiles/*.svg)
const WIND_NUM = { east:1, south:2, west:3, north:4 };
const DRAGON_NUM = { red:1, green:2, white:3 };
function tileTexKey(t) {
  if (!t) return null;
  if (t.suit==='characters') return 'tile-w'+t.value;
  if (t.suit==='bamboo')     return 'tile-s'+t.value;
  if (t.suit==='circles')    return 'tile-t'+t.value;
  if (t.suit==='wind')       return WIND_NUM[t.value]   ? 'tile-f'+WIND_NUM[t.value]   : null;
  if (t.suit==='dragon')     return DRAGON_NUM[t.value] ? 'tile-d'+DRAGON_NUM[t.value] : null;
  if (t.suit==='flower')     return 'tile-h'+(t.value+4); // h5-h8 = 梅蘭菊竹
  if (t.suit==='season')     return 'tile-h'+t.value;     // h1-h4 = 春夏秋冬
  return null;
}
function tileSrc(t) { const k=tileTexKey(t); return k ? 'assets/tiles/'+k.slice(5)+'.svg' : ''; }
function tileImg(t, cls='') {
  const src=tileSrc(t);
  if (!src) return te(t);
  return `<img class="${cls}" src="${src}" alt="${esc(tname(t))}" title="${esc(tname(t))}" draggable="false">`;
}

function te(t) {
  if (!t) return '';
  if (t.suit==='bamboo'||t.suit==='characters'||t.suit==='circles') return TE[t.suit][t.value-1]||String(t.value);
  if (t.suit==='wind') return TE.wind[t.value]||t.value;
  if (t.suit==='dragon') return TE.dragon[t.value]||t.value;
  if (t.suit==='flower') return TE.flower[t.value-1]||'🌸';
  if (t.suit==='season') return TE.season[t.value-1]||'🌿';
  return '?';
}
function tname(t) {
  if (!t) return '';
  if (t.suit==='wind') return WL[t.value]+' Wind';
  if (t.suit==='dragon') return t.value[0].toUpperCase()+t.value.slice(1)+' Dragon';
  if (t.suit==='flower') return ['Plum','Orchid','Chrysanthemum','Bamboo'][t.value-1]||'Flower '+t.value;
  if (t.suit==='season') return ['Spring','Summer','Autumn','Winter'][t.value-1]||'Season '+t.value;
  return t.value+' '+({bamboo:'Bamboo',characters:'Character',circles:'Circle'}[t.suit]||t.suit);
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ─── Hint engine (optional, opt-in) ─────────────────────────────────────────────
// A compact self-contained hand analyser so hints work in BOTH multiplayer and
// solo/P2P modes (no dependency on the server or game-core.js being loaded).
const SUIT_SEQ = { bamboo:1, characters:1, circles:1 };
const ALLKEYS = [];
['characters','bamboo','circles'].forEach(s=>{ for(let v=1;v<=9;v++) ALLKEYS.push(s+':'+v); });
['east','south','west','north'].forEach(v=>ALLKEYS.push('wind:'+v));
['red','green','white'].forEach(v=>ALLKEYS.push('dragon:'+v));
function handCounts(tiles){ const c={}; tiles.forEach(t=>{ const k=t.suit+':'+t.value; c[k]=(c[k]||0)+1; }); return c; }
function tkey(k){ const i=k.indexOf(':'); return [k.slice(0,i), k.slice(i+1)]; }
// Can the remaining tiles fully decompose into runs/triplets (no leftover)?
function meldAll(cnt){
  let k=null; for(const kk of ALLKEYS){ if(cnt[kk]>0){ k=kk; break; } }
  if(!k) return true;
  const [suit,vs]=tkey(k); const v=+vs;
  if(cnt[k]>=3){ cnt[k]-=3; const ok=meldAll(cnt); cnt[k]+=3; if(ok) return true; }
  if(SUIT_SEQ[suit] && v<=7){ const k2=suit+':'+(v+1), k3=suit+':'+(v+2);
    if(cnt[k2]>0&&cnt[k3]>0){ cnt[k]--;cnt[k2]--;cnt[k3]--; const ok=meldAll(cnt); cnt[k]++;cnt[k2]++;cnt[k3]++; if(ok) return true; } }
  return false;
}
// Standard hand: one pair + the rest all melds (set count is implied by tile count)
function isStandardWin(cnt){
  for(const k of ALLKEYS){ if((cnt[k]||0)>=2){ cnt[k]-=2; const ok=meldAll(cnt); cnt[k]+=2; if(ok) return true; } }
  return false;
}
function isSevenPairs(cnt){ const vals=Object.values(cnt); return vals.length===7 && vals.every(v=>v===2); }
// Tile-types that would complete a 13-tile concealed hand (meldCount melds already down)
function winningWaits(cnt, meldCount){
  const waits=[];
  for(const t of ALLKEYS){ if((cnt[t]||0)>=4) continue; cnt[t]=(cnt[t]||0)+1;
    if(isStandardWin(cnt)||(meldCount===0&&isSevenPairs(cnt))) waits.push(t); cnt[t]--; if(cnt[t]===0) delete cnt[t]; }
  return waits;
}
function tileUsefulness(cnt,suit,v){
  const k=suit+':'+v; let u=0;
  if((cnt[k]||0)>=3) u+=20; else if((cnt[k]||0)===2) u+=10;
  if(SUIT_SEQ[suit]){
    u += (cnt[suit+':'+(v-1)]?4:0)+(cnt[suit+':'+(v+1)]?4:0);
    u += (cnt[suit+':'+(v-2)]?2:0)+(cnt[suit+':'+(v+2)]?2:0);
    if(v>=2&&v<=8) u+=1; // central tiles are more flexible
  }
  return u;
}
// Returns {discardId, ready, waits:[tileType keys]} or null
function computeHint(hand, meldCount){
  if(!hand||!hand.length) return null;
  const base=handCounts(hand);
  const repId={}; hand.forEach(t=>{ repId[t.suit+':'+t.value]=t.id; });
  let best=null;
  for(const k of Object.keys(base)){
    const c={...base}; c[k]--; if(c[k]===0) delete c[k];
    const waits=winningWaits(c, meldCount);
    if(waits.length){
      const live=waits.reduce((s,t)=>s+(4-(base[t]||0)),0); // unseen copies available
      if(!best || live>best.live) best={key:k,waits,live};
    }
  }
  if(best) return { discardId:repId[best.key], ready:true, waits:best.waits };
  // Not ready → suggest the least useful (most isolated) tile to discard
  let worstKey=null, worstU=Infinity;
  for(const k of Object.keys(base)){ const [s,vs]=tkey(k); const u=tileUsefulness(base,s,+vs);
    if(u<worstU){ worstU=u; worstKey=k; } }
  return worstKey ? { discardId:repId[worstKey], ready:false, waits:[] } : null;
}
function waitsToGlyphs(waits){ return waits.slice(0,8).map(k=>{ const [s,vs]=tkey(k); const v=/^\d+$/.test(vs)?+vs:vs; return te({suit:s,value:v}); }).join(' '); }

// ─── Sound ────────────────────────────────────────────────────────────────────
let _ac = null;
function getAC() {
  if (!_ac) { try { _ac = new (window.AudioContext||window.webkitAudioContext)(); } catch {} }
  if (_ac && _ac.state === 'suspended') _ac.resume();
  return _ac;
}
function beep(freqs, durs, type='sine', vol=0.1) {
  if (!soundEnabled) return;
  const ctx = getAC(); if (!ctx) return;
  let t = ctx.currentTime;
  freqs.forEach((f, i) => {
    const d = durs[i]||0.12;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t+d);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t+d+0.05);
    t += d * 0.8;
  });
}
function playSound(type) {
  switch(type) {
    case 'click':   beep([700],[0.06]); break;
    case 'discard': beep([320],[0.07],'sine',0.08); break;
    case 'draw':    beep([480,580],[0.07,0.09],'sine',0.07); break;
    case 'pong':    beep([523,659],[0.14,0.18],'triangle',0.1); break;
    case 'kong':    beep([392,523,659],[0.1,0.1,0.2],'triangle',0.11); break;
    case 'chow':    beep([523,440],[0.1,0.14],'sine',0.09); break;
    case 'win':     beep([523,659,784,1047],[0.1,0.1,0.1,0.35],'sine',0.12); break;
    case 'lose':    beep([440,330,220],[0.12,0.12,0.25],'triangle',0.09); break;
  }
}

// ─── Event detection ──────────────────────────────────────────────────────────
function detectEvents(prev, curr) {
  if (!window.phaserScene || !prev || !curr) return;
  const scene = window.phaserScene;

  // New melds
  curr.players.forEach(p => {
    const prevLen = (prev.melds?.[p.id]||[]).length;
    const currLen = (curr.melds?.[p.id]||[]).length;
    if (currLen > prevLen) {
      const m = curr.melds[p.id][currLen-1];
      const who = p.id === myId ? 'You' : p.name;
      const big    = { pong:'PONG!', kong:'KONG!', hiddenKong:'KONG!', addOnKong:'KONG!', chow:'CHOW!' };
      const detail = { pong:'Pong', kong:'Kong', hiddenKong:'Hidden Kong', addOnKong:'Added Kong', chow:'Chow' };
      const colors  = { pong:'#c573ff', kong:'#ffa040', hiddenKong:'#9aa7ff', addOnKong:'#ff6655', chow:'#5dde8b' };
      if (big[m.type]) {
        scene.showCallBanner(big[m.type], `${who} — ${detail[m.type]}`, colors[m.type]);
        playSound(m.type==='chow'?'chow':m.type.includes('ong')?'pong':'kong');
      }
    }
  });

  // Someone else discarded — soft tick
  if ((curr.allDiscards?.length||0) > (prev.allDiscards?.length||0) && curr.lastDiscardBy && curr.lastDiscardBy !== myId) {
    playSound('discard');
  }

  // Phase changed to robKong
  if (prev.phase !== 'robKong' && curr.phase === 'robKong') {
    const who = curr.players.find(p => p.id === curr.currentPlayer);
    scene.showToast(`${who?.name||'?'}: Add-on Kong!`, '#e74c3c');
  }

  // Winner
  if (!prev.winner && curr.winner) {
    if (curr.winner === 'draw') {
      scene.showToast('Draw — Wall exhausted!', '#aaaaaa');
    } else {
      const w = curr.players.find(p => p.id === curr.winner);
      matchWins[curr.winner] = (matchWins[curr.winner]||0) + 1;
      const big = curr.winType==='selfDraw' ? 'SELF-DRAW WIN!' : 'WIN!';
      if (curr.winner === myId) { scene.showCallBanner(big, 'You win!', '#ffd700'); playSound('win'); }
      else { scene.showCallBanner(big, `${w?.name||'?'} wins`, '#ff5577'); playSound('lose'); }
    }
  }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
// Static hosts (GitHub Pages) have no WebSocket server: run the game engine
// in-browser instead — fully playable solo vs bots. Multiplayer still uses the
// real server on Node/Cloudflare.
const LOCAL_MODE = location.hostname.endsWith('github.io') || location.protocol === 'file:' || /[?&]local=1/.test(location.search);
let netRole = null;        // 'host' | 'peer' (LOCAL_MODE only)
let shareCode = null;      // the code players share to join (LOCAL_MODE)
let peerObj = null;        // PeerJS instance
const PEER_PREFIX = 'hkmj-';
if (LOCAL_MODE) {
  const s1 = document.createElement('script'); s1.type='module'; s1.src='local-core.js'; document.head.appendChild(s1);
  const s2 = document.createElement('script'); s2.src='assets/vendor/peerjs.min.js'; document.head.appendChild(s2);
}
function whenLocalReady(cb, n=0) {
  if (window.__localCore && window.Peer) return cb();
  if (n > 80) { showErr('Failed to load game engine — refresh the page.'); return; }
  setTimeout(() => whenLocalReady(cb, n+1), 80);
}
function randCode(len=4){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<len;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }

// WebRTC ICE config. STUN lets peers discover each other on friendly networks;
// TURN relays traffic when both sides are behind strict NATs (different
// networks / mobile data). Override window.MJ_TURN to supply your own TURN
// server for reliable cross-network play.
const PEER_OPTS = { config: { iceServers: (window.MJ_TURN ? [window.MJ_TURN] : []).concat([
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
]) } };

// ── LOCAL_MODE host: this browser runs the authoritative engine; friends
//    connect over WebRTC. Solo = hosting with no peers (bots fill seats). ──
function hostOnline() {
  whenLocalReady(() => {
    const core = window.__localCore;
    shareCode = randCode(4); netRole = 'host';
    // Host's own seat: engine output → onMsg (renders for the host)
    const hostServer = { readyState:1, send: s => { try { onMsg(JSON.parse(s)); } catch {} } };
    ws = { readyState:1, send: s => core.handleRaw(hostServer, s), close(){} };
    core.attachPlayer(hostServer);
    // Create the room immediately so SOLO play works even fully offline —
    // the engine is local and must not wait on the PeerJS broker.
    tx({type:'setName', name:myName});
    tx({type:'createRoom'});
    // Best-effort: open a PeerJS peer so friends can join online. If the broker
    // is unreachable (offline), this fails quietly and solo still works.
    startHostPeer(core);
  });
}
function startHostPeer(core){
  try {
    peerObj = new window.Peer(PEER_PREFIX + shareCode, PEER_OPTS);
    peerObj.on('connection', conn => hostAcceptPeer(core, conn));
    peerObj.on('error', e => {
      if (e.type==='unavailable-id') {            // code clash — pick a new one
        try{peerObj.destroy();}catch{}
        shareCode = randCode(4);
        document.getElementById('roomCodeDisp').textContent = shareCode;
        startHostPeer(core);
      } else { console.warn('peer', e.type); }     // offline / network — solo unaffected
    });
  } catch {}
}
function hostAcceptPeer(core, conn) {
  conn.on('open', () => { conn._pw = { readyState:1, send: s => { try{conn.send(s);}catch{} }, close(){ try{conn.close();}catch{} } }; core.attachPlayer(conn._pw); });
  conn.on('data', raw => {
    if (!conn._pw) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type==='joinRoom') m.roomId = roomId; // map share code → host's engine room
    core.handleRaw(conn._pw, JSON.stringify(m));
  });
  conn.on('close', () => { if (conn._pw) core.handleClose(conn._pw); });
  conn.on('error', () => { if (conn._pw) core.handleClose(conn._pw); });
}

// ── LOCAL_MODE peer: connect to a host and talk to it like a server ──
function joinOnline(code) {
  if (!code) { showErr('Enter a room code'); return; }
  whenLocalReady(() => {
    shareCode = code; netRole = 'peer';
    peerObj = new window.Peer(PEER_OPTS);
    peerObj.on('open', () => {
      const conn = peerObj.connect(PEER_PREFIX + code, { reliable:true });
      const timer = setTimeout(() => { if (!ws) showErr('No host found for code ' + code); }, 9000);
      conn.on('open', () => {
        clearTimeout(timer);
        ws = { readyState:1, send: s => { try{conn.send(s);}catch{} }, close(){ try{conn.close();}catch{} } };
        tx({type:'setName', name:myName});
        tx({type:'joinRoom', roomId:code});
      });
      conn.on('data', raw => { try { onMsg(JSON.parse(raw)); } catch {} });
      conn.on('close', () => { showErr('Disconnected from host.'); showSc('lobbyScreen'); });
    });
    peerObj.on('error', e => showErr('Connection failed: ' + e.type));
  });
}

function connect() {
  if (LOCAL_MODE) { document.querySelectorAll('.local-only').forEach(el=>el.style.display='block'); document.querySelectorAll('.online-hide').forEach(el=>el.style.display='none'); return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // /ws path: Node server accepts any path; on Cloudflare Workers a non-asset
  // path is needed so the upgrade reaches the Durable Object.
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => {
    const saved = sessionStorage.getItem('mjSession');
    if (saved) { try {
      const s=JSON.parse(saved);
      pendingSess = s;
      if (s.playerId && s.roomId) { tx({type:'resume', playerId:s.playerId, roomId:s.roomId}); return; }
      if (s.name) tx({type:'setName',name:s.name});
      if (s.roomId) setTimeout(()=>tx({type:'joinRoom',roomId:s.roomId}),300);
    } catch{} }
  };
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => setTimeout(connect, 2000);
  ws.onerror = () => {};
}
let pendingSess = null;
function tx(msg) { if (ws && ws.readyState===1) ws.send(JSON.stringify(msg)); }
function saveSession() { sessionStorage.setItem('mjSession', JSON.stringify({name:myName, roomId, playerId:myId})); }

function onMsg(m) {
  switch(m.type) {
    case 'welcome': myId = m.playerId; break;

    case 'resumed': roomId = m.roomId; saveSession(); break;

    case 'resumeFailed': {
      // Seat is gone (game ended / room closed) — fall back to normal flow
      const s = pendingSess; pendingSess = null;
      if (s?.name) tx({type:'setName', name:s.name});
      if (s?.roomId) setTimeout(()=>tx({type:'joinRoom', roomId:s.roomId}), 300);
      break;
    }

    case 'nameSet':
      myName = m.name;
      document.getElementById('myNameDisp').textContent = myName;
      saveSession(); showSc('lobbyScreen'); refreshRooms();
      break;

    case 'roomCreated':
      roomId=m.roomId; isHost=true; setRoom(m.roomId,m.players); saveSession(); showSc('waitingScreen');
      break;

    case 'roomJoined':
      roomId=m.roomId; setRoom(m.roomId,m.players); saveSession(); showSc('waitingScreen');
      break;

    case 'playerLeft':
      if (m.players) updWait(m.players);
      addSystemMsg((m.name||'Someone')+' left the room.');
      break;

    case 'roomList': renderRooms(m.rooms); break;

    case 'gameStarted':
      document.getElementById('winScreen').style.display='none';
      document.getElementById('matchScreen').style.display='none';
      // Keep chat across rounds; only wipe it for a brand-new table
      if (!G) { clearChat(); matchWins={}; }
      showSc('gameScreen'); initPhaser();
      if (m.windChanged) pendingWindBanner = m.windChanged;
      break;

    case 'gameState': {
      const prev = G;
      // Track newly drawn tile for animation
      const newIds = new Set((m.myHand||[]).map(t=>t.id));
      const drawn = (m.myHand||[]).find(t => !prevHandIds.has(t.id));
      lastDrawnTileId = drawn?.id || null;
      prevHandIds = newIds;
      // Only reset tile selection if discard is no longer valid or tile gone
      if (!(m.myActions||[]).includes('discard') || !(m.myHand||[]).some(t=>t.id===selTile)) {
        selTile = null;
      }
      // A one-time Help tip lasts only for the current discard turn
      if (!(m.myActions||[]).includes('discard')) helpOnce = false;
      prevG = prev; G = m;
      detectEvents(prev, m);
      if (!document.getElementById('gameScreen').classList.contains('active')) {
        showSc('gameScreen'); initPhaser();
      }
      if (window.phaserScene) window.phaserScene.refresh(G);
      renderActions();
      // Round-wind change announcement (East→South→West→North)
      if (pendingWindBanner && window.phaserScene) {
        const w=pendingWindBanner; pendingWindBanner=null;
        setTimeout(()=>{ if(window.phaserScene) window.phaserScene.showCallBanner(`${WL[w]} Round`, `${WE[w]} Prevailing wind is now ${WL[w]}`, '#ffd700'); }, 400);
      }
      // Let the win call banner play out before covering it with the win screen
      if (G.winner) { const fresh=!prev?.winner; setTimeout(()=>{ if(G&&G.winner) showWin(G); }, fresh&&G.winner!=='draw'?1500:0); }
      if (G.phase==='draw' && G.currentPlayer===myId && !G.winner) {
        setTimeout(()=>{ if(G&&G.phase==='draw'&&G.currentPlayer===myId&&!G.winner) { tx({type:'draw'}); playSound('draw'); } }, 380);
      }
      setTimeout(()=>{ lastDrawnTileId=null; }, 500);
      break;
    }

    case 'gameReset':
      G=null; prevG=null; selTile=null; prevHandIds=new Set(); lastDrawnTileId=null;
      isHost = m.players&&m.players[0]?.id===myId;
      destroyPhaser(); updWait(m.players||[]);
      if (m.seatRotation!=null) {
        const rn = (m.seatRotation%4)+1;
        const wn = WL[WINDS_ARR[Math.floor(m.seatRotation/4)%4]];
        document.getElementById('handInfo').textContent = `Next: ${wn} Round · Hand ${rn}`;
      }
      showSc('waitingScreen');
      break;

    case 'leftRoom':
      roomId=null; isHost=false; G=null; setUrlRoom(null); saveSession(); destroyPhaser(); showSc('lobbyScreen'); refreshRooms();
      break;

    case 'matchOver': showMatchOver(m); break;
    case 'chat': addChatMsg(m); break;
    case 'error': showErr(m.msg||'Error'); break;
  }
}

// ─── Decorative petals on the menus ───────────────────────────────────────────
(function makePetals(){
  const el=document.getElementById('petals'); if(!el) return;
  for(let i=0;i<16;i++){
    const p=document.createElement('i');
    p.style.left=Math.random()*100+'%';
    p.style.animationDuration=(7+Math.random()*8)+'s';
    p.style.animationDelay=(-Math.random()*12)+'s';
    p.style.transform=`scale(${0.6+Math.random()*0.9})`;
    p.style.opacity=0.25+Math.random()*0.35;
    el.appendChild(p);
  }
})();

// ─── Screens ──────────────────────────────────────────────────────────────────
function showSc(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Petals decorate the menus only — hide them once the game board is up
  const pet=document.getElementById('petals'); if(pet) pet.style.display = (id==='gameScreen')?'none':'block';
  // The floating chat button belongs to the game only
  syncChatFab();
  syncHelpBtn();
  // Shared link with ?room=CODE → prefill the join box and auto-join once
  if (id==='lobbyScreen' && pendingUrlRoom && !roomId) {
    const code=pendingUrlRoom; pendingUrlRoom=null;
    const ci=document.getElementById('codeIn'); if(ci) ci.value=code;
    setTimeout(()=>{ if(!roomId) joinCode(); }, 120);
  }
}
// Show the floating chat button only in-game AND when the chat panel is closed,
// so it never overlaps the message box / Send button.
function syncChatFab(){
  const fab=document.getElementById('chatFloatBtn'); if(!fab) return;
  const inGame=document.getElementById('gameScreen').classList.contains('active');
  const chatOpen=document.getElementById('chatPanel').classList.contains('open');
  fab.style.display = (inGame && !chatOpen) ? '' : 'none';
}
function showErr(msg) { const el=document.querySelector('.screen.active .err'); if(el){el.textContent=msg; setTimeout(()=>{if(el)el.textContent='';},4000);} }

// ─── Name ─────────────────────────────────────────────────────────────────────
document.getElementById('nameIn').addEventListener('keydown', e=>{ if(e.key==='Enter') submitName(); });
function submitName() {
  const n=document.getElementById('nameIn').value.trim();
  if(!n){document.getElementById('nameErr').textContent='Please enter a name';return;}
  // LOCAL_MODE has no server to register the name — go straight to the lobby.
  if (LOCAL_MODE) { myName=n; document.getElementById('myNameDisp').textContent=n; saveSession(); showSc('lobbyScreen'); return; }
  tx({type:'setName',name:n});
}

// ─── Lobby ────────────────────────────────────────────────────────────────────
function createRoom() { if (LOCAL_MODE) return hostOnline(); tx({type:'createRoom'}); }
function joinCode() { const c=document.getElementById('codeIn').value.trim().toUpperCase(); if(!c) return; if (LOCAL_MODE) return joinOnline(c); tx({type:'joinRoom',roomId:c}); }
function refreshRooms() { if (LOCAL_MODE) return; tx({type:'listRooms'}); }
function joinById(id) { if (LOCAL_MODE) return joinOnline(id); tx({type:'joinRoom',roomId:id}); }
function renderRooms(rooms) {
  const el=document.getElementById('roomListEl');
  if(!rooms.length){el.innerHTML='<div style="opacity:.4;text-align:center;padding:8px;font-size:.83rem">No open rooms</div>';return;}
  el.innerHTML=rooms.map(r=>`<div class="room-row" onclick="joinById('${esc(r.id)}')">
    <div><div style="font-weight:700">${esc(r.hostName)}'s room</div>
    <div style="font-size:.73rem;opacity:.5">Code: ${r.id} &bull; ${r.playerCount}/4</div></div>
    <button onclick="event.stopPropagation();joinById('${esc(r.id)}')">Join</button>
  </div>`).join('');
}

// ─── Waiting room ─────────────────────────────────────────────────────────────
// Reflect the room code in the URL (?room=CODE) so the link is shareable and the
// code stays visible through the game. Preserves any other query params (e.g. local=1).
function setUrlRoom(code){
  try{ const u=new URL(location.href);
    if(code) u.searchParams.set('room', code); else u.searchParams.delete('room');
    history.replaceState(null,'',u.pathname+u.search+u.hash);
  }catch{}
}
let pendingUrlRoom = null;
try { pendingUrlRoom = new URLSearchParams(location.search).get('room'); } catch {}
function setRoom(rid, players) {
  const code=(LOCAL_MODE&&shareCode)?shareCode:rid;
  document.getElementById('roomCodeDisp').textContent=code;
  setUrlRoom(code);
  updWait(players);
}
function updWait(players) {
  document.getElementById('pcountDisp').textContent=players.length;
  const slots=[...players]; while(slots.length<4) slots.push(null);
  document.getElementById('waitPlayers').innerHTML=slots.map((p,i)=>{
    const windImg=`<img src="assets/tiles/f${i+1}.svg" style="width:22px;height:27px" alt="${WL[WINDS_ARR[i]]}">`;
    if(!p) return `<div class="pchip" style="opacity:.32">${windImg}<span style="flex:1">Empty <span class="bot-badge">Bot</span></span><span style="opacity:.5;font-size:.78rem">${WL[WINDS_ARR[i]]}</span></div>`;
    return `<div class="pchip">${windImg}<span style="flex:1">${esc(p.name)}${p.id===myId?' (You)':''}</span><span style="opacity:.5;font-size:.78rem">${WL[WINDS_ARR[i]]}</span></div>`;
  }).join('');
  isHost=players.length>0&&players[0].id===myId;
  document.getElementById('startBtn').style.display=isHost?'block':'none';
  { const r=document.getElementById('botLevelRow'); if(r) r.style.display=isHost?'block':'none'; }
}
let botLevel = 'medium';
function setBotLevel(lvl){
  botLevel = lvl;
  document.querySelectorAll('#botLevelSeg .seg-btn').forEach(b=>b.classList.toggle('on', b.dataset.lvl===lvl));
}
function startGame() { tx({type:'startGame',withBots:true,botLevel}); }

// ── Help / hints (personal, opt-in, off by default) ──
// Persistent toggle (waiting-room seg + in-game 💡 icon) plus a per-turn Help button.
let helpOnce = false;
function setHints(on){
  hintsEnabled = on; saveSetting('mj_hints', on);
  syncHintSeg(); syncHelpBtn();
  if (G && window.phaserScene) window.phaserScene.refresh(G);
}
function syncHintSeg(){
  document.querySelectorAll('#hintSeg .seg-btn').forEach(b=>b.classList.toggle('on', (b.dataset.h==='on')===hintsEnabled));
}
// The in-game Help button only appears when persistent hints are OFF (otherwise redundant)
function syncHelpBtn(){
  const hb=document.getElementById('helpBtn'); if(!hb) return;
  const inGame=document.getElementById('gameScreen').classList.contains('active');
  hb.style.display = (inGame && !hintsEnabled) ? '' : 'none';
}
// One-time tip for the current turn (works even when persistent hints are off)
function requestHelp(){
  if (!G || !(G.myActions||[]).includes('discard')) {
    if (window.phaserScene) window.phaserScene.showToast('💡 Help works on your turn', '#39d8ff');
    return;
  }
  helpOnce = true;
  if (window.phaserScene) {
    window.phaserScene.refresh(G);
    // Clear central feedback so it's obvious the tip applied (the in-hand ring is subtle on phones)
    const h = computeHint(G.myHand, (G.melds[myId]||[]).length);
    if (h && h.ready) window.phaserScene.showToast('💡 Ready! Discard the ringed tile\nwaiting on  '+waitsToGlyphs(h.waits), '#39d8ff');
    else window.phaserScene.showToast('💡 Discard the tile ringed in blue', '#39d8ff');
  }
}
// ─── Rules / Fan Table (mirrors computeFan in game-core.js, sourced from
//     rawrben89/mahjong-scoreboard) ───────────────────────────────────────────
const RULES = [
  ['Win Method', [
    ['自摸','Self Draw — draw your own winning tile','+1'],
    ['門清','Concealed Hand — win by discard, no called melds','+1'],
    ['槓上花','Win by Kong — win on the supplement tile after a kong','+2'],
    ['槓上槓','Double Kong — supplement tile of a 2nd straight kong','+9'],
    ['海底撈月','Last Tile — win on the final tile of the wall','+1'],
    ['搶槓','Robbing the Kong — steal an added kong tile','+1'],
    ['天糊','Heavenly Hand — dealer wins on the opening draw','+13'],
    ['地糊','Earthly Hand — non-dealer wins on dealer\'s first discard','+13'],
  ]],
  ['Hand Pattern', [
    ['平糊','Peace Hand — all four melds are sequences','+1'],
    ['碰碰糊','All Triplets — every meld a pung/kong','+3'],
    ['混一色','Mixed One Suit — one suit + honor tiles','+3'],
    ['清一色','Pure Suit — one suit, no honors','+7'],
    ['七對子','Seven Pairs — seven distinct pairs','+4'],
  ]],
  ['Honor Pungs', [
    ['中 / 發 / 白','Dragon pung — each dragon triplet','+1'],
    ['自風刻','Seat Wind pung — your own seat wind','+1'],
    ['圈風刻','Round Wind pung — the prevailing wind','+1'],
  ]],
  ['Dragons & Winds', [
    ['小三元','Small Three Dragons — 2 dragon pungs + pair','+5'],
    ['大三元','Big Three Dragons — all 3 dragon pungs','+8'],
    ['小四喜','Small Four Winds — 3 wind pungs + pair','+6'],
    ['大四喜','Big Four Winds — all 4 wind pungs','+13'],
  ]],
  ['Special Hands', [
    ['混么九','Terminals & Honors — every set a terminal/honor','+10'],
    ['字一色','All Honors — only winds & dragons','+10'],
    ['九蓮寶燈','Nine Gates — 1112345678999 of one suit','+10'],
    ['綠一色','All Green — only 2/3/4/6/8 bamboo + green dragon','+10'],
    ['藍一色','All Blue — all circles + white dragon','+10'],
    ['紅一色','All Red — all characters + red dragon','+10'],
    ['十三幺','Thirteen Orphans — one of each terminal & honor','+13'],
    ['十八羅漢','Eighteen Arhats — four kongs','+13'],
  ]],
  ['Bonus Tiles', [
    ['花牌','Each flower / season tile drawn','+1'],
    ['槓','Each declared kong','+1'],
  ]],
];
function showRules() {
  const body=document.getElementById('rulesBody');
  let h=`<div class="rules-note">🀄 <b>Minimum 3 fan</b> to declare a win — a hand worth less cannot win.</div>
    <div class="rules-note">💰 <b>Self-draw:</b> all three opponents pay you. <b>By discard:</b> the discarder pays for everyone. If the <b>dealer (East)</b> wins or pays, that payment is <b>doubled</b>.</div>`;
  RULES.forEach(([cat,rows])=>{
    h+=`<div class="rules-cat">${cat}</div>`;
    rows.forEach(([zh,en,fan])=>{
      h+=`<div class="fan-row"><span class="zh">${zh}</span><span class="en">${en}</span><span class="fan">${fan}</span></div>`;
    });
  });
  body.innerHTML=h;
  document.getElementById('rulesOvl').style.display='block';
}
function hideRules() { document.getElementById('rulesOvl').style.display='none'; }

// ─── How-to-play tutorial (beginner walkthrough) ──────────────────────────────
const TUTORIAL = [
  { emoji:'🎴', title:'Welcome to HK Mahjong', html:`Race your opponents to build the best tile hand. Here's everything you need in about a minute — tap <b>Next</b>.` },
  { emoji:'🎯', title:'The Goal', html:`Make <b>4 sets + 1 pair</b>. A <b>set</b> is three of a kind (a <b>Pung</b>) or three in a run (a <b>Chow</b>); a <b>pair</b> is two identical tiles.`,
    tiles:[{suit:'circles',value:5},{suit:'circles',value:5},{suit:'circles',value:5},null,{suit:'bamboo',value:3},{suit:'bamboo',value:4},{suit:'bamboo',value:5},null,{suit:'dragon',value:'red'},{suit:'dragon',value:'red'}] },
  { emoji:'🧩', title:'The Tiles', html:`Three number suits 1–9 — <b>characters</b>, <b>bamboo</b>, <b>circles</b> — plus honor tiles: <b>winds</b> (E/S/W/N) and <b>dragons</b>.`,
    tiles:[{suit:'characters',value:1},{suit:'bamboo',value:5},{suit:'circles',value:9},null,{suit:'wind',value:'east'},{suit:'dragon',value:'green'}] },
  { emoji:'👆', title:'Your Turn', html:`You <b>draw</b> a tile automatically, then <b>tap a tile</b> in your hand to discard it — <b>tap again</b> to confirm. Keep what builds sets; throw what doesn't.` },
  { emoji:'📣', title:'Claiming Discards', html:`When someone throws a tile you need, claim it:<br><b>Pong</b> = triplet · <b>Kong</b> = four of a kind · <b>Chow</b> = a run (from your left) · <b>Win</b> = it completes your hand.` },
  { emoji:'🏆', title:'Winning', html:`Finish 4 sets + a pair, worth at least <b>3 fan</b> (points), and the <b>WIN</b> button lights up — tap it! Full scoring is in <b>📖 Rules &amp; Fan Table</b>.` },
  { emoji:'🌸', title:'Bonus & Help', html:`<b>Flowers &amp; seasons</b> score bonus points automatically — you never play them. New here? Switch on <b>💡 Help me play</b> for live hints and best-discard tips.`,
    tiles:[{suit:'flower',value:1},{suit:'flower',value:2},{suit:'season',value:1},{suit:'season',value:2}] },
  { emoji:'🚀', title:"You're Ready!", html:`Create a room to play vs bots, or share your room code so friends can join. Have fun! 🎴` },
];
let tutIdx = 0;
function renderTutSlide(i){
  const s=TUTORIAL[i];
  const tiles=s.tiles ? `<div class="tut-tiles">${s.tiles.map(t=>t?`<span class="tut-tile">${tileImg(t)}</span>`:'<span class="tut-gap"></span>').join('')}</div>` : '';
  document.getElementById('tutBody').innerHTML=`<div class="tut-emoji">${s.emoji}</div><h2 class="tut-title">${s.title}</h2><div class="tut-text">${s.html}</div>${tiles}`;
  document.getElementById('tutDots').innerHTML=TUTORIAL.map((_,k)=>`<span class="tut-dot${k===i?' on':''}"></span>`).join('');
  document.getElementById('tutBack').style.visibility = i===0 ? 'hidden' : 'visible';
  document.getElementById('tutNext').textContent = i===TUTORIAL.length-1 ? 'Start Playing →' : 'Next →';
}
function showTutorial(){ tutIdx=0; renderTutSlide(0); document.getElementById('tutorialOvl').style.display='block'; }
function tutNext(){ if(tutIdx>=TUTORIAL.length-1){ closeTutorial(); return; } renderTutSlide(++tutIdx); }
function tutPrev(){ if(tutIdx>0) renderTutSlide(--tutIdx); }
function closeTutorial(){ document.getElementById('tutorialOvl').style.display='none'; try{ localStorage.setItem('mj_seen_tutorial','1'); }catch{} }

// ─── In-game scoreboard ───────────────────────────────────────────────────────
function showScores() {
  if (!G) return;
  const pw = G.prevailingWind || 'east';
  document.getElementById('scoresSub').textContent =
    `${WL[pw]} Round · Hand ${G.round||1} · ${G.wallCount} tiles left`;
  const sorted = [...G.players].sort((a,b)=>(G.scores[b.id]||0)-(G.scores[a.id]||0));
  document.getElementById('scoresTbl').innerHTML = sorted.map((p,i)=>{
    const pts = G.scores[p.id]||0;
    const col = pts>0?'#5dfc8b':pts<0?'#e74c3c':'#ccc';
    const wind = G.seatWinds[p.id];
    const medal = i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':'';
    const cur = p.id===G.currentPlayer ? ' style="color:#ffd700"' : '';
    return `<tr><td${cur}><span class="wind-pill wp-${wind}">${WL[wind]}</span>${medal}${esc(p.name)}${p.id===myId?' (You)':''}${p.isBot?' 🤖':''}</td>`+
      `<td style="text-align:right;font-weight:800;color:${col}">${pts>0?'+':''}${pts}</td></tr>`;
  }).join('');
  document.getElementById('scoresOvl').style.display='block';
}
function hideScores() { document.getElementById('scoresOvl').style.display='none'; }

function confirmLeave() { document.getElementById('leaveOvl').style.display='block'; }
function cancelLeave() { document.getElementById('leaveOvl').style.display='none'; }
function leaveRoom() {
  document.getElementById('leaveOvl').style.display='none';
  document.getElementById('winScreen').style.display='none';
  document.getElementById('matchScreen').style.display='none';
  setUrlRoom(null);
  tx({type:'leaveRoom'}); destroyPhaser();
}
function copyCode() {
  const code=document.getElementById('roomCodeDisp').textContent;
  const flash=()=>{
    const b=document.getElementById('copyCodeBtn'); const orig=b.textContent;
    b.textContent='Copied!'; b.style.background='rgba(255,158,205,.35)';
    setTimeout(()=>{b.textContent=orig; b.style.background='';},2000);
  };
  // navigator.clipboard needs a secure context (HTTPS/localhost); on a LAN IP
  // over http it's undefined, so fall back to a hidden textarea + execCommand.
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(code).then(flash).catch(()=>fallbackCopy(code,flash));
  } else {
    fallbackCopy(code, flash);
  }
}
function fallbackCopy(text, onOk) {
  try {
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok=document.execCommand('copy'); document.body.removeChild(ta);
    if (ok) onOk(); else prompt('Copy this room code:', text);
  } catch { prompt('Copy this room code:', text); }
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function renderActions() {
  if (!G) return;
  const bar=document.getElementById('actionOverlay');
  const acts=G.myActions||[];
  // Hide the bottom-left corner row only when interactive claim buttons are up
  // (not during a normal discard turn) so they never overlap on mobile.
  document.body.classList.toggle('actions-on', acts.some(a=>a!=='discard'));
  // Dim the Help button when it isn't your discard turn (it only helps then)
  { const hb=document.getElementById('helpBtn'); if(hb) hb.classList.toggle('dim', !acts.includes('discard')); }
  if (!acts.length){bar.innerHTML='';return;}
  const b=[];
  if (acts.includes('win'))        b.push(`<button class="abtn win" onclick="doWin()">🏆 WIN</button>`);
  if (acts.includes('pong'))       b.push(`<button class="abtn pong" onclick="doClaim('pong')">◉ PONG</button>`);
  if (acts.includes('kong'))       b.push(`<button class="abtn kong" onclick="doClaim('kong')">◆ KONG</button>`);
  if (acts.includes('chow'))       b.push(`<button class="abtn chow" onclick="openChow()">⇗ CHOW</button>`);
  if (acts.includes('addOnKong'))  b.push(`<button class="abtn kong" onclick="doAddOnKong()">◆ ADD KONG</button>`);
  if (acts.includes('hiddenKong')) b.push(`<button class="abtn kong" onclick="doHiddenKong()">◈ HIDDEN KONG</button>`);
  if (acts.includes('pass'))       b.push(`<button class="abtn pass" onclick="doClaim('pass')">✕ PASS</button>`);
  if (acts.includes('discard')&&!acts.includes('win')) b.push(`<span class="abtn hint"><span class="h-lg">Tap a tile to discard</span><span class="h-sm">Tap a tile ↓</span></span>`);
  bar.innerHTML=b.join('');
}

function tileClick(tid) {
  if (!G||!(G.myActions||[]).includes('discard')) return;
  if (selTile===tid) { playSound('discard'); tx({type:'discard',tileId:tid}); selTile=null; }
  else { playSound('click'); selTile=tid; if(window.phaserScene) window.phaserScene.refresh(G); }
}
function doWin()    { if(G?.phase==='claim'||G?.phase==='robKong') doClaim('win'); else tx({type:'selfWin'}); }
function doClaim(a) { tx({type:'claim',action:a}); }
function doHiddenKong() {
  if(!G) return;
  const c={}; (G.myHand||[]).forEach(t=>{const k=t.suit+':'+t.value; c[k]=(c[k]||0)+1;});
  const k=Object.entries(c).find(([,v])=>v>=4)?.[0];
  if(k) tx({type:'hiddenKong',key:k});
}
function doAddOnKong() {
  if(!G) return;
  for(const m of (G.melds[myId]||[])) {
    if(m.type==='pong') { const t=m.tiles[0]; if((G.myHand||[]).some(h=>h.suit===t.suit&&h.value===t.value)) { tx({type:'addOnKong',key:t.suit+':'+t.value}); return; } }
  }
}
function openChow() {
  if(!G?.lastDiscard) return;
  const d=G.lastDiscard,v=d.value,h=G.myHand||[];
  const has=n=>n>=1&&n<=9&&h.some(t=>t.suit===d.suit&&t.value===n);
  const opts=[];
  if(has(v-2)&&has(v-1)) opts.push([v-2,v-1]);
  if(has(v-1)&&has(v+1)) opts.push([v-1,v+1]);
  if(has(v+1)&&has(v+2)) opts.push([v+1,v+2]);
  if(opts.length===1){tx({type:'claim',action:'chow',chowVals:opts[0]});return;}
  document.getElementById('chowOpts').innerHTML=opts.map(pair=>{
    const vals=[...pair,v].sort((a,b)=>a-b);
    return `<div class="chowopt" onclick="selChow([${pair}])">` +
      vals.map(val=>`<div class="chow-tile${val===v?' target':''}">${tileImg({suit:d.suit,value:val})}</div>`).join('') + '</div>';
  }).join('');
  document.getElementById('chowOvl').style.display='block';
}
function selChow(vals){document.getElementById('chowOvl').style.display='none'; tx({type:'claim',action:'chow',chowVals:vals});}
function cancelChow(){document.getElementById('chowOvl').style.display='none';}

// ─── Win screen ───────────────────────────────────────────────────────────────
function showWin(g) {
  const isDraw=g.winner==='draw';
  const winfo=isDraw?null:g.players.find(p=>p.id===g.winner);
  const isMe=g.winner===myId;
  document.getElementById('winIco').textContent=isDraw?'🤝':isMe?'🏆':'😔';
  document.getElementById('winMsg').textContent=isDraw?'Draw!':isMe?'You Win!':(winfo?.name||'?')+' Wins!';
  let sub=''; if(!isDraw){if(g.winType==='selfDraw')sub='Self Draw (Tsumo!) 🎯'; else if(g.winType==='robKong')sub='Robbing the Kong! (搶槓)'; else sub='By claiming discard';}
  else sub='The wall is exhausted.';
  document.getElementById('winSub').textContent=sub;
  const hand=g.winnerHand||[], melds=g.winnerMelds||[];
  let hh=hand.map(t=>`<div class="win-tile">${tileImg(t)}</div>`).join('');
  if(melds.length){hh+='<div style="width:8px"></div>'; melds.forEach(m=>{hh+='<div style="display:flex;gap:2px;background:rgba(255,255,255,.06);padding:2px;border-radius:4px">'; m.tiles.forEach((t,i)=>{const fd=m.type==='hiddenKong'&&(i===0||i===m.tiles.length-1); hh+=fd?'<div class="win-tile back"></div>':`<div class="win-tile">${tileImg(t)}</div>`;});hh+='</div>';});}
  document.getElementById('winHand').innerHTML=hh;
  // Staggered tile reveal
  [...document.querySelectorAll('#winHand .win-tile')].forEach((el,i)=>{ el.style.animationDelay=(i*45)+'ms'; });
  // Confetti burst for real wins
  document.querySelectorAll('#winScreen .confetti').forEach(el=>el.remove());
  if(!isDraw){
    const colors=['#ff8fc7','#ffd700','#c98fff','#5dde8b','#ffffff','#ff6b81'];
    const wsEl=document.getElementById('winScreen');
    for(let i=0;i<30;i++){
      const c=document.createElement('div'); c.className='confetti';
      c.style.left=Math.random()*100+'%';
      c.style.background=colors[i%colors.length];
      c.style.animationDuration=(2.2+Math.random()*1.8)+'s';
      c.style.animationDelay=(Math.random()*0.6)+'s';
      c.style.transform=`rotate(${Math.random()*360}deg)`;
      wsEl.appendChild(c);
      setTimeout(()=>c.remove(),5000);
    }
  }
  if(!isDraw&&g.winScore){
    const bd=(g.winScore.breakdown||[]).map(b=>`${esc(b.name)} +${b.fan}`).join('<span style="opacity:.4"> · </span>');
    document.getElementById('scoreDetail').innerHTML=`${bd}<div style="margin-top:5px;font-size:.95rem;color:#ffd700;font-weight:800">${g.winScore.fan} fan — winner takes ${g.winScore.total} pts</div>`;
  } else {
    document.getElementById('scoreDetail').textContent='';
  }
  const hs = g.handScores || g.scores || {};
  const tot = g.scores || {};
  const sorted=[...g.players].sort((a,b)=>(tot[b.id]||0)-(tot[a.id]||0));
  let tbl='<tr><td style="font-weight:700;padding-bottom:6px;color:#fff">Player</td>'+
    '<td style="text-align:right;font-size:.78rem;opacity:.7">Wins</td>'+
    '<td style="text-align:right;font-size:.78rem;opacity:.7">This hand</td>'+
    '<td style="text-align:right;font-size:.78rem;opacity:.7">Total</td></tr>';
  sorted.forEach(p=>{
    const d=hs[p.id]||0, t=tot[p.id]||0, wcnt=matchWins[p.id]||0;
    const dc=d>0?'#5dfc8b':d<0?'#e74c3c':'#888';
    const tc=t>0?'#5dfc8b':t<0?'#e74c3c':'#ff9ecd';
    tbl+=`<tr class="${p.id===g.winner?'winner-row':''}"><td>${esc(p.name)}${p.id===myId?' (You)':''}${p.isBot?' 🤖':''}</td>`+
      `<td style="text-align:right;color:#ffd700">${wcnt?'🏆 '+wcnt:'—'}</td>`+
      `<td style="text-align:right;color:${dc}">${d>0?'+':''}${d}</td>`+
      `<td style="text-align:right;font-weight:700;color:${tc}">${t>0?'+':''}${t}</td></tr>`;
  });
  document.getElementById('stbl').innerHTML=tbl;
  // Match progress + host-only Next Round
  const minfo=document.getElementById('winMatchInfo');
  if(minfo){ const wn=WL[WINDS_ARR[g.roundWindIdx||0]]||'East'; minfo.textContent=`${wn} Round · Hand ${g.round||1}`; }
  document.getElementById('nextRoundBtn').style.display = isHost ? 'block' : 'none';
  document.getElementById('nextHint').style.display = isHost ? 'none' : 'block';
  document.getElementById('winScreen').style.display='flex';
}
function requestNextRound(){ tx({type:'nextRound'}); document.getElementById('winScreen').style.display='none'; }

// ─── Final match standings ────────────────────────────────────────────────────
function showMatchOver(m){
  document.getElementById('winScreen').style.display='none';
  const box=document.getElementById('matchBody');
  const medals=['🥇','🥈','🥉',''];
  const champ=m.standings[0];
  box.innerHTML = `<div style="font-size:3rem">🏆</div>`+
    `<h2 style="color:#ffd700">${esc(champ.name)} wins the match!</h2>`+
    `<div style="opacity:.6;font-size:.84rem;margin-bottom:6px">${m.hands} hands played · 4 rounds</div>`+
    `<table class="stbl">`+ m.standings.map((p,i)=>{
      const col=p.score>0?'#5dfc8b':p.score<0?'#e74c3c':'#ff9ecd';
      const wcnt=matchWins[p.id]||0;
      return `<tr class="${i===0?'winner-row':''}"><td>${medals[i]} ${esc(p.name)}${p.id===myId?' (You)':''}${p.isBot?' 🤖':''}</td>`+
        `<td style="text-align:right;font-size:.8rem;color:#ffd700">${wcnt?'🏆 '+wcnt:'—'}</td>`+
        `<td style="text-align:right;font-weight:800;color:${col}">${p.score>0?'+':''}${p.score}</td></tr>`;
    }).join('') + `</table>`;
  document.getElementById('matchNewBtn').style.display = isHost ? 'block' : 'none';
  document.getElementById('matchNewHint').style.display = isHost ? 'none' : 'block';
  document.getElementById('matchScreen').style.display='flex';
}
function requestNewMatch(){ tx({type:'newMatch'}); document.getElementById('matchScreen').style.display='none'; }

// ─── Chat ─────────────────────────────────────────────────────────────────────
document.getElementById('chatIn').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
function sendChat(){const i=document.getElementById('chatIn');const t=i.value.trim();if(!t)return;tx({type:'chat',text:t});i.value='';}
// Emotes ride the chat channel (works in multiplayer AND solo/P2P) with a sentinel prefix
const EMOTE_TAG='✨E✨';
const EMOTES=['😄','😂','😮','😎','😭','👍','👏','🔥','🎉','🀄'];
function sendEmote(emoji){ closeEmotes(); tx({type:'chat', text:EMOTE_TAG+emoji}); }
function buildEmoteBar(){
  const b=document.getElementById('emoteBar'); if(!b||b.dataset.built) return;
  b.innerHTML=EMOTES.map(e=>`<button type="button" onclick="sendEmote('${e}')">${e}</button>`).join('');
  b.dataset.built='1';
}
function toggleEmotes(){ buildEmoteBar(); const b=document.getElementById('emoteBar'); if(!b) return;
  if(b.style.display==='flex'){ b.style.display='none'; return; }
  // Sit the popup just above the corner buttons whatever their height (no overlap)
  const cb=document.querySelector('.corner-btns');
  b.style.bottom = ((cb?cb.offsetHeight:90) + 16) + 'px';
  b.style.display='flex'; }
function closeEmotes(){ const b=document.getElementById('emoteBar'); if(b) b.style.display='none'; }
document.addEventListener('click',e=>{ const b=document.getElementById('emoteBar');
  if(b&&b.style.display==='flex'&&!b.contains(e.target)&&!e.target.closest('#emoteBtn')) closeEmotes(); });
function addChatMsg(m){
  // Emote message → float a reaction over the sender's seat, skip the text log
  if (typeof m.text==='string' && m.text.startsWith(EMOTE_TAG)) {
    const emoji=m.text.slice(EMOTE_TAG.length);
    if (window.phaserScene) window.phaserScene.showEmote(m.pid, emoji);
    if (m.pid!==myId) playSound('click');
    return;
  }
  const el=document.getElementById('chatMsgs'),isMe=m.pid===myId;
  const d=document.createElement('div'); d.className='chat-msg'+(isMe?' me':'');
  d.innerHTML=`<div class="from">${esc(m.from)}</div><div class="text">${esc(m.text)}</div>`;
  el.appendChild(d); el.scrollTop=el.scrollHeight;
  const panel=document.getElementById('chatPanel');
  if(!isMe&&(!panel.classList.contains('open')||!document.getElementById('gameScreen').classList.contains('active'))){
    unreadCount++; const b=document.getElementById('chatUnread'); b.textContent=unreadCount>9?'9+':unreadCount; b.style.display='flex';
  }
}
function addSystemMsg(t){const el=document.getElementById('chatMsgs');const d=document.createElement('div');d.className='chat-msg system';d.innerHTML=`<div class="text">${esc(t)}</div>`;el.appendChild(d);el.scrollTop=el.scrollHeight;}
function clearChat(){document.getElementById('chatMsgs').innerHTML='';unreadCount=0;document.getElementById('chatUnread').style.display='none';}
// Slide-in chat overlay (all screen sizes). The float button toggles it.
function toggleChat(){
  const p=document.getElementById('chatPanel'); const opening=!p.classList.contains('open');
  p.classList.toggle('open', opening);
  if(opening) closeEmotes();           // never show both popups at once
  syncChatFab();                        // hide the float button while the panel is open
  if(opening){ unreadCount=0; document.getElementById('chatUnread').style.display='none'; const i=document.getElementById('chatIn'); if(i) setTimeout(()=>i.focus(),50); }
}
function openMobileChat(){ toggleChat(); }
document.addEventListener('click',e=>{const p=document.getElementById('chatPanel');if(p.classList.contains('open')&&!p.contains(e.target)&&e.target.id!=='chatFloatBtn'&&!document.getElementById('chatFloatBtn').contains(e.target)){p.classList.remove('open');syncChatFab();}});

// ─── Phaser init ──────────────────────────────────────────────────────────────
function initPhaser() {
  if (phaserGame) { setTimeout(()=>{phaserGame.scale.refresh();if(G&&window.phaserScene)window.phaserScene.refresh(G);},80); return; }
  phaserGame = new Phaser.Game({
    type: Phaser.CANVAS,        // CANVAS = emoji renders correctly on all browsers
    parent: 'phaserMount',
    backgroundColor: '#1d1238',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: GameScene,
    input: { touch: { capture: false } },
  });
  // Chrome mobile shows/hides the URL bar, which resizes the visual viewport
  // without always firing window 'resize' — sync Phaser to it so the board
  // never gets clipped or letterboxed.
  if (window.visualViewport && !window.__vvHooked) {
    window.__vvHooked = true;
    const sync = () => { if (phaserGame) { phaserGame.scale.refresh(); if (G && window.phaserScene) window.phaserScene.refresh(G); } };
    window.visualViewport.addEventListener('resize', sync);
    window.addEventListener('orientationchange', () => setTimeout(sync, 250));
  }
}
function destroyPhaser(){if(phaserGame){phaserGame.destroy(true);phaserGame=null;window.phaserScene=null;}}

// ─── Phaser GameScene ─────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); this.objs=[]; this.toasts=[]; }

  preload() {
    const names=[];
    for (let i=1;i<=9;i++) names.push('w'+i,'s'+i,'t'+i);
    for (let i=1;i<=4;i++) names.push('f'+i);
    for (let i=1;i<=3;i++) names.push('d'+i);
    for (let i=1;i<=8;i++) names.push('h'+i);
    // Rasterize SVGs well above max on-screen tile size so they stay crisp on retina
    names.forEach(n=>this.load.svg('tile-'+n,'assets/tiles/'+n+'.svg',{width:140,height:170}));
  }

  create() {
    window.phaserScene = this;
    this.scale.on('resize', () => { if (G) this.refresh(G); });
    this.createPetals();
    if (G) this.refresh(G);
  }

  // ── Sakura petals (persistent layer, not cleared on refresh) ──
  createPetals() {
    if (!this.textures.exists('petal')) {
      const c=this.textures.createCanvas('petal',24,24);
      const ctx=c.context;
      ctx.fillStyle='#ffb7d5';
      ctx.beginPath(); ctx.ellipse(12,12,9,5,Math.PI/4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(14,10,4,2,Math.PI/4,0,Math.PI*2); ctx.fill();
      c.refresh();
    }
    for (let i=0;i<14;i++) this.spawnPetal(true);
  }
  spawnPetal(initial) {
    const W=this.scale.width, H=this.scale.height;
    const p=this.add.image(Math.random()*W, initial?Math.random()*H:-20, 'petal')
      .setDepth(150).setAlpha(0.22+Math.random()*0.22)
      .setScale(0.45+Math.random()*0.65).setAngle(Math.random()*360);
    const fall=()=>{
      if (!p.scene) return;
      p.y=-20; p.x=Math.random()*this.scale.width;
      this.tweens.add({targets:p, y:this.scale.height+24, x:p.x+(Math.random()*180-90),
        angle:p.angle+200+Math.random()*200, duration:9000+Math.random()*9000, onComplete:fall});
    };
    this.tweens.add({targets:p, y:H+24, x:p.x+(Math.random()*140-70), angle:p.angle+220,
      duration:initial ? (1-p.y/Math.max(1,H))*12000+2500 : 9000+Math.random()*9000, onComplete:fall});
  }

  // ── Anime call banner (ポン！カン！ロン！…) ──
  showCallBanner(jp, sub, color='#ff5577') {
    const W=this.scale.width, H=this.scale.height;
    const cy=H*0.40;
    const band=this.add.graphics().setDepth(190).setAlpha(0);
    band.fillStyle(0x000000,0.55); band.fillRect(0,cy-40,W,80);
    band.fillStyle(0xffffff,0.10); band.fillRect(0,cy-40,W,2); band.fillRect(0,cy+38,W,2);
    const fs=Math.min(56, Math.max(34, Math.floor(W/9)));
    const t=this.add.text(W/2,cy-6,jp,{fontFamily:FONT,fontSize:fs+'px',fontStyle:'900',color,
      stroke:'#ffffff',strokeThickness:7,resolution:2,
      shadow:{offsetX:0,offsetY:3,color:'#000000',blur:10,fill:true}})
      .setOrigin(0.5).setDepth(191).setScale(2.4).setAlpha(0).setAngle(-4);
    const s=this.add.text(W/2,cy+fs*0.52,sub,{fontFamily:FONT,fontSize:'14px',color:'#ffffff',
      stroke:'#000000',strokeThickness:3,resolution:2}).setOrigin(0.5,0).setDepth(191).setAlpha(0);
    const all=[band,t,s];
    this.tweens.add({targets:band,alpha:1,duration:120});
    this.tweens.add({targets:t,scale:1,alpha:1,duration:170,ease:'Cubic.easeIn',
      onComplete:()=>{ this.cameras.main.shake(90,0.004);
        this.tweens.add({targets:s,alpha:1,duration:150});
        this.tweens.add({targets:all,alpha:0,duration:380,delay:950,
          onComplete:()=>all.forEach(o=>{try{o.destroy();}catch{}})});
      }});
  }

  // ── Object tracking ──
  clear() {
    this.objs.forEach(o=>{ try{o.destroy(true);}catch{} });
    this.objs=[];
  }
  track(o) { this.objs.push(o); return o; }

  // Offset vector pointing from the table centre toward the player who just
  // discarded (so a flying discard appears to come from their seat).
  discarderDir(g, mag=120) {
    const by=g.lastDiscardBy; if(!by) return {dx:0,dy:-mag};
    const n=g.players.length, myIdx=g.players.findIndex(p=>p.id===myId);
    const across=g.players[(myIdx+2)%n]?.id, left=g.players[(myIdx+1)%n]?.id, right=g.players[(myIdx+n-1)%n]?.id;
    if (by===myId)   return {dx:0, dy:mag};    // from bottom (me)
    if (by===across) return {dx:0, dy:-mag};   // from top
    if (by===left)   return {dx:-mag, dy:0};   // from left
    if (by===right)  return {dx:mag, dy:0};    // from right
    return {dx:0, dy:-mag};
  }

  // ── Player nameplate header (avatar + name + score) ──
  // Returns nothing; draws into the header strip [z.x, z.y, z.w, hdrH].
  drawNameplate(z, hdrH, { wind, name, score, isCur, isBot, me }) {
    const accent = WIND_COL[wind] || 0x888888;
    const hbg=this.add.graphics(); this.track(hbg);
    // Header bar with a left accent stripe
    hbg.fillStyle(0x000000, isCur?0.34:0.22); hbg.fillRoundedRect(z.x,z.y,z.w,hdrH,{tl:8,tr:8,bl:0,br:0});
    if (isCur){ hbg.fillStyle(accent,0.22); hbg.fillRoundedRect(z.x,z.y,z.w,hdrH,{tl:8,tr:8,bl:0,br:0}); }
    hbg.fillStyle(accent,0.9); hbg.fillRoundedRect(z.x,z.y,3.5,hdrH,{tl:8,tr:0,bl:0,br:0});
    // Avatar: seat-wind coloured disc with the wind initial
    const ar=hdrH*0.36, ax=z.x+5+ar, ay=z.y+hdrH/2;
    const av=this.add.graphics(); this.track(av);
    av.fillStyle(accent,1); av.fillCircle(ax,ay,ar);
    av.lineStyle(1.5,0xffffff,0.5); av.strokeCircle(ax,ay,ar);
    av.fillStyle(0xffffff,0.18); av.fillEllipse(ax,ay-ar*0.4,ar*1.4,ar*0.7);
    this.txt(ax,ay,WIND_INI[wind]||'?',{fontSize:`${Math.round(ar*1.1)}px`,fontStyle:'bold',color:'#ffffff',resolution:2}).setOrigin(0.5);
    // Name
    const nm=(isBot?'🤖 ':'')+(name||'').slice(0,me?14:9);
    this.txt(ax+ar+5,ay,nm,{fontSize:'11px',fontStyle:isCur?'bold':'normal',color:isCur?'#ffffff':'#d7cde8',resolution:2}).setOrigin(0,0.5);
    // Score (right)
    const sc=(score>0?'+':'')+score, scCol=score>0?'#7dffa6':score<0?'#ff7676':'#cbb8e8';
    this.txt(z.x+z.w-6,ay,sc,{fontSize:'11px',fontStyle:'bold',color:scCol,resolution:2}).setOrigin(1,0.5);
    // Pulsing ring on the avatar marks the active player
    if (isCur){
      const ring=this.add.graphics().setDepth(6); this.track(ring);
      ring.lineStyle(2,0xffd700,1); ring.strokeCircle(ax,ay,ar+2.5);
      this.tweens.add({targets:ring,alpha:{from:1,to:0.25},duration:650,yoyo:true,repeat:-1});
    }
  }

  // ── Layout ──
  layout() {
    const W=this.scale.width, H=this.scale.height;
    const actionH=54, infoH=32;
    const usable=H-actionH-infoH;
    const isPortrait=H>W*1.1;
    const sideW=Math.max(Math.min(W*0.14, 130), isPortrait?62:85);
    const cW=W-sideW*2;
    if (isPortrait) {
      const nH=Math.min(usable*0.16,95); const sH=Math.min(usable*0.30,185); const mH=usable-nH-sH;
      return { W,H,infoH,actionH,sideW,
        north:  {x:sideW,    y:infoH,           w:cW,  h:nH},
        west:   {x:0,        y:infoH+nH,        w:sideW,h:mH},
        east:   {x:W-sideW,  y:infoH+nH,        w:sideW,h:mH},
        center: {x:sideW,    y:infoH+nH,        w:cW,  h:mH},
        south:  {x:0,        y:H-actionH-sH,    w:W,   h:sH},
      };
    } else {
      const nH=Math.min(usable*0.17,105); const sH=Math.min(usable*0.27,165); const mH=usable-nH-sH;
      return { W,H,infoH,actionH,sideW,
        north:  {x:sideW,    y:infoH,           w:cW,  h:nH},
        west:   {x:0,        y:infoH+nH,        w:sideW,h:mH},
        east:   {x:W-sideW,  y:infoH+nH,        w:sideW,h:mH},
        center: {x:sideW,    y:infoH+nH,        w:cW,  h:mH},
        south:  {x:sideW,    y:H-actionH-sH,    w:cW,  h:sH},
      };
    }
  }

  tileSize(aw, n, maxW=50, minW=18) {
    if (n===0) return {w:maxW,h:Math.round(maxW*1.21)};
    const w=Math.max(minW,Math.min(maxW,Math.floor((aw-10)/(n+0.3))));
    return {w,h:Math.round(w*1.21)};
  }

  // ── Tile renderer ──
  // Anchor: top-left corner.  Returns the Phaser Container.
  drawTile(x, y, tile, opts={}) {
    const {w=46,h=56, faceDown=false, selected=false, highlighted=false, hint=false,
           clickable=false, onTap=null, animate=false, angle=0} = opts;

    const container = this.add.container(x+w/2, y+h/2);
    if (angle) container.setAngle(angle);
    this.track(container);
    const g = this.add.graphics();
    const r = Math.max(3, Math.round(w*0.11));
    const texKey = !faceDown && tile ? tileTexKey(tile) : null;

    if (faceDown) {
      // 3-D lying tile: green back on top of an ivory body edge (no painted
      // drop shadow — translucent bands below tiles read as artifacts)
      const edge=Math.max(2,Math.round(h*0.14));
      // Ivory body (visible as the front edge below the green back)
      // NOTE: fillGradientStyle is WebGL-only and this game runs the CANVAS
      // renderer, so depth is faked with flat two-tone bands instead.
      g.fillStyle(0xe9e2c8); g.fillRoundedRect(-w/2,-h/2,w,h,r);
      g.fillStyle(0xbdb597,0.8); g.fillRect(-w/2+1,h/2-Math.ceil(edge/2),w-2,Math.ceil(edge/2)-1);
      g.lineStyle(1,0x8f8868,0.55); g.strokeRoundedRect(-w/2,-h/2,w,h,r);
      // Green back face (lit from top)
      g.fillStyle(0x0e7a30); g.fillRoundedRect(-w/2,-h/2,w,h-edge,r);
      g.fillStyle(0x1a9a50,0.85); g.fillRoundedRect(-w/2,-h/2,w,(h-edge)*0.45,{tl:r,tr:r,bl:0,br:0});
      g.lineStyle(1,0x0a431a,0.8); g.strokeRoundedRect(-w/2,-h/2,w,h-edge,r);
      // Gloss strip along the top
      g.fillStyle(0xffffff,0.18); g.fillRoundedRect(-w/2+1.5,-h/2+1.5,w-3,Math.max(2,h*0.10),{tl:r-1,tr:r-1,bl:0,br:0});
      g.lineStyle(1,0x3fb35f,0.35); g.strokeRoundedRect(-w/2+3,-h/2+3,w-6,h-edge-6,Math.max(2,r-2));
      if (w>=22) {
        const cols=2, rows=3, pw=(w-12)/(cols+1), ph=(h-edge-8)/(rows+1);
        for(let rr=1;rr<=rows;rr++) for(let c=1;c<=cols;c++) {
          g.fillStyle(0x4cc06a,0.4);
          g.fillCircle(-w/2+6+c*pw, -h/2+4+rr*ph, 2.5);
        }
      }
      container.add(g);
    } else if (texKey && this.textures.exists(texKey)) {
      // SVG tile art — it carries its own 3-D edge and outline, so no extra
      // base or shadow is painted (avoids translucent bands under tiles)
      container.add(g);
      const img=this.add.image(0,0,texKey).setDisplaySize(w,h);
      if (selected) img.setTint(0xffeca0);
      container.add(img);
      // Gloss sweep across the upper face
      const gloss=this.add.graphics();
      gloss.fillStyle(0xffffff,0.14);
      gloss.fillRoundedRect(-w/2+2,-h/2+2,w-4,h*0.16,{tl:r,tr:r,bl:0,br:0});
      container.add(gloss);
      if (selected || highlighted || hint) {
        const ring=this.add.graphics();
        if (highlighted) { ring.lineStyle(4,0xffd700,0.25); ring.strokeRoundedRect(-w/2-4,-h/2-4,w+8,h+8,r+4); }
        ring.lineStyle(2.5, hint?0x39d8ff:(selected?0x00c4aa:0xffd700), 0.95);
        ring.strokeRoundedRect(-w/2-1.5,-h/2-1.5,w+3,h+3,r+2);
        container.add(ring);
        if (hint) { // gentle cyan pulse so the suggestion is unmistakable but calm
          ring.alpha=0.55;
          this.tweens.add({targets:ring,alpha:{from:1,to:0.4},duration:700,yoyo:true,repeat:-1});
        }
      }
    } else {
      // Fallback: hand-drawn tile with emoji glyph (textures still loading)
      g.fillStyle(0x000000,0.28); g.fillRoundedRect(-w/2+2,-h/2+3,w,h,r);
      const edgeCol = selected?0xa09000:highlighted?0xb8860b:0x808080;
      g.fillStyle(edgeCol,0.6); g.fillRoundedRect(-w/2,-h/2,w,h,r);
      const bgCol = selected?0xfff9a0:(SUIT_BG[tile?.suit]||0xfffef2);
      g.fillStyle(bgCol); g.fillRoundedRect(-w/2,-h/2,w,h-2,r);
      const bCol=hint?0x39d8ff:selected?0x00c4aa:highlighted?0xffd700:0x999999;
      g.lineStyle(selected||highlighted||hint?2:1.5,bCol); g.strokeRoundedRect(-w/2,-h/2,w,h,r);
      if (highlighted) { g.lineStyle(3.5,0xffd700,0.22); g.strokeRoundedRect(-w/2-3,-h/2-3,w+6,h+6,r+3); }
      if (hint) { g.lineStyle(3.5,0x39d8ff,0.22); g.strokeRoundedRect(-w/2-3,-h/2-3,w+6,h+6,r+3); }
      container.add(g);
      if (tile) {
        const emoji=te(tile);
        const fs=h>58?30:h>44?22:h>30?15:10;
        const txt=this.add.text(w>30?1:0,0,emoji,{fontSize:`${fs}px`,resolution:2}).setOrigin(0.5,0.5);
        container.add(txt);
      }
    }

    // Bounce-in for newly drawn tile
    if (animate) {
      container.setScale(0.2); container.alpha=0;
      this.tweens.add({targets:container,scaleX:1,scaleY:1,alpha:1,duration:320,ease:'Back.easeOut'});
    }

    // Selection lift
    if (selected) container.y -= 12;

    // Hover tween (only for clickable, non-selected)
    if (clickable && onTap && !selected) {
      const origY=container.y;
      container.setSize(w,h); container.setInteractive();
      container.on('pointerover', ()=>{ this.tweens.killTweensOf(container); this.tweens.add({targets:container,y:origY-10,duration:100,ease:'Power2'}); });
      container.on('pointerout',  ()=>{ this.tweens.killTweensOf(container); this.tweens.add({targets:container,y:origY,duration:80,ease:'Power2'}); });
      container.on('pointerdown', onTap);
    } else if (clickable && onTap) {
      container.setSize(w,h); container.setInteractive();
      container.on('pointerdown', onTap);
    }

    return container;
  }

  // ── Meld row (returns width used) ──
  drawMeld(sx, y, meld, tw, th, gap=2) {
    const n=meld.tiles.length;
    const totalW=n*tw+(n-1)*gap+4;
    const mbg=this.add.graphics(); this.track(mbg);
    const meldBg={pong:0xff9ecd22,kong:0xf1c40f22,hiddenKong:0x2c3e5044,addOnKong:0xc0392b22,chow:0x8e44ad22};
    mbg.fillStyle(meldBg[meld.type]||0xffffff11); mbg.fillRoundedRect(sx-2,y-2,totalW,th+4,4);
    let x=sx;
    meld.tiles.forEach((t,i)=>{
      const fd=meld.type==='hiddenKong'&&(i===0||i===meld.tiles.length-1);
      this.drawTile(x,y,t,{w:tw,h:th,faceDown:fd});
      x+=tw+gap;
    });
    return totalW;
  }

  // ── Rotated tile: (x,y) is the top-left of the ±90°-rotated visual box,
  // w/h are the unrotated tile dims (so the box is h wide × w tall) ──
  drawTileV(x, y, tile, opts={}) {
    const {w=20,h=24}=opts;
    return this.drawTile(x+(h-w)/2, y+(w-h)/2, tile, {...opts, w, h});
  }

  // ── Vertical meld stack of rotated tiles (returns height used) ──
  drawMeldV(x, y, meld, tw, th, ang, gap=2) {
    const n=meld.tiles.length;
    const totalH=n*tw+(n-1)*gap+4;
    const mbg=this.add.graphics(); this.track(mbg);
    const meldBg={pong:0xff9ecd22,kong:0xf1c40f22,hiddenKong:0x2c3e5044,addOnKong:0xc0392b22,chow:0x8e44ad22};
    mbg.fillStyle(meldBg[meld.type]||0xffffff11); mbg.fillRoundedRect(x-2,y-2,th+4,totalH,4);
    let yy=y;
    meld.tiles.forEach((t,i)=>{
      const fd=meld.type==='hiddenKong'&&(i===0||i===meld.tiles.length-1);
      this.drawTileV(x,yy,t,{w:tw,h:th,faceDown:fd,angle:ang});
      yy+=tw+gap;
    });
    return totalH;
  }

  // ── Text helper ──
  txt(x,y,s,style={}) { const t=this.add.text(x,y,s,{fontFamily:FONT,fontSize:'13px',color:'#ffffff',...style}); this.track(t); return t; }

  // ── Zone bg ──
  zoneBg(z,col=0x000000,alpha=0.2,r=8){ const g=this.add.graphics(); g.fillStyle(col,alpha); g.fillRoundedRect(z.x,z.y,z.w,z.h,r); this.track(g); return g; }

  // ── Toast notification ──
  showToast(text, color='#ffffff') {
    const {W,H}=this.layout();
    // Offset stacked toasts
    const active=(this.toasts||[]).filter(t=>t&&!t.destroyed).length;
    const t=this.add.text(W/2, H*0.42-active*32, text, {
      fontFamily:FONT, fontSize:'17px', fontStyle:'bold', color,
      stroke:'#000000', strokeThickness:3, align:'center', resolution:2,
    }).setOrigin(0.5,0.5).setDepth(200).setAlpha(0);
    this.toasts=(this.toasts||[]).filter(x=>x&&!x.destroyed);
    this.toasts.push(t);
    this.tweens.add({targets:t,alpha:{from:0,to:1},y:t.y-5,duration:200,ease:'Power2',
      onComplete:()=>{
        this.tweens.add({targets:t,alpha:0,y:t.y-50,duration:1800,delay:800,ease:'Power2',
          onComplete:()=>{t.destroy();this.toasts=(this.toasts||[]).filter(x=>x!==t);}
        });
      }
    });
  }

  // ── Floating emote reaction over a player's seat ──
  showEmote(pid, emoji) {
    const a=(this.seatAnchor||{})[pid];
    const {W,H}=this.layout();
    const x=a?a.x:W/2, y=a?a.y:H/2;
    // Soft bubble backing so the emoji pops against any tile colour
    const bub=this.add.graphics().setDepth(249);
    bub.fillStyle(0x1a1030,0.82); bub.fillCircle(0,0,21);
    bub.lineStyle(2,0xff9ecd,0.7); bub.strokeCircle(0,0,21);
    bub.x=x; bub.y=y;
    const e=this.add.text(x,y,emoji,{fontSize:'26px',resolution:2}).setOrigin(0.5,0.5).setDepth(250);
    [bub,e].forEach(o=>{ o.setScale(0.2); o.alpha=0; });
    this.tweens.add({targets:[bub,e],scaleX:1,scaleY:1,alpha:1,duration:240,ease:'Back.easeOut',
      onComplete:()=>{
        this.tweens.add({targets:[bub,e],y:'-=46',alpha:0,duration:1100,delay:900,ease:'Power2',
          onComplete:()=>{ e.destroy(); bub.destroy(); }});
      }});
    this.track(bub); this.track(e);
  }

  // ── Table background ──
  ensureFeltTexture() {
    if (this.textures.exists('felt')) return;
    const S=640;
    const c=this.textures.createCanvas('felt',S,S);
    const ctx=c.context;
    // Warm centre spotlight fading to deep indigo at the edges
    const grd=ctx.createRadialGradient(S/2,S*0.42,60,S/2,S/2,S*0.72);
    grd.addColorStop(0,'#5a3d96'); grd.addColorStop(0.45,'#3a2570'); grd.addColorStop(0.8,'#241548'); grd.addColorStop(1,'#160c2e');
    ctx.fillStyle=grd; ctx.fillRect(0,0,S,S);
    // Fabric speckle
    for(let i=0;i<3600;i++){
      ctx.fillStyle=`rgba(255,255,255,${Math.random()*0.03})`;
      ctx.fillRect(Math.random()*S,Math.random()*S,1,1);
      ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.06})`;
      ctx.fillRect(Math.random()*S,Math.random()*S,1,1);
    }
    // Corner vignette for depth
    const vg=ctx.createRadialGradient(S/2,S/2,S*0.34,S/2,S/2,S*0.72);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.45)');
    ctx.fillStyle=vg; ctx.fillRect(0,0,S,S);
    c.refresh();
  }
  drawTable(L) {
    const {W,H}=L;
    this.ensureFeltTexture();
    const felt=this.add.image(W/2,H/2,'felt').setDisplaySize(W,H); this.track(felt);
    const bg=this.add.graphics(); this.track(bg);
    // Lacquer frame with gold + sakura inlay
    bg.lineStyle(7,0x1c0f38,0.95); bg.strokeRoundedRect(3,3,W-6,H-6,10);
    bg.lineStyle(2,0xd4af37,0.65); bg.strokeRoundedRect(8,8,W-16,H-16,9);
    bg.lineStyle(1,0xff9ecd,0.3); bg.strokeRoundedRect(11,11,W-22,H-22,8);
  }

  // ── Info bar ──
  drawInfoBar(L, g) {
    const {W,infoH}=L;
    const bg=this.add.graphics(); this.track(bg);
    bg.fillStyle(0x000000,0.42); bg.fillRect(0,0,W,infoH);
    bg.lineStyle(1,0xffffff,0.06); bg.lineBetween(0,infoH,W,infoH);

    const pw=g.prevailingWind||'east';
    this.drawTile(8,infoH/2-11,{suit:'wind',value:pw},{w:18,h:22});
    this.txt(30,infoH/2,`${WL[pw]} Round · Hand ${g.round||1}`,{fontSize:'12px',color:'#cbb8e8'}).setOrigin(0,0.5);
    this.drawTile(W/2-26,infoH/2-9,null,{w:15,h:18,faceDown:true});
    this.txt(W/2-6,infoH/2,`${g.wallCount}`,{fontSize:'12px',color:'#ff9ecd'}).setOrigin(0,0.5);

    const sc=g.scores[myId]||0;
    const scCol=sc>0?'#5dfc8b':sc<0?'#e74c3c':'#cccccc';
    this.txt(W-56,infoH/2,`${sc>0?'+':''}${sc} pts`,{fontSize:'12px',color:scCol}).setOrigin(1,0.5);

    // Sound toggle (clickable text)
    const snd=this.add.text(W-8,infoH/2,soundEnabled?'🔊':'🔇',{fontSize:'14px'}).setOrigin(1,0.5).setDepth(50).setInteractive();
    this.track(snd);
    snd.on('pointerdown',()=>{ soundEnabled=!soundEnabled; saveSetting('mj_sound',soundEnabled); snd.setText(soundEnabled?'🔊':'🔇'); });
    snd.on('pointerover',()=>snd.setAlpha(0.65)); snd.on('pointerout',()=>snd.setAlpha(1));

    // Hint toggle (💡) — dim when off; opt-in, default off
    const hnt=this.add.text(W-30,infoH/2,'💡',{fontSize:'14px'}).setOrigin(1,0.5).setDepth(50).setInteractive();
    hnt.setAlpha(hintsEnabled?1:0.32); this.track(hnt);
    hnt.on('pointerdown',()=>{ hintsEnabled=!hintsEnabled; saveSetting('mj_hints',hintsEnabled);
      hnt.setAlpha(hintsEnabled?1:0.4); syncHintSeg(); syncHelpBtn();
      if(G&&window.phaserScene) window.phaserScene.refresh(G);
      this.showToast(hintsEnabled?'💡 Hints on':'Hints off', hintsEnabled?'#39d8ff':'#aaaaaa'); });
    hnt.on('pointerover',()=>hnt.setAlpha(0.7)); hnt.on('pointerout',()=>hnt.setAlpha(hintsEnabled?1:0.32));
  }

  // ── Other player zone ──
  drawOtherPlayer(zone, player, g, pos) {
    const isCur=g.currentPlayer===player.id;
    const wind=g.seatWinds[player.id];
    const hsz=g.handSizes[player.id]||0;
    const score=g.scores[player.id]||0;

    // Pre-compute content height so the panel hugs its content (no blank band)
    const hdrH=22, pad=4, innerW=zone.w-pad*2;
    const bonus=g.bonus[player.id]||[];
    const melds=g.melds[player.id]||[];
    const bonusBw=bonus.length?Math.min(18,Math.floor(innerW/(bonus.length+1))):0;
    const bonusH=bonus.length?Math.round(bonusBw*1.21)+3:0;
    let contentH;
    let tw,th;
    if (pos==='west'||pos==='east') {
      const narrow=this.scale.width<480;
      const remH0=zone.h-hdrH-pad-bonusH-pad;
      // Narrow screens: smaller tiles + lower fill so the side columns stay
      // short and don't stretch the whole table vertically.
      const cap=narrow?14:20, fill=narrow?0.5:0.7;
      tw=Math.max(narrow?10:12,Math.min(cap,Math.floor((remH0*fill)/Math.max(1,hsz))-2));
      th=Math.round(tw*1.21);
      const mw=Math.min(tw,18);
      const meldsH=melds.reduce((s,m)=>s+m.tiles.length*mw+(m.tiles.length-1)*2+8,0);
      contentH=hdrH+pad+bonusH+hsz*(tw+2)+(melds.length?6+meldsH:0)+6;
    } else {
      ({w:tw,h:th}=this.tileSize(innerW,hsz,30,12));
      contentH=hdrH+pad+bonusH+th+6;
    }
    // Side zones center their fitted panel vertically; north stays at the top
    const z={x:zone.x, w:zone.w, h:Math.min(zone.h,contentH),
             y:(pos==='west'||pos==='east')?zone.y+Math.max(0,(zone.h-contentH)/2):zone.y};
    this.seatAnchor[player.id]={x:z.x+z.w/2, y:z.y+14};

    this.zoneBg(z,0x000000,isCur?0.27:0.18);
    if (isCur) {
      const glow=this.add.graphics(); this.track(glow);
      glow.lineStyle(2.5,0xffd700,0.6); glow.strokeRoundedRect(z.x+1,z.y+1,z.w-2,z.h-2,8);
      this.tweens.add({targets:glow,alpha:{from:0.8,to:0.18},duration:850,yoyo:true,repeat:-1});
    }

    this.drawNameplate(z, hdrH, { wind, name:player.name, score, isCur, isBot:player.isBot, me:false });

    let curY=z.y+hdrH+pad;

    // Bonus tiles (flower/season) — top row
    if (bonus.length) {
      const bh=Math.round(bonusBw*1.21);
      let bx=z.x+pad;
      bonus.forEach(bt=>{this.drawTile(bx,curY,bt,{w:bonusBw,h:bh}); bx+=bonusBw+2;});
      curY+=bh+3;
    }

    // (discards live in the shared center pool)

    // Side players: tiles rotated 90° toward the table center, stacked vertically
    if (pos==='west' || pos==='east') {
      const ang = pos==='west' ? 90 : -90;
      let hy = curY;
      const hxV = z.x + Math.max(pad, (z.w-th)/2);
      for (let i=0;i<hsz;i++){ this.drawTileV(hxV,hy,null,{w:tw,h:th,faceDown:true,angle:ang}); hy+=tw+2; }
      hy += 6;
      // Melds: vertical rotated stacks
      const mw=Math.min(tw,18), mh=Math.round(mw*1.21);
      melds.forEach(m=>{ if (hy<z.y+z.h-20) hy+=this.drawMeldV(hxV,hy,m,mw,mh,ang)+4; });
      return;
    }

    // North: horizontal layout (tw/th precomputed above)
    const totalHW=hsz*tw+Math.max(0,hsz-1)*2;
    let hx=z.x+pad+Math.max(0,(innerW-totalHW)/2);
    for(let i=0;i<hsz;i++){this.drawTile(hx,curY,null,{w:tw,h:th,faceDown:true}); hx+=tw+2;}
    // Melds to the right of hand
    if (melds.length) {
      const mw=Math.min(tw,22),mh=Math.round(mw*1.21);
      let mx=hx+4;
      melds.forEach(m=>{ mx+=this.drawMeld(mx,curY,m,mw,mh)+4; });
    }
  }

  // ── Center: shared discard pool ──
  drawCenter(L, g) {
    const z=L.center;
    this.zoneBg(z,0x000000,0.15,6);

    const cx=z.x+z.w/2;
    const pad=8;
    const statusY=z.y+z.h-22;

    // ── Live wall: compact ring of face-down tiles centered on the table ──
    const narrow=this.scale.width<480;
    const availH=statusY-8-(z.y+pad);
    const ringW=Math.min(z.w-pad*2, Math.max(narrow?210:260, Math.round(availH*1.5)));
    // Keep the ring roughly square so it frames the pool instead of stretching
    // tall on narrow portrait screens.
    const ringH=Math.min(Math.round(availH*0.94), Math.round(ringW*0.96));
    const ringX=z.x+(z.w-ringW)/2, ringY=z.y+pad+Math.round((availH-ringH)/2);
    const ecx=ringX+ringW/2, ecy=ringY+ringH/2;

    // ── Decorative centre medallion (behind the pool so an empty table reads
    //    intentional). A jade ring with a soft 🀄 / sakura motif. ──
    const emR=Math.min(ringW,ringH)*0.30;
    const em=this.add.graphics(); this.track(em); em.setDepth(0);
    em.fillStyle(0xffffff,0.018); em.fillCircle(ecx,ecy,emR*1.18);
    em.lineStyle(2,0xffd166,0.10); em.strokeCircle(ecx,ecy,emR);
    em.lineStyle(1,0xff9ecd,0.10); em.strokeCircle(ecx,ecy,emR*0.78);
    // four faint petal dots at compass points
    for(let i=0;i<4;i++){ const a=i*Math.PI/2; em.fillStyle(0xff9ecd,0.10); em.fillCircle(ecx+Math.cos(a)*emR,ecy+Math.sin(a)*emR,2.6); }
    const emT=this.add.text(ecx,ecy,'🀄',{fontSize:`${Math.round(emR*0.9)}px`}).setOrigin(0.5).setAlpha(0.06).setDepth(0);
    this.track(emT);
    const wt=narrow?9:12, wh=Math.round(wt*1.21), wgap=2;
    const cornerPad=wh+6;
    const topN=Math.max(4,Math.floor((ringW-2*cornerPad)/(wt+wgap)));
    const sideN=Math.max(4,Math.floor((ringH-2*cornerPad)/(wt+wgap)));
    const P=2*topN+2*sideN;
    const visible=Math.round(P*Math.max(0,Math.min(1,(g.wallCount||0)/144)));
    const posArr=[];
    const topStartX=ringX+cornerPad+(ringW-2*cornerPad-topN*(wt+wgap)+wgap)/2;
    const sideStartY=ringY+cornerPad+(ringH-2*cornerPad-sideN*(wt+wgap)+wgap)/2;
    // Clockwise: top L→R, right T→B, bottom R→L, left B→T (draws peel off the end)
    for(let i=0;i<topN;i++)  posArr.push({x:topStartX+i*(wt+wgap),          y:ringY,           rot:0});
    for(let i=0;i<sideN;i++) posArr.push({x:ringX+ringW-wh,                 y:sideStartY+i*(wt+wgap), rot:-90});
    for(let i=0;i<topN;i++)  posArr.push({x:topStartX+(topN-1-i)*(wt+wgap), y:ringY+ringH-wh,  rot:0});
    for(let i=0;i<sideN;i++) posArr.push({x:ringX,                          y:sideStartY+(sideN-1-i)*(wt+wgap), rot:90});
    const drawWallTile=p=>p.rot
      ? this.drawTileV(p.x,p.y,null,{w:wt,h:wh,faceDown:true,angle:p.rot})
      : this.drawTile(p.x,p.y,null,{w:wt,h:wh,faceDown:true});
    for(let i=0;i<visible;i++) drawWallTile(posArr[i]);
    // Fade-out animation for tiles just drawn from the wall
    const prevVis=this._wallPrev??visible;
    for(let i=visible;i<Math.min(prevVis,posArr.length);i++){
      const c=drawWallTile(posArr[i]);
      this.tweens.add({targets:c,alpha:0,scale:1.7,duration:450,ease:'Power2',onComplete:()=>{try{c.destroy();}catch{}}});
    }
    this._wallPrev=visible;

    // ── Discard pool inside the wall ring ──
    const inset=wh+8;
    const poolX=ringX+inset, poolY=ringY+inset, poolW=ringW-inset*2, poolH=ringH-inset*2;
    const pool=g.allDiscards||[];
    if (pool.length && poolH>20) {
      // Largest tile size that fits the whole pool, floor 12px; trim oldest if even that overflows
      const dgap=2;
      let dw = z.w<480 ? 30 : 40; // phones: compact but readable
      for (; dw>12; dw-=2) {
        const dh=Math.round(dw*1.21);
        if (Math.floor((poolW+dgap)/(dw+dgap)) * Math.floor((poolH+dgap)/(dh+dgap)) >= pool.length) break;
      }
      const dh=Math.round(dw*1.21);
      const perRow=Math.max(1,Math.floor((poolW+dgap)/(dw+dgap)));
      const maxRows=Math.max(1,Math.floor((poolH+dgap)/(dh+dgap)));
      const startIdx=Math.max(0,pool.length-perRow*maxRows);
      const count=pool.length-startIdx;
      const rowsUsed=Math.ceil(count/perRow);
      const gridW=Math.min(count,perRow)*(dw+dgap)-dgap;
      const dx0=poolX+Math.max(0,(poolW-gridW)/2);
      let dx=dx0, dy=poolY+Math.max(0,(poolH-(rowsUsed*(dh+dgap)-dgap))/2);
      for(let i=startIdx;i<pool.length;i++){
        const isLast=(i===pool.length-1)&&!!g.lastDiscard;
        const c=this.drawTile(dx,dy,pool[i],{w:dw,h:dh,highlighted:isLast});
        // Freshly discarded tile flies in from the discarder's side of the table
        if (isLast && pool.length>(this._poolPrev||0)) {
          const dir=this.discarderDir(g, dw*5);
          const ox=c.x, oy=c.y;
          c.x=ox+dir.dx; c.y=oy+dir.dy; c.setScale(1.25); c.setAlpha(0.15); c.setDepth(40);
          this.tweens.add({targets:c, x:ox, y:oy, scale:1, alpha:1, duration:300, ease:'Cubic.easeOut',
            onComplete:()=>{ try{c.setDepth(0);}catch{} }});
        }
        dx+=dw+dgap;
        if(dx+dw>poolX+poolW){dx=dx0; dy+=dh+dgap;}
      }
      this._poolPrev=pool.length;
    } else if (!pool.length) {
      this.txt(cx,z.y+z.h*0.42,'— Discard pool —',{fontSize:'11px',color:'#ffffff',align:'center'}).setOrigin(0.5).setAlpha(0.22);
    }

    // Status
    let statusTxt='', statusCol='#ff9ecd';
    const curName=g.players.find(p=>p.id===g.currentPlayer)?.name||'?';
    if      (g.phase==='draw')     {statusTxt=g.currentPlayer===myId?'Drawing…':`${curName} drawing…`;}
    else if (g.phase==='discard')  {statusTxt=g.currentPlayer===myId?'↓ Tap a tile to discard':`${curName} discarding…`; statusCol=g.currentPlayer===myId?'#f1c40f':'#ff9ecd';}
    else if (g.phase==='claim')    {const ha=(g.myActions||[]).some(a=>a!=='discard'&&a!=='pass'); statusTxt=ha?'⚡ Claim or Pass?':'Waiting for claims…'; statusCol=ha?'#e67e22':'#ff9ecd';}
    else if (g.phase==='robKong')  {statusTxt=(g.myActions||[]).includes('win')?'⚡ Rob the Kong? (搶槓)':'Add-on Kong declared!'; statusCol='#e74c3c';}
    else if (g.phase==='finished') {statusTxt=g.winner==='draw'?'🤝 Draw!':'🏆 Game Over!'; statusCol='#5dfc8b';}
    if (statusTxt) {
      const sbg=this.add.graphics(); this.track(sbg);
      sbg.fillStyle(0x000000,0.35); sbg.fillRoundedRect(z.x+6,statusY-2,z.w-12,20,5);
      this.txt(cx,statusY+8,statusTxt,{fontSize:'11px',color:statusCol,align:'center'}).setOrigin(0.5,0.5);
    }
  }

  // ── My area ──
  drawMyArea(zone, player, g) {
    const isCur=g.currentPlayer===player.id;
    const wind=g.seatWinds[player.id];
    const score=g.scores[player.id]||0;

    // Size the hand first so the panel hugs its content (anchored to the bottom)
    const hand=g.myHand||[];
    const handAreaW=zone.w-10;
    const twoRows = zone.w<560 && hand.length>8; // bigger touch targets on phones
    const perRow = twoRows ? Math.ceil(hand.length/2) : hand.length;
    const {w:tw,h:th}=this.tileSize(handAreaW,perRow,52,24);
    const rows=twoRows?2:1;
    const hdrH=22, bonusRowH=38;
    const panelH=Math.min(zone.h, hdrH+4+bonusRowH+rows*(th+5)+14);
    const z={x:zone.x, w:zone.w, h:panelH, y:zone.y+zone.h-panelH};
    this.seatAnchor[player.id]={x:z.x+z.w/2, y:z.y+12};

    const mbg=this.add.graphics(); this.track(mbg);
    mbg.fillStyle(0x000000,0.34); mbg.fillRoundedRect(z.x,z.y,z.w,z.h,8);
    mbg.lineStyle(1.5,isCur?0xffd700:0xffffff,isCur?0.4:0.08); mbg.strokeRoundedRect(z.x,z.y,z.w,z.h,8);

    if (isCur) {
      const glow=this.add.graphics(); this.track(glow);
      glow.lineStyle(2.5,0xffd700,0.5); glow.strokeRoundedRect(z.x+2,z.y+2,z.w-4,z.h-4,7);
      this.tweens.add({targets:glow,alpha:{from:0.8,to:0.15},duration:750,yoyo:true,repeat:-1});
    }

    this.drawNameplate(z, hdrH, { wind, name:`You · ${WL[wind]}`, score, isCur, isBot:false, me:true });

    // Bonus + melds row
    const bonusRowY=z.y+hdrH+4;
    const bonus=g.myBonus||[], myMelds=g.melds[player.id]||[];
    let bx=z.x+5;
    if (bonus.length) {
      const bw=24, bh=Math.round(bw*1.21);
      bonus.forEach(bt=>{this.drawTile(bx,bonusRowY,bt,{w:bw,h:bh}); bx+=bw+2;});
    }
    // Melds aligned right
    if (myMelds.length) {
      const mw=28, mh=Math.round(mw*1.21);
      let mx=z.x+z.w-5;
      for(let i=myMelds.length-1;i>=0;i--){
        const mw2=myMelds[i].tiles.length*mw+(myMelds[i].tiles.length-1)*2+4;
        mx-=mw2; this.drawMeld(mx,bonusRowY,myMelds[i],mw,mh); mx-=5;
      }
    }

    // Hand tiles (1 row, or 2 rows on narrow screens)
    const handY_start=bonusRowY+bonusRowH;
    const canDiscard=isCur&&(g.myActions||[]).includes('discard');
    // Optional discard hint (opt-in) — only on my discard turn, when nothing picked.
    // Shown when persistent hints are on, or when the player tapped Help this turn.
    let hintId=null;
    if ((hintsEnabled || helpOnce) && canDiscard && selTile==null) {
      const h=computeHint(hand, (g.melds[player.id]||[]).length);
      if (h) {
        hintId=h.discardId;
        const label = h.ready
          ? `💡 Ready! Discard this — waiting on  ${waitsToGlyphs(h.waits)}`
          : '💡 Suggested discard';
        this.txt(z.x+z.w/2, z.y-10, label, {fontSize:'12px',color:'#39d8ff',fontStyle:'bold',
          stroke:'#001018',strokeThickness:3,resolution:2}).setOrigin(0.5,0.5).setDepth(60);
      }
    }
    // Hint above the selected tile
    if (selTile!=null && canDiscard && hand.some(t=>t.id===selTile)) {
      this.txt(z.x+z.w/2, z.y-10, 'Tap again to discard ⤵', {fontSize:'12px',color:'#ffd700',fontStyle:'bold',
        stroke:'#000000',strokeThickness:3,resolution:2}).setOrigin(0.5,0.5).setDepth(60);
    }
    for(let r=0;r<rows;r++){
      const rowTiles=hand.slice(r*perRow,(r+1)*perRow);
      const totalHW=rowTiles.length*tw+Math.max(0,rowTiles.length-1)*3;
      let hx=z.x+5+Math.max(0,(handAreaW-totalHW)/2);
      const hy=handY_start+r*(th+5);
      rowTiles.forEach(t=>{
        const isSel=t.id===selTile, isNew=t.id===lastDrawnTileId;
        this.drawTile(hx,hy,t,{w:tw,h:th,selected:isSel,animate:isNew,hint:t.id===hintId,
          clickable:canDiscard, onTap:canDiscard?(()=>tileClick(t.id)):null});
        hx+=tw+3;
      });
    }
  }

  // ── Main refresh ──
  refresh(g) {
    this.clear();
    this.seatAnchor={};
    G=g; if (!G) return;
    const myIdx=G.players.findIndex(p=>p.id===myId);
    if (myIdx<0) return;
    const n=G.players.length;
    const left=G.players[(myIdx+1)%n], across=G.players[(myIdx+2)%n], right=G.players[(myIdx+n-1)%n], me=G.players[myIdx];
    const L=this.layout();
    this.drawTable(L);
    this.drawInfoBar(L,G);
    this.drawOtherPlayer(L.north,across,G,'north');
    this.drawOtherPlayer(L.west,left,G,'west');
    this.drawOtherPlayer(L.east,right,G,'east');
    this.drawCenter(L,G);
    this.drawMyArea(L.south,me,G);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
{ const fab=document.getElementById('chatFloatBtn'); if(fab) fab.style.display='none'; } // game-only
syncHintSeg(); // reflect the persisted "Help me play" setting in the waiting-room toggle
// First-time players get the how-to-play walkthrough automatically (once)
try { if(!localStorage.getItem('mj_seen_tutorial')) setTimeout(showTutorial, 500); } catch {}
connect();
setInterval(()=>{ if(document.getElementById('lobbyScreen').classList.contains('active')) refreshRooms(); },12000);
