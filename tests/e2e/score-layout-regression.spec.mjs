import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../helpers/fixtures.mjs';
import { scorePedalCollisions } from '../helpers/score-audit-helpers.mjs';
import { scoreNavigationCollisions } from '../helpers/score-marking-audit.mjs';

const source = name => fileURLToPath(new URL('../../MIDI/' + name, import.meta.url));
const BALLADE = source('ballade-pour-adeline-richard-clayderman.mxl');
const MOZART = source('wa-mozart-marche-turque-turkish-march-fingered.mxl');

async function load(page, file) {
  await page.locator('#an-file').setInputFiles(file);
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
}

// Use the actual printed staff entries, not the vendor's pedal skyline (the regression is in that skyline).
function pedalLanes() {
  return [...document.querySelectorAll('#an-roll .vf-sc-pedal')].map(group => {
    const { staffLine: line, pedal } = group.scPedalOwner;
    const matrix = group.ownerSVGElement.getScreenCTM();
    const bottom = matrix.f + (line.PositionAndShape.AbsolutePosition.y + line.StaffHeight) * 10 * matrix.d;
    const measure = pedal.startVfVoiceEntry?.parentStaffEntry?.parentMeasure || line.Measures[0];
    const entries = measure.staffEntries || [];
    const own = entries.flatMap(entry => [
      ...(entry.FingeringEntries || []).map(f => f.SVGNode),
      ...(entry.graphicalVoiceEntries || []).flatMap(v => [...((v.vfStaveNote || v.mVexFlowStaveNote)?.getAttribute('el')?.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-modifiers') || [])]),
    ]).filter(Boolean);
    const inkBottom = Math.max(bottom, ...own.map(n => n.getBoundingClientRect().bottom));
    const marks = [...group.querySelectorAll('path')].filter(n => n.getBoundingClientRect().width > 0);
    return {
      measure: measure.parentSourceMeasure.MeasureNumber,
      space: matrix.d * 10,
      distance: Math.min(...marks.map(n => n.getBoundingClientRect().top)) - inkBottom,
      visible: marks.every(n => getComputedStyle(n).visibility === 'visible'),
      count: marks.length,
    };
  });
}

async function attachPages(page, testInfo, numbers) {
  const rendered = await page.locator('#an-roll svg').evaluateAll(nodes => nodes.map(n => n.outerHTML));
  const capture = await page.context().newPage();
  await capture.setViewportSize({ width: 1100, height: 1500 });
  for (const number of numbers) {
    await capture.setContent('<style>body{margin:0;background:white}svg{display:block}</style>' + rendered[number - 1]);
    const path = testInfo.outputPath(`score-page-${number}.png`);
    await capture.locator('svg').screenshot({ path });
    await testInfo.attach(`score-page-${number}`, { path, contentType: 'image/png' });
  }
  await capture.close();
}

test.describe('Real MusicXML engraving regressions', () => {
  test('Ballade bar 17 preserves segno, rehearsal and one harmony per onset, with clear top-note ink', async ({ app }, testInfo) => {
    test.skip(!existsSync(BALLADE), 'The user-supplied MIDI corpus is not installed');
    const page = await app.open({ hash: 'analysis' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load(page, BALLADE);
    const result = await page.evaluate(() => {
      const { SCORE } = window.__etude;
      const doc = new DOMParser().parseFromString(SCORE.xml, 'application/xml');
      const measure = doc.querySelector('measure[number="17"]');
      const segno = [...document.querySelectorAll('#an-roll .vf-repetition')].find(n => !n.querySelector('text'));
      const box = segno.getBoundingClientRect();
      const rect = n => n.getBoundingClientRect();
      const touches = n => { const r = rect(n); return Math.min(box.right, r.right) - Math.max(box.left, r.left) > .5 && Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top) > .5; };
      const overlaps = [...segno.ownerSVGElement.querySelectorAll('.vf-notehead,text')].filter(touches).map(n => n.textContent || n.className.baseVal);
      const tempoMark = [...segno.ownerSVGElement.querySelectorAll('.osmd-tempo')].find(n => n.textContent === 'a tempo');
      return {
        tempoAfterSegno: tempoMark.getBoundingClientRect().top >= box.bottom - .5,
        sourceSegnos: measure.querySelectorAll('segno').length,
        rehearsal: measure.querySelector('rehearsal').textContent,
        harmonies: measure.querySelectorAll('harmony').length,
        overlaps,
        tempo: [...segno.ownerSVGElement.querySelectorAll('text')].filter(n => n.textContent === 'a tempo').length,
      };
    });
    await attachPages(page, testInfo, [1, 2]);
    expect(result).toEqual({ tempoAfterSegno: true, sourceSegnos: 1, rehearsal: 'C', harmonies: 1, overlaps: [], tempo: 1 });
  });

  test('Ballade pedals stay just below their own bass ink, visible and collision-free after relayout', async ({ app }) => {
    test.skip(!existsSync(BALLADE), 'The user-supplied MIDI corpus is not installed');
    const page = await app.open({ hash: 'analysis' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load(page, BALLADE);
    const originalCount = await page.locator('.vf-sc-pedal path').count();
    expect(originalCount).toBe(132);
    for (const layout of ['page', 'cont', 'page']) {
      await page.evaluate(layout => { window.__etude.SCORE.layout = layout; window.__etude.scoreLayout(); }, layout);
      const lanes = await page.evaluate(pedalLanes);
      expect(lanes.every(l => l.visible), JSON.stringify(lanes.filter(l => !l.visible))).toBe(true);
      expect(lanes.filter(l => l.measure === 11).every(l => l.distance >= 0 && l.distance < l.space * 1.5), JSON.stringify(lanes.filter(l => l.measure === 11))).toBe(true);
      expect(await page.locator('.vf-sc-pedal path').count()).toBe(originalCount);
      expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
      const before = await page.locator('.vf-sc-pedal path').evaluateAll(nodes => nodes.map(n => n.getAttribute('transform')));
      await page.evaluate(() => window.__etude.scoreFixPedals(document.querySelector('#an-roll')));
      expect(await page.locator('.vf-sc-pedal path').evaluateAll(nodes => nodes.map(n => n.getAttribute('transform')))).toEqual(before);
    }
    await page.setViewportSize({ width: 700, height: 900 });
    await page.evaluate(() => { window.__etude.SCORE.zoom = 1.25; window.__etude.scoreLayout(); });
    expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
    expect((await page.evaluate(pedalLanes)).every(l => l.visible)).toBe(true);
  });

  test('Ballade cross-staff slurs preserve real links but never bridge the whitespace between systems', async ({ app }) => {
    test.skip(!existsSync(BALLADE), 'The user-supplied MIDI corpus is not installed');
    const page = await app.open({ hash: 'analysis' });
    await load(page, BALLADE);
    const result = await page.evaluate(() => {
      const { SCORE, AN } = window.__etude;
      const gs = SCORE.engine.readLayout().graphicSheet;
      const crossings = [];
      gs.MusicPages.forEach((pg, pi) => {
        const svg = document.querySelectorAll('#an-roll svg')[pi], matrix = svg.getScreenCTM();
        pg.MusicSystems.slice(0, -1).forEach((system, si) => {
          const last = system.StaffLines.at(-1);
          const staffBottom = matrix.f + (last.PositionAndShape.AbsolutePosition.y + last.StaffHeight) * 10 * matrix.d;
          const nextTop = matrix.f + pg.MusicSystems[si + 1].PositionAndShape.AbsolutePosition.y * 10 * matrix.d;
          const middle = (staffBottom + nextTop) / 2;
          svg.querySelectorAll('.sc-xline[data-kind="slur"]').forEach(path => {
            const r = path.getBoundingClientRect();
            if (r.top < middle && r.bottom > middle) crossings.push({ page: pi + 1, system: si, height: r.height });
          });
        });
      });
      return { crossings, sourceLinks: AN.source.links.filter(l => l.kind === 'slur').length, paths: document.querySelectorAll('.sc-xline[data-kind="slur"]').length, represented: new Set([...document.querySelectorAll('.sc-xline[data-kind="slur"]')].map(n => n.dataset.link)).size };
    });
    expect(result.crossings).toEqual([]);
    expect(result.sourceLinks).toBe(9);
    expect(result.represented).toBe(result.sourceLinks);
    expect(result.paths).toBeGreaterThanOrEqual(result.sourceLinks);
  });

  for (const name of ['ballade-pour-adeline-richard-clayderman.mxl', 'hes-a-pirate.mxl', 'passacaglia-johan-halvorsen.mxl', 'where-is-my-mind-solo-piano-by-pixies-maxence-cyrin.mxl']) {
    test(`${name}: navigation and pedal ink stays collision-free in both layouts`, async ({ app }) => {
      const file = source(name);
      test.skip(!existsSync(file), 'The user-supplied MIDI corpus is not installed');
      const page = await app.open({ hash: 'analysis' });
      await load(page, file);
      for (const layout of ['page', 'cont']) {
        await page.evaluate(layout => { window.__etude.SCORE.layout = layout; window.__etude.scoreLayout(); }, layout);
        expect(await page.evaluate(scoreNavigationCollisions), layout + ' navigation').toEqual([]);
        expect(await page.evaluate(scorePedalCollisions), layout + ' pedal ink').toEqual([]);
      }
    });
  }

  for (const name of ['hes-a-pirate.mxl', 'where-is-my-mind-solo-piano-by-pixies-maxence-cyrin.mxl']) {
    test(`${name}: decimal tempo suffix belongs to its metronome, not a stray direction`, async ({ app }) => {
      const file = source(name);
      test.skip(!existsSync(file), 'The user-supplied MIDI corpus is not installed');
      const page = await app.open({ hash: 'analysis' });
      await load(page, file);
      const result = await page.evaluate(() => {
        const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml');
        return {
          suffixes: [...doc.querySelectorAll('direction words')].filter(n => /^\.\d+$/.test(n.textContent.trim())).map(n => n.textContent),
          decimals: [...doc.querySelectorAll('per-minute')].filter(n => /^\d+\.\d+$/.test(n.textContent.trim())).map(n => n.textContent),
          strayInk: [...document.querySelectorAll('#an-roll .osmd-words')].filter(n => /^\.\d+$/.test(n.textContent.trim())).map(n => n.textContent),
          sound: [...doc.querySelectorAll('direction sound[tempo]')].map(n => n.getAttribute('tempo')),
        };
      });
      expect(result.suffixes).toEqual([]);
      expect(result.strayInk).toEqual([]);
      expect(result.decimals).toContain(name === 'hes-a-pirate.mxl' ? '57.5' : '72.9');
      expect(result.sound).toContain(name === 'hes-a-pirate.mxl' ? '172.5' : '72.9');
    });
  }

  test('import normalization preserves temporal/staff/offset distinctions and cannot inject ending markup', async ({ app }) => {
    const page = await app.open({ hash: 'analysis' });
    const harmony = (staff = 1, offset = '') => `<harmony><root><root-step>C</root-step></root><kind>major</kind>${offset ? `<offset>${offset}</offset>` : ''}<staff>${staff}</staff></harmony>`;
    const note = step => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>`;
    const xml = `<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>80</per-minute></metronome></direction-type><sound tempo="80"/></direction><direction><direction-type><words>.7</words></direction-type></direction><direction><direction-type><rehearsal>C</rehearsal></direction-type></direction>${harmony()}${harmony()}${harmony(2)}${harmony(1, '1')}${note('C')}${harmony()}${note('D')}${note('E')}${note('F')}<backup><duration>4</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note><barline location="left"><ending number="1" type="start">&amp;lt;span onclick=&amp;quot;window.__endingInjected=1&amp;quot;&amp;gt;&amp;lt;b&amp;gt;1.&amp;lt;/b&amp;gt;&amp;lt;/span&amp;gt;</ending></barline><barline location="right"><ending number="1" type="stop"/></barline></measure></part></score-partwise>`;
    await page.locator('#an-file').setInputFiles({ name: 'normalization.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    expect(await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml');
      return {
        harmonies: doc.querySelectorAll('harmony').length,
        offset: doc.querySelector('harmony offset').textContent,
        rehearsal: doc.querySelector('rehearsal').textContent,
        perMinute: doc.querySelector('per-minute').textContent,
        separateWords: [...doc.querySelectorAll('words')].map(n => n.textContent),
        ending: doc.querySelector('ending[type="start"]').textContent,
        injected: !!window.__endingInjected,
        notes: window.__etude.AN.notes.length,
      };
    })).toEqual({ harmonies: 4, offset: '1', rehearsal: 'C', perMinute: '80', separateWords: ['.7'], ending: '1.', injected: false, notes: 5 });
  });

  test('Mozart volta labels decode escaped formatting into plain text without changing repeat numbers', async ({ app }) => {
    test.skip(!existsSync(MOZART), 'The user-supplied MIDI corpus is not installed');
    const page = await app.open({ hash: 'analysis' });
    await load(page, MOZART);
    const result = await page.evaluate(() => {
      const doc = new DOMParser().parseFromString(window.__etude.SCORE.xml, 'application/xml');
      return {
        labels: [...doc.querySelectorAll('ending[type="start"]')].map(n => ({ number: n.getAttribute('number'), text: n.textContent })),
        markup: [...document.querySelectorAll('#an-roll svg text')].filter(n => /&lt;|<\/?(?:font|b)\b/.test(n.textContent)).map(n => n.textContent),
      };
    });
    expect(result).toEqual({ labels: [{ number: '1', text: '1.' }, { number: '2', text: '2.' }], markup: [] });
  });
});
