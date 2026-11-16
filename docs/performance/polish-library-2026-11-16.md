# UI/UX and code quality audit — 2026-11-16

Branch: `polish/ui-ux-quality`, based on `745917e` (`origin/main`). The repeat/playhead work in PR #24 is separate.

## Scope and findings

Inspected Today, Read, Pieces, Learn and Progress in local Chrome at phone size, and reviewed the score-library render, asynchronous actions, localization and filtering code. This is a targeted audit, not a claim that every application path is bug-free.

Fixed in this branch:

- **Keyboard focus:** rendering the library rebuilt active filter chips even when their labels and actions were unchanged. A search update or storage refresh could remove the focused button. Reuse the unchanged chip group, retaining keyboard focus and its clear-filter action.
- **Busy-state consistency:** search remains available during asynchronous actions. Filtering all rows out and then back in could create enabled selection checkboxes during an operation, despite `aria-busy=true`. Reapply the busy state to all newly rendered controls.
- **Touch and visual hierarchy:** replace the bare 18px selection target with a 44×44px associated label. Make Open/Resume the primary row action and use the existing danger color for destructive-action hover. Preserve existing labels, confirmations, theme tokens and keyboard focus outlines.
- **Render cost:** filter menus recreated all option nodes on every search input. Compare option values/labels first, and construct/replace nodes only when the available choices or their translations change.

## Before/after observation

Same local Chrome, development server, one synthetic MusicXML score, and 20 synchronous alternating `input` events (`a` / `audit`). A MutationObserver watched `childList` changes on composer, level and tag filter selects.

| Observation | Before | After |
| --- | ---: | ---: |
| Search events | 20 | 20 |
| Option-list replacement mutations | 60 | 0 |

This measures a specific DOM-work reduction, not startup, frame rate, physical input latency or Android performance. The observed single-run render times were too small and noisy to support a speed percentage. No dependency or storage-format changes were needed.

## Verification

Behavioral browser regressions cover preserved chip focus and activation, option identity, new-row busy state, recovery after the pending action, and touch-target dimensions. Existing library tests also cover import, organization, resume, backups, localization, narrow screens and offline reopening.

Validation passed: TypeScript and the strict compiler check, ESLint, locale generation verification, both localization tests, and all 570 unit tests. Full built-site E2E: 713 passed, 13 skipped by the existing configuration. Final full development E2E: 698 passed, 13 skipped. All 7 calibration browser tests also passed separately after the fixture correction. Physical phone/piano checks are not claimed by this audit.

The full development run exposed a calibration-test fixture race: its MutationObserver answered every class change while the pad retained `beat`, including removal of the running `on` class. That could inject a fake MIDI note after calibration had finished. Require the running class before scheduling synthetic input; keep the original held-note assertion. This is a test-boundary correction, not an audio runtime change.
