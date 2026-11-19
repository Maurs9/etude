import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localIconUrl, runAndroidRelease, verifyVersionCode } from '../../scripts/android-release.mjs';

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

it('requires a code above both release markers and APK metadata', () => {
  const releases = [
    { draft: true, tag_name: '', assets: [{ name: 'etude-android-version-code.txt' }] },
    { tag_name: 'v1', assets: [{ name: 'etude-android-v1.apk' }] },
    { tag_name: 'v2', assets: [{ name: 'etude-android-version-code.txt' }] },
  ];
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === 'aapt2') return "package: name='io.github.maurs9.etude' versionCode='500'";
    if (args[0] === 'api') return JSON.stringify([releases]);
    writeFileSync(args[args.indexOf('--output') + 1], args[2] === 'v2' ? '1000\n' : 'apk');
    return '';
  });
  try {
    expect(() => verifyVersionCode(500, 'local/etude', 'aapt2', '.')).toThrow('must exceed 500 from v1');
    expect(() => verifyVersionCode(900, 'local/etude', 'aapt2', '.')).toThrow('must exceed 1000 from v2');
    expect(() => verifyVersionCode(1001, 'local/etude', 'aapt2', '.')).not.toThrow();
  } finally {
    vi.resetAllMocks();
  }
});

it('resolves TWA icons from the checked-out site scope', () => {
  const scope = new URL('https://maurs9.github.io/etude/');
  const base = new URL('http://127.0.0.1:1234/');
  expect(localIconUrl('https://maurs9.github.io/etude/icons/icon-512.png', scope, base))
    .toBe('http://127.0.0.1:1234/icons/icon-512.png');
  expect(() => localIconUrl('https://maurs9.github.io/icons/icon-512.png', scope, base))
    .toThrow('must be in the app');
});
