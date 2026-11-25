import { test, expect } from '../helpers/fixtures.mjs';
const whole = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>';
const xml = `<score-partwise version="4.0"><work><work-title>Timeline</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${[0, 1, 2].map(i => `<measure number="${i + 1}">${i ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>'}${whole}${i === 1 ? '<barline location="right"><repeat direction="backward"/></barline>' : ''}</measure>`).join('')}</part></score-partwise>`;
async function open(app, page, source = xml) {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'timeline.musicxml', mimeType: 'application/xml', buffer: Buffer.from(source) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(() => window.__etude.pracSet('countIn', false));
}
async function play(page) { await page.evaluate(() => window.__etude.scorePlay(false, window.__etude.FALL.position)); }
async function secondPass(page) {
  await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick();
    r.segs.forEach(s => s.a0 -= .5); a.pracTick(); a.scorePause();
  });
}

const distinctNotes = xml.replace(`<measure number="2">${whole}`, `<measure number="2">${whole.replace('<step>C', '<step>D')}`)
  .replace(`<measure number="3">${whole}`, `<measure number="3">${whole.replace('<step>C', '<step>E')}`);
const alternateEnding = distinctNotes.replace('<repeat direction="backward"/>', '<ending number="1" type="start"/><ending number="1" type="stop"/><repeat direction="backward"/>')
  .replace('<measure number="3">', '<measure number="3"><barline location="left"><ending number="2" type="start"/></barline>');

async function sampleFallingBoundary(page) {
  return page.evaluate(() => {
    const a = window.__etude, { actx: ctx } = a, run = a.SCORE.run;
    const render = ctx.currentTime + .2, boundary = render - .05;
    const first = run.segs[0];
    first.a0 = boundary - (first.t1 - first.t0) / first.f;
    Object.defineProperty(ctx, 'currentTime', { configurable: true, value: render });
    const sample = offset => {
      const frameTime = performance.now();
      ctx.getOutputTimestamp = () => ({ contextTime: boundary + offset, performanceTime: frameTime });
      a.fallDraw(frameTime);
      const { geo, hits, zoom } = a.FALL;
      return hits.map(({ i, y, h }) => ({
        midi: a.AN.notes[i].midi,
        ahead: ((geo.hitY - y - h) / geo.hitY) * (3.2 / zoom),
      }));
    };
    try {
      run.outputTime = 0;
      a.pracTick();
      return { before: sample(-.1), near: sample(-.04), after: sample(.02), rate: first.f };
    } finally {
      delete ctx.currentTime;
      delete ctx.getOutputTimestamp;
      a.scoreStop();
    }
  });
}

for (const { name, source, seek, next, skipped } of [
  { name: 'printed repeat', source: distinctNotes, seek: 0, next: 60, skipped: 64 },
  { name: 'alternate ending', source: alternateEnding, seek: 5.5, next: 64, skipped: 62 },
]) {
  test(`falling notes descend continuously through the ${name} at the audible boundary`, async ({ app, page }) => {
    await open(app, page, source);
    await page.locator('#an-disp-btn').click();
    await page.locator('[data-score-mode="fall"]').click();
    await expect(page.locator('#fall-canvas')).toBeVisible();
    await page.locator('#an-tools-btn').click();
    await page.locator('#score-speed').selectOption('70');
    await page.locator('#an-tools-btn').click();
    if (seek) {
      await page.locator('#fall-seek').fill(String(seek));
      const preview = await page.evaluate(() => window.__etude.FALL.hits.map(h => window.__etude.AN.notes[h.i].midi));
      expect(preview).toContain(next);
      expect(preview).not.toContain(skipped);
    }
    await play(page);
    const { before, near, after, rate } = await sampleFallingBoundary(page);
    expect(rate).toBe(.7);
    expect(before.find(n => n.midi === next)?.ahead).toBeCloseTo(.1 * rate, 4);
    expect(near.find(n => n.midi === next)?.ahead).toBeCloseTo(.04 * rate, 4);
    expect(after.find(n => n.midi === next)?.ahead).toBeCloseTo(0, 4);
    expect(before.map(n => n.midi)).not.toContain(skipped);
  });
}

test('falling notes preview the next A–B pass and keep moving across the loop', async ({ app, page }) => {
  await open(app, page, distinctNotes);
  await page.locator('#an-disp-btn').click();
  await page.locator('[data-score-mode="fall"]').click();
  await page.locator('#an-disp-btn').click();
  await page.evaluate(async () => {
    const a = window.__etude;
    a.PRAC.A = 2;
    a.PRAC.B = 4;
    await a.scoreLoopStart();
  });
  const { before, near, after, rate } = await sampleFallingBoundary(page);
  const upcoming = frame => frame.find(n => n.midi === 62 && n.ahead > .001);
  expect(upcoming(before)?.ahead).toBeCloseTo(.1 * rate, 4);
  expect(upcoming(near)?.ahead).toBeCloseTo(.04 * rate, 4);
  expect(after.find(n => n.midi === 62)?.ahead).toBeCloseTo(0, 4);
  expect(before.every(n => n.midi === 62)).toBe(true);
});

test('duration and progress include repeats while the engraved cursor returns to the score start', async ({ app, page }) => {
  await open(app, page);
  await expect(page.locator('#fall-total')).toHaveText('0:10');
  await expect(page.locator('#fall-seek')).toHaveAttribute('max', '10');
  await secondPass(page);
  await expect(page.locator('#fall-clock')).toHaveText('0:04');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeCloseTo(4.3, 1);
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBeCloseTo(.3, 1);
  await page.evaluate(() => window.__etude.scoreToggle());
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('seeking on the performance timeline retains the chosen repeat', async ({ app, page }) => {
  await open(app, page); await secondPass(page);
  await page.evaluate(() => { document.getElementById('fall-seek').value = '5'; window.__etude.fallSeek(); });
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBeCloseTo(1);
  await expect(page.locator('#fall-clock')).toHaveText('0:05');
  await play(page);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
});

test('Play, Again and Slower start a completed repeating score on its first pass', async ({ app, page }) => {
  const twoBars = xml.replace(/<measure number="3">.*?<\/measure>/, '');
  await open(app, page, twoBars);
  const finish = () => page.evaluate(() => {
    const a = window.__etude, slider = document.getElementById('fall-seek');
    slider.value = slider.max;
    a.fallSeek();
  });
  const openingPass = () => page.evaluate(() => {
    const run = window.__etude.SCORE.run;
    return run ? [run.pass, run.segs[0].p0, run.route.length] : null;
  });
  for (const button of ['score-play', 'pr-again', 'pr-slower']) {
    await finish();
    await expect(page.locator('#fall-clock')).toHaveText('0:08');
    await page.locator('#' + button).dispatchEvent('click');
    await expect.poll(openingPass).toEqual([1, 0, 1]);
    await page.evaluate(() => window.__etude.scorePause());
  }
});

test('pausing between the audio repeat boundary and the next scheduler tick keeps the second pass', async ({ app, page }) => {
  await open(app, page); await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick();
    r.segs.forEach(s => s.a0 -= .4);
    a.scorePause();
  });
  await page.evaluate(() => window.__etude.scoreToggle());
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('seeking to the written bar after a repeat maps to its real performance occurrence', async ({ app, page }) => {
  await open(app, page); await play(page);
  await page.evaluate(() => {
    const a = window.__etude; a.SCORE.run.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick(); a.scoreSeekTo(4);
  });
  const occurrence = await page.waitForFunction(() => {
    const { playing, run } = window.__etude.SCORE, segment = run?.segs[0];
    return playing && segment?.t0 === 4 ? { written: segment.t0, performance: segment.p0 } : null;
  });
  // The new segment locates the seek independently of how much audio plays before Pause.
  expect(await occurrence.jsonValue()).toEqual({ written: 4, performance: 8 });
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:08');
});

test('a library bookmark survives reload on the second repeat', async ({ app, page }) => {
  await open(app, page);
  await expect(page.locator('#an-msg')).toContainText('Saved to My Library.');
  await secondPass(page);
  await page.evaluate(() => window.__etude.anLibraryFlush());
  const saved = await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList())[0].resume);
  expect(saved.performance).toBeCloseTo(4.3, 1);
  await page.reload(); await page.waitForFunction(() => !!window.__etude?.show && !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.locator('#an-back').click();
  await page.locator('#an-tab-library').click();
  await page.locator('#score-library').evaluate(el => { el.open = true; });
  await expect(page.locator('.score-library-info').first()).toContainText('0:04');
  await page.locator('[data-library-action=open]').first().click();
  await expect(page.locator('#an-panel')).toBeVisible();
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await expect(page.locator('#fall-clock')).toHaveText('0:04');
  await play(page);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('half speed doubles duration; a live speed change keeps elapsed time and recomputes remaining time', async ({ app, page }) => {
  await open(app, page);
  await page.locator('#an-tools-btn').click();
  await page.locator('#score-speed').selectOption('50');
  await page.locator('#an-tools-btn').click();
  await expect(page.locator('#fall-total')).toHaveText('0:20');
  await play(page);
  await page.evaluate(() => {
    const a = window.__etude, speed = document.getElementById('score-speed');
    // Keep the sampled clock away from the integer-second display boundary.
    a.SCORE.run.segs[0].a0 = a.actx.currentTime - 2.25;
    a.pracTick();
    speed.value = '100';
    speed.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => window.__etude.SCORE.run?.segs[0].f === 1);
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:02');
  await expect(page.locator('#fall-total')).toHaveText('0:11');
});

test('the complete timeline includes tempo changes on every repeat and remains correct at completion', async ({ app, page }) => {
  const tempo = xml.replace('<measure number="2">', '<measure number="2"><direction><sound tempo="60"/></direction>');
  await open(app, page, tempo);
  await expect(page.locator('#fall-total')).toHaveText('0:16');
  await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 6.1; a.pracTick();
    r.segs[0].a0 = a.actx.currentTime - 10.5; a.pracTick();
  });
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.playing)).toBe(false);
  await expect(page.locator('#fall-clock')).toHaveText('0:16');
  await expect(page.locator('#fall-total')).toHaveText('0:16');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeCloseTo(16);
  await page.locator('#sc-start').click();
  await expect(page.locator('#fall-clock')).toHaveText('0:00');
});

test('trailing rests remain in duration and both clocks agree during the rest', async ({ app, page }) => {
  const tail = '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><rest/><duration>3</duration><type>half</type><dot/></note>';
  await open(app, page, xml.replace(`<measure number="3">${whole}`, `<measure number="3">${tail}`));
  await secondPass(page);
  await page.evaluate(() => { document.getElementById('fall-seek').value = '9.2'; window.__etude.fallSeek(); });
  await expect(page.locator('#fall-total')).toHaveText('0:10');
  await expect(page.locator('#fall-clock')).toHaveText('0:09');
  await expect(page.locator('#st-time')).toHaveText('0:09 / 0:10');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeLessThan(10);
});

test('skipping to a second ending does not increment the repeat counter', async ({ app, page }) => {
  const volta = xml.replace('<repeat direction="backward"/>', '<ending number="1" type="start"/><ending number="1" type="stop"/><repeat direction="backward"/>').replace('<measure number="3">', '<measure number="3"><barline location="left"><ending number="2" type="start"/></barline>');
  await open(app, page, volta); await play(page);
  await expect(page.locator('#fall-total')).toHaveText('0:08');
  for (let i = 0; i < 2; i++) await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run, s = r.segs[0], delta = a.actx.currentTime - .1 - (s.a0 + (s.t1 - s.t0) / s.f);
    r.segs.forEach(segment => segment.a0 += delta); a.pracTick();
  });
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:06');
});

test('Wait for me freezes performance progress and loops display their own duration', async ({ app, page }) => {
  await open(app, page);
  await page.evaluate(async () => { const a = window.__etude; a.pracSet('wait', true); await a.scorePlay(false, 0); a.SCORE.run.segs[0].a0 -= 2; a.pracTick(); a.anStatusPos(); });
  await expect(page.locator('#fall-clock')).toHaveText('0:00');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBe(0);
  await page.evaluate(async () => { const a = window.__etude; a.scoreStop(); a.pracSet('wait', false); a.AN.selected = new Set([0]); a.anSelectionChanged(); await a.scoreLoopStart(); });
  await expect(page.locator('#fall-total')).toHaveText('0:02');
  await expect(page.locator('#score-state')).toContainText('Loop');
  await expect(page.locator('#pr-hud')).toBeVisible();
  await expect(page.locator('#pr-pass')).toHaveText('1');
});

test('stopping the score cancels all already scheduled count-in clicks', async ({ app, page }) => {
  await open(app, page);
  await page.evaluate(() => {
    const a = window.__etude, { start, stop } = OscillatorNode.prototype;
    window.__scheduledCountIn = new Map();
    OscillatorNode.prototype.start = function (when) {
      if (this.frequency.value > 1000) window.__scheduledCountIn.set(this, 0);
      return start.call(this, when);
    };
    OscillatorNode.prototype.stop = function (when) {
      if (window.__scheduledCountIn.has(this)) window.__scheduledCountIn.set(this, window.__scheduledCountIn.get(this) + 1);
      return stop.call(this, when);
    };
    a.pracSet('countIn', true);
  });
  const { before, after } = await page.evaluate(async () => {
    // Stop in the same task so each oscillator is still queued.
    await window.__etude.scorePlay(false, 0);
    const scheduled = () => [...window.__scheduledCountIn.values()];
    const before = scheduled();
    document.getElementById('score-stop').click();
    return { before, after: scheduled() };
  });
  expect(before).toEqual([1, 1, 1, 1]);
  expect(after).toEqual([2, 2, 2, 2]);
});
