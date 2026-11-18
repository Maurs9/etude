import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAndroidRelease } from '../../scripts/android-release.mjs';

vi.mock('node:child_process', { spy: true });
const { execFileSync: realExec } = await vi.importActual('node:child_process');
const workflow = readFileSync(new URL('../../.github/workflows/android-release.yml', import.meta.url), 'utf8');

describe('Android release preflight', () => {
  let directory;
  let checkout;
  let env;
  let releaseTags;

  function git(args, options = {}) {
    return realExec('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
  }

  function release(args, overrides = {}) {
    runAndroidRelease(args, { ...env, ...overrides }, checkout);
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'etude-android-release-'));
    checkout = join(directory, 'checkout');
    mkdirSync(checkout);

    git(['init', '--bare', join(directory, 'origin.git')]);
    git(['init']);
    git(['config', 'user.name', 'Release Test']);
    git(['config', 'user.email', 'test@example.org']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'tag.gpgsign', 'false']);
    git(['remote', 'add', 'origin', join(directory, 'origin.git')]);
    git(['commit', '--allow-empty', '-m', 'Build this commit']);
    git(['tag', 'v1.0.24']);
    git(['tag', '-a', 'v1.0.25', '-m', 'Annotated release']);
    git(['push', 'origin', '--tags']);
    env = {
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'main',
      GITHUB_RUN_NUMBER: '15',
      GITHUB_REPOSITORY: 'local/etude',
      GITHUB_OUTPUT: join(directory, 'output'),
      INPUT_VERSION_NAME: '1.0.24',
      INPUT_VERSION_CODE: '',
    };
    releaseTags = vi.fn(() => 'v1.0.22\nv1.0.23\n');
    vi.mocked(execFileSync).mockImplementation((command, args, options) => {
      if (command === 'git') return git(args, { cwd: options.cwd });
      expect(command).toBe('gh');
      expect(args).toEqual(['api', '--paginate', 'repos/local/etude/releases', '--jq', '.[].tag_name']);
      return releaseTags();
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('uses the verified remote tag and workflow run number for a manual branch build', () => {
    release(['prepare']);
    expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toBe('version_name=1.0.24\nversion_code=15\ntag_name=v1.0.24\n');
  });

  it('peels an annotated tag and allows an explicit code on a manual run from that tag', () => {
    release(['prepare'], {
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: 'v1.0.25',
      INPUT_VERSION_NAME: '',
      INPUT_VERSION_CODE: '28',
    });
    expect(readFileSync(env.GITHUB_OUTPUT, 'utf8')).toContain('version_name=1.0.25\nversion_code=28\ntag_name=v1.0.25\n');
  });

  it('rejects a version that disagrees with the selected tag', () => {
    expect(() => release(['prepare'], { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v1.0.25' }))
      .toThrow('must match the selected tag');
  });

  it.each(['0', '1.5', '2100000001'])('rejects invalid versionCode %s', (code) => {
    expect(() => release(['prepare'], { INPUT_VERSION_CODE: code })).toThrow('versionCode must be an integer');
  });

  it('requires the tag to exist on origin', () => {
    git(['tag', 'v1.0.26']);
    expect(() => release(['prepare'], { INPUT_VERSION_NAME: '1.0.26' })).toThrow('refs/tags/v1.0.26');
    expect(releaseTags).not.toHaveBeenCalled();
  });

  it('detects a tag moved to another commit after preflight', () => {
    release(['prepare']);
    const buildCommit = git(['rev-parse', 'HEAD']);
    git(['commit', '--allow-empty', '-m', 'Different commit']);
    git(['push', '--force', 'origin', 'HEAD:refs/tags/v1.0.24']);
    git(['checkout', '--detach', buildCommit]);

    expect(() => release(['verify', 'v1.0.24'])).toThrow(`but the build uses ${buildCommit}`);
  });

  it('rejects an existing release even if it appeared after preflight', () => {
    release(['prepare']);
    releaseTags.mockReturnValue('v1.0.23\nv1.0.24\n');
    expect(() => release(['verify', 'v1.0.24'])).toThrow('A release for v1.0.24 already exists');
  });

  it('fails closed on a release API error', () => {
    releaseTags.mockImplementation(() => { throw new Error('Release API unavailable'); });
    expect(() => release(['prepare'])).toThrow('Release API unavailable');
  });
});

it('verifies before signing and again before creating a release from the verified tag', () => {
  const preflight = 'run: node scripts/android-release.mjs prepare';
  const finalCheck = 'node scripts/android-release.mjs verify "$RELEASE_TAG"';
  const create = 'gh release create "$RELEASE_TAG" --verify-tag';

  expect(workflow).toContain(preflight);
  expect(workflow.indexOf(preflight)).toBeLessThan(workflow.indexOf('Decode signing keystore'));
  expect(workflow).toContain(`${finalCheck}\n          ${create}`);
});
