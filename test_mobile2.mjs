import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs=[];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:3000');
await page.fill('#nameIn', 'Mobile');
await page.click('text=Continue →');
await page.waitForSelector('#lobbyScreen.active');
await page.click('text=Create New Room');
await page.waitForSelector('#waitingScreen.active');
await page.click('#startBtn');
await page.waitForTimeout(3000);
// Discard via direct call to avoid coordinate guessing: pick first hand tile
for (let i = 0; i < 6; i++) {
  const pass = await page.$('#actionOverlay .abtn.pass');
  if (pass) { await pass.click().catch(()=>{}); await page.waitForTimeout(600); }
  await page.evaluate(() => { if (G && (G.myActions||[]).includes('discard') && G.myHand?.length) { const id=G.myHand[Math.floor(Math.random()*G.myHand.length)].id; tileClick(id); tileClick(id); } });
  await page.waitForTimeout(3600);
}
await page.screenshot({ path: '/tmp/m_final.png' });
console.log('errors:', errs);
await b.close();
