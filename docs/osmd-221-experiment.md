# Experiment: OpenSheetMusicDisplay 2.2.1

Status: **experimental; not ready to merge**. A direct version replacement worsens Moonlight pagination. No fidelity improvement is claimed from the version upgrade alone.

## Method

Compared the unchanged `2e22760` application with the same file after replacing only the embedded OSMD 1.9.9 library with the npm `opensheetmusicdisplay@2.2.1` browser bundle. Both were served locally and imported the same five MXL files from the user's desktop. Each was examined in six modes: light and dark page, narrow page, zoom 75%, zoom 125%, and continuous.

The new bundle SHA-256 is `224ee5bee61d31ff3d07ade025f931a6cecd394cb54d2e39b1e7af2f0c7f1f5d`. The audited application file SHA-256 is `fd4d5dacc252fc4a1c5af58c744b1354adfb831224fa9e65d9057d29475d8abb` (working-tree bytes). The renderer identifies itself as 2.2.1 at runtime.

## Page counts

| Score | Source | 1.9.9 | 2.2.1 |
|---|---:|---:|---:|
| Bach — Toccata and Fugue | 8 | 10 | 10 |
| Dance of the Sugar Plum Fairy | 4 | 4 | 4 |
| Für Elise | 3 | 3 | 3 |
| Moonlight III | 12 | 14 | 17 |
| Mr. Grinch | 4 | 6 | 6 |

The ordered measure starts of all systems match across versions for all five scores, but some Moonlight systems move onto additional pages. Equal page counts do not prove visual identity. The source counts come from the existing score audit; actual rendered counts were independently remeasured for both versions on the same app base.

## Content and symbol checks

For 2.2.1, source note elements remain structurally unchanged; an independent duration/pitch oracle matches all 12,590 playable notes. In all 30 combinations, all expected playable notes have selection bindings with matching voice, part, staff, pitch and interval, and 736 visible rests have explanations. The automated geometry checks found no measured pedal collisions, owner/system escapes or clipping in their covered categories; this is not a pixel-by-pixel or comprehensive artistic engraving review. All five audit runs completed without page exceptions or console errors. The checked file hash matches the audited one.

## Automated tests

- 35 score-related baseline tests passed on 1.9.9; 36 passed on 2.2.1 including a new runtime-version test, which first failed on 1.9.9.
- Full suite: 191 passed, 1 failed. The French offline journey fails when a black key intercepts a test click on a white key. The identical failure was reproduced separately on an untouched checkout of `2e22760`, so it predates this experiment.

## Independent review

The reviewer confirmed the npm bundle byte-for-byte and the recorded pagination regression, and recommended against merging. The specific cause of the new page allocation has not been established. The bundle references a third-party license-notice file that is absent from the npm tarball and app; the actual bundled components and their required notices must be inventoried before distribution. This is an unresolved compliance question, not a conclusion that distribution is prohibited. The added version test does not itself test offline rendering or prevent pagination regressions. Potential duplicate cross-staff slurs are an additional compatibility risk, not a reproduced defect.

## Decision

Keep the upgrade on its isolated experiment branch. Do not merge it as a fidelity fix: Moonlight pagination regresses and the other four page counts are unchanged. A separate, tested layout solution would be needed before claiming improved fidelity. This experiment does not include an original-layout implementation or guarantee pixel-identical output.
