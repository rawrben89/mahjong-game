import { chromium } from 'playwright';
// Two P2P peers enable voice; the peer talks, host should show the "who's talking" pill.
const flags = ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'];
const b = await chromium.launch({ args: flags });
const hc = await b.newContext({ permissions:['microphone'] }); const host = await hc.newPage();
const pc = await b.newContext({ permissions:['microphone'] }); const peer = await pc.newPage();
const hErr=[]; host.on('pageerror',e=>hErr.push(e.message));
const pErr=[]; peer.on('pageerror',e=>pErr.push(e.message));

await host.goto('http://localhost:3000/?local=1'); await host.waitForTimeout(900); await host.evaluate(()=>{try{closeTutorial()}catch{}});
await host.fill('#nameIn','Hosty'); await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active'); await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active'); await host.waitForTimeout(1500);
const code=(await host.textContent('#roomCodeDisp')).trim();

await peer.goto('http://localhost:3000/?local=1'); await peer.waitForTimeout(900); await peer.evaluate(()=>{try{closeTutorial()}catch{}});
await peer.fill('#nameIn','Peery'); await peer.click('text=Continue →');
await peer.waitForSelector('#lobbyScreen.active');
await peer.evaluate(c=>joinOnline(c), code); // call engine directly (Join text is ambiguous)
await peer.waitForTimeout(4000);
await host.click('#startBtn'); await host.waitForTimeout(3000);

// Both should now see the voice button in-game
const hBtn = await host.evaluate(()=>document.getElementById('voiceBtn').style.display);
const pBtn = await peer.evaluate(()=>document.getElementById('voiceBtn').style.display);
console.log('voice btn visible — host:', hBtn, 'peer:', pBtn);

// Enable voice on both (tap once = enable)
await host.evaluate(()=>enableVoice()); await peer.evaluate(()=>enableVoice());
await host.waitForTimeout(2500); // let the mesh connect

// Peer holds-to-talk → fake mic emits a tone → host should detect speaking
await peer.evaluate(()=>voiceTalkStart());
await host.waitForTimeout(1200);
const pillHost = await host.evaluate(()=>{ const e=document.getElementById('voiceSpeaking'); return {disp:e.style.display, txt:e.textContent}; });
console.log('host sees talking pill while peer talks:', pillHost);

await peer.evaluate(()=>voiceTalkEnd());
await host.waitForTimeout(800);
const pillAfter = await host.evaluate(()=>document.getElementById('voiceSpeaking').style.display);
console.log('host pill hidden after peer stops:', pillAfter==='none');

// Self glow appears while host talks
await host.evaluate(()=>voiceTalkStart());
await host.waitForTimeout(800);
const glow = await host.evaluate(()=>document.getElementById('voiceBtn').style.boxShadow);
console.log('host self glow while talking (non-empty):', !!glow, glow.slice(0,40));
await host.evaluate(()=>voiceTalkEnd());

console.log('errors host:', hErr.slice(0,3), 'peer:', pErr.slice(0,3));
await b.close();
