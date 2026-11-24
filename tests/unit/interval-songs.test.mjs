import { describe, expect, it } from 'vitest';
import { INTERVAL_SONGS, intervalSongNotes, intervalSongTitle } from '../../src/domain/interval-songs.ts';

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
    expect(notes.slice(0, 2).map(({ midi, velocity }) => [midi, velocity])).toEqual([[62, 124], [61, 124]]);
    expect(notes.slice(2).every(note => note.velocity === 59)).toBe(true);
    expect(notes.map(({ at, duration }) => [at, duration])).toEqual(song.notes.map(([, at, duration]) => [at, duration]));
  });

  it('follows the upper melody of Clair de lune and joins tied notes', () => {
    const song = INTERVAL_SONGS[3].desc.find(({ title }) => title.startsWith('Clair de lune'));
    const notes = intervalSongNotes(68, song);
    expect(notes.map(({ midi }) => midi)).toEqual([68, 65, 63, 65, 63, 61, 63, 61]);
    expect(notes.slice(0, 3).map(({ at, duration }) => [at, duration])).toEqual([
      [0, 1.6], [1.6, 1.6], [3.2, 0.4],
    ]);
  });

  it('returns to the fifth at the end of the first Kumbaya phrase', () => {
    const song = INTERVAL_SONGS[4].asc.find(({ title }) => title === 'Kumbaya');
    expect(intervalSongNotes(60, song).map(({ midi }) => midi)).toEqual([60, 64, 67, 67, 67, 69, 69, 67]);
  });

  it('localizes song opening titles cleanly with no Romanian leftovers in English', () => {
    const langs = ['en', 'ro', 'de', 'es', 'fr', 'it', 'pt-BR'];
    const roMarkers = /\b(?:introducere|strofă|refren|Zborul|Marșul|Lacul lebedelor|Dansul ungar|tema originală|solo de chitară|repriza pentru pian)\b/;
    for (const [interval, groups] of Object.entries(INTERVAL_SONGS)) {
      for (const songs of Object.values(groups)) {
        for (const song of songs) {
          expect(intervalSongTitle(song, 'en'), `${interval}:${song.title}`).not.toMatch(roMarkers);
          for (const lg of langs) {
            expect(intervalSongTitle(song, lg).trim().length, `${interval}:${song.title}:${lg}`).toBeGreaterThan(0);
          }
        }
      }
    }
    const flight = INTERVAL_SONGS[1].desc.find(({ source }) => source.includes('Flight_of_the_Bumblebee'));
    expect(intervalSongTitle(flight, 'en')).toBe('Flight of the Bumblebee — Rimsky-Korsakov');
    expect(intervalSongTitle(flight, 'ro')).toBe('Zborul bondarului — Rimski-Korsakov');
    expect(intervalSongTitle(flight, 'fr')).toBe('Le Vol du bourdon — Rimski-Korsakov');
  });
});
