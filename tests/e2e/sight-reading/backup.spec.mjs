import { readFile } from 'node:fs/promises';
import { test, expect } from '../../helpers/fixtures.mjs';

async function openRead(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

test.describe('Sight-Reading backup integration', () => {
  test('exports the optional sightLedger alongside the v3 backup', async ({ app }) => {
    const page = await openRead(app);
    await page.evaluate(() => {
      localStorage.setItem('etude-sight-v1', JSON.stringify(window.__etude.srtCreateLedger()));
    });
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#exportBtn')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const payload = JSON.parse(await readFile(path, 'utf8'));
    expect(payload.v).toBe(3);
    expect(payload.data.sightLedger.schemaVersion).toBe(1);
  });

  test('imports an old v3 backup without a sightLedger', async ({ app }) => {
    const page = await openRead(app);
    const raw = JSON.stringify({ v: 3, gen: 12, data: {} });
    expect(await page.evaluate((value) => window.__etude.isBackupPayload(JSON.parse(value)), raw)).toBe(true);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#importFile').setInputFiles({ name: 'old-v3.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
    await page.waitForFunction(() => typeof window.__etude?.show === 'function');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).v)).toBe(3);
  });

  test('unions backup data, abandons imported claims, preserves local claims, and rejects conflicts', async ({ app }) => {
    const page = await openRead(app);
    const result = await page.evaluate(async () => {
      const api = window.__etude;
      const makeAttempt = (attemptId, fingerprint, generation, stars) => ({
        attemptId, fingerprint, ownerTabId: 'tab', generation, status: 'completed', finishedAt: 10,
        scoringVersion: 1, N: 1, TP: 1, FP: 0, FN: 0, G: 1, Q: 0,
        lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: 1, pitchRecall: 1, pitchF1: 100,
        rhythmAcc: 100, score: 100, stars, perfect: stars === 3, meanOffsetMs: 0,
        meanAbsoluteOffsetMs: 0, noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }],
        extraInputs: [],
      });
      const local = api.srtCreateLedger();
      const imported = api.srtCreateLedger();
      const localAttempt = makeAttempt('local-attempt', 'v1:local', local.generation, 1);
      const importedAttempt = makeAttempt('imported-attempt', 'v1:imported', imported.generation, 2);
      const localLedger = {
        ...local,
        exposures: {
          'v1:local': {
            firstSeenAt: 1, reason: 'first-sight',
            claim: { attemptId: 'local-active', ownerTabId: 'tab-local', generation: local.generation },
          },
        },
        attempts: { [localAttempt.attemptId]: localAttempt },
      };
      const importedLedger = {
        ...imported,
        exposures: {
          'v1:imported': {
            firstSeenAt: 2, reason: 'first-sight',
            claim: { attemptId: importedAttempt.attemptId, ownerTabId: 'tab-imported', generation: imported.generation },
          },
        },
        attempts: { [importedAttempt.attemptId]: importedAttempt },
      };
      localStorage.setItem('etude-sight-v1', JSON.stringify(localLedger));
      const merged = await api.srtLedgerUpdate(localStorage, {
        type: 'importLedger', imported: importedLedger, generation: local.generation,
      });
      const after = api.srtReadLedger(localStorage);
      const conflict = await api.srtLedgerUpdate(localStorage, {
        type: 'importLedger',
        imported: { ...importedLedger, attempts: { [importedAttempt.attemptId]: { ...importedAttempt, stars: 0 } } },
        generation: after.generation,
      });
      return {
        merged: merged.ok,
        localClaimPreserved: !!after.exposures['v1:local'].claim,
        importedClaimCleared: !after.exposures['v1:imported'].claim,
        importedStatus: after.attempts['imported-attempt'].status,
        conflict,
      };
    });
    expect(result.merged).toBe(true);
    expect(result.localClaimPreserved).toBe(true);
    expect(result.importedClaimCleared).toBe(true);
    expect(result.importedStatus).toBe('abandoned');
    expect(result.conflict).toEqual({ ok: false, reason: 'conflict' });
  });

  test('rejects malformed record-shaped sight ledgers before import', async ({ app }) => {
    const page = await openRead(app);
    const result = await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      return [
        { ...ledger, prefs: [] },
        { ...ledger, sessions: [] },
        { ...ledger, exposures: [] },
        { ...ledger, attempts: [] },
      ].map((sightLedger) => window.__etude.isBackupPayload({ v: 3, data: { sightLedger } }));
    });
    expect(result).toEqual([false, false, false, false]);
  });
});
