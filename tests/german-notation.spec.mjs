import { test, expect } from './fixtures.mjs';

test('German notation distinguishes B-flat from B-natural and survives reload', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation button[data-v="german"]').click();
  expect(await page.evaluate(() => [pcName(10,true), pcName(10,false), pcName(11,false), noteName(71,false)])).toEqual(['B','A#','H','H4']);
  await page.reload();
  await expect(page.locator('#set-notation button[data-v="german"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => noteName(70,true))).toBe('B4');
});

test('spelled German notes preserve accidentals across reading, learning and analysis', async ({ app }) => {
  const page = await app.open();
  await page.locator('#set-notation button[data-v="german"]').dispatchEvent('click');
  const names = await page.evaluate(() => ({
    circle: [-2,-1,0,1,2].map(a => cofSpell('B',a)),
    learning: [-1,0,1].map(a => lSp(6,a)),
    reading: [-1,0,1].map(a => rdName({li:6,acc:a,oct:4},true)),
    readingKey: [rdSpell('Bb'),rdSpell('B'),rdSpell('B#')],
    scoreSignature: srKeyNames(-2), slip: srSlipNames({n:{li:6,acc:-1}}),
    falling: (() => { const old=PRAC.labels; PRAC.labels='finger'; const x=fallName({midi:70,start:0}); PRAC.labels='letter'; const y=fallName({midi:70,start:0}); PRAC.labels=old; return [x,y]; })(),
    analysis: [spellName(70,{fifths:-2,minor:false},true),spellName(71,{fifths:0,minor:false},true),anKeyName({root:10,fifths:-2,minor:false})],
  }));
  expect(names).toEqual({circle:['H𝄫','B','H','H♯','H𝄪'], learning:['B','H','H♯'], reading:['B4','H4','H♯4'], readingKey:['B','H','H♯'], scoreSignature:['B','E♭'], slip:['H','B'], falling:['B','B♭'], analysis:['B4','H4','B major']});
});

test('German notation syncs between tabs without changing language', async ({ app, context }) => {
  const first = await app.open();
  const second = await context.newPage();
  await second.goto('etude.html?__etude_test_surface=1');
  await second.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  await first.locator('#set-notation button[data-v="german"]').dispatchEvent('click');
  await expect.poll(() => second.evaluate(() => noteName(71,false))).toBe('H4');
  expect(await second.evaluate(() => lang)).toBe('en');
  await second.close();
});

test('invalid persisted notation falls back to letters', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ptt-v3', JSON.stringify({v:3,lang:'en',notation:'invalid',data:{}})));
  await page.goto('etude.html?__etude_test_surface=1');
  expect(await page.evaluate(() => noteName(71,false))).toBe('B4');
});
