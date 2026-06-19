import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs=[];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:3000');
await page.fill('#nameIn', 'Resumer');
await page.click('text=Continue →');
await page.waitForSelector('#lobbyScreen.active');
await page.click('text=Create New Room');
await page.waitForSelector('#waitingScreen.active');
await page.click('#startBtn');
await page.waitForTimeout(3500);
const before = await page.evaluate(() => ({ myId, hand: (G?.myHand||[]).map(t=>t.suit+':'+t.value).sort() }));
console.log('before reload: id', before.myId.slice(0,8), 'hand size', before.hand.length);

// Simulate refresh mid-game
await page.reload();
await page.waitForTimeout(3000);
const after = await page.evaluate(() => ({
  myId, gameVisible: document.getElementById('gameScreen').classList.contains('active'),
  hand: (G?.myHand||[]).map(t=>t.suit+':'+t.value).sort(),
}));
console.log('after reload: id', after.myId.slice(0,8), 'game screen:', after.gameVisible, 'hand size', after.hand.length);
console.log('same identity:', before.myId===after.myId, '| same hand:', JSON.stringify(before.hand)===JSON.stringify(after.hand));
await page.screenshot({ path: '/tmp/p_resume.png' });
console.log('errors:', errs);
await b.close();
