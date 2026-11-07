'use strict';
// Run with node i18n/de/verify.cjs. A nonzero result means the locale is not shippable.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'etude.html'), 'utf8');
const start = html.indexOf('const STRINGS={');
const end = html.indexOf('\nfunction t(k', start);
if (start < 0 || end < 0) throw Error('Cannot find dictionary');
let js = html.slice(start, end).replace('const STRINGS=', 'var STRINGS=');
for (const m of html.matchAll(/Object\.assign\(STRINGS\.(en|ro),\s*\{[\s\S]*?\n\}\);/g)) js += '\n' + m[0];
const lessonStart = html.indexOf('const LESSONS=[');
const lessonEnd = html.indexOf('\n/* ---------- LEARN v4:', lessonStart);
if (lessonStart < 0 || lessonEnd < 0) throw Error('Cannot find lessons');
js += '\n' + html.slice(lessonStart, lessonEnd).replace('const LESSONS=', 'var LESSONS=');
const ctx = {}; vm.runInNewContext(js, ctx, { timeout: 5000 });
const source = {strings:ctx.STRINGS.en, lessons:Object.fromEntries(ctx.LESSONS.map(x=>[x.id,x.en]))};
if (process.argv.includes('--extract')) {
  fs.writeFileSync(path.join(__dirname, 'source.json'), JSON.stringify(source,null,2)+'\n');
  console.log(`Extracted ${Object.keys(source.strings).length} strings and ${Object.keys(source.lessons).length} lessons`);
  process.exit(0);
}
const file=path.join(__dirname,'de.json');
if(!fs.existsSync(file)){ console.error('Missing de.json: German locale incomplete'); process.exit(1); }
const de=JSON.parse(fs.readFileSync(file,'utf8'));
const tokens=s=>(s.match(/%[sab]/g)||[]).sort();
const tags=s=>(s.match(/<[^>]*>/g)||[]);
let issues=[];
for (const [k,v] of Object.entries(source.strings)) {
  const d=de.strings?.[k];
  if(typeof d!=='string'||!d.trim()){issues.push(`missing string ${k}`);continue;}
  if(JSON.stringify(tokens(v))!==JSON.stringify(tokens(d))) issues.push(`placeholders ${k}`);
  if(JSON.stringify(tags(v))!==JSON.stringify(tags(d))) issues.push(`markup ${k}`);
}
for (const [id,L] of Object.entries(source.lessons)) {
  const d=de.lessons?.[id];
  if(!d||typeof d.t!=='string'||!d.t.trim()||typeof d.b!=='string'||!d.b.trim()){issues.push(`missing lesson ${id}`);continue;}
  for(const field of ['t','b']) {
    if(JSON.stringify(tags(L[field]))!==JSON.stringify(tags(d[field]))) issues.push(`lesson markup ${id}.${field}`);
    if(JSON.stringify(tokens(L[field]))!==JSON.stringify(tokens(d[field]))) issues.push(`lesson placeholders ${id}.${field}`);
  }
}
for(const k of Object.keys(de.strings||{})) if(!(k in source.strings)) issues.push(`unknown string ${k}`);
for(const k of Object.keys(de.lessons||{})) if(!(k in source.lessons)) issues.push(`unknown lesson ${k}`);
const translated=Object.keys(de.strings||{}).filter(k=>k in source.strings).length;
const lessons=Object.keys(de.lessons||{}).filter(k=>k in source.lessons).length;
console.log(`Coverage: ${translated}/${Object.keys(source.strings).length} strings; ${lessons}/${Object.keys(source.lessons).length} lessons`);
if(issues.length){console.error(`${issues.length} issues:\n${issues.join('\n')}`);process.exitCode=1;}
else console.log('Dictionary and lesson structural checks pass; linguistic and other content review still required.');
