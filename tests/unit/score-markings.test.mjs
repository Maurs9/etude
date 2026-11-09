import { describe, expect, it } from 'vitest';
import { STRINGS } from '../../src/locales/index.js';
import { normalizeScoreMarkingText, recognizeScoreMarkings, SCORE_MARKING_TERMS } from '../../src/domain/score-markings.ts';

const keys = (text, options) => recognizeScoreMarkings(text, options).map(part => part.key);

describe('score direction vocabulary', () => {
  it('recognizes every canonical name AND every abbreviation, not aliases instead of canonical names', () => {
    for (const definition of SCORE_MARKING_TERMS) {
      for (const form of definition.forms) {
        expect(keys(form), `${definition.term}: ${form}`).toContain(definition.key);
      }
    }
  });

  it.each([
    ['ritardando', 'sym_t_ritardando'], ['ritard.', 'sym_t_ritardando'], ['rit.', 'sym_t_ritardando'],
    ['rit', 'sym_t_ritardando'], ['rallentando', 'sym_t_rallentando'], ['accelerando', 'sym_t_accelerando'],
    ['espressivo', 'sym_t_espressivo'], ['sostenuto', 'sym_t_sostenuto'],
    ['crescendo', 'sym_t_crescendo'], ['diminuendo', 'sym_t_diminuendo'], ['decrescendo', 'sym_t_diminuendo'],
    ['leggiero', 'sym_t_leggiero'], ['leggero', 'sym_t_leggiero'], ['simile', 'sym_t_sim'],
    ['più', 'sym_t_piu'], ['loco', 'sym_t_loco'], ['Slower', 'sym_t_slower'], ['l.h.-', 'sym_t_lefthand'],
    ['m.d.', 'sym_t_righthand'], ['m.s.', 'sym_t_lefthand'], ['l.v.', 'sym_t_laissezvibrer'],
    ['with pedal throughout', 'sym_t_pedalthroughout'], ['Attacca subito il seguente', 'sym_t_attacca'],
    ['To Coda', 'sym_tocoda'], ['D.S. al Coda', 'sym_dalsegno_coda'],
  ])('explains %s', (text, key) => expect(keys(text)).toEqual([key]));

  it('normalizes accents, combining diacritics, case and Unicode spaces', () => {
    expect(keys('  PIU\u0300\u00a0\u202f MOSSO  ')).toEqual(['sym_t_piumosso']);
    expect(keys('a\u2009tempo')).toEqual(['sym_t_atempo']);
    expect(keys('RÍTARDANDO')).toEqual(['sym_t_ritardando']);
    expect(normalizeScoreMarkingText('ＰＩÙ\u200bmosso')).toBe('piu mosso');
  });

  it('keeps complete supplementary musical glyphs intact while normalizing text', () => {
    expect(normalizeScoreMarkingText('𝅘𝅥𝅮 = 80')).toBe('𝅘𝅥𝅮 = 80');
    expect(keys('𝅘𝅥𝅮 = 80')).toEqual(['sym_metro']);
    expect(keys('\ud834 = 80')).toEqual([]);
  });

  it('uses Unicode letter, number and underscore boundaries, not substring matching', () => {
    for (const text of ['spirit', 'ritardandos', 'ritardando2', '2ritardando', '_ritardando', 'ritardando_', 'allegrossimo', 'dolcissimomente', 'graveyard', 'espressivolé']) {
      expect(keys(text, { allowPartial: true }), text).toEqual([]);
    }
  });

  it('prioritizes longer phrases and preserves reading order', () => {
    expect(keys('Adagio sostenuto')).toEqual(['sym_t_adagio', 'sym_t_sostenuto']);
    expect(keys('Andante espressivo con dolore e senza misura')).toEqual(['sym_t_andante', 'sym_t_espressivo', 'sym_t_condolore', 'sym_t_senzamisura']);
    expect(keys('rit. al fine')).toEqual(['sym_t_ritardando', 'sym_t_alfine']);
    expect(keys('ped. sim.')).toEqual(['sym_ped', 'sym_t_sim']);
    expect(keys('sempre pianissimo e senza sordini')).toEqual(['sym_t_sempre', 'sym_dyn_pp', 'sym_t_senzasordini']);
    expect(keys('poco a poco crescendo')).toEqual(['sym_t_pocoapoco', 'sym_t_crescendo']);
    expect(keys('m.d. m.s.')).toEqual(['sym_t_righthand', 'sym_t_lefthand']);
    expect(keys('dolcissimo')).toEqual(['sym_t_dolcissimo']);
  });

  it('defines the actual historical Moonlight sentence without guessing at unrelated prose', () => {
    expect(keys('Si deve suonare tutto questo pezzo delicatissimamente e senza sordini')).toEqual(['sym_t_moonlight_instruction']);
  });

  it('does not interpret unknown editorial prose or mistake score titles and chords for directions', () => {
    for (const text of ['', '.9', '1:00', 'Am', 'Dm', 'G', 'C', 'F', 'E', 'To', 'Correccoes a algumas notas e dedilhação',
      'Versão minha, alterada com base na japonesa', 'This editor suggests ritardando here', 'An Allegro by Mozart']) expect(keys(text), text).toEqual([]);
    for (const context of ['title', 'composer', 'copyright', 'lyric', 'chord', 'fingering', 'rehearsal']) {
      expect(keys('Allegro', { context }), context).toEqual([]);
    }
    expect(keys('unknown advice: ritardando', { allowPartial: true })).toEqual(['sym_t_ritardando']);
    expect(keys('unknown advice: ritardando')).toEqual([]);
  });

  it('classifies section labels as structure, not tempo or expression', () => {
    expect(keys('Intro')).toEqual(['sym_section_intro']);
    for (const [label, key] of [['Verse', 'sym_section_verse'], ['Bridge', 'sym_section_bridge']]) {
      for (const number of ['1', '2']) {
        const result = recognizeScoreMarkings(label + ' ' + number);
        expect(result[0].key).toBe(key);
        expect(result[0].params).toEqual([number]);
      }
    }
    expect(keys('Verse 1 editorial note')).toEqual([]);
  });

  it('distinguishes combined navigation instructions without overlapping generic meanings', () => {
    for (const [prefix, key] of [['D.S.', 'dalsegno'], ['D.C.', 'dacapo']]) {
      expect(keys(prefix + ' al Fine')).toEqual(['sym_' + key + '_fine']);
      expect(keys(prefix + ' al Coda')).toEqual(['sym_' + key + '_coda']);
      expect(keys(prefix)).toEqual(['sym_' + key]);
    }
  });

  it('returns metronome values as translation parameters, preserving decimals, dots and ranges', () => {
    for (const [text, value] of [['♩ = 72', '72'], ['♪. = 90', '90'], ['𝅗𝅥 = 52.5', '52.5'], ['♩ = 60–72 bpm', '60–72'], ['60 bpm', '60'], ['Lento (    = 60 bpm)', '60']]) {
      const part = recognizeScoreMarkings(text).find(p => p.key === 'sym_metro');
      expect(part?.params, text).toEqual([value]);
    }
    expect(keys('= 72')).toEqual([]);
    expect(keys('♩ = 72bpmOther')).toEqual([]);
  });

  it('deduplicates meanings and has no cross-call RegExp state', () => {
    for (let i = 0; i < 4; i++) expect(keys('ritardando, rit.')).toEqual(['sym_t_ritardando']);
    const first = recognizeScoreMarkings('ritardando')[0];
    first.params.push('mutated by caller');
    expect(recognizeScoreMarkings('ritardando')[0].params).toEqual([]);
  });

  it('spans index normalized text and remain ordered/non-overlapping', () => {
    const original = '  Adágio\u00a0sostenuto, RIT. ';
    const normalized = normalizeScoreMarkingText(original);
    const result = recognizeScoreMarkings(original);
    for (const part of result) expect(normalized.slice(part.at, part.end)).toBe(part.text);
    expect(result.map(p => p.at)).toEqual([0, 7, 18]);
  });

  it('limits oversized input rather than scanning arbitrary editorial documents', () => {
    expect(keys('ritardando '.repeat(500))).toEqual([]);
  });
});

describe('localized music education', () => {
  const nonTextKeys = ['segno', 'coda', 'tocoda', 'dalsegno', 'dacapo', 'fine', 'repeat_start', 'repeat_end', 'repeat_both',
    'volta', 'ottava', 'ottavabassa', 'tuplet', 'accidental_sharp', 'accidental_flat', 'accidental_natural',
    'accidental_doublesharp', 'accidental_doubleflat', 'measure', 'barline', 'doublebar', 'endbar', 'dot', 'timestamp',
    'direction', 'dalsegno_coda', 'dalsegno_fine', 'dacapo_coda', 'dacapo_fine', 'section_intro', 'section_verse', 'section_bridge'];
  const allKeys = [...new Set([...SCORE_MARKING_TERMS.map(d => d.key), 'sym_metro', ...nonTextKeys.map(k => 'sym_' + k)])];

  it('has nonempty educational definitions and matching placeholders in all seven supported languages', () => {
    expect(Object.keys(STRINGS).sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt-BR', 'ro']);
    for (const [language, dictionary] of Object.entries(STRINGS)) {
      for (const key of allKeys) {
        const value = dictionary[key];
        expect(typeof value, `${language}.${key}`).toBe('string');
        expect(value?.includes(' — '), `${language}.${key}: educational explanation`).toBe(true);
        expect((value.match(/%[sab]/g) || []).sort(), `${language}.${key}: placeholders`).toEqual((STRINGS.en[key].match(/%[sab]/g) || []).sort());
        if (language !== 'en') expect(value, `${language}.${key}: real translation`).not.toBe(STRINGS.en[key]);
      }
    }
  });

  it('does not present historical senza sordini as an instruction to hold modern pedal blindly', () => {
    expect(STRINGS.en.sym_t_senzasordini).toMatch(/historical/);
    expect(STRINGS.en.sym_t_senzasordini).toMatch(/adapting pedalling/);
    expect(STRINGS.en.sym_direction).toMatch(/no automatic interpretation/);
    expect(STRINGS.en.sym_timestamp).toContain('%s');
  });
});
