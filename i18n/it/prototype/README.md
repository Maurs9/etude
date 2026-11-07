# Italian translation experiment — not for integration

This sample is **not a complete locale**. It contains 14 previously missing dictionary strings and one previously missing lesson (title and body); all other entries remain absent. No runtime or language selector was changed. Do not enable Italian or any other incomplete language.

## Provenance and privacy

Translation author: **gpt-6.1-terra via OpenAI-Codex, through Hermes Agent**. This is model-authored, not a native-speaker translation or a benchmark of a separate public translation service. No separate translator was invoked. Only public application-source passages were used as translation content; no application user data was exported. Local checks run with Node and send no data to a translation service.

## Run the check

From the repository root:

```sh
node i18n/it/prototype/prototype.cjs --check
```

On this source snapshot: 14 missing strings and 1 missing lesson pass parity; the lesson has 48 ordered HTML tags/attributes, one entity and 27 nonblank text nodes. Negative checks reject a changed `%c`, a modified `data-demo` attribute and a lost `&amp;`. The script can create the JSON once with `--build`; it refuses to overwrite an existing output. It relies on the existing `extract.cjs`, which executes extracted application declarations in a Node VM; do not use against untrusted source.

The 27 lesson text nodes were translated independently in a hand-authored source/target table. The script copies existing markup and whitespace-only fragments, checks each source node before substitution, and compares ordered tag/attribute strings, entities and the placeholder multiset. It recognizes `%c` as well as `%a`, `%b` and `%s`; the existing Italian seed validator only checks `%s`, `%a`, `%b`. Duplicated `%s` tokens need a separate semantic/order review: multiset parity cannot tell two instances apart. A regular expression is used for this controlled HTML sample, not a general-purpose HTML parser; it can misparse complex attributes or malformed HTML. There is no validation of translatable attribute text, injected literal ampersands, rendered layout, accessibility, runtime interpolation, or correctness of other content. Full-app production tooling needs structured parsing, token IDs, contextual checks and browser tests.

## Sample linguistic and music review

The model spot-checked these examples against their English source, not as an independent native speaker:

- `root_pos`: “root position” → “stato fondamentale”, retaining the bass note placeholder.
- `cn_cad_plagal`: “plagal cadence” → “cadenza plagale”, retaining the move from subdominant to tonic. Treccani discusses the plagal cadence's subdominant basis: https://www.treccani.it/enciclopedia/cadenza_%28Enciclopedia-Italiana%29/
- Lesson `iv`: “perfect fourth” → “quarta giusta”, and “tritone” → “tritono”; the source's five- and six-semitone labels and `data-demo` attributes are retained. Jazzitalia describes those interval terms and sizes: https://win.jazzitalia.net/lezioni/eartraining/et_lezione4.asp

**Source-quality issue:** the original lesson classifies fourths unconditionally as stable/consonant, which this faithful prototype repeats. In traditional tonal contexts a perfect fourth above the bass can be treated as dissonant; classification depends on context. This needs editorial/music review, not an unannounced change in only one translation: https://viva.pressbooks.pub/openmusictheory/chapter/species-counterpoint/

These spot checks do not establish overall translation quality. In particular, literal `C` in the source lesson remains `C`; compatibility with the user's independent note-notation preference needs a designed runtime solution, not a hard-coded translated assumption. The original song example, shortened button labels, fragments split by markup, dynamic arguments, pluralization, and inherited theory simplifications need native-speaking musician/editor review in context.

## Feasibility

Batching source-only strings with immutable tagged placeholders, a domain glossary, automated round-trip checks and native-musician review could speed up work. This hand-authored sample establishes neither throughput nor a failure rate for an automated provider. A complete inventory must also cover dynamic/bilingual material outside the current extractor, not just dictionary keys and lessons. The seed audit reports 143/1,354 strings and 1/22 lessons; all five languages need full coverage, linguistic review and integration tests before any is enabled.
