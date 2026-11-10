import { describe, expect, it } from 'vitest';
import {
  ARPEGGIO_TONICS, SCALE_FINGERINGS, techniqueGrade, techniqueKeyAllowed, techniqueNoteOn, techniqueSpecKey,
  techniqueSpellDegree, techniqueStart, techniqueSteps,
} from '../../src/domain/technique.ts';

const fingers = (steps, hand) => steps.map((step) => step.notes.find((note) => note.hand === hand).finger).join('');
const midis = (steps, hand) => steps.map((step) => step.notes.find((note) => note.hand === hand).midi);
const LETTERS = 'CDEFGAB';
const spelled = (kind, tonicPc, degree) => {
  const { letter, acc } = techniqueSpellDegree(kind, tonicPc, degree);
  return LETTERS[letter] + (acc === 2 ? '##' : acc === 1 ? '#' : acc === -1 ? 'b' : acc === -2 ? 'bb' : '');
};

// Plays every step at `gap` ms intervals (hands together: both notes at once), with optional per-step jitter.
function play(run, gap, jitter = () => 0) {
  run.steps.forEach((step, index) => step.notes.forEach((note) => techniqueNoteOn(run, note.midi, index * gap + jitter(index))));
  return run;
}

describe('technique exercises', () => {
  it('builds a one-octave C major scale up and down with the circle-of-fifths fingering', () => {
    const steps = techniqueSteps({ kind: 'major', tonicPc: 0, octaves: 1, hands: 'rh' });
    expect(midis(steps, 'rh')).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
    expect(fingers(steps, 'rh')).toBe('123123454321321');
    expect(SCALE_FINGERINGS.maj.rh[0]).toBe('12312345');
  });

  it('extends fingerings to two octaves the way method books do', () => {
    const c = techniqueSteps({ kind: 'major', tonicPc: 0, octaves: 2, hands: 'both' });
    expect(c).toHaveLength(29);
    expect(fingers(c.slice(0, 15), 'rh')).toBe('123123412312345');
    expect(fingers(c.slice(0, 15), 'lh')).toBe('543213214321321');
    expect(midis(c, 'lh').slice(0, 15)).toEqual(midis(c, 'rh').slice(0, 15).map((midi) => midi - 12));
    const dFlat = techniqueSteps({ kind: 'major', tonicPc: 1, octaves: 2, hands: 'both' }).slice(0, 15);
    expect(fingers(dFlat, 'rh')).toBe('231234123123412');
    expect(fingers(dFlat, 'lh')).toBe('321432132143213');
    const f = techniqueSteps({ kind: 'major', tonicPc: 5, octaves: 2, hands: 'rh' }).slice(0, 15);
    expect(fingers(f, 'rh')).toBe('123412312341234');
  });

  it('uses the harmonic minor fingering and notes for minor scales', () => {
    const a = techniqueSteps({ kind: 'minor', tonicPc: 9, octaves: 1, hands: 'lh' }).slice(0, 8);
    expect(midis(a, 'lh')).toEqual([57, 59, 60, 62, 64, 65, 68, 69]);
    expect(fingers(a, 'lh')).toBe(SCALE_FINGERINGS.harmonic.lh[9]);
  });

  it('builds white-key arpeggios with 1 2 3 5 and 5 4 2 1', () => {
    const one = techniqueSteps({ kind: 'arpMinor', tonicPc: 9, octaves: 1, hands: 'both' });
    expect(midis(one, 'rh')).toEqual([69, 72, 76, 81, 76, 72, 69]);
    expect(fingers(one, 'rh')).toBe('1235321');
    expect(fingers(one, 'lh')).toBe('5421245');
    const two = techniqueSteps({ kind: 'arpMajor', tonicPc: 7, octaves: 2, hands: 'rh' });
    expect(midis(two, 'rh').slice(0, 7)).toEqual([67, 71, 74, 79, 83, 86, 91]);
    expect(fingers(two, 'rh')).toBe('1231235321321');
    expect(ARPEGGIO_TONICS.arpMajor.every((pc) => techniqueKeyAllowed('arpMajor', pc))).toBe(true);
    expect(techniqueKeyAllowed('arpMajor', 3)).toBe(false);
    expect(techniqueKeyAllowed('minor', 3)).toBe(true);
  });

  it('spells degrees on consecutive letters', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((degree) => spelled('minor', 8, degree))).toEqual(['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##']);
    expect([0, 1, 2, 3, 4, 5, 6].map((degree) => spelled('major', 6, degree))).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect([0, 1, 2].map((degree) => spelled('arpMajor', 5, degree))).toEqual(['F', 'A', 'C']);
    expect(spelled('major', 10, 3)).toBe('Eb');
  });

  it('names exercises stably', () => {
    expect(techniqueSpecKey({ kind: 'major', tonicPc: 2, octaves: 2, hands: 'both' })).toBe('major:2:2:both');
  });
});

describe('technique grading', () => {
  const spec = { kind: 'major', tonicPc: 0, octaves: 1, hands: 'rh' };

  it('grades an even, correct run as clean and steady', () => {
    const grade = techniqueGrade(play(techniqueStart(techniqueSteps(spec)), 250));
    expect(grade).toMatchObject({ notes: 15, wrong: 0, accuracy: 100, meanIoiMs: 250, spreadMs: 0, evenness: 'steady', clean: true, handSyncMs: null });
  });

  it('is not changed by a constant input latency', () => {
    const exact = techniqueGrade(play(techniqueStart(techniqueSteps(spec)), 250, (index) => [0, 12, -9, 20, 4][index % 5]));
    const late = techniqueGrade(play(techniqueStart(techniqueSteps(spec)), 250, (index) => 85 + [0, 12, -9, 20, 4][index % 5]));
    expect(late).toEqual(exact);
    expect(exact.spreadMs).toBeGreaterThan(0);
  });

  it('finds the uneven spot, such as a late thumb passing under', () => {
    // The thumb on F (step 3) arrives 150 ms late.
    const grade = techniqueGrade(play(techniqueStart(techniqueSteps(spec)), 250, (index) => (index === 3 ? 150 : 0)));
    expect(grade.worstStep).toBe(3);
    expect(grade.evenness).toBe('uneven');
    expect(grade.clean).toBe(false);
  });

  it('counts wrong notes and waits for the right one', () => {
    const run = techniqueStart(techniqueSteps(spec));
    expect(techniqueNoteOn(run, 60, 0)).toBe('step');
    expect(techniqueNoteOn(run, 63, 200)).toBe('wrong');
    expect(run.index).toBe(1);
    expect(techniqueNoteOn(run, 62, 250)).toBe('step');
    run.steps.slice(2).forEach((step, index) => techniqueNoteOn(run, step.notes[0].midi, (index + 2) * 250));
    const grade = techniqueGrade(run);
    expect(grade).toMatchObject({ wrong: 1, accuracy: 94, clean: false });
    expect(techniqueNoteOn(run, 60, 99999)).toBe('ignored');
  });

  it('pairs the hands and reports how far apart they play', () => {
    const run = techniqueStart(techniqueSteps({ ...spec, hands: 'both' }));
    expect(techniqueNoteOn(run, 60, 0)).toBe('partial');
    expect(techniqueNoteOn(run, 48, 30)).toBe('step');
    run.steps.slice(1).forEach((step, index) => {
      techniqueNoteOn(run, step.notes[0].midi, (index + 1) * 250);
      techniqueNoteOn(run, step.notes[1].midi, (index + 1) * 250 + 10);
    });
    const grade = techniqueGrade(run);
    expect(grade.notes).toBe(30);
    expect(grade.handSyncMs).toBe(Math.round((30 + 14 * 10) / 15));
    expect(grade.clean).toBe(true);
  });
});
