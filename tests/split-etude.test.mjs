import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { joinSource, splitSource } from '../scripts/split-etude.mjs';

const exec = promisify(execFile);

describe('mechanical etude split', () => {
  it('joins the trusted pre-split input byte for byte', async () => {
    const { stdout } = await exec('git', ['show', '32a184b:etude.html'], { maxBuffer: 8 * 1024 * 1024 });
    const parts = splitSource(stdout);
    expect(joinSource(parts)).toBe(stdout);
  });
});
