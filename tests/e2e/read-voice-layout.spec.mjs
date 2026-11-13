import { test, expect } from '../helpers/fixtures.mjs';

// Read & play and Voice on wide windows: the sight-reading and sight-singing staves are scaled to fill their paper (srRender's
// layout, capped at SR_SCALE_CAP), long melodies wrap into systems, the playhead and marks stay on the scaled notes, the
// Learn staves keep their natural size, and the drills hero leaves no empty middle.

// The share of the paper's inner width the score takes, and its scale (CSS pixels a unit).
const fill = (page, id) => page.evaluate(id => {
  const wrap = document.getElementById(id), svg = wrap.querySelector('svg'), cs = getComputedStyle(wrap);
  const inner = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return { share: svg.getBoundingClientRect().width / inner, scale: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width, overflow: wrap.scrollWidth - wrap.clientWidth };
}, id);

const openGenerated = async (app, page, width, height = 900) => {
  await page.setViewportSize({ width, height });
  await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-staff svg')).toHaveCount(1);
};

// A generated melody made longer: its bars repeated, three and a half times four bars.
const lengthen = page => page.evaluate(() => {
  const a = window.__etude, rh = a.SR.piece.rh;
  a.SR.piece = Object.assign({}, a.SR.piece, { rh: [...rh, ...rh, ...rh] });
  a.srDraw();
});

// Every notehead's centre on screen against where the engine says it is (x, y in SVG units times the scale).
const headsOnNotes = page => page.evaluate(() => {
  const a = window.__etude, svg = a.srSvg(), box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width;
  return a.SR.notes.map((n) => {
    const h = svg.querySelector(`.ss-n[data-nid="${n.nid}"] .ss-head`).getBoundingClientRect();
    return Math.max(Math.abs(h.left + h.width / 2 - (box.left + n.x * k)), Math.abs(h.top + h.height / 2 - (box.top + n.y * k)));
  });
});

test.describe('Read & play and Voice layout on wide windows', () => {
  for (const width of [1280, 1440]) {
    test(`at ${width}px a 4-bar generated melody and the Sing staff fill most of their paper`, async ({ app, page }) => {
      await openGenerated(app, page, width);
      const sr = await fill(page, 'rd-staff');
      expect(sr.share).toBeGreaterThanOrEqual(0.75);
      expect(sr.share).toBeLessThanOrEqual(1.001);
      expect(sr.scale).toBeGreaterThan(1.3);
      expect(sr.scale).toBeLessThanOrEqual(2.2);
      expect(sr.overflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => window.__etude.SR.render.systems.length)).toBe(1);
      await page.evaluate(() => window.__etude.show('sing'));
      for (const level of ['0', '6']) {
        await page.selectOption('#si-level', level);
        const si = await fill(page, 'si-staff');
        expect(si.share, 'Sing level ' + level).toBeGreaterThanOrEqual(0.75);
        expect(si.scale).toBeLessThanOrEqual(2.2);
      }
    });
  }

  test('the marks, the current-note highlight and the playhead sit on the scaled noteheads', async ({ app, page }) => {
    await openGenerated(app, page, 1440);
    await page.locator('#rd-names').check();
    expect(Math.max(...await headsOnNotes(page))).toBeLessThan(1.5);
    const marks = await page.evaluate(() => {
      const a = window.__etude, svg = a.srSvg(), box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width;
      a.SR.results = { [a.SR.notes[0].nid]: 'good', [a.SR.notes[2].nid]: 'bad' };
      a.srPaintAll();
      const sym = [...svg.querySelectorAll('.ss-result-symbol')].filter(s => s.textContent).map(s => s.getBoundingClientRect());
      const name = svg.querySelector('.ss-n .ss-syl').getBoundingClientRect();
      // The playhead on the third note's beat, as the Assess and Listen runs draw it.
      const n = a.SR.notes[2], at = a.srBeatPt(a.SR.beatX, n.beat);
      a.srCursor(at.x, at.sy);
      const ph = svg.querySelector('.ss-playhead').getBoundingClientRect(), head = svg.querySelector(`.ss-n[data-nid="${n.nid}"] .ss-head`).getBoundingClientRect();
      return { sym: sym.map(s => s.left + s.width / 2 - (box.left + (a.SR.notes[sym.indexOf(s) ? 2 : 0].x + 12) * k)), nameDx: name.left + name.width / 2 - (box.left + a.SR.notes[0].x * k),
        phDx: ph.left + ph.width / 2 - (head.left + head.width / 2), spans: Math.abs(ph.top - (box.top + a.SR.render.systems[at.sy].yTop * k)) < 2 && Math.abs(ph.bottom - (box.top + a.SR.render.systems[at.sy].yBot * k)) < 2 };
    });
    expect(marks.sym.length).toBe(2);
    marks.sym.forEach(dx => expect(Math.abs(dx)).toBeLessThan(2));
    expect(Math.abs(marks.nameDx)).toBeLessThan(2);
    expect(Math.abs(marks.phDx)).toBeLessThan(2);
    expect(marks.spans).toBe(true);
    // Step by step: the note to play is highlighted where it is drawn.
    await page.locator('#rd-go').click();
    const now = page.locator('#rd-staff .ss-n[data-s="now"] .ss-head').first();
    await expect(now).toBeVisible();
    const nowDx = await page.evaluate(() => {
      const a = window.__etude, svg = a.srSvg(), box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width, n = a.SR.steps[a.SR.stepIdx].notes[0];
      const h = svg.querySelector(`.ss-n[data-nid="${n.nid}"][data-s="now"] .ss-head`).getBoundingClientRect();
      return h.left + h.width / 2 - (box.left + n.x * k);
    });
    expect(Math.abs(nowDx)).toBeLessThan(1.5);
  });

  test('a long melody wraps into systems that stay inside the paper, and the playhead follows them', async ({ app, page }) => {
    await openGenerated(app, page, 1280, 800);
    await lengthen(page);
    const geo = await page.evaluate(() => {
      const a = window.__etude, r = a.SR.render, wrap = document.getElementById('rd-staff'), svg = a.srSvg();
      const w = wrap.getBoundingClientRect(), s = svg.getBoundingClientRect(), sys = new Set(a.SR.notes.map(n => n.sy));
      return { systems: r.systems.length, used: sys.size, scale: r.scale, inside: s.left >= w.left - 1 && s.right <= w.right + 1 && s.bottom <= w.bottom + 1, overflow: wrap.scrollWidth - wrap.clientWidth, bars: r.beatX.filter(p => p.sy === 0).length };
    });
    expect(geo.systems).toBeGreaterThanOrEqual(3);
    expect(geo.used).toBe(geo.systems);
    expect(geo.scale).toBeGreaterThan(1.3);
    expect(geo.inside).toBe(true);
    expect(geo.overflow).toBeLessThanOrEqual(1);
    expect(Math.max(...await headsOnNotes(page))).toBeLessThan(1.5);
    // The playhead on a note of the second system is drawn on that system, over the note.
    const ph = await page.evaluate(() => {
      const a = window.__etude, svg = a.srSvg(), n = a.SR.notes.find(x => x.sy === 1), at = a.srBeatPt(a.SR.beatX, n.beat);
      a.srCursor(at.x, at.sy);
      const line = svg.querySelector('.ss-playhead').getBoundingClientRect(), head = svg.querySelector(`.ss-n[data-nid="${n.nid}"] .ss-head`).getBoundingClientRect();
      // A beat on a system break starts the next system; the last beat of a system stays on it.
      const first2 = a.SR.notes.filter(x => x.sy === 2).sort((p, q) => p.beat - q.beat)[0];
      const box = svg.getBoundingClientRect(), k = box.width / svg.viewBox.baseVal.width, sys = a.SR.render.systems[1];
      return { sy: at.sy, dx: Math.abs(line.left - (head.left + head.width / 2)), covers: Math.abs(line.top - (box.top + sys.yTop * k)) < 2 && Math.abs(line.bottom - (box.top + sys.yBot * k)) < 2 && head.top + head.height / 2 > box.top + (sys.yTop - 40) * k && head.top + head.height / 2 < box.top + (sys.yBot + 40) * k, breakSy: a.srBeatPt(a.SR.beatX, first2.beat).sy };
    });
    expect(ph.sy).toBe(1);
    expect(ph.dx).toBeLessThan(2);
    expect(ph.covers).toBe(true);
    expect(ph.breakSy).toBe(2);
    // A narrower window lays the score out again for its paper.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(() => fill(page, 'rd-staff').then(f => f.overflow <= 1 && f.share >= 0.75 && f.share <= 1.001)).toBe(true);
  });

  test('on the full-screen stage a short one-staff melody is drawn at least as tall as before the layout change', async ({ app, page }) => {
    // Four bars of quarters on the treble staff, no ledger lines: the hugged score is short (about 100 units), and scaled to
    // the stage's width it came out 154px tall, below the natural score's 150 units at the old stage scale (1.35).
    await openGenerated(app, page, 1280, 800);
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await page.evaluate(() => {
      const a = window.__etude, bar = ['E4', 'G4', 'B4', 'D5'].map(n => [n, 1]);
      a.SR.piece = Object.assign({}, a.SR.piece, { rh: [...bar, ...bar, ...bar, ...bar], lh: undefined, ts: [4, 4], keyN: 0, pickup: 0 });
      a.srDraw();
    });
    await page.locator('#rd-go').click();
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    const geo = await page.locator('#rd-staff').evaluate((wrap) => {
      const svg = wrap.querySelector('svg'), w = wrap.getBoundingClientRect(), s = svg.getBoundingClientRect(), r = window.__etude.SR.render;
      return { h: s.height, systems: r.systems.length, scale: r.scale, inside: s.top >= w.top - 1 && s.bottom <= w.bottom + 1 && s.left >= w.left - 1 && s.right <= w.right + 1, overflow: wrap.scrollWidth - wrap.clientWidth };
    });
    expect(geo.systems).toBe(1);
    expect(geo.scale).toBeGreaterThanOrEqual(1.35);
    expect(geo.h).toBeGreaterThanOrEqual(150 * 1.35);
    expect(geo.inside).toBe(true);
    expect(geo.overflow).toBeLessThanOrEqual(1);
  });

  test('the Learn staves and the inline Learn examples keep their natural size', async ({ app, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await app.open({ hash: 'read' });
    const learn = await page.evaluate(() => {
      const a = window.__etude;
      return Object.keys(a.LSTAVES).map((key) => {
        const host = document.createElement('div');
        host.innerHTML = a.lStaffSvg(key);
        const svg = host.querySelector('svg'), r = a.LSR[key];
        return { key, w: +svg.getAttribute('width'), vb: svg.viewBox.baseVal.width, systems: r.systems.length, scale: r.scale };
      });
    });
    expect(learn.length).toBeGreaterThan(3);
    for (const s of learn) {
      expect(s.w, s.key).toBeCloseTo(s.vb, 3);
      expect(s.systems, s.key).toBe(1);
      expect(s.scale, s.key).toBe(1);
    }
  });

  for (const width of [1280, 1440, 1920]) {
    test(`at ${width}px the drills hero has no empty gap wider than a third of it`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 900 });
      await app.open({ hash: 'read' });
      await page.locator('#rdt-drills').click();
      const gap = await page.evaluate(() => {
        const hero = document.getElementById('rdx-hero'), hb = hero.getBoundingClientRect(), cs = getComputedStyle(hero);
        const left = hb.left + parseFloat(cs.paddingLeft), right = hb.right - parseFloat(cs.paddingRight);
        // The blocks that show: the stats, the next level's picture, text and button column, and each option; each scan line
        // runs through the middle of one of them.
        const items = [...hero.querySelectorAll('.rdx-hero-l > *, .rdx-hero-m > div, .rdx-next > *, .rdx-hero-r > label')].map(e => e.getBoundingClientRect()).filter(r => r.width && r.height);
        let worst = 0;
        for (const y of items.map(r => r.top + r.height / 2)) {
          const xs = items.filter(r => r.top <= y && r.bottom >= y).map(r => [r.left, r.right]).sort((p, q) => p[0] - q[0]);
          let at = left;
          for (const [a, b] of xs) {
            worst = Math.max(worst, a - at);
            at = Math.max(at, b);
          }
          worst = Math.max(worst, right - at);
        }
        return { worst, width: right - left };
      });
      expect(gap.worst).toBeLessThan(gap.width / 3);
    });
  }

  test('the hero keeps every option and control', async ({ app, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await app.open({ hash: 'read' });
    await page.locator('#rdt-drills').click();
    for (const id of ['rdx-cont', 'rdx-snd', 'rdx-hints', 'rdx-flow', 'rdx-ghost', 'rdx-stage-pref', 'rdx-weak-inject'])
      await expect(page.locator('#rdx-hero #' + id)).toBeVisible();
    await expect(page.locator('#rdx-next-name')).toHaveText('Treble clef · 1');
    await expect(page.locator('#rdx-hero .rdx-next-pic svg')).toHaveCount(1);
    await page.locator('#rdx-cont').click();
    await expect(page.locator('#rdx-stage')).toBeVisible();
    await expect(page.locator('#rdx-title')).toHaveText('Treble clef · 1');
  });

  for (const [width, height] of [[390, 844], [360, 740], [844, 390]]) {
    test(`no sideways scroll on Read & play and Voice at ${width}x${height}`, async ({ app, page }) => {
      await page.setViewportSize({ width, height });
      await app.open({ hash: 'read' });
      const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await over(), 'drills home').toBeLessThanOrEqual(0);
      if (width < 700) {
        const small = await page.evaluate(() => [...document.querySelectorAll('#rdx-hero button, #rdx-hero .switch-inline')]
          .filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44).map(el => el.id || el.textContent.trim()));
        expect(small).toEqual([]);
      }
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-gen').click();
      expect(await over(), 'sight-reading').toBeLessThanOrEqual(0);
      await page.evaluate(() => window.__etude.show('sing'));
      expect(await over(), 'sing').toBeLessThanOrEqual(0);
      await page.locator('#vo-tab-hum').click();
      await expect(page.locator('#tr-empty')).toBeVisible();
      expect(await over(), 'hum').toBeLessThanOrEqual(0);
    });
  }

  test('Hum to notes shows where the notes will appear until there are notes', async ({ app, page }) => {
    await app.open({ hash: 'sing' });
    await page.locator('#vo-tab-hum').click();
    await expect(page.locator('#tr-empty')).toBeVisible();
    await expect(page.locator('#tr-empty li')).toHaveCount(3);
    await page.evaluate(() => { window.__etude.trx.notes = [{ midi: 60, start: 0, dur: 0.6 }]; window.__etude.trxRender(); });
    await expect(page.locator('#tr-empty')).toBeHidden();
    await page.locator('#tr-clear').click();
    await expect(page.locator('#tr-empty')).toBeVisible();
  });

  test('Tap the rhythm draws its staff on white paper, scaled to its box', async ({ app, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await app.open({ hash: 'read' });
    await page.evaluate(() => { const a = window.__etude; a.theme = 'dark'; a.applyTheme(); a.rdOpen(Object.values(a.RD_LV).find(l => l.ty === 'rh')); a.rdStart('practice'); });
    const r = await page.evaluate(() => { const a = window.__etude, svg = document.querySelector('#rdx-staff svg'); return { scale: a.RD.rh.r.scale, bg: getComputedStyle(svg).backgroundColor, w: svg.getBoundingClientRect().width }; });
    expect(r.scale).toBeGreaterThan(1.5);
    expect(r.bg).toBe('rgb(253, 251, 247)');
    expect(r.w).toBeGreaterThan(600);
  });
});
