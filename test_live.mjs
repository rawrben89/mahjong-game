import { chromium } from 'playwright';
const URL = 'https://rawrben89.github.io/mahjong-game/';
const b = await chromium.launch();

// SOLO boot test
const s = await b.newPage();
const sErr=[]; s.on('pageerror',e=>sErr.push(e.message)); s.on('console',m=>{if(m.type()==='error')sErr.push('c:'+m.text());});
await s.goto(URL); await s.waitForTimeout(2500); // load phaser+peerjs+engine
await s.fill('#nameIn','Solo'); await s.click('text=Continue →');
await s.waitForSelector('#lobbyScreen.active',{timeout:8000});
await s.click('text=Create New Room');
await s.waitForSelector('#waitingScreen.active',{timeout:10000});
await s.waitForTimeout(1500);
const soloCode = (await s.textContent('#roomCodeDisp')).trim();
await s.click('#startBtn'); await s.waitForTimeout(3500);
const soloInGame = await s.evaluate(()=>document.getElementById('gameScreen').classList.contains('active'));
const soloHand = await s.evaluate(()=>G?.myHand?.length||0);
console.log('SOLO: code='+soloCode+' inGame='+soloInGame+' hand='+soloHand);

// ONLINE: host + peer
const hc=await b.newContext(); const host=await hc.newPage();
const hErr=[]; host.on('pageerror',e=>hErr.push(e.message));
await host.goto(URL); await host.waitForTimeout(2500);
await host.fill('#nameIn','Hosty'); await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active',{timeout:8000});
await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active',{timeout:10000});
await host.waitForTimeout(2000);
const code=(await host.textContent('#roomCodeDisp')).trim();
console.log('HOST online code:', code);

const pc=await b.newContext(); const peer=await pc.newPage();
const pErr=[]; peer.on('pageerror',e=>pErr.push(e.message));
await peer.goto(URL); await peer.waitForTimeout(2500);
await peer.fill('#nameIn','Peery'); await peer.click('text=Continue →');
await peer.waitForSelector('#lobbyScreen.active',{timeout:8000});
await peer.fill('#codeIn', code); await peer.click('#codeIn ~ button');
await peer.waitForTimeout(6000);
const peerJoined = await peer.evaluate(()=>document.getElementById('waitingScreen').classList.contains('active'));
const hostCount = await host.textContent('#pcountDisp').catch(()=>'?');
console.log('PEER joined waiting:', peerJoined, '| HOST player count:', hostCount);
await host.click('#startBtn'); await host.waitForTimeout(4000);
const bothIn = await peer.evaluate(()=>document.getElementById('gameScreen').classList.contains('active')) && await host.evaluate(()=>document.getElementById('gameScreen').classList.contains('active'));
const peerHand = await peer.evaluate(()=>G?.myHand?.length||0);
console.log('ONLINE both in game:', bothIn, '| peer hand:', peerHand);
console.log('errors solo:',sErr.slice(0,3),'host:',hErr.slice(0,3),'peer:',pErr.slice(0,3));
await b.close();
