import { chromium } from 'playwright';
const b = await chromium.launch();

// Host (desktop)
const host = await b.newPage({ viewport: { width: 1280, height: 800 } });
const hostErrs = [];
host.on('pageerror', e => hostErrs.push('HOST: ' + e.message));
await host.goto('http://localhost:3000');
await host.fill('#nameIn', 'Host');
await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active');
await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active');
const code = await host.textContent('#roomCodeDisp');
console.log('room code:', code);

// Mobile joiner
const mob = await b.newPage({ viewport: { width: 390, height: 844 } });
const mobErrs = [];
mob.on('pageerror', e => mobErrs.push('MOBILE: ' + e.message));
mob.on('console', m => { if (m.type() === 'error') mobErrs.push('MOBILE console: ' + m.text()); });
await mob.goto('http://localhost:3000');
await mob.fill('#nameIn', 'PhoneGuy');
await mob.click('text=Continue →');
await mob.waitForSelector('#lobbyScreen.active');
await mob.fill('#codeIn', code.trim());
await mob.click('#codeIn ~ button');
await mob.waitForTimeout(1500);
await mob.screenshot({ path: '/tmp/j_mob_wait.png' });

// Host starts the game
await host.click('#startBtn');
await host.waitForTimeout(4500);
await mob.screenshot({ path: '/tmp/j_mob_game.png' });
await host.screenshot({ path: '/tmp/j_host_game.png' });
console.log('errors:', JSON.stringify([...hostErrs, ...mobErrs], null, 1));
await b.close();
