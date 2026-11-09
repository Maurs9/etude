import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '../helpers/fixtures.mjs';

// Optional private corpus; never copy these originals into tracked test fixtures.
const directory = process.env.ETUDE_SCORES_DIR;
const files = directory ? readdirSync(directory).filter(name => /\.(mxl|musicxml|xml|mid|midi)$/i.test(name)).sort().map(name => join(directory, name)) : [];
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');

test('the local score collection can be imported once, retained and reopened without original file access', async ({ app, page }) => {
  test.skip(!files.length, 'Set ETUDE_SCORES_DIR to audit private originals.');
  test.setTimeout(180_000);
  const originals = files.map(path => ({ name: basename(path), id: digest(path) }));
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles(files);
  await expect(page.locator('#library-status')).toContainText(`Added: ${files.length}. Already stored: 0. Failed: 0.`, { timeout: 120_000 });
  const stored = await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).map(item => ({ name: item.name, id: item.id })));
  expect(stored.sort((a, b) => a.name.localeCompare(b.name))).toEqual([...originals].sort((a, b) => a.name.localeCompare(b.name)));
  await page.reload();
  await page.waitForFunction(() => !!window.__etude?.show);
  await page.locator('#score-library summary').click();
  await expect(page.locator('#library-items > li')).toHaveCount(files.length);
  for (const original of [originals[0], originals.at(-1)]) {
    await page.locator(`[data-library-id="${original.id}"] [data-library-action=open]`).click();
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    await expect(page.locator('.score-library-content')).toHaveAttribute('aria-busy', 'false');
    expect(await page.evaluate(() => window.__etude.AN.notes.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__etude.anLibraryFlush());
  }
  expect(files.map(path => ({ name: basename(path), id: digest(path) }))).toEqual(originals);
});
