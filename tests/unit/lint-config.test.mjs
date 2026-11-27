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

  it('enforces layered import and global boundaries for core, infra, features, and app', async () => {
    const [coreResult] = await eslint.lintText(
      "import { audioEngine } from '../domain/audio.js';\nexport const x = window.location.href + String(audioEngine);\n",
      { filePath: 'src/core/probe.ts' },
    );
    expect(coreResult.messages.map(m => m.ruleId)).toEqual(
      expect.arrayContaining(['no-restricted-imports', 'no-restricted-globals']),
    );

    const [infraResult] = await eslint.lintText(
      "import { foo } from '../features/explore/index.js';\nexport const x = foo;\n",
      { filePath: 'src/infra/probe.ts' },
    );
    expect(infraResult.messages.map(m => m.ruleId)).toContain('no-restricted-imports');

    const [crossFeatureResult] = await eslint.lintText(
      "import { voice } from '../voice/index.js';\nexport const x = voice;\n",
      { filePath: 'src/features/explore/probe.ts' },
    );
    expect(crossFeatureResult.messages.map(m => m.ruleId)).toContain('no-restricted-imports');

    const [featureAllowedResult] = await eslint.lintText(
      "import type { AppHost } from '../../domain/views.js';\nexport type Probe = AppHost;\n",
      { filePath: 'src/features/explore/probe.ts' },
    );
    expect(featureAllowedResult.messages).toEqual([]);

    const [appResult] = await eslint.lintText(
      "import '../domain/views-runtime.js';\n",
      { filePath: 'src/app/probe.ts' },
    );
    expect(appResult.messages.map(m => m.ruleId)).toContain('no-restricted-imports');
  });
});
