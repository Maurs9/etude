import type { InterfaceLanguage } from '../types/architecture.js';
import type { LearnPayload, UIPayload } from './payload-types.js';

const learnImports: Record<InterfaceLanguage, () => Promise<{ default: LearnPayload }>> = {
  en: () => import('./learn-en.js'),
  ro: () => import('./learn-ro.js'),
  es: () => import('./learn-es.js'),
  fr: () => import('./learn-fr.js'),
  de: () => import('./learn-de.js'),
  it: () => import('./learn-it.js'),
  'pt-BR': () => import('./learn-pt-BR.js'),
};

const uiImports: Record<InterfaceLanguage, () => Promise<{ default: UIPayload }>> = {
  en: () => import('./ui-en.js'),
  ro: () => import('./ui-ro.js'),
  es: () => import('./ui-es.js'),
  fr: () => import('./ui-fr.js'),
  de: () => import('./ui-de.js'),
  it: () => import('./ui-it.js'),
  'pt-BR': () => import('./ui-pt-BR.js'),
};

/** Deduplicate concurrent loads and retain successes, never poison retries with a rejection. */
export function createCachedLoader<T>(load: (language: InterfaceLanguage) => Promise<T>): (language: InterfaceLanguage) => Promise<T> {
  const pending = new Map<InterfaceLanguage, Promise<T>>();
  return (language) => {
    const cached = pending.get(language);
    if (cached) return cached;
    const promise = load(language).catch((error: unknown) => {
      pending.delete(language);
      throw error;
    });
    pending.set(language, promise);
    return promise;
  };
}
export const loadLearn = createCachedLoader(async (language) => (await learnImports[language]()).default);
const loadUIChunk = createCachedLoader(async (language) => (await uiImports[language]()).default);

// The English fallbacks of another language: music terms, step labels and library copy, without the interface strings.
let uiBase: Promise<UIPayload> | null = null;
const loadUIBase = (): Promise<UIPayload> => {
  uiBase ??= import('./ui-base.js').then((module) => module.default).catch((error: unknown) => { uiBase = null; throw error; });
  return uiBase;
};

export const loadUI = createCachedLoader(async (language): Promise<UIPayload> => {
  if (language === 'en') return loadUIChunk('en');
  // English interface strings are not loaded for another language: it has every string of its own.
  const [en, selected] = await Promise.all([loadUIBase(), loadUIChunk(language)]);
  const music = { ...en.I18N_MUSIC };
  for (const category of Object.keys(music) as Array<keyof typeof music>) {
    Object.assign(music, { [category]: { ...music[category], ...selected.I18N_MUSIC[category] } });
  }
  return {
    STRINGS: { ...en.STRINGS, ...selected.STRINGS },
    I18N_MUSIC: music,
    STEP_LABELS: { ...en.STEP_LABELS, ...selected.STEP_LABELS },
    LOCALE_TAGS: { ...en.LOCALE_TAGS, ...selected.LOCALE_TAGS },
    LIBRARY: { ...en.LIBRARY, ...selected.LIBRARY },
  };
});
