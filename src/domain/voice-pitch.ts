const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1300;

/** Return the fundamental in Hz, or -1 for silence or a pitch outside the voice range. */
export function detectVoicePitch(samples: Float32Array, sampleRate: number): number {
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate) || samples.length < 16) return -1;
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  if (Math.sqrt(energy / samples.length) < 0.012) return -1;

  let first = 0, last = samples.length - 1;
  for (let i = 0; i < samples.length / 2; i++) {
    if (Math.abs(samples[i]) < 0.2) { first = i; break; }
  }
  for (let i = samples.length - 1; i > samples.length / 2; i--) {
    if (Math.abs(samples[i]) < 0.2) { last = i; break; }
  }
  const window = samples.subarray(first, last);
  if (window.length < 16) return -1;

  const maxLag = Math.min(window.length - 2, Math.ceil(sampleRate / MIN_FREQUENCY));
  const correlation = new Float32Array(maxLag + 2);
  for (let lag = 0; lag <= maxLag + 1; lag++) {
    let sum = 0;
    for (let i = 0; i < window.length - lag; i++) sum += window[i] * window[i + lag];
    correlation[lag] = sum;
  }

  // Keep the short-lag peaks for the range check. Otherwise a high fundamental
  // can appear to be in range when the search selects one of its multiples.
  let trough = 0;
  while (trough < maxLag && correlation[trough] > correlation[trough + 1]) trough++;
  let peak = -1;
  for (let lag = Math.max(1, trough); lag <= maxLag; lag++) {
    const value = correlation[lag];
    if (value > 0 && value >= correlation[lag - 1] && value > correlation[lag + 1] && (peak < 0 || value > correlation[peak])) peak = lag;
  }
  if (peak < 0) return -1;

  const left = correlation[peak - 1], center = correlation[peak], right = correlation[peak + 1];
  const curvature = left + right - 2 * center;
  const period = curvature ? peak - (right - left) / (2 * curvature) : peak;
  const frequency = sampleRate / period;
  return frequency > MIN_FREQUENCY && frequency < MAX_FREQUENCY ? frequency : -1;
}
