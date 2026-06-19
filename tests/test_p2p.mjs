import { chromium } from 'playwright';
const b = await chromium.launch();

// HOST
const hc = await b.newContext(); const host = await hc.newPage();
const hErr=[]; host.on('pageerror',e=>hErr.push('HOST '+e.message)); host.on('console',m=>{if(m.type()==='error')hErr.push('HOST console '+m.text());});
await host.goto('http://localhost:8899/?local=1');
await host.waitForTimeout(700);
await host.fill('#nameIn','Hosty'); await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active',{timeout:5000});
await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active',{timeout:8000});
await host.waitForTimeout(1500); // peerjs broker open
const code = (await host.textContent('#roomCodeDisp')).trim();
console.log('HOST share code:', code);

// PEER joins
const pc = await b.newContext(); const peer = await pc.newPage();
const pErr=[]; peer.on('pageerror',e=>pErr.push('PEER '+e.message)); peer.on('console',m=>{if(m.type()==='error')pErr.push('PEER console '+m.text());});
await peer.goto('http://localhost:8899/?local=1');
await peer.waitForTimeout(700);
await peer.fill('#nameIn','Peery'); await peer.click('text=Continue →');
await peer.waitForSelector('#lobbyScreen.active',{timeout:5000});
await peer.fill('#codeIn', code);
await peer.click('#codeIn ~ button');
console.log('PEER attempting join with code', code);
await peer.waitForTimeout(5000);
const peerOnWaiting = await peer.evaluate(()=>document.getElementById('waitingScreen').classList.contains('active'));
console.log('PEER reached waiting room:', peerOnWaiting);
const hostPlayerCount = await host.textContent('#pcountDisp').catch(()=>'?');
console.log('HOST sees player count:', hostPlayerCount);

// Host starts the game
await host.click('#startBtn');
await host.waitForTimeout(4000);
const hostInGame = await host.evaluate(()=>document.getElementById('gameScreen').classList.contains('active'));
const peerInGame = await peer.evaluate(()=>document.getElementById('gameScreen').classList.contains('active'));
const peerHand = await peer.evaluate(()=>G?.myHand?.length||0);
console.log('HOST in game:', hostInGame, '| PEER in game:', peerInGame, '| PEER hand:', peerHand);
await host.screenshot({path:'/tmp/p2p_host.png'});
await peer.screenshot({path:'/tmp/p2p_peer.png'});
console.log('HOST errors:', hErr.slice(0,5));
console.log('PEER errors:', pErr.slice(0,5));
await b.close();
