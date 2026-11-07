'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function extract() {
  const html = fs.readFileSync(path.resolve(__dirname, '../../etude.html'), 'utf8');
  const start = html.indexOf('const STRINGS={');
  const end = html.indexOf('function t(k', start);
  if (start < 0 || end < 0) throw new Error('STRINGS declaration not found');
  let script = html.slice(start, end).replace('const STRINGS=', 'var STRINGS=');
  for (const m of html.matchAll(/Object\.assign\(STRINGS\.(en|ro),\s*\{[\s\S]*?\r?\n\}\);/g)) script += '\n' + m[0];
  const lessonStart = html.indexOf('const LESSONS=[');
  const lessonEnd = html.indexOf('\n);', html.indexOf('LESSONS.push(', lessonStart));
  if (lessonStart < 0 || lessonEnd < 0) throw new Error('LESSONS declaration not found');
  script += '\n' + html.slice(lessonStart, lessonEnd + 3).replace('const LESSONS=', 'var LESSONS=');
  const musicStart = html.indexOf('const INTERVALS=[');
  const musicEnd = html.indexOf('/* ---------- i18n ---------- */', musicStart);
  if (musicStart < 0 || musicEnd < 0) throw new Error('Musical source data not found');
  script += '\n' + html.slice(musicStart,musicEnd) + '\nvar MUSICAL_SOURCE={intervals:COMPOUND, scales:Object.keys(SCALES), chords:CHORDS.map(c=>c.symbol), inversions:INV_NAMES, patterns:Object.keys(ACCOMP_PATTERNS)};';
  const ctx = {}; vm.runInNewContext(script, ctx, { timeout: 10000 });
  return JSON.parse(JSON.stringify({strings:ctx.STRINGS.en, lessons:Object.fromEntries(ctx.LESSONS.map(l => [l.id,l.en])), musicalLabels:ctx.MUSICAL_SOURCE}));
}
if (require.main === module) console.log(JSON.stringify(extract(),null,2));
module.exports = { extract };
