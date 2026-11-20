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
    const files = ['catalog', 'ui-base', ...languages.flatMap(language => [`ui-${language}`, `learn-${language}`])].map(name => new URL(`../../src/locales/${name}.ts`, import.meta.url));
    const mtimes = files.map(file => statSync(file).mtimeMs);
    expect(execFileSync(process.execPath, ['scripts/split-locales.mjs', '--check'], { encoding: 'utf8' })).toContain('Verified 16 generated locale files.');
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
  it('loads exactly the requested language: its own strings, and the English music terms and library copy under it', async () => {
    const { loadUI } = await import('../../src/locales/loader.ts');
    for (const language of languages) {
      const payload = await loadUI(language);
      // English interface strings load only for English: every other language has every string of its own.
      expect(payload.STRINGS).toEqual({ [language]: ui.STRINGS[language] });
      for (const [category, translations] of Object.entries(ui.I18N_MUSIC)) {
        expect(payload.I18N_MUSIC[category]).toEqual(Object.fromEntries(Object.entries(translations).filter(([key]) => key === 'en' || key === language)));
      }
      expect(payload.STEP_LABELS[language]).toEqual(ui.STEP_LABELS[language]);
      expect(payload.LOCALE_TAGS[language]).toEqual(ui.LOCALE_TAGS[language]);
      expect(payload.LIBRARY).toEqual(language === 'en' ? { en: libraryTranslations.en } : { en: libraryTranslations.en, [language]: libraryTranslations[language] });
    }
  });
  it('keeps the corrected German and Italian key-playing prompts aligned with their pitch targets', async () => {
    const { loadLearn } = await import('../../src/locales/loader.ts');
    const de = await loadLearn('de'), it = await loadLearn('it');
    for (const [payload, lesson, question, target, text] of [
      [de, 'iv', 4, { seq: [2, 9] }, 'zuerst D, dann A'],
      [de, 'sc', 4, { pcs: [7, 11, 2] }, 'G-Dur (G, H, D)'],
      [de, 'minor', 5, { pcs: [9, 0, 4] }, 'a-Moll-Dreiklang (A, C, E)'],
      [de, 'ch', 4, { pcs: [5, 9, 0] }, 'F-Dur-Dreiklang (F, A, C)'],
      [it, 'notation', 4, { seq: [7] }, 'Sol4'],
      [it, 'iv', 4, { seq: [2, 9] }, 'prima Re, poi La'],
      [it, 'iv2', 4, { seq: [5, 11] }, 'prima Fa, poi Si'],
      [it, 'sc', 4, { pcs: [7, 11, 2] }, 'Sol maggiore (Sol, Si, Re)'],
      [it, 'minor', 5, { pcs: [9, 0, 4] }, 'La minore (La, Do, Mi)'],
      [it, 'cof', 4, { pcs: [2, 6, 9] }, 'Re maggiore (Re, Fa♯, La)'],
      [it, 'ch', 3, { pcs: [9, 0, 4] }, 'La minore (La, Do, Mi)'],
      [it, 'ch', 4, { pcs: [5, 9, 0] }, 'Fa maggiore (Fa, La, Do)'],
      [it, 'ch7', 5, { pcs: [7, 11, 2, 5] }, 'Sol7 (Sol, Si, Re, Fa)'],
      [it, 'pr', 4, { pcs: [5, 9, 0] }, 'accordo IV in Do maggiore (Fa, La, Do)'],
      [it, 'minorh', 3, { pcs: [4, 8, 11] }, 'Mi maggiore'],
      [it, 'secdom', 4, { pcs: [9, 1, 4, 7] }, 'La7 — V/ii in Do maggiore (La, Do♯, Mi, Sol)'],
    ]) {
      expect(payload.LQZ[lesson][question]).toMatchObject({ ...target, q: expect.stringContaining(text) });
    }
    for (const payload of [de, it]) {
      for (const question of Object.values(payload.LQZ).flat().filter(entry => entry.seq || entry.pcs)) {
        expect(question.q).not.toMatch(/indicat[aeo]|mostrat[aeo]|richiest[aeo]/i);
      }
    }
    for (const [lesson, question] of [
      ['rh', 2], ['iv', 0], ['iv', 3], ['sc', 3], ['minor', 4],
      ['ch', 1], ['ch7', 1], ['cad', 2], ['accomp', 1],
    ]) {
      expect(de.LQZ[lesson][question].q).toMatch(/Höre|erklingt/);
      expect(it.LQZ[lesson][question].q).toContain('Ascolta');
    }
    expect(de.LQZ.ch[1].o[0]).toBe('Moll');
    expect(it.LQZ.ch[1].o[0]).toBe('Minore');
    expect(it.LQZ.cad[2].o[0]).toContain("D'inganno");
    expect(de.LESSONS.rh2.b).toContain('<h4>Zusammengesetzte Taktarten</h4>');
    expect(de.LESSONS.rh2.b).toContain('<h4>Tempoangaben</h4>');
    expect(de.LESSONS.rh2.b.match(/data-staff="rh2[a-c]"/g)).toHaveLength(3);
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
