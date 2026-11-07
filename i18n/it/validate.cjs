'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./extract.cjs');
const source = extract();
const file = path.join(__dirname, 'it.json');
assert.ok(fs.existsSync(file), 'Italian translation data is missing');
const target = JSON.parse(fs.readFileSync(file, 'utf8'));
const placeholders = s => (s.match(/%[sab]/g) || []).sort();
const markup = s => s.match(/<[^>]+>/g) || [];
const compare = (label, en, it) => {
  assert.equal(typeof it, 'string', `${label}: missing string`);
  assert.ok(it.trim() || !en.trim(), `${label}: empty`);
  assert.deepEqual(placeholders(it), placeholders(en), `${label}: placeholders changed`);
  assert.deepEqual(markup(it), markup(en), `${label}: markup or attributes changed`);
};
for (const [key, value] of Object.entries(target.strings)) {
  assert.ok(Object.hasOwn(source.strings,key), `unknown string ${key}`);
  compare(`strings.${key}`, source.strings[key], value);
}
for (const [id, lesson] of Object.entries(target.lessons)) {
  assert.ok(Object.hasOwn(source.lessons,id), `unknown lesson ${id}`);
  compare(`lessons.${id}.t`, source.lessons[id].t, lesson.t);
  compare(`lessons.${id}.b`, source.lessons[id].b, lesson.b);
}
for (const name of ['intervals','scales','chords','inversions','patterns']) {
  const expected = source.musicalLabels[name];
  const keys = Array.isArray(expected) && name !== 'inversions' ? expected : Object.keys(expected);
  const actual = target.musicalLabels[name];
  assert.deepEqual(Object.keys(actual).sort(), keys.map(String).sort(), `${name} coverage`);
  for (const key of keys) assert.ok(typeof actual[key] === 'string' && actual[key].trim(), `${name}.${key}`);
  console.log(`${name}: ${Object.keys(actual).length}/${keys.length}`);
}
const counts = [Object.keys(target.strings).length, Object.keys(source.strings).length, Object.keys(target.lessons).length, Object.keys(source.lessons).length];
console.log(`Verified present entries: ${counts[0]}/${counts[1]} strings; ${counts[2]}/${counts[3]} lesson titles and bodies. Placeholders and markup match.`);
if (!process.argv.includes('--partial')) {
  assert.equal(counts[0],counts[1], `INCOMPLETE: ${counts[1]-counts[0]} dictionary entries missing`);
  assert.equal(counts[2],counts[3], `INCOMPLETE: ${counts[3]-counts[2]} lessons missing`);
}
