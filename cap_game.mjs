import { chromium, devices } from 'playwright';
const b = await chromium.launch();
async function play(page){
  await page.fill('#nameIn','Me'); await page.click('text=Continue →');
  await page.waitForSelector('#lobbyScreen.active'); await page.click('text=Create New Room');
  await page.waitForSelector('#waitingScreen.active'); await page.click('#startBtn');
  await page.waitForTimeout(3000);
  // play a few discards so the pool isn't empty
  for(let i=0;i<5;i++){ await page.evaluate(()=>{ if(G&&G.currentPlayer===G.myId){ if((G.myActions||[]).includes('discard')&&G.myHand?.length){const id=G.myHand[0].id;tileClick(id);tileClick(id);} else if(G.phase==='draw')tx({type:'draw'});} const p=document.querySelector('#actionOverlay .abtn.pass'); if(p)p.click(); }); await page.waitForTimeout(1400); }
}
const d=await b.newPage({viewport:{width:1280,height:800}});
await d.goto('http://localhost:3000'); await d.waitForTimeout(400); await play(d);
await d.screenshot({path:'/tmp/cur_game_pc.png'});
const ctx=await b.newContext({...devices['Pixel 5']}); const m=await ctx.newPage();
await m.goto('http://localhost:3000'); await m.waitForTimeout(400); await play(m);
await m.screenshot({path:'/tmp/cur_game_mob.png'});
await b.close();
