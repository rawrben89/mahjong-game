import { computeFan, MIN_FAN } from './game-core.js';
const T=(s,v)=>({suit:s,value:v});
const seq=(s,a)=>[T(s,a),T(s,a+1),T(s,a+2)];
const tri=(s,v)=>[T(s,v),T(s,v),T(s,v)];
let fails=0;
function check(name, got, want) {
  const ok = got===want;
  if(!ok) fails++;
  console.log((ok?'✓':'✗ FAIL'), name, '→', got, ok?'':'(want '+want+')');
}

// 1. Pure suit + all chows, self-draw: 7 + 1 + 1 = 9
let r=computeFan([...seq('bamboo',1),...seq('bamboo',4),...seq('bamboo',7),...seq('bamboo',1),T('bamboo',5),T('bamboo',5)],[],[],'east','east',{selfDraw:true,winType:'selfDraw'});
check('Pure suit + peace + zimo', r.fan, 9);

// 2. Mixed one suit, win by discard concealed: 3 + 1(gate) = 4 (+dragon pung +1 = 5)
r=computeFan([...seq('characters',1),...seq('characters',4),...seq('characters',7),...tri('dragon','red'),T('wind','east'),T('wind','east')],[],[],'south','east',{selfDraw:false,winType:'claim'});
check('Mixed suit + red dragon + concealed gate', r.fan, 5);

// 3. Seven pairs distinct, self-draw: 4 + 1 = 5
r=computeFan([T('bamboo',1),T('bamboo',1),T('bamboo',3),T('bamboo',3),T('characters',5),T('characters',5),T('characters',7),T('characters',7),T('circles',2),T('circles',2),T('circles',4),T('circles',4),T('wind','east'),T('wind','east')],[],[],'south','east',{selfDraw:true,winType:'selfDraw'});
check('Seven pairs + zimo', r.fan, 5);

// 4. Big three dragons: 8, no individual dragon pungs; + mixed(3)? hand: 3 dragon tris + chars seq + pair chars => mixed 3 + b3d 8 + allpungs? no (chow present). discard, open melds → no gate.
r=computeFan([...seq('characters',1),T('characters',9),T('characters',9)],[ {type:'pong',tiles:tri('dragon','red')},{type:'pong',tiles:tri('dragon','green')},{type:'pong',tiles:tri('dragon','white')} ],[],'south','east',{selfDraw:false,winType:'claim'});
check('Big three dragons + mixed', r.fan, 11);

// 5. All pungs open, one suit pure: 3 + 7 = 10; +kong fan if kong
r=computeFan([...tri('circles',2),T('circles',9),T('circles',9)],[ {type:'pong',tiles:tri('circles',3)},{type:'pong',tiles:tri('circles',5)},{type:'kong',tiles:[...tri('circles',7),T('circles',7)]} ],[],'south','east',{selfDraw:false,winType:'claim'});
check('Pure + all pungs + 1 kong', r.fan, 11);

// 6. Thirteen orphans selfdraw: 13+1=14, no honor pung bonuses
const orphans=[T('bamboo',1),T('bamboo',9),T('characters',1),T('characters',9),T('circles',1),T('circles',9),T('wind','east'),T('wind','south'),T('wind','west'),T('wind','north'),T('dragon','red'),T('dragon','green'),T('dragon','white'),T('bamboo',1)];
r=computeFan(orphans,[],[],'east','east',{selfDraw:true,winType:'selfDraw'});
check('Thirteen orphans + zimo', r.fan, 14);

// 7. Chicken-ish hand (mixed chows 2 suits, discard, open chow): gate? open → 0... fan 0 < MIN_FAN
r=computeFan([...seq('bamboo',1),...seq('characters',4),T('circles',2),T('circles',2)],[ {type:'chow',tiles:seq('circles',4)},{type:'chow',tiles:seq('bamboo',5)} ],[],'south','east',{selfDraw:false,winType:'claim'});
check('Chicken hand (peace only? open chows, multi-suit)', r.fan, 1); // all chows = peace 1

// 8. Bonus tiles + kong + zimo: base peace(1)+bonus(2)+zimo(1)=... hand all chows 1 suit? use mixed suits: peace 1 + bonus 2 + zimo 1 = 4
r=computeFan([...seq('bamboo',1),...seq('characters',4),...seq('circles',4),...seq('bamboo',5),T('circles',2),T('circles',2)],[],[T('flower',1),T('season',2)],'south','east',{selfDraw:true,winType:'selfDraw'});
check('Peace + 2 bonus + zimo', r.fan, 4);

// 9. Heavenly hand: +13
r=computeFan([...seq('bamboo',1),...seq('characters',4),...seq('circles',4),...seq('bamboo',5),T('circles',2),T('circles',2)],[],[],'east','east',{selfDraw:true,winType:'selfDraw',heavenly:true});
check('Heavenly + peace + zimo', r.fan, 15);

// 10. Kong supplement win: afterKong chain1: +2; chain2: +9
r=computeFan([...seq('bamboo',1),...seq('characters',4),T('circles',2),T('circles',2)],[ {type:'kong',tiles:[...tri('circles',7),T('circles',7)]},{type:'chow',tiles:seq('bamboo',5)} ],[],'south','east',{selfDraw:true,winType:'selfDraw',afterKong:true,kongChain:1});
check('Win by kong (+2 +1 kong +1 zimo)', r.fan, 4);

console.log(fails===0 ? 'ALL PASS' : fails+' FAILURES');
process.exit(fails?1:0);
