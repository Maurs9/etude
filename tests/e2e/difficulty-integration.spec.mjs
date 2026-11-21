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
  await page.reload();
  await page.locator('#score-library summary').click();
  await expect(item.locator('.score-library-rating')).toHaveAttribute('data-provisional', 'false');
  const [saved] = await page.evaluate(() => window.__etude.scoreLibraryStore.libraryList());
  expect(saved.difficultyRating.startingBpm).toBe(84.5);
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
  const title = item.locator('h3');
  expect((await inline.boundingBox()).y).toBeGreaterThan((await title.boundingBox()).y);
  await expect(inline.locator('dt')).toHaveText(['Technique', 'Rhythm', 'Hands', 'Texture', 'Notation']);
  await expect(inline.locator('dd')).toHaveText(Array(5).fill(/^[1-5]\.\d★$/));
  await expect(inline.locator('> div').first()).toHaveAttribute('title', /Technique: Keyboard spans/);
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
  const filename = item.getByText('Rated.musicxml · MUSICXML', { exact: true });
  await expect(original).toBeHidden();
  await expect(filename).toBeHidden();
  await more.click();
  await expect(original).toBeVisible();
  await expect(filename).toBeVisible();
  expect(await item.locator('.score-library-secondary').evaluate(el => getComputedStyle(el).position)).toBe('absolute');
  await original.focus();
  await original.press('Escape');
  await expect(original).toBeHidden();
  await expect(more).toBeFocused();
  await more.click();
  await expect(original).toBeVisible();
  await page.locator('#score-library summary').dispatchEvent('pointerdown', { bubbles: true });
  await expect(original).toBeHidden();

  const id = createHash('sha256').update(xml).digest('hex');
  await page.evaluate(id => window.__etude.scoreLibraryStore.libraryUpdate(id, { level: 'Level 4', notes: 'Keep' }), id);
  const stored = () => page.evaluate(id => window.__etude.scoreLibraryStore.libraryGet(id).then(value => value.item), id);
  await expect.poll(async () => (await stored()).difficultyRating?.assessment?.tempoFallback).toBe(false);
  await page.locator('#library-rate-all').click();
  await expect(page.locator('#library-rating-preview')).toContainText('Changes: 0. Unchanged: 1. Skipped: 0.');
  const saved = await stored();
  expect(saved).toMatchObject({ level: 'Level 4', notes: 'Keep', difficultyRating: {
    version: 2,
    stars: expect.any(Number),
    assessment: {
      tempoFallback: false,
      tempoSource: 'written',
      voiceSource: 'written',
      handSource: 'unassigned',
      estimatorVersion: 3,
      profileId: 'default',
    },
    axes: {
      motor: expect.any(Number), rhythm: expect.any(Number), bimanual: expect.any(Number), texture: expect.any(Number), reading: expect.any(Number),
    },
  } });
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
  await page.setViewportSize({ width: 1440, height: 900 });
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
  const infoToggle = page.locator('#library-axes-info-toggle');
  const infoPanel = page.locator('#library-axes-info-panel');
  await expect(infoPanel).toBeHidden();
  await infoToggle.click();
  await expect(infoPanel).toBeVisible();
  await expect(infoPanel.locator('dt')).toHaveText(['Technique', 'Rhythm', 'Hands (Hand coordination)', 'Texture', 'Notation']);
  await infoToggle.press('Escape');
  await expect(infoPanel).toBeHidden();
  await expect(infoToggle).toBeFocused();
  await page.locator('#library-sort-stars').click();
  await expect(page.locator('#library-sort')).toHaveValue('difficulty');
  const stored = () => page.evaluate(() => window.__etude.scoreLibraryStore.libraryList());
  await expect.poll(async () => (await stored()).filter(item => item.difficultyRating?.assessment).length).toBe(2);
  const titles = page.locator('#library-items h3');
  await expect(titles).toHaveText(['Z Easy older score', 'A Fast older score']);
  const titleBox = await titles.first().boundingBox();
  const axesBox = await page.locator('#library-items .score-library-axis-summary').first().boundingBox();
  expect(axesBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(axesBox.y + axesBox.height / 2).toBeGreaterThan(titleBox.y);
  expect(axesBox.y + axesBox.height / 2).toBeLessThan(titleBox.y + titleBox.height);
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
  const aggregation = {
    mode: 'axis', axisWeights: { motor: 1, rhythm: 0, bimanual: 0, texture: 0, reading: 0 },
    alphaWeak: 0, enduranceScale: 0,
  };
  const profileId = createHash('sha256').update(JSON.stringify(aggregation)).digest('hex').slice(0, 16);
  const profile = { version: 2, profileId, aggregation, startingTempos: { [id]: 72 } };
  expect(await page.evaluate(async ({ scoreId, oldProfile }) => {
    const store = window.__etude.scoreLibraryStore;
    const { difficultyRating } = (await store.libraryGet(scoreId)).item;
    localStorage.setItem('etude-difficulty-calibration-v1', JSON.stringify(oldProfile));
    return store.libraryUpdateLevels([{
      id: scoreId,
      previousRating: difficultyRating,
      rating: {
        ...difficultyRating,
        assessment: {
          ...difficultyRating.assessment, profileId: oldProfile.profileId,
          referenceBpm: 72, tempoFallback: false, tempoSource: 'reference',
        },
      },
    }]);
  }, { scoreId: id, oldProfile: profile })).toBe(1);
  await page.reload();
  await page.waitForFunction(() => window.__etude?.scoreLibraryStore);
  await page.locator('#score-library summary').click();
  await expect(page.locator('.score-library-transfer input[type=file]')).toHaveCount(1);
  await expect(page.locator('#library-restore')).toBeVisible();
  await expect.poll(async () => (await newItem())?.difficultyRating?.assessment).toEqual({
    tempoFallback: true,
    tempoSource: 'fallback',
    voiceSource: 'written',
    handSource: 'unassigned',
    estimatorVersion: 3,
    profileId: 'default',
  });
  await expect(page.locator(`[data-library-id="${id}"] .score-library-rating`)).toHaveAttribute('data-provisional', 'true');
  await page.locator('#library-sort-stars').click();
  await expect(page.locator('#library-sort')).toHaveValue('difficulty');
  await page.locator('#library-sort-stars').click();
  await expect(page.locator('#library-sort')).toHaveValue('difficulty_desc');
  await expect(page.locator('#library-items h3').first()).toHaveText('A Fast older score');
});

test('library combines overall and axis ranges and clears each filter independently', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'today', lang: 'ro' });
  await page.evaluate(async () => {
    const store = window.__etude.scoreLibraryStore;
    for (const [title, stars, rhythm] of [['Andante', 2.5, 3], ['Ballade', 3.5, 2.9], ['Caprice', 4.1, 4], ['Unrated', 0, 0]]) {
      const { item } = await store.librarySave(new File([title], `${title}.musicxml`), { title, composer: '' });
      if (stars) await store.libraryUpdateLevels([{ id: item.id, rating: {
        version: 1, stars, assessment: { tempoFallback: false },
        axes: { motor: 2.2, rhythm, bimanual: 2, texture: 2, reading: 2 },
      } }]);
    }
    window.__etude.show('analysis');
  });
  await page.locator('#score-library summary').click();
  await page.locator('#library-sort').selectOption('title');
  const titles = page.locator('#library-items h3');
  await expect(titles).toHaveCount(4);
  const toggle = page.locator('#library-toggle-filters');
  await toggle.click();
  const totalMin = page.locator('#library-difficulty-total-min');
  await totalMin.selectOption('2.5');
  await page.locator('#library-difficulty-total-max').selectOption('3.5');
  await expect(totalMin.locator('option[value="3.6"]')).toBeDisabled();
  await expect(totalMin.locator('option[value="2.5"]')).toHaveText('2,5');
  await expect(titles).toHaveText(['Andante', 'Ballade']);
  await expect(page.locator('#library-difficulty-axis-min')).toBeHidden();
  await page.locator('#library-difficulty-axis').selectOption('rhythm');
  await page.locator('#library-difficulty-axis-min').selectOption('3');
  await expect(titles).toHaveText(['Andante']);
  await toggle.click();
  const chips = page.locator('#library-active-chips');
  await expect(chips.getByRole('button')).toHaveCount(2);
  await chips.getByRole('button', { name: /Dificultate totală: 2,5–3,5/ }).click();
  await expect(titles).toHaveText(['Andante', 'Caprice']);
  await page.locator('#library-reset-filters').click();
  await expect(titles).toHaveCount(4);
  await toggle.click();
  await expect(totalMin).toHaveValue('');
  await expect(page.locator('#library-difficulty-axis')).toHaveValue('');
  expect(await page.locator('#library-filters-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await totalMin.selectOption('1');
  await expect(titles).toHaveCount(3);
  await page.locator('#library-files').setInputFiles({
    name: 'Fresh.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml),
  });
  await expect(titles.getByRole('button', { name: /Fresh/ })).toBeVisible();
});

test('difficulty details explain drivers, spans and provisional BPM, and v1 backups upgrade cleanly', async ({ app, page }) => {
  const octaveAndRunXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
 <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1">
  <measure number="1"><attributes><divisions>4</divisions><key><fifths>5</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
    <direction><sound tempo="160"/></direction>
    ${Array.from({ length: 8 }, (_, i) => `
      <note><pitch><step>${['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'][i]}</step><octave>${i === 7 ? 5 : 4}</octave></pitch><duration>2</duration><type>eighth</type><staff>1</staff></note>
      <note><chord/><pitch><step>${['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'][i]}</step><octave>${i === 7 ? 6 : 5}</octave></pitch><duration>2</duration><type>eighth</type><staff>1</staff></note>
    `).join('')}
  </measure>
 </part>
</score-partwise>`;
  const unmarkedXml = xml.replace('<direction><sound tempo="120"/></direction>', '');
  await app.open({ hash: 'analysis' });
  await page.locator('#score-library summary').click();
  await page.locator('#library-files').setInputFiles([
    { name: 'Octaves.musicxml', mimeType: 'application/xml', buffer: Buffer.from(octaveAndRunXml) },
    { name: 'Unmarked.musicxml', mimeType: 'application/xml', buffer: Buffer.from(unmarkedXml) },
  ]);
  const storedList = () => page.evaluate(() => window.__etude.scoreLibraryStore.libraryList());
  await expect.poll(async () => (await storedList()).filter(item => item.difficultyRating?.version === 2).length).toBe(2);

  // Check info guide summary text
  await page.locator('#library-axes-info-toggle').click();
  await expect(page.locator('#library-axes-info-panel .score-library-axes-guide-note')).toContainText('endurance bonus');
  await page.locator('#library-axes-info-toggle').click();

  // Check details panel for wide span + drivers on Octaves score (no endurance badge when < 0.1)
  const octRow = page.locator('#library-items > li', { hasText: 'Octaves' });
  await octRow.locator('[data-library-action=more]').click();
  await octRow.locator('[data-library-action=rating-details]').click();
  const octDetails = octRow.locator('.score-library-rating-details');
  await expect(octDetails).toContainText('Wide hand spans (≥ octave)');
  await expect(octDetails).not.toContainText('Endurance (+');
  await expect(octDetails).not.toContainText('MIDI:');
  await expect(octDetails).not.toContainText('Hands are not assigned');
  await expect(octDetails.locator('.score-library-drivers').first()).toBeVisible();

  // Score with >= 32 unique varied measures and > 60s duration triggers appliedEnduranceStars >= 0.1
  const longVariedXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
 <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
 <part id="P1">
  ${Array.from({ length: 32 }, (_, m) => `<measure number="${m + 1}">${m ? '' : '<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><sound tempo="100"/></direction>'}${Array.from({ length: 8 }, (_, b) => `<note><pitch><step>${['C', 'D', 'E', 'F', 'G', 'A', 'B'][(m * 5 + b * 2) % 7]}</step><octave>${4 + ((m + b) % 2)}</octave></pitch><duration>1</duration><type>eighth</type><staff>1</staff></note>`).join('')}</measure>`).join('')}
 </part>
</score-partwise>`;
  await page.locator('#library-files').setInputFiles({
    name: 'LongVaried.musicxml', mimeType: 'application/xml', buffer: Buffer.from(longVariedXml),
  });
  await expect.poll(async () => (await storedList()).find(item => item.title === 'LongVaried')?.difficultyRating?.appliedEnduranceStars ?? 0).toBeGreaterThanOrEqual(0.1);
  const longRow = page.locator('#library-items > li', { hasText: 'LongVaried' });
  await longRow.locator('[data-library-action=more]').click();
  await longRow.locator('[data-library-action=rating-details]').click();
  await expect(longRow.locator('.score-library-rating-details')).toContainText(/Endurance \(\+0\.\d★\)/);

  // Check provisional BPM notice, unassigned-hand MusicXML notice (not MIDI warning), & quick Set BPM action
  const unmRow = page.locator('#library-items > li', { hasText: 'Unmarked' });
  await unmRow.locator('[data-library-action=more]').click();
  await unmRow.locator('[data-library-action=rating-details]').click();
  const unmDetails = unmRow.locator('.score-library-rating-details');
  await expect(unmDetails).toContainText('Provisional estimate (unknown tempo, 120 BPM).');
  await expect(unmDetails).toContainText('Hands are not assigned in this score');
  await expect(unmDetails).not.toContainText('MIDI:');
  await unmDetails.locator('[data-library-action=set-bpm]').click();
  const tempoInput = unmRow.locator('[data-library-field=difficulty-tempo]');
  await expect(tempoInput).toBeVisible();
  await expect(tempoInput).toBeFocused();
  await unmRow.locator('[data-library-action=cancel-edit]').click();

  // Imported MIDI files show the dedicated MIDI notice (and never the unassigned-hands notice)
  const midiBuffer = (() => {
    const track = Buffer.from('00903c400091404060803c000081400000ff2f00', 'hex');
    const head = Buffer.from('4d54686400000006000000010060', 'hex');
    const trkHead = Buffer.from('4d54726b00000000', 'hex');
    trkHead.writeUInt32BE(track.length, 4);
    return Buffer.concat([head, trkHead, track]);
  })();
  await page.locator('#library-files').setInputFiles({ name: 'FixtureMidi.mid', mimeType: 'audio/midi', buffer: midiBuffer });
  await expect.poll(async () => (await storedList()).find(item => item.name === 'FixtureMidi.mid')?.difficultyRating?.version ?? null).toBe(2);
  const midiRow = page.locator('#library-items > li', { hasText: 'FixtureMidi' });
  await midiRow.locator('[data-library-action=more]').click();
  await midiRow.locator('[data-library-action=rating-details]').click();
  const midiDetails = midiRow.locator('.score-library-rating-details');
  await expect(midiDetails).toContainText('MIDI: voices and rests are not notated; hands are estimated.');
  await expect(midiDetails).not.toContainText('Hands are not assigned');

  // Restore a legacy v1 backup and verify non-destructive upgrade to v2
  const legacySource = xml.replace('G</step>', 'A</step>');
  const legacyId = createHash('sha256').update(legacySource).digest('hex');
  const legacyBackup = {
    app: 'etude-score-library',
    version: 1,
    files: [{
      item: {
        id: legacyId,
        title: 'Legacy V1 Score',
        composer: 'Anon',
        name: 'legacy.musicxml',
        size: Buffer.byteLength(legacySource),
        addedAt: 1000,
        lastOpenedAt: null,
        favorite: true,
        resume: null,
        difficultyRating: {
          version: 1,
          stars: 4.9,
          assessment: { tempoFallback: false },
          axes: { motor: 4.9, rhythm: 1, bimanual: 1, texture: 1, reading: 1 },
        },
      },
      data: Array.from(Buffer.from(legacySource)),
    }],
  };
  await page.locator('#library-restore').setInputFiles({
    name: 'legacy-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacyBackup)),
  });
  await expect.poll(async () => {
    const items = await storedList();
    return items.find(item => item.id === legacyId)?.difficultyRating?.version;
  }).toBe(2);
  const upgraded = (await storedList()).find(item => item.id === legacyId);
  expect(upgraded.favorite).toBe(true);
  expect(upgraded.difficultyRating.stars).toBeLessThan(4.9);
});
