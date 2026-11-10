# Production performance baseline

Measurement only: this harness does **not** change app runtime, bundling, locales,
lessons, standalone output, or the production service-worker manifest/precache.

## Reproduce

From the repository root, with installed project dependencies and Playwright's
bundled Chromium available:

```sh
npx vitest run tests/unit/perf-baseline.test.mjs
PW_CHANNEL='' npm run perf:baseline
# Optional: more samples; minimum is 3 per profile.
PW_CHANNEL='' npm run perf:baseline -- --samples 10
```

The `PW_CHANNEL=''` syntax above is for bash (including this Windows Git Bash
setup). Empty/unset uses bundled Chromium; a nonempty value selects that
Playwright channel. A missing browser produces a nonzero exit and an actionable
Playwright error. `node scripts/perf-baseline.mjs --help` does not build or launch.
Importing the module does not execute the CLI.

Do not run builds, browser tests or other heavy work concurrently. The harness
imports `build()` for a fresh production build, then `serve()` on an ephemeral
loopback port, and closes its browser/contexts/server in `finally`. It does not
spawn a persistent shell server. Results are timestamped UTC JSON plus a readable
Markdown report in this directory; JSON contains all samples, percentile
aggregates, OS/browser/CPU metadata, commit and dirty-tree status, script hashes,
resource timing and raw CDP metrics. Build output remains in ignored `dist/etude`.

## Workload and profiles

- English saved-state seed, visible keyboard dock, `etude.html#explore`.
- Desktop: 1440 × 900, CPU 1×, no network throttle.
- Mobile emulation: Playwright Pixel 5 context, CPU 4× slowdown, network latency
  150 ms, download 200,000 bytes/s, upload 93,750 bytes/s. Not a real phone.
- Three **fresh browser contexts** per profile by default. Each cold navigation
  is followed by a same-page HTTP-cache warm reload; service workers are blocked.
  Warm reload follows a key interaction and may preserve app-saved state.
- A separate desktop functional offline check permits the normal full precache,
  waits for a controller, records cache entry counts, clears browser HTTP cache,
  disables network and reloads. It is one sample, not an HTTP warm aggregate.
  Offline failures are recorded in the report and make the CLI exit nonzero.

## Metrics and interpretation

Ready is the first animation frame that observes `window.__etude.show` and a
`#keys .key` element, timestamped with navigation-relative `performance.now()`.
It is not full lesson readiness or a paint metric. Startup CDP task/script time
is collected before a separate key interaction. Chromium resets duration counters
on navigation: the harness checks `NavigationStart`, uses post-reset counters or
same-navigation deltas as appropriate, rejects negative values, and retains both
raw snapshots. Protocol/ready-wait collection overhead remains in this window.
Script time does not isolate parsing/compilation.

Buffered Long Tasks API entries starting before readiness are read after a
100 ms delivery window. Their full durations are retained, not clipped at ready.
DOM key response measures trusted Playwright Space keydown on a focused visible
key to a MutationObserver seeing `.pressed`. It is **not physical input latency,
paint latency, or audio latency**. Startup collection finishes before this action.

JS resource timing reports transferred, encoded and decoded sizes separately.
A zero warm `transferSize` indicates a cache hit in this controlled same-origin
setup. The local server serves **uncompressed HTTP**: do not equate this wire
measurement with GitHub Pages/CDN/TLS costs. Inventory includes *all* published JS
(including lazy OSMD and `sw.js`), its SHA-256, and separate gzip level-9 / Brotli
quality-11 estimates. These estimates are not actual measured compressed wire
sizes and are not used to infer a locale percentage.

Every aggregate uses nearest-rank percentile: sort ascending and select
`max(0, ceil(n*p) - 1)` (zero-based). This defines the median too (lower middle for
even n). With three samples, p95 is the maximum: this is a reproducible smoke
baseline, not a statistically confident tail-latency claim or performance budget.
Fresh contexts do not guarantee a cold browser process, CPU, OS filesystem cache
or browser compilation cache. Compare only like-for-like environments/profiles.

Unit helpers were developed in separate RED → GREEN cycles for percentile,
aggregation, CLI validation, JS resource totals, and navigation-reset CDP
accounting. The complete benchmark is exercised against the real production build.
