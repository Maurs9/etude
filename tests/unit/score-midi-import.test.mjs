import { describe, expect, it } from 'vitest';
import { anParse } from '../../src/domain/score-import.ts';
import { scoreMidiToXml } from '../../src/domain/score-midi.ts';

function formatOne(tracks) {
  const chunks = tracks.map(source => {
    const track = Buffer.from(source.replaceAll(/\s/g, '') + '00ff2f00', 'hex');
    const header = Buffer.from('4d54726b00000000', 'hex');
    header.writeUInt32BE(track.length, 4);
    return Buffer.concat([header, track]);
  });
  const head = Buffer.from('4d54686400000006000100000060', 'hex');
  head.writeUInt16BE(tracks.length, 10);
  const file = Buffer.concat([head, ...chunks]);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

describe('MIDI import timing', () => {
  it('recognizes sustain on the same channel across format 1 tracks', () => {
    // Channel 0 pedal goes down at beat 0 and up at beat 4.
    const parsed = anParse(formatOne([
      '00 b0 40 7f   8300 b0 40 00',
      '00 90 3c 40   00 91 40 40   60 80 3c 00   00 81 40 00',
    ]));
    expect(parsed.notes).toEqual([
      { midi: 60, start: 0, end: 1, soundEnd: 4, vel: 64, channel: 0, track: 1 },
      { midi: 64, start: 0, end: 1, vel: 64, channel: 1, track: 1 },
    ]);
    expect(parsed.sustain).toEqual([{ beat: 0, down: true }, { beat: 4, down: false }]);
  });

  it('honors MIDI event order when a key release and pedal press share a tick', () => {
    // C is released before pedal-down and E after it, all at beat 1.
    const parsed = anParse(formatOne([
      '00 90 3c 40   00 90 40 40   60 80 3c 00   00 b0 40 7f   00 80 40 00   8220 b0 40 00',
    ]));
    expect(parsed.notes.map(({ midi, end, soundEnd }) => [midi, end, soundEnd])).toEqual([
      [60, 1, undefined],
      [64, 1, 4],
    ]);
  });

  it('applies the default tempo before a late event and preserves the tempo provenance', () => {
    const notes = [{ midi: 60, start: 0, end: 6, vel: 64, channel: 0, track: 0, hand: 'rh' }];
    const withChange = scoreMidiToXml({ notes, meta: [{ type: 'tempo', beat: 4, bpm: 60 }] }, 'Tempo', { grid: 4, keys: [] }, 'Piano');
    expect(withChange.tempos).toEqual([{ beat: 0, bpm: 120 }, { beat: 4, bpm: 60 }]);
    expect(withChange.tempoFromFile).toBe(true);
    const withoutChange = scoreMidiToXml({ notes, meta: [] }, 'Tempo', { grid: 4, keys: [] }, 'Piano');
    expect(withoutChange.tempos).toEqual([{ beat: 0, bpm: 120 }]);
    expect(withoutChange.tempoFromFile).toBe(false);
  });
});
