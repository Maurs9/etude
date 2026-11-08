export const NAV_GROUPS = {
  today: ['today'],
  learn: ['learn', 'songs', 'method'],
  practice: ['practice', 'read', 'sing', 'analysis'],
  explore: ['explore', 'accompany', 'transcribe'],
  progress: ['progress'],
} as const;

export type AppView = typeof NAV_GROUPS[keyof typeof NAV_GROUPS][number];
export type ViewGroup = keyof typeof NAV_GROUPS;

export function navGroup(view: string): ViewGroup | undefined {
  return (Object.keys(NAV_GROUPS) as ViewGroup[]).find(group =>
    (NAV_GROUPS[group] as readonly string[]).includes(view),
  );
}

export function isAppView(view: string): view is AppView {
  return navGroup(view) !== undefined;
}

export function viewFromHash(hash: string): AppView {
  const view = hash.replace(/^#/, '');
  return isAppView(view) ? view : 'today';
}
