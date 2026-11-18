import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

function run(cwd, command, ...args) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function verifyTag(tagName, repository, cwd) {
  const checkout = run(cwd, 'git', 'rev-parse', 'HEAD');
  const ref = `refs/tags/${tagName}`;
  run(cwd, 'git', 'check-ref-format', ref);
  run(cwd, 'git', 'fetch', '--no-tags', 'origin', ref);
  const taggedCommit = run(cwd, 'git', 'rev-parse', 'FETCH_HEAD^{commit}');
  if (taggedCommit !== checkout) {
    throw new Error(`Origin tag ${tagName} points to ${taggedCommit}, but the build uses ${checkout}.`);
  }

  // Include drafts and all pages. Any GitHub API error stops the release.
  const releases = run(cwd, 'gh', 'api', '--paginate', `repos/${repository}/releases`,
    '--jq', '.[].tag_name');
  if (releases.split('\n').includes(tagName)) {
    throw new Error(`A release for ${tagName} already exists. Use a new version and tag for another build.`);
  }
}

function prepare(env, cwd) {
  const { GITHUB_REF_TYPE, GITHUB_REF_NAME, GITHUB_RUN_NUMBER, INPUT_VERSION_NAME, INPUT_VERSION_CODE } = env;
  const requestedVersion = INPUT_VERSION_NAME?.replace(/^v/, '');
  const tagRef = GITHUB_REF_TYPE === 'tag' ? GITHUB_REF_NAME : '';
  const versionName = tagRef ? tagRef.replace(/^v/, '') : requestedVersion;
  if (!versionName || !/^[0-9][0-9a-zA-Z._+-]*$/.test(versionName)) {
    throw new Error('Provide an Android release version such as 1.0.24 or run from its v-prefixed tag.');
  }
  const tagName = `v${versionName}`;
  if (tagRef && (tagRef !== tagName || (requestedVersion && requestedVersion !== versionName))) {
    throw new Error(`The requested Android release version must match the selected tag ${tagRef}.`);
  }

  const code = INPUT_VERSION_CODE || GITHUB_RUN_NUMBER;
  const versionCode = Number(code);
  if (!code || !/^\d+$/.test(code) || versionCode < 1 || versionCode > 2_100_000_000) {
    throw new Error('Android versionCode must be an integer from 1 to 2100000000.');
  }

  verifyTag(tagName, env.GITHUB_REPOSITORY, cwd);
  appendFileSync(env.GITHUB_OUTPUT, `version_name=${versionName}\nversion_code=${versionCode}\ntag_name=${tagName}\n`);
}

export function runAndroidRelease([action, tagName], env, cwd) {
  if (action === 'prepare') prepare(env, cwd);
  else if (action === 'verify' && tagName) verifyTag(tagName, env.GITHUB_REPOSITORY, cwd);
  else throw new Error('Usage: android-release.mjs prepare | verify <tag>');
}

if (import.meta.main) runAndroidRelease(process.argv.slice(2), process.env, process.cwd());
