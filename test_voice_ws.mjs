import { chromium } from 'playwright';
// WS/Workers-mode voice: two real humans over the WebSocket server (no ?local=1).
// The peer talks; the host should build the WebRTC mesh and show "who's talking".
const flags = ['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'];
const b = await chromium.launch({ args: flags });
const hc = await b.newContext({ permissions:['microphone'] }); const host = await hc.newPage();
const pc = await b.newContext({ permissions:['microphone'] }); const peer = await pc.newPage();
const hErr=[]; host.on('pageerror',e=>hErr.push(e.message));
const pErr=[]; peer.on('pageerror',e=>pErr.push(e.message));

await host.goto('http://localhost:3000/'); await host.waitForTimeout(900); await host.evaluate(()=>{try{closeTutorial()}catch{}});
await host.fill('#nameIn','Hosty'); await host.click('text=Continue →');
await host.waitForSelector('#lobbyScreen.active'); await host.click('text=Create New Room');
await host.waitForSelector('#waitingScreen.active'); await host.waitForTimeout(800);
const code=(await host.textContent('#roomCodeDisp')).trim();

await peer.goto('http://localhost:3000/'); await peer.waitForTimeout(900); await peer.evaluate(()=>{try{closeTutorial()}catch{}});
await peer.fill('#nameIn','Peery'); await peer.click('text=Continue →');
await peer.waitForSelector('#lobbyScreen.active');
await peer.evaluate(c=>joinById(c), code);
await peer.waitForTimeout(1500);
await host.click('#startBtn'); await host.waitForTimeout(2500);

const hBtn = await host.evaluate(()=>document.getElementById('voiceBtn').style.display);
const pBtn = await peer.evaluate(()=>document.getElementById('voiceBtn').style.display);
console.log('voice btn visible — host:', hBtn, 'peer:', pBtn);

await host.evaluate(()=>enableVoice()); await peer.evaluate(()=>enableVoice());
await host.waitForTimeout(3500); // let the WebRTC mesh negotiate over WS

const conn = await host.evaluate(()=>Object.fromEntries(Object.entries(voicePCs).map(([k,v])=>[k,v.connectionState])));
console.log('host RTC connection states:', conn);

await peer.evaluate(()=>voiceTalkStart());
await host.waitForTimeout(800);
const pill = await host.evaluate(()=>{ const e=document.getElementById('voiceSpeaking'); return {disp:e.style.display, txt:e.textContent}; });
console.log('host sees talking pill while peer talks:', pill);

await peer.evaluate(()=>voiceTalkEnd());
await host.waitForTimeout(1500); // poll interval (200ms) + speak-hold (400ms) + slack
const hidden = await host.evaluate(()=>document.getElementById('voiceSpeaking').style.display==='none');
console.log('host pill hidden after peer stops:', hidden);

console.log('errors host:', hErr.slice(0,3), 'peer:', pErr.slice(0,3));
await b.close();
