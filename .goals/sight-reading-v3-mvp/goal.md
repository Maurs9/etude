# Goal: Sight-Reading v3 MVP (migration Step 6, M0–M10)

## User Request

> "daca totul este in regula, creaza un alt goal pentru a implementa pasul 6: sight reading si asigura-te ca este implementat corect, fara bug-uri"

In English: "If everything is OK, create another goal to implement step 6, sight reading, and make sure it's implemented correctly, without bugs."

The user was unavailable during the interview, so the orchestrator made these decisions:

- **Scope:** the full MVP, M0–M10, and nothing from V2/V3.
- **Where:** a separate worktree and branch, starting from the verified `migration` branch.
- **Languages:** all 7 interface languages.

## Refined Goal

Implement Sight-Reading v3 MVP in Étude's Read & Play view (`#view-read`). The specification is **Part III of `docs/plans/2026-11-07-unified-migration-and-sight-reading-plan.md`**: §5.1–§5.7, tasks M0–M10, and the `srt:*` rows of the Part V test matrix. Step 6 of `docs/plans/2026-11-08-safe-migration-plan.md` points to it.

The new logic lives in strict TypeScript modules under `src/sight-reading/`:

| Module | Contents |
|---|---|
| `model.ts` | the piece model |
| `fingerprint.ts` | the FNV-1a 64-bit fingerprint |
| `evaluate.ts` | the evaluator |
| `recorder.ts` | the input recorder |
| `generator.ts` | the deterministic generator |
| `ledger.ts` | the `etude-sight-v1` ledger, coordinated with Web Locks |
| `flow.ts` | the state machine |

These modules are wired into the existing Read view. That gives users:

- a "first attempt in tempo" mode with a 20 s preview, a count-in and a single eligible attempt on unseen generated content;
- "practice in tempo";
- the existing step-by-step practice, unchanged;
- an explainable, accessible score summary;
- the ledger included in backup export and import;
- full offline operation.

Every existing behaviour of the app must keep working exactly as before.

**The code has moved since the spec was written.** It still names `src/legacy/app.js` and `src/i18n/locales/{en,ro}/strings.json`, but the app now lives elsewhere:

| What | Where it is now |
|---|---|
| Browser runtime (`srRender`, `srListen`, `srClick`, `srPlayGap`, `previewNote`, `onInputChange`, `handleNoteOn`/`Off`, `releaseFocusInput`, `releaseLiveInput`, `panic`, `srNextAssess`, `rdGenMelody`, `rdSightStart`, `srCursor`, `view0`) | `src/domain/views-runtime.ts` |
| Typed contracts | `src/domain/views.ts` |
| Storage, including the `ptt-v3` backup payload (`isBackupPayload`) | `src/domain/storage.ts` |
| Strings | the `STRINGS` object in `src/locales/index.js` |
| Markup | `etude.html` |
| Test API | `window.__etude` |

Unit tests run with Vitest, which picks up `tests/**/*.test.mjs` (see `vitest.config.mjs`). Put Vitest tests there, for example `tests/sight-reading-*.test.mjs`, or widen the include on purpose. Playwright specs go in `tests/sight-reading-*.spec.mjs`.

## Acceptance Criteria

### Pure modules

- [ ] **AC1 — M1, model and fingerprint.**
  - `src/sight-reading/model.ts` implements the v1 schema rules of §5.2, ticks at 480 per quarter, plus `srtValidatePiece`, `srtToLegacyPiece` (a stable `eventId ↔ nid` mapping) and `srtBuildExpected`.
  - `src/sight-reading/fingerprint.ts` implements `srtCanonicalString` in the exact v1 format and a synchronous `srtFingerprint` (FNV-1a 64-bit over UTF-8, using BigInt).
  - Unit tests prove both reference vectors exactly: `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`.
  - Unit tests prove the fingerprint ignores seed, title, BPM, `event.id`, `finger` and `profileId`.
- [ ] **AC2 — M2, evaluator.** `src/sight-reading/evaluate.ts` implements `srtEvaluate` exactly as §5.4 defines it:
  - monotone dynamic-programming matching per MIDI pitch, with the stated tie-breaks;
  - a 250 ms window, narrowed to `min(250, 0.45 × minNeighborDeltaMs)` for close repeated notes;
  - inclusive limits at 100, 180 and 250 ms;
  - `restViolations`;
  - the stars rules and "Perfect";
  - `N = 0` → `status: 'invalid'`;
  - the full return object.

  Unit tests reproduce all 6 acceptance-vector rows from §5.4 exactly, plus: the boundary cases, a chord played in a different order, close repeated notes, rest violations blocking 3 stars, and a substitution counting as 1 FN + 1 FP.
- [ ] **AC3 — M5, generator.**
  - `src/sight-reading/generator.ts` implements `srtGenerate(profile, seed)` for profiles P1.a–P2.c (§5.6) and both hands.
  - It uses an internal Mulberry32 PRNG; `Math.random` must not be used.
  - It's deterministic: the same inputs give a deep-equal output.
  - A unit test checks every invariant for seeds 0–999 across all profiles and both hands, 12,000 runs in total, with every generated piece passing `srtValidatePiece`:
    - the final cadence in 4/4 and in 3/4;
    - no rest at tick 0;
    - no empty bar;
    - no duration crossing a barline;
    - range and leap limits;
    - the fingering rules.
  - Invalid profiles are rejected.
- [ ] **AC4 — flow.** `src/sight-reading/flow.ts` exports a pure `srtTransition(state, event)` that implements the §5.5 state diagram. Unit tests cover every legal transition, and show that illegal events are rejected or leave the state unchanged.

### Integration in the app

- [ ] **AC5 — M3, recorder.**
  - `onInputChange` carries `kind` (`on`/`off`), `midi`, `source` and `releaseKind`, as §5.3 describes.
  - `src/sight-reading/recorder.ts` records only inside `[-250 ms, T + 250 ms]`, and ignores keys held from before −250 ms until they are released.
  - It excludes `srClick`, `previewNote`, `srListen` and `srPlayGap`.
  - It doesn't count duplicate note-ons, and it handles `releaseFocusInput` and `panic`.
  - A Playwright spec covers each rule.
  - Existing input behaviour (MIDI, keyboard, on-screen keys, every other view) is unchanged.
- [ ] **AC6 — M4 and M7, assess mode.**
  - Assess mode uses `srtEvaluate`, behind a barrier at `T + 250 ms`.
  - While playing, only the cursor moves: no greedy colouring.
  - On `completed`, notes are coloured from the evaluation.
  - Results stay separate from `data.sheet[id].best`, and `SR.wrongExtra = res.FP`.
  - The first-attempt flow on a fresh generated piece follows §5.1 and §5.5:
    - claiming → a 20 s preview with a visible countdown, "Start now" and "Switch to practice" → count-in → playing → completed or pendingSave;
    - after that, the same piece is available for practice;
    - the attempt is invalidated by Listen, a refresh or a hidden page.
  - Playwright specs cover these flows, using fake timers or clock control where needed, not 20 s real waits.
- [ ] **AC7 — M6, ledger.** `src/sight-reading/ledger.ts` implements every listed operation on `localStorage['etude-sight-v1']`:
  - the two-lock protocol, with the attempt lock taken before a short ledger lock;
  - an atomic `claimExposure` across two tabs (two pages in one browser context);
  - `pendingSave` protection, and `recoverOrphanClaims` with `ifAvailable: true`;
  - the `stale_generation` and `owner_mismatch` rejections, and idempotency;
  - the 500 / 4096 limits;
  - when Web Locks are missing, practice works and the first attempt is disabled with an explanation.

  Playwright tests cover all of this, including two tabs claiming the same fingerprint, and a `resetLedger` in tab B followed by `stale_generation` in tab A.
- [ ] **AC8 — M8, backup.**
  - The `v:3` backup export includes the optional `sightLedger`.
  - Importing an old `v:3` backup without it still works exactly as before.
  - Import keeps the local generation and active claims, turns imported unfinished claims into `abandoned`, takes the union of exposures and attempts, and rejects a conflicting `attemptId`.
  - Tests cover each case, including the existing storage fixtures.
- [ ] **AC9 — M9, UI and accessibility.**
  - `#rd-verdict` shows: pitch F1 %, notes hit `TP/N`, extra attacks `FP`, rhythm accuracy %, `meanOffsetMs`, and a first-sight vs practice badge.
  - Notes carry non-colour symbols (✓ ≈ ✗ +) with a `<title>`.
  - `aria-live` announces only state changes.
  - The layout works at 320, 390, 1024 and 1920 px and in short landscape, and respects `prefers-reduced-motion`.
  - It survives a change of language, theme or size.
  - Every new user-visible string and accessible name exists in **all 7 languages** in `STRINGS`: en, ro, es, fr, de, it, pt-BR. The i18n tests stay green, with no duplicate keys.
  - Small text keeps 4.5:1 contrast.
- [ ] **AC10 — M10, offline.**
  - After the first load, the whole Sight-Reading v3 flow works offline: generation, fingerprint, evaluation and the ledger, all without `crypto.subtle`.
  - A Playwright test proves it under `context.setOffline(true)`, through the service worker (`@sw` project).

### Quality and regressions

- [ ] **AC11 — quality gates.** Every one of these passes:
  - `npm run typecheck` (the suppression checker plus strict `tsc`);
  - `npm run lint`;
  - `npm run test:unit`;
  - `npm run build`;
  - `npm run build:standalone`;
  - the full `npx playwright test`, with zero failures and no new skips.

  The new modules use no `any`, no `@ts-ignore`/`@ts-nocheck` and no `as` casts other than `as const`. No checker, tsconfig or eslint rule may be weakened.
- [ ] **AC12 — no regressions.**
  - Every test that existed at the start of this goal still exists and is not weakened: no removed assertions, no early `return`s, no `skip`.
  - The goldens (`tests/golden.spec.mjs` recordings and engraving) are unchanged.
  - The existing Read & Play behaviour (practice step-by-step, listen, current assess on repertoire pieces, `data.sheet` best scores) still works.
  - The app boots and visits every view with no uncaught errors.
  - The Inspector must also check the new flow by hand in a real browser: start a first attempt, play notes with the computer keyboard, see the summary, reload, and confirm the piece is no longer first-sight eligible.

## Scope Boundaries

**In scope:**
- M0–M10 from Part III §5.7, with behaviour exactly as specified in §5.1–§5.6 and the `srt:*` rows of Part V §5.1.
- Small, necessary changes to `views-runtime.ts`, `views.ts`, `storage.ts`, `etude.html`, `src/locales/index.js` and `scripts/build.mjs` (`SITE_FILES`, if a new served file is needed).

**Out of scope:**
- V2 (slicer, two-hands scoring), V3 (adaptive level, P3–P6), look-ahead.
- Arbitrary MusicXML in the new evaluation, 6/8, pedal, articulation.
- UI frameworks.
- Any refactor of unrelated code; any change to OSMD, the goldens or the deploy and service-worker strategy, beyond adding files to the precache if needed.
- Merging into `main`, pushing, creating tags or releases.

## Applicable Project Conventions

**Quality gate commands** (run from the worktree root):
- `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Playwright serves on port 8787 with `reuseExistingServer` outside CI. If another worktree already serves 8787, use a temporary untracked config that imports `./playwright.config.mjs` and overrides `use.baseURL` and `webServer` to a free port. Delete it afterwards. Never stop servers you didn't start.

**Commit convention:**
- Conventional commits, with a `[B]` or `[I]` marker, and a title of 72 characters or fewer.
- Include both trailers:
  - `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`
  - `Assisted-by: GPT:5.6-Luna` (Builder) or `Assisted-by: GPT:5.6-Sol` (Inspector)
- Commit locally on branch `feat/sight-reading-v3` only. Never push. Never commit `.DS_Store`, `node_modules` (it's a symlink here), `test-results/` or `dist/`.

**Guidelines:**
- `.github/copilot-instructions.md`, adjusted for the moved code (see the table under Refined Goal):
  - i18n in both en and ro, here extended to all 7 languages;
  - routing with `show()`, not `href="#..."`;
  - accessibility: inert modals, focus handling, 4.5:1 contrast;
  - regression tests go in the `tests/` style;
  - tests that need a service worker are tagged `@sw`;
  - the dock starts hidden, so use `app.open({ dock: true })` for on-screen keys.
- `docs/plans/2026-11-07-unified-migration-and-sight-reading-plan.md` Part III and Part V §5.1 are the specification.
- `docs/plans/2026-11-08-safe-migration-plan.md` §7: feature work stays separate from migration work.

**Rules:**
- No compiler bypasses. Never modify `scripts/check-ts-suppressions.mjs`, tsconfig strictness or `eslint.config.mjs` to make something pass.
- Preserve existing behaviour. When in doubt, compare with the `migration` branch, at the commit this goal started from.
