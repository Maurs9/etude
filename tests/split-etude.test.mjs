import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { joinSplit } from '../scripts/split-etude.mjs';

describe('mechanical etude split', () => {
  it('joins back to the Step 2b source byte-for-byte', async () => {
    const expected = execFileSync('git', ['show', 'f2c56b5:etude.html'], { maxBuffer: 10 * 1024 * 1024 });
    expect(Buffer.from(await joinSplit())).toEqual(expected);
  });
});
