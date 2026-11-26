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
  const computeKeys = (midis: readonly number[], whiteWidth: number) => {
    let low = Math.min(...midis);
    let high = Math.max(low + 12, ...midis);
    while (!isWhiteKey(low)) low--;
    while (!isWhiteKey(high)) high++;
    const list = Array.from({ length: high - low + 1 }, (_, index) => low + index);
    const width = list.filter(isWhiteKey).length * whiteWidth + 4;
    return { list, width };
  };
  let layout = computeKeys(range, 22);
  const svg = hintSvg('pr-chord-keyboard', `0 0 ${layout.width} 66`);
  svg.dataset.chordRoot = String(pitchClass(root));
  let markedKeys: Element[] = [];

  const draw = (tones: readonly KeyboardTone[], label: string, changed?: ReadonlySet<number>, fitRange = false) => {
    const hasDual = tones.some(tone => tone.fingerRh !== undefined || tone.fingerLh !== undefined);
    const whiteWidth = hasDual ? 26 : 22;
    const blackWidth = hasDual ? 16 : 13;
    const whiteHeight = hasDual ? 90 : 62;
    const blackHeight = hasDual ? 56 : 38;
    const viewHeight = hasDual ? 94 : 66;
    if (fitRange && tones.length) {
      layout = computeKeys(tones.map(tone => tone.midi), whiteWidth);
    } else {
      layout = computeKeys(range, whiteWidth);
    }
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${viewHeight}`);
    svg.classList.toggle('pr-chord-keyboard-dual', hasDual);
    const marked = new Map(tones.map(tone => [tone.midi, tone]));
    const white: string[] = [], black: string[] = [];
    for (const midi of layout.list) {
      const isWhite = isWhiteKey(midi);
      const keyWidth = isWhite ? whiteWidth : blackWidth;
      const height = isWhite ? whiteHeight : blackHeight;
      const x = 2 + white.length * whiteWidth - (isWhite ? 0 : blackWidth / 2);
      const tone = marked.get(midi);
      const classes = `pr-chord-key pr-chord-${isWhite ? 'white' : 'black'}`
        + (tone?.tonic ? ' pr-chord-root' : '') + (changed?.has(midi) ? ' pr-chord-changed' : '');
      const cx = x + keyWidth / 2, cy = height - 7;
      let mark = '';
      if (tone) {
        if (hasDual) {
          const r = isWhite ? 7.4 : 6.6;
          const cyRh = isWhite ? 65 : 19;
          const cyLh = isWhite ? 81.5 : 41;
          if (tone.tonic) {
            mark += `<rect class="pr-hint-tonic-bar" x="${x + 2}" y="${isWhite ? 3 : 3}" width="${keyWidth - 4}" height="4" rx="2"/>`;
          }
          if (tone.fingerRh !== undefined) {
            mark += `<circle class="pr-hint-badge pr-hint-badge-rh" cx="${cx}" cy="${cyRh}" r="${r}"/>`;
            mark += `<text class="pr-hint-key-finger pr-hint-key-finger-rh" x="${cx}" y="${cyRh}">${tone.fingerRh}</text>`;
          }
          if (tone.fingerLh !== undefined) {
            mark += `<circle class="pr-hint-badge pr-hint-badge-lh" cx="${cx}" cy="${cyLh}" r="${r}"/>`;
            mark += `<text class="pr-hint-key-finger pr-hint-key-finger-lh" x="${cx}" y="${cyLh}">${tone.fingerLh}</text>`;
          }
        } else {
          if (tone.finger === undefined || tone.tonic) {
            const radius = tone.finger === undefined ? (tone.tonic ? 3.8 : 2.9) : 5.5;
            mark += `<circle class="pr-chord-key-dot" cx="${cx}" cy="${cy}" r="${radius}"/>`;
          }
          if (tone.finger !== undefined) {
            mark += `<text class="pr-hint-key-finger" x="${cx}" y="${cy}">${tone.finger}</text>`;
          }
        }
      }
      (isWhite ? white : black).push(`<g class="${classes}"${tone ? ` data-chord-midi="${midi}"` : ''}>`
        + `<rect class="pr-chord-key-shape" x="${x}" y="2" width="${keyWidth}" height="${height}" rx="2"/>` + mark + '</g>');
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
