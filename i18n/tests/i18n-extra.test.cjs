const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');

function englishStrings() {
  const module = fs.readFileSync(path.join(root, 'src', 'locales', 'index.js'), 'utf8');
  const match = module.match(/export const STRINGS = (\{[\s\S]*?\});\r?\n\r?\n\/\* Generated/);
  assert.ok(match, 'static locale module must expose STRINGS');
  const context = {};
  vm.runInNewContext(`STRINGS=${match[1]}`, context);
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
  vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', 'i18n-extra.js'), 'utf8'), context);
  assert.equal(context.ETUDE_EXTRA_STRINGS.fr.nav_today, 'Aujourd’hui');
});
