import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8');

// Returns the lines indented under the top-level key `name:` (no YAML parser among the dependencies).
function block(text, name, indent = '') {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line === `${indent}${name}:`);
  if (start < 0) throw new Error(`no ${indent}${name}: in the workflow`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith(`${indent} `)) break;
    body.push(line);
  }
  return body.join('\n');
}
const job = (name) => block(block(workflow, 'jobs'), name, '  ');

describe('CI workflow', () => {
  it('runs the canonical i18n npm script instead of the removed test path', () => {
    expect(job('checks')).toMatch(/^\s*- run: npm run test:i18n\s*$/m);
    expect(workflow).not.toContain('i18n-tests/i18n-extra.test.cjs');
  });

  it('runs on pull requests, on pushes to main only, and by hand', () => {
    const on = block(workflow, 'on');
    expect(on).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(on).toMatch(/^ {2}pull_request:$/m);
    expect(on).toMatch(/^ {2}workflow_dispatch:$/m);
    expect(on).not.toContain("'**'");
  });

  it('keeps the job set: checks, build shards, dev-server shards, deploy', () => {
    const names = [...block(workflow, 'jobs').matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]);
    expect(names).toEqual(['checks', 'e2e-build', 'e2e-dev', 'deploy']);
    for (const name of names) expect(job(name)).toMatch(/^ {4}runs-on: ubuntu-24\.04$/m);
    for (const name of names) expect(job(name)).toMatch(/^ {4}timeout-minutes: (\d|1[0-5])$/m);
  });

  it('runs the static checks and unit tests once, in the checks job', () => {
    const checks = job('checks');
    for (const step of [
      'npm run typecheck',
      'npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node',
      'npm run lint',
      'npm run test:unit',
      'npm run test:i18n',
      'npm run build',
    ]) {
      expect(checks).toContain(`- run: ${step}\n`);
      expect(workflow.split(`- run: ${step}\n`)).toHaveLength(2);
    }
    // The split invariant reads 32a184b:etude.html, so the checkout keeps the full history.
    expect(checks).toMatch(/fetch-depth: 0/);
  });

  it('splits the build suite into 3 shards that all run to the end', () => {
    const build = job('e2e-build');
    expect(build).toMatch(/fail-fast: false/);
    expect(build).toMatch(/shard: \[1, 2, 3\]/);
    expect(build).toContain('- run: npx playwright test --shard=${{ matrix.shard }}/3\n');
    expect(build).not.toMatch(/--project/);
  });

  it('still runs the dev-server suite, sharded', () => {
    const dev = job('e2e-dev');
    expect(dev).toMatch(/fail-fast: false/);
    expect(dev).toMatch(/shard: \[1, 2\]/);
    expect(dev).toContain('- run: npm run test:dev -- --shard=${{ matrix.shard }}/2\n');
  });

  it('uploads failure artifacts per shard and per attempt', () => {
    expect(job('e2e-build')).toContain('name: test-results-build-${{ matrix.shard }}-of-3-attempt-${{ github.run_attempt }}');
    expect(job('e2e-dev')).toContain('name: test-results-dev-${{ matrix.shard }}-of-2-attempt-${{ github.run_attempt }}');
  });

  it('keeps the environment the Linux baselines need', () => {
    const env = block(workflow, 'env');
    expect(env).toMatch(/^ {2}PW_CHANNEL: ''$/m);
    expect(env).toMatch(/^ {2}GOLDEN_REQUIRE_PLATFORM: '1'$/m);
  });

  it('builds and uploads the Pages artifact once, named per attempt', () => {
    expect(workflow.match(/upload-pages-artifact/g)).toHaveLength(1);
    const checks = job('checks');
    expect(checks).toContain('site: github-pages-${{ github.run_attempt }}');
    expect(checks).toContain('name: github-pages-${{ github.run_attempt }}');
    expect(checks).toContain("if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
  });

  it('deploys only from main after every test job, with its safety checks', () => {
    const deploy = job('deploy');
    expect(deploy).toMatch(/^ {4}needs: \[checks, e2e-build, e2e-dev\]$/m);
    expect(deploy).toContain("if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
    expect(deploy).toContain('artifact_name: ${{ needs.checks.outputs.site }}');
    expect(deploy).toContain('--jq .build_type');
    expect(deploy).toContain('git/ref/heads/main');
    expect(deploy).toContain("if: steps.latest.outputs.ok == 'true'");
    expect(deploy).toMatch(/group: pages\n\s+cancel-in-progress: false/);
  });

  it('cancels superseded runs except on main', () => {
    expect(block(workflow, 'concurrency')).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});
