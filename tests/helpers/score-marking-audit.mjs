// Checks semantic text targets independently of the application's classifier.
// Deliberately excludes titles, measure numbers and instrument names.
export function scoreMarkingCoverage() {
  const E = window.__etude, root = document.querySelector('#an-roll');
  const missing = [], empty = [], editorial = [];
  const selectors = '.osmd-words,.osmd-tempo,.vf-stavetempo,.osmd-dynamic,.osmd-chord-symbol,.osmd-fingering,.vf-stavesection,.vf-repetition,.vf-stavebarline,.vf-volta,.vf-textbracket,.vf-tuplet,.sc-note-parentheses,[data-grace="yes"]';
  const shown = element => {
    const r = element.getBoundingClientRect();
    return r.width > .1 && r.height > .1 && getComputedStyle(element).visibility !== 'hidden';
  };
  for (const element of root.querySelectorAll(selectors)) {
    if (!shown(element)) continue;
    if (!element.matches('[data-sym]') && !element.querySelector('[data-sym]')) {
      missing.push({ class: element.getAttribute('class'), text: element.textContent.trim() });
    }
  }
  for (const symbol of E.SCORE.syms) {
    const text = E.scoreSymText(symbol);
    if (!text.body.trim() || /\bsym_[\w_]+\b|%[sab]/.test(text.line)) empty.push({ kind: symbol.kind, value: symbol.val, text });
    if (symbol.kind === 'direction') editorial.push(symbol.val);
  }
  return { missing, empty, editorial, kinds: [...new Set(E.SCORE.syms.map(s => s.kind))].sort(), count: E.SCORE.syms.length };
}

// Test only unintended collisions: curves can legitimately span notes and staff
// lines, whereas segno/coda/tempo text must not cover noteheads or fingerings.
export function scoreNavigationCollisions() {
  const root = document.querySelector('#an-roll'), issues = [];
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  for (const [page, svg] of [...root.querySelectorAll('svg')].entries()) {
    const obstacles = [...svg.querySelectorAll('.vf-notehead,.osmd-fingering,.osmd-chord-symbol')].map(el => ({ el, rect: el.getBoundingClientRect() }));
    for (const element of svg.querySelectorAll('.vf-repetition,.osmd-tempo,.vf-stavetempo,.vf-stavesection')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      for (const other of obstacles) {
        if (!other.el.contains(element) && !element.contains(other.el) && overlap(rect, other.rect)) issues.push({ page: page + 1, kind: element.getAttribute('class'), text: element.textContent, obstacle: other.el.getAttribute('class'), obstacleText: other.el.textContent });
      }
    }
  }
  return issues;
}

// Compare original MusicXML with rendered output so omitted notation cannot
// pass merely because there is no SVG element left to inspect.
export async function scoreSourceMarkingCoverage({ name, bytes }) {
  // The app deliberately resets the file input after import, so pass the
  // original bytes explicitly rather than reading an already emptied input.
  const buffer = Uint8Array.from(bytes).buffer;
  const xml = /\.mxl$/i.test(name)
    ? await window.opensheetmusicdisplay.MXLHelper.MXLtoXMLstring(buffer)
    : new TextDecoder().decode(buffer);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const notes = [...doc.querySelectorAll('note')].filter(note => note.getAttribute('print-object') !== 'no');
  const metronomes = new Set();
  [...doc.querySelectorAll('part')].forEach((part, pi) => {
    let divisions = 1;
    [...part.children].filter(node => node.localName === 'measure').forEach((measure, mi) => {
      let beat = 0;
      for (const node of measure.children) {
        if (node.localName === 'attributes') divisions = Number(node.querySelector('divisions')?.textContent) || divisions;
        else if (node.localName === 'backup' || node.localName === 'forward') beat += Number(node.querySelector('duration')?.textContent || 0) / divisions * (node.localName === 'backup' ? -1 : 1);
        else if (node.localName === 'note' && !node.querySelector('chord,grace')) beat += Number(node.querySelector('duration')?.textContent || 0) / divisions;
        else if (node.localName === 'direction' && node.getAttribute('print-object') !== 'no') {
          for (const mark of node.querySelectorAll(':scope > direction-type > metronome')) {
            if (!mark.querySelector('per-minute')) continue;
            // Moonlight exports the identical mark twice at the same staff/onset.
            // Count that once, without conflating later repetitions or another staff.
            metronomes.add(JSON.stringify([pi, mi, beat + Number(node.querySelector(':scope > offset')?.textContent || 0) / divisions, node.querySelector(':scope > staff')?.textContent || '1', new XMLSerializer().serializeToString(mark).replace(/>\s+</g, '><')]));
          }
        }
      }
    });
  });
  const expected = {
    grace: notes.filter(note => note.querySelector(':scope > pitch') && note.querySelector(':scope > grace')).length,
    parenthesized: notes.filter(note => note.querySelector(':scope > notehead[parentheses="yes"]')).length,
    directionTrills: doc.querySelectorAll('other-direction[smufl="ornamentTrill"]').length,
    metronomes: metronomes.size,
  };
  const root = document.querySelector('#an-roll');
  const actual = {
    grace: root.querySelectorAll('.vf-notehead[data-grace="yes"]').length,
    parenthesized: root.querySelectorAll('.sc-note-parentheses').length,
    directionTrills: window.__etude.SCORE.syms.filter(s => s.kind === 'text' && s.val === 'tr').length,
    metronomes: root.querySelectorAll('.vf-stavetempo[data-sym]').length,
  };
  // Inventory source words BEFORE importer cleanup. Merely checking existing
  // SVG targets cannot detect a complete musical instruction that was deleted.
  const normalize = text => text.normalize('NFC').toLowerCase().replace(/[♩♪♫♬\u{1D15D}-\u{1D164}\s]/gu, '');
  const labels = window.__etude.SCORE.syms.flatMap(symbol => [symbol.el?.textContent ?? '', typeof symbol.val === 'string' ? symbol.val : '']).map(normalize);
  const kinds = new Set(window.__etude.SCORE.syms.map(symbol => symbol.kind));
  const omittedWords = [...doc.querySelectorAll('direction-type > words')].flatMap(words => {
    const text = words.textContent.trim(), direction = words.closest('direction');
    if (!text || direction.getAttribute('print-object') === 'no') return [];
    // The two editorial notes in the audited corpus are not performance instructions.
    if (/^(?:Correccoes a algumas notas|Versão minha, alterada com base)/u.test(text)) return [];
    if (/^\.\d+$/.test(text) && direction.querySelector('metronome > per-minute')) return [];
    const navigation = direction.querySelector('sound'), mapping = { tocoda: 'tocoda', coda: 'coda', segno: 'segno', dalsegno: 'dalsegno_coda', dacapo: 'dacapo', fine: 'fine' };
    if (Object.entries(mapping).some(([attribute, kind]) => navigation?.hasAttribute(attribute) && kinds.has(kind))) return [];
    if (labels.some(label => label.includes(normalize(text)))) return [];
    return [{ measure: words.closest('measure').getAttribute('number'), text }];
  });
  const unknownGlyphs = [...doc.querySelectorAll('direction-type > words')]
    .filter(words => /[\uE000-\uF8FF]/u.test(words.textContent) && !/[=]/.test(words.closest('direction').textContent))
    .map(words => {
      const sound = words.closest('direction').querySelector(':scope > sound');
      // A legacy private glyph is not guessed from its font/codepoint. The same
      // direction can explicitly identify its navigation meaning, e.g. tocoda.
      const coveredBy = ['tocoda', 'coda', 'segno', 'dalsegno', 'dacapo', 'fine'].find(attribute => sound?.hasAttribute(attribute)) ?? null;
      return { measure: words.closest('measure').getAttribute('number'), text: words.textContent, codepoints: [...words.textContent].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()), coveredBy };
    });
  return { expected, actual, omittedWords, unknownGlyphs };
}
