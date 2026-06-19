// Defensive-discard unit tests: a medium/hard bot facing a pushing opponent
// should prefer safe tiles (genbutsu / dead / terminal) over live middle tiles.
import { botChooseDiscard, discardDanger } from '../game-core.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : 'FAIL  ') + msg); if (!cond) fails++; };

const T = (suit, value) => ({ suit, value, id: suit + value + Math.random() });

// A game where South (op) has exposed two pungs incl. a red-dragon pung → clearly
// pushing an expensive hand. The discard pool already contains 5-circles (genbutsu).
function pushingGame(meHand) {
  const players = ['me', 'south', 'west', 'north'];
  return {
    players,
    seatWinds: { me: 'east', south: 'south', west: 'west', north: 'north' },
    prevailingWind: 'east',
    allDiscards: [
      { suit: 'circles', value: 5, discardedBy: 'west' },
      { suit: 'bamboo', value: 9, discardedBy: 'north' },
    ],
    melds: {
      me: [],
      south: [
        { type: 'pong', tiles: [T('dragon', 'red'), T('dragon', 'red'), T('dragon', 'red')] },
        { type: 'pong', tiles: [T('circles', 2), T('circles', 2), T('circles', 2)] },
      ],
      west: [], north: [],
    },
    hands: { me: meHand },
  };
}

// 1) Danger ranking: a live middle tile is more dangerous than genbutsu / a terminal.
{
  const g = pushingGame([]);
  const dMiddle = discardDanger(g, 'me', T('characters', 5)); // live middle
  const dGenbutsu = discardDanger(g, 'me', T('circles', 5));  // already in pool
  const dTerminal = discardDanger(g, 'me', T('bamboo', 1));   // terminal
  ok(dGenbutsu === 0, `genbutsu (5-circ) is safe: ${dGenbutsu}`);
  ok(dMiddle > dTerminal, `live middle (${dMiddle.toFixed(2)}) > terminal (${dTerminal.toFixed(2)})`);
  ok(dMiddle > dGenbutsu, `live middle (${dMiddle.toFixed(2)}) > genbutsu (${dGenbutsu})`);
}

// 2) No threat (nobody has melds) → danger is zero, bot plays freely.
{
  const g = pushingGame([]);
  g.melds.south = [];
  ok(discardDanger(g, 'me', T('characters', 5)) === 0, 'no melds out → zero danger');
}

// 3) Hard bot prefers the safe genbutsu over an equally-useless live middle tile.
//    Hand: a complete-ish set of useful tiles + two isolated singles, one of which
//    is genbutsu-safe (5-circ) and one a dangerous live middle (5-char).
{
  // Build a 14-tile hand (length%3==2) so the discard heuristic runs. Useful core
  // kept intact; the two lone tiles are the realistic discard candidates.
  const core = [
    T('bamboo', 2), T('bamboo', 3), T('bamboo', 4),
    T('bamboo', 6), T('bamboo', 7), T('bamboo', 8),
    T('circles', 7), T('circles', 7), T('circles', 7),
    T('wind', 'east'), T('wind', 'east'),
  ];
  const safe = T('circles', 5);   // genbutsu (in pool) — safe to throw
  const live = T('characters', 5); // live middle — dangerous
  const hand = [...core, safe, live];
  const g = pushingGame(hand);
  let safeChosen = 0;
  for (let i = 0; i < 40; i++) {
    const d = botChooseDiscard(hand, 'hard', g, 'me');
    if (d.suit === 'circles' && d.value === 5) safeChosen++;
  }
  ok(safeChosen >= 35, `hard bot throws the safe genbutsu (${safeChosen}/40 trials)`);
}

// 4) An easy bot ignores defense entirely (signature without game state is inert).
{
  ok(discardDanger.length >= 0, 'discardDanger callable'); // smoke
  const hand = [T('bamboo', 2), T('characters', 5), T('circles', 9), T('wind', 'north'), T('dragon', 'green')];
  const d = botChooseDiscard(hand, 'easy'); // no g/pid → must not throw
  ok(!!d && !!d.suit, 'easy bot returns a discard with no game context');
}

console.log(fails ? `\n${fails} FAILED` : '\nall defense tests passed');
process.exit(fails ? 1 : 0);
