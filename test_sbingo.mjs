import { chromium } from './node_modules/playwright/index.mjs';

const br = await chromium.launch({ headless: true });
const page = await br.newPage();
await page.goto('http://localhost:7788/bachelorette.html');

// Navigate to Secret Bingo tab
await page.click('button.tab[data-tab="sbingo"]');
await page.screenshot({ path: '/tmp/sb_01_blank.png' });
console.log('Step 1: Opened Secret Bingo tab');

// Check trigger field is gone
await page.click('#sbingo-board .bingo-cell[data-idx="0"]');
await page.waitForSelector('#sbingo-cell-modal.open');
const triggerField = await page.$('#sbingo-cell-trigger-inp');
console.log('Step 2: trigger-inp in DOM?', triggerField !== null, '(should be false)');
await page.screenshot({ path: '/tmp/sb_02_modal.png' });

// Fill label "She will scream"
await page.fill('#sbingo-cell-label-inp', 'She will scream');
await page.press('#sbingo-cell-label-inp', 'Enter');
await page.waitForSelector('#sbingo-cell-modal.open', { state: 'hidden' });
const cell0 = await page.textContent('#sbingo-board .bingo-cell[data-idx="0"]');
console.log('Step 3: Cell 0 after save:', JSON.stringify(cell0), '(should be ?)');

// Second card "He will scream"
await page.click('#sbingo-board .bingo-cell[data-idx="1"]');
await page.waitForSelector('#sbingo-cell-modal.open');
await page.fill('#sbingo-cell-label-inp', 'He will scream');
await page.press('#sbingo-cell-label-inp', 'Enter');
await page.waitForSelector('#sbingo-cell-modal.open', { state: 'hidden' });
console.log('Step 4: Cell 1 set to "He will scream"');

// Test: "scream" alone — ambiguous
await page.fill('#sbingo-type-input', 'scream');
await page.press('#sbingo-type-input', 'Enter');
await page.waitForTimeout(400);
const hint1 = await page.textContent('#sbingo-match-hint');
console.log('Step 5: typed "scream" →', JSON.stringify(hint1));
await page.screenshot({ path: '/tmp/sb_03_ambiguous.png' });

// Test: "she will scream" — specific, should reveal cell 0
await page.fill('#sbingo-type-input', 'she will scream');
await page.press('#sbingo-type-input', 'Enter');
await page.waitForTimeout(400);
const hint2 = await page.textContent('#sbingo-match-hint');
const cell0After = await page.textContent('#sbingo-board .bingo-cell[data-idx="0"]');
const cell1After = await page.textContent('#sbingo-board .bingo-cell[data-idx="1"]');
console.log('Step 6: typed "she will scream" →', JSON.stringify(hint2));
console.log('  Cell 0:', JSON.stringify(cell0After), '(should be "She will scream")');
console.log('  Cell 1:', JSON.stringify(cell1After), '(should still be ?)');
await page.screenshot({ path: '/tmp/sb_04_revealed.png' });

// Third card + fuzzy phrase match test
await page.click('#sbingo-board .bingo-cell[data-idx="2"]');
await page.waitForSelector('#sbingo-cell-modal.open');
await page.fill('#sbingo-cell-label-inp', 'Bride cries');
await page.press('#sbingo-cell-label-inp', 'Enter');
await page.waitForSelector('#sbingo-cell-modal.open', { state: 'hidden' });

await page.fill('#sbingo-type-input', 'bride cri');
await page.press('#sbingo-type-input', 'Enter');
await page.waitForTimeout(400);
const hint3 = await page.textContent('#sbingo-match-hint');
console.log('Step 7: typed "bride cri" (partial) →', JSON.stringify(hint3));

// No match test
await page.fill('#sbingo-type-input', 'pizza time');
await page.press('#sbingo-type-input', 'Enter');
await page.waitForTimeout(400);
const hint4 = await page.textContent('#sbingo-match-hint');
console.log('Step 8: typed "pizza time" (no match) →', JSON.stringify(hint4));

await page.screenshot({ path: '/tmp/sb_05_final.png' });
const status = await page.textContent('#sbingo-status');
console.log('Final status bar:', JSON.stringify(status));

await br.close();
console.log('\nDone.');
