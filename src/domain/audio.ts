export interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export type PianoContext = AudioDecoder & { state?: string; currentTime?: number };
export type PianoStatus = 'idle' | 'loading' | 'ready' | 'error';

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

export class PianoBank {
  readonly keys: number[];
  readonly urls: Readonly<Record<number, string>>;
  ctx: PianoContext | null = null;
  buffers = new Map<number, AudioBuffer>();
  pending = new Map<number, Promise<AudioBuffer>>();
  promise: Promise<boolean> | null = null;
  status: PianoStatus = 'idle';
  idle: number | ReturnType<typeof setTimeout> = 0;

  constructor(
    keys: readonly number[],
    urls: Readonly<Record<number, string>>,
    private readonly getContext: () => PianoContext | null,
    private readonly statusChanged: () => void = () => {},
  ) {
    this.keys = [...keys].sort((a, b) => a - b);
    this.urls = urls;
  }

  private notify(): void {
    this.statusChanged();
  }

  decode(key: number): Promise<AudioBuffer> {
    const context = this.getContext();
    if (!context) return Promise.reject(new Error('Audio is not ready'));
    if (this.ctx !== context) {
      this.ctx = context;
      this.buffers = new Map();
      this.pending = new Map();
      this.promise = null;
    }
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const url = this.urls[key];
    if (!url) return Promise.reject(new Error(`No piano recording for ${key}`));
    const job = fetchPianoAudio(url, context)
      .then(audio => {
        if (this.ctx === context) this.buffers.set(key, audio);
        return audio;
      })
      .finally(() => {
        if (this.ctx === context) this.pending.delete(key);
      });
    this.pending.set(key, job);
    return job;
  }

  fail(error: unknown): void {
    this.promise = null;
    this.status = 'idle';
    this.notify();
    console.error('Piano recordings could not be decoded', error);
  }

  ensure(midis: readonly number[], nearest = nearestPianoKey): Promise<boolean> {
    const context = this.getContext();
    if (!context) return Promise.resolve(false);
    const keys = [...new Set(midis.map(midi => nearest(midi, this.keys)))];
    return Promise.all(keys.map(key => this.decode(key))).then(
      () => true,
      error => {
        if (context === this.getContext() && this.ctx === context) this.fail(error);
        return false;
      },
    );
  }

  warmIdle(): void {
    const context = this.getContext();
    if (!context) return;
    const keys = this.keys
      .filter(key => !this.buffers.has(key))
      .sort((a, b) => Math.abs(a - 66) - Math.abs(b - 66));
    const step = (): void => {
      if (context !== this.getContext() || this.status === 'error') return;
      const key = keys.shift();
      if (key == null) return;
      this.decode(key).then(schedule, error => {
        if (context === this.getContext() && this.ctx === context) this.fail(error);
      });
    };
    const schedule = (): void => {
      const idle = (globalThis as typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }).requestIdleCallback;
      this.idle = idle ? idle(step, { timeout: 4000 }) : setTimeout(step, 120);
    };
    schedule();
  }

  prepare(warmRange: readonly [number, number]): Promise<boolean> {
    const context = this.getContext();
    if (!context) return Promise.resolve(false);
    if (this.ctx === context && this.promise) return this.promise;
    this.ctx = context;
    this.buffers = new Map();
    this.pending = new Map();
    this.status = 'loading';
    this.notify();
    const warm = this.keys.filter(key => key >= warmRange[0] && key <= warmRange[1]);
    this.promise = this.ensure(warm).then(ok => {
      if (this.ctx !== context) return false;
      if (ok) {
        this.status = 'ready';
        this.notify();
        this.warmIdle();
      } else {
        this.promise = null;
        this.status = 'idle';
        this.notify();
      }
      return ok;
    });
    return this.promise;
  }
}
