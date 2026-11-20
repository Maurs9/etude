// Builds the Vite site that GitHub Pages publishes at https://maurs9.github.io/etude/ (see .github/workflows/test.yml).
// Vite follows the module graph and emits hashed assets; the generated worker is written after the final output exists.
import { realpathSync } from 'node:fs';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as viteBuild } from 'vite';
import { generateWorker } from './generate-sw.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ROOT, 'dist', 'etude');

// /etude/ itself: forward to the app, keeping any query and hash; without JavaScript, the refresh or the link does it.
export const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Étude</title>
<link rel="canonical" href="etude.html">
<script>location.replace('etude.html' + location.search + location.hash);</script>
<noscript><meta http-equiv="refresh" content="0; url=etude.html"></noscript>
</head>
<body>
<p><a href="etude.html">Étude</a></p>
</body>
</html>
`;

// The build empties only its own dist/etude/. Any other folder must be new or empty, so a mistyped path (the repo, a
// home folder, or the repo under another letter case on macOS) is refused instead of deleted.
async function prepareOutDir(outDir) {
  if (outDir === OUT_DIR) return rm(outDir, { recursive: true, force: true });
  const entries = await readdir(outDir).catch(err => { if (err.code === 'ENOENT') return []; throw err; });
  if (entries.length) throw new Error(`Refusing to build into ${outDir}: it isn't empty, and only dist/etude/ is emptied before a build.`);
}

export async function build(outDir = OUT_DIR, { input = join(ROOT, 'etude.html'), singleFile = false, testSurface = false } = {}) {
  outDir = resolve(outDir);
  await prepareOutDir(outDir);
  const chunkOutput = singleFile
    ? { output: { codeSplitting: false } }
    : resolve(input) === resolve(join(ROOT, 'etude.html'))
      ? {
          output: {
            manualChunks(id) {
              const norm = id.replaceAll('\\', '/');
              if (/\/src\/domain\/score-(import|svg-post|midi|feature|harmony|markings|svg-markings|xml-markings|symbols)\.ts$/.test(norm)) return 'score-tools';
              if (/\/src\/(domain\/score-difficulty(?:-calibration|-import)?|sight-reading\/scored-exercise)\.ts$/.test(norm)) return undefined;
              if (norm.includes('/src/domain/score-library-ui')) return undefined;
              if (norm.includes('/src/sight-reading/') || norm.includes('/src/domain/technique')) return 'sight-reading';
              if (norm.includes('/src/domain/score-') || norm.includes('/src/domain/repertoire-data') || norm.includes('/src/domain/grand-staff') || norm.includes('/src/domain/sightsing-render') || norm.includes('/src/domain/notation') || norm.includes('/src/domain/melody') || norm.includes('/src/domain/theory')) return 'music-domain';
              if (norm.includes('/src/domain/audio') || norm.includes('/src/domain/feedback') || norm.includes('/src/domain/midi-timing') || norm.includes('/src/domain/progressive') || norm.includes('/src/domain/storage') || norm.includes('/src/domain/data-safety') || norm.includes('/src/domain/dom') || norm.includes('/src/domain/router') || norm.includes('/src/locales/catalog') || norm.includes('/src/locales/library-runtime') || norm.includes('/src/locales/loader')) return 'app-core';
            },
          },
        }
      : {};
  await viteBuild({
    configFile: join(ROOT, 'vite.config.mjs'),
    root: dirname(input),
    define: { __ETUDE_TEST_SURFACE__: JSON.stringify(testSurface) },
    build: {
      outDir,
      emptyOutDir: false,
      rolldownOptions: { input, ...chunkOutput },
    },
  });
  await writeFile(join(outDir, 'index.html'), INDEX_HTML);
  await generateWorker(outDir, join(outDir, 'sw.js'));
  return outDir;
}

// Run as a script, also through a symlinked path (on macOS, /tmp is one).
const invokedDirectly = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (invokedDirectly()) {
  try {
    const outDir = await build(process.argv[2] || OUT_DIR);
    const shown = relative(process.cwd(), outDir);
    console.log(`Built ${shown.startsWith('..') ? outDir : shown || '.'}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
