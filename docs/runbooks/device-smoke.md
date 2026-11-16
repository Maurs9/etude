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

Repeat playback follow-up (physical piano pending): import a MusicXML score with a backward repeat, play through the jump with sound and MIDI, pause/resume on each pass, and check that the blue line returns with the audio. Check pedal releases at the jump, alternate endings, and both page and continuous views. Automated tests cover the scheduler and repeat order, not physical audio timing.

Score fullscreen follow-up (physical Android/TWA and iOS Safari still pending): in Pieces and Read, expand the score before Start and during playback, rotate the device, zoom and fit the width, and show/hide the keyboard. Exit using the visible button and the system Back/Escape gesture; the current run must continue. Complete a Read attempt and verify its result and Next controls appear. Check screen cutouts and navigation bars in the installed PWA/TWA. Browser tests cover layout, native-API rejection/fallback and lifecycle, but do not verify system bars or gestures on physical devices.

Performance follow-up (physical Android/TWA still required): play the first piano note immediately after opening, check that reverb joins without delaying the attack, then switch apps and return. Open a large score, resize/rotate while it is being drawn, and check the last measures, cursor, selection and audio in both page and continuous views. Browser emulation covers recovery and drawing completeness; it does not verify physical audio latency or Android battery use.

Write the date, the Diagnostics text and any step that failed in TODO.md under the device rollout item.
