# Translation inventory and release checks

These tools do not supply translations, add languages to the application, or modify the app. They are a **partial release gate**, not proof the application is fully localized. Node.js and Python 3 are required; browser tests additionally use the repository's Playwright dependency and an installed browser.

## Canonical locale payload contract

Generate the live English reference from the exact HTML revision being translated:

```sh
python i18n-framework/validator.py --inventory > english-reference.json
python i18n-framework/validator.py --audit
python i18n-framework/validator.py path/to/fr.json
python -m unittest discover -s i18n-framework -p 'test_*.py' -v
```

Each locale payload is a UTF-8 JSON **object with exactly the same shape and keys** as the reference, with these top-level fields:

* `strings`: dictionary keys to translated strings; includes all English base and supplemental assignments, not just static attributes.
* `lessons`: lesson ID to `{ "t": title, "b": HTML }`; all 22 current lessons. Preserve exact tag nesting and every functional attribute, including `data-demo`, `data-staff`, `data-widget`, `data-go`, `data-cat`, `href`, and classes. Human-readable text, and the values of `title`, `aria-label`, `alt`, and `placeholder`, may be translated.
* `units`: unit ID to its title.
* `glossary`: source zero-based index (as a string) to `{ "term": ..., "definition": ... }`; rebuild whenever source ordering changes.
* `quizzes`: lesson ID to an array in source order; each entry has `q`, and where present `o` (array in source order) and `why`. Only text is represented; quiz pitch/answer logic stays in the app and must not be altered. Answer order is significant.
* `summaries`: lesson ID to rows of `[label, value]` in source order. An empty source label may remain empty.
* `music`: `intervals` by semitone string, `scales` by original scale name, `chords` and `feels` by chord symbol, `categories` by category ID, `inversions` by zero-based index string, and `songs` by semitone then `asc`/`desc` arrays in source order. These are display texts only; never alter internal pitch, symbol, key, or playback identities.

Names and array lengths are exact, and unknown, missing, duplicate JSON keys, non-string values, blank nonempty-source values, mismatched `%s`, `%a`, `%b` counts, and altered HTML structure or functional attributes are errors. The validator exits 0 on success, 1 for mismatches, and 2 on parse/extraction failure. Unlike a fallback-based lookup, a missing value cannot pass. Identical English and target text can be legitimate (e.g. proper names and symbols), so this tool does **not** assert that a present string was actually translated or is linguistically/musically correct. Native-language review remains necessary.

This is a **proposed interchange/test contract**, not the existing runtime schema. In-progress files under `i18n/<locale>` use different schemas and may include metadata, so they need explicit, lossless conversion into this shape before validation. Do not count copied English source text as completed translation. `pt-BR` is the exact Brazilian Portuguese locale identifier. The app integrator must explicitly wire the validated sections to the existing renderers; neither this contract nor these tools makes that happen. Regenerate the reference for every source change; glossary and quiz indices are positional and must not be reused blindly after reordering.

## Browser integration checks

`runtime.spec.cjs` loads the actual `etude.html` by `file://` with HTTP(S) requests aborted, tests English/Romanian persistence and notation independence, and provides five opt-in locale checks. Each locale check first runs strict validation, then compares all runtime dictionary values, lesson title/body, interval/scale/chord/category/inversion/feel/song labels, verifies notation remains selected across language changes, and reloads. The default run skips the five new-locale checks because these payloads are not complete; **a run with skips is not a release pass**.

```sh
# On machines with Microsoft Edge instead of Chrome:
PW_CHANNEL=msedge npx playwright test --config i18n-framework/playwright.config.cjs
# Release gate: directory must contain es.json, fr.json, de.json, it.json, pt-BR.json
ETUDE_LOCALE_PAYLOAD_DIR=/absolute/path/to/payloads PW_CHANNEL=msedge npx playwright test --config i18n-framework/playwright.config.cjs
```

The browser assertions use current app function names, so intentional refactors require updating the tests too. This suite does not yet test every rendered view, accessibility attribute, quiz, glossary, interpolation result, service-worker cache install/update, mobile overflow, or all notation modes. Add those tests against the integrated app before shipping. In particular, file-mode without network is **not** the same as service-worker offline installation and update.

## Inventory boundaries

The current extractor finds 1,354 English strings, 22 chapters, 8 units, 55 glossary entries and 22 quiz/summary groups, plus seven music-label maps. It extracts only `q`, `o`, and `why` text from quiz records. It does not yet inventory every direct `lang === 'ro'` branch, standalone English string, piece title, accompaniment pattern, number/date formatting, or dynamic expression. The best-effort `--audit` scans literal `t()`/`tl()` and `data-i18n*` references; its dynamic-call count includes lexical false positives and is **not** a complete inventory. It is not a JavaScript parser. Source extraction executes selected JavaScript expressions in a Node VM; use only trusted repository HTML. Counts are observations of the source at writing time, not fixed assertions.
