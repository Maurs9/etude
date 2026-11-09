import { describe, expect, it } from 'vitest';
import { STRINGS } from '../src/locales/index.js';

describe('static locale modules', () => {
  it('keep every user-facing string key in English and Romanian', () => {
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.ro).sort());
  });
});
