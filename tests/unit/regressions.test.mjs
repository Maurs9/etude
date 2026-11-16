import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { srBeatPt } from '../../src/domain/grand-staff.ts';
import { anParse } from '../../src/domain/score-import.ts';
import { AN_MAX_NOTES } from '../../src/domain/score-types.ts';
import { workerSource } from '../../scripts/generate-sw.mjs';

function buildUnclosedNoteOnMidi(count) {
  const bytes = [];
  // MThd header: format 0, 1 track, 480 ppq
  bytes.push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0);
  // MTrk header
  const track = [];
  for (let i = 0; i < count; i++) {
    track.push(0x00, 0x90, 60 + (i % 12), 0x40);
  }
  // End of track
  track.push(0x00, 0xff, 0x2f, 0x00);
  bytes.push(0x4d, 0x54, 0x72, 0x6b);
  const len = track.length;
  bytes.push((len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
  bytes.push(...track);
  return new Uint8Array(bytes).buffer;
}

describe('performance and bug regressions', () => {
  it('srBeatPt interpolates cleanly across anchors and system breaks with binary search', () => {
    expect(srBeatPt([], 2)).toEqual({ b: 2, x: 10, sy: 0 });
    expect(srBeatPt([{ b: 1, x: 50, sy: 0 }], 5)).toEqual({ b: 1, x: 50, sy: 0 });

    const pts = [
      { b: 0, x: 40, sy: 0 },
      { b: 2, x: 140, sy: 0 },
      { b: 4, x: 240, sy: 0 },
      { b: 4, x: 40, sy: 1 },
      { b: 6, x: 140, sy: 1 },
      { b: 8, x: 240, sy: 1 },
    ];
    expect(srBeatPt(pts, -1)).toEqual(pts[0]);
    expect(srBeatPt(pts, 1)).toEqual({ b: 1, x: 90, sy: 0 });
    expect(srBeatPt(pts, 3)).toEqual({ b: 3, x: 190, sy: 0 });
    // Exact system break beat lands at the start of the next system
    expect(srBeatPt(pts, 4)).toEqual({ b: 4, x: 40, sy: 1 });
    expect(srBeatPt(pts, 7)).toEqual({ b: 7, x: 190, sy: 1 });
    expect(srBeatPt(pts, 12)).toEqual(pts[pts.length - 1]);
  });

  it('rejects unclosed MIDI note-on floods at AN_MAX_NOTES before closing at track end', () => {
    const atLimit = buildUnclosedNoteOnMidi(AN_MAX_NOTES);
    // Tick is 0 for all notes, so no closed notes with tick > start would exist; delta tick 1 on final note
    const ok = anParse((() => {
      const buf = new Uint8Array(atLimit);
      // Set delta time = 1 on the End-of-Track meta event (last 4 bytes are delta=0, 0xff, 0x2f, 0x00)
      buf[buf.length - 4] = 0x01;
      return buf.buffer;
    })());
    expect(ok.notes).toHaveLength(AN_MAX_NOTES);

    const overLimit = buildUnclosedNoteOnMidi(AN_MAX_NOTES + 1);
    expect(() => anParse(overLimit)).toThrow();
    try {
      anParse(overLimit);
    } catch (error) {
      expect(error.code).toBe('notes');
    }
  });

  it('service worker serves legacy older-cache asset hits immediately when verify=false', async () => {
    const source = workerSource([{ url: 'etude.html', hash: 'a'.repeat(64) }]);
    const listeners = {};
    const legacyUrl = 'https://maurs9.github.io/etude/assets/legacy.js';
    const legacyResponse = {
      ok: true,
      clone() { return this; },
      arrayBuffer: async () => { throw new Error('must not hash when verify=false'); },
    };
    const cachesMap = new Map([
      ['etude-legacy-v0', { match: async (url) => (url === legacyUrl ? legacyResponse : null) }],
    ]);
    const selfStub = {
      registration: { scope: 'https://maurs9.github.io/etude/' },
      addEventListener: (name, fn) => { listeners[name] = fn; },
    };
    const sandbox = {
      self: selfStub,
      URL,
      Request: class RequestStub { constructor(url) { this.url = url; this.method = 'GET'; this.mode = 'cors'; } },
      Response: { error: () => ({ ok: false, status: 0 }) },
      caches: {
        open: async (name) => cachesMap.get(name) ?? { match: async () => null },
        keys: async () => [...cachesMap.keys()],
      },
      fetch: async () => { throw new Error('network should not be called on legacy cache hit'); },
      crypto: { subtle: { digest: async () => { throw new Error('digest should not run when verify=false'); } } },
    };
    vm.runInNewContext(source, sandbox);

    let responded = null;
    listeners.fetch({
      request: { url: legacyUrl, method: 'GET', mode: 'cors' },
      respondWith: (promise) => { responded = promise; },
    });
    expect(responded).toBeTruthy();
    expect(await responded).toBe(legacyResponse);
  });

  it('keeps PWA manifest, monochrome icon asset, and TWA manifest in sync', () => {
    const webManifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
    const twaManifest = JSON.parse(readFileSync(new URL('../../android-twa/twa-manifest.json', import.meta.url), 'utf8'));
    const monoIconSvg = readFileSync(new URL('../../public/icons/icon-monochrome.svg', import.meta.url), 'utf8');

    expect(monoIconSvg).toContain('viewBox="0 0 512 512"');
    expect(monoIconSvg).toContain('#000');

    const monoEntry = webManifest.icons.find((icon) => icon.purpose === 'monochrome');
    expect(monoEntry).toEqual({
      src: 'icons/icon-monochrome.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'monochrome',
    });

    expect(twaManifest.packageId).toBe('io.github.maurs9.etude');
    expect(twaManifest.monochromeIconUrl).toBe('https://maurs9.github.io/etude/icons/icon-monochrome.svg');
    expect(twaManifest.orientation).toBe('any');
    expect(webManifest.orientation).toBe('any');

    expect(twaManifest.shortcuts).toHaveLength(webManifest.shortcuts.length);
    for (let i = 0; i < webManifest.shortcuts.length; i++) {
      expect(twaManifest.shortcuts[i].name).toBe(webManifest.shortcuts[i].name);
      expect(twaManifest.shortcuts[i].shortName).toBe(webManifest.shortcuts[i].short_name);
      expect(twaManifest.shortcuts[i].url).toBe(webManifest.shortcuts[i].url.replace(/^\./, '/etude'));
    }
  });
});
