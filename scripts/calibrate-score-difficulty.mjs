/* global window */
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const USAGE = [
  'Usage:',
  '  node scripts/calibrate-score-difficulty.mjs manifest.json [--report-only]',
  '  node scripts/calibrate-score-difficulty.mjs --rank-benchmark manifest.json [--fit-mode default|order|axis] [--write-profile out.json]',
  '  node scripts/calibrate-score-difficulty.mjs --midi-pairs pairs-manifest.json',
  '  node scripts/calibrate-score-difficulty.mjs --audit local-manifest.json [--export-tempos out.json]',
].join('\n');

function parseArgs(argv) {
  if (!argv.length || argv.includes('--help')) {
    console.log(USAGE);
    process.exit(argv.includes('--help') ? 0 : 2);
  }
  const flag = argv[0];
  if (flag === '--rank-benchmark' || flag === '--midi-pairs' || flag === '--audit') {
    const manifest = argv[1];
    if (!manifest || manifest.startsWith('--')) {
      console.error(USAGE);
      process.exit(2);
    }
    let fitMode = 'default';
    let writeProfile = null;
    let exportTempos = null;
    for (let i = 2; i < argv.length; i++) {
      const arg = argv[i];
      if (flag === '--rank-benchmark' && arg === '--fit-mode' && ['default', 'order', 'axis'].includes(argv[i + 1])) {
        fitMode = argv[++i];
      } else if (flag === '--rank-benchmark' && arg === '--write-profile' && argv[i + 1]) {
        writeProfile = argv[++i];
      } else if (flag === '--audit' && arg === '--export-tempos' && argv[i + 1]) {
        exportTempos = argv[++i];
      } else {
        console.error(USAGE);
        process.exit(2);
      }
    }
    return { command: flag.slice(2), manifest, fitMode, writeProfile, exportTempos };
  }
  const [filename, mode, ...extra] = argv;
  if (!filename || (mode !== undefined && mode !== '--report-only') || extra.length) {
    console.error(USAGE);
    process.exit(2);
  }
  return { command: mode === '--report-only' ? 'report-only' : 'legacy-calibrate', manifest: filename };
}

const parsedArgs = parseArgs(process.argv.slice(2));
const directory = dirname(resolve(parsedArgs.manifest));
const rows = JSON.parse(await readFile(parsedArgs.manifest, 'utf8'));
if (!Array.isArray(rows) || !rows.length) {
  throw new Error('Expected a nonempty JSON array manifest.');
}

const SCORE_FILE_RE = /\.(mid|midi|xml|musicxml|mxl)$/i;
if (parsedArgs.command === 'legacy-calibrate' || parsedArgs.command === 'report-only') {
  const reportOnly = parsedArgs.command === 'report-only';
  if (rows.some(row => typeof row?.file !== 'string' || !SCORE_FILE_RE.test(row.file) || (!reportOnly &&
      (!Number.isInteger(row.level) || row.level < 1 || row.level > 6 ||
        !['fit', 'check'].includes(row.split) || typeof row.group !== 'string' || !row.group.trim())))) {
    throw new Error('Expected a nonempty array of file, level (1–6), split (fit/check), and work group. Report-only needs file.');
  }
} else if (parsedArgs.command === 'rank-benchmark') {
  if (rows.some(row => typeof row?.file !== 'string' || !SCORE_FILE_RE.test(row.file) ||
      typeof row.henle !== 'number' || !Number.isFinite(row.henle) || row.henle < 1 || row.henle > 9 ||
      typeof row.group !== 'string' || !row.group.trim())) {
    throw new Error('Rank benchmark expects entries with file, henle (1–9), and non-empty group.');
  }
} else if (parsedArgs.command === 'midi-pairs') {
  if (rows.some(row => typeof row?.xml !== 'string' || !/\.(xml|musicxml|mxl)$/i.test(row.xml) ||
      typeof row?.midi !== 'string' || !/\.(mid|midi)$/i.test(row.midi))) {
    throw new Error('MIDI pairs manifest expects entries with xml and midi file paths.');
  }
} else if (parsedArgs.command === 'audit') {
  if (rows.some(row => typeof row?.file !== 'string' || !SCORE_FILE_RE.test(row.file) ||
      (row.level !== undefined && (!Number.isInteger(row.level) || row.level < 1 || row.level > 6)))) {
    throw new Error('Local audit manifest expects entries with file and optional level (1–6).');
  }
}

async function readScoreBytes(relativePath) {
  const fullPath = resolve(directory, relativePath);
  if ((await stat(fullPath)).size > 2 * 1024 * 1024) {
    throw new Error(`Score exceeds Étude's import limit: ${relativePath}`);
  }
  const raw = await readFile(fullPath);
  const digest = createHash('sha256').update(raw).digest('hex');
  return { name: relativePath.split(/[\\/]/).at(-1), base64: raw.toString('base64'), digest };
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

  const inspectFile = (payload, bpm, options) => page.evaluate(async ({ name, base64, bpm: refBpm, options: opts }) => {
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    return window.__etude.anInspectDifficulty(new File([bytes], name), refBpm, opts);
  }, { ...payload, bpm, options });

  if (parsedArgs.command === 'legacy-calibrate' || parsedArgs.command === 'report-only') {
    const reportOnly = parsedArgs.command === 'report-only';
    const references = [], digests = new Map();
    for (const row of rows) {
      const payload = await readScoreBytes(row.file);
      if (!reportOnly) {
        if (digests.has(payload.digest)) throw new Error(`Duplicate original: ${row.file} and ${digests.get(payload.digest)}`);
        digests.set(payload.digest, row.file);
      }
      // File contents stay in this local browser context just as in the score library.
      const result = await inspectFile(payload, row.bpm);
      if (!result.peak || (!reportOnly && result.uncertainty.tempoFallback)) {
        throw new Error(`Calibration requires playable notes and a written starting tempo or a verified BPM in the manifest: ${row.file}`);
      }
      references.push({
        ...row, score: result.score, decisive: result.peak.writtenMeasures, difficultyStars: result.difficultyStars,
        axisDifficulty: result.axisDifficulty, uncertainty: result.uncertainty,
      });
    }
    if (reportOnly) {
      console.log(JSON.stringify({ references }, null, 2));
    } else {
      const validation = await page.evaluate(async data => {
        const url = new URL('/src/domain/score-difficulty-calibration.ts', window.location.href);
        const { calibrateDifficulty } = await import(url.href);
        return calibrateDifficulty(data);
      }, references);
      if (!validation.improves) {
        console.error(JSON.stringify({ ...validation, references }, null, 2));
        throw new Error('Held-out scores did not improve on the constant-level baseline.');
      }
      console.error(JSON.stringify({
        count: validation.count, exact: validation.exact, mae: validation.mae,
        baselineMae: validation.baselineMae, references,
      }, null, 2));
      console.log(JSON.stringify(validation.profile, null, 2));
    }
  } else if (parsedArgs.command === 'rank-benchmark') {
    const items = [], digests = new Map();
    for (const row of rows) {
      const payload = await readScoreBytes(row.file);
      if (digests.has(payload.digest)) throw new Error(`Duplicate original: ${row.file} and ${digests.get(payload.digest)}`);
      digests.set(payload.digest, row.file);
      const v1 = await inspectFile(payload, row.bpm, { rubricVersion: 1 });
      const v2 = await inspectFile(payload, row.bpm, { rubricVersion: 2 });
      if (!v1.axisDifficulty || !v2.axisDifficulty || v1.difficultyStars === null || v2.difficultyStars === null) {
        throw new Error(`Rank benchmark requires playable notes: ${row.file}`);
      }
      const v2Axes = {
        motor: v2.axisDifficulty.motor.stars,
        rhythm: v2.axisDifficulty.rhythm.stars,
        bimanual: v2.axisDifficulty.bimanual.stars,
        texture: v2.axisDifficulty.texture.stars,
        reading: v2.axisDifficulty.reading.stars,
      };
      const v2EnduranceRaw = v2.enduranceRaw ?? Math.min(0.5, Math.max(0, (v2.endurance ?? 0) / 12));
      items.push({
        group: row.group,
        truth: row.henle,
        v1Stars: v1.difficultyStars,
        v2Axes,
        v2EnduranceRaw,
        v2Stars: v2.difficultyStars,
      });
    }
    const comparison = await page.evaluate(async ({ benchmarkItems, mode }) => {
      const url = new URL('/src/domain/score-difficulty-calibration.ts', window.location.href);
      const { evaluateRankBenchmark } = await import(url.href);
      return {
        selected: evaluateRankBenchmark(benchmarkItems, { fitMode: mode }),
        orderCandidate: evaluateRankBenchmark(benchmarkItems, { fitMode: 'order' }),
        axisCandidate: evaluateRankBenchmark(benchmarkItems, { fitMode: 'axis' }),
      };
    }, { benchmarkItems: items, mode: parsedArgs.fitMode });
    console.log(JSON.stringify(comparison, null, 2));
    if (parsedArgs.writeProfile) {
      if (!comparison.selected.accepted) {
        throw new Error('Rank benchmark acceptance gate was not met; profile was not written.');
      }
      await writeFile(resolve(parsedArgs.writeProfile), `${JSON.stringify(comparison.selected.profile, null, 2)}\n`);
    }
  } else if (parsedArgs.command === 'midi-pairs') {
    const pairReports = [];
    for (const row of rows) {
      const xmlPayload = await readScoreBytes(row.xml);
      const midiPayload = await readScoreBytes(row.midi);
      const xmlRes = await inspectFile(xmlPayload, row.bpm);
      const midiRes = await inspectFile(midiPayload, row.bpm);
      const axisDeltas = xmlRes.axisDifficulty && midiRes.axisDifficulty
        ? Object.fromEntries(Object.keys(xmlRes.axisDifficulty).map(axis => [
          axis,
          Math.round((midiRes.axisDifficulty[axis].stars - xmlRes.axisDifficulty[axis].stars) * 10) / 10,
        ]))
        : null;
      const antiChainingOk = row.kind === 'rapid_run' || row.kind === 'arpeggio'
        ? (midiRes.peak?.attacks ?? 0) > 1
        : row.kind === 'jittered'
          ? (midiRes.peak?.attacks ?? 0) <= (xmlRes.peak?.attacks ?? Infinity)
          : true;
      pairReports.push({
        name: row.name ?? row.xml,
        kind: row.kind ?? 'quantized',
        xmlStars: xmlRes.difficultyStars,
        midiStars: midiRes.difficultyStars,
        starDelta: xmlRes.difficultyStars !== null && midiRes.difficultyStars !== null
          ? Math.round((midiRes.difficultyStars - xmlRes.difficultyStars) * 10) / 10
          : null,
        axisDeltas,
        xmlAttacks: xmlRes.peak?.attacks ?? 0,
        midiAttacks: midiRes.peak?.attacks ?? 0,
        midiProvenance: midiRes.uncertainty,
        antiChainingOk,
      });
    }
    const valid = pairReports.filter(p => p.xmlStars !== null && p.midiStars !== null);
    const rankStats = valid.length >= 2
      ? await page.evaluate(async ({ x, y }) => {
        const url = new URL('/src/domain/score-difficulty-calibration.ts', window.location.href);
        const { kendallTauC, spearmanRho } = await import(url.href);
        return { tauC: kendallTauC(x, y), rho: spearmanRho(x, y) };
      }, { x: valid.map(p => p.midiStars), y: valid.map(p => p.xmlStars) })
      : null;
    console.log(JSON.stringify({ count: pairReports.length, rankStats, pairs: pairReports }, null, 2));
  } else if (parsedArgs.command === 'audit') {
    const auditItems = [];
    const filesById = new Map();
    for (const row of rows) {
      const payload = await readScoreBytes(row.file);
      const result = await inspectFile(payload, row.bpm);
      if (result.difficultyStars === null) continue;
      const verifiedBpm = typeof row.bpm === 'number' && Number.isFinite(row.bpm) && row.bpm >= 20 && row.bpm <= 400
        ? row.bpm
        : undefined;
      filesById.set(payload.digest, row.file);
      auditItems.push({
        id: payload.digest,
        ...(row.level !== undefined ? { level: row.level } : {}),
        stars: result.difficultyStars,
        tempoSource: result.uncertainty.tempoSource,
        ...(verifiedBpm !== undefined ? { verifiedBpm } : {}),
      });
    }
    const report = await page.evaluate(async items => {
      const url = new URL('/src/domain/score-difficulty-calibration.ts', window.location.href);
      const { DEFAULT_AGGREGATION } = await import('/src/domain/score-difficulty.ts');
      const { auditLocalLibrary, computeCalibrationProfileId } = await import(url.href);
      const audit = auditLocalLibrary(items);
      const profile = {
        version: 2,
        profileId: computeCalibrationProfileId(DEFAULT_AGGREGATION),
        aggregation: DEFAULT_AGGREGATION,
        startingTempos: audit.startingTempos,
      };
      return { audit, profile };
    }, auditItems);
    console.log(JSON.stringify({
      ...report.audit,
      fallbackFiles: report.audit.fallbackIds.map(id => filesById.get(id) ?? id),
      startingTemposCount: Object.keys(report.audit.startingTempos).length,
    }, null, 2));
    if (parsedArgs.exportTempos) {
      await writeFile(resolve(parsedArgs.exportTempos), `${JSON.stringify(report.profile, null, 2)}\n`);
    }
  }
} finally {
  try { await browser?.close(); }
  finally { await vite.close(); }
}
