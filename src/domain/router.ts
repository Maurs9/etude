export const NAV_GROUPS = {
  today: ['today'],
  learn: ['learn', 'method'],
  practice: ['practice', 'read', 'sing', 'explore'],
  scores: ['analysis'],
  progress: ['progress'],
} as const;

// Screens that moved into the Practice setup. An old link or a saved lastTool still names them: Practice opens set up
// for them (Intervals with the Song hints open, Progressions with Play along).
export const MOVED_VIEWS = ['songs', 'accompany'] as const;

// Screens merged into another screen. An old link or a saved lastTool still names them: the screen that holds them now
// opens (Transcribe is the Hum to notes side of Voice, whose view id is sing).
export const MERGED_VIEWS = { transcribe: 'sing' } as const;

export type AppView = typeof NAV_GROUPS[keyof typeof NAV_GROUPS][number];
export type ViewGroup = keyof typeof NAV_GROUPS;
export type MovedView = typeof MOVED_VIEWS[number];
export type MergedView = keyof typeof MERGED_VIEWS;

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

export function isMergedView(view: string): view is MergedView {
  return Object.hasOwn(MERGED_VIEWS, view);
}

export type AnalysisRoute =
  | { kind: 'catalog' }
  | { kind: 'builtin'; id: string }
  | { kind: 'lib'; id: string };

export function parseAnalysisHash(hash: string): AnalysisRoute | null {
  const clean = hash.replace(/^#/, '');
  if (clean === 'analysis') return { kind: 'catalog' };
  const match = /^analysis\/(builtin|lib)\/([^/]+)$/.exec(clean);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2]);
    if (!id || id.includes('/')) return null;
    return match[1] === 'builtin' ? { kind: 'builtin', id } : { kind: 'lib', id };
  }
  catch {
    return null;
  }
}

export function formatAnalysisHash(route: AnalysisRoute): string {
  if (route.kind === 'catalog') return '#analysis';
  return `#analysis/${route.kind}/${encodeURIComponent(route.id)}`;
}

export function viewFromHash(hash: string): AppView | MovedView | MergedView {
  if (parseAnalysisHash(hash)) return 'analysis';
  const view = hash.replace(/^#/, '');
  return isAppView(view) || isMovedView(view) || isMergedView(view) ? view : 'today';
}
