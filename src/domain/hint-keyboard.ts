import { pitchClass } from './theory.js';

interface KeyboardTone {
  readonly midi: number;
  readonly tonic: boolean;
  readonly finger?: number;
  readonly fingerRh?: number;
  readonly fingerLh?: number;
}

const whitePitches = new Set([0, 2, 4, 5, 7, 9, 11]);

export function hintSvg(className: string, viewBox: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('role', 'img');
  return svg;
}

export function createHintKeyboard(root: number, range: readonly number[]) {
  const isWhiteKey = (midi: number) => whitePitches.has(pitchClass(midi));
  const whiteWidth = 20, blackWidth = 12;
  const computeKeys = (midis: readonly number[]) => {
    let low = Math.min(...midis);
    let high = Math.max(low + 12, ...midis);
    while (!isWhiteKey(low)) low--;
    while (!isWhiteKey(high)) high++;
    const list = Array.from({ length: high - low + 1 }, (_, index) => low + index);
    const width = list.filter(isWhiteKey).length * whiteWidth + 4;
    return { list, width };
  };
  let layout = computeKeys(range);
  const svg = hintSvg('pr-chord-keyboard', `0 0 ${layout.width} 62`);
  svg.dataset.chordRoot = String(pitchClass(root));
  let markedKeys: Element[] = [];

  const draw = (tones: readonly KeyboardTone[], label: string, changed?: ReadonlySet<number>, fitRange = false) => {
    if (fitRange && tones.length) {
      layout = computeKeys(tones.map(tone => tone.midi));
    }
    const hasDual = tones.some(tone => tone.fingerRh !== undefined || tone.fingerLh !== undefined);
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${hasDual ? 76 : 62}`);
    svg.classList.toggle('pr-chord-keyboard-dual', hasDual);
    const marked = new Map(tones.map(tone => [tone.midi, tone]));
    const white: string[] = [], black: string[] = [];
    for (const midi of layout.list) {
      const isWhite = isWhiteKey(midi);
      const keyWidth = isWhite ? whiteWidth : blackWidth;
      const height = hasDual ? (isWhite ? 72 : 44) : (isWhite ? 58 : 35);
      const x = 2 + white.length * whiteWidth - (isWhite ? 0 : blackWidth / 2);
      const tone = marked.get(midi);
      const classes = `pr-chord-key pr-chord-${isWhite ? 'white' : 'black'}`
        + (tone?.tonic ? ' pr-chord-root' : '') + (changed?.has(midi) ? ' pr-chord-changed' : '');
      const cx = x + keyWidth / 2, cy = height - 6;
      let mark = '';
      if (tone) {
        if (hasDual) {
          const cyRh = height - 18, cyLh = height - 6;
          if (tone.tonic) {
            mark += `<circle class="pr-chord-key-dot" cx="${cx}" cy="${cyRh}" r="4.6"/>`;
          }
          if (tone.fingerRh !== undefined) {
            mark += `<text class="pr-hint-key-finger pr-hint-key-finger-rh" x="${cx}" y="${cyRh}">${tone.fingerRh}</text>`;
          }
          if (tone.fingerLh !== undefined) {
            mark += `<text class="pr-hint-key-finger pr-hint-key-finger-lh" x="${cx}" y="${cyLh}">${tone.fingerLh}</text>`;
          }
        } else {
          if (tone.finger === undefined || tone.tonic) {
            const radius = tone.finger === undefined ? (tone.tonic ? 3.4 : 2.6) : 5;
            mark += `<circle class="pr-chord-key-dot" cx="${cx}" cy="${cy}" r="${radius}"/>`;
          }
          if (tone.finger !== undefined) {
            mark += `<text class="pr-hint-key-finger" x="${cx}" y="${cy}">${tone.finger}</text>`;
          }
        }
      }
      (isWhite ? white : black).push(`<g class="${classes}"${tone ? ` data-chord-midi="${midi}"` : ''}>`
        + `<rect class="pr-chord-key-shape" x="${x}" y="2" width="${keyWidth}" height="${height}" rx="1.5"/>` + mark + '</g>');
    }
    svg.innerHTML = white.join('') + black.join('');
    svg.setAttribute('aria-label', label);
    markedKeys = [...svg.querySelectorAll('[data-chord-midi]')];
  };
  const paint = (active: ReadonlySet<number>) => {
    markedKeys.forEach(key => key.classList.toggle('pr-chord-sounding', active.has(Number(key.getAttribute('data-chord-midi')))));
  };
  return { svg, draw, paint };
}
