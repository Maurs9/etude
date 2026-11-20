/** Portable local calibration for the version 1 performance rubric. Contains no score files or titles. */
export interface DifficultyCalibration {
  version: 1;
  cutoffs: readonly number[];
}

export function readDifficultyCalibration(raw: unknown): DifficultyCalibration | null {
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 ||
      !('cutoffs' in raw) || !Array.isArray(raw.cutoffs)) return null;
  const values: readonly unknown[] = raw.cutoffs;
  let previous = 0;
  const cutoffs: number[] = [];
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= previous || value >= 100) return null;
    cutoffs.push(value);
    previous = value;
  }
  return cutoffs.length === 5 ? { version: 1, cutoffs } : null;
}

export function suggestedDifficulty(score: number, profile: DifficultyCalibration) {
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
  if (!profile) throw new Error('The fitted thresholds fall outside the performance scale.');
  const errors = check.map(item => Math.abs(item.level - suggestedDifficulty(item.score, profile)));
  const constant = median(fit.map(item => item.level));
  const mae = errors.reduce((sum, error) => sum + error, 0) / check.length;
  const baselineMae = check.reduce((sum, item) => sum + Math.abs(item.level - constant), 0) / check.length;
  return { profile, count: check.length, exact: errors.filter(error => error === 0).length, mae, baselineMae, improves: mae < baselineMae };
}
