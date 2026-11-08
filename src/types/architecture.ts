export type AppLanguage = 'en' | 'ro';
/** Every interface language the shell offers; `AppLanguage` names the original two. */
export type InterfaceLanguage = AppLanguage | 'es' | 'fr' | 'de' | 'it' | 'pt-BR';

export interface BootState {
  language: AppLanguage;
  ready: boolean;
}

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'en' || value === 'ro';

declare global {
  interface Window {
    __etude: Record<string, unknown>;
    __etudeBooted?: () => void;
  }
}
