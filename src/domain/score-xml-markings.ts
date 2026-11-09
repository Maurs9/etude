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
