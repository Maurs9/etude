import { CHORD_TEMPLATES, PROGRESSION_TEMPLATES, SCALE_DEFINITIONS, type ChordTemplate, type ProgressionTemplate } from '../domain/theory.js';
import { INTERVALS } from '../domain/repertoire-data.js';

/*
 * The trainer's item model: every interval, chord, scale and progression the spaced-repetition sessions teach, with the
 * order new items are introduced in. Pure data built once from the theory tables; Today, the SRS wrappers and the lazy
 * Practice feature all read the same records.
 */
export function isCatKey(cat: string): cat is keyof typeof CATS { return cat in CATS; }
export const INTRO_IV = [7, 5, 4, 3, 12, 2, 9, 8, 11, 10, 1, 6];
export const INTRO_CH = ['maj', 'm', 'dim', 'sus4', 'sus2', 'aug', 'maj7', '7', 'm7', '6', 'm6', 'm7♭5', 'dim7', 'mMaj7', 'add9', '9', 'maj9', 'm9', '7♯5', '7♭5', 'maj7♯11', '7♭9', '7♯9', '11', '13'];
export const INTRO_SC = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic', 'Dorian', 'Mixolydian', 'Blues', 'Lydian', 'Phrygian', 'Harmonic minor', 'Melodic minor', 'Locrian', 'Harmonic major', 'Whole tone', 'Phrygian dominant', 'Hungarian minor', 'Diminished (W-H)', 'Diminished (H-W)', 'Chromatic'];
export const CATS = { interval: { label: 'Intervals' }, chord: { label: 'Chords' }, scale: { label: 'Scales' }, prog: { label: 'Progressions' } };
export interface TrainerItemBase { id: string; label: string; short: string; intro: number; }
export interface IntervalTrainerItem extends TrainerItemBase { cat: 'interval'; semi: number; }
export interface ChordTrainerItem extends TrainerItemBase { cat: 'chord'; ref: ChordTemplate; }
export interface ScaleTrainerItem extends TrainerItemBase { cat: 'scale'; name: string; }
export interface ProgTrainerItem extends TrainerItemBase { cat: 'prog'; ref: ProgressionTemplate; }
export type TrainerItem = IntervalTrainerItem | ChordTrainerItem | ScaleTrainerItem | ProgTrainerItem;
export const ITEMS: TrainerItem[] = [];
export const ITEM_BY_ID: Record<string, TrainerItem> = {};
INTRO_IV.forEach((semi, i) => { const iv = INTERVALS.find((x) => x.semi === semi); if (!iv)
    return; ITEMS.push({ id: 'iv:' + semi, cat: 'interval', semi, label: iv.name, short: iv.short, intro: i }); });
INTRO_CH.forEach((sym, i) => { const c = CHORD_TEMPLATES.find((x) => x.symbol === sym); if (c)
    ITEMS.push({ id: 'ch:' + sym, cat: 'chord', ref: c, label: c.name, short: sym, intro: 100 + i }); });
INTRO_SC.forEach((nm, i) => { if (SCALE_DEFINITIONS[nm])
    ITEMS.push({ id: 'sc:' + nm, cat: 'scale', name: nm, label: nm, short: nm, intro: 200 + i }); });
PROGRESSION_TEMPLATES.forEach((p, i) => { ITEMS.push({ id: 'pr:' + p.name, cat: 'prog', ref: p, label: p.name, short: p.name, intro: 300 + i }); });
ITEMS.forEach((it) => ITEM_BY_ID[it.id] = it);
