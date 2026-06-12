const BASE = process.env.BASE_URL || 'http://localhost:3000';
import { chromium } from 'playwright';

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });

// 1. Tile identity sheet — verify the suit/value → file mapping visually
const names = [];
for (let i = 1; i <= 4; i++) names.push('f' + i);
for (let i = 1; i <= 3; i++) names.push('d' + i);
for (let i = 1; i <= 8; i++) names.push('h' + i);
for (let i = 1; i <= 9; i++) names.push('w' + i);
for (let i = 1; i <= 9; i++) names.push('s' + i);
for (let i = 1; i <= 9; i++) names.push('t' + i);
const cells = names.map(n =>
  `<div style="text-align:center;font:12px monospace"><img src="${BASE}/assets/tiles/${n}.svg" width="60"><br>${n}</div>`
).join('');
await page.setContent(`<body style="background:#333;color:#fff"><div style="display:grid;grid-template-columns:repeat(9,1fr);gap:6px;padding:10px">${cells}</div></body>`);
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/tiles_sheet.png', fullPage: true });

// 2. Real game flow
await page.goto(BASE);
await page.fill('#nameIn', 'Tester');
await page.click('text=Continue →');
await page.waitForSelector('#lobbyScreen.active');
await page.click('text=🏠 Create New Room');
await page.waitForSelector('#waitingScreen.active');
await page.click('#startBtn');
await page.waitForTimeout(4000); // let preload finish + a few bot turns
await page.screenshot({ path: '/tmp/game_desktop.png' });

// 3. Mobile portrait layout
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(BASE);
await m.fill('#nameIn', 'Mobile');
await m.click('text=Continue →');
await m.waitForSelector('#lobbyScreen.active');
await m.click('text=🏠 Create New Room');
await m.waitForSelector('#waitingScreen.active');
await m.click('#startBtn');
await m.waitForTimeout(4000);
await m.screenshot({ path: '/tmp/game_mobile.png' });

const errors = [];
page.on('pageerror', e => errors.push(e.message));
console.log('done', errors);
await b.close();
