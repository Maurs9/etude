import { describe, expect, it } from 'vitest';
import {
  LibraryError,
  validateLibraryLevel,
  validateLibraryMetadata,
  validateLibraryNotes,
  validateLibraryProgress,
  validateLibraryResume,
  validateLibraryStatus,
  validateLibraryTags,
} from '../../src/domain/score-library-store.ts';
import { libraryText, libraryTranslations } from '../../src/locales/score-library.ts';

const resume = { position: 12.5, measure: '4', speed: 75, hands: 'lh', wait: true, metronome: false, view: 'cont', look: 'night', zoom: 1.2 };
describe('local library validation boundary', () => {
  it('keeps originals metadata as literal text and ignores extraneous properties', () => {
    expect(validateLibraryMetadata({ title: '<img src=x>', composer: 'Șostakovici', extra: 'not persisted' })).toEqual({ title: '<img src=x>', composer: 'Șostakovici' });
    expect(validateLibraryResume({ ...resume, extra: 'not persisted' })).toEqual(resume);
    expect(validateLibraryResume({ ...resume, recon: { hands: 'tracks', grid: 8, key: '-2:1', extra: true } })?.recon).toEqual({ hands: 'tracks', grid: 8, key: '-2:1' });
    expect(validateLibraryResume({ ...resume, recon: { hands: '60', grid: 2, key: 'auto' } })?.recon).toEqual({ hands: '60', grid: 2, key: 'auto' });
    expect(validateLibraryResume(null)).toBeNull();
  });
  it.each([null, [], {}, { title: 1, composer: '' }, { title: '', composer: null }, { title: 'x'.repeat(513), composer: '' }, { title: '\0', composer: '' }])('rejects malformed metadata %#', value => {
    expect(() => validateLibraryMetadata(value)).toThrow(LibraryError);
  });
  it.each([
    { position: -1 }, { position: NaN }, { position: Infinity }, { measure: 4 }, { measure: 'x'.repeat(129) },
    { speed: .75 }, { speed: 3 }, { speed: '75' }, { hands: 'left' }, { wait: 1 }, { metronome: 'false' },
    { view: 'svg' }, { look: 'dark' }, { zoom: 0 }, { zoom: 100 },
    { recon: 'bad' }, { recon: { hands: 'split', grid: 4, key: 'auto' } }, { recon: { hands: 'auto', grid: 16, key: 'auto' } },
    { recon: { hands: 'auto', grid: 4, key: '9:0' } },
  ])('rejects malformed checkpoints %#', patch => {
    expect(() => validateLibraryResume({ ...resume, ...patch })).toThrow(LibraryError);
  });
  it.each([40, 50, 60, 70, 75, 80, 90, 100, 110, 125])('stores speed as the supported percent %s', speed => {
    expect(validateLibraryResume({ ...resume, speed }).speed).toBe(speed);
  });
  it('normalizes and validates optional level and tags', () => {
    expect(validateLibraryLevel(undefined)).toBeUndefined();
    expect(validateLibraryLevel(null)).toBeUndefined();
    expect(validateLibraryLevel('   ')).toBeUndefined();
    expect(validateLibraryLevel('  Level 2  ')).toBe('Level 2');
    expect(validateLibraryTags(undefined)).toBeUndefined();
    expect(validateLibraryTags(null)).toBeUndefined();
    expect(validateLibraryTags(['', '  '])).toBeUndefined();
    expect(validateLibraryTags([' Bach ', 'Examen', 'bach', 'Studiu'])).toEqual(['Bach', 'Examen', 'Studiu']);
  });
  it.each([123, {}, [], 'x'.repeat(65), 'bad\0level'])('rejects invalid level %#', value => {
    expect(() => validateLibraryLevel(value)).toThrow(LibraryError);
  });
  it.each(['not-array', {}, [123], ['x'.repeat(65)], ['bad\0tag'], Array.from({ length: 21 }, (_, i) => `tag-${i}`)])('rejects invalid tags %#', value => {
    expect(() => validateLibraryTags(value)).toThrow(LibraryError);
  });
  it('normalizes and validates optional status, progress and notes', () => {
    expect(validateLibraryStatus(undefined)).toBeUndefined();
    expect(validateLibraryStatus(null)).toBeUndefined();
    expect(validateLibraryStatus('')).toBeUndefined();
    expect(validateLibraryStatus('in_progress')).toBe('in_progress');
    expect(validateLibraryStatus('mastered')).toBe('mastered');
    expect(validateLibraryProgress(undefined)).toBeUndefined();
    expect(validateLibraryProgress(null)).toBeUndefined();
    expect(validateLibraryProgress(0)).toBe(0);
    expect(validateLibraryProgress(65)).toBe(65);
    expect(validateLibraryProgress(100)).toBe(100);
    expect(validateLibraryNotes(undefined)).toBeUndefined();
    expect(validateLibraryNotes(null)).toBeUndefined();
    expect(validateLibraryNotes('   ')).toBeUndefined();
    expect(validateLibraryNotes('  Hands separate bars 1-8  ')).toBe('Hands separate bars 1-8');
  });
  it.each(['paused', 'done', 1, {}])('rejects invalid status %#', value => {
    expect(() => validateLibraryStatus(value)).toThrow(LibraryError);
  });
  it.each([-1, 101, 50.5, NaN, Infinity, '50'])('rejects invalid progress %#', value => {
    expect(() => validateLibraryProgress(value)).toThrow(LibraryError);
  });
  it.each([123, {}, [], 'x'.repeat(1001), 'bad\0note'])('rejects invalid notes %#', value => {
    expect(() => validateLibraryNotes(value)).toThrow(LibraryError);
  });
});

describe('library localized copy', () => {
  for (const [language, copy] of Object.entries(libraryTranslations)) {
    it(`${language}: every label and placeholder is present`, () => {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(libraryTranslations.en).sort());
      for (const [key, text] of Object.entries(copy)) {
        expect(text.trim(), key).not.toBe('');
        const filled = libraryText(language, key, {
          count: 2, title: 'Test', date: 'Today', measure: '4', time: '0:12',
          added: 2, duplicates: 1, errors: 0, best: 92, group: 'Bach', level: '2',
          progress: 65, notes: 'Legato', status: 'In progress', score: 42, bars: '6–9',
          before: 'Level 2', after: 'Level 3', same: 3, skipped: 1, rating: '3.5',
        });
        expect(filled, key).not.toMatch(/\{\w+\}/);
      }
    });
  }
  it('falls back to English for unsupported languages without dropping counts', () => {
    expect(libraryText('unknown', 'heading', { count: 2 })).toBe('My Library (2)');
  });
});
