import type { DifficultyAxes, DifficultyAxis, DifficultyDriver, HandSource, TempoSource, VoiceSource } from './score-difficulty.js';

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
  view: 'fit' | 'page' | 'cont' | 'fall';
  look: 'paper' | 'night';
  zoom: number;
}

export interface LibraryMetadata {
  title: string;
  composer: string;
}

export type LibraryStudyStatus = 'in_progress' | 'mastered';

export interface LibraryDifficultyRatingV1 {
  version: 1;
  stars: number;
  startingBpm?: number;
  /** Records the tempo used for automatic refresh. Older ratings did not store this. */
  assessment?: { referenceBpm?: number; tempoFallback: boolean };
  axes?: DifficultyAxes;
}

export interface LibraryDifficultyAssessmentV2 {
  referenceBpm?: number;
  tempoFallback: boolean;
  tempoSource: TempoSource;
  voiceSource: VoiceSource;
  handSource: HandSource;
  estimatorVersion: 2 | 3;
  profileId: string;
}

export interface LibraryDifficultyRatingV2 {
  version: 2;
  stars: number;
  startingBpm?: number;
  appliedEnduranceStars?: number;
  spanAlert?: boolean;
  assessment?: LibraryDifficultyAssessmentV2;
  axes?: DifficultyAxes;
  drivers?: Readonly<Partial<Record<DifficultyAxis, readonly DifficultyDriver[]>>>;
}

export type LibraryDifficultyRating = LibraryDifficultyRatingV1 | LibraryDifficultyRatingV2;

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
  /** Saved estimate on the first star rubric. The user's level label is independent. */
  difficultyRating?: LibraryDifficultyRating;
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

export type LibraryLevelChange = { id: string } & (
  { previous: string | undefined; level: string } |
  { previousRating?: LibraryDifficultyRating; rating: LibraryDifficultyRating }
);

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

export type OpenedScoreEstimator = (
  startingBpm?: number,
) => Promise<import('./score-difficulty-import.js').ImportedDifficultyEstimate>;

export interface LibraryHost {
  language(): string;
  /** Parse/validate without disturbing the current score or playback. */
  inspect(file: File): Promise<LibraryMetadata>;
  /** Estimate without engraving, saving, or altering the open piece. */
  difficulty(
    file: File,
    startingBpm?: number,
  ): Promise<import('./score-difficulty-import.js').ImportedDifficultyEstimate>;
  /** Open through the existing renderer. Return false if parsing/rendering fails. */
  open(item: LibraryItem, file: File): Promise<boolean>;
  /** Flush the current piece's pending checkpoint before export or opening another piece. */
  flush(): Promise<void>;
  /** Ask for user confirmation using the themed app dialog when available. */
  confirm?(message: string): Promise<boolean>;
  /** Notifies the catalog wrapper when loaded/updated library items change. */
  onItemsChanged?(items: readonly LibraryItem[]): void;
}

export interface LibraryController {
  refresh(): Promise<void>;
  prepareRating(item: LibraryItem, estimate: OpenedScoreEstimator): void;
  localize(): void;
  /** Report a save failure without discarding the open score. */
  notice(key: string): void;
}
