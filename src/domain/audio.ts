export interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export type PianoContext = AudioDecoder & { state?: string; currentTime?: number };
export type PianoStatus = 'idle' | 'loading' | 'ready' | 'error';

export type AudioTone = 'piano' | 'piano-synth' | 'soft' | 'bright' | 'organ' | 'mellow' | 'glass';

// Ignore old or uninitialized clock pairs, such as those reported just after a device change.
export const AUDIO_OUTPUT_CLOCK_WINDOW = 1;
type OutputClock = Pick<AudioContext, 'currentTime' | 'state'> & Partial<Pick<AudioContext, 'getOutputTimestamp'>>;

/** Sample the time reaching the output device. Scheduling still uses the render clock. */
export function audioPresentationTime(context: OutputClock, frameTime: number): number {
  const renderTime = context.currentTime;
  if (context.state !== 'running') return renderTime;
  const stamp = context.getOutputTimestamp?.();
  const at = stamp?.performanceTime ?? 0, output = stamp?.contextTime ?? 0;
  const age = (frameTime - at) / 1000;
  if (!Number.isFinite(age) || !Number.isFinite(output) || at <= 0 || output < 0 || Math.abs(age) > AUDIO_OUTPUT_CLOCK_WINDOW) return renderTime;
  const estimate = output + age;
  if (estimate < renderTime - AUDIO_OUTPUT_CLOCK_WINDOW || estimate > renderTime + AUDIO_OUTPUT_CLOCK_WINDOW) return renderTime;
  return Math.min(renderTime, Math.max(0, estimate));
}

export interface AudioVoice {
  stop(when?: number): void;
  setBend(): void;
  previewEnd?: number;
  voiceKind?: 'sampled' | 'synth';
  oscs?: OscillatorNode[];
  g?: GainNode;
  inner?: AudioVoice | null;
  released?: boolean;
}

function connectVoiceSource(source: OscillatorNode | AudioBufferSourceNode, lfo: GainNode | null, release: () => void): void {
  lfo?.connect(source.detune);
  source.onended = () => {
    source.onended = null;
    try {
      if (lfo) lfo.disconnect(source.detune);
    } catch { /* already disconnected */ }
    try {
      source.disconnect();
    } catch { /* already disconnected */ }
    release();
  };
}

export interface PianoVoiceOptions {
  warm?: boolean;
  hold?: boolean;
  accent?: boolean;
  expressive?: boolean;
}

export type PianoVoiceHooks = {
  decode?: (key: number) => Promise<AudioBuffer>;
  fallbackVoice?: (frequency: number, velocity: number, when?: number, duration?: number) => AudioVoice;
};

export interface AudioEngineOptions {
  pianoKeys: readonly number[];
  pianoUrls: Readonly<Record<number, string>>;
  warmRange: readonly [number, number];
  onPianoStatus?: (status: PianoStatus) => void;
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

export class PianoBank {
  readonly keys: number[];
  readonly urls: Readonly<Record<number, string>>;
  ctx: PianoContext | null = null;
  buffers = new Map<number, AudioBuffer>();
  pending = new Map<number, Promise<AudioBuffer>>();
  promise: Promise<boolean> | null = null;
  status: PianoStatus = 'idle';
  idle: number | ReturnType<typeof setTimeout> = 0;
  maxPcmBytes = 64 * 1024 * 1024;
  warmRange: readonly [number, number] = [48, 75];
  private idleMode: 'ric' | 'timeout' | null = null;
  private idleGeneration = 0;
  private visibilityBound = false;

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

  pcmBytes(): number {
    let total = 0;
    for (const buffer of this.buffers.values()) {
      const channels = typeof buffer.numberOfChannels === 'number' && buffer.numberOfChannels > 0
        ? buffer.numberOfChannels
        : 1;
      total += buffer.length * channels * 4;
    }
    return total;
  }

  touch(key: number): AudioBuffer | undefined {
    const existing = this.buffers.get(key);
    if (!existing) return undefined;
    this.buffers.delete(key);
    this.buffers.set(key, existing);
    return existing;
  }

  trimBuffers(protectedKeys: ReadonlySet<number> = new Set()): void {
    const [warmLow, warmHigh] = this.warmRange;
    while (this.pcmBytes() > this.maxPcmBytes && this.buffers.size > 1) {
      let victim: number | undefined;
      for (const key of this.buffers.keys()) {
        if (!protectedKeys.has(key) && (key < warmLow || key > warmHigh)) {
          victim = key;
          break;
        }
      }
      if (victim === undefined) {
        for (const key of this.buffers.keys()) {
          if (!protectedKeys.has(key)) {
            victim = key;
            break;
          }
        }
      }
      if (victim === undefined) {
        victim = this.buffers.keys().next().value;
      }
      if (victim === undefined) break;
      this.buffers.delete(victim);
    }
  }

  cancelWarmIdle(): void {
    this.idleGeneration += 1;
    if (this.idle) {
      const cancelIdle = (globalThis as typeof globalThis & {
        cancelIdleCallback?: (id: number) => void;
      }).cancelIdleCallback;
      if (this.idleMode === 'ric' && cancelIdle && typeof this.idle === 'number') {
        cancelIdle(this.idle);
      } else {
        clearTimeout(this.idle);
      }
      this.idle = 0;
      this.idleMode = null;
    }
  }

  decode(key: number): Promise<AudioBuffer> {
    const context = this.getContext();
    if (!context) return Promise.reject(new Error('Audio is not ready'));
    if (this.ctx !== context) {
      this.cancelWarmIdle();
      this.ctx = context;
      this.buffers = new Map();
      this.pending = new Map();
      this.promise = null;
    }
    const cached = this.touch(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const url = this.urls[key];
    if (!url) return Promise.reject(new Error(`No piano recording for ${key}`));
    const job = fetchPianoAudio(url, context)
      .then(audio => {
        if (this.ctx === context) {
          this.buffers.delete(key);
          this.buffers.set(key, audio);
          this.trimBuffers(new Set([key]));
        }
        return audio;
      })
      .finally(() => {
        if (this.ctx === context && this.pending.get(key) === job) this.pending.delete(key);
      });
    this.pending.set(key, job);
    return job;
  }

  fail(error: unknown): void {
    this.cancelWarmIdle();
    this.promise = null;
    this.status = 'error';
    this.notify();
    console.error('Piano recordings could not be decoded', error);
  }

  ensure(midis: readonly number[], nearest = nearestPianoKey): Promise<boolean> {
    const context = this.getContext();
    if (!context) return Promise.resolve(false);
    const keys = [...new Set(midis.map(midi => nearest(midi, this.keys)))];
    return Promise.all(keys.map(key => this.decode(key))).then(
      () => {
        if (this.ctx === context) this.trimBuffers();
        return true;
      },
      error => {
        if (context === this.getContext() && this.ctx === context) this.fail(error);
        return false;
      },
    );
  }

  warmIdle(centerMidi = 66): void {
    const context = this.getContext();
    if (!context) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!this.visibilityBound && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.cancelWarmIdle();
      });
    }
    this.cancelWarmIdle();
    const generation = this.idleGeneration;
    const keys = this.keys
      .filter(key => !this.buffers.has(key))
      .sort((a, b) => Math.abs(a - centerMidi) - Math.abs(b - centerMidi));
    const step = (): void => {
      this.idle = 0;
      this.idleMode = null;
      if (generation !== this.idleGeneration || context !== this.getContext() || this.status === 'error') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const estEntryBytes = this.buffers.size ? this.pcmBytes() / this.buffers.size : 0;
      if (this.pcmBytes() + estEntryBytes > this.maxPcmBytes) return;
      const key = keys.shift();
      if (key == null) return;
      this.decode(key).then(() => {
        if (generation === this.idleGeneration) schedule();
      }, () => {
        // A background fetch is optional. Keep the ready samples and let a requested note retry.
        if (generation === this.idleGeneration) this.cancelWarmIdle();
      });
    };
    const schedule = (): void => {
      if (generation !== this.idleGeneration || !keys.length) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const idle = (globalThis as typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      }).requestIdleCallback;
      if (idle) {
        this.idleMode = 'ric';
        this.idle = idle(step, { timeout: 4000 });
      } else {
        this.idleMode = 'timeout';
        this.idle = setTimeout(step, 120);
      }
    };
    schedule();
  }

  prepare(warmRange: readonly [number, number]): Promise<boolean> {
    this.warmRange = warmRange;
    const context = this.getContext();
    if (!context) return Promise.resolve(false);
    if (this.ctx === context && this.promise) return this.promise;
    this.cancelWarmIdle();
    if (this.ctx !== context) {
      this.ctx = context;
      this.buffers = new Map();
      this.pending = new Map();
    }
    this.status = 'loading';
    this.notify();
    const warm = this.keys.filter(key => key >= warmRange[0] && key <= warmRange[1]);
    const ready = this.ensure(warm).then(ok => {
      if (!ok || this.ctx !== context || this.promise !== ready) return false;
      this.status = 'ready';
      this.notify();
      this.warmIdle();
      return true;
    });
    this.promise = ready;
    return ready;
  }
}

type OscillatorWave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom';
type ToneDefinition = {
  waves: readonly OscillatorWave[];
  cutoff: number;
  octave?: readonly number[];
};

const TONES: Record<Exclude<AudioTone, 'piano' | 'piano-synth'>, ToneDefinition> = {
  soft: { waves: ['triangle', 'sawtooth', 'sawtooth'], cutoff: 6 },
  bright: { waves: ['sawtooth', 'sawtooth', 'square'], cutoff: 9 },
  organ: { waves: ['sine', 'sine', 'sine'], cutoff: 14, octave: [0, 1200, 1902] },
  mellow: { waves: ['sine', 'triangle', 'sine'], cutoff: 3.2 },
  glass: { waves: ['sine', 'triangle', 'square'], cutoff: 11 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Owns every Web Audio node used by the app. Views ask this object to play
 * notes; they never construct an AudioContext or a voice themselves.
 */
export class AudioEngine {
  readonly pianoBank: PianoBank;
  readonly liveVoices = new Map<number, AudioVoice>();
  readonly maxSampledVoices = 48;
  readonly maxSynthVoices = 20;
  previewVoices: AudioVoice[] = [];
  tone: AudioTone = 'piano';
  localSynth = true;
  muted = false;
  masterVolume = 0.72;
  bendSemitones = 0;
  reverbWet = 0.16;

  context: AudioContext | null = null;
  master: GainNode | null = null;
  masterFilter: BiquadFilterNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  lfoGain: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoStarted = false;
  reverbNode: ConvolverNode | null = null;
  private reverbPreparing: ConvolverNode | null = null;
  reverbGain: GainNode | null = null;
  private reverbConnected = false;

  private readonly options: AudioEngineOptions;
  private audioLockTimer = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroOn = false;
  private metroBpm = 90;
  private metroNext = 0;
  private metroBeat = 0;
  readonly droneVoices: AudioVoice[] = [];

  constructor(options: AudioEngineOptions) {
    this.options = options;
    this.pianoBank = new PianoBank(
      options.pianoKeys,
      options.pianoUrls,
      () => this.context,
      () => options.onPianoStatus?.(this.pianoBank.status),
    );
  }

  private notifyPiano(): void {
    this.options.onPianoStatus?.(this.pianoBank.status);
  }

  ensureAudio(): AudioContext | null {
    if (this.context?.state === 'closed') {
      this.liveVoices.clear();
      this.previewVoices = [];
      this.droneVoices.length = 0;
      this.noiseBuffer = null;
      this.reverbPreparing = null;
      this.reverbNode = null;
      this.reverbGain = null;
      this.reverbConnected = false;
      this.lfo = null;
      this.lfoStarted = false;
      this.lfoGain = null;
      this.masterFilter = null;
      this.compressor = null;
      this.context = null;
      this.master = null;
    }
    if (this.context) {
      if (this.context.state === 'suspended' || this.context.state === 'interrupted') {
        void this.context.resume().catch(() => undefined);
      }
      return this.context;
    }

    const AudioContextCtor = globalThis.AudioContext ??
      (globalThis as typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      this.context = new AudioContextCtor({ latencyHint: 'interactive' });
    } catch {
      this.context = new AudioContextCtor();
    }

    const context = this.context;
    context.addEventListener('statechange', () => this.audioLockSync());
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : this.masterVolume;
    this.masterFilter = context.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.masterFilter.frequency.value = 15500;
    this.masterFilter.Q.value = 0.4;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 28;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.26;
    this.master.connect(this.masterFilter).connect(this.compressor).connect(context.destination);

    try {
      this.reverbNode = context.createConvolver();
      this.reverbGain = context.createGain();
      this.reverbGain.gain.value = this.reverbWet;
      this.syncReverbConnection();
    } catch {
      this.reverbNode = null;
      this.reverbGain = null;
      this.reverbConnected = false;
    }

    this.lfo = context.createOscillator();
    this.lfo.frequency.value = 5.5;
    this.lfoGain = context.createGain();
    this.lfoGain.gain.value = 0;
    this.lfoStarted = false;
    void context.resume().catch(() => undefined);
    return context;
  }

  audioLockSync(): void {
    if (!this.context || this.context.state !== 'running') return;
    clearTimeout(this.audioLockTimer);
    this.audioLockTimer = 0;
  }

  audioUnlock(): void {
    const context = this.ensureAudio();
    if (context && context.state !== 'running') {
      void context.resume().then(() => this.audioLockSync()).catch(() => undefined);
    } else {
      this.audioLockSync();
    }
  }

  /**
   * Restarts the context after the page comes back. Phones suspend or interrupt audio while the app is in the
   * background. resume() can stay pending while the OS holds the audio session, so the wait is capped.
   * Resolves with the state after the attempt, or null when no context exists yet (the first gesture creates it).
   */
  async resumeOnReturn(waitMs = 1000): Promise<AudioContext['state'] | null> {
    const context = this.context;
    if (!context || context.state === 'closed') return null;
    if (context.state !== 'running') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); }),
      ]);
      clearTimeout(timer);
    }
    return context.state;
  }

  pianoStatus(): PianoStatus {
    return this.pianoBank.status;
  }

  pianoEnsure(midis: readonly number[]): Promise<boolean> {
    if (!this.context) return Promise.resolve(false);
    return this.pianoBank.ensure(midis);
  }

  preparePiano(): Promise<boolean> {
    return this.pianoBank.prepare(this.options.warmRange);
  }

  pianoDecode(key: number): Promise<AudioBuffer> {
    return this.pianoBank.decode(key);
  }

  ensureReverbBuffer(): void {
    const context = this.context, node = this.reverbNode;
    if (!node || node.buffer || !context || this.reverbPreparing === node) return;
    this.reverbPreparing = node;
    // Voices play dry immediately. Generate only a small slice per task, never in an input handler.
    let buffer: AudioBuffer | null = null, channel = 0, index = 0, last = 0;
    const step = (): void => {
      if (this.context !== context || context.state === 'closed' || this.reverbNode !== node) {
        if (this.reverbPreparing === node) this.reverbPreparing = null;
        return;
      }
      try {
        buffer ??= context.createBuffer(2, Math.max(1, Math.floor(context.sampleRate * 1.9)), context.sampleRate);
        const data = buffer.getChannelData(channel), end = Math.min(index + 2048, data.length);
        const preDelay = Math.floor(context.sampleRate * 0.014);
        const tap1 = Math.floor(context.sampleRate * (channel === 0 ? 0.018 : 0.022));
        const tap2 = Math.floor(context.sampleRate * (channel === 0 ? 0.029 : 0.033));
        const tap3 = Math.floor(context.sampleRate * (channel === 0 ? 0.043 : 0.046));
        for (; index < end; index++) {
          if (index < preDelay) {
            data[index] = 0;
            continue;
          }
          const progress = index / data.length;
          const smooth = 0.56 + progress * 0.28;
          if (index === tap1) last += channel === 0 ? 0.22 : -0.18;
          else if (index === tap2) last += channel === 0 ? -0.15 : 0.19;
          else if (index === tap3) last += channel === 0 ? 0.11 : -0.12;
          last = last * smooth + (Math.random() * 2 - 1) * (1 - smooth);
          data[index] = last * Math.pow(1 - progress, 2.5);
        }
        if (index === data.length) { channel++; index = 0; last = 0; }
        if (channel === 2) { node.buffer = buffer; this.reverbPreparing = null; }
        else setTimeout(step, 0);
      } catch { this.reverbPreparing = null; }
    };
    setTimeout(step, 0);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const context = this.context;
    if (!context) throw new Error('Audio is not ready');
    const length = Math.floor(context.sampleRate * 0.25);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      data[index] = last * 3.2;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  sampledPianoVoice(
    frequency: number,
    velocity: number,
    when: number | undefined,
    duration: number | undefined,
    options: PianoVoiceOptions = {},
    hooks: PianoVoiceHooks = {},
  ): AudioVoice {
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('Audio is not ready');
    if (this.reverbWet > 0) this.ensureReverbBuffer();
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const nearest = this.pianoBank.keys.reduce(
      (best, key) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best,
      this.pianoBank.keys[0] ?? 60,
    );
    const voice: AudioVoice & { inner: AudioVoice | null; released: boolean } = {
      inner: null,
      released: false,
      voiceKind: 'sampled',
      stop: (at?: number) => {
        voice.released = true;
        voice.inner?.stop(at);
      },
      setBend: () => voice.inner?.setBend(),
    };

    const start = (buffer: AudioBuffer, sampleMidi = nearest): void => {
      if (voice.released || context !== this.context || context.state === 'closed') return;
      if (when != null && duration != null && when + duration <= context.currentTime) return;
      const rate = Math.pow(2, (midi - sampleMidi) / 12);
      const startAt = Math.max(context.currentTime, when ?? context.currentTime);
      const offset = when == null ? 0 : Math.max(0, startAt - when) * rate;
      if (offset >= buffer.duration) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const normalizedVelocity = clamp(velocity || 100, 1, 127) / 127;
      const peak = 0.85 * Math.pow(normalizedVelocity, 1.6);
      const roundedMidi = Math.round(midi);
      let release = roundedMidi >= 84 ? 0.62 : roundedMidi < 48 ? 0.30 : roundedMidi < 60 ? 0.23 : 0.17;
      if (normalizedVelocity < 0.45) release += 0.04;
      const warm = options.warm === true;
      const held = options.hold === true;
      const accented = options.accent === true;
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(rate, startAt);
      source.detune.setValueAtTime(this.bendSemitones * 100, startAt);

      const brightness = Math.pow(normalizedVelocity, 2.0);
      const baseCut = warm ? 750 : 1050;
      const spanCut = warm ? 9200 : 15500;
      const accentBoost = accented ? 1.18 : 1.0;
      const cutoff = Math.min(context.sampleRate * 0.45, (baseCut + spanCut * brightness) * accentBoost);
      filter.type = 'lowpass';
      filter.Q.value = 0.35;
      filter.frequency.setValueAtTime(cutoff, startAt);
      if ((duration == null || duration > 0.35) && typeof filter.frequency.exponentialRampToValueAtTime === 'function') {
        const darkTarget = Math.max(850, cutoff * 0.62);
        if (darkTarget < cutoff) {
          filter.frequency.exponentialRampToValueAtTime(
            darkTarget,
            startAt + Math.min(2.2, (duration ?? 2.4) * 0.9),
          );
        }
      }

      const rawAttack = accented
        ? 0.0025
        : warm
          ? 0.007 + (1 - normalizedVelocity) * 0.009
          : 0.003 + (1 - normalizedVelocity) * 0.007;
      const attack = duration != null ? Math.min(rawAttack, Math.max(0.001, duration * 0.4)) : rawAttack;
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + attack);

      const pan = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
      if (pan) {
        pan.pan.value = clamp(((midi - 60) / 48) * 0.28, -0.32, 0.32);
        source.connect(gain).connect(filter).connect(pan).connect(master);
      } else {
        source.connect(gain).connect(filter).connect(master);
      }
      connectVoiceSource(source, this.lfoGain, () => {
        gain.disconnect();
        filter.disconnect();
        pan?.disconnect();
      });

      const inner: AudioVoice = {
        g: gain,
        stop: (at?: number) => {
          const releaseAt = Math.max(context.currentTime, at ?? context.currentTime);
          if (releaseAt <= startAt) {
            gain.gain.cancelScheduledValues(0);
            gain.gain.setValueAtTime(0, 0);
            try { source.stop(releaseAt); } catch { /* already stopped */ }
            try { source.disconnect(); } catch { /* already disconnected */ }
            return;
          }
          this.cancelAndHold(gain.gain, releaseAt, 0.0001);
          gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
          try { source.stop(releaseAt + release + 0.02); } catch { /* already stopped */ }
        },
        setBend: () => source.detune.setTargetAtTime(this.bendSemitones * 100, context.currentTime, 0.01),
      };
      voice.inner = inner;
      source.start(startAt, offset);
      if (duration != null) {
        const end = Math.max(startAt + 0.004, (when ?? startAt) + duration);
        const endRelease = held ? release * 1.25 : release;
        if (held && end > startAt + 0.03) {
          const tail = Math.max(0.0001, peak * 0.48);
          const settle = Math.min(end - 0.004, startAt + Math.min(0.45, Math.max(0.03, duration * 0.32)));
          gain.gain.exponentialRampToValueAtTime(tail, settle);
          gain.gain.setValueAtTime(tail, end);
        } else {
          gain.gain.setValueAtTime(peak, end);
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, end + endRelease);
        try { source.stop(end + endRelease + 0.02); } catch { /* already stopped */ }
      }
    };

    const ready = this.pianoBank.touch(nearest);
    if (ready) start(ready);
    else if (when == null) {
      const keys = [...this.pianoBank.buffers.keys()];
      const fallback = keys.reduce<number | null>(
        (best, key) => best == null || Math.abs(key - midi) < Math.abs(best - midi) ? key : best,
        null,
      );
      if (fallback != null && Math.abs(fallback - midi) <= 12) {
        const buffer = this.pianoBank.touch(fallback);
        if (buffer) start(buffer, fallback);
      } else {
        voice.voiceKind = 'synth';
        this.enforcePolyphonyCap('synth', context.currentTime);
        voice.inner = hooks.fallbackVoice
          ? hooks.fallbackVoice(frequency, velocity, when, duration)
          : this.makePianoVoice(frequency, velocity, when, duration);
      }
      void (hooks.decode ? hooks.decode(nearest) : this.pianoDecode(nearest)).catch(error => {
        if (this.context === context && this.pianoBank.ctx === context) this.pianoBank.fail(error);
      });
    } else {
      void (hooks.decode ? hooks.decode(nearest) : this.pianoDecode(nearest)).then(start).catch(error => {
        if (this.context === context && this.pianoBank.ctx === context) this.pianoBank.fail(error);
      });
    }
    return voice;
  }

  makePianoVoice(frequency: number, velocity: number, when?: number, duration?: number): AudioVoice {
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('Audio is not ready');
    if (this.reverbWet > 0) this.ensureReverbBuffer();
    const startAt = when ?? context.currentTime;
    const normalizedVelocity = clamp((velocity || 100) / 127, 0.06, 1);
    const output = context.createGain();
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = clamp(Math.log2(frequency / 261.63) * 0.22, -0.45, 0.45);
      output.connect(pan).connect(master);
    } else {
      output.connect(master);
    }
    const level = 0.13 * (0.45 + 0.55 * normalizedVelocity);
    output.gain.setValueAtTime(0.0001, startAt);
    output.gain.linearRampToValueAtTime(level, startAt + 0.003);
    const octave = Math.log2(frequency / 27.5);
    const baseDecay = clamp(9.2 - octave * 0.92, 0.7, 13);
    const nyquist = context.sampleRate * 0.48;
    const stiffness = 0.00045 + octave * 0.00006;
    const partials = frequency < 150 ? 14 : frequency < 350 ? 11 : frequency < 800 ? 8 : 5;
    const oscillators: OscillatorNode[] = [];
    let active = 1; // The hammer is also connected to the shared output.
    const finishSource = () => {
      if (--active === 0) {
        output.disconnect();
        pan?.disconnect();
      }
    };
    for (let partial = 1; partial <= partials; partial += 1) {
      const partialFrequency = frequency * partial * Math.sqrt(1 + stiffness * partial * partial);
      if (partialFrequency > nyquist) break;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(partialFrequency, startAt);
      oscillator.detune.setValueAtTime(this.bendSemitones * 100, startAt);
      const gain = context.createGain();
      let amplitude = Math.pow(partial, -1.18);
      if (partial === 1) amplitude *= 0.92;
      amplitude *= Math.max(0.12, 1 + (normalizedVelocity - 0.55) * (partial - 1) * 0.22);
      const decay = Math.max(0.22, baseDecay / (1 + (partial - 1) * 0.62));
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), startAt + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.004 + decay);
      oscillator.connect(gain).connect(output);
      active++;
      connectVoiceSource(oscillator, this.lfoGain, () => { gain.disconnect(); finishSource(); });
      oscillator.start(startAt);
      try { oscillator.stop(startAt + baseDecay + 0.35); } catch { /* already stopped */ }
      oscillators.push(oscillator);
    }
    const hammer = context.createBufferSource();
    hammer.buffer = this.noise();
    const hammerFilter = context.createBiquadFilter();
    hammerFilter.type = 'bandpass';
    hammerFilter.frequency.value = Math.min(nyquist, frequency * 3 + 700);
    hammerFilter.Q.value = 1.2;
    const hammerGain = context.createGain();
    hammerGain.gain.setValueAtTime(0.028 * normalizedVelocity * normalizedVelocity, startAt);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.04);
    hammer.connect(hammerFilter).connect(hammerGain).connect(output);
    connectVoiceSource(hammer, null, () => {
      hammerFilter.disconnect();
      hammerGain.disconnect();
      finishSource();
    });
    hammer.start(startAt);
    try { hammer.stop(startAt + 0.09); } catch { /* already stopped */ }
    const voice: AudioVoice = {
      oscs: oscillators,
      g: output,
      voiceKind: 'synth',
      stop: (at?: number) => {
        const releaseAt = at ?? context.currentTime;
        try { hammer.stop(Math.min(startAt + .09, releaseAt)); } catch { /* already stopped */ }
        const release = frequency > 500 ? 0.1 : 0.17;
        if (releaseAt <= startAt) {
          output.gain.cancelScheduledValues(startAt);
          output.gain.setValueAtTime(0.0001, startAt);
        } else if (typeof output.gain.cancelAndHoldAtTime === 'function') {
          output.gain.cancelAndHoldAtTime(releaseAt);
        } else {
          const phase = Math.min(1, (releaseAt - startAt) / .003);
          output.gain.cancelScheduledValues(releaseAt);
          output.gain.setValueAtTime(0.0001 + (level - 0.0001) * phase, releaseAt);
        }
        output.gain.exponentialRampToValueAtTime(0.0001, Math.max(startAt, releaseAt + release));
        oscillators.forEach(oscillator => {
          try { oscillator.stop(releaseAt + release + 0.05); } catch { /* already stopped */ }
        });
      },
      setBend: () => oscillators.forEach(oscillator => oscillator.detune.setTargetAtTime(this.bendSemitones * 100, context.currentTime, 0.01)),
    };
    if (duration != null) voice.stop(startAt + duration);
    return voice;
  }

  makeVoice(
    frequency: number,
    velocity: number,
    when?: number,
    duration?: number,
    hooks: PianoVoiceHooks = {},
  ): AudioVoice {
    if (this.tone === 'piano') return this.sampledPianoVoice(frequency, velocity, when, duration, {}, hooks);
    if (this.tone === 'piano-synth') return this.makePianoVoice(frequency, velocity, when, duration);
    return this.makeSustainedVoice(this.tone, frequency, velocity, when, duration);
  }

  private makeSustainedVoice(tone: keyof typeof TONES, frequency: number, velocity: number, when?: number, duration?: number): AudioVoice {
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('Audio is not ready');
    if (this.reverbWet > 0) this.ensureReverbBuffer();
    const startAt = when ?? context.currentTime;
    const definition = TONES[tone];
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(11000, frequency * definition.cutoff + 700), startAt);
    filter.Q.value = 0.6;
    const detune = [0, -7, 7];
    let active = detune.length;
    const oscillators = detune.map((offset, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = definition.waves[index] ?? 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.detune.setValueAtTime(offset + (definition.octave?.[index] ?? 0) + this.bendSemitones * 100, startAt);
      connectVoiceSource(oscillator, this.lfoGain, () => {
        if (--active === 0) {
          gain.disconnect();
          filter.disconnect();
        }
      });
      oscillator.connect(gain);
      return oscillator;
    });
    const peak = 0.16 * (0.4 + 0.6 * (velocity / 127));
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.006);
    gain.gain.exponentialRampToValueAtTime(peak * 0.6, startAt + 0.14);
    gain.connect(filter).connect(master);
    oscillators.forEach(oscillator => oscillator.start(startAt));
    if (duration != null) {
      const releaseAt = startAt + duration;
      gain.gain.setValueAtTime(peak * 0.6, releaseAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.25);
      oscillators.forEach(oscillator => {
        try { oscillator.stop(releaseAt + 0.3); } catch { /* already stopped */ }
      });
    }
    return {
      g: gain,
      voiceKind: 'synth',
      stop: (at?: number) => {
        const releaseAt = Math.max(context.currentTime, at ?? context.currentTime);
        if (releaseAt <= startAt) {
          gain.gain.cancelScheduledValues(0);
          gain.gain.setValueAtTime(0, 0);
          oscillators.forEach(oscillator => {
            try { oscillator.stop(releaseAt); } catch { /* already stopped */ }
            try { oscillator.disconnect(); } catch { /* already disconnected */ }
          });
          return;
        }
        this.cancelAndHold(gain.gain, releaseAt, 0.0001);
        gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + 0.28);
        oscillators.forEach(oscillator => {
          try { oscillator.stop(releaseAt + 0.32); } catch { /* already stopped */ }
        });
      },
      setBend: () => oscillators.forEach((oscillator, index) => oscillator.detune.setTargetAtTime(
        detune[index] + (definition.octave?.[index] ?? 0) + this.bendSemitones * 100,
        context.currentTime,
        0.01,
      )),
    };
  }

  private enforcePolyphonyCap(kind: 'sampled' | 'synth', now: number): void {
    this.previewVoices = this.previewVoices.filter(
      voice => !voice.released && (voice.previewEnd ?? 0) > now,
    );
    const limit = kind === 'synth' ? this.maxSynthVoices : this.maxSampledVoices;
    const isKind = (voice: AudioVoice): boolean => (voice.voiceKind ?? 'sampled') === kind;
    const countMatching = (): number => {
      let count = 0;
      for (const voice of this.previewVoices) {
        if (!voice.released && isKind(voice)) count += 1;
      }
      for (const voice of this.liveVoices.values()) {
        if (!voice.released && isKind(voice)) count += 1;
      }
      return count;
    };
    while (countMatching() >= limit) {
      const previewIndex = this.previewVoices.findIndex(voice => !voice.released && isKind(voice));
      if (previewIndex >= 0) {
        const [victim] = this.previewVoices.splice(previewIndex, 1);
        victim.stop(now);
        continue;
      }
      let stolen = false;
      for (const [midi, voice] of this.liveVoices) {
        if (!voice.released && isKind(voice)) {
          this.liveVoices.delete(midi);
          voice.stop(now);
          stolen = true;
          break;
        }
      }
      if (!stolen) break;
    }
  }

  noteOn(midi: number, velocity = 100, hooks: PianoVoiceHooks = {}): void {
    if (!this.localSynth) return;
    const context = this.ensureAudio();
    if (!context) return;
    if (this.liveVoices.has(midi)) {
      this.liveVoices.get(midi)?.stop();
      this.liveVoices.delete(midi);
    }
    this.enforcePolyphonyCap(this.tone === 'piano' ? 'sampled' : 'synth', context.currentTime);
    this.liveVoices.set(midi, this.makeVoice(midiToFrequency(midi), velocity, undefined, undefined, hooks));
  }

  noteOff(midi: number): void {
    this.liveVoices.get(midi)?.stop();
    this.liveVoices.delete(midi);
  }

  silenceNote(midi: number): void {
    const voice = this.liveVoices.get(midi);
    if (!voice) return;
    this.noteOff(midi);
    const gain = (voice.inner ?? voice).g?.gain;
    if (gain && this.context) {
      const now = this.context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
    }
  }

  preview(note: number, when?: number, duration = 0.8, velocity = 96, options: PianoVoiceOptions = {}): void {
    const context = this.ensureAudio();
    if (!context) return;
    this.enforcePolyphonyCap('sampled', context.currentTime);
    const voice = this.sampledPianoVoice(midiToFrequency(note), velocity, when, duration, options);
    voice.previewEnd = (when ?? context.currentTime) + duration + (options.hold ? 0.8 : 0.45);
    this.previewVoices.push(voice);
  }

  stopPreviews(): void {
    const now = this.context?.currentTime ?? 0;
    this.previewVoices.forEach(voice => voice.stop(now));
    this.previewVoices = [];
  }

  setBendFromValue(value: number): void {
    this.bendSemitones = (clamp(value, -8192, 8191) / 8192) * 2;
    this.liveVoices.forEach(voice => voice.setBend());
  }

  private cancelAndHold(param: AudioParam, time: number, minValue?: number): void {
    const withHold = param as AudioParam & { cancelAndHoldAtTime?: (at: number) => AudioParam };
    if (typeof withHold.cancelAndHoldAtTime === 'function') {
      withHold.cancelAndHoldAtTime(time);
      return;
    }
    param.cancelScheduledValues(time);
    param.setValueAtTime(minValue != null ? Math.max(minValue, param.value) : param.value, time);
  }

  private syncReverbConnection(): void {
    if (!this.masterFilter || !this.reverbNode || !this.reverbGain || !this.compressor) return;
    const want = this.reverbWet > 0;
    if (want && !this.reverbConnected) {
      this.masterFilter.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.compressor);
      this.reverbConnected = true;
    } else if (!want && this.reverbConnected) {
      try { this.masterFilter.disconnect(this.reverbNode); } catch { /* ignore */ }
      try { this.reverbNode.disconnect(); } catch { /* ignore */ }
      try { this.reverbGain.disconnect(); } catch { /* ignore */ }
      this.reverbConnected = false;
    }
  }

  setModulation(depth: number, timeConstant = 0.03): void {
    if (this.lfo && this.lfoGain && !this.lfoStarted && depth > 0) {
      this.lfo.connect(this.lfoGain);
      this.lfo.start();
      this.lfoStarted = true;
    }
    if (this.lfoGain && this.context) {
      this.lfoGain.gain.setTargetAtTime(depth, this.context.currentTime, timeConstant);
    }
  }

  setMasterVolume(value: number): void {
    this.masterVolume = clamp(value, 0, 1);
    this.muted = false;
    this.masterRamp(this.masterVolume);
  }

  setReverbWet(value: number): void {
    this.reverbWet = clamp(value, 0, 1);
    if (this.reverbWet > 0) this.ensureReverbBuffer();
    this.syncReverbConnection();
    this.rampReverb();
  }

  applyOutputMix(): void {
    this.masterRamp(this.muted ? 0 : this.masterVolume);
    this.rampReverb();
  }

  private rampReverb(): void {
    if (this.reverbGain && this.context) {
      this.reverbGain.gain.setTargetAtTime(this.reverbWet, this.context.currentTime, 0.05);
    }
  }

  masterRamp(value: number): void {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    this.cancelAndHold(this.master.gain, now);
    this.master.gain.linearRampToValueAtTime(value, now + 0.02);
  }

  startMetro(bpm: number, startAt?: number): void {
    const context = this.ensureAudio();
    if (!context) return;
    this.metroBpm = bpm;
    this.metroOn = true;
    this.metroNext = startAt != null && Number.isFinite(startAt) ? startAt : context.currentTime + 0.12;
    this.metroBeat = 0;
    if (!this.metroTimer) this.metroTimer = setInterval(() => this.metroSchedule(), 25);
  }

  stopMetro(): void {
    this.metroOn = false;
    if (this.metroTimer) clearInterval(this.metroTimer);
    this.metroTimer = null;
  }

  private metroSchedule(): void {
    const context = this.context;
    if (!this.metroOn || !context || !this.master) return;
    if (context.currentTime - this.metroNext > 0.5) {
      this.metroNext = context.currentTime + 0.05;
      this.metroBeat = 0;
    }
    while (this.metroNext < context.currentTime + 0.1) {
      this.metroClick(this.metroNext, this.metroBeat % 4 === 0);
      this.metroBeat += 1;
      this.metroNext += 60 / this.metroBpm;
    }
  }

  metroClick(when: number, accent: boolean): void {
    this.scheduleClick(when, accent);
  }

  /** Schedule a short click and optionally track it until it ends or its owner stops it. */
  scheduleClick(when: number, accent: boolean, track?: Set<AudioVoice>): AudioVoice | null {
    const context = this.context;
    if (!context || !this.master) return null;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = accent ? 2100 : 1350;
    oscillator.connect(gain).connect(this.master);
    const peak = accent ? 0.3 : 0.16;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    oscillator.start(when);
    oscillator.stop(when + 0.06);
    const voice: AudioVoice = {
      oscs: [oscillator],
      stop: (at?: number) => {
        const stopAt = at ?? context.currentTime;
        if (stopAt <= when) {
          gain.gain.cancelScheduledValues(0);
          gain.gain.setValueAtTime(0, 0);
        }
        try { oscillator.stop(stopAt); } catch { /* already stopped */ }
        if (stopAt <= when) {
          try { oscillator.disconnect(); } catch { /* already disconnected */ }
          try { gain.disconnect(); } catch { /* already disconnected */ }
        }
      },
      setBend: () => {},
    };
    if (track) track.add(voice);
    oscillator.onended = () => {
      oscillator.onended = null;
      track?.delete(voice);
      try { oscillator.disconnect(); } catch { /* already disconnected */ }
      try { gain.disconnect(); } catch { /* already disconnected */ }
    };
    return voice;
  }

  startDrone(rootPitchClass: number): void {
    this.stopDrone();
    if (!this.ensureAudio()) return;
    const tone = this.tone === 'piano' || this.tone === 'piano-synth' ? 'mellow' : this.tone;
    [36 + rootPitchClass, 43 + rootPitchClass].forEach(midi => {
      this.droneVoices.push(this.makeSustainedVoice(tone, midiToFrequency(midi), 52));
    });
  }

  stopDrone(): void {
    this.droneVoices.forEach(voice => voice.stop());
    this.droneVoices.length = 0;
  }

  releaseAll(): void {
    this.liveVoices.forEach(voice => voice.stop());
    this.liveVoices.clear();
    this.stopPreviews();
    this.stopDrone();
  }

  playInterval(rootMidi: number, semitones: number, style: 'both' | 'harmonic' | 'melodic' = 'both'): void {
    const context = this.ensureAudio();
    if (!context) return;
    this.stopPreviews();
    const now = context.currentTime;
    if (style !== 'harmonic') {
      this.preview(rootMidi, now, 0.45);
      this.preview(rootMidi + semitones, now + 0.5, 0.45);
    }
    if (style !== 'melodic') {
      const harmonicAt = style === 'harmonic' ? now : now + 1.15;
      this.preview(rootMidi, harmonicAt, 0.8);
      this.preview(rootMidi + semitones, harmonicAt, 0.8);
    }
  }
}
