import {
  estimateScoreDifficulty,
  type DifficultyInput,
  type DifficultyMeasure,
  type DifficultyNote,
  type DifficultyRest,
  type HandSource,
  type NoteArticulation,
} from './score-difficulty.js';
import { anAssignHands } from './score-midi.js';
import { repeatOrder, scoreXmlRepeatBars } from './score-repeats.js';
import { anError, type AnMidiMeta, type AnParsedMidi, type AnSource, type ScoreMeasure, type ScoreXmlKey } from './score-types.js';

const EPS = 1e-7;
type Tempo = { beat: number; bpm: number };

function tempoClock(input: readonly Tempo[], startingBpm?: number) {
  const tempos = [{ beat: 0, bpm: startingBpm ?? 120 }, ...input.filter(t => t.beat >= 0 && t.bpm > 0 &&
    Number.isFinite(t.beat) && Number.isFinite(t.bpm)).sort((a, b) => a.beat - b.beat)];
  let seconds = 0;
  const segments = tempos.map((tempo, i) => {
    if (i) seconds += (tempo.beat - tempos[i - 1].beat) * 60 / tempos[i - 1].bpm;
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
    return at + (beat - start) * 60 / bpm;
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
    const onset = clock(bar.start), duration = clock(bar.end) - onset;
    const start = beat, end = beat + length, startSec = seconds;
    const endSec = startSec + duration, groups = measureGroups(bar);
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
        startSec: startSec + clock(note.start) - onset, midi: note.midi, hand: note.hand, voice: voice(note),
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

function midiInput(parsed: AnParsedMidi, startingBpm?: number): DifficultyInput {
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
    measures.push({ start: at, end: stop, startSec: clock(at), endSec: clock(stop), groups, writtenIndex: measures.length, fifths, num: meter.num, den: meter.den });
    at = stop;
  }
  const assigned = anAssignHands(parsed.notes, 'auto');
  const handSource: HandSource = assigned.how === 'piece' ? 'written' : assigned.how === 'tracks' ? 'track' : 'pitchSplit';
  const notes = parsed.notes.map((note, i) => ({
    start: note.start, end: note.end, startSec: clock(note.start), midi: note.midi,
    hand: assigned.of[i], soundingEnd: note.soundEnd,
  }));
  return { measures, notes, rests: [], voiceSource: 'unknown', handSource,
    tempoSource: tempos.some(tempo => tempo.beat <= EPS) ? 'written' : startingBpm ? 'reference' : 'fallback' };
}

export function estimateImportedScore(source: Extract<AnSource, { kind: 'xml' | 'midi' }>, startingBpm?: number) {
  const fallback = startingBpm !== undefined && Number.isFinite(startingBpm) && startingBpm >= 20 && startingBpm <= 400 ? startingBpm : undefined;
  const input = source.kind === 'xml' ? xmlInput(source, fallback) : midiInput(source.parsed, fallback);
  const estimate = estimateScoreDifficulty(input, 'performance');
  return { ...estimate, midi: source.kind === 'midi', playedMeasures: input.measures.length,
    playedDurationSec: input.measures.at(-1)?.endSec ?? 0 };
}

export type ImportedDifficultyEstimate = ReturnType<typeof estimateImportedScore>;
