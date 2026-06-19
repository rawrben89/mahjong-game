// Regression: a human joining an in-progress room takes over a BOT's seat (with
// its hand) instead of being stuck as a tile-less spectator. Repro of the
// "4 players, one of them doesn't see their tiles" bug — host started with a bot
// before the last person joined (or a reconnect fell back to joinRoom).
import { attachPlayer, handleRaw, handleClose } from '../game-core.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok ', m); } else { fail++; console.log('  FAIL', m); } };

// Minimal fake socket that records the messages the server sends it.
function mkSock() {
  const sock = { readyState: 1, sent: [], send(s) { this.sent.push(JSON.parse(s)); } };
  const player = attachPlayer(sock);            // server mints id + resumeToken, sends welcome
  sock.player = player;
  sock.last = type => [...sock.sent].reverse().find(m => m.type === type);
  sock.tx = msg => handleRaw(sock, JSON.stringify(msg));
  return sock;
}

// 1 host + 2 joiners start a game WITH a bot filling the 4th seat.
const host = mkSock(); host.tx({ type: 'setName', name: 'Host' }); host.tx({ type: 'createRoom' });
const roomId = host.last('roomCreated').roomId;

const p2 = mkSock(); p2.tx({ type: 'setName', name: 'Bea' });  p2.tx({ type: 'joinRoom', roomId });
const p3 = mkSock(); p3.tx({ type: 'setName', name: 'Cy' });   p3.tx({ type: 'joinRoom', roomId });

host.tx({ type: 'startGame', withBots: true, botLevel: 'easy' }); // 3 humans + 1 bot

const hostState = host.last('gameState');
ok(hostState.players.length === 4, '4 seats after start (3 humans + 1 bot)');
ok(hostState.players.filter(p => p.isBot).length === 1, 'exactly one bot seat before takeover');

// The 4th human arrives mid-game (the old behaviour: stuck spectating, empty hand).
const p4 = mkSock(); p4.tx({ type: 'setName', name: 'Dee' }); p4.tx({ type: 'joinRoom', roomId });

const s4 = p4.last('gameState');
ok(!!s4, 'late joiner receives a gameState');
ok(s4.spectator === false, 'late joiner is NOT a spectator');
ok((s4.myHand || []).length >= 13, `late joiner SEES their tiles (${(s4.myHand || []).length})`);
ok(s4.myId === p4.player.id, 'seat uses the human\'s own (non-bot) id');
ok(!s4.myId.startsWith('bot-'), 'no leftover bot- id on the human');
ok(s4.players.length === 4 && s4.players.every(p => !p.isBot), 'no bot seats remain — all 4 are humans');

// The hand the human inherited is exactly what the bot was holding (a real hand).
const inherited = (s4.myHand || []).map(t => t.suit + ':' + t.value).sort();
ok(new Set(inherited).size >= 1 && inherited.length >= 13, 'inherited a full dealt hand');

// Host's view also shows the bot replaced by Dee.
const hostNow = host.last('gameState');
ok(hostNow.players.some(p => p.name === 'Dee' && !p.isBot), 'others see "Dee" took the seat');
ok(hostNow.players.every(p => !p.isBot), 'host sees zero bots now');

// The reclaimed seat is resumable by its new owner (token preserved on takeover).
const token = p4.player.resumeToken;
const p4b = mkSock(); p4b.tx({ type: 'resume', playerId: p4.player.id, roomId, resumeToken: token });
ok(!!p4b.last('gameState') && !p4b.last('gameState').spectator, 'taken-over seat is resumable with its token');
ok(!p4b.last('resumeFailed'), 'resume with the correct token does not fail');

console.log(fail ? `\n${fail} FAILED` : '\nall takeover tests passed');
process.exit(fail ? 1 : 0); // pending bot/AFK timers would otherwise keep the loop alive
