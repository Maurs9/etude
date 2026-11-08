import { describe, expect, it, vi } from 'vitest';
import { patchOsmdPedals } from '../src/domain/notation.ts';

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
});
