import type { InterfaceLanguage } from '../types/architecture.js';
import { SONG_OPENINGS } from './interval-song-openings.js';

export type IntervalSongDirection = 'asc' | 'desc';
export type SongOpeningNote = readonly [offset: number, at: number, duration: number];

export interface IntervalSong {
  readonly title: string;
  readonly titles?: Readonly<Partial<Record<InterfaceLanguage, string>>>;
  readonly source: string;
  readonly notes: readonly SongOpeningNote[];
}

export function intervalSongTitle(song: IntervalSong, lang: InterfaceLanguage): string {
  return song.titles?.[lang] ?? song.title;
}

export interface IntervalSongNote {
  readonly midi: number;
  readonly at: number;
  readonly duration: number;
  readonly velocity: number;
}

export const INTERVAL_SONGS: Readonly<Record<number, Readonly<Record<IntervalSongDirection, readonly IntervalSong[]>>>> = SONG_OPENINGS;

const INTERVAL_NOTE_VELOCITY = 124;
const CONTEXT_NOTE_VELOCITY = 59;

export function intervalSongNotes(root: number, song: IntervalSong): IntervalSongNote[] {
  return song.notes.map(([offset, at, duration], index) => ({
    midi: root + offset,
    at,
    duration,
    velocity: index < 2 ? INTERVAL_NOTE_VELOCITY : CONTEXT_NOTE_VELOCITY,
  }));
}
