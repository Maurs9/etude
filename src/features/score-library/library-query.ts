import { ESTIMATOR_VERSION, type DifficultyAxis } from '../../domain/score-difficulty.js';
import type { ImportedDifficultyEstimate } from '../../domain/score-difficulty-import.js';
import type {
  LibraryDifficultyRating, LibraryItem, LibraryResume, LibraryStudyStatus,
} from '../../domain/score-library-types.js';

export const AXES: readonly DifficultyAxis[] = ['motor', 'rhythm', 'bimanual', 'texture', 'reading'];

export const VIEW_KEYS = ['all', 'in_progress', 'mastered', 'favorites', 'recent'] as const;
export type LibraryViewKey = (typeof VIEW_KEYS)[number];

export const SORT_KEYS = [
  'added', 'recent', 'title', 'composer', 'difficulty', 'difficulty_desc', 'progress_desc', 'progress_asc',
] as const;
export type LibrarySortKey = (typeof SORT_KEYS)[number];

export const GROUP_KEYS = ['none', 'status', 'composer', 'tag'] as const;
export type LibraryGroupKey = (typeof GROUP_KEYS)[number];

export interface DifficultyRange {
  readonly min: number;
  readonly max: number;
}

export interface LibraryEstimate {
  estimatorVersion: 1 | 2 | 3;
  bpm: number | undefined;
  promise: Promise<ImportedDifficultyEstimate | null>;
  result?: ImportedDifficultyEstimate | null;
  saveAttempted?: boolean;
}

export interface LibraryFilterState {
  readonly query: string;
  readonly filter: LibraryViewKey;
  readonly sort: LibrarySortKey;
  readonly composerFilter: string;
  readonly tagFilter: string;
  readonly group: LibraryGroupKey;
  readonly totalRange: DifficultyRange | null;
  readonly axis: DifficultyAxis | undefined;
  readonly axisRange: DifficultyRange | null;
  readonly locale: string;
}

export interface LibraryGroupLabels {
  readonly statusLabel: (value: LibraryStudyStatus | undefined) => string;
  readonly unknownComposer: string;
  readonly untagged: string;
}

export function referenceTempo(item: LibraryItem | undefined): number | undefined {
  return item?.difficultyRating?.startingBpm;
}

export function currentEstimateFor(
  estimates: ReadonlyMap<string, LibraryEstimate>,
  id: string,
  item: LibraryItem | undefined,
): LibraryEstimate | undefined {
  const estimate = estimates.get(id);
  return estimate &&
    estimate.estimatorVersion === ESTIMATOR_VERSION &&
    estimate.bpm === referenceTempo(item)
    ? estimate
    : undefined;
}

export function displayedStarsFor(
  estimates: ReadonlyMap<string, LibraryEstimate>,
  item: LibraryItem,
): number | undefined {
  return currentEstimateFor(estimates, item.id, item)?.result?.difficultyStars ?? item.difficultyRating?.stars;
}

export function displayedAxisFor(
  item: LibraryItem,
  axis: DifficultyAxis,
  result: LibraryEstimate['result'],
): number | undefined {
  return result?.axisDifficulty?.[axis].stars ?? item.difficultyRating?.axes?.[axis];
}

export function makeRating(
  result: ImportedDifficultyEstimate,
  referenceBpm: number | undefined,
  startingBpm?: number,
): LibraryDifficultyRating | null {
  const { difficultyStars: stars, axisDifficulty: axes } = result;
  if (stars === null || !axes) return null;
  const drivers = Object.fromEntries(
    AXES.flatMap((axis) => (axes[axis].drivers.length ? [[axis, [...axes[axis].drivers]]] : [])),
  );
  return {
    version: 2,
    stars,
    ...(startingBpm === undefined ? {} : { startingBpm }),
    ...(result.appliedEnduranceStars >= 0.1 ? { appliedEnduranceStars: result.appliedEnduranceStars } : {}),
    ...(result.spanAlert ? { spanAlert: true } : {}),
    assessment: {
      ...(referenceBpm === undefined ? {} : { referenceBpm }),
      tempoFallback: result.uncertainty.tempoFallback,
      tempoSource: result.uncertainty.tempoSource,
      voiceSource: result.uncertainty.voiceSource,
      handSource: result.uncertainty.handSource,
      estimatorVersion: ESTIMATOR_VERSION,
      profileId: result.profileId,
    },
    axes: {
      motor: axes.motor.stars,
      rhythm: axes.rhythm.stars,
      bimanual: axes.bimanual.stars,
      texture: axes.texture.stars,
      reading: axes.reading.stars,
    },
    ...(Object.keys(drivers).length ? { drivers } : {}),
  };
}

export function needsRating(
  estimates: ReadonlyMap<string, LibraryEstimate>,
  item: LibraryItem,
): boolean {
  const rating = item.difficultyRating;
  const upToDate = rating?.version === 2 &&
    !!rating.assessment &&
    !!rating.axes &&
    rating.assessment.estimatorVersion === ESTIMATOR_VERSION &&
    rating.assessment.profileId === 'default' &&
    rating.assessment.referenceBpm === referenceTempo(item);
  return !upToDate && !currentEstimateFor(estimates, item.id, item)?.saveAttempted;
}

export function matchesDifficulty(score: number | undefined, range: DifficultyRange): boolean {
  return score !== undefined && score >= range.min && score <= range.max;
}

export function collectFilterFacetValues(items: readonly LibraryItem[], locale: string): {
  composers: string[];
  hasEmptyComposer: boolean;
  tags: string[];
  hasEmptyTag: boolean;
} {
  const composers = new Set<string>();
  let hasEmptyComposer = false;
  const tags = new Set<string>();
  let hasEmptyTag = false;
  for (const item of items) {
    const composer = item.composer.trim();
    if (composer) composers.add(composer);
    else hasEmptyComposer = true;
    if (item.tags?.length) {
      for (const tag of item.tags) tags.add(tag);
    } else {
      hasEmptyTag = true;
    }
  }
  return {
    composers: [...composers].sort((a, b) => a.localeCompare(b, locale)),
    hasEmptyComposer,
    tags: [...tags].sort((a, b) => a.localeCompare(b, locale)),
    hasEmptyTag,
  };
}

export function groupMetaFor(
  item: LibraryItem,
  group: LibraryGroupKey,
  tagFilter: string,
  labels: LibraryGroupLabels,
): { label: string; empty: boolean; order: number } {
  if (group === 'status') {
    const order = item.status === 'in_progress' ? 0 : item.status === 'mastered' ? 1 : 2;
    return { label: labels.statusLabel(item.status), empty: !item.status, order };
  }
  if (group === 'composer') {
    const value = item.composer.trim();
    return { label: value || labels.unknownComposer, empty: !value, order: 0 };
  }
  if (group === 'tag') {
    if (tagFilter && tagFilter !== '__none__' && item.tags?.includes(tagFilter)) {
      return { label: tagFilter, empty: false, order: 0 };
    }
    const value = item.tags?.[0] ?? '';
    return { label: value || labels.untagged, empty: !value, order: 0 };
  }
  return { label: '', empty: true, order: 0 };
}

export function filterAndSortLibraryItems(
  items: readonly LibraryItem[],
  estimates: ReadonlyMap<string, LibraryEstimate>,
  state: LibraryFilterState,
  labels: LibraryGroupLabels,
): LibraryItem[] {
  const query = state.query.trim().toLocaleLowerCase();
  const shown = items.filter((item) => {
    if (query) {
      const haystack = `${item.title}\n${item.composer}\n${item.name}\n${(item.tags ?? []).join('\n')}\n${item.notes ?? ''}`.toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (state.filter === 'in_progress' && item.status !== 'in_progress') return false;
    if (state.filter === 'mastered' && item.status !== 'mastered') return false;
    if (state.filter === 'favorites' && !item.favorite) return false;
    if (state.filter === 'recent' && item.lastOpenedAt === null) return false;
    if (state.composerFilter === '__none__' && item.composer.trim()) return false;
    if (state.composerFilter && state.composerFilter !== '__none__' && item.composer.trim() !== state.composerFilter) return false;
    if (state.tagFilter === '__none__' && item.tags?.length) return false;
    if (state.tagFilter && state.tagFilter !== '__none__' && !item.tags?.includes(state.tagFilter)) return false;
    if (state.totalRange && !matchesDifficulty(displayedStarsFor(estimates, item), state.totalRange)) return false;
    if (state.axis && state.axisRange) {
      const axisScore = displayedAxisFor(item, state.axis, currentEstimateFor(estimates, item.id, item)?.result);
      if (!matchesDifficulty(axisScore, state.axisRange)) return false;
    }
    return true;
  });

  const { locale } = state;
  const compareByTitle = (a: LibraryItem, b: LibraryItem): number =>
    (a.title || a.name).localeCompare(b.title || b.name, locale, { numeric: true }) || a.id.localeCompare(b.id);
  const effectiveSort: LibrarySortKey = state.filter === 'recent' && state.sort === 'added' ? 'recent' : state.sort;

  const compareItems = (a: LibraryItem, b: LibraryItem): number => {
    if (effectiveSort === 'recent') {
      return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt || a.id.localeCompare(b.id);
    }
    if (effectiveSort === 'title') return compareByTitle(a, b);
    if (effectiveSort === 'composer') {
      const ca = a.composer.trim();
      const cb = b.composer.trim();
      if (!ca !== !cb) return ca ? -1 : 1;
      return ca.localeCompare(cb, locale, { numeric: true }) || compareByTitle(a, b);
    }
    if (effectiveSort === 'difficulty') {
      return (displayedStarsFor(estimates, a) ?? Infinity) - (displayedStarsFor(estimates, b) ?? Infinity) || compareByTitle(a, b);
    }
    if (effectiveSort === 'difficulty_desc') {
      const da = displayedStarsFor(estimates, a);
      const db = displayedStarsFor(estimates, b);
      if ((da === undefined) !== (db === undefined)) return da === undefined ? 1 : -1;
      return (db ?? 0) - (da ?? 0) || compareByTitle(a, b);
    }
    if (effectiveSort === 'progress_desc' || effectiveSort === 'progress_asc') {
      const pa = a.progress;
      const pb = b.progress;
      if ((pa === undefined) !== (pb === undefined)) return pa === undefined ? 1 : -1;
      if (pa !== undefined && pb !== undefined && pa !== pb) {
        return effectiveSort === 'progress_desc' ? pb - pa : pa - pb;
      }
      return compareByTitle(a, b);
    }
    return b.addedAt - a.addedAt || a.id.localeCompare(b.id);
  };

  if (state.group !== 'none') {
    shown.sort((a, b) => {
      const ga = groupMetaFor(a, state.group, state.tagFilter, labels);
      const gb = groupMetaFor(b, state.group, state.tagFilter, labels);
      if (state.group === 'status') {
        if (ga.order !== gb.order) return ga.order - gb.order;
        return compareItems(a, b);
      }
      if (ga.empty !== gb.empty) return ga.empty ? 1 : -1;
      const labelCmp = ga.label.localeCompare(gb.label, locale, { numeric: true });
      if (labelCmp !== 0) return labelCmp;
      return compareItems(a, b);
    });
  } else {
    shown.sort(compareItems);
  }
  return shown;
}

export function computeGroupCounts(
  items: readonly LibraryItem[],
  group: LibraryGroupKey,
  tagFilter: string,
  labels: LibraryGroupLabels,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (group === 'none') return counts;
  for (const item of items) {
    const { label } = groupMetaFor(item, group, tagFilter, labels);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

/** Parses an optional manual BPM input: returns 0 when blank, valid BPM (20–400), or null when invalid. */
export function parseEnteredTempo(raw: string): number | null {
  const value = raw.trim().replace(',', '.');
  if (!value) return 0;
  const bpm = Number(value);
  return /^\d+(?:\.\d+)?$/.test(value) && bpm >= 20 && bpm <= 400 ? bpm : null;
}

export function nextStudyStatus(current: LibraryStudyStatus | undefined): LibraryStudyStatus | null {
  if (current === undefined) return 'in_progress';
  if (current === 'in_progress') return 'mastered';
  return null;
}

export function formatResumeTime(resume: LibraryResume): string {
  const seconds = Math.max(0, Math.floor(resume.elapsed ?? (resume.performance ?? resume.position) / (resume.speed / 100)));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
