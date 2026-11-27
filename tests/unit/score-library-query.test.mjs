import { describe, expect, it } from 'vitest';
import { ESTIMATOR_VERSION } from '../../src/domain/score-difficulty.ts';
import {
  collectFilterFacetValues,
  computeGroupCounts,
  filterAndSortLibraryItems,
  formatResumeTime,
  makeRating,
  needsRating,
  nextStudyStatus,
  parseEnteredTempo,
} from '../../src/features/score-library/library-query.ts';

function item(overrides = {}) {
  return {
    id: 'id-1',
    name: 'piece.xml',
    title: 'Prelude',
    composer: 'Bach',
    addedAt: 1000,
    lastOpenedAt: null,
    favorite: false,
    ...overrides,
  };
}

const labels = {
  statusLabel: (s) => (s === 'in_progress' ? 'In progress' : s === 'mastered' ? 'Mastered' : 'No status'),
  unknownComposer: 'Unknown composer',
  untagged: 'Untagged',
};

const baseFilter = {
  query: '',
  filter: 'all',
  sort: 'added',
  composerFilter: '',
  tagFilter: '',
  group: 'none',
  totalRange: null,
  axis: undefined,
  axisRange: null,
  locale: 'en',
};

describe('score-library query helpers', () => {
  it('filters by query, status, favorite, recent, composer, tag, and difficulty ranges', () => {
    const a = item({
      id: 'a', title: 'Prelude in C', composer: 'Bach', tags: ['Baroque'], status: 'mastered',
      favorite: true, addedAt: 10, lastOpenedAt: 50, notes: 'Legato study',
      difficultyRating: { version: 2, stars: 2.2, axes: { motor: 2.0, rhythm: 1.5, bimanual: 2.0, texture: 2.5, reading: 2.0 } },
    });
    const b = item({
      id: 'b', title: 'Nocturne', composer: 'Chopin', tags: ['Romantic'], status: 'in_progress',
      favorite: false, addedAt: 20, lastOpenedAt: null,
      difficultyRating: { version: 2, stars: 4.1, axes: { motor: 4.3, rhythm: 3.5, bimanual: 4.0, texture: 3.8, reading: 3.9 } },
    });
    const c = item({
      id: 'c', title: 'Untitled', composer: '', addedAt: 30, lastOpenedAt: 100,
    });
    const all = [a, b, c];
    const estimates = new Map();

    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, query: 'legato' }, labels).map((x) => x.id)).toEqual(['a']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, filter: 'in_progress' }, labels).map((x) => x.id)).toEqual(['b']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, filter: 'favorites' }, labels).map((x) => x.id)).toEqual(['a']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, filter: 'recent' }, labels).map((x) => x.id)).toEqual(['c', 'a']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, composerFilter: '__none__' }, labels).map((x) => x.id)).toEqual(['c']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, tagFilter: 'Romantic' }, labels).map((x) => x.id)).toEqual(['b']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, totalRange: { min: 3, max: 5 } }, labels).map((x) => x.id)).toEqual(['b']);
    expect(filterAndSortLibraryItems(all, estimates, { ...baseFilter, axis: 'motor', axisRange: { min: 1.5, max: 2.5 } }, labels).map((x) => x.id)).toEqual(['a']);
  });

  it('sorts and groups items deterministically', () => {
    const a = item({ id: 'a', title: 'Zeta', composer: 'Bach', status: 'mastered', progress: 100, addedAt: 1, difficultyRating: { version: 2, stars: 2.0 } });
    const b = item({ id: 'b', title: 'Alpha', composer: 'Chopin', status: 'in_progress', progress: 40, addedAt: 2, difficultyRating: { version: 2, stars: 4.5 } });
    const c = item({ id: 'c', title: 'Beta', composer: '', addedAt: 3 });
    const estimates = new Map();

    expect(filterAndSortLibraryItems([a, b, c], estimates, { ...baseFilter, sort: 'title' }, labels).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(filterAndSortLibraryItems([a, b, c], estimates, { ...baseFilter, sort: 'difficulty' }, labels).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(filterAndSortLibraryItems([a, b, c], estimates, { ...baseFilter, sort: 'difficulty_desc' }, labels).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(filterAndSortLibraryItems([a, b, c], estimates, { ...baseFilter, sort: 'progress_asc' }, labels).map((x) => x.id)).toEqual(['b', 'a', 'c']);

    const grouped = filterAndSortLibraryItems([a, b, c], estimates, { ...baseFilter, group: 'status' }, labels);
    expect(grouped.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    const counts = computeGroupCounts(grouped, 'status', '', labels);
    expect(counts.get('In progress')).toBe(1);
    expect(counts.get('Mastered')).toBe(1);
    expect(counts.get('No status')).toBe(1);

    const facets = collectFilterFacetValues([a, b, c], 'en');
    expect(facets).toEqual({
      composers: ['Bach', 'Chopin'],
      hasEmptyComposer: true,
      tags: [],
      hasEmptyTag: true,
    });
  });

  it('builds v2 difficulty ratings, checks freshness, parses tempo, and cycles study statuses', () => {
    const est = {
      difficultyStars: 3.4,
      appliedEnduranceStars: 0.2,
      spanAlert: true,
      profileId: 'default',
      uncertainty: { tempoFallback: false, tempoSource: 'written', voiceSource: 'written', handSource: 'written' },
      axisDifficulty: {
        motor: { stars: 3.5, measures: [1], drivers: ['speed'] },
        rhythm: { stars: 3.0, measures: [], drivers: [] },
        bimanual: { stars: 3.2, measures: [], drivers: [] },
        texture: { stars: 2.8, measures: [], drivers: [] },
        reading: { stars: 3.1, measures: [], drivers: [] },
      },
    };
    const rating = makeRating(est, 112, 112);
    expect(rating).toMatchObject({
      version: 2,
      stars: 3.4,
      startingBpm: 112,
      appliedEnduranceStars: 0.2,
      spanAlert: true,
      assessment: { estimatorVersion: ESTIMATOR_VERSION, referenceBpm: 112, profileId: 'default' },
      drivers: { motor: ['speed'] },
    });

    const fresh = item({ difficultyRating: rating });
    expect(needsRating(new Map(), fresh)).toBe(false);
    expect(needsRating(new Map(), item())).toBe(true);

    expect(parseEnteredTempo('')).toBe(0);
    expect(parseEnteredTempo('96,5')).toBe(96.5);
    expect(parseEnteredTempo('15')).toBeNull();
    expect(parseEnteredTempo('abc')).toBeNull();

    expect(nextStudyStatus(undefined)).toBe('in_progress');
    expect(nextStudyStatus('in_progress')).toBe('mastered');
    expect(nextStudyStatus('mastered')).toBeNull();

    expect(formatResumeTime({ position: 90, speed: 100, elapsed: 125 })).toBe('2:05');
  });
});
