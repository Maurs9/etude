import { anBeatUnit, anHandOf } from './score-harmony.js';
import type {
  AnNote,
  ScoreMeasure,
  ScoreOrnamentKind,
  ScoreTempoModifier,
  ScoreXmlExpression,
} from './score-types.js';

export interface ExpressiveOrnamentEvent {
  midi: number;
  offsetSec: number;
  durationSec: number;
  vel: number;
}

export interface ExpressiveNotePlan {
  vel: number;
  onsetShiftSec: number;
  durationScale: number;
  legatoOverlapSec: number;
  restrikeGapSec: number;
  warm: boolean;
  accent: boolean;
  hold: boolean;
  ornamentEvents?: ExpressiveOrnamentEvent[];
  graceStepSec: number;
}

export interface ScoreExpressionInput {
  notes: readonly AnNote[];
  measures: readonly ScoreMeasure[];
  tempos: readonly { beat: number; bpm: number }[];
  keys?: readonly { beat: number; root: number; minor: boolean }[];
  sourceKind: 'xml' | 'midi' | 'example';
  expression?: ScoreXmlExpression | null;
  enabled: boolean;
  strictTiming?: boolean;
}

type VoiceRole = 'melody' | 'bass' | 'inner';

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPedalHeld(note: AnNote): boolean {
  return !!(note.pedalEnd && note.soundEnd !== undefined && note.soundEnd > note.end + 0.001);
}

/** Deterministic signed hash in [-1, 1] for subtle musical humanization without RNG state. */
function hashSigned(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = h ^ (h >>> 16);
  return (h & 0xffff) / 32767.5 - 1;
}

function normalizeTempos(tempos: readonly { beat: number; bpm: number }[]): { beat: number; bpm: number }[] {
  const sorted = tempos
    .filter((t) => Number.isFinite(t.beat) && t.beat >= 0 && Number.isFinite(t.bpm) && t.bpm > 0)
    .map((t) => ({ beat: t.beat, bpm: t.bpm }))
    .sort((a, b) => a.beat - b.beat);
  if (!sorted.length) return [{ beat: 0, bpm: 120 }];
  if (sorted[0].beat > 0) sorted.unshift({ beat: 0, bpm: sorted[0].bpm });
  const out: { beat: number; bpm: number }[] = [];
  for (const entry of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.beat - entry.beat) <= 1e-6) last.bpm = entry.bpm;
    else out.push({ ...entry });
  }
  return out;
}

function bpmAtBeat(list: readonly { beat: number; bpm: number }[], beat: number): number {
  let bpm = list[0]?.bpm ?? 120;
  for (const entry of list) {
    if (entry.beat <= beat + 1e-6) bpm = entry.bpm;
    else break;
  }
  return bpm;
}

function dedupeTempoCurve(entries: readonly { beat: number; bpm: number }[]): { beat: number; bpm: number }[] {
  const sorted = entries
    .map((e) => ({ beat: Math.max(0, e.beat), bpm: clamp(Math.round(e.bpm * 100) / 100, 24, 300) }))
    .sort((a, b) => a.beat - b.beat);
  const out: { beat: number; bpm: number }[] = [];
  for (const entry of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.beat - entry.beat) <= 1e-6) last.bpm = entry.bpm;
    else out.push(entry);
  }
  if (!out.length) return [{ beat: 0, bpm: 120 }];
  if (out[0].beat > 0) out.unshift({ beat: 0, bpm: out[0].bpm });
  return out;
}

function modifierTargetFactor(mod: ScoreTempoModifier): number {
  const amt = mod.amount;
  switch (mod.kind) {
    case 'rit':
    case 'rall':
      return amt === 'molto' ? 0.62 : amt === 'poco' ? 0.84 : 0.74;
    case 'calando':
    case 'smorzando':
      return amt === 'molto' ? 0.58 : amt === 'poco' ? 0.78 : 0.68;
    case 'ritenuto':
      return amt === 'molto' ? 0.78 : amt === 'poco' ? 0.90 : 0.84;
    case 'meno':
      return amt === 'molto' ? 0.78 : amt === 'poco' ? 0.92 : 0.86;
    case 'piu':
      return amt === 'molto' ? 1.20 : amt === 'poco' ? 1.06 : 1.12;
    case 'accel':
    case 'stringendo':
      return amt === 'molto' ? 1.22 : amt === 'poco' ? 1.09 : 1.15;
    case 'atempo':
      return 1;
  }
}

export function buildExpressiveTempos(
  baseTempos: readonly { beat: number; bpm: number }[],
  measures: readonly ScoreMeasure[],
  expression: ScoreXmlExpression | null | undefined,
  enabled: boolean,
): { beat: number; bpm: number }[] {
  const normalized = normalizeTempos(baseTempos);
  if (!enabled || !expression || (!expression.tempoModifiers.length && !expression.fermatas.length)) {
    return normalized;
  }

  const measureLenAt = (beat: number): number => {
    const found = measures.find((m) => beat >= m.start - 1e-6 && beat < m.end - 1e-6);
    if (found) return Math.max(1, found.end - found.start);
    const last = measures[measures.length - 1];
    return last ? Math.max(1, last.end - last.start) : 4;
  };

  const pieceEnd = Math.max(
    measures.length ? measures[measures.length - 1].end : 0,
    ...expression.tempoModifiers.map((m) => m.beat + 4),
    ...expression.fermatas.map((f) => f.beat + f.duration + 1),
  );

  const curve: { beat: number; bpm: number }[] = normalized.map((t) => ({ ...t }));
  const sortedMods = expression.tempoModifiers.slice().sort((a, b) => a.beat - b.beat);

  for (let i = 0; i < sortedMods.length; i++) {
    const mod = sortedMods[i];
    const startBeat = Math.max(0, mod.beat);
    if (mod.kind === 'atempo') {
      curve.push({ beat: startBeat, bpm: bpmAtBeat(normalized, startBeat) });
      continue;
    }

    const nextMod = sortedMods.slice(i + 1).find((m) => m.beat > startBeat + 0.001);
    const nextBase = normalized.find((t) => t.beat > startBeat + 0.001);
    const twoMeasures = Math.min(8, Math.max(2, measureLenAt(startBeat) * 2));
    const oneMeasure = Math.min(4, Math.max(1, measureLenAt(startBeat)));

    const isGradual = mod.kind === 'rit' || mod.kind === 'rall' || mod.kind === 'calando' ||
      mod.kind === 'smorzando' || mod.kind === 'accel' || mod.kind === 'stringendo';
    const isStepSteady = mod.kind === 'meno' || mod.kind === 'piu';

    let defaultEnd: number;
    if (isStepSteady) {
      defaultEnd = pieceEnd;
    } else if (mod.kind === 'ritenuto') {
      defaultEnd = startBeat + oneMeasure;
    } else if (mod.kind !== 'accel' && mod.kind !== 'stringendo' && pieceEnd > startBeat && pieceEnd - startBeat <= twoMeasures + 2) {
      defaultEnd = pieceEnd;
    } else {
      defaultEnd = startBeat + twoMeasures;
    }

    let endBeat = defaultEnd;
    if (nextMod) endBeat = Math.min(endBeat, nextMod.beat);
    if (nextBase) endBeat = Math.min(endBeat, nextBase.beat);
    endBeat = Math.max(startBeat + 0.25, endBeat);

    // Drop any intermediate base-tempo points that fall strictly inside the modifier span.
    for (let j = curve.length - 1; j >= 0; j--) {
      if (curve[j].beat > startBeat + 1e-6 && curve[j].beat < endBeat - 1e-6) {
        curve.splice(j, 1);
      }
    }

    const baseBpm = bpmAtBeat(normalized, startBeat);
    const targetFactor = modifierTargetFactor(mod);

    if (isGradual) {
      const steps = 7;
      for (let step = 0; step < steps; step++) {
        const beat = startBeat + ((endBeat - startBeat) * step) / steps;
        const t = (step + 0.65) / steps;
        const factor = 1 + (targetFactor - 1) * Math.pow(t, 1.35);
        curve.push({ beat, bpm: baseBpm * factor });
      }
    } else {
      curve.push({ beat: startBeat, bpm: baseBpm * targetFactor });
    }

    const hitsAtempoOrBase = (nextMod?.kind === 'atempo' && Math.abs(nextMod.beat - endBeat) <= 1e-6) ||
      (nextBase && Math.abs(nextBase.beat - endBeat) <= 1e-6);
    const endsAtPieceEnd = endBeat >= pieceEnd - 0.01;
    if (!hitsAtempoOrBase && !endsAtPieceEnd && !nextMod) {
      curve.push({ beat: endBeat, bpm: bpmAtBeat(normalized, endBeat) });
    }
  }

  let result = dedupeTempoCurve(curve);

  if (expression.fermatas.length) {
    const sortedFermatas = expression.fermatas
      .filter((f) => Number.isFinite(f.beat) && Number.isFinite(f.duration) && f.duration > 0)
      .slice()
      .sort((a, b) => a.beat - b.beat);
    for (const fermata of sortedFermatas) {
      const fStart = Math.max(0, fermata.beat);
      const fEnd = fStart + Math.max(0.05, fermata.duration);
      const before = result;
      const startBpm = bpmAtBeat(before, fStart);
      const endBpm = bpmAtBeat(before, fEnd);
      const nextCurve: { beat: number; bpm: number }[] = [];
      for (const pt of before) {
        if (pt.beat < fStart - 1e-6 || pt.beat > fEnd + 1e-6) {
          nextCurve.push(pt);
        } else if (pt.beat >= fStart - 1e-6 && pt.beat < fEnd - 1e-6) {
          nextCurve.push({ beat: pt.beat, bpm: pt.bpm / 1.75 });
        }
      }
      nextCurve.push({ beat: fStart, bpm: startBpm / 1.75 });
      nextCurve.push({ beat: fEnd, bpm: endBpm });
      result = dedupeTempoCurve(nextCurve);
    }
  }

  return result;
}

function buildBeatToSec(tempos: readonly { beat: number; bpm: number }[]): (beat: number) => number {
  const list = normalizeTempos(tempos);
  const times = new Array<number>(list.length);
  let sec = 0;
  let last = 0;
  let bpm = list[0].bpm;
  for (let i = 0; i < list.length; i++) {
    sec += ((list[i].beat - last) * 60) / bpm;
    times[i] = sec;
    last = list[i].beat;
    bpm = list[i].bpm;
  }
  return (beat: number) => {
    if (beat < list[0].beat) return (beat * 60) / list[0].bpm;
    let lo = 0;
    let hi = list.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (list[mid].beat <= beat) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return times[idx] + ((beat - list[idx].beat) * 60) / list[idx].bpm;
  };
}

function diatonicStep(midi: number, dir: 1 | -1, key: { root: number; minor: boolean } | undefined): number {
  const root = key ? ((key.root % 12) + 12) % 12 : 0;
  const intervals = key?.minor ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
  const scaleSet = new Set(intervals.map((iv) => (root + iv) % 12));
  const pc = ((midi % 12) + 12) % 12;
  for (let d = 1; d <= 2; d++) {
    const neighborPc = (((pc + dir * d) % 12) + 12) % 12;
    if (scaleSet.has(neighborPc)) return d;
  }
  return dir === 1 ? 2 : 1;
}

function buildOrnamentEvents(
  kind: ScoreOrnamentKind,
  midi: number,
  noteSec: number,
  vel: number,
  key: { root: number; minor: boolean } | undefined,
): ExpressiveOrnamentEvent[] | undefined {
  const upper = midi + diatonicStep(midi, 1, key);
  const lower = midi - diatonicStep(midi, -1, key);

  if (kind === 'trill') {
    if (noteSec < 0.18) return undefined;
    const rawSteps = clamp(Math.floor(noteSec / 0.08), 4, 24);
    const steps = rawSteps % 2 === 0 ? rawSteps + 1 : rawSteps;
    const stepDur = clamp(noteSec / steps, 0.04, 0.095);
    const events: ExpressiveOrnamentEvent[] = [];
    for (let i = 0; i < steps - 1; i++) {
      const isPrincipal = i % 2 === 0;
      const offsetSec = i * stepDur;
      if (offsetSec + 0.045 >= noteSec) break;
      const stepVel = i === 0 ? vel : clamp(Math.round(vel + (isPrincipal ? -2 : -6)), 18, 125);
      events.push({
        midi: isPrincipal ? midi : upper,
        offsetSec,
        durationSec: stepDur,
        vel: stepVel,
      });
    }
    const lastOffset = events.length ? events[events.length - 1].offsetSec + events[events.length - 1].durationSec : 0;
    events.push({
      midi,
      offsetSec: lastOffset,
      durationSec: Math.max(0.05, noteSec - lastOffset),
      vel: clamp(Math.round(vel - 1), 18, 125),
    });
    return events.length >= 3 ? events : undefined;
  }

  if (kind === 'inverted-mordent' || kind === 'mordent') {
    if (noteSec < 0.14) return undefined;
    const neighbor = kind === 'inverted-mordent' ? upper : lower;
    const s = Math.min(0.055, noteSec * 0.24);
    return [
      { midi, offsetSec: 0, durationSec: s, vel },
      { midi: neighbor, offsetSec: s, durationSec: s, vel: clamp(Math.round(vel - 6), 18, 125) },
      { midi, offsetSec: s * 2, durationSec: Math.max(0.05, noteSec - s * 2), vel },
    ];
  }

  if (kind === 'turn') {
    if (noteSec < 0.22) return undefined;
    const s = Math.min(0.085, (noteSec * 0.55) / 3);
    return [
      { midi: upper, offsetSec: 0, durationSec: s, vel: clamp(Math.round(vel - 4), 18, 125) },
      { midi, offsetSec: s, durationSec: s, vel },
      { midi: lower, offsetSec: s * 2, durationSec: s, vel: clamp(Math.round(vel - 6), 18, 125) },
      { midi, offsetSec: s * 3, durationSec: Math.max(0.05, noteSec - s * 3), vel },
    ];
  }

  return undefined;
}

export function buildScoreExpression(input: ScoreExpressionInput): ExpressiveNotePlan[] {
  const { notes } = input;
  if (!notes.length) return [];

  if (!input.enabled) {
    return notes.map((n) => ({
      vel: n.vel,
      onsetShiftSec: 0,
      durationScale: 1,
      legatoOverlapSec: 0,
      restrikeGapSec: 0,
      warm: !!n.warm,
      accent: !!(n.art?.accent || n.art?.strongAccent),
      hold: isPedalHeld(n),
      graceStepSec: 0.07,
    }));
  }

  // 1. Detect already-expressive MIDI vs flat/quantized MIDI.
  let expressionStrength = 1;
  if (input.sourceKind === 'midi' && notes.length > 1) {
    const meanVel = notes.reduce((sum, n) => sum + n.vel, 0) / notes.length;
    const variance = notes.reduce((sum, n) => sum + (n.vel - meanVel) ** 2, 0) / notes.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev <= 5) expressionStrength = 1;
    else if (stdDev >= 12) expressionStrength = 0.2;
    else expressionStrength = 1 - ((stdDev - 5) / 7) * 0.8;
  }

  const tempos = normalizeTempos(input.tempos);
  const beatToSec = buildBeatToSec(tempos);
  const measures: readonly ScoreMeasure[] = input.measures.length
    ? input.measures
    : [{ number: '1', start: 0, end: Math.max(4, ...notes.map((n) => n.end)), num: 4, den: 4 }];
  const keys = (input.keys ?? []).slice().sort((a, b) => a.beat - b.beat);

  const measureAt = (beat: number): ScoreMeasure => {
    let lo = 0;
    let hi = measures.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (measures[mid].start <= beat + 1e-6) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return measures[idx] ?? measures[0];
  };

  const keyAt = (beat: number): { root: number; minor: boolean } | undefined => {
    let active = keys[0];
    for (const k of keys) {
      if (k.beat <= beat + 1e-6) active = k;
      else break;
    }
    return active;
  };

  // 2. Order notes and group into onset clusters.
  const order = notes
    .map((_, i) => i)
    .sort((a, b) => notes[a].start - notes[b].start || notes[a].midi - notes[b].midi);

  const hasRhGlobal = notes.some((n) => anHandOf(n) === 'rh');
  const clusters: number[][] = [];
  for (const idx of order) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(notes[idx].start - notes[last[0]].start) <= 0.015) {
      last.push(idx);
    } else {
      clusters.push([idx]);
    }
  }

  // 3. Classify voice roles (melody, bass, inner) per onset cluster.
  const roles = new Array<VoiceRole>(notes.length).fill('inner');

  clusters.forEach((cluster) => {
    const rhIndices: number[] = [];
    const lhIndices: number[] = [];
    let minMidi = Infinity;
    let maxMidi = -Infinity;
    let maxRhMidi = -Infinity;
    let minLhMidi = Infinity;

    for (const idx of cluster) {
      const n = notes[idx];
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
      if (anHandOf(n) === 'rh') {
        rhIndices.push(idx);
        if (n.midi > maxRhMidi) maxRhMidi = n.midi;
      } else {
        lhIndices.push(idx);
        if (n.midi < minLhMidi) minLhMidi = n.midi;
      }
    }

    for (const idx of cluster) {
      const n = notes[idx];
      const hand = anHandOf(n);
      if (rhIndices.length > 0) {
        if (hand === 'rh' && n.midi === maxRhMidi) {
          roles[idx] = 'melody';
        } else if (
          (lhIndices.length > 0 && hand === 'lh' && n.midi === minLhMidi) ||
          (lhIndices.length === 0 && maxMidi - minMidi >= 7 && n.midi === minMidi)
        ) {
          roles[idx] = 'bass';
        } else {
          roles[idx] = 'inner';
        }
      } else {
        // LH-only onset
        if (cluster.length === 1 && (!hasRhGlobal || n.midi >= 58)) {
          roles[idx] = 'melody';
        } else if (n.midi === maxMidi && (!hasRhGlobal || maxMidi >= 58)) {
          roles[idx] = 'melody';
        } else if (n.midi === minMidi) {
          roles[idx] = 'bass';
        } else {
          roles[idx] = 'inner';
        }
      }
    }
  });

  // 4. Identify slurs and re-strike gaps.
  const inSlur = new Set<number>();
  const slurStart = new Set<number>();
  const slurEnd = new Set<number>();

  if (input.sourceKind === 'xml' && input.expression?.slurs.length) {
    for (const slur of input.expression.slurs) {
      slurStart.add(slur.startNoteIndex);
      slurEnd.add(slur.endNoteIndex);
      const endBeat = notes[slur.endNoteIndex]?.start ?? slur.endBeat;
      for (const idx of order) {
        const n = notes[idx];
        if ((n.part ?? 0) !== slur.part) continue;
        if ((n.staff ?? 1) !== slur.staff && idx !== slur.startNoteIndex && idx !== slur.endNoteIndex) continue;
        if ((n.voice ?? 1) !== slur.voice && idx !== slur.startNoteIndex && idx !== slur.endNoteIndex) continue;
        if (n.start >= slur.startBeat - 0.001 && n.start <= endBeat + 0.001) {
          if (Math.abs(n.start - endBeat) <= 0.001) {
            if (idx === slur.endNoteIndex || (n.voice ?? 1) === slur.voice) slurEnd.add(idx);
          } else {
            inSlur.add(idx);
          }
        }
      }
    }
  }

  // Track next occurrence of same pitch in the same part for clean re-strikes.
  const nextSameStart = new Array<number | undefined>(notes.length).fill(undefined);
  const lastPitchStart = new Map<string, number>();
  for (let oi = order.length - 1; oi >= 0; oi--) {
    const idx = order[oi];
    const n = notes[idx];
    const key = `${n.part ?? 0}:${n.midi}`;
    const nextStart = lastPitchStart.get(key);
    if (nextStart !== undefined && nextStart > n.start + 0.001) {
      nextSameStart[idx] = nextStart;
    }
    lastPitchStart.set(key, n.start);
  }

  // 5. Segment melody into phrases for arch dynamics and subtle agogic shaping.
  const melodyOrder = order.filter((idx) => roles[idx] === 'melody');
  const melodyPhrases: number[][] = [];
  let currentPhrase: number[] = [];
  let phraseStartBeat = 0;

  for (let mi = 0; mi < melodyOrder.length; mi++) {
    const idx = melodyOrder[mi];
    const n = notes[idx];
    if (!currentPhrase.length) {
      currentPhrase = [idx];
      phraseStartBeat = n.start;
      continue;
    }
    const prevIdx = currentPhrase[currentPhrase.length - 1];
    const prev = notes[prevIdx];
    const gap = n.start - prev.end;
    const prevDur = prev.end - prev.start;
    const crossedLongWindow = n.start - phraseStartBeat >= 16 && measureAt(n.start) !== measureAt(prev.start);
    const shouldSplit =
      (slurEnd.has(prevIdx) && !inSlur.has(idx)) ||
      (slurStart.has(idx) && !inSlur.has(prevIdx) && currentPhrase.length >= 2) ||
      gap >= 0.25 ||
      (prevDur >= 2 && currentPhrase.length >= 3) ||
      crossedLongWindow;

    if (shouldSplit) {
      melodyPhrases.push(currentPhrase);
      currentPhrase = [idx];
      phraseStartBeat = n.start;
    } else {
      currentPhrase.push(idx);
    }
  }
  if (currentPhrase.length) melodyPhrases.push(currentPhrase);

  const melodyMeta = new Map<number, { arch: number; contour: number; isApex: boolean; leapUp: number }>();
  for (const phrase of melodyPhrases) {
    const len = phrase.length;
    const meanMidi = phrase.reduce((sum, idx) => sum + notes[idx].midi, 0) / len;
    for (let k = 0; k < len; k++) {
      const idx = phrase[k];
      const n = notes[idx];
      const prevMidi = k > 0 ? notes[phrase[k - 1]].midi : n.midi;
      const leapUp = n.midi - prevMidi;
      let arch = 0;
      let isApex = false;
      if (len >= 3) {
        const pos = k / (len - 1);
        arch = pos <= 0.6
          ? -4 + 9 * Math.sin((pos / 0.6) * (Math.PI / 2))
          : 5 - 11 * ((pos - 0.6) / 0.4);
        isApex = Math.abs(pos - 0.6) <= 0.16 && len >= 4;
      }
      const contour = len >= 3 ? clamp((n.midi - meanMidi) * 0.4, -4, 5) : 0;
      melodyMeta.set(idx, { arch, contour, isApex, leapUp });
    }
  }

  // 6. Prepare text-dynamic ramps for XML scores.
  const textDynamicSpans: { part: number; staff: number; start: number; end: number; delta: number }[] = [];
  if (input.sourceKind === 'xml' && input.expression?.textDynamics.length) {
    const sortedDyn = input.expression.textDynamics.slice().sort((a, b) => a.beat - b.beat);
    for (let i = 0; i < sortedDyn.length; i++) {
      const td = sortedDyn[i];
      const nextSamePartDyn = sortedDyn.slice(i + 1).find(
        (d) => d.part === td.part && (d.staff === 0 || td.staff === 0 || d.staff === td.staff) && d.beat > td.beat + 0.05,
      );
      let nextExplicitBeat = Infinity;
      for (const idx of order) {
        const n = notes[idx];
        if ((n.part ?? 0) !== td.part) continue;
        if (td.staff !== 0 && (n.staff ?? 1) !== td.staff) continue;
        if (n.start > td.beat + 0.05 && (n.explicitVel != null || n.dynamicHit != null)) {
          nextExplicitBeat = n.start;
          break;
        }
      }
      const spanEnd = Math.min(
        td.beat + 6,
        nextSamePartDyn?.beat ?? Infinity,
        nextExplicitBeat,
      );
      const delta = td.kind === 'cresc' ? 14 : td.kind === 'dim' ? -14 : -20;
      textDynamicSpans.push({
        part: td.part,
        staff: td.staff,
        start: td.beat,
        end: Math.max(td.beat + 0.25, spanEnd),
        delta,
      });
    }
  }

  // 7. Compute velocities, warmth, accent, articulation, and ornaments per note.
  const plans = new Array<ExpressiveNotePlan>(notes.length);

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const role = roles[i];
    const hand = anHandOf(n);
    const hold = isPedalHeld(n);
    const localBpm = bpmAtBeat(tempos, n.start);
    let vel = n.vel;

    // Apply text dynamics ramp if applicable.
    if (textDynamicSpans.length && n.explicitVel == null && n.dynamicHit == null) {
      let appliedSpan: (typeof textDynamicSpans)[number] | undefined;
      for (const span of textDynamicSpans) {
        if ((n.part ?? 0) !== span.part) continue;
        if (span.staff !== 0 && (n.staff ?? 1) !== span.staff) continue;
        if (n.start >= span.start - 0.001 && n.start <= span.end + 0.001) {
          appliedSpan = span;
        }
      }
      if (appliedSpan) {
        const f = clamp((n.start - appliedSpan.start) / (appliedSpan.end - appliedSpan.start), 0, 1);
        vel += appliedSpan.delta * f;
      }
    }

    // Voicing separation (calibrated not to double-count MusicXML's base +7/-8).
    const voicingDelta = input.sourceKind === 'xml'
      ? (role === 'melody' ? 4 : role === 'bass' ? -1 : hand === 'lh' || n.staff === 2 ? -6 : -5)
      : (role === 'melody' ? 9 : role === 'bass' ? -3 : hand === 'lh' || n.staff === 2 ? -13 : -10);
    vel += voicingDelta * expressionStrength;

    // Metric hierarchy.
    const m = measureAt(n.start);
    const unit = anBeatUnit(m);
    const beatInMeasure = (n.start - m.start) / unit;
    const isDownbeat = Math.abs(beatInMeasure) < 0.02;
    const isSecondaryStrong = !isDownbeat && (
      (m.num === 4 && Math.abs(beatInMeasure - 2) < 0.02) ||
      (m.den === 8 && m.num === 6 && Math.abs(beatInMeasure - 1) < 0.02)
    );
    const isSubBeat = Math.abs(beatInMeasure - Math.round(beatInMeasure)) > 0.02;
    const metricDelta = isDownbeat
      ? (role === 'melody' ? 4 : role === 'bass' ? 3 : 1)
      : isSecondaryStrong
        ? 1.5
        : isSubBeat
          ? (role === 'melody' ? -3 : -4.5)
          : 0;
    vel += metricDelta * expressionStrength;

    // Melody phrasing & contour.
    const meta = melodyMeta.get(i);
    if (meta) {
      vel += (meta.arch + meta.contour) * expressionStrength;
    }

    // Slur-end taper.
    if (slurEnd.has(i)) {
      vel -= 6 * expressionStrength;
    }

    if (n.art?.tenuto) vel += 3;

    // Subtle deterministic velocity nuance (skipped for already human-played MIDI).
    if (!(input.sourceKind === 'midi' && expressionStrength < 0.3)) {
      vel += hashSigned(i, n.midi, Math.round(n.start * 16)) * 2.5 * expressionStrength;
    }

    const finalVel = Math.round(clamp(vel, 18, n.vel > 125 ? 127 : 125));
    const warm = !!n.warm || finalVel <= 56 || (role === 'inner' && finalVel <= 68);
    const accent = !!(n.art?.accent || n.art?.strongAccent || n.dynamicHit != null || finalVel >= 104);

    // Articulation & legato durations.
    let durationScale = 1;
    let legatoOverlapSec = 0;
    let restrikeGapSec = 0;
    const staccato = !!(n.art?.staccato || n.art?.staccatissimo);
    const tenuto = !!n.art?.tenuto;

    const hasTiedGrace = !!n.graces?.some((g) => g.tiedToPrincipal);
    const beatDur = n.end - n.start;

    if (!hold && !staccato && !hasTiedGrace) {
      const nextSame = nextSameStart[i];
      const isImmediateRestrike = nextSame !== undefined && nextSame - n.end < 0.04 && nextSame > n.end - 0.02;
      if (isImmediateRestrike) {
        restrikeGapSec = 0.022;
      } else if (slurEnd.has(i)) {
        durationScale = 0.88;
      } else if (inSlur.has(i)) {
        durationScale = 1;
        legatoOverlapSec = 0.032;
      } else if (tenuto) {
        durationScale = 1.04;
        legatoOverlapSec = 0.015;
      } else if (beatDur >= 2) {
        durationScale = 1;
      } else if (localBpm <= 110) {
        durationScale = 0.98;
        legatoOverlapSec = 0.012;
      } else {
        durationScale = 0.94;
      }
    }

    const noteSec = Math.max(0.05, beatToSec(n.end) - beatToSec(n.start));
    const ornamentEvents = n.ornament
      ? buildOrnamentEvents(n.ornament, n.midi, noteSec, finalVel, keyAt(n.start))
      : undefined;
    const graceStepSec = clamp(0.055 * (100 / Math.max(24, localBpm)), 0.038, 0.085);

    plans[i] = {
      vel: finalVel,
      onsetShiftSec: 0,
      durationScale,
      legatoOverlapSec,
      restrikeGapSec,
      warm,
      accent,
      hold,
      ...(ornamentEvents ? { ornamentEvents } : {}),
      graceStepSec,
    };
  }

  // 8. Micro-timing: chord spread + agogic rubato + correlated humanization for imported scores.
  if (!input.strictTiming && input.sourceKind !== 'example') {
    clusters.forEach((cluster, clusterIdx) => {
      const clusterBeat = notes[cluster[0]].start;
      const atZero = clusterBeat < 0.001;

      const hasAgogicCue = !atZero && cluster.some((idx) => {
        const m = melodyMeta.get(idx);
        return !!m?.isApex || (m?.leapUp ?? 0) >= 7 || !!notes[idx].art?.tenuto;
      });
      const agogic = hasAgogicCue ? 0.007 * expressionStrength : 0;
      const humanJitter = atZero || (input.sourceKind === 'midi' && expressionStrength < 0.3)
        ? 0
        : hashSigned(clusterIdx, 31, Math.round(clusterBeat * 8)) * 0.0035 * expressionStrength;
      const clusterShift = agogic + humanJitter;

      const nonRolled = cluster
        .filter((idx) => !(notes[idx].roll && notes[idx].roll > 0))
        .sort((a, b) => notes[a].midi - notes[b].midi);

      const distinctChannels = new Set(nonRolled.map((idx) => notes[idx].channel ?? 0));
      const skipCrossChannel = input.sourceKind === 'midi' && distinctChannels.size > 1 && nonRolled.length <= 2;

      const spreadByNote = new Map<number, number>();
      if (nonRolled.length >= 2 && !skipCrossChannel) {
        if (input.sourceKind === 'midi' && distinctChannels.size > 1) {
          // Group per MIDI channel so independent channels do not falsely roll against each other.
          for (const ch of distinctChannels) {
            const sub = nonRolled.filter((idx) => (notes[idx].channel ?? 0) === ch);
            if (sub.length < 2) continue;
            const step = sub.some((idx) => plans[idx].warm) ? 0.006 : 0.0035;
            sub.forEach((idx, pos) => {
              spreadByNote.set(idx, Math.min(0.014, pos * step));
            });
          }
        } else {
          const step = nonRolled.some((idx) => plans[idx].warm) ? 0.006 : 0.0035;
          nonRolled.forEach((idx, pos) => {
            spreadByNote.set(idx, Math.min(0.014, pos * step));
          });
        }
      }

      for (const idx of cluster) {
        const spread = spreadByNote.get(idx) ?? 0;
        const rawShift = (atZero ? 0 : clusterShift) + spread;
        plans[idx].onsetShiftSec = clamp(rawShift, -0.012, 0.018);
      }
    });
  }

  return plans;
}
