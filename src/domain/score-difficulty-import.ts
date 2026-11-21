import {
  estimateScoreDifficulty,
  type DifficultyInput,
  type DifficultyMeasure,
  type DifficultyNote,
  type DifficultyRest,
  type HandSource,
  type NoteArticulation,
} from './score-difficulty.js';
import type { DifficultyCalibration } from './score-difficulty-calibration.js';
import { anAssignHands } from './score-midi.js';
import { repeatOrder, scoreXmlRepeatBars } from './score-repeats.js';
import { anError, type AnMidiMeta, type AnParsedMidi, type AnSource, type ScoreMeasure, type ScoreXmlKey } from './score-types.js';

const EPS = 1e-7;
const MAX_PLAYBACK_SEC = 1e7;
const MIDI_MICRO_GROUP_SEC = 0.035;
const MIDI_CHORD_OVERLAP = 0.70;
type Tempo = { beat: number; bpm: number };

function assertSafePlaybackSec(value: number): number {
  if (!Number.isFinite(value) || value < -EPS || value > MAX_PLAYBACK_SEC) throw anError('long');
  return value;
}

function tempoClock(input: readonly Tempo[], startingBpm?: number) {
  const tempos = [{ beat: 0, bpm: startingBpm ?? 120 }, ...input.filter(t => t.beat >= 0 && t.bpm > 0 &&
    Number.isFinite(t.beat) && Number.isFinite(t.bpm)).sort((a, b) => a.beat - b.beat)];
  let seconds = 0;
  const segments = tempos.map((tempo, i) => {
    if (i) seconds = assertSafePlaybackSec(seconds + (tempo.beat - tempos[i - 1].beat) * 60 / tempos[i - 1].bpm);
    return { ...tempo, seconds };
  });
  return (beat: number) => {
    let lo = 0, hi = segments.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (segments[mid].beat <= beat + EPS) lo = mid;
      else hi = mid;
    }
    const { bpm, seconds: at, beat: start } = segments[lo];
    return assertSafePlaybackSec(at + (beat - start) * 60 / bpm);
  };
}

function measureGroups(measure: ScoreMeasure) {
  if (measure.groups) return measure.groups;
  const compound = measure.den === 8 && measure.num % 3 === 0;
  const unit = 4 / measure.den * (compound ? 3 : 1);
  return Array.from({ length: Math.min(Math.ceil((measure.end - measure.start) / unit), 64) }, () => unit);
}

function xmlInput(source: Extract<AnSource, { kind: 'xml' }>, startingBpm?: number): DifficultyInput {
  const bars = source.measures;
  const order = repeatOrder(scoreXmlRepeatBars(new DOMParser().parseFromString(source.xml, 'application/xml'), bars));
  const clock = tempoClock(source.tempos, startingBpm);
  const notes: DifficultyNote[] = [], rests: DifficultyRest[] = [], measures: DifficultyMeasure[] = [];
  const writtenEnds = order.map(() => 0);
  for (let i = order.length - 1; i >= 0; i--) {
    writtenEnds[i] = order[i + 1] === order[i] + 1 ? writtenEnds[i + 1] : bars[order[i]].end;
  }
  const noteBuckets = bars.map(() => [] as typeof source.notes);
  const restBuckets = bars.map(() => [] as NonNullable<typeof source.difficultyRests>);
  function indexAt(beat: number) {
    let lo = 0, hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (bars[mid].end <= beat + EPS) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  for (const note of source.notes) noteBuckets[indexAt(note.start)]?.push(note);
  for (const rest of source.difficultyRests ?? []) restBuckets[indexAt(rest.start)]?.push(rest);
  const voice = (n: { part: number; staff: number; voice: number }) => `${n.part}:${n.staff}:${n.voice}`;
  const keys = [...source.keys].sort((a, b) => a.beat - b.beat);
  const keyAt = (beat: number) => {
    let lo = 0, hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (keys[mid].beat <= beat + EPS) lo = mid + 1;
      else hi = mid;
    }
    return keys[lo - 1]?.fifths;
  };
  let beat = 0, seconds = 0;
  order.forEach((writtenIndex, i) => {
    const bar = bars[writtenIndex], length = bar.end - bar.start;
    if (length <= EPS) return;
    const onset = clock(bar.start), duration = assertSafePlaybackSec(clock(bar.end) - onset);
    const start = beat, end = beat + length, startSec = seconds;
    const endSec = assertSafePlaybackSec(startSec + duration), groups = measureGroups(bar);
    const measure: DifficultyMeasure = {
      start, end, startSec, endSec, groups, writtenIndex, fifths: keyAt(bar.start),
      num: bar.num, den: bar.den,
      ...(bar.clefChanges ? { clefChanges: bar.clefChanges } : {}),
      ...(bar.pedalChanges ? { pedalChanges: bar.pedalChanges } : {}),
    };
    measures.push(measure);
    const writtenNotes = noteBuckets[writtenIndex], writtenRests = restBuckets[writtenIndex];
    if (notes.length + rests.length + writtenNotes.length + writtenRests.length > 100_000) throw anError('long');
    const lanes = new Set(writtenNotes.map(voice));
    for (const note of writtenNotes) {
      const articulation: NoteArticulation | undefined = note.art.staccato || note.art.staccatissimo
        ? 'staccato'
        : note.art.accent || note.art.strongAccent
          ? 'accent'
          : note.art.tenuto ? 'tenuto' : undefined;
      notes.push({
        ...note.difficulty, start: start + note.start - bar.start, end: start + Math.min(note.end, writtenEnds[i]) - bar.start,
        startSec: assertSafePlaybackSec(startSec + clock(note.start) - onset), midi: note.midi, hand: note.hand, voice: voice(note),
        finger: note.finger, ornaments: (note.difficulty?.ornaments ?? 0) + (note.graces?.length ?? 0),
        ...(note.difficulty?.trills ? { trills: note.difficulty.trills } : {}),
        ...(articulation ? { articulation } : {}),
        tiedAcrossBar: note.end > bar.end + EPS && writtenEnds[i] > bar.end + EPS,
      });
    }
    for (const rest of writtenRests) {
      const active = rest.end - rest.start < length - EPS && lanes.has(voice(rest));
      rests.push({ start: start + rest.start - bar.start, end: Math.min(end, start + rest.end - bar.start),
        hand: rest.hand, voice: voice(rest), active });
    }
    beat = end;
    seconds = endSec;
  });
  const handSource: HandSource = notes.some(note => note.hand === null) ? 'unassigned' : 'written';
  return { measures, notes, rests, playedDurationSec: seconds, voiceSource: 'written', handSource,
    tempoSource: source.tempos.some(tempo => tempo.beat <= EPS) ? 'written' : startingBpm ? 'reference' : 'fallback' };
}

/** Group unquantized MIDI chord micro-offsets relative to the first note's anchor without chaining runs. */
export function microGroupMidiNotes(notes: readonly DifficultyNote[]): DifficultyNote[] {
  const byHand: Record<'rh' | 'lh' | 'unassigned', DifficultyNote[]> = { rh: [], lh: [], unassigned: [] };
  for (const note of notes) {
    byHand[note.hand ?? 'unassigned'].push(note);
  }
  const grouped: DifficultyNote[] = [];
  for (const bucket of [byHand.rh, byHand.lh, byHand.unassigned]) {
    if (!bucket.length) continue;
    const sorted = [...bucket].sort((a, b) => a.startSec - b.startSec || a.start - b.start || a.midi - b.midi);
    let anchorStart = sorted[0].start;
    let anchorSec = sorted[0].startSec;
    let anchorEnd = sorted[0].end;
    let pitches = new Set<number>([sorted[0].midi]);
    grouped.push(sorted[0]);

    for (let i = 1; i < sorted.length; i++) {
      const note = sorted[i];
      const dtFromAnchor = note.startSec - anchorSec;
      const overlap = Math.min(note.end, anchorEnd) - Math.max(note.start, anchorStart);
      const maxDur = Math.max(note.end - note.start, anchorEnd - anchorStart);
      const overlapRatio = maxDur > 0 ? overlap / maxDur : 0;
      if (dtFromAnchor <= MIDI_MICRO_GROUP_SEC + EPS && !pitches.has(note.midi) && overlapRatio >= MIDI_CHORD_OVERLAP) {
        pitches.add(note.midi);
        grouped.push({ ...note, start: anchorStart, startSec: anchorSec });
      } else {
        anchorStart = note.start;
        anchorSec = note.startSec;
        anchorEnd = note.end;
        pitches = new Set([note.midi]);
        grouped.push(note);
      }
    }
  }
  return grouped.sort((a, b) => a.start - b.start || a.midi - b.midi);
}

function midiInput(parsed: AnParsedMidi, startingBpm?: number, microGroup = true): DifficultyInput {
  const tempos = parsed.meta.filter(event => event.type === 'tempo');
  const meters = parsed.meta.filter((event): event is Extract<AnMidiMeta, { type: 'time' }> => event.type === 'time' && event.num > 0 && event.den > 0).sort((a, b) => a.beat - b.beat);
  const keys: Pick<ScoreXmlKey, 'beat' | 'fifths'>[] = parsed.meta.filter(event => event.type === 'key').sort((a, b) => a.beat - b.beat);
  const clock = tempoClock(tempos, startingBpm), measures: DifficultyMeasure[] = [];
  const end = parsed.notes.reduce((last, note) => Math.max(last, note.end), 0);
  let meter = { num: 4, den: 4 }, next = 0, key = 0, fifths: number | undefined;
  for (let at = 0; at < end - EPS;) {
    if (measures.length >= 16_384) throw anError('long');
    while (next < meters.length && meters[next].beat <= at + EPS) meter = meters[next++];
    while (key < keys.length && keys[key].beat <= at + EPS) fifths = keys[key++].fifths;
    const stop = Math.min(end, at + meter.num * 4 / meter.den, meters[next]?.beat ?? Infinity);
    const groups = measureGroups({ ...meter, start: at, end: stop, number: '' });
    const startSec = clock(at), endSec = clock(stop);
    if (endSec < startSec - EPS) throw anError('long');
    measures.push({ start: at, end: stop, startSec, endSec, groups, writtenIndex: measures.length, fifths, num: meter.num, den: meter.den });
    at = stop;
  }
  const assigned = anAssignHands(parsed.notes, 'auto');
  const handSource: HandSource = assigned.how === 'piece' ? 'written' : assigned.how === 'tracks' ? 'track' : 'pitchSplit';
  const rawNotes: DifficultyNote[] = parsed.notes.map((note, i) => ({
    start: note.start, end: note.end, startSec: clock(note.start), midi: note.midi,
    hand: assigned.of[i], soundingEnd: note.soundEnd,
  }));
  const notes = microGroup ? microGroupMidiNotes(rawNotes) : rawNotes;
  return { measures, notes, rests: [], voiceSource: 'unknown', handSource,
    tempoSource: tempos.some(tempo => tempo.beat <= EPS) ? 'written' : startingBpm ? 'reference' : 'fallback' };
}

export type ImportedScoreDifficultyOptions =
  | DifficultyCalibration
  | null
  | undefined
  | { calibration?: DifficultyCalibration | null; rubricVersion?: 1 | 2 | 3 };

export function estimateImportedScore(
  source: Extract<AnSource, { kind: 'xml' | 'midi' }>,
  startingBpm?: number,
  calibrationOrOptions?: ImportedScoreDifficultyOptions,
) {
  const opts = calibrationOrOptions && 'version' in calibrationOrOptions
    ? { calibration: calibrationOrOptions, rubricVersion: undefined }
    : (calibrationOrOptions ?? {});
  const calibration = opts.calibration ?? null;
  const aggregation = calibration?.version === 2 ? calibration.aggregation : undefined;
  const profileId = calibration?.version === 2 ? calibration.profileId : 'default';
  const fallback = startingBpm !== undefined && Number.isFinite(startingBpm) && startingBpm >= 20 && startingBpm <= 400 ? startingBpm : undefined;
  const input = source.kind === 'xml'
    ? xmlInput(source, fallback)
    : midiInput(source.parsed, fallback, opts.rubricVersion !== 1);
  const estimate = estimateScoreDifficulty(input, 'performance', {
    rubricVersion: opts.rubricVersion,
    aggregation,
  });
  return {
    ...estimate,
    profileId,
    midi: source.kind === 'midi',
    playedMeasures: input.measures.length,
    playedDurationSec: input.measures.at(-1)?.endSec ?? 0,
  };
}

export type ImportedDifficultyEstimate = ReturnType<typeof estimateImportedScore>;
