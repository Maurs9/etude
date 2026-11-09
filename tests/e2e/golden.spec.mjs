import { test, expect, APP } from '../helpers/fixtures.mjs';
import { scorePedalCollisions } from '../helpers/score-audit-helpers.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Golden baselines: what the architecture migration must carry over unchanged
// (docs/plans/2026-11-08-safe-migration-plan.md). Move a baseline only for an intended change: regenerate it with
// `UPDATE_GOLDEN=1 npx playwright test golden` and commit it on its own, saying why it changed.
const UPDATE = !!process.env.UPDATE_GOLDEN;
// Set once a platform's layout baselines are committed (CI does, after the Linux ones are adopted), so a new score
// golden can't silently lack one.
const REQUIRE_PLATFORM = !!process.env.GOLDEN_REQUIRE_PLATFORM;
const GOLDEN = fileURLToPath(new URL('../golden/', import.meta.url));

const readJson = file => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
// Pretty-printed, with arrays of numbers kept on one line, so a moved baseline reads as a short diff.
const writeJson = (file, value) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => '[' + inner.split(/,\s+/).join(', ') + ']') + '\n');
};
const expectGolden = (file, actual) => {
  if (UPDATE) return writeJson(file, actual);
  const saved = readJson(file);
  expect(saved, `no baseline at ${file}; create it with UPDATE_GOLDEN=1`).not.toBeNull();
  expect(actual).toEqual(saved);
};

test.describe('golden: piano recordings', () => {
  test('every recorded piano sample is byte-for-byte unchanged', () => {
    const samples = {}, notCanonical = [];
    const dir = new URL('../../src/assets/piano/', import.meta.url);
    for (const file of readdirSync(fileURLToPath(dir)).filter(file => file.endsWith('.mp3')).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)))) {
      const midi = file.slice(0, -4), mp3 = readFileSync(new URL(file, dir));
      samples[midi] = `sha256:${createHash('sha256').update(mp3).digest('hex')} bytes:${mp3.length}`;
    }
    expect(Object.keys(samples), 'the split piano bank has all 30 samples').toHaveLength(30);
    expect(notCanonical, 'samples whose base64 is not canonical').toEqual([]);
    expectGolden(join(GOLDEN, 'piano-recordings.json'), samples);
  });
});

// Evaluated in the page after an import. `music` must not depend on the layout or the platform; `layout` is checked
// against a baseline for the current platform, since text metrics may differ between operating systems.
function scoreFingerprint() {
  const g = window.__etude.SCORE.geo, box = document.getElementById('an-roll');
  const bars = g.measures.map((m, i) => m && { n: i + 1, sys: m.sys, b1: m.b1 }).filter(Boolean);
  const count = sel => [...box.querySelectorAll(sel)].filter(el => el.getBoundingClientRect().width > .1).length;
  return {
    music: {
      measures: bars.length,
      beats: Math.round(Math.max(...bars.map(m => m.b1)) * 1000) / 1000,
      onsets: g.anchors.filter(a => !a.end).length,
      noteheads: count('.vf-notehead'),
    },
    layout: {
      pages: g.pages.length,
      systemsPerPage: g.pages.map((_, p) => g.systems.filter(s => s.page === p).length),
      systemStarts: g.systems.map((_, s) => bars.find(m => m.sys === s)?.n ?? null),
      pedalMarks: count('.vf-sc-pedal path'),
      curves: count('.vf-curve,.vf-stavetie'),
      crossLines: count('.sc-xline'),
    },
  };
}

// The repo's fixtures, plus any scores in ETUDE_SCORES_DIR (kept out of the repo, with their baselines beside them).
const SCORES = ['fur-elise-beethoven.mxl', 'bach-pedal.mxl', 'moonlight-pedal.mxl']
  .map(name => ({ name, path: fileURLToPath(new URL('../fixtures/' + name, import.meta.url)), dir: join(GOLDEN, 'scores') }));
const LOCAL = process.env.ETUDE_SCORES_DIR;
if (LOCAL) for (const name of readdirSync(LOCAL).filter(f => /\.(mxl|musicxml|xml)$/i.test(f)).sort())
  SCORES.push({ name, path: join(LOCAL, name), dir: join(LOCAL, '.etude-golden'), local: true });

test.describe('golden: score engraving', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  for (const score of SCORES) {
    test(`${score.local ? 'local score ' : ''}${score.name} keeps its notes, systems and pages`, async ({ app, page }) => {
      test.slow(!!score.local);
      await app.open({ hash: 'analysis' });
      await page.evaluate(() => document.fonts.ready);
      const mimeType = /\.mxl$/i.test(score.name) ? 'application/vnd.recordare.musicxml' : 'application/xml';
      await page.locator('#an-file').setInputFiles({ name: score.name, mimeType, buffer: readFileSync(score.path) });
      await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
      expect(await page.evaluate(() => window.__etude.AN.error)).toBeNull();
      expect(await page.evaluate(() => window.__etude.SCORE.layout)).toBe('page');
      const paged = await page.evaluate(scoreFingerprint);
      expect(await page.evaluate(scorePedalCollisions)).toEqual([]);
      await page.evaluate(() => { window.__etude.SCORE.layout = 'cont'; window.__etude.scoreLayout(); });
      const cont = await page.evaluate(scoreFingerprint);
      expect(cont.music, 'the continuous view engraves the same music').toEqual(paged.music);
      expect(await page.evaluate(scorePedalCollisions)).toEqual([]);

      const file = join(score.dir, score.name.replace(/\.\w+$/, '') + '.json'), saved = readJson(file);
      if (UPDATE) return writeJson(file, { music: paged.music, layout: { ...saved?.layout, [process.platform]: paged.layout } });
      expect(saved, `no baseline at ${file}; create it with UPDATE_GOLDEN=1`).not.toBeNull();
      expect(paged.music).toEqual(saved.music);
      if (saved.layout?.[process.platform]) expect(paged.layout).toEqual(saved.layout[process.platform]);
      else {
        // No baseline for this platform yet (e.g. Linux CI): keep the result so it can be reviewed and committed.
        const out = test.info().outputPath(score.name.replace(/\.\w+$/, '') + '.' + process.platform + '.json');
        writeJson(out, paged.layout);
        test.info().annotations.push({ type: 'golden', description: `no ${process.platform} layout baseline; result written to ${out}` });
        expect(REQUIRE_PLATFORM, `no ${process.platform} layout baseline in ${file}; the measured one is in ${out}`).toBe(false);
      }
    });
  }
});
