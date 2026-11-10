# Locale and lesson splitting: verified comparison

## Scope and provenance

Baseline: `baseline-2026-11-09T22-03-46-248Z.json`.
After: `baseline-2026-11-10T06-00-33-753Z.json`.
Both were executed with `PW_CHANNEL='' npm run perf:baseline` on the same host,
Chromium version, profiles, CPU/network emulation and workload (`#explore`, English,
visible keyboard). Each profile has three fresh-context cold/warm pairs. The JSON
records commit `a9c18b9` plus dirty working-tree provenance; the application changed
between the two runs. The after artifact's published script hashes were verified
against the actual build. Both owned HTTP servers were verified closed afterward.

The generator keeps the existing multilingual aggregates authoritative for Node
compatibility and produces checked per-language files. The browser graph imports
only the title/identity/unit catalog synchronously, then English UI fallback and
the selected language. Learn bodies, quizzes, summaries and glossary load on demand.
The service worker still precaches all published payloads for offline availability.

## Measured results

All timing values below are medians, not promises for real devices.

| Profile / HTTP cache | Ready before (ms) | Ready after (ms) | Change |
|---|---:|---:|---:|
| desktop / cold | 298.0 | 453.4 | +52.15% |
| desktop / warm | 90.8 | 118.4 | +30.40% |
| mobile-emulated / cold | 11849.7 | 6574.3 | -44.52% |
| mobile-emulated / warm | 2864.7 | 2949.1 | +2.95% |

| Startup metric | Before | After | Change |
|---|---:|---:|---:|
| Decoded startup JavaScript (bytes) | 1703641.00 | 721152.00 | -57.67% |
| Cold JS transfer (local raw HTTP; estimated headers included) | 1703941.00 | 721752.00 | -57.64% |
| Cold mobile CDP ScriptDuration (ms) | 1047.98 | 310.52 | -70.37% |
| Warm mobile CDP ScriptDuration (ms) | 245.04 | 22.69 | -90.74% |
| Cold mobile DOM key response (ms) | 18.20 | 14.10 | -22.53% |
| Warm mobile DOM key response (ms) | 9.60 | 8.80 | -8.33% |

The separate SW-controlled offline startup passed after clearing HTTP cache:
231.9 ms ready in the after run. This one desktop sample is not pooled with HTTP
warm measurements.

## Interpretation and remaining limitations

- The material result is less startup JavaScript and a faster cold mobile-emulated
  load. Cached total readiness did **not** improve in these samples; desktop and
  warm medians are higher in this run. Absolute and relative differences are recorded
  above; do not present this as an across-the-board speedup.
- Three samples are a smoke baseline, not statistical proof of small regressions
  or improvements. Nearest-rank p95 at this sample count is the maximum.
- Local HTTP responses are uncompressed. The mobile cold emulation result is
  not a GitHub Pages/CDN estimate. gzip/Brotli inventory estimates are stored
  separately from actual wire measurements.
- The DOM key probe excludes physical device, paint and audible output latency.
  The small increases above are recorded rather than hidden.
- The main web chunk remains about 647 kB minified, so Vite still emits its 500 kB
  warning. The threshold was not raised. Further view-level splitting is a future,
  separate optimization, not required to make the locale split correct.
- Standalone intentionally contains all payloads inline; its size is not optimized
  by this split. Its offline, all-language, audio-decoding and embedded-font tests pass.

## Acceptance checks

| Requirement | Evidence |
|---|---|
| Lint without disabling project rules | `npm run lint`; tests assert ignored workspaces and retained script rules |
| Reproducible before/after measurements | Two linked JSON artifacts with 12 HTTP samples each, raw counters and hashes |
| Minimal Today catalog | Full metadata/order/gate equality tests and startup checks for all seven languages |
| On-demand UI and Learn payloads | Per-language fidelity tests; page-request checks exclude inactive languages and Learn at startup |
| Safe loading and offline/standalone operation | Direct `#learn`, rapid language switching, delayed imports/navigation, explicit retry, retired-chunk 404/reload with saved progress, warmed-Today offline seven-language matrix, and single-file `file://` matrix |

Final local verification after all review-discovered regressions were repaired:

- `npm run typecheck` and the CI strict TypeScript command passed.
- `npm run lint` passed.
- `npm run test:unit`: **271 passed**.
- `npm run test:i18n`: **2 passed**.
- `node scripts/split-locales.mjs --check`: **15 generated files verified**.
- Production Playwright suite: **403 passed, 21 skipped**.
- Development Playwright suite: **390 passed, 21 skipped**.
- The existing aborted-piano-warm-up failure/recovery assertions remain intact and pass in both complete suites. Fault installation and the intended prepare call run in the same browser task.
- `git diff --check` passed.
- Independent build/standalone review and final runtime re-review passed with no blocking security or logic findings.
- Dedicated browser regressions verify post-commit Settings localization, English glossary search aliases, successful or failed cross-tab imports finishing during drills, retained remote intent during ordinary saves, stale Retry actions, explicit recovery and absence of retry loops.
- A combined long verification invocation hit the tool timeout and experienced browser/worker crashes during its dev phase. The standalone full dev rerun completed cleanly (390 passed, 21 skipped); the successful production run and the final separate benchmark are retained above.

The 21 skipped tests are not claimed as coverage; optional/private score fixture
checks remain outside this verification. The complete task is published only after
independent review and remote commit verification.
