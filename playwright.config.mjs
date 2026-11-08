import { defineConfig } from '@playwright/test';

const PORT = 8787;
const DEV_SERVER = !!process.env.ETUDE_DEV_SERVER;

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  fullyParallel: true,
  // One retry in CI so a slow runner doesn't block a merge; a test that needed it is still reported as flaky.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : (process.platform === 'win32' ? 4 : undefined),
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/${DEV_SERVER ? '' : 'etude/'}`,
    // The system Chrome avoids a browser download; set PW_CHANNEL= (empty) to use Playwright's bundled Chromium instead.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: process.env.CI ? 'on-first-retry' : 'off',
  },
  projects: [
    // Most tests run with service workers blocked: registration resolves without installing one (the app then stays
    // "pending"), so no test caches the page in the background or is served a stale copy by a worker.
    { name: 'app', use: { serviceWorkers: 'block' }, grepInvert: /@sw/ },
    // Tests tagged @sw need the real worker from sw.js (offline reloads, updates).
    { name: 'sw', use: { serviceWorkers: 'allow' }, grep: /@sw/ },
  ],
  webServer: {
    command: DEV_SERVER ? `vite --host 127.0.0.1 --port ${PORT}` : `npm run build:standalone && node scripts/serve.mjs dist ${PORT}`,
    url: `http://127.0.0.1:${PORT}/${DEV_SERVER ? 'etude.html' : 'etude/etude.html'}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
