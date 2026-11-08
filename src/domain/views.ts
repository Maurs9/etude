import './views-runtime.js';

import type { AppLanguage } from '../types/architecture.js';
import type { AppSettings } from './storage.js';
import type { AudioTone, PianoStatus } from './audio.js';
import type { AppView } from './router.js';
import type { ChordTemplate, ProgressionTemplate, ScaleDefinitions } from './view-contracts.js';

/**
 * The view entry point is deliberately small: it owns the typed browser
 * boundary and loads the behaviour-preserving runtime implementation. Keeping
 * the boundary here means new view code can be checked without re-introducing
 * an untyped application-global contract.
 */

export interface ViewElement extends HTMLElement {
  value: string;
  checked: boolean;
  disabled: boolean;
  hidden: boolean;
  _filled?: boolean;
}

export interface ViewLocaleRecord {
  readonly [key: string]: string;
}

export interface ViewLocaleContent {
  readonly language: AppLanguage;
  readonly strings: ViewLocaleRecord;
  readonly music: Readonly<Record<string, unknown>>;
  readonly lessons: Readonly<Record<string, unknown>>;
}

export interface ViewSessionState {
  active: boolean;
  index: number;
  correct: number;
  total: number;
  answered: boolean;
  question: ViewData | null;
}

export interface ViewApplicationState {
  language: AppLanguage;
  view: AppView;
  theme: 'auto' | 'light' | 'dark';
  notation: 'letter' | 'german' | 'solfege';
  settings: AppSettings;
  session: ViewSessionState;
  audio: {
    tone: AudioTone;
    piano: PianoStatus;
    muted: boolean;
  };
}

export interface ViewData {
  readonly [key: string]: string | number | boolean | null | ViewData | readonly ViewData[];
}

export interface ViewEventMap {
  click: MouseEvent;
  change: Event;
  input: Event;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  pointerdown: PointerEvent;
  pointermove: PointerEvent;
  pointerup: PointerEvent;
}

export type ViewEventName = keyof ViewEventMap;
export type ViewEventHandler<Name extends ViewEventName> =
  (event: ViewEventMap[Name]) => void;
export type ViewCallback<T = void> = () => T;
export type ViewUpdate<T> = (value: T) => void;

export interface ViewDomainData {
  readonly scales: ScaleDefinitions;
  readonly chords: readonly ChordTemplate[];
  readonly progressions: readonly ProgressionTemplate[];
}

export interface ViewRuntimeBoundary {
  readonly getElement: (id: string) => ViewElement;
  readonly getSurface: () => EtudeSurface | null;
}

export interface EtudeSurface {
  readonly [name: string]: unknown;
}

function requireElement(id: string): ViewElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing view element: ${id}`);
  return element as ViewElement;
}

function isEtudeSurface(value: unknown): value is EtudeSurface {
  return typeof value === 'object' && value !== null;
}

function getSurface(): EtudeSurface | null {
  const candidate: unknown = window.__etude;
  return isEtudeSurface(candidate) ? candidate : null;
}

/**
 * Typed helpers for new view modules. The existing runtime is loaded above
 * for compatibility; all newly added view code should use this boundary
 * rather than reading arbitrary globals or casting DOM nodes inline.
 */
export const viewRuntime: ViewRuntimeBoundary = {
  getElement: requireElement,
  getSurface,
};
