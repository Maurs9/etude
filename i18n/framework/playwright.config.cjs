const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: 'runtime.spec.cjs',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  outputDir: require('node:path').join(__dirname, 'test-results'),
  use: {
    channel: process.env.PW_CHANNEL === '' ? undefined : (process.env.PW_CHANNEL || 'chrome'),
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
});
