'use strict';
// Extract trusted repository JavaScript only. Do not run on untrusted HTML.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'src', 'legacy', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
function between(start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw Error(`Cannot locate source boundary: ${start} ... ${end}`);
  return html.slice(a, b);
}
const initial = between('const STRINGS={', '\nfunction t(k');
const assigns = [...html.matchAll(/Object\.assign\(STRINGS\.(?:en|ro),\s*\{[\s\S]*?\n\}\);/g)].map(m => m[0]).join('\n');
if (!assigns) throw Error('No supplemental dictionaries found');
const script = [
  initial, assigns,
  between('const INTERVALS=', 'CHORDS.forEach('),
  between('const CHORD_FEEL=', '\nconst ',),
  between('const INV_NAMES=', '\nconst ',),
  between('const CATS=', '\n',),
  between('const LESSONS=', '/* ---------- LEARN v4:'),
  between('const LEARN_UNITS=', '\nconst LEARN_OLD_ORDER'),
  between('const GLOSS=', '\nfunction lgNorm'),
  between('const LQZ=', '\nconst LDUR='),
  `const pick = v => Array.isArray(v) ? v[0] : v;
  JSON.stringify({
    strings:STRINGS.en,
    lessons:Object.fromEntries(LESSONS.map(x=>[x.id,x.en])),
    units:Object.fromEntries(LEARN_UNITS.map(x=>[x.id,x.en])),
    glossary:Object.fromEntries(GLOSS.map((x,i)=>[String(i),{term:x.en[0],definition:x.en[1]}])),
    quizzes:Object.fromEntries(Object.entries(LQZ).map(([id,qs])=>[id,qs.map(q=>Object.fromEntries([['q',pick(q.q)], ...(q.o ? [['o',q.o.map(pick)]] : []), ...(q.why ? [['why',pick(q.why)]] : [])]))])),
    summaries:Object.fromEntries(Object.entries(LSUM).map(([id,rows])=>[id,rows.map(row=>row.map(pick))])),
    music:{intervals:COMPOUND, scales:Object.fromEntries(Object.keys(SCALES).map(k=>[k,k])),
      chords:Object.fromEntries(CHORDS.map(x=>[x.symbol,x.name])), categories:Object.fromEntries(Object.entries(CATS).map(([k,v])=>[k,v.label])),
      inversions:Object.fromEntries(INV_NAMES.map((v,i)=>[String(i),v])), feels:CHORD_FEEL, songs:SONGS}
  })`
].join('\n');
process.stdout.write(vm.runInNewContext(script, Object.create(null), {timeout: 5000}));
