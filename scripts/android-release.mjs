import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

function verifyManifestVersion(versionName, cwd) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return;
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`package.json must define a valid SemVer version before releasing (got ${String(manifest.version)}).`);
  }
  if (manifest.version !== versionName) {
    throw new Error(`package.json version ${manifest.version} must match release version ${versionName}.`);
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
  verifyManifestVersion(versionName, cwd);

  const code = INPUT_VERSION_CODE || GITHUB_RUN_NUMBER;
  const versionCode = Number(code);
  if (!code || !/^\d+$/.test(code) || versionCode < 1 || versionCode > 2_100_000_000) {
    throw new Error('Android versionCode must be an integer from 1 to 2100000000.');
  }

  verifyTag(tagName, env.GITHUB_REPOSITORY, cwd);
  appendFileSync(env.GITHUB_OUTPUT, `version_name=${versionName}\nversion_code=${versionCode}\ntag_name=${tagName}\n`);
}

const VERSION_ASSET = 'etude-android-version-code.txt';

function downloadReleaseAsset(cwd, repository, tagName, pattern, output) {
  for (let attempt = 1; ; attempt++) {
    try {
      run(cwd, 'gh', 'release', 'download', tagName, '--repo', repository,
        '--pattern', pattern, '--output', output, '--clobber');
      return;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

export function verifyVersionCode(code, repository, aapt2, cwd) {
  if (!Number.isInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new Error('Android versionCode must be an integer from 1 to 2100000000.');
  }
  const listing = run(cwd, 'gh', 'api', '--paginate', '--slurp', `repos/${repository}/releases`);
  const releases = JSON.parse(listing).flat();
  const dir = mkdtempSync(join(tmpdir(), 'etude-android-version-'));
  try {
    for (const release of releases) {
      if (release.draft && !release.tag_name) continue;
      const assets = release.assets ?? [];
      const apk = assets.find(asset => /^etude-android-.*\.apk$/.test(asset.name));
      const marker = assets.find(asset => asset.name === VERSION_ASSET);
      if (!apk && !marker) continue;
      const path = join(dir, marker ? VERSION_ASSET : 'prior.apk');
      downloadReleaseAsset(cwd, repository, release.tag_name, marker ? VERSION_ASSET : apk.name, path);
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

function spawnChecked(cwd, command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args[0] ?? ''} failed (${signal ?? code}).`.trim()));
    });
  });
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
    if (manifest.monochromeIconUrl)
      manifest.monochromeIconUrl = local(manifest.monochromeIconUrl);
    for (const shortcut of manifest.shortcuts ?? []) {
      if (shortcut.chosenIconUrl) shortcut.chosenIconUrl = local(shortcut.chosenIconUrl);
    }
    // Update and build both check the same manifest. Keep its live app origin and start URL.
    await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
    const buildEnv = {
      ...process.env,
      ORG_GRADLE_PROJECT_org_gradle_console: 'plain',
      GRADLE_OPTS: [process.env.GRADLE_OPTS, '-Dorg.gradle.console=plain -Dorg.gradle.logging.level=quiet'].filter(Boolean).join(' '),
    };
    await spawnChecked(cwd, 'bubblewrap', ['update', '--skipVersionUpgrade', '--manifest=twa-manifest.json'], buildEnv);
    const gradlew = join(cwd, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    if (existsSync(gradlew)) {
      await spawnChecked(cwd, gradlew, ['--console=plain', '--quiet', 'help'], buildEnv);
    }
    await spawnChecked(cwd, 'bubblewrap', ['build', '--skipPwaValidation', '--manifest=twa-manifest.json'], buildEnv);
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
