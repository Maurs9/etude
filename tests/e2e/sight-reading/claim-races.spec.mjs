import { test, expect } from '../../helpers/fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

async function startSeed(page, seed) {
  await page.evaluate((value) => {
    const api = window.__etude;
    api.RD.L = api.RD_LV.sr1;
    api.rdSightStart('test', value);
  }, seed);
  await expect.poll(() => page.evaluate(() => ({
    name: window.__etude.SR.srtState.name,
    mode: window.__etude.SR.srtState.mode,
  }))).toEqual({ name: 'idle', mode: 'firstSight' });
}

async function lockSnapshot(page) {
  return page.evaluate(async () => {
    const locks = await navigator.locks.query();
    return {
      held: locks.held.filter((lock) => lock.name.startsWith('etude-sight-attempt-')),
      pending: locks.pending.filter((lock) => lock.name.startsWith('etude-sight-attempt-')),
    };
  });
}

test('does not reveal a stale in-flight claim and consumes Learn eligibility', async ({ app }) => {
  const claimPage = await openAssessGenerator(app);
  const holder = await claimPage.context().newPage();
  const resetter = await claimPage.context().newPage();
  try {
    await holder.goto(claimPage.url());
    await holder.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
    await resetter.goto(claimPage.url());
    await resetter.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');

    for (const seed of [18001, 18002, 18003, 18004]) {
      await claimPage.evaluate(() => localStorage.removeItem('etude-sight-v1'));
      await claimPage.reload();
      await claimPage.waitForFunction(() => typeof window.__etude?.show === 'function');
      await claimPage.locator('#rdt-pieces').click();
      await claimPage.locator('#rd-mode button[data-v="assess"]').click();
      await claimPage.locator('#rd-gen').click();
      await startSeed(claimPage, seed);
      const fingerprint = await claimPage.evaluate(() => window.__etude.SR.srtFingerprint);

      await holder.evaluate(() => {
        window.__releaseSightLedger = null;
        window.__ledgerHeld = new Promise((resolve) => {
          void navigator.locks.request('etude-sight-ledger-v1', { mode: 'exclusive' }, async () => {
            resolve();
            await new Promise((release) => { window.__releaseSightLedger = release; });
          });
        });
      });
      await holder.evaluate(() => window.__ledgerHeld);

      const resetQueued = resetter.evaluate(() => {
        const api = window.__etude;
        const ledger = api.srtReadLedger(localStorage);
        window.__resetLedgerPromise = api.srtLedgerUpdate(localStorage, { type: 'resetLedger' });
        return ledger.generation;
      });
      await resetQueued;

      await claimPage.locator('#rd-go').click();
      await expect.poll(() => claimPage.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
      await claimPage.locator('#rd-mode button[data-v="learn"]').click();
      await expect(claimPage.locator('#rd-staff')).toHaveAttribute('aria-hidden', 'true');

      await holder.evaluate(() => window.__releaseSightLedger?.());
      await resetter.evaluate(() => window.__resetLedgerPromise);
      await expect.poll(() => claimPage.evaluate((value) => {
        const api = window.__etude;
        const ledger = api.srtReadLedger(localStorage);
        const exposure = ledger.exposures[value];
        const visible = document.querySelector('#rd-staff')?.getAttribute('aria-hidden') === 'false';
        return {
          state: api.SR.srtState,
          visible,
          exposure: exposure?.reason ?? null,
          attempt: Object.values(ledger.attempts).find((item) => item.fingerprint === value)?.status ?? null,
        };
      }, fingerprint)).toMatchObject({
        state: { name: 'idle', mode: 'practice', fingerprint },
        visible: true,
        exposure: 'learn',
        attempt: null,
      });

      await expect.poll(() => lockSnapshot(claimPage)).toEqual({ held: [], pending: [] });

      await claimPage.reload();
      await claimPage.waitForFunction(() => typeof window.__etude?.show === 'function');
      await claimPage.locator('#rdt-pieces').click();
      await claimPage.locator('#rd-mode button[data-v="assess"]').click();
      await claimPage.evaluate((value) => {
        const api = window.__etude;
        api.RD.L = api.RD_LV.sr1;
        api.rdSightStart('test', value);
      }, seed);
      await claimPage.locator('#rd-go').click();
      await expect.poll(() => claimPage.evaluate(() => ({
        name: window.__etude.SR.srtState.name,
        mode: window.__etude.SR.srtState.mode,
      }))).toEqual({ name: 'countIn', mode: 'practice' });
      await expect(claimPage.locator('#rd-srt-preview')).toBeHidden();
      await claimPage.evaluate(() => window.__etude.panic());
      await expect.poll(() => lockSnapshot(claimPage)).toEqual({ held: [], pending: [] });
    }
  } finally {
    await holder.close();
    await resetter.close();
  }
});
