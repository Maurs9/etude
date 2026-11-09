import { test, expect } from '../helpers/fixtures.mjs';

test('German notation distinguishes B-flat from B-natural and survives reload', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation button[data-v="german"]').click();
  expect(await page.evaluate(() => [window.__etude.pcName(10,true), window.__etude.pcName(10,false), window.__etude.pcName(11,false), window.__etude.noteName(71,false)])).toEqual(['B','A#','H','H4']);
  await page.reload();
  await expect(page.locator('#set-notation button[data-v="german"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__etude.noteName(70,true))).toBe('B4');
});

test('spelled German notes preserve accidentals across reading, learning and analysis', async ({ app }) => {
  const page = await app.open();
  await page.locator('#set-notation button[data-v="german"]').dispatchEvent('click');
  const names = await page.evaluate(() => ({
    circle: [-2,-1,0,1,2].map(a => window.__etude.cofSpell('B',a)),
    learning: [-1,0,1].map(a => window.__etude.lSp(6,a)),
    reading: [-1,0,1].map(a => window.__etude.rdName({li:6,acc:a,oct:4},true)),
    readingKey: [window.__etude.rdSpell('Bb'),window.__etude.rdSpell('B'),window.__etude.rdSpell('B#')],
    scoreSignature: window.__etude.srKeyNames(-2), slip: window.__etude.srSlipNames({n:{li:6,acc:-1}}),
    falling: (() => { const old=window.__etude.PRAC.labels; window.__etude.PRAC.labels='finger'; const x=window.__etude.fallName({midi:70,start:0}); window.__etude.PRAC.labels='letter'; const y=window.__etude.fallName({midi:70,start:0}); window.__etude.PRAC.labels=old; return [x,y]; })(),
    analysis: [window.__etude.spellName(70,{fifths:-2,minor:false},true),window.__etude.spellName(71,{fifths:0,minor:false},true),window.__etude.anKeyName({root:10,fifths:-2,minor:false})],
  }));
  expect(names).toEqual({circle:['H𝄫','B','H','H♯','H𝄪'], learning:['B','H','H♯'], reading:['B4','H4','H♯4'], readingKey:['B','H','H♯'], scoreSignature:['B','E♭'], slip:['H','B'], falling:['B','B♭'], analysis:['B4','H4','B major']});
});

test('German notation syncs between tabs without changing language', async ({ app, context }) => {
  const first = await app.open();
  const second = await context.newPage();
  await second.goto('etude.html');
  await second.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  await first.locator('#set-notation button[data-v="german"]').dispatchEvent('click');
  await expect.poll(() => second.evaluate(() => window.__etude.noteName(71,false))).toBe('H4');
  expect(await second.evaluate(() => window.__etude.lang)).toBe('en');
  await second.close();
});

test('invalid persisted notation falls back to letters', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ptt-v3', JSON.stringify({v:3,lang:'en',notation:'invalid',data:{}})));
  await page.goto('etude.html');
  expect(await page.evaluate(() => window.__etude.noteName(71,false))).toBe('B4');
});
