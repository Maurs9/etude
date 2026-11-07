'use strict';
// Isolated, manually translated feasibility sample; never imported by the app.
// Run: node i18n/it/prototype/prototype.cjs [--build|--check]
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = require('../extract.cjs').extract();
const seed = require('../it.json');
const out = path.join(__dirname, 'prototype.json');
const strings = {
  si_eyebrow: 'Canto a prima vista',
  si_lede: 'Canta la melodia sul pentagramma nel microfono, oppure suonala sulla tastiera o via MIDI se non puoi cantare ad alta voce. Inizia con due note e procedi gradualmente.',
  si_hint_foot: 'Suggerimento: tocca «Tonica» per ascoltare il riferimento tonale prima di iniziare. Il confronto dell’intonazione non tiene conto dell’ottava, quindi può essere usato sia dai bassi sia dai soprani.',
  si_hi_syl: 'È «%s»: riprova',
  si_done: 'Fatto! %s / %s',
  root_pos: 'Le note sono giuste: suona l’accordo allo stato fondamentale (%s al basso).',
  sum_placenote: 'Riconoscevi già a orecchio %a elementi su %b: li abbiamo programmati per il ripasso. Ti insegneremo tutto il resto da zero.',
  rdx_hint_up: '%a gradi sopra la nota di riferimento %b',
  an_semis: '%a semitoni · %b ottave',
  cn_cad_plagal: 'Cadenza plagale (%a): la conclusione dolce dell’«amen», dalla sottodominante alla tonica.',
  cn_sec: '%a è una dominante secondaria (%b): la sua nota alterata verso l’alto tende all’accordo successivo.',
  rdc_tr: 'Leggi partendo da una nota di riferimento, non dalla linea inferiore: il %a centrale, il %b sulla linea della chiave (seconda linea) e il %c sulla linea superiore.',
  rdx_rh_res: '%a% a tempo (%b)',
  si_nicetry: 'Bene: %s / %s. Tocca «Nuova melodia» per riprovare.'
};
// Each item represents one complete source text node, paired with its translation.
// Tags, attributes, entities inside translated fragments, and whitespace-only nodes
// are not machine-translated. Source-text assertions prevent silent drift.
const nodes = [
  ['An ', 'Un '],
  ['interval', 'intervallo'],
  [' is the distance between two notes, counted in half steps. Every melody and every chord is built from them — learn to hear intervals and you can pull songs out of the air.', ' è la distanza tra due note, misurata in semitoni. Ogni melodia e ogni accordo sono costruiti a partire dagli intervalli: impara a riconoscerli a orecchio e potrai ricavare le canzoni ascoltandole.'],
  ['Each interval has a size (2nd, 3rd, 5th…) and a quality (major, minor, perfect). Play them all from C:', 'Ogni intervallo ha un’ampiezza (seconda, terza, quinta…) e una specie (maggiore, minore, giusta). Suonali tutti partendo da C:'],
  ['m2 · 1', '2ª minore · 1'], ['M2 · 2', '2ª maggiore · 2'],
  ['m3 · 3', '3ª minore · 3'], ['M3 · 4', '3ª maggiore · 4'],
  ['P4 · 5', '4ª giusta · 5'], ['Tritone · 6', 'Tritono · 6'],
  ['P5 · 7', '5ª giusta · 7'], ['m6 · 8', '6ª minore · 8'],
  ['M6 · 9', '6ª maggiore · 9'], ['m7 · 10', '7ª minore · 10'],
  ['M7 · 11', '7ª maggiore · 11'], ['Octave · 12', 'Ottava · 12'],
  ['Consonance &amp; dissonance', 'Consonanza &amp; dissonanza'],
  ['Octaves, 5ths, 4ths, 3rds and 6ths sound ', 'Ottave, quinte, quarte, terze e seste suonano '],
  ['stable', 'stabili'],
  [' (consonant). 2nds, 7ths and the tritone sound ', ' (consonanti). Seconde, settime e tritono suonano '],
  ['tense', 'tesi'],
  [' (dissonant) — they want to move somewhere. Music breathes by moving between the two.', ' (dissonanti): tendono a risolversi. La musica respira alternando queste due sensazioni.'],
  ['The fastest way to memorise intervals is to anchor each one to a song you know — a major 6th is the start of “My Bonnie”. Browse the ', 'Per memorizzare rapidamente gli intervalli, associa ciascuno a una canzone che conosci: «My Bonnie» inizia con una sesta maggiore. Consulta la '],
  ['interval song book', 'raccolta di canzoni per gli intervalli'],
  [', then ', ', poi '],
  ['drill them by ear', 'esercitati a riconoscerli a orecchio'],
  ['.', '.']
];
function translateBody(html) {
  let index = 0;
  const result = html.replace(/(<[^>]+>)|([^<]+)/g, (chunk, tag, text) => {
    if (tag || !text.trim()) return chunk;
    const pair = nodes[index++];
    assert.ok(pair, 'Unexpected extra text node');
    assert.equal(text, pair[0], `Source changed at text node ${index}`);
    assert.ok(!/[<>]/.test(pair[1]), `Markup injected at text node ${index}`);
    return pair[1];
  });
  assert.equal(index, nodes.length, 'Text-node count changed');
  return result;
}
const tags = s => s.match(/<[^>]+>/g) || [];
const placeholders = s => (s.match(/%[a-z]/gi) || []).sort();
const entities = s => (s.match(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi) || []).sort();
function compare(label, en, it) {
  assert.equal(typeof it, 'string', label + ': missing');
  assert.ok(it.trim(), label + ': blank');
  assert.deepEqual(placeholders(it), placeholders(en), label + ': placeholders');
  assert.deepEqual(tags(it), tags(en), label + ': tags or attributes');
  assert.deepEqual(entities(it), entities(en), label + ': entities');
}
function check(data) {
  assert.equal(data.metadata.status, 'EXPERIMENTAL — NOT FOR INTEGRATION');
  assert.deepEqual(Object.keys(data.strings).sort(), Object.keys(strings).sort());
  for (const [key, value] of Object.entries(data.strings)) {
    assert.ok(Object.hasOwn(source.strings, key), 'unknown string: ' + key);
    assert.ok(!Object.hasOwn(seed.strings, key), 'already translated in seed: ' + key);
    compare('strings.' + key, source.strings[key], value);
  }
  assert.ok(!Object.hasOwn(seed.lessons, 'iv'), 'lesson already in seed');
  assert.deepEqual(Object.keys(data.lessons), ['iv']);
  compare('lessons.iv.t', source.lessons.iv.t, data.lessons.iv.t);
  compare('lessons.iv.b', source.lessons.iv.b, data.lessons.iv.b);
  assert.equal(data.lessons.iv.b, translateBody(source.lessons.iv.b), 'Body drift');
  assert.throws(() => compare('tampered placeholder', source.strings.rdc_tr, data.strings.rdc_tr.replace('%c', '%d')), /placeholders/);
  assert.throws(() => compare('tampered tag', source.lessons.iv.b, data.lessons.iv.b.replace('data-demo="iv:60:1"', 'data-demo="iv:60:9"')), /tags or attributes/);
  assert.throws(() => compare('tampered entity', source.lessons.iv.b, data.lessons.iv.b.replace('&amp;', '&')), /entities/);
  console.log(`${Object.keys(data.strings).length} missing strings + 1 missing lesson (title and body): parity passed`);
  console.log(`${tags(data.lessons.iv.b).length} ordered tags/attributes; ${entities(data.lessons.iv.b).length} entities; ${nodes.length} text nodes; %c included`);
  console.log('Negative checks passed: damaged placeholder, tag attribute and entity rejected');
}
if (process.argv.includes('--build')) {
  assert.ok(!fs.existsSync(out), 'Refusing to overwrite existing prototype.json');
  const data = {metadata:{language:'it',status:'EXPERIMENTAL — NOT FOR INTEGRATION',provider:'gpt-6.1-terra via OpenAI-Codex (Hermes Agent); model-authored, no separate translation service', scope:'Public source only; no user data transmitted', limitations:'Small sample, not native-reviewed; not full app coverage; preserves existing source pedagogy and music notation. No runtime integration.'}, strings, lessons:{iv:{t:'Gli intervalli',b:translateBody(source.lessons.iv.b)}}};
  check(data);
  fs.writeFileSync(out, JSON.stringify(data,null,2)+'\n', {flag:'wx'});
  console.log('Created ' + out);
} else if (process.argv.includes('--check')) {
  check(JSON.parse(fs.readFileSync(out, 'utf8')));
} else {
  throw new Error('Specify --build or --check');
}
