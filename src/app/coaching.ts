import type { CoachTip, TranslateFn } from '../domain/views.js';

/*
 * Cross-surface coaching: one short tip per surface, chosen from what is on screen and how the last attempt went. Read & play
 * keeps a "Reading focus" line that becomes a "Next step" when a run ends; reading drills get a focus line and a next step;
 * Score & analysis gets "What to notice" and a next step in its practice summary. A tip keeps the facts it was chosen from
 * and is re-worded after a language or notation change: each surface registers a refresher, and refresh() runs them in
 * registration order.
 */
export interface CoachingDeps {
  readonly t: TranslateFn;
  readonly lang: () => string;
  readonly escape: (text: string) => string;
}

export interface Coaching {
  /** Translates `key` and fills %a, %b and %c from `args`. */
  tf(key: string, ...args: unknown[]): string;
  /** "A, B and C" in the interface language (a plain comma list where Intl.ListFormat is missing). */
  coachList(items: string[]): string;
  coachText(tip: CoachTip): string;
  /** The lead ("Reading focus:", "Next step:"), the tip, and an optional button that does what the tip suggests. */
  coachHTML(lead: string, tip: CoachTip, actId?: string): string;
  /** Adds a surface's re-wording step; returns the unregister function. */
  register(refresh: () => void): () => void;
  refresh(): void;
}

export function createCoaching(deps: CoachingDeps): Coaching {
  const refreshers: Array<() => void> = [];

  function tf(k: string, ...a: unknown[]): string {
    let s = deps.t(k);
    ['%a', '%b', '%c'].forEach((p, i) => { if (a[i] != null) s = s.split(p).join(String(a[i])); });
    return s;
  }

  function coachList(xs: string[]): string {
    try {
      return new Intl.ListFormat(deps.lang(), { type: 'conjunction' }).format(xs);
    }
    catch {
      return xs.join(', ');
    }
  }

  const coachText = (c: CoachTip): string => tf(c.k, ...(c.args ? c.args() : []));

  function coachHTML(lead: string, c: CoachTip, actId?: string): string {
    const e = deps.escape, act = c.act ? tf(c.act.k, ...(c.act.args ? c.act.args() : [])) : '';
    return `<span class="coach-k">${e(lead)}</span> <span class="coach-t">${e(coachText(c))}</span>` + (act ? `<span class="coach-act"><button type="button" class="btn sm" id="${actId}">${e(act)}</button></span>` : '');
  }

  return {
    tf,
    coachList,
    coachText,
    coachHTML,
    register(refresh) {
      refreshers.push(refresh);
      return () => {
        const i = refreshers.indexOf(refresh);
        if (i >= 0) refreshers.splice(i, 1);
      };
    },
    refresh() {
      for (const refresh of [...refreshers]) refresh();
    },
  };
}
