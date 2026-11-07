# German localization — INCOMPLETE, DO NOT INTEGRATE

`de.json` is a machine-readable work-in-progress, **not a finished locale or a preview**. It contains only German entries; missing entries are absent, not English fallback. No application runtime or existing locale is modified. Do not register `de` or serve this as a supported locale.

## Schema

```json
{
  "strings": { "existing_STRINGS_key": "German value" },
  "lessons": { "existing_lesson_id": { "t": "German title", "b": "German body HTML" } }
}
```

`strings` corresponds to the complete English `STRINGS.en` after all `Object.assign` additions. `lessons` is keyed by stable `LESSONS[].id`, with `t` and `b` matching the existing English/Romanian lesson schema. HTML tags and attributes in `b` must be byte-identical to the English source, including demo controls. The data alone cannot change the app's explicit English/Romanian language branches. Full integration requires separate handling for interval and chord names, scales, quizzes, glossary, song references, units, piece titles, other bilingual/direct strings, and language/notation independence; see `i18n-extra-notes.md`.

## Provenance and verification

- `source.json` was extracted from the actual current `etude.html` using `node i18n/de/verify.cjs --extract`; it is a reference inventory, not a translation. Keep it current when originals change.
- The initial 143 German strings came from the existing `i18n-extra.js`, without editing that file. `batch-01.json` holds 150 additional hand-translated strings, already merged into `de.json`. The `keys` lesson was translated for this work, preserving markup and noting that international B is German H, while German B is B-flat. No source or user data was sent to a translation service.
- `node i18n/de/verify.cjs` extracts the originals again and checks dictionary/lesson coverage, extra IDs, placeholders and exact tag/attribute sequence. It **must currently fail**, because translations are missing. Successful structural checks do not establish linguistic or musical correctness and do not cover all bilingual content.
- Native German musical review, B/H context and notation review, a complete inventory of non-dictionary content, and end-to-end integration/accessibility/offline tests remain necessary before shipping.
- `seed.cjs` records how the initial dictionary and lesson were seeded. It refuses to overwrite `de.json` and is not a build step; do not rerun it to update translations.
