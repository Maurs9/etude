import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { workerSource } from '../scripts/generate-sw.mjs';
import { serve } from '../scripts/serve.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const stop = server => new Promise(done => {
  server.closeAllConnections();
  server.close(() => done());
});

async function site({ version = 'one', include = ['etude.html', 'assets/app-one.js'] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'etude-sw-'));
  const folder = join(root, 'etude');
  const file = (...parts) => join(folder, ...parts);
  await mkdir(file('assets'), { recursive: true });
  await writeFile(file('etude.html'), `<!doctype html><meta charset="utf-8"><script>
    if (!new URL(location.href).searchParams.has('sw-kill-switch')) {
      navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
    }
    window.__version = '${version}';
  </script><p id="version">${version}</p>`);
  await writeFile(file('assets/app-one.js'), `window.__asset='one';`);
  await writeFile(file('assets/app-two.js'), `window.__asset='two';`);
  const entries = [];
  for (const url of include) {
    const bytes = await readFile(file(url));
    entries.push({ url, hash: hash(bytes) });
  }
  await writeFile(file('sw.js'), workerSource(entries));
  return root;
}

async function openSite(page, root) {
  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}/etude/`;
  await page.goto(`${base}etude.html`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return { server, base };
}

test.describe('atomic worker migration', () => {
  test('fresh install reloads from its complete precache while offline', { tag: '@sw' }, async ({ page, context }) => {
    const root = await site();
    const { server } = await openSite(page, root);
    await stop(server);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#version')).toHaveText('one');
    await context.setOffline(false);
    await rm(root, { recursive: true, force: true });
  });

  test('upgrading from the pre-migration worker stays available online and offline', { tag: '@sw' }, async ({ page, context }) => {
    const root = await site({ version: 'old', include: ['etude.html', 'assets/app-one.js'] });
    await writeFile(join(root, 'etude/sw.js'), await readFile('tests/fixtures/sw-pre-migration.js', 'utf8'));
    const { server } = await openSite(page, root);
    await expect(page.locator('#version')).toHaveText('old');
    await writeFile(join(root, 'etude/etude.html'), '<!doctype html><p id="version">new</p><script>window.__version="new"</script>');
    await writeFile(join(root, 'etude/sw.js'), workerSource([
      { url: 'etude.html', hash: hash(await readFile(join(root, 'etude/etude.html'))) },
      { url: 'assets/app-two.js', hash: hash(await readFile(join(root, 'etude/assets/app-two.js'))) },
    ]));
    await page.evaluate(() => navigator.serviceWorker.ready.then(reg => reg.update()));
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.locator('#version')).toHaveText('new');
    await stop(server);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#version')).toHaveText('new');
    await context.setOffline(false);
    await rm(root, { recursive: true, force: true });
  });

  test('an interrupted upgrade leaves the old version and no mixed cache', { tag: '@sw' }, async ({ page, context }) => {
    const root = await site();
    const { server } = await openSite(page, root);
    await writeFile(join(root, 'etude/etude.html'), '<!doctype html><p id="version">two</p>');
    await writeFile(join(root, 'etude/sw.js'), workerSource([
      { url: 'etude.html', hash: hash(await readFile(join(root, 'etude/etude.html'))) },
      { url: 'assets/app-two.js', hash: '0'.repeat(64) },
    ]));
    await page.evaluate(() => navigator.serviceWorker.ready.then(reg => reg.update()));
    await page.waitForTimeout(300);
    const cachesAfterFailure = await page.evaluate(() => caches.keys());
    expect(cachesAfterFailure.filter(key => key.startsWith('etude-') && key !== 'etude-active').length).toBe(1);
    await stop(server);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#version')).toHaveText('one');
    await context.setOffline(false);
    await rm(root, { recursive: true, force: true });
  });

  test('an old tab can still fetch a hashed asset after activation', { tag: '@sw' }, async ({ page, context }) => {
    const root = await site();
    const { server } = await openSite(page, root);
    await expect(page.locator('#version')).toHaveText('one');
    await page.evaluate(() => fetch('assets/app-one.js'));
    await writeFile(join(root, 'etude/etude.html'), '<!doctype html><p id="version">two</p>');
    await writeFile(join(root, 'etude/sw.js'), workerSource([
      { url: 'etude.html', hash: hash(await readFile(join(root, 'etude/etude.html'))) },
      { url: 'assets/app-two.js', hash: hash(await readFile(join(root, 'etude/assets/app-two.js'))) },
    ]));
    await page.evaluate(() => navigator.serviceWorker.ready.then(reg => reg.update()));
    await page.waitForTimeout(300);
    await stop(server);
    await context.setOffline(true);
    expect(await page.evaluate(() => fetch('assets/app-one.js').then(response => response.text()))).toContain("__asset='one'");
    await context.setOffline(false);
    await rm(root, { recursive: true, force: true });
  });

  test('the kill switch reloads each controlled tab exactly once and removes state', { tag: '@sw' }, async ({ page, context }) => {
    const root = await site();
    const { server } = await openSite(page, root);
    await page.evaluate(() => caches.open('etude-test').then(cache => cache.put('/etude/marker', new Response('x'))));
    await writeFile(join(root, 'etude/sw.js'), await readFile('scripts/sw-kill-switch.js', 'utf8'));
    let reloads = 0;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && frame.url().includes('sw-kill-switch=done')) reloads++;
    });
    await page.evaluate(() => navigator.serviceWorker.ready.then(reg => reg.update()));
    await page.waitForFunction(() => new URL(location.href).searchParams.get('sw-kill-switch') === 'done');
    await page.waitForTimeout(300);
    expect(reloads).toBe(1);
    expect(await page.evaluate(() => caches.keys())).toEqual([]);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistration())).toBeFalsy();
    await context.setOffline(false);
    await stop(server);
    await rm(root, { recursive: true, force: true });
  });
});
