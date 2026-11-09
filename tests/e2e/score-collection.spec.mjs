import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '../helpers/fixtures.mjs';
import { scorePedalCollisions } from '../helpers/score-audit-helpers.mjs';
import { scoreMarkingCoverage, scoreNavigationCollisions, scoreSourceMarkingCoverage } from '../helpers/score-marking-audit.mjs';

// Opt-in: the user's scores are private/untracked and must never become fixtures.
// ETUDE_SCORES_DIR=MIDI ETUDE_DEV_SERVER=1 npx playwright test score-collection --project=app
const directory = process.env.ETUDE_SCORES_DIR;
const files = directory ? readdirSync(directory).filter(file => /\.(mxl|musicxml|xml)$/i.test(file)).sort() : [];
const auditDir = process.env.ETUDE_AUDIT_DIR ? resolve(process.env.ETUDE_AUDIT_DIR) : null;
if (auditDir) mkdirSync(auditDir, { recursive: true });

test.describe('local score collection', () => {
  test.use({ viewport: { width: 1400, height: 1000 } });
  if (!files.length) test('requires ETUDE_SCORES_DIR with MusicXML scores', () => test.skip(true, 'Local collection audit is opt-in'));
  for (const file of files) {
    test(`${file}: pages, continuous, narrow/night and marking coverage`, async ({ app, page }, info) => {
      test.setTimeout(180_000);
      const bytes = readFileSync(join(directory, file));
      const report = { file, sha256: createHash('sha256').update(bytes).digest('hex'), layouts: [], screenshots: [] };
      try {
        await app.open({ hash: 'analysis', lang: 'ro' });
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#an-file').setInputFiles({ name: file, mimeType: /\.mxl$/i.test(file) ? 'application/vnd.recordare.musicxml' : 'application/xml', buffer: bytes });
        await page.waitForFunction(() => !window.__etude.AN.loading && (!!window.__etude.SCORE.geo || window.__etude.AN.error));
        expect(await page.evaluate(() => window.__etude.AN.error), 'score import').toBeNull();
        let fingerprint;
        for (const mode of ['page', 'cont', 'narrow-night']) {
          if (mode === 'narrow-night') await page.setViewportSize({ width: 600, height: 900 });
          if (mode !== 'page') await page.evaluate(mode => {
            window.__etude.SCORE.layout = mode === 'cont' ? 'cont' : 'page';
            window.__etude.SCORE.look = mode === 'narrow-night' ? 'night' : 'paper';
            window.__etude.scoreLayout();
          }, mode);
          const music = await page.evaluate(() => ({
            notes: window.__etude.AN.notes.length,
            heads: document.querySelectorAll('#an-roll .vf-notehead').length,
            bound: window.__etude.SCORE.heads.size,
            pages: window.__etude.SCORE.geo.pages.length,
            measures: window.__etude.SCORE.geo.measures.filter(Boolean).length,
            systems: window.__etude.SCORE.geo.systems.length,
          }));
          if (!fingerprint) fingerprint = music;
          const coverage = await page.evaluate(scoreMarkingCoverage);
          const sourceCoverage = await page.evaluate(scoreSourceMarkingCoverage, { name: file, bytes: [...bytes] });
          const pedals = await page.evaluate(scorePedalCollisions);
          const navigation = await page.evaluate(scoreNavigationCollisions);
          report.layouts.push({ mode, ...music, coverage, sourceCoverage, pedals, navigation });
          expect.soft(music.notes, mode + ' has playable notes').toBeGreaterThan(0);
          expect.soft(music.heads, mode + ' has visible notes').toBeGreaterThan(0);
          expect.soft({ notes: music.notes, heads: music.heads, measures: music.measures }, mode + ' preserves musical content').toEqual({ notes: fingerprint.notes, heads: fingerprint.heads, measures: fingerprint.measures });
          expect.soft(coverage.missing, mode + ' visible markings without tooltip targets').toEqual([]);
          expect.soft(coverage.empty, mode + ' empty/untranslated explanations').toEqual([]);
          expect.soft(coverage.editorial, mode + ' musical instructions need specific meanings').toEqual([]);
          expect.soft(sourceCoverage.actual, mode + ' source grace notes, parentheses, direction trills and metronomes are preserved').toEqual(sourceCoverage.expected);
          expect.soft(sourceCoverage.omittedWords, mode + ' source musical instructions survive import and have explanations').toEqual([]);
          expect.soft(sourceCoverage.unknownGlyphs.filter(glyph => !glyph.coveredBy), mode + ' private glyphs need explicit source semantics').toEqual([]);
          expect.soft(pedals, mode + ' pedal ink collisions').toEqual([]);
          expect.soft(navigation, mode + ' navigation/tempo collisions').toEqual([]);
          if (mode === 'page' && auditDir && process.env.ETUDE_AUDIT_SCREENSHOTS) {
            const pages = page.locator('#an-roll svg');
            // Copy the actual rendered SVG, not a new engraving. Scroll clipping
            // and fixed app controls must not obscure the evidence screenshots.
            const snapshot = await page.context().newPage();
            try {
              for (let index = 0; index < await pages.count(); index++) {
                const source = await pages.nth(index).evaluate(svg => ({ xml: svg.outerHTML, width: Math.ceil(svg.getBoundingClientRect().width), height: Math.ceil(svg.getBoundingClientRect().height) }));
                await snapshot.setViewportSize({ width: source.width, height: source.height });
                await snapshot.setContent(`<style>html,body{margin:0;background:#fffefa}svg{display:block;width:${source.width}px;height:${source.height}px}</style>${source.xml}`);
                await snapshot.evaluate(() => document.fonts.ready);
                const path = join(auditDir, file.replace(/\.[^.]+$/, '') + `-page-${index + 1}.png`);
                await snapshot.screenshot({ path, fullPage: true });
                report.screenshots.push(path);
              }
            } finally { await snapshot.close(); }
          }
        }
      } finally {
        const json = JSON.stringify(report, null, 2);
        await info.attach('score-audit', { body: json, contentType: 'application/json' });
        if (auditDir) writeFileSync(join(auditDir, file.replace(/\.[^.]+$/, '') + '.json'), json + '\n');
      }
    });
  }
});
