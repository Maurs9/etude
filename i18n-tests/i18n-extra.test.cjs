const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function englishStrings() {
  const html = fs.readFileSync(path.join(root, 'etude.html'), 'utf8');
  const start = html.indexOf('const STRINGS={');
  const end = html.indexOf('\nfunction t(k', start);
  assert.ok(start >= 0 && end > start, 'English dictionary must be discoverable');
  let script = html.slice(start, end).replace('const STRINGS=', 'var STRINGS=');
  for (const match of html.matchAll(/Object\.assign\(STRINGS\.(en|ro),\s*\{[\s\S]*?\n\}\);/g)) script += '\n' + match[0];
  const context = {};
  vm.runInNewContext(script, context);
  return context.STRINGS.en;
}

test('five locale dictionaries contain real translations for the core interface', () => {
  const locales = require('../i18n-extra.js');
  const en = englishStrings();
  assert.deepEqual(Object.keys(locales).sort(), ['de', 'es', 'fr', 'it', 'pt-BR']);
  for (const [locale, strings] of Object.entries(locales)) {
    assert.ok(Object.keys(strings).length >= 70, `${locale} needs at least 70 translated entries`);
    for (const [key, value] of Object.entries(strings)) {
      assert.ok(Object.hasOwn(en, key), `${locale}: unknown key ${key}`);
      assert.equal(typeof value, 'string');
      assert.ok(value.trim(), `${locale}: empty ${key}`);
      const placeholders = s => (s.match(/%[sab]/g) || []).sort();
      assert.deepEqual(placeholders(value), placeholders(en[key]), `${locale}: placeholders in ${key}`);
    }
    assert.notEqual(strings.nav_today, en.nav_today);
    assert.notEqual(strings.settings, en.settings);
  }
});

test('the browser build exposes the same dictionaries without a bundler', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n-extra.js'), 'utf8'), context);
  assert.equal(context.ETUDE_EXTRA_STRINGS.fr.nav_today, 'Aujourd’hui');
});
