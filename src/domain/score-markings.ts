/** Language-independent recognition of *direction labels*, not arbitrary score text.
 * Callers must exclude title/composer/copyright, harmony, lyrics and fingering nodes.
 * Unknown prose is deliberately not interpreted. Returned spans index normalizedText,
 * not the original UTF-16 text (normalization can change its length).
 */
export interface ScoreMarkingMeaning {
  /** Existing i18n key; translate with t(key, ...params). */
  key: string;
  params: string[];
  /** Stable semantic identifier, independent of spelling and display language. */
  term: string;
  at: number;
  end: number;
  text: string;
}

export interface ScoreMarkingOptions {
  /** Metadata must never become a musical instruction, even if called Allegro. */
  context?: 'direction' | 'title' | 'composer' | 'copyright' | 'lyric' | 'chord' | 'fingering' | 'rehearsal';
  /** Opt in only for an already verified musical direction. Unknown text is NOT defined. */
  allowPartial?: boolean;
}

export function normalizeScoreMarkingText(text: string): string {
  // Normalize letter/number runs only: NFKD decomposes supplementary musical-note
  // glyphs too, and removing their combining stems/flags would destroy beat units.
  return text.replace(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu,
    (token) => token.normalize('NFKD').replace(/\p{M}/gu, '')).toLowerCase()
    .replace(/[’‘]/g, "'").replace(/[\s\u200b\ufeff]+/gu, ' ').trim();
}

interface TermDefinition { term: string; key: string; forms: readonly string[] }
const word = (term: string, ...aliases: string[]): TermDefinition => ({ term, key: `sym_t_${term}`, forms: [term, ...aliases] });
const symbol = (term: string, ...forms: string[]): TermDefinition => ({ term, key: `sym_${term}`, forms: [term, ...forms] });

/** Canonical names are ALWAYS included, even when abbreviations also exist. */
export const SCORE_MARKING_TERMS: readonly TermDefinition[] = [
  word('dolcissimo'), word('dolce'), word('espressivo', 'espress.', 'espress', 'espr.', 'espr'),
  word('cantabile', 'cantab.'), word('legato'), word('leggiero', 'leggero'),
  word('sostenuto', 'sost.', 'sost'), word('ritardando', 'ritard.', 'ritard', 'rit.', 'rit'),
  word('rallentando', 'rall.', 'rall'), word('accelerando', 'accel.', 'accel'),
  word('atempo', 'a tempo'), word('rubato'), word('crescendo', 'cresc.', 'cresc'),
  word('diminuendo', 'decrescendo', 'dim.', 'dim', 'decresc.', 'decresc'),
  word('poco'), word('piu', 'più'), word('molto'), word('sempre'), word('sim', 'simile', 'sim.'),
  word('grave'), word('largo'), word('larghetto'), word('lento'), word('adagio'),
  word('andantino'), word('andante'), word('moderato'), word('allegretto'), word('allegro'),
  word('vivace'), word('presto'), word('prestissimo'), word('ritenuto', 'riten.', 'riten'),
  word('stringendo', 'string.', 'string'), word('calando'), word('morendo'), word('smorzando', 'smorz.'),
  word('maestoso'), word('agitato'), word('animato'), word('scherzando'), word('tranquillo'),
  word('conmoto', 'con moto'), word('nontroppo', 'non troppo'), word('menomosso', 'meno mosso'),
  word('piumosso', 'più mosso', 'piu mosso'), word('tempoprimo', 'tempo primo', 'tempo i', 'tempo 1'),
  word('pocoapoco', 'poco a poco'), word('condolore', 'con dolore'), word('senzamisura', 'senza misura'),
  word('attacca', 'attacca subito il seguente', 'attacca subito'), word('slower'),
  word('loco'), word('righthand', 'm.d.', 'm. d.', 'md', 'r.h.', 'r. h.', 'right hand', 'mano destra', 'main droite'),
  word('lefthand', 'm.s.', 'm. s.', 'ms', 'm.g.', 'm. g.', 'l.h.', 'l. h.', 'left hand', 'mano sinistra', 'main gauche'),
  word('laissezvibrer', 'laissez vibrer', 'l.v.', 'l. v.'),
  word('senzasordini', 'senza sordini'), word('pedalthroughout', 'with pedal throughout'),
  word('alfine', 'al fine'),
  word('moonlight_instruction', 'si deve suonare tutto questo pezzo delicatissimamente e senza sordini'),
  symbol('ped', 'ped.', 'pedal'),
  ...(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'fz', 'rfz', 'fp'] as const).map((dynamic) => ({
    term: dynamic, key: `sym_dyn_${dynamic}`, forms: [
      ...({ ppp: ['pianississimo'], pp: ['pianissimo'], p: ['piano'], mp: ['mezzo piano'], mf: ['mezzo forte'],
        f: ['forte'], ff: ['fortissimo'], fff: ['fortississimo'], sfz: ['sforzando', 'sforzato'],
        fz: ['forzando'], rfz: ['rinforzando'], fp: ['fortepiano', 'forte-piano'] })[dynamic],
    ],
  })),
  ...(['staccato', 'staccatissimo', 'tenuto', 'marcato', 'mordent', 'turn'] as const).map((term) => symbol(term)),
  symbol('trill', 'tr'),
  symbol('segno'), symbol('coda'), symbol('tocoda', 'to coda', 'al coda'),
  symbol('fine'), symbol('dalsegno', 'dal segno', 'd.s.', 'd. s.', 'ds'),
  symbol('dacapo', 'da capo', 'd.c.', 'd. c.', 'dc'),
  symbol('dalsegno_coda', 'dal segno al coda', 'd.s. al coda', 'd. s. al coda', 'ds al coda'),
  symbol('dacapo_coda', 'da capo al coda', 'd.c. al coda', 'd. c. al coda', 'dc al coda'),
  symbol('dalsegno_fine', 'dal segno al fine', 'd.s. al fine', 'd. s. al fine', 'ds al fine'),
  symbol('dacapo_fine', 'da capo al fine', 'd.c. al fine', 'd. c. al fine', 'dc al fine'),
  symbol('ottava', '8va', '8va alta', 'ottava alta'), symbol('ottavabassa', '8vb', '8va bassa', 'ottava bassa'),
];

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = SCORE_MARKING_TERMS.map((definition) => ({
  ...definition,
  re: new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])(${[...new Set(definition.forms.map(normalizeScoreMarkingText))]
    .sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?=$|[^\\p{L}\\p{M}\\p{N}_])`, 'gu'),
}));

/** Recognize only documented musical vocabulary, in reading order, longest phrase first.
 * No title/chord inference and no fabricated meaning for editorial prose. By default,
 * unknown words reject the label; allowPartial explains ONLY the returned known spans.
 * Repeated semantic keys are deduplicated. Translation remains the caller's job.
 */
export function recognizeScoreMarkings(input: string, options: ScoreMarkingOptions = {}): ScoreMarkingMeaning[] {
  if (options.context && options.context !== 'direction') return [];
  const text = normalizeScoreMarkingText(input);
  if (!text || text.length > 4096) return [];
  const candidates: ScoreMarkingMeaning[] = [];
  const section = /^(intro|verse|bridge)(?:\s*(\d+))?$/.exec(text);
  if (section) candidates.push({ key: `sym_section_${section[1]}`, params: section[1] === 'intro' ? [] : [section[2] ?? ''],
    term: `section_${section[1]}`, at: 0, end: text.length, text });
  for (const definition of compiled) {
    // matchAll clones the RegExp: there is no state shared between calls.
    for (const match of text.matchAll(definition.re)) {
      const at = (match.index ?? 0) + match[1].length;
      candidates.push({ key: definition.key, params: [], term: definition.term, at, end: at + match[2].length, text: match[2] });
    }
  }
  // A BMP or supplementary-plane *complete note* glyph, optionally dotted, or explicit BPM.
  // Never accept a bare high surrogate as a beat symbol or a bare '= 60' as a metronome mark.
  const metro = /(?:[♩♪♫♬\u{1D15D}-\u{1D164}]\s*[.·]?\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s*bpm)?|(?<![\p{L}\p{N}_])(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)\s*bpm)(?![\p{L}\p{N}_])/gu;
  for (const match of text.matchAll(metro)) {
    // Preserve ranges/decimals rather than silently dropping their second half.
    const value = match[0].replace(/^.*?=\s*/, '').replace(/\s*bpm$/, '').trim();
    candidates.push({ key: 'sym_metro', params: [value], term: 'metro', at: match.index, end: match.index + match[0].length, text: match[0] });
  }
  candidates.sort((a, b) => a.at - b.at || (b.end - b.at) - (a.end - a.at));
  const selected: ScoreMarkingMeaning[] = [];
  let end = -1;
  for (const candidate of candidates) {
    if (candidate.at < end) continue;
    selected.push(candidate);
    end = candidate.end;
  }
  if (!options.allowPartial) {
    let remainder = text;
    for (const part of [...selected].reverse()) remainder = remainder.slice(0, part.at) + ' '.repeat(part.end - part.at) + remainder.slice(part.end);
    // Conjunctions only join two known instructions; everything else is unexplained prose.
    if (selected.length > 1) remainder = remainder.replace(/\b(?:e|ed|and)\b/gu, ' ');
    if (/[\p{L}\p{M}\p{N}_]/u.test(remainder)) return [];
  }
  const seen = new Set<string>();
  return selected.filter((part) => {
    const identity = JSON.stringify([part.key, part.params]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
