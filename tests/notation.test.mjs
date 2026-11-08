import { describe, expect, it, vi } from 'vitest';
import { notationReloadMessage, patchOsmdPedals } from '../src/domain/notation.ts';

describe('OSMD notation adapter', () => {
  it('patches pedal drawing once and groups each pedal mark', () => {
    const drawn = [];
    const groups = [];
    const drawer = {
      backend: {
        getContext: () => ({
          openGroup: name => { const group = { name }; groups.push(group); return group; },
          closeGroup: vi.fn(),
        }),
      },
      drawPedals: line => drawn.push(line),
    };
    const osmd = { VexFlowMusicSheetDrawer: { prototype: drawer } };
    patchOsmdPedals(osmd);
    drawer.drawPedals({ Pedals: ['press', 'release'] });
    patchOsmdPedals(osmd);
    expect(drawn).toEqual([{ Pedals: ['press'] }, { Pedals: ['release'] }]);
    expect(groups.map(group => group.name)).toEqual(['sc-pedal', 'sc-pedal']);
    expect(drawer.scPedalGroups).toBe(true);
  });

  it('provides bilingual recovery copy when a lazy score load fails', () => {
    expect(notationReloadMessage('en')).toEqual({ message: 'The score could not load. Reload the page.', button: 'Reload' });
    expect(notationReloadMessage('ro')).toEqual({ message: 'Partitura nu s-a putut încărca. Reîncarcă pagina.', button: 'Reîncarcă' });
  });
});
