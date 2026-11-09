import { afterEach, describe, expect, it, vi } from 'vitest';
import { scoreOctaveMark, scoreStructuralMarks } from '../../src/domain/score-svg-markings.ts';
import { recognizeScoreMarkings } from '../../src/domain/score-markings.ts';

class TestElement {
  constructor(textContent = '', children = {}) { this.textContent = textContent; this.children = children; }
  querySelectorAll(selector) { return this.children[selector] ?? []; }
}
const sheet = measure => ({ MusicPages: [{ MusicSystems: [{ StaffLines: [{ Measures: [measure] }] }] }] });
afterEach(() => vi.unstubAllGlobals());

describe('OSMD SVG semantic boundary', () => {
  it('uses the vendor repetition type, not glyph proportions or the word C', () => {
    vi.stubGlobal('Element', TestElement);
    const segno = new TestElement(), jump = new TestElement('D.S. al'), rehearsal = new TestElement('C');
    const root = new TestElement('', { '.vf-repetition': [segno, jump], '.vf-stavesection': [rehearsal] });
    expect(scoreStructuralMarks(sheet({ svgGElement: root, vfRepetitionWords: [{ symbol_type: 4 }, { symbol_type: 10 }], stave: { modifiers: [{ attrs: { type: 'StaveSection' }, section: 'C' }] } }))).toEqual([
      { element: segno, kind: 'segno', value: '' },
      { element: jump, kind: 'dalsegno_coda', value: '' },
      { element: rehearsal, kind: 'rehearsal', value: 'C' },
    ]);
  });
  it('does not mislabel SVG groups when source and rendered counts differ', () => {
    vi.stubGlobal('Element', TestElement);
    const root = new TestElement('', { '.vf-repetition': [new TestElement(), new TestElement()], '.vf-stavebarline': [new TestElement()] });
    expect(scoreStructuralMarks(sheet({ svgGElement: root, vfRepetitionWords: [{ symbol_type: 4 }], stave: { modifiers: [{ attrs: { type: 'Barline' }, type: 4 }, { attrs: { type: 'Barline' }, type: 5 }] } }))).toEqual([]);
  });
  it('ignores unprinted NONE barlines and retains the visible repeat direction', () => {
    vi.stubGlobal('Element', TestElement);
    const end = new TestElement(), root = new TestElement('', { '.vf-stavebarline': [end] });
    expect(scoreStructuralMarks(sheet({ svgGElement: root, stave: { modifiers: [{ attrs: { type: 'Barline' }, type: 7 }, { attrs: { type: 'Barline' }, type: 5 }] } }))).toEqual([{ element: end, kind: 'repeat_end', value: '' }]);
  });
  it('reconstructs a dotted metronome from native source fields, not the numeric SVG text', () => {
    vi.stubGlobal('Element', TestElement);
    // Actual OSMD 2.3 StaveTempo shape: the beat and dot render as paths.
    const element = new TestElement(' = 57.5');
    const root = new TestElement('', { '.vf-stavetempo': [element] });
    const measure = { svgGElement: root, stave: { modifiers: [
      { attrs: { type: 'StaveTempo' }, tempo: { duration: 'q', dots: 1, bpm: 57.5 } },
    ] } };
    const marks = scoreStructuralMarks(sheet(measure));
    expect(marks).toEqual([{ element, kind: 'text', value: '♩. = 57.5' }]);
    expect(recognizeScoreMarkings(marks[0].value)).toMatchObject([{ key: 'sym_metro', params: ['57.5'] }]);
    // Repeated traversal of a shared graphical measure must not duplicate bindings.
    const repeated = sheet(measure);
    repeated.MusicPages[0].MusicSystems[0].StaffLines[0].Measures.push(measure);
    expect(scoreStructuralMarks(repeated)).toEqual(marks);
  });
  it.each([
    ['w', '\u{1D15D}'], ['h', '\u{1D15E}'], ['q', '♩'], ['8', '♪'],
    ['16', '\u{1D161}'], ['32', '\u{1D162}'], ['64', '\u{1D163}'], ['128', '\u{1D164}'],
  ])('binds the native %s beat without substituting a quarter note', (duration, glyph) => {
    vi.stubGlobal('Element', TestElement);
    const element = new TestElement(' = 60');
    const marks = scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': [element] }),
      stave: { modifiers: [{ attrs: { type: 'StaveTempo' }, tempo: { duration, bpm: 60 } }] },
    }));
    expect(marks).toEqual([{ element, kind: 'text', value: `${glyph} = 60` }]);
    expect(recognizeScoreMarkings(marks[0].value)).toMatchObject([{ key: 'sym_metro', params: ['60'] }]);
  });
  it.each(['57.50', '57,5', '60–72', '60 - 72.5', '57,5 – 60,5'])('preserves the source BPM string %s', bpm => {
    vi.stubGlobal('Element', TestElement);
    const element = new TestElement(' = 999');
    const marks = scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': [element] }),
      stave: { modifiers: [{ attrs: { type: 'StaveTempo' }, tempo: { duration: 'q', dots: 0, bpm } }] },
    }));
    expect(marks).toEqual([{ element, kind: 'text', value: `♩ = ${bpm}` }]);
    expect(recognizeScoreMarkings(marks[0].value)).toMatchObject([{ key: 'sym_metro', params: [bpm] }]);
  });
  it('preserves a combined literal tempo name and metronome meaning', () => {
    vi.stubGlobal('Element', TestElement);
    const element = new TestElement('Allegro ( = 120)');
    const marks = scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': [element] }),
      stave: { modifiers: [{ attrs: { type: 'StaveTempo' }, tempo: { name: 'Allegro', duration: 'q', bpm: 120 } }] },
    }));
    expect(marks).toEqual([{ element, kind: 'text', value: 'Allegro (♩ = 120)' }]);
    expect(recognizeScoreMarkings(marks[0].value).map(mark => mark.key)).toEqual(['sym_t_allegro', 'sym_metro']);
  });
  it.each([[1, 2], [2, 1], [1, 0], [0, 1]])('rejects metronome count mismatch (%i SVG, %i source)', (rendered, sources) => {
    vi.stubGlobal('Element', TestElement);
    expect(scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': Array.from({ length: rendered }, () => new TestElement(' = 60')) }),
      stave: { modifiers: Array.from({ length: sources }, () => ({ attrs: { type: 'StaveTempo' }, tempo: { duration: 'q', bpm: 60 } })) },
    }))).toEqual([]);
  });
  it('keeps unsupported tempo sources in order rather than shifting a later binding', () => {
    vi.stubGlobal('Element', TestElement);
    const equation = new TestElement(' = '), valid = new TestElement(' = 72');
    expect(scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': [equation, valid] }),
      stave: { modifiers: [
        { attrs: { type: 'StaveTempo' }, tempo: { noteEquation: { left: {}, right: {} }, duration: 'q', bpm: 60 } },
        { attrs: { type: 'StaveText' }, tempo: { duration: 'q', bpm: 100 } },
        { attrs: { type: 'StaveTempo' }, tempo: { duration: 'h', dots: 1, bpm: 72 } },
      ] },
    }))).toEqual([{ element: valid, kind: 'text', value: '\u{1D15E}. = 72' }]);
  });
  it.each([
    undefined, {}, { bpm: 60 }, { duration: 'quarter', bpm: 60 }, { duration: '1/2', bpm: 60 },
    { duration: '__proto__', bpm: 60 }, { duration: 'q', bpm: 0 }, { duration: 'q', bpm: NaN },
    { duration: 'q', bpm: Infinity }, { duration: 'q', bpm: true }, { duration: 'q', bpm: '60 unknown' },
    { duration: 'q', bpm: '60-0' }, { duration: 'q', bpm: 60, dots: 2 }, { duration: 'q', bpm: 60, dots: -1 },
  ])('does not invent metronome meaning from unsupported source %j', tempo => {
    vi.stubGlobal('Element', TestElement);
    expect(scoreStructuralMarks(sheet({
      svgGElement: new TestElement('', { '.vf-stavetempo': [new TestElement('♩ = 60')] }),
      stave: { modifiers: [{ attrs: { type: 'StaveTempo' }, tempo }] },
    }))).toEqual([]);
  });
  it.each([['8 va', 'ottava'], ['8vb', 'ottavabassa'], ['8bassa', 'ottavabassa'], ['unknown', null]])('identifies the printed octave direction %s', (text, expected) => {
    expect(scoreOctaveMark(new TestElement(text))).toBe(expected);
  });
});
