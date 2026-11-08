export interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export async function fetchPianoAudio(url: string, context: AudioDecoder): Promise<AudioBuffer> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Piano sample returned ${response.status}: ${url}`);
  const audio = await context.decodeAudioData(await response.arrayBuffer());
  if (!audio.length || !Number.isFinite(audio.duration)) throw new Error(`Invalid piano recording: ${url}`);
  return audio;
}

export function nearestPianoKey(midi: number, keys: readonly number[]): number {
  if (!keys.length) throw new Error('The piano bank has no keys');
  return keys.reduce((best, key) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best, keys[0]);
}
