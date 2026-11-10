import type { InterfaceLanguage } from '../types/architecture.js';

/** Content written in English and translated into some other interface languages; readers fall back to `en`. */
export type Localised<T> = { en: T } & Partial<Record<InterfaceLanguage, T>>;

export type LessonCopy = { t: string; b: string };
export type Lesson = { id: string; icon: string } & Localised<LessonCopy>;
/** Titles and identity only: safe for Today, review planning and unit gates. */
export type LessonMetadata = { id: string; icon: string } & Localised<Pick<LessonCopy, 't'>>;
export type LearnUnit = { id: string; icon: string; ls: string[]; rd: string[] } & Localised<string>;
export type GlossaryEntry = { l: string } & Localised<[string, string]>;

/** Learn copy that is either already localised or an `[en, ro]` pair. */
export type LearnText = string | string[];

/** A quiz question already translated into one language. */
export interface LearnQuizCopy { q?: string; o?: string[] | null; why?: string }

/** One lesson-quiz question as written in the content (`LQZ`). */
export interface LearnQuizSpec {
  q: LearnText;
  o?: LearnText[];
  a?: number;
  hear?: string;
  pcs?: number[];
  seq?: number[];
  why?: LearnText;
  i18n?: Partial<Record<InterfaceLanguage, LearnQuizCopy>>;
}

/** One cheat-sheet row (`LSUM`): term and meaning, optionally pre-translated per language. */
export type LearnSummaryRow = [LearnText, LearnText];
export type LearnSummaryTranslations = Partial<Record<InterfaceLanguage, Record<string, [string, string][]>>>;

type Translations<T> = Partial<Record<InterfaceLanguage, T>>;

/** Music vocabulary in each non-English language; English names come from the theory tables. */
export interface MusicTranslations {
  intervals: Translations<Record<string, string>>;
  scales: Translations<Record<string, string>>;
  chords: Translations<Record<string, string>>;
  categories: Translations<Record<string, string>>;
  inversions: Translations<string[] | Record<number, string>>;
  feels: Translations<Record<string, string>>;
  songs: Translations<Record<string, Record<string, string[]>>>;
}

/** Whole-step/half-step labels per language, keyed by semitone count (1, 2, 3). */
export type StepLabels = Translations<Record<string, string>>;
