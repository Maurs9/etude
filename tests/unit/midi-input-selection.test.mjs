import { expect, it } from 'vitest';
import { selectMidiInput } from '../../src/domain/midi-input-selection.ts';

const piano = { id: 'piano', name: 'Stage Piano' };
const pad = { id: 'pad', name: 'Drum Pad' };

it('keeps the stand-in temporary until the preferred input returns, even with a new ID', () => {
  expect(selectMidiInput([pad], null, piano.id)).toEqual({ input: pad, temporary: true });
  expect(selectMidiInput([pad, piano], pad.id, piano.id)).toEqual({ input: piano, temporary: false });
  const reconnected = { ...piano, id: 'new-piano' };
  expect(selectMidiInput([pad, reconnected], pad.id, piano.id, piano.name))
    .toEqual({ input: reconnected, temporary: false });
});

it('retains an active input and prefers a playable controller port for a fresh connection', () => {
  const controller = { id: 'keys', name: 'Arturia MiniLab' };
  const control = { id: 'control', name: 'Arturia MiniLab DAW' };
  expect(selectMidiInput([pad, control, controller], null, null)).toEqual({ input: controller, temporary: false });
  expect(selectMidiInput([pad, controller], pad.id, pad.id)).toEqual({ input: pad, temporary: false });
  expect(selectMidiInput([], null, piano.id)).toBeNull();
});
