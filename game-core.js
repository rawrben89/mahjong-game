// ─── Tile definitions ───────────────────────────────────────────────────────
const SUITS = ['bamboo', 'characters', 'circles'];
const WINDS = ['east', 'south', 'west', 'north'];
const DRAGONS = ['red', 'green', 'white'];

let _tileId = 0;
const mk = (suit, value) => ({ id: _tileId++, suit, value });

function buildWall() {
  _tileId = 0;
  const t = [];
  SUITS.forEach(s => { for (let v = 1; v <= 9; v++) for (let c = 0; c < 4; c++) t.push(mk(s, v)); });
  WINDS.forEach(w => { for (let c = 0; c < 4; c++) t.push(mk('wind', w)); });
  DRAGONS.forEach(d => { for (let c = 0; c < 4; c++) t.push(mk('dragon', d)); });
  for (let v = 1; v <= 4; v++) { t.push(mk('flower', v)); t.push(mk('season', v)); }
  return t;
}

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const isBonus = t => t.suit === 'flower' || t.suit === 'season';
const tileKey = t => `${t.suit}:${t.value}`;
const same = (a, b) => a.suit === b.suit && a.value === b.value;

// ─── Sorting ────────────────────────────────────────────────────────────────
function sortTiles(tiles) {
  const sr = { bamboo: 0, characters: 1, circles: 2, wind: 3, dragon: 4, flower: 5, season: 6 };
  const wr = { east: 0, south: 1, west: 2, north: 3 };
  const dr = { red: 0, green: 1, white: 2 };
  return [...tiles].sort((a, b) => {
    if (sr[a.suit] !== sr[b.suit]) return sr[a.suit] - sr[b.suit];
    const av = typeof a.value === 'number' ? a.value : a.suit === 'wind' ? wr[a.value] : dr[a.value];
    const bv = typeof b.value === 'number' ? b.value : b.suit === 'wind' ? wr[b.value] : dr[b.value];
    return av - bv;
  });
}

// ─── Win detection ──────────────────────────────────────────────────────────
function checkSets(tiles) {
  if (tiles.length === 0) return true;
  if (tiles.length % 3 !== 0) return false;
  const s = sortTiles(tiles);
  const first = s[0];

  const triIdx = [];
  s.forEach((t, i) => { if (same(t, first) && triIdx.length < 3) triIdx.push(i); });
  if (triIdx.length === 3) {
    if (checkSets(s.filter((_, i) => !triIdx.includes(i)))) return true;
  }

  if (SUITS.includes(first.suit)) {
    const i2 = s.findIndex(t => t.suit === first.suit && t.value === first.value + 1);
    if (i2 !== -1) {
      const i3 = s.findIndex((t, i) => i !== 0 && i !== i2 && t.suit === first.suit && t.value === first.value + 2);
      if (i3 !== -1) {
        if (checkSets(s.filter((_, i) => i !== 0 && i !== i2 && i !== i3))) return true;
      }
    }
  }
  return false;
}

function canWinHand(tiles) {
  if (tiles.length === 0 || tiles.length % 3 !== 2) return false;
  const s = sortTiles(tiles);

  // Seven pairs
  if (tiles.length === 14) {
    const counts = {};
    tiles.forEach(t => counts[tileKey(t)] = (counts[tileKey(t)] || 0) + 1);
    if (Object.keys(counts).length === 7 && Object.values(counts).every(c => c >= 2)) return true;
  }

  // Standard: pair + 4 sets
  const tried = new Set();
  for (let i = 0; i < s.length; i++) {
    const k = tileKey(s[i]);
    if (tried.has(k)) continue;
    tried.add(k);
    const j = s.findIndex((t, idx) => idx > i && same(t, s[i]));
    if (j === -1) continue;
    const rem = s.filter((_, idx) => idx !== i && idx !== j);
    if (checkSets(rem)) return true;
  }
  return false;
}

// ─── Claim helpers ──────────────────────────────────────────────────────────
const canPong = (hand, t) => hand.filter(h => same(h, t)).length >= 2;
const canKong = (hand, t) => hand.filter(h => same(h, t)).length >= 3;

function canChow(hand, t) {
  if (!SUITS.includes(t.suit)) return false;
  const v = t.value;
  const has = n => n >= 1 && n <= 9 && hand.some(h => h.suit === t.suit && h.value === n);
  return (has(v - 2) && has(v - 1)) || (has(v - 1) && has(v + 1)) || (has(v + 1) && has(v + 2));
}

function chowOptions(hand, t) {
  if (!SUITS.includes(t.suit)) return [];
  const v = t.value;
  const has = n => n >= 1 && n <= 9 && hand.some(h => h.suit === t.suit && h.value === n);
  const opts = [];
  if (has(v - 2) && has(v - 1)) opts.push([v - 2, v - 1]);
  if (has(v - 1) && has(v + 1)) opts.push([v - 1, v + 1]);
  if (has(v + 1) && has(v + 2)) opts.push([v + 1, v + 2]);
  return opts;
}

// ─── Scoring — WMT/Guangdong fan system, ported from rawrben89/mahjong-scoreboard ──
// Fan values are direct points (no exponentiation); total fan = sum of combos
// + 1/kong + 1/bonus tile + 1 self-draw. Minimum MIN_FAN to declare a win.
const MIN_FAN = 3;
const PUNG_MELDS = ['pong', 'kong', 'hiddenKong', 'addOnKong'];
const KONG_MELDS = ['kong', 'hiddenKong', 'addOnKong'];
const ORPHAN_KEYS = ['bamboo:1','bamboo:9','characters:1','characters:9','circles:1','circles:9',
  'wind:east','wind:south','wind:west','wind:north','dragon:red','dragon:green','dragon:white'];

function tileCounts(tiles) {
  const c = {};
  tiles.forEach(t => { const k = tileKey(t); c[k] = (c[k] || 0) + 1; });
  return c;
}

// Like checkSets but restricted to only-chows or only-pungs decompositions
function checkSetsR(tiles, allowChow, allowPung) {
  if (tiles.length === 0) return true;
  if (tiles.length % 3 !== 0) return false;
  const s = sortTiles(tiles);
  const first = s[0];
  if (allowPung) {
    const tri = [];
    s.forEach((t, i) => { if (same(t, first) && tri.length < 3) tri.push(i); });
    if (tri.length === 3 && checkSetsR(s.filter((_, i) => !tri.includes(i)), allowChow, allowPung)) return true;
  }
  if (allowChow && SUITS.includes(first.suit)) {
    const i2 = s.findIndex(t => t.suit === first.suit && t.value === first.value + 1);
    if (i2 !== -1) {
      const i3 = s.findIndex((t, i) => i !== 0 && i !== i2 && t.suit === first.suit && t.value === first.value + 2);
      if (i3 !== -1 && checkSetsR(s.filter((_, i) => i !== 0 && i !== i2 && i !== i3), allowChow, allowPung)) return true;
    }
  }
  return false;
}

function concealedDecomposes(hand, allowChow, allowPung) {
  const s = sortTiles(hand);
  const tried = new Set();
  for (let i = 0; i < s.length; i++) {
    const k = tileKey(s[i]);
    if (tried.has(k)) continue;
    tried.add(k);
    const j = s.findIndex((t, idx) => idx > i && same(t, s[i]));
    if (j === -1) continue;
    if (checkSetsR(s.filter((_, idx) => idx !== i && idx !== j), allowChow, allowPung)) return true;
  }
  return false;
}

// opts: { selfDraw, winType ('selfDraw'|'claim'|'robKong'), afterKong, kongChain,
//         lastWall, heavenly, earthly }
function computeFan(hand, melds, bonusTiles, seatWind, prevWind, opts = {}) {
  const bd = [];
  const add = (name, fan) => bd.push({ name, fan });
  const all = [...hand, ...melds.flatMap(m => m.tiles)];
  const counts = tileCounts(all);
  const isHonor = t => t.suit === 'wind' || t.suit === 'dragon';
  const suitTiles = all.filter(t => SUITS.includes(t.suit));
  const honorTiles = all.filter(isHonor);
  const suitsPresent = new Set(suitTiles.map(t => t.suit));
  const meldKongs = melds.filter(m => KONG_MELDS.includes(m.type)).length;
  const openMelds = melds.filter(m => m.type !== 'hiddenKong');
  const noMelds = melds.length === 0;
  const distinct = Object.keys(counts);

  // ── Special hands ──
  const isT13 = noMelds && hand.length === 14 && distinct.length === 13 && distinct.every(k => ORPHAN_KEYS.includes(k));
  const is7p  = !isT13 && noMelds && hand.length === 14 && distinct.length === 7 && Object.values(counts).every(c => c === 2);
  let is9g = false;
  if (noMelds && hand.length === 14 && suitsPresent.size === 1 && honorTiles.length === 0) {
    const need = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];
    is9g = [1,2,3,4,5,6,7,8,9].every(v => all.filter(t => t.value === v).length >= need[v]);
  }
  const is4k = meldKongs === 4;
  const isAllPungs = !is7p && !isT13 && melds.every(m => PUNG_MELDS.includes(m.type)) && concealedDecomposes(hand, false, true);
  const isAllChows = !is7p && !isT13 && melds.every(m => m.type === 'chow') && concealedDecomposes(hand, true, false);
  const isPure  = suitsPresent.size === 1 && honorTiles.length === 0;
  const isMixed = suitsPresent.size === 1 && honorTiles.length > 0;
  const isAllHonors = suitsPresent.size === 0 && honorTiles.length > 0;
  // 混么九: every set is a pung of terminals (1/9) or honors
  const isTermHon = !isAllHonors && isAllPungs && suitTiles.length > 0 && honorTiles.length > 0 &&
    all.every(t => isHonor(t) || t.value === 1 || t.value === 9);
  const GREEN = new Set(['bamboo:2','bamboo:3','bamboo:4','bamboo:6','bamboo:8','dragon:green']);
  const isGreen = all.every(t => GREEN.has(tileKey(t)));
  const isBlue  = !isGreen && all.every(t => t.suit === 'circles' || tileKey(t) === 'dragon:white') && (counts['dragon:white'] || 0) >= 2;
  const isRed   = !isGreen && !isBlue && all.every(t => t.suit === 'characters' || tileKey(t) === 'dragon:red') && (counts['dragon:red'] || 0) >= 2;
  const pungOf = k => (counts[k] || 0) >= 3;
  const dragonPungs = DRAGONS.filter(d => pungOf('dragon:' + d));
  const dragonPairs = DRAGONS.filter(d => (counts['dragon:' + d] || 0) === 2);
  const windPungs = WINDS.filter(w => pungOf('wind:' + w));
  const windPairs = WINDS.filter(w => (counts['wind:' + w] || 0) === 2);
  const isB3D = dragonPungs.length === 3;
  const isS3D = !isB3D && dragonPungs.length === 2 && dragonPairs.length === 1;
  const isB4W = windPungs.length === 4;
  const isS4W = !isB4W && windPungs.length === 3 && windPairs.length === 1;

  if (opts.heavenly) add('天糊 Heavenly Hand', 13);
  if (opts.earthly)  add('地糊 Earthly Hand', 13);

  if (isT13) add('十三幺 Thirteen Orphans', 13);
  if (is4k)  add('十八羅漢 Eighteen Arhats', 13);
  if (is9g)  add('九蓮寶燈 Nine Gates', 10);
  if (isAllHonors) add('字一色 All Honors', 10);
  if (isTermHon)   add('混么九 Terminals & Honors', 10);
  if (isGreen)      add('綠一色 All Green', 10);
  else if (isBlue)  add('藍一色 All Blue', 10);
  else if (isRed)   add('紅一色 All Red', 10);
  if (isB4W) add('大四喜 Big Four Winds', 13);
  else if (isS4W) add('小四喜 Small Four Winds', 6);
  if (isB3D) add('大三元 Big Three Dragons', 8);
  else if (isS3D) add('小三元 Small Three Dragons', 5);
  if (isPure && !is9g) add('清一色 Pure Suit', 7);          // Nine Gates subsumes Pure Suit
  if (isMixed && !isTermHon) add('混一色 Mixed One Suit', 3); // Term&Honors subsumes Mixed
  if (is7p) add('七對子 Seven Pairs', 4);
  if (isAllPungs && !is4k) add('碰碰糊 All Triplets', 3);     // Arhats subsumes All Triplets
  if (isAllChows) add('平糊 Peace Hand', 1);

  // Honor pung bonuses, blocked when a bigger combo already covers them
  const blockDragons = isB3D || isS3D || isT13 || isPure || isAllChows || is7p || is9g;
  const blockWinds   = isT13 || isPure || isAllChows || is7p || is9g;
  if (!blockDragons) {
    const DN = { red: '中 Red Dragon Pung', green: '發 Green Dragon Pung', white: '白 White Dragon Pung' };
    dragonPungs.forEach(d => add(DN[d], 1));
  }
  if (!blockWinds) {
    if (pungOf('wind:' + seatWind)) add('自風刻 Seat Wind Pung', 1);
    if (pungOf('wind:' + prevWind)) add('圈風刻 Round Wind Pung', 1);
  }

  // Win-method bonuses
  if (opts.selfDraw) add('自摸 Self Draw', 1);
  if (!opts.selfDraw && opts.winType !== 'robKong' && openMelds.length === 0) add('門清 Concealed Hand', 1);
  if (opts.winType === 'robKong') add('搶槓 Robbing the Kong', 1);
  if (opts.afterKong) {
    if ((opts.kongChain || 1) >= 2) add('槓上槓 Double Kong', 9);
    else add('槓上花 Win by Kong', 2);
  }
  if (opts.lastWall) add('海底撈月 Last Tile', 1);

  // +1 per declared kong, +1 per bonus tile
  if (meldKongs > 0) add(`槓 Kong ×${meldKongs}`, meldKongs);
  if (bonusTiles.length > 0) add(`花牌 Bonus Tiles ×${bonusTiles.length}`, bonusTiles.length);

  const fan = bd.reduce((s, x) => s + x.fan, 0);
  return { fan, breakdown: bd };
}

// Build the fan-relevant context for a prospective win
function winOpts(g, pid, selfDraw, winType) {
  const dealer = g.players[0];
  return {
    selfDraw,
    winType,
    afterKong: selfDraw && g._afterKongDraw === pid,
    kongChain: g._kongChain || 0,
    lastWall: selfDraw && g.wall.length === 0,
    heavenly: selfDraw && pid === dealer && g.allDiscards.length === 0 && g.melds[pid].length === 0,
    earthly: !selfDraw && winType === 'claim' && g.allDiscards.length === 1 &&
             g.lastDiscardBy === dealer && g.melds[pid].length === 0,
  };
}

// Valid win = winning shape AND at least MIN_FAN fan
function canWinNow(g, pid, extraTile, selfDraw, winType) {
  const hand = extraTile ? [...g.hands[pid], extraTile] : g.hands[pid];
  const plain = hand.map(t => ({ suit: t.suit, value: t.value }));
  if (!canWinHand(plain)) return false;
  const { fan } = computeFan(plain, g.melds[pid], g.bonus[pid], g.seatWinds[pid],
    g.prevailingWind, winOpts(g, pid, selfDraw, winType));
  return fan >= MIN_FAN;
}

// ─── Room state ─────────────────────────────────────────────────────────────
const rooms = new Map();
const wsToPlayer = new Map();

function dealGame(playerIds, prevailingWind) {
  const wall = shuffle(buildWall());
  const hands = {}, bonus = {}, melds = {}, discards = {}, scores = {};
  playerIds.forEach(id => { hands[id] = []; bonus[id] = []; melds[id] = []; discards[id] = []; scores[id] = 0; });

  for (let i = 0; i < 13; i++) playerIds.forEach(id => hands[id].push(wall.pop()));
  hands[playerIds[0]].push(wall.pop()); // dealer gets extra tile

  // Replace bonus tiles in initial hands
  playerIds.forEach(id => {
    let i = 0;
    while (i < hands[id].length) {
      if (isBonus(hands[id][i])) {
        bonus[id].push(hands[id].splice(i, 1)[0]);
        if (wall.length > 0) hands[id].push(wall.pop());
      } else i++;
    }
  });

  return {
    wall, hands, bonus, melds, discards,
    allDiscards: [],
    players: playerIds,
    seatWinds: Object.fromEntries(playerIds.map((id, i) => [id, WINDS[i]])),
    prevailingWind: prevailingWind || 'east',
    currentIdx: 0,
    currentPlayer: playerIds[0],
    phase: 'discard', // dealer already has 14, must discard
    lastDiscard: null,
    lastDiscardBy: null,
    pendingClaims: {},
    claimChowVals: {},
    awaitingClaims: new Set(),
    scores,
    winner: null,
    winType: null,
    winScore: null,
    isBot: {},
    round: 1,
    // Kong-supplement tracking for 槓上花 / 槓上槓 fan
    _kongPid: null,
    _kongChain: 0,
    _supp: null,          // pid whose next draw is a kong supplement
    _afterKongDraw: null, // pid currently holding a supplement draw
  };
}

// ─── Bot AI (difficulty-aware: 'easy' | 'medium' | 'hard') ───────────────────
function botScoreTile(tile, hand) {
  const count = hand.filter(t => same(t, tile)).length;
  if (count >= 3) return 30;
  if (count >= 2) return 20;
  if (!SUITS.includes(tile.suit)) return count >= 1 ? 8 : 2;
  const v = tile.value;
  const has = n => hand.some(t => t.suit === tile.suit && t.value === n);
  let s = 0;
  if (has(v - 1) && has(v + 1)) s += 15;        // fills a gap
  if (has(v - 1) || has(v + 1)) s += 7;         // adjacent
  if (has(v - 2) || has(v + 2)) s += 3;         // one-gap
  if (v === 1 || v === 9) s -= 2;               // terminals less flexible
  return s;
}

// The suit the hand leans toward (for flush-seeking hard bots)
function dominantSuit(hand) {
  const c = { bamboo: 0, characters: 0, circles: 0 };
  hand.forEach(t => { if (SUITS.includes(t.suit)) c[t.suit]++; });
  let best = 'bamboo', n = -1;
  for (const s in c) if (c[s] > n) { n = c[s]; best = s; }
  return { suit: best, count: n };
}

// Every distinct tile type (suited 1-9 + honours), for tenpai/wait scanning
const ALL_TILE_TYPES = (() => {
  const t = [];
  SUITS.forEach(s => { for (let v = 1; v <= 9; v++) t.push({ suit: s, value: v }); });
  WINDS.forEach(w => t.push({ suit: 'wind', value: w }));
  DRAGONS.forEach(d => t.push({ suit: 'dragon', value: d }));
  return t;
})();

// Given a concealed hand one tile short of a win (length % 3 === 1), the tile
// types that would complete it. Skips waits with no copies left in `conc`.
function tenpaiWaits(conc) {
  if (conc.length % 3 !== 1) return [];
  const waits = [];
  for (const ty of ALL_TILE_TYPES) {
    if (conc.filter(x => same(x, ty)).length >= 4) continue;
    if (canWinHand([...conc, ty])) waits.push(ty);
  }
  return waits;
}

function botChooseDiscard(hand, level = 'medium') {
  // Tenpai-seeking (medium/hard): prefer a discard that leaves the hand ready
  // to win, choosing the discard with the most live waiting tiles. Easy bots
  // stay loose and skip this. Always falls through to the heuristic below.
  if (level !== 'easy' && hand.length % 3 === 2) {
    const seen = new Set(); const distinct = [];
    for (const t of hand) { const k = tileKey(t); if (!seen.has(k)) { seen.add(k); distinct.push(t); } }
    let best = null;
    for (const d of distinct) {
      const i = hand.findIndex(x => same(x, d));
      const rem = hand.filter((_, idx) => idx !== i);
      const waits = tenpaiWaits(rem);
      if (!waits.length) continue;
      const live = waits.reduce((s, w) => s + (4 - hand.filter(x => same(x, w)).length), 0);
      // Maximise live waits; tie-break by discarding the least useful tile
      const keepScore = botScoreTile(d, hand);
      if (!best || live > best.live || (live === best.live && keepScore < best.keepScore)) {
        best = { tile: d, live, keepScore };
      }
    }
    if (best && (level === 'hard' || Math.random() < 0.85)) return best.tile;
  }

  const scored = hand.map(t => ({ t, s: botScoreTile(t, hand) }));
  if (level === 'hard') {
    // Commit to a flush when one suit clearly dominates: dump off-suit tiles
    const dom = dominantSuit(hand);
    if (dom.count >= 8) scored.forEach(o => { if (SUITS.includes(o.t.suit) && o.t.suit !== dom.suit) o.s -= 12; });
  }
  scored.sort((a, b) => a.s - b.s);
  if (level === 'easy') {
    // Loose, less optimal: drop a random tile from the 4 least useful
    const pool = scored.slice(0, Math.min(4, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].t;
  }
  return scored[0].t;
}

// Returns { action } and optionally { chowVals } for chow claims.
function botDecide(hand, actions, level = 'medium') {
  if (actions.includes('win')) return { action: 'win' };
  if (level === 'easy') {
    // Casual: usually just lets discards go by, occasionally pongs
    if (actions.includes('pong') && Math.random() < 0.4) return { action: 'pong' };
    return { action: 'pass' };
  }
  if (actions.includes('kong')) return { action: 'kong' };
  if (actions.includes('pong')) return { action: 'pong' };
  // Only hard bots actively call chow, and not when chasing a pung/flush hand
  if (level === 'hard' && actions.includes('chow')) {
    const dom = dominantSuit(hand);
    if (dom.count < 8) return { action: 'chow' };
  }
  return { action: 'pass' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// readyState 1 = OPEN in both Node `ws` and Cloudflare Workers WebSockets
function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(msg)); } catch {}
}

function broadcastRoom(room, msg) {
  room.players.forEach(p => { if (p.ws) send(p.ws, msg); });
}

// Live-voice presence: tell everyone which human players currently have voice
// on (id + name) so clients can build the WebRTC mesh and label who's talking.
function broadcastVoiceRoster(room) {
  if (!room) return;
  const members = [...(room.voice || [])]
    .map(id => room.players.find(p => p.id === id))
    .filter(p => p && p.ws)
    .map(p => ({ id: p.id, name: p.name }));
  broadcastRoom(room, { type: 'voiceRoster', members });
}

function getAvailableActions(game, pid, asDiscarder) {
  if (asDiscarder) {
    const actions = [];
    if (canWinNow(game, pid, null, true, 'selfDraw')) actions.push('win');
    actions.push('discard');

    // Concealed Kong (暗槓)
    const counts = {};
    game.hands[pid].forEach(t => counts[tileKey(t)] = (counts[tileKey(t)] || 0) + 1);
    if (Object.values(counts).some(c => c >= 4)) actions.push('hiddenKong');

    // Add-on Kong (升槓): have a pong meld + matching tile in hand
    game.melds[pid].forEach(m => {
      if (m.type === 'pong' && game.hands[pid].some(t => same(t, m.tiles[0]))) {
        if (!actions.includes('addOnKong')) actions.push('addOnKong');
      }
    });

    return actions;
  }

  // Claim actions after someone discarded (or robKong)
  const d = game.lastDiscard;
  const hand = game.hands[pid];
  const actions = [];
  if (canWinNow(game, pid, d, false, 'claim')) actions.push('win');
  if (canKong(hand, d)) actions.push('kong');
  if (canPong(hand, d)) actions.push('pong');
  return actions;
}

function gameStateFor(game, room, pid) {
  const mySeat = game.seatWinds[pid];
  const myIdx = game.players.indexOf(pid);

  let myActions = [];
  if (game.phase === 'discard' && game.currentPlayer === pid) {
    myActions = getAvailableActions(game, pid, true);
  } else if ((game.phase === 'claim' || game.phase === 'robKong') && game.awaitingClaims.has(pid)) {
    if (game.phase === 'robKong') {
      myActions = ['win', 'pass'];
    } else {
      const discIdx = game.players.indexOf(game.lastDiscardBy);
      const leftIdx = (discIdx + 1) % game.players.length;
      const acts = getAvailableActions(game, pid, false);
      if (myIdx === leftIdx && canChow(game.hands[pid], game.lastDiscard)) acts.push('chow');
      acts.push('pass');
      myActions = acts;
    }
  }

  const handSizes = {};
  game.players.forEach(p => { handSizes[p] = game.hands[p].length; });

  // Build scoring breakdown if game is finished
  let scoreBreakdown = null;
  if (game.phase === 'finished' && game.winner && game.winner !== 'draw' && game.winScore) {
    scoreBreakdown = game.winScore;
  }

  return {
    type: 'gameState',
    myId: pid,
    myHand: sortTiles(game.hands[pid]),
    myBonus: game.bonus[pid],
    bonus: game.bonus,
    melds: game.melds,
    discards: game.discards,
    allDiscards: game.allDiscards,
    handSizes,
    wallCount: game.wall.length,
    currentPlayer: game.currentPlayer,
    phase: game.phase,
    seatWinds: game.seatWinds,
    prevailingWind: game.prevailingWind,
    lastDiscard: game.lastDiscard,
    lastDiscardBy: game.lastDiscardBy,
    myActions,
    scores: game.scores,            // cumulative match totals
    handScores: game.handScores,    // this hand's deltas
    players: room.players.map(p => ({
      id: p.id, name: p.name,
      seatWind: game.seatWinds[p.id],
      isBot: !!game.isBot[p.id],
    })),
    winner: game.winner,
    winType: game.winType,
    winScore: scoreBreakdown,
    winnerHand: game.winner && game.winner !== 'draw' ? game.hands[game.winner] : null,
    winnerMelds: game.winner && game.winner !== 'draw' ? game.melds[game.winner] : null,
    round: game.round,
    roundWindIdx: game.roundWindIdx,
    handNo: game.handNo,
  };
}

function sendState(room) {
  if (!room.game) return;
  room.players.forEach(p => {
    if (p.ws) send(p.ws, gameStateFor(room.game, room, p.id));
  });
}

// ─── Turn management ─────────────────────────────────────────────────────────
function popFromWall(game, pid) {
  let t = game.wall.pop();
  while (t && isBonus(t)) { game.bonus[pid].push(t); t = game.wall.pop(); }
  return t;
}

function advanceTurn(room) {
  const g = room.game;
  if (g.wall.length === 0) {
    g.winner = 'draw';
    g.phase = 'finished';
    sendState(room);
    return;
  }
  g.currentIdx = (g.currentIdx + 1) % g.players.length;
  g.currentPlayer = g.players[g.currentIdx];
  g.phase = 'draw';
  g.pendingClaims = {};
  g.claimChowVals = {};
  g.awaitingClaims = new Set();
  g.lastDiscard = null;
  g.lastDiscardBy = null;
  sendState(room);
  if (g.isBot[g.currentPlayer]) setTimeout(() => botDraw(room), 600);
}

function setupClaims(room) {
  const g = room.game;
  const discIdx = g.players.indexOf(g.lastDiscardBy);
  const leftIdx = (discIdx + 1) % g.players.length;

  g.pendingClaims = {};
  g.claimChowVals = {};
  g.awaitingClaims = new Set();

  let anyHuman = false;
  g.players.forEach((pid, idx) => {
    if (pid === g.lastDiscardBy) return;
    const acts = getAvailableActions(g, pid, false);
    if (idx === leftIdx && canChow(g.hands[pid], g.lastDiscard)) acts.push('chow');
    if (acts.length === 0) return;

    if (g.isBot[pid]) {
      const dec = botDecide(g.hands[pid], acts, g.botLevel);
      g.pendingClaims[pid] = dec.action;
      if (dec.action === 'chow') {
        const opts = chowOptions(g.hands[pid], g.lastDiscard);
        if (opts.length) g.claimChowVals[pid] = opts[0];
        else g.pendingClaims[pid] = 'pass';
      }
    } else {
      g.awaitingClaims.add(pid);
      anyHuman = true;
    }
  });

  sendState(room);
  if (!anyHuman) {
    setTimeout(() => resolveClaims(room), 300);
  }
}

function resolveClaims(room) {
  const g = room.game;
  const claims = Object.entries(g.pendingClaims);

  const findClaim = (type) => claims.find(([_, a]) => a === type);

  const winClaim = findClaim('win');
  if (winClaim) { applyWin(room, winClaim[0], false); return; }
  const kongClaim = findClaim('kong');
  if (kongClaim) { applyMeld(room, kongClaim[0], 'kong'); return; }
  const pongClaim = findClaim('pong');
  if (pongClaim) { applyMeld(room, pongClaim[0], 'pong'); return; }
  const chowClaim = findClaim('chow');
  if (chowClaim) { applyChow(room, chowClaim[0], g.claimChowVals[chowClaim[0]]); return; }

  advanceTurn(room);
}

function removeLastDiscard(g) {
  const by = g.lastDiscardBy;
  if (by && g.discards[by].length > 0) g.discards[by].pop();
  if (g.allDiscards.length > 0) g.allDiscards.pop();
  g.lastDiscard = null;
}

function applyWin(room, pid, selfDraw) {
  const g = room.game;
  const winType = selfDraw ? 'selfDraw' : (g.phase === 'robKong' ? 'robKong' : 'claim');
  const opts = winOpts(g, pid, selfDraw, winType);
  if (!selfDraw) {
    g.hands[pid].push(g.lastDiscard);
    removeLastDiscard(g);
  }
  g.winner = pid;
  g.winType = winType;
  g.phase = 'finished';

  const { fan, breakdown } = computeFan(
    g.hands[pid], g.melds[pid], g.bonus[pid],
    g.seatWinds[pid], g.prevailingWind, opts
  );

  // Payment (mahjong-scoreboard rules): points = fan, East involvement doubles.
  // Self-draw: every loser pays; discard/rob: the discarder pays all 3 shares.
  // Compute this hand's deltas, then fold into the cumulative match scores.
  const dealer = g.players[0];
  const delta = {}; g.players.forEach(p => delta[p] = 0);
  let winnerTotal = 0;
  if (selfDraw) {
    g.players.forEach(p => {
      if (p === pid) return;
      const mult = (p === dealer || pid === dealer) ? 2 : 1;
      const pay = fan * mult;
      delta[p] -= pay;
      winnerTotal += pay;
    });
    delta[pid] += winnerTotal;
  } else {
    const discarder = g.lastDiscardBy;
    const mult = (pid === dealer || discarder === dealer) ? 2 : 1;
    winnerTotal = fan * 3 * mult;
    delta[pid] += winnerTotal;
    if (discarder && discarder !== pid) delta[discarder] -= winnerTotal;
  }
  // Apply to this hand's delta and the cumulative totals
  room.matchScores = room.matchScores || {};
  g.players.forEach(p => {
    g.handScores[p] = (g.handScores[p] || 0) + delta[p];
    g.scores[p] = (g.scores[p] || 0) + delta[p];
    room.matchScores[p] = (room.matchScores[p] || 0) + delta[p];
  });
  g.winScore = { fan, breakdown, total: winnerTotal };

  sendState(room);
}

function applyMeld(room, pid, type) {
  const g = room.game;
  const d = g.lastDiscard;
  removeLastDiscard(g);
  const meldTiles = [d];
  const need = type === 'kong' ? 3 : 2;
  let removed = 0;
  g.hands[pid] = g.hands[pid].filter(t => {
    if (removed < need && same(t, d)) { meldTiles.push(t); removed++; return false; }
    return true;
  });
  g.melds[pid].push({ type, tiles: meldTiles });
  g.currentPlayer = pid;
  g.currentIdx = g.players.indexOf(pid);
  g.pendingClaims = {};
  g.awaitingClaims = new Set();

  if (type === 'kong') {
    g._kongChain = (g._kongPid === pid) ? (g._kongChain || 0) + 1 : 1;
    g._kongPid = pid;
    g._supp = pid; // next draw is the kong supplement
    g.phase = 'draw';
    sendState(room);
    if (g.isBot[pid]) setTimeout(() => botDraw(room), 600);
  } else {
    g._kongPid = null; g._kongChain = 0; g._afterKongDraw = null;
    g.phase = 'discard';
    sendState(room);
    if (g.isBot[pid]) setTimeout(() => { const d2 = botChooseDiscard(g.hands[pid], g.botLevel); doDiscard(room, pid, d2.id); }, 700);
  }
}

function applyChow(room, pid, chowVals) {
  const g = room.game;
  const d = g.lastDiscard;
  removeLastDiscard(g);
  const meldTiles = [d];
  if (chowVals) {
    chowVals.forEach(val => {
      const i = g.hands[pid].findIndex(t => t.suit === d.suit && t.value === val);
      if (i !== -1) meldTiles.push(g.hands[pid].splice(i, 1)[0]);
    });
  }
  g.melds[pid].push({ type: 'chow', tiles: sortTiles(meldTiles) });
  g._kongPid = null; g._kongChain = 0; g._afterKongDraw = null;
  g.currentPlayer = pid;
  g.currentIdx = g.players.indexOf(pid);
  g.phase = 'discard';
  g.pendingClaims = {};
  g.awaitingClaims = new Set();
  sendState(room);
  // A bot that just chowed must still discard (mirrors applyMeld for pong)
  if (g.isBot[pid]) setTimeout(() => { const d2 = botChooseDiscard(g.hands[pid], g.botLevel); doDiscard(room, pid, d2.id); }, 700);
}

function doDraw(room, pid) {
  const g = room.game;
  if (g.currentPlayer !== pid || g.phase !== 'draw') return;
  const tile = popFromWall(g, pid);
  if (!tile) { g.winner = 'draw'; g.phase = 'finished'; sendState(room); return; }
  g._afterKongDraw = (g._supp === pid) ? pid : null;
  g._supp = null;
  g.hands[pid].push(tile);
  g.phase = 'discard';
  sendState(room);
}

function doDiscard(room, pid, tileId) {
  const g = room.game;
  if (g.currentPlayer !== pid || g.phase !== 'discard') return;
  const idx = g.hands[pid].findIndex(t => t.id === tileId);
  if (idx === -1) return;
  // Discarding ends any kong-supplement streak
  if (g._kongPid === pid) { g._kongPid = null; g._kongChain = 0; }
  g._afterKongDraw = null;
  const tile = g.hands[pid].splice(idx, 1)[0];
  g.discards[pid].push(tile);
  g.allDiscards.push({ ...tile, discardedBy: pid });
  g.lastDiscard = tile;
  g.lastDiscardBy = pid;
  g.phase = 'claim';
  setupClaims(room);
}

function doHiddenKong(room, pid, key) {
  const g = room.game;
  if (g.currentPlayer !== pid || g.phase !== 'discard') return;
  const [suit, rawValue] = key.split(':');
  const val = isNaN(rawValue) ? rawValue : Number(rawValue);
  const matching = g.hands[pid].filter(t => t.suit === suit && t.value === val);
  if (matching.length < 4) return;
  const meldTiles = [];
  let removed = 0;
  g.hands[pid] = g.hands[pid].filter(t => {
    if (removed < 4 && t.suit === suit && t.value === val) { meldTiles.push(t); removed++; return false; }
    return true;
  });
  g.melds[pid].push({ type: 'hiddenKong', tiles: meldTiles });
  g._kongChain = (g._kongPid === pid) ? (g._kongChain || 0) + 1 : 1;
  g._kongPid = pid;
  g._supp = pid;
  g.phase = 'draw'; // draw extra tile after kong
  sendState(room);
  if (g.isBot[pid]) setTimeout(() => botDraw(room), 500);
}

// ─── Add-on Kong (升槓) ──────────────────────────────────────────────────────
function doAddOnKong(room, pid, key) {
  const g = room.game;
  if (g.currentPlayer !== pid || g.phase !== 'discard') return;

  const [suit, rawValue] = key.split(':');
  const val = isNaN(rawValue) ? rawValue : Number(rawValue);

  const meldIdx = g.melds[pid].findIndex(m =>
    m.type === 'pong' && m.tiles[0].suit === suit && m.tiles[0].value === val
  );
  if (meldIdx === -1) return;

  const handIdx = g.hands[pid].findIndex(t => t.suit === suit && t.value === val);
  if (handIdx === -1) return;

  const addedTile = g.hands[pid].splice(handIdx, 1)[0];
  g.melds[pid][meldIdx].tiles.push(addedTile);
  g.melds[pid][meldIdx].type = 'addOnKong';
  g._kongChain = (g._kongPid === pid) ? (g._kongChain || 0) + 1 : 1;
  g._kongPid = pid;
  g._supp = pid;

  // Check for rob kong (搶槓) by human players
  const robbers = [];
  g.players.forEach(otherPid => {
    if (otherPid === pid) return;
    if (g.isBot[otherPid]) return; // bots skip rob kong
    if (canWinNow(g, otherPid, { suit, value: val }, false, 'robKong')) {
      robbers.push(otherPid);
    }
  });

  if (robbers.length > 0) {
    g.phase = 'robKong';
    g.lastDiscard = { suit, value: val, id: addedTile.id };
    g.lastDiscardBy = pid;
    g.awaitingClaims = new Set(robbers);
    g.pendingClaims = {};
    sendState(room);
    // Auto-timeout: if no response in 10s, proceed
    const snapWall = g.wall.length;
    setTimeout(() => {
      if (g.phase === 'robKong' && g.wall.length === snapWall) {
        g.awaitingClaims.forEach(p => { g.pendingClaims[p] = 'pass'; });
        g.awaitingClaims = new Set();
        resolveRobKong(room);
      }
    }, 10000);
  } else {
    // No rob possible, draw replacement
    g.phase = 'draw';
    sendState(room);
    if (g.isBot[pid]) setTimeout(() => botDraw(room), 600);
  }
}

function resolveRobKong(room) {
  const g = room.game;
  const winEntry = Object.entries(g.pendingClaims).find(([, a]) => a === 'win');
  if (winEntry) {
    applyWin(room, winEntry[0], false);
  } else {
    g.lastDiscard = null;
    g.lastDiscardBy = null;
    g.pendingClaims = {};
    g.awaitingClaims = new Set();
    g.phase = 'draw';
    sendState(room);
    if (g.isBot[g.currentPlayer]) setTimeout(() => botDraw(room), 600);
  }
}

// ─── Bot draw ─────────────────────────────────────────────────────────────────
function botDraw(room) {
  const g = room.game;
  if (!g || g.phase !== 'draw') return;
  const pid = g.currentPlayer;
  if (!g.isBot[pid]) return;
  const tile = popFromWall(g, pid);
  if (!tile) { g.winner = 'draw'; g.phase = 'finished'; sendState(room); return; }
  g._afterKongDraw = (g._supp === pid) ? pid : null;
  g._supp = null;
  g.hands[pid].push(tile);
  g.phase = 'discard';

  if (canWinNow(g, pid, null, true, 'selfDraw')) {
    applyWin(room, pid, true);
    return;
  }

  // Check add-on kong for bot
  const addOnMeld = g.melds[pid].find(m => m.type === 'pong' && g.hands[pid].some(t => same(t, m.tiles[0])));
  if (addOnMeld) {
    const k = tileKey(addOnMeld.tiles[0]);
    doAddOnKong(room, pid, k);
    return;
  }
  sendState(room);
  setTimeout(() => { const d = botChooseDiscard(g.hands[pid], g.botLevel); doDiscard(room, pid, d.id); }, 700);
}

// ─── Room / game management ──────────────────────────────────────────────────
function startGame(room, withBots) {
  room.state = 'playing';
  const humanIds = room.players.map(p => p.id);
  const allIds = [...humanIds];

  if (withBots) {
    const needed = 4 - humanIds.length;
    for (let i = 0; i < needed; i++) {
      const bid = `bot-${i}-${crypto.randomUUID().slice(0, 6)}`;
      allIds.push(bid);
      room.players.push({ id: bid, ws: null, name: `Bot ${i + 1}`, roomId: room.id });
    }
  }

  // Store base order on first game
  if (!room.basePlayerOrder) room.basePlayerOrder = [...allIds];

  // Rotate seats: seatRotation determines who is dealer (East).
  // Prevailing wind advances every 4 dealer rotations, capped at North (局 East→
  // South→West→North) — matching mahjong-scoreboard's Math.min(roundWind+1, 3).
  const rotation = (room.seatRotation || 0) % 4;
  const prevWindIdx = Math.min(Math.floor((room.seatRotation || 0) / 4), 3);

  // Rotate player order so the right person is East (dealer)
  const baseOrder = room.basePlayerOrder.filter(id => allIds.includes(id));
  const rotated = [...baseOrder];
  for (let i = 0; i < rotation; i++) rotated.push(rotated.shift());
  // Append any new bots that weren't in base order
  allIds.forEach(id => { if (!rotated.includes(id)) rotated.push(id); });

  room.game = dealGame(rotated, WINDS[prevWindIdx]);
  room.game.round = rotation + 1;
  // Round wind index 0-3 (East..North) and match-hand counter for the scoreboard
  room.game.roundWindIdx = prevWindIdx;
  room.handNo = (room.handNo || 0) + 1;
  room.game.handNo = room.handNo;

  // Cumulative match scores carry across hands; handScores is just this hand.
  room.matchScores = room.matchScores || {};
  allIds.forEach(id => { if (room.matchScores[id] == null) room.matchScores[id] = 0; });
  room.game.scores = {};
  room.game.handScores = {};
  allIds.forEach(id => { room.game.scores[id] = room.matchScores[id] || 0; room.game.handScores[id] = 0; });

  if (withBots) {
    room.players.filter(p => p.id.startsWith('bot-')).forEach(p => { room.game.isBot[p.id] = true; });
  }
  room.game.botLevel = room.botLevel || 'medium';

  broadcastRoom(room, { type: 'gameStarted', windChanged: room._windChanged || null });
  room._windChanged = null;
  sendState(room);

  if (room.game.isBot[room.game.currentPlayer]) {
    setTimeout(() => { const d = botChooseDiscard(room.game.hands[room.game.currentPlayer], room.game.botLevel); doDiscard(room, room.game.currentPlayer, d.id); }, 1000);
  }
}

const MAX_ROOMS = 500;           // cap total live rooms (abuse / cost guard)
const MSG_WINDOW_MS = 1000;      // sliding window for the per-connection flood guard
const MSG_MAX_PER_WINDOW = 60;   // generous: legit play + voice ICE bursts stay well under

function handleMsg(ws, player, msg) {
  if (!player || !msg || typeof msg !== 'object') return;
  // Per-connection flood guard: drop messages once a client exceeds the rate.
  // 60/sec easily covers gameplay + WebRTC signalling but kills runaway loops.
  const now = Date.now();
  player._mq = (player._mq || []).filter(t => now - t < MSG_WINDOW_MS);
  if (player._mq.length >= MSG_MAX_PER_WINDOW) return;
  player._mq.push(now);
  const { type } = msg;

  if (type === 'setName') {
    player.name = (msg.name || 'Player').trim().slice(0, 20);
    send(ws, { type: 'nameSet', name: player.name });
    return;
  }

  // Reclaim a seat after a refresh or dropped connection
  if (type === 'resume') {
    const room = rooms.get(msg.roomId)
      || [...rooms.values()].find(r => r.players.some(p => p.id === msg.playerId));
    const entry = room?.players.find(p => p.id === msg.playerId);
    if (!room || !entry) { send(ws, { type: 'resumeFailed' }); return; }
    // Take over the seat (close any stale socket still attached to it)
    if (entry.ws && entry.ws !== ws) { try { entry.ws.close(); } catch {} wsToPlayer.delete(entry.ws); }
    player.id = entry.id;
    player.name = entry.name;
    player.roomId = room.id;
    room.players[room.players.indexOf(entry)] = player;
    clearTimeout(room._cleanup);
    send(ws, { type: 'welcome', playerId: player.id });
    send(ws, { type: 'resumed', roomId: room.id });
    send(ws, { type: 'nameSet', name: player.name });
    if (room.game) {
      send(ws, { type: 'gameStarted' });
      send(ws, gameStateFor(room.game, room, player.id));
    } else {
      const plist = room.players.map(p => ({ id: p.id, name: p.name }));
      send(ws, { type: room.players[0]?.id === player.id ? 'roomCreated' : 'roomJoined', roomId: room.id, players: plist });
    }
    broadcastRoom(room, { type: 'chat', from: 'System', pid: 'system', text: `${player.name} reconnected!`, ts: Date.now() });
    return;
  }

  if (type === 'listRooms') {
    const list = [];
    rooms.forEach((r, id) => {
      if (r.state === 'waiting') list.push({ id, hostName: r.players[0]?.name || '?', playerCount: r.players.length });
    });
    send(ws, { type: 'roomList', rooms: list });
    return;
  }

  if (type === 'createRoom') {
    if (player.roomId) return;
    if (rooms.size >= MAX_ROOMS) { send(ws, { type: 'error', msg: 'Server is busy — try again shortly' }); return; }
    // Regenerate on the (rare) chance of colliding with a live room so we never
    // silently evict an in-progress game.
    let rid;
    do { rid = Math.random().toString(36).slice(2, 8).toUpperCase(); } while (rooms.has(rid));
    const room = { id: rid, players: [player], state: 'waiting', game: null, seatRotation: 0, basePlayerOrder: null };
    rooms.set(rid, room);
    player.roomId = rid;
    send(ws, { type: 'roomCreated', roomId: rid, players: [{ id: player.id, name: player.name }] });
    return;
  }

  if (type === 'joinRoom') {
    if (player.roomId) return;
    const room = rooms.get(msg.roomId);
    if (!room) { send(ws, { type: 'error', msg: 'Room not found' }); return; }
    if (room.state !== 'waiting') { send(ws, { type: 'error', msg: 'Game already started' }); return; }
    if (room.players.length >= 4) { send(ws, { type: 'error', msg: 'Room is full' }); return; }
    room.players.push(player);
    player.roomId = room.id;
    const plist = room.players.map(p => ({ id: p.id, name: p.name }));
    room.players.forEach(p => { if (p.ws) send(p.ws, { type: 'roomJoined', roomId: room.id, players: plist }); });
    if (room.players.length === 4) startGame(room, false);
    return;
  }

  if (type === 'startGame') {
    const room = rooms.get(player.roomId);
    if (!room || room.players[0].id !== player.id) return;
    if (room.state !== 'waiting') return;
    if (['easy','medium','hard'].includes(msg.botLevel)) room.botLevel = msg.botLevel;
    startGame(room, msg.withBots !== false);
    return;
  }

  // ─── Room actions that work with or without a running game ────────────────
  if (type === 'chat') {
    const room = rooms.get(player.roomId);
    if (!room) return;
    const text = (msg.text || '').trim().slice(0, 200);
    if (!text) return;
    broadcastRoom(room, { type: 'chat', from: player.name, pid: player.id, text, ts: Date.now() });
    return;
  }

  if (type === 'leaveRoom') {
    const room3 = rooms.get(player.roomId);
    if (room3) {
      room3.players = room3.players.filter(p => p.id !== player.id);
      if (room3.voice) room3.voice.delete(player.id);
      if (room3.players.length === 0 || room3.players.every(p => !p.ws)) rooms.delete(player.roomId);
      else { broadcastRoom(room3, { type: 'playerLeft', id: player.id, name: player.name, players: room3.players.map(p => ({ id: p.id, name: p.name })) }); broadcastVoiceRoster(room3); }
    }
    player.roomId = null;
    send(ws, { type: 'leftRoom' });
    return;
  }

  // ─── Live voice (WebRTC over WS) signaling — works in or out of a game ────
  if (type === 'voiceJoin') {
    const room = rooms.get(player.roomId);
    if (!room) return;
    (room.voice || (room.voice = new Set())).add(player.id);
    broadcastVoiceRoster(room);
    return;
  }
  if (type === 'voiceLeave') {
    const room = rooms.get(player.roomId);
    if (room && room.voice) { room.voice.delete(player.id); broadcastVoiceRoster(room); }
    return;
  }
  if (type === 'voiceSignal') {
    const room = rooms.get(player.roomId);
    if (!room) return;
    const target = room.players.find(p => p.id === msg.to);
    if (target && target.ws) send(target.ws, { type: 'voiceSignal', from: player.id, data: msg.data });
    return;
  }
  if (type === 'voiceTalk') {
    const room = rooms.get(player.roomId);
    if (!room) return;
    // Push-to-talk state → tell everyone else so they can show "X is talking"
    room.players.forEach(p => { if (p.ws && p.id !== player.id) send(p.ws, { type: 'voiceTalk', id: player.id, name: player.name, on: !!msg.on }); });
    return;
  }

  // ─── In-game actions ──────────────────────────────────────────────────────
  const room = rooms.get(player.roomId);
  if (!room?.game) return;
  const g = room.game;

  if (type === 'draw') { doDraw(room, player.id); return; }

  if (type === 'discard') { doDiscard(room, player.id, msg.tileId); return; }

  if (type === 'selfWin') {
    if (g.currentPlayer !== player.id || g.phase !== 'discard') return;
    if (!canWinNow(g, player.id, null, true, 'selfDraw')) return;
    applyWin(room, player.id, true);
    return;
  }

  if (type === 'hiddenKong') { doHiddenKong(room, player.id, msg.key); return; }

  if (type === 'addOnKong') { doAddOnKong(room, player.id, msg.key); return; }

  if (type === 'claim') {
    const isRobKong = g.phase === 'robKong';
    if (!g.awaitingClaims.has(player.id)) return;
    g.pendingClaims[player.id] = msg.action;
    if (msg.action === 'chow') g.claimChowVals[player.id] = msg.chowVals;
    g.awaitingClaims.delete(player.id);
    sendState(room);
    if (g.awaitingClaims.size === 0) {
      if (isRobKong) resolveRobKong(room);
      else resolveClaims(room);
    }
    return;
  }

  // Advance the dealer/round per scoreboard rules, then either re-deal
  // immediately ('nextRound') or return everyone to the waiting room ('newGame').
  if (type === 'nextRound' || type === 'newGame') {
    const room2 = rooms.get(player.roomId);
    if (!room2 || !room2.game) return;
    // Only the host (first human, who created the room) controls round flow.
    if (room2.players[0] && room2.players[0].id !== player.id) return;

    const oldWindIdx = Math.min(Math.floor((room2.seatRotation || 0) / 4), 3);
    // Non-dealer win rotates the deal; dealer win / draw keeps the dealer (莊).
    if (room2.game.winner && room2.game.winner !== 'draw') {
      const dealerPid = room2.game.players[0]; // East is always first in rotated order
      if (room2.game.winner !== dealerPid) room2.seatRotation = (room2.seatRotation || 0) + 1;
    }

    if (type === 'nextRound') {
      // A full match is the four winds × four dealers (seatRotation 0..15).
      // When that completes, show final standings instead of dealing again.
      if ((room2.seatRotation || 0) >= 16) {
        const standings = room2.players.map(p => ({
          id: p.id, name: p.name, isBot: !!(room2.game.isBot && room2.game.isBot[p.id]),
          score: (room2.matchScores && room2.matchScores[p.id]) || 0,
        })).sort((a, b) => b.score - a.score);
        broadcastRoom(room2, { type: 'matchOver', standings, hands: room2.handNo || 0 });
        return;
      }
      // Keep the SAME players (incl. bots with stable IDs) so the dealer truly
      // rotates among them; just re-deal the next hand.
      const newWindIdx = Math.min(Math.floor((room2.seatRotation || 0) / 4), 3);
      room2._windChanged = (newWindIdx !== oldWindIdx) ? WINDS[newWindIdx] : null;
      startGame(room2, true);
    } else {
      // Full reset back to the waiting room — drop bots and clear the match.
      room2.players = room2.players.filter(p => !p.id.startsWith('bot-'));
      if (room2.basePlayerOrder) room2.basePlayerOrder = room2.basePlayerOrder.filter(id => !id.startsWith('bot-'));
      room2.state = 'waiting';
      room2.game = null;
      room2.seatRotation = 0; room2.matchScores = {}; room2.handNo = 0;
      broadcastRoom(room2, { type: 'gameReset', players: room2.players.map(p => ({ id: p.id, name: p.name })), seatRotation: 0 });
    }
    return;
  }

  // Start a fresh match (reset scores + rotation) and deal hand 1 right away.
  if (type === 'newMatch') {
    const room2 = rooms.get(player.roomId);
    if (!room2 || !room2.game) return;
    if (room2.players[0] && room2.players[0].id !== player.id) return;
    room2.seatRotation = 0; room2.matchScores = {}; room2.handNo = 0; room2._windChanged = null;
    startGame(room2, true);
    return;
  }

}

// Exported for tests
export { computeFan, MIN_FAN };

// ─── Transport entry points (shared by Node server and Cloudflare Worker) ────
export function attachPlayer(ws) {
  const pid = crypto.randomUUID();
  const player = { id: pid, ws, name: 'Player', roomId: null };
  wsToPlayer.set(ws, player);
  send(ws, { type: 'welcome', playerId: pid });
  return player;
}

export function handleRaw(ws, raw) {
  try { handleMsg(ws, wsToPlayer.get(ws), JSON.parse(raw)); }
  catch (e) { console.error('msg error', e.message); }
}

export function handleClose(ws) {
  const player = wsToPlayer.get(ws);
  if (player?.roomId) {
    const room = rooms.get(player.roomId);
    if (room) {
      const entry = room.players.find(p => p.id === player.id);
      if (room.voice && room.voice.delete(player.id)) broadcastVoiceRoster(room);
      if (room.game && room.game.players.includes(player.id)) {
        // Mid-game: keep the seat so the player can resume after refresh/drop
        if (entry && entry.ws === ws) {
          entry.ws = null;
          broadcastRoom(room, { type: 'chat', from: 'System', pid: 'system', text: `${player.name} disconnected — seat saved, they can rejoin.`, ts: Date.now() });
        }
        // If no human remains connected, clean the room up after a grace period
        if (room.players.every(p => !p.ws)) {
          clearTimeout(room._cleanup);
          room._cleanup = setTimeout(() => {
            if (room.players.every(p => !p.ws)) rooms.delete(room.id);
          }, 10 * 60 * 1000);
        }
      } else if (!entry || entry.ws === ws) {
        room.players = room.players.filter(p => p.id !== player.id);
        if (room.players.length === 0 || room.players.every(p => !p.ws)) {
          rooms.delete(player.roomId);
        } else {
          broadcastRoom(room, { type: 'playerLeft', id: player.id, name: player.name, players: room.players.map(p => ({ id: p.id, name: p.name })) });
        }
      }
    }
  }
  wsToPlayer.delete(ws);
}
