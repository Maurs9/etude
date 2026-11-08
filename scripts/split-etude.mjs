import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APP_FILE = join(ROOT, 'etude.html');
export const APP_SOURCE = join(ROOT, 'src', 'domain', 'views.ts');
export const CSS_SOURCE = join(ROOT, 'src', 'styles', 'etude.css');
export const OSMD_SOURCE = join(ROOT, 'public', 'vendor', 'osmd-1.9.9.min.js');
export const PIANO_DIR = join(ROOT, 'src', 'assets', 'piano');

const STYLE_MARKER = '<!-- etude: extracted style -->';
const STYLE_TAG = '<link rel="stylesheet" href="./src/styles/etude.css">';
const FONT_TAG = '<link rel="stylesheet" href="./src/styles/fonts.css">';
const GOOGLE_FONT_BLOCK = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,900;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;
const PIANO_TAG = '<!-- etude: piano recordings are separate files -->';
const OSMD_MARKER = '<!-- etude: extracted osmd -->';
const OSMD_TAG = '<script defer src="./vendor/osmd-1.9.9.min.js"></script>';
const APP_MARKER = '<!-- etude: extracted app -->';
const APP_TAG = `<script>
(()=>{let booted=false, shown=false;
  const show=()=>{if(booted||shown)return; shown=true;
    const ro=/^ro\\b/i.test(navigator.language||'');
    const box=document.createElement('div'); box.setAttribute('role','alert');
    box.style.cssText='position:fixed;inset:16px;z-index:9999;padding:24px;border:2px solid #8c2b2b;border-radius:12px;background:#fffdf8;color:#1a1714;font:600 16px/1.5 sans-serif;box-shadow:0 12px 40px #0004';
    const message=ro?'Étude nu a putut porni. Reîncarcă pagina.':'Étude could not start. Reload the page.';
    box.innerHTML='<p style="margin:0 0 12px">'+message+'</p><button type="button" style="font:inherit;padding:8px 14px">'+(ro?'Reîncarcă':'Reload')+'</button>';
    box.querySelector('button').addEventListener('click',()=>location.reload()); document.body.append(box);
  };
  window.__etudeBooted=()=>{booted=true;};
  addEventListener('error',show); addEventListener('unhandledrejection',show);
  addEventListener('load',()=>setTimeout(show,0),{once:true});
})();
</script>
<script type="module" src="./src/domain/views.ts"></script>`;

function block(source, open, close) {
  const start = source.indexOf(open);
  if (start < 0) throw new Error(`Missing split boundary: ${open}`);
  const end = source.indexOf(close, start + open.length);
  if (end < 0) throw new Error(`Missing split boundary: ${close}`);
  return { start, end: end + close.length, text: source.slice(start, end + close.length) };
}

function pianoBlock(json) {
  return `<script type="application/json" id="piano-recordings">${JSON.stringify(json)}</script>`;
}

export async function split(source = null) {
  source ||= await readFile(APP_FILE, 'utf8');
  const parts = splitSource(source);
  await mkdir(dirname(CSS_SOURCE), { recursive: true });
  await mkdir(dirname(APP_SOURCE), { recursive: true });
  await mkdir(dirname(OSMD_SOURCE), { recursive: true });
  await mkdir(PIANO_DIR, { recursive: true });
  await mkdir(join(ROOT, 'public', 'icons'), { recursive: true });
  await writeFile(CSS_SOURCE, parts.css);
  await writeFile(APP_SOURCE, parts.app);
  await writeFile(OSMD_SOURCE, parts.osmd);
  for (const [midi, base64] of Object.entries(parts.piano))
    await writeFile(join(PIANO_DIR, `${midi}.mp3`), Buffer.from(base64, 'base64'));
  await writeFile(join(ROOT, 'public', 'manifest.webmanifest'), await readFile(join(ROOT, 'manifest.webmanifest')));
  for (const icon of ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon.svg'])
    await copyFile(join(ROOT, 'icons', icon), join(ROOT, 'public', 'icons', icon));
  await writeFile(APP_FILE, parts.shell);
  return { shell: parts.shell, pianoKeys: Object.keys(parts.piano).map(Number) };
}

export function splitSource(source) {
  const style = block(source, '<style>', '</style>');
  const piano = block(source, '<script type="application/json" id="piano-recordings">', '</script>');
  const osmd = block(source, '<script type="text/javascript">', '</script>');
  const app = block(source, '<script>\n"use strict";', '</script>');
  if (!(style.start < piano.start && piano.end < osmd.start && osmd.end < app.start)) throw new Error('Unexpected etude.html block order');

  const styleBody = style.text.slice('<style>'.length, -'</style>'.length);
  const pianoJson = JSON.parse(piano.text.slice('<script type="application/json" id="piano-recordings">'.length, -'</script>'.length));
  const osmdBody = osmd.text.slice('<script type="text/javascript">'.length, -'</script>'.length);
  const appBody = app.text.slice('<script>\n'.length, -'</script>'.length);

  let shell = source.slice(0, style.start) + STYLE_MARKER + STYLE_TAG + source.slice(style.end, piano.start);
  shell += PIANO_TAG + source.slice(piano.end, osmd.start);
  shell += OSMD_MARKER + OSMD_TAG + source.slice(osmd.end, app.start);
  shell += APP_MARKER + APP_TAG + source.slice(app.end);
  return { shell, css: styleBody, app: appBody, osmd: osmdBody, piano: pianoJson };
}

export async function joinSplit() {
  const shell = await readFile(APP_FILE, 'utf8');
  const css = await readFile(CSS_SOURCE, 'utf8');
  const app = await readFile(APP_SOURCE, 'utf8');
  const osmd = await readFile(OSMD_SOURCE, 'utf8');
  const keys = await (await import('node:fs/promises')).readdir(PIANO_DIR);
  const json = {};
  for (const file of keys.filter(file => file.endsWith('.mp3')).sort((a, b) => Number(a.slice(0, -4)) - Number(b.slice(0, -4)))) {
    json[file.slice(0, -4)] = (await readFile(join(PIANO_DIR, file))).toString('base64');
  }
  return joinSource({ shell, css, app, osmd, piano: json });
}

export function joinSource({ shell, css, app, osmd, piano }) {
  return shell
    .replace(FONT_TAG, () => GOOGLE_FONT_BLOCK)
    .replace(STYLE_MARKER + STYLE_TAG, () => `<style>${css}</style>`)
    .replace(PIANO_TAG, () => pianoBlock(piano))
    .replace(OSMD_MARKER + OSMD_TAG, () => `<script type="text/javascript">${osmd}</script>`)
    .replace(APP_MARKER + APP_TAG, () => `<script>\n${app}</script>`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--join')) process.stdout.write(await joinSplit());
  else await split();
}
