import { describe, expect, it } from 'vitest';
import { createCoaching } from '../../src/app/coaching.ts';

const STR = { coach_next: 'Next step:', tip: 'Play %a at %b', act: 'Loop %a' };
const make = (lang = 'en') => createCoaching({ t: (k) => STR[k] ?? k, lang: () => lang, escape: (s) => String(s).replace(/</g, '&lt;') });

describe('shell coaching', () => {
  it('fills placeholders, lists items and escapes the tip markup', () => {
    const c = make();
    expect(c.tf('tip', 'bar 3', 80)).toBe('Play bar 3 at 80');
    expect(c.tf('tip', null, 80)).toBe('Play %a at 80');
    expect(c.coachList(['A', 'B', 'C'])).toBe('A, B, and C');
    const html = c.coachHTML('Next step:', { k: 'tip', args: () => ['<b>', 60], act: { k: 'act', args: () => ['bar 2'], run: () => {} } }, 'go');
    expect(html).toContain('<span class="coach-t">Play &lt;b> at 60</span>');
    expect(html).toContain('<button type="button" class="btn sm" id="go">Loop bar 2</button>');
    expect(c.coachHTML('Lead', { k: 'tip' })).not.toContain('coach-act');
  });

  it('re-words every registered surface in registration order and stops after unregistering', () => {
    const c = make(), calls = [];
    c.register(() => calls.push('read'));
    const off = c.register(() => calls.push('drills'));
    c.register(() => calls.push('score'));
    c.refresh();
    off();
    c.refresh();
    expect(calls).toEqual(['read', 'drills', 'score', 'read', 'score']);
  });
});
