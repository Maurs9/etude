import { describe, expect, it } from 'vitest';
import { LESSONS, LQZ } from '../../src/locales/content.ts';
import { STRINGS } from '../../src/locales/index.js';

const LANGS = ['en', 'ro', 'de', 'es', 'fr', 'it', 'pt-BR'];

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
    for (const lesson of LESSONS) {
      const counts = Object.fromEntries(LANGS.map((l) => [l, (lesson[l]?.b.match(/<h4>/g) ?? []).length]));
      for (const l of LANGS) expect(counts[l], `${lesson.id}.${l}`).toBe(counts.en);
    }
  });
  it('provide pedagogical why explanations for all 102 learn quizzes across all 7 languages', async () => {
    let totalQuestions = 0;
    for (const lesson of LESSONS) {
      const qs = LQZ[lesson.id] ?? [];
      totalQuestions += qs.length;
      qs.forEach((q, idx) => {
        const why = q.why;
        const enWhy = Array.isArray(why) ? why[0] : why;
        const roWhy = Array.isArray(why) ? why[1] : q.i18n?.ro?.why;
        expect(typeof enWhy === 'string' && enWhy.trim().length > 0, `${lesson.id}:${idx}.en`).toBe(true);
        expect(typeof roWhy === 'string' && roWhy.trim().length > 0, `${lesson.id}:${idx}.ro`).toBe(true);
        for (const l of ['es', 'fr', 'de', 'it', 'pt-BR']) {
          const locWhy = q.i18n?.[l]?.why;
          expect(typeof locWhy === 'string' && locWhy.trim().length > 0, `${lesson.id}:${idx}.${l}`).toBe(true);
        }
      });
    }
    expect(totalQuestions).toBe(102);

    for (const l of LANGS) {
      const { default: payload } = await import(`../../src/locales/learn-${l}.ts`);
      const payloadQs = Object.values(payload.LQZ).flat();
      expect(payloadQs, `learn-${l}.ts`).toHaveLength(102);
      payloadQs.forEach((q, idx) => {
        expect(typeof q.why === 'string' && q.why.trim().length > 0, `learn-${l}:${idx}`).toBe(true);
      });
    }
  });
});
