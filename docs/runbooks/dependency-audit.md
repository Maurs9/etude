# Dependency audit

The November 18, 2026 audit used the committed npm lockfile on Node 22. Repeat with `npm ci`, `npm audit --json`, and `npm audit --omit=dev --json`.

| Inventory | Before the toolchain update | After the toolchain update |
| --- | --- | --- |
| Full npm lockfile | 14 affected entries (6 high, 8 moderate), from 2 advisories | 12 affected entries (all high), from 1 advisory |
| Production npm dependencies | 0 affected entries | 0 affected entries |

- ESLint 10.15.0 and typescript-eslint 8.73.0 resolved `minimatch` to 11.0.9, above the affected range for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
- Vite 8.3.8 and Vitest 5.1.1 still use `picomatch` 4.0.7, the latest published version when checked. The 12 high entries are development-tree paths to [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), including paths through `tinyglobby` in lint tooling. npm's suggested Vite and Vitest changes downgrade across major versions. Recheck the lockfile when a supported release resolves the affected range.

The browser downloads the vendored `public/vendor/osmd-2.3.1.min.js`. `npm audit` excludes this file. `npm run osmd:check` verified the adapter, asset references, and SHA-256 `caa3052d01f4e1b91fd22e12d6561269d157edced929ef88c95ecb5f9d387812`. The file also matched the npm release byte for byte. The release declares VexFlow 1.2.93, JSZip 3.10.2, loglevel `^1.8.0`, and typescript-collections `^1.3.3`. The npm advisory endpoint returned no matches for OSMD 2.3.1, VexFlow 1.2.93, and JSZip 3.10.2. The exact embedded versions of loglevel and typescript-collections remain unverified. [OSMD release manifest](https://unpkg.com/opensheetmusicdisplay@2.3.1/package.json)
