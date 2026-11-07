import { defineConfig } from '@playwright/test';

const PORT = 8787;

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : (process.platform === 'win32' ? 4 : undefined),
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // The system Chrome avoids a browser download; set PW_CHANNEL= (empty) to use Playwright's bundled Chromium instead.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: `${process.platform === 'win32' ? 'python' : 'python3'} -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/etude.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore',
  },
});
