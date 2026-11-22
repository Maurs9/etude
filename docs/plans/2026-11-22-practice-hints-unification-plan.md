# Practice Hints Unification & Redesign Plan

Unify all six topic hint panels inside Practice (`#pr-songs`) around a shared compact editorial card system while preserving each topic's musical diagrams, deep-study drawers, and listen-first pedagogy.

## Scope & Architecture

- **Pure hint logic (`src/domain/practice-hints.ts`):**
  - Provide single-item playback sequences (`chordSingleSteps`, `scaleSingleSteps`) separate from explicit A/B comparison sequences (`chordHintSteps`, `scaleHintSteps`).
  - Preserve transposed voicings, resolution voices, melody listen-first phrases, and one-octave technique fingerings.
- **Diagrams (`src/domain/hint-keyboard.ts`, `src/domain/chord-hint-diagrams.ts`):**
  - Keep compact inline keyboards (`58px` white key height) with legible finger numbers (`1–5`).
  - Set `followWithoutDock: true` on chord hint diagrams so Chords animate inline in ear/keys modes without forcing the bottom dock open.
  - Keep both treble and bass staves on compact Chord cards, remove duplicate chord-title/octave clutter from the caption, and expose a live comparison indicator (`A → B`) shown only during A/B comparisons.
- **DOM controls & unified cards (`src/domain/practice-hint-dom.ts`, `src/domain/practice-hints-view.ts`, `src/domain/views-runtime.ts`):**
  - Replace bulky "Listen" text buttons with a compact `44×44` Play/Stop icon button (`.pr-hint-play`) placed consistently in every card header (and inline per hand header on Technique). Clicking while active stops playback.
  - Expose A/B comparison on Chords and Scales as a dedicated secondary button (`⇄ <Other>`) rather than surprising users on Play.
  - Remove redundant `Show keys` from Chords and Scales (which have inline keyboards); keep `Show keys` only on Progressions in `audioOnly` mode.
  - Show a concise transposition context strip (`.pr-hints-context`) at the top of `#practiceHintsList`.
  - Align Intervals (`.pr-interval-card` inside `#songsList`) to the same card shell, header badge, compact `44×44` Play/Stop icon button, and song active highlight without adding a mini-keyboard.
- **Styles (`src/styles/practice.css`, `src/styles/etude.css`) & Localization (`src/locales/index.js`):**
  - Use Étude's parchment/claret/ink tokens, `.pr-hint-stage` subtle surfaces, `44×44` touch targets, `min-width: 0` overflow protection across `390px`–`1440px`, light/dark theme contrast, and `prefers-reduced-motion`.
  - Add localized keys across all 7 languages (`en`, `ro`, `es`, `fr`, `de`, `it`, `pt-BR`) and regenerate split payloads via `node scripts/split-locales.mjs`.

## Verification

- Unit tests: `tests/unit/practice-hints.test.mjs`, `tests/unit/locales.test.mjs`
- E2E tests: `tests/e2e/practice-hints.spec.mjs`, `tests/e2e/scale-hints.spec.mjs`, `tests/e2e/practice-moved.spec.mjs`, `tests/e2e/melody-hints.spec.mjs`, `tests/e2e/progression-hints.spec.mjs`, `tests/e2e/technique-hints.spec.mjs`, `tests/e2e/practice-study-hints.spec.mjs`
- Live rendered inspection across all 6 topics in desktop (`1440×900` dark/light) and mobile (`390×844`) viewports with `scrollWidth <= clientWidth` verification.
- Full CI validation: `npm run typecheck`, strict `tsc`, `npm run lint`, `npm run test:unit`, `npm run test:i18n`, `npm run build`, `npm test`.
