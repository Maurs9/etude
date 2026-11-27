import { isSubset, randItem, setEq, shuffle } from '../../core/collections.js';
import { CATS, ITEMS, ITEM_BY_ID, isCatKey, type ChordTrainerItem, type ScaleTrainerItem, type TrainerItem } from '../../core/trainer-items.js';
import * as theory from '../../domain/theory.js';
import type { PracticeHintDiagram, PracticeHintNote, PracticeHintStep } from '../../domain/practice-hints.js';
import type { PracticeHintsTopic } from '../../domain/practice-hints-view.js';
import type { StudyHintState } from '../../domain/practice-study-view.js';
import { xmlEsc } from '../../domain/score-types.js';
import { INTERVALS, dispSym, progChordTpl } from '../../domain/repertoire-data.js';
import * as router from '../../domain/router.js';
import { byId, maybeById, inputById, selectById, eventClosest, queryHtml, queryAllHtml } from '../../domain/dom.js';
import { inputTime } from '../../domain/midi-timing.js';
import { CONTRAST_LENGTH, ConfusionLog, contrastOrder, differentialIntervalCue, differentialToneCue, feedbackBroken, feedbackChords, feedbackLine, feedbackSchedule, type ConfusionPair } from '../../domain/feedback.js';
import { TECHNIQUE_TOPIC, techniqueDrillActive, techniqueInput, techniquePresent, techniqueRefresh, techniqueStop, type TechniqueHost } from '../../domain/technique-drill.js';
import type { AppHost, IntervalDirection, PracticeController, PracticeModePref, PracticeShell, StoredLastDrill, TestSurfaceRegistry } from '../../domain/views.js';
import type { IntervalStyle, ChordTier, ScaleTier, MelodyDifficulty, EarKeysPrompt, EarKeysState, TrainerQuestion, TrainerGiven, TrainerSessionTarget, TrainerSessionState, PracticeHintPreview, PracticeMode } from './session-model.js';
import { createAccompanimentController } from './accompaniment.js';
import { createSongBookController } from './song-book.js';

const pc = theory.pitchClass, SCALES = theory.SCALE_DEFINITIONS, CHORDS = theory.CHORD_TEMPLATES, PROGS = theory.PROGRESSION_TEMPLATES;
const SCALE_DEGREE_LABELS = theory.SCALE_DEGREE_LABELS;

export function createPracticeFeature(host: AppHost, shell: PracticeShell): PracticeController {
  const t = host.i18n.t;
  const { scaleDisp, formatChord, chordDisp, intervalLabel, noteName, invName } = host.i18n;
  const saveAll = host.store.saveNow, saveSoon = host.store.saveSoon;
  const stopPreviews = host.audio.stopPreviews, timedAudioReady = host.audio.timedReady;
  const playScaleNotes = host.audio.playScaleNotes, playChordMidis = host.audio.playChordMidis;
  const stopMetro = host.metro.stop, startMetro = host.metro.start, startDrone = host.metro.startDrone, stopDrone = host.metro.stopDrone;
  const dockSync = host.dock.sync, dockShown = host.dock.isShown;
  const heldMidis = host.input.heldMidis, heldPcs = host.input.heldPcs, releaseLiveInput = host.input.releaseLiveInput;
  const {
    view0, todayN, ensureAudio, kbState, kbClear, kbClearAll, buildKeyboard, repaintHeld, reflowKeys, foldToView, viewHigh,
    dockKeyInSight, syncMobileStartBars, refreshToday, playIvDir, rootName, ivName, catLabel, progDisp, feelDisp, chordFormula,
    scaleFormula, songsFor, itemLabel, rdEsc, spelledName, isFlatKey, identifyChord, chordTargetPcs, inversionOf, boxOf, isDue,
    isNew, dueItems, newItemsAvail, newQuotaLeft, seedPlacement, reviewItem, creditReview, currentStreak,
  } = shell;
  let evalTimer: number | null = null;
  function scheduleEval(fn: () => void, ms: number) { clearTimeout(evalTimer ?? undefined); evalTimer = window.setTimeout(fn, ms); }
  const SCALE_EAR_POOL = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian', 'Major pentatonic', 'Minor pentatonic', 'Blues', 'Harmonic minor', 'Whole tone'];
  const CHORD_TIER_TRIADS = new Set(['maj', 'm', 'dim', 'aug']);
  const CHORD_TIER_SEVENTHS = new Set(['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', '7', 'm7', 'mMaj7', 'm7♭5', 'dim7']);
  const SCALE_TIER_CORE = new Set(['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor']);
  const SCALE_TIER_MODES = new Set([
      'Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor',
      'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian', 'Major pentatonic', 'Minor pentatonic', 'Blues',
  ]);
  function chordMatchesTier(symbol: string, tier: ChordTier = 'all') {
      if (tier === 'triads') return CHORD_TIER_TRIADS.has(symbol);
      if (tier === 'sevenths') return CHORD_TIER_SEVENTHS.has(symbol);
      return true;
  }
  function scaleMatchesTier(name: string, tier: ScaleTier = 'all') {
      if (tier === 'core') return SCALE_TIER_CORE.has(name);
      if (tier === 'modes') return SCALE_TIER_MODES.has(name);
      return true;
  }
  function scaleEarOptions(correct: string) {
      const tier = SES.targeted?.cat === 'scale' ? (SES.targeted.scaleTier ?? prScaleTier) : 'all';
      const allowed = SCALE_EAR_POOL.filter((n) => n === correct || scaleMatchesTier(n, tier));
      let pool = allowed.filter((n) => n !== correct);
      pool = shuffle(pool).slice(0, 6);
      pool.push(correct);
      return shuffle(pool);
  }
  function chordEarOptions(correctItem: ChordTrainerItem) {
      const tier = SES.targeted?.cat === 'chord' ? (SES.targeted.chordTier ?? prChordTier) : 'all';
      const others = ITEMS.filter((x): x is ChordTrainerItem => x.cat === 'chord' && x.short !== correctItem.short && chordMatchesTier(x.short, tier));
      const same = shuffle(others.filter((x) => x.ref.pcset.length === correctItem.ref.pcset.length));
      const rest = shuffle(others.filter((x) => x.ref.pcset.length !== correctItem.ref.pcset.length));
      return shuffle(same.concat(rest).slice(0, 7).concat([correctItem]));
  }
  const PLACEMENT = ['iv:7', 'iv:5', 'iv:4', 'iv:3', 'iv:12', 'ch:maj', 'ch:m', 'ch:maj7', 'ch:7', 'sc:Major (Ionian)', 'sc:Aeolian (Natural minor)', 'pr:I–IV–V'];
  const SES: TrainerSessionState = { active: false, queue: [], idx: 0, correct: 0, total: 0, q: null, answered: false, targeted: null, placement: false, promptT: 0, contrast: null };
  // Which items this session took for which (kept in memory only; a new session, but not its contrast drill, starts it over).
  const confusions = new ConfusionLog();
  let sesAnswerReplay: ReturnType<typeof setTimeout> | undefined;
  function sesStopAnswerReplay() { clearTimeout(sesAnswerReplay); sesAnswerReplay = undefined; }
  function sesStopPrompt() { clearTimeout(SES.promptT); SES.promptT = 0; }
  function sesPrompt(q: TrainerQuestion, play: () => void) { sesStopPrompt(); SES.promptT = setTimeout(() => { SES.promptT = 0; if (SES.active && SES.q === q && !SES.answered)
      play(); }, 250); }
  function buildQueue() {
      const goal = host.store.data().settings.goal;
      const due = dueItems().slice(0, goal);
      const fresh = newItemsAvail().slice(0, newQuotaLeft());
      let pool = [...due];
      for (const f of fresh) {
          if (pool.length >= goal)
              break;
          pool.push(f);
      }
      if (pool.length < goal) { // top up with the weakest seen items for extra retrieval practice
          const weak = ITEMS.filter((it) => !isNew(it.id) && !isDue(it.id)).sort((a, b) => boxOf(a.id) - boxOf(b.id));
          for (const w of weak) {
              if (pool.length >= goal)
                  break;
              if (!pool.includes(w))
                  pool.push(w);
          }
      }
      let qs: TrainerQuestion[] = shuffle(pool).map(makeQuestion);
      // interleave: avoid two same-category in a row when possible
      for (let i = 1; i < qs.length; i++) {
          if (qs[i].it.cat === qs[i - 1].it.cat) {
              const j = qs.findIndex((q, k) => k > i && q.it.cat !== qs[i - 1].it.cat);
              if (j > -1) {
                  [qs[i], qs[j]] = [qs[j], qs[i]];
              }
          }
      }
      return qs;
  }
  function makeQuestion(it: TrainerItem): TrainerQuestion {
      const b = boxOf(it.id);
      const forced = SES.targeted && SES.targeted.mode;
      let mode: string;
      if (SES.placement)
          mode = 'ear'; // placement probes real by-ear knowledge
      else if (forced)
          mode = forced; // targeted practice honours the chosen mode
      else if (it.cat === 'scale' || it.cat === 'prog')
          mode = b >= 3 ? 'ear' : 'play';
      else
          mode = b >= 2 ? 'ear' : 'play'; // desirable difficulty: recall-by-sound once recognised-by-doing
      let key: number;
      if (SES.targeted && SES.targeted.key != null && SES.targeted.key !== 'all')
          key = (+SES.targeted.key) || 0; // honour the key picked in Practice
      else
          key = b < 1 ? randItem([0, 7, 5, 2, 9]) : Math.floor(Math.random() * 12); // start in friendly keys
      const q: TrainerQuestion = { it, mode, key, idx: 0, anchor: null, missed: false, hinted: false };
      const ivStyle = it.cat === 'interval' && mode === 'ear' ? (SES.targeted?.ivStyle ?? 'both') : undefined;
      if (ivStyle)
          q.ivStyle = ivStyle;
      const dir = it.cat === 'interval' && mode === 'ear' ? SES.targeted?.dir : undefined;
      if (dir)
          q.dir = ivStyle === 'harmonic' ? 'asc' : (dir === 'both' ? randItem<'asc' | 'desc'>(['asc', 'desc']) : dir);
      return q;
  }
  function startSession(targeted: TrainerSessionTarget|null, contrast: TrainerSessionState['contrast'] = null) {
      if (practiceHintPreview || songBook.isPreviewing()) stopPreviews();
      ensureAudio();
      sesStopPrompt();
      sesStopAnswerReplay();
      clearTimeout(evalTimer ?? undefined);
      evalTimer = null;
      if (accomp.on)
          accompStop(); // Play along is not a drill
      SES.targeted = targeted || null;
      SES.placement = false;
      SES.contrast = targeted ? contrast : null;
      if (!SES.contrast)
          confusions.clear();
      contrastOfferHide();
      SES.queue = targeted ? Array.from({ length: 9999 }) : buildQueue(); // targeted = endless
      if (!SES.queue.length) {
          refreshToday();
          return;
      }
      SES.idx = 0;
      SES.correct = 0;
      SES.total = 0;
      SES.active = true;
      openSessionUI();
      nextQuestion();
  }
  function startPlacement() {
      ensureAudio();
      sesStopPrompt();
      sesStopAnswerReplay();
      clearTimeout(evalTimer ?? undefined);
      evalTimer = null;
      SES.targeted = null;
      SES.placement = true;
      SES.contrast = null;
      confusions.clear();
      contrastOfferHide();
      SES.queue = PLACEMENT.map((id) => ITEM_BY_ID[id]).filter(Boolean).map(makeQuestion);
      SES.idx = 0;
      SES.correct = 0;
      SES.total = 0;
      SES.active = true;
      openSessionUI();
      nextQuestion();
  }
  function sesHome() { return SES.targeted ? 'practice' : 'today'; }
  function openSessionUI() {
      const ses = byId('session');
      if (SES.targeted) {
          byId('view-practice').appendChild(ses);
          byId('pr-home').style.display = 'none';
      }
      else {
          byId('view-today').insertBefore(ses, byId('summary'));
          byId('pr-home').style.display = '';
      }
      byId('today-home').style.display = 'none';
      byId('summary').style.display = 'none';
      ses.style.display = 'block';
      ses.classList.add('on');
      dockSync();
      syncMobileStartBars();
      reflowKeys();
      requestAnimationFrame(() => { if (SES.active)
          ses.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  }
  function endSession(toSummary: boolean) {
      const wasPlacement = SES.placement;
      const completedPlacement = wasPlacement && SES.queue.length > 0 && SES.total === SES.queue.length;
      if (completedPlacement) {
          for (const q of SES.queue) {
              if (!q) continue;
              const known = q.placementKnown === true;
              seedPlacement(q.it.id, known);
              creditReview(known);
          }
          host.store.data().placed = true;
          saveAll();
      }
      sesStopPrompt();
      sesStopAnswerReplay();
      clearTimeout(evalTimer ?? undefined);
      evalTimer = null;
      ekStop(SES.q);
      ekUiReset();
      techniqueStop(techniqueHost);
      const contrastRun = SES.contrast;
      SES.contrast = null;
      SES.active = false;
      SES.answered = true;
      SES.q = null;
      SES.placement = false;
      byId('session').style.display = 'none';
      byId('session').classList.remove('on');
      dockSync(); // keys a drill opened fold back to the saved choice
      syncMobileStartBars();
      kbClearAll();
      releaseLiveInput();
      stopMetro();
      stopDrone();
      if (SES.targeted) {
          if (!contrastRun)
              prRecordDrill(); // a contrast drill leaves the last-drill record alone: nothing new is saved
          byId('pr-home').style.display = '';
          renderPracticeLast();
          contrastOffer(byId('pr-last'), contrastRun ? { correct: SES.correct, total: SES.total } : null);
          if (toSummary)
              prFocusAfterDrill();
          return;
      }
      if (toSummary && (completedPlacement || (!wasPlacement && SES.total > 0))) {
          showSummary(completedPlacement);
          contrastOffer(byId('sum-note'), null);
      }
      else {
          byId('today-home').style.display = 'block';
          refreshToday();
          if (toSummary) byId(wasPlacement ? 'placeBtn' : 'startBtn').focus();
      }
  }
  function nextQuestion() {
      if ((!SES.targeted && SES.idx >= SES.queue.length) || (SES.contrast && SES.total >= SES.contrast.order.length)) {
          endSession(true);
          return;
      }
      byId('q-both').hidden = true;
      sesStopPrompt();
      ekStop(SES.q);
      kbClearAll();
      SES.answered = false;
      if (SES.targeted && SES.targeted.cat === TECHNIQUE_TOPIC) {
          // The scale and arpeggio drill keeps its own runs; the placeholder question only keeps the keys open (Play it).
          SES.q = { it: TECHNIQUE_ITEM, mode: 'play', key: 0, idx: 0, anchor: null, missed: false, hinted: false };
          byId('ses-progress').style.width = '0%';
          const { techKind, techOctaves } = SES.targeted;
          SES.targeted.techKind = undefined;
          SES.targeted.techOctaves = undefined;
          techniquePresent(techniqueHost, SES.targeted.key, techKind, techOctaves);
          dockSync();
          return;
      }
      techniqueStop(techniqueHost);
      const q = SES.targeted ? makeQuestion(pickTargetedItem()) : SES.queue[SES.idx];
      if (!q)
          return;
      SES.q = q;
      byId('ses-progress').style.width = SES.targeted ? '0%' : (100 * SES.idx / SES.queue.length) + '%';
      byId('ses-count').textContent = SES.targeted ? ('#' + (SES.total + 1) + (SES.total ? ' · ' + SES.correct + '/' + SES.total + ' ✓' : '')) : ((SES.idx + 1) + '/' + SES.queue.length);
      if (SES.contrast) {
          byId('ses-progress').style.width = (100 * SES.total / SES.contrast.order.length) + '%';
          byId('ses-count').textContent = (SES.total + 1) + '/' + SES.contrast.order.length;
      }
      byId('q-verdict').textContent = '';
      byId('q-verdict').className = 'verdict';
      byId('q-elab').textContent = '';
      byId('q-elab').classList.remove('show');
      byId('q-next').hidden = true;
      byId('q-reveal').hidden = false;
      byId('q-answers').hidden = true;
      byId('q-answers').innerHTML = '';
      presentQuestion(q);
  }
  /* Scale and arpeggio drill (technique-drill.ts): a targeted topic, so no review, daily-goal or streak change. */
  const TECHNIQUE_ITEM: ScaleTrainerItem = { id: TECHNIQUE_TOPIC, cat: 'scale', label: '', short: '', intro: 0, name: 'Major (Ionian)' };
  const techniqueHost: TechniqueHost = {
      t: (key, ...args) => t(key, ...args),
      spell: (letter, acc) => spelledName(host.i18n.notation(), letter, acc),
      mark: (midi, state) => kbState(midi, state, !!host.store.data().settings.anyOctave),
      ensureVisible: (midis) => {
          if (!midis.length || !dockShown()) return;
          if (host.store.data().settings.anyOctave) {
              dockKeyInSight(foldToView(midis[0]));
              return;
          }
          const lo = Math.min(...midis), hi = Math.max(...midis);
          const span = shell.keyboardView.oct * 12;
          if (lo < shell.keyboardView.low || hi > viewHigh()) {
              const targetLow = Math.max(shell.baseLow, Math.min(shell.baseHigh - span, Math.floor(lo / 12) * 12));
              if (targetLow !== shell.keyboardView.low) {
                  shell.keyboardView.low = targetLow;
                  buildKeyboard();
                  repaintHeld();
              }
          }
          dockKeyInSight(lo);
      },
      clearMarks: () => kbClearAll(),
      byId,
      anyOctave: () => !!host.store.data().settings.anyOctave,
      onComplete({ clean, bpm }) {
          const log = host.store.data().practiceLog ?? (host.store.data().practiceLog = {});
          log.techRuns = (log.techRuns || 0) + 1;
          if (clean) log.techClean = (log.techClean || 0) + 1;
          if (bpm && bpm > 0) log.techBestBpm = Math.max(log.techBestBpm || 0, Math.round(bpm));
          saveAll();
      },
  };
  function melodyConfigForSession(diff: MelodyDifficulty = prMelDiff, lenPref: number | 'auto' = prMelLen, scalePref: string = prMelScale) {
      const baseLen = diff === 'easy' ? (3 + Math.floor(Math.random() * 2)) : diff === 'medium' ? (4 + Math.floor(Math.random() * 2)) : (5 + Math.floor(Math.random() * 3));
      const len = typeof lenPref === 'number' && lenPref >= 3 && lenPref <= 8 ? lenPref : baseLen;
      const defaultScales = diff === 'easy'
          ? ['Major (Ionian)', 'Major pentatonic']
          : diff === 'medium'
              ? ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic']
              : EK_MEL_SCALES;
      const scaleNames = scalePref !== 'auto' && EK_MEL_SCALES.includes(scalePref) ? [scalePref] : defaultScales;
      const steps = diff === 'advanced' ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2];
      const stepWeight = diff === 'easy' ? 4 : diff === 'medium' ? 2 : 2;
      return { len, scaleNames, steps, stepWeight };
  }
  function pickTargetedItem() {
      if (!SES.targeted)
          throw new Error('Étude: no targeted drill');
      const contrastItem = SES.contrast ? ITEM_BY_ID[SES.contrast.order[SES.total % SES.contrast.order.length]] : undefined;
      if (contrastItem)
          return contrastItem;
      const c = SES.targeted.cat;
      let pool: TrainerItem[];
      if (c === 'melody') {
          const cfg = melodyConfigForSession(SES.targeted.melDiff ?? prMelDiff, SES.targeted.melLen ?? prMelLen, SES.targeted.melScale ?? prMelScale);
          pool = ITEMS.filter((it): it is ScaleTrainerItem => it.cat === 'scale' && cfg.scaleNames.includes(it.name));
      } else if (c === 'chord') {
          const tier = SES.targeted.chordTier ?? prChordTier;
          pool = ITEMS.filter((it): it is ChordTrainerItem => it.cat === 'chord' && chordMatchesTier(it.short, tier));
      } else if (c === 'scale') {
          const tier = SES.targeted.scaleTier ?? prScaleTier;
          pool = ITEMS.filter((it): it is ScaleTrainerItem => it.cat === 'scale' && scaleMatchesTier(it.name, tier));
      } else {
          pool = ITEMS.filter((it) => it.cat === c); // weakness-weighted
      }
      const w = pool.map((it) => { const s = host.store.data().srs[it.id] || { box: 0 }; return 1 / (1 + s.box); });
      let tot = w.reduce((a, b) => a + b, 0), r = Math.random() * tot;
      for (let i = 0; i < pool.length; i++) {
          r -= w[i];
          if (r <= 0)
              return pool[i];
      }
      return pool[0];
  }
  function presentQuestion(q: TrainerQuestion) {
      ekUiReset();
      const it = q.it;
      byId('q-cat').textContent = catLabel(it.cat);
      const playLbl = { interval: t('play_interval'), chord: t('play_chord'), scale: t('play_scale'), prog: t('play_prog') };
      byId('q-mode').textContent = q.mode === 'ear' ? t(ekWanted(q) ? 'ek_mode' : 'listen_answer') : playLbl[it.cat];
      byId('q-replay').hidden = q.mode !== 'ear';
      ekToggleSync(q);
      if (q.mode === 'ear') {
          presentEar(q);
      }
      else {
          presentPlay(q);
      }
      dockSync(); // each question may answer on the keys or not
  }
  function earRoot(q: { key: number; }) { return theory.practiceTonicMidi(q.key, 'near-middle-c'); }
  function renderPlayPrompt(q: TrainerQuestion) {
      const it = q.it, root = rootName(q.key);
      const [label, sub] = it.cat === 'interval' ? [ivName(it.semi), t('above') + ' ' + root]
          : it.cat === 'chord' ? [formatChord(root, dispSym(it.short)), chordDisp(it.ref)]
          : it.cat === 'scale' ? [root + ' ' + scaleDisp(it.name), t('ascending')]
          : [progDisp(it.ref.name), t('in_key') + ' ' + root];
      byId('q-prompt').innerHTML = label + ' <span class="sub">' + sub + '</span>';
  }
  function presentPlay(q: TrainerQuestion) {
      renderPlayPrompt(q);
      const it = q.it;
      if (it.cat === 'scale') {
          q.offs = SCALES[it.name].concat([12]);
          q.anchor = null;
          q.idx = 0;
          if (host.store.data().settings.metronome) startMetro();
          if (host.store.data().settings.drone) startDrone(q.key);
      }
      else if (it.cat === 'prog') {
          q.idx = 0;
          neutral(() => it.ref.chords.map(ch => formatChord(rootName((q.key + ch[0]) % 12), dispSym(ch[1]))).join('  ·  '));
          showProgTarget(q);
      }
  }
  function earOptionLabel(q: TrainerQuestion, key: string) {
      switch (q.it.cat) {
          case 'interval': {
              const iv = INTERVALS.find(interval => String(interval.semi) === key);
              return iv ? iv.short + ' · ' + ivName(iv.semi) : key;
          }
          case 'chord': return key + ' · ' + chordDisp(CHORDS.find(chord => chord.symbol === key));
          case 'scale': return scaleDisp(key);
          case 'prog': return progDisp(key);
          default: return key;
      }
  }
  function refreshSessionCopy() {
      if (!SES.active) return;
      if (SES.targeted?.cat === TECHNIQUE_TOPIC) {
          techniqueRefresh(techniqueHost);
          return;
      }
      const q = SES.q;
      if (!q) return;
      if (q.mode === 'ear') {
          byId('q-mode').textContent = t(q.ek ? 'ek_mode' : 'listen_answer');
          if (q.ek) {
              renderEarKeysPrompt(q, q.ek);
              byId('q-ekhint').textContent = t('ek_hint_' + q.ek.kind);
          } else {
              byId('q-cat').textContent = catLabel(q.it.cat);
              byId('q-prompt').textContent = t('listen');
              queryAllHtml(byId('q-answers'), 'button[data-k]').forEach(button => {
                  button.textContent = earOptionLabel(q, button.dataset.k ?? '');
              });
          }
      } else {
          byId('q-cat').textContent = catLabel(q.it.cat);
          byId('q-mode').textContent = t({ interval: 'play_interval', chord: 'play_chord', scale: 'play_scale', prog: 'play_prog' }[q.it.cat]);
          renderPlayPrompt(q);
      }
      if (q.verdictText) byId('q-verdict').textContent = q.verdictText();
      if (SES.answered) showElaboration(q);
  }
  function presentEar(q: TrainerQuestion) {
      ekStop(q);
      q.ek = null;
      ekUiReset();
      if (ekWanted(q)) {
          presentEarKeys(q);
          return;
      }
      const it = q.it;
      byId('q-prompt').textContent = t('listen');
      byId('q-answers').hidden = false;
      const box = byId('q-answers');
      box.innerHTML = '';
      let opts: (number | string)[] = [];
      if (it.cat === 'interval') {
          opts = INTERVALS.map(iv => iv.semi);
          sesPrompt(q, () => playIvDir(earRoot(q), it.semi, q.dir ?? 'asc', q.ivStyle ?? 'both'));
      }
      else if (it.cat === 'chord') {
          opts = (SES.contrast ? ITEMS.filter((x): x is ChordTrainerItem => x.cat === 'chord') : chordEarOptions(it)).map(x => x.short);
          sesPrompt(q, () => playChordMidis(it.ref.intervals.map((i) => earRoot(q) + i), true));
      }
      else if (it.cat === 'scale') {
          opts = SES.contrast ? Object.keys(SCALES) : scaleEarOptions(it.name);
          sesPrompt(q, () => playScaleNotes(theory.practiceTonicMidi(q.key), SCALES[it.name], true));
      }
      else if (it.cat === 'prog') {
          opts = PROGS.map(p => p.name);
          sesPrompt(q, () => playProg(q.key, it.ref));
      }
      if (SES.contrast) // a contrast drill offers just the two answers it compares
          opts = opts.filter((o) => SES.contrast && [SES.contrast.a, SES.contrast.b].includes(earOptionId(it.cat, o)));
      opts.forEach((o) => { const b = (document).createElement('button'); b.className = 'chip'; b.dataset.k = String(o); b.textContent = earOptionLabel(q, String(o)); b.onclick = () => answerEar(q, o, b); box.appendChild(b); });
  }
  const playProg = host.audio.playProg;
  function showProgTarget(q: TrainerQuestion) { kbClear('target'); if (q.it.cat !== 'prog')
      return; const ch = q.it.ref.chords[q.idx], root = 60 + ((q.key + ch[0]) % 12), tpl = progChordTpl(ch[1]); if (!tpl)
      return; tpl.intervals.forEach((iv) => kbState(root + iv, 'target', true)); }
  function playQuestionSound(q: TrainerQuestion) {
      const it = q.it;
      if (q.ek) {
          if (SES.answered)
              ekSound(q);
          else
              ekPlay(q);
          return;
      }
      if (it.cat === 'interval')
          playIvDir(earRoot(q), it.semi, q.dir ?? 'asc', q.ivStyle ?? 'both');
      else if (it.cat === 'chord')
          playChordMidis(it.ref.intervals.map((i) => earRoot(q) + i), true);
      else if (it.cat === 'scale')
          playScaleNotes(theory.practiceTonicMidi(q.key), SCALES[it.name], true);
      else if (it.cat === 'prog')
          playProg(q.key, it.ref);
  }
  function answerEar(q: TrainerQuestion, k: number | string, btn: HTMLButtonElement) {
      if (SES.answered)
          return;
      const it = q.it;
      let ok: boolean;
      if (it.cat === 'interval')
          ok = k === it.semi;
      else if (it.cat === 'chord')
          ok = k === it.short;
      else if (it.cat === 'scale')
          ok = k === it.name;
      else
          ok = k === it.ref.name;
      if (ok) {
          btn.classList.add('correct');
          resolve(q, true);
      }
      else {
          btn.classList.add('wrong');
          q.missed = true;
          markEarCorrect(q);
          q.given = givenByEar(q, k);
          resolve(q, false);
      }
  }
  function markEarCorrect(q: TrainerQuestion) { const it = q.it; const key = it.cat === 'interval' ? String(it.semi) : it.cat === 'chord' ? it.short : it.cat === 'scale' ? it.name : it.ref.name; [...byId('q-answers').children].forEach((b) => { if (b instanceof HTMLElement && b.dataset.k === key)
      b.classList.add('correct'); }); }
  /* ---------- BY EAR, ON THE KEYS: hear it, then play it back (intervals, chords in any inversion, short tonal melodies) ----------
     The prompt plays first; notes that arrive before it ends are ignored (armAt), so nothing the listener does while it sounds is
     graded. Octave policy: the start note may be played in any octave and everything after it is measured from it, so an interval
     keeps its exact size, a melody keeps its exact shape, and a chord keeps its pitch classes with the written lowest note.
     A wrong attempt is a lapse for the schedule but can be retried (up to EK_TRIES) after listening again. */
  const EK_TRIES = 3, EK_MEL_SCALES = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Major pentatonic', 'Minor pentatonic'];
  const EK_CHORD_GAP = 300;
   // ms: a key joins the chord if another chord key is still down or it lands this close to the previous one
  function ekForced() { return !!(SES.targeted && SES.targeted.cat === 'melody'); }
  function ekWanted(q: TrainerQuestion | null) { return !!q && q.mode === 'ear' && !SES.placement && !SES.contrast && q.it.cat !== 'prog' && (ekForced() || !!host.store.data().settings.earKeys); }
  // Spell like the key: minor-flavoured chords and scales on D, G, C, F, B♭, E♭ use flats, as do the flat major keys and the flat intervals.
  function ekFlat(q: TrainerQuestion) {
      const it = q.it, set = it.cat === 'chord' ? it.ref.pcset : it.cat === 'scale' ? SCALES[it.name] : null;
      if (set && set.includes(3) && !set.includes(4))
          return [0, 2, 3, 5, 7, 10].includes(q.key);
      return isFlatKey(q.key) || (it.cat === 'interval' && [1, 3, 8, 10].includes(it.semi));
  }
  function ekName(q: TrainerQuestion, m: number) { return noteName(m, ekFlat(q)); }
  function ekToggleSync(q: TrainerQuestion | null) {
      const box = byId('q-ansmode');
      box.hidden = !(q && q.mode === 'ear' && !SES.placement && q.it.cat !== 'prog' && !ekForced());
      box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.v === 'keys') === !!host.store.data().settings.earKeys ? 'true' : 'false'));
  }
  function ekUiReset() { byId('q-ekhint').textContent = ''; byId('q-ekprog').innerHTML = ''; byId('q-ekreset').hidden = true; }
  function ekStop(q: TrainerQuestion | null) { if (q && q.ek)
      clearTimeout(q.ek.goT); }
  function ekBuild(q: TrainerQuestion): EarKeysPrompt {
      const it = q.it;
      if (it.cat === 'interval') {
          const r = earRoot(q);
          return { kind: 'iv', target: q.dir === 'desc' ? [r + it.semi, r] : [r, r + it.semi], n: 2 };
      }
      if (it.cat === 'chord') {
          const ivs = [...new Set(it.ref.intervals)].sort((a, b) => a - b), n = ivs.length;
          const inv = n <= 4 && Math.random() < .6 ? 1 + Math.floor(Math.random() * (n - 1)) : 0; // triads and sevenths come in every inversion
          let ns = ivs.map((i) => 48 + q.key + i);
          for (let k = 0; k < inv; k++) {
              const low = ns.shift();
              if (low !== undefined)
                  ns.push(low + 12);
          }
          if (ns[0] < 52)
              ns = ns.map((m) => m + 12);
          if (ns[ns.length - 1] > 88)
              ns = ns.map((m) => m - 12);
          const pcs = [...new Set(ns.map(pc))].sort((a, b) => a - b);
          return { kind: 'ch', target: ns, inv, pcs, n: pcs.length };
      }
      // a short tonal melody in the item's scale: starts on the tonic, moves mostly by step, ends on a stable degree
      if (it.cat !== 'scale')
          throw new Error('Étude: no ear-keys prompt for a ' + it.cat + ' item');
      const cfg = SES.targeted?.cat === 'melody'
          ? melodyConfigForSession(SES.targeted.melDiff ?? prMelDiff, SES.targeted.melLen ?? prMelLen, SES.targeted.melScale ?? prMelScale)
          : { len: 3 + Math.floor(Math.random() * 3), scaleNames: EK_MEL_SCALES, steps: [-2, -1, 1, 2], stepWeight: 2 };
      const offs = SCALES[it.name], N = offs.length, ton = earRoot(q), len = cfg.len;
      const at = (d: number) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N), stable = (d: number) => [0, 3, 4, 7].includes(pc(at(d) - ton));
      let d = 0;
      const ds = [0];
      for (let i = 1; i < len; i++) {
          const last = i === len - 1, opts: number[] = [];
          cfg.steps.forEach((s) => {
              const nd = d + s;
              if (nd < -2 || nd > N + 2 || (last && !stable(nd)))
                  return;
              const w = Math.abs(s) === 1 ? cfg.stepWeight : Math.abs(s) === 2 ? 2 : 1;
              for (let k = 0; k < w; k++) opts.push(nd);
          });
          if (!opts.length)
              opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
          d = randItem(opts);
          ds.push(d);
      }
      const target = ds.map(at);
      return { kind: 'mel', target, n: target.length };
  }
  function presentEarKeys(q: TrainerQuestion) {
      const ek = q.ek = Object.assign(ekBuild(q), { tries: 0, seq: [], off: 0, armAt: Infinity, goT: 0, won: false, warned: false });
      byId('q-answers').hidden = true;
      byId('q-answers').innerHTML = '';
      renderEarKeysPrompt(q, ek);
      byId('q-ekhint').textContent = t('ek_hint_' + ek.kind);
      byId('q-ekreset').hidden = false;
      ekProg(q, 0);
      ekPlay(q);
  }
  function renderEarKeysPrompt(q: TrainerQuestion, ek: EarKeysState) {
      const it = q.it;
      const st = ekName(q, ek.target[0]), sub = ek.kind === 'iv' ? t('ek_sub_start', st) : ek.kind === 'ch' ? t('ek_sub_bass', st, ek.n) : t('ek_sub_mel', rootName(q.key) + ' ' + scaleDisp(it.cat === 'scale' ? it.name : ''), ek.n);
      byId('q-prompt').innerHTML = t('ek_p_' + ek.kind) + ' <span class="sub">' + sub + '</span>';
      byId('q-cat').textContent = ek.kind === 'mel' ? t('ek_cat_mel') : catLabel(it.cat);
  }
  // Plays the prompt and returns when (seconds after now) its last note starts.
  function ekSound(q: TrainerQuestion) {
      const ek = q.ek;
      ensureAudio();
      if (!shell.audioEngine.context)
          return 0;
      stopPreviews();
      if (!ek)
          return 0;
      const t0 = shell.audioEngine.context.currentTime + .25, ms = ek.target;
      let last: number;
      if (ek.kind === 'iv') {
          const style = q.ivStyle ?? 'both';
          if (style === 'harmonic') {
              host.audio.previewNote(ms[0], t0, .8);
              host.audio.previewNote(ms[1], t0, .8);
              last = 0;
          }
          else if (style === 'melodic') {
              host.audio.previewNote(ms[0], t0, .45);
              host.audio.previewNote(ms[1], t0 + .5, .45);
              last = .5;
          }
          else {
              host.audio.previewNote(ms[0], t0, .45);
              host.audio.previewNote(ms[1], t0 + .5, .45);
              host.audio.previewNote(ms[0], t0 + 1.15, .8);
              host.audio.previewNote(ms[1], t0 + 1.15, .8);
              last = 1.15;
          }
      }
      else if (ek.kind === 'ch') {
          ms.forEach((m, i: number) => host.audio.previewNote(m, t0 + i * .16, .4));
          const bt = ms.length * .16 + .1;
          ms.forEach((m) => host.audio.previewNote(m, t0 + bt, 1.1));
          host.audio.previewNote(ms[0], t0 + bt + 1.35, .6);
          last = bt + 1.35;
      }
      else {
          host.audio.previewNote(ms[0], t0, .5);
          ms.forEach((m, i: number) => host.audio.previewNote(m, t0 + .85 + i * .5, .45));
          last = .85 + (ms.length - 1) * .5;
      }
      return .25 + last;
  }
  function ekPlay(q: TrainerQuestion) {
      const ek = q.ek;
      if (!ek || SES.answered)
          return;
      const wait = (ekSound(q) + .3) * 1000;
      ek.armAt = performance.now() + wait;
      ek.seq = [];
      ek.warned = false;
      clearTimeout(ek.goT);
      kbClear('good');
      kbClear('bad');
      kbClear('target');
      kbState(ek.target[0], 'target', true);
      ekProg(q, 0);
      neutral(() => t('ek_listen'));
      ek.goT = setTimeout(() => { if (SES.q === q && !SES.answered && !ek.seq.length)
          neutral(() => t('ek_go')); }, wait);
  }
  function ekProg(q: TrainerQuestion, k: number) { const ek = q.ek; byId('q-ekprog').innerHTML = ek ? Array.from({ length: ek.n }, (_, i) => '<i' + (i < k ? ' class="on"' : '') + '></i>').join('') : ''; }
  function ekFlash(ms: number[], s: string) { ms.forEach((m) => kbState(m, s, true)); }
  function ekOn(q: TrainerQuestion, m: number | null | undefined) {
      const ek = q.ek;
      if (m == null)
          return;
      const now = performance.now();
      if (!ek)
          return;
      if (now < ek.armAt) {
          if (!ek.warned) {
              ek.warned = true;
              neutral(() => t('ek_wait'));
          }
          return;
      }
      if (ek.kind === 'mel') {
          ekMel(q, m);
          return;
      }
      if (ek.kind === 'ch') {
          const prev = ek.seq[ek.seq.length - 1];
          if (prev && !ek.seq.some((x) => shell.held.has(x.m) && x.m !== m) && now - prev.t > EK_CHORD_GAP)
              ek.seq = [];
      }
      ek.seq.push({ m, t: now });
      scheduleEval(() => ek.kind === 'iv' ? ekIv(q) : ekCh(q), ek.kind === 'iv' ? 90 : 140);
  }
  function ekOff(q: TrainerQuestion, m: number) { const ek = q.ek; if (!ek || SES.answered || ek.kind !== 'ch' || !ek.seq.length)
      return; scheduleEval(() => ekCh(q), 140); }
  function ekIv(q: TrainerQuestion) {
      const ek = q.ek;
      if (!ek || !SES.active || SES.answered || SES.q !== q || !ek.seq.length)
          return;
      const s = ek.seq, start = ek.target[0], semi = ek.target[1] - start; // semi < 0: a descending interval
      let a = s[0], b = s[1];
      if (b && Math.abs(b.t - a.t) <= 80 && (semi < 0 ? b.m > a.m : b.m < a.m)) {
          const x = a;
          a = b;
          b = x;
      } // struck together: the lower note is the start (the upper one when it descends)
      if (pc(a.m) !== pc(start)) {
          ekFlash([a.m], 'bad');
          setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
              kbState(start, 'target', true); } }, 420);
          ek.seq = [];
          ekProg(q, 0);
          neutral(() => t('ek_start_on', ekName(q, start)));
          return;
      }
      if (!b) {
          ekProg(q, 1);
          neutral(() => t('ek_progress', 1, 2));
          return;
      }
      if (b.m === a.m) {
          ek.seq = [a];
          return;
      }
      if (b.m - a.m === semi) {
          ekWin(q, [a.m, b.m]);
          return;
      }
      q.given = givenInterval(q, a.m, b.m, a.m);
      const wrongWay = semi < 0 ? b.m > a.m : b.m < a.m;
      ekMiss(q, [b.m], wrongWay ? t(semi < 0 ? 'ek_wrong_up' : 'ek_wrong_down') : t('ek_wrong_iv', intervalLabel(Math.abs(b.m - a.m))));
  }
  function ekCh(q: TrainerQuestion) {
      const ek = q.ek;
      if (!ek || ek.kind !== 'ch' || !SES.active || SES.answered || SES.q !== q || !ek.seq.length)
          return;
      const ms = [...new Set(ek.seq.map((x) => x.m))].sort((a, b) => a - b);
      const pcs = [...new Set(ms.map((m) => pc(m)))].sort((a, b) => a - b);
      const down = ms.some((m) => shell.held.has(m));
      if (setEq(pcs, ek.pcs)) {
          if (pc(ms[0]) === pc(ek.target[0]))
              ekWin(q, ms);
          else
              ekMiss(q, [ms[0]], t('ek_wrong_inv', ekName(q, ek.target[0])));
          return;
      }
      if (!isSubset(pcs, ek.pcs)) {
          q.given = givenChord(q, ms, ek.target, null);
          ekMiss(q, ms.filter((m) => !ek.pcs.includes(pc(m))), t('ek_wrong_ch'));
          return;
      }
      ekProg(q, pcs.length);
      if (down)
          neutral(() => t('ek_keep', pcs.length, ek.n));
      else {
          ek.seq = [];
          ekProg(q, 0);
          neutral(() => t('ek_hold'));
      }
  }
  function ekMel(q: TrainerQuestion, m: number) {
      const ek = q.ek;
      if (!ek || !SES.active || SES.answered || SES.q !== q)
          return;
      const tg = ek.target, i = ek.seq.length;
      if (i === 0) {
          if (pc(m) !== pc(tg[0])) {
              ekFlash([m], 'bad');
              setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
                  kbState(tg[0], 'target', true); } }, 420);
              neutral(() => t('ek_start_on', ekName(q, tg[0])));
              return;
          }
          ek.off = m - tg[0];
      }
      const want = tg[i] + ek.off;
      if (m !== want) {
          q.missed = true;
          q.given = givenNote(ek.seq.slice(-2).map((x) => x.m), m, want);
          ek.tries++;
          if (ek.tries >= EK_TRIES) {
              ek.seq = [];
              kbClear('good');
              ekFlash([m], 'bad');
              resolve(q, false);
              return;
          }
          ekFlash([m], 'bad');
          setTimeout(() => {
              if (SES.active && SES.q === q) {
                  kbClear('bad');
                  if (!SES.answered) ek.seq.forEach((x) => kbState(x.m, 'good', true));
              }
          }, 450);
          ekProg(q, ek.seq.length);
          const v = byId('q-verdict');
          v.className = 'verdict bad';
          v.textContent = t('ek_wrong_mel_keep', i + 1, t(m > want ? 'ek_high' : 'ek_low')) + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
          return;
      }
      ek.seq.push({ m, t: performance.now() });
      kbState(m, 'good', true);
      ekProg(q, ek.seq.length);
      if (ek.seq.length >= tg.length)
          ekWin(q, ek.seq.map((x) => x.m));
      else
          neutral(() => t('ek_progress', ek.seq.length, tg.length));
  }
  function ekWin(q: TrainerQuestion, ms: number[]) { if (!q.ek)
      return; q.ek.won = true; q.ek.played = ms; kbClear('target'); ekFlash(ms, 'good'); ekProg(q, q.ek.n); resolve(q, true); }
  function ekMiss(q: TrainerQuestion, bad: number[], msg: string) {
      const ek = q.ek;
      q.missed = true;
      if (!ek)
          return;
      ek.tries++;
      ek.seq = [];
      kbClear('good');
      ekFlash(bad, 'bad');
      if (ek.tries >= EK_TRIES) {
          resolve(q, false);
          return;
      }
      setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
          kbState(ek.target[0], 'target', true); } }, 500);
      ekProg(q, 0);
      const v = byId('q-verdict');
      v.className = 'verdict bad';
      v.textContent = msg + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
  }
  function ekReset() { const q = SES.q; if (!q || !q.ek || SES.answered)
      return; q.ek.seq = []; kbClear('good'); kbClear('bad'); kbState(q.ek.target[0], 'target', true); ekProg(q, 0); neutral(() => t('ek_reset_msg')); }
  function ekElab(q: TrainerQuestion) {
      const ek = q.ek, names = (ms: number[]) => ms.map((m) => ekName(q, m)).join(' ');
      if (!ek)
          return '';
      if (ek.kind === 'iv')
          return t('ek_el_iv', ekName(q, ek.target[0])) + ' · ' + names(ek.target);
      if (ek.kind === 'ch')
          return t('ek_el_ch', invName(ek.inv), names(ek.target));
      return t('ek_el_mel', names(ek.target));
  }
  /* play-mode grading via held notes */
  function sesInput(midi: number) {
      if (techniqueDrillActive() && SES.targeted?.cat === TECHNIQUE_TOPIC) {
          techniqueInput(techniqueHost, midi, inputTime()); // the key's own time, less its calibrated latency
          return;
      }
      const q = SES.q;
      if (!q || SES.answered)
          return;
      if (q.ek) {
          ekOn(q, midi);
          return;
      }
      if (q.mode !== 'play')
          return;
      if (q.it.cat === 'interval')
          scheduleEval(() => gradeInterval(q), 200);
      else if (q.it.cat === 'chord')
          scheduleEval(() => gradeChord(q), 300);
      else if (q.it.cat === 'scale')
          gradeScaleNote(q, midi);
      else if (q.it.cat === 'prog')
          scheduleEval(() => gradeProgChord(q), 220);
  }
  function gradeInterval(q: TrainerQuestion) {
      if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'interval')
          return;
      const ms = heldMidis().sort((a, b) => a - b);
      if (ms.length < 2)
          return;
      if (ms.length > 2) {
          neutral(() => t('just_two'));
          return;
      }
      const lo = ms[0], hi = ms[1];
      if (pc(lo) === q.key && hi - lo === q.it.semi) {
          [lo, hi].forEach((m) => kbState(m, 'good', true));
          resolve(q, true);
      }
      else {
          [lo, hi].forEach((m) => kbState(m, 'bad', true));
          setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 500);
          q.missed = true;
          q.given = givenInterval(q, lo, hi, pc(lo) === q.key ? lo : theory.practiceTonicMidi(q.key));
          resolve(q, false);
      }
  }
  function gradeChord(q: TrainerQuestion) {
      if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'chord')
          return;
      const hp = heldPcs(), tpl = q.it.ref, target = chordTargetPcs(q.key, tpl);
      if (!hp.length)
          return;
      if (setEq(hp, target)) {
          const inv = inversionOf(q.key, tpl, Math.min(...heldMidis()));
          if (!host.store.data().settings.allowInv && inv !== 0) {
              neutral(() => t('root_pos', rootName(q.key)));
              return;
          }
          heldMidis().forEach((m) => kbState(m, 'good', true));
          resolve(q, true);
          return;
      }
      if (isSubset(hp, target)) {
          neutral(() => t('keep_building') + ' (' + hp.length + '/' + target.length + ')');
          return;
      }
      if (isSubset(target, hp)) {
          neutral(() => t('release_extra'));
          return;
      }
      if (hp.length >= target.length) {
          heldMidis().forEach((m) => kbState(m, 'bad', true));
          setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 500);
          q.missed = true;
          q.given = givenChord(q, heldMidis(), tpl.intervals.map((i) => theory.practiceTonicMidi(q.key) + i), null);
          resolve(q, false);
      }
  }
  function gradeScaleNote(q: TrainerQuestion, midi: number | null | undefined) {
      if (!SES.active || SES.answered || SES.q !== q || midi == null || !q.offs)
          return;
      if (q.idx === 0) {
          if (pc(midi) !== q.key) {
              kbState(midi, 'bad', true);
              setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 400);
              neutral(() => t('start_on', rootName(q.key)));
              return;
          }
          q.anchor = midi;
      }
      if (q.anchor === null)
          return;
      const want = q.anchor + q.offs[q.idx];
      if (midi === want) {
          kbState(midi, 'good', true);
          q.idx++;
          if (q.idx >= q.offs.length) {
              resolve(q, true);
          }
          else
              neutral(() => q.idx + ' / ' + (q.offs?.length ?? 0) + ' ✓');
      }
      else {
          kbState(midi, 'bad', true);
          setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 420);
          q.missed = true;
          q.given = givenNote(q.offs.slice(Math.max(0, q.idx - 2), q.idx).map((o) => (q.anchor ?? 0) + o), midi, want);
          resolve(q, false);
      }
  }
  function gradeProgChord(q: TrainerQuestion) {
      if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'prog')
          return;
      const ch = q.it.ref.chords[q.idx], root = (q.key + ch[0]) % 12, tpl = progChordTpl(ch[1]);
      const target = chordTargetPcs(root, tpl), hp = heldPcs();
      if (!hp.length)
          return;
      if (setEq(hp, target)) {
          q.idx++;
          if (q.idx >= q.it.ref.chords.length) {
              resolve(q, true);
          }
          else {
              kbClear('target');
              neutral(() => t('prog_next_chord'));
              setTimeout(() => { if (SES.active && SES.q === q && !SES.answered) showProgTarget(q); }, 250);
          }
          return;
      }
      if (isSubset(hp, target) || isSubset(target, hp))
          return;
      if (hp.length >= target.length) {
          heldMidis().forEach((m) => kbState(m, 'bad', true));
          setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 420);
          q.missed = true;
          q.given = givenChord(q, heldMidis(), tpl ? tpl.intervals.map((i) => 60 + root + i) : [], q.idx + 1);
          resolve(q, false);
      }
  }
  /* ---------- error-aware feedback: what was given against what was expected (feedback.ts) ---------- */
  function noteNames(ms: readonly number[]) { return ms.map((m) => rootName(pc(m))).join('–'); }
  function chordLabel(rootPc: number, ref: theory.ChordTemplate) { return formatChord(rootName(rootPc), dispSym(ref.symbol)) + ' · ' + chordDisp(ref); }
  // The item id an ear answer stands for, as the item list names them.
  function earOptionId(cat: string, k: number | string) { return (cat === 'interval' ? 'iv:' : cat === 'chord' ? 'ch:' : cat === 'scale' ? 'sc:' : 'pr:') + k; }
  function progMidis(rootPc: number, prog: theory.ProgressionTemplate) { return prog.chords.map((ch) => { const root = 60 + ((rootPc + ch[0]) % 12), tpl = progChordTpl(ch[1]); return tpl ? tpl.intervals.map((iv) => root + iv) : []; }); }
  function givenByEar(q: TrainerQuestion, k: number | string): TrainerGiven | null {
      const it = q.it, pair = ITEM_BY_ID[earOptionId(it.cat, k)] ? earOptionId(it.cat, k) : undefined;
      if (it.cat === 'interval' && typeof k === 'number') {
          const r = earRoot(q), two = (semi: number) => feedbackBroken(q.dir === 'desc' ? [r + semi, r] : [r, r + semi]);
          return { text: () => t('fb_picked', ivName(k), ivName(it.semi)), given: two(k), expected: two(it.semi), pair };
      }
      if (it.cat === 'chord') {
          const ref = CHORDS.find((c) => c.symbol === k);
          if (!ref)
              return null;
          const base = earRoot(q);
          return { text: () => t('fb_picked', chordDisp(ref), chordDisp(it.ref)), given: feedbackBroken(ref.intervals.map((i) => base + i), 0.16, 1.1), expected: feedbackBroken(it.ref.intervals.map((i) => base + i), 0.16, 1.1), pair };
      }
      if (it.cat === 'scale' && typeof k === 'string' && SCALES[k]) {
          const line = (name: string) => feedbackLine(SCALES[name].concat([12]).map((o) => theory.practiceTonicMidi(q.key) + o));
          return { text: () => t('fb_picked', scaleDisp(k), scaleDisp(it.name)), given: line(k), expected: line(it.name), pair };
      }
      if (it.cat === 'prog') {
          const prog = PROGS.find((p) => p.name === k);
          if (!prog)
              return null;
          return { text: () => t('fb_picked', progDisp(prog.name), progDisp(it.ref.name)), given: feedbackChords(progMidis(q.key, prog)), expected: feedbackChords(progMidis(q.key, it.ref)), pair };
      }
      return null;
  }
  // Two keys for an interval question; `from` is where the expected interval is sounded (the right start note when it was played).
  function givenInterval(q: TrainerQuestion, lo: number, hi: number, from: number): TrainerGiven | null {
      const it = q.it;
      if (it.cat !== 'interval')
          return null;
      const sign = q.dir === 'desc' ? -1 : 1, semi = hi - lo, rootOk = pc(lo) === q.key || (!!q.ek && pc(lo) === pc(q.ek.target[0]));
      const given = () => rootOk ? intervalLabel(Math.abs(semi)) : noteNames([lo, hi]) + ' (' + intervalLabel(Math.abs(semi)) + ')';
      const expected = () => rootOk ? ivName(it.semi) : ivName(it.semi) + ' ' + t('above') + ' ' + rootName(q.key);
      const pair = rootOk && semi * sign > 0 && ITEM_BY_ID['iv:' + Math.abs(semi)] ? 'iv:' + Math.abs(semi) : undefined;
      return { text: () => t('fb_played', given(), expected()), given: feedbackBroken([lo, hi]), expected: feedbackBroken([from, from + sign * it.semi]), pair };
  }
  // Keys for a chord question (or chord `chordNo` of a progression), named as a chord when they make one.
  function givenChord(q: TrainerQuestion, ms: readonly number[], expectedMidis: readonly number[], chordNo: number | null): TrainerGiven | null {
      const sorted = [...ms].sort((a, b) => a - b), id = identifyChord(sorted);
      const given = () => id ? chordLabel(id.rootPc, id.chord) : t('fb_notes', noteNames(sorted));
      const it = q.it;
      let expected = () => noteNames(expectedMidis), pair: string | undefined;
      if (it.cat === 'chord' && chordNo === null) {
          const tpl = it.ref;
          expected = () => chordLabel(q.key, tpl);
          if (id && id.rootPc === q.key && ITEM_BY_ID['ch:' + id.chord.symbol])
              pair = 'ch:' + id.chord.symbol;
      }
      else if (it.cat === 'prog' && chordNo !== null) {
          const ch = it.ref.chords[chordNo - 1], tpl = ch ? progChordTpl(ch[1]) : undefined;
          if (ch && tpl)
              expected = () => chordLabel((q.key + ch[0]) % 12, tpl);
      }
      const text = () => chordNo === null ? t('fb_played', given(), expected()) : t('fb_chord_n', given(), chordNo, expected());
      return { text, given: feedbackBroken(sorted, 0.16, 1.1), expected: feedbackBroken(expectedMidis, 0.16, 1.1), pair };
  }
  // A wrong note in a line (scale or melody), heard after the notes before it.
  function givenNote(before: readonly number[], midi: number, want: number): TrainerGiven {
      return { text: () => t('fb_note', rootName(pc(midi)), rootName(pc(want))), given: feedbackLine([...before, midi]), expected: feedbackLine([...before, want]) };
  }
  function playGivenAndExpected(g: TrainerGiven) {
      ensureAudio();
      stopPreviews();
      const start = shell.audioEngine.context?.currentTime ?? 0;
      feedbackSchedule(g.given, g.expected).forEach((n) => host.audio.previewNote(n.midi, start + n.at, n.dur));
  }
  // After a session: offer a short contrast drill when two items were mixed up more than once (and report one just finished).
  function contrastOfferHide() { const box = maybeById('ses-contrast'); if (box)
      box.hidden = true; }
  function contrastOffer(anchor: HTMLElement, finished: { correct: number; total: number } | null) {
      const pair = confusions.top(), a = pair ? ITEM_BY_ID[pair.expected] : undefined, b = pair ? ITEM_BY_ID[pair.given] : undefined;
      let box = maybeById('ses-contrast');
      if (!box) {
          box = document.createElement('div');
          box.id = 'ses-contrast';
          box.className = 'verdict neutral cf-offer';
          box.setAttribute('role', 'status');
      }
      anchor.after(box);
      const lines: string[] = [];
      if (finished && finished.total)
          lines.push(`<span>${rdEsc(t('cf_done', finished.correct, finished.total))}</span>`);
      if (pair && a && b)
          lines.push(`<span>${rdEsc(t('cf_offer', itemLabel(a), itemLabel(b), pair.count))}</span> <button type="button" class="btn sm primary" id="cf-start">${rdEsc(t('cf_start', CONTRAST_LENGTH))}</button>`);
      box.innerHTML = lines.join('<br>');
      box.hidden = !lines.length;
      const go = maybeById('cf-start');
      if (go && pair)
          go.onclick = () => startContrast(pair);
  }
  function startContrast(pair: ConfusionPair) {
      const a = ITEM_BY_ID[pair.expected], b = ITEM_BY_ID[pair.given];
      if (!a || !b || a.cat !== b.cat)
          return;
      byId('summary').style.display = 'none';
      host.nav.show('practice');
      startSession({ cat: a.cat, mode: 'ear', key: 'all' }, { a: a.id, b: b.id, order: contrastOrder(a.id, b.id) });
  }
  function neutral(text: () => string) {
      if (SES.q) SES.q.verdictText = text;
      const v = byId('q-verdict');
      v.className = 'verdict neutral';
      v.textContent = text();
  }
  // The Today plan's Ear check: right answers by ear today (earDay, earToday), in any drill and in the review session.
  function countEarAnswer() {
      const tn = todayN();
      if (host.store.data().earDay !== tn) {
          host.store.data().earDay = tn;
          host.store.data().earToday = 0;
      }
      host.store.data().earToday = (host.store.data().earToday || 0) + 1;
      saveSoon();
  }
  function resolve(q: TrainerQuestion, correct: boolean) {
      if (SES.answered)
          return;
      SES.answered = true;
      stopMetro();
      stopDrone();
      const good = correct && !q.missed;
      if (SES.placement) {
          q.placementKnown = good;
      }
      else if (!SES.targeted)
          reviewItem(q.it.id, good); // targeted drills are free practice: no schedule, daily-goal or streak change
      SES.total++;
      if (good)
          SES.correct++;
      if (good && q.mode === 'ear' && !SES.placement)
          countEarAnswer();
      const v = byId('q-verdict');
      if (correct && !q.missed) {
          v.className = 'verdict good';
          const praise = randItem(['correct1', 'correct2', 'correct3', 'correct4']);
          q.verdictText = () => t(praise);
      }
      else if (correct && q.ek) {
          v.className = 'verdict neutral';
          const tries = q.ek.tries + 1;
          q.verdictText = () => t('ek_retry_ok', tries);
      } // reproduced after a miss: counts as a lapse
      else {
          v.className = 'verdict bad';
          q.verdictText = q.given?.text ?? (() => t('notquite'));
      }
      v.textContent = q.verdictText();
      q.wasWrong = !correct;
      if (!correct && q.given && q.given.pair && !SES.placement && !SES.contrast)
          confusions.record(q.it.id, q.given.pair);
      if (q.ek) {
          ekStop(q);
          byId('q-ekreset').hidden = true;
      }
      revealAnswerKeys(q);
      showElaboration(q);
      if (!good) {
          sesStopAnswerReplay();
          sesAnswerReplay = setTimeout(() => { if (SES.active && SES.q === q && SES.answered)
              playQuestionSound(q); }, 600);
          const given = correct ? null : q.given;
          if (given) { // Hear both: the given sound, then the expected one (it replaces the replay still to come)
              const both = byId('q-both');
              both.hidden = false;
              both.onclick = () => { sesStopAnswerReplay(); playGivenAndExpected(given); };
          }
      } // let the right answer be heard, not just seen
      byId('q-reveal').hidden = true;
      byId('q-next').hidden = false;
      byId('q-next').focus();
  }
  function revealAnswerKeys(q: TrainerQuestion) {
      const it = q.it;
      if (q.ek) {
          if (!q.ek.won) {
              kbClear('target');
              kbClear('good');
              q.ek.target.forEach((m) => kbState(m, 'target', true));
          }
          return;
      }
      if (it.cat === 'interval') {
          const r = q.mode === 'ear' ? earRoot(q) : theory.practiceTonicMidi(q.key);
          [r, r + it.semi].forEach((m) => kbState(m, 'target', true));
      }
      else if (it.cat === 'chord') {
          const r = q.mode === 'ear' ? earRoot(q) : theory.practiceTonicMidi(q.key);
          it.ref.intervals.forEach((i) => kbState(r + i, 'target', true));
      }
      else if (it.cat === 'scale') {
          const r = theory.practiceTonicMidi(q.key);
          SCALES[it.name].concat([12]).forEach((o) => kbState(r + o, 'target', true));
      }
  }
  function showElaboration(q: TrainerQuestion) {
      const it = q.it, e = byId('q-elab');
      let html = '';
      if (it.cat === 'interval') {
          const s = songsFor(it.semi, q.dir ?? 'asc');
          html = '<b>' + ivName(it.semi) + '</b> = ' + it.semi + ' ' + t('el_semitones') + (s.length && !/^\(/.test(s[0]) ? ' · ' + t('el_soundslike') + ' “' + s[0] + '”' : '');
      }
      else if (it.cat === 'chord') {
          const f = feelDisp(it.short);
          html = '<b>' + formatChord(rootName(q.key), dispSym(it.short)) + '</b> = ' + chordFormula(it.ref) + (f ? ' · ' + f : '');
      }
      else if (it.cat === 'scale') {
          html = '<b>' + scaleDisp(it.name) + '</b> · ' + t('el_degrees') + ' ' + scaleFormula(SCALES[it.name]);
      }
      else if (it.cat === 'prog') {
          const chain = it.ref.chords.map((ch) => formatChord(rootName((q.key + ch[0]) % 12), dispSym(ch[1]))).join(' · '), rom = it.ref.chords.map((ch) => ch[2]).join(' · ');
          html = '<b>' + rom + '</b> — ' + chain;
      }
      if (q.ek)
          html += '<br>' + ekElab(q);
      if (q.wasWrong && q.given?.pair) {
          const other = ITEM_BY_ID[q.given.pair];
          const esc = xmlEsc;
          let diff = '';
          if (other && it.cat === 'interval' && other.cat === 'interval') {
              const cue = differentialIntervalCue(it.semi, other.semi);
              if (cue?.kind === 'interval') {
                  diff = t(cue.diffSemis > 0 ? 'el_diff_iv_wider' : 'el_diff_iv_narrower', ivName(it.semi), Math.abs(cue.diffSemis), ivName(other.semi));
              }
          }
          else if (other && it.cat === 'chord' && other.cat === 'chord') {
              const cue = differentialToneCue(it.ref.intervals, other.ref.intervals);
              if (cue?.kind === 'tones') {
                  const degs = (pcs: readonly number[]) => pcs.map((p) => SCALE_DEGREE_LABELS[p] ?? String(p)).join(', ') || '—';
                  diff = t('el_diff_tones', formatChord(rootName(q.key), dispSym(it.short)), degs(cue.onlyExpected), degs(cue.onlyGiven), formatChord(rootName(q.key), dispSym(other.short)));
              }
          }
          else if (other && it.cat === 'scale' && other.cat === 'scale') {
              const cue = differentialToneCue(SCALES[it.name] || [], SCALES[other.name] || []);
              if (cue?.kind === 'tones') {
                  const degs = (pcs: readonly number[]) => pcs.map((p) => SCALE_DEGREE_LABELS[p] ?? String(p)).join(', ') || '—';
                  diff = t('el_diff_tones', scaleDisp(it.name), degs(cue.onlyExpected), degs(cue.onlyGiven), scaleDisp(other.name));
              }
          }
          if (diff)
              html += '<br><span class="elab-diff">' + esc(diff) + '</span>';
      }
      e.innerHTML = html;
      e.classList.add('show');
  }
  let practiceHintPreview: PracticeHintPreview | null = null;
  let practiceHintPanelState = '';
  const practiceStudy: StudyHintState = {
      open: { prog: null, technique: null },
      family: { chord: 'major', scale: 'core', prog: 'popular', melody: 'easy' },
      chordShowAll: false,
      hand: 'rh',
      chords: new Map(),
      inversions: new Map(),
      scaleHands: new Map(),
  };
  function setHintControlPressed(button: HTMLButtonElement, pressed: boolean) {
      const ownsPressed = button.classList.contains('pr-hint-play')
          || button.classList.contains('pr-hint-compare')
          || (button.dataset.hintControl?.endsWith(':keys') ?? false);
      if (ownsPressed) button.setAttribute('aria-pressed', String(pressed));
      button.classList.toggle('is-playing', pressed);
      // Keep aria-label stable for aria-pressed toggle buttons (WAI-ARIA APG); update visual tooltip.
      const nextTitle = pressed ? button.dataset.labelStop : button.dataset.labelPlay;
      if (nextTitle) button.title = nextTitle;
  }
  function syncActiveHintControls(activeControlId: string | null) {
      const box = maybeById('practiceHintsList');
      if (!box) return;
      for (const button of box.querySelectorAll<HTMLButtonElement>('button[data-hint-control].is-playing, button[data-hint-control].pr-hint-play, button[data-hint-control].pr-hint-compare')) {
          setHintControlPressed(button, activeControlId !== null && button.dataset.hintControl === activeControlId);
      }
      for (const card of box.querySelectorAll<HTMLElement>('.pr-hint-card.is-playing')) {
          card.classList.remove('is-playing');
      }
      if (activeControlId) {
          const activeBtn = [...box.querySelectorAll<HTMLButtonElement>('button[data-hint-control]')]
              .find(button => button.dataset.hintControl === activeControlId);
          if (activeBtn) {
              setHintControlPressed(activeBtn, true);
              activeBtn.closest('.pr-hint-card')?.classList.add('is-playing');
          }
      }
  }
  function paintPracticeHintKeys() {
      shell.keyEl.forEach(key => { delete key.dataset.prHintKey; });
      if (!practiceHintPreview?.keys) return;
      for (const note of practiceHintPreview.notes) {
          const key = shell.keyEl.get(note.midi) ?? shell.keyEl.get(foldToView(note.midi));
          if (key) key.dataset.prHintKey = note.finger === undefined ? '●' : String(note.finger);
      }
  }
  function clearPracticeHintPreview() {
      if (!practiceHintPreview) return;
      const { frame, originalLow, diagram } = practiceHintPreview;
      practiceHintPreview = null;
      cancelAnimationFrame(frame);
      syncActiveHintControls(null);
      diagram?.paint();
      if (originalLow !== null && shell.keyboardView.low !== originalLow) {
          shell.keyboardView.low = Math.min(originalLow, shell.baseHigh - shell.keyboardView.oct * 12);
          buildKeyboard();
          repaintHeld();
      } else paintPracticeHintKeys();
      dockSync();
  }
  async function playPracticeHint(id: string, steps: readonly PracticeHintStep[], keys: boolean, diagram?: PracticeHintDiagram, controlId?: string) {
      const panel = byId('pr-songs');
      if (view0() !== 'practice' || SES.active || accomp.on || !(panel instanceof HTMLDetailsElement) || !panel.open) return;
      const resolvedControl = controlId ?? id;
      if (keys && practiceHintPreview?.id === id && practiceHintPreview.keys !== true) {
          practiceHintPreview.keys = true;
          practiceHintPreview.controlId = resolvedControl;
          syncActiveHintControls(resolvedControl);
          dockSync();
          showPracticeHintNotes(practiceHintPreview);
          return;
      }
      if (practiceHintPreview && (practiceHintPreview.controlId === resolvedControl || (practiceHintPreview.id === id && !controlId))) {
          stopPreviews();
          return;
      }
      stopPreviews();
      const context = ensureAudio();
      if (!context) return;
      const preview: PracticeHintPreview = { id, controlId: resolvedControl, keys: keys ? true : null, frame: 0, notes: [], originalLow: null, diagram };
      practiceHintPreview = preview;
      syncActiveHintControls(resolvedControl);
      dockSync();
      if (context.state !== 'running' && !await timedAudioReady(context)) {
          if (practiceHintPreview === preview) clearPracticeHintPreview();
          return;
      }
      if (practiceHintPreview !== preview) return;
      if (shell.audioEngine.context !== context) {
          clearPracticeHintPreview();
          return;
      }
      let next = context.currentTime + 0.045;
      const timing = steps.map(step => {
          const at = next, end = at + step.seconds;
          next = end + (step.gap ?? 0);
          step.notes.forEach(note => host.audio.previewNote(note.midi, at, step.seconds));
          return { at, end, notes: step.notes, diagramKey: step.diagramKey };
      });
      const silence: readonly PracticeHintNote[] = [];
      let index = 0;
      const paint = () => {
          if (practiceHintPreview !== preview) return;
          const now = context.currentTime;
          while (index < timing.length && now >= timing[index].end) index++;
          if (index === timing.length || context.state === 'closed') {
              clearPracticeHintPreview();
              return;
          }
          const event = timing[index];
          const notes = now >= event.at ? event.notes : silence;
          const diagramKey = now >= event.at ? event.diagramKey : preview.diagramKey;
          if (notes !== preview.notes || diagramKey !== preview.diagramKey) {
              preview.notes = notes;
              preview.diagramKey = diagramKey;
              showPracticeHintNotes(preview);
          }
          preview.frame = requestAnimationFrame(paint);
      };
      preview.frame = requestAnimationFrame(paint);
  }
  function showPracticeHintNotes(preview: PracticeHintPreview) {
      if (preview.keys && preview.notes.length) {
          const lo = Math.min(...preview.notes.map(note => note.midi));
          const hi = Math.max(...preview.notes.map(note => note.midi));
          if (lo < shell.keyboardView.low || hi > viewHigh()) {
              preview.originalLow ??= shell.keyboardView.low;
              const span = shell.keyboardView.oct * 12;
              shell.keyboardView.low = Math.max(shell.baseLow, Math.min(shell.baseHigh - span, lo, Math.max(shell.keyboardView.low, hi - span)));
              buildKeyboard();
              repaintHeld();
          }
          dockKeyInSight(foldToView(lo));
      }
      paintPracticeHintKeys();
      if (preview.keys || preview.diagram?.followWithoutDock) preview.diagram?.paint(preview.diagramKey, preview.notes);
      else preview.diagram?.paint();
  }
  function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
      return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
  }
  let practiceHintsView: typeof import('../../domain/practice-hints-view.js') | null = null;
  let practiceHintsLoading: Promise<typeof import('../../domain/practice-hints-view.js')> | null = null;
  function ensurePracticeHintsView(): Promise<typeof import('../../domain/practice-hints-view.js')> {
      if (practiceHintsView) return Promise.resolve(practiceHintsView);
      if (!practiceHintsLoading) {
          practiceHintsLoading = import('../../domain/practice-hints-view.js').then((mod) => {
              practiceHintsView = mod;
              return mod;
          }).catch((error: unknown) => {
              practiceHintsLoading = null;
              throw error;
          });
      }
      return practiceHintsLoading;
  }
  function syncPracticeHintsPanel() {
      const panel = byId('pr-songs');
      if (!(panel instanceof HTMLDetailsElement)) return;
      const { cat, key, mode } = prChoice();
      const hintTopic = cat === 'scale' && mode === 'tech' ? 'technique' : cat;
      const supported = isPracticeHintsTopic(hintTopic);
      const interval = cat === 'interval';
      const box = byId('practiceHintsList');
      panel.hidden = !supported && !interval;
      byId('songsList').hidden = !interval;
      box.hidden = !supported;
      const controls = queryHtml(panel, '.pr-songs-ctl');
      if (controls) controls.hidden = !interval;
      const state = panel.open ? `${hintTopic}|${key}|${mode}|${prChordTier}|${prScaleTier}|${prMelDiff}|${host.i18n.lang()}|${host.i18n.notation()}|${accomp.on}` : '';
      const title = queryHtml(panel, 'summary span'), lede = queryHtml(panel, '.pr-songs-lede');
      if (title && lede) {
          title.dataset.i18n = supported ? `pr_hints_${hintTopic}_title` : 'pr_songs';
          lede.dataset.i18n = supported ? `pr_hints_${hintTopic}_lede` : 'songs_lede';
          title.textContent = t(title.dataset.i18n);
          lede.textContent = t(lede.dataset.i18n);
      }
      if (practiceHintPanelState === state) return;
      practiceHintPanelState = state;
      if (practiceHintPreview) stopPreviews();
      if (!panel.open || panel.hidden) return;
      if (interval) renderSongs();
      else if (supported) {
          const renderHints = (mod: typeof import('../../domain/practice-hints-view.js')) => {
              mod.renderPracticeHintCards(box, hintTopic, {
                  tonic: key === 'all' ? null : Number(key),
                  audioOnly: mode === 'ear' || mode === 'keys' || mode === 'along',
                  disabled: cat === 'prog' && accomp.on,
                  text: t,
                  spell: (letter, acc) => spelledName(host.i18n.notation(), letter, acc),
                  chordName: symbol => chordDisp(progChordTpl(symbol) ?? symbol),
                  formatChord,
                  scaleName: scaleDisp,
                  play: (id, steps, keys, diagram, controlId) => { void playPracticeHint(id, steps, keys, diagram, controlId); },
                  stop: () => { if (practiceHintPreview) stopPreviews(); },
                  study: practiceStudy,
                  chordTier: prChordTier,
                  scaleTier: prScaleTier,
                  melodyDiff: prMelDiff,
              });
          };
          if (practiceHintsView) {
              renderHints(practiceHintsView);
          } else {
              const expectedState = state;
              void ensurePracticeHintsView().then((mod) => {
                  if (practiceHintPanelState === expectedState && panel.open && !panel.hidden) {
                      renderHints(mod);
                  }
              }, () => {
                  if (practiceHintPanelState === expectedState) practiceHintPanelState = '';
              });
          }
      }
  }
  /* ---------- PRACTICE: last drill result ---------- */
  function prRecordDrill() {
      if (!SES.targeted || !SES.total)
          return;
      const tg = SES.targeted;
      host.store.data().lastDrill = { cat: tg.cat, mode: tg.mode, keys: tg.mode === 'ear' && (tg.cat === 'melody' || !!host.store.data().settings.earKeys), key: tg.key, dir: tg.dir, c: SES.correct, n: SES.total, day: todayN() };
      if (tg.cat === 'melody') {
          const log = host.store.data().practiceLog ?? (host.store.data().practiceLog = {});
          log.melRuns = (log.melRuns || 0) + 1;
          log.melCorrect = (log.melCorrect || 0) + SES.correct;
          log.melTotal = (log.melTotal || 0) + SES.total;
      }
      saveAll();
  }
  // The five unified Practice topic cards (Scales combines theory drills + Technique fingerings).
  const PR_TOPICS: readonly string[] = ['interval', 'chord', 'scale', 'prog', 'melody'];
  const PR_KEYS: readonly string[] = ['all', ...Array.from({ length: 12 }, (_, i) => String(i))];
  // A small glyph per topic card (24 × 24, drawn in currentColor).
  const PR_GLYPH: Record<string, string> = {
      interval: '<ellipse cx="7.5" cy="17" rx="3.4" ry="2.5" fill="currentColor"/><ellipse cx="16.5" cy="7" rx="3.4" ry="2.5" fill="currentColor"/><path d="M9.5 14.6 14.5 9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1.5 2.4"/>',
      chord: '<ellipse cx="12" cy="5.5" rx="3.6" ry="2.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="3.6" ry="2.5" fill="currentColor"/><ellipse cx="12" cy="18.5" rx="3.6" ry="2.5" fill="currentColor"/>',
      scale: '<circle cx="4.5" cy="19" r="2.4" fill="currentColor"/><circle cx="9.5" cy="14.5" r="2.4" fill="currentColor"/><circle cx="14.5" cy="10" r="2.4" fill="currentColor"/><circle cx="19.5" cy="5.5" r="2.4" fill="currentColor"/>',
      prog: '<rect x="2.5" y="9" width="5" height="11" rx="1.4" fill="currentColor"/><rect x="9.5" y="4" width="5" height="16" rx="1.4" fill="currentColor" opacity=".7"/><rect x="16.5" y="11" width="5" height="9" rx="1.4" fill="currentColor"/>',
      melody: '<path d="M8.5 17.5V6.2l11-2.4v11.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="6" cy="17.6" rx="3" ry="2.3" fill="currentColor"/><ellipse cx="17" cy="15.4" rx="3" ry="2.3" fill="currentColor"/>',
  };
  let practiceModePref: PracticeMode = 'play';
  let prIvDir: IntervalDirection = 'asc';
  let prIvStyle: IntervalStyle = 'both';
  let prChordTier: ChordTier = 'triads';
  let prScaleTier: ScaleTier = 'core';
  let prMelDiff: MelodyDifficulty = 'easy';
  let prMelLen: number | 'auto' = 'auto';
  let prMelScale: string = 'auto';
  let prProgLastDrill: 'play' | 'ear' = 'play';
  let melDemoTimer: number | undefined;
  let melDemoPlaying = false;
  function isPracticeMode(v: string | undefined): v is PracticeMode { return v === 'play' || v === 'ear' || v === 'keys' || v === 'along' || v === 'tech'; }
  function prTopicLabel(cat: string) { return cat === 'melody' ? t('cat_melody') : (cat === 'scale' || cat === TECHNIQUE_TOPIC) ? t('cat_technique') : catLabel(cat); }
  function prModeLabel(mode: PracticeMode, cat = prChoice().cat) {
      if (mode === 'tech') return t('pr_m_sc_tech');
      if (mode === 'along') return t('pr_along');
      if (mode === 'keys') return t('pr_onkeys');
      if (cat === 'interval') return t(mode === 'ear' ? 'pr_m_iv_ear' : 'pr_m_iv_play');
      if (cat === 'chord') return t(mode === 'ear' ? 'pr_m_ch_ear' : 'pr_m_ch_play');
      if (cat === 'scale') return t(mode === 'ear' ? 'pr_m_sc_ear' : 'pr_m_sc_play');
      if (cat === 'prog') return t(mode === 'ear' ? 'pr_m_pr_ear' : 'pr_m_pr_play');
      return t(mode === 'ear' ? 'pr_byear' : 'pr_playit');
  }
  function prKeyLabel(key: string | null | undefined) { return key == null || key === '' || key === 'all' ? t('all_keys') : rootName(+key || 0); }
  function normalizePracticeTopic(raw: string): string { return raw === TECHNIQUE_TOPIC ? 'scale' : raw; }
  /** The chosen topic, mode and key. Melodies are always on the keys; scales support technique, ear, or play. */
  function prChoice(): { cat: string; mode: PracticeMode; key: string } {
      const rawCat = selectById('pr-cat').value;
      const cat = normalizePracticeTopic(rawCat);
      const v = queryHtml(byId('pr-mode'), 'button[aria-pressed="true"]')?.dataset.v;
      let mode: PracticeMode = 'play';
      if (cat === 'melody') mode = 'keys';
      else if (cat === 'scale') mode = (v === 'tech' || v === 'ear' || v === 'play') ? v : 'tech';
      else if (cat === 'prog') mode = (v === 'along' || v === 'ear' || v === 'play') ? v : prProgLastDrill;
      else mode = isPracticeMode(v) && v !== 'tech' && v !== 'along' ? v : 'play';
      return { cat, mode, key: selectById('pr-key').value || 'all' };
  }
  function prSetTopic(cat: string) {
      if (cat === TECHNIQUE_TOPIC) {
          selectById('pr-cat').value = 'scale';
          syncPracticeCatAndMode();
          prSetMode('tech');
          return;
      }
      if (!PR_TOPICS.includes(cat))
          return;
      selectById('pr-cat').value = cat;
      syncPracticeCatAndMode();
  }
  // Picking an ear mode saves the on-keys choice (settings.earKeys); a mode the topic does not allow is ignored.
  function prSetMode(v: PracticeMode) {
      const pm = byId('pr-mode'), b = queryHtml(pm, `button[data-v="${v}"]`);
      if (!(b instanceof HTMLButtonElement) || b.disabled)
          return;
      queryAllHtml(pm, 'button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      if (v !== 'along') // Play along is not kept: back on Practice, or from a topic link, the setup offers the last drill mode
          practiceModePref = v;
      if (prChoice().cat === 'prog' && (v === 'play' || v === 'ear'))
          prProgLastDrill = v;
      if (v === 'ear' || v === 'keys') {
          host.store.data().settings.earKeys = v === 'keys';
          saveAll();
      }
      syncPracticeProgSplit();
      updatePracticeModeHint();
  }
  // Play along chosen on the Practice screen, with no drill running: the keys light up there.
  function prAlongWanted(v = view0()) { return v === 'practice' && !SES.active && prChoice().mode === 'along'; }
  function isIntervalDirection(v: string | undefined): v is IntervalDirection { return v === 'asc' || v === 'desc' || v === 'both'; }
  function prDirLabel(dir: IntervalDirection) { return t(dir === 'desc' ? 'dir_desc' : dir === 'both' ? 'dir_both' : 'dir_asc'); }
  // Direction applies to Intervals by ear (tap or on the keys): the row shows only then, and only then goes with the drill.
  function prDirShown() { const { cat, mode } = prChoice(); return cat === 'interval' && mode !== 'play'; }
  function prSetDir(v: string) {
      if (!isIntervalDirection(v))
          return;
      prIvDir = v;
      queryAllHtml(byId('pr-dir'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      updatePracticeModeHint();
  }
  function prSetIvStyle(v: string) {
      if (v !== 'both' && v !== 'melodic' && v !== 'harmonic') return;
      prIvStyle = v;
      queryAllHtml(byId('pr-iv-style'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      const dirWrap = maybeById('pr-dir-wrap');
      if (dirWrap) dirWrap.hidden = v === 'harmonic';
  }
  function prSetChordTier(v: string) {
      if (v !== 'triads' && v !== 'sevenths' && v !== 'all') return;
      prChordTier = v;
      practiceStudy.chordShowAll = false;
      queryAllHtml(byId('pr-chord-tier'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      syncPracticeHintsPanel();
  }
  function prSetScaleTier(v: string) {
      if (v !== 'core' && v !== 'modes' && v !== 'all') return;
      prScaleTier = v;
      practiceStudy.family.scale = v === 'modes' ? 'modes' : v === 'all' ? 'all' : 'core';
      queryAllHtml(byId('pr-scale-tier'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      syncPracticeHintsPanel();
  }
  function prSetMelDiff(v: string) {
      if (v !== 'easy' && v !== 'medium' && v !== 'advanced') return;
      prMelDiff = v;
      practiceStudy.family.melody = v;
      queryAllHtml(byId('pr-mel-diff'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
      syncPracticeHintsPanel();
  }
  function clearMelodyDemoPreview() {
      if (melDemoTimer) { clearTimeout(melDemoTimer); melDemoTimer = undefined; }
      melDemoPlaying = false;
      const btn = maybeById('pr-mel-demo');
      if (btn) {
          btn.setAttribute('aria-pressed', 'false');
          btn.textContent = t('pr_mel_demo');
      }
  }
  function toggleMelodyDemo() {
      if (melDemoPlaying) { stopPreviews(); return; }
      stopPreviews();
      const ctx = ensureAudio();
      if (!ctx) return;
      const cfg = melodyConfigForSession(prMelDiff, prMelLen, prMelScale);
      const scaleName = cfg.scaleNames[0] ?? 'Major (Ionian)';
      const offs = SCALES[scaleName] ?? SCALES['Major (Ionian)'];
      const keyVal = prChoice().key;
      const key = keyVal === 'all' ? 0 : (+keyVal || 0);
      const ton = theory.practiceTonicMidi(key, 'near-middle-c');
      const N = offs.length;
      const at = (d: number) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N);
      const stable = (d: number) => [0, 3, 4, 7].includes(pc(at(d) - ton));
      let d = 0;
      const ds = [0];
      for (let i = 1; i < cfg.len; i++) {
          const last = i === cfg.len - 1, opts: number[] = [];
          cfg.steps.forEach((s) => {
              const nd = d + s;
              if (nd < -2 || nd > N + 2 || (last && !stable(nd))) return;
              const w = Math.abs(s) === 1 ? cfg.stepWeight : Math.abs(s) === 2 ? 2 : 1;
              for (let k = 0; k < w; k++) opts.push(nd);
          });
          if (!opts.length) opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
          d = randItem(opts);
          ds.push(d);
      }
      const notes = ds.map(at);
      const playSeq = () => {
          if (!melDemoPlaying || shell.audioEngine.context !== ctx) return;
          const t0 = ctx.currentTime + 0.12;
          host.audio.previewNote(notes[0], t0, 0.45);
          notes.forEach((m, i) => host.audio.previewNote(m, t0 + 0.7 + i * 0.45, 0.4));
          const endMs = Math.round((0.7 + notes.length * 0.45 + 0.25) * 1000);
          melDemoTimer = window.setTimeout(() => clearMelodyDemoPreview(), endMs);
      };
      melDemoPlaying = true;
      const btn = maybeById('pr-mel-demo');
      if (btn) {
          btn.setAttribute('aria-pressed', 'true');
          btn.textContent = t('pr_mel_stop');
      }
      if (ctx.state === 'running') { playSeq(); return; }
      void timedAudioReady(ctx).then((ready) => {
          if (!ready || !melDemoPlaying) { clearMelodyDemoPreview(); return; }
          playSeq();
      });
  }
  function renderPracticeMelodyScales() {
      const sel = maybeById('pr-mel-scale');
      if (!(sel instanceof HTMLSelectElement)) return;
      const prev = sel.value || 'auto';
      const autoOpt = sel.querySelector('option[value="auto"]');
      if (autoOpt) autoOpt.textContent = t('pr_mel_scale_auto');
      while (sel.options.length > 1) sel.remove(1);
      for (const nm of EK_MEL_SCALES) {
          const o = document.createElement('option');
          o.value = nm;
          o.textContent = scaleDisp(nm);
          sel.appendChild(o);
      }
      sel.value = [...sel.options].some((o) => o.value === prev) ? prev : 'auto';
  }
  function syncPracticeProgSplit() {
      const split = maybeById('pr-prog-split');
      const modeH = maybeById('pr-mode-h');
      const pm = maybeById('pr-mode');
      if (!split || !modeH || !pm) return;
      const { cat, mode } = prChoice();
      const isProg = cat === 'prog';
      const isAlong = isProg && mode === 'along';
      split.hidden = !isProg;
      if (isProg) {
          queryAllHtml(split, '[role="tab"]').forEach((tab) => {
              const on = tab.dataset.v === (isAlong ? 'along' : 'drill');
              tab.setAttribute('aria-selected', on ? 'true' : 'false');
              tab.tabIndex = on ? 0 : -1;
          });
      }
      const hideModeBar = cat === 'melody' || isAlong;
      modeH.hidden = hideModeBar;
      pm.hidden = hideModeBar;
  }
  function prSetKey(key: string) {
      const sel = selectById('pr-key');
      if (!PR_KEYS.includes(key) || ![...sel.options].some((o) => o.value === key))
          return;
      sel.value = key;
      renderPracticeKeys();
      updatePracticeModeHint();
      if (prChoice().mode === 'along')
          accompRestartIfPlaying(); // updatePracticeModeHint has redrawn the chord chain
  }
  function prStart() {
      clearMelodyDemoPreview();
      const { cat, mode, key } = prChoice();
      if (mode === 'along') { // not a drill: the loop starts or stops, and no last-drill record is written
          if (accomp.on)
              accompStop();
          else {
              accompSync();
              accompStart();
              updatePracticeModeHint();
          }
          return;
      }
      if (cat === 'scale' && mode === 'tech') {
          practiceModePref = 'tech';
          host.nav.show('practice');
          startSession({ cat: TECHNIQUE_TOPIC, mode: 'play', key });
          return;
      }
      practiceModePref = mode;
      if (mode !== 'play' && cat !== 'melody') {
          host.store.data().settings.earKeys = mode === 'keys';
          saveAll();
      }
      host.nav.show('practice');
      startSession({
          cat,
          mode: mode === 'play' ? 'play' : 'ear',
          key,
          ...(prDirShown() ? { dir: prIvDir, ...(prIvStyle !== 'both' ? { ivStyle: prIvStyle } : {}) } : {}),
          ...(cat === 'chord' ? { chordTier: prChordTier } : {}),
          ...(cat === 'scale' ? { scaleTier: prScaleTier } : {}),
          ...(cat === 'melody' ? { melDiff: prMelDiff, melLen: prMelLen, melScale: prMelScale } : {}),
      });
  }
  // Today's Ear check: an Intervals · By ear drill in one tap, on the keys when that is the saved choice (settings.earKeys).
  function prEarCheck() {
      if (SES.active)
          return;
      prSetTopic('interval');
      prSetMode(host.store.data().settings.earKeys ? 'keys' : 'ear');
      prStart();
  }
  // A screen that moved into this setup (an old link or saved lastTool): Practice, set up for it.
  function prOpenMoved(v: router.MovedView, moveFocus = true, fromHistory = false) {
      if (SES.active && SES.targeted)
          endSession(false);
      host.nav.show('practice', moveFocus, fromHistory);
      if (v === 'songs') {
          prSetTopic('interval');
          const panel = byId('pr-songs');
          if (panel instanceof HTMLDetailsElement)
              panel.open = true; // its toggle event builds the cards
      }
      else {
          prSetTopic('prog');
          prSetMode('along');
      }
  }
  // Continue: the last drill again, with its topic, mode and key, in one tap.
  // The mode a saved drill ran in. Progressions never run on the keys, whatever the on-keys setting was.
  function prDrillMode(d: StoredLastDrill): PracticeMode { return d.cat === 'melody' ? 'keys' : d.mode !== 'ear' ? 'play' : d.keys && d.cat !== 'prog' ? 'keys' : 'ear'; }
  function prDrillKey(d: StoredLastDrill) { return PR_KEYS.includes(String(d.key)) ? String(d.key) : 'all'; }
  function prContinue() {
      const d = host.store.data().lastDrill;
      if (!d)
          return;
      prSetTopic(d.cat);
      if (d.cat !== 'melody') // melodies are always on the keys, and leave the saved ear choice alone
          prSetMode(prDrillMode(d));
      prSetKey(prDrillKey(d));
      if (d.cat === 'interval' && d.mode === 'ear') prSetDir(d.dir ?? 'asc');
      prStart();
  }
  // Arrow keys, Home and End move through a radio group and select (WAI-ARIA radio group); Space and Enter click.
  function prRadioKey(e: KeyboardEvent, pick: (v: string) => void) {
      const group = e.currentTarget, cur = eventClosest(e, '[role=radio]');
      if (!(group instanceof HTMLElement) || !cur)
          return;
      const radios = queryAllHtml(group, '[role=radio]'), i = radios.indexOf(cur), n = radios.length;
      if (i < 0)
          return;
      let to: number;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
          to = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
          to = (i - 1 + n) % n;
      else if (e.key === 'Home')
          to = 0;
      else if (e.key === 'End')
          to = n - 1;
      else
          return;
      e.preventDefault();
      const next = radios[to];
      if (!next)
          return;
      pick(next.dataset.v ?? '');
      next.focus();
  }
  // The topic cards (the .focus card look), with mastered counts for the four review topics.
  function renderPracticeTopics() {
      const box = maybeById('pr-topics'), sel = maybeById('pr-cat');
      if (!box || !(sel instanceof HTMLSelectElement))
          return;
      if (box.children.length !== PR_TOPICS.length)
          box.innerHTML = PR_TOPICS.map((c) => `<button type="button" role="radio" class="focus pr-topic" id="pr-t-${c}" data-v="${c}" aria-checked="false" tabindex="-1" aria-labelledby="pr-t-${c}-n" aria-describedby="pr-t-${c}-d pr-t-${c}-m"><span class="pr-topic-top"><svg class="pr-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PR_GLYPH[c] ?? ''}</svg><span class="k" id="pr-t-${c}-n"></span></span><span class="m" id="pr-t-${c}-d"></span><span class="pr-mast" id="pr-t-${c}-m"></span></button>`).join('');
      const cat = PR_TOPICS.includes(sel.value) ? sel.value : PR_TOPICS[0];
      PR_TOPICS.forEach((c) => {
          const card = byId('pr-t-' + c), on = c === cat, mast = byId('pr-t-' + c + '-m');
          card.setAttribute('aria-checked', on ? 'true' : 'false');
          card.tabIndex = on ? 0 : -1;
          byId('pr-t-' + c + '-n').textContent = prTopicLabel(c);
          if (c === 'chord') {
              const exMin = host.i18n.notation() === 'solfege' ? `${rootName(0)} ${chordDisp('m').toLowerCase()}` : formatChord(rootName(0), 'm');
              const exDom7 = formatChord(rootName(7), '7');
              byId('pr-t-' + c + '-d').textContent = t('pr_d_chord', exMin, exDom7);
          }
          else {
              byId('pr-t-' + c + '-d').textContent = t('pr_d_' + c);
          }
          if (isCatKey(c)) {
              const items = ITEMS.filter((it) => it.cat === c), mastered = items.filter((it) => boxOf(it.id) >= 4).length;
              mast.innerHTML = '<span class="bar"><i style="width:' + (items.length ? Math.round(100 * mastered / items.length) : 0) + '%"></i></span><span class="pr-mast-t">' + rdEsc(t('pr_mastered', mastered, items.length)) + '</span>';
              mast.hidden = false;
          }
          else {
              mast.textContent = '';
              mast.hidden = true;
          }
      });
  }
  // The key chips: All keys and the 12 roots, in the chosen note names. On a phone the row scrolls sideways.
  function renderPracticeKeys() {
      const box = maybeById('pr-keys'), sel = maybeById('pr-key');
      if (!box || !(sel instanceof HTMLSelectElement))
          return;
      if (box.children.length !== PR_KEYS.length)
          box.innerHTML = PR_KEYS.map((k) => `<button type="button" role="radio" class="pr-chip" data-v="${k}" aria-checked="false" tabindex="-1"></button>`).join('');
      const key = sel.value || 'all';
      queryAllHtml(box, '[role=radio]').forEach((b) => {
          const v = b.dataset.v ?? 'all', is = v === key;
          b.textContent = prKeyLabel(v);
          b.setAttribute('aria-checked', is ? 'true' : 'false');
          b.tabIndex = is ? 0 : -1;
      });
      const chip = queryHtml(box, '[aria-checked="true"]');
      if (chip && box.clientWidth && box.scrollWidth > box.clientWidth && (chip.offsetLeft < box.scrollLeft || chip.offsetLeft + chip.offsetWidth > box.scrollLeft + box.clientWidth))
          box.scrollLeft = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
  }
  // One line on what the chosen mode asks of you, contextual options, and the Start label.
  function updatePracticeModeHint() {
      const hint = maybeById('pr-mode-hint'), note = maybeById('pr-mode-note'), start = maybeById('pr-start');
      if (!hint || !note || !start || !maybeById('pr-cat') || !maybeById('pr-mode'))
          return;
      const { cat, mode, key } = prChoice(), tech = cat === 'scale' && mode === 'tech';
      hint.textContent = tech ? t('tq_pr_hint') : t(mode === 'keys' ? 'pr_hint_keys' : mode === 'ear' ? 'pr_hint_ear' : 'pr_hint_play');
      const why = tech ? t('tq_pr_note') : '';
      note.textContent = why;
      note.hidden = !why;
      const dirShown = prDirShown(), along = mode === 'along';
      byId('pr-dir-row').hidden = !dirShown;
      const dirWrap = maybeById('pr-dir-wrap');
      if (dirWrap) dirWrap.hidden = prIvStyle === 'harmonic';
      const chordCfg = maybeById('pr-chord-cfg');
      if (chordCfg) chordCfg.hidden = cat !== 'chord';
      const scaleCfg = maybeById('pr-scale-cfg');
      if (scaleCfg) scaleCfg.hidden = cat !== 'scale' || tech;
      const melCfg = maybeById('pr-mel-cfg');
      if (melCfg) melCfg.hidden = cat !== 'melody';
      if (cat !== 'melody' && melDemoPlaying) clearMelodyDemoPreview();
      if (cat !== 'interval' && songBook.isPreviewing()) stopPreviews();
      byId('pr-along').hidden = byId('pr-along-out').hidden = !along;
      if (along) {
          hint.textContent = t('ac_lede') + (key === 'all' ? ' ' + t('pr_along_c', rootName(0)) : '');
          renderAccompany();
          paintAccompImproScale();
      }
      else {
          clearAccompImproScale();
          if (accomp.on) accompStop(); // another topic or mode: the loop stops
      }
      start.textContent = along
          ? t(accomp.on ? 'ac_stop' : 'ac_play')
          : cat === 'melody'
              ? t('pr_start_sel', [prTopicLabel(cat), t('pr_mel_' + prMelDiff), prKeyLabel(key)].join(' · '))
              : t('pr_start_sel', [prTopicLabel(cat), prModeLabel(mode, cat), ...(dirShown && prIvStyle !== 'harmonic' ? [prDirLabel(prIvDir)] : []), prKeyLabel(key)].join(' · '));
      syncPracticeHintsPanel();
      dockSync(); // Play along brings the keys
      syncMobileStartBars();
  }
  function syncPracticeCatAndMode() {
      const catEl = byId('pr-cat');
      const pm = byId('pr-mode');
      if (!catEl || !pm) return;
      if ((catEl as HTMLSelectElement).value === TECHNIQUE_TOPIC) (catEl as HTMLSelectElement).value = 'scale';
      const cat = (catEl as HTMLSelectElement).value;
      const mel = cat === 'melody';
      const prog = cat === 'prog';
      const scale = cat === 'scale';

      const labelKey = (v: string): string => {
          if (v === 'tech') return 'pr_m_sc_tech';
          if (v === 'keys') return 'pr_onkeys';
          if (v === 'along') return 'pr_along';
          if (cat === 'interval') return v === 'ear' ? 'pr_m_iv_ear' : 'pr_m_iv_play';
          if (cat === 'chord') return v === 'ear' ? 'pr_m_ch_ear' : 'pr_m_ch_play';
          if (cat === 'scale') return v === 'ear' ? 'pr_m_sc_ear' : 'pr_m_sc_play';
          if (cat === 'prog') return v === 'ear' ? 'pr_m_pr_ear' : 'pr_m_pr_play';
          return v === 'ear' ? 'pr_byear' : 'pr_playit';
      };

      queryAllHtml(pm, ':scope > *').forEach((x) => {
          if (x instanceof HTMLButtonElement) {
              const v = x.dataset.v ?? '';
              x.textContent = t(labelKey(v));
              const hidden = mel
                  ? v !== 'keys'
                  : scale
                      ? (v === 'keys' || v === 'along')
                      : prog
                          ? (v === 'tech' || v === 'keys' || v === 'along')
                          : (v === 'tech' || v === 'along');
              const dis = (mel && v !== 'keys')
                  || (scale && (v === 'keys' || v === 'along'))
                  || (prog && (v === 'tech' || v === 'keys'))
                  || (!prog && !scale && (v === 'tech' || v === 'along'));
              x.disabled = dis;
              x.hidden = hidden;
          }
      });

      const curPressed = queryHtml(pm, 'button[aria-pressed="true"]')?.dataset.v;
      let targetV: PracticeMode;
      if (mel) targetV = 'keys';
      else if (scale) targetV = (practiceModePref === 'tech' || practiceModePref === 'ear' || practiceModePref === 'play') ? practiceModePref : 'tech';
      else if (prog) targetV = curPressed === 'along' ? 'along' : (practiceModePref === 'ear' || practiceModePref === 'keys') ? 'ear' : prProgLastDrill;
      else targetV = (practiceModePref === 'play' || practiceModePref === 'ear' || practiceModePref === 'keys') ? practiceModePref : (host.store.data().settings.earKeys ? 'keys' : 'play');

      let selected = false;
      queryAllHtml(pm, 'button').forEach((b) => {
          const btn = b as HTMLButtonElement;
          const isMatch = btn.dataset.v === targetV && !btn.disabled;
          if (isMatch) selected = true;
          btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      if (!selected) {
          const fallback = pm.querySelector('button:not(:disabled)');
          if (fallback instanceof HTMLButtonElement) {
              queryAllHtml(pm, 'button').forEach((b) => b.setAttribute('aria-pressed', b === fallback ? 'true' : 'false'));
          }
      }

      const chordInvEl = maybeById('pr-chord-inv');
      if (chordInvEl instanceof HTMLInputElement) chordInvEl.checked = !!host.store.data().settings.allowInv;
      renderPracticeMelodyScales();
      renderPracticeTopics();
      renderPracticeKeys();
      syncPracticeProgSplit();
      updatePracticeModeHint();
  }
  // The whole setup screen in the current language and note names (applyI18n, applyNotation).
  function applyPracticeModeLabels() {
      const pm = maybeById('pr-mode'), catEl = maybeById('pr-cat');
      if (!pm || !(catEl instanceof HTMLSelectElement)) return;
      const cat = normalizePracticeTopic(catEl.value);
      queryAllHtml(pm, 'button').forEach((btn) => {
          const v = btn.dataset.v;
          if (isPracticeMode(v)) btn.textContent = prModeLabel(v, cat);
      });
  }
  function renderPracticeSetup() {
      applyPracticeModeLabels();
      renderPracticeTopics();
      renderPracticeKeys();
      syncPracticeProgSplit();
      updatePracticeModeHint();
      renderPracticeLast();
  }
  // After a drill: the contrast offer when it shows (its Start button, else its text), else the Last drill strip's button.
  function prFocusAfterDrill() {
      const offer = maybeById('ses-contrast'), go = maybeById('cf-start');
      if (offer && !offer.hidden) {
          if (go && offer.contains(go))
              go.focus();
          else {
              offer.tabIndex = -1;
              offer.focus();
          }
      }
      else
          byId(byId('pr-last').hidden ? 'pr-start' : 'pr-redo').focus();
  }
  function renderPracticeLast() {
      const el = maybeById('pr-last'), txt = maybeById('pr-last-txt');
      if (!el || !txt)
          return;
      const d = host.store.data().lastDrill;
      if (!d || !d.n || (!(isCatKey(d.cat) && CATS[d.cat]) && d.cat !== 'melody')) {
          el.hidden = true;
          return;
      }
      const pct = Math.round(100 * d.c / d.n), mode = prDrillMode(d);
      el.hidden = false;
      txt.innerHTML = rdEsc(t('pr_last', [prTopicLabel(d.cat), prModeLabel(mode, d.cat), prKeyLabel(prDrillKey(d))].join(' · '))) + ' — <b class="' + (pct >= 80 ? 'good' : 'neutral') + '">' + rdEsc(t('pr_last_res', d.c, d.n) + ' (' + pct + '%)') + '</b>';
  }
  /* ---------- SUMMARY ---------- */
  function showSummary(..._args: unknown[]) {
      byId('summary').style.display = 'block';
      byId('today-home').style.display = 'none';
      const acc = SES.total ? Math.round(100 * SES.correct / SES.total) : 0;
      byId('sum-acc').textContent = acc + '%';
      byId('sum-rev').textContent = String(SES.total);
      byId('sum-streak').textContent = String(currentStreak());
      const r = byId('sum-ring');
      const C = 2 * Math.PI * 52;
      r.innerHTML = '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - acc / 100)) + '" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" dy=".35em" font-family="var(--script)" font-weight="400" font-size="38" fill="var(--ink)">' + acc + '%</text>';
      if (SES.placement || arguments[0]) {
          byId('sum-title').textContent = t('sum_place');
          byId('sum-note').textContent = t('sum_placenote', SES.correct, SES.total);
      }
      else {
          byId('sum-title').textContent = t('sum_welldone');
          const dueLeft = dueItems().length;
          byId('sum-note').textContent = dueLeft ? t('sum_more', dueLeft) : t('sum_caught');
      }
  }

  /* ---------- accompaniment and song book (Practice → Play along, Songs) ---------- */
  const accompaniment = createAccompanimentController({
      host,
      isAlongWanted: () => prAlongWanted(),
      getPracticeKey: () => { const k = prChoice().key; return k === 'all' ? 0 : (+k || 0); },
      progDisp: (name) => progDisp(name),
      rootName: (p) => rootName(p),
      updatePracticeModeHint: () => updatePracticeModeHint(),
      getKeyElements: () => shell.keyEl,
  });
  const accomp = accompaniment.state;
  const accompStart = accompaniment.start;
  const accompStop = accompaniment.stop;
  const accompSync = accompaniment.sync;
  const accompRestartIfPlaying = accompaniment.restartIfPlaying;
  const clearAccompImproScale = accompaniment.clearImproScale;
  const paintAccompImproScale = accompaniment.paintImproScale;
  const renderAccompany = accompaniment.render;
  const updateAccompChain = accompaniment.updateChain;
  const songBook = createSongBookController({
      host,
      ivName: (semi) => ivName(semi),
      playIvDir: (root, semi, dir, style) => playIvDir(root, semi, dir, style),
      pianoEnsure: (midis) => shell.pianoEnsure(midis),
      setHintControlPressed: (btn, pressed) => setHintControlPressed(btn, pressed),
  });
  const renderSongs = songBook.render;

  /* ---------- feature controller ---------- */
  let mounted = false;

  function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
  function wiringInput(e: Event): HTMLInputElement {
      const el = e.target;
      if (el instanceof HTMLInputElement)
          return el;
      throw new Error('Étude: expected an <input> event target');
  }
  function wiringField(e: Event): HTMLInputElement | HTMLSelectElement {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
          return el;
      throw new Error('Étude: expected an <input> or <select> event target');
  }

  function mount(): void {
      if (mounted) return;
      mounted = true;
      host.previews.registerStopper(clearPracticeHintPreview);
      host.previews.registerStopper(clearMelodyDemoPreview);
      reflectSettings();
    byId('ses-end').addEventListener('click', () => endSession(true));
    byId('q-next').addEventListener('click', () => { if (!SES.targeted)
        SES.idx++; nextQuestion(); });
    byId('q-reveal').addEventListener('click', () => { const q = SES.q; if (!q || SES.answered)
        return; q.missed = true; revealAnswerKeys(q); if (q.mode === 'ear')
        markEarCorrect(q); resolve(q, false); });
    byId('q-replay').addEventListener('click', () => { const q = SES.q; if (q)
        playQuestionSound(q); });
    byId('q-ekreset').addEventListener('click', ekReset);
    byId('q-ansmode').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button[data-v]'), q = SES.q;
        if (!b)
            return;
        const on = b.dataset.v === 'keys';
        if (!!host.store.data().settings.earKeys === on)
            return;
        host.store.data().settings.earKeys = on;
        practiceModePref = on ? 'keys' : 'ear';
        saveAll();
        if (!q)
            return;
        if (SES.answered || q.mode !== 'ear') {
            ekToggleSync(q);
            dockSync();
            return;
        }
        ekStop(q);
        kbClear('target');
        kbClear('good');
        kbClear('bad');
        byId('q-verdict').textContent = '';
        byId('q-verdict').className = 'verdict';
        presentQuestion(q);
    });
    byId('sum-again').addEventListener('click', () => { byId('summary').style.display = 'none'; startSession(null); });
    byId('sum-done').addEventListener('click', () => { byId('summary').style.display = 'none'; host.nav.show('today'); });
    // practice
    byId('pr-mode').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button');
        if (!b || wiringDisabled(b)) return;
        const v = b.dataset.v;
        if (isPracticeMode(v)) prSetMode(v);
    });
    maybeById('pr-prog-split')?.addEventListener('click', (e) => {
        const b = eventClosest(e, '[role="tab"]');
        if (!b) return;
        prSetMode(b.dataset.v === 'along' ? 'along' : prProgLastDrill);
    });
    byId('pr-cat').addEventListener('change', syncPracticeCatAndMode);
    byId('pr-key').addEventListener('change', () => { renderPracticeKeys(); updatePracticeModeHint(); });
    byId('pr-topics').addEventListener('click', (e) => { const r = eventClosest(e, '[role=radio]'); if (r?.dataset.v) prSetTopic(r.dataset.v); });
    byId('pr-topics').addEventListener('keydown', (e) => prRadioKey(e, prSetTopic));
    byId('pr-keys').addEventListener('click', (e) => { const r = eventClosest(e, '[role=radio]'); if (r?.dataset.v) prSetKey(r.dataset.v); });
    byId('pr-keys').addEventListener('keydown', (e) => prRadioKey(e, prSetKey));
    byId('pr-start').addEventListener('click', prStart);
    maybeById('pr-mobile-start')?.addEventListener('click', () => { byId('pr-start').click(); });
    byId('pr-redo').addEventListener('click', prContinue);
    byId('pr-dir').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetDir(b.dataset.v ?? ''); });
    maybeById('pr-iv-style')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetIvStyle(b.dataset.v ?? ''); });
    maybeById('pr-chord-tier')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetChordTier(b.dataset.v ?? ''); });
    maybeById('pr-chord-inv')?.addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        host.store.data().settings.allowInv = checked;
        inputById('set-inv').checked = checked;
        saveAll();
    });
    maybeById('pr-scale-tier')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetScaleTier(b.dataset.v ?? ''); });
    maybeById('pr-mel-diff')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetMelDiff(b.dataset.v ?? ''); updatePracticeModeHint(); });
    maybeById('pr-mel-len')?.addEventListener('change', (e) => { const v = wiringField(e).value; prMelLen = v === 'auto' ? 'auto' : (+v || 'auto'); });
    maybeById('pr-mel-scale')?.addEventListener('change', (e) => { prMelScale = wiringField(e).value || 'auto'; });
    maybeById('pr-mel-demo')?.addEventListener('click', toggleMelodyDemo);
      accompaniment.wireControls();
      songBook.wireControls(syncPracticeHintsPanel);
      renderPracticeSetup();
  }

  function isPracticeModePref(v: unknown): v is PracticeModePref {
      return v === 'play' || v === 'ear' || v === 'keys' || v === 'along' || v === 'tech';
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
      if (signal.aborted) return;
      const topic = params?.practiceTopic, mode = params?.practiceMode, key = params?.practiceKey;
      if (typeof topic === 'string' && topic) prSetTopic(topic);
      if (isPracticeModePref(mode)) prSetMode(mode);
      if (typeof key === 'string' && key) prSetKey(key);
      if (!SES.active) {
          stopMetro();
          void ensurePracticeHintsView().catch(() => {});
          syncPracticeCatAndMode();
          renderPracticeLast();
      }
  }

  function leave(): void {
      clearAccompImproScale();
      clearMelodyDemoPreview();
      if (accomp.on) accompStop();
      const pm = maybeById('pr-mode');
      if (pm && queryHtml(pm, 'button[data-v="along"][aria-pressed="true"]')) {
          queryAllHtml(pm, 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === prProgLastDrill ? 'true' : 'false'));
          syncPracticeProgSplit();
      }
  }

  function reflectSettings(): void {
      const data = host.store.data();
      if (data.lastDrill) {
          if (data.lastDrill.cat === 'melody') practiceModePref = 'keys';
          else if (data.lastDrill.mode === 'ear') practiceModePref = data.lastDrill.keys ? 'keys' : 'ear';
          else practiceModePref = 'play';
      } else if (data.settings.earKeys) {
          practiceModePref = 'keys';
      }
      syncPracticeCatAndMode();
  }

  function sessionKey(k: string, e: KeyboardEvent): boolean {
      if (!SES.active || !SES.q) return false;
      if (/^[1-9]$/.test(k) && !SES.answered && SES.q.mode === 'ear') {
          const b = byId('q-answers').children[+k - 1];
          if (b instanceof HTMLElement) {
              e.preventDefault();
              b.click();
              return true;
          }
      }
      if (k === 'r' && !byId('q-replay').hidden) {
          e.preventDefault();
          byId('q-replay').click();
          return true;
      }
      if (k === 'n' && !byId('q-next').hidden) {
          e.preventDefault();
          byId('q-next').click();
          return true;
      }
      return false;
  }

  function sessionInput(kind: 'on' | 'off', midi: number): void {
      if (kind === 'on')
          sesInput(midi);
      else if (SES.q && SES.q.ek)
          ekOff(SES.q, midi);
  }

  function onStorageSync(): void {
      if (view0() === 'practice' && !SES.active) renderPracticeSetup();
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
      registry.define({
        "acChainHL": { get: () => accompaniment.chainHL },
        "accomp": { get: () => accomp },
        "accompHL": { get: () => accompaniment.hl },
        "accompKey": { get: () => accompaniment.key },
        "accompRestartIfPlaying": { get: () => accompRestartIfPlaying },
        "accompStart": { get: () => accompStart },
        "accompStop": { get: () => accompStop },
        "accompSync": { get: () => accompSync },
        "accompTick": { get: () => accompaniment.tick },
        "accompTimer": { get: () => accompaniment.timer },
        "accompVoicing": { get: () => accompaniment.voicing },
        "answerEar": { get: () => answerEar },
        "buildAccomp": { get: () => accompaniment.build },
        "buildQueue": { get: () => buildQueue },
        "chordEarOptions": { get: () => chordEarOptions },
        "countEarAnswer": { get: () => countEarAnswer },
        "earRoot": { get: () => earRoot },
        "EK_CHORD_GAP": { get: () => EK_CHORD_GAP },
        "EK_MEL_SCALES": { get: () => EK_MEL_SCALES },
        "EK_TRIES": { get: () => EK_TRIES },
        "ekBuild": { get: () => ekBuild },
        "ekCh": { get: () => ekCh },
        "ekElab": { get: () => ekElab },
        "ekFlash": { get: () => ekFlash },
        "ekFlat": { get: () => ekFlat },
        "ekForced": { get: () => ekForced },
        "ekIv": { get: () => ekIv },
        "ekMel": { get: () => ekMel },
        "ekMiss": { get: () => ekMiss },
        "ekName": { get: () => ekName },
        "ekOff": { get: () => ekOff },
        "ekOn": { get: () => ekOn },
        "ekPlay": { get: () => ekPlay },
        "ekProg": { get: () => ekProg },
        "ekReset": { get: () => ekReset },
        "ekSound": { get: () => ekSound },
        "ekStop": { get: () => ekStop },
        "ekToggleSync": { get: () => ekToggleSync },
        "ekUiReset": { get: () => ekUiReset },
        "ekWanted": { get: () => ekWanted },
        "ekWin": { get: () => ekWin },
        "endSession": { get: () => endSession },
        "evalTimer": { get: () => evalTimer },
        "gradeChord": { get: () => gradeChord },
        "gradeInterval": { get: () => gradeInterval },
        "gradeProgChord": { get: () => gradeProgChord },
        "gradeScaleNote": { get: () => gradeScaleNote },
        "makeQuestion": { get: () => makeQuestion },
        "markEarCorrect": { get: () => markEarCorrect },
        "neutral": { get: () => neutral },
        "nextQuestion": { get: () => nextQuestion },
        "openSessionUI": { get: () => openSessionUI },
        "pickTargetedItem": { get: () => pickTargetedItem },
        "PLACEMENT": { get: () => PLACEMENT },
        "playProg": { get: () => playProg },
        "playQuestionSound": { get: () => playQuestionSound },
        "prAlongWanted": { get: () => prAlongWanted },
        "prChoice": { get: () => prChoice },
        "prEarCheck": { get: () => prEarCheck },
        "presentEar": { get: () => presentEar },
        "presentEarKeys": { get: () => presentEarKeys },
        "presentPlay": { get: () => presentPlay },
        "presentQuestion": { get: () => presentQuestion },
        "prFocusAfterDrill": { get: () => prFocusAfterDrill },
        "prOpenMoved": { get: () => prOpenMoved },
        "prRecordDrill": { get: () => prRecordDrill },
        "prSetDir": { get: () => prSetDir },
        "prSetKey": { get: () => prSetKey },
        "prSetTopic": { get: () => prSetTopic },
        "renderAccompany": { get: () => renderAccompany },
        "renderPracticeLast": { get: () => renderPracticeLast },
        "renderSongs": { get: () => renderSongs },
        "resolve": { get: () => resolve },
        "revealAnswerKeys": { get: () => revealAnswerKeys },
        "SCALE_EAR_POOL": { get: () => SCALE_EAR_POOL },
        "scaleEarOptions": { get: () => scaleEarOptions },
        "scheduleAccompAt": { get: () => accompaniment.scheduleAt },
        "scheduleEval": { get: () => scheduleEval },
        "SES": { get: () => SES },
        "sesHome": { get: () => sesHome },
        "sesInput": { get: () => sesInput },
        "sesPrompt": { get: () => sesPrompt },
        "sesStopPrompt": { get: () => sesStopPrompt },
        "showElaboration": { get: () => showElaboration },
        "showProgTarget": { get: () => showProgTarget },
        "showSummary": { get: () => showSummary },
        "songDir": { get: () => songBook.getDir() },
        "startPlacement": { get: () => startPlacement },
        "startSession": { get: () => startSession },
        "updateAccompChain": { get: () => updateAccompChain },
      });
  }

  return {
      mount,
      enter,
      leave,
      isBusy: () => SES.active || accomp.on,
      onStorageSync,
      registerTestSurface,
      sesActive: () => SES.active,
      sesHome,
      startSession: (target) => startSession(target),
      startPlacement,
      endSession,
      sessionKey,
      sessionInput,
      sessionNeedsKeys: (v) => { const q = SES.q; return SES.active && v === sesHome() && !!q && (q.mode !== 'ear' || ekWanted(q)); },
      alongWanted: (v) => prAlongWanted(v),
      hintKeys: () => practiceHintPreview ? practiceHintPreview.keys : null,
      setHintKeys: (open) => {
          if (!practiceHintPreview) return;
          practiceHintPreview.keys = open;
          dockSync();
          showPracticeHintNotes(practiceHintPreview);
      },
      hintPreviewActive: () => !!practiceHintPreview,
      onKeyboardBuilt: () => { paintPracticeHintKeys(); paintAccompImproScale(); },
      stopPrompts: () => { sesStopPrompt(); sesStopAnswerReplay(); },
      stopAccompaniment: accompStop,
      openMoved: (v, moveFocus, fromHistory) => { if (router.isMovedView(v)) prOpenMoved(v, moveFocus, fromHistory); },
      setTopic: prSetTopic,
      setMode: prSetMode,
      setKey: prSetKey,
      earCheck: prEarCheck,
      mobileBar: () => {
          const { cat, mode, key } = prChoice();
          const parts = [prTopicLabel(cat), prModeLabel(mode), ...(prDirShown() ? [prDirLabel(prIvDir)] : []), prKeyLabel(key)];
          return { summary: parts.join(' · '), label: mode === 'along' ? t(accomp.on ? 'ac_stop' : 'ac_play') : t('pr_start_short') };
      },
      reflectSettings,
      renderSetup: renderPracticeSetup,
      renderMelodyScales: renderPracticeMelodyScales,
      renderAccompany: (full) => renderAccompany(full),
      localizeAccompaniment: () => accompaniment.localize(),
      updateAccompChain: () => updateAccompChain(),
      refreshSessionCopy,
  };
}
