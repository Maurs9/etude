# Read tab redesign: spec

Status: built on the branch `feat/read-redesign`, not merged. Open: your approval of the pieces by ear, and decisions D1 to D6 (section 14). Section 16 lists what was built differently from the proposal. Section 17 is the practice flow as it is now: where it differs from an earlier section, section 17 is right.
Mockup: [2026-11-13-read-redesign-mockup.html](2026-11-13-read-redesign-mockup.html) (open it in a browser).

## 1. Goal

The Read tab teaches one skill: playing music at first sight, in time, without stopping.
Skilled readers work from shapes and patterns, so the tab trains patterns. Note naming is a supporting drill, not the main activity.

The page offers three things, in this order:

1. **Today**: one button starts a fresh set of 5 generated pieces at your level, in mixed keys.
2. **The book**: one numbered, progressive book per level. Keys are mixed inside the level. A key focus lets you pin one key when you want it.
3. **Warm-up**: one button starts a 2-minute warm-up that the app builds for your level. The full drill catalogue stays one tap away.

## 2. What is true today (checked on `main`)

- The Read tab has two sub-tabs, "Drills" and "Sight-reading" (`etude.html:157`).
- Drills hold 10 units with 66 levels in one ladder: Treble 11, Bass 11, Grand staff 6, Accidentals 5, Key signatures 5, Intervals 4, Chords 4, Rhythm 5, C clefs 3, Sight-reading 12 (`views-runtime.ts:8210-8300`).
- The Sight-reading sub-tab has no level selector. The level comes from the "Sight-reading" unit in the drills ladder (`rdOpen` → `rdSightStart`).
- The generator makes 4-bar pieces from 13 profiles (`src/sight-reading/model.ts`, `generator.ts`). The single-line profiles (P1, P2, P4) are fixed to C major (`generator.ts:297`). Only the block-chord profiles (P3) pick a key, at random.
- The `lo`, `hi`, `keys` and `bpm` fields on the 12 sight-reading levels are display text. The profile id decides the output.
- The home screen shows 6 option toggles, a 66-button ladder, a custom-drill form with 7 controls, and a challenge menu per level.
- First-sight tracking works and must be kept: fingerprints, the ledger (`etude-sight-v1`), a 20-second preview, one assessed attempt, and scoring in `evaluate.ts`.
- Input is MIDI, BLE-MIDI, computer keys and on-screen keys. There is no microphone input for reading.

## 3. Page structure

One page, no sub-tabs.

| Zone | Content | Choices the user makes |
|---|---|---|
| Today | "Start today's set" button, the 5 pieces as chips, the level in use | none |
| The book | Level picker (1 to 8), key row ("Mixed" or one pinned key), units of numbered exercises, Continue button | level, and a key only when wanted |
| Warm-up | "Start warm-up" button, "All drills" link | none |
| Progress | streak, first-sight accuracy, suggested next step | none |

The level is the one required choice. The key row stays on "Mixed" unless the user pins a key.
Today and Warm-up follow the level and the key row.
Nothing is locked. The app suggests the next step and the user decides.

Everything else moves into one "Options" sheet: sound, hints, note names, any octave, step-by-step mode, immersive stage, auto-next, stream display, pacer, weak-note injection.

## 4. Levels and patterns

Eight levels. Each level adds one difficulty and one or two patterns, and keeps the rest. The last column is the nearest exam grade, for orientation only.

| Level | Name | Hands | Range and motion | Rhythm added | Meter | Bars | Near |
|---|---|---|---|---|---|---|---|
| 1 | Steps | one hand at a time (the hands take the 4-bar phrases in turn) | five-finger position, steps and repeats | whole, half, quarter | 4/4 | 8 | pre-Initial |
| 2 | Skips | one hand at a time | adds thirds | dotted half, quarter rest | 4/4, 3/4 | 8 | ABRSM Initial |
| 3 | Fifths and eighths | hands alternate inside the phrase | leaps up to a fifth | eighth-note pairs, half rest | adds 2/4 | 8 | Initial to Grade 1 |
| 4 | Together, one moves | together: one hand moves, the other holds | five-finger position | ties | same | 8 or 12 | Grade 2 |
| 5 | Together, both move | parallel and contrary motion | one extension to a sixth | dotted quarter plus eighth | same | 12 | Grade 2 |
| 6 | Out of position | melody plus held roots or 2-note chords | an octave, one position shift per hand | simple sixteenths | adds 3/8 | 12 | Grade 3 |
| 7 | Chromatic and compound | melody plus broken-chord accompaniment | chromatic neighbour notes, upbeat start | all earlier values | adds 6/8 | 16 | Grade 4 |
| 8 | Chords and syncopation | 2-note chords in either hand | octave and more | syncopation, ties from a weak beat | same | 16 | Grade 5 |

Pieces are assembled from named patterns. A pattern is a shape the eye can take in as one unit.

| Level | New patterns |
|---|---|
| 1 | step run, repeated note, neighbour figure (step away and back), long notes (a bar of half notes or longer) |
| 2 | skip |
| 3 | broken triad, leap of a fifth, eighth-note run, sequence (a pattern repeated one step higher or lower) |
| 4 | held note under a moving hand, tie |
| 5 | parallel motion, contrary motion, dotted figure |
| 6 | scale run of seven notes or more (the hand changes position inside it), 2-note chord, sixteenth run |
| 7 | chromatic neighbour, broken-chord left hand, upbeat |
| 8 | syncopated figure, 2-note chords in both hands |

The existing 13 profiles stay in the generator unchanged, so stored fingerprints stay valid.
Their content is covered by the new levels: P1 → levels 1 and 2, P2 → levels 2 and 3, P4 → levels 3, 5 and 8. The P3 block-chord pieces become the "Chords at sight" warm-up item.

### Limits as built (step 1, `src/sight-reading/levels.ts`)

- **Hand positions.** The right-hand tonic lies from C4 to B4. The left-hand tonic lies from F2 to E3. The hands are one octave apart in the keys of C to E and two octaves apart in the keys of F to B.
- **Range in scale degrees from the tonic (0):** levels 1 to 4 use 0 to 4, level 5 uses 0 to 5, level 6 uses 0 to 7, level 7 uses -1 to 7, level 8 uses -2 to 9.
- **Largest leap:** a second at level 1, a third at level 2, a fifth at levels 3 to 5, a sixth at level 6, an octave at levels 7 and 8.
- **Rests:** quarter from level 2, half from level 3, eighth from level 5. 3/8 and 6/8 also have the dotted-quarter rest. A whole-bar rest is used only where a hand waits: levels 1 to 3, and the upbeat bar.
- **Rest placement:** a rest shorter than a beat stays inside its beat. A longer rest starts on a multiple of its own length.
- **Ties:** a note may be tied over the barline from level 4. Each written part must be a note value of the level.
- **Hands:** at levels 1 and 2 either hand may start, and the hands change at each 4-bar phrase. At level 3 one hand plays at a time, a hand plays in every bar, and the hands change at least twice. At level 4 both hands play in every bar and one of them only holds notes of a half or longer. From level 5 both hands play in every bar.
- **Syncopation (level 8 only)** is any of these: a note that starts off the beat and is held past the next beat. In 4/4, a note on beat 2 or 4 that lasts longer than a beat. A note tied over the barline from a weak beat. In 3/8 and 6/8, a note from the beat that ends inside a later beat.
- **Upbeat (levels 7 and 8):** written as a first bar in which both hands start with a rest. One hand may wait for that whole bar.
- **Accidentals:** none up to level 5. The raised leading note of a minor key from level 6, when the next note of that hand is the tonic above it. Anywhere else it counts as a chromatic note. Up to 2 chromatic notes at level 7 and 3 at level 8. No double accidentals, so G♯ minor has no raised leading note (F double-sharp). This is open decision D6.
- **Notes at once:** one per hand up to level 5, two in the left hand at levels 6 and 7, two in each hand at level 8.
- **Tempo:** 66, 66, 72, 63, 66, 66, 60 and 72 bpm for levels 1 to 8.
- **Left for step 3 (two hands and playability):** no check yet that the hands do not cross, that a chord fits under the hand, or that level 5 leaves the five-finger position only once.

## 5. Keys

Keys are mixed inside a level. A new key first gets a short block of its own, so the hand learns where the black keys sit.

The pool of keys in the default mix grows with the level, the way the exam syllabuses widen it:

| Levels | Keys in the mix |
|---|---|
| 1 and 2 | C, G, F, A minor, D minor |
| 3 and 4 | adds D, B♭, E minor, G minor |
| 5 and 6 | adds A, E♭, B minor, C minor |
| 7 | adds E, A♭, F♯ minor, F minor |
| 8 | all 24 keys |

- **Key focus.** Any of the 24 keys can be pinned at any level. The book then shows a numbered run of 20 pieces in that key, and Today uses that key.
- Minor keys use the raised 7th only as a leading tone at the cadence. Levels 1 to 3 stay inside degrees 1 to 5, so they need no accidental.
- The key is part of the seed. Two pieces in different keys are different pieces, not transpositions. The one exception is the "same shape, new key" pair in section 7.
- In a mix, the page does not name the key of a piece before it is played. Reading the signature is part of the task. The result card names it.

## 6. Generator rules

Each rule has an automatic check. The unit tests build 11,520 pieces (60 seeds × 24 keys × 8 levels) and run every check on each piece. Each check is also tested on hand-written pieces that break its rule.

| Rule | Statement | Check passes when |
|---|---|---|
| G1 Deterministic | The same level, key and number always give the same piece. | Two runs give equal fingerprints. |
| G2 Level limits | Range, largest interval, note values, meter, bar count and hand use match the level table. | `srtLevelViolations` returns no violation for every piece. |
| G3 Chord plan | Every bar has a chord from the level's progressions. The piece ends V to I. | The plan is stored on the piece and the last two chords are V and I. |
| G4 Strong beats | Notes on strong beats are chord notes. On the second strong beat of a bar, a passing note inside a run by step is allowed. At level 1 only the first beat counts, because that level moves by step. An altered note is not a chord note, except the raised seventh of a minor key. | Every strong-beat note is checked against the chord of its half of the bar. |
| G5 Step bias | At least 60% of melodic moves are steps or repeats. | Counted per piece. |
| G6 Leap recovery | A leap of a fifth or more is followed by a step in the opposite direction. | No violation in any piece. |
| G7 One high point | From level 4 up, the highest note appears once, after the first bar. | Counted per piece. |
| G8 Start and end | The melody starts on degree 1, 3 or 5. It ends on the tonic, approached by step. The last note is a half note or longer, or the whole bar when the bar is shorter. From level 4 the bass ends on the tonic too. | Checked on the first and last events. |
| G9 Phrase form | A piece of 4 or 6 bars has two phrases. A longer piece has phrases of 4 bars. Every phrase but the last ends on degree 2, 5 or 7 (2 or 5 in a minor key). Every later phrase starts with the rhythm of the first full bar. | Checked on phrase boundaries. |
| G10 Rhythm economy | Before the final bar the melody uses at most 2 different bar rhythms in 4 bars, 3 in 6 or 8 bars, and 4 in 12 bars. An upbeat bar is not counted. | Counted per piece. |
| G11 Two hands | The second hand is derived from the melody and the chord plan. On strong beats the bass and the melody form a third, fifth, sixth, octave or tenth. The hands never cross, and never play the same note with two different accidentals at once. At level 4 only one hand moves at a time. | No violation in any piece. |
| G12 Playability | A hand covers a fifth without moving, and a sixth from level 5. It may move after a rest, after a note of a quarter or longer, at a barline after an eighth, or between two notes a step apart (thumb under). The right hand moves at most 1, 2 and 3 times per four bars at levels 6, 7 and 8. The left hand moves at most twice per four bars at level 6, then once per bar. A chord is no wider than a sixth. | A fingering pass finds the fewest moves for every hand. |
| G13 Spelling | Notes follow the key signature. Accidentals appear only where the level allows them. No double accidentals. | Every pitch is spelled from the key, and the accidental count is within the limit. |
| G14 Difficulty band | A score from leaps, direction changes, rhythm variety, shifts and accidentals falls in the level's band. Inside a unit the pieces rise from the lower to the upper part of the band. | The score is inside the band for every accepted piece. |
| G15 Uniqueness | All numbered pieces of a level are different. The five pieces of a day are different from each other and from every piece the reader has seen. Up to level 3 they also differ from every book piece. Above level 3 the number of possible pieces makes a chance repeat negligible. | Fingerprints are compared when the set is drawn. |
| G16 Patterns | Every bar shows at least one pattern of the level's list or of earlier levels. Each piece shows a new pattern of its level at least once. The piece stores the pattern names of each bar. | The recognisers, run on the notes, give exactly the stored names. Each recogniser is tested on hand-written bars. |

One check cannot be automated: whether the pieces sound like music.
Manual gate, still open: you play or listen to pieces of each level and approve them. The Read page itself serves as the sample sheet.

Notes on the evidence behind the rules:

- A study by von Hippel and Huron argues that "a leap turns back" mostly reflects range limits. The generator therefore also keeps the melody near the middle of its range, and G6 applies only to large leaps.
- I found no published rule set for chord plans or rhythm reuse in sight-reading material. G3, G9 and G10 are standard composition practice, not cited findings.

## 7. Book and daily set

**The book, one per level**

- 96 numbered pieces per level, in 12 units of 8. The total is 768 pieces, generated, never stored as data.
- A number always opens the same piece. The book pins the generator version, so a later generator change does not renumber it.
- A unit is one of three kinds:
  - **New key**: 8 pieces in a key that is new at this level.
  - **Mix**: 8 pieces across the keys met so far. It starts with the keys that are new since the last mix, then takes the keys that have waited longest. Every key of the pool comes up in the book.
  - **Level check**: the last unit, a mix across the whole pool of the level.
- Unit order: a level that follows another level opens with a mix in the three easiest keys, so the new patterns are met in familiar keys. Then each new key gets its unit, with a mix after every second new key. Mix units fill the rest.
- Level 1 as an example: C, G, mix, F, A minor, mix, D minor, mix, mix, mix, mix, level check.
- **Same shape, new key.** In each unit with several keys, piece 4 is piece 3 in another key of the same mode, chosen so that the hands sit the same distance apart. A pair that still does not fit is rare, and piece 4 is then a new piece.
- Each piece keeps: best score, stars, attempts, and the first-sight result.

**Key focus**

- With a key pinned, the book shows 20 numbered pieces at the level in that key. These pieces are separate from the 96.
- A key chip is green when the mean of the last 8 first-sight scores in that key at that level is 85% or more. It is gold when the key is started.

**Today's set**

- 5 pieces: 1 a level below as a warm start, 3 at the current level, 1 a level above as a stretch. The stretch does not count toward promotion.
- With "Mixed", the 3 level pieces are in 3 different keys: the newest key that is not secure yet, the weakest key that is not secure, and then keys of the pool in an order that changes every day. With a key pinned, all 5 pieces are in that key.
- The set is created at the first visit of the day and stays fixed for that day. Each slot stores a counter. The date, the level, the slot, the key and the counter give the piece, so a piece does not change after it has been played.
- Each piece is a first sight: preview, count-in, one assessed attempt. Replays count as practice.

**Suggested next step**

- The app suggests the next level when the mean of the last 16 first-sight scores in mixed keys at the level is 85% or more.
- A suggestion is a card with one button. The user can ignore it.

### As built (steps 2 to 4)

| File | Content |
|---|---|
| `src/sight-reading/levels.ts` | levels, keys, hand positions, the level-limits check (G2) |
| `src/sight-reading/patterns.ts` | the notes of each hand as scale degrees, and a recogniser for each of the 22 patterns |
| `src/sight-reading/rules.ts` | the checks for G2 to G16, the difficulty score and the band of each level |
| `src/sight-reading/melody.ts` | the generator: `srtGenerateLevelPiece(level, key, seed)` |
| `src/sight-reading/book.ts` | `srtBookUnits`, `srtBookEntry`, `srtBookPiece`, `srtFocusPiece`, `srtDailyPlan`, `srtDailyPiece` |
| `src/sight-reading/fingerprint.ts` | `srtLevelFingerprint`, with the prefix `v2` |
| `src/sight-reading/progressive.ts` | the long piece: `srtGenerateProgressivePiece`, `srtProgressivePlan`, `srtProgressiveViolations` |
| `src/sight-reading/markings.ts` | `srtLevelMarkings`: dynamics, hairpins, finger numbers, staccato, accents and slurs of a piece |

- **How a piece is made.** The generator picks a meter and a bar count, a rhythm for each bar, and a chord plan. A bounded search then finds a melody in scale degrees that follows the plan. The second hand is added: long notes, chords, a broken chord, or the melody in parallel or contrary motion. The piece is kept only when every rule holds. On average 2 to 4 attempts are needed.
- **Chords.** I, IV and V up to level 5. Levels 6 to 8 add ii and vi. A minor key uses iv in place of ii. The chord may change in the middle of a bar only in 4/4 and 6/8. After an upbeat bar the first full bar is the home chord.
- **Melody.** No leap of a seventh. No leap of a sixth or more out of a note shorter than a quarter. The high point lies in the upper half of the range and is not a sixteenth.
- **Minor keys.** The raised seventh is reached from the tonic above or from the fifth degree below, never by an augmented second. A piece has at most one for every four bars. The left hand leaves the seventh to the melody.
- **Difficulty score.** It counts leaps, changes of direction, different note values, position changes, accidentals and notes per beat. The band of a level runs from the 3rd to the 97th percentile of 1,440 generated pieces. A score compares pieces of one level, not levels with each other.
- **The book is pinned.** A test holds one number per level, made from the fingerprints of all 96 pieces. A change to the generator that would change any book fails that test.
- **Speed.** One piece takes 0.2 to 1.4 ms on a laptop, and a long piece 2 to 45 ms (worst cases up to 0.5 s). A book is built only up to the number that is opened: the first piece of a level takes about 10 ms, and a whole book 0.1 to 0.5 s. A daily set takes under 0.2 s.
- **Pieces are frozen.** A generated piece cannot be changed by the code that receives it.

## 8. Player

- Header: level, unit, and "No. 21 of 96" or "Today 2 of 5".
- Preview: a countdown plus a checklist built from the piece: key signature and time, first note and hand, and the patterns to look for ("broken triad in bar 2", "bars 1 and 3 share a rhythm"). "Start now" skips the wait.
- Then count-in, play, and a result card: score, stars, pitch, rhythm, timing, the key, and Retry, Listen and Next buttons.
- Controls under the score: Hands (only when the level uses both), Tempo, Listen, Options.
- Listen stays disabled until the first attempt is finished, as today.

Two proposed changes to current behaviour:

- Preview time changes from 20 to 30 seconds. ABRSM gives 30 seconds in its exam.
- The first-sight tempo changes from a fixed 60 bpm to the level's tempo.

## 9. Warm-up

One button, about 2 minutes, built for the current level. Every item is answered by playing.

| Item | What it does | Source | From level |
|---|---|---|---|
| Pattern flash | One bar shows for 2 seconds, then hides, and you play it. It uses the patterns of the level. | new, built on the generator | 1 |
| Position notes | Play the shown note, in the hand position of a key from the pool | Treble, Bass, Grand staff units (`play` type) | 1 |
| Rhythm | Tap the rhythm cells of the level | Rhythm unit | 1 |
| Chords at sight | Play the shown 2-note or 3-note chord | Chords unit, plus the P3 profiles | 6 |

The pattern flash is the main item. It trains taking in a group of notes at one glance.

"All drills" opens the full catalogue as 9 rows (one per topic) with a dot per level, plus the custom drill and the challenge modes. The naming drills stay there, unchanged.

## 10. Nothing is lost

| Today | After |
|---|---|
| Drills / Sight-reading sub-tabs | One page: Today, The book, Warm-up |
| Ladder of 66 level buttons | Warm-up button, and 9 topic rows under "All drills" (54 levels) |
| "Sight-reading" unit, 12 levels, C major for most | The book: 8 levels × 96 pieces in mixed keys, plus a 20-piece run for any pinned key |
| "New sight-reading melody" button | Today's set, and Next in the player |
| Custom drill form | Under "All drills" |
| Time Attack, Survival, Marathon | Under "All drills", per topic |
| C clefs unit | Under "All drills" |
| 6 option toggles on the home screen | Options sheet |
| Hands, mode, note names, any octave, tempo, listen | Player controls and Options sheet |
| First-sight ledger, fingerprints, backup | Unchanged |
| Reading stats in Progress | Unchanged, plus per-key colours on the key row |

## 11. From the `feat/reading-curriculum-redesign` branch

| Part | Decision |
|---|---|
| Next / Prev flow, auto-next with countdown and Cancel, Tempo +5 | Port |
| Result card with stars | Port. Fix: a step-by-step run records 0 ms and that becomes the stored best timing. |
| Token format (`C4.q`, `C3+E3.h`, `R.w`) | Keep as the debug and test format for generated pieces |
| Per-key mastery colours | Port onto the key row |
| Book hub (cards, 3 filters, drawer) | Replace with the level picker, the key row and the units |
| "All-Keys" rows (72) | Drop. They are 6 shapes transposed, and no generator exists for them. |
| Kravchuk rows (355) | Not merged. See decision D1. |
| Czerny and classical rows (52) | Later, as a separate "Pieces to read" shelf, after their public-domain status is checked |
| Two-voice engraving | Not needed for levels 1 to 8. Leave out. |
| Unused migration function in `storage.ts`, drill filter pills, numbered Practice headings | Drop |

## 12. Layout

- 1100 px and wider (monitor, tablet landscape): two columns. Left: Today, then The book. Right, 340 px: Warm-up, then Progress.
- 700 to 1099 px (tablet portrait): Today and Warm-up share the first row. The book and Progress are full width below.
- Below 700 px (phone): one column.
- Units sit two per row when the book is 860 px or wider, and one per row below that.
- Every touch target is 44 px or larger. No horizontal scrolling at any width.
- The player gives the score the full width. Controls sit in one bar under it.

## 13. Build plan after approval

Each step ends with its check. I pause for your OK after each step.

1. Level model, limits and pattern lists → verify: G2 tests pass for 8 levels × 24 keys.
2. Melody engine (patterns, chord plan, phrase form) → verify: G3 to G10 and G16 tests pass over 200 seeds.
3. Left hand and playability → verify: G11 to G13 tests pass.
4. Difficulty score, units and book index, key focus runs, daily set → verify: G1, G14 and G15 tests pass, and you approve the sample sheet.
5. Storage for book progress, with a migration fixture → verify: storage tests pass with old fixtures.
6. Read page (Today, The book, Warm-up, Options) and player → verify: e2e at 1440×900, 1180×820, 820×1180 and 390×844, in 7 languages.
7. Warm-up with the pattern flash, and "All drills" → verify: new e2e passes and the existing drill tests stay green.
8. Port the flow and result card from the branch → verify: e2e for Next, auto-next and the timing fix.
9. README, TODO and HISTORY updates → verify: links and facts checked against the code.

## 14. Decisions for you

- **D1 Kravchuk exercises.** Recommendation: do not merge them into the public repo. The generated book replaces them.
- **D2 Size.** 8 levels with 96 numbered pieces each, plus 20-piece runs for a pinned key. Recommendation: accept.
- **D3 Preview and tempo.** 30-second preview and the level's tempo for first sight. Recommendation: accept.
- **D4 Ceiling.** Level 8 is near ABRSM Grade 5. Higher levels can follow later. Recommendation: accept.
- **D5 Public-domain shelf.** Czerny and classical pieces as a later, separate step. Recommendation: later.
- **D6 G♯ minor.** Its leading note is F double-sharp. Recommendation: keep the ban on double accidentals and close G♯ minor pieces without the raised note, until the score renderer is checked for double sharps.

## 15. Sources and their limits

- ABRSM Piano syllabus 2025 and 2026, sight-reading table: https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20&%202026%20Prac%20syllabus%2020240524_access.pdf. The bar counts for Grades 1 to 3 were not legible in the extracted text.
- RCM Piano Syllabus 2022: https://teacherportal.rcmusic.com/getattachment/57f3734d-97e5-4777-b67e-4b1111ee31a3/piano-syllabus-2022-edition.pdf. The level-by-level mapping was extracted from two-column text and is not verified.
- ABRSM sight-reading guidance (look ahead, keep going, ignore slips): https://iq.abrsm.org/en/our-exams/what-is-a-graded-music-exam/sight-reading/
- Waters, Underwood and Findlay 1997 (pattern matching in skilled readers): https://link.springer.com/content/pdf/10.3758%2FBF03211857.pdf
- Aiba and Sakaguchi 2018 (reading shapes): https://www.frontiersin.org/articles/10.3389/fpsyg.2018.02192
- Eye-hand span is not a decisive predictor: https://www.nature.com/articles/s41598-019-54364-y
- Hardy, literature review on teaching sight-reading (interval and pattern teaching, keyboard feel): https://sightreadingmastery.com/dianne-hardy-teaching-sight-reading-at-the-piano/research.htm. Secondary source, older studies.
- von Hippel and Huron 2000 (leap recovery and range): https://scilit.com/publications/d61da2e28fb69e0f7a57e22fd7fd1969
- Other tools reviewed for features only: Sight Reading Factory, Piano Marvel SASR, Read Ahead, ABRSM Sight-Reading Trainer.
- Not verified: the claim that mixed keys teach better than one key at a time. It rests on the general research on interleaved practice, which was not part of the search for this spec.
- Not found: Trinity sight-reading parameters, a controlled study of note-naming flashcards, and evidence for a specific daily session length.

## 16. As built: steps 5 to 9

**Page**

- The Read tab opens on the new home: Today, The book, Warm-up, Progress.
- The old screens are kept whole and are reached from a row "More" at the bottom of the home: "Reading drills" (the ladder, the custom drill, the challenge modes) and "Sight-reading" (the older melody generator). "All drills" on the Warm-up card opens the same drills screen. A new catalogue of 9 topic rows was not built: the existing ladder is the catalogue.
- The older "Sight-reading" unit of the ladder (12 levels, most in C major) stays. Existing tests and saved statistics depend on it.
- There is no separate Options sheet. Hands, mode, note names, any octave and tempo stay in the player, and Auto-next sits on the result card.

**Player**

- A level piece is shown in the existing sight-reading panel through its own path next to the older melodies: it uses the level's tempo, a 30-second preview with a checklist, one metronome click per beat in every meter, and results mapped to notes by id.
- The engraver draws level pieces with beams in every meter, dotted and whole-bar rests, accidentals that hold for the bar, and ties for chords. This is switched on by a flag on the score (`engrave: 2`). Lessons, rhythm drills and older melodies are drawn exactly as before.
- A step-by-step run is recorded as practice, never as first sight.
- A piece that was seen before opens as practice.

**State**

- The page keeps its state under `data.reading.book` (see `src/sight-reading/progress.ts`). It needs no migration: a saved record without it gets the defaults.
- On sync, `tries` of a piece add up and `best` and `stars` take the higher value. The rest of the book state follows the last writer.
- Once a piece of today's set was played, the set stays for the day, also when another level or key is chosen. Before that, a new choice draws it again.

**Warm-up**

- Six flash cards of one bar without chords, each shown for 2 seconds and then played from memory. "Show again" shows the bar once more, and the card then does not count as read at first glance.
- Then 5 position notes for each hand, 2 rhythm exercises, and from level 6 five chord questions. These steps use the existing drill engine and count in the drills' own statistics.
- The warm-up uses the pinned key, or the key of the first level piece of today's set.

**Languages**

- Every string of the page exists in English, Romanian, Spanish, French, German, Italian and Brazilian Portuguese. The translations were written by the assistant and were not checked by a native speaker.

## 17. As built: the practice flow

**Pieces**

- A level piece has 8 bars at levels 1 to 3, 8 or 12 at level 4, 12 at levels 5 and 6, and 16 at levels 7 and 8, in 4-bar phrases. `srtGenerateLevelPiece` takes `bars`, `meter` and `upbeat: false` to pin a choice.
- A long piece (`progressive.ts`) is 3 or 4 sections in one meter and key, 24 to 48 bars. Each section is a valid level piece of its own level. For level L of 3 or more the sections are (L-2, hard third), (L-1, middle third), (L, easy third), (L, hard third). Level 1 uses its own thirds, level 2 starts at level 1. A section below L is used only when the key is in that level's pool. Its tempo is the slowest of its sections' levels. No hand leaps into a section further than that section's level allows; `srtProgressiveViolations` reports a join that does.
- The book state has version 2. A state of an older version numbered other pieces: on load its results, recent scores and daily set are dropped, and the level, the pinned key and the streak days stay.
- A long piece is stored under `l{date}.{index}`. Its score counts for neither the key nor the level average: part of it is below the level.
- Markings (`markings.ts`) are decoration: nothing scores them, and the fingerprint ignores them. Level 1 has one dynamic and the first finger of each hand. A second dynamic comes from level 2; hairpins, staccato and slurs from level 3; accents from level 5. A long piece has a dynamic at each section.
- Scoring reads when a key goes down, never how long it stays down, so a staccato note played short costs nothing.

**Player**

- A level piece is drawn as soon as it opens, with its checklist above it. There is no timed look and no preview panel. Looking claims nothing: the first attempt is the first sight. Older melodies keep their 20-second preview.
- Start goes to a one-bar count-in. With a MIDI or Bluetooth piano the first right note (any octave when that option is on) starts the attempt with no count-in: that note is the first onset and the clicks go on from it. A piece just opened waits 600 ms, and a finished attempt 1 s, before a key can start one.
- The score is a page: four bars a system, every system the full width, on a paper of at most 1120 px. It is sized by the room under it, between 0.85 and 1.4 times its natural size. An 8-bar piece and the Start button show without scrolling at 1440 by 900. Longer pieces scroll with the playhead.
- The engraver draws the markings as one group over the notes (`srLevelMarks`): dynamics and hairpins between the staves, a finger number above the right hand and below the left, a staccato dot or an accent on the notehead side, slurs on the notehead side.
- The result card shows the stars large with one line on what the next star takes: 60, 80, and 95 with no wrong note. Auto-next is the reader's choice once made; until then it is on while a piano is connected.

**Home**

- The home uses Today's layout and classes: the set card (level, first-sight average, pieces read, today's five pieces) beside a plan of three numbered steps (warm-up, today's set, long piece) from 960 px, one column below. The head shows the day streak and the set as five dots.
- Below: the level book, then "Other ways to practice" (reading drills, Pieces, Voice). The row "More" with the old screens stays at the bottom.

**Open**

- The longer pieces, the long piece and the markings were checked by tests and on screen, not by ear.
