# Italian translation data — incomplete, not for integration

`it.json` is an **incomplete working seed**, not a supported language or preview. It contains the existing 143 Italian interface entries from `i18n-extra.js`, one newly translated lesson, and selected newly translated musical labels. It has no English fallback entries. Do not expose Italian in the application until all content is translated and reviewed.

## Data schema

- `metadata`: language, status and provenance.
- `strings`: English `STRINGS` key → Italian string. Keys not present are untranslated.
- `lessons`: original lesson ID → `{t, b}`, where `t` is the title and `b` is its HTML body. Tags and all attributes must match the original exactly. Keys not present are untranslated.
- `musicalLabels.intervals`: semitone count → localized interval name; `.scales`: original scale identifier → localized name; `.chords`: original chord symbol → localized name; `.inversions`: inversion index → localized name; `.patterns`: accompaniment pattern identifier → localized name. Keys are identifiers, not replacements for pitch or notation preferences.

Future integration must also localize all bilingual branches, glossary, song references, units, quizzes, other dynamic labels and content; merely merging `strings` will fall back to English and is not complete. Data structures here do not implement runtime switching, loading or offline support. Preserve users' independent note-notation preference. See `../../i18n-extra-notes.md`.

## Verification

- `node i18n/it/extract.cjs`: outputs actual current source English strings, lessons and selected musical inventories as JSON. It executes only source declarations in a Node VM; do not run against untrusted application source.
- `node i18n/it/validate.cjs --partial`: validates present entries, inventories, `%s`/`%a`/`%b` placeholders, and exact ordered HTML tags/attributes. It does not assert complete app coverage or linguistic correctness.
- `node i18n/it/validate.cjs`: same checks plus full dictionary and lesson coverage. Expected to fail until completed. Even when this passes, the other bilingual content listed above still requires translation and integration tests, including native Italian musical review.
- `node i18n/it/assemble.cjs`: regenerates the current seed from the existing partial Italian dictionary and the hand-authored material in that script. **It overwrites `it.json`;** once editing the JSON directly, stop running this script or transfer edits into it.

An attempted machine-translation batch was rejected: it changed placeholder tokens and produced musically incorrect translations. It is not included in `it.json`. Only public application source was sent to the service; no user data was sent.
