'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const original = require('./extract.cjs');
const targetPath = path.join(__dirname, 'es.json');
const target = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {strings:{}, lessons:{}};
const tokens = value => (value.match(/%[a-z]/gi) || []).sort();
const tags = value => value.match(/<[^>]*>/g) || [];

test('all source keys have nonempty Spanish translations', () => {
  const missing = Object.keys(original.strings.en).filter(k => typeof target.strings[k] !== 'string' || !target.strings[k].trim());
  assert.deepEqual(missing, [], `${missing.length} STRINGS keys missing`);
});
test('all lesson titles and bodies have nonempty Spanish translations', () => {
  const missing = original.lessons.flatMap(l => ['t','b'].filter(field => !target.lessons[l.id]?.[field]?.trim()).map(field => `${l.id}.${field}`));
  assert.deepEqual([...missing], [], `${missing.length} lesson fields missing`);
});
test('translated strings preserve every interpolation and HTML tag', () => {
  for (const [key, value] of Object.entries(target.strings)) {
    assert.ok(Object.hasOwn(original.strings.en, key), `Unknown key ${key}`);
    assert.deepEqual(tokens(value), tokens(original.strings.en[key]), `Placeholders: ${key}`);
    assert.deepEqual(tags(value), tags(original.strings.en[key]), `Markup: ${key}`);
  }
});
test('translated lesson fields preserve every interpolation and HTML tag', () => {
  for (const l of original.lessons) for (const field of ['t','b']) {
    const value = target.lessons[l.id]?.[field];
    if (value === undefined) continue;
    assert.deepEqual(tokens(value), tokens(l.en[field]), `Placeholders: ${l.id}.${field}`);
    assert.deepEqual(tags(value), tags(l.en[field]), `Markup: ${l.id}.${field}`);
  }
});
