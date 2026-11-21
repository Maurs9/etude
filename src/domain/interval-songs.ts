import { SONG_OPENINGS } from './interval-song-openings.js';

export type IntervalSongDirection = 'asc' | 'desc';
export type SongOpeningNote = readonly [offset: number, at: number, duration: number];

export interface IntervalSong {
  readonly title: string;
  readonly source: string;
  readonly notes: readonly SongOpeningNote[];
}

export interface IntervalSongNote {
  readonly midi: number;
  readonly at: number;
  readonly duration: number;
  readonly velocity: number;
}

export const INTERVAL_SONGS: Readonly<Record<number, Readonly<Record<IntervalSongDirection, readonly IntervalSong[]>>>> = SONG_OPENINGS;

export function intervalSongNotes(root: number, song: IntervalSong): IntervalSongNote[] {
  return song.notes.map(([offset, at, duration], index) => ({
    midi: root + offset,
    at,
    duration,
    velocity: index < 2 ? 110 : 78,
  }));
}
