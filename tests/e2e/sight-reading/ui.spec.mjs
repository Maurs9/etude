import { test, expect } from '../../helpers/fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

test.describe('Sight-Reading semantics and accessibility', () => {
  test('maps lateOrEarly to the missed symbol and exposes a text title', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await page.locator('#rd-srt-start').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    const result = await page.evaluate(() => {
      const api = window.__etude;
      api.SR.active = true;
      api.SR.srtState = { name: 'playing', mode: 'practice', attemptId: null, fingerprint: api.SR.srtFingerprint };
      api.srtSetState({ type: 'countInDone' });
      const expected = api.srtBuildExpected(api.SR.srtPiece, { bpm: 60, hand: 'rh' });
      expected.forEach((note, index) => api.srtRecorder.record('on', note.midi, 'typing:a', null, note.onMs + (index === expected.length - 1 ? 220 : 0)));
      api.srAssessFinish();
      const late = [...document.querySelectorAll('.ss-n')].at(-1);
      return {
        state: api.SR.srtState.name,
        symbol: late?.querySelector('.ss-result-symbol')?.textContent,
        title: late?.querySelector('title')?.textContent,
      };
    });
    expect(result.state).toBe('completed');
    expect(result.symbol).toBe('✗');
    expect(result.title).toContain('Missed');
  });

  test('keeps result symbols above 4.5:1 in light and dark themes', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const ratios = await page.evaluate(() => {
      const api = window.__etude;
      const result = {};
      for (const [theme, background] of [['light', '#fffdf8'], ['dark', '#211d19']]) {
        api.theme = theme;
        api.applyTheme();
        api.SR.results = {};
        api.SR.notes.slice(0, 3).forEach((note, index) => { api.SR.results[note.nid] = ['good', 'near', 'bad'][index]; });
        api.srPaintAll();
        result[theme] = [...document.querySelectorAll('.ss-result-symbol')].slice(0, 3).map((node) => {
          const fill = getComputedStyle(node).fill;
          const channels = fill.match(/\d+/g).slice(0, 3).map(Number);
          const channel = value => {
            const n = value / 255;
            return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          };
          const lum = 0.2126 * channel(channels[0]) + 0.7152 * channel(channels[1]) + 0.0722 * channel(channels[2]);
          const bg = background.slice(1).match(/../g).map((value) => parseInt(value, 16));
          const bgLum = 0.2126 * channel(bg[0]) + 0.7152 * channel(bg[1]) + 0.0722 * channel(bg[2]);
          return (Math.max(lum, bgLum) + 0.05) / (Math.min(lum, bgLum) + 0.05);
        });
      }
      return result;
    });
    expect(ratios.light.every(value => value >= 4.5)).toBe(true);
    expect(ratios.dark.every(value => value >= 4.5)).toBe(true);
  });

  test('survives all interface languages, themes, reduced motion, and the responsive viewport matrix', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const languages = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
    for (const language of languages) {
      await page.evaluate(value => window.__etude.setLang(value), language);
      expect(await page.locator('html')).toHaveAttribute('lang', language);
      expect(await page.locator('#rd-staff').count()).toBe(1);
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => {
        window.__etude.theme = value;
        window.__etude.applyTheme();
      }, theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => window.__etude.reduceMotion())).toBe(true);
    for (const viewport of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
      { width: 640, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(1);
    }
  });
});
