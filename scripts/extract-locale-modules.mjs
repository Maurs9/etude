import { parse } from 'acorn';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'legacy', 'app.js');
const LOCALE_DIR = join(ROOT, 'src', 'locales');
const CONTENT_NAMES = ['LESSONS', 'LEARN_UNITS', 'LQZ', 'LSUM', 'GLOSS'];

const moduleSource = (name, value) => `/* Generated from the frozen Step 3 app data. Keep locale data static and synchronously importable. */
export const ${name} = ${JSON.stringify(value, null, 2)};
`;

function isVariable(node, name) {
  return node.type === 'VariableDeclaration' &&
    node.declarations.some(declaration => declaration.id.type === 'Identifier' && declaration.id.name === name);
}

function textOf(source, node) {
  return source.slice(node.start, node.end);
}

export async function extractLocaleModules() {
  const source = await readFile(APP, 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const localeEnd = ast.body.find(node => isVariable(node, 'LOCALE_TAGS'));
  const tNode = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 't');
  if (!localeEnd || !tNode) throw new Error('Could not locate locale boundary or t()');
  const localeStart = source.indexOf('const STRINGS=');
  if (localeStart < 0 || localeStart > localeEnd.end) throw new Error('Could not locate STRINGS');

  const localeParts = [{ start: localeStart, end: localeEnd.end, text: source.slice(localeStart, localeEnd.end) }];
  const contentParts = [{ start: localeStart, end: localeEnd.end, text: source.slice(localeStart, localeEnd.end) }];
  const remove = [{ start: localeStart, end: localeEnd.end }];
  const songRo = ast.body.find(node => isVariable(node, 'SONGS_RO'));
  if (songRo) {
    localeParts.push({ start: songRo.start, end: songRo.end, text: textOf(source, songRo) });
    remove.push({ start: songRo.start, end: songRo.end });
  }

  for (const node of ast.body) {
    const text = textOf(source, node);
    if (node.start > localeEnd.end && /^Object\.assign\(STRINGS(?:\.en|\.ro)?/.test(text)) {
      localeParts.push({ start: node.start, end: node.end, text });
      remove.push({ start: node.start, end: node.end });
    }
    if (node.start > localeEnd.end && /^I18N_MUSIC\.songs\.ro\s*=/.test(text)) {
      localeParts.push({ start: node.start, end: node.end, text });
      remove.push({ start: node.start, end: node.end });
    }
    if (node.start > localeEnd.end && CONTENT_NAMES.some(name => isVariable(node, name))) {
      contentParts.push({ start: node.start, end: node.end, text });
      remove.push({ start: node.start, end: node.end });
    }
    if (node.start > localeEnd.end && (/^LESSONS\.push/.test(text) || /LESSONS\.length\s*=/.test(text) || /function initTheoryI18n/.test(text) || /^Object\.assign\(LQZ/.test(text))) {
      contentParts.push({ start: node.start, end: node.end, text });
      remove.push({ start: node.start, end: node.end });
    }
  }

  const evaluate = (parts, result) => {
    const code = parts.sort((a, b) => a.start - b.start).map(part => part.text).join('\n');
    const context = {};
    vm.runInNewContext(`${code}\n;__out=${result};`, context, { timeout: 15_000 });
    return context.__out;
  };
  const locale = evaluate(localeParts, '{STRINGS,I18N_MUSIC,STEP_LABELS,LOCALE_TAGS}');
  const content = evaluate(contentParts, `{${CONTENT_NAMES.join(',')}}`);

  let app = source;
  for (const range of remove.sort((a, b) => b.start - a.start)) app = app.slice(0, range.start) + app.slice(range.end);
  const imports = `import { STRINGS, I18N_MUSIC, STEP_LABELS, LOCALE_TAGS } from '../locales/index.js';
import { LESSONS, LEARN_UNITS, LQZ, LSUM, GLOSS } from '../locales/content.js';
`;
  const strictEnd = app.indexOf('"use strict";') + '"use strict";'.length;
  app = app.slice(0, strictEnd) + '\n' + imports + textOf(source, tNode) + app.slice(strictEnd);

  await mkdir(LOCALE_DIR, { recursive: true });
  await writeFile(join(LOCALE_DIR, 'index.js'), [
    moduleSource('STRINGS', locale.STRINGS),
    moduleSource('I18N_MUSIC', locale.I18N_MUSIC),
    moduleSource('STEP_LABELS', locale.STEP_LABELS),
    moduleSource('LOCALE_TAGS', locale.LOCALE_TAGS),
  ].join('\n'));
  await writeFile(join(LOCALE_DIR, 'content.js'), CONTENT_NAMES.map(name => moduleSource(name, content[name])).join('\n'));
  await writeFile(APP, app);
  return { strings: locale.STRINGS, content };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const data = await extractLocaleModules();
  console.log(`Extracted ${Object.keys(data.strings).length} locales and ${Object.keys(data.content).length} content collections`);
}
