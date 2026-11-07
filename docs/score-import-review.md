# Score import fidelity review

## Reproduced input

The supplied `fur-elise-beethoven.mxl` and original/imported screenshots were compared against the actual import pipeline and embedded OpenSheetMusicDisplay 1.9.9. The original file is retained as a regression fixture.

## Findings and changes

- **Rest explanations were absent:** rests were rendered, but `scoreSyms()` never registered them. Visible rest glyphs now support pointer hover and keyboard focus in English and Romanian, including dotted and whole-measure rests. Hidden rests are excluded. Rests are not added to playable-note/chord-analysis data.
- **Oversized engraving and excess pagination:** imported page geometry was replaced with A4 and a fixed staff scale. Valid source page size, staff scale, margins and staff/system distances now feed the engraver. Skyline collision clearance remains enabled but no longer adds oversized default gaps to explicit source spacing. This file retains its original three pages and eighteen systems, rather than six pages.
- **Runaway second ending:** measure 9 starts ending 2 but the export omits its end before the forward repeat in measure 10. Only demonstrably unclosed endings are discontinued before a new repeated section. Explicit endings, including multi-measure endings crossing a repeat boundary, are preserved.
- **Flattened header:** equivalent printed composer credits retain line structure; the title/subtitle retain explicit printed sizes, and the title retains its mixed italic/normal runs. SVG styling uses allowlisted attributes and text nodes, not imported markup.
- **Existing hover-test false failures:** tests now scroll markings into view before calculating raw pointer coordinates; clipped pedal marks otherwise yielded empty hover text even on the baseline.

## Verification

- Full Playwright suite: **120 passed** using bundled Chromium against this worktree's own server.
- New regression cases cover EN/RO rest explanations and source layout/header/ending behavior, including implicit and explicit right barlines with backward repeats.
- Actual source: **106 measures, 901 playable notes and 202 visible rests**. Pitch, onset, end, staff and voice data match the original parsed MusicXML exactly.
- Page/continuous/page transitions retain all 901 note bindings and 202 rest explanations. Narrow viewport retains three source-aligned pages. Night-look re-layout retains header styling and rest explanations. No uncaught page errors in the source-file verification.
- Embedded scripts pass `node --check`; `git diff --check` and the added-line security scan pass.
- Independent diff-only review passed after correcting the implicit-right-barline case; no blocking logic or security findings remained.

## Remaining engraving differences

The result is closer to the exported score, not a pixel-identical facsimile. OSMD still chooses detailed note spacing, glyph outlines and collision placement. Per-system indentation and exact proportional MusicXML measure widths are not yet reproduced. The original structured notation remains intact; MIDI reconstruction limitations are unchanged.
