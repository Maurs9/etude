import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { parse } from 'acorn';
import { build } from '../../scripts/build.mjs';

const owned = [];
afterEach(async () => {
  await Promise.all(owned.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

it('single-file mode includes dynamically imported modules without changing the web build', async () => {
  const scratch = process.platform === 'win32'
    ? join(homedir(), 'AppData', 'Local', 'hermes', 'cache', 'scratch') : (process.env.TMPDIR || tmpdir());
  await mkdir(scratch, { recursive: true });
  const root = await mkdtemp(join(scratch, 'etude-single-file-'));
  owned.push(root);
  const input = join(root, 'fixture.html');
  await writeFile(input, '<!doctype html><title>Standalone fixture</title><script type="module" src="./entry.js"></script>');
  await writeFile(join(root, 'entry.js'), 'window.fixture = () => import("./deferred.js").then(m => m.value);');
  await writeFile(join(root, 'deferred.js'), 'export const value = "deferred lesson payload";');
  const output = join(root, 'output');
  await build(output, { input, singleFile: true });
  const html = await readFile(join(output, 'fixture.html'), 'utf8').catch(() => '');
  expect(html).toContain('Standalone fixture');
  const scripts = (await readdir(join(output, 'assets'))).filter(file => file.endsWith('.js'));
  expect(scripts).toHaveLength(1);
  const source = await readFile(join(output, 'assets', scripts[0]), 'utf8');
  expect(source).toContain('deferred lesson payload');
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  expect(JSON.stringify(tree)).not.toContain('"type":"ImportExpression"');
  expect(JSON.stringify(tree)).not.toContain('"type":"ImportDeclaration"');

  const webOutput = join(root, 'web-output');
  await build(webOutput, { input });
  const webScripts = (await readdir(join(webOutput, 'assets'))).filter(file => file.endsWith('.js'));
  expect(webScripts).toHaveLength(2);
  const webSources = await Promise.all(webScripts.map(file => readFile(join(webOutput, 'assets', file), 'utf8')));
  expect(webSources.some(source => JSON.stringify(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }))
    .includes('"type":"ImportExpression"'))).toBe(true);
}, 30000);
