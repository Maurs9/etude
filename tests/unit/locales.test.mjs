import { describe, expect, it } from 'vitest';
import { LESSONS } from '../../src/locales/content.ts';
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
  it('keep matching section heading counts across all 7 languages in every lesson', () => {
    const langs = ['en', 'ro', 'de', 'es', 'fr', 'it', 'pt-BR'];
    for (const lesson of LESSONS) {
      const counts = Object.fromEntries(langs.map((l) => [l, (lesson[l]?.b.match(/<h4>/g) ?? []).length]));
      for (const l of langs) expect(counts[l], `${lesson.id}.${l}`).toBe(counts.en);
    }
  });
});
