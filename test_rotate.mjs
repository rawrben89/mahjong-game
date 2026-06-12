import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:3000');
await page.fill('#nameIn', 'Tester');
await page.click('text=Continue →');
await page.waitForSelector('#lobbyScreen.active');
await page.screenshot({ path: '/tmp/p_lobby.png' });
await page.click('text=Create New Room');
await page.waitForSelector('#waitingScreen.active');
await page.click('#startBtn');
await page.waitForTimeout(3000);
// Play several turns: double-click a hand tile to discard, pass on claims
for (let i = 0; i < 7; i++) {
  const pass = await page.$('#actionOverlay .abtn.pass');
  if (pass) { await pass.click().catch(()=>{}); await page.waitForTimeout(600); }
  await page.mouse.click(640, 692); await page.waitForTimeout(300);
  await page.mouse.click(640, 692);
  await page.waitForTimeout(3600);
}
await page.screenshot({ path: '/tmp/p_game.png' });
// Deterministic banner render check
await page.evaluate(() => window.phaserScene.showCallBanner('PONG!', 'Bot 2 — Pong', '#c573ff'));
await page.waitForTimeout(350);
await page.screenshot({ path: '/tmp/p_banner.png' });
await b.close();
console.log('done');
