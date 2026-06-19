import { chromium } from 'playwright';
const b = await chromium.launch();
const errs=[];

// Mobile flow
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
m.on('pageerror', e => errs.push('M: '+e.message));
await m.goto('http://localhost:3000');
await m.screenshot({ path: '/tmp/q_name.png' });
await m.fill('#nameIn', 'Polish');
await m.click('text=Continue →');
await m.waitForSelector('#lobbyScreen.active');
await m.click('text=Create New Room');
await m.waitForSelector('#waitingScreen.active');
await m.screenshot({ path: '/tmp/q_wait.png' });
await m.click('#startBtn');
await m.waitForTimeout(3200);
// select a tile to see hint
await m.evaluate(() => { if (G&&(G.myActions||[]).includes('discard')&&G.myHand?.length) tileClick(G.myHand[4].id); });
await m.waitForTimeout(400);
await m.screenshot({ path: '/tmp/q_mobile_game.png' });
// mock win screen with confetti
await m.evaluate(() => {
  G = G || {};
  const g = { winner:'me', players:[{id:'me',name:'Polish'}], scores:{me:24}, winType:'selfDraw',
    winnerHand:[{suit:'bamboo',value:1},{suit:'bamboo',value:2},{suit:'bamboo',value:3},{suit:'circles',value:5},{suit:'circles',value:5}],
    winnerMelds:[{type:'pong',tiles:[{suit:'dragon',value:'red'},{suit:'dragon',value:'red'},{suit:'dragon',value:'red'}]}],
    winScore:{fan:5,total:20,breakdown:[{name:'混一色 Mixed One Suit',fan:3},{name:'中 Red Dragon Pung',fan:1},{name:'自摸 Self Draw',fan:1}]} };
  myId='me'; showWin(g);
});
await m.waitForTimeout(900);
await m.screenshot({ path: '/tmp/q_win.png' });
console.log('errors:', errs);
await b.close();
