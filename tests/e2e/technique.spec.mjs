import { test, expect } from '../helpers/fixtures.mjs';

// Plays every expected step of the open run, one step per `gap` ms on the page clock (hands together: both notes).
async function playRun(page, gap, { wrongAt = -1, lateAt = -1 } = {}) {
  // The strip lists the way up; the run comes back down without repeating the top note.
  const up = await page.evaluate(() => [...document.querySelectorAll('#tq-drill .tq-cell')].map((cell) => cell.dataset.m.split(',').map(Number)));
  expect(up.length).toBeGreaterThan(0);
  const notes = [...up, ...up.slice(0, -1).reverse()];
  for (let index = 0; index < notes.length; index += 1) {
    await page.clock.runFor(index === lateAt ? gap + 160 : index === lateAt + 1 ? gap - 160 : gap);
    if (index === wrongAt) await page.evaluate(() => { window.__etude.handleNoteOn(61, 90, 'test'); window.__etude.handleNoteOff(61, 'test'); });
    await page.evaluate((midis) => {
      midis.forEach((midi) => window.__etude.handleNoteOn(midi, 90, 'test'));
      midis.forEach((midi) => window.__etude.handleNoteOff(midi, 'test'));
    }, notes[index]);
  }
}

async function openDrill(app, key = '0') {
  const page = await app.open({ hash: 'practice', dock: true });
  await page.clock.install();
  await page.locator('#pr-t-technique').click();
  await expect(page.locator('#pr-mode button[data-v="ear"]')).toBeDisabled();
  await expect(page.locator('#pr-mode-note')).toBeVisible();
  await page.locator(`#pr-keys [data-v="${key}"]`).click();
  await page.locator('#pr-start').click();
  await expect(page.locator('#tq-drill')).toBeVisible();
  return page;
}

test.describe('Practice: scales and arpeggios', () => {
  test('grades a clean, even run, then hides the fingering, without touching reviews, goal or streak', async ({ app }) => {
    const page = await openDrill(app);
    const before = await page.evaluate(() => JSON.stringify({ srs: window.__etude.data.srs, streak: window.__etude.data.streak, today: window.__etude.data.todayCount, last: window.__etude.data.lastDrill ?? null }));
    await expect(page.locator('#q-prompt')).toHaveText('C major scale');
    await expect(page.locator('#q-reveal')).toBeHidden();
    await expect(page.locator('#tq-drill .tq-cell').first()).toContainText('1');
    await playRun(page, 300);
    await expect(page.locator('#q-verdict')).toHaveClass(/good/);
    await expect(page.locator('#q-elab')).toContainText('steady');
    await expect(page.locator('#q-next')).toBeVisible();
    await page.locator('#q-next').click();
    await expect(page.locator('#tq-drill .tq-strip')).toHaveClass(/tq-nofing/);
    await expect(page.locator('#tq-drill .tq-live')).toContainText('Fingering hidden');
    await page.locator('#tq-drill [data-tq-act="peek"]').click();
    await expect(page.locator('#tq-drill .tq-strip')).not.toHaveClass(/tq-nofing/);
    await page.locator('#ses-end').click();
    const after = await page.evaluate(() => JSON.stringify({ srs: window.__etude.data.srs, streak: window.__etude.data.streak, today: window.__etude.data.todayCount, last: window.__etude.data.lastDrill ?? null }));
    expect(after).toBe(before);
    await expect(page.locator('#tq-drill')).toBeHidden();
  });

  test('names a wrong key and an uneven spot, and keeps the fingering for a run that was not clean', async ({ app }) => {
    const page = await openDrill(app);
    await playRun(page, 300, { wrongAt: 2, lateAt: 3 });
    await expect(page.locator('#q-verdict')).not.toHaveClass(/good/);
    await expect(page.locator('#q-elab')).toContainText('wrong keys: 1');
    await expect(page.locator('#q-elab')).toContainText('finger');
    await page.locator('#q-next').click();
    await expect(page.locator('#tq-drill .tq-strip')).not.toHaveClass(/tq-nofing/);
  });

  test('plays two octaves hands together and offers arpeggios only in white-key triads', async ({ app }) => {
    const page = await openDrill(app, '3');
    await expect(page.locator('#tq-drill [data-tq="kind"] button[data-v="arpMajor"]')).toBeDisabled();
    await page.locator('#tq-drill [data-tq="octaves"] button[data-v="2"]').click();
    await page.locator('#tq-drill [data-tq="hands"] button[data-v="both"]').click();
    await expect(page.locator('#q-prompt')).toHaveText('E♭ major scale');
    await expect(page.locator('#tq-drill .tq-cell')).toHaveCount(15);
    await playRun(page, 280);
    await expect(page.locator('#q-elab')).toContainText('Hands together');
  });

  test('takes the scale an octave up only with Accept any octave', async ({ app }) => {
    const page = await openDrill(app, '0');
    const up = await page.evaluate(() => [...document.querySelectorAll('#tq-drill .tq-cell')].map((cell) => Number(cell.dataset.m) + 12));
    const play = async (midi) => {
      await page.clock.runFor(300);
      await page.evaluate((m) => { window.__etude.handleNoteOn(m, 90, 'test'); window.__etude.handleNoteOff(m, 'test'); }, midi);
    };
    await play(up[0]);
    await expect(page.locator('#tq-drill .tq-live')).toContainText('Not that key'); // without the setting
    await page.evaluate(() => { window.__etude.data.settings.anyOctave = true; });
    for (const midi of [...up, ...up.slice(0, -1).reverse()]) await play(midi);
    await expect(page.locator('#q-elab')).toContainText('Notes: 15 played · wrong keys: 1');
  });

  test('judges a MIDI key by its own event time, not by when the page handled it', async ({ app }) => {
    // One Web MIDI port the test drives; send(midi, stamp) delivers a note-on and note-off stamped with the key's own time.
    await app.page.addInitScript(() => {
      const port = { id: 'usb-1', name: 'Digital Piano', type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
      const access = { inputs: new Map([[port.id, port]]), outputs: new Map(), sysexEnabled: false, onstatechange: null };
      window.__midi = { send(midi, stamp) {
        port.onmidimessage({ data: new Uint8Array([0x90, midi, 90]), timeStamp: stamp });
        port.onmidimessage({ data: new Uint8Array([0x80, midi, 0]), timeStamp: stamp + 1 });
      } };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    });
    const page = await openDrill(app);
    await page.locator('#midiChip').click();
    await expect(page.locator('#midiText')).toHaveText('Digital Piano');
    const up = await page.evaluate(() => [...document.querySelectorAll('#tq-drill .tq-cell')].map((cell) => Number(cell.dataset.m)));
    const notes = [...up, ...up.slice(0, -1).reverse()];
    // The keys go down every 300 ms, but every other one reaches the page 200 ms late.
    for (let index = 0; index < notes.length; index += 1) {
      const late = index % 2 ? 200 : 0;
      await page.clock.runFor(index === 0 ? 300 : 300 + late - (index % 2 ? 0 : 200));
      await page.evaluate(([midi, late]) => window.__midi.send(midi, performance.now() - late), [notes[index], late]);
    }
    await expect(page.locator('#q-verdict')).toHaveClass(/good/);
    await expect(page.locator('#q-elab')).toContainText('steady');
  });
});
