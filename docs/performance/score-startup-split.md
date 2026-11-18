# Score analysis and marking startup comparison

Score harmony, MusicXML marking analysis, and SVG symbol binding now load with the score tools when Pieces opens. Today and Explore keep the common piano, navigation, and music modules. The built-site regression checks the score chunk is absent on both startup routes and loads when Pieces opens.

Measurements compare `5071fdd` and `25bcee0` on the same Linux x64 host with Node 22.23.5, Chromium 158.0.8127.18, and the same lockfile. Each cell is the median of three cold and warm pairs from the production harness. Mobile uses the Pixel 5 profile with 4× CPU slowdown, 150 ms added latency, and 200,000 bytes/s download.

| Entry view | Profile | Cold ready before → after | Warm ready before → after | Cold script time before → after |
|---|---|---:|---:|---:|
| Today | Desktop | 314 → 322 ms | 318 → 250 ms | 70 → 10 ms |
| Explore | Desktop | 344 → 338 ms | 332 → 323 ms | 94 → 18 ms |
| Today | Emulated mobile | 7,620 → 7,204 ms | 3,358 → 3,338 ms | 266 → 73 ms |
| Explore | Emulated mobile | 7,641 → 7,292 ms | 3,358 → 3,409 ms | 282 → 58 ms |

Both routes requested 830,253 decoded JavaScript bytes after the split, down from 864,777. The main chunk fell from 517,049 to 510,156 raw bytes. Warm reloads transferred zero JavaScript bytes in the harness. All four service-worker-warmed offline checks passed with the HTTP cache cleared.

The comparison isolates the chunk split before the toolchain update and the other refactors on this branch. The readings are from uncompressed local HTTP and browser emulation. With three samples, the warm results are mixed and the cold results measure startup only. See [harness definitions](README.md) for the readiness signal and measurement limits.

```sh
PW_CHANNEL='' npm run perf:baseline -- --view today
PW_CHANNEL='' npm run perf:baseline -- --view explore
```
