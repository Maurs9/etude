import {
  DEFAULT_AGGREGATION,
  DIFFICULTY_AXES,
  aggregateDifficultyStarsDetailed,
  type DifficultyAggregationConfig,
  type DifficultyAxes,
  type TempoSource,
} from './score-difficulty.js';

/** Portable local calibration for performance difficulty profiles. Contains no score files or titles. */
export interface DifficultyCalibrationV1 {
  version: 1;
  cutoffs: readonly number[];
  /** Verified starting tempos for originals without a written starting mark, keyed by SHA-256. */
  startingTempos?: Readonly<Record<string, number>>;
}

export interface DifficultyCalibrationV2 {
  version: 2;
  profileId: string;
  aggregation: DifficultyAggregationConfig;
  /** Verified starting tempos for originals without a written starting mark, keyed by SHA-256. */
  startingTempos?: Readonly<Record<string, number>>;
}

export type DifficultyCalibration = DifficultyCalibrationV1 | DifficultyCalibrationV2;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(text: string): string {
  const input = new TextEncoder().encode(text);
  const bitLen = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLen >>> 0, false);

  const hash = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, word => word.toString(16).padStart(8, '0')).join('');
}

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function canonicalAggregation(config: DifficultyAggregationConfig): DifficultyAggregationConfig {
  const enduranceScale = round6(config.enduranceScale ?? 1);
  if (config.mode === 'axis') {
    const rawWeights = config.axisWeights ?? { motor: 0.28, rhythm: 0.23, bimanual: 0.2, texture: 0.19, reading: 0.1 };
    return {
      mode: 'axis',
      axisWeights: {
        motor: round6(rawWeights.motor),
        rhythm: round6(rawWeights.rhythm),
        bimanual: round6(rawWeights.bimanual),
        texture: round6(rawWeights.texture),
        reading: round6(rawWeights.reading),
      },
      alphaWeak: round6(config.alphaWeak ?? 0.3),
      enduranceScale,
    };
  }
  const rawOrder = config.orderWeights ?? DEFAULT_AGGREGATION.orderWeights ?? [0.45, 0.30, 0.25 / 3, 0.25 / 3, 0.25 / 3];
  return {
    mode: 'order',
    orderWeights: [
      round6(rawOrder[0]),
      round6(rawOrder[1]),
      round6(rawOrder[2]),
      round6(rawOrder[3]),
      round6(rawOrder[4]),
    ],
    weakestLinkDelta: round6(config.weakestLinkDelta ?? 1),
    enduranceScale,
  };
}

export function computeCalibrationProfileId(aggregation: DifficultyAggregationConfig): string {
  return sha256Hex(JSON.stringify(canonicalAggregation(aggregation))).slice(0, 16);
}

function readStartingTempos(raw: Record<string, unknown>): { ok: true; value?: Readonly<Record<string, number>> } | { ok: false } {
  if (!('startingTempos' in raw) || raw.startingTempos === undefined) return { ok: true };
  const tempos = raw.startingTempos;
  if (!tempos || typeof tempos !== 'object' || Array.isArray(tempos)) return { ok: false };
  const entries: [string, unknown][] = Object.entries(tempos);
  if (entries.length > 1000) return { ok: false };
  const startingTempos: Record<string, number> = {};
  for (const [id, bpm] of entries) {
    if (!/^[a-f0-9]{64}$/u.test(id) || typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 20 || bpm > 400) return { ok: false };
    startingTempos[id] = bpm;
  }
  return { ok: true, value: startingTempos };
}

function readAggregationConfig(raw: unknown): DifficultyAggregationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const enduranceScale = obj.enduranceScale === undefined ? 1 : obj.enduranceScale;
  if (typeof enduranceScale !== 'number' || !Number.isFinite(enduranceScale) || enduranceScale < 0 || enduranceScale > 2) return null;

  if (obj.mode === 'order') {
    if (!Array.isArray(obj.orderWeights) || obj.orderWeights.length !== 5) return null;
    const weights: number[] = [];
    for (const entry of obj.orderWeights) {
      if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0) return null;
      weights.push(entry);
    }
    const sum = weights.reduce((acc, w) => acc + w, 0);
    if (Math.abs(sum - 1) > 1e-4) return null;
    const weakestLinkDelta = obj.weakestLinkDelta === undefined ? 1 : obj.weakestLinkDelta;
    if (typeof weakestLinkDelta !== 'number' || !Number.isFinite(weakestLinkDelta) || weakestLinkDelta < 0 || weakestLinkDelta > 4) return null;
    return canonicalAggregation({
      mode: 'order',
      orderWeights: [weights[0], weights[1], weights[2], weights[3], weights[4]],
      weakestLinkDelta,
      enduranceScale,
    });
  }

  if (obj.mode === 'axis') {
    const rawAxes = obj.axisWeights;
    if (!rawAxes || typeof rawAxes !== 'object' || Array.isArray(rawAxes)) return null;
    const axisObj = rawAxes as Record<string, unknown>;
    const values: Record<string, number> = {};
    let sum = 0;
    for (const axis of DIFFICULTY_AXES) {
      const val = axisObj[axis];
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return null;
      values[axis] = val;
      sum += val;
    }
    if (Math.abs(sum - 1) > 1e-4) return null;
    const alphaWeak = obj.alphaWeak === undefined ? 0.3 : obj.alphaWeak;
    if (typeof alphaWeak !== 'number' || !Number.isFinite(alphaWeak) || alphaWeak < 0 || alphaWeak > 1) return null;
    return canonicalAggregation({
      mode: 'axis',
      axisWeights: {
        motor: values.motor,
        rhythm: values.rhythm,
        bimanual: values.bimanual,
        texture: values.texture,
        reading: values.reading,
      },
      alphaWeak,
      enduranceScale,
    });
  }

  return null;
}

export function readDifficultyCalibration(raw: unknown): DifficultyCalibration | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const temposResult = readStartingTempos(obj);
  if (!temposResult.ok) return null;

  if (obj.version === 1) {
    if (!Array.isArray(obj.cutoffs)) return null;
    const values: readonly unknown[] = obj.cutoffs;
    let previous = 0;
    const cutoffs: number[] = [];
    for (const value of values) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= previous || value >= 100) return null;
      cutoffs.push(value);
      previous = value;
    }
    if (cutoffs.length !== 5) return null;
    return {
      version: 1,
      cutoffs,
      ...(temposResult.value ? { startingTempos: temposResult.value } : {}),
    };
  }

  if (obj.version === 2) {
    const aggregation = readAggregationConfig(obj.aggregation);
    if (!aggregation) return null;
    const profileId = computeCalibrationProfileId(aggregation);
    if ('profileId' in obj && obj.profileId !== undefined) {
      if (typeof obj.profileId !== 'string' || obj.profileId !== profileId) return null;
    }
    return {
      version: 2,
      profileId,
      aggregation,
      ...(temposResult.value ? { startingTempos: temposResult.value } : {}),
    };
  }

  return null;
}

export function suggestedDifficulty(score: number, profile: DifficultyCalibrationV1) {
  return 1 + profile.cutoffs.filter(cutoff => score >= cutoff).length;
}

export interface DifficultyReference {
  score: number;
  level: number;
  split: 'fit' | 'check';
  /** Same work, or related arrangements, must all be in one split. */
  group: string;
}

function median(values: number[]) {
  values.sort((a, b) => a - b);
  const n = values.length;
  return (values[n >> 1] + values[(n - 1) >> 1]) / 2;
}

export function calibrateDifficulty(references: readonly DifficultyReference[]) {
  const fit = references.filter(item => item.split === 'fit'), check = references.filter(item => item.split === 'check');
  const groups = new Set(fit.map(item => item.group));
  if (check.some(item => groups.has(item.group))) throw new Error('A work group appears in both splits.');
  const levels = [1, 2, 3, 4, 5, 6];
  const fitByLevel = levels.map(level => fit.filter(item => item.level === level).map(item => item.score));
  if (fitByLevel.some(values => !values.length) || levels.some(level => !check.some(item => item.level === level))) {
    throw new Error('Each level needs reference scores in both splits.');
  }
  const centers = fitByLevel.map(median);
  if (centers.some((value, i) => i > 0 && value <= centers[i - 1])) {
    throw new Error('Fit medians do not increase by level. Revisit the rubric or the reference labels.');
  }
  const profile = readDifficultyCalibration({ version: 1, cutoffs: centers.slice(1).map((value, i) => (centers[i] + value) / 2) });
  if (!profile || profile.version !== 1) throw new Error('The fitted thresholds fall outside the performance scale.');
  const errors = check.map(item => Math.abs(item.level - suggestedDifficulty(item.score, profile)));
  const constant = median(fit.map(item => item.level));
  const mae = errors.reduce((sum, error) => sum + error, 0) / check.length;
  const baselineMae = check.reduce((sum, item) => sum + Math.abs(item.level - constant), 0) / check.length;
  return { profile, count: check.length, exact: errors.filter(error => error === 0).length, mae, baselineMae, improves: mae < baselineMae };
}

/** Stuart's Kendall tau-c rank correlation, accounting for rectangular contingency tables / ties. */
export function kendallTauC(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;
  const m = Math.min(new Set(x).size, new Set(y).size);
  if (m < 2) return 0;
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const prod = dx * dy;
      if (prod > 0) concordant++;
      else if (prod < 0) discordant++;
    }
  }
  return (2 * (concordant - discordant)) / (n * n * ((m - 1) / m));
}

function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let i = 0; i < indexed.length;) {
    let j = i + 1;
    while (j < indexed.length && indexed[j].value === indexed[i].value) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[indexed[k].index] = avgRank;
    i = j;
  }
  return ranks;
}

/** Spearman's rank correlation with average tie handling. */
export function spearmanRho(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;
  const rx = averageRanks(x);
  const ry = averageRanks(y);
  const meanX = rx.reduce((s, v) => s + v, 0) / n;
  const meanY = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i] - meanX;
    const dy = ry[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

export interface MajorInversionMetrics {
  rate: number;
  inversions: number;
  ties: number;
  pairs: number;
}

/** Measures inverted orderings among pairs whose ground-truth difference is at least `minGap`. */
export function majorInversionRate(predicted: readonly number[], truth: readonly number[], minGap = 2): MajorInversionMetrics {
  if (predicted.length !== truth.length || predicted.length < 2) return { rate: 0, inversions: 0, ties: 0, pairs: 0 };
  let pairs = 0, inversions = 0, ties = 0;
  for (let i = 0; i < truth.length; i++) {
    for (let j = i + 1; j < truth.length; j++) {
      const gt = truth[j] - truth[i];
      if (Math.abs(gt) < minGap) continue;
      pairs++;
      const pred = predicted[j] - predicted[i];
      if (gt * pred < 0) inversions++;
      else if (pred === 0) ties++;
    }
  }
  return { rate: pairs > 0 ? inversions / pairs : 0, inversions, ties, pairs };
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic work-grouped CV + hold-out split with zero group leakage. */
export function groupKFoldSplit<T extends { group: string }>(
  items: readonly T[],
  folds = 5,
  holdoutFraction = 0.2,
  seed = 42,
): { holdout: T[]; folds: { train: T[]; valid: T[] }[] } {
  if (!items.length) throw new Error('Cannot split an empty dataset.');
  const uniqueGroups = [...new Set(items.map(item => {
    const g = item.group.trim();
    if (!g) throw new Error('Every benchmark item must have a non-empty work group.');
    return g;
  }))].sort();
  if (uniqueGroups.length < 2) throw new Error('Group split requires at least 2 distinct work groups.');

  const rng = seededRng(seed);
  for (let i = uniqueGroups.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [uniqueGroups[i], uniqueGroups[j]] = [uniqueGroups[j], uniqueGroups[i]];
  }

  const holdoutGroupsCount = holdoutFraction > 0 && uniqueGroups.length >= 3
    ? Math.min(uniqueGroups.length - 2, Math.max(1, Math.round(uniqueGroups.length * holdoutFraction)))
    : 0;
  const holdoutSet = new Set(uniqueGroups.slice(0, holdoutGroupsCount));
  const cvGroups = uniqueGroups.slice(holdoutGroupsCount);
  const k = Math.max(2, Math.min(folds, cvGroups.length));
  const buckets: Set<string>[] = Array.from({ length: k }, () => new Set<string>());
  cvGroups.forEach((group, index) => {
    buckets[index % k].add(group);
  });

  const holdout = items.filter(item => holdoutSet.has(item.group.trim()));
  const cvItems = items.filter(item => !holdoutSet.has(item.group.trim()));
  const foldSplits = buckets.map(validSet => ({
    train: cvItems.filter(item => !validSet.has(item.group.trim())),
    valid: cvItems.filter(item => validSet.has(item.group.trim())),
  }));
  return { holdout, folds: foldSplits };
}

export interface RankBenchmarkItem {
  group: string;
  truth: number;
  v1Stars: number;
  v2Axes: DifficultyAxes;
  v2EnduranceRaw: number;
  v2Stars: number;
}

export interface RankMetrics {
  count: number;
  tauC: number;
  rho: number;
  majorInversion: MajorInversionMetrics;
}

function computeRankMetrics(predicted: readonly number[], truth: readonly number[]): RankMetrics {
  return {
    count: truth.length,
    tauC: Math.round(kendallTauC(predicted, truth) * 10000) / 10000,
    rho: Math.round(spearmanRho(predicted, truth) * 10000) / 10000,
    majorInversion: majorInversionRate(predicted, truth),
  };
}

function predictWithConfig(items: readonly RankBenchmarkItem[], config: DifficultyAggregationConfig): number[] {
  return items.map(item => aggregateDifficultyStarsDetailed(item.v2Axes, item.v2EnduranceRaw, config).difficultyStars);
}

function buildCandidates(mode: 'order' | 'axis'): DifficultyAggregationConfig[] {
  const candidates: DifficultyAggregationConfig[] = [];
  if (mode === 'order') {
    const orders: readonly (readonly [number, number, number, number, number])[] = [
      [0.45, 0.30, 0.25 / 3, 0.25 / 3, 0.25 / 3],
      [0.50, 0.30, 0.20 / 3, 0.20 / 3, 0.20 / 3],
      [0.40, 0.30, 0.15, 0.10, 0.05],
      [0.55, 0.25, 0.20 / 3, 0.20 / 3, 0.20 / 3],
      [0.35, 0.25, 0.20, 0.12, 0.08],
      [0.40, 0.25, 0.15, 0.10, 0.10],
    ];
    for (const orderWeights of orders) {
      for (const weakestLinkDelta of [0.8, 1.0, 1.2]) {
        for (const enduranceScale of [0.5, 1.0]) {
          candidates.push(canonicalAggregation({ mode: 'order', orderWeights, weakestLinkDelta, enduranceScale }));
        }
      }
    }
    return candidates;
  }

  const baseAxisWeights: DifficultyAxes[] = [
    { motor: 0.28, rhythm: 0.23, bimanual: 0.20, texture: 0.19, reading: 0.10 },
    { motor: 0.32, rhythm: 0.22, bimanual: 0.20, texture: 0.16, reading: 0.10 },
    { motor: 0.25, rhythm: 0.25, bimanual: 0.20, texture: 0.18, reading: 0.12 },
    { motor: 0.35, rhythm: 0.20, bimanual: 0.18, texture: 0.17, reading: 0.10 },
    { motor: 0.22, rhythm: 0.22, bimanual: 0.22, texture: 0.20, reading: 0.14 },
    { motor: 0.30, rhythm: 0.20, bimanual: 0.22, texture: 0.18, reading: 0.10 },
  ];
  for (const axisWeights of baseAxisWeights) {
    for (const alphaWeak of [0.2, 0.3, 0.4, 0.5]) {
      for (const enduranceScale of [0.5, 1.0]) {
        candidates.push(canonicalAggregation({ mode: 'axis', axisWeights, alphaWeak, enduranceScale }));
      }
    }
  }
  return candidates;
}

function l2DistanceToPrior(config: DifficultyAggregationConfig): number {
  if (config.mode === 'order') {
    const w = config.orderWeights ?? [0.45, 0.30, 0.25 / 3, 0.25 / 3, 0.25 / 3];
    const p = [0.45, 0.30, 0.25 / 3, 0.25 / 3, 0.25 / 3];
    return w.reduce((s, v, i) => s + (v - p[i]) ** 2, 0) + ((config.weakestLinkDelta ?? 1) - 1) ** 2;
  }
  const w = config.axisWeights ?? { motor: 0.28, rhythm: 0.23, bimanual: 0.2, texture: 0.19, reading: 0.1 };
  const p = { motor: 0.28, rhythm: 0.23, bimanual: 0.2, texture: 0.19, reading: 0.1 };
  return DIFFICULTY_AXES.reduce((s, axis) => s + (w[axis] - p[axis]) ** 2, 0) + ((config.alphaWeak ?? 0.3) - 0.3) ** 2;
}

/** Regularized non-negative simplex fit optimizing rank correlation and minimizing major inversions. */
export function fitAggregationWeights(
  train: readonly RankBenchmarkItem[],
  mode: 'order' | 'axis' = 'order',
): DifficultyAggregationConfig {
  const truths = train.map(item => item.truth);
  const candidates = buildCandidates(mode);
  let best = candidates[0];
  let bestObj = -Infinity;
  for (const candidate of candidates) {
    const preds = predictWithConfig(train, candidate);
    const tau = kendallTauC(preds, truths);
    const inv = majorInversionRate(preds, truths);
    const tiePenalty = inv.pairs > 0 ? (inv.ties * 0.25) / inv.pairs : 0;
    const obj = tau - 0.5 * inv.rate - 0.1 * tiePenalty - 0.02 * l2DistanceToPrior(candidate);
    if (obj > bestObj) {
      bestObj = obj;
      best = candidate;
    }
  }
  return best;
}

export interface RankBenchmarkEvaluation {
  fitMode: 'order' | 'axis' | 'default';
  folds: {
    fold: number;
    v1: RankMetrics;
    v2: RankMetrics;
    tauImproved: boolean;
    inversionsImproved: boolean;
  }[];
  meanV1: { tauC: number; rho: number; majorInversionRate: number };
  meanV2: { tauC: number; rho: number; majorInversionRate: number };
  holdout: { v1: RankMetrics; v2: RankMetrics } | null;
  foldsImprovedTau: number;
  foldsImprovedInversions: number;
  accepted: boolean;
  profile: DifficultyCalibrationV2;
}

export function evaluateRankBenchmark(
  items: readonly RankBenchmarkItem[],
  options: { folds?: number; holdoutFraction?: number; seed?: number; fitMode?: 'order' | 'axis' | 'default' } = {},
): RankBenchmarkEvaluation {
  const fitMode = options.fitMode ?? 'default';
  const split = groupKFoldSplit(items, options.folds ?? 5, options.holdoutFraction ?? 0.2, options.seed ?? 42);
  const foldResults = split.folds.map((fold, index) => {
    const truths = fold.valid.map(item => item.truth);
    const v1Preds = fold.valid.map(item => item.v1Stars);
    const config = fitMode === 'default' ? canonicalAggregation(DEFAULT_AGGREGATION) : fitAggregationWeights(fold.train, fitMode);
    const v2Preds = fitMode === 'default' ? fold.valid.map(item => item.v2Stars) : predictWithConfig(fold.valid, config);
    const v1 = computeRankMetrics(v1Preds, truths);
    const v2 = computeRankMetrics(v2Preds, truths);
    const tauImproved = v2.tauC > v1.tauC;
    const inversionsImproved = v1.majorInversion.rate > 0
      ? v2.majorInversion.rate < v1.majorInversion.rate
      : v2.majorInversion.rate === 0;
    return { fold: index + 1, v1, v2, tauImproved, inversionsImproved };
  });

  const avg = (values: number[]) => Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10000) / 10000;
  const meanV1 = {
    tauC: avg(foldResults.map(f => f.v1.tauC)),
    rho: avg(foldResults.map(f => f.v1.rho)),
    majorInversionRate: avg(foldResults.map(f => f.v1.majorInversion.rate)),
  };
  const meanV2 = {
    tauC: avg(foldResults.map(f => f.v2.tauC)),
    rho: avg(foldResults.map(f => f.v2.rho)),
    majorInversionRate: avg(foldResults.map(f => f.v2.majorInversion.rate)),
  };

  const cvItems = split.folds.flatMap(f => f.valid);
  const finalConfig = fitMode === 'default' ? canonicalAggregation(DEFAULT_AGGREGATION) : fitAggregationWeights(cvItems, fitMode);
  const holdoutTruths = split.holdout.map(item => item.truth);
  const holdout = split.holdout.length
    ? {
        v1: computeRankMetrics(split.holdout.map(item => item.v1Stars), holdoutTruths),
        v2: computeRankMetrics(
          fitMode === 'default' ? split.holdout.map(item => item.v2Stars) : predictWithConfig(split.holdout, finalConfig),
          holdoutTruths,
        ),
      }
    : null;

  const foldsImprovedTau = foldResults.filter(f => f.tauImproved).length;
  const foldsImprovedInversions = foldResults.filter(f => f.inversionsImproved).length;
  const requiredFolds = Math.max(1, Math.ceil(foldResults.length * 0.8));
  const holdoutOk = !holdout || (
    holdout.v2.tauC > holdout.v1.tauC &&
    holdout.v2.majorInversion.rate <= holdout.v1.majorInversion.rate
  );
  const accepted = foldsImprovedTau >= requiredFolds && foldsImprovedInversions >= requiredFolds && holdoutOk;
  const profile: DifficultyCalibrationV2 = {
    version: 2,
    profileId: computeCalibrationProfileId(finalConfig),
    aggregation: finalConfig,
  };

  return {
    fitMode,
    folds: foldResults,
    meanV1,
    meanV2,
    holdout,
    foldsImprovedTau,
    foldsImprovedInversions,
    accepted,
    profile,
  };
}

export interface LocalAuditItem {
  id: string;
  level?: number;
  stars: number;
  tempoSource: TempoSource;
  verifiedBpm?: number;
}

export interface LocalAuditReport {
  count: number;
  levelMedians: Record<number, { count: number; median: number }>;
  monotoneLevels: boolean;
  distribution: Record<'1.0-1.9' | '2.0-2.9' | '3.0-3.9' | '4.0-4.9' | '5.0', number>;
  fallbackIds: string[];
  topAnomalies: { id: string; level?: number; stars: number; levelMedian?: number; discrepancy: number; tempoSource: TempoSource }[];
  startingTempos: Record<string, number>;
}

/** Audits local library ratings without exposing titles or filenames in portable exports. */
export function auditLocalLibrary(items: readonly LocalAuditItem[]): LocalAuditReport {
  const levelMedians: Record<number, { count: number; median: number }> = {};
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const values = items.filter(item => item.level === level).map(item => item.stars);
    if (values.length) {
      levelMedians[level] = { count: values.length, median: Math.round(median([...values]) * 100) / 100 };
    }
  }
  const presentLevels = Object.keys(levelMedians).map(Number).sort((a, b) => a - b);
  let monotoneLevels = presentLevels.length > 0;
  for (let i = 1; i < presentLevels.length; i++) {
    if (levelMedians[presentLevels[i]].median <= levelMedians[presentLevels[i - 1]].median) {
      monotoneLevels = false;
      break;
    }
  }

  const distribution = { '1.0-1.9': 0, '2.0-2.9': 0, '3.0-3.9': 0, '4.0-4.9': 0, '5.0': 0 };
  const fallbackIds: string[] = [];
  const startingTempos: Record<string, number> = {};
  const anomalyCandidates: LocalAuditReport['topAnomalies'] = [];

  for (const item of items) {
    if (item.stars >= 5) distribution['5.0']++;
    else if (item.stars >= 4) distribution['4.0-4.9']++;
    else if (item.stars >= 3) distribution['3.0-3.9']++;
    else if (item.stars >= 2) distribution['2.0-2.9']++;
    else distribution['1.0-1.9']++;

    if (item.tempoSource === 'fallback') fallbackIds.push(item.id);
    if (/^[a-f0-9]{64}$/u.test(item.id) && item.verifiedBpm !== undefined && Number.isFinite(item.verifiedBpm) && item.verifiedBpm >= 20 && item.verifiedBpm <= 400) {
      startingTempos[item.id] = item.verifiedBpm;
    }

    const levelMedian = item.level !== undefined ? levelMedians[item.level]?.median : undefined;
    const discrepancy = levelMedian !== undefined
      ? Math.round(Math.abs(item.stars - levelMedian) * 100) / 100
      : item.tempoSource === 'fallback' ? 1 : 0;
    if (discrepancy > 0) {
      anomalyCandidates.push({
        id: item.id,
        ...(item.level !== undefined ? { level: item.level } : {}),
        stars: item.stars,
        ...(levelMedian !== undefined ? { levelMedian } : {}),
        discrepancy,
        tempoSource: item.tempoSource,
      });
    }
  }

  anomalyCandidates.sort((a, b) => b.discrepancy - a.discrepancy || a.id.localeCompare(b.id));
  return {
    count: items.length,
    levelMedians,
    monotoneLevels,
    distribution,
    fallbackIds,
    topAnomalies: anomalyCandidates.slice(0, 15),
    startingTempos,
  };
}
