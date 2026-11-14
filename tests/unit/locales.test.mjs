import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../src/locales/index.js';

describe('static locale modules', () => {
  // Another language starts without the English strings (src/locales/loader.ts): a key it lacks would show as the key.
  it.each(Object.keys(STRINGS).filter((language) => language !== 'en'))('keep every user-facing string key of English in %s', (language) => {
    expect(Object.keys(STRINGS[language]).sort()).toEqual(Object.keys(STRINGS.en).sort());
  });
  it('have no empty string in any language', () => {
    for (const [language, strings] of Object.entries(STRINGS))
      expect(Object.entries(strings).filter(([, value]) => typeof value !== 'string').map(([key]) => `${language}.${key}`)).toEqual([]);
  });
});
