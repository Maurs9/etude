// Compare scores without plugging the experimental estimator into G14 or changing the numbered book.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';

const source = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(source.href) && specifier.startsWith('.') && specifier.endsWith('.js')) {
      const typed = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
      if (existsSync(typed)) return next(typed.href, context);
    }
    return next(specifier, context);
  },
});

const USAGE = 'Usage: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/score-difficulty-report.mjs [--level 1..8] [--json]';
let levels = [1, 2, 3, 4, 5, 6, 7, 8], json = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--help') {
    console.log(USAGE);
    process.exit(0);
  }
}
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--json') json = true;
  else if (process.argv[i] === '--level' && /^[1-8]$/.test(process.argv[i + 1] ?? '')) levels = [Number(process.argv[++i])];
  else {
    console.error(USAGE);
    process.exit(2);
  }
}

const [{ srtBook }, { srtLevelFingerprint }, { srtHashText }, { levelPieceToDifficultyInput }, { estimateScoreDifficulty }] =
  await Promise.all([
    import('../src/sight-reading/book.ts'),
    import('../src/sight-reading/fingerprint.ts'),
    import('../src/sight-reading/melody.ts'),
    import('../src/sight-reading/difficulty.ts'),
    import('../src/domain/score-difficulty.ts'),
  ]);

const mean = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100;
const range = values => ({ min: Math.min(...values), mean: mean(values), max: Math.max(...values) });
const results = levels.map(level => {
  const before = performance.now();
  const book = srtBook(level);
  const generateMs = Math.round(performance.now() - before);
  const fingerprints = book.map(srtLevelFingerprint);
  const start = performance.now();
  const pieces = book.map((piece, index) => {
    const next = estimateScoreDifficulty(levelPieceToDifficultyInput(piece), 'sightReading');
    return {
      number: index + 1, key: piece.key.id, fingerprint: fingerprints[index],
      current: piece.difficulty, experimental: next.score, decisive: next.peak, typical: next.typical,
    };
  });
  return {
    level, count: pieces.length, bookPin: srtHashText(fingerprints.join()), generateMs, analysisMs: Math.round(performance.now() - start),
    current: range(pieces.map(piece => piece.current)), experimental: range(pieces.map(piece => piece.experimental)), pieces,
  };
});
if (json) {
  console.log(JSON.stringify({ experimental: true, comparableAcrossScales: false, levels: results }, null, 2));
} else {
  console.table(results.map(({ level, count, bookPin, generateMs, analysisMs, current, experimental }) => ({
    level, count, bookPin, generateMs, analysisMs,
    current: `${current.min} / ${current.mean} / ${current.max}`,
    experimental: `${experimental.min} / ${experimental.mean} / ${experimental.max}`,
  })));
  console.log('Columns show min / mean / max. The experimental score has its own uncalibrated scale.');
  console.log('Use --json for the decisive measures and per-axis explanation for each piece.');
}
