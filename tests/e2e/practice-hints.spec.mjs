import { test, expect } from '../helpers/fixtures.mjs';

const hint = (page, name) => page.locator('#practiceHintsList [data-hint]').filter({ has: page.getByRole('heading', { name }) });

test('switching topics keeps the panel open and shows each reference hint', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  const panel = page.locator('#pr-songs');
  await page.locator('#pr-t-chord').click();
  await expect(panel).not.toHaveAttribute('open', '');
  await expect(page.locator('#practiceHintsList')).toBeEmpty();
  await panel.locator('summary').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(25);
  await expect(hint(page, /^Cmaj7 · /)).toContainText('1 3 5 7');
  await page.locator('#pr-t-scale').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(19);
  await expect(hint(page, /Dorian/)).toContainText('1 2 ♭3 4 5 6 ♭7');
  await page.locator('#pr-t-prog').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(10);
  await expect(hint(page, /Jazz cadence/).locator('.pr-progression-name')).toHaveText(['Dm7', 'G7', 'Cmaj7']);
  await page.locator('#pr-t-technique').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(6);
  await expect(hint(page, /shared fingering/)).toContainText('E(3) · F(1)');
  await page.locator('#pr-t-melody').click();
  await expect(page.locator('#practiceHintsList button')).toHaveCount(0);
  await expect(page.locator('#practiceHintsList')).toContainText('Hum the first two or three notes.');
  await expect(panel).toHaveAttribute('open', '');
});

test('by-ear hints play without key marks and can show them on demand', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  await page.evaluate(() => {
    window.__hintAudio = [];
    window.__etude.previewNote = (midi, at, seconds) => window.__hintAudio.push({ midi, at, seconds });
  });
  const card = hint(page, /^Cmaj7 · /);
  await card.getByRole('button', { name: /^Listen\b/ }).click();
  await expect.poll(() => page.evaluate(() => window.__hintAudio.map(event => event.midi))).toEqual([
    60, 64, 67, 71, 60, 64, 67, 71, 60, 64, 67, 70, 60, 64, 67, 70,
  ]);
  const keys = page.locator('[data-pr-hint-key]');
  await expect(keys).toHaveCount(0);
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);
  await card.getByRole('button', { name: /Show keys/ }).click();
  await expect(keys.first()).toBeVisible();
  await page.locator('#dock-kb-toggle').click();
  await expect(keys).toHaveCount(0);
  await card.getByRole('button', { name: /Show keys/ }).click();
  await expect(keys.first()).toBeVisible();
  await page.locator('#pr-t-scale').click();
  await expect(keys).toHaveCount(0);
  await expect(page.locator('#pr-songs')).toHaveAttribute('open', '');
});

test('accompaniment owns progression playback while the loop is running', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-prog').click();
  await page.locator('#pr-songs summary').click();
  await page.locator('#pr-mode button[data-v="along"]').click();
  const play = hint(page, /Jazz cadence/).getByRole('button', { name: /^Listen\b/ });
  await expect(play).toBeEnabled();
  await page.locator('#pr-start').click();
  await expect(play).toBeDisabled();
  await page.locator('#pr-start').click();
  await expect(play).toBeEnabled();
});

test('all chord cards show both clefs and their details directly on a phone', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  await expect(page.locator('.pr-chord-group-title')).toHaveText([
    'Triads and suspended chords', 'Sixth and seventh chords', 'Extended chords',
  ]);
  const list = page.locator('#practiceHintsList');
  await expect(list.locator('.pr-chord-staff-treble')).toHaveCount(25);
  await expect(list.locator('.pr-chord-staff-bass')).toHaveCount(25);
  await expect(list.locator('[aria-expanded]')).toHaveCount(0);
  const sus = page.locator('[data-hint="sus2"]');
  await expect(sus.locator('.pr-chord-keyboard')).toBeVisible();
  await expect(sus.locator('.pr-chord-caption')).toBeVisible();
  await expect(sus.getByRole('button', { name: /^Listen\b/ })).toBeVisible();
  for (const clef of ['treble', 'bass']) {
    const staff = sus.locator(`.pr-chord-staff-${clef}`);
    await expect(staff).toBeVisible();
    const heads = staff.locator('.ss-head');
    await expect(heads).toHaveCount(3);
    expect(await heads.nth(0).getAttribute('cx')).not.toBe(await heads.nth(1).getAttribute('cx'));
  }
  const bass = sus.locator('.pr-chord-staff-bass');
  await expect(bass).toHaveAttribute('aria-label', /C3 · D3 · G3/);
  // G3 sits in the top space of the bass staff, six units below the top line.
  await expect(bass.locator('[data-chord-midi="67"] .ss-head')).toHaveAttribute('cy', '6');

  const diminished = page.locator('[data-hint="dim7"]');
  await expect(diminished.locator('.pr-chord-staff-treble')).toHaveAttribute('aria-label', /B𝄫4/);
  await expect(diminished.locator('.pr-chord-staff-bass')).toHaveAttribute('aria-label', /B𝄫3/);
  await expect(diminished.locator('.pr-chord-staff [data-chord-midi="69"] .ss-glyph')).toHaveCount(4);
  await page.locator('#pr-keys [data-v="5"]').click();
  const thirteenth = page.locator('[data-hint="13"]');
  await expect(thirteenth.locator('.pr-chord-staff-treble')).toHaveAttribute('aria-label', /D6/);
  await expect(thirteenth.locator('.pr-chord-staff-bass')).toHaveAttribute('aria-label', /D5/);
  await expect(thirteenth.locator('.pr-chord-keyboard [data-chord-midi="86"]')).toHaveCount(1);
  for (const clef of ['treble', 'bass']) {
    const highNote = thirteenth.locator(`.pr-chord-staff-${clef} [data-chord-midi="86"]`);
    await expect(highNote.locator('.ss-head')).toBeVisible();
    expect(await highNote.locator('.ss-ledger').count()).toBeGreaterThan(0);
  }
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);
});

for (const [lang, label] of [
  ['en', 'Listen'], ['ro', 'Ascultă'], ['de', 'Anhören'], ['es', 'Escuchar'],
  ['fr', 'Écouter'], ['it', 'Ascolta'], ['pt-BR', 'Ouvir'],
]) {
  test(`chord cards show only the short playback label in ${lang}`, async ({ app }) => {
    const page = await app.open({ hash: 'practice', lang });
    await page.locator('#pr-t-chord').click();
    await page.locator('#pr-songs summary').click();
    const cards = page.locator('#practiceHintsList .pr-chord-card');
    await expect(cards.locator('.pr-hint-cue')).toHaveCount(0);
    await expect(cards.locator('button[data-hint-control$=":hear"]')).toHaveText(Array(25).fill(label));
  });
}

test('both clefs follow the keyboard during a chord comparison and reset after playback', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  const card = hint(page, /^Cmaj7 · /);
  const keyboard = card.locator('.pr-chord-keyboard');
  const treble = card.locator('.pr-chord-staff-treble'), bass = card.locator('.pr-chord-staff-bass');
  const diagrams = [keyboard, treble, bass];
  const frames = await Promise.all(diagrams.map(diagram => diagram.getAttribute('viewBox')));
  await card.getByRole('button', { name: /^Listen\b/ }).click();
  await expect(keyboard).toHaveAttribute('aria-label', /Keyboard for C7 with/);
  await expect(treble).toHaveAttribute('aria-label', /Treble staff for C7 with/);
  await expect(bass).toHaveAttribute('aria-label', /Bass staff for C7 with.*B♭3/);
  await expect(card.locator('[data-chord-midi="70"].pr-chord-sounding.pr-chord-changed')).toHaveCount(3);
  expect(await Promise.all(diagrams.map(diagram => diagram.getAttribute('viewBox')))).toEqual(frames);
  await expect(keyboard).toHaveAttribute('aria-label', /Keyboard for Cmaj7 with/);
  await expect(treble).toHaveAttribute('aria-label', /Treble staff for Cmaj7 with/);
  await expect(bass).toHaveAttribute('aria-label', /Bass staff for Cmaj7 with/);
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);
});

test('the chord keyboard color follows the root across chord qualities', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  const major = page.locator('[data-hint="maj"]');
  const minor = page.locator('[data-hint="m"]');
  const rootKey = card => card.locator('.pr-chord-key.pr-chord-root .pr-chord-key-shape');
  await expect(rootKey(major)).toHaveCSS('fill', 'rgb(228, 122, 125)');
  await expect(rootKey(minor)).toHaveCSS('fill', 'rgb(228, 122, 125)');
  await expect(major.locator('.pr-chord-white:not([data-chord-midi]) .pr-chord-key-shape').first())
    .toHaveCSS('fill', 'rgb(255, 250, 241)');

  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(rootKey(major)).toHaveCSS('fill', 'rgb(99, 175, 215)');
  await expect(rootKey(minor)).toHaveCSS('fill', 'rgb(99, 175, 215)');
});

test('a fixed tonic transposes playback and notation changes only the names', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  await page.locator('#pr-keys [data-v="11"]').click();
  const card = page.locator('#practiceHintsList [data-hint="maj7"]');
  await expect(card.getByRole('heading')).toContainText('Bmaj7');
  await page.evaluate(() => {
    window.__hintRoots = [];
    window.__etude.previewNote = (midi) => window.__hintRoots.push(midi);
  });
  await card.getByRole('button', { name: /^Listen\b/ }).click();
  await expect.poll(() => page.evaluate(() => window.__hintRoots[0])).toBe(59);
  await page.locator('#set-notation button[data-v="german"]').dispatchEvent('click');
  await expect(card.getByRole('heading')).toContainText('Hmaj7');
  await expect(card.locator('.pr-chord-staff-treble')).toHaveAttribute('aria-label', /H3/);
  await expect(card.locator('.pr-chord-staff-bass')).toHaveAttribute('aria-label', /H2/);
  await expect(card.getByRole('button', { name: /^Listen\b/ })).toBeFocused();
  await page.evaluate(() => { window.__hintRoots = []; });
  await card.getByRole('button', { name: /^Listen\b/ }).click();
  await expect.poll(() => page.evaluate(() => window.__hintRoots[0])).toBe(59);
  await page.locator('#pr-t-technique').click();
  const exception = page.locator('#practiceHintsList [data-hint="major_f_b"]');
  await expect(exception.getByRole('heading', { level: 3 })).toHaveText('F and H major');
  await expect(exception.locator('.pr-hint-fingers').last()).toHaveText('H(4) · C♯(3) · D♯(2) · E(1) · F♯(4) · G♯(3) · A♯(2) · H(1)');
});

test('closing the panel or navigating cancels the key guide', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.locator('#pr-t-technique').click();
  const summary = page.locator('#pr-songs summary');
  await summary.click();
  const demonstration = hint(page, /shared fingering/).getByRole('button', { name: /Right hand/ });
  await demonstration.click();
  const keys = page.locator('[data-pr-hint-key]');
  await expect(keys.first()).toBeVisible();
  await expect(keys.first()).toHaveAttribute('data-pr-hint-key', /^[1-5]$/);
  await summary.click();
  await expect(keys).toHaveCount(0);
  await summary.click();
  await demonstration.click();
  await expect(keys.first()).toBeVisible();
  await page.locator('#nav [data-view="today"]').click();
  await expect(keys).toHaveCount(0);
  await expect(page.locator('#dock')).toHaveClass(/is-rail/);
});

test('a late audio unlock cannot restart a hint after changing topics', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  await page.evaluate(async () => {
    const context = window.__etude.ensureAudio();
    await context.suspend();
    const resume = context.resume.bind(context);
    let unlock;
    const pending = new Promise(resolve => { unlock = resolve; });
    window.__resumeRequested = false;
    window.__hintNotes = [];
    window.__etude.previewNote = (midi) => window.__hintNotes.push(midi);
    context.resume = () => { window.__resumeRequested = true; return pending; };
    window.__unlockHint = async () => { await resume(); unlock(); };
  });
  const chord = hint(page, /^Cmaj7 · /);
  await chord.getByRole('button', { name: /^Listen\b/ }).click();
  await expect.poll(() => page.evaluate(() => window.__resumeRequested)).toBe(true);
  await page.locator('#pr-t-scale').click();
  await page.evaluate(() => window.__unlockHint());
  expect(await page.evaluate(() => window.__hintNotes)).toEqual([]);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);
});

test('repertoire names the passage and opens the bundled opening without a personal library', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-prog').click();
  await page.locator('#pr-songs summary').click();
  const pop = hint(page, '1950s progression');
  await expect(pop).toContainText('Stand by Me (1961)');
  await expect(pop).toContainText('Intro, bars 1–6');
  await expect(pop.getByRole('button', { name: /Find in the piece/ })).toHaveCount(0);
  await page.locator('#pr-t-scale').click();
  await expect(hint(page, /Harmonic minor/)).toContainText('opening pickup in the right hand');
  await page.locator('#pr-t-chord').click();
  const chord = hint(page, /^Cmaj7 · /);
  await expect(chord).toContainText('bar 1, beat 2');
  await chord.getByRole('button', { name: /Find in the piece/ }).click();
  await expect(page).toHaveURL(/#analysis$/);
  await expect(page.locator('#an-name')).toHaveText('Gymnopédie No. 1 (opening)');
  await page.goBack();
  await expect(page.locator('#view-practice')).toBeVisible();
  await page.locator('#pr-t-technique').click();
  const arpeggio = hint(page, 'Major arpeggios');
  await expect(arpeggio).toContainText('BWV 846');
  await arpeggio.getByRole('button', { name: /Find in the piece/ }).click();
  await expect(page.locator('#an-name')).toHaveText('Prelude in C, BWV 846 (opening)');
});

test('translated hint cards fit a narrow viewport and have tappable controls', async ({ app }) => {
  const page = await app.open({ hash: 'practice', lang: 'fr' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-technique').click();
  await page.locator('#pr-songs summary').click();
  await expect(page.locator('#pr-songs summary')).toHaveText('Indices de doigté');
  const sizes = await page.locator('#practiceHintsList').evaluate(panel => ({
    fits: panel.scrollWidth <= panel.clientWidth,
    heights: [...panel.querySelectorAll('button')].map(button => button.getBoundingClientRect().height),
  }));
  expect(sizes.fits).toBe(true);
  expect(Math.min(...sizes.heights)).toBeGreaterThanOrEqual(44);
});
