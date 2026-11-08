export type AppLanguage = 'en' | 'ro';

export interface BootState {
  language: AppLanguage;
  ready: boolean;
}

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  value === 'en' || value === 'ro';

declare global {
  interface Object {
    [key: string]: any;
  }

  interface Element {
    [key: string]: any;
  }

  interface Window {
    [key: string]: any;
    __etude: Record<string, any>;
    __etudeBooted?: () => void;
  }
}
