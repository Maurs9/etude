export * as harmony from './score-harmony.js';
export { renderScoreNoteParentheses, scoreDetectPartHands } from './score-xml-markings.js';
export { SC_ARTS, SC_DYN, scoreSymbols, scoreSymText, scoreTermParts } from './score-symbols.js';

import { SCORE_MARKING_TERMS } from './score-markings.js';

export const scoreTerms = SCORE_MARKING_TERMS.map(({ term, forms }) => ({ k: term, forms }));
