import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../src/', import.meta.url);
const failures = [];

async function visit(url) {
  const entries = await readdir(url, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
    if (entry.isDirectory()) {
      await visit(child);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const source = await readFile(child, 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (/@ts-nocheck\b/.test(line)) {
        failures.push(`${child.pathname}:${index + 1}: file-wide @ts-nocheck is forbidden`);
      }
    });
  }
}

await visit(root);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('No TypeScript source uses file-wide @ts-nocheck.');
}
