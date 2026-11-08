import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = process.env.TS_SOURCE_ROOT
  ? pathToFileURL(`${process.env.TS_SOURCE_ROOT.replace(/\/?$/, '/')}`)
  : new URL('../src/', import.meta.url);
const failures = [];
const MAX_EXPECTED_ERRORS = 8;
let expectedErrorCount = 0;
let explicitAnyCount = 0;

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
      if (/@ts-ignore\b/.test(line)) {
        failures.push(`${child.pathname}:${index + 1}: @ts-ignore is forbidden; type the boundary or use a narrow @ts-expect-error`);
      }
      if (/@ts-expect-error\b/.test(line)) {
        expectedErrorCount += 1;
        if (!/@ts-expect-error\s+--\s+\S/.test(line)) {
          failures.push(`${child.pathname}:${index + 1}: @ts-expect-error requires a reason`);
        }
      }
      if (/(?:\s*:\s*any\b|\bas\s+any\b|<any>|\bArray\s*<\s*any\s*>)/.test(line)) {
        explicitAnyCount += 1;
        failures.push(`${child.pathname}:${index + 1}: explicit any is forbidden; use a domain type or unknown with narrowing`);
      }
    });
  }
}

await visit(root);

if (expectedErrorCount > MAX_EXPECTED_ERRORS) {
  failures.push(`src: ${expectedErrorCount} @ts-expect-error directives exceed the limit of ${MAX_EXPECTED_ERRORS}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`TypeScript boundary checks passed (${explicitAnyCount} explicit any values).`);
}
