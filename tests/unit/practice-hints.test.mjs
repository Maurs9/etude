import { describe, expect, it } from 'vitest';
import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS, MELODY_HINTS, PRACTICE_HINT_REFERENCES,
  chordHintFormula, chordHintSteps, chordHintTones, melodyHintExample, progressionHintChords, progressionHintResolution, progressionHintSteps, progressionHintVoicings, scaleHintFormula, scaleHintSteps, scaleHintTones,
  techniqueHintSteps, techniqueHintTonic,
} from '../../src/domain/practice-hints.ts';
import { CHORD_TEMPLATES, PROGRESSION_TEMPLATES, SCALE_DEFINITIONS, TWELVE_BAR_BLUES_ROOTS, pitchClass, practiceTonicMidi } from '../../src/domain/theory.ts';
import { PIECES } from '../../src/domain/repertoire-data.ts';
import { ssMidiOf, ssStepOf } from '../../src/domain/score-types.ts';
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
      ...SCALE_HINTS.map(hint => `s_${hint.cue}`),
      ...PROGRESSION_HINTS.flatMap(hint => [`p_${hint.cue}`, `p_${hint.cue}_title`]),
      ...TECHNIQUE_HINTS.flatMap(hint => [`t_${hint.id}`, `t_${hint.id}_title`]),
      ...['chord', 'scale', 'prog', 'technique', 'melody'].flatMap(topic => [`${topic}_title`, `${topic}_lede`]),
      'show_keys', 'compare', 'melody_cue', 'melody_example', 'melody_show_notes', 'melody_hide_notes',
      'chord_group_triads', 'chord_group_sixths_sevenths', 'chord_group_extensions', 'chord_keyboard', 'chord_staff',
      'prog_chord_bass', 'prog_bar', 'prog_hear', 'prog_hear_bass', 'prog_hear_resolution',
      'technique_up', 'technique_down', 'technique_hear_passage', 'technique_hear_run',
    ];
    for (const [lang, copy] of Object.entries(STRINGS)) {
      for (const key of keys) expect(copy[`pr_hints_${key}`], `${lang}: ${key}`).toBeTruthy();
    }
  });

  it('spells 25 chords in every tonic and keeps the written octaves and MIDI voicing in agreement', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const root = practiceTonicMidi(tonic, 'near-middle-c');
      for (const template of CHORD_TEMPLATES) {
        const tones = chordHintTones(template.symbol, tonic);
        expect(tones.map(note => ssMidiOf(note.li, note.oct, note.acc))).toEqual(template.intervals.map(interval => root + interval));
        expect(tones.map(note => ssStepOf(note.li, note.oct) - ssStepOf(tones[0].li, tones[0].oct))).toEqual(tones.map(note => note.degree - 1));
        expect(tones.every(note => Math.abs(note.acc) <= 2)).toBe(true);
      }
    }
    expect(chordHintTones('dim7', 0).at(-1)).toMatchObject({ li: 6, acc: -2, oct: 4, midi: 69 });
    expect(chordHintTones('7♭5', 0)[2]).toMatchObject({ li: 4, acc: -1, oct: 4, midi: 66 });
    expect(chordHintTones('7♯9', 0).at(-1)).toMatchObject({ li: 1, acc: 1, oct: 5, midi: 75 });
    expect(chordHintTones('13', 5).at(-1)).toMatchObject({ li: 1, acc: 0, oct: 6, midi: 86 });
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

  it('uses the same transposed octave for scale diagrams and their playback', () => {
    for (const hint of SCALE_HINTS) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const root = practiceTonicMidi(tonic, 'near-middle-c');
        const tones = scaleHintTones(hint.name, tonic);
        expect(tones.map(tone => ssMidiOf(tone.li, tone.oct, tone.acc))).toEqual(
          [...SCALE_DEFINITIONS[hint.name], 12].map(offset => root + offset));
        expect(tones.filter(tone => tone.tonic).map(tone => tone.midi)).toEqual([root, root + 12]);
        expect(tones.every(tone => Math.abs(tone.acc) <= 2)).toBe(true);
      }
    }
    const harmonic = scaleHintTones('Harmonic minor', 2);
    expect(harmonic[6]).toMatchObject({ li: 0, acc: 1, midi: 73 });
  });

  it('follows the demonstrated bass and plays all twelve measures of blues', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const hint of PROGRESSION_HINTS) {
        const voicings = progressionHintVoicings(hint, tonic);
        const chords = progressionHintChords(hint, tonic);
        expect(voicings.map(({ bass }) => pitchClass(bass.midi)), hint.name).toEqual(chords.map(chord => chord.root));
        for (const [i, voicing] of voicings.entries()) {
          const written = [voicing.bass, ...voicing.upper];
          expect(written.map(note => ssMidiOf(note.li, note.oct, note.acc))).toEqual(written.map(note => note.midi));
          expect(written[1].midi).toBeGreaterThan(written[0].midi);
          expect(notes(progressionHintSteps(hint, tonic, i))).toEqual([written.map(note => note.midi)]);
          expect(written.every(note => Math.abs(note.acc) <= 2)).toBe(true);
        }
      }
    }
    const jazzSteps = progressionHintSteps(byName(PROGRESSION_HINTS, 'ii–V–I (jazz)'), 0);
    const jazz = notes(jazzSteps);
    expect(jazz.slice(0, 3)).toEqual([[50], [43], [36]]);
    expect(jazz.slice(-2)).toEqual([[59, 65], [60, 64]]);
    expect(jazzSteps.map(step => step.diagramKey)).toEqual(['0', '1', '2', '0', '1', '2', undefined, undefined]);
    const cadence = byName(PROGRESSION_HINTS, 'ii–V–I (jazz)');
    expect(notes(progressionHintSteps(cadence, 0, 'full'))).toEqual([[50, 62, 65, 69, 72], [43, 67, 71, 74, 77], [36, 60, 64, 67, 71]]);
    expect(notes(progressionHintSteps(cadence, 0, 'bass'))).toEqual([[50], [43], [36]]);
    expect(notes(progressionHintSteps(cadence, 0, 'resolution'))).toEqual([[59, 65], [60, 64]]);
    const minorCadence = byName(PROGRESSION_HINTS, 'minor ii–V–i');
    expect(notes(progressionHintSteps(minorCadence, 2, 'resolution'))).toEqual([[61, 67], [62, 65]]);
    expect(progressionHintResolution(minorCadence, 8)[0][0]).toMatchObject({ li: 3, acc: 2, midi: 67 });
    const bluesSteps = progressionHintSteps(byName(PROGRESSION_HINTS, '12-bar blues'), 2);
    const blues = notes(bluesSteps);
    expect(blues).toHaveLength(48);
    expect(blues.filter((_, i) => i % 4 === 0).map(beat => beat[0] - 50)).toEqual(TWELVE_BAR_BLUES_ROOTS);
    expect(bluesSteps.map(step => step.diagramKey)).toEqual(
      TWELVE_BAR_BLUES_ROOTS.flatMap((_, i) => Array(4).fill(String(i))));
  });

  it('uses the existing one-octave fingerings and falls back to an allowed tonic for each card', () => {
    const techniques = Object.fromEntries(TECHNIQUE_HINTS.map(hint => [hint.id, hint]));
    const cMajor = techniqueHintSteps(techniques.major_common, 0, 'rh');
    expect(cMajor.fragment.map(note => [note.midi, note.finger])).toEqual([[64, 3], [65, 1]]);
    expect(notes(cMajor.fragmentSteps)).toEqual([[64], [65], [64], [65]]);
    expect(cMajor.fragmentSteps.map(step => step.diagramKey)).toEqual(['2', '3', '2', '3']);
    expect(notes(cMajor.runSteps).flat()).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
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
      ...TECHNIQUE_HINTS.flatMap(hint => ['lh', 'rh'].flatMap(hand => {
        const { fragmentSteps, runSteps } = techniqueHintSteps(hint, techniqueHintTonic(hint, tonic), hand);
        return [...fragmentSteps, ...runSteps];
      })),
    ]).flat();
    expect(steps.every(step => step.seconds > 0 && step.gap >= 0 && step.notes.length &&
      step.notes.every(note => Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127))).toBe(true);
  });

  it('keeps melody playback and notation in sync, including repeated notes', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const hint of MELODY_HINTS) {
        const { notes: melody, steps } = melodyHintExample(hint, tonic);
        const written = melody.map(note => ssMidiOf(note.li, note.oct, note.acc));
        expect(notes(steps).flat()).toEqual(written);
        expect(melody.reduce((beats, note) => beats + note.beats, 0)).toBe(4);
        expect(steps.map(step => step.diagramKey)).toEqual(melody.map((_, index) => String(index)));
      }
    }
  });

  it('attaches translated references to existing cards and opens only bundled excerpts', () => {
    const ids = [
      ...CHORD_HINTS.map(hint => `chord:${hint.symbol}`),
      ...SCALE_HINTS.map(hint => `scale:${hint.name}`),
      ...PROGRESSION_HINTS.map(hint => `prog:${hint.name}`),
      ...TECHNIQUE_HINTS.map(hint => `technique:${hint.id}`),
    ];
    for (const [id, reference] of Object.entries(PRACTICE_HINT_REFERENCES)) {
      expect(ids).toContain(id);
      if (reference.example) expect(PIECES.some(piece => piece.id === reference.example)).toBe(true);
      for (const copy of Object.values(STRINGS)) expect(copy[`pr_hints_ref_${reference.cue}`]).toBeTruthy();
    }
  });
});
