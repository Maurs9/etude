
import { CATS, ITEMS } from '../../core/trainer-items.js';
import { RD_ALL, RD_LV, type ReadDrillLevel } from '../../core/reading-curriculum.js';
import { type SrLayout, type SrRenderResult, type SrScore, type SrStaffNote } from '../../domain/score-types.js';
import { PIECES } from '../../domain/repertoire-data.js';
import { renderGrandStaff } from '../../domain/grand-staff.js';
import type { LibraryItem } from '../../domain/score-library-types.js';
import { byId, maybeById, inputById, selectById, eventElement, eventClosest, queryAllHtml } from '../../domain/dom.js';
import { type CoachTip } from '../../domain/views.js';
import { inputTime, inputTimeForRelease } from '../../domain/midi-timing.js';
import { srtReadingKeys } from '../../sight-reading/levels.js';
import { SRT_BOOK_PIECES } from '../../sight-reading/book.js';
import { srtBookTally, srtPiecesRead } from '../../sight-reading/progress.js';
import { SRT_FLASH_MS } from '../../sight-reading/warmup.js';
import { SightReadingRecorder } from '../../sight-reading/recorder.js';
import { createInstantFeedbackTracker } from '../../sight-reading/instant-feedback.js';
import { type SightReadingAttemptLease, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import { SRT_INITIAL_STATE } from '../../sight-reading/flow.js';
import { ARCADE_STREAK, srtIsArcadeMode } from '../../sight-reading/arcade.js';
import type { buildPracticeReport, PracticeReportPieceInput } from '../../domain/progress-report.js';

import { createRhythmReading } from './rhythm-reading.js';
import { createLookaheadStream } from './lookahead-stream.js';
import { createFullscreenStage } from './fullscreen-stage.js';
import { createReadWarmup } from './read-warmup.js';
import { createReadLevelPlayer } from './read-level-player.js';
import { createReadHome } from './read-home.js';
import { createReadingDrills } from './reading-drills.js';
import { createReadPlayEngine } from './read-play-engine.js';
import type { AppHost, ReadController, ReadShell, TestSurfaceRegistry } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrSlip, SrState, RdnState, RdnWarmState } from './read-model.js';

export function createReadFeature(host: AppHost, shell: ReadShell): ReadController {
  const t = host.i18n.t;
  const { noteName, pcName } = host.i18n;
  const saveAll = host.store.saveNow;
  const stopPreviews = host.audio.stopPreviews, timedAudioReady = host.audio.timedReady;
  const dockSync = host.dock.sync;
  const midiLive = host.input.isMidiLive, heldPcs = host.input.heldPcs;
  const reduceMotion = host.reduceMotion;
  const {
    view0, todayN, ensureAudio, audioLockCheck, kbState, kbClear, buildKeyboard, repaintHeld, foldToView, dockKeyInSight,
    anLayoutVars, syncMobileStartBars, touchInput, inField, panic, appConfirm, scoreFocusUi, scoreFocusExit, scoreFocusEnter,
    readScoreZoom, rdFocusDispSet, touchDay, markReadDoneToday, storeDaily, storeBackupBlocked, setWeakSpotInjection,
    currentStreak, masteredCount, itemLabel, withPractice, rdData, rdLvName, rdStarCount, rdEsc, statHTML, srPieceTitle,
    spelledName, tl, anNum, coachHTML, coachText,
  } = shell;
  const LETTERS = shell.letters;
  const SR: SrState = { piece: null, hands: 'both', modeSel: 'learn', names: false, anyOctave: false, instantFeedback: false, active: false, assessOn: false,
      notes: [], steps: [], stepIdx: 0, results: {}, mistakes: 0, wrongExtra: 0, beatX: [], totalBeats: 0,
      render: null, raf: 0, timers: [], nodes: [], bpm: 90, t0: 0, next: null, errs: null, slipKey: null,
      srtPiece: null, srtFingerprint: null, srtState: SRT_INITIAL_STATE,
      srtOwnerTabId: `tab-${Math.random().toString(36).slice(2)}`, srtAttemptStartedAt: 0, srtPreviewTimer: 0, srtCountdown: 0, srtLease: null, srtPendingAttempt: null,
      srtEvaluation: null, srtResultValue: null, srtResultLevelId: null, lvPiece: null };
  const RDN: RdnState = { screen: 'home', fresh: true, ctx: null, autoTimer: 0, autoLeft: 0, retries: 0, learn: null, autoWait: false, playerMode: 'assess', melodyMode: null, opener: '', noDaily: false, ready: '' };
  const WARM: RdnWarmState = { on: false, level: 1, key: 'C', steps: [], step: 0, card: 0, phase: 'idle', again: false, clean: 0, played: [], lastAt: 0, strict: false, ok: false, timer: 0, chordTimer: 0, limit: 0, tally: [] };
  /** Warm-up timing in ms: how long a card shows, how long its mark stays, and how close notes must be to form one chord.
   *  Mutable so tests can shorten the waits. */
  const RDN_WARM_MS = { flash: SRT_FLASH_MS, result: 1200, chord: 60 };
  /** The window, in ms, inside which the notes of one beat of a level piece (both hands) count as played together. */
  const RDN_CHORD_WINDOW_MS = 120;
  let srtRecorder: SightReadingRecorder | null = null;
  let srtOperationEpoch = 0;
  let srtCountInEpoch = 0;
  let srtCountInAttemptId: string | null = null;
  let srtClaimIssuedAttemptId: string | null = null;
  let srtClaimDurableAttemptId: string | null = null;
  const srtCleanupPromises = new Map<string, Promise<SightReadingLedgerResult>>();
  const srtReleasedLeases = new WeakSet<SightReadingAttemptLease>();
  let srtExposurePromise: { fingerprint: string; promise: Promise<SightReadingLedgerResult> } | null = null;
  function srRender(piece: SrScore, lay?: SrLayout, proportional = false): SrRenderResult {
      return renderGrandStaff(piece, lay, { namesVisible: srNamesVisible(piece), notation: host.i18n.notation(), proportional });
  }
  /* ---- rhythm-reading.ts ---- */
  const rhythm_reading = createRhythmReading({
      host,
      get ensureAudio() { return ensureAudio; },
      get isRdRhythmUnit() { return isRdRhythmUnit; },
      get kbState() { return kbState; },
      get markReadDoneToday() { return markReadDoneToday; },
      get RD() { return RD; },
      get RD_LH_PAT() { return RD_LH_PAT; },
      get RD_RHU() { return RD_RHU; },
      get rdBeatX() { return rdBeatX; },
      get rdClick() { return rdClick; },
      get rdData() { return rdData; },
      get rdEsc() { return rdEsc; },
      get rdFinish() { return rdFinish; },
      get rdHud() { return rdHud; },
      get rdLevelBpm() { return rdLevelBpm; },
      get rdnWarmLimit() { return rdnWarmLimit; },
      get rdStat() { return rdStat; },
      get srPaperChanged() { return srPaperChanged; },
      get srPaperOf() { return srPaperOf; },
      get srRender() { return srRender; },
      get t() { return t; },
      get timedAudioReady() { return timedAudioReady; },
  });
  const { rdRhGen, rdRhGrade, rdRhPrefs, rdRhGenLH, rdRhMarks, rdRhNew, rdRhFit, rdRhOptsLock, rdRhInterrupt, rdRhRun, rdRhPress, rdRhRelease, rdRhKey, rdRhStrokes, rdRhGradeHand, rdRhGradeAll, rdRhNoteTip, rdRhHandLine, rdRhDone } = rhythm_reading;
  /* ---- lookahead-stream.ts ---- */
  const lookahead_stream = createLookaheadStream({
      shell,
      get RD() { return RD; },
      get RD_FLOW_SC() { return RD_FLOW_SC; },
      get RD_FLOW_W() { return RD_FLOW_W; },
      get rdAccSeg() { return rdAccSeg; },
      get rdArcFx() { return rdArcFx; },
      get rdArmLimit() { return rdArmLimit; },
      get rdBtn() { return rdBtn; },
      get rdCheckNotice() { return rdCheckNotice; },
      get rdData() { return rdData; },
      get rdDockClear() { return rdDockClear; },
      get rdDockMark() { return rdDockMark; },
      get rdFinish() { return rdFinish; },
      get rdGen() { return rdGen; },
      get rdGhostPlace() { return rdGhostPlace; },
      get rdGhostTick() { return rdGhostTick; },
      get rdHint() { return rdHint; },
      get rdHud() { return rdHud; },
      get rdLetter() { return rdLetter; },
      get rdName() { return rdName; },
      get rdPool() { return rdPool; },
      get rdRunLen() { return rdRunLen; },
      get rdScore() { return rdScore; },
      get rdSound() { return rdSound; },
      get rdStep() { return rdStep; },
      get rdSvg() { return rdSvg; },
      get rdTimeUp() { return rdTimeUp; },
      get rdTools() { return rdTools; },
      get reduceMotion() { return reduceMotion; },
      get t() { return t; },
  });
  const { rdFlowOk, rdFlowStart, rdFlowBody, rdFlowShow, rdFlowAnswer } = lookahead_stream;
  /* ---- fullscreen-stage.ts ---- */
  const fullscreen_stage = createFullscreenStage({
      shell,
      get anLayoutVars() { return anLayoutVars; },
      get dockSync() { return dockSync; },
      get RD() { return RD; },
      get rdData() { return rdData; },
      get rdEndClick() { return rdEndClick; },
      get rdFlowShow() { return rdFlowShow; },
      get rdFocusDispSet() { return rdFocusDispSet; },
      get RDN() { return RDN; },
      get rdRhFit() { return rdRhFit; },
      get scoreFocusEnter() { return scoreFocusEnter; },
      get scoreFocusExit() { return scoreFocusExit; },
      get scoreFocusUi() { return scoreFocusUi; },
      get SR() { return SR; },
      get srFit() { return srFit; },
      get srGo() { return srGo; },
      get srMeta() { return srMeta; },
      get syncMobileStartBars() { return syncMobileStartBars; },
      get view0() { return view0; },
  });
  const { srStartStage, stageSync, stageKey, stageRefit, stageResize } = fullscreen_stage;
  /* ---- read-warmup.ts ---- */
  const read_warmup = createReadWarmup({
      host,
      shell,
      get markReadDoneToday() { return markReadDoneToday; },
      get RD() { return RD; },
      get rdAbort() { return rdAbort; },
      get rdCustomLevel() { return rdCustomLevel; },
      get rdData() { return rdData; },
      get rdEsc() { return rdEsc; },
      get rdIntro() { return rdIntro; },
      get RDN_WARM_MS() { return RDN_WARM_MS; },
      get rdnBook() { return rdnBook; },
      get rdnEnsureDaily() { return rdnEnsureDaily; },
      get rdnHome() { return rdnHome; },
      get rdnSetBook() { return rdnSetBook; },
      get rdnShowScreen() { return rdnShowScreen; },
      get rdnToday() { return rdnToday; },
      get rdnWhenSaved() { return rdnWhenSaved; },
      get rdStart() { return rdStart; },
      get reduceMotion() { return reduceMotion; },
      get saveAll() { return saveAll; },
      get srPaperOf() { return srPaperOf; },
      get srRender() { return srRender; },
      get srStopAll() { return srStopAll; },
      get stageSync() { return stageSync; },
      get t() { return t; },
      get touchDay() { return touchDay; },
      get WARM() { return WARM; },
  });
  const { rdnWarmupStart, rdnWarmLimit, rdnWarmDrillDone, rdnWarmStop, rdnWarmNote, rdnWarmFlashClick, rdnWarmLocale } = read_warmup;
  /* ---- read-level-player.ts ---- */
  const read_level_player = createReadLevelPlayer({
      shell,
      get inField() { return inField; },
      get midiLive() { return midiLive; },
      get rdData() { return rdData; },
      get rdEsc() { return rdEsc; },
      get RDN() { return RDN; },
      get rdnBook() { return rdnBook; },
      get rdnCap() { return rdnCap; },
      get rdnHome() { return rdnHome; },
      get rdnKeyName() { return rdnKeyName; },
      get rdnLevelName() { return rdnLevelName; },
      get rdnLongCtx() { return rdnLongCtx; },
      get rdnPattern() { return rdnPattern; },
      get rdnSeen() { return rdnSeen; },
      get rdnSetBook() { return rdnSetBook; },
      get rdnStars() { return rdnStars; },
      get rdnToday() { return rdnToday; },
      get rdnUnitLabel() { return rdnUnitLabel; },
      get rdnWhenSaved() { return rdnWhenSaved; },
      get rdStars() { return rdStars; },
      get rdTab() { return rdTab; },
      get rdWarmButtonsSync() { return rdWarmButtonsSync; },
      get SR() { return SR; },
      get srCoach() { return srCoach; },
      get srEmptyUi() { return srEmptyUi; },
      get srFit() { return srFit; },
      get srGo() { return srGo; },
      get srMeta() { return srMeta; },
      get srModeUi() { return srModeUi; },
      get srNoteStartHold() { return srNoteStartHold; },
      get srShowPiece() { return srShowPiece; },
      get srStopAll() { return srStopAll; },
      get srtNotice() { return srtNotice; },
      get srtPendingSaveProtected() { return srtPendingSaveProtected; },
      get srtPendingUi() { return srtPendingUi; },
      get srtPreviewUi() { return srtPreviewUi; },
      get srtProgressLedgerUpdate() { return srtProgressLedgerUpdate; },
      get t() { return t; },
      get view0() { return view0; },
  });
  const { rdnOpenScored, rdnHeadText, rdnPlayerHead, rdnNavUi, rdnReadyText, rdnReadySync, rdnHandsHint, rdnBpm, rdnHandsUi, rdnOpen, rdnStep, rdnKey, rdnForgetLevelPiece, rdnDropLevelPiece, rdnChecklist, rdnRestWindows, rdnDrawnIds, rdnRecord, rdnResultHide, rdnResultShow, rdnAutoAfterSave, rdnAutoCancel, rdnRetry } = read_level_player;
  /* ---- read-home.ts ---- */
  const read_home = createReadHome({
      host,
      get RD() { return RD; },
      get rdAbort() { return rdAbort; },
      get rdData() { return rdData; },
      get rdEsc() { return rdEsc; },
      get rdIntro() { return rdIntro; },
      get RDN() { return RDN; },
      get rdnAutoCancel() { return rdnAutoCancel; },
      get rdnDropLevelPiece() { return rdnDropLevelPiece; },
      get rdnOpen() { return rdnOpen; },
      get rdnOpenScored() { return rdnOpenScored; },
      get rdnWarmStop() { return rdnWarmStop; },
      get rdnWarmupStart() { return rdnWarmupStart; },
      get rdSpell() { return rdSpell; },
      get saveAll() { return saveAll; },
      get SR() { return SR; },
      get srStopAll() { return srStopAll; },
      get srtAbandonClaim() { return srtAbandonClaim; },
      get srtPendingSaveProtected() { return srtPendingSaveProtected; },
      get stageSync() { return stageSync; },
      get t() { return t; },
      get WARM() { return WARM; },
  });
  const { rdnNormalized, rdnBook, rdnSetBook, rdnToday, rdnSeen, rdnLevelName, rdnKeyName, rdnPattern, rdnCap, rdnStars, rdnShowScreen, rdnWhenSaved, rdnHome, rdnLeaveView, rdnEnsureDaily, rdnChoose, rdnRenderHome, rdnLongCtx, rdnUnitLabel, rdnHomeClick } = read_home;
  /* ---- read-play-engine.ts ---- */
  const read_play_engine = createReadPlayEngine({
      host,
      shell,
      get audioLockCheck() { return audioLockCheck; },
      get ensureAudio() { return ensureAudio; },
      get foldToView() { return foldToView; },
      get isRdSightLevel() { return isRdSightLevel; },
      get kbClear() { return kbClear; },
      get kbState() { return kbState; },
      get markReadDoneToday() { return markReadDoneToday; },
      get noteName() { return noteName; },
      get panic() { return panic; },
      get pcName() { return pcName; },
      get RD() { return RD; },
      get rdEsc() { return rdEsc; },
      get RDN() { return RDN; },
      get RDN_CHORD_WINDOW_MS() { return RDN_CHORD_WINDOW_MS; },
      get rdnAutoAfterSave() { return rdnAutoAfterSave; },
      get rdnAutoCancel() { return rdnAutoCancel; },
      get rdnBpm() { return rdnBpm; },
      get rdnDrawnIds() { return rdnDrawnIds; },
      get rdnHandsUi() { return rdnHandsUi; },
      get rdnHeadText() { return rdnHeadText; },
      get rdnNavUi() { return rdnNavUi; },
      get rdnRecord() { return rdnRecord; },
      get rdnRestWindows() { return rdnRestWindows; },
      get rdnResultHide() { return rdnResultHide; },
      get rdnResultShow() { return rdnResultShow; },
      get rdnStars() { return rdnStars; },
      get rdRender() { return rdRender; },
      get rdSightDone() { return rdSightDone; },
      get rdSightStart() { return rdSightStart; },
      get readScoreZoom() { return readScoreZoom; },
      get saveAll() { return saveAll; },
      get scoreFocusUi() { return scoreFocusUi; },
      get SR() { return SR; },
      get srCoach() { return srCoach; },
      get srLearnGrade() { return srLearnGrade; },
      get srNextAssess() { return srNextAssess; },
      get srNextLearn() { return srNextLearn; },
      get srPieceTitle() { return srPieceTitle; },
      get srRender() { return srRender; },
      get srSlipNote() { return srSlipNote; },
      get srStartStage() { return srStartStage; },
      get srtClaimDurableAttemptId() { return srtClaimDurableAttemptId; },
      set srtClaimDurableAttemptId(value: string | null) { srtClaimDurableAttemptId = value; },
      get srtClaimIssuedAttemptId() { return srtClaimIssuedAttemptId; },
      set srtClaimIssuedAttemptId(value: string | null) { srtClaimIssuedAttemptId = value; },
      get srtCleanupPromises() { return srtCleanupPromises; },
      get srtCountInAttemptId() { return srtCountInAttemptId; },
      set srtCountInAttemptId(value: string | null) { srtCountInAttemptId = value; },
      get srtCountInEpoch() { return srtCountInEpoch; },
      set srtCountInEpoch(value: number) { srtCountInEpoch = value; },
      get srtExposurePromise() { return srtExposurePromise; },
      set srtExposurePromise(value: { fingerprint: string; promise: Promise<SightReadingLedgerResult>; } | null) { srtExposurePromise = value; },
      get srtOperationEpoch() { return srtOperationEpoch; },
      set srtOperationEpoch(value: number) { srtOperationEpoch = value; },
      get srtRecorder() { return srtRecorder; },
      set srtRecorder(value: SightReadingRecorder | null) { srtRecorder = value; },
      get srtReleasedLeases() { return srtReleasedLeases; },
      get stageSync() { return stageSync; },
      get stopPreviews() { return stopPreviews; },
      get storeBackupBlocked() { return storeBackupBlocked; },
      get storeDaily() { return storeDaily; },
      get syncMobileStartBars() { return syncMobileStartBars; },
      get t() { return t; },
      get timedAudioReady() { return timedAudioReady; },
      get touchDay() { return touchDay; },
      get view0() { return view0; },
      get WARM() { return WARM; },
      get withPractice() { return withPractice; },
  });
  const { srSvg, srHandsAvail, srActiveHands, srStepsBuild, srDraw, srtGeneratedSelected, srtEligibleFirstSightActive, srtWatchAudioContext, srNamesVisible, srPaintAll, srScrollX, srPaperOf, srPaper, srPaperChanged, srFit, srScrollStep, srBeatToX, srCursor, srTargets, srClick, srInstantNotes, srInstantReset, srInstantHandleNote, srStopAll, srPlayGap, srCount, srLearnStart, srLearnFinish, srtSetState, srtPreviewUi, srtPendingUi, srtNotice, srtProgressLedgerUpdate, srtConsumeOnLearnReveal, srtPendingSaveProtected, srtRetryPendingSave, srtContinueWithoutSave, srtAbandonClaim, srtCancelAttempt, srtStartPractice, srtStartFirstSight, srtStartClaimedAttempt, srtSwitchToPractice, srAssessStart, srTol, srNoteStartHold, srNoteStartInput, srAssessLoop, srAssessFinish, srRenderAssessResult, srKeyInput, srListen, srGo, rdWarmButtonsSync, rdWarmPlayTonic, rdWarmPracticeScale, srMeta, srEmptyUi, srSelectPiece, srShowPiece, renderRead } = read_play_engine;
  /* ---- reading-drills.ts ---- */
  const reading_drills = createReadingDrills({
      host,
      shell,
      get anNum() { return anNum; },
      get buildKeyboard() { return buildKeyboard; },
      get coachHTML() { return coachHTML; },
      get coachText() { return coachText; },
      get dockKeyInSight() { return dockKeyInSight; },
      get dockSync() { return dockSync; },
      get ensureAudio() { return ensureAudio; },
      get foldToView() { return foldToView; },
      get heldPcs() { return heldPcs; },
      get kbState() { return kbState; },
      get LETTERS() { return LETTERS; },
      get markReadDoneToday() { return markReadDoneToday; },
      get rdCoach() { return rdCoach; },
      get rdData() { return rdData; },
      get rdEsc() { return rdEsc; },
      get rdFlowAnswer() { return rdFlowAnswer; },
      get rdFlowBody() { return rdFlowBody; },
      get rdFlowOk() { return rdFlowOk; },
      get rdFlowShow() { return rdFlowShow; },
      get rdFlowStart() { return rdFlowStart; },
      get rdLvName() { return rdLvName; },
      get RDN() { return RDN; },
      get rdnBook() { return rdnBook; },
      get rdnChecklist() { return rdnChecklist; },
      get rdNextStep() { return rdNextStep; },
      get rdnForgetLevelPiece() { return rdnForgetLevelPiece; },
      get rdnHeadText() { return rdnHeadText; },
      get rdnHome() { return rdnHome; },
      get rdnPlayerHead() { return rdnPlayerHead; },
      get rdnReadyText() { return rdnReadyText; },
      get rdnResultShow() { return rdnResultShow; },
      get rdnShowScreen() { return rdnShowScreen; },
      get rdnWarmDrillDone() { return rdnWarmDrillDone; },
      get rdnWarmLimit() { return rdnWarmLimit; },
      get rdnWarmLocale() { return rdnWarmLocale; },
      get rdRhMarks() { return rdRhMarks; },
      get rdRhNew() { return rdRhNew; },
      get rdRhPress() { return rdRhPress; },
      get rdRhRelease() { return rdRhRelease; },
      get rdStarCount() { return rdStarCount; },
      get rdWarmButtonsSync() { return rdWarmButtonsSync; },
      get repaintHeld() { return repaintHeld; },
      get saveAll() { return saveAll; },
      get spelledName() { return spelledName; },
      get SR() { return SR; },
      get srMeta() { return srMeta; },
      get srModeUi() { return srModeUi; },
      get srSelectPiece() { return srSelectPiece; },
      get srStopAll() { return srStopAll; },
      get srtAbandonClaim() { return srtAbandonClaim; },
      get srtConsumeOnLearnReveal() { return srtConsumeOnLearnReveal; },
      get srtNotice() { return srtNotice; },
      get srtOperationEpoch() { return srtOperationEpoch; },
      get srtPendingSaveProtected() { return srtPendingSaveProtected; },
      get srtPendingUi() { return srtPendingUi; },
      get srtPreviewUi() { return srtPreviewUi; },
      get srtProgressLedgerUpdate() { return srtProgressLedgerUpdate; },
      get stageSync() { return stageSync; },
      get statHTML() { return statHTML; },
      get syncMobileStartBars() { return syncMobileStartBars; },
      get t() { return t; },
      get tl() { return tl; },
      get touchDay() { return touchDay; },
      get view0() { return view0; },
      get WARM() { return WARM; },
  });
  const { RD_REF, RD_CLEFC, RD_MAJ, RD_MIN, RD_CHQ, RD_TARGET, rdP, rdStep, rdMidi, rdFromStep, rdAccSym, rdLetter, rdName, rdSpell, rdKeyLabel, rdKeyMinor, rdNk, rdCClef, rdKsSvg, rdSvg, RD_CHECK_N, RD, rdRunLen, rdTimeUp, rdArmLimit, rdArcFx, rdLvNext, rdTarget, rdStat, rdPickFrom, rdPool, rdIvName, rdChLabel, rdGen, rdQSvg, rdDockMark, rdDockPaint, rdDockClear, rdDockView, rdBtn, rdAccSeg, rdTools, RD_FLOW_W, RD_FLOW_SC, rdGhostTick, rdGhostPlace, rdNext, rdSound, RD_LM, rdHint, rdAnsText, rdScore, rdAnswer, rdCheckNotice, rdFeedback, rdClickAns, rdInput, rdHud, RD_RHU, isRdRhythmUnit, rdLevelBpm, rdClick, rdBeatX, RD_LH_PAT, rdTap, isRdSightLevel, rdSightGen, rdSightStart, rdGenMelody, srLearnGrade, rdSightDone, rdRangeTxt, rdLvDetail, rdLvSub, rdStars, rdKeyText, rdScroll, rdOpen, rdIntro, rdChalOpen, rdChalKey, rdStart, rdClear, rdAbort, rdEndClick, rdBack, rdFinish, rdSuggest, rdRenderHome, RD_CDEF, rdCustomFill, rdCustomRead, rdCustomGo, rdCustomLevel, rdAgg, rdHeat, rdBars, rdRenderStats, rdTab, rdRender, rdKey, rdOnLocale } = reading_drills;
  /* ---------- COACHING: one short tip per surface, chosen from what is on screen and how the last attempt went ----------
     Read & play keeps a "Reading focus" line under the score (piece, mode, hands and the slips made so far) that becomes a
     "Next step" when a run ends; reading drills get a focus line for the drill type and a next step in their summary; Score &
     analysis gets "What to notice" in Now and a next step in the practice summary. A tip keeps the facts it was chosen from
     and is re-worded after a language or notation change. */
  // tf, coachList, coachText and coachHTML come from the shell coaching module (src/app/coaching.ts), created with the helpers.
  /* Read & play */
  const srStepNo = (n: { oct: number; li: number; }) => n.oct * 7 + n.li;
  function srKeyNames(keyN: number) { return (keyN > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3]).slice(0, Math.abs(keyN)).map((li) => spelledName(host.i18n.notation(), li, keyN > 0 ? 1 : -1)); }
  // The active hands as onsets per hand: melodic moves, leaps (a third or wider), chords, and whether the rhythm goes beyond whole beats.
  function srShape() {
      const sel = srActiveHands(), f = { moves: 0, leaps: 0, chords: 0, hands: 0, rhythm: false };
      ['rh', 'lh'].forEach((h) => {
          if (sel !== 'both' && sel !== h)
              return;
          const by = new Map<string, SrStaffNote[]>();
          SR.notes.forEach((n: SrStaffNote) => { if (n.hand !== h)
              return; const k = n.beat.toFixed(3); if (!by.has(k))
              by.set(k, []); by.get(k)?.push(n); });
          if (!by.size)
              return;
          f.hands++;
          let prev: SrStaffNote[] | null = null;
          [...by.values()].sort((a, b) => a[0].beat - b[0].beat).forEach((g) => {
              if (g.length > 1)
                  f.chords++;
              else if (prev && prev.length === 1) {
                  f.moves++;
                  if (Math.abs(srStepNo(g[0]) - srStepNo(prev[0])) >= 2)
                      f.leaps++;
              }
              if (g.some((n) => n.dur % 1))
                  f.rhythm = true;
              prev = g;
          });
      });
      return f;
  }
  // A wrong key in Step by step: the right note in another octave, the natural instead of a sharp or flat, a slip inside a chord,
  // the wrong way from the previous note, or the right way but the wrong distance.
  // What kind of slip it was (oct, key, chord, other, dir or dist), the note that was wanted and the key played.
  function srSlip(st: { notes: readonly SrStaffNote[]; }, m: number): SrSlip | null {
      const want = st.notes;
      if (!want.length)
          return null;
      const n = want.reduce((a, b) => Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a);
      if (pc(n.midi) === pc(m))
          return { k: 'oct', n, m };
      if (n.acc && m === n.midi - n.acc)
          return { k: 'key', n, m };
      if (st.notes.filter((x) => x.hand === n.hand).length > 1)
          return { k: 'chord', n, m };
      const prev: SrStaffNote[] = (SR.steps[SR.stepIdx - 1] || { notes: [] }).notes.filter((x: SrStaffNote) => x.hand === n.hand);
      if (!prev.length)
          return { k: 'other', n, m };
      const p = prev.reduce((a: SrStaffNote, b: SrStaffNote) => Math.abs(b.midi - n.midi) < Math.abs(a.midi - n.midi) ? b : a);
      return { k: Math.sign(n.midi - p.midi) !== Math.sign(m - p.midi) ? 'dir' : 'dist', n, m };
  }
  function srSlipNote(st: { notes: readonly SrStaffNote[]; }, m: number) { const s = srSlip(st, m); if (!s)
      return; const E = SR.errs || (SR.errs = {}); E[s.k] = (E[s.k] || 0) + 1; if (s.k === 'key')
      SR.slipKey = s; srCoach(); }
  function srTopSlip() { const E = SR.errs || {}; let top: string|null = null; for (const k of ['key', 'oct', 'chord', 'dir', 'dist']) {
      if ((E[k] || 0) >= 2 && (!top || E[k] > E[top]))
          top = k;
  } return top; }
  const srSlipNames = (s: SrSlip) => [rdLetter(s.n.li), spelledName(host.i18n.notation(), s.n.li, s.n.acc)];
   // what was played (the natural), what is written
  // Reading focus: the slip being repeated right now, else what this piece asks for in this mode.
  function srFocus(): CoachTip | null {
      const p = SR.piece;
      if (!p)
          return null;
      if (SR.modeSel === 'assess')
          return { k: srShape().rhythm ? 'rc_rhythm' : 'rc_ahead' };
      const top = SR.active && srTopSlip();
      if (top === 'key' && SR.slipKey) {
          const s = SR.slipKey;
          return { k: 'rc_e_key', args: () => srSlipNames(s) };
      }
      if (top)
          return { k: 'rc_e_' + top };
      const f = srShape();
      if (f.chords)
          return { k: 'rc_chord' };
      if (p.keyN)
          return { k: 'rc_key', args: () => [srKeyNames(p.keyN).join(' ')] };
      if (f.hands > 1)
          return { k: 'rc_hands' };
      if (f.moves && f.leaps / f.moves >= .3)
          return { k: 'rc_iv' };
      return { k: 'rc_dir' };
  }
  function srNextLearn(): CoachTip {
      const E = SR.errs || {}, top = srTopSlip();
      if (!SR.mistakes)
          return { k: 'rn_clean', act: { k: 'rn_act_assess', run: () => srSetMode('assess') } };
      if (top === 'key' && SR.slipKey) {
          const s = SR.slipKey;
          return { k: 'rn_key', args: () => srSlipNames(s) };
      }
      if (top)
          return { k: 'rn_' + top, args: () => [E[top]] };
      return { k: 'rn_again' };
  }
  // After Assessment: the score, extra notes, and where the misses were — leaps, chords or altered notes — compared with the rest.
  function srNextAssess(pct: number): CoachTip | null {
      const p = SR.piece;
      if (!p)
          return null;
      const bpm = SR.bpm, bad = (n: SrStaffNote) => SR.results[n.nid] !== 'good';
      if (pct >= 95)
          return bpm <= 150 ? { k: 'rn_a_clean', args: () => [pct, bpm + 10], act: { k: 'rn_act_bpm', args: () => [bpm + 10], run: () => srSetBpm(bpm + 10) } } : { k: 'rn_a_top' };
      const cat = { leaps: [0, 0], chords: [0, 0], acc: [0, 0] }, last: { rh?: SrStaffNote[]; lh?: SrStaffNote[]; } = {};
      let all = 0, miss = 0;
      SR.steps.forEach((st: { notes: readonly SrStaffNote[]; }) => (['rh', 'lh'] as const).forEach((h) => {
          const g = st.notes.filter((n) => n.hand === h);
          if (!g.length)
              return;
          const prev = last[h];
          last[h] = g;
          g.forEach((n) => {
              const b = bad(n) ? 1 : 0;
              all++;
              miss += b;
              if (g.length > 1) {
                  cat.chords[0] += b;
                  cat.chords[1]++;
              }
              else if (prev && prev.length === 1 && Math.abs(srStepNo(n) - srStepNo(prev[0])) >= 2) {
                  cat.leaps[0] += b;
                  cat.leaps[1]++;
              }
              if (n.acc) {
                  cat.acc[0] += b;
                  cat.acc[1]++;
              }
          });
      }));
      if (SR.wrongExtra >= 3 && SR.wrongExtra >= miss)
          return { k: 'rn_a_extra', args: () => [SR.wrongExtra] };
      const rate = miss / Math.max(1, all);
      let top: string | null = null, best = 0;
      for (const [k, [b, n]] of Object.entries(cat)) {
          const r = n ? b / n : 0;
          if (b >= 2 && r >= Math.max(.34, rate * 1.5) && r > best) {
              top = k;
              best = r;
          }
      }
      if (top)
          return { k: 'rn_a_' + top };
      if (pct < 80) {
          const v = Math.max(40, bpm - 10);
          return { k: 'rn_a_slow', args: () => [v], act: { k: 'rn_act_bpm', args: () => [v], run: () => srSetBpm(v) } };
      }
      return { k: 'rn_a_good' };
  }
  const srModeControls = ['rd-mode', 'rd-stage-mode'] as const;
  function srModeUi() {
      for (const id of srModeControls) {
          for (const button of byId(id).querySelectorAll('button'))
              button.setAttribute('aria-pressed', String(button.dataset.v === SR.modeSel));
      }
      syncMobileStartBars();
  }
  function srSetMode(v: string) {
      if (srtPendingSaveProtected())
          return;
      const changed = SR.modeSel !== v;
      SR.modeSel = v;
      if (SR.lvPiece)
          RDN.playerMode = v;
      srModeUi();
      srStopAll();
      if (changed)
          rdnResultHide();
      const practiceOnly = v === 'assess' && srtGeneratedSelected() &&
          (SR.srtState?.mode === 'practice' || SR.srtState?.name === 'abandoned' || SR.srtState?.name === 'interrupted');
      if (v === 'learn' && srtGeneratedSelected())
          srtConsumeOnLearnReveal();
      srDraw();
      byId('rd-verdict').textContent = '';
      if (practiceOnly) {
          const message = t('rd_srt_error_already_exposed');
          srtNotice(message);
          byId('rd-verdict').className = 'verdict neutral';
          byId('rd-verdict').textContent = message;
      }
      byId('rd-go').focus();
  }
  function srSetBpm(v: number) { if (srtPendingSaveProtected() || SR.active || SR.listening)
      return; const b = inputById('rd-bpm'); b.value = String(v); byId('rd-bpmLbl').textContent = String(v); SR.bpm = v; SR.next = null; srCoach(); syncMobileStartBars(); byId('rd-go').focus(); }
  // The HTML each coach box last showed.
  const srCoachShown = new WeakMap<HTMLElement, string>();
  // One line under the score; it is a polite live region, so it is only rewritten when the tip itself changes.
  function srCoach() {
      const box = byId('rd-coach');
      if (!box)
          return;
      const c = SR.piece ? (SR.next || srFocus()) : null, html = c ? coachHTML(t(SR.next ? 'coach_next' : 'coach_focus'), c, 'rd-coach-act') : '';
      box.dataset.kind = SR.next ? 'next' : 'focus';
      if (srCoachShown.get(box) !== html) {
          srCoachShown.set(box, html);
          box.innerHTML = html;
      }
  }
  /* Reading drills */
  function rdFocus(L: ReadDrillLevel | null): CoachTip | null {
      if (!L)
          return null;
      const x = rdLetter, c = L.clef;
      if (L.ty === 'rh')
          return { k: 'rdc_rh' };
      if (L.ty === 'iv')
          return { k: 'rdc_iv' };
      if (L.ty === 'ch')
          return { k: L.inv ? 'rdc_chinv' : 'rdc_ch' };
      if (L.ty === 'ks')
          return { k: 'rdc_ks' };
      if (L.ty === 'sr')
          return { k: 'rc_ahead' };
      if (L.ty === 'k2s')
          return { k: 'rdc_k2s' };
      if (L.tag === 'land')
          return { k: 'rdc_land' };
      if ((L.tag === 'lines' || L.tag === 'spaces') && L.set)
          return { k: 'rdc_' + L.tag, args: () => [(L.set ?? []).map((s) => rdName(rdP(s))).join(' ')] };
      if (L.tag === 'ledup' || L.tag === 'leddn')
          return { k: 'rdc_ledger' };
      if (L.keys)
          return { k: 'rdc_keys' };
      if (L.acc)
          return { k: 'rdc_acc' };
      if (c === 'mix')
          return { k: 'rdc_mix' };
      if (c === 'alto' || c === 'tenor')
          return { k: 'rdc_cc', args: () => [x(0)] };
      if (L.ty === 'play')
          return { k: 'rdc_play' };
      if (c === 'grand')
          return { k: 'rdc_gr', args: () => [x(0)] };
      return c === 'bass' ? { k: 'rdc_ba', args: () => [x(3), x(0), x(4)] } : { k: 'rdc_tr', args: () => [x(0), x(4), x(3)] };
  }
  function rdCoach(show: boolean) { const box = byId('rdx-coach'); if (!box)
      return; const c = show ? rdFocus(RD.L) : null; box.hidden = !c; box.innerHTML = c ? coachHTML(t('coach_focus'), c) : ''; }
  // The session's next step: accuracy first, then the notes missed most, then speed; rhythm drills look at the average timing.
  function rdNextStep(L: ReadDrillLevel, mode: string, acc: number, avg: number, stars: number, weak: readonly [string, number][]): CoachTip | null {
      if (L.ty === 'rh') {
          const m: number[] = RD.rhM || [], mean = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
          if (acc < 60)
              return { k: 'rdn_rh_low' };
          if (mean < -35)
              return { k: 'rdn_rh_rush', args: () => [Math.round(-mean)] };
          if (mean > 35)
              return { k: 'rdn_rh_drag', args: () => [Math.round(mean)] };
          return { k: 'rdn_rh_ok' };
      }
      if (!RD.n)
          return null;
      const tg = rdTarget(L) / 1000, sec = avg / 1000, timeAttack = { k: 'rdx_m_timeAttack', run: () => rdStart('timeAttack') };
      // A Survival run lost to the clock needs speed, not hints: timeouts also count against accuracy.
      if (mode === 'survival' && RD.arc && RD.arc.timeouts >= 2)
          return { k: 'rdn_sv_time', act: timeAttack };
      if (acc < 80)
          return { k: 'rdn_hints', act: { k: 'rdn_act_hints', run: () => { rdData().prefs.hints = true; saveAll(); rdStart('practice'); } } };
      if (weak.length && acc < 95)
          return { k: 'rdn_weak', args: () => [weak.slice(0, 3).map(([k]) => rdKeyText(k)).join(', ')], act: mode === 'practice' ? null : { k: 'rdn_act_practice', run: () => rdStart('practice') } };
      if (mode === 'timeAttack' && RD.arc && RD.arc.bestCombo < ARCADE_STREAK)
          return { k: 'rdn_ta' };
      if (sec > tg)
          return { k: 'rdn_speed', args: () => [anNum(sec, 1), anNum(tg, 1)], act: timeAttack };
      if (srtIsArcadeMode(mode))
          return { k: 'rdn_ok' };
      if (mode === 'practice' && RD.chkBest === null)
          return { k: 'rdn_chk', args: () => [RD_CHECK_N] };
      if (stars < 3)
          return { k: 'rdn_star', args: () => [stars >= 2 ? 95 : 90, anNum(stars >= 2 ? tg : tg * 1.6, 1)] };
      const nx = rdLvNext(L);
      if (!L.custom && nx)
          return { k: 'rdn_next', args: () => [rdLvName(nx)] };
      return { k: 'rdn_ok' };
  }
  function rdNextRender() { const box = maybeById('rdx-next'); if (box && RD.next)
      box.innerHTML = coachHTML(t('coach_next'), RD.next, 'rdx-next-act'); }
  function collectPracticeReport(buildReport: typeof buildPracticeReport, libraryItems: readonly LibraryItem[] = []) {
      const tn = todayN();
      const book = rdnBook();
      const tally = srtBookTally(book, book.level);
      const rd = rdData();
      const stars = RD_ALL.reduce((sum, level) => sum + rdStarCount(rd.lv[level.id]?.s), 0);
      const pieces: PracticeReportPieceInput[] = [];
      for (const piece of PIECES) {
          const rec = host.store.data().sheet[piece.id];
          if (rec && (rec.learned || rec.best)) {
              pieces.push({
                  title: srPieceTitle(piece),
                  source: 'builtin',
                  learned: !!rec.learned,
                  bestPct: rec.best ? rec.best : null,
              });
          }
      }
      for (const item of libraryItems) {
          const learned = item.status === 'mastered';
          const bestPct = typeof item.best === 'number' ? item.best : null;
          if (learned || bestPct !== null) {
              pieces.push({
                  title: item.title || item.name,
                  source: 'library',
                  learned,
                  bestPct,
              });
          }
      }
      return buildReport({
          today: tn,
          totalReviews: host.store.data().totalReviews || 0,
          totalCorrect: host.store.data().totalCorrect || 0,
          streak: currentStreak(),
          bestStreak: host.store.data().bestStreak || 0,
          mastered: masteredCount(),
          totalItems: ITEMS.length,
          srs: host.store.data().srs,
          history: host.store.data().history || {},
          items: ITEMS,
          categories: Object.keys(CATS),
          catLabel: shell.catLabel,
          itemLabel: (it) => {
              const full = ITEMS.find((candidate) => candidate.id === it.id);
              return full ? itemLabel(full) : it.id;
          },
          reading: {
              bookLevel: book.level,
              bookDone: tally.done,
              bookTotal: SRT_BOOK_PIECES,
              piecesRead: srtPiecesRead(book),
              drillAnswers: rd.tot.n,
              drillCorrect: rd.tot.ok,
              stars,
          },
          pieces,
          lessonsDone: shell.learnLessonsDone(),
      });
  }

  function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
  function wiringInput(e: Event): HTMLInputElement {
      const el = e.target;
      if (el instanceof HTMLInputElement)
          return el;
      throw new Error('Étude: expected an <input> event target');
  }
  /* ---------- feature controller ---------- */
  let mounted = false;
  function mount(): void {
    if (mounted) return;
    mounted = true;
    reflectSettings();
    (function rdInit() {
        const dr = byId('rdp-drills');
        if (!dr)
            return;
        byId('rd-tabs').addEventListener('click', (e) => { const b = eventClosest(e, '[data-tab]'); if (b) {
            rdTab(b.dataset.tab);
            saveAll();
        } });
        byId('rd-tabs').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
                return;
            const tabs = queryAllHtml(byId('rd-tabs'), '[role=tab]'), fe = document.activeElement, i = fe instanceof HTMLElement ? tabs.indexOf(fe) : -1;
            if (i < 0)
                return;
            e.preventDefault();
            const n = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            n.focus();
            rdTab(n.dataset.tab);
        });
        dr.addEventListener('click', (e) => {
            const cat = eventClosest(e, '#rdx-filters [data-cat]');
            if (cat) {
                reading_drills.rdxFilter = cat.dataset.cat ?? 'all';
                rdRenderHome();
                return;
            }
            const lv = eventClosest(e, '[data-lv]');
            if (lv) {
                const L = RD_LV[lv.dataset.lv ?? ''];
                if (!L)
                    return;
                rdOpen(L);
                return;
            }
            if (eventClosest(e, '#rdx-chal')) {
                const open = byId('rdx-chal').getAttribute('aria-expanded') !== 'true';
                rdChalOpen(open, open ? 'first' : undefined);
                return;
            }
            const md = eventClosest(e, '[data-mode]');
            if (md) {
                rdStart(md.dataset.mode ?? '', Number(md.dataset.bars) || undefined);
                return;
            }
            const a = eventClosest(e, '.rdx-a');
            if (a) {
                rdClickAns(a);
                return;
            }
            const ac = eventClosest(e, '[data-acc]');
            if (ac) {
                RD.accSel = Number(ac.dataset.acc);
                ac.parentNode?.querySelectorAll('[data-acc]').forEach((x) => x.setAttribute('aria-pressed', x === ac ? 'true' : 'false'));
                return;
            }
            if (eventClosest(e, '#rdx-next-act')) {
                if (RD.next && RD.next.act)
                    RD.next.act.run();
                return;
            }
            const act = eventClosest(e, '[data-act]');
            if (act) {
                const k = act.dataset.act;
                if (k === 'again')
                    rdStart(RD.mode);
                else if (k === 'next') {
                    const nx = RD.L && rdLvNext(RD.L);
                    if (nx)
                        rdOpen(nx);
                }
                else if (k === 'levels')
                    rdBack();
                else if (k === 'rhnew')
                    rdRhNew();
                else if (k === 'rhagain')
                    rdRhNew(true);
                return;
            }
            const hb = eventClosest(e, '[data-hands]');
            if (hb) {
                if ((hb instanceof HTMLButtonElement && hb.disabled) || (RD.rh && RD.rh.playing))
                    return;
                rdData().prefs.rhHands = Number(hb.dataset.hands) === 2 ? 2 : 1;
                saveAll();
                rdRhNew(true);
                return;
            }
            const b = eventClosest(e, 'button'), id = b && b.id;
            if (id === 'rdx-back')
                rdBack();
            else if (id === 'rdx-end')
                rdEndClick();
            else if (id === 'rdx-hear' && RD.q)
                rdSound(RD.q.midis, RD.q.ty === 'iv' && !RD.q.harm);
            else if (id === 'rdx-hintb')
                rdHint();
            else if (id === 'rdx-rhgo')
                void rdRhRun(false);
            else if (id === 'rdx-rhlisten')
                void rdRhRun(true);
            else if (b && b.classList.contains('rdx-tap') && e.detail === 0)
                rdTap(b.dataset.hand);
            else if (id === 'rdx-c-go')
                rdCustomGo();
        });
        dr.addEventListener('keydown', rdChalKey);
        // A press outside the Challenge menu closes it.
        document.addEventListener('pointerdown', (e) => { const m = maybeById('rdx-chal-menu'); if (m && !m.hidden && !eventClosest(e, '#rdx-chal, #rdx-chal-menu'))
            rdChalOpen(false); });
        dr.addEventListener('pointerdown', (e) => {
            const pad = eventClosest(e, '.rdx-tap');
            if (pad) {
                e.preventDefault();
                touchInput(e, () => rdRhPress('p' + e.pointerId, pad.dataset.hand || 'R'));
            }
        });
        const up = (e: PointerEvent) => { touchInput(e, () => rdRhRelease('p' + e.pointerId)); };
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
        document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter' || k === 'f' || k === 'j')
            rdRhRelease('k:' + k); });
        dr.addEventListener('change', (e) => {
            const el = e.target, id = el instanceof HTMLElement ? el.id : '', checked = el instanceof HTMLInputElement && el.checked, p = rdData().prefs;
            if (id === 'rdx-show-orch') {
                reading_drills.rdxShowOrch = checked;
                rdRenderHome();
                return;
            }
            if (id === 'rdx-snd') {
                p.sound = checked;
                saveAll();
            }
            else if (id === 'rdx-hints') {
                p.hints = checked;
                saveAll();
            }
            else if (id === 'rdx-flow') {
                p.flow = checked;
                saveAll();
                const g = maybeById('rdx-ghost');
                if (g instanceof HTMLInputElement)
                    g.disabled = !checked;
            }
            else if (id === 'rdx-ghost') {
                p.ghost = checked;
                saveAll();
            }
            else if (id === 'rdx-stage-pref') {
                p.stage = checked;
                saveAll();
            }
            else if (id === 'rdx-weak-inject')
                setWeakSpotInjection(checked);
            else if (id === 'rdx-rhdur') {
                if (RD.rh && RD.rh.playing) {
                    if (el instanceof HTMLInputElement)
                        el.checked = !checked;
                    return;
                }
                p.rhDur = checked;
                saveAll();
                rdRhNew(true);
            }
            else if (id === 'rdx-c-clef') {
                const d = RD_CDEF[el instanceof HTMLSelectElement ? el.value : ''];
                selectById('rdx-c-lo').value = d[0];
                selectById('rdx-c-hi').value = d[1];
                rdCustomRead();
            }
            else if (/^rdx-c-/.test(id))
                rdCustomRead();
        });
        byId('rdx-stats').addEventListener('click', async (e) => { if (eventElement(e)?.id === 'rdx-reset' && await appConfirm(t('rdx_reset_q'))) {
            const d = rdData();
            d.nt = {};
            d.tot = { n: 0, ok: 0, ms: 0, sess: 0 };
            saveAll();
            rdRenderStats();
        } });
        const g = byId('rd-gen');
        if (g)
            g.addEventListener('click', rdGenMelody);
    })();
    (function rdnInit() {
        const home = maybeById('rdn-home');
        if (!home)
            return;
        home.addEventListener('click', rdnHomeClick);
        byId('rdn-back').addEventListener('click', () => rdnHome(true));
        byId('rdn-w-back').addEventListener('click', () => rdnHome(true));
        byId('rdn-w-flash').addEventListener('click', rdnWarmFlashClick);
        byId('rdn-prev').addEventListener('click', () => rdnStep(-1));
        byId('rdn-next').addEventListener('click', () => rdnStep(1));
        byId('rd-stage-next').addEventListener('click', () => rdnStep(1));
        // Any other control of the player stops the auto-next countdown (the result card's and the unsaved result's buttons
        // handle it themselves).
        const read = byId('view-read'), stopAuto = (e: Event) => {
            if (!RDN.autoTimer && !RDN.autoWait)
                return;
            const el = e.target instanceof Element ? e.target.closest('button, input, select, summary, label, [role=button]') : null;
            // Retry save keeps a waiting auto-next: it starts once the result is saved.
            if (el && !el.closest('#rdn-result, #rd-srt-pending'))
                rdnAutoCancel();
        };
        read.addEventListener('click', stopAuto, true);
        read.addEventListener('input', stopAuto, true);
        read.addEventListener('change', stopAuto, true);
        const result = byId('rdn-result');
        result.addEventListener('click', (e) => {
            const id = eventClosest(e, 'button')?.id;
            if (id === 'rdn-retry')
                rdnRetry();
            else if (id === 'rdn-listen') {
                rdnAutoCancel();
                srListen();
            }
            else if (id === 'rdn-r-next')
                rdnStep(1);
            else if (id === 'rdn-auto-cancel')
                rdnAutoCancel();
        });
        result.addEventListener('change', (e) => {
            const el = e.target;
            if (!(el instanceof HTMLInputElement) || el.id !== 'rdn-autonext')
                return;
            rdData().prefs.autoNext = el.checked;
            saveAll();
            if (!el.checked)
                rdnAutoCancel();
        });
    })();
    // Language or note names changed: re-word every tip on show.
    shell.registerCoach(() => srCoach());
    shell.registerCoach(() => { if (RD.L && !byId('rdx-coach').hidden)
        rdCoach(true); });
    shell.registerCoach(() => rdNextRender());
      // read & play (sheet music)
      byId('rd-to-pieces').addEventListener('click', () => host.nav.show('analysis'));
      const onHandsClick = (e: MouseEvent) => {
          const b = eventClosest(e, 'button');
          if (!b || wiringDisabled(b) || srtPendingSaveProtected())
              return;
          const v = b.dataset.v ?? SR.hands;
          SR.hands = v;
          [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
              if (!container)
                  return;
              [...container.children].forEach((x) => {
                  if (x instanceof HTMLElement)
                      x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false');
              });
          });
          rdnHandsHint();
          if (!SR.piece)
              return; // no melody yet: the choice applies to the next one
          const staffEl = maybeById('rd-staff');
          if (staffEl)
              staffEl.dataset.activeHand = srActiveHands();
          srStopAll();
          srStepsBuild();
          srPaintAll();
          srTargets();
          srCoach();
          byId('rd-verdict').textContent = '';
      };
      byId('rd-hands').addEventListener('click', onHandsClick);
      maybeById('rd-stage-hands')?.addEventListener('click', onHandsClick);
      for (const id of srModeControls) {
          byId(id).addEventListener('click', (e) => {
              const mode = eventClosest(e, 'button')?.dataset.v;
              if (mode === 'learn' || mode === 'assess')
                  srSetMode(mode);
          });
      }
      byId('rd-names').addEventListener('change', (e) => {
          if (srtPendingSaveProtected()) {
              wiringInput(e).checked = SR.names;
              return;
          }
          SR.names = wiringInput(e).checked;
          if (srtEligibleFirstSightActive()) {
              srDraw();
              return;
          }
          srStopAll();
          srDraw();
      });
      maybeById('rd-any-octave')?.addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          host.store.data().settings.anyOctave = checked;
          SR.anyOctave = checked;
          if (SR.active && SR.modeSel === 'assess' && SR.instantFeedback) {
              const nowMs = performance.now() - SR.t0;
              read_play_engine.srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: checked });
          }
          const setOct = maybeById('set-any-octave');
          if (setOct instanceof HTMLInputElement)
              setOct.checked = checked;
          saveAll();
      });
      maybeById('rd-instant')?.addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          rdData().prefs.instantFeedback = checked;
          SR.instantFeedback = checked;
          if (SR.active && SR.modeSel === 'assess') {
              if (checked) {
                  const nowMs = performance.now() - SR.t0;
                  read_play_engine.srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: SR.anyOctave });
              }
              else {
                  srInstantReset();
                  SR.results = {};
                  SR.wrongExtra = 0;
                  srPaintAll();
                  kbClear('good');
                  kbClear('bad');
                  if (SR.assessOn) {
                      const v = byId('rd-verdict');
                      v.className = 'verdict neutral';
                      v.textContent = t('rd_play');
                  }
              }
          }
          saveAll();
      });
      const tempo = inputById('rd-bpm');
      const syncTempo = () => {
          if (srtPendingSaveProtected() || SR.active || SR.listening) {
              tempo.value = String(SR.bpm);
              return;
          }
          SR.bpm = tempo.valueAsNumber;
          byId('rd-bpmLbl').textContent = tempo.value;
          syncMobileStartBars();
      };
      tempo.addEventListener('input', syncTempo);
      byId('rd-bpm-down').addEventListener('click', () => {
          tempo.stepDown();
          syncTempo();
      });
      byId('rd-bpm-up').addEventListener('click', () => {
          tempo.stepUp();
          syncTempo();
      });
      byId('rd-go').addEventListener('click', srGo);
      maybeById('rd-mobile-start')?.addEventListener('click', () => { byId('rd-go').click(); });
      maybeById('rd-stage-end')?.addEventListener('click', () => {
          srGo();
          if (!SR.active)
              byId('rd-go').focus({ preventScroll: true });
      });
      byId('rd-srt-start').addEventListener('click', () => srtStartClaimedAttempt());
      byId('rd-srt-practice').addEventListener('click', () => { void srtSwitchToPractice(); });
      byId('rd-srt-retry').addEventListener('click', () => { void srtRetryPendingSave(); });
      byId('rd-srt-continue').addEventListener('click', srtContinueWithoutSave);
      byId('rd-coach').addEventListener('click', (e) => { if (eventClosest(e, '#rd-coach-act') && SR.next && SR.next.act)
          SR.next.act.run(); });
      byId('rd-listen').addEventListener('click', srListen);
      maybeById('rd-warm-tonic')?.addEventListener('click', rdWarmPlayTonic);
      maybeById('rd-warm-scale')?.addEventListener('click', rdWarmPracticeScale);
      // The sight-reading and rhythm staves are laid out for the size of their paper (see SrLayout).
      if (typeof ResizeObserver === 'function') {
          let fitRaf = 0;
          const fit = new ResizeObserver(() => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => { srFit(); rdRhFit(); }); });
          ['rd-staff', 'rdx-body', 'dock'].forEach((id) => { const el = maybeById(id); if (el) fit.observe(el); });
      }
  }

  // The saved "Accept any octave" and instant-feedback choices, on mount and whenever Settings are reflected again.
  function reflectSettings(): void {
    const data = host.store.data();
    SR.anyOctave = !!data.settings.anyOctave;
    const rdOct = maybeById('rd-any-octave');
    if (rdOct instanceof HTMLInputElement)
      rdOct.checked = !!data.settings.anyOctave;
    SR.instantFeedback = !!data.reading?.prefs?.instantFeedback;
    const rdInstant = maybeById('rd-instant');
    if (rdInstant instanceof HTMLInputElement)
      rdInstant.checked = SR.instantFeedback;
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted) return;
    const keyId = params?.readingKeyId;
    if (typeof keyId === 'string') {
      const match = srtReadingKeys().find((k) => k.id === keyId);
      if (match) rdnChoose(rdnBook().level, match.id);
    }
    renderRead();
    const drillId = params?.readingDrillId;
    if (typeof drillId === 'string') {
      rdTab('drills');
      const drillLevel = RD_LV[drillId];
      if (drillLevel) rdOpen(drillLevel);
    }
  }

  function viewInput(kind: 'on' | 'off', midi: number, lastHeld: number | undefined): boolean {
    if (kind === 'on' && WARM.on && WARM.phase === 'play') {
      rdnWarmNote(midi);
      return true;
    }
    if (RD.on && RD.L && RD.L.ty === 'rh') {
      if (midi != null)
        rdRhKey(kind, midi);
      return true;
    }
    if (RD.on && kind === 'on') {
      if (lastHeld != null)
        rdInput(lastHeld);
      return true;
    }
    if (SR.active && kind === 'on') {
      srKeyInput(midi);
      return true;
    }
    return false;
  }

  function preInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: 'physical' | 'focus' | 'reset' | null): boolean {
    // A waiting level piece starts on its first note; the keys played while its first sight is claimed are kept for the recorder.
    if (!(SR.active && srtRecorder) && srNoteStartInput(kind, midi, source, releaseKind))
      return true;
    if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder) {
      const relMs = inputTimeForRelease(releaseKind) - SR.t0;
      srtRecorder.record(kind, midi, source, releaseKind, relMs);
      if (kind === 'on' && SR.instantFeedback)
        srInstantHandleNote(midi, relMs);
    }
    return false;
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      "heldPcs": { get: () => heldPcs },
      "LETTERS": { get: () => LETTERS },
      "RD": { get: () => RD },
      "RD_CDEF": { get: () => RD_CDEF },
      "RD_CHECK_N": { get: () => RD_CHECK_N },
      "RD_CHQ": { get: () => RD_CHQ },
      "RD_CLEFC": { get: () => RD_CLEFC },
      "RD_LH_PAT": { get: () => RD_LH_PAT },
      "RD_LM": { get: () => RD_LM },
      "RD_MAJ": { get: () => RD_MAJ },
      "RD_MIN": { get: () => RD_MIN },
      "RD_REF": { get: () => RD_REF },
      "RD_RHU": { get: () => RD_RHU },
      "RD_TARGET": { get: () => RD_TARGET },
      "rdAbort": { get: () => rdAbort },
      "rdAccSym": { get: () => rdAccSym },
      "rdAgg": { get: () => rdAgg },
      "rdAnsText": { get: () => rdAnsText },
      "rdAnswer": { get: () => rdAnswer },
      "rdBack": { get: () => rdBack },
      "rdBars": { get: () => rdBars },
      "rdBeatX": { get: () => rdBeatX },
      "rdBtn": { get: () => rdBtn },
      "rdCClef": { get: () => rdCClef },
      "rdChLabel": { get: () => rdChLabel },
      "rdClear": { get: () => rdClear },
      "rdClick": { get: () => rdClick },
      "rdClickAns": { get: () => rdClickAns },
      "rdCoach": { get: () => rdCoach },
      "rdCustomFill": { get: () => rdCustomFill },
      "rdCustomGo": { get: () => rdCustomGo },
      "rdCustomRead": { get: () => rdCustomRead },
      "rdEndClick": { get: () => rdEndClick },
      "rdFeedback": { get: () => rdFeedback },
      "rdFinish": { get: () => rdFinish },
      "rdFocus": { get: () => rdFocus },
      "rdFromStep": { get: () => rdFromStep },
      "rdGen": { get: () => rdGen },
      "rdGenMelody": { get: () => rdGenMelody },
      "rdHeat": { get: () => rdHeat },
      "rdHint": { get: () => rdHint },
      "rdHud": { get: () => rdHud },
      "rdInput": { get: () => rdInput },
      "rdIntro": { get: () => rdIntro },
      "rdIvName": { get: () => rdIvName },
      "rdKey": { get: () => rdKey },
      "rdKeyLabel": { get: () => rdKeyLabel },
      "rdKeyMinor": { get: () => rdKeyMinor },
      "rdKeyText": { get: () => rdKeyText },
      "rdKsSvg": { get: () => rdKsSvg },
      "rdLetter": { get: () => rdLetter },
      "rdLvDetail": { get: () => rdLvDetail },
      "rdLvNext": { get: () => rdLvNext },
      "rdLvSub": { get: () => rdLvSub },
      "rdMidi": { get: () => rdMidi },
      "RDN": { get: () => RDN },
      "RDN_WARM_MS": { get: () => RDN_WARM_MS },
      "rdName": { get: () => rdName },
      "rdnBook": { get: () => rdnBook },
      "rdNext": { get: () => rdNext },
      "rdNextRender": { get: () => rdNextRender },
      "rdNextStep": { get: () => rdNextStep },
      "rdnHome": { get: () => rdnHome },
      "rdNk": { get: () => rdNk },
      "rdnOpen": { get: () => rdnOpen },
      "rdnRecord": { get: () => rdnRecord },
      "rdnRenderHome": { get: () => rdnRenderHome },
      "rdnStep": { get: () => rdnStep },
      "rdnToday": { get: () => rdnToday },
      "rdnWarmupStart": { get: () => rdnWarmupStart },
      "rdOnLocale": { get: () => rdOnLocale },
      "rdOpen": { get: () => rdOpen },
      "rdP": { get: () => rdP },
      "rdPickFrom": { get: () => rdPickFrom },
      "rdPool": { get: () => rdPool },
      "rdQSvg": { get: () => rdQSvg },
      "rdRangeTxt": { get: () => rdRangeTxt },
      "rdRender": { get: () => rdRender },
      "rdRenderHome": { get: () => rdRenderHome },
      "rdRenderStats": { get: () => rdRenderStats },
      "rdRhDone": { get: () => rdRhDone },
      "rdRhFit": { get: () => rdRhFit },
      "rdRhGen": { get: () => rdRhGen },
      "rdRhGenLH": { get: () => rdRhGenLH },
      "rdRhGrade": { get: () => rdRhGrade },
      "rdRhGradeAll": { get: () => rdRhGradeAll },
      "rdRhGradeHand": { get: () => rdRhGradeHand },
      "rdRhHandLine": { get: () => rdRhHandLine },
      "rdRhKey": { get: () => rdRhKey },
      "rdRhMarks": { get: () => rdRhMarks },
      "rdRhNew": { get: () => rdRhNew },
      "rdRhNoteTip": { get: () => rdRhNoteTip },
      "rdRhOptsLock": { get: () => rdRhOptsLock },
      "rdRhPrefs": { get: () => rdRhPrefs },
      "rdRhPress": { get: () => rdRhPress },
      "rdRhRelease": { get: () => rdRhRelease },
      "rdRhRun": { get: () => rdRhRun },
      "rdRhStrokes": { get: () => rdRhStrokes },
      "rdScroll": { get: () => rdScroll },
      "rdSightDone": { get: () => rdSightDone },
      "rdSightGen": { get: () => rdSightGen },
      "rdSightStart": { get: () => rdSightStart },
      "rdSound": { get: () => rdSound },
      "rdSpell": { get: () => rdSpell },
      "rdStars": { get: () => rdStars },
      "rdStart": { get: () => rdStart },
      "rdStat": { get: () => rdStat },
      "rdStep": { get: () => rdStep },
      "rdSuggest": { get: () => rdSuggest },
      "rdSvg": { get: () => rdSvg },
      "rdTab": { get: () => rdTab },
      "rdTap": { get: () => rdTap },
      "rdTarget": { get: () => rdTarget },
      "reduceMotion": { get: () => reduceMotion },
      "renderRead": { get: () => renderRead },
      "SR": { get: () => SR },
      "srActiveHands": { get: () => srActiveHands },
      "srAssessFinish": { get: () => srAssessFinish },
      "srAssessLoop": { get: () => srAssessLoop },
      "srAssessStart": { get: () => srAssessStart },
      "srBeatToX": { get: () => srBeatToX },
      "srClick": { get: () => srClick },
      "srCoach": { get: () => srCoach },
      "srCount": { get: () => srCount },
      "srCursor": { get: () => srCursor },
      "srDraw": { get: () => srDraw },
      "srEmptyUi": { get: () => srEmptyUi },
      "srFit": { get: () => srFit },
      "srFocus": { get: () => srFocus },
      "srGo": { get: () => srGo },
      "srHandsAvail": { get: () => srHandsAvail },
      "srKeyInput": { get: () => srKeyInput },
      "srKeyNames": { get: () => srKeyNames },
      "srLearnFinish": { get: () => srLearnFinish },
      "srLearnStart": { get: () => srLearnStart },
      "srListen": { get: () => srListen },
      "srMeta": { get: () => srMeta },
      "srNextAssess": { get: () => srNextAssess },
      "srNextLearn": { get: () => srNextLearn },
      "srNoteStart": { get: () => read_play_engine.srNoteStart },
      "srPaintAll": { get: () => srPaintAll },
      "srPlayGap": { get: () => srPlayGap },
      "srRender": { get: () => srRender },
      "srScrollStep": { get: () => srScrollStep },
      "srScrollX": { get: () => srScrollX },
      "srSelectPiece": { get: () => srSelectPiece },
      "srSetBpm": { get: () => srSetBpm },
      "srSetMode": { get: () => srSetMode },
      "srShape": { get: () => srShape },
      "srShowPiece": { get: () => srShowPiece },
      "srSlip": { get: () => srSlip },
      "srSlipNames": { get: () => srSlipNames },
      "srSlipNote": { get: () => srSlipNote },
      "srStepNo": { get: () => srStepNo },
      "srStepsBuild": { get: () => srStepsBuild },
      "srStopAll": { get: () => srStopAll },
      "srSvg": { get: () => srSvg },
      "srTargets": { get: () => srTargets },
      "srTol": { get: () => srTol },
      "srTopSlip": { get: () => srTopSlip },
      "srtRecorder": { get: () => srtRecorder },
      "srtSetState": { get: () => srtSetState },
      "srtStartClaimedAttempt": { get: () => srtStartClaimedAttempt },
      "srtStartFirstSight": { get: () => srtStartFirstSight },
      "srtStartPractice": { get: () => srtStartPractice },
      "srtSwitchToPractice": { get: () => srtSwitchToPractice },
      "stageSync": { get: () => stageSync },
      "WARM": { get: () => WARM },
      // For tests: the markup the engraver draws for a score, laid out for the Read paper (or a given layout).
      "srRenderScore": { value: (score: SrScore, layout?: SrLayout) => srRender(score, layout ?? srPaper()).svg },
    });
    // Intentionally mutable: a regression test replaces the daily-set chooser in place.
    registry.defineMutable('rdnEnsureDailyOf', () => read_home.rdnEnsureDailyOf, (value) => { read_home.rdnEnsureDailyOf = value; });
  }

  return {
    mount,
    enter,
    leave: () => { rdnLeaveView(); },
    isBusy: () => SR.active || RD.on,
    onStorageSync: () => { if (view0() === 'read' && !byId('rdn-home').hidden) rdnRenderHome(false); },
    registerTestSurface,
    isPendingSaveProtected: srtPendingSaveProtected,
    isPendingSaveState: () => SR.srtState?.name === 'pendingSave',
    abandonClaim: () => srtAbandonClaim('abandoned', false),
    hasPiece: () => !!SR.piece,
    svg: srSvg,
    firstSightActive: srtEligibleFirstSightActive,
    autoCancel: rdnAutoCancel,
    stageSync,
    stageRefit,
    stageResize,
    key: (e, k) => stageKey(e) || rdKey(e, k) || rdnKey(e),
    trackHeldSource: (source) => {
      if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder && host.overlays.openCount() === 0)
        srtRecorder.trackSource(source, inputTime() - SR.t0);
    },
    preInput,
    viewInput,
    releaseInput: read_play_engine.releaseInput,
    releaseFocus: () => {
      if (RD.rh)
        [...RD.rh.open.keys()].forEach((s) => { if (/^(k:|p\d)/.test(s))
          rdRhRelease(s); });
    },
    panicBegin: () => {
      rdnAutoCancel();
      if (WARM.on) rdnHome();
      if (RD.on && RD.L?.ty !== 'rh') rdAbort();
    },
    panicRecorder: () => {
      srtCancelAttempt('interrupted');
      if (srtRecorder) srtRecorder.releaseAll('reset', performance.now() - SR.t0);
    },
    panicRhythm: rdRhInterrupt,
    panicStopAll: () => srStopAll(true, true),
    stopForNavigation: () => {
      srStopAll(undefined, false, 'navigate');
      rdAbort();
    },
    readySync: rdnReadySync,
    dockView: rdDockView,
    dockPaint: rdDockPaint,
    watchAudioContext: srtWatchAudioContext,
    relocalizePiece: () => {
      if (SR.piece) {
        srMeta();
        if (SR.srtEvaluation && SR.srtState && ['completed', 'pendingSave', 'saved'].includes(SR.srtState.name))
          srRenderAssessResult();
        srPaintAll();
      }
    },
    onNotation: () => {
      if (view0() === 'read' && SR.piece) {
        // Leave the active score and its cursor intact until the assessment ends.
        if (!SR.active && !srtEligibleFirstSightActive()) srDraw();
        srMeta();
      }
    },
    onLocale: rdOnLocale,
    forgetBook: (book) => { if (typeof book === 'object' && book !== null) rdnNormalized.delete(book); },
    reflectSettings,
    releaseRecorder: (kind) => { srtRecorder?.releaseAll(kind, performance.now() - SR.t0); },
    fit: srFit,
    setAnyOctave: (on) => { SR.anyOctave = on; },
    redraw: () => { if (view0() === 'read' && SR.piece) srDraw(); },
    mobileBar: () => ({
      ready: !!SR.piece && !SR.active && !SR.listening,
      summary: `${t(SR.modeSel === 'assess' ? 'rd_m_assess' : 'rd_m_learn')} · ${SR.bpm} BPM`,
    }),
    collectPracticeReport,
    renderStats: rdRenderStats,
  };
}
