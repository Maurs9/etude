// Builds the site that GitHub Pages publishes at https://maurs9.github.io/etude/ (see .github/workflows/test.yml).
// The app has no build step: every file it loads is copied byte for byte into dist/etude/, plus an index.html that
// forwards /etude/ to the app. Serve dist/ to see the site at the same paths as on Pages (`npm run preview`).
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorker } from './generate-sw.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ROOT, 'dist', 'etude');

// Every file the deployed app loads: the page, its service worker, the web app manifest and the icons. Only these are
// published, so a file the app starts to load must be added here (tests/deploy.spec.mjs checks the published site).
export const SITE_FILES = [
  'etude.html',
  'sw.js',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
];

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

export async function build(outDir = OUT_DIR) {
  outDir = resolve(outDir);
  await prepareOutDir(outDir);
  for (const file of SITE_FILES) {
    await mkdir(dirname(join(outDir, file)), { recursive: true });
    await copyFile(join(ROOT, file), join(outDir, file));
  }
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
    console.log(`Built ${shown.startsWith('..') ? outDir : shown || '.'} (${SITE_FILES.length + 1} files)`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
