// Safe inspector and updater for the vendored OpenSheetMusicDisplay (OSMD) bundle.
// Usage:
//   node scripts/update-osmd.mjs --check            (inspect current OSMD bundle, contract & npm latest)
//   node scripts/update-osmd.mjs <version>          (try updating OSMD; auto-rollbacks if any gate fails)
//   node scripts/update-osmd.mjs <version> --keep   (keep changes on disk even if golden/layout tests fail)
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import vm from 'node:vm';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = join(ROOT, 'public', 'vendor');
const NOTATION_FILE = join(ROOT, 'src', 'domain', 'notation.ts');
const STANDALONE_SCRIPT = join(ROOT, 'scripts', 'build-standalone.mjs');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function runCmd(cmd, args, options = {}) {
  const actualCmd = process.platform === 'win32' ? 'cmd.exe' : cmd;
  const actualArgs = process.platform === 'win32' ? ['/d', '/s', '/c', cmd, ...args] : args;
  return execFileAsync(actualCmd, actualArgs, {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

// Evaluates a UMD OSMD bundle inside an isolated VM context and verifies the Étude adapter contract.
export function inspectOsmdBundle(code) {
  const sandbox = {
    window: {},
    self: {},
    globalThis: {},
    navigator: { userAgent: 'node' },
    document: {
      createElement: () => ({
        getContext: () => ({
          measureText: () => ({ width: 10 }),
          fillText: () => {},
          clearRect: () => {},
        }),
        style: {},
        appendChild: () => {},
      }),
      implementation: { createHTMLDocument: () => ({ body: {} }) },
    },
    HTMLElement: class HTMLElement {},
    SVGElement: class SVGElement {},
    DOMParser: class DOMParser {
      parseFromString() { return { documentElement: {} }; }
    },
    XMLSerializer: class XMLSerializer {
      serializeToString() { return ''; }
    },
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(code, sandbox, { timeout: 10000 });
  const api = sandbox.opensheetmusicdisplay;
  if (!api || typeof api !== 'object') {
    throw new Error('Bundle did not expose window.opensheetmusicdisplay');
  }
  if (typeof api.OpenSheetMusicDisplay !== 'function') {
    throw new Error('Contract failure: opensheetmusicdisplay.OpenSheetMusicDisplay constructor is missing');
  }
  if (typeof api.MXLHelper?.MXLtoXMLstring !== 'function') {
    throw new Error('Contract failure: opensheetmusicdisplay.MXLHelper.MXLtoXMLstring is missing');
  }
  const drawerProto = api.VexFlowMusicSheetDrawer?.prototype;
  if (!drawerProto || typeof drawerProto.drawPedals !== 'function') {
    throw new Error('Contract failure: opensheetmusicdisplay.VexFlowMusicSheetDrawer.prototype.drawPedals is missing');
  }

  let rules = {};
  if (typeof api.EngravingRules === 'function') {
    const instance = new api.EngravingRules();
    for (const [key, value] of Object.entries(instance)) {
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        rules[key] = value;
      }
    }
  }

  let version = api.OpenSheetMusicDisplay?.Version ?? null;
  if (!version) {
    const versionMatch = code.match(/this\.version\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+)(?:-release)?["']/) ||
      code.match(/Version\s*=\s*["']([0-9]+\.[0-9]+\.[0-9]+[^"']*)["']/) ||
      code.match(/opensheetmusicdisplay\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
    version = versionMatch ? versionMatch[1] : 'unknown';
  }

  return {
    version,
    hasOpenSheetMusicDisplay: true,
    hasMXLtoXMLstring: true,
    hasDrawPedals: true,
    rules,
  };
}

export function diffEngravingRules(oldRules, newRules) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const key of Object.keys(newRules).sort()) {
    if (!(key in oldRules)) {
      added.push({ key, value: newRules[key] });
    } else if (oldRules[key] !== newRules[key]) {
      changed.push({ key, from: oldRules[key], to: newRules[key] });
    }
  }
  for (const key of Object.keys(oldRules).sort()) {
    if (!(key in newRules)) {
      removed.push({ key, value: oldRules[key] });
    }
  }
  return { added, removed, changed };
}

async function getCurrentVendorState() {
  const entries = (await readdir(VENDOR_DIR)).filter(name => /^osmd-.*\.min\.js$/.test(name));
  if (entries.length !== 1) {
    throw new Error(`Expected exactly 1 osmd-*.min.js file in public/vendor/, found: ${entries.join(', ') || 'none'}`);
  }
  const filename = entries[0];
  const filePath = join(VENDOR_DIR, filename);
  const bytes = await readFile(filePath);
  const notationSource = await readFile(NOTATION_FILE, 'utf8');
  const standaloneSource = await readFile(STANDALONE_SCRIPT, 'utf8');

  const notationMatch = notationSource.match(/vendor\/(osmd-[^'"`]+\.min\.js)/);
  const standaloneMatch = standaloneSource.match(/\bvendor['"],\s*['"](osmd-[^'"`]+\.min\.js)['"]/);
  const referencesMatch = notationMatch?.[1] === filename && standaloneMatch?.[1] === filename;

  return {
    filename,
    filePath,
    bytes,
    hash: sha256(bytes),
    notationSource,
    standaloneSource,
    notationRef: notationMatch?.[1] ?? null,
    standaloneRef: standaloneMatch?.[1] ?? null,
    referencesMatch,
  };
}

async function fetchNpmLatestVersion() {
  try {
    const { stdout } = await runCmd(NPM_CMD, ['view', 'opensheetmusicdisplay', 'version']);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function checkCurrent() {
  const state = await getCurrentVendorState();
  const info = inspectOsmdBundle(state.bytes.toString('utf8'));
  const latest = await fetchNpmLatestVersion();

  console.log('=== OpenSheetMusicDisplay (OSMD) Status ===');
  console.log(`Vendor file       : public/vendor/${state.filename}`);
  console.log(`Detected version  : ${info.version}`);
  console.log(`Latest on npm     : ${latest ?? '(offline / unavailable)'}`);
  console.log(`SHA-256           : ${state.hash}`);
  console.log(`Size              : ${(state.bytes.byteLength / 1024).toFixed(1)} KiB`);
  console.log(`References synced : ${state.referencesMatch ? 'YES' : `NO (notation.ts=${state.notationRef}, build-standalone.mjs=${state.standaloneRef})`}`);
  console.log(`Adapter contract  : OK (OpenSheetMusicDisplay, MXLHelper.MXLtoXMLstring, VexFlowMusicSheetDrawer.prototype.drawPedals)`);
  console.log(`EngravingRules    : ${Object.keys(info.rules).length} scalar rules inspected`);
  if (!state.referencesMatch) {
    process.exitCode = 1;
  }
}

async function downloadOsmdVersion(targetSpec, tempDir) {
  await runCmd(NPM_CMD, ['pack', `opensheetmusicdisplay@${targetSpec}`], { cwd: tempDir });
  const tarballs = (await readdir(tempDir)).filter(name => name.endsWith('.tgz'));
  if (!tarballs.length) throw new Error(`npm pack did not produce a .tgz for opensheetmusicdisplay@${targetSpec}`);
  const tarball = join(tempDir, tarballs[0]);
  await execFileAsync('tar', ['-xzf', tarball, '-C', tempDir]);
  const pkgRoot = join(tempDir, 'package');
  const pkgJson = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'));
  const minBundlePath = join(pkgRoot, 'build', 'opensheetmusicdisplay.min.js');
  if (!existsSync(minBundlePath)) {
    throw new Error(`Tarball for opensheetmusicdisplay@${pkgJson.version} is missing build/opensheetmusicdisplay.min.js`);
  }
  const bundleBytes = await readFile(minBundlePath);
  return {
    version: pkgJson.version,
    dependencies: pkgJson.dependencies ?? {},
    license: pkgJson.license ?? 'BSD-3-Clause',
    bundleBytes,
    bundleHash: sha256(bundleBytes),
  };
}

async function updateOsmd(targetSpec, { keepOnFailure = false, skipE2e = false } = {}) {
  const before = await getCurrentVendorState();
  const beforeInfo = inspectOsmdBundle(before.bytes.toString('utf8'));
  const tempDir = await mkdtemp(join(tmpdir(), 'etude-osmd-update-'));

  try {
    console.log(`Packing opensheetmusicdisplay@${targetSpec} into temporary workspace...`);
    const downloaded = await downloadOsmdVersion(targetSpec, tempDir);
    const afterInfo = inspectOsmdBundle(downloaded.bundleBytes.toString('utf8'));
    const ruleDiff = diffEngravingRules(beforeInfo.rules, afterInfo.rules);
    const newFilename = `osmd-${downloaded.version}.min.js`;

    console.log(`\n=== OSMD Upgrade Analysis (${beforeInfo.version} -> ${downloaded.version}) ===`);
    console.log(`New file          : public/vendor/${newFilename}`);
    console.log(`New SHA-256       : ${downloaded.bundleHash}`);
    console.log(`New size          : ${(downloaded.bundleBytes.byteLength / 1024).toFixed(1)} KiB`);
    console.log(`License           : ${downloaded.license}`);
    console.log(`Sub-dependencies  : ${Object.entries(downloaded.dependencies).map(([k, v]) => `${k}@${v}`).join(', ') || 'none'}`);
    console.log(`Contract check    : PASS (OpenSheetMusicDisplay, MXLHelper.MXLtoXMLstring, VexFlowMusicSheetDrawer.prototype.drawPedals)`);

    if (ruleDiff.added.length || ruleDiff.removed.length || ruleDiff.changed.length) {
      console.log(`\nEngravingRules changes (${ruleDiff.added.length} added, ${ruleDiff.changed.length} changed, ${ruleDiff.removed.length} removed):`);
      for (const item of ruleDiff.added) console.log(`  + [NEW]     ${item.key} = ${JSON.stringify(item.value)}`);
      for (const item of ruleDiff.changed) console.log(`  ~ [CHANGED] ${item.key}: ${JSON.stringify(item.from)} -> ${JSON.stringify(item.to)}`);
      for (const item of ruleDiff.removed) console.log(`  - [REMOVED] ${item.key} (was ${JSON.stringify(item.value)})`);
    } else {
      console.log('\nEngravingRules changes: none');
    }

    const updatedNotation = before.notationSource.replace(
      `vendor/${before.filename}`,
      `vendor/${newFilename}`,
    );
    const updatedStandalone = before.standaloneSource.replace(
      `'vendor', '${before.filename}'`,
      `'vendor', '${newFilename}'`,
    );

    const newFilePath = join(VENDOR_DIR, newFilename);
    await writeFile(newFilePath, downloaded.bundleBytes);
    if (newFilename !== before.filename && existsSync(before.filePath)) {
      await rm(before.filePath, { force: true });
    }
    await writeFile(NOTATION_FILE, updatedNotation, 'utf8');
    await writeFile(STANDALONE_SCRIPT, updatedStandalone, 'utf8');

    const gates = [
      ['Typecheck', NPM_CMD, ['run', 'typecheck']],
      ['Lint', NPM_CMD, ['run', 'lint']],
      ['Unit tests', NPM_CMD, ['run', 'test:unit']],
      ['Production build', NPM_CMD, ['run', 'build']],
      ['Standalone build', NPM_CMD, ['run', 'build:standalone']],
    ];
    if (!skipE2e) {
      gates.push(['Golden score engraving tests', NPX_CMD, ['playwright', 'test', 'tests/e2e/golden.spec.mjs']]);
    }

    try {
      for (const [label, cmd, args] of gates) {
        console.log(`\nRunning gate: ${label}...`);
        await runCmd(cmd, args);
        console.log(`  PASS: ${label}`);
      }
      console.log(`\nSUCCESS: OSMD updated to ${downloaded.version} and all verification gates passed.`);
    } catch (gateError) {
      console.error(`\nFAILED verification gate: ${gateError.message}`);
      if (gateError.stdout) console.error(gateError.stdout);
      if (gateError.stderr) console.error(gateError.stderr);
      if (!keepOnFailure) {
        console.log('\nRolling back OSMD bundle and source references to previous working state...');
        if (newFilename !== before.filename && existsSync(newFilePath)) {
          await rm(newFilePath, { force: true });
        }
        await writeFile(before.filePath, before.bytes);
        await writeFile(NOTATION_FILE, before.notationSource, 'utf8');
        await writeFile(STANDALONE_SCRIPT, before.standaloneSource, 'utf8');
        console.log(`Rollback complete: restored public/vendor/${before.filename}.`);
      } else {
        console.log('\n--keep specified: leaving updated OSMD files on disk for manual inspection.');
      }
      process.exitCode = 1;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(arg => arg.startsWith('--')));
  const target = args.find(arg => !arg.startsWith('--'));
  if (!target || flags.has('--check')) {
    await checkCurrent();
  } else {
    await updateOsmd(target, {
      keepOnFailure: flags.has('--keep'),
      skipE2e: flags.has('--skip-e2e'),
    });
  }
}
