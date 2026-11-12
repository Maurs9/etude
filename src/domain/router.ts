export const NAV_GROUPS = {
  today: ['today'],
  learn: ['learn', 'method'],
  practice: ['practice', 'read', 'sing', 'explore', 'accompany', 'transcribe'],
  scores: ['analysis'],
  progress: ['progress'],
} as const;

// Screens that moved into the Practice setup. An old link or a saved lastTool still names them: Practice opens set up
// for them (Intervals with the Song hints open).
export const MOVED_VIEWS = ['songs'] as const;

export type AppView = typeof NAV_GROUPS[keyof typeof NAV_GROUPS][number];
export type ViewGroup = keyof typeof NAV_GROUPS;
export type MovedView = typeof MOVED_VIEWS[number];

export function navGroup(view: string): ViewGroup | undefined {
  return (Object.keys(NAV_GROUPS) as ViewGroup[]).find(group =>
    (NAV_GROUPS[group] as readonly string[]).includes(view),
  );
}

export function isAppView(view: string): view is AppView {
  return navGroup(view) !== undefined;
}

export function isMovedView(view: string): view is MovedView {
  return (MOVED_VIEWS as readonly string[]).includes(view);
}

export function viewFromHash(hash: string): AppView | MovedView {
  const view = hash.replace(/^#/, '');
  return isAppView(view) || isMovedView(view) ? view : 'today';
}
