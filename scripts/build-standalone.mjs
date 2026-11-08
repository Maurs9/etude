import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build, OUT_DIR, ROOT } from './build.mjs';

const standalone = join(ROOT, 'dist', 'etude-standalone.html');
await build();

let html = await readFile(join(OUT_DIR, 'etude.html'), 'utf8');
const cssMatch = html.match(/<link rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
const moduleMatch = html.match(/<script type="module"[^>]+src="([^"]+)"[^>]*><\/script>/);
if (!cssMatch || !moduleMatch) throw new Error('Vite output is missing the stylesheet or app module');

const css = await readFile(join(OUT_DIR, cssMatch[1].replace(/^\.\//, '')), 'utf8');
let app = await readFile(join(OUT_DIR, moduleMatch[1].replace(/^\.\//, '')), 'utf8');
const osmd = await readFile(join(OUT_DIR, 'vendor', 'osmd-1.9.9.min.js'), 'utf8');
let standaloneCss = css;
const iconMatch = html.match(/<link rel="apple-touch-icon"[^>]+href="([^"]+)"[^>]*>/);
if (iconMatch) {
  const iconPath = join(OUT_DIR, iconMatch[1].replace(/^\.\//, ''));
  const icon = `data:image/png;base64,${(await readFile(iconPath)).toString('base64')}`;
  html = html.replace(iconMatch[0], iconMatch[0].replace(iconMatch[1], icon));
}
for (const file of await readdir(join(OUT_DIR, 'assets'))) {
  if (!file.endsWith('.woff2')) continue;
  const data = `data:font/woff2;base64,${(await readFile(join(OUT_DIR, 'assets', file))).toString('base64')}`;
  standaloneCss = standaloneCss.replaceAll(`url(./${file})`, `url(${data})`);
}
for (const file of await readdir(join(OUT_DIR, 'assets'))) {
  if (!file.endsWith('.mp3')) continue;
  const data = `data:audio/mpeg;base64,${(await readFile(join(OUT_DIR, 'assets', file))).toString('base64')}`;
  app = app.replaceAll(`\`${file}\``, `\`${data}\``);
}

html = html
  .replace(cssMatch[0], () => `<style>${standaloneCss}</style>`)
  .replace(moduleMatch[0], () => `<script>${osmd}</script><script type="module">${app}</script>`);
  ;
await writeFile(standalone, html);
console.log(`Built ${standalone} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`);
