# Read tab redesign: integration map

How a generated piece moves through the app today, and what a `LevelPiece` (src/sight-reading/levels.ts) needs.
Read from the code on 2026-11-13. "VR" is `src/domain/views-runtime.ts`. Line numbers drift: search for the names.

## Rendering

- Chain: `rdOpen` → `rdSightStart` → `srtGenerate` → `srtLegacyPiece` (the app's adapter, in VR) → `SR.gen` → `rdTab('pieces')` → `srSelectPiece('gen')` → `srShowPiece` → `srDraw` → `srRender(SR.piece, srPaper())` → `srPaintAll`. `srFit` re-lays out on resize.
- The engraver input is `SrScore`: `{ts:[num,den], keyN?, pickup?, rh?, lh?: SrToken[]}` with `SrToken = [pitch | pitch[] | 'R', durationInQuarters, 'tied'?]`. Pitches are strings like `F#4`. No double accidentals.
- `srRender` is shared by the Learn lesson staves and the rhythm drills. A change to it affects them.
- Already supported: several systems (4 bars per system by default), ties (also across a system break), rests, chords, naturals, dots on notes, key signatures from -7 to +7, any `ts` for bar length.
- Gaps in `srRender`:
  - Beams only for on-beat eighth pairs when `ts[1] === 4`. Sixteenths and all of 3/8 and 6/8 get flags.
  - Rests ignore dots, and a whole-bar rest in 3/4 or 6/8 is drawn as a half rest.
  - No accidental memory inside a bar: a repeated accidental is drawn again, and a natural after an accidental in the same bar is not shown.
  - A tie is taken from the last note of the hand without a pitch check, and a tied chord loses its tie.
  - Note-name labels come from the MIDI number, not from the spelling.
- Gaps in the adapter `srtLegacyPiece` and `srtNotationSegments` (src/sight-reading/notation.ts): bar length assumes a quarter beat, notes are never split at a barline, `ts` is forced to `[num, 4]`, and bpm is forced to 60.

## Playing and scoring

- `srtBuildExpected` (model.ts) is typed to the old piece and computes the length with a quarter beat. It does not use `profileId`.
- `srtEvaluate` (evaluate.ts) only needs expected and performed notes. It is piece-agnostic.
- `srAssessFinish` maps results to drawn notes by array index. Expected notes are sorted with `lh` before `rh`, drawn notes with `rh` first. With two hands on the same beat the results can land on the wrong note. Map by id instead.
- Count-in and metronome (`srAssessStart`): one click per quarter. 6/8 gets three clicks per bar, and 3/8 gets an irregular count-in.
- First sight forces 60 bpm. Practice uses `#rd-bpm` (40 to 160, quarters per minute).
- Step by step (`srLearnStart`, `srStepsBuild`) groups notes by beat, so chords and two hands work. `srListen` plays any meter.

## First sight and ledger

- `flow.ts` works on fingerprints and attempt ids only.
- `srtFingerprint` (fingerprint.ts) is typed to the old piece. Its string holds meter, key, bars and events with the prefix `v1`.
- The ledger validator (`isAttempt`, `isLedger` in ledger.ts) has no profile, level, bars or meter field and does not reject extra fields. An attempt does not record which level or book entry it was for.

## State and storage

- `rdData()` keeps `data.reading = {lv, nt, tot, prefs}` and fills defaults, so an optional new field needs no migration.
- Sync merges by key regexes `SYNC_ADD` and `SYNC_MAX` in VR. A new numeric field under `reading.*` must be added to one of them, or the last writer wins.
- A change to the saved format needs an entry in `PTT_MIGRATIONS` (src/domain/storage.ts) and a fixture test.

## UI wiring

- HTML: `etude.html`, section `#view-read`. Tabs `#rdt-drills` and `#rdt-pieces`, panels `#rdp-drills` (`#rdx-home`, `#rdx-stage`) and `#rdp-pieces` (`#rd-gen`, `#rd-hands`, `#rd-mode`, `#rd-names`, `#rd-srt-*`, `#rd-staff`, `#rd-verdict`, `#rd-go`, `#rd-listen`, `#rd-bpm`).
- Code: `renderRead` → `rdRender` → `rdTab`. `rdRenderHome` draws the hero and the ladder. `rdInit` binds events. `rdBack` swaps stage and home. `stageSync` sets `body[data-stage=immersive]`.
- Strings: edit `src/locales/index.js` (7 language blocks), then run `node scripts/split-locales.mjs`. A unit test fails when the `ui-*.ts` files are stale. Only en and ro must have identical keys.
- CSS files are imported at the top of VR.

## Tests that pin the current Read tab

- About 25 e2e specs use `#rdt-pieces`, `#rd-gen`, `#rd-mode`, `#rd-go`, `#rd-srt-*`, `#rd-staff`, `#rd-verdict`, `#rd-listen`, `#rd-names`, `.ss-*`, and for drills `#rdx-ladder`, `.rdx-lv[data-lv=...]`, `#rdx-stage`, `#rdx-body`, `#rdx-back`, `#rdx-cont`, `#rdx-hero`.
- Keep these ids in the DOM when the page changes. Hide or restyle them rather than rename them.
- Unit tests read VR as text: no explicit `any`, no `@ts-*`, `srClick` must use `audioEngine.scheduleClick`.

## Build rules

- `npm run typecheck` rejects explicit or inferred `any`, `@ts-ignore`, and the words `base64`, `encodedRuntime`, `generatedRuntime`.
- Lint forbids import cycles, `eval`, `Function`, `atob`, `btoa`.
- CI jobs are pinned by tests/unit/ci-config.test.mjs.

## Integration path

1. A new adapter from `LevelPiece` to `SrScore` tokens that splits at barlines and beats and uses `ts:[num,den]`.
2. On top of `srRender`: beams for eighths and sixteenths in every meter, dotted and whole-bar rests, accidental memory per bar, tied chords.
3. Widen `srtBuildExpected` and `srtFingerprint` to a shared piece shape, with the bar length in ticks and a `v2` fingerprint prefix.
4. Count-in per beat in 3/8 and 6/8.
5. Map results to drawn notes by id.
6. A `reading.book` store with sync entries, separate from the old ladder.
7. Keep the existing element ids.
