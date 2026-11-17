# Performance time and written score position

The engraved cursor and note scheduler use written score seconds (`fallTime`). The transport uses an expanded performance coordinate: repeated passages appear once per performed occurrence, and alternate endings contribute only on their corresponding passes. The timeline is cached by note source, MusicXML and tempo-map identity.

Each audio-clock segment carries its starting performance coordinate and elapsed active musical seconds. At a repeat, written time moves backward while performance time continues forward. Wait-for-me barriers freeze both clocks; time spent waiting, paused or counting in is excluded. Speed changes preserve elapsed time and estimate the remaining duration at the current speed. Written final rests are included through the last measure boundary.

The seek slider uses nominal expanded seconds, independent of speed. Its accessible time text and both visible clocks show elapsed seconds and the estimated full duration. The bar/beat display and engraved cursor remain in written coordinates. Seeking selects an occurrence directly; written-score navigation selects the closest playable occurrence, with end-of-repeat boundaries resolved to the bar actually requested. Repeated measure ticks are expanded and the visible marker count is bounded.

Finite selections and infinite loops show their own duration; the loop pass counter remains visible when listening without playing along. Forward jumps to alternate endings reset per-range judgements but do not increment the pass counter. Pause/resume also accounts for an audio boundary reached between scheduler ticks.

Library checkpoints retain the original written `position` plus optional `performance` and `elapsed` numbers. The validator accepts older checkpoints unchanged, rejects malformed new values, and preserves the new values through normal library backup validation. Loading a bookmark verifies that its expanded coordinate maps to the saved written position; mismatches fall back to written-position navigation. No IndexedDB schema or `ptt-v3` migration is required for these optional library fields.

Regression coverage includes repeats, alternate endings, seek, pause/resume at the repeat boundary, reload from My Library, speed changes, tempo changes, final rests, completion, loops and Wait for me. Physical-device audio/MIDI checks remain in the device smoke runbook.
