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

export type AppLanguage = 'en' | 'ro';

let osmdPromise: Promise<OsmdModule> | null = null;

export interface OsmdModule {
  OpenSheetMusicDisplay: new (container: Element, options: Record<string, unknown>) => unknown;
  MXLHelper: {
    MXLtoXMLstring(data: ArrayBuffer): string;
  };
}

export interface ScoreRenderer {
  getRules(): any;
  load(xml: string): Promise<void>;
  setOptions(options: Record<string, unknown>): void;
  setCustomPageFormat(width: number, height: number): void;
  getZoom(): number;
  setZoom(value: number): void;
  render(): void;
  getGraphicSheet(): any;
  getSheet(): any;
  getCursor(): any;
  getGraphicalNote(note: unknown): any;
  readonly EngravingRules: any;
  readonly GraphicSheet: any;
  readonly Sheet: any;
  readonly cursor: any;
  Zoom: number;
}

class OsmdScoreRenderer implements ScoreRenderer {
  constructor(private readonly vendor: any) {}

  getRules(): any { return this.vendor.EngravingRules; }
  load(xml: string): Promise<void> { return this.vendor.load(xml); }
  setOptions(options: Record<string, unknown>): void { this.vendor.setOptions(options); }
  setCustomPageFormat(width: number, height: number): void { this.vendor.setCustomPageFormat(width, height); }
  getZoom(): number { return this.vendor.Zoom; }
  setZoom(value: number): void { this.vendor.Zoom = value; }
  render(): void { this.vendor.render(); }
  getGraphicSheet(): any { return this.vendor.GraphicSheet; }
  getSheet(): any { return this.vendor.Sheet; }
  getCursor(): any { return this.vendor.cursor; }
  getGraphicalNote(note: unknown): any { return this.vendor.EngravingRules.GNote(note); }
  get EngravingRules(): any { return this.vendor.EngravingRules; }
  get GraphicSheet(): any { return this.vendor.GraphicSheet; }
  get Sheet(): any { return this.vendor.Sheet; }
  get cursor(): any { return this.vendor.cursor; }
  get Zoom(): number { return this.vendor.Zoom; }
  set Zoom(value: number) { this.vendor.Zoom = value; }
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
      script.src = new URL('vendor/osmd-1.9.9.min.js', document.baseURI).href;
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

/**
 * Apply the Étude-specific OSMD patches after the score adapter has loaded OSMD.
 * Keeping this operation in the notation domain prevents view code from reaching
 * into the vendor object or owning a notation concern.
 */
export function scorePatchOsmd(): void {
  const loaded = (globalThis as typeof globalThis & { opensheetmusicdisplay?: unknown }).opensheetmusicdisplay;
  if (isOsmdModule(loaded)) patchOsmdPedals(loaded);
}
