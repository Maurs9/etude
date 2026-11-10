import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import * as original from '../../src/locales/content.ts';
import * as ui from '../../src/locales/index.js';
import { libraryTranslations } from '../../src/locales/score-library.ts';
const languages = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
const text = (value, language) => Array.isArray(value) ? value[language === 'ro' ? 1 : 0] : value;

describe('on-demand locale payloads', () => {
  it('verifies reproducible generated files without rewriting them', () => {
    const files = ['catalog', ...languages.flatMap(language => [`ui-${language}`, `learn-${language}`])].map(name => new URL(`../../src/locales/${name}.ts`, import.meta.url));
    const mtimes = files.map(file => statSync(file).mtimeMs);
    expect(execFileSync(process.execPath, ['scripts/split-locales.mjs', '--check'], { encoding: 'utf8' })).toContain('Verified 15 generated locale files.');
    expect(files.map(file => statSync(file).mtimeMs)).toEqual(mtimes);
  });
  it('keeps compatibility aggregates outside the browser runtime static graph', () => {
    const runtime = readFileSync(new URL('../../src/domain/views-runtime.ts', import.meta.url), 'utf8');
    expect(runtime).not.toMatch(/import\s+(?!type\b)[^;]*locales\/(?:index|content)\.js/);
    const loader = readFileSync(new URL('../../src/locales/loader.ts', import.meta.url), 'utf8');
    expect(loader).not.toMatch(/import\s+(?!type\b)[^;]*(?:index|content)\.js/);
  });
  it('provides the complete Today catalog without lesson bodies or quiz data', async () => {
    const { LESSONS, LEARN_UNITS } = await import('../../src/locales/catalog.ts');
    expect(LESSONS).toEqual(original.LESSONS.map(({ id, icon, ...copy }) => ({ id, icon, ...Object.fromEntries(Object.entries(copy).map(([language, value]) => [language, { t: value.t }])) })));
    expect(LEARN_UNITS).toEqual(original.LEARN_UNITS);
    expect(JSON.stringify(LESSONS)).not.toContain('"b":');
  });
  it('loads exactly the requested UI/music language plus English fallback with complete fidelity', async () => {
    const { loadUI } = await import('../../src/locales/loader.ts');
    for (const language of languages) {
      const payload = await loadUI(language);
      expect(payload.STRINGS).toEqual(language === 'en' ? { en: ui.STRINGS.en } : { en: ui.STRINGS.en, [language]: ui.STRINGS[language] });
      for (const [category, translations] of Object.entries(ui.I18N_MUSIC)) {
        expect(payload.I18N_MUSIC[category]).toEqual(Object.fromEntries(Object.entries(translations).filter(([key]) => key === 'en' || key === language)));
      }
      expect(payload.STEP_LABELS[language]).toEqual(ui.STEP_LABELS[language]);
      expect(payload.LOCALE_TAGS[language]).toEqual(ui.LOCALE_TAGS[language]);
      expect(payload.LIBRARY).toEqual(language === 'en' ? { en: libraryTranslations.en } : { en: libraryTranslations.en, [language]: libraryTranslations[language] });
    }
  });
  it('preserves every effective lesson, quiz, summary and glossary translation in isolated Learn payloads', async () => {
    const { loadLearn } = await import('../../src/locales/loader.ts');
    for (const language of languages) {
      const payload = await loadLearn(language);
      expect(payload.LESSONS).toEqual(Object.fromEntries(original.LESSONS.map(lesson => [lesson.id, lesson[language] || lesson.en])));
      expect(payload.GLOSS).toEqual(original.GLOSS.map(entry => ({ l: entry.l, en: entry[language] || entry.en, searchEnglish: entry.en[0] })));
      for (const [id, questions] of Object.entries(original.LQZ)) {
        expect(payload.LQZ[id]).toEqual(questions.map(({ i18n, ...q }) => {
          const loc = i18n?.[language];
          return { ...q, q: loc?.q || text(q.q, language),
            ...(q.o ? { o: q.o.map((value, i) => loc?.o?.[i] || text(value, language)) } : {}),
            ...(q.why ? { why: loc?.why || text(q.why, language) } : {}) };
        }));
      }
      expect(payload.LSUM).toEqual(Object.fromEntries(Object.entries(original.LSUM).map(([id, rows]) => [id, rows.map((row, i) => original.LSUM_I18N[language]?.[id]?.[i] || row.map(value => text(value, language)))])));
      expect(loadLearn(language)).toBe(loadLearn(language));
    }
  });
  it('formats the library UI from installed selected-language data without importing the aggregate', async () => {
    const { loadUI } = await import('../../src/locales/loader.ts');
    const { installLibraryCopy, libraryText } = await import('../../src/locales/library-runtime.ts');
    for (const language of languages) {
      installLibraryCopy((await loadUI(language)).LIBRARY);
      expect(libraryText(language, 'heading', { count: 12 })).toBe(libraryTranslations[language].heading.replace('{count}', '12'));
      expect(libraryText('unknown', 'heading', { count: 3 })).toBe('My Library (3)');
    }
  });
  it('shares pending and fulfilled imports, but evicts rejected promises for explicit retry', async () => {
    const { createCachedLoader } = await import('../../src/locales/loader.ts');
    let calls = 0, resolve;
    const get = createCachedLoader(() => { calls++; return new Promise(r => { resolve = r; }); });
    const first = get('fr');
    expect(get('fr')).toBe(first);
    expect(calls).toBe(1);
    resolve({ language: 'fr' });
    await expect(first).resolves.toEqual({ language: 'fr' });
    expect(get('fr')).toBe(first);
    let attempts = 0;
    const retry = createCachedLoader(async () => { if (++attempts === 1) throw new Error('stale chunk'); return 'recovered'; });
    await expect(retry('ro')).rejects.toThrow('stale chunk');
    await expect(retry('ro')).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });
});
