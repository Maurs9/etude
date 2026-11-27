# Dependency audit

The November 27, 2026 audit used the committed npm lockfile on Node 22. Repeat with `npm ci`, `npm audit --json`, `npm audit --omit=dev --json`, and `npm run osmd:check`.

| Inventory | November 18, 2026 (prior audit) | November 27, 2026 (current lockfile) |
| --- | --- | --- |
| Full npm lockfile | 12 affected entries (all high), from 1 advisory | 0 affected entries |
| Production npm dependencies | 0 affected entries | 0 affected entries |

- `npm ci` + `npm audit --json` and `npm audit --omit=dev --json` both report 0 vulnerabilities across all severities (`info`, `low`, `moderate`, `high`, `critical`).
- The browser downloads the vendored `public/vendor/osmd-3.0.0.min.js` (1460.9 KiB). `npm audit` excludes this file.
- `npm run osmd:check` verified the adapter contract (`OpenSheetMusicDisplay`, `MXLHelper.MXLtoXMLstring`, `VexFlowMusicSheetDrawer.prototype.drawPedals`), synced asset references, 347 scalar `EngravingRules`, npm latest version (`3.0.0`), and SHA-256 `919b33bdc0e8142dec5f5d1c596535ed654a04447bc9c609f195c5907ddd5454`.
- The published npm manifest for `opensheetmusicdisplay@3.0.0` declares `jszip` `3.10.2`, `typescript-collections` `^1.3.3`, and (in `devDependencies` bundled into the UMD build) `vexflow` `1.2.93` and `loglevel` `^1.8.0`. Exact embedded versions of `loglevel` and `typescript-collections` inside the minified bundle remain unverified. [OSMD release manifest](https://unpkg.com/opensheetmusicdisplay@3.0.0/package.json)
