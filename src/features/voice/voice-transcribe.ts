import * as theory from '../../domain/theory.js';
import { byId, downloadBlob, inputById, maybeById, selectById } from '../../domain/dom.js';
import { renderGrandStaff } from '../../domain/grand-staff.js';
import { PC_FLAT, PC_SHARP, type SrScore, type SrToken } from '../../domain/score-types.js';
import { detectVoicePitch as trxAutoCorrelate } from '../../domain/voice-pitch.js';
import type { AppHost } from '../../domain/views.js';
import { livePitch, measureStaffPaper, micClose, micOpen } from './voice-mic.js';

const SCALES = theory.SCALE_DEFINITIONS;
const pc = theory.pitchClass;
const midiToFreq = theory.midiToFrequency;

export interface TranscribeNote {
  midi: number;
  start: number;
  dur: number;
}

export interface TranscribeDisplayNote {
  midi: number;
  sb: number;
  db: number;
  label: string;
}

export interface TranscribeState {
  on: boolean;
  pending: boolean;
  micRequest: number;
  stream: MediaStream | null;
  src: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
  buf: Float32Array<ArrayBuffer> | null;
  raf: number;
  notes: TranscribeNote[];
  display: TranscribeDisplayNote[] | null;
  curMidi: number | null;
  curStart: number;
  lastVoice: number;
  lastPitchTs: number;
  ring: number[];
  hlTimers: number[];
  bpm?: number;
}

export const TRX_VALS = [
  { b: 4, l: '1/1' },
  { b: 3, l: '1/2.' },
  { b: 2, l: '1/2' },
  { b: 1.5, l: '1/4.' },
  { b: 1, l: '1/4' },
  { b: 0.75, l: '1/8.' },
  { b: 0.5, l: '1/8' },
  { b: 0.25, l: '1/16' },
] as const;

export function trxFreqToMidi(f: number): number {
  return Math.round(69 + 12 * Math.log2(f / 440));
}

export function trxDurLabel(beats: number): string {
  let best: (typeof TRX_VALS)[number] = TRX_VALS[0];
  let bd = 1e9;
  TRX_VALS.forEach((v) => {
    const d = Math.abs(v.b - beats);
    if (d < bd) {
      bd = d;
      best = v;
    }
  });
  return best.l;
}

export function trxPushVar(arr: number[], value: number): void {
  let v = Math.max(0, Math.round(value));
  const b = [v & 0x7F];
  v >>= 7;
  while (v > 0) {
    b.unshift((v & 0x7F) | 0x80);
    v >>= 7;
  }
  b.forEach((x) => arr.push(x));
}

export interface TranscribeController {
  readonly state: TranscribeState;
  start(): Promise<void>;
  stop(): void;
  render(): void;
  play(): void;
  clear(): void;
  exportMidi(): void;
  exportTxt(): void;
  openInPieces(): Promise<void>;
  renderControls(): void;
  snap(midi: number): number;
  median(): number;
  closeNote(tEnd: number): void;
  loop(ts?: number): void;
  buildMidi(): Uint8Array<ArrayBuffer>;
  download(name: string, blob: Blob | MediaSource): void;
  clearHighlightTimers(): void;
}

export function createTranscribeController(
  host: AppHost,
  isHumActive: () => boolean,
): TranscribeController {
  const trx: TranscribeState = {
    on: false,
    pending: false,
    micRequest: 0,
    stream: null,
    src: null,
    analyser: null,
    buf: null,
    raf: 0,
    notes: [],
    display: null,
    curMidi: null,
    curStart: 0,
    lastVoice: 0,
    lastPitchTs: 0,
    ring: [],
    hlTimers: [],
  };

  const trxCountTimers: number[] = [];
  function clearCountTimers(): void {
    while (trxCountTimers.length) clearTimeout(trxCountTimers.pop());
  }

  function clearHighlightTimers(): void {
    trx.hlTimers.forEach(clearTimeout);
    trx.hlTimers = [];
  }

  function trxMedian(): number {
    const a = trx.ring.slice().sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  }

  function trxCloseNote(tEnd: number): void {
    if (trx.curMidi == null) return;
    const dur = tEnd - trx.curStart;
    if (dur >= 0.09) trx.notes.push({ midi: trx.curMidi, start: trx.curStart, dur });
    trx.curMidi = null;
  }

  function trxSnap(midi: number): number {
    if (!inputById('tr-snap').checked) return midi;
    const root = +(selectById('tr-skey').value || 0);
    const scale = SCALES[selectById('tr-sscale').value] || SCALES['Major (Ionian)'];
    const set = scale.map((s) => (root + s) % 12);
    let best = midi;
    let bd = 99;
    for (let dd = -2; dd <= 2; dd++) {
      if (set.includes(((midi + dd) % 12 + 12) % 12) && Math.abs(dd) < bd) {
        bd = Math.abs(dd);
        best = midi + dd;
      }
    }
    return best;
  }

  function trxRender(): void {
    const out = byId('tr-out');
    out.innerHTML = '';
    if (!trx.notes.length) {
      byId('tr-msg').textContent = host.i18n.t('tr_none');
      const staff = maybeById('tr-staff');
      if (staff) {
        staff.hidden = true;
        staff.innerHTML = '';
      }
      byId('tr-actions').style.display = 'none';
      return;
    }
    byId('tr-msg').textContent = '';
    trx.bpm = +(inputById('tr-bpm').value || 90);
    const beatSec = 60 / trx.bpm;
    const quant = inputById('tr-quant').checked;
    const step = 4 / (+(selectById('tr-gridSel').value || 8)); // step in beats
    const base = trx.notes[0].start;
    trx.display = trx.notes.map((n) => {
      let sb = (n.start - base) / beatSec;
      let db = n.dur / beatSec;
      if (quant) {
        sb = Math.round(sb / step) * step;
        db = Math.max(step, Math.round(db / step) * step);
      }
      return { midi: trxSnap(n.midi), sb, db, label: quant ? trxDurLabel(db) : '' };
    });
    const maxDb = Math.max(...trx.display.map((n) => n.db));
    trx.display.forEach((n) => {
      const w = Math.max(16, Math.round(120 * n.db / maxDb));
      const el = document.createElement('div');
      el.className = 'tr-note';
      el.innerHTML = '<span class="nm">' + host.i18n.noteName(n.midi, false) + '</span><span class="bar" style="width:' + w + 'px"></span>' + (n.label ? '<span class="dl">' + n.label + '</span>' : '');
      out.appendChild(el);
    });
    const staff = maybeById('tr-staff');
    if (staff) {
      const durs = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
      const snapDur = (d: number) => durs.reduce((best, cur) => (Math.abs(cur - d) < Math.abs(best - d) ? cur : best), 1);
      const midis = trx.display.map((n) => n.midi).sort((a, b) => a - b);
      const isBass = (midis[Math.floor(midis.length / 2)] ?? 60) < 57;
      const flatKey = [5, 10, 3, 8, 1, 6].includes(+(selectById('tr-skey').value || 0));
      const tokens: SrToken[] = trx.display.slice(0, 16).map((n) => {
        const sym = (flatKey ? PC_FLAT : PC_SHARP)[pc(n.midi)];
        return [sym + (Math.floor(n.midi / 12) - 1), snapDur(n.db)];
      });
      const score: SrScore = isBass ? { ts: [4, 4], keyN: 0, lh: tokens } : { ts: [4, 4], keyN: 0, rh: tokens };
      staff.hidden = false;
      const lay = measureStaffPaper(staff) ?? { width: 520 };
      staff.innerHTML = renderGrandStaff(
        score,
        { width: Math.max(320, lay.width), maxBars: 4 },
        { namesVisible: false, notation: host.i18n.notation(), proportional: false },
      ).svg;
    }
    byId('tr-actions').style.display = 'flex';
  }

  function trxStop(): void {
    trx.micRequest++;
    clearCountTimers();
    trx.pending = false;
    byId('tr-rec').textContent = host.i18n.t('tr_rec');
    if (!trx.on) {
      if (!trx.notes.length) byId('tr-msg').textContent = '';
      return;
    }
    trx.on = false;
    cancelAnimationFrame(trx.raf);
    trxCloseNote(host.audio.context()?.currentTime ?? 0);
    micClose(trx.src, trx.stream);
    trx.src = null;
    trx.stream = null;
    trx.analyser = null;
    byId('tr-rec').classList.remove('rec-on');
    byId('tr-rec').textContent = host.i18n.t('tr_rec');
    byId('tr-live').classList.remove('rec');
    byId('tr-live').textContent = '—';
    trxRender();
  }

  function trxLoop(ts: number = performance.now()): void {
    if (!trx.on) return;
    const ctx = host.audio.context();
    if (!trx.analyser || !trx.buf || !ctx) {
      trxStop();
      return;
    }
    if (trx.stream && !trx.stream.getAudioTracks().some((track) => track.readyState === 'live')) {
      trxStop();
      byId('tr-msg').textContent = host.i18n.t('tr_micended');
      return;
    }
    if (ts - trx.lastPitchTs >= 33) {
      trx.lastPitchTs = ts;
      trx.analyser.getFloatTimeDomainData(trx.buf);
      const f = trxAutoCorrelate(trx.buf, ctx.sampleRate);
      const now = ctx.currentTime;
      if (f < 0) {
        if (trx.curMidi != null && now - trx.lastVoice > 0.12) {
          trxCloseNote(now);
          trx.ring = [];
        }
        if (now - trx.lastVoice > 0.15) byId('tr-live').textContent = '—';
      } else {
        trx.lastVoice = now;
        let m = trxFreqToMidi(f);
        m = Math.max(36, Math.min(88, m));
        trx.ring.push(m);
        if (trx.ring.length > 5) trx.ring.shift();
        const sm = trxMedian();
        const cents = Math.round(1200 * Math.log2(f / midiToFreq(sm)));
        livePitch(host, byId('tr-live'), sm, cents);
        if (trx.ring.length >= 3) {
          if (trx.curMidi == null) {
            trx.curMidi = sm;
            trx.curStart = now;
          } else if (sm !== trx.curMidi) {
            trxCloseNote(now);
            trx.curMidi = sm;
            trx.curStart = now;
          }
        }
      }
    }
    trx.raf = requestAnimationFrame(trxLoop);
  }

  async function trxStart(): Promise<void> {
    if (trx.on || trx.pending) return;
    host.previews.stopAll();
    clearHighlightTimers();
    clearCountTimers();
    host.dock.clear('rh');
    const request = ++trx.micRequest;
    trx.pending = true;
    byId('tr-rec').textContent = host.i18n.t('tr_stop');
    const wantCountIn = maybeById('tr-countin') instanceof HTMLInputElement && inputById('tr-countin').checked;
    if (wantCountIn) {
      const ctx = host.audio.ensure();
      const bpm = +(inputById('tr-bpm').value || 90);
      const beatSec = 60 / Math.max(40, bpm);
      const countPromise = new Promise<boolean>((resolve) => {
        for (let b = 0; b < 4; b++) {
          trxCountTimers.push(window.setTimeout(() => {
            if (request !== trx.micRequest || !trx.pending) {
              resolve(false);
              return;
            }
            byId('tr-msg').textContent = host.i18n.t('tr_countin_msg', b + 1);
            if (ctx) host.audio.scheduleClick(ctx.currentTime + 0.01, b === 0);
          }, b * beatSec * 1000));
        }
        trxCountTimers.push(window.setTimeout(() => {
          resolve(request === trx.micRequest && trx.pending);
        }, 4 * beatSec * 1000));
      });
      const ok = await countPromise;
      if (!ok) return;
    }
    const tap = await micOpen(host, () => request === trx.micRequest && isHumActive());
    if (tap === 'stale') return;
    trx.pending = false;
    if (tap === 'fail') {
      byId('tr-rec').textContent = host.i18n.t('tr_rec');
      byId('tr-msg').textContent = host.i18n.t('tr_micfail');
      return;
    }
    byId('tr-msg').textContent = '';
    trx.stream = tap.stream;
    trx.src = tap.src;
    trx.analyser = tap.analyser;
    trx.buf = tap.buf;
    trx.on = true;
    trx.notes = [];
    trx.display = null;
    trx.curMidi = null;
    trx.ring = [];
    trx.lastVoice = host.audio.context()?.currentTime ?? 0;
    byId('tr-rec').classList.add('rec-on');
    byId('tr-rec').textContent = host.i18n.t('tr_stop');
    byId('tr-live').classList.add('rec');
    byId('tr-actions').style.display = 'none';
    byId('tr-out').innerHTML = '';
    for (const track of tap.stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (trx.stream !== tap.stream || tap.stream.getAudioTracks().some((input) => input.readyState === 'live')) return;
        trxStop();
        byId('tr-msg').textContent = host.i18n.t('tr_micended');
      }, { once: true });
    }
    trxLoop();
  }

  function trxPlay(): void {
    if (!trx.display || !trx.display.length) return;
    const ctx = host.audio.ensure();
    host.previews.stopAll();
    clearHighlightTimers();
    const beatSec = 60 / (trx.bpm || 90);
    const now = ctx ? ctx.currentTime : 0;
    const t0 = now + 0.12;
    trx.display.forEach((n) => {
      const when = t0 + n.sb * beatSec;
      const dur = Math.max(0.12, n.db * beatSec * 0.95);
      const onMs = (when - now) * 1000;
      if (ctx) host.audio.previewNote(n.midi, when, dur, 100);
      trx.hlTimers.push(window.setTimeout(() => host.dock.mark(n.midi, 'rh', true), Math.max(0, onMs)));
      trx.hlTimers.push(window.setTimeout(() => {
        host.dock.clearKeyIfState(n.midi, 'rh', true);
      }, Math.max(0, onMs + Math.min(dur, 1.0) * 1000)));
    });
  }

  function trxBuildMidi(): Uint8Array<ArrayBuffer> {
    const TPQN = 480;
    const bpm = trx.bpm || 90;
    const ev: { t: number; k: number; m: number }[] = [];
    if (!trx.display) throw new Error('Étude: no transcription to export');
    trx.display.forEach((n) => {
      const on = Math.round(n.sb * TPQN);
      const off = on + Math.max(1, Math.round(n.db * TPQN));
      ev.push({ t: on, k: 1, m: n.midi });
      ev.push({ t: off, k: 0, m: n.midi });
    });
    ev.sort((a, b) => a.t - b.t || a.k - b.k);
    const trk: number[] = [];
    const mpqn = Math.round(60000000 / bpm);
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255);
    let last = 0;
    ev.forEach((e) => {
      trxPushVar(trk, e.t - last);
      last = e.t;
      trk.push(e.k ? 0x90 : 0x80, e.m & 127, e.k ? 90 : 0);
    });
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x2F, 0x00);
    const head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQN >> 8) & 255, TPQN & 255];
    const L = trk.length;
    const th = [0x4D, 0x54, 0x72, 0x6B, (L >> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255];
    const out = new Uint8Array(new ArrayBuffer(head.length + th.length + L));
    out.set(head, 0);
    out.set(th, head.length);
    out.set(trk, head.length + th.length);
    return out;
  }

  function trxDownload(name: string, blob: Blob | MediaSource): void {
    downloadBlob(name, blob);
  }

  function trxExportMidi(): void {
    if (!trx.display || !trx.display.length) return;
    trxDownload('etude-melody.mid', new Blob([trxBuildMidi()], { type: 'audio/midi' }));
  }

  async function trxOpenInPieces(): Promise<void> {
    if (!trx.display || !trx.display.length) return;
    trxStop();
    const file = new File([trxBuildMidi()], 'etude-melody.mid', { type: 'audio/midi' });
    await host.nav.show('analysis', { openFile: file });
  }

  function trxExportTxt(): void {
    if (!trx.display || !trx.display.length) return;
    const txt = host.i18n.t('tr_export_melody') + '\nTempo: ' + (trx.bpm || 90) + ' BPM\n\n' +
      host.i18n.t('tr_export_note') + '\t' + host.i18n.t('tr_export_val') + '\n' +
      trx.display.map((n) => host.i18n.noteName(n.midi, false) + '\t' + (n.label || '')).join('\n') + '\n';
    trxDownload('etude-melody.txt', new Blob([txt], { type: 'text/plain' }));
  }

  function trxClear(): void {
    trxStop();
    trx.notes = [];
    trx.display = null;
    clearHighlightTimers();
    host.dock.clear('rh');
    const staff = maybeById('tr-staff');
    if (staff) {
      staff.hidden = true;
      staff.innerHTML = '';
    }
    byId('tr-out').innerHTML = '';
    byId('tr-actions').style.display = 'none';
    byId('tr-msg').textContent = '';
  }

  function renderTranscribe(): void {
    const ks = selectById('tr-skey');
    if (ks) {
      const v = ks.value;
      host.i18n.fillRoots(ks, false);
      ks.value = String(v || 0);
    }
    const ss = selectById('tr-sscale');
    if (ss) {
      const selected = ss.value;
      ss.replaceChildren(...Object.keys(SCALES).map((nm) => new Option(host.i18n.scaleDisp(nm), nm)));
      if (selected && Object.prototype.hasOwnProperty.call(SCALES, selected)) ss.value = selected;
    }
  }

  return {
    state: trx,
    start: trxStart,
    stop: trxStop,
    render: trxRender,
    play: trxPlay,
    clear: trxClear,
    exportMidi: trxExportMidi,
    exportTxt: trxExportTxt,
    openInPieces: trxOpenInPieces,
    renderControls: renderTranscribe,
    snap: trxSnap,
    median: trxMedian,
    closeNote: trxCloseNote,
    loop: trxLoop,
    buildMidi: trxBuildMidi,
    download: trxDownload,
    clearHighlightTimers,
  };
}
