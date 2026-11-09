// Safe dependency checker and atomic updater with automatic rollback.
// Usage:
//   node scripts/update-deps.mjs --check          (inspect all 11 npm devDependencies + runtime vendor assets)
//   node scripts/update-deps.mjs                  (safely update outdated npm devDependencies per group with rollback)
//   node scripts/update-deps.mjs --latest         (try upgrading to @latest across groups, rolling back any breaking group)
//   node scripts/update-deps.mjs --full           (also run the Playwright E2E suite after each group update)
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PKG_FILE = join(ROOT, 'package.json');
const LOCK_FILE = join(ROOT, 'package-lock.json');
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// Logical groups so coupled packages (e.g. ESLint ecosystem, Vite + Vitest) update together atomically.
const UPDATE_GROUPS = [
  {
    name: 'ESLint & TypeScript-ESLint',
    packages: ['eslint', '@eslint/js', 'typescript-eslint', 'eslint-plugin-import-x', 'globals'],
  },
  {
    name: 'Vite & Vitest',
    packages: ['vite', 'vitest'],
  },
  {
    name: 'TypeScript & Node Types',
    packages: ['typescript', '@types/node'],
  },
  {
    name: 'AST Tooling (Acorn)',
    packages: ['acorn'],
  },
  {
    name: 'Playwright Test Runner',
    packages: ['@playwright/test'],
  },
];

async function runCmd(cmd, args, options = {}) {
  const actualCmd = process.platform === 'win32' ? 'cmd.exe' : cmd;
  const actualArgs = process.platform === 'win32' ? ['/d', '/s', '/c', cmd, ...args] : args;
  return execFileAsync(actualCmd, actualArgs, {
    cwd: ROOT,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function readInstalledVersion(pkgName) {
  const pkgPath = join(ROOT, 'node_modules', ...pkgName.split('/'), 'package.json');
  if (!existsSync(pkgPath)) return 'missing';
  const data = JSON.parse(await readFile(pkgPath, 'utf8'));
  return data.version ?? 'unknown';
}

async function fetchNpmOutdated() {
  try {
    const { stdout } = await runCmd(NPM_CMD, ['outdated', '--json']);
    return stdout.trim() ? JSON.parse(stdout) : {};
  } catch (error) {
    // `npm outdated` exits with code 1 when outdated packages exist; stdout still contains the JSON object.
    if (error.stdout && error.stdout.trim().startsWith('{')) {
      try { return JSON.parse(error.stdout); } catch { return null; }
    }
    return null;
  }
}

async function collectDependencyStatus() {
  const pkg = JSON.parse(await readFile(PKG_FILE, 'utf8'));
  const devDeps = pkg.devDependencies ?? {};
  const outdated = await fetchNpmOutdated();
  const rows = [];

  for (const [name, range] of Object.entries(devDeps)) {
    const installed = await readInstalledVersion(name);
    const info = outdated?.[name];
    rows.push({
      name,
      range,
      isPinned: !range.startsWith('^') && !range.startsWith('~'),
      installed,
      wanted: info?.wanted ?? installed,
      latest: info?.latest ?? (outdated ? installed : 'offline'),
      hasUpdate: Boolean(info && (info.wanted !== installed || info.latest !== installed)),
    });
  }
  return rows;
}

async function printReport() {
  const rows = await collectDependencyStatus();
  const vendorFiles = (await readdir(join(ROOT, 'public', 'vendor'))).filter(f => f.endsWith('.js'));
  const pianoFiles = (await readdir(join(ROOT, 'src', 'assets', 'piano'))).filter(f => f.endsWith('.mp3'));
  const fontFiles = (await readdir(join(ROOT, 'src', 'assets', 'fonts'))).filter(f => f.endsWith('.woff2'));

  console.log('=== 1. Dev & Build Dependencies (package.json) ===');
  console.table(rows.map(r => ({
    Package: r.name,
    Range: r.range,
    Installed: r.installed,
    Wanted: r.wanted,
    Latest: r.latest,
    Status: r.hasUpdate ? 'UPDATE AVAILABLE' : 'UP TO DATE',
  })));

  console.log('\n=== 2. Runtime / Vendored Dependencies (Browser) ===');
  console.table([
    {
      Asset: 'OpenSheetMusicDisplay (OSMD)',
      Location: `public/vendor/${vendorFiles[0] ?? 'none'}`,
      Includes: 'VexFlow 1.2.93, JSZip 3.10.1, loglevel, typescript-collections',
      UpdateCmd: 'npm run update:osmd -- <version>',
    },
    {
      Asset: 'Salamander Grand Piano v3',
      Location: `src/assets/piano/ (${pianoFiles.length} MP3 files)`,
      Includes: 'MIDI 21..108 every 3 semitones',
      UpdateCmd: 'Protected by tests/golden/piano-recordings.json',
    },
    {
      Asset: 'Self-hosted Fonts (WOFF2)',
      Location: `src/assets/fonts/ (${fontFiles.length} WOFF2 files)`,
      Includes: 'Fraunces & Hanken Grotesk (latin + latin-ext)',
      UpdateCmd: 'src/styles/fonts.css',
    },
  ]);
}

async function runSafetyGates({ fullE2e = false } = {}) {
  const gates = [
    ['typecheck', NPM_CMD, ['run', 'typecheck']],
    ['lint', NPM_CMD, ['run', 'lint']],
    ['test:unit', NPM_CMD, ['run', 'test:unit']],
    ['test:i18n', NPM_CMD, ['run', 'test:i18n']],
    ['build', NPM_CMD, ['run', 'build']],
    ['build:standalone', NPM_CMD, ['run', 'build:standalone']],
  ];
  if (fullE2e) {
    gates.push(['playwright', NPX_CMD, ['playwright', 'test']]);
  }
  for (const [name, cmd, args] of gates) {
    await runCmd(cmd, args);
    console.log(`    [PASS] ${name}`);
  }
}

async function updateDependencies({ useLatest = false, fullE2e = false, filterNames = [] } = {}) {
  const rows = await collectDependencyStatus();
  const byName = new Map(rows.map(r => [r.name, r]));
  const results = [];

  for (const group of UPDATE_GROUPS) {
    const candidates = group.packages
      .filter(name => !filterNames.length || filterNames.includes(name))
      .map(name => byName.get(name))
      .filter(Boolean)
      .filter(row => useLatest ? row.latest !== row.installed && row.latest !== 'offline' : row.hasUpdate);

    if (!candidates.length) {
      results.push({ group: group.name, status: 'SKIPPED (already up to date)' });
      continue;
    }

    const specs = candidates.map(row => `${row.name}@${useLatest ? row.latest : row.wanted}`);
    console.log(`\n>>> Testing update for group [${group.name}]: ${specs.join(', ')}`);

    const backupPkg = await readFile(PKG_FILE, 'utf8');
    const backupLock = await readFile(LOCK_FILE, 'utf8');

    try {
      const saveFlags = candidates.every(row => row.isPinned) ? ['--save-dev', '--save-exact'] : ['--save-dev'];
      await runCmd(NPM_CMD, ['install', ...saveFlags, ...specs]);
      await runSafetyGates({ fullE2e });
      results.push({ group: group.name, status: `UPDATED (${specs.join(', ')})` });
    } catch (error) {
      console.error(`    [FAIL] ${group.name} broke a verification gate. Rolling back...`);
      await writeFile(PKG_FILE, backupPkg, 'utf8');
      await writeFile(LOCK_FILE, backupLock, 'utf8');
      await runCmd(NPM_CMD, ['install', '--prefer-offline']);
      results.push({ group: group.name, status: `ROLLED BACK (${error.message.split('\n')[0]})` });
      process.exitCode = 1;
    }
  }

  console.log('\n=== Dependency Update Summary ===');
  console.table(results);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(arg => arg.startsWith('--')));
  const filterNames = args.filter(arg => !arg.startsWith('--'));
  if (flags.has('--check')) {
    await printReport();
  } else {
    await updateDependencies({
      useLatest: flags.has('--latest'),
      fullE2e: flags.has('--full'),
      filterNames,
    });
  }
}
