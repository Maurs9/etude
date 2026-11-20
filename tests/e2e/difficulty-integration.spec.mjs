import { createHash } from 'node:crypto';
import { test, expect } from '../helpers/fixtures.mjs';

const xml = `<?xml version="1.0"?>
<score-partwise version="4.0">
 <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1">
  <measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>8</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <direction><sound tempo="120"/></direction><barline location="left"><repeat direction="forward"/></barline>
    <note><rest/><duration>1</duration><type>eighth</type></note>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
    <note><rest/><duration>1</duration><type>eighth</type></note>
  </measure>
  <measure number="2">
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><type>half</type></note>
    <barline location="right"><repeat direction="backward"/></barline>
  </measure>
 </part>
</score-partwise>`;

test('a library import offers a calibrated level in the editor and preserves a manual level', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Repeated fixture.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  const item = page.locator('#library-items [data-library-id]');
  await expect(item).toHaveCount(1);
  await item.locator('[data-library-action=edit]').click();
  const estimate = item.locator('[data-library-action=estimate-difficulty]');
  const apply = item.locator('[data-library-action=apply-difficulty]');
  const level = item.locator('[data-library-field=level]');
  await estimate.click();
  await expect(item.getByRole('status')).toContainText('Experimental difficulty');
  await expect(apply).toBeHidden();

  const repeat = await page.evaluate(source => window.__etude.anInspectDifficulty(new File([source], 'repeat.musicxml')), xml);
  expect(repeat.playedMeasures).toBe(4);
  expect(repeat.playedDurationSec).toBe(4);

  await page.locator('#library-difficulty-calibration').setInputFiles({
    name: 'profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, cutoffs: [1, 2, 3, 4, 5] })),
  });
  await expect(page.locator('#library-status')).toContainText('Difficulty calibration loaded');
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(level).toHaveValue(/^Level [1-6]$/);
  await level.fill('My own level');
  await expect(apply).toBeHidden();
  await item.locator('[data-library-action=save-edit]').click();
  await expect(item).toContainText('My own level');
  await item.locator('[data-library-action=edit]').click();
  await estimate.click();
  await expect(item.getByRole('status')).toContainText('Experimental difficulty');
  await expect(level).toHaveValue('My own level');
  await expect(apply).toBeHidden();
});

test('a score without a written starting tempo needs a verified BPM before suggesting a level', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-difficulty-calibration').setInputFiles({
    name: 'profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, cutoffs: [1, 2, 3, 4, 5] })),
  });
  await expect(page.locator('#library-status')).toContainText('Difficulty calibration loaded');
  await page.locator('#library-files').setInputFiles({
    name: 'Unmarked fixture.musicxml', mimeType: 'application/xml',
    buffer: Buffer.from(xml.replace('<direction><sound tempo="120"/></direction>', '')),
  });
  const item = page.locator('#library-items [data-library-id]');
  await item.locator('[data-library-action=edit]').click();
  const estimate = item.locator('[data-library-action=estimate-difficulty]');
  const apply = item.locator('[data-library-action=apply-difficulty]');
  const tempo = item.locator('[data-library-field=difficulty-tempo]');
  await estimate.click();
  await expect(tempo).toBeVisible();
  await expect(apply).toBeHidden();
  await tempo.fill('84,5');
  await estimate.click();
  await expect(apply).toBeVisible();
  await tempo.fill('500');
  await expect(estimate).toBeDisabled();
  await expect(apply).toBeHidden();
  await item.locator('[data-library-field=level]').fill('My own level');
  await item.locator('[data-library-action=save-edit]').click();
  await expect(item).toContainText('My own level');
});

test('a fresh Read exercise opens with an independent result and leaves existing numbered progress intact', async ({ app, page }) => {
  await app.open({ hash: 'read', saved: { v: 3, lang: 'en', data: {
    reading: { book: { v: 2, level: 1, pieces: { 'b1.1': { best: 92, stars: 2, tries: 1, first: 92 } } } },
  } } });
  await expect(page.locator('[data-rdn-n="1"].played')).toBeVisible();
  await page.locator('#rdn-scored').click();
  await expect(page.locator('#rdn-p-title')).toHaveText('New reading exercise');
  await expect(page.locator('#rdn-prev')).toBeHidden();
  const first = await page.evaluate(() => window.__etude.SR.srtFingerprint);
  await page.evaluate(() => window.__etude.rdnRecord(96, 3, true));
  const progress = () => page.evaluate(() => window.__etude.rdnBook().pieces);
  expect(await progress()).toMatchObject({
    'b1.1': { best: 92, stars: 2 },
    ['x1.' + first]: { best: 96, stars: 3 },
  });
  await page.locator('#rdn-next').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtFingerprint)).not.toBe(first);
  await page.reload();
  await page.waitForFunction(() => window.__etude?.rdnBook);
  expect(await progress()).toMatchObject({ 'b1.1': { best: 92, stars: 2 }, ['x1.' + first]: { best: 96, stars: 3 } });
});

test('bulk recalculation previews existing levels and applies only the reviewed changes', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  const written = Buffer.from(xml);
  const unmarked = Buffer.from(xml.replace('<direction><sound tempo="120"/></direction>', ''));
  const other = Buffer.from(unmarked.toString().replace('<step>G</step>', '<step>F</step>'));
  const id = bytes => createHash('sha256').update(bytes).digest('hex');
  const update = (key, patch) => page.evaluate(({ key, patch }) => window.__etude.scoreLibraryStore.libraryUpdate(key, patch), { key, patch });
  const get = key => page.evaluate(key => window.__etude.scoreLibraryStore.libraryGet(key).then(result => result.item), key);
  await page.locator('#library-files').setInputFiles([
    { name: 'Written.musicxml', mimeType: 'application/xml', buffer: written },
    { name: 'Verified.musicxml', mimeType: 'application/xml', buffer: unmarked },
    { name: 'Unknown.musicxml', mimeType: 'application/xml', buffer: other },
  ]);
  await expect(page.locator('#library-items [data-library-id]')).toHaveCount(3);
  await update(id(written), { level: 'Level 1', notes: 'My notes', favorite: true });
  await update(id(unmarked), { level: 'Manual' });
  const previewButton = page.locator('#library-reclassify');
  const preview = page.locator('#library-level-preview');
  const apply = page.locator('#library-reclassify-apply');
  const status = page.locator('#library-status');
  await previewButton.click();
  await expect(status).toContainText('Load a calibration');
  await page.locator('#library-difficulty-calibration').setInputFiles({
    name: 'profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, cutoffs: [1, 2, 3, 4, 5], startingTempos: { [id(unmarked)]: 84 } })),
  });
  await expect(status).toContainText('calibration loaded');
  await previewButton.click();
  await expect(preview).toContainText('Changes: 2. Unchanged: 0. Skipped: 1.');
  await expect(preview).toContainText('starting tempo needed');
  expect((await get(id(written))).level).toBe('Level 1');
  await update(id(unmarked), { level: 'Changed in another tab' });
  await apply.click();
  await expect(status).toContainText('The library changed.');
  expect((await get(id(written))).level).toBe('Level 1');
  await previewButton.click();
  await expect(preview).toContainText('Changed in another tab');
  await apply.click();
  await expect(status).toHaveText('Saved new levels for 2 scores.');
  expect(await get(id(written))).toMatchObject({ notes: 'My notes', favorite: true, level: 'Level 6' });
  expect((await get(id(unmarked))).level).toBe('Level 6');
  expect((await get(id(other))).level).toBeUndefined();
});

test('library rows show five difficulty axes and save experimental stars without replacing levels', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Rated.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  const item = page.locator('#library-items [data-library-id]');
  const rating = item.locator('.score-library-rating');
  await rating.scrollIntoViewIfNeeded();
  await expect(rating).toHaveText(/^[1-5](?:\.5)?★$/);
  await rating.click();
  const axes = item.locator('.score-library-axes');
  await expect(axes.locator('dt')).toHaveText(['Technique', 'Rhythm', 'Hand coordination', 'Texture', 'Notation']);
  await expect(axes.locator('dd')).toHaveCount(5);
  const more = item.locator('[data-library-action=more]');
  const original = item.locator('[data-library-action=download]');
  await expect(original).toBeHidden();
  await more.click();
  await expect(original).toBeVisible();
  await original.focus();
  await original.press('Escape');
  await expect(original).toBeHidden();
  await expect(more).toBeFocused();

  const id = createHash('sha256').update(xml).digest('hex');
  await page.evaluate(id => window.__etude.scoreLibraryStore.libraryUpdate(id, { level: 'Level 4', notes: 'Keep' }), id);
  const stored = () => page.evaluate(id => window.__etude.scoreLibraryStore.libraryGet(id).then(value => value.item), id);
  await page.locator('#library-rate-all').click();
  await expect(page.locator('#library-level-preview')).toContainText('Changes: 1. Unchanged: 0. Skipped: 0.');
  expect(await stored()).toMatchObject({ level: 'Level 4', notes: 'Keep' });
  expect((await stored()).difficultyRating).toBeUndefined();
  await page.getByRole('button', { name: 'Save proposed stars' }).click();
  await expect(page.locator('#library-status')).toContainText('Difficulty stars saved for 1 scores');
  const saved = await stored();
  expect(saved).toMatchObject({ level: 'Level 4', notes: 'Keep', difficultyRating: { version: 1, stars: expect.any(Number) } });
  const list = page.locator('#library-items');
  expect(await list.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__etude?.scoreLibraryStore);
  expect(await stored()).toEqual(saved);
});
