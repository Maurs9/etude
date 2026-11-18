import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/update-deps.mjs', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const installed = Object.fromEntries(Object.keys(manifest.devDependencies).map(name => [
  name,
  JSON.parse(readFileSync(new URL(`../../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version,
]));
const exec = promisify(execFile);

describe('dependency checks', () => {
  let cache, registry, lookup;

  beforeEach(async () => {
    cache = await mkdtemp(join(tmpdir(), 'etude-deps-check-'));
    registry = createServer((req, res) => {
      const name = decodeURIComponent(req.url.slice(1));
      const result = lookup(name);
      res.writeHead(result ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result ?? { error: 'registry unavailable' }));
    });
    await new Promise(resolve => registry.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    await new Promise((resolve, reject) => registry.close(error => error ? reject(error) : resolve()));
    await rm(cache, { recursive: true, force: true });
  });

  async function run(...args) {
    const env = {
      ...process.env,
      npm_config_cache: cache,
      npm_config_registry: `http://127.0.0.1:${registry.address().port}`,
      npm_config_fetch_retries: '0',
      npm_config_fetch_timeout: '3000',
      npm_config_offline: 'false',
      npm_config_update_notifier: 'false',
    };
    try {
      return { ...await exec(process.execPath, [script, ...args], { env }), status: 0 };
    } catch (error) {
      return { stdout: error.stdout, stderr: error.stderr, status: error.code };
    }
  }

  function packument(name, current, latest = current) {
    return {
      name, 'dist-tags': { latest },
      versions: { [current]: { name, version: current }, [latest]: { name, version: latest } },
    };
  }

  test('reports unknown versions and fails the check when npm returns a registry error', async () => {
    lookup = () => null;
    const result = await run('--check');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Dependency check incomplete');
    expect(result.stdout.match(/'UNKNOWN'/g)).toHaveLength(Object.keys(installed).length);
    expect(result.stdout).not.toContain('UP TO DATE');
  });

  test('stops the updater when metadata cannot be checked', async () => {
    lookup = () => null;
    const result = await run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Dependency check incomplete');
    expect(result.stdout).not.toContain('SKIPPED (already up to date)');
  });

  test('reports packages up to date after a successful empty report', async () => {
    lookup = name => packument(name, installed[name] ?? '1.0.0');
    const result = await run('--check');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.match(/'UP TO DATE'/g)).toHaveLength(Object.keys(installed).length);
  });

  test('accepts npm exit code 1 when it contains real updates', async () => {
    const latest = `${Number(installed.acorn.split('.')[0]) + 1}.0.0`;
    lookup = name => {
      const current = installed[name] ?? '1.0.0';
      return packument(name, current, name === 'acorn' ? latest : current);
    };
    const result = await run('--check');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/acorn.*UPDATE AVAILABLE/);
    expect(result.stdout).not.toContain('UNKNOWN');
  });
});
