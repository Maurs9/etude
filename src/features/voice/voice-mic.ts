import type { SrLayout } from '../../domain/score-types.js';
import type { AppHost } from '../../domain/views.js';

export interface MicTap {
  stream: MediaStream;
  src: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
}

/**
 * Opens the raw microphone (no echo cancellation, noise suppression, or gain control)
 * into an analyser that is never connected to speakers. Returns `'stale'` if the caller
 * stopped wanting it while the browser prompted, closing all tracks immediately.
 */
export async function micOpen(
  host: AppHost,
  wanted: () => boolean,
): Promise<MicTap | 'fail' | 'stale'> {
  host.audio.ensure();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'fail';
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    return wanted() ? 'fail' : 'stale';
  }
  if (!wanted()) {
    stream.getTracks().forEach((tr) => tr.stop());
    return 'stale';
  }
  try {
    const ac = host.audio.requireContext();
    if (ac.state !== 'running') void ac.resume().catch(() => undefined);
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = ac.sampleRate >= 90000 ? 8192 : ac.sampleRate >= 44000 ? 4096 : 2048;
    src.connect(analyser);
    return { stream, src, analyser, buf: new Float32Array(analyser.fftSize) };
  } catch {
    stream.getTracks().forEach((tr) => tr.stop());
    return 'fail';
  }
}

export function micClose(
  src: MediaStreamAudioSourceNode | null,
  stream: MediaStream | null,
): void {
  if (src) {
    try {
      src.disconnect();
    } catch {
      // Ignore disconnect errors on already-closed audio nodes.
    }
  }
  if (stream) stream.getTracks().forEach((tr) => tr.stop());
}

/** Live pitch readout shared by both Voice activities (`.tr-live`). */
export function livePitch(
  host: AppHost,
  el: HTMLElement,
  midi: number,
  cents?: number,
): void {
  const key = midi + ':' + (cents ?? '');
  if (!el.classList.contains('rec')) el.classList.add('rec');
  if (el.dataset.lastPitch === key) return;
  el.dataset.lastPitch = key;
  el.innerHTML = host.i18n.noteName(midi, false) + (cents === undefined ? '' : '<small>' + (cents >= 0 ? '+' : '') + cents + '¢</small>');
}

export function measureStaffPaper(wrap: HTMLElement | null): SrLayout | undefined {
  if (!wrap || !wrap.clientWidth) return undefined;
  const cs = getComputedStyle(wrap);
  return {
    width: Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
  };
}

export function staffPaperChanged(
  prev: SrLayout | undefined,
  next: SrLayout | undefined,
): boolean {
  if (!next) return false;
  if (!prev || prev.maxHeight !== next.maxHeight) return true;
  if (Math.abs((prev.cap ?? 0) - (next.cap ?? 0)) > 0.02) return true;
  return next.width < prev.width || next.width - prev.width >= 24;
}
