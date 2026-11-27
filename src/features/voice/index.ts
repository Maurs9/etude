import { byId, eventClosest, inputById, maybeById, queryAllHtml } from '../../domain/dom.js';
import {
  SS_LEVELS, SS_MAJ, SS_MIN, SS_SYL_MAJ, SS_SYL_MIN,
  ssBassClef, ssGen, ssKeySig, ssLedger, ssMakeNote, ssNextDeg, ssPick,
  ssRender, ssStem, ssSyllables, ssTimeSig, ssTrebleClef,
} from '../../domain/sightsing-render.js';
import { detectVoicePitch as trxAutoCorrelate } from '../../domain/voice-pitch.js';
import type { AppHost, FeatureController, TestSurfaceRegistry } from '../../domain/views.js';
import { livePitch, micClose, micOpen } from './voice-mic.js';
import { createSightSingController, ssNeed } from './voice-sing.js';
import {
  TRX_VALS, createTranscribeController, trxDurLabel, trxFreqToMidi, trxPushVar,
} from './voice-transcribe.js';

export type VoiceAct = 'sing' | 'hum';
export const VOICE_ACTS: readonly VoiceAct[] = ['sing', 'hum'];

function fieldEl(event: Event): HTMLInputElement | HTMLSelectElement {
  const t = event.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) return t;
  throw new Error('Étude: expected form field event target');
}

function segmentButtons(event: Event): HTMLElement[] {
  const c = event.currentTarget;
  return c instanceof Element ? queryAllHtml(c, 'button') : [];
}

export function createVoiceFeature(host: AppHost): FeatureController {
  let mounted = false;
  const voice: { act: VoiceAct } = { act: 'sing' };

  function voiceActive(a: VoiceAct): boolean {
    return host.nav.activeView() === 'sing' && voice.act === a;
  }

  const transcribe = createTranscribeController(host, () => voiceActive('hum'));
  const sightSing = createSightSingController(host, () => voiceActive('sing'));

  function voiceStop(): void {
    sightSing.stopAll();
    transcribe.stop();
    transcribe.clearHighlightTimers();
    host.dock.clear('rh');
  }

  function voiceSync(): void {
    queryAllHtml(document, '#vo-switch [role=tab]').forEach((b) => {
      const on = b.dataset.act === voice.act;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    byId('vo-sing').hidden = voice.act !== 'sing';
    byId('vo-hum').hidden = voice.act !== 'hum';
  }

  function renderVoice(): void {
    voiceSync();
    if (voice.act === 'sing') sightSing.render();
    else transcribe.renderControls();
  }

  function voiceSetAct(a: VoiceAct): void {
    if (a !== voice.act && host.nav.activeView() === 'sing') voiceStop();
    voice.act = a;
    if (host.nav.activeView() === 'sing') renderVoice();
    else voiceSync();
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;

    // Activity switch tab list (arrows, Home and End move along it and choose).
    byId('vo-switch').addEventListener('click', (e) => {
      const b = eventClosest(e, '[role=tab]');
      const a = VOICE_ACTS.find((x) => x === b?.dataset.act);
      if (a) voiceSetAct(a);
    });
    byId('vo-switch').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const i = VOICE_ACTS.indexOf(voice.act);
      const n = VOICE_ACTS.length;
      const a = e.key === 'Home'
        ? VOICE_ACTS[0]
        : e.key === 'End'
          ? VOICE_ACTS[n - 1]
          : VOICE_ACTS[(i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n];
      voiceSetAct(a);
      byId('vo-tab-' + a).focus();
    });

    // Hum to notes (Transcribe)
    byId('tr-rec').addEventListener('click', () => {
      if (transcribe.state.on || transcribe.state.pending) transcribe.stop();
      else void transcribe.start();
    });
    byId('tr-play').addEventListener('click', transcribe.play);
    byId('tr-clear').addEventListener('click', transcribe.clear);
    byId('tr-pieces').addEventListener('click', () => { void transcribe.openInPieces(); });
    byId('tr-midi').addEventListener('click', transcribe.exportMidi);
    byId('tr-txt').addEventListener('click', transcribe.exportTxt);
    byId('tr-bpm').addEventListener('input', (e) => { byId('tr-bpmLbl').textContent = fieldEl(e).value; });
    ['tr-snap', 'tr-skey', 'tr-sscale', 'tr-quant', 'tr-bpm', 'tr-gridSel'].forEach((id) => {
      byId(id).addEventListener('change', () => {
        if (transcribe.state.notes && transcribe.state.notes.length) transcribe.render();
      });
    });

    // Sing from the staff (Sight-Singing)
    byId('si-mode').addEventListener('click', (e) => {
      const b = eventClosest(e, 'button');
      if (!b) return;
      sightSing.stopAll();
      segmentButtons(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      sightSing.state.mode = b.dataset.v ?? sightSing.state.mode;
      sightSing.modeUI();
      byId('si-verdict').textContent = '';
      byId('si-hint').textContent = '';
      sightSing.paint();
    });
    byId('si-level').addEventListener('change', (e) => {
      sightSing.stopAll();
      sightSing.state.level = +fieldEl(e).value;
      sightSing.newExercise();
    });
    maybeById('si-range')?.addEventListener('change', (e) => {
      sightSing.stopAll();
      const r = fieldEl(e).value;
      sightSing.state.range = (r === 'tenor' || r === 'bass') ? r : 'soprano';
      sightSing.state.clef = sightSing.state.range === 'bass' ? 'bass' : 'treble';
      const clefEl = maybeById('si-clef');
      if (clefEl instanceof HTMLSelectElement) clefEl.value = sightSing.state.clef;
      sightSing.newExercise();
    });
    byId('si-clef').addEventListener('change', (e) => {
      sightSing.stopAll();
      sightSing.state.clef = fieldEl(e).value;
      if (sightSing.state.clef === 'bass') sightSing.state.range = 'bass';
      else if (sightSing.state.range === 'bass') sightSing.state.range = 'soprano';
      const rangeEl = maybeById('si-range');
      if (rangeEl instanceof HTMLSelectElement) rangeEl.value = sightSing.state.range;
      sightSing.newExercise();
    });
    maybeById('si-lbl-mode')?.addEventListener('change', (e) => {
      const v = fieldEl(e).value;
      sightSing.state.labelMode = (v === 'degree' || v === 'note') ? v : 'solfege';
      sightSing.draw();
    });
    byId('si-solf').addEventListener('change', () => {
      byId('si-staff').classList.toggle('nosolf', !inputById('si-solf').checked);
    });
    byId('si-new').addEventListener('click', () => {
      sightSing.stopAll();
      sightSing.newExercise();
      byId('si-verdict').textContent = '';
      byId('si-hint').textContent = '';
    });
    byId('si-go').addEventListener('click', sightSing.go);
    byId('si-tonic').addEventListener('click', sightSing.tonic);
    byId('si-playit').addEventListener('click', sightSing.playIt);
    byId('si-drone').addEventListener('change', sightSing.drone);
    byId('si-bpm').addEventListener('input', (e) => {
      const v = fieldEl(e).value;
      byId('si-bpmLbl').textContent = v;
      sightSing.state.bpm = +v;
    });

    if (typeof ResizeObserver === 'function') {
      let fitRaf = 0;
      const fit = new ResizeObserver(() => {
        cancelAnimationFrame(fitRaf);
        fitRaf = requestAnimationFrame(() => { sightSing.fit(); });
      });
      ['si-staff', 'dock'].forEach((id) => {
        const el = maybeById(id);
        if (el) fit.observe(el);
      });
    }

    host.input.subscribe((event) => {
      if (host.nav.activeView() === 'sing' && sightSing.state.active && event.kind === 'on' && event.midi != null) {
        sightSing.keyInput(event.midi);
      }
    });
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted) return;
    const requestedAct = params?.voiceAct;
    if (requestedAct === 'hum' && voice.act !== 'hum') {
      if (params?.wasOnSing === true) voiceStop();
      voice.act = 'hum';
    }
    renderVoice();
  }

  function leave(): void {
    voiceStop();
  }

  function isBusy(): boolean {
    return sightSing.state.active || transcribe.state.on;
  }

  function panic(): void {
    transcribe.stop();
    transcribe.clearHighlightTimers();
    sightSing.stopAll();
  }

  function localize(): void {
    transcribe.renderControls();
    if (transcribe.state.notes.length) transcribe.render();
    sightSing.fillLevels();
    if (sightSing.state.ex) {
      sightSing.state.ex.syl = ssSyllables(sightSing.state.ex.minor, host.i18n.lang());
      sightSing.draw();
    }
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      SS_LEVELS: { get: () => SS_LEVELS },
      SS_MAJ: { get: () => SS_MAJ },
      SS_MIN: { get: () => SS_MIN },
      SS_SYL_MAJ: { get: () => SS_SYL_MAJ },
      SS_SYL_MIN: { get: () => SS_SYL_MIN },
      TRX_VALS: { get: () => TRX_VALS },
      livePitch: { get: () => (el: HTMLElement, midi: number, cents?: number) => livePitch(host, el, midi, cents) },
      micClose: { get: () => micClose },
      micOpen: { get: () => (wanted: () => boolean) => micOpen(host, wanted) },
      renderSing: { get: () => sightSing.render },
      renderTranscribe: { get: () => transcribe.renderControls },
      renderVoice: { get: () => renderVoice },
      sing: { get: () => sightSing.state },
      singGo: { get: () => sightSing.go },
      singKeyInput: { get: () => sightSing.keyInput },
      singStopAll: { get: () => sightSing.stopAll },
      ssBassClef: { get: () => ssBassClef },
      ssBeatToX: { get: () => sightSing.beatToX },
      ssBumpProgress: { get: () => sightSing.bumpProgress },
      ssClearTrail: { get: () => sightSing.clearTrail },
      ssCurNote: { get: () => sightSing.curNote },
      ssCursorEl: { get: () => sightSing.cursorEl },
      ssDraw: { get: () => sightSing.draw },
      ssDrawTrail: { get: () => sightSing.drawTrail },
      ssDrone: { get: () => sightSing.drone },
      ssFillLevels: { get: () => sightSing.fillLevels },
      ssFit: { get: () => sightSing.fit },
      ssFlash: { get: () => sightSing.flash },
      ssFreeLoop: { get: () => sightSing.freeLoop },
      ssFreeStart: { get: () => sightSing.freeStart },
      ssGen: { get: () => ssGen },
      ssHintBump: { get: () => sightSing.hintBump },
      ssKeySig: { get: () => ssKeySig },
      ssLedger: { get: () => ssLedger },
      ssMakeNote: { get: () => ssMakeNote },
      ssMicMaybe: { get: () => sightSing.micMaybe },
      ssMicStart: { get: () => sightSing.micStart },
      ssMicStop: { get: () => sightSing.micStop },
      ssModeUI: { get: () => sightSing.modeUI },
      ssMoveCursor: { get: () => sightSing.moveCursor },
      ssNeed: { get: () => ssNeed },
      ssNewExercise: { get: () => sightSing.newExercise },
      ssNextDeg: { get: () => ssNextDeg },
      ssNoteCorrect: { get: () => sightSing.noteCorrect },
      ssNoteFinish: { get: () => sightSing.noteFinish },
      ssNoteLoop: { get: () => sightSing.noteLoop },
      ssNoteStart: { get: () => sightSing.noteStart },
      ssPaint: { get: () => sightSing.paint },
      ssPhraseGrade: { get: () => sightSing.phraseGrade },
      ssPhraseLoop: { get: () => sightSing.phraseLoop },
      ssPhraseStart: { get: () => sightSing.phraseStart },
      ssPick: { get: () => ssPick },
      ssPitchY: { get: () => sightSing.pitchY },
      ssPlayIt: { get: () => sightSing.playIt },
      ssReadPitch: { get: () => sightSing.readPitch },
      ssRemoveCursor: { get: () => sightSing.removeCursor },
      ssRender: { get: () => ssRender },
      ssScrollToCur: { get: () => sightSing.scrollToCur },
      ssScrollToX: { get: () => sightSing.scrollToX },
      ssStem: { get: () => ssStem },
      ssSvg: { get: () => sightSing.svg },
      ssSyllables: { get: () => ssSyllables },
      ssTimeSig: { get: () => ssTimeSig },
      ssTonic: { get: () => sightSing.tonic },
      ssTonicShift: { get: () => sightSing.tonicShift },
      ssTrebleClef: { get: () => ssTrebleClef },
      trx: { get: () => transcribe.state },
      trxAutoCorrelate: { get: () => trxAutoCorrelate },
      trxBuildMidi: { get: () => transcribe.buildMidi },
      trxClear: { get: () => transcribe.clear },
      trxCloseNote: { get: () => transcribe.closeNote },
      trxDownload: { get: () => transcribe.download },
      trxDurLabel: { get: () => trxDurLabel },
      trxExportMidi: { get: () => transcribe.exportMidi },
      trxExportTxt: { get: () => transcribe.exportTxt },
      trxFreqToMidi: { get: () => trxFreqToMidi },
      trxLoop: { get: () => transcribe.loop },
      trxMedian: { get: () => transcribe.median },
      trxPlay: { get: () => transcribe.play },
      trxPushVar: { get: () => trxPushVar },
      trxRender: { get: () => transcribe.render },
      trxSnap: { get: () => transcribe.snap },
      trxStart: { get: () => transcribe.start },
      trxStop: { get: () => transcribe.stop },
      voice: { get: () => voice },
      voiceActive: { get: () => voiceActive },
      voiceSetAct: { get: () => voiceSetAct },
      voiceStop: { get: () => voiceStop },
      voiceSync: { get: () => voiceSync },
    });
  }

  return {
    mount,
    enter,
    leave,
    isBusy,
    panic,
    localize,
    registerTestSurface,
  };
}
