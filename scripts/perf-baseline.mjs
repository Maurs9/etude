/* global window, document, caches, MutationObserver */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { chromium, devices } from '@playwright/test';
import { build, OUT_DIR, ROOT } from './build.mjs';
import { serve } from './serve.mjs';

export function startupCpu(before, after) {
  const reset = before.NavigationStart !== after.NavigationStart;
  for (const name of ['NavigationStart', 'TaskDuration', 'ScriptDuration']) {
    if (!Number.isFinite(before[name]) || !Number.isFinite(after[name])) throw new Error(`CDP metric unavailable: ${name}`);
  }
  const taskMs = (after.TaskDuration - (reset ? 0 : before.TaskDuration)) * 1000;
  const scriptMs = (after.ScriptDuration - (reset ? 0 : before.ScriptDuration)) * 1000;
  if (taskMs < 0 || scriptMs < 0) throw new Error('Unexpected negative CDP duration.');
  return { taskMs, scriptMs, accounting: reset ? 'navigation-reset' : 'counter-delta' };
}

export function scriptTotals(resources) {
  const scripts = resources.filter(resource => /\.m?js$/.test(new URL(resource.name).pathname));
  return {
    jsResourceCount: scripts.length,
    jsTransferBytes: scripts.reduce((sum, resource) => sum + resource.transferSize, 0),
    jsEncodedBytes: scripts.reduce((sum, resource) => sum + resource.encodedBodySize, 0),
    jsDecodedBytes: scripts.reduce((sum, resource) => sum + resource.decodedBodySize, 0),
  };
}

export function parseArgs(args) {
  const options = { samples: 3, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') options.help = true;
    else if (args[i] === '--samples') {
      const value = args[++i];
      if (!/^\d+$/.test(value || '') || Number(value) < 3 || !Number.isSafeInteger(Number(value))) {
        throw new Error('--samples requires an integer of at least 3.');
      }
      options.samples = Number(value);
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  return options;
}

export function summarize(samples, metrics) {
  return Object.fromEntries(metrics.map(metric => {
    const values = samples.map(sample => sample[metric]);
    return [metric, { count: values.length, median: percentile(values, 0.5), p95: percentile(values, 0.95), min: Math.min(...values), max: Math.max(...values) }];
  }));
}

// Nearest rank: sorted[max(0, ceil(n * p) - 1)]; p is in [0, 1].
export function percentile(values, p) {
  if (!values.length || values.some(value => !Number.isFinite(value)) || !Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error('Percentile requires finite samples and p in [0, 1].');
  }
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
}

const PROFILES = [
  { name: 'desktop', context: { viewport: { width: 1440, height: 900 } }, cpuRate: 1,
    network: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } },
  { name: 'mobile-emulated', context: { ...devices['Pixel 5'] }, cpuRate: 4,
    network: { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 } },
];
const METRICS = ['readyMs', 'taskMs', 'scriptMs', 'longTaskCount', 'longTaskTotalMs', 'longTaskMaxMs',
  'domKeyResponseMs', 'jsTransferBytes', 'jsEncodedBytes', 'jsDecodedBytes'];
const LIMITS = [
  'Local uncompressed HTTP, not GitHub Pages/CDN/TLS transfer. ResourceTiming transferSize includes estimated response headers; encodedBodySize is the actual uncompressed response body here.',
  'gzip level 9 and Brotli quality 11 inventory sizes are offline estimates, not measured network transfer. Inventory includes lazy/unrequested scripts and service worker.',
  'Cold means fresh browser context (HTTP cache and storage); browser process, OS file cache and browser compilation caches are not guaranteed cold. Warm is same-page HTTP-cache reload, after an interaction; saved app state can differ.',
  'Controlled cold/warm runs block service workers. Offline check separately allows the unchanged full production precache, clears HTTP cache and disables network.',
  'Readiness is the first animation frame observing window.__etude.show and #keys .key; navigation-relative performance.now(), not paint or full application/lesson readiness.',
  'CDP TaskDuration/ScriptDuration cover navigation through external ready collection (protocol overhead included), before the separate keyboard interaction. Counters reset when NavigationStart changes; otherwise a counter delta is used. Raw before/after metrics and accounting mode are retained. ScriptDuration is not a separate parse/compile measurement.',
  'Buffered long tasks with startTime <= readyMs are collected after a 100 ms delivery window; durations are not clipped at readiness. Unsupported observation fails the run.',
  'DOM key response is trusted Playwright Space keydown to observed .pressed mutation on a visible focused key. It excludes OS/input-device latency, actual paint, audio output, and physical piano-to-speaker latency.',
  'Mobile is Chromium device/CPU/network emulation on this host, not real phone hardware. Three samples give only a smoke baseline; nearest-rank p95 equals the maximum at n=3. No performance budget or locale-size percentage is asserted.',
];

// Runs in each document before application scripts; browser globals are intentional here.
/* eslint-disable no-undef */
function instrumentPage() {
  if (!sessionStorage.getItem('__perf_seeded')) {
    localStorage.clear();
    localStorage.setItem('ptt-v3', JSON.stringify({ v: 3, lang: 'en', data: {}, kbDock: true }));
    sessionStorage.setItem('__perf_seeded', '1');
  }
  window.__perf = { readyMs: null, longTasks: [], longTasksSupported: PerformanceObserver.supportedEntryTypes.includes('longtask') };
  if (window.__perf.longTasksSupported) {
    const observer = new PerformanceObserver(list => {
      window.__perf.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })));
    });
    observer.observe({ type: 'longtask', buffered: true });
  }
  const poll = () => {
    if (typeof window.__etude?.show === 'function' && document.querySelector('#keys .key')) window.__perf.readyMs = performance.now();
    else requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
/* eslint-enable no-undef */

async function scriptInventory(directory = OUT_DIR) {
  const inventory = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inventory.push(...await scriptInventory(path));
    else if (/\.m?js$/.test(entry.name)) {
      const bytes = await readFile(path);
      inventory.push({ path: relative(OUT_DIR, path).replaceAll('\\', '/'), bytes: bytes.length,
        gzipBytes: gzipSync(bytes, { level: 9 }).length,
        brotliBytes: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return inventory.sort((a, b) => a.path.localeCompare(b.path));
}

async function measure(page, cdp, navigate) {
  const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  const response = await navigate();
  if (!response?.ok()) throw new Error(`Navigation failed: ${response?.status()}`);
  await page.waitForFunction(() => Number.isFinite(window.__perf?.readyMs), null, { timeout: 90000 });
  const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
  // Allow the final startup task's PerformanceObserver entry to arrive before reading it.
  await page.waitForTimeout(100);
  const startup = await page.evaluate(() => ({
    readyMs: window.__perf.readyMs,
    longTasksSupported: window.__perf.longTasksSupported,
    longTasks: window.__perf.longTasks.filter(task => task.startTime <= window.__perf.readyMs),
    resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
    navigation: performance.getEntriesByType('navigation')[0].toJSON(),
    serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
  }));
  if (!startup.longTasksSupported) throw new Error('Long Tasks API unsupported; cannot produce a comparable baseline.');
  const cpu = startupCpu(before, after);
  const key = page.locator('#keys .key:visible').first();
  await key.focus();
  await page.evaluate(() => {
    const key = document.activeElement;
    window.__perf.keyStart = null;
    window.__perf.keyResponseMs = null;
    key.addEventListener('keydown', event => {
      if (event.code === 'Space') window.__perf.keyStart = performance.now();
    }, { capture: true, once: true });
    const observer = new MutationObserver(() => {
      if (key.classList.contains('pressed') && window.__perf.keyStart !== null) {
        window.__perf.keyResponseMs = performance.now() - window.__perf.keyStart;
        observer.disconnect();
      }
    });
    observer.observe(key, { attributes: true, attributeFilter: ['class'] });
  });
  await page.keyboard.down('Space');
  let domKeyResponseMs;
  try {
    await page.waitForFunction(() => Number.isFinite(window.__perf.keyResponseMs), null, { timeout: 10000 });
    domKeyResponseMs = await page.evaluate(() => window.__perf.keyResponseMs);
  } finally { await page.keyboard.up('Space'); }
  return { ...startup, ...scriptTotals(startup.resources),
    ...cpu, cdpMetrics: { before, after },
    longTaskCount: startup.longTasks.length,
    longTaskTotalMs: startup.longTasks.reduce((sum, task) => sum + task.duration, 0),
    longTaskMaxMs: Math.max(0, ...startup.longTasks.map(task => task.duration)), domKeyResponseMs };
}

async function offlineCheck(browser, url) {
  const context = await browser.newContext({ ...PROFILES[0].context, serviceWorkers: 'allow' });
  try {
    await context.addInitScript(instrumentPage);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Network.enable');
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 90000 });
    const cachesBefore = await page.evaluate(async () => {
      const names = await caches.keys();
      return Promise.all(names.map(async name => ({ name, entries: (await (await caches.open(name)).keys()).length })));
    });
    await cdp.send('Network.clearBrowserCache');
    await context.setOffline(true);
    const sample = await measure(page, cdp, () => page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }));
    if (!sample.serviceWorkerControlled || errors.length) throw new Error(`Offline startup invalid: ${JSON.stringify(errors)}`);
    return { status: 'passed', profile: 'desktop', network: 'offline', httpCacheCleared: true, cachesBefore,
      navigationFromServiceWorker: sample.navigation.workerStart > 0, sample, errors };
  } finally { await context.close(); }
}

function report(result, jsonName) {
  const rows = [];
  for (const profile of result.profiles) for (const mode of ['cold', 'warm']) {
    const stats = profile.aggregates[mode];
    rows.push(`| ${profile.name} | ${mode} | ${stats.readyMs.count} | ${stats.readyMs.median.toFixed(1)} / ${stats.readyMs.p95.toFixed(1)} | ${stats.taskMs.median.toFixed(1)} | ${stats.scriptMs.median.toFixed(1)} | ${stats.longTaskTotalMs.median.toFixed(1)} | ${stats.domKeyResponseMs.median.toFixed(2)} | ${stats.jsTransferBytes.median} / ${stats.jsDecodedBytes.median} |`);
  }
  return `# Étude production performance baseline\n\nCaptured: ${result.startedAt} (finished ${result.finishedAt}).\nCommit: \`${result.git.commit}\`; dirty: **${result.git.dirty}**. Exact status is stored in the JSON.\nBrowser: ${result.environment.browserVersion}; ${result.environment.platform} ${result.environment.release} ${result.environment.arch}; Node ${result.environment.node}.\nRaw samples, environment, profiles, hashes and complete aggregates: [${jsonName}](./${jsonName}).\n\n| Profile | HTTP mode | n | Ready median / p95 ms | Task median ms | Script median ms | Long tasks total median ms | DOM key median ms | JS transfer / decoded median bytes |\n|---|---|---:|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n## Separate service-worker-warmed offline check\n\nStatus: **${result.offline.status}**. ${result.offline.status === 'passed' ? `Desktop, HTTP cache cleared; controller present: ${result.offline.sample.serviceWorkerControlled}; navigation workerStart > 0: ${result.offline.navigationFromServiceWorker}; ready ${result.offline.sample.readyMs.toFixed(1)} ms. One functional sample, not pooled into HTTP results.` : result.offline.error}\n\n## Script inventory (all published JS, not just requested at startup)\n\n| Path | Raw bytes | gzip-9 estimate | Brotli-11 estimate |\n|---|---:|---:|---:|\n${result.inventory.map(file => `| ${file.path} | ${file.bytes} | ${file.gzipBytes} | ${file.brotliBytes} |`).join('\n')}\n\n## Definitions and limits\n\n${LIMITS.map(limit => `- ${limit}`).join('\n')}\n`;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { console.log('Usage: node scripts/perf-baseline.mjs [--samples N>=3]\nPW_CHANNEL empty/unset uses bundled Chromium. Results: docs/performance/baseline-<UTC timestamp>.{json,md}'); return; }
  const startedAt = new Date().toISOString();
  const git = command => execFileSync('git', command, { cwd: ROOT, encoding: 'utf8' }).trim();
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  const result = { schemaVersion: 1, startedAt, options,
    git: { commit: git(['rev-parse', 'HEAD']), dirty: Boolean(status), status },
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version,
      logicalCpuCount: os.cpus().length, cpuModel: os.cpus()[0]?.model, totalMemoryBytes: os.totalmem(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, channel: process.env.PW_CHANNEL || 'bundled-chromium' },
    definitions: LIMITS, profiles: [] };
  let browser;
  let server;
  try {
    await build();
    result.inventory = await scriptInventory();
    server = await serve(dirname(OUT_DIR), { port: 0, host: '127.0.0.1' });
    const url = `http://127.0.0.1:${server.address().port}/etude/etude.html#explore`;
    browser = await chromium.launch({ headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) });
    result.environment.browserVersion = browser.version();
    result.url = url;
    for (const profile of PROFILES) {
      const entry = { ...profile, serviceWorkers: 'block', samples: [] };
      for (let index = 0; index < options.samples; index++) {
        const context = await browser.newContext({ ...profile.context, serviceWorkers: 'block' });
        try {
          await context.addInitScript(instrumentPage);
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', error => errors.push(error.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          await cdp.send('Network.enable');
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate });
          await cdp.send('Network.emulateNetworkConditions', profile.network);
          const cold = await measure(page, cdp, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }));
          const warm = await measure(page, cdp, () => page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }));
          if (errors.length || cold.serviceWorkerControlled || warm.serviceWorkerControlled) throw new Error(`Invalid controlled sample: ${JSON.stringify(errors)}`);
          entry.samples.push({ index: index + 1, cold, warm, errors });
          console.log(`${profile.name} ${index + 1}/${options.samples}: ready cold=${cold.readyMs.toFixed(1)} ms warm=${warm.readyMs.toFixed(1)} ms`);
        } finally { await context.close(); }
      }
      entry.aggregates = Object.fromEntries(['cold', 'warm'].map(mode => [mode, summarize(entry.samples.map(sample => sample[mode]), METRICS)]));
      result.profiles.push(entry);
    }
    try { result.offline = await offlineCheck(browser, url); }
    catch (error) { result.offline = { status: 'failed', error: error.message }; }
    result.finishedAt = new Date().toISOString();
    const directory = join(ROOT, 'docs', 'performance');
    await mkdir(directory, { recursive: true });
    const stem = `baseline-${startedAt.replaceAll(':', '-').replaceAll('.', '-')}`;
    await writeFile(join(directory, `${stem}.json`), JSON.stringify(result, null, 2) + '\n');
    await writeFile(join(directory, `${stem}.md`), report(result, `${stem}.json`));
    console.log(`Results: docs/performance/${stem}.{json,md}`);
    if (result.offline.status !== 'passed') throw new Error(`HTTP benchmark saved, but offline check failed: ${result.offline.error}`);
    return result;
  } finally {
    try { if (browser) await browser.close(); }
    finally { if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  }
}

let invokedDirectly = false;
try { invokedDirectly = realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* Imported without a script argument. */ }
if (invokedDirectly) {
  try { await main(); }
  catch (error) { console.error(`Performance baseline failed: ${error.message}`); process.exitCode = 1; }
}
