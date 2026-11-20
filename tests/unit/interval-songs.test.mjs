import { describe, expect, it } from 'vitest';
import { INTERVAL_SONGS, intervalSongNotes } from '../../src/domain/interval-songs.ts';

describe('interval song openings', () => {
  it('uses the first two attacks of a short, monophonic excerpt in the named direction', () => {
    expect(Object.keys(INTERVAL_SONGS)).toHaveLength(12);
    const titles = new Set();
    for (const [interval, groups] of Object.entries(INTERVAL_SONGS)) {
      for (const [direction, songs] of Object.entries(groups)) {
        expect(songs.length).toBeGreaterThan(0);
        expect(songs.length).toBeLessThanOrEqual(5);
        for (const { title, source, notes } of songs) {
          expect(titles.has(title), title).toBe(false);
          titles.add(title);
          expect(source, title).toMatch(/^https:\/\//);
          expect(notes.length, title).toBeGreaterThanOrEqual(5);
          expect(notes.length, title).toBeLessThanOrEqual(8);
          expect(notes[0].slice(0, 2), title).toEqual([0, 0]);
          expect(notes[1][0], title).toBe(Number(interval) * (direction === 'desc' ? -1 : 1));
          notes.forEach(([pitch, at, duration], index) => {
            expect(Number.isInteger(pitch), title).toBe(true);
            expect(duration, title).toBeGreaterThan(0);
            if (index) {
              const [, previousAt, previousDuration] = notes[index - 1];
              expect(previousAt + previousDuration, title).toBeLessThanOrEqual(at + 0.002);
            }
          });
        }
      }
    }
  });

  it('transposes both directions from the first heard note and accents only the opening interval', () => {
    const song = INTERVAL_SONGS[1].desc[0];
    const notes = intervalSongNotes(62, song);
    expect(notes.slice(0, 2).map(({ midi, velocity }) => [midi, velocity])).toEqual([[62, 110], [61, 110]]);
    expect(notes.slice(2).every(note => note.velocity === 78)).toBe(true);
    expect(notes.map(({ at, duration }) => [at, duration])).toEqual(song.notes.map(([, at, duration]) => [at, duration]));
  });
});
