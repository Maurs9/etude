import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { diffEngravingRules, inspectOsmdBundle } from '../../scripts/update-osmd.mjs';
import { computeFitWidthLayout, defaultScoreLayoutForViewport, notationReloadMessage, patchOsmdPedals } from '../../src/domain/notation.ts';

describe('OSMD notation adapter', () => {
  it('patches pedal drawing once and groups each pedal mark while preserving staffLine identity', () => {
    const drawn = [];
    const groups = [];
    const drawer = {
      backend: {
        getContext: () => ({
          openGroup: name => { const group = { name }; groups.push(group); return group; },
          closeGroup: vi.fn(),
        }),
      },
      drawPedals: line => drawn.push({ sameLine: line, Pedals: [...(line.Pedals ?? [])] }),
    };
    const osmd = { VexFlowMusicSheetDrawer: { prototype: drawer } };
    patchOsmdPedals(osmd);
    const staffLine = { Pedals: ['press', 'release'], Measures: { last: () => 'last-measure' } };
    drawer.drawPedals(staffLine);
    patchOsmdPedals(osmd);
    expect(drawn).toEqual([
      { sameLine: staffLine, Pedals: ['press'] },
      { sameLine: staffLine, Pedals: ['release'] },
    ]);
    expect(staffLine.Pedals).toEqual(['press', 'release']);
    expect(groups.map(group => group.name)).toEqual(['sc-pedal', 'sc-pedal']);
    expect(drawer.scPedalGroups).toBe(true);
  });

  it('re-runs system placement with zero top-border offset when an orphan page precedes a forced XML page break', () => {
    const calls = [];
    const builderProto = {
      pageTopBorder: () => -7.5,
      calculateMusicSystemsRelativePositions() {
        const offset = this.pageTopBorder({});
        calls.push(offset);
        if (offset < 0) {
          this.graphicalMusicSheet.MusicPages.push(
            { MusicSystems: [{ breaksPage: false }] },
            {
              MusicSystems: [{
                breaksPage: true,
                GraphicalMeasures: [[{ parentSourceMeasure: { printNewPageXml: false } }]],
              }],
            },
          );
        } else {
          this.graphicalMusicSheet.MusicPages.push({
            MusicSystems: [{ breaksPage: false }, { breaksPage: true }],
          });
        }
      },
    };
    const osmd = {
      VexFlowMusicSheetDrawer: { prototype: { drawPedals: () => {} } },
      MusicSystemBuilder: { prototype: builderProto },
    };
    patchOsmdPedals(osmd);
    const instance = Object.assign(Object.create(builderProto), {
      rules: { NewPageAtXMLNewPageAttribute: true },
      graphicalMusicSheet: { MusicPages: [] },
    });
    instance.calculateMusicSystemsRelativePositions();
    expect(calls).toEqual([-7.5, 0]);
    expect(instance.graphicalMusicSheet.MusicPages).toHaveLength(1);
  });

  it('fails loudly if a future OSMD version removes or renames drawPedals', () => {
    expect(() => patchOsmdPedals({})).toThrow(/VexFlowMusicSheetDrawer\.prototype\.drawPedals is missing/);
    expect(() => patchOsmdPedals({ VexFlowMusicSheetDrawer: { prototype: {} } })).toThrow(/VexFlowMusicSheetDrawer\.prototype\.drawPedals is missing/);
  });

  it('verifies the vendored OSMD bundle contract and EngravingRules diffing', async () => {
    const vendorDir = new URL('../../public/vendor/', import.meta.url);
    const files = (await readdir(vendorDir)).filter(name => /^osmd-.*\.min\.js$/.test(name));
    expect(files).toHaveLength(1);
    const expectedVersion = files[0].replace(/^osmd-/, '').replace(/\.min\.js$/, '');
    const code = await readFile(new URL(files[0], vendorDir), 'utf8');
    const info = inspectOsmdBundle(code);
    expect(info.version).toBe(expectedVersion);
    expect(info.hasOpenSheetMusicDisplay).toBe(true);
    expect(info.hasMXLtoXMLstring).toBe(true);
    expect(info.hasDrawPedals).toBe(true);
    expect(Object.keys(info.rules).length).toBeGreaterThan(50);

    const diff = diffEngravingRules({ A: 1, B: true }, { A: 2, C: false });
    expect(diff).toEqual({
      added: [{ key: 'C', value: false }],
      removed: [{ key: 'B', value: true }],
      changed: [{ key: 'A', from: 1, to: 2 }],
    });
  });

  it('provides localized recovery copy across all 7 languages when a lazy score load fails', () => {
    expect(notationReloadMessage('en')).toEqual({ message: 'The score could not load. Reload the page.', button: 'Reload' });
    expect(notationReloadMessage('ro')).toEqual({ message: 'Partitura nu s-a putut încărca. Reîncarcă pagina.', button: 'Reîncarcă' });
    for (const lang of ['de', 'es', 'fr', 'it', 'pt-BR']) {
      const copy = notationReloadMessage(lang);
      expect(copy.message.trim().length, `${lang} message`).toBeGreaterThan(10);
      expect(copy.button.trim().length, `${lang} button`).toBeGreaterThan(2);
      expect(copy.message, `${lang} differs from English fallback`).not.toBe(notationReloadMessage('en').message);
    }
  });

  it('picks fit-width layout by default on mobile widths and page layout on desktop widths', () => {
    expect(defaultScoreLayoutForViewport(360)).toBe('fit');
    expect(defaultScoreLayoutForViewport(390)).toBe('fit');
    expect(defaultScoreLayoutForViewport(680)).toBe('fit');
    expect(defaultScoreLayoutForViewport(681)).toBe('page');
    expect(defaultScoreLayoutForViewport(1280)).toBe('page');
  });

  it('computes mobile fit-width parameters with larger staff zoom than scaled A4', () => {
    const mobile = computeFitWidthLayout(374, 1, 0.75);
    expect(mobile.pageFormat).toBe('Endless');
    expect(mobile.renderSingleHorizontalStaffline).toBe(false);
    expect(mobile.sheetWidth).toBe(374);
    expect(mobile.zoom).toBeGreaterThan((374 / 794) * 0.75);
    expect(mobile.zoom).toBeLessThanOrEqual(1.6);

    const lowerClamped = computeFitWidthLayout(200, 0.5, 0.75);
    expect(lowerClamped.sheetWidth).toBe(260);
    expect(lowerClamped.zoom).toBeGreaterThanOrEqual(0.55);

    const upperClamped = computeFitWidthLayout(900, 2, 1.0);
    expect(upperClamped.zoom).toBe(1.6);
  });
});
