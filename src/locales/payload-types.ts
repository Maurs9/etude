import type { GlossaryEntry, LearnQuizSpec, LearnSummaryRow, LessonCopy, MusicTranslations, StepLabels } from './content-types.js';
import type { LibraryTextKey } from './score-library.js';

/** Effective selected-language copy, already resolved through the original fallback rules. */
export interface LearnPayload {
  LESSONS: Record<string, LessonCopy>;
  LQZ: Record<string, LearnQuizSpec[]>;
  LSUM: Record<string, LearnSummaryRow[]>;
  GLOSS: (GlossaryEntry & { searchEnglish: string })[];
}

export interface UIPayload {
  LIBRARY: Record<string, Record<LibraryTextKey, string>>;
  STRINGS: Record<string, Record<string, string>>;
  I18N_MUSIC: MusicTranslations;
  STEP_LABELS: StepLabels;
  LOCALE_TAGS: Record<string, string>;
}
