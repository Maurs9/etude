/** Private, device-local score library. Originals are stored separately from metadata. */
export interface LibraryResume {
  /** Optional expanded performance coordinate and active musical seconds; older saves use the written position. */
  performance?: number;
  elapsed?: number;
  recon?: { hands: string; grid: number; key: string };
  position: number;
  measure: string;
  /** Percentage from the existing playback speed selector, not a multiplier or BPM. */
  speed: number;
  hands: 'both' | 'rh' | 'lh';
  wait: boolean;
  metronome: boolean;
  view: 'page' | 'cont' | 'fall';
  look: 'paper' | 'night';
  zoom: number;
}

export interface LibraryMetadata {
  title: string;
  composer: string;
}

export type LibraryStudyStatus = 'in_progress' | 'mastered';

export interface LibraryItem extends LibraryMetadata {
  id: string;
  name: string;
  size: number;
  addedAt: number;
  lastOpenedAt: number | null;
  favorite: boolean;
  resume: LibraryResume | null;
  /** Best accuracy (0–100) of a timed run through the whole score. Absent until the first one; older records lack it. */
  best?: number;
  /** Day number (days since 1970-01-01, local calendar) of the last whole-score practice run. Absent in older records. */
  lastPlayedDay?: number;
  /** Optional difficulty/study level label (e.g. 'Beginner', 'Intermediate', 'Advanced', 'Level 1'). Absent when unset. */
  level?: string;
  /** Optional user-defined tags / collection names (up to 20 tags, each 1–64 chars). Absent when empty. */
  tags?: string[];
  /** Optional study status: 'in_progress' (working on it) or 'mastered' (completed). Absent when unset. */
  status?: LibraryStudyStatus;
  /** Optional manual study progress percentage (integer 0–100). Absent when unset. */
  progress?: number;
  /** Optional personal study notes (1–1000 chars). Absent when empty. */
  notes?: string;
}

export interface LibraryUpdatePatch {
  favorite?: boolean;
  lastOpenedAt?: number;
  resume?: LibraryResume | null;
  title?: string;
  composer?: string;
  level?: string | null;
  tags?: string[] | null;
  status?: LibraryStudyStatus | null;
  progress?: number | null;
  notes?: string | null;
}

/** A recorded practice run: the updated record and the best accuracy it had before. */
export interface LibraryPlayResult {
  item: LibraryItem;
  previousBest: number | null;
}

export interface LibraryImportResult {
  item: LibraryItem;
  duplicate: boolean;
}

export interface LibraryRestoreResult {
  added: number;
  duplicates: number;
}

export interface LibraryHost {
  language(): string;
  /** Parse/validate without disturbing the current score or playback. */
  inspect(file: File): Promise<LibraryMetadata>;
  /** Estimate without engraving, saving, or altering the open piece. */
  difficulty(file: File, startingBpm?: number): Promise<import('./score-difficulty-import.js').ImportedDifficultyEstimate>;
  /** Open through the existing renderer. Return false if parsing/rendering fails. */
  open(item: LibraryItem, file: File): Promise<boolean>;
  /** Flush the current piece's pending checkpoint before export or opening another piece. */
  flush(): Promise<void>;
}

export interface LibraryController {
  refresh(): Promise<void>;
  localize(): void;
  /** Report a save failure without discarding the open score. */
  notice(key: string): void;
}
