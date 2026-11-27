import { libraryText } from '../../locales/library-runtime.js';
import * as storage from '../../domain/storage.js';
import * as theory from '../../domain/theory.js';
import { evaluateWaitChord } from '../../domain/wait-chord.js';
import type { MeasureMistakeGroup, PracticeMistakeEvent } from '../../domain/practice-mistakes.js';
import type { ScoreSelectionGesture } from '../../domain/score-gestures.js';
import * as audio from '../../domain/audio.js';
import type * as notationApi from '../../domain/notation.js';
import * as scoreLibraryStore from '../../domain/score-library-store.js';
import { AN_MAX_BYTES, AN_MAX_NOTES, SC_BASE, SC_PAGE_W, anError, scoreHasKey, xmlEsc, type AnMidiKeyMeta, type AnMidiMeta, type AnNote, type AnSource, type ScoreMeasure, type ScoreXmlKey } from '../../domain/score-types.js';
import type { AnHarmonySeg, AnSpanReading, ChordSelectionAnalysis, IsolatedNoteAnalysis, LassoPoint, ScoreSelectionAnalysis, SelectedNoteNeighbor, SelectionNeighborSummary, TwoNoteSelectionAnalysis } from '../../domain/score-harmony.js';
import type { ScoreGeoAnchor, ScoreGeoMeasure, ScoreGeoSystem, ScoreGeometry, ScoreSym } from '../../domain/score-symbols.js';
import type { ExpressiveNotePlan } from '../../domain/score-expression.js';
import { PIECES } from '../../domain/repertoire-data.js';
import type { ScoreOsmdSystem } from '../../domain/score-svg-post.js';
import type { ScoreMidiNote } from '../../domain/score-midi.js';
import type { LibraryController, LibraryItem, LibraryMetadata, LibraryResume } from '../../domain/score-library-types.js';
import type { ImportedScoreDifficultyOptions } from '../../domain/score-difficulty-import.js';
import { byId, maybeById, inputById, selectById, buttonById, eventElement, eventClosest, queryHtml, queryAllHtml } from '../../domain/dom.js';
import { inputLag } from '../../domain/midi-timing.js';
import type { PerformanceRange, PerformanceTimeline } from '../../domain/performance-timeline.js';
import { SCORE_SIDE_TABS, type AppHost, type CoachTip, type ScorePlayerController, type ScorePlayerShell, type TestSurfaceRegistry, type UiPrefsSnapshot } from '../../domain/views.js';
import * as router from '../../domain/router.js';
import type { AnalysisRoute } from '../../domain/router.js';
import { localDayNumber } from '../../core/sync-merge.js';
import { AN_SMUFL_NOTES, anAssignHands, anParse, anXmlTidy, bindScoreGestures, buildExpressiveTempos, buildScoreExpression, classifyUnmatchedKeyPress, computeFitWidthLayout, createCursorCurves, cursorCurveAt, defaultInflatedSize, ensureScoreModules, extractSustainMistakes, gradePracticeSustain, groupPracticeMistakes, importMxlPreflight, importReadXml, isScoreOsmdSheet, notationReloadMessage, performanceAt, performanceMarkers, performanceOf, performanceTimeline, performanceWindow, pracAcc, practicePassageBounds, practicePercent, practiceSustainReference, rememberScorePedalLayout, repeatRanges, scoreBeams, scoreFeature, scoreFixFingerings, scoreFixPedalsDefault, scoreMidiToXml, scoreModulesReady, scoreNightSweep, scoreRingFit, scoreShiftY, scoreStyleHeader, scoreXmlEndings, scoreXmlLayout, scoreXmlNotes, scoreXmlRepeatBars } from './score-modules.js';
import { createAnState, createPanelSide, createPracticeState, createScoreState, AN_POPS, AN_PROFILE, anClock, anKeyInfo, anLibraryMetadata, anMeasureIndex, anPieceToParsed, anSegIndexAt, anSignedSemi, defaultScoreTool, isPracChoice, isPracFlag, PRAC_FLAGS, PRAC_KEY, pracEveryNote, pracRaw, pracSegAt, SC_FIT, SCORE_BASE_MARGINS, SCORE_LOOK, scoreToUser, scoreVisibleEntries, type AnAnalysisModel, type AnCatalogTab, type AnExamplePiece, type AnListContext, type AnPanelFocus, type AnPanelSide, type AnPanelSpanRow, type AnScreen, type AnSelectionFocus, type AnSpanBeatFacts, type AnSpanChordFacts, type AnSpanNctFacts, type AnSpanNoteFacts, type AnState, type PracticeBarrier, type PracticeBeat, type PracticeCarry, type PracticeCountIn, type PracticeRun, type PracticeSaved, type PracticeSegment, type PracticeStartOptions, type PracticeState, type PracticeTimedNote, type ScoreCrossLink, type ScoreCursorPos, type ScoreEngravingRules, type ScoreLoopState, type ScoreMeasureRange, type ScoreState } from './score-state.js';
import { createFallState, FALL_BLACK, FALL_COL, FALL_FONT, FALL_NUDGE, FALL_PAL, FALL_SEC, FALL_SEL, FALL_YOU, fallDrawBlackKey, fallKeyPath, fallKeys, fallPalette, fallRR, type FallGeo, type FallHandColours, type FallKeyRect, type FallPalette, type FallState } from './score-falling.js';
import { samePitch } from '../../core/pitch-match.js';

const pc = theory.pitchClass, spellMidi = theory.spellMidi, keyFromFifths = theory.keyFromFifths, keyFifths = theory.keyFifths;
const anFnKey = theory.analysisFunction, srKeyName = theory.circleKeyPitchClass, chordDegreeMap = theory.chordDegreeMap;
const anKeyRank = theory.anKeyRank, anIntervalName = theory.anIntervalName, anResolveKey = theory.anResolveKey;

export function createScorePlayerFeature(host: AppHost, shell: ScorePlayerShell): ScorePlayerController {
  const t = host.i18n.t;
  const { noteName, invName, intervalLabel } = host.i18n;
  const saveAll = host.store.saveNow, saveSoon = host.store.saveSoon;
  const stopPreviews = host.audio.stopPreviews;
  const reduceMotion = host.reduceMotion;
  const dockSync = host.dock.sync, dockSet = host.dock.setOpen, dockShown = host.dock.isShown, kbDegrees = host.dock.setDegrees;
  const midiLive = host.input.isMidiLive;
  const {
    view0, kbState, ensureAudio, pianoEnsure, stopClicks, buildKeyboard, repaintHeld, foldToView, dockOpen,
    handleNoteOn, handleNoteOff, touchInput, inField, blurInputField, touchDay, scoreFocusExit,
    scoreFocusToggle, appConfirm, learnGoId, defaultScoreLayoutForViewport, savedScoreView, identifyChord,
    srPieceTitle, spelledName, tl, anNum, tf, coachList, coachHTML,
  } = shell;
  const anLayoutVars = shell.layoutVars;
  const showNotationReloadPrompt = () => shell.showNotationReloadPrompt(notationReloadMessage);
  const todayN = () => localDayNumber();
  const loadOsmd = () => import('../../domain/notation.js').then((m) => m.loadOsmd());
  const createScoreRenderer = (container: Element, options: Record<string, unknown>) => import('../../domain/notation.js').then((m) => m.createScoreRenderer(container, options));
  const mxlToXml = (bytes: ArrayBuffer) => import('../../domain/notation.js').then((m) => m.mxlToXml(bytes));
  let scoreLibrary: LibraryController | null = null;
  /* Score & analysis · Now: one thing worth noticing in the bar (or passage, or selection) on show, from its own analysis */
  function anCoach(f: { kind: string; a: number; b: number; lo?: number; hi?: number; }, segs: readonly AnHarmonySeg[], notes: readonly theory.TheoryNote[], selAnalysis?: ScoreSelectionAnalysis | null) {
      if (!f || !AN.view || !notes.length)
          return null;
      const v = AN.view, one = f.a === f.b, fall = FALL.mode === 'fall', K = (s: AnHarmonySeg) => anKeyAt(s.start), lab = (s: AnHarmonySeg) => anChordLabel(s, K(s)), rn = (s: AnHarmonySeg) => scoreFeature.harmony.anRoman(K(s), s);
      const tip = (k: string, ...a: unknown[]) => ({ h: t(f.kind === 'sel' ? 'coach_sel' : one ? 'coach_bar' : 'coach_pass'), text: tf(k, ...a) });
      if (f.kind === 'sel' && selAnalysis) {
          if (selAnalysis.kind === 'note') {
              const noteLbl = spellName(selAnalysis.note.midi, selAnalysis.key, true);
              if (selAnalysis.chordRole === 'nct' && selAnalysis.localSeg)
                  return tip('cn_note_nct', noteLbl, t('an_nct_' + (selAnalysis.nctType || 'other')), anChordLabel(selAnalysis.localSeg, selAnalysis.key));
              if (selAnalysis.localSeg && selAnalysis.chordRole)
                  return tip('cn_note_role', noteLbl + ' (' + t('an_deg_label', selAnalysis.degreeLabel) + ')', t('an_role_' + selAnalysis.chordRole), anChordLabel(selAnalysis.localSeg, selAnalysis.key) + ' (' + scoreFeature.harmony.anRoman(selAnalysis.key, selAnalysis.localSeg) + ')');
              return tip('cn_note_deg', noteLbl, selAnalysis.degreeLabel);
          }
          if (selAnalysis.kind === 'interval') {
              const ivLbl = intervalLabel(Math.abs(selAnalysis.semitones)), kindLbl = t(selAnalysis.simultaneous ? 'an_iv_sim' : 'an_iv_mel');
              if (selAnalysis.neighbors.contextChord) {
                  const cc = selAnalysis.neighbors.contextChord, ctxLbl = spellName(60 + cc.rootPc, selAnalysis.key) + cc.symbol + (cc.inversion > 0 ? '/' + spellName(60 + cc.bassPc, selAnalysis.key) : '');
                  return tip('cn_iv_ctx', ivLbl, kindLbl, ctxLbl);
              }
              return tip('cn_iv_hint', ivLbl, kindLbl);
          }
          if (selAnalysis.kind === 'chord' && !segs.length && selAnalysis.directChord) {
              const dc = selAnalysis.directChord, synth = { ch: { root: dc.rootPc, c: dc.template }, bass: dc.bassPc };
              const sLab = spellName(60 + dc.rootPc, selAnalysis.key) + dc.template.s + (dc.bassPc !== dc.rootPc ? '/' + spellName(60 + dc.bassPc, selAnalysis.key) : '');
              return tip('cn_' + anFnKey(selAnalysis.key, synth.ch.root, scoreFeature.harmony.anRoman(selAnalysis.key, synth)), sLab);
          }
      }
      const cadTip = (s: AnHarmonySeg) => {
          const idx = v.segs.indexOf(s);
          const a = v.segs[idx - 1];
          const nxt = v.segs[idx + 1];
          const span = s.cad === 'cad64' ? (nxt ? rn(s) + ' → ' + rn(nxt) : rn(s)) : (s.cad === 'half' || !a ? rn(s) : rn(a) + ' → ' + rn(s));
          return tip('cn_cad_' + s.cad, span);
      };
      const nct = segs.flatMap((s) => (s.nct || []).filter((x) => x.type !== 'other').map((x) => ({ x, s }))), nctNames = () => [...new Set(nct.map(({ x, s }) => spellName(x.note.midi, K(s), true)))];
      if (!segs.length)
          return fall ? tip('cn_fall') : null;
      if (!one) {
          const info = anKeyInfo(notes), main = v.mainKey;
          if (info.conf !== 'low' && (info.best.root !== main.root || !!info.best.minor !== !!main.minor))
              return tip('cn_key', anKeyName(info.best), anKeyName(main));
          const cad = segs.filter((s) => s.cad).pop();
          if (cad)
              return cadTip(cad);
          if (nct.length >= 2) {
              const ns = nctNames();
              return tip('cn_nct_pass', ns.slice(0, 3).join(', ') + (ns.length > 3 ? ' …' : ''));
          }
          return tip(fall ? 'cn_fall' : 'cn_bass');
      }
      const cad = segs.find((s) => s.cad);
      if (cad)
          return cadTip(cad);
      if (nct.length)
          return tip('cn_nct', coachList(nctNames().slice(0, 3)), [...new Set(nct.map(({ x }) => t('an_nct_' + x.type)))].join(', '));
      const sec = segs.find((s) => rn(s).includes('/'));
      if (sec)
          return tip('cn_sec', lab(sec), rn(sec));
      const inv = !v.implied && segs.find((s) => scoreFeature.harmony.anInv(s) > 0);
      if (inv) {
          const k = K(inv);
          return tip('cn_inv', spellName(60 + (inv.bass ?? 0), k), spellName(60 + inv.ch.root, k) + inv.ch.c.s + ', ' + invName(scoreFeature.harmony.anInv(inv)));
      }
      const amb = segs.find((s) => s.ch.conf === 'low');
      if (amb)
          return tip('cn_amb', [lab(amb), ...amb.ch.alts.map((a) => spellName(60 + a.root, K(amb)) + a.c.s)].slice(0, 3).join(' / '));
      if (v.implied)
          return tip('cn_implied', lab(segs[0]));
      if (fall)
          return tip('cn_fall');
      const s = segs[0];
      return tip('cn_' + anFnKey(K(s), s.ch.root, rn(s)), lab(s));
  }
  /* Score & analysis · practice summary: the next step from how the run went — clean, slips bunched in a bar or two, missed notes,
     wrong keys, or loose timing — with a button that sets it up and plays the same passage again. */
  function pracWeakHand() { let rh = 0, lh = 0; PRAC.res.forEach((r, i) => { if (r !== 'miss')
      return; const n = AN.notes[i]; if (n && scoreFeature.harmony.anHandOf(n) === 'lh')
      lh++;
  else
      rh++; }); return lh > rh ? 'lh' : 'rh'; }
  function pracLoopBars(i: number, j: number) {
      const ms = anMeasures(), lo = ms[i].start, hi = ms[j].end, g = SCORE.geo, gi = (b: number) => g ? g.measures.findIndex((m) => m && b >= m.b0 - 1e-6 && b < m.b1 - 1e-6) : -1, a = gi(lo + 1e-4), b = gi(hi - 1e-4);
      if (a >= 0 && b >= 0)
          scoreSelectRange(a, b);
      else
          anSelectNotes(AN.notes.filter((n) => n.start >= lo - 1e-6 && n.start < hi - 1e-6));
      if (AN.selected.size)
          scoreLoopStart();
  }
  function pracNextStep(R: { segs?: { f: number; }[]; sel: boolean; from?: number | null; origin?: number; a: number; b: number; }): CoachTip | null {
      const st = PRAC.stats, acc = st && pracAcc(st);
      if (acc == null || !st)
          return null;
      const f = (R.segs && R.segs[0] && R.segs[0].f) || pracFactor(), both = new Set(AN.notes.map(scoreFeature.harmony.anHandOf)).size > 1;
      const again = () => { pracSumClose(); if (R.sel && AN.selected.size)
          scorePlay(true);
      else
          scorePlay(false, R.origin ?? R.from); };
      if (acc >= .95 && st.wrong <= 1) {
          const sel = selectById('score-speed'), next = [...sel.options].map((o) => +o.value).find((v) => v > Math.round(f * 100) && v <= 100);
          if (next)
              return { k: 'pn_clean_tempo', args: () => [Math.round(f * 100) + '%'], act: { k: 'pn_act_faster', args: () => [next + '%'], run: () => { sel.value = String(next); pracHud(); anUpdateControls(); again(); } } };
          if (PRAC.hands !== 'both' && both)
              return { k: 'pn_clean_hands', act: { k: 'rd_both', run: () => { pracSet('hands', 'both'); again(); } } };
          if (pracWait())
              return { k: 'pn_clean_wait', act: { k: 'pn_act_time', run: () => { pracSet('wait', false); again(); } } };
          return { k: 'pn_clean' };
      }
      const ms = anMeasures(), bar = (b: number) => { let i = 0; for (let j = 0; j < ms.length; j++) {
          if (ms[j].start <= b + 1e-6)
              i = j;
          else
              break;
      } return i; };
      const misses = [...PRAC.res].filter(([, r]) => r === 'miss').map(([i]) => AN.notes[i]).filter(Boolean);
      if (misses.length >= 3 && bar(scoreBeatAt(R.b) - 1e-4) - bar(scoreBeatAt(R.a)) >= 3) {
          const per = new Map<number, number>();
          misses.forEach((n: { start: number; }) => { const i = bar(n.start); per.set(i, (per.get(i) || 0) + 1); });
          let best: { c: number; i: number; j: number; } | null = null;
          for (const [i, c] of per) {
              const two = c + (per.get(i + 1) || 0);
              if (!best || two > best.c)
                  best = { i, j: per.has(i + 1) ? i + 1 : i, c: two };
          }
          if (best && best.c >= misses.length * .6) {
              const { i: bi, j: bj } = best;
              const label = () => anBarsLabel(AN.notes.filter((n: { start: number; }) => { const i = bar(n.start); return i >= bi && i <= bj; }));
              return { k: 'pn_bars', args: () => [label()], act: { k: 'pn_act_loop', args: () => [label()], run: () => { pracSumClose(); pracLoopBars(bi, bj); } } };
          }
      }
      if (st.miss >= 3 && st.miss >= st.wrong && !pracWait())
          return { k: 'pn_wait', args: () => [st.miss], act: { k: 'pr_wait', run: () => { pracSet('wait', true); again(); } } };
      if (st.wrong >= 3 && st.wrong > st.miss) {
          const h = PRAC.hands === 'both' && both ? pracWeakHand() : null;
          return { k: 'pn_wrong', args: () => [st.wrong], act: h ? { k: h === 'lh' ? 'rd_lh' : 'rd_rh', run: () => { pracSet('hands', h); again(); } } : null };
      }
      if (st.good > st.perfect && st.good >= 4)
          return { k: FALL.mode === 'fall' ? 'pn_loose_fall' : 'pn_loose' };
      return { k: acc < .7 ? 'pn_slower' : 'pn_ok' };
  }
  function pracNextRender() { const box = byId('pr-sum-next'), n = PRAC.next; if (!box)
      return; box.hidden = !n; box.innerHTML = n ? coachHTML(t('coach_next'), n, 'pr-next-act') : ''; }
  const AN: AnState = createAnState();
  // Library records own original bytes; parsed/engraved objects remain disposable runtime state.
  let anLibraryActive: { id: string; source: AnSource } | null = null;
  let anLibrarySuspended = false;
  let anLibraryNavigationResume: LibraryResume | null = null;
  let anLibraryTimer: ReturnType<typeof setTimeout> | undefined;
  let anLibraryPlayTimer: ReturnType<typeof setInterval> | undefined;
  let anLibrarySaving = 0;
  let anLibraryWrites: Promise<void> = Promise.resolve();
  const anLibraryDirty = new Map<string, LibraryResume>();
  const anLibrarySaved = new Map<string, string>();
  function anLibrarySyncPlayTimer() {
      const want = SCORE.playing && !!anLibraryActive && anLibraryActive.source === AN.source && !anLibrarySuspended;
      if (want && !anLibraryPlayTimer) {
          anLibraryPlayTimer = setInterval(() => {
              if (SCORE.playing && (anLibraryActive || anLibraryDirty.size))
                  void anLibraryFlush().catch(() => {});
              else
                  anLibrarySyncPlayTimer();
          }, 3000);
      }
      else if (!want && anLibraryPlayTimer) {
          clearInterval(anLibraryPlayTimer);
          anLibraryPlayTimer = undefined;
      }
  }
  function anLibraryCapture(): LibraryResume | null {
      const active = anLibraryActive;
      if (!active || active.source !== AN.source || anLibrarySuspended || AN.loading || !AN.notes.length)
          return null;
      const position = Math.max(0, Math.min(fallEnd(), fallTime()));
      const performance = SCORE.loop || SCORE.sel ? performanceOf(performancePlan(), position) : performanceRead().position;
      const resume: LibraryResume = {
          performance, elapsed: SCORE.loop || SCORE.sel ? performance / pracFactor() : performanceRead().elapsed,
          ...(AN.source?.kind === 'midi' ? { recon: { ...AN.recon } } : {}),
          position, measure: String(anMeasureAt(scoreBeatAt(position)).number),
          speed: +(selectById('score-speed').value || 100),
          hands: PRAC.hands === 'rh' ? 'rh' : PRAC.hands === 'lh' ? 'lh' : 'both',
          wait: PRAC.wait, metronome: PRAC.metro,
          view: FALL.mode === 'fall' ? 'fall' : SCORE.layout,
          viewExplicit: scoreLayoutExplicit,
          look: SCORE.look === 'night' ? 'night' : 'paper', zoom: anZoomNow(),
      };
      if (anLibraryDirty.has(active.id) || anLibrarySaved.get(active.id) !== JSON.stringify(resume))
          anLibraryDirty.set(active.id, resume);
      return resume;
  }
  function anLibrarySchedule() {
      anLibraryCapture();
      if (!anLibraryDirty.size)
          return;
      clearTimeout(anLibraryTimer);
      anLibraryTimer = setTimeout(() => { void anLibraryFlush().catch(() => {}); }, 350);
  }
  async function anLibraryFlush(capture = true): Promise<void> {
      clearTimeout(anLibraryTimer);
      if (capture)
          anLibraryCapture();
      const pending = [...anLibraryDirty];
      const operation = anLibraryWrites.then(async () => {
          for (const [id, resume] of pending) {
              const item = await scoreLibraryStore.libraryUpdate(id, { resume });
              // A score deleted in this or another tab must never be recreated by a delayed checkpoint.
              if (anLibraryDirty.get(id) === resume)
                  anLibraryDirty.delete(id);
              if (item)
                  anLibrarySaved.set(id, JSON.stringify(resume));
              else if (anLibraryActive?.id === id)
                  anLibraryActive = null;
          }
      });
      anLibraryWrites = operation.catch(() => {});
      try {
          await operation;
          if (pending.length)
              await scoreLibrary?.refresh();
      }
      catch (error) {
          scoreLibrary?.notice('save_failed');
          throw error;
      }
  }
  function anLibraryDetach() {
      anLibraryCapture();
      void anLibraryFlush(false).catch(() => {});
      anLibraryActive = null;
      anLibrarySuspended = false;
      anLibraryNavigationResume = null;
      anLibrarySyncPlayTimer();
  }
  async function anLibraryInspect(file: File): Promise<LibraryMetadata> {
      if (!/\.(mid|midi|xml|musicxml|mxl)$/i.test(file.name) || !file.size || file.size > AN_MAX_BYTES)
          throw anError('type');
      const title = file.name.replace(/\.[^.]+$/, '');
      if (/\.(mxl|xml|musicxml)$/i.test(file.name))
          return anLibraryMetadata(await anReadXml(file, title));
      const parsed = anParse(await file.arrayBuffer());
      if (!parsed.notes.length || parsed.notes.length > AN_MAX_NOTES)
          throw anError('midi');
      return { title, composer: '' };
  }
  async function anInspectDifficulty(file: File, startingBpm?: number, options?: ImportedScoreDifficultyOptions) {
      const [{ estimateImportedScore }] = await Promise.all([import('../../domain/score-difficulty-import.js'), ensureModules()]);
      if (!file.size || file.size > AN_MAX_BYTES || !/\.(mid|midi|xml|musicxml|mxl)$/i.test(file.name))
          throw anError('type');
      const title = file.name.replace(/\.[^.]+$/, '');
      if (!/\.midi?$/i.test(file.name))
          return estimateImportedScore(await anReadXml(file, title, true), startingBpm, options);
      const parsed = anParse(await file.arrayBuffer());
      if (!parsed.notes.length || parsed.notes.length > AN_MAX_NOTES) throw anError('midi');
      return estimateImportedScore({ kind: 'midi', title, label: file.name, parsed }, startingBpm, options);
  }
  function anLibraryRestoreResume(resume: LibraryResume) {
      selectById('score-speed').value = String(resume.speed);
      pracSet('hands', resume.hands);
      pracSet('wait', resume.wait);
      pracSet('metro', resume.metronome);
      const view = savedScoreView(resume.view, resume.viewExplicit);
      if (view) {
          scoreLayoutExplicit = true;
          scoreSetView(view);
      }
      scoreSetLook(resume.look);
      scoreZoom(resume.zoom);
      FALL.position = Math.max(0, Math.min(fallEnd(), resume.position));
      performanceSeekScore(FALL.position, true);
      if (resume.performance !== undefined) {
          const p = performanceAt(performancePlan(), resume.performance);
          if (Math.abs(p.score - FALL.position) < .01) {
              PERFORMANCE.position = p.position;
              PERFORMANCE.elapsed = resume.elapsed ?? p.position / pracFactor();
          }
      }
      scoreIdle();
  }
  let anScreen: AnScreen = 'catalog';
  let anCatalogTab: AnCatalogTab = 'builtin';
  let anCatalogTabManual = false;
  let anLibraryItems: readonly LibraryItem[] = [];
  let anContinueTarget: { kind: 'lib'; id: string } | { kind: 'builtin'; id: string; speed?: number; measure?: string; elapsed?: number } | null = null;
  let anListContext: AnListContext | null = null;
  let anFromListDepth = 0;
  function anSetCatalogTab(tab: AnCatalogTab, manual = false, focus = false) {
      anCatalogTab = tab;
      if (manual) anCatalogTabManual = true;
      const tabs: [AnCatalogTab, string, string][] = [
          ['library', 'an-tab-library', 'an-cat-panel-library'],
          ['builtin', 'an-tab-builtin', 'an-cat-panel-builtin'],
      ];
      for (const [key, btnId, panelId] of tabs) {
          const btn = maybeById(btnId), panel = maybeById(panelId), on = key === tab;
          if (btn) {
              btn.setAttribute('aria-selected', on ? 'true' : 'false');
              btn.tabIndex = on ? 0 : -1;
              if (on && focus) btn.focus({ preventScroll: true });
          }
          if (panel) panel.hidden = !on;
      }
      if (tab === 'library') {
          const details = maybeById('score-library');
          if (details instanceof HTMLDetailsElement && !details.open) details.open = true;
      } else {
          const pick = maybeById('pc-pick');
          if (pick instanceof HTMLDetailsElement && !pick.open) pick.open = true;
      }
  }
  function anLibraryItemsChanged(items: readonly LibraryItem[]) {
      anLibraryItems = items;
      const countEl = maybeById('an-tab-library-count');
      if (countEl) countEl.textContent = items.length ? `(${items.length})` : '';
      if (!anCatalogTabManual)
          anSetCatalogTab(items.length > 0 ? 'library' : 'builtin');
      anRenderContinueCard();
  }
  function anRecordBuiltinProgress() {
      if (AN.source?.kind !== 'example' || !AN.notes.length) return;
      const pos = Math.max(0, Math.min(fallEnd(), fallTime()));
      const beat = scoreBeatAt(pos);
      const measure = String(anMeasureAt(beat).number);
      const speed = +(selectById('score-speed').value || 100);
      const elapsed = SCORE.loop || SCORE.sel ? performanceOf(performancePlan(), pos) / pracFactor() : performanceRead().elapsed;
      host.store.data().lastBuiltinPiece = { id: AN.source.id, at: Date.now(), measure, speed, elapsed };
      saveSoon();
  }
  function anRenderContinueCard() {
      const card = maybeById('an-continue'), titleEl = maybeById('an-continue-title'), metaEl = maybeById('an-continue-meta');
      if (!card || !titleEl || !metaEl) return;
      let bestLib: LibraryItem | null = null;
      for (const item of anLibraryItems) {
          if (item.lastOpenedAt === null && !item.resume) continue;
          const ts = item.lastOpenedAt ?? item.addedAt;
          if (!bestLib || ts > (bestLib.lastOpenedAt ?? bestLib.addedAt)) bestLib = item;
      }
      const libAt = bestLib ? (bestLib.lastOpenedAt ?? bestLib.addedAt) : -1;
      const bp = host.store.data().lastBuiltinPiece;
      const builtinPiece = bp ? PIECES.find((p) => p.id === bp.id) : undefined;
      const builtinAt = builtinPiece && bp ? bp.at : -1;
      if (libAt < 0 && builtinAt < 0) {
          anContinueTarget = null;
          card.hidden = true;
          return;
      }
      if (libAt >= builtinAt && bestLib) {
          anContinueTarget = { kind: 'lib', id: bestLib.id };
          titleEl.textContent = bestLib.title || bestLib.name;
          const parts: string[] = [];
          if (bestLib.resume?.measure) parts.push(t('an_continue_bar', bestLib.resume.measure));
          if (bestLib.best !== undefined) parts.push(`${bestLib.best}%`);
          else if (bestLib.resume?.speed) parts.push(`${bestLib.resume.speed}%`);
          metaEl.textContent = parts.join(' · ');
          card.hidden = false;
          return;
      }
      if (builtinPiece && bp) {
          anContinueTarget = { kind: 'builtin', id: builtinPiece.id, speed: bp.speed, measure: bp.measure, elapsed: bp.elapsed };
          titleEl.textContent = srPieceTitle(builtinPiece);
          const rec = host.store.data().sheet[builtinPiece.id];
          const parts: string[] = [];
          if (bp.measure) parts.push(t('an_continue_bar', bp.measure));
          if (rec?.best) parts.push(`${rec.best}%`);
          else if (bp.speed) parts.push(`${bp.speed}%`);
          metaEl.textContent = parts.join(' · ');
          card.hidden = false;
      }
  }
  function anCurrentRoute(): AnalysisRoute {
      if (anScreen === 'player' && AN.source) {
          if (AN.source.kind === 'example')
              return { kind: 'builtin', id: AN.source.id };
          if (anLibraryActive?.source === AN.source)
              return { kind: 'lib', id: anLibraryActive.id };
      }
      return { kind: 'catalog' };
  }
  function anRouteMatches(a: AnalysisRoute, b: AnalysisRoute): boolean {
      if (a.kind !== b.kind) return false;
      return a.kind === 'catalog' || (b.kind !== 'catalog' && a.id === b.id);
  }
  function anCatalogStatus(msg?: string, kind: 'info' | 'error' = 'error', allowRetry = false) {
      const el = maybeById('an-catalog-status'), banner = maybeById('an-import-banner'), retry = maybeById('an-import-retry');
      const text = msg?.trim() ?? '';
      if (el) el.textContent = text;
      if (banner) {
          banner.hidden = !text;
          banner.classList.toggle('is-error', Boolean(text && kind === 'error'));
      }
      if (retry) retry.hidden = !(text && kind === 'error' && allowRetry);
  }
  function anCaptureListContext(focusSelector?: string | null) {
      if (view0() !== 'analysis' || anScreen !== 'catalog') return;
      let selector = focusSelector ?? null;
      if (!selector && document.activeElement instanceof HTMLElement) {
          const pieceBtn = document.activeElement.closest<HTMLElement>('#pc-list .pc-item[data-piece]');
          if (pieceBtn?.dataset.piece) {
              selector = `#pc-list .pc-item[data-piece="${CSS.escape(pieceBtn.dataset.piece)}"]`;
          } else {
              const libRow = document.activeElement.closest<HTMLElement>('#library-items [data-library-id]');
              if (libRow?.dataset.libraryId)
                  selector = `#library-items [data-library-id="${CSS.escape(libRow.dataset.libraryId)}"] [data-library-action="open"]`;
          }
      }
      anListContext = { fromList: true, scrollY: window.scrollY, focusSelector: selector, activeTab: anCatalogTab };
      anFromListDepth = 0;
  }
  function anRestoreListContext() {
      const ctx = anListContext;
      anListContext = null;
      anFromListDepth = 0;
      if (!ctx) return;
      anSetCatalogTab(ctx.activeTab);
      const focusTarget = (selector: string): 'focused' | 'disabled' | 'missing' => {
          if (view0() !== 'analysis' || anScreen !== 'catalog') return 'missing';
          const target = document.querySelector(selector);
          if (!(target instanceof HTMLElement) || !target.isConnected || !target.getClientRects().length)
              return 'missing';
          if (target instanceof HTMLButtonElement && target.disabled)
              return 'disabled';
          target.focus({ preventScroll: true });
          return document.activeElement === target ? 'focused' : 'missing';
      };
      requestAnimationFrame(() => {
          if (view0() !== 'analysis' || anScreen !== 'catalog') return;
          window.scrollTo({ top: Math.max(0, ctx.scrollY), behavior: 'auto' });
          if (!ctx.focusSelector) return;
          const selector = ctx.focusSelector;
          if (focusTarget(selector) === 'disabled') {
              const target = document.querySelector(selector);
              if (target instanceof HTMLElement) {
                  const observer = new MutationObserver(() => {
                      if (focusTarget(selector) !== 'disabled')
                          observer.disconnect();
                  });
                  observer.observe(target, { attributes: true, attributeFilter: ['disabled'] });
                  setTimeout(() => observer.disconnect(), 2000);
              }
          }
      });
  }
  function anSetScreen(screen: AnScreen) {
      if (anScreen === screen && maybeById('view-analysis')?.dataset.anScreen === screen) {
          const cat = maybeById('an-catalog'), panel = maybeById('an-panel');
          if (cat) cat.hidden = screen !== 'catalog';
          if (panel) panel.hidden = screen !== 'player';
          return;
      }
      anScreen = screen;
      const viewEl = maybeById('view-analysis');
      if (viewEl) viewEl.dataset.anScreen = screen;
      const cat = maybeById('an-catalog');
      if (cat) cat.hidden = screen !== 'catalog';
      const panel = maybeById('an-panel');
      if (panel) panel.hidden = screen !== 'player';
      anSideSync();
      anUpdateControls();
      anLayoutVars();
  }
  function anSyncPlayerHistory(route: AnalysisRoute, fromHistory = false, forceReplace = false) {
      if (fromHistory || view0() !== 'analysis' || anScreen !== 'player') return;
      const hash = router.formatAnalysisHash(route);
      if (location.hash === hash) return;
      try {
          if (forceReplace || anFromListDepth > 0) {
              history.replaceState(history.state, '', hash);
          }
          else {
              history.pushState(null, '', hash);
              if (anListContext?.fromList)
                  anFromListDepth++;
          }
      }
      catch (_) { }
  }
  function anCancelOpening() {
      if (!AN.loading) return;
      anRollbackOpening?.();
      AN.loadToken++;
      anSetLoading(false);
  }
  function anExitToCatalog(fromHistory = false) {
      if (!fromHistory) shell.bumpNavigation();
      anCancelOpening();
      if (anScreen === 'player') anRecordBuiltinProgress();
      if (SCORE.playing)
          anStopAtCursor();
      else
          stopPreviews();
      anKeysClear();
      AN_POPS.forEach(([p] = []) => anPop(p, false));
      anReconOpen(false);
      if (shell.scoreFocus.owner === 'analysis') scoreFocusExit(true);
      else pcStageSet(false, true);
      anLibraryCapture();
      void anLibraryFlush(false).catch(() => {});
      const canPopBack = !fromHistory && anListContext?.fromList && anFromListDepth === 1;
      anSetScreen('catalog');
      pcRender();
      anRenderContinueCard();
      anRestoreListContext();
      if (!fromHistory) {
          if (canPopBack) {
              try {
                  history.back();
                  return;
              }
              catch (_) { }
          }
          if (location.hash !== '#analysis') {
              try {
                  history.pushState(null, '', '#analysis');
              }
              catch (_) { }
          }
          anListContext = null;
          anFromListDepth = 0;
      }
  }
  async function anOpenRoute(route: AnalysisRoute, fromHistory = false): Promise<void> {
      anCatalogStatus('');
      if (route.kind === 'catalog') {
          anExitToCatalog(fromHistory);
          return;
      }
      if (route.kind === 'builtin') {
          const exists = PIECES.some((p) => p.id === route.id);
          if (!exists) {
              anSetScreen('catalog');
              anCatalogStatus(t('an_piece_not_found'));
              if (location.hash !== '#analysis') {
                  try { history.replaceState(history.state, '', '#analysis'); } catch (_) { }
              }
              return;
          }
          await anLoadExample(route.id, { fromHistory });
          return;
      }
      const navigation = shell.navigationToken(), hash = location.hash, opening = AN.loadToken;
      const stored = await scoreLibraryStore.libraryGet(route.id).catch(() => null);
      if (navigation !== shell.navigationToken() || hash !== location.hash || opening !== AN.loadToken) return;
      if (!stored) {
          anSetScreen('catalog');
          anCatalogStatus(t('an_piece_not_found'));
          if (location.hash !== '#analysis') {
              try { history.replaceState(history.state, '', '#analysis'); } catch (_) { }
          }
          return;
      }
      await anOpenFile(stored.file, stored.item, { fromHistory });
  }
  async function anLibraryOpen(item: LibraryItem, file: File): Promise<boolean> {
      anCaptureListContext(`#library-items [data-library-id="${CSS.escape(item.id)}"] [data-library-action="open"]`);
      return anOpenFile(file, item);
  }
  let scoreLibraryLoading: Promise<LibraryController> | null = null;
  function anLibraryEnsure(): Promise<LibraryController> {
      if (scoreLibrary)
          return Promise.resolve(scoreLibrary);
      if (!scoreLibraryLoading) {
          scoreLibraryLoading = import('../../domain/score-library-ui.js').then(({ initScoreLibrary }) => {
              if (!scoreLibrary) {
                  byId('score-library-root').replaceChildren();
                  scoreLibrary = initScoreLibrary(byId('score-library-root'), {
                      language: () => host.i18n.lang(), inspect: anLibraryInspect, difficulty: anInspectDifficulty, open: anLibraryOpen, flush: () => anLibraryFlush(), confirm: appConfirm, onItemsChanged: anLibraryItemsChanged,
                  });
              }
              return scoreLibrary;
          }).catch((error: unknown) => {
              scoreLibraryLoading = null;
              anSetCatalogTab('library');
              const root = byId('score-library-root'), message = document.createElement('p'), retry = document.createElement('button');
              message.setAttribute('role', 'status');
              message.textContent = libraryText(host.i18n.lang(), 'unavailable');
              retry.type = 'button';
              retry.className = 'btn';
              retry.textContent = t('rdn_retry');
              retry.addEventListener('click', () => { void anLibraryEnsure().catch(() => {}); });
              root.replaceChildren(message, retry);
              throw error;
          });
      }
      return scoreLibraryLoading;
  }
  function anLibraryInit() {
      if (router.viewFromHash(location.hash) === 'analysis')
          void anLibraryEnsure().catch(() => {});
      document.addEventListener('change', (event) => {
          if (eventElement(event)?.closest('#an-toolbar,#an-pt,#fall-pop,#fall-seek'))
              anLibrarySchedule();
      });
      document.addEventListener('pointerup', (event) => {
          if (eventElement(event)?.closest('#an-panel'))
              anLibrarySchedule();
      });
      document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden')
              void anLibraryFlush().catch(() => {});
      });
      window.addEventListener('beforeunload', (event) => {
          anLibraryCapture();
          if (!anLibraryDirty.size && !anLibrarySaving)
              return;
          void anLibraryFlush(false).catch(() => {});
          event.preventDefault();
          event.returnValue = '';
      });
  }
  function anKeyName(k: theory.KeySignature) { const f = k.fifths != null ? k.fifths : keyFifths(k.root, k.minor), s = spellMidi(60 + k.root, f, k.minor); return spelledName(host.i18n.notation(), s.li, s.acc, true) + ' ' + t(k.minor ? 'an_minor' : 'an_major'); }
  // Key-aware spelling: diatonic notes follow the signature, minor keys raise 6/7 on their own letters, other notes take the key's accidental direction.
  function anKeyAt(beat: number) { const ks = AN.keyMap; if (!ks.length)
      return { root: 0, minor: false, fifths: 0 }; let k = ks[0]; for (const x of ks)
      if (x.beat <= beat + 1e-6)
          k = x; return k; }
  function spellName(m: number, key: theory.KeySignature|null, withOct?: boolean) { const k = key || anKeyAt(0), s = spellMidi(m, k.fifths, k.minor); return spelledName(host.i18n.notation(), s.li, s.acc, true) + (withOct ? s.oct : ''); }
  /* harmony (pure logic lives in ./score-harmony.ts) */
  function anMeasures(): ScoreMeasure[] { if (SCORE.measures && SCORE.measures.length)
      return SCORE.measures; const end = AN.notes.length ? Math.max(...AN.notes.map((n) => n.end)) : 0, out: ScoreMeasure[] = []; for (let s = 0, i = 1; s < end; s += 4, i++)
      out.push({ number: String(i), start: s, end: s + 4, num: 4, den: 4 }); return out; }
  function anMeasureAt(beat: number) {
      const ms = anMeasures();
      return ms[anMeasureIndex(ms, beat)];
  }
  function anHarmonyCtx() {
      return {
          measures: anMeasures(),
          keyMap: AN.keyMap,
          harmonies: AN.source?.kind === 'xml' ? AN.source.harmonies : undefined,
          noteIndex: AN.index,
      };
  }
  function anClassifyNonChord(ns: readonly AnNote[], segs: AnHarmonySeg[]) {
      return scoreFeature.harmony.anClassifyNonChord(ns, segs, AN.index);
  }
  function anNoteInfo(sorted: readonly AnNote[]) {
      return scoreFeature.harmony.anNoteInfo(sorted, anMeasures());
  }
  function anCands(S: AnSpanReading, implied: boolean) {
      return scoreFeature.harmony.anCands(S, implied, anKeyAt(S.s), AN.source?.kind === 'xml' ? AN.source.harmonies : undefined);
  }
  function anHarmony(ns: readonly AnNote[], implied: boolean) {
      return scoreFeature.harmony.anHarmony(ns, implied, anHarmonyCtx());
  }
  function anCadences(segs: AnHarmonySeg[]) {
      return scoreFeature.harmony.anCadences(segs, AN.keyMap);
  }
  // Everything the workspace shows for one scope; strings are produced at render time so language and notation can change.
  function anCompute(ns: AnNote[], scopeKey: string): AnAnalysisModel {
      const ck = AN.version + '|' + scopeKey, cached = AN.cache.get(ck);
      if (cached)
          return cached;
      const lo = Math.min(...ns.map((n) => n.start)), hi = Math.max(...ns.map((n) => n.end)), pitches = [...new Set(ns.map((n) => n.midi))].sort((a, b) => a - b);
      const poly = scoreFeature.harmony.anPoly(ns), implied = poly.avg < 1.25, segs = scoreFeature.harmony.anHarmony(ns, implied, anHarmonyCtx());
      scoreFeature.harmony.anCadences(segs, AN.keyMap);
      const ms = anMeasures().filter((m) => m.end > lo + 1e-6 && m.start < hi - 1e-6);
      let beats = 0;
      ms.forEach((m) => { const s = Math.max(lo, m.start), e = Math.min(hi, m.end); if (e > s)
          beats += (e - s) / scoreFeature.harmony.anBeatUnit(m); });
      const starts = ns.map((n) => n.start).sort((a, b) => a - b);
      let onsets = 0, prev = -Infinity;
      starts.forEach((s) => { if (s - prev > 0.06)
          onsets++; prev = s; });
      const tAt = (b: number) => { let bpm = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
          if (e.beat <= b + 1e-6)
              bpm = e.bpm;
          else
              break;
      } return bpm; };
      const tempos = [tAt(lo), ...SCORE.tempoList.filter((e) => e.beat > lo + 1e-6 && e.beat < hi - 1e-6).map((e) => e.bpm)];
      const hands = ns.some((n) => n.hand) ? 'hands' : 'register', rh = ns.filter((n) => scoreFeature.harmony.anHandOf(n) === 'rh').length;
      const model = { ns, lo, hi, pitches, poly, implied, segs, ms, beats: Math.max(beats, 1e-6), onsets, tempos, hands, rh, lh: ns.length - rh,
          key: anKeyInfo(ns), mainKey: anKeyAt(lo), motifs: scoreFeature.harmony.anMotifs(ns), seconds: scoreSeconds(hi) - scoreSeconds(lo) };
      if (AN.cache.size > 16)
          AN.cache.clear();
      AN.cache.set(ck, model);
      return model;
  }
  let scoreLayoutExplicit = false;
  const SCORE: ScoreState = createScoreState(window.innerWidth, defaultScoreLayoutForViewport(window.innerWidth));
   // MuseScore-blue selection
  function scoreEnsureTempoTimes(): number[] {
      const list = SCORE.tempoList;
      if (SCORE.tempoTimes && SCORE.tempoTimesFor === list && SCORE.tempoTimes.length === list.length)
          return SCORE.tempoTimes;
      const times: number[] = new Array(list.length);
      let sec = 0, last = 0, bpm = list[0]?.bpm ?? 120;
      for (let i = 0; i < list.length; i++) {
          const e = list[i];
          sec += (e.beat - last) * 60 / bpm;
          times[i] = sec;
          last = e.beat;
          bpm = e.bpm;
      }
      SCORE.tempoTimes = times;
      SCORE.tempoTimesFor = list;
      return times;
  }
  function scoreUseExpressiveTempo() {
      return PRAC.expressive && !pracMetro() && !pracWait() && AN.source?.kind === 'xml' && !!AN.source.expression &&
          (AN.source.expression.tempoModifiers.length > 0 || AN.source.expression.fermatas.length > 0);
  }
  function scoreSetTempos(list: { beat: number; bpm: number; }[]) {
      SCORE.tempos = list.length ? list : [{ beat: 0, bpm: 120 }];
      const base = SCORE.tempos.slice().sort((a, b) => a.beat - b.beat);
      if (base[0].beat > 0)
          base.unshift({ beat: 0, bpm: base[0].bpm });
      if (scoreUseExpressiveTempo() && buildExpressiveTempos && AN.source?.kind === 'xml') {
          SCORE.tempoList = buildExpressiveTempos(base, SCORE.measures, AN.source.expression, true);
      } else {
          SCORE.tempoList = base;
      }
      SCORE.tempoTimes = undefined;
      SCORE.tempoTimesFor = null;
      scoreEnsureTempoTimes();
  }
  function scoreRefreshTempos() {
      const hasNotes = AN.notes.length > 0;
      const beat = hasNotes ? scoreBeatAt(FALL.position) : 0;
      const beatA = hasNotes && PRAC.A != null ? scoreBeatAt(PRAC.A) : null;
      const beatB = hasNotes && PRAC.B != null ? scoreBeatAt(PRAC.B) : null;
      scoreSetTempos(SCORE.tempos);
      if (hasNotes) {
          FALL.position = scoreSeconds(beat);
          if (beatA != null) PRAC.A = scoreSeconds(beatA);
          if (beatB != null) PRAC.B = scoreSeconds(beatB);
      }
  }
  function scoreSeconds(beat: number) {
      const list = SCORE.tempoList, times = scoreEnsureTempoTimes();
      if (!list.length)
          return beat * 60 / 120;
      if (beat < list[0].beat)
          return beat * 60 / list[0].bpm;
      let lo = 0, hi = list.length - 1, idx = 0;
      while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (list[mid].beat <= beat) {
              idx = mid;
              lo = mid + 1;
          }
          else {
              hi = mid - 1;
          }
      }
      return times[idx] + (beat - list[idx].beat) * 60 / list[idx].bpm;
  }
  function scoreBeatAt(sec: number) {
      const list = SCORE.tempoList, times = scoreEnsureTempoTimes();
      if (!list.length)
          return sec * 120 / 60;
      if (sec < times[0])
          return sec * list[0].bpm / 60;
      let lo = 0, hi = times.length - 1, idx = 0;
      while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (times[mid] <= sec) {
              idx = mid;
              lo = mid + 1;
          }
          else {
              hi = mid - 1;
          }
      }
      return list[idx].beat + (sec - times[idx]) * list[idx].bpm / 60;
  }
  // MIDI (or a built-in piece) → MusicXML. `opt.grid` is the quantization per quarter note (2, 4 or 8); divisions grow when a meter needs finer units.
  // `opt.pickup` (quarter notes) makes the first bar an upbeat: an implicit bar 0 of that length, as the score is written.
  function scoreFromMidi(parsed: { meta: AnMidiMeta[]; notes: ScoreMidiNote[]; }, title: string, opt: { grid: number; keys: { beat: number; fifths: number; minor: boolean; }[]; composer?: string; pickup?: number; }) {
      SCORE.midiGrid = opt.grid || 4;
      SCORE.measures = [];
      const res = scoreMidiToXml(parsed, title, opt, t('sc_part'));
      SCORE.midiGrid = res.midiGrid;
      SCORE.measures = res.measures;
      scoreSetTempos(res.tempos);
      SCORE.tempoFromFile = res.tempoFromFile;
      return res.xml;
  }
  // Rebuild notes + notation from the stored MIDI/example source; analysis timing stays the unquantized source timing.
  function anRebuild() {
      const src = AN.source;
      if (!src || src.kind === 'xml')
          return;
      const parsed = src.parsed, hands = anAssignHands(parsed.notes, AN.recon.hands);
      const notes = parsed.notes.map((n, i) => ({
          midi: n.midi, start: n.start, end: n.end, vel: n.vel, track: n.track, channel: n.channel, hand: hands.of[i],
          ...(n.soundEnd !== undefined ? { soundEnd: n.soundEnd, pedalEnd: n.soundEnd } : {}),
      }));
      const key = anResolveKey({ meta: parsed.meta.filter((e): e is AnMidiKeyMeta => e.type === 'key') }, AN.recon.key, notes);
      const pickup = src.kind === 'example' ? PIECES.find((p) => p.id === src.id)?.pickup : undefined;
      const xml = scoreFromMidi({ meta: parsed.meta, notes }, src.title, { grid: AN.recon.grid, keys: key.events, composer: src.comp, pickup });
      AN.notes = notes;
      SCORE.xml = xml;
      AN.hands = hands;
      AN.keyOrigin = key.origin;
      AN.keyMap = key.events.map((e) => ({ ...keyFromFifths(e.fifths, e.minor), beat: e.beat }));
  }
  function anXmlKeyMap(src: { keys: ScoreXmlKey[]; notes: readonly theory.TheoryNote[]; }) {
      if (!src.keys.length) {
          const best = anKeyRank(src.notes)[0];
          AN.keyOrigin = 'auto';
          return [{ beat: 0, root: best.root, minor: best.minor, fifths: keyFifths(best.root, best.minor) }];
      }
      const ranks = anKeyRank(src.notes);
      let guessed = false;
      const map = src.keys.map((k) => {
          let minor = k.mode === 'minor';
          if (!k.mode) {
              guessed = true;
              const maj = keyFromFifths(k.fifths, false), mi = keyFromFifths(k.fifths, true);
              const minRank = ranks.find((r) => r.root === mi.root && r.minor) || { score: 0 };
              const majRank = ranks.find((r) => r.root === maj.root && !r.minor) || { score: 0 };
              minor = minRank.score > majRank.score;
          }
          return { ...keyFromFifths(k.fifths, minor), beat: k.beat };
      });
      AN.keyOrigin = guessed ? 'mode' : 'file';
      return map;
  }
  /* rendering, selection painting, transport */
  // Beam groups for OSMD's auto-beaming (only used for MusicXML written without beams): one beat, or a dotted quarter in compound meters.
  function scoreBeamGroups() { const m = (SCORE.measures || [])[0] || { num: 4, den: 4 }; return m.den === 8 && m.num % 3 === 0 ? [[3, 8]] : m.den === 2 ? [[2, 4]] : [[1, 4]]; }
  async function scoreRender()  {
      scoreLayoutGeneration++; scorePendingSignature = ''; scoreLayoutPending = null;
      const version = ++SCORE.version, box = byId('an-roll');
      if (!SCORE.xml) {
          anRenderEmpty();
          return false;
      }
      box.classList.remove('is-empty');
      box.classList.add('is-loading');
      box.setAttribute('aria-busy', 'true');
      box.hidden = false;
      box.innerHTML = '<div class="an-sheet"></div>';
      SCORE.heads = new Map();
      SCORE.engine = null;
      SCORE.geo = null;
      SCORE.syms = [];
      SCORE.renderedSig = '';
      SCORE.hasPaint = false;
      SCORE.cursorStyle = null;
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let the loading state paint before the engraver blocks
      if (version !== SCORE.version)
          return false;
      try {
          await loadOsmd();
      }
      catch (err) {
          if (version !== SCORE.version)
              return false;
          showNotationReloadPrompt();
          console.error('OSMD:', err);
          throw err;
      }
      if (version !== SCORE.version)
          return false;
      const isXml = !!AN.source && AN.source.kind === 'xml', autoBeam = isXml && !/<beam[\s>]/.test(SCORE.xml); // generated scores already carry <beam> groups per voice
      const oneStaffPart = (SCORE.xml.match(/<score-part[\s>]/g) || []).length <= 1; // a lone piano needs no "Instr. P1" at the left
      const engine = await createScoreRenderer(box.firstElementChild || box, { autoResize: false, backend: 'svg', drawTitle: true, drawComposer: true, drawPartNames: !oneStaffPart, drawPartAbbreviations: false, drawMeasureNumbers: true,
          autoBeam, autoBeamOptions: { beam_rests: false, beam_middle_rests_only: false, maintain_stem_directions: true, groups: scoreBeamGroups() } });
      if (version !== SCORE.version)
          return false;
      const R: ScoreEngravingRules = {}; // MuseScore-like page: wider margins, title block, measure numbers only at system starts
      R.PageLeftMargin = R.PageRightMargin = 7;
      R.PageTopMargin = 6;
      R.PageBottomMargin = 6;
      R.TitleTopDistance = 4;
      R.SystemComposerDistance = 2.5;
      R.MinimumDistanceBetweenSystems = isXml ? 6 : 7.5;
      if (isXml) {
          R.PageTopMargin = R.PageBottomMargin = 5;
          R.BetweenStaffDistance = 4.5;
          R.StaffDistance = 6.5;
      }
      R.MeasureNumberLabelHeight = 1.4;
      R.InstrumentLabelTextHeight = 1.9;
      // Generated scores: equal musical bars create a reliable time rail. Imported MusicXML keeps the engraver's natural
      // widths and the file's own system breaks (3–4 bars a line, as in MuseScore); the cursor then follows note onsets.
      R.FixedMeasureWidth = !isXml;
      SCORE.fixedWidth = !isXml;
      SCORE.fit = null;
      // Chord symbols clear the treble clef and top line; fingering keeps a little air above / below the staff it labels.
      // Stacked chord fingerings stay compact (smaller digits, tighter rows); scoreFixFingerings clears what still touches.
      if (isXml) {
          R.ChordSymbolYOffset = .8;
          R.FingeringOffsetY = .3;
          R.FingeringTextSize = 1.35;
          R.FingeringPaddingY = -.35;
      }
      const layout = AN.source && AN.source.kind === 'xml' ? AN.source.layout : null;
      if (layout) {
          for (const [size, rule] of [['titleSize', 'SheetTitleHeight'], ['subtitleSize', 'SheetSubtitleHeight'], ['composerSize', 'SheetComposerHeight']] as const) {
              const pt = layout[size];
              if (pt)
                  R[rule] = pt * 96 / 72 / (10 * layout.base);
          }
          for (const [side, rule] of [['left', 'PageLeftMargin'], ['right', 'PageRightMargin'], ['top', 'PageTopMargin'], ['bottom', 'PageBottomMargin']] as const) {
              const margin = layout[side];
              if (margin != null)
                  R[rule] = margin;
          }
          if (layout.staffGap != null) {
              R.StaffDistance = R.BetweenStaffDistance = layout.staffGap;
              R.MinSkyBottomDistBetweenStaves = .5;
          }
          if (layout.systemGap != null) {
              R.MinimumDistanceBetweenSystems = layout.systemGap;
              R.MinSkyBottomDistBetweenSystems = 1;
          }
      }
      engine.updateRules(R);
      const source = SCORE.xml.trim();
      await engine.load(source.startsWith('<?xml') ? source : '<?xml version="1.0" encoding="utf-8"?>' + source);
      if (version !== SCORE.version)
          return false;
      SCORE.engine = engine;
      const result = scoreLayout();
      let ready = result !== false;
      while (scoreLayoutPending && version === SCORE.version) {
          const pending = scoreLayoutPending;
          ready = await pending;
      }
      return version === SCORE.version && ready;
  }
  // View, zoom and appearance only need a new layout, not a new load; selection, cursor and highlights are repainted afterwards.
  // Page view: A4 sheets on the desk, as wide as 794 px × zoom but never wider than the desk (the music reflows instead of panning).
  let scoreLayoutGeneration = 0;
  let scorePendingSignature = '';
  let scoreLayoutPending: Promise<boolean> | null = null;
  function scoreLayout() {
      const engine = SCORE.engine, box = byId('an-roll');
      if (!engine)
          return;
      box.hidden = false;
      if (!box.clientWidth) {
          SCORE.stale = true;
          box.hidden = FALL.mode !== 'score';
          return;
      }
      const look = SCORE_LOOK[SCORE.look], cont = SCORE.layout === 'cont', fit = SCORE.layout === 'fit', R: ScoreEngravingRules = {}, sheet = box.querySelector('.an-sheet'), cs = getComputedStyle(box);
      let baseMargins = SCORE_BASE_MARGINS.get(engine);
      if (!baseMargins) {
          const cur = engine.readRules();
          baseMargins = {
              top: typeof cur.PageTopMargin === 'number' ? cur.PageTopMargin : undefined,
              title: typeof cur.TitleTopDistance === 'number' ? cur.TitleTopDistance : undefined,
              left: typeof cur.PageLeftMargin === 'number' ? cur.PageLeftMargin : undefined,
              right: typeof cur.PageRightMargin === 'number' ? cur.PageRightMargin : undefined,
          };
          SCORE_BASE_MARGINS.set(engine, baseMargins);
      }
      box.dataset.layout = SCORE.layout;
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const sourceLayout = AN.source && AN.source.kind === 'xml' ? AN.source.layout : null, pageW = sourceLayout ? sourceLayout.width : SC_PAGE_W, base = sourceLayout ? sourceLayout.base : SC_BASE;
      const fitParams = fit ? computeFitWidthLayout(avail, SCORE.zoom, base) : null;
      const sheetW = fitParams ? fitParams.sheetWidth : Math.max(240, Math.round(Math.min(pageW, avail) * SCORE.zoom));
      if (sheet instanceof HTMLElement) {
          if (pinchBaseZoom === null) {
              sheet.style.transform = '';
              sheet.style.transformOrigin = '';
          }
          sheet.style.width = cont ? '' : sheetW + 'px';
      }
      const landShort = !cont && !fit && window.innerWidth > window.innerHeight && window.innerHeight <= 560;
      const xmlBreaks = !cont && !fit && !SCORE.fixedWidth && /new-(system|page)="yes"/.test(SCORE.xml);
      const renderSig = [SCORE.version, SCORE.layout, SCORE.look, SCORE.zoom, avail, landShort ? 1 : 0, xmlBreaks ? 1 : 0].join('|');
      if (scorePendingSignature === renderSig) return scoreLayoutPending ?? true;
      if (!SCORE.stale && SCORE.renderedSig === renderSig && box.querySelector('svg')) {
          SCORE.layoutWidth = box.clientWidth;
          box.classList.remove('is-loading', 'is-empty');
          box.setAttribute('aria-busy', 'false');
          box.dataset.look = SCORE.look;
          box.hidden = FALL.mode !== 'score';
          scorePaint();
          return SCORE.pedalsOk ?? true;
      }
      if (fitParams) {
          engine.setOptions({ defaultColorMusic: look.ink, pageBackgroundColor: look.bg, pageFormat: fitParams.pageFormat, renderSingleHorizontalStaffline: false, drawTitle: true, drawSubtitle: true, drawComposer: true, drawLyricist: true });
          R.PageLeftMargin = fitParams.pageMargins.left;
          R.PageRightMargin = fitParams.pageMargins.right;
          R.PageTopMargin = fitParams.pageMargins.top;
          if (baseMargins.title != null) R.TitleTopDistance = baseMargins.title;
      }
      else {
          engine.setOptions({ defaultColorMusic: look.ink, pageBackgroundColor: look.bg, pageFormat: cont ? 'Endless' : 'A4_P', renderSingleHorizontalStaffline: cont, drawTitle: !cont, drawSubtitle: !cont, drawComposer: !cont, drawLyricist: !cont });
          if (!cont && sourceLayout)
              engine.setCustomPageFormat(sourceLayout.pageWidth, sourceLayout.pageHeight);
          if (baseMargins.left != null) R.PageLeftMargin = baseMargins.left;
          if (baseMargins.right != null) R.PageRightMargin = baseMargins.right;
          if (landShort) {
              R.PageTopMargin = Math.min(baseMargins.top ?? 6, 1.5);
              R.TitleTopDistance = Math.min(baseMargins.title ?? 4, 1.2);
          }
          else {
              if (baseMargins.top != null)
                  R.PageTopMargin = baseMargins.top;
              if (baseMargins.title != null)
                  R.TitleTopDistance = baseMargins.title;
          }
      }
      R.StaffLineColor = look.staff;
      R.RenderMeasureNumbersOnlyAtSystemStart = !cont;
      R.MeasureNumberLabelOffset = cont ? 1 : 2;
      engine.updateRules(R);
      // A page narrower than A4 × zoom is the same A4 page scaled down: the staff space shrinks with it, so every
      // system keeps its bars and every page its systems whatever the panel width. Fit mode instead lets OSMD wrap cleanly.
      engine.setZoom(fitParams ? fitParams.zoom : cont ? SCORE.zoom * base : sheetW / pageW * base);
      scoreRingFit(engine.getZoom());
      const finish = () => {
          if (!box.clientWidth) {
              SCORE.stale = true;
              SCORE.renderedSig = '';
              box.hidden = FALL.mode !== 'score';
              return true;
          }
          scoreStyleHeader(engine, sourceLayout);
          scoreFixFingerings(box, engine);
          if (SCORE.look === 'night')
              scoreNightSweep(box, look.ink);
          SCORE.stale = false;
          SCORE.renderedSig = renderSig;
          SCORE.layoutWidth = box.clientWidth;
          box.classList.remove('is-loading', 'is-empty');
          box.setAttribute('aria-busy', 'false');
          box.dataset.look = SCORE.look;
          scoreBind(engine);
          scoreFeature.renderScoreNoteParentheses(box, look.ink);
          scoreXLines();
          const pedalsOk = scoreFixPedals(box);
          SCORE.pedalsOk = pedalsOk;
          scoreGeo(engine);
          scoreSyms(engine);
          box.hidden = FALL.mode !== 'score';
          SCORE.hasPaint = false;
          scorePaint();
          scoreXLineSignature = scoreXLinesCurrentSignature();
          rememberScorePedalLayout(box);
          if (!pedalsOk) {
              anSetLoading(false);
              anShowError('an_err_render');
          }
          return pedalsOk;
      };
      const generation = ++scoreLayoutGeneration;
      if (AN.notes.length > 1024 && engine.renderProgressively) {
          scorePendingSignature = renderSig;
          box.setAttribute('aria-busy', 'true');
          const current = () => generation === scoreLayoutGeneration && engine === SCORE.engine;
          scoreLayoutPending = scoreFitRenderProgressively(engine, xmlBreaks, SCORE.zoom + '|' + avail, current).then((ok) => {
              if (!current()) return false;
              scorePendingSignature = '';
              scoreLayoutPending = null;
              return ok ? finish() : false;
          }).catch(() => {
              if (!current()) return false;
              scorePendingSignature = '';
              scoreLayoutPending = null;
              box.setAttribute('aria-busy', 'false');
              anShowError('an_err_render');
              return false;
          });
          return scoreLayoutPending;
      }
      scorePendingSignature = '';
      scoreLayoutPending = null;
      scoreFitRender(engine, xmlBreaks, SCORE.zoom + '|' + avail);
      return finish();
  }
   // VexFlow spacing multiplier, addend, min note distance
  function scoreFitRender(engine: notationApi.ScoreRenderer, xmlBreaks: boolean, key: string) {
      const set = (i: number, on: boolean) => {
          const f = SC_FIT[i];
          engine.updateRules({
              VoiceSpacingMultiplierVexflow: f[0],
              VoiceSpacingAddendVexflow: f[1],
              MinNoteDistance: f[2],
              NewSystemAtXMLNewSystemAttribute: on,
              NewSystemAtXMLNewPageAttribute: on,
              NewPageAtXMLNewPageAttribute: on,
          });
      };
      if (!xmlBreaks) {
          set(0, false);
          engine.render();
          return;
      }
      const known = SCORE.fit && SCORE.fit.key === key ? SCORE.fit : null; // look changes re-render at the step already found
      if (known) {
          set(known.step, known.on);
          engine.render();
          return;
      }
      set(0, true);
      engine.render();
      if (!scoreExtraBreaks(engine)) {
          SCORE.fit = { key, step: 0, on: true };
          return;
      }
      const last = SC_FIT.length - 1;
      if (last > 0) {
          set(last, true);
          engine.render();
          if (!scoreExtraBreaks(engine)) {
              if (last > 1) {
                  set(1, true);
                  engine.render();
                  if (!scoreExtraBreaks(engine)) {
                      SCORE.fit = { key, step: 1, on: true };
                      return;
                  }
                  set(last, true);
                  engine.render();
              }
              SCORE.fit = { key, step: last, on: true };
              return;
          }
      }
      set(0, false);
      engine.render();
      SCORE.fit = { key, step: 0, on: false };
  }
  async function scoreFitRenderProgressively(engine: notationApi.ScoreRenderer, xmlBreaks: boolean, key: string, current: () => boolean): Promise<boolean> {
      const render = engine.renderProgressively;
      if (!render) return false;
      const known = SCORE.fit?.key === key ? SCORE.fit : null;
      const steps = !xmlBreaks ? [{ step: 0, on: false }] : known ? [known] : [...SC_FIT.map((_, step) => ({ step, on: true })), { step: 0, on: false }];
      const setRules = (candidate: { step: number; on: boolean }) => {
          const f = SC_FIT[candidate.step];
          engine.updateRules({ VoiceSpacingMultiplierVexflow: f[0], VoiceSpacingAddendVexflow: f[1], MinNoteDistance: f[2], NewSystemAtXMLNewSystemAttribute: candidate.on, NewSystemAtXMLNewPageAttribute: candidate.on, NewPageAtXMLNewPageAttribute: candidate.on });
      };
      if (steps.length > 1 && typeof engine.layoutOnly === 'function') {
          let chosen = steps[steps.length - 1];
          for (let idx = 0; idx < steps.length - 1; idx++) {
              if (!current()) return false;
              const candidate = steps[idx];
              setRules(candidate);
              engine.layoutOnly();
              if (!candidate.on || !scoreExtraBreaks(engine)) {
                  chosen = candidate;
                  break;
              }
          }
          if (!current()) return false;
          setRules(chosen);
          if (!await render.call(engine, current)) return false;
          SCORE.fit = { key, ...chosen };
          return true;
      }
      for (const candidate of steps) {
          if (!current()) return false;
          setRules(candidate);
          if (!await render.call(engine, current)) return false;
          if (!candidate.on || !scoreExtraBreaks(engine)) {
              SCORE.fit = { key, ...candidate };
              return true;
          }
      }
      return false;
  }
  function scoreExtraBreaks(engine: notationApi.ScoreRenderer) {
      return engine.hasExtraBreaks();
  }
  // Anything OSMD still draws in pure black (connectors, brackets, text without a colour rule) follows the night ink too.
  // The keyboard-focus ring around a notehead is measured in the score's own units: about 1 px of page colour, then 1.6 px of blue.
  let scoreBindGen = 0;
   // counts bindings: each new layout has new noteheads
  // How each bound notehead is spelled on the page (the file's own spelling for MusicXML), for the Note names layer.
  let scoreHeadSpell = new WeakMap<SVGElement, { letter: number; alter: number }>();
  function scoreBind(engine: notationApi.ScoreRenderer) {
      SCORE.heads = new Map();
      scoreBindGen++;
      scoreHeadSpell = new WeakMap();
      const grid = SCORE.midiGrid || 0, startOf = (n: AnNote) => grid ? Math.round(n.start * grid) / grid : n.start, endOf = (n: AnNote) => grid ? Math.max(startOf(n) + 1 / grid, Math.round(n.end * grid) / grid) : n.end;
      const byMidi = new Map<number, number[]>(), maxDurByMidi = new Map<number, number>(), keyCache = new Map<number, ReturnType<typeof anKeyAt>>();
      AN.notes.forEach((n, i) => {
          let list = byMidi.get(n.midi);
          if (!list) byMidi.set(n.midi, list = []);
          list.push(i);
          const dur = endOf(n) - startOf(n);
          if (dur > (maxDurByMidi.get(n.midi) ?? 0)) maxDurByMidi.set(n.midi, dur);
      });
      byMidi.forEach((list) => {
          if (list.length > 1) list.sort((a, b) => startOf(AN.notes[a]) - startOf(AN.notes[b]) || a - b);
      });
      const lowerBound = (list: number[], target: number) => {
          let lo = 0, hi = list.length;
          while (lo < hi) {
              const mid = (lo + hi) >>> 1;
              if (startOf(AN.notes[list[mid]]) < target) lo = mid + 1;
              else hi = mid;
          }
          return lo;
      };
      let bound = new Set<number>(), boundBeat: number | null = null;
      engine.forEachRenderedNote(({ midi, beat, part, staff, voice, element: g, spelling }) => {
          if (boundBeat !== beat) {
              boundBeat = beat;
              bound = new Set();
          }
          const cands = byMidi.get(midi);
          if (!cands)
              return;
          const same = (j: number) => { const n = AN.notes[j]; return (n.part == null || n.part === part) && (n.staff == null || n.staff === staff) && (n.voice == null || n.voice === voice); };
          let exactSameUnbound: number | undefined;
          let exactSameBound: number | undefined;
          let exactAnyUnbound: number | undefined;
          let exactAnyBound: number | undefined;
          const kExact0 = lowerBound(cands, beat - 0.01);
          for (let k = kExact0; k < cands.length; k++) {
              const j = cands[k], ns = startOf(AN.notes[j]);
              if (ns >= beat + 0.01) break;
              if (Math.abs(ns - beat) < 0.01) {
                  const isSame = same(j), isUnbound = !bound.has(j);
                  if (isSame) {
                      if (isUnbound) { exactSameUnbound = j; break; }
                      if (exactSameBound == null) exactSameBound = j;
                  } else {
                      if (isUnbound && exactAnyUnbound == null) exactAnyUnbound = j;
                      if (exactAnyBound == null) exactAnyBound = j;
                  }
              }
          }
          let i = exactSameUnbound ?? exactSameBound;
          if (i == null) {
              let sustSameUnbound: number | undefined;
              let sustSameBound: number | undefined;
              let sustAnyUnbound: number | undefined;
              let sustAnyBound: number | undefined;
              const maxDur = maxDurByMidi.get(midi) ?? 0;
              const kSust0 = lowerBound(cands, beat - maxDur - 0.002);
              for (let k = kSust0; k < cands.length; k++) {
                  const j = cands[k], n = AN.notes[j], ns = startOf(n);
                  if (ns > beat + 0.001) break;
                  if (endOf(n) > beat + 0.001) {
                      const isSame = same(j), isUnbound = !bound.has(j);
                      if (isSame) {
                          if (isUnbound && sustSameUnbound == null) sustSameUnbound = j;
                          if (sustSameBound == null) sustSameBound = j;
                      } else {
                          if (isUnbound && sustAnyUnbound == null) sustAnyUnbound = j;
                          if (sustAnyBound == null) sustAnyBound = j;
                      }
                  }
              }
              i = sustSameUnbound ?? sustSameBound ?? exactAnyUnbound ?? exactAnyBound ?? sustAnyUnbound ?? sustAnyBound;
          }
          if (i == null)
              return;
          bound.add(i);
          g.dataset.i = String(i);
          if (spelling)
              scoreHeadSpell.set(g, spelling);
          const note = AN.notes[i];
          if (note.parenthesizedAt?.some(start => Math.abs(start - beat) < .001)) g.dataset.parenthesized = 'yes';
          g.setAttribute('tabindex', '-1');
          g.setAttribute('role', 'button');
          g.setAttribute('aria-pressed', 'false');
          let noteKey = keyCache.get(note.start);
          if (!noteKey) {
              noteKey = anKeyAt(note.start);
              keyCache.set(note.start, noteKey);
          }
          g.setAttribute('aria-label', spellName(note.midi, noteKey, true));
          let heads = SCORE.heads.get(i);
          if (!heads)
              SCORE.heads.set(i, heads = []);
          heads.push(g);
      });
      // The first notehead bound is the first one of the first note given heads.
      const first = SCORE.heads.values().next().value?.[0];
      if (first)
          first.setAttribute('tabindex', '0');
  }
  function scorePaintEl(g: SVGElement) { const i = Number(g.dataset.i), look = SCORE_LOOK[SCORE.look], selected = AN.selected.has(i), res = PRAC.res.get(i), n = AN.notes[i], color = SCORE.hl && SCORE.lit.has(i) ? look.lit : selected ? look.sel : res === 'hit' ? look.ok : res === 'miss' ? look.bad : n && !pracMine(n) ? look.dim : null; for (const shape of [g, ...g.querySelectorAll('path,ellipse,circle')]) {
      if (!(shape instanceof SVGElement))
          continue;
      if (!shape.hasAttribute('data-original-fill')) {
          shape.dataset.originalFill = shape.style.fill || '';
          shape.dataset.originalStroke = shape.style.stroke || '';
      }
      shape.style.fill = color || shape.dataset.originalFill || '';
      shape.style.stroke = color || shape.dataset.originalStroke || '';
  } g.setAttribute('aria-pressed', selected ? 'true' : 'false');
  const stave = g.closest('.vf-stavenote');
  if (stave) {
      const heads = [...stave.querySelectorAll<SVGElement>('.vf-notehead')];
      const allDimmed = heads.length > 0 && heads.every((h) => {
          const idx = Number(h.dataset.i);
          const note = AN.notes[idx];
          return note && !pracMine(note) && !AN.selected.has(idx) && !PRAC.res.has(idx) && !(SCORE.hl && SCORE.lit.has(idx));
      });
      const stemColor = allDimmed ? look.dim : null;
      stave.querySelectorAll<SVGElement>('.vf-stem, .vf-stem *, .vf-flag, .vf-flag *, .vf-modifiers path, .vf-modifiers text').forEach((extra) => {
          if (!(extra instanceof SVGPathElement || extra instanceof SVGLineElement || extra instanceof SVGTextElement))
              return;
          if (!extra.hasAttribute('data-original-fill')) {
              extra.dataset.originalFill = extra.style.fill || '';
              extra.dataset.originalStroke = extra.style.stroke || '';
          }
          extra.style.fill = stemColor || extra.dataset.originalFill || '';
          extra.style.stroke = stemColor || extra.dataset.originalStroke || '';
      });
  } }
  function scorePaintIdx(i: number) {
      if (AN.selected.has(i) || PRAC.res.has(i) || (SCORE.hl && SCORE.lit.has(i)) || PRAC.hands !== 'both') SCORE.hasPaint = true;
      (SCORE.heads.get(i) || []).forEach(scorePaintEl);
  }
  function scorePaint() {
      const needsPaint = PRAC.hands !== 'both' || AN.selected.size > 0 || PRAC.res.size > 0 || (SCORE.hl && SCORE.lit.size > 0);
      if (needsPaint || SCORE.hasPaint) {
          SCORE.heads.forEach((list) => list.forEach(scorePaintEl));
          SCORE.hasPaint = needsPaint;
      }
      scoreNamesSync();
      scoreMarks();
      scoreCursorUpdate(false);
      anAnalyze();
  }
  // Note names (the toolbar's Note names toggle, saved with the player settings): each bound notehead gets its name just
  // right of it, spelled in the key and in the app's note naming. One layer per page SVG, drawn again after each layout
  // or naming change; the noteheads keep their own labels for screen readers, so the layer is hidden from them.
  let scoreNamesSig = '';
  function scoreNamesSync() {
      const box = byId('an-roll'), on = PRAC.names && FALL.mode === 'score' && SCORE.heads.size > 0;
      const sig = on ? [scoreBindGen, host.i18n.notation(), AN.version].join('|') : '';
      if (sig === scoreNamesSig)
          return;
      if (on && !box.getClientRects().length)
          return; // measured only while on screen: the next paint after it shows draws them
      scoreNamesSig = sig;
      box.querySelectorAll('.sc-nn-layer').forEach((el) => el.remove());
      if (!on)
          return;
      const NS = 'http://www.w3.org/2000/svg', layers = new Map<SVGSVGElement, SVGGElement>();
      const pageInverseCache = new WeakMap<SVGSVGElement, DOMMatrix>();
      const labels: { svg: SVGSVGElement; i: number; name: string; x: string; y: string; fontSize: string; strokeWidth: string }[] = [];
      SCORE.heads.forEach((list, i) => {
          const n = AN.notes[i];
          if (!n)
              return;
          const k = anKeyAt(n.start), sp = spellMidi(n.midi, k.fifths, k.minor), keyName = spelledName(host.i18n.notation(), sp.li, sp.acc);
          list.forEach((g) => {
              if (!(g instanceof SVGGraphicsElement))
                  return;
              const svg = g.ownerSVGElement;
              if (!svg)
                  return;
              let pageInv = pageInverseCache.get(svg);
              if (!pageInv) {
                  const page = svg.getScreenCTM();
                  if (!page)
                      return;
                  pageInv = page.inverse();
                  pageInverseCache.set(svg, pageInv);
              }
              const ctm = g.getScreenCTM(), b = g.getBBox();
              if (!ctm || !b.width || !b.height)
                  return;
              const own = scoreHeadSpell.get(g), name = own ? spelledName(host.i18n.notation(), own.letter, own.alter) : keyName;
              // From the notehead's own units to its page's: the right edge, halfway up, and the notehead's height.
              const m = pageInv.multiply(ctm), p = new DOMPoint(b.x + b.width, b.y + b.height / 2).matrixTransform(m), h = b.height * Math.hypot(m.b, m.d);
              labels.push({
                  svg,
                  i,
                  name,
                  x: (p.x + h * .3).toFixed(1),
                  y: p.y.toFixed(1),
                  fontSize: (h * 1.05).toFixed(1),
                  strokeWidth: (h * .28).toFixed(1),
              });
          });
      });
      for (const item of labels) {
          let layer = layers.get(item.svg);
          if (!layer) {
              layer = document.createElementNS(NS, 'g');
              layer.setAttribute('class', 'sc-nn-layer');
              layer.setAttribute('aria-hidden', 'true');
              layers.set(item.svg, layer);
          }
          const tx = document.createElementNS(NS, 'text');
          tx.setAttribute('class', 'sc-nn');
          tx.setAttribute('x', item.x);
          tx.setAttribute('y', item.y);
          tx.setAttribute('font-size', item.fontSize);
          tx.setAttribute('stroke-width', item.strokeWidth);
          tx.dataset.nn = String(item.i);
          tx.textContent = item.name;
          layer.append(tx);
      }
      layers.forEach((layer, svg) => svg.append(layer));
  }
  // Text-pedal skylines can miss ledger notes, and a release with no staff entry can land on its press glyph.
  // Place actual glyph ink without changing event timing. Recompute from native positions on every call.
  // One property of an OSMD object (Étude doesn't type the engraver's internals); callers narrow what comes back.
  let scoreFixPedals = (box: HTMLElement) => scoreFixPedalsDefault(box);
  // Lines between the hands that OSMD leaves out: cross-staff slurs, glissandi and slides, dashed voice-leading lines.
  let scoreXLineSignature = '';
  function scoreXLinesCurrentSignature(): string {
      if (AN.source?.kind !== 'xml' || !AN.source.links.length) return '';
      return [SCORE.version, SCORE.look, SCORE.layout, SCORE.zoom, SCORE.engine?.getZoom(), ...[...byId('an-roll').querySelectorAll('svg')].map(svg => svg.childElementCount)].join('|');
  }
  function scoreXLines() {
      if (!scoreHasKey(SCORE_LOOK, SCORE.look))
          return;
      const links: ScoreCrossLink[] = (AN.source && AN.source.kind === 'xml' && AN.source.links) || [], ink = SCORE_LOOK[SCORE.look].ink, NS = 'http://www.w3.org/2000/svg';
      if (!links.length)
          return;
      const sheet = SCORE.engine?.readLayout().graphicSheet;
      if (!isScoreOsmdSheet(sheet))
          return;
      const svgs = [...byId('an-roll').querySelectorAll('svg')];
      const signature = scoreXLinesCurrentSignature;
      if (scoreXLineSignature === signature()) return;
      svgs.forEach((svg) => svg.querySelectorAll('.sc-xline').forEach((n) => n.remove()));
      const systems = sheet.MusicPages.flatMap((page, pi) => page.MusicSystems.map((sys) => ({ sys, svg: svgs[pi] })));
      const systemOf = (note: AnNote) => sheet.MeasureList.find((list) => list.some((gm) => gm && note.start >= gm.parentSourceMeasure.AbsoluteTimestamp.RealValue * 4 - .001 && note.start < (gm.parentSourceMeasure.AbsoluteTimestamp.RealValue + gm.parentSourceMeasure.Duration.RealValue) * 4 - .001))?.find(Boolean)?.ParentMusicSystem;
      const noteSystems = AN.notes.map(systemOf);
      const point = (i: number | undefined, svg: SVGSVGElement, system: ScoreOsmdSystem) => {
          if (i == null || noteSystems[i] !== system)
              return null;
          const head = (SCORE.heads.get(i) || []).find((n) => n.ownerSVGElement === svg);
          if (!head)
              return null;
          const r = head.getBoundingClientRect(), p = scoreToUser(svg, r.left + r.width / 2, r.top + r.height / 2), m = svg.getScreenCTM();
          return p && m ? { x: p.x, y: p.y, hw: r.width / Math.abs(m.a) / 2 } : null;
      };
      links.forEach((l) => {
          const first = AN.notes[l.a], last = AN.notes[l.b];
          if (!first || !last)
              return;
          const start = systems.findIndex((s) => s.sys === noteSystems[l.a]), end = systems.findIndex((s) => s.sys === noteSystems[l.b]);
          if (start < 0 || end < start)
              return;
          const firstPoint = point(l.a, systems[start].svg, systems[start].sys), lastPoint = point(l.b, systems[end].svg, systems[end].sys);
          if (!firstPoint || !lastPoint)
              return;
          // A fully resting intermediate system has no notehead anchor. Reuse a staff-relative height,
          // never the absolute geometry of an endpoint on a different system of the same SVG page.
          const continuation = (system: ScoreOsmdSystem) => ({
              ...firstPoint,
              y: system.PositionAndShape.AbsolutePosition.y * 10 + firstPoint.y - systems[start].sys.PositionAndShape.AbsolutePosition.y * 10,
          });
          // A page can hold several systems. SVG identity and a y-distance heuristic are not system identity:
          // they used to draw a diagonal through the whitespace from bar 15 to bar 16 and omit page continuations.
          for (let si = start; si <= end; si++) {
              const { sys, svg } = systems[si];
              if (!svg)
                  continue;
              const local = AN.notes.flatMap((n, i) => n.part === first.part && n.start >= first.start - .001 && n.start <= last.start + .001 && noteSystems[i] === sys ? [i] : []).sort((a, b) => AN.notes[a].start - AN.notes[b].start);
              const ownVoice = local.filter(i => AN.notes[i].voice === first.voice), candidates = ownVoice.length ? ownVoice : local;
              const a = si === start ? firstPoint : point(candidates[0], svg, sys) ?? continuation(sys);
              const b = si === end ? lastPoint : point(candidates[candidates.length - 1], svg, sys) ?? continuation(sys);
              const measures = sys.StaffLines[0]?.Measures || [], left = measures[0], right = measures[measures.length - 1];
              if (!left || !right)
                  continue;
              const sp = 10, hw = Math.min(a.hw, b.hw), slur = l.kind === 'slur';
              const x0 = si === start ? a.x + hw * (slur ? .4 : 1.4) : (left.PositionAndShape.AbsolutePosition.x + (left.beginInstructionsWidth || 0)) * 10 + sp * .4;
              const x1 = si === end ? b.x - hw * (slur ? .4 : 1.4) : (right.PositionAndShape.AbsolutePosition.x + right.PositionAndShape.Size.width) * 10 - sp * .4;
              const y0 = a.y - (slur ? sp * .9 : 0), y1 = b.y - (slur ? sp * .9 : 0);
              if (x1 <= x0)
                  continue;
              const el = document.createElementNS(NS, 'path');
              el.setAttribute('class', 'sc-xline');
              el.dataset.kind = slur ? 'slur' : l.kind === 'glissando' || l.kind === 'slide' ? 'gliss' : 'line';
              el.dataset.link = l.a + ':' + l.b;
              el.dataset.segment = String(si - start);
              if (slur) {
                  const len = Math.hypot(x1 - x0, y1 - y0), h = Math.min(sp * 2.4, Math.max(sp * .8, len * .2)), th = sp * .22;
                  const nx = (y1 - y0) / len, ny = -(x1 - x0) / len, c = (f: number, k: number) => [x0 + (x1 - x0) * f + nx * k, y0 + (y1 - y0) * f + ny * k].map((v) => v.toFixed(2)).join(' ');
                  el.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} C${c(.25, h)} ${c(.75, h)} ${x1.toFixed(2)} ${y1.toFixed(2)} C${c(.75, h + th)} ${c(.25, h + th)} ${x0.toFixed(2)} ${y0.toFixed(2)}Z`);
                  el.setAttribute('fill', ink);
                  el.setAttribute('stroke-width', '.4');
              }
              else {
                  el.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}`);
                  el.setAttribute('fill', 'none');
                  el.setAttribute('stroke-width', l.kind === 'glissando' || l.kind === 'slide' ? '1.3' : '1');
                  if (l.style === 'dashed' || l.style === 'dotted' || el.dataset.kind === 'line')
                      el.setAttribute('stroke-dasharray', l.style === 'dotted' ? '1 3' : '5 4');
              }
              el.setAttribute('stroke', ink);
              svg.appendChild(el);
          }
      });
      scoreXLineSignature = signature();
  }
  function scoreSyms(engine: import('../../domain/notation.js').ScoreRenderer | null) {
      scoreTip(null);
      SCORE.syms = scoreFeature.scoreSymbols(byId('an-roll'), engine?.readLayout().graphicSheet, {
          geometry: SCORE.geo, notes: AN.notes, heads: SCORE.heads, measures: anMeasures(),
          tempoWords: AN.source?.kind === 'xml' ? AN.source.tempoWords : null,
          keyNameAt: beat => anKeyName(anKeyAt(beat)), language: host.i18n.lang(), t,
      });
  }
  function scoreTermParts(s: string) { return scoreFeature.scoreTermParts(s, t); }
  function scoreSymText(sym: Pick<ScoreSym, 'kind' | 'val'>) { return scoreFeature.scoreSymText(sym, t, host.i18n.lang()); }
  function scoreSymAt(e: Event) {
      const hit = eventElement(e)?.closest('#an-roll [data-sym]'), pt = e instanceof MouseEvent ? e : null;
      const box = byId('an-roll'), list: ScoreSym[] = SCORE.syms || [], el = hit instanceof HTMLElement || hit instanceof SVGElement ? hit : null;
      if (el && list[+(el.dataset.sym ?? '')] && list[+(el.dataset.sym ?? '')].el === el)
          return list[+(el.dataset.sym ?? '')];
      if (!pt || !list.length)
          return null;
      const rects = new Map<Element, DOMRect>(), pad = 3;
      let best: ScoreSym | null = null, area = Infinity;
      list.forEach((s) => {
          if (!s.loose)
              return;
          if (!rects.has(s.page))
              rects.set(s.page, s.page.getBoundingClientRect());
          const pr = rects.get(s.page) || s.page.getBoundingClientRect(), x = pt.clientX - pr.left, y = pt.clientY - pr.top;
          if (x < s.x0 - pad || x > s.x1 + pad || y < s.y0 - pad || y > s.y1 + pad)
              return;
          const a = (s.x1 - s.x0) * (s.y1 - s.y0);
          if (a < area) {
              area = a;
              best = s;
          }
      });
      return best;
  }
  // A small tooltip under the marking, inside the score panel; it never takes the pointer.
  function scoreTip(sym: ScoreSym | null, txt?: { head: string; body: string; line?: string; }) {
      const box = byId('an-roll');
      let tip: HTMLElement | null = box && queryHtml(box, ':scope > .sc-tip');
      if (!sym || !txt) {
          if (tip)
              tip.hidden = true;
          return;
      }
      if (!tip) {
          tip = (document).createElement('div');
          tip.className = 'sc-tip';
          tip.setAttribute('role', 'tooltip');
          tip.id = 'sc-tip';
          box.appendChild(tip);
      }
      tip.replaceChildren(Object.assign((document).createElement('b'), { textContent: txt.head }), Object.assign((document).createElement('span'), { textContent: txt.body }));
      tip.hidden = false;
      tip.dataset.kind = sym.kind;
      const br = box.getBoundingClientRect(), pr = sym.page.getBoundingClientRect(), ox = pr.left - br.left - box.clientLeft + box.scrollLeft, oy = pr.top - br.top - box.clientTop + box.scrollTop;
      const w = tip.offsetWidth, h = tip.offsetHeight, minX = box.scrollLeft + 4, maxX = box.scrollLeft + box.clientWidth - w - 4;
      let top = oy + sym.y1 + 8;
      if (top + h > box.scrollTop + box.clientHeight - 4)
          top = Math.max(box.scrollTop + 4, oy + sym.y0 - h - 8);
      tip.style.left = Math.round(Math.max(minX, Math.min(maxX, ox + (sym.x0 + sym.x1) / 2 - w / 2))) + 'px';
      tip.style.top = Math.round(top) + 'px';
  }
  // Geometry in OSMD units (one staff space) relative to each page: systems, measures and the onset anchors the cursor moves between.
  function scoreGeo(engine: import('../../domain/notation.js').ScoreRenderer) {
      const sheet = engine.readLayout().graphicSheet;
      if (!isScoreOsmdSheet(sheet))
          return;
      const gs = sheet, geo: ScoreGeometry = { scale: 10 * engine.getZoom(), pages: [], systems: [], measures: [], measureOrder: [], anchors: [] }, sysIdx = new Map<unknown, number>();
      gs.MusicPages.forEach((pg, pi) => {
          geo.pages[pi] = (document).getElementById('osmdCanvasPage' + pg.PageNumber);
          pg.MusicSystems.forEach((sys) => {
              const lines = sys.StaffLines;
              if (!lines || !lines.length)
                  return;
              const y = sys.PositionAndShape.AbsolutePosition.y, last = lines[lines.length - 1];
              sysIdx.set(sys, geo.systems.length);
              geo.systems.push({ page: pi, top: y + lines[0].PositionAndShape.RelativePosition.y, bottom: y + last.PositionAndShape.RelativePosition.y + last.StaffHeight });
          });
      });
      gs.MeasureList.forEach((list, mi) => {
          const gm = (list || []).find((m) => m && sysIdx.has(m.ParentMusicSystem)), si = gm && sysIdx.get(gm.ParentMusicSystem);
          if (!gm || si === undefined)
              return;
          const sm = gm.parentSourceMeasure, ps = gm.PositionAndShape, x0 = ps.AbsolutePosition.x, b0 = sm.AbsoluteTimestamp.RealValue * 4;
          geo.measures[mi] = { sys: si, x0, xn: x0 + (gm.beginInstructionsWidth || 0), x1: x0 + ps.Size.width, xs: x0, cx: x0, b0, b1: b0 + sm.Duration.RealValue * 4 };
          geo.measureOrder?.push(mi);
      });
      // Where a bar's music begins (xs): right after the clef, key and time signature drawn at its start (system starts, changes),
      // else at its barline. Measured on the drawn glyphs; OSMD's begin-instruction width reaches past the first notes.
      const glyphs: { page: number; l: number; r: number; y: number; }[] = [];
      geo.pages.forEach((el, pi) => {
          if (!el)
              return;
          const pr = el.getBoundingClientRect();
          el.querySelectorAll('.vf-clef,.vf-keysignature,.vf-timesignature').forEach((gl) => { const r = gl.getBoundingClientRect(); if (r.width > 0)
              glyphs.push({ page: pi, l: (r.left - pr.left) / geo.scale, r: (r.right - pr.left) / geo.scale, y: (r.top + r.height / 2 - pr.top) / geo.scale }); });
      });
      geo.measures.forEach((m) => {
          if (!m)
              return;
          const s = geo.systems[m.sys];
          let end = -Infinity;
          glyphs.forEach((gl) => { if (gl.page === s.page && gl.y >= s.top - 4 && gl.y <= s.bottom + 4 && gl.l >= m.x0 - .5 && gl.l < m.x1)
              end = Math.max(end, gl.r); });
          m.xs = end > -Infinity ? Math.min(m.xn, end + .6) : m.x0;
      });
      const cur = engine.readCursor();
      if (cur) {
          cur.reset();
          const it = cur.Iterator;
          let guard = 0;
          while (!it.EndReached && guard++ < 40000) {
              let x = Infinity, sys: unknown = null;
              for (const ve of scoreVisibleEntries(it)) {
                  const gse = cur.getStaffEntryFromVoiceEntry ? cur.getStaffEntryFromVoiceEntry(ve) : null, ax = gse && gse.PositionAndShape?.AbsolutePosition?.x;
                  if (gse && ax != null && ax < x) {
                      x = ax;
                      sys = gse.parentMeasure?.ParentMusicSystem;
                  }
              }
              const si = sysIdx.get(sys);
              if (si !== undefined)
                  geo.anchors.push({ beat: it.CurrentSourceTimestamp.RealValue * 4, x, sys: si });
              it.moveToNext();
          }
          cur.reset();
      }
      // Fallback for bars without usable onset geometry: start after their printed instructions.
      const onsetX = new Map<string, number>();
      geo.anchors.forEach((a) => { const key = a.sys + ':' + Math.round(a.beat * 960), old = onsetX.get(key); if (old == null || a.x < old)
          onsetX.set(key, a.x); });
      geo.measures.forEach((m) => { if (m)
          m.cx = onsetX.get(m.sys + ':' + Math.round(m.b0 * 960)) ?? m.xs; });
      // Within a system the line finishes at the next bar's first onset; at a system break it reaches the final barline first.
      geo.measures.forEach((m, mi) => { const n = geo.measures[mi + 1]; if (m && !(n && n.sys === m.sys && onsetX.has(m.sys + ':' + Math.round(m.b1 * 960))))
          geo.anchors.push({ beat: m.b1, x: m.x1 - 0.9, sys: m.sys, end: true }); });
      geo.anchors.sort((a, b) => a.beat - b.beat || (a.end ? 0 : 1) - (b.end ? 0 : 1));
      SCORE.geo = geo;
      SCORE.followSys = -1;
      if (SCORE.layout !== 'cont')
          geo.pages.forEach((el, i) => { if (!el || !i)
              return; const n = (document).createElement('span'); n.className = 'sc-pnum' + (i % 2 ? ' is-left' : ''); n.textContent = String(i + 1); n.style.fontSize = (1.7 * geo.scale).toFixed(1) + 'px'; n.setAttribute('aria-hidden', 'true'); el.appendChild(n); });
  }
  // Playback position: a thin blue line over the whole system. Its speed follows the tempo map.
  // Follow engraved onsets: non-proportional note spacing requires varying pixel speed between notes.
  function scoreCursorEl(): HTMLElement { const cur: HTMLElement | null = SCORE.cursorEl; if (cur)
      return cur;
      const el = (document).createElement('div');
      el.className = 'sc-cursor';
      el.setAttribute('aria-hidden', 'true');
      SCORE.cursorEl = el;
      return el; }
  function scoreCursorAt(beat: number): ScoreCursorPos | null {
      const g: ScoreGeometry | null = SCORE.geo, M = g && g.measures;
      if (!g || !M || !M.length)
          return null;
      const order = g.measureOrder ?? (g.measureOrder = M.reduce<number[]>((acc, item, idx) => {
          if (item)
              acc.push(idx);
          return acc;
      }, []));
      if (!order.length)
          return null;
      let lo = 0, hi = order.length - 1, pos = order.length - 1;
      while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          const cand = M[order[mid]];
          if (cand && beat < cand.b1 - 1e-9) {
              pos = mid;
              hi = mid - 1;
          }
          else {
              lo = mid + 1;
          }
      }
      const i = order[pos];
      const m = M[i];
      if (!m)
          return null;
      const anchored = scoreAnchorAt(g.anchors, beat, m.sys);
      if (anchored) return anchored;
      const n = M[i + 1], x0 = m.cx ?? m.xs, x1 = n && n.sys === m.sys ? (n.cx ?? n.xs) : m.x1 - .9;
      const t0 = scoreSeconds(m.b0), t1 = scoreSeconds(m.b1), at = Math.min(t1, Math.max(t0, scoreSeconds(beat)));
      const f = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
      return { x: x0 + (x1 - x0) * f, sys: m.sys };
  }
  // Cache geometry/tempo-dependent curves; playback frames only perform a binary search.
  const scoreCursorCurves = new WeakMap<ScoreGeoAnchor[], { tempos: ScoreState['tempoList']; curves: ReturnType<typeof createCursorCurves> }>();
  function scoreAnchorAt(A: ScoreGeoAnchor[], beat: number, sys: number): ScoreCursorPos | null {
      let cached = scoreCursorCurves.get(A);
      if (!cached || cached.tempos !== SCORE.tempoList) {
          cached = { tempos: SCORE.tempoList, curves: createCursorCurves(A, scoreSeconds) };
          scoreCursorCurves.set(A, cached);
      }
      const x = cursorCurveAt(cached.curves, scoreSeconds(beat), sys);
      return x === null ? null : { x, sys };
  }
  function scoreCursorUpdate(follow: boolean, time?: number, frameTime?: number) {
      const el = scoreCursorEl(), g: ScoreGeometry | null = SCORE.geo, p = g && AN.notes.length && FALL.mode === 'score' ? scoreCursorAt(scoreBeatAt(time ?? scoreVisualTime())) : null, s = g && p ? g.systems[p.sys] : null, page = g && s ? g.pages[s.page] : null;
      if (!g || !p || !s || !page) {
          if (el.parentNode) el.remove();
          SCORE.cursorStyle = null;
          return;
      }
      // Paint every frame, but only measure the scroll container periodically within the same system.
      if (follow && (frameTime === undefined || SCORE.followSys !== p.sys || frameTime - SCORE.followCheckedAt >= 80)) {
          const now = frameTime ?? performance.now();
          scoreCursorFollow(p, s, page, g, now);
          SCORE.followSys = p.sys;
          SCORE.followCheckedAt = now;
      }
      if (el.parentNode !== page) {
          page.appendChild(el);
          SCORE.cursorStyle = null;
      }
      const wVal = Math.max(1.5, Math.min(3, 2 * SCORE.zoom)), pad = 2 * g.scale; // 2 px at 100%
      const wStr = wVal.toFixed(1) + 'px';
      const hStr = ((s.bottom - s.top) * g.scale + 2 * pad).toFixed(1) + 'px';
      const trStr = 'translate(' + (p.x * g.scale - wVal / 2).toFixed(1) + 'px,' + (s.top * g.scale - pad).toFixed(1) + 'px)';
      const playing = !!SCORE.playing;
      const prev = SCORE.cursorStyle;
      if (!prev || prev.w !== wStr) {
          el.style.width = wStr;
          el.style.borderLeftWidth = wStr;
      }
      if (!prev || prev.h !== hStr)
          el.style.height = hStr;
      if (!prev || prev.transform !== trStr)
          el.style.transform = trStr;
      if (!prev || prev.playing !== playing)
          el.classList.toggle('is-playing', playing);
      SCORE.cursorStyle = { w: wStr, h: hStr, transform: trStr, playing };
  }
  // Keep the cursor in view: vertically by system in page view, horizontally in continuous view.
  function scoreCursorFollow(p: ScoreCursorPos, s: ScoreGeoSystem, page: HTMLElement, g: ScoreGeometry, now: number) {
      const box = byId('an-roll'), cont = SCORE.layout === 'cont';
      if (!box.clientHeight)
          return;
      if (cont ? (box.scrollWidth <= box.clientWidth + 1 && box.scrollLeft === 0) : (box.scrollHeight <= box.clientHeight + 1 && box.scrollTop === 0)) {
          return;
      }
      const b = box.getBoundingClientRect(), r = page.getBoundingClientRect(), behavior = reduceMotion() ? 'auto' : 'smooth';
      if (!b.height)
          return;
      if (cont) {
          const x = r.left + p.x * g.scale;
          if ((x < b.left + b.width * 0.08 || x > b.right - b.width * 0.3) && now - SCORE.panAt > 500) {
              SCORE.panAt = now;
              box.scrollTo({ left: box.scrollLeft + (x - b.left) - b.width * 0.15, behavior });
          }
          return;
      }
      const top = r.top + (s.top - 4) * g.scale, bottom = r.top + (s.bottom + 4) * g.scale, inView = top >= b.top && bottom <= b.bottom;
      if (!inView && (SCORE.followSys !== p.sys || now - SCORE.panAt > 800)) {
          SCORE.panAt = now;
          box.scrollTo({ top: box.scrollTop + (top - b.top) - Math.max(10, b.height * 0.12), behavior });
      }
  }
  // Coral bars: the selected bars, else the bars a running loop or the A–B range covers (score measure indices).
  function scoreCoralBars() {
      const g: ScoreGeometry | null = SCORE.geo;
      if (!g)
          return null;
      const R: ScoreMeasureRange | null = SCORE.mrange;
      if (R)
          return { a: R.a, b: R.b };
      const L: ScoreLoopState | null = SCORE.loop, ab = PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A, lo = L ? L.a : ab ? PRAC.A : null, hi = L ? L.b : PRAC.B;
      if (lo == null || hi == null)
          return null;
      const b0 = scoreBeatAt(lo), b1 = scoreBeatAt(hi), idx: number[] = [];
      g.measures.forEach((m: ScoreGeoMeasure | undefined, i: number) => { if (m && m.b1 > b0 + 1e-6 && m.b0 < b1 - 1e-6)
          idx.push(i); });
      return idx.length ? { a: idx[0], b: idx[idx.length - 1] } : null;
  }
  // Like MuseScore's range selection: one coral band per system, over every staff (top line of the top staff to the bottom
  // line of the bottom one), from where the first bar's notes begin (after a system's clef, key and time) to the last barline.
  function scoreMarks() {
      const g: ScoreGeometry | null = SCORE.geo, C = g && FALL.mode === 'score' ? scoreCoralBars() : null, sig = C ? C.a + ':' + C.b : '';
      if (sig === SCORE.markSig && g === SCORE.markGeo && (!C || (document).querySelector('#an-roll .sc-mrect')))
          return;
      SCORE.markSig = sig;
      SCORE.markGeo = g;
      (document).querySelectorAll('#an-roll .sc-mrect').forEach((e) => e.remove());
      if (!g || !C)
          return;
      const by = new Map<number, { x0: number; x1: number }>();
      for (let mi = C.a; mi <= C.b; mi++) {
          const m = g.measures[mi];
          if (!m)
              continue;
          const r = by.get(m.sys) || { x0: Infinity, x1: -Infinity };
          r.x0 = Math.min(r.x0, by.has(m.sys) ? m.x0 : m.xs);
          r.x1 = Math.max(r.x1, m.x1);
          by.set(m.sys, r);
      }
      by.forEach((r, si) => {
          const s = g.systems[si], page = g.pages[s.page];
          if (!page)
              return;
          const el = (document).createElement('div'), pad = 0.9 * g.scale;
          el.className = 'sc-mrect';
          el.setAttribute('aria-hidden', 'true');
          Object.assign(el.style, { left: (r.x0 * g.scale).toFixed(1) + 'px', top: (s.top * g.scale - pad).toFixed(1) + 'px', width: ((r.x1 - r.x0) * g.scale).toFixed(1) + 'px', height: ((s.bottom - s.top) * g.scale + 2 * pad).toFixed(1) + 'px' });
          page.appendChild(el);
      });
  }
  // Hit-test a click against the bars: inside a bar's box (system height) selects the bar, like clicking empty space in a MuseScore measure.
  function scoreMeasureAt(cx: number, cy: number) {
      const g: ScoreGeometry | null = SCORE.geo;
      if (!g)
          return -1;
      for (let pi = 0; pi < g.pages.length; pi++) {
          const el = g.pages[pi];
          if (!el)
              continue;
          const r = el.getBoundingClientRect();
          if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom)
              continue;
          const ux = (cx - r.left) / g.scale, uy = (cy - r.top) / g.scale;
          for (let mi = 0; mi < g.measures.length; mi++) {
              const m = g.measures[mi];
              if (!m)
                  continue;
              const s = g.systems[m.sys];
              if (s.page === pi && ux >= m.xs && ux <= m.x1 && uy >= s.top - 2 && uy <= s.bottom + 2)
                  return mi;
          }
      }
      return -1;
  }
  function scoreSelectMeasures(mi: number, extend: boolean) {
      const g: ScoreGeometry | null = SCORE.geo, R: ScoreMeasureRange | null = SCORE.mrange;
      if (!g || !g.measures[mi])
          return;
      scoreSelectRange(extend && R ? R.anchor : mi, mi);
  }
  function scoreSelectRange(anchor: number, mi: number) {
      const g: ScoreGeometry | null = SCORE.geo;
      const ma = g && g.measures[Math.min(anchor, mi)], mb = g && g.measures[Math.max(anchor, mi)];
      if (!g || !g.measures[anchor] || !g.measures[mi] || !ma)
          return;
      const a = Math.min(anchor, mi), b = Math.max(anchor, mi), lo = ma.b0, hi = (mb || ma).b1;
      const grid = SCORE.midiGrid || 0, q = (n: { start: number }) => grid ? Math.round(n.start * grid) / grid : n.start, idx: number[] = [];
      AN.notes.forEach((n, i) => { const s = q(n); if (s >= lo - 1e-6 && s < hi - 1e-6)
          idx.push(i); });
      AN.selected = new Set(idx);
      SCORE.mrange = { anchor, a, b, sig: idx.join() };
      anSelectionChanged();
  }
  function scoreUnlight() { if (!SCORE.lit.size)
      return; const old = SCORE.lit; SCORE.lit = new Set(); old.forEach(scorePaintIdx); }
  function anKeepVisible(g: Element, smooth: boolean) {
      const box = byId('an-roll'), r = g.getBoundingClientRect(), b = box.getBoundingClientRect();
      let top = box.scrollTop, left = box.scrollLeft;
      if (r.top < b.top + 16 || r.bottom > b.bottom - 16)
          top += r.top - b.top - b.height * .3;
      if (r.left < b.left + 16 || r.right > b.right - 16)
          left += r.left - b.left - b.width * .3;
      if (top !== box.scrollTop || left !== box.scrollLeft)
          box.scrollTo({ top, left, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
  }
  function scoreStateText() { byId('score-state').textContent = SCORE.run && SCORE.run.waitShown ? t('sc_state_wait') : SCORE.loop ? (SCORE.loop.ab ? t('sc_state_ab') : t('sc_state_loop', SCORE.loop.bars)) : SCORE.playing ? t(SCORE.sel ? 'sc_state_sel' : 'sc_state_play') : SCORE.paused ? t('sc_state_paused') : ''; }
  // Halt sound, timers and animation; the playback position (FALL.position) is left where it is.
  function scoreHalt() {
      if (SCORE.playing && SCORE.run && !SCORE.loop && !SCORE.sel) performanceRemember();
      SCORE.playing = false;
      anLibrarySyncPlayTimer();
      SCORE.sel = false;
      SCORE.paused = false;
      SCORE.loop = null;
      if (SCORE.run) {
          clearInterval(SCORE.run.timer);
          SCORE.run = null;
      }
      PRAC.bar = null;
      byId('pr-count').hidden = true;
      byId('pr-hud').hidden = true;
      cancelAnimationFrame(SCORE.followRaf);
      SCORE.followRaf = 0;
      cancelAnimationFrame(FALL.raf);
      FALL.raf = 0;
      scoreUnlight();
      FALL.lastT = null;
      FALL.particles = [];
      FALL.flashes = [];
      SCORE.playGen++;
      SCORE.timers.forEach(clearTimeout);
      SCORE.timers = [];
      stopClicks(shell.scoreClicks);
      stopPreviews();
  }
  function scoreIdle() { scoreStateText(); anUpdateControls(); anKeysPaint(); fallDraw(); scoreCursorUpdate(true); anStatusPos(); anLibrarySchedule(); }
  // Where Stop returns to: the start of the selected bars or notes, else the beginning.
  function anSelStart() {
      const g: ScoreGeometry | null = SCORE.geo, R: ScoreMeasureRange | null = SCORE.mrange, m = R && g && g.measures[R.a];
      if (m)
          return scoreSeconds(m.b0);
      return AN.selected.size ? Math.min(...[...AN.selected].map((i) => scoreSeconds(AN.notes[i].start))) : 0;
  }
  function scoreStop() { scoreHalt(); SCORE.resume = null; FALL.position = AN.notes.length ? anSelStart() : 0; performanceSeekScore(FALL.position, true); scoreIdle(); }
  function anStopAtCursor() {
      const position = fallTime();
      scoreHalt();
      SCORE.resume = null;
      FALL.position = position;
      scoreIdle();
  }
  function scorePause() { if (!SCORE.playing)
      return; const at = fallTime(), sel = SCORE.sel && !SCORE.loop, run = pracCarry(at); scoreHalt(); SCORE.paused = true; SCORE.resume = { sel, run }; FALL.position = at; scoreIdle(); }
  // Space / ▶: pause while playing, otherwise resume from the cursor (a paused selection resumes as a selection).
  function scoreToggle() {
      if (!AN.notes.length || AN.loading)
          return;
      if (SCORE.playing) {
          scorePause();
          return;
      }
      const r = SCORE.resume;
      SCORE.resume = null;
      scorePlay(!!(r && r.sel && AN.selected.size), FALL.position, r ? r.run : null);
  }
  function scoreHome() {
      if (!AN.notes.length)
          return;
      if (SCORE.playing && !SCORE.loop) {
          scoreHalt(); performanceSeek(0);
          scorePlay(false, 0);
          return;
      }
      scoreHalt();
      SCORE.resume = null;
      FALL.position = 0;
      performanceSeek(0);
      scoreIdle();
      if (FALL.mode === 'score')
          byId('an-roll').scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
  const PRAC: PracticeState = createPracticeState();
  function pracSave() { try {
      const { hands, wait, metro, metroOnly, countIn, acc, hear, expressive, ramp, labels, pal, range, fx, names } = PRAC;
      localStorage.setItem(PRAC_KEY, JSON.stringify({ hands, wait, metro, metroOnly, countIn, acc, hear, expressive, ramp, labels, pal, range, fx, names, zoom: FALL.zoom }));
      anLibrarySchedule();
  }
  catch (e) { } }
  function pracLoad() {
      try {
          const r = storage.legacySettings(localStorage, PRAC_KEY);
          if (!r)
              return;
          if (typeof r.hands === 'string' && ['both', 'rh', 'lh'].includes(r.hands))
              PRAC.hands = r.hands;
          PRAC_FLAGS.forEach((k) => { const v = r[k]; if (typeof v === 'boolean')
              PRAC[k] = v; });
          if (typeof r.labels === 'string' && ['none', 'letter', 'solfege', 'finger'].includes(r.labels))
              PRAC.labels = r.labels;
          if (typeof r.pal === 'string' && scoreHasKey(FALL_PAL, r.pal) && FALL_PAL[r.pal])
              PRAC.pal = r.pal;
          if (r.range === 'fit' || r.range === 'full')
              PRAC.range = r.range;
          if (typeof r.zoom === 'number' && r.zoom >= .4 && r.zoom <= 2.5)
              FALL.zoom = r.zoom;
      }
      catch (e) { }
  }
  const pracWait = () => PRAC.wait && !PRAC.metroOnly;
  const pracMetro = () => PRAC.metro || PRAC.metroOnly;
  const pracMine = (n: AnNote) => PRAC.hands === 'both' || scoreFeature.harmony.anHandOf(n) === PRAC.hands;
  // My part sounds only when I am not being waited for; the other hand is the accompaniment (or muted).
  const pracSounds = (n: AnNote) => !PRAC.metroOnly && (pracMine(n) ? PRAC.hear && !pracWait() : PRAC.acc);
  const pracFactor = () => +(selectById('score-speed').value || 100) / 100;
  const EXPR_CACHE: {
      notes?: readonly AnNote[];
      tempos?: readonly { beat: number; bpm: number }[];
      keys?: readonly { beat: number; root: number; minor: boolean }[];
      source?: AnSource | null;
      enabled?: boolean;
      strict?: boolean;
      plans: ExpressiveNotePlan[];
  } = { plans: [] };
  function scoreExpressionPlan(): readonly ExpressiveNotePlan[] {
      const strict = pracMetro() || pracWait() || PRAC.hands !== 'both';
      if (
          EXPR_CACHE.notes === AN.notes &&
          EXPR_CACHE.tempos === SCORE.tempoList &&
          EXPR_CACHE.keys === AN.keyMap &&
          EXPR_CACHE.source === AN.source &&
          EXPR_CACHE.enabled === PRAC.expressive &&
          EXPR_CACHE.strict === strict
      ) {
          return EXPR_CACHE.plans;
      }
      if (!buildScoreExpression || !AN.notes.length) {
          EXPR_CACHE.plans = [];
          return EXPR_CACHE.plans;
      }
      EXPR_CACHE.notes = AN.notes;
      EXPR_CACHE.tempos = SCORE.tempoList;
      EXPR_CACHE.keys = AN.keyMap;
      EXPR_CACHE.source = AN.source;
      EXPR_CACHE.enabled = PRAC.expressive;
      EXPR_CACHE.strict = strict;
      EXPR_CACHE.plans = buildScoreExpression({
          notes: AN.notes,
          measures: anMeasures(),
          tempos: SCORE.tempoList,
          keys: AN.keyMap,
          sourceKind: AN.source?.kind ?? 'midi',
          expression: AN.source?.kind === 'xml' ? AN.source.expression : null,
          enabled: PRAC.expressive,
          strictTiming: strict,
      });
      return EXPR_CACHE.plans;
  }
  function pracPosition(R: { segs: PracticeSegment[] }, now: number) {
      const { s, t } = pracRaw(R, now), B = PRAC.bar;
      return { s, t: Math.min(t, s.t1, B?.seg === s ? B.t : Infinity) };
  }
  function pracBeats() {
      if (FALL.beatSrc === fallData() && FALL.beatTempo === SCORE.tempoList && FALL.beats)
          return FALL.beats;
      const out: PracticeBeat[] = [];
      anMeasures().forEach((m, i) => {
          const u = scoreFeature.harmony.anBeatUnit(m), full = m.num * 4 / m.den, short = full - (m.end - m.start);
          // An upbeat (a short first bar) holds the last beats of a bar, so its first click is not the accented downbeat.
          let k = i === 0 && short > 1e-6 ? Math.round(short / u) : 0;
          for (let b = m.start; b < m.end - 1e-6; b += u, k++)
              out.push({ t: scoreSeconds(b), acc: k === 0 });
      });
      FALL.beatSrc = fallData();
      FALL.beatTempo = SCORE.tempoList;
      FALL.beats = out;
      return out;
  }
  function pracStatsReset() {
      anHideMistakeBar();
      PRAC.stats = { perfect: 0, good: 0, miss: 0, wrong: 0, streak: 0, best: 0, passHit: 0, passAll: 0, lastPass: null };
      PRAC.active = pracWait();
      PRAC.judge = '';
      const old = [...PRAC.res.keys()];
      PRAC.res = new Map();
      old.forEach(scorePaintIdx);
      pracHud();
  }
  let cachedRepeatXml = '';
  let cachedRepeatMeasures: typeof SCORE.measures | undefined;
  let cachedRepeatBars: ReturnType<typeof scoreXmlRepeatBars> = [];
  function scoreRepeatRoute(from: number) {
      if (AN.source?.kind !== 'xml' || !SCORE.xml) return undefined;
      if (cachedRepeatXml !== SCORE.xml || cachedRepeatMeasures !== SCORE.measures) {
          const doc = new DOMParser().parseFromString(SCORE.xml, 'application/xml');
          cachedRepeatXml = SCORE.xml;
          cachedRepeatMeasures = SCORE.measures;
          cachedRepeatBars = scoreXmlRepeatBars(doc, SCORE.measures);
      }
      const bars = cachedRepeatBars.map(bar => ({
          ...bar, start: scoreSeconds(bar.start), end: scoreSeconds(bar.end),
      }));
      const route = repeatRanges(bars);
      const first = route.findIndex(r => from >= r.a - 1e-6 && from < r.b - 1e-6);
      return first < 0 ? undefined : route.slice(first).map((r, i) => ({ a: i ? r.a : from, b: r.b }));
  }
  const PERFORMANCE: { notes?: readonly AnNote[]; tempos?: typeof SCORE.tempoList; xml?: string; timeline: PerformanceTimeline; position: number; score: number; elapsed: number } = {
      timeline: { ranges: [], duration: 0 }, position: 0, score: 0, elapsed: 0,
  };
  function performancePlan() {
      if (PERFORMANCE.notes !== AN.notes || PERFORMANCE.tempos !== SCORE.tempoList || PERFORMANCE.xml !== SCORE.xml) {
          PERFORMANCE.notes = AN.notes; PERFORMANCE.tempos = SCORE.tempoList; PERFORMANCE.xml = SCORE.xml;
          PERFORMANCE.timeline = performanceTimeline(scoreRepeatRoute(0) ?? [{ a: 0, b: fallEnd() }]);
          PERFORMANCE.position = performanceOf(PERFORMANCE.timeline, FALL.position);
          PERFORMANCE.score = FALL.position; PERFORMANCE.elapsed = PERFORMANCE.position / pracFactor();
      }
      return PERFORMANCE.timeline;
  }
  function performanceRead() {
      const plan = performancePlan(), R = SCORE.run;
      if (SCORE.playing && R && !R.sel && !R.loop) {
          const s = pracSegAt(R, shell.audioEngine.context?.currentTime ?? 0), delta = Math.max(0, fallTime() - s.t0);
          return { position: Math.min(plan.duration, (s.p0 ?? 0) + delta), elapsed: (s.elapsed0 ?? 0) + delta / s.f };
      }
      if (Math.abs(PERFORMANCE.score - FALL.position) > .001) performanceSeekScore(FALL.position);
      return { position: PERFORMANCE.position, elapsed: PERFORMANCE.elapsed };
  }
  function performanceRemember() {
      const p = performanceRead(); PERFORMANCE.position = p.position; PERFORMANCE.elapsed = p.elapsed; PERFORMANCE.score = fallTime();
  }
  function performanceSeekScore(score: number, first = false) {
      const plan = performancePlan(), run = SCORE.run;
      const near = first ? 0 : SCORE.playing && run && !run.loop && !run.sel ? performanceRead().position : PERFORMANCE.position;
      PERFORMANCE.position = performanceOf(plan, score, near); PERFORMANCE.score = score;
      PERFORMANCE.elapsed = PERFORMANCE.position / pracFactor();
  }
  function performanceSeek(position: number) {
      const p = performanceAt(performancePlan(), position);
      PERFORMANCE.position = p.position; PERFORMANCE.score = p.score; PERFORMANCE.elapsed = p.position / pracFactor();
      FALL.position = p.score;
  }
  function performanceDisplay() {
      const R = SCORE.run, f = pracFactor();
      if (R?.loop || R?.sel) {
          const rate = SCORE.playing && shell.audioEngine.context ? pracSegAt(R, shell.audioEngine.context.currentTime).f : f;
          const position = Math.max(0, Math.min(R.b - R.a, fallTime() - R.a));
          return { position, end: R.b - R.a, elapsed: position / rate, total: (R.b - R.a) / rate };
      }
      const p = performanceRead(), end = performancePlan().duration;
      return { ...p, end, total: p.elapsed + Math.max(0, end - p.position) / f };
  }
  async function pracStart(o: PracticeStartOptions)  {
      scoreHalt();
      SCORE.resume = null;
      ensureAudio();
      if (!scoreModulesReady())
          await ensureModules();
      const gen = SCORE.playGen;
      FALL.position = o.from;
      scoreIdle();
      const soundMidis = [...new Set(o.notes.flatMap((d) => {
          const list = [d.n.midi, ...(d.n.graces || []).map((g) => g.midi)];
          if (d.n.ornament) {
              for (const offset of [-2, -1, 1, 2]) {
                  const neighbor = d.n.midi + offset;
                  if (neighbor >= 21 && neighbor <= 108) list.push(neighbor);
              }
          }
          return list;
      }))];
      if (!await pianoEnsure(soundMidis) || gen !== SCORE.playGen || !shell.audioEngine.context)
          return;
      const f = pracFactor(), now = shell.audioEngine.context.currentTime + .1;
      let a0 = now, ci: PracticeCountIn | null = null;
      if (PRAC.countIn) {
          const beat = scoreBeatAt(o.from), m = anMeasureAt(beat) || { num: 4, den: 4 }, u = scoreFeature.harmony.anBeatUnit(m), n = Math.max(2, Math.round(m.num * 4 / m.den / u)), sec = u * 60 / anTempoAt(beat) / f;
          for (let k = 0; k < n; k++)
              shell.audioEngine.scheduleClick(now + k * sec, k === 0, shell.scoreClicks);
          ci = { t: now, n, sec };
          a0 = now + n * sec;
      }
      const beats: PracticeBeat[] = pracBeats(), first = (t: number) => { const i = beats.findIndex((b) => b.t >= t - 1e-6); return i < 0 ? beats.length : i; };
      // Resuming a paused whole run keeps it one run: the judgements so far, and my whole part, so a note skipped before the
      // pause still counts as missed. Anything changed meanwhile (cursor, hands, Wait for me, tempo, the score) starts a new run.
      const c = o.carry, resumed = !!c && !o.sel && !o.loop && c.notes === AN.notes && c.src === AN.source && c.hands === PRAC.hands && c.wait === pracWait() && c.f === f && Math.abs(c.at - o.from) < .01;
      const targets = resumed ? fallData().slice().sort((x, y) => x.start - y.start || x.n.midi - y.n.midi) : o.notes;
      const mine: PracticeTimedNote[] = [];
      const byPitch = new Map<number, PracticeTimedNote>();
      for (const note of targets) {
          if (!pracMine(note.n)) continue;
          const unison = byPitch.get(note.n.midi);
          if (unison && Math.abs(unison.start - note.start) < 1e-6) {
              (unison.unisons ??= []).push(note.i);
          } else {
              const target = { ...note };
              mine.push(target);
              byPitch.set(note.n.midi, target);
          }
      }
      const R: PracticeRun = { ...o, carry: null, segs: [{ a0, t0: o.from, t1: o.b, f, first: true }], ni: 0, beats, bi: first(o.from), beat0: first(o.a), wt: o.from, pass: 1, mine, mi: Math.max(0, mine.findIndex((d) => d.start >= o.from - 1e-6)), judged: new Map(), mistakes: [], gen, ci, timer: 0 };
      if (o.loop) R.segs[0].p0 = 0;
      if (!o.loop && !o.sel) {
          const plan = performancePlan(), p = performanceRead(), at = performanceAt(plan, p.position);
          const route = resumed && c?.route ? c.route.map(r => ({ ...r })) : plan.ranges.slice(at.index).map((r, i) => ({ a: i ? r.a : o.from, b: r.b }));
          if (route?.length) { R.segs[0].t1 = route[0].b; R.b = route[route.length - 1].b; R.route = route.slice(1); }
          R.segs[0].p0 = p.position; R.segs[0].elapsed0 = p.elapsed;
          R.pass = 1 + plan.ranges.slice(1, at.index + 1).filter((r, i) => r.a < plan.ranges[i].b - 1e-6).length;
      }
      if (R.mi < 0 || !mine.some((d) => d.start >= o.from - 1e-6))
          R.mi = mine.length;
      if (resumed && c) {
          R.pass = c.pass ?? R.pass;
          R.completed = c.completed ? new Set(c.completed) : undefined;
          R.origin = c.origin;
          R.judged = new Map(c.judged);
          R.mistakes = [...(c.mistakes ?? [])];
          const earliest = R.pass === 1 ? c.origin : -Infinity;
          const next = mine.findIndex((d) => d.start >= earliest - 1e-6 && !R.judged.has(d.i));
          R.mi = next < 0 ? mine.length : next;
      }
      if (resumed && c)
          R.sustain = c.sustain;
      else if (!o.loop) {
          const src = AN.source, events = src?.kind === 'xml' ? src.sustain : src?.parsed.sustain;
          if (events?.length) {
              const segment = R.segs[0];
              const ranges = [{ a: segment.t0, b: segment.t1 }, ...(R.route ?? [])];
              const expected = practiceSustainReference(events.map(e => ({ time: scoreSeconds(e.beat), down: e.down })), ranges, segment.p0 ?? 0);
              if (expected.length)
                  R.sustain = { expected, played: [], midi: false };
          }
      }
      SCORE.run = R;
      SCORE.playing = true;
      anLibrarySyncPlayTimer();
      SCORE.sel = o.sel;
      const loop: ScoreLoopState | null = o.loop ? { a: o.a, b: o.b, bars: o.bars, ab: !!o.ab, pass: 1, notes: o.notes, next: a0 + (o.b - o.a) / f } : null;
      SCORE.loop = loop;
      FALL.origin = o.from;
      FALL.audioStart = a0;
      FALL.factor = f;
      SCORE.followSys = -1;
      pracStatsReset();
      if (resumed && c) {
          PRAC.stats = { ...c.stats };
          PRAC.active = c.active || pracWait();
          PRAC.res = new Map(c.res);
          if (FALL.mode === 'score')
              PRAC.res.forEach((_, i) => scorePaintIdx(i));
          pracHud();
      }
      pracTick();
      R.timer = setInterval(pracTick, 25);
      scoreStateText();
      anUpdateControls();
      fallDraw();
      scoreFollow();
  }
  // What a pause keeps of the running whole-piece run (no loop or selection) so that Play carries it on.
  function pracCarry(at: number): PracticeCarry | null {
      const R = SCORE.run, st = PRAC.stats;
      if (!R || R.loop || R.sel || !st)
          return null;
      const index = Math.max(0, R.segs.indexOf(pracSegAt(R, shell.audioEngine.context?.currentTime ?? 0)));
      return { pass: R.pass + R.segs.slice(1, index + 1).filter((s, i) => s.t0 < R.segs[i].t1 - 1e-6).length, notes: AN.notes, src: AN.source, at, origin: R.origin ?? R.from, hands: PRAC.hands, wait: pracWait(), f: R.segs[0].f, judged: new Map(R.judged), mistakes: [...R.mistakes], stats: { ...st }, active: PRAC.active, res: new Map(PRAC.res), completed: R.completed ? new Set(R.completed) : undefined, route: R.route ? [{ a: at, b: R.segs[index].t1 }, ...R.segs.slice(index + 1).map(s => ({ a: s.t0, b: s.t1 })), ...R.route] : undefined, sustain: R.sustain };
  }
  function pracTick() {
      const R = SCORE.run;
      if (!R || !SCORE.playing || !shell.audioEngine.context || R.gen !== SCORE.playGen)
          return;
      const now = shell.audioEngine.context.currentTime, H = now + .3;
      for (let guard = 0; guard < 4; guard++) {
          const s = R.segs[R.segs.length - 1];
          // A queued pass still shares the previous pass's judgements. Wait until
          // the audio clock enters it and pracPassEnd clears them before choosing its barrier.
          if (pracWait() && s !== R.segs[0]) break;
          if (pracWait() && !PRAC.bar && R.wt !== Infinity)
              pracNextBar(R, s);
          const B: PracticeBarrier | null = PRAC.bar && PRAC.bar.seg === s ? PRAC.bar : null, at = (x: number) => s.a0 + (x - s.t0) / s.f;
          const horizon = s.t0 + Math.max(0, H - s.a0) * s.f, lim = Math.min(horizon, s.t1, B ? B.t : Infinity);
          const exprPlan = scoreExpressionPlan();
          while (R.ni < R.notes.length) {
              const d = R.notes[R.ni];
              if (d.start >= lim)
                  break;
              R.ni++;
              const sound = d.sound ?? d.finish;
              if (d.start < s.t0 - 1e-6 && (!s.first || sound <= s.t0 + .05))
                  continue; // a note already sounding when playback starts plays its remainder
              if (!pracSounds(d.n))
                  continue;
              const st = Math.max(d.start, s.t0), en = R.loop || R.route ? Math.min(sound, s.t1) : sound, roll = d.n.roll || 0;
              const resumedMidNote = st > d.start + 1e-6;
              const expr = exprPlan[d.i];
              const baseOnset = at(st) + roll;
              const onsetShift = !resumedMidNote && expr ? expr.onsetShiftSec / s.f : 0;
              const onset = Math.max(now, baseOnset + onsetShift);
              const rawDuration = Math.max(.05, (en - st) / s.f - roll);
              let duration = rawDuration;
              if (expr && !expr.hold) {
                  duration = Math.max(.045, rawDuration * expr.durationScale + expr.legatoOverlapSec);
                  if (expr.restrikeGapSec > 0)
                      duration = Math.max(.04, rawDuration - Math.min(expr.restrikeGapSec, rawDuration * .25));
                  if (R.loop || R.route) {
                      const maxEnd = at(s.t1) + .02;
                      if (onset + duration > maxEnd)
                          duration = Math.max(.04, maxEnd - onset);
                  }
              }
              const vel = expr ? expr.vel : d.n.vel;
              const opt: audio.PianoVoiceOptions = {
                  warm: expr ? expr.warm : !!d.n.warm,
                  hold: expr ? expr.hold : (!!d.n.pedalEnd && d.n.soundEnd !== undefined && d.n.soundEnd > d.n.end + .001),
                  accent: expr ? expr.accent : !!(d.n.art?.accent || d.n.art?.strongAccent),
                  expressive: PRAC.expressive,
              };
              const graces = resumedMidNote ? [] : (d.n.graces || []);
              const gStep = (expr ? expr.graceStepSec : .07) / s.f;
              let carried = false;
              graces.forEach((g, i) => {
                  const when = onset - (graces.length - i) * gStep, start = Math.max(now, when), carry = i === graces.length - 1 && g.tiedToPrincipal && g.midi === d.n.midi;
                  const gVel = PRAC.expressive ? Math.max(18, Math.min(125, Math.round(vel * .9))) : (g.vel ?? Math.max(1, vel - 8));
                  if (carry) {
                      host.audio.previewNote(g.midi, start, Math.max(.05, onset + duration - start), gVel, opt);
                      carried = true;
                  }
                  else if (when + gStep * .93 > now - .01)
                      host.audio.previewNote(g.midi, start, Math.max(.045, gStep * .93), gVel, opt);
              });
              if (!carried) {
                  if (!resumedMidNote && expr?.ornamentEvents?.length) {
                      expr.ornamentEvents.forEach((ev) => {
                          const evStart = Math.max(now, onset + ev.offsetSec / s.f);
                          const evDur = Math.max(.035, ev.durationSec / s.f);
                          host.audio.previewNote(ev.midi, evStart, evDur, ev.vel, opt);
                      });
                  }
                  else {
                      host.audio.previewNote(d.n.midi, onset, duration, vel, opt);
                  }
              }
          }
          while (R.bi < R.beats.length && R.beats[R.bi].t < lim) {
              const b = R.beats[R.bi++];
              if (pracMetro() && b.t >= s.t0 - 1e-6 && b.t < s.t1 - 1e-6)
                  shell.audioEngine.scheduleClick(Math.max(now, at(b.t)), b.acc, shell.scoreClicks);
          }
          if (R.route?.length && !B && horizon >= s.t1) {
              const range = R.route.shift();
              if (range) {
                  R.segs.push({ a0: at(s.t1), t0: range.a, t1: range.b, f: s.f, first: false,
                      p0: (s.p0 ?? 0) + (s.t1 - s.t0), elapsed0: (s.elapsed0 ?? 0) + (s.t1 - s.t0) / s.f });
                  R.ni = 0; R.bi = Math.max(0, R.beats.findIndex(b => b.t >= range.a - 1e-6)); R.wt = range.a;
                  continue;
              }
          }
          if (R.loop && !B && horizon >= s.t1) {
              const end = at(s.t1);
              const waitForGrade = PRAC.ramp && !pracWait();
              if (waitForGrade && now < end + (PRAC.active ? .22 : 0))
                  break;
              if (waitForGrade && PRAC.active)
                  pracMisses(R, Infinity);
              const next = { a0: waitForGrade ? now + .025 : end, t0: R.a, t1: R.b, f: pracRamp(R, s), first: false,
                  p0: (s.p0 ?? 0) + (s.t1 - s.t0) }, L: ScoreLoopState | null = SCORE.loop;
              R.segs.push(next);
              if (L)
                  L.next = next.a0 + (R.b - R.a) / next.f;
              R.ni = 0;
              R.bi = R.beat0;
              R.wt = R.a;
              continue;
          }
          break;
      }
      while (R.segs.length > 1 && R.segs[1].a0 <= now) {
          if (R.route) {
              if (PRAC.active && !pracWait()) pracMisses(R, R.segs[0].t1 + .3);
              R.completed ??= new Set();
              R.judged.forEach((_, i) => R.completed?.add(i));
          }
          if (R.loop && PRAC.active && !pracWait()) pracMisses(R, Infinity);
          const previous = R.segs.shift();
          if (previous && !pracWait()) {
              // The rendering clock can enter a repeat while the previous notes are still at the output.
              const history = R.outputHistory ??= [];
              history.push(previous);
              while (history.length > 1 && history[1].a0 < now - audio.AUDIO_OUTPUT_CLOCK_WINDOW) history.shift();
          }
          pracPassEnd(R, !!R.loop || R.segs[0].t0 < (previous?.t1 ?? 0) - 1e-6);
          if (pracWait()) R.wt = R.segs[0].t0;
          if (R.route) { const i = R.mine.findIndex(d => d.start >= R.segs[0].t0 - 1e-6); R.mi = i < 0 ? R.mine.length : i; }
      }
      if (pracWait() && R.segs.length === 1 && !PRAC.bar && R.wt !== Infinity) pracNextBar(R, R.segs[0]);
      const time = fallTime();
      if (PRAC.active && !pracWait())
          pracMisses(R, time);
      const s0 = R.segs[0];
      if (!R.loop && !R.route?.length && R.segs.length === 1 && time >= R.b - 1e-6 && now >= s0.a0 + (R.b - s0.t0) / s0.f + .3) {
          if (PRAC.active && !pracWait())
              pracMisses(R, Infinity); // the end of the piece: a note still not played is missed, however short
          pracFinish(R);
      }
  }
  // Loop: the next pass is 1 step faster (up to 100%) when the pass was clean, or always when no one is playing along.
  function pracRamp(R: PracticeRun, s: PracticeSegment) {
      const st = PRAC.stats;
      if (!PRAC.ramp || !st)
          return s.f;
      const acc = st.passAll ? st.passHit / st.passAll : null;
      if (PRAC.active && (acc == null || acc < .8))
          return s.f;
      const sel = selectById('score-speed'), cur = Math.round(s.f * 100), next = [...sel.options].map((o) => +o.value).find((v) => v > cur && v <= 100);
      if (!next)
          return s.f;
      sel.value = String(next);
      const pt = maybeById('pt-speed');
      if (pt instanceof HTMLSelectElement)
          pt.value = String(next);
      return next / 100;
  }
  function pracPassEnd(R: PracticeRun, repeat = true) {
      const st = PRAC.stats, L: ScoreLoopState | null = SCORE.loop;
      if (!st)
          return;
      if (repeat) R.pass++;
      st.lastPass = st.passAll ? st.passHit / st.passAll : null;
      st.passHit = 0;
      st.passAll = 0;
      if (L)
          L.pass = R.pass;
      FALL.factor = R.segs[0].f;
      R.mi = 0;
      R.judged = new Map();
      R.waitShown = false;
      const old = [...PRAC.res.keys()];
      PRAC.res = new Map();
      if (FALL.mode === 'score')
          old.forEach(scorePaintIdx);
      pracHud();
  }
  function pracNextBar(R: PracticeRun, s: PracticeSegment) {
      const from = Math.max(R.wt, s.t0);
      // Only completed barriers are judged; a partial chord must be replayed after a pause.
      const d = R.mine.find((x) => x.start >= from - 1e-6 && x.start < s.t1 - 1e-6 && !(s.first && x.start < R.from - 1e-6) && !R.judged.has(x.i));
      if (!d) {
          R.wt = Infinity;
          return;
      }
      const group = R.mine.filter((x) => Math.abs(x.start - d.start) < 1e-6 && !R.judged.has(x.i));
      const rolled = new Set(group.filter(x => group.some(y => (y.n.arpeggiate || (y.n.roll ?? 0) > 0) && x.n.part === y.n.part && x.n.staff === y.n.staff && x.n.voice === y.n.voice)).map(x => x.n.midi));
      const allowed = new Set(fallData().filter(x => x.start <= d.start + 1e-6 && (x.start < d.start - 1e-6 || !pracMine(x.n)) && x.finish > d.start + 1e-6).map(x => x.n.midi));
      PRAC.bar = { allowed, attacks: new Map(), attempts: 0, rolled, t: d.start, need: new Set(group.map((x) => x.n.midi)), got: new Set(), group, seg: s, since: 0 };
  }
  function pracRelease(R: PracticeRun, B: PracticeBarrier, now: number) {
      const s = B.seg, t = s.t0 + Math.max(0, now - s.a0) * s.f;
      if (t > B.t) {
          if (s.p0 !== undefined) s.p0 += B.t - s.t0;
          if (s.elapsed0 !== undefined) s.elapsed0 += (B.t - s.t0) / s.f;
          s.t0 = B.t;
          s.a0 = now + .01;
          FALL.audioStart = s.a0;
      } // the clock was frozen: resume from the barrier
      R.wt = B.t;
      PRAC.bar = null;
      R.waitShown = false;
      scoreStateText();
      pracTick();
  }
  function pracMisses(R: PracticeRun, time: number) {
      const tol = .22 * (R.segs[0].f || 1);
      const limit = Math.min(time - tol, R.route ? R.segs[0].t1 : Infinity);
      while (R.mi < R.mine.length && R.mine[R.mi].start < limit) {
          const d = R.mine[R.mi++];
          if (!R.judged.has(d.i))
              pracJudge(R, d, 'miss');
      }
  }
  function pracRecordMistake(
      R: PracticeRun,
      kind: PracticeMistakeEvent['kind'],
      scoreTimeSec: number,
      midi?: number,
      noteIndex?: number,
  ) {
      const ms = anMeasures();
      if (!ms.length) return;
      const beat = scoreBeatAt(Math.max(0, scoreTimeSec));
      const measureIndex = anMeasureIndex(ms, beat);
      const m = ms[measureIndex];
      R.mistakes.push({
          measureIndex,
          measureNumber: String(m?.number ?? measureIndex + 1),
          pass: R.pass,
          beat,
          kind,
          midi,
          noteIndex,
      });
  }
  function pracJudge(R: PracticeRun, d: PracticeTimedNote | null, j: 'perfect' | 'good' | 'miss' | 'wrong', extraMidi?: number) {
      const st = PRAC.stats;
      if (!st)
          return;
      st[j]++;
      if (extraMidi !== undefined) st.extraMidi = extraMidi;
      if (j === 'perfect' || j === 'good') {
          st.streak++;
          st.best = Math.max(st.best, st.streak);
          st.passHit++;
      }
      else
          st.streak = 0;
      st.passAll++;
      if (d) {
          if (j === 'miss')
              pracRecordMistake(R, 'miss', d.start, d.n.midi, d.i);
          for (const index of [d.i, ...(d.unisons ?? [])]) {
              R.judged.set(index, j);
              PRAC.res.set(index, j === 'miss' ? 'miss' : 'hit');
              if (FALL.mode === 'score')
                  scorePaintIdx(index);
          }
      }
      PRAC.judge = j;
      PRAC.judgeT = performance.now();
      pracHud();
  }
  // "Accept any octave" (the shared setting) lets a key count for the same note name in another octave.
  function pracSame(want: number, played: number) { return samePitch(want, played, !!host.store.data().settings.anyOctave); }
  // The awaited key a played key stands for: the key itself, else (any octave) an unplayed one with its note name.
  function pracNeedKey(B: PracticeBarrier, m: number) {
      if (B.need.has(m))
          return m;
      if (!host.store.data().settings.anyOctave)
          return null;
      const same = [...B.need].filter((x) => pc(x) === pc(m));
      return same.find((x) => !B.got.has(x)) ?? same[0] ?? null;
  }
  function pracWaitUpdate(R: PracticeRun, B: PracticeBarrier, now: number) {
      const result = evaluateWaitChord(B.need, B.attacks, shell.held, B.rolled, B.allowed, !!host.store.data().settings.anyOctave);
      B.got = result.got;
      if (!result.complete) return;
      for (let i = B.need.size; i < B.attempts; i++)
          pracJudge(R, null, 'wrong');
      B.group.filter(x => !R.judged.has(x.i)).forEach(x => pracJudge(R, x, 'perfect'));
      pracRelease(R, B, shell.audioEngine.context?.currentTime ?? now);
  }
  function pracSustainInput(down: boolean) {
      const R = SCORE.run, ctx = shell.audioEngine.context;
      if (!R?.sustain || !SCORE.playing || !ctx)
          return;
      const now = ctx.currentTime - Math.max(0, inputLag()) / 1000;
      if (now < R.segs[0].a0 - .12)
          return;
      const { s, t } = pracRaw(R, now), B = PRAC.bar;
      const position = Math.min(B?.seg === s ? B.t : Infinity, t);
      R.sustain.played.push({ time: (s.p0 ?? 0) + position - s.t0, down });
      R.sustain.midi = true;
      PRAC.active = true;
  }
  // Live input in this view: the computer keyboard, on-screen keys, the falling-notes keyboard or a MIDI device.
  function pracInput(kind: 'on' | 'off', midi: number, source: string) {
      const R = SCORE.run;
      if (kind === 'off' && R && SCORE.playing && PRAC.bar && shell.audioEngine.context) {
          const B = PRAC.bar;
          pracWaitUpdate(R, B, shell.audioEngine.context.currentTime);
      }
      if (kind === 'on' && R && SCORE.playing && shell.audioEngine.context) {
          // The key's own time on the audio clock: the handler may run a frame or a radio interval after the note was played.
          const m = midi, now = shell.audioEngine.context.currentTime - Math.max(0, inputLag()) / 1000;
          const waiting = pracWait();
          if (now >= R.segs[0].a0 - (waiting ? .05 : .22)) {
              PRAC.active = true;
              if (R.sustain && (source === 'midi' || source === 'ble'))
                  R.sustain.midi = true;
              const { s, t } = pracRaw(R, now), B = PRAC.bar, key = B && B.seg === s && t >= B.t - .3 * s.f ? pracNeedKey(B, m) : null;
              if (B && key != null) {
                  B.attempts++;
                  B.attacks.set(m, now);
                  pracWaitUpdate(R, B, now);
              }
              else {
                  if (waiting) {
                      pracRecordMistake(R, 'extra', t, m);
                      pracJudge(R, null, 'wrong', m);
                      return;
                  }
                  const time = t + Math.min(0, now - s.a0) * s.f, tol = .22 * s.f;
                  const from = s.first ? R.origin ?? R.from : s.t0;
                  let best: PracticeTimedNote | null = null;
                  for (const d of R.mine) {
                      if (d.start > time + tol || d.start >= s.t1 - 1e-6)
                          break;
                      if (!pracSame(d.n.midi, m) || R.judged.has(d.i) || d.start < Math.max(from - 1e-6, time - tol))
                          continue;
                      if (!best || Math.abs(d.start - time) < Math.abs(best.start - time) ||
                          d.start === best.start && d.n.midi === m)
                          best = d;
                  }
                  if (best)
                      pracJudge(R, best, Math.abs(best.start - time) < .09 * s.f ? 'perfect' : 'good');
                  else {
                      const unmatchedKind = classifyUnmatchedKeyPress(
                          m,
                          time,
                          R.mine.map((d) => ({ midi: d.n.midi, start: d.start, judged: R.judged.has(d.i) })),
                          s.f,
                          !!host.store.data().settings.anyOctave,
                      );
                      pracRecordMistake(R, unmatchedKind, time, m);
                      pracJudge(R, null, 'wrong', m);
                  }
              }
          }
      }
      if (FALL.mode === 'fall' && !FALL.raf)
          fallDraw();
  }
  function pracHud() {
      const hud = byId('pr-hud'), st = PRAC.stats;
      if (!hud)
          return;
      const show = !!st && (PRAC.active || !!SCORE.loop) && AN.notes.length > 0 && (SCORE.playing || !!SCORE.run);
      hud.hidden = !show;
      if (!show)
          return;
      const acc = st && pracAcc(st), R = SCORE.run;
      byId('pr-acc-v').textContent = acc == null ? '–' : practicePercent(acc) + '%';
      byId('pr-streak').textContent = String(st ? st.streak : 0);
      byId('pr-pass').textContent = String(R ? R.pass : 1);
      byId('pr-tempo').textContent = Math.round(((R && R.segs[0].f) || pracFactor()) * 100) + '%';
      const j = byId('pr-judge'), fresh = PRAC.judge && performance.now() - PRAC.judgeT < 900;
      j.dataset.j = fresh ? PRAC.judge : '';
      j.textContent = fresh ? t('pr_' + (PRAC.judge === 'miss' ? 'miss' : PRAC.judge)) : '';
  }
  function pracFinish(R: PracticeRun) {
      if (!R.sel && !R.loop) performanceRemember();
      const sel = R.sel, a = R.a, end = R.b;
      clearInterval(R.timer);
      SCORE.run = null;
      PRAC.bar = null;
      SCORE.playing = false;
      anLibrarySyncPlayTimer();
      SCORE.sel = false;
      SCORE.timers = [];
      cancelAnimationFrame(SCORE.followRaf);
      SCORE.followRaf = 0;
      cancelAnimationFrame(FALL.raf);
      FALL.raf = 0;
      scoreUnlight();
      FALL.lastT = null;
      FALL.position = sel ? a : end;
      scoreIdle();
      byId('pr-hud').hidden = true;
      if (PRAC.active && PRAC.stats) {
          const saved = pracRecord(R);
          pracSummary(R, saved, saved || !AN.source ? '' : pracWhyNot(R));
      }
  }
  // A run counts as progress only when it covers the whole piece: no selection, loop or A–B range, every hand the piece has,
  // and it starts at the first note (a run paused and resumed counts from where it first started). pracNotWhole names the
  // rule a run breaks, as the Run complete card's pc_why_* line.
  function pracNotWhole(R: PracticeRun) {
      if (R.sel)
          return 'pc_why_sel';
      if (R.loop || R.ab)
          return 'pc_why_loop';
      const all = fallData();
      if (!all.length)
          return 'pc_why_part';
      if (PRAC.hands !== 'both' && all.some((d) => !pracMine(d.n)))
          return 'pc_why_hand';
      const first = Math.min(...all.map((d) => d.start)), last = Math.max(...all.map((d) => d.finish));
      return (R.origin ?? R.from) <= first + .05 && R.b >= last - .05 ? '' : 'pc_why_part';
  }
  function pracWholePiece(R: PracticeRun) { return !pracNotWhole(R); }
  // Why a finished run saved nothing: a broken whole-piece rule, else notes left unplayed.
  function pracWhyNot(R: PracticeRun) { return pracNotWhole(R) || 'pc_why_gaps'; }
  // A timed run keeps the best accuracy; a complete "Wait for me" pass marks a built-in piece as learned.
  // Built-in pieces write data.sheet (the fields Read & Play used); library files keep theirs in the library record.
  function pracRecord(R: PracticeRun): PracticeSaved | null {
      const st = PRAC.stats, src = AN.source, acc = st ? pracAcc(st) : null;
      if (!st || !src || !pracWholePiece(R))
          return null;
      const every = pracEveryNote(R), waited = pracWait(), complete = waited && every;
      if (waited ? !complete : acc == null || (R.origin != null && !every))
          return null;
      // The accuracy of a timed run; a waiting run plays at your pace, so it sets no best.
      const pct = !waited && acc != null ? practicePercent(acc) : null;
      let saved: PracticeSaved = { best: null, newBest: false, learned: false };
      if (src.kind === 'example') {
          const rec = host.store.data().sheet[src.id] || (host.store.data().sheet[src.id] = {}), old = rec.best || 0, beaten = pct != null && pct > old;
          if (beaten)
              rec.best = pct;
          if (complete)
              rec.learned = true;
          saved = { best: rec.best || null, newBest: beaten, learned: complete };
      }
      else if (anLibraryActive && anLibraryActive.source === src) {
          const id = anLibraryActive.id;
          saved.pending = scoreLibraryStore.libraryRecordPlay(id, todayN(), pct).then(async (r) => {
              await scoreLibrary?.refresh();
              return r ? { best: r.item.best ?? null, newBest: pct != null && pct > (r.previousBest ?? 0), learned: false } : null;
          }).catch(() => { scoreLibrary?.notice('save_failed'); return null; });
      }
      touchDay();
      const tv = host.store.data().toolDay || (host.store.data().toolDay = {});
      tv.piece = todayN();
      saveAll();
      pcRender();
      return saved;
  }
  function pracSavedText(saved: PracticeSaved | null) {
      if (!saved)
          return '';
      const best = saved.best == null ? '' : t(saved.newBest ? 'pc_best_new' : 'rd_best', saved.best);
      return [saved.learned ? '✓ ' + t('pc_learned') : '', best].filter(Boolean).join(' · ');
  }
  function anMistakeEventText(ev: PracticeMistakeEvent): string {
      const label = ev.midi != null ? noteName(ev.midi, false) : '';
      switch (ev.kind) {
          case 'miss': return t('pr_mk_miss', label);
          case 'extra': return t('pr_mk_extra', label);
          case 'timing': return t('pr_mk_timing', label);
          case 'pedal_miss': return t('pr_mk_pedal_miss');
          case 'pedal_early': return t('pr_mk_pedal_early');
          case 'pedal_late': return t('pr_mk_pedal_late');
      }
  }
  function anMistakeGroupText(group: MeasureMistakeGroup, multiPass: boolean): string {
      const head = t('st_bar', group.measureNumber) + (multiPass ? ' (' + t('pr_mk_pass', group.pass) + ')' : '');
      const parts = [...new Set(group.events.map(anMistakeEventText))];
      return `${head} · ${parts.join(', ')}`;
  }
  let scMistakeBarIdx: number | null = null;
  function anHideMistakeBar() {
      scMistakeBarIdx = null;
      const bar = maybeById('sc-mistake-bar');
      if (bar) bar.hidden = true;
  }
  function anScrollMeasureIntoView(measureIndex: number) {
      const g: ScoreGeometry | null = SCORE.geo, box = maybeById('an-roll');
      const gm = g?.measures[measureIndex], sys = gm ? g?.systems[gm.sys] : null, page = sys ? g?.pages[sys.page] : null;
      if (!g || !box || !gm || !sys || !page) return;
      const b = box.getBoundingClientRect(), r = page.getBoundingClientRect();
      if (SCORE.layout === 'cont') {
          const x = r.left + gm.x0 * g.scale;
          box.scrollTo({ left: Math.max(0, box.scrollLeft + (x - b.left) - b.width * 0.15), behavior: 'auto' });
          return;
      }
      const top = r.top + (sys.top - 4) * g.scale;
      box.scrollTo({ top: Math.max(0, box.scrollTop + (top - b.top) - Math.max(12, b.height * 0.12)), behavior: 'auto' });
  }
  function anJumpToMistake(group: MeasureMistakeGroup, multiPass: boolean) {
      pracSumClose();
      if (FALL.mode !== 'score') scoreSetView(SCORE.layout);
      const ms = anMeasures();
      const m = Math.max(0, Math.min(ms.length - 1, group.measureIndex));
      if (!ms.length) return;
      const targetSec = scoreSeconds(ms[m].start);
      SCORE.mrange = { anchor: m, a: m, b: m, sig: '' };
      scoreSeekTo(targetSec);
      scoreMarks();
      anScrollMeasureIntoView(m);
      scMistakeBarIdx = m;
      const bar = maybeById('sc-mistake-bar'), txt = maybeById('sc-mistake-txt');
      if (bar && txt) {
          txt.textContent = anMistakeGroupText(group, multiPass);
          bar.hidden = false;
      }
  }
  function anRepeatPassage(measureIndex: number) {
      pracSumClose();
      const ms = anMeasures();
      if (!ms.length) return;
      const { startIndex, endIndex } = practicePassageBounds(measureIndex, ms.length);
      PRAC.A = scoreSeconds(ms[startIndex].start);
      PRAC.B = scoreSeconds(ms[endIndex].end);
      AN.selected.clear();
      SCORE.mrange = null;
      scoreSeekTo(PRAC.A);
      anRenderPractice();
      anUpdateControls();
      scoreMarks();
      anScrollMeasureIntoView(startIndex);
      anHideMistakeBar();
      maybeById('score-play')?.focus({ preventScroll: true });
  }
  function pracMistakesRender(groups: readonly MeasureMistakeGroup[]) {
      const btn = maybeById('pr-see-mistakes') as HTMLButtonElement | null;
      const panel = maybeById('pr-mistakes-panel'), list = maybeById('pr-mistakes-list');
      if (!btn || !panel || !list) return;
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.hidden = groups.length === 0;
      if (!groups.length) {
          list.innerHTML = '';
          return;
      }
      const multiPass = new Set(groups.map((g) => g.pass)).size > 1;
      list.innerHTML = groups.map((g, idx) => `<li class="pr-mistake-item" data-m-idx="${idx}"><span class="pr-mistake-info">${xmlEsc(anMistakeGroupText(g, multiPass))}</span><span class="pr-mistake-actions"><button type="button" class="btn sm ghost" data-mistake-jump="${idx}">${xmlEsc(t('pr_mk_go'))}</button><button type="button" class="btn sm" data-mistake-repeat="${idx}">${xmlEsc(t('pr_repeat_passage'))}</button></span></li>`).join('');
  }
  let pracSumGen = 0;
  let pracSumReturn: Element | null = null;
  function pracSummary(R: PracticeRun, saved: PracticeSaved | null = null, why = '') {
      const st = PRAC.stats;
      if (!st)
          return;
      const acc = pracAcc(st), gen = ++pracSumGen, bestEl = byId('pr-sum-best'), whyEl = byId('pr-sum-why');
      whyEl.textContent = why ? t(why) : '';
      whyEl.hidden = !why;
      PRAC.next = pracNextStep(R);
      pracNextRender();
      byId('pr-sum-acc').textContent = acc == null ? '–' : practicePercent(acc) + '%';
      const pedal = R.sustain?.midi ? gradePracticeSustain(R.sustain.expected, R.sustain.played, R.segs[0].f) : null;
      const sustainHidden = pedal?.accuracy == null;
      byId('pr-sum-sustain').hidden = sustainHidden;
      maybeById('pr-sum-scores')?.classList.toggle('has-sustain', !sustainHidden);
      if (pedal?.accuracy != null) {
          byId('pr-sum-sustain-acc').textContent = practicePercent(pedal.accuracy) + '%';
          byId('pr-sum-sustain-details').textContent = t('pr_sustain_details', pedal.missed, pedal.extra);
      }
      const sustainMistakes = R.sustain?.midi
          ? extractSustainMistakes(R.sustain.expected, R.sustain.played, R.segs[0].f, (perfT) => {
              const plan = performancePlan();
              const pt = performanceAt(plan, perfT);
              const beat = scoreBeatAt(pt.score);
              const ms = anMeasures();
              const measureIndex = anMeasureIndex(ms, beat);
              const pass = 1 + plan.ranges.slice(1, pt.index + 1).filter((r, i) => r.a < plan.ranges[i].b - 1e-6).length;
              return { measureIndex, measureNumber: String(ms[measureIndex]?.number ?? measureIndex + 1), pass, beat };
          })
          : [];
      const groups = groupPracticeMistakes([...R.mistakes, ...sustainMistakes]);
      PRAC.lastMistakes = groups;
      pracMistakesRender(groups);
      const showSaved = (v: PracticeSaved | null) => { const txt = pracSavedText(v); bestEl.textContent = txt; bestEl.hidden = !txt; bestEl.classList.toggle('is-new', !!v && v.newBest); };
      showSaved(saved);
      if (saved && saved.pending)
          void saved.pending.then((v) => { if (gen === pracSumGen && !byId('pr-sum').hidden)
              showSaved(v); });
      (['perfect', 'good', 'miss', 'wrong'] as const).forEach((k) => { byId('pr-sum-' + k).textContent = String(st[k]); });
      const extra = byId('pr-sum-extra');
      extra.hidden = st.extraMidi === undefined;
      extra.textContent = st.extraMidi === undefined ? '' : t('pr_extra_key', noteName(st.extraMidi, false));
      byId('pr-sum-note').textContent = t('pr_sum_note', st.best, Math.round(pracFactor() * 100) + '%');
      if (byId('pr-sum').hidden)
          pracSumReturn = document.activeElement;
      byId('pr-sum').hidden = false;
      anSideSync();
      byId('pr-again').focus({ preventScroll: true });
  }
  function pracSumClose() {
      const box = byId('pr-sum'), hadFocus = box.contains(document.activeElement);
      box.hidden = true;
      PRAC.next = null;
      anSideSync();
      const target = pracSumReturn;
      pracSumReturn = null;
      if (hadFocus) {
          const fallback = maybeById('score-play');
          const dest = target && target.isConnected && (target instanceof HTMLElement || target instanceof SVGElement) && target.getClientRects().length > 0 && !target.closest('[inert]')
              ? target
              : fallback && fallback.getClientRects().length > 0 && !fallback.closest('[inert]')
                  ? fallback
                  : null;
          dest?.focus({ preventScroll: true });
      }
  }
  function pracReplay() {
      pracSumClose();
      performanceSeek(0);
      void scorePlay(false, 0);
  }
  // Count-in digits, the waiting state and the HUD's fading judgement follow the animation frame.
  function pracFrame() {
      const R = SCORE.run, c = byId('pr-count');
      if (!R || !shell.audioEngine.context) {
          if (!c.hidden)
              c.hidden = true;
          return;
      }
      const now = shell.audioEngine.context.currentTime, ci = R.ci;
      let txt = '';
      if (ci && now < R.segs[0].a0)
          txt = String(Math.min(ci.n, Math.floor((now - ci.t) / ci.sec) + 1));
      if (c.textContent !== txt)
          c.textContent = txt;
      c.hidden = !txt;
      const B = PRAC.bar, waiting = !!B && B.seg === pracSegAt(R, now) && pracRaw(R, now).t >= B.t;
      if (waiting !== !!R.waitShown) {
          R.waitShown = waiting;
          scoreStateText();
      }
      if (PRAC.judge && performance.now() - PRAC.judgeT > 900 && byId('pr-judge').textContent)
          pracHud();
  }
  function pracSet(k: string, v: string|boolean) {
      const wasWaiting = pracWait();
      const beatAt = SCORE.playing && AN.notes.length ? scoreBeatAt(fallTime()) : null;
      const prevTempoSig = SCORE.tempoList.map((e) => `${e.beat}:${e.bpm}`).join('|');
      if (typeof v === 'boolean') {
          if (isPracFlag(k))
              PRAC[k] = v;
      }
      else if (isPracChoice(k))
          PRAC[k] = v;
      pracSave();
      if (k === 'expressive' || k === 'metro' || k === 'metroOnly' || k === 'wait') {
          scoreRefreshTempos();
          EXPR_CACHE.notes = undefined;
      }
      else if (k === 'hands') {
          EXPR_CACHE.notes = undefined;
      }
      const nextTempoSig = SCORE.tempoList.map((e) => `${e.beat}:${e.bpm}`).join('|');
      const temposChanged = prevTempoSig !== nextTempoSig;
      if (k === 'hands') {
          SCORE.heads.forEach((l) => l.forEach(scorePaintEl));
          anKeysPaint();
      }
      if (SCORE.playing && (['hands', 'wait', 'acc', 'hear', 'expressive', 'metroOnly'].includes(k) || (k === 'metro' && (temposChanged || PRAC.expressive)))) {
          const at = beatAt != null ? scoreSeconds(beatAt) : fallTime();
          if (SCORE.loop)
              scoreLoopStart();
          else
              scorePlay(SCORE.sel, at, !temposChanged && wasWaiting === pracWait() && ['acc', 'hear', 'expressive', 'metro', 'metroOnly'].includes(k) ? pracCarry(at) : null); // what sounds keeps the run; hands, Wait for me or tempo changes start a new one
      }
      else if (temposChanged && !SCORE.playing && AN.notes.length) {
          anStatusPos();
          anTlUpdate();
      }
      anUpdateControls();
      if (FALL.mode === 'fall')
          fallDraw();
  }
  function pracSetAB(which: string) {
      if (!AN.notes.length)
          return;
      const t0 = SCORE.playing ? fallTime() : FALL.position, ms = anMeasures(), m = anMeasureAt(scoreBeatAt(t0));
      // snap to the bar line: A to the start of the current bar, B to its end
      const x = which === 'A' ? scoreSeconds(m.start) : scoreSeconds(m.end);
      if (which === 'A') {
          PRAC.A = x;
          if (PRAC.B != null && PRAC.B <= x)
              PRAC.B = null;
      }
      else {
          PRAC.B = x;
          if (PRAC.A != null && PRAC.A >= x)
              PRAC.A = null;
          if (PRAC.A == null)
              PRAC.A = scoreSeconds((ms[0] || { start: 0 }).start);
      }
      anUpdateControls();
      anTlUpdate();
  }
  function pracClearAB() { PRAC.A = PRAC.B = null; if (SCORE.loop && SCORE.loop.ab)
      scoreStop(); anUpdateControls(); anTlUpdate(); }
  async function scorePlay(selection = false, from: number | null = null, carry: PracticeCarry | null = null)  {
      if (!AN.notes.length || AN.loading)
          return;
      const all: PracticeTimedNote[] = fallData(), chosen = selection ? all.filter((d) => AN.selected.has(d.i)) : all;
      if (!chosen.length)
          return;
      const a = selection ? Math.min(...chosen.map((d) => d.start)) : 0, b = selection ? Math.max(...chosen.map((d) => d.finish)) : fallEnd();
      let position = from != null ? from : selection ? a : FALL.position;
      const plan = !selection ? performancePlan() : null;
      const perfDone = !!plan && !carry && plan.duration > 0 && performanceRead().position >= plan.duration - .05;
      const atPerfEnd = perfDone && Math.abs(position - FALL.position) < 1e-6;
      if (atPerfEnd || position >= b - .05 || position < a - 1e-6) {
          position = a;
          if (!selection) performanceSeek(0);
      }
      else if (perfDone) {
          if (position <= a + 1e-6) performanceSeek(0);
          else performanceSeekScore(position, true);
      }
      const notes = chosen.filter((d) => !selection || d.finish > position).sort((x, y) => x.start - y.start || x.n.midi - y.n.midi);
      if (!notes.length) {
          scoreHalt();
          scoreIdle();
          return;
      }
      await pracStart({ notes, a, b, loop: false, sel: selection, from: position, carry });
  }
  function scoreABPassage() {
      const a = PRAC.A, b = PRAC.B;
      if (a == null || b == null || !AN.notes.length || !(a >= 0 && b > a))
          return null;
      // A bar can end after the last sounding note, so include the written rests.
      const end = Math.max(fallEnd(), scoreSeconds(anMeasures().at(-1)?.end ?? 0));
      if (b > end + 1e-6)
          return null;
      const notes = fallData().filter((d) => d.start >= a - 1e-6 && d.start < b - 1e-6);
      return notes.length ? { a, b, notes } : null;
  }
  // Loop the selected notes, else the A–B range (whole bars).
  async function scoreLoopStart()  {
      if (AN.loading)
          return;
      let notes: PracticeTimedNote[] | null = null, a = 0, b = 0, bars = '', ab = false;
      if (AN.selected.size) {
          notes = fallData().filter((d) => AN.selected.has(d.i));
          if (notes.length) {
              a = Math.min(...notes.map((d) => d.start));
              b = Math.max(...notes.map((d) => d.finish));
              bars = anBarsLabel(notes.map((d) => d.n));
          }
      }
      else {
          const passage = scoreABPassage();
          if (passage) {
              ({ notes, a, b } = passage);
              ab = true;
          }
      }
      if (!notes || !notes.length || !(b > a)) {
          if (SCORE.loop) scoreStop();
          return;
      }
      notes.sort((x, y) => x.start - y.start || x.n.midi - y.n.midi);
      await pracStart({ notes, a, b, loop: true, sel: !ab, ab, from: a, bars });
  }
  // Follow playback: move the cursor (keeping it in view), light the sounding keys (and noteheads, if asked) and refresh the status bar.
  function scoreFollow(frameTime = performance.now()) {
      SCORE.followRaf = 0;
      if (!SCORE.playing) {
          scoreUnlight();
          anKeysPaint();
          return;
      }
      const time = scoreVisualTime(frameTime);
      const now = new Set<number>(), sel = SCORE.sel ? AN.selected : null, all: PracticeTimedNote[] = fallData();
      const startIdx = FALL.sorted ? fallStartIndex(all, time - (FALL.maxDur ?? 0) - 0.01) : 0;
      for (let idx = startIdx; idx < all.length; idx++) {
          const d = all[idx];
          if (FALL.sorted && d.start > time) break;
          if (time >= d.start && time < d.finish && (!sel || sel.has(d.i)))
              now.add(d.i);
      }
      let changed = now.size !== SCORE.lit.size;
      if (!changed) {
          for (const i of now) {
              if (!SCORE.lit.has(i)) { changed = true; break; }
          }
      }
      if (changed) {
          const old = SCORE.lit;
          SCORE.lit = now;
          if (FALL.mode === 'score' && SCORE.hl) {
              old.forEach((i) => { if (!now.has(i))
                  scorePaintIdx(i); });
              now.forEach((i) => { if (!old.has(i))
                  scorePaintIdx(i); });
          }
          anKeysPaint();
      }
      if (FALL.mode === 'score')
          scoreCursorUpdate(true, time, frameTime);
      anStatusPos(time);
      pracFrame();
      SCORE.followRaf = requestAnimationFrame(scoreFollow);
  }
  // Zoom acts on the visible view: the engraving size, or the seconds shown in falling notes.
  function anZoomNow() { return FALL.mode === 'fall' ? FALL.zoom : SCORE.zoom; }
  let pinchBaseZoom: number | null = null;
  let pinchTargetZoom: number | null = null;
  let pinchAnchor: { x: number; y: number; normX: number; normY: number } | null = null;
  function clearPinchPreview() {
      pinchBaseZoom = null;
      pinchTargetZoom = null;
      pinchAnchor = null;
      const sheet = maybeById('an-roll')?.querySelector('.an-sheet');
      if (sheet instanceof HTMLElement) {
          sheet.style.transform = '';
          sheet.style.transformOrigin = '';
      }
  }
  function scoreZoomPreview(z: number, anchor?: { x: number; y: number }) {
      const clamped = Math.max(0.5, Math.min(2, z));
      const box = maybeById('an-roll'), sheet = box?.querySelector('.an-sheet');
      if (FALL.mode === 'fall' || !box || !(sheet instanceof HTMLElement)) {
          scoreZoom(clamped);
          return;
      }
      if (pinchBaseZoom === null) pinchBaseZoom = SCORE.zoom;
      const prevRect = sheet.getBoundingClientRect();
      const hasAnchor = !!anchor && prevRect.width > 0 && prevRect.height > 0;
      const normX = hasAnchor ? (anchor.x - prevRect.left) / prevRect.width : 0;
      const normY = hasAnchor ? (anchor.y - prevRect.top) / prevRect.height : 0;
      const scale = clamped / pinchBaseZoom;
      sheet.style.transformOrigin = '0 0';
      sheet.style.transform = Math.abs(scale - 1) < 1e-4 ? '' : 'scale(' + scale + ')';
      if (hasAnchor && anchor) {
          const nextRect = sheet.getBoundingClientRect();
          box.scrollLeft += (nextRect.left + normX * nextRect.width) - anchor.x;
          box.scrollTop += (nextRect.top + normY * nextRect.height) - anchor.y;
          pinchAnchor = { x: anchor.x, y: anchor.y, normX, normY };
      }
      pinchTargetZoom = clamped;
      SCORE.zoom = Math.round(clamped * 10) / 10;
      anUpdateControls();
  }
  function scoreZoomCommit() {
      if (pinchBaseZoom === null) return;
      const baseZoom = pinchBaseZoom;
      const targetZoom = Math.round(Math.max(0.5, Math.min(2, pinchTargetZoom ?? SCORE.zoom)) * 10) / 10;
      const savedAnchor = pinchAnchor;
      clearPinchPreview();
      SCORE.zoom = targetZoom;
      anUpdateControls();
      const box = maybeById('an-roll'), sheet = box?.querySelector('.an-sheet');
      const restoreAnchor = () => {
          if (!savedAnchor || !box || !(sheet instanceof HTMLElement)) return;
          const nextRect = sheet.getBoundingClientRect();
          if (nextRect.width <= 0 || nextRect.height <= 0) return;
          box.scrollLeft += (nextRect.left + savedAnchor.normX * nextRect.width) - savedAnchor.x;
          box.scrollTop += (nextRect.top + savedAnchor.normY * nextRect.height) - savedAnchor.y;
      };
      if (SCORE.engine && targetZoom !== baseZoom) {
          const pending = scoreLayout();
          if (pending instanceof Promise) void pending.then(restoreAnchor);
          else restoreAnchor();
      } else {
          restoreAnchor();
      }
  }
  function scoreZoom(z: number) {
      clearPinchPreview();
      z = Math.round(Math.max(0.5, Math.min(2, z)) * 10) / 10;
      if (FALL.mode === 'fall') {
          if (z === FALL.zoom)
              return;
          FALL.zoom = z;
          fallLookSync();
          anUpdateControls();
          fallDraw();
          return;
      }
      if (z === SCORE.zoom)
          return;
      SCORE.zoom = z;
      anUpdateControls();
      if (SCORE.engine)
          scoreLayout();
  }
  function scoreSetLook(v: string) { SCORE.look = v === 'night' ? 'night' : 'paper'; byId('an-roll').dataset.look = SCORE.look; anUpdateControls(); if (SCORE.engine)
      scoreLayout(); saveAll(); }
  // "Highlight sounding notes": off by default, so the notes stay black while the blue line plays through them.
  function scoreSetHl(on: boolean) { SCORE.hl = !!on; SCORE.heads.forEach((l) => l.forEach(scorePaintEl)); anUpdateControls(); saveAll(); }
  // The display choice is remembered along with the appearance.
  function scoreSetView(v: string|undefined) {
      if (v === 'fall') {
          if (FALL.mode !== 'fall')
              fallMode('fall');
          saveAll();
          return;
      }
      const lay: notationApi.ScoreLayoutMode = v === 'cont' ? 'cont' : v === 'fit' ? 'fit' : 'page';
      if (lay !== SCORE.layout) {
          SCORE.layout = lay;
          byId('an-roll').dataset.layout = lay;
          SCORE.stale = !!SCORE.engine;
          byId('an-roll').scrollTo({ top: 0, left: 0 });
      }
      if (FALL.mode !== 'score')
          fallMode('score');
      else if (SCORE.stale && SCORE.engine)
          scoreLayout();
      if (FALL.position > 0)
          scoreCursorUpdate(true);
      anUpdateControls();
      saveAll();
  }
  /* on-screen keyboard: playback uses the hand colours, a selection the target outline; chord tones get member numbers */
  // Page and Continuous views always have the dock: the full keyboard, or folded into the rail (see dockSync).
  // Falling notes draw their own keyboard, so neither is shown there.
  function anDockWanted() { return AN.notes.length > 0 && FALL.mode !== 'fall'; }
  function anKeysShown() { return view0() === 'analysis' && dockShown(); }
  // The score's height follows the dock (and the page's bottom padding follows it the other way, so the page keeps its length).
  // Keep still what is being read: the score's top edge while the score fills the upper half of the view (it simply grows or
  // shrinks at the bottom), otherwise what follows it.
  function anKeepPlace() {
      const stage = byId('an-stage'), r = stage.getBoundingClientRect(), root = document.documentElement;
      const header = document.querySelector('header') || document.body;
      const headBefore = header.getBoundingClientRect().height;
      const tbBefore = byId('an-tbwrap').getBoundingClientRect().height;
      const below = r.height > 0 && r.bottom < (header.getBoundingClientRect().bottom + innerHeight) / 2; // same split in both states, so a round trip returns to the same place
      const atStageTop = !below && r.top <= headBefore + tbBefore + 4;
      root.style.overflowAnchor = 'none'; // the browser's own scroll anchoring would hold the score and push what follows down
      return () => {
          const now = stage.getBoundingClientRect();
          const headAfter = header.getBoundingClientRect().height;
          if (atStageTop && Math.abs(headAfter - headBefore) > 2) {
              anFocusStage();
          }
          else {
              const d = below ? now.bottom - r.bottom : now.top - r.top;
              if (Math.abs(d) >= .5)
                  window.scrollBy(0, d);
          }
          requestAnimationFrame(() => { root.style.overflowAnchor = ''; });
      };
  }
  // The score viewport is sized in CSS from these: 100dvh − header − toolbar − status bar − dock (when shown). The shell sets
  // --hdr-h, --bnav-h and --dock-h (anLayoutVars there) and calls this for the Score Player's own rows in the same frame.
  function scoreLayoutVars() {
      const st = document.documentElement.style, h = (el: HTMLElement|null) => el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0;
      st.setProperty('--an-tb-h', h(byId('an-tbwrap')) + 'px');
      st.setProperty('--an-sb-h', h(byId('an-status')) + 'px');
      st.setProperty('--an-low', h(SIDE.sheet && anNarrow() ? byId('an-side') : byId('an-status')) + 'px');
      anPinToolbarLater();
  }
  /* Pieces: the full window. The player fills the window while practising: the toolbar button turns it on and off, Esc and
     leaving Pieces turn it off. body[data-stage=pieces] (pieces.css) hides everything around the player, and the size
     observers re-fit the score. The reading drills' stage (STAGE, data-stage=immersive) is separate. */
  const PC_STAGE = { on: false };
  function pcStageSet(on: boolean, quiet = false) {
      const want = on && view0() === 'analysis' && AN.notes.length > 0;
      if (want === PC_STAGE.on)
          return;
      PC_STAGE.on = want;
      const fsTop = maybeById('an-fs-top');
      if (fsTop) fsTop.hidden = !want;
      if (want)
          document.body.dataset.stage = 'pieces';
      else if (document.body.dataset.stage === 'pieces')
          delete document.body.dataset.stage;
      byId('an-tbwrap').classList.remove('is-floating');
      if (want)
          window.scrollTo(0, 0);
      anLayoutVars();
      anUpdateControls();
      if (!want && !quiet)
          anFocusStage();
  }
  // Keep transport reachable while the page is scrolled below the score card's title row (not needed in the full window).
  function anPinToolbar() {
      AN.pinRaf = 0;
      const tb = byId('an-tbwrap');
      const active = view0() === 'analysis' && AN.notes.length && !tb.hidden && !PC_STAGE.on;
      if (!active) {
          tb.classList.remove('is-floating');
          return;
      }
      const header = document.querySelector('header') || document.body, headBottom = Math.max(0, header.getBoundingClientRect().bottom);
      const source = byId('an-src').getBoundingClientRect(), section = byId('view-analysis').getBoundingClientRect();
      const pin = source.bottom <= headBottom + 1 && section.bottom > headBottom + tb.offsetHeight + 12;
      if (pin) {
          const r = byId('an-panel').getBoundingClientRect();
          tb.style.setProperty('--an-pin-x', Math.round(r.left) + 'px');
          tb.style.setProperty('--an-pin-w', Math.round(r.width) + 'px');
      }
      tb.classList.toggle('is-floating', pin);
  }
  function anPinToolbarLater() { if (!AN.pinRaf)
      AN.pinRaf = requestAnimationFrame(anPinToolbar); }
  // After opening a score, line the viewport up under the toolbar so it sits fully between the header and the dock.
  function anFocusStage(smooth = false) {
      if (view0() !== 'analysis' || !AN.notes.length)
          return;
      byId('an-tbwrap').classList.remove('is-floating');
      anLayoutVars();
      const header = document.querySelector('header') || document.body;
      const y = byId('an-stage').getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height - byId('an-tbwrap').getBoundingClientRect().height;
      if (Math.abs(window.scrollY - y) > 1) {
          window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
      }
      if (!smooth)
          anPinToolbar();
  }
  /* status bar: the position text is not a live region (no announcements while playing); selection changes are announced once, debounced */
  function anTempoAt(beat: number) { let bpm = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
      if (e.beat <= beat + 1e-6)
          bpm = e.bpm;
      else
          break;
  } return bpm; }
  function anTempoWidgetSync(beat?: number) {
      const sel = selectById('score-speed');
      const has = AN.notes.length > 0;
      const pct = +(sel.value || 100);
      const b = beat != null ? beat : (has ? scoreBeatAt(fallTime()) : 0);
      const baseBpm = has ? anTempoAt(b) : 120;
      const effBpm = Math.max(1, Math.round(baseBpm * pct / 100));
      const reset = maybeById('sc-speed-reset') as HTMLButtonElement | null;
      if (reset) {
          reset.textContent = `${effBpm} BPM · ${pct}%`;
          reset.disabled = !has || pct === 100;
      }
      const opts = [...sel.options].map((o) => +o.value);
      const idx = opts.indexOf(pct);
      const down = maybeById('sc-speed-down') as HTMLButtonElement | null;
      const up = maybeById('sc-speed-up') as HTMLButtonElement | null;
      if (down) down.disabled = !has || idx <= 0;
      if (up) up.disabled = !has || idx < 0 || idx >= opts.length - 1;
  }
  function anSyncPracticeLine() {
      const line = maybeById('an-prac-line');
      const wait = pracWait();
      queryAllHtml(document, '#an-study-mode button[data-study]').forEach((b) => {
          b.setAttribute('aria-pressed', (b.dataset.study === (wait ? 'practice' : 'listen')) ? 'true' : 'false');
      });
      if (!line) return;
      if (!AN.notes.length || !wait) {
          line.hidden = true;
          return;
      }
      const handsKey = PRAC.hands === 'rh' ? 'pr_rh_t' : PRAC.hands === 'lh' ? 'pr_lh_t' : 'pr_both_t';
      const midiKey = midiLive() ? 'an_midi_on' : 'an_midi_off';
      line.textContent = [t(handsKey), t('pr_wait'), t(midiKey)].join(' · ');
      line.hidden = false;
  }
  function anStatusPos(time?: number | null) {
      if (!AN.notes.length)
          return;
      const t0 = time != null ? time : fallTime(), beat = scoreBeatAt(t0), m = anMeasureAt(beat) || { number: '1', start: 0, num: 4, den: 4 }, u = scoreFeature.harmony.anBeatUnit(m);
      const beats = Math.max(1, Math.round(m.num * 4 / m.den / u)), bt = Math.min(beats, Math.max(1, Math.floor((beat - m.start) / u + 1e-6) + 1));
      const set = (id: string, v: string) => { const el = byId(id); if (el.textContent !== v)
          el.textContent = v; };
      set('st-bar', t('st_bar', m.number));
      set('st-beat', t('st_beat', bt));
      const clock = performanceDisplay();
      set('st-time', anClock(clock.elapsed) + ' / ' + anClock(clock.total));
      set('st-tempo', '♩ = ' + Math.round(anTempoAt(beat)));
      anTempoWidgetSync(beat);
      const fsBar = maybeById('an-fs-bar');
      if (fsBar) fsBar.textContent = t('st_bar', m.number);
      set('st-key', anKeyName(anKeyAt(beat)));
      set('st-meter', m.num + '/' + m.den);
      anRenderNow();
      anSyncTimeline(t0, SCORE.playing);
      anTlUpdate(t0);
  }
  function anStatusSel() {
      const el = byId('st-sel'), n = AN.selected.size, R = SCORE.mrange, ms = anMeasures(), num = (i: number) => (ms[i] || { number: String(i + 1) }).number;
      const txt = R ? t('st_msel', R.a === R.b ? t('an_bar1', num(R.a)) : t('an_bars', num(R.a), num(R.b)), n) : n ? (n === 1 ? t('st_sel1') : t('st_sel', n)) : '';
      if (el.textContent === txt)
          return;
      el.textContent = txt;
      clearTimeout(AN.liveT);
      AN.liveT = setTimeout(() => { byId('st-live').textContent = txt; }, 500);
  }
  function anActiveChord(sel: { midi: number }[]) {
      if (AN.active && AN.active.kind === 'chord' && AN.view) {
          const seg = AN.view.segs[AN.active.k];
          if (seg)
              return { root: seg.ch.root, pcs: seg.ch.c.p };
      }
      const midis = [...new Set(sel.map((n) => n.midi))];
      if (midis.length < 3)
          return null;
      const id = identifyChord(midis);
      return id ? { root: id.rootPc, pcs: id.chord.pcset } : null;
  }
  function anSegAt(beat: number) {
      const all = AN.notes.length ? anCompute(AN.notes, 'all').segs : [];
      let lo = 0, hi = all.length - 1;
      while (lo <= hi) {
          const mid = (lo + hi) >> 1, s = all[mid];
          if (beat < s.start - 1e-6)
              hi = mid - 1;
          else if (beat >= s.end - 1e-6)
              lo = mid + 1;
          else
              return s;
      }
      return null;
  }
  function anKeysPaint(force?: boolean) {
      if (force)
          AN.kbApplied = new Map();
      if (!anKeysShown()) {
          if (AN.kbApplied.size)
              anKeysClear();
          return;
      }
      const want = new Map<number, string>();
      let deg: Map<number, string> | null = null;
      if (SCORE.playing) {
          const lit = [...SCORE.lit].map((i) => AN.notes[i]).filter(Boolean);
          lit.forEach((n) => want.set(foldToView(n.midi), scoreFeature.harmony.anHandOf(n)));
          const seg = lit.length && anSegAt(scoreBeatAt(fallTime()));
          if (seg)
              deg = chordDegreeMap(lit.map((n) => n.midi), seg.ch.root, seg.ch.c.p);
      }
      else if (AN.selected.size) {
          const sel = [...AN.selected].map((i) => AN.notes[i]).filter(Boolean);
          sel.forEach((n) => want.set(foldToView(n.midi), 'target'));
          const ch = anActiveChord(sel);
          if (ch)
              deg = chordDegreeMap(sel.map((n) => n.midi), ch.root, ch.pcs);
      }
      AN.kbApplied.forEach((s, m) => { if (want.get(m) !== s) {
          const el = shell.keyEl.get(m);
          if (el && el.dataset.s === s)
              kbState(m, null, false);
      } });
      want.forEach((s, m) => { const el = shell.keyEl.get(m); if (el && el.dataset.s !== s)
          kbState(m, s, false); });
      AN.kbApplied = want;
      kbDegrees(deg);
  }
  function anKeysClear() { AN.kbApplied.forEach((s, m) => { const el = shell.keyEl.get(m); if (el && el.dataset.s === s)
      kbState(m, null, false); }); AN.kbApplied = new Map(); kbDegrees(null); }
  // Centre the dock on the music the first time its keys are shown for a score, so lit keys are rarely folded.
  function anKeysCenter() {
      AN.kbCenter = false;
      if (!AN.notes.length)
          return;
      const ms = AN.notes.map((n) => n.midi).sort((a, b) => a - b), med = ms[ms.length >> 1];
      const low = Math.max(shell.baseLow, Math.min(shell.baseHigh - shell.keyboardView.oct * 12, Math.round((med - shell.keyboardView.oct * 6) / 12) * 12));
      if (low !== shell.keyboardView.low) {
          shell.keyboardView.low = low;
          buildKeyboard();
          repaintHeld();
      }
  }
  /* analysis workspace */
  function anOriginText() { const o = AN.keyOrigin; return t(o === 'file' ? (AN.source && AN.source.kind === 'example' ? 'an_origin_piece' : 'an_origin_file') : o === 'manual' ? 'an_origin_manual' : o === 'mode' ? 'an_origin_mode' : 'an_origin_auto'); }
  function anBarsLabel(ns: { start: number }[], L?: string) {
      const a = anMeasureAt(Math.min(...ns.map((n) => n.start))).number, b = anMeasureAt(Math.max(...ns.map((n) => n.start))).number;
      return a === b ? tl(L || host.i18n.lang(), 'an_bar1', a) : tl(L || host.i18n.lang(), 'an_bars', a, b);
  }
  function anChordLabel(seg: AnSpanChordFacts, key: theory.KeySignature) { const ch = seg.ch; return spellName(60 + ch.root, key) + ch.c.s + (seg.bass !== ch.root ? '/' + spellName(60 + (seg.bass ?? 0), key) : ''); }
  function anBeatText(seg: AnSpanBeatFacts) {
      const m = seg.measure, u = seg.unit, b1 = 1 + (seg.start - m.start) / u, b2 = (seg.end - m.start) / u, f = (x: number) => anNum(x, 1);
      return b2 - b1 < 1e-6 ? t('an_beat', f(b1)) : t('an_beats', f(b1) + '–' + f(b2));
  }
  function anDetText(ch: { det: string; }) { return t('an_det_' + ch.det); }
  // What each hand plays in a chord span, low to high, each pitch class once: "RH E G C · LH C G".
  function anHandsText(seg: { notes: AnSpanNoteFacts[] }, key: theory.KeySignature) {
      const by: { rh: number[]; lh: number[] } = { rh: [], lh: [] };
      seg.notes.slice().sort((a, b) => a.midi - b.midi).forEach((n) => { const hand: string = scoreFeature.harmony.anHandOf(n), h = hand === 'rh' || hand === 'lh' ? by[hand] : null, p = pc(n.midi); if (!h)
          return; if (!h.some((m) => pc(m) === p))
          h.push(n.midi); });
      return (['rh', 'lh'] as const).filter((h) => by[h].length).map((h) => t('an_' + h) + ' ' + by[h].slice(0, 6).map((m) => spellName(m, key)).join(' ') + (by[h].length > 6 ? ' …' : '')).join(' · ');
  }
  // Where the hands come from: the two staves, MIDI tracks, the piece's own parts, or the register.
  function anHandsSource() {
      const h = AN.hands, at = (m: number) => spellName(m, null, true);
      if (!h)
          return AN.notes.some((n) => n.hand) ? t('an_hsrc_staves') : t('an_hsrc_est', at(60));
      return h.how === 'tracks' ? t('an_hsrc_tracks') : h.how === 'piece' ? t('an_hsrc_piece') : t(h.how === 'split' ? 'an_hsrc_split' : 'an_hsrc_est', at(h.split));
  }
  function anNctText(seg: { nct?: AnSpanNctFacts[] } | null, key: theory.KeySignature) {
      if (!seg || !seg.nct || !seg.nct.length)
          return '';
      return ['suspension', 'appoggiatura', 'anticipation', 'passing', 'neighbor', 'other'].map((type) => {
          const names = [...new Set((seg.nct || []).filter((x) => x.type === type).map((x) => spellName(x.note.midi, key, true)))];
          return names.length ? t('an_nct_' + type) + ': ' + names.join(', ') : '';
      }).filter(Boolean).join(' · ');
  }
  function anInView(el: Element, box: Element) { const r = el.getBoundingClientRect(), p = box.getBoundingClientRect(); return r.bottom > p.top + 4 && r.top < p.bottom - 4; }
  // The sounding chord is marked in both tabs. The Piece tab scrolls along only while its reader is following: the previous
  // chord was on screen and the list has not been scrolled by hand for a few seconds.
  function anSyncTimeline(time: number|null, follow: boolean) {
      const side = byId('an-side'), v = AN.view;
      if (!side || side.hidden || !v)
          return;
      const idx = anSegIndexAt(v.segs, scoreBeatAt(time != null ? time : fallTime())), sig = AN.wsSig + '|' + SIDE.nowSig + '|' + idx;
      if (AN.playSig === sig)
          return;
      AN.playSig = sig;
      AN.playSeg = idx;
      const ws = byId('an-ws'), prev = ws.querySelector('.an-ch.is-current'), seen = !!prev && !ws.hidden && anInView(prev, ws);
      side.querySelectorAll('.an-ch.is-current').forEach((el) => { el.classList.remove('is-current'); el.removeAttribute('aria-current'); });
      side.querySelectorAll('.an-prog-row.is-current').forEach((el) => el.classList.remove('is-current'));
      if (idx < 0)
          return;
      side.querySelectorAll((SCORE.playing ? '' : '#an-ws ') + '.an-ch[data-k="' + idx + '"]').forEach((el) => { el.classList.add('is-current'); el.setAttribute('aria-current', 'true'); const row = el.closest('.an-prog-row'); if (row)
          row.classList.add('is-current'); });
      const cur = ws.querySelector('.an-ch[data-k="' + idx + '"]');
      if (follow && SCORE.playing && cur && seen && !anInView(cur, ws) && performance.now() - SIDE.handScroll > 3000) {
          const r = cur.getBoundingClientRect(), p = ws.getBoundingClientRect();
          ws.scrollTo({ top: ws.scrollTop + (r.top - p.top) - p.height * .35, behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
  }
  function anUpdateControls() {
      const has = AN.notes.length > 0, sel = AN.selected.size > 0, busy = AN.loading, fall = FALL.mode === 'fall', sheet = has && !fall, playing = SCORE.playing;
      byId('an-tbwrap').hidden = !has;
      byId('an-status').hidden = !has;
      byId('an-stage').dataset.mode = fall && has ? 'fall' : 'score';
      byId('an-roll').hidden = fall && has;
      byId('fall-wrap').hidden = !fall || !has;
      const pb = buttonById('score-play'), pk = playing ? 'sc_pause_k' : 'sc_play_k';
      pb.disabled = !has || busy;
      pb.dataset.state = playing ? 'pause' : 'play';
      pb.setAttribute('aria-label', t(pk));
      pb.title = t(pk);
      [['sc-start', 'sc_start_k'], ['score-stop', 'sc_stop_k'], ['an-play', 'an_play'], ['an-loop', 'an_loop_k'], ['an-clear', 'an_clear_k'], ['an-recon-btn', 'an_recon_k']].forEach(([id, k]) => { const b = byId(id); b.setAttribute('aria-label', t(k)); b.title = t(k); });
      buttonById('sc-start').disabled = !has;
      buttonById('score-stop').disabled = !has;
      selectById('score-speed').disabled = !has;
      const canLoopAB = !busy && !sel && !!scoreABPassage();
      buttonById('an-play').disabled = !sel || busy;
      buttonById('an-loop').disabled = busy || (!sel && !SCORE.loop && !canLoopAB);
      buttonById('an-clear').disabled = !sel && !SCORE.mrange;
      byId('an-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
      byId('an-roll').dataset.tool = AN.tool;
      for (const tool of ['hand', 'select'] as const) {
          const button = buttonById('an-tool-' + tool);
          button.disabled = !sheet;
          button.setAttribute('aria-pressed', String(AN.tool === tool));
      }
      const selModeBtn = buttonById('an-sel-mode');
      selModeBtn.disabled = !sheet;
      selModeBtn.setAttribute('aria-pressed', AN.selMode === 'lasso' ? 'true' : 'false');
      const selModeTitle = t(AN.selMode === 'lasso' ? 'an_sel_lasso' : 'an_sel_box');
      selModeBtn.setAttribute('aria-label', selModeTitle);
      selModeBtn.title = selModeTitle;
      queryAllHtml(document, '#an-mode button').forEach((b) => { const v = b.dataset.scoreMode; if ('disabled' in b)
          b.disabled = !has; b.setAttribute('aria-pressed', (v === 'fall' ? fall : !fall && SCORE.layout === v) ? 'true' : 'false'); });
      const z = anZoomNow(), zs = Math.round(z * 100) + '%';
      buttonById('sc-zoom-out').disabled = !has || z <= 0.5 + 1e-6;
      buttonById('sc-zoom-in').disabled = !has || z >= 2 - 1e-6;
      buttonById('sc-zoom-reset').disabled = !has;
      byId('sc-zoom-reset').textContent = zs;
      byId('sc-zoom-reset').setAttribute('aria-label', t('sc_zoom_reset', zs));
      byId('sc-zoom-reset').title = t(fall ? 'fall_zoom_t' : 'sc_zoom_reset', zs);
      queryAllHtml(document, '#sc-look button').forEach((b) => { if ('disabled' in b)
          b.disabled = !sheet; b.setAttribute('aria-pressed', b.dataset.v === SCORE.look ? 'true' : 'false'); });
      const hl = buttonById('sc-hl');
      hl.disabled = !sheet;
      hl.setAttribute('aria-pressed', SCORE.hl ? 'true' : 'false');
      hl.setAttribute('aria-label', t('sc_hl'));
      hl.title = t('sc_hl_t');
      const nn = buttonById('sc-names');
      nn.disabled = !sheet;
      nn.setAttribute('aria-pressed', PRAC.names ? 'true' : 'false');
      nn.setAttribute('aria-label', t('pc_names'));
      nn.title = t('pc_names_t');
      if (!has) {
          if (shell.scoreFocus.owner === 'analysis') scoreFocusExit(true); else pcStageSet(false);
      }
      const stg = buttonById('sc-stage');
      stg.disabled = !has;
      buttonById('sc-fit').disabled = !has;
      stg.setAttribute('aria-pressed', PC_STAGE.on ? 'true' : 'false');
      stg.setAttribute('aria-label', t(PC_STAGE.on ? 'pc_stage_exit' : 'pc_stage'));
      stg.title = t(PC_STAGE.on ? 'pc_stage_exit' : 'pc_stage_t');
      const stageLabel = stg.querySelector('span');
      if (stageLabel) stageLabel.textContent = t(PC_STAGE.on ? 'pc_stage_exit' : 'pc_stage');
      const fsTitle = maybeById('an-fs-title');
      if (fsTitle) fsTitle.textContent = byId('an-name').textContent || '';
      const fsExit = maybeById('an-fs-exit');
      if (fsExit) { fsExit.textContent = t('pc_stage_exit'); fsExit.setAttribute('aria-label', t('pc_stage_exit')); }
      // The toolbar toggle is named Keyboard and reports expanded or collapsed; the dock's own button names the action it takes.
      const open = sheet && dockOpen(), kb = buttonById('an-kb');
      kb.disabled = !sheet;
      kb.setAttribute('aria-expanded', open ? 'true' : 'false');
      kb.title = fall && has ? t('an_kb_fall') : t(open ? 'kb_hide' : 'kb_show');
      const ron = !!AN.source && AN.source.kind !== 'xml';
      byId('an-recon-btn').hidden = !ron;
      if (!ron)
          anReconOpen(false);
      byId('score-credit').hidden = anScreen !== 'player' || !has || fall;
      byId('st-hint').textContent = t(fall ? 'fall_hint' : 'an_hint');
      // toolbar per view: sheet-only controls (zoom, paper/night, docked keyboard) give way to falling-notes display options
      byId('an-disp-sheet').hidden = fall && has;
      byId('fall-pop').hidden = !(fall && has);
      if (fall && has)
          byId('an-kb').setAttribute('aria-expanded', 'false');
      byId('an-tl').hidden = !has;
      byId('an-loop').title = byId('an-loop').getAttribute('aria-label') + (canLoopAB ? ' · A–B' : '');
      byId('an-metro').setAttribute('aria-pressed', String(pracMetro()));
      byId('an-metro').title = t('an_metro_t');
      byId('an-metro').setAttribute('aria-label', t('an_metro_t'));
      queryAllHtml(document, '#pr-hands button,#pt-hands button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.h === PRAC.hands ? 'true' : 'false'));
      byId('pr-wait').setAttribute('aria-pressed', String(pracWait()));
      byId('pr-wait').title = t('pr_wait_t');
      inputById('pt-wait').checked = pracWait();
      inputById('pt-metro').checked = pracMetro();
      inputById('pr-metro-only').checked = PRAC.metroOnly;
      for (const id of ['pt-wait', 'pt-metro', 'pr-acc', 'pr-hear'])
          inputById(id).disabled = PRAC.metroOnly;
      for (const id of ['pr-wait', 'an-metro'])
          buttonById(id).disabled = !has || PRAC.metroOnly;
      inputById('pr-countin').checked = PRAC.countIn;
      inputById('pr-expressive').checked = PRAC.expressive;
      selectById('pt-speed').value = selectById('score-speed').value;
      selectById('pt-speed').disabled = !has;
      anTempoWidgetSync();
      anSyncPracticeLine();
      byId('pr-opt').title = t('pr_opt_t');
      byId('pr-opt').setAttribute('aria-label', t('pr_opt_t'));
      buttonById('pr-clrab').disabled = PRAC.A == null && PRAC.B == null;
      byId('fall-finger-note').textContent = t(has && !anHasFinger() ? 'fall_finger_none' : 'fall_finger_note');
      dockSync();
      anSideSync();
      scoreNamesSync();
      scoreMarks();
      byId('an-now-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
      byId('pt-start').textContent = t(playing ? 'pt_stop' : 'pt_start');
      buttonById('pt-start').disabled = !has || busy;
      (document).querySelectorAll('#an-roll [data-an-open],#pc-list .pc-item').forEach((b) => { if ('disabled' in b)
          b.disabled = busy; });
      if (has) {
          anStatusSel();
          anRenderPractice();
      }
  }
  function anReconOpen(open: boolean) { const b = byId('an-recon-btn'), p = byId('an-recon'), on = !!open && !b.hidden; p.hidden = !on; b.setAttribute('aria-expanded', on ? 'true' : 'false'); }
  function anAnalyze() {
      anUpdateControls();
      if (!AN.notes.length) {
          byId('an-ws').innerHTML = '';
          AN.view = null;
          AN.wsSig = '';
          anRenderNow();
          anRenderSelection();
          anKeysPaint();
          return;
      }
      const sig = [AN.version, host.i18n.lang(), host.i18n.notation()].join('|');
      if (sig !== AN.wsSig) {
          AN.wsSig = sig;
          AN.view = anCompute(AN.notes, 'all');
          anRenderWorkspace(AN.view);
      }
      anRenderNow();
      anRenderSelection();
      anMarkActive();
      anKeysPaint();
      if (!SCORE.playing)
          anStatusPos();
  }
  // The harmony panel starts closed; the toolbar button or a saved choice (anSide.open) opens it.
  const SIDE: AnPanelSide = createPanelSide();
  const AN_TABS: readonly string[] = SCORE_SIDE_TABS;
  function anNarrow() { return (window).matchMedia('(max-width: 999px)').matches; }
  function anSideVisible(tab?: string) { const side = byId('an-side'); return !!side && !side.hidden && (anNarrow() ? SIDE.sheet : SIDE.open) && (!tab || SIDE.tab === tab); }
  function anSideSync() {
      const side = byId('an-side'), work = byId('an-work'), btn = byId('an-side-btn'), fab = byId('an-fab'), has = AN.notes.length > 0, narrow = anNarrow(), open = has && (narrow ? SIDE.sheet : SIDE.open);
      side.hidden = !has || (!narrow && !SIDE.open);
      side.classList.toggle('is-open', narrow && open);
      work.classList.toggle('has-sheet', narrow && open);
      work.classList.toggle('no-side', !has || narrow || !SIDE.open);
      work.style.setProperty('--an-side-w', SIDE.w + 'px');
      byId('an-side-resize').setAttribute('aria-valuenow', String(SIDE.w));
      btn.hidden = !has;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.title = t(open ? 'an_side_hide' : 'an_side_show');
      fab.hidden = anScreen !== 'player' || !has || !narrow || SIDE.sheet || !byId('pr-sum').hidden;
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      pcFabLater();
      const pt = byId('pr-opt');
      pt.setAttribute('aria-expanded', open && SIDE.tab === 'practice' ? 'true' : 'false');
  }
  // On phones the floating Analysis button would cover the built-in pieces or My Library while their list is open on
  // screen, so it steps aside (pc-fab-off) until the list scrolls away or closes.
  let pcFabRaf = 0;
  function pcFabLater() { if (!pcFabRaf)
      pcFabRaf = requestAnimationFrame(pcFabSync); }
  function pcFabSync() {
      pcFabRaf = 0;
      const fab = byId('an-fab');
      fab.classList.remove('pc-fab-off');
      if (fab.hidden || view0() !== 'analysis')
          return;
      const f = fab.getBoundingClientRect();
      if (!f.height)
          return;
      const over = ['pc-pick', 'score-library'].some((id) => { const el = maybeById(id); if (!(el instanceof HTMLDetailsElement) || !el.open)
          return false; const r = el.getBoundingClientRect(); return r.bottom > f.top && r.top < f.bottom && r.right > f.left && r.left < f.right; });
      fab.classList.toggle('pc-fab-off', over);
  }
  function anSideSet(open: boolean) { SIDE.open = !!open; saveAll(); anSideSync(); }
  // The sheet is not modal: the score above it stays live. Opening moves focus to the active tab; closing returns it to the button.
  // While it is open the score viewport ends where the sheet begins, so everything in the score can still be scrolled to.
  function anSheet(open: boolean, quiet?: boolean) {
      const want = !!open && AN.notes.length > 0;
      if (want === SIDE.sheet)
          return;
      SIDE.sheet = want;
      anSideSync();
      anLayoutVars();
      if (quiet)
          return;
      if (want)
          anFocusStage();
      if (want) {
          const tab = queryHtml(document, '#an-tabs [aria-selected="true"]');
          if (tab)
              tab.focus({ preventScroll: true });
      }
      else if (byId('an-side').contains(document.activeElement) && !byId('an-fab').hidden)
          byId('an-fab').focus({ preventScroll: true });
  }
  function anTab(tab: string, focus?: boolean) {
      SIDE.tab = AN_TABS.includes(tab) ? tab : 'now';
      queryAllHtml(document, '#an-tabs [role="tab"]').forEach((b) => { const on = b.dataset.tab === SIDE.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus)
          b.focus({ preventScroll: true }); });
      byId('an-now').hidden = SIDE.tab !== 'now';
      byId('an-ws').hidden = SIDE.tab !== 'piece';
      byId('an-pt').hidden = SIDE.tab !== 'practice';
      byId('pr-opt').setAttribute('aria-expanded', anSideVisible('practice') ? 'true' : 'false');
      if (SIDE.tab === 'piece')
          anRevealPieceRow(false);
      saveAll();
  }
  // Toolbar shortcuts into the panel (Practice options): show the tab, open the panel or sheet if needed, focus its first control.
  function anOpenTab(tab: string) {
      AN_POPS.forEach(([p] = []) => anPop(p, false));
      anReconOpen(false);
      anTab(tab);
      if (anNarrow())
          anSheet(true);
      else if (!SIDE.open)
          anSideSet(true);
      anSideSync();
      const panel = byId(tab === 'practice' ? 'an-pt' : tab === 'piece' ? 'an-ws' : 'an-now'), first = queryHtml(panel, 'button:not([disabled]):not([hidden]),input,select');
      (first || panel).focus({ preventScroll: true });
  }
  function anFocus(follow = true): AnPanelFocus | null {
      const ms = anMeasures();
      if (!AN.notes.length || !ms.length)
          return null;
      const at = (beat: number) => { let i = 0; for (let j = 0; j < ms.length; j++) {
          if (ms[j].start <= beat + 1e-6)
              i = j;
          else
              break;
      } return i; };
      const span = (a: number, b: number, kind: AnPanelFocus['kind']): AnPanelFocus => ({ kind, a, b, lo: ms[a].start, hi: ms[b].end });
      if (follow && SCORE.playing) {
          const i = at(scoreBeatAt(fallTime()));
          return span(i, i, 'play');
      }
      const R = SCORE.mrange, g = SCORE.geo, gm = R && g ? g.measures[R.a] : undefined;
      if (R && g && gm)
          return span(at(gm.b0 + 1e-4), at((g.measures[R.b] || gm).b1 - 1e-4), 'bars');
      const sel = [...AN.selected].map((i) => AN.notes[i]).filter(Boolean);
      if (sel.length) {
          const s = sel.map((n) => n.start);
          return span(at(Math.min(...s)), at(Math.max(...s)), 'sel');
      }
      const i = at(scoreBeatAt(FALL.position));
      return span(i, i, 'cursor');
  }
  function anFocusNotes(f: AnPanelFocus | null) {
      if (!f)
          return [];
      if (f.kind === 'sel')
          return [...AN.selected].sort((a, b) => a - b).map((i) => AN.notes[i]).filter(Boolean);
      const grid = SCORE.midiGrid || 0, q = (n: { start: number }) => grid ? Math.round(n.start * grid) / grid : n.start;
      return AN.notes.filter((n) => { const s = q(n); return s >= f.lo - 1e-6 && s < f.hi - 1e-6; });
  }
  // Listen, Loop and Practice play exactly what the coral band shows: whole bars (or the selected notes), which become the selection.
  function anCommitFocus() {
      const f = anFocus();
      if (!f)
          return false;
      if (f.kind === 'sel')
          return AN.selected.size > 0;
      const g = SCORE.geo;
      if (!g)
          return false;
      const gi = (beat: number) => g.measures.findIndex((m) => m && beat >= m.b0 - 1e-6 && beat < m.b1 - 1e-6), a = gi(f.lo), b = gi(f.hi - 1e-4);
      if (a < 0 || b < 0)
          return false;
      const R = SCORE.mrange;
      if (!(R && R.a === a && R.b === b && !AN.active))
          scoreSelectRange(a, b);
      return AN.selected.size > 0;
  }
  // Harmonic function from the scale degree (Riemann-style T / S / D, Neapolitan, modal mixture, or secondary dominant).
  function anFunctionOf(key: theory.KeySignature, seg: { ch: { root: number; }; }, rn: string) {
      const fk = anFnKey(key, seg.ch.root, rn);
      if (fk === 'sec')
          return t('an_fn_sec', rn.slice(rn.indexOf('/') + 1));
      return t('an_fn_' + fk);
  }
  function anLearnLinkHTML(lessonId: string, label: string, extraClass = '', titleText = t('an_learn_tip')) {
      return `<button type="button" class="an-learn-link${extraClass ? ' ' + extraClass : ''}" data-learn="${xmlEsc(lessonId)}" title="${xmlEsc(titleText)}">${xmlEsc(label)}</button>`;
  }
  function anCardLearnLinksHTML(key: theory.KeySignature, seg: { ch: { root: number; }; }, rn: string, hasNct: boolean) {
      const links: string[] = [];
      const fk = anFnKey(key, seg.ch.root, rn);
      if (fk === 'sec')
          links.push(anLearnLinkHTML('secdom', rn));
      else if (fk === 'neap' || fk === 'mix')
          links.push(anLearnLinkHTML('minorh', t('an_fn_' + fk)));
      if (hasNct)
          links.push(anLearnLinkHTML('nct', t('an_nct_label')));
      return links.length ? `<div class="an-learn-links">${links.join('')}</div>` : '';
  }
  // One chord of the progression: symbol, Roman numeral, beats and how sure the reading is; the full reading, with what each hand
  // plays, is its accessible name.
  function anChipHTML(s: AnHarmonySeg, i: number, rove: boolean|null) {
      const esc = xmlEsc, key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = scoreFeature.harmony.anRoman(key, s), beats = anBeatText(s), conf = s.ch.conf;
      const alts = s.ch.alts.map((a) => spellName(60 + a.root, key) + a.c.s).join(', '), cad = s.cad ? t('an_cad_' + s.cad) : '', det = anDetText(s.ch), nct = anNctText(s, key);
      const label = [t('an_bar') + ' ' + s.measure.number, beats, lab, rn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), anHandsText(s, key), nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
      const time = anClock(scoreSeconds(s.start)) + '–' + anClock(scoreSeconds(s.end));
      const cadBtn = cad ? anLearnLinkHTML('cad', cad, 'an-cad', t('an_cad_title') + ' · ' + t('an_learn_tip')) : '';
      return `<button type="button" class="an-ch" data-k="${i}" data-conf="${conf}"${rove == null ? '' : ` tabindex="${rove ? 0 : -1}"`} aria-pressed="false" aria-label="${esc(label)}" title="${esc(label + ' · ' + time)}"><span class="an-ch-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-ch-rn">${esc(rn)}</span><span class="an-ch-t">${esc(beats + ' · ' + det)}</span>${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>${cadBtn}`;
  }
  // Chords grouped by bar; each row carries its bar index so the selected bars can be marked.
  function anRowsHTML(list: AnPanelSpanRow[], rove?: number|null) {
      const ms = anMeasures();
      let html = '', bar: ScoreMeasure | null = null;
      list.forEach(({ s, k }) => {
          if (s.measure !== bar) {
              if (bar)
                  html += '</div></div>';
              bar = s.measure;
              html += `<div class="an-prog-row" data-bar="${ms.indexOf(s.measure)}"><span class="an-prog-n" aria-hidden="true">${xmlEsc(s.measure.number)}</span><div class="an-prog-chords">`;
          }
          html += anChipHTML(s, k, rove == null ? null : k === rove);
      });
      return bar ? html + '</div></div>' : '';
  }
  // A chord of the bar in focus, in full: symbol and numeral, function, inversion and bass, beats, how sure the reading is, what
  // each hand plays, non-chord tones.
  function anNowCard({ s, k }: AnPanelSpanRow, implied: boolean) {
      const esc = xmlEsc, key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = scoreFeature.harmony.anRoman(key, s), conf = s.ch.conf, open = s.ch.c.q === 'S' || s.ch.c.q === 'P';
      const inv = implied ? 0 : scoreFeature.harmony.anInv(s), slash = !implied && s.bass !== s.ch.root;
      const fn = [anFunctionOf(key, s, rn), implied ? t('an_implied') : open || slash && !inv ? '' : invName(inv), slash ? t('an_bass', spellName(60 + (s.bass ?? 0), key)) : ''].filter(Boolean).join(' · ');
      const alts = s.ch.alts.map((a) => spellName(60 + a.root, key) + a.c.s).join(', '), det = anDetText(s.ch), hands = anHandsText(s, key);
      const meta = anBeatText(s) + ' · ' + det + (alts ? ' (' + t('an_or', alts) + ')' : ''), nct = anNctText(s, key), cad = s.cad ? t('an_cad_' + s.cad) : '';
      const label = [t('an_bar') + ' ' + s.measure.number, anBeatText(s), lab, rn, fn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), hands, nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
      const cadBtn = cad ? anLearnLinkHTML('cad', cad, 'an-cad', t('an_cad_title') + ' · ' + t('an_learn_tip')) : '';
      return `<li><button type="button" class="an-ch an-nc" data-k="${k}" data-conf="${conf}" aria-pressed="false" aria-label="${esc(label)}"><span class="an-nc-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-nc-rn">${esc(rn)}</span><span class="an-nc-fn">${esc(fn)}</span><span class="an-ch-t an-nc-meta">${esc(meta)}</span>${hands ? `<span class="an-ch-hands">${esc(hands)}</span>` : ''}${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>${cadBtn}${anCardLearnLinksHTML(key, s, rn, !!nct)}</li>`;
  }
  function anNeighborBtnHTML(nb: SelectedNoteNeighbor, key: theory.KeySignature) {
      const esc = xmlEsc, name = spellName(nb.note.midi, key, true);
      const iv = nb.semitones === 0 ? '0' : `${anSignedSemi(nb.semitones)} · ${intervalLabel(Math.abs(nb.semitones))}`;
      const meta = `${iv} · ${t('an_' + nb.hand)}`;
      const idxAttr = nb.index != null ? ` data-nb-idx="${nb.index}"` : ' disabled';
      return `<button type="button" class="an-nb-btn"${idxAttr} title="${esc(name + ' · ' + meta)}"><b>${esc(name)}</b><small>${esc(meta)}</small></button>`;
  }
  function anNeighborsHTML(nb: SelectionNeighborSummary, key: theory.KeySignature) {
      const esc = xmlEsc;
      const groups: string[] = [];
      if (nb.simultaneous.length)
          groups.push(`<div class="an-nb-group"><span class="an-nb-lbl">${esc(t('an_nb_sim'))}</span><div class="an-nb-list">${nb.simultaneous.map((x) => anNeighborBtnHTML(x, key)).join('')}</div></div>`);
      if (nb.sameBeat.length)
          groups.push(`<div class="an-nb-group"><span class="an-nb-lbl">${esc(t('an_nb_beat'))}</span><div class="an-nb-list">${nb.sameBeat.map((x) => anNeighborBtnHTML(x, key)).join('')}</div></div>`);
      if (nb.prevMelodic)
          groups.push(`<div class="an-nb-group"><span class="an-nb-lbl">${esc(t('an_nb_prev'))}</span><div class="an-nb-list">${anNeighborBtnHTML(nb.prevMelodic, key)}</div></div>`);
      if (nb.nextMelodic)
          groups.push(`<div class="an-nb-group"><span class="an-nb-lbl">${esc(t('an_nb_next'))}</span><div class="an-nb-list">${anNeighborBtnHTML(nb.nextMelodic, key)}</div></div>`);
      let ctxHtml = '';
      if (nb.contextChord) {
          const cc = nb.contextChord;
          const ccLbl = spellName(60 + cc.rootPc, key) + cc.symbol + (cc.inversion > 0 ? '/' + spellName(60 + cc.bassPc, key) + ' · ' + invName(cc.inversion) : '');
          ctxHtml = `<p class="an-nb-ctx"><b>${esc(t('an_nb_chord'))}:</b> ${esc(ccLbl)}</p>`;
      }
      if (!groups.length && !ctxHtml)
          return `<div class="an-nb-wrap"><h4 class="an-nb-h">${esc(t('an_nb_h'))}</h4><p class="an-small">${esc(t('an_nb_none'))}</p></div>`;
      return `<div class="an-nb-wrap"><h4 class="an-nb-h">${esc(t('an_nb_h'))}</h4>${groups.join('')}${ctxHtml}</div>`;
  }
  function anNoteCardHTML(a: IsolatedNoteAnalysis) {
      const esc = xmlEsc, noteLbl = spellName(a.note.midi, a.key, true), handLbl = t('an_' + a.hand);
      const meta = [t('an_bar') + ' ' + a.measure.number, t('an_beat', anNum(a.beat, 1)), handLbl].join(' · ');
      const degPill = t('an_deg_label', a.degreeLabel) + ' · ' + t(a.diatonic ? 'an_deg_dia' : 'an_deg_chr');
      let roleHtml = '';
      if (a.localSeg && a.chordRole) {
          const segLbl = anChordLabel(a.localSeg, a.key) + ' (' + scoreFeature.harmony.anRoman(a.key, a.localSeg) + ')';
          const roleTxt = a.chordRole === 'nct'
              ? t('an_role_nct') + ' (' + t('an_nct_' + (a.nctType || 'other')) + ')'
              : t('an_role_' + a.chordRole);
          roleHtml = `<div class="an-note-role"><b>${esc(roleTxt)}</b> · ${esc(segLbl)}${a.chordRole === 'nct' ? ' · ' + anLearnLinkHTML('nct', t('an_nct_label')) : ''}</div>`;
      }
      return `<div class="an-note-card"><div class="an-note-top"><span class="an-nc-sym">${esc(noteLbl)}</span><span class="an-note-deg">${esc(degPill)}</span></div><div class="an-note-meta">${esc(meta)}</div>${roleHtml}</div>${anNeighborsHTML(a.neighbors, a.key)}`;
  }
  function anIntervalCardHTML(a: TwoNoteSelectionAnalysis) {
      const esc = xmlEsc, key = a.key;
      const p0 = spellName(a.pitches[0], key, true), p1 = spellName(a.pitches[1], key, true);
      const ivLbl = intervalLabel(Math.abs(a.semitones)), kindLbl = t(a.simultaneous ? 'an_iv_sim' : 'an_iv_mel');
      const degTxt = `${a.degrees[0]} – ${a.degrees[1]}`;
      let localHtml = '';
      if (a.localSeg)
          localHtml = `<div class="an-note-role"><b>${esc(anChordLabel(a.localSeg, key))}</b> (${esc(scoreFeature.harmony.anRoman(key, a.localSeg))})</div>`;
      return `<div class="an-note-card"><div class="an-note-top"><span class="an-nc-sym">${esc(p0 + ' – ' + p1)}</span><span class="an-note-deg">${esc(ivLbl)}</span></div><div class="an-note-meta">${esc([kindLbl, `${a.semitones} st`, t('an_deg_label', degTxt)].join(' · '))}</div>${localHtml}</div>${anNeighborsHTML(a.neighbors, key)}`;
  }
  function anSelChordHTML(a: ChordSelectionAnalysis) {
      const esc = xmlEsc, key = a.key;
      let body = '';
      if (a.segs.length) {
          body = `<ul class="an-nlist" aria-label="${esc(t('an_prog_label'))}">${a.segs.map((s) => {
              const sKey = anKeyAt(s.start);
              const lab = anChordLabel(s, sKey), rn = scoreFeature.harmony.anRoman(sKey, s), conf = s.ch.conf, open = s.ch.c.q === 'S' || s.ch.c.q === 'P';
              const inv = scoreFeature.harmony.anInv(s), slash = s.bass !== s.ch.root;
              const fn = [anFunctionOf(sKey, s, rn), open || slash && !inv ? '' : invName(inv), slash ? t('an_bass', spellName(60 + (s.bass ?? 0), sKey)) : ''].filter(Boolean).join(' · ');
              const alts = s.ch.alts.map((alt) => spellName(60 + alt.root, sKey) + alt.c.s).join(', '), det = anDetText(s.ch), hands = anHandsText(s, sKey);
              const meta = anBeatText(s) + ' · ' + det + (alts ? ' (' + t('an_or', alts) + ')' : ''), nct = anNctText(s, sKey), cad = s.cad ? t('an_cad_' + s.cad) : '';
              const cadBtn = cad ? anLearnLinkHTML('cad', cad, 'an-cad', t('an_cad_title') + ' · ' + t('an_learn_tip')) : '';
              return `<li><div class="an-sel-ch" data-conf="${esc(conf)}"><span class="an-nc-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-nc-rn">${esc(rn)}</span><span class="an-nc-fn">${esc(fn)}</span><span class="an-ch-t an-nc-meta">${esc(meta)}</span>${hands ? `<span class="an-ch-hands">${esc(hands)}</span>` : ''}${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</div>${cadBtn}${anCardLearnLinksHTML(sKey, s, rn, !!nct)}</li>`;
          }).join('')}</ul>`;
      } else if (a.directChord) {
          const dc = a.directChord, synth = { ch: { root: dc.rootPc, c: dc.template }, bass: dc.bassPc };
          const lab = spellName(60 + dc.rootPc, key) + dc.template.s + (dc.bassPc !== dc.rootPc ? '/' + spellName(60 + dc.bassPc, key) : '');
          const rn = scoreFeature.harmony.anRoman(key, synth);
          const fn = [anFunctionOf(key, synth, rn), dc.inversion > 0 ? invName(dc.inversion) : '', dc.bassPc !== dc.rootPc ? t('an_bass', spellName(60 + dc.bassPc, key)) : ''].filter(Boolean).join(' · ');
          const notesLine = a.pitches.slice(0, 12).map((m) => spellName(m, key, true)).join(' ');
          body = `<div class="an-sel-ch"><span class="an-nc-sym">${esc(lab)}</span><span class="an-nc-rn">${esc(rn)}</span><span class="an-nc-fn">${esc(fn)}</span><span class="an-ch-hands">${esc(notesLine)}</span></div>`;
      } else {
          body = `<p class="an-small">${esc(t('an_none'))}</p>`;
      }
      return body + anNeighborsHTML(a.neighbors, key);
  }
  // Now: rebuilt only when its bar(s) change. While playing it follows the music, but never pulls the content from under a
  // focused control (it catches up when focus leaves) and never scrolls the panel.
  function anRenderNow() {
      const body = byId('an-now-body');
      if (!body)
          return;
      const f = AN.view ? anFocus() : null, h = byId('an-now-h'), sub = byId('an-now-sub'), acts = [byId('an-now-listen'), byId('an-now-loop'), ...byId('an-now-hands').children].filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement);
      if (!f) {
          SIDE.nowSig = '';
          h.textContent = '';
          sub.textContent = '';
          body.innerHTML = '';
          byId('an-now-mark').hidden = true;
          byId('an-now-pill').hidden = true;
          byId('an-coach').hidden = true;
          byId('an-coach').innerHTML = '';
          acts.forEach((b) => { b.disabled = true; });
          return;
      }
      const sig = [AN.wsSig, f.kind, f.a, f.b, f.kind === 'sel' ? [...AN.selected].sort((x, y) => x - y).join() : '', SCORE.loop ? 'L' : '', FALL.mode].join('|');
      if (sig === SIDE.nowSig)
          return;
      if (SCORE.playing && body.contains(document.activeElement)) {
          SIDE.deferred = true;
          return;
      }
      SIDE.deferred = false;
      const esc = xmlEsc, v = AN.view, ms = anMeasures(), num = (i: number) => ms[i].number, one = f.a === f.b, notes = anFocusNotes(f), key = anKeyAt(f.lo);
      if (!v)
          return;
      const count = notes.length === 1 ? t('an_note1') : t('an_sel_notes', notes.length), bars = one ? t('an_bar1', num(f.a)) : t('an_bars', num(f.a), num(f.b));
      const head = f.kind === 'sel' ? t('an_sel_h') : one ? t('st_bar', num(f.a)) : t('an_now_passage', bars);
      h.textContent = head;
      sub.textContent = (f.kind === 'sel' ? [count, bars, anKeyName(key)] : [anKeyName(key), ms[f.a].num + '/' + ms[f.a].den, count]).join(' · ');
      byId('an-now-mark').hidden = !(f.kind === 'bars' || (f.kind === 'play' && SCORE.loop));
      byId('an-now-pill').hidden = f.kind !== 'play';
      byId('an-now-hint').textContent = t(f.kind === 'play' ? 'an_now_follow' : FALL.mode === 'fall' ? 'an_now_hint_fall' : (window).matchMedia('(pointer: coarse)').matches ? 'an_now_hint_touch' : 'an_now_hint');
      const segs = v.segs.map((s: AnHarmonySeg, k: number): AnPanelSpanRow => ({ s, k })).filter(({ s }: AnPanelSpanRow) => s.end > f.lo + 1e-6 && s.start < f.hi - 1e-6);
      const selAnalysis = f.kind === 'sel' && !AN.active && notes.length ? scoreFeature.harmony.analyzeScoreSelection(notes, AN.notes, v.segs, anHarmonyCtx()) : null;
      let html = '';
      if (!one && !selAnalysis) {
          const info = anKeyInfo(notes);
          if (info.conf !== 'low')
              html += `<p class="an-small">${esc(t('an_now_est', anKeyName(info.best), t('an_conf_' + info.conf)))}</p>`;
      } // a passage's own key, when the notes say so clearly
      if (selAnalysis) {
          if (selAnalysis.kind === 'note')
              html += anNoteCardHTML(selAnalysis);
          else if (selAnalysis.kind === 'interval')
              html += anIntervalCardHTML(selAnalysis);
          else
              html += anSelChordHTML(selAnalysis);
      }
      else if (!segs.length)
          html += `<p class="an-small">${esc(t(!notes.length ? 'an_now_empty' : one ? 'an_now_none' : 'an_harm_none'))}</p>`;
      else if (one)
          html += `<ul class="an-nlist" aria-label="${esc(t('an_prog_label'))}">${segs.map((x: AnPanelSpanRow) => anNowCard(x, v.implied)).join('')}</ul><p class="an-small an-hsrc">${esc(anHandsSource())}</p>`;
      else
          html += `<div class="an-prog" role="group" aria-label="${esc(t('an_prog_label'))}">${anRowsHTML(segs)}</div>`;
      const fe = document.activeElement;
      const inBody = (fe instanceof HTMLElement || fe instanceof SVGElement) && body.contains(fe);
      const k = inBody ? fe.dataset.k : null;
      const wasNb = fe instanceof HTMLElement && body.contains(fe) && fe.classList.contains('an-nb-btn');
      body.innerHTML = html;
      SIDE.nowSig = sig;
      AN.playSig = '';
      const coachSegs = selAnalysis ? (selAnalysis.kind === 'chord' ? selAnalysis.segs : []) : segs.map((x: AnPanelSpanRow) => x.s);
      const coach = anCoach(f, coachSegs, notes, selAnalysis), cb = byId('an-coach');
      cb.hidden = !coach;
      cb.innerHTML = coach ? `<span class="coach-k">${esc(coach.h)}</span><span class="coach-t">${esc(coach.text)}</span>` : '';
      if (k) {
          const el = queryHtml(body, '.an-ch[data-k="' + k + '"]');
          (el || byId('an-now')).focus({ preventScroll: true });
      }
      else if (wasNb) {
          const el = queryHtml(body, '.an-nb-btn[data-nb-idx]');
          (el || byId('an-now')).focus({ preventScroll: true });
      }
      else if (inBody) {
          byId('an-now').focus({ preventScroll: true });
      }
      const both = new Set(notes.map(scoreFeature.harmony.anHandOf)).size > 1, hb = byId('an-now-hands').children;
      acts.forEach((b) => { b.disabled = !notes.length; });
      [...hb].forEach((b) => { if (b instanceof HTMLElement)
          b.hidden = !both && b.dataset.h !== 'both'; });
      hb[0].textContent = t(both ? 'pr_both' : 'an_practice_b');
      byId('an-now-pr-l').hidden = !both;
      anMarkActive();
      anSyncTimeline(fallTime(), false);
      anNowAnnounce(f, head, segs, selAnalysis);
  }
  // Spoken once, a moment after the user picks bars or a chord; never while playing, so playback makes no announcements.
  function anNowAnnounce(f: AnPanelFocus, head: string, segs: AnPanelSpanRow[], selAnalysis?: ScoreSelectionAnalysis | null) {
      clearTimeout(SIDE.liveT);
      if (SCORE.playing || f.kind === 'play' || f.kind === 'cursor' || !anSideVisible('now'))
          return;
      let txt = head;
      if (selAnalysis) {
          if (selAnalysis.kind === 'note') {
              txt += ': ' + [spellName(selAnalysis.note.midi, selAnalysis.key, true), t('an_deg_label', selAnalysis.degreeLabel)].join(', ');
          } else if (selAnalysis.kind === 'interval') {
              txt += ': ' + intervalLabel(Math.abs(selAnalysis.semitones));
          } else if (selAnalysis.segs.length) {
              const s = selAnalysis.segs[0], key = anKeyAt(s.start), rn = scoreFeature.harmony.anRoman(key, s);
              txt += ': ' + [anChordLabel(s, key), rn, anFunctionOf(key, s, rn)].join(', ');
          } else if (selAnalysis.directChord) {
              const dc = selAnalysis.directChord;
              txt += ': ' + spellName(60 + dc.rootPc, selAnalysis.key) + dc.template.s;
          }
      }
      else {
          const s = segs.length ? segs[0].s : null;
          if (s) {
              const key = anKeyAt(s.start), rn = scoreFeature.harmony.anRoman(key, s);
              txt += ': ' + [anChordLabel(s, key), rn, anFunctionOf(key, s, rn)].join(', ') + (segs.length > 1 ? ' …' : '');
          }
      }
      SIDE.liveT = setTimeout(() => { byId('an-now-live').textContent = txt; }, 900);
  }
  // Practice: what Start will play and the A–B range.
  function anRenderPractice() {
      if (!AN.notes.length)
          return;
      const f = anFocus(false), ms = anMeasures(), sel = !!f && f.kind !== 'cursor', ab = PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A;
      const at = (beat: number) => { let i = 0; for (let j = 0; j < ms.length; j++) {
          if (ms[j].start <= beat + 1e-6)
              i = j;
          else
              break;
      } return i; };
      const range = (a: number, b: number) => a === b ? t('an_bar1', ms[a].number) : t('an_bars', ms[a].number, ms[b].number), Range = (a: number, b: number) => a === b ? t('st_bar', ms[a].number) : t('an_h_bars', ms[a].number, ms[b].number);
      const abBars: [number, number] | null = ab && PRAC.A != null && PRAC.B != null ? [at(scoreBeatAt(PRAC.A)), at(scoreBeatAt(PRAC.B) - 1e-4)] : null;
      const canLoopAB = abBars && !sel && scoreABPassage();
      byId('an-pt-scope').textContent = sel ? (f.kind === 'sel' ? t('an_sel_h') + ' · ' + range(f.a, f.b) : Range(f.a, f.b))
          : canLoopAB ? t('pt_scope_ab', range(...abBars)) : t('pt_scope_all');
      byId('an-pt-sub').textContent = t(sel ? 'pt_sub_loop' : canLoopAB ? 'pt_sub_ab' : 'pt_sub_all');
      byId('pt-abv').textContent = abBars ? t('pt_ab_v', range(...abBars)) : t('pt_ab_none');
  }
  // Start in the Practice tab: the selection (or A–B) loops with the practice settings; otherwise the piece plays from the cursor.
  function anPracticeStart() {
      if (SCORE.playing) {
          scoreStop();
          return;
      }
      if (AN.selected.size || scoreABPassage())
          scoreLoopStart();
      else
          scorePlay(false);
  }
  function anRevealPieceRow(smooth = true) {
      const ws = byId('an-ws');
      if (ws.hidden || !anSideVisible('piece'))
          return;
      const row = ws.querySelector('.an-prog-row.is-sel');
      if (row && !anInView(row, ws)) {
          const r = row.getBoundingClientRect(), p = ws.getBoundingClientRect();
          ws.scrollTo({ top: ws.scrollTop + (r.top - p.top) - p.height * .25, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
      }
  }
  function anRenderWorkspace(v: AnAnalysisModel) {
      const ws = byId('an-ws'), esc = xmlEsc, k = v.key, main = v.mainKey;
      const fe = document.activeElement, focused = (fe instanceof HTMLElement || fe instanceof SVGElement) && ws.contains(fe) ? fe : null, refocus = focused && (focused.dataset.k != null ? '[data-k="' + focused.dataset.k + '"]' : focused.dataset.motif != null ? '[data-motif="' + focused.dataset.motif + '"]' : null);
      // key
      const origin = anOriginText();
      const differs = (main.root !== k.best.root || main.minor !== k.best.minor) && k.conf !== 'low';
      let html = `<p class="an-scope">${esc(t('an_scope_all', v.ns.length))}</p>
    <div class="an-grid"><section class="an-facts" aria-labelledby="an-h-key">
    <h3 id="an-h-key">${esc(t('an_key_h'))}</h3><p class="an-keybig">${esc(anKeyName(main))}</p>
    <p class="an-small">${esc(t('an_key_used', origin))}</p>
    <p class="an-small">${esc(t('an_est', anKeyName(k.best) + ' — ' + t('an_conf_' + k.conf), anNum(k.best.score, 2)))}</p>
    <p class="an-small">${esc(t('an_alts', k.alts.map((a) => anKeyName(a) + ' ' + anNum(a.score, 2)).join(' · ')))}</p>${differs ? `<p class="an-small an-warn">${esc(t('an_key_differs'))}</p>` : ''}</section>`;
      let facts = `<section class="an-over" aria-labelledby="an-h-over"><h3 id="an-h-over">${esc(t('an_overview'))}</h3><dl class="an-dl">`;
      const row = (dt: string, dd: string, sub?: string) => { facts += `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`; };
      const metersSet = [...new Set(v.ms.map((m) => m.num + '/' + m.den))], unit = scoreFeature.harmony.anBeatUnit(v.ms[0] || { num: 4, den: 4 });
      const tMin = Math.min(...v.tempos), tMax = Math.max(...v.tempos), changes = v.tempos.length - 1;
      row(t('an_f_duration'), anClock(v.seconds), t('an_at_speed'));
      row(t('an_f_meter'), metersSet.join(', '), t('an_beat_unit', t(unit === 1.5 ? 'an_unit_dq' : unit === 2 ? 'an_unit_h' : unit === 0.5 ? 'an_unit_e' : 'an_unit_q')));
      row(t('an_f_tempo'), '♩ = ' + (tMin === tMax ? Math.round(tMin) : Math.round(tMin) + '–' + Math.round(tMax)), !SCORE.tempoFromFile ? t('an_tempo_default') : changes > 0 ? t('an_tempo_changes', changes) : '');
      row(t('an_f_notes'), String(v.ns.length), t('an_pitches', v.pitches.length));
      const lo = v.pitches[0], hi = v.pitches[v.pitches.length - 1];
      row(t('an_f_range'), spellName(lo, main, true) + ' – ' + spellName(hi, main, true), t('an_semis', hi - lo, anNum((hi - lo) / 12, 1)));
      const npb = v.ns.length / v.beats, opb = v.onsets / v.beats;
      row(t('an_f_npb'), anNum(npb, 1), t('an_dens_' + (opb < 0.75 ? 1 : opb < 1.25 ? 2 : opb < 2.25 ? 3 : opb < 4.5 ? 4 : 5)));
      row(t('an_f_opb'), anNum(opb, 1));
      row(t('an_f_poly'), t('an_poly', anNum(v.poly.avg, 1), v.poly.max), t('an_tex_' + (v.poly.avg < 1.25 ? 1 : v.poly.avg < 2.25 ? 2 : v.poly.avg < 3.25 ? 3 : 4)));
      const pct = (x: number) => Math.round(100 * x / v.ns.length) + '%';
      if (v.hands === 'hands') {
          const how = AN.hands ? (AN.hands.how === 'tracks' ? t('an_hands_tracks') : AN.hands.how === 'piece' ? t('an_from_piece') : t('an_split_at', spellName(AN.hands.split, null, true))) : t('an_staff_hands');
          row(t('an_f_hands'), `${t('an_rh')} ${v.rh} (${pct(v.rh)}) · ${t('an_lh')} ${v.lh} (${pct(v.lh)})`, how);
      }
      else
          row(t('an_f_register'), `${t('an_upper')} ${v.rh} (${pct(v.rh)}) · ${t('an_lower')} ${v.lh} (${pct(v.lh)})`, t('an_split_at', spellName(60, null, true)));
      facts += '</dl></section>';
      html += `<section class="an-harm" aria-labelledby="an-h-harm"><h3 id="an-h-harm">${esc(t('an_harm_h'))}</h3>`;
      // progression summary: consecutive repeats merged
      const seq: { lab: string; rn: string; i: number }[] = [];
      v.segs.forEach((s, i) => { const key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = scoreFeature.harmony.anRoman(key, s), last = seq[seq.length - 1]; if (!last || last.lab !== lab)
          seq.push({ lab, rn, i }); });
      if (seq.length) {
          const shown = seq.slice(0, 14), more = seq.length - shown.length;
          html += `<p class="an-sum">${esc(shown.map((x) => x.lab).join(' → '))}${more ? ' ' + esc(t('an_more', more)) : ''}</p><p class="an-sum-rn">${esc(shown.map((x) => x.rn).join(' – '))}</p>`;
      }
      html += `<p class="an-small">${esc(seq.length ? t(v.implied ? 'an_harm_implied' : 'an_harm_note') : t('an_harm_none'))}</p>`;
      if (v.segs.length) {
          AN.rove = Math.min(AN.rove, v.segs.length - 1);
          html += `<div class="an-prog" role="toolbar" aria-orientation="vertical" aria-label="${esc(t('an_prog_label'))}" aria-describedby="an-prog-hint">${anRowsHTML(v.segs.map((s, i) => ({ s, k: i })), AN.rove)}</div><p class="an-legend" id="an-prog-hint">${esc(t('an_prog_hint'))}</p>`;
      }
      html += `<h3 style="margin-top:18px">${esc(t('an_motifs_h'))}</h3>`;
      if (v.motifs.length)
          html += `<div class="an-chips">${v.motifs.map((m, i) => { const steps = m.iv.map((n) => (n > 0 ? '+' : '') + n).join(' '); return `<button type="button" class="an-chip" data-motif="${i}" aria-pressed="false" title="${esc(t('an_motif_title', steps))}"><span>${esc(steps)}</span><small>× ${m.count}</small></button>`; }).join('')}</div>`;
      else
          html += `<p class="an-small">${esc(t('an_motif_none'))}</p>`;
      html += '</section>' + facts + '</div>';
      ws.innerHTML = html;
      AN.playSig = '';
      anSyncTimeline(fallTime(), false);
      if (refocus) {
          const el = queryHtml(ws, refocus);
          if (el)
              el.focus({ preventScroll: true });
      }
  }
  // The selection strip under Now: chosen notes (or a chosen chord), with the interval or chord they spell.
  function anRenderSelection() {
      const box = byId('an-sel');
      if (!box)
          return;
      const sel = [...AN.selected].sort((a, b) => a - b).map((i) => AN.notes[i]).filter(Boolean);
      if (!sel.length || !AN.active) {
          box.hidden = true;
          box.innerHTML = '';
          return;
      } // whole bars and manual selections show directly in Now
      const key = anKeyAt(sel[0].start), pitches = [...new Set(sel.map((n) => n.midi))].sort((a, b) => a - b), esc = xmlEsc, parts: string[] = [];
      parts.push(`<span><b>${esc(t('an_sel_h'))}</b> · ${esc(sel.length === 1 ? t('an_note1') : t('an_sel_notes', sel.length))} · ${esc(anBarsLabel(sel))}</span>`);
      parts.push(`<span>${esc(pitches.slice(0, 16).map((m) => spellName(m, key, true)).join(' · '))}${pitches.length > 16 ? ' …' : ''}</span>`);
      const seg = AN.active && AN.active.kind === 'chord' && AN.view ? AN.view.segs[AN.active.k] : null;
      if (seg) {
          if (pitches.length === 2)
              parts.push(`<span><b>${esc(t('an_interval'))}:</b> ${esc(anIntervalName(pitches[1] - pitches[0]))}</span>`);
          parts.push(`<span><b>${esc(t('an_chord'))}:</b> ${esc(anChordLabel(seg, key))} · ${esc(scoreFeature.harmony.anRoman(key, seg))}</span>`);
          const nct = anNctText(seg, key);
          if (nct)
              parts.push(`<span><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>`);
      }
      else if (pitches.length === 2)
          parts.push(`<span><b>${esc(t('an_interval'))}:</b> ${esc(anIntervalName(pitches[1] - pitches[0]))}</span>`);
      else if (pitches.length >= 3) {
          const id = identifyChord(pitches);
          parts.push(`<span><b>${esc(t('an_chord'))}:</b> ${esc(id ? spellName(60 + id.rootPc, key) + id.chord.symbol + (id.inversion > 0 ? '/' + spellName(60 + id.bassPc, key) + ' · ' + invName(id.inversion) : '') : t('an_none'))}</span>`);
      }
      box.innerHTML = parts.join('');
      box.hidden = false;
  }
  function anMarkActive() {
      const a = AN.active, side = byId('an-side');
      if (!side)
          return;
      queryAllHtml(side, '.an-ch').forEach((b) => b.setAttribute('aria-pressed', a && a.kind === 'chord' && Number(b.dataset.k) === a.k ? 'true' : 'false'));
      queryAllHtml(side, '.an-chip[data-motif]').forEach((b) => b.setAttribute('aria-pressed', a && a.kind === 'motif' && Number(b.dataset.motif) === a.k ? 'true' : 'false'));
      const f = AN.notes.length ? anFocus(false) : null, on = !!f && f.kind !== 'cursor';
      queryAllHtml(byId('an-ws'), '.an-prog-row[data-bar]').forEach((r) => { const i = Number(r.dataset.bar); r.classList.toggle('is-sel', on && i >= f.a && i <= f.b); });
  }
  /* opening files and examples */
  function anStatus(msg?: string, isError?: boolean) { const el = byId('an-msg'); el.textContent = msg || ''; el.classList.toggle('is-error', !!isError); }
  function anLoadedText() {
      const src = AN.source;
      if (!src)
          return '';
      const g = '1/' + (AN.recon.grid * 4);
      if (src.kind === 'xml')
          return t('an_loaded_xml');
      if (src.kind === 'example')
          return t('an_loaded_example', g);
      const tracks = new Set(src.parsed.notes.map((n: { track: number; }) => n.track)).size;
      return t('an_loaded_midi', tracks === 1 ? t('an_track1') : t('an_tracks', tracks), g);
  }
  function anShowError(k: string, a?: string|number) {
      AN.error = { k, a };
      const msg = a === undefined ? t(k) : t(k, a);
      anStatus(msg, true);
      const retryBtn = maybeById('an-msg-retry');
      if (retryBtn) retryBtn.hidden = false;
      if (anScreen === 'catalog' || !SCORE.xml)
          anCatalogStatus(msg, 'error', true);
      if (!SCORE.xml || anScreen === 'catalog')
          anRenderEmpty();
  }
  function anSetLoading(on: boolean, msg?: string) { AN.loading = on; if (on) {
      if (SCORE.playing)
          scorePause();
      else
          stopPreviews();
      AN.error = null;
      anStatus(msg);
      const retryBtn = maybeById('an-msg-retry');
      if (retryBtn) retryBtn.hidden = true;
  } anUpdateControls(); }
  function anErrorKey(err: unknown, fallback: string) { const code: unknown = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined; if (!err || !code)
      console.error(err); return 'an_err_' + (code && (shell.strings()[host.i18n.lang()] || shell.strings().en)?.['an_err_' + String(code)] ? String(code) : fallback); }
  function anPieceMeta(p: AnExamplePiece) {
      const n = p.keyN || 0, keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n);
      return [p.comp, anKeyName({ root: keyPc, minor: !!p.minor, fifths: n }), p.ts[0] + '/' + p.ts[1]].filter(Boolean).join(' · ');
  }
  // Touch screens can't drop files, so they get the open wording (native.css picks the span).
  function anDropTitle() { return `<span class="ctx-kbd">${xmlEsc(t('an_drop_t'))}</span><span class="ctx-touch">${xmlEsc(t('an_pick_t'))}</span>`; }
  function anRenderEmpty() {
      const box = byId('an-roll');
      box.classList.add('is-empty');
      box.classList.remove('is-loading', 'is-over');
      box.setAttribute('aria-busy', 'false');
      box.hidden = FALL.mode !== 'score' && AN.notes.length > 0;
      const esc = xmlEsc;
      const html = `<div class="an-empty"><div class="an-drop" id="an-drop"><p class="an-drop-t" id="an-drop-t">${anDropTitle()}</p><p class="an-drop-s">${esc(t('an_drop_s'))}</p>
    <button type="button" class="btn primary" data-an-open>${esc(t('an_open'))}</button><p class="an-drop-err" role="alert">${esc(AN.error ? t((AN.error).k, (AN.error).a) : '')}</p></div></div>`;
      const host = maybeById('an-empty-host');
      if (host) {
          host.innerHTML = html;
          box.replaceChildren();
      }
      else {
          box.innerHTML = html;
      }
      anUpdateControls();
  }
  /* Pieces: the built-in repertoire, by level, above My Library. Each piece opens in this player through anLoadExample. */
  function pcRender() {
      const list = maybeById('pc-list'), sum = maybeById('pc-sum');
      if (!list)
          return;
      if (sum)
          sum.textContent = t('pc_builtin', PIECES.length);
      const esc = xmlEsc, cur = AN.source && AN.source.kind === 'example' ? AN.source.id : '', busy = AN.loading;
      const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.dataset.piece : undefined;
      const levels = [...new Set(PIECES.map((p) => p.level))].sort((a, b) => a - b);
      list.innerHTML = levels.map((L) => `<div class="pc-level"><h3 class="pc-level-h" id="pc-lv-${L}">${esc(t('rd_level') + ' ' + L)}</h3><ul class="pc-items" aria-labelledby="pc-lv-${L}">${PIECES.filter((p) => p.level === L).map((p) => {
          const rec = host.store.data().sheet[p.id], best = rec && rec.best ? rec.best : 0, learned = !!(rec && rec.learned);
          const status = learned || best ? `<span class="pc-s">${learned ? `<span class="pc-ok"><span aria-hidden="true">✓</span><span class="visually-hidden">${esc(t('rd_learned'))}</span></span>` : ''}${best ? `<span class="pc-best">${esc(t('rd_best', best))}</span>` : ''}</span>` : '';
          return `<li><button type="button" class="pc-item" data-piece="${p.id}" aria-current="${p.id === cur ? 'true' : 'false'}"${busy ? ' disabled' : ''}><span class="pc-t">${esc(srPieceTitle(p))}</span><span class="pc-m">${esc(anPieceMeta(p))}</span>${status}</button></li>`;
      }).join('')}</ul></div>`).join('');
      // The list is rebuilt, so keyboard focus moves to the same piece's new button.
      if (focused)
          queryHtml(list, `.pc-item[data-piece="${focused}"]`)?.focus({ preventScroll: true });
  }
  // Opens a built-in piece in Pieces from anywhere (Learn links, other screens).
  async function pcOpen(id: string) {
      if (view0() !== 'analysis') {
          anListContext = null;
          anFromListDepth = 0;
          await host.nav.show('analysis');
      }
      return anLoadExample(id);
  }
  function anReconUI() {
      const src = AN.source, on = !!src && src.kind !== 'xml';
      byId('an-recon-btn').hidden = !on;
      if (!on) {
          anReconOpen(false);
          return;
      }
      const opt = (v: string, l: string) => `<option value="${v}">${xmlEsc(l)}</option>`;
      byId('an-hands').innerHTML = opt('auto', t('an_hands_auto')) + opt('tracks', t('an_hands_tracks')) + [59, 60, 64].map((m) => opt(String(m), t('an_hands_split', noteName(m, false)))).join('');
      selectById('an-hands').value = AN.recon.hands;
      selectById('an-grid').value = String(AN.recon.grid);
      const keys = (minor: boolean) => [...Array(12).keys()].map((r) => { const f = keyFifths(r, minor); return opt(f + ':' + (minor ? 1 : 0), anKeyName({ root: r, minor, fifths: f })); }).join('');
      byId('an-keysel').innerHTML = opt('auto', t('an_key_auto')) + `<optgroup label="${xmlEsc(t('an_keys_major'))}">${keys(false)}</optgroup><optgroup label="${xmlEsc(t('an_keys_minor'))}">${keys(true)}</optgroup>`;
      selectById('an-keysel').value = AN.recon.key;
      const h = AN.hands, k = AN.keyMap[0], parts: string[] = [];
      if (h)
          parts.push(h.how === 'tracks' ? t('an_rn_hands_tracks', h.groups) : h.how === 'piece' ? t('an_rn_hands_piece') : t(h.how === 'fallback' ? 'an_rn_hands_fallback' : h.how === 'one' ? 'an_rn_hands_one' : 'an_rn_hands_split', noteName(h.split, false)));
      if (k)
          parts.push(t('an_rn_key', anKeyName(k), anOriginText()));
      byId('an-recon-note').textContent = parts.join(' ');
  }
  function anIndex() { AN.index = new Map(AN.notes.map((n, i) => [n, i])); AN.version++; AN.cache.clear(); AN.wsSig = ''; }
  function anReset() {
      anRollbackOpening?.();
      AN.loadToken++;
      anLibraryDetach();
      scoreStop();
      anSetLoading(false);
      anSheet(false, true);
      AN.notes = [];
      AN.source = null;
      AN.selected = new Set();
      AN.active = null;
      AN.keyMap = [];
      AN.hands = null;
      AN.view = null;
      AN.playSeg = -1;
      AN.playSig = '';
      scoreLayoutGeneration++; scorePendingSignature = ''; scoreLayoutPending = null;
      SCORE.xml = '';
      SCORE.measures = [];
      SCORE.engine = null;
      SCORE.geo = null;
      SCORE.mrange = null;
      PRAC.A = PRAC.B = null;
      SCORE.heads = new Map();
      SCORE.version++;
      scoreSetTempos([]);
      anIndex();
      byId('an-name').textContent = '';
      anReconUI();
      pcRender();
      anRenderEmpty();
      fallReset();
      anAnalyze();
  }
  // The bundled JSZip trusts an archive's own size fields and only notices a lie after inflating the whole entry into memory.
  // Walk the directory the way it will (last end-of-directory record, signed 32-bit fields, the same record and local-header
  // reads), refuse anything it could not unpack anyway, and cap what every entry declares. Entries big enough to expand
  // past the cap (deflate tops out near 1032:1) are inflated once as a counted stream, so a lying header fails here.
  async function anMxlPreflight(buf: ArrayBuffer) {
      await ensureModules();
      return importMxlPreflight(buf, anInflatedSize);
  }
  // Inflates raw-deflate bytes as a stream, counting and discarding the output; stops as soon as it passes `limit`.
  // Resolves to the byte count (limit+something when over), or null when this browser has no raw-deflate stream.
  let anInflatedSize: typeof import('../../domain/score-import.js').defaultInflatedSize = async (...args) => {
      await ensureModules();
      return defaultInflatedSize(...args);
  };
  async function anReadXml(file: File, title: string, captureDifficulty = false) {
      await ensureModules();
      return importReadXml(file, title, {
          captureDifficulty,
          inflatedSize: anInflatedSize,
          loadMxlToXml: async (buf: ArrayBuffer) => {
              await loadOsmd();
              return mxlToXml(buf);
          },
      });
  }
  // The single entry point for the file input and drag & drop.
  async function anOpenFile(file: File, libraryItem?: LibraryItem, opts?: { fromHistory?: boolean }): Promise<boolean> {
      if (!file)
          return false;
      anCatalogStatus('');
      anRollbackOpening?.();
      const token = ++AN.loadToken;
      const name = file.name || '';
      const rejected = !/\.(mid|midi|xml|musicxml|mxl)$/i.test(name) ? 'an_err_type'
          : file.size > AN_MAX_BYTES ? 'an_err_size' : !file.size ? 'an_err_empty' : null;
      if (rejected) {
          anSetLoading(false);
          anShowError(rejected, name);
          return false;
      }
      if (!opts?.fromHistory && anScreen === 'catalog' && !anListContext)
          anCaptureListContext(libraryItem ? `#library-items [data-library-id="${CSS.escape(libraryItem.id)}"] [data-library-action="open"]` : null);
      anHideMistakeBar();
      anLibraryCapture();
      const checkpoint = anLibraryFlush(false).catch(() => {});
      const title = name.replace(/\.[^.]+$/, ''), kind = /\.mxl$/i.test(name) ? 'mxl' : /\.(xml|musicxml)$/i.test(name) ? 'xml' : 'midi';
      anCatalogStatus(t('an_status_opening'), 'info');
      anSetLoading(true, t('an_loading', name));
      await checkpoint;
      if (token !== AN.loadToken)
          return false;
      let src: AnSource;
      try {
          await ensureModules();
          src = kind === 'midi' ? { kind: 'midi', title, label: name, parsed: anParse(await file.arrayBuffer()) } : await anReadXml(file, title, true);
      }
      catch (err) {
          if (token !== AN.loadToken)
              return false;
          anSetLoading(false);
          anShowError(anErrorKey(err, kind));
          return false;
      }
      if (token !== AN.loadToken)
          return false;
      await anCommit(src, token, libraryItem?.resume?.recon, {
          fromHistory: opts?.fromHistory,
          route: libraryItem ? { kind: 'lib', id: libraryItem.id } : null,
      });
      if (token !== AN.loadToken || AN.source !== src || AN.error || !SCORE.engine)
          return false;
      await anLibraryEnsure().catch(() => null);
      anLibrarySaving++;
      scoreLibrary?.notice('saving');
      try {
          // Reopening does not recreate a score deleted concurrently in another tab.
          const item = libraryItem
              ? await scoreLibraryStore.libraryUpdate(libraryItem.id, { lastOpenedAt: Date.now() })
              : (await scoreLibraryStore.librarySave(file, anLibraryMetadata(src))).item;
          if (item) scoreLibrary?.prepareRating(item, async startingBpm => {
              const { estimateImportedScore } = await import('../../domain/score-difficulty-import.js');
              return estimateImportedScore(src, startingBpm);
          });
          if (item && token === AN.loadToken && AN.source === src) {
              if (!libraryItem && src.kind === 'midi' && item.resume?.recon
                  && (item.resume.recon.hands !== AN.recon.hands
                      || item.resume.recon.grid !== AN.recon.grid
                      || item.resume.recon.key !== AN.recon.key)) {
                  await anCommit(src, token, item.resume.recon, { fromHistory: true, route: { kind: 'lib', id: item.id } });
                  if (token !== AN.loadToken || AN.source !== src || AN.error || !SCORE.engine)
                      return false;
              }
              if (item.resume)
                  anLibraryRestoreResume(item.resume);
              anLibraryActive = { id: item.id, source: src };
              if (!opts?.fromHistory)
                  anSyncPlayerHistory({ kind: 'lib', id: item.id }, false, true);
              if (item.resume)
                  anLibrarySaved.set(item.id, JSON.stringify(item.resume));
              if (!libraryItem)
                  await scoreLibraryStore.libraryUpdate(item.id, { lastOpenedAt: Date.now() });
              anLibrarySchedule();
              scoreLibrary?.notice('saved');
              anStatus(`${anLoadedText()} · ${t('an_status_saved')}`);
          }
          await scoreLibrary?.refresh();
      }
      catch (_) {
          // File opening remains available even if this browser blocks storage or has no quota.
          scoreLibrary?.notice('save_failed');
      }
      finally {
          anLibrarySaving--;
      }
      return token === AN.loadToken && AN.source === src && !AN.error;
  }
  async function anLoadExample(id: string, opts?: { fromHistory?: boolean; speed?: number; measure?: string })  {
      anHideMistakeBar();
      await ensureModules();
      const p = PIECES.find((x) => x.id === id);
      if (!p)
          return;
      anCatalogStatus('');
      if (!opts?.fromHistory && anScreen === 'catalog' && !anListContext)
          anCaptureListContext(`#pc-list .pc-item[data-piece="${CSS.escape(id)}"]`);
      anRollbackOpening?.();
      anLibraryCapture();
      const token = ++AN.loadToken;
      anSetLoading(true, t('an_loading', srPieceTitle(p)));
      await anCommit({ kind: 'example', id, title: srPieceTitle(p), label: srPieceTitle(p), comp: p.comp, parsed: anPieceToParsed(p) }, token, undefined, {
          fromHistory: opts?.fromHistory,
          route: { kind: 'builtin', id },
      });
      if (token === AN.loadToken && AN.source?.kind === 'example' && AN.source.id === id) {
          if (opts?.speed && [...selectById('score-speed').options].some((o) => +o.value === opts.speed)) {
              selectById('score-speed').value = String(opts.speed);
              anUpdateControls();
          }
          if (opts?.measure) {
              const idx = SCORE.measures.findIndex((m) => String(m.number) === opts.measure);
              if (idx > 0) scoreSeekTo(scoreSeconds(SCORE.measures[idx].start));
          }
          anRecordBuiltinProgress();
          anRenderContinueCard();
      }
  }
  // Keep the old renderer and DOM available until the replacement finishes layout.
  // A newer open rolls this attempt back before reading its own file.
  let anRollbackOpening: (() => void) | null = null;
  function anStageOpening() {
      const prevScreen = anScreen;
      const previous = { ...AN }, score = { ...SCORE }, performance = { ...PERFORMANCE };
      const position = FALL.position, a = PRAC.A, b = PRAC.B;
      const box = byId('an-roll'), children = [...box.childNodes];
      const attributes = [...box.attributes].map(({ name, value }) => ({ name, value }));
      const { scrollTop, scrollLeft } = box;
      AN.cache = new Map();
      SCORE.cursorEl = null;
      anRollbackOpening = () => {
          anRollbackOpening = null;
          scoreLayoutGeneration++;
          scorePendingSignature = '';
          scoreLayoutPending = null;
          // The old engraving keeps its identity, but unfinished work must see a newer version.
          Object.assign(SCORE, score, { version: SCORE.version + 1 });
          Object.assign(AN, previous, { loadToken: AN.loadToken, wsSig: '' });
          Object.assign(PERFORMANCE, performance);
          FALL.position = position;
          PRAC.A = a;
          PRAC.B = b;
          for (const attr of [...box.attributes]) box.removeAttribute(attr.name);
          for (const attr of attributes) box.setAttribute(attr.name, attr.value);
          box.replaceChildren(...children);
          box.scrollTo(scrollLeft, scrollTop);
          anSetScreen(prevScreen);
          anSetLoading(false);
          anReconUI();
          pcRender();
          scoreIdle();
      };
  }
  async function anCommit(src: AnSource, token: number, recon?: LibraryResume['recon'], opts?: { fromHistory?: boolean; route?: AnalysisRoute | null })  {
      await ensureModules();
      if (token !== AN.loadToken) return;
      anStageOpening();
      const wasPlayer = anScreen === 'player';
      anSetScreen('player');
      AN.source = src;
      AN.error = null;
      AN.selected = new Set();
      AN.active = null;
      AN.rove = 0;
      FALL.position = 0;
      SCORE.mrange = null;
      SCORE.resume = null;
      SCORE.paused = false;
      PRAC.A = PRAC.B = null;
      if (src.kind === 'xml') {
          AN.notes = src.notes;
          SCORE.xml = src.xml;
          SCORE.midiGrid = 0;
          SCORE.measures = src.measures;
          SCORE.tempoFromFile = src.tempos.length > 0;
          scoreSetTempos(src.tempos);
          AN.hands = null;
          AN.keyMap = anXmlKeyMap(src);
      }
      else {
          AN.recon = src.kind === 'midi' && recon ? { ...recon } : { hands: 'auto', grid: 4, key: 'auto' };
          try {
              anRebuild();
          }
          catch (err) {
              anRollbackOpening?.();
              anShowError(anErrorKey(err, 'midi'));
              return;
          }
      }
      anIndex();
      if (!scoreLayoutExplicit) {
          SCORE.layout = defaultScoreLayoutForViewport(window.innerWidth);
      }
      let ok = false;
      try {
          ok = await scoreRender();
      }
      catch (err) {
          console.error(err);
          if (token === AN.loadToken) {
              anRollbackOpening?.();
              anShowError('an_err_render');
          }
          return;
      }
      if (token !== AN.loadToken)
          return;
      if (!ok) {
          anRollbackOpening?.();
          anShowError('an_err_render');
          return;
      }
      anRollbackOpening = null;
      anLibraryDetach();
      anSetLoading(false);
      anReconUI();
      pcRender();
      byId('an-name').textContent = src.label || src.title;
      anStatus(anLoadedText());
      anCatalogStatus('');
      const retryBtn = maybeById('an-msg-retry');
      if (retryBtn) retryBtn.hidden = true;
      fallReset();
      AN.kbCenter = true;
      if (anKeysShown())
          anKeysCenter(); // a collapsed keyboard is centred when it is first shown
      anSetScreen('player');
      const route = opts?.route ?? (src.kind === 'example' ? { kind: 'builtin', id: src.id } as const : null);
      if (route)
          anSyncPlayerHistory(route, opts?.fromHistory, wasPlayer && anFromListDepth === 0);
      else if (!opts?.fromHistory && !wasPlayer && view0() === 'analysis') {
          try {
              history.pushState(null, '', '#analysis');
              if (anListContext?.fromList)
                  anFromListDepth++;
          }
          catch (_) { }
      }
      anFocusStage();
  }
  async function anReconChange()  {
      if (AN.loading || !AN.source || AN.source.kind === 'xml')
          return;
      const prev = { ...AN.recon };
      AN.recon = { hands: selectById('an-hands').value, grid: +selectById('an-grid').value, key: selectById('an-keysel').value };
      scoreStop();
      try {
          anRebuild();
      }
      catch (err) {
          if (!(err instanceof Error) || !('code' in err))
              console.error(err);
          AN.recon = prev;
          anRebuild();
          anReconUI();
          anShowError('an_err_rebuild');
          return;
      }
      AN.active = null;
      AN.error = null;
      anIndex();
      anReconUI();
      anStatus(anLoadedText());
      const token = ++AN.loadToken;
      try {
          if (await scoreRender() && token === AN.loadToken) anLibrarySchedule();
      }
      catch (err) {
          console.error(err);
          if (token === AN.loadToken) {
              anReset();
              anShowError('an_err_render');
          }
      }
  }
  // Language or notation changed: localise generated controls, and re-title a built-in example.
  function anLocalize() {
      pcRender();
      anReconUI();
      const src = AN.source;
      // Examples are re-titled and MIDI scores get the localized part name ("Piano"/"Pian"): both need a rebuild.
      if (!AN.loading && src && src.kind !== 'xml') {
          const p = src.kind === 'example' ? PIECES.find((x) => x.id === src.id) : null, title = p ? srPieceTitle(p) : src.title, part = '<part-name>' + xmlEsc(t('sc_part')) + '</part-name>';
          if (title !== src.title || (SCORE.xml && !SCORE.xml.includes(part))) {
              if (p) {
                  src.title = src.label = title;
                  byId('an-name').textContent = title;
              }
              anRebuild();
              anIndex();
              scoreRender().catch((err) => { console.error(err); anReset(); anShowError('an_err_render'); });
          }
      }
      if (AN.error)
          anStatus(t(AN.error.k, AN.error.a), true);
      else if (src)
          anStatus(anLoadedText());
      if (!SCORE.xml)
          anRenderEmpty();
      AN.wsSig = '';
  }
  /* selection */
  function anSelectionChanged() {
      AN.active = null;
      const R = SCORE.mrange;
      if (R && R.sig !== [...AN.selected].sort((a, b) => a - b).join())
          SCORE.mrange = null;
      if (!SCORE.playing && (AN.selected.size || SCORE.mrange)) {
          FALL.position = anSelStart();
          SCORE.resume = null;
          SCORE.paused = false;
          scoreStateText();
      }
      if (SCORE.loop && !SCORE.loop.ab) {
          if (AN.selected.size)
              scoreLoopStart();
          else
              scoreStop();
      }
      scorePaint();
      if (FALL.mode === 'fall')
          fallDraw();
      anRevealPieceRow();
  }
  function anSelectNotes(list: readonly AnNote[], active?: AnSelectionFocus | null, bars?: { a: number; b: number; } | null) {
      AN.selected = new Set(list.map((n) => AN.index.get(n)).filter((i) => i != null));
      AN.active = active || null;
      SCORE.mrange = bars && AN.selected.size ? { anchor: bars.a, a: bars.a, b: bars.b, sig: [...AN.selected].sort((x, y) => x - y).join() } : null;
      if (!SCORE.playing && AN.selected.size) {
          FALL.position = anSelStart();
          SCORE.resume = null;
          SCORE.paused = false;
          scoreStateText();
      }
      if (SCORE.loop && !SCORE.loop.ab) {
          if (AN.selected.size)
              scoreLoopStart();
          else
              scoreStop();
      }
      scorePaint();
      if (FALL.mode === 'fall')
          fallDraw();
      const g = AN.selected.size && (SCORE.heads.get(Math.min(...AN.selected)) || [])[0];
      if (g && FALL.mode === 'score')
          anKeepVisible(g, true);
  }
  function anSelectChord(k: number) {
      const seg = AN.view && AN.view.segs[k];
      if (!seg)
          return;
      const g = SCORE.geo, mi = g ? g.measures.findIndex((m) => m && Math.abs(m.b0 - seg.measure.start) < 1e-3) : -1;
      anSelectNotes(seg.notes, { kind: 'chord', k }, mi >= 0 ? { a: mi, b: mi } : null);
  }
  function anClearSelection() { if (!AN.selected.size && !SCORE.mrange)
      return false; AN.selected.clear(); SCORE.mrange = null; anSelectionChanged(); return true; }
  function anDraw() { if (!SCORE.xml)
      anRenderEmpty();
  else if (SCORE.stale)
      scoreLayout();
  else
      scorePaint(); if (FALL.mode === 'fall')
      fallDraw(); anUpdateControls(); anLayoutVars(); }
  // Hover (or focus) explains what is under the pointer: a note with its chord, or any other marking on the page.
  function anIsDataEl(el: Element | null | undefined): el is HTMLElement | SVGElement {
      return el instanceof HTMLElement || el instanceof SVGElement;
  }
  function anHover(e: PointerEvent | FocusEvent) {
      const g = eventElement(e)?.closest('#an-roll [data-i]');
      if (!anIsDataEl(g)) {
          const sym = scoreSymAt(e);
          if (!sym) {
              byId('an-hover').textContent = '';
              scoreTip(null);
              return;
          }
          const txt = scoreSymText(sym);
          byId('an-hover').textContent = txt.line;
          scoreTip(sym, txt);
          return;
      }
      scoreTip(null);
      const n = AN.notes[Number(g.dataset.i)];
      if (!n)
          return;
      const key = anKeyAt(n.start), group = AN.notes.filter((a) => a.start <= n.start + 0.001 && a.end > n.start + 0.001), chord = identifyChord(group.map((a) => a.midi)), seg = anSegAt(n.start), nct = seg && seg.nct && seg.nct.find((x: { note: unknown; type: string; }) => x.note === n);
      byId('an-hover').textContent = spellName(n.midi, key, true) + ' · ' + t('an_bar') + ' ' + anMeasureAt(n.start).number + ' · ' + group.map((a) => spellName(a.midi, key, true)).join(' ') + ' · ' + (chord ? spellName(60 + chord.rootPc, key) + chord.chord.symbol + (chord.inversion > 0 ? '/' + spellName(60 + chord.bassPc, key) : '') : t('an_none')) + (nct ? ' · ' + t('an_nct_' + nct.type) : '');
      if (g.dataset.grace === 'yes') byId('an-hover').textContent += ' · ' + t('sym_grace');
      if (g.dataset.parenthesized === 'yes') byId('an-hover').textContent += ' · ' + t('sym_parenthesized');
  }
  // Click a notehead to select it (Shift/Ctrl adds), click empty space in a bar to select the bar (Shift extends the range),
  // drag for a free-shape lasso (default) or rectangular marquee; a click outside every bar clears the selection.
  let cancelScoreGesture: (() => void) | undefined;
  function scorePointer(e: PointerEvent): ScoreSelectionGesture | undefined {
      const box = byId('an-roll'), el = eventElement(e);
      if (e.button !== 0 || !SCORE.xml || !box.querySelector('svg') || !el || el.closest('.an-empty'))
          return;
      if (e.target === box && (e.offsetX >= box.clientWidth || e.offsetY >= box.clientHeight))
          return; // scrollbar
      const hit = el.closest('[data-i]'), target = anIsDataEl(hit) ? hit : null, x = e.clientX, y = e.clientY, add = e.shiftKey || e.ctrlKey || e.metaKey;
      box.classList.toggle('is-pen', e.pointerType === 'pen');
      if (e.pointerType !== 'touch')
          e.preventDefault();
      let dragged = false;
      let marquee: HTMLDivElement|null = null;
      let lassoSvg: SVGSVGElement|null = null;
      let lassoPath: SVGPathElement|null = null;
      const pts: LassoPoint[] = [{ x, y }];
      const drawLasso = () => {
          if (!lassoPath || pts.length < 2)
              return;
          lassoPath.setAttribute('d', 'M ' + pts.map((p) => `${Math.round(p.x)} ${Math.round(p.y)}`).join(' L ') + ' Z');
      };
      const move = (ev: PointerEvent) => {
          if (ev.pointerId !== e.pointerId) return;
          if (!dragged && Math.hypot(ev.clientX - x, ev.clientY - y) < 5)
              return;
          if (!dragged) {
              dragged = true;
              box.classList.add('is-lasso-drag');
          }
          if (AN.selMode === 'lasso') {
              if (!lassoSvg) {
                  lassoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                  lassoSvg.setAttribute('class', 'an-lasso');
                  lassoSvg.setAttribute('aria-hidden', 'true');
                  lassoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                  lassoPath.setAttribute('class', 'an-lasso-path');
                  lassoSvg.appendChild(lassoPath);
                  document.body.appendChild(lassoSvg);
              }
              if (scoreFeature.harmony.lassoAppendPoint(pts, { x: ev.clientX, y: ev.clientY }, 4) || pts.length === 2)
                  drawLasso();
              return;
          }
          if (!marquee) {
              marquee = (document).createElement('div');
              marquee.className = 'an-marquee';
              document.body.appendChild(marquee);
          }
          Object.assign(marquee.style, { left: Math.min(x, ev.clientX) + 'px', top: Math.min(y, ev.clientY) + 'px', width: Math.abs(ev.clientX - x) + 'px', height: Math.abs(ev.clientY - y) + 'px' });
      };
      const done = () => {
          box.classList.remove('is-lasso-drag');
          if (marquee)
              marquee.remove();
          if (lassoSvg)
              lassoSvg.remove();
      };
      const finish = (ev: PointerEvent) => {
          if (ev.pointerId !== e.pointerId) return;
          done();
          if (!dragged) {
              if (target) {
                  const i = Number(target.dataset.i);
                  if (!add)
                      AN.selected.clear();
                  if (AN.selected.has(i))
                      AN.selected.delete(i);
                  else
                      AN.selected.add(i);
                  anRove(target);
                  anSelectionChanged();
                  return;
              }
              const mi = scoreMeasureAt(x, y);
              if (mi >= 0) {
                  scoreSelectMeasures(mi, add);
                  return;
              }
              if (!add)
                  anClearSelection();
              return;
          }
          if (!add)
              AN.selected.clear();
          if (AN.selMode === 'lasso') {
              scoreFeature.harmony.lassoAppendPoint(pts, { x: ev.clientX, y: ev.clientY }, 2);
              SCORE.heads.forEach((list, i) => list.forEach((g: Element) => {
                  const r = g.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
                  if (scoreFeature.harmony.pointInLasso(cx, cy, pts))
                      AN.selected.add(i);
              }));
          }
          else {
              SCORE.heads.forEach((list, i) => list.forEach((g: Element) => {
                  const r = g.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
                  if (cx >= Math.min(x, ev.clientX) && cx <= Math.max(x, ev.clientX) && cy >= Math.min(y, ev.clientY) && cy <= Math.max(y, ev.clientY))
                      AN.selected.add(i);
              }));
          }
          anSelectionChanged();
      };
      return { move, finish, cancel: done };
  }
  function anRove(g: Element) { byId('an-roll').querySelectorAll('[data-i][tabindex="0"]').forEach((x) => x.setAttribute('tabindex', '-1')); g.setAttribute('tabindex', '0'); }
  const FALL: FallState = createFallState();
  function anHasFinger() { if (FALL.fingerSrc !== AN.notes) {
      FALL.fingerSrc = AN.notes;
      FALL.hasFinger = AN.notes.some((n) => n.finger);
  } return FALL.hasFinger; }
  function fallStartIndex(data: readonly { start: number }[], minStart: number): number {
      let lo = 0, hi = data.length;
      while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (data[mid].start < minStart) lo = mid + 1;
          else hi = mid;
      }
      return lo;
  }
  function fallData() { if (FALL.source !== AN.notes || FALL.tempoSource !== SCORE.tempoList) {
      FALL.source = AN.notes;
      FALL.tempoSource = SCORE.tempoList;
      let maxEnd = 0, maxDur = 0, prevStart = -Infinity, sorted = true;
      FALL.notes = AN.notes.map((n, i) => {
          const start = scoreSeconds(n.start), finish = scoreSeconds(n.end), sound = scoreSeconds(n.soundEnd ?? n.end);
          if (start < prevStart) sorted = false;
          prevStart = start;
          maxEnd = Math.max(maxEnd, AN.source?.kind === 'midi' ? sound : finish);
          if (finish - start > maxDur) maxDur = finish - start;
          return { n, i, start, finish, sound };
      });
      // A score ends at the final barline, including written rests after its last pitched note.
      const src = AN.source;
      const sustainEnd = (src?.kind === 'xml' ? src.sustain : src?.parsed.sustain)?.at(-1)?.beat ?? 0;
      FALL.end = src?.kind === 'xml' ? Math.max(maxEnd, scoreSeconds(sustainEnd), ...SCORE.measures.map(m => scoreSeconds(m.end))) : Math.max(maxEnd, scoreSeconds(sustainEnd));
      FALL.maxDur = maxDur;
      FALL.sorted = sorted;
  } return FALL.notes; }
  function fallEnd() { fallData(); return FALL.end; }
  function fallTime(at?: number) {
      const R = SCORE.run;
      if (!SCORE.playing || !shell.audioEngine.context || !R)
          return FALL.position;
      return pracPosition(R, at ?? shell.audioEngine.context.currentTime).t;
  }
  function scoreVisualPosition(frameTime: number) {
      const R = SCORE.run, ctx = shell.audioEngine.context;
      if (!SCORE.playing || !ctx || !R) return null;
      if (pracWait()) return pracPosition(R, ctx.currentTime);
      const at = Math.max(R.outputTime ?? 0, audio.audioPresentationTime(ctx, frameTime));
      R.outputTime = at;
      const recent = R.outputHistory;
      return pracPosition(at < R.segs[0].a0 && recent?.length ? { segs: recent } : R, at);
  }
  function scoreVisualTime(frameTime = performance.now()) {
      return scoreVisualPosition(frameTime)?.t ?? FALL.position;
  }
  function fallFrame(frameTime: number, span: number, pps: number) {
      const visual = scoreVisualPosition(frameTime), written = visual?.t ?? FALL.position;
      // A repeat changes written time while the position on the falling-notes stage keeps advancing.
      const position = visual && (visual.s.p0 ?? 0) + (written - visual.s.t0);
      const loop = SCORE.loop;
      if (loop && position !== null && (loop.b - loop.a) * pps >= 1) {
          const plan = performanceTimeline([{ a: loop.a, b: loop.b }]);
          return { written, time: position, ranges: performanceWindow(plan, position, span, true), loop: true };
      }
      if (!loop && !SCORE.sel && !SCORE.resume?.sel) {
          const plan = performancePlan();
          if (plan.ranges.length > 1) {
              const time = position ?? performanceRead().position;
              return { written, time, ranges: performanceWindow(plan, time, span), loop: false };
          }
      }
      return { written, time: written, ranges: [{ a: 0, b: Infinity, offset: 0 }], loop: false };
  }
  function fallLookSync() {
      const look = inputById('fall-look');
      look.value = String(Math.round(FALL_SEC / FALL.zoom * 5) / 5);
      byId('fall-look-v').textContent = Number(look.value).toFixed(1) + ' s';
  }
  function fallMode(mode: string) {
      FALL.mode = mode === 'fall' ? 'fall' : 'score';
      anUpdateControls();
      anLayoutVars();
      if (FALL.mode === 'fall') {
          scoreCursorEl().remove();
          fallDraw();
      }
      else if (SCORE.engine) {
          if (SCORE.stale)
              scoreLayout();
          else
              scorePaint();
          scoreCursorUpdate(true);
      }
      if (SCORE.playing && !SCORE.followRaf)
          scoreFollow();
  }
  function fallReset() { cancelAnimationFrame(FALL.raf); FALL.raf = 0; FALL.position = 0; FALL.particles = []; FALL.flashes = []; FALL.lastT = null; FALL.geo = null; fallDraw(); scoreCursorUpdate(false); anStatusPos(); }
  // Keyboard range: the piece ±2 semitones, whole octaves from C to C, responsive minimum width (4 octaves desktop, 3 tablet, 2 mobile), never beyond the 88 keys.
  function fallRange(W: number) {
      const ns = AN.notes;
      if (!ns.length)
          return (!W || W >= 900) ? [48, 96] : W >= 600 ? [48, 84] : [48, 72];
      let lo = Infinity, hi = -Infinity;
      ns.forEach((n) => { if (n.midi < lo)
          lo = n.midi; if (n.midi > hi)
          hi = n.midi; });
      const mid = (lo + hi) / 2;
      lo = Math.max(21, lo - 2);
      hi = Math.min(108, hi + 2);
      lo -= pc(lo);
      hi += (12 - pc(hi)) % 12;
      const minSpan = (!W || W >= 900) ? 48 : W >= 600 ? 36 : 24;
      while (hi - lo < minSpan) {
          if ((mid - lo <= hi - mid && lo >= 24) || hi + 12 > 108)
              lo -= 12;
          else
              hi += 12;
      }
      return [Math.max(21, lo), hi];
  }
  // Crisp at any devicePixelRatio; animates only while playing (or while a burst fades), otherwise redraws on demand.
  function fallName(n: AnNote) {
      const mode = PRAC.labels;
      if (mode === 'none')
          return '';
      if (mode === 'finger' && anHasFinger())
          return n.finger ? String(n.finger) : '';
      // The saved 'letter' display option follows the app's note-name setting.
      const k = anKeyAt(n.start), sp = spellMidi(n.midi, k.fifths, k.minor), sys = mode === 'solfege' ? 'solfege' : host.i18n.notation();
      return spelledName(sys, sp.li, sp.acc);
  }
  function fallGradients(ctx: CanvasRenderingContext2D, hitY: number) {
      const c = FALL.gradCache;
      if (c && c.ctx === ctx && c.hitY === hitY)
          return c;
      const bg = ctx.createLinearGradient(0, 0, 0, hitY);
      bg.addColorStop(0, '#120f0d');
      bg.addColorStop(.6, '#191512');
      bg.addColorStop(1, '#241e19');
      const hg = ctx.createLinearGradient(0, hitY - 34, 0, hitY);
      hg.addColorStop(0, 'rgba(223,136,118,0)');
      hg.addColorStop(1, 'rgba(223,136,118,.22)');
      const felt = ctx.createLinearGradient(0, hitY, 0, hitY + 4);
      felt.addColorStop(0, '#7a1818');
      felt.addColorStop(.5, '#982121');
      felt.addColorStop(1, '#581010');
      const feltShadow = ctx.createLinearGradient(0, hitY + 4, 0, hitY + 10);
      feltShadow.addColorStop(0, 'rgba(0,0,0,.45)');
      feltShadow.addColorStop(1, 'rgba(0,0,0,0)');
      return (FALL.gradCache = { ctx, hitY, bg, hg, felt, feltShadow });
  }
  function* fallVisibleNotes(ranges: readonly PerformanceRange[], time: number, span: number) {
      const notes = fallData();
      for (const range of ranges) {
          const shift = range.offset - range.a;
          const until = Math.min(range.b, time + span - shift);
          const earliest = Math.max(range.offset > 0 ? range.a : -Infinity, time - shift - (FALL.maxDur ?? 0));
          const first = FALL.sorted ? fallStartIndex(notes, earliest) : 0;
          for (let i = first; i < notes.length; i++) {
              const d = notes[i];
              if (d.start > until || d.start >= range.b) {
                  if (FALL.sorted) break;
                  continue;
              }
              if (d.start < earliest) continue;
              const finish = Math.min(d.finish, range.b) + shift;
              if (finish > time)
                  yield { d, start: d.start + shift, finish, shift };
          }
      }
  }
  function fallDraw(frameTime = performance.now()) {
      cancelAnimationFrame(FALL.raf);
      FALL.raf = 0;
      if (FALL.mode !== 'fall' || !AN.notes.length)
          return;
      const canvas = byId('fall-canvas'), W = canvas.clientWidth, H = canvas.clientHeight;
      if (!W || !H || !(canvas instanceof HTMLCanvasElement))
          return;
      const ctx = canvas.getContext('2d');
      if (!ctx)
          return;
      const dpr = window.devicePixelRatio || 1, bw = Math.round(W * dpr), bh = Math.round(H * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const [lo, hi] = PRAC.range === 'full' ? [21, 108] : fallRange(W);
      let G = FALL.geo;
      if (!G || G.lo !== lo || G.hi !== hi || G.W !== W)
          G = FALL.geo = fallKeys(lo, hi, W);
      const kh = Math.round(Math.min(H * .28, Math.max(76, G.kw * 5.0))), hitY = H - kh, span = FALL_SEC / FALL.zoom, pps = hitY / span;
      G.hitY = hitY;
      G.kh = kh;
      const grads = fallGradients(ctx, hitY);
      const frame = fallFrame(frameTime, span, pps), { time, written } = frame, ranges = [...frame.ranges];
      const fx = PRAC.fx && !reduceMotion(), P = fallPalette(PRAC.pal), solo = PRAC.hands !== 'both';
      const ms = performance.now(), dt = FALL.lastFrame ? Math.min(.05, (ms - FALL.lastFrame) / 1000) : 0;
      FALL.lastFrame = ms;
      // stage: deep gradient, lanes for the pitches this piece uses, brighter guides at every C, bar lines with numbered pills, faint beats
      ctx.fillStyle = grads.bg;
      ctx.fillRect(0, 0, W, hitY);
      ctx.fillStyle = 'rgba(0,0,0,.26)';
      G.keys.forEach((k) => { if (k.black)
          ctx.fillRect(k.x, 0, k.w, hitY); });
      if (FALL.laneSrc !== AN.notes) {
          FALL.laneSrc = AN.notes;
          FALL.lanes = new Set(AN.notes.map((n) => n.midi));
      }
      ctx.fillStyle = 'rgba(140,170,255,.035)';
      FALL.lanes.forEach((m) => { const k = G.keys.get(m); if (k)
          ctx.fillRect(k.x, 0, k.w, hitY); });
      ctx.fillStyle = 'rgba(150,175,235,.17)';
      G.keys.forEach((k, m) => { if (!k.black && pc(m) === 0)
          ctx.fillRect(Math.round(k.x), 0, 1, hitY); });
      const bars: [string, number][] = [];
      const measures = anMeasures();
      for (const range of ranges) {
          const shift = range.offset - range.a, from = Math.max(range.a, time - shift);
          const first = anMeasureIndex(measures, scoreBeatAt(from));
          for (let i = first; i < measures.length; i++) {
              const m = measures[i], s0 = scoreSeconds(m.start);
              if (s0 >= range.b || s0 + shift > time + span)
                  break;
              const u = scoreFeature.harmony.anBeatUnit(m);
              ctx.fillStyle = 'rgba(255,255,255,.05)';
              for (let b = m.start + u; b < m.end - 1e-6; b += u) {
                  const beat = scoreSeconds(b);
                  if (beat >= range.b) break;
                  const y = hitY - (beat + shift - time) * pps;
                  if (beat >= range.a && y > 0 && y < hitY)
                      ctx.fillRect(0, Math.round(y), W, 1);
              }
              const y = Math.round(hitY - (s0 + shift - time) * pps);
              if (s0 >= range.a && y >= 0 && y <= hitY) {
                  ctx.fillStyle = 'rgba(200,212,240,.22)';
                  ctx.fillRect(0, y, W, 1);
                  bars.push([m.number, y]);
              }
          }
      }
      // Highlight the loop and mark the start of each upcoming pass.
      const L = SCORE.loop || (PRAC.A != null && PRAC.B != null ? { a: PRAC.A, b: PRAC.B } : null);
      if (frame.loop) {
          ctx.fillStyle = 'rgba(106,168,255,.08)';
          ctx.fillRect(0, 0, W, hitY);
          ctx.fillStyle = 'rgba(143,184,255,.7)';
          for (const range of ranges) {
              if (range.offset >= time)
                  ctx.fillRect(0, Math.round(hitY - (range.offset - time) * pps) - 1, W, 2);
          }
      }
      else if (L) {
          const ya = hitY - (L.a - time) * pps, yb = hitY - (L.b - time) * pps;
          ctx.fillStyle = 'rgba(106,168,255,.08)';
          const top = Math.max(0, yb), bot = Math.min(hitY, ya);
          if (bot > top)
              ctx.fillRect(0, top, W, bot - top);
          ctx.fillStyle = 'rgba(143,184,255,.7)';
          [ya, yb].forEach((y) => { if (y >= 0 && y <= hitY)
              ctx.fillRect(0, Math.round(y) - 1, W, 2); });
      }
      // notes: rounded bars with a gap above each, so repeated notes stay apart; the practised hand is bright, the other dimmed
      const sel = SCORE.playing && SCORE.sel ? AN.selected : null, active = new Map<number, 'rh' | 'lh'>(), soon = new Map<number, { k: FallKeyRect; c: FallHandColours; a: number; }>();
      let from = FALL.lastT;
      if (from != null && from > time)
          from = SCORE.loop ? SCORE.loop.a - 1e-3 : null; // the loop wrapped around
      FALL.hits = [];
      for (const { d, start, finish, shift } of fallVisibleNotes(ranges, time, span)) {
          if (frame.loop && sel && !sel.has(d.i))
              continue;
          const k = G.keys.get(d.n.midi);
          if (!k)
              continue;
          const current = Math.abs(shift - (time - written)) < 1e-6;
          const hand = scoreFeature.harmony.anHandOf(d.n), c = hand === 'lh' ? P.lh : P.rh, mine = !solo || hand === PRAC.hands, on = current && time >= start - 1e-6 && (!sel || sel.has(d.i));
          if (on) {
              active.set(d.n.midi, hand);
              if (from != null && start > from && fx)
                  fallBurst(k, hitY, c);
          }
          else if (mine && start > time && start - time < .6 && !soon.has(d.n.midi))
              soon.set(d.n.midi, { k, c, a: 1 - (start - time) / .6 });
          const yb = Math.min(hitY, hitY - (start - time) * pps), yt0 = hitY - (finish - time) * pps;
          const gap = Math.min((finish - start) * pps > 10 ? 3 : 1, (yb - yt0) * .3), yt = yt0 + gap;
          if (yb <= 0 || yb - yt < 1)
              continue;
          const pad = k.black ? Math.max(1, k.w * .06) : Math.max(1.5, k.w * .1), x = k.x + pad, w = k.w - 2 * pad, h = yb - yt, r = Math.min(6, w * .32, h / 2);
          ctx.save();
          ctx.globalAlpha = (mine ? 1 : .3) * (.78 + .22 * Math.min(1, (d.n.vel || 96) / 110));
          const g = ctx.createLinearGradient(0, yt, 0, yb);
          g.addColorStop(0, on ? c.lit[0] : c.a);
          g.addColorStop(1, on ? c.lit[1] : c.b);
          if (on && fx) {
              ctx.fillStyle = 'rgba(' + c.rgb + ',.14)';
              fallRR(ctx, x - 5, yt - 5, w + 10, h + 10, r + 5);
              ctx.fill();
              ctx.fillStyle = 'rgba(' + c.rgb + ',.28)';
              fallRR(ctx, x - 2.5, yt - 2.5, w + 5, h + 5, r + 2.5);
              ctx.fill();
          }
          ctx.fillStyle = g;
          fallRR(ctx, x, yt, w, h, r);
          ctx.fill();
          ctx.strokeStyle = on ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.28)';
          ctx.lineWidth = 1;
          fallRR(ctx, x + .5, yt + .5, w - 1, h - 1, Math.max(0, r - .5));
          ctx.stroke();
          const res = current ? PRAC.res.get(d.i) : undefined;
          if (res) {
              ctx.strokeStyle = res === 'hit' ? '#7cf0a8' : '#ff6b5e';
              ctx.lineWidth = 2;
              fallRR(ctx, x - 1, yt - 1, w + 2, h + 2, r + 1);
              ctx.stroke();
          }
          if (AN.selected.has(d.i)) {
              ctx.strokeStyle = FALL_SEL;
              ctx.lineWidth = 2;
              fallRR(ctx, x - 2, yt - 2, w + 4, h + 4, r + 2);
              ctx.stroke();
          }
          const nm = mine ? fallName(d.n) : '';
          if (nm && w >= 11 && h >= 16) {
              const fs = Math.round(Math.min(13, Math.max(9, w * .46)));
              ctx.font = '800 ' + fs + 'px ' + FALL_FONT;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              const ty = yb - Math.max(5, Math.min(8, h * .2));
              if (PRAC.labels === 'finger' && anHasFinger()) {
                  ctx.fillStyle = 'rgba(255,255,255,.85)';
                  ctx.beginPath();
                  ctx.arc(x + w / 2, ty - fs * .36, Math.min(w / 2 - 1, fs * .78), 0, Math.PI * 2);
                  ctx.fill();
              }
              ctx.fillStyle = c.ink;
              ctx.fillText(nm, x + w / 2, ty, w - 2);
          }
          ctx.restore();
          FALL.hits.push({ i: d.i, x, y: yt, w, h, hand });
      }
      FALL.lastT = SCORE.playing ? time : null;
      // bar numbers in pills, readable on any colour
      ctx.font = '700 11px ' + FALL_FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      for (const [num, y] of bars) {
          const tw = Math.max(18, ctx.measureText(num).width + 10), py = Math.max(9, Math.min(hitY - 9, y - 9));
          ctx.fillStyle = 'rgba(16,24,44,.85)';
          fallRR(ctx, 5, py - 8, tw, 16, 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(200,212,240,.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = '#dbe4f8';
          ctx.fillText(num, 5 + tw / 2, py + .5);
      }
      // approaching notes light their lane just above the hit line
      if (fx)
          soon.forEach(({ k, c, a }) => { const lg = ctx.createLinearGradient(0, hitY - 70, 0, hitY); lg.addColorStop(0, 'rgba(' + c.rgb + ',0)'); lg.addColorStop(1, 'rgba(' + c.rgb + ',' + (.28 * Math.max(0, Math.min(1, a))).toFixed(3) + ')'); ctx.fillStyle = lg; ctx.fillRect(k.x, hitY - 70, k.w, 70); });
      // hit line: soft glow band, note-on bursts, the keyboard, then the bright line on top
      ctx.fillStyle = grads.hg;
      ctx.fillRect(0, hitY - 34, W, 34);
      if (FALL.flashes.length || FALL.particles.length)
          fallParticles(ctx, dt);
      const B = PRAC.bar && SCORE.run && written >= PRAC.bar.t - 1e-6 ? PRAC.bar : null, need = B ? [...B.need].filter((m) => !B.got.has(m)) : [];
      fallKeyboard(ctx, G, hitY, kh, W, active, P, need, ms, dpr, grads);
      if (fx) {
          ctx.fillStyle = 'rgba(160,195,255,.22)';
          ctx.fillRect(0, hitY - 7, W, 9);
      }
      ctx.fillStyle = 'rgba(240,246,255,.96)';
      ctx.fillRect(0, hitY - 2, W, 2);
      // wait-for-me prompt, or how to start
      let msg = '';
      if (need.length && B)
          msg = t('pr_waiting', need.slice().sort((a, b) => a - b).map((m) => spellName(m, anKeyAt(B.group[0].n.start), true)).join(' '));
      else if (!SCORE.playing && written <= .01)
          msg = t('sc_press_start');
      if (msg) {
          ctx.font = '700 14px ' + FALL_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const tw = ctx.measureText(msg).width + 28, y = need.length ? hitY - 30 : hitY * .42;
          ctx.fillStyle = need.length ? 'rgba(255,211,107,.95)' : 'rgba(16,24,44,.85)';
          fallRR(ctx, W / 2 - tw / 2, y - 15, tw, 30, 15);
          ctx.fill();
          ctx.fillStyle = need.length ? '#2a1c00' : '#dbe4f8';
          ctx.fillText(msg, W / 2, y + .5);
      }
      if (SCORE.playing || FALL.particles.length || FALL.flashes.length)
          FALL.raf = requestAnimationFrame(fallDraw);
      else
          FALL.lastFrame = 0;
  }
  function fallBurst(k: FallKeyRect, y: number, c: FallHandColours) {
      const x = k.x + k.w / 2;
      FALL.flashes.push({ x, y, w: k.w, rgb: c.rgb, life: .3, max: .3 });
      for (let i = 0; i < 8; i++) {
          const a = -Math.PI / 2 + (Math.random() - .5) * 1.6, v = 70 + Math.random() * 130;
          FALL.particles.push({ x: x + (Math.random() - .5) * k.w * .6, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: .8 + Math.random() * 1.7, life: .35 + Math.random() * .3, max: .65, col: c.lit[0] });
      }
      if (FALL.particles.length > 300)
          FALL.particles.splice(0, FALL.particles.length - 300);
  }
  function fallParticles(ctx: CanvasRenderingContext2D, dt: number) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      FALL.flashes = FALL.flashes.filter((f) => (f.life -= dt) > 0);
      for (const f of FALL.flashes) {
          const a = f.life / f.max, rad = f.w * .8 + 22 * (1 - a), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
          g.addColorStop(0, 'rgba(' + f.rgb + ',' + (.7 * a).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(' + f.rgb + ',0)');
          ctx.fillStyle = g;
          ctx.fillRect(f.x - rad, f.y - rad, rad * 2, rad);
      }
      FALL.particles = FALL.particles.filter((p) => (p.life -= dt) > 0);
      for (const p of FALL.particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 180 * dt;
          ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
          ctx.fillStyle = p.col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
      }
      ctx.restore();
  }
  function fallDrawWhiteKey(ctx: CanvasRenderingContext2D, m: number, k: FallKeyRect, y: number, kh: number, r: number, dark: boolean, lab: boolean, c: string[] | null, isWait: boolean, pulse: number) {
      const dip = c ? 2.5 : 0, x = k.x + .5, w = k.w - 1, h = kh - 3 - dip, g = ctx.createLinearGradient(0, y + dip, 0, y + dip + h);
      if (c) {
          if (c === FALL_YOU) {
              g.addColorStop(0, '#fff8e2');
              g.addColorStop(.35, '#fde492');
              g.addColorStop(.78, '#f4c450');
              g.addColorStop(1, '#df9f20');
          }
          else {
              g.addColorStop(0, c[0]);
              g.addColorStop(1, c[1]);
          }
      }
      else {
          g.addColorStop(0, '#fefae8');
          g.addColorStop(.75, '#fdf6df');
          g.addColorStop(1, '#f8efcf');
      }
      ctx.fillStyle = g;
      fallKeyPath(ctx, x, y + dip, w, h, r);
      ctx.fill();
      if (c === FALL_YOU) {
          ctx.strokeStyle = '#cca02d';
          ctx.lineWidth = 1;
          fallKeyPath(ctx, x, y + dip, w, h, r);
          ctx.stroke();
      }
      if (isWait) {
          ctx.fillStyle = 'rgba(255,196,64,' + (.35 + .4 * pulse).toFixed(3) + ')';
          fallKeyPath(ctx, x, y + dip, w, h, r);
          ctx.fill();
      }
      if (w > 4) {
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.fillRect(x, y + dip, 1, Math.max(0, h - r));
          ctx.fillStyle = 'rgba(0,0,0,.07)';
          ctx.fillRect(x + w - 1, y + dip, 1, Math.max(0, h - r));
      }
      const lip = ctx.createLinearGradient(0, y + dip + h - 5, 0, y + dip + h);
      lip.addColorStop(0, 'rgba(0,0,0,0)');
      lip.addColorStop(1, 'rgba(165,145,105,.22)');
      ctx.fillStyle = lip;
      ctx.fillRect(x + 1, y + dip + h - 5, Math.max(0, w - 2), 5);
      if (lab && (pc(m) === 0 || shell.labelMode() === 'all') && k.w >= 14) {
          const nm = noteName(m, false);
          ctx.font = '700 ' + Math.round(Math.min(11, Math.max(8, k.w * .3))) + 'px ' + FALL_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = c ? (dark ? '#3a2402' : '#523502') : (dark ? '#645b4c' : '#8c816f');
          ctx.fillText(pc(m) === 0 ? nm : nm.replace(/-?\d+$/, ''), x + w / 2, y + dip + h - 7, w - 2);
      }
  }
  function fallIdleKeyboardCanvas(G: FallGeo, kh: number, W: number, dpr: number, dark: boolean, lab: boolean): HTMLCanvasElement | null {
      const key = [W, kh, G.lo, G.hi, dpr, dark ? 1 : 0, shell.labelMode(), host.i18n.notation()].join('|');
      const cached = FALL.kbCache;
      if (cached && cached.key === key)
          return cached.canvas;
      const canvas = cached?.canvas ?? document.createElement('canvas');
      const bw = Math.round(W * dpr), bh = Math.round(kh * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
      }
      const kctx = canvas.getContext('2d');
      if (!kctx)
          return null;
      kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      kctx.fillStyle = dark ? '#0a0908' : '#1d1915';
      kctx.fillRect(0, 0, W, kh);
      const r = Math.min(5, G.kw * .14);
      for (const m of G.whites) {
          const k = G.keys.get(m);
          if (k)
              fallDrawWhiteKey(kctx, m, k, 0, kh, r, dark, lab, null, false, 0);
      }
      for (const [m, k] of G.keys) {
          if (!k.black)
              continue;
          const bhKey = Math.round(kh * .66), br = Math.min(3, k.w * .15);
          fallDrawBlackKey(kctx, k.x, 0, k.w, bhKey, br, null, false, 0);
      }
      FALL.kbCache = { canvas, key };
      return canvas;
  }
  // Realistic keys: warm ivory white keys with crisp seams, 3D lacquered black keys matching the main dock; pressed keys light up and dip.
  // Keys you hold yourself show in gold; keys "Wait for me" is waiting for pulse.
  function fallKeyboard(ctx: CanvasRenderingContext2D, G: FallGeo, y: number, kh: number, W: number, active: Map<number, 'rh' | 'lh'>, P: FallPalette, need: number[], ms: number, dpr: number, grads: ReturnType<typeof fallGradients>) {
      P = P || FALL_COL;
      const mineHeld = new Set(shell.held.keys ? shell.held.keys() : shell.held), pulse = .55 + .45 * Math.sin((ms || 0) / 170), wait = new Set(need || []);
      const tint = (m: number) => { const h = active.get(m); if (h)
          return P[h].key; if (mineHeld.has(m))
          return FALL_YOU; return null; };
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const r = Math.min(5, G.kw * .14), lab = shell.labelMode() !== 'none';
      const idleCanvas = fallIdleKeyboardCanvas(G, kh, W, dpr, dark, lab);
      if (idleCanvas) {
          ctx.drawImage(idleCanvas, 0, 0, idleCanvas.width, idleCanvas.height, 0, y, W, kh);
          const redrawWhites = new Set<number>(), redrawBlacks = new Set<number>();
          for (const m of G.whites) {
              if (tint(m) || wait.has(m))
                  redrawWhites.add(m);
          }
          for (const [m, k] of G.keys) {
              if (!k.black || (!tint(m) && !wait.has(m)))
                  continue;
              redrawBlacks.add(m);
              if (G.keys.get(m - 1)?.black === false)
                  redrawWhites.add(m - 1);
              if (G.keys.get(m + 1)?.black === false)
                  redrawWhites.add(m + 1);
          }
          for (const w of redrawWhites) {
              if (G.keys.get(w - 1)?.black)
                  redrawBlacks.add(w - 1);
              if (G.keys.get(w + 1)?.black)
                  redrawBlacks.add(w + 1);
          }
          if (redrawWhites.size) {
              ctx.fillStyle = dark ? '#0a0908' : '#1d1915';
              for (const m of redrawWhites) {
                  const k = G.keys.get(m);
                  if (k)
                      ctx.fillRect(k.x, y, k.w, kh);
              }
              for (const m of redrawWhites) {
                  const k = G.keys.get(m);
                  if (k)
                      fallDrawWhiteKey(ctx, m, k, y, kh, r, dark, lab, tint(m), wait.has(m), pulse);
              }
          }
          if (redrawBlacks.size) {
              const blacks = [...redrawBlacks].sort((a, b) => a - b);
              for (const m of blacks) {
                  const k = G.keys.get(m);
                  if (!k)
                      continue;
                  const c = tint(m), dip = c ? 2.5 : 0, bh = Math.round(kh * .66) - dip, br = Math.min(3, k.w * .15);
                  fallDrawBlackKey(ctx, k.x, y + dip, k.w, bh, br, c, wait.has(m), pulse);
              }
          }
      }
      else {
          ctx.fillStyle = dark ? '#0a0908' : '#1d1915';
          ctx.fillRect(0, y, W, kh);
          for (const m of G.whites) {
              const k = G.keys.get(m);
              if (k)
                  fallDrawWhiteKey(ctx, m, k, y, kh, r, dark, lab, tint(m), wait.has(m), pulse);
          }
          for (const [m, k] of G.keys) {
              if (!k.black)
                  continue;
              const c = tint(m), dip = c ? 2.5 : 0, bh = Math.round(kh * .66) - dip, br = Math.min(3, k.w * .15);
              fallDrawBlackKey(ctx, k.x, y + dip, k.w, bh, br, c, wait.has(m), pulse);
          }
      }
      ctx.fillStyle = grads.felt;
      ctx.fillRect(0, y, W, 4);
      ctx.fillStyle = grads.feltShadow;
      ctx.fillRect(0, y + 4, W, 6);
  }
  // Timeline under the stage: clock, bar ticks, loop region, A/B markers, seek slider and the current bar.
  function anTlUpdate(time?: number | null) {
      const tl = byId('an-tl');
      if (!tl || tl.hidden || !AN.notes.length)
          return;
      const written = time != null ? time : fallTime(), display = performanceDisplay(), expanded = !SCORE.loop && !SCORE.sel;
      const plan = performancePlan(), end = expanded ? plan.duration : fallEnd(), pos = expanded ? display.position : written;
      const seek = inputById('fall-seek');
      const pct = (x: number, digits = 3) => (end > 0 ? Math.max(0, Math.min(1, x / end)) * 100 : 0).toFixed(digits) + '%';
      const coordinate = (x: number, near = pos) => expanded ? performanceOf(plan, x, near, true) : x;
      const mx = String(Math.max(.1, end));
      if (seek.max !== mx)
          seek.max = mx;
      const cache = FALL.tlCache ?? (FALL.tlCache = {});
      const pStr = pct(pos, SCORE.playing ? 1 : 3);
      const pChanged = cache.p !== pStr;
      if (pChanged) {
          seek.style.setProperty('--p', pStr);
          cache.p = pStr;
      }
      const posStr = String(pos);
      if ((!SCORE.playing || pChanged) && (document.activeElement !== seek || SCORE.playing) && seek.value !== posStr)
          seek.value = posStr;
      const valText = t('fall_valtext', anClock(display.elapsed), anClock(display.total));
      if (cache.valText !== valText) {
          seek.setAttribute('aria-valuetext', valText);
          cache.valText = valText;
      }
      const set = (id: string, v: string) => { const el = byId(id); if (el.textContent !== v)
          el.textContent = v; };
      set('fall-clock', anClock(display.elapsed));
      set('fall-total', anClock(display.total));
      const ms = anMeasures(), m = anMeasureAt(scoreBeatAt(written));
      set('tl-bar', m && ms.length ? t('tl_bar', m.number, ms[ms.length - 1].number) : '');
      if (FALL.tickSrc !== fallData() || FALL.tickTempo !== SCORE.tempoList || FALL.tickEnd !== end || FALL.tickExpanded !== expanded) {
          FALL.tickExpanded = expanded;
          FALL.tickSrc = fallData();
          FALL.tickTempo = SCORE.tempoList;
          FALL.tickEnd = end;
          const step = ms.length > 240 ? 8 : ms.length > 120 ? 4 : ms.length > 60 ? 2 : 1, major = ms.length > 60 ? Math.max(8, step * 4) : 4;
          const markers = performanceMarkers(expanded ? plan : performanceTimeline([{ a: 0, b: end }]),
              ms.flatMap((x, i) => i % step ? [] : [{ time: scoreSeconds(x.start), major: i % major === 0 }]));
          const stride = Math.max(1, Math.ceil(markers.length / 240));
          byId('tl-ticks').innerHTML = markers.filter((_, i) => i % stride === 0).map(mark => `<i${mark.major ? ' class="is-major"' : ''} style="left:${pct(mark.position)}"></i>`).join('');
      }
      const L = SCORE.loop, lp = byId('tl-loop'), A = PRAC.A, B = PRAC.B, la = L ? L.a : A != null && B != null ? A : null, lb = L ? L.b : A != null && B != null ? B : null;
      const loopHidden = la == null;
      if (cache.loopHidden !== loopHidden) {
          lp.hidden = loopHidden;
          cache.loopHidden = loopHidden;
      }
      if (la != null && lb != null) {
          const start = coordinate(la), finish = coordinate(lb, start + lb - la);
          const loopLeft = pct(start), loopWidth = (end > 0 ? Math.max(0, finish - start) / end * 100 : 0).toFixed(3) + '%';
          if (cache.loopLeft !== loopLeft) {
              lp.style.left = loopLeft;
              cache.loopLeft = loopLeft;
          }
          if (cache.loopWidth !== loopWidth) {
              lp.style.width = loopWidth;
              cache.loopWidth = loopWidth;
          }
      }
      const aEl = byId('tl-a'), aHidden = A == null;
      if (cache.aHidden !== aHidden) {
          aEl.hidden = aHidden;
          cache.aHidden = aHidden;
      }
      if (A != null) {
          const aLeft = pct(coordinate(A));
          if (cache.aLeft !== aLeft) {
              aEl.style.left = aLeft;
              cache.aLeft = aLeft;
          }
      }
      const bEl = byId('tl-b'), bHidden = B == null;
      if (cache.bHidden !== bHidden) {
          bEl.hidden = bHidden;
          cache.bHidden = bHidden;
      }
      if (B != null) {
          const bLeft = pct(coordinate(B, A != null ? coordinate(A) + B - A : pos));
          if (cache.bLeft !== bLeft) {
              bEl.style.left = bLeft;
              cache.bLeft = bLeft;
          }
      }
  }
  // Seeking pauses while the slider moves and resumes on release if it was playing.
  function fallSeek() { const pos = +inputById('fall-seek').value, expanded = !SCORE.loop && !SCORE.sel; if (SCORE.playing) {
      FALL.resume = SCORE.loop ? null : { sel: SCORE.sel };
      scoreHalt();
  } SCORE.resume = null; if (expanded) performanceSeek(pos); else { FALL.position = pos; performanceSeekScore(pos); } scoreIdle(); }
  function fallSeekEnd() { const r = FALL.resume; FALL.resume = null; if (r)
      scorePlay(r.sel, FALL.position); }
  function fallHit(e: MouseEvent) { if (!(e.currentTarget instanceof Element))
      return undefined; const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return [...FALL.hits].reverse().find((h) => x >= h.x - 2 && x <= h.x + h.w + 2 && y >= h.y && y <= h.y + h.h); }
  // The integrated keyboard is playable by mouse or touch.
  function fallKeyAt(e: MouseEvent) {
      const G = FALL.geo;
      if (!G || !G.hitY || G.kh == null || !(e.currentTarget instanceof Element))
          return null;
      const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (y < G.hitY)
          return null;
      const bh = G.hitY + Math.round(G.kh * .66);
      if (y <= bh)
          for (const [m, k] of G.keys)
              if (k.black && x >= k.x && x <= k.x + k.w)
                  return m;
      for (const m of G.whites) {
          const k = G.keys.get(m);
          if (k && x >= k.x && x < k.x + k.w)
              return m;
      }
      return null;
  }
  function fallKeyDown(e: PointerEvent) {
      const m = fallKeyAt(e);
      if (m == null)
          return;
      e.preventDefault();
      ensureAudio();
      FALL.press = FALL.press || new Map();
      FALL.press.set(e.pointerId, m);
      try {
          if (e.currentTarget instanceof Element)
              e.currentTarget.setPointerCapture(e.pointerId);
      }
      catch (_) { }
      touchInput(e, () => handleNoteOn(m, 96, 'fall:' + e.pointerId));
      if (!FALL.raf)
          fallDraw();
  }
  function fallKeyUp(e: PointerEvent) { const P = FALL.press, m = P && P.get(e.pointerId); if (!P || m == null)
      return; P.delete(e.pointerId); touchInput(e, () => handleNoteOff(m, 'fall:' + e.pointerId)); if (!FALL.raf)
      fallDraw(); }
  function fallSelect(e: MouseEvent) {
      if (fallKeyAt(e) != null)
          return;
      const hit = fallHit(e), add = e.shiftKey || e.ctrlKey || e.metaKey;
      if (!hit) {
          if (!add)
              anClearSelection();
          return;
      }
      if (!add)
          AN.selected.clear();
      if (AN.selected.has(hit.i))
          AN.selected.delete(hit.i);
      else
          AN.selected.add(hit.i);
      anSelectionChanged();
  }
  function fallHover(e: PointerEvent) { if (e.currentTarget instanceof HTMLElement)
      e.currentTarget.style.cursor = fallHit(e) || fallKeyAt(e) != null ? 'pointer' : ''; }
  /* wiring */
  // Score shortcuts, only in this view and never while typing or choosing in a form field:
  // Space play/pause, Home go to start, Esc close the settings or clear the selection, + / − zoom.
  function anShortcut(e: KeyboardEvent) {
      if (view0() !== 'analysis' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'Escape' && inField()) || byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on'))
          return;
      const k = e.key;
      if (k === 'Escape') {
          if (!byId('pr-sum').hidden) {
              e.preventDefault();
              pracSumClose();
              return;
          }
          for (const [p, b] of AN_POPS)
              if (!byId(p).hidden) {
                  e.preventDefault();
                  anPop(p, false);
                  byId(b).focus();
                  return;
              }
          if (byId('tb-prac').classList.contains('is-prac-open')) {
              e.stopPropagation();
              e.preventDefault();
              anPracPopSet(false, true);
              return;
          }
          if (!byId('an-recon').hidden) {
              e.preventDefault();
              anReconOpen(false);
              byId('an-recon-btn').focus();
              return;
          }
          if (SIDE.sheet) {
              e.preventDefault();
              anSheet(false);
              return;
          }
          if (shell.scoreFocus.owner === 'analysis' || PC_STAGE.on) {
              e.preventDefault();
              if (shell.scoreFocus.owner) scoreFocusExit(); else pcStageSet(false);
              byId('sc-stage').focus({ preventScroll: true });
              return;
          }
          if (anClearSelection())
              e.preventDefault();
          return;
      }
      if (!AN.notes.length || AN.loading || e.repeat)
          return;
      if (k === ' ') {
          if (eventElement(e)?.closest('button,a[href],summary,[role="button"],input,select,textarea'))
              return;
          e.preventDefault();
          scoreToggle();
          return;
      }
      if (k === 'Home') {
          e.preventDefault();
          scoreHome();
          return;
      }
      if (k === '+' || k === '=') {
          e.preventDefault();
          scoreZoom(anZoomNow() + 0.1);
          return;
      }
      if (k === '-' || k === '_') {
          e.preventDefault();
          scoreZoom(anZoomNow() - 0.1);
          return;
      }
      if (k === 'End') {
          e.preventDefault();
          scoreSeekTo(fallEnd());
          return;
      }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
          if (eventElement(e)?.closest('[data-i],.an-ch,input,select'))
              return;
          e.preventDefault();
          scoreSeekBar(k === 'ArrowRight' ? 1 : -1);
          return;
      }
      const K = k.length === 1 ? k.toLowerCase() : k;
      if (K === 'l') {
          e.preventDefault();
          byId('an-loop').click();
          return;
      }
      if (K === '[') {
          e.preventDefault();
          pracSetAB('A');
          return;
      }
      if (K === ']') {
          e.preventDefault();
          pracSetAB('B');
          return;
      }
      if (K === 'p') {
          e.preventDefault();
          if (!PRAC.metroOnly)
              pracSet('wait', !PRAC.wait);
          return;
      }
      if (K === 'm') {
          e.preventDefault();
          if (!PRAC.metroOnly)
              pracSet('metro', !PRAC.metro);
          return;
      }
      if (K === 'c') {
          e.preventDefault();
          PRAC.countIn = !PRAC.countIn;
          inputById('pr-countin').checked = PRAC.countIn;
          pracSave();
          return;
      }
      if (k === '1' || k === '2' || k === '3') {
          e.preventDefault();
          pracSet('hands', ['both', 'rh', 'lh'][+k - 1]);
      }
  }
  // Seek to a time (keeps playing if it was playing) and step bar by bar.
  function scoreSeekTo(x: number) {
      x = Math.max(0, Math.min(fallEnd(), x));
      if (SCORE.playing && !SCORE.loop) {
          scorePlay(SCORE.sel, x);
          return;
      }
      if (SCORE.playing)
          scoreHalt();
      SCORE.resume = null;
      SCORE.paused = false;
      FALL.position = x;
      scoreIdle();
  }
  function scoreSeekBar(d: number) {
      const ms = anMeasures();
      if (!ms.length)
          return;
      const now = SCORE.playing ? fallTime() : FALL.position, beat = scoreBeatAt(now);
      let i = ms.findIndex((m) => beat < m.end - 1e-6);
      if (i < 0)
          i = ms.length - 1;
      if (d < 0 && beat - ms[i].start > .5 && !(SCORE.playing && scoreSeconds(beat) - scoreSeconds(ms[i].start) > .6))
          d = 0; // first press goes back to this bar's start
      i = Math.max(0, Math.min(ms.length - 1, i + d));
      scoreSeekTo(scoreSeconds(ms[i].start));
  }
  function anPracPopSet(open: boolean, focusBack = false) {
      const btn = byId('an-prac-btn'), prac = byId('tb-prac');
      if (open) {
          AN_POPS.forEach(([p]) => anPop(p, false));
          anReconOpen(false);
      }
      prac.classList.toggle('is-prac-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
          const first = queryHtml(prac, 'button,select,input');
          first?.focus({ preventScroll: true });
      } else if (focusBack) {
          btn.focus({ preventScroll: true });
      }
  }
  function anPop(id: string, open: boolean) {
      const pair = AN_POPS.find((x) => x[0] === id) || [id, id];
      const p = byId(id), b = byId(pair[1]);
      open = !!open && !b.hidden;
      if (open) {
          AN_POPS.forEach(([q] = []) => { if (q !== id)
              anPop(q, false); });
          anPracPopSet(false);
          anReconOpen(false);
      }
      p.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && id !== 'an-keys-pop') {
          const host = p.offsetParent || p.parentElement || p, hr = host.getBoundingClientRect(), br = b.getBoundingClientRect(), w = p.offsetWidth;
          p.style.left = Math.max(8, Math.min(hr.width - w - 8, br.left - hr.left + br.width / 2 - w / 2)) + 'px';
          p.style.right = 'auto';
      }
      if (open) {
          const f = queryHtml(p, 'input,select,button');
          if (f)
              f.focus({ preventScroll: true });
      }
  }
  // The score keeps its engraving while the viewport changes size, unless the page no longer fits (or could be wider again).
  function anStageFit() {
      if (view0() !== 'analysis' || SIDE.drag)
          return;
      if (FALL.mode === 'fall') {
          fallDraw();
          return;
      }
      if (!scoreLayoutExplicit) {
          const want = defaultScoreLayoutForViewport(window.innerWidth);
          if (want !== SCORE.layout) {
              SCORE.layout = want;
              byId('an-roll').dataset.layout = want;
              SCORE.stale = !!SCORE.engine;
              if (SCORE.engine)
                  scoreLayout();
              anUpdateControls();
              return;
          }
      }
      const box = byId('an-roll'), sheet = queryHtml(box, '.an-sheet');
      if (!SCORE.engine || !box.clientWidth || !sheet)
          return;
      if (SCORE.layout === 'cont') {
          if (Math.abs(box.clientWidth - SCORE.layoutWidth) > 40)
              scoreLayout();
          return;
      }
      const cs = getComputedStyle(box), avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const wantW = SCORE.layout === 'fit' ? Math.max(260, Math.floor(avail)) : Math.max(240, Math.round(Math.min(SC_PAGE_W * SCORE.zoom, avail)));
      if (Math.abs(sheet.offsetWidth - wantW) > 2)
          scoreLayout();
  }
  // The panel's left edge resizes it: drag, or arrow keys on the focused separator (Home / End for the narrowest / widest).
  function anSideResizer() {
      const h = byId('an-side-resize'), work = byId('an-work'), MIN = 280, MAX = 560;
      const apply = (w: number, save: boolean) => { SIDE.w = Math.round(Math.max(MIN, Math.min(MAX, work.clientWidth * .5, w))); work.style.setProperty('--an-side-w', SIDE.w + 'px'); h.setAttribute('aria-valuenow', String(SIDE.w)); if (save) {
          saveAll();
          anStageFit();
      } };
      h.addEventListener('pointerdown', (e) => {
          if (e.button !== 0)
              return;
          e.preventDefault();
          h.setPointerCapture(e.pointerId);
          SIDE.drag = true;
          h.classList.add('is-drag');
          const right = work.getBoundingClientRect().right, move = (ev: PointerEvent) => apply(right - ev.clientX, false);
          const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); SIDE.drag = false; h.classList.remove('is-drag'); apply(SIDE.w, true); };
          h.addEventListener('pointermove', move);
          h.addEventListener('pointerup', up);
          h.addEventListener('pointercancel', up);
      });
      h.addEventListener('keydown', (e) => {
          const d = e.key === 'ArrowLeft' ? 16 : e.key === 'ArrowRight' ? -16 : undefined;
          if (d) {
              e.preventDefault();
              apply(SIDE.w + d, true);
          }
          else if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              apply(e.key === 'Home' ? MIN : MAX, true);
          }
      });
  }
  function anInitControls() {
      anLibraryInit();
      byId('an-file').addEventListener('change', (e) => { if (!(e.target instanceof HTMLInputElement) || !e.target.files)
          return; const f = e.target.files[0]; e.target.value = ''; if (f)
          anOpenFile(f); });
      byId('view-analysis').addEventListener('click', (e) => { const el = eventElement(e); if (!el)
          return; if (el.closest('[data-an-open]')) {
          byId('an-file').click();
          return;
      } });
      byId('an-back').addEventListener('click', () => { anExitToCatalog(false); });
      maybeById('an-continue-btn')?.addEventListener('click', () => {
          if (!anContinueTarget) return;
          anCaptureListContext('#an-continue-btn');
          if (anContinueTarget.kind === 'lib')
              void anOpenRoute({ kind: 'lib', id: anContinueTarget.id });
          else
              void anLoadExample(anContinueTarget.id, { speed: anContinueTarget.speed, measure: anContinueTarget.measure });
      });
      maybeById('an-cat-tabs')?.addEventListener('click', (e) => {
          const b = eventClosest(e, '[role=tab]');
          const tab = b?.dataset.catTab;
          if (tab === 'library' || tab === 'builtin')
              anSetCatalogTab(tab, true, false);
      });
      maybeById('an-cat-tabs')?.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
          e.preventDefault();
          const next: AnCatalogTab = e.key === 'Home' ? 'library' : e.key === 'End' ? 'builtin' : (anCatalogTab === 'library' ? 'builtin' : 'library');
          anSetCatalogTab(next, true, true);
      });
      anRenderContinueCard();
      byId('pc-list').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-piece]'); if (b instanceof HTMLButtonElement && !b.disabled && b.dataset.piece) {
          anCaptureListContext(`#pc-list .pc-item[data-piece="${CSS.escape(b.dataset.piece)}"]`);
          void anLoadExample(b.dataset.piece);
      } });
      pcRender();
      ['an-hands', 'an-grid', 'an-keysel'].forEach((id) => byId(id).addEventListener('change', anReconChange));
      byId('an-recon-btn').addEventListener('click', () => {
          anReconOpen(!!byId('an-recon').hidden);
          AN_POPS.forEach(([p] = []) => anPop(p, false));
          anPracPopSet(false);
      });
      document.addEventListener('pointerdown', (e) => {
          const el = eventElement(e);
          if (!el)
              return;
          if (!byId('an-recon').hidden && !el.closest('#an-recon,#an-recon-btn'))
              anReconOpen(false);
          if (byId('tb-prac').classList.contains('is-prac-open') && !el.closest('#tb-prac,#an-prac-btn'))
              anPracPopSet(false);
          AN_POPS.forEach(([p, b] = []) => { if (!byId(p).hidden && !el.closest('#' + p + ',#' + b))
              anPop(p, false); });
      });
      AN_POPS.forEach(([p, b] = []) => byId(b).addEventListener('click', () => anPop(p, !!byId(p).hidden)));
      pracLoad();
      const ck = { 'pr-metro-only': 'metroOnly', 'pr-countin': 'countIn', 'pr-acc': 'acc', 'pr-hear': 'hear', 'pr-expressive': 'expressive', 'pr-ramp': 'ramp', 'fall-fx': 'fx' } as const;
      Object.entries(ck).forEach(([id, k]) => { inputById(id).checked = PRAC[k]; inputById(id).addEventListener('change', (e) => { if (e.target instanceof HTMLInputElement)
          pracSet(k, e.target.checked); }); });
      ([['fall-labels', 'labels'], ['fall-pal', 'pal'], ['fall-range', 'range']] as const).forEach(([id, k]) => { selectById(id).value = PRAC[k]; selectById(id).addEventListener('change', (e) => { if (e.target instanceof HTMLSelectElement)
          pracSet(k, e.target.value); }); });
      const look = inputById('fall-look');
      fallLookSync();
      look.addEventListener('input', () => { FALL.zoom = FALL_SEC / +look.value; fallLookSync(); pracSave(); anUpdateControls(); fallDraw(); });
      byId('pr-hands').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-h]'); if (b && b.dataset.h != null)
          pracSet('hands', b.dataset.h); });
      byId('pr-wait').addEventListener('click', () => pracSet('wait', !PRAC.wait));
      byId('an-metro').addEventListener('click', () => pracSet('metro', !PRAC.metro));
      byId('pr-seta').addEventListener('click', () => pracSetAB('A'));
      byId('pr-setb').addEventListener('click', () => pracSetAB('B'));
      byId('pr-clrab').addEventListener('click', pracClearAB);
      byId('pr-again').addEventListener('click', pracReplay);
      byId('pr-slower').addEventListener('click', () => { const sel = selectById('score-speed'), o = [...sel.options].map((x) => +x.value), cur = +sel.value, v = o.filter((x) => x < cur).pop(); if (v)
          sel.value = String(v); pracHud(); pracReplay(); });
      byId('pr-close').addEventListener('click', pracSumClose);
      byId('pr-see-mistakes').addEventListener('click', () => {
          const panel = byId('pr-mistakes-panel'), btn = byId('pr-see-mistakes');
          const nextOpen = panel.hidden;
          panel.hidden = !nextOpen;
          btn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      });
      byId('pr-mistakes-list').addEventListener('click', (e) => {
          const list = PRAC.lastMistakes || [];
          const multiPass = new Set(list.map((g) => g.pass)).size > 1;
          const jumpBtn = eventClosest(e, 'button[data-mistake-jump]');
          if (jumpBtn instanceof HTMLButtonElement && jumpBtn.dataset.mistakeJump != null) {
              const g = list[Number(jumpBtn.dataset.mistakeJump)];
              if (g) anJumpToMistake(g, multiPass);
              return;
          }
          const repBtn = eventClosest(e, 'button[data-mistake-repeat]');
          if (repBtn instanceof HTMLButtonElement && repBtn.dataset.mistakeRepeat != null) {
              const g = list[Number(repBtn.dataset.mistakeRepeat)];
              if (g) anRepeatPassage(g.measureIndex);
          }
      });
      byId('sc-mistake-repeat').addEventListener('click', () => {
          if (scMistakeBarIdx != null) anRepeatPassage(scMistakeBarIdx);
      });
      byId('sc-mistake-close').addEventListener('click', anHideMistakeBar);
      byId('pr-sum-next').addEventListener('click', (e) => { if (eventClosest(e, '#pr-next-act') && PRAC.next && PRAC.next.act)
          PRAC.next.act.run(); });
      byId('pr-sum').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget)
          pracSumClose(); });
      byId('an-sel-mode').addEventListener('click', () => { cancelScoreGesture?.(); AN.selMode = AN.selMode === 'lasso' ? 'box' : 'lasso'; anUpdateControls(); });
      byId('an-clear').addEventListener('click', anClearSelection);
      byId('an-play').addEventListener('click', () => scorePlay(true));
      byId('an-loop').addEventListener('click', () => { if (SCORE.loop)
          scoreStop();
      else
          scoreLoopStart(); });
      byId('score-play').addEventListener('click', scoreToggle);
      byId('score-stop').addEventListener('click', scoreStop);
      byId('sc-start').addEventListener('click', scoreHome);
      const speed = () => { pracHud(); anUpdateControls(); if (!SCORE.playing) {
          anStatusPos(); return; } if (SCORE.loop)
          scoreLoopStart();
      else
          scorePlay(SCORE.sel, fallTime()); };
      byId('score-speed').addEventListener('change', speed);
      const stepSpeed = (dir: -1 | 1) => {
          const sel = selectById('score-speed');
          const opts = [...sel.options].map((o) => +o.value);
          const idx = opts.indexOf(+(sel.value || 100));
          const next = opts[idx + dir];
          if (next != null) { sel.value = String(next); speed(); }
      };
      byId('sc-speed-down').addEventListener('click', () => stepSpeed(-1));
      byId('sc-speed-up').addEventListener('click', () => stepSpeed(1));
      byId('sc-speed-reset').addEventListener('click', () => {
          const sel = selectById('score-speed');
          if (sel.value !== '100') { sel.value = '100'; speed(); }
      });
      byId('an-study-mode').addEventListener('click', (e) => {
          const b = eventClosest(e, 'button[data-study]');
          if (!b || !b.dataset.study) return;
          pracSet('wait', b.dataset.study === 'practice');
      });
      queryAllHtml(document, '[data-score-mode]').forEach((b) => b.addEventListener('click', () => { if (!(b instanceof HTMLButtonElement && b.disabled)) {
          scoreLayoutExplicit = true;
          scoreSetView(b.dataset.scoreMode);
      } }));
      byId('sc-zoom-out').addEventListener('click', () => { cancelScoreGesture?.(); scoreZoom(anZoomNow() - 0.1); });
      byId('sc-zoom-in').addEventListener('click', () => { cancelScoreGesture?.(); scoreZoom(anZoomNow() + 0.1); });
      byId('sc-zoom-reset').addEventListener('click', () => { cancelScoreGesture?.(); scoreZoom(1); });
      byId('sc-look').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b instanceof HTMLButtonElement && !b.disabled && b.dataset.v != null)
          scoreSetLook(b.dataset.v); });
      byId('sc-hl').addEventListener('click', () => scoreSetHl(!SCORE.hl));
      byId('sc-names').addEventListener('click', () => pracSet('names', !PRAC.names));
      byId('sc-stage').addEventListener('click', () => scoreFocusToggle('analysis', byId('sc-stage')));
      byId('an-fs-exit').addEventListener('click', () => scoreFocusToggle('analysis', byId('sc-stage')));
      byId('an-kb').addEventListener('click', () => dockSet(!dockOpen()));
      const seek = byId('fall-seek');
      seek.addEventListener('input', fallSeek);
      seek.addEventListener('change', fallSeekEnd);
      const fc = byId('fall-canvas');
      fc.addEventListener('click', fallSelect);
      fc.addEventListener('pointermove', fallHover);
      fc.addEventListener('pointerdown', fallKeyDown);
      (['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const).forEach((ev) => fc.addEventListener(ev, fallKeyUp));
      const roll = byId('an-roll');
      roll.addEventListener('pointerenter', (e) => { roll.classList.toggle('is-pen', e.pointerType === 'pen'); });
      roll.addEventListener('pointerdown', (e) => { if (e.button === 0) blurInputField(); });
      for (const tool of ['hand', 'select'] as const) byId('an-tool-' + tool).addEventListener('click', () => {
          cancelScoreGesture?.();
          AN.tool = tool;
          anUpdateControls();
      });
      roll.addEventListener('pointerover', anHover);
      roll.addEventListener('pointerleave', () => { byId('an-hover').textContent = ''; scoreTip(null); });
      let hoverRaf = 0, hoverEv: PointerEvent|null = null;
      roll.addEventListener('pointermove', (e) => { if (e.buttons)
          return; hoverEv = e; if (!hoverRaf)
          hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (hoverEv)
              anHover(hoverEv); }); });
      roll.addEventListener('focusin', anHover);
      roll.addEventListener('keydown', (e) => {
          const g = eventElement(e)?.closest('[data-i]');
          if (!anIsDataEl(g))
              return;
          if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const i = Number(g.dataset.i), add = e.shiftKey || e.ctrlKey || e.metaKey;
              if (!add)
                  AN.selected.clear();
              if (add && AN.selected.has(i))
                  AN.selected.delete(i);
              else
                  AN.selected.add(i);
              anSelectionChanged();
              return;
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              const d = e.key === 'ArrowRight' ? 1 : -1;
              for (let j = Number(g.dataset.i) + d; j >= 0 && j < AN.notes.length; j += d) {
                  const n = (SCORE.heads.get(j) || [])[0];
                  if (anIsDataEl(n)) {
                      e.preventDefault();
                      anRove(n);
                      n.focus();
                      anKeepVisible(n, false);
                      break;
                  }
              }
          }
      });
      document.addEventListener('keydown', anShortcut);
      // analysis panel: a chord (in Now or Piece) selects its notes and its bar and moves the cursor there
      const side = byId('an-side'), ws = byId('an-ws');
      side.addEventListener('click', (e) => {
          const ll = eventClosest(e, 'button.an-learn-link[data-learn]');
          if (ll instanceof HTMLButtonElement) {
              e.stopPropagation();
              const id = ll.dataset.learn;
              if (id)
                  learnGoId(id);
              return;
          }
          const nb = eventClosest(e, '.an-nb-btn[data-nb-idx]');
          if (nb instanceof HTMLButtonElement && AN.notes.length) {
              const idx = Number(nb.dataset.nbIdx);
              if (Number.isInteger(idx) && idx >= 0 && idx < AN.notes.length) {
                  const add = e.shiftKey || e.ctrlKey || e.metaKey;
                  if (!add)
                      AN.selected.clear();
                  if (add && AN.selected.has(idx))
                      AN.selected.delete(idx);
                  else
                      AN.selected.add(idx);
                  const g = (SCORE.heads.get(idx) || [])[0];
                  if (g) {
                      anRove(g);
                      if (FALL.mode === 'score')
                          anKeepVisible(g, true);
                  }
                  anSelectionChanged();
              }
              return;
          }
          const ch = eventClosest(e, '.an-ch');
          if (ch && AN.view) {
              const k = Number(ch.dataset.k), seg = AN.view.segs[k];
              if (ws.contains(ch)) {
                  AN.rove = k;
                  queryAllHtml(ws, '.an-ch').forEach((b) => b.tabIndex = b === ch ? 0 : -1);
              }
              if (seg) {
                  scoreHalt();
                  SCORE.resume = null;
                  SCORE.paused = false;
                  anSelectChord(k);
                  FALL.position = scoreSeconds(seg.start);
                  if (FALL.mode === 'fall')
                      scoreSetView(SCORE.layout);
                  scoreIdle();
                  anFocusStage();
              }
              return;
          }
          const mo = eventClosest(e, '.an-chip[data-motif]');
          if (mo && AN.view) {
              const k = Number(mo.dataset.motif), m = AN.view.motifs[k];
              if (m)
                  anSelectNotes(m.notes, { kind: 'motif', k });
          }
      });
      ws.addEventListener('keydown', (e) => {
          const ch = eventClosest(e, '.an-ch');
          if (!ch)
              return;
          const all = queryAllHtml(ws, '.an-ch'), i = all.indexOf(ch);
          const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null;
          if (j == null)
              return;
          e.preventDefault();
          const n = all[Math.max(0, Math.min(all.length - 1, j))];
          all.forEach((b) => b.tabIndex = b === n ? 0 : -1);
          AN.rove = Number(n.dataset.k);
          n.focus();
      });
      ['wheel', 'touchmove'].forEach((ev) => ws.addEventListener(ev, () => { SIDE.handScroll = performance.now(); }, { passive: true }));
      ws.addEventListener('keydown', (e) => { if (/^(Page|Arrow|Home|End)/.test(e.key))
          SIDE.handScroll = performance.now(); });
      // tabs: click, or Left/Right/Home/End with automatic activation; the choice is remembered
      byId('an-tabs').addEventListener('click', (e) => { const b = eventClosest(e, '[role="tab"]'); if (b)
          anTab(b.dataset.tab ?? ''); });
      byId('an-tabs').addEventListener('keydown', (e) => {
          const i = AN_TABS.indexOf(SIDE.tab), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? AN_TABS.length - 1 : null;
          if (j == null)
              return;
          e.preventDefault();
          anTab(AN_TABS[(j + AN_TABS.length) % AN_TABS.length], true);
      });
      byId('an-side-btn').addEventListener('click', () => { if (anNarrow())
          anSheet(!SIDE.sheet);
      else
          anSideSet(!SIDE.open); });
      byId('an-side-close').addEventListener('click', () => { if (anNarrow()) {
          anSheet(false);
          return;
      } anSideSet(false); byId('an-side-btn').focus({ preventScroll: true }); });
      byId('an-fab').addEventListener('click', () => anSheet(true));
      byId('pr-opt').addEventListener('click', () => { anPracPopSet(false); anOpenTab('practice'); });
      byId('an-prac-btn').addEventListener('click', () => anPracPopSet(!byId('tb-prac').classList.contains('is-prac-open')));
      byId('an-toolbar').addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && byId('tb-prac').classList.contains('is-prac-open')) {
              e.stopPropagation();
              anPracPopSet(false, true);
          }
      });
      byId('an-now').addEventListener('focusout', (e) => { if (SIDE.deferred && !byId('an-now-body').contains(e.relatedTarget instanceof Node ? e.relatedTarget : null))
          requestAnimationFrame(anRenderNow); });
      // Now: the passage actions
      byId('an-now-listen').addEventListener('click', () => { if (anCommitFocus())
          scorePlay(true); });
      byId('an-now-loop').addEventListener('click', () => { if (SCORE.loop) {
          scoreStop();
          return;
      } if (anCommitFocus())
          scoreLoopStart(); });
      byId('an-now-hands').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-h]'); if (!(b instanceof HTMLButtonElement) || b.disabled || b.dataset.h == null)
          return; if (PRAC.hands !== b.dataset.h)
          pracSet('hands', b.dataset.h); if (anCommitFocus())
          scoreLoopStart(); });
      // Practice: the same settings as the toolbar
      byId('pt-speed').innerHTML = byId('score-speed').innerHTML;
      selectById('pt-speed').value = selectById('score-speed').value;
      byId('pt-speed').addEventListener('change', (e) => { if (!(e.target instanceof HTMLSelectElement))
          return; selectById('score-speed').value = e.target.value; speed(); });
      byId('pt-hands').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-h]'); if (b instanceof HTMLButtonElement && !b.disabled && b.dataset.h != null)
          pracSet('hands', b.dataset.h); });
      byId('pt-wait').addEventListener('change', (e) => { if (e.target instanceof HTMLInputElement)
          pracSet('wait', e.target.checked); });
      byId('pt-metro').addEventListener('change', (e) => { if (e.target instanceof HTMLInputElement)
          pracSet('metro', e.target.checked); });
      byId('pt-start').addEventListener('click', anPracticeStart);
      anSideResizer();
      anTab(SIDE.tab);
      (window).matchMedia('(max-width: 999px)').addEventListener('change', () => { SIDE.sheet = false; anSideSync(); anLayoutVars(); });
      // drag & dropwhere on the analysis view; the drop zone (or the score) shows the target state
      let depth = 0;
      const files = (e: DragEvent): e is DragEvent & { dataTransfer: DataTransfer } => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
      const over = (on: boolean) => { const drop = maybeById('an-drop'), tt = maybeById('an-drop-t'); byId('an-roll').classList.toggle('is-over', on && !!SCORE.xml); if (drop)
          drop.classList.toggle('is-over', on); if (tt)
      {
          if (on) tt.textContent = t('an_drop_over');
          else tt.innerHTML = anDropTitle();
      } };
      window.addEventListener('dragenter', (e) => { if (view0() !== 'analysis' || !files(e))
          return; e.preventDefault(); depth++; over(true); });
      window.addEventListener('dragover', (e) => { if (view0() !== 'analysis' || !files(e))
          return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      window.addEventListener('dragleave', (e) => { if (view0() !== 'analysis' || !files(e))
          return; depth = Math.max(0, depth - 1); if (!depth)
          over(false); });
      window.addEventListener('drop', (e) => { if (view0() !== 'analysis' || !files(e))
          return; e.preventDefault(); depth = 0; over(false); const list = [...e.dataTransfer.files]; if (list.length !== 1) {
          anShowError('an_err_many');
          return;
      } anOpenFile(list[0]); });
      // Toolbar and status bar sizes feed the viewport height (the shell observes the header, dock and bottom bar and the
      // window size the same way); the viewport size drives redraws and re-layout.
      // border-box: a safe-area inset only changes padding, which a content-box observer would miss
      const ro = new ResizeObserver(shell.layoutVarsSoon);
      [byId('an-tbwrap'), byId('an-status')].forEach((el) => { ro.observe(el, { box: 'border-box' }); });
      let lastW = 0, lastH = 0;
      new ResizeObserver((entries) => { const r = entries[0].contentRect, w = Math.round(r.width), h = Math.round(r.height); if (w === lastW && h === lastH)
          return; lastW = w; lastH = h; anStageFit(); }).observe(byId('an-stage'));
      window.addEventListener('scroll', anPinToolbarLater, { passive: true });
      window.addEventListener('scroll', pcFabLater, { passive: true });
      window.addEventListener('resize', pcFabLater);
      // details toggle events do not bubble; the capture phase still sees them
      document.addEventListener('toggle', (e) => { if (e.target instanceof HTMLDetailsElement && (e.target.id === 'pc-pick' || e.target.id === 'score-library'))
          pcFabLater(); }, true);
      const dpr = () => (matchMedia)('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)').addEventListener('change', () => { if (FALL.mode === 'fall')
          fallDraw(); dpr(); }, { once: true });
      dpr();
      anLayoutVars();
      anUpdateControls();
  }

  /* ---------- feature controller ---------- */
  let mounted = false;
  let gesturesReady = false;

  // The heavy score modules load on the first visit (never at import time); the score's pointer gestures bind once they are in.
  function ensureModules(): Promise<void> {
      return ensureScoreModules().then(() => {
          if (!cancelScoreGesture) {
              const roll = maybeById('an-roll');
              if (roll) {
                  cancelScoreGesture = bindScoreGestures(roll, {
                      selecting: (e) => AN.tool === 'select' || e.pointerType === 'pen',
                      select: scorePointer,
                      getZoom: () => SCORE.zoom,
                      zoom: scoreZoomPreview,
                      commitZoom: scoreZoomCommit,
                  });
              }
          }
          gesturesReady = true;
      });
  }

  function isAnalysisRoute(value: unknown): value is AnalysisRoute {
      if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
      if (value.kind === 'catalog') return true;
      return (value.kind === 'builtin' || value.kind === 'lib') && 'id' in value && typeof value.id === 'string';
  }

  function prefs(): UiPrefsSnapshot {
      return {
          scoreLook: SCORE.look === 'night' ? 'night' : 'paper',
          scoreHl: SCORE.hl,
          scoreLayout: SCORE.layout,
          scoreFallMode: FALL.mode,
          scoreLayoutExplicit,
          anSide: { open: SIDE.open, tab: SIDE.tab, w: SIDE.w },
      };
  }

  function applyPrefs(p: UiPrefsSnapshot): void {
      SCORE.look = p.scoreLook;
      SCORE.hl = p.scoreHl;
      SCORE.layout = p.scoreLayout;
      FALL.mode = p.scoreFallMode;
      scoreLayoutExplicit = p.scoreLayoutExplicit;
      SIDE.open = p.anSide.open;
      SIDE.tab = p.anSide.tab;
      SIDE.w = p.anSide.w;
  }

  function mount(): void {
      if (mounted) return;
      mounted = true;
      applyPrefs(host.store.uiPrefs().get());
      anInitControls();
      byId('sc-fit').addEventListener('click', () => { if (anZoomNow() !== 1) scoreZoom(1); else if (SCORE.engine) void scoreLayout(); });
      anLocalize();
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void | Promise<void> {
      if (signal.aborted) return;
      void anLibraryEnsure().catch(() => {});
      const routeParam = params?.analysisRoute;
      const targetRoute: AnalysisRoute = isAnalysisRoute(routeParam) ? routeParam : { kind: 'catalog' };
      const openFile = params?.openFile;
      const pieceId = params?.pieceId;
      if (openFile instanceof File) {
          return anOpenFile(openFile).then(() => undefined);
      }
      if (typeof pieceId === 'string' && pieceId) {
          anListContext = null;
          anFromListDepth = 0;
          return anLoadExample(pieceId).then(() => undefined);
      }
      if (targetRoute.kind === 'catalog') {
          anSetScreen('catalog');
          anCatalogStatus('');
          if (anLibraryNavigationResume && anLibraryActive?.source === AN.source)
              anLibraryRestoreResume(anLibraryNavigationResume);
          anLibraryNavigationResume = null;
          anLibrarySuspended = false;
          anDraw();
          pcRender();
          return;
      }
      if (!anRouteMatches(anCurrentRoute(), targetRoute)) {
          return anOpenRoute(targetRoute, true);
      }
      anSetScreen('player');
      if (anLibraryNavigationResume && anLibraryActive?.source === AN.source)
          anLibraryRestoreResume(anLibraryNavigationResume);
      anLibraryNavigationResume = null;
      anLibrarySuspended = false;
      anDraw();
      pcRender();
  }

  function leave(): void {
      cancelScoreGesture?.();
      anCancelOpening();
      anLibraryNavigationResume = anLibraryCapture();
      if (anScreen === 'player') {
          anRecordBuiltinProgress();
          anRenderContinueCard();
      }
      anLibrarySuspended = true;
      void anLibraryFlush(false).catch(() => {});
      if (scorePendingSignature || scoreLayoutPending) {
          scoreLayoutGeneration++;
          scorePendingSignature = '';
          scoreLayoutPending = null;
          SCORE.stale = true;
      }
      anStopAtCursor();
      anKeysClear();
      anSheet(false, true);
      pcStageSet(false, true);
  }

  // Back/forward between two Score & analysis entries (the view itself does not change).
  function onPopRoute(route: AnalysisRoute): void {
      if (route.kind === 'catalog') {
          if (anScreen !== 'catalog' || AN.loading)
              anExitToCatalog(true);
      }
      else if (anScreen !== 'player' || !anRouteMatches(anCurrentRoute(), route)) {
          void anOpenRoute(route, true);
      }
  }

  function panic(): void {
      if (SCORE.playing) scorePause();
      else SCORE.playGen++;
  }

  function onStorageSync(): void {
      applyPrefs(host.store.uiPrefs().get());
      if (view0() === 'analysis') pcRender();
  }

  // Window resize or orientation flip while Score & analysis is shown.
  function onScreenChange(flipped: boolean): void {
      anStageFit();
      // Re-align on orientation flip or when a visible score is obscured by the toolbar or dock, not a user reading elsewhere.
      const work = byId('an-work').getBoundingClientRect();
      const dockTop = document.body.classList.contains('kb') ? byId('dock').getBoundingClientRect().top : window.innerHeight;
      const header = document.querySelector('header') || document.body;
      const topLimit = Math.max(0, header.getBoundingClientRect().bottom) + byId('an-tbwrap').getBoundingClientRect().height;
      const clipDock = work.top < dockTop && work.bottom > dockTop && work.bottom > 0;
      // A negative top means the reader has scrolled past the start of the score.
      // Keep that reading position, even if the score's lower edge is still visible.
      const atScore = work.top >= 0 && work.top < dockTop;
      const clipTop = work.top < topLimit - 2 && work.bottom > topLimit + 8;
      if (AN.notes.length && !PC_STAGE.on && (clipDock || (anScreen === 'player' && flipped) || (atScore && clipTop)))
          anFocusStage();
      else if (PC_STAGE.on)
          window.scrollTo(0, 0);
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
      registry.define({
        "AN": { get: () => AN },
        "AN_CHORDS": { get: () => scoreFeature?.harmony.AN_CHORDS },
        "AN_DIA": { get: () => scoreFeature?.harmony.AN_DIA },
        "AN_POPS": { get: () => AN_POPS },
        "AN_PROFILE": { get: () => AN_PROFILE },
        "AN_SMUFL_NOTES": { get: () => AN_SMUFL_NOTES },
        "AN_TABS": { get: () => AN_TABS },
        "anAccent": { get: () => scoreFeature?.harmony.anAccent },
        "anActiveChord": { get: () => anActiveChord },
        "anAnalyze": { get: () => anAnalyze },
        "anAssignHands": { get: () => anAssignHands },
        "anBarsLabel": { get: () => anBarsLabel },
        "anBeatText": { get: () => anBeatText },
        "anBeatUnit": { get: () => scoreFeature?.harmony.anBeatUnit },
        "anCadences": { get: () => anCadences },
        "anCands": { get: () => anCands },
        "anChipHTML": { get: () => anChipHTML },
        "anChordLabel": { get: () => anChordLabel },
        "anClassifyNonChord": { get: () => anClassifyNonChord },
        "anClearSelection": { get: () => anClearSelection },
        "anClock": { get: () => anClock },
        "anCoach": { get: () => anCoach },
        "anCommit": { get: () => anCommit },
        "anCommitFocus": { get: () => anCommitFocus },
        "anCompute": { get: () => anCompute },
        "anDetText": { get: () => anDetText },
        "anDockWanted": { get: () => anDockWanted },
        "anDomQ": { get: () => scoreFeature?.harmony.anDomQ },
        "anDraw": { get: () => anDraw },
        "anErrorKey": { get: () => anErrorKey },
        "anFit": { get: () => scoreFeature?.harmony.anFit },
        "anFitImplied": { get: () => scoreFeature?.harmony.anFitImplied },
        "anFocus": { get: () => anFocus },
        "anFocusNotes": { get: () => anFocusNotes },
        "anFocusStage": { get: () => anFocusStage },
        "anFunctionOf": { get: () => anFunctionOf },
        "anGrid": { get: () => scoreFeature?.harmony.anGrid },
        "anHandOf": { get: () => scoreFeature?.harmony.anHandOf },
        "anHandsSource": { get: () => anHandsSource },
        "anHandsText": { get: () => anHandsText },
        "anHarmony": { get: () => anHarmony },
        "anHasFinger": { get: () => anHasFinger },
        "anHover": { get: () => anHover },
        "anIndex": { get: () => anIndex },
        "anInflatedSize": { get: () => anInflatedSize },
        "anInitControls": { get: () => anInitControls },
        "anInspectDifficulty": { get: () => anInspectDifficulty },
        "anInv": { get: () => scoreFeature?.harmony.anInv },
        "anInView": { get: () => anInView },
        "anKeepPlace": { get: () => anKeepPlace },
        "anKeepVisible": { get: () => anKeepVisible },
        "anKeyAt": { get: () => anKeyAt },
        "anKeyInfo": { get: () => anKeyInfo },
        "anKeyName": { get: () => anKeyName },
        "anKeyRank": { get: () => anKeyRank },
        "anKeysCenter": { get: () => anKeysCenter },
        "anKeysClear": { get: () => anKeysClear },
        "anKeysPaint": { get: () => anKeysPaint },
        "anKeysShown": { get: () => anKeysShown },
        "anLibraryFlush": { get: () => anLibraryFlush },
        "anLoadedText": { get: () => anLoadedText },
        "anLoadExample": { get: () => anLoadExample },
        "anLocalize": { get: () => anLocalize },
        "anMarkActive": { get: () => anMarkActive },
        "anMeasureAt": { get: () => anMeasureAt },
        "anMeasures": { get: () => anMeasures },
        "anMotifs": { get: () => scoreFeature?.harmony.anMotifs },
        "anMxlPreflight": { get: () => anMxlPreflight },
        "anNarrow": { get: () => anNarrow },
        "anNctText": { get: () => anNctText },
        "anNoteInfo": { get: () => anNoteInfo },
        "anNowAnnounce": { get: () => anNowAnnounce },
        "anNowCard": { get: () => anNowCard },
        "anOpenFile": { get: () => anOpenFile },
        "anOpenTab": { get: () => anOpenTab },
        "anOriginText": { get: () => anOriginText },
        "anParse": { get: () => anParse },
        "anPieceMeta": { get: () => anPieceMeta },
        "anPieceToParsed": { get: () => anPieceToParsed },
        "anPinToolbar": { get: () => anPinToolbar },
        "anPinToolbarLater": { get: () => anPinToolbarLater },
        "anPoly": { get: () => scoreFeature?.harmony.anPoly },
        "anPop": { get: () => anPop },
        "anPracticeStart": { get: () => anPracticeStart },
        "anRate": { get: () => scoreFeature?.harmony.anRate },
        "anReadXml": { get: () => anReadXml },
        "anRebuild": { get: () => anRebuild },
        "anReconChange": { get: () => anReconChange },
        "anReconOpen": { get: () => anReconOpen },
        "anReconUI": { get: () => anReconUI },
        "anRenderEmpty": { get: () => anRenderEmpty },
        "anRenderNow": { get: () => anRenderNow },
        "anRenderPractice": { get: () => anRenderPractice },
        "anRenderSelection": { get: () => anRenderSelection },
        "anRenderWorkspace": { get: () => anRenderWorkspace },
        "anReset": { get: () => anReset },
        "anRevealPieceRow": { get: () => anRevealPieceRow },
        "anRoman": { get: () => scoreFeature?.harmony.anRoman },
        "anRove": { get: () => anRove },
        "anRowsHTML": { get: () => anRowsHTML },
        "anSegAt": { get: () => anSegAt },
        "anSegIndexAt": { get: () => anSegIndexAt },
        "anSelectChord": { get: () => anSelectChord },
        "anSelectionChanged": { get: () => anSelectionChanged },
        "anSelectNotes": { get: () => anSelectNotes },
        "anSelStart": { get: () => anSelStart },
        "anSetLoading": { get: () => anSetLoading },
        "anSheet": { get: () => anSheet },
        "anShortcut": { get: () => anShortcut },
        "anShowError": { get: () => anShowError },
        "anSideResizer": { get: () => anSideResizer },
        "anSideSet": { get: () => anSideSet },
        "anSideSync": { get: () => anSideSync },
        "anSideVisible": { get: () => anSideVisible },
        "anSpan": { get: () => scoreFeature?.harmony.anSpan },
        "anStageFit": { get: () => anStageFit },
        "anStatus": { get: () => anStatus },
        "anStatusPos": { get: () => anStatusPos },
        "anStatusSel": { get: () => anStatusSel },
        "anSyncTimeline": { get: () => anSyncTimeline },
        "anTab": { get: () => anTab },
        "anTempoAt": { get: () => anTempoAt },
        "anTlUpdate": { get: () => anTlUpdate },
        "anUnion": { get: () => scoreFeature?.harmony.anUnion },
        "anUnits": { get: () => scoreFeature?.harmony.anUnits },
        "anUpdateControls": { get: () => anUpdateControls },
        "anVoiceNeighbors": { get: () => scoreFeature?.harmony.anVoiceNeighbors },
        "anXmlKeyMap": { get: () => anXmlKeyMap },
        "anXmlTidy": { get: () => anXmlTidy },
        "anZoomNow": { get: () => anZoomNow },
        "dockSet": { get: () => dockSet },
        "dockShown": { get: () => dockShown },
        "dockSync": { get: () => dockSync },
        "ensureAnalysisModules": { get: () => ensureModules },
        "FALL": { get: () => FALL },
        "FALL_BLACK": { get: () => FALL_BLACK },
        "FALL_COL": { get: () => FALL_COL },
        "FALL_FONT": { get: () => FALL_FONT },
        "FALL_NUDGE": { get: () => FALL_NUDGE },
        "FALL_PAL": { get: () => FALL_PAL },
        "FALL_SEC": { get: () => FALL_SEC },
        "FALL_SEL": { get: () => FALL_SEL },
        "FALL_YOU": { get: () => FALL_YOU },
        "fallBurst": { get: () => fallBurst },
        "fallData": { get: () => fallData },
        "fallDraw": { get: () => fallDraw },
        "fallEnd": { get: () => fallEnd },
        "fallHit": { get: () => fallHit },
        "fallHover": { get: () => fallHover },
        "fallKeyAt": { get: () => fallKeyAt },
        "fallKeyboard": { get: () => fallKeyboard },
        "fallKeyDown": { get: () => fallKeyDown },
        "fallKeyPath": { get: () => fallKeyPath },
        "fallKeys": { get: () => fallKeys },
        "fallKeyUp": { get: () => fallKeyUp },
        "fallMode": { get: () => fallMode },
        "fallName": { get: () => fallName },
        "fallParticles": { get: () => fallParticles },
        "fallRange": { get: () => fallRange },
        "fallReset": { get: () => fallReset },
        "fallRR": { get: () => fallRR },
        "fallSeek": { get: () => fallSeek },
        "fallSeekEnd": { get: () => fallSeekEnd },
        "fallSelect": { get: () => fallSelect },
        "fallTime": { get: () => fallTime },
        "kbDegrees": { get: () => kbDegrees },
        "pc": { get: () => pc },
        "PC_STAGE": { get: () => PC_STAGE },
        "pcOpen": { get: () => pcOpen },
        "pcRender": { get: () => pcRender },
        "pcStageSet": { get: () => pcStageSet },
        "PRAC": { get: () => PRAC },
        "PRAC_KEY": { get: () => PRAC_KEY },
        "pracAcc": { get: () => pracAcc },
        "pracBeats": { get: () => pracBeats },
        "pracClearAB": { get: () => pracClearAB },
        "pracFactor": { get: () => pracFactor },
        "pracFinish": { get: () => pracFinish },
        "pracFrame": { get: () => pracFrame },
        "pracHud": { get: () => pracHud },
        "pracInput": { get: () => pracInput },
        "pracJudge": { get: () => pracJudge },
        "pracLoad": { get: () => pracLoad },
        "pracLoopBars": { get: () => pracLoopBars },
        "pracMine": { get: () => pracMine },
        "pracMisses": { get: () => pracMisses },
        "pracNeedKey": { get: () => pracNeedKey },
        "pracNextBar": { get: () => pracNextBar },
        "pracNextRender": { get: () => pracNextRender },
        "pracNextStep": { get: () => pracNextStep },
        "pracPassEnd": { get: () => pracPassEnd },
        "pracRamp": { get: () => pracRamp },
        "pracRaw": { get: () => pracRaw },
        "pracRecord": { get: () => pracRecord },
        "pracRelease": { get: () => pracRelease },
        "pracSame": { get: () => pracSame },
        "pracSave": { get: () => pracSave },
        "pracSavedText": { get: () => pracSavedText },
        "pracSegAt": { get: () => pracSegAt },
        "pracSet": { get: () => pracSet },
        "pracSetAB": { get: () => pracSetAB },
        "pracSounds": { get: () => pracSounds },
        "pracStart": { get: () => pracStart },
        "pracStatsReset": { get: () => pracStatsReset },
        "pracSumClose": { get: () => pracSumClose },
        "pracSummary": { get: () => pracSummary },
        "pracTick": { get: () => pracTick },
        "pracWeakHand": { get: () => pracWeakHand },
        "pracWholePiece": { get: () => pracWholePiece },
        "pracWhyNot": { get: () => pracWhyNot },
        "saveAll": { get: () => saveAll },
        "saveSoon": { get: () => saveSoon },
        "SC_ARTS": { get: () => scoreFeature?.SC_ARTS },
        "SC_DYN": { get: () => scoreFeature?.SC_DYN },
        "SC_FIT": { get: () => SC_FIT },
        "SC_TERMS": { get: () => scoreFeature?.scoreTerms },
        "SCORE": { get: () => SCORE },
        "SCORE_LOOK": { get: () => SCORE_LOOK },
        "scoreAnchorAt": { get: () => scoreAnchorAt },
        "scoreBeamGroups": { get: () => scoreBeamGroups },
        "scoreBeams": { get: () => scoreBeams },
        "scoreBeatAt": { get: () => scoreBeatAt },
        "scoreBind": { get: () => scoreBind },
        "scoreCoralBars": { get: () => scoreCoralBars },
        "scoreCursorAt": { get: () => scoreCursorAt },
        "scoreCursorEl": { get: () => scoreCursorEl },
        "scoreCursorFollow": { get: () => scoreCursorFollow },
        "scoreCursorUpdate": { get: () => scoreCursorUpdate },
        "scoreDetectPartHands": { get: () => scoreFeature?.scoreDetectPartHands },
        "scoreExpressionPlan": { get: () => scoreExpressionPlan },
        "scoreExtraBreaks": { get: () => scoreExtraBreaks },
        "scoreFitRender": { get: () => scoreFitRender },
        "scoreFixFingerings": { get: () => scoreFixFingerings },
        "scoreFixPedals": { get: () => scoreFixPedals },
        "scoreFollow": { get: () => scoreFollow },
        "scoreFromMidi": { get: () => scoreFromMidi },
        "scoreGeo": { get: () => scoreGeo },
        "scoreHalt": { get: () => scoreHalt },
        "scoreHome": { get: () => scoreHome },
        "scoreIdle": { get: () => scoreIdle },
        "scoreLayout": { get: () => scoreLayout },
        "scoreLoopStart": { get: () => scoreLoopStart },
        "scoreMarks": { get: () => scoreMarks },
        "scoreMeasureAt": { get: () => scoreMeasureAt },
        "scoreNightSweep": { get: () => scoreNightSweep },
        "scorePaint": { get: () => scorePaint },
        "scorePaintEl": { get: () => scorePaintEl },
        "scorePaintIdx": { get: () => scorePaintIdx },
        "scorePause": { get: () => scorePause },
        "scorePlay": { get: () => scorePlay },
        "scorePointer": { get: () => scorePointer },
        "scoreRender": { get: () => scoreRender },
        "scoreRingFit": { get: () => scoreRingFit },
        "scoreSeconds": { get: () => scoreSeconds },
        "scoreSeekBar": { get: () => scoreSeekBar },
        "scoreSeekTo": { get: () => scoreSeekTo },
        "scoreSelectMeasures": { get: () => scoreSelectMeasures },
        "scoreSelectRange": { get: () => scoreSelectRange },
        "scoreSetHl": { get: () => scoreSetHl },
        "scoreSetLook": { get: () => scoreSetLook },
        "scoreSetTempos": { get: () => scoreSetTempos },
        "scoreSetView": { get: () => scoreSetView },
        "scoreShiftY": { get: () => scoreShiftY },
        "scoreStateText": { get: () => scoreStateText },
        "scoreStop": { get: () => scoreStop },
        "scoreStyleHeader": { get: () => scoreStyleHeader },
        "scoreSymAt": { get: () => scoreSymAt },
        "scoreSyms": { get: () => scoreSyms },
        "scoreSymText": { get: () => scoreSymText },
        "scoreTermParts": { get: () => scoreTermParts },
        "scoreTip": { get: () => scoreTip },
        "scoreToggle": { get: () => scoreToggle },
        "scoreToUser": { get: () => scoreToUser },
        "scoreUnlight": { get: () => scoreUnlight },
        "scoreXLines": { get: () => scoreXLines },
        "scoreXmlEndings": { get: () => scoreXmlEndings },
        "scoreXmlLayout": { get: () => scoreXmlLayout },
        "scoreXmlNotes": { get: () => scoreXmlNotes },
        "scoreZoom": { get: () => scoreZoom },
        "SIDE": { get: () => SIDE },
        "spellName": { get: () => spellName },
        "stopPreviews": { get: () => stopPreviews },
        "t": { get: () => t },
        "todayN": { get: () => todayN },
      });
      // Intentionally mutable: browser regressions replace these dependencies in place and verify the caller's behaviour.
      registry.defineMutable('anInflatedSize', () => anInflatedSize, (value) => { anInflatedSize = value; });
      registry.defineMutable('scoreFixPedals', () => scoreFixPedals, (value) => { scoreFixPedals = value; });
  }

  return {
      mount,
      enter,
      leave,
      isBusy: () => SCORE.playing,
      panic,
      onStorageSync,
      registerTestSurface,
      ensureModules,
      modulesReady: () => scoreModulesReady() && gesturesReady,
      currentRoute: anCurrentRoute,
      onPopRoute,
      prefs,
      applyPrefs,
      layoutVars: scoreLayoutVars,
      stageOn: () => PC_STAGE.on,
      setStage: pcStageSet,
      hasNotes: () => AN.notes.length > 0,
      sideOpen: () => SIDE.open,
      setSide: anSideSet,
      closeSheet: (quiet) => anSheet(false, quiet),
      dockWanted: anDockWanted,
      keysCenterIfPending: () => { if (AN.kbCenter) anKeysCenter(); },
      keysPaint: anKeysPaint,
      keysClear: anKeysClear,
      keepPlace: anKeepPlace,
      updateControls: anUpdateControls,
      practiceInput: pracInput,
      sustainInput: pracSustainInput,
      syncPracticeLine: anSyncPracticeLine,
      releaseInput: () => { FALL.press?.clear(); },
      releaseFocus: (fell) => {
          if (FALL.press)
              FALL.press.clear();
          if (fell && !FALL.raf)
              fallDraw();
      },
      relocalize: () => {
          anLocalize();
          if (view0() === 'analysis')
              anDraw();
      },
      localizeLibrary: () => { scoreLibrary?.localize(); },
      refreshCoach: pracNextRender,
      onScreenChange,
  };
}
