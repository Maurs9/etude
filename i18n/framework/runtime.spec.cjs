const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const FILE = pathToFileURL(path.join(ROOT, 'etude.html')).href;
const LOCALES = ['es', 'fr', 'de', 'it', 'pt-BR'];
const payloadDir = process.env.ETUDE_LOCALE_PAYLOAD_DIR;

test.beforeEach(async ({ page }) => {
  // File-mode must work without any network access, including after reload.
  await page.route(/^https?:/, route => route.abort());
  await page.goto(FILE);
  await expect(page.locator('#settingsBtn')).toBeVisible();
});

async function openSettings(page) {
  if (!(await page.locator('#drawer').evaluate(el => el.classList.contains('on')))) await page.locator('#settingsBtn').click();
}

test('existing English and Romanian survive a file-mode reload without changing notation', async ({ page }) => {
  await openSettings(page);
  await page.locator('#set-notation [data-v="solfege"]').click();
  await page.locator('#set-lang [data-v="ro"]').click();
  await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await openSettings(page);
  await expect(page.locator('#set-lang [data-v="ro"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#set-lang [data-v="en"]').click();
  await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
});

for (const locale of LOCALES) {
  test(`${locale}: full payload is rendered without fallback in file mode`, async ({ page }) => {
    test.skip(!payloadDir, 'Set ETUDE_LOCALE_PAYLOAD_DIR to enable release-gate tests.');
    const payloadPath = path.join(payloadDir, `${locale}.json`);
    expect(fs.existsSync(payloadPath), `Missing ${payloadPath}`).toBe(true);
    const validation = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(__dirname, 'validator.py'), payloadPath], {encoding:'utf8'});
    expect(validation.status, validation.stderr + '\n' + (validation.stdout || '').split('\n').slice(0, 30).join('\n') + '\nRun validator.py for the full report.').toBe(0);
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    await openSettings(page);
    await page.locator('#set-notation [data-v="solfege"]').click();
    await page.locator(`#set-lang [data-v="${locale}"]`).click();
    await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
    const actual = await page.evaluate(() => ({
      strings: Object.fromEntries(Object.keys(STRINGS.en).map(k => [k, t(k)])),
      lessons: Object.fromEntries(LESSONS.map(L => [L.id, {t:learnTitle(L), b:learnBodyHTML(L)}])),
      music: {
        intervals:Object.fromEntries(Object.keys(COMPOUND).map(k=>[k,ivName(Number(k))])),
        scales:Object.fromEntries(Object.keys(SCALES).map(k=>[k,scaleDisp(k)])),
        chords:Object.fromEntries(CHORDS.map(c=>[c.symbol,chordDisp(c)])),
        categories:Object.fromEntries(Object.keys(CATS).map(k=>[k,catLabel(k)])),
        inversions:Object.fromEntries(INV_NAMES.map((_,i)=>[String(i),invName(i)])),
        feels:Object.fromEntries(Object.keys(CHORD_FEEL).map(k=>[k,feelDisp(k)])),
        songs:Object.fromEntries(Object.keys(SONGS).map(k=>[k,{asc:songsFor(+k,'asc'),desc:songsFor(+k,'desc')}])),
      }
    }));
    expect(actual.strings).toEqual(payload.strings);
    expect(actual.lessons).toEqual(payload.lessons);
    expect(actual.music).toEqual(payload.music);
    await page.reload();
    await openSettings(page);
    await expect(page.locator(`#set-lang [data-v="${locale}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
  });
}
