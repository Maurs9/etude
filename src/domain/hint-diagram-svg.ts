import { ssAccGlyph, ssFlat, ssStepOf } from './score-types.js';
import { pitchClass, type SpelledMidi } from './theory.js';

type HintKind = 'chord' | 'scale';

interface KeyboardTone {
  readonly midi: number;
  readonly tonic: boolean;
}

const whitePitch = new Set([0, 2, 4, 5, 7, 9, 11]);
const svgNamespace = 'http://www.w3.org/2000/svg';

export function hintSvg(className: string, viewBox: string): SVGSVGElement {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('role', 'img');
  return svg;
}

export function hintKeyboardLayout(midis: readonly number[]) {
  let low = Math.min(...midis);
  let high = Math.max(low + 12, ...midis);
  while (!whitePitch.has(pitchClass(low))) low--;
  while (!whitePitch.has(pitchClass(high))) high++;
  const whites = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(midi => whitePitch.has(pitchClass(midi))).length;
  return { low, high, viewBox: `0 0 ${whites * 20 + 4} 68` };
}

export function hintKeyboardKeys(kind: HintKind, tones: readonly KeyboardTone[], low: number, high: number, changed: ReadonlySet<number> | null): string {
  const whiteWidth = 20, blackWidth = 12;
  const white: string[] = [], black: string[] = [];
  const prefix = `pr-${kind}`;
  for (let midi = low; midi <= high; midi++) {
    const isWhite = whitePitch.has(pitchClass(midi));
    const width = isWhite ? whiteWidth : blackWidth, height = isWhite ? 64 : 39;
    const x = 2 + white.length * whiteWidth - (isWhite ? 0 : blackWidth / 2);
    const tone = tones.find(note => note.midi === midi);
    const group = `<g class="${prefix}-key ${prefix}-${isWhite ? 'white' : 'black'}${tone?.tonic ? ` ${prefix}-root` : ''}${changed?.has(midi) ? ` ${prefix}-changed` : ''}"${tone ? ` data-${kind}-midi="${midi}"` : ''}>` +
      `<rect class="${prefix}-key-shape" x="${x}" y="2" width="${width}" height="${height}" rx="1.5"/>` +
      (tone ? `<circle class="${prefix}-key-dot" cx="${x + width / 2}" cy="${height - 6}" r="${tone.tonic ? 3.5 : 2.7}"/>` : '') + '</g>';
    (isWhite ? white : black).push(group);
  }
  return white.join('') + black.join('');
}

export function hintStaffY(tone: SpelledMidi) {
  // E4 is the bottom line of the treble staff.
  return 48 + (30 - ssStepOf(tone.li, tone.oct)) * 6;
}

export function hintAccidental(kind: HintKind, acc: number, x: number, y: number): string {
  if (acc === -2) return ssFlat(x - 5, y) + ssFlat(x, y);
  if (acc === 2) {
    return `<path class="pr-${kind}-double-sharp" d="M${x - 3},${y - 4}l7,8m0,-8l-7,8" fill="none" stroke-width="2.8"/>`;
  }
  return ssAccGlyph(acc, 0, x, y);
}
