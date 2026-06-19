// Per-room leaderboard tally: accumulates across hands/matches, keyed by name,
// excludes bots and spectators, ranks by points then wins.
import { recordHandResult, leaderboardArray } from '../game-core.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : 'FAIL  ') + msg); if (!cond) fails++; };

// A minimal room with one bot, one spectator, two humans. broadcastRoom needs
// p.ws absent (no sends) — recordHandResult only reads players/game.
function room() {
  return {
    leaderboard: {},
    players: [
      { id: 'h1', name: 'Alice' },
      { id: 'h2', name: 'Ben' },
      { id: 'bot-1', name: 'Bot 1' },
      { id: 'h3', name: 'Cara', spectator: true },
    ],
    game: { isBot: { 'bot-1': true }, handScores: {} },
  };
}

// Hand 1: Alice self-draws (everyone pays). handScores are this hand's deltas.
{
  const r = room();
  r.game.handScores = { h1: 9, h2: -3, 'bot-1': -3, h3: 0 };
  recordHandResult(r, 'h1', 6); // Alice wins, 6 fan

  const board = leaderboardArray(r);
  ok(board.length === 2, `bots+spectators excluded → 2 entries (got ${board.length})`);
  const alice = board.find(e => e.name === 'Alice');
  const ben = board.find(e => e.name === 'Ben');
  ok(alice.pts === 9 && alice.wins === 1 && alice.hands === 1 && alice.bestFan === 6,
    `Alice: pts9/wins1/hands1/fan6 → ${JSON.stringify(alice)}`);
  ok(ben.pts === -3 && ben.wins === 0 && ben.hands === 1, `Ben: pts-3/wins0/hands1 → ${JSON.stringify(ben)}`);
  ok(board[0].name === 'Alice', 'ranked by points: Alice first');

  // Hand 2: a draw — hands increments for humans, no win/points change.
  r.game.handScores = { h1: 0, h2: 0, 'bot-1': 0, h3: 0 };
  recordHandResult(r, null, 0);
  const a2 = leaderboardArray(r).find(e => e.name === 'Alice');
  ok(a2.hands === 2 && a2.wins === 1, `draw bumps hands only → hands2/wins1 (${JSON.stringify(a2)})`);

  // Hand 3: Ben wins big (12 fan) and overtakes on points.
  r.game.handScores = { h1: -12, h2: 24, 'bot-1': -12, h3: 0 };
  recordHandResult(r, 'h2', 12);
  const board3 = leaderboardArray(r);
  ok(board3[0].name === 'Ben', 'Ben overtakes after a big win');
  ok(board3.find(e => e.name === 'Ben').bestFan === 12, 'Ben bestFan tracks the 12-fan hand');
  ok(board3.find(e => e.name === 'Alice').pts === -3, 'Alice cumulative pts 9-12=-3');
}

// A returning player (new id, same name) continues the same leaderboard line.
{
  const r = room();
  r.game.handScores = { h1: 6, h2: -2, 'bot-1': -2, h3: 0 };
  recordHandResult(r, 'h1', 4);
  // Alice rejoins as a different seat id but same display name.
  r.players[0] = { id: 'h1-new', name: 'Alice' };
  r.game.isBot = {};
  r.game.handScores = { 'h1-new': 5, h2: -2, 'bot-1': -2, h3: 0 };
  recordHandResult(r, 'h1-new', 3);
  const alice = leaderboardArray(r).find(e => e.name === 'Alice');
  ok(alice.hands === 2 && alice.pts === 11 && alice.wins === 2, `name-keyed continuity → ${JSON.stringify(alice)}`);
}

console.log(fails ? `\n${fails} FAILED` : '\nall leaderboard tests passed');
process.exit(fails ? 1 : 0);
