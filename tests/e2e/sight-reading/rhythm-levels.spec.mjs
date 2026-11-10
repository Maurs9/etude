import { test, expect } from '../../helpers/fixtures.mjs';

async function openRead(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  return page;
}

test.describe('Sight-reading rhythm levels', () => {
  test('maps the three rhythm levels to their profiles and draws ties without extra attacks', async ({ app }) => {
    const page = await openRead(app);
    for (const [levelId, profile] of [['sr10', 'P4.a'], ['sr11', 'P4.b'], ['sr12', 'P4.c']]) {
      const drawn = await page.evaluate(({ id }) => {
        const api = window.__etude;
        api.RD.L = api.RD_LV[id];
        api.rdSightStart('practice', 4);
        return { profile: api.SR.srtPiece.profileId, tag: api.RD_LV[id].tag };
      }, { id: levelId });
      expect(drawn.profile).toBe(profile);
      expect(drawn.tag).toBeTruthy();
      await expect.poll(() => page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(8);
      const counts = await page.evaluate(() => {
        const api = window.__etude;
        return {
          groups: document.querySelectorAll('#rd-staff .ss-n').length,
          notes: api.SR.notes.length,
          expected: api.srtBuildExpected(api.SR.srtPiece, { bpm: 60, hand: 'rh' }).length,
          ties: document.querySelectorAll('#rd-staff .ss-n .ss-tie').length,
          tiedHeads: document.querySelectorAll('#rd-staff .ss-n .ss-tied .ss-head').length,
          eighthRests: [...document.querySelectorAll('#rd-staff text.ss-clef')].filter((node) => node.textContent === '\u{1D13E}').length,
        };
      });
      // One drawn group and one step per attack: a tied note is held, not played again.
      expect(counts.groups).toBe(counts.notes);
      expect(counts.notes).toBe(counts.expected);
      expect(counts.ties).toBe(counts.tiedHeads);
      if (profile === 'P4.c') expect(counts.ties).toBeGreaterThan(0);
      else expect(counts.ties).toBe(0);
    }
  });

  test('opens the first rhythm level after the rests level, not after the polyphonic levels', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    const unlock = await page.evaluate(() => {
      const api = window.__etude;
      const before = { prev: api.rdLvPrev(api.RD_LV.sr10).id, sr10: api.rdUnlocked(api.RD_LV.sr10), sr11: api.rdUnlocked(api.RD_LV.sr11) };
      api.rdData().lv.sr4 = { s: 1, acc: 80, t: 0, n: 1, rush: 0 };
      return { ...before, after: api.rdUnlocked(api.RD_LV.sr10), sr11prev: api.rdLvPrev(api.RD_LV.sr11).id };
    });
    expect(unlock).toEqual({ prev: 'sr4', sr10: false, sr11: false, after: true, sr11prev: 'sr10' });
  });

  test('names the rhythm a level teaches in its description', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    const detail = await page.evaluate(() => window.__etude.rdLvDetail(window.__etude.RD_LV.sr12));
    expect(detail).toContain('syncopation and ties');
  });
});
