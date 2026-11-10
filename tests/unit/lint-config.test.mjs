import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd });

describe('lint scope', () => {
  it.each(['.agents/teamwork/probe.cjs', '.hermes/probe.js'])(
    'ignores temporary agent workspace %s',
    async file => {
      expect(await eslint.isPathIgnored(file)).toBe(true);
    },
  );

  it('continues checking application files and enforces script quality rules', async () => {
    expect(await eslint.isPathIgnored('src/domain/views-runtime.ts')).toBe(false);
    expect(await eslint.isPathIgnored('scripts/lint-regression-probe.cjs')).toBe(false);
    const [result] = await eslint.lintText(
      'const unused = 1;\ntry { throw new Error("test"); } catch (error) {}\n',
      { filePath: 'scripts/lint-regression-probe.cjs' },
    );
    expect(result.messages.map(message => message.ruleId))
      .toEqual(expect.arrayContaining(['no-unused-vars', 'no-empty']));
  });
});
