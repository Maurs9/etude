import { describe, expect, it } from 'vitest';
import { SC_ARTS, SC_DYN, scoreSymText, scoreTermParts } from '../../src/domain/score-symbols.ts';
import { STRINGS } from '../../src/locales/index.js';

function makeTranslator(lang) {
  const dict = STRINGS[lang];
  return (key, ...args) => {
    let text = dict[key];
    expect(text, `${lang}:${key}`).toBeDefined();
    if (!args.length) return text;
    if (args[0] != null) text = text.replace('%a', () => String(args[0]));
    if (args[1] != null) text = text.replace('%b', () => String(args[1]));
    for (const arg of args) {
      if (arg != null) text = text.replace('%s', () => String(arg));
    }
    return text;
  };
}

describe('score-symbols pure helpers', () => {
  it('matches valid dynamic tokens and maps articulation codes cleanly', () => {
    for (const dyn of ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'fz', 'rfz', 'fp', 'sf', 'sfp']) {
      expect(SC_DYN.test(dyn), dyn).toBe(true);
    }
    for (const invalid of ['', 'P', 'mf2', 'forte', 'sffz', 'p ']) {
      expect(SC_DYN.test(invalid), invalid).toBe(false);
    }
    expect(SC_ARTS['a.']).toBe('staccato');
    expect(SC_ARTS['a>']).toBe('accent');
    expect(SC_ARTS['a@a']).toBe('fermata');
    expect(SC_ARTS.tr).toBe('trill');
    expect(SC_ARTS.mordent_inverted).toBe('mordent');
    expect(SC_ARTS.turn_inverted).toBe('turn');
  });

  it('formats rest tooltips with dots, measure rests, and locale-aware capitalization', () => {
    const tEn = makeTranslator('en');
    const quarter = scoreSymText({ kind: 'rest', val: { type: 'quarter', dots: 0 } }, tEn, 'en');
    expect(quarter.head[0]).toBe(quarter.head[0].toUpperCase());
    expect(quarter.line).toBe(`${quarter.head} — ${quarter.body}`);

    const dotted = scoreSymText({ kind: 'rest', val: { type: 'half', dots: 1 } }, tEn, 'en');
    expect(dotted.head.toLowerCase()).toContain('dotted');

    const doubleDotted = scoreSymText({ kind: 'rest', val: { type: 'quarter', dots: 2 } }, tEn, 'en');
    expect(doubleDotted.head).toContain('2');

    const measureRest = scoreSymText({ kind: 'rest', val: { type: 'measure', dots: 0 } }, tEn, 'en');
    expect(measureRest.body).not.toBe(quarter.body);
  });

  it('translates direction terms with scoreTermParts and builds text symbol tooltips', () => {
    const tEn = makeTranslator('en');
    const parts = scoreTermParts('rit. e dolce', tEn);
    expect(parts.length).toBeGreaterThanOrEqual(2);

    const sym = scoreSymText({ kind: 'text', val: 'rit. e dolce' }, tEn, 'en');
    expect(sym.head).toBe('rit. e dolce');
    expect(sym.body).toBe(parts.join(' · '));
    expect(sym.line).toBe(`rit. e dolce · ${parts.join(' · ')}`);
  });

  it('normalizes dynamics, fingerings, time signatures, voltas, and fallback kinds across locales', () => {
    for (const lang of ['en', 'ro']) {
      const t = makeTranslator(lang);

      // Dynamics aliases sf -> sfz and sfp -> fp, keeping the printed literal prefix.
      const sf = scoreSymText({ kind: 'dyn', val: 'sf' }, t, lang);
      const sfz = scoreSymText({ kind: 'dyn', val: 'sfz' }, t, lang);
      expect(sf.head.startsWith('sf · ')).toBe(true);
      expect(sf.body).toBe(sfz.body);

      const sfp = scoreSymText({ kind: 'dyn', val: 'sfp' }, t, lang);
      const fp = scoreSymText({ kind: 'dyn', val: 'fp' }, t, lang);
      expect(sfp.head.startsWith('sfp · ')).toBe(true);
      expect(sfp.body).toBe(fp.body);

      // Single fingering, finger substitution, and fallback without digits.
      const fSingle = scoreSymText({ kind: 'finger', val: '1' }, t, lang);
      expect(fSingle.head.startsWith('1 · ')).toBe(true);
      expect(fSingle.line).toContain(t('sym_f1'));

      const fSub = scoreSymText({ kind: 'finger', val: '1-2' }, t, lang);
      expect(fSub.head.startsWith('1-2 · ')).toBe(true);
      expect(fSub.line).toContain('1, 2');

      const fUnknown = scoreSymText({ kind: 'finger', val: 'x' }, t, lang);
      expect(fUnknown.head.startsWith('x · ')).toBe(true);
      expect(fUnknown.line).toContain('?');

      // Literal-prefixed kinds vs non-prefixed kinds.
      const time = scoreSymText({ kind: 'time', val: '3/4' }, t, lang);
      expect(time.head.startsWith('3/4 · ')).toBe(true);
      expect(time.line).toContain('3');
      expect(time.line).toContain('4');

      const volta = scoreSymText({ kind: 'volta', val: '1.' }, t, lang);
      expect(volta.head.startsWith('1. · ')).toBe(true);

      const key = scoreSymText({ kind: 'key', val: 'G major' }, t, lang);
      expect(key.head.startsWith('G major · ')).toBe(false);
      expect(key.line).toContain('G major');

      const tempo = scoreSymText({ kind: 'tempo', val: '♩ = 120' }, t, lang);
      expect(tempo.line).toContain('120');

      const timestamp = scoreSymText({ kind: 'timestamp', val: '1:05' }, t, lang);
      expect(timestamp.line).toContain('1:05');

      for (const simpleKind of ['rehearsal', 'chord', 'direction', 'staccato', 'cresc', 'dim', 'grace']) {
        const res = scoreSymText({ kind: simpleKind, val: simpleKind === 'rehearsal' ? 'A' : '' }, t, lang);
        expect(res.head.length, `${lang}:${simpleKind}`).toBeGreaterThan(0);
        expect(res.line.length, `${lang}:${simpleKind}`).toBeGreaterThan(0);
      }
    }
  });
});
