const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1300;
const YIN_THRESHOLD = 0.15;
const YIN_FALLBACK_THRESHOLD = 0.22;

let yinBuffer = new Float32Array(1024);

/** Return the fundamental in Hz using YIN (CMNDF), or -1 for silence, noise, or out-of-range pitch. */
export function detectVoicePitch(samples: Float32Array, sampleRate: number): number {
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate) || samples.length < 32) return -1;

  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i];
  mean /= samples.length;

  let energy = 0;
  for (let i = 0; i < samples.length; i++) {
    const centered = samples[i] - mean;
    energy += centered * centered;
  }
  if (Math.sqrt(energy / samples.length) < 0.012) return -1;

  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQUENCY));
  const maxLag = Math.min(Math.floor(samples.length / 2) - 1, Math.ceil(sampleRate / MIN_FREQUENCY));
  const windowLength = samples.length - maxLag - 2;
  if (maxLag <= minLag + 1 || windowLength < 16) return -1;

  if (yinBuffer.length < maxLag + 2) yinBuffer = new Float32Array(maxLag + 2);
  yinBuffer[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let diff = 0;
    for (let i = 0; i < windowLength; i++) {
      const delta = samples[i] - samples[i + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    yinBuffer[tau] = runningSum > 0 ? (diff * tau) / runningSum : 1;
  }

  let tau = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (yinBuffer[lag] < YIN_THRESHOLD) {
      while (lag + 1 <= maxLag && yinBuffer[lag + 1] < yinBuffer[lag]) lag++;
      tau = lag;
      break;
    }
  }
  if (tau < 0) {
    let bestLag = minLag;
    let bestVal = yinBuffer[minLag];
    for (let lag = minLag + 1; lag <= maxLag; lag++) {
      if (yinBuffer[lag] < bestVal) {
        bestVal = yinBuffer[lag];
        bestLag = lag;
      }
    }
    if (bestVal >= YIN_FALLBACK_THRESHOLD) return -1;
    tau = bestLag;
  }

  const prev = yinBuffer[tau - 1];
  const curr = yinBuffer[tau];
  const next = yinBuffer[tau + 1];
  const curvature = prev + next - 2 * curr;
  const shift = curvature > 0 ? Math.max(-0.5, Math.min(0.5, (prev - next) / (2 * curvature))) : 0;
  const period = tau + shift;
  if (!(period > 0)) return -1;
  const frequency = sampleRate / period;
  return frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY ? frequency : -1;
}
