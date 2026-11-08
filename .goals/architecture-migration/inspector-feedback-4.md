# Inspector Feedback — Iteration 4

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, temporary test configuration, and generated output stayed in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration` at `b1f0565`. The branch has no upstream, there is no remote
  `migration` branch, no push was performed, no existing server was stopped,
  and the other listed worktrees remain on their existing refs. Before this
  review, the only untracked files were `.DS_Store` and the immutable
  `goal.md`.
- [x] **AC2 — Step 2b atomic service worker** — verified: the first commits
  after `32a184b` remain the isolated Step 2b group (`f2c56b5`, `9dcee30`,
  `b463456`) before Step 3. The generated worker contains the complete
  SHA-256 manifest, `cache: 'no-cache'`, the 8-second navigation timeout,
  active/previous `etude-` cache handling, hash verification, and navigation
  preload disabling. The full built suite passed all 7 `sw` tests, including
  the required five migration and kill-switch scenarios.
- [x] **AC3 — Step 3 mechanical split** — verified: the split/join unit test
  passed; Vite, TypeScript, and Vitest remain installed; OSMD 1.9.9 remains
  under `public/vendor`; the build emitted all 30 separately hashed MP3s; and
  the built and development suites passed the boot guard, recording, and
  deterministic aborted-warm-up recovery checks.
- [x] **AC4 — Self-hosted fonts** — verified: the six Fraunces and Hanken
  Grotesk subsets remain local and precached, the browser suites passed, and
  `git diff 32a184b -- tests/golden` is empty. All three engraving goldens
  passed.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.66 MiB single-file artifact, and
  both the built and Vite-development runs passed the standalone
  `file://` smoke test.
- [x] **AC6 — Static locale modules** — verified: locale/content modules
  remain statically imported, `setLang()` remains synchronous, duplicate-key
  linting and en/ro parity passed, Vitest passed, and the separate i18n suite
  passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  Iteration 4 removed 3,412 `@ts-ignore` comments but did not type the view
  runtime. It mechanically replaced the suppressed expressions with pervasive
  explicit `any`: `src/domain/views.ts` now contains **7,899 `any` tokens on
  4,119 lines**, while declaring **zero interfaces, zero type aliases, and zero
  `unknown` values**. All imported typed domain APIs are immediately erased
  back to `any` at lines 9–15. Routine primitives, loop indexes, DOM elements,
  callbacks, state objects, function parameters, and return values are also
  annotated `any`, commonly with artificial `= undefined` defaults. This
  covers about 26.6% of the 15,493-line file and is a broad compiler bypass,
  not the explicit DOM, state, locale, event, and domain data typing required
  by the previous finding and the requested recommended, scalable
  architecture.

  The existing storage, theory, audio, notation, and routing module ownership
  remains in place, `src/legacy/` and the bridge remain absent, and behavior is
  green. However, the principal application/view domain is still effectively
  dynamically typed.
- [ ] **AC8 — All quality gates green** — **FAILED**. Every configured command
  returned success: typecheck, lint, Vitest, extra i18n tests, production and
  standalone builds, 210 built Playwright tests, and 203 Vite-development
  tests. The suppression guard also correctly rejects `@ts-ignore` and an
  unexplained `@ts-expect-error`. Nevertheless, the required strict
  TypeScript gate is not substantively green: neither TypeScript `strict` nor
  the configured ESLint rules reject explicit `any`, so the gate accepts
  7,899 escapes in the main runtime. The new boundary test checks only comment
  spellings and likewise accepts the wholesale `any` conversion.
- [x] **AC9 — Behaviour preserved** — verified by the complete built and
  development browser suites. The manifest still has
  `id: "./etude.html"`, `start_url: "./etude.html"`, and `scope: "./"`;
  storage compatibility, localization, accessibility, deployment, offline
  updates, recordings, score engraving, and standalone behavior passed. Test
  count remains 210 built tests and 203 development tests, with no golden
  change.
- [ ] **AC10 — Documentation** — **FAILED**. The updated plan, README,
  instructions, and i18n notes claim that the view runtime uses “explicit
  DOM/data boundary types rather than compiler-suppression comments.” The
  implementation instead erases every imported domain type and thousands of
  ordinary runtime values to `any`, with no view-domain type declarations.
  Those final-state claims materially overstate the completed architecture.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Enforcement result: **FAIL** — it permits 7,899 explicit `any` tokens in
    the principal runtime.
- Suppression-guard mutation checks:
  - Added a temporary `@ts-ignore`: correctly rejected.
  - Added a temporary unexplained `@ts-expect-error`: correctly rejected.
  - Files were restored byte-for-byte after each probe.
- Command: `npm run lint`
  - Result: PASS.
  - Caveat: no `@typescript-eslint/no-explicit-any` or equivalent rule is
    enabled.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 24 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — generated a 5.66 MiB self-contained artifact.
- Full built Playwright suite, using an untracked temporary configuration on
  isolated port 8895:
  - Result: PASS — 210 tests, including 7 `sw` tests.
- Vite-development Playwright app suite, using an untracked temporary
  configuration on isolated port 8896:
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — recordings and all three score fixtures passed; no
    committed baseline differs from `32a184b`.
- Commit convention and ordering:
  - Result: PASS for the latest Builder commit and the preserved Step 2b-first
    ordering; `b1f0565` has the `[B]` marker and both required trailers.
- Overall quality-gate result: **FAIL**, because the strict migration gate
  accepts a blanket explicit-`any` conversion of the application runtime.

## Issues Found

### 1. Compiler comments were replaced with a larger explicit-`any` bypass

The previous iteration had 3,412 uniform `@ts-ignore` directives. The current
iteration removes those comments by adding `any` to virtually every affected
declaration, parameter, callback, local, and return type. The result compiles,
but it provides no more static safety: invalid property access, wrong argument
types, nullability mistakes, and incompatible domain data continue to flow
unchecked.

The scale is objective:

- 7,899 `any` tokens;
- 4,119 lines containing `any`;
- 15,493 total lines in `views.ts`;
- zero `interface` declarations;
- zero `type` aliases;
- zero `unknown` values.

### 2. Typed domain contracts are deliberately erased at the view boundary

The imports at the top use namespace imports, then immediately assign every
locale, content, storage, theory, audio, notation, and router export to
`const ...: any`. This discards the useful types already provided by those
modules, so the view runtime cannot detect misuse of the extracted domain
APIs.

### 3. The strengthened guard protects comment syntax, not type safety

`scripts/check-ts-suppressions.mjs` correctly rejects `@ts-nocheck`,
`@ts-ignore`, and poorly explained or excessive `@ts-expect-error`
directives. It does not detect explicit `any`. The new unit test only searches
for suppression comments. Both gates therefore certify the same unchecked
runtime under a different spelling.

### 4. Final-state documentation is inaccurate

The documentation now says the runtime uses explicit DOM/data boundary types.
It actually uses `any` for DOM access, locale data, application state, imported
domain functions, and routine scalar values. The plan status must not call the
strict migration complete while this remains true.

## What Must Be Fixed

1. Replace the blanket explicit-`any` conversion in `src/domain/views.ts` with
   real types. At minimum, preserve imported domain types and define explicit
   types for DOM elements, application state, locale/content records, events,
   callbacks, and view data.
2. Remove artificial `: any = undefined` parameter defaults and type function
   inputs/outputs according to actual behavior. Use `unknown` plus narrowing
   at genuinely dynamic external boundaries.
3. Keep any unavoidable interoperability escape narrowly scoped and
   documented; do not use `any` as the default type for ordinary application
   logic.
4. Add an enforced explicit-`any` gate, such as
   `@typescript-eslint/no-explicit-any`, with only small, reviewed exceptions.
   Add regression coverage proving a blanket `any` conversion fails.
5. Keep all currently green behavior, worker, standalone, storage,
   localization, accessibility, and golden checks while completing the real
   typing work.
6. Update the plan status and architecture documentation only after the view
   runtime is genuinely typed and the strengthened gates pass.
