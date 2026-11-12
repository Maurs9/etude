import { describe, expect, it } from 'vitest';
import { LibraryError, validateLibraryMetadata, validateLibraryResume } from '../../src/domain/score-library-store.ts';
import { libraryText, libraryTranslations } from '../../src/locales/score-library.ts';

const resume = { position: 12.5, measure: '4', speed: 75, hands: 'lh', wait: true, metronome: false, view: 'cont', look: 'night', zoom: 1.2 };
describe('local library validation boundary', () => {
  it('keeps originals metadata as literal text and ignores extraneous properties', () => {
    expect(validateLibraryMetadata({ title: '<img src=x>', composer: 'Șostakovici', extra: 'not persisted' })).toEqual({ title: '<img src=x>', composer: 'Șostakovici' });
    expect(validateLibraryResume({ ...resume, extra: 'not persisted' })).toEqual(resume);
    expect(validateLibraryResume(null)).toBeNull();
  });
  it.each([null, [], {}, { title: 1, composer: '' }, { title: '', composer: null }, { title: 'x'.repeat(513), composer: '' }, { title: '\0', composer: '' }])('rejects malformed metadata %#', value => {
    expect(() => validateLibraryMetadata(value)).toThrow(LibraryError);
  });
  it.each([
    { position: -1 }, { position: NaN }, { position: Infinity }, { measure: 4 }, { measure: 'x'.repeat(129) },
    { speed: .75 }, { speed: 3 }, { speed: '75' }, { hands: 'left' }, { wait: 1 }, { metronome: 'false' },
    { view: 'svg' }, { look: 'dark' }, { zoom: 0 }, { zoom: 100 },
  ])('rejects malformed checkpoints %#', patch => {
    expect(() => validateLibraryResume({ ...resume, ...patch })).toThrow(LibraryError);
  });
  it.each([40, 50, 60, 70, 75, 80, 90, 100, 110, 125])('stores speed as the supported percent %s', speed => {
    expect(validateLibraryResume({ ...resume, speed }).speed).toBe(speed);
  });
});

describe('library localized copy', () => {
  for (const [language, copy] of Object.entries(libraryTranslations)) {
    it(`${language}: every label and placeholder is present`, () => {
      expect(Object.keys(copy).sort()).toEqual(Object.keys(libraryTranslations.en).sort());
      for (const [key, text] of Object.entries(copy)) {
        expect(text.trim(), key).not.toBe('');
        const filled = libraryText(language, key, { count: 2, title: 'Test', date: 'Today', measure: '4', time: '0:12', added: 2, duplicates: 1, errors: 0, best: 92 });
        expect(filled, key).not.toMatch(/\{\w+\}/);
      }
    });
  }
  it('falls back to English for unsupported languages without dropping counts', () => {
    expect(libraryText('unknown', 'heading', { count: 2 })).toBe('My Library (2)');
  });
});
