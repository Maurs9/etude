/*
 * The reading-drill curriculum (Read → Drills): units of levels for note naming and playing, key to staff, intervals,
 * chords, key signatures, rhythm, C clefs and generated sight-reading. Pure data built once at import, so the shell can
 * point Learn at the next drill without loading the Read feature.
 */
export type ReadClefStaff = 'treble' | 'bass' | 'alto' | 'tenor';
export type ReadClefDraw = ReadClefStaff | 'grand';
export type ReadClef = ReadClefDraw | 'mix';
export type ReadDrillType = 'name' | 'play' | 'k2s' | 'ks' | 'iv' | 'ch' | 'rh' | 'sr';
export const READ_DRILL_TYPES: readonly ReadDrillType[] = ['name', 'play', 'k2s', 'ks', 'iv', 'ch', 'rh', 'sr'];
export const READ_CLEFS: readonly ReadClef[] = ['treble', 'bass', 'alto', 'tenor', 'grand', 'mix'];
export function isReadDrillType(v: string): v is ReadDrillType { return READ_DRILL_TYPES.some((x) => x === v); }
export function isReadClef(v: string): v is ReadClef { return READ_CLEFS.some((x) => x === v); }
export type ReadDrillChordQuality = 'maj' | 'min' | 'dim' | 'aug';
/* ---- curriculum ---- */
export interface ReadDrillLevelSpec { ty: ReadDrillType; clef?: ReadClef; set?: string[]; tag?: string; lo?: string; hi?: string; acc?: number; keys?: number | number[]; keyN?: number; kmax?: number; ivs?: number[]; harm?: number; q?: ReadDrillChordQuality[]; inv?: number; units?: string[]; bpm?: number; durs?: number[]; }
export interface ReadDrillLevel extends ReadDrillLevelSpec { u: string; n: number; id: string; custom?: boolean; }
export interface ReadDrillUnit { u: string; icon: string; lv: ReadDrillLevel[]; }
export const RD_UNITS: ReadDrillUnit[] = [], RD_LV: { [levelId: string]: ReadDrillLevel; } = {};
export function rdU(u: string, icon: string, list: ReadDrillLevelSpec[]) { const lv = list.map((o, i) => Object.assign({ u, n: i + 1, id: u + (i + 1) }, o)); RD_UNITS.push({ u, icon, lv }); lv.forEach((L) => { RD_LV[L.id] = L; }); }
export const rdS = (a: string) => a.split(' ');
export const RD_ALLIV = [2, 3, 4, 5, 6, 7, 8];
rdU('tr', '𝄞', [
    { ty: 'name', clef: 'treble', set: rdS('C4 G4 C5'), tag: 'land' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G4' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5' },
    { ty: 'name', clef: 'treble', set: rdS('E4 G4 B4 D5 F5'), tag: 'lines' },
    { ty: 'name', clef: 'treble', set: rdS('F4 A4 C5 E5'), tag: 'spaces' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'name', clef: 'treble', lo: 'G5', hi: 'D6', tag: 'ledup' },
    { ty: 'name', clef: 'treble', lo: 'A3', hi: 'D4', tag: 'leddn' },
    { ty: 'play', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'k2s', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'name', clef: 'treble', lo: 'A3', hi: 'C6', tag: 'full' }
]);
rdU('ba', '𝄢', [
    { ty: 'name', clef: 'bass', set: rdS('G2 C3 F3 C4'), tag: 'land' },
    { ty: 'name', clef: 'bass', lo: 'C3', hi: 'G3' },
    { ty: 'name', clef: 'bass', lo: 'C3', hi: 'C4' },
    { ty: 'name', clef: 'bass', set: rdS('G2 B2 D3 F3 A3'), tag: 'lines' },
    { ty: 'name', clef: 'bass', set: rdS('A2 C3 E3 G3'), tag: 'spaces' },
    { ty: 'name', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'name', clef: 'bass', lo: 'C2', hi: 'F2', tag: 'leddn' },
    { ty: 'name', clef: 'bass', lo: 'B3', hi: 'G4', tag: 'ledup' },
    { ty: 'play', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'k2s', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'name', clef: 'bass', lo: 'C2', hi: 'E4', tag: 'full' }
]);
rdU('gr', '𝄞𝄢', [
    { ty: 'name', clef: 'grand', lo: 'C3', hi: 'C5' },
    { ty: 'name', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5' },
    { ty: 'play', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'k2s', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'name', clef: 'grand', lo: 'C2', hi: 'C6', tag: 'full' }
]);
rdU('ac', '♯', [
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5', acc: 1 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5', acc: -1 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 2 },
    { ty: 'name', clef: 'bass', lo: 'F2', hi: 'C4', acc: 2 },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5', acc: 2 }
]);
rdU('ks', '♭', [
    { ty: 'ks', clef: 'treble', kmax: 2 },
    { ty: 'ks', clef: 'treble', kmax: 4 },
    { ty: 'ks', clef: 'grand', kmax: 7 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', keys: 3 },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5', keys: 3 }
]);
rdU('iv', '⇕', [
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: [2, 3, 4, 5] },
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: RD_ALLIV },
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: RD_ALLIV, harm: 1 },
    { ty: 'iv', clef: 'bass', lo: 'E2', hi: 'C4', ivs: RD_ALLIV, harm: 2 }
]);
rdU('ch', '♫', [
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min'] },
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min', 'dim', 'aug'] },
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min'], inv: 1 },
    { ty: 'ch', clef: 'bass', lo: 'C3', hi: 'C4', q: ['maj', 'min', 'dim', 'aug'], inv: 1 }
]);
rdU('rh', '♩', [
    { ty: 'rh', units: ['4', '2', '1'], bpm: 80 },
    { ty: 'rh', units: ['4', '2', '8'], bpm: 80 },
    { ty: 'rh', units: ['4', '2', '8', 'r4'], bpm: 84 },
    { ty: 'rh', units: ['4', '8', 'd', 'r4'], bpm: 84 },
    { ty: 'rh', units: ['4', '8', '16', 'd'], bpm: 72 }
]);
rdU('cc', '𝄡', [
    { ty: 'name', clef: 'alto', lo: 'D3', hi: 'B4' },
    { ty: 'name', clef: 'tenor', lo: 'A2', hi: 'G4' },
    { ty: 'name', clef: 'mix', tag: 'mix' }
]);
rdU('sr', '👁', [
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2], keys: [0], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C5', durs: [1, 2, 0.5], keys: [0], bpm: 76 },
    { ty: 'sr', clef: 'bass', lo: 'C3', hi: 'C4', durs: [1, 2], keys: [0], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'E5', durs: [1, 2, 0.5, 1.5], keys: [-1, 0, 1], bpm: 80 },
    { ty: 'sr', clef: 'grand', lo: 'C4', hi: 'C5', durs: [1, 2, 0.5], keys: [-1, 0, 1], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C6', durs: [1, 2], keys: [-7, 7], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'E6', durs: [1, 2], keys: [-7, 7], bpm: 68 },
    { ty: 'sr', clef: 'grand', lo: 'C3', hi: 'E6', durs: [1, 2], keys: [-7, 7], bpm: 64 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C6', durs: [1, 2], keys: [0], bpm: 64 },
    // Rhythm levels (P4): five-finger C position, new note values one level at a time.
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5], keys: [0], bpm: 72, tag: 'eighths' },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5, 1.5], keys: [0], bpm: 72, tag: 'dotted' },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5, 1.5], keys: [0], bpm: 66, tag: 'sync' }
]);
export const RD_ALL = RD_UNITS.flatMap((u) => u.lv);
