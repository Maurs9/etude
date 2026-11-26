import { test, expect } from '../helpers/fixtures.mjs';

const hint = (page, id) => page.locator('#practiceHintsList').locator(`[data-hint="${id}"]`);
const toggle = card => card.locator('.pr-study-btn');

async function openHints(page, topic, ear = false) {
  await page.locator(`#pr-t-${topic}`).click();
  if (ear) await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
}

async function mockPreview(page) {
  await page.evaluate(async () => {
    const context = window.__etude.ensureAudio();
    await context.resume();
    window.__studyTime = context.currentTime;
    Object.defineProperty(context, 'currentTime', { configurable: true, get: () => window.__studyTime });
    window.__studyNotes = [];
    window.__etude.previewNote = (midi, at) => window.__studyNotes.push({ midi, at });
  });
  return {
    notes: () => page.evaluate(() => window.__studyNotes.map(note => note.midi)),
    onset: index => page.evaluate(i => { window.__studyTime = window.__studyNotes[i].at + 0.03; }, index),
    clear: () => page.evaluate(() => { window.__studyNotes = []; }),
  };
}

test('jazz cadence shows the sounding stack, separate bass, and isolated resolution', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await openHints(page, 'prog', true);
  await page.locator('#practiceHintsList [data-hint-family="jazz"]').click();
  const jazz = hint(page, 'ii–V–I (jazz)');
  await expect(jazz.getByRole('heading')).toHaveText('Jazz cadence');
  await expect(jazz.locator('.pr-prog-staff')).toHaveCount(0);
  await toggle(jazz).click();
  await expect(jazz.locator('.pr-prog-staff')).toHaveAttribute('aria-label', 'ii Dm7 over bass D · V G7 over bass G · I Cmaj7 over bass C');
  await expect(jazz.locator('.pr-prog-staff .ss-clef')).toHaveCount(2);
  await expect(jazz.locator('.pr-study-resolution')).toHaveText('B → C · F → E');
  const audio = await mockPreview(page);

  await jazz.getByRole('button', { name: /^Hear the progression/ }).click();
  await expect.poll(audio.notes).toEqual([50, 62, 65, 69, 72, 43, 67, 71, 74, 77, 36, 60, 64, 67, 71]);
  await audio.onset(5);
  await expect(jazz.locator('.pr-study-chords button', { hasText: /^V G7/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(jazz.locator('[data-study-chord="1"] .pr-study-playing')).toHaveCount(5);
  await expect(jazz.locator('.pr-study-keyboard .pr-chord-sounding')).toHaveCount(5);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);

  await audio.clear();
  await jazz.getByRole('button', { name: /^Hear the bass/ }).click();
  await expect.poll(audio.notes).toEqual([50, 43, 36]);
  await audio.onset(2);
  await expect(jazz.locator('[data-study-chord="2"] .pr-study-playing[data-midi="36"]')).toHaveCount(1);
  await expect(jazz.locator('[data-study-chord="2"] .pr-study-playing')).toHaveCount(1);

  await audio.clear();
  await jazz.getByRole('button', { name: /^Hear the resolution/ }).click();
  await expect.poll(audio.notes).toEqual([59, 65, 60, 64]);
  await audio.onset(2);
  await expect(jazz.locator('.pr-study-resolution')).toHaveClass(/pr-study-playing/);
  await expect(jazz.locator('.pr-study-keyboard .pr-chord-sounding')).toHaveCount(2);

  await audio.clear();
  await jazz.locator('.pr-study-chords button', { hasText: /^I Cmaj7/ }).click();
  await expect.poll(audio.notes).toEqual([36, 60, 64, 67, 71]);
  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(toggle(jazz)).toHaveAttribute('aria-expanded', 'true');
  await expect(jazz.locator('.pr-study-chords button', { hasText: /^I Dmaj7/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(jazz.locator('.pr-chord-sounding')).toHaveCount(0);
});

test('all twelve blues bars stay visible in order on mobile and select independently', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await openHints(page, 'prog', true);
  await page.locator('#practiceHintsList [data-hint-family="jazz"]').click();
  const blues = hint(page, '12-bar blues');
  await toggle(blues).click();
  await expect(blues.locator('.pr-prog-staff')).toHaveCount(3);
  await expect(blues.locator('[data-study-chord]')).toHaveCount(12);
  await expect(blues.locator('.pr-study-chords button')).toHaveCount(12);
  await expect(blues.locator('.pr-study-chords button').last()).toHaveAccessibleName(/Bar 12/);
  expect(await blues.evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true);
  await blues.locator('.pr-study-chords button').last().click();
  await expect(blues.locator('[data-study-chord="11"]')).toHaveClass(/pr-study-selected/);
  await toggle(hint(page, 'ii–V–I (jazz)')).click();
  await expect(toggle(blues)).toHaveAttribute('aria-expanded', 'false');
  await expect(blues.locator('.pr-prog-staff')).toHaveCount(0);
});
