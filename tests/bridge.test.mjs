import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bridgeSource, topLevelBindings } from '../scripts/generate-bridge.mjs';

const APP = new URL('../src/legacy/app.js', import.meta.url);

function bridgedNames(source) {
  return [...bridgeSource(source).matchAll(/Object\.defineProperty\(window, "([^"]+)"/g)]
    .map(match => match[1])
    .sort();
}

describe('temporary globals bridge', () => {
  it('contains exactly the bindings in the current split app', async () => {
    const source = await readFile(APP, 'utf8');
    const bindings = topLevelBindings(source);
    expect(bridgedNames(source)).toEqual([...bindings.writable, ...bindings.readonly].sort());
  });

  it('writes a test stub through to the app binding', () => {
    const source = [
      'function invoke(){ return dependency(); }',
      'let dependency=()=> "original";',
      'const answer=42;',
    ].join('\n');
    const bridge = bridgeSource(source);
    const run = new Function('window', `${source}\n${bridge}\nwindow.dependency=()=> "stubbed"; return { value: invoke(), answer: window.answer };`);
    expect(run({})).toEqual({ value: 'stubbed', answer: 42 });
  });
});
