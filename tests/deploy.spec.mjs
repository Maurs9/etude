import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { build, ROOT, SITE_FILES } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';

// The published site: what scripts/build.mjs puts in dist/etude/, served under /etude/ as on
// https://maurs9.github.io/etude/. Each worker builds its own copy into a temporary folder.
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashes(dir) {
  const out = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = join(entry.parentPath, entry.name);
    out[relative(dir, file).split(sep).join('/')] = sha256(await readFile(file));
  }
  return out;
}
const stop = server => new Promise(done => { server.closeAllConnections(); server.close(() => done()); });
const booted = page => page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

let tmp, server, base;
test.beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'etude-site-'));
  await build(join(tmp, 'etude'));
  server = await serve(tmp);
  base = `http://127.0.0.1:${server.address().port}/etude/`;
});
test.afterAll(async () => {
  if (server) await stop(server);
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

test('the build publishes exactly the files the app loads, byte for byte', async () => {
  const expected = { 'index.html': expect.any(String) };
  for (const file of SITE_FILES) expected[file] = sha256(await readFile(join(ROOT, file)));
  expect(await hashes(join(tmp, 'etude'))).toEqual(expected);
});

test('building twice gives the same site', async () => {
  const again = await mkdtemp(join(tmpdir(), 'etude-site-'));
  try {
    await build(join(again, 'etude'));
    expect(await hashes(join(again, 'etude'))).toEqual(await hashes(join(tmp, 'etude')));
  } finally {
    await rm(again, { recursive: true, force: true });
  }
});

// Only temporary folders here: if the guard broke, a test aimed at the repo would delete it.
test('the build refuses a folder that isn\'t empty, other than dist/etude/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'etude-guard-'));
  try {
    await writeFile(join(dir, 'keep.txt'), 'keep');
    await expect(build(dir)).rejects.toThrow(/Refusing to build/);
    expect(await readdir(dir)).toEqual(['keep.txt']);
    await rm(join(dir, 'keep.txt'));
    await build(dir);
    expect(await readdir(dir)).toContain('etude.html');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the manifest keeps its URLs, and everything it points to is published', async ({ request }) => {
  const manifestUrl = base + 'manifest.webmanifest';
  const res = await request.get(manifestUrl);
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  const at = url => new URL(url, manifestUrl).href;
  // Installed apps are tied to these: changing them would orphan every installation.
  expect([at(manifest.id), at(manifest.start_url), at(manifest.scope)]).toEqual([base + 'etude.html', base + 'etude.html', base]);
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const url of [at(manifest.start_url), ...manifest.icons.map(icon => at(icon.src))])
    expect((await request.get(url)).status(), url).toBe(200);
});

test('/etude/ opens the app, keeping the query and the hash', async ({ page }) => {
  const errors = [], failed = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('response', res => { if (res.url().startsWith(base) && res.status() >= 400) failed.push(`${res.status()} ${res.url()}`); });
  page.on('requestfailed', req => { if (req.url().startsWith(base)) failed.push(`failed ${req.url()}`); });
  await page.goto(base + '?from=test#explore');
  await expect(page).toHaveURL(base + 'etude.html?from=test#explore');
  await booted(page);
  await expect(page.locator('#view-explore')).toBeVisible();
  // Every same-origin file the page links to (the icon, and the manifest that a script adds over http) is published.
  const links = await page.evaluate(() => [...document.querySelectorAll('link[href]')].map(l => l.href).filter(h => h.startsWith(location.origin)));
  expect(links).toContain(base + 'manifest.webmanifest');
  for (const url of links) expect((await page.request.get(url)).status(), url).toBe(200);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('/etude/ still leads to the app', async ({ page }) => {
    await page.goto(base);
    await expect(page).toHaveURL(base + 'etude.html');
  });
});

// @sw: needs a live service worker, so it runs in the `sw` project. It stops its own server instead of only
// emulating offline, so the worker really can't reach the network.
test('the installed site opens offline under /etude/, with its manifest and icons', { tag: '@sw' }, async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  const own = await serve(tmp);
  try {
    const site = `http://127.0.0.1:${own.address().port}/etude/`;
    await page.goto(site + 'etude.html');
    await booted(page);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(site);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const urls = await page.evaluate(async () => {
      const links = [...document.querySelectorAll('link[href]')].map(l => l.href).filter(h => h.startsWith(location.origin));
      const manifestUrl = new URL('manifest.webmanifest', location.href).href;
      const manifest = await (await fetch(manifestUrl)).json();
      return [...new Set([...links, manifestUrl, ...manifest.icons.map(icon => new URL(icon.src, manifestUrl).href)])];
    });

    await stop(own);
    await context.setOffline(true);
    await page.reload();
    await booted(page);
    for (const url of urls) expect(await page.evaluate(u => fetch(u).then(r => r.status, () => 'failed'), url), url).toBe(200);
    await page.goto(site);   // the folder URL too: the worker answers it with the app
    await booted(page);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    if (own.listening) await stop(own);
  }
});
