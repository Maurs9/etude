import { createHash } from 'node:crypto';
import { test, expect } from '../helpers/fixtures.mjs';

// The engraver's opt-in mode for level pieces (`engrave: 2`): beams in every meter, whole-bar and dotted rests, accidentals
// that hold for the bar, tied chords, spelled note names and room for accidentals on sixteenths. Every score is also drawn
// without the flag: that markup must stay exactly what the engraver drew before the mode existed (SHA-256 of the SVG).
const BASE = {
  beams44: 'bfc40e321416907fac7d1b076fc0984118320f5de75ef3afd163cbc79e8a273c',
  stemDir: '2d48dbbd05f6fe77472b928dab3fe3dfbbb291ac2d4ce9b2ea53a76d2dea1870',
  chordBeam: '47f3338dfeb20aef536d06d0af72b934ac93ba6eea1a8c29fcac79aa7a878227',
  meter68: '565a00ed9d035c25c16d7a2cbe7060f8514b2cd2309c6e49d7d5009936e5a4f5',
  meter38: 'b5ef81bca8c168c9041e9713b0823693f9baba0057caa3684291396cb7706b08',
  rests44: '27b65957a32638a354f28ed6294933c68631af3f819be429d1abb18693be4457',
  rests34: '8822cdc5fad3cb1ff2a5182ea0e9f7ea84b6adda0f0ba5e7f110de84ca34940f',
  rests24: '8a4930906e16e7c92df078b00326caa7d92e422ce70000ee8ef83e8592078efd',
  accEb: '7711bfd58532549d71cf194acd5687b0b990e8788d368b70e1234e7b66330dd6',
  accMinor: 'd2ee596f5f6f39a07d274cf692419b78ff0eb77e8050efd2ee1dd134f9e62616',
  ties: '9fdf65c44461e9dd38f2e4bb15a406b39a6642c7b1523cb7ded2bbff1e28cf5c',
  tieBreak: 'a4e123b692c49a37c6a6d59bf8df0a6430c42bd91d45ef9ec4f9f616aa5e0436',
  names: '56d6a163233c2defc73e6bfc9e31aa77b3a4072545aeef102e0d9844c5fef8b0',
  spacing: '7348559a0360f0ff274f6bc21195fcc9d42f65c5523405d1e600fd1a6462006c',
  plain: 'bb5259998f556765e8915aebb79f7e90f94fb16737b0d8aac9112f507bda5016',
};
const LAYOUT = { width: 900 };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const v2 = (score) => ({ ...score, engrave: 2 });

async function open(app) {
  const page = await app.open({ hash: 'read' });
  await page.evaluate(() => { window.__etude.SR.names = false; });
  return page;
}
async function draw(page, score, layout = LAYOUT, names = false) {
  return page.evaluate(({ s, l, n }) => {
    window.__etude.SR.names = n;
    try { return window.__etude.srRenderScore(s, l); } finally { window.__etude.SR.names = false; }
  }, { s: score, l: layout, n: names });
}
// Facts about a markup string, read from a detached SVG in the page.
async function inspect(page, svg) {
  return page.evaluate((markup) => {
    const box = document.createElement('div');
    box.innerHTML = markup;
    const q = (sel) => [...box.querySelectorAll(sel)];
    const kind = (el) => (el.tagName === 'path' ? 'flat' : el.querySelector('line[stroke-width="1.7"]') ? 'sharp' : 'natural');
    return {
      beams: q('.ss-beam').length,
      beams2: q('.ss-beam2').length,
      flags: q('.ss-flag').length,
      ties: q('.ss-tie').length,
      tiedHeads: q('.ss-tied .ss-head').length,
      groups: q('.ss-n').length,
      stems: q('line.ss-stem').map((l) => ({ x: +l.getAttribute('x1'), y1: +l.getAttribute('y1'), y2: +l.getAttribute('y2') })),
      textRests: q('text.ss-clef').length,
      rests: Object.fromEntries(['bar', 'whole', 'half', 'q', '8', '16', 'dot'].map((k) => [k, q('.ss-rest-' + k).length])),
      barRests: q('.ss-rest-bar').map((r) => +r.getAttribute('x') + +r.getAttribute('width') / 2),
      barlines: [...new Set(q('line.ss-line').filter((l) => l.getAttribute('x1') === l.getAttribute('x2') && +l.getAttribute('x1') > 9)
        .map((l) => +l.getAttribute('x1')))].sort((a, b) => a - b),
      accs: q('.ss-n').filter((g) => !g.closest('.ss-tied')).map((g) => {
        const own = [...g.children].find((c) => c.classList.contains('ss-glyph'));
        return own ? kind(own) : '-';
      }),
      names: q('.ss-syl').map((t) => t.textContent),
      clefs: q('.ss-clef').length,
    };
  }, svg);
}
async function boxes(page, svg) {
  return page.evaluate((markup) => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:0;top:0';
    box.innerHTML = markup;
    document.body.appendChild(box);
    try {
      const heads = [...box.querySelectorAll('.ss-n ellipse.ss-head')].map((e) => {
        const cx = +e.getAttribute('cx'), cy = +e.getAttribute('cy');
        return { x0: cx - 6.3, x1: cx + 6.3, y0: cy - 5, y1: cy + 5 };
      });
      const accs = [...box.querySelectorAll('.ss-n .ss-glyph')].map((g) => { const b = g.getBBox(); return { x0: b.x, x1: b.x + b.width, y0: b.y, y1: b.y + b.height }; });
      return { heads, accs };
    } finally { box.remove(); }
  }, svg);
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const S = {
  beams44: { ts: [4, 4], keyN: 0, rh: [
    ['C5', 0.5], ['D5', 0.5], ['E5', 0.25], ['F5', 0.25], ['G5', 0.25], ['A5', 0.25], ['G5', 0.5], ['A5', 0.25], ['B5', 0.25], ['C6', 1],
    ['C5', 0.5], ['R', 0.5], ['D5', 1.5], ['E5', 0.5], ['F5', 1],
    ['E5', 0.25], ['F5', 0.5], ['G5', 0.25], ['A5', 0.5], ['B5', 0.5], ['C6', 2]] },
  stemDir: { ts: [4, 4], keyN: 0, rh: [['D4', 0.25], ['C5', 0.25], ['D5', 0.25], ['E5', 0.25], ['A5', 0.5], ['C5', 0.5], ['C5', 2]] },
  chordBeam: { ts: [4, 4], keyN: 0, rh: [[['C5', 'E5'], 0.5], [['D5', 'F5'], 0.5], ['C5', 1], ['C5', 2]] },
  meter68: { ts: [6, 8], keyN: 0, rh: [['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 1], ['E5', 0.5], ['R', 1.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5]],
    lh: [['A3', 1.5], ['E3', 1.5], ['R', 3]] },
  meter38: { ts: [3, 8], keyN: 0, rh: [['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F5', 1], ['G5', 0.5], ['R', 1.5]] },
  rests44: { ts: [4, 4], keyN: 0, rh: [['R', 3], ['C5', 1], ['R', 1], ['C5', 1], ['R', 0.5], ['C5', 0.5], ['R', 0.25], ['D5', 0.25], ['R', 0.5], ['R', 4]],
    lh: [['C3', 4], ['C3', 4], ['C3', 4]] },
  rests34: { ts: [3, 4], keyN: 0, rh: [['C5', 3], ['R', 3]], lh: [['R', 3], ['C3', 3]] },
  rests24: { ts: [2, 4], keyN: 0, rh: [['R', 2], ['C5', 2]] },
  accEb: { ts: [4, 4], keyN: -3, rh: [
    ['A4', 1], ['A4', 1], ['Ab4', 1], ['A4', 1],
    ['A4', 1], ['A5', 1], ['F#4', 1], ['F#4', 1],
    ['F#4', 1, 'tied'], ['F#4', 1], ['F4', 1], ['F4', 1]] },
  accMinor: { ts: [4, 4], keyN: 0, rh: [['G#4', 1], ['A4', 1], ['G#4', 1], ['G4', 1], ['G#4', 3], ['A4', 1]] },
  ties: { ts: [3, 4], keyN: 0, rh: [['C5', 2], ['E5', 1], ['E5', 1, 'tied'], ['D5', 2], ['C5', 3], ['D5', 1, 'tied'], ['E5', 2]],
    lh: [[['C3', 'G3'], 1], [['E3', 'G3'], 2], [['E3', 'G3'], 1, 'tied'], ['G2', 2], ['C3', 3], ['C3', 3]] },
  tieBreak: { ts: [4, 4], keyN: 0, rh: [['C5', 4], ['D5', 2], ['E5', 2], ['E5', 2, 'tied'], ['F5', 2], ['G5', 4]],
    lh: [['C3', 4], ['C3', 2], [['C3', 'E3'], 2], [['C3', 'E3'], 2, 'tied'], ['G2', 2], ['C3', 4]] },
  names: { ts: [4, 4], keyN: 0, rh: [['Fb4', 1], ['E#4', 1], ['Db4', 1], ['C4', 1]] },
  spacing: { ts: [4, 4], keyN: 0, rh: [['C#5', 0.25], ['D#5', 0.25], ['E#5', 0.25], ['F#5', 0.25],
    [['C#5', 'E#5'], 0.25], [['Eb5', 'G#5'], 0.25], [['F#5', 'A#5'], 0.25], ['Bb5', 0.25], ['C6', 2]] },
  plain: { ts: [4, 4], keyN: 0, rh: [['C5', 1], ['D5', 1], ['E5', 0.5], ['F5', 0.5], ['G5', 1], ['A5', 2], ['G5', 0.5], ['F5', 0.5], ['E5', 1]],
    lh: [['C3', 2], ['G3', 2], ['F3', 1], ['G3', 1], ['C3', 2]] },
};
const TIE_BREAK_LAYOUT = { width: 420 };

test.describe('Level-piece engraving (engrave: 2)', () => {
  test('the old markup is unchanged for every fixture without the flag', async ({ app }) => {
    const page = await open(app);
    const got = {};
    for (const [name, score] of Object.entries(S)) {
      const svg = await draw(page, score, name === 'tieBreak' ? TIE_BREAK_LAYOUT : LAYOUT, name === 'names');
      got[name] = sha(svg);
    }
    expect(got).toEqual(BASE);
  });

  test('1. beams eighths and sixteenths per beat group, with partial second beams and one stem direction', async ({ app }) => {
    const page = await open(app);
    const old = await inspect(page, await draw(page, S.beams44));
    expect(old.beams).toBe(2);
    expect(old.flags).toBe(20);
    const neu = await inspect(page, await draw(page, v2(S.beams44)));
    // bar 1: 8+8 (1), four 16ths (1 + 1 second beam), 8+16+16 (1 + 1); bar 3: 16+8+16 (1 + 2 stubs), 8+8 (1)
    expect(neu.beams).toBe(9);
    expect(neu.beams2).toBe(4);
    expect(neu.flags).toBe(2); // the eighth before a rest and the eighth after a dotted quarter
    expect(neu.groups).toBe(old.groups);

    const dirOld = await inspect(page, await draw(page, S.stemDir));
    expect(dirOld.beams).toBe(1);
    const dir = await inspect(page, await draw(page, v2(S.stemDir)));
    expect(dir.beams).toBe(3); // four 16ths (primary + second beam), then the eighth pair
    // D4 is furthest from the middle line: the whole group's stems point up, the A5-C5 pair's down.
    expect(dir.stems.slice(0, 4).every((s) => s.y2 < s.y1)).toBe(true);
    expect(dir.stems.slice(4, 6).every((s) => s.y2 > s.y1)).toBe(true);

    const chOld = await inspect(page, await draw(page, S.chordBeam));
    expect(chOld.beams).toBe(0);
    expect(chOld.flags).toBe(2);
    const ch = await inspect(page, await draw(page, v2(S.chordBeam)));
    expect(ch.beams).toBe(1);
    expect(ch.flags).toBe(0);

    for (const [name, beams, flags] of [['meter68', 2, 1], ['meter38', 1, 1]]) {
      const before = await inspect(page, await draw(page, S[name]));
      expect(before.beams, name).toBe(0);
      const after = await inspect(page, await draw(page, v2(S[name])));
      expect(after.beams, name).toBe(beams);
      expect(after.flags, name).toBe(flags);
    }
  });

  test('2. whole-bar rests in every meter, dotted rests, and rests drawn without a music font', async ({ app }) => {
    const page = await open(app);
    const old = await inspect(page, await draw(page, S.rests44));
    expect(old.textRests).toBe(4);
    expect(old.rests.bar + old.rests.dot).toBe(0);
    const neu = await inspect(page, await draw(page, v2(S.rests44)));
    expect(neu.textRests).toBe(0);
    expect(neu.rests).toEqual({ bar: 1, whole: 0, half: 1, q: 1, 8: 2, 16: 1, dot: 1 });
    // The bar rest sits halfway between the barline before it and the final barline.
    const [l, r] = neu.barlines.slice(-3, -1);
    expect(Math.abs(neu.barRests[0] - (l + r) / 2)).toBeLessThan(0.5);

    for (const [name, bar, dot] of [['rests34', 2, 0], ['rests24', 1, 0], ['meter68', 1, 1], ['meter38', 1, 0]]) {
      const before = await inspect(page, await draw(page, S[name]));
      expect(before.rests.bar, name).toBe(0);
      const after = await inspect(page, await draw(page, v2(S[name])));
      expect(after.rests.bar, name).toBe(bar);
      expect(after.rests.dot, name).toBe(dot);
    }
  });

  test('3. an accidental holds for the bar, is cancelled in the bar, and is forgotten at the barline', async ({ app }) => {
    const page = await open(app);
    const old = await inspect(page, await draw(page, S.accEb));
    expect(old.accs).toEqual(['natural', 'natural', '-', 'natural', 'natural', 'natural', 'sharp', 'sharp', 'sharp', '-', '-']);
    const neu = await inspect(page, await draw(page, v2(S.accEb)));
    // bar 1: A (natural), A, Ab (the key's flat again), A; bar 2: A, A5, F#, F#; bar 3: tied F# (no sign), F#, F, F
    expect(neu.accs).toEqual(['natural', '-', 'flat', 'natural', 'natural', 'natural', 'sharp', '-', 'sharp', 'natural', '-']);
    expect(neu.ties).toBe(1);

    const minorOld = await inspect(page, await draw(page, S.accMinor));
    expect(minorOld.accs).toEqual(['sharp', '-', 'sharp', '-', 'sharp', '-']);
    const minor = await inspect(page, await draw(page, v2(S.accMinor)));
    expect(minor.accs).toEqual(['sharp', '-', '-', 'natural', 'sharp', '-']);
  });

  test('4. ties single notes and two-note chords when the pitches match, also over a system break', async ({ app }) => {
    const page = await open(app);
    const old = await inspect(page, await draw(page, S.ties));
    expect(old.ties).toBe(2); // the E5 tie and a tie drawn from C5 to D5; the chord is not tied
    const neu = await inspect(page, await draw(page, v2(S.ties)));
    expect(neu.ties).toBe(3); // E5, and one per chord note; C5 to D5 is no tie
    expect(neu.tiedHeads).toBe(3);
    // rh: the unmatched D5 is drawn and played as a note (+1); lh: the tied chord is held, not struck again (-2)
    expect(neu.groups).toBe(old.groups - 1);

    const brOld = await inspect(page, await draw(page, S.tieBreak, TIE_BREAK_LAYOUT));
    expect(brOld.clefs).toBe(4); // two systems
    expect(brOld.ties).toBe(2);
    const br = await inspect(page, await draw(page, v2(S.tieBreak), TIE_BREAK_LAYOUT));
    expect(br.clefs).toBe(4);
    expect(br.ties).toBe(6); // two arcs for each of the three tied notes
  });

  test('5. note names come from the written spelling', async ({ app }) => {
    const page = await open(app);
    const old = await inspect(page, await draw(page, S.names, LAYOUT, true));
    expect(old.names).toEqual(['E', 'F', 'C#', 'C']);
    const neu = await inspect(page, await draw(page, v2(S.names), LAYOUT, true));
    expect(neu.names).toEqual(['Fb', 'E#', 'Db', 'C']);
  });

  test('6. accidentals on sixteenths do not collide with noteheads or each other', async ({ app }) => {
    const page = await open(app);
    const old = await boxes(page, await draw(page, S.spacing));
    const clash = (b) => b.accs.some((a) => b.heads.some((h) => overlap(a, h))) || b.accs.some((a, i) => b.accs.some((c, j) => i < j && overlap(a, c)));
    expect(clash(old)).toBe(true);
    const neu = await boxes(page, await draw(page, v2(S.spacing)));
    // C# D# E# F#, then (C# E#) held, (Eb G#), (F# held, A#), Bb
    expect(neu.accs.length).toBe(8);
    expect(clash(neu)).toBe(false);
  });

  test('quarters, halves and on-beat eighth pairs in 4/4 draw identically with and without the flag', async ({ app }) => {
    const page = await open(app);
    for (const names of [false, true]) {
      const a = await draw(page, S.plain, LAYOUT, names);
      const b = await draw(page, v2(S.plain), LAYOUT, names);
      expect(b).toBe(a);
      const c = await draw(page, S.plain, undefined, names);
      const d = await draw(page, v2(S.plain), undefined, names);
      expect(d).toBe(c);
    }
  });
});
