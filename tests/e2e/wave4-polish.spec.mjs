import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

const en = STRINGS.en;

test.describe('Wave 4: Explore, Voice, Continuity/Progress, BLE-MIDI & Mobile ergonomics', () => {
  test('Explore updates minor chords dynamically for Natural/Harmonic/Melodic and quick-bridges work', async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'explore', dock: false });

    // Without MIDI and with dock hidden, show-keyboard helper is visible and opens the dock.
    await expect(page.locator('#ex-open-kb')).toBeVisible();
    await page.locator('#ex-open-kb').click();
    await expect(page.locator('#ex-open-kb')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/\bkb\b/);

    // Pick A minor -> Natural minor chords -> Harmonic minor -> Melodic minor.
    await page.locator('#circle .cof-k[data-ring="min"][data-i="0"]').click();
    const chips = () => page.locator('#cof-chords .cof-chip').evaluateAll((els) =>
      els.map((b) => b.querySelector('.cof-chip-rn').textContent + ' ' + b.querySelector('b').textContent));
    await expect.poll(chips).toEqual(['i Am', 'ii° B°', 'III C', 'iv Dm', 'v Em', 'VI F', 'VII G']);

    // Flavor selector stays visible in Chord mode too.
    await page.locator('#cof-mode button[data-v="chord"]').click();
    await expect(page.locator('#cof-flavor')).toBeVisible();

    await page.locator('#cof-flavor button[data-v="harmonic"]').click();
    await expect.poll(chips).toEqual(['i Am', 'ii° B°', 'III+ C+', 'iv Dm', 'V E', 'VI F', 'vii° G♯°']);

    await page.locator('#cof-flavor button[data-v="melodic"]').click();
    await expect.poll(chips).toEqual(['i Am', 'ii Bm', 'III+ C+', 'IV D', 'V E', 'vi° F♯°', 'vii° G♯°']);

    // Bridge 1: Practice scale -> opens Practice > Scales & arpeggios > Technique in A.
    await page.locator('#ex-go-scale').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__etude.prChoice())).toEqual({ cat: 'scale', mode: 'tech', key: '9' });

    // Bridge 2: Progressions in key -> opens Practice > Progressions in A.
    await page.evaluate(() => window.__etude.show('explore'));
    await page.locator('#ex-go-prog').click();
    expect(await page.evaluate(() => window.__etude.prChoice().cat)).toBe('prog');
    expect(await page.evaluate(() => window.__etude.prChoice().key)).toBe('9');

    // Bridge 3: Read in this key -> opens Read with Am pinned.
    await page.evaluate(() => window.__etude.show('explore'));
    await page.locator('#ex-go-read').click();
    await expect(page.locator('#view-read')).toHaveClass(/active/);
    await expect(page.locator('[data-rdn-key="Am"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Voice range presets, label modes, Hum mini-staff and viewport fold fit cleanly', async ({ app, page }) => {
    for (const [width, height] of [[1440, 900], [1180, 820], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await app.open({ hash: 'sing' });
      const fit = await page.evaluate(() => ({
        controlsBottom: document.getElementById('si-controls').getBoundingClientRect().bottom,
        viewport: window.innerHeight,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(fit.controlsBottom, `${width}x${height} controlsBottom`).toBeLessThanOrEqual(fit.viewport);
      expect(fit.overflow, `${width}x${height} overflow`).toBeLessThanOrEqual(0);
    }

    // Label mode switching: Solfège -> Degrees -> Note names.
    const labels = () => page.locator('#si-staff .ss-syl').allTextContents();
    await page.locator('#si-lbl-mode').selectOption('degree');
    expect((await labels()).every((s) => /^[1-7]$/.test(s))).toBe(true);
    await page.locator('#si-lbl-mode').selectOption('note');
    expect((await labels()).every((s) => /^[A-G][♯♭]?$/.test(s))).toBe(true);
    await page.locator('#si-lbl-mode').selectOption('solfege');
    expect((await labels()).every((s) => /^(do|re|mi|fa|sol|la|ti|si)$/.test(s))).toBe(true);

    // Vocal range presets update clef cleanly (Tenor keeps treble clef with 8vb playback shift).
    await page.locator('#si-range').selectOption('bass');
    await expect(page.locator('#si-clef')).toHaveValue('bass');
    await page.locator('#si-range').selectOption('tenor');
    await expect(page.locator('#si-clef')).toHaveValue('treble');
    expect(await page.evaluate(() => window.__etude.sing.range)).toBe('tenor');

    // Hum to notes renders mini-staff SVG and hides it on Clear.
    await page.locator('#vo-tab-hum').click();
    await expect(page.locator('#tr-staff')).toBeHidden();
    await page.evaluate(() => {
      window.__etude.trx.notes = [
        { midi: 60, start: 0, dur: 0.6 },
        { midi: 62, start: 0.65, dur: 0.6 },
        { midi: 64, start: 1.3, dur: 0.6 },
      ];
      window.__etude.trxRender();
    });
    await expect(page.locator('#tr-staff')).toBeVisible();
    await expect(page.locator('#tr-staff svg')).toHaveCount(1);
    await page.locator('#tr-clear').click();
    await expect(page.locator('#tr-staff')).toBeHidden();
  });

  test('Progress persists Technique runs, Melody sessions and Voice clears in ptt-v3 and launches drills', async ({ app, page }) => {
    await app.open({ hash: 'practice', dock: true });
    await page.clock.install();

    // Complete 1 clean C-major RH 1-octave scale technique run.
    await page.locator('#pr-t-scale').click();
    await page.locator('#pr-mode button[data-v="tech"]').click();
    await page.locator('#pr-keys [data-v="0"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#tq-drill')).toBeVisible();

    const up = await page.evaluate(() => [...document.querySelectorAll('#tq-drill .tq-cell')].map((cell) => cell.dataset.m.split(',').map(Number)));
    expect(up.length).toBeGreaterThan(0);
    const notes = [...up, ...up.slice(0, -1).reverse()];
    for (const midis of notes) {
      await page.clock.runFor(300);
      await page.evaluate((ms) => {
        ms.forEach((m) => window.__etude.handleNoteOn(m, 90, 'midi'));
        ms.forEach((m) => window.__etude.handleNoteOff(m, 'midi'));
      }, midis);
    }
    await expect(page.locator('#q-verdict')).toBeVisible();
    await page.locator('#ses-end').click();

    // Verify persistence across reload and display in Progress > Studio section.
    await page.reload();
    const savedLog = await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.practiceLog);
    expect(savedLog.techRuns).toBe(1);
    expect(savedLog.techClean).toBe(1);

    await page.evaluate(() => window.__etude.show('progress'));
    await expect(page.locator('#prog-empty')).toBeHidden();
    await expect(page.locator('#progStudio [data-studio="tech"]')).toContainText('1');
    await expect(page.locator('#progStudio [data-studio="voice"], #progStudio [data-studio="sing"]')).toContainText(en.prog_st_voice);

    // 1-click launch to Melodies from Progress.
    await page.locator('#progStudio [data-studio="melody"] button').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.__etude.prChoice().cat)).toBe('melody');
  });

  test('Header shows BLE-MIDI shortcut when Web Bluetooth exists and mobile avoids triple bottom stack', async ({ app, page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: { requestDevice: async () => ({ id: 'ble-1', name: 'Test BLE' }) },
      });
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'practice' });
    await expect(page.locator('#bleChip')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // On 390px phone with collapsed dock, Practice sticky start bar hides collapsed dock rail cleanly.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#pr-mobile-bar')).toBeVisible();
    await expect(page.locator('#dock')).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      const navTop = document.getElementById('bottomNav').getBoundingClientRect().top;
      const barBottom = document.getElementById('pr-mobile-bar').getBoundingClientRect().bottom;
      return Math.abs(barBottom - navTop);
    })).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
