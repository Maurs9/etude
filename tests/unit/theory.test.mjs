import { describe, expect, it } from 'vitest';
import { anDiatonic, anIntervalName, anKeyRank, analysisFunction, CHORD_TEMPLATES, circleKeyPitchClass, chordDegreeMap, chordInversion, chordPitches, formatChordFormula, formatScaleFormula, identifyChord, intervalOctave, keyFifths, keyFromFifths, midiToFrequency, normalizeSemitones, pitchClass, practiceTonicMidi, PROGRESSION_TEMPLATES, readingSpelling, romanFor, samePitchSet, scalePitches, SCALE_DEFINITIONS, scorePitchXml, spellMidi, transposePitchClass } from '../../src/domain/theory.ts';

describe('pure theory helpers', () => {
  it('preserves the selected tonic in both practice registers', () => {
    for (let key = 0; key < 12; key++) {
      expect(practiceTonicMidi(key)).toBe(60 + key);
      expect(practiceTonicMidi(key, 'near-middle-c')).toBe((key < 6 ? 60 : 48) + key);
    }
    expect(practiceTonicMidi(-1, 'near-middle-c')).toBe(59);
  });

  it('normalizes and transposes pitch classes across octaves', () => {
    expect(normalizeSemitones(-1)).toBe(11);
    expect(transposePitchClass(11, 2)).toBe(1);
    expect(intervalOctave(25)).toEqual({ octave: 2, class: 1 });
  });

  it('builds scales and deduplicated chord pitch sets', () => {
    expect(scalePitches(0, [0, 4, 7])).toEqual([0, 4, 7]);
    expect(chordPitches(11, [0, 4, 7, 12])).toEqual([3, 6, 11]);
    expect(samePitchSet([0, 12, 7], [7, 0])).toBe(true);
    expect(samePitchSet([0, 4], [0, 5])).toBe(false);
  });

  it('identifies chords without browser state', () => {
    const chords = [
      { idx: 0, symbol: 'maj', pcset: [0, 4, 7] },
      { idx: 1, symbol: 'm', pcset: [0, 3, 7] },
    ];
    const result = identifyChord([64, 67, 72], chords);
    expect(result?.chord.symbol).toBe('maj');
    expect(result?.rootPc).toBe(0);
    expect(chordInversion(0, chords[0], 64)).toBe(1);
  });

  it('keeps pitch and formula formatting browser-independent', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(pitchClass(-1)).toBe(11);
    expect(formatChordFormula([0, 4, 7, 14])).toBe('1 3 5 9');
    expect(formatScaleFormula([0, 2, 4, 7])).toBe('1 2 3 5');
  });

  it('owns key spelling, analysis helpers, and chord labels', () => {
    expect(keyFifths(7, false)).toBe(1);
    expect(keyFromFifths(1, false)).toMatchObject({ root: 7, minor: false });
    expect(spellMidi(61, -1, false)).toMatchObject({ li: 1, acc: -1 });
    expect(anIntervalName(14)).toBe('Major 2nd (+1 oct)');
    expect(chordDegreeMap([60, 64, 67], 0, [0, 4, 7]).get(64)).toBe('3');
    expect(romanFor(0, { rootPc: 7, chord: { symbol: '7', pcset: [0, 4, 7, 10] } })).toBe('V⁷');
  });

  it('spells altered degrees in context and identifies extensions in chord-tone order', () => {
    expect(spellMidi(66, -2, true)).toEqual({ li: 3, acc: 1, oct: 4 });
    const chord = symbol => CHORD_TEMPLATES.find(template => template.symbol === symbol);
    expect(chordInversion(0, chord('9'), 64)).toBe(1);
    const roman = (rootPc, symbol = 'maj') => romanFor(0, { rootPc, chord: chord(symbol) });
    expect([1, 3, 6, 8, 10].map(root => roman(root))).toEqual(['♭II', '♭III', '♯IV', '♭VI', '♭VII']);
    expect(roman(2, 'm7♭5')).toBe('iiø⁷');
    expect(roman(11, 'dim7')).toBe('vii°⁷');
  });

  it('ranks keys and provides diatonic harmony without browser dependencies', () => {
    const notes = [0, 4, 7].map((midi, index) => ({ midi: 60 + midi, start: index, end: index + 1 }));
    expect(anKeyRank(notes)[0]).toHaveProperty('root');
    expect(anDiatonic({ root: 0, minor: false, fifths: 0 })).toHaveLength(8);
  });

  it('keeps extracted exercise definitions and score helpers in the theory domain', () => {
    expect(SCALE_DEFINITIONS['Major (Ionian)']).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(CHORD_TEMPLATES.find(chord => chord.symbol === 'maj')?.pcset).toEqual([0, 4, 7]);
    expect(PROGRESSION_TEMPLATES[0].name).toBe('I–IV–V');
    expect(circleKeyPitchClass(-1)).toBe(5);
    expect(readingSpelling(61, -1)).toMatchObject({ li: 1, acc: -1 });
    expect(analysisFunction({ root: 0, minor: false }, 7, 'V')).toBe('D');
    expect(scorePitchXml(61, -1, false)).toContain('<step>D</step><alter>-1</alter>');
    expect(spellMidi(79, 5, true)).toMatchObject({ li: 3, acc: 2 });
    expect(readingSpelling(65, 6)).toMatchObject({ li: 2, acc: 1, oct: 4 });
    expect(readingSpelling(71, -6)).toMatchObject({ li: 0, acc: -1, oct: 5 });
    expect(formatScaleFormula(SCALE_DEFINITIONS.Locrian)).toBe('1 ♭2 ♭3 4 ♭5 ♭6 ♭7');
    expect(formatScaleFormula(SCALE_DEFINITIONS['Whole tone'])).toBe('1 2 3 ♯4 ♯5 ♯6');
    expect(formatChordFormula([0, 3, 6, 9])).toBe('1 ♭3 ♭5 𝄫7');
    expect(anIntervalName(0)).toBe('Unison');
    expect(anIntervalName(-5)).toBe(anIntervalName(5));
  });

  it('identifies Neapolitan and major-key modal mixture functions without shifting minor diatonics', () => {
    expect(analysisFunction({ root: 0, minor: false }, 1, '♭II⁶')).toBe('neap');
    expect(analysisFunction({ root: 0, minor: false }, 10, '♭VII')).toBe('mix');
    expect(analysisFunction({ root: 0, minor: false }, 8, '♭VI')).toBe('mix');
    expect(analysisFunction({ root: 0, minor: false }, 5, 'iv')).toBe('mix');
    expect(analysisFunction({ root: 0, minor: false }, 2, 'ii°')).toBe('mix');
    expect(analysisFunction({ root: 0, minor: false }, 4, '♭III')).toBe('mix');
    expect(analysisFunction({ root: 0, minor: false }, 7, 'V/IV')).toBe('sec');
    expect(analysisFunction({ root: 0, minor: true }, 2, 'ii°')).toBe('S');
    expect(analysisFunction({ root: 0, minor: true }, 8, 'VI')).toBe('T');
  });
});
