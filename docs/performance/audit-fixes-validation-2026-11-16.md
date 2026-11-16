# Performance fixes follow-up — 2026-11-16

Branch: `perf/audit-fixes`, changes based on `bb6984a`.

## Changes

- Reverb impulse generation runs in bounded timer tasks. The first note starts immediately with the dry signal; the reverb joins when prepared. Preparation is deduplicated and discarded when its audio context is replaced. Unit tests verify that the input call does not allocate/generate the impulse synchronously.
- A failed library import resets its pending operation, shows localized feedback and a Retry button, and handles rejected promises. The browser regression aborts the first module request and successfully retries without reloading.
- Score import, MIDI reconstruction and SVG postprocessing load on demand when Pieces is opened or a score is imported. They have a separate build chunk and no initial Explore request. Navigation returns its pending operation to callers. A bootstrap pending state prevents a slow feature import from displaying a false startup failure; genuine errors still display the failure notice.
- Scores over 1,024 notes draw between tasks after OSMD's complete layout pass: by page in page mode, by music system in continuous mode. The adapter preserves A4 pagination, supports cancellation and restores its temporary drawing hooks. Score loading waits for the latest render, including a render superseded by a resize. Tests retain all 2,048 note bindings through page/continuous transitions and cancellation.
- Unchanged repaired SVGs retain their exact pedal/cross-staff geometry, avoiding repeated subpixel drift. Existing geometry assertions and golden baselines were preserved. Layout tests await actual completion, and the Explore geometry assertion polls for the same size threshold while layout settles.

## Measurements

Chrome 157.0.8103.51, Windows, Node 24.13.0; Pixel 5 emulation with 4× CPU slowdown. Same startup harness as the review; 3 cold/warm samples. These are browser measurements, not physical Android or audio-output latency. Node 22 remains the CI recommendation.

| Metric | Reviewed branch | With follow-up |
|---|---:|---:|
| Mobile cold ready, median | 7,289.0 ms | 7,129.9 ms |
| Mobile warm ready, median | 3,160.0 ms | 3,194.4 ms |
| Mobile cold DOM key response, median | 66.8 ms | 22.8 ms |
| Mobile warm DOM key response, median | 54.9 ms | 16.0 ms |
| Desktop cold DOM key response, median | 15.7 ms | 6.3 ms |
| Initial decoded JS | 855,887 B | 819,195 B |

Startup remains substantial; the changes defer the score tools rather than splitting every view in the application. Three samples are a smoke baseline, not a statistically confident tail-latency claim. Warm readiness did not improve.

The separate offline startup check passed (128.6 ms). See the [benchmark report](baseline-2026-11-16T09-42-44-706Z.md) and [raw measurements](baseline-2026-11-16T09-42-44-706Z.json).

For 2,048 synthetic notes at CPU 4×, three forced complete redraws retained all note bindings over eight pages. Wall time was 745–911 ms, with 6–8 timer callbacks during each redraw. The longest observed timer gap was 217–377 ms, compared with the previously synchronous 593–679 ms redraw. Drawing now yields; the total work is not eliminated. OSMD calculation, an individual page/system, and postprocessing can still block. In particular, one very large continuous system is not preemptible within the vendor call. There is no claim that all long tasks or dropped frames are eliminated. [Score measurements](score-fixes-2026-11-16.json).

## Validation

- `npm run typecheck`, `npm run lint`, `node scripts/split-locales.mjs --check`, `npm run test:i18n`: passed.
- `npm run test:unit`: 561 tests passed across 41 files.
- `npm run build:standalone`: passed; standalone browser scenarios passed.
- Complete production E2E: 692 passed, 12 skipped, 1 failed.
- Complete development E2E: 678 passed, 12 skipped, 1 failed.
- The sole remaining failure in both suites is the existing `challenger-adversarial.spec.mjs` rapid-language-switch DOM-count assertion (expected delta <= 5, actual 92). The same test was run against an isolated archive of the unmodified `bb6984a` commit and failed with the identical delta of 92. Its assertion was not weakened or excluded.
- Focused recovery, slow bootstrap, large rendering/cancellation, real-score geometry, cross-system slurs and offline navigation checks passed after their fixes. No audio/layout golden baselines were updated.
- Windows generated locale/workflow files were normalized through their generator/LF handling for reproducibility; no translated content or CI behavior changed.

Physical Android/TWA, MIDI and audio-output latency checks remain documented in `docs/runbooks/device-smoke.md`. No dependencies, piano recordings or OSMD vendor bytes were changed.
