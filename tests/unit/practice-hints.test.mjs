import { describe, expect, it } from 'vitest';
import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS,
  chordHintFormula, chordHintSteps, progressionHintChords, progressionHintSteps, scaleHintFormula, scaleHintSteps,
  techniqueHintSteps, techniqueHintTonic,
} from '../../src/domain/practice-hints.ts';
import { CHORD_TEMPLATES, PROGRESSION_TEMPLATES, SCALE_DEFINITIONS, TWELVE_BAR_BLUES_ROOTS, pitchClass } from '../../src/domain/theory.ts';
import { STRINGS } from '../../src/locales/index.js';

const byName = (hints, name) => hints.find(hint => hint.name === name);
const notes = steps => steps.map(step => step.notes.map(note => note.midi));

describe('Practice hint catalog', () => {
  it('covers the theory catalog exactly once and supplies localized cues and labels', () => {
    expect(CHORD_HINTS.map(hint => hint.symbol).sort()).toEqual(CHORD_TEMPLATES.map(chord => chord.symbol).sort());
    expect(SCALE_HINTS.map(hint => hint.name).sort()).toEqual(Object.keys(SCALE_DEFINITIONS).sort());
    expect(PROGRESSION_HINTS.map(hint => hint.name).sort()).toEqual(PROGRESSION_TEMPLATES.map(prog => prog.name).sort());
    expect(new Set(TECHNIQUE_HINTS.map(hint => hint.id)).size).toBe(6);
    const keys = [
      ...CHORD_HINTS.map(hint => `c_${hint.cue}`),
      ...SCALE_HINTS.map(hint => `s_${hint.cue}`),
      ...PROGRESSION_HINTS.flatMap(hint => [`p_${hint.cue}`, `p_${hint.cue}_title`]),
      ...TECHNIQUE_HINTS.flatMap(hint => [`t_${hint.id}`, `t_${hint.id}_title`]),
      ...['chord', 'scale', 'prog', 'technique', 'melody'].flatMap(topic => [`${topic}_title`, `${topic}_lede`]),
      'hear', 'show_keys', 'compare', 'melody_cue',
    ];
    for (const [lang, copy] of Object.entries(STRINGS)) {
      for (const key of keys) expect(copy[`pr_hints_${key}`], `${lang}: ${key}`).toBeTruthy();
    }
  });

  it('moves only the seventh in the maj7 comparison and spells the diminished seventh', () => {
    const maj7 = CHORD_HINTS.find(hint => hint.symbol === 'maj7');
    expect(notes(chordHintSteps(maj7, 2)).filter(step => step.length === 4)).toEqual([[62, 66, 69, 73], [62, 66, 69, 72]]);
    expect(chordHintFormula('dim7')).toBe('1 ♭3 ♭5 𝄫7');
  });

  it('isolates the sixth in the Dorian comparison and distinguishes ♭5 from ♯4', () => {
    const locrian = byName(SCALE_HINTS, 'Locrian');
    const lydian = byName(SCALE_HINTS, 'Lydian');
    expect(scaleHintFormula(locrian)).toBe('1 ♭2 ♭3 4 ♭5 ♭6 ♭7');
    expect(scaleHintFormula(lydian)).toBe('1 2 3 ♯4 5 6 7');
    expect(notes(scaleHintSteps(byName(SCALE_HINTS, 'Dorian'), 2)).slice(0, 7).flat()).toEqual([62, 69, 71, 72, 69, 70, 72]);
  });

  it('follows the demonstrated bass and plays all twelve measures of blues', () => {
    for (const hint of PROGRESSION_HINTS) {
      const chords = progressionHintChords(hint, 4);
      expect(hint.bass.map(offset => pitchClass(4 + offset)), hint.name).toEqual(chords.map(chord => chord.root));
    }
    const jazz = notes(progressionHintSteps(byName(PROGRESSION_HINTS, 'ii–V–I (jazz)'), 0));
    expect(jazz.slice(0, 3)).toEqual([[50], [43], [36]]);
    expect(jazz.slice(-2)).toEqual([[59, 65], [60, 64]]);
    const blues = notes(progressionHintSteps(byName(PROGRESSION_HINTS, '12-bar blues'), 2));
    expect(blues).toHaveLength(48);
    expect(blues.filter((_, i) => i % 4 === 0).map(beat => beat[0] - 50)).toEqual(TWELVE_BAR_BLUES_ROOTS);
  });

  it('uses the existing one-octave fingerings and falls back to an allowed tonic for each card', () => {
    const techniques = Object.fromEntries(TECHNIQUE_HINTS.map(hint => [hint.id, hint]));
    expect(techniqueHintSteps(techniques.major_common, 0, 'rh').fragment.map(note => [note.midi, note.finger])).toEqual([[64, 3], [65, 1]]);
    expect(techniqueHintSteps(techniques.major_f_b, 5, 'rh').ascending.map(note => note.finger).join('')).toBe('12341234');
    expect(techniqueHintSteps(techniques.major_f_b, 11, 'lh').ascending.map(note => note.finger).join('')).toBe('43214321');
    expect(techniqueHintSteps(techniques.harmonic, 5, 'rh').fragment.map(note => note.finger)).toEqual([2, 3]);
    expect(techniqueHintTonic(techniques.arp_major, 1)).toBe(0);
    expect(techniqueHintTonic(techniques.arp_minor, 1)).toBe(9);
    expect(techniqueHintSteps(techniques.arp_major, 2, 'lh').ascending.map(note => note.finger)).toEqual([5, 3, 2, 1]);
  });

  it('generates valid notes and durations in every supported key', () => {
    const steps = Array.from({ length: 12 }, (_, tonic) => [
      ...CHORD_HINTS.flatMap(hint => chordHintSteps(hint, tonic)),
      ...SCALE_HINTS.flatMap(hint => scaleHintSteps(hint, tonic)),
      ...PROGRESSION_HINTS.flatMap(hint => progressionHintSteps(hint, tonic)),
      ...TECHNIQUE_HINTS.flatMap(hint => ['lh', 'rh'].flatMap(hand => techniqueHintSteps(hint, techniqueHintTonic(hint, tonic), hand).steps)),
    ]).flat();
    expect(steps.every(step => step.seconds > 0 && step.gap >= 0 && step.notes.length &&
      step.notes.every(note => Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127))).toBe(true);
  });
});
