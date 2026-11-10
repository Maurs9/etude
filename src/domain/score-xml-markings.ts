/** Restore a standard, explicitly identified direction glyph that OSMD omits.
 * Never infer a private-use character's meaning from its code point alone.
 */
export function normalizeScoreDirectionGlyphs(doc: Document): void {
  doc.querySelectorAll('direction-type > other-direction[smufl="ornamentTrill"]').forEach(symbol => {
    if (symbol.textContent?.trim()) return;
    const words = doc.createElementNS(symbol.namespaceURI, 'words');
    for (const attribute of [...symbol.attributes]) {
      if (attribute.name !== 'smufl') words.setAttribute(attribute.name, attribute.value);
    }
    words.setAttribute('font-style', 'italic');
    words.textContent = 'tr';
    symbol.replaceWith(words);
  });
}

/** Draw missing piano notehead parentheses around their actual rendered ink.
 * The app's note binding tags only the source onsets carrying parentheses;
 * a tied continuation must not cause every head in its chain to be decorated.
 */
export function renderScoreNoteParentheses(root: HTMLElement, color: string): void {
  root.querySelectorAll('.sc-note-parentheses').forEach(element => element.remove());
  const namespace = 'http://www.w3.org/2000/svg';
  root.querySelectorAll<SVGElement>('.vf-notehead[data-parenthesized="yes"]').forEach(head => {
    const svg = head.ownerSVGElement, matrix = svg?.getScreenCTM();
    const bounds = head.getBoundingClientRect();
    if (!svg || !matrix || !bounds.width || !bounds.height) return;
    const inverse = matrix.inverse();
    const left = new DOMPoint(bounds.left, bounds.top).matrixTransform(inverse);
    const right = new DOMPoint(bounds.right, bounds.bottom).matrixTransform(inverse);
    const group = document.createElementNS(namespace, 'g');
    group.classList.add('sc-note-parentheses');
    const top = left.y - 1, bottom = right.y + 1, middle = (top + bottom) / 2;
    for (const [x, bow] of [[left.x - 2, -2.5], [right.x + 2, 2.5]]) {
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', `M${x} ${top} Q${x + bow} ${middle} ${x} ${bottom}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '1');
      group.appendChild(path);
    }
    svg.appendChild(group);
  });
}

export type ScoreHand = 'rh' | 'lh';

export interface PartHandDetection {
  hands: Map<number, ScoreHand>;
  sisters: Map<number, number>;
}

/** Detect right-hand and left-hand parts in multi-part grand staff / piano scores.
 * Uses part-group brace brackets, explicit part-name/abbreviation (RH/LH, MD/MS, etc.),
 * or scores with exactly two single-staff parts.
 */
export function scoreDetectPartHands(doc: Document): PartHandDetection {
  const hands = new Map<number, ScoreHand>();
  const sisters = new Map<number, number>();
  const partList = doc.querySelector('score-partwise > part-list') ?? doc.querySelector('part-list');
  const scoreParts = partList ? [...partList.querySelectorAll('score-part')] : [...doc.querySelectorAll('score-part')];
  if (!scoreParts.length) return { hands, sisters };

  const idToPi = new Map<string, number>();
  scoreParts.forEach((sp, i) => {
    const id = sp.getAttribute('id');
    if (id) idToPi.set(id, i);
  });

  if (partList) {
    const activeGroups: { number: string; isBraced: boolean; parts: number[] }[] = [];
    for (const child of partList.children) {
      if (child.localName === 'part-group') {
        const type = (child.getAttribute('type') || '').toLowerCase();
        const num = child.getAttribute('number') || '';
        const symbol = child.querySelector('group-symbol')?.textContent?.trim().toLowerCase();
        const groupName = (child.querySelector('group-name')?.textContent || '').toLowerCase();
        const isBraced = symbol === 'brace' || /piano|klavier|pno/i.test(groupName);
        if (type === 'start') {
          activeGroups.push({ number: num, isBraced, parts: [] });
        } else if (type === 'stop') {
          const idx = activeGroups.findIndex(g => !num || g.number === num);
          if (idx !== -1) {
            const g = activeGroups.splice(idx, 1)[0];
            if (g.isBraced && g.parts.length === 2) {
              const [p1, p2] = g.parts;
              if (!hands.has(p1)) hands.set(p1, 'rh');
              if (!hands.has(p2)) hands.set(p2, 'lh');
              sisters.set(p1, p2);
              sisters.set(p2, p1);
            }
          }
        }
      } else if (child.localName === 'score-part') {
        const id = child.getAttribute('id');
        const pi = id ? idToPi.get(id) : undefined;
        if (pi !== undefined) {
          activeGroups.forEach(g => g.parts.push(pi));
        }
      }
    }
    activeGroups.forEach(g => {
      if (g.isBraced && g.parts.length === 2) {
        const [p1, p2] = g.parts;
        if (!hands.has(p1)) hands.set(p1, 'rh');
        if (!hands.has(p2)) hands.set(p2, 'lh');
        sisters.set(p1, p2);
        sisters.set(p2, p1);
      }
    });
  }

  const isRhText = (s: string) => /\b(right(\s+hand)?|r\.?h\.?|main\s+droite|m\.?d\.?|rechte\s+hand|mano\s+destra)\b/i.test(s);
  const isLhText = (s: string) => /\b(left(\s+hand)?|l\.?h\.?|main\s+gauche|m\.?g\.?|m\.?s\.?|linke\s+hand|mano\s+sinistra)\b/i.test(s);
  let rhNamedPart: number | undefined;
  let lhNamedPart: number | undefined;
  scoreParts.forEach((sp, i) => {
    const name = (sp.querySelector('part-name')?.textContent || '') + ' ' + (sp.querySelector('part-abbreviation')?.textContent || '');
    if (isRhText(name)) rhNamedPart = i;
    else if (isLhText(name)) lhNamedPart = i;
  });
  if (rhNamedPart !== undefined && lhNamedPart !== undefined && rhNamedPart !== lhNamedPart) {
    hands.set(rhNamedPart, 'rh');
    hands.set(lhNamedPart, 'lh');
    sisters.set(rhNamedPart, lhNamedPart);
    sisters.set(lhNamedPart, rhNamedPart);
  }

  if (scoreParts.length === 2 && hands.size === 0) {
    const allParts = [...doc.querySelectorAll('score-partwise > part')];
    const parts = allParts.length ? allParts : [...doc.querySelectorAll('part')];
    if (parts.length === 2) {
      const hasMultiStaves = parts.some(p => {
        const st = Number(p.querySelector('measure > attributes > staves')?.textContent || '1');
        return st >= 2;
      });
      if (!hasMultiStaves) {
        hands.set(0, 'rh');
        hands.set(1, 'lh');
        sisters.set(0, 1);
        sisters.set(1, 0);
      }
    }
  }

  return { hands, sisters };
}
