export interface AudioDecoder {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
}

export type PianoContext = AudioDecoder & { state?: string; currentTime?: number };
export type PianoStatus = 'idle' | 'loading' | 'ready' | 'error';

export type AudioTone = 'piano' | 'piano-synth' | 'soft' | 'bright' | 'organ' | 'mellow' | 'glass';

export interface AudioVoice {
  stop(when?: number): void;
  setBend(): void;
  previewEnd?: number;
  oscs?: OscillatorNode[];
  g?: GainNode;
  inner?: AudioVoice | null;
  released?: boolean;
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
  previewVoices: AudioVoice[] = [];
  tone: AudioTone = 'piano';
  localSynth = true;
  muted = false;
  masterVolume = 0.72;
  bendSemitones = 0;
  reverbWet = 0.125;

  context: AudioContext | null = null;
  master: GainNode | null = null;
  masterFilter: BiquadFilterNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  lfoGain: GainNode | null = null;
  reverbNode: ConvolverNode | null = null;
  reverbGain: GainNode | null = null;

  private readonly options: AudioEngineOptions;
  private audioLockTimer = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private metroTimer: ReturnType<typeof setInterval> | null = null;
  private metroOn = false;
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
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4.5;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;
    this.master.connect(this.masterFilter).connect(this.compressor).connect(context.destination);

    try {
      this.reverbNode = context.createConvolver();
      this.reverbNode.buffer = this.makeImpulseResponse(1.7, 2.4);
      this.reverbGain = context.createGain();
      this.reverbGain.gain.value = this.reverbWet;
      this.masterFilter.connect(this.reverbNode).connect(this.reverbGain).connect(this.compressor);
    } catch {
      this.reverbNode = null;
      this.reverbGain = null;
    }

    const lfo = context.createOscillator();
    lfo.frequency.value = 5.5;
    this.lfoGain = context.createGain();
    this.lfoGain.gain.value = 0;
    lfo.connect(this.lfoGain);
    lfo.start();
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

  private makeImpulseResponse(seconds: number, decay: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error('Audio is not ready');
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let index = 0; index < length; index += 1) {
        last = last * 0.62 + (Math.random() * 2 - 1) * 0.38;
        data[index] = last * Math.pow(1 - index / length, decay);
      }
    }
    return buffer;
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
    options: { warm?: boolean; hold?: boolean } = {},
    hooks: PianoVoiceHooks = {},
  ): AudioVoice {
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('Audio is not ready');
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const nearest = this.pianoBank.keys.reduce(
      (best, key) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best,
      this.pianoBank.keys[0] ?? 60,
    );
    const voice: AudioVoice & { inner: AudioVoice | null; released: boolean } = {
      inner: null,
      released: false,
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
      const release = midi < 60 ? 0.22 : 0.15;
      const warm = options.warm === true;
      const held = options.hold === true;
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(rate, startAt);
      source.detune.setValueAtTime(this.bendSemitones * 100, startAt);
      filter.type = 'lowpass';
      filter.Q.value = 0.3;
      filter.frequency.setValueAtTime(
        Math.min(context.sampleRate * 0.45, (warm ? 1700 : 2800) + (warm ? 10500 : 16000) * Math.pow(normalizedVelocity, 1.4)),
        startAt,
      );
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + (warm ? 0.008 : 0.003));
      source.connect(gain).connect(filter).connect(master);
      if (this.lfoGain) this.lfoGain.connect(source.detune);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        filter.disconnect();
      };

      const inner: AudioVoice = {
        stop: (at?: number) => {
          const releaseAt = Math.max(context.currentTime, at ?? context.currentTime);
          if (releaseAt <= startAt) {
            try { source.stop(releaseAt); } catch { /* already stopped */ }
            return;
          }
          gain.gain.cancelScheduledValues(releaseAt);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), releaseAt);
          gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
          try { source.stop(releaseAt + release + 0.02); } catch { /* already stopped */ }
        },
        setBend: () => source.detune.setTargetAtTime(this.bendSemitones * 100, context.currentTime, 0.01),
      };
      voice.inner = inner;
      source.start(startAt, offset);
      if (duration != null) {
        const end = Math.max(startAt + 0.004, (when ?? startAt) + duration);
        if (held && end > startAt + 0.03) {
          const tail = Math.max(0.0001, peak * 0.42);
          const settle = Math.min(end - 0.004, startAt + Math.min(0.45, Math.max(0.03, duration * 0.32)));
          gain.gain.exponentialRampToValueAtTime(tail, settle);
          gain.gain.setValueAtTime(tail, end);
        } else {
          gain.gain.setValueAtTime(peak, end);
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, end + release);
        try { source.stop(end + release + 0.02); } catch { /* already stopped */ }
      }
    };

    const ready = this.pianoBank.buffers.get(nearest);
    if (ready) start(ready);
    else if (when == null) {
      const keys = [...this.pianoBank.buffers.keys()];
      const fallback = keys.reduce<number | null>(
        (best, key) => best == null || Math.abs(key - midi) < Math.abs(best - midi) ? key : best,
        null,
      );
      if (fallback != null && Math.abs(fallback - midi) <= 12) {
        const buffer = this.pianoBank.buffers.get(fallback);
        if (buffer) start(buffer, fallback);
      } else {
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
    const startAt = when ?? context.currentTime;
    const normalizedVelocity = clamp((velocity || 100) / 127, 0.06, 1);
    const output = context.createGain();
    if (context.createStereoPanner) {
      const pan = context.createStereoPanner();
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
    for (let partial = 1; partial <= partials; partial += 1) {
      const partialFrequency = frequency * partial * Math.sqrt(1 + stiffness * partial * partial);
      if (partialFrequency > nyquist) break;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(partialFrequency, startAt);
      oscillator.detune.setValueAtTime(this.bendSemitones * 100, startAt);
      if (this.lfoGain) this.lfoGain.connect(oscillator.detune);
      const gain = context.createGain();
      let amplitude = Math.pow(partial, -1.18);
      if (partial === 1) amplitude *= 0.92;
      amplitude *= Math.max(0.12, 1 + (normalizedVelocity - 0.55) * (partial - 1) * 0.22);
      const decay = Math.max(0.22, baseDecay / (1 + (partial - 1) * 0.62));
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, amplitude), startAt + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.004 + decay);
      oscillator.connect(gain).connect(output);
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
    hammer.start(startAt);
    try { hammer.stop(startAt + 0.09); } catch { /* already stopped */ }
    return {
      oscs: oscillators,
      g: output,
      stop: (at?: number) => {
        const releaseAt = at ?? context.currentTime;
        const release = frequency > 500 ? 0.1 : 0.17;
        output.gain.cancelScheduledValues(releaseAt);
        output.gain.setValueAtTime(Math.max(0.0001, output.gain.value), releaseAt);
        output.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
        oscillators.forEach(oscillator => {
          try { oscillator.stop(releaseAt + release + 0.05); } catch { /* already stopped */ }
        });
      },
      setBend: () => oscillators.forEach(oscillator => oscillator.detune.setTargetAtTime(this.bendSemitones * 100, context.currentTime, 0.01)),
    };
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
    const context = this.context;
    const master = this.master;
    if (!context || !master) throw new Error('Audio is not ready');
    const startAt = when ?? context.currentTime;
    const definition = TONES[this.tone] ?? TONES.soft;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(11000, frequency * definition.cutoff + 700), startAt);
    filter.Q.value = 0.6;
    const detune = [0, -7, 7];
    const oscillators = detune.map((offset, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = definition.waves[index] ?? 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      oscillator.detune.setValueAtTime(offset + (definition.octave?.[index] ?? 0) + this.bendSemitones * 100, startAt);
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
      stop: (at?: number) => {
        const releaseAt = at ?? context.currentTime;
        gain.gain.cancelScheduledValues(releaseAt);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), releaseAt);
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

  noteOn(midi: number, velocity = 100, hooks: PianoVoiceHooks = {}): void {
    if (!this.localSynth) return;
    this.ensureAudio();
    if (this.liveVoices.has(midi)) this.liveVoices.get(midi)?.stop();
    this.liveVoices.set(midi, this.makeVoice(midiToFrequency(midi), velocity, undefined, undefined, hooks));
  }

  noteOff(midi: number): void {
    this.liveVoices.get(midi)?.stop();
    this.liveVoices.delete(midi);
  }

  preview(note: number, when?: number, duration = 0.8, velocity = 96, options: { warm?: boolean; hold?: boolean } = {}): void {
    const context = this.ensureAudio();
    if (!context) return;
    this.previewVoices = this.previewVoices.filter(voice => (voice.previewEnd ?? 0) > context.currentTime);
    const voice = this.sampledPianoVoice(midiToFrequency(note), velocity, when, duration, options);
    voice.previewEnd = (when ?? context.currentTime) + duration + (options.hold ? 0.6 : 0.4);
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

  setMasterVolume(value: number): void {
    this.masterVolume = clamp(value, 0, 1);
    this.muted = false;
    this.masterRamp(this.masterVolume);
  }

  setReverbWet(value: number): void {
    this.reverbWet = clamp(value, 0, 1);
    if (this.reverbGain && this.context) {
      this.reverbGain.gain.setTargetAtTime(this.reverbWet, this.context.currentTime, 0.05);
    }
  }

  masterRamp(value: number): void {
    if (!this.master || !this.context) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(value, now + 0.02);
  }

  startMetro(bpm: number): void {
    const context = this.ensureAudio();
    if (!context) return;
    this.metroOn = true;
    this.metroNext = context.currentTime + 0.12;
    this.metroBeat = 0;
    if (!this.metroTimer) this.metroTimer = setInterval(() => this.metroSchedule(bpm), 25);
  }

  stopMetro(): void {
    this.metroOn = false;
    if (this.metroTimer) clearInterval(this.metroTimer);
    this.metroTimer = null;
  }

  private metroSchedule(bpm: number): void {
    const context = this.context;
    if (!this.metroOn || !context || !this.master) return;
    if (context.currentTime - this.metroNext > 0.5) {
      this.metroNext = context.currentTime + 0.05;
      this.metroBeat = 0;
    }
    while (this.metroNext < context.currentTime + 0.1) {
      this.metroClick(this.metroNext, this.metroBeat % 4 === 0);
      this.metroBeat += 1;
      this.metroNext += 60 / bpm;
    }
  }

  metroClick(when: number, accent: boolean): void {
    const context = this.context;
    if (!context || !this.master) return;
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
  }

  startDrone(rootPitchClass: number): void {
    this.ensureAudio();
    this.stopDrone();
    [36 + rootPitchClass, 43 + rootPitchClass].forEach(midi => {
      this.droneVoices.push(this.makeVoice(midiToFrequency(midi), 52));
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
