import { pitchClass } from './theory.js';

interface KeyboardTone {
  readonly midi: number;
  readonly tonic: boolean;
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
  let low = Math.min(...range);
  let high = Math.max(low + 12, ...range);
  while (!isWhiteKey(low)) low--;
  while (!isWhiteKey(high)) high++;
  const whiteWidth = 20, blackWidth = 12;
  const keys = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  const width = keys.filter(isWhiteKey).length * whiteWidth + 4;
  const svg = hintSvg('pr-chord-keyboard', `0 0 ${width} 68`);
  svg.dataset.chordRoot = String(pitchClass(root));
  let markedKeys: Element[] = [];

  const draw = (tones: readonly KeyboardTone[], label: string, changed?: ReadonlySet<number>) => {
    const marked = new Map(tones.map(tone => [tone.midi, tone]));
    const white: string[] = [], black: string[] = [];
    for (const midi of keys) {
      const isWhite = isWhiteKey(midi);
      const keyWidth = isWhite ? whiteWidth : blackWidth, height = isWhite ? 64 : 39;
      const x = 2 + white.length * whiteWidth - (isWhite ? 0 : blackWidth / 2);
      const tone = marked.get(midi);
      const classes = `pr-chord-key pr-chord-${isWhite ? 'white' : 'black'}`
        + (tone?.tonic ? ' pr-chord-root' : '') + (changed?.has(midi) ? ' pr-chord-changed' : '');
      const mark = tone
        ? `<circle class="pr-chord-key-dot" cx="${x + keyWidth / 2}" cy="${height - 6}" r="${tone.tonic ? 3.5 : 2.7}"/>`
        : '';
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
