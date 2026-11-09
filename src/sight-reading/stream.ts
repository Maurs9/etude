/* Pure layout and pacing for the look-ahead note stream of the reading drills. */

export interface StreamFit {
  /** CSS pixels per SVG unit. */
  readonly scale: number;
  /** Width of one note column, in SVG units. */
  readonly colW: number;
  /** SVG units before the first column (clef and margin). */
  readonly head: number;
  readonly min?: number;
  readonly max?: number;
}

export interface StreamPitch {
  readonly li: number;
  readonly oct: number;
  readonly acc?: number;
}

export type StreamEdge = -1 | 0 | 1;

/** How many note columns fit in `availPx` CSS pixels. */
export function streamVisible(availPx: number, fit: StreamFit): number {
  const min = fit.min ?? 5, max = fit.max ?? 12;
  const n = Math.floor((availPx / fit.scale - fit.head - 10) / fit.colW);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

/** Notes already answered that stay visible to the left of the current one. */
export function streamLead(visible: number): number {
  return visible <= 6 ? 1 : 2;
}

/** Index of the first visible note. `total` is null for an endless stream. */
export function streamStart(cur: number, visible: number, total: number | null): number {
  const start = Math.max(0, cur - streamLead(visible));
  return total == null ? start : Math.min(start, Math.max(0, total - visible));
}

/**
 * Whether a natural note needs a courtesy natural sign. The stream has no barlines,
 * so a sharp or flat on the most recent note with the same letter and octave, among
 * the last `lookback` notes, would otherwise seem to still apply.
 */
export function courtesyNatural(prev: readonly StreamPitch[], note: StreamPitch, lookback = 6): boolean {
  if ((note.acc || 0) !== 0)
    return false;
  for (let i = prev.length - 1; i >= Math.max(0, prev.length - lookback); i--) {
    const p = prev[i];
    if (p.li === note.li && p.oct === note.oct)
      return (p.acc || 0) !== 0;
  }
  return false;
}

/**
 * Where the pacer ghost sits after `p` notes at the target speed: on the centre of
 * note column `p - start`, held at the band's edge (and reported by `edge`) when it
 * is off screen.
 */
export function ghostX(p: number, start: number, visible: number, x0: number, colW: number): { x: number; edge: StreamEdge } {
  const rel = p - start;
  const edge: StreamEdge = rel < -0.5 ? -1 : rel > visible - 0.5 ? 1 : 0;
  const r = Math.max(-0.5, Math.min(visible - 0.5, rel));
  return { x: x0 + (r + 0.5) * colW, edge };
}

/** Whole notes the player is ahead of (positive) or behind (negative) the ghost. */
export function pacerLead(cur: number, p: number): number {
  const d = Math.round(cur - p);
  return d === 0 ? 0 : d;
}

export function formatLead(d: number): string {
  return d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '±0';
}
