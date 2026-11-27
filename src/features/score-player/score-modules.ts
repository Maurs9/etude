import type * as notationApi from '../../domain/notation.js';
import type {
  gradePracticeSustain as gradePracticeSustainFn,
  practiceAccuracy as pracAccFn,
  practicePercent as practicePercentFn,
  practiceSustainReference as practiceSustainReferenceFn,
} from '../../domain/practice-scoring.js';
import type {
  classifyUnmatchedKeyPress as classifyUnmatchedKeyPressFn,
  extractSustainMistakes as extractSustainMistakesFn,
  groupPracticeMistakes as groupPracticeMistakesFn,
  practicePassageBounds as practicePassageBoundsFn,
} from '../../domain/practice-mistakes.js';
import type { createCursorCurves as createCursorCurvesFn, cursorCurveAt as cursorCurveAtFn } from '../../domain/score-cursor.js';
import type { bindScoreGestures as bindScoreGesturesFn } from '../../domain/score-gestures.js';
import type {
  performanceTimeline as performanceTimelineFn,
  performanceAt as performanceAtFn,
  performanceOf as performanceOfFn,
  performanceMarkers as performanceMarkersFn,
  performanceWindow as performanceWindowFn,
} from '../../domain/performance-timeline.js';
import type { repeatRanges as repeatRangesFn, scoreXmlRepeatBars as scoreXmlRepeatBarsFn } from '../../domain/score-repeats.js';

/*
 * The Score Player's heavy modules (import, SVG post-processing, MIDI, harmony/feature analysis, expression, OSMD adapter,
 * practice scoring, mistakes, cursor curves, gestures, performance timeline and repeats).
 *
 * They are imported dynamically, and only from ensureScoreModules(): nothing here runs at module import time, so loading the
 * Score Player feature module itself (which test-surface builds do at boot) never pulls the `score-tools` chunk into Today or
 * Explore. The bindings below are ES live bindings: importers see them once ensureScoreModules() has resolved.
 */
export let scoreFeature: typeof import('../../domain/score-feature.js');
export let AN_SMUFL_NOTES: typeof import('../../domain/score-import.js').AN_SMUFL_NOTES;
export let SCORE_STEP: typeof import('../../domain/score-import.js').SCORE_STEP;
export let importMxlPreflight: typeof import('../../domain/score-import.js').anMxlPreflight;
export let anParse: typeof import('../../domain/score-import.js').anParse;
export let importReadXml: typeof import('../../domain/score-import.js').anReadXml;
export let anXmlTidy: typeof import('../../domain/score-import.js').anXmlTidy;
export let defaultInflatedSize: typeof import('../../domain/score-import.js').defaultInflatedSize;
export let scoreXmlEndings: typeof import('../../domain/score-import.js').scoreXmlEndings;
export let scoreXmlEngraving: typeof import('../../domain/score-import.js').scoreXmlEngraving;
export let scoreXmlLayout: typeof import('../../domain/score-import.js').scoreXmlLayout;
export let scoreXmlNotes: typeof import('../../domain/score-import.js').scoreXmlNotes;
export let isScoreOsmdSheet: typeof import('../../domain/score-svg-post.js').isScoreOsmdSheet;
export let scoreFixFingerings: typeof import('../../domain/score-svg-post.js').scoreFixFingerings;
export let scoreFixPedalsDefault: typeof import('../../domain/score-svg-post.js').scoreFixPedalsDefault;
export let rememberScorePedalLayout: typeof import('../../domain/score-svg-post.js').rememberScorePedalLayout;
export let scoreNightSweep: typeof import('../../domain/score-svg-post.js').scoreNightSweep;
export let scoreRingFit: typeof import('../../domain/score-svg-post.js').scoreRingFit;
export let scoreShiftY: typeof import('../../domain/score-svg-post.js').scoreShiftY;
export let scoreStyleHeader: typeof import('../../domain/score-svg-post.js').scoreStyleHeader;
export let scoreVendorField: typeof import('../../domain/score-svg-post.js').scoreVendorField;
export let scoreVendorList: typeof import('../../domain/score-svg-post.js').scoreVendorList;
export let anAssignHands: typeof import('../../domain/score-midi.js').anAssignHands;
export let scoreBeams: typeof import('../../domain/score-midi.js').scoreBeams;
export let scoreMidiToXml: typeof import('../../domain/score-midi.js').scoreMidiToXml;
export let buildExpressiveTempos: typeof import('../../domain/score-expression.js').buildExpressiveTempos;
export let buildScoreExpression: typeof import('../../domain/score-expression.js').buildScoreExpression;
export let scorePatchOsmd: typeof notationApi.scorePatchOsmd | undefined;
export let computeFitWidthLayout: typeof notationApi.computeFitWidthLayout;
export let notationReloadMessage: typeof notationApi.notationReloadMessage | undefined;
export let gradePracticeSustain: typeof gradePracticeSustainFn;
export let pracAcc: typeof pracAccFn;
export let practicePercent: typeof practicePercentFn;
export let practiceSustainReference: typeof practiceSustainReferenceFn;
export let classifyUnmatchedKeyPress: typeof classifyUnmatchedKeyPressFn;
export let extractSustainMistakes: typeof extractSustainMistakesFn;
export let groupPracticeMistakes: typeof groupPracticeMistakesFn;
export let practicePassageBounds: typeof practicePassageBoundsFn;
export let createCursorCurves: typeof createCursorCurvesFn;
export let cursorCurveAt: typeof cursorCurveAtFn;
export let bindScoreGestures: typeof bindScoreGesturesFn;
export let performanceTimeline: typeof performanceTimelineFn;
export let performanceAt: typeof performanceAtFn;
export let performanceOf: typeof performanceOfFn;
export let performanceMarkers: typeof performanceMarkersFn;
export let performanceWindow: typeof performanceWindowFn;
export let repeatRanges: typeof repeatRangesFn;
export let scoreXmlRepeatBars: typeof scoreXmlRepeatBarsFn;

let ready = false;
let loading: Promise<void> | null = null;

/** True once every Score Player module has loaded and the live bindings above are assigned. */
export function scoreModulesReady(): boolean {
  return ready;
}

/** Loads the Score Player modules once; a failed load clears itself so the next call retries. */
export function ensureScoreModules(): Promise<void> {
  if (!loading) {
    loading = Promise.all([
      import('../../domain/score-import.js'),
      import('../../domain/score-svg-post.js'),
      import('../../domain/score-midi.js'),
      import('../../domain/score-feature.js'),
      import('../../domain/score-expression.js'),
      import('../../domain/notation.js'),
      import('../../domain/practice-scoring.js'),
      import('../../domain/practice-mistakes.js'),
      import('../../domain/score-cursor.js'),
      import('../../domain/score-gestures.js'),
      import('../../domain/performance-timeline.js'),
      import('../../domain/score-repeats.js'),
    ]).then(([scoreImport, scoreSvgPost, scoreMidi, feature, scoreExpression, notationMod, scoringMod, mistakesMod, cursorMod, gesturesMod, perfTimelineMod, repeatsMod]) => {
      scoreFeature = feature;
      ({ AN_SMUFL_NOTES, SCORE_STEP, anMxlPreflight: importMxlPreflight, anParse, anReadXml: importReadXml, anXmlTidy, defaultInflatedSize, scoreXmlEndings, scoreXmlEngraving, scoreXmlLayout, scoreXmlNotes } = scoreImport);
      ({ isScoreOsmdSheet, scoreFixFingerings, scoreFixPedalsDefault, rememberScorePedalLayout, scoreNightSweep, scoreRingFit, scoreShiftY, scoreStyleHeader, scoreVendorField, scoreVendorList } = scoreSvgPost);
      ({ anAssignHands, scoreBeams, scoreMidiToXml } = scoreMidi);
      ({ buildExpressiveTempos, buildScoreExpression } = scoreExpression);
      ({ scorePatchOsmd, computeFitWidthLayout, notationReloadMessage } = notationMod);
      ({ gradePracticeSustain, practiceAccuracy: pracAcc, practicePercent, practiceSustainReference } = scoringMod);
      ({ classifyUnmatchedKeyPress, extractSustainMistakes, groupPracticeMistakes, practicePassageBounds } = mistakesMod);
      ({ createCursorCurves, cursorCurveAt } = cursorMod);
      ({ bindScoreGestures } = gesturesMod);
      ({ performanceTimeline, performanceAt, performanceOf, performanceMarkers, performanceWindow } = perfTimelineMod);
      ({ repeatRanges, scoreXmlRepeatBars } = repeatsMod);
      ready = true;
    }).catch((error: unknown) => { loading = null; throw error; });
  }
  return loading;
}
