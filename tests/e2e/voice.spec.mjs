import { test, expect } from '../helpers/fixtures.mjs';

// Voice: one screen (view sing) with two activities, Sing from the staff and Hum to notes (the old Transcribe screen).

// A microphone that hums A3 (220 Hz): an oscillator into a MediaStream, so recording and pitch reading run without hardware.
const fakeMic = page => page.addInitScript(() => {
  window.__micStreams = [];
  if (!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination();
    osc.frequency.value = 220;
    osc.connect(dst);
    osc.start();
    window.__micStreams.push(dst.stream);
    return dst.stream;
  };
});
const micLive = page => page.evaluate(() => window.__micStreams.some(s => s.getTracks().some(t => t.readyState === 'live')));

test.describe('Voice screen', () => {
  test('the switch is a tab list that shows one activity at a time, by click and by keyboard', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    const list = page.locator('#vo-switch'), sing = page.locator('#vo-tab-sing'), hum = page.locator('#vo-tab-hum');
    await expect(page.locator('#view-sing h1')).toHaveText('Voice');
    await expect(list).toHaveAttribute('role', 'tablist');
    await expect(list).toHaveAttribute('aria-label', 'Activity');
    await expect(sing).toHaveText('Sing from the staff');
    await expect(hum).toHaveText('Hum to notes');
    await expect(page.locator('#vo-sing')).toHaveAttribute('role', 'tabpanel');
    await expect(page.locator('#vo-hum')).toHaveAttribute('aria-labelledby', 'vo-tab-hum');
    const shows = async act => {
      const on = act === 'sing' ? sing : hum, off = act === 'sing' ? hum : sing;
      await expect(on).toHaveAttribute('aria-selected', 'true');
      await expect(on).toHaveAttribute('tabindex', '0');
      await expect(off).toHaveAttribute('aria-selected', 'false');
      await expect(off).toHaveAttribute('tabindex', '-1');
      await expect(page.locator('#vo-' + act)).toBeVisible();
      await expect(page.locator('#vo-' + (act === 'sing' ? 'hum' : 'sing'))).toBeHidden();
    };
    await shows('sing');
    await expect(page.locator('#si-go')).toBeVisible();
    await expect(page.locator('#tr-rec')).toBeHidden();

    await hum.click();
    await shows('hum');
    await expect(page.locator('#tr-rec')).toBeVisible();
    await expect(page.locator('#si-go')).toBeHidden();

    await hum.focus();
    await page.keyboard.press('ArrowRight');   // wraps round to the first tab
    await shows('sing');
    await expect(sing).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await shows('hum');
    await expect(hum).toBeFocused();
    await page.keyboard.press('Home');
    await shows('sing');
    await page.keyboard.press('End');
    await shows('hum');
    await expect(hum).toBeFocused();
    // Tab moves on into the panel, not to the other tab.
    await page.keyboard.press('Tab');
    await expect(sing).not.toBeFocused();
  });

  test('the choice lasts while the page is open and is not saved', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    await page.locator('#vo-tab-hum').click();
    await page.evaluate(() => window.__etude.show('today'));
    await page.evaluate(() => window.__etude.show('sing'));
    await expect(page.locator('#vo-tab-hum')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#vo-hum')).toBeVisible();
    const saved = await page.evaluate(() => localStorage.getItem('ptt-v3'));
    expect(saved).not.toMatch(/"hum"|voiceAct|"act"/);
  });

  test('#transcribe and a saved lastTool of transcribe land on the Hum to notes side', async ({ app }) => {
    const page = await app.open({ hash: 'transcribe' });
    await expect(page.locator('#view-sing')).toHaveClass(/active/);
    await expect(page.locator('#vo-tab-hum')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#vo-hum')).toBeVisible();
    await expect(page.locator('#vo-sing')).toBeHidden();
    await expect(page).toHaveURL(/#sing$/);
    // The Today plan's Continue names a saved lastTool and opens it.
    const r = await page.evaluate(() => {
      const e = window.__etude;
      e.show('sing');
      e.$('vo-tab-sing').click();
      e.show('today');
      return { name: e.toolName('transcribe'), view: e.data.lastTool };
    });
    expect(r).toEqual({ name: 'Voice', view: 'sing' });
    await page.evaluate(() => { window.__etude.data.lastTool = 'transcribe'; window.__etude.show(window.__etude.data.lastTool); });
    await expect(page.locator('#view-sing')).toHaveClass(/active/);
    await expect(page.locator('#vo-tab-hum')).toHaveAttribute('aria-selected', 'true');
  });

  test('#transcribe from the Sing side stops the running sing; from another screen it leaves that screen alone', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    await page.locator('#si-go').click();
    expect(await page.evaluate(() => window.__etude.sing.active)).toBe(true);
    await page.evaluate(() => window.__etude.show('transcribe'));
    expect(await page.evaluate(() => window.__etude.sing.active)).toBe(false);
    await expect(page.locator('#vo-hum')).toBeVisible();
    await expect(page.locator('#tr-skey option')).toHaveCount(12);   // drawn once, not twice
    // Off the screen, choosing an activity stops nothing that belongs to the screen in view.
    await page.evaluate(() => { window.__etude.show('explore'); window.__etude.startDrone(0); window.__etude.voiceSetAct('sing'); });
    expect(await page.evaluate(() => window.__etude.droneVoices.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__etude.stopDrone());
  });

  test('the Practice mode bar shows Voice and no Transcribe', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    const nav = page.locator('#modeNav');
    await expect(nav.locator('button')).toHaveText(['Exercises', 'Read', 'Voice', 'Explore']);
    await expect(nav.locator('button[data-view="sing"]')).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('button[data-view="transcribe"]')).toHaveCount(0);
    await expect(page.locator('#view-transcribe')).toHaveCount(0);
    await page.evaluate(() => window.__etude.show('read'));
    await expect(nav).not.toContainText('Transcribe');
  });

  test('Today lists one Voice entry and it opens the screen', async ({ app }) => {
    const page = await app.open();
    // Only the Voice entry is checked: the other entries belong to other screens.
    await expect(page.locator('#tools [data-view="transcribe"]')).toHaveCount(0);
    await expect(page.locator('#tools').getByText('Transcribe', { exact: true })).toHaveCount(0);
    const voice = page.locator('#tools .tool[data-view="sing"]');
    await expect(voice).toHaveCount(1);
    await expect(voice.locator('.tool-t')).toHaveText('Voice');
    await expect(voice.locator('.tool-d')).toHaveText('Sight-sing a melody, or hum one and get the notes back.');
    await voice.click();
    await expect(page.locator('#view-sing')).toHaveClass(/active/);
  });

  test('the keyboard dock stays available on both sides', async ({ app }) => {
    const page = await app.open({ hash: 'sing', dock: true });
    expect(await page.evaluate(() => window.__etude.dockWanted())).toBe(true);
    await expect(page.locator('#dock')).toBeVisible();
    await page.locator('#vo-tab-hum').click();
    expect(await page.evaluate(() => window.__etude.dockWanted())).toBe(true);
    await expect(page.locator('#dock')).toBeVisible();
  });

  test('every Sing from the staff control is present and wired', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    const e = fn => page.evaluate(fn);
    // Mode: Note-by-note, Phrase, Free. Tempo shows only for Phrase and Free.
    await expect(page.locator('#si-mode button')).toHaveText(['Note-by-note', 'Phrase', 'Free']);
    await expect(page.locator('#si-tempo-wrap')).toBeHidden();
    await page.locator('#si-mode button[data-v="phrase"]').click();
    await expect(page.locator('#si-mode button[data-v="phrase"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await e(() => window.__etude.sing.mode)).toBe('phrase');
    await expect(page.locator('#si-tempo-wrap')).toBeVisible();
    await page.locator('#si-bpm').fill('120');
    await expect(page.locator('#si-bpmLbl')).toHaveText('120');
    expect(await e(() => window.__etude.sing.bpm)).toBe(120);
    await page.locator('#si-mode button[data-v="free"]').click();
    await expect(page.locator('#si-go')).toHaveText('▶ Play');
    await page.locator('#si-mode button[data-v="note"]').click();
    await expect(page.locator('#si-go')).toHaveText('● Listen & sing');
    // Level (7) and Clef draw a new melody.
    await expect(page.locator('#si-level option')).toHaveCount(7);
    await page.locator('#si-level').selectOption('3');
    expect(await e(() => window.__etude.sing.ex.level)).toBe(3);
    await page.locator('#si-clef').selectOption('bass');
    expect(await e(() => window.__etude.sing.ex.clef)).toBe('bass');
    // Solfège hides and shows the syllables.
    await page.locator('#si-solf').uncheck();
    await expect(page.locator('#si-staff')).toHaveClass(/nosolf/);
    await page.locator('#si-solf').check();
    await expect(page.locator('#si-staff')).not.toHaveClass(/nosolf/);
    // Tonic and Play it for me sound notes.
    await e(() => { window.__played = []; const orig = window.__etude.previewNote; window.__etude.previewNote = (m, ...rest) => { window.__played.push(m); return orig(m, ...rest); }; });
    await page.locator('#si-tonic').click();
    expect(await e(() => window.__played)).toEqual([await e(() => window.__etude.sing.ex.tonicMidi)]);
    await page.locator('#si-playit').click();
    expect(await e(() => window.__played.length)).toBe(1 + await e(() => window.__etude.sing.flat.length));
    // Drone sounds the tonic until it is turned off.
    await page.locator('#si-drone').check();
    expect(await e(() => window.__etude.droneVoices.length)).toBeGreaterThan(0);
    await page.locator('#si-drone').uncheck();
    expect(await e(() => window.__etude.droneVoices.length)).toBe(0);
    // New melody.
    const before = await e(() => { window.__exBefore = window.__etude.sing.ex; return true; });
    expect(before).toBe(true);
    await page.locator('#si-new').click();
    expect(await e(() => window.__etude.sing.ex !== window.__exBefore)).toBe(true);
    // Listen & sing starts a run, and the keys answer in place of the voice.
    await page.locator('#si-go').click();
    await expect(page.locator('#si-go')).toHaveText('■ Stop');
    expect(await e(() => window.__etude.sing.active)).toBe(true);
    await e(() => { const m = window.__etude.ssCurNote().midi; window.__etude.handleNoteOn(m, 90, 'test'); window.__etude.handleNoteOff(m, 'test'); });
    expect(await e(() => window.__etude.sing.idx)).toBe(1);
    await page.locator('#si-go').click();
    expect(await e(() => window.__etude.sing.active)).toBe(false);
  });

  test('every Hum to notes control is present and wired', async ({ app }) => {
    await fakeMic(app.page);
    const page = await app.open({ hash: 'transcribe' });
    const e = fn => page.evaluate(fn);
    // Record reads the live pitch; Stop ends it.
    await page.locator('#tr-rec').click();
    await expect(page.locator('#tr-rec')).toHaveText('■ Stop');
    await expect.poll(() => e(() => window.__etude.trx.on)).toBe(true);
    await expect(page.locator('#tr-live')).toContainText('A');
    await expect(page.locator('#tr-live')).toContainText('¢');
    await page.locator('#tr-rec').click();
    await expect(page.locator('#tr-rec')).toHaveText('● Record');
    expect(await e(() => window.__etude.trx.on)).toBe(false);
    expect(await micLive(page)).toBe(false);
    // A known take at 90 BPM: C#4 held one beat, then D4 for 1.3 beats (a dotted quarter on the 1/8 grid).
    await e(() => {
      const trx = window.__etude.trx, b = 60 / 90;
      trx.notes = [{ midi: 61, start: 0, dur: b }, { midi: 62, start: b, dur: b * 1.3 }];
      window.__etude.trxRender();
    });
    await expect(page.locator('#tr-actions')).toBeVisible();
    await expect(page.locator('#tr-out .tr-note .nm')).toHaveText(['C4', 'D4']);   // Snap to key (C major) pulls C# to C
    await expect(page.locator('#tr-out .tr-note .dl')).toHaveText(['1/4', '1/4.']);
    await page.locator('#tr-snap').uncheck();
    await expect(page.locator('#tr-out .tr-note .nm').first()).toHaveText(/C♯|C#|D♭|Db/);
    await page.locator('#tr-snap').check();
    // Key and Scale: D major keeps C# and D.
    await expect(page.locator('#tr-skey option')).toHaveCount(12);
    expect(await page.locator('#tr-sscale option').count()).toBeGreaterThanOrEqual(10);
    await page.locator('#tr-skey').selectOption('2');
    await expect(page.locator('#tr-out .tr-note .nm').first()).toHaveText(/C♯|C#|D♭|Db/);
    await page.locator('#tr-skey').selectOption('0');
    await page.locator('#tr-sscale').selectOption('Major (Ionian)');
    // Snap to beat, Tempo and Grid shape the values.
    await page.locator('#tr-quant').uncheck();
    await expect(page.locator('#tr-out .tr-note .dl')).toHaveCount(0);
    await page.locator('#tr-quant').check();
    await page.locator('#tr-gridSel').selectOption('4');
    await expect(page.locator('#tr-out .tr-note .dl')).toHaveText(['1/4', '1/4']);
    await page.locator('#tr-bpm').fill('180');
    await page.locator('#tr-bpm').dispatchEvent('change');
    await expect(page.locator('#tr-bpmLbl')).toHaveText('180');
    await expect(page.locator('#tr-out .tr-note .dl')).toHaveText(['1/2', '1/2.']);
    expect(await e(() => window.__etude.trx.bpm)).toBe(180);
    // Play back lights the keys and sounds each note.
    await e(() => { window.__played = []; const orig = window.__etude.previewNote; window.__etude.previewNote = (m, ...rest) => { window.__played.push(m); return orig(m, ...rest); }; });
    await page.locator('#tr-play').click();
    expect(await e(() => window.__played)).toEqual([60, 62]);
    expect(await e(() => window.__etude.trx.hlTimers.length)).toBe(4);
    // MIDI and Notes (text) downloads.
    const [mid] = await Promise.all([page.waitForEvent('download'), page.locator('#tr-midi').click()]);
    expect(mid.suggestedFilename()).toBe('etude-melody.mid');
    const [txt] = await Promise.all([page.waitForEvent('download'), page.locator('#tr-txt').click()]);
    expect(txt.suggestedFilename()).toBe('etude-melody.txt');
    // Clear.
    await page.locator('#tr-clear').click();
    await expect(page.locator('#tr-out .tr-note')).toHaveCount(0);
    await expect(page.locator('#tr-actions')).toBeHidden();
    expect(await e(() => window.__etude.trx.notes.length)).toBe(0);
  });

  test('a microphone that cannot open says so on the Hum to notes side', async ({ app }) => {
    await app.page.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
    const page = await app.open({ hash: 'transcribe' });
    await page.locator('#tr-rec').click();
    await expect(page.locator('#tr-msg')).toHaveText(/microphone/i);
    await expect(page.locator('#tr-rec')).toHaveText('● Record');
    expect(await page.evaluate(() => ({ on: window.__etude.trx.on, pending: window.__etude.trx.pending }))).toEqual({ on: false, pending: false });
  });

  test('switching activity stops a running recording, and a running sing', async ({ app }) => {
    await fakeMic(app.page);
    const page = await app.open({ hash: 'transcribe' });
    await page.locator('#tr-rec').click();
    await expect.poll(() => page.evaluate(() => window.__etude.trx.on)).toBe(true);
    expect(await micLive(page)).toBe(true);
    await page.locator('#vo-tab-sing').click();
    expect(await page.evaluate(() => window.__etude.trx.on)).toBe(false);
    expect(await micLive(page)).toBe(false);
    await expect(page.locator('#tr-rec')).toHaveText('● Record');

    // Sing: a free run listens through the mic; switching to Hum to notes ends it and closes the mic.
    await page.locator('#si-mode button[data-v="free"]').click();
    await page.locator('#si-go').click();
    await expect.poll(() => page.evaluate(() => !!window.__etude.sing.analyser)).toBe(true);
    expect(await micLive(page)).toBe(true);
    await page.locator('#vo-tab-hum').click();
    expect(await page.evaluate(() => ({ active: window.__etude.sing.active, analyser: window.__etude.sing.analyser }))).toEqual({ active: false, analyser: null });
    expect(await micLive(page)).toBe(false);
  });

  test('a mic request that answers after the switch does not start recording', async ({ app }) => {
    await app.page.addInitScript(() => {
      window.__micStreams = [];
      navigator.mediaDevices.getUserMedia = () => new Promise(res => { window.__grant = () => { const ac = new AudioContext(), dst = ac.createMediaStreamDestination(); ac.createOscillator().connect(dst); window.__micStreams.push(dst.stream); res(dst.stream); }; });
    });
    const page = await app.open({ hash: 'transcribe' });
    await page.locator('#tr-rec').click();
    await page.locator('#vo-tab-sing').click();
    await page.evaluate(() => window.__grant());
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => ({ on: window.__etude.trx.on, pending: window.__etude.trx.pending }))).toEqual({ on: false, pending: false });
    expect(await micLive(page)).toBe(false);
  });

  test('leaving the screen and hiding the page stop the recording', async ({ app }) => {
    await fakeMic(app.page);
    const page = await app.open({ hash: 'transcribe' });
    await page.locator('#tr-rec').click();
    await expect.poll(() => page.evaluate(() => window.__etude.trx.on)).toBe(true);
    await page.evaluate(() => window.__etude.show('explore'));
    expect(await page.evaluate(() => window.__etude.trx.on)).toBe(false);
    expect(await micLive(page)).toBe(false);

    await page.evaluate(() => window.__etude.show('sing'));
    await expect(page.locator('#vo-hum')).toBeVisible();
    await page.locator('#tr-rec').click();
    await expect.poll(() => page.evaluate(() => window.__etude.trx.on)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => window.__etude.trx.on)).toBe(false);
    expect(await micLive(page)).toBe(false);
  });

  for (const width of [390, 360]) {
    test(`phone at ${width}px: both sides fit without sideways scroll and keep 44px targets`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 800 });
      await app.open({ hash: 'sing' });
      for (const act of ['sing', 'hum']) {
        await page.locator('#vo-tab-' + act).click();
        if (act === 'hum') await page.evaluate(() => { window.__etude.trx.notes = [{ midi: 60, start: 0, dur: 0.6 }, { midi: 64, start: 0.7, dur: 0.6 }]; window.__etude.trxRender(); });
        expect(await page.evaluate(() => document.documentElement.scrollWidth), act).toBeLessThanOrEqual(width);
        const small = await page.evaluate(act => [...document.querySelectorAll(`#vo-switch [role=tab], #vo-${act} button, #vo-${act} select, #vo-${act} .switch-inline`)]
          .filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44)
          .map(el => el.id || el.dataset.v || el.textContent.trim()), act);
        expect(small, act).toEqual([]);
        const sw = await page.locator('#vo-switch').boundingBox();
        expect(sw.width, 'the switch spans the width').toBeGreaterThan(width - 60);
      }
    });
  }

  for (const scheme of ['light', 'dark']) {
    test(`the switch reads clearly in the ${scheme} theme`, async ({ app, page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await app.open({ hash: 'sing' });
      const c = await page.evaluate(() => {
        const on = getComputedStyle(document.getElementById('vo-tab-sing')), off = getComputedStyle(document.getElementById('vo-tab-hum'));
        return { onBg: on.backgroundColor, onFg: on.color, offBg: off.backgroundColor, offFg: off.color };
      });
      expect(c.onBg).not.toBe(c.offBg);
      expect(c.onFg).not.toBe(c.onBg);
      expect(c.offFg).not.toBe('rgba(0, 0, 0, 0)');
    });
  }
});
