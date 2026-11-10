import type { UIPayload } from './payload-types.js';
import type { LibraryTextKey } from './score-library.js';
export type { LibraryTextKey } from './score-library.js';

// Populated atomically with the rest of the interface, never by an eager aggregate import.
let translations: UIPayload['LIBRARY'] = {};
export function installLibraryCopy(copy: UIPayload['LIBRARY']): void { translations = copy; }
export function libraryText(language: string, key: LibraryTextKey, values: Record<string, string | number> = {}): string {
  const text = translations[language]?.[key] ?? translations.en?.[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] === undefined ? placeholder : String(values[name]));
}
