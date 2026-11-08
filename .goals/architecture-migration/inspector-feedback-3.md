# Inspector Feedback — Iteration 3

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, and tests ran from
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. The branch has no configured upstream, no push was performed,
  and `git worktree list` showed every other worktree on its pre-existing ref.
  The only untracked files before this review were `.DS_Store` and the
  immutable `goal.md`.
- [x] **AC2 — Step 2b atomic service worker** — verified: the first commits
  after `32a184b` remain the isolated Step 2b group (`f2c56b5`, `9dcee30`,
  `b463456`) before Step 3. The generated worker contains the complete
  SHA-256 manifest, `cache: 'no-cache'`, the 8-second navigation timeout,
  active/previous `etude-` cache handling, hash verification, and navigation
  preload disabling. The complete built suite passed all 7 `sw` tests,
  including the five required migration and kill-switch scenarios.
- [x] **AC3 — Step 3 mechanical split** — verified: the split/join Vitest
  remains green; Vite, TypeScript, and Vitest are installed; OSMD 1.9.9 ships
  under `public/vendor`; the build emits 30 separate hashed MP3s; and the
  complete browser suite passed the boot guard, recording, bridge-era
  compatibility, and deterministic aborted-warm-up recovery checks.
- [x] **AC4 — Self-hosted fonts** — verified: the six local Fraunces and
  Hanken Grotesk subsets are built and precached; the built browser suite made
  no Google Fonts request; all engraving goldens passed; and
  `git diff 32a184b -- tests/golden` is empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced the 5.64 MiB single-file artifact, and
  the `file://` Playwright test passed with lazy OSMD loading and no page
  error.
- [x] **AC6 — Static locale modules** — verified: locale and lesson modules
  remain statically imported, `setLang()` remains synchronous, duplicate-key
  linting passed, the locale parity/unit tests passed, and the separate i18n
  compatibility suite passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  The file-wide `@ts-nocheck` was removed, but it was replaced with **3,412
  identical `@ts-ignore` directives** in the 18,898-line
  `src/domain/views.ts`. These suppressions cover about 22% of its 15,179
  non-comment code lines. Removing only those directives in an independent
  probe produced **5,584 diagnostic lines** and exit code 2, starting with
  implicit `any`, unsafe DOM access, unknown locale data, unchecked indexes,
  and nullability errors. This is not a strict TypeScript views migration or a
  scalable typed boundary; it is the same unchecked runtime with thousands of
  line-level compiler bypasses. The storage, theory, audio, notation, and
  routing modules remain real typed boundaries, and `src/legacy/` plus the old
  bridge remain absent, but the principal view/application domain is still
  overwhelmingly unchecked.
- [ ] **AC8 — All quality gates green** — **FAILED**. The configured
  typecheck, lint, Vitest, i18n, production build, standalone build, full
  built Playwright suite, and Vite-development Playwright suite all returned
  success. The built suite passed 210 tests and the dev app project passed
  203 tests with no retries. However, the required strict TypeScript gate is
  not substantively green: `scripts/check-ts-suppressions.mjs` rejects only
  `@ts-nocheck` while allowing 3,412 `@ts-ignore` directives, and the
  no-suppression compiler probe fails with 5,584 diagnostic lines. The gate
  therefore certifies the presence of the file while bypassing strict checking
  for a large portion of its runtime.
- [x] **AC9 — Behaviour preserved** — verified by the complete browser suites:
  manifest `id`, `start_url`, and `scope` remain `./etude.html`,
  `./etude.html`, and `./`; storage compatibility, localization,
  accessibility, deployment, offline updates, recordings, score engraving,
  and standalone behavior passed. Test count increased from the plan's
  196-test baseline to 210 built tests, and no golden baseline changed.
- [ ] **AC10 — Documentation** — **FAILED**. The required documents exist and
  describe the build, generated worker, source layout, commands, standalone
  artifact, and file-addition workflow. They also disclose that line-scoped
  compatibility annotations remain. Nevertheless, the plan status says Step
  5 is implemented and locally verified, and the instructions describe the
  runtime as being on the strict gate. With 3,412 uniform compiler bypasses
  and 5,584 diagnostics when they are removed, those final-state claims
  materially overstate the completed architecture.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Caveat: the added guard checks only `@ts-nocheck`; it accepts all 3,412
    `@ts-ignore` directives in `views.ts`.
- Independent strict views probe: create a temporary copy of `views.ts` with
  only the `@ts-ignore` lines removed, then run `npx tsc --noEmit --pretty
  false`.
  - Result: **FAIL — exit 2, 5,584 diagnostic lines**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 23 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — generated a 5.64 MiB self-contained artifact.
- Full built Playwright suite, using an untracked temporary configuration on
  isolated port 8893:
  - Result: PASS — 210 tests, including 7 `sw` tests.
- Vite-development Playwright app suite, using an untracked temporary
  configuration on isolated port 8894:
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — recordings and all three score fixtures passed; no
    committed baseline differs from `32a184b`.
- Commit convention:
  - Result: PASS — all post-anchor commits have subjects at most 72
    characters, role markers, and both required trailers.
- Overall quality-gate result: **FAIL**, because strict TypeScript coverage of
  the principal runtime is bypassed by thousands of line-level suppressions.

## Issues Found

### 1. File-wide suppression was converted into thousands of line suppressions

Iteration 2 failed because `views.ts` used `@ts-nocheck`. Iteration 3 removed
that one directive but inserted the same `@ts-ignore` comment 3,412 times.
This changes the granularity of the bypass, not the underlying type safety.
The comments are not narrow, individually explained compatibility exceptions;
every one uses the generic text “legacy view boundary is being migrated
incrementally,” including function signatures with implicit `any`, unchecked
object indexing, and routine DOM operations.

### 2. The new guard protects the spelling, not strictness

`scripts/check-ts-suppressions.mjs` scans only for `@ts-nocheck`. It does not
reject `@ts-ignore`, require `@ts-expect-error`, cap suppressions, or ensure a
suppression is tied to a documented interoperability boundary. Consequently,
`npm run typecheck` reports a false green while thousands of known errors are
hidden.

### 3. The views domain remains an untyped monolith

`src/domain/views.ts` is now 18,898 lines and still contains 15,179
non-comment code lines. The independent probe demonstrates errors throughout
ordinary application logic, not only at a small DOM adapter boundary. This
does not meet the requested recommended, scalable TypeScript architecture,
even though the other extracted domain modules and behavioral tests are in
good condition.

### 4. Final-state documentation overstates completion

The documentation now truthfully mentions line-scoped annotations, but it
simultaneously labels Step 5 implemented and the runtime strictly checked.
Those claims are incompatible with the measured suppression density and
failed no-suppression probe.

## What Must Be Fixed

1. Remove the blanket population of `@ts-ignore` directives from
   `src/domain/views.ts`; do not replace them with another broad suppression
   mechanism.
2. Type the actual view/application runtime so it passes `strict` compilation.
   Split the monolith into maintainable view modules and introduce explicit
   DOM element, state, locale, event, and domain data types.
3. If a truly unavoidable external-compatibility exception remains, use a
   narrowly documented `@ts-expect-error` at the exact boundary and keep the
   total exceptional surface small and reviewable.
4. Strengthen the suppression guard and lint configuration to reject
   `@ts-ignore` in application sources and prevent a future false-green gate.
5. Keep the currently green storage, theory, audio, notation, routing,
   standalone, service-worker, accessibility, and golden behavior while
   completing the conversion.
6. Update the plan status and architecture documentation only after the
   unsuppressed strict probe and all configured gates pass.
