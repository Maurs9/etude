# Additional languages: partial work, not ready to ship

`i18n-extra.js` contains hand-authored Spanish (`es`), French (`fr`), German (`de`), Italian (`it`), and Brazilian Portuguese (`pt-BR`) translations of **143** dictionary keys each. Against the current English inventory of 1,354 keys, **1,211 keys per language remain untranslated**. Of the 447 distinct keys used by `data-i18n`, `data-i18n-aria`, or `data-i18n-title`, 141 are covered. The remainder includes dynamic strings as well as static labels. Coverage is not evidence of translation quality; native-speaker review is still needed. No user content or translation data was sent to a network service.

**Do not offer these locales as fully localized.** The dictionaries are intentionally sparse: the existing `t()` function falls back to English for absent keys. The Learn handbook and other content are not covered by the 1,354-key count and also need translation.

## Architecture notes

The migration build no longer publishes a hand-maintained `SITE_FILES` list:
Vite follows static imports and `public/`, and the generated worker hashes the
final output. English/Romanian strings and lesson content now live in
`src/locales/` and are synchronously imported; `i18n-extra.js` remains a
legacy data source for the optional five-language preview until it is migrated
or retired.

- English and Romanian are stored in `STRINGS`, with more `Object.assign(STRINGS.en/ro, ...)` blocks throughout the application. Static elements use the three data attributes above; dynamically generated content commonly uses `t()` or `tl()`, including interpolations `%s`, `%a`, `%b`.
- In addition, code has explicit `lang === 'ro'` branches. These include interval, chord, scale, inversion and category names; song references; lesson content; glossary; piece titles; list formatting; and number/date formats. See `ivName`, `scaleDisp`, `chordDisp`, `catLabel`, `invName`, `feelDisp`, `songsFor`, `LT`, `learnTitle`, `learnBodyHTML`, `lgHTML`, `srPieceTitle`, `coachList`, `anNum`, and the export code. Adding dictionary keys alone does not localize these.
- `LESSONS` contains 22 hand-authored bilingual chapters (HTML with functional `data-demo` controls). Preserve markup, demo attributes, terminology and the underlying musical meanings in each translation. `LEARN_UNITS`, quizzes/widgets, `GLOSS`, titles, accompaniment patterns and other bilingual arrays also need locale-aware data and rendering. Review direct English strings outside `STRINGS`, too.
- Language and note notation are separate preferences. Do not silently change notation when language changes. Correctly localize terminology without changing internal pitch identities.
- Current language restoration checks `STRINGS[raw.lang]`, so locale dictionaries must exist before preferences are loaded. `setLang` refreshes several views, but active drills, lessons, score views, aria labels, generated content and dialogs must be tested separately. Use `pt-BR` consistently for data, button value, `Intl` and document language.

## Integration, only after completion or explicit acceptance of a partial preview

1. The supported dictionaries and educational content are static modules under `src/locales/`; import them synchronously before `setLang()` and `applyI18n()`. Do not reintroduce a runtime script or asynchronous locale loading.
2. The optional five-language preview still uses the extracted legacy payload, with the exact codes `es`, `fr`, `de`, `it`, and `pt-BR` and appropriate native labels.
3. Complete the translation and dynamic-data work described above before presenting a locale as supported. Avoid treating fallback English as translated text. Ensure every `%s`, `%a`, and `%b` remains present in each corresponding string; preserve HTML when the original is interpreted as HTML.
4. Vite follows `src/locales/` imports and the build generates the worker manifest from the final published directory, so supported locale data is automatically hash-checked and atomically precached. Do not maintain a hand-written `SITE_FILES`, `ASSETS` list, or cache version. `src/domain/views.ts` is the TypeScript view entry point and browser test/import surface; `npm run typecheck` rejects file-wide `@ts-nocheck`, while legacy DOM compatibility remains line-scoped until those boundaries are simplified. Lazy OSMD failures use bilingual reload guidance.
5. Expand coverage tests to fail on *any* missing translation and exercise language persistence, switching, accessibility attributes, Learn chapters, dynamic labels, interpolation, offline reload and independent notation. Check long text and controls at mobile widths. Review translations with native speakers.

Current standalone verification: `node --test i18n-tests/i18n-extra.test.cjs`. The test is outside `tests/` so Playwright does not discover it. It verifies the five sparse dictionaries, known keys, nonempty strings, placeholders, and browser-global loading. It deliberately does **not** assert full localization.
