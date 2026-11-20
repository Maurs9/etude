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

async function openEditor(item) {
  await item.locator('[data-library-action=more]').click();
  await item.locator('[data-library-action=edit]').click();
}

test('the library editor shows a star estimate and preserves the imported repeat timing', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Repeated fixture.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  const item = page.locator('#library-items [data-library-id]');
  await expect(item).toHaveCount(1);
  await openEditor(item);
  await item.locator('[data-library-action=estimate-difficulty]').click();
  await expect(item.getByRole('status')).toContainText('Decisive measures');
  await expect(item.locator('[data-library-field=level]')).toHaveCount(0);
  const repeat = await page.evaluate(source => window.__etude.anInspectDifficulty(new File([source], 'repeat.musicxml')), xml);
  expect(repeat.playedMeasures).toBe(4);
  expect(repeat.playedDurationSec).toBe(4);
});

test('a verified starting tempo replaces a provisional star rating', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Unmarked fixture.musicxml', mimeType: 'application/xml',
    buffer: Buffer.from(xml.replace('<direction><sound tempo="120"/></direction>', '')),
  });
  const item = page.locator('#library-items [data-library-id]');
  await openEditor(item);
  const estimate = item.locator('[data-library-action=estimate-difficulty]');
  const tempo = item.locator('[data-library-field=difficulty-tempo]');
  const save = item.getByRole('button', { name: /^Save .*★$/ });
  await estimate.click();
  await expect(tempo).toBeVisible();
  await expect(save).toBeHidden();
  await tempo.fill('500');
  await expect(estimate).toBeDisabled();
  await tempo.fill('84,5');
  await estimate.click();
  await expect(save).toBeVisible();
  await save.click();
  await expect(item.locator('.score-library-rating')).toHaveAttribute('data-provisional', 'false');
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

test('bulk recalculation previews stars and preserves legacy metadata', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Written.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  const id = createHash('sha256').update(xml).digest('hex');
  const get = () => page.evaluate(id => window.__etude.scoreLibraryStore.libraryGet(id).then(result => result?.item), id);
  await expect.poll(async () => (await get())?.difficultyRating?.axes).toBeTruthy();
  await page.evaluate(async id => {
    const store = window.__etude.scoreLibraryStore;
    await store.libraryUpdate(id, { level: 'Level 1', notes: 'My notes', favorite: true });
    const { item } = await store.libraryGet(id);
    await store.libraryUpdateLevels([{ id, previousRating: item.difficultyRating, rating: { ...item.difficultyRating, stars: 5 } }]);
  }, id);
  await page.locator('#library-rate-all').click();
  await expect(page.locator('#library-rating-preview')).toContainText('Changes: 1. Unchanged: 0. Skipped: 0.');
  await page.locator('#library-rating-apply').click();
  await expect(page.locator('#library-status')).toHaveText('Difficulty stars saved for 1 scores.');
  expect(await get()).toMatchObject({ level: 'Level 1', notes: 'My notes', favorite: true });
  expect((await get()).difficultyRating.stars).toBeLessThan(5);
});

test('library rows show five difficulty axes and automatically save stars without replacing levels', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles({
    name: 'Rated.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  const item = page.locator('#library-items [data-library-id]');
  const rating = item.locator('.score-library-rating');
  await rating.scrollIntoViewIfNeeded();
  const ratingNumber = rating.locator('.score-library-rating-number');
  await expect(ratingNumber).toHaveText(/^[1-5]\.\d$/);
  const tenths = Math.round(Number(await ratingNumber.innerText()) * 10);
  const graphics = rating.locator('.score-library-star-fill');
  await expect(graphics).toHaveCount(5);
  expect(await graphics.evaluateAll(nodes => nodes.map(node => parseFloat(node.style.clipPath.match(/\d+%/)?.[0])))).toEqual(
    Array.from({ length: 5 }, (_, index) => {
      const fill = Math.min(10, Math.max(0, tenths - index * 10));
      return 100 - 10 * fill;
    }),
  );
  const inline = item.locator('.score-library-axis-summary');
  await expect(inline).toBeVisible();
  await expect(inline.locator('dt')).toHaveText(['Technique', 'Rhythm', 'Hands', 'Texture', 'Notation']);
  await expect(inline.locator('dd')).toHaveText(Array(5).fill(/^[1-5]\.\d$/));
  const more = item.locator('[data-library-action=more]');
  await expect(item.locator('.score-library-rating-details')).toBeHidden();
  await more.click();
  await item.locator('[data-library-action=rating-details]').click();
  const axes = item.locator('.score-library-axes');
  await expect(axes.locator('dt')).toHaveText(['Technique', 'Rhythm', 'Hand coordination', 'Texture', 'Notation']);
  await expect(axes.locator('dd')).toHaveCount(5);
  await expect(axes.locator('.score-library-star-graphic')).toHaveCount(5);
  await item.locator('.score-library-rating-details').press('Escape');
  await expect(item.locator('.score-library-rating-details')).toBeHidden();
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
  await expect.poll(async () => (await stored()).difficultyRating?.assessment?.tempoFallback).toBe(false);
  await page.locator('#library-rate-all').click();
  await expect(page.locator('#library-rating-preview')).toContainText('Changes: 0. Unchanged: 1. Skipped: 0.');
  const saved = await stored();
  expect(saved).toMatchObject({ level: 'Level 4', notes: 'Keep', difficultyRating: { version: 1, stars: expect.any(Number), axes: {
    motor: expect.any(Number), rhythm: expect.any(Number), bimanual: expect.any(Number), texture: expect.any(Number), reading: expect.any(Number),
  } } });
  const list = page.locator('.score-library-scroll');
  expect(await list.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__etude?.scoreLibraryStore);
  expect(await stored()).toEqual(saved);
  await page.locator('#score-library summary').click();
  await expect(inline).toBeVisible();
  await expect(item.locator('h3 [data-library-action=open]')).toHaveText('Rated');
});

test('Difficulty orders older and newly opened scores by their automatic star ratings', async ({ app, page }) => {
  await app.open({ hash: 'today' });
  await page.evaluate(async source => {
    const store = window.__etude.scoreLibraryStore;
    const fastPassage = [3, 6, 3, 6].map(octave => `<note><pitch><step>G</step><octave>${octave}</octave></pitch><duration>1</duration><type>eighth</type></note>`).join('');
    const fast = source.replace('tempo="120"', 'tempo="260"').replace(/<note><pitch><step>G.*?<\/note>/, fastPassage);
    const easy = source.replace('tempo="120"', 'tempo="35"');
    for (const [title, music, level] of [['Z Easy older score', easy, 'Level 6'], ['A Fast older score', fast, 'Level 1']]) {
      const file = new File([music], `${title}.musicxml`);
      const { item } = await store.librarySave(file, { title, composer: '' });
      await store.libraryUpdate(item.id, { level });
      if (music === fast) await store.libraryUpdateLevels([{ id: item.id, rating: { version: 1, stars: 1 } }]);
    }
    window.__etude.show('analysis');
  }, xml);
  await page.locator('#score-library summary').click();
  await page.locator('#library-sort-stars').click();
  await expect(page.locator('#library-sort')).toHaveValue('difficulty');
  const stored = () => page.evaluate(() => window.__etude.scoreLibraryStore.libraryList());
  await expect.poll(async () => (await stored()).filter(item => item.difficultyRating?.assessment).length).toBe(2);
  const titles = page.locator('#library-items h3');
  await expect(titles).toHaveText(['Z Easy older score', 'A Fast older score']);
  const column = await page.locator('#library-sort-stars').evaluate(el => el.getBoundingClientRect().left);
  expect(await page.locator('#library-items .score-library-rating').evaluateAll(nodes =>
    nodes.map(el => Math.round(el.getBoundingClientRect().left)))).toEqual([Math.round(column), Math.round(column)]);
  const update = new Map((await stored()).map(item => [item.title, item]));
  expect(update.get('Z Easy older score').level).toBe('Level 6');
  expect(update.get('A Fast older score').difficultyRating.stars).toBeGreaterThan(update.get('Z Easy older score').difficultyRating.stars);
  await expect(page.locator('#library-sort option[value=level_label]')).toHaveCount(0);
  await expect(page.locator('#library-items .score-library-badge-level')).toHaveCount(0);

  const unmarked = xml.replace('<direction><sound tempo="120"/></direction>', '');
  const id = createHash('sha256').update(unmarked).digest('hex');
  await page.locator('#score-library summary').click();
  await page.locator('#an-file').setInputFiles({ name: 'No tempo.musicxml', mimeType: 'application/xml', buffer: Buffer.from(unmarked) });
  const newItem = async () => (await stored()).find(item => item.id === id);
  await expect.poll(async () => (await newItem())?.difficultyRating?.assessment?.tempoFallback).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__etude?.scoreLibraryStore);
  await page.locator('#score-library summary').click();
  await expect(page.locator(`[data-library-id="${id}"] .score-library-rating`)).toHaveAttribute('data-provisional', 'true');
  await page.locator('#library-difficulty-calibration').setInputFiles({
    name: 'tempo-profile.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, cutoffs: [10, 20, 30, 40, 50], startingTempos: { [id]: 72 } })),
  });
  await expect.poll(async () => (await newItem())?.difficultyRating?.assessment).toEqual({ referenceBpm: 72, tempoFallback: false });
  await expect(page.locator(`[data-library-id="${id}"] .score-library-rating`)).toHaveAttribute('data-provisional', 'false');
});
