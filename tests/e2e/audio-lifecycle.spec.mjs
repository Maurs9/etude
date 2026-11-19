import { test, expect } from '../helpers/fixtures.mjs';

async function watchOscillators(page) {
  await page.evaluate(() => {
    const { start, stop } = OscillatorNode.prototype, nodes = new Map();
    OscillatorNode.prototype.start = function (when) {
      nodes.set(this, []);
      return start.call(this, when);
    };
    OscillatorNode.prototype.stop = function (when) {
      nodes.get(this)?.push(when);
      return stop.call(this, when);
    };
    window.__oscillatorStops = () => [...nodes.values()].map(times => times.length);
  });
}

test('initializes the audio graph with the saved volume, mute and room mix', async ({ app }) => {
  const page = await app.open({ saved: { v: 3, masterVol: 0.15, reverb: 0.45, data: {} } });
  const gains = () => page.evaluate(() => [window.__etude.master.gain.value, window.__etude.reverbGain.gain.value]);
  const [volume, reverb] = await gains();
  expect(volume).toBeCloseTo(0.15);
  expect(reverb).toBeCloseTo(0.45);
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('ptt-v3'));
    localStorage.setItem('ptt-v3', JSON.stringify({ ...saved, muted: true }));
  });
  await page.reload();
  await page.waitForFunction(() => !!window.__etude);
  expect((await gains())[0]).toBe(0);
});

test('calibration waits for audio to resume and cancels the clicks when hidden', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lat').click();
  await watchOscillators(page);
  await page.evaluate(async () => {
    const context = window.__etude.actx;
    await context.suspend();
    const resume = context.resume.bind(context);
    const gate = new Promise(resolve => { window.__resumeCalibrationAudio = () => resolve(resume()); });
    context.resume = () => gate;
  });
  const stopped = () => page.evaluate(() => window.__oscillatorStops());
  await page.locator('#lat-go').click();
  await expect(page.locator('#lat-go')).toHaveText('Stop');
  expect(await stopped()).toHaveLength(0);
  await page.evaluate(() => window.__resumeCalibrationAudio());
  await expect.poll(stopped).toEqual(Array(16).fill(1));

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  await expect(page.locator('#lat-go')).toHaveText('Start');
  await expect.poll(stopped).toEqual(Array(16).fill(2));
});

test('the piano drone sustains until it is stopped and clears its checkbox', async ({ app }) => {
  const page = await app.open({ hash: 'sing' });
  await watchOscillators(page);
  const stopped = () => page.evaluate(() => window.__oscillatorStops());
  await page.locator('#si-drone').check();
  expect(await stopped()).toEqual(Array(6).fill(0));
  await page.locator('#si-new').click();
  expect(await stopped()).toEqual(Array(6).fill(1));
  await expect(page.locator('#si-drone')).not.toBeChecked();
});

test('stopping a singing phrase cancels its queued count-in', async ({ app }) => {
  const page = await app.open({ hash: 'sing' });
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Test without a microphone', 'NotAllowedError'));
  });
  await page.locator('#si-mode [data-v="phrase"]').click();
  await page.locator('#si-bpm').press('Home');
  await watchOscillators(page);
  const stopped = () => page.evaluate(() => window.__oscillatorStops());
  await page.locator('#si-go').click();
  await expect.poll(stopped).toEqual(Array(4).fill(1));
  await page.locator('#si-go').click();
  await expect.poll(async () => (await stopped()).slice(1)).toEqual(Array(3).fill(2));
});
