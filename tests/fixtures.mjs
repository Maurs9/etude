import { test as base, expect } from '@playwright/test';

// APP_FILE lets the suite run against another copy of the app (e.g. an older revision, to confirm a test catches a bug).
export const APP = process.env.APP_FILE || 'etude.html';

// Opens the app with an optional saved state (the `ptt-v3` localStorage record) and records uncaught page errors.
// The keyboard dock starts hidden on a first visit; pass `dock: true` (or false) to seed the saved choice (`kbDock`).
export const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const open = async ({ saved, hash = '', lang = 'en', dock } = {}) => {
      const state = { ...(saved || { v: 3, lang, data: {} }), ...(dock === undefined ? {} : { kbDock: dock }) };
      await page.addInitScript(s => {
        if (sessionStorage.getItem('__seeded')) return;   // seed once; later reloads keep what the app saved
        sessionStorage.setItem('__seeded', '1');
        localStorage.clear();
        localStorage.setItem('ptt-v3', JSON.stringify(s));
      }, state);
      await page.goto(APP + (hash ? '#' + hash : ''));
      await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));
      return page;
    };
    await use({ open, errors, page });
    expect(errors.map(e => e.message), 'uncaught page errors').toEqual([]);
  },
});

// Day number used by the app (local calendar date, counted in UTC days).
export const todayN = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };

export { expect };
