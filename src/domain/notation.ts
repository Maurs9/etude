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
type PedalCalculator = {
  calculatePedalSkyBottomLine?: (pedal: unknown, line: PedalLine) => void;
  scLocalTextPedals?: boolean;
};
type SystemBuilder = {
  graphicalMusicSheet?: { MusicPages?: unknown[] };
  rules?: { NewPageAtXMLNewPageAttribute?: boolean };
  calculateMusicSystemsRelativePositions?: () => void;
  pageTopBorder?: (system: unknown) => number;
  scOrphanPageGuard?: boolean;
};

type VendorRules = Record<string, unknown> & {
  GNote?: (note: unknown) => VendorGraphicalNote | null;
};
type VendorGraphicalNote = {
  vfnote?: readonly [unknown, number];
  getNoteheadSVGs?: () => SVGElement[];
  getSVGGElement?: () => SVGElement | null;
};
type VendorRenderer = {
  EngravingRules: VendorRules;
  GraphicSheet: unknown;
  Sheet: unknown;
  cursor: VendorCursor;
  load(xml: string): Promise<void>;
  setOptions(options: Record<string, unknown>): void;
  setCustomPageFormat(width: number, height: number): void;
  render(): void;
  Zoom: number;
};
type VendorCursor = {
  reset(): void;
  Iterator: VendorIterator;
  CurrentVisibleVoiceEntries?(): readonly unknown[];
  getStaffEntryFromVoiceEntry?(entry: unknown): VendorStaffEntry | null;
};
type VendorIterator = {
  EndReached: boolean;
  CurrentSourceTimestamp: { RealValue: number };
  CurrentVoiceEntries?: readonly unknown[];
  moveToNext(): void;
};
type VendorStaffEntry = {
  PositionAndShape?: { AbsolutePosition?: { x?: number } };
  parentMeasure?: { ParentMusicSystem?: unknown };
};
type VendorNote = {
  isRest?: () => boolean;
  Pitch?: { Frequency?: number };
  ParentStaffEntry?: { ParentStaff?: { Id?: number; ParentInstrument?: unknown } };
  ParentVoiceEntry?: { ParentVoice?: { VoiceId?: number } };
};
type VendorVoiceEntry = { Notes?: readonly VendorNote[] };

export interface RenderedNote {
  midi: number;
  part: number;
  staff: number | undefined;
  voice: number | undefined;
  beat: number;
  element: SVGElement;
}

export interface LayoutReader {
  readonly graphicSheet: unknown;
  readonly sheet: unknown;
}

export type AppLanguage = 'en' | 'ro';

let osmdPromise: Promise<OsmdModule> | null = null;

export interface OsmdModule {
  OpenSheetMusicDisplay: new (container: Element, options: Record<string, unknown>) => VendorRenderer;
  MXLHelper: {
    MXLtoXMLstring(data: ArrayBuffer): string;
  };
}

export interface ScoreRenderer {
  updateRules(updates: Readonly<Record<string, unknown>>): void;
  readRules(): Readonly<Record<string, unknown>>;
  load(xml: string): Promise<void>;
  setOptions(options: Record<string, unknown>): void;
  setCustomPageFormat(width: number, height: number): void;
  getZoom(): number;
  setZoom(value: number): void;
  render(): void;
  readLayout(): LayoutReader;
  readCursor(): VendorCursor;
  getTitleNode(): SVGElement | null;
  hasExtraBreaks(): boolean;
  forEachRenderedNote(callback: (note: RenderedNote) => void): void;
}

class OsmdScoreRenderer implements ScoreRenderer {
  constructor(private readonly vendor: VendorRenderer) {
    // Preserve 1.9.9 SVG group structure (.vf-notehead, .vf-sc-pedal) and cross-staff slur handling (scoreXLines) across OSMD 2.x+.
    if ('SVGMergeSingleChildGroups' in this.vendor.EngravingRules) {
      this.vendor.EngravingRules.SVGMergeSingleChildGroups = false;
    }
    if ('RenderSlursAcrossStaves' in this.vendor.EngravingRules) {
      this.vendor.EngravingRules.RenderSlursAcrossStaves = false;
    }
  }

  updateRules(updates: Readonly<Record<string, unknown>>): void {
    Object.assign(this.vendor.EngravingRules, updates);
  }
  readRules(): Readonly<Record<string, unknown>> { return this.vendor.EngravingRules; }
  load(xml: string): Promise<void> { return this.vendor.load(xml); }
  setOptions(options: Record<string, unknown>): void { this.vendor.setOptions(options); }
  setCustomPageFormat(width: number, height: number): void { this.vendor.setCustomPageFormat(width, height); }
  getZoom(): number { return this.vendor.Zoom; }
  setZoom(value: number): void { this.vendor.Zoom = value; }
  render(): void { this.vendor.render(); }
  readLayout(): LayoutReader {
    return { graphicSheet: this.vendor.GraphicSheet, sheet: this.vendor.Sheet };
  }
  readCursor(): VendorCursor { return this.vendor.cursor; }
  getTitleNode(): SVGElement | null {
    const sheet = asRecord(this.vendor.GraphicSheet);
    const title = asRecord(sheet.title);
    return typeof SVGElement !== 'undefined' && title.SVGNode instanceof SVGElement ? title.SVGNode : null;
  }
  hasExtraBreaks(): boolean {
    const sheet = asRecord(this.vendor.GraphicSheet);
    return asArray(sheet.MusicPages).some((page, pageIndex) =>
      asArray(asRecord(page).MusicSystems).some((system, systemIndex) => {
        if (!pageIndex && !systemIndex) return false;
        const measures = asArray(asRecord(system).GraphicalMeasures);
        const first = measures[0];
        const measure = asArray(first).find(Boolean);
        const source = asRecord(asRecord(measure).parentSourceMeasure);
        return !!source && !source.printNewSystemXml && !source.printNewPageXml;
      }),
    );
  }
  forEachRenderedNote(callback: (note: RenderedNote) => void): void {
    const cursor = this.vendor.cursor;
    const sheet = asRecord(this.vendor.Sheet);
    const instruments = asArray(sheet.Instruments);
    cursor.reset();
    const iterator = cursor.Iterator;
    let guard = 0;
    while (!iterator.EndReached && guard++ < 40000) {
      const beat = iterator.CurrentSourceTimestamp.RealValue * 4;
      for (const entry of iterator.CurrentVoiceEntries ?? []) {
        for (const note of (asRecord(entry) as VendorVoiceEntry).Notes ?? []) {
          if (note.isRest?.() || !note.Pitch?.Frequency) continue;
          const staff = note.ParentStaffEntry?.ParentStaff;
          const voice = note.ParentVoiceEntry?.ParentVoice?.VoiceId;
          const part = staff?.ParentInstrument ? instruments.indexOf(staff.ParentInstrument) : -1;
          const graphical = this.vendor.EngravingRules.GNote?.(note);
          const vf = graphical?.vfnote;
          if (!graphical || !vf) continue;
          const heads = graphical.getNoteheadSVGs?.() ?? [];
          const element = heads[vf[1]] ?? graphical.getSVGGElement?.();
          if (!element) continue;
          callback({
            midi: Math.round(69 + 12 * Math.log2(note.Pitch.Frequency / 440)),
            part,
            staff: staff?.Id,
            voice,
            beat,
            element,
          });
        }
      }
      iterator.moveToNext();
    }
    cursor.reset();
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function isOsmdModule(value: unknown): value is OsmdModule {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { OpenSheetMusicDisplay?: unknown; MXLHelper?: unknown };
  return typeof candidate.OpenSheetMusicDisplay === 'function' &&
    !!candidate.MXLHelper &&
    typeof (candidate.MXLHelper as { MXLtoXMLstring?: unknown }).MXLtoXMLstring === 'function';
}

export function loadOsmd(): Promise<OsmdModule> {
  const existing = (globalThis as typeof globalThis & { opensheetmusicdisplay?: unknown }).opensheetmusicdisplay;
  if (isOsmdModule(existing)) return Promise.resolve(existing);
  if (typeof document === 'undefined') return Promise.reject(new Error('OSMD requires a document'));
  if (osmdPromise) return osmdPromise;
  osmdPromise = new Promise<OsmdModule>((resolve, reject) => {
    const script = document.createElement('script');
    const inline = document.querySelector<HTMLScriptElement>('#etude-osmd-source');
    if (inline?.textContent) {
      script.textContent = inline.textContent;
    } else {
      script.src = new URL('vendor/osmd-2.3.0.min.js', document.baseURI).href;
      script.async = true;
    }
    script.onload = () => {
      const loaded = (globalThis as typeof globalThis & { opensheetmusicdisplay?: unknown }).opensheetmusicdisplay;
      if (isOsmdModule(loaded)) resolve(loaded);
      else reject(new Error('OSMD loaded without an API'));
    };
    script.onerror = () => reject(new Error('OSMD could not be loaded'));
    document.head.append(script);
    if (inline?.textContent) {
      queueMicrotask(() => {
        const loaded = (globalThis as typeof globalThis & { opensheetmusicdisplay?: unknown }).opensheetmusicdisplay;
        if (isOsmdModule(loaded)) resolve(loaded);
        else reject(new Error('OSMD loaded without an API'));
      });
    }
  }).catch(error => {
    osmdPromise = null;
    throw error;
  });
  return osmdPromise;
}

export async function createScoreRenderer(
  container: Element,
  options: Record<string, unknown>,
): Promise<ScoreRenderer> {
  const osmd = await loadOsmd();
  patchOsmdPedals(osmd);
  return new OsmdScoreRenderer(new osmd.OpenSheetMusicDisplay(container, options));
}

export async function mxlToXml(data: ArrayBuffer): Promise<string> {
  const osmd = await loadOsmd();
  return osmd.MXLHelper.MXLtoXMLstring(data);
}

export function notationReloadMessage(language: AppLanguage): { message: string; button: string } {
  return language === 'ro'
    ? { message: 'Partitura nu s-a putut încărca. Reîncarcă pagina.', button: 'Reîncarcă' }
    : { message: 'The score could not load. Reload the page.', button: 'Reload' };
}

function hasOrphanSystemBeforeForcedPageBreak(pages: readonly unknown[]): boolean {
  return pages.some((page, pageIndex) => {
    if (pageIndex === 0) return false;
    const systems = asArray(asRecord(page).MusicSystems);
    if (systems.length !== 1) return false;
    const soleSystem = asRecord(systems[0]);
    if (!soleSystem.breaksPage) return false;
    const measures = asArray(soleSystem.GraphicalMeasures);
    const firstMeasure = asArray(measures[0]).find(Boolean);
    const sourceMeasure = asRecord(asRecord(firstMeasure).parentSourceMeasure);
    return !sourceMeasure.printNewPageXml;
  });
}

export function patchOsmdPedals(osmd: unknown): void {
  const vendor = osmd as {
    VexFlowMusicSheetDrawer?: { prototype?: Drawer };
    VexFlowMusicSheetCalculator?: { prototype?: PedalCalculator };
    MusicSystemBuilder?: { prototype?: SystemBuilder };
  } | null;
  const drawer = vendor?.VexFlowMusicSheetDrawer?.prototype;
  if (!drawer || typeof drawer.drawPedals !== 'function') {
    throw new Error('OSMD contract violation: VexFlowMusicSheetDrawer.prototype.drawPedals is missing');
  }
  if (!drawer.scPedalGroups) {
    const draw = drawer.drawPedals;
    drawer.drawPedals = function drawPedals(line: PedalLine): void {
      const context = this.backend?.getContext?.();
      if (!context?.openGroup || !context.closeGroup || !line?.Pedals) {
        draw.call(this, line);
        return;
      }
      const allPedals = line.Pedals;
      try {
        for (const pedal of allPedals) {
          const group = context.openGroup('sc-pedal');
          if (group) group.scPedalOwner = { staffLine: line, pedal };
          try {
            line.Pedals = [pedal];
            draw.call(this, line);
          } finally {
            context.closeGroup();
          }
        }
      } finally {
        line.Pedals = allPedals;
      }
    };
    drawer.scPedalGroups = true;
  }

  // Text pedals are independent signs, not one continuous bracket. OSMD aligns every sign on a staff
  // to the lowest earlier sign, so one ledger note can push the whole piece down in continuous view.
  // Let its normal skyline calculation see only the current sign; the subsequent bottom-line update
  // still reserves space for every sign, and bracket pedals retain the vendor's shared alignment.
  const calculator = vendor?.VexFlowMusicSheetCalculator?.prototype;
  if (calculator && !calculator.scLocalTextPedals && typeof calculator.calculatePedalSkyBottomLine === 'function') {
    const calculate = calculator.calculatePedalSkyBottomLine;
    calculator.calculatePedalSkyBottomLine = function calculatePedalSkyBottomLine(pedal: unknown, line: PedalLine): void {
      if (!asRecord(pedal).EndSymbolPositionAndShape) {
        calculate.call(this, pedal, line);
        return;
      }
      const allPedals = line.Pedals;
      try {
        line.Pedals = [];
        calculate.call(this, pedal, line);
      } finally {
        line.Pedals = allPedals;
      }
    };
    calculator.scLocalTextPedals = true;
  }

  // Narrow pagination guard for OSMD 2.2+: if subtracting pageTopBorder pushes the final system before an XML
  // `<print new-page="yes">` onto a single-system orphan page (e.g. Moonlight Sonata III bars 105, 138, 160),
  // recalculate system positions using 1.9.9's zero top-border offset during page-break placement.
  const builder = vendor?.MusicSystemBuilder?.prototype;
  if (builder && !builder.scOrphanPageGuard && typeof builder.calculateMusicSystemsRelativePositions === 'function') {
    const calc = builder.calculateMusicSystemsRelativePositions;
    builder.calculateMusicSystemsRelativePositions = function calculateMusicSystemsRelativePositions(): void {
      calc.call(this);
      const pages = this.graphicalMusicSheet?.MusicPages;
      if (this.rules?.NewPageAtXMLNewPageAttribute && Array.isArray(pages) && hasOrphanSystemBeforeForcedPageBreak(pages)) {
        pages.length = 0;
        const origTopBorder = this.pageTopBorder;
        this.pageTopBorder = () => 0;
        try {
          calc.call(this);
        } finally {
          if (origTopBorder) this.pageTopBorder = origTopBorder;
          else delete this.pageTopBorder;
        }
      }
    };
    builder.scOrphanPageGuard = true;
  }
}

/**
 * Apply the Étude-specific OSMD patches after the score adapter has loaded OSMD.
 * Keeping this operation in the notation domain prevents view code from reaching
 * into the vendor object or owning a notation concern.
 */
export function scorePatchOsmd(): void {
  const loaded = (globalThis as typeof globalThis & { opensheetmusicdisplay?: unknown }).opensheetmusicdisplay;
  if (isOsmdModule(loaded)) patchOsmdPedals(loaded);
}
