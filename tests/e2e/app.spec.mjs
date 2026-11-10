import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { test, expect, todayN, APP } from '../helpers/fixtures.mjs';
import { scorePedalCollisions } from '../helpers/score-audit-helpers.mjs';
import { STRINGS } from '../../src/locales/index.js';

const VIEWS = ['today', 'learn', 'songs', 'method', 'practice', 'read', 'sing', 'analysis', 'explore', 'accompany', 'transcribe', 'progress'];

test('boots and visits every view without uncaught errors', async ({ app }) => {
  const page = await app.open();
  for (const v of VIEWS) {
    await page.evaluate(v => window.__etude.show(v), v);
    await expect(page.locator('#view-' + v)).toHaveClass(/active/);
  }
});

test.describe('i18n', () => {
  for (const [lang, wording] of [['en', 'compatible Bluetooth MIDI pianos and keyboards'], ['ro', 'piane și claviaturi compatibile']]) {
    test(`Bluetooth MIDI description is instrument-neutral (${lang})`, async ({ app }) => {
      const page = await app.open({ lang });
      await page.locator('#settingsBtn').click();
      const hint = page.locator('[data-i18n="set_ble_hint"]');
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(wording);
      await expect(hint).not.toContainText(/Kawai|ES120/i);
    });
  }

  // `pr_start` used to be defined twice (Practice button and score prompt): the later one won, so the
  // Practice page's "Start drilling" button read "Press Space or ▶ to start".
  for (const [lang, label] of [['en', 'Start drilling'], ['ro', 'Începe exersarea']]) {
    test(`Practice start button keeps its own label (${lang})`, async ({ app }) => {
      const page = await app.open({ lang, hash: 'practice' });
      await expect(page.locator('#pr-start')).toHaveText(label);
    });
  }

  test('no string key is defined twice in a language', () => {
    // Object literals silently keep the last duplicate, so scan the source of the STRINGS literal (keys may be quoted or bare).
    const file = readFileSync(new URL('../../src/locales/index.js', import.meta.url), 'utf8');
    const src = file.slice(file.indexOf('export const STRINGS = {'));
    const dupes = [], langs = [];
    let depth = 0, i = src.indexOf('{'), lang = null, seen = null;
    const key = k => {
      if (depth === 1) { lang = k; langs.push(k); seen = new Set(); }
      else if (depth === 2) { if (seen.has(k)) dupes.push(lang + ':' + k); seen.add(k); }
    };
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        const start = i + 1;
        for (i++; src[i] !== c; i++) if (src[i] === '\\') i++;
        if (/^\s*:/.test(src.slice(i + 1, i + 8))) key(src.slice(start, i));
        continue;
      }
      if (c === '{' || c === '(' || c === '[') { depth++; continue; }
      if (c === '}' || c === ')' || c === ']') { if (--depth === 0) break; continue; }
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?=\s*:)/.exec(src.slice(i, i + 64));
      if (m && /[{,\s]/.test(src[i - 1])) { key(m[0]); i += m[0].length - 1; }
      else if (/[A-Za-z0-9_$]/.test(c)) { while (/[A-Za-z0-9_$]/.test(src[i + 1])) i++; }
    }
    expect(langs).toEqual(Object.keys(STRINGS));
    expect(langs).toEqual(expect.arrayContaining(['en', 'ro']));
    expect(dupes).toEqual([]);
  });

  test('the Learn cheat sheet follows the interface language', async ({ app, page }) => {
    await app.open();
    await page.evaluate(() => { window.__etude.setLang('de'); window.__etude.show('learn'); });
    await expect(page.locator('#view-learn .lsum dl')).toContainText('Oktave');
    await expect(page.locator('#view-learn .lsum dl')).not.toContainText('semitones');
  });
});

test.describe('Today counters', () => {
  // Seeds an established learner: `seen` concepts reviewed, none due today, `newToday` new ones met today.
  const seed = (page, { seen, newToday, day = 0 }) => page.evaluate(({ seen, newToday, day }) => {
    const tn = window.__etude.todayN() + day;
    window.__etude.data.srs = {};
    window.__etude.ITEMS.slice(0, seen).forEach(it => { window.__etude.data.srs[it.id] = { box: 2, ease: 2.3, reps: 2, lapses: 0, due: window.__etude.todayN() + 2, last: tn }; });
    Object.assign(window.__etude.data, { lastActive: tn, todayDay: tn, todayCount: newToday, newToday, totalReviews: seen, totalCorrect: seen, placed: true });
    window.__etude.data.settings.goal = 12; window.__etude.data.settings.newPerDay = 5;
    window.__etude.refreshToday();
  }, { seen, newToday, day });

  test('quota used up: "New today" is 0, caught-up state shows, and the session adds nothing new', async ({ app }) => {
    const page = await app.open();
    await seed(page, { seen: 20, newToday: 5 });
    await expect(page.locator('#c-new')).toHaveText('0');
    await expect(page.locator('#c-due')).toHaveText('0');
    await expect(page.locator('#hero-title')).toHaveText('You’re all caught up');
    await expect(page.locator('#startBtn')).toHaveText('Practice anyway');
    await expect(page.locator('#nextup')).not.toContainText('Next up');
    expect(await page.evaluate(() => window.__etude.buildQueue().filter(q => window.__etude.isNew(q.it.id)).length)).toBe(0);
  });

  test('part of the quota used: "New today" shows what is left and matches the session', async ({ app }) => {
    const page = await app.open();
    await seed(page, { seen: 20, newToday: 2 });
    await expect(page.locator('#c-new')).toHaveText('3');
    await expect(page.locator('#startBtn')).toHaveText('Start session');
    expect(await page.evaluate(() => window.__etude.buildQueue().filter(q => window.__etude.isNew(q.it.id)).length)).toBe(3);
  });

  test('a new day restores the full quota', async ({ app }) => {
    const page = await app.open();
    await seed(page, { seen: 20, newToday: 5, day: -1 });
    await expect(page.locator('#c-new')).toHaveText('5');
  });
});

test.describe('Settings drawer and Help dialog', () => {
  test('closed overlays are out of the Tab order; opening focuses inside, closing restores focus', async ({ app }) => {
    const page = await app.open();
    for (const id of ['drawer', 'helpBox']) expect(await page.locator('#' + id).evaluate(el => el.inert)).toBe(true);

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawerClose')).toBeFocused();
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(false);
    await expect(page.locator('#drawer')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#drawer')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#drawer')).toHaveAttribute('aria-labelledby', 'drawerTitle');
    for (const selector of ['#skipLink', 'header', 'main', '#dock', 'details.osmd-lic', 'footer']) {
      expect(await page.locator(selector).evaluate(el => el.inert), selector).toBe(true);
    }
    // Tab cycles inside the open drawer instead of escaping to the page behind it.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('drawer').contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsBtn')).toBeFocused();
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(true);
    expect(await page.locator('main').evaluate(el => el.inert)).toBe(false);

    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpClose')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.getElementById('helpBox').contains(document.activeElement))).toBe(true);
    await page.locator('#helpClose').click();
    await expect(page.locator('#helpBtn')).toBeFocused();
  });

  test('with overlays closed, Tab never lands inside them', async ({ app }) => {
    const page = await app.open();
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => ['drawer', 'helpBox'].some(id => document.getElementById(id).contains(document.activeElement)));
      expect(inside).toBe(false);
    }
  });
});

test.describe('Navigation accessibility', () => {
  test('uses navigation semantics and moves focus to each destination', async ({ app }) => {
    const page = await app.open();
    expect(await page.locator('#nav').getAttribute('role')).toBeNull();

    await page.locator('#tools button[data-view="read"]').click();
    await expect(page.locator('#view-read h1')).toBeFocused();

    await page.evaluate(() => window.__etude.show('today'));
    await page.locator('#whyLink').click();
    await expect(page.locator('#view-method h1')).toBeFocused();

    await page.evaluate(() => window.__etude.show('learn'));
    await page.locator('#modeNav button[aria-current="page"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#view-learn h1')).toBeFocused();
  });

  test('mobile menu follows its opener, focuses an option, and closes with Escape', async ({ app }) => {
    const page = await app.open();
    await page.setViewportSize({ width: 375, height: 700 });
    await page.locator('#menuBtn').click();
    await expect(page.locator('#mobileMenu button[aria-current="page"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#mobileMenu button').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#menuBtn')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#mobileMenu button[aria-current="page"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#greet-title')).toBeFocused();
  });

  test('Score & analysis is its own top-level Scores section, and old #analysis links still open it', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const scores = page.locator('#nav button[data-view="analysis"]'), practice = page.locator('#nav button[data-view="practice"]');
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
    await expect(scores).toHaveText('Scores');
    await expect(scores).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#nav button[aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('#modeBar')).toBeHidden();

    await practice.click();
    await expect(page).toHaveURL(/#practice$/);
    await expect(practice).toHaveAttribute('aria-current', 'page');
    await expect(scores).toHaveAttribute('aria-current', 'false');
    await expect(page.locator('#modeNav button')).toHaveText(['Exercises', 'Read', 'Sing']);

    await scores.click();
    await expect(page).toHaveURL(/#analysis$/);
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
    await expect(scores).toHaveAttribute('aria-current', 'page');

    await page.evaluate(() => window.__etude.setLang('ro'));
    await expect(scores).toHaveText('Partituri');
    await page.setViewportSize({ width: 375, height: 700 });
    await page.locator('#menuBtn').click();
    await expect(page.locator('#mobileMenu button[aria-current="page"]')).toHaveText('Partituri');
    await expect(page.locator('#mobileMenu button[aria-current="page"]')).toBeFocused();
    await page.locator('#mobileMenu button[data-view="practice"]').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    await page.locator('#menuBtn').click();
    await page.locator('#mobileMenu button[data-view="analysis"]').click();
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
  });

  // The header's state once the ResizeObserver refit has run: how far the settings button sits past the bar's padding,
  // and which of the tagline, section tabs and menu button are showing.
  const headerFit = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
    const bar = document.querySelector('header .bar'), shown = el => getComputedStyle(el).display !== 'none';
    const tabs = [...document.querySelectorAll('#nav button')].map(b => b.getBoundingClientRect());
    done({
      overflow: document.getElementById('settingsBtn').getBoundingClientRect().right - (bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight)),
      tag: shown(document.getElementById('brand-tag')),
      tabs: shown(document.getElementById('nav')),
      menu: shown(document.getElementById('menuBtn')),
      oneRow: new Set(tabs.map(r => Math.round(r.top))).size === 1 && new Set(tabs.map(r => Math.round(r.height))).size === 1,
      clearOfBrand: document.querySelector('.brand').getBoundingClientRect().right <= document.getElementById('nav').getBoundingClientRect().left,
    });
  }))));

  test('the header fits in every language above the menu breakpoint: the tagline goes first, then the tabs fold into the menu', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1000, height: 700 });
    await app.open();
    expect(await headerFit(page), 'English keeps its tagline and tabs').toMatchObject({ tag: true, tabs: true, menu: false });
    for (const width of [841, 1000]) {
      await page.setViewportSize({ width, height: 700 });
      for (const lang of Object.keys(STRINGS)) {
        await page.evaluate(lang => window.__etude.setLang(lang), lang);
        const fit = await headerFit(page), at = `${lang} at ${width}px`;
        expect(fit.overflow, at).toBeLessThanOrEqual(0.5);
        expect(fit.menu, at).toBe(!fit.tabs);
        if (fit.tag) expect(fit.tabs, `${at}: the tagline hides before the tabs fold`).toBe(true);
        if (fit.tabs) {
          expect(fit.oneRow, at).toBe(true);
          expect(fit.clearOfBrand, at).toBe(true);
        }
        if (lang === 'en') expect(fit.tabs, `${at}: English never folds`).toBe(true);
      }
    }
  });

  test('a long MIDI device name folds the section tabs into the menu instead of pushing the header off screen', async ({ app }) => {
    const page = app.page, name = 'Yamaha Clavinova CLP-795GP Digital Piano MIDI 1';
    await page.addInitScript(name => {
      const input = { id: 'clp', name, type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), sysexEnabled: false, onstatechange: null }) });
    }, name);
    await page.setViewportSize({ width: 900, height: 700 });
    await app.open();

    await page.locator('#midiChip').click();
    await expect(page.locator('#midiText')).toHaveText(name);
    const fit = await headerFit(page);
    expect(fit).toMatchObject({ tabs: false, menu: true });
    expect(fit.overflow).toBeLessThanOrEqual(0.5);
    await page.locator('#menuBtn').click();
    await expect(page.locator('#mobileMenu button')).toHaveText(['Today', 'Learn', 'Practice', 'Scores', 'Explore', 'Progress']);
    await page.keyboard.press('Escape');
    await expect(page.locator('#mobileMenu')).toBeHidden();

    await page.setViewportSize({ width: 1400, height: 800 });
    await expect(page.locator('#nav')).toBeVisible();
    await expect(page.locator('#menuBtn')).toBeHidden();
    expect((await headerFit(page)).overflow).toBeLessThanOrEqual(0.5);
  });

  test('skip link focuses main without changing the route, and supporting text stays readable on phones', async ({ app }) => {
    const page = await app.open();
    await page.locator('#skipLink').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await expect(page).toHaveURL(/etude\.html#today$/);

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 700 });
      for (const lang of ['en', 'ro']) {
        await page.evaluate(lang => window.__etude.setLang(lang), lang);
        const layout = await page.locator('#whyLink').evaluate(link => {
          const style = getComputedStyle(link), box = link.getBoundingClientRect();
          const probe = document.createElement('span');
          probe.style.color = 'var(--accent)';
          document.body.append(probe);
          const accent = getComputedStyle(probe).color;
          probe.remove();
          return { color: style.color, accent, whiteSpace: style.whiteSpace, width: box.width, height: box.height };
        });
        expect(layout.whiteSpace).toBe('nowrap');
        expect(layout.width).toBeGreaterThan(100);
        expect(layout.height).toBeLessThan(30);
        expect(layout.color).toBe(layout.accent);
      }
    }
  });
});

test.describe('Sight-singing without a microphone', () => {
  const denyMic = page => page.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });

  test('note-by-note: explains the problem and still accepts keyboard/MIDI notes', async ({ app, page }) => {
    await denyMic(page);
    await app.open({ hash: 'sing' });
    await page.locator('#si-mode button[data-v="note"]').click();
    await page.locator('#si-go').click();
    await expect(page.locator('#si-hint')).toContainText('Microphone unavailable');
    const before = await page.evaluate(() => window.__etude.sing.idx);
    await page.evaluate(() => { const m = window.__etude.ssCurNote().midi; window.__etude.handleNoteOn(m, 90, 'test'); window.__etude.handleNoteOff(m, 'test'); });
    expect(await page.evaluate(() => window.__etude.sing.idx)).toBe(before + 1);
  });

  test('free mode (microphone only): stops and shows an error instead of running silently', async ({ app, page }) => {
    await denyMic(page);
    await app.open({ hash: 'sing' });
    await page.locator('#si-mode button[data-v="free"]').click();
    await page.locator('#si-go').click();
    await expect(page.locator('#si-verdict')).toHaveText(/microphone/i);
    await expect(page.locator('#si-verdict')).toHaveClass(/\bbad\b/);
    expect(await page.evaluate(() => window.__etude.sing.active)).toBe(false);
  });

  test('a note flash from stopped playback does not erase the current-note marker of a new run', async ({ app, page }) => {
    await denyMic(page);
    await app.open({ hash: 'sing' });
    await page.locator('#si-mode button[data-v="note"]').click();
    // Listen → a note is flashing → Stop → start note-by-note on the same note within the flash window.
    await page.evaluate(() => { window.__etude.ssFlash(0); window.__etude.singStopAll(); window.__etude.singGo(); });
    await expect(page.locator('#si-staff .ss-n[data-i="0"]')).toHaveAttribute('data-s', 'now');
    await page.waitForTimeout(400);
    await expect(page.locator('#si-staff .ss-n[data-i="0"]')).toHaveAttribute('data-s', 'now');
  });

  test('a perfect result uses the styled success verdict', async ({ app }) => {
    const page = await app.open({ hash: 'sing' });
    await page.locator('#si-mode button[data-v="note"]').click();
    await page.locator('#si-go').click();
    await page.evaluate(() => { while (window.__etude.sing.active && window.__etude.ssCurNote()) { const m = window.__etude.ssCurNote().midi; window.__etude.handleNoteOn(m, 90, 'test'); window.__etude.handleNoteOff(m, 'test'); } });
    await expect(page.locator('#si-verdict')).toHaveClass(/\bgood\b/);
  });
});

test.describe('MusicXML import', () => {
  const xml = body => `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`;
  const parse = (page, src) => page.evaluate(src => {
    try { const r = window.__etude.scoreXmlNotes(new DOMParser().parseFromString(src, 'application/xml')); return { ok: true, notes: r.notes.length, tempos: r.tempos }; }
    catch (e) { return { ok: false, code: e.code }; }
  }, src);
  const note = (d = '4') => `<note><pitch><step>C</step><octave>4</octave></pitch><duration>${d}</duration></note>`;
  const attrs = (beats = '4', type = '4') => `<attributes><divisions>4</divisions><time><beats>${beats}</beats><beat-type>${type}</beat-type></time></attributes>`;

  test('a valid score parses', async ({ app }) => {
    const page = await app.open();
    expect(await parse(page, xml(`<measure number="1">${attrs()}${note()}${note()}${note()}${note()}</measure>`))).toMatchObject({ ok: true, notes: 4 });
  });

  test('a non-numeric duration is rejected instead of producing NaN timings', async ({ app }) => {
    const page = await app.open();
    expect(await parse(page, xml(`<measure number="1">${attrs()}${note('x')}${note()}</measure>`))).toEqual({ ok: false, code: 'xml' });
  });

  test('a negative time signature is rejected', async ({ app }) => {
    const page = await app.open();
    expect(await parse(page, xml(`<measure number="1">${attrs('-3')}${note()}</measure>`))).toEqual({ ok: false, code: 'xml' });
  });

  test('a tempo mark with a negative offset is clamped to the start', async ({ app }) => {
    const page = await app.open();
    const r = await parse(page, xml(`<measure number="1">${attrs()}<direction><offset>-99999</offset><sound tempo="90"/></direction>${note()}</measure>`));
    expect(r.ok).toBe(true);
    expect(r.tempos).toEqual([{ beat: 0, bpm: 90 }]);
  });
});

test('MusicXML unisons in different voices retain separate selectable noteheads', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const note = (staff, voice) => `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>${voice}</voice><type>whole</type><staff>${staff}</staff></note>`;
  const src = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' + note(1, 1) + '<backup><duration>4</duration></backup>' + note(2, 5) + '</measure></part></score-partwise>';
  await page.locator('#an-file').setInputFiles({ name: 'unisons.musicxml', mimeType: 'application/xml', buffer: Buffer.from(src) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  expect(await page.evaluate(() => ({ notes: window.__etude.AN.notes.length, bindings: window.__etude.SCORE.heads.size, distinct: new Set([...window.__etude.SCORE.heads.values()].flat()).size }))).toEqual({ notes: 2, bindings: 2, distinct: 2 });
});

test('MusicXML tied continuation keeps its voice identity beside a new unison onset', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const half = (voice, tie = '') => `<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration>${tie ? `<tie type="${tie}"/>` : ''}<voice>${voice}</voice><type>half</type><stem>${voice === 1 ? 'up' : 'down'}</stem>${tie ? `<notations><tied type="${tie}"/></notations>` : ''}</note>`;
  const src = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
    half(1, 'start') + half(1, 'stop') + '<backup><duration>4</duration></backup><note><rest/><duration>2</duration><voice>2</voice><type>half</type></note>' + half(2) + '</measure></part></score-partwise>';
  await page.locator('#an-file').setInputFiles({ name: 'voice-continuation.musicxml', mimeType: 'application/xml', buffer: Buffer.from(src) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  const rows = await page.evaluate(() => {
    const rows = [];
    window.__etude.SCORE.engine.forEachRenderedNote(({ part, staff, voice, midi, beat, element }) => {
      const source = { part, staff, voice, midi, beat };
      const index = element.dataset.i !== undefined ? Number(element.dataset.i) : null, n = window.__etude.AN.notes[index];
      rows.push({ source, index, bound: n ? { part: n.part, staff: n.staff, voice: n.voice, midi: n.midi, start: n.start, end: n.end } : null });
    });
    return rows;
  });
  expect(rows.map(r => r.source)).toEqual([
    { part: 0, staff: 1, voice: 1, midi: 60, beat: 0 },
    { part: 0, staff: 1, voice: 1, midi: 60, beat: 2 },
    { part: 0, staff: 1, voice: 2, midi: 60, beat: 2 }
  ]);
  for (const { source, index, bound } of rows) {
    expect(bound, `source graphical note ${JSON.stringify(source)}`).toEqual({ part: source.part, staff: source.staff, voice: source.voice, midi: source.midi,
      start: source.voice === 1 ? 0 : 2, end: 4 });
    expect(index).toBe(source.voice - 1);
    expect(bound.start).toBeLessThanOrEqual(source.beat);
    expect(bound.end).toBeGreaterThan(source.beat);
  }
});

test.describe('MusicXML rest explanations', () => {
  const rest = (type, duration, extra = '', attrs = '') => `<note ${attrs}><rest${type === 'measure' ? ' measure="yes"' : ''}/><duration>${duration}</duration><voice>1</voice>${type === 'measure' ? '' : `<type>${type}</type>`}${extra}</note>`;
  const xml = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' +
    '<measure number="1"><attributes><divisions>8</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
    rest('quarter', 8) + rest('eighth', 4) + rest('16th', 2) + rest('eighth', 6, '<dot/>') + rest('quarter', 8, '', 'print-object="no"') +
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>eighth</type></note></measure>' +
    '<measure number="2">' + rest('measure', 32) + '</measure></part></score-partwise>';
  for (const [lang, names] of [['en', ['Quarter rest', 'Eighth rest', 'Sixteenth rest', 'Dotted eighth rest', 'Whole-measure rest']], ['ro', ['Pauză de pătrime', 'Pauză de optime', 'Pauză de șaisprezecime', 'Pauză de optime cu punct', 'Pauză de măsură']]]) {
    test(`visible rests have accessible hover and keyboard explanations (${lang})`, async ({ app }) => {
      const page = await app.open({ hash: 'analysis', lang });
      await page.locator('#an-file').setInputFiles({ name: 'rests.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
      await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.engine && !!window.__etude.SCORE.geo);
      const labels = await page.evaluate(() => window.__etude.SCORE.syms.filter(s => s.kind === 'rest').map(s => s.el.getAttribute('aria-label')));
      expect(labels).toHaveLength(5); // hidden rests must not be announced
      for (const name of names) expect(labels.some(s => s.startsWith(name))).toBe(true);
      const pause = page.locator('#an-roll [data-sym]').filter({ has: page.locator('path') }).and(page.getByLabel(new RegExp('^' + names[2])));
      await pause.hover();
      await expect(page.locator('#an-hover')).toContainText(names[2]);
      await expect(page.locator('#an-roll .sc-tip')).toContainText(names[2]);
      await pause.focus();
      await expect(page.locator('#an-hover')).toContainText(names[2]);
      expect(await page.evaluate(() => window.__etude.AN.notes.map(n => n.midi))).toEqual([72]); // rests never enter playback or chord analysis
      await page.evaluate(() => { window.__etude.SCORE.look = 'night'; window.__etude.scoreLayout(); });
      expect(await page.evaluate(() => window.__etude.SCORE.syms.filter(s => s.kind === 'rest').length)).toBe(5);
    });
  }
});

test.describe('MusicXML pedal collision regression', () => {
  test('pedals search note-side slots without migrating from their musical owner', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const result = await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400"><rect class="vf-notehead" x="100" y="70" width="20" height="180"/><g class="vf-sc-pedal"><path d="M100 80 h20 v12 h-20 Z"/></g></svg>';
      const sys = { PositionAndShape: { AbsolutePosition: { x: 0, y: 2 } }, StaffLines: [] };
      const next = { PositionAndShape: { AbsolutePosition: { x: 0, y: 18 } } };
      sys.Parent = { MusicSystems: [sys, next] };
      const line = { ParentMusicSystem: sys, PositionAndShape: { AbsolutePosition: { x: 0, y: 2 } } };
      sys.StaffLines.push(line);
      box.querySelector('g').scPedalOwner = { staffLine: line, pedal: {} };
      window.__etude.scoreFixPedals(box);
      const svg = box.querySelector('svg'), r = box.querySelector('path').getBoundingClientRect(), point = window.__etude.scoreToUser(svg, r.left, r.top);
      return { x: point.x, y: point.y };
    });
    expect(result.y).toBeLessThan(180);
    expect(Math.abs(result.y - 80)).toBeLessThanOrEqual(40);
    expect(result.x).not.toBe(100);
  });
  test('a pedal remains near its source measure rather than taking a distant side slot', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const x = await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect class="vf-notehead" x="80" y="70" width="100" height="30"/><g class="vf-sc-pedal"><path d="M145 80 h20 v12 h-20 Z"/></g></svg>';
      const sys = { PositionAndShape: { AbsolutePosition: { x: 0, y: 2 } } }, line = { ParentMusicSystem: sys };
      const m = { ParentStaffLine: line, PositionAndShape: { AbsolutePosition: { x: 10, y: 2 }, Size: { width: 4 } } };
      box.querySelector('g').scPedalOwner = { staffLine: line, pedal: { startVfVoiceEntry: { parentStaffEntry: { parentMeasure: m } } } };
      window.__etude.scoreFixPedals(box);
      const svg = box.querySelector('svg'), r = box.querySelector('.vf-sc-pedal path').getBoundingClientRect();
      return window.__etude.scoreToUser(svg, r.left, r.top).x;
    });
    expect(x).toBeLessThanOrEqual(180);
  });
  test('a fully occupied page explicitly fails instead of retaining an overflowing pedal', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const warnings = [];
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    const result = await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect class="vf-notehead" width="200" height="100"/><g class="vf-sc-pedal"><path d="M100 90 h20 v12 h-20 Z"/></g></svg>';
      const status = window.__etude.scoreFixPedals(box);
      return { status, unresolved: box.dataset.pedalUnresolved, hidden: box.querySelector('path').style.visibility, reason: box.querySelector('path').dataset.pedalUnresolved };
    });
    expect(result).toEqual({ status: false, unresolved: '1', hidden: 'hidden', reason: 'no-safe-slot' });
    expect(warnings.some(w => w.includes('pedal') && w.includes('no-safe-slot'))).toBe(true);
  });
  test('an unresolved pedal makes rendering fail explicitly with the existing score error', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.locator('#an-file').setInputFiles({ name: 'bach-pedal.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: readFileSync(new URL('../fixtures/bach-pedal.mxl', import.meta.url)) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const result = await page.evaluate(async () => {
      const repair = window.__etude.scoreFixPedals;
      window.__etude.scoreFixPedals = box => {
        for (const svg of box.querySelectorAll('svg')) {
          const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          r.setAttribute('class', 'vf-notehead'); r.setAttribute('width', '100000'); r.setAttribute('height', '100000'); svg.appendChild(r);
        }
        return repair(box);
      };
      try { return { ok: await window.__etude.scoreRender(), error: window.__etude.AN.error?.k, loading: window.__etude.AN.loading, unresolved: +window.__etude.$('an-roll').dataset.pedalUnresolved }; }
      finally { window.__etude.scoreFixPedals = repair; }
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('an_err_render');
    expect(result.loading).toBe(false);
    expect(result.unresolved).toBeGreaterThan(0);
  });
  test('pedal audit detects beam and zero-height ledger ink, page/system escape and missing glyphs', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const kinds = [];
    for (const fixture of ['beam', 'ledgers', 'page', 'system', 'missing']) {
      await page.evaluate(kind => {
        const box = window.__etude.$('an-roll');
        window.__etude.SCORE.xml = '<score-partwise><pedal type="start"/></score-partwise>';
        const ink = kind === 'beam' ? '<rect class="vf-beam" x="100" y="80" width="20" height="8"/>' : kind === 'ledgers' ? '<g class="vf-ledgers"><path d="M95 85 H125" stroke="black" stroke-width="1"/></g>' : '';
        const y = kind === 'page' ? 395 : kind === 'system' ? 250 : 80;
        box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">${ink}${kind === 'missing' ? '' : `<g class="vf-sc-pedal"><path d="M100 ${y} h20 v12 h-20 Z"/></g>`}</svg>`;
        if (kind !== 'missing') {
          const sys = { PositionAndShape: { AbsolutePosition: { x: 0, y: 2 } } }, next = { PositionAndShape: { AbsolutePosition: { x: 0, y: 18 } } };
          sys.Parent = { MusicSystems: [sys, next] };
          box.querySelector('g.vf-sc-pedal').scPedalOwner = { staffLine: { ParentMusicSystem: sys }, pedal: {} };
        }
      }, fixture);
      kinds.push((await page.evaluate(scorePedalCollisions)).map(x => x.kind));
    }
    expect(kinds[0]).toContain('vf-beam');
    expect(kinds[1]).toContain('vf-ledgers');
    expect(kinds[2]).toContain('page');
    expect(kinds[3]).toContain('system');
    expect(kinds[4]).toContain('missing-pedals');
  });
  test('pedal audit rejects in-system drift and a wrong source-measure fragment', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><g class="vf-sc-pedal"><path data-pedal-base-transform="" transform="translate(0 50)" d="M200 80 h20 v12 h-20 Z"/></g></svg>';
      const sys = { PositionAndShape: { AbsolutePosition: { x: 0, y: 2 } } }, line = { ParentMusicSystem: sys };
      const m = { ParentStaffLine: line, PositionAndShape: { AbsolutePosition: { x: 2, y: 2 }, Size: { width: 4 } } };
      line.Measures = [m];
      // Endpoint belongs to a different system: the visible fragment must still be checked.
      box.querySelector('g').scPedalOwner = { staffLine: line, pedal: { startVfVoiceEntry: { parentStaffEntry: { parentMeasure: { ParentStaffLine: { ParentMusicSystem: {} } } } } } };
    });
    const kinds = (await page.evaluate(scorePedalCollisions)).map(x => x.kind);
    expect(kinds).toContain('migration');
    expect(kinds).toContain('measure');
  });
  test('a distant curved tie does not occupy its empty bounding-box interior', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      window.__etude.SCORE.xml = '<score-partwise><pedal type="start"/></score-partwise>';
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="180"><path class="sc-xline" d="M0 0 Q100 320 200 0 Q100 310 0 0 Z"/><g class="vf-sc-pedal"><path d="M100 80 h20 v12 h-20 Z"/></g></svg>';
      window.__etude.scoreFixPedals(box);
    });
    expect(await page.locator('.vf-sc-pedal path').evaluate(p => p.dataset.pedalUnresolved || p.getAttribute('transform'))).toBeNull();
    expect((await page.evaluate(scorePedalCollisions)).filter(x => x.kind === 'sc-xline')).toEqual([]);
  });
  test('pedal repair clears zero-height ledger strokes', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const dy = await page.evaluate(() => {
      const box = window.__etude.$('an-roll');
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160"><g class="vf-ledgers"><path d="M60 85 H160" stroke="black" stroke-width="1"/></g><g class="vf-sc-pedal"><path d="M100 80 h20 v12 h-20 Z"/></g></svg>';
      window.__etude.scoreFixPedals(box);
      return box.querySelector('.vf-sc-pedal path').getAttribute('transform');
    });
    expect(dy).not.toBeNull();
  });
  test('pedal collision repair stays inside the page using nearby side or upper free slots', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const result = await page.evaluate(() => [ [100, 20], [60, 100] ].map(([x, width]) => { const box = window.__etude.$('an-roll'); box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect class="vf-notehead" x="${x}" y="75" width="${width}" height="20"/><g class="vf-sc-pedal"><path d="M100 76 h20 v12 h-20 Z"/></g></svg>`; window.__etude.scoreFixPedals(box); const svg = box.querySelector('svg').getBoundingClientRect(), pedal = box.querySelector('path').getBoundingClientRect(), note = box.querySelector('rect').getBoundingClientRect(); return { inside: pedal.bottom <= svg.bottom && pedal.top >= svg.top, overlap: Math.min(pedal.right, note.right) > Math.max(pedal.left, note.left) && Math.min(pedal.bottom, note.bottom) > Math.max(pedal.top, note.top) }; }));
    expect(result).toEqual([{ inside: true, overlap: false }, { inside: true, overlap: false }]);
  });
  test('Moonlight overlapping text and line gestures retain all source events without collisions', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.locator('#an-file').setInputFiles({ name: 'moonlight-pedal.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: readFileSync(new URL('../fixtures/moonlight-pedal.mxl', import.meta.url)) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const events = await page.evaluate(() => [...new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml').querySelectorAll('pedal')].map(p => [p.closest('direction').querySelector('staff').textContent, p.getAttribute('type')]));
    expect(events).toEqual([['1', 'start'], ['1', 'stop'], ['2', 'start'], ['2', 'stop']]);
    expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
    const collisionCount = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#an-roll .vf-sc-pedal path')].map(p => p.getBoundingClientRect());
      return boxes.flatMap((r, i) => boxes.slice(i + 1).filter(q => Math.min(r.right, q.right) - Math.max(r.left, q.left) > .8 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > .8)).length;
    });
    expect(collisionCount).toBe(0);
  });
  test('Bach pedal signs clear low ledger notes on every layout', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.locator('#an-file').setInputFiles({ name: 'bach-pedal.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: readFileSync(new URL('../fixtures/bach-pedal.mxl', import.meta.url)) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
    const stable = await page.evaluate(() => { const values = () => [...document.querySelectorAll('#an-roll .vf-sc-pedal path')].map(p => p.getAttribute('transform')); const before = values(); window.__etude.scoreFixPedals(window.__etude.$('an-roll')); return { before, after: values() }; });
    expect(stable.after).toEqual(stable.before);
    for (const layout of ['cont', 'page']) {
      await page.evaluate(layout => { window.__etude.SCORE.layout = layout; window.__etude.SCORE.look = 'night'; window.__etude.scoreLayout(); }, layout);
      expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
    }
    await page.setViewportSize({ width: 700, height: 900 });
    await page.evaluate(() => window.__etude.scoreLayout());
    expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
    const label = page.locator('#an-roll [data-sym]').and(page.getByLabel(/^Ped\./)).first();
    // The resize also reaches the stage's ResizeObserver, which may lay the score out once more after the call above
    // and move the label; measure it again and re-hover until the hint shows.
    await expect(async () => {
      await label.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const rect = await label.boundingBox();
      await page.mouse.move(0, 0);
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await expect(page.locator('#an-hover')).toContainText('press the sustain', { timeout: 1000 });
    }).toPass();
    await label.focus();
    await expect(page.locator('#an-hover')).toContainText('press the sustain');
  });
});

test.describe('MusicXML source layout fidelity', () => {
  const header = '<work><work-title>Source layout</work-title></work><identification><creator type="composer">Test Composer(1770–1827)</creator></identification>' +
    '<credit page="1"><credit-type>composer</credit-type><credit-words justify="right">Test Composer\n</credit-words><credit-words>(1770–1827)\n</credit-words></credit>';
  const defaults = '<defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling><page-layout><page-height>1697</page-height><page-width>1200</page-width><page-margins type="both"><left-margin>85</left-margin><right-margin>85</right-margin><top-margin>85</top-margin><bottom-margin>85</bottom-margin></page-margins></page-layout></defaults>';
  const q = '<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>';
  const measure = (n, print = '', bars = '') => `<measure number="${n}">${print}${n === 1 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' : ''}${q.repeat(4)}<backup><duration>4</duration></backup><note><rest measure="yes"/><duration>4</duration><voice>2</voice><staff>2</staff></note>${bars}</measure>`;
  const wrap = (bars, meta = '') => `<?xml version="1.0"?><score-partwise>${meta}<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${bars}</part></score-partwise>`;
  const load = async (page, xml) => {
    await page.locator('#an-file').setInputFiles({ name: 'layout.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.engine && !!window.__etude.SCORE.geo);
  };
  test('composer credits retain their original line breaks without duplicate metadata', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await load(page, wrap(measure(1), header));
    const lines = await page.evaluate(() => window.__etude.SCORE.engine.readLayout().graphicSheet.composer.SVGNode.textContent);
    expect(lines).toContain('Test Composer');
    expect(await page.locator('#an-roll svg text').allTextContents()).toEqual(expect.arrayContaining(['Test Composer', '(1770–1827)']));
    expect((await page.locator('#an-roll svg text').allTextContents()).filter(s => s === 'Test Composer')).toHaveLength(1);
  });
  test('an unclosed ending stops before a new repeated section, without changing explicit endings', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const start = '<barline location="left"><ending number="2" type="start"/></barline>', next = '<barline location="left"><repeat direction="forward"/></barline>';
    const tidy = src => page.evaluate(src => { const doc = new DOMParser().parseFromString(src, 'application/xml'); window.__etude.anXmlTidy(doc, 'Test'); return [...doc.querySelectorAll('ending')].map(e => [e.closest('measure').getAttribute('number'), e.getAttribute('number'), e.getAttribute('type')]); }, src);
    expect(await tidy(wrap(measure(1, '', start) + measure(2, '', next)))).toEqual([['1', '2', 'start'], ['1', '2', 'discontinue']]);
    const stop = '<barline location="right"><ending number="2" type="discontinue"/></barline>';
    expect(await tidy(wrap(measure(1, '', start) + measure(2, '', next + stop)))).toEqual([['1', '2', 'start'], ['2', '2', 'discontinue']]);
    expect(await tidy(wrap(measure(1, '', start) + measure(2, '', stop)))).toEqual([['1', '2', 'start'], ['2', '2', 'discontinue']]);
  });
  test('ending repair reuses implicit and explicit right barlines before backward repeats', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const start = '<barline location="left"><ending number="2" type="start"/></barline>', next = '<barline location="left"><repeat direction="forward"/></barline>';
    for (const location of [' location="right"', '']) {
      const src = wrap(measure(1, '', start + `<barline${location}><bar-style>light-heavy</bar-style><repeat direction="backward" times="2"/></barline>`) + measure(2, '', next));
      const bars = await page.evaluate(src => {
        const doc = new DOMParser().parseFromString(src, 'application/xml');
        window.__etude.anXmlTidy(doc, 'Test');
        return [...doc.querySelector('measure').querySelectorAll(':scope > barline[location="right"], :scope > barline:not([location])')].map(bar => ({
          location: bar.getAttribute('location'),
          children: [...bar.children].map(el => ({ name: el.localName, text: el.textContent, attrs: [...el.attributes].map(a => [a.name, a.value]) })),
        }));
      }, src);
      expect(bars).toEqual([{
        location: location ? 'right' : null,
        children: [
          { name: 'bar-style', text: 'light-heavy', attrs: [] },
          { name: 'ending', text: '', attrs: [['number', '2'], ['type', 'discontinue']] },
          { name: 'repeat', text: '', attrs: [['direction', 'backward'], ['times', '2']] },
        ],
      }]);
    }
  });
  test('Für Elise keeps the source page boundaries instead of creating orphan pages', async ({ app }) => {
    const page = await app.open({ hash: 'analysis', lang: 'ro' });
    await page.locator('#an-file').setInputFiles({ name: 'fur-elise-beethoven.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: readFileSync(new URL('../fixtures/fur-elise-beethoven.mxl', import.meta.url)) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const result = await page.evaluate(() => ({
      pages: window.__etude.SCORE.engine.readLayout().graphicSheet.MusicPages.map(p => p.MusicSystems.map(s => s.GraphicalMeasures[0][0].parentSourceMeasure.MeasureNumberXML)),
      rests: window.__etude.SCORE.syms.filter(s => s.kind === 'rest').length,
      ending: new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml').querySelector('measure[number="9"] ending[type="discontinue"]')?.getAttribute('number'),
    }));
    expect(result.pages).toEqual([[0, 7, 14, 20, 26, 32], [36, 42, 48, 54, 60, 66, 72], [79, 83, 88, 95, 101]]);
    expect(result.rests).toBe(202);
    expect(result.ending).toBe('2');
  });
  test('source title typography keeps printed sizes and mixed italic runs', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await page.locator('#an-file').setInputFiles({ name: 'fur-elise-beethoven.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: readFileSync(new URL('../fixtures/fur-elise-beethoven.mxl', import.meta.url)) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const typography = () => page.evaluate(() => {
      const gs = window.__etude.SCORE.engine.readLayout().graphicSheet, text = node => node.localName === 'text' ? node : node.querySelector('text');
      const title = text(gs.title.SVGNode), subtitle = text(gs.subtitle.SVGNode);
      return { titlePx: parseFloat(getComputedStyle(title).fontSize) * title.getScreenCTM().d, subtitlePx: parseFloat(getComputedStyle(subtitle).fontSize) * subtitle.getScreenCTM().d, runs: [...title.querySelectorAll('tspan')].map(s => [s.textContent, s.getAttribute('font-style')]) };
    });
    const before = await typography();
    expect(before.titlePx).toBeCloseTo(22 * 96 / 72, 1);
    expect(before.subtitlePx).toBeCloseTo(16 * 96 / 72, 1);
    expect(before.runs).toEqual([['Für Elise', 'italic'], [' in A Minor', 'normal']]);
    await page.evaluate(() => { window.__etude.SCORE.look = 'night'; window.__etude.scoreLayout(); });
    expect(await typography()).toEqual(before);
  });
  test('varying source spacing supplies a minimum instead of imposing the first system on every page', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const print = (staff, system) => `<print><staff-layout number="2"><staff-distance>${staff}</staff-distance></staff-layout><system-layout><system-distance>${system}</system-distance></system-layout></print>`;
    const xml = wrap(measure(1, print(100, 180)) + measure(2, print(65, 85)), defaults);
    const hints = await page.evaluate(xml => { const hints = window.__etude.scoreXmlLayout(new DOMParser().parseFromString(xml, 'application/xml')); return { staff: hints.staffGap, system: hints.systemGap }; }, xml);
    expect(hints).toEqual({ staff: 6.5, system: 8.5 });
  });
  test('page view respects source staff size, margins, and staff gap across resize', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const print = '<print><staff-layout number="2"><staff-distance>41.9</staff-distance></staff-layout></print>';
    await load(page, wrap(measure(1, print) + measure(2, '<print new-system="yes"/>'), defaults));
    const geometry = () => page.evaluate(() => { const e = window.__etude.SCORE.engine, layout = e.readLayout(), s = layout.graphicSheet.MusicPages[0].MusicSystems[0]; return { zoom: e.getZoom(), width: window.__etude.$('an-roll').querySelector('.an-sheet').clientWidth, margin: e.readRules().PageLeftMargin, staffGap: s.StaffLines[1].PositionAndShape.AbsolutePosition.y - s.StaffLines[0].PositionAndShape.AbsolutePosition.y - 4, systems: layout.graphicSheet.MusicPages.flatMap(p => p.MusicSystems.map(s => s.GraphicalMeasures.map(m => m[0].parentSourceMeasure.MeasureNumberXML))) }; });
    const before = await geometry();
    expect(before.zoom / before.width).toBeCloseTo(1 / 1200, 6);
    expect(before.margin).toBeCloseTo(8.5, 3);
    expect(before.staffGap).toBeLessThan(4.7);
    expect(before.systems).toEqual([[1], [2]]);
    await page.setViewportSize({ width: 700, height: 900 });
    await page.evaluate(() => window.__etude.scoreLayout());
    const after = await geometry();
    expect(after.zoom / after.width).toBeCloseTo(before.zoom / before.width, 6);
    expect(after.systems).toEqual(before.systems);
  });
});

test.describe('MusicXML expression and engraving', () => {
  const q = (step, octave, extra = '') => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>${extra}</note>`;
  const whole = (step, chord = '') => `<note>${chord}<pitch><step>${step}</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff><notations><arpeggiate/></notations></note>`;
  const dyn = mark => `<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type><staff>1</staff></direction>`;
  // One piano bar: p, a grace note before C5, a staccato D5, f on F5, the pedal pressed and never released, and a rolled C3–G3 in the left hand.
  const EXPRESSIVE = '<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">' +
    '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>' +
    '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
    dyn('p') + '<direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>2</staff></direction>' +
    '<note><grace/><pitch><step>B</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type><staff>1</staff></note>' +
    q('C', 5) + q('D', 5, '<notations><articulations><staccato/></articulations></notations>') + q('E', 5) + dyn('f') + q('F', 5) +
    '<backup><duration>4</duration></backup>' + whole('C') + whole('G', '<chord/>') + '</measure></part></score-partwise>';

  test('dynamics, articulation, grace notes, arpeggios and the pedal shape each note', async ({ app }) => {
    const page = await app.open();
    const notes = await page.evaluate(src => window.__etude.scoreXmlNotes(new DOMParser().parseFromString(src, 'application/xml')).notes
      .map(n => ({ midi: n.midi, vel: n.vel, soundRatio: n.soundRatio, graces: n.graces?.map(g => g.midi), roll: n.roll, pedalEnd: n.pedalEnd })), EXPRESSIVE);
    expect(notes.map(n => n.midi)).toEqual([48, 55, 72, 74, 76, 77]);
    const at = Object.fromEntries(notes.map(n => [n.midi, n]));
    expect(at[72].vel).toBeLessThan(at[77].vel);   // p, then f
    expect(at[48].vel).toBeLessThan(at[72].vel);   // the left-hand accompaniment sits under the melody
    expect([at[72].soundRatio, at[74].soundRatio]).toEqual([1, 0.45]);
    expect(at[72].graces).toEqual([71]);
    expect([at[48].roll, at[55].roll]).toEqual([0, 0.022]);
    expect(notes.every(n => n.pedalEnd === 4)).toBe(true);   // a pedal left down holds to the end of the part
  });

  test('multi-part grand staff scores assign hands and companion dynamics across braced parts', async ({ app }) => {
    const page = await app.open();
    const TWO_PART_SCORE = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<score-partwise version="3.1">' +
      '<part-list>' +
      '  <part-group number="1" type="start"><group-symbol>brace</group-symbol></part-group>' +
      '  <score-part id="P1"><part-name>Right Hand</part-name></score-part>' +
      '  <score-part id="P2"><part-name>Left Hand</part-name></score-part>' +
      '  <part-group number="1" type="stop"/>' +
      '</part-list>' +
      '<part id="P1">' +
      '  <measure number="1">' +
      '    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
      '    <direction placement="below"><direction-type><dynamics><mp/></dynamics></direction-type></direction>' +
      '    <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>' +
      '  </measure>' +
      '</part>' +
      '<part id="P2">' +
      '  <measure number="1">' +
      '    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>' +
      '    <note><pitch><step>D</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>' +
      '  </measure>' +
      '</part>' +
      '</score-partwise>';

    const evaluation = await page.evaluate(src => {
      const doc = new DOMParser().parseFromString(src, 'application/xml');
      const res = window.__etude.scoreXmlNotes(doc);
      const rhNote = res.notes.find(n => n.midi === 76);
      const lhNote = res.notes.find(n => n.midi === 63);
      const anHandRh = window.__etude.anHandOf(rhNote);
      const anHandLh = window.__etude.anHandOf(lhNote);
      window.__etude.PRAC.hands = 'rh';
      const mineUnderRh = window.__etude.pracMine(lhNote);
      window.__etude.PRAC.hands = 'lh';
      const mineUnderLh = window.__etude.pracMine(lhNote);
      return {
        rhNote: { midi: rhNote.midi, hand: rhNote.hand, vel: rhNote.vel, anHand: anHandRh },
        lhNote: { midi: lhNote.midi, hand: lhNote.hand, vel: lhNote.vel, anHand: anHandLh, mineUnderRh, mineUnderLh },
      };
    }, TWO_PART_SCORE);

    expect(evaluation.rhNote.hand).toBe('rh');
    expect(evaluation.lhNote.hand).toBe('lh');
    expect(evaluation.lhNote.anHand).toBe('lh');
    expect(evaluation.lhNote.mineUnderRh).toBe(false);
    expect(evaluation.lhNote.mineUnderLh).toBe(true);
    expect(evaluation.lhNote.vel).toBeLessThan(evaluation.rhNote.vel);
  });

  test('sur-le-fil-yann-tiersen.mxl classifies high-register left hand notes as left hand', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const mxlBuffer = readFileSync(new URL('../fixtures/sur-le-fil-yann-tiersen.mxl', import.meta.url));
    const token = await page.evaluate(() => window.__etude.AN.loadToken);
    await page.locator('#an-file').setInputFiles({ name: 'sur-le-fil.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: mxlBuffer });
    await page.waitForFunction(t => window.__etude.AN.loadToken > t && !window.__etude.AN.loading && window.__etude.AN.notes.length > 50, token);

    const result = await page.evaluate(() => {
      const p1Notes = window.__etude.AN.notes.filter(n => n.part === 1);
      const highNotesInPart1 = p1Notes.filter(n => n.midi >= 60);
      window.__etude.PRAC.hands = 'lh';
      const allActiveUnderLh = highNotesInPart1.every(n => window.__etude.pracMine(n));
      window.__etude.PRAC.hands = 'rh';
      const allDimmedUnderRh = highNotesInPart1.every(n => !window.__etude.pracMine(n));
      return {
        totalPart1: p1Notes.length,
        totalHighInPart1: highNotesInPart1.length,
        allLh: p1Notes.every(n => n.hand === 'lh'),
        allActiveUnderLh,
        allDimmedUnderRh,
      };
    });

    expect(result.totalPart1).toBeGreaterThan(50);
    expect(result.totalHighInPart1).toBeGreaterThan(20);
    expect(result.allLh).toBe(true);
    expect(result.allActiveUnderLh).toBe(true);
    expect(result.allDimmedUnderRh).toBe(true);
  });

  test('playback sounds the grace note, the dynamics, the rolled chord and the pedal', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const token = await page.evaluate(() => window.__etude.AN.loadToken);
    await page.locator('#an-file').setInputFiles({ name: 'expressive.musicxml', mimeType: 'application/xml', buffer: Buffer.from(EXPRESSIVE) });
    await page.waitForFunction(token => window.__etude.AN.loadToken > token && !window.__etude.AN.loading && window.__etude.AN.notes.length === 6, token);
    await page.evaluate(() => {
      const real = window.__etude.previewNote;
      window.played = [];
      window.__etude.previewNote = (m, when, dur, vel, opt) => { played.push({ m, when, dur, vel, hold: !!opt?.hold }); return real(m, when, dur, vel, opt); };
      window.__etude.scoreToggle();
    });
    await expect.poll(() => page.evaluate(() => [...new Set(played.map(p => p.m))].sort((a, b) => a - b))).toEqual([48, 55, 71, 72, 74, 76, 77]);
    const r = await page.evaluate(() => {
      window.__etude.scoreStop();
      const at = m => played.find(p => p.m === m);
      return { grace: at(71), c5: at(72), f5: at(77), c3: at(48), g3: at(55), bar: (window.__etude.scoreSeconds(4) - window.__etude.scoreSeconds(0)) / window.__etude.pracFactor() };
    });
    expect(r.grace.when).toBeLessThan(r.c5.when);
    expect(r.f5.vel).toBeGreaterThan(r.c5.vel);
    expect(r.g3.when - r.c3.when).toBeCloseTo(0.022, 3);
    expect(r.c5.hold).toBe(true);
    expect(r.c5.dur).toBeCloseTo(r.bar, 3);   // the pedal sustains the first quarter to the end of the bar
  });

  test('a grace tied into the principal sounds once and sustains through the principal value', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const pitch = (step, alter = '') => `<pitch><step>${step}</step>${alter}<octave>4</octave></pitch>`;
    const src = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><grace/>' + pitch('C') + '<voice>1</voice><type>16th</type></note><note><grace/>' + pitch('F', '<alter>1</alter>') + '<tie type="start"/><voice>1</voice><type>16th</type></note><note>' + pitch('F', '<alter>1</alter>') + '<duration>4</duration><tie type="stop"/><voice>1</voice><type>whole</type></note></measure></part></score-partwise>';
    await page.locator('#an-file').setInputFiles({ name: 'grace-tie.musicxml', mimeType: 'application/xml', buffer: Buffer.from(src) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    await page.evaluate(() => { const real = window.__etude.previewNote; window.played = []; window.__etude.previewNote = (m, when, dur, ...rest) => { played.push({ m, when, dur }); return real(m, when, dur, ...rest); }; window.__etude.scoreToggle(); });
    await expect.poll(() => page.evaluate(() => played.length)).toBeGreaterThanOrEqual(2);
    const result = await page.evaluate(() => { window.__etude.scoreStop(); return { played, principal: window.__etude.AN.notes[0].midi, count: window.__etude.AN.notes.length, duration: window.__etude.scoreSeconds(4) - window.__etude.scoreSeconds(0) }; });
    expect(result.played.map(p => p.m)).toEqual([60, 66]);
    expect(result.played[1].dur).toBeGreaterThan(result.duration);
    expect(result).toMatchObject({ principal: 66, count: 1 });
  });
  test('private-font piano and forte words render readable dynamics without requiring MScore Text', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const src = '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="below"><direction-type><words font-family="MScore Text" font-style="italic">\uE522\uE520</words></direction-type></direction>' + q('C', 5) + q('D', 5) + q('E', 5) + q('F', 5) + '</measure></part></score-partwise>';
    await page.locator('#an-file').setInputFiles({ name: 'font-dynamics.musicxml', mimeType: 'application/xml', buffer: Buffer.from(src) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const result = await page.evaluate(() => { const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml'), word = doc.querySelector('words'); return { word: word.textContent, font: word.getAttribute('font-family'), svg: [...document.querySelectorAll('#an-roll svg text')].map(n => n.textContent).join('|') }; });
    expect(result.word).toBe('fp');
    expect(result.font).not.toBe('MScore Text');
    expect(result.svg).toContain('fp');
    expect(result.svg).not.toMatch(/[\uE520\uE522]/);
  });
  test('an imported score shows its own title and composer, text pedal marks and readable tempo glyphs; generated scores keep fixed bars', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const pedal = type => `<direction placement="below"><direction-type><pedal type="${type}" line="yes"/></direction-type></direction>`;
    const xml = '<?xml version="1.0"?><score-partwise version="3.1"><identification><creator type="composer">Test Composer</creator></identification>' +
      '<credit page="1"><credit-type>title</credit-type><credit-words font-size="22">Nocturne Test</credit-words></credit>' +
      '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">' +
      '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
      '<direction placement="above"><direction-type><words>Lento (\uECA5 = 60)</words></direction-type><sound tempo="60"/></direction>' +
      pedal('start') + q('C', 5) + q('D', 5) + pedal('change') + q('E', 5) + q('F', 5) + pedal('stop') + '</measure></part></score-partwise>';
    const token = await page.evaluate(() => window.__etude.AN.loadToken);
    await page.locator('#an-file').setInputFiles({ name: 'nocturne-file.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(token => window.__etude.AN.loadToken > token && !window.__etude.AN.loading && !!document.querySelector('#an-roll svg'), token);
    const r = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml');
      return {
        title: window.__etude.AN.source.title, fixed: window.__etude.SCORE.fixedWidth, svg: [...document.querySelectorAll('#an-roll svg text')].map(t => t.textContent).join('|'),
        pedals: [...doc.querySelectorAll('pedal')].map(p => [p.getAttribute('type'), p.getAttribute('line'), p.getAttribute('sign')].join(' ')),
        words: doc.querySelector('words').textContent,
      };
    });
    expect(r.title).toBe('Nocturne Test');
    expect(r.fixed).toBe(false);
    expect(r.svg).toContain('Nocturne Test');
    expect(r.svg).toContain('Test Composer');
    expect(r.svg).not.toContain('Piano');   // a lone piano part needs no instrument label
    expect(r.pedals).toEqual(['start no yes', 'stop no yes', 'start no yes', 'stop no yes']);   // "change" = release + press
    expect(r.words).toBe('Lento (\u2669 = 60)');
    expect(await page.evaluate(async () => { await window.__etude.anLoadExample(window.__etude.PIECES[0].id); return window.__etude.SCORE.fixedWidth; })).toBe(true);
  });
});

test.describe('Score Study engraving and symbol explanations', () => {
  // A piano bar with an editorial footnote, a chord symbol on the lower staff, dolce, mp < mf, a pedal, stacked chord fingerings and a cross-staff slur.
  const RICH = '<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>Rich Test</work-title></work>' +
    '<credit page="1"><credit-words default-y="80" font-size="8">Versão revista para piano solo, arr. de J. Silva</credit-words></credit>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' +
    '<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><words>dolce</words></direction-type><staff>1</staff></direction><direction placement="below"><direction-type><dynamics><mp/></dynamics></direction-type><staff>1</staff></direction><direction placement="below"><direction-type><wedge type="crescendo"/></direction-type><staff>1</staff></direction><direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>2</staff></direction><harmony><root><root-step>C</root-step></root><kind>major</kind><staff>2</staff></harmony><note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff><notations><technical><fingering>1</fingering></technical><slur type="start" number="1"/></notations></note><note><chord/><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff><notations><technical><fingering>4,5</fingering></technical></notations></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff><notations><technical><fingering>1</fingering></technical></notations></note><note><chord/><pitch><step>G</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff><notations><technical><fingering>3</fingering></technical></notations></note><note><chord/><pitch><step>C</step><octave>6</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff><notations><technical><fingering>5</fingering></technical></notations></note><direction placement="below"><direction-type><wedge type="stop"/></direction-type><staff>1</staff></direction><direction placement="below"><direction-type><dynamics><mf/></dynamics></direction-type><staff>1</staff></direction><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><staff>1</staff><notations><articulations><staccato/></articulations></notations></note><backup><duration>8</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note><direction placement="below"><direction-type><pedal type="stop" line="yes"/></direction-type><staff>2</staff></direction><note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff><notations><slur type="stop" number="1"/></notations></note></measure>' +
    '</part></score-partwise>';
  const load = async (page, src = RICH) => {
    const token = await page.evaluate(() => window.__etude.AN.loadToken);
    await page.locator('#an-file').setInputFiles({ name: 'rich.musicxml', mimeType: 'application/xml', buffer: Buffer.from(src) });
    await page.waitForFunction(token => window.__etude.AN.loadToken > token && !window.__etude.AN.loading && !!document.querySelector('#an-roll svg') && window.__etude.SCORE.syms?.length > 0, token);
  };

  test('editorial "Versão…" notes are dropped and chord symbols move to the upper staff', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const words = '<direction placement="below"><direction-type><words default-y="-110">Versão de concerto, revisão do editor</words></direction-type><staff>2</staff></direction>';
    await load(page, RICH.replace('<harmony>', words + '<harmony>'));
    const r = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml');
      return {
        credits: [...doc.querySelectorAll('credit-words')].map(c => c.textContent),
        words: [...doc.querySelectorAll('words')].map(w => w.textContent),
        harmonyStaves: [...doc.querySelectorAll('harmony > staff')].map(s => s.textContent),
        pedals: doc.querySelectorAll('pedal').length,
        svg: [...document.querySelectorAll('#an-roll svg text')].map(t => t.textContent).join('|'),
        links: window.__etude.AN.source.links.map(l => l.kind),
      };
    });
    expect(r.credits.join('|')).not.toMatch(/Versão/);
    expect(r.words).toEqual(['dolce']);
    expect(r.harmonyStaves.every(s => s === '1')).toBe(true);
    expect(r.pedals).toBe(2);
    expect(r.svg).not.toMatch(/Versão|revisão/);
    expect(r.links).toEqual(['slur']);   // the slur from the treble chord to the bass note crosses staves
    await expect(page.locator('#an-roll svg path.sc-xline[data-kind="slur"]')).toHaveCount(1);
  });

  test('stacked chord fingerings such as "4,5" over "1" never collide with each other or the notes', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await load(page);
    const r = await page.evaluate(() => {
      const ink = el => { const b = el.getBoundingClientRect(); return { l: b.left + b.width * .08, r: b.right - b.width * .08, t: b.top + b.height * .18, b: b.bottom - b.height * .2 }; };
      const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const fing = () => window.__etude.SCORE.syms.filter(s => s.kind === 'finger').map(s => ({ v: s.val, el: s.el, box: ink(s.el) }));
      const heads = [...document.querySelectorAll('#an-roll svg .vf-notehead')].map(h => h.getBoundingClientRect()).map(b => ({ l: b.left, r: b.right, t: b.top, b: b.bottom }));
      const clashes = () => { const f = fing(), out = [];
        f.forEach((a, i) => f.slice(i + 1).forEach(b => { if (hit(a.box, b.box)) out.push(a.v + '/' + b.v); }));
        f.forEach(a => heads.forEach(h => { if (hit(a.box, h)) out.push(a.v + '/head'); }));
        return out; };
      const engraved = clashes();
      // Force the collision a crowded score produces: "4,5" printed right on top of the "1" of the same chord.
      const [one, sub] = ['1', '4,5'].map(v => fing().find(f => f.v === v));
      const text = sub.el.querySelector('text');
      text.setAttribute('y', +text.getAttribute('y') + (one.box.t - sub.box.t) / text.ownerSVGElement.getScreenCTM().d);
      const forced = clashes();
      window.__etude.scoreFixFingerings(window.__etude.$('an-roll'), window.__etude.SCORE.engine);
      const after = fing(), a1 = after.find(f => f.el === one.el), a45 = after.find(f => f.el === sub.el);
      return { values: after.map(f => f.v).sort(), engraved, forced, fixed: clashes(), stacked: a45.box.b <= a1.box.t };
    });
    expect(r.values).toEqual(['1', '1', '3', '4,5', '5']);
    expect(r.engraved).toEqual([]);
    expect(r.forced).toContain('1/4,5');
    expect(r.fixed).toEqual([]);
    expect(r.stacked).toBe(true);   // the upper-staff, stem-up chord pushes the extra label upwards
  });

  for (const [lang, expected] of [
    ['en', { mp: 'moderately soft', mf: 'moderately loud', text: 'sweetly', cresc: 'volume grows gradually', ped: 'press the sustain', pedup: 'release the sustain', thumb: 'thumb', sub: 'finger change' }],
    ['ro', { mp: 'moderat de încet', mf: 'moderat de tare', text: 'dulce', cresc: 'volumul crește treptat', ped: 'apasă pedala', pedup: 'ridică pedala', thumb: 'degetul mare', sub: 'schimbare de deget' }],
  ]) {
    test(`hovering dynamics, dolce, the hairpin, the pedal marks and fingerings explains them (${lang})`, async ({ app }) => {
      const page = await app.open({ hash: 'analysis', lang });
      await load(page);
      const tip = page.locator('#an-roll .sc-tip');
      const hover = async (kind, val, phrase) => {
        const pt = await page.evaluate(([kind, val]) => {
          const s = window.__etude.SCORE.syms.find(x => x.kind === kind && (val == null || x.val === val));
          s.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const b = s.el.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        }, [kind, val]);
        await page.mouse.move(pt.x, pt.y);
        await expect(page.locator('#an-hover')).toContainText(phrase);
        await expect(tip).toBeVisible();
        await expect(tip).toContainText(phrase);
      };
      await hover('dyn', 'mp', expected.mp);
      await hover('dyn', 'mf', expected.mf);
      await hover('text', null, expected.text);
      await hover('cresc', null, expected.cresc);
      await hover('ped', null, expected.ped);
      await hover('pedup', null, expected.pedup);
      await hover('finger', '1', expected.thumb);
      await hover('finger', '4,5', expected.sub);
      await page.evaluate(() => window.__etude.SCORE.syms.find(s => s.kind === 'dyn' && s.val === 'mp').el.focus());
      await expect(page.locator('#an-hover')).toContainText(expected.mp);
      await expect(tip).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(tip).toBeHidden();
    });
  }
});

test('the volume slider is audible even if a backup restored the hidden "muted" flag', async ({ app }) => {
  const page = await app.open({ saved: { v: 3, lang: 'en', muted: true, data: {} } });
  await page.evaluate(() => window.__etude.ensureAudio());
  await page.locator('#volume').evaluate(el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => window.__etude.muted)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__etude.master.gain.value)).toBeGreaterThan(0.4);
});

test('audio requests the browser interactive latency profile', async ({ app, page }) => {
  await page.addInitScript(() => {
    const Audio=window.AudioContext || window.webkitAudioContext;
    window.AudioContext=class extends Audio { constructor(options){ super(options); window.__audioOptions=options; } };
  });
  await app.open();
  expect(await page.evaluate(() => window.__audioOptions)).toEqual({latencyHint:'interactive'});
});

test('a live note uses a decoded nearby piano sample immediately while its own loads', async ({ app }) => {
  const page = await app.open();
  const result = await page.evaluate(async () => {
    await window.__etude.preparePiano();
    const prevBuffers=window.__etude.pianoBank.buffers, prevDecode=window.__etude.pianoDecode, prevCreate=window.__etude.actx.createBufferSource;
    const requested=60, nearby=window.__etude.pianoNearest(72), exact=window.__etude.pianoNearest(requested), buffer=window.__etude.actx.createBuffer(1,window.__etude.actx.sampleRate,window.__etude.actx.sampleRate);
    let rate, decoded=[];
    window.__etude.pianoBank.buffers=new Map([[nearby,buffer]]);
    window.__etude.pianoDecode=k=>{ decoded.push(k); return new Promise(()=>{}); };
    window.__etude.actx.createBufferSource=function(){ const source=prevCreate.call(this), set=source.playbackRate.setValueAtTime;
      source.playbackRate.setValueAtTime=function(value,time){ rate=value; return set.call(this,value,time); }; return source; };
    try {
      const voice=window.__etude.sampledPianoVoice(window.__etude.midiToFreq(requested),100);
      const immediate=!!voice.inner;
      await Promise.resolve();
      voice.stop();
      return {immediate, rate, expected:Math.pow(2,(requested-nearby)/12), decoded, exact};
    } finally { window.__etude.pianoBank.buffers=prevBuffers; window.__etude.pianoDecode=prevDecode; window.__etude.actx.createBufferSource=prevCreate; }
  });
  expect(result.immediate).toBe(true);
  expect(result.rate).toBeCloseTo(result.expected, 5);
  expect(result.decoded).toContain(result.exact);
});

test('a cold live note starts a temporary synth immediately and releases normally', async ({ app }) => {
  const page = await app.open();
  const result = await page.evaluate(async () => {
    await window.__etude.preparePiano();
    const prevBuffers=window.__etude.pianoBank.buffers, prevDecode=window.__etude.pianoDecode, prevSynth=window.__etude.makePianoVoice;
    let starts=0, stops=0, decodes=0;
    window.__etude.pianoBank.buffers=new Map();
    window.__etude.pianoDecode=()=>{ decodes++; return new Promise(()=>{}); };
    window.__etude.makePianoVoice=()=>{ starts++; return {stop(){stops++;},setBend(){}}; };
    try {
      const voice=window.__etude.sampledPianoVoice(window.__etude.midiToFreq(60),100);
      const immediate=starts;
      voice.stop();
      await Promise.resolve();
      return {immediate,stops,decodes};
    } finally { window.__etude.pianoBank.buffers=prevBuffers; window.__etude.pianoDecode=prevDecode; window.__etude.makePianoVoice=prevSynth; }
  });
  expect(result).toEqual({immediate:1,stops:1,decodes:1});
});

for (const source of ['midi', 'ble']) {
  test(`${source}: a cold note starts synchronously, releases and does not replay after decoding`, async ({ app }) => {
    const page=await app.open();
    const result=await page.evaluate(async source => {
      await window.__etude.preparePiano();
      const oldBuffers=window.__etude.pianoBank.buffers, oldDecode=window.__etude.pianoDecode, oldSynth=window.__etude.makePianoVoice;
      let starts=0,stops=0,resolveDecode;
      window.__etude.pianoBank.buffers=new Map();
      window.__etude.pianoDecode=()=>new Promise(resolve=>{ resolveDecode=resolve; });
      window.__etude.makePianoVoice=()=>{ starts++; return {stop(){stops++;},setBend(){}}; };
      try {
        window.__etude.midiIn(0x90,60,100,source);
        const immediate=starts;
        window.__etude.midiIn(0x90,60,0,source); // velocity-zero note-on is note-off
        await Promise.resolve();
        resolveDecode(window.__etude.actx.createBuffer(1,128,window.__etude.actx.sampleRate));
        await new Promise(resolve=>setTimeout(resolve,0));
        return {immediate,starts,stops,held:window.__etude.held.has(60),voice:window.__etude.liveVoices.has(60)};
      } finally { window.__etude.pianoBank.buffers=oldBuffers; window.__etude.pianoDecode=oldDecode; window.__etude.makePianoVoice=oldSynth; }
    },source);
    expect(result).toEqual({immediate:1,starts:1,stops:1,held:false,voice:false});
  });
}

test('scheduled piano playback does not substitute a live fallback when its sample is missing', async ({ app }) => {
  const page=await app.open();
  const result=await page.evaluate(async () => {
    await window.__etude.preparePiano();
    const oldBuffers=window.__etude.pianoBank.buffers, oldDecode=window.__etude.pianoDecode, oldSynth=window.__etude.makePianoVoice;
    let synths=0, resolveDecode;
    window.__etude.pianoBank.buffers=new Map();
    window.__etude.pianoDecode=()=>new Promise(resolve=>{ resolveDecode=resolve; });
    window.__etude.makePianoVoice=()=>{ synths++; return {stop(){},setBend(){}}; };
    try {
      const voice=window.__etude.sampledPianoVoice(window.__etude.midiToFreq(60),100,window.__etude.actx.currentTime+1,0.3);
      const before=!!voice.inner;
      voice.stop();
      resolveDecode(window.__etude.actx.createBuffer(1,128,window.__etude.actx.sampleRate));
      await new Promise(resolve=>setTimeout(resolve,0));
      return {before,after:!!voice.inner,synths};
    } finally { window.__etude.pianoBank.buffers=oldBuffers; window.__etude.pianoDecode=oldDecode; window.__etude.makePianoVoice=oldSynth; }
  });
  expect(result).toEqual({before:false,after:false,synths:0});
});

test('a distant cached sample uses the synth rather than extreme pitch-shifting', async ({ app }) => {
  const page=await app.open();
  const result=await page.evaluate(async () => {
    await window.__etude.preparePiano();
    const oldBuffers=window.__etude.pianoBank.buffers, oldDecode=window.__etude.pianoDecode, oldSynth=window.__etude.makePianoVoice;
    let starts=0;
    window.__etude.pianoBank.buffers=new Map([[48,window.__etude.actx.createBuffer(1,128,window.__etude.actx.sampleRate)]]);
    window.__etude.pianoDecode=()=>new Promise(()=>{});
    window.__etude.makePianoVoice=()=>{ starts++; return {stop(){},setBend(){}}; };
    try { const voice=window.__etude.sampledPianoVoice(window.__etude.midiToFreq(108),100); voice.stop(); return starts; }
    finally { window.__etude.pianoBank.buffers=oldBuffers; window.__etude.pianoDecode=oldDecode; window.__etude.makePianoVoice=oldSynth; }
  });
  expect(result).toBe(1);
});

test('a stale live decode error cannot mark a replacement audio context as failed', async ({ app }) => {
  const page=await app.open();
  const result=await page.evaluate(async () => {
    await window.__etude.preparePiano();
    const oldCtx=window.__etude.actx, oldBankCtx=window.__etude.pianoBank.ctx, oldBuffers=window.__etude.pianoBank.buffers, oldStatus=window.__etude.pianoBank.status, oldDecode=window.__etude.pianoDecode, oldSynth=window.__etude.makePianoVoice;
    let fail;
    window.__etude.pianoBank.buffers=new Map();
    window.__etude.pianoDecode=()=>new Promise((_,reject)=>{ fail=reject; });
    window.__etude.makePianoVoice=()=>({stop(){},setBend(){}});
    try {
      const voice=window.__etude.sampledPianoVoice(window.__etude.midiToFreq(60),100);
      await Promise.resolve();
      window.__etude.actx={state:'running'}; window.__etude.pianoBank.ctx=window.__etude.actx; window.__etude.pianoBank.status='ready';
      fail(new Error('old context decode failed'));
      await new Promise(resolve=>setTimeout(resolve,0));
      voice.stop(); return window.__etude.pianoBank.status;
    } finally { window.__etude.actx=oldCtx; window.__etude.pianoBank.ctx=oldBankCtx; window.__etude.pianoBank.buffers=oldBuffers; window.__etude.pianoBank.status=oldStatus; window.__etude.pianoDecode=oldDecode; window.__etude.makePianoVoice=oldSynth; }
  });
  expect(result).toBe('ready');
});

test('an aborted piano warm-up can recover before Learn playback', async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => {
    window.__etude.ensureAudio();
    window.__etude.pianoBank.promise = null;
    window.__etude.pianoBank.status = 'error';
    window.__etude.pianoBank.buffers = new Map();
    window.__etude.pianoBank.pending = new Map();
    window.__etude.pianoBank.ctx = window.__etude.actx;
    const fetchImpl = window.fetch;
    let aborted = false;
    window.__abortFirstPianoFetch = () => {
      window.fetch = (input, init) => {
        if (!aborted && String(input).includes('.mp3')) {
          aborted = true;
          const controller = new AbortController();
          controller.abort();
          return fetchImpl(input, { ...(init || {}), signal: controller.signal });
        }
        return fetchImpl(input, init);
      };
    };
    window.__restorePianoFetch = () => {
      window.fetch = fetchImpl;
      delete window.__abortFirstPianoFetch;
      delete window.__restorePianoFetch;
    };
  });
  const first = await page.evaluate(async () => {
    window.__etude.pianoBank.promise = null;
    window.__etude.pianoBank.status = 'idle';
    window.__etude.pianoBank.buffers = new Map();
    window.__etude.pianoBank.pending = new Map();
    // Inject the abort and call prepare in the same browser task: an idle warm-up
    // between evaluate calls must not consume the fault meant for this attempt.
    window.__abortFirstPianoFetch();
    return window.__etude.preparePiano();
  });
  await page.evaluate(() => window.__restorePianoFetch?.());
  const second = await page.evaluate(async () => {
    const ready = await window.__etude.preparePiano();
    window.__etude.startSession(null);
    const question = window.__etude.SES.q;
    window.__etude.playQuestionSound(question);
    return { ready, active: window.__etude.SES.active, hasQuestion: !!question, voices: window.__etude.previewVoices.length, status: window.__etude.pianoBank.status };
  });
  expect(first).toBe(false);
  expect(second).toMatchObject({ ready: true, active: true, hasQuestion: true, status: 'ready' });
  expect(second.voices).toBeGreaterThan(0);
});

test('synthesized piano notes connect modulation to each pitched oscillator', async ({ app }) => {
  const page=await app.open();
  const result=await page.evaluate(() => {
    const original=window.__etude.lfoGain.connect; let connections=0;
    window.__etude.lfoGain.connect=function(...args){ connections++; return original.apply(this,args); };
    try { const voice=window.__etude.makePianoVoice(window.__etude.midiToFreq(60),100); const count=voice.oscs.length; voice.stop(); return {connections,count}; }
    finally { window.__etude.lfoGain.connect=original; }
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.connections).toBe(result.count);
});

test('an interrupted audio context is resumed before playback', async ({ app }) => {
  const page = await app.open();
  const resumeCalls = await page.evaluate(async () => {
    const previousContext = window.__etude.actx, previousPrepare = window.__etude.preparePiano;
    let calls = 0;
    window.__etude.actx = { state: 'interrupted', resume: () => { calls++; return Promise.resolve(); } };
    window.__etude.preparePiano = () => {};
    try {
      window.__etude.ensureAudio();
      await Promise.resolve();
      return calls;
    } finally {
      window.__etude.actx = previousContext;
      window.__etude.preparePiano = previousPrepare;
    }
  });
  expect(resumeCalls).toBe(1);
});

test('Explore "Show" does not clear another view\'s keyboard targets after navigating away', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  await page.locator('#refShow').click();
  await page.evaluate(() => { window.__etude.show('learn'); window.__etude.kbClearAll(); window.__etude.kbState(60, 'target', true); });
  await page.waitForTimeout(2900);
  expect(await page.evaluate(() => window.__etude.keyEl.get(window.__etude.foldToView(60)).dataset.s)).toBe('target');
});

for (const lang of ['en', 'ro']) {
  test(`Today adapts its session and plan to the available width (${lang})`, async ({ app, page }) => {
    await page.setViewportSize({width: 1600, height: 1000});
    await app.open({lang});
    const bounds=() => page.evaluate(() => {
      const hero=document.querySelector('#today-home .hero').getBoundingClientRect();
      const plan=document.querySelector('#today-plan').getBoundingClientRect();
      const wrap=document.querySelector('#today-home').getBoundingClientRect();
      return {hero:{left:hero.left,right:hero.right,top:hero.top,bottom:hero.bottom},plan:{left:plan.left,right:plan.right,top:plan.top},width:wrap.width,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    let r=await bounds();
    expect(r.width).toBeGreaterThan(1240);
    expect(r.hero.right).toBeLessThan(r.plan.left);
    expect(Math.abs(r.hero.top-r.plan.top)).toBeLessThanOrEqual(2);
    expect(r.overflow).toBe(false);
    await page.setViewportSize({width: 1024, height: 768});
    r=await bounds();
    expect(r.hero.right).toBeLessThan(r.plan.left);
    expect(r.overflow).toBe(false);
    await page.setViewportSize({width: 900, height: 800});
    r=await bounds();
    expect(r.plan.top).toBeGreaterThanOrEqual(r.hero.bottom);
    expect(r.overflow).toBe(false);
    await page.locator('#startBtn').click();
    await expect(page.locator('#session')).toBeVisible();
    const before=await page.evaluate(() => ({active:window.__etude.SES.active,index:window.__etude.SES.idx,prompt:window.__etude.$('q-prompt').textContent}));
    await page.setViewportSize({width: 1600, height: 1000});
    await expect(page.locator('#session')).toBeVisible();
    await expect(page.locator('#ses-end')).toBeVisible();
    expect(await page.evaluate(() => ({active:window.__etude.SES.active,index:window.__etude.SES.idx,prompt:window.__etude.$('q-prompt').textContent}))).toEqual(before);
  });
}

test('wide practice and score surfaces use available space while Learn text remains readable', async ({ app, page }) => {
  await page.setViewportSize({width: 1920, height: 1000});
  await app.open();
  for (const view of ['practice', 'read', 'analysis', 'explore']) {
    await page.evaluate(view => window.__etude.show(view), view);
    const r=await page.locator(`#view-${view} > .wrap`).boundingBox();
    expect(r.width,view).toBeGreaterThan(1480);
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),view).toBe(true);
  }
  expect((await page.locator('#dock > .wrap').boundingBox()).width).toBeGreaterThan(1480);
  await page.evaluate(() => window.__etude.show('learn'));
  expect((await page.locator('#view-learn > .wrap').boundingBox()).width).toBeLessThanOrEqual(1240);
});

for (const lang of ['en', 'ro']) {
  test(`responsive breakpoints keep all views within the viewport (${lang})`, async ({ app, page }) => {
    await app.open({lang});
    for (const width of [320, 959, 960, 980, 981, 999, 1000, 1024, 1440]) {
      await page.setViewportSize({width,height:800});
      await page.waitForTimeout(180);   // the app debounces resize work by 100ms
      for (const view of VIEWS) {
        await page.evaluate(view => window.__etude.show(view), view);
        const dimensions=await page.evaluate(() => ({scroll:document.documentElement.scrollWidth,visible:document.documentElement.clientWidth}));
        expect(dimensions.scroll,`${lang}, ${view}, ${width}px`).toBeLessThanOrEqual(dimensions.visible+1);
      }
    }
  });
}

for (const lang of ['en', 'ro']) {
  test(`a populated Practice session survives resizing and keeps its controls reachable (${lang})`, async ({ app, page }) => {
    await page.setViewportSize({width:1920,height:1000});
    await app.open({hash:'practice',lang});
    await page.locator('#pr-start').click();
    await expect(page.locator('#session')).toBeVisible();
    const before=await page.evaluate(() => ({active:window.__etude.SES.active,index:window.__etude.SES.idx,prompt:window.__etude.$('q-prompt').textContent}));
    for(const width of [1024,390,320,1920]){
      await page.setViewportSize({width,height:800});
      await page.waitForTimeout(180);   // inspect controls after the resize handler settles
      await expect.poll(() => page.evaluate(() => ({active:window.__etude.SES.active,index:window.__etude.SES.idx,prompt:window.__etude.$('q-prompt').textContent}))).toEqual(before);
      await page.locator('#q-reveal').scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('#q-reveal').evaluate(el => {
        const r=el.getBoundingClientRect(), hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
        return !!hit && (hit===el || el.contains(hit));
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
    }
    await page.locator('#q-reveal').click();
    await expect(page.locator('#q-next')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.total)).toBe(1);
    await page.locator('#q-next').click();
    await expect(page.locator('#q-reveal')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.active)).toBe(true);
  });

  test(`a loaded score stays above the keyboard after resizing (${lang})`, async ({ app, page }) => {
    await page.setViewportSize({width:1920,height:1000});
    await app.open({hash:'analysis',lang});
    await page.locator('#an-roll .an-ex').first().click();
    await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.notes.length>0 && !!document.querySelector('#an-roll svg'));
    const before=await page.evaluate(() => ({id:window.__etude.AN.source.id,notes:window.__etude.AN.notes.length}));
    await page.setViewportSize({width:390,height:844});
    await expect.poll(() => page.evaluate(() => {
      const score=window.__etude.$('an-roll').getBoundingClientRect(), work=window.__etude.$('an-work').getBoundingClientRect(), dock=window.__etude.$('dock').getBoundingClientRect();
      const hit=document.elementFromPoint((score.left+score.right)/2,score.bottom-5);
      return work.bottom<=dock.top+1 && !!hit && (hit===window.__etude.$('an-roll') || window.__etude.$('an-roll').contains(hit));
    })).toBe(true);
    expect(await page.evaluate(() => ({id:window.__etude.AN.source.id,notes:window.__etude.AN.notes.length}))).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
    // Do not pull the user back to the score when they have scrolled below it.
    await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
    expect(await page.locator('#an-stage').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(0);
    await page.setViewportSize({width:410,height:844});
    await page.waitForTimeout(180);
    expect(await page.locator('#an-stage').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(0);
  });
}

test('320px phone: no view scrolls sideways and the Explore staff fits its panel', async ({ app, page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await app.open();
  for (const v of VIEWS) {
    await page.evaluate(v => window.__etude.show(v), v);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), v).toBeLessThanOrEqual(320);
  }
  await page.evaluate(() => { window.__etude.show('explore'); window.__etude.$('refShow').click(); });
  const fit = await page.locator('#view-explore svg.ss-svg').first().evaluate(svg => svg.getBoundingClientRect().right <= svg.parentElement.getBoundingClientRect().right + 1);
  expect(fit).toBe(true);
});

test('Explore readout keeps the staff still when a long chord is held', async ({ app, page }) => {
  const chords = [[], [60], [60, 64, 67], [36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79], [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 101, 102, 103, 104, 105, 106, 107, 108]];
  for (const viewport of [{ width: 834, height: 1194 }, { width: 360, height: 740 }]) {
    await page.setViewportSize(viewport);
    await app.open({ hash: 'explore' });
    const positions = [];
    for (const chord of chords) {
      positions.push(await page.evaluate(chord => {
        window.__etude.held.clear(); chord.forEach(m => window.__etude.held.add(m)); window.__etude.updateExplore();
        const staff = window.__etude.$('ex-staff').getBoundingClientRect(), notes = window.__etude.$('ro-notes');
        return { top: staff.top, readoutHeight: document.querySelector('.readout').getBoundingClientRect().height, clipped: notes.scrollWidth > notes.clientWidth };
      }, chord));
    }
    expect(new Set(positions.map(p => p.top)).size, `${viewport.width}px`).toBe(1);
    expect(new Set(positions.map(p => p.readoutHeight)).size, `${viewport.width}px`).toBe(1);
    expect(positions.at(-1).clipped, `${viewport.width}px`).toBe(true);
  }
});

test('Explore staff: bass left and treble right in one fixed frame; far notes are named by an arrow; ledgers show on the dark theme', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
  const chords = [[], [53], [60], [60, 64, 67], [89], [53, 89], [24, 96], [21, 108], [77, 89], [36, 40, 43, 84, 88, 91], [59, 60, 62, 64, 65],
    [61, 63, 66, 68, 70], [52, 53, 55, 57, 59, 60, 62, 64], [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 101, 102, 103, 104, 105, 106, 107, 108]];
  // [drawn, named above, named below] on each staff
  const expected = {
    '24,96': { bass: [[24], [96], []], treble: [[96], [], [24]] },
    '21,108': { bass: [[], [108], [21]], treble: [[], [108], [21]] },
    '77,89': { bass: [[], [77, 89], []], treble: [[77, 89], [], []] },
  };
  let frame;
  for (const c of chords) {
    const r = await page.evaluate(c => {
      window.__etude.drawExploreStaff(c, false);
      const svg = window.__etude.$('ex-staff').querySelector('svg'), m = svg.getScreenCTM().inverse();
      const box = el => { const r = el.getBoundingClientRect(), a = new DOMPoint(r.left, r.top).matrixTransform(m), b = new DOMPoint(r.right, r.bottom).matrixTransform(m);
        return { left: a.x, top: a.y, right: b.x, bottom: b.y }; };
      const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const staves = {};
      for (const g of svg.querySelectorAll('.ex-stave')) {
        const lines = [...g.querySelectorAll('.ss-line')], ledgers = [...g.querySelectorAll('.ss-ledger')], clef = g.querySelector('path.ss-clef');
        const far = [...g.querySelectorAll('.ex-far')], marks = [clef, ...g.querySelectorAll('.ss-n, .ss-line, .ss-ledger, text:not(.ex-far)')].map(box);
        const named = arrow => far.filter(tx => tx.textContent.startsWith(arrow)).flatMap(tx => tx.textContent.slice(2).split(' '));
        // Scan a vertical line through the F clef's dots (its right edge) to find where each dot is filled.
        const dots = [];
        if (g.dataset.clef === 'bass') {
          const fm = clef.transform.baseVal.consolidate().matrix, fb = clef.getBBox(), inv = fm.inverse(), dotX = fm.a * (fb.x + fb.width) + fm.e - 2;
          for (let y = +lines[0].getAttribute('y1') - 12; y <= +lines[4].getAttribute('y1') + 12; y += 0.25)
            if (clef.isPointInFill(new DOMPoint(dotX, y).matrixTransform(inv))) { const d = dots[dots.length - 1]; d && y - d[1] < 0.5 ? d[1] = y : dots.push([y, y]); }
        }
        staves[g.dataset.clef] = { box: box(g), dots, lines: lines.map(l => ['x1', 'y1', 'x2'].map(a => +l.getAttribute(a))),
          drawn: [...g.querySelectorAll('.ss-n')].map(n => +n.dataset.midi), up: named('↑'), down: named('↓'),
          farClash: far.some(tx => marks.some(b => hit(box(tx), b))), dupLedgers: ledgers.length - new Set(ledgers.map(l => l.getAttribute('y1'))).size,
          ledgerInk: [...new Set(ledgers.map(l => getComputedStyle(l).stroke))], lineInk: getComputedStyle(lines[0]).stroke,
          f3: g.querySelector('.ss-n[data-midi="53"] ellipse')?.getAttribute('cy') };
      }
      const empty = [...svg.children].filter(el => el.matches('text'));
      return { staves, theme: document.documentElement.dataset.theme, nm: Object.fromEntries(c.map(m => [m, window.__etude.noteName(m, false)])),
        viewBox: svg.getAttribute('viewBox'), height: svg.getBoundingClientRect().height, wrapHeight: window.__etude.$('ex-staff').getBoundingClientRect().height,
        clefs: [...svg.querySelectorAll('path.ss-clef')].map(p => p.getAttribute('transform')).join(' '),
        empty: empty.length, emptyClash: empty.some(tx => [...svg.querySelectorAll('.ex-stave')].some(g => hit(box(tx), box(g)))) };
    }, c);
    const where = String(c), { bass, treble } = r.staves, n = m => r.nm[m], [, , W, H] = r.viewBox.split(' ').map(Number);
    frame ??= r;
    expect(r.theme).toBe('dark');
    // Nothing moves while you play: the frame, the staff lines and the clefs never depend on what is held.
    expect(r.viewBox, where).toBe(frame.viewBox);
    expect(r.height, where).toBe(frame.height);
    expect(r.wrapHeight, where).toBe(frame.wrapHeight);
    expect(r.clefs, where).toBe(frame.clefs);
    expect(bass.lines, where).toEqual(frame.staves.bass.lines);
    expect(treble.lines, where).toEqual(frame.staves.treble.lines);
    // Bass on the left and treble on the right, side by side inside the frame.
    expect(bass.box.right, where).toBeLessThan(treble.box.left);
    for (const s of [bass, treble]) {
      expect(s.box.left, where).toBeGreaterThanOrEqual(0);
      expect(s.box.right, where).toBeLessThanOrEqual(W);
      expect(s.box.top, where).toBeGreaterThanOrEqual(0);
      expect(s.box.bottom, where).toBeLessThanOrEqual(H);
      // Every held note is drawn or named by an arrow, never both, and the arrows clear everything else.
      expect([...s.drawn.map(n), ...s.up, ...s.down].sort(), where).toEqual(c.map(n).sort());
      expect(s.farClash, where).toBe(false);
      expect(s.dupLedgers, where).toBe(0);
      for (const ink of s.ledgerInk) expect(ink, where).toBe(s.lineInk);
    }
    for (const [k, [drawn, up, down]] of Object.entries(expected[where] || {})) {
      expect(r.staves[k].drawn, where + ' ' + k).toEqual(drawn);
      expect(r.staves[k].up, where + ' ' + k).toEqual(up.map(n));
      expect(r.staves[k].down, where + ' ' + k).toEqual(down.map(n));
    }
    // The F clef's two dots sit in the spaces either side of the F line (fourth from the bottom, where F3 is written).
    const fLine = bass.lines[1][1];
    expect(bass.dots.length, where).toBe(2);
    expect(bass.dots[0][1], where).toBeLessThan(fLine);
    expect(bass.dots[1][0], where).toBeGreaterThan(fLine);
    expect(Math.abs((bass.dots[0][1] + bass.dots[1][0]) / 2 - fLine), where).toBeLessThan(1.5);
    if (c.includes(53)) expect(+bass.f3, where).toBe(fLine);
    expect(r.empty, where).toBe(c.length ? 0 : 1);
    expect(r.emptyClash, where).toBe(false);
  }
});

test('finger numbers on the white keys stay clear of the black keys and the note names, also in the compact landscape dock', async ({ app, page }) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 740, height: 360 }, { width: 1194, height: 834 }]) {
    await page.setViewportSize(viewport);
    await app.open({ hash: 'explore' });
    const clashes = await page.evaluate(() => {
      [55, 60, 64].forEach(m => window.__etude.handleNoteOn(m, 100, 'pointer'));
      const blacks = [...document.querySelectorAll('#keys .black')].map(el => el.getBoundingClientRect());
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const badges = [...document.querySelectorAll('#keys .white .dg')].filter(el => el.textContent);
      return { count: badges.length, clashes: badges.flatMap(el => {
        const r = el.getBoundingClientRect(), lbl = el.parentElement.querySelector('.lbl');
        return [...blacks.filter(b => hit(r, b)).map(() => `${el.textContent} under a black key`),
          ...(lbl && lbl.textContent && hit(r, lbl.getBoundingClientRect()) ? [`${el.textContent} over ${lbl.textContent}`] : [])];
      }) };
    });
    expect(clashes.count, `${viewport.width}×${viewport.height}`).toBe(3);
    expect(clashes.clashes, `${viewport.width}×${viewport.height}`).toEqual([]);
  }
});

// ---- .mxl archives built on the fly ----
// files: { name, data, store?, flags?, size? }. `size` replaces the declared unpacked size: a number, or { zip64: n } to declare it in a
// ZIP64 extra field. `links` lists indexes into files that get one more central-directory record pointing at the same stored data.
function zip(files, links = []) {
  const parts = [];
  let offset = 0;
  const recs = files.map(f => {
    const data = Buffer.from(f.data), name = Buffer.from(f.name), method = f.store ? 0 : 8;
    const body = f.store ? data : zlib.deflateRawSync(data, { level: 9 });
    const size = f.size ?? data.length, crc = zlib.crc32(data), head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(f.flags || 0, 6); head.writeUInt16LE(method, 8);
    head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(typeof size === 'number' ? size : 0xffffffff, 22); head.writeUInt16LE(name.length, 26);
    parts.push(head, name, body);
    const rec = { f, name, method, crc, size, packed: body.length, offset };
    offset += head.length + name.length + body.length;
    return rec;
  });
  const central = r => {
    const extra = Buffer.alloc(typeof r.size === 'number' ? 0 : 12), c = Buffer.alloc(46);
    if (extra.length) { extra.writeUInt16LE(1, 0); extra.writeUInt16LE(8, 2); extra.writeBigUInt64LE(BigInt(r.size.zip64), 4); }
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(r.f.flags || 0, 8); c.writeUInt16LE(r.method, 10);
    c.writeUInt16LE(0x21, 14); c.writeUInt32LE(r.crc, 16); c.writeUInt32LE(r.packed, 20); c.writeUInt32LE(extra.length ? 0xffffffff : r.size, 24);
    c.writeUInt16LE(r.name.length, 28); c.writeUInt16LE(extra.length, 30); c.writeUInt32LE(r.offset, 42);
    return Buffer.concat([c, r.name, extra]);
  };
  const dir = Buffer.concat([...recs, ...links.map(i => recs[i])].map(central)), end = Buffer.alloc(22), count = recs.length + links.length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
const CONTAINER = '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
  '<rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
// A score of n quarter notes (n a multiple of 4), optionally padded with a comment.
const score = (n, pad = '') => '<?xml version="1.0" encoding="UTF-8"?>' + (pad && '<!--' + pad + '-->') +
  '<score-partwise version="3.1"><movement-title>Archive</movement-title><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1">' +
  Array.from({ length: n / 4 }, (_, i) => `<measure number="${i + 1}">` +
    (i ? '' : '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>') +
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><type>quarter</type></note>'.repeat(4) + '</measure>').join('') +
  '</part></score-partwise>';
const mxl = (xml, { links, ...entry } = {}) => zip([{ name: 'META-INF/container.xml', data: CONTAINER }, { name: 'score.xml', data: xml, ...entry }], links);
const MXL_CAP = 32 * 2 ** 20;   // AN_MAX_XML_CHARS

test('a small .mxl that unpacks to an oversized XML is refused with a clear message', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await page.evaluate(() => window.__etude.loadOsmd());
  const r = await page.evaluate(async b64 => {
    const real = opensheetmusicdisplay.MXLHelper.MXLtoXMLstring;
    opensheetmusicdisplay.MXLHelper.MXLtoXMLstring = async () => 'x'.repeat(window.__etude.AN_MAX_XML_CHARS + 1);   // stands in for a zip bomb that got past the checks
    try { await window.__etude.anReadXml(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'bomb.mxl'), 'bomb'); return 'accepted'; }
    catch (e) { return window.__etude.anErrorKey(e, 'mxl'); }
    finally { opensheetmusicdisplay.MXLHelper.MXLtoXMLstring = real; }
  }, mxl(score(4)).toString('base64'));
  expect(r).toBe('an_err_mxlbig');
  expect(await page.evaluate(() => window.__etude.t('an_err_mxlbig'))).toMatch(/32 MB/);
});

test.describe('.mxl archives are checked before they are unpacked', () => {
  // Counts what reaches JSZip (through OSMD) and the preflight's counted inflate. On Chromium, OSMD's warm keeper also unpacks
  // its own bundled sample (passed as a string) once the page is idle, so only the app's ArrayBuffer calls are counted.
  const spyUnpack = async page => {
    await page.evaluate(() => window.__etude.loadOsmd());
    return page.evaluate(() => {
    const helper = opensheetmusicdisplay.MXLHelper, unzip = helper.MXLtoXMLstring, count = window.__etude.anInflatedSize;
    window.__unpack = { jszip: 0, counted: 0 };
    helper.MXLtoXMLstring = function (...a) { if (a[0] instanceof ArrayBuffer) window.__unpack.jszip++; return unzip.apply(this, a); };
    window.__etude.anInflatedSize = function (...a) { window.__unpack.counted++; return count.apply(this, a); };
    });
  };
  // Opens the archive through the file picker and reports how the import ended.
  const openMxl = async (page, bytes) => {
    const before = await page.evaluate(() => { window.__unpack.jszip = window.__unpack.counted = 0; return window.__etude.AN.loadToken; });
    await page.locator('#an-file').setInputFiles({ name: 'test.mxl', mimeType: 'application/vnd.recordare.musicxml', buffer: bytes });
    await page.waitForFunction(b => window.__etude.AN.loadToken > b && !window.__etude.AN.loading, before, { timeout: 30_000 });
    return page.evaluate(() => ({ error: window.__etude.AN.error ? window.__etude.AN.error.k : null, notes: window.__etude.AN.notes.length, msg: window.__etude.$('an-msg').textContent, isError: window.__etude.$('an-msg').classList.contains('is-error'), ...window.__unpack }));
  };

  test('ordinary archives still import: deflated, stored, and one large enough to be counted first', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await spyUnpack(page);
    expect(await openMxl(page, mxl(score(4)))).toMatchObject({ error: null, notes: 4, isError: false, jszip: 1, counted: 0 });
    expect(await openMxl(page, mxl(score(8), { store: true }))).toMatchObject({ error: null, notes: 8, isError: false, jszip: 1, counted: 0 });
    // ~45 KB packed: past the size where deflate could reach 32 MB, so it is inflated once as a counted stream before JSZip unpacks it
    expect(await openMxl(page, mxl(score(12, randomBytes(45_000).toString('base64'))))).toMatchObject({ error: null, notes: 12, isError: false, jszip: 1, counted: 1 });
  });

  test('a declared unpacked size over 32 MB is refused without inflating anything', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await spyUnpack(page);
    const refused = { error: 'an_err_mxlbig', msg: await page.evaluate(() => window.__etude.t('an_err_mxlbig')), isError: true, jszip: 0, counted: 0 };
    expect(await openMxl(page, mxl(score(4, 'a'.repeat(MXL_CAP))))).toMatchObject(refused);
    expect(await openMxl(page, mxl(score(4), { size: { zip64: 40 * 2 ** 20 } }))).toMatchObject(refused);
  });

  test('an entry that unpacks to far more than its header claims is stopped while counting', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await spyUnpack(page);
    const bomb = Buffer.concat([Buffer.alloc(40 * 2 ** 20), randomBytes(40_000)]);   // ~80 KB packed, 40 MB unpacked; the header says 1000 bytes
    expect(await openMxl(page, mxl(bomb, { size: 1000 }))).toMatchObject({ error: 'an_err_mxl', isError: true, jszip: 0, counted: 1 });
  });

  test('directory records whose declared total exceeds the budget are refused without inflating', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await spyUnpack(page);
    const big = Buffer.concat([Buffer.alloc(30 * 2 ** 20), randomBytes(40_000)]);   // honestly declared, just under the per-entry cap
    expect(await openMxl(page, mxl(big, { links: [1, 1, 1, 1] }))).toMatchObject({ error: 'an_err_mxlbig', isError: true, jszip: 0, counted: 0 });
  });

  test('many entries with small declared sizes cannot collectively hide a large expansion', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    // Each compressed record is small enough to look safe in isolation, but seven copies expand past the aggregate budget.
    const entry = Buffer.concat([Buffer.alloc(20 * 2 ** 20), randomBytes(1024)]);
    const archive = mxl(entry, { links: [1, 1, 1, 1, 1, 1] });
    const result = await page.evaluate(async b64 => {
      try {
        await window.__etude.anMxlPreflight(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
        return 'accepted';
      } catch (e) {
        return window.__etude.anErrorKey(e, 'mxl');
      }
    }, archive.toString('base64'));
    expect(result).toBe('an_err_mxlbig');
  });

  test('an archive that needs a streamed size check is refused when the browser cannot provide one', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const archive = mxl(score(4, randomBytes(45_000).toString('base64')));
    const result = await page.evaluate(async b64 => {
      const original = window.__etude.anInflatedSize;
      window.__etude.anInflatedSize = async () => null;
      try {
        await window.__etude.anMxlPreflight(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer);
        return 'accepted';
      } catch (e) {
        return window.__etude.anErrorKey(e, 'mxl');
      } finally {
        window.__etude.anInflatedSize = original;
      }
    }, archive.toString('base64'));
    expect(result).toBe('an_err_mxlbig');
  });

  test('malformed or encrypted archives are refused before JSZip sees them', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    await spyUnpack(page);
    const msg = await page.evaluate(() => window.__etude.t('an_err_mxl')), good = mxl(score(4));
    for (const bytes of [Buffer.alloc(1024), good.subarray(0, good.length - 10), good.subarray(100), mxl(score(4), { flags: 1 })])
      expect(await openMxl(page, bytes)).toMatchObject({ error: 'an_err_mxl', msg, isError: true, jszip: 0, counted: 0 });
  });
});

test('ending an ear-training session cancels its pending automatic prompt', async ({ app }) => {
  const page = await app.open();
  const calls = await page.evaluate(async () => {
    const original = window.__etude.playInterval;
    let played = 0;
    window.__etude.playInterval = () => { played++; };
    try {
      const q = { it: window.__etude.ITEMS.find(it => it.cat === 'interval'), mode: 'ear', key: 0 };
      window.__etude.SES.active = true;
      window.__etude.SES.answered = false;
      window.__etude.SES.q = q;
      window.__etude.presentEar(q);
      window.__etude.endSession(false);
      await new Promise(resolve => setTimeout(resolve, 320));
      return played;
    } finally {
      window.__etude.playInterval = original;
    }
  });
  expect(calls).toBe(0);
});

test('a folded keyboard key remains pressed until every folded note is released', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  const state = await page.evaluate(() => {
    window.__etude.releaseLiveInput();
    const firstByKey = new Map();
    let pair;
    for (let midi = 0; midi <= 127 && !pair; midi++) {
      const key = window.__etude.foldToView(midi);
      if (!window.__etude.keyEl.has(key)) continue;
      if (firstByKey.has(key)) pair = [firstByKey.get(key), midi, key];
      else firstByKey.set(key, midi);
    }
    if (!pair) throw new Error('Expected two MIDI notes to fold onto one visible key');

    const [first, second, key] = pair;
    window.__etude.handleNoteOn(first, 90, 'test:first');
    window.__etude.handleNoteOn(second, 90, 'test:second');
    const el = window.__etude.keyEl.get(key);
    const bothHeld = el.classList.contains('pressed');
    window.__etude.handleNoteOff(first, 'test:first');
    const oneHeld = el.classList.contains('pressed');
    window.__etude.handleNoteOff(second, 'test:second');
    const noneHeld = el.classList.contains('pressed');
    window.__etude.releaseLiveInput();
    return { bothHeld, oneHeld, noneHeld };
  });
  expect(state).toEqual({ bothHeld: true, oneHeld: true, noneHeld: false });
});

test('a modifier key releases active computer-keyboard notes', async ({ app }) => {
  const page = await app.open();
  const state = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    const before = { held: window.__etude.held.size, typing: window.__etude.typingDown.size };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true, bubbles: true }));
    const after = { held: window.__etude.held.size, typing: window.__etude.typingDown.size };
    window.__etude.releaseLiveInput();
    return { before, after };
  });
  expect(state).toEqual({ before: { held: 1, typing: 1 }, after: { held: 0, typing: 0 } });
});

test('a malformed backup is rejected before it can replace local progress', async ({ app }) => {
  const page = await app.open();
  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    dialog.dismiss();
  });
  await page.locator('#importFile').setInputFiles({
    name: 'malformed-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ v: 3, data: [] })),
  });
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs).toEqual([{ type: 'alert', message: 'That file doesn’t look like an Étude backup.' }]);
});

test('a structurally valid backup still reaches explicit replacement confirmation', async ({ app }) => {
  const page = await app.open();
  const dialogs = [];
  page.on('dialog', dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    dialog.dismiss();
  });
  await page.locator('#importFile').setInputFiles({
    name: 'valid-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ v: 3, data: { srs: {}, settings: {} } })),
  });
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs).toEqual([{ type: 'confirm', message: 'Replace your current progress with this backup?' }]);
});

test('persisted settings are normalized to supported audio and session limits', async ({ app }) => {
  const page = await app.open({
    saved: {
      v: 3,
      lang: 'en',
      masterVol: -4,
      muted: 'yes',
      reverb: 9,
      bpm: 999,
      data: { settings: { goal: 999999, newPerDay: -2, allowInv: 'yes', metronome: 1, drone: {}, earKeys: 'yes', weakSpotInjection: 'yes' } },
    },
  });
  expect(await page.evaluate(() => ({
    masterVol: window.__etude.masterVol,
    muted: window.__etude.muted,
    reverbWet: window.__etude.reverbWet,
    bpm: window.__etude.metro.bpm,
    settings: window.__etude.data.settings,
  }))).toEqual({
    masterVol: 0,
    muted: false,
    reverbWet: 0.5,
    bpm: 180,
    settings: { goal: 12, newPerDay: 5, allowInv: false, metronome: false, drone: false, earKeys: false, weakSpotInjection: false, anyOctave: false },
  });
});

test('valid persisted settings are preserved', async ({ app }) => {
  const page = await app.open({
    saved: {
      v: 3,
      lang: 'en',
      masterVol: 0.37,
      muted: true,
      reverb: 0.3,
      bpm: 120,
      data: { settings: { goal: 24, newPerDay: 12, allowInv: true, metronome: true, drone: true, earKeys: true, weakSpotInjection: true } },
    },
  });
  expect(await page.evaluate(() => ({
    masterVol: window.__etude.masterVol,
    muted: window.__etude.muted,
    reverbWet: window.__etude.reverbWet,
    bpm: window.__etude.metro.bpm,
    settings: window.__etude.data.settings,
  }))).toEqual({
    masterVol: 0.37,
    muted: true,
    reverbWet: 0.3,
    bpm: 120,
    settings: { goal: 24, newPerDay: 12, allowInv: true, metronome: true, drone: true, earKeys: true, weakSpotInjection: true, anyOctave: false },
  });
});

test.describe('reading drills: key to staff', () => {
  const start = (page, clef) => page.evaluate(clef => {
    const e = window.__etude, level = Object.values(e.RD_LV).find(l => l.ty === 'k2s' && l.clef === clef);
    e.rdOpen(level);
    e.rdStart('practice');
    return e.RD.q.midi;
  }, clef);
  const question = page => page.evaluate(() => window.__etude.RD.q.midi);

  test('the question lights a key on the big keyboard, which opens just for the drill', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
    const midi = await start(page, 'treble');
    await expect(page.locator('#rdx-kb')).toHaveCount(0);
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
    await expect(page.locator('#dock-kb-toggle')).toBeHidden();
    await expect(page.locator('#keys [data-s="target"]')).toHaveCount(1);
    await expect(page.locator(`#keys .key[data-midi="${midi}"]`)).toHaveAttribute('data-s', 'target');
    await page.locator('#rdx-end').click();
    await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
    await expect(page.locator('#dock-kb-toggle')).toBeVisible();
    await expect(page.locator('#keys [data-s]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__etude.DOCK.pref)).toBeNull();
  });

  test('the keys show the drill in its own octaves, and moving them never loses the question', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, 'bass');
    await expect(page.locator('#keys .key[data-midi="41"]')).toHaveCount(1); // F2, below the keys' usual C3
    for (const button of ['#oct-up', '#oct-down', '#oct-down', '#oct-up', '#oct-up']) {
      await page.locator(button).click();
      await expect(page.locator(`#keys .key[data-midi="${await question(page)}"]`)).toHaveAttribute('data-s', 'target');
    }
  });

  test('notes played on the piano only sound; 1–4 answers, and a wrong pick marks its key', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    const midi = await start(page, 'treble');
    await page.evaluate(m => {
      window.__etude.midiIn(0x90, m, 100, 'midi');
      window.__etude.midiIn(0x80, m, 0, 'midi');
    }, midi);
    expect(await page.evaluate(() => [window.__etude.RD.n, window.__etude.RD.answered])).toEqual([0, false]);
    await expect(page.locator(`#keys .key[data-midi="${midi}"]`)).toHaveAttribute('data-s', 'target');
    const { pick, wrong } = await page.evaluate(() => {
      const e = window.__etude, q = e.RD.q, pick = q.opts.findIndex((o, i) => i !== q.ans);
      return { pick, wrong: e.rdMidi(q.opts[pick].n) };
    });
    await page.keyboard.press(String(pick + 1));
    await expect(page.locator(`#keys .key[data-midi="${midi}"]`)).toHaveAttribute('data-s', 'good');
    await expect(page.locator(`#keys .key[data-midi="${wrong}"]`)).toHaveAttribute('data-s', 'bad');
    await expect(page.locator('#rdx-ans .rdx-a').nth(pick)).toHaveClass(/\bwrong\b/);
    expect(await page.evaluate(() => [window.__etude.RD.n, window.__etude.RD.ok])).toEqual([1, 0]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('every question brings its key into sight, in its own octave', async ({ app }) => {
      const page = await app.open({ hash: 'read' });
      expect(await page.evaluate(() => window.__etude.view.oct)).toBe(2);
      await start(page, 'grand');
      for (let i = 0; i < 8; i++) {
        const key = page.locator(`#keys .key[data-midi="${await question(page)}"]`);
        await expect(key).toHaveAttribute('data-s', 'target');
        await expect(page.locator('#keys [data-s]')).toHaveCount(1);
        expect(await key.evaluate(k => {
          const r = k.getBoundingClientRect(), s = document.getElementById('dock-keys').getBoundingClientRect();
          return r.left >= s.left - 1 && r.right <= s.right + 1;
        })).toBe(true);
        await page.evaluate(() => window.__etude.rdNext());
      }
    });
  });
});

test('play drills answer on the big keyboard, whose named keys support Enter', async ({ app }) => {
  const page = await app.open({ hash: 'read', dock: true });
  const midi = await page.evaluate(() => {
    const e = window.__etude, level = Object.values(e.RD_LV).find(l => l.ty === 'play' && l.clef === 'treble' && !l.acc && !l.keys);
    e.rdOpen(level);
    e.rdStart('practice');
    return e.RD.q.midi;
  });
  await expect(page.locator('#rdx-kb')).toHaveCount(0);
  const key = page.locator(`#keys .key[data-midi="${midi}"]`);
  await expect(key).toHaveAttribute('aria-label', /\S/);
  await key.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => ({ n: window.__etude.RD.n, ok: window.__etude.RD.ok }))).toEqual({ n: 1, ok: 1 });
});

test.describe('reading drills: note stream', () => {
  const start = (page, spec, mode = 'practice', prefs = {}) => page.evaluate(({ spec, mode, prefs }) => {
    const e = window.__etude;
    Object.assign(e.rdData().prefs, prefs);
    const level = Object.values(e.RD_LV).find(l => !l.acc && !l.keys && Object.entries(spec).every(([k, v]) => l[k] === v));
    e.rdOpen(level);
    e.rdStart(mode);
  }, { spec, mode, prefs });
  const play = (page, m) => page.evaluate(m => {
    window.__etude.midiIn(0x90, m, 100, 'midi');
    window.__etude.midiIn(0x80, m, 0, 'midi');
  }, m);
  const state = page => page.evaluate(() => {
    const { RD } = window.__etude;
    return { cur: RD.flow ? RD.flow.cur : null, n: RD.n, ok: RD.ok, midi: RD.q && RD.q.midi, li: RD.q && RD.q.note.li };
  });
  const TREBLE_PLAY = { ty: 'play', clef: 'treble' };

  test('play drills show a row of notes to read ahead, and a right note moves on', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY);
    await expect(page.locator('#rdx-staff.rdx-flow')).toBeVisible();
    expect(await page.locator('#rdx-staff .ss-n').count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('#rdx-staff .ss-n[data-s="now"]')).toHaveCount(1);
    await expect(page.locator('#rdx-staff .rdx-now')).toHaveCount(1);
    await expect(page.locator('#rdx-staff .rdx-ghost')).toHaveCount(0);
    await expect(page.locator('#rdx-kb')).toHaveCount(0);
    await play(page, (await state(page)).midi);
    expect(await state(page)).toMatchObject({ cur: 1, n: 1, ok: 1 });
    await expect(page.locator('#rdx-staff .ss-n[data-s="good"]')).toHaveCount(1);
  });

  test('a wrong note counts once, shows the right one and waits until it is played', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    await start(page, TREBLE_PLAY);
    const { midi } = await state(page);
    await play(page, midi + 2);
    expect(await state(page)).toMatchObject({ cur: 0, n: 1, ok: 0, midi });
    await expect(page.locator('#rdx-fb')).toHaveClass(/\bbad\b/);
    await expect(page.locator('#rdx-staff .ss-n[data-s="bad"]')).toHaveCount(1);
    await expect(page.locator('#rdx-staff .rdx-lbl')).toHaveCount(1);
    await expect(page.locator(`#keys .key[data-midi="${midi}"]`)).toHaveAttribute('data-s', 'target');
    await expect(page.locator(`#keys .key[data-midi="${midi + 2}"]`)).toHaveAttribute('data-s', 'bad');
    await play(page, midi + 2);
    expect(await state(page)).toMatchObject({ cur: 0, n: 1 });
    await play(page, midi);
    expect(await state(page)).toMatchObject({ cur: 1, n: 1, ok: 0 });
    await expect(page.locator('#rdx-fb')).not.toHaveClass(/\bbad\b/);
    await expect(page.locator('#keys [data-s="target"], #keys [data-s="bad"]')).toHaveCount(0);
    await expect(page.locator('#rdx-staff .rdx-lbl')).toHaveCount(1);
    await play(page, (await state(page)).midi);
    expect(await state(page)).toMatchObject({ cur: 2, n: 2, ok: 1 });
  });

  test('on the big keyboard, a key an octave away from the note is wrong', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    await start(page, TREBLE_PLAY);
    const { midi } = await state(page);
    await page.locator(`#keys .key[data-midi="${midi + 12}"]`).press('Enter');
    await expect.poll(() => state(page)).toMatchObject({ cur: 0, n: 1, ok: 0 });
    await page.locator(`#keys .key[data-midi="${midi}"]`).press('Enter');
    await expect.poll(() => state(page)).toMatchObject({ cur: 1, n: 1, ok: 0 });
  });

  test('a test run ends after 20 notes', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY, 'test');
    await page.evaluate(() => {
      const e = window.__etude;
      for (let i = 0; i < 20; i++) {
        const m = e.RD.q.midi;
        e.midiIn(0x90, m, 100, 'midi');
        e.midiIn(0x80, m, 0, 'midi');
      }
    });
    expect(await state(page)).toMatchObject({ n: 20, ok: 20 });
    await expect(page.locator('#rdx-sum')).toBeVisible();
  });

  test('with the stream turned off, play drills show one note at a time', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY, 'practice', { flow: false });
    await expect(page.locator('#rdx-staff .ss-n')).toHaveCount(1);
    await expect(page.locator('#rdx-staff')).not.toHaveClass(/rdx-flow/);
    await expect(page.locator('#rdx-kb')).toHaveCount(0);
    expect(await page.evaluate(() => window.__etude.RD.flow)).toBeNull();
  });

  test('one note at a time, a wrong note marks the right and played keys on the big keyboard until the next note', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    await start(page, TREBLE_PLAY, 'practice', { flow: false });
    const { midi } = await state(page);
    await play(page, midi + 2);
    await expect(page.locator(`#keys .key[data-midi="${midi}"]`)).toHaveAttribute('data-s', 'good');
    await expect(page.locator(`#keys .key[data-midi="${midi + 2}"]`)).toHaveAttribute('data-s', 'bad');
    await expect.poll(() => page.evaluate(() => window.__etude.RD.answered)).toBe(false);
    await expect(page.locator('#keys [data-s="good"], #keys [data-s="bad"]')).toHaveCount(0);
  });

  test('in the dark theme, the ✓ and ✗ on white keys stay readable', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
    await start(page, TREBLE_PLAY, 'practice', { flow: false });
    const { midi } = await state(page);
    await play(page, [4, 11].includes(midi % 12) ? midi + 1 : midi + 2);
    const ratios = await page.evaluate(() => {
      const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      const lum = color => { const [r, g, b] = color.match(/[\d.]+/g).map(Number); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
      return [...document.querySelectorAll('#keys .white[data-s="good"], #keys .white[data-s="bad"]')].map(key => {
        const mark = lum(getComputedStyle(key.querySelector('.mk')).color);
        const top = lum(getComputedStyle(key).backgroundImage.match(/rgba?\([^)]*\)/)[0]);
        return (Math.max(mark, top) + 0.05) / (Math.min(mark, top) + 0.05);
      });
    });
    expect(ratios).toHaveLength(2);
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('the ghost pacer is opt-in and shows the lead in the HUD', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY, 'practice', { ghost: true });
    await expect(page.locator('#rdx-staff .rdx-ghost')).toHaveCount(1);
    await expect(page.locator('#rdx-hud')).toContainText('👻');
  });

  test('turning the stream off on the drills page also turns off the ghost option', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    const flow = page.locator('#rdx-flow'), ghost = page.locator('#rdx-ghost');
    await expect(flow).toBeChecked();
    await expect(ghost).toBeEnabled();
    await flow.uncheck();
    await expect(ghost).toBeDisabled();
    expect(await page.evaluate(() => window.__etude.rdData().prefs.flow)).toBe(false);
  });

  test('name drills stream too: digit keys answer, and a wrong letter marks the right one', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await start(page, { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5' });
    await expect(page.locator('#rdx-staff.rdx-flow')).toBeVisible();
    const s0 = await state(page);
    await page.keyboard.press(String(s0.li + 1));
    await expect.poll(() => state(page)).toMatchObject({ cur: 1, n: 1, ok: 1 });
    const s1 = await state(page), other = (s1.li + 1) % 7;
    await page.keyboard.press(String(other + 1));
    await expect.poll(() => state(page)).toMatchObject({ cur: 1, n: 2, ok: 1 });
    await expect(page.locator(`#rdx-ans .rdx-a[data-a="${s1.li}"]`)).toHaveClass(/\bcorrect\b/);
    await expect(page.locator(`#rdx-ans .rdx-a[data-a="${other}"]`)).toHaveClass(/\bwrong\b/);
    await page.keyboard.press(String(s1.li + 1));
    await expect.poll(() => state(page)).toMatchObject({ cur: 2, n: 2, ok: 1 });
    await expect(page.locator('#rdx-ans .rdx-a.correct, #rdx-ans .rdx-a.wrong')).toHaveCount(0);
  });
});

test.describe('reading drills: arcade modes', () => {
  const TREBLE_PLAY = { ty: 'play', clef: 'treble' };
  const open = (page, spec) => page.evaluate(spec => {
    const e = window.__etude;
    const level = Object.values(e.RD_LV).find(l => !l.acc && !l.keys && Object.entries(spec).every(([k, v]) => l[k] === v));
    e.rdOpen(level);
    return level.id;
  }, spec);
  const start = async (page, spec, mode) => {
    const id = await open(page, spec);
    await page.evaluate(mode => window.__etude.rdStart(mode), mode);
    return id;
  };
  const play = (page, m) => page.evaluate(m => {
    window.__etude.midiIn(0x90, m, 100, 'midi');
    window.__etude.midiIn(0x80, m, 0, 'midi');
  }, m);
  // Plays the right note n times in a row, as fast as the stream allows.
  const playRight = (page, n) => page.evaluate(n => {
    const e = window.__etude;
    for (let i = 0; i < n; i++) {
      const m = e.RD.q.midi;
      e.midiIn(0x90, m, 100, 'midi');
      e.midiIn(0x80, m, 0, 'midi');
    }
  }, n);
  const arc = page => page.evaluate(() => window.__etude.RD.arc);
  const record = (page, id) => page.evaluate(id => window.__etude.rdData().lv[id], id);
  const fill = (s, ...args) => args.reduce((r, a) => r.replace('%s', String(a)), s);
  const modes = page => page.locator('#rdx-body .rdx-modes [data-mode]').evaluateAll(els => els.map(el => el.dataset.mode + (el.dataset.bars ? ':' + el.dataset.bars : '')));

  test('naming and playing levels offer Survival, Time Attack and Marathon; rhythm and sight-reading do not', async ({ app }) => {
    const page = await app.open({ hash: 'read', lang: 'ro' });
    const ro = STRINGS.ro, arcade = ['practice', 'test', 'rush', 'survival', 'timeAttack'];
    await open(page, TREBLE_PLAY);
    expect(await modes(page)).toEqual([...arcade, 'marathon:16', 'marathon:32', 'marathon:64']);
    await expect(page.locator('#rdx-body [data-mode="survival"]')).toContainText(ro.rdx_m_survival);
    await expect(page.locator('#rdx-body [data-mode="timeAttack"]')).toContainText(ro.rdx_m_timeAttack);
    await expect(page.getByRole('group', { name: ro.rdx_m_marathon })).toContainText(ro.rdx_bars);
    for (const n of [16, 32, 64])
      await expect(page.getByRole('button', { name: `${ro.rdx_m_marathon}, ${ro.rdx_bars} ${n}`, exact: true })).toBeVisible();
    for (const [ty, expected] of [['k2s', arcade], ['iv', arcade], ['rh', ['practice', 'test']], ['sr', ['practice', 'test']]]) {
      await page.evaluate(ty => window.__etude.rdOpen(Object.values(window.__etude.RD_LV).find(l => l.ty === ty)), ty);
      expect(await modes(page), ty).toEqual(expected);
    }
    await page.evaluate(() => window.__etude.rdStart('survival'));
    expect(await page.evaluate(() => window.__etude.RD.on)).toBe(false);
  });

  test('Survival: a wrong note or a note left too long costs a life, and the third ends the run', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    const en = STRINGS.en, hud = page.locator('#rdx-hud'), fb = page.locator('#rdx-fb');
    const id = await start(page, TREBLE_PLAY, 'survival');
    await expect(hud).toContainText('♥♥♥');
    // A short window from the next note on, so it times out quickly.
    await page.evaluate(() => { const { RD } = window.__etude; RD.arc = { ...RD.arc, targetMs: 400 }; });
    await playRight(page, 1);
    expect((await arc(page)).correct).toBe(1);
    await expect.poll(async () => (await arc(page)).timeouts).toBe(1);
    await expect(fb).toContainText('⏱ ' + en.rdx_timeout);
    await expect(fb).toContainText(fill(en.rdx_lives, 2));
    await expect(hud).toContainText('♥♥♡');
    // The stream waits for the right note; the next note is then played wrong.
    await page.evaluate(() => {
      const e = window.__etude, hit = m => { e.midiIn(0x90, m, 100, 'midi'); e.midiIn(0x80, m, 0, 'midi'); };
      hit(e.RD.q.midi);
      hit(e.RD.q.midi + 2);
    });
    expect(await arc(page)).toMatchObject({ lives: 1, mistakes: 2, timeouts: 1 });
    await expect(hud).toContainText('♥♡♡');
    await play(page, await page.evaluate(() => window.__etude.RD.q.midi));
    await expect(page.locator('#rdx-sum')).toBeVisible();
    const final = await arc(page);
    expect(final).toMatchObject({ lives: 0, timeouts: 2, completed: true });
    expect(final.score).toBeGreaterThan(0);
    expect((await record(page, id)).sv).toBe(final.score);
    await expect(page.locator('#rdx-sum')).toContainText('🏆');
    await expect(page.locator('#rdx-next')).toContainText(en.rdn_sv_time);
  });

  test('Time Attack: ten right notes in a row add 5 seconds, and the run ends with the clock', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    const hud = page.locator('#rdx-hud');
    const id = await start(page, TREBLE_PLAY, 'timeAttack');
    await expect(hud).toContainText(/⏱ (89|90)s/);
    await playRight(page, 10);
    expect(await page.evaluate(() => {
      const { RD } = window.__etude;
      return { combo: RD.arc.combo, length: Math.round(RD.arc.deadlineMs - RD.arc.startedAtMs), synced: RD.rushEnd === RD.arc.deadlineMs };
    })).toEqual({ combo: 10, length: 95000, synced: true });
    await expect(page.locator('#rdx-fb')).toContainText(STRINGS.en.rdx_ta_bonus);
    await expect(hud).toContainText('×2');
    await expect(hud).toContainText('🔥 10');
    await page.evaluate(() => { const { RD } = window.__etude; RD.rushEnd = performance.now() - 1; RD.arc = { ...RD.arc, deadlineMs: RD.rushEnd }; });
    await expect(page.locator('#rdx-sum')).toBeVisible();
    const final = await arc(page);
    expect(final).toMatchObject({ correct: 10, completed: true });
    expect((await record(page, id)).ta).toBe(final.score);
    await expect(page.locator('#rdx-sum')).toContainText('🏆');
  });

  test('Marathon: 16 bars are 64 notes with barlines, and the run saves the notes per minute', async ({ app }) => {
    const page = await app.open({ hash: 'read', lang: 'ro' });
    const ro = STRINGS.ro;
    const id = await open(page, TREBLE_PLAY);
    await page.getByRole('button', { name: `${ro.rdx_m_marathon}, ${ro.rdx_bars} 16`, exact: true }).click();
    expect(await arc(page)).toMatchObject({ mode: 'marathon', marathonBars: 16, total: 64 });
    await expect(page.locator('#rdx-hud')).toContainText('1 / 64');
    expect(await page.locator('#rdx-staff .rdx-barline').count()).toBeGreaterThan(0);
    await playRight(page, 63);
    await expect(page.locator('#rdx-hud')).toContainText('64 / 64');
    await playRight(page, 1);
    await expect(page.locator('#rdx-sum')).toBeVisible();
    expect(await arc(page)).toMatchObject({ correct: 64, mistakes: 0, completed: true });
    const mn = (await record(page, id)).mn;
    expect(mn).toBeGreaterThan(0);
    await expect(page.locator('#rdx-sum')).toContainText(fill(ro.rdx_npm, mn));
    await page.locator('#rdx-sum [data-act="again"]').click();
    expect(await arc(page)).toMatchObject({ mode: 'marathon', total: 64, correct: 0 });
  });

  test('a running drill fills the screen, and Esc leaves the stage for the mode picker', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY, 'survival');
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    await expect(page.locator('header .bar')).toBeHidden();
    await expect(page.locator('#rd-tabs')).toBeHidden();
    await expect(page.locator('#rdx-end')).toHaveAttribute('aria-keyshortcuts', 'Escape');
    const fsOk = await page.evaluate(() => !!document.fullscreenEnabled);
    await expect(page.locator('#rdx-fs')).toBeVisible({ visible: fsOk });
    const box = await page.locator('#rdx-stage').boundingBox();
    expect(box.y).toBeLessThanOrEqual(1);
    expect(box.height).toBeGreaterThan(700);
    const svg = await page.locator('#rdx-staff svg').first().boundingBox();
    expect(svg.height).toBeGreaterThan(250);

    await page.keyboard.press('Escape');
    await expect(page.locator('#rdx-body .rdx-modes')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.RD.on)).toBe(false);
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    await expect(page.locator('header .bar')).toBeVisible();
    await expect(page.locator('#rdx-fs')).toBeHidden();
    await expect(page.locator(':focus')).toHaveCount(1);
  });

  test('turning the stage off keeps a running drill inside the page', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await page.locator('#rdx-stage-pref').uncheck();
    expect(await page.evaluate(() => window.__etude.rdData().prefs.stage)).toBe(false);
    await start(page, TREBLE_PLAY, 'survival');
    await expect(page.locator('#rdx-staff svg')).toBeVisible();
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    await expect(page.locator('header .bar')).toBeVisible();
  });

  test('on the stage, Marathon reads as a page of systems with the current one on top', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 900 });
    await app.open({ hash: 'read' });
    await start(page, TREBLE_PLAY, 'marathon');
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    const systems = page.locator('#rdx-staff > .rdx-svg');
    expect(await systems.count()).toBeGreaterThanOrEqual(2);
    await expect(systems.first()).not.toHaveAttribute('aria-hidden', 'true');
    await expect(systems.first().locator('.ss-n[data-s=now]')).toHaveCount(1);
    const per = await page.evaluate(() => window.__etude.RD.flow.geo.n);
    expect(per % 4).toBe(0);
    await playRight(page, per);
    await expect(page.locator('#rdx-hud')).toContainText(`${per + 1} / `);
    expect(await page.evaluate(() => window.__etude.RD.flow.start)).toBe(per);
    await expect(systems.first().locator('.ss-n[data-s=now]')).toHaveCount(1);
  });

  test('with a MIDI keyboard connected the stage folds the on-screen keys to a rail, and they come back after', async ({ app }) => {
    const page = app.page, name = 'Stage Piano';
    await page.addInitScript(name => {
      const input = { id: 'stage', name, type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), sysexEnabled: false, onstatechange: null }) });
    }, name);
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'read', dock: true });
    await page.locator('#midiChip').click();
    await expect(page.locator('#midiText')).toHaveText(name);
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
    await start(page, TREBLE_PLAY, 'survival');
    await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
    await expect(page.locator('#dock-rail-note')).toHaveText(fill(STRINGS.en.stage_rail_midi, name));
    await page.locator('#dock-kb-toggle').click();
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
    expect(await page.evaluate(() => window.__etude.STAGE.kb)).toBe(true);
    await page.locator('#dock-kb-toggle').click();
    await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
  });

  test('sight-reading a piece takes the stage too, and Esc stops it', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'read' });
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-go').click();
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    await expect(page.locator('#rd-staff svg')).toBeVisible();
    await expect(page.locator('#rd-stage-top')).toBeVisible();
    await expect(page.locator('#rd-stage-title')).not.toBeEmpty();
    const h = (await page.locator('#rd-staff svg').boundingBox()).height;
    expect(h).toBeGreaterThan(160);
    const overflow = await page.locator('#rd-staff').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    expect(await page.evaluate(() => window.__etude.SR.active)).toBe(false);
    await expect(page.locator('#rd-go')).toBeFocused();
    await page.locator('#rd-go').click();
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    await page.locator('#rd-stage-end').click();
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    expect(await page.evaluate(() => window.__etude.SR.active)).toBe(false);
  });

  test('quitting an arcade run saves no result', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    const id = await start(page, TREBLE_PLAY, 'survival');
    await playRight(page, 1);
    await expect(page.locator('#rdx-end')).toHaveText(STRINGS.en.rdx_quit);
    await page.locator('#rdx-end').click();
    await expect(page.locator('#rdx-body .rdx-modes')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.RD.on)).toBe(false);
    expect(await record(page, id)).toBeUndefined();
  });
});

test('Settings controls receive localized programmatic labels', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  for (const id of ['deviceSelect', 'toneSel', 'set-goal', 'set-new', 'set-wake', 'set-synth', 'set-drone', 'set-metronome', 'set-inv', 'set-weak-inject', 'set-any-octave']) {
    const control = page.locator('#' + id);
    await expect(control).toHaveAttribute('aria-labelledby', id + '-label');
    expect(await control.evaluate(el => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim())).toBeTruthy();
  }
  await expect(page.locator('#set-new')).toHaveAttribute('aria-describedby', 'set-new-help');
  await expect(page.locator('#set-any-octave')).toHaveAttribute('aria-describedby', 'set-any-octave-help');
  const englishInputLabel = await page.locator('#deviceSelect').evaluate(el => document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim());
  await page.locator('#set-lang button[data-v="ro"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  const romanianInputLabel = await page.locator('#deviceSelect').evaluate(el => document.getElementById(el.getAttribute('aria-labelledby')).textContent.trim());
  expect(romanianInputLabel).not.toBe(englishInputLabel);
});

test('weak-spot injection is opt-in and steers only practice, survival and marathon', async ({ app, page }) => {
  await app.open({ hash: 'read' });
  await expect(page.locator('#rdx-weak-inject')).not.toBeChecked();
  await page.locator('#settingsBtn').click();
  await page.locator('label:has(#set-weak-inject)').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rdx-weak-inject')).toBeChecked();
  await page.locator('label:has(#rdx-weak-inject)').click();
  await expect.poll(() => page.evaluate(() => ({
    setting: window.__etude.data.settings.weakSpotInjection,
    saved: JSON.parse(localStorage.getItem('ptt-v3')).data.settings.weakSpotInjection,
  }))).toEqual({ setting: false, saved: false });

  const result = await page.evaluate(() => {
    const api = window.__etude;
    api.rdOpen(Object.values(api.RD_LV).find(candidate => candidate.ty === 'name'));
    const random = Math.random;
    const pick = (mode, value, inject) => {
      api.rdStart(mode);
      api.data.settings.weakSpotInjection = inject;
      api.RD.lastK = null;
      Math.random = () => value;
      api.rdNext();
      Math.random = random;
      return api.RD.q.key;
    };
    // Math.random() = 0 draws the level's first note unless injection replaces it, so the last note is made the weak one.
    const first = pick('practice', 0, false), weakKey = pick('practice', 0.999, false);
    api.data.reading.nt[weakKey] = { n: 10, ok: 4, ms: 60000, e: 1, t: 6000 };
    const picks = { first, weakKey, injected: pick('practice', 0, true), standard: pick('practice', 0, false), survival: pick('survival', 0, true), marathon: pick('marathon', 0, true), rush: pick('rush', 0, true) };
    api.rdClear();
    return picks;
  });
  expect(result.weakKey).not.toBe(result.first);
  expect(result).toMatchObject({ injected: result.weakKey, standard: result.first, survival: result.weakKey, marathon: result.weakKey, rush: result.first });
});

test('leaving the window lets go of keys held on the computer keyboard or screen, and nothing else', async ({ app, page }) => {
  await app.open({ hash: 'accompany', dock: true });
  await page.evaluate(() => window.__etude.accompStart());
  const box = await page.locator('#keys .key.white[data-midi="67"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();                                                                          // G4 on the screen
  await page.keyboard.down('a');                                                                    // C4 from the computer keyboard
  await page.evaluate(() => { window.__etude.midiIn(0x90, 64, 100, 'midi'); window.__etude.midiIn(0xB0, 64, 127, 'midi'); });    // E4 and the sustain pedal on a MIDI keyboard
  const state = () => page.evaluate(() => ({ accomp: window.__etude.accomp.on, held: window.__etude.heldMidis().sort((a, b) => a - b), pointer: window.__etude.pointerKey.size, typing: window.__etude.typingDown.size, pedal: window.__etude.pedalDown }));
  expect(await state()).toEqual({ accomp: true, held: [60, 64, 67], pointer: 1, typing: 1, pedal: true });

  // No key-up or pointer-up reaches an unfocused window: those keys are let go; the accompaniment, the MIDI key and the pedal stay.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await state()).toEqual({ accomp: true, held: [64], pointer: 0, typing: 0, pedal: true });

  // A hidden tab still stops everything.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  expect(await state()).toEqual({ accomp: false, held: [], pointer: 0, typing: 0, pedal: false });
  await page.mouse.up();
  await page.keyboard.up('a');
  expect(await state()).toEqual({ accomp: false, held: [], pointer: 0, typing: 0, pedal: false });
});

test.describe('daily goal and streak', () => {
  const y = todayN() - 1;
  const seeded = { streak: 3, bestStreak: 3, lastActive: y, todayDay: y, todayCount: 7, newToday: 2, totalReviews: 40, totalCorrect: 30, history: { [y]: 7 } };
  const saved = { v: 3, lang: 'en', data: { ...seeded, placed: true } };
  const counters = page => page.evaluate(() => {
    const pick = d => ({ streak: d.streak, bestStreak: d.bestStreak, lastActive: d.lastActive, todayDay: d.todayDay, todayCount: d.todayCount, newToday: d.newToday, totalReviews: d.totalReviews, totalCorrect: d.totalCorrect, history: d.history });
    return { mem: pick(window.__etude.data), stored: pick(JSON.parse(localStorage.getItem('ptt-v3')).data), cards: Object.values(window.__etude.data.srs).map(c => c.reps) };
  });

  test('a targeted drill changes neither the review schedule nor the daily goal or streak', async ({ app, page }) => {
    await app.open({ saved, hash: 'practice' });
    await page.locator('#pr-start').click();
    await page.evaluate(() => { for (let i = 0; i < 3; i++) { window.__etude.resolve(window.__etude.SES.q, i !== 1); window.__etude.nextQuestion(); } window.__etude.endSession(true); });
    expect(await counters(page)).toEqual({ mem: seeded, stored: seeded, cards: [] });
    expect(await page.evaluate(() => window.__etude.data.lastDrill)).toMatchObject({ c: 2, n: 3, day: todayN() });
    await expect(page.locator('#pr-last')).toContainText('2 / 3 correct');
  });

  test('regular reviews and placement answers still count toward the daily goal and streak', async ({ app, page }) => {
    await app.open({ saved });
    const T = todayN();
    await page.evaluate(() => { window.__etude.startSession(null); window.__etude.resolve(window.__etude.SES.q, true); window.__etude.endSession(false); });
    const reviewed = { streak: 4, bestStreak: 4, lastActive: T, todayDay: T, todayCount: 1, newToday: 1, totalReviews: 41, totalCorrect: 31, history: { [y]: 7, [T]: 1 } };
    expect(await counters(page)).toEqual({ mem: reviewed, stored: reviewed, cards: [1] });
    await page.evaluate(() => { window.__etude.startPlacement(); window.__etude.resolve(window.__etude.SES.q, true); window.__etude.endSession(false); });
    const placed = { ...reviewed, todayCount: 2, totalReviews: 42, totalCorrect: 32, history: { [y]: 7, [T]: 2 } };
    expect(await counters(page)).toMatchObject({ mem: placed, stored: placed });
  });
});

test.describe('several open tabs', () => {
  const T = todayN();
  const saved = { v: 3, lang: 'en', data: { streak: 2, bestStreak: 2, lastActive: T, todayDay: T, todayCount: 4, newToday: 0, totalReviews: 10, totalCorrect: 8, placed: true, history: { [T]: 4 } } };
  // A second tab shares the storage (and its `storage` events) and loads whatever the first tab saved.
  const openTab = async page => {
    const tab = await page.context().newPage(), errors = [];
    tab.on('pageerror', e => errors.push(e.message));
    await tab.goto(APP);
    await tab.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
    return { tab, errors };
  };
  const answer = page => page.evaluate(() => { if (window.__etude.SES.answered) { window.__etude.SES.idx++; window.__etude.nextQuestion(); } window.__etude.resolve(window.__etude.SES.q, true); });
  const record = page => page.evaluate(() => {
    const pick = d => ({ reviews: d.totalReviews, today: d.todayCount, cards: Object.keys(d.srs || {}).sort() }), s = JSON.parse(localStorage.getItem('ptt-v3'));
    return { mem: pick(window.__etude.data), stored: pick(s.data), gen: s.gen };
  });

  test('reviews saved in two tabs add up instead of overwriting each other, and a running session carries on', async ({ app, page }) => {
    await app.open({ saved });
    await page.evaluate(() => window.__etude.startSession(null));
    await answer(page);
    const { tab, errors } = await openTab(page);
    const queue = await page.evaluate(() => window.__etude.SES.queue.map(q => q.it.id));
    const other = await tab.evaluate(ids => { const id = window.__etude.ITEMS.find(it => !ids.includes(it.id)).id; window.__etude.reviewItem(id, true); return id; }, queue);
    await expect.poll(() => page.evaluate(id => !!window.__etude.data.srs[id], other)).toBe(true);
    await answer(page);
    const want = { reviews: 13, today: 7, cards: [...new Set([...queue.slice(0, 2), other])].sort() };
    await expect.poll(async () => { const a = await record(page), b = await record(tab); return [a.mem, a.stored, b.mem]; }).toEqual([want, want, want]);
    expect(await page.evaluate(() => window.__etude.SES.active)).toBe(true);
    await expect(page.locator('#syncNote')).toBeHidden();
    await expect(tab.locator('#syncNote')).toBeHidden();
    expect(errors).toEqual([]);
    await tab.close();
  });

  test('two saves that start from the same record retain both reviews', async ({ app, page }) => {
    await app.open({ saved });
    const { tab, errors } = await openTab(page);
    const [first, second] = await page.evaluate(() => window.__etude.ITEMS.slice(0, 2).map(it => it.id));

    await tab.evaluate(() => {
      window.__raceSyncPull = window.__etude.syncPull;
      window.__etude.syncPull = () => null;
    });
    await page.evaluate(id => window.__etude.reviewItem(id, true), first);
    expect(await tab.evaluate(() => window.__etude.data.totalReviews)).toBe(10);   // the held tab has not taken the other save in
    await tab.evaluate(id => {
      // Model the narrow race where this tab read the old record immediately before the other tab wrote.
      window.__etude.reviewItem(id, true);
      window.__etude.syncPull = window.__raceSyncPull;
      delete window.__raceSyncPull;
    }, second);

    const want = { reviews: 12, today: 6, cards: [first, second].sort() };
    await expect.poll(() => record(page)).toMatchObject({ mem: want, stored: want });
    await tab.evaluate(() => window.__etude.syncPull());
    await expect.poll(async () => { const a = await record(page), b = await record(tab); return [a.mem, a.stored, b.mem]; }).toEqual([want, want, want]);
    expect(errors).toEqual([]);
    await tab.close();
  });

  test('two simultaneous reviews of the same new card advance it twice but consume one new-card slot', async ({ app, page }) => {
    await app.open({ saved });
    const { tab, errors } = await openTab(page);
    const id = await page.evaluate(() => window.__etude.ITEMS[0].id);

    await tab.evaluate(() => {
      window.__raceSyncPull = window.__etude.syncPull;
      window.__etude.syncPull = () => null;
    });
    await page.evaluate(id => window.__etude.reviewItem(id, true), id);
    expect(await tab.evaluate(() => window.__etude.data.totalReviews)).toBe(10);   // the held tab has not taken the other save in
    await tab.evaluate(id => {
      window.__etude.reviewItem(id, true);
      window.__etude.syncPull = window.__raceSyncPull;
      delete window.__raceSyncPull;
    }, id);

    const want = { reviews: 12, correct: 10, today: 6, fresh: 1, card: { box: 2, ease: 2.4, reps: 2, lapses: 0, due: T + 2, last: T } };
    const state = p => p.evaluate(id => {
      const s = JSON.parse(localStorage.getItem('ptt-v3')).data;
      const pick = d => ({ reviews: d.totalReviews, correct: d.totalCorrect, today: d.todayCount, fresh: d.newToday, card: { ...d.srs[id], ease: Number(d.srs[id].ease.toFixed(2)) } });
      return { mem: pick(window.__etude.data), stored: pick(s) };
    }, id);
    await expect.poll(() => state(page)).toEqual({ mem: want, stored: want });
    await tab.evaluate(() => window.__etude.syncPull());
    await expect.poll(() => state(tab)).toEqual({ mem: want, stored: want });
    expect(errors).toEqual([]);
    await tab.close();
  });

  const hold = p => p.evaluate(() => { window.__raceSyncPull = window.__etude.syncPull; window.__etude.syncPull = () => null; });
  const release = p => p.evaluate(() => { window.__etude.syncPull = window.__raceSyncPull; delete window.__raceSyncPull; });
  const tally = (p, ids) => p.evaluate(ids => {
    const pick = d => ({ reviews: d.totalReviews, today: d.todayCount, fresh: d.newToday, reps: ids.map(id => d.srs[id] && d.srs[id].reps) });
    return { mem: pick(window.__etude.data), stored: pick(JSON.parse(localStorage.getItem('ptt-v3')).data) };
  }, ids);

  test('a review of a card first saved by another tab survives when both tabs then save at once', async ({ app, page }) => {
    await app.open({ saved });
    const { tab, errors } = await openTab(page);
    const id = await page.evaluate(() => window.__etude.ITEMS[0].id);

    await tab.evaluate(id => window.__etude.reviewItem(id, true), id);   // this tab takes the card in from the other tab's save
    await expect.poll(() => page.evaluate(id => !!window.__etude.data.srs[id], id)).toBe(true);
    await hold(tab);
    await page.evaluate(id => window.__etude.reviewItem(id, true), id);
    expect(await tab.evaluate(() => window.__etude.data.totalReviews)).toBe(11);   // the held tab has not taken the other save in
    await tab.evaluate(id => { window.__etude.reviewItem(id, true); window.__etude.syncPull = window.__raceSyncPull; delete window.__raceSyncPull; }, id);

    const want = { reviews: 13, today: 7, fresh: 1, reps: [3] };
    await expect.poll(async () => { const a = await tally(page, [id]), b = await tally(tab, [id]); return [a.mem, a.stored, b.mem]; }).toEqual([want, want, want]);
    expect(errors).toEqual([]);
    await tab.close();
  });

  test('a save that two tabs merge at the same time is counted once', async ({ app, page }) => {
    await app.open({ saved });
    const b = await openTab(page), c = await openTab(page);
    const ids = await page.evaluate(() => window.__etude.ITEMS.slice(0, 2).map(it => it.id));

    await hold(b.tab);                                     // B misses A's save, which C takes in
    await page.evaluate(id => window.__etude.reviewItem(id, true), ids[0]);
    await expect.poll(() => c.tab.evaluate(id => !!window.__etude.data.srs[id], ids[0])).toBe(true);
    await hold(page);
    await hold(c.tab);
    await b.tab.evaluate(id => window.__etude.reviewItem(id, true), ids[1]);
    await release(b.tab);
    // A and C both read B's save; A's merged save lands first, and B takes it in before C's lands.
    await c.tab.evaluate(() => window.__raceSyncPull());
    await release(page);
    await page.evaluate(() => window.__etude.saveAll());
    await expect.poll(() => b.tab.evaluate(id => !!window.__etude.data.srs[id], ids[0])).toBe(true);
    await c.tab.evaluate(() => window.__etude.syncWrite());
    await release(c.tab);

    const want = { reviews: 12, today: 6, fresh: 2, reps: [1, 1] };
    await expect.poll(async () => {
      const [x, y, z] = await Promise.all([page, b.tab, c.tab].map(p => tally(p, ids)));
      return [x.mem, x.stored, y.mem, z.mem];
    }).toEqual([want, want, want, want]);
    expect([...b.errors, ...c.errors]).toEqual([]);
    await b.tab.close();
    await c.tab.close();
  });

  test('a reset in another tab is adopted with a notice, the session goes on, and an older record cannot overwrite it', async ({ app, page }) => {
    await app.open({ saved });
    await page.evaluate(() => window.__etude.startSession(null));
    await answer(page);
    const { tab, errors } = await openTab(page);
    const gen = await tab.evaluate(() => { window.confirm = () => true; window.__etude.$('resetBtn').click(); return window.__etude.SYNC.gen; });
    expect(gen).not.toBe('');
    await expect(page.locator('#syncNote')).toBeVisible();
    expect(await page.evaluate(() => ({ reviews: window.__etude.data.totalReviews, gen: window.__etude.SYNC.gen, session: window.__etude.SES.active }))).toEqual({ reviews: 0, gen, session: true });

    await answer(page);   // the session saves into the adopted record
    expect(await record(page)).toMatchObject({ mem: { reviews: 1, today: 1 }, stored: { reviews: 1, today: 1 }, gen });

    // A tab still holding the record from before the reset saves it: this tab puts the newer one back.
    await tab.evaluate(() => localStorage.setItem('ptt-v3', JSON.stringify({ v: 3, gen: '', lang: 'en', data: { totalReviews: 99 } })));
    await expect.poll(async () => { const r = await record(page); return { gen: r.gen, reviews: r.stored.reviews }; }).toEqual({ gen, reviews: 1 });

    await page.locator('#syncNoteBtn').click();
    await expect(page.locator('#syncNote')).toBeHidden();
    expect(errors).toEqual([]);
    await tab.close();
  });

  test('a theme change in another tab applies at once; a language change waits until this tab\'s session ends', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await app.open({ saved });
    await page.evaluate(() => window.__etude.startSession(null));
    const { tab, errors } = await openTab(page);
    await tab.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); window.__etude.saveAll(); });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await tab.evaluate(() => window.__etude.setLang('ro'));
    await expect.poll(() => page.evaluate(() => window.__etude.SYNC.pend.lang && window.__etude.SYNC.pend.lang.v)).toBe('ro');
    expect(await page.evaluate(() => window.__etude.lang)).toBe('en');   // no re-render in the middle of the session
    await answer(page);                                   // this tab saves meanwhile and keeps the other tab's choice
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).lang)).toBe('ro');

    await page.evaluate(() => window.__etude.endSession(false));
    await expect.poll(() => page.evaluate(() => window.__etude.lang), { timeout: 5000 }).toBe('ro');
    await expect(page.locator('#pr-start')).toHaveText('Începe exersarea');
    expect(errors).toEqual([]);
    await tab.close();
  });
});

test('the computer-keyboard piano follows physical key positions, whatever the layout prints on them', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  const r = await page.evaluate(() => {
    const send = (type, key, code, target = document) => target.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));
    const out = {};
    send('keydown', 'z', 'KeyY'); out.qwertzZ = window.__etude.heldMidis();       // German Z sits where QWERTY has Y: A♭4, not an octave change
    send('keyup', 'z', 'KeyY'); out.released = window.__etude.heldMidis();
    send('keydown', 'y', 'KeyZ'); send('keyup', 'y', 'KeyZ');      // German Y sits where QWERTY has Z: octave down
    out.octave = window.__etude.typeOctave;
    send('keydown', 'q', 'KeyA'); out.azertyQ = window.__etude.heldMidis();       // French Q sits where QWERTY has A: C, an octave lower now
    send('keyup', 'q', 'KeyA');
    send('keydown', 'a', 'KeyQ'); out.azertyA = window.__etude.heldMidis();       // French A sits where QWERTY has Q: not a piano key
    send('keyup', 'a', 'KeyQ');
    const input = document.createElement('input');
    document.body.appendChild(input); input.focus();
    send('keydown', 'a', 'KeyA', input); out.typingInField = window.__etude.heldMidis();
    send('keyup', 'a', 'KeyA', input); input.remove();
    send('keydown', 'x', 'KeyX'); send('keyup', 'x', 'KeyX'); out.restored = window.__etude.typeOctave;
    window.__etude.releaseLiveInput();
    return out;
  });
  expect(r).toEqual({ qwertzZ: [68], released: [], octave: 48, azertyQ: [48], azertyA: [], typingInField: [], restored: 60 });
});

test('computer keyboard keys A and K always light up distinct keys and never collide into the same key', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  const check = await page.evaluate(async () => {
    const send = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true }));
    const results = [];

    for (const shift of [-3, -2, -1, 0, 1, 2, 3]) {
      window.__etude.releaseLiveInput();
      if (shift < 0) {
        for (let i = 0; i < -shift; i++) { send('keydown', 'KeyZ'); send('keyup', 'KeyZ'); }
      } else if (shift > 0) {
        for (let i = 0; i < shift; i++) { send('keydown', 'KeyX'); send('keyup', 'KeyX'); }
      }

      send('keydown', 'KeyA');
      const midiA = window.__etude.typingDown.get('KeyA');
      const elA = document.querySelector('.key.pressed[data-midi="' + midiA + '"]');
      const pressedAfterA = [...document.querySelectorAll('.key.pressed')].map(k => +k.dataset.midi);

      send('keydown', 'KeyK');
      const midiK = window.__etude.typingDown.get('KeyK');
      const elK = document.querySelector('.key.pressed[data-midi="' + midiK + '"]');
      const pressedAfterBoth = [...document.querySelectorAll('.key.pressed')].map(k => +k.dataset.midi);

      send('keyup', 'KeyA');
      const pressedAfterRelA = [...document.querySelectorAll('.key.pressed')].map(k => +k.dataset.midi);

      send('keyup', 'KeyK');
      const pressedAfterRelBoth = [...document.querySelectorAll('.key.pressed')].map(k => +k.dataset.midi);

      results.push({
        shift,
        viewLow: window.__etude.view.low,
    typeOctave: window.__etude.typeOctave,
        midiA,
        midiK,
        diff: midiK - midiA,
        distinctElements: elA !== elK && !!elA && !!elK,
        pressedAfterA,
        pressedAfterBoth,
        pressedAfterRelA,
        pressedAfterRelBoth,
      });
    }

    window.__etude.$('oct-down').click();
    send('keydown', 'KeyA'); send('keydown', 'KeyK');
    const dockDownA = window.__etude.typingDown.get('KeyA'), dockDownK = window.__etude.typingDown.get('KeyK');
    const elDownA = document.querySelector('.key.pressed[data-midi="' + dockDownA + '"]');
    const elDownK = document.querySelector('.key.pressed[data-midi="' + dockDownK + '"]');
    const dockDownDistinct = dockDownA !== dockDownK && elDownA !== elDownK && !!elDownA && !!elDownK;
    send('keyup', 'KeyA'); send('keyup', 'KeyK');

    window.__etude.$('oct-up').click(); window.__etude.$('oct-up').click();
    send('keydown', 'KeyA'); send('keydown', 'KeyK');
    const dockUpA = window.__etude.typingDown.get('KeyA'), dockUpK = window.__etude.typingDown.get('KeyK');
    const elUpA = document.querySelector('.key.pressed[data-midi="' + dockUpA + '"]');
    const elUpK = document.querySelector('.key.pressed[data-midi="' + dockUpK + '"]');
    const dockUpDistinct = dockUpA !== dockUpK && elUpA !== elUpK && !!elUpA && !!elUpK;
    send('keyup', 'KeyA'); send('keyup', 'KeyK');

    window.__etude.releaseLiveInput();
    return { results, dockDownDistinct, dockUpDistinct };
  });

  expect(check.dockDownDistinct).toBe(true);
  expect(check.dockUpDistinct).toBe(true);
  for (const r of check.results) {
    expect(r.diff).toBe(12);
    expect(r.distinctElements).toBe(true);
    expect(r.pressedAfterA).toEqual([r.midiA]);
    expect(r.pressedAfterBoth.sort((a, b) => a - b)).toEqual([r.midiA, r.midiK].sort((a, b) => a - b));
    expect(r.pressedAfterRelA).toEqual([r.midiK]);
    expect(r.pressedAfterRelBoth).toEqual([]);
  }
});

test('shortcut hints name the octave keys as the layout prints them', async ({ app, page }) => {
  await page.addInitScript(() => {
    const qwertz = new Map([['KeyA', 'a'], ['KeyK', 'k'], ['KeyY', 'z'], ['KeyZ', 'y'], ['KeyX', 'x']]);
    Object.defineProperty(navigator, 'keyboard', { configurable: true, value: { getLayoutMap: () => Promise.resolve(qwertz) } });
  });
  await app.open({ hash: 'analysis' });
  const pop = page.locator('#an-keys-pop');
  await expect(pop.locator('kbd[data-codes="KeyZ KeyX"]')).toHaveText('Y / X');
  await expect(page.locator('#helpBox kbd[data-codes="KeyZ KeyX"]')).toHaveText('Y / X');
  await expect(pop.locator('dd[data-i18n="ks_play"]')).toHaveText('Play notes');
});

test('unused leftovers stay removed', () => {
  const html = readFileSync(new URL('../../' + APP, import.meta.url), 'utf8');
  for (const name of ['catSing', 'RO_CAT1', 'previewGeneration', 'hasRh']) expect(html, name).not.toMatch(new RegExp('\\b' + name + '\\b'));
  const demoBeat = html.slice(html.indexOf('function demoBeat('));
  expect(demoBeat.slice(0, demoBeat.indexOf('\n'))).not.toMatch(/\bacc\b/);
});

test('the fixed keyboard dock never covers the end of the page, whatever its measured height', async ({ app, page }) => {
  await app.open({ hash: 'explore' });
  // Scrolled to the very end, the footer must end at or above the dock's top edge, and --dock-h must match the dock.
  const fits = () => page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const dock = window.__etude.$('dock').getBoundingClientRect(), foot = document.querySelector('footer').getBoundingClientRect();
    return { kb: document.body.classList.contains('kb'), synced: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) === Math.round(dock.height), clear: foot.bottom <= dock.top + 1 };
  });
  const ok = { kb: true, synced: true, clear: true };
  for (const [width, height] of [[320, 640], [1024, 640]]) {
    await page.setViewportSize({ width, height });
    for (const v of ['explore', 'learn']) {
      await page.evaluate(v => window.__etude.show(v), v);
      await expect.poll(fits, `${v} at ${width}px`).toEqual(ok);
      // A padding-only change (as a safe-area inset makes) grows the dock without resizing its content box.
      await page.evaluate(() => { window.__etude.$('dock').style.paddingBottom = '120px'; });
      await expect.poll(fits, `${v} at ${width}px with a taller dock`).toEqual(ok);
      // In-page scrolling stops above the dock too.
      const probe = await page.evaluate(async v => {
        const p = document.createElement('div'); p.style.height = '40px'; p.textContent = 'probe';
        window.__etude.$('view-' + v).appendChild(p); window.scrollTo(0, 0); p.scrollIntoView({ block: 'nearest' });
        await new Promise(r => requestAnimationFrame(r));
        const below = p.getBoundingClientRect().bottom <= window.__etude.$('dock').getBoundingClientRect().top + 1;
        p.remove(); return below;
      }, v);
      expect(probe, `${v} at ${width}px: scrolled-to content clears the dock`).toBe(true);
      await page.evaluate(() => { window.__etude.$('dock').style.paddingBottom = ''; });
    }
  }
});

test('the keyboard dock starts hidden on a first visit and remembers being shown', async ({ app, page }) => {
  await app.open({ hash: 'explore' });
  const toggle = page.locator('#dock-kb-toggle'), key = page.locator('#keys .white').first();
  await expect(key).toBeHidden();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(key).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  await expect(key).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).kbDock)).toBe(true);
});

test.describe('sound locked by the browser', () => {
  const midiNote = (page, m) => page.evaluate(m => { window.__etude.midiIn(0x90, m, 90, 'midi'); window.__etude.midiIn(0x80, m, 0, 'midi'); }, m);

  test('a MIDI note while audio stays locked shows a notice whose button retries; it goes only once sound runs', async ({ app, page }) => {
    await app.open();
    await page.evaluate(async () => { window.__etude.ensureAudio(); await window.__etude.actx.suspend(); window.__etude.actx.resume = () => new Promise(() => {}); });   // the browser refuses to resume
    await midiNote(page, 60);
    await expect(page.locator('#audioLock')).toBeVisible();
    await expect(page.locator('#audioLock')).toContainText('Sound is off');
    await page.locator('#audioLockBtn').click();
    await page.waitForTimeout(400);
    await expect(page.locator('#audioLock')).toBeVisible();   // still locked: the notice does not claim otherwise
    expect(await page.evaluate(() => window.__etude.actx.state)).toBe('suspended');
    await page.evaluate(() => { delete window.__etude.actx.resume; });     // now the gesture is honoured
    await page.locator('#audioLockBtn').click();
    await expect(page.locator('#audioLock')).toBeHidden();
    expect(await page.evaluate(() => window.__etude.actx.state)).toBe('running');
  });

  test('no notice while sound runs, or when the built-in sound is switched off', async ({ app, page }) => {
    await app.open();
    await page.evaluate(async () => { window.__etude.ensureAudio(); await window.__etude.actx.resume(); });
    await midiNote(page, 60);
    await page.waitForTimeout(500);
    await expect(page.locator('#audioLock')).toBeHidden();
    await page.evaluate(async () => { window.__etude.localSynth = false; await window.__etude.actx.suspend(); window.__etude.actx.resume = () => new Promise(() => {}); });
    await midiNote(page, 62);
    await page.waitForTimeout(500);
    await expect(page.locator('#audioLock')).toBeHidden();
  });
});

test.describe('reduced motion', () => {
  for (const reduce of [true, false]) {
    test(`Explore previews, the dock and the sing-along pulse ${reduce ? 'hold still' : 'animate'} with ${reduce ? 'reduced' : 'normal'} motion`, async ({ app, page }) => {
      await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
      await page.addInitScript(() => { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
      await app.open({ hash: 'explore' });
      const r = await page.evaluate(() => {
        window.__etude.playChordMidis([60, 64, 67], true);                  // an arpeggio lights its notes one by one
        const preview = [...window.__etude.explorePreview];
        window.__etude.dockSet(false); window.__etude.dockSet(true);                       // the keys rise out of the rail
        return { preview, rising: window.__etude.$('dock').classList.contains('is-opening') };
      });
      expect(r).toEqual(reduce ? { preview: [60, 64, 67], rising: false } : { preview: [60], rising: true });

      await page.evaluate(() => window.__etude.show('sing'));
      await page.locator('#si-mode button[data-v="note"]').click();
      const pulse = await page.evaluate(() => { const g = document.querySelector('#si-staff .ss-n[data-i="1"]'); window.__etude.ssFlash(1); return g.getAttribute('data-s'); });
      expect(pulse).toBe(reduce ? null : 'now');
      // The essential marker of the note to play next still shows.
      await page.evaluate(() => { window.__etude.singStopAll(); window.__etude.singGo(); });
      await expect(page.locator('#si-staff .ss-n[data-i="0"]')).toHaveAttribute('data-s', 'now');
      await page.evaluate(() => window.__etude.singStopAll());
    });
  }
});


test('falling notes keyboard range adapts responsively to screen width with a balanced minimum span', async ({ app, page }) => {
  await app.open({ hash: 'score' });
  const res = await page.evaluate(() => {
    window.__etude.AN.notes = [{ midi: 60, start: 0, end: 1 }, { midi: 67, start: 1, end: 2 }];
    const desktopRange = window.__etude.fallRange(1200);
    const tabletRange = window.__etude.fallRange(768);
    const mobileRange = window.__etude.fallRange(400);
    const defaultRange = window.__etude.fallRange();
    return { desktopRange, tabletRange, mobileRange, defaultRange };
  });

  expect(res.desktopRange[1] - res.desktopRange[0]).toBeGreaterThanOrEqual(48);
  expect(res.defaultRange[1] - res.defaultRange[0]).toBeGreaterThanOrEqual(48);
  expect(res.tabletRange[1] - res.tabletRange[0]).toBeGreaterThanOrEqual(36);
  expect(res.mobileRange[1] - res.mobileRange[0]).toBeGreaterThanOrEqual(24);
  expect(res.desktopRange[0] % 12).toBe(0);
  expect(res.desktopRange[1] % 12).toBe(0);
});
