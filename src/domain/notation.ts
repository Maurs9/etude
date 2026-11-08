type PedalLine = { Pedals?: readonly unknown[] };
type PedalContext = {
  openGroup?: (name: string) => { scPedalOwner?: { staffLine: PedalLine; pedal: unknown } } | null;
  closeGroup?: () => void;
};
type Drawer = {
  backend?: { getContext?: () => PedalContext | null };
  drawPedals?: (line: PedalLine) => void;
  scPedalGroups?: boolean;
};

export function patchOsmdPedals(osmd: unknown): void {
  const drawer = (osmd as { VexFlowMusicSheetDrawer?: { prototype?: Drawer } } | null)?.VexFlowMusicSheetDrawer?.prototype;
  if (!drawer || drawer.scPedalGroups || typeof drawer.drawPedals !== 'function') return;
  const draw = drawer.drawPedals;
  drawer.drawPedals = function drawPedals(line: PedalLine): void {
    const context = this.backend?.getContext?.();
    if (!context?.openGroup || !context.closeGroup || !line?.Pedals) {
      draw.call(this, line);
      return;
    }
    for (const pedal of line.Pedals) {
      const group = context.openGroup('sc-pedal');
      if (group) group.scPedalOwner = { staffLine: line, pedal };
      try { draw.call(this, { Pedals: [pedal] }); } finally { context.closeGroup(); }
    }
  };
  drawer.scPedalGroups = true;
}
