# Device smoke check

Run this on the Android phone after a release that changes storage, the service worker, audio or MIDI.
It takes about 15 minutes. Automated tests can't cover these, because they need the real phone and piano.

Before you start, open **Settings → Your data → Diagnostics** and tap **Copy**. Paste the text into your notes, so you can compare before and after.

## Install and offline

1. Open https://maurs9.github.io/etude/etude.html in Chrome while online. Wait until **Settings → App & screen** says the app works offline.
2. Install it (Chrome menu → **Install app**). Open it from the home screen icon.
3. Check that Diagnostics shows `Display: installed app`.
4. Turn on Airplane mode. Close the app fully and open it again. Check that Today, Learn and a drill all work.
5. Turn Airplane mode off.

## Storage and backups

1. In Diagnostics, check `Storage:`. On an installed app, Chrome usually shows `persisted` after your first tap. `best-effort` means Chrome may clear progress when space runs low, so export more often.
2. Answer a few review questions. Check that **Settings → Your data → Automatic backups** lists a `daily` copy for today.
3. Tap **Export**. Check that the file downloads and that **Backup** now shows today's date.
4. On Progress, tap **Reset progress** and confirm. Then restore the `before reset` copy in Settings. Check that your reviews are back.
5. On a disposable profile in the installed app, import a score into **My Library** and wait for its five difficulty values. Reload and export the library, then restore it to another disposable profile. Confirm the five values and overall stars match and tapping the title opens the score.

## Update while open

1. Leave the app open on Today. Deploy a new build to GitHub Pages.
2. Switch to another app and back. Reload when you are ready.
3. Check that `App version` in Diagnostics changed and that your progress is still there.

## Sound after switching apps

1. Start the metronome or a drill with sound. Switch to another app for 30 seconds, then come back.
2. Tap once. Check that sound plays. If the banner says sound is off, tap **Turn sound on** and note it.

## MIDI

1. **USB:** connect the piano's USB-to-Host port with a USB-C cable. Check that Diagnostics lists the piano under `MIDI:` and that keys light up in Explore.
2. Unplug the cable for 5 seconds and plug it back in. Note whether the piano is picked up again without opening Settings.
3. **Bluetooth:** in **Settings → Bluetooth MIDI (direct)**, connect the piano. Play a scale in Explore.
4. Turn the piano off and on. Note whether it reconnects by itself, and how long it takes.

## Record the result

Cursor/audio sync follow-up (physical Android/TWA pending): use the reported Tchaikovsky score at 70% speed. Check the cursor against sounding noteheads after rests, at the last note of each system, through repeats, after pause/resume, and after a live speed change. Check that speed changes between engraved notes are gradual, without stopping at every note or animating across a repeat/system jump. Repeat with the built-in speaker and wired/Bluetooth audio separately. Browser tests verify engraved positions against scheduled Web Audio onsets; physical output latency and display refresh require a device recording.

Score touch tools follow-up (physical Android/TWA pending): open a score in Pieces. With Navigate active, drag with one finger and tap a note. Switch to Select and circle notes with one finger, then try rectangle selection. During an unfinished lasso, add a second finger: the lasso must disappear and the previous selection must remain. Pan and pinch with two fingers; confirm the score visibly grows/shrinks, including page and continuous layouts. Lift one finger and continue moving: navigation must continue until both lift. The next one-finger gesture must use the still-active tool. Repeat in fullscreen, after rotation, and with a stylus if available. Browser tests use Chrome touch emulation and do not verify a physical APK.

Performance timeline follow-up (physical device pending): play a MusicXML score through repeats and alternate endings. Confirm that the elapsed clock and progress move forward while the engraved cursor returns to the repeated bar; change speed during playback, pause/resume, seek into the second pass, then close and reopen from My Library. Verify the same occurrence is restored, including offline and after a library backup transfer. In Wait for me, progress freezes while awaiting keys; loop clocks show the loop duration and the pass counter advances only on a repeat. Check final rests and MIDI/audio synchronization on the real piano.

Wait-for-me chord follow-up (physical MIDI pending): verify a normal chord requires fresh attacks within 150 ms with all required keys physically held. Press/release its notes successively, then assemble it slowly while holding: neither should pass. Sustain pedal must not replace released keys; extra wrong held keys must block validation, while written sustained notes and the unpractised hand remain allowed. Check marked arpeggios, any-octave mode, USB/Bluetooth input timestamps, disconnection and partial-chord pause/resume.

Wait-for-me repeat follow-up (physical MIDI pending): with both hands selected, verify that an incomplete chord keeps the cursor stopped, a wrong note does not release it, and a full chord resumes playback. Repeat the passage through a printed repeat and a selection loop: every pass must ask for the notes again. Check pause/resume and disabling Wait for me during playback with the real piano; browser tests use synthetic input.

Repeat playback follow-up (physical piano pending): import a MusicXML score with a backward repeat, play through the jump with sound and MIDI, pause/resume on each pass, and check that the blue line returns with the audio. Check pedal releases at the jump, alternate endings, and both page and continuous views. Automated tests cover the scheduler and repeat order, not physical audio timing.

Imported MIDI sustain (physical audio pending): press the sustain pedal while holding a note. Release the key, keep the pedal down briefly, then release it. Import that MIDI and check that the written note ends at key release and the sampled sound continues until pedal release. Repeat with a second channel without sustain and confirm its note stops at key release. In a MIDI editor, place a key release and a pedal press at the same tick. Compare both event orders and check that only the key released after the pedal press sustains.

Score fullscreen follow-up (physical Android/TWA and iOS Safari still pending): in Pieces and Read, expand the score before Start and during playback, rotate the device, zoom and fit the width, and show/hide the keyboard. Exit using the visible button and the system Back/Escape gesture; the current run must continue. Complete a Read attempt and verify its result and Next controls appear. Check screen cutouts and navigation bars in the installed PWA/TWA. Browser tests cover layout, native-API rejection/fallback and lifecycle, but do not verify system bars or gestures on physical devices.

Performance follow-up (physical Android/TWA still required): play the first piano note immediately after opening, check that reverb joins without delaying the attack, then switch apps and return. Open a large score, resize/rotate while it is being drawn, and check the last measures, cursor, selection and audio in both page and continuous views. Browser emulation covers recovery and drawing completeness; it does not verify physical audio latency or Android battery use.

Write the date, the Diagnostics text and any step that failed in TODO.md under the device rollout item.

## Backup restore and calibrated sight-reading

- On two disposable browser profiles, transfer a progress export containing first-sight attempts and verify the destination shows the same attempt history after reload.
- On a real USB or Bluetooth MIDI piano, calibrate timing and start a first-sight piece with its first note. Check that the onset, held duration, and following notes align with the metronome and the result. Repeat using the Start button and its count-in.
- With a real MIDI piano, open an unplayed Book piece. Play its first note while Settings or Help is open and verify the attempt stays idle. Close the dialog and play the first note again to verify the attempt starts.
- On a disposable installed-app profile, finish a lesson or a first-sight piece, reset learning progress, then restore the pre-reset copy. Verify that the lesson, attempt, and exposure return after reload.
- On an installed Android PWA, interrupt the first offline download, then restore connectivity and retry from Settings. Once it reports offline availability, use airplane mode and verify that the app opens and the recorded piano plays. Repeat with an old tab left open while an update that changes the sample files activates.

### Practice and devices follow-up

- With a USB piano and a second input attached, disconnect the piano and reload while the other input takes over. Connect MIDI while the piano is still unplugged and verify that the other input works. Reconnect the piano and verify that it takes over again.
- Start timing calibration and dismiss Settings with Close and system Back. Repeat by switching apps during calibration or a Pieces count-in. Confirm that the scheduled clicks stop. Reopen and calibrate with a Bluetooth speaker to check that the saved offset matches the timing you hear.
- Save a low volume and distinct Room Ambience level, then close and reopen the installed app. Verify that the first note uses the saved level. In Voice, leave Drone enabled through a phrase, then tap New Melody and confirm that the sound and checkbox both turn off.
- In Voice, sing a slightly flat target and verify the upward hint. Revoke microphone access during Hum to notes and verify that the captured notes remain available. Re-enable permission and start recording again.
- Background a running rhythm drill on a phone and verify that it can be restarted without grading the interrupted round.

- On a disposable profile, export progress and restore it from the device file picker. Reopen a saved MIDI score after changing its grid and key, and verify the score uses those settings.
- On a phone, record both low and high notes in Hum to notes, then play several minutes with synth tones, sustain, and modulation. Verify that pitch tracking remains responsive and the held notes keep their vibrato while earlier voices end.
- Reconnect a USB piano whose port ID changes and verify that the previous device is selected by name. On a BLE piano, switch devices while connected and check that rapid chords still sound after reconnecting.
- With Keep screen awake enabled, switch to another app and return, then return to Étude through browser Back. Verify the setting reports the lock again. Disable it and verify it stays off.
