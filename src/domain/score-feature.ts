export * as harmony from './score-harmony.js';
export { scoreOctaveMark, scoreStructuralMarks } from './score-svg-markings.js';
export { renderScoreNoteParentheses, scoreDetectPartHands } from './score-xml-markings.js';
export { recognizeScoreMarkings } from './score-markings.js';

import { SCORE_MARKING_TERMS } from './score-markings.js';

export const scoreTerms = SCORE_MARKING_TERMS.map(({ term, forms }) => ({ k: term, forms }));
