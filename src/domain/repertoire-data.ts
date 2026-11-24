import { CHORD_TEMPLATES, PROGRESSION_TEMPLATES } from './theory.js';
import type { SrPiece, SrToken } from './score-types.js';

export const LDUR: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, dh: 3, dq: 1.5, de: 0.75 };
export function LP(s: string) { return s.trim().split(/\s+/).filter((x: string) => x !== '|').map((tok: string): SrToken => { const m = tok.match(/^(.+?)(d?[whqest])$/); if (!m)
    throw new Error('Étude: bad staff token ' + tok); const d = LDUR[m[2]]; const p = m[1].split('+'); return [p[0] === 'R' ? 'R' : (p.length > 1 ? p : p[0]), d]; }); }

export const LACC_CH = [{ bass: 48, right: [60, 64, 67], fifth: 55 }, { bass: 45, right: [60, 64, 69], fifth: 52 }, { bass: 41, right: [60, 65, 69], fifth: 48 }, { bass: 43, right: [59, 62, 67], fifth: 50 }];
export const PIECES: SrPiece[] = [
    { id: 'w5rh', t: { en: 'Five-finger warm-up (right hand)', ro: 'Încălzire pe cinci note (dreapta)' }, comp: '', level: 1, keyN: 0, ts: [4, 4], bpm: 80,
        rh: [['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['E4', 1], ['G4', 1], ['E4', 1], ['C4', 4]],
        lh: [['C3', 4], ['G2', 4], ['C3', 2], ['G2', 2], ['C3', 4]] },
    { id: 'w5lh', t: { en: 'Five-finger warm-up (left hand)', ro: 'Încălzire pe cinci note (stânga)' }, comp: '', level: 1, keyN: 0, ts: [4, 4], bpm: 80,
        rh: [['C4', 4], ['G3', 4], ['C4', 2], ['G3', 2], ['C4', 4]],
        lh: [['C3', 1], ['D3', 1], ['E3', 1], ['F3', 1], ['G3', 1], ['F3', 1], ['E3', 1], ['D3', 1], ['C3', 1], ['E3', 1], ['G3', 1], ['E3', 1], ['C3', 4]] },
    { id: 'clair', t: { en: 'Au clair de la lune', ro: 'Au clair de la lune' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 84,
        rh: [['C4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 2], ['D4', 2], ['C4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 4]],
        lh: [['C3', 4], ['C3', 2], ['G2', 2], ['C3', 2], ['G2', 2], ['C3', 4]] },
    { id: 'mary', t: { en: 'Mary Had a Little Lamb', ro: 'Mary avea un mielușel' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 92,
        rh: [['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2], ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2],
            ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 1], ['C4', 4]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['G2', 2], ['D3', 2], ['C3', 2], ['G3', 2],
            ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['G2', 2], ['G2', 2], ['C3', 4]] },
    { id: 'twinkle', t: { en: 'Twinkle, Twinkle, Little Star', ro: 'Sclipește, steluță (Twinkle)' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 88,
        rh: [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
        lh: [['C3', 2], ['E3', 2], ['F3', 2], ['C3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['C3', 2]] },
    // The tune twice (two verses); the second time the left hand plays open fifths.
    { id: 'hotcross', t: { en: 'Hot Cross Buns', ro: 'Chifle cu cruce (Hot Cross Buns)' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 84,
        rh: [['E4', 1], ['D4', 1], ['C4', 2], ['E4', 1], ['D4', 1], ['C4', 2], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['D4', 0.5], ['D4', 0.5], ['D4', 0.5], ['E4', 1], ['D4', 1], ['C4', 2],
            ['E4', 1], ['D4', 1], ['C4', 2], ['E4', 1], ['D4', 1], ['C4', 2], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['C4', 0.5], ['D4', 0.5], ['D4', 0.5], ['D4', 0.5], ['D4', 0.5], ['E4', 1], ['D4', 1], ['C4', 2]],
        lh: [['C3', 4], ['C3', 4], ['C3', 2], ['G2', 2], ['C3', 4],
            [['C3', 'G3'], 4], [['C3', 'G3'], 4], [['C3', 'G3'], 2], [['G2', 'D3'], 2], [['C3', 'G3'], 4]] },
    { id: 'lightly', t: { en: 'Lightly Row', ro: 'Vâslim ușor (Lightly Row)' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 96,
        rh: [['G4', 1], ['E4', 1], ['E4', 2], ['F4', 1], ['D4', 1], ['D4', 2], ['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['G4', 2],
            ['G4', 1], ['E4', 1], ['E4', 2], ['F4', 1], ['D4', 1], ['D4', 2], ['C4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['C4', 4],
            ['D4', 1], ['D4', 1], ['D4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['F4', 2], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 2],
            ['G4', 1], ['E4', 1], ['E4', 2], ['F4', 1], ['D4', 1], ['D4', 2], ['C4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['C4', 4]],
        lh: [['C3', 4], ['G2', 4], ['C3', 4], ['C3', 2], ['G2', 2], ['C3', 4], ['G2', 4], ['C3', 2], ['G2', 2], [['C3', 'G3'], 4],
            ['G2', 4], ['G2', 4], ['C3', 4], ['C3', 2], ['G2', 2], ['C3', 4], ['G2', 4], ['C3', 2], ['G2', 2], [['C3', 'G3'], 4]] },
    { id: 'rhody', t: { en: 'Go Tell Aunt Rhody', ro: 'Spune-i mătușii Rhody (Go Tell Aunt Rhody)' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 92,
        rh: [['E4', 2], ['E4', 1], ['D4', 1], ['C4', 2], ['C4', 2], ['D4', 2], ['D4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 2],
            ['G4', 2], ['G4', 1], ['F4', 1], ['E4', 2], ['E4', 2], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 4]],
        lh: [['C3', 4], [['C3', 'G3'], 4], ['G2', 4], ['G2', 2], ['C3', 2], ['C3', 4], [['C3', 'G3'], 4], ['G2', 4], [['C3', 'G3'], 4]] },
    { id: 'frere', t: { en: 'Frère Jacques', ro: 'Frère Jacques (Frate Ioane)' }, comp: 'trad.', level: 2, keyN: 0, ts: [4, 4], bpm: 96,
        rh: [['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['E4', 1], ['F4', 1], ['G4', 2],
            ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1],
            ['C4', 1], ['G3', 1], ['C4', 2], ['C4', 1], ['G3', 1], ['C4', 2]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2],
            ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G2', 2], ['C3', 4]] },
    { id: 'ode', t: { en: 'Ode to Joy', ro: 'Odă bucuriei' }, comp: 'Beethoven', level: 2, keyN: 0, ts: [4, 4], bpm: 100,
        rh: [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2],
            ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G2', 2],
            ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['G2', 2], ['G2', 2], ['C3', 2]] },
    { id: 'saints', t: { en: 'When the Saints Go Marching In', ro: 'Când sfinții mărșăluiesc' }, comp: 'trad.', level: 2, keyN: 0, ts: [4, 4], bpm: 104,
        rh: [['C4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 4], ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 4],
            ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['E4', 2], ['C4', 2], ['E4', 2], ['D4', 2], ['C4', 4]],
        lh: [['C3', 2], ['E3', 2], ['G3', 2], ['E3', 2], ['C3', 2], ['E3', 2], ['G3', 2], ['E3', 2],
            ['C3', 2], ['E3', 2], ['C3', 2], ['A2', 2], ['G2', 2], ['B2', 2], ['C3', 4]] },
    { id: 'jingle', t: { en: 'Jingle Bells (chorus)', ro: 'Clopoței (Jingle Bells)' }, comp: 'Pierpont', level: 2, keyN: 0, ts: [4, 4], bpm: 104,
        rh: [['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
            ['F4', 1], ['F4', 1], ['F4', 1.5], ['F4', 0.5], ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5], ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 2], ['G4', 2]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['C3', 2], ['C3', 2], ['G3', 2],
            ['F3', 2], ['F3', 2], ['C3', 2], ['C3', 2], ['G3', 2], ['G3', 2], ['G3', 2], ['G3', 2]] },
    // The verse only, in even quarters; the chorus is left out.
    { id: 'susanna', t: { en: 'Oh! Susanna (verse)', ro: 'Oh! Susanna (strofa)' }, comp: 'Foster', level: 2, keyN: 0, ts: [4, 4], bpm: 112, pickup: 2,
        rh: [['C4', 1], ['D4', 1], ['E4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['G4', 1], ['E4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 2], ['C4', 1], ['D4', 1],
            ['E4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['G4', 1], ['E4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 4]],
        lh: [['R', 2], ['C3', 1], ['G3', 1], ['E3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['E3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['E3', 1], ['G3', 1], ['G2', 1], ['D3', 1], ['B2', 1], ['D3', 1],
            ['C3', 1], ['G3', 1], ['E3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['E3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['G2', 1], ['D3', 1], [['C3', 'G3'], 4]] },
    // The verse only (the tune of "Love Me Tender"), twice; the second time ends with the seventh in the left hand.
    { id: 'auralee', t: { en: 'Aura Lee (verse)', ro: 'Aura Lee (strofa)' }, comp: 'Poulton', level: 2, keyN: 1, ts: [4, 4], bpm: 76,
        rh: [['D4', 1], ['G4', 1], ['F#4', 1], ['G4', 1], ['A4', 1], ['E4', 1], ['A4', 2], ['G4', 1], ['F#4', 1], ['E4', 1], ['F#4', 1], ['G4', 4],
            ['D4', 1], ['G4', 1], ['F#4', 1], ['G4', 1], ['A4', 1], ['E4', 1], ['A4', 2], ['G4', 1], ['F#4', 1], ['E4', 1], ['F#4', 1], ['G4', 4]],
        lh: [['G2', 1], ['D3', 1], ['B2', 1], ['D3', 1], ['A2', 1], ['E3', 1], ['G3', 1], ['E3', 1], ['D3', 1], ['A3', 1], ['F#3', 1], ['A3', 1], ['G2', 1], ['D3', 1], ['B2', 1], ['D3', 1],
            ['G2', 1], ['D3', 1], ['B2', 1], ['D3', 1], ['A2', 1], ['E3', 1], ['G3', 1], ['E3', 1], ['D3', 1], ['A3', 1], ['C4', 1], ['A3', 1], ['G2', 1], ['D3', 1], ['G3', 2]] },
    // The first eight bars, with the dotted rhythms of bars 3 and 7 in even quarters.
    { id: 'brahms', t: { en: 'Lullaby, Op. 49 No. 4 (opening)', ro: 'Cântec de leagăn, op. 49 nr. 4 (început)' }, comp: 'Brahms', level: 2, keyN: -1, ts: [3, 4], bpm: 72, pickup: 1,
        rh: [['A4', 0.5], ['A4', 0.5], ['C5', 2], ['A4', 0.5], ['A4', 0.5], ['C5', 2], ['A4', 0.5], ['C5', 0.5], ['F5', 1], ['E5', 1], ['D5', 1], ['D5', 1], ['C5', 1], ['G4', 0.5], ['A4', 0.5],
            ['Bb4', 2], ['G4', 0.5], ['A4', 0.5], ['Bb4', 2], ['G4', 0.5], ['Bb4', 0.5], ['D5', 1], ['C5', 1], ['E5', 1], ['F5', 3]],
        lh: [['R', 1], ['F2', 1], ['C3', 1], ['A3', 1], ['F2', 1], ['C3', 1], ['A3', 1], ['Bb2', 1], ['D3', 1], ['F3', 1], ['F2', 1], ['C3', 1], ['A3', 1],
            ['C3', 1], ['G3', 1], ['Bb3', 1], ['C3', 1], ['E3', 1], ['G3', 1], ['C3', 1], ['G3', 1], ['Bb3', 1], ['F2', 1], [['C3', 'A3'], 2]] },
    { id: 'london', t: { en: 'London Bridge', ro: 'Podul Londrei (London Bridge)' }, comp: 'trad.', level: 3, keyN: 0, ts: [4, 4], bpm: 96,
        rh: [['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['D4', 1], ['E4', 1], ['F4', 2], ['E4', 1], ['F4', 1], ['G4', 2],
            ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['D4', 2], ['G4', 2], ['E4', 1], ['C4', 3]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['G2', 2], ['D3', 2], ['C3', 2], ['G3', 2],
            ['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['G2', 2], ['G2', 2], ['C3', 4]] },
    { id: 'minuet', t: { en: 'Minuet in G (Petzold)', ro: 'Menuet în Sol (Petzold)' }, comp: 'Petzold', level: 3, keyN: 1, ts: [3, 4], bpm: 104,
        rh: [['D5', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 1], ['G4', 1], ['G4', 1], ['E5', 1], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 1], ['G4', 1], ['G4', 1],
            ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['G4', 0.5], ['B4', 1], ['A4', 2]],
        lh: [[['G3', 'B3'], 2], ['A3', 1], ['B3', 3], ['C4', 3], ['B3', 3],
            ['A3', 3], ['G3', 3], ['D4', 1], ['B3', 1], ['G3', 1], ['D3', 3]] },
    { id: 'elise', t: { en: 'Für Elise (opening)', ro: 'Für Elise (început)' }, comp: 'Beethoven', level: 3, keyN: 0, minor: true, ts: [3, 4], bpm: 88, pickup: 1,
        rh: [['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5],
            ['A4', 1], ['R', 0.5], ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1], ['R', 0.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5], ['C5', 1], ['R', 0.5], ['E4', 0.5], ['E5', 0.5], ['D#5', 0.5],
            ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 2], ['R', 1]],
        lh: [['R', 1], ['R', 3], ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], ['R', 1.5], ['E2', 0.5], ['E3', 0.5], ['G#3', 0.5], ['R', 1.5],
            ['A2', 0.5], ['E3', 0.5], ['A3', 0.5], ['R', 1.5], ['R', 3], ['A2', 0.5], ['E3', 0.5], ['A3', 2]] },
    { id: 'greensleeves', t: { en: 'Greensleeves', ro: 'Greensleeves' }, comp: 'trad.', level: 3, keyN: 0, minor: true, ts: [3, 4], bpm: 88, pickup: 1,
        rh: [['A4', 1], ['C5', 2], ['D5', 1], ['E5', 1.5], ['F5', 0.5], ['E5', 1], ['D5', 2], ['B4', 1], ['G4', 1.5], ['A4', 0.5], ['B4', 1],
            ['C5', 2], ['A4', 1], ['A4', 1.5], ['G#4', 0.5], ['A4', 1], ['B4', 2], ['G#4', 1], ['E4', 3]],
        lh: [['R', 1], ['A2', 3], ['C3', 3], ['G2', 3], ['E2', 3],
            ['A2', 3], ['F2', 3], ['E2', 3], ['A2', 3]] },
    { id: 'grace', t: { en: 'Amazing Grace', ro: 'Amazing Grace' }, comp: 'trad.', level: 3, keyN: 0, ts: [3, 4], bpm: 80, pickup: 1,
        rh: [['G3', 1], ['C4', 2], ['E4', 0.5], ['C4', 0.5], ['E4', 2], ['D4', 1], ['C4', 2], ['A3', 1], ['G3', 2], ['G3', 1],
            ['C4', 2], ['E4', 0.5], ['C4', 0.5], ['E4', 2], ['D4', 1], ['G4', 3]],
        lh: [['R', 1], ['C3', 3], ['C3', 2], ['G2', 1], ['F2', 2], ['C3', 1], ['G2', 3], ['C3', 3], ['G2', 3], ['G2', 3]] }, // bars 6–7 (G) complete the left hand
    // Over the ground bass: the theme in halves, then in quarters, then the line that moves twice as fast; a D chord ends it.
    { id: 'canon', t: { en: 'Canon in D (main theme)', ro: 'Canon în Re (tema principală)' }, comp: 'Pachelbel', level: 3, keyN: 2, ts: [4, 4], bpm: 72,
        rh: [['F#5', 2], ['E5', 2], ['D5', 2], ['C#5', 2], ['B4', 2], ['A4', 2], ['B4', 2], ['C#5', 2],
            ['D5', 2], ['C#5', 2], ['B4', 2], ['A4', 2], ['G4', 2], ['F#4', 2], ['G4', 2], ['E4', 2],
            ['D5', 1], ['F#5', 1], ['A5', 1], ['G5', 1], ['F#5', 1], ['D5', 1], ['F#5', 1], ['E5', 1], ['D5', 1], ['B4', 1], ['D5', 1], ['A4', 1], ['G4', 1], ['B4', 1], ['A4', 1], ['G4', 1],
            [['F#4', 'A4', 'D5'], 4]],
        lh: [['D3', 2], ['A2', 2], ['B2', 2], ['F#2', 2], ['G2', 2], ['D2', 2], ['G2', 2], ['A2', 2],
            ['D3', 1], ['A3', 1], ['A2', 1], ['E3', 1], ['B2', 1], ['F#3', 1], ['F#2', 1], ['C#3', 1], ['G2', 1], ['D3', 1], ['D2', 1], ['A2', 1], ['G2', 1], ['D3', 1], ['A2', 1], ['E3', 1],
            ['D3', 1], ['A3', 1], ['A2', 1], ['E3', 1], ['B2', 1], ['F#3', 1], ['F#2', 1], ['C#3', 1], ['G2', 1], ['D3', 1], ['D2', 1], ['A2', 1], ['G2', 1], ['D3', 1], ['A2', 1], ['E3', 1],
            [['D2', 'D3'], 4]] },
    // Four bars of the rocking accompaniment (G major 7, D major 7), then the first phrase of the tune.
    { id: 'gymno', t: { en: 'Gymnopédie No. 1 (opening)', ro: 'Gymnopédie nr. 1 (început)' }, comp: 'Satie', level: 3, keyN: 2, ts: [3, 4], bpm: 72,
        rh: [['R', 3], ['R', 3], ['R', 3], ['R', 3], ['R', 1], ['F#5', 1], ['A5', 1], ['G5', 1], ['F#5', 1], ['C#5', 1], ['B4', 1], ['C#5', 1], ['D5', 1], ['A4', 3]],
        lh: [['G2', 1], [['B3', 'D4', 'F#4'], 2], ['D2', 1], [['A3', 'C#4', 'F#4'], 2], ['G2', 1], [['B3', 'D4', 'F#4'], 2], ['D2', 1], [['A3', 'C#4', 'F#4'], 2],
            ['G2', 1], [['B3', 'D4', 'F#4'], 2], ['D2', 1], [['A3', 'C#4', 'F#4'], 2], ['G2', 1], [['B3', 'D4', 'F#4'], 2], ['D2', 1], [['A3', 'C#4', 'F#4'], 2]] },
    // Each half bar: the left hand holds the bass note, the right hand plays the seven sixteenths above it.
    { id: 'prelude', t: { en: 'Prelude in C, BWV 846 (opening)', ro: 'Preludiu în Do, BWV 846 (început)' }, comp: 'J. S. Bach', level: 3, keyN: 0, ts: [4, 4], bpm: 60,
        rh: [['R', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['R', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25],
            ['R', 0.25], ['D4', 0.25], ['A4', 0.25], ['D5', 0.25], ['F5', 0.25], ['A4', 0.25], ['D5', 0.25], ['F5', 0.25], ['R', 0.25], ['D4', 0.25], ['A4', 0.25], ['D5', 0.25], ['F5', 0.25], ['A4', 0.25], ['D5', 0.25], ['F5', 0.25],
            ['R', 0.25], ['D4', 0.25], ['G4', 0.25], ['D5', 0.25], ['F5', 0.25], ['G4', 0.25], ['D5', 0.25], ['F5', 0.25], ['R', 0.25], ['D4', 0.25], ['G4', 0.25], ['D5', 0.25], ['F5', 0.25], ['G4', 0.25], ['D5', 0.25], ['F5', 0.25],
            ['R', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['R', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25], ['G4', 0.25], ['C5', 0.25], ['E5', 0.25],
            ['R', 0.25], ['E4', 0.25], ['A4', 0.25], ['E5', 0.25], ['A5', 0.25], ['A4', 0.25], ['E5', 0.25], ['A5', 0.25], ['R', 0.25], ['E4', 0.25], ['A4', 0.25], ['E5', 0.25], ['A5', 0.25], ['A4', 0.25], ['E5', 0.25], ['A5', 0.25],
            ['R', 0.25], ['D4', 0.25], ['F#4', 0.25], ['A4', 0.25], ['D5', 0.25], ['F#4', 0.25], ['A4', 0.25], ['D5', 0.25], ['R', 0.25], ['D4', 0.25], ['F#4', 0.25], ['A4', 0.25], ['D5', 0.25], ['F#4', 0.25], ['A4', 0.25], ['D5', 0.25],
            ['R', 0.25], ['D4', 0.25], ['G4', 0.25], ['D5', 0.25], ['G5', 0.25], ['G4', 0.25], ['D5', 0.25], ['G5', 0.25], ['R', 0.25], ['D4', 0.25], ['G4', 0.25], ['D5', 0.25], ['G5', 0.25], ['G4', 0.25], ['D5', 0.25], ['G5', 0.25],
            ['R', 0.25], ['C4', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['R', 0.25], ['C4', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25], ['E4', 0.25], ['G4', 0.25], ['C5', 0.25]],
        lh: [['C4', 2], ['C4', 2], ['C4', 2], ['C4', 2], ['B3', 2], ['B3', 2], ['C4', 2], ['C4', 2],
            ['C4', 2], ['C4', 2], ['C4', 2], ['C4', 2], ['B3', 2], ['B3', 2], ['B3', 2], ['B3', 2]] },
];

export type IntervalDefinition = { semi: number; name: string; short: string };
export type AccompanimentChord = { bass: number; fifth: number; right: number[] };
export type AccompanimentEvent = { beat: number; midi: number; durB: number; hand: 'L' | 'R' };
export type AccompanimentPattern = {
  beats: number;
  en: string;
  ro: string;
  es?: string;
  fr?: string;
  de?: string;
  it?: string;
  'pt-BR'?: string;
  gen(events: AccompanimentEvent[], beat: number, chord: AccompanimentChord): void;
};
export const INTERVALS: IntervalDefinition[] = [
    { semi: 1, name: 'Minor 2nd', short: 'm2' }, { semi: 2, name: 'Major 2nd', short: 'M2' }, { semi: 3, name: 'Minor 3rd', short: 'm3' },
    { semi: 4, name: 'Major 3rd', short: 'M3' }, { semi: 5, name: 'Perfect 4th', short: 'P4' }, { semi: 6, name: 'Tritone', short: 'TT' },
    { semi: 7, name: 'Perfect 5th', short: 'P5' }, { semi: 8, name: 'Minor 6th', short: 'm6' }, { semi: 9, name: 'Major 6th', short: 'M6' },
    { semi: 10, name: 'Minor 7th', short: 'm7' }, { semi: 11, name: 'Major 7th', short: 'M7' }, { semi: 12, name: 'Octave', short: 'P8' },
];
export const COMPOUND: Record<number, string> = { 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave', 13: 'Minor 9th', 14: 'Major 9th', 15: 'Minor 10th', 16: 'Major 10th', 17: 'Perfect 11th', 18: 'Augmented 11th', 19: 'Perfect 12th', 20: 'Minor 13th', 21: 'Major 13th', 22: 'Minor 14th', 23: 'Major 14th', 24: 'Two octaves' };
export const RO_IV = COMPOUND;
export const SONGS: Record<number, Record<string, string[]>> = {
    1: { asc: ['Jaws (theme)', 'Isn’t She Lovely'], desc: ['Für Elise'] },
    2: { asc: ['Happy Birthday', 'Frère Jacques', 'Silent Night'], desc: ['Mary Had a Little Lamb', 'Three Blind Mice', 'Yesterday'] },
    3: { asc: ['Greensleeves', 'Smoke on the Water'], desc: ['Hey Jude', 'This Old Man', 'Star-Spangled Banner'] },
    4: { asc: ['Oh When the Saints', 'Kumbaya', 'The Blue Danube'], desc: ['Beethoven’s 5th', 'Swing Low, Sweet Chariot'] },
    5: { asc: ['Here Comes the Bride', 'Amazing Grace', 'Auld Lang Syne'], desc: ['Eine kleine Nachtmusik', 'O Come All Ye Faithful'] },
    6: { asc: ['The Simpsons', 'Maria (West Side Story)'], desc: ['(uncommon)'] },
    7: { asc: ['Twinkle Twinkle', 'Star Wars', '2001 (Zarathustra)'], desc: ['The Flintstones', 'Minuet in G'] },
    8: { asc: ['Love Story (theme)', 'Black Orpheus', 'We’ve Only Just Begun'], desc: ['Under the Bridge (intro)'] },
    9: { asc: ['My Bonnie Lies Over the Ocean', 'Dashing Through the Snow'], desc: ['The Music of the Night'] },
    10: { asc: ['Somewhere (West Side Story)', 'Star Trek (TOS)'], desc: ['(uncommon)'] },
    11: { asc: ['Don’t Know Why'], desc: ['(rare)'] },
    12: { asc: ['Over the Rainbow', 'Singin’ in the Rain'], desc: ['Willow Weep for Me'] },
};
export const CHORD_FEEL: Record<string, string> = { maj: 'bright, resolved', m: 'darker, melancholy', dim: 'tense, unstable', aug: 'dreamlike', sus2: 'open, airy', sus4: 'suspended', maj7: 'lush, jazzy', '7': 'bluesy, wants to resolve', m7: 'smooth, mellow', 'm7♭5': 'dark, cinematic', dim7: 'very tense', mMaj7: 'noir', 6: 'sweet, vintage', m6: 'wistful', '9': 'funky', maj9: 'dreamy', m9: 'soulful' };
export const INV_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion'];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11], ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const CHORDS = CHORD_TEMPLATES;
const PROGS = PROGRESSION_TEMPLATES;

export function progChordTpl(sym: string) { return CHORDS.find((c) => c.symbol === sym); }
export function dispSym(s: string) { return s === 'maj' ? '' : s; }
/* Accompaniment: extra popular progressions + rhythmic playing patterns. */
export const ACCOMP_PROGS = PROGS.concat([
    { name: 'I–V–vi–iii–IV–I (Pachelbel pop)', chords: [[0, 'maj', 'I'], [7, 'maj', 'V'], [9, 'm', 'vi'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
    { name: 'Andalusian i–♭VII–♭VI–V', chords: [[0, 'm', 'i'], [10, 'maj', '♭VII'], [8, 'maj', '♭VI'], [7, 'maj', 'V']] },
    { name: 'Jazz turnaround I–vi–ii–V', chords: [[0, 'maj7', 'I'], [9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V']] },
    { name: 'Circle of 5ths vi–ii–V–I', chords: [[9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V'], [0, 'maj7', 'I']] },
    { name: 'Ballad I–iii–IV–V', chords: [[0, 'maj', 'I'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [7, 'maj', 'V']] },
]);
export const ACCOMP_PATTERNS: Record<string, AccompanimentPattern> = {
    block: { beats: 4, en: 'Block chords', ro: 'Acorduri bloc', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); c.right.forEach((m) => ev.push({ beat: b, midi: m, durB: 4, hand: 'R' })); } },
    arp: { beats: 4, en: 'Arpeggio (broken)', ro: 'Arpegiu (frânt)', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const up = c.right, seq = up.concat(up.slice(0, -1).reverse()); for (let i = 0; i < 8; i++)
            ev.push({ beat: b + i * 0.5, midi: seq[i % seq.length], durB: 0.55, hand: 'R' }); } },
    alberti: { beats: 4, en: 'Alberti bass', ro: 'Bas Alberti', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const r = c.right, fig = [r[0], r[r.length - 1], r[1] || r[0], r[r.length - 1]]; for (let i = 0; i < 8; i++)
            ev.push({ beat: b + i * 0.5, midi: fig[i % 4], durB: 0.55, hand: 'R' }); } },
    waltz: { beats: 3, en: 'Waltz (3/4)', ro: 'Vals (3/4)', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 1, hand: 'L' }); [1, 2].forEach((k) => c.right.forEach((m) => ev.push({ beat: b + k, midi: m, durB: 1, hand: 'R' }))); } },
    ballad: { beats: 4, en: 'Pop ballad', ro: 'Baladă pop', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const r = c.right; for (let i = 0; i < 4; i++)
            ev.push({ beat: b + i, midi: r[i % r.length], durB: 4 - i, hand: 'R' }); } },
    boomchick: { beats: 4, en: 'Boom-chick', ro: 'Boom-chick', gen(ev, b, c) { ev.push({ beat: b, midi: c.bass, durB: 1, hand: 'L' }); ev.push({ beat: b + 2, midi: c.fifth, durB: 1, hand: 'L' }); [1, 3].forEach((k) => c.right.forEach((m) => ev.push({ beat: b + k, midi: m, durB: 0.85, hand: 'R' }))); } },
};
export const ACCOMP_I18N = {
    block: { es: 'Acordes en bloque', fr: 'Accords plaqués', de: 'Blockakkorde', it: 'Accordi a blocchi', 'pt-BR': 'Acordes em bloco' },
    arp: { es: 'Arpegio (quebrado)', fr: 'Arpège (brisé)', de: 'Arpeggio (gebrochen)', it: 'Arpeggio (spezzato)', 'pt-BR': 'Arpejo (quebrado)' },
    alberti: { es: 'Bajo Alberti', fr: 'Basse d’Alberti', de: 'Alberti-Bass', it: 'Basso albertino', 'pt-BR': 'Baixo de Alberti' },
    waltz: { es: 'Vals (3/4)', fr: 'Valse (3/4)', de: 'Walzer (3/4)', it: 'Valzer (3/4)', 'pt-BR': 'Valsa (3/4)' },
    ballad: { es: 'Balada pop', fr: 'Ballade pop', de: 'Pop-Ballade', it: 'Ballata pop', 'pt-BR': 'Balada pop' },
    boomchick: { es: 'Boom-chick', fr: 'Boom-chick', de: 'Boom-chick', it: 'Boom-chick', 'pt-BR': 'Boom-chick' },
};
for (const [k, obj] of Object.entries(ACCOMP_I18N)) {
    if (ACCOMP_PATTERNS[k])
        Object.assign(ACCOMP_PATTERNS[k], obj);
}
export const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
