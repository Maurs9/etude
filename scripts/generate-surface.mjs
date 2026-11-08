import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { topLevelBindings } from './generate-bridge.mjs';

const file = resolve(process.argv[2] || 'src/domain/views.ts');
const source = await readFile(file, 'utf8');
const marker = '\n/* @generated etude test surface */\n';
const clean = source.split(marker)[0].replace(/\n$/, '');
const { writable, readonly } = topLevelBindings(clean);
const lines = [
  marker.trim(),
  'const __etude = {};',
];
for (const name of writable)
  lines.push(`Object.defineProperty(__etude, ${JSON.stringify(name)}, { configurable: true, get: () => ${name}, set: value => { ${name} = value; } });`);
for (const name of readonly)
  lines.push(`Object.defineProperty(__etude, ${JSON.stringify(name)}, { configurable: true, get: () => ${name} });`);
lines.push('window.__etude = __etude;');
lines.push('__etude.loadOsmd = loadOsmd;');
lines.push(`if (new URL(location.href).searchParams.has('__etude_test_surface')) {
  for (const name of Object.getOwnPropertyNames(__etude)) {
    if (name in window) continue;
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => __etude[name],
      set: value => { __etude[name] = value; },
    });
  }
}`);
lines.push(`export { ${[...writable, ...readonly].join(', ')} };`);
await writeFile(file, `${clean}\n${lines.join('\n')}\n`);
