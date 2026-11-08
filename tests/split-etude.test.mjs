import { describe, expect, it } from 'vitest';
import { joinSplit } from '../scripts/split-etude.mjs';

describe('mechanical etude split', () => {
  it('joins deterministically after later module migrations', async () => {
    expect(await joinSplit()).toBe(await joinSplit());
  });
});
