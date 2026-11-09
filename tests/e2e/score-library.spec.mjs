import { readFileSync } from 'node:fs';
import { test, expect } from '../helpers/fixtures.mjs';

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function score(title = 'Library Alpha', composer = 'Composer Alpha', step = 'C') {
  return `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>${escape(title)}</work-title></work><identification><creator type="composer">${escape(composer)}</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${Array.from({ length: 4 }, (_, bar) => `<measure number="${bar + 1}">${bar ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'}${Array.from({ length: 4 }, () => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('')}</part></score-partwise>`;
}
const file = (name, text = score()) => ({ name, mimeType: 'application/xml', buffer: Buffer.from(text) });
const rows = page => page.locator('#library-items > li');
const row = (page, title) => rows(page).filter({ has: page.locator('h3', { hasText: title }) });
async function library(page) {
  const details = page.locator('#score-library');
  if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
}
async function settled(page) {
  await expect(page.locator('.score-library-content')).toHaveAttribute('aria-busy', 'false');
}
async function openRow(page, title) {
  await row(page, title).locator('[data-library-action=open]').click();
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await settled(page);
}

test('library multi-import is persistent, searchable, duplicate-safe, and resumes each piece after reload', async ({ app, page }) => {
  await app.open({ hash: 'analysis', lang: 'ro' });
  await library(page);
  const alpha = score();
  await page.locator('#library-files').setInputFiles([
    file('alpha.musicxml', alpha), file('beta.xml', score('Library Beta', 'Composer Beta', 'D')),
    file('renamed.xml', alpha), file('broken.xml', 'not a score'), file('document.pdf', '%PDF'),
  ]);
  await expect(page.locator('#library-status')).toContainText('Adăugate: 2. Deja stocate: 1. Eșuate: 2.');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.locator('#library-failures')).toContainText('broken.xml');
  await expect(page.locator('#library-failures')).toContainText('document.pdf');
  expect(await page.evaluate(() => window.__etude.AN.source)).toBeNull();
  await row(page, 'Library Alpha').locator('[data-library-action=favorite]').click();
  await expect(row(page, 'Library Alpha').locator('[data-library-action=favorite]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#library-filter').selectOption('favorites');
  await expect(rows(page)).toHaveCount(1);
  await page.locator('#library-filter').selectOption('all');
  await page.locator('#library-search').fill('composer beta');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).locator('h3')).toHaveText('Library Beta');
  await page.locator('#library-search').fill('');
  await openRow(page, 'Library Alpha');
  await page.locator('#score-speed').selectOption('75');
  await page.evaluate(async () => {
    const E = window.__etude;
    E.pracSet('hands', 'lh');
    E.pracSet('wait', true);
    E.pracSet('metro', true);
    E.scoreSetLook('night');
    E.FALL.position = 3.25;
    E.scoreIdle();
    await E.anLibraryFlush();
    E.show('today');
    await E.anLibraryFlush();
  });
  expect(await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).find(item => item.title === 'Library Alpha').resume)).toMatchObject({ position: 3.25, speed: 75, hands: 'lh', wait: true, metronome: true, look: 'night' });
  await page.evaluate(() => window.__etude.show('analysis'));
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBe(3.25);
  await page.reload();
  await page.waitForFunction(() => !!window.__etude?.show);
  await library(page);
  await expect(rows(page)).toHaveCount(2);
  await expect(row(page, 'Library Alpha').locator('[data-library-action=favorite]')).toHaveAttribute('aria-pressed', 'true');
  await openRow(page, 'Library Alpha');
  await expect(page.locator('#score-speed')).toHaveValue('75');
  expect(await page.evaluate(() => ({ position: window.__etude.FALL.position, hands: window.__etude.PRAC.hands, wait: window.__etude.PRAC.wait, metro: window.__etude.PRAC.metro, look: window.__etude.SCORE.look }))).toEqual({ position: 3.25, hands: 'lh', wait: true, metro: true, look: 'night' });
  await page.locator('#library-filter').selectOption('recent');
  await expect(rows(page)).toHaveCount(1);
});

test('failed replacement imports never overwrite the current piece checkpoint', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles(file('alpha.xml'));
  await expect(rows(page)).toHaveCount(1);
  await page.evaluate(async () => { window.__etude.FALL.position = 3.25; await window.__etude.anLibraryFlush(); });
  for (const extension of ['xml', 'mxl', 'mid']) {
    await page.locator('#an-file').setInputFiles(file(`broken.${extension}`, 'not a valid score'));
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.AN.error);
    await page.evaluate(() => window.__etude.anLibraryFlush());
    const checkpoint = await page.evaluate(async () => ({
      position: window.__etude.FALL.position,
      stored: (await window.__etude.scoreLibraryStore.libraryList())[0].resume.position,
    }));
    expect(checkpoint, extension).toEqual({ position: 3.25, stored: 3.25 });
  }
});

test('failed overlapping imports and navigation retain the pre-import cursor', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles(file('alpha.xml'));
  await expect(rows(page)).toHaveCount(1);
  const result = await page.evaluate(async () => {
    const E = window.__etude;
    E.FALL.position = 3.25;
    await E.anLibraryFlush();
    for (const navigate of [false, true]) {
      let release;
      let started;
      const reading = new Promise(resolve => { started = resolve; });
      const slow = new File(['not valid MIDI'], 'slow.mid');
      slow.arrayBuffer = () => new Promise(resolve => { release = resolve; started(); });
      const pending = E.anOpenFile(slow);
      await reading;
      if (navigate) E.show('today');
      else await E.anOpenFile(new File(['invalid MIDI'], 'another.mid'));
      release(new TextEncoder().encode('invalid MIDI').buffer);
      await pending;
      if (navigate) E.show('analysis');
      await E.anLibraryFlush();
      if (E.FALL.position !== 3.25) return E.FALL.position;
    }
    return (await E.scoreLibraryStore.libraryList())[0].resume.position;
  });
  expect(result).toBe(3.25);
});

test('ordinary file opening saves the original once and does not disturb progress data', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.evaluate(() => localStorage.setItem('library-test-sentinel', 'keep'));
  await page.locator('#an-file').setInputFiles(file('direct.xml'));
  await expect(rows(page)).toHaveCount(1);
  await library(page);
  const download = page.waitForEvent('download');
  await rows(page).locator('[data-library-action=download]').click();
  const original = await download;
  expect(readFileSync(await original.path(), 'utf8')).toBe(score());
  await page.locator('#an-file').setInputFiles(file('another-name.xml'));
  await expect(rows(page)).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('library-test-sentinel'))).toBe('keep');
  await page.evaluate(() => window.__etude.anLibraryFlush());
});

test('library backup transfers originals, favorites and resume state to a separate browser context', async ({ app, page, browser }) => {
  await app.open({ hash: 'analysis', lang: 'ro' });
  await library(page);
  await page.locator('#library-files').setInputFiles(file('alpha.xml'));
  await expect(rows(page)).toHaveCount(1);
  await rows(page).locator('[data-library-action=favorite]').click();
  await settled(page);
  await openRow(page, 'Library Alpha');
  await page.evaluate(async () => { window.__etude.FALL.position = 2; await window.__etude.anLibraryFlush(); });
  const pending = page.waitForEvent('download');
  await page.locator('#library-backup').click();
  const backup = await pending;
  const bytes = readFileSync(await backup.path());
  const parsed = JSON.parse(bytes.toString());
  expect(parsed).toMatchObject({ app: 'etude-score-library', version: 1 });
  expect(parsed.files).toHaveLength(1);
  await settled(page);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const other = await context.newPage();
    await other.goto(page.url());
    await other.waitForFunction(() => !!window.__etude?.show);
    await library(other);
    await expect(rows(other)).toHaveCount(0);
    await other.locator('#library-restore').setInputFiles({ name: 'etude-library.json', mimeType: 'application/json', buffer: bytes });
    await expect(rows(other)).toHaveCount(1);
    await settled(other);
    await expect(rows(other).locator('[data-library-action=favorite]')).toHaveAttribute('aria-pressed', 'true');
    await openRow(other, 'Library Alpha');
    expect(await other.evaluate(() => window.__etude.FALL.position)).toBe(2);
    const stored = await other.evaluate(async () => {
      const lib = window.__etude.scoreLibraryStore;
      return (await lib.libraryGet((await lib.libraryList())[0].id)).file.text();
    });
    expect(stored).toBe(score());
    await other.locator('#library-restore').setInputFiles({ name: 'etude-library.json', mimeType: 'application/json', buffer: bytes });
    await settled(other);
    await expect(rows(other)).toHaveCount(1);
  } finally { await context.close(); }
});

test('malformed restore and deletion preserve the open score and never resurrect a removed library item', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles(file('alpha.xml'));
  await expect(rows(page)).toHaveCount(1);
  await library(page);
  await page.locator('#library-restore').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#library-status')).toContainText('Could not merge');
  await expect(rows(page)).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await rows(page).locator('[data-library-action=delete]').click();
  await expect(rows(page)).toHaveCount(0);
  await page.evaluate(() => window.__etude.anLibraryFlush());
  expect(await page.evaluate(async () => ({ items: (await window.__etude.scoreLibraryStore.libraryList()).length, notes: window.__etude.AN.notes.length, error: window.__etude.AN.error }))).toEqual({ items: 0, notes: 16, error: null });
});

test('unavailable browser storage does not block ordinary score opening or pretend that a save succeeded', async ({ app, page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }));
  await app.open({ hash: 'analysis' });
  await library(page);
  await page.locator('#an-file').setInputFiles(file('alpha.xml'));
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await expect(page.locator('#library-status')).toContainText('Could not save');
  expect(await page.evaluate(() => window.__etude.AN.notes.length)).toBe(16);
});

for (const width of [320, 600, 1024]) {
  test(`library controls remain usable at ${width}px with translated and untrusted titles`, async ({ app, page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await app.open({ hash: 'analysis', lang: 'ro' });
    await library(page);
    const title = '<img src=x onerror=alert(1)> — Studiu cu un titlu foarte lung pentru bibliotecă';
    await page.locator('#library-files').setInputFiles(file('untrusted.xml', score(title)));
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).locator('h3')).toHaveText(title);
    expect(await rows(page).locator('img,script').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const controls = await page.locator('#score-library button,#library-files,#library-search,#library-filter,#library-restore').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { height: r.height, right: r.right }; }));
    expect(controls.every(control => control.height >= 43 && control.right <= width + 1)).toBe(true);
    await page.evaluate(() => window.__etude.setLang('fr'));
    await expect(page.locator('#score-library summary')).toContainText('Ma bibliothèque');
    await page.screenshot({ path: info.outputPath(`library-${width}.png`), fullPage: true });
  });
}

test('a saved score reopens offline after the installed app is warm @sw', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  await library(page);
  await page.locator('#library-files').setInputFiles(file('offline.xml'));
  await expect(rows(page)).toHaveCount(1);
  await page.context().setOffline(true);
  try {
    await page.reload();
    await page.waitForFunction(() => !!window.__etude?.show);
    await library(page);
    await expect(rows(page)).toHaveCount(1);
    await openRow(page, 'Library Alpha');
    expect(await page.evaluate(() => window.__etude.AN.notes.length)).toBe(16);
    await page.evaluate(() => window.__etude.anLibraryFlush());
  } finally { await page.context().setOffline(false); }
});
