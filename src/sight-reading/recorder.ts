export type SightReadingInputKind = 'on' | 'off';
export type SightReadingInputSource = string;
export type SightReadingInputFamily = 'midi' | 'ble' | 'keyboard' | 'pointer';
export type SightReadingReleaseKind = 'physical' | 'focus' | 'reset' | null;
export type SightReadingRecordedInput = {
  readonly id: string;
  readonly midi: number;
  readonly onMs: number;
  readonly offMs: number | null;
  readonly source: SightReadingInputSource;
  readonly releaseKind: SightReadingReleaseKind;
};
export type SightReadingRecorderOptions = {
  readonly durationMs: number;
  readonly onChange?: (inputs: readonly SightReadingRecordedInput[]) => void;
};

const EXCLUDED_SOURCES: readonly SightReadingInputSource[] = ['srClick', 'previewNote', 'srListen', 'srPlayGap'];

export function srtInputFamily(source: SightReadingInputSource): SightReadingInputFamily | null {
  if (source === 'midi' || source.startsWith('midi:')) return 'midi';
  if (source === 'ble' || source.startsWith('ble:')) return 'ble';
  if (source === 'keyboard' || source.startsWith('typing:') || source === 'rdk' || source.startsWith('rdk:') || source.startsWith('fall:')) return 'keyboard';
  if (source === 'pointer' || source.startsWith('pointer:') || source === 'button' || source.startsWith('button:')) return 'pointer';
  return null;
}

export class SightReadingRecorder {
  readonly inputs: SightReadingRecordedInput[] = [];
  private readonly held = new Map<number, SightReadingRecordedInput>();
  private readonly ignored = new Set<number>();
  private readonly families = new Set<SightReadingInputFamily>();
  private nextId = 1;
  private readonly durationMs: number;
  private readonly onChange?: (inputs: readonly SightReadingRecordedInput[]) => void;

  public constructor(options: SightReadingRecorderOptions) {
    this.durationMs = options.durationMs;
    this.onChange = options.onChange;
  }

  public trackSource(source: SightReadingInputSource, timestampMs: number): void {
    if (timestampMs < -250 || timestampMs > this.durationMs + 250 || EXCLUDED_SOURCES.includes(source)) return;
    const family = srtInputFamily(source);
    if (family) this.families.add(family);
  }

  public get sourceFamilies(): readonly SightReadingInputFamily[] {
    return [...this.families];
  }

  public get mixedInput(): boolean {
    return this.families.size > 1;
  }

  public record(kind: SightReadingInputKind, midi: number, source: SightReadingInputSource, releaseKind: SightReadingReleaseKind, timestampMs: number): void {
    if (EXCLUDED_SOURCES.includes(source)) return;
    if (kind === 'on') {
      this.trackSource(source, timestampMs);
      if (this.held.has(midi) || this.ignored.has(midi)) return;
      if (timestampMs < -250) {
        this.ignored.add(midi);
        return;
      }
      if (timestampMs > this.durationMs + 250) return;
      const input: SightReadingRecordedInput = {
        id: `input-${this.nextId++}`, midi, onMs: timestampMs, offMs: null, source, releaseKind: null,
      };
      this.held.set(midi, input);
      this.inputs.push(input);
      this.onChange?.(this.inputs);
      return;
    }
    const input = this.held.get(midi);
    if (input) {
      const index = this.inputs.findIndex((item) => item.id === input.id);
      if (index >= 0) this.inputs[index] = { ...input, offMs: timestampMs, releaseKind };
      this.held.delete(midi);
      this.onChange?.(this.inputs);
    }
    this.ignored.delete(midi);
  }

  public releaseAll(releaseKind: SightReadingReleaseKind, timestampMs: number): void {
    for (const midi of [...this.held.keys()]) this.record('off', midi, 'kb', releaseKind, timestampMs);
    this.ignored.clear();
  }

  public releaseFocus(timestampMs: number): void {
    for (const [midi, input] of [...this.held.entries()]) {
      if (input.source === 'midi' || input.source === 'ble') continue;
      this.record('off', midi, input.source, 'focus', timestampMs);
    }
    this.ignored.clear();
  }

  public finish(): readonly SightReadingRecordedInput[] {
    return this.inputs.slice().sort((a, b) => a.onMs - b.onMs || a.id.localeCompare(b.id));
  }
}

export function srtCreateRecorder(options: SightReadingRecorderOptions): SightReadingRecorder {
  return new SightReadingRecorder(options);
}
