/* global window */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const usage = 'Usage: node scripts/calibrate-score-difficulty.mjs manifest.json [--report-only]';
const [filename, mode, ...extra] = process.argv.slice(2);
if (!filename || (mode !== undefined && mode !== '--report-only') || extra.length) {
  console.error(usage);
  process.exit(2);
}
const reportOnly = mode === '--report-only';
const directory = dirname(resolve(filename));
const rows = JSON.parse(await readFile(filename, 'utf8'));
if (!Array.isArray(rows) || !rows.length || rows.some(row => typeof row?.file !== 'string' ||
    !/\.(mid|midi|xml|musicxml|mxl)$/i.test(row.file) || (!reportOnly &&
    (!Number.isInteger(row.level) || row.level < 1 || row.level > 6 ||
      !['fit', 'check'].includes(row.split) || typeof row.group !== 'string' || !row.group.trim())))) {
  throw new Error('Expected a nonempty array of file, level (1–6), split (fit/check), and work group. Report-only needs file.');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true } });
let browser;
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Local calibration server did not open');
  browser = await chromium.launch({ ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/etude.html#analysis`);
  await page.waitForFunction(() => typeof window.__etude?.anInspectDifficulty === 'function');
  const references = [], digests = new Map();
  for (const row of rows) {
    const path = resolve(directory, row.file);
    if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error(`Score exceeds Étude's import limit: ${row.file}`);
    const raw = await readFile(path);
    if (!reportOnly) {
      const digest = createHash('sha256').update(raw).digest('hex');
      if (digests.has(digest)) throw new Error(`Duplicate original: ${row.file} and ${digests.get(digest)}`);
      digests.set(digest, row.file);
    }
    // File contents stay in this local browser context just as in the score library.
    const result = await page.evaluate(async ({ name, base64, bpm }) => {
      const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
      return window.__etude.anInspectDifficulty(new File([bytes], name), bpm);
    }, { name: row.file.split(/[\\/]/).at(-1), base64: raw.toString('base64'), bpm: row.bpm });
    if (!result.peak || (!reportOnly && result.uncertainty.tempoFallback)) {
      throw new Error(`Calibration requires playable notes and a written starting tempo or a verified BPM in the manifest: ${row.file}`);
    }
    references.push({ ...row, score: result.score, decisive: result.peak.writtenMeasures, uncertainty: result.uncertainty });
  }
  if (reportOnly) console.log(JSON.stringify({ references }, null, 2));
  else {
    const validation = await page.evaluate(async data => {
      const url = new URL('/src/domain/score-difficulty-calibration.ts', window.location.href);
      const { calibrateDifficulty } = await import(url.href);
      return calibrateDifficulty(data);
    }, references);
    if (!validation.improves) {
      console.error(JSON.stringify({ ...validation, references }, null, 2));
      throw new Error('Held-out scores did not improve on the constant-level baseline.');
    }
    console.error(JSON.stringify({ count: validation.count, exact: validation.exact, mae: validation.mae,
      baselineMae: validation.baselineMae, references }, null, 2));
    console.log(JSON.stringify(validation.profile, null, 2));
  }
} finally {
  try { await browser?.close(); }
  finally { await vite.close(); }
}
