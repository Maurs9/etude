import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { serve } from './serve.mjs';

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

const VERSION_ASSET = 'etude-android-version-code.txt';

export function verifyVersionCode(code, repository, aapt2, cwd) {
  if (!Number.isInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new Error('Android versionCode must be an integer from 1 to 2100000000.');
  }
  const listing = run(cwd, 'gh', 'api', '--paginate', '--slurp', `repos/${repository}/releases`);
  const releases = JSON.parse(listing).flat();
  const dir = mkdtempSync(join(tmpdir(), 'etude-android-version-'));
  try {
    for (const release of releases) {
      const apk = release.assets.find(asset => /^etude-android-.*\.apk$/.test(asset.name));
      const marker = release.assets.find(asset => asset.name === VERSION_ASSET);
      if (!apk && !marker) continue;
      const path = join(dir, marker ? VERSION_ASSET : 'prior.apk');
      run(cwd, 'gh', 'release', 'download', release.tag_name, '--repo', repository,
        '--pattern', marker ? VERSION_ASSET : apk.name, '--output', path, '--clobber');
      const value = marker ? readFileSync(path, 'utf8').trim()
        : run(cwd, aapt2, 'dump', 'badging', path).match(/^package:.* versionCode='(\d+)'/m)?.[1];
      const previous = Number(value);
      if (!value || !/^\d+$/.test(value) || previous < 1 || previous > 2_100_000_000) {
        throw new Error(`Cannot read Android versionCode for release ${release.tag_name}.`);
      }
      if (code <= previous) {
        throw new Error(`Android versionCode ${code} must exceed ${previous} from ${release.tag_name}.`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function localIconUrl(value, site, local) {
  const url = new URL(value);
  if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname + 'icons/')) {
    throw new Error(`Android icon must be in the app's icons directory: ${value}`);
  }
  return new URL(url.pathname.slice(site.pathname.length), local).href;
}

async function buildWithLocalIcons(cwd) {
  const path = join(cwd, 'twa-manifest.json');
  const original = await readFile(path, 'utf8');
  const manifest = JSON.parse(original);
  const server = await serve(resolve(cwd, '..', 'public'));
  try {
    const base = new URL(`http://127.0.0.1:${server.address().port}/`);
    const scope = new URL(manifest.fullScopeUrl);
    const local = url => localIconUrl(url, scope, base);
    manifest.iconUrl = local(manifest.iconUrl);
    if (manifest.maskableIconUrl) manifest.maskableIconUrl = local(manifest.maskableIconUrl);
    if (manifest.enableNotifications && manifest.monochromeIconUrl)
      manifest.monochromeIconUrl = local(manifest.monochromeIconUrl);
    for (const shortcut of manifest.shortcuts ?? []) {
      if (shortcut.chosenIconUrl) shortcut.chosenIconUrl = local(shortcut.chosenIconUrl);
    }
    // Update and build both check the same manifest. Keep its live app origin and start URL.
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
    for (const [action, flag] of [['update', '--skipVersionUpgrade'], ['build', '--skipPwaValidation']]) {
      await new Promise((resolve, reject) => {
        const child = spawn('bubblewrap', [action, flag, '--manifest=twa-manifest.json'], { cwd, stdio: 'inherit' });
        child.once('error', reject);
        child.once('close', (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(`bubblewrap ${action} failed (${signal ?? code}).`));
        });
      });
    }
  } finally {
    server.close();
    await writeFile(path, original);
  }
}

export function runAndroidRelease([action, tagName], env, cwd) {
  if (action === 'prepare') prepare(env, cwd);
  else if (action === 'verify' && tagName) verifyTag(tagName, env.GITHUB_REPOSITORY, cwd);
  else if (action === 'verify-version') verifyVersionCode(Number(env.VERSION_CODE), env.GITHUB_REPOSITORY, env.AAPT2, cwd);
  else if (action === 'build-local-icons') return buildWithLocalIcons(cwd);
  else throw new Error('Usage: android-release.mjs prepare | verify <tag> | verify-version | build-local-icons');
}

if (import.meta.main) await runAndroidRelease(process.argv.slice(2), process.env, process.cwd());
