export type AppLanguage = 'en' | 'ro';

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
