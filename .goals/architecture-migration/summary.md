# Architecture migration: summary

## Result

The app runs on the new Vite and strict TypeScript architecture from `docs/plans/2026-11-08-safe-migration-plan.md`. All quality gates pass:

- `npm run typecheck`: the suppression checker reports 0 explicit `any`, and `tsc --noEmit` passes under strict settings. Neither the checker nor the strictness settings were weakened.
- `npm run lint`: clean.
- `npm run test:unit`: 32/32.
- `npx playwright test`: 210/210, including the deploy and service-worker (`@sw`) tests.
- `npm run build` and `npm run build:standalone`: both succeed.
- The golden baselines (recordings and engraving) are unchanged.

## How the blocker was resolved

Iterations 1–8 stalled on `src/domain/views-runtime.ts`, which had about 4,000 tsc errors. Each time, the Builders tried bypasses and the Inspector rejected them. The final approach was:

1. Applied the TypeScript `inferFromUsage` code fix.
2. Replaced the unchecked `$()` lookups with the helpers in `src/domain/dom.ts`. Each lookup either verifies the element's type or returns `null`.
3. Typed the file in 10 parallel ranges, then reconciled them into a single set of shared types.
4. Converted locale content to `src/locales/content.ts`, typed with `content-types.ts`. This removed the last casts in the view runtime.

## Regressions caught and fixed

- `anCoach` passed the wrong argument to `anFnKey`; it now passes the chord root, as the original did. A regression test is in `tests/domain-boundaries.test.mjs`.
- `wiringSegment` called itself (stack overflow in segmented controls), and 6 Playwright tests caught it. It now iterates `currentTarget.children` again.

## Recommendations

- Remove the obsolete `scripts/extract-locale-modules.mjs`, which still writes `content.js`.
- Consider removing the remaining casts in `views.ts`, `router.ts`, `storage.ts`, `theory.ts` and `notation.ts`.
- Merge Step 2a (PR #5) before `migration`, then open the `migration` PR against `main`.
