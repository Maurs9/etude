import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, ROOT } from './build.mjs';

const standalone = join(ROOT, 'dist', 'etude-standalone.html');
// Keep the deployed web graph split. Only the isolated file:// build inlines imports.
await build();
const singleDir = await mkdtemp(join(ROOT, 'dist', '.standalone-'));
try {
  await build(singleDir, { singleFile: true });
  let html = await readFile(join(singleDir, 'etude.html'), 'utf8');
  const cssMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
  const moduleMatch = html.match(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/);
  if (!cssMatch || !moduleMatch) throw new Error('Vite output is missing the stylesheet or app module');

  const css = await readFile(join(singleDir, cssMatch[1].replace(/^\.\//, '')), 'utf8');
  let app = await readFile(join(singleDir, moduleMatch[1].replace(/^\.\//, '')), 'utf8');
  const osmd = await readFile(join(singleDir, 'vendor', 'osmd-2.3.0.min.js'), 'utf8');
  let standaloneCss = css;
  const iconMatch = html.match(/<link rel="apple-touch-icon"[^>]+href="([^"]+)"[^>]*>/);
  if (iconMatch) {
    const iconPath = join(singleDir, iconMatch[1].replace(/^\.\//, ''));
    const icon = `data:image/png;base64,${(await readFile(iconPath)).toString('base64')}`;
    html = html.replace(iconMatch[0], iconMatch[0].replace(iconMatch[1], icon));
  }
  for (const file of await readdir(join(singleDir, 'assets'))) {
    if (!file.endsWith('.woff2')) continue;
    const data = `data:font/woff2;base64,${(await readFile(join(singleDir, 'assets', file))).toString('base64')}`;
    standaloneCss = standaloneCss.replaceAll(`url(./${file})`, `url(${data})`);
  }
  for (const file of await readdir(join(singleDir, 'assets'))) {
    if (!file.endsWith('.mp3')) continue;
    const data = `data:audio/mpeg;base64,${(await readFile(join(singleDir, 'assets', file))).toString('base64')}`;
    app = app.replaceAll(`\`${file}\``, `\`${data}\``);
  }

  html = html
    .replace(cssMatch[0], () => `<style>${standaloneCss}</style>`)
    .replace(moduleMatch[0], () => `<script type="application/x-etude-osmd" id="etude-osmd-source">${osmd}</script><script type="module">${app}</script>`);
  await writeFile(standalone, html);
  console.log(`Built ${standalone} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
} finally {
  // This directory was created by this invocation, never a user-provided path.
  await rm(singleDir, { recursive: true, force: true });
}
