import * as locale from '../locales/index.js';
import * as content from '../locales/content.js';
import type { GlossaryEntry, LearnQuizCopy, LearnQuizSpec, LearnSummaryRow, LearnText, LearnUnit, Lesson, Localised } from '../locales/content-types.js';
import * as storage from './storage.js';
import * as theory from './theory.js';
import * as audio from './audio.js';
import type { AudioTone } from './audio.js';
import * as notationApi from './notation.js';
import * as router from './router.js';
import { byId, maybeById, inputById, selectById, buttonById, eventElement, eventClosest, queryHtml, queryAllHtml } from './dom.js';
import type {
  EtudeSurface,
  ViewApplicationState,
  ViewEventHandler,
  ViewEventName,
} from './views.js';
import type { AppLanguage, InterfaceLanguage } from '../types/architecture.js';

function runtimeErrorName(value: unknown): string {
  return value instanceof Error ? value.name : '';
}

function runtimeErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

/** The parts of Web Bluetooth the BLE-MIDI link uses (not yet in TypeScript's DOM library). */
interface BleValueEvent { readonly target: BleMidiCharacteristic }
interface BleMidiCharacteristic {
  readonly value?: DataView;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: BleValueEvent) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: BleValueEvent) => void): void;
}
interface BleGattServer {
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BleMidiCharacteristic> }>;
}
interface BleDisconnectEvent { readonly target: BleMidiDevice | null }
interface BleMidiDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: { readonly connected: boolean; connect(): Promise<BleGattServer>; disconnect(): void };
  addEventListener(type: 'gattserverdisconnected', listener: (event: BleDisconnectEvent) => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (event: BleDisconnectEvent) => void): void;
}
/** Chromium's install prompt event (not in TypeScript's DOM library). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: string }>;
}

declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options?: Record<string, unknown>): Promise<BleMidiDevice>;
      getDevices?(): Promise<BleMidiDevice[]>;
    };
    keyboard?: {
      lock?(keys?: string[]): Promise<void>;
      unlock?(): void;
      getLayoutMap?(): Promise<{ get(code: string): string | undefined }>;
    };
    standalone?: boolean;
  }
  interface WindowEventMap {
    beforeinstallprompt: InstallPromptEvent;
  }
  interface HTMLSelectElement {
    /** Set once the runtime has filled a lazily populated `<select>`. */
    _filled?: boolean;
  }
  interface HTMLButtonElement {
    /** A piano key held down with Space or Enter. */
    _kd?: boolean;
  }
}

const pianoAssets = import.meta.glob<string>('../assets/piano/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
const pianoUrls: Record<number, string> = {};
for (const [path, url] of Object.entries(pianoAssets)) pianoUrls[Number(path.match(/(\d+)\.mp3$/)?.[1])] = url;
/** Every interface language the shell offers. */
type RuntimeLanguage = InterfaceLanguage;
const RUNTIME_LANGUAGES: readonly RuntimeLanguage[] = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
function isRuntimeLanguage(value: unknown): value is RuntimeLanguage { return RUNTIME_LANGUAGES.some((l) => l === value); }
type LocaleStrings = Record<string, Record<string, string>>;
type IntervalDefinition = { semi: number; name: string; short: string };
type AccompanimentChord = { bass: number; fifth: number; right: number[] };
type AccompanimentEvent = { beat: number; midi: number; durB: number; hand: 'L' | 'R' };
type AccompanimentPattern = {
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
/**
 * Behaviour-preserving browser runtime for the typed view boundary in
 * `views.ts`. New public view contracts belong in the TypeScript entry point;
 * browser-only compatibility remains local to this module.
 */
"use strict";
const STRINGS: LocaleStrings = locale.STRINGS;
const I18N_MUSIC = locale.I18N_MUSIC;
const STEP_LABELS = locale.STEP_LABELS;
const LOCALE_TAGS: Record<string, string> = locale.LOCALE_TAGS;
const LESSONS = content.LESSONS;
const LEARN_UNITS = content.LEARN_UNITS;
const LQZ = content.LQZ;
const LSUM = content.LSUM, LSUM_I18N = content.LSUM_I18N;
const GLOSS = content.GLOSS;
const KEY = storage.PTT_KEY, isBackupPayload = storage.isBackupPayload, isRecord = storage.isRecord, legacySettings = storage.legacySettings, parsePttV3 = storage.parsePttV3, readPttV3 = storage.readPttV3, restoreSettings = storage.restoreSettings, writePttV3 = storage.writePttV3;
const CHORD_DEGREE_LABELS = theory.CHORD_DEGREE_LABELS, SCALE_DEGREE_LABELS = theory.SCALE_DEGREE_LABELS, anFnKey = theory.analysisFunction, anDiatonic = theory.anDiatonic, anIntervalName = theory.anIntervalName, anKeyRank = theory.anKeyRank, anPcWeights = theory.anPcWeights, anResolveKey = theory.anResolveKey, CHORD_TEMPLATES = theory.CHORD_TEMPLATES, chordDegreeMap = theory.chordDegreeMap, chordInversion = theory.chordInversion, chordPitches = theory.chordPitches, srKeyName = theory.circleKeyPitchClass, formatChordFormula = theory.formatChordFormula, formatScaleFormula = theory.formatScaleFormula, identifyChordDomain = theory.identifyChord, keyFifths = theory.keyFifths, keyFromFifths = theory.keyFromFifths, midiToFrequency = theory.midiToFrequency, pitchClass = theory.pitchClass, PROGRESSION_TEMPLATES = theory.PROGRESSION_TEMPLATES, rdSpellMidi = theory.readingSpelling, romanFor = theory.romanFor, SCALE_DEFINITIONS = theory.SCALE_DEFINITIONS, scorePitch = theory.scorePitchXml, spellMidi = theory.spellMidi;
const AudioEngine = audio.AudioEngine;
const createScoreRenderer = notationApi.createScoreRenderer, loadOsmd = notationApi.loadOsmd, mxlToXml = notationApi.mxlToXml, notationReloadMessage = notationApi.notationReloadMessage, scorePatchOsmd = notationApi.scorePatchOsmd;
const NAV_GROUPS = router.NAV_GROUPS, navGroup = router.navGroup, viewFromHash = router.viewFromHash, isAppView = router.isAppView;
function t(k: string, ...args: Array<string | number | null | undefined>): string { const s = STRINGS[lang] || STRINGS.en; let v = (s[k] != null ? s[k] : (STRINGS.en ? STRINGS.en[k] : null)); if (v == null)
    return k; if (!args.length)
    return v; if (args[0] != null)
    v = v.replace('%a', String(args[0])); if (args[1] != null)
    v = v.replace('%b', String(args[1])); for (let i = 0; i < args.length; i++) {
    if (args[i] != null)
        v = v.replace('%s', String(args[i]));
} return v; }
/* ============================================================================
   ÉTUDE — V3.  Reuses the verified V2 theory/audio/MIDI engine; adds a
   spaced-repetition learning core and an editorial UI.
   ============================================================================ */
/* ---------- DATA ---------- */
const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROOT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_SYS = {
    letter: { sharp: PC_SHARP, flat: PC_FLAT, root: ROOT_NAMES },
    german: { sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'], flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'], root: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'B', 'H'] },
    solfege: { sharp: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
        flat: ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'],
        root: ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'] },
};
let notation: 'letter' | 'german' | 'solfege' = 'letter';
/* ---------- THEME ---------- */
let theme: 'auto' | 'light' | 'dark' = 'auto';
const themeMQ = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;
function applyTheme() {
    const dark = theme === 'dark' || (theme === 'auto' && themeMQ && themeMQ.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    (document).querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#171412' : '#f7f3ec')); // browser/app bar follows the chosen theme
    queryAllHtml(document, '#set-theme button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === theme ? 'true' : 'false'));
}
if (themeMQ && themeMQ.addEventListener)
    themeMQ.addEventListener('change', () => { if (theme === 'auto')
        applyTheme(); });
const INTERVALS: IntervalDefinition[] = [
    { semi: 1, name: 'Minor 2nd', short: 'm2' }, { semi: 2, name: 'Major 2nd', short: 'M2' }, { semi: 3, name: 'Minor 3rd', short: 'm3' },
    { semi: 4, name: 'Major 3rd', short: 'M3' }, { semi: 5, name: 'Perfect 4th', short: 'P4' }, { semi: 6, name: 'Tritone', short: 'TT' },
    { semi: 7, name: 'Perfect 5th', short: 'P5' }, { semi: 8, name: 'Minor 6th', short: 'm6' }, { semi: 9, name: 'Major 6th', short: 'M6' },
    { semi: 10, name: 'Minor 7th', short: 'm7' }, { semi: 11, name: 'Major 7th', short: 'M7' }, { semi: 12, name: 'Octave', short: 'P8' },
];
const COMPOUND: Record<number, string> = { 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave', 13: 'Minor 9th', 14: 'Major 9th', 15: 'Minor 10th', 16: 'Major 10th', 17: 'Perfect 11th', 18: 'Augmented 11th', 19: 'Perfect 12th', 20: 'Minor 13th', 21: 'Major 13th', 22: 'Minor 14th', 23: 'Major 14th', 24: 'Two octaves' };
const RO_IV = COMPOUND;
const SONGS: Record<number, Record<string, string[]>> = {
    1: { asc: ['Jaws (theme)', 'Stormy Weather'], desc: ['Für Elise'] },
    2: { asc: ['Happy Birthday', 'Frère Jacques', 'Silent Night'], desc: ['Mary Had a Little Lamb', 'Three Blind Mice', 'Yesterday'] },
    3: { asc: ['Greensleeves', 'Smoke on the Water'], desc: ['Hey Jude', 'This Old Man', 'Star-Spangled Banner'] },
    4: { asc: ['Oh When the Saints', 'Kumbaya', 'The Blue Danube'], desc: ['Beethoven’s 5th', 'Swing Low, Sweet Chariot'] },
    5: { asc: ['Here Comes the Bride', 'Amazing Grace', 'Auld Lang Syne'], desc: ['Born Free', 'O Come All Ye Faithful'] },
    6: { asc: ['The Simpsons', 'Maria (West Side Story)'], desc: ['(uncommon)'] },
    7: { asc: ['Twinkle Twinkle', 'Star Wars', '2001 (Zarathustra)'], desc: ['The Flintstones', 'Feelings'] },
    8: { asc: ['Love Story (theme)', 'Black Orpheus', 'We’ve Only Just Begun'], desc: ['Music of the Night'] },
    9: { asc: ['My Bonnie Lies Over the Ocean', 'Dashing Through the Snow'], desc: ['Nobody Knows the Trouble I’ve Seen'] },
    10: { asc: ['Somewhere (West Side Story)', 'Star Trek (TOS)'], desc: ['(uncommon)'] },
    11: { asc: ['Take On Me (chorus)', 'Bali Ha’i'], desc: ['(rare)'] },
    12: { asc: ['Over the Rainbow', 'Singin’ in the Rain'], desc: ['Willow Weep for Me'] },
};
const SCALES = SCALE_DEFINITIONS;
const CHORDS = CHORD_TEMPLATES;
const CHORD_FEEL: Record<string, string> = { maj: 'bright, resolved', m: 'darker, melancholy', dim: 'tense, unstable', aug: 'dreamlike', sus2: 'open, airy', sus4: 'suspended', maj7: 'lush, jazzy', '7': 'bluesy, wants to resolve', m7: 'smooth, mellow', 'm7♭5': 'dark, cinematic', dim7: 'very tense', mMaj7: 'noir', 6: 'sweet, vintage', m6: 'wistful', '9': 'funky', maj9: 'dreamy', m9: 'soulful' };
const INV_NAMES = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion'];
const SCALE_DEG = SCALE_DEGREE_LABELS;
const CHORD_DEG = CHORD_DEGREE_LABELS;
const MAJOR = [0, 2, 4, 5, 7, 9, 11], ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const PROGS = PROGRESSION_TEMPLATES;
function progChordTpl(sym: string) { return CHORDS.find((c) => c.symbol === sym); }
function dispSym(s: string) { return s === 'maj' ? '' : s; }
/* Accompaniment: extra popular progressions + rhythmic playing patterns. */
const ACCOMP_PROGS = PROGS.concat([
    { name: 'I–V–vi–iii–IV–I (Pachelbel pop)', chords: [[0, 'maj', 'I'], [7, 'maj', 'V'], [9, 'm', 'vi'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
    { name: 'Andalusian i–♭VII–♭VI–V', chords: [[0, 'm', 'i'], [10, 'maj', '♭VII'], [8, 'maj', '♭VI'], [7, 'maj', 'V']] },
    { name: 'Jazz turnaround I–vi–ii–V', chords: [[0, 'maj7', 'I'], [9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V']] },
    { name: 'Circle of 5ths vi–ii–V–I', chords: [[9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V'], [0, 'maj7', 'I']] },
    { name: 'Ballad I–iii–IV–V', chords: [[0, 'maj', 'I'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [7, 'maj', 'V']] },
]);
const ACCOMP_PATTERNS: Record<string, AccompanimentPattern> = {
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
const ACCOMP_I18N = {
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
const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
/* ---------- i18n ---------- */
let lang: RuntimeLanguage = 'en';
function ivName(semi: number) { const d = I18N_MUSIC.intervals[lang]; if (d && d[semi])
    return d[semi]; return (INTERVALS.find((x) => x.semi === semi) || {}).name || COMPOUND[semi] || '?'; }
function scaleDisp(n: string) { const d = I18N_MUSIC.scales[lang]; return (d && d[n]) || n; }
function chordDisp(c: theory.ChordTemplate|string|undefined) { if (c === undefined)
    throw new TypeError('chordDisp: missing chord'); const sym = typeof c === 'string' ? c : c.symbol, name = typeof c === 'string' ? c : c.name, d = I18N_MUSIC.chords[lang]; return (d && d[sym]) || name; }
function isCatKey(cat: string): cat is keyof typeof CATS { return cat in CATS; }
function catLabel(cat: string) { const d = I18N_MUSIC.categories[lang]; return (d && d[cat]) || (isCatKey(cat) && CATS[cat] && CATS[cat].label) || cat; }
function invName(i: number) { const d = I18N_MUSIC.inversions[lang]; return (d && d[i]) || INV_NAMES[i] || ''; }
function feelDisp(sym: string|number) { const d = I18N_MUSIC.feels[lang]; return (d && d[sym]) || CHORD_FEEL[sym] || ''; }
type TrainingItemLabelSource = { cat: string; semi?: number; ref?: theory.ChordTemplate | theory.ProgressionTemplate; name?: string };
function itemLabel(it: TrainingItemLabelSource) { if (it.cat === 'interval')
    return ivName(Number(it.semi)); if (it.cat === 'chord')
    return chordDisp(it.ref && 'symbol' in it.ref ? it.ref : undefined); if (it.cat === 'scale')
    return scaleDisp(String(it.name)); if (!it.ref)
    throw new TypeError('itemLabel: item has no reference'); return it.ref.name; }
function songsFor(semi: number, dir: string) { const src = (I18N_MUSIC.songs && I18N_MUSIC.songs[lang]) || SONGS; return (src[semi] || {})[dir] || []; }
/* V3 pages: strings for Today plan, Learn progress, Songs ear check, Progress, a11y labels */
/* V5: highlight toggle and contextual coaching (Reading focus · What to notice · Next step). %a %b %c are filled by tf(). */
/* Bluetooth MIDI, answering by ear on the keys, rhythm lengths & two hands, installed app & screen */
function applyI18n() {
    queryAllHtml(document, '[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n ?? ''); });
    queryAllHtml(document, '[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria ?? '')); });
    queryAllHtml(document, '[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle ?? ''); });
    if (!activeInputId) {
        midiMsg = null;
        const ss = byId('set-midi-status');
        if (ss)
            ss.textContent = t('midi_off');
    }
    document.documentElement.lang = lang;
    renderModeNav();
    pianoStatus();
    dockLabels();
    bleUi();
    wakeUi();
    pwaUi();
    fsUi();
}
function setLang(l: string|undefined) {
    if (!isRuntimeLanguage(l))
        return;
    lang = l;
    viewState.language = lang;
    queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === l ? 'true' : 'false'));
    applyI18n();
    const rr = selectById('refRoot').value, kc = selectById('keyCtx').value, sr = selectById('song-root').value, pk = selectById('pr-key').value, rn = selectById('refName').value; // re-fill selects so "All keys"/"none"/scale names re-localise
    fillRoots(byId('refRoot'), false);
    fillRoots(byId('song-root'), false);
    fillRoots(byId('pr-key'), true);
    fillRefNames();
    fillKeyCtx();
    selectById('refRoot').value = String(rr || 0);
    selectById('song-root').value = String(sr || 0);
    selectById('pr-key').value = String(pk || 'all');
    selectById('keyCtx').value = String(kc || '-1');
    if (rn)
        selectById('refName').value = rn;
    const ssc = selectById('tr-sscale');
    if (ssc && ssc._filled) {
        const v = ssc.value;
        ssc.innerHTML = '';
        Object.keys(SCALES).forEach((nm) => { const o = (document).createElement('option'); o.value = nm; o.textContent = scaleDisp(nm); ssc.appendChild(o); });
        ssc.value = v || 'Major (Ionian)';
    }
    const ap = selectById('ac-pat');
    if (ap && ap._filled) {
        const v = ap.value;
        ap.innerHTML = '';
        Object.keys(ACCOMP_PATTERNS).forEach((k) => { const o = (document).createElement('option'); o.value = k; o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en; ap.appendChild(o); });
        ap.value = v || 'block';
    }
    renderCircle();
    if (view0() === 'today')
        refreshToday();
    else if (view0() === 'songs')
        renderSongs();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'explore')
        updateExplore();
    else if (view0() === 'learn')
        renderLearn();
    else if (view0() === 'read') {
        fillPieces();
        if (SR.piece) {
            srMeta();
            srBest();
        }
    }
    anLocalize();
    if (view0() === 'analysis')
        anDraw();
    coachRefresh();
    saveAll();
}
/* ---------- HELPERS ---------- */
const midiToFreq = midiToFrequency;
const pc = pitchClass;
const isFlatKey = (p: number) => [3, 5, 8, 10].includes(((p % 12) + 12) % 12);
const rootName = (p: number) => NOTE_SYS[notation].root[((p % 12) + 12) % 12];
function pcName(p: number, flat: boolean) { return (flat ? NOTE_SYS[notation].flat : NOTE_SYS[notation].sharp)[((p % 12) + 12) % 12]; }
function noteName(m: number, flat: boolean) { return pcName(pc(m), flat) + (Math.floor(m / 12) - 1); }
function setEq<T>(a: ArrayLike<T>, b: ArrayLike<T>) { if (a.length !== b.length)
    return false; for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i])
        return false; return true; }
function isSubset<T>(a: readonly T[], b: readonly T[]) { return a.every((x) => b.includes(x)); }
function randItem<T>(a: ArrayLike<T>) { return a[Math.floor(Math.random() * a.length)]; }
function shuffle<T>(src: readonly T[]) { const a = src.slice(); for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
function intervalLabel(semi: number) { const d = I18N_MUSIC.intervals[lang]; if (d && d[semi])
    return d[semi]; const C = lang === 'ro' ? RO_IV : COMPOUND; if (C[semi])
    return C[semi]; const oct = Math.floor(semi / 12), s = semi % 12; const base = s === 0 ? ivName(12) : ivName(s); return base + (lang === 'ro' ? (' + ' + oct + ' octav' + (oct > 1 ? 'e' : 'ă')) : (' + ' + oct + ' octave' + (oct > 1 ? 's' : ''))); }
function chordFormula(c: { intervals: readonly number[]; }) { return formatChordFormula(c.intervals); }
function scaleFormula(offs: readonly number[]) { return formatScaleFormula(offs); }
const todayN = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
/* ---------- AUDIO ENGINE ---------- */
// Web Audio construction and voice ownership live in the typed audio domain.
const PIANO_KEYS = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];
const PIANO_URLS = pianoUrls;
const PIANO_WARM: readonly [number, number] = [48, 84];
const audioEngine = new AudioEngine({ pianoKeys: PIANO_KEYS, pianoUrls: PIANO_URLS, warmRange: PIANO_WARM, onPianoStatus: () => pianoStatus() });
let actx: AudioContext|null = null;
let master: GainNode|null = null;
let masterFilter: BiquadFilterNode|null = null;
let comp: DynamicsCompressorNode|null = null;
let lfo = null;
let lfoGain: GainNode|null = null;
let reverbNode: ConvolverNode|null = null;
let reverbGain: GainNode|null = null;
let muted = false;
let masterVol = 0.72;
let bendSemitones = 0;
let localSynth = true;
let tone: AudioTone = 'piano';
let reverbWet = 0.125;
const viewState: ViewApplicationState = {
  language: lang,
  view: 'today',
  theme,
  notation,
  settings: restoreSettings(null),
  session: {
    active: false,
    index: 0,
    correct: 0,
    total: 0,
    answered: false,
    question: null,
  },
  audio: {
    tone: 'piano',
    piano: 'idle',
    muted: false,
  },
};
function registerViewEvent<Name extends ViewEventName>(
  name: Name,
  handler: ViewEventHandler<Name>,
): void {
  document.addEventListener(name, handler);
}
const liveVoices = audioEngine.liveVoices;
let previewVoices = audioEngine.previewVoices;
const pianoBank = audioEngine.pianoBank;
interface MetronomeState { on: boolean; bpm: number; next: number; beat: number; timer: boolean | null }
const metro: MetronomeState = { on: false, bpm: 90, next: 0, beat: 0, timer: null };
function syncAudioState() {
    actx = audioEngine.context;
    master = audioEngine.master;
    masterFilter = audioEngine.masterFilter;
    comp = audioEngine.compressor;
    lfoGain = audioEngine.lfoGain;
    reverbNode = audioEngine.reverbNode;
    reverbGain = audioEngine.reverbGain;
    previewVoices = audioEngine.previewVoices;
    audioEngine.tone = tone;
    audioEngine.localSynth = localSynth;
    audioEngine.muted = muted;
    audioEngine.masterVolume = masterVol;
    audioEngine.bendSemitones = bendSemitones;
    audioEngine.reverbWet = reverbWet;
    viewState.audio.tone = tone;
    viewState.audio.piano = pianoBank.status;
    viewState.audio.muted = muted;
}
function pianoStatus() {
    const message = t(pianoBank.status === 'ready' ? 'piano_ready' : pianoBank.status === 'error' ? 'piano_error' : 'piano_loading');
    const global = byId('piano-global-status');
    if (global) global.textContent = message;
    const dock = byId('piano-status');
    if (dock) { dock.hidden = pianoBank.status === 'ready'; dock.textContent = message; }
}
function pianoKeys() { return pianoBank.keys; }
function pianoNearest(midi: number) { return pianoBank.keys.reduce((best, key) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best, pianoBank.keys[0] ?? 60); }
function pianoFail(error: unknown) { pianoBank.fail(error); }
let pianoDecode = (key: number) => pianoBank.decode(key);
function pianoEnsure(midis: readonly number[]) { return audioEngine.pianoEnsure(midis); }
function pianoIdleWarm() { pianoBank.warmIdle(); }
let preparePiano = () => pianoBank.prepare(PIANO_WARM);
let makePianoVoice = (frequency: number, velocity: number, when: number|undefined, duration: number|undefined) => audioEngine.makePianoVoice(frequency, velocity, when, duration);
function sampledPianoVoice(frequency: number, velocity: number, when: number|undefined, duration: number|undefined, options = {}) {
    ensureAudio();
    const voice = audioEngine.sampledPianoVoice(frequency, velocity, when, duration, options, { decode: pianoDecode, fallbackVoice: makePianoVoice });
    syncAudioState();
    return voice;
}
function makeVoice(frequency: number, velocity: number, when: number|undefined, duration: number|undefined) {
    ensureAudio();
    const voice = audioEngine.makeVoice(frequency, velocity, when, duration);
    syncAudioState();
    return voice;
}
function ensureAudio() {
    const context = audioEngine.ensureAudio();
    syncAudioState();
    if (context) void preparePiano();
    return context;
}
/** The live audio context; callers run only after `ensureAudio()` has created it. */
function requireAudioContext(): AudioContext {
    if (!actx)
        throw new Error('Étude: audio context is not ready');
    return actx;
}
let audioLockT = 0;
function audioLockSync() {
    if (!actx || actx.state !== 'running') return;
    clearTimeout(audioLockT); audioLockT = 0;
    const el = byId('audioLock'); if (el) el.hidden = true;
}
function audioLockCheck() {
    if (!localSynth || !actx || actx.state === 'running' || audioLockT) return;
    audioLockT = window.setTimeout(() => { audioLockT = 0; const el = byId('audioLock'); if (el && localSynth && actx && actx.state !== 'running') el.hidden = false; }, 300);
}
function audioUnlock() { ensureAudio(); const context = actx; if (context && context.state !== 'running') void context.resume().then(audioLockSync).catch(() => undefined); else audioLockSync(); }
function audioNoteOn(midi: number, velocity: number|undefined) { syncAudioState(); audioEngine.noteOn(midi, velocity || 100, { decode: pianoDecode, fallbackVoice: makePianoVoice }); syncAudioState(); }
function audioNoteOff(midi: number) { audioEngine.noteOff(midi); syncAudioState(); }
function stopPreviews() { clearExplorePreview(); audioEngine.stopPreviews(); syncAudioState(); }
function setBendFromValue(value: number) { audioEngine.setBendFromValue(value); bendSemitones = audioEngine.bendSemitones; }
function masterRamp(value: number) { audioEngine.masterRamp(value); syncAudioState(); }
function startDrone(rootPc: number) { audioEngine.startDrone(rootPc); syncAudioState(); }
function stopDrone() { audioEngine.stopDrone(); syncAudioState(); }
function startMetro() { audioEngine.startMetro(metro.bpm); metro.on = true; metro.timer = true; }
function stopMetro() { audioEngine.stopMetro(); metro.on = false; metro.timer = null; }
function metroSched() { audioEngine.startMetro(metro.bpm); }
function metroClick(when: number, accent: boolean) { audioEngine.metroClick(when, accent); }
let previewNote = function previewNote(midi: number, when?: number, duration?: number, velocity?: number, options: { warm?: boolean; hold?: boolean } = {}) { audioEngine.preview(midi, when, duration, velocity || 96, options); syncAudioState(); }
let playInterval = (rootMidi: number, semitones: number, style: 'both' | 'harmonic' | 'melodic') => { audioEngine.playInterval(rootMidi, semitones, style || 'both'); syncAudioState(); };
function playIvDir(root: number, semitones: number, direction: string) { if (direction === 'desc') playInterval(root + semitones, -semitones, 'both'); else playInterval(root, semitones, 'both'); }
function playChordMidis(midis: number[], arpeggio: boolean) {
    ensureAudio(); stopPreviews();
    exploreSequence(arpeggio ? midis.map((midi, index) => ({ at: index * 160, notes: [midi] })).concat([{ at: midis.length * 160 + 100, notes: midis }, { at: midis.length * 160 + 1200, notes: [] }]) : [{ at: 0, notes: midis }, { at: 1200, notes: [] }]);
    const start = actx?.currentTime ?? 0;
    if (arpeggio) { midis.forEach((midi, index) => previewNote(midi, start + index * 0.16, 0.4)); midis.forEach((midi) => previewNote(midi, start + midis.length * 0.16 + 0.1, 1.1)); }
    else midis.forEach((midi) => previewNote(midi, start, 1.2));
}
function playScaleNotes(rootMidi: number, offsets: readonly number[], ascending: boolean) {
    ensureAudio(); stopPreviews();
    const start = actx?.currentTime ?? 0; let sequence = offsets.concat([12]);
    if (!ascending) sequence = sequence.slice().reverse();
    exploreSequence(sequence.map((offset, index) => ({ at: index * 270, notes: [rootMidi + offset] })).concat([{ at: sequence.length * 270, notes: [] }]));
    sequence.forEach((offset, index) => previewNote(rootMidi + offset, start + index * 0.27, 0.26));
}
const droneVoices = audioEngine.droneVoices;
const TONES = { soft: { w: ['triangle', 'sawtooth', 'sawtooth'], cut: 6 }, bright: { w: ['sawtooth', 'sawtooth', 'square'], cut: 9 }, organ: { w: ['sine', 'sine', 'sine'], cut: 14, oct: [0, 1200, 1902] }, mellow: { w: ['sine', 'triangle', 'sine'], cut: 3.2 }, glass: { w: ['sine', 'triangle', 'square'], cut: 11 } };
let _noiseBuf: null = null;
function noiseBuffer() { return _noiseBuf; }
function makeIR() { return null; }
/* ---------- ACCOMPANIMENT LOOP ---------- */
interface AccompanimentBuild { events: AccompanimentEvent[]; beatsTotal: number }
interface AccompanimentState { on: boolean; progIdx: number; key: number; pattern: string; bpm: number; hands: string; click: boolean; timer: number | null; hlTimers: number[]; built: AccompanimentBuild | null; beatSec: number; loopDur: number; nextLoop: number }
const accomp: AccompanimentState = { on: false, progIdx: 0, key: 0, pattern: 'block', bpm: 90, hands: 'both', click: false, timer: null, hlTimers: [], built: null, beatSec: .5, loopDur: 0, nextLoop: 0 };
function accompVoicing(ch: readonly [number, string, string]) {
    const rootPc = (((accomp.key + ch[0]) % 12) + 12) % 12;
    const tpl = progChordTpl(ch[1]) || progChordTpl('maj');
    if (!tpl)
        throw new Error('Étude: no major chord template');
    const ivs = tpl.intervals.filter((i) => i < 24);
    let rRoot = 60 + rootPc;
    if (rRoot > 71)
        rRoot -= 12; // right hand sits around C4
    return { bass: 36 + rootPc, fifth: 36 + ((rootPc + 7) % 12), right: ivs.map((i) => rRoot + i) };
}
;
function buildAccomp() {
    const prog = ACCOMP_PROGS[accomp.progIdx] || ACCOMP_PROGS[0];
    const pat = ACCOMP_PATTERNS[accomp.pattern] || ACCOMP_PATTERNS.block;
    const ev: AccompanimentEvent[] = [];
    let beat = 0;
    prog.chords.forEach((ch) => { pat.gen(ev, beat, accompVoicing(ch)); beat += pat.beats; });
    return { events: ev, beatsTotal: beat };
}
function accompTimer(fn: () => void, ms: number) {
    const id = window.setTimeout(() => { const i = accomp.hlTimers.indexOf(id); if (i >= 0)
        accomp.hlTimers.splice(i, 1); fn(); }, Math.max(0, ms));
    accomp.hlTimers.push(id);
}
function accompHL(midi: number, st: string, onMs: number, offMs: number) {
    accompTimer(() => { if (accomp.on)
        kbState(midi, st, true); }, onMs);
    accompTimer(() => { if (!accomp.on)
        return; const el = keyEl.get(foldToView(midi)); if (el && el.dataset.s === st)
        kbState(midi, null, true); }, offMs);
}
function scheduleAccompAt(t0: number) {
    const bs = accomp.beatSec, built = accomp.built;
    if (!built)
        return;
    built.events.forEach((e) => {
        if (accomp.hands !== 'both' && e.hand !== (accomp.hands === 'left' ? 'L' : 'R'))
            return;
        const when = t0 + e.beat * bs, dur = Math.max(.12, e.durB * bs * 0.95);
        previewNote(e.midi, when, dur, e.hand === 'L' ? 78 : 98);
        const onMs = (when - requireAudioContext().currentTime) * 1000;
        accompHL(e.midi, e.hand === 'L' ? 'lh' : 'rh', onMs, onMs + Math.min(dur, 1.05) * 1000);
    });
    const n = (ACCOMP_PROGS[accomp.progIdx] || ACCOMP_PROGS[0]).chords.length, per = built.beatsTotal / Math.max(1, n);
    for (let i = 0; i < n; i++)
        accompTimer(() => { if (accomp.on)
            acChainHL(i); }, (t0 + i * per * bs - requireAudioContext().currentTime) * 1000);
}
function acChainHL(i: number) { (document).querySelectorAll('#ac-chain .ch').forEach((el, k) => el.classList.toggle('on', k === i)); }
function accompTick() { if (!accomp.on || !actx)
    return; while (accomp.nextLoop < actx.currentTime + 0.6) {
    scheduleAccompAt(accomp.nextLoop);
    accomp.nextLoop += accomp.loopDur;
} }
function accompStart() {
    ensureAudio();
    accompStop(true);
    accomp.on = true;
    const built = accomp.built = buildAccomp();
    accomp.beatSec = 60 / accomp.bpm;
    accomp.loopDur = built.beatsTotal * accomp.beatSec;
    if (accomp.loopDur <= 0) {
        accomp.on = false;
        return;
    }
    accomp.nextLoop = requireAudioContext().currentTime + 0.18;
    if (accomp.click) {
        metro.bpm = accomp.bpm;
        startMetro();
    }
    accomp.timer = window.setInterval(accompTick, 40);
    accompTick();
}
function accompStop(silent?: boolean) {
    accomp.on = false;
    if (accomp.timer) {
        clearInterval(accomp.timer);
        accomp.timer = null;
    }
    accomp.hlTimers.forEach(clearTimeout);
    accomp.hlTimers = [];
    stopMetro();
    kbClear('lh');
    kbClear('rh');
    stopPreviews();
    acChainHL(-1);
    const pb = (document).getElementById('ac-play');
    if (pb)
        pb.textContent = t('ac_play');
}
/* ---------- TRANSCRIBE (hum → notes) ---------- */
interface TranscribeNote { midi: number; start: number; dur: number }
interface TranscribeDisplayNote { midi: number; sb: number; db: number; label: string }
interface TranscribeState { on: boolean; pending: boolean; micRequest: number; stream: MediaStream | null; src: MediaStreamAudioSourceNode | null; analyser: AnalyserNode | null; buf: Float32Array<ArrayBuffer> | null; raf: number; notes: TranscribeNote[]; display: TranscribeDisplayNote[] | null; curMidi: number | null; curStart: number; lastVoice: number; ring: number[]; hlTimers: number[]; bpm?: number }
const trx: TranscribeState = { on: false, pending: false, micRequest: 0, stream: null, src: null, analyser: null, buf: null, raf: 0, notes: [], display: null, curMidi: null, curStart: 0, lastVoice: 0, ring: [], hlTimers: [] };
function trxFreqToMidi(f: number) { return Math.round(69 + 12 * Math.log2(f / 440)); }
function trxAutoCorrelate(buf: Float32Array, sr: number) {
    let SIZE = buf.length, rms = 0;
    for (let i = 0; i < SIZE; i++)
        rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.012)
        return -1; // too quiet → silence
    let r1 = 0, r2 = SIZE - 1;
    const thr = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thr) {
            r1 = i;
            break;
        }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thr) {
            r2 = SIZE - i;
            break;
        }
    }
    const b = buf.subarray(r1, r2);
    SIZE = b.length;
    if (SIZE < 16)
        return -1;
    const c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        let s = 0;
        for (let j = 0; j < SIZE - i; j++)
            s += b[j] * b[j + i];
        c[i] = s;
    }
    let d = 0;
    while (d < SIZE - 1 && c[d] > c[d + 1])
        d++;
    let max = -1, pos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > max) {
            max = c[i];
            pos = i;
        }
    }
    if (pos <= 0)
        return -1;
    const x1 = c[pos - 1] || 0, x2 = c[pos], x3 = c[pos + 1] || 0, a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    let T = pos;
    if (a)
        T = pos - bb / (2 * a);
    const f = sr / T;
    return (f > 70 && f < 1300) ? f : -1;
}
async function trxStart()  {
    if (trx.on || trx.pending)
        return;
    ensureAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        byId('tr-msg').textContent = t('tr_micfail');
        return;
    }
    const request = ++trx.micRequest;
    trx.pending = true;
    byId('tr-rec').textContent = t('tr_stop');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (request !== trx.micRequest || view0() !== 'transcribe') {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }
        trx.stream = stream;
        trx.pending = false;
    }
    catch (e) {
        if (request === trx.micRequest) {
            trx.pending = false;
            byId('tr-rec').textContent = t('tr_rec');
            byId('tr-msg').textContent = t('tr_micfail');
        }
        return;
    }
    byId('tr-msg').textContent = '';
    trx.src = requireAudioContext().createMediaStreamSource(trx.stream);
    trx.analyser = requireAudioContext().createAnalyser();
    trx.analyser.fftSize = 2048;
    trx.buf = new Float32Array(trx.analyser.fftSize);
    trx.src.connect(trx.analyser); // not connected to destination → no feedback
    trx.on = true;
    trx.notes = [];
    trx.display = null;
    trx.curMidi = null;
    trx.ring = [];
    trx.lastVoice = requireAudioContext().currentTime;
    byId('tr-rec').classList.add('rec-on');
    byId('tr-rec').textContent = t('tr_stop');
    byId('tr-live').classList.add('rec');
    byId('tr-actions').style.display = 'none';
    byId('tr-out').innerHTML = '';
    trxLoop();
}
function trxMedian() { const a = trx.ring.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }
function trxCloseNote(tEnd: number) { if (trx.curMidi == null)
    return; const dur = tEnd - trx.curStart; if (dur >= 0.09)
    trx.notes.push({ midi: trx.curMidi, start: trx.curStart, dur }); trx.curMidi = null; }
function trxLoop() {
    if (!trx.on)
        return;
    if (!trx.analyser || !trx.buf)
        return;
    trx.analyser.getFloatTimeDomainData(trx.buf);
    const f = trxAutoCorrelate(trx.buf, requireAudioContext().sampleRate), now = requireAudioContext().currentTime;
    if (f < 0) {
        if (trx.curMidi != null && now - trx.lastVoice > 0.12) {
            trxCloseNote(now);
            trx.ring = [];
        }
        byId('tr-live').textContent = '—';
    }
    else {
        trx.lastVoice = now;
        let m = trxFreqToMidi(f);
        m = Math.max(36, Math.min(88, m));
        trx.ring.push(m);
        if (trx.ring.length > 5)
            trx.ring.shift();
        const sm = trxMedian(), cents = Math.round(1200 * Math.log2(f / midiToFreq(sm)));
        byId('tr-live').innerHTML = noteName(sm, false) + '<small>' + (cents >= 0 ? '+' : '') + cents + '¢</small>';
        if (trx.ring.length >= 3) {
            if (trx.curMidi == null) {
                trx.curMidi = sm;
                trx.curStart = now;
            }
            else if (sm !== trx.curMidi) {
                trxCloseNote(now);
                trx.curMidi = sm;
                trx.curStart = now;
            }
        }
    }
    trx.raf = requestAnimationFrame(trxLoop);
}
function trxStop() {
    trx.micRequest++;
    trx.pending = false;
    byId('tr-rec').textContent = t('tr_rec');
    if (!trx.on)
        return;
    trx.on = false;
    cancelAnimationFrame(trx.raf);
    trxCloseNote(actx ? actx.currentTime : 0);
    if (trx.src) {
        try {
            trx.src.disconnect();
        }
        catch (_) { }
        trx.src = null;
    }
    if (trx.stream) {
        trx.stream.getTracks().forEach((t) => t.stop());
        trx.stream = null;
    }
    byId('tr-rec').classList.remove('rec-on');
    byId('tr-rec').textContent = t('tr_rec');
    byId('tr-live').classList.remove('rec');
    byId('tr-live').textContent = '—';
    trxRender();
}
function trxSnap(midi: number) {
    if (!inputById('tr-snap').checked)
        return midi;
    const root = +(selectById('tr-skey').value || 0), scale = SCALES[selectById('tr-sscale').value] || SCALES['Major (Ionian)'], set = scale.map((s) => (root + s) % 12);
    let best = midi, bd = 99;
    for (let dd = -2; dd <= 2; dd++) {
        if (set.includes(((midi + dd) % 12 + 12) % 12) && Math.abs(dd) < bd) {
            bd = Math.abs(dd);
            best = midi + dd;
        }
    }
    return best;
}
const TRX_VALS = [{ b: 4, l: '1/1' }, { b: 3, l: '1/2.' }, { b: 2, l: '1/2' }, { b: 1.5, l: '1/4.' }, { b: 1, l: '1/4' }, { b: 0.75, l: '1/8.' }, { b: 0.5, l: '1/8' }, { b: 0.25, l: '1/16' }];
function trxDurLabel(beats: number) { let best = TRX_VALS[0], bd = 1e9; TRX_VALS.forEach((v) => { const d = Math.abs(v.b - beats); if (d < bd) {
    bd = d;
    best = v;
} }); return best.l; }
function trxRender() {
    const out = byId('tr-out');
    out.innerHTML = '';
    if (!trx.notes.length) {
        byId('tr-msg').textContent = t('tr_none');
        byId('tr-actions').style.display = 'none';
        return;
    }
    byId('tr-msg').textContent = '';
    trx.bpm = +(inputById('tr-bpm').value || 90);
    const beatSec = 60 / trx.bpm, quant = inputById('tr-quant').checked, step = 4 / (+(selectById('tr-gridSel').value || 8)); // step in beats
    const base = trx.notes[0].start;
    trx.display = trx.notes.map((n) => {
        let sb = (n.start - base) / beatSec, db = n.dur / beatSec;
        if (quant) {
            sb = Math.round(sb / step) * step;
            db = Math.max(step, Math.round(db / step) * step);
        }
        return { midi: trxSnap(n.midi), sb, db, label: quant ? trxDurLabel(db) : '' };
    });
    const maxDb = Math.max(...trx.display.map((n) => n.db));
    trx.display.forEach((n) => {
        const w = Math.max(16, Math.round(120 * n.db / maxDb));
        const el = (document).createElement('div');
        el.className = 'tr-note';
        el.innerHTML = '<span class="nm">' + noteName(n.midi, false) + '</span><span class="bar" style="width:' + w + 'px"></span>' + (n.label ? '<span class="dl">' + n.label + '</span>' : '');
        out.appendChild(el);
    });
    byId('tr-actions').style.display = 'flex';
}
function trxPlay() {
    if (!trx.display || !trx.display.length)
        return;
    ensureAudio();
    stopPreviews();
    trx.hlTimers.forEach(clearTimeout);
    trx.hlTimers = [];
    const beatSec = 60 / (trx.bpm || 90), t0 = requireAudioContext().currentTime + 0.12;
    trx.display.forEach((n) => {
        const when = t0 + n.sb * beatSec, dur = Math.max(0.12, n.db * beatSec * 0.95), onMs = (when - requireAudioContext().currentTime) * 1000;
        previewNote(n.midi, when, dur, 100);
        trx.hlTimers.push(window.setTimeout(() => kbState(n.midi, 'rh', true), Math.max(0, onMs)));
        trx.hlTimers.push(window.setTimeout(() => { const el = keyEl.get(foldToView(n.midi)); if (el && el.dataset.s === 'rh')
            kbState(n.midi, null, true); }, Math.max(0, onMs + Math.min(dur, 1.0) * 1000)));
    });
}
/* MIDI / text export */
function trxPushVar(arr: number[], v: number) { v = Math.max(0, Math.round(v)); const b = [v & 0x7F]; v >>= 7; while (v > 0) {
    b.unshift((v & 0x7F) | 0x80);
    v >>= 7;
} b.forEach((x) => arr.push(x)); }
function trxBuildMidi() {
    const TPQN = 480, bpm = trx.bpm || 90, ev: { t: number; k: number; m: number; }[] = [];
    if (!trx.display)
        throw new Error('Étude: no transcription to export');
    trx.display.forEach((n) => { const on = Math.round(n.sb * TPQN), off = on + Math.max(1, Math.round(n.db * TPQN)); ev.push({ t: on, k: 1, m: n.midi }); ev.push({ t: off, k: 0, m: n.midi }); });
    ev.sort((a, b) => a.t - b.t || a.k - b.k);
    const trk: number[] = [], mpqn = Math.round(60000000 / bpm);
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255);
    let last = 0;
    ev.forEach((e) => { trxPushVar(trk, e.t - last); last = e.t; trk.push(e.k ? 0x90 : 0x80, e.m & 127, e.k ? 90 : 0); });
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x2F, 0x00);
    const head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQN >> 8) & 255, TPQN & 255];
    const L = trk.length, th = [0x4D, 0x54, 0x72, 0x6B, (L >> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255];
    const out = new Uint8Array(head.length + th.length + L);
    out.set(head, 0);
    out.set(th, head.length);
    out.set(trk, head.length + th.length);
    return out;
}
function trxDownload(name: string, blob: Blob|MediaSource) { const url = URL.createObjectURL(blob), a = (document).createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
function trxExportMidi() { if (!trx.display || !trx.display.length)
    return; trxDownload('etude-melody.mid', new Blob([trxBuildMidi()], { type: 'audio/midi' })); }
function trxExportTxt() { if (!trx.display || !trx.display.length)
    return; const txt = 'Étude — melody\nTempo: ' + (trx.bpm || 90) + ' BPM\n\nNote\tValue\n' + trx.display.map((n) => noteName(n.midi, false) + '\t' + (n.label || '')).join('\n') + '\n'; trxDownload('etude-melody.txt', new Blob([txt], { type: 'text/plain' })); }
function trxClear() { trxStop(); trx.notes = []; trx.display = null; trx.hlTimers.forEach(clearTimeout); trx.hlTimers = []; kbClear('rh'); byId('tr-out').innerHTML = ''; byId('tr-actions').style.display = 'none'; byId('tr-msg').textContent = ''; }
function renderTranscribe() {
    const ks = selectById('tr-skey');
    if (ks) {
        const v = ks.value;
        fillRoots(ks, false);
        ks.value = String(v || 0);
    }
    const ss = selectById('tr-sscale');
    if (ss && !ss._filled) {
        Object.keys(SCALES).forEach((nm) => { const o = (document).createElement('option'); o.value = nm; o.textContent = scaleDisp(nm); ss.appendChild(o); });
        ss._filled = true;
    }
}
/* ============================================================================
   SIGHT-SINGING — pure-SVG staff engraver + on-demand exercise generator.
   Notes carry letter+octave so spelling/staff-position is exact. Offline.
   ============================================================================ */
const SS_LETSEMI = [0, 2, 4, 5, 7, 9, 11];
const SS_SYL_MAJ = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'], SS_SYL_MIN = ['la', 'ti', 'do', 're', 'mi', 'fa', 'sol'];
const SS_MAJ: Record<number, { r: number; n: number }> = { 0: { r: 0, n: 0 }, 7: { r: 4, n: 1 }, 2: { r: 1, n: 2 }, 9: { r: 5, n: 3 }, 4: { r: 2, n: 4 }, 11: { r: 6, n: 5 }, 5: { r: 3, n: -1 }, 10: { r: 6, n: -2 }, 3: { r: 2, n: -3 }, 8: { r: 5, n: -4 }, 1: { r: 1, n: -5 } };
const SS_MIN: Record<number, number> = { 9: 5, 4: 2, 2: 1, 11: 6, 7: 4, 0: 0, 5: 3 }; // minor tonic pc -> tonic letter index
const SS_SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], SS_FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
function ssKeyAcc(n: number) { const a = [0, 0, 0, 0, 0, 0, 0]; if (n > 0)
    for (let i = 0; i < n; i++)
        a[SS_SHARP_ORDER[i]] = 1;
else
    for (let i = 0; i < -n; i++)
        a[SS_FLAT_ORDER[i]] = -1; return a; }
function ssStepOf(li: number, oct: number) { return oct * 7 + li; }
function ssMidiOf(li: number, oct: number, acc: number) { return (oct + 1) * 12 + SS_LETSEMI[li] + (acc || 0); }
interface SightSingLevel { name: string; degs: number[]; durs: number[]; ts: number[][]; bars: number; keys: number[]; step: number; bpm: number; octaveUp?: boolean; minor?: boolean; raise7?: number }
interface SightSingNote { li: number; oct: number; acc: number; dur: number; p: number; midi: number; tBeat: number }
interface SightSingExercise { clef: string; keyPc: number; minor: boolean; keyN: number; ts: number[]; cap: number; measures: SightSingNote[][]; bpm: number; level: number; totalBeats: number; syl: string[]; tonicMidi: number }
const SS_LEVELS: SightSingLevel[] = [
    { name: 'sol–mi', degs: [2, 4], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.85, bpm: 72 },
    { name: '+ la', degs: [2, 4, 5], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.8, bpm: 74 },
    { name: 'pentatonic', degs: [0, 1, 2, 4, 5], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7], step: 0.78, bpm: 76 },
    { name: 'major scale', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5], step: 0.75, bpm: 78, octaveUp: true },
    { name: 'triad leaps', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5, 2], step: 0.5, bpm: 80, octaveUp: true },
    { name: 'minor keys', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [9, 4, 2], step: 0.7, bpm: 80, minor: true, raise7: 0.5, octaveUp: true },
    { name: 'rhythm & meter', degs: [0, 1, 2, 3, 4, 5, 6], durs: [2, 1.5, 1, 0.5], ts: [[4, 4], [3, 4], [6, 8]], bars: 4, keys: [0, 7, 5, 2, 10], step: 0.62, bpm: 84, octaveUp: true },
];
function ssPick<T>(a: ArrayLike<T>) { return a[Math.floor(Math.random() * a.length)]; }
function ssNextDeg(prev: number, allowed: number[], step: number) {
    const w = allowed.map((p) => { const d = Math.abs(p - prev); return (d === 0 ? 0.12 : d <= 1 ? step : d <= 2 ? (1 - step) * 0.6 : (1 - step) * 0.3) + 0.01; });
    let tot = w.reduce((a, b) => a + b, 0), r = Math.random() * tot;
    for (let i = 0; i < allowed.length; i++) {
        r -= w[i];
        if (r <= 0)
            return allowed[i];
    }
    return allowed[0];
}
function ssMakeNote(p: number, tonicLi: number, baseOct: number, acc: number[], minor: boolean, dur: number, raise7: number|undefined) {
    const li = ((tonicLi + p) % 7 + 7) % 7, oct = baseOct + Math.floor((tonicLi + p) / 7);
    let a = acc[li];
    if (minor && (((p % 7) + 7) % 7) === 6 && Math.random() < (raise7 || 0))
        a = a + 1; // harmonic-minor raised 7th
    return { li, oct, acc: a, dur, p, midi: ssMidiOf(li, oct, a) };
}
function ssGen(level: number, clef: string, rangeShift: number): SightSingExercise {
    const L = SS_LEVELS[Math.max(0, Math.min(SS_LEVELS.length - 1, level))], minor = !!L.minor;
    const keyPc = ssPick(L.keys), tonicLi = minor ? SS_MIN[keyPc] : SS_MAJ[keyPc].r, n = minor ? SS_MAJ[(keyPc + 3) % 12].n : SS_MAJ[keyPc].n, acc = ssKeyAcc(n);
    const ts = ssPick(L.ts), cap = ts[1] === 8 ? ts[0] * 0.5 : ts[0];
    const allowed = L.degs.slice();
    if (L.octaveUp)
        allowed.push(7);
    let baseOct = (clef === 'bass' ? 3 : 4) + (rangeShift || 0);
    const measures: SightSingNote[][] = [];
    let prev = 0, beat = 0;
    for (let m = 0; m < L.bars; m++) {
        const notes: SightSingNote[] = [];
        let rem = cap;
        while (rem > 1e-6) {
            const choices = L.durs.filter((d) => d <= rem + 1e-6);
            const dur = ssPick(choices.length ? choices : [rem]);
            const p = (m === 0 && !notes.length) ? 0 : ssNextDeg(prev, allowed, L.step);
            prev = p;
            const note = Object.assign(ssMakeNote(p, tonicLi, baseOct, acc, minor, dur, L.raise7), { tBeat: beat });
            beat += dur;
            notes.push(note);
            rem -= dur;
        }
        measures.push(notes);
    }
    const lm = measures[measures.length - 1], lastN = lm[lm.length - 1];
    const repl = Object.assign(ssMakeNote(0, tonicLi, baseOct, acc, minor, lastN.dur, 0), { tBeat: lastN.tBeat });
    lm[lm.length - 1] = repl;
    return { clef, keyPc, minor, keyN: n, ts, cap, measures, bpm: L.bpm, level, totalBeats: beat, syl: minor ? SS_SYL_MIN : SS_SYL_MAJ, tonicMidi: ssMidiOf(tonicLi, baseOct, acc[tonicLi]) };
}
/* ---- SVG glyphs ---- */
// Clefs are drawn as outlines anchored to their staff line (G or F), so they look the same on every device instead of depending on a system font's music glyphs.
// Outlines: Bravura gClef/fClef, © Steinberg Media Technologies GmbH, SIL Open Font License 1.1. Font units: 250 per staff space, y up, origin on the clef's line.
const CLEF_G = 'M376 415C374 427 376 428 382 434C398 449 419 470 438 491C522 583 572 702 572 815C572 902 548 988 507 1048C492 1070 466 1098 455 1098C441 1098 410 1072 390 1050C316 968 292 843 292 739C292 681 299 616 306 575C308 563 309 561 297 551C233 498 164 437 112 373C43 287 0 194 0 87C0 -87 119 -252 364 -252C387 -252 413 -250 433 -246C444 -244 446 -243 448 -255C460 -322 475 -409 475 -456C475 -604 375 -622 316 -622C262 -622 236 -606 236 -593C236 -586 245 -583 268 -576C299 -567 335 -540 335 -482C335 -427 300 -380 239 -380C172 -380 132 -433 132 -495C132 -560 171 -658 322 -658C389 -658 519 -628 519 -458C519 -401 501 -306 490 -244C488 -232 489 -233 503 -227C604 -187 671 -102 671 11C671 139 577 252 430 252C404 252 404 252 401 270ZM470 943C503 943 530 916 530 861C530 792 497 728 419 650C403 634 379 611 356 591C349 585 345 586 343 599C339 625 337 659 337 691C337 847 409 943 470 943ZM361 262C364 243 364 244 346 238C258 208 201 129 201 44C201 -46 248 -110 316 -133C324 -136 336 -139 343 -139C351 -139 355 -134 355 -128C355 -121 347 -118 340 -115C298 -97 268 -54 268 -8C268 49 307 92 368 109C384 113 386 112 388 101L438 -197C440 -208 439 -208 424 -211C408 -214 388 -216 368 -216C193 -216 80 -119 80 20C80 79 90 158 173 252C233 319 279 356 326 394C336 402 338 401 340 390ZM430 103C428 115 429 118 441 117C522 110 589 42 589 -46C589 -109 551 -160 495 -188C483 -194 481 -194 479 -182Z';
const CLEF_F = 'M252 262C78 262 0 135 0 39C0 -41 42 -110 123 -110C186 -110 229 -66 229 -4C229 60 182 100 133 100C106 100 96 93 83 93C70 93 67 101 67 111C67 151 127 224 229 224C335 224 381 120 381 -37C381 -140 359 -260 297 -356C237 -449 134 -534 10 -605C1 -610 -5 -615 -5 -623C-5 -629 -1 -635 8 -635C13 -635 19 -633 25 -630C158 -565 286 -489 392 -375C479 -281 531 -159 531 -28C531 146 425 262 252 262ZM629 180C598 180 574 156 574 125C574 94 598 70 629 70C660 70 684 94 684 125C684 156 660 180 629 180ZM630 -71C599 -71 576 -94 576 -125C576 -156 599 -179 630 -179C661 -179 684 -156 684 -125C684 -94 661 -71 630 -71Z';
const CLEF_SCALE = 0.044;
function ssTrebleClef(x: number) { return srClef('treble', x, 46); }
function ssBassClef(x: number) { return srClef('bass', x, 46); }
function ssSharp(x: number, y: number) { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 3.4}" y1="${y - 7}" x2="${x + 3.4}" y2="${y + 5}" stroke="#1a1714" stroke-width="1"/><line x1="${x - 2}" y1="${y - 2}" x2="${x + 5.4}" y2="${y - 3.2}" stroke="#1a1714" stroke-width="1.7"/><line x1="${x - 2}" y1="${y + 2.6}" x2="${x + 5.4}" y2="${y + 1.4}" stroke="#1a1714" stroke-width="1.7"/></g>`; }
function ssFlat(x: number, y: number) { return `<path class="ss-glyph" fill="none" stroke="#1a1714" stroke-width="1.4" stroke-linecap="round" d="M ${x - 1},${y - 9} L ${x - 1},${y + 4} C ${x + 5},${y - 1} ${x + 4},${y - 5} ${x - 1},${y - 1.5}"/>`; }
function ssNatural(x: number, y: number) { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 4}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 7}" stroke="#1a1714" stroke-width="1"/><line x1="${x}" y1="${y - 3.5}" x2="${x + 4}" y2="${y - 4.7}" stroke="#1a1714" stroke-width="1.5"/><line x1="${x}" y1="${y + 2.2}" x2="${x + 4}" y2="${y + 1}" stroke="#1a1714" stroke-width="1.5"/></g>`; }
function ssAccGlyph(a: number, k: number, x: number, y: number) { return a > 0 ? ssSharp(x, y) : a < 0 ? ssFlat(x, y) : ssNatural(x, y); }
function ssNotehead(x: number, y: number, dur: number, onLine?: boolean) {
    const filled = dur < 2, rot = `rotate(-20 ${x} ${y})`;
    const e = `<ellipse class="ss-head${filled ? '' : ' ss-hollow'}" cx="${x}" cy="${y}" rx="6" ry="4.4" transform="${rot}"/>`;
    const dot = [0.375, 0.75, 1.5, 3].includes(dur) ? `<circle class="ss-head" cx="${x + 10}" cy="${onLine ? y - 6 : y - 1}" r="1.7"/>` : '';
    return e + dot;
}
function ssStem(x: number, y: number, dur: number) {
    if (dur >= 4)
        return '';
    const up = y > 70, sx = up ? x + 5.6 : x - 5.6, ey = up ? y - 32 : y + 32;
    let s = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    if (dur <= 0.5)
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey + 5} ${sx + 9},${ey + 13} ${sx + 3},${ey + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey - 5} ${sx + 9},${ey - 13} ${sx + 3},${ey - 17}"/>`;
    return s;
}
function ssLedger(x: number, y: number) { let s = ''; if (y > 94) {
    for (let ly = 106; ly <= y + 1; ly += 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} if (y < 46) {
    for (let ly = 34; ly >= y - 1; ly -= 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} return s; }
function ssKeySig(ex: { clef: string; keyN: number; }, x: number) {
    const refStep = ex.clef === 'bass' ? 18 : 30, yOf = (li: number, oct: number) => 94 + (refStep - ssStepOf(li, oct)) * 6;
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const n = ex.keyN, cnt = Math.abs(n), list = n > 0 ? (ex.clef === 'bass' ? sB : sT) : (ex.clef === 'bass' ? fB : fT);
    let svg = '', xx = x;
    for (let i = 0; i < cnt; i++) {
        const y = yOf(list[i][0], list[i][1]);
        svg += n > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
function ssTimeSig(ts: readonly number[], x: number) { return `<text class="ss-num" x="${x + 9}" y="64">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="90">${ts[1]}</text>`; }
interface SightSingNotePosition { x: number; y: number; note: SightSingNote; idx: number }
interface SightSingRender { svg: string; W: number; noteX: SightSingNotePosition[] }
function ssRender(ex: SightSingExercise): SightSingRender {
    const refStep = ex.clef === 'bass' ? 18 : 30, yOf = (li: number, oct: number) => 94 + (refStep - ssStepOf(li, oct)) * 6, keyAcc = ssKeyAcc(ex.keyN);
    let x = 10, body = '', noteX: SightSingNotePosition[] = [], idx = 0;
    body += ex.clef === 'bass' ? ssBassClef(x) : ssTrebleClef(x);
    x += 30;
    const ks = ssKeySig(ex, x);
    body += ks.svg;
    x += ks.w;
    body += ssTimeSig(ex.ts, x);
    x += 26;
    ex.measures.forEach((meas) => {
        meas.forEach((note) => {
            const y = yOf(note.li, note.oct), nx = x + 10;
            let g = '';
            if (note.acc !== keyAcc[note.li])
                g += ssAccGlyph(note.acc, keyAcc[note.li], nx - 13, y);
            g += ssLedger(nx, y) + ssNotehead(nx, y, note.dur) + ssStem(nx, y, note.dur);
            const syl = ex.syl[((note.p % 7) + 7) % 7];
            body += `<g class="ss-n" data-i="${idx}"><rect class="ss-box" x="${nx - 12}" y="40" width="24" height="58" rx="4"/>${g}<text class="ss-syl" x="${nx}" y="126">${syl}</text></g>`;
            noteX.push({ x: nx, y, note, idx });
            x += 26 + note.dur * 15;
            idx++;
        });
        x += 6;
        body += `<line class="ss-line" x1="${x}" y1="46" x2="${x}" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
        x += 12;
    });
    const W = Math.max(x + 4, 360);
    let staff = '';
    [46, 58, 70, 82, 94].forEach((ly) => staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${W - 6}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`);
    staff += `<line class="ss-line" x1="8" y1="46" x2="8" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} 150" width="${W}" height="150" xmlns="http://www.w3.org/2000/svg">${staff}${body}</svg>`, W, noteX };
}
/* ---- state + draw ---- */
interface SightSingState {
    ex: SightSingExercise | null; render: SightSingRender | null; level: number; clef: string; mode: string; idx: number; active: boolean; results: string[]; bpm: number;
    runId: number; micRequest: number; analyser: AnalyserNode | null; stream: MediaStream | null; src: MediaStreamAudioSourceNode | null; buf: Float32Array<ArrayBuffer> | null; raf: number; ring: number[]; stable: number; hint: number;
    samples: { t: number; pc: number; cents: number }[]; keyEvents: { t: number; midi: number }[];
    hlTimers: number[]; playRaf: number; playStart: number; loopA: number | null; loopB: number | null;
    flat: SightSingNote[] | null; holdT: number; wrongT: number; countInMs: number; phraseStartPN: number; phraseSingPN: number; freePN: number; trail: [number, number][];
}
// flat…trail are filled in by the modes before they are read; phraseSingPN starts as NaN so key presses before the count-in never match a note.
const sing: SightSingState = { ex: null, render: null, level: 0, clef: 'treble', mode: 'note', idx: 0, active: false, results: [], bpm: 80,
    runId: 0, micRequest: 0, analyser: null, stream: null, src: null, buf: null, raf: 0, ring: [], stable: 0, hint: 0, samples: [], keyEvents: [],
    hlTimers: [], playRaf: 0, playStart: 0, loopA: null, loopB: null,
    flat: null, holdT: 0, wrongT: 0, countInMs: 0, phraseStartPN: 0, phraseSingPN: NaN, freePN: 0, trail: [] };
/** The exercise on the staff; every caller runs after `ssNewExercise()`. */
function requireSingExercise(): SightSingExercise {
    if (!sing.ex)
        throw new Error('Étude: no sight-singing exercise');
    return sing.ex;
}
/** The exercise's notes in order, filled in by `ssDraw()`. */
function requireSingFlat(): SightSingNote[] {
    if (!sing.flat)
        throw new Error('Étude: sight-singing exercise is not drawn');
    return sing.flat;
}
function ssFillLevels() { const sel = selectById('si-level'); if (!sel || sel._filled)
    return; SS_LEVELS.forEach((L, i) => { const o = (document).createElement('option'); o.value = String(i); o.textContent = (i + 1) + ' · ' + L.name; sel.appendChild(o); }); sel._filled = true; }
function ssDraw() { if (!sing.ex)
    return; const r = ssRender(sing.ex); sing.render = r; sing.flat = r.noteX.map((o) => o.note); const wrap = byId('si-staff'); wrap.innerHTML = r.svg; wrap.classList.toggle('nosolf', !inputById('si-solf').checked); ssPaint(); }
function ssPaint() { const svg = byId('si-staff').querySelector('svg'); if (!svg)
    return; svg.querySelectorAll('.ss-n').forEach((g) => { if (!(g instanceof SVGElement))
    return; const i = Number(g.dataset.i), res = sing.results[i]; if ((sing.mode === 'note') && sing.active && i === sing.idx)
    g.dataset.s = 'now';
else if (res)
    g.dataset.s = res;
else
    g.removeAttribute('data-s'); }); }
function ssNewExercise() { sing.ex = ssGen(sing.level, sing.clef, 0); sing.idx = 0; sing.results = []; sing.active = false; sing.bpm = sing.ex.bpm; const bp = inputById('si-bpm'); if (bp) {
    bp.value = String(sing.ex.bpm);
    byId('si-bpmLbl').textContent = String(sing.ex.bpm);
} ssDraw(); }
function renderSing() { ssFillLevels(); if (!sing.ex || sing.ex.clef !== sing.clef || sing.ex.level !== sing.level)
    ssNewExercise();
else
    ssDraw(); ssModeUI(); }
function singStopAll() {
    sing.active = false;
    if (sing.raf)
        cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssRemoveCursor();
    ssClearTrail();
    sing.hlTimers.forEach(clearTimeout);
    sing.hlTimers = [];
    stopPreviews();
    stopMetro();
    stopDrone();
    ssPaint();
    const g = byId('si-go');
    if (g)
        g.textContent = t(sing.mode === 'free' ? 'si_play' : 'si_listen');
    const lv = byId('si-live');
    if (lv) {
        lv.textContent = '—';
        lv.classList.remove('rec');
    }
}
function ssModeUI() { const m = sing.mode; const tw = byId('si-tempo-wrap'); if (tw)
    tw.style.display = (m === 'note') ? 'none' : 'flex'; const go = byId('si-go'); if (go)
    go.textContent = t(m === 'free' ? 'si_play' : 'si_listen'); }
/* ---- pitch input (mic, shared with Transcribe's autocorrelation) ---- */
function ssMicStart() {
    ensureAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        return Promise.resolve(false);
    const request = ++sing.micRequest;
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then((st) => { if (request !== sing.micRequest || !sing.active || view0() !== 'sing') {
        st.getTracks().forEach((t) => t.stop());
        return false;
    } sing.stream = st; sing.src = requireAudioContext().createMediaStreamSource(st); sing.analyser = requireAudioContext().createAnalyser(); sing.analyser.fftSize = 2048; sing.buf = new Float32Array(sing.analyser.fftSize); sing.src.connect(sing.analyser); return true; }).catch(() => false);
}
function ssMicMaybe() { return sing.analyser ? Promise.resolve(true) : ssMicStart(); }
function ssMicStop() { sing.runId++; sing.micRequest++; if (sing.src) {
    try {
        sing.src.disconnect();
    }
    catch (_) { }
    sing.src = null;
} if (sing.stream) {
    sing.stream.getTracks().forEach((t) => t.stop());
    sing.stream = null;
} sing.analyser = null; }
function ssReadPitch() { if (!sing.analyser || !sing.buf)
    return null; sing.analyser.getFloatTimeDomainData(sing.buf); const f = trxAutoCorrelate(sing.buf, requireAudioContext().sampleRate); if (f < 0)
    return null; const midi = Math.round(69 + 12 * Math.log2(f / 440)), cents = Math.round(1200 * Math.log2(f / (440 * Math.pow(2, (midi - 69) / 12)))); return { f, midi, cents }; }
function ssNeed(targetPc: number, sungPc: number) { let d = ((targetPc - sungPc) % 12 + 12) % 12; if (d > 6)
    d -= 12; return d; } // + → sing higher
function ssCurNote() { return sing.flat ? sing.flat[sing.idx] : null; }
/* ---- cursor + trail + scroll ---- */
function ssSvg() { return byId('si-staff').querySelector('svg'); }
function ssCursorEl() { const svg = ssSvg(); if (!svg)
    return null; let c = svg.querySelector('.ss-playhead'); if (!c) {
    c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    c.setAttribute('class', 'ss-playhead');
    c.setAttribute('y1', '38');
    c.setAttribute('y2', '102');
    svg.appendChild(c);
} return c; }
function ssMoveCursor(x: number) { const c = ssCursorEl(); if (c) {
    c.setAttribute('x1', String(x));
    c.setAttribute('x2', String(x));
} ssScrollToX(x); }
function ssRemoveCursor() { const svg = ssSvg(), c = svg && svg.querySelector('.ss-playhead'); if (c)
    c.remove(); }
function ssScrollToX(x: number) { const w = byId('si-staff'); if (w.scrollWidth > w.clientWidth + 4)
    w.scrollLeft = Math.max(0, x - w.clientWidth * 0.4); }
function ssScrollToCur() { const o = sing.render && sing.render.noteX[sing.idx]; if (o)
    ssScrollToX(o.x); }
function ssPitchY(f: number) { const bottomMidi = requireSingExercise().clef === 'bass' ? 43 : 64, midi = 69 + 12 * Math.log2(f / 440); let y = 94 - (midi - bottomMidi) * 3.5; while (y > 142)
    y -= 42; while (y < 4)
    y += 42; return y; }
function ssDrawTrail() { const svg = ssSvg(); if (!svg)
    return; let pl = svg.querySelector('.ss-trail'); if (!pl) {
    pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('class', 'ss-trail');
    svg.appendChild(pl);
} pl.setAttribute('points', sing.trail.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')); }
function ssClearTrail() { const svg = ssSvg(), pl = svg && svg.querySelector('.ss-trail'); if (pl)
    pl.remove(); }
function ssBeatToX(beat: number) {
    if (!sing.render)
        return 10;
    const ns = sing.render.noteX;
    if (!ns || !ns.length)
        return 10;
    const pts = ns.map((o) => ({ b: o.note.tBeat, x: o.x }));
    pts.push({ b: requireSingExercise().totalBeats, x: sing.render.W - 12 });
    for (let i = 0; i < pts.length - 1; i++) {
        if (beat >= pts[i].b && beat <= pts[i + 1].b) {
            const f = (beat - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + f * (pts[i + 1].x - pts[i].x);
        }
    }
    return beat <= pts[0].b ? pts[0].x : pts[pts.length - 1].x;
}
/* ---- reference cues ---- */
function ssTonic() { if (!sing.ex)
    return; ensureAudio(); previewNote(sing.ex.tonicMidi, requireAudioContext().currentTime + 0.02, 0.85, 92); }
// A pulse running along the staff while the melody plays; with reduced motion the notes simply stay as they are.
function ssFlash(i: number) { if (reduceMotion())
    return; const svg = ssSvg(); if (!svg)
    return; const g = svg.querySelector('.ss-n[data-i="' + i + '"]'); if (!(g instanceof SVGElement))
    return; const prev = g.getAttribute('data-s'); g.dataset.s = 'now'; sing.hlTimers.push(window.setTimeout(() => { if (g.dataset.s === 'now') {
    if (prev && prev !== 'now')
        g.dataset.s = prev;
    else
        g.removeAttribute('data-s');
} }, 240)); }
function ssPlayIt() {
    if (!sing.ex || !sing.flat)
        return;
    ensureAudio();
    stopPreviews();
    sing.hlTimers.forEach(clearTimeout);
    sing.hlTimers = [];
    const beatSec = 60 / (sing.bpm || sing.ex.bpm), t0 = requireAudioContext().currentTime + 0.12;
    sing.flat.forEach((n, i) => { const when = t0 + n.tBeat * beatSec, dur = Math.max(0.18, n.dur * beatSec * 0.92); previewNote(n.midi, when, dur, 92); sing.hlTimers.push(window.setTimeout(() => ssFlash(i), Math.max(0, (when - requireAudioContext().currentTime) * 1000))); });
}
function ssDrone() { if (inputById('si-drone').checked) {
    if (sing.ex) {
        ensureAudio();
        startDrone(pc(sing.ex.tonicMidi));
    }
}
else
    stopDrone(); }
/* ---- mode: note-by-note ---- */
function ssNoteStart() {
    sing.active = true;
    sing.idx = 0;
    sing.results = [];
    sing.hint = 0;
    sing.holdT = 0;
    sing.wrongT = 0;
    ssPaint();
    ssScrollToCur();
    byId('si-verdict').className = 'verdict neutral';
    byId('si-verdict').textContent = t('si_singit');
    ensureAudio();
    previewNote(requireSingExercise().tonicMidi, requireAudioContext().currentTime + 0.02, 0.6, 85);
    const run = sing.runId;
    ssMicMaybe().then((ok) => { if (run === sing.runId && sing.active && sing.mode === 'note') {
        if (!ok)
            byId('si-hint').textContent = t('si_nomic');
        sing.raf = requestAnimationFrame(ssNoteLoop);
    } });
}
function ssNoteLoop(ts: number) {
    if (!sing.active || sing.mode !== 'note')
        return;
    const cur = ssCurNote(), tgt = cur ? pc(cur.midi) : -1, p = ssReadPitch(), lv = byId('si-live');
    if (p) {
        lv.classList.add('rec');
        lv.innerHTML = noteName(p.midi, false) + '<small>' + (p.cents >= 0 ? '+' : '') + p.cents + '¢</small>';
        if (pc(p.midi) === tgt && Math.abs(p.cents) < 42) {
            if (!sing.holdT)
                sing.holdT = ts;
            else if (ts - sing.holdT >= 320) {
                ssNoteCorrect();
            }
            sing.wrongT = 0;
        }
        else {
            sing.holdT = 0;
            if (!sing.wrongT)
                sing.wrongT = ts;
            else if (ts - sing.wrongT > 700) {
                sing.wrongT = 0;
                ssHintBump(p.midi);
            }
        }
    }
    else {
        lv.classList.remove('rec');
        sing.holdT = 0;
    }
    sing.raf = requestAnimationFrame(ssNoteLoop);
}
function ssNoteCorrect() {
    if (!sing.active)
        return;
    sing.results[sing.idx] = 'good';
    sing.holdT = 0;
    sing.wrongT = 0;
    sing.hint = 0;
    byId('si-hint').textContent = '';
    sing.idx++;
    ssPaint();
    ssScrollToCur();
    if (sing.idx >= requireSingFlat().length)
        ssNoteFinish();
}
function ssHintBump(am: number) {
    const cur = ssCurNote();
    if (!cur)
        return;
    sing.hint++;
    const need = ssNeed(pc(cur.midi), pc(am)), syl = requireSingExercise().syl[((cur.p % 7) + 7) % 7];
    if (sing.hint === 1)
        byId('si-hint').textContent = need > 0 ? t('si_hi_up') : t('si_hi_down');
    else {
        byId('si-hint').textContent = t('si_hi_syl', syl);
        ensureAudio();
        previewNote(cur.midi, requireAudioContext().currentTime + 0.02, 0.6, 80);
    }
}
function ssNoteFinish() {
    sing.active = false;
    if (sing.raf)
        cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssPaint();
    const tot = requireSingFlat().length;
    const v = byId('si-verdict');
    v.className = 'verdict good';
    v.textContent = t('si_perfect');
    byId('si-go').textContent = t('si_listen');
    byId('si-live').textContent = '—';
    byId('si-hint').textContent = '';
    ssBumpProgress(tot, tot);
}
/* ---- mode: phrase ---- */
function ssPhraseStart() {
    sing.active = true;
    sing.results = [];
    sing.samples = [];
    sing.keyEvents = [];
    ssPaint();
    byId('si-hint').textContent = '';
    ensureAudio();
    const run = sing.runId;
    ssMicMaybe().then((ok) => {
        if (run !== sing.runId || !sing.active || sing.mode !== 'phrase')
            return;
        if (!ok)
            byId('si-hint').textContent = t('si_nomic');
        const beatSec = 60 / sing.bpm, ci = requireSingExercise().ts[0];
        sing.countInMs = ci * beatSec * 1000;
        sing.phraseStartPN = performance.now() + 150;
        sing.phraseSingPN = sing.phraseStartPN + sing.countInMs;
        const t0 = requireAudioContext().currentTime + 0.15 + (sing.phraseStartPN - performance.now()) / 1000;
        for (let b = 0; b < ci; b++)
            metroClick(t0 + b * beatSec, b === 0); // audible count-in (best-effort)
        byId('si-verdict').className = 'verdict neutral';
        byId('si-verdict').textContent = t('si_count');
        sing.raf = requestAnimationFrame(ssPhraseLoop);
    });
}
function ssPhraseLoop(ts: number) {
    if (!sing.active || sing.mode !== 'phrase')
        return;
    const beatSec = 60 / sing.bpm, dur = requireSingExercise().totalBeats * beatSec;
    if (ts < sing.phraseSingPN) {
        byId('si-verdict').textContent = t('si_count');
        ssMoveCursor(ssBeatToX(0));
        sing.raf = requestAnimationFrame(ssPhraseLoop);
        return;
    }
    const tt = (ts - sing.phraseSingPN) / 1000;
    if (tt <= dur) {
        byId('si-verdict').textContent = t('si_sing_now');
        const p = ssReadPitch();
        if (p)
            sing.samples.push({ t: tt, pc: pc(p.midi), cents: p.cents });
        const lv = byId('si-live');
        if (p) {
            lv.classList.add('rec');
            lv.innerHTML = noteName(p.midi, false);
        }
        else
            lv.classList.remove('rec');
        ssMoveCursor(ssBeatToX(tt / beatSec));
        sing.raf = requestAnimationFrame(ssPhraseLoop);
    }
    else
        ssPhraseGrade();
}
function ssPhraseGrade() {
    sing.active = false;
    if (sing.raf)
        cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssRemoveCursor();
    const beatSec = 60 / sing.bpm;
    requireSingFlat().forEach((n, i) => {
        const s = n.tBeat * beatSec, e = (n.tBeat + n.dur) * beatSec, tpc = pc(n.midi);
        const win = sing.samples.filter((x) => x.t >= s - 0.05 && x.t <= e), onp = win.filter((x) => x.pc === tpc), frac = win.length ? onp.length / win.length : 0;
        let verdict = frac > 0.55 ? 'good' : frac > 0.18 ? 'near' : 'bad';
        if (sing.keyEvents.some((k) => pc(k.midi) === tpc && k.t >= s - 0.18 && k.t <= e + 0.05) && verdict !== 'good')
            verdict = 'good';
        sing.results[i] = verdict;
    });
    ssPaint();
    const good = sing.results.filter((r) => r === 'good').length, tot = requireSingFlat().length;
    const v = byId('si-verdict');
    v.className = 'verdict ' + (good === tot ? 'good' : 'neutral');
    v.textContent = good === tot ? t('si_perfect') : t('si_nicetry', good, tot);
    byId('si-live').textContent = '—';
    byId('si-go').textContent = t('si_listen');
    ssBumpProgress(good, tot);
}
/* ---- mode: free (follow-along scroll + pitch trail) ---- */
function ssFreeStart() {
    sing.active = true;
    sing.trail = [];
    ssClearTrail();
    ssPaint();
    ensureAudio();
    const run = sing.runId;
    ssMicMaybe().then((ok) => { if (run !== sing.runId || !sing.active || sing.mode !== 'free')
        return; if (!ok) {
        singStopAll();
        const v = byId('si-verdict');
        v.className = 'verdict bad';
        v.textContent = t('tr_micfail');
        return;
    } if (inputById('si-drone').checked)
        startDrone(pc(requireSingExercise().tonicMidi)); sing.freePN = performance.now() + 100; byId('si-verdict').className = 'verdict neutral'; byId('si-verdict').textContent = t('si_freehint'); sing.raf = requestAnimationFrame(ssFreeLoop); });
}
function ssFreeLoop(ts: number) {
    if (!sing.active || sing.mode !== 'free')
        return;
    const beatSec = 60 / sing.bpm, dur = requireSingExercise().totalBeats * beatSec;
    let tt = (ts - sing.freePN) / 1000;
    if (tt > dur + 0.4) {
        sing.freePN = ts;
        sing.trail = [];
        ssClearTrail();
        tt = 0;
    }
    const x = ssBeatToX(Math.min(Math.max(tt, 0), dur) / beatSec);
    ssMoveCursor(x);
    const p = ssReadPitch(), lv = byId('si-live');
    if (p) {
        lv.classList.add('rec');
        lv.innerHTML = noteName(p.midi, false) + '<small>' + (p.cents >= 0 ? '+' : '') + p.cents + '¢</small>';
        sing.trail.push([x, ssPitchY(p.f)]);
        if (sing.trail.length > 400)
            sing.trail.shift();
        ssDrawTrail();
    }
    else
        lv.classList.remove('rec');
    sing.raf = requestAnimationFrame(ssFreeLoop);
}
/* ---- input from keyboard / MIDI (alternative to singing) ---- */
function singKeyInput(m: number) { if (!sing.active)
    return; if (sing.mode === 'note') {
    const cur = ssCurNote();
    if (!cur)
        return;
    if (pc(m) === pc(cur.midi))
        ssNoteCorrect();
    else
        ssHintBump(m);
}
else if (sing.mode === 'phrase') {
    sing.keyEvents.push({ t: (performance.now() - sing.phraseSingPN) / 1000, midi: m });
} }
/* ---- dispatcher + light progress ---- */
function singGo() {
    if (!sing.ex)
        return;
    if (sing.active) {
        singStopAll();
        byId('si-verdict').textContent = '';
        return;
    }
    byId('si-hint').textContent = '';
    sing.bpm = +(inputById('si-bpm').value || sing.ex.bpm);
    if (sing.mode === 'note')
        ssNoteStart();
    else if (sing.mode === 'phrase')
        ssPhraseStart();
    else
        ssFreeStart();
    byId('si-go').textContent = t('si_stop');
}
function ssBumpProgress(good: number, tot: number) { if (sing.mode !== 'free' && good === tot && tot > 0) {
    data.singCleared = data.singCleared || {};
    data.singCleared[sing.level] = true;
    saveAll();
} }
/* ---------- KEYBOARD ---------- */
const BASE_LOW = 24, BASE_HIGH = 96;
const view = { low: 48, oct: 4 };
let labelMode = 'c';
let typeOctave = 60;
function clampTypeOctave() { const lo = view.low, maxLo = Math.max(lo, viewHigh() - 12); typeOctave = Math.max(lo, Math.min(maxLo, Math.round(typeOctave / 12) * 12)); }
const whiteEl = new Map<number, HTMLButtonElement>(), blackEl = new Map<number, HTMLButtonElement>(), keyEl = new Map<number, HTMLButtonElement>();
const BLACK_NUDGE: Record<number, number> = { 1: -.28, 3: .28, 6: -.30, 8: 0, 10: .30 };
function viewHigh() { return view.low + view.oct * 12; }
function chooseView() { const w = window.innerWidth; view.oct = w < 560 ? 2 : w < 900 ? 3 : 4; view.low = Math.max(BASE_LOW, Math.min(view.low, BASE_HIGH - view.oct * 12)); clampTypeOctave(); }
function buildKeyboard() {
    clampTypeOctave();
    const keys = byId('keys');
    if (!keys)
        return;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && keys.contains(active)
        ? Number(active.dataset.midi ?? 0)
        : null;
    keys.innerHTML = '';
    whiteEl.clear();
    blackEl.clear();
    keyEl.clear();
    const lo = view.low, hi = viewHigh(), WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (let m = lo; m <= hi; m++) {
        if (!WHITE.has(pc(m)))
            continue;
        const b = (document).createElement('button');
        b.className = 'key white';
        b.dataset.midi = String(m);
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        if (m === 60)
            b.classList.add('midc');
        if (labelMode !== 'none' && (labelMode === 'all' || pc(m) === 0)) {
            const l = (document).createElement('span');
            l.className = 'lbl';
            l.textContent = pc(m) === 0 ? rootName(0) + (Math.floor(m / 12) - 1) : pcName(pc(m), false);
            b.appendChild(l);
        }
        const mk = (document).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg = (document).createElement('span');
        dg.className = 'dg';
        dg.setAttribute('aria-hidden', 'true');
        b.appendChild(dg);
        keys.appendChild(b);
        whiteEl.set(m, b);
        keyEl.set(m, b);
        bindKeyA11y(b, m);
    }
    for (let m = lo; m <= hi; m++) {
        if (WHITE.has(pc(m)))
            continue;
        const b = (document).createElement('button');
        b.className = 'key black';
        b.dataset.midi = String(m);
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        const mk = (document).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg = (document).createElement('span');
        dg.className = 'dg';
        dg.setAttribute('aria-hidden', 'true');
        b.appendChild(dg);
        keys.appendChild(b);
        blackEl.set(m, b);
        keyEl.set(m, b);
        bindKeyA11y(b, m);
    }
    positionBlacks();
    if (focused != null) {
        const key = keyEl.get(Math.max(lo, Math.min(hi, focused)));
        if (key) {
            key.focus({ preventScroll: true });
            const scroll = byId('dock-keys'), r = key.getBoundingClientRect(), s = scroll.getBoundingClientRect();
            if (r.left < s.left)
                scroll.scrollLeft += r.left - s.left;
            else if (r.right > s.right)
                scroll.scrollLeft += r.right - s.right;
        }
    }
    const oi = byId('octInd');
    if (oi)
        oi.textContent = noteName(view.low, false) + '–' + noteName(viewHigh(), false);
    kbDegrees(kbDegSrc);
    if (view0() === 'analysis')
        anKeysPaint(true);
    cofPaintDock();
}
// Chord-member numbers (1 3 5 7 …) shown on keys; `src` maps sounding MIDI notes to labels and is folded into view.
let kbDegSrc: Map<number, string>|null = null;
function kbDegrees(src: Map<number,string>|null) {
    kbDegSrc = src && src.size ? src : null;
    const folded = new Map<number, string>();
    if (kbDegSrc)
        kbDegSrc.forEach((label, m) => folded.set(foldToView(m), label));
    keyEl.forEach((el, m) => {
        const label = folded.get(m) || '', d = queryHtml(el, '.dg');
        const degDesc = label ? (label === 'R' ? t('kb_deg_r') : t('kb_deg', label)) : '';
        if (d) {
            d.textContent = label;
            if (degDesc)
                d.title = degDesc;
            else
                d.removeAttribute('title');
        }
        if (degDesc)
            el.title = noteName(m, false) + ' — ' + degDesc;
        else
            el.removeAttribute('title');
        el.setAttribute('aria-label', noteName(m, false) + (degDesc ? ', ' + degDesc : ''));
    });
}
function positionBlacks() { blackEl.forEach((el, bm) => { const w = whiteEl.get(bm - 1); if (!w || !w.offsetWidth)
    return; const bw = w.offsetWidth * .62, seam = w.offsetLeft + w.offsetWidth, n = (BLACK_NUDGE[pc(bm)] || 0) * bw; el.style.width = bw + 'px'; el.style.left = (seam - bw / 2 + n) + 'px'; }); syncKeyboardPan(); }
function syncKeyboardPan() { const scroll = byId('dock-keys'), pan = inputById('kb-pan'), max = Math.max(0, scroll.scrollWidth - scroll.clientWidth); pan.max = String(max); pan.value = String(scroll.scrollLeft); pan.hidden = !dockShown() || max < 1; }
function reflowKeys() { requestAnimationFrame(() => requestAnimationFrame(positionBlacks)); setTimeout(positionBlacks, 90); } // wait for the dock to lay out before measuring
function foldToView(m: number) { const lo = view.low, hi = viewHigh(); let x = m; while (x < lo)
    x += 12; while (x > hi)
    x -= 12; return x; }
function kbState(midi: number, s: string|null, fold: boolean) { const m = fold ? foldToView(midi) : midi, el = keyEl.get(m); if (!el)
    return; if (s)
    el.dataset.s = s;
else
    delete el.dataset.s; const mk = el.querySelector('.mk'); if (mk)
    mk.textContent = s === 'good' ? '✓' : s === 'bad' ? '✗' : ''; }
function kbClear(s: string) { keyEl.forEach((el) => { if (el.dataset.s === s)
    delete el.dataset.s; const mk = el.querySelector('.mk'); if (mk && !el.dataset.s)
    mk.textContent = ''; }); }
function kbClearAll() { keyEl.forEach((el) => { delete el.dataset.s; const mk = el.querySelector('.mk'); if (mk)
    mk.textContent = ''; }); }
function kbPress(midi: number, on: boolean) { const m = foldToView(midi), el = keyEl.get(m); if (!el)
    return; if (!on && [...held].some((n) => foldToView(n) === m))
    return; el.classList.toggle('pressed', on); if (on) {
    if (!el.dataset.s)
        el.dataset.s = 'active';
}
else if (el.dataset.s === 'active')
    delete el.dataset.s; }
function repaintHeld() { held.forEach((m) => kbPress(m, true)); }
const pointerKey = new Map<number, number|null>();
function keyAt(x: number, y: number) { const el = document.elementFromPoint(x, y); if (el) {
    const k = el.closest('.key');
    if (k instanceof HTMLElement)
        return +(k.dataset.midi ?? 0);
} return null; }
function initPointer() {
    const kb = byId('keys');
    kb.addEventListener('pointerdown', (e) => { const m = keyAt(e.clientX, e.clientY); if (m == null)
        return; e.preventDefault(); try {
        kb.setPointerCapture(e.pointerId);
    }
    catch (_) { } ; pointerKey.set(e.pointerId, m); handleNoteOn(m, 100, 'pointer:' + e.pointerId); });
    kb.addEventListener('pointermove', (e) => { if (!pointerKey.has(e.pointerId))
        return; const cur = pointerKey.get(e.pointerId), m = keyAt(e.clientX, e.clientY); if (m !== cur) {
        if (cur != null)
            handleNoteOff(cur, 'pointer:' + e.pointerId);
        pointerKey.set(e.pointerId, m);
        if (m != null)
            handleNoteOn(m, 100, 'pointer:' + e.pointerId);
    } });
    const end = (e: PointerEvent) => { if (pointerKey.has(e.pointerId)) {
        const m = pointerKey.get(e.pointerId);
        if (m != null)
            handleNoteOff(m, 'pointer:' + e.pointerId);
        pointerKey.delete(e.pointerId);
    } };
    kb.addEventListener('pointerup', end);
    kb.addEventListener('pointercancel', end);
    kb.addEventListener('lostpointercapture', end);
}
function bindKeyA11y(b: HTMLButtonElement, m: number) { b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!b._kd) {
        b._kd = true;
        handleNoteOn(m, 100, 'button:' + m);
    }
} }); b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    b._kd = false;
    handleNoteOff(m, 'button:' + m);
} }); b.addEventListener('blur', () => { if (b._kd) {
    b._kd = false;
    handleNoteOff(m, 'button:' + m);
} }); }
/* ---------- KEYBOARD DOCK: the keys, or folded into a slim rail; one choice for every view ----------
   Hiding only hides the on-screen keys: MIDI and the computer keys keep playing, and the rail keeps one Show keyboard button.
   Without a choice the keys are open, except in Score & analysis on small screens, where the score needs the room; that default
   is settled once per visit, so resizing the window never flips the keyboard (or what its buttons do) behind the user's back.
   Falling notes draw their own keyboard, so that view shows neither the dock nor the rail and leaves the choice untouched. */
interface KeyboardDockState { pref: boolean|null; auto: null; animT: number }
const DOCK: KeyboardDockState = { pref: null, auto: null, animT: 0 };
function dockWanted(v = view0()) { return v === 'today' || v === 'explore' || v === 'accompany' || v === 'transcribe' || v === 'learn' || v === 'read' || v === 'sing' || (v === sesHome() && SES.active) || (v === 'analysis' && anDockWanted()); }
function dockOpen(v = view0()) { if (DOCK.pref != null)
    return DOCK.pref; return false; }
function dockShown() { return document.body.classList.contains('kb') && !byId('dock').classList.contains('is-rail'); }
// The dock's own button names the action it takes (Hide / Show keyboard).
function dockLabels() {
    const open = dockOpen(), act = t(open ? 'kb_hide' : 'kb_show'), dk = byId('dock-kb-toggle');
    dk.setAttribute('aria-expanded', open ? 'true' : 'false');
    dk.title = act;
    const label = dk.querySelector('.dock-kb-label');
    if (label) label.textContent = act;
}
function dockSync() {
    const dock = byId('dock'), v = view0(), on = dockWanted(v), open = on && dockOpen(v), was = document.body.classList.contains('kb'), wasOpen = dockShown();
    dock.classList.toggle('compact', v === 'analysis');
    byId('dock-kb-toggle').hidden = !on;
    dockLabels();
    if (on === was && open === wasOpen)
        return;
    document.body.classList.toggle('kb', on);
    dock.classList.toggle('is-rail', on && !open);
    if (open) {
        if (was && !wasOpen)
            dockReveal();
        if (v === 'analysis' && AN.kbCenter)
            anKeysCenter();
        positionBlacks();
        reflowKeys();
        if (v === 'analysis')
            anKeysPaint(true);
    }
    else {
        dock.classList.remove('is-opening');
        if (v === 'analysis')
            anKeysClear();
    }
    anLayoutVars(); // size the page and the score from the dock's new height in this same frame: no stale gap, no overlap
}
// Expanding from the rail, the keys rise out of it (not with reduced motion); transform and opacity only, so the layout is settled from the first frame.
function dockReveal() { if (reduceMotion())
    return; const dock = byId('dock'); dock.classList.add('is-opening'); clearTimeout(DOCK.animT); DOCK.animT = window.setTimeout(() => dock.classList.remove('is-opening'), 300); }
function dockSet(open: boolean) {
    const keep = view0() === 'analysis' ? anKeepPlace() : dockKeepEnd(open);
    DOCK.pref = !!open;
    saveAll();
    if (view0() === 'analysis')
        anUpdateControls();
    else
        dockSync();
    keep();
}
// Other pages scroll under the dock: whoever is reading the end of a long page still sees it when the keys come back.
function dockKeepEnd(open: boolean) {
    const root = document.scrollingElement || document.documentElement, end = open && root.scrollHeight > innerHeight + 2 && root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2;
    return () => { if (end)
        window.scrollTo(0, root.scrollHeight); };
}
/* ---------- INPUT ROUTING ---------- */
const held = new Set<number>(), heldOrder: number[] = [], sustained = new Set<number>(), inputOwners = new Map<number, Set<string>>();
let pedalDown = false, evalTimer: number|null = null;
function handleNoteOn(midi: number, vel: number, source = 'midi') {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127)
        return;
    ensureAudio();
    const owners = inputOwners.get(midi) || new Set<string>();
    owners.add(source);
    inputOwners.set(midi, owners);
    if (held.has(midi))
        return;
    sustained.delete(midi);
    held.add(midi);
    heldOrder.push(midi);
    audioNoteOn(midi, vel);
    kbPress(midi, true);
    wakePing();
    onInputChange('on', midi);
}
function handleNoteOff(midi: number, source = 'midi') {
    const owners = inputOwners.get(midi);
    if (!owners || !owners.delete(source))
        return;
    if (owners.size)
        return;
    inputOwners.delete(midi);
    if (!held.has(midi))
        return;
    held.delete(midi);
    const i = heldOrder.indexOf(midi);
    if (i >= 0)
        heldOrder.splice(i, 1);
    kbPress(midi, false);
    if (pedalDown)
        sustained.add(midi);
    else
        audioNoteOff(midi);
    onInputChange('off', midi);
}
function pedalUp() { sustained.forEach((m) => { if (!held.has(m))
    audioNoteOff(m); }); sustained.clear(); }
function heldMidis() { return [...held]; }
function heldPcs() { return [...new Set(heldMidis().map(pc))].sort((a, b) => a - b); }
function releaseLiveInput() {
    held.forEach((m) => audioNoteOff(m));
    sustained.forEach((m) => audioNoteOff(m));
    held.clear();
    heldOrder.length = 0;
    sustained.clear();
    inputOwners.clear();
    pointerKey.clear();
    typingDown.clear();
    pedalDown = false;
    keyEl.forEach((el) => { el._kd = false; el.classList.remove('pressed'); if (el.dataset.s === 'active')
        delete el.dataset.s; });
}
// Without focus no key-up or pointer-up arrives, so keys held from the computer keyboard, the screen or a rhythm pad are let go as if
// lifted (drills see an ordinary release). MIDI and Bluetooth go on reporting, so keys and pedal held on the instrument stay as they are.
function releaseFocusInput() {
    let fell = false;
    [...inputOwners.entries()].forEach(([m, o]) => [...o].forEach((s) => { if (s === 'midi' || s === 'ble')
        return; if (s.startsWith('fall:'))
        fell = true; handleNoteOff(m, s); }));
    pointerKey.clear();
    typingDown.clear();
    if (FALL.press)
        FALL.press.clear();
    RD.kbDown = null;
    keyEl.forEach((el) => { el._kd = false; });
    if (RD.rh)
        [...RD.rh.open.keys()].forEach((s) => { if (/^(k:|p\d)/.test(s))
            rdRhRelease(s); });
    if (fell && !FALL.raf)
        fallDraw();
}
function panic() { scorePause(); releaseLiveInput(); trxStop(); accompStop(); trx.hlTimers.forEach(clearTimeout); trx.hlTimers = []; singStopAll(); srStopAll(true); held.forEach((m) => audioNoteOff(m)); held.clear(); heldOrder.length = 0; sustained.forEach((m) => audioNoteOff(m)); sustained.clear(); liveVoices.forEach((v) => v.stop()); liveVoices.clear(); stopPreviews(); stopDrone(); pointerKey.clear(); typingDown.clear(); pedalDown = false; bendSemitones = 0; if (lfoGain && actx)
    lfoGain.gain.setTargetAtTime(0, actx.currentTime, .02); keyEl.forEach((el) => { el.classList.remove('pressed'); if (el.dataset.s === 'active')
    delete el.dataset.s; }); if (view0() === 'explore')
    updateExplore(); }
// midi is the key that just went down or (physically) came up; the sustain pedal never delays an 'off'.
function onInputChange(kind: 'on'|'off', midi: number) {
    if (view0() === 'analysis') {
        pracInput(kind);
        return;
    }
    if (view0() === 'explore') {
        updateExplore();
        return;
    }
    if (view0() === 'learn' && kind === 'on') {
        learnInput();
        return;
    }
    if (view0() === 'sing' && sing.active && kind === 'on') {
        const m = heldOrder[heldOrder.length - 1];
        if (m != null)
            singKeyInput(m);
        return;
    }
    if (view0() === 'read' && RD.on && RD.L && RD.L.ty === 'rh') {
        if (midi != null)
            rdRhKey(kind, midi);
        return;
    }
    if (view0() === 'read' && RD.on && kind === 'on') {
        const m = heldOrder[heldOrder.length - 1];
        if (m != null)
            rdInput(m);
        return;
    }
    if (view0() === 'read' && SR.active && kind === 'on') {
        const m = heldOrder[heldOrder.length - 1];
        if (m != null)
            srKeyInput(m);
        return;
    }
    if (SES.active) {
        if (kind === 'on')
            sesInput(midi);
        else if (SES.q && SES.q.ek)
            ekOff(SES.q, midi);
    }
}
function scheduleEval(fn: () => void, ms: number) { clearTimeout(evalTimer ?? undefined); evalTimer = window.setTimeout(fn, ms); }
/* ---------- WEB MIDI ---------- */
let midiAccess: MIDIAccess|null = null, activeInputId: string|null = null, savedDevice: string|null = null, midiMsg: { cls: string; text: string|null; }|null = null;
function setMidi(text: string|null, cls: string) { midiMsg = { text, cls }; const s = byId('set-midi-status'); if (s)
    s.textContent = text; midiChipSync(); }
// The header chip names the Web MIDI input when one is live, else a live Bluetooth MIDI piano, else the Web MIDI status.
function midiChipSync() {
    const mt = byId('midiText'), md = byId('midiDot');
    if (!mt || !md)
        return;
    if (!(midiMsg && midiMsg.cls === 'on') && bleLive()) {
        mt.textContent = t('ble_on', bleName());
        md.className = 'dot on';
        return;
    }
    mt.textContent = midiMsg ? midiMsg.text : t('midi_connect');
    md.className = 'dot' + (midiMsg && midiMsg.cls ? ' ' + midiMsg.cls : '');
}
async function connectMidi()  {
    ensureAudio();
    if (!navigator.requestMIDIAccess) {
        setMidi(t('midi_unsupported'), 'err');
        return;
    }
    if (!window.isSecureContext)
        setMidi(t('midi_insecure'), 'err');
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        midiAccess.onstatechange = onStateChange;
        refreshDeviceList(true);
    }
    catch (err) {
        console.error(err);
        setMidi(runtimeErrorName(err) === 'SecurityError' ? t('midi_blocked') :
            runtimeErrorName(err) === 'NotAllowedError' ? t('midi_denied') : t('midi_unavail'), 'err');
    }
}
function listInputs() { return midiAccess ? [...midiAccess.inputs.values()] : []; }
function pickArturia(ins: MIDIInput[]) { const c = ins.filter((i) => /microlab|arturia/i.test(i.name ?? '')); if (!c.length)
    return null; const g = c.filter((i) => !/daw|midiin2|control|thru/i.test(i.name ?? '')); return g[0] || c[0]; }
function refreshDeviceList(autoPick: boolean) {
    const sel = selectById('deviceSelect'), ins = listInputs();
    sel.innerHTML = '';
    if (!ins.length) {
        sel.innerHTML = '<option>—</option>';
        activeInputId = null;
        setMidi(t('midi_noinputs'), 'err');
        return;
    }
    ins.forEach((i) => { const o = (document).createElement('option'); o.value = i.id; o.textContent = i.name; sel.appendChild(o); });
    const still = activeInputId && ins.some((i) => i.id === activeInputId);
    const remembered = !still && savedDevice ? ins.find((i) => i.id === savedDevice) : undefined; // reconnect the device used last time
    const chosen = (still ? ins.find((i) => i.id === activeInputId) : undefined) || remembered || ((autoPick || !activeInputId) ? (pickArturia(ins) || ins[0]) : ins[0]);
    if (!chosen)
        return;
    sel.value = chosen.id;
    attachInput(chosen.id);
}
function attachInput(id: string) { if (activeInputId && activeInputId !== id)
    releaseLiveInput(); listInputs().forEach((i) => i.onmidimessage = null); const inp = listInputs().find((i) => i.id === id); if (!inp)
    return; inp.onmidimessage = onMidiMessage; activeInputId = id; savedDevice = id; setMidi(inp.name, 'on'); saveAll(); }
function autoReconnectMidi() {
    if (!navigator.permissions || !navigator.requestMIDIAccess)
        return;
    try {
        const midiPermission: Parameters<Permissions['query']>[0] & { sysex: boolean } = { name: 'midi', sysex: false };
        (navigator.permissions).query(midiPermission).then((p) => { if (p.state === 'granted')
            connectMidi(); }).catch(() => { });
    }
    catch (_) { }
}
function onStateChange() { const was = activeInputId, ins = listInputs(), present = activeInputId && ins.some((i) => i.id === activeInputId); if (was && !present) {
    panic();
    activeInputId = null;
} refreshDeviceList(false); }
// A short message leaves the missing bytes NaN, which no comparison below matches (as `undefined` did).
function onMidiMessage(e: MIDIMessageEvent) { if (!e.data)
    return; const [st = NaN, d1 = NaN, d2 = NaN] = e.data; midiIn(st, d1, d2, 'midi'); }
// One decoder for every transport (Web MIDI, Bluetooth MIDI): notes, sustain (CC64), mod wheel (CC1) and pitch bend.
function midiIn(st: number, d1: number, d2: number, src: string) {
    const cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) {
        handleNoteOn(d1, d2, src);
        audioLockCheck();
    }
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0))
        handleNoteOff(d1, src);
    else if (cmd === 0xE0)
        setBendFromValue(((d2 << 7) | d1) - 8192);
    else if (cmd === 0xB0) {
        if (d1 === 64) {
            const dn = d2 >= 64;
            if (pedalDown && !dn)
                pedalUp();
            pedalDown = dn;
        }
        else if (d1 === 1 && lfoGain && actx)
            lfoGain.gain.setTargetAtTime((d2 / 127) * 35, actx.currentTime, .03);
    }
}
/* ---------- BLUETOOTH MIDI: BLE-MIDI straight from the piano over Web Bluetooth ----------
   Notifications are decoded and handed to midiIn() in the same event turn: no queue, timer or polling between the radio and the
   sound. The chooser only opens from the Connect button; Reconnect (and the silent start-up reconnect) reuse a device the site was
   already allowed to use, without a chooser. */
const BLE_MIDI_SVC = '03b80e5a-ede8-4b33-a751-6ce34ec4c700', BLE_MIDI_CHR = '7772e5db-3868-4112-a1a9-f2669d106bf3';
interface BleMidiState {
    dev: BleMidiDevice|null; chr: BleMidiCharacteristic|null; busy: boolean; want: boolean; gen: number; tries: number; retryT: number; guardT: number; timedOut: number;
    msg: string|null; cls: string; arg: string|null; saved: { id: string; name: string; auto: boolean }|null;
    run: number; need: number; n: number; d1: number; skip: number; sysex: boolean; pedal: boolean; bend: boolean; mod: boolean;
}
const BLE: BleMidiState = { dev: null, chr: null, busy: false, want: false, gen: 0, tries: 0, retryT: 0, guardT: 0, timedOut: 0, msg: null, cls: '', arg: null, saved: null,
    run: 0, need: 0, n: 0, d1: 0, skip: 0, sysex: false, pedal: false, bend: false, mod: false };
function bleCan() { return !!((navigator).bluetooth && (navigator).bluetooth.requestDevice); }
function bleLive() { return !!(BLE.chr && BLE.dev && BLE.dev.gatt && BLE.dev.gatt.connected); }
function bleName() { return (BLE.dev && BLE.dev.name) || (BLE.saved && BLE.saved.name) || t('ble_dev'); }
function bleSet(key: string|null, cls?: string, arg?: string|null) { BLE.msg = key; BLE.cls = cls || ''; BLE.arg = arg == null ? null : arg; bleUi(); }
function bleUi() {
    midiChipSync();
    const st = byId('set-ble-status'), b = buttonById('set-ble'), re = byId('set-ble-re');
    if (!st || !b)
        return;
    const live = bleLive(), key = BLE.msg || (bleCan() ? (BLE.dev && !live ? 'ble_known' : 'ble_off') : 'ble_unsupported');
    st.textContent = t(key, BLE.msg && BLE.arg != null ? BLE.arg : bleName());
    st.dataset.s = live ? 'on' : (BLE.msg ? BLE.cls : (bleCan() ? '' : 'err'));
    b.textContent = t(live ? 'ble_disconnect' : BLE.busy ? 'ble_cancel_btn' : 'ble_connect');
    b.disabled = !bleCan();
    re.hidden = !(BLE.dev && !live && !BLE.busy);
}
function bleClick() { if (bleLive() || BLE.busy) {
    bleDisconnect();
    return;
} bleChoose(); }
async function bleChoose()  {
    const bluetooth = navigator.bluetooth;
    if (!bleCan() || !bluetooth) {
        bleSet('ble_unsupported', 'err');
        return;
    }
    if (!window.isSecureContext) {
        bleSet('ble_insecure', 'err');
        return;
    }
    let req;
    try {
        req = bluetooth.requestDevice({ filters: [{ services: [BLE_MIDI_SVC] }, ...['ES120', 'ES110', 'ES520', 'ES920', 'KAWAI', 'Kawai'].map((namePrefix) => ({ namePrefix }))], optionalServices: [BLE_MIDI_SVC] });
    }
    catch (err) {
        bleErr(err);
        return;
    }
    ensureAudio();
    bleSet('ble_choose');
    let dev;
    try {
        dev = await req;
    }
    catch (err) {
        bleErr(err);
        return;
    }
    BLE.tries = 0;
    bleOpen(dev, false);
}
function bleErr(err: unknown, quiet?: boolean) {
    const n = runtimeErrorName(err), m = err instanceof Error ? err.message : '';
    console.warn('Bluetooth MIDI:', err);
    if (n === 'NotFoundError' && /cancel/i.test(m))
        bleSet('ble_cancel');
    else if (n === 'NotAllowedError' || /permission|denied/i.test(m))
        bleSet('ble_denied', 'err');
    else if (n === 'SecurityError' || /blocked/i.test(m))
        bleSet('ble_blocked', 'err');
    else if (n === 'NotSupportedError')
        bleSet('ble_unsupported', 'err');
    else if (/adapter|turned off|not available|unavailable/i.test(m))
        bleSet('ble_adapter', 'err');
    else if (n === 'NotFoundError' && /service|characteristic/i.test(m))
        bleSet('ble_nomidi', 'err');
    else if (quiet)
        bleSet('ble_known');
    else
        bleSet('ble_failed', 'err', n || m || '?');
}
// A superseded attempt (user pressed Disconnect, or picked another piano) closes the link it opened unless it is wanted again.
function bleStale(gen: number, dev: BleMidiDevice) { if (gen === BLE.gen)
    return false; if (!BLE.want || BLE.dev !== dev) {
    try {
        dev.gatt?.disconnect();
    }
    catch (_) { }
} return true; }
// retrying: an automatic reconnect after the link dropped; quiet: the silent start-up attempt (no red errors if the piano is off).
async function bleOpen(dev: BleMidiDevice, retrying: boolean, quiet?: boolean)  {
    if (BLE.busy && BLE.dev === dev)
        return;
    if (BLE.dev && BLE.dev !== dev)
        bleDisconnect(true); // switching pianos: drop the old link first
    clearTimeout(BLE.retryT);
    BLE.dev = dev;
    BLE.want = true;
    BLE.busy = true;
    const gen = ++BLE.gen;
    dev.removeEventListener('gattserverdisconnected', bleOnGone);
    dev.addEventListener('gattserverdisconnected', bleOnGone);
    if (!retrying)
        bleSet('ble_connecting');
    else
        bleUi();
    // gatt.connect() can wait a long time for a piano that is off; give up after 15 s so the button never hangs.
    clearTimeout(BLE.guardT);
    BLE.guardT = window.setTimeout(() => { if (BLE.busy && BLE.gen === gen) {
        BLE.timedOut = gen;
        try {
            dev.gatt?.disconnect();
        }
        catch (_) { }
    } }, 15000);
    try {
        if (!dev.gatt)
            throw new TypeError('Bluetooth device has no GATT server');
        const server = await dev.gatt.connect();
        if (bleStale(gen, dev))
            return;
        const svc = await server.getPrimaryService(BLE_MIDI_SVC), chr = await svc.getCharacteristic(BLE_MIDI_CHR);
        if (bleStale(gen, dev))
            return;
        chr.removeEventListener('characteristicvaluechanged', bleOnValue);
        chr.addEventListener('characteristicvaluechanged', bleOnValue);
        bleParserReset();
        BLE.chr = chr;
        await chr.startNotifications();
        if (bleStale(gen, dev)) {
            chr.removeEventListener('characteristicvaluechanged', bleOnValue);
            return;
        }
        clearTimeout(BLE.guardT);
        BLE.busy = false;
        BLE.tries = 0;
        BLE.saved = { id: dev.id, name: dev.name || '', auto: true };
        saveAll();
        bleSet('ble_on', 'on');
    }
    catch (err) {
        if (gen !== BLE.gen)
            return;
        clearTimeout(BLE.guardT);
        BLE.busy = false;
        bleUnhook();
        if (runtimeErrorName(err) === 'NotFoundError' && /service|characteristic/i.test(runtimeErrorMessage(err))) {
            BLE.want = false;
            try {
                dev.gatt?.disconnect();
            }
            catch (_) { }
            bleSet('ble_nomidi', 'err');
            return;
        }
        if (retrying && BLE.want) {
            bleRetry();
            return;
        }
        BLE.want = false;
        if (BLE.timedOut === gen)
            bleSet(quiet ? 'ble_known' : 'ble_unreach', quiet ? '' : 'err');
        else
            bleErr(err, quiet);
    }
}
function bleUnhook() { if (BLE.chr)
    BLE.chr.removeEventListener('characteristicvaluechanged', bleOnValue); BLE.chr = null; }
function bleOnGone(e: BleDisconnectEvent) {
    if (e.target !== BLE.dev)
        return;
    const was = !!BLE.chr;
    bleUnhook();
    bleReleaseInput();
    if (BLE.busy)
        return; // a connect in flight reports its own failure
    if (BLE.want && was) {
        BLE.tries = 0;
        bleRetry();
    }
    else
        bleUi();
}
// After an unexpected drop, try the same device again a few times (no chooser needed), then hand over to the Reconnect button.
function bleRetry() {
    const dev = BLE.dev;
    if (!dev || !BLE.want)
        return;
    if (BLE.tries >= 3) {
        BLE.want = false;
        bleSet('ble_gone', 'err');
        return;
    }
    const wait = [500, 2000, 5000][BLE.tries++];
    bleSet('ble_lost', 'err');
    clearTimeout(BLE.retryT);
    BLE.retryT = window.setTimeout(() => { if (BLE.want && BLE.dev === dev && !bleLive())
        bleOpen(dev, true); }, wait);
}
function bleReconnect() { const dev = BLE.dev; if (!dev || bleLive() || BLE.busy)
    return; ensureAudio(); BLE.tries = 0; bleOpen(dev, false); }
function bleDisconnect(keepMsg?: boolean) {
    const chr = BLE.chr, dev = BLE.dev;
    BLE.want = false;
    BLE.gen++;
    BLE.busy = false;
    clearTimeout(BLE.retryT);
    clearTimeout(BLE.guardT);
    bleUnhook();
    bleReleaseInput();
    if (BLE.saved) {
        BLE.saved.auto = false;
        saveAll();
    }
    if (chr)
        chr.stopNotifications().catch(() => { });
    if (dev && dev.gatt && dev.gatt.connected) {
        try {
            dev.gatt.disconnect();
        }
        catch (_) { }
    }
    if (!keepMsg)
        bleSet('ble_off');
}
// Nothing may stay stuck when the link goes: keys held over Bluetooth, its sustain pedal, bend and mod wheel are let go.
function bleReleaseInput() {
    [...inputOwners.entries()].forEach(([m, o]) => { if (o.has('ble'))
        handleNoteOff(m, 'ble'); });
    if (BLE.pedal && pedalDown) {
        pedalDown = false;
        pedalUp();
    }
    if (BLE.bend)
        setBendFromValue(0);
    if (BLE.mod && lfoGain && actx)
        lfoGain.gain.setTargetAtTime(0, actx.currentTime, .03);
    BLE.pedal = BLE.bend = BLE.mod = false;
    bleParserReset();
}
async function bleAutoReconnect()  {
    const s = BLE.saved;
    const bluetooth = navigator.bluetooth;
    if (!s || !bleCan() || !window.isSecureContext || !bluetooth || !bluetooth.getDevices)
        return;
    try {
        const dev = (await bluetooth.getDevices()).find((d) => d.id === s.id);
        if (!dev || BLE.dev)
            return;
        BLE.dev = dev;
        bleUi();
        if (s.auto)
            bleOpen(dev, false, true);
    }
    catch (err) {
        console.warn('Bluetooth MIDI:', err);
    }
}
function bleParserReset() { BLE.run = 0; BLE.need = 0; BLE.n = 0; BLE.skip = 0; BLE.sysex = false; }
function bleOnValue(e: BleValueEvent) { const v = e.target.value; if (v && v.byteLength > 1)
    bleParse(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); }
/* BLE-MIDI packet: [header 10hhhhhh] then messages, each normally led by a timestamp byte [1lllllll]. A byte with bit 7 set that
   directly follows a timestamp is a status byte; any other byte with bit 7 set is the next timestamp. Within a packet a message may
   drop its status (running status) and then also its timestamp, so several notes can share one notification. SysEx may span
   packets (continuation packets carry only data after the header). Messages are dispatched as soon as their last byte is read;
   the timestamps carry no information we need, because the packet is played the moment it arrives. */
function bleParse(p: Uint8Array) {
    if ((p[0] & 0xC0) !== 0x80)
        return;
    let ts = false;
    for (let i = 1; i < p.length; i++) {
        const b = p[i];
        if (b & 0x80) {
            if (!ts) {
                ts = true;
                continue;
            }
            ts = false;
            bleStatus(b);
        }
        else {
            ts = false;
            bleData(b);
        }
    }
}
function bleStatus(b: number) {
    if (b >= 0xF8)
        return; // real-time (clock, active sensing…): ignored, running status kept
    if (b === 0xF0) {
        BLE.sysex = true;
        BLE.run = 0;
        BLE.n = 0;
        return;
    }
    if (b === 0xF7) {
        BLE.sysex = false;
        return;
    }
    BLE.sysex = false;
    BLE.n = 0;
    if (b > 0xF0) {
        BLE.run = 0;
        BLE.skip = b === 0xF2 ? 2 : (b === 0xF1 || b === 0xF3) ? 1 : 0;
        return;
    } // system common: skip its data, cancel running status
    BLE.run = b;
    BLE.skip = 0;
    BLE.need = ((b & 0xF0) === 0xC0 || (b & 0xF0) === 0xD0) ? 1 : 2;
}
function bleData(b: number) {
    if (BLE.sysex)
        return;
    if (!BLE.run) {
        if (BLE.skip)
            BLE.skip--;
        return;
    }
    if (BLE.n === 0) {
        if (BLE.need === 1) {
            bleMsg(BLE.run, b, 0);
            return;
        }
        BLE.d1 = b;
        BLE.n = 1;
        return;
    }
    BLE.n = 0;
    bleMsg(BLE.run, BLE.d1, b);
}
function bleMsg(st: number, d1: number, d2: number) {
    const cmd = st & 0xF0;
    if (cmd === 0xB0) {
        if (d1 === 64)
            BLE.pedal = d2 >= 64;
        else if (d1 === 1)
            BLE.mod = d2 > 0;
    }
    else if (cmd === 0xE0)
        BLE.bend = ((d2 << 7) | d1) !== 8192;
    midiIn(st, d1, d2, 'ble');
}
/* ---------- INSTALLED APP: offline copy, install prompt, full screen and screen wake lock ---------- */
interface InstalledAppState { sw: string; err: string; prompt: InstallPromptEvent|null; installed: boolean }
const PWA: InstalledAppState = { sw: '', err: '', prompt: null, installed: false };
function pwaStandalone() {
    return !!(window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        navigator.standalone === true);
}
function pwaInit() {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA.prompt = e; pwaUi(); });
    window.addEventListener('appinstalled', () => { PWA.prompt = null; PWA.installed = true; pwaUi(); });
    if (location.protocol === 'file:')
        PWA.sw = 'file';
    else if (!('serviceWorker' in navigator))
        PWA.sw = 'unsupported';
    else if (!window.isSecureContext)
        PWA.sw = 'file';
    else {
        const killed = new URL(location.href).searchParams.get('sw-kill-switch') === 'done';
        if (killed) {
            const clean = new URL(location.href);
            clean.searchParams.delete('sw-kill-switch');
            history.replaceState(null, '', clean.href);
            PWA.sw = 'unsupported';
            pwaUi();
            return;
        }
        PWA.sw = 'pending';
        const reg = () => navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
            .then(() => navigator.serviceWorker.ready).then(() => { PWA.sw = 'ready'; pwaUi(); })
            .catch((err: unknown) => { PWA.sw = 'error'; PWA.err = (err instanceof Error && (err.name || err.message)) || '?'; console.warn('Service worker:', err); pwaUi(); });
        if (document.readyState === 'complete')
            reg();
        else
            window.addEventListener('load', reg, { once: true });
    }
    pwaUi();
}
function pwaUi() {
    const st = byId('set-pwa-status'), ib = byId('set-install');
    if (!st || !ib)
        return;
    const pwaLabels: Record<string, string> = {
        file: 'pwa_file',
        unsupported: 'pwa_unsupported',
        ready: 'pwa_ready',
        error: 'pwa_err',
    };
    const k = (PWA.installed || pwaStandalone()) && PWA.sw !== 'file'
        ? 'pwa_installed'
        : pwaLabels[PWA.sw] || 'pwa_pending';
    st.textContent = t(k, PWA.err);
    st.dataset.s = PWA.sw === 'error' ? 'err' : '';
    ib.hidden = !PWA.prompt;
}
async function pwaInstall()  {
    const p = PWA.prompt;
    if (!p)
        return;
    PWA.prompt = null;
    pwaUi();
    try {
        await p.prompt();
        const c = await p.userChoice;
        if (c && c.outcome === 'accepted')
            PWA.installed = true;
    }
    catch (err) {
        console.warn('Install:', err);
    }
    pwaUi();
}
function fsCan() { return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen); }
function fsUi() { const b = byId('set-full'); if (!b)
    return; const row = b.closest('.set-row'); if (row instanceof HTMLElement)
    row.hidden = !fsCan(); b.textContent = t(document.fullscreenElement ? 'full_exit' : 'full_enter'); }
function fsToggle() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
        return;
    }
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((err) => console.warn('Full screen:', err));
}
// Screen Wake Lock: a remembered choice, held while the page is in front, given back after 30 minutes without playing or touching,
// taken again on the next note or tap. The browser drops the lock whenever the page is hidden; it is re-requested on return.
interface WakeLockState { want: boolean; lock: WakeLockSentinel|null; busy: boolean; err: string; fails: number; idle: boolean; last: number; idleT: number; gest: boolean }
const WAKE: WakeLockState = { want: false, lock: null, busy: false, err: '', fails: 0, idle: false, last: 0, idleT: 0, gest: false }, WAKE_IDLE_MS = 30 * 60 * 1000;
function wakeCan() { return !!(navigator.wakeLock && navigator.wakeLock.request); }
async function wakeGet()  {
    if (!WAKE.want || WAKE.idle || WAKE.lock || WAKE.busy || !wakeCan() || document.visibilityState !== 'visible')
        return;
    WAKE.busy = true;
    try {
        const s = await navigator.wakeLock.request('screen');
        WAKE.busy = false;
        if (!WAKE.want || WAKE.idle || document.visibilityState !== 'visible') {
            s.release().catch(() => { });
            wakeUi();
            return;
        }
        WAKE.lock = s;
        WAKE.err = '';
        WAKE.fails = 0;
        s.addEventListener('release', () => { if (WAKE.lock === s)
            WAKE.lock = null; wakeUi(); });
    }
    catch (err) {
        WAKE.busy = false;
        WAKE.err = runtimeErrorName(err) || 'Error';
        WAKE.fails++;
        if (WAKE.fails === 1)
            console.warn('Wake lock:', err);
        if (WAKE.fails < 3)
            wakeOnGesture();
    } // e.g. no user activation yet: one quiet retry on the next tap or key, never a loop
    wakeUi();
}
function wakeOnGesture() {
    if (WAKE.gest)
        return;
    WAKE.gest = true;
    const go = () => { WAKE.gest = false; ['pointerdown', 'keydown'].forEach((ev) => window.removeEventListener(ev, go, true)); wakeGet(); };
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, go, true));
}
function wakeDrop() { const s = WAKE.lock; WAKE.lock = null; if (s)
    s.release().catch(() => { }); }
function wakeSet(on: boolean) {
    WAKE.want = !!on;
    WAKE.idle = false;
    WAKE.err = '';
    WAKE.fails = 0;
    if (WAKE.want) {
        wakePing();
        wakeGet();
    }
    else {
        clearTimeout(WAKE.idleT);
        WAKE.idleT = 0;
        wakeDrop();
    }
    saveAll();
    wakeUi();
}
function wakePing() {
    if (!WAKE.want)
        return;
    WAKE.last = performance.now();
    if (WAKE.idle) {
        WAKE.idle = false;
        wakeGet();
        wakeUi();
    }
    if (!WAKE.idleT)
        wakeArm(WAKE_IDLE_MS);
}
function wakeArm(ms: number) {
    WAKE.idleT = window.setTimeout(() => {
        WAKE.idleT = 0;
        if (!WAKE.want)
            return;
        const left = WAKE_IDLE_MS - (performance.now() - WAKE.last);
        if (left > 1000) {
            wakeArm(left);
            return;
        }
        WAKE.idle = true;
        wakeDrop();
        wakeUi();
    }, ms);
}
function wakeUi() {
    const cb = inputById('set-wake'), st = byId('set-wake-status');
    if (!cb || !st)
        return;
    const can = wakeCan();
    cb.checked = WAKE.want && can;
    cb.disabled = !can;
    st.textContent = !can ? t('wake_unsupported') : !WAKE.want ? t('wake_off') : WAKE.lock ? t('wake_on') : WAKE.idle ? t('wake_idle') : WAKE.err === 'NotAllowedError' ? t('wake_denied') : WAKE.err ? t('wake_err', WAKE.err) : t('wake_wait');
    st.dataset.s = WAKE.want && WAKE.lock ? 'on' : WAKE.want && WAKE.err ? 'err' : '';
}
function wakeInit() {
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, wakePing, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && WAKE.want) {
        WAKE.fails = 0;
        wakePing();
        wakeGet();
    } wakeUi(); });
    if (WAKE.want) {
        wakePing();
        wakeGet();
    }
    wakeUi();
}
/* computer keyboard */
// Notes and Z / X follow physical key positions (KeyboardEvent.code), so QWERTZ, AZERTY… keep the piano shape; shortcuts stay on letters.
const KEYMAP: Record<string, number> = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };
const typingDown = new Map<string, number>();
function shiftTypeOctave(dir: number) { releaseTypingKeys(); const next = typeOctave + dir * 12, minLow = BASE_LOW, maxLow = Math.max(BASE_LOW, BASE_HIGH - view.oct * 12); if (dir < 0) {
    if (next < view.low && view.low > minLow) {
        view.low = Math.max(minLow, view.low - 12);
        buildKeyboard();
        repaintHeld();
    }
}
else if (dir > 0) {
    if (next + 12 > viewHigh() && view.low < maxLow) {
        view.low = Math.min(maxLow, view.low + 12);
        buildKeyboard();
        repaintHeld();
    }
} typeOctave = next; clampTypeOctave(); }
function physKey(e: KeyboardEvent) { return e.code || (/^[a-z]$/i.test(e.key || '') ? 'Key' + e.key.toUpperCase() : ''); } // some synthetic and virtual-keyboard events carry no code
// Name those physical keys as the user's layout prints them (Keyboard Map API, Chromium); elsewhere the QWERTY names stay.
function kbdLayoutLabels() {
    const kb = (navigator).keyboard;
    if (!kb || typeof kb.getLayoutMap !== 'function')
        return;
    try {
        kb.getLayoutMap().then((map) => queryAllHtml(document, 'kbd[data-codes]').forEach((el) => {
            const ks = (el.dataset.codes ?? '').split(' ').map((c) => map.get(c));
            if (ks.every((x) => typeof x === 'string' && x.trim()))
                el.textContent = ks.map((x) => String(x).toUpperCase()).join(el.dataset.sep || ' ');
        })).catch(() => { });
    }
    catch (_) { }
}
function releaseTypingKeys() { typingDown.forEach((m, k) => handleNoteOff(m, 'typing:' + k)); typingDown.clear(); }
function inField() { const a = document.activeElement; return a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || (a instanceof HTMLElement && a.isContentEditable)); }
document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') {
        releaseTypingKeys();
        return;
    }
    if (inField() || byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on') || e.repeat)
        return;
    const k = e.key.toLowerCase();
    if (e.key === '?') {
        e.preventDefault();
        openHelp(!byId('helpBox').classList.contains('on'));
        return;
    }
    if (rdKey(e, k))
        return;
    if (SES.active && SES.q) { // session shortcuts: digits pick an answer, R replays, N advances
        if (/^[1-9]$/.test(k) && !SES.answered && SES.q.mode === 'ear') {
            const b = byId('q-answers').children[+k - 1];
            if (b instanceof HTMLElement) {
                e.preventDefault();
                b.click();
                return;
            }
        }
        if (k === 'r' && !byId('q-replay').hidden) {
            e.preventDefault();
            byId('q-replay').click();
            return;
        }
        if (k === 'n' && !byId('q-next').hidden) {
            e.preventDefault();
            byId('q-next').click();
            return;
        }
    }
    if (view0() === 'analysis' && AN.notes.length && /^[lpmc]$/.test(k))
        return; // score shortcuts keep their letters wherever the layout puts them
    const c = physKey(e);
    if (c === 'KeyZ') {
        e.preventDefault();
        shiftTypeOctave(-1);
        return;
    }
    if (c === 'KeyX') {
        e.preventDefault();
        shiftTypeOctave(1);
        return;
    }
    if (c in KEYMAP) {
        const m = typeOctave + KEYMAP[c];
        if (!typingDown.has(c)) {
            e.preventDefault();
            typingDown.set(c, m);
            handleNoteOn(m, 100, 'typing:' + c);
        }
    }
});
document.addEventListener('keyup', (e) => { const c = physKey(e), m = typingDown.get(c); if (m !== undefined) {
    typingDown.delete(c);
    handleNoteOff(m, 'typing:' + c);
} });
/* ---------- GRADING CORE ---------- */
function chordTargetPcs(rootPc: number, tpl: theory.ChordTemplate|undefined) { if (!tpl)
    throw new Error('Étude: unknown chord template'); return chordPitches(rootPc, tpl.intervals); }
function inversionOf(rootPc: number, tpl: { symbol: string; idx?: number; pcset?: readonly number[] }, bassMidi: number) {
    const { idx, pcset } = tpl;
    if (idx === undefined || !pcset)
        return 0;
    return chordInversion(rootPc, { idx, symbol: tpl.symbol, pcset }, bassMidi);
}
function identifyChord(notes: readonly number[], expected?: number) { return identifyChordDomain(notes, CHORDS , expected); }
function slashLabel(id: { rootPc: number; chord: { symbol: string; }; inversion: number; bassPc: number; }) { return rootName(id.rootPc) + id.chord.symbol + (id.inversion > 0 ? '/' + rootName(id.bassPc) : ''); }
/* ============================================================================
   ITEM MODEL + SPACED REPETITION
   ============================================================================ */
const INTRO_IV = [7, 5, 4, 3, 12, 2, 9, 8, 11, 10, 1, 6];
const INTRO_CH = ['maj', 'm', 'dim', 'sus4', 'sus2', 'aug', 'maj7', '7', 'm7', '6', 'm6', 'm7♭5', 'dim7', 'mMaj7', 'add9', '9', 'maj9', 'm9', '7♯5', '7♭5', 'maj7♯11', '7♭9', '7♯9', '11', '13'];
const INTRO_SC = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic', 'Dorian', 'Mixolydian', 'Blues', 'Lydian', 'Phrygian', 'Harmonic minor', 'Melodic minor', 'Locrian', 'Harmonic major', 'Whole tone', 'Phrygian dominant', 'Hungarian minor', 'Diminished (W-H)', 'Diminished (H-W)', 'Chromatic'];
const CATS = { interval: { label: 'Intervals' }, chord: { label: 'Chords' }, scale: { label: 'Scales' }, prog: { label: 'Progressions' } };
interface TrainerItemBase { id: string; label: string; short: string; intro: number; }
interface IntervalTrainerItem extends TrainerItemBase { cat: 'interval'; semi: number; }
interface ChordTrainerItem extends TrainerItemBase { cat: 'chord'; ref: theory.ChordTemplate; }
interface ScaleTrainerItem extends TrainerItemBase { cat: 'scale'; name: string; }
interface ProgTrainerItem extends TrainerItemBase { cat: 'prog'; ref: theory.ProgressionTemplate; }
type TrainerItem = IntervalTrainerItem | ChordTrainerItem | ScaleTrainerItem | ProgTrainerItem;
const ITEMS: TrainerItem[] = [];
const ITEM_BY_ID: Record<string, TrainerItem> = {};
INTRO_IV.forEach((semi, i) => { const iv = INTERVALS.find((x) => x.semi === semi); if (!iv)
    return; ITEMS.push({ id: 'iv:' + semi, cat: 'interval', semi, label: iv.name, short: iv.short, intro: i }); });
INTRO_CH.forEach((sym, i) => { const c = CHORDS.find((x) => x.symbol === sym); if (c)
    ITEMS.push({ id: 'ch:' + sym, cat: 'chord', ref: c, label: c.name, short: sym, intro: 100 + i }); });
INTRO_SC.forEach((nm, i) => { if (SCALES[nm])
    ITEMS.push({ id: 'sc:' + nm, cat: 'scale', name: nm, label: nm, short: nm, intro: 200 + i }); });
PROGS.forEach((p, i) => { ITEMS.push({ id: 'pr:' + p.name, cat: 'prog', ref: p, label: p.name, short: p.name, intro: 300 + i }); });
ITEMS.forEach((it) => ITEM_BY_ID[it.id] = it);
interface StoredSrsEntry { box: number; ease: number; due: number; reps: number; lapses: number; last: number; }
type StoredTrainerSettings = Omit<storage.AppSettings, 'earKeys'> & { earKeys?: boolean; };
interface StoredSheetRecord { best?: number; learned?: boolean; }
interface StoredLastDrill { cat: string; mode: string; keys: boolean; key: string; c: number; n: number; day: number; }
interface StoredLessonReview { last: number; n: number; best?: number; rv?: number; }
type StoredTrainerData = {
    srs: Record<string, StoredSrsEntry>;
    streak: number;
    bestStreak: number;
    lastActive: number;
    todayDay: number;
    todayCount: number;
    newToday: number;
    totalReviews: number;
    totalCorrect: number;
    placed: boolean;
    history: Record<string, number>;
    singCleared: Record<string, boolean>;
    sheet: Record<string, StoredSheetRecord>;
    settings: StoredTrainerSettings;
    lastTool?: string;
    toolDay?: Record<string, number>;
    earDay?: number;
    earToday?: number;
    lastDrill?: StoredLastDrill;
    learnDone?: Record<string, number>;
    learnRev?: Record<string, StoredLessonReview>;
    learnUnlock?: Record<string, number>;
    learnSel?: number;
    learnSelId?: string;
    reading?: Partial<ReadDrillData>;
};
function freshData(): StoredTrainerData { return { srs: {}, streak: 0, bestStreak: 0, lastActive: 0, todayDay: 0, todayCount: 0, newToday: 0, totalReviews: 0, totalCorrect: 0, placed: false, history: {}, singCleared: {}, sheet: {}, settings: { goal: 12, newPerDay: 5, allowInv: false, metronome: false, drone: false } }; }
let data = freshData();
function currentStreak() { return (data.lastActive >= todayN() - 1) ? (data.streak || 0) : 0; } // a missed day shows as 0, not the stale count
function srsOf(id: string|number) { return data.srs[id] || (data.srs[id] = { box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 }); }
const IVL = [0, 1, 2, 4, 9, 21, 45, 90];
function reviewItem(id: string, correct: boolean) {
    const it = srsOf(id);
    it.reps++;
    if (correct) {
        it.box = Math.min(7, it.box + 1);
        it.ease = Math.min(2.9, it.ease + .05);
    }
    else {
        it.box = 1;
        it.lapses++;
        it.ease = Math.max(1.6, it.ease - .2);
    }
    const days = IVL[it.box] !== undefined ? IVL[it.box] : 120;
    it.due = todayN() + Math.max(0, Math.round(days * (it.ease / 2.3)));
    it.last = todayN();
    data.totalReviews++;
    if (correct)
        data.totalCorrect++;
    touchDay();
    if (it.reps === 1)
        data.newToday = (data.newToday || 0) + 1; // count fresh concepts against the daily quota
    saveAll();
}
function touchDay() {
    const t = todayN();
    if (data.todayDay !== t) {
        if (data.lastActive === t - 1)
            data.streak++;
        else
            data.streak = 1;
        data.todayDay = t;
        data.todayCount = 0;
        data.newToday = 0;
        data.lastActive = t;
    }
    data.todayCount++;
    data.bestStreak = Math.max(data.bestStreak || 0, data.streak || 0);
    const h = data.history || (data.history = {});
    h[t] = (h[t] || 0) + 1;
    const keys = Object.keys(h);
    if (keys.length > 400)
        keys.sort((a, b) => Number(a) - Number(b)).slice(0, keys.length - 400).forEach((k) => delete h[k]);
}
function seedPlacement(id: string, known: boolean) { if (known) {
    const it = srsOf(id);
    it.box = 4;
    it.ease = 2.4;
    it.reps = 1;
    it.lapses = 0;
    it.due = todayN() + Math.round(IVL[4] * (it.ease / 2.3));
    it.last = todayN();
} data.totalReviews++; if (known)
    data.totalCorrect++; touchDay(); saveAll(); }
const SCALE_EAR_POOL = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian', 'Major pentatonic', 'Minor pentatonic', 'Blues', 'Harmonic minor', 'Whole tone'];
function scaleEarOptions(correct: string) { let pool = SCALE_EAR_POOL.filter((n) => n !== correct); pool = shuffle(pool).slice(0, 6); pool.push(correct); return shuffle(pool); }
function chordEarOptions(correctItem: ChordTrainerItem) {
    const others = ITEMS.filter((x): x is ChordTrainerItem => x.cat === 'chord' && x.short !== correctItem.short);
    const same = shuffle(others.filter((x) => x.ref.pcset.length === correctItem.ref.pcset.length));
    const rest = shuffle(others.filter((x) => x.ref.pcset.length !== correctItem.ref.pcset.length));
    return shuffle(same.concat(rest).slice(0, 7).concat([correctItem]));
}
const PLACEMENT = ['iv:7', 'iv:5', 'iv:4', 'iv:3', 'iv:12', 'ch:maj', 'ch:m', 'ch:maj7', 'ch:7', 'sc:Major (Ionian)', 'sc:Aeolian (Natural minor)', 'pr:I–IV–V'];
function boxOf(id: string|number) { return data.srs[id] ? data.srs[id].box : 0; }
function isDue(id: string|number) { const s = data.srs[id]; return s && s.reps > 0 && s.due <= todayN(); }
function isNew(id: string|number) { const s = data.srs[id]; return !s || s.reps === 0; }
function dueItems() { return ITEMS.filter((it) => isDue(it.id)).sort((a, b) => data.srs[a.id].due - data.srs[b.id].due); }
function newItemsAvail() { return ITEMS.filter((it) => isNew(it.id)).sort((a, b) => a.intro - b.intro); }
// New concepts still allowed today: the daily quota minus those already introduced today (across sessions).
function newQuotaLeft() { const introduced = data.todayDay === todayN() ? (data.newToday || 0) : 0; return Math.max(0, data.settings.newPerDay - introduced); }
function masteredCount() { return ITEMS.filter((it) => boxOf(it.id) >= 4).length; }
/* ============================================================================
   SESSION ENGINE  (interleaved, adaptive, with feedback + elaboration)
   ============================================================================ */
interface EarKeysNote { m: number; t: number; }
type EarKeysPrompt = { kind: 'iv'; target: number[]; n: number; } | { kind: 'ch'; target: number[]; inv: number; pcs: number[]; n: number; } | { kind: 'mel'; target: number[]; n: number; };
type EarKeysState = EarKeysPrompt & { tries: number; seq: EarKeysNote[]; off: number; armAt: number; goT: ReturnType<typeof setTimeout> | number; won: boolean; warned: boolean; played?: number[]; };
interface TrainerQuestion { it: TrainerItem; mode: string; key: number; idx: number; anchor: number | null; missed: boolean; hinted: boolean; offs?: number[]; ek?: EarKeysState | null; }
interface TrainerSessionTarget { cat: string; mode: string; key: string; }
interface TrainerSessionState { active: boolean; queue: (TrainerQuestion | undefined)[]; idx: number; correct: number; total: number; q: TrainerQuestion | null; answered: boolean; targeted: TrainerSessionTarget | null; placement: boolean; promptT: ReturnType<typeof setTimeout> | 0; }
const SES: TrainerSessionState = { active: false, queue: [], idx: 0, correct: 0, total: 0, q: null, answered: false, targeted: null, placement: false, promptT: 0 };
function sesStopPrompt() { clearTimeout(SES.promptT); SES.promptT = 0; }
function sesPrompt(q: TrainerQuestion, play: () => void) { sesStopPrompt(); SES.promptT = setTimeout(() => { SES.promptT = 0; if (SES.active && SES.q === q && !SES.answered)
    play(); }, 250); }
function buildQueue() {
    const goal = data.settings.goal;
    const due = dueItems();
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
    if (pool.length < goal && ITEMS.filter((it) => !isNew(it.id)).length < goal) { // early days only: introduce extra new concepts so the session feels substantial
        for (const m of newItemsAvail()) {
            if (pool.length >= goal)
                break;
            if (!pool.includes(m))
                pool.push(m);
        }
    }
    if (!pool.length)
        pool = shuffle(ITEMS).slice(0, goal);
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
    return { it, mode, key, idx: 0, anchor: null, missed: false, hinted: false };
}
function startSession(targeted: TrainerSessionTarget|null) {
    ensureAudio();
    sesStopPrompt();
    SES.targeted = targeted || null;
    SES.placement = false;
    SES.queue = targeted ? Array.from({ length: 9999 }) : buildQueue(); // targeted = endless
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
    SES.targeted = null;
    SES.placement = true;
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
    reflowKeys();
    requestAnimationFrame(() => { if (SES.active)
        ses.scrollIntoView({ block: 'start', behavior: 'instant' }); });
}
function endSession(toSummary: boolean) {
    const wasPlacement = SES.placement;
    if (wasPlacement) {
        data.placed = true;
        saveAll();
    }
    sesStopPrompt();
    ekStop(SES.q);
    SES.active = false;
    SES.placement = false;
    byId('session').style.display = 'none';
    byId('session').classList.remove('on');
    kbClearAll();
    held.forEach((m) => audioNoteOff(m));
    held.clear();
    heldOrder.length = 0;
    stopMetro();
    stopDrone();
    if (SES.targeted) {
        prRecordDrill();
        byId('pr-home').style.display = '';
        renderPracticeLast();
        if (toSummary)
            byId('pr-start').focus();
        return;
    }
    if (toSummary)
        showSummary(wasPlacement);
    else {
        byId('today-home').style.display = 'block';
        refreshToday();
    }
}
function nextQuestion() {
    if (!SES.targeted && SES.idx >= SES.queue.length) {
        endSession(true);
        return;
    }
    sesStopPrompt();
    ekStop(SES.q);
    kbClearAll();
    SES.answered = false;
    const q = SES.targeted ? makeQuestion(pickTargetedItem()) : SES.queue[SES.idx];
    if (!q)
        return;
    SES.q = q;
    byId('ses-progress').style.width = SES.targeted ? '0%' : (100 * SES.idx / SES.queue.length) + '%';
    byId('ses-count').textContent = SES.targeted ? ('#' + (SES.total + 1) + (SES.total ? ' · ' + SES.correct + '/' + SES.total + ' ✓' : '')) : ((SES.idx + 1) + '/' + SES.queue.length);
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
function pickTargetedItem() {
    if (!SES.targeted)
        throw new Error('Étude: no targeted drill');
    const c = SES.targeted.cat;
    const pool = c === 'melody' ? ITEMS.filter((it) => it.cat === 'scale' && EK_MEL_SCALES.includes(it.name)) : ITEMS.filter((it) => it.cat === c); // weakness-weighted
    const w = pool.map((it) => { const s = data.srs[it.id] || { box: 0 }; return 1 / (1 + s.box); });
    let tot = w.reduce((a, b) => a + b, 0), r = Math.random() * tot;
    for (let i = 0; i < pool.length; i++) {
        r -= w[i];
        if (r <= 0)
            return pool[i];
    }
    return pool[0];
}
function presentQuestion(q: TrainerQuestion) {
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
}
function earRoot(q: { key: number; }) { return 57 + (q.key % 12 <= 5 ? q.key : q.key - 12) + 5; } // mid register, kept playable
function presentPlay(q: TrainerQuestion) {
    const it = q.it;
    if (it.cat === 'interval') {
        byId('q-prompt').innerHTML = ivName(it.semi) + ' <span class="sub">' + t('above') + ' ' + rootName(q.key) + '</span>';
    }
    else if (it.cat === 'chord') {
        byId('q-prompt').innerHTML = rootName(q.key) + dispSym(it.short) + ' <span class="sub">' + chordDisp(it.ref) + '</span>';
    }
    else if (it.cat === 'scale') {
        q.offs = SCALES[it.name].concat([12]);
        q.anchor = null;
        q.idx = 0;
        byId('q-prompt').innerHTML = rootName(q.key) + ' ' + scaleDisp(it.name) + ' <span class="sub">' + t('ascending') + '</span>';
        if (data.settings.metronome)
            startMetro();
        if (data.settings.drone)
            startDrone(q.key);
    }
    else if (it.cat === 'prog') {
        q.idx = 0;
        const chain = it.ref.chords.map((ch) => rootName((q.key + ch[0]) % 12) + dispSym(ch[1])).join('  ·  ');
        byId('q-prompt').innerHTML = it.ref.name + ' <span class="sub">' + t('in_key') + ' ' + rootName(q.key) + '</span>';
        byId('q-verdict').className = 'verdict neutral';
        byId('q-verdict').textContent = chain;
        showProgTarget(q);
    }
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
    let opts: { k: number | string; t: string; }[] = [];
    if (it.cat === 'interval') {
        opts = INTERVALS.map((iv) => ({ k: iv.semi, t: iv.short + ' · ' + ivName(iv.semi) }));
        sesPrompt(q, () => playInterval(earRoot(q), it.semi, 'both'));
    }
    else if (it.cat === 'chord') {
        opts = chordEarOptions(it).map((x) => ({ k: x.short, t: x.short + ' · ' + chordDisp(x.ref) }));
        sesPrompt(q, () => playChordMidis(it.ref.intervals.map((i) => 57 + q.key + i), true));
    }
    else if (it.cat === 'scale') {
        opts = scaleEarOptions(it.name).map((nm: string) => ({ k: nm, t: scaleDisp(nm) }));
        sesPrompt(q, () => playScaleNotes(60 + q.key, SCALES[it.name], true));
    }
    else if (it.cat === 'prog') {
        opts = PROGS.map((p) => ({ k: p.name, t: p.name }));
        sesPrompt(q, () => playProg(q.key, it.ref));
    }
    opts.forEach((o) => { const b = (document).createElement('button'); b.className = 'chip'; b.dataset.k = String(o.k); b.textContent = o.t; b.onclick = () => answerEar(q, o.k, b); box.appendChild(b); });
}
function playProg(rootPc: number, prog: theory.ProgressionTemplate) { ensureAudio(); stopPreviews(); if (!actx)
    return; const t = actx.currentTime; prog.chords.forEach((ch, i: number) => { const root = 60 + ((rootPc + ch[0]) % 12), tpl = progChordTpl(ch[1]); if (!tpl)
    return; tpl.intervals.forEach((iv) => previewNote(root + iv, t + i * .9, .8)); }); }
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
        playInterval(earRoot(q), it.semi, 'both');
    else if (it.cat === 'chord')
        playChordMidis(it.ref.intervals.map((i) => 57 + q.key + i), true);
    else if (it.cat === 'scale')
        playScaleNotes(60 + q.key, SCALES[it.name], true);
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
const EK_CHORD_GAP = 300; // ms: a key joins the chord if another chord key is still down or it lands this close to the previous one
function ekForced() { return !!(SES.targeted && SES.targeted.cat === 'melody'); }
function ekWanted(q: TrainerQuestion | null) { return !!q && q.mode === 'ear' && !SES.placement && q.it.cat !== 'prog' && (ekForced() || !!data.settings.earKeys); }
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
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.v === 'keys') === !!data.settings.earKeys ? 'true' : 'false'));
}
function ekUiReset() { byId('q-ekhint').textContent = ''; byId('q-ekprog').innerHTML = ''; byId('q-ekreset').hidden = true; }
function ekStop(q: TrainerQuestion | null) { if (q && q.ek)
    clearTimeout(q.ek.goT); }
function ekBuild(q: TrainerQuestion): EarKeysPrompt {
    const it = q.it;
    if (it.cat === 'interval') {
        const r = earRoot(q);
        return { kind: 'iv', target: [r, r + it.semi], n: 2 };
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
    const offs = SCALES[it.name], N = offs.length, ton = 60 + (q.key <= 5 ? q.key : q.key - 12), len = 3 + Math.floor(Math.random() * 3);
    const at = (d: number) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N), stable = (d: number) => [0, 3, 4, 7].includes(pc(at(d) - ton));
    let d = 0;
    const ds = [0];
    for (let i = 1; i < len; i++) {
        const last = i === len - 1, opts: number[] = [];
        [-2, -1, 1, 2].forEach((s) => { const nd = d + s; if (nd < -2 || nd > N + 2 || (last && !stable(nd)))
            return; opts.push(nd); if (Math.abs(s) === 1)
            opts.push(nd, nd); });
        if (!opts.length)
            opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
        d = randItem(opts);
        ds.push(d);
    }
    const target = ds.map(at);
    return { kind: 'mel', target, n: target.length };
}
function presentEarKeys(q: TrainerQuestion) {
    const it = q.it, ek = q.ek = Object.assign(ekBuild(q), { tries: 0, seq: [], off: 0, armAt: Infinity, goT: 0, won: false, warned: false });
    byId('q-answers').hidden = true;
    byId('q-answers').innerHTML = '';
    const st = ekName(q, ek.target[0]), sub = ek.kind === 'iv' ? t('ek_sub_start', st) : ek.kind === 'ch' ? t('ek_sub_bass', st, ek.n) : t('ek_sub_mel', rootName(q.key) + ' ' + scaleDisp(it.cat === 'scale' ? it.name : ''), ek.n);
    byId('q-prompt').innerHTML = t('ek_p_' + ek.kind) + ' <span class="sub">' + sub + '</span>';
    if (ek.kind === 'mel')
        byId('q-cat').textContent = t('ek_cat_mel');
    byId('q-ekhint').textContent = t('ek_hint_' + ek.kind);
    byId('q-ekreset').hidden = false;
    ekProg(q, 0);
    ekPlay(q);
}
// Plays the prompt and returns when (seconds after now) its last note starts.
function ekSound(q: TrainerQuestion) {
    const ek = q.ek;
    ensureAudio();
    if (!actx)
        return 0;
    stopPreviews();
    if (!ek)
        return 0;
    const t0 = actx.currentTime + .25, ms = ek.target;
    let last: number;
    if (ek.kind === 'iv') {
        previewNote(ms[0], t0, .45);
        previewNote(ms[1], t0 + .5, .45);
        previewNote(ms[0], t0 + 1.15, .8);
        previewNote(ms[1], t0 + 1.15, .8);
        last = 1.15;
    }
    else if (ek.kind === 'ch') {
        ms.forEach((m, i: number) => previewNote(m, t0 + i * .16, .4));
        const bt = ms.length * .16 + .1;
        ms.forEach((m) => previewNote(m, t0 + bt, 1.1));
        previewNote(ms[0], t0 + bt + 1.35, .6);
        last = bt + 1.35;
    }
    else {
        previewNote(ms[0], t0, .5);
        ms.forEach((m, i: number) => previewNote(m, t0 + .85 + i * .5, .45));
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
    neutral(t('ek_listen'));
    ek.goT = setTimeout(() => { if (SES.q === q && !SES.answered && !ek.seq.length)
        neutral(t('ek_go')); }, wait);
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
            neutral(t('ek_wait'));
        }
        return;
    }
    if (ek.kind === 'mel') {
        ekMel(q, m);
        return;
    }
    if (ek.kind === 'ch') {
        const prev = ek.seq[ek.seq.length - 1];
        if (prev && !ek.seq.some((x) => held.has(x.m) && x.m !== m) && now - prev.t > EK_CHORD_GAP)
            ek.seq = [];
    }
    ek.seq.push({ m, t: now });
    scheduleEval(() => ek.kind === 'iv' ? ekIv(q) : ekCh(q), ek.kind === 'iv' ? 90 : 140);
}
function ekOff(q: TrainerQuestion, m: number) { const ek = q.ek; if (!ek || SES.answered || ek.kind !== 'ch' || !ek.seq.length)
    return; scheduleEval(() => ekCh(q), 140); }
function ekIv(q: TrainerQuestion) {
    const ek = q.ek;
    if (!ek || SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const s = ek.seq, start = ek.target[0], semi = ek.target[1] - start;
    let a = s[0], b = s[1];
    if (b && Math.abs(b.t - a.t) <= 80 && b.m < a.m) {
        const x = a;
        a = b;
        b = x;
    } // struck together: the lower note is the start
    if (pc(a.m) !== pc(start)) {
        ekFlash([a.m], 'bad');
        setTimeout(() => { kbClear('bad'); if (SES.q === q && !SES.answered)
            kbState(start, 'target', true); }, 420);
        ek.seq = [];
        ekProg(q, 0);
        neutral(t('ek_start_on', ekName(q, start)));
        return;
    }
    if (!b) {
        ekProg(q, 1);
        neutral(t('ek_progress', 1, 2));
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
    ekMiss(q, [b.m], b.m < a.m ? t('ek_wrong_down') : t('ek_wrong_iv', intervalLabel(b.m - a.m)));
}
function ekCh(q: TrainerQuestion) {
    const ek = q.ek;
    if (!ek || ek.kind !== 'ch' || SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const ms = [...new Set(ek.seq.map((x) => x.m))].sort((a, b) => a - b);
    const pcs = [...new Set(ms.map((m) => pc(m)))].sort((a, b) => a - b);
    const down = ms.some((m) => held.has(m));
    if (setEq(pcs, ek.pcs)) {
        if (pc(ms[0]) === pc(ek.target[0]))
            ekWin(q, ms);
        else
            ekMiss(q, [ms[0]], t('ek_wrong_inv', ekName(q, ek.target[0])));
        return;
    }
    if (!isSubset(pcs, ek.pcs)) {
        ekMiss(q, ms.filter((m) => !ek.pcs.includes(pc(m))), t('ek_wrong_ch'));
        return;
    }
    ekProg(q, pcs.length);
    if (down)
        neutral(t('ek_keep', pcs.length, ek.n));
    else {
        ek.seq = [];
        ekProg(q, 0);
        neutral(t('ek_hold'));
    }
}
function ekMel(q: TrainerQuestion, m: number) {
    const ek = q.ek;
    if (!ek)
        return;
    const tg = ek.target, i = ek.seq.length;
    if (i === 0) {
        if (pc(m) !== pc(tg[0])) {
            ekFlash([m], 'bad');
            setTimeout(() => { kbClear('bad'); if (SES.q === q && !SES.answered)
                kbState(tg[0], 'target', true); }, 420);
            neutral(t('ek_start_on', ekName(q, tg[0])));
            return;
        }
        ek.off = m - tg[0];
    }
    const want = tg[i] + ek.off;
    if (m !== want) {
        ekMiss(q, [m], t('ek_wrong_mel', i + 1, t(m > want ? 'ek_high' : 'ek_low')));
        return;
    }
    ek.seq.push({ m, t: performance.now() });
    kbState(m, 'good', true);
    ekProg(q, ek.seq.length);
    if (ek.seq.length >= tg.length)
        ekWin(q, ek.seq.map((x) => x.m));
    else
        neutral(t('ek_progress', ek.seq.length, tg.length));
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
    setTimeout(() => { kbClear('bad'); if (SES.q === q && !SES.answered)
        kbState(ek.target[0], 'target', true); }, 500);
    ekProg(q, 0);
    const v = byId('q-verdict');
    v.className = 'verdict bad';
    v.textContent = msg + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
}
function ekReset() { const q = SES.q; if (!q || !q.ek || SES.answered)
    return; q.ek.seq = []; kbClear('good'); kbClear('bad'); kbState(q.ek.target[0], 'target', true); ekProg(q, 0); neutral(t('ek_reset_msg')); }
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
        gradeScaleNote(q, [...held].pop());
    else if (q.it.cat === 'prog')
        gradeProgChord(q);
}
function gradeInterval(q: TrainerQuestion) {
    if (SES.answered || q.it.cat !== 'interval')
        return;
    const ms = heldMidis().sort((a, b) => a - b);
    if (ms.length < 2)
        return;
    if (ms.length > 2) {
        neutral(t('just_two'));
        return;
    }
    const lo = ms[0], hi = ms[1];
    if (pc(lo) === q.key && hi - lo === q.it.semi) {
        [lo, hi].forEach((m) => kbState(m, 'good', true));
        resolve(q, true);
    }
    else {
        [lo, hi].forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 500);
        q.missed = true;
        resolve(q, false);
    }
}
function gradeChord(q: TrainerQuestion) {
    if (SES.answered || q.it.cat !== 'chord')
        return;
    const hp = heldPcs(), tpl = q.it.ref, target = chordTargetPcs(q.key, tpl);
    if (!hp.length)
        return;
    if (setEq(hp, target)) {
        const inv = inversionOf(q.key, tpl, Math.min(...heldMidis()));
        if (!data.settings.allowInv && inv !== 0) {
            neutral(t('root_pos', rootName(q.key)));
            return;
        }
        heldMidis().forEach((m) => kbState(m, 'good', true));
        resolve(q, true);
        return;
    }
    if (isSubset(hp, target)) {
        neutral(t('keep_building') + ' (' + hp.length + '/' + target.length + ')');
        return;
    }
    if (isSubset(target, hp)) {
        neutral(t('release_extra'));
        return;
    }
    if (hp.length >= target.length) {
        heldMidis().forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 500);
        q.missed = true;
        resolve(q, false);
    }
}
function gradeScaleNote(q: TrainerQuestion, midi: number | null | undefined) {
    if (SES.answered || midi == null || !q.offs)
        return;
    if (q.idx === 0) {
        if (pc(midi) !== q.key) {
            kbState(midi, 'bad', true);
            setTimeout(() => kbClear('bad'), 400);
            neutral(t('start_on', rootName(q.key)));
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
            neutral(q.idx + ' / ' + q.offs.length + ' ✓');
    }
    else {
        kbState(midi, 'bad', true);
        setTimeout(() => kbClear('bad'), 420);
        q.missed = true;
        resolve(q, false);
    }
}
function gradeProgChord(q: TrainerQuestion) {
    if (SES.answered || q.it.cat !== 'prog')
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
            neutral('✓ — next chord');
            setTimeout(() => showProgTarget(q), 250);
        }
        return;
    }
    if (isSubset(hp, target) || isSubset(target, hp))
        return;
    if (hp.length >= target.length) {
        heldMidis().forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 420);
        q.missed = true;
        resolve(q, false);
    }
}
function neutral(msg: string|null) { const v = byId('q-verdict'); v.className = 'verdict neutral'; v.textContent = msg; }
function resolve(q: TrainerQuestion, correct: boolean) {
    if (SES.answered)
        return;
    SES.answered = true;
    stopMetro();
    stopDrone();
    const good = correct && !q.missed;
    if (SES.placement)
        seedPlacement(q.it.id, good);
    else if (!SES.targeted)
        reviewItem(q.it.id, good); // targeted drills are free practice: no schedule, daily-goal or streak change
    SES.total++;
    if (good)
        SES.correct++;
    const v = byId('q-verdict');
    if (correct && !q.missed) {
        v.className = 'verdict good';
        v.textContent = randItem([t('correct1'), t('correct2'), t('correct3'), t('correct4')]);
    }
    else if (correct && q.ek) {
        v.className = 'verdict neutral';
        v.textContent = t('ek_retry_ok', q.ek.tries + 1);
    } // reproduced after a miss: counts as a lapse
    else {
        v.className = 'verdict bad';
        v.textContent = t('notquite');
    }
    if (q.ek) {
        ekStop(q);
        byId('q-ekreset').hidden = true;
    }
    revealAnswerKeys(q);
    showElaboration(q);
    if (!good) {
        setTimeout(() => { if (SES.active && SES.q === q && SES.answered)
            playQuestionSound(q); }, 600);
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
        const r = 60 + q.key;
        [r, r + it.semi].forEach((m) => kbState(m, 'target', true));
    }
    else if (it.cat === 'chord') {
        const r = 60 + q.key;
        it.ref.intervals.forEach((i) => kbState(r + i, 'target', true));
    }
    else if (it.cat === 'scale') {
        const r = 60 + q.key;
        SCALES[it.name].concat([12]).forEach((o) => kbState(r + o, 'target', true));
    }
}
function showElaboration(q: TrainerQuestion) {
    const it = q.it, e = byId('q-elab');
    let html = '';
    if (it.cat === 'interval') {
        const s = songsFor(it.semi, 'asc');
        html = '<b>' + ivName(it.semi) + '</b> = ' + it.semi + ' ' + t('el_semitones') + (s.length && !/^\(/.test(s[0]) ? ' · ' + t('el_soundslike') + ' “' + s[0] + '”' : '');
    }
    else if (it.cat === 'chord') {
        const f = feelDisp(it.short);
        html = '<b>' + rootName(q.key) + dispSym(it.short) + '</b> = ' + chordFormula(it.ref) + (f ? ' · ' + f : '');
    }
    else if (it.cat === 'scale') {
        html = '<b>' + scaleDisp(it.name) + '</b> · ' + t('el_degrees') + ' ' + scaleFormula(SCALES[it.name]);
    }
    else if (it.cat === 'prog') {
        const chain = it.ref.chords.map((ch) => rootName((q.key + ch[0]) % 12) + dispSym(ch[1])).join(' · '), rom = it.ref.chords.map((ch) => ch[2]).join(' · ');
        html = '<b>' + rom + '</b> — ' + chain;
    }
    if (q.ek)
        html += '<br>' + ekElab(q);
    e.innerHTML = html;
    e.classList.add('show');
}
/* ============================================================================
   VIEWS / ROUTER
   ============================================================================ */
let _view = 'today';
function view0() { return _view; }
const _modalStack: string[] = [];
let _modalBackPending = false, _modalAfterBack: string | null = null;
function historyModalOf(state: unknown): unknown {
    return state && typeof state === 'object' && 'modal' in state ? state.modal : undefined;
}
function pushModalState(id: string) {
    if (_modalBackPending) {
        _modalAfterBack = id;
        _modalStack.length = 0;
        _modalStack.push(id);
        return;
    }
    // Opening an overlay from the mobile menu replaces that temporary menu entry.
    if (id !== 'menu' && historyModalOf(history.state) === 'menu' && !byId('mobileMenu').hidden) {
        closeMobileMenu(false, true);
        _modalStack.length = 0;
        try {
            history.replaceState({ modal: id }, '', location.href);
            _modalStack.push(id);
        }
        catch (_) { }
        return;
    }
    if (!_modalStack.includes(id)) {
        _modalStack.push(id);
        try {
            history.pushState({ modal: id }, '', location.href);
        }
        catch (_) { }
    }
}
function popModalState(id: string) {
    const idx = _modalStack.indexOf(id);
    if (idx !== -1) {
        _modalStack.splice(idx, 1);
        if (_modalBackPending && _modalAfterBack === id) {
            _modalAfterBack = null;
            return;
        }
        if (historyModalOf(history.state) === id) {
            try {
                _modalBackPending = true;
                history.back();
            }
            catch (_) {
                _modalBackPending = false;
            }
        }
    }
}
function closeMobileMenu(returnFocus = false, fromPop = false) {
    const menu = byId('mobileMenu');
    if (!menu || menu.hidden)
        return false;
    menu.hidden = true;
    byId('menuBtn').setAttribute('aria-expanded', 'false');
    if (!fromPop)
        popModalState('menu');
    if (returnFocus)
        byId('menuBtn').focus();
    return true;
}
function openMobileMenu(fromPop = false) {
    const mm = byId('mobileMenu');
    if (!fromPop)
        pushModalState('menu');
    mm.innerHTML = '';
    queryAllHtml(document, '#nav button').forEach((b) => { const x = (document).createElement('button'); x.textContent = b.textContent; x.dataset.view = b.dataset.view; x.setAttribute('aria-current', b.getAttribute('aria-current') || 'false'); x.addEventListener('click', () => show(x.dataset.view)); mm.appendChild(x); });
    mm.hidden = false;
    byId('menuBtn').setAttribute('aria-expanded', 'true');
    const first = queryHtml(mm, '[aria-current="page"]') || mm.querySelector('button');
    first?.focus();
}
function renderModeNav() {
    const group = navGroup(view0()), views: readonly string[] = group ? NAV_GROUPS[group] : [];
    byId('modeBar').hidden = views.length < 2;
    byId('modeNav').innerHTML = views.map((v: string) => `<button type="button" data-view="${v}" aria-current="${v === view0() ? 'page' : 'false'}">${t(v === 'practice' ? 'nav_drills' : 'nav_' + v)}</button>`).join('');
}
function focusView(v: string) {
    const view = byId('view-' + v);
    const target = queryAllHtml(view, 'h1,h2').find((el) => el.getClientRects().length) || view;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
}
let show = function show(v: string|undefined, moveFocus = true) {
    if (v === undefined || !isAppView(v))
        return;
    viewState.view = v;
    const prev = _view;
    if (location.hash.slice(1) !== v) {
        const viaModal = _modalStack.length > 0;
        _modalStack.length = 0; // the modal's history entry becomes the new view's entry
        try {
            history[(_routed && !viaModal) ? 'pushState' : 'replaceState'](null, '', '#' + v);
        }
        catch (_) { }
    }
    _routed = true;
    if (v !== 'today') {
        data.lastTool = v;
        const tv = data.toolDay || (data.toolDay = {});
        tv[v] = todayN();
        saveSoon();
    }
    if (prev === 'analysis' && v !== prev) {
        scoreStop();
        anKeysClear();
        anSheet(false, true);
    }
    if (prev !== v) {
        releaseLiveInput();
        stopPreviews();
        kbClear('target');
        kbDegrees(null);
    }
    _view = v;
    if (prev === 'accompany' && v !== 'accompany')
        accompStop();
    if (prev === 'transcribe' && v !== 'transcribe')
        trxStop();
    if (prev === 'sing' && v !== 'sing')
        singStopAll();
    if (prev === 'read' && v !== 'read') {
        srStopAll();
        rdAbort();
    }
    (document).querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    queryAllHtml(document, '#nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === navGroup(v) ? 'page' : 'false'));
    dockSync();
    if (dockShown())
        reflowKeys(); // reposition once the dock is laid out
    closeMobileMenu();
    if (SES.active && v !== sesHome()) { /* leaving mid-session */
        endSession(false);
    }
    if (v === 'today' && !SES.active) {
        byId('today-home').style.display = 'block';
        byId('summary').style.display = 'none';
        refreshToday();
    }
    if (v === 'explore') {
        updateExplore();
        cofPaintDock();
    }
    if (v === 'analysis')
        anDraw();
    if (v === 'learn')
        renderLearn();
    if (v === 'read')
        renderRead();
    if (v === 'songs')
        renderSongs();
    if (v === 'progress')
        renderProgress();
    if (v === 'accompany')
        renderAccompany();
    if (v === 'transcribe')
        renderTranscribe();
    if (v === 'sing')
        renderSing();
    if (v === 'practice' && !SES.active) {
        stopMetro();
        renderPracticeLast();
    }
    renderModeNav();
    syncIdle(); // a language/notation/label choice another tab made while this one was busy
    const active = document.activeElement;
    if (moveFocus && (!active || active === document.body || !active.isConnected || !active.getClientRects().length))
        focusView(v);
};
let _routed = false;
window.addEventListener('popstate', (e) => {
    // The destination history entry, not the previously visible overlay, determines the UI.
    if (_modalBackPending) {
        _modalBackPending = false;
        const next = _modalAfterBack;
        _modalAfterBack = null;
        if (next) {
            _modalStack.length = 0;
            try {
                history.pushState({ modal: next }, '', location.href);
                _modalStack.push(next);
            }
            catch (_) { }
            return;
        }
    }
    const modal = historyModalOf(e.state);
    _modalStack.length = 0;
    if (modal === 'menu' || modal === 'help' || modal === 'drawer')
        _modalStack.push(modal);
    if (modal !== 'menu') {
        const menu = byId('mobileMenu'), returnFocus = !modal && menu.contains(document.activeElement) && location.hash.slice(1) === _view;
        closeMobileMenu(returnFocus, true);
    }
    if (modal !== 'help' && byId('helpBox').classList.contains('on'))
        openHelp(false, true);
    if (modal !== 'drawer' && byId('drawer').classList.contains('on'))
        openDrawer(false, true);
    const v = location.hash.slice(1);
    if (navGroup(v) && v !== _view) {
        _routed = false;
        show(v);
    }
    if (modal === 'menu' && getComputedStyle(byId('menuBtn')).display !== 'none' && byId('mobileMenu').hidden)
        openMobileMenu(true);
    if (modal === 'help' && !byId('helpBox').classList.contains('on'))
        openHelp(true, true);
    if (modal === 'drawer' && !byId('drawer').classList.contains('on'))
        openDrawer(true, true);
});
/* ---------- TODAY ---------- */
function greeting() { const h = new Date().getHours(); return h < 5 ? t('g_late') : h < 12 ? t('g_morning') : h < 18 ? t('g_afternoon') : t('g_evening'); }
function refreshToday() {
    const gr = greeting();
    byId('greet-title').textContent = /[.?!…]$/.test(gr) ? gr : gr + '.';
    const tn = todayN();
    byId('streakN').textContent = String(currentStreak());
    const goal = data.settings.goal, done = Math.min(data.todayDay === tn ? data.todayCount : 0, goal);
    const gd = byId('goaldots');
    gd.innerHTML = '';
    const dots = 5;
    for (let i = 0; i < dots; i++) {
        const x = (document).createElement('i');
        if (i < Math.round(dots * done / goal))
            x.className = 'on';
        gd.appendChild(x);
    }
    gd.setAttribute('aria-label', t('goal_aria', done, goal));
    byId('goal-txt').textContent = t('goal_txt', done, goal);
    const due = dueItems().length, fresh = Math.min(newItemsAvail().length, newQuotaLeft());
    byId('c-due').textContent = String(due);
    byId('c-new').textContent = String(fresh);
    byId('c-mastered').textContent = String(masteredCount());
    byId('placeBtn').hidden = !(!data.placed && (data.totalReviews || 0) === 0); // offer placement only to brand-new users
    const next = dueItems()[0] || (fresh ? newItemsAvail()[0] : null);
    byId('nextup').innerHTML = next ? (t('nextup') + ' <b>' + itemLabel(next) + '</b> · ' + catLabel(next.cat).toLowerCase()) : t('nextup_none');
    const caughtUp = due === 0 && fresh === 0;
    byId('startBtn').textContent = caughtUp ? t('start_caught') : t('start');
    byId('hero-title').textContent = caughtUp ? t('hero_caught') : t('hero_session');
    byId('why-text').textContent = caughtUp ? t('why_caught') : t('why_due');
    // focus grid
    const fg = byId('focusGrid');
    fg.innerHTML = '';
    Object.keys(CATS).forEach((cat) => {
        const items = ITEMS.filter((it) => it.cat === cat);
        const mastered = items.filter((it) => boxOf(it.id) >= 4).length;
        const seen = items.filter((it) => !isNew(it.id)).length;
        const card = (document).createElement('button');
        card.type = 'button';
        card.className = 'focus';
        card.onclick = () => { show('practice'); selectById('pr-cat').value = cat; byId('pr-cat').dispatchEvent(new Event('change')); byId('pr-start').focus(); };
        card.innerHTML = '<div class="k">' + catLabel(cat) + '</div><div class="m">' + mastered + ' ' + t('mastered_lc') + ' · ' + seen + '/' + items.length + ' ' + t('started') + '</div><div class="bar"><i style="width:' + Math.round(100 * mastered / items.length) + '%"></i></div>';
        fg.appendChild(card);
    });
    renderPlan();
}
/* ---------- EXPLORE ---------- */
interface ExplorePreviewFrame {
    at: number;
    notes: number[];
}
let explorePreview: number[] = [], exploreTimers: ReturnType<typeof setTimeout>[] = [];
function clearExplorePreview() { exploreTimers.forEach(clearTimeout); exploreTimers = []; explorePreview = []; if (view0() === 'explore')
    updateExplore(); }
function exploreSequence(events: ExplorePreviewFrame[]) {
    if (view0() !== 'explore')
        return;
    clearExplorePreview();
    if (reduceMotion() && events.length > 2) {
        const last = events[events.length - 1]; // reduced motion: one steady picture of every note instead of a light running across the keys
        events = [{ at: 0, notes: [...new Set(events.flatMap((e) => e.notes))].sort((a, b) => a - b) }].concat(last.notes.length ? [] : [last]);
    }
    events.forEach((e) => {
        const paint = () => { explorePreview = e.notes; updateExplore(); };
        if (e.at === 0)
            paint();
        else
            exploreTimers.push(setTimeout(paint, e.at));
    });
}
// Bass on the left and treble on the right, as on the keyboard. The frame never changes, so nothing moves while you play: each clef shows
// the exact sounding octave up to EX_LEDGERS ledger lines, and lists any note further away beside an arrow at its edge.
const EX_LEDGERS = 5;
interface ExploreStaffPitch {
    m: number;
    step: number;
    acc: string;
}
interface ExploreStaffHead {
    p: ExploreStaffPitch;
    y: number;
    lane: number;
}
function drawExploreStaff(midis: readonly number[], flat: boolean) {
    const wrap = byId('ex-staff');
    if (!wrap)
        return;
    const names = flat ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pitches: ExploreStaffPitch[] = [...new Set(midis)].map((m) => {
        const name = names[pc(m)], li = 'CDEFGAB'.indexOf(name[0]), oct = Math.floor(m / 12) - 1;
        return { m, step: ssStepOf(li, oct), acc: name.slice(1) };
    }).sort((a, b) => a.step - b.step || a.m - b.m);
    const W = 520, H = 234, top = 94, room = EX_LEDGERS * 12 + 6;
    let body = '';
    ([['bass', 16, 250], ['treble', 270, 504]] as const).forEach(([clef, x0, x1]) => {
        const treble = clef === 'treble', ref = treble ? 30 : 18, x = x0 + 146, far: { up: string[]; down: string[] } = { up: [], down: [] };
        body += `<g class="ex-stave" data-clef="${clef}"><text class="ss-syl" x="${x0 + 24}" y="${top - 24}">${t(treble ? 'si_treble' : 'si_bass')}</text>`;
        for (let i = 0; i < 5; i++)
            body += `<line class="ss-line" x1="${x0}" y1="${top + i * 12}" x2="${x1}" y2="${top + i * 12}" stroke-width="1.2"/>`;
        body += srClef(clef, x0 + 16, top);
        // Adjacent pitches use alternating head columns; accidentals have collision-free lanes.
        let prevStep = -Infinity, prevLane = 0;
        const accLanes: number[] = [], heads: ExploreStaffHead[] = [];
        pitches.forEach((p) => {
            const y = top + 48 + (ref - p.step) * 6;
            if (y < top - room || y > top + 48 + room) {
                far[y < top ? 'up' : 'down'].push(noteName(p.m, flat));
                return;
            }
            const lane = p.step - prevStep <= 1 ? 1 - prevLane : 0;
            prevStep = p.step;
            prevLane = lane;
            heads.push({ p, y, lane });
        });
        // One set of ledger lines per chord, wide enough for whichever head columns need them.
        const ledgers = new Map<number, number>();
        heads.forEach(({ y, lane }) => {
            for (let ly = top - 12; ly >= y - 1; ly -= 12)
                ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
            for (let ly = top + 60; ly <= y + 1; ly += 12)
                ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
        });
        ledgers.forEach((lane, ly) => { body += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9 + lane * 13}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`; });
        heads.forEach(({ p, y, lane }) => {
            let accidental = '';
            if (p.acc) {
                let a = accLanes.findIndex((last) => Math.abs(last - y) >= 24);
                if (a < 0)
                    a = accLanes.length;
                accLanes[a] = y;
                accidental = p.acc === '#' ? ssSharp(x - 20 - a * 11, y) : ssFlat(x - 20 - a * 11, y);
            }
            body += `<g class="ss-n" data-midi="${p.m}" data-clef="${clef}"><title>${noteName(p.m, flat)}</title>${accidental}${ssNotehead(x + lane * 13, y, 4)}</g>`;
        });
        // Listed far notes shrink rather than spill into the other staff; 7px a character overestimates 11px text.
        ([['up', '↑', 14], ['down', '↓', H - 6]] as const).forEach(([k, arrow, y]) => {
            if (!far[k].length)
                return;
            const s = `${arrow} ${far[k].join(' ')}`, max = x1 - x0 - 16, est = s.length * 7, w = Math.min(est, max), cx = Math.min(Math.max(x, x0 + 8 + w / 2), x1 - 8 - w / 2);
            body += `<text class="ss-syl ex-far" x="${cx}" y="${y}"${est > max ? ` style="font-size:${(11 * max / est).toFixed(1)}px"` : ''}>${s}</text>`;
        });
        body += '</g>';
    });
    if (!pitches.length)
        body += `<text class="ss-syl" x="${W / 2}" y="${top + 88}">${t('ex_staff_empty')}</text>`;
    const label = t('ex_staff_label') + (midis.length ? ': ' + midis.map((m) => noteName(m, flat)).join(', ') : '');
    wrap.setAttribute('aria-label', label);
    wrap.innerHTML = `<svg class="ss-svg" role="img" aria-label="${label}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:100%; height:auto; max-width:700px; margin:auto" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
function fillRoots(sel: HTMLElement, withAll: boolean) { sel.innerHTML = ''; if (withAll) {
    const o = (document).createElement('option');
    o.value = 'all';
    o.textContent = t('all_keys');
    sel.appendChild(o);
} NOTE_SYS[notation].root.forEach((n, i) => { const o = (document).createElement('option'); o.value = String(i); o.textContent = n; sel.appendChild(o); }); }
function fillKeyCtx() { const sel = byId('keyCtx'); sel.innerHTML = '<option value="-1">' + t('none_ctx') + '</option>'; NOTE_SYS[notation].root.forEach((n, i) => { const o = (document).createElement('option'); o.value = String(i); o.textContent = t('key_major', n); sel.appendChild(o); }); }
function fillRefNames() {
    const rt = selectById('refType').value, sel = byId('refName');
    sel.innerHTML = '';
    if (rt === 'chord') {
        CHORDS.forEach((c) => { const o = (document).createElement('option'); o.value = c.symbol; o.textContent = c.symbol; sel.appendChild(o); });
    }
    else {
        Object.keys(SCALES).forEach((n) => { const o = (document).createElement('option'); o.value = n; o.textContent = scaleDisp(n); sel.appendChild(o); });
    }
}
function refMidis() { const root = 60 + parseInt(selectById('refRoot').value, 10); if (selectById('refType').value === 'chord') {
    const c = CHORDS.find((x) => x.symbol === selectById('refName').value);
    if (!c) return [];
    return c.intervals.map((i) => root + i);
} return SCALES[selectById('refName').value].concat([12]).map((i) => root + i); }
function updateExplore() {
    if (view0() !== 'explore')
        return;
    const notes = (held.size ? heldMidis() : explorePreview).slice().sort((a, b) => a - b);
    const keyCtx = parseInt(selectById('keyCtx').value, 10);
    let nameLabel = '—', roman = '—', spell = notes.length ? isFlatKey(pc(notes[0])) : false;
    let degrees: Map<number, string> | null = null;
    if (notes.length >= 3) {
        const id = identifyChord(notes);
        if (id)
            spell = isFlatKey(id.rootPc);
        if (id) {
            nameLabel = slashLabel(id) + (id.inversion > 0 ? ' · ' + invName(id.inversion) : '');
            roman = romanFor(keyCtx, id) || '—';
            degrees = chordDegreeMap(notes, id.rootPc, id.chord.pcset);
        }
        else
            nameLabel = '—';
    }
    else if (notes.length === 2) {
        nameLabel = intervalLabel(notes[1] - notes[0]);
    }
    else if (notes.length === 1) {
        nameLabel = pcName(pc(notes[0]), spell);
    }
    kbDegrees(degrees);
    byId('ro-notes').textContent = notes.length ? notes.map((m) => noteName(m, spell)).join('  ') : '—';
    byId('ro-name').textContent = nameLabel;
    byId('ro-roman').textContent = roman;
    drawExploreStaff(notes, spell);
    cofNow(notes);
}
/* ---------- CIRCLE OF FIFTHS (Explore › Circle tab) ---------- */
// Standard one-octave fingerings, ascending, indexed by the tonic's pitch class (C=0 … B=11).
// Sources: pianoscales.org (major, natural & harmonic minor). Melodic minor (ascending) follows the harmonic
// fingering, except C♯/F♯/G♯ where the raised 6th/7th moves the thumb off a black key (ABRSM-style).
const COF_FING = {
    maj: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23412312', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '32143213', '54321321', '54321321', '43213214', '54321321', '32143213', '54321321', '32143213', '43214321'] },
    natural: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132132', '54321321', '21321432', '43214321'] },
    harmonic: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '23123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
    melodic: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23123412', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
};
const COF_MAJ = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'], COF_MIN = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D'];
const COF_COL = ['#e8c160', '#ecae4c', '#e79443', '#df7a3b', '#d2623a', '#bd4834', null, '#355895', '#3b6fa2', '#3f86a6', '#4b9ea6', '#62b3a6'];
const COF_SCALE = { natural: 'Aeolian (Natural minor)', harmonic: 'Harmonic minor', melodic: 'Melodic minor' };
type CofMode = 'scale' | 'chord';
type CofFlavor = keyof typeof COF_SCALE;
interface CofSelection {
    i: number;
    minor: boolean;
    mode: CofMode;
    flavor: CofFlavor;
    picked: boolean;
}
interface CofSignature {
    n: number;
    sharp?: boolean;
    list: string;
}
function isCofMode(v: string | undefined): v is CofMode { return v === 'scale' || v === 'chord'; }
function isCofFlavor(v: string | undefined): v is CofFlavor { return v === 'natural' || v === 'harmonic' || v === 'melodic'; }
const cof: CofSelection = { i: 0, minor: false, mode: 'scale', flavor: 'natural', picked: false };
let exTabCur = 'free';
const COF_SOL = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
function cofSpell(letter: string, acc: number) { return spelledName(notation, 'CDEFGAB'.indexOf(letter), acc); }
function cofParse(s: string) { return { L: s[0], acc: s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0 }; }
function cofName(s: string) { const p = cofParse(s); return cofSpell(p.L, p.acc); }
// Spell each degree with consecutive letter names so keys read correctly (e.g. G harmonic minor → F♯, D♯ minor → C𝄪).
function cofSpellDegrees(tonic: string, offs: readonly number[], degs: number[]) {
    const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11], p = cofParse(tonic), li = LET.indexOf(p.L), tp = NAT[li] + p.acc;
    return offs.map((o, k) => { const L = (li + degs[k]) % 7, d = ((tp + o - NAT[L]) % 12 + 12) % 12; return cofSpell(LET[L], d > 6 ? d - 12 : d); });
}
function cofTonicPc() { return cof.minor ? (CIRCLE[cof.i] + 9) % 12 : CIRCLE[cof.i]; }
function cofKeyLabel(i: number, minor: boolean) { if (i === 6)
    return minor ? cofName('D#') + ' / ' + cofName('Eb') : cofName('F#') + ' / ' + cofName('Gb'); return cofName(minor ? COF_MIN[i] : COF_MAJ[i]); }
function cofSigList(i: number): CofSignature { const sh = 'FCGDAEB', fl = 'BEADGCF'; if (i === 0)
    return { n: 0, list: '' }; if (i <= 6)
    return { n: i, sharp: true, list: [...sh.slice(0, i)].map((L) => cofSpell(L, 1)).join(', ') }; const n = 12 - i; return { n, sharp: false, list: [...fl.slice(0, n)].map((L) => cofSpell(L, -1)).join(', ') }; }
function cofData() {
    const tp = cofTonicPc(), tonic = (cof.minor ? COF_MIN : COF_MAJ)[cof.i], root = 60 + tp;
    if (cof.mode === 'chord') {
        const offs = [0, cof.minor ? 3 : 4, 7];
        return { midis: offs.map((o) => root + o), names: cofSpellDegrees(tonic, offs, [0, 2, 4]), rh: [1, 3, 5], lh: [5, 3, 1] };
    }
    const tbl = cof.minor ? COF_FING[cof.flavor] : COF_FING.maj, offs = (cof.minor ? SCALES[COF_SCALE[cof.flavor]] : SCALES['Major (Ionian)']).concat([12]);
    return { midis: offs.map((o) => root + o), names: cofSpellDegrees(tonic, offs, [0, 1, 2, 3, 4, 5, 6, 7]), rh: [...tbl.rh[tp]].map(Number), lh: [...tbl.lh[tp]].map(Number) };
}
function cofPt(r: number, deg: number) { const a = (deg - 90) * Math.PI / 180; return [(350 + r * Math.cos(a)).toFixed(2), (350 + r * Math.sin(a)).toFixed(2)]; }
function cofSector(r0: number, r1: number, d0: number, d1: number) { const a = cofPt(r1, d0), b = cofPt(r1, d1), c = cofPt(r0, d1), d = cofPt(r0, d0); return 'M' + a + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + b + 'L' + c + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + d + 'Z'; }
function cofTint(i: number, pct: string|number) { return 'fill:color-mix(in srgb, ' + (COF_COL[i] || '#6d4f7a') + ' ' + pct + '%, var(--card))'; }
function cofText(x: string, y: string, cls: string, lines: string[], lh: number) { return '<text class="' + cls + '" x="' + x + '" y="' + y + '">' + lines.map((s, k) => '<tspan x="' + x + '" dy="' + (k ? lh : -(lines.length - 1) * lh / 2) + '">' + s.replace(/([♯♭𝄪𝄫])/gu, '<tspan class="cof-g">$1</tspan>') + '</tspan>').join('') + '</text>'; }
const cofMQ = window.matchMedia('(max-width:560px)');
if (cofMQ)
    cofMQ?.addEventListener('change', () => renderCircle());
function renderCircle() {
    const box = byId('circle');
    if (!box)
        return;
    const compact = !!(cofMQ && cofMQ.matches);
    let s = '<svg class="cof-svg" viewBox="' + (compact ? '92 92 516 516' : '-12 -12 724 724') + '" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="' + t('aria_circle') + '"><defs>' +
        '<linearGradient id="cofSplit" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="400" y2="0"><stop offset="0" stop-color="#314e8c"/><stop offset=".5" stop-color="#314e8c"/><stop offset=".5" stop-color="#a8392f"/><stop offset="1" stop-color="#a8392f"/></linearGradient>' +
        '<marker id="cofAhUp" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#c96b3f"/></marker>' +
        '<marker id="cofAhDn" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#4a7fb0"/></marker>' +
        '<path id="cofArcS" d="M' + cofPt(334, 18) + 'A334 334 0 0 1 ' + cofPt(334, 72) + '"/><path id="cofArcF" d="M' + cofPt(334, 288) + 'A334 334 0 0 1 ' + cofPt(334, 342) + '"/></defs>';
    if (!compact)
        s += '<text class="cof-arc sharp"><textPath href="#cofArcS" startOffset="50%" text-anchor="middle">' + t('cof_sharps') + ' ♯</textPath></text>';
    if (!compact)
        s += '<text class="cof-arc flat"><textPath href="#cofArcF" startOffset="50%" text-anchor="middle">♭ ' + t('cof_flats') + '</textPath></text>';
    let maj = '', min = '', acc = '';
    CIRCLE.forEach((p, i) => {
        const d0 = i * 30 - 15, d1 = i * 30 + 15, sig = cofSigList(i), light = i <= 4 || i >= 10;
        const fill = i === 6 ? 'fill:url(#cofSplit)' : 'fill:' + COF_COL[i], txt = light ? '#1a1714' : '#fffaf2';
        const [mx, my] = cofPt(215, i * 30), [cx, cy] = cofPt(163, i * 30), [nx, ny] = cofPt(125, i * 30);
        const majL = i === 6 ? [cofName('F#'), cofName('Gb')] : [cofName(COF_MAJ[i])], minL = i === 6 ? [cofName('D#') + 'm', cofName('Eb') + 'm'] : [cofName(COF_MIN[i]) + 'm'];
        const cnt = i === 0 ? '0' : i < 6 ? i + '♯' : i === 6 ? '6♯ 6♭' : (12 - i) + '♭';
        maj += '<g class="cof-k" data-i="' + i + '" data-ring="maj" tabindex="0" role="button" aria-pressed="false" aria-label="' + t('cof_aria_maj', cofKeyLabel(i, false)) + (sig.n ? ', ' + sig.n + (sig.sharp ? '♯' : '♭') : '') + '">' +
            '<path class="cof-w" d="' + cofSector(176, 254, d0, d1) + '" style="' + fill + '"/><path class="cof-w" d="' + cofSector(150, 176, d0, d1) + '" style="' + cofTint(i, 44) + '"/>' +
            cofText(mx, my, 'cof-maj' + (i === 6 ? ' sm' : ''), majL, 28).replace('<text ', '<text style="fill:' + txt + '" ') +
            '<text class="cof-cnt" x="' + cx + '" y="' + cy + '">' + cnt + '</text></g>';
        min += '<g class="cof-k" data-i="' + i + '" data-ring="min" tabindex="0" role="button" aria-pressed="false" aria-label="' + t('cof_aria_min', cofKeyLabel(i, true)) + '">' +
            '<path class="cof-w" d="' + cofSector(100, 150, d0, d1) + '" style="' + cofTint(i, 24) + '"/>' + cofText(nx, ny, 'cof-min' + (i === 6 ? ' sm' : ''), minL, 17) + '</g>';
        if (sig.n && !compact) {
            const items = sig.list.split(', '), lines: string[] = [];
            for (let k = 0; k < items.length; k += 3)
                lines.push(items.slice(k, k + 3).join(' '));
            const a = i * 30, sx = Math.sin(a * Math.PI / 180), side = Math.abs(sx) > .35, [ax, ay] = cofPt(side ? 268 : 280, a);
            acc += cofText(ax, (+ay + 6).toFixed(2), 'cof-acc', lines, 19).replace('<text ', '<text style="text-anchor:' + (side ? (sx > 0 ? 'start' : 'end') : 'middle') + '" ');
        }
    });
    s += maj + min + acc + '<path class="cof-ring-rel" id="cof-rel" d=""/><path class="cof-ring-sel" id="cof-sel" d=""/>';
    s += '<circle class="cof-hub" cx="350" cy="350" r="99"/>' +
        '<path class="cof-arrow up" marker-end="url(#cofAhUp)" d="M' + cofPt(84, -38) + 'A84 84 0 0 1 ' + cofPt(84, 38) + '"/>' +
        '<path class="cof-arrow dn" marker-end="url(#cofAhDn)" d="M' + cofPt(84, 218) + 'A84 84 0 0 0 ' + cofPt(84, 142) + '"/>' +
        '<text class="cof-iv up" x="350" y="308">' + t('cof_5th') + '</text><text class="cof-st" x="350" y="326">' + t('cof_7st') + '</text>' +
        '<text class="cof-title" x="350" y="358">' + t('ex_tab_circle') + '</text>' +
        '<text class="cof-iv dn" x="350" y="386">' + t('cof_4th') + '</text><text class="cof-st" x="350" y="404">' + t('cof_5st') + '</text></svg>';
    box.innerHTML = s;
    box.querySelectorAll('.cof-k').forEach((g) => {
        if (!(g instanceof SVGElement))
            return;
        const pick = () => cofPick(Number(g.dataset.i), g.dataset.ring === 'min');
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            pick();
        } });
    });
    cofSel();
    cofInfo();
}
function cofSel() {
    const svg = (document).querySelector('#circle .cof-svg');
    if (!svg)
        return;
    svg.classList.toggle('has-sel', cof.picked);
    svg.querySelectorAll('.cof-k').forEach((g) => {
        if (!(g instanceof SVGElement))
            return;
        const i = Number(g.dataset.i), mn = g.dataset.ring === 'min', on = i === cof.i && mn === cof.minor;
        g.classList.toggle('on', on);
        g.classList.toggle('rel', i === cof.i && !on);
        g.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const d0 = cof.i * 30 - 15, d1 = cof.i * 30 + 15, majD = cofSector(150, 254, d0, d1), minD = cofSector(100, 150, d0, d1);
    byId('cof-sel').setAttribute('d', cof.minor ? minD : majD);
    byId('cof-rel').setAttribute('d', cof.minor ? majD : minD);
}
// Keeps the circle in step with the "Key context" select from the Free-play tab (always a major key there).
function circleSel() { const k = parseInt(selectById('keyCtx').value, 10); if (k >= 0) {
    cof.i = CIRCLE.indexOf(k);
    cof.minor = false;
    cof.picked = true;
} cofSel(); cofInfo(); cofPaintDock(); }
function cofPick(i: number, minor: boolean) {
    cof.i = i;
    cof.minor = minor;
    cof.picked = true;
    selectById('keyCtx').value = String(CIRCLE[i]);
    cofSyncRef();
    cofSel();
    cofInfo();
    cofPaintDock();
    cofRevealFingering();
    cofPlay();
}
function cofRevealFingering() {
    requestAnimationFrame(() => {
        const fing = (document).querySelector('#exp-circle .cof-fing');
        if (!fing || byId('exp-circle').hidden)
            return;
        const dock = document.body.classList.contains('kb') ? byId('dock') : null, dockH = dock ? dock.getBoundingClientRect().height : 0;
        const header = (document).querySelector('header'), top = (header ? header.getBoundingClientRect().bottom : 0) + 16, bottom = window.innerHeight - dockH - 24;
        const rect = fing.getBoundingClientRect(), available = Math.max(0, bottom - top);
        const delta = rect.height > available || rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
        if (Math.abs(delta) > 1)
            window.scrollBy({ top: delta, behavior: (matchMedia)('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
}
function cofSyncRef() {
    selectById('refType').value = cof.mode;
    fillRefNames();
    selectById('refRoot').value = String(cofTonicPc());
    selectById('refName').value = cof.mode === 'chord' ? (cof.minor ? 'm' : 'maj') : (cof.minor ? COF_SCALE[cof.flavor] : 'Major (Ionian)');
}
function cofPlay() {
    const tp = cofTonicPc(), d = cofData();
    if (cof.mode === 'chord')
        playChordMidis(d.midis, true);
    else
        playScaleNotes(60 + tp, (cof.minor ? SCALES[COF_SCALE[cof.flavor]] : SCALES['Major (Ionian)']), true);
}
function cofInfo() {
    if (!byId('cof-key'))
        return;
    const i = cof.i, sig = cofSigList(i), rel = cofKeyLabel(i, !cof.minor);
    byId('cof-key').textContent = t(cof.minor ? 'key_minor' : 'key_major', cofKeyLabel(i, cof.minor));
    const sigTxt = (g: CofSignature) => g.n ? t(g.sharp ? 'cof_sig_s' : 'cof_sig_f', String(g.n), '<b>' + g.list + '</b>') : t('cof_sig0');
    const fl6: CofSignature = { n: 6, sharp: false, list: [...'BEADGC'].map((L) => cofSpell(L, -1)).join(', ') };
    byId('cof-sig').innerHTML = sigTxt(sig) + (i === 6 ? ' / ' + sigTxt(fl6) : '') + ' · ' + t(cof.minor ? 'cof_rel_maj' : 'cof_rel_min', t(cof.minor ? 'key_major' : 'key_minor', rel));
    queryAllHtml(document, '#cof-mode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === cof.mode ? 'true' : 'false'));
    queryAllHtml(document, '#cof-flavor button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === cof.flavor ? 'true' : 'false'));
    byId('cof-flavor').hidden = !(cof.minor && cof.mode === 'scale');
    const ch = cof.mode === 'chord';
    byId('cof-fing-t').textContent = t(ch ? 'cof_fing_chord' : 'cof_fing_scale');
    byId('cof-fing-s').textContent = '· ' + t(ch ? 'cof_fing_chord_s' : 'cof_fing_scale_s');
    byId('cof-note').textContent = t(ch ? 'cof_note_chord' : 'cof_note_scale') + (!ch && cof.minor && cof.flavor === 'melodic' ? ' ' + t('cof_note_mel') : '');
    cofDiagram();
}
function cofDiagram() {
    const box = byId('cof-kb');
    if (!box)
        return;
    const d = cofData(), WHITE = [0, 2, 4, 5, 7, 9, 11], isW = (m: number) => WHITE.includes(pc(m));
    let lo = d.midis[0], hi = d.midis[d.midis.length - 1];
    if (!isW(lo))
        lo--;
    if (!isW(hi))
        hi++;
    const WW = 44, WH = 124, BW = 26, BH = 78, X0 = 34, TOP = 58, whites: number[] = [];
    for (let m = lo; m <= hi; m++)
        if (isW(m))
            whites.push(m);
    const W = X0 + whites.length * WW + 4, H = TOP + WH + 60, xOf = (m: number) => isW(m) ? X0 + whites.indexOf(m) * WW + WW / 2 : X0 + whites.indexOf(m + 1) * WW;
    const idx = new Map(d.midis.map((m, k) => [m, k] as const));
    let s = '<svg class="cof-kb" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t('cof_kb_aria', t('cof_rh_s') + ': ' + d.names.map((n, k) => n + ' ' + d.rh[k]).join(', ') + ' · ' + t('cof_lh_s') + ': ' + d.names.map((n, k) => n + ' ' + d.lh[k]).join(', ')) + '">';
    s += '<text class="ck-hand" x="2" y="32">' + t('cof_rh_s') + '</text><text class="ck-hand" x="2" y="' + (TOP + WH + 36) + '">' + t('cof_lh_s') + '</text>';
    whites.forEach((m, k) => {
        const ni = idx.get(m), on = ni !== undefined;
        s += '<rect class="ck-w' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (X0 + k * WW) + '" y="' + TOP + '" width="' + WW + '" height="' + WH + '" rx="5"/>';
        if (on)
            s += '<text class="ck-n" x="' + (X0 + k * WW + WW / 2) + '" y="' + (TOP + WH - 12) + '">' + d.names[ni] + '</text>';
    });
    for (let m = lo; m <= hi; m++) {
        if (isW(m))
            continue;
        const ni = idx.get(m), on = ni !== undefined, x = xOf(m);
        s += '<rect class="ck-b' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (x - BW / 2) + '" y="' + TOP + '" width="' + BW + '" height="' + BH + '" rx="3"/>';
        if (on)
            s += '<text class="ck-n b" x="' + x + '" y="' + (TOP + BH - 11) + '" style="font-size:9.5px">' + d.names[ni] + '</text>';
    }
    const badge = (cls: string, x: string|number, y: string|number, n: string|number) => '<g class="ck-f ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="11"/><text x="' + x + '" y="' + y + '">' + n + '</text></g>';
    d.midis.forEach((m, k) => { const x = xOf(m), w = isW(m); s += badge('rh', x, w ? 40 : 14, d.rh[k]) + badge('lh', x, w ? TOP + WH + 18 : TOP + WH + 44, d.lh[k]); });
    box.innerHTML = s + '</svg>';
}
function cofNow(notes: readonly number[]) { const box = byId('cof-kb'); if (!box)
    return; const set = new Set(notes); box.querySelectorAll('[data-m]').forEach((r) => r.classList.toggle('now', set.has(Number(r.getAttribute('data-m'))))); }
function cofPaintDock() { if (view0() !== 'explore')
    return; kbClear('target'); if (exTabCur !== 'circle')
    return; cofData().midis.forEach((m) => kbState(m, 'target', true)); }
function exTab(tab: string | undefined, focus?: boolean) {
    exTabCur = tab === 'circle' ? 'circle' : 'free';
    queryAllHtml(document, '#ex-tabs [role="tab"]').forEach((b) => { const on = b.dataset.tab === exTabCur; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus)
        b.focus(); });
    byId('exp-free').hidden = exTabCur !== 'free';
    byId('exp-circle').hidden = exTabCur !== 'circle';
    cofPaintDock();
}
function initExploreTabs() {
    const tl = byId('ex-tabs');
    if (!tl)
        return;
    tl.addEventListener('click', (e) => { const b = eventClosest(e, '[role="tab"]'); if (b)
        exTab(b.dataset.tab); });
    tl.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')
            return;
        e.preventDefault();
        exTab(e.key === 'Home' ? 'free' : e.key === 'End' ? 'circle' : exTabCur === 'free' ? 'circle' : 'free', true);
    });
    byId('cof-mode').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || v === cof.mode || !isCofMode(v))
        return; cof.mode = v; cofSyncRef(); cofInfo(); cofPaintDock(); cofPlay(); });
    byId('cof-flavor').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || v === cof.flavor || !isCofFlavor(v))
        return; cof.flavor = v; cofSyncRef(); cofInfo(); cofPaintDock(); cofPlay(); });
    byId('cof-play').addEventListener('click', () => { if (!cof.picked) {
        cof.picked = true;
        cofSel();
    } cofSyncRef(); cofPlay(); });
}
/* ---------- SONGS ---------- */
let songDir = 'asc';
function renderSongs() {
    const box = byId('songsList');
    if (!box)
        return;
    box.innerHTML = '';
    const root = 60 + parseInt(selectById('song-root').value || '0', 10);
    for (let semi = 1; semi <= 12; semi++) {
        const iv = INTERVALS.find((i) => i.semi === semi) || { short: '' }, list = songsFor(semi, songDir);
        const card = (document).createElement('div');
        card.className = 'songcard';
        card.dataset.semi = String(semi);
        if (SQ.answered && SQ.started && SQ.semi === semi)
            card.dataset.hl = 'true';
        card.innerHTML = '<div class="hd"><b>' + ivName(semi) + '</b><span class="sh">' + iv.short + '</span></div>';
        const play = (document).createElement('button');
        play.type = 'button';
        play.className = 'play';
        play.textContent = t('ex_hear');
        play.setAttribute('aria-label', t('ex_hear') + ' — ' + ivName(semi));
        play.onclick = () => playIvDir(root, semi, songDir);
        card.querySelector('.hd')?.appendChild(play);
        const ul = (document).createElement('div');
        ul.className = 'songlist';
        list.forEach((s) => { const b = (document).createElement('button'); b.type = 'button'; b.textContent = s; if (/^\(/.test(s))
            b.style.opacity = '.6'; b.onclick = () => playIvDir(root, semi, songDir); ul.appendChild(b); });
        card.appendChild(ul);
        box.appendChild(card);
    }
    sqRender();
}
/* interval ear check: a random interval in the chosen direction, answered from the 12 names */
const SQ = { started: false, answered: true, semi: 0, root: 60, dir: 'asc', pick: 0, right: 0, total: 0 };
function sqPlay() { ensureAudio(); playIvDir(SQ.root, SQ.semi, SQ.dir); }
function sqNew() {
    SQ.started = true;
    SQ.answered = false;
    SQ.pick = 0;
    SQ.semi = 1 + Math.floor(Math.random() * 12);
    SQ.root = 55 + Math.floor(Math.random() * 10);
    SQ.dir = songDir;
    (document).querySelectorAll('#songsList .songcard').forEach((c) => c.removeAttribute('data-hl'));
    byId('sq-verdict').textContent = '';
    byId('sq-verdict').className = 'verdict';
    sqRender();
    sqPlay();
    const f = byId('sq-ans').querySelector('button');
    if (f)
        f.focus();
}
function sqRender() {
    const a = byId('sq-ans');
    if (!a)
        return;
    a.hidden = !SQ.started;
    byId('sq-again').hidden = !SQ.started;
    byId('sq-go').textContent = t(SQ.started ? 'sq_next' : 'sq_start');
    byId('sq-score').textContent = SQ.total ? t('sq_score', SQ.right, SQ.total) : '';
    if (!SQ.started)
        return;
    a.innerHTML = '';
    for (let n = 1; n <= 12; n++) {
        const b = (document).createElement('button');
        b.type = 'button';
        b.textContent = ivName(n);
        b.dataset.semi = String(n);
        if (SQ.answered) {
            b.disabled = true;
            if (n === SQ.semi)
                b.dataset.r = 'good';
            else if (n === SQ.pick)
                b.dataset.r = 'bad';
        }
        a.appendChild(b);
    }
}
function sqAnswer(n: number) {
    if (SQ.answered || !SQ.started)
        return;
    SQ.answered = true;
    SQ.pick = n;
    SQ.total++;
    const ok = n === SQ.semi;
    if (ok)
        SQ.right++;
    const hook = songsFor(SQ.semi, SQ.dir).find((x) => !/^\(/.test(x)), v = byId('sq-verdict');
    v.className = 'verdict ' + (ok ? 'good' : 'bad');
    v.textContent = t(ok ? 'sq_good' : 'sq_bad', ivName(SQ.semi)) + (hook ? ' ' + t('sq_hook', hook) : '');
    if (data.earDay !== todayN()) {
        data.earDay = todayN();
        data.earToday = 0;
    }
    if (ok)
        data.earToday = (data.earToday || 0) + 1;
    saveAll();
    const card = queryHtml(document, '#songsList .songcard[data-semi="' + SQ.semi + '"]');
    if (card)
        card.dataset.hl = 'true';
    sqRender();
    byId('sq-go').focus();
    if (!ok)
        setTimeout(() => { if (view0() === 'songs')
            sqPlay(); }, 450);
}
/* ============================================================================
   LEARN — bilingual theory handbook. Every demo button routes through the
   existing audio engine and lights the target keys on the dock.
   ============================================================================ */
/* ---- Learn V4: new chapters (bilingual). Units, cheat sheets, quizzes & staves follow below. ---- */
/* ---------- LEARN v4: units, progress, review, quizzes, staves, widgets, glossary ---------- */
const LT = (a: LearnText) => Array.isArray(a) ? (lang === 'ro' ? a[1] : a[0]) : a;
const LEARN_OLD_ORDER = ['keys', 'iv', 'sc', 'ch', 'cof', 'pr', 'rh', 'notation', 'dyn', 'modes', 'how'];
const LEARN_GAPS = [3, 7, 16, 35, 90];
/** A quiz question while it is being answered. */
interface LearnQuizRunQuestion extends LearnQuizSpec {
    opts?: { x: LearnText; ok: boolean }[];
    got: number[];
    ans: boolean;
    ok: boolean;
    pick?: number;
    fb?: string;
}
interface LearnQuizRun { id: string; qs: LearnQuizRunQuestion[]; i: number; score: number; done: boolean; rev?: boolean }
let learnSel = 0, LGEN = 0, LQ: LearnQuizRun|null = null, learnGloss = false;
function learnTitle(L: Lesson) { return L[lang]?.t || L.en.t; }
/** Spaced review of one finished lesson. */
interface LearnReview { last: number; n: number; best?: number; rv?: number }
/** The Learn fields of the saved progress that `learnData()` guarantees. */
interface LearnProgressStore {
    learnDone: Record<string, number>;
    learnRev: Record<string, LearnReview>;
    learnUnlock: Record<string, number>;
    learnSelId?: string;
    learnSel?: number;
}
function hasLearnProgress(d: StoredTrainerData): d is StoredTrainerData & LearnProgressStore { return !!d.learnDone && !!d.learnRev && !!d.learnUnlock; }
function learnData(): LearnProgressStore {
    const d = data;
    if (!d.learnDone || typeof d.learnDone !== 'object')
        d.learnDone = {};
    if (!d.learnRev || typeof d.learnRev !== 'object') {
        const rev: Record<string, LearnReview> = {}, done = d.learnDone;
        d.learnRev = rev;
        Object.keys(done).forEach((id) => { rev[id] = { last: done[id], n: 0 }; });
    }
    if (!d.learnUnlock || typeof d.learnUnlock !== 'object')
        d.learnUnlock = {};
    if (!hasLearnProgress(d))
        throw new Error('Étude: Learn progress could not be initialised');
    return d;
}
function learnUnitOf(id: string) { return LEARN_UNITS.findIndex((u) => u.ls.includes(id)); }
function learnUnitDone(i: number) { const u = LEARN_UNITS[i], d = learnData().learnDone; return u ? u.ls.filter((id) => d[id]).length : 0; }
function learnUnitOpen(i: number): boolean {
    if (i <= 0)
        return true;
    const u = LEARN_UNITS[i], D = learnData();
    if (!u)
        return true;
    if (D.learnUnlock[u.id] || u.ls.some((id) => D.learnDone[id]))
        return true;
    const p = LEARN_UNITS[i - 1];
    return learnUnitOpen(i - 1) && p.ls.every((id) => D.learnDone[id]);
}
function learnLessonOpen(L: Lesson) { return learnUnitOpen(learnUnitOf(L.id)); }
function learnGap(id: string) { const r = learnData().learnRev[id]; return LEARN_GAPS[Math.min(r ? (r.n | 0) : 0, LEARN_GAPS.length - 1)]; }
function learnDueDays(id: string) {
    const D = learnData();
    if (!D.learnDone[id])
        return null;
    const r = D.learnRev[id] || { last: D.learnDone[id], n: 0 };
    const age = todayN() - (r.last | 0);
    return age >= learnGap(id) ? age : null;
}
function learnDueList() { return LESSONS.filter((L) => learnDueDays(L.id) != null).sort((a, b) => (learnDueDays(b.id) ?? 0) - (learnDueDays(a.id) ?? 0)); }
function learnComplete(L: Lesson, score: number|null) {
    const D = learnData(), tn = todayN(), was = D.learnDone[L.id], due = learnDueDays(L.id) != null;
    const r = D.learnRev[L.id] || (D.learnRev[L.id] = { last: tn, n: 0 });
    if (score != null)
        r.best = Math.max(r.best || 0, score);
    if (!was) {
        D.learnDone[L.id] = tn;
        r.last = tn;
        r.n = 0;
    }
    else if (due) {
        r.n = (r.n | 0) + 1;
        r.last = tn;
        r.rv = tn;
    }
    saveAll();
    return { first: !was, review: !!was && due };
}
function learnMark(read: boolean) {
    const L = LESSONS[learnSel], D = learnData();
    if (read)
        learnComplete(L, null);
    else {
        delete D.learnDone[L.id];
        delete D.learnRev[L.id];
    }
    saveAll();
}
function learnInitSel() {
    if (renderLearn._init)
        return;
    renderLearn._init = true;
    const D = learnData();
    let id = D.learnSelId;
    if (!id && D.learnSel !== undefined && Number.isInteger(D.learnSel))
        id = LEARN_OLD_ORDER[D.learnSel];
    const i = LESSONS.findIndex((L) => L.id === id);
    learnSel = i >= 0 ? i : 0;
}
function learnGo(i: number) {
    learnSel = Math.max(0, Math.min(LESSONS.length - 1, i));
    learnData().learnSelId = LESSONS[learnSel].id;
    data.learnSel = learnSel;
    renderLearn._init = true;
    learnGloss = false;
    LQ = null;
    saveAll();
    renderLearn();
    const g = (document).querySelector('#view-learn .learn-grid');
    if (g && g.getBoundingClientRect().top < 70)
        g.scrollIntoView({ block: 'start' });
    const h = byId('learnBody').querySelector('h3');
    if (h) {
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
    }
}
function learnGoId(id: string) { const i = LESSONS.findIndex((L) => L.id === id); if (i >= 0) {
    if (view0() !== 'learn') {
        learnSel = i;
        learnData().learnSelId = id;
        renderLearn._init = true;
        learnGloss = false;
        LQ = null;
        show('learn');
    }
    else
        learnGo(i);
} }
function learnSay(msg: string|null) { const l = maybeById('learnLive'); if (!l)
    return; l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 30); }
function learnHalt() {
    LGEN++;
    stopPreviews();
    kbClear('target');
    lmStop();
    queryAllHtml(document, '#learnBody [data-s="now"]').forEach((e) => delete e.dataset.s);
    (document).querySelectorAll('#learnBody .lbars .on, #learnBody .lbeat .on').forEach((e) => e.classList.remove('on'));
    (document).querySelectorAll('#learnBody [data-lplay][aria-pressed="true"]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = t('lu_play_ex'); });
}
function learnTimer(fn: () => void, ms: number) { const g = LGEN; setTimeout(() => { if (g !== LGEN || view0() !== 'learn')
    return; fn(); }, ms); }
let learnLightTimer: ReturnType<typeof setTimeout> | undefined;
function learnLight(ms: number[], dur: number) {
    const g = LGEN;
    kbClear('target');
    ms.forEach((m) => kbState(m, 'target', true));
    clearTimeout(learnLightTimer);
    learnLightTimer = setTimeout(() => { if (g === LGEN)
        kbClear('target'); }, dur);
}
function learnPlanItems(tn: number) {
    const D = learnData(), ld = D.learnDone;
    const nextL = LESSONS.find((L) => !ld[L.id] && learnLessonOpen(L)), learnToday = Object.keys(ld).some((k) => ld[k] === tn);
    const out = [{ id: 'learn', done: learnToday || !nextL, t: t('plan_learn'), d: nextL ? t('plan_learn_d', learnTitle(nextL)) : t('plan_learn_all'),
            go: () => { if (nextL)
                learnGoId(nextL.id);
            else
                show('learn'); } }];
    const due = learnDueList();
    if (due.length) {
        const L = due[0];
        out.push({ id: 'learnrev', done: false, t: t('plan_lrev'),
            d: t('plan_lrev_d', learnTitle(L), learnDueDays(L.id) ?? 0) + (due.length > 1 ? t('plan_lrev_more', due.length - 1) : ''), go: () => learnGoId(L.id) });
    }
    else if (Object.keys(D.learnRev).some((k) => D.learnRev[k].rv === tn))
        out.push({ id: 'learnrev', done: true, t: t('plan_lrev'), d: t('plan_lrev_done'), go: () => show('learn') });
    return out;
}
/* quiz: o = options (first listed = correct unless a is given); hear = demo spec; pcs = play these pitch classes (any octave, any order); seq = play these pitch classes in order */
/* cheat sheets: rows of [label, value]; each may be a string or [en,ro] */
/* staff excerpts: compact note strings "C4q E4+G4h Rq" (w h q e s, d=dotted, t=triplet eighth) */
const LDUR: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, dh: 3, dq: 1.5, de: 0.75 };
/** A note, chord (several pitches) or rest (`'R'`) with its length in beats, e.g. `['C4', 1]`. */
type SrToken = [string | string[], number];
function LP(s: string) { return s.trim().split(/\s+/).filter((x: string) => x !== '|').map((tok: string): SrToken => { const m = tok.match(/^(.+?)(d?[whqest])$/); if (!m)
    throw new Error('Étude: bad staff token ' + tok); const d = LDUR[m[2]]; const p = m[1].split('+'); return [p[0] === 'R' ? 'R' : (p.length > 1 ? p : p[0]), d]; }); }
/** What the grand-staff engraver (`srRender`) needs to draw a passage. */
interface SrScore { ts: number[]; keyN?: number; pickup?: number; rh?: SrToken[]; lh?: SrToken[]; noNames?: boolean; perc?: boolean }
type SrHand = 'rh' | 'lh';
/** An annotation drawn over a Learn staff: kind, beat, then kind-specific values. */
type LStaffMark =
    | ['dyn', number, string]
    | ['cr' | 'dim' | 'tri' | 'ped', number, number]
    | ['acc' | 'stac' | 'ten' | 'fer' | 'tr', number, SrHand?]
    | ['fing', number, string, SrHand?]
    | ['slur' | 'tie', number, number, SrHand?]
    | ['txt', number, LearnText]
    | ['rn', number, string]
    | ['rs' | 're', number];
interface LStaffSpec { p: SrScore; bpm: number; cap: string[]; marks?: LStaffMark[]; click?: boolean; seq?: [number, number][] }
const LSTAVES: Record<string, LStaffSpec> = {
    n_clefs: { p: { rh: LP('C4h G4h C5w'), lh: LP('C4h F3h C3w'), ts: [4, 4] }, bpm: 84, cap: ['Treble clef for the right hand, bass clef for the left. Middle C sits on a ledger line between them.', 'Cheia Sol pentru mâna dreaptă, cheia Fa pentru stânga. Do central stă pe o linie suplimentară între ele.'] },
    n_steps: { p: { rh: LP('C4q D4q E4q F4q G4q A4q B4q C5q'), ts: [4, 4] }, bpm: 96, cap: ['Line, space, line, space: each step up the staff is the next letter.', 'Linie, spațiu, linie, spațiu: fiecare treaptă în sus pe portativ e nota următoare.'] },
    n_acc: { p: { rh: LP('C4q C#4q D4q Eb4q E4h F#4h'), ts: [4, 4] }, bpm: 84, cap: ['Sharps raise, flats lower — C, C♯, D, E♭, E, F♯.', 'Diezii urcă, bemolii coboară — Do, Do♯, Re, Mi♭, Mi, Fa♯.'] },
    dyn1: { p: { rh: LP('C4q D4q E4q F4q G4q F4q E4q D4q C4w'), ts: [4, 4] }, bpm: 100, marks: [['dyn', 0, 'p'], ['cr', 0.3, 3.7], ['dyn', 4, 'f'], ['dim', 4.3, 7.7], ['dyn', 8, 'pp']], cap: ['p → crescendo → f → diminuendo → pp. Press play and listen to the volume follow the marks.', 'p → crescendo → f → diminuendo → pp. Apasă play și ascultă cum volumul urmează semnele.'] },
    dyn2: { p: { rh: LP('G4q G4q G4q G4q E4q E4q E4h'), ts: [4, 4] }, bpm: 100, marks: [['dyn', 0, 'mf'], ['acc', 0], ['stac', 1], ['stac', 2], ['stac', 3], ['dyn', 4, 'sfz'], ['ten', 5], ['fer', 6]], cap: ['Accent >, staccato dots, sfz, tenuto – and a fermata 𝄐 at the end.', 'Accent >, puncte de staccato, sfz, tenuto – și o coroană 𝄐 la final.'] },
    rh1: { p: { rh: LP('C5w C5h C5h C5q C5q C5q C5q C5e C5e C5e C5e C5e C5e C5e C5e'), ts: [4, 4] }, bpm: 80, click: true, cap: ['Whole, halves, quarters, eighths — each bar is 4 beats. The click marks the beat.', 'Notă întreagă, doimi, pătrimi, optimi — fiecare măsură are 4 timpi. Clicul marchează timpul.'] },
    iv1: { p: { rh: LP('C4+D4h C4+E4h C4+F4h C4+G4h C4+A4h C4+B4h C4+C5w'), ts: [4, 4] }, bpm: 72, marks: [['txt', 0, ['M2', '2M']], ['txt', 2, ['M3', '3M']], ['txt', 4, ['P4', '4p']], ['txt', 6, ['P5', '5p']], ['txt', 8, ['M6', '6M']], ['txt', 10, ['M7', '7M']], ['txt', 12, ['P8', '8p']]], cap: ['Intervals from C. Tap each note, or play the whole row.', 'Intervale de la Do. Atinge fiecare notă sau cântă tot rândul.'] },
    ch_inv: { p: { rh: LP('C4+E4+G4h E4+G4+C5h G4+C5+E5w'), ts: [4, 4] }, bpm: 72, marks: [['txt', 0, ['root', 'fund.']], ['txt', 2, ['1st inv.', 'răst. I']], ['txt', 4, ['2nd inv.', 'răst. II']]], cap: ['C major in root position and its two inversions — same notes, new bass.', 'Do major în poziție fundamentală și cele două răsturnări — aceleași note, alt bas.'] },
    pr1: { p: { rh: LP('C4+E4+G4w B3+D4+G4w C4+E4+A4w C4+F4+A4w'), lh: LP('C3w G2w A2w F2w'), ts: [4, 4] }, bpm: 96, marks: [['rn', 0, 'I'], ['rn', 4, 'V'], ['rn', 8, 'vi'], ['rn', 12, 'IV']], cap: ['I – V – vi – IV in C with smooth voice leading: the right hand barely moves.', 'I – V – vi – IV în Do cu conducere lină a vocilor: mâna dreaptă abia se mișcă.'] },
    sym1: { p: { rh: LP('E4q F4q G4h G4q F4q E4h D4q E4q F4q D4q C4w'), ts: [4, 4] }, bpm: 100, seq: [[0, 8], [0, 16]],
        marks: [['rs', 0], ['re', 8], ['fing', 0, '3'], ['fing', 1, '4'], ['fing', 2, '5'], ['tr', 6], ['fer', 12], ['txt', 12, 'Fine'], ['ped', 8, 11.8], ['slur', 8, 11]],
        cap: ['Repeat signs: bars 1–2 play twice. Also fingering, a trill (tr), a slur, pedal and a fermata.', 'Semne de repetiție: măsurile 1–2 se cântă de două ori. Plus digitație, un tril (tr), legato, pedală și o coroană.'] },
    rh2a: { p: { rh: LP('C5q Rq C5q Rq C5h Rh C5h C5h C5w'), ts: [4, 4] }, bpm: 84, click: true, marks: [['tie', 10, 12]], cap: ['Rests are counted silences; the tie joins the last two notes into one 6-beat sound.', 'Pauzele sunt tăceri numărate; legato-ul de prelungire unește ultimele două note într-un sunet de 6 timpi.'] },
    rh2b: { p: { rh: LP('C5q C5q C5q C5q C5t C5t C5t C5t C5t C5t C5h C5e C5q C5e C5q C5q'), ts: [4, 4] }, bpm: 76, click: true, marks: [['tri', 4, 4.67], ['tri', 5, 5.67], ['acc', 8.5], ['acc', 9.5]], cap: ['Bar 2: triplets (3 in the time of 2). Bar 3: syncopation — the accents fall between the clicks.', 'Măsura 2: triolete (3 în timpul a 2). Măsura 3: sincopă — accentele cad între clicuri.'] },
    rh2c: { p: { rh: LP('C5e D5e E5e F5e E5e D5e C5dq G4dq C5e D5e E5e C5dq'), ts: [6, 8] }, bpm: 108, click: true, cap: ['6/8: two dotted-quarter beats per bar, each split in three.', '6/8: doi timpi de pătrime cu punct pe măsură, fiecare împărțit în trei.'] },
    iv2a: { p: { rh: LP('F4+B4h B4+F5h C4+Eb4h C4+D#4h'), ts: [4, 4] }, bpm: 72, marks: [['txt', 0, ['A4', '4+']], ['txt', 2, ['d5', '5−']], ['txt', 4, ['m3', '3m']], ['txt', 6, ['A2', '2+']]], cap: ['Same sounds, different spellings: tritone as A4 / d5, and m3 vs A2.', 'Aceleași sunete, scrieri diferite: tritonul ca 4+ / 5−, și 3m vs 2+.'] },
    minor1: { p: { rh: LP('A4e B4e C5e D5e E5e F5e G5e A5e A4e B4e C5e D5e E5e F5e G#5e A5e A4e B4e C5e D5e E5e F#5e G#5e A5e'), ts: [4, 4] }, bpm: 100, marks: [['txt', 0, ['natural', 'natural']], ['txt', 4, ['harmonic', 'armonic']], ['txt', 8, ['melodic ↑', 'melodic ↑']]], cap: ['A minor three ways — watch the 6th and 7th change.', 'La minor în trei feluri — urmărește cum se schimbă treptele 6 și 7.'] },
    ch7a: { p: { rh: LP('C4+E4+G4+B4h C4+E4+G4+Bb4h C4+Eb4+G4+Bb4h C4+Eb4+Gb4+Bb4h C4+Eb4+Gb4+A4w'), ts: [4, 4] }, bpm: 66, marks: [['txt', 0, ['Cmaj7', 'Domaj7']], ['txt', 2, ['C7', 'Do7']], ['txt', 4, ['Cm7', 'Dom7']], ['txt', 6, ['Cm7♭5', 'Dom7♭5']], ['txt', 8, ['Cdim7', 'Dodim7']]], cap: ['Five seventh chords on C (the dim7’s top note is written A for B𝄫).', 'Cinci acorduri de septimă pe Do (nota de sus a lui dim7 e scrisă La în loc de Si𝄫).'] },
    ch7b: { p: { rh: LP('C4+D4+G4h C4+F4+G4h C4+E4+G4+A4h C4+E4+G4+D5h C4+E4+G4w'), lh: LP('C3h C3h C3h C3h E3w'), ts: [4, 4] }, bpm: 66, marks: [['txt', 0, ['Csus2', 'Dosus2']], ['txt', 2, ['Csus4', 'Dosus4']], ['txt', 4, ['C6', 'Do6']], ['txt', 6, ['Cadd9', 'Doadd9']], ['txt', 8, ['C/E', 'Do/Mi']]], cap: ['Colour chords, ending with a slash chord: C over E in the bass.', 'Acorduri de culoare, apoi un acord slash: Do cu Mi în bas.'] },
    cad1: { p: { rh: LP('D4+G4+B4h C4+E4+G4h C4+F4+A4h C4+E4+G4h C4+E4+G4h D4+G4+B4h D4+G4+B4h C4+E4+A4h'), lh: LP('G2h C3h F2h C3h C3h G2h G2h A2h'), ts: [4, 4] }, bpm: 72,
        marks: [['txt', 0, ['Perfect', 'Perfectă']], ['txt', 4, ['Plagal', 'Plagală']], ['txt', 8, ['Half', 'Semicadență']], ['txt', 12, ['Deceptive', 'Întreruptă']], ['rn', 0, 'V'], ['rn', 2, 'I'], ['rn', 4, 'IV'], ['rn', 6, 'I'], ['rn', 8, 'I'], ['rn', 10, 'V'], ['rn', 12, 'V'], ['rn', 14, 'vi']], cap: ['The four cadences, one per bar. Tap a chord or play them all.', 'Cele patru cadențe, câte una pe măsură. Atinge un acord sau cântă-le pe toate.'] },
    minh1: { p: { rh: LP('C4+E4+A4w D4+F4+A4w B3+E4+G#4w C4+E4+A4w'), lh: LP('A2w D3w E3w A2w'), ts: [4, 4] }, bpm: 84, marks: [['rn', 0, 'i'], ['rn', 4, 'iv'], ['rn', 8, 'V'], ['rn', 12, 'i'], ['txt', 8, ['G♯ = leading tone', 'Sol♯ = sensibila']]], cap: ['i – iv – V – i in A minor. The G♯ makes V major.', 'i – iv – V – i în La minor. Sol♯ face ca V să fie major.'] },
    elise1: { p: { rh: LP('E5s D#5s E5s D#5s E5s B4s D5s C5s A4e Rs C4s E4s A4s B4e Rs E4s G#4s B4s C5e Rs E4s E5s D#5s'), lh: LP('Re Rdq A2s E3s A3s Rde E2s E3s G#3s Rde A2s E3s A3s Rde'), ts: [3, 8], pickup: 0.5 }, bpm: 66,
        marks: [['dyn', 0, 'pp'], ['rn', 2, 'i'], ['rn', 3.5, 'V'], ['rn', 5, 'i']], cap: ['Für Elise, bars 1–4 (Beethoven): A minor i – V – i. Hear the G♯ in bar 3.', 'Für Elise, măsurile 1–4 (Beethoven): La minor i – V – i. Ascultă Sol♯ din măsura 3.'] },
    nct1: { p: { rh: LP('E4q F4q G4h E4q F4q E4h C5h B4h D5h C5h'), lh: LP('C3+G3w C3+G3w G2+D3w C3+G3w'), ts: [4, 4] }, bpm: 76,
        marks: [['txt', 1, ['P', 'T']], ['txt', 5, ['N', 'B']], ['txt', 8, ['S', 'Î']], ['txt', 12, ['App', 'Ap']], ['acc', 12]], cap: ['Passing tone, neighbour, suspension (4–3) and appoggiatura over simple chords.', 'Notă de trecere, broderie, întârziere (4–3) și apogiatură peste acorduri simple.'] },
    sd1: { p: { rh: LP('C4+E4+G4w C4+D4+F#4+A4w B3+D4+G4w C4+E4+G4w'), lh: LP('C3w D3w G2w C3w'), ts: [4, 4] }, bpm: 84, marks: [['rn', 0, 'I'], ['rn', 4, 'V/V'], ['rn', 8, 'V'], ['rn', 12, 'I'], ['txt', 4, 'F♯']], cap: ['I – V/V – V – I in C: the F♯ leans into G.', 'I – V/V – V – I în Do: Fa♯ trage spre Sol.'] },
    form1: { p: { rh: LP('C4q E4q G4q E4q F4q A4q G4h E4q C4q D4q F4q E4q D4q D4h C4q E4q G4q E4q F4q A4q G4h E4q G4q F4q D4q C4w'), lh: LP('C3w F3h C3h C3h G2h G2w C3w F3h C3h G2w C3w'), ts: [4, 4] }, bpm: 108,
        marks: [['txt', 0, ['Antecedent', 'Antecedent']], ['txt', 16, ['Consequent', 'Consecvent']], ['slur', 0, 14], ['slur', 16, 28], ['rn', 12, 'V'], ['rn', 28, 'I']], cap: ['An 8-bar period: question (ends on V, half cadence) and answer (ends on I).', 'O perioadă de 8 măsuri: întrebare (se termină pe V, semicadență) și răspuns (se termină pe I).'] },
    acc1: { p: { rh: LP('E5h D5h C5w'), lh: LP('C3e G3e E3e G3e B2e G3e D3e G3e C3e G3e E3e G3e C3e G3e E3e G3e'), ts: [4, 4] }, bpm: 96, marks: [['txt', 0, ['Alberti bass: 1-5-3-5', 'Bas Alberti: 1-5-3-5']]], cap: ['A simple melody over an Alberti bass — the left hand breaks each chord low-high-middle-high.', 'O melodie simplă peste un bas Alberti — mâna stângă desface acordul jos-sus-mijloc-sus.'] },
};
const LSR: Record<string, SrRenderResult> = {};
function lStaffSvg(key: string) {
    const S = LSTAVES[key];
    const P = Object.assign({ noNames: true }, S.p);
    const r = srRender(P);
    LSR[key] = r;
    const lhTop = P.rh ? 150 : 46, botY = (P.lh ? lhTop : 46) + 48, dynY = 124, rnY = botY + 24;
    const top = (h: string) => h === 'lh' ? lhTop : 46;
    const bx = (b: number) => { const pts = r.beatX; for (let i = 0; i < pts.length - 1; i++) {
        if (b >= pts[i].b - 1e-3 && b <= pts[i + 1].b + 1e-3) {
            const f = (b - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + Math.min(1, Math.max(0, f)) * (pts[i + 1].x - pts[i].x);
        }
    } return pts[pts.length - 1].x; };
    const nAt = (b: number, h: SrHand|undefined) => { const c = r.notes.filter((n) => Math.abs(n.beat - b) < 0.02 && (!h || n.hand === h)); return c.length ? c.reduce((a, n) => n.y < a.y ? n : a) : null; };
    const many = (b: number) => r.notes.filter((n) => Math.abs(n.beat - b) < 0.02).length > 1;
    const T = (x: number, y: number, s: string, c: string, anc?: string) => '<text class="lm ' + (c || '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (anc ? ' text-anchor="' + anc + '"' : '') + '>' + s + '</text>';
    let out = '', needH = 0;
    (S.marks || []).forEach((mk) => {
        const k = mk[0], b = mk[1];
        if (k === 'dyn')
            out += T(bx(b) - 6, dynY, mk[2], 'lm-dyn');
        else if (k === 'cr' || k === 'dim') {
            const x1 = bx(b), x2 = bx(mk[2]), y = dynY - 5;
            out += '<path class="lm-ln" d="' + (k === 'cr' ? 'M' + x2 + ',' + (y - 5) + ' L' + x1 + ',' + y + ' L' + x2 + ',' + (y + 5) : 'M' + x1 + ',' + (y - 5) + ' L' + x2 + ',' + y + ' L' + x1 + ',' + (y + 5)) + '"/>';
        }
        else if (k === 'acc' || k === 'stac' || k === 'ten') {
            const n = nAt(b, mk[2]);
            if (!n)
                return;
            const up = !many(b) && n.y > top(n.hand) + 24, y = up ? n.y + 15 : n.y - 15, x = n.x;
            out += k === 'acc' ? '<path class="lm-ln" d="M' + (x - 5) + ',' + (y - 4) + ' L' + (x + 5) + ',' + y + ' L' + (x - 5) + ',' + (y + 4) + '"/>' : k === 'stac' ? '<circle class="lm-f" cx="' + x + '" cy="' + y + '" r="2"/>' : '<path class="lm-ln" d="M' + (x - 5) + ',' + y + ' L' + (x + 5) + ',' + y + '"/>';
        }
        else if (k === 'fer') {
            const n = nAt(b, mk[2]);
            if (!n)
                return;
            const y = Math.min(n.y - 16, top(n.hand) - 8), x = n.x;
            out += '<path class="lm-ln" d="M' + (x - 8) + ',' + y + ' A8,8 0 0 1 ' + (x + 8) + ',' + y + '"/><circle class="lm-f" cx="' + x + '" cy="' + (y - 2) + '" r="1.8"/>';
        }
        else if (k === 'tr') {
            const n = nAt(b, mk[2]);
            if (n)
                out += T(n.x - 5, Math.min(n.y - 16, top(n.hand) - 8), 'tr', 'lm-it');
        }
        else if (k === 'fing') {
            const n = nAt(b, mk[3]);
            if (n)
                out += T(n.x, top(n.hand) - 8, mk[2], 'lm-sm', 'middle');
        }
        else if (k === 'slur' || k === 'tie') {
            const n1 = nAt(b, mk[3]), n2 = nAt(mk[2], mk[3]);
            if (!n1 || !n2)
                return;
            const mid = top(n1.hand) + 24, below = n1.y > mid && n2.y > mid, s = below ? 1 : -1, x1 = n1.x + (k === 'tie' ? 6 : 0), x2 = n2.x - (k === 'tie' ? 6 : 0), y1 = n1.y + s * (k === 'tie' ? 8 : 11), y2 = n2.y + s * (k === 'tie' ? 8 : 11), cy = (below ? Math.max(y1, y2) : Math.min(y1, y2)) + s * (k === 'tie' ? 8 : 14);
            out += '<path class="lm-sl" d="M' + x1 + ',' + y1 + ' C' + (x1 + (x2 - x1) * 0.25) + ',' + cy + ' ' + (x1 + (x2 - x1) * 0.75) + ',' + cy + ' ' + x2 + ',' + y2 + '"/>';
        }
        else if (k === 'tri') {
            const x1 = bx(b) - 4, x2 = bx(mk[2]) + 4, y = 34;
            out += '<path class="lm-ln" d="M' + x1 + ',' + (y + 4) + ' L' + x1 + ',' + y + ' L' + (x2 + x1) / 2 + ',' + y + ' M' + (x2 + x1) / 2 + ',' + y + ' L' + x2 + ',' + y + ' L' + x2 + ',' + (y + 4) + '"/>' + T((x1 + x2) / 2, y - 3, '3', 'lm-it', 'middle');
        }
        else if (k === 'txt')
            out += T(bx(b) - 6, 18, LT(mk[2]), 'lm-tx');
        else if (k === 'rn') {
            out += T(bx(b), P.lh ? rnY : dynY, mk[2], 'lm-rn', 'middle');
            if (P.lh)
                needH = Math.max(needH, rnY + 12);
        }
        else if (k === 'ped') {
            const y = P.lh ? botY + 22 : dynY;
            out += T(bx(b) - 8, y, 'Ped.', 'lm-it') + T(bx(mk[2]) + 4, y, '✱', 'lm-sm');
            if (P.lh)
                needH = Math.max(needH, y + 10);
        }
        else if (k === 'rs' || k === 're') {
            const end = k === 're' && b >= r.total - 1e-3, xb = end ? bx(r.total) : bx(b) - (b < 1e-3 ? 20 : 22), dir = k === 'rs' ? 1 : -1;
            out += '<rect class="lm-f" x="' + (xb - (k === 'rs' ? 0 : 3)) + '" y="46" width="3" height="' + (botY - 46) + '"/><line class="lm-ln" x1="' + (xb + dir * 6) + '" y1="46" x2="' + (xb + dir * 6) + '" y2="' + botY + '"/>';
            [46].concat(P.rh && P.lh ? [150] : []).forEach((st) => { out += '<circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 18) + '" r="2.2"/><circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 30) + '" r="2.2"/>'; });
        }
    });
    let svg = r.svg;
    if (needH)
        svg = svg.replace(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/, (m: string, w: string, h: string) => { const H = Math.max(+h, needH); return 'viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '"'; });
    svg = svg.replace(/<g class="ss-n" data-nid="(\d+)">/g, (m: string, id: string) => { const n = r.notes[+id]; return '<g class="ss-n" data-nid="' + id + '" tabindex="0" role="button" aria-label="' + t('lu_note_aria', noteName(n.midi, (P.keyN || 0) < 0), Math.floor(n.beat - (P.pickup || 0) + 1e-3) + 1) + '">'; });
    svg = svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="group" aria-label="' + LT(S.cap).replace(/"/g, '&quot;') + '"');
    return svg.replace('</svg>', out + '</svg>');
}
function lStaffHTML(key: string) {
    const S = LSTAVES[key];
    if (!S)
        return '';
    return '<figure class="lstaff" data-lstaff="' + key + '"><div class="ss-wrap lstaff-svg">' + lStaffSvg(key) + '</div><figcaption><button type="button" class="btn ghost sm" data-lplay="' + key + '" aria-pressed="false">' + t('lu_play_ex') + '</button><span>' + LT(S.cap) + ' <em class="lstaff-hint">' + t('lu_staff_hint') + '</em></span></figcaption></figure>';
}
const LVEL: Record<string, number> = { pp: 40, p: 55, mp: 70, mf: 84, f: 100, ff: 112 };
type LDynMark = ['dyn', number, string];
function lVel(S: LStaffSpec, b: number) {
    const M = S.marks || [];
    let base = 80, bb = -1;
    M.forEach((m) => { if (m[0] === 'dyn' && LVEL[m[2]] && m[1] <= b + 1e-3 && m[1] >= bb) {
        base = LVEL[m[2]];
        bb = m[1];
    } });
    M.forEach((m) => { if ((m[0] === 'cr' || m[0] === 'dim') && b >= m[1] && b <= m[2]) {
        const end = m[2];
        const nx = M.filter((x): x is LDynMark => x[0] === 'dyn' && !!LVEL[x[2]] && x[1] >= end - 0.5).sort((a, c) => a[1] - c[1])[0];
        if (nx)
            base = base + (LVEL[nx[2]] - base) * (b - m[1]) / Math.max(0.5, nx[1] - m[1]);
    } });
    if (M.some((m) => m[0] === 'dyn' && m[2] === 'sfz' && Math.abs(m[1] - b) < 0.02))
        base = 118;
    if (M.some((m) => m[0] === 'acc' && Math.abs(m[1] - b) < 0.02))
        base = Math.min(124, base + 24);
    return Math.round(base);
}
/** The audio clock, for scheduling; Learn only plays after `ensureAudio()`, so a missing context is a bug. */
function learnCtxTime(): number {
    if (!actx)
        throw new TypeError('Étude: audio context unavailable');
    return actx.currentTime;
}
type LTieMark = ['slur' | 'tie', number, number, SrHand?];
async function lStaffPlay(key: string, btn: HTMLElement) {
    const was = btn.getAttribute('aria-pressed') === 'true';
    learnHalt();
    if (was)
        return;
    ensureAudio();
    if (!await preparePiano())
        return;
    if (view0() !== 'learn')
        return;
    const g = LGEN;
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = t('lu_stop');
    const S = LSTAVES[key], r = LSR[key], spb = 60 / (S.bpm || 90), fig = btn.closest('.lstaff');
    if (!fig)
        throw new TypeError('Étude: play button outside its staff');
    const svg = fig.querySelector('svg'), wrap = fig.querySelector('.lstaff-svg');
    if (!svg || !wrap)
        throw new TypeError('Étude: staff figure is incomplete');
    const M = S.marks || [], has = (k: string, b: number) => M.some((m) => m[0] === k && Math.abs(m[1] - b) < 0.02), ties = M.filter((m): m is LTieMark => m[0] === 'tie');
    const cap = S.p.ts[1] === 8 ? S.p.ts[0] * 0.5 : S.p.ts[0], pk = S.p.pickup || 0, step = S.p.ts[1] === 8 ? 1.5 : 1;
    const t0 = learnCtxTime() + 0.15;
    let off = 0;
    const segs: [number, number][] = S.seq || [[0, r.total]];
    segs.forEach(([a, z]) => {
        r.notes.filter((n) => n.beat >= a - 1e-3 && n.beat < z - 1e-3).forEach((n) => {
            if (ties.some((m) => Math.abs(m[2] - n.beat) < 0.02 && r.notes.some((o) => o.midi === n.midi && Math.abs(o.beat - m[1]) < 0.02)))
                return;
            let dur = n.dur;
            const tie = ties.find((m) => Math.abs(m[1] - n.beat) < 0.02);
            if (tie) {
                const o = r.notes.find((x) => x.midi === n.midi && Math.abs(x.beat - tie[2]) < 0.02);
                if (o)
                    dur += o.dur;
            }
            if (has('fer', n.beat))
                dur *= 1.8;
            const snd = has('stac', n.beat) ? dur * 0.4 : dur * 0.95, at = off + n.beat - a, vel = lVel(S, n.beat);
            if (has('tr', n.beat)) {
                const up = [4, 11].includes(pc(n.midi)) ? 1 : 2, k = Math.max(2, Math.floor(dur / 0.125));
                for (let i = 0; i < k; i++)
                    previewNote(n.midi + (i % 2 ? up : 0), t0 + (at + i * dur / k) * spb, dur / k * spb, vel);
            }
            else
                previewNote(n.midi, t0 + at * spb, snd * spb, vel);
            const found = svg.querySelector('.ss-n[data-nid="' + n.nid + '"]'), el = found instanceof SVGElement ? found : null;
            learnTimer(() => { if (el)
                el.dataset.s = 'now'; kbState(n.midi, 'target', true); if (wrap.scrollWidth > wrap.clientWidth + 4)
                wrap.scrollLeft = Math.max(0, n.x - wrap.clientWidth * 0.4); }, at * spb * 1000 + 150);
            learnTimer(() => { if (el)
                delete el.dataset.s; kbState(n.midi, null, true); }, (at + dur) * spb * 1000 + 120);
        });
        if (S.click) {
            for (let b = Math.ceil((a - pk) / step - 1e-3) * step + pk; b < z - 1e-3; b += step)
                metroClick(t0 + (off + b - a) * spb, Math.abs(((b - pk) % cap + cap) % cap) < 1e-3);
        }
        off += z - a;
    });
    learnTimer(() => { if (g !== LGEN)
        return; btn.setAttribute('aria-pressed', 'false'); btn.textContent = t('lu_play_ex'); kbClear('target'); }, off * spb * 1000 + 700);
}
async function lStaffNote(gEl: HTMLElement | SVGElement) {
    const fig = gEl.closest('.lstaff');
    if (!(fig instanceof HTMLElement))
        return;
    const key = fig.dataset.lstaff ?? '', n = LSR[key] && LSR[key].notes[Number(gEl.dataset.nid)];
    if (!n)
        return;
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    previewNote(n.midi, learnCtxTime() + 0.02, 0.9, 92);
    gEl.dataset.s = 'now';
    learnLight([n.midi], 1100);
    const g = LGEN;
    setTimeout(() => { if (g === LGEN)
        delete gEl.dataset.s; }, 700);
    learnSay(noteName(n.midi, (LSTAVES[key].p.keyN || 0) < 0));
}
function lqLabel(o: LearnText) { return LT(o); }
function lqStart(L: Lesson) {
    const specs: LearnQuizSpec[] = LQZ[L.id] || [];
    const qs = specs.map((q) => {
        const c: LearnQuizRunQuestion = Object.assign({}, q, { got: [], ans: false, ok: false });
        const loc = q.i18n && q.i18n[lang], locOpts = (loc && loc.o) || null;
        if (q.o) {
            c.opts = shuffle(q.o.map((x, i) => ({ x: (locOpts && locOpts[i]) || x, ok: i === (q.a || 0) })));
        }
        return c;
    });
    LQ = { id: L.id, qs, i: 0, score: 0, done: false };
    lqRender();
}
function lqNeed(n: number) { return Math.max(1, Math.round(n * 0.7)); }
function lqMidis(q: LearnQuizSpec) { const ps = q.pcs || q.seq; if (!ps)
    throw new TypeError('Étude: quiz question has nothing to play'); return ps.map((p) => 60 + p); }
function lqRender() {
    const box = maybeById('lq');
    if (!box)
        return;
    const L = LESSONS[learnSel], qz = LQZ[L.id] || [], D = learnData(), done = !!D.learnDone[L.id], rv: Partial<LearnReview> = D.learnRev[L.id] || {};
    let h = '<h4 id="lq-h">✎ ' + t('lu_quiz') + '</h4>';
    if (!LQ || LQ.id !== L.id) {
        h += '<p class="lq-d">' + t('lu_quiz_d', qz.length, lqNeed(qz.length)) + '</p>';
        if (done)
            h += '<p class="lq-st">' + (learnDueDays(L.id) != null ? '<span class="lq-due">↻ ' + t('lu_due_now') + '</span>' : '<span class="read-ok">' + t('lu_complete_rev', Math.max(0, learnGap(L.id) - (todayN() - ((rv.last ?? 0) | 0)))) + '</span>') + (rv.best != null ? ' · ' + t('lu_q_score', rv.best) : '') + '</p>';
        h += '<div class="lq-act"><button type="button" class="btn primary" data-lq="start">' + t('lu_q_start') + '</button>' + (done ? '' : '<button type="button" class="btn ghost sm" data-ln="mark">' + t('lu_mark_manual') + '</button>') + '</div>';
    }
    else if (LQ.done) {
        const n = LQ.qs.length, need = lqNeed(n), pass = LQ.score >= need, sc = LQ.score + '/' + n;
        h += '<p class="lq-res" data-r="' + (pass ? 'good' : 'bad') + '">' + (pass ? (LQ.rev ? t('lu_q_review', sc, learnGap(L.id)) : t('lu_q_pass', sc)) : t('lu_q_fail', sc, need)) + '</p>';
        h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="start">' + t('lu_q_retry') + '</button>' + (pass && learnSel < LESSONS.length - 1 ? '<button type="button" class="btn primary" data-ln="next">' + t('learn_next') + '</button>' : '') + '</div>';
    }
    else {
        const q = LQ.qs[LQ.i], ps = q.pcs || q.seq, loc = q.i18n && q.i18n[lang];
        h += '<p class="lq-n">' + t('lu_q_n', LQ.i + 1, LQ.qs.length) + '</p><p class="lq-q" id="lq-q">' + ((loc && loc.q) || LT(q.q)) + '</p>';
        if (q.hear)
            h += '<p><button type="button" class="btn ghost sm demo" data-demo="' + q.hear + '">' + t('lu_q_hear') + '</button></p>';
        if (ps) {
            const tot = ps.length;
            h += '<p class="lq-play">🎹 ' + t('lu_q_play') + '</p><p class="lq-got" aria-hidden="true">' + Array.from({ length: tot }, (_, i) => '<i' + (i < q.got.length ? ' class="on"' : '') + '></i>').join('') + ' <span>' + t('lu_q_got', q.got.length, tot) + '</span></p>';
            if (!q.ans)
                h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="show">' + t('lu_q_show') + '</button></div>';
        }
        else if (!q.opts)
            throw new TypeError('Étude: quiz question has no options');
        else
            h += '<div class="lq-opts" role="group" aria-labelledby="lq-q">' + q.opts.map((o, i) => '<button type="button" class="lq-o" data-lqo="' + i + '"' + (q.ans ? ' disabled' + (o.ok ? ' data-r="good"' : (q.pick === i ? ' data-r="bad"' : '')) : '') + '>' + lqLabel(o.x) + '</button>').join('') + '</div>';
        if (q.ans) {
            h += '<p class="lq-fb" data-r="' + (q.ok ? 'good' : 'bad') + '">' + q.fb + '</p><div class="lq-act"><button type="button" class="btn primary" data-lq="next">' + t(LQ.i < LQ.qs.length - 1 ? 'lu_q_next' : 'lu_q_finish') + '</button></div>';
        }
    }
    box.innerHTML = h;
}
function learnReveal(el: Element) {
    const d = byId('dock'), dh = d && getComputedStyle(d).display !== 'none' ? d.getBoundingClientRect().height : 0, r = el.getBoundingClientRect(), lim = innerHeight - dh - 16;
    if (r.bottom > lim)
        scrollBy(0, r.bottom - lim);
    else if (r.top < 80)
        scrollBy(0, r.top - 80);
}
function lqFocus(sel: string) { const lq = maybeById('lq'), el = lq && lq.querySelector(sel); if (el instanceof HTMLElement) {
    el.focus({ preventScroll: true });
    learnReveal(el);
} }
function lqAnswer(ok: boolean, fb: string) { if (!LQ)
    return; const q = LQ.qs[LQ.i]; q.ans = true; q.ok = ok; if (ok)
    LQ.score++; q.fb = fb; lqRender(); learnSay(fb); lqFocus('[data-lq="next"]'); }
function lqPick(i: number) {
    const q = LQ && LQ.qs[LQ.i];
    if (!q || q.ans || !q.opts)
        return;
    q.pick = i;
    const o = q.opts[i], right = q.opts.find((x) => x.ok), loc = q.i18n && q.i18n[lang];
    if (!o.ok && !right)
        throw new TypeError('Étude: quiz question has no right answer');
    lqAnswer(o.ok, (o.ok || !right ? t('lu_q_ok') : t('lu_q_no', lqLabel(right.x))) + ((loc && loc.why) ? ' ' + loc.why : (q.why ? ' ' + LT(q.why) : '')));
}
function lqNext() {
    if (!LQ)
        return;
    if (LQ.i < LQ.qs.length - 1) {
        LQ.i++;
        kbClear('target');
        lqRender();
        lqFocus('.lq-o,[data-lq="show"],.lq-q');
        return;
    }
    LQ.done = true;
    kbClear('target');
    const L = LESSONS[learnSel], n = LQ.qs.length, pass = LQ.score >= lqNeed(n);
    if (pass) {
        const r = learnComplete(L, Math.round(100 * LQ.score / n));
        LQ.rev = r.review;
        learnSide();
        learnNavRender();
    }
    lqRender();
    learnSay(byId('lq').querySelector('.lq-res')?.textContent || '');
    lqFocus('.lq-act button');
}
function lqShow() {
    const q = LQ && LQ.qs[LQ.i];
    if (!q || q.ans)
        return;
    const ms = lqMidis(q);
    learnLight(ms, 4000);
    ensureAudio();
    preparePiano().then((ok) => { if (ok)
        ms.forEach((m, i) => previewNote(m, learnCtxTime() + 0.05 + (q.seq ? i * 0.45 : 0), 0.9, 90)); });
    lqAnswer(false, t('lu_q_no', ms.map((m) => pcName(pc(m), false)).join(' – ')));
}
function learnInput() {
    const m: number | undefined = heldOrder[heldOrder.length - 1];
    if (m == null || !LQ || LQ.done)
        return;
    const q = LQ.qs[LQ.i];
    if (!q || q.ans || !(q.pcs || q.seq))
        return;
    const p = pc(m), tot = (q.pcs || q.seq || []).length;
    if (q.pcs) {
        if (q.pcs.includes(p)) {
            if (!q.got.includes(p))
                q.got.push(p);
        }
        else {
            q.got = [];
            lqRender();
            learnSay(t('lu_q_wrongnote', pcName(p, false)));
            return;
        }
    }
    else {
        const seq = q.seq || [];
        if (seq[q.got.length] === p)
            q.got.push(p);
        else {
            q.got = seq[0] === p ? [p] : [];
            lqRender();
            learnSay(t('lu_q_wrongnote', pcName(p, false)));
            return;
        }
    }
    if (q.got.length >= tot)
        lqAnswer(true, t('lu_q_ok'));
    else {
        lqRender();
        learnSay(t('lu_q_got', q.got.length, tot));
    }
}
function learnRdLevel(u: LearnUnit) {
    const units = RD_UNITS.filter((x) => u.rd.includes(x.u));
    let pick: ReadDrillLevel | null = null;
    units.some((x) => x.lv.some((L) => { if (rdUnlocked(L) && (rdData().lv[L.id]?.s || 0) < 1) {
        pick = L;
        return true;
    } return false; }));
    if (!pick) {
        const all = units.flatMap((x) => x.lv).filter(rdUnlocked);
        pick = all[all.length - 1] || (units[0] && units[0].lv[0]);
    }
    return pick;
}
function learnSide() {
    const toc = byId('learnToc');
    if (!toc)
        return;
    const D = learnData(), done = D.learnDone, nDone = LESSONS.filter((L) => done[L.id]).length;
    byId('learnMeta').textContent = t('learn_read_n', nDone, LESSONS.length);
    byId('learnProg').style.width = Math.round(100 * nDone / LESSONS.length) + '%';
    let h = '', opt = '';
    LEARN_UNITS.forEach((u, ui) => {
        const open = learnUnitOpen(ui), nm = (u[lang] || u.en);
        h += '<div class="lu-h" data-open="' + open + '"><span aria-hidden="true">' + u.icon + '</span><span class="lu-nm">' + nm + '</span><span class="lu-c">' + (open ? t('lu_done_n', learnUnitDone(ui), u.ls.length) : '<span role="img" aria-label="' + t('lu_locked') + '">🔒</span>') + '</span></div>';
        opt += '<optgroup label="' + nm + (open ? '' : ' 🔒') + '">';
        u.ls.forEach((id) => {
            const i = LESSONS.findIndex((L) => L.id === id);
            if (i < 0)
                return;
            const L = LESSONS[i], due = learnDueDays(id) != null;
            h += '<button type="button" data-li="' + i + '" aria-current="' + (i === learnSel && !learnGloss) + '"' + (open ? '' : ' data-locked="true"') + '><span class="ic" aria-hidden="true">' + L.icon + '</span>' + learnTitle(L) +
                (due ? '<span class="due" role="img" aria-label="' + t('lu_due') + '">↻</span>' : done[id] ? '<span class="done" role="img" aria-label="' + t('learn_done_aria') + '">✓</span>' : '') + '</button>';
            opt += '<option value="' + i + '"' + (i === learnSel ? ' selected' : '') + '>' + learnTitle(L) + (done[id] ? ' ✓' : '') + '</option>';
        });
        opt += '</optgroup>';
    });
    toc.innerHTML = h;
    byId('learnExtra').innerHTML = '<label class="learn-pick"><span>' + t('lu_pick') + '</span><select id="learnPick">' + opt + '</select></label><button type="button" class="btn ghost sm" id="learnGlossBtn" aria-pressed="' + learnGloss + '">📖 ' + t('lu_gloss') + '</button>';
}
function learnNavRender() {
    const nav = byId('learnBody').querySelector('.learn-nav');
    if (!nav)
        return;
    const L = LESSONS[learnSel], D = learnData(), isRead = !!D.learnDone[L.id], last = learnSel === LESSONS.length - 1;
    nav.innerHTML = '<button type="button" class="btn ghost sm" data-ln="prev"' + (learnSel === 0 ? ' disabled' : '') + '>' + t('learn_prev') + '</button>' +
        '<div class="mid">' + (isRead ? '<span class="read-ok">✓ ' + t('lu_complete') + '</span><button type="button" class="btn ghost sm" data-ln="unmark">' + t('learn_unmark') + '</button>' : '') + '</div>' +
        '<button type="button" class="btn ghost sm" data-ln="next"' + (last ? ' disabled' : '') + '>' + t('learn_next') + '</button>';
}
let learnWired = false;
function learnWire() {
    if (learnWired)
        return;
    learnWired = true;
    const side = (document).querySelector('#view-learn .learn-side'), toc = byId('learnToc');
    const ex = (document).createElement('div');
    ex.id = 'learnExtra';
    ex.className = 'learn-extra';
    toc.after(ex);
    const live = (document).createElement('div');
    live.id = 'learnLive';
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    side?.appendChild(live);
    toc.addEventListener('click', (e) => { const b = eventClosest(e, '[data-li]'); if (b)
        learnGo(Number(b.dataset.li)); });
    ex.addEventListener('change', (e) => { const pick = e.target; if (pick instanceof HTMLSelectElement && pick.id === 'learnPick')
        learnGo(+pick.value); });
    ex.addEventListener('click', (e) => { if (eventClosest(e, '#learnGlossBtn')) {
        learnGloss = !learnGloss;
        LQ = null;
        renderLearn();
        const s = maybeById('lg-q');
        if (s)
            s.focus();
    } });
    const body = byId('learnBody');
    body.addEventListener('keydown', (e) => { const tg = eventElement(e), g = tg && tg.closest('.lstaff .ss-n'); if (g instanceof SVGElement && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        lStaffNote(g);
    } });
    body.addEventListener('input', (e) => { const tg = eventElement(e); if (tg && tg.id === 'lg-q')
        lgFilter();
    else
        lwInput(e); });
    body.addEventListener('change', (e) => lwInput(e));
}
function learnBodyHTML(L: Lesson) { return L[lang]?.b || L.en.b; }
let renderLearn: { (): void; _init?: boolean } = function renderLearn() {
    const body = byId('learnBody');
    if (!body || !byId('learnToc'))
        return;
    learnWire();
    learnInitSel();
    learnHalt();
    learnSide();
    if (learnGloss) {
        body.innerHTML = lgHTML();
        lgFilter();
        return;
    }
    const L = LESSONS[learnSel], ui = learnUnitOf(L.id), u = LEARN_UNITS[ui], open = learnUnitOpen(ui), rl = u ? learnRdLevel(u) : null;
    let h = '<div class="lu-bar"><span class="lu-unit"><span aria-hidden="true">' + (u ? u.icon : '') + '</span> ' + t('lu_unit', ui + 1, LEARN_UNITS.length) + ' · <b>' + (u ? (u[lang] || u.en) : '') + '</b></span>' +
        (rl && open ? '<button type="button" class="btn ghost sm" data-rd="' + rl.id + '" aria-label="' + t('lu_practise_aria') + ': ' + rdLvName(rl) + '">' + t('lu_practise', rdLvName(rl)) + ' →</button>' : '') + '</div><h3>' + learnTitle(L) + '</h3>';
    if (!open) {
        const prev = LEARN_UNITS[ui - 1], firstOpen = LESSONS.findIndex((x) => prev.ls.includes(x.id) && !learnData().learnDone[x.id]);
        h += '<div class="lu-lock"><p class="lu-lock-t">🔒 ' + t('lu_locked_t') + '</p><p>' + t('lu_locked_d', (prev[lang] || prev.en)) + '</p><div class="lq-act">' +
            (firstOpen >= 0 ? '<button type="button" class="btn primary" data-li="' + firstOpen + '">' + t('lu_goto', learnTitle(LESSONS[firstOpen])) + '</button>' : '') +
            '<button type="button" class="btn ghost sm" data-ln="unlock">' + t('lu_unlock') + '</button></div></div><div class="learn-nav"></div>';
        body.innerHTML = h;
        learnNavRender();
        return;
    }
    h += '<div class="learn-content">' + learnBodyHTML(L) + '</div>';
    const sum: LearnSummaryRow[] | undefined = LSUM[L.id];
    if (sum)
        h += '<section class="lsum" aria-labelledby="lsum-h"><h4 id="lsum-h">📋 ' + t('lu_sum') + '</h4><dl>' + sum.map((r, ri) => { const sRow = LSUM_I18N[lang]?.[L.id]?.[ri] ?? [LT(r[0]), LT(r[1])]; return '<div><dt>' + sRow[0] + '</dt><dd>' + sRow[1] + '</dd></div>'; }).join('') + '</dl></section>';
    if (LQZ[L.id])
        h += '<section class="lq" id="lq" aria-labelledby="lq-h"></section>';
    h += '<div class="learn-nav"></div>';
    body.innerHTML = h;
    queryAllHtml(body, '[data-staff]').forEach((el) => { el.outerHTML = lStaffHTML(el.dataset.staff ?? ''); });
    queryAllHtml(body, '[data-widget]').forEach((el) => lwMount(el));
    body.querySelectorAll('[data-bars]').forEach((el) => { el.outerHTML = lBarsHTML(); });
    body.querySelectorAll('[data-an]').forEach((el) => { if (!el.textContent.trim())
        el.textContent = t('lu_an_btn'); });
    if (LQ && LQ.id !== L.id)
        LQ = null;
    lqRender();
    learnNavRender();
    const cur = byId('learnToc').querySelector('[aria-current="true"]');
    const toc = byId('learnToc');
    if (cur && toc.scrollHeight > toc.clientHeight)
        cur.scrollIntoView({ block: 'nearest' });
};
function learnClick(e: Event) {
    const g = eventClosest(e, '[data-go]');
    if (g) {
        e.preventDefault();
        const c = g.dataset.cat;
        show(g.dataset.go);
        if (g.dataset.extab)
            exTab(g.dataset.extab);
        if (c && byId('pr-cat'))
            selectById('pr-cat').value = c;
        return;
    }
    if (eventClosest(e, '[data-lgback]')) {
        learnGloss = false;
        renderLearn();
        return;
    }
    const lg = eventClosest(e, '[data-lgo]');
    if (lg) {
        e.preventDefault();
        learnGloss = false;
        learnGoId(lg.dataset.lgo ?? '');
        return;
    }
    const li = eventClosest(e, '[data-li]');
    if (li) {
        learnGo(Number(li.dataset.li));
        return;
    }
    const ln = eventClosest(e, '[data-ln]');
    if (ln) {
        const a = ln.dataset.ln, L = LESSONS[learnSel];
        if (a === 'prev')
            learnGo(learnSel - 1);
        else if (a === 'next')
            learnGo(learnSel + 1);
        else if (a === 'mark') {
            learnMark(true);
            learnSide();
            lqRender();
            learnNavRender();
            learnSay(t('lu_complete'));
        }
        else if (a === 'unmark') {
            learnMark(false);
            LQ = null;
            learnSide();
            lqRender();
            learnNavRender();
        }
        else if (a === 'unlock') {
            const u = LEARN_UNITS[learnUnitOf(L.id)];
            learnData().learnUnlock[u.id] = todayN();
            saveAll();
            renderLearn();
        }
        return;
    }
    const lq = eventClosest(e, '[data-lq]');
    if (lq) {
        const a = lq.dataset.lq;
        if (a === 'start') {
            lqStart(LESSONS[learnSel]);
            lqFocus('.lq-o,[data-lq="show"],.lq-q');
        }
        else if (a === 'next')
            lqNext();
        else if (a === 'show')
            lqShow();
        return;
    }
    const lo = eventClosest(e, '[data-lqo]');
    if (lo) {
        lqPick(Number(lo.dataset.lqo));
        return;
    }
    const lp = eventClosest(e, '[data-lplay]');
    if (lp) {
        lStaffPlay(lp.dataset.lplay ?? '', lp);
        return;
    }
    const snFrom = eventElement(e), sn = snFrom && snFrom.closest('.lstaff .ss-n');
    if (sn instanceof SVGElement) {
        lStaffNote(sn);
        return;
    }
    const rd = eventClosest(e, '[data-rd]');
    if (rd) {
        const L = RD_LV[rd.dataset.rd ?? ''];
        show('read');
        rdTab('drills');
        if (L && rdUnlocked(L))
            rdOpen(L);
        return;
    }
    const an = eventClosest(e, '[data-an]');
    if (an) {
        show('analysis');
        anLoadExample(an.dataset.an ?? '');
        return;
    }
    const w = eventClosest(e, '[data-w]');
    if (w) {
        lwClick(w);
        return;
    }
    const d = eventClosest(e, '.demo');
    if (d)
        runDemo(d.dataset.demo, d);
}
function lSeqLight(chords: number[][], stepMs: number, holdMs: number) {
    chords.forEach((ms, i) => learnTimer(() => { kbClear('target'); ms.forEach((m) => kbState(m, 'target', true)); }, i * stepMs));
    learnTimer(() => kbClear('target'), (chords.length - 1) * stepMs + (holdMs || stepMs));
}
const LBLUES = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
function lBarsHTML() {
    const rn: Record<number, string> = { 0: 'I7', 5: 'IV7', 7: 'V7' };
    return '<div class="lbars" role="list" aria-label="' + t('lw_blues') + '">' + LBLUES.map((d, i) => '<span role="listitem" data-bar="' + i + '"><b>' + rn[d] + '</b><small>' + pcName(d, d === 5) + '7</small></span>').join('') + '</div>';
}
const LACC_CH = [{ bass: 48, right: [60, 64, 67], fifth: 55 }, { bass: 45, right: [60, 64, 69], fifth: 52 }, { bass: 41, right: [60, 65, 69], fifth: 48 }, { bass: 43, right: [59, 62, 67], fifth: 50 }];
async function runDemo(spec: string|undefined, btn: HTMLElement) {
    ensureAudio();
    learnHalt();
    const g = LGEN;
    if (spec === undefined)
        throw new TypeError('Étude: demo button without data-demo');
    const p = spec.split(':'), kind = p[0];
    if (kind !== 'beat' && !await preparePiano())
        return;
    if (g !== LGEN || view0() !== 'learn')
        return;
    const T0 = learnCtxTime() + 0.06;
    if (kind === 'n') {
        const m = +p[1];
        previewNote(m, T0, 0.9, 96);
        learnLight([m], 1300);
    }
    else if (kind === 'run') {
        const ms = p[1].split('.').map(Number);
        ms.forEach((m, i) => previewNote(m, T0 + i * 0.4, 0.38, 92));
        lSeqLight(ms.map((m) => [m]), 400, 700);
    }
    else if (kind === 'ms') {
        const ms = p[1].split('.').map(Number);
        playChordMidis(ms, true);
        learnLight(ms, ms.length * 160 + 1500);
    }
    else if (kind === 'iv') {
        const root = +p[1], semi = +p[2];
        playInterval(root, semi, 'both');
        learnLight([root, root + semi], 2300);
    }
    else if (kind === 'ch') {
        const c = CHORDS.find((x) => x.symbol === p.slice(2).join(':'));
        if (c) {
            const ms = c.intervals.map((i) => +p[1] + i);
            playChordMidis(ms, true);
            learnLight(ms, ms.length * 160 + 1500);
        }
    }
    else if (kind === 'sc') {
        const nm = p.slice(2).join(':'), o = SCALES[nm];
        if (o) {
            const root = +p[1];
            playScaleNotes(root, o, true);
            lSeqLight(o.concat([12]).map((x) => [root + x]), 270, 600);
        }
    }
    else if (kind === 'pr') {
        const nm = p.slice(2).join(':'), prog = PROGS.find((x) => x.name === nm) || ACCOMP_PROGS.find((x) => x.name === nm);
        if (prog) {
            const rp = +p[1];
            playProg(rp, prog);
            lSeqLight(prog.chords.map((ch) => { const r = 60 + ((rp + ch[0]) % 12), tp = progChordTpl(ch[1]); return tp ? tp.intervals.map((i) => r + i) : [r]; }), 900, 900);
        }
    }
    else if (kind === 'blues') {
        const rp = +p[1] || 0, spb = 0.3, bars = byId('learnBody').querySelectorAll('.lbars [data-bar]');
        const chs = LBLUES.map((d) => { const r = (rp + d) % 12, root = 60 + r - (r > 7 ? 12 : 0); return { bass: 36 + r, ms: [root, root + 4, root + 7, root + 10] }; });
        chs.forEach((c, i) => {
            const b0 = T0 + i * 4 * spb;
            previewNote(c.bass, b0, spb * 1.9, 84);
            previewNote(c.bass + 7, b0 + 2 * spb, spb * 1.9, 76);
            [0, 1.5, 2, 3.5].forEach((k, j) => c.ms.slice(1).forEach((m) => previewNote(m, b0 + k * spb, j % 2 ? spb * 0.45 : spb * 0.9, j % 2 ? 66 : 80)));
        });
        previewNote(36 + rp, T0 + 48 * spb, 1.4, 84);
        [60, 64, 67, 70].forEach((m) => previewNote(m + rp, T0 + 48 * spb, 1.4, 80));
        lSeqLight(chs.map((c) => [c.bass].concat(c.ms)), 4 * spb * 1000, 1600);
        chs.forEach((c, i) => learnTimer(() => { bars.forEach((b, j) => b.classList.toggle('on', j === i)); }, i * 4 * spb * 1000));
        learnTimer(() => bars.forEach((b) => b.classList.remove('on')), 48 * spb * 1000 + 1500);
    }
    else if (kind === 'vc') {
        const chs = p[1].split('|').map((s) => s.split('.').map(Number));
        chs.forEach((ms, i) => ms.forEach((m) => previewNote(m, T0 + i * 1.1, 1.05, m < 55 ? 80 : 88)));
        lSeqLight(chs, 1100, 1200);
    }
    else if (kind === 'acc') {
        const P = ACCOMP_PATTERNS[p[1]];
        if (!P)
            return;
        const spb = P.beats === 3 ? 0.45 : 0.55, ev: AccompanimentEvent[] = [];
        LACC_CH.forEach((c, i) => P.gen(ev, i * P.beats, c));
        previewNote(48, T0 + 4 * P.beats * spb, 1.6, 80);
        [60, 64, 67].forEach((m) => previewNote(m, T0 + 4 * P.beats * spb, 1.6, 80));
        ev.forEach((e) => previewNote(e.midi, T0 + e.beat * spb, Math.max(0.12, e.durB * spb * 0.95), e.hand === 'L' ? 78 : 86));
        lSeqLight(LACC_CH.map((c) => [c.bass].concat(c.right)).concat([[48, 60, 64, 67]]), P.beats * spb * 1000, 1600);
    }
    else if (kind === 'beat')
        demoBeat(p[1], btn);
}
function lDots(btn: HTMLElement, n: number, strong: (i: number) => number) {
    const row = btn && btn.closest('.demo-row');
    if (!row)
        return [];
    let bd = row.nextElementSibling;
    if (!bd || !bd.classList.contains('lbeat')) {
        bd = (document).createElement('div');
        bd.className = 'lbeat';
        bd.setAttribute('aria-hidden', 'true');
        row.after(bd);
    }
    bd.innerHTML = Array.from({ length: n }, (_, i) => '<span' + (strong(i) === 2 ? ' class="s"' : strong(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join('');
    return [...bd.children];
}
function demoBeat(kind: string, btn: HTMLElement) {
    const t0 = learnCtxTime() + 0.1;
    let n: number, step: number, total: number, lvl: (i: number) => number, lab: string;
    if (kind === '68') {
        n = 6;
        step = 0.21;
        total = 12;
        lvl = (i: number) => i === 0 ? 2 : i === 3 ? 1 : 0;
        lab = '6/8';
    }
    else if (kind === '3t') {
        n = 12;
        step = 60 / 80 / 3;
        total = 24;
        lvl = (i: number) => i === 0 ? 2 : i % 3 === 0 ? 1 : 0;
        lab = '4/4 ×3';
    }
    else {
        n = +kind || 4;
        step = 60 / 96;
        total = n * 2;
        lvl = (i: number) => i === 0 ? 2 : 0;
        lab = n + '/4';
    }
    const dots = lDots(btn, n, lvl);
    for (let i = 0; i < total; i++) {
        const k = i % n;
        metroClick(t0 + i * step, lvl(k) === 2 || (kind === '3t' && lvl(k) === 1));
        if (kind === '3t' && k % 3 === 0)
            previewNote(72, t0 + i * step, step * 2.6, 70);
        learnTimer(() => dots.forEach((d, j) => d.classList.toggle('on', j === k)), (i * step + 0.1) * 1000);
    }
    learnTimer(() => dots.forEach((d) => d.classList.remove('on')), (total * step + 0.4) * 1000);
    learnSay(t('lu_beat_say', lab));
}
/** Settings of each Learn widget, kept on its element as `_s`. */
interface LwScaleState { root: number; st: number[] }
interface LwChordState { root: number; q: string; inv: number; bass: number }
interface LwCofState { i: number }
interface LwMetroState { bpm: number; meter: string }
type LwState = LwScaleState | LwChordState | LwCofState | LwMetroState;
/** A mounted `[data-widget]` element. */
type LearnWidgetEl = HTMLElement & { _s?: LwState };
const lwIsScale = (s: LwState | undefined): s is LwScaleState => !!s && 'st' in s;
const lwIsChord = (s: LwState | undefined): s is LwChordState => !!s && 'q' in s;
const lwIsCof = (s: LwState | undefined): s is LwCofState => !!s && 'i' in s;
const lwIsMetro = (s: LwState | undefined): s is LwMetroState => !!s && 'bpm' in s;
function lwStateError(el: LearnWidgetEl): TypeError { return new TypeError('Étude: widget ' + el.dataset.widget + ' has no settings'); }
function lwScaleState(el: LearnWidgetEl): LwScaleState { const s = el._s; if (!lwIsScale(s))
    throw lwStateError(el); return s; }
function lwChordState(el: LearnWidgetEl): LwChordState { const s = el._s; if (!lwIsChord(s))
    throw lwStateError(el); return s; }
function lwCofState(el: LearnWidgetEl): LwCofState { const s = el._s; if (!lwIsCof(s))
    throw lwStateError(el); return s; }
function lwMetroState(el: LearnWidgetEl): LwMetroState { const s = el._s; if (!lwIsMetro(s))
    throw lwStateError(el); return s; }
/** A part a widget rendered into itself, e.g. its start button. */
function lwPart(el: Element, sel: string): Element { const f = el.querySelector(sel); if (!f)
    throw new TypeError('Étude: widget part missing: ' + sel); return f; }
/** The running Learn metronome widget, if any. */
interface LearnMetronome { el: LearnWidgetEl | null; timer: ReturnType<typeof setInterval> | 0; next: number; i: number }
const LM: LearnMetronome = { el: null, timer: 0, next: 0, i: 0 };
const LTEMPO: [number, string][] = [[60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [168, 'Allegro'], [999, 'Presto']];
function lmTerm(b: number) { const x = LTEMPO.find((y) => b < y[0]); if (!x)
    throw new RangeError('Étude: tempo out of range'); return x[1]; }
function lmMeter(m: string) { return m === '6/8' ? { n: 6, div: 3, lvl: (i: number) => i === 0 ? 2 : i === 3 ? 1 : 0 } : { n: +m[0], div: 1, lvl: (i: number) => i === 0 ? 2 : 0 }; }
function lmStop() {
    if (LM.timer) {
        clearInterval(LM.timer);
        LM.timer = 0;
    }
    const el = LM.el;
    LM.el = null;
    if (!el)
        return;
    const b = el.querySelector('[data-w="mstart"]');
    if (b) {
        b.setAttribute('aria-pressed', 'false');
        b.textContent = '▶ ' + t('lw_start');
    }
    el.querySelectorAll('.lbeat .on').forEach((d) => d.classList.remove('on'));
}
function lmDots(el: LearnWidgetEl) { const s = lwMetroState(el), M = lmMeter(s.meter); lwPart(el, '.lbeat').innerHTML = Array.from({ length: M.n }, (_, i) => '<span' + (M.lvl(i) === 2 ? ' class="s"' : M.lvl(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join(''); }
function lmStart(el: LearnWidgetEl) {
    ensureAudio();
    LM.el = el;
    LM.next = learnCtxTime() + 0.1;
    LM.i = 0;
    const b = lwPart(el, '[data-w="mstart"]');
    b.setAttribute('aria-pressed', 'true');
    b.textContent = '■ ' + t('lw_stop');
    LM.timer = setInterval(() => {
        if (!LM.el || !document.body.contains(el) || view0() !== 'learn') {
            lmStop();
            return;
        }
        const s = lwMetroState(el), M = lmMeter(s.meter), dt = 60 / s.bpm / M.div, dots = el.querySelectorAll('.lbeat span');
        while (LM.next < learnCtxTime() + 0.12) {
            const k = LM.i % M.n, lv = M.lvl(k);
            metroClick(LM.next, lv > 0);
            setTimeout(() => { if (LM.el === el)
                dots.forEach((d, j) => d.classList.toggle('on', j === k)); }, Math.max(0, (LM.next - learnCtxTime()) * 1000));
            LM.i++;
            LM.next += dt;
        }
    }, 25);
}
function lwMetro(el: LearnWidgetEl) {
    const s = lwIsMetro(el._s) ? el._s : (el._s = { bpm: 90, meter: '4/4' });
    el.innerHTML = '<h4>⏱ ' + t('lw_metro') + '</h4><div class="lw-row"><label class="lw-range"><span>' + t('lw_tempo') + '</span><input type="range" min="40" max="208" step="1" value="' + s.bpm + '" data-wi="bpm" aria-valuetext="' + t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm) + '"></label>' +
        '<output class="lw-bpm" aria-live="polite"><b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i></output></div>' +
        '<div class="lw-row"><label><span>' + t('lw_meter') + '</span><select data-wi="meter">' + ['2/4', '3/4', '4/4', '6/8'].map((m) => '<option' + (m === s.meter ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' +
        '<button type="button" class="btn primary sm" data-w="mstart" aria-pressed="false">▶ ' + t('lw_start') + '</button></div><div class="lbeat lbeat-lg" aria-hidden="true"></div>';
    lmDots(el);
}
const LLET = 'CDEFGAB', LNAT = [0, 2, 4, 5, 7, 9, 11];
const LSPF = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]], LSPS = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
function lSp(li: number, acc: number) { return spelledName(notation, li, acc); }
function lPitch(li: number, acc: number, midi: number) { return LLET[li] + (acc > 0 ? '#' : acc < 0 ? 'b' : '') + (Math.floor((midi - acc) / 12) - 1); }
function lStaffSmall(piece: { rh: SrToken[]; lh?: SrToken[]; keyN?: number }, label: string) {
    const r = srRender(Object.assign({ ts: [4, 4], keyN: 0, noNames: true }, piece));
    return '<div class="ss-wrap lw-staff">' + r.svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"') + '</div>';
}
function lSel(wi: string, opts: (string|number)[][], cur: string|number, lab: string) { return '<label><span>' + lab + '</span><select data-wi="' + wi + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>'; }
const LW_PRESETS = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor', 'Dorian', 'Major pentatonic', 'Minor pentatonic', 'Blues'];
function lwStepLab(s: number) { const d = STEP_LABELS[lang] || { 2: 'T', 1: 'S', 3: 'T+S' }; return d[s] || (s === 2 ? d[2] : s === 1 ? d[1] : d[3]); }
function lwScale(el: LearnWidgetEl) {
    const s = lwIsScale(el._s) ? el._s : (el._s = { root: 0, st: [2, 2, 1] }), cum = [0];
    s.st.forEach((x) => cum.push(cum[cum.length - 1] + x));
    const tot = cum[cum.length - 1], flat = [5, 10, 3, 8, 1].includes(s.root), offs = tot === 12 ? cum.slice(0, -1) : cum;
    const nm = tot === 12 ? Object.keys(SCALES).find((k) => SCALES[k].join() === offs.join()) : null;
    el.innerHTML = '<h4>🪜 ' + t('lw_scale') + '</h4><div class="lw-row">' + lSel('root', LSPF.map((x, i) => [i, lSp(x[0], x[1])]), s.root, t('lw_root')) +
        lSel('preset', [['', t('lw_presets') + '…']].concat(LW_PRESETS.map((k) => [k, scaleDisp(k)])), '', t('lw_presets')) + '</div>' +
        '<div class="lw-row" role="group" aria-label="' + t('lw_steps') + '">' + [['w', t('lw_w')], ['h', t('lw_h')], ['wh', t('lw_wh')]].map((b) => '<button type="button" class="btn sm" data-w="' + b[0] + '"' + (tot >= 12 ? ' disabled' : '') + '>+ ' + b[1] + '</button>').join('') +
        '<button type="button" class="btn ghost sm" data-w="undo"' + (s.st.length ? '' : ' disabled') + '>↶ ' + t('lw_undo') + '</button><button type="button" class="btn ghost sm" data-w="clear">' + t('lw_clear') + '</button>' +
        '<button type="button" class="btn primary sm" data-w="splay">▶ ' + t('lw_play') + '</button></div>' +
        '<div class="lw-steps" aria-label="' + t('lw_steps') + '">' + (s.st.length ? s.st.map((x) => '<span class="lw-st s' + x + '">' + lwStepLab(x) + '</span>').join('') : '<span class="lw-st">—</span>') + '</div>' +
        '<div class="lw-notes">' + cum.map((o, i) => '<span class="lw-chip' + (i === 0 || o === 12 ? ' t' : '') + '">' + pcName(s.root + o, flat) + '</span>').join('') + '</div>' +
        '<p class="lw-out" aria-live="polite">' + t('lw_total', tot) + ' · ' + (tot === 12 ? (nm ? t('lw_name', '<b>' + scaleDisp(nm) + '</b>') : t('lw_complete') + ' ' + t('lw_name_none')) : t('lw_name_none')) + '</p>';
}
const LW_Q = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'm7♭5', 'dim7', '6', 'add9'];
const LW_STEP: Record<number, number> = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 14: 1 };
function lwChordData(s: LwChordState) {
    const c = CHORDS.find((x) => x.symbol === s.q), rs = LSPF[s.root], base = 60 + s.root - (s.root > 6 ? 12 : 0);
    if (!c)
        throw new TypeError('Étude: unknown chord quality ' + s.q);
    let tones = c.intervals.map((iv) => {
        let li = (rs[0] + (s.q === 'dim7' && iv === 9 ? 6 : LW_STEP[iv] || 0)) % 7, pcT = (s.root + iv) % 12, acc = ((pcT - LNAT[li]) % 12 + 18) % 12 - 6;
        if (Math.abs(acc) > 1) {
            li = LSPS[pcT][0];
            acc = LSPS[pcT][1];
        }
        return { li, acc, midi: base + iv, iv };
    });
    const inv = Math.min(s.inv, tones.length - 1);
    for (let k = 0; k < inv; k++)
        tones[k].midi += 12;
    tones.sort((a, b) => a.midi - b.midi);
    let b: { li: number; acc: number; midi: number } = tones[0];
    if (s.bass >= 0 && s.bass !== b.midi % 12) {
        const sp = (tones.find((x) => x.midi % 12 === s.bass)) || { li: LSPF[s.bass][0], acc: LSPF[s.bass][1] };
        b = { li: sp.li, acc: sp.acc, midi: 0 };
    }
    const bpc = s.bass >= 0 ? s.bass : tones[0].midi % 12;
    let bm = 36 + bpc;
    if (bm < 40)
        bm += 12;
    const root = tones.find((x) => x.iv === 0);
    if (!root)
        throw new TypeError('Étude: chord has no root');
    const sym = lSp(root.li, root.acc) + (s.q === 'maj' ? '' : s.q), slash = bpc !== s.root;
    return { c, tones, inv, bass: { li: b.li, acc: b.acc, midi: bm }, symbol: sym + (slash ? '/' + lSp(b.li, b.acc) : '') };
}
function lwChord(el: LearnWidgetEl) {
    const s = lwIsChord(el._s) ? el._s : (el._s = { root: 0, q: 'maj', inv: 0, bass: -1 }), D = lwChordData(s);
    el.innerHTML = '<h4>🧱 ' + t('lw_chord') + '</h4><div class="lw-row">' + lSel('root', LSPF.map((x, i) => [i, lSp(x[0], x[1])]), s.root, t('lw_root')) +
        lSel('q', LW_Q.map((q) => { const c = CHORDS.find((x) => x.symbol === q); return [q, (q === 'maj' ? '—' : q) + ' · ' + chordDisp(c)]; }), s.q, t('lw_quality')) +
        lSel('inv', Array.from({ length: D.tones.length }, (_, i) => [i, t('lw_inv' + i)]), D.inv, t('lw_inv')) +
        lSel('bass', [[-1, t('lw_none')]].concat(LSPF.map((x, i) => [i, lSp(x[0], x[1])])), s.bass, t('lw_bass')) + '</div>' +
        '<dl class="lw-dl"><div><dt>' + t('lw_symbol') + '</dt><dd><b>' + D.symbol + '</b></dd></div><div><dt>' + t('lw_formula') + '</dt><dd>' + D.c.intervals.map((i) => CHORD_DEG[i] || i).join(' – ') + '</dd></div>' +
        '<div><dt>' + t('lw_notes') + '</dt><dd>' + D.tones.map((x) => lSp(x.li, x.acc)).join(' – ') + '</dd></div></dl>' +
        lStaffSmall({ rh: [[D.tones.map((x) => lPitch(x.li, x.acc, x.midi)), 4]], lh: [[lPitch(D.bass.li, D.bass.acc, D.bass.midi), 4]] }, D.symbol) +
        '<div class="lw-row"><button type="button" class="btn primary sm" data-w="cplay">▶ ' + t('lw_play') + '</button></div>';
}
function lCofKey(i: number) { const n = i <= 6 ? i : i - 12, ka = ssKeyAcc(n), li = n >= 0 ? (4 * n) % 7 : (3 * -n) % 7, mli = (li + 5) % 7; return { n, li, acc: ka[li], mli, macc: ka[mli], ka }; }
function lwCof(el: LearnWidgetEl) {
    const s = lwIsCof(el._s) ? el._s : (el._s = { i: 0 }), K = lCofKey(s.i), cnt = Math.abs(K.n), ord = (K.n >= 0 ? SS_SHARP_ORDER : SS_FLAT_ORDER).slice(0, cnt).map((li) => lSp(li, K.n > 0 ? 1 : -1));
    const tri = [0, 2, 4].map((d) => { const li = (K.li + d) % 7, acc = K.ka[li], midi = 60 + LNAT[li] + acc + (li < K.li ? 12 : 0) + (K.li >= 5 ? -12 : 0); return lPitch(li, acc, midi); });
    let btns = '';
    for (let i = 0; i < 12; i++) {
        const k = lCofKey(i), a = i * Math.PI / 6, x = 50 + 40 * Math.sin(a), y = 50 - 40 * Math.cos(a);
        btns += '<button type="button" data-w="cof" data-k="' + i + '" aria-pressed="' + (i === s.i) + '" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%"><b>' + lSp(k.li, k.acc) + (i === 6 ? '/' + lSp(4, -1) : '') + '</b><small>' + lSp(k.mli, k.macc) + 'm</small></button>';
    }
    const sig = cnt ? t(K.n > 0 ? 'lw_sig_s' : 'lw_sig_f', cnt, ord.join(' ')) : t('lw_sig0'), key = lSp(K.li, K.acc) + ' ' + (t('rd_maj') || 'major');
    el.innerHTML = '<h4>⭕ ' + t('lw_cof') + '</h4><p class="lw-hint">' + t('lw_cof_d') + '</p><div class="lw-cof-wrap"><div class="lw-cof" role="group" aria-label="' + t('lw_cof') + '">' + btns + '<div class="lw-cof-c" aria-hidden="true">' + (K.n > 0 ? '♯' : K.n < 0 ? '♭' : '♮') + '<br>' + cnt + '</div></div>' +
        '<div class="lw-cof-info" aria-live="polite"><p><b>' + key + '</b></p><p>' + sig + '</p><p>' + t('lw_rel', '<b>' + lSp(K.mli, K.macc) + ' minor</b>') + '</p>' +
        lStaffSmall({ rh: [[tri, 4]], keyN: K.n }, key + '. ' + sig) + '<button type="button" class="btn primary sm" data-w="cofplay">▶ ' + t('lw_play') + '</button></div></div>';
}
const LW_R: Record<string, ((el: LearnWidgetEl) => void) | undefined> = { scale: lwScale, chord: lwChord, cof: lwCof, metro: lwMetro };
function lwMount(el: LearnWidgetEl) { el.classList.add('lw'); const f = LW_R[el.dataset.widget ?? '']; if (f)
    f(el); }
function lwRefocus(el: LearnWidgetEl, sel: string) { (LW_R[el.dataset.widget ?? ''] || (() => { }))(el); const f = queryHtml(el, sel); const g = f && !('disabled' in f && f.disabled) ? f : queryHtml(el, '[data-w="splay"],[data-w="clear"]'); if (g) {
    g.focus({ preventScroll: true });
    learnReveal(g);
} }
function lwInput(e: Event) {
    const x = e.target;
    if (!(x instanceof HTMLInputElement || x instanceof HTMLSelectElement))
        return;
    const wi = x.dataset.wi, box = x.closest('[data-widget]'), el: LearnWidgetEl | null = box instanceof HTMLElement ? box : null;
    if (!wi || !el)
        return;
    if (wi === 'bpm') {
        const s = lwMetroState(el);
        s.bpm = +x.value;
        x.setAttribute('aria-valuetext', t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm));
        lwPart(el, '.lw-bpm').innerHTML = '<b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i>';
        return;
    }
    if (e.type !== 'change')
        return;
    if (wi === 'meter') {
        lwMetroState(el).meter = x.value;
        LM.i = 0;
        lmDots(el);
        return;
    }
    if (wi === 'preset') {
        if (!x.value)
            return;
        const o = SCALES[x.value].concat([12]);
        lwScaleState(el).st = o.slice(1).map((v, i) => v - o[i]);
    }
    else if (wi === 'root') {
        const s = el._s;
        if (!lwIsScale(s) && !lwIsChord(s))
            throw lwStateError(el);
        s.root = +x.value;
    }
    else if (wi === 'q') {
        const s = lwChordState(el);
        s.q = x.value;
        s.inv = 0;
    }
    else if (wi === 'inv') {
        lwChordState(el).inv = +x.value;
    }
    else if (wi === 'bass') {
        lwChordState(el).bass = +x.value;
    }
    lwRefocus(el, '[data-wi="' + wi + '"]');
    if (el.dataset.widget === 'chord')
        lwChordPlay(el);
    else if (wi === 'preset')
        lwScalePlay(el);
}
async function lwScalePlay(el: LearnWidgetEl) {
    const s = lwScaleState(el), cum = [0];
    s.st.forEach((x) => cum.push(cum[cum.length - 1] + x));
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    const r = 60 + s.root - (s.root > 6 ? 12 : 0), T0 = learnCtxTime() + 0.05;
    cum.forEach((o, i) => previewNote(r + o, T0 + i * 0.3, 0.3, 90));
    lSeqLight(cum.map((o) => [r + o]), 300, 600);
    const nm = el.querySelector('.lw-out');
    if (nm)
        learnSay(nm.textContent);
}
async function lwChordPlay(el: LearnWidgetEl) {
    const D = lwChordData(lwChordState(el)), ms = [D.bass.midi].concat(D.tones.map((x) => x.midi));
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    const T0 = learnCtxTime() + 0.05;
    ms.forEach((m, i) => previewNote(m, T0 + i * 0.14, 0.4, 86));
    ms.forEach((m) => previewNote(m, T0 + ms.length * 0.14 + 0.1, 1.3, 84));
    learnLight(ms, ms.length * 140 + 1600);
    learnSay(D.symbol);
}
async function lwClick(w: HTMLElement) {
    const box = w.closest('[data-widget]'), el: LearnWidgetEl | null = box instanceof HTMLElement ? box : null;
    if (!el)
        return;
    const a = w.dataset.w;
    if (a === 'mstart') {
        if (LM.el === el)
            lmStop();
        else {
            learnHalt();
            lmStart(el);
        }
        return;
    }
    if (a === 'splay')
        return lwScalePlay(el);
    if (a === 'cplay')
        return lwChordPlay(el);
    if (a === 'cofplay' || a === 'cof') {
        const s = lwCofState(el);
        if (a === 'cof') {
            s.i = Number(w.dataset.k);
            lwRefocus(el, '[data-w="cof"][data-k="' + s.i + '"]');
        }
        const K = lCofKey(s.i), r = 48 + ((K.n * 7) % 12 + 12) % 12;
        learnHalt();
        ensureAudio();
        if (!await preparePiano())
            return;
        playChordMidis([r, r + 4, r + 7, r + 12], true);
        learnLight([r, r + 4, r + 7, r + 12], 2200);
        return;
    }
    if (a === 'w' || a === 'h' || a === 'wh') {
        const s = lwScaleState(el), st = ({ w: 2, h: 1, wh: 3 })[a], tot = s.st.reduce((x, y) => x + y, 0);
        if (tot + st > 12) {
            learnSay(t('lw_over'));
            return;
        }
        s.st.push(st);
        lwRefocus(el, '[data-w="' + a + '"]');
        const m = 60 + s.root - (s.root > 6 ? 12 : 0) + tot + st;
        ensureAudio();
        if (await preparePiano()) {
            previewNote(m, learnCtxTime() + 0.02, 0.5, 90);
            learnLight([m], 700);
        }
        if (tot + st === 12)
            learnSay(lwPart(el, '.lw-out').textContent);
        return;
    }
    if (a === 'undo') {
        lwScaleState(el).st.pop();
        lwRefocus(el, '[data-w="undo"]');
        return;
    }
    if (a === 'clear') {
        lwScaleState(el).st = [];
        lwRefocus(el, '[data-w="clear"]');
    }
}
function lgNorm(s: string) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function lgHTML() {
    const k = (GLOSS[0] && GLOSS[0][lang]) ? lang : 'en', list = GLOSS.slice().sort((a, b) => ((a[k] ? a[k][0] : a.en[0])).localeCompare(b[k] ? b[k][0] : b.en[0], lang));
    return '<h3 tabindex="-1">📖 ' + t('lg_title') + '</h3><label class="lg-search"><span>' + t('lg_search') + '</span><input type="search" id="lg-q" placeholder="' + t('lg_ph') + '" autocomplete="off"></label>' +
        '<p class="lg-n" id="lg-n" aria-live="polite"></p><dl class="lg-list">' + list.map((g) => {
        const L = LESSONS.find((x) => x.id === g.l);
        const cur = g[k] || g.en;
        return '<div class="lg-it" data-k="' + lgNorm(cur[0] + ' ' + cur[1] + ' ' + g.en[0]).replace(/"/g, '') + '"><dt>' + cur[0] + '</dt><dd>' + cur[1] + (L ? ' <a href="#" data-lgo="' + L.id + '">' + L.icon + ' ' + learnTitle(L) + '</a>' : '') + '</dd></div>';
    }).join('') + '</dl>' +
        '<div class="learn-nav"><button type="button" class="btn ghost sm" data-lgback="1">' + t('lg_close') + '</button></div>';
}
function lgFilter() {
    const qEl = maybeById('lg-q'), q = qEl instanceof HTMLInputElement ? qEl : null, v = q ? lgNorm(q.value.trim()) : '';
    let n = 0;
    queryAllHtml(document, '#learnBody .lg-it').forEach((it) => { const on = !v || (it.dataset.k ?? '').includes(v); it.hidden = !on; if (on)
        n++; });
    const o = maybeById('lg-n');
    if (o)
        o.textContent = n ? t('lg_n', n) : t('lg_none', q ? q.value.trim() : '');
}
/* ============================================================================
   READ & PLAY — sheet-music trainer. Grand staff engraver (reuses the ss glyphs)
   + graded repertoire + step-by-step / assessment / listen modes.
   ============================================================================ */
const SR_LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** A spelled pitch: letter index (C = 0), octave, accidental (-1, 0, 1) and MIDI number. */
interface SrPitch { li: number; oct: number; acc: number; midi: number }
function srPitch(s: string): SrPitch | null { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) return null; const li = SR_LET.indexOf(m[1]), acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, oct = +m[3]; return { li, oct, acc, midi: ssMidiOf(li, oct, acc) }; }
/** A Read & Play piece: a score plus its catalogue details. */
interface SrPiece extends SrScore { id: string; t: Localised<string>; comp: string; level: number; keyN: number; bpm: number; minor?: boolean; ephemeral?: boolean; gen?: string; from?: { title: string; bars: string } }
const PIECES: SrPiece[] = [
    { id: 'w5rh', t: { en: 'Five-finger warm-up (right hand)', ro: 'Încălzire pe cinci note (dreapta)' }, comp: '', level: 1, keyN: 0, ts: [4, 4], bpm: 80,
        rh: [['C4', 1], ['D4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['E4', 1], ['G4', 1], ['E4', 1], ['C4', 4]] },
    { id: 'w5lh', t: { en: 'Five-finger warm-up (left hand)', ro: 'Încălzire pe cinci note (stânga)' }, comp: '', level: 1, keyN: 0, ts: [4, 4], bpm: 80,
        lh: [['C3', 1], ['D3', 1], ['E3', 1], ['F3', 1], ['G3', 1], ['F3', 1], ['E3', 1], ['D3', 1], ['C3', 1], ['E3', 1], ['G3', 1], ['E3', 1], ['C3', 4]] },
    { id: 'mary', t: { en: 'Mary Had a Little Lamb', ro: 'Mary avea un mieluşel' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 96,
        rh: [['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 2], ['D4', 1], ['D4', 1], ['D4', 2], ['E4', 1], ['G4', 1], ['G4', 2],
            ['E4', 1], ['D4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 1], ['C4', 4]] },
    { id: 'london', t: { en: 'London Bridge', ro: 'Podul Londrei (London Bridge)' }, comp: 'trad.', level: 1, keyN: 0, ts: [4, 4], bpm: 96,
        rh: [['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['D4', 1], ['E4', 1], ['F4', 2], ['E4', 1], ['F4', 1], ['G4', 2],
            ['G4', 1.5], ['A4', 0.5], ['G4', 1], ['F4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['D4', 2], ['G4', 2], ['E4', 1], ['C4', 3]] },
    { id: 'ode', t: { en: 'Ode to Joy', ro: 'Odă bucuriei' }, comp: 'Beethoven', level: 1, keyN: 0, ts: [4, 4], bpm: 100,
        rh: [['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['E4', 1.5], ['D4', 0.5], ['D4', 2],
            ['E4', 1], ['E4', 1], ['F4', 1], ['G4', 1], ['G4', 1], ['F4', 1], ['E4', 1], ['D4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['D4', 1.5], ['C4', 0.5], ['C4', 2]] },
    { id: 'twinkle', t: { en: 'Twinkle, Twinkle, Little Star', ro: 'Sclipește, steluță (Twinkle)' }, comp: 'trad.', level: 2, keyN: 0, ts: [4, 4], bpm: 88,
        rh: [['C4', 1], ['C4', 1], ['G4', 1], ['G4', 1], ['A4', 1], ['A4', 1], ['G4', 2], ['F4', 1], ['F4', 1], ['E4', 1], ['E4', 1], ['D4', 1], ['D4', 1], ['C4', 2]],
        lh: [['C3', 2], ['E3', 2], ['F3', 2], ['C3', 2], ['F3', 2], ['C3', 2], ['G3', 2], ['C3', 2]] },
    { id: 'frere', t: { en: 'Frère Jacques', ro: 'Frère Jacques (Frate Ioane)' }, comp: 'trad.', level: 2, keyN: 0, ts: [4, 4], bpm: 100,
        rh: [['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['C4', 1], ['D4', 1], ['E4', 1], ['C4', 1], ['E4', 1], ['F4', 1], ['G4', 2], ['E4', 1], ['F4', 1], ['G4', 2],
            ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1], ['G4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5], ['E4', 1], ['C4', 1],
            ['C4', 1], ['G3', 1], ['C4', 2], ['C4', 1], ['G3', 1], ['C4', 2]],
        lh: [['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4]] },
    { id: 'jingle', t: { en: 'Jingle Bells (chorus)', ro: 'Clopoței (Jingle Bells)' }, comp: 'Pierpont', level: 2, keyN: 0, ts: [4, 4], bpm: 104,
        rh: [['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['E4', 1], ['E4', 2], ['E4', 1], ['G4', 1], ['C4', 1.5], ['D4', 0.5], ['E4', 4],
            ['F4', 1], ['F4', 1], ['F4', 1.5], ['F4', 0.5], ['F4', 1], ['E4', 1], ['E4', 1], ['E4', 0.5], ['E4', 0.5], ['E4', 1], ['D4', 1], ['D4', 1], ['E4', 1], ['D4', 2], ['G4', 2]],
        lh: [['C3', 2], ['G3', 2], ['C3', 2], ['G3', 2], ['C3', 2], ['C3', 2], ['C3', 2], ['G3', 2], ['F3', 2], ['F3', 2], ['C3', 2], ['C3', 2], ['G3', 2], ['G3', 2], ['G3', 2], ['G3', 2]] },
    { id: 'minuet', t: { en: 'Minuet in G (Petzold)', ro: 'Menuet în Sol (Petzold)' }, comp: 'Petzold', level: 3, keyN: 1, ts: [3, 4], bpm: 104,
        rh: [['D5', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5], ['D5', 1], ['G4', 1], ['G4', 1], ['E5', 1], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5], ['G5', 1], ['G4', 1], ['G4', 1],
            ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['G4', 0.5], ['B4', 1], ['A4', 2]] },
    { id: 'elise', t: { en: 'Für Elise (opening)', ro: 'Für Elise (început)' }, comp: 'Beethoven', level: 3, keyN: 0, minor: true, ts: [3, 4], bpm: 88,
        rh: [['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 2],
            ['C4', 0.5], ['E4', 0.5], ['A4', 0.5], ['B4', 1.5], ['E4', 0.5], ['G#4', 0.5], ['B4', 0.5], ['C5', 1.5],
            ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 2]] },
    { id: 'grace', t: { en: 'Amazing Grace', ro: 'Amazing Grace' }, comp: 'trad.', level: 3, keyN: 0, ts: [3, 4], bpm: 80, pickup: 1,
        rh: [['G3', 1], ['C4', 2], ['E4', 0.5], ['C4', 0.5], ['E4', 2], ['D4', 1], ['C4', 2], ['A3', 1], ['G3', 2], ['G3', 1],
            ['C4', 2], ['E4', 0.5], ['C4', 0.5], ['E4', 2], ['D4', 1], ['G4', 3]] },
];
/** One engraved note head, with the beat it falls on and where it was drawn. */
interface SrStaffNote { nid: number; hand: SrHand; midi: number; beat: number; dur: number; x: number; y: number; li: number; oct: number; acc: number }
interface SrBeatX { b: number; x: number }
interface SrRenderResult { svg: string; notes: SrStaffNote[]; beatX: SrBeatX[]; total: number; W: number; yTop: number; yBot: number }
/** The notes that sound together at one beat (one Learn-mode step). */
interface SrStep { beat: number; notes: SrStaffNote[]; closed?: boolean }
/** A wrong key in Learn mode, classified (`k`) against the expected note `n`. */
interface SrSlip { k: string; n: SrStaffNote; m: number }
interface SrState {
    piece: SrPiece | null; hands: string; modeSel: string; names: boolean; active: boolean; assessOn: boolean;
    notes: SrStaffNote[]; steps: SrStep[]; stepIdx: number; hit: Set<number>; results: Record<number, string>; mistakes: number; wrongExtra: number;
    beatX: SrBeatX[]; totalBeats: number; render: SrRenderResult | null; raf: number; timers: ReturnType<typeof setTimeout>[]; nodes: OscillatorNode[];
    bpm: number; t0: number; next: CoachTip | null; errs: Record<string, number> | null; slipKey: SrSlip | null;
    excerpt?: SrPiece | null; gen?: SrPiece | null; listening?: boolean;
}
const SR: SrState = { piece: null, hands: 'both', modeSel: 'learn', names: false, active: false, assessOn: false,
    notes: [], steps: [], stepIdx: 0, hit: new Set<number>(), results: {}, mistakes: 0, wrongExtra: 0, beatX: [], totalBeats: 0,
    render: null, raf: 0, timers: [], nodes: [], bpm: 90, t0: 0, next: null, errs: null, slipKey: null };
interface SrRestEvent { rest: true; beat: number; dur: number; chord?: undefined; beam?: undefined }
/** A note to engrave; beamed eighths also record their stem position once drawn. */
interface SrNoteEvent extends SrPitch { rest?: undefined; beat: number; dur: number; chord?: boolean; beam?: { first: boolean; mate: SrNoteEvent }; nid?: number; bx?: number; by?: number; mid?: number }
type SrEvent = SrRestEvent | SrNoteEvent;
function srPitchStrict(s: string): SrPitch { const p = srPitch(s); if (!p)
    throw new TypeError('Étude: unreadable pitch ' + s); return p; }
function srEvents(list: SrToken[]|undefined) { const ev: SrEvent[] = []; let beat = 0; (list || []).forEach((x) => { const d = x[1]; if (x[0] === 'R')
    ev.push({ rest: true, beat, dur: d });
else if (Array.isArray(x[0]))
    x[0].forEach((n) => ev.push(Object.assign(srPitchStrict(n), { beat, dur: d, chord: x[0].length > 1 })));
else
    ev.push(Object.assign(srPitchStrict(x[0]), { beat, dur: d })); beat += d; }); return { ev, total: beat }; }
function srClef(clef: string, x: number, top: number) { const g = clef === 'treble'; return `<path class="ss-clef" d="${g ? CLEF_G : CLEF_F}" transform="translate(${g ? x - 2 : x} ${top + (g ? 36 : 12)}) scale(${CLEF_SCALE} ${-CLEF_SCALE})"/>`; }
function srKeySigG(clef: string, keyN: number, x: number, top: number) {
    const refStep = clef === 'bass' ? 18 : 30, bot = top + 48, yOf = (li: number, oct: number) => bot + (refStep - ssStepOf(li, oct)) * 6;
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const cnt = Math.abs(keyN), list = keyN > 0 ? (clef === 'bass' ? sB : sT) : (clef === 'bass' ? fB : fT);
    let svg = '', xx = x;
    for (let i = 0; i < cnt; i++) {
        const y = yOf(list[i][0], list[i][1]);
        svg += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
function srTimeSigG(ts: number[], x: number, top: number) { return `<text class="ss-num" x="${x + 9}" y="${top + 18}">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="${top + 44}">${ts[1]}</text>`; }
function srStem2(x: number, y: number, dur: number, mid: number) { if (dur >= 4)
    return ''; const up = y > mid, sx = up ? x + 5.6 : x - 5.6, ey = up ? y - 32 : y + 32; return srStemLine(sx, y, ey, dur, up); }
function srStemLine(sx: number, y: number, ey: number, dur: number, up: boolean) {
    if (dur >= 4)
        return '';
    const base = [0.375, 0.75, 1.5, 3].includes(dur) ? dur / 1.5 : dur, flags = base <= 0.125 ? 3 : base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0;
    let s = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    for (let i = 0; i < flags; i++) {
        const fy = up ? ey + i * 7 : ey - i * 7;
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy + 5} ${sx + 9},${fy + 13} ${sx + 3},${fy + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy - 5} ${sx + 9},${fy - 13} ${sx + 3},${fy - 17}"/>`;
    }
    return s;
}
function srLedger2(x: number, y: number, top: number) {
    const bot = top + 48;
    let s = '';
    if (y > bot) {
        for (let ly = bot + 12; ly <= y + 1; ly += 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    if (y < top) {
        for (let ly = top - 12; ly >= y - 1; ly -= 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    return s;
}
function srRest(x: number, top: number, dur: number) {
    if (dur >= 4)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 12}" width="12" height="5"/>`;
    if (dur >= 2)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 19}" width="12" height="5"/>`;
    return `<text class="ss-clef" x="${x - 6}" y="${top + 34}" style="font-size:30px">${dur <= 0.125 ? '\u{1D140}' : dur <= 0.25 ? '\u{1D13F}' : dur <= 0.5 ? '\u{1D13E}' : '\u{1D13D}'}</text>`;
}
/** One staff of the system; `data` is filled from the hand's tokens right after the staves are laid out. */
interface SrStave { hand: SrHand; clef: 'treble' | 'bass'; refStep: number; top: number; data: { ev: SrEvent[]; total: number } }
/** A chord note with its staff position, notehead shift (`dx`) and accidental column (`ax`). */
interface SrChordItem { e: SrNoteEvent; step: number; y: number; dx: number; ax?: number }
function srRender(piece: SrScore): SrRenderResult {
    const staves: SrStave[] = [];
    if (piece.rh)
        staves.push({ hand: 'rh', clef: 'treble', refStep: 30, top: 46, data: { ev: [], total: 0 } });
    if (piece.lh)
        staves.push({ hand: 'lh', clef: 'bass', refStep: 18, top: piece.rh ? 150 : 46, data: { ev: [], total: 0 } });
    staves.forEach((st) => { st.data = srEvents(piece[st.hand]); });
    const keyAcc = ssKeyAcc(piece.keyN || 0);
    const cap = piece.ts[1] === 8 ? piece.ts[0] * 0.5 : piece.ts[0], pickup = piece.pickup || 0;
    const total = Math.max(...staves.map((s) => s.data.total));
    const topY = staves[0].top, botY = staves[staves.length - 1].top + 48;
    let x = 10, head = '';
    staves.forEach((st) => { head += piece.perc ? rdPercClef(x + 4, st.top) : srClef(st.clef, x, st.top); });
    x += 30;
    let ksw = 6;
    staves.forEach((st) => { const ks = srKeySigG(st.clef, piece.keyN || 0, x, st.top); head += ks.svg; ksw = Math.max(ksw, ks.w); });
    x += ksw;
    staves.forEach((st) => { head += srTimeSigG(piece.ts, x, st.top); });
    x += 26;
    const bounds: number[] = [];
    {
        let b = pickup > 0 ? pickup : cap;
        while (b < total - 1e-4) {
            bounds.push(b);
            b += cap;
        }
    }
    const beatSet = new Set<number>();
    staves.forEach((st) => st.data.ev.forEach((e) => beatSet.add(+e.beat.toFixed(4))));
    const beats = [...beatSet].sort((a, b) => a - b);
    const notes: SrStaffNote[] = [], beatX: SrBeatX[] = [];
    let body = '', nid = 0;
    // Beam pairs of eighths that start on a beat (simple meters only).
    if (piece.ts[1] === 4)
        staves.forEach((st) => {
            const ev = st.data.ev;
            for (let i = 0; i + 1 < ev.length; i++) {
                const a = ev[i], b = ev[i + 1], rel = a.beat - (pickup % 1);
                if (!a.rest && !b.rest && !a.chord && !b.chord && a.dur === 0.5 && b.dur === 0.5 && Math.abs(rel - Math.round(rel)) < 1e-3 && Math.abs(b.beat - a.beat - 0.5) < 1e-3) {
                    a.beam = { first: true, mate: b };
                    b.beam = { first: false, mate: a };
                    i++;
                }
            }
        });
    beats.forEach((b) => {
        if (bounds.some((v) => Math.abs(v - b) < 1e-3)) {
            x += 6;
            body += `<line class="ss-line" x1="${x}" y1="${topY}" x2="${x}" y2="${botY}" stroke="#1a1714" stroke-width="1.3"/>`;
            x += 12;
        }
        const nx = x + 10;
        let minDur = 4;
        staves.forEach((st) => {
            const here = st.data.ev.filter((e) => Math.abs(e.beat - b) < 1e-3), chord = here.filter((e): e is SrNoteEvent => !e.rest && !!e.chord);
            if (chord.length) {
                const items = chord.map((e): SrChordItem => ({ e, step: ssStepOf(e.li, e.oct), y: 0, dx: 0 })).sort((p, q) => p.step - q.step);
                items.forEach((it) => { it.y = st.top + 48 + (st.refStep - it.step) * 6; });
                const up = items.reduce((sum, it) => sum + it.y, 0) / items.length > st.top + 24, dur = items[0].e.dur;
                let prev: SrChordItem|null = null;
                (up ? items : items.slice().reverse()).forEach((it) => { it.dx = prev && Math.abs(it.step - prev.step) === 1 && prev.dx === 0 ? (up ? 11.5 : -11.5) : 0; prev = it; });
                const lanes: number[][] = [];
                items.slice().reverse().forEach((it) => {
                    if (it.e.acc === keyAcc[it.e.li])
                        return;
                    let a = lanes.findIndex((l) => l.every((y) => Math.abs(y - it.y) >= 14));
                    if (a < 0) {
                        a = lanes.length;
                        lanes.push([]);
                    }
                    lanes[a].push(it.y);
                    it.ax = nx - 13 - a * 10 - (it.dx < 0 ? 11.5 : 0);
                });
                const top = items[items.length - 1], bot = items[0], sx = up ? nx + 5.6 : nx - 5.6;
                const names = (SR.names && !piece.noNames) ? items.map((it) => pcName(pc(it.e.midi), (piece.keyN || 0) < 0)).join(' ') : '';
                items.forEach((it, k) => {
                    const e = it.e;
                    let g = k === 0 ? `<rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>` : '';
                    if (it.ax != null)
                        g += ssAccGlyph(e.acc, keyAcc[e.li], it.ax, it.y);
                    g += srLedger2(nx + it.dx, it.y, st.top) + ssNotehead(nx + it.dx, it.y, dur, (st.refStep - it.step) % 2 === 0);
                    if (it === (up ? bot : top))
                        g += srStemLine(sx, it.y, up ? top.y - 32 : bot.y + 32, dur, up);
                    if (k === 0 && names)
                        g += `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${(st.hand === 'rh' ? pcName(pc(top.e.midi), (piece.keyN || 0) < 0) : pcName(pc(bot.e.midi), (piece.keyN || 0) < 0))}</text><title>${names}</title>`;
                    body += `<g class="ss-n" data-nid="${nid}">${g}</g>`;
                    notes.push({ nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y: it.y, li: e.li, oct: e.oct, acc: e.acc });
                    nid++;
                });
            }
            here.forEach((e) => {
                minDur = Math.min(minDur, e.dur);
                if (e.rest) {
                    body += srRest(nx, st.top, e.dur);
                    return;
                }
                if (e.chord)
                    return;
                const y = st.top + 48 + (st.refStep - ssStepOf(e.li, e.oct)) * 6;
                let g = '';
                if (e.acc !== keyAcc[e.li])
                    g += ssAccGlyph(e.acc, keyAcc[e.li], nx - 13, y);
                g += srLedger2(nx, y, st.top) + ssNotehead(nx, y, e.dur, (st.refStep - ssStepOf(e.li, e.oct)) % 2 === 0) + (e.beam ? `@@B${nid}@@` : srStem2(nx, y, e.dur, st.top + 24));
                if (e.beam)
                    Object.assign(e, { nid, bx: nx, by: y, mid: st.top + 24 });
                const nm = (SR.names && !piece.noNames) ? `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${pcName(pc(e.midi), (piece.keyN || 0) < 0)}</text>` : '';
                body += `<g class="ss-n" data-nid="${nid}"><rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>${g}${nm}</g>`;
                notes.push({ nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y, li: e.li, oct: e.oct, acc: e.acc });
                nid++;
            });
        });
        beatX.push({ b, x: nx });
        x += 26 + Math.min(minDur, 4) * 14;
    });
    staves.forEach((st) => st.data.ev.forEach((a) => {
        if (!a.beam || !a.beam.first)
            return;
        const b = a.beam.mate;
        if (a.by === undefined || a.bx === undefined || a.mid === undefined || b.by === undefined || b.bx === undefined)
            return;
        const up = (a.by + b.by) / 2 > a.mid;
        let e1 = up ? a.by - 32 : a.by + 32, e2 = up ? b.by - 32 : b.by + 32;
        const d = e2 - e1;
        if (up) {
            if (d > 6)
                e2 = e1 + 6;
            else if (d < -6)
                e1 = e2 + 6;
        }
        else {
            if (d > 6)
                e1 = e2 - 6;
            else if (d < -6)
                e2 = e1 - 6;
        } // limit the slope by lengthening stems only
        const s1 = up ? a.bx + 5.6 : a.bx - 5.6, s2 = up ? b.bx + 5.6 : b.bx - 5.6, th = up ? 5 : -5, stem = (sx: number, y: number, ey: number) => `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
        body = body.replace(`@@B${a.nid}@@`, stem(s1, a.by, e1)).replace(`@@B${b.nid}@@`, stem(s2, b.by, e2) + `<path class="ss-beam" d="M ${s1},${e1} L ${s2},${e2} L ${s2},${e2 + th} L ${s1},${e1 + th} Z"/>`);
    }));
    x += 8;
    body += `<line class="ss-line" x1="${x}" y1="${topY}" x2="${x}" y2="${botY}" stroke="#1a1714" stroke-width="3"/>`;
    x += 6;
    beatX.push({ b: total, x });
    const W = Math.max(x + 6, 420), H = Math.max(botY + ((SR.names && !piece.noNames) ? 38 : 22), 150);
    let staff = '';
    staves.forEach((st) => { for (let k = 0; k < 5; k++) {
        const ly = st.top + k * 12;
        staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${W - 6}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    } });
    staff += `<line class="ss-line" x1="8" y1="${topY}" x2="8" y2="${botY}" stroke="#1a1714" stroke-width="1.6"/>`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${staff}${head}${body}</svg>`, notes, beatX, total, W, yTop: topY - 8, yBot: botY + 8 };
}
/* ---- state, drawing, grading ---- */
function srSvg() { return byId('rd-staff') ? byId('rd-staff').querySelector('svg') : null; }
function srHandsAvail() { const p = SR.piece; if (!p)
    throw new Error('Étude: no piece selected'); return p.rh && p.lh ? 'both' : (p.rh ? 'rh' : 'lh'); }
function srActiveHands() { const a = srHandsAvail(); return a === 'both' ? SR.hands : a; }
function srStepsBuild() {
    const sel = srActiveHands();
    const ns = SR.notes.filter((n) => sel === 'both' || n.hand === sel);
    const map = new Map<string, { beat: number; notes: typeof ns; }>();
    ns.forEach((n) => { const k = n.beat.toFixed(3); let step = map.get(k); if (!step)
        map.set(k, step = { beat: n.beat, notes: [] }); step.notes.push(n); });
    SR.steps = [...map.values()].sort((a, b) => a.beat - b.beat);
}
function srDraw() {
    if (!SR.piece)
        return;
    const r = srRender(SR.piece);
    SR.render = r;
    SR.notes = r.notes;
    SR.beatX = r.beatX;
    SR.totalBeats = r.total;
    byId('rd-staff').innerHTML = r.svg;
    srStepsBuild();
    srPaintAll();
    srCoach();
}
function srPaintAll() {
    const svg = srSvg();
    if (!svg)
        return;
    const st = (SR.active && SR.modeSel === 'learn') ? SR.steps[SR.stepIdx] : null;
    svg.querySelectorAll('.ss-n').forEach((g) => {
        if (!(g instanceof SVGElement))
            return;
        const id = Number(g.dataset.nid), r = SR.results[id];
        if (st && st.notes.some((n: { nid: number; }) => n.nid === id) && !SR.hit.has(id))
            g.dataset.s = 'now';
        else if (r)
            g.dataset.s = r;
        else
            g.removeAttribute('data-s');
    });
}
function srScrollX(x: number) { const w = byId('rd-staff'); if (w && w.scrollWidth > w.clientWidth + 4)
    w.scrollLeft = Math.max(0, x - w.clientWidth * 0.4); }
function srScrollStep() { const st = SR.steps[SR.stepIdx]; if (st)
    srScrollX(st.notes[0].x); }
function srBeatToX(beat: number) {
    const pts = SR.beatX;
    if (!pts || !pts.length)
        return 10;
    for (let i = 0; i < pts.length - 1; i++) {
        if (beat >= pts[i].b && beat <= pts[i + 1].b) {
            const f = (beat - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + f * (pts[i + 1].x - pts[i].x);
        }
    }
    return beat <= pts[0].b ? pts[0].x : pts[pts.length - 1].x;
}
function srCursor(x: number) {
    const svg = srSvg();
    if (!svg)
        return;
    let c = svg.querySelector('.ss-playhead');
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        c.setAttribute('y1', String(SR.render ? SR.render.yTop : 38));
        c.setAttribute('y2', String(SR.render ? SR.render.yBot : 102));
        svg.appendChild(c);
    }
    c.setAttribute('x1', String(x));
    c.setAttribute('x2', String(x));
    srScrollX(x);
}
function srTargets() {
    kbClear('target');
    if (!(SR.active && SR.modeSel === 'learn'))
        return;
    const st = SR.steps[SR.stepIdx];
    if (st)
        st.notes.forEach((n: { nid: number; midi: number; }) => { if (!SR.hit.has(n.nid))
            kbState(n.midi, 'target', true); });
}
function srClick(t: number, acc: boolean) {
    const click = audioEngine.scheduleClick(t, acc);
    if (click?.oscs)
        SR.nodes.push(...click.oscs);
}
function srStopAll(keep?: boolean) {
    SR.active = false;
    SR.assessOn = false;
    if (SR.raf)
        cancelAnimationFrame(SR.raf);
    SR.raf = 0;
    SR.timers.forEach(clearTimeout);
    SR.timers = [];
    SR.nodes.forEach((n) => { try {
        n.stop(0);
    }
    catch (_) { } });
    SR.nodes = [];
    if (actx)
        stopPreviews();
    kbClear('target');
    kbClear('good');
    kbClear('bad');
    const svg = srSvg(), c = svg && svg.querySelector('.ss-playhead');
    if (c)
        c.remove();
    if (!keep) {
        SR.results = {};
        SR.stepIdx = 0;
        SR.hit.clear();
        SR.next = null;
        srPaintAll();
    }
    const go = byId('rd-go');
    if (go)
        go.textContent = t('rd_start');
    SR.listening = false;
    const li = byId('rd-listen');
    if (li)
        li.textContent = t('rd_listen');
    srCoach();
}
function srPlayGap(fromBeat: number, toBeat: number) {
    const sel = srActiveHands();
    if (sel === 'both' || srHandsAvail() !== 'both')
        return;
    const bs = 60 / SR.bpm, ctx = actx;
    if (!ctx)
        return;
    SR.notes.filter((n) => n.hand !== sel && n.beat >= fromBeat - 1e-3 && n.beat < toBeat - 1e-3).forEach((n) => previewNote(n.midi, ctx.currentTime + 0.02, Math.max(.15, n.dur * bs * .9), 78));
}
function srCount() { const v = byId('rd-verdict'); v.className = 'verdict neutral'; v.textContent = SR.stepIdx + ' / ' + SR.steps.length + (SR.mistakes ? '  ·  ✗ ' + SR.mistakes : ''); }
function srLearnStart() {
    SR.active = true;
    SR.results = {};
    SR.stepIdx = 0;
    SR.hit.clear();
    SR.mistakes = 0;
    SR.errs = {};
    SR.slipKey = null;
    SR.next = null;
    srCoach();
    srPaintAll();
    srTargets();
    srScrollStep();
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_learn_go');
    byId('rd-go').textContent = t('rd_stop');
}
function srLearnFinish() {
    SR.next = srNextLearn();
    srStopAll(true);
    const v = byId('rd-verdict');
    if (SR.mistakes === 0) {
        v.className = 'verdict good';
        v.textContent = t('rd_perfect');
    }
    else {
        v.className = 'verdict neutral';
        v.textContent = t('rd_done_learn', SR.mistakes);
    }
    v.textContent += rdSightDone('learn', SR.mistakes);
    if (!SR.piece)
        throw new Error('Étude: no piece selected');
    if (!SR.piece.ephemeral) {
        const rec = data.sheet[SR.piece.id] || (data.sheet[SR.piece.id] = {});
        rec.learned = true;
    }
    touchDay();
    saveAll();
    srBest();
    fillPieces();
}
function srAssessStart() {
    SR.active = true;
    SR.results = {};
    SR.wrongExtra = 0;
    SR.next = null;
    srCoach();
    SR.steps.forEach((s) => s.closed = false);
    srPaintAll();
    if (!SR.piece)
        throw new Error('Étude: no piece selected');
    const bs = 60 / SR.bpm, cap = SR.piece.ts[1] === 8 ? SR.piece.ts[0] * 0.5 : SR.piece.ts[0], ci = cap, pk = SR.piece.pickup || 0;
    if (!actx)
        return;
    const act0 = actx.currentTime + 0.15, perf0 = performance.now() + 150;
    for (let b = 0; b < ci; b++)
        srClick(act0 + b * bs, b === 0);
    for (let b = 0; b <= SR.totalBeats + 1e-3; b++) {
        const rel = b - pk;
        srClick(act0 + (ci + b) * bs, rel >= 0 && Math.abs(rel % cap) < 1e-3);
    }
    const sel = srActiveHands();
    if (sel !== 'both' && srHandsAvail() === 'both')
        SR.notes.filter((n) => n.hand !== sel).forEach((n) => previewNote(n.midi, act0 + (ci + n.beat) * bs, Math.max(.15, n.dur * bs * .9), 78));
    SR.t0 = perf0 + ci * bs * 1000;
    SR.assessOn = false;
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_count');
    byId('rd-go').textContent = t('rd_stop');
    SR.raf = requestAnimationFrame(srAssessLoop);
}
function srTol() { return Math.min(0.55, 0.3 * SR.bpm / 60); }
function srAssessLoop(ts: number) {
    if (!SR.active || SR.modeSel !== 'assess')
        return;
    const bs = 60 / SR.bpm, bNow = (ts - SR.t0) / 1000 / bs;
    if (bNow >= 0 && !SR.assessOn) {
        SR.assessOn = true;
        byId('rd-verdict').textContent = t('rd_play');
    }
    srCursor(srBeatToX(Math.max(0, Math.min(bNow, SR.totalBeats))));
    let dirty = false;
    SR.steps.forEach((st) => { if (!st.closed && bNow > st.beat + srTol() + 0.05) {
        st.closed = true;
        st.notes.forEach((n: { nid: number; }) => { if (!SR.results[n.nid]) {
            SR.results[n.nid] = 'bad';
            dirty = true;
        } });
    } });
    if (dirty)
        srPaintAll();
    if (bNow > SR.totalBeats + 1) {
        srAssessFinish();
        return;
    }
    SR.raf = requestAnimationFrame(srAssessLoop);
}
function srAssessFinish() {
    const totalN = SR.steps.reduce((s, st) => s + st.notes.length, 0);
    const good = Object.values(SR.results).filter((r) => r === 'good').length;
    const pct = totalN ? Math.round(100 * good / totalN) : 0, stars = pct >= 95 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;
    SR.next = srNextAssess(pct);
    srStopAll(true);
    const v = byId('rd-verdict');
    v.className = 'verdict ' + (stars >= 2 ? 'good' : stars ? 'neutral' : 'bad');
    v.textContent = t('rd_score', pct) + '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + (SR.wrongExtra ? '  ·  ' + t('rd_extra', SR.wrongExtra) : '') + rdSightDone('assess', pct);
    if (!SR.piece)
        throw new Error('Étude: no piece selected');
    if (!SR.piece.ephemeral) {
        const rec = data.sheet[SR.piece.id] || (data.sheet[SR.piece.id] = {});
        if (!rec.best || pct > rec.best)
            rec.best = pct;
    }
    touchDay();
    saveAll();
    srBest();
    fillPieces();
}
function srKeyInput(m: number) {
    if (!SR.active)
        return;
    if (SR.modeSel === 'learn') {
        const st = SR.steps[SR.stepIdx];
        if (!st)
            return;
        const need = st.notes.find((n: { nid: number; midi: number; }) => !SR.hit.has(n.nid) && n.midi === m);
        if (need) {
            SR.hit.add(need.nid);
            SR.results[need.nid] = 'good';
            if (st.notes.every((n: { nid: number; }) => SR.hit.has(n.nid))) {
                const next = SR.steps[SR.stepIdx + 1];
                srPlayGap(st.beat, next ? next.beat : 1e9);
                SR.stepIdx++;
                SR.hit.clear();
                if (SR.stepIdx >= SR.steps.length) {
                    srPaintAll();
                    srLearnFinish();
                    return;
                }
                srCount();
            }
            srPaintAll();
            srTargets();
            srScrollStep();
        }
        else {
            SR.mistakes++;
            srSlipNote(st, m);
            kbState(m, 'bad', true);
            SR.timers.push(setTimeout(() => { const el = keyEl.get(foldToView(m)); if (el && el.dataset.s === 'bad')
                kbState(m, null, true); srTargets(); }, 320));
            srCount();
        }
    }
    else if (SR.modeSel === 'assess' && SR.assessOn) {
        const bs = 60 / SR.bpm, bNow = (performance.now() - SR.t0) / 1000 / bs;
        let best: { nid: number; } | null = null, bestD = Infinity;
        for (const st of SR.steps) {
            if (st.closed)
                continue;
            const dd = Math.abs(bNow - st.beat);
            if (dd <= srTol() && dd < bestD) {
                const cand = st.notes.find((n: { nid: number; midi: number; }) => !SR.results[n.nid] && n.midi === m);
                if (cand) {
                    best = cand;
                    bestD = dd;
                }
            }
        }
        if (best) {
            SR.results[best.nid] = 'good';
            srPaintAll();
            return;
        }
        SR.wrongExtra++;
    }
}
function srListen() {
    if (!SR.piece)
        return;
    if (SR.listening) {
        srStopAll(true);
        return;
    }
    ensureAudio();
    srStopAll(true);
    SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
    if (!actx)
        return;
    const bs = 60 / SR.bpm, act0 = actx.currentTime + 0.1, perf0 = performance.now() + 100;
    SR.listening = true;
    byId('rd-listen').textContent = t('rd_stop');
    const follow = () => { if (!SR.listening)
        return; const b = (performance.now() - perf0) / 1000 / bs; if (b >= 0)
        srCursor(srBeatToX(Math.min(b, SR.totalBeats))); SR.raf = requestAnimationFrame(follow); };
    SR.raf = requestAnimationFrame(follow);
    SR.timers.push(setTimeout(() => srStopAll(true), SR.totalBeats * bs * 1000 + 400));
    SR.notes.forEach((n) => {
        previewNote(n.midi, act0 + n.beat * bs, Math.max(.15, n.dur * bs * .92), n.hand === 'lh' ? 80 : 96);
        SR.timers.push(setTimeout(() => {
            const svg = srSvg(), g = svg && svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!(g instanceof SVGElement))
                return;
            const prev = g.getAttribute('data-s');
            g.dataset.s = 'now';
            SR.timers.push(setTimeout(() => { if (g.dataset.s === 'now') {
                if (prev)
                    g.dataset.s = prev;
                else
                    g.removeAttribute('data-s');
            } }, Math.max(200, n.dur * bs * 900)));
        }, Math.max(0, (perf0 - performance.now()) + n.beat * bs * 1000)));
    });
}
function srGo() {
    if (!SR.piece)
        return;
    if (SR.active) {
        srStopAll();
        byId('rd-verdict').textContent = '';
        return;
    }
    srStopAll();
    ensureAudio();
    SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
    if (SR.modeSel === 'learn')
        srLearnStart();
    else
        srAssessStart();
}
function srMeta() {
    const p = SR.piece;
    if (!p)
        return;
    const n = p.keyN || 0;
    const keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n), key = pcName(keyPc, n < 0) + ' ' + (p.minor ? t('rd_min') : t('rd_maj'));
    if (p.gen) {
        byId('rd-meta').textContent = t('rdx_sr_meta', key, p.bpm) + ' · ' + p.ts[0] + '/' + p.ts[1];
        return;
    }
    if (p.ephemeral) {
        const from = p.from;
        if (!from)
            throw new TypeError('Étude: excerpt piece has no source');
        byId('rd-meta').textContent = t('rd_excerpt_from', from.title) + ' · ' + from.bars + ' · ' + key + ' · ' + p.ts[0] + '/' + p.ts[1] + ' · ' + t('rd_excerpt_simpl');
        return;
    }
    byId('rd-meta').textContent = t('rd_level') + ' ' + p.level + ' · ' + rootName(keyPc) + ' ' + (p.minor ? t('rd_min') : t('rd_maj')) + ' · ' + p.ts[0] + '/' + p.ts[1] + (p.comp ? (' · ' + p.comp) : '');
}
function srPieceTitle(p: { t?: Localised<string>; }) { return (p.t && (p.t[lang] || p.t.en)) || ''; }
function srBest() { const rec = SR.piece && !SR.piece.ephemeral && data.sheet[SR.piece.id]; byId('rd-best').textContent = rec && rec.best ? (t('rd_best', rec.best) + (rec.learned ? ' · ✓ ' + t('rd_learned') : '')) : (rec && rec.learned ? ('✓ ' + t('rd_learned')) : ''); }
function fillPieces() {
    const sel = selectById('rd-piece');
    if (!sel)
        return;
    const cur = sel.value;
    sel.innerHTML = '';
    if (SR.excerpt) {
        const og = (document).createElement('optgroup');
        og.label = t('rd_excerpt_group');
        const o = (document).createElement('option');
        o.value = SR.excerpt.id;
        o.textContent = srPieceTitle(SR.excerpt);
        og.appendChild(o);
        sel.appendChild(og);
    }
    if (SR.gen) {
        const og = (document).createElement('optgroup');
        og.label = t('rdx_u_sr');
        const o = (document).createElement('option');
        o.value = SR.gen.id;
        o.textContent = srPieceTitle(SR.gen);
        og.appendChild(o);
        sel.appendChild(og);
    }
    const lv: { [level: string]: (typeof PIECES)[number][]; } = {};
    PIECES.forEach((p) => { (lv[p.level] = lv[p.level] || []).push(p); });
    Object.keys(lv).sort().forEach((L) => {
        const og = (document).createElement('optgroup');
        og.label = t('rd_level') + ' ' + L;
        lv[L].forEach((p) => {
            const o = (document).createElement('option');
            o.value = p.id;
            const rec = data.sheet[p.id];
            o.textContent = srPieceTitle(p) + (rec && rec.best ? (' · ' + rec.best + '%') : (rec && rec.learned ? ' · ✓' : ''));
            og.appendChild(o);
        });
        sel.appendChild(og);
    });
    sel.value = (cur && (PIECES.some((p) => p.id === cur) || (SR.excerpt && SR.excerpt.id === cur) || (SR.gen && SR.gen.id === cur))) ? cur : PIECES[0].id;
}
function srSelectPiece(id: string) {
    srStopAll();
    SR.piece = (SR.excerpt && SR.excerpt.id === id ? SR.excerpt : null) || (SR.gen && SR.gen.id === id ? SR.gen : null) || PIECES.find((p) => p.id === id) || PIECES[0];
    SR.bpm = SR.piece.bpm;
    selectById('rd-piece').value = SR.piece.id;
    const bp = inputById('rd-bpm');
    bp.value = String(SR.piece.bpm);
    byId('rd-bpmLbl').textContent = String(SR.piece.bpm);
    const avail = srHandsAvail();
    [...byId('rd-hands').children].forEach((b) => {
        if (!(b instanceof HTMLButtonElement))
            return;
        b.disabled = avail !== 'both';
        b.setAttribute('aria-pressed', (avail === 'both' ? b.dataset.v === SR.hands : b.dataset.v === avail) ? 'true' : 'false');
    });
    srDraw();
    srMeta();
    srBest();
    byId('rd-verdict').textContent = '';
    if (!SR.piece)
        throw new Error('Étude: no piece selected');
    if (SR.piece.ephemeral && typeof rdTab === 'function')
        rdTab('pieces');
}
function renderRead() { fillPieces(); if (!SR.piece)
    srSelectPiece(selectById('rd-piece').value);
else {
    srDraw();
    srMeta();
    srBest();
} rdRender(); }
/* ============================================================================
   READING DRILLS (V3) — a structured, CMRT-style reading curriculum:
   note naming / playing, key→staff, intervals, chords, key signatures, rhythm,
   C clefs and generated sight-reading, with adaptive weighting, stars & stats.
   ============================================================================ */
type ReadClefStaff = 'treble' | 'bass' | 'alto' | 'tenor';
type ReadClefDraw = ReadClefStaff | 'grand';
type ReadClef = ReadClefDraw | 'mix';
type ReadDrillType = 'name' | 'play' | 'k2s' | 'ks' | 'iv' | 'ch' | 'rh' | 'sr';
const READ_DRILL_TYPES: readonly ReadDrillType[] = ['name', 'play', 'k2s', 'ks', 'iv', 'ch', 'rh', 'sr'];
const READ_CLEFS: readonly ReadClef[] = ['treble', 'bass', 'alto', 'tenor', 'grand', 'mix'];
function isReadDrillType(v: string): v is ReadDrillType { return READ_DRILL_TYPES.some((x) => x === v); }
function isReadClef(v: string): v is ReadClef { return READ_CLEFS.some((x) => x === v); }
type ReadDrillChordQuality = 'maj' | 'min' | 'dim' | 'aug';
const RD_REF: Record<ReadClefStaff, number> = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const RD_CLEFC: Record<ReadClefStaff, string> = { treble: 't', bass: 'b', alto: 'a', tenor: 'n' };
const RD_MAJ = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], RD_MIN = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
const RD_CHQ: Record<ReadDrillChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
const RD_TARGET: Partial<Record<ReadDrillType, number>> = { name: 2500, play: 3500, k2s: 4000, iv: 3500, ch: 6000, ks: 5000 };
interface ReadDrillLevelStat { s: number; acc: number; t: number; n: number; rush: number; }
interface ReadDrillNoteStat { n: number; ok: number; ms: number; e: number; t: number; }
interface ReadDrillTotals { n: number; ok: number; ms: number; sess: number; }
interface ReadDrillCustom { ty: string; clef: string; lo: string; hi: string; acc: number; keys: number; land: boolean; }
interface ReadDrillPrefs { tab: string; sound: boolean; hints: boolean; last: string | null; custom: ReadDrillCustom | null; rhDur: boolean; rhHands: number; srLv?: string; }
interface ReadDrillData { lv: { [levelId: string]: ReadDrillLevelStat; }; nt: { [noteKey: string]: ReadDrillNoteStat; }; tot: ReadDrillTotals; prefs: ReadDrillPrefs; }
function rdData(): ReadDrillData {
    if (!data.reading || typeof data.reading !== 'object')
        data.reading = {};
    const r = data.reading;
    r.lv = r.lv || {};
    r.nt = r.nt || {};
    r.tot = Object.assign({ n: 0, ok: 0, ms: 0, sess: 0 }, r.tot || {});
    r.prefs = Object.assign({ tab: 'drills', sound: true, hints: false, last: null, custom: null, rhDur: false, rhHands: 1 }, r.prefs || {});
    if (!isReadDrillData(r))
        throw new Error('Étude: reading progress could not be initialised');
    return r;
}
function isReadDrillData(r: Partial<ReadDrillData>): r is ReadDrillData { return !!r.lv && !!r.nt && !!r.tot && !!r.prefs; }
interface ReadDrillPitch { li: number; oct: number; acc: number; }
function rdP(s: string | undefined): ReadDrillPitch { const p = s === undefined ? null : srPitch(s); if (!p)
    throw new Error('Étude: bad pitch ' + s); return { li: p.li, oct: p.oct, acc: p.acc }; }
function rdStep(n: { li: number; oct: number; }) { return n.oct * 7 + n.li; }
function rdMidi(n: { li: number; oct: number; acc?: number; }) { return ssMidiOf(n.li, n.oct, n.acc || 0); }
function rdFromStep(s: number, acc?: number): ReadDrillPitch { return { li: ((s % 7) + 7) % 7, oct: Math.floor(s / 7), acc: acc || 0 }; }
function rdAccSym(a: number) { return a > 0 ? '♯' : a < 0 ? '♭' : ''; }
function rdLetter(li: number) { return (LETTERS[notation] || LETTERS.letter)[li]; }
function rdName(n: { li: number; oct: number; acc?: number; }, oct?: boolean) { return spelledName(notation, n.li, n.acc || 0) + (oct ? n.oct : ''); }
function rdSpell(s: string) { const m = /^([A-G])([#b]?)$/.exec(s); return m ? spelledName(notation, SR_LET.indexOf(m[1]), m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : ''; }
function rdKeyLabel(k: number) { return rdSpell(RD_MAJ[k + 7]) + ' ' + t('rd_maj'); }
function rdKeyMinor(k: number) { return rdSpell(RD_MIN[k + 7]) + ' ' + t('rd_min'); }
function rdNk(clef: ReadClefStaff, n: { li: number; oct: number; acc?: number; }) { return RD_CLEFC[clef] + ':' + SR_LET[n.li] + ((n.acc || 0) > 0 ? '#' : (n.acc || 0) < 0 ? 'b' : '') + n.oct; }
function rdEsc(s: string | number | undefined) { return String(s).replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'); }
/* ---- curriculum ---- */
interface ReadDrillLevelSpec { ty: ReadDrillType; clef?: ReadClef; set?: string[]; tag?: string; lo?: string; hi?: string; acc?: number; keys?: number | number[]; kmax?: number; ivs?: number[]; harm?: number; q?: ReadDrillChordQuality[]; inv?: number; units?: string[]; bpm?: number; durs?: number[]; }
interface ReadDrillLevel extends ReadDrillLevelSpec { u: string; n: number; id: string; custom?: boolean; }
interface ReadDrillUnit { u: string; icon: string; lv: ReadDrillLevel[]; }
const RD_UNITS: ReadDrillUnit[] = [], RD_LV: { [levelId: string]: ReadDrillLevel; } = {};
function rdU(u: string, icon: string, list: ReadDrillLevelSpec[]) { const lv = list.map((o, i) => Object.assign({ u, n: i + 1, id: u + (i + 1) }, o)); RD_UNITS.push({ u, icon, lv }); lv.forEach((L) => { RD_LV[L.id] = L; }); }
const rdS = (a: string) => a.split(' '), RD_ALLIV = [2, 3, 4, 5, 6, 7, 8];
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
    { ty: 'sr', clef: 'grand', lo: 'C4', hi: 'C5', durs: [1, 2, 0.5], keys: [-1, 0, 1], bpm: 72 }
]);
const RD_ALL = RD_UNITS.flatMap((u) => u.lv);
/* ---- staff renderer for drills (whole-note columns, any clef, key signatures) ---- */
function rdCClef(x: number, cy: number) {
    const p = (s: number) => `<path class="rdx-cc" d="M ${x + 9},${cy} C ${x + 13},${cy - 3 * s} ${x + 14},${cy - 8 * s} ${x + 15},${cy - 11 * s} C ${x + 18},${cy - 8 * s} ${x + 24},${cy - 10 * s} ${x + 24},${cy - 17 * s} C ${x + 24},${cy - 25 * s} ${x + 16},${cy - 26 * s} ${x + 12},${cy - 21 * s}"/>`;
    return `<g class="rdx-cclef"><rect x="${x}" y="${cy - 24}" width="4.5" height="48"/><rect x="${x + 6.5}" y="${cy - 24}" width="1.6" height="48"/>${p(1)}${p(-1)}</g>`;
}
function rdPercClef(x: number, top: number) { return `<g class="rdx-cclef"><rect x="${x}" y="${top + 12}" width="4" height="24"/><rect x="${x + 8}" y="${top + 12}" width="4" height="24"/></g>`; }
function rdKsSvg(clef: ReadClefStaff, keyN: number, x: number, top: number) {
    const bot = top + 48, ref = RD_REF[clef], off = ({ treble: 0, bass: -2, alto: -1, tenor: -1 } )[clef];
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]], sTn = [[3, 4], [0, 5], [4, 4], [1, 5], [5, 4], [2, 5], [6, 4]];
    const list = keyN > 0 ? (clef === 'tenor' ? sTn : sT) : fT;
    let s = '', xx = x;
    for (let i = 0; i < Math.abs(keyN); i++) {
        const y = bot + (ref - ssStepOf(list[i][0], list[i][1] + off)) * 6;
        s += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg: s, w: keyN ? Math.abs(keyN) * 9 + 8 : 4 };
}
interface ReadDrillStaffNote { li: number; oct: number; acc?: number; s?: string | null; hc?: string | null; tip?: string; staff?: ReadClefStaff; }
interface ReadDrillSvgOptions { clef: ReadClefDraw; keyN?: number; cols: ReadDrillStaffNote[][]; minW?: number; aria?: string; colW?: number; lbl?: (string | number | null | undefined)[] | null; scale?: number; dur?: number; lblCls?: (string | null | undefined)[]; }
interface ReadDrillSvgItem { n: ReadDrillStaffNote; ii: number; c: ReadClefStaff; top: number; step: number; y: number; dx: number; ax?: number; }
function rdSvg(o: ReadDrillSvgOptions) {
    const grand = o.clef === 'grand', clefs: ReadClefStaff[] = o.clef === 'grand' ? ['treble', 'bass'] : [o.clef], tops = grand ? [40, 136] : [40];
    const keyN = o.keyN || 0, kA = ssKeyAcc(keyN), colW = o.colW || 64, L0 = grand ? 18 : 8;
    let head = '', x = L0 + 4;
    clefs.forEach((c, i) => { head += (c === 'treble' || c === 'bass') ? srClef(c, x + 4, tops[i]) : rdCClef(x + 6, tops[i] + (c === 'alto' ? 24 : 12)); });
    x += 40;
    let ksw = 4;
    clefs.forEach((c, i) => { const k = rdKsSvg(c, keyN, x, tops[i]); head += k.svg; ksw = Math.max(ksw, k.w); });
    x += ksw + (o.cols.length ? 10 : 0);
    const x0 = x, body: string[] = [], heads: { c: number; i: number; x: number; y: number; }[] = [];
    let minY = tops[0], maxY = tops[tops.length - 1] + 48;
    o.cols.forEach((col, ci) => {
        const nx = x0 + ci * colW + colW / 2;
        const items = col.map((n, ii): ReadDrillSvgItem => {
            const c: ReadClefStaff = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : clefs[0], top = tops[clefs.indexOf(c)], st = rdStep(n);
            return { n, ii, c, top, step: st, y: top + 48 + (RD_REF[c] - st) * 6, dx: 0 };
        }).sort((a, b) => a.step - b.step);
        let prev: ReadDrillSvgItem | null = null;
        items.forEach((it) => { it.dx = (prev && prev.c === it.c && it.step - prev.step === 1 && prev.dx === 0) ? 12 : 0; prev = it; });
        const lanes: number[][] = [];
        items.slice().reverse().forEach((it) => {
            if ((it.n.acc || 0) === kA[it.n.li])
                return;
            let a = lanes.findIndex((l) => l.every((y: number) => Math.abs(y - it.y) >= 14));
            if (a < 0) {
                a = lanes.length;
                lanes.push([]);
            }
            lanes[a].push(it.y);
            it.ax = nx - 15 - a * 10;
        });
        items.forEach((it) => {
            let g = '';
            if (it.ax != null)
                g += ssAccGlyph(it.n.acc || 0, kA[it.n.li], it.ax, it.y);
            g += srLedger2(nx + it.dx, it.y, it.top) + ssNotehead(nx + it.dx, it.y, o.dur || 4, (RD_REF[it.c] - it.step) % 2 === 0);
            body.push(`<g class="ss-n" data-c="${ci}" data-i="${it.ii}"${it.n.s ? ` data-s="${it.n.s}"` : ''}${it.n.hc ? ` style="--hc:${it.n.hc}"` : ''}>${it.n.tip ? `<title>${rdEsc(it.n.tip)}</title>` : ''}${g}</g>`);
            heads.push({ c: ci, i: it.ii, x: nx + it.dx, y: it.y });
            minY = Math.min(minY, it.y);
            maxY = Math.max(maxY, it.y);
        });
    });
    const W = Math.max(o.minW || 0, x0 + o.cols.length * colW + 10), lblY = maxY + 24;
    const lbl = o.lbl;
    if (lbl)
        o.cols.forEach((_, ci) => { const l = lbl[ci]; if (l != null)
            body.push(`<text class="rdx-lbl${o.lblCls && o.lblCls[ci] ? ' ' + o.lblCls[ci] : ''}" x="${x0 + ci * colW + colW / 2}" y="${lblY}">${rdEsc(l)}</text>`); });
    const yA = Math.min(tops[0] - 10, minY - 14), yB = (o.lbl ? lblY + 10 : maxY + 14);
    let staff = '';
    tops.forEach((tp) => { for (let k = 0; k < 5; k++)
        staff += `<line class="ss-line" x1="${L0}" y1="${tp + k * 12}" x2="${W - 4}" y2="${tp + k * 12}" stroke-width="1.2"/>`; });
    staff += `<line class="ss-line" x1="${L0}" y1="${tops[0]}" x2="${L0}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.6"/><line class="ss-line" x1="${W - 4}" y1="${tops[0]}" x2="${W - 4}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`;
    if (grand)
        staff += `<path class="rdx-brace" d="M ${L0 - 3},40 C ${L0 - 13},44 ${L0 - 3},100 ${L0 - 14},112 C ${L0 - 3},124 ${L0 - 13},180 ${L0 - 3},184"/>`;
    const sc = o.scale || 1.5, H = yB - yA;
    return { svg: `<svg class="rdx-svg" viewBox="0 ${yA} ${W} ${H}" width="${Math.round(W * sc)}" height="${Math.round(H * sc)}" xmlns="http://www.w3.org/2000/svg" role="img"${o.aria ? ` aria-label="${rdEsc(o.aria)}"` : ''}>${staff}${head}${body.join('')}</svg>`, heads, W };
}
/* ---- drill engine ---- */
const RD_TESTN = 20, RD_RUSH = 60;
type ReadDrillMode = 'practice' | 'test' | 'rush';
interface ReadDrillState { on: boolean; L: ReadDrillLevel | null; mode: ReadDrillMode; q: ReadQuestion | null; n: number; ok: number; ms: number; streak: number; best: number; t0: number; answered: boolean; timers: ReturnType<typeof setTimeout>[]; bag: number[]; bagSig: string; lastK: string | null; accSel: number; miss: { [questionKey: string]: number; }; rushEnd: number; rushIv: ReturnType<typeof setInterval> | number; kbDown: number | null; rh: RdRhythmState | null; rhP: number[]; rhM: number[]; next: ReturnType<typeof rdNextStep>; nodes: OscillatorNode[]; hintT?: ReturnType<typeof setTimeout>; }
const RD: ReadDrillState = { on: false, L: null, mode: 'practice', q: null, n: 0, ok: 0, ms: 0, streak: 0, best: 0, t0: 0, answered: false, timers: [], bag: [], bagSig: '', lastK: null, accSel: 0, miss: {}, rushEnd: 0, rushIv: 0, kbDown: null, rh: null, rhP: [], rhM: [], next: null, nodes: [] };
function rdLvPrev(L: ReadDrillLevel) { const u = RD_UNITS.find((x) => x.u === L.u); return u && L.n > 1 ? u.lv[L.n - 2] : null; }
function rdLvNext(L: ReadDrillLevel) { const u = RD_UNITS.find((x) => x.u === L.u); return u ? u.lv[L.n] || null : null; }
function rdUnlocked(L: ReadDrillLevel | null | undefined) { if (!L)
    return false; const p = rdLvPrev(L); return !p || (rdData().lv[p.id]?.s || 0) >= 1; }
function rdTarget(L: ReadDrillLevel | null) { if (!L)
    throw new Error('Étude: no reading level'); return (RD_TARGET[L.ty] || 3000) + ((L.clef === 'grand' || L.clef === 'mix') ? 800 : 0) + ((L.acc || L.keys) ? 1000 : 0); }
function rdStat(k: string, ok: boolean, ms: number) {
    const d = rdData(), s = d.nt[k] || (d.nt[k] = { n: 0, ok: 0, ms: 0, e: 0, t: 0 });
    s.e = s.n ? s.e * 0.7 + (ok ? 0 : 0.3) : (ok ? 0.1 : 1);
    s.t = s.n ? Math.round(s.t * 0.7 + ms * 0.3) : ms;
    s.n++;
    if (ok)
        s.ok++;
    s.ms += ms;
}
function rdWeight(k: string) { const s = rdData().nt[k]; if (!s || !s.n)
    return 2.2; const slow = Math.min(2, Math.max(0, (s.t || 0) / rdTarget(RD.L) - 1)); return 1 + 6 * (s.e || 0) + 1.5 * slow + (s.n < 3 ? 0.8 : 0); }
function rdPickW<T>(items: T[], keyOf: (x: T) => string, avoid: string | null) {
    let c = items.filter((x) => keyOf(x) !== avoid);
    if (!c.length)
        c = items;
    const w = c.map((x) => rdWeight(keyOf(x)));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) {
        r -= w[i];
        if (r <= 0)
            return c[i];
    }
    return c[c.length - 1];
}
// In test mode the bag holds shuffled indices into items; the same signature means the same keys in the same order.
function rdPickFrom<T>(items: T[], keyOf: (x: T) => string) {
    let r: T;
    if (RD.mode === 'test') {
        const sig = items.map((x) => keyOf(x)).join('|');
        if (RD.bagSig !== sig || !RD.bag.length) {
            RD.bagSig = sig;
            RD.bag = rdShuffle(items.map((_, j) => j));
        }
        let i = RD.bag.findIndex((j) => keyOf(items[j]) !== RD.lastK);
        if (i < 0)
            i = 0;
        r = items[RD.bag.splice(i, 1)[0]];
    }
    else
        r = rdPickW(items, keyOf, RD.lastK);
    RD.lastK = keyOf(r);
    return r;
}
function rdPool(L: ReadDrillLevel): ReadDrillPitch[] {
    if (L.set)
        return L.set.map((x) => rdP(x));
    const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), out: ReadDrillPitch[] = [];
    for (let s = lo; s <= hi; s++) {
        const n = rdFromStep(s);
        out.push(n);
        if (L.acc === 1 || L.acc === 2) {
            if (n.li !== 2 && n.li !== 6)
                out.push(rdFromStep(s, 1));
        }
        if (L.acc === -1 || L.acc === 2) {
            if (n.li !== 0 && n.li !== 3)
                out.push(rdFromStep(s, -1));
        }
    }
    return out;
}
function rdIvName(n: string|number) { return t('rdx_iv' + n); }
function rdChLabel(li: number, q: string) { return rdLetter(li) + ' ' + t('rdx_q_' + q); }
function rdShuffle<T>(a: T[]): T[] { const r = shuffle(a); if (typeof r === 'string')
    throw new Error('Étude: shuffle needs an array'); return r; }
function rdStaffClef(c: ReadClef | undefined): ReadClefStaff { if (c === 'treble' || c === 'bass' || c === 'alto' || c === 'tenor')
    return c; throw new Error('Étude: this drill needs a single staff, not ' + c); }
interface ReadQuestionBase { key: string; hinted?: boolean; state?: 'good' | 'bad' | null; lbl?: string; }
interface ReadQuestionKs extends ReadQuestionBase { ty: 'ks'; clef: ReadClefDraw; keyN: number; ans: number; opts: { v: number; l: string; s: string; }[]; midis?: undefined; }
interface ReadQuestionIv extends ReadQuestionBase { ty: 'iv'; clef: ReadClefStaff; ans: number; a: ReadDrillPitch; b: ReadDrillPitch; harm: boolean; opts: { v: number; l: string; k: string; }[]; midis: number[]; }
interface ReadQuestionCh extends ReadQuestionBase { ty: 'ch'; clef: ReadClefStaff; ans: string; root: ReadDrillPitch; qual: ReadDrillChordQuality; inv: number; notes: ReadDrillPitch[]; opts: { v: string; l: string; }[]; midis: number[]; pcs: number[]; }
interface ReadQuestionNote extends ReadQuestionBase { ty: Exclude<ReadDrillType, 'ks' | 'iv' | 'ch'>; clef: ReadClefDraw; keyN: number; note: ReadDrillPitch; sclef: ReadClefStaff; midi: number; midis: number[]; needAcc: boolean; opts?: { v: number; n: ReadDrillPitch; }[]; ans?: number; }
type ReadQuestion = ReadQuestionKs | ReadQuestionIv | ReadQuestionCh | ReadQuestionNote;
function rdGen(L: ReadDrillLevel): ReadQuestion {
    const ty = L.ty;
    if (ty === 'ks') {
        const ks: number[] = [];
        if (L.kmax === undefined)
            throw new Error('Étude: key-signature level without kmax');
        for (let k = -L.kmax; k <= L.kmax; k++)
            ks.push(k);
        const k = rdPickFrom(ks, (v) => 'ks:' + v);
        const opts = rdShuffle(ks.filter((v) => v !== k)).slice(0, 5).concat([k]).sort((a, b) => a - b);
        const clef = L.clef;
        if (clef === undefined || clef === 'mix')
            throw new Error('Étude: key-signature level without a staff');
        return { ty, clef, keyN: k, key: 'ks:' + k, ans: k, opts: opts.map((v) => ({ v, l: rdKeyLabel(v), s: rdKeyMinor(v) })) };
    }
    if (ty === 'iv') {
        const ivs = L.ivs;
        if (!ivs)
            throw new Error('Étude: interval level without intervals');
        const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), iv = rdPickFrom(ivs, (v) => 'iv:' + v);
        let a = lo, b = lo + iv - 1;
        for (let k = 0; k < 40; k++) {
            a = lo + Math.floor(Math.random() * (hi - lo + 1));
            b = a + (Math.random() < .5 ? 1 : -1) * (iv - 1);
            if (b < lo || b > hi)
                b = a - (b - a);
            if (b >= lo && b <= hi)
                break;
        }
        const harm = L.harm === 1 || (L.harm === 2 && Math.random() < .5);
        let na = rdFromStep(a), nb = rdFromStep(b);
        if (harm && a > b) {
            const x = na;
            na = nb;
            nb = x;
        }
        return { ty, clef: rdStaffClef(L.clef), key: 'iv:' + iv, ans: iv, a: na, b: nb, harm, opts: ivs.map((v) => ({ v, l: rdIvName(v), k: String(v) })), midis: [rdMidi(na), rdMidi(nb)] };
    }
    if (ty === 'ch') {
        const quals = L.q;
        if (!quals)
            throw new Error('Étude: chord level without qualities');
        const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), qual = rdPickFrom(quals, (v) => 'ch:' + v);
        let notes: ReadDrillPitch[] | null = null, root: ReadDrillPitch | null = null, inv = 0;
        for (let k = 0; k < 80 && !notes; k++) {
            const rs = lo + Math.floor(Math.random() * Math.max(1, hi - lo - 3));
            root = rdFromStep(rs);
            const rm = rdMidi(root);
            const ns = [0, 1, 2].map((j) => { const n = rdFromStep(rs + 2 * j); n.acc = rm + RD_CHQ[qual][j] - rdMidi(n); return n; });
            if (ns.some((n) => Math.abs(n.acc) > 1))
                continue;
            inv = L.inv ? Math.floor(Math.random() * 3) : 0;
            for (let i = 0; i < inv; i++) {
                const x = ns.shift();
                if (!x)
                    throw new Error('Étude: empty chord');
                x.oct++;
                ns.push(x);
            }
            notes = ns;
        }
        if (!root)
            throw new Error('Étude: no chord root');
        const r0 = root, ans = r0.li + ':' + qual, set = new Set([ans]);
        quals.forEach((q) => set.add(r0.li + ':' + q));
        while (set.size < 6) {
            set.add(Math.floor(Math.random() * 7) + ':' + ssPick(quals));
        }
        const opts = rdShuffle([...set]).map((v) => { const [li, q] = v.split(':'); return { v, l: rdChLabel(+li, q) }; });
        if (!notes)
            throw new Error('Étude: no chord found');
        const midis = notes.map((n) => rdMidi(n));
        return { ty, clef: rdStaffClef(L.clef), key: 'ch:' + qual, ans, root: r0, qual, inv, notes, opts, midis, pcs: [...new Set(midis.map(pc))].sort((a, b) => a - b) };
    }
    let clef = L.clef, pool: ReadDrillPitch[], keyN = 0;
    if (clef === 'mix') {
        const mc: ReadClefStaff = ssPick(['treble', 'bass', 'alto', 'tenor']);
        clef = mc;
        const r = RD_REF[mc];
        pool = [];
        for (let s = r - 2; s <= r + 10; s++)
            pool.push(rdFromStep(s));
    }
    else
        pool = rdPool(L);
    if (L.keys) {
        const keys = L.keys;
        if (typeof keys !== 'number')
            throw new Error('Étude: note drills take a key-signature range, not a list');
        keyN = Math.floor(Math.random() * (2 * keys + 1)) - keys;
        const kA = ssKeyAcc(keyN);
        pool = pool.map((n) => Object.assign({}, n, { acc: kA[n.li] }));
    }
    if (clef === undefined)
        throw new Error('Étude: note drill without a clef');
    const dc = clef;
    const sc = (n: ReadDrillPitch): ReadClefStaff => dc === 'grand' ? (rdStep(n) >= 28 ? 'treble' : 'bass') : dc;
    const n = rdPickFrom(pool, (x) => rdNk(sc(x), x));
    const q: ReadQuestionNote = { ty, clef: dc, keyN, note: n, sclef: sc(n), key: rdNk(sc(n), n), midi: rdMidi(n), midis: [rdMidi(n)], needAcc: !!(L.acc || L.keys) };
    if (ty === 'k2s') {
        const seen = new Set([q.midi]), opts = [n];
        for (const x of rdShuffle(pool)) {
            if (opts.length >= 4)
                break;
            const m = rdMidi(x);
            if (!seen.has(m)) {
                seen.add(m);
                opts.push(x);
            }
        }
        const qo = rdShuffle(opts).map((x, i) => ({ v: i, n: x }));
        q.opts = qo;
        q.ans = qo.findIndex((o) => o.n === n);
    }
    return q;
}
function rdQSvg(q: ReadQuestion, extra?: ReadDrillStaffNote | null) {
    const st = q.state;
    if (q.ty === 'ks')
        return rdSvg({ clef: q.clef, keyN: q.keyN, cols: [], minW: 150, aria: t('rdx_p_ks') }).svg;
    if (q.ty === 'iv') {
        const a = Object.assign({ s: st }, q.a), b = Object.assign({ s: st }, q.b);
        return rdSvg({ clef: q.clef, cols: q.harm ? [[a, b]] : [[a], [b]], colW: q.harm ? 96 : 72 }).svg;
    }
    if (q.ty === 'ch')
        return rdSvg({ clef: q.clef, cols: [q.notes.map((n) => Object.assign({ s: st }, n))], colW: 100 }).svg;
    const col: ReadDrillStaffNote[] = [Object.assign({ s: q.ty === 'k2s' ? null : st }, q.note)];
    if (extra)
        col.push(extra);
    return rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, keyN: q.keyN, cols: [col], colW: 100, lbl: q.lbl ? [q.lbl] : null }).svg;
}
function rdKbRange(q: ReadQuestionNote) {
    const L = RD.L;
    if (!L)
        throw new Error('Étude: no reading level');
    let lo = L.lo ? rdMidi(rdP(L.lo)) : 48, hi = L.hi ? rdMidi(rdP(L.hi)) : 71;
    lo = Math.min(lo, q.midi);
    hi = Math.max(hi, q.midi);
    return [lo - pc(lo), hi + (11 - pc(hi))];
}
function rdMiniKb(lo: number, hi: number, mark: number | null, inter: boolean) {
    const whites: number[] = [];
    for (let m = lo; m <= hi; m++)
        if (![1, 3, 6, 8, 10].includes(pc(m)))
            whites.push(m);
    const ww = 100 / whites.length, tag = inter ? 'button' : 'span', keyAttrs = (m: number) => inter ? ` type="button" aria-label="${rdEsc(noteName(m, false))}"` : '';
    let w = '', bk = '';
    whites.forEach((m, i) => {
        w += `<${tag} class="rdx-w" data-m="${m}" style="left:${(i * ww).toFixed(3)}%;width:${ww.toFixed(3)}%"${keyAttrs(m)}${m === mark ? ' data-s="target"' : ''}>${pc(m) === 0 ? `<i>${rdLetter(0)}${Math.floor(m / 12) - 1}</i>` : ''}</${tag}>`;
        if ([0, 2, 5, 7, 9].includes(pc(m)) && m + 1 <= hi)
            bk += `<${tag} class="rdx-b" data-m="${m + 1}" style="left:${((i + 1) * ww - ww * 0.3).toFixed(3)}%;width:${(ww * 0.6).toFixed(3)}%"${keyAttrs(m + 1)}${m + 1 === mark ? ' data-s="target"' : ''}></${tag}>`;
    });
    return `<div class="rdx-kb${inter ? ' inter' : ''}" id="rdx-kb"${inter ? ` role="group" aria-label="${rdEsc(t('rdx_p_play'))}"` : ' aria-hidden="true"'}>${w}${bk}</div>`;
}
function rdKbMark(m: number, s?: string) { const el = (document).querySelector('#rdx-kb [data-m="' + m + '"]'); if (el instanceof HTMLElement) {
    if (s)
        el.dataset.s = s;
    else
        delete el.dataset.s;
} }
interface ReadDrillButton { v: number | string; l?: string; html?: string; k?: string; s?: string; }
function rdBtn(o: ReadDrillButton, i: number, cls?: string) { return `<button class="chip rdx-a${cls ? ' ' + cls : ''}" data-a="${rdEsc(o.v)}" data-k="${o.k || (i + 1)}">${o.html || rdEsc(o.l)}${o.s ? `<small>${rdEsc(o.s)}</small>` : ''}<kbd>${o.k || (i + 1)}</kbd></button>`; }
function rdNext() {
    clearTimeout(RD.hintT);
    RD.answered = false;
    RD.accSel = 0;
    if (!RD.L)
        throw new Error('Étude: no reading level');
    const q = RD.q = rdGen(RD.L);
    q.hinted = false;
    q.state = null;
    let acc = '', ans = '', kb = '';
    if (q.ty === 'name') {
        if (q.needAcc)
            acc = `<div class="seg rdx-accs" id="rdx-accs" role="group" aria-label="${t('rdx_accl')}">${[-1, 0, 1].map((a, i) => `<button data-acc="${a}" aria-pressed="${a === 0}" title="${t('rdx_acc_t' + a)}">${a < 0 ? '♭' : a > 0 ? '♯' : '♮'}<kbd>${['-', '0', '='][i]}</kbd></button>`).join('')}</div>`;
        ans = [0, 1, 2, 3, 4, 5, 6].map((li) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
    }
    else if (q.ty === 'play') {
        const r = rdKbRange(q);
        kb = rdMiniKb(r[0], r[1], null, true);
    }
    else if (q.ty === 'k2s') {
        const r = rdKbRange(q);
        kb = rdMiniKb(r[0], r[1], q.midi, false);
        const opts = q.opts;
        if (!opts)
            throw new Error('Étude: key-to-staff question without options');
        ans = opts.map((o, i) => rdBtn({ v: o.v, html: rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, cols: [[o.n]], colW: 56, scale: 0.8 }).svg }, i, 'rdx-opt')).join('');
    }
    else {
        const opts = q.opts;
        if (!opts)
            throw new Error('Étude: question without options');
        const btns: ReadDrillButton[] = opts.map((o) => 'n' in o ? { v: o.v } : o);
        ans = btns.map((o, i) => rdBtn(o, i)).join('');
    }
    const pr = RD.mode === 'practice';
    byId('rdx-body').innerHTML = `<div class="rdx-q"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty)}</div>${q.ty === 'k2s' ? kb : ''}<div class="rdx-staff" id="rdx-staff">${q.ty === 'k2s' ? '' : rdQSvg(q)}</div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${q.ty === 'k2s' ? '' : kb}<div class="rdx-tools">${pr ? `<button class="btn ghost sm" id="rdx-hear">🔊 ${t('rdx_hear')}</button><button class="btn ghost sm" id="rdx-hintb">💡 ${t('rdx_hint')}</button>` : ''}<span class="rdx-kbd">${t('rdx_keys_' + q.ty) + (q.ty === 'name' && q.needAcc ? t('rdx_keys_acc') : '')}</span></div></div>`;
    if (q.ty === 'k2s' && rdData().prefs.sound)
        rdSound(q.midis);
    if (pr && rdData().prefs.hints)
        RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
            rdHint(); }, 4000);
    rdHud();
    RD.t0 = performance.now();
}
function rdSound(ms?: number[], arp?: boolean) { if (!ms || !ms.length)
    return; ensureAudio(); if (!actx)
    return; const t0 = actx.currentTime + 0.03; ms.forEach((m, i) => previewNote(m, t0 + (arp ? i * 0.45 : 0), 0.9, 88)); }
const RD_LM = [14, 18, 21, 24, 28, 32, 35, 38, 42];
function rdHint() {
    const q = RD.q;
    if (!q || RD.answered)
        return;
    q.hinted = true;
    let s = '';
    if (q.ty === 'name' || q.ty === 'play') {
        const st = rdStep(q.note);
        let lm = RD_LM[0];
        RD_LM.forEach((x) => { if (Math.abs(x - st) < Math.abs(lm - st))
            lm = x; });
        const d = st - lm, nm = rdName(rdFromStep(lm), true);
        s = d === 0 ? t('rdx_hint_same', nm) : t(d > 0 ? 'rdx_hint_up' : 'rdx_hint_dn', Math.abs(d), nm);
        if (q.ty === 'play')
            rdKbMark(q.midi, 'target');
    }
    else if (q.ty === 'k2s')
        s = t('rdx_hint_k2s', rdName(q.note, true));
    else if (q.ty === 'iv') {
        const l1 = (RD_REF[q.clef] - rdStep(q.a)) % 2 === 0, l2 = (RD_REF[q.clef] - rdStep(q.b)) % 2 === 0;
        s = t(l1 === l2 ? 'rdx_hint_odd' : 'rdx_hint_even');
    }
    else if (q.ty === 'ch')
        s = t('rdx_hint_ch', rdLetter(q.root.li));
    else if (q.ty === 'ks')
        s = t(q.keyN > 0 ? 'rdx_hint_ks_s' : q.keyN < 0 ? 'rdx_hint_ks_f' : 'rdx_hint_ks_0');
    const f = maybeById('rdx-fb');
    if (f) {
        f.className = 'rdx-fb hint';
        f.textContent = '💡 ' + s;
    }
}
function rdAnsText(q: ReadQuestion) { if (q.ty === 'iv')
    return rdIvName(q.ans); if (q.ty === 'ch')
    return rdChLabel(q.root.li, q.qual); if (q.ty === 'ks')
    return rdKeyLabel(q.ans) + ' / ' + rdKeyMinor(q.ans); return rdName(q.note, true); }
interface ReadDrillGiven { btn?: Element; midi?: number; }
function rdAnswer(ok: boolean, given?: ReadDrillGiven) {
    const q = RD.q;
    if (!q || RD.answered || !RD.on)
        return;
    RD.answered = true;
    clearTimeout(RD.hintT);
    const ms = Math.round(performance.now() - RD.t0);
    RD.n++;
    RD.ms += ms;
    if (ok) {
        RD.ok++;
        RD.streak++;
        RD.best = Math.max(RD.best, RD.streak);
    }
    else {
        RD.streak = 0;
        RD.miss[q.key] = (RD.miss[q.key] || 0) + 1;
    }
    if (!q.hinted) {
        rdStat(q.key, ok, ms);
        const tt = rdData().tot;
        tt.n++;
        if (ok)
            tt.ok++;
        tt.ms += ms;
    }
    rdFeedback(ok, given || {});
    rdHud();
    const done = RD.mode === 'test' && RD.n >= RD_TESTN;
    RD.timers.push(setTimeout(() => { if (!RD.on)
        return; if (done || (RD.mode === 'rush' && performance.now() >= RD.rushEnd))
        rdFinish();
    else
        rdNext(); }, ok ? (RD.mode === 'practice' ? 650 : 380) : (RD.mode === 'rush' ? 800 : 1500)));
}
function rdFeedback(ok: boolean, g: ReadDrillGiven) {
    const q = RD.q;
    if (!q)
        throw new Error('Étude: no reading question');
    q.state = ok ? 'good' : 'bad';
    if (q.ty === 'name' && !ok)
        q.lbl = rdName(q.note, true);
    const extra = (q.ty === 'play' && !ok && g.midi != null) ? Object.assign(rdSpellMidi(g.midi, q.keyN), { s: 'bad' }) : null;
    if (extra)
        q.state = null;
    if (q.ty !== 'k2s')
        byId('rdx-staff').innerHTML = rdQSvg(q, extra);
    const sv = byId('rdx-staff');
    sv.classList.remove('flash-ok', 'flash-bad');
    void sv.offsetWidth;
    sv.classList.add(ok ? 'flash-ok' : 'flash-bad');
    byId('rdx-ans').querySelectorAll('.rdx-a').forEach((b) => { if (!(b instanceof HTMLButtonElement))
        return; b.disabled = true; if (b.dataset.a === String(q.ans) || (q.ty === 'name' && Number(b.dataset.a) === q.note.li))
        b.classList.add('correct');
    else if (g.btn === b)
        b.classList.add('wrong'); });
    if (q.ty === 'play' || q.ty === 'k2s') {
        rdKbMark(q.midi, 'good');
        if (g.midi != null && g.midi !== q.midi)
            rdKbMark(g.midi, 'bad');
    }
    const f = byId('rdx-fb'), msg = ok ? (t('rdx_ok') + (RD.streak >= 3 ? '  🔥 ' + RD.streak : '')) : t('rdx_wrong', rdAnsText(q)) + (extra ? ' · ' + t('rdx_played', rdName(extra, true)) : '');
    f.className = 'rdx-fb ' + (ok ? 'good' : 'bad');
    f.textContent = (ok ? '✓ ' : '✗ ') + msg;
    byId('rdx-live').textContent = msg;
    if (rdData().prefs.sound && q.ty !== 'play' && !(q.ty === 'k2s') && q.midis)
        rdSound(q.midis, q.ty === 'iv' && !q.harm);
}
function rdClickAns(b: HTMLElement) {
    const q = RD.q;
    if (!q || RD.answered || !RD.on)
        return;
    const v = b.dataset.a;
    if (q.ty === 'name')
        return rdAnswer(Number(v) === q.note.li && (!q.needAcc || RD.accSel === (q.note.acc || 0)), { btn: b });
    if (q.ty === 'k2s')
        return rdAnswer(Number(v) === q.ans, { btn: b });
    rdAnswer(v === String(q.ans), { btn: b });
}
function rdInput(m: number) {
    if (!RD.on)
        return;
    if (!RD.L)
        throw new Error('Étude: no reading level');
    if (RD.L.ty === 'rh') {
        rdTap(m < 60 ? 'L' : 'R');
        return;
    }
    const q = RD.q;
    if (!q || RD.answered)
        return;
    const own = inputOwners.get(m), strict = !!own && [...own].some((s) => s === 'midi' || s === 'ble' || s === 'rdk');
    if (q.ty === 'play')
        return rdAnswer(strict ? m === q.midi : pc(m) === pc(q.midi), { midi: m });
    if (q.ty === 'name')
        return rdAnswer(pc(m) === pc(q.midi), { midi: m });
    if (q.ty === 'k2s') {
        const opts = q.opts;
        if (!opts)
            throw new Error('Étude: key-to-staff question without options');
        const i = opts.findIndex((o) => strict ? rdMidi(o.n) === m : pc(rdMidi(o.n)) === pc(m));
        if (i >= 0)
            rdAnswer(i === q.ans, { btn: byId('rdx-ans').querySelectorAll('.rdx-a')[i], midi: m });
        return;
    }
    if (q.ty === 'ch') {
        const hp = heldPcs();
        if (hp.length >= 3)
            rdAnswer(hp.join() === q.pcs.join(), {});
    }
}
function rdHud() {
    const h = byId('rdx-hud'), mt = byId('rdx-meter');
    if (!h)
        return;
    let s = '', f: number | null = null;
    if (RD.L && RD.L.ty === 'rh') {
        const rp = RD.rhP || [], n = rp.length;
        s = n ? '⌀ ' + Math.round(rp.reduce((x, y) => x + y, 0) / n) + '% · ' + n + '×' : '';
        if (RD.mode === 'test')
            f = n / 4;
    }
    else if (RD.mode === 'test') {
        s = t('rdx_hud_q', Math.min(RD_TESTN, RD.n + (RD.answered ? 0 : 1)), RD_TESTN) + ' · ✓ ' + RD.ok;
        f = RD.n / RD_TESTN;
    }
    else if (RD.mode === 'rush') {
        const left = Math.max(0, Math.ceil((RD.rushEnd - performance.now()) / 1000));
        s = '⏱ ' + left + 's · ✓ ' + RD.ok;
        f = left / RD_RUSH;
    }
    else
        s = '✓ ' + RD.ok + '/' + RD.n + (RD.streak >= 2 ? ' · 🔥 ' + RD.streak : '');
    h.textContent = s;
    mt.hidden = f == null;
    const progress = mt.firstElementChild;
    if (f != null && progress instanceof HTMLElement)
        progress.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
}
/* ---- rhythm reading: tap the rhythm against a metronome ---- */
type RdRhythmUnit = '4' | '2' | '1' | '8' | 'r4' | 'd' | '16';
const RD_RHU: Record<RdRhythmUnit, number[][]> = { '4': [[1]], '2': [[2]], '1': [[4]], '8': [[.5], [.5]], 'r4': [[1, 1]], 'd': [[1.5], [.5]], '16': [[.25], [.25], [.25], [.25]] };
function isRdRhythmUnit(u: string): u is RdRhythmUnit { return Object.hasOwn(RD_RHU, u); }
// One written note or rest of a rhythm exercise, in beats from the start of the first bar.
interface RdRhythmEvent { beat: number; dur: number; rest: boolean; u?: RdRhythmUnit; }
/** The tempo of a rhythm or sight-reading level; every such level in the curriculum sets one. */
function rdLevelBpm(L: ReadDrillLevel): number { if (L.bpm === undefined)
    throw new TypeError('Étude: level ' + L.id + ' has no tempo'); return L.bpm; }
function rdRhGen(L: { units?: readonly string[]; }) {
    const units = L.units;
    if (!units)
        throw new TypeError('Étude: rhythm level has no note values');
    let ev: RdRhythmEvent[] = [];
    for (let tries = 0; tries < 12; tries++) {
        ev = [];
        for (let bar = 0; bar < 2; bar++) {
            let pos = 0;
            while (pos < 4 - 1e-6) {
                const c = units.filter((u): u is RdRhythmUnit => { if (!isRdRhythmUnit(u))
                    return false; const len = RD_RHU[u].reduce((a: number, x: number[]) => a + x[0], 0); return len <= 4 - pos + 1e-6 && !(u === '1' && pos > 0) && !(u === 'r4' && bar === 0 && pos === 0) && !(u === 'd' && pos % 2); });
                const u: RdRhythmUnit = c.length ? ssPick(c) : '4';
                RD_RHU[u].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1], u }); pos += x[0]; });
            }
        }
        const last = units[units.length - 1];
        if (ev.some((e) => e.u === last) && ev.filter((e) => !e.rest).length >= 4)
            break;
    }
    return ev;
}
// How one written onset was met: good/near/bad, and how far off the matched tap was in ms (null when nothing matched).
interface RdRhythmTapResult { s: string; off: number | null; }
// Tap-only grading: per-onset results, the count of extra taps, the score in % and the mean offset in ms.
interface RdRhythmTapGrade { res: RdRhythmTapResult[]; extra: number; good: number; near: number; pct: number; mean: number; }
function rdRhGrade(on: readonly number[], taps: readonly number[], bs: number): RdRhythmTapGrade {
    const used = new Set<number>(), res: RdRhythmTapResult[] = [];
    let minI = 4;
    for (let i = 1; i < on.length; i++)
        minI = Math.min(minI, on[i] - on[i - 1]);
    const win = Math.min(0.25, 0.5 * minI * bs);
    on.forEach((b: number) => {
        let bi = -1, bd = Infinity;
        taps.forEach((tb: number, j: number) => { if (used.has(j))
            return; const d = (tb - b) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        if (bi >= 0) {
            used.add(bi);
            const a = Math.abs(bd) * 1000;
            res.push({ s: a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad', off: bd * 1000 });
        }
        else
            res.push({ s: 'bad', off: null });
    });
    const extra = taps.length - used.size, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length;
    const offs = res.filter((r): r is RdRhythmTapResult & { off: number; } => r.off != null).map((r) => r.off), mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
    return { res, extra, good, near, pct: Math.max(0, Math.round(100 * (good + 0.5 * near) / Math.max(1, on.length) - extra * 5)), mean: Math.round(mean) };
}
function rdClick(tm: number, acc: boolean) {
    const click = audioEngine.scheduleClick(tm, acc);
    if (click?.oscs)
        (RD.nodes = RD.nodes || []).push(...click.oscs);
}
function rdBeatX(r: { beatX: readonly { b: number; x: number; }[]; }, beat: number) { const p = r.beatX; for (let i = 0; i < p.length - 1; i++) {
    if (beat >= p[i].b && beat <= p[i + 1].b) {
        const f = (beat - p[i].b) / Math.max(1e-3, p[i + 1].b - p[i].b);
        return p[i].x + f * (p[i + 1].x - p[i].x);
    }
} return beat <= p[0].b ? p[0].x : p[p.length - 1].x; }
// Options (remembered): grade how long each note is held, and/or a left-hand part on a second staff.
function rdRhPrefs() { const p = rdData().prefs; return { dur: !!p.rhDur, two: p.rhHands === 2 }; }
type RdLeftHandPattern = 'whole' | 'half' | 'pulse' | 'onethree' | 'twofour';
const RD_LH_PAT: Record<RdLeftHandPattern, number[][]> = { whole: [[4]], half: [[2], [2]], pulse: [[1], [1], [1], [1]], onethree: [[1], [1, 1], [1], [1, 1]], twofour: [[1, 1], [1], [1, 1], [1]] };
function rdRhGenLH(L: { n: number; }) {
    const pool: RdLeftHandPattern[] = L.n <= 2 ? ['whole', 'half'] : L.n === 3 ? ['whole', 'half', 'pulse'] : ['half', 'pulse', 'onethree', 'twofour'], ev: RdRhythmEvent[] = [];
    for (let bar = 0; bar < 2; bar++) {
        let pos = 0;
        const pat: RdLeftHandPattern = ssPick(pool);
        RD_LH_PAT[pat].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1] }); pos += x[0]; });
    }
    return ev;
}
// The anchors on the dock keyboard: C3 for the left hand, C5 for the right (any key below / from middle C counts for that hand).
function rdRhMarks(on: boolean) { [48, 72].forEach((m) => kbState(m, on ? 'target' : null, false)); }
// What srRender returns that a rhythm exercise reads back: the staff, its vertical extent, beat → x anchors and the drawn notes.
interface RdRhythmRender { svg: string; yTop: number; yBot: number; beatX: { b: number; x: number; }[]; notes: { nid: number; hand: string; beat: number; }[]; }
// The piece handed to srRender for a rhythm exercise: percussion notes on B4 (right hand) and D3 (left hand), or rests.
interface RdRhythmPiece { id: string; perc: boolean; noNames: boolean; ts: number[]; keyN: number; bpm: number; rh: [string, number][]; lh?: [string, number][]; }
// One key press (or pad tap) in beats from the downbeat; off stays null until it is released.
interface RdRhythmPress { src: string; hand: 'L' | 'R'; on: number; off: number | null; }
type RdRhythmGrade = RdRhythmTapGrade | RdRhythmAllGrade;
// The rhythm exercise on show (RD.rh): what is written, how it was drawn, and the presses of the current run.
interface RdRhythmState { ev: RdRhythmEvent[]; lh: RdRhythmEvent[] | null; r: RdRhythmRender; dur: boolean; two: boolean; on: number[]; taps: number[]; presses: RdRhythmPress[]; open: Map<string, RdRhythmPress>; playing: boolean; graded: RdRhythmGrade | null; raf: number; listen: boolean; t0: number; }
function rdRhNew(keep?: boolean) {
    const L = RD.L, pr = rdRhPrefs(), old = keep && RD.rh;
    if (!L)
        return;
    const ev = old ? old.ev : rdRhGen(L), lh = pr.two ? ((old && old.lh) || rdRhGenLH(L)) : null;
    const piece: RdRhythmPiece = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: rdLevelBpm(L), rh: ev.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'B4', e.dur]) };
    if (lh)
        piece.lh = lh.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'D3', e.dur]);
    const r: RdRhythmRender = srRender(piece);
    const rh: RdRhythmState = { ev, lh, r, dur: pr.dur, two: pr.two, on: ev.filter((e: RdRhythmEvent) => !e.rest).map((e: RdRhythmEvent) => e.beat), taps: [], presses: [], open: new Map(), playing: false, graded: null, raf: 0, listen: false, t0: 0 };
    RD.rh = rh;
    const tst = RD.mode === 'test', pad = (h: string, lbl: string, k: string) => `<button class="rdx-tap" id="rdx-tap${h === 'L' ? 'L' : ''}" data-hand="${h}" aria-label="${rdEsc(lbl)}" aria-describedby="rdx-coach">${rdEsc(lbl)}<small>${rdEsc(k)}</small></button>`;
    const pads = pr.two ? pad('L', t('rdx_tap') + ' · ' + t('rdx_tap_l'), t('rdx_tap_lk')) + pad('R', t('rdx_tap') + ' · ' + t('rdx_tap_r'), t('rdx_tap_rk')) : pad('R', t('rdx_tap'), t('rdx_tap_k'));
    const hint = [pr.two ? t('rdx_rh_two_hint') : '', pr.dur ? t('rdx_rh_dur_hint') : ''].filter(Boolean).join(' ');
    byId('rdx-body').innerHTML = `<div class="rdx-q rdx-rh"><div class="rdx-prompt">${t('rdx_p_rh')}${tst ? ' · ' + t('rdx_hud_q', RD.rhP.length + 1, 4) : ''}</div>
    <div class="rdx-rhopts" id="rdx-rhopts" role="group" aria-label="${t('rdx_rh_opts')}"><label class="switch-inline"><input type="checkbox" id="rdx-rhdur"${pr.dur ? ' checked' : ''}> <span>${t('rdx_rh_dur')}</span></label>
      <div class="seg" id="rdx-rhhands" role="group" aria-label="${t('rdx_rh_hands')}"><button type="button" data-hands="1" aria-pressed="${!pr.two}">${t('rdx_rh_one')}</button><button type="button" data-hands="2" aria-pressed="${pr.two}">${t('rdx_rh_two')}</button></div></div>
    <p class="rdx-rhhint" id="rdx-rhhint">${rdEsc(hint)}</p>
    <div class="rdx-staff ss-wrap" id="rdx-staff">${r.svg}</div><div class="rdx-fb" id="rdx-fb">${t('rdx_rh_bpm', rdLevelBpm(L))}</div><div class="rdx-rhdet" id="rdx-rhdet"></div>
    <div class="rdx-rhbar"><button class="btn primary" id="rdx-rhgo">● ${t('rdx_rh_start')}</button>${tst ? '' : `<button class="btn ghost" id="rdx-rhlisten">▶ ${t('rd_listen')}</button>`}${pads}</div>
    <div class="rdx-tools" id="rdx-rhnext"></div></div>`;
    rdRhMarks(pr.two);
    rdHud();
}
function rdRhOptsLock(on: boolean) { (document).querySelectorAll('#rdx-rhopts input,#rdx-rhopts button').forEach((x) => { if (x instanceof HTMLInputElement || x instanceof HTMLButtonElement)
    x.disabled = on; }); }
function rdRhRun(listen: boolean) {
    const R = RD.rh, L = RD.L;
    if (!R || !L || R.playing)
        return;
    ensureAudio();
    if (!actx)
        return;
    const bs = 60 / rdLevelBpm(L);
    R.taps = [];
    R.presses = [];
    R.open.clear();
    R.graded = null;
    R.playing = true;
    R.listen = !!listen;
    rdRhOptsLock(true);
    byId('rdx-rhdet').innerHTML = '';
    byId('rdx-staff').querySelectorAll('.ss-n').forEach((g) => { g.removeAttribute('data-s'); g.removeAttribute('data-d'); const tt = g.querySelector('title.rdx-tt'); if (tt)
        tt.remove(); });
    const act0 = actx.currentTime + 0.2, beat0 = act0 + 4 * bs;
    R.t0 = performance.now() + 200 + 4 * bs * 1000;
    for (let b = 0; b < 4; b++)
        rdClick(act0 + b * bs, b === 0);
    for (let b = 0; b < 8; b++)
        rdClick(beat0 + b * bs, b % 4 === 0);
    if (listen) {
        const k = R.dur ? .92 : .8;
        R.ev.forEach((e: RdRhythmEvent) => { if (!e.rest)
            previewNote(72, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 90); });
        if (R.lh)
            R.lh.forEach((e: RdRhythmEvent) => { if (!e.rest)
                previewNote(48, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 80); });
    }
    const f = byId('rdx-fb');
    f.className = 'rdx-fb';
    f.textContent = t('rdx_rh_count');
    const svg = byId('rdx-staff').querySelector('svg');
    if (!svg) return;
    let c = svg.querySelector('.ss-playhead');
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        c.setAttribute('y1', String(R.r.yTop));
        c.setAttribute('y2', String(R.r.yBot));
        svg.appendChild(c);
    }
    const loop = () => {
        if (!R.playing)
            return;
        const b = (performance.now() - R.t0) / 1000 / bs;
        if (b >= 0 && f.textContent === t('rdx_rh_count'))
            f.textContent = listen ? t('rdx_rh_listening') : t('rdx_rh_tapnow');
        const x = rdBeatX(R.r, Math.max(0, Math.min(8, b)));
        c.setAttribute('x1', String(x));
        c.setAttribute('x2', String(x));
        if (b > 8.6) {
            R.playing = false;
            c.remove();
            rdRhOptsLock(false);
            if (listen) {
                f.textContent = t('rdx_rh_yourturn');
            }
            else
                rdRhDone(b);
            return;
        }
        R.raf = requestAnimationFrame(loop);
    };
    R.raf = requestAnimationFrame(loop);
}
// Every press is kept with its release: src names the key (MIDI note, computer key, pointer on a pad), hand is 'L' or 'R'.
function rdRhPress(src: string, hand: string) {
    const R = RD.rh, L = RD.L;
    if (!R || !L || !R.playing || R.listen)
        return;
    if (R.open.has(src))
        rdRhRelease(src);
    const b = (performance.now() - R.t0) / 1000 / (60 / rdLevelBpm(L));
    const p: RdRhythmPress = { src, hand: R.two && hand === 'L' ? 'L' : 'R', on: b, off: null };
    R.presses.push(p);
    R.open.set(src, p);
    R.taps.push(b);
    const el = queryHtml(document, '#rdx-body .rdx-tap[data-hand="' + p.hand + '"]');
    if (el) {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
    }
}
function rdRhRelease(src: string) { const R = RD.rh; if (!R)
    return; const p = R.open.get(src); if (!p)
    return; R.open.delete(src); const L = RD.L; if (R.playing && L)
    p.off = (performance.now() - R.t0) / 1000 / (60 / rdLevelBpm(L)); }
function rdRhKey(kind: string, m: number) { if (kind === 'on')
    rdRhPress('m' + m, m < 60 ? 'L' : 'R');
else
    rdRhRelease('m' + m); }
function rdTap(hand: string | undefined) { const src = 'tap' + performance.now(); rdRhPress(src, hand || 'R'); rdRhRelease(src); } // a click without press/release (assistive tech)
/* Lengths: each written note is paired with one stroke of its hand (keys struck within 70 ms are one stroke, e.g. a held chord, and it
   ends when its last key lifts). The release is compared with the written end of the note; the windows scale with the note's length
   and are clamped to practical limits, so at any tempo a held half note and a quarter followed by a rest are told apart, while normal
   articulation stays "good". Keys still down when the exercise ends count as released at that moment. */
function rdRhStrokes(ps: readonly RdRhythmPress[], end: number, gap: number) {
    const out: { on: number; off: number; }[] = [];
    ps.slice().sort((a: RdRhythmPress, b: RdRhythmPress) => a.on - b.on).forEach((p: RdRhythmPress) => {
        const off = p.off == null ? end : p.off, l = out[out.length - 1];
        if (l && p.on - l.on <= gap)
            l.off = Math.max(l.off, off);
        else
            out.push({ on: p.on, off });
    });
    return out;
}
// One written note of a hand: its onset grade and offset in ms, and (when lengths are graded) its release grade and offset.
interface RdRhythmNoteResult { e: RdRhythmEvent; s: string; off: number | null; rs: string | null; roff: number | null; }
// One hand's grading: onsets and (with dur) lengths, as counts, a weighted score, the % and the mean onset offset in ms.
interface RdRhythmHandGrade { res: RdRhythmNoteResult[]; N: number; good: number; near: number; extra: number; score: number; dur: boolean; lenOk: number; early: number; late: number; mean: number; pct: number; }
function rdRhGradeHand(ev: readonly RdRhythmEvent[], ps: readonly RdRhythmPress[], bs: number, dur: boolean, end: number): RdRhythmHandGrade {
    const tg = ev.filter((e: RdRhythmEvent) => !e.rest), st = rdRhStrokes(ps.filter((p: RdRhythmPress) => p.on > -0.5), end, 0.07 / bs), used = new Set<number>(), res: RdRhythmNoteResult[] = [];
    let minI = 4;
    for (let i = 1; i < tg.length; i++)
        minI = Math.min(minI, tg[i].beat - tg[i - 1].beat);
    const win = Math.min(0.25, 0.5 * minI * bs), cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
    tg.forEach((e: RdRhythmEvent) => {
        let bi = -1, bd = Infinity;
        st.forEach((s, j) => { if (used.has(j))
            return; const d = (s.on - e.beat) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        const r: RdRhythmNoteResult = { e, s: 'bad', off: null, rs: null, roff: null };
        if (bi >= 0) {
            used.add(bi);
            const a = Math.abs(bd) * 1000;
            r.s = a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad';
            r.off = bd * 1000;
            if (dur) {
                const sec = e.dur * bs, d = (st[bi].off - (e.beat + e.dur)) * bs, eG = cl(.25 * sec, .1, .4), eN = cl(.45 * sec, .18, .8), lG = cl(.15 * sec, .1, .25), lN = cl(.3 * sec, .18, .45);
                r.roff = Math.round(d * 1000);
                r.rs = d < -eN ? 'early' : d > lN ? 'late' : (d < -eG || d > lG) ? 'near' : 'good';
            }
        }
        res.push(r);
    });
    const N = tg.length, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length, extra = st.length - used.size;
    const att = good + 0.5 * near, len = res.reduce((a, r) => a + (r.rs === 'good' ? 1 : r.rs === 'near' ? .5 : 0), 0), score = dur ? (att + len) / 2 : att;
    const offs = res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off);
    return { res, N, good, near, extra, score, dur, lenOk: res.filter((r) => r.rs === 'good' || r.rs === 'near').length, early: res.filter((r) => r.rs === 'early').length, late: res.filter((r) => r.rs === 'late').length,
        mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * score / Math.max(1, N) - extra * 5)) };
}
type RdRhythmCountKey = 'N' | 'good' | 'near' | 'extra' | 'lenOk' | 'early' | 'late' | 'score';
// Grading with lengths and/or both hands: the per-hand grades and their totals.
interface RdRhythmAllGrade { by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; }; N: number; good: number; near: number; extra: number; lenOk: number; early: number; late: number; res: RdRhythmNoteResult[]; mean: number; pct: number; }
function rdRhGradeAll(R: RdRhythmState, bs: number, end: number): RdRhythmAllGrade {
    const hands: ('R' | 'L')[] = R.two ? ['R', 'L'] : ['R'], by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; } = {};
    hands.forEach((h) => { by[h] = rdRhGradeHand(h === 'R' ? R.ev : R.lh || [], R.presses.filter((p: RdRhythmPress) => p.hand === h), bs, R.dur, end); });
    const all = hands.map((h) => by[h]).filter((g): g is RdRhythmHandGrade => !!g), sum = (k: RdRhythmCountKey) => all.reduce((a, g) => a + g[k], 0), N = sum('N'), offs = all.flatMap((g) => g.res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off));
    return { by, N, good: sum('good'), near: sum('near'), extra: sum('extra'), lenOk: sum('lenOk'), early: sum('early'), late: sum('late'), res: all.flatMap((g) => g.res),
        mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * sum('score') / Math.max(1, N) - sum('extra') * 5)) };
}
function rdRhNoteTip(r: RdRhythmNoteResult) {
    if (r.off == null)
        return t('rdx_rh_n_miss');
    const p: string[] = [], roff = r.roff ?? 0; // roff is set whenever rs is
    if (r.rs === 'early')
        p.push(t('rdx_rh_n_early', -roff));
    else if (r.rs === 'late')
        p.push(t('rdx_rh_n_late', roff));
    else if (r.rs === 'near')
        p.push(t(roff < 0 ? 'rdx_rh_n_short' : 'rdx_rh_n_long'));
    if (Math.abs(r.off) > 100)
        p.push(Math.round(r.off) + ' ms');
    return p.join(' · ');
}
function rdRhHandLine(name: string, g: RdRhythmHandGrade | undefined) {
    if (!g)
        return '';
    const p = [t('rdx_rh_att', (g.good + g.near) + '/' + g.N)];
    if (g.dur) {
        p.push(t('rdx_rh_len', g.lenOk + '/' + g.N));
        if (g.early)
            p.push(t('rdx_rh_early', g.early));
        if (g.late)
            p.push(t('rdx_rh_late', g.late));
    }
    if (g.extra)
        p.push(t('rdx_rh_extra', g.extra));
    return (name ? t('rdx_rh_hand', name, g.pct) + ' — ' : '') + p.join(' · ');
}
function rdRhDone(endBeat: number) {
    const R = RD.rh, L = RD.L;
    if (!R || !L)
        return;
    const bs = 60 / rdLevelBpm(L), plain = !R.dur && !R.two;
    let g: RdRhythmGrade, msg: string;
    const det = maybeById('rdx-rhdet');
    if (plain) {
        g = rdRhGrade(R.on, R.taps.filter((x: number) => x > -0.5), bs); // the original tap-only grading
        const gs = byId('rdx-staff').querySelectorAll('.ss-n');
        g.res.forEach((r, i) => { const n = gs[i]; if (n instanceof SVGElement)
            n.dataset.s = r.s; });
    }
    else {
        const ga = rdRhGradeAll(R, bs, endBeat || 8.6);
        g = ga;
        Object.entries(ga.by).forEach(([h, hg]) => hg?.res.forEach((r: RdRhythmNoteResult) => {
            const n = R.r.notes.find((x: RdRhythmRender['notes'][number]) => x.hand === (h === 'L' ? 'lh' : 'rh') && Math.abs(x.beat - r.e.beat) < 1e-3), el = n && byId('rdx-staff').querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!(el instanceof SVGElement))
                return;
            el.dataset.s = r.s;
            if (r.rs && r.rs !== 'good')
                el.dataset.d = r.rs;
            const tip = rdRhNoteTip(r);
            if (tip) {
                const tt = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                tt.setAttribute('class', 'rdx-tt');
                tt.textContent = tip;
                el.appendChild(tt);
            }
        }));
    }
    R.graded = g;
    RD.rhP.push(g.pct);
    if (g.res.some((r) => r.off != null))
        RD.rhM.push(g.mean);
    RD.n++;
    RD.ok += g.pct;
    const tm = Math.abs(g.mean) < 25 ? t('rdx_rh_ontime') : g.mean < 0 ? t('rdx_rh_rush', -g.mean) : t('rdx_rh_drag', g.mean);
    if (plain)
        msg = t('rdx_rh_res', g.pct, (g.good + g.near) + '/' + R.on.length) + ' · ' + tm + (g.extra ? ' · ' + t('rdx_rh_extra', g.extra) : '');
    else if (!R.two)
        msg = t('rdx_rh_score', g.pct) + ' · ' + rdRhHandLine('', 'by' in g ? g.by.R : undefined) + ' · ' + tm;
    else
        msg = t('rdx_rh_score', g.pct) + ' · ' + tm;
    if (det)
        det.innerHTML = R.two ? (['R', 'L'] as const).map((h) => `<div>${rdEsc(rdRhHandLine(t(h === 'R' ? 'rdx_rh_hand_r' : 'rdx_rh_hand_l'), 'by' in g ? g.by[h] : undefined))}</div>`).join('') : '';
    const f = byId('rdx-fb');
    f.className = 'rdx-fb ' + (g.pct >= 75 ? 'good' : g.pct >= 50 ? '' : 'bad');
    f.textContent = msg;
    byId('rdx-live').textContent = [msg].concat(det ? [...det.children].map((x) => x.textContent ?? '') : []).join('. ');
    rdStat('rh:' + L.id, g.pct >= 75, 0);
    if (RD.mode === 'test') {
        if (RD.rhP.length >= 4) {
            RD.timers.push(setTimeout(() => { if (RD.on)
                rdFinish(); }, 1600));
        }
        else
            byId('rdx-rhnext').innerHTML = `<button class="btn primary" data-act="rhnew">${t('rdx_next_ex')} →</button>`;
    }
    else
        byId('rdx-rhnext').innerHTML = `<button class="btn ghost" data-act="rhagain">↺ ${t('rdx_again_same')}</button><button class="btn primary" data-act="rhnew">🎲 ${t('rdx_new_rh')}</button>`;
    rdHud();
}
/* ---- generated sight-reading melodies (played in the Read & play engine) ---- */
// A sight-reading level: its keys (as signature counts), range, note lengths in beats and tempo.
interface RdSightLevel { keys: number[]; lo: string; hi: string; durs: number[]; id: string; n: number; bpm: number; clef?: string; }
// A generated melody, shaped like a Read & play piece; rh/lh hold [pitch name, beats] pairs.
interface RdSightPiece { id: string; ephemeral: boolean; gen: string; comp: string; level: number; keyN: number; ts: number[]; bpm: number; t: { en: string; ro: string; }; rh?: [string, number][]; lh?: [string, number][]; }
function isRdSightLevel(L: ReadDrillLevel): L is ReadDrillLevel & RdSightLevel { return Array.isArray(L.keys) && L.lo !== undefined && L.hi !== undefined && Array.isArray(L.durs) && L.bpm !== undefined; }
function rdSightGen(L: RdSightLevel) {
    const keyN: number = ssPick(L.keys), kA = ssKeyAcc(keyN), lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi));
    const tonLi = SR_LET.indexOf(RD_MAJ[keyN + 7][0]);
    let ton = lo;
    while (((ton % 7) + 7) % 7 !== tonLi)
        ton++;
    if (ton > hi)
        ton -= 7;
    const nm = (s: number) => { const n = rdFromStep(s); return SR_LET[n.li] + (kA[n.li] > 0 ? '#' : kA[n.li] < 0 ? 'b' : '') + n.oct; };
    let cur = ton;
    const mel: [string, number][] = [];
    const mv = () => { const near = [-2, -1, -1, 1, 1, 2, 0], far = [3, -3, 4, -4]; for (let k = 0; k < 24; k++) {
        const s: number = cur + ssPick(k < 12 && Math.random() < .8 ? near : far);
        if (s >= Math.max(lo, ton - 4) && s <= hi)
            return s;
    } return ton; };
    for (let bar = 0; bar < 4; bar++) {
        let pos = 0;
        const end = bar === 3 ? 2 : 4;
        while (pos < end - 1e-6) {
            const c = L.durs.filter((d: number) => (d === 1.5 ? 2 : d === 0.5 ? 1 : d) <= end - pos + 1e-6 && !(d === 1.5 && pos % 1));
            const d: number = c.length ? ssPick(c) : end - pos;
            if (d === 1.5) {
                cur = mv();
                mel.push([nm(cur), 1.5]);
                cur = mv();
                mel.push([nm(cur), 0.5]);
                pos += 2;
            }
            else if (d === 0.5) {
                cur = mv();
                mel.push([nm(cur), 0.5]);
                cur = mv();
                mel.push([nm(cur), 0.5]);
                pos += 1;
            }
            else {
                cur = pos === 0 && bar === 0 ? ton : mv();
                mel.push([nm(cur), d]);
                pos += d;
            }
        }
        if (bar === 3)
            mel.push([nm(ton), 2]);
    }
    if (mel.length)
        mel[0][0] = nm(ton);
    const p: RdSightPiece = { id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN, ts: [4, 4], bpm: L.bpm,
        t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) } };
    if (L.clef === 'bass')
        p.lh = mel;
    else
        p.rh = mel;
    if (L.clef === 'grand') {
        const b = SR_LET.indexOf(RD_MAJ[keyN + 7][0]), deg: number[] = [0, ssPick([3, 4]), 4, 0];
        p.lh = deg.map((dg): [string, number] => { let s = 14 + 7 + b + dg; if (s >= 28)
            s -= 7; return [nm(s), 4]; });
    }
    return p;
}
function rdSightStart(mode: string) {
    const L = RD.L;
    if (!L)
        return;
    rdData().prefs.srLv = L.id;
    if (!isRdSightLevel(L))
        throw new TypeError('Étude: ' + L.id + ' is not a sight-reading level');
    SR.gen = rdSightGen(L);
    RD.on = false;
    rdTab('pieces');
    fillPieces();
    SR.modeSel = mode === 'test' ? 'assess' : 'learn';
    [...byId('rd-mode').children].forEach((b) => b.setAttribute('aria-pressed', b instanceof HTMLElement && b.dataset.v === SR.modeSel ? 'true' : 'false'));
    srSelectPiece('gen');
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rdx_sr_ready');
    const g = byId('rd-go');
    if (g)
        g.focus();
}
function rdGenMelody() { const L = RD_LV[rdData().prefs.srLv ?? ''] || RD_LV.sr1; RD.L = L; rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice'); }
function rdSightDone(kind: string, val: number) {
    const p = SR.piece;
    if (!p || !p.gen)
        return '';
    const L = RD_LV[p.gen];
    if (!L)
        return '';
    const steps = SR.steps.length || 1, acc = kind === 'assess' ? val : Math.max(0, Math.round(100 * (1 - val / steps)));
    const stars = kind === 'assess' ? (val >= 95 ? 3 : val >= 80 ? 2 : val >= 60 ? 1 : 0) : (val === 0 ? 2 : val <= Math.max(1, steps * 0.15) ? 1 : 0);
    const d = rdData(), nx = rdLvNext(L), was = rdUnlocked(nx), rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
    rec.n++;
    rec.s = Math.max(rec.s, stars);
    rec.acc = Math.max(rec.acc, acc);
    d.tot.sess++;
    return (kind === 'assess' ? '' : ' · ' + '★'.repeat(stars) + '☆'.repeat(3 - stars)) + (nx && !was && rdUnlocked(nx) ? ' · 🔓 ' + t('rdx_unlocked', rdLvName(nx)) : '');
}
/* ---- sessions: intro → questions → summary ---- */
function rdLvName(L: ReadDrillLevel) { return L.custom ? t('rdx_custom') : t('rdx_u_' + L.u) + ' · ' + L.n; }
function rdRangeTxt(L: { set?: readonly string[]; lo?: string; hi?: string; }) { if (L.set)
    return L.set.map((s) => rdName(rdP(s), true)).join(' · '); if (L.lo && L.hi)
    return rdName(rdP(L.lo), true) + '–' + rdName(rdP(L.hi), true); return ''; }
function rdLvDetail(L: ReadDrillLevel) {
    const p = [t('rdx_ty_' + L.ty)];
    if (L.ty === 'rh')
        p.push((L.units ?? []).map((u) => t('rdx_rhu_' + u)).join(', '));
    else if (L.ty === 'ks') {
        p.push(t('rdx_kmax', ...(L.kmax != null ? [L.kmax] : [])));
        if (L.clef === 'grand')
            p.push(t('rdx_clef_grand'));
    }
    else {
        if (L.tag)
            p.push(t('rdx_tag_' + L.tag));
        if (L.clef !== 'mix' && (L.custom || !['tr', 'ba', 'cc'].includes(L.u)))
            p.push(t('rdx_clef_' + L.clef));
        const r = rdRangeTxt(L);
        if (r)
            p.push(r);
    }
    if (L.acc)
        p.push(t('rdx_acc' + L.acc));
    if (L.keys)
        p.push(t('rdx_inkeys', String(L.keys)));
    if (L.harm)
        p.push(t(L.harm === 1 ? 'rdx_harm' : 'rdx_harmmix'));
    if (L.ty === 'iv' && L.ivs && L.ivs.length < 7)
        p.push(rdIvName(L.ivs[0]) + '–' + rdIvName(L.ivs[L.ivs.length - 1]));
    if (L.q)
        p.push(L.q.map((q) => t('rdx_q_' + q)).join(' / '));
    if (L.inv)
        p.push(t('rdx_inv'));
    if (L.ty === 'sr' || L.ty === 'rh')
        p.push(L.bpm + ' BPM');
    return p.join(' · ');
}
function rdLvSub(L: ReadDrillLevel) { return rdLvDetail(L).split(' · ').slice(1).join(' · '); }
function rdStars(s: number) { return `<span class="rdx-stars" role="img" aria-label="${t('rdx_stars_n', s)}">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span>`; }
function rdKeyText(k: string) {
    const clefOf: Record<string, string> = { t: 'treble', b: 'bass', a: 'alto', n: 'tenor' };
    let m = /^([tban]):([A-G])([#b]?)(\d)$/.exec(k);
    if (m)
        return rdName({ li: SR_LET.indexOf(m[2]), acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0, oct: +m[4] }, true) + ' (' + t('rdx_clef_' + clefOf[m[1]]) + ')';
    if ((m = /^iv:(\d)$/.exec(k)))
        return rdIvName(+m[1]);
    if ((m = /^ch:(\w+)$/.exec(k)))
        return t('rdx_q_' + m[1]);
    if ((m = /^ks:(-?\d)$/.exec(k)))
        return rdKeyLabel(+m[1]);
    if ((m = /^rh:(\w+)$/.exec(k)) && RD_LV[m[1]])
        return rdLvName(RD_LV[m[1]]);
    return k;
}
function rdScroll() { const tb = byId('rd-tabs'); if (!tb)
    return; const hd = (document).querySelector('header'), y = tb.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 10; if (window.scrollY > y + 4 || tb.getBoundingClientRect().top > window.innerHeight * 0.3)
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }
function rdOpen(L: ReadDrillLevel) { rdAbort(); RD.L = L; if (!L.custom)
    rdData().prefs.last = L.id; byId('rdx-home').hidden = true; byId('rdx-stage').hidden = false; rdIntro(); rdScroll(); const b = byId('rdx-back'); if (b)
    b.focus({ preventScroll: true }); }
function rdIntro() {
    const L = RD.L;
    if (!L)
        return;
    const r: Partial<ReadDrillLevelStat> = L.custom ? {} : (rdData().lv[L.id] || {});
    RD.on = false;
    byId('rdx-title').textContent = rdLvName(L);
    byId('rdx-sub').textContent = rdLvDetail(L);
    byId('rdx-hud').textContent = '';
    byId('rdx-meter').hidden = true;
    byId('rdx-end').hidden = true;
    const modes: ('practice' | 'test' | 'rush')[] = (L.ty === 'rh' || L.ty === 'sr') ? ['practice', 'test'] : ['practice', 'test', 'rush'], ic = { practice: '🎯', test: '📝', rush: '⚡' };
    let prev = '';
    const clef = L.clef;
    if (['name', 'play', 'k2s'].includes(L.ty) && clef !== 'mix' && clef !== undefined) {
        const pool = rdPool(L).filter((n) => !n.acc).sort((a, b) => rdStep(a) - rdStep(b));
        prev = `<div class="rdx-staff rdx-preview" aria-hidden="true">${rdSvg({ clef, cols: pool.map((n) => [n]), colW: pool.length > 16 ? 22 : 28, dur: 1, scale: 1.1, lbl: pool.map((n) => rdName(n)) }).svg}</div>`;
    }
    const rec = L.custom ? '' : `<div class="rdx-rec">${rdStars(r.s || 0)}${r.acc ? `<span>${t('rdx_best_acc', r.acc)}</span>` : ''}${r.t ? `<span>${t('rdx_best_t', (r.t / 1000).toFixed(1))}</span>` : ''}${r.rush ? `<span>⚡ ${t('rdx_best_rush', r.rush)}</span>` : ''}</div>`;
    const sfx = (L.ty === 'rh' || L.ty === 'sr') ? '_' + L.ty : '';
    byId('rdx-body').innerHTML = `<div class="rdx-intro"><p class="rdx-desc">${t('rdx_d_' + L.ty)}</p>${prev}${rec}<div class="rdx-modes">${modes.map((m) => `<button class="rdx-mode" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m + sfx)}</span></button>`).join('')}</div></div>`;
    rdCoach(true);
}
function rdStart(mode: string) {
    const L = RD.L;
    if (!L)
        return;
    ensureAudio();
    if (L.ty === 'sr') {
        rdSightStart(mode);
        return;
    }
    rdClear();
    Object.assign(RD, { on: true, mode, n: 0, ok: 0, ms: 0, streak: 0, best: 0, miss: {}, bag: [], bagSig: '', lastK: null, rhP: [], rhM: [], answered: false, next: null });
    rdCoach(true);
    const e = byId('rdx-end');
    e.hidden = false;
    e.textContent = t(mode === 'practice' ? 'rdx_end' : 'rdx_quit');
    if (mode === 'rush') {
        RD.rushEnd = performance.now() + RD_RUSH * 1000;
        RD.rushIv = window.setInterval(() => { if (!RD.on)
            return; rdHud(); if (performance.now() >= RD.rushEnd && !RD.answered)
            rdFinish(); }, 250);
    }
    if (L.ty === 'rh')
        rdRhNew();
    else
        rdNext();
}
function rdClear() {
    RD.timers.forEach(clearTimeout);
    RD.timers = [];
    clearTimeout(RD.hintT);
    clearInterval(RD.rushIv);
    RD.rushIv = 0;
    if (RD.rh) {
        RD.rh.playing = false;
        cancelAnimationFrame(RD.rh.raf);
        if (RD.rh.open)
            RD.rh.open.clear();
        if (RD.rh.two)
            rdRhMarks(false);
    }
    (RD.nodes || []).forEach((n: { stop: (arg0: number) => void; }) => { try {
        n.stop(0);
    }
    catch (_) { } });
    RD.nodes = [];
    if (RD.kbDown != null) {
        const m = RD.kbDown;
        RD.kbDown = null;
        handleNoteOff(m, 'rdk');
    }
}
function rdAbort() { rdClear(); RD.on = false; }
function rdEndClick() { if (RD.on && RD.mode === 'practice' && RD.n > 0)
    rdFinish();
else {
    rdAbort();
    rdIntro();
} }
function rdBack() { rdAbort(); byId('rdx-stage').hidden = true; byId('rdx-home').hidden = false; rdRenderHome(); }
function rdFinish() {
    const L = RD.L, mode = RD.mode;
    rdClear();
    RD.on = false;
    byId('rdx-end').hidden = true;
    byId('rdx-meter').hidden = true;
    let acc = 0, avg = 0, stars = 0;
    const score = RD.ok;
    if (!L)
        return;
    if (L.ty === 'rh') {
        acc = RD.rhP.length ? Math.round(RD.rhP.reduce((a: number, b: number) => a + b, 0) / RD.rhP.length) : 0;
        if (mode === 'test')
            stars = acc >= 90 ? 3 : acc >= 75 ? 2 : acc >= 60 ? 1 : 0;
    }
    else {
        acc = RD.n ? Math.round(100 * RD.ok / RD.n) : 0;
        avg = RD.n ? RD.ms / RD.n : 0;
        const tg = rdTarget(L);
        if (mode === 'test')
            stars = acc >= 95 && avg <= tg ? 3 : acc >= 90 && avg <= tg * 1.6 ? 2 : acc >= 80 ? 1 : 0;
    }
    const d = rdData();
    d.tot.sess++;
    let unl: ReadDrillLevel | null = null, newBest = false;
    if (!L.custom) {
        const nx = rdLvNext(L), was = rdUnlocked(nx), rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
        rec.n++;
        if (mode === 'test') {
            rec.s = Math.max(rec.s || 0, stars);
            rec.acc = Math.max(rec.acc || 0, acc);
            if (avg && acc >= 80 && (!rec.t || avg < rec.t))
                rec.t = Math.round(avg);
        }
        if (mode === 'rush') {
            newBest = score > (rec.rush || 0);
            rec.rush = Math.max(rec.rush || 0, score);
        }
        if (nx && !was && rdUnlocked(nx))
            unl = nx;
    }
    touchDay();
    saveAll();
    const weak = Object.entries(RD.miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const tiles = L.ty === 'rh' ? [[acc + '%', t('rdx_st_rh')], [RD.rhP.length, t('rdx_st_ex')]]
        : [[acc + '%', t('rdx_st_acc')], [(avg / 1000).toFixed(1) + 's', t('rdx_st_time')], [mode === 'rush' ? score : RD.best, mode === 'rush' ? t('rdx_st_rush') : t('rdx_st_streak')], [RD.ok + '/' + RD.n, t('rdx_st_ans')]];
    const head = mode === 'test' ? `<div class="rdx-sum-stars">${rdStars(stars)}</div><p class="rdx-sum-msg">${t(stars === 3 ? 'rdx_s3' : stars === 2 ? 'rdx_s2' : stars === 1 ? 'rdx_s1' : 'rdx_s0')}</p>`
        : mode === 'rush' ? `<p class="rdx-sum-msg">⚡ ${t('rdx_rush_score', score)}${newBest ? ' · 🏆 ' + t('rdx_newbest') : ''}</p>` : `<p class="rdx-sum-msg">${t('rdx_sum_practice')}</p>`;
    const nx = rdLvNext(L);
    RD.next = rdNextStep(L, mode, acc, avg, stars, weak);
    rdCoach(false);
    byId('rdx-body').innerHTML = `<div class="rdx-sum" tabindex="-1" id="rdx-sum"${(RD).next ? ' aria-describedby="rdx-next"' : ''}><h2>${t('rdx_sum_title')}</h2>${head}${unl ? `<p class="rdx-unl">🔓 ${t('rdx_unlocked', rdEsc(rdLvName(unl)))}</p>` : ''}
    <div class="rdx-tiles">${tiles.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    ${weak.length ? `<div class="rdx-weak"><span>${t('rdx_review')}</span>${weak.map(([k, c]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))}${c > 1 ? ' ×' + c : ''}</i>`).join('')}</div>` : ''}
    ${(RD).next ? `<div class="coach rdx-coach" id="rdx-next" data-kind="next">${coachHTML(t('coach_next'), (RD).next, 'rdx-next-act')}</div>` : ''}
    <div class="row rdx-sum-btns"><button class="btn primary" data-act="again">↺ ${t('rdx_again')}</button>${!(L)?.custom && nx && rdUnlocked(nx) ? `<button class="btn" data-act="next">${t('rdx_next_lv')} →</button>` : ''}<button class="btn ghost" data-act="levels">${t('rdx_levels')}</button></div></div>`;
    byId('rdx-live').textContent = t('rdx_sum_title') + ': ' + acc + '%' + (mode === 'test' ? ' · ' + t('rdx_stars_n', stars) : '') + ((RD).next ? '. ' + t('coach_next') + ' ' + coachText((RD).next) : '');
    byId('rdx-hud').textContent = '';
    byId('rdx-meter').hidden = true;
    const s = maybeById('rdx-sum');
    if (s)
        s.focus({ preventScroll: true });
}
/* ---- home: progress hero, level ladder, custom drill ---- */
function rdSuggest() {
    const d = rdData(), last = RD_LV[d.prefs.last ?? ''];
    if (last && rdUnlocked(last) && ((d.lv[last.id] || {}).s || 0) < 2)
        return last;
    return RD_ALL.find((L) => rdUnlocked(L) && !((d.lv[L.id] || {}).s)) || last || RD_ALL[0];
}
function rdRenderHome() {
    const d = rdData(), tot = d.tot, st = RD_ALL.reduce((a, L) => a + ((d.lv[L.id] || {}).s || 0), 0), cont = rdSuggest();
    byId('rdx-hero').innerHTML = `<div class="rdx-hero-l"><div class="rdx-big">★ ${st}<small> / ${RD_ALL.length * 3}</small></div><div class="rdx-hero-s">${t('rdx_hero_stars')}</div></div>
    <div class="rdx-hero-m"><div><b>${tot.n}</b><span>${t('rdx_st_ans')}</span></div><div><b>${tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—'}</b><span>${t('rdx_st_acc')}</span></div><div><b>${tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—'}</b><span>${t('rdx_st_time')}</span></div></div>
    <div class="rdx-hero-r"><button class="btn primary" data-lv="${cont.id}" id="rdx-cont">▶ ${t(d.prefs.last ? 'rdx_continue' : 'rdx_begin')}<small>${rdEsc(rdLvName(cont) + ' · ' + t('rdx_ty_' + cont.ty))}</small></button>
      <label class="switch-inline"><input type="checkbox" id="rdx-snd"${d.prefs.sound ? ' checked' : ''}> <span>${t('rdx_sound')}</span></label><label class="switch-inline"><input type="checkbox" id="rdx-hints"${d.prefs.hints ? ' checked' : ''}> <span>${t('rdx_hints')}</span></label></div>`;
    byId('rdx-ladder').innerHTML = RD_UNITS.map((u) => {
        const done = u.lv.filter((L: ReadDrillLevel) => (d.lv[L.id]?.s || 0) > 0).length;
        return `<section class="rdx-unit"><h3><span class="ic" aria-hidden="true">${u.icon}</span><span>${t('rdx_u_' + u.u)}</span><small>${done}/${u.lv.length}</small></h3><p>${t('rdx_ud_' + u.u)}</p><div class="rdx-lvs">${u.lv.map((L: ReadDrillLevel) => {
            const r = d.lv[L.id] || {}, ok = rdUnlocked(L), s = r.s || 0;
            return `<button class="rdx-lv${s ? ' s' + s : ''}" data-lv="${L.id}"${ok ? '' : ' aria-disabled="true"'} title="${rdEsc(rdLvDetail(L))}" aria-label="${rdEsc(rdLvName(L) + ': ' + rdLvDetail(L) + (ok ? '' : ' — ' + t('rdx_locked')) + (s ? ' — ' + t('rdx_stars_n', s) : ''))}"><span class="n">${ok ? L.n : '🔒'}</span><span class="d"><b>${t('rdx_ty_' + L.ty)}</b><i>${rdEsc(rdLvSub(L))}</i></span><span class="st" aria-hidden="true">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span></button>`;
        }).join('')}</div></section>`;
    }).join('');
    rdCustomFill();
}
const RD_CDEF: Record<string, [string, string]> = { treble: ['C4', 'G5'], bass: ['F2', 'C4'], grand: ['C3', 'C5'], alto: ['D3', 'B4'], tenor: ['A2', 'G4'] };
function rdCustomFill() {
    const lo = selectById('rdx-c-lo'), hi = selectById('rdx-c-hi');
    if (!lo)
        return;
    const c = rdData().prefs.custom || { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 0, keys: 0, land: false };
    let opts = '';
    for (let s = 7; s <= 52; s++) {
        const n = rdFromStep(s);
        opts += `<option value="${SR_LET[n.li] + n.oct}">${rdName(n, true)}</option>`;
    }
    lo.innerHTML = opts;
    hi.innerHTML = opts;
    lo.value = c.lo;
    hi.value = c.hi;
    selectById('rdx-c-ty').value = c.ty;
    selectById('rdx-c-clef').value = c.clef;
    selectById('rdx-c-acc').value = String(c.acc);
    selectById('rdx-c-keys').value = String(c.keys);
    inputById('rdx-c-land').checked = !!c.land;
}
function rdCustomRead() {
    let lo = selectById('rdx-c-lo').value, hi = selectById('rdx-c-hi').value;
    if (rdStep(rdP(lo)) > rdStep(rdP(hi))) {
        const x = lo;
        lo = hi;
        hi = x;
    }
    const c = { ty: selectById('rdx-c-ty').value, clef: selectById('rdx-c-clef').value, lo, hi, acc: +selectById('rdx-c-acc').value, keys: +selectById('rdx-c-keys').value, land: inputById('rdx-c-land').checked };
    rdData().prefs.custom = c;
    return c;
}
function rdCustomGo() {
    const c = rdCustomRead();
    saveAll();
    const ty = c.ty, clef = c.clef;
    if (!isReadDrillType(ty) || !isReadClef(clef))
        throw new TypeError('Étude: unknown custom drill ' + ty + ' / ' + clef);
    const L: ReadDrillLevel = { custom: true, id: 'custom', u: 'custom', n: 0, ty, clef, lo: c.lo, hi: c.hi, acc: c.keys ? 0 : c.acc, keys: c.keys || 0 };
    if (c.land) {
        const a = rdStep(rdP(c.lo)), b = rdStep(rdP(c.hi)), set = RD_LM.filter((s) => s >= a && s <= b).map((s) => { const n = rdFromStep(s); return SR_LET[n.li] + n.oct; });
        if (set.length >= 2)
            L.set = set;
    }
    rdOpen(L);
}
/* ---- statistics: per-note heatmap on the staff, skills, weakest items ---- */
function rdAgg(c: string, li: number, oct: number) {
    let n = 0, ok = 0, ms = 0;
    const re = /^([tban]):([A-G])([#b]?)(\d)$/;
    for (const [k, s] of Object.entries((rdData().nt))) {
        const m = re.exec(k);
        if (m && m[1] === c && SR_LET.indexOf(m[2]) === li && +m[4] === oct) {
            const stats = s;
            n += stats.n;
            ok += stats.ok;
            ms += stats.ms;
        }
    }
    return { n, ok, ms };
}
function rdHeat(clef: 'treble' | 'bass' | 'alto' | 'tenor', lo: string, hi: string) {
    const c = RD_CLEFC[clef], cols: (ReturnType<typeof rdFromStep> & { hc: string | null; tip: string; })[][] = [], lbl: (string | number)[] = [], cls: string[] = [];
    for (let s = rdStep(rdP(lo)); s <= rdStep(rdP(hi)); s++) {
        const n = rdFromStep(s), a = rdAgg(c, n.li, n.oct), acc = a.n ? Math.round(100 * a.ok / a.n) : null;
        cols.push([Object.assign(n, { hc: acc == null ? null : `hsl(${Math.round(acc * 1.2)},58%,44%)`, tip: rdName(n, true) + (a.n ? `: ${acc}% · ${(a.ms / a.n / 1000).toFixed(1)} s · ${a.n}×` : ': —') })]);
        lbl.push(acc == null ? '·' : acc);
        cls.push(acc == null ? 'none' : acc >= 90 ? 'hi' : acc >= 70 ? 'mid' : 'lo');
    }
    return rdSvg({ clef, cols, colW: 24, dur: 1, scale: 1.2, lbl, lblCls: cls, aria: t('rdx_heat_aria', t('rdx_clef_' + clef)) }).svg;
}
function rdBars(rows: readonly { l: string; n: number; ok: number; }[]) { return rows.map((r) => `<div class="rdx-bar"><span>${rdEsc(r.l)}</span><div class="rdx-bar-t"><i style="width:${r.n ? Math.round(100 * r.ok / r.n) : 0}%"></i></div><em>${r.n ? Math.round(100 * r.ok / r.n) + '% · ' + r.n + '×' : '—'}</em></div>`).join(''); }
function rdRenderStats() {
    const d = rdData(), tot = d.tot, nt = d.nt, g = (k: string) => nt[k] || { n: 0, ok: 0 };
    const lvDone = RD_ALL.filter((L) => ((d.lv[L.id] || {}).s || 0) > 0).length, st = RD_ALL.reduce((a, L) => a + ((d.lv[L.id] || {}).s || 0), 0);
    const weak = Object.entries(nt).filter(([k, s]) => s.n >= 3 && !/^rh:/.test(k)).sort((a, b) => (b[1].e - a[1].e) || (b[1].t - a[1].t)).slice(0, 10);
    const ks: { l: string; n: number; ok: number; }[] = [];
    for (let k = -7; k <= 7; k++)
        if (g('ks:' + k).n)
            ks.push({ l: rdKeyLabel(k), ...g('ks:' + k) });
    const rh = (RD_UNITS.find((u) => u.u === 'rh')?.lv ?? []).filter((L: ReadDrillLevel) => g('rh:' + L.id).n).map((L: ReadDrillLevel) => ({ l: rdLvName(L), ...g('rh:' + L.id) }));
    const extra = (['alto', 'tenor'] as const).filter((c) => Object.keys(nt).some((k) => k[0] === RD_CLEFC[c]));
    byId('rdx-stats').innerHTML = `<div class="rdx-tiles rdx-tiles-lg">${[[tot.n, t('rdx_st_ans')], [tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—', t('rdx_st_acc')], [tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—', t('rdx_st_time')], [tot.sess, t('rdx_st_sess')], ['★ ' + st, t('rdx_hero_stars')], [lvDone + '/' + RD_ALL.length, t('rdx_st_lv')]].map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_heat')}</h3><p class="rdx-desc">${t('rdx_heat_d')}</p>
      <div class="rdx-staff rdx-heat">${rdHeat('treble', 'A3', 'C6')}</div><div class="rdx-staff rdx-heat">${rdHeat('bass', 'C2', 'E4')}</div>
      ${extra.map((c) => `<div class="rdx-staff rdx-heat">${rdHeat(c, c === 'alto' ? 'C3' : 'A2', c === 'alto' ? 'D5' : 'B4')}</div>`).join('')}</div>
    <div class="rdx-stat-grid"><div class="panel rdx-stat-p"><h3>${t('rdx_u_iv')}</h3>${rdBars(RD_ALLIV.map((v) => ({ l: rdIvName(v), ...g('iv:' + v) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ch')}</h3>${rdBars(['maj', 'min', 'dim', 'aug'].map((q) => ({ l: t('rdx_q_' + q), ...g('ch:' + q) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ks')}</h3>${ks.length ? rdBars(ks) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_rh')}</h3>${rh.length ? rdBars(rh) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div></div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_weakest')}</h3>${weak.length ? `<div class="rdx-weak">${weak.map(([k, s]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))} · ${Math.round(100 * s.ok / s.n)}% · ${((s.t || 0) / 1000).toFixed(1)}s</i>`).join('')}</div>` : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}
      <div class="row" style="margin-top:14px"><button class="btn ghost sm" id="rdx-reset">${t('rdx_reset')}</button></div></div>`;
}
/* ---- tabs, wiring, locale ---- */
function rdTab(tab: string|undefined) {
    if (tab === undefined || !['drills', 'pieces', 'stats'].includes(tab))
        tab = 'drills';
    rdData().prefs.tab = tab;
    queryAllHtml(document, '#rd-tabs [role=tab]').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    ['drills', 'pieces', 'stats'].forEach((x) => { const p = maybeById('rdp-' + x); if (p)
        p.hidden = x !== tab; });
    if (tab !== 'drills' && RD.on) {
        rdAbort();
        rdIntro();
    }
    if (tab !== 'pieces' && (SR.active || SR.listening))
        srStopAll(true);
    if (tab === 'stats')
        rdRenderStats();
    else if (tab === 'drills' && byId('rdx-stage').hidden)
        rdRenderHome();
}
function rdRender() { rdTab(rdData().prefs.tab); }
function rdKey(e: KeyboardEvent, k: string) {
    if (view0() !== 'read' || byId('rdp-drills').hidden || !RD.on)
        return false;
    const L = RD.L;
    if (!L)
        return false;
    if (L.ty === 'rh') {
        const R = RD.rh;
        if (e.key === ' ' || e.key === 'Enter') {
            if (document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-act],#rdx-rhgo,#rdx-rhlisten,#rdx-end,#rdx-back,#rdx-rhopts') && !(R && R.playing))
                return false;
            e.preventDefault();
            rdRhPress('k:' + k, 'R');
            return true;
        }
        if (R && R.two && R.playing && (k === 'f' || k === 'j')) {
            e.preventDefault();
            rdRhPress('k:' + k, k === 'f' ? 'L' : 'R');
            return true;
        }
        return false;
    }
    if (RD.answered)
        return false;
    if (/^[1-9]$/.test(k)) {
        const b = (document).querySelector('#rdx-ans .rdx-a[data-k="' + k + '"]');
        if (b instanceof HTMLButtonElement && !b.disabled) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    if (k === '-' || k === '0' || k === '=') {
        const accOf: Record<string, number> = { '-': -1, '0': 0, '=': 1 };
        const b = queryHtml(document, '#rdx-accs [data-acc="' + accOf[k] + '"]');
        if (b) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    return false;
}
function rdOnLocale() {
    if (!byId('view-read'))
        return;
    if (SR.active) {
        const g = byId('rd-go');
        if (g)
            g.textContent = t('rd_stop');
    }
    if (SR.listening) {
        const l = byId('rd-listen');
        if (l)
            l.textContent = t('rd_stop');
    }
    if (SR.gen) {
        SR.gen.t = { en: tl('en', 'rdx_sr_title', SR.gen.level), ro: tl('ro', 'rdx_sr_title', SR.gen.level) };
        fillPieces();
        if (SR.piece)
            selectById('rd-piece').value = SR.piece.id;
    }
    if (!byId('rdx-stage').hidden && RD.L) {
        byId('rdx-title').textContent = rdLvName(RD.L);
        byId('rdx-sub').textContent = rdLvDetail(RD.L);
        if (!RD.on && !byId('rdx-body').querySelector('.rdx-sum'))
            rdIntro();
        else if (RD.on && RD.q && RD.q.ty === 'name')
            queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => { if (b.firstChild)
                b.firstChild.textContent = rdLetter(Number(b.dataset.a)); });
        if (RD.on) {
            byId('rdx-end').textContent = t(RD.mode === 'practice' ? 'rdx_end' : 'rdx_quit');
            rdHud();
        }
    }
    if (view0() === 'read')
        rdRender();
    else
        rdCustomFill();
}
(function rdInit() {
    const dr = byId('rdp-drills');
    if (!dr)
        return;
    byId('rd-tabs').addEventListener('click', (e) => { const b = eventClosest(e, '[role=tab]'); if (b) {
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
        const lv = eventClosest(e, '[data-lv]');
        if (lv) {
            const L = RD_LV[lv.dataset.lv ?? ''];
            if (!L)
                return;
            if (lv.getAttribute('aria-disabled') === 'true') {
                byId('rdx-live').textContent = t('rdx_locked_msg');
                lv.classList.remove('shake');
                void lv.offsetWidth;
                lv.classList.add('shake');
                return;
            }
            rdOpen(L);
            return;
        }
        const md = eventClosest(e, '[data-mode]');
        if (md) {
            rdStart(md.dataset.mode ?? '');
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
        const key = eventClosest(e, '.rdx-kb.inter button[data-m]');
        if (key && e.detail === 0) {
            const m = Number(key.dataset.m);
            handleNoteOn(m, 96, 'rdk');
            handleNoteOff(m, 'rdk');
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
            rdRhRun(false);
        else if (id === 'rdx-rhlisten')
            rdRhRun(true);
        else if (b && b.classList.contains('rdx-tap') && e.detail === 0)
            rdTap(b.dataset.hand);
        else if (id === 'rdx-c-go')
            rdCustomGo();
    });
    dr.addEventListener('pointerdown', (e) => {
        const pad = eventClosest(e, '.rdx-tap');
        if (pad) {
            e.preventDefault();
            rdRhPress('p' + e.pointerId, pad.dataset.hand || 'R');
            return;
        }
        const k = eventClosest(e, '.rdx-kb.inter [data-m]');
        if (k) {
            e.preventDefault();
            if (RD.kbDown != null)
                handleNoteOff(RD.kbDown, 'rdk');
            const m = Number(k.dataset.m);
            RD.kbDown = m;
            handleNoteOn(m, 96, 'rdk');
        }
    });
    const up = (e: PointerEvent) => { rdRhRelease('p' + e.pointerId); if (RD.kbDown != null) {
        const m = RD.kbDown;
        RD.kbDown = null;
        handleNoteOff(m, 'rdk');
    } };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter' || k === 'f' || k === 'j')
        rdRhRelease('k:' + k); });
    dr.addEventListener('change', (e) => {
        const el = e.target, id = el instanceof HTMLElement ? el.id : '', checked = el instanceof HTMLInputElement && el.checked, p = rdData().prefs;
        if (id === 'rdx-snd') {
            p.sound = checked;
            saveAll();
        }
        else if (id === 'rdx-hints') {
            p.hints = checked;
            saveAll();
        }
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
    byId('rdp-stats').addEventListener('click', (e) => { if (eventElement(e)?.id === 'rdx-reset' && confirm(t('rdx_reset_q'))) {
        const d = rdData();
        d.nt = {};
        d.tot = { n: 0, ok: 0, ms: 0, sess: 0 };
        saveAll();
        rdRenderStats();
    } });
    const g = byId('rd-gen');
    if (g)
        g.addEventListener('click', rdGenMelody);
    ['set-lang', 'set-notation'].forEach((id) => { const el = maybeById(id); if (el)
        el.addEventListener('click', () => setTimeout(rdOnLocale, 0)); });
})();
/* ---------- COACHING: one short tip per surface, chosen from what is on screen and how the last attempt went ----------
   Read & play keeps a "Reading focus" line under the score (piece, mode, hands and the slips made so far) that becomes a
   "Next step" when a run ends; reading drills get a focus line for the drill type and a next step in their summary; Score &
   analysis gets "What to notice" in Now and a next step in the practice summary. A tip keeps the facts it was chosen from
   and is re-worded after a language or notation change. */
function tf(k: string, ...a: unknown[]) { let s = t(k); ['%a', '%b', '%c'].forEach((p, i) => { if (a[i] != null)
    s = s.split(p).join(String(a[i])); }); return s; }
function coachList(xs: string[]) { try {
    return new Intl.ListFormat(lang, { type: 'conjunction' }).format(xs);
}
catch (e) {
    return xs.join(', ');
} }
// A coaching tip: a string key with what fills it in, and optionally an action (a button label and what it does).
interface CoachTip { k: string; args?: () => (string | number)[]; act?: { k: string; args?: () => (string | number)[]; run: () => void; } | null; }
const coachText = (c: CoachTip) => tf(c.k, ...(c.args ? c.args() : []));
// The lead ("Reading focus:", "Next step:"), the tip, and an optional button that does what the tip suggests.
function coachHTML(lead: string, c: CoachTip, actId?: string) {
    const e = xmlEsc, act = c.act ? tf(c.act.k, ...(c.act.args ? c.act.args() : [])) : '';
    return `<span class="coach-k">${e(lead)}</span> <span class="coach-t">${e(coachText(c))}</span>` + (act ? `<span class="coach-act"><button type="button" class="btn sm" id="${actId}">${e(act)}</button></span>` : '');
}
/* Read & play */
const srStepNo = (n: { oct: number; li: number; }) => n.oct * 7 + n.li;
function srKeyNames(keyN: number) { return (keyN > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3]).slice(0, Math.abs(keyN)).map((li) => spelledName(notation, li, keyN > 0 ? 1 : -1)); }
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
    const want = st.notes.filter((n) => !SR.hit.has(n.nid));
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
const srSlipNames = (s: SrSlip) => [rdLetter(s.n.li), spelledName(notation, s.n.li, s.n.acc)]; // what was played (the natural), what is written
// Reading focus: the slip being repeated right now, else what this piece asks for in this mode.
function srFocus(): CoachTip | null {
    const p = SR.piece;
    if (!p)
        return null;
    const rec = p.ephemeral ? null : data.sheet[p.id];
    if (SR.modeSel === 'assess')
        return { k: srShape().rhythm && !(rec && rec.best) ? 'rc_rhythm' : 'rc_ahead' };
    const top = SR.active && srTopSlip();
    if (top === 'key' && SR.slipKey) {
        const s = SR.slipKey;
        return { k: 'rc_e_key', args: () => srSlipNames(s) };
    }
    if (top)
        return { k: 'rc_e_' + top };
    const f = srShape();
    if (p.level === 1 && !rec && !p.ephemeral)
        return { k: 'rc_anchor' };
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
    const bpm = SR.bpm, rec = p.ephemeral ? null : data.sheet[p.id], bad = (n: SrStaffNote) => SR.results[n.nid] !== 'good';
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
    if (pct < 60 && !(rec && rec.learned) && !p.gen)
        return { k: 'rn_a_learn', act: { k: 'rn_act_learn', run: () => srSetMode('learn') } };
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
function srSetMode(v: string) { SR.modeSel = v; [...byId('rd-mode').children].forEach((x) => x.setAttribute('aria-pressed', x instanceof HTMLElement && x.dataset.v === v ? 'true' : 'false')); srStopAll(); byId('rd-verdict').textContent = ''; byId('rd-go').focus(); }
function srSetBpm(v: number) { if (SR.active || SR.listening)
    return; const b = inputById('rd-bpm'); b.value = String(v); byId('rd-bpmLbl').textContent = String(v); SR.bpm = v; SR.next = null; srCoach(); byId('rd-go').focus(); }
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
    const tg = rdTarget(L) / 1000, sec = avg / 1000;
    if (mode === 'rush')
        return RD.n - RD.ok >= 3 ? { k: 'rdn_rush' } : { k: 'rdn_ok' };
    if (acc < 80)
        return { k: 'rdn_hints', act: { k: 'rdn_act_hints', run: () => { rdData().prefs.hints = true; saveAll(); rdStart('practice'); } } };
    if (weak.length && acc < 95)
        return { k: 'rdn_weak', args: () => [weak.slice(0, 3).map(([k]) => rdKeyText(k)).join(', ')], act: mode === 'practice' ? null : { k: 'rdn_act_practice', run: () => rdStart('practice') } };
    if (sec > tg)
        return { k: 'rdn_speed', args: () => [anNum(sec, 1), anNum(tg, 1)], act: { k: 'rdn_act_rush', run: () => rdStart('rush') } };
    if (mode === 'practice')
        return { k: 'rdn_test', act: { k: 'rdn_act_test', run: () => rdStart('test') } };
    if (stars < 3)
        return { k: 'rdn_star', args: () => [stars >= 2 ? 95 : 90, anNum(stars >= 2 ? tg : tg * 1.6, 1)] };
    const nx = rdLvNext(L);
    if (!L.custom && nx && rdUnlocked(nx))
        return { k: 'rdn_next', args: () => [rdLvName(nx)] };
    return { k: 'rdn_ok' };
}
function rdNextRender() { const box = maybeById('rdx-next'); if (box && RD.next)
    box.innerHTML = coachHTML(t('coach_next'), RD.next, 'rdx-next-act'); }
/* Score & analysis · Now: one thing worth noticing in the bar (or passage, or selection) on show, from its own analysis */
function anCoach(f: { kind: string; a: number; b: number; lo?: number; hi?: number; }, segs: readonly AnHarmonySeg[], notes: readonly theory.TheoryNote[]) {
    if (!f || !AN.view || !notes.length)
        return null;
    const v = AN.view, one = f.a === f.b, fall = FALL.mode === 'fall', K = (s: AnHarmonySeg) => anKeyAt(s.start), lab = (s: AnHarmonySeg) => anChordLabel(s, K(s)), rn = (s: AnHarmonySeg) => anRoman(K(s), s);
    const tip = (k: string, ...a: unknown[]) => ({ h: t(f.kind === 'sel' ? 'coach_sel' : one ? 'coach_bar' : 'coach_pass'), text: tf(k, ...a) });
    const cadTip = (s: AnHarmonySeg) => { const a = v.segs[v.segs.indexOf(s) - 1]; return tip('cn_cad_' + s.cad, s.cad === 'half' || !a ? rn(s) : rn(a) + ' → ' + rn(s)); };
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
    const inv = !v.implied && segs.find((s) => anInv(s) > 0);
    if (inv) {
        const k = K(inv);
        return tip('cn_inv', spellName(60 + (inv.bass ?? 0), k), spellName(60 + inv.ch.root, k) + inv.ch.c.s + ', ' + invName(anInv(inv)));
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
    return; const n = AN.notes[i]; if (n && anHandOf(n) === 'lh')
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
function pracNextStep(R: { segs?: { f: number; }[]; sel: boolean; from?: number | null; a: number; b: number; }): CoachTip | null {
    const st = PRAC.stats, acc = st && pracAcc(st);
    if (acc == null || !st)
        return null;
    const f = (R.segs && R.segs[0] && R.segs[0].f) || pracFactor(), both = new Set(AN.notes.map(anHandOf)).size > 1;
    const again = () => { pracSumClose(); if (R.sel && AN.selected.size)
        scorePlay(true);
    else
        scorePlay(false, R.from); };
    if (acc >= .95 && st.wrong <= 1) {
        const sel = selectById('score-speed'), next = [...sel.options].map((o) => +o.value).find((v) => v > Math.round(f * 100) && v <= 100);
        if (next)
            return { k: 'pn_clean_tempo', args: () => [Math.round(f * 100) + '%'], act: { k: 'pn_act_faster', args: () => [next + '%'], run: () => { sel.value = String(next); pracHud(); anUpdateControls(); again(); } } };
        if (PRAC.hands !== 'both' && both)
            return { k: 'pn_clean_hands', act: { k: 'rd_both', run: () => { pracSet('hands', 'both'); again(); } } };
        if (PRAC.wait)
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
    if (st.miss >= 3 && st.miss >= st.wrong && !PRAC.wait)
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
// Language or note names changed: re-word every tip on show.
function coachRefresh() { srCoach(); if (RD.L && !byId('rdx-coach').hidden)
    rdCoach(true); rdNextRender(); if (!byId('pr-sum').hidden)
    pracNextRender(); }
/* ---------- SCORE & ANALYSIS ---------- */
type AnHand = 'rh' | 'lh';
interface ScoreNoteArticulation { staccato: boolean; staccatissimo: boolean; accent: boolean; strongAccent: boolean; tenuto: boolean; }
interface ScoreGraceNote { midi: number; vel: number; tieStart?: boolean; tiedToPrincipal?: boolean; }
// A note of the loaded piece: MIDI and built-in pieces fill the timing and hand; MusicXML adds its notation and performance details.
interface AnNote {
    midi: number; start: number; end: number; vel: number;
    track?: number; channel?: number; hand?: AnHand | null; srcHand?: AnHand;
    part?: number; staff?: number; voice?: number; type?: string; art?: ScoreNoteArticulation; arpeggiate?: boolean;
    finger?: number; explicitVel?: number; dynamicHit?: number; graces?: ScoreGraceNote[]; warm?: boolean; soundRatio?: number;
    roll?: number; nextSame?: number; pedalEnd?: number; soundEnd?: number;
}
interface ScoreXmlNote extends AnNote { hand: AnHand | null; part: number; staff: number; voice: number; type: string; art: ScoreNoteArticulation; arpeggiate: boolean; }
interface AnParsedNote { midi: number; start: number; end: number; vel: number; track: number; channel: number; srcHand?: AnHand; }
type AnMidiMeta = { type: 'tempo'; beat: number; bpm: number } | { type: 'time'; beat: number; num: number; den: number } | AnMidiKeyMeta;
interface AnMidiKeyMeta { type: 'key'; beat: number; fifths: number; minor: boolean; }
interface AnParsedMidi { ppq: number; format: number; tracks: number; names: string[]; meta: AnMidiMeta[]; notes: AnParsedNote[]; }
interface ScoreXmlLayout {
    base: number; width: number; pageWidth: number; pageHeight: number;
    left?: number; right?: number; top?: number; bottom?: number;
    titleSize?: number; subtitleSize?: number; composerSize?: number;
    titleRuns?: { text: string | null; style: string; weight: string }[];
    staffGap?: number | null; systemGap?: number | null;
}
interface ScoreMeasure { number: string; start: number; end: number; num: number; den: number; }
interface ScoreXmlKey { beat: number; fifths: number; mode: 'major' | 'minor' | null; }
interface ScoreXmlLink { kind: string; a: number; b: number; style: string; }
type AnSource =
    | { kind: 'xml'; title: string; label: string; xml: string; layout: ScoreXmlLayout | null; notes: ScoreXmlNote[]; tempos: { beat: number; bpm: number }[]; measures: ScoreMeasure[]; keys: ScoreXmlKey[]; links: ScoreXmlLink[] }
    | { kind: 'midi'; title: string; label: string; parsed: AnParsedMidi; comp?: undefined }
    | { kind: 'example'; id: string; title: string; label: string; comp: string; parsed: AnParsedMidi };
type AnHandAssignment =
    | { of: AnHand[]; how: 'split' | 'one' | 'fallback'; split: number }
    | { of: AnHand[]; how: 'piece' }
    | { of: AnHand[]; how: 'tracks'; groups: number };
// Everything the analysis workspace shows for one scope (see anCompute).
interface AnAnalysisModel {
    ns: AnNote[]; lo: number; hi: number; pitches: number[]; poly: { avg: number; max: number }; implied: boolean; segs: AnHarmonySeg[]; ms: ScoreMeasure[];
    beats: number; onsets: number; tempos: number[]; hands: string; rh: number; lh: number; key: { best: theory.KeyRank; alts: theory.KeyRank[]; conf: string };
    mainKey: theory.KeySignature; motifs: AnMotif[]; seconds: number;
}
interface AnState {
    notes: AnNote[]; selected: Set<number>; active: { kind: string; k: number } | null; source: AnSource | null; recon: { hands: string; grid: number; key: string };
    hands: AnHandAssignment | null; keyMap: (theory.KeySignature & { beat: number })[]; keyOrigin: string; index: Map<AnNote, number>; version: number;
    cache: Map<string, AnAnalysisModel>; view: AnAnalysisModel | null; wsSig: string; rove: number; playSeg: number; playSig: string; kbCenter: boolean;
    kbApplied: Map<number, string>; error: { k: string; a: string | number | undefined } | null; loading: boolean; loadToken: number;
    liveT?: ReturnType<typeof setTimeout>; pinRaf?: number;
}
const AN: AnState = { notes: [], selected: new Set(), active: null, source: null, recon: { hands: 'auto', grid: 4, key: 'auto' }, hands: null, keyMap: [], keyOrigin: 'auto',
    index: new Map(), version: 0, cache: new Map(), view: null, wsSig: '', rove: 0, playSeg: -1, playSig: '', kbCenter: false, kbApplied: new Map(), error: null, loading: false, loadToken: 0 };
const AN_MAX_XML_CHARS = 33554432, AN_MAX_BYTES = 2097152, AN_MAX_NOTES = 5000, AN_PRACTICE_BARS = 32, AN_EXAMPLES = ['minuet', 'elise', 'ode', 'twinkle', 'jingle'];
function anError(code: string, detail?: string) { const e = Object.assign(new Error(detail || code), { code }); return e; }
function tl(L: string, k: string, a?: string|number|null, b?: string|number|null) { const own = L === 'en' || L === 'ro' ? STRINGS[L] : undefined; let v = (own && own[k] != null) ? own[k] : STRINGS.en[k]; if (v == null)
    return k; if (a != null)
    v = v.replace('%s', String(a)).replace('%a', String(a)); if (b != null)
    v = v.replace('%b', String(b)); return v; }
function anParse(buffer: ArrayBuffer) {
    const a = new Uint8Array(buffer), v = new DataView(buffer);
    let pos = 0;
    const need = (n: number) => { if (n < 0 || pos + n > a.length)
        throw anError('midi', 'truncated'); };
    const u8 = () => { need(1); return a[pos++]; }, u16 = () => { need(2); const n = v.getUint16(pos); pos += 2; return n; }, u32 = () => { need(4); const n = v.getUint32(pos); pos += 4; return n; };
    const tag = () => String.fromCharCode(u8(), u8(), u8(), u8());
    const vlq = () => { let n = 0; for (let i = 0; i < 4; i++) {
        const b = u8();
        n = n * 128 + (b & 127);
        if (!(b & 128))
            return n;
    } throw anError('midi', 'VLQ'); };
    if (tag() !== 'MThd')
        throw anError('midi', 'header');
    const len = u32();
    if (len < 6)
        throw anError('midi', 'header');
    const format = u16(), tracks = u16(), ppq = u16();
    if (format > 1 || !tracks || tracks > 128 || !ppq || (ppq & 0x8000))
        throw anError('midi', 'format');
    need(len - 6);
    pos += len - 6;
    const notes: AnParsedNote[] = [], meta: AnMidiMeta[] = [], names: string[] = [];
    for (let ti = 0; ti < tracks; ti++) {
        if (tag() !== 'MTrk')
            throw anError('midi', 'track');
        const size = u32();
        need(size);
        const end = pos + size;
        let tick = 0, running = 0;
        const active = new Map<string, { start: number; midi: number; vel: number }[]>();
        while (pos < end) {
            tick += vlq();
            let status = u8(), first: number | null = null;
            if (status < 128) {
                if (!running)
                    throw anError('midi', 'running');
                first = status;
                status = running;
            }
            else if (status < 240)
                running = status;
            else
                running = 0;
            if (status === 255) {
                const type = u8(), n = vlq();
                need(n);
                const beat = tick / ppq;
                if (type === 3 && n && names[ti] == null)
                    names[ti] = String.fromCharCode(...a.subarray(pos, pos + Math.min(n, 64))).trim();
                if (type === 81 && n === 3) {
                    const us = a[pos] * 65536 + a[pos + 1] * 256 + a[pos + 2];
                    if (us)
                        meta.push({ type: 'tempo', beat, bpm: 60000000 / us });
                }
                if (type === 88 && n >= 2 && a[pos] > 0 && a[pos + 1] <= 5)
                    meta.push({ type: 'time', beat, num: a[pos], den: 2 ** a[pos + 1] });
                if (type === 89 && n >= 2) {
                    const fifths = (a[pos] << 24) >> 24;
                    if (Math.abs(fifths) <= 7)
                        meta.push({ type: 'key', beat, fifths, minor: a[pos + 1] === 1 });
                }
                pos += n;
            }
            else if (status === 240 || status === 247) {
                const n = vlq();
                need(n);
                pos += n;
            }
            else if (status >= 240)
                throw anError('midi', 'system');
            else {
                const cmd = status & 240, ch = status & 15, d1 = first === null ? u8() : first, d2 = (cmd === 192 || cmd === 208) ? 0 : u8();
                if (d1 > 127 || d2 > 127)
                    throw anError('midi', 'data');
                if (ch !== 9 && (cmd === 144 || cmd === 128)) {
                    const k = ch + ':' + d1;
                    if (cmd === 144 && d2 > 0) {
                        let q = active.get(k);
                        if (!q) {
                            q = [];
                            active.set(k, q);
                        }
                        q.push({ start: tick, midi: d1, vel: d2 });
                    }
                    else {
                        const q = active.get(k);
                        if (q && q.length) {
                            const n = q.shift();
                            if (n && tick > n.start)
                                notes.push({ midi: n.midi, start: n.start / ppq, end: tick / ppq, vel: n.vel, track: ti, channel: ch });
                            if (notes.length > AN_MAX_NOTES)
                                throw anError('notes');
                        }
                    }
                }
            }
            if (pos > end)
                throw anError('midi', 'track boundary');
        }
        for (const [k, q] of active)
            for (const n of q)
                if (tick > n.start)
                    notes.push({ midi: n.midi, start: n.start / ppq, end: tick / ppq, vel: n.vel, track: ti, channel: +k.split(':')[0] }); // note-on without note-off: close at track end
    }
    if (!notes.length)
        throw anError('nonotes');
    if (notes.length > AN_MAX_NOTES)
        throw anError('notes');
    return { ppq, format, tracks, names, meta: meta.sort((a, b) => a.beat - b.beat), notes: notes.sort((x, y) => x.start - y.start || x.midi - y.midi) };
}
// Built-in pieces become the same parsed structure as a MIDI file: one "track" per hand, beats in quarter notes.
function anPieceToParsed(p: (typeof PIECES)[number]): AnParsedMidi {
    const cap = p.ts[1] === 8 ? p.ts[0] * 0.5 : p.ts[0] * 4 / p.ts[1], shift = p.pickup ? (cap - p.pickup) % cap : 0, notes: AnParsedNote[] = [];
    ([['rh', 0], ['lh', 1]] as const).forEach(([hand, track]) => { if (!p[hand])
        return; srEvents(p[hand]).ev.forEach((e) => { if (!e.rest)
        notes.push({ midi: e.midi, start: e.beat + shift, end: e.beat + shift + e.dur, vel: hand === 'rh' ? 92 : 74, track, channel: track, srcHand: hand }); }); });
    notes.sort((x, y) => x.start - y.start || x.midi - y.midi);
    return { ppq: 480, format: 1, tracks: notes.some((n) => n.track === 1) ? 2 : 1, names: ['Right hand', 'Left hand'], notes,
        meta: [{ type: 'tempo', beat: 0, bpm: p.bpm }, { type: 'time', beat: 0, num: p.ts[0], den: p.ts[1] }, { type: 'key', beat: 0, fifths: p.keyN || 0, minor: !!p.minor }] };
}
/* keys, spelling */
const KEY_MAJ_FIFTHS = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 }, LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = { letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], solfege: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], german: ['C', 'D', 'E', 'F', 'G', 'A', 'H'] };
// B-flat is B in German; B-natural and other alterations use H.
function spelledName(sys: theory.NoteSystem, li: number, acc: number, ascii = false) { if (sys === 'german' && li === 6 && acc === -1)
    return 'B'; const symbols = ascii ? ['bb', 'b', '', '#', '##'] : ['𝄫', '♭', '', '♯', '𝄪']; return LETTERS[sys][li] + (symbols[acc + 2] || ''); }
function anKeyName(k: theory.KeySignature) { const f = k.fifths != null ? k.fifths : keyFifths(k.root, k.minor), s = spellMidi(60 + k.root, f, k.minor); return spelledName(notation, s.li, s.acc, true) + ' ' + t(k.minor ? 'an_minor' : 'an_major'); }
// Key-aware spelling: diatonic notes follow the signature, minor keys raise 6/7 on their own letters, other notes take the key's accidental direction.
function anKeyAt(beat: number) { const ks = AN.keyMap; if (!ks.length)
    return { root: 0, minor: false, fifths: 0 }; let k = ks[0]; for (const x of ks)
    if (x.beat <= beat + 1e-6)
        k = x; return k; }
function spellName(m: number, key: theory.KeySignature|null, withOct?: boolean) { const k = key || anKeyAt(0), s = spellMidi(m, k.fifths, k.minor); return spelledName(notation, s.li, s.acc, true) + (withOct ? s.oct : ''); }
// Krumhansl–Kessler key profiles: unlike plain scale coverage, they tell a major key from its relative minor.
const AN_PROFILE = { maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
function anKeyInfo(ns: readonly theory.TheoryNote[]) {
    const ranks = anKeyRank(ns), best = ranks[0], margin = best.score - ranks[1].score;
    const conf = ns.length < 12 ? 'low' : best.score >= 0.75 && margin >= 0.08 ? 'high' : best.score >= 0.6 && margin >= 0.03 ? 'medium' : 'low';
    return { best, alts: ranks.slice(1, 4), conf };
}
/* harmony */
// Chord templates. p: intervals above the root, p[1] the tone that fixes the quality (the third, the suspended tone, or the fifth of
// a power chord); x: a seventh chord (figures ⁷ ⁶₅ ⁴₃ ⁴₂); dom: the dominant-seventh family; ext: tones that must clearly sound for
// the richer reading (a sixth chord needs its fifth as well, or it is a triad in first inversion); cx: a small cost of the richer
// reading; rn: suffix after the Roman numeral; n9: a ninth chord.
interface AnChordTemplate { s: string; q: string; p: number[]; cx?: number; rn?: string; ext?: number[]; x?: number; dom?: number; n9?: number; }
const AN_CHORDS: AnChordTemplate[] = [{ s: '', q: 'M', p: [0, 4, 7] }, { s: 'm', q: 'm', p: [0, 3, 7] }, { s: '°', q: 'd', p: [0, 3, 6], cx: .05 }, { s: '+', q: 'A', p: [0, 4, 8], cx: .1 },
    { s: 'sus2', q: 'S', p: [0, 2, 7], cx: .1, rn: 'sus2' }, { s: 'sus4', q: 'S', p: [0, 5, 7], cx: .08, rn: 'sus4' }, { s: '5', q: 'P', p: [0, 7], cx: .06, rn: '5' },
    { s: '6', q: 'M', p: [0, 4, 7, 9], ext: [9, 7], cx: .09, rn: 'add6' }, { s: 'm6', q: 'm', p: [0, 3, 7, 9], ext: [9, 7], cx: .11, rn: 'add6' },
    { s: '7', q: 'M', p: [0, 4, 7, 10], x: 1, dom: 1, ext: [10], cx: .04 }, { s: 'maj7', q: 'M', p: [0, 4, 7, 11], x: 1, ext: [11], cx: .07 }, { s: 'm7', q: 'm', p: [0, 3, 7, 10], x: 1, ext: [10], cx: .05 },
    { s: 'm(maj7)', q: 'm', p: [0, 3, 7, 11], x: 1, ext: [11], cx: .13 }, { s: 'ø7', q: 'h', p: [0, 3, 6, 10], x: 1, ext: [10], cx: .06 }, { s: '°7', q: 'd', p: [0, 3, 6, 9], x: 1, ext: [9], cx: .06 },
    { s: '7sus4', q: 'S', p: [0, 5, 7, 10], x: 1, ext: [10], cx: .11, rn: 'sus4' }, { s: 'add9', q: 'M', p: [0, 4, 7, 2], ext: [2], cx: .12, rn: 'add9' },
    { s: '9', q: 'M', p: [0, 4, 7, 10, 2], x: 1, dom: 1, ext: [10, 2], cx: .11, n9: 1 }, { s: 'm9', q: 'm', p: [0, 3, 7, 10, 2], x: 1, ext: [10, 2], cx: .13, n9: 1 },
    { s: 'maj9', q: 'M', p: [0, 4, 7, 11, 2], x: 1, ext: [11, 2], cx: .14, n9: 1 }, { s: '7♭5', q: 'M', p: [0, 4, 6, 10], x: 1, dom: 1, ext: [6, 10], cx: .15, rn: '♭5' },
    { s: '7♯5', q: 'A', p: [0, 4, 8, 10], x: 1, dom: 1, ext: [8, 10], cx: .15 }];
const anDomQ = (c: AnChordTemplate) => !!c.dom || c.q === 'M' && !/maj|6/.test(c.s); // can act as V or V/x: a major triad, add9 or the dominant family
// The chord member in the bass: 1 third, 2 fifth, 3 seventh; suspended and power chords, and an added tone in the bass, count as 0.
function anInv(seg: { ch: { c: AnChordTemplate; root: number; }; bass: number|null; }) { const c = seg.ch.c, iv = (((seg.bass ?? 0) - seg.ch.root) % 12 + 12) % 12; return c.q === 'S' || c.q === 'P' ? 0 : iv === c.p[1] ? 1 : iv === c.p[2] ? 2 : c.x && iv === c.p[3] ? 3 : 0; }
// The key's diatonic triads (with V and vii° in minor) and V7.
function anMeasures(): ScoreMeasure[] { if (SCORE.measures && SCORE.measures.length)
    return SCORE.measures; const end = AN.notes.length ? Math.max(...AN.notes.map((n) => n.end)) : 0, out: ScoreMeasure[] = []; for (let s = 0, i = 1; s < end; s += 4, i++)
    out.push({ number: String(i), start: s, end: s + 4, num: 4, den: 4 }); return out; }
function anBeatUnit(m: { num: number; den: number; }) { return m.den === 8 && m.num % 3 === 0 ? 1.5 : 4 / m.den; }
function anMeasureAt(beat: number) { const ms = anMeasures(); let m = ms[0]; for (const x of ms) {
    if (x.start <= beat + 1e-6)
        m = x;
    else
        break;
} return m; }
// Time-weighted texture: how many notes sound together while anything sounds, and the peak.
function anPoly(ns: readonly { start: number; end: number; }[]) {
    const ev: [number, number][] = [];
    ns.forEach((n) => { ev.push([n.start, 1]); ev.push([n.end, -1]); });
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let c = 0, last: number | null = null, area = 0, on = 0, max = 0;
    for (const [x, d] of ev) {
        if (last != null && c > 0) {
            area += c * (x - last);
            on += x - last;
        }
        c += d;
        max = Math.max(max, c);
        last = x;
    }
    return { avg: on ? area / on : 0, max };
}
// The nearest note before and after each note within its own voice (part or track, and hand).
interface AnVoiceNeighbors { prev: AnNote|null|undefined; next: AnNote|null|undefined; }
function anVoiceNeighbors(ns: readonly AnNote[]) {
    const groups = new Map<string, AnNote[]>(), out = new Map<AnNote, AnVoiceNeighbors>(), key = (n: AnNote) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n);
    ns.forEach((n) => { const k = key(n); let list = groups.get(k); if (!list) {
        list = [];
        groups.set(k, list);
    } list.push(n); });
    groups.forEach((notes) => {
        const onsets: { start: number; notes: AnNote[]; }[] = [];
        notes.slice().sort((a, b) => a.start - b.start || a.midi - b.midi).forEach((n) => { let g = onsets[onsets.length - 1]; if (!g || Math.abs(g.start - n.start) > .001) {
            g = { start: n.start, notes: [] };
            onsets.push(g);
        } g.notes.push(n); });
        onsets.forEach((g, i) => g.notes.forEach((n) => {
            const nearest = (a: { notes: AnNote[]; }|undefined) => a && a.notes.reduce<AnNote|null>((best, x) => !best || Math.abs(x.midi - n.midi) < Math.abs(best.midi - n.midi) ? x : best, null);
            out.set(n, { prev: nearest(onsets[i - 1]), next: nearest(onsets[i + 1]) });
        }));
    });
    return out;
}
function anClassifyNonChord(ns: readonly AnNote[], segs: AnHarmonySeg[]) {
    const around = anVoiceNeighbors(ns), eps = 1e-6, step = (a: AnNote|null|undefined, b: AnNote|null|undefined) => a && b && Math.abs(a.midi - b.midi) > 0 && Math.abs(a.midi - b.midi) <= 2;
    segs.forEach((seg, si: number) => {
        const tones = new Set(seg.ch.tones), nextSeg: AnHarmonySeg|undefined = segs[si + 1], nextTones = nextSeg && new Set(nextSeg.ch.tones), span = seg.end - seg.start, seen = new Set<number|undefined>();
        const nct: AnNonChordTone[] = seg.nct = [];
        seg.notes.forEach((n) => {
            const idx = AN.index.get(n);
            if (tones.has(pc(n.midi)) || seen.has(idx))
                return;
            seen.add(idx);
            const ctx = around.get(n) || { prev: undefined, next: undefined }, prev = ctx.prev, next = ctx.next, prevTone = prev && tones.has(pc(prev.midi)), nextTone = next && tones.has(pc(next.midi));
            let type = 'other';
            if (n.start < seg.start - eps && next && next.start >= seg.start - eps && next.start < seg.end + eps && step(n, next) && nextTone)
                type = 'suspension';
            else if (nextTones && n.start >= seg.end - Math.max(.25, span * .45) && nextTones.has(pc(n.midi)) && (n.end > seg.end + eps || (next && pc(next.midi) === pc(n.midi))))
                type = 'anticipation';
            else if (prev && next && step(prev, n) && step(n, next) && prevTone && nextTone) {
                if (prev.midi === next.midi)
                    type = 'neighbor';
                else if (Math.sign(n.midi - prev.midi) === Math.sign(next.midi - n.midi))
                    type = 'passing';
            }
            nct.push({ note: n, index: idx, type });
        });
    });
}
// Harmony is read in spans of one beat up to a whole bar. Each bar is cut into beat units (half bars for a single line), every
// run of units is matched against the chord templates, and dynamic programming picks the best sequence through the piece: a
// chord change must earn its cost, which is lower on the downbeat and the half bar and higher when the chords share tones. So
// an arpeggio or Alberti bar stays one chord, while a real change on a beat still splits the bar.
// Metric weight of a time point: the downbeat, the middle of an even bar, other beats, half beats, anything shorter.
function anAccent(m: { start: number; end: number; }, u: number, x: number) {
    const b = (x - m.start) / u, n = Math.round((m.end - m.start) / u), k = Math.round(b);
    return b < 1e-4 ? 1 : Math.abs(b - k) < 1e-4 ? (n % 2 === 0 && 2 * k === n ? .85 : .7) : Math.abs(2 * b - Math.round(2 * b)) < 1e-4 ? .55 : .45;
}
// Where a chord may change in a bar: on its beats (at least an eighth note apart); for a single line only at the half bar.
function anGrid(m: ScoreMeasure, implied: boolean) {
    const len = m.end - m.start, u = anBeatUnit(m), eps = 1e-6;
    if (implied) {
        const half = len / 2;
        return len > 3 + eps && Math.abs(half / u - Math.round(half / u)) < eps ? [m.start, m.start + half, m.end] : [m.start, m.end];
    }
    const step = Math.max(.5, u), g = [m.start];
    for (let b = m.start + step; m.end - b >= step - eps; b += step)
        g.push(b);
    g.push(m.end);
    return g;
}
// Per note: the metric weight of its onset, and less weight for a probable passing or neighbour note (a short note alone in its
// voice, approached and left by step, off the strong beats). res: when a melodic note moves on by step. A step only counts when
// one note gives way to the next (not two voices of a held chord), and a figure like the G–F–G of a G7 Alberti bass, framed by
// leaps, is a broken chord rather than a neighbour note.
interface AnNoteWeight { acc: number; emb: number; res: number; }
function anNoteInfo(sorted: readonly AnNote[]) {
    const around = anVoiceNeighbors(sorted), ms = anMeasures(), out = new Map<AnNote, AnNoteWeight>(), count = new Map<string, number>(), eps = 1e-6;
    const vk = (n: AnNote) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n) + '|' + n.start.toFixed(3), d = (a: AnNote|null|undefined, b: AnNote|null|undefined) => a && b ? Math.abs(a.midi - b.midi) : 0;
    const step = (a: AnNote|null|undefined, b: AnNote|null|undefined) => !!a && !!b && d(a, b) > 0 && d(a, b) <= 2 && a.end <= b.start + .125 && b.start > a.start;
    sorted.forEach((n) => count.set(vk(n), (count.get(vk(n)) || 0) + 1));
    let j = 0;
    for (const n of sorted) {
        while (j + 1 < ms.length && ms[j + 1].start <= n.start + eps)
            j++;
        const m = ms[j], { prev, next } = around.get(n) || { prev: undefined, next: undefined }, alone = count.get(vk(n)) === 1;
        if (!m) {
            out.set(n, { acc: 1, emb: 1, res: Infinity });
            continue;
        }
        const fig = prev && next && prev.midi === next.midi && d((around.get(prev) || { prev: undefined }).prev, prev) > 2 && d(next, (around.get(next) || { next: undefined }).next) > 2;
        const u = anBeatUnit(m), acc = anAccent(m, u, n.start), on = alone && !fig && step(n, next);
        out.set(n, { acc, emb: on && acc < .85 && n.end - n.start <= u + eps && step(prev, n) ? .4 : 1, res: on && next ? next.start : Infinity });
    }
    return out;
}
// Weighted pitch classes per grid unit: sounding time × the metric weight of the onset (of the unit start for a held note) × the
// passing-note factor. low: the bass at the start of the unit; held: pitch classes held over into it.
interface AnUnit { s: number; e: number; w: number[]; res: [number, number, number][]; T: number; held: number; low: number|null; }
function anUnits(m: ScoreMeasure, grid: readonly number[], here: readonly AnNote[], info: Map<AnNote, AnNoteWeight>) {
    const U: AnUnit[] = [], u = anBeatUnit(m), eps = 1e-6;
    for (let i = 0; i + 1 < grid.length; i++) {
        const s = grid[i], e = grid[i + 1], w: number[] = Array(12).fill(0), res: [number, number, number][] = [], acc = anAccent(m, u, s);
        let T = 0, low: number|null = null, any: number|null = null, held = 0;
        for (const n of here) {
            const d = Math.min(n.end, e) - Math.max(n.start, s);
            if (d <= eps)
                continue;
            const f = info.get(n);
            if (!f)
                continue;
            const p = pc(n.midi), x = d * (n.start < s - eps ? acc : f.acc) * f.emb;
            w[p] += x;
            T += x;
            if (f.res < m.end - eps)
                res.push([p, x, f.res]);
            if (n.start < s - eps)
                held |= 1 << p;
            if (n.start <= s + eps && (low == null || n.midi < low))
                low = n.midi;
            if (any == null || n.midi < any)
                any = n.midi;
        }
        U.push({ s, e, w, res, T, held, low: low ?? any });
    }
    return U;
}
// Units a..b-1 together. sw leaves out melodic notes that move on by step inside the span: they cannot be the colour tone
// (sixth, seventh, ninth) or the suspended tone a richer chord name needs.
interface AnSpanReading { a: number; b: number; s: number; e: number; w: number[]; sw: number[]; T: number; bass: number|null; all?: AnChordReading[]; }
type AnSpanChoice = AnSpanReading & { all: AnChordReading[]; };
function anSpan(U: readonly AnUnit[], a: number, b: number): AnSpanReading {
    const w: number[] = Array(12).fill(0), sw: number[] = Array(12).fill(0), e = U[b - 1].e;
    let T = 0, bass: number|null = null;
    for (let i = a; i < b; i++) {
        const u = U[i];
        T += u.T;
        for (let p = 0; p < 12; p++)
            w[p] += u.w[p];
        if (bass == null && u.low != null)
            bass = pc(u.low);
        for (const [p, x, r] of u.res)
            if (r < e - 1e-6)
                sw[p] -= x;
    }
    for (let p = 0; p < 12; p++)
        sw[p] += w[p];
    return { a, b, s: U[a].s, e, w, sw, T, bass };
}
// How well one template explains a span; cover is the share of the weighted notes that are chord tones. The root must sound
// clearly, the tone that fixes the quality must sound and colour tones must sound clearly; of the rest only a triad's fifth may be
// missing. Suspended and power chords need the third to be absent. complete: every chord tone sounds.
interface AnChordReading { root: number; c: AnChordTemplate; tones: number[]; cover: number; complete: boolean; fit: number; }
function anFit(S: AnSpanReading, root: number, c: AnChordTemplate, dia: Set<string>): AnChordReading|null {
    const w = S.w, T = S.T, tones = c.p.map((i) => (root + i) % 12);
    if (!(w[root] >= .05 * T && w[tones[1]] > 0))
        return null;
    if ((c.q === 'S' || c.q === 'P') && (Math.max(w[(root + 3) % 12], w[(root + 4) % 12]) > .03 * T || c.q === 'S' && S.sw[tones[1]] < .04 * T))
        return null;
    if (c.ext)
        for (const i of c.ext)
            if (S.sw[(root + i) % 12] < (i === 2 ? .08 : .04) * T)
                return null;
    let miss = 0;
    for (let k = 2; k < tones.length; k++)
        if (!(w[tones[k]] > 0)) {
            if (c.p[k] === 7 && (c.q === 'M' || c.q === 'm'))
                miss = .08;
            else
                return null;
        }
    let cw = 0;
    tones.forEach((p) => { cw += w[p]; });
    const cover = cw / T;
    if (cover < .5)
        return null;
    return { root, c, tones, cover, complete: !miss, fit: 2 * cover - 1 - (c.cx || 0) - miss + (S.bass === root ? .06 : S.bass != null && tones.includes(S.bass) ? 0 : -.06) + (dia.has(root + ':' + c.s) ? .02 : 0) };
}
// A single line only implies harmony, so it is matched against the key's chords (with V and vii° in minor).
function anFitImplied(S: { T: number; w: number[]; }, key: theory.KeySignature) {
    const out: AnChordReading[] = [];
    if (!(S.T > 0))
        return out;
    for (const d of anDiatonic(key, AN_CHORDS)) {
        const chord = d.c;
        if (!chord)
            continue;
        const tones = chord.p.map((i) => (d.root + i) % 12);
        if (!(S.w[d.root] > 0) || tones.filter((p) => S.w[p] > 0).length < 2 || chord.x && !(S.w[tones[3]] > 0))
            continue;
        let cw = 0;
        tones.forEach((p) => { cw += S.w[p]; });
        const cover = cw / S.T;
        if (cover < .5)
            continue;
        out.push({ root: d.root, c: chord, tones, cover, complete: tones.every((p) => S.w[p] > 0), fit: 2 * cover - 1 + .2 * S.w[d.root] / S.T + 2 * (d.pref || 0) - (chord.x ? .06 : 0) });
    }
    return out.sort((a, b) => b.fit - a.fit);
}
function anCands(S: AnSpanReading, implied: boolean) {
    const key = anKeyAt(S.s);
    if (implied)
        return anFitImplied(S, key);
    const dia = new Set(anDiatonic(key, AN_CHORDS).map((d) => d.root + ':' + d.c?.s)), out: AnChordReading[] = [];
    if (S.T > 0)
        for (let r = 0; r < 12; r++)
            if (S.w[r] > 0)
                for (const c of AN_CHORDS) {
                    const x = anFit(S, r, c, dia);
                    if (x)
                        out.push(x);
                }
    return out.sort((a, b) => b.fit - a.fit);
}
// A rich chord over a long span may be two harmonies in a row (C then G reads as Cmaj9). When the span splits into two parts whose
// best readings are complete chords, neither holding the other, the rich reading loses the weight of the smaller part. A part that
// already reads as the rich chord, and the upper three notes of a dominant seventh (B–D–F of G7), do not count as another chord.
function anUnion(sp: AnSpanChoice[][], a: number, b: number) {
    const S = sp[a][b], id = (tones: number[]) => tones.slice().sort((p, q) => p - q).join(), within = (y: AnChordReading, x: AnChordReading) => y.tones.every((p) => x.tones.includes(p));
    let hit = false;
    for (const X of S.all) {
        if (X.tones.length < 4)
            continue;
        const up = X.c.dom ? id(X.tones.slice(1)) : '', top = (Z: AnSpanChoice) => { const y: AnChordReading|undefined = Z.all[0]; return y && y.complete && y.cover >= .75 && !within(X, y) && id(y.tones) !== up ? y : null; };
        let pen = 0;
        for (let k = a + 1; k < b; k++) {
            const y = top(sp[a][k]), z = top(sp[k][b]);
            if (y && z && !within(y, z) && !within(z, y))
                pen = Math.max(pen, Math.min(sp[a][k].T, sp[k][b].T));
        }
        if (pen) {
            X.fit -= pen / S.T;
            hit = true;
        }
    }
    if (hit)
        S.all.sort((x, y) => y.fit - x.fit);
}
// How sure a reading is. exact: every chord tone sounds, little else does and no other chord comes close. likely: the best
// reading, though a tone is missing, other notes sound or a rival is near. suggested: ambiguous, or implied by a single line.
interface AnRatedChord extends AnChordReading { margin: number; det: string; conf: string; alts: AnChordReading[]; }
function anRate(x: AnChordReading, all: AnChordReading[], implied: boolean): AnRatedChord {
    const id = (y: AnChordReading) => y.tones.slice().sort((p, q) => p - q).join(), own = id(x), rival = all.find((y) => id(y) !== own), margin = rival ? x.fit - rival.fit : 1;
    const det = implied ? 'suggested' : x.complete && x.cover >= .8 && margin >= .1 ? 'exact' : x.cover >= .6 && margin >= .04 ? 'likely' : 'suggested';
    return { root: x.root, c: x.c, tones: x.tones, cover: x.cover, fit: x.fit, complete: x.complete, margin, det,
        conf: det === 'exact' ? 'high' : det === 'likely' || implied && x.cover >= .75 && margin >= .1 ? 'medium' : 'low',
        alts: all.filter((y) => !(y.root === x.root && y.c === x.c) && y.fit >= x.fit - .08).slice(0, 2) };
}
interface AnNonChordTone { note: AnNote; index: number|undefined; type: string; }
interface AnHarmonySeg { start: number; end: number; measure: ScoreMeasure; unit: number; bass: number|null; ch: AnRatedChord; notes: AnNote[]; nct?: AnNonChordTone[]; cad?: string; }
interface AnHarmonyBar { m: ScoreMeasure; here: AnNote[]; U: AnUnit[]; n: number; Lmax: number; sp: AnSpanChoice[][]; M: number; }
interface AnHarmonyPick { B: AnHarmonyBar; a: number; b: number; x: AnChordReading; }
interface AnHarmonyState { v: number; cur: AnChordReading|null; back: AnHarmonyState|null; pick: AnHarmonyPick|null; }
function anHarmony(ns: readonly AnNote[], implied: boolean) {
    const out: AnHarmonySeg[] = [];
    if (!ns.length)
        return out;
    const eps = 1e-6, sorted = ns.slice().sort((a, b) => a.start - b.start || a.midi - b.midi), info = anNoteInfo(sorted), lo = sorted[0].start, hi = Math.max(...ns.map((n) => n.end));
    const bars: AnHarmonyBar[] = [], active: AnNote[] = [];
    let k = 0;
    for (const m of anMeasures()) {
        if (m.end <= lo + eps || m.start >= hi - eps)
            continue;
        while (k < sorted.length && sorted[k].start < m.end - eps)
            active.push(sorted[k++]);
        for (let i = active.length - 1; i >= 0; i--)
            if (active[i].end <= m.start + eps)
                active.splice(i, 1);
        const here = active.filter((n) => n.end > m.start + eps);
        if (!here.length)
            continue;
        const U = anUnits(m, anGrid(m, implied), here, info), n = U.length, Lmax = n > 12 ? 8 : n, sp = U.map((): AnSpanChoice[] => []);
        for (let L = 1; L <= Lmax; L++)
            for (let a = 0; a + L <= n; a++) {
                const span = anSpan(U, a, a + L), S = Object.assign(span, { all: anCands(span, implied) });
                sp[a][a + L] = S;
                if (L > 1 && !implied)
                    anUnion(sp, a, a + L);
            }
        bars.push({ m, here, U, n, Lmax, sp, M: U.reduce((s, x) => s + x.T, 0) / n });
    }
    // Viterbi over spans. A state is the chord in force; a span either names a chord (scored by its weight × fit) or is left without
    // one, which scores like a very poor fit. A change costs a share of the bar's mean unit weight: least on the downbeat, then the
    // half bar, then other beats, and more when the chords share tones, or a shared tone is held across the change.
    const same = (x: AnChordReading|null, y: AnChordReading|null) => x && y && x.root === y.root && x.c === y.c;
    const cost = (B: AnHarmonyBar, a: number, y: AnChordReading, x: AnChordReading) => {
        const common = x.tones.filter((p) => y.tones.includes(p)), held = common.some((p) => B.U[a].held >> p & 1);
        return (a === 0 ? .2 : 2 * a === B.n ? .4 : .55) * B.M * (1 + .25 * common.length + (held ? .25 : 0));
    };
    let states: AnHarmonyState[] = [{ v: 0, cur: null, back: null, pick: null }];
    for (const B of bars) {
        const at = [states];
        for (let b = 1; b <= B.n; b++) {
            const best = new Map<string, AnHarmonyState>();
            for (let a = Math.max(0, b - B.Lmax); a < b; a++) {
                const S = B.sp[a][b], opts = [null, ...S.all.slice(0, 6)];
                for (const st of at[a])
                    for (const x of opts) {
                        const cur = x || st.cur, id = cur ? cur.root + ':' + cur.c.s : '';
                        const v = st.v + (x ? S.T * x.fit - 1e-4 * B.M - (st.cur && !same(st.cur, x) ? cost(B, a, st.cur, x) : 0) : -.5 * S.T), old = best.get(id);
                        if (!old || v > old.v)
                            best.set(id, { v, cur, back: st, pick: x && { B, a, b, x } });
                    }
            }
            at.push([...best.values()].sort((p, q) => q.v - p.v).slice(0, 24));
        }
        states = at[B.n];
    }
    let end = states[0];
    states.forEach((st) => { if (st.v > end.v)
        end = st; });
    const picks: AnHarmonyPick[] = [];
    for (let st: AnHarmonyState|null = end; st; st = st.back)
        if (st.pick)
            picks.push(st.pick);
    picks.reverse();
    const segs: AnHarmonyPick[] = [];
    picks.forEach((p) => { const last = segs[segs.length - 1]; if (last && last.B === p.B && same(last.x, p.x))
        last.b = p.b;
    else
        segs.push({ ...p }); });
    for (const g of segs) {
        const U = g.B.U;
        while (g.b - g.a > 1 && U[g.a].low == null)
            g.a++;
        while (g.b - g.a > 1 && U[g.b - 1].low == null)
            g.b--;
        const S = g.B.sp[g.a][g.b] || anSpan(U, g.a, g.b), all = S.all || (S.all = anCands(S, implied)), x = all.find((y) => same(y, g.x)) || g.x;
        out.push({ start: S.s, end: S.e, measure: g.B.m, unit: anBeatUnit(g.B.m), bass: implied ? x.root : S.bass, ch: anRate(x, all, implied), notes: g.B.here.filter((n) => n.start < S.e - eps && n.end > S.s + eps) });
    }
    anClassifyNonChord(ns, out);
    return out;
}
// Minor-aware Roman numerals with inversion figures and secondary dominants (V/x).
const AN_DIA = { maj: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], min: ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'] };
function anRoman(key: theory.KeySignature, seg: { ch: AnChordReading; bass: number|null; }) {
    const ch = seg.ch, c = ch.c, rel = ((ch.root - key.root) % 12 + 12) % 12, minor = key.minor, scale = minor ? [0, 2, 3, 5, 7, 8, 10] : MAJOR, q = c.q, inv = anInv(seg);
    const fig = c.x ? (c.n9 && !inv ? '⁹' : ['⁷', '⁶₅', '⁴₃', '⁴₂'][inv]) : ['', '⁶', '⁶₄'][inv] || '', mark = q === 'd' ? '°' : q === 'h' ? 'ø' : q === 'A' ? '+' : '', sfx = c.rn || '';
    const secondary = anDomQ(c) && (minor ? (rel === 2 || (rel === 0 && c.x)) : ([2, 4, 9, 11].includes(rel) || (rel === 0 && c.x)));
    if (secondary) {
        const target = scale.indexOf((rel + 5) % 12);
        if (target > 0)
            return 'V' + mark + fig + sfx + '/' + AN_DIA[minor ? 'min' : 'maj'][target].replace('°', '');
    }
    let deg: number, acc = '';
    if (minor && rel === 11)
        deg = 6;
    else if (minor && rel === 9) {
        deg = 5;
        acc = '♯';
    }
    else
        deg = scale.indexOf(rel);
    if (deg < 0) {
        if (!minor && rel === 6) {
            deg = 3;
            acc = '♯';
        }
        else {
            const up = scale.indexOf((rel + 1) % 12);
            if (up >= 0) {
                deg = up;
                acc = '♭';
            }
            else {
                deg = scale.indexOf((rel + 11) % 12);
                acc = '♯';
            }
        }
    }
    let num = ROMAN[deg];
    // a power chord has no third, so its numeral follows the key's own chord on that degree (V stays major in minor)
    if (q === 'm' || q === 'd' || q === 'h' || q === 'P' && !acc && !(minor && rel === 7) && (scale[(deg + 2) % 7] - scale[deg] + 12) % 12 === 3)
        num = num.toLowerCase();
    return acc + num + mark + fig + sfx;
}
// Possible cadences: dominant or subdominant resolving onto a downbeat, or a dominant closing the passage.
function anCadences(segs: AnHarmonySeg[]) {
    segs.forEach((b, i: number) => {
        const a: AnHarmonySeg|undefined = segs[i - 1];
        if (!b.ch)
            return;
        const key = anKeyAt(b.start), rb = ((b.ch.root - key.root) % 12 + 12) % 12;
        const down = Math.abs(b.start - b.measure.start) < 1e-6, isDom = (s: AnHarmonySeg|undefined) => s && s.ch && ((s.ch.root - key.root) % 12 + 12) % 12 === 7 && anDomQ(s.ch.c);
        if (a && down && isDom(a) && rb === 0 && (b.ch.c.q === 'M' || b.ch.c.q === 'm'))
            b.cad = 'auth';
        else if (a && down && a.ch && ((a.ch.root - key.root) % 12 + 12) % 12 === 5 && (a.ch.c.q === 'M' || a.ch.c.q === 'm') && !a.ch.c.x && rb === 0)
            b.cad = 'plagal';
        else if (a && down && isDom(a) && (key.minor ? rb === 8 && b.ch.c.q === 'M' : rb === 9 && b.ch.c.q === 'm'))
            b.cad = 'decept';
        else if (i === segs.length - 1 && segs.length >= 3 && isDom(b) && b.end - b.start >= b.unit - 1e-6 && Math.abs(b.end - b.measure.end) < 1e-6)
            b.cad = 'half';
    });
}
// Motifs are searched on the top line (highest note per onset), so chords and the left hand do not scramble the melody.
interface AnMotif { iv: number[]; count: number; last: number; notes: AnNote[]; }
function anMotifs(ns: readonly AnNote[]) {
    const tops = new Map<string, AnNote>();
    ns.forEach((n) => { const k = n.start.toFixed(3), cur = tops.get(k); if (!cur || n.midi > cur.midi)
        tops.set(k, n); });
    const a = [...tops.values()].sort((x, y) => x.start - y.start);
    if (a.length < 8)
        return [];
    const map = new Map<string, AnMotif>();
    for (let i = 0; i + 3 < a.length; i++) {
        const iv = [1, 2, 3].map((j) => a[i + j].midi - a[i + j - 1].midi);
        if (iv.every((v) => !v))
            continue;
        const key = iv.join(',');
        let hit = map.get(key);
        if (!hit) {
            hit = { iv, count: 0, last: -4, notes: [] };
            map.set(key, hit);
        }
        if (i >= hit.last + 4) {
            hit.count++;
            hit.last = i;
            hit.notes.push(...a.slice(i, i + 4));
        }
    }
    return [...map.values()].filter((v) => v.count >= 2).sort((x, y) => y.count - x.count).slice(0, 4);
}
function anHandOf(n: { hand?: AnHand|null; midi: number; }): AnHand { return n.hand || (n.midi >= 60 ? 'rh' : 'lh'); }
// Everything the workspace shows for one scope; strings are produced at render time so language and notation can change.
function anCompute(ns: AnNote[], scopeKey: string): AnAnalysisModel {
    const ck = AN.version + '|' + scopeKey, cached = AN.cache.get(ck);
    if (cached)
        return cached;
    const lo = Math.min(...ns.map((n) => n.start)), hi = Math.max(...ns.map((n) => n.end)), pitches = [...new Set(ns.map((n) => n.midi))].sort((a, b) => a - b);
    const poly = anPoly(ns), implied = poly.avg < 1.25, segs = anHarmony(ns, implied);
    anCadences(segs);
    const ms = anMeasures().filter((m) => m.end > lo + 1e-6 && m.start < hi - 1e-6);
    let beats = 0;
    ms.forEach((m) => { const s = Math.max(lo, m.start), e = Math.min(hi, m.end); if (e > s)
        beats += (e - s) / anBeatUnit(m); });
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
    const hands = ns.some((n) => n.hand) ? 'hands' : 'register', rh = ns.filter((n) => anHandOf(n) === 'rh').length;
    const model = { ns, lo, hi, pitches, poly, implied, segs, ms, beats: Math.max(beats, 1e-6), onsets, tempos, hands, rh, lh: ns.length - rh,
        key: anKeyInfo(ns), mainKey: anKeyAt(lo), motifs: anMotifs(ns), seconds: scoreSeconds(hi) - scoreSeconds(lo) };
    if (AN.cache.size > 16)
        AN.cache.clear();
    AN.cache.set(ck, model);
    return model;
}
/* notation import / generation */
interface ScoreState {
    xml: string; engine: notationApi.ScoreRenderer | null; version: number; playGen: number; timers: ReturnType<typeof setTimeout>[]; playing: boolean; sel: boolean; loop: ScoreLoopState | null;
    tempos: { beat: number; bpm: number; }[]; tempoList: { beat: number; bpm: number; }[]; tempoFromFile: boolean; measures: ScoreMeasure[]; midiGrid: number; lit: Set<number>;
    heads: Map<number, SVGElement[]>; followRaf: number; zoom: number; look: 'paper' | 'night'; layout: 'page' | 'cont'; stale: boolean; layoutWidth: number;
    geo: ScoreGeometry | null; mrange: { anchor: number; a: number; b: number; sig: string; } | null; resume: { sel: boolean; } | null; paused: boolean; cursorEl: HTMLDivElement | null;
    followSys: number; panAt: number; hl: boolean; run?: PracticeRun | null; syms?: ScoreSym[]; fixedWidth?: boolean; fit?: { key: string; step: number; on: boolean; } | null;
    markGeo?: ScoreGeometry | null; markSig?: string;
}
const SCORE: ScoreState = { xml: '', engine: null, version: 0, playGen: 0, timers: [], playing: false, sel: false, loop: null, tempos: [{ beat: 0, bpm: 120 }], tempoList: [{ beat: 0, bpm: 120 }], tempoFromFile: false,
    measures: [], midiGrid: 0, lit: new Set(), heads: new Map(), followRaf: 0, zoom: window.innerWidth < 560 ? 0.9 : 1, look: 'paper', layout: 'page', stale: false, layoutWidth: 0,
    geo: null, mrange: null, resume: null, paused: false, cursorEl: null, followSys: -1, panAt: 0, hl: false };
// sel: a note picked by hand (blue, like the playback line); lit: a sounding note, gold, only with "Highlight sounding notes" on
const SCORE_LOOK = { paper: { bg: '#fffefa', ink: '#000000', staff: undefined, sel: '#1a6fe0', lit: '#a47720', ok: '#1b8f4c', bad: '#d22f2f', dim: '#b9b2a6' }, night: { bg: '#1d1a17', ink: '#ece5d8', staff: '#a1988a', sel: '#7fb2ff', lit: '#e8bb5c', ok: '#6fdc9a', bad: '#ff7a7a', dim: '#5d574f' } }; // MuseScore-blue selection
function scoreSetTempos(list: { beat: number; bpm: number; }[]) { SCORE.tempos = list.length ? list : [{ beat: 0, bpm: 120 }]; SCORE.tempoList = SCORE.tempos.slice().sort((a, b) => a.beat - b.beat); if (SCORE.tempoList[0].beat > 0)
    SCORE.tempoList.unshift({ beat: 0, bpm: SCORE.tempoList[0].bpm }); }
function scoreSeconds(beat: number) { let sec = 0, last = 0, bpm = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    if (e.beat > beat)
        break;
    sec += (e.beat - last) * 60 / bpm;
    last = e.beat;
    bpm = e.bpm;
} return sec + (beat - last) * 60 / bpm; }
function scoreBeatAt(sec: number) { let acc = 0, last = 0, bpm = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    const d = (e.beat - last) * 60 / bpm;
    if (acc + d > sec)
        break;
    acc += d;
    last = e.beat;
    bpm = e.bpm;
} return last + (sec - acc) * bpm / 60; }
interface ScoreXmlLevel { part: number; staff: number; beat: number; value: number; sequence: number; }
interface ScoreXmlMark { part: number; staff: number; beat: number; type: string; number: string; sequence: number; }
interface ScoreXmlLine extends ScoreXmlMark { kind: string; }
interface ScoreXmlDynamic { value?: number | null; hit?: number; }
const SCORE_STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function scoreXmlNotes(doc: Document) {
    const notes: ScoreXmlNote[] = [], tempos: { beat: number; bpm: number; }[] = [], measures: ScoreMeasure[] = [], keys: ScoreXmlKey[] = [], dynamics: ScoreXmlLevel[] = [], transients: ScoreXmlLevel[] = [], wedgeEvents: ScoreXmlMark[] = [], pedalEvents: { part: number; staff: number; beat: number; type: string; sequence: number; }[] = [], dolces: { part: number; staff: number; beat: number; on: boolean; sequence: number; }[] = [], partEnds: number[] = [];
    const linkOpen = new Map<string, ScoreXmlNote>(), linkPairs: { kind: string; a: ScoreXmlNote; b: ScoreXmlNote; style: string; }[] = [], lineEvents: ScoreXmlLine[] = []; // slurs, glissandi and slides by note; dashes and brackets by beat
    let malformed = false;
    const lastNote = (match: (n: ScoreXmlNote) => boolean) => { for (let i = notes.length - 1; i >= 0; i--)
        if (match(notes[i]))
            return notes[i]; return undefined; };
    const DYN: Record<string, number> = { ppp: 28, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 122, sfz: 115, fz: 115, rfz: 115 };
    const direct = (node: Element, name: string) => [...node.children].filter((c) => c.localName === name), child = (node: Element, name: string): Element | null => direct(node, name)[0] || null;
    const number = (node: Element | null, fallback = 0) => { const n = +(node?.textContent || ''); return Number.isFinite(n) ? n : fallback; };
    const span = (node: Element | null) => { const n = +(node?.textContent || 0); if (!Number.isFinite(n))
        malformed = true; return n; }; // durations must be numbers
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const dynamicValue = (value: string|null, percent = false) => { if (value == null || value === '')
        return null; const n = +value; return Number.isFinite(n) ? clamp(percent && n <= 100 ? n * .9 : n, 1, 127) : null; };
    const dynamicInfo = (box: Element): ScoreXmlDynamic | null => {
        const named = [...box.children].find((el) => DYN[el.localName?.toLowerCase()] != null || el.localName === 'other-dynamics');
        const name = ((named?.localName === 'other-dynamics' ? named.textContent : named?.localName) || '').trim().toLowerCase();
        if (name === 'fp')
            return { value: 56, hit: 105 };
        if (['sfz', 'fz', 'rfz'].includes(name))
            return { hit: DYN[name] };
        return DYN[name] != null ? { value: DYN[name] } : null;
    };
    let sequence = 0;
    const pushDynamic = (part: number, staff: number, beat: number, info: ScoreXmlDynamic | null) => {
        if (!info)
            return;
        if (info.value != null)
            dynamics.push({ part, staff, beat, value: info.value, sequence: sequence++ });
        if (info.hit != null)
            transients.push({ part, staff, beat, value: info.hit, sequence: sequence++ });
    };
    const addSound = (sound: Element, part: number, staff: number, beat: number) => {
        if (sound.hasAttribute('tempo')) {
            const bpm = Number(sound.getAttribute('tempo'));
            if (bpm > 0 && Number.isFinite(bpm))
                tempos.push({ beat: Math.max(0, beat), bpm });
        }
        if (sound.hasAttribute('dynamics'))
            pushDynamic(part, staff, beat, { value: dynamicValue(sound.getAttribute('dynamics'), true) });
        const damper = (sound.getAttribute('damper-pedal') || '').toLowerCase();
        if (['yes', 'on', '1'].includes(damper))
            pedalEvents.push({ part, staff, beat, type: 'start', sequence: sequence++ });
        if (['no', 'off', '0'].includes(damper))
            pedalEvents.push({ part, staff, beat, type: 'stop', sequence: sequence++ });
    };
    [...doc.querySelectorAll('score-partwise > part')].forEach((part, pi) => {
        let measureStart = 0, num = 4, den = 4, staves = 1, division = 1;
        const gracePending = new Map<string, ScoreGraceNote[]>();
        const graceKey = (staff: number, voice: number) => staff + ':' + voice;
        for (const measure of part.children) {
            if (measure.localName !== 'measure')
                continue;
            let at = measureStart, lastStart = at, max = at;
            for (const node of measure.children) {
                const name = node.localName;
                if (name === 'attributes') {
                    const d = child(node, 'divisions');
                    if (d) {
                        division = number(d, 1) || 1;
                        if (!(division > 0))
                            malformed = true;
                    }
                    const tm = child(node, 'time');
                    if (tm) {
                        num = number(child(tm, 'beats'), num) || num;
                        den = number(child(tm, 'beat-type'), den) || den;
                    }
                    const st = child(node, 'staves');
                    if (st)
                        staves = number(st, staves) || staves;
                    const key = child(node, 'key');
                    if (key && pi === 0 && child(key, 'fifths')) {
                        const f = number(child(key, 'fifths'));
                        const mode = (child(key, 'mode')?.textContent || '').trim();
                        if (Math.abs(f) <= 7)
                            keys.push({ beat: at, fifths: f, mode: mode === 'major' || mode === 'minor' ? mode : null });
                    }
                }
                if (name === 'direction') {
                    const offset = number(child(node, 'offset')) / division, beat = at + offset, staff = number(child(node, 'staff'));
                    direct(node, 'direction-type').forEach((dt) => {
                        direct(dt, 'dynamics').forEach((d) => pushDynamic(pi, 0, beat, dynamicInfo(d)));
                        direct(dt, 'wedge').forEach((w) => { const type = (w.getAttribute('type') || '').toLowerCase(); if (['crescendo', 'diminuendo', 'stop'].includes(type))
                            wedgeEvents.push({ part: pi, staff: 0, beat, type, number: w.getAttribute('number') || '1', sequence: sequence++ }); });
                        direct(dt, 'pedal').forEach((p) => { const type = (p.getAttribute('type') || '').toLowerCase(); if (['start', 'change', 'stop'].includes(type))
                            pedalEvents.push({ part: pi, staff, beat, type, sequence: sequence++ }); });
                        for (const kind of ['dashes', 'bracket'])
                            direct(dt, kind).forEach((l) => { const type = (l.getAttribute('type') || '').toLowerCase(); if (type === 'start' || type === 'stop')
                                lineEvents.push({ part: pi, staff: staff || 1, beat, kind, type, number: l.getAttribute('number') || '1', sequence: sequence++ }); });
                        const words = direct(dt, 'words').map((w) => w.textContent).join(' ');
                        if (/\bdolce|dolcissimo/i.test(words))
                            dolces.push({ part: pi, staff: 0, beat, on: !/\bnon\s+dolce/i.test(words), sequence: sequence++ });
                    });
                    direct(node, 'sound').forEach((sound) => addSound(sound, pi, 0, beat));
                }
                if (name === 'sound')
                    addSound(node, pi, 0, at);
                if (name === 'backup')
                    at -= span(child(node, 'duration')) / division;
                if (name === 'forward')
                    at += span(child(node, 'duration')) / division;
                if (name === 'note') {
                    const grace = !!child(node, 'grace'), duration = span(child(node, 'duration')) / division, chord = !!child(node, 'chord'), start = chord ? lastStart : at;
                    const voice = number(child(node, 'voice'), 1) || 1, staff = number(child(node, 'staff'), 1) || 1, pitch = child(node, 'pitch'), key = graceKey(staff, voice);
                    if (pitch) {
                        const step = child(pitch, 'step')?.textContent, oct = number(child(pitch, 'octave')), alter = number(child(pitch, 'alter')), midi = (oct + 1) * 12 + (step == null ? NaN : SCORE_STEP[step]) + alter;
                        if (Number.isFinite(midi)) {
                            if (grace) {
                                const list = gracePending.get(key) || [], g: ScoreGraceNote = { midi, vel: 84 };
                                if ([...node.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'start'))
                                    g.tieStart = true;
                                list.push(g);
                                gracePending.set(key, list);
                            }
                            else {
                                const hand = staves >= 2 ? (staff === 1 ? 'rh' : 'lh') : null, stop = [...node.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'stop');
                                const prev = stop && lastNote((n) => n.part === pi && n.staff === staff && n.voice === voice && n.midi === midi && Math.abs(n.end - start) < .001);
                                const fg = number(node.querySelector('fingering')), nd = [...node.querySelectorAll('notations > dynamics')].map(dynamicInfo).find(Boolean), attr = dynamicValue(node.getAttribute('dynamics'));
                                const arts = new Set([...node.querySelectorAll('notations > articulations > *')].map((a) => a.localName));
                                let own: ScoreXmlNote | null = null;
                                if (prev) {
                                    prev.end = start + duration;
                                    own = prev;
                                }
                                else if (duration > 0) {
                                    const n: ScoreXmlNote = { midi, start, end: start + duration, vel: 90, hand, part: pi, staff, voice, type: child(node, 'type')?.textContent || '', art: {
                                            staccato: arts.has('staccato'), staccatissimo: arts.has('staccatissimo'), accent: arts.has('accent'), strongAccent: arts.has('strong-accent'), tenuto: arts.has('tenuto')
                                        },
                                        arpeggiate: !!node.querySelector('notations > arpeggiate') };
                                    if (fg > 0 && fg < 6)
                                        n.finger = fg;
                                    if (nd?.value != null)
                                        n.explicitVel = nd.value;
                                    else if (attr != null)
                                        n.explicitVel = attr;
                                    if (nd?.hit != null)
                                        n.dynamicHit = nd.hit;
                                    const graces = gracePending.get(key);
                                    if (!chord && graces) {
                                        n.graces = graces;
                                        gracePending.delete(key);
                                        const last = graces[graces.length - 1];
                                        if (stop && last.tieStart && last.midi === midi)
                                            last.tiedToPrincipal = true;
                                    }
                                    notes.push(n);
                                    own = n;
                                }
                                if (own)
                                    node.querySelectorAll('notations > slur, notations > glissando, notations > slide').forEach((l) => {
                                        const type = (l.getAttribute('type') || '').toLowerCase(), key = pi + ':' + l.localName + ':' + (l.getAttribute('number') || '1');
                                        if (type === 'start')
                                            linkOpen.set(key, own);
                                        else if (type === 'stop') {
                                            const a = linkOpen.get(key);
                                            if (a) {
                                                linkOpen.delete(key);
                                                if (a !== own)
                                                    linkPairs.push({ kind: l.localName, a, b: own, style: l.getAttribute('line-type') || '' });
                                            }
                                        }
                                    });
                            }
                        }
                    }
                    if (!grace && !chord) {
                        lastStart = at;
                        at += duration;
                    }
                    max = Math.max(max, at, start + (grace ? 0 : duration));
                }
            }
            if (pi === 0)
                measures.push({ number: measure.getAttribute('number') || String(measures.length + 1), start: measureStart, end: max, num, den });
            measureStart = max;
        }
        partEnds[pi] = measureStart;
    });
    // Malformed numbers (a NaN duration, a zero or negative meter…) would otherwise poison every later position.
    if (malformed || notes.some((n) => !Number.isFinite(n.start) || !Number.isFinite(n.end)) || measures.some((m) => !Number.isFinite(m.start) || !Number.isFinite(m.end) || !(m.num > 0 && Number.isInteger(m.num)) || !(m.den > 0 && Number.isInteger(m.den))))
        throw anError('xml');
    const sorted = notes.sort((a, b) => a.start - b.start || a.midi - b.midi), byTime = (a: { beat: number; sequence: number; }, b: { beat: number; sequence: number; }) => a.beat - b.beat || a.sequence - b.sequence;
    const same = (event: { part: number; staff: number; }, n: { part: number; staff: number; }) => event.part === n.part && (event.staff === 0 || event.staff === n.staff);
    const persistent = dynamics.slice().sort(byTime), explicit = persistent.slice();
    const levelAt = (part: number, staff: number, beat: number) => {
        let value = 90, last = -Infinity, specificity = -1, seq = -1;
        persistent.forEach((e) => {
            if (e.part !== part || (e.staff !== 0 && e.staff !== staff) || e.beat > beat + .001)
                return;
            const spec = e.staff === staff ? 2 : 1;
            if (e.beat > last + .001 || (Math.abs(e.beat - last) < .001 && (spec > specificity || (spec === specificity && e.sequence > seq)))) {
                value = e.value;
                last = e.beat;
                specificity = spec;
                seq = e.sequence;
            }
        });
        return value;
    };
    const open = new Map<string, ScoreXmlMark>(), wedges: { part: number; staff: number; start: number; end: number; from: number; to: number; }[] = [];
    wedgeEvents.sort(byTime).forEach((e) => {
        const key = e.part + ':' + e.staff + ':' + e.number;
        if (e.type === 'crescendo' || e.type === 'diminuendo')
            open.set(key, e);
        else {
            let begin = open.get(key);
            if (!begin)
                begin = [...open.values()].reverse().find((x) => x.part === e.part && x.number === e.number && (x.staff === e.staff || x.staff === 0 || e.staff === 0));
            if (!begin || e.beat <= begin.beat + .001)
                return;
            open.delete(begin.part + ':' + begin.staff + ':' + begin.number);
            const target = explicit.find((d) => d.part === begin.part && (d.staff === 0 || d.staff === begin.staff) && d.beat >= e.beat - .001 && d.beat <= e.beat + 4);
            const from = levelAt(begin.part, begin.staff, begin.beat), to = target ? target.value : clamp(from + (begin.type === 'crescendo' ? 16 : -16), 1, 127);
            wedges.push({ part: begin.part, staff: begin.staff, start: begin.beat, end: e.beat, from, to });
            persistent.push({ part: begin.part, staff: begin.staff, beat: e.beat, value: to, sequence: sequence++ });
        }
    });
    persistent.sort(byTime);
    const pedalSegments: { part: number; start: number; end: number; }[] = [];
    for (const part of [...new Set(pedalEvents.map((e) => e.part))]) {
        let active: { start: number; } | null = null;
        for (const e of pedalEvents.filter((e) => e.part === part).sort(byTime)) {
            if (e.type === 'start') {
                if (active && e.beat > active.start + .001)
                    pedalSegments.push({ part, start: active.start, end: e.beat });
                active = { start: e.beat };
            }
            else if (e.type === 'change') {
                if (active)
                    pedalSegments.push({ part, start: active.start, end: e.beat });
                active = { start: e.beat };
            }
            else if (active) {
                pedalSegments.push({ part, start: active.start, end: e.beat });
                active = null;
            }
        }
        if (active && partEnds[part] > active.start + .001)
            pedalSegments.push({ part, start: active.start, end: partEnds[part] });
    }
    const topAt = new Map<string, number>(), sizeAt = new Map<string, number>();
    sorted.forEach((n) => { const key = n.part + ':' + n.staff + ':' + n.start, top = topAt.get(key); if (top == null || n.midi > top)
        topAt.set(key, n.midi); sizeAt.set(key, (sizeAt.get(key) || 0) + 1); });
    const measureAt = (beat: number) => measures.find((m) => beat >= m.start - .001 && beat < m.end - .001);
    const dolceAt = (n: ScoreXmlNote) => { let on = false, last = -Infinity, seq = -1; dolces.forEach((d) => { if (!same(d, n) || d.beat > n.start + .001)
        return; if (d.beat > last + .001 || (Math.abs(d.beat - last) < .001 && d.sequence > seq)) {
        on = d.on;
        last = d.beat;
        seq = d.sequence;
    } }); return on; };
    const transientAt = (n: ScoreXmlNote) => { let hit: number | undefined = n.dynamicHit, last = -Infinity, seq = -1; transients.forEach((e) => { if (!same(e, n) || Math.abs(e.beat - n.start) > .012)
        return; if (e.beat > last + .001 || (Math.abs(e.beat - last) < .001 && e.sequence > seq)) {
        hit = e.value;
        last = e.beat;
        seq = e.sequence;
    } }); return hit; };
    sorted.forEach((n) => {
        const key = n.part + ':' + n.staff + ':' + n.start, right = n.hand === 'rh' || (!n.hand && n.staff === 1), chordSize = sizeAt.get(key) || 1;
        const melody = right && (n.midi === topAt.get(key) || (n.voice === 1 && chordSize === 1)), accompaniment = n.hand === 'lh' || n.staff === 2 || n.voice > 1 || (n.type === '16th' && !melody);
        const wedge = wedges.filter((w) => same(w, n) && n.start >= w.start - .001 && n.start <= w.end + .001).pop();
        let vel = n.explicitVel ?? transientAt(n) ?? levelAt(n.part, n.staff, n.start);
        if (wedge && n.explicitVel == null && n.dynamicHit == null && transientAt(n) == null) {
            const f = clamp((n.start - wedge.start) / (wedge.end - wedge.start), 0, 1);
            vel = wedge.from + (wedge.to - wedge.from) * f;
        }
        if (n.art.accent)
            vel += 12;
        if (n.art.strongAccent)
            vel += 18;
        if (n.art.tenuto)
            vel += 4;
        if (melody)
            vel += 7;
        else if (accompaniment) {
            vel += n.hand === 'lh' || n.staff === 2 ? -8 : -6;
            const m = measureAt(n.start), unit = m ? 4 / m.den : 1, beat = (n.start - (m?.start || 0)) / unit;
            if (Math.abs(beat) < .01)
                vel += 4;
            else if (Math.abs(beat - Math.round(beat)) < .01)
                vel -= 2;
        }
        n.warm = dolceAt(n);
        if (n.warm && accompaniment)
            vel -= 5;
        n.vel = Math.round(clamp(vel, 1, 127));
        n.soundRatio = n.art.staccatissimo ? .3 : n.art.staccato ? .45 : 1;
    });
    const arpeggios = new Map<string, boolean>();
    sorted.forEach((n) => { if (n.arpeggiate) {
        const key = n.part + ':' + n.staff + ':' + n.voice + ':' + n.start;
        arpeggios.set(key, true);
    } });
    sorted.forEach((n) => { const key = n.part + ':' + n.staff + ':' + n.voice + ':' + n.start; if (arpeggios.has(key))
        n.roll = 0; });
    [...arpeggios.keys()].forEach((key) => sorted.filter((n) => n.part + ':' + n.staff + ':' + n.voice + ':' + n.start === key).sort((a, b) => a.midi - b.midi).forEach((n, i) => n.roll = i * .022));
    const nextSame = new Map<string, number>();
    for (let i = sorted.length - 1; i >= 0; i--) {
        const n = sorted[i], key = n.part + ':' + n.midi;
        n.nextSame = nextSame.get(key);
        nextSame.set(key, n.start);
    }
    sorted.forEach((n) => {
        let soundEnd = n.start + (n.end - n.start) * (n.soundRatio ?? 1), pedal = pedalSegments.find((p) => p.part === n.part && p.start <= n.start + .001 && p.end > n.start + .001);
        if (pedal) {
            n.pedalEnd = pedal.end;
            soundEnd = Math.max(soundEnd, pedal.end);
        }
        if (n.nextSame != null && n.nextSame > n.start + .001)
            soundEnd = Math.min(soundEnd, n.nextSame);
        n.soundEnd = Math.max(n.start + .03, soundEnd);
        delete n.nextSame;
    });
    // Lines between the hands: cross-staff slurs, glissandi and slides (OSMD leaves them out) and dashed or bracketed
    // voice-leading lines that start on one staff and end on the other, from the first note after the start to the last before the stop.
    const lineOpen = new Map<string, ScoreXmlLine>();
    lineEvents.sort(byTime).forEach((e) => {
        const key = e.part + ':' + e.kind + ':' + e.number;
        if (e.type === 'start') {
            lineOpen.set(key, e);
            return;
        }
        const a0 = lineOpen.get(key);
        lineOpen.delete(key);
        if (!a0 || a0.staff === e.staff)
            return;
        const a = sorted.find((n) => n.part === a0.part && n.staff === a0.staff && n.start >= a0.beat - .001), b = sorted.filter((n) => n.part === e.part && n.staff === e.staff && n.start <= e.beat + .001 && n.start >= a0.beat - .001).pop();
        if (a && b && a !== b)
            linkPairs.push({ kind: e.kind, a, b, style: 'dashed' });
    });
    const links = linkPairs.filter((l) => l.a.staff !== l.b.staff).map((l) => ({ kind: l.kind, a: sorted.indexOf(l.a), b: sorted.indexOf(l.b), style: l.style })).filter((l) => l.a >= 0 && l.b >= 0);
    return { notes: sorted, tempos: tempos.filter((e) => e.bpm > 0 && Number.isFinite(e.bpm) && Number.isFinite(e.beat)), measures, keys, links };
}
const XML_ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
function xmlEsc(s: string) { return String(s).replace(/[<>&"']/g, (c) => XML_ESC[c]); }
// MIDI (or a built-in piece) → MusicXML. `opt.grid` is the quantization per quarter note (2, 4 or 8); divisions grow when a meter needs finer units.
interface ScoreMidiNote { midi: number; start: number; end: number; vel: number; track: number; channel: number; hand: AnHand; }
type ScoreMidiTime = Extract<AnMidiMeta, { type: 'time' }>;
type ScoreMidiChange = ScoreMidiTime | { type: 'key'; beat: number; fifths: number; minor: boolean; };
interface ScoreEngraveGroup { staff: number; start: number; end: number; notes: (ScoreMidiNote & { staff: number; })[]; }
interface ScoreEngraveVoice { groups: ScoreEngraveGroup[]; staff: number; secondary: boolean; stem: string; }
interface ScoreEngraveEvent { group: ScoreEngraveGroup | null; pos: number; d: number; type: string; dot: number; from: boolean; to: boolean; beam?: string; }
function scoreFromMidi(parsed: { meta: AnMidiMeta[]; notes: ScoreMidiNote[]; }, title: string, opt: { grid: number; keys: { beat: number; fifths: number; minor: boolean; }[]; composer?: string; }) {
    const isTime = (e: AnMidiMeta): e is ScoreMidiTime => e.type === 'time';
    const grid = opt.grid || 4, events = parsed.meta || [], timeEvents = events.filter(isTime);
    let div = grid;
    while (timeEvents.some((e) => (4 * div) % e.den) && div < grid * 64)
        div *= 2;
    const k = div / grid;
    SCORE.midiGrid = grid;
    SCORE.measures = [];
    const tempos = events.filter((e): e is Extract<AnMidiMeta, { type: 'tempo' }> => e.type === 'tempo').map((e) => ({ beat: e.beat, bpm: e.bpm }));
    scoreSetTempos(tempos);
    SCORE.tempoFromFile = tempos.length > 0;
    const notes = parsed.notes.map((n) => { const s = Math.round(n.start * grid) * k; return { ...n, start: s, end: Math.max(s + k, Math.round(n.end * grid) * k), staff: n.hand === 'lh' ? 2 : 1 }; }).sort((a, b) => a.start - b.start || a.midi - b.midi);
    const end = Math.max(...notes.map((n) => n.end));
    if (end > 200000)
        throw anError('long');
    // Played legato overlaps of up to a sixteenth would spawn extra voices; trim them for the engraving only.
    const trim = k * Math.max(1, grid / 4);
    for (const staff of [1, 2]) {
        const own = notes.filter((n) => n.staff === staff), onsets = [...new Set(own.map((n) => n.start))].sort((a, b) => a - b);
        let j = 0;
        for (const n of own) {
            while (j < onsets.length && onsets[j] <= n.start)
                j++;
            const next = onsets[j];
            if (next != null && n.end > next && n.end - next <= trim)
                n.end = next;
        }
    }
    const groups = new Map<string, ScoreEngraveGroup>();
    for (const n of notes) {
        const key = n.staff + ':' + n.start + ':' + n.end;
        let group = groups.get(key);
        if (!group)
            groups.set(key, group = { staff: n.staff, start: n.start, end: n.end, notes: [] });
        group.notes.push(n);
    }
    // The highest lane becomes the stem-up main voice so a melody is never engraved underneath its accompaniment.
    const used = [...new Set(notes.map((n) => n.staff))], single = used.length === 1, staves = single ? used : [1, 2]; // one hand only → one staff
    const globalVoices: ScoreEngraveVoice[] = [];
    for (const staff of staves) {
        const lanes: (ScoreEngraveVoice & { end: number; })[] = [];
        for (const group of [...groups.values()].filter((g) => g.staff === staff)) {
            let lane = lanes.find((l) => l.end <= group.start);
            if (!lane) {
                lane = { end: 0, groups: [], staff, secondary: false, stem: '' };
                lanes.push(lane);
            }
            lane.groups.push(group);
            lane.end = group.end;
        }
        const avg = (l: ScoreEngraveVoice) => { let s = 0, c = 0; l.groups.forEach((g) => g.notes.forEach((n) => { s += n.midi; c++; })); return c ? s / c : 0; };
        lanes.sort((a, b) => avg(b) - avg(a));
        lanes.forEach((l, i) => { l.secondary = i > 0; l.stem = lanes.length > 1 ? (i ? 'down' : 'up') : ''; });
        globalVoices.push(...(lanes.length ? lanes : [{ groups: [], staff, secondary: false, stem: '' }]));
    }
    const VALUE_TABLE: [number, string, number][] = [[4, 'whole', 0], [3, 'half', 1], [2, 'half', 0], [1.5, 'quarter', 1], [1, 'quarter', 0], [0.75, 'eighth', 1], [0.5, 'eighth', 0], [0.375, '16th', 1], [0.25, '16th', 0], [0.1875, '32nd', 1], [0.125, '32nd', 0], [0.0625, '64th', 0], [0.03125, '128th', 0], [0.015625, '256th', 0]];
    const VALUES = VALUE_TABLE.map(([q, type, dot]): [number, string, number] => [q * div, type, dot]).filter(([d]) => Number.isInteger(d) && d >= 1);
    const meters: ScoreMidiChange[] = events.filter(isTime).map((e) => ({ ...e }));
    const changes = meters.concat((opt.keys || []).map((e): ScoreMidiChange => ({ type: 'key', beat: e.beat, fifths: e.fifths, minor: !!e.minor })))
        .map((e) => ({ ...e, pos: Math.round(e.beat * div) })).sort((a, b) => a.pos - b.pos);
    let at = 0, number = 1, xml = '', fifths = 0, minor = false, num = 4, den = 4, ci = 0;
    while (at < end) {
        const beat = at / div;
        let keyChanged = number === 1, timeChanged = number === 1;
        while (ci < changes.length && changes[ci].pos <= at) {
            const e = changes[ci++];
            if (e.type === 'key') {
                keyChanged = keyChanged || fifths !== e.fifths || minor !== e.minor;
                fifths = e.fifths;
                minor = e.minor;
            }
            else {
                timeChanged = timeChanged || num !== e.num || den !== e.den;
                num = e.num;
                den = e.den;
            }
        }
        const next = changes[ci], length = Math.min(num * 4 * div / den, next ? next.pos - at : Infinity);
        if (length <= 0 || !Number.isInteger(length))
            throw anError('meter');
        const stop = at + length;
        SCORE.measures.push({ number: String(number), start: at / div, end: stop / div, num, den });
        xml += '<measure number="' + number + '">';
        if (number === 1 || keyChanged || timeChanged)
            xml += '<attributes>' + (number === 1 ? '<divisions>' + div + '</divisions>' : '') + (keyChanged ? '<key><fifths>' + fifths + '</fifths><mode>' + (minor ? 'minor' : 'major') + '</mode></key>' : '') + (timeChanged ? '<time><beats>' + num + '</beats><beat-type>' + den + '</beat-type></time>' : '') + (number === 1 ? (single ? (used[0] === 2 ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>') : '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>') : '') + '</attributes>';
        for (const t of SCORE.tempos.filter((e) => e.beat >= beat - 1e-9 && e.beat < stop / div))
            xml += '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + Math.round(t.bpm) + '</per-minute></metronome></direction-type><offset>' + Math.round((t.beat - beat) * div) + '</offset><sound tempo="' + (Math.round(t.bpm * 100) / 100) + '"/></direction>';
        const beamLen = den === 8 && num % 3 === 0 ? 1.5 * div : den === 2 ? 2 * div : div; // beam per beat: a dotted quarter in compound meters, a half in x/2
        globalVoices.forEach((voice, vi) => {
            if (vi)
                xml += '<backup><duration>' + length + '</duration></backup>';
            let cursor = at;
            const evs: ScoreEngraveEvent[] = [];
            const emit = (group: ScoreEngraveGroup | null, start: number, duration: number) => { let left = duration, offset = 0; while (left > 0) {
                const value = VALUES.find((v) => v[0] <= left);
                if (!value)
                    throw anError('meter');
                const [d, type, dot] = value;
                evs.push({ group, pos: start + offset, d, type, dot, from: !!group && start + offset > group.start, to: !!group && start + offset + d < group.end });
                left -= d;
                offset += d;
            } };
            for (const group of voice.groups.filter((g) => g.start < stop && g.end > at)) {
                const start = Math.max(at, group.start), finish = Math.min(stop, group.end);
                if (start > cursor)
                    emit(null, cursor, start - cursor);
                emit(group, start, finish - start);
                cursor = finish;
            }
            if (cursor < stop)
                emit(null, cursor, stop - cursor);
            scoreBeams(evs, at, beamLen);
            evs.forEach(({ group, d, type, dot, from, to, beam }) => { const chord = group ? group.notes : [null]; chord.forEach((n, index) => { xml += '<note' + (!group && voice.secondary ? ' print-object="no" print-spacing="yes"' : '') + '>' + (index ? '<chord/>' : '') + (n ? scorePitch(n.midi, fifths, minor) : '<rest/>') + '<duration>' + d + '</duration>' + (from ? '<tie type="stop"/>' : '') + (to ? '<tie type="start"/>' : '') + '<voice>' + (vi + 1) + '</voice><type>' + type + '</type>' + (dot ? '<dot/>' : '') + (n && voice.stem ? '<stem>' + voice.stem + '</stem>' : '') + '<staff>' + (single ? 1 : voice.staff) + '</staff>' + (beam && !index ? '<beam number="1">' + beam + '</beam>' : '') + (from || to ? '<notations>' + (from ? '<tied type="stop"/>' : '') + (to ? '<tied type="start"/>' : '') + '</notations>' : '') + '</note>'; }); });
        });
        xml += (stop >= end ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : '') + '</measure>';
        at = stop;
        number++;
        if (number > 2000)
            throw anError('long');
    }
    return '<?xml version="1.0"?><score-partwise version="3.1">' + (title ? '<work><work-title>' + xmlEsc(title) + '</work-title></work>' : '') + (opt.composer ? '<identification><creator type="composer">' + xmlEsc(opt.composer) + '</creator></identification>' : '') + '<part-list><score-part id="P1"><part-name>' + xmlEsc(t('sc_part')) + '</part-name></score-part></part-list><part id="P1">' + xml + '</part></score-partwise>';
}
// Beam runs of eighths and shorter inside one beat group of the bar; rests and longer values break a run.
function scoreBeams(evs: ScoreEngraveEvent[], at: number, len: number) {
    let run: ScoreEngraveEvent[] = [];
    const flush = () => { if (run.length > 1)
        run.forEach((e, i) => { e.beam = i ? (i === run.length - 1 ? 'end' : 'continue') : 'begin'; }); run = []; };
    evs.forEach((e) => {
        const g0 = Math.floor((e.pos - at) / len), prev = run[run.length - 1];
        if (!e.group || !/^(eighth|16th|32nd|64th)$/.test(e.type) || Math.floor((e.pos - at + e.d - 1) / len) !== g0) {
            flush();
            return;
        }
        if (prev && (Math.floor((prev.pos - at) / len) !== g0 || prev.pos + prev.d !== e.pos))
            flush();
        run.push(e);
    });
    flush();
}
// Hands: MIDI tracks (or channels) when their median pitches separate cleanly, otherwise a pitch split. Track order is never trusted.
function anAssignHands(notes: AnParsedNote[], mode: string): AnHandAssignment {
    const split = (s: number) => notes.map((n): AnHand => n.midi >= s ? 'rh' : 'lh');
    if (/^\d+$/.test(mode))
        return { of: split(+mode), how: 'split', split: +mode };
    if (mode === 'auto' && notes.every((n): n is AnParsedNote & { srcHand: AnHand; } => !!n.srcHand))
        return { of: notes.map((n) => n.srcHand), how: 'piece' };
    const field = new Set(notes.map((n) => n.track)).size > 1 ? 'track' : new Set(notes.map((n) => n.channel)).size > 1 ? 'channel' : null;
    if (!field)
        return { of: split(60), how: 'one', split: 60 };
    const groups = new Map<number, number[]>();
    notes.forEach((n) => { const g = n[field]; let ms = groups.get(g); if (!ms)
        groups.set(g, ms = []); ms.push(n.midi); });
    const list = [...groups].map(([g, ms]) => { const s = ms.slice().sort((a, b) => a - b); return { g, count: ms.length, median: s[s.length >> 1] }; }).sort((a, b) => b.median - a.median);
    let cut = 1, gap = -1;
    for (let i = 1; i < list.length; i++) {
        const d = list[i - 1].median - list[i].median;
        if (d > gap) {
            gap = d;
            cut = i;
        }
    }
    const upper = new Set(list.slice(0, cut).map((x) => x.g)), share = list.slice(0, cut).reduce((s, x) => s + x.count, 0) / notes.length;
    if (mode === 'auto' && !(gap >= 5 && share >= 0.05 && share <= 0.95))
        return { of: split(60), how: 'fallback', split: 60 };
    return { of: notes.map((n) => upper.has(n[field]) ? 'rh' : 'lh'), how: 'tracks', groups: list.length };
}
// Rebuild notes + notation from the stored MIDI/example source; analysis timing stays the unquantized source timing.
function anRebuild() {
    const src = AN.source;
    if (!src || src.kind === 'xml')
        return;
    const parsed = src.parsed, hands = anAssignHands(parsed.notes, AN.recon.hands);
    const notes = parsed.notes.map((n, i): ScoreMidiNote => ({ midi: n.midi, start: n.start, end: n.end, vel: n.vel, track: n.track, channel: n.channel, hand: hands.of[i] }));
    const key = anResolveKey({ meta: parsed.meta.filter((e): e is AnMidiKeyMeta => e.type === 'key') }, AN.recon.key, notes);
    const xml = scoreFromMidi({ meta: parsed.meta, notes }, src.title, { grid: AN.recon.grid, keys: key.events, composer: src.comp });
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
const SC_PAGE_W = 794, SC_BASE = 0.75; // an A4 page is 794 CSS px wide at 100%; OSMD draws 10 px per staff space at zoom 1, so 0.75 ≈ MuseScore's default staff size
// Beam groups for OSMD's auto-beaming (only used for MusicXML written without beams): one beat, or a dotted quarter in compound meters.
function scoreBeamGroups() { const m = (SCORE.measures || [])[0] || { num: 4, den: 4 }; return m.den === 8 && m.num % 3 === 0 ? [[3, 8]] : m.den === 2 ? [[2, 4]] : [[1, 4]]; }
// The engraving rules Étude sets on OSMD (a type alias, so it passes as the renderer's rule record).
type ScoreEngravingRules = {
    PageLeftMargin?: number; PageRightMargin?: number; PageTopMargin?: number; PageBottomMargin?: number; TitleTopDistance?: number; SystemComposerDistance?: number;
    MinimumDistanceBetweenSystems?: number; MinSkyBottomDistBetweenSystems?: number; BetweenStaffDistance?: number; StaffDistance?: number; MinSkyBottomDistBetweenStaves?: number;
    MeasureNumberLabelHeight?: number; InstrumentLabelTextHeight?: number; FixedMeasureWidth?: boolean; ChordSymbolYOffset?: number; FingeringOffsetY?: number;
    FingeringTextSize?: number; FingeringPaddingY?: number; SheetTitleHeight?: number; SheetSubtitleHeight?: number; SheetComposerHeight?: number;
    StaffLineColor?: string; RenderMeasureNumbersOnlyAtSystemStart?: boolean; MeasureNumberLabelOffset?: number;
};
async function scoreRender()  {
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
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let the loading state paint before the engraver blocks
    if (version !== SCORE.version)
        return false;
    try {
        await loadOsmd();
    }
    catch (err) {
        showNotationReloadPrompt();
        console.error('OSMD:', err);
        throw err;
    }
    const isXml = !!AN.source && AN.source.kind === 'xml', autoBeam = isXml && !/<beam[\s>]/.test(SCORE.xml); // generated scores already carry <beam> groups per voice
    const oneStaffPart = (SCORE.xml.match(/<score-part[\s>]/g) || []).length <= 1; // a lone piano needs no "Instr. P1" at the left
    const engine = await createScoreRenderer(box.firstElementChild || box, { autoResize: false, backend: 'svg', drawTitle: true, drawComposer: true, drawPartNames: !oneStaffPart, drawPartAbbreviations: false, drawMeasureNumbers: true,
        autoBeam, autoBeamOptions: { beam_rests: false, beam_middle_rests_only: false, maintain_stem_directions: true, groups: scoreBeamGroups() } });
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
    return scoreLayout() !== false;
}
// View, zoom and appearance only need a new layout, not a new load; selection, cursor and highlights are repainted afterwards.
// Page view: A4 sheets on the desk, as wide as 794 px × zoom but never wider than the desk (the music reflows instead of panning).
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
    const look = SCORE_LOOK[SCORE.look], cont = SCORE.layout === 'cont', R: ScoreEngravingRules = {}, sheet = box.querySelector('.an-sheet'), cs = getComputedStyle(box);
    box.dataset.layout = SCORE.layout;
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sourceLayout = AN.source && AN.source.kind === 'xml' ? AN.source.layout : null, pageW = sourceLayout ? sourceLayout.width : SC_PAGE_W, base = sourceLayout ? sourceLayout.base : SC_BASE;
    const sheetW = Math.max(240, Math.round(Math.min(pageW * SCORE.zoom, avail)));
    if (sheet instanceof HTMLElement) sheet.style.width = cont ? '' : sheetW + 'px';
    engine.setOptions({ defaultColorMusic: look.ink, pageBackgroundColor: look.bg, pageFormat: cont ? 'Endless' : 'A4_P', renderSingleHorizontalStaffline: cont, drawTitle: !cont, drawSubtitle: !cont, drawComposer: !cont, drawLyricist: !cont });
    if (!cont && sourceLayout)
        engine.setCustomPageFormat(sourceLayout.pageWidth, sourceLayout.pageHeight);
    R.StaffLineColor = look.staff;
    R.RenderMeasureNumbersOnlyAtSystemStart = !cont;
    R.MeasureNumberLabelOffset = cont ? 1 : 2;
    engine.updateRules(R);
    // A page narrower than A4 × zoom is the same A4 page scaled down: the staff space shrinks with it, so every
    // system keeps its bars and every page its systems whatever the panel width.
    engine.setZoom(cont ? SCORE.zoom * base : sheetW / pageW * base);
    scoreRingFit(engine.getZoom());
    scoreFitRender(engine, !cont && !SCORE.fixedWidth && /new-(system|page)="yes"/.test(SCORE.xml), SCORE.zoom + '|' + avail);
    scoreStyleHeader(engine, sourceLayout);
    scoreFixFingerings(box, engine);
    if (SCORE.look === 'night')
        scoreNightSweep(box, look.ink);
    SCORE.stale = false;
    SCORE.layoutWidth = box.clientWidth;
    box.classList.remove('is-loading', 'is-empty');
    box.setAttribute('aria-busy', 'false');
    box.dataset.look = SCORE.look;
    scoreBind(engine);
    scoreXLines();
    const pedalsOk = scoreFixPedals(box);
    scoreGeo(engine);
    scoreSyms(engine);
    box.hidden = FALL.mode !== 'score';
    scorePaint();
    if (!pedalsOk) {
        anSetLoading(false);
        anShowError('an_err_render');
    }
    return pedalsOk;
}
// OSMD's title label is plain text. Restore safe MusicXML italic/bold runs after each layout (never inject markup).
function scoreStyleHeader(engine: notationApi.ScoreRenderer, layout: ScoreXmlLayout | null) {
    const node = engine.getTitleNode(), runs = layout && layout.titleRuns;
    if (!node || !runs || !runs.length)
        return;
    const text = node.localName === 'text' ? node : node.querySelector('text');
    if (!text || (text.textContent || '').trim() !== runs.map((r) => r.text).join('').trim())
        return;
    const spans = runs.map((r) => { const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); span.textContent = r.text; span.setAttribute('font-style', r.style); span.setAttribute('font-weight', r.weight); return span; });
    text.replaceChildren(...spans);
}
// Page view of an imported file keeps its own <print new-system / new-page> breaks (MuseScore's 3–4 bars a line).
// Those breaks only help while the bars fit: note spacing tightens a step at a time until the engraver needs no
// extra break; past the last step it fills the lines itself rather than leave a lone bar after every forced break.
const SC_FIT: [number, number, number][] = [[.85, 3, 2], [.7, 2.2, 1.6], [.58, 1.6, 1.3], [.48, 1.2, 1.1]]; // VexFlow spacing multiplier, addend, min note distance
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
    for (let i = 0; i < SC_FIT.length; i++) {
        set(i, true);
        engine.render();
        if (!scoreExtraBreaks(engine)) {
            SCORE.fit = { key, step: i, on: true };
            return;
        }
    }
    set(0, false);
    engine.render();
    SCORE.fit = { key, step: 0, on: false };
}
function scoreExtraBreaks(engine: notationApi.ScoreRenderer) {
    return engine.hasExtraBreaks();
}
// Anything OSMD still draws in pure black (connectors, brackets, text without a colour rule) follows the night ink too.
// The keyboard-focus ring around a notehead is measured in the score's own units: about 1 px of page colour, then 1.6 px of blue.
function scoreRingFit(z: number) { (document).querySelectorAll('.sc-defs feMorphology').forEach((f) => { if (f instanceof SVGElement)
    f.setAttribute('radius', (Number(f.dataset.px) / (z || SC_BASE)).toFixed(2)); }); }
function scoreNightSweep(box: HTMLElement, ink: string) {
    const black = /^(#000|#000000|black|rgb\(0,\s*0,\s*0\))$/i;
    box.querySelectorAll('svg *').forEach((el) => {
        for (const a of ['fill', 'stroke'] as const) {
            const v = el.getAttribute(a);
            if (v && black.test(v.trim()))
                el.setAttribute(a, ink);
            if ((el instanceof SVGElement || el instanceof HTMLElement) && el.style[a] && black.test(el.style[a].trim()))
                el.style[a] = ink;
        }
        if (el.localName === 'text' && !el.getAttribute('fill'))
            el.setAttribute('fill', ink);
    });
}
// Bind each source note to its rendered notehead, retaining individual selection in chords. One tab stop; arrows move between notes.
function scoreBind(engine: notationApi.ScoreRenderer) {
    SCORE.heads = new Map();
    const grid = SCORE.midiGrid || 0, startOf = (n: AnNote) => grid ? Math.round(n.start * grid) / grid : n.start, endOf = (n: AnNote) => grid ? Math.max(startOf(n) + 1 / grid, Math.round(n.end * grid) / grid) : n.end;
    const byMidi = new Map<number, number[]>();
    AN.notes.forEach((n, i) => { let list = byMidi.get(n.midi); if (!list)
        byMidi.set(n.midi, list = []); list.push(i); });
    let bound = new Set<number>(), boundBeat: number | null = null;
    engine.forEachRenderedNote(({ midi, beat, part, staff, voice, element: g }) => {
        if (boundBeat !== beat) {
            boundBeat = beat;
            bound = new Set();
        }
        const cands = byMidi.get(midi);
        if (!cands)
            return;
        const same = (j: number) => { const n = AN.notes[j]; return (n.part == null || n.part === part) && (n.staff == null || n.staff === staff) && (n.voice == null || n.voice === voice); };
        const match = (pred: (j: number) => boolean) => { const a = cands.filter(pred); return a.find((j) => same(j) && !bound.has(j)) ?? a.find((j) => !bound.has(j)) ?? a.find(same) ?? a[0]; };
        const exact = (j: number) => Math.abs(startOf(AN.notes[j]) - beat) < .01, sustained = (j: number) => startOf(AN.notes[j]) <= beat + .001 && endOf(AN.notes[j]) > beat + .001;
        // A tied continuation belongs to its own voice, even when another voice starts the same pitch here.
        const i = match((j) => same(j) && exact(j)) ?? match((j) => same(j) && sustained(j)) ?? match(exact) ?? match(sustained);
        if (i == null)
            return;
        bound.add(i);
        g.dataset.i = String(i);
        g.style.cursor = 'pointer';
        g.style.pointerEvents = 'all';
        g.setAttribute('tabindex', '-1');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', spellName(AN.notes[i].midi, anKeyAt(AN.notes[i].start), true));
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
} g.setAttribute('aria-pressed', selected ? 'true' : 'false'); }
function scorePaintIdx(i: number) { (SCORE.heads.get(i) || []).forEach(scorePaintEl); }
function scorePaint() { SCORE.heads.forEach((list) => list.forEach(scorePaintEl)); scoreMarks(); scoreCursorUpdate(false); anAnalyze(); }
// OSMD draws each pedal mark straight onto the page; a group per mark lets the hover explain "Ped." and "*".
function showNotationReloadPrompt() {
    const copy = notationReloadMessage(lang === 'ro' ? 'ro' : 'en'), box = (document).createElement('div');
    box.setAttribute('role', 'alert');
    box.className = 'notation-reload';
    box.innerHTML = '<p></p><button type="button"></button>';
    const message = box.querySelector('p');
    const button = box.querySelector('button');
    if (message) message.textContent = copy.message;
    if (button) {
        button.textContent = copy.button;
        button.addEventListener('click', () => location.reload());
    }
    document.body.append(box);
}
// Text-pedal skylines can miss ledger notes, and a release with no staff entry can land on its press glyph.
// Place actual glyph ink without changing event timing. Recompute from native positions on every call.
// One property of an OSMD object (Étude doesn't type the engraver's internals); callers narrow what comes back.
function scoreVendorField(v: unknown, k: string): unknown { return typeof v === 'object' && v !== null ? Reflect.get(v, k) : undefined; }
function scoreVendorList(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
interface ScorePedalBox { left: number; right: number; top: number; bottom: number; group?: Element | null; press?: boolean; }
let scoreFixPedals = function scoreFixPedals(box: HTMLElement) {
    let unresolved = 0;
    box.querySelectorAll('svg').forEach((svg) => {
        const marks = [...svg.querySelectorAll('.vf-sc-pedal path')].filter((p) => p instanceof SVGElement), ctm = svg.getScreenCTM();
        if (!marks.length || !ctm || !ctm.d)
            return;
        marks.forEach((p) => {
            if (p.dataset.pedalUnresolved) {
                p.style.visibility = '';
                delete p.dataset.pedalUnresolved;
            }
            if (!p.hasAttribute('data-pedal-base-transform'))
                p.dataset.pedalBaseTransform = p.getAttribute('transform') || '';
            const base = p.dataset.pedalBaseTransform;
            if (base)
                p.setAttribute('transform', base);
            else
                p.removeAttribute('transform');
        });
        const gap = Math.max(1, Math.abs(ctm.d) * 2.5), limit = Math.abs(ctm.a) * 40, page = svg.getBoundingClientRect(), placed: ScorePedalBox[] = [];
        const cross = (a: ScorePedalBox, b: ScorePedalBox, pad = gap) => a.right + pad > b.left && a.left - pad < b.right && a.bottom + pad > b.top && a.top - pad < b.bottom;
        const obstacles: ScorePedalBox[] = [...svg.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-ledgers path,.vf-ledgers line,.vf-modifiers path,.vf-stavetie path,path.vf-stavetie,.sc-xline,text')].filter((n) => !n.closest('.vf-sc-pedal')).flatMap((n) => {
            const r = n.getBoundingClientRect(), s = getComputedStyle(n), pad = s.stroke !== 'none' ? Math.max(.5, parseFloat(s.strokeWidth) * Math.abs(ctm.d) / 2 || .5) : 0;
            if (n.matches('.sc-xline,.vf-stavetie path,path.vf-stavetie') && n instanceof SVGGeometryElement) {
                const len = n.getTotalLength(), m = n.getScreenCTM() ?? undefined, out: ScorePedalBox[] = [];
                let a = n.getPointAtLength(0);
                a = new DOMPoint(a.x, a.y).matrixTransform(m);
                for (let i = 1, count = Math.max(1, Math.ceil(len / 2)); i <= count; i++) {
                    const q = n.getPointAtLength(len * i / count), z = new DOMPoint(q.x, q.y).matrixTransform(m);
                    out.push({ left: Math.min(a.x, z.x) - pad, right: Math.max(a.x, z.x) + pad, top: Math.min(a.y, z.y) - pad, bottom: Math.max(a.y, z.y) + pad });
                    a = z;
                }
                return out;
            }
            return [{ left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad }];
        });
        marks.forEach((p) => {
            const r = p.getBoundingClientRect();
            if (r.width < .1)
                return;
            const group = p.closest('.vf-sc-pedal'), release = r.width < r.height * 1.3, rect = (x: number, y: number) => ({ left: r.left + x, right: r.right + x, top: r.top + y, bottom: r.bottom + y });
            let dx = 0, dy = 0;
            const V = scoreVendorField, owner = V(group, 'scPedalOwner'), sys = V(V(owner, 'staffLine'), 'ParentMusicSystem');
            const pos = (s: unknown) => { const at = V(V(s, 'PositionAndShape'), 'AbsolutePosition'); return at ? { x: Number(V(at, 'x')), y: Number(V(at, 'y')) } : null; };
            const systems = scoreVendorList(V(V(sys, 'Parent'), 'MusicSystems')), next = systems[systems.indexOf(sys) + 1];
            const pedal = V(owner, 'pedal'), measureOf = (entry: unknown) => V(V(entry, 'parentStaffEntry'), 'parentMeasure');
            const endpoint = pedal && (release ? V(pedal, 'endMeasure') || measureOf(V(pedal, 'endVfVoiceEntry')) : measureOf(V(pedal, 'startVfVoiceEntry')));
            const measures = scoreVendorList(V(V(owner, 'staffLine'), 'Measures')), measure = endpoint && V(V(endpoint, 'ParentStaffLine'), 'ParentMusicSystem') === sys ? endpoint : (release ? measures[measures.length - 1] : measures[0]);
            const mp = pos(measure), sp = pos(sys), np = pos(next);
            const ml = mp ? ctm.e + mp.x * 10 * ctm.a - limit : -Infinity, mr = mp ? ctm.e + (mp.x + Number(V(V(V(measure, 'PositionAndShape'), 'Size'), 'width'))) * 10 * ctm.a + limit : Infinity;
            const minY = Math.max(page.top + gap - r.top, -Math.abs(ctm.d) * 40, sp ? ctm.f + sp.y * 10 * ctm.d - r.top : -Infinity);
            const maxY = Math.min(page.bottom - gap - r.bottom, Math.abs(ctm.d) * 40, np ? ctm.f + np.y * 10 * ctm.d - gap - r.bottom : Infinity);
            const all = obstacles.concat(placed), ys = [...new Set([0, minY, maxY, ...all.flatMap((o) => [o.bottom + gap - r.top, o.top - gap - r.bottom])])].filter((y) => y >= minY && y <= maxY).sort((a, b) => Math.abs(a) - Math.abs(b));
            let found = false;
            for (const y of ys) {
                const row = all.filter((o) => r.bottom + y + gap > o.top && r.top + y - gap < o.bottom), afterPress = release && row.some((o) => o.group === group && o.press);
                const xs = [...new Set([0, ...row.flatMap((o) => [o.right + gap - r.left, o.left - gap - r.right])])].filter((x) => Math.abs(x) <= limit && r.left + x >= page.left + gap && r.right + x <= page.right - gap && r.right + x >= ml && r.left + x <= mr && !row.some((o) => cross(rect(x, y), o)));
                xs.sort((a, b) => (Math.abs(a) + (afterPress && a < 0 ? limit + 1 : 0)) - (Math.abs(b) + (afterPress && b < 0 ? limit + 1 : 0)));
                if (xs.length) {
                    dx = xs[0];
                    dy = y;
                    found = true;
                    break;
                }
            }
            ;
            // Fail closed: no clipped/colliding ink or invented musical location. A fresh layout retries natively.
            if (!found) {
                unresolved++;
                p.dataset.pedalUnresolved = 'no-safe-slot';
                p.style.visibility = 'hidden';
                console.warn('Score pedal: no-safe-slot', owner);
                return;
            }
            const base = p.dataset.pedalBaseTransform;
            if (Math.abs(dx) > .1 || Math.abs(dy) > .1)
                p.setAttribute('transform', (base ? base + ' ' : '') + 'translate(' + (dx / ctm.a).toFixed(3) + ' ' + (dy / ctm.d).toFixed(3) + ')');
            placed.push({ ...rect(dx, dy), group, press: !release });
        });
    });
    box.dataset.pedalUnresolved = String(unresolved);
    return unresolved === 0;
};
// SVG user units of the page a node sits on, from screen pixels (OSMD draws 10 units per staff space).
function scoreToUser(svg: SVGSVGElement, x: number, y: number) { const m = svg.getScreenCTM(); if (!m)
    return null; const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m.inverse()); }
// A line the source file draws from note index a to note index b, with its kind and line style.
interface ScoreCrossLink { a: number; b: number; kind: string; style?: string }
// Lines between the hands that OSMD leaves out: cross-staff slurs, glissandi and slides, dashed voice-leading lines.
function scoreXLines() {
    if (!scoreHasKey(SCORE_LOOK, SCORE.look))
        return;
    const links: ScoreCrossLink[] = (AN.source && AN.source.kind === 'xml' && AN.source.links) || [], ink = SCORE_LOOK[SCORE.look].ink, NS = 'http://www.w3.org/2000/svg';
    links.forEach((l) => {
        const ha: SVGElement[] = SCORE.heads.get(l.a) || [], hb: SVGElement[] = SCORE.heads.get(l.b) || [], ga = ha[0], gb = hb[0];
        if (!ga || !gb)
            return;
        const svg = ga.ownerSVGElement;
        if (!svg || svg !== gb.ownerSVGElement)
            return;
        const ra = ga.getBoundingClientRect(), rb = gb.getBoundingClientRect(), A = scoreToUser(svg, ra.left + ra.width / 2, ra.top + ra.height / 2), B = scoreToUser(svg, rb.left + rb.width / 2, rb.top + rb.height / 2);
        if (!A || !B)
            return;
        const R = scoreToUser(svg, ra.right, 0), L = scoreToUser(svg, ra.left, 0);
        if (!R || !L)
            return;
        const sp = 10, hw = Math.max(.5, R.x - L.x) / 2;
        if (B.x < A.x + hw || Math.abs(B.y - A.y) > sp * 24)
            return; // the far end is on another system
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('class', 'sc-xline');
        el.dataset.kind = l.kind === 'slur' ? 'slur' : l.kind === 'glissando' || l.kind === 'slide' ? 'gliss' : 'line';
        if (l.kind === 'slur') { // a crescent bowing over the top, from just above one notehead to just above the other
            const x0 = A.x + hw * .4, y0 = A.y - sp * .9, x1 = B.x - hw * .4, y1 = B.y - sp * .9, len = Math.hypot(x1 - x0, y1 - y0), h = Math.min(sp * 2.4, Math.max(sp * .8, len * .2)), th = sp * .22;
            const nx = (y1 - y0) / len, ny = -(x1 - x0) / len, s = ny > 0 ? -1 : 1, c = (f: number, k: number) => [x0 + (x1 - x0) * f + nx * s * k, y0 + (y1 - y0) * f + ny * s * k].map((v) => v.toFixed(2)).join(' ');
            el.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} C${c(.25, h)} ${c(.75, h)} ${x1.toFixed(2)} ${y1.toFixed(2)} C${c(.75, h + th)} ${c(.25, h + th)} ${x0.toFixed(2)} ${y0.toFixed(2)}Z`);
            el.setAttribute('fill', ink);
            el.setAttribute('stroke', ink);
            el.setAttribute('stroke-width', '.4');
        }
        else {
            const x0 = A.x + hw * 1.4, x1 = B.x - hw * 1.4;
            if (x1 <= x0)
                return;
            el.setAttribute('d', `M${x0.toFixed(2)} ${A.y.toFixed(2)} L${x1.toFixed(2)} ${B.y.toFixed(2)}`);
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke', ink);
            el.setAttribute('stroke-width', l.kind === 'glissando' || l.kind === 'slide' ? '1.3' : '1');
            if (l.style === 'dashed' || l.style === 'dotted' || el.dataset.kind === 'line')
                el.setAttribute('stroke-dasharray', l.style === 'dotted' ? '1 3' : '5 4');
        }
        svg.appendChild(el);
    });
}
// The parts of OSMD's engraved sheet the score passes read. OSMD ships no types for these, so isScoreOsmdSheet checks the root.
interface ScoreOsmdLabel { SVGNode?: SVGElement | null; Label?: { text?: string } }
interface ScoreOsmdVexNote {
    getAttribute?(name: 'el'): SVGElement | undefined;
    duration?: string;
    modifiers?: { getCategory?(): string; type: string }[];
}
interface ScoreOsmdNote {
    sourceNote?: { isRest(): boolean; PrintObject?: boolean; TypeLength?: { RealValue: number }; DotsXml?: number };
    getNoteheadSVGs?(): SVGElement[];
    getSVGGElement?(): SVGElement;
}
interface ScoreOsmdVoiceEntry { vfStaveNote?: ScoreOsmdVexNote; mVexFlowStaveNote?: ScoreOsmdVexNote; notes?: ScoreOsmdNote[] }
interface ScoreOsmdStaffEntry { FingeringEntries?: ScoreOsmdLabel[]; graphicalChordContainers?: { GraphicalLabel?: ScoreOsmdLabel }[]; graphicalVoiceEntries?: ScoreOsmdVoiceEntry[] }
interface ScoreOsmdMeasure {
    staffEntries?: ScoreOsmdStaffEntry[];
    ParentMusicSystem: ScoreOsmdSystem;
    parentSourceMeasure: { AbsoluteTimestamp: { RealValue: number }; Duration: { RealValue: number } };
    PositionAndShape: { AbsolutePosition: { x: number }; Size: { width: number } };
    beginInstructionsWidth?: number;
}
interface ScoreOsmdStaffLine {
    Measures: ScoreOsmdMeasure[];
    AbstractExpressions?: { lines?: { SVGElement?: SVGElement }[]; expression?: { dynamicType?: number | null } }[];
    PositionAndShape: { RelativePosition: { y: number } };
    StaffHeight: number;
}
interface ScoreOsmdSystem { StaffLines: ScoreOsmdStaffLine[]; PositionAndShape: { AbsolutePosition: { y: number } } }
interface ScoreOsmdSheet {
    MusicPages: { PageNumber: number; MusicSystems: ScoreOsmdSystem[] }[];
    MeasureList: (ScoreOsmdMeasure | undefined)[][];
    title?: ScoreOsmdLabel; subtitle?: ScoreOsmdLabel; composer?: ScoreOsmdLabel; lyricist?: ScoreOsmdLabel; copyright?: ScoreOsmdLabel;
}
function isScoreOsmdSheet(v: unknown): v is ScoreOsmdSheet {
    return typeof v === 'object' && v !== null && 'MusicPages' in v && Array.isArray(v.MusicPages) && 'MeasureList' in v && Array.isArray(v.MeasureList);
}
// A marking's inked area in screen pixels: left, right, top, bottom.
interface ScoreInkBox { l: number; r: number; t: number; b: number }
// Chord fingerings stacked one above the other must never touch: each column is re-stacked from the notes outwards,
// clear of its noteheads, stems and the digits already placed on that staff, above or below as OSMD chose.
function scoreFixFingerings(box: HTMLElement, engine: import('./notation.js').ScoreRenderer | null) {
    const sheet = engine && engine.readLayout().graphicSheet, gs = isScoreOsmdSheet(sheet) ? sheet : null;
    if (!gs || !box)
        return;
    const ink = (r: DOMRect): ScoreInkBox => ({ l: r.left + r.width * .08, r: r.right - r.width * .08, t: r.top + r.height * .18, b: r.bottom - r.height * .2 });
    const crossX = (a: ScoreInkBox, b: ScoreInkBox) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > .5;
    gs.MusicPages.forEach((pg) => pg.MusicSystems.forEach((sys) => sys.StaffLines.forEach((sl) => {
        const placed: ScoreInkBox[] = [];
        sl.Measures.forEach((gm) => (gm.staffEntries || []).forEach((gse) => {
            const labels = (gse.FingeringEntries || []).map((f) => f.SVGNode).filter((n): n is SVGElement => !!n && !!n.ownerSVGElement);
            if (!labels.length)
                return;
            const obstacles: ScoreInkBox[] = [];
            let mid = 0, nh = 0;
            (gse.graphicalVoiceEntries || []).forEach((gve) => {
                const vf = gve.vfStaveNote || gve.mVexFlowStaveNote, g = (vf && vf.getAttribute && vf.getAttribute('el')) || (gve.notes || []).map((n) => n.getSVGGElement && n.getSVGGElement()).find(Boolean);
                if (!g || !g.querySelectorAll)
                    return;
                g.querySelectorAll('.vf-notehead').forEach((h) => { const r = h.getBoundingClientRect(); if (!r.width)
                    return; obstacles.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); mid += r.top + r.height / 2; nh++; });
                g.querySelectorAll('.vf-stem').forEach((s) => { const r = s.getBoundingClientRect(); if (r.height)
                    obstacles.push({ l: r.left - 1, r: r.right + 1, t: r.top, b: r.bottom }); });
            });
            if (!nh)
                return;
            mid /= nh;
            const svg = labels[0].ownerSVGElement, ctm = svg && svg.getScreenCTM();
            if (!ctm || !ctm.d)
                return;
            const gap = Math.max(1, ctm.d * 2.5), cap = ctm.d * 40; // about 0.25 and 4 staff spaces in screen pixels
            const items = labels.map((n) => { const r = n.getBoundingClientRect(); return { n, box: ink(r), up: r.top + r.height / 2 < mid }; });
            for (const up of [true, false]) {
                items.filter((it) => it.up === up).sort((a, b) => up ? b.box.b - a.box.b : a.box.t - b.box.t).forEach((it) => {
                    let dy = 0;
                    for (let k = 0; k < 16; k++) {
                        const bx = { l: it.box.l, r: it.box.r, t: it.box.t + dy, b: it.box.b + dy };
                        const hit = [...obstacles, ...placed].find((o) => crossX(bx, o) && bx.b + gap > o.t && bx.t - gap < o.b);
                        if (!hit)
                            break;
                        dy += up ? hit.t - gap - bx.b : hit.b + gap - bx.t;
                    }
                    if (Math.abs(dy) > cap)
                        dy = Math.sign(dy) * cap;
                    if (Math.abs(dy) > .25)
                        scoreShiftY(it.n, dy / ctm.d);
                    placed.push({ l: it.box.l, r: it.box.r, t: it.box.t + dy, b: it.box.b + dy });
                });
            }
        }));
    })));
    // OSMD sometimes prints the same words twice in one spot ("dolce" over "dolce"): keep one. A chord symbol raised over the
    // upper staff must not sit on the words there ("dolce", "rit."): the words move above it.
    const chords = new Set<Element>(), fings = new Set<Element>();
    gs.MeasureList.forEach((list) => (list || []).forEach((gm) => gm && (gm.staffEntries || []).forEach((gse) => { (gse.graphicalChordContainers || []).forEach((c) => { const n = c.GraphicalLabel && c.GraphicalLabel.SVGNode; if (n)
        chords.add(n); }); (gse.FingeringEntries || []).forEach((f) => { if (f.SVGNode)
        fings.add(f.SVGNode); }); })));
    box.querySelectorAll('svg').forEach((svg) => {
        const ctm = svg.getScreenCTM();
        if (!ctm || !ctm.d)
            return;
        const kept: { s: string; r: DOMRect; }[] = [], chordBoxes: ScoreInkBox[] = [], words: { x: SVGTextElement; b: ScoreInkBox; }[] = [];
        svg.querySelectorAll('text').forEach((x) => {
            const r = x.getBoundingClientRect(), s = (x.textContent ?? '').trim();
            if (!s || !r.width)
                return;
            if (kept.some((k) => k.s === s && Math.abs(k.r.left - r.left) < 3 && Math.abs(k.r.top - r.top) < 3)) {
                x.remove();
                return;
            }
            kept.push({ s, r });
            if ([...chords].some((c) => c === x || c.contains(x)))
                chordBoxes.push(ink(r));
            else if (![...fings].some((f) => f === x || f.contains(x)) && !x.closest('.measure-number'))
                words.push({ x, b: ink(r) });
        });
        words.forEach(({ x, b }) => {
            const hit = chordBoxes.find((c) => crossX(b, c) && b.b + ctm.d * 5 > c.t && b.t < c.b);
            if (!hit || b.t > hit.t)
                return;
            scoreShiftY(x, (hit.t - ctm.d * 5 - b.b) / ctm.d);
        });
    });
}
// Adds to any vertical shift already applied, so the pass can run again on a page it has already tidied.
function scoreShiftY(n: Element, dy: number) { const m = /^translate\(0 (-?[\d.]+)\)$/.exec(n.getAttribute('transform') || ''); n.setAttribute('transform', `translate(0 ${((m ? +m[1] : 0) + dy).toFixed(2)})`); }
// Every marking on the page that the hover can explain: its box (relative to its page, which only moves as a whole), kind and value.
const SC_DYN = /^(ppp|pp|p|mp|mf|f|ff|fff|sfz|fz|rfz|fp|sf|sfp)$/;
const SC_TERMS = [['dolcissimo'], ['dolce'], ['espressivo', 'espress\\.?', 'espr\\.'], ['cantabile'], ['legato'], ['leggiero', 'leggero'], ['sostenuto', 'sost\\.'],
    ['ritardando', 'ritard\\.', 'rit\\.?'], ['rallentando', 'rall\\.'], ['accelerando', 'accel\\.'], ['atempo', 'a tempo'], ['rubato'], ['crescendo', 'cresc\\.'], ['diminuendo', 'decrescendo', 'dim\\.', 'decresc\\.'],
    ['poco'], ['piu', 'più'], ['molto'], ['sempre'], ['sim', 'simile', 'sim\\.'], ['grave'], ['largo'], ['larghetto'], ['lento'], ['adagio'], ['andantino'], ['andante'], ['moderato'], ['allegretto'], ['allegro'], ['vivace'], ['presto']]
    .map(([k, ...alts]) => ({ k, re: new RegExp('(^|[^\\p{L}])(' + (alts.length ? alts : [k]).join('|') + ')(?=$|[^\\p{L}])', 'iu') }));
const SC_ARTS = { 'a.': 'staccato', 'av': 'staccatissimo', 'a>': 'accent', 'a^': 'marcato', 'a-': 'tenuto', 'a@a': 'fermata', 'a@u': 'fermata', 'a@s': 'fermata', 'a@l': 'fermata', 'a@as': 'fermata', 'a@us': 'fermata',
    tr: 'trill', mordent: 'mordent', mordent_inverted: 'mordent', turn: 'turn', turn_inverted: 'turn', prallprall: 'trill', upprall: 'trill' };
// A rest's value: its written length and dots.
interface ScoreRestSym { type: string; dots: number }
// A box given directly, where no element carries the marking (an arpeggio's wavy line).
type ScoreSymRect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
// A marking the hover can explain: its element, kind and value, boxed relative to its page.
interface ScoreSym { kind: string | undefined; val: string | ScoreRestSym; el: Element | null; loose: boolean; page: Element; x0: number; y0: number; x1: number; y1: number }
// A lookup-table key check, so a value read from the engraving can index one of the tables here.
function scoreHasKey<T extends object>(table: T, key: PropertyKey): key is keyof T { return Object.prototype.hasOwnProperty.call(table, key); }
function scoreSyms(engine: import('./notation.js').ScoreRenderer | null) {
    const sheet = engine && engine.readLayout().graphicSheet;
    const box = byId('an-roll'), list: ScoreSym[] = [], gs = isScoreOsmdSheet(sheet) ? sheet : null;
    SCORE.syms = list;
    scoreTip(null);
    if (!gs)
        return;
    const pageRects = new Map<Element, DOMRect>(), pageOf = (el: Element | null | undefined) => el && el.closest && el.closest('[id^="osmdCanvasPage"]');
    const add = (el: Element | null, kind: string | undefined, val: string | ScoreRestSym = '', rect?: ScoreSymRect | null, loose = true, ref?: Element) => {
        const r = rect || (el && el.getBoundingClientRect()), page = pageOf(el || ref);
        if (!r || (!r.width && !r.height) || !page)
            return;
        if (!pageRects.has(page))
            pageRects.set(page, page.getBoundingClientRect());
        const pr = pageRects.get(page) || page.getBoundingClientRect();
        const i = list.length;
        list.push({ kind, val, el, loose, page, x0: r.left - pr.left, y0: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top });
        if (el instanceof HTMLElement || el instanceof SVGElement) {
            el.dataset.sym = String(i);
            el.style.cursor = 'help';
            el.tabIndex = 0;
            el.setAttribute('aria-label', scoreSymText({ kind, val }).line);
        }
    };
    const seen = new Set<Element>(); // the title block is not a marking
    (['title', 'subtitle', 'composer', 'lyricist', 'copyright'] as const).forEach((k) => { const n = gs[k] && gs[k].SVGNode; if (n) {
        seen.add(n);
        if (n.querySelectorAll)
            n.querySelectorAll('text').forEach((x) => seen.add(x));
    } });
    gs.MusicPages.forEach((pg) => pg.MusicSystems.forEach((sys) => sys.StaffLines.forEach((sl) => {
        (sl.AbstractExpressions || []).forEach((e) => (e.lines || []).forEach((l) => { const g = l.SVGElement; if (!g || !e.expression || e.expression.dynamicType == null)
            return; seen.add(g); add(g, e.expression.dynamicType === 0 ? 'cresc' : 'dim'); }));
        sl.Measures.forEach((gm) => (gm.staffEntries || []).forEach((gse) => {
            (gse.FingeringEntries || []).forEach((f) => { const n = f.SVGNode; if (!n)
                return; n.querySelectorAll('text').forEach((x) => seen.add(x)); add(n, 'finger', (f.Label && f.Label.text || n.textContent || '').trim()); });
            (gse.graphicalChordContainers || []).forEach((c) => { const lb = c.GraphicalLabel, n = lb && lb.SVGNode; if (!n)
                return; n.querySelectorAll('text').forEach((x) => seen.add(x)); if (n.localName === 'text')
                seen.add(n); add(n, 'chord', (lb && lb.Label && lb.Label.text || n.textContent || '').trim()); });
            (gse.graphicalVoiceEntries || []).forEach((gve) => {
                const vf = gve.vfStaveNote || gve.mVexFlowStaveNote, el = vf && vf.getAttribute && vf.getAttribute('el');
                // Rests are notation, not playable notes: bind their glyphs here, never in AN.notes or scoreBind.
                (gve.notes || []).forEach((n) => {
                    const src = n.sourceNote;
                    if (!src || !src.isRest() || src.PrintObject === false)
                        return;
                    const heads = n.getNoteheadSVGs ? n.getNoteheadSVGs() : [], g = heads[0] || (n.getSVGGElement && n.getSVGGElement());
                    if (!g)
                        return;
                    const restNames = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th', 128: '128th', 256: '256th', b: 'breve' }, dur = vf && vf.duration;
                    const type = src.TypeLength && src.TypeLength.RealValue === 0 ? 'measure' : ((dur != null && scoreHasKey(restNames, dur) ? restNames[dur] : undefined) || 'other');
                    add(g, 'rest', { type, dots: src.DotsXml || 0 });
                });
                const mg = el && el.querySelector && el.querySelector('.vf-modifiers');
                if (!mg || !vf || !vf.modifiers)
                    return;
                const paths = [...mg.children], mods = vf.modifiers, shown = paths.length === mods.length ? mods : mods.filter((m) => /articulation|ornament/i.test(m.getCategory ? m.getCategory() : ''));
                if (paths.length !== shown.length)
                    return;
                shown.forEach((m, k) => { const kind = scoreHasKey(SC_ARTS, m.type) ? SC_ARTS[m.type] : undefined; if (kind)
                    add(paths[k], kind, ''); });
            });
        }));
    })));
    box.querySelectorAll('.vf-sc-pedal').forEach((g) => [...g.querySelectorAll('path')].forEach((p) => { const r = p.getBoundingClientRect(); if (r.width)
        add(p, r.width > r.height * 1.3 ? 'ped' : 'pedup', '', r); }));
    box.querySelectorAll('svg text').forEach((x) => {
        if (seen.has(x) || x.closest('.measure-number'))
            return;
        const s = (x.textContent || '').replace(/\s+/g, ' ').trim();
        if (!s)
            return;
        const r = x.getBoundingClientRect();
        if (SC_DYN.test(s))
            add(x, 'dyn', s, r);
        else if (/^[A-Z][0-9]?$/.test(s) && x.closest('.vf-measure'))
            add(x, 'rehearsal', s, r);
        else if (scoreTermParts(s).length)
            add(x, 'text', s, r);
    });
    box.querySelectorAll('svg .vf-curve').forEach((g) => add(g, 'slur', '', null, false));
    box.querySelectorAll('svg .vf-stavetie').forEach((g) => add(g, 'tie', '', null, false));
    box.querySelectorAll('svg .sc-xline').forEach((p) => add(p, p instanceof SVGElement ? p.dataset.kind : undefined, '', null, false));
    box.querySelectorAll('svg .vf-clef').forEach((g) => { const r = g.getBoundingClientRect(), q = r.height / Math.max(1, r.width); add(g, q > 1.9 ? 'clef_g' : q < 1.25 ? 'clef_f' : 'clef_c', '', r); });
    const beatAt = (r: DOMRect) => {
        const g: ScoreGeometry | null = SCORE.geo;
        if (!g)
            return null;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const m of g.measures) {
            if (!m)
                continue;
            const sy = g.systems[m.sys], pe = g.pages[sy.page];
            if (!pe)
                continue;
            const pr = pe.getBoundingClientRect(), ux = (cx - pr.left) / g.scale, uy = (cy - pr.top) / g.scale;
            if (ux >= m.x0 - .2 && ux <= m.x1 && uy >= sy.top - 3 && uy <= sy.bottom + 3)
                return m.b0;
        }
        return null;
    };
    box.querySelectorAll('svg .vf-keysignature').forEach((g) => { const r = g.getBoundingClientRect(), b = beatAt(r); if (b != null)
        add(g, 'key', anKeyName(anKeyAt(b + .001)), r); });
    box.querySelectorAll('svg .vf-timesignature').forEach((g) => { const r = g.getBoundingClientRect(), b = beatAt(r); if (b == null)
        return; const m = anMeasures().find((x) => x.start <= b + .001 && x.end > b + .001); if (m)
        add(g, 'time', m.num + '/' + m.den, r); });
    // An arpeggio's wavy line stands just left of its chord.
    const rolls = new Map<string, number[]>();
    AN.notes.forEach((n, i) => { if (!n.arpeggiate)
        return; const k = n.staff + ':' + n.start; if (!rolls.has(k))
        rolls.set(k, []); (rolls.get(k) || []).push(i); });
    rolls.forEach((ix) => {
        const rs = ix.flatMap((i) => { const hs: Element[] = SCORE.heads.get(i) || []; return hs.map((g) => g.getBoundingClientRect()); }).filter((r) => r.width);
        if (!rs.length)
            return;
        const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), b = Math.max(...rs.map((r) => r.bottom)), w = rs[0].width, h0: Element[] = SCORE.heads.get(ix[0]) || [];
        add(null, 'arpeggio', '', { left: l - w * 1.4, right: l - w * .15, top: t - w * .3, bottom: b + w * .3, width: w, height: b - t }, true, h0[0]);
    });
}
function scoreTermParts(s: string) {
    const out: { at: number; k: string; n?: string }[] = [];
    SC_TERMS.forEach(({ k, re }) => { const m = re.exec(s); if (m)
        out.push({ at: m.index + m[1].length, k }); });
    const metro = /[\u2669\u266A\u266B\u266C\uD834]\S*\s*\.?\s*=\s*(\d+)/.exec(s);
    if (metro)
        out.push({ at: metro.index, k: 'metro', n: metro[1] });
    return out.sort((a, b) => a.at - b.at).filter((p, i, a) => !(p.k === 'dolce' && a.some((q) => q.k === 'dolcissimo'))).map((p) => p.k === 'metro' ? t('sym_metro', p.n ?? '') : t('sym_t_' + p.k));
}
// "Name — meaning": the tooltip heads with the symbol as printed (or its name) and #an-hover reads it as one line.
function scoreSymText(sym: { kind: string | undefined; val: string | ScoreRestSym; }) {
    const split = (s: string) => { const i = s.indexOf(' — '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 3)]; };
    const k = sym.kind, v = sym.val;
    if (typeof v !== 'string') { // only a rest's value is not text
        const name = t('sym_rest_' + v.type), raw = v.dots === 1 ? t('sym_rest_dotted', name) : v.dots > 1 ? t('sym_rest_dots', name, v.dots) : name, head = raw[0].toLocaleUpperCase(lang) + raw.slice(1);
        const body = t(v.type === 'measure' ? 'sym_rest_measure_body' : 'sym_rest_body');
        return { head, body, line: head + ' — ' + body };
    }
    if (k === 'text') {
        const parts = scoreTermParts(v);
        return { head: v, body: parts.join(' · '), line: v + ' · ' + parts.join(' · ') };
    }
    let full: string;
    if (k === 'dyn')
        full = t('sym_dyn_' + (v === 'sf' ? 'sfz' : v === 'sfp' ? 'fp' : v));
    else if (k === 'finger') {
        const ds: string[] = (v.match(/[1-5]/g) || []);
        full = ds.length > 1 ? t('sym_finger_sub', ds.join(', '), ds.map((d: string) => d + ' = ' + t('sym_f' + d)).join(', ')) : ds.length ? t('sym_finger', ds[0], t('sym_f' + ds[0])) : t('sym_finger', '?', '?');
    }
    else if (k === 'rehearsal')
        full = t('sym_rehearsal');
    else if (k === 'key')
        full = t('sym_key', v);
    else if (k === 'time') {
        const [a, b] = v.split('/');
        full = t('sym_time', a, b);
    }
    else if (k === 'chord')
        full = t('sym_chord');
    else
        full = t('sym_' + k);
    const [name, body] = split(full), lit = k !== undefined && ['dyn', 'finger', 'rehearsal', 'time', 'chord'].includes(k) ? v : '';
    return { head: lit ? lit + ' · ' + name : name, body, line: (lit ? lit + ' · ' : '') + full };
}
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
// Score geometry in OSMD units, relative to each page: a system's vertical extent, a measure's span and beats,
// and the onset anchors the playback cursor moves between.
interface ScoreGeoSystem { page: number; top: number; bottom: number }
interface ScoreGeoMeasure { sys: number; x0: number; xn: number; x1: number; xs: number; cx: number; b0: number; b1: number }
interface ScoreGeoAnchor { beat: number; x: number; sys: number; end?: boolean }
interface ScoreGeometry { scale: number; pages: (HTMLElement | null)[]; systems: ScoreGeoSystem[]; measures: (ScoreGeoMeasure | undefined)[]; anchors: ScoreGeoAnchor[] }
// OSMD's iterator lists the voice entries drawn at its position; the bundled type leaves that method out.
function scoreVisibleEntries(it: object): readonly unknown[] {
    if (!('CurrentVisibleVoiceEntries' in it) || typeof it.CurrentVisibleVoiceEntries !== 'function')
        return [];
    const list: unknown = it.CurrentVisibleVoiceEntries();
    return Array.isArray(list) ? list : [];
}
// Geometry in OSMD units (one staff space) relative to each page: systems, measures and the onset anchors the cursor moves between.
function scoreGeo(engine: import('./notation.js').ScoreRenderer) {
    const sheet = engine.readLayout().graphicSheet;
    if (!isScoreOsmdSheet(sheet))
        return;
    const gs = sheet, geo: ScoreGeometry = { scale: 10 * engine.getZoom(), pages: [], systems: [], measures: [], anchors: [] }, sysIdx = new Map<unknown, number>();
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
    // A measure's rail starts at its first onset when present, otherwise just after its instructions.
    // This preserves the downbeat connection while the cursor advances at one steady visual pace within the bar.
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
// Fixed-width bars use one steady rail per bar; natural-width bars move between the drawn note onsets.
function scoreCursorEl(): HTMLElement { const cur: HTMLElement | null = SCORE.cursorEl; if (cur)
    return cur;
    const el = (document).createElement('div');
    el.className = 'sc-cursor';
    el.setAttribute('aria-hidden', 'true');
    SCORE.cursorEl = el;
    return el; }
// Where the playback cursor stands: x in OSMD units on system `sys`.
interface ScoreCursorPos { x: number; sys: number }
function scoreCursorAt(beat: number): ScoreCursorPos | null {
    const g: ScoreGeometry | null = SCORE.geo, M = g && g.measures;
    if (!g || !M || !M.length)
        return null;
    let i = M.findIndex((m: ScoreGeoMeasure | undefined) => m && beat < m.b1 - 1e-9);
    if (i < 0)
        i = M.length - 1;
    const m = M[i];
    if (!m)
        return null;
    if (!SCORE.fixedWidth) {
        const p = scoreAnchorAt(g.anchors, beat, m.sys);
        if (p)
            return p;
    }
    const n = M[i + 1], x0 = m.cx ?? m.xs, x1 = n && n.sys === m.sys ? (n.cx ?? n.xs) : m.x1 - .9;
    const t0 = scoreSeconds(m.b0), t1 = scoreSeconds(m.b1), at = Math.min(t1, Math.max(t0, scoreSeconds(beat)));
    const f = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
    return { x: x0 + (x1 - x0) * f, sys: m.sys };
}
// Between the last onset at or before the beat and the next one on the same system, timed by the tempo map.
function scoreAnchorAt(A: ScoreGeoAnchor[], beat: number, sys: number): ScoreCursorPos | null {
    if (!A || !A.length)
        return null;
    let lo = 0, hi = A.length - 1, k = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (A[mid].beat <= beat + 1e-9) {
            k = mid;
            lo = mid + 1;
        }
        else
            hi = mid - 1;
    }
    while (k >= 0 && A[k].sys !== sys)
        k--;
    if (k < 0)
        return null;
    const a = A[k];
    let b: ScoreGeoAnchor | null = null;
    for (let j = k + 1; j < A.length; j++) {
        if (A[j].beat > a.beat + 1e-9) {
            if (A[j].sys === sys)
                b = A[j];
            break;
        }
    }
    if (!b)
        return null;
    const t0 = scoreSeconds(a.beat), t1 = scoreSeconds(b.beat), at = Math.min(t1, Math.max(t0, scoreSeconds(beat))), f = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
    return { x: a.x + (b.x - a.x) * f, sys };
}
function scoreCursorUpdate(follow: boolean) {
    const el = scoreCursorEl(), g: ScoreGeometry | null = SCORE.geo, p = g && AN.notes.length && FALL.mode === 'score' ? scoreCursorAt(scoreBeatAt(fallTime())) : null, s = g && p ? g.systems[p.sys] : null, page = g && s ? g.pages[s.page] : null;
    if (!g || !p || !s || !page) {
        el.remove();
        return;
    }
    if (el.parentNode !== page)
        page.appendChild(el);
    const w = Math.max(1.5, Math.min(3, 2 * SCORE.zoom)), pad = 2 * g.scale; // 2 px at 100%
    el.style.width = w.toFixed(1) + 'px';
    el.style.borderLeftWidth = w.toFixed(1) + 'px';
    el.style.height = ((s.bottom - s.top) * g.scale + 2 * pad).toFixed(1) + 'px';
    el.style.transform = 'translate(' + (p.x * g.scale - w / 2).toFixed(1) + 'px,' + (s.top * g.scale - pad).toFixed(1) + 'px)';
    el.classList.toggle('is-playing', SCORE.playing);
    if (follow)
        scoreCursorFollow(p, s, page, g);
}
// Keep the cursor in view: vertically by system in page view, horizontally in continuous view.
function scoreCursorFollow(p: ScoreCursorPos, s: ScoreGeoSystem, page: HTMLElement, g: ScoreGeometry) {
    const box = byId('an-roll'), b = box.getBoundingClientRect(), r = page.getBoundingClientRect(), now = performance.now(), behavior = reduceMotion() ? 'auto' : 'smooth';
    if (!b.height)
        return;
    if (SCORE.layout === 'cont') {
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
    SCORE.followSys = p.sys;
}
// Bars chosen on the score: the anchor bar, the span a..b (measure indices) and the selected notes it held.
interface ScoreMeasureRange { anchor: number; a: number; b: number; sig: string }
// A running loop: score-time span a..b in seconds, its bar count, whether it is the A–B range, the pass and when the next one starts.
interface ScoreLoopState { a: number; b: number; bars: string | undefined; ab: boolean; pass: number; notes: PracticeTimedNote[]; next: number }
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
const reduceMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    SCORE.playing = false;
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
    scoreUnlight();
    FALL.lastT = null;
    FALL.particles = [];
    FALL.flashes = [];
    SCORE.playGen++;
    SCORE.timers.forEach(clearTimeout);
    SCORE.timers = [];
    stopPreviews();
}
function scoreIdle() { scoreStateText(); anUpdateControls(); anKeysPaint(); fallDraw(); scoreCursorUpdate(true); anStatusPos(); }
// Where Stop returns to: the start of the selected bars or notes, else the beginning.
function anSelStart() {
    const g: ScoreGeometry | null = SCORE.geo, R: ScoreMeasureRange | null = SCORE.mrange, m = R && g && g.measures[R.a];
    if (m)
        return scoreSeconds(m.b0);
    return AN.selected.size ? Math.min(...[...AN.selected].map((i) => scoreSeconds(AN.notes[i].start))) : 0;
}
function scoreStop() { scoreHalt(); SCORE.resume = null; FALL.position = AN.notes.length ? anSelStart() : 0; scoreIdle(); }
function scorePause() { if (!SCORE.playing)
    return; const at = fallTime(), sel = SCORE.sel && !SCORE.loop; scoreHalt(); SCORE.paused = true; SCORE.resume = { sel }; FALL.position = at; scoreIdle(); }
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
    scorePlay(!!(r && r.sel && AN.selected.size), FALL.position);
}
function scoreHome() {
    if (!AN.notes.length)
        return;
    if (SCORE.playing && !SCORE.loop) {
        scorePlay(false, 0);
        return;
    }
    scoreHalt();
    SCORE.resume = null;
    FALL.position = 0;
    scoreIdle();
    if (FALL.mode === 'score')
        byId('an-roll').scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
/* practice engine: playback runs on audio-clock segments, score time t = t0 + (now − a0)·f.
   A loop queues its next pass as a new segment ahead of time; "Wait for me" freezes the clock at a barrier (the next note of
   the practised hand) until those keys are played. Notes are scheduled ~0.3 s ahead by a 25 ms tick. */
// Judgements counted in a practice run, and the share of notes hit in the current and the last loop pass.
interface PracticeStats { perfect: number; good: number; miss: number; wrong: number; streak: number; best: number; passHit: number; passAll: number; lastPass: number | null }
// The parts of an analysed note that practice playback reads.
// A note on the playback clock: its index i in AN.notes and its start, written end and sounding end in score seconds.
interface PracticeTimedNote { n: AnNote; i: number; start: number; finish: number; sound?: number }
// One stretch of the audio clock: score time t = t0 + (now − a0)·f, until t1.
interface PracticeSegment { a0: number; t0: number; t1: number; f: number; first: boolean }
// "Wait for me": the clock stops at t until every key in need has been played.
interface PracticeBarrier { t: number; need: Set<number>; got: Set<number>; group: PracticeTimedNote[]; seg: PracticeSegment; since: number }
interface PracticeBeat { t: number; acc: boolean }
interface PracticeCountIn { t: number; n: number; sec: number }
interface PracticeStartOptions { notes: PracticeTimedNote[]; a: number; b: number; loop: boolean; sel: boolean; from: number; ab?: boolean; bars?: string }
// A running practice: its clock segments, scheduling cursors (ni notes, bi beats, mi my next note), the judgements and the tick timer.
interface PracticeRun extends PracticeStartOptions {
    segs: PracticeSegment[]; ni: number; beats: PracticeBeat[]; bi: number; beat0: number; wt: number; pass: number; mine: PracticeTimedNote[]; mi: number;
    judged: Map<number, string>; gen: number; ci: PracticeCountIn | null; timer: ReturnType<typeof setInterval> | 0; waitShown?: boolean;
}
// The coaching tip shown after a run, with its optional one-click action.
interface PracticeNextStep { k: string; args?: () => (string | number)[]; act?: { k: string; args?: () => (string | number)[]; run: () => void } | null }
interface PracticeState {
    hands: string; wait: boolean; metro: boolean; countIn: boolean; acc: boolean; hear: boolean; ramp: boolean; A: number | null; B: number | null;
    labels: string; pal: string; range: string; fx: boolean; bar: PracticeBarrier | null; active: boolean; stats: PracticeStats | null;
    res: Map<number, string>; judge: string; judgeT: number; next: PracticeNextStep | null;
}
const PRAC: PracticeState = { hands: 'both', wait: false, metro: false, countIn: false, acc: true, hear: true, ramp: false, A: null, B: null, labels: 'letter', pal: 'etude', range: 'fit', fx: true,
    bar: null, active: false, stats: null, res: new Map(), judge: '', judgeT: 0, next: null };
const PRAC_FLAGS = ['wait', 'metro', 'countIn', 'acc', 'hear', 'ramp', 'fx'] as const;
const PRAC_CHOICES = ['hands', 'labels', 'pal', 'range'] as const;
function isPracFlag(k: string): k is typeof PRAC_FLAGS[number] { return PRAC_FLAGS.some((f) => f === k); }
function isPracChoice(k: string): k is typeof PRAC_CHOICES[number] { return PRAC_CHOICES.some((f) => f === k); }
const PRAC_KEY = 'etude-practice-v3';
function pracSave() { try {
    const { hands, wait, metro, countIn, acc, hear, ramp, labels, pal, range, fx } = PRAC;
    localStorage.setItem(PRAC_KEY, JSON.stringify({ hands, wait, metro, countIn, acc, hear, ramp, labels, pal, range, fx, zoom: FALL.zoom }));
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
const pracMine = (n: AnNote) => PRAC.hands === 'both' || anHandOf(n) === PRAC.hands;
// My part sounds only when I am not being waited for; the other hand is the accompaniment (or muted).
const pracSounds = (n: AnNote) => pracMine(n) ? PRAC.hear && !PRAC.wait : PRAC.acc;
const pracFactor = () => +(selectById('score-speed').value || 100) / 100;
function pracSegAt(R: { segs: PracticeSegment[] }, now: number) { let s = R.segs[0]; for (const x of R.segs)
    if (x.a0 <= now + 1e-9)
        s = x; return s; }
function pracRaw(R: { segs: PracticeSegment[] }, now: number) { const s = pracSegAt(R, now); return { s, t: s.t0 + Math.max(0, now - s.a0) * s.f }; }
function pracBeats() {
    if (FALL.beatSrc === fallData() && FALL.beatTempo === SCORE.tempoList && FALL.beats)
        return FALL.beats;
    const out: PracticeBeat[] = [];
    for (const m of anMeasures()) {
        const u = anBeatUnit(m);
        let k = 0;
        for (let b = m.start; b < m.end - 1e-6; b += u, k++)
            out.push({ t: scoreSeconds(b), acc: k === 0 });
    }
    FALL.beatSrc = fallData();
    FALL.beatTempo = SCORE.tempoList;
    FALL.beats = out;
    return out;
}
function pracStatsReset() {
    PRAC.stats = { perfect: 0, good: 0, miss: 0, wrong: 0, streak: 0, best: 0, passHit: 0, passAll: 0, lastPass: null };
    PRAC.active = PRAC.wait;
    PRAC.judge = '';
    const old = [...PRAC.res.keys()];
    PRAC.res = new Map();
    old.forEach(scorePaintIdx);
    pracHud();
}
function pracAcc(st: PracticeStats) { const all = st.perfect + st.good + st.miss + st.wrong; return all ? (st.perfect + st.good) / all : null; }
async function pracStart(o: PracticeStartOptions)  {
    scoreHalt();
    SCORE.resume = null;
    ensureAudio();
    const gen = SCORE.playGen;
    FALL.position = o.from;
    scoreIdle();
    const soundMidis = [...new Set(o.notes.flatMap((d) => [d.n.midi, ...(d.n.graces || []).map((g) => g.midi)]))];
    if (!await pianoEnsure(soundMidis) || gen !== SCORE.playGen || !actx)
        return;
    const f = pracFactor(), now = actx.currentTime + .1;
    let a0 = now, ci: PracticeCountIn | null = null;
    if (PRAC.countIn) {
        const beat = scoreBeatAt(o.from), m = anMeasureAt(beat) || { num: 4, den: 4 }, u = anBeatUnit(m), n = Math.max(2, Math.round(m.num * 4 / m.den / u)), sec = u * 60 / anTempoAt(beat) / f;
        for (let k = 0; k < n; k++)
            metroClick(now + k * sec, k === 0);
        ci = { t: now, n, sec };
        a0 = now + n * sec;
    }
    const beats: PracticeBeat[] = pracBeats(), first = (t: number) => { const i = beats.findIndex((b) => b.t >= t - 1e-6); return i < 0 ? beats.length : i; };
    const mine = o.notes.filter((d) => pracMine(d.n));
    const R: PracticeRun = { ...o, segs: [{ a0, t0: o.from, t1: o.b, f, first: true }], ni: 0, beats, bi: first(o.from), beat0: first(o.a), wt: o.from, pass: 1, mine, mi: Math.max(0, mine.findIndex((d) => d.start >= o.from - 1e-6)), judged: new Map(), gen, ci, timer: 0 };
    if (R.mi < 0 || !mine.some((d) => d.start >= o.from - 1e-6))
        R.mi = mine.length;
    SCORE.run = R;
    SCORE.playing = true;
    SCORE.sel = o.sel;
    const loop: ScoreLoopState | null = o.loop ? { a: o.a, b: o.b, bars: o.bars, ab: !!o.ab, pass: 1, notes: o.notes, next: a0 + (o.b - o.a) / f } : null;
    SCORE.loop = loop;
    FALL.origin = o.from;
    FALL.audioStart = a0;
    FALL.factor = f;
    SCORE.followSys = -1;
    pracStatsReset();
    pracTick();
    R.timer = setInterval(pracTick, 25);
    scoreStateText();
    anUpdateControls();
    fallDraw();
    scoreFollow();
}
function pracTick() {
    const R = SCORE.run;
    if (!R || !SCORE.playing || !actx || R.gen !== SCORE.playGen)
        return;
    const now = actx.currentTime, H = now + .3;
    for (let guard = 0; guard < 4; guard++) {
        const s = R.segs[R.segs.length - 1];
        if (PRAC.wait && !PRAC.bar && R.wt !== Infinity)
            pracNextBar(R, s);
        const B: PracticeBarrier | null = PRAC.bar && PRAC.bar.seg === s ? PRAC.bar : null, at = (x: number) => s.a0 + (x - s.t0) / s.f;
        const horizon = s.t0 + Math.max(0, H - s.a0) * s.f, lim = Math.min(horizon, s.t1, B ? B.t : Infinity);
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
            const st = Math.max(d.start, s.t0), en = R.loop ? Math.min(sound, s.t1) : sound, roll = d.n.roll || 0, onset = at(st) + roll;
            const opt = { warm: !!d.n.warm, hold: !!d.n.pedalEnd && d.n.soundEnd !== undefined && d.n.soundEnd > d.n.end + .001 }, graces = st > d.start + 1e-6 ? [] : (d.n.graces || []), duration = Math.max(.05, (en - st) / s.f - roll);
            let carried = false;
            graces.forEach((g, i) => {
                const when = onset - (graces.length - i) * .07, start = Math.max(now, when), carry = i === graces.length - 1 && g.tiedToPrincipal && g.midi === d.n.midi;
                if (carry) {
                    previewNote(g.midi, start, Math.max(.05, onset + duration - start), g.vel ?? d.n.vel, opt);
                    carried = true;
                }
                else if (when + .065 > now - .01)
                    previewNote(g.midi, start, .065, g.vel ?? Math.max(1, d.n.vel - 8), opt);
            });
            if (!carried)
                previewNote(d.n.midi, onset, duration, d.n.vel, opt);
        }
        while (R.bi < R.beats.length && R.beats[R.bi].t < lim) {
            const b = R.beats[R.bi++];
            if (PRAC.metro && b.t >= s.t0 - 1e-6 && b.t < s.t1 - 1e-6)
                metroClick(Math.max(now, at(b.t)), b.acc);
        }
        if (R.loop && !B && horizon >= s.t1) {
            const next = { a0: at(s.t1), t0: R.a, t1: R.b, f: pracRamp(R, s), first: false }, L: ScoreLoopState | null = SCORE.loop;
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
        R.segs.shift();
        pracPassEnd(R);
    }
    const time = fallTime();
    if (PRAC.active && !PRAC.wait)
        pracMisses(R, time);
    const s0 = R.segs[0];
    if (!R.loop && time >= R.b - 1e-6 && now >= s0.a0 + (R.b - s0.t0) / s0.f + .3)
        pracFinish(R);
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
    return next / 100;
}
function pracPassEnd(R: PracticeRun) {
    const st = PRAC.stats, L: ScoreLoopState | null = SCORE.loop;
    if (!st)
        return;
    R.pass++;
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
    const d = R.mine.find((x) => x.start >= from - 1e-6 && x.start < s.t1 - 1e-6 && !(s.first && x.start < R.from - 1e-6));
    if (!d) {
        R.wt = Infinity;
        return;
    }
    const group = R.mine.filter((x) => Math.abs(x.start - d.start) < .03);
    PRAC.bar = { t: d.start, need: new Set(group.map((x) => x.n.midi)), got: new Set(), group, seg: s, since: 0 };
}
function pracRelease(R: PracticeRun, B: PracticeBarrier, now: number) {
    const s = B.seg, t = s.t0 + Math.max(0, now - s.a0) * s.f;
    if (t > B.t) {
        s.t0 = B.t;
        s.a0 = now + .01;
        FALL.audioStart = s.a0;
    } // the clock was frozen: resume from the barrier
    R.wt = B.t + 1e-3;
    PRAC.bar = null;
    R.waitShown = false;
    scoreStateText();
    pracTick();
}
function pracMisses(R: PracticeRun, time: number) {
    const tol = .22 * (R.segs[0].f || 1);
    while (R.mi < R.mine.length && R.mine[R.mi].start < time - tol) {
        const d = R.mine[R.mi++];
        if (!R.judged.has(d.i))
            pracJudge(R, d, 'miss');
    }
}
function pracJudge(R: PracticeRun, d: PracticeTimedNote | null, j: 'perfect' | 'good' | 'miss' | 'wrong') {
    const st = PRAC.stats;
    if (!st)
        return;
    st[j]++;
    if (j === 'perfect' || j === 'good') {
        st.streak++;
        st.best = Math.max(st.best, st.streak);
        st.passHit++;
    }
    else
        st.streak = 0;
    if (j !== 'wrong')
        st.passAll++;
    if (d) {
        R.judged.set(d.i, j);
        PRAC.res.set(d.i, j === 'miss' ? 'miss' : 'hit');
        if (FALL.mode === 'score')
            scorePaintIdx(d.i);
    }
    PRAC.judge = j;
    PRAC.judgeT = performance.now();
    pracHud();
}
// Live input in this view: the computer keyboard, on-screen keys, the falling-notes keyboard or a MIDI device.
function pracInput(kind: string) {
    const R = SCORE.run;
    if (kind === 'on' && R && SCORE.playing && actx) {
        const m = heldOrder[heldOrder.length - 1], now = actx.currentTime;
        if (m != null && now >= R.segs[0].a0 - .05) {
            PRAC.active = true;
            const { s, t } = pracRaw(R, now), B = PRAC.bar;
            if (B && B.seg === s && t >= B.t - .3 * s.f && B.need.has(m)) {
                if (!B.got.has(m)) {
                    B.got.add(m);
                    const late = Math.max(0, t - B.t) / s.f;
                    B.group.filter((x) => x.n.midi === m).forEach((x) => pracJudge(R, x, late < .15 ? 'perfect' : 'good'));
                }
                if ([...B.need].every((x) => B.got.has(x)))
                    pracRelease(R, B, now);
            }
            else {
                const time = fallTime(), tol = .22 * s.f;
                let best: PracticeTimedNote | null = null;
                for (const d of R.mine) {
                    if (d.start > time + tol)
                        break;
                    if (d.n.midi !== m || R.judged.has(d.i) || d.start < time - tol)
                        continue;
                    if (!best || Math.abs(d.start - time) < Math.abs(best.start - time))
                        best = d;
                }
                pracJudge(R, best, best ? (Math.abs(best.start - time) < .09 * s.f ? 'perfect' : 'good') : 'wrong');
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
    const show = !!st && PRAC.active && AN.notes.length > 0 && (SCORE.playing || !!SCORE.run);
    hud.hidden = !show;
    if (!show)
        return;
    const acc = st && pracAcc(st), R = SCORE.run;
    byId('pr-acc-v').textContent = acc == null ? '–' : Math.round(acc * 100) + '%';
    byId('pr-streak').textContent = String(st ? st.streak : 0);
    byId('pr-pass').textContent = String(R ? R.pass : 1);
    byId('pr-tempo').textContent = Math.round(((R && R.segs[0].f) || pracFactor()) * 100) + '%';
    const j = byId('pr-judge'), fresh = PRAC.judge && performance.now() - PRAC.judgeT < 900;
    j.dataset.j = fresh ? PRAC.judge : '';
    j.textContent = fresh ? t('pr_' + (PRAC.judge === 'miss' ? 'miss' : PRAC.judge)) : '';
}
function pracFinish(R: PracticeRun) {
    const sel = R.sel, a = R.a, end = R.b;
    clearInterval(R.timer);
    SCORE.run = null;
    PRAC.bar = null;
    SCORE.playing = false;
    SCORE.sel = false;
    SCORE.timers = [];
    cancelAnimationFrame(SCORE.followRaf);
    SCORE.followRaf = 0;
    scoreUnlight();
    FALL.lastT = null;
    FALL.position = sel ? a : end;
    scoreIdle();
    byId('pr-hud').hidden = true;
    if (PRAC.active && PRAC.stats)
        pracSummary(R);
}
function pracSummary(R: PracticeRun) {
    const st = PRAC.stats;
    if (!st)
        return;
    const acc = pracAcc(st);
    PRAC.next = pracNextStep(R);
    pracNextRender();
    byId('pr-sum-acc').textContent = acc == null ? '–' : Math.round(acc * 100) + '%';
    (['perfect', 'good', 'miss', 'wrong'] as const).forEach((k) => { byId('pr-sum-' + k).textContent = String(st[k]); });
    byId('pr-sum-note').textContent = t('pr_sum_note', st.best, Math.round(pracFactor() * 100) + '%');
    byId('pr-sum').hidden = false;
    anSideSync();
    byId('pr-again').focus({ preventScroll: true });
}
function pracSumClose() { byId('pr-sum').hidden = true; PRAC.next = null; anSideSync(); }
// Count-in digits, the waiting state and the HUD's fading judgement follow the animation frame.
function pracFrame() {
    const R = SCORE.run, c = byId('pr-count');
    if (!R || !actx) {
        if (!c.hidden)
            c.hidden = true;
        return;
    }
    const now = actx.currentTime, ci = R.ci;
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
    if (typeof v === 'boolean') {
        if (isPracFlag(k))
            PRAC[k] = v;
    }
    else if (isPracChoice(k))
        PRAC[k] = v;
    pracSave();
    if (k === 'hands') {
        SCORE.heads.forEach((l) => l.forEach(scorePaintEl));
        anKeysPaint();
    }
    if (SCORE.playing && ['hands', 'wait', 'acc', 'hear'].includes(k)) {
        const at = fallTime();
        if (SCORE.loop)
            scoreLoopStart();
        else
            scorePlay(SCORE.sel, at);
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
async function scorePlay(selection = false, from: number | null = null)  {
    if (!AN.notes.length)
        return;
    const all: PracticeTimedNote[] = fallData(), chosen = selection ? all.filter((d) => AN.selected.has(d.i)) : all;
    if (!chosen.length)
        return;
    const a = selection ? Math.min(...chosen.map((d) => d.start)) : 0, b = selection ? Math.max(...chosen.map((d) => d.finish)) : fallEnd();
    let position = from != null ? from : selection ? a : FALL.position;
    if (position >= b - .05 || position < a - 1e-6)
        position = a; // at the end, or outside the selection: start over
    const notes = chosen.filter((d) => d.finish > position).sort((x, y) => x.start - y.start || x.n.midi - y.n.midi);
    if (!notes.length) {
        scoreHalt();
        scoreIdle();
        return;
    }
    await pracStart({ notes, a, b, loop: false, sel: selection, from: position });
}
// Loop the selected notes, else the A–B range (whole bars).
async function scoreLoopStart()  {
    const all: PracticeTimedNote[] = fallData();
    let notes: PracticeTimedNote[] | null = null, a = 0, b = 0, bars = '', ab = false;
    if (AN.selected.size) {
        notes = all.filter((d) => AN.selected.has(d.i));
        if (notes.length) {
            a = Math.min(...notes.map((d) => d.start));
            b = Math.max(...notes.map((d) => d.finish));
            bars = anBarsLabel(notes.map((d) => d.n));
        }
    }
    else if (PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A) {
        a = PRAC.A;
        b = PRAC.B;
        ab = true;
        notes = all.filter((d) => d.start >= a - 1e-6 && d.start < b - 1e-6);
    }
    if (!notes || !notes.length || !(b > a)) {
        scoreStop();
        return;
    }
    notes.sort((x, y) => x.start - y.start || x.n.midi - y.n.midi);
    await pracStart({ notes, a, b, loop: true, sel: !ab, ab, from: a, bars });
}
// Follow playback: move the cursor (keeping it in view), light the sounding keys (and noteheads, if asked) and refresh the status bar.
function scoreFollow() {
    SCORE.followRaf = 0;
    if (!SCORE.playing) {
        scoreUnlight();
        anKeysPaint();
        return;
    }
    const time = fallTime(), now = new Set<number>(), sel = SCORE.sel ? AN.selected : null, all: PracticeTimedNote[] = fallData();
    all.forEach(({ i, start, finish }) => { if (time >= start && time < finish && (!sel || sel.has(i)))
        now.add(i); });
    if (now.size !== SCORE.lit.size || [...now].some((i) => !SCORE.lit.has(i))) {
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
        scoreCursorUpdate(true);
    anStatusPos(time);
    pracFrame();
    SCORE.followRaf = requestAnimationFrame(scoreFollow);
}
// Zoom acts on the visible view: the engraving size, or the seconds shown in falling notes.
function anZoomNow() { return FALL.mode === 'fall' ? FALL.zoom : SCORE.zoom; }
function scoreZoom(z: number) {
    z = Math.round(Math.max(0.5, Math.min(2, z)) * 10) / 10;
    if (FALL.mode === 'fall') {
        if (z === FALL.zoom)
            return;
        FALL.zoom = z;
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
// Page | Continuous | Falling notes; the choice is remembered like the appearance.
function scoreSetView(v: string|undefined) {
    if (v === 'fall') {
        if (FALL.mode !== 'fall')
            fallMode('fall');
        saveAll();
        return;
    }
    const lay = v === 'cont' ? 'cont' : 'page';
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
    const below = r.height > 0 && r.bottom < (header.getBoundingClientRect().bottom + innerHeight) / 2; // same split in both states, so a round trip returns to the same place
    root.style.overflowAnchor = 'none'; // the browser's own scroll anchoring would hold the score and push what follows down
    return () => { const now = stage.getBoundingClientRect(), d = below ? now.bottom - r.bottom : now.top - r.top; if (Math.abs(d) >= .5)
        window.scrollBy(0, d); requestAnimationFrame(() => { root.style.overflowAnchor = ''; }); };
}
// The score viewport is sized in CSS from these: 100dvh − header − toolbar − status bar − dock (when shown).
function anLayoutVars() {
    const st = document.documentElement.style, h = (el: HTMLElement|null) => el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0, dock = byId('dock');
    st.setProperty('--hdr-h', h((document).querySelector('header')) + 'px');
    st.setProperty('--dock-h', (document.body.classList.contains('kb') ? h(dock) : 0) + 'px');
    st.setProperty('--an-tb-h', h(byId('an-tbwrap')) + 'px');
    st.setProperty('--an-sb-h', h(byId('an-status')) + 'px');
    st.setProperty('--an-low', h(SIDE.sheet && anNarrow() ? byId('an-side') : byId('an-status')) + 'px');
    anPinToolbarLater();
}
// Keep transport reachable while the page is scrolled below the score card's title row.
function anPinToolbar() {
    AN.pinRaf = 0;
    const tb = byId('an-tbwrap');
    const active = view0() === 'analysis' && AN.notes.length && !tb.hidden;
    if (!active) {
        tb.classList.remove('is-floating');
        return;
    }
    const header = document.querySelector('header') || document.body, headBottom = header.getBoundingClientRect().bottom;
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
    anLayoutVars();
    const header = document.querySelector('header') || document.body;
    const y = byId('an-stage').getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height - byId('an-tbwrap').getBoundingClientRect().height;
    if (Math.abs(window.scrollY - y) > 1)
        window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
}
/* status bar: the position text is not a live region (no announcements while playing); selection changes are announced once, debounced */
function anTempoAt(beat: number) { let bpm = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    if (e.beat <= beat + 1e-6)
        bpm = e.bpm;
    else
        break;
} return bpm; }
function anStatusPos(time?: number | null) {
    if (!AN.notes.length)
        return;
    const t0 = time != null ? time : fallTime(), beat = scoreBeatAt(t0), m = anMeasureAt(beat) || { number: '1', start: 0, num: 4, den: 4 }, u = anBeatUnit(m);
    const beats = Math.max(1, Math.round(m.num * 4 / m.den / u)), bt = Math.min(beats, Math.max(1, Math.floor((beat - m.start) / u + 1e-6) + 1));
    const set = (id: string, v: string) => { const el = byId(id); if (el.textContent !== v)
        el.textContent = v; };
    set('st-bar', t('st_bar', m.number));
    set('st-beat', t('st_beat', bt));
    set('st-time', anClock(t0) + ' / ' + anClock(fallEnd()));
    set('st-tempo', '♩ = ' + Math.round(anTempoAt(beat)));
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
    const id = identifyChord([...new Set(sel.map((n) => n.midi))]);
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
        lit.forEach((n) => want.set(foldToView(n.midi), anHandOf(n)));
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
        const el = keyEl.get(m);
        if (el && el.dataset.s === s)
            kbState(m, null, false);
    } });
    want.forEach((s, m) => { const el = keyEl.get(m); if (el && el.dataset.s !== s)
        kbState(m, s, false); });
    AN.kbApplied = want;
    kbDegrees(deg);
}
function anKeysClear() { AN.kbApplied.forEach((s, m) => { const el = keyEl.get(m); if (el && el.dataset.s === s)
    kbState(m, null, false); }); AN.kbApplied = new Map(); kbDegrees(null); }
// Centre the dock on the music the first time its keys are shown for a score, so lit keys are rarely folded.
function anKeysCenter() {
    AN.kbCenter = false;
    if (!AN.notes.length)
        return;
    const ms = AN.notes.map((n) => n.midi).sort((a, b) => a - b), med = ms[ms.length >> 1];
    const low = Math.max(BASE_LOW, Math.min(BASE_HIGH - view.oct * 12, Math.round((med - view.oct * 6) / 12) * 12));
    if (low !== view.low) {
        view.low = low;
        buildKeyboard();
        repaintHeld();
    }
}
/* analysis workspace */
function anOriginText() { const o = AN.keyOrigin; return t(o === 'file' ? (AN.source && AN.source.kind === 'example' ? 'an_origin_piece' : 'an_origin_file') : o === 'manual' ? 'an_origin_manual' : o === 'mode' ? 'an_origin_mode' : 'an_origin_auto'); }
// The passage the Practice tab and Read & Play work on: the selected bars or notes, else the whole piece.
function anScopeNotes() { const f = anFocus(false); return f && f.kind !== 'cursor' ? anFocusNotes(f) : AN.notes; }
function anBarsLabel(ns: { start: number }[], L?: string) {
    const a = anMeasureAt(Math.min(...ns.map((n) => n.start))).number, b = anMeasureAt(Math.max(...ns.map((n) => n.start))).number;
    return a === b ? tl(L || lang, 'an_bar1', a) : tl(L || lang, 'an_bars', a, b);
}
function anNum(x: number, d: number) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(LOCALE_TAGS[lang] || lang); }
function anClock(sec: number) { const s = Math.max(0, sec); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
// The parts of a chord span (one segment of the harmonic analysis) that its descriptions read.
interface AnSpanChordFacts { ch: { root: number; c: { s: string } }; bass: number | null }
interface AnSpanBeatFacts { measure: { start: number }; unit: number; start: number; end: number }
interface AnSpanNoteFacts { midi: number; hand?: AnHand | null }
interface AnSpanNctFacts { type: string; note: { midi: number } }
function anChordLabel(seg: AnSpanChordFacts, key: theory.KeySignature) { const ch = seg.ch; return spellName(60 + ch.root, key) + ch.c.s + (seg.bass !== ch.root ? '/' + spellName(60 + (seg.bass ?? 0), key) : ''); }
function anBeatText(seg: AnSpanBeatFacts) {
    const m = seg.measure, u = seg.unit, b1 = 1 + (seg.start - m.start) / u, b2 = (seg.end - m.start) / u, f = (x: number) => anNum(x, 1);
    return b2 - b1 < 1e-6 ? t('an_beat', f(b1)) : t('an_beats', f(b1) + '–' + f(b2));
}
function anDetText(ch: { det: string; }) { return t('an_det_' + ch.det); }
// What each hand plays in a chord span, low to high, each pitch class once: "RH E G C · LH C G".
function anHandsText(seg: { notes: AnSpanNoteFacts[] }, key: theory.KeySignature) {
    const by: { rh: number[]; lh: number[] } = { rh: [], lh: [] };
    seg.notes.slice().sort((a, b) => a.midi - b.midi).forEach((n) => { const hand: string = anHandOf(n), h = hand === 'rh' || hand === 'lh' ? by[hand] : null, p = pc(n.midi); if (!h)
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
    return ['suspension', 'anticipation', 'passing', 'neighbor', 'other'].map((type) => {
        const names = [...new Set((seg.nct || []).filter((x) => x.type === type).map((x) => spellName(x.note.midi, key, true)))];
        return names.length ? t('an_nct_' + type) + ': ' + names.join(', ') : '';
    }).filter(Boolean).join(' · ');
}
function anSegIndexAt(segs: readonly { start: number; end: number }[], beat: number) { let lo = 0, hi = segs.length - 1; while (lo <= hi) {
    const mid = (lo + hi) >> 1, s = segs[mid];
    if (beat < s.start - 1e-6)
        hi = mid - 1;
    else if (beat >= s.end - 1e-6)
        lo = mid + 1;
    else
        return mid;
} return -1; }
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
    const ab = PRAC.A != null && PRAC.B != null;
    buttonById('an-play').disabled = !sel || busy;
    buttonById('an-loop').disabled = (!sel && !ab && !SCORE.loop) || busy;
    buttonById('an-clear').disabled = !sel && !SCORE.mrange;
    byId('an-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
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
    // The toolbar toggle is named Keyboard and reports expanded or collapsed; the dock's own button names the action it takes.
    const open = sheet && dockOpen(), kb = buttonById('an-kb');
    kb.disabled = !sheet;
    kb.setAttribute('aria-expanded', open ? 'true' : 'false');
    kb.title = fall && has ? t('an_kb_fall') : t(open ? 'kb_hide' : 'kb_show');
    const ron = !!AN.source && AN.source.kind !== 'xml';
    byId('an-recon-btn').hidden = !ron;
    if (!ron)
        anReconOpen(false);
    byId('score-credit').hidden = !has || fall;
    byId('st-hint').textContent = t(fall ? 'fall_hint' : 'an_hint');
    // toolbar per view: sheet-only controls (zoom, paper/night, docked keyboard) give way to the falling-notes display options
    queryAllHtml(document, '#an-toolbar .an-zoom,#sc-look,#sc-hl,#an-kb,.tb-sep-sheet').forEach((el) => { el.hidden = fall && has; });
    byId('fall-opt').hidden = !(fall && has);
    if (fall && has)
        byId('an-kb').setAttribute('aria-expanded', 'false');
    if (!(fall && has))
        anPop('fall-pop', false);
    byId('an-tl').hidden = !has;
    byId('an-loop').title = byId('an-loop').getAttribute('aria-label') + (ab && !sel ? ' · A–B' : '');
    byId('an-metro').setAttribute('aria-pressed', PRAC.metro ? 'true' : 'false');
    byId('an-metro').title = t('an_metro_t');
    byId('an-metro').setAttribute('aria-label', t('an_metro_t'));
    queryAllHtml(document, '#pr-hands button,#pt-hands button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.h === PRAC.hands ? 'true' : 'false'));
    byId('pr-wait').setAttribute('aria-pressed', PRAC.wait ? 'true' : 'false');
    byId('pr-wait').title = t('pr_wait_t');
    inputById('pt-wait').checked = PRAC.wait;
    inputById('pt-metro').checked = PRAC.metro;
    inputById('pr-countin').checked = PRAC.countIn;
    selectById('pt-speed').value = selectById('score-speed').value;
    selectById('pt-speed').disabled = !has;
    byId('pr-opt').title = t('pr_opt_t');
    byId('pr-opt').setAttribute('aria-label', t('pr_opt_t'));
    byId('fall-opt').title = t('fall_disp_t');
    buttonById('pr-clrab').disabled = PRAC.A == null && PRAC.B == null;
    byId('fall-finger-note').textContent = t(has && !anHasFinger() ? 'fall_finger_none' : 'fall_finger_note');
    dockSync();
    anSideSync();
    scoreMarks();
    byId('an-now-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
    byId('pt-start').textContent = t(playing ? 'pt_stop' : 'pt_start');
    buttonById('pt-start').disabled = !has || busy;
    selectById('an-example').disabled = busy;
    (document).querySelectorAll('#an-roll .an-ex,#an-roll [data-an-open]').forEach((b) => { if ('disabled' in b)
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
    const sig = [AN.version, lang, notation].join('|');
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
/* analysis panel: Now follows the bar or passage in focus, Piece is the whole-piece workspace, Practice holds the settings.
   Beside the score from 1000 px, a bottom sheet behind the floating Analysis button below that. */
interface AnPanelSide {
    open: boolean;
    tab: string;
    w: number;
    sheet: boolean;
    drag: boolean;
    nowSig: string;
    ptSig: string;
    liveT: ReturnType<typeof setTimeout> | number;
    handScroll: number;
    deferred: boolean;
}
const SIDE: AnPanelSide = { open: true, tab: 'now', w: 340, sheet: false, drag: false, nowSig: '', ptSig: '', liveT: 0, handScroll: 0, deferred: false };
const AN_TABS = ['now', 'piece', 'practice'];
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
    fab.hidden = !has || !narrow || SIDE.sheet || !byId('pr-sum').hidden;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    const pt = byId('pr-opt');
    pt.setAttribute('aria-expanded', open && SIDE.tab === 'practice' ? 'true' : 'false');
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
// What Now is about: the bar being played (while playing), else the selected bars, else the bars of the selected notes, else
// the bar under the cursor. a/b index anMeasures(); lo/hi are beats.
interface AnPanelFocus {
    kind: 'play' | 'bars' | 'sel' | 'cursor';
    a: number;
    b: number;
    lo: number;
    hi: number;
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
// Harmonic function from the scale degree (Riemann-style T / S / D); secondary dominants name their target.
function anFunctionOf(key: theory.KeySignature, seg: { ch: { root: number; }; }, rn: string) {
    if (rn.includes('/'))
        return t('an_fn_sec', rn.slice(rn.indexOf('/') + 1));
    const fns: Partial<Record<number, string>> = key.minor ? ({ 0: 'T', 3: 'T', 8: 'T', 2: 'S', 5: 'S', 7: 'D', 10: 'D', 11: 'D' } ) : ({ 0: 'T', 4: 'T', 9: 'T', 2: 'S', 5: 'S', 7: 'D', 11: 'D' } );
    const rel = ((seg.ch.root - key.root) % 12 + 12) % 12, f = fns[rel];
    return t(f ? 'an_fn_' + f : 'an_fn_chr');
}
interface AnPanelSpanRow {
    s: AnHarmonySeg;
    k: number;
}
// One chord of the progression: symbol, Roman numeral, beats and how sure the reading is; the full reading, with what each hand
// plays, is its accessible name.
function anChipHTML(s: AnHarmonySeg, i: number, rove: boolean|null) {
    const esc = xmlEsc, key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = anRoman(key, s), beats = anBeatText(s), conf = s.ch.conf;
    const alts = s.ch.alts.map((a) => spellName(60 + a.root, key) + a.c.s).join(', '), cad = s.cad ? t('an_cad_' + s.cad) : '', det = anDetText(s.ch), nct = anNctText(s, key);
    const label = [t('an_bar') + ' ' + s.measure.number, beats, lab, rn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), anHandsText(s, key), nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
    const time = anClock(scoreSeconds(s.start)) + '–' + anClock(scoreSeconds(s.end));
    return `<button type="button" class="an-ch" data-k="${i}" data-conf="${conf}"${rove == null ? '' : ` tabindex="${rove ? 0 : -1}"`} aria-pressed="false" aria-label="${esc(label)}" title="${esc(label + ' · ' + time)}"><span class="an-ch-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-ch-rn">${esc(rn)}</span><span class="an-ch-t">${esc(beats + ' · ' + det)}</span>${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>`
        + (cad ? `<span class="an-cad" title="${esc(t('an_cad_title'))}">${esc(cad)}</span>` : '');
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
    const esc = xmlEsc, key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = anRoman(key, s), conf = s.ch.conf, open = s.ch.c.q === 'S' || s.ch.c.q === 'P';
    const inv = implied ? 0 : anInv(s), slash = !implied && s.bass !== s.ch.root;
    const fn = [anFunctionOf(key, s, rn), implied ? t('an_implied') : open || slash && !inv ? '' : invName(inv), slash ? t('an_bass', spellName(60 + (s.bass ?? 0), key)) : ''].filter(Boolean).join(' · ');
    const alts = s.ch.alts.map((a) => spellName(60 + a.root, key) + a.c.s).join(', '), det = anDetText(s.ch), hands = anHandsText(s, key);
    const meta = anBeatText(s) + ' · ' + det + (alts ? ' (' + t('an_or', alts) + ')' : ''), nct = anNctText(s, key), cad = s.cad ? t('an_cad_' + s.cad) : '';
    const label = [t('an_bar') + ' ' + s.measure.number, anBeatText(s), lab, rn, fn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), hands, nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
    return `<li><button type="button" class="an-ch an-nc" data-k="${k}" data-conf="${conf}" aria-pressed="false" aria-label="${esc(label)}"><span class="an-nc-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-nc-rn">${esc(rn)}</span><span class="an-nc-fn">${esc(fn)}</span><span class="an-ch-t an-nc-meta">${esc(meta)}</span>${hands ? `<span class="an-ch-hands">${esc(hands)}</span>` : ''}${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>${cad ? `<span class="an-cad" title="${esc(t('an_cad_title'))}">${esc(cad)}</span>` : ''}</li>`;
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
    let html = '';
    if (!one) {
        const info = anKeyInfo(notes);
        if (info.conf !== 'low')
            html += `<p class="an-small">${esc(t('an_now_est', anKeyName(info.best), t('an_conf_' + info.conf)))}</p>`;
    } // a passage's own key, when the notes say so clearly
    if (!segs.length)
        html += `<p class="an-small">${esc(t(!notes.length ? 'an_now_empty' : one ? 'an_now_none' : 'an_harm_none'))}</p>`;
    else if (one)
        html += `<ul class="an-nlist" aria-label="${esc(t('an_prog_label'))}">${segs.map((x: AnPanelSpanRow) => anNowCard(x, v.implied)).join('')}</ul><p class="an-small an-hsrc">${esc(anHandsSource())}</p>`;
    else
        html += `<div class="an-prog" role="group" aria-label="${esc(t('an_prog_label'))}">${anRowsHTML(segs)}</div>`;
    const fe = document.activeElement;
    const k = (fe instanceof HTMLElement || fe instanceof SVGElement) && body.contains(fe) ? fe.dataset.k : null;
    body.innerHTML = html;
    SIDE.nowSig = sig;
    AN.playSig = '';
    const coach = anCoach(f, segs.map((x: AnPanelSpanRow) => x.s), notes), cb = byId('an-coach');
    cb.hidden = !coach;
    cb.innerHTML = coach ? `<span class="coach-k">${esc(coach.h)}</span><span class="coach-t">${esc(coach.text)}</span>` : '';
    if (k) {
        const el = queryHtml(body, '.an-ch[data-k="' + k + '"]');
        (el || byId('an-now')).focus({ preventScroll: true });
    }
    const both = new Set(notes.map(anHandOf)).size > 1, hb = byId('an-now-hands').children;
    acts.forEach((b) => { b.disabled = !notes.length; });
    [...hb].forEach((b) => { if (b instanceof HTMLElement)
        b.hidden = !both && b.dataset.h !== 'both'; });
    hb[0].textContent = t(both ? 'pr_both' : 'an_practice_b');
    byId('an-now-pr-l').hidden = !both;
    anMarkActive();
    anSyncTimeline(fallTime(), false);
    anNowAnnounce(f, head, segs);
}
// Spoken once, a moment after the user picks bars or a chord; never while playing, so playback makes no announcements.
function anNowAnnounce(f: AnPanelFocus, head: string, segs: AnPanelSpanRow[]) {
    clearTimeout(SIDE.liveT);
    if (SCORE.playing || f.kind === 'play' || f.kind === 'cursor' || !anSideVisible('now'))
        return;
    const s = segs.length ? segs[0].s : null;
    let txt = head;
    if (s) {
        const key = anKeyAt(s.start), rn = anRoman(key, s);
        txt += ': ' + [anChordLabel(s, key), rn, anFunctionOf(key, s, rn)].join(', ') + (segs.length > 1 ? ' …' : '');
    }
    SIDE.liveT = setTimeout(() => { byId('an-now-live').textContent = txt; }, 900);
}
// Practice: what Start will play, the A–B range and whether the passage fits Read & Play.
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
    byId('an-pt-scope').textContent = sel ? (f.kind === 'sel' ? t('an_sel_h') + ' · ' + range(f.a, f.b) : Range(f.a, f.b)) : abBars ? t('pt_scope_ab', range(...abBars)) : t('pt_scope_all');
    byId('an-pt-sub').textContent = t(sel ? 'pt_sub_loop' : ab ? 'pt_sub_ab' : 'pt_sub_all');
    byId('pt-abv').textContent = abBars ? t('pt_ab_v', range(...abBars)) : t('pt_ab_none');
    const ns = anScopeNotes(), sig = [AN.version, lang, ns.length, AN.index.get(ns[0]), AN.index.get(ns[ns.length - 1])].join('|');
    if (SIDE.ptSig !== sig) {
        SIDE.ptSig = sig;
        const chk = anPracticeCheck(ns);
        buttonById('an-practice').disabled = !chk.ok;
        byId('an-practice-note').textContent = chk.ok ? t('an_practice_hint') : chk.msg ?? null;
    }
}
// Start in the Practice tab: the selection (or A–B) loops with the practice settings; otherwise the piece plays from the cursor.
function anPracticeStart() {
    if (SCORE.playing) {
        scoreStop();
        return;
    }
    if (AN.selected.size || (PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A))
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
    const metersSet = [...new Set(v.ms.map((m) => m.num + '/' + m.den))], unit = anBeatUnit(v.ms[0] || { num: 4, den: 4 });
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
    v.segs.forEach((s, i) => { const key = anKeyAt(s.start), lab = anChordLabel(s, key), rn = anRoman(key, s), last = seq[seq.length - 1]; if (!last || last.lab !== lab)
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
    if (!sel.length || (SCORE.mrange && !AN.active)) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    } // whole bars: the chord cards above say it all
    const key = anKeyAt(sel[0].start), pitches = [...new Set(sel.map((n) => n.midi))].sort((a, b) => a - b), esc = xmlEsc, parts: string[] = [];
    parts.push(`<span><b>${esc(t('an_sel_h'))}</b> · ${esc(sel.length === 1 ? t('an_note1') : t('an_sel_notes', sel.length))} · ${esc(anBarsLabel(sel))}</span>`);
    parts.push(`<span>${esc(pitches.slice(0, 16).map((m) => spellName(m, key, true)).join(' · '))}${pitches.length > 16 ? ' …' : ''}</span>`);
    const seg = AN.active && AN.active.kind === 'chord' && AN.view ? AN.view.segs[AN.active.k] : null;
    if (seg) {
        if (pitches.length === 2)
            parts.push(`<span><b>${esc(t('an_interval'))}:</b> ${esc(anIntervalName(pitches[1] - pitches[0]))}</span>`);
        parts.push(`<span><b>${esc(t('an_chord'))}:</b> ${esc(anChordLabel(seg, key))} · ${esc(anRoman(key, seg))}</span>`);
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
function anShowError(k: string, a?: string|number) { AN.error = { k, a }; anStatus(a === undefined ? t(k) : t(k, a), true); if (!SCORE.xml)
    anRenderEmpty(); }
function anSetLoading(on: boolean, msg?: string) { AN.loading = on; if (on) {
    scoreStop();
    AN.error = null;
    anStatus(msg);
} anUpdateControls(); }
function anErrorKey(err: unknown, fallback: string) { const code: unknown = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined; if (!err || !code)
    console.error(err); return 'an_err_' + (code && STRINGS.en['an_err_' + String(code)] ? String(code) : fallback); }
type AnExamplePiece = (typeof PIECES)[number];
function anPieceMeta(p: AnExamplePiece) {
    const n = p.keyN || 0, keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n);
    return [p.comp, anKeyName({ root: keyPc, minor: !!p.minor, fifths: n }), p.ts[0] + '/' + p.ts[1]].filter(Boolean).join(' · ');
}
function anRenderEmpty() {
    const box = byId('an-roll');
    box.classList.add('is-empty');
    box.classList.remove('is-loading', 'is-over');
    box.setAttribute('aria-busy', 'false');
    box.hidden = FALL.mode !== 'score' && AN.notes.length > 0;
    const esc = xmlEsc, ex = AN_EXAMPLES.map((id) => PIECES.find((p) => p.id === id)).filter((p): p is AnExamplePiece => Boolean(p));
    box.innerHTML = `<div class="an-empty"><div class="an-drop" id="an-drop"><p class="an-drop-t" id="an-drop-t">${esc(t('an_drop_t'))}</p><p class="an-drop-s">${esc(t('an_drop_s'))}</p>
  <button type="button" class="btn primary" data-an-open>${esc(t('an_open'))}</button><p class="an-drop-err" role="alert">${esc(AN.error ? t((AN.error).k, (AN.error).a) : '')}</p></div>
  <div class="an-exlist"><h2>${esc(t('an_examples'))}</h2><ul>${(ex).map((p) => `<li><button type="button" class="an-ex" data-piece="${p.id}"><span class="an-ex-t">${esc(srPieceTitle(p))}</span><span class="an-ex-m">${esc(anPieceMeta(p))}</span></button></li>`).join('')}</ul></div></div>`;
    anUpdateControls();
}
function anFillExamples() {
    const sel = selectById('an-example'), cur = AN.source && AN.source.kind === 'example' ? AN.source.id : '';
    sel.innerHTML = `<option value="">${xmlEsc(t('an_example_pick'))}</option>` + AN_EXAMPLES.map((id) => PIECES.find((p) => p.id === id)).filter((p): p is AnExamplePiece => Boolean(p)).map((p) => `<option value="${p.id}">${xmlEsc(srPieceTitle(p))}</option>`).join('');
    sel.value = cur;
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
    scoreStop();
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
    SCORE.xml = '';
    SCORE.measures = [];
    SCORE.engine = null;
    SCORE.geo = null;
    SCORE.mrange = null;
    SCORE.heads = new Map();
    SCORE.version++;
    scoreSetTempos([]);
    anIndex();
    byId('an-name').textContent = '';
    anReconUI();
    anFillExamples();
    anRenderEmpty();
    fallReset();
    anAnalyze();
}
// The bundled JSZip trusts an archive's own size fields and only notices a lie after inflating the whole entry into memory.
// Walk the directory the way it will (last end-of-directory record, signed 32-bit fields, the same record and local-header
// reads), refuse anything it could not unpack anyway, and cap what every entry declares. Entries big enough to expand
// past the cap (deflate tops out near 1032:1) are inflated once as a counted stream, so a lying header fails here.
interface AnZipEntry { method: number; C: number; U: number; off: number; }
interface AnZipEntryData extends AnZipEntry { data: Uint8Array<ArrayBuffer>; }
async function anMxlPreflight(buf: ArrayBuffer)  {
    const u = new Uint8Array(buf), N = u.length, CAP = AN_MAX_XML_CHARS, bad = () => anError('mxl');
    let zero = 0;
    const fits = (i: number, n: number) => i >= 0 && n >= 0 && zero + i + n <= N;
    const int = (i: number, n: number) => { if (!fits(i, n))
        throw bad(); let v = 0; for (let k = n - 1; k >= 0; k--)
        v = (v << 8) + u[zero + i + k]; return v; };
    const int8 = (i: number) => { const lo = int(i, 4); if (int(i + 4, 4))
        throw bad(); return lo; }; // JSZip drops the high half of 64-bit fields
    const sig = (i: number, c: number, d: number) => fits(i, 4) && u[zero + i] === 80 && u[zero + i + 1] === 75 && u[zero + i + 2] === c && u[zero + i + 3] === d;
    const last = (c: number, d: number) => { for (let r = N - 4; r >= 0; r--)
        if (u[r] === 80 && u[r + 1] === 75 && u[r + 2] === c && u[r + 3] === d)
            return r - zero; return -1; };
    const eocd = last(5, 6);
    if (eocd < 0)
        throw bad();
    const recs16 = [int(eocd + 4, 2), int(eocd + 6, 2), int(eocd + 8, 2), int(eocd + 10, 2)];
    let cdSize = int(eocd + 12, 4), cdOff = int(eocd + 16, 4), expected = 0;
    if (!fits(eocd + 22, int(eocd + 20, 2)))
        throw bad();
    if (recs16.includes(65535) || cdSize === -1 || cdOff === -1) {
        const loc = last(6, 7);
        if (loc < 0 || int(loc + 16, 4) > 1)
            throw bad();
        let z = int8(loc + 8);
        if (!fits(z, 4))
            throw bad();
        if (!sig(z, 6, 6)) {
            z = last(6, 6);
            if (z < 0)
                throw bad();
        }
        const size = int8(z + 4);
        if (size < 0 || size > 44)
            throw bad(); // JSZip cannot read zip64 extensible data
        cdSize = int8(z + 40);
        cdOff = int8(z + 48);
        expected = 32 + size;
    }
    if (cdSize < 0 || cdOff < 0)
        throw bad();
    const extra = eocd - (cdOff + cdSize + expected);
    if (extra < 0)
        throw bad();
    if (extra > 0)
        zero = extra; // bytes prepended to the archive shift every offset
    const heads: AnZipEntry[] = [];
    let p = cdOff;
    if (!fits(p, 0))
        throw bad();
    for (;;) {
        if (!fits(p, 4))
            throw bad();
        if (!sig(p, 1, 2))
            break;
        const flag = int(p + 8, 2), method = int(p + 10, 2), nl = int(p + 28, 2), xl = int(p + 30, 2), cl = int(p + 32, 2);
        let C = int(p + 20, 4), U = int(p + 24, 4), off = int(p + 42, 4), i = p + 46 + nl, z64: { i: number; end: number } | null = null;
        if (flag & 1 || !fits(i, 0))
            throw bad();
        const xend = i + xl;
        while (i + 4 < xend) {
            const id = int(i, 2), l = int(i + 2, 2);
            i += 4;
            if (!fits(i, l))
                throw bad();
            if (id === 1)
                z64 = { i, end: i + l };
            i += l;
        }
        if (!fits(xend, 0))
            throw bad();
        i = xend;
        if (z64) {
            const z = z64;
            const r8 = () => { if (z.i + 8 > z.end)
                throw bad(); const v = int8(z.i); z.i += 8; return v; };
            if (U === -1)
                U = r8();
            if (C === -1)
                C = r8();
            if (off === -1)
                off = r8();
        }
        if (!fits(i, cl))
            throw bad();
        p = i + cl;
        heads.push({ method, C, U, off });
    }
    if (!heads.length)
        throw bad();
    const ents: AnZipEntryData[] = heads.map((e) => {
        if (!sig(e.off, 3, 4) || e.C < 0 || e.U < 0 || (e.method !== 0 && e.method !== 8))
            throw bad();
        const nl = int(e.off + 26, 2), start = e.off + 30 + nl + int(e.off + 28, 2);
        if (!fits(e.off + 30, nl) || !fits(start, e.C))
            throw bad();
        return { ...e, data: u.subarray(zero + start, zero + start + e.C) };
    });
    const TOTAL_CAP = 4 * CAP;
    let declared = 0, possible = 0;
    for (const e of ents) {
        if (e.U > CAP)
            throw anError('mxlbig');
        declared += e.U;
        if (declared > TOTAL_CAP)
            throw anError('mxlbig');
        possible += e.method === 8 ? e.C * 1032 : e.C;
    }
    // A single entry can exceed the per-entry cap even when the archive total looks safe. If every entry looks safe
    // alone but their worst-case expansion is not, count every deflated entry before JSZip gets a chance to allocate it.
    const countAll = possible > TOTAL_CAP;
    let left = TOTAL_CAP;
    for (const e of ents) {
        if (e.method === 0) {
            if (e.C !== e.U)
                throw bad();
            left -= e.U;
            continue;
        }
        if (!countAll && e.C * 1032 <= CAP)
            continue;
        if (e.U > left)
            throw anError('mxlbig');
        const n = await anInflatedSize(e.data, e.U);
        if (n === null)
            throw anError('mxlbig'); // without a stream, this archive cannot be proven safe before JSZip inflates it
        if (n !== e.U)
            throw bad();
        left -= n;
    }
}
// Inflates raw-deflate bytes as a stream, counting and discarding the output; stops as soon as it passes `limit`.
// Resolves to the byte count (limit+something when over), or null when this browser has no raw-deflate stream.
let anInflatedSize = async function anInflatedSize(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<number | null> {
    let ds: DecompressionStream;
    try {
        ds = new DecompressionStream('deflate-raw');
    }
    catch (_) {
        return null;
    }
    const w = ds.writable.getWriter(), r = ds.readable.getReader();
    let n = 0, stop = false;
    (async ()  => { for (let i = 0; i < bytes.length && !stop; i += 4096)
        await w.write(bytes.subarray(i, i + 4096)); if (!stop)
        await w.close(); })().catch(() => { });
    try {
        for (;;) {
            const { done, value } = await r.read();
            if (done)
                break;
            n += value.byteLength;
            if (n > limit) {
                stop = true;
                r.cancel().catch(() => { });
                break;
            }
        }
    }
    catch (_) {
        stop = true;
    } // corrupt data or junk after the end: the count so far decides
    return n;
};
// MusicXML distances are tenths of a staff space; OSMD distances are staff spaces.
// Keep physical page/staff sizing when supplied, with bounded fallbacks for incomplete or malformed layout hints.
interface AnXmlTitleRun { text: string; style: string; weight: string; }
interface AnXmlPageLayout {
    base: number; width: number; pageWidth: number; pageHeight: number;
    left?: number; right?: number; top?: number; bottom?: number;
    titleSize?: number; subtitleSize?: number; composerSize?: number;
    titleRuns?: AnXmlTitleRun[];
    staffGap?: number | null; systemGap?: number | null;
}
function scoreXmlLayout(doc: Document): AnXmlPageLayout | null {
    const root = doc.documentElement, defaults = root.querySelector(':scope > defaults');
    if (!defaults)
        return null;
    const number = (el: Element | null, selector: string, min: number, max: number) => { const node = el && el.querySelector(selector), value = node ? parseFloat(node.textContent) : NaN; return Number.isFinite(value) && value >= min && value <= max ? value : null; };
    const mm = number(defaults, 'scaling > millimeters', .1, 100), tenths = number(defaults, 'scaling > tenths', 1, 1000), unit = mm && tenths ? mm / tenths : null;
    const base = unit && unit * 96 / 25.4 >= .3 && unit * 96 / 25.4 <= 1.5 ? unit * 96 / 25.4 : SC_BASE;
    const pw = number(defaults, 'page-layout > page-width', 100, 10000), ph = number(defaults, 'page-layout > page-height', 100, 20000);
    const width = unit && pw ? pw * unit : 210, height = unit && ph ? ph * unit : 297;
    const pageWidth = width >= 50 && width <= 600 ? width : 210, pageHeight = height >= 50 && height <= 1200 ? height : 297;
    const margins = defaults.querySelector('page-margins[type="both"],page-margins[type="odd"]') || defaults.querySelector('page-margins'), out: AnXmlPageLayout = { base, width: pageWidth * 96 / 25.4, pageWidth, pageHeight };
    for (const [side, prop] of [['Left', 'left'], ['Right', 'right'], ['Top', 'top'], ['Bottom', 'bottom']] as const) {
        const value = number(margins, prop + '-margin', 0, 400);
        if (value != null && value < ((side === 'Left' || side === 'Right' ? pw : ph) ?? 0) / 3)
            out[prop] = value / 10;
    }
    for (const [kind, prop] of [['title', 'titleSize'], ['subtitle', 'subtitleSize'], ['composer', 'composerSize']] as const) {
        const credit = [...root.querySelectorAll(':scope > credit')].find((c) => c.querySelector('credit-type')?.textContent.trim() === kind && (c.getAttribute('page') || '1') === '1');
        const words = credit && [...credit.querySelectorAll('credit-words')], size = words && words[0] ? parseFloat(words[0].getAttribute('font-size') ?? '') : NaN;
        if (Number.isFinite(size) && size >= 6 && size <= 48)
            out[prop] = size;
        if (kind === 'title' && words) {
            let style = 'normal', weight = 'normal';
            out.titleRuns = words.map((w) => { const fs = w.getAttribute('font-style'), fw = w.getAttribute('font-weight'); if (fs === 'normal' || fs === 'italic')
                style = fs; if (fw === 'normal' || fw === 'bold')
                weight = fw; return { text: w.textContent, style, weight }; });
        }
    }
    // These rules are global minima, not a command to repeat the first system's (often unusually large) spacing.
    const minimum = (selector: string, max: number) => { const values = [...root.querySelectorAll(selector)].map((n) => Number(n.textContent)).filter((v) => Number.isFinite(v) && v >= 10 && v <= max); return values.length ? Math.min(...values) / 10 : null; };
    out.staffGap = minimum('part > measure > print > staff-layout > staff-distance', 200);
    out.systemGap = minimum('part > measure > print > system-layout > system-distance', 400);
    return out;
}
async function anReadXml(file: File, title: string)  {
    let xml: string;
    if (/\.mxl$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        await anMxlPreflight(buf);
        await loadOsmd();
        try {
            xml = await mxlToXml(buf);
        }
        catch (err) {
            console.error(err);
            throw anError('mxl');
        }
        if (xml.length > AN_MAX_XML_CHARS)
            throw anError('mxlbig');
    }
    else
        xml = await file.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'score-partwise' || doc.querySelector('script'))
        throw anError('xml');
    const layout = scoreXmlLayout(doc), clean = anXmlTidy(doc, title);
    xml = new XMLSerializer().serializeToString(doc);
    const r = scoreXmlNotes(doc);
    if (!r.notes.length)
        throw anError('nonotes');
    if (r.notes.length > AN_MAX_NOTES)
        throw anError('notes');
    return { kind: 'xml' as const, title: clean || title, label: file.name, xml, layout, ...r };
}
// MuseScore exports read cleanly in the engraver: real title and composer in the header (not the file name),
// no editorial footnotes over the first staff, SMuFL note glyphs readable in web fonts, no generic "Instr. P1"
// label and "Ped. … *" marks instead of pedal lines that collide with the left hand's fingering.
const AN_SMUFL_NOTES = { '\uE1D2': '\uD834\uDD5D', '\uECA2': '\uD834\uDD5D', '\uE1D3': '\uD834\uDD5E', '\uECA3': '\uD834\uDD5E', '\uE1D5': '\u2669', '\uECA5': '\u2669',
    '\uE1D4': '\uD834\uDD5E', '\uECA4': '\uD834\uDD5E', '\uE1D6': '\u2669', '\uECA6': '\u2669',
    '\uE1D7': '\u266A', '\uECA7': '\u266A', '\uE1D8': '\u266A', '\uECA8': '\u266A', '\uE1D9': '\u266C', '\uECA9': '\u266C', '\uE1DA': '\u266C', '\uECAA': '\u266C', '\uE1E7': '.', '\uECB7': '.', '\uE520': 'p', '\uE522': 'f' };
// Some exports leave an open last ending before the next forward repeat. Do not let it span the next section.
// Explicit stop/discontinue pairs always win, including multi-measure endings crossing a repeat boundary.
function scoreXmlEndings(doc: Document) {
    doc.querySelectorAll('score-partwise > part').forEach((part) => {
        const endings = [...part.querySelectorAll('barline > ending')], open = new Map<string, Element>(), unclosed = new Set<Element>();
        endings.forEach((e) => {
            const key = e.getAttribute('number') || '1';
            if (e.getAttribute('type') === 'start') {
                open.set(key, e);
                unclosed.add(e);
            }
            else {
                const started = open.get(key);
                if (started) {
                    unclosed.delete(started);
                    open.delete(key);
                }
            }
        });
        open.clear();
        const measures = [...part.children].filter((e) => e.localName === 'measure');
        measures.forEach((m, i) => {
            if (i && m.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')) {
                open.forEach((e, key) => {
                    const prev = measures[i - 1];
                    let bar = prev.querySelector(':scope > barline[location="right"], :scope > barline:not([location])');
                    if (!bar) {
                        bar = doc.createElementNS(part.namespaceURI, 'barline');
                        bar.setAttribute('location', 'right');
                        prev.appendChild(bar);
                    }
                    const stop = doc.createElementNS(part.namespaceURI, 'ending');
                    stop.setAttribute('number', key);
                    stop.setAttribute('type', 'discontinue');
                    bar.insertBefore(stop, bar.querySelector('repeat'));
                });
                open.clear();
            }
            m.querySelectorAll(':scope > barline > ending').forEach((e) => { if (unclosed.has(e))
                open.set(e.getAttribute('number') || '1', e); });
        });
    });
}
function anXmlTidy(doc: Document, fallback: string) {
    const root = doc.documentElement, kids = (el: Element) => [...el.children], one = (el: Element, name: string) => kids(el).find((c) => c.localName === name);
    const smufl = new Map(Object.entries(AN_SMUFL_NOTES));
    const text = (el: Element | null | undefined) => (el && el.textContent || '').replace(/\s+/g, ' ').trim(), same = (a: string, b: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    // 1. Note glyphs in tempo and credit text; "Lento ( = 60 bpm)" gains its missing quarter note.
    //    A text split over several <words> ("Lento (", glyph, " = 60 bpm)") is one line in MuseScore, not a stack.
    doc.querySelectorAll('direction').forEach((dir) => {
        const dts = kids(dir).filter((c) => c.localName === 'direction-type');
        if (dts.length < 2 || !dts.every((dt) => dt.children.length && kids(dt).every((c) => c.localName === 'words')))
            return;
        const ws = dts.flatMap((dt) => kids(dt)), first = ws[0];
        first.textContent = ws.map((w) => w.textContent).reduce((t, u) => t + (/[^\s(\uE000-\uF8FF\u2669\u266A\u266C]$/.test(t) && /^[\p{L}\d]/u.test(u) ? ' ' : '') + u);
        dts.slice(1).forEach((dt) => dt.remove());
        kids(dts[0]).slice(1).forEach((w) => w.remove());
    });
    doc.querySelectorAll('words,credit-words,rehearsal').forEach((w) => {
        const t = w.textContent;
        let u = t.replace(/[\uE1D2-\uE1E7\uECA2-\uECB7\uE520\uE522]/g, (c) => smufl.get(c) ?? '');
        u = u.replace(/\(\s*=\s*(\d)/g, '(\u2669 = $1');
        if (/^\s*=\s*\d/.test(u)) {
            const prev = w.closest('direction-type')?.previousElementSibling, pt = prev?.querySelector('words')?.textContent || '';
            if (!/[\u2669\u266A\u266C\uDD5D\uDD5E]\s*$/.test(pt) && !(prev && prev.querySelector('metronome')))
                u = u.replace(/^(\s*)=/, '$1\u2669 =');
        }
        if (u !== t) {
            w.textContent = u;
            if (/MScore\s*Text/i.test(w.getAttribute('font-family') || ''))
                w.removeAttribute('font-family');
        }
    });
    // 2. Title and composer from the header, the credits, or (last) the file name.
    const credits = kids(root).filter((c) => c.localName === 'credit'), ctype = (c: Element) => text(one(c, 'credit-type')).toLowerCase(), cwords = (c: Element) => [...c.querySelectorAll('credit-words')].map(text).filter(Boolean).join(' ');
    const workEl = one(root, 'work'), workTitle = workEl && one(workEl, 'work-title'), mvt = one(root, 'movement-title');
    let title = text(workTitle) || text(mvt);
    if (!title) {
        const typed = credits.find((c) => ctype(c) === 'title');
        if (typed)
            title = cwords(typed);
    }
    if (!title) {
        let best: string | null = null, size = -1, y = -1;
        credits.filter((c) => (c.getAttribute('page') || '1') === '1' && !ctype(c)).forEach((c) => {
            const w = c.querySelector('credit-words');
            if (!w)
                return;
            const t = text(w);
            if (!t || t.length > 80)
                return;
            const fs = parseFloat(w.getAttribute('font-size') ?? '') || 0, dy = parseFloat(w.getAttribute('default-y') ?? '') || 0;
            if (fs > size || (fs === size && dy > y)) {
                best = t;
                size = fs;
                y = dy;
            }
        });
        if (best)
            title = best;
    }
    if (!title)
        title = fallback;
    const ident = one(root, 'identification'), creator = ident && [...ident.children].find((c) => c.localName === 'creator' && c.getAttribute('type') === 'composer');
    let composer = text(creator), composerFromSubtitle = false;
    // Identification often flattens a printed two-line composer credit. Prefer its line structure when the text agrees.
    const composerCredit = credits.find((c) => ctype(c) === 'composer'), printedComposer = composerCredit && [...composerCredit.querySelectorAll('credit-words')].map((w) => w.textContent.trim()).filter(Boolean).join('\n');
    if (printedComposer && (!composer || printedComposer.replace(/\s/g, '').toLowerCase() === composer.replace(/\s/g, '').toLowerCase()))
        composer = printedComposer;
    if (!composer) {
        const typed = credits.find((c) => ctype(c) === 'composer');
        if (typed)
            composer = cwords(typed);
    }
    if (!composer) {
        const sub = credits.find((c) => ctype(c) === 'subtitle');
        if (sub && /\b(m[uú]si(c|k|que|ca)|music|by|von|de|di|composed|compos)/i.test(cwords(sub))) {
            composer = cwords(sub);
            composerFromSubtitle = true;
        }
    }
    const before = (names: string[]) => kids(root).find((c) => names.includes(c.localName)) || null;
    let work = workEl;
    if (!work) {
        work = doc.createElement('work');
        root.insertBefore(work, root.firstElementChild);
    }
    let wt = one(work, 'work-title');
    if (!wt) {
        wt = doc.createElement('work-title');
        work.insertBefore(wt, one(work, 'opus') || null);
    }
    wt.textContent = title;
    if (mvt && (same(text(mvt), title) || !text(mvt)))
        mvt.remove(); // a repeated movement title would print as a subtitle
    if (composer) {
        let id = one(root, 'identification');
        if (!id) {
            id = doc.createElement('identification');
            root.insertBefore(id, before(['defaults', 'credit', 'part-list']));
        }
        let cr = [...id.children].find((c) => c.localName === 'creator' && c.getAttribute('type') === 'composer');
        if (!cr) {
            cr = doc.createElement('creator');
            cr.setAttribute('type', 'composer');
            id.insertBefore(cr, id.firstElementChild);
        }
        cr.textContent = composer;
    }
    // 3. Credits the header already shows, and long editorial notes, leave the page; so do long words over the staves.
    const editorial = (t: string) => t.length >= 90 || /(^|\s)(edi[cç][aã]o|edici[oó]n|edition|correc[cç]|correction|nota(s)? d[aoe]|editor'?s note|note de l'[ée]diteur)/i.test(t);
    //    Version, arrangement and transcription notes ("Versão revista…", "arr. de…") go too when they read as a
    //    footnote: a sentence rather than a label, or set low on the page / far under the bass staff, where they
    //    would push the "Ped. … *" marks down.
    const versionNote = /(^|(?:\s|\(|\[))(vers[aã]o|versi[oó]n|version|vers\.|arr\.|arranj|arranged by|arrangement|transcr|adapt\.|adapta[cç]|adapted|revis[aã]o|revisi[oó]n|revised|revision)/i;
    const yOf = (el: Element | null) => { for (const a of ['default-y', 'relative-y']) {
        const v = el ? parseFloat(el.getAttribute(a) ?? '') : NaN;
        if (!isNaN(v))
            return v;
    } return NaN; };
    const footnote = (t: string, low: boolean) => versionNote.test(t) && (t.length >= 24 || low);
    credits.forEach((c) => {
        const ty = ctype(c), t = cwords(c), raw = [...c.querySelectorAll('credit-words')].map((w) => w.textContent).join('\n'), cy = yOf(c.querySelector('credit-words'));
        if (ty === 'title' || (ty !== 'composer' && (same(t, title) || same(t, composer))) || (composerFromSubtitle && ty === 'subtitle') || editorial(t) || footnote(t, cy < 200) || raw.split('\n').filter((s) => s.trim()).length >= 3)
            c.remove();
    });
    doc.querySelectorAll('direction > direction-type > words').forEach((w) => {
        const t = text(w), y = yOf(w);
        if (!t || !(t.length >= 60 || editorial(t) || footnote(t, y <= -80) || (t.length >= 20 && y <= -90) || w.textContent.split('\n').filter((s: string) => s.trim()).length >= 3))
            return;
        const dt = w.parentElement, dir = dt && dt.parentElement;
        if (!dt || !dir)
            return;
        w.remove();
        if (dt.children.length)
            return;
        if ([...dir.children].some((c) => c !== dt && c.localName === 'direction-type'))
            dt.remove();
        else if (dir.querySelector(':scope > sound'))
            dt.appendChild(doc.createElement('words'));
        else
            dir.remove();
    });
    // 4. Chord symbols sit above the upper staff: a <harmony> tied to the left hand would print between the staves,
    //    on top of the dynamics and hairpins.
    doc.querySelectorAll('harmony > staff').forEach((st) => { if ((parseInt(text(st)) || 1) > 1)
        st.textContent = '1'; });
    // 5. A lone piano part, or a generic label, needs no instrument name at the left of the system.
    const parts = [...root.querySelectorAll('part-list > score-part')], generic = /^(p\s*\d*|instr\.?\s*p?\s*\d*|piano(forte)?|pian|pianoforte|klavier|grand piano|acoustic grand piano)$/i;
    parts.forEach((p) => {
        const pn = one(p, 'part-name'), pa = one(p, 'part-abbreviation');
        if (pn && (parts.length === 1 || !text(pn) || generic.test(text(pn)))) {
            pn.setAttribute('print-object', 'no');
            if (pa)
                pa.setAttribute('print-object', 'no');
        }
    });
    // 6. Pedal marks as "Ped. … *": OSMD draws line="yes" as a bracket under the bass staff, where fingering lives.
    //    It drops type="change" on text pedals, so a change becomes a release and a new press at the same moment.
    doc.querySelectorAll('direction-type > pedal').forEach((p) => {
        const ty = p.getAttribute('type');
        if (ty === 'continue')
            return;
        p.setAttribute('line', 'no');
        p.setAttribute('sign', 'yes');
        if (ty === 'change') {
            p.setAttribute('type', 'stop');
            const dt = p.parentElement, dir = dt && dt.parentElement;
            if (!dt || !dir)
                return;
            const again = dir.cloneNode(false);
            if (!(again instanceof Element))
                return;
            [...dir.children].forEach((c) => { if (c === dt)
                again.appendChild(c.cloneNode(true));
            else if (['offset', 'voice', 'staff'].includes(c.localName))
                again.appendChild(c.cloneNode(true)); });
            again.querySelector('pedal')?.setAttribute('type', 'start');
            dir.after(again);
        }
    });
    scoreXmlEndings(doc);
    return title;
}
// The single entry point for the file input and drag & drop.
async function anOpenFile(file: File)  {
    if (!file)
        return;
    const name = file.name || '';
    if (!/\.(mid|midi|xml|musicxml|mxl)$/i.test(name))
        return anShowError('an_err_type', name);
    if (file.size > AN_MAX_BYTES)
        return anShowError('an_err_size', name);
    if (!file.size)
        return anShowError('an_err_empty', name);
    const token = ++AN.loadToken, title = name.replace(/\.[^.]+$/, ''), kind = /\.mxl$/i.test(name) ? 'mxl' : /\.(xml|musicxml)$/i.test(name) ? 'xml' : 'midi';
    anSetLoading(true, t('an_loading', name));
    let src: AnSource;
    try {
        src = kind === 'midi' ? { kind: 'midi', title, label: name, parsed: anParse(await file.arrayBuffer()) } : await anReadXml(file, title);
    }
    catch (err) {
        if (token !== AN.loadToken)
            return;
        anSetLoading(false);
        anShowError(anErrorKey(err, kind));
        return;
    }
    if (token !== AN.loadToken)
        return;
    await anCommit(src, token);
}
async function anLoadExample(id: string)  {
    const p = PIECES.find((x) => x.id === id);
    if (!p)
        return;
    const token = ++AN.loadToken;
    anSetLoading(true, t('an_loading', srPieceTitle(p)));
    await anCommit({ kind: 'example', id, title: srPieceTitle(p), label: srPieceTitle(p), comp: p.comp, parsed: anPieceToParsed(p) }, token);
}
async function anCommit(src: AnSource, token: number)  {
    scoreStop();
    AN.source = src;
    AN.error = null;
    AN.selected = new Set();
    AN.active = null;
    AN.rove = 0;
    FALL.position = 0;
    SCORE.mrange = null;
    SCORE.resume = null;
    SCORE.paused = false;
    if (src.kind === 'xml') {
        AN.notes = src.notes;
        SCORE.xml = src.xml;
        SCORE.midiGrid = 0;
        scoreSetTempos(src.tempos);
        SCORE.tempoFromFile = src.tempos.length > 0;
        SCORE.measures = src.measures;
        AN.hands = null;
        AN.keyMap = anXmlKeyMap(src);
    }
    else {
        AN.recon = { hands: 'auto', grid: 4, key: 'auto' };
        try {
            anRebuild();
        }
        catch (err) {
            anSetLoading(false);
            anReset();
            anShowError(anErrorKey(err, 'midi'));
            return;
        }
    }
    anIndex();
    anReconUI();
    anFillExamples();
    byId('an-name').textContent = src.label || src.title;
    let ok = false;
    try {
        ok = await scoreRender();
    }
    catch (err) {
        console.error(err);
        if (token === AN.loadToken) {
            anSetLoading(false);
            anReset();
            anShowError('an_err_render');
        }
        return;
    }
    if (token !== AN.loadToken || !ok)
        return;
    anSetLoading(false);
    anStatus(anLoadedText());
    fallReset();
    AN.kbCenter = true;
    if (anKeysShown())
        anKeysCenter(); // a collapsed keyboard is centred when it is first shown
    anFocusStage();
}
async function anReconChange()  {
    if (!AN.source || AN.source.kind === 'xml')
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
        await scoreRender();
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
    anFillExamples();
    anReconUI();
    const src = AN.source;
    // Examples are re-titled and MIDI scores get the localized part name ("Piano"/"Pian"): both need a rebuild.
    if (src && src.kind !== 'xml') {
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
// Selections made from the analysis panel: a chord also selects its bar (`bars`, score measure indices), so the coral band
// and the Now tab follow it.
interface AnSelectionFocus { kind: 'chord' | 'motif'; k: number; }
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
}
// Click a notehead to select it (Shift/Ctrl adds), click empty space in a bar to select the bar (Shift extends the range),
// drag for a marquee; a click outside every bar clears the selection.
function scorePointer(e: PointerEvent) {
    const box = byId('an-roll'), el = eventElement(e);
    if (e.button !== 0 || !SCORE.xml || !box.querySelector('svg') || !el || el.closest('.an-empty'))
        return;
    if (e.target === box && (e.offsetX >= box.clientWidth || e.offsetY >= box.clientHeight))
        return; // scrollbar
    const hit = el.closest('[data-i]'), target = anIsDataEl(hit) ? hit : null, x = e.clientX, y = e.clientY, add = e.shiftKey || e.ctrlKey || e.metaKey;
    e.preventDefault();
    let marquee: HTMLDivElement|null = null;
    const move = (ev: PointerEvent) => { if (!marquee && Math.hypot(ev.clientX - x, ev.clientY - y) < 5)
        return; if (!marquee) {
        marquee = (document).createElement('div');
        marquee.className = 'an-marquee';
        document.body.appendChild(marquee);
    } Object.assign(marquee.style, { left: Math.min(x, ev.clientX) + 'px', top: Math.min(y, ev.clientY) + 'px', width: Math.abs(ev.clientX - x) + 'px', height: Math.abs(ev.clientY - y) + 'px' }); };
    const done = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', done); if (marquee)
        marquee.remove(); };
    const finish = (ev: PointerEvent) => {
        done();
        if (Math.hypot(ev.clientX - x, ev.clientY - y) < 5) {
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
        SCORE.heads.forEach((list, i) => list.forEach((g: Element) => { const r = g.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; if (cx >= Math.min(x, ev.clientX) && cx <= Math.max(x, ev.clientX) && cy >= Math.min(y, ev.clientY) && cy <= Math.max(y, ev.clientY))
            AN.selected.add(i); }));
        anSelectionChanged();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', done);
}
function anRove(g: Element) { byId('an-roll').querySelectorAll('[data-i][tabindex="0"]').forEach((x) => x.setAttribute('tabindex', '-1')); g.setAttribute('tabindex', '0'); }
/* practice transfer: an ephemeral Read & Play piece (one line or chord stack per hand, bars kept, rhythm on a 16th grid) */
interface AnExcerptPiece { id: string; ephemeral: boolean; t: Localised<string>; comp: string; level: number; keyN: number; minor: boolean; ts: number[]; bpm: number;
    from: { title: string; bars: string; }; pickup?: number; rh?: SrToken[]; lh?: SrToken[]; }
type AnReadPieceResult = { piece: AnExcerptPiece; error?: undefined; } | { error: 'none' | 'long' | 'range'; piece?: undefined; };
function anToReadPiece(ns: readonly AnNote[]): AnReadPieceResult {
    if (!ns.length)
        return { error: 'none' };
    const notes = ns.slice().sort((a, b) => a.start - b.start || a.midi - b.midi), meas = anMeasures(), A = notes[0].start;
    const m0 = anMeasureAt(A), m1 = anMeasureAt(notes[notes.length - 1].start), i0 = meas.indexOf(m0), i1 = meas.indexOf(m1);
    if (i1 - i0 + 1 > AN_PRACTICE_BARS || notes.length > 600)
        return { error: 'long' };
    let ts = [m0.num, m0.den];
    if (![4, 8].includes(m0.den)) {
        const q = m0.num * 4 / m0.den;
        ts = Number.isInteger(q) ? [q, 4] : [Math.round(q * 2), 8];
    }
    const cap = ts[1] === 8 ? ts[0] * 0.5 : ts[0], grid = SCORE.midiGrid === 8 ? 8 : 4, q = (v: number) => Math.round(v * grid) / grid;
    const origin = q(A), offset = q(origin - m0.start), pickup = offset > 1e-6 && offset < cap - 1e-6 ? q(cap - offset) : 0, total = q(m1.end - origin);
    if (total <= 0)
        return { error: 'none' };
    const key = anKeyAt(A), spellSR = (m: number) => { const s = spellMidi(m, key.fifths, key.minor); return s.oct < 0 || s.oct > 9 ? null : SR_LET[s.li] + (s.acc > 0 ? '#' : s.acc < 0 ? 'b' : '') + s.oct; };
    const VAL = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125].filter((v) => v * grid >= 1 - 1e-9), RVAL = [4, 2, 1, 0.5, 0.25, 0.125].filter((v) => v * grid >= 1 - 1e-9);
    const nextBar = (p: number) => { let b = pickup > 0 ? pickup : cap; while (b <= p + 1e-6)
        b += cap; return b; };
    const rests = (list: SrToken[], from: number, to: number) => { let p = from; while (p < to - 1e-6) {
        const len = Math.min(to, nextBar(p)) - p, v = RVAL.find((x) => x <= len + 1e-6) || 1 / grid;
        list.push(['R', v]);
        p = q(p + v);
    } };
    let bad = false;
    const build = (hand: string) => {
        const own = notes.filter((n) => anHandOf(n) === hand);
        if (!own.length)
            return null;
        const on = new Map<string, { s: number; ms: Set<number>; end: number; }>();
        own.forEach((n) => { const s = q(n.start - origin); if (s < 0 || s >= total - 1e-6)
            return; const k = s.toFixed(4); if (!on.has(k))
            on.set(k, { s, ms: new Set(), end: 0 }); const o = on.get(k); if (!o)
            return; o.ms.add(n.midi); o.end = Math.max(o.end, Math.min(total, Math.max(s + 1 / grid, q(n.end - origin)))); });
        const list: SrToken[] = [], os = [...on.values()].sort((a, b) => a.s - b.s);
        let p = 0;
        os.forEach((o, i) => {
            if (o.s > p + 1e-6)
                rests(list, p, o.s);
            const len = Math.min(o.end, i + 1 < os.length ? os[i + 1].s : total, nextBar(o.s)) - o.s, v = VAL.find((x) => x <= len + 1e-6) || 1 / grid;
            const ps = [...o.ms].sort((a, b) => a - b).map(spellSR), names = ps.filter((x): x is string => !!x);
            if (names.length !== ps.length)
                bad = true;
            list.push([names.length === 1 ? names[0] : names, v]);
            p = q(o.s + v);
        });
        if (p < total - 1e-6)
            rests(list, p, total);
        return list;
    };
    const rh = build('rh'), lh = build('lh');
    if (bad)
        return { error: 'range' };
    if (!rh && !lh)
        return { error: 'none' };
    const src = AN.source;
    if (!src)
        throw new TypeError('Étude: no piece is loaded');
    const ex = src.kind === 'example' ? PIECES.find((p) => p.id === src.id) : undefined;
    if (src.kind === 'example' && !ex)
        throw new Error(`Étude: missing example piece ${src.id}`);
    const titles = { en: ex ? ex.t.en : src.title, ro: ex ? ex.t.ro : src.title, [lang]: ex ? srPieceTitle(ex) : src.title };
    const bars = { en: anBarsLabel(notes, 'en'), ro: anBarsLabel(notes, 'ro'), [lang]: anBarsLabel(notes, lang) }, tempoAt = SCORE.tempoList.filter((e) => e.beat <= A + 1e-6).pop() || SCORE.tempoList[0];
    const piece: AnExcerptPiece = { id: 'excerpt', ephemeral: true, t: { en: tl('en', 'rd_excerpt', titles.en, bars.en), ro: tl('ro', 'rd_excerpt', titles.ro, bars.ro), [lang]: tl(lang, 'rd_excerpt', titles[lang] || titles.en, bars[lang] || bars.en) }, comp: '', level: 0, keyN: key.fifths, minor: key.minor, ts,
        bpm: Math.max(40, Math.min(160, Math.round(tempoAt.bpm))), from: { title: titles[lang] || titles.en, bars: bars[lang] || bars.en } };
    if (pickup)
        piece.pickup = pickup;
    if (rh)
        piece.rh = rh;
    if (lh)
        piece.lh = lh;
    return { piece };
}
function anPracticeCheck(ns: readonly AnNote[]): { ok: true; piece: AnExcerptPiece; } | { ok: false; msg: string; } {
    const r = anToReadPiece(ns);
    if (r.piece)
        return { ok: true, piece: r.piece };
    return { ok: false, msg: r.error === 'long' ? t('an_practice_long', AN_PRACTICE_BARS) : r.error === 'range' ? t('an_practice_range') : '' };
}
function anPractice() {
    const chk = anPracticeCheck(anScopeNotes());
    if (!chk.ok) {
        const note = byId('an-practice-note');
        if (note)
            note.textContent = chk.msg;
        return;
    }
    scoreStop();
    SR.excerpt = chk.piece;
    SR.modeSel = 'learn';
    SR.hands = 'both';
    [...byId('rd-mode').children].forEach((x) => x.setAttribute('aria-pressed', x.getAttribute('data-v') === 'learn' ? 'true' : 'false'));
    show('read');
    fillPieces();
    srSelectPiece(chk.piece.id);
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_excerpt_ready');
    byId('rd-go').focus({ preventScroll: true }); // bring the staff and Start above the keyboard dock
    window.scrollTo({ top: Math.max(0, byId('rd-meta').getBoundingClientRect().top + window.scrollY - 80), behavior: 'auto' });
}
/* falling notes: a dark stage with lanes, bar lines and an integrated keyboard; notes coloured by hand */
interface FallTimedNote { n: AnNote; i: number; start: number; finish: number; sound: number; }
interface FallKeyRect { x: number; w: number; black: boolean; }
interface FallGeo { lo: number; hi: number; W: number; keys: Map<number, FallKeyRect>; whites: number[]; kw: number; bw: number; hitY?: number; kh?: number; }
interface FallHit { i: number; x: number; y: number; w: number; h: number; hand: string; }
interface FallFlash { x: number; y: number; w: number; rgb: string; life: number; max: number; }
interface FallParticle { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; col: string; }
interface FallState { mode: 'score' | 'fall'; raf: number; position: number; origin: number; audioStart: number; factor: number; notes: FallTimedNote[]; hits: FallHit[]; zoom: number;
    geo: FallGeo | null; particles: FallParticle[]; flashes: FallFlash[]; lastT: number | null; lastFrame: number; resume: { sel: boolean; } | null;
    fingerSrc?: readonly AnNote[]; hasFinger?: boolean; source?: readonly AnNote[]; tempoSource?: readonly { beat: number; bpm: number; }[]; end: number;
    laneSrc?: readonly AnNote[]; lanes: Set<number>; tickSrc?: FallTimedNote[]; tickTempo?: readonly { beat: number; bpm: number; }[]; tickEnd?: number;
    beatSrc?: FallTimedNote[]; beatTempo?: readonly { beat: number; bpm: number; }[]; beats?: { t: number; acc: boolean; }[]; press?: Map<number, number>; }
const FALL: FallState = { mode: 'score', raf: 0, position: 0, origin: 0, audioStart: 0, factor: 1, notes: [], hits: [], zoom: 1, geo: null, particles: [], flashes: [], lastT: null, lastFrame: 0, resume: null, end: 0, lanes: new Set() };
const FALL_SEC = 3.2, FALL_FONT = '"Hanken Grotesk",system-ui,sans-serif', FALL_SEL = '#6aa8ff', FALL_BLACK = new Set([1, 3, 6, 8, 10]), FALL_NUDGE: Readonly<Record<number, number>> = { 1: -.12, 3: .12, 6: -.16, 8: 0, 10: .16 };
// Right hand: warm coral from the app's accent family; left hand: cool teal. lit = sounding.
interface FallHandColours { a: string; b: string; lit: string[]; rgb: string; key: string[]; ink: string; }
interface FallPalette { rh: FallHandColours; lh: FallHandColours; }
const FALL_COL: FallPalette = { rh: { a: '#ffb38f', b: '#e65f3c', lit: ['#ffdccb', '#ff8257'], rgb: '255,128,92', key: ['#ffd0b8', '#f2774e'], ink: 'rgba(72,20,6,.8)' },
    lh: { a: '#8de5f2', b: '#2a96d2', lit: ['#cdf7fd', '#46c2ef'], rgb: '72,196,240', key: ['#c0f1f9', '#3caee1'], ink: 'rgba(4,36,58,.8)' } };
// Colour palettes for the two hands (RH first). "classic" is the familiar green/blue; "contrast" stays distinct for most colour-vision types.
const FALL_PAL = { etude: FALL_COL,
    classic: { rh: { a: '#9be38f', b: '#3fa83a', lit: ['#d6f8cf', '#68d35e'], rgb: '110,220,96', key: ['#c9f2c0', '#55c04a'], ink: 'rgba(8,48,6,.82)' },
        lh: { a: '#9ab8ff', b: '#3a6fe0', lit: ['#d5e2ff', '#6d97ff'], rgb: '110,150,255', key: ['#c5d6ff', '#5a85f0'], ink: 'rgba(6,22,70,.85)' } },
    contrast: { rh: { a: '#ffe27a', b: '#f2b400', lit: ['#fff4c4', '#ffcf33'], rgb: '255,205,40', key: ['#ffeaa0', '#f5c020'], ink: 'rgba(66,42,0,.85)' },
        lh: { a: '#c9a2ff', b: '#7f3ff0', lit: ['#e8d8ff', '#a173ff'], rgb: '160,110,255', key: ['#dcc5ff', '#9460f5'], ink: 'rgba(40,6,86,.85)' } } };
const FALL_YOU = ['#ffe9a8', '#f5bd3c'];
function fallPalette(name: string): FallPalette { return name === 'etude' || name === 'classic' || name === 'contrast' ? FALL_PAL[name] : FALL_COL; }
function anHasFinger() { if (FALL.fingerSrc !== AN.notes) {
    FALL.fingerSrc = AN.notes;
    FALL.hasFinger = AN.notes.some((n) => n.finger);
} return FALL.hasFinger; }
function fallData() { if (FALL.source !== AN.notes || FALL.tempoSource !== SCORE.tempoList) {
    FALL.source = AN.notes;
    FALL.tempoSource = SCORE.tempoList;
    FALL.notes = AN.notes.map((n, i) => ({ n, i, start: scoreSeconds(n.start), finish: scoreSeconds(n.end), sound: scoreSeconds(n.soundEnd ?? n.end) }));
    FALL.end = FALL.notes.length ? Math.max(...FALL.notes.map((n) => n.finish)) : 0;
} return FALL.notes; }
function fallEnd() { fallData(); return FALL.end; }
function fallTime() {
    const R = SCORE.run;
    if (!SCORE.playing || !actx || !R)
        return FALL.position;
    const { s, t } = pracRaw(R, actx.currentTime), B = PRAC.bar;
    let x = Math.min(t, s.t1);
    if (B && B.seg === s && x > B.t)
        x = B.t;
    return x;
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
function fallKeys(lo: number, hi: number, W: number) {
    const whites: number[] = [], keys = new Map<number, FallKeyRect>();
    for (let m = lo; m <= hi; m++)
        if (!FALL_BLACK.has(pc(m)))
            whites.push(m);
    const kw = W / whites.length, bw = kw * .6;
    whites.forEach((m, i) => keys.set(m, { x: i * kw, w: kw, black: false }));
    for (let m = lo; m <= hi; m++)
        if (FALL_BLACK.has(pc(m))) {
            const l = keys.get(m - 1);
            if (l)
                keys.set(m, { x: l.x + kw - bw / 2 + FALL_NUDGE[pc(m)] * bw, w: bw, black: true });
        }
    return { lo, hi, W, keys, whites, kw, bw };
}
function fallRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fallKeyPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.closePath(); }
// Crisp at any devicePixelRatio; animates only while playing (or while a burst fades), otherwise redraws on demand.
function fallName(n: AnNote) {
    const mode = PRAC.labels;
    if (mode === 'none')
        return '';
    if (mode === 'finger' && anHasFinger())
        return n.finger ? String(n.finger) : '';
    const k = anKeyAt(n.start), sp = spellMidi(n.midi, k.fifths, k.minor), sys = mode === 'solfege' ? 'solfege' : mode === 'letter' ? 'letter' : notation;
    return spelledName(sys, sp.li, sp.acc);
}
function fallDraw() {
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
    const kh = Math.round(Math.min(H * .24, Math.max(56, G.kw * 4.4))), hitY = H - kh, span = FALL_SEC / FALL.zoom, pps = hitY / span;
    G.hitY = hitY;
    G.kh = kh;
    const time = fallTime(), rm = reduceMotion(), fx = PRAC.fx && !rm, P = fallPalette(PRAC.pal), solo = PRAC.hands !== 'both';
    const ms = performance.now(), dt = FALL.lastFrame ? Math.min(.05, (ms - FALL.lastFrame) / 1000) : 0;
    FALL.lastFrame = ms;
    // stage: deep gradient, lanes for the pitches this piece uses, brighter guides at every C, bar lines with numbered pills, faint beats
    const bg = ctx.createLinearGradient(0, 0, 0, hitY);
    bg.addColorStop(0, '#050811');
    bg.addColorStop(.6, '#0a1120');
    bg.addColorStop(1, '#131c31');
    ctx.fillStyle = bg;
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
    for (const m of anMeasures()) {
        const s0 = scoreSeconds(m.start);
        if (s0 > time + span)
            break;
        if (scoreSeconds(m.end) < time)
            continue;
        const u = anBeatUnit(m);
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let b = m.start + u; b < m.end - 1e-6; b += u) {
            const y = hitY - (scoreSeconds(b) - time) * pps;
            if (y > 0 && y < hitY)
                ctx.fillRect(0, Math.round(y), W, 1);
        }
        const y = Math.round(hitY - (s0 - time) * pps);
        if (y >= 0 && y <= hitY) {
            ctx.fillStyle = 'rgba(200,212,240,.22)';
            ctx.fillRect(0, y, W, 1);
            bars.push([m.number, y]);
        }
    }
    // A–B loop: shade outside the loop range
    const L = SCORE.loop || (PRAC.A != null && PRAC.B != null ? { a: PRAC.A, b: PRAC.B } : null);
    if (L) {
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
    for (const d of fallData()) {
        if (d.start > time + span)
            break;
        if (d.finish <= time)
            continue;
        const k = G.keys.get(d.n.midi);
        if (!k)
            continue;
        const hand = anHandOf(d.n), c = hand === 'lh' ? P.lh : P.rh, mine = !solo || hand === PRAC.hands, on = time >= d.start && (!sel || sel.has(d.i));
        if (on) {
            active.set(d.n.midi, hand);
            if (from != null && d.start > from && fx)
                fallBurst(k, hitY, c);
        }
        else if (mine && d.start - time < .6 * span / FALL_SEC * FALL.zoom && !soon.has(d.n.midi))
            soon.set(d.n.midi, { k, c, a: 1 - (d.start - time) / (.6) });
        const yb = Math.min(hitY, hitY - (d.start - time) * pps), yt0 = hitY - (d.finish - time) * pps, gap = yb - yt0 > 10 ? 3 : 1, yt = yt0 + gap;
        if (yb - yt < 1)
            continue;
        const pad = k.black ? Math.max(1, k.w * .06) : Math.max(1.5, k.w * .1), x = k.x + pad, w = k.w - 2 * pad, h = yb - yt, r = Math.min(6, w * .32, h / 2);
        ctx.save();
        ctx.globalAlpha = (mine ? 1 : .3) * (.78 + .22 * Math.min(1, (d.n.vel || 96) / 110));
        const g = ctx.createLinearGradient(0, yt, 0, yb);
        g.addColorStop(0, on ? c.lit[0] : c.a);
        g.addColorStop(1, on ? c.lit[1] : c.b);
        if (on && fx) {
            ctx.shadowColor = 'rgba(' + c.rgb + ',.9)';
            ctx.shadowBlur = 22;
        }
        ctx.fillStyle = g;
        fallRR(ctx, x, yt, w, h, r);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = on ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.28)';
        ctx.lineWidth = 1;
        fallRR(ctx, x + .5, yt + .5, w - 1, h - 1, Math.max(0, r - .5));
        ctx.stroke();
        const res = PRAC.res.get(d.i);
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
    const hg = ctx.createLinearGradient(0, hitY - 34, 0, hitY);
    hg.addColorStop(0, 'rgba(120,160,255,0)');
    hg.addColorStop(1, 'rgba(150,185,255,.24)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hitY - 34, W, 34);
    if (FALL.flashes.length || FALL.particles.length)
        fallParticles(ctx, dt);
    const B = PRAC.bar && SCORE.run && time >= PRAC.bar.t - 1e-6 ? PRAC.bar : null, need = B ? [...B.need].filter((m) => !B.got.has(m)) : [];
    fallKeyboard(ctx, G, hitY, kh, W, active, P, need, ms);
    ctx.save();
    if (fx) {
        ctx.shadowColor = 'rgba(160,195,255,.95)';
        ctx.shadowBlur = 12;
    }
    ctx.fillStyle = 'rgba(240,246,255,.96)';
    ctx.fillRect(0, hitY - 2, W, 2);
    ctx.restore();
    // wait-for-me prompt, or how to start
    let msg = '';
    if (need.length && B)
        msg = t('pr_waiting', need.slice().sort((a, b) => a - b).map((m) => spellName(m, anKeyAt(B.group[0].n.start), true)).join(' '));
    else if (!SCORE.playing && time <= .01)
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
// Realistic keys: white keys with a soft gradient and front lip, glossy black keys; pressed keys light up in the hand colour and dip.
// Keys you hold yourself show in gold; keys "Wait for me" is waiting for pulse.
function fallKeyboard(ctx: CanvasRenderingContext2D, G: FallGeo, y: number, kh: number, W: number, active: Map<number, 'rh' | 'lh'>, P: FallPalette, need: number[], ms: number) {
    P = P || FALL_COL;
    const mineHeld = new Set(held.keys ? held.keys() : held), pulse = .55 + .45 * Math.sin((ms || 0) / 170), wait = new Set(need || []);
    const tint = (m: number) => { const h = active.get(m); if (h)
        return P[h].key; if (mineHeld.has(m))
        return FALL_YOU; return null; };
    ctx.fillStyle = '#110e0c';
    ctx.fillRect(0, y, W, kh);
    const r = Math.min(4, G.kw * .12), lab = labelMode !== 'none', dark = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const m of G.whites) {
        const k = G.keys.get(m);
        if (!k)
            continue;
        const c = tint(m), dip = c ? 3.5 : 0, x = k.x + .75, w = k.w - 1.5, h = kh - 1 - dip, g = ctx.createLinearGradient(0, y + dip, 0, y + dip + h);
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
        else if (dark) {
            g.addColorStop(0, '#ece5d8');
            g.addColorStop(.3, '#ded6c8');
            g.addColorStop(.8, '#d2c7b5');
            g.addColorStop(1, '#c4b7a2');
        }
        else {
            g.addColorStop(0, '#ffffff');
            g.addColorStop(.3, '#fdfcf9');
            g.addColorStop(.8, '#f5eee1');
            g.addColorStop(1, '#ebe0ce');
        }
        ctx.fillStyle = g;
        fallKeyPath(ctx, x, y + dip, w, h, r);
        ctx.fill();
        ctx.strokeStyle = c ? (c === FALL_YOU ? '#cca02d' : 'rgba(0,0,0,.25)') : (dark ? '#2a2520' : '#c2b8a7');
        ctx.lineWidth = 1;
        fallKeyPath(ctx, x, y + dip, w, h, r);
        ctx.stroke();
        if (wait.has(m)) {
            ctx.fillStyle = 'rgba(255,196,64,' + (.35 + .4 * pulse).toFixed(3) + ')';
            fallKeyPath(ctx, x, y + dip, w, h, r);
            ctx.fill();
        }
        const lip = ctx.createLinearGradient(0, y + dip + h - 7, 0, y + dip + h);
        lip.addColorStop(0, 'rgba(0,0,0,0)');
        lip.addColorStop(1, dark ? 'rgba(85,75,65,.35)' : 'rgba(180,165,140,.35)');
        ctx.fillStyle = lip;
        ctx.fillRect(x + 1, y + dip + h - 7, w - 2, 7);
        if (lab && (pc(m) === 0 || labelMode === 'all') && k.w >= 14) {
            const nm = noteName(m, false);
            ctx.font = '600 ' + Math.round(Math.min(11, Math.max(8, k.w * .3))) + 'px ' + FALL_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = c ? (dark ? '#3a2402' : '#523502') : (dark ? '#645b4c' : '#8c816f');
            ctx.fillText(pc(m) === 0 ? nm : nm.replace(/-?\d+$/, ''), x + w / 2, y + dip + h - 8, w - 2);
        }
    }
    for (const [m, k] of G.keys) {
        if (!k.black)
            continue;
        const c = tint(m), dip = c ? 4 : 0, bh = Math.round(kh * .62) - dip, x = k.x, w = k.w, br = Math.min(3, w * .15);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3.5;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        fallKeyPath(ctx, x - 1, y + dip, w + 2, bh, br);
        ctx.fill();
        ctx.restore();
        const g = ctx.createLinearGradient(0, y + dip, 0, y + dip + bh);
        if (c) {
            if (c === FALL_YOU) {
                g.addColorStop(0, '#e5b344');
                g.addColorStop(.55, '#c48c22');
                g.addColorStop(.88, '#a16f15');
                g.addColorStop(1, '#78500c');
            }
            else {
                g.addColorStop(0, c[1]);
                g.addColorStop(1, c[0]);
            }
        }
        else {
            g.addColorStop(0, '#36302a');
            g.addColorStop(.45, '#24201c');
            g.addColorStop(.78, '#181513');
            g.addColorStop(.92, '#2a2520');
            g.addColorStop(1, '#141210');
        }
        ctx.fillStyle = g;
        fallKeyPath(ctx, x, y + dip, w, bh, br);
        ctx.fill();
        ctx.strokeStyle = c ? (c === FALL_YOU ? 'rgba(255,245,190,.5)' : 'rgba(0,0,0,.6)') : '#0d0b09';
        ctx.lineWidth = 1;
        fallKeyPath(ctx, x, y + dip, w, bh, br);
        ctx.stroke();
        if (wait.has(m)) {
            ctx.fillStyle = 'rgba(255,196,64,' + (.45 + .4 * pulse).toFixed(3) + ')';
            fallKeyPath(ctx, x, y + dip, w, bh, Math.min(3, w * .15));
            ctx.fill();
        }
        if (!c) {
            ctx.strokeStyle = 'rgba(255,255,255,.16)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 1, y + dip + bh - br);
            ctx.lineTo(x + 1, y + dip + 1);
            ctx.lineTo(x + w - 1, y + dip + 1);
            ctx.stroke();
        }
    }
    const felt = ctx.createLinearGradient(0, y, 0, y + 3.5);
    felt.addColorStop(0, '#621919');
    felt.addColorStop(.5, '#8d2525');
    felt.addColorStop(1, '#461212');
    ctx.fillStyle = felt;
    ctx.fillRect(0, y, W, 3.5);
    const feltShadow = ctx.createLinearGradient(0, y + 3.5, 0, y + 7.5);
    feltShadow.addColorStop(0, 'rgba(0,0,0,.45)');
    feltShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = feltShadow;
    ctx.fillRect(0, y + 3.5, W, 4);
}
// Timeline under the stage: clock, bar ticks, loop region, A/B markers, seek slider and the current bar.
function anTlUpdate(time?: number | null) {
    const tl = byId('an-tl');
    if (!tl || tl.hidden || !AN.notes.length)
        return;
    const end = fallEnd(), pos = Math.max(0, Math.min(end, time != null ? time : fallTime())), seek = inputById('fall-seek'), pct = (x: number) => (end > 0 ? Math.max(0, Math.min(1, x / end)) * 100 : 0).toFixed(3) + '%';
    const mx = String(Math.max(.1, end));
    if (seek.max !== mx)
        seek.max = mx;
    if (document.activeElement !== seek || SCORE.playing)
        seek.value = String(pos);
    seek.style.setProperty('--p', pct(pos));
    seek.setAttribute('aria-valuetext', t('fall_valtext', anClock(pos), anClock(end)));
    const set = (id: string, v: string) => { const el = byId(id); if (el.textContent !== v)
        el.textContent = v; };
    set('fall-clock', anClock(pos));
    set('fall-total', anClock(end));
    const ms = anMeasures(), m = anMeasureAt(scoreBeatAt(pos));
    set('tl-bar', m && ms.length ? t('tl_bar', m.number, ms[ms.length - 1].number) : '');
    if (FALL.tickSrc !== fallData() || FALL.tickTempo !== SCORE.tempoList || FALL.tickEnd !== end) {
        FALL.tickSrc = fallData();
        FALL.tickTempo = SCORE.tempoList;
        FALL.tickEnd = end;
        const step = ms.length > 240 ? 8 : ms.length > 120 ? 4 : ms.length > 60 ? 2 : 1, major = ms.length > 60 ? Math.max(8, step * 4) : 4;
        byId('tl-ticks').innerHTML = ms.map((x, i) => i % step ? '' : `<i${i % major === 0 ? ' class="is-major"' : ''} style="left:${pct(scoreSeconds(x.start))}"></i>`).join('');
    }
    const L = SCORE.loop, lp = byId('tl-loop'), A = PRAC.A, B = PRAC.B, la = L ? L.a : A != null && B != null ? A : null, lb = L ? L.b : A != null && B != null ? B : null;
    lp.hidden = la == null;
    if (la != null && lb != null) {
        lp.style.left = pct(la);
        lp.style.width = (end > 0 ? (lb - la) / end * 100 : 0).toFixed(3) + '%';
    }
    ([['tl-a', A], ['tl-b', B]] as const).forEach(([id, v]) => { const el = byId(id); el.hidden = v == null; if (v != null)
        el.style.left = pct(v); });
}
// Seeking pauses while the slider moves and resumes on release if it was playing.
function fallSeek() { const pos = +inputById('fall-seek').value; if (SCORE.playing) {
    FALL.resume = SCORE.loop ? null : { sel: SCORE.sel };
    scoreHalt();
} SCORE.resume = null; FALL.position = pos; scoreIdle(); }
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
    const bh = G.hitY + G.kh * .62;
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
    handleNoteOn(m, 96, 'fall:' + e.pointerId);
    if (!FALL.raf)
        fallDraw();
}
function fallKeyUp(e: PointerEvent) { const P = FALL.press, m = P && P.get(e.pointerId); if (!P || m == null)
    return; P.delete(e.pointerId); handleNoteOff(m, 'fall:' + e.pointerId); if (!FALL.raf)
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
    if (view0() !== 'analysis' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || inField() || byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on'))
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
        pracSet('wait', !PRAC.wait);
        return;
    }
    if (K === 'm') {
        e.preventDefault();
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
// Popovers under the toolbar: one open at a time, placed under their button, closed by Esc or a click outside.
const AN_POPS = [['fall-pop', 'fall-opt'], ['an-keys-pop', 'an-keys-btn']];
function anPop(id: string, open: boolean) {
    const pair = AN_POPS.find((x) => x[0] === id) || [id, id];
    const p = byId(id), b = byId(pair[1]);
    open = !!open && !b.hidden;
    if (open) {
        AN_POPS.forEach(([q] = []) => { if (q !== id)
            anPop(q, false); });
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
    const box = byId('an-roll'), sheet = queryHtml(box, '.an-sheet');
    if (!SCORE.engine || !box.clientWidth || !sheet)
        return;
    if (SCORE.layout === 'cont') {
        if (Math.abs(box.clientWidth - SCORE.layoutWidth) > 40)
            scoreLayout();
        return;
    }
    const cs = getComputedStyle(box), avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (Math.abs(sheet.offsetWidth - Math.max(240, Math.round(Math.min(SC_PAGE_W * SCORE.zoom, avail)))) > 2)
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
    byId('an-file').addEventListener('change', (e) => { if (!(e.target instanceof HTMLInputElement) || !e.target.files)
        return; const f = e.target.files[0]; e.target.value = ''; if (f)
        anOpenFile(f); });
    byId('an-roll').addEventListener('click', (e) => { const el = eventElement(e); if (!el)
        return; if (el.closest('[data-an-open]')) {
        byId('an-file').click();
        return;
    } const ex = el.closest('.an-ex'); if (ex instanceof HTMLButtonElement && !ex.disabled && ex.dataset.piece != null)
        anLoadExample(ex.dataset.piece); });
    byId('an-example').addEventListener('change', (e) => { if (e.target instanceof HTMLSelectElement && e.target.value)
        anLoadExample(e.target.value); });
    ['an-hands', 'an-grid', 'an-keysel'].forEach((id) => byId(id).addEventListener('change', anReconChange));
    byId('an-recon-btn').addEventListener('click', () => anReconOpen(!!byId('an-recon').hidden));
    document.addEventListener('pointerdown', (e) => {
        const el = eventElement(e);
        if (!el)
            return;
        if (!byId('an-recon').hidden && !el.closest('#an-recon,#an-recon-btn'))
            anReconOpen(false);
        AN_POPS.forEach(([p, b] = []) => { if (!byId(p).hidden && !el.closest('#' + p + ',#' + b))
            anPop(p, false); });
    });
    byId('an-recon-btn').addEventListener('click', () => AN_POPS.forEach(([p] = []) => anPop(p, false)));
    AN_POPS.forEach(([p, b] = []) => byId(b).addEventListener('click', () => anPop(p, !!byId(p).hidden)));
    pracLoad();
    const ck = { 'pr-countin': 'countIn', 'pr-acc': 'acc', 'pr-hear': 'hear', 'pr-ramp': 'ramp', 'fall-fx': 'fx' } as const;
    Object.entries(ck).forEach(([id, k]) => { inputById(id).checked = PRAC[k]; inputById(id).addEventListener('change', (e) => { if (e.target instanceof HTMLInputElement)
        pracSet(k, e.target.checked); }); });
    ([['fall-labels', 'labels'], ['fall-pal', 'pal'], ['fall-range', 'range']] as const).forEach(([id, k]) => { selectById(id).value = PRAC[k]; selectById(id).addEventListener('change', (e) => { if (e.target instanceof HTMLSelectElement)
        pracSet(k, e.target.value); }); });
    const look = inputById('fall-look'), lookOut = () => { byId('fall-look-v').textContent = (+look.value).toFixed(1) + ' s'; };
    look.value = String(Math.round(FALL_SEC / FALL.zoom * 5) / 5);
    lookOut();
    look.addEventListener('input', () => { FALL.zoom = FALL_SEC / +look.value; lookOut(); pracSave(); anUpdateControls(); fallDraw(); });
    byId('pr-hands').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-h]'); if (b && b.dataset.h != null)
        pracSet('hands', b.dataset.h); });
    byId('pr-wait').addEventListener('click', () => pracSet('wait', !PRAC.wait));
    byId('an-metro').addEventListener('click', () => pracSet('metro', !PRAC.metro));
    byId('pr-seta').addEventListener('click', () => pracSetAB('A'));
    byId('pr-setb').addEventListener('click', () => pracSetAB('B'));
    byId('pr-clrab').addEventListener('click', pracClearAB);
    byId('pr-again').addEventListener('click', () => { pracSumClose(); scorePlay(false, 0); });
    byId('pr-slower').addEventListener('click', () => { pracSumClose(); const sel = selectById('score-speed'), o = [...sel.options].map((x) => +x.value), cur = +sel.value, v = o.filter((x) => x < cur).pop(); if (v)
        sel.value = String(v); pracHud(); scorePlay(false, 0); });
    byId('pr-close').addEventListener('click', pracSumClose);
    byId('pr-sum-next').addEventListener('click', (e) => { if (eventClosest(e, '#pr-next-act') && PRAC.next && PRAC.next.act)
        PRAC.next.act.run(); });
    byId('pr-sum').addEventListener('pointerdown', (e) => { if (e.target === e.currentTarget)
        pracSumClose(); });
    byId('an-clear').addEventListener('click', anClearSelection);
    byId('an-play').addEventListener('click', () => scorePlay(true));
    byId('an-loop').addEventListener('click', () => { if (SCORE.loop)
        scoreStop();
    else
        scoreLoopStart(); });
    byId('score-play').addEventListener('click', scoreToggle);
    byId('score-stop').addEventListener('click', scoreStop);
    byId('sc-start').addEventListener('click', scoreHome);
    const speed = () => { pracHud(); anUpdateControls(); if (!SCORE.playing)
        return; if (SCORE.loop)
        scoreLoopStart();
    else
        scorePlay(SCORE.sel, fallTime()); };
    byId('score-speed').addEventListener('change', speed);
    queryAllHtml(document, '[data-score-mode]').forEach((b) => b.addEventListener('click', () => { if (!(b instanceof HTMLButtonElement && b.disabled))
        scoreSetView(b.dataset.scoreMode); }));
    byId('sc-zoom-out').addEventListener('click', () => scoreZoom(anZoomNow() - 0.1));
    byId('sc-zoom-in').addEventListener('click', () => scoreZoom(anZoomNow() + 0.1));
    byId('sc-zoom-reset').addEventListener('click', () => scoreZoom(1));
    byId('sc-look').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b instanceof HTMLButtonElement && !b.disabled && b.dataset.v != null)
        scoreSetLook(b.dataset.v); });
    byId('sc-hl').addEventListener('click', () => scoreSetHl(!SCORE.hl));
    byId('an-kb').addEventListener('click', () => dockSet(!dockOpen()));
    const seek = byId('fall-seek');
    seek.addEventListener('input', fallSeek);
    seek.addEventListener('change', fallSeekEnd);
    const fc = byId('fall-canvas');
    fc.addEventListener('click', fallSelect);
    fc.addEventListener('pointermove', fallHover);
    fc.addEventListener('pointerdown', fallKeyDown);
    (['pointerup', 'pointercancel', 'pointerleave'] as const).forEach((ev) => fc.addEventListener(ev, fallKeyUp));
    const roll = byId('an-roll');
    roll.addEventListener('pointerdown', scorePointer);
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
    byId('pr-opt').addEventListener('click', () => anOpenTab('practice'));
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
    byId('an-practice').addEventListener('click', anPractice);
    anSideResizer();
    anTab(SIDE.tab);
    (window).matchMedia('(max-width: 999px)').addEventListener('change', () => { SIDE.sheet = false; anSideSync(); anLayoutVars(); });
    // drag & dropwhere on the analysis view; the drop zone (or the score) shows the target state
    let depth = 0;
    const files = (e: DragEvent): e is DragEvent & { dataTransfer: DataTransfer } => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const over = (on: boolean) => { const drop = maybeById('an-drop'), tt = maybeById('an-drop-t'); byId('an-roll').classList.toggle('is-over', on && !!SCORE.xml); if (drop)
        drop.classList.toggle('is-over', on); if (tt)
        tt.textContent = t(on ? 'an_drop_over' : 'an_drop_t'); };
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
    // Header, toolbar, status bar and dock sizes feed the viewport height; the viewport size drives redraws and re-layout.
    let rq = 0;
    const vars = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(anLayoutVars); };
    // border-box: a safe-area inset only changes padding, which a content-box observer would miss
    const ro = new ResizeObserver(vars);
    [(document).querySelector('header'), byId('dock'), byId('an-tbwrap'), byId('an-status')].forEach((el) => { if (el)
        ro.observe(el, { box: 'border-box' }); });
    let lastW = 0, lastH = 0;
    new ResizeObserver((entries) => { const r = entries[0].contentRect, w = Math.round(r.width), h = Math.round(r.height); if (w === lastW && h === lastH)
        return; lastW = w; lastH = h; anStageFit(); }).observe(byId('an-stage'));
    window.addEventListener('resize', vars);
    window.addEventListener('scroll', anPinToolbarLater, { passive: true });
    const dpr = () => (matchMedia)('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)').addEventListener('change', () => { if (FALL.mode === 'fall')
        fallDraw(); dpr(); }, { once: true });
    dpr();
    anLayoutVars();
}
/* ---------- PROGRESS ---------- */
function renderProgress() {
    const acc = data.totalReviews ? Math.round(100 * data.totalCorrect / data.totalReviews) : 0;
    byId('prog-empty').hidden = (data.totalReviews || 0) > 0;
    byId('progStats').innerHTML =
        statHTML(currentStreak(), t('st_streak')) + statHTML(data.bestStreak || 0, t('st_best')) +
            statHTML(masteredCount() + ' / ' + ITEMS.length, t('st_mastered')) +
            statHTML(data.totalReviews || 0, t('st_reviews')) + statHTML(acc + '%', t('st_acc'));
    // mastery rows + answer accuracy per topic (from each concept's review history)
    const mr = byId('masteryRows');
    mr.innerHTML = '';
    Object.keys(CATS).forEach((cat) => {
        const items = ITEMS.filter((it) => it.cat === cat);
        const score = items.reduce((s, it) => s + Math.min(boxOf(it.id), 6), 0);
        const max = items.length * 6;
        const pct = Math.round(100 * score / max);
        const mastered = items.filter((it) => boxOf(it.id) >= 4).length;
        let reps = 0, lapses = 0;
        items.forEach((it) => { const r = data.srs[it.id]; if (r) {
            reps += r.reps || 0;
            lapses += r.lapses || 0;
        } });
        const accLine = reps ? t('cat_acc_line', Math.round(100 * Math.max(0, reps - lapses) / reps), reps) : t('cat_acc_none');
        const row = (document).createElement('div');
        row.className = 'mrow';
        row.innerHTML = '<div class="top"><b>' + catLabel(cat) + '</b><span>' + mastered + '/' + items.length + ' ' + t('mastered_of') + '</span></div><div class="mbar" role="img" aria-label="' + catLabel(cat) + ': ' + pct + '%"><i style="width:' + pct + '%"></i></div><div class="acc">' + accLine + '</div>';
        mr.appendChild(row);
    });
    // weakest concepts → one click to drill that topic
    const weak = ITEMS.map((it) => ({ it, r: data.srs[it.id] })).filter((x) => x.r && x.r.reps >= 2 && x.r.lapses > 0).sort((a, b) => (b.r.lapses / b.r.reps) - (a.r.lapses / a.r.reps) || a.r.box - b.r.box).slice(0, 6);
    byId('weak-wrap').hidden = !weak.length;
    const wl = byId('weakList');
    wl.innerHTML = '';
    weak.forEach(({ it, r }) => { const b = (document).createElement('button'); b.type = 'button'; b.innerHTML = itemLabel(it) + '<small>' + catLabel(it.cat) + ' · ' + t('weak_acc', Math.round(100 * Math.max(0, r.reps - r.lapses) / r.reps), r.reps) + '</small>'; b.addEventListener('click', () => { show('practice'); selectById('pr-cat').value = it.cat; byId('pr-start').focus(); }); wl.appendChild(b); });
    // forecast next 7 days
    const fc = byId('forecast');
    fc.innerHTML = '';
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const tn = todayN();
    ITEMS.forEach((it) => { const s = data.srs[it.id]; if (s && s.reps > 0) {
        const d = Math.max(0, s.due - tn);
        if (d < 7)
            counts[d]++;
    } });
    const maxc = Math.max(1, ...counts);
    const loc = LOCALE_TAGS[lang] || lang;
    const names = counts.map((_, i) => i === 0 ? t('fc_today') : new Date((tn + i) * 86400000).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }));
    counts.forEach((c, i) => { const day = (document).createElement('div'); day.className = 'day'; day.innerHTML = '<i style="height:' + (c / maxc * 60 + 3) + 'px" title="' + c + '"></i><span>' + names[i] + '</span><span class="num" style="color:var(--ink)">' + c + '</span>'; fc.appendChild(day); });
    const fcAny = counts.some((c) => c > 0);
    fc.hidden = !fcAny;
    byId('fc-none').hidden = fcAny;
    // practice heatmap — last 12 weeks
    const hm = byId('heatmap');
    if (hm) {
        hm.innerHTML = '';
        const h: Record<number, number> = data.history || {};
        const days = 84, start = tn - days + 1;
        let active = 0, sum = 0;
        const pad = new Date(start * 86400000).getUTCDay(); // day numbers are UTC-based
        for (let i = 0; i < pad; i++) {
            const x = (document).createElement('i');
            x.style.visibility = 'hidden';
            hm.appendChild(x);
        }
        for (let d = start; d <= tn; d++) {
            const c = h[d] || 0;
            const x = (document).createElement('i');
            if (c) {
                active++;
                sum += c;
            }
            x.dataset.l = String(c === 0 ? 0 : c < 5 ? 1 : c < 12 ? 2 : c < 20 ? 3 : 4);
            x.title = new Date(d * 86400000).toLocaleDateString(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' · ' + c + ' ' + t('reviews_word');
            hm.appendChild(x);
        }
        const meta = t('heat_meta', active, sum);
        hm.setAttribute('aria-label', t('heat_aria') + ' — ' + meta);
        const sw = ['var(--line)', '#d8c79a', 'var(--gold)', '#7fae8b', 'var(--good)'].map((c) => '<i style="background:' + c + '"></i>').join('');
        byId('heat-meta').innerHTML = '<span>' + meta + '</span><span class="hm-key" aria-hidden="true">' + t('heat_less') + ' ' + sw + ' ' + t('heat_more') + '</span>';
    }
    // every concept, grouped by topic
    const g = byId('itemGrid');
    g.innerHTML = '';
    Object.keys(CATS).forEach((cat) => {
        const sec = (document).createElement('div');
        sec.className = 'ig-cat';
        sec.innerHTML = '<h3>' + catLabel(cat) + '</h3>';
        const grid = (document).createElement('div');
        grid.className = 'grid-items';
        ITEMS.filter((it) => it.cat === cat).forEach((it) => {
            const b = boxOf(it.id);
            const c = (document).createElement('div');
            c.className = 'cell';
            c.dataset.b = String(b);
            const lbl = itemLabel(it);
            const st = isNew(it.id) ? t('grid_new') : (t('grid_box') + ' ' + b);
            c.title = lbl + ' — ' + st;
            c.setAttribute('role', 'img');
            c.setAttribute('aria-label', lbl + ' — ' + st);
            c.textContent = (it.cat === 'interval' || it.cat === 'chord') ? it.short : lbl.replace(/\s*\(.*\)\s*/, '');
            grid.appendChild(c);
        });
        sec.appendChild(grid);
        g.appendChild(sec);
    });
}
function statHTML(v: string|number, l: string) { return '<div class="s"><b class="num">' + v + '</b><span>' + l + '</span></div>'; }
/* ---------- TODAY: daily plan ---------- */
function toolName(v: string) { return t(v === 'practice' ? 'nav_drills' : 'nav_' + v); }
interface DailyPlanTask { id: string; done: boolean; partial?: boolean; prog?: number; pill?: string; t: string; d: string; go: () => void }
function renderPlan() {
    const list = byId('plan-list');
    if (!list)
        return;
    const tn = todayN();
    const goal = data.settings.goal, done = data.todayDay === tn ? (data.todayCount || 0) : 0;
    const td = data.toolDay || {}, ear = data.earDay === tn ? (data.earToday || 0) : 0;
    const items: DailyPlanTask[] = [
        { id: 'review', done: done >= goal, partial: done > 0 && done < goal, prog: goal ? Math.min(1, done / goal) : 0, pill: Math.min(done, goal) + '/' + goal, t: t('plan_review'), d: done >= goal ? t('plan_review_done') : t('plan_review_d', done, goal), go: () => { if (!SES.active)
                startSession(null); } },
        ...learnPlanItems(tn),
        { id: 'read', done: td.read === tn, t: t('plan_read'), d: t('plan_read_d'), go: () => show('read') },
        { id: 'ear', done: ear >= 5, partial: ear > 0 && ear < 5, prog: Math.min(1, ear / 5), pill: Math.min(ear, 5) + '/5', t: t('plan_ear'), d: ear ? t('plan_ear_dn', Math.min(ear, 5)) : t('plan_ear_d'), go: () => { show('songs'); byId('sq-go').focus(); } },
    ];
    const nextIdx = items.findIndex((i) => !i.done);
    list.innerHTML = '';
    items.forEach((it, idx) => {
        const li = (document).createElement('li'), b = (document).createElement('button'), isNext = idx === nextIdx, isPart = !it.done && !!it.partial;
        b.type = 'button';
        b.className = 'plan-item';
        b.dataset.plan = it.id;
        b.dataset.done = it.done ? 'true' : 'false';
        if (isNext)
            b.dataset.next = 'true';
        if (isPart)
            b.dataset.partial = 'true';
        const ckTxt = it.done ? '✓' : String(idx + 1);
        const pillHtml = it.pill ? '<span class="plan-pill">' + it.pill + '</span>' : '';
        const barHtml = (isPart && it.prog !== undefined && it.prog > 0) ? '<span class="plan-bar" aria-hidden="true"><i style="width:' + Math.round(it.prog * 100) + '%"></i></span>' : '';
        b.innerHTML = '<span class="ck" aria-hidden="true">' + ckTxt + '</span><span class="pt">' + it.t + (it.done ? '<span class="visually-hidden"> — ' + t('done_today') + '</span>' : '') + '</span><span class="pd">' + it.d + '</span><span class="plan-end" aria-hidden="true">' + pillHtml + '<span class="plan-go">→</span></span>' + barHtml;
        b.addEventListener('click', it.go);
        li.appendChild(b);
        list.appendChild(li);
    });
    byId('plan-sub').textContent = t('plan_sub', items.filter((i) => i.done).length, items.length);
    const segs = byId('plan-segs');
    if (segs) {
        segs.innerHTML = items.map((it, idx) => '<i data-state="' + (it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo') + '"></i>').join('');
    }
    const nextIt = nextIdx >= 0 ? items[nextIdx] : null, lt = data.lastTool, cb = byId('plan-continue');
    if (nextIt) {
        cb.hidden = false;
        cb.textContent = t('plan_continue', nextIt.t);
        cb.onclick = nextIt.go;
    }
    else if (lt && lt !== 'today' && navGroup(lt)) {
        cb.hidden = false;
        cb.textContent = t('plan_continue', toolName(lt));
        cb.onclick = () => show(lt);
    }
    else
        cb.hidden = true;
}
/* ---------- PRACTICE: last drill result ---------- */
function prRecordDrill() { if (!SES.targeted || !SES.total)
    return; const tg = SES.targeted; data.lastDrill = { cat: tg.cat, mode: tg.mode, keys: tg.mode === 'ear' && (tg.cat === 'melody' || !!data.settings.earKeys), key: tg.key, c: SES.correct, n: SES.total, day: todayN() }; saveAll(); }
function renderPracticeLast() {
    const el = byId('pr-last');
    if (!el)
        return;
    const d = data.lastDrill;
    if (!d || !d.n || (!(isCatKey(d.cat) && CATS[d.cat]) && d.cat !== 'melody')) {
        el.hidden = true;
        return;
    }
    const pct = Math.round(100 * d.c / d.n);
    el.hidden = false;
    el.className = 'verdict ' + (pct >= 80 ? 'good' : 'neutral');
    el.textContent = t('pr_last', (d.cat === 'melody' ? t('cat_melody') : catLabel(d.cat)) + ' · ' + t(d.keys ? 'pr_onkeys' : d.mode === 'ear' ? 'pr_byear' : 'pr_playit')) + ' — ' + t('pr_last_res', d.c, d.n) + ' (' + pct + '%)';
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
    r.innerHTML = '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - acc / 100)) + '" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" dy=".35em" font-family="var(--serif)" font-weight="900" font-size="26" fill="var(--ink)">' + acc + '%</text>';
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
/* ============================================================================
   PERSISTENCE  (versioned, migrates V2)
   ============================================================================ */
function clampPersistedNumber(v: unknown, min: number, max: number, fallback: number) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback; }
/* ---- several open tabs ----
   Each tab keeps the whole record in memory and saves all of it, so a plain write would wipe out whatever another tab saved
   in the meantime. Every write identifies its parent and each tab retains a short history of prior records. Before every
   write, and whenever another tab writes (the `storage` event), sibling records are merged three ways against their actual
   shared parent: a value only one side changed keeps that change; if both changed, counters add both increments, day stamps,
   bests and stars keep the larger value, a review card keeps the copy with more reviews, and anything else keeps this tab's
   value. The history holds private copies, so later changes in memory cannot alter a base. A save that merges in a record
   the other tab had not seen also names that record (`syncMerge`), and the tab keeps the plain merge of the two: when several
   tabs merge the same pair at once, that merge (or the first such save taken in) is their shared base, so nothing counts
   twice. Reset and import stamp a newer generation (`gen`) that other tabs adopt outright, with a notice, and a save from an
   older generation is overwritten again, so cleared progress cannot come back. A session running in this tab is never
   stopped or rebuilt: it carries on and saves into the merged record. Theme, language, note names and key labels follow the
   latest change made in any tab; the last three re-render the page and keyboard, so they wait while a drill, reading run or
   playback is going. Sound, device and panel choices stay with each tab (whichever saved last is what loads next time). */
type SyncPrefName = 'theme' | 'lang' | 'notation' | 'labels';
interface SyncPendingPref { v: unknown; from: string }
interface SyncState {
    raw: string | null;
    gen: string;
    id: string;
    known: Map<string, storage.PttV3Payload>;
    merge: { into: string; id: string } | null;
    pend: Partial<Record<SyncPrefName, SyncPendingPref>>;
    t: number | ReturnType<typeof setTimeout>;
    w: number | ReturnType<typeof setTimeout>;
}
interface SyncNoBase { readonly syncNoBase?: undefined }
const SYNC: SyncState = { raw: null, gen: '', id: '', known: new Map(), merge: null, pend: {}, t: 0, w: 0 }, SYNC_NONE: SyncNoBase = {}, SYNC_ID = /^[a-z0-9_-]{1,48}$/i; // SYNC_NONE: no shared base, so counters keep the larger side instead of adding
const SYNC_ADD = /^(totalReviews|totalCorrect|history\.\d+|reading\.tot\.\w+|reading\.nt\..+\.(n|ok|ms)|reading\.lv\..+\.n|learnRev\..+\.n)$/;
const SYNC_MAX = /^(bestStreak|placed|singCleared\..+|sheet\..+\.(best|learned)|learnDone\..+|learnRev\..+\.(last|rv)|learnUnlock\..+|toolDay\..+|reading\.lv\..+\.(s|acc|rush))$/;
const SYNC_THEMES = ['auto', 'light', 'dark'] as const, SYNC_NOTATIONS = ['letter', 'solfege', 'german'] as const, SYNC_LABELS = ['c', 'all', 'none'] as const;
const SYNC_TONES = ['piano', 'piano-synth', 'soft', 'bright', 'organ', 'mellow', 'glass'] as const;
function syncOneOf<T extends string>(list: readonly T[], v: unknown): v is T { return list.some((x) => x === v); }
function syncIsLang(v: unknown): v is RuntimeLanguage { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(STRINGS, v); }
// Every non-null object, arrays included, reads as string keys holding JSON values.
function syncIsObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object'; }
function syncHasBase<T extends object>(x: T | SyncNoBase): x is T { return x !== SYNC_NONE; }
const syncParseJson: (text: string) => unknown = JSON.parse;
type SyncPrefEntry = readonly [get: () => string, set: (v: unknown) => void, later?: 1];
const SYNC_PREFS: Record<SyncPrefName, SyncPrefEntry> = { theme: [() => theme, (v: unknown) => { if (syncOneOf(SYNC_THEMES, v)) {
            theme = v;
            applyTheme();
        } }],
    lang: [() => lang, (v: unknown) => { if (syncIsLang(v)) {
            setLang(v);
            setTimeout(rdOnLocale, 0);
        } }, 1],
    notation: [() => notation, (v: unknown) => { if (syncOneOf(SYNC_NOTATIONS, v)) {
            notation = v;
            applyNotation();
            refreshToday();
            setTimeout(rdOnLocale, 0);
        } }, 1],
    labels: [() => labelMode, (v: unknown) => { if (syncOneOf(SYNC_LABELS, v)) {
            labelMode = v;
            buildKeyboard();
            repaintHeld();
        } }, 1] };
function syncIsPrefName(k: string): k is SyncPrefName { return Object.prototype.hasOwnProperty.call(SYNC_PREFS, k); }
function syncGen() { return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8); } // sorts by time
function syncId(p: unknown, raw: string|null) {
    if (syncIsObject(p) && typeof p.syncId === 'string' && SYNC_ID.test(p.syncId))
        return p.syncId;
    const s = typeof raw === 'string' ? raw : JSON.stringify(p || {});
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return 'h' + (h >>> 0).toString(36);
}
function syncRemember(id: string, p: unknown) {
    if (!id || !isBackupPayload(p))
        return;
    SYNC.known.delete(id);
    SYNC.known.set(id, p);
    while (SYNC.known.size > 16) {
        const oldest = SYNC.known.keys().next();
        if (oldest.done)
            break;
        SYNC.known.delete(oldest.value);
    }
}
function syncCurrent(raw: string) { const p = syncParseJson(raw); SYNC.raw = raw; SYNC.id = syncId(p, raw); syncRemember(SYNC.id, p); } // its own copy: data may share objects with the record it was read from
function syncPair(a: string, b: string) { return 'merge:' + [a, b].sort().join('+'); }
// A JSON round trip of a record is again a record, so the fallback never runs.
function syncCloneData(d: Record<string, unknown>) { const copy = syncParseJson(JSON.stringify(d)); return isRecord(copy) ? copy : {}; }
function syncInitial() {
    const p = { v: 3, gen: SYNC.gen, data: syncCloneData(data) };
    SYNC.id = 'init';
    SYNC.raw = null;
    syncRemember(SYNC.id, p);
}
function syncSame(a: unknown, b: unknown): boolean {
    if (a === b)
        return true;
    if (!a || !b || !syncIsObject(a) || !syncIsObject(b))
        return false;
    const k = Object.keys(a);
    const right = b;
    return k.length === Object.keys(right).length && k.every((x) => Object.prototype.hasOwnProperty.call(right, x) && syncSame(a[x], right[x]));
}
function syncSrsPair(b: unknown, l: unknown, r: unknown) {
    if (b === SYNC_NONE || !isRecord(l) || !isRecord(r))
        return null;
    const base = isRecord(b) ? b : { box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 };
    const left = l, right = r;
    const reps = (x: Record<string,unknown>) => Math.max(0, Math.floor(Number(x.reps) || 0)), lapses = (x: Record<string,unknown>) => Math.max(0, Math.floor(Number(x.lapses) || 0));
    const br = reps(base), bl = lapses(base), lr = reps(left), rr = reps(right), wrong = (x: Record<string,unknown>) => lapses(x) === bl ? false : lapses(x) === bl + 1 ? true : null, lw = wrong(left), rw = wrong(right);
    if (lr !== br + 1 || rr !== br + 1 || lw === null || rw === null)
        return null;
    return { base: { ...base, box: Math.max(0, Math.min(7, Math.round(Number(base.box) || 0))), ease: Math.max(1.6, Math.min(2.9, Number(base.ease) || 2.3)), reps: br, lapses: bl }, baseReps: br, wrong: [lw, rw], day: Math.max(Number(base.last) || 0, Number(left.last) || 0, Number(right.last) || 0) || todayN() };
}
interface SyncSrsCard { box: number; ease: number; reps: number; lapses: number; due?: number; last?: number }
function syncSrs(b: unknown, l: unknown, r: unknown) {
    const pair = syncSrsPair(b, l, r);
    if (!pair) {
        if (!isRecord(l) || !isRecord(r))
            return isRecord(l) ? l : r;
        const left = l, right = r;
        return (Number(right.reps) || 0) > (Number(left.reps) || 0) || (Number(right.reps) || 0) === (Number(left.reps) || 0) && (Number(right.last) || 0) > (Number(left.last) || 0) ? right : left;
    }
    const out: SyncSrsCard = { ...pair.base };
    pair.wrong.sort((a, b) => Number(b) - Number(a)).forEach((wrong) => { out.reps++; if (!wrong) {
        out.box = Math.min(7, out.box + 1);
        out.ease = Math.min(2.9, out.ease + .05);
    }
    else {
        out.box = 1;
        out.lapses++;
        out.ease = Math.max(1.6, out.ease - .2);
    } const days = IVL[out.box] !== undefined ? IVL[out.box] : 120; out.due = pair.day + Math.max(0, Math.round(days * (out.ease / 2.3))); out.last = pair.day; });
    return out;
}
function syncNewCollisions(b: Record<string, unknown> | SyncNoBase, l: unknown, r: unknown) {
    if (!syncHasBase(b) || !isRecord(l) || !isRecord(r))
        return [];
    const bs: Record<string, unknown> = isRecord(b.srs) ? b.srs : {}, ls: Record<string, unknown> = isRecord(l.srs) ? l.srs : {}, rs: Record<string, unknown> = isRecord(r.srs) ? r.srs : {};
    return [...new Set([...Object.keys(ls), ...Object.keys(rs)])].flatMap((k) => { const pair = syncSrsPair(bs[k], ls[k], rs[k]); return pair && pair.baseReps === 0 ? [pair.day] : []; });
}
function syncPick(b: unknown, l: unknown, r: unknown, p: string) {
    if (l === undefined || r === undefined)
        return l === undefined ? r : l; // one tab deleted what the other changed: keep the data
    if (p.startsWith('srs.'))
        return syncSrs(b, l, r);
    if (p === 'lastDrill')
        return (Number(syncIsObject(r) ? r.day : undefined) || 0) > (Number(syncIsObject(l) ? l.day : undefined) || 0) ? r : l;
    if (typeof l === 'number' && typeof r === 'number') {
        if (SYNC_ADD.test(p))
            return b === SYNC_NONE ? Math.max(l, r) : Math.max(0, l + r - (typeof b === 'number' ? b : 0));
        if (SYNC_MAX.test(p))
            return Math.max(l, r);
    }
    if (typeof l === 'boolean' && typeof r === 'boolean' && SYNC_MAX.test(p))
        return l || r;
    return l;
}
function syncInto(l: Record<string,unknown>, b: unknown, r: Record<string,unknown>, p: string) {
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach((k) => {
        const q = p ? p + '.' + k : k, none = b === SYNC_NONE, bk = none ? b : isRecord(b) ? b[k] : undefined, lv = l[k], rv = r[k], srs = /^srs\./.test(q);
        if (!none && syncSame(rv, bk))
            return; // the other tab left it alone
        if (isRecord(lv) && isRecord(rv) && !/^srs\.|^lastDrill$/.test(q)) {
            syncInto(lv, bk, rv, q);
            return;
        } // field by field, keeping this tab's objects
        const v = !none && syncSame(lv, bk) ? rv : // only the other tab changed it
            syncSame(lv, rv) && !SYNC_ADD.test(q) && !srs ? lv : syncPick(bk, lv, rv, q); // both did
        if (v === undefined)
            delete l[k];
        else
            l[k] = v;
    });
}
// todayCount/newToday count the day in todayDay (earToday the day in earDay): only the later day's counts survive, and same-day counts add up.
function syncData(b: Record<string, unknown> | SyncNoBase, l: Record<string, unknown>, r: Record<string, unknown>) {
    const day: Record<string, number> = {}, left = l, right = r, repeatedNew = syncNewCollisions(b, l, r);
    [['todayDay', 'todayCount', 'newToday'], ['earDay', 'earToday']].forEach(([dk, ...ks]) => {
        if (left[dk] === undefined && right[dk] === undefined)
            return;
        const d = Math.max(Number(left[dk]) || 0, Number(right[dk]) || 0), on = (x: unknown): x is Record<string, unknown> => x !== SYNC_NONE && isRecord(x) && (Number(x[dk]) || 0) === d;
        day[dk] = d;
        ks.forEach((k) => { const n = (x: unknown) => on(x) ? (Number(x[k]) || 0) : 0; day[k] = b === SYNC_NONE ? Math.max(n(l), n(r)) : Math.max(0, n(l) + n(r) - n(b)); });
    });
    if (repeatedNew.length && day.todayDay !== undefined)
        day.newToday = Math.max(0, (Number(day.newToday) || 0) - repeatedNew.filter((d) => d === day.todayDay).length);
    day.streak = Math.max(0, ...[l, r].filter((x) => (Number(x.todayDay) || 0) === day.todayDay).map((x) => Number(x.streak) || 0));
    day.lastActive = Math.max(Number(l.lastActive) || 0, Number(r.lastActive) || 0);
    syncInto(l, b, r, '');
    Object.assign(l, day);
}
function syncPref(f: SyncPrefName, v: string) { const p = SYNC.pend[f]; return p && p.from === v ? p.v : v; } // another tab's choice that is still waiting here is what gets saved
// Folds in what another tab stored since SYNC.raw. Returns '' (nothing new), 'merge', 'merge-save' (the merged state must
// be persisted), 'swap' (that tab reset or imported the record) or 'old' (it saved over this tab's newer reset or import).
let syncPull = function syncPull() {
    let stored: storage.ReadPttResult | null = null;
    try {
        stored = readPttV3(localStorage, KEY);
    }
    catch (_) { }
    const cur = stored?.raw || null;
    if (cur === null || cur === SYNC.raw)
        return '';
    let rp: storage.PttV3Payload | null = null, bp: storage.PttV3Payload | SyncNoBase = SYNC_NONE, lp: storage.PttV3Payload | null = null;
    rp = stored?.payload || null;
    if (!isBackupPayload(rp))
        return '';
    const gen = typeof rp.gen === 'string' ? rp.gen : '', swap = gen > SYNC.gen;
    if (gen < SYNC.gen)
        return 'old';
    lp = parsePttV3(SYNC.raw);
    if (lp) {
        syncRemember(syncId(lp, SYNC.raw), lp);
        bp = lp;
    }
    const parent = typeof rp.syncParent === 'string' ? rp.syncParent : '', pair = parent && typeof rp.syncMerge === 'string' && SYNC_ID.test(rp.syncMerge) ? syncPair(parent, rp.syncMerge) : '';
    const ancestor = pair && SYNC.known.get(pair) || parent && SYNC.known.get(parent); // a merge of the same pair made or taken in here is the real shared base
    if (ancestor && (typeof ancestor.gen === 'string' ? ancestor.gen : '') === gen)
        bp = ancestor;
    const lid = SYNC.id, sibling = !swap && parent && lp && lp.syncParent === parent && lid !== syncId(rp, cur), sameData = !swap && syncSame(data, rp.data) && !sibling;
    if (swap) {
        data = Object.assign(freshData(), rp.data);
        SYNC.gen = gen;
        SYNC.known.clear();
        SYNC.merge = null;
    }
    else if (!sameData)
        syncData(!syncHasBase(bp) ? bp : bp.data, data, rp.data);
    data.settings = restoreSettings(data.settings);
    if (!isRecord(data.srs))
        data.srs = {};
    if (syncHasBase(bp))
        Object.keys(SYNC_PREFS).filter(syncIsPrefName).forEach((f) => {
            const [get, set, later] = SYNC_PREFS[f], v = rp[f];
            if (v === undefined || v === bp[f] || syncPref(f, get()) !== bp[f])
                return; // the other tab did not change it, or this tab changed it too
            if (v === get())
                delete SYNC.pend[f];
            else if (later)
                SYNC.pend[f] = { v, from: get() };
            else
                set(v);
        });
    const needsWrite = !swap && !syncSame(data, rp.data);
    syncCurrent(cur);
    if (needsWrite && isBackupPayload(lp) && parent !== lid && syncHasBase(bp)) { // theirs lacks this tab's record: keep the plain merge of the two for the save that follows
        const merged: Record<string, unknown> & { data: Record<string, unknown> } = { v: 3, gen, data: syncCloneData(lp.data) };
        syncData(bp.data, merged.data, rp.data);
        Object.keys(SYNC_PREFS).filter(syncIsPrefName).forEach((f) => { merged[f] = syncPref(f, SYNC_PREFS[f][0]()); });
        syncRemember(syncPair(SYNC.id, lid), merged);
        SYNC.merge = { into: SYNC.id, id: lid };
    }
    if (pair && !SYNC.known.has(pair))
        syncRemember(pair, SYNC.known.get(SYNC.id));
    return swap ? 'swap' : needsWrite ? 'merge-save' : 'merge';
};
function syncBusy() { return SES.active || sing.active || SR.active || RD.on || accomp.on || trx.on || SCORE.playing; }
function syncIdle() {
    clearTimeout(SYNC.w);
    if (!Object.keys(SYNC.pend).length)
        return;
    if (syncBusy()) {
        SYNC.w = setTimeout(syncIdle, 1500);
        return;
    }
    Object.keys(SYNC.pend).filter(syncIsPrefName).forEach((f) => { const p = SYNC.pend[f]; if (!p)
        return; delete SYNC.pend[f]; if (SYNC_PREFS[f][0]() === p.from)
        SYNC_PREFS[f][1](p.v); });
}
function syncNote(on: boolean) { const n = byId('syncNote'); if (n)
    n.hidden = !on; }
// Re-rendering waits for a fresh task, so a save made in the middle of drawing something is never re-entered.
function syncAfter(got: string) { if (got === 'swap')
    syncNote(true); clearTimeout(SYNC.t); SYNC.t = setTimeout(syncRefresh, 0); }
function syncRefresh() {
    syncIdle();
    reflectSettingsUI();
    if (view0() === 'today' && !SES.active)
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'practice' && !SES.active)
        renderPracticeLast();
}
function saveAll() { const got = syncPull(); syncWrite(); if (got === 'merge' || got === 'merge-save' || got === 'swap')
    syncAfter(got); }
function syncWrite() { try {
    const p: storage.PttV3Payload = { v: 3, gen: SYNC.gen, syncId: syncGen(), syncParent: SYNC.id, ...SYNC.merge && SYNC.merge.into === SYNC.id ? { syncMerge: SYNC.merge.id } : {}, audioEngine: 'recorded-piano-v2', lang: syncPref('lang', lang), theme, data, notation: syncPref('notation', notation), tone, masterVol, muted, localSynth, reverb: reverbWet, labels: syncPref('labels', labelMode), bpm: metro.bpm, drone: !!data.settings.drone, device: activeInputId || savedDevice, scoreLook: SCORE.look, scoreHl: SCORE.hl, scoreView: FALL.mode === 'fall' ? 'fall' : SCORE.layout, kbDock: DOCK.pref, anSide: { open: SIDE.open, tab: SIDE.tab, w: SIDE.w }, wake: WAKE.want, ble: BLE.saved };
    const s = writePttV3(localStorage, p);
    SYNC.merge = null;
    syncCurrent(s);
}
catch (e) {
    console.warn('save failed', e);
} }
let _saveT: ReturnType<typeof setTimeout> | null = null;
function saveSoon() { clearTimeout(_saveT ?? undefined); _saveT = setTimeout(saveAll, 400); } // for sliders — avoid a localStorage write per pixel
function loadAll() {
    try {
        SYNC.known.clear();
        SYNC.id = '';
        SYNC.merge = null;
        const stored = readPttV3(localStorage), raw = stored?.payload;
        if (raw && stored) {
            SYNC.gen = typeof raw.gen === 'string' ? raw.gen : '';
            syncCurrent(stored.raw);
            if (raw.data) {
                data = Object.assign(data, raw.data);
                data.settings = restoreSettings(raw.data.settings);
                if (!raw.data.srs)
                    data.srs = {};
            }
            if (raw.lang && syncIsLang(raw.lang))
                lang = raw.lang;
            if (raw.theme && syncOneOf(SYNC_THEMES, raw.theme))
                theme = raw.theme;
            if (syncOneOf(SYNC_NOTATIONS, raw.notation))
                notation = raw.notation;
            tone = raw.audioEngine === 'recorded-piano-v2' && raw.tone && syncOneOf(SYNC_TONES, raw.tone) ? raw.tone : 'piano';
            masterVol = clampPersistedNumber(raw.masterVol, 0, 1, masterVol);
            if (raw.muted === true)
                muted = true;
            if (typeof raw.localSynth === 'boolean')
                localSynth = raw.localSynth;
            reverbWet = clampPersistedNumber(raw.reverb, 0, 0.5, reverbWet);
            if (raw.labels && typeof raw.labels === 'string')
                labelMode = raw.labels;
            metro.bpm = Math.round(clampPersistedNumber(raw.bpm, 50, 180, metro.bpm));
            if (raw.device && typeof raw.device === 'string')
                savedDevice = raw.device;
            if (raw.scoreLook === 'paper' || raw.scoreLook === 'night')
                SCORE.look = raw.scoreLook;
            if (typeof raw.scoreHl === 'boolean')
                SCORE.hl = raw.scoreHl;
            if (raw.scoreView === 'page' || raw.scoreView === 'cont')
                SCORE.layout = raw.scoreView;
            else if (raw.scoreView === 'fall')
                FALL.mode = 'fall';
            if (typeof raw.kbDock === 'boolean')
                DOCK.pref = raw.kbDock;
            else if (typeof raw.anKb === 'boolean')
                DOCK.pref = raw.anKb; // the Score & analysis choice becomes the choice for every view
            if (typeof raw.wake === 'boolean')
                WAKE.want = raw.wake;
            const bl = raw.ble;
            if (isRecord(bl) && typeof bl.id === 'string' && bl.id)
                BLE.saved = { id: bl.id, name: typeof bl.name === 'string' ? bl.name : '', auto: bl.auto !== false };
            const sd = raw.anSide;
            if (isRecord(sd)) {
                if (typeof sd.open === 'boolean')
                    SIDE.open = sd.open;
                if (typeof sd.tab === 'string' && AN_TABS.includes(sd.tab))
                    SIDE.tab = sd.tab;
                if (typeof sd.w === 'number' && Number.isFinite(sd.w))
                    SIDE.w = Math.max(280, Math.min(560, Math.round(sd.w)));
            }
            return;
        }
        // migrate from V2 settings (notation/tone) if present
        const v2s = legacySettings(localStorage);
        if (v2s) {
            const noteSys = String(v2s.noteSys);
            if (syncOneOf(SYNC_NOTATIONS, noteSys))
                notation = noteSys;
            tone = 'piano';
            masterVol = clampPersistedNumber(v2s.vol, 0, 1, masterVol);
        }
        const v2st = syncParseJson(localStorage.getItem('ptt-stats-v2') || 'null');
        if (isRecord(v2st) && v2st.items) { // seed SRS boxes from V2 per-item accuracy
            const map = { iv: 'iv', ch: 'ch', sc: 'sc', pr: 'pr' }, v2items = v2st.items;
            Object.keys(map).forEach((mode) => { const found = syncIsObject(v2items) ? v2items[mode] : undefined, it: Record<string, unknown> = syncIsObject(found) ? found : {}; Object.keys(it).forEach((k) => { const rec = it[k]; const id = (mode === 'iv' ? 'iv:' : mode === 'ch' ? 'ch:' : mode === 'sc' ? 'sc:' : 'pr:') + k; if (ITEM_BY_ID[id] && syncIsObject(rec) && Number(rec.seen) >= 2) {
                const acc = 1 - (Number(rec.miss) / Number(rec.seen));
                const box = acc > .85 ? 3 : acc > .6 ? 2 : 1;
                data.srs[id] = { box, ease: 2.3, reps: Number(rec.seen), lapses: Number(rec.miss), due: todayN() + (box >= 3 ? 4 : 1), last: todayN() };
            } }); });
        }
        if (navigator.language && /^ro/i.test(navigator.language))
            lang = 'ro'; // first-time Romanian browser → Romanian UI
        syncInitial();
    }
    catch (e) {
        console.warn('load failed', e);
    }
}
/* ============================================================================
   WIRING + BOOT
   ============================================================================ */
function labelSettingsControl(controlId: string, labelKey: string|undefined, helpKey: string|undefined) {
    const control = maybeById(controlId), label = (document).querySelector('[data-i18n="' + labelKey + '"]');
    if (!control || !label)
        return;
    label.id = controlId + '-label';
    control.setAttribute('aria-labelledby', label.id);
    if (helpKey) {
        const help = (document).querySelector('[data-i18n="' + helpKey + '"]');
        if (help) {
            help.id = controlId + '-help';
            control.setAttribute('aria-describedby', help.id);
        }
    }
}
type SettingsControlLabel = [controlId: string, labelKey: string, helpKey?: string];
function labelSettingsControls() {
    const controls: SettingsControlLabel[] = [['deviceSelect', 'set_input'], ['toneSel', 'set_tone'], ['set-goal', 'set_sessionlen'], ['set-new', 'set_newperday', 'set_newperday_s'],
        ['set-wake', 'set_wake'], ['set-synth', 'set_localsynth'], ['set-drone', 'set_drone'], ['set-metronome', 'set_metronome'], ['set-inv', 'set_allowinv']];
    controls.forEach(([controlId, labelKey, helpKey]) => labelSettingsControl(controlId, labelKey, helpKey));
}
function reflectSettingsUI() {
    inputById('volume').value = String(Math.round(masterVol * 100));
    selectById('toneSel').value = tone;
    inputById('bpm').value = String(metro.bpm);
    byId('bpmLbl').textContent = String(metro.bpm);
    inputById('reverb').value = String(Math.round(reverbWet / 0.5 * 100));
    queryAllHtml(document, '#set-labels button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === labelMode ? 'true' : 'false'));
    inputById('set-synth').checked = localSynth;
    inputById('set-drone').checked = !!data.settings.drone;
    inputById('set-inv').checked = !!data.settings.allowInv;
    inputById('set-metronome').checked = !!data.settings.metronome;
    selectById('set-goal').value = String(data.settings.goal);
    selectById('set-new').value = String(data.settings.newPerDay);
    queryAllHtml(document, '#set-notation button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === notation ? 'true' : 'false'));
    queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === lang ? 'true' : 'false'));
}
function overlaysOpen() { return byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on'); }
function syncScrim() {
    const open = overlaysOpen();
    byId('scrim').classList.toggle('on', open);
    queryAllHtml(document, 'body > #skipLink, body > header, body > main, body > #dock, body > details.osmd-lic, body > footer').forEach((el) => { el.inert = open; });
}
// Closed overlays are only moved/faded out by CSS, so `inert` keeps their controls out of the Tab order;
// opening moves focus inside, closing returns it to whatever opened the overlay.
const overlayReturn = new Map<HTMLElement, Element | null>();
function setOverlay(el: HTMLElement, o: boolean, firstId: string) {
    const was = el.classList.contains('on'), hadFocus = el.contains(document.activeElement);
    el.classList.toggle('on', o);
    el.setAttribute('aria-hidden', o ? 'false' : 'true');
    el.inert = !o;
    syncScrim();
    if (o && !was) {
        overlayReturn.set(el, document.activeElement);
        byId(firstId).focus();
        requestAnimationFrame(() => { if (el.classList.contains('on'))
            byId(firstId).focus(); });
    }
    else if (!o && was) {
        const r = overlayReturn.get(el);
        overlayReturn.delete(el);
        if (!overlaysOpen() && hadFocus && r && r.isConnected && (r instanceof HTMLElement || r instanceof SVGElement))
            r.focus();
    }
}
function trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !(e.currentTarget instanceof Element))
        return;
    const f = [...e.currentTarget.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x): x is HTMLElement | SVGElement => (x instanceof HTMLElement || x instanceof SVGElement) && !('disabled' in x && x.disabled) && x.getClientRects().length > 0);
    if (!f.length)
        return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
    }
    else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
    }
}
function openDrawer(o: boolean, fromPop = false) {
    if (o) {
        releaseLiveInput();
        if (!fromPop)
            pushModalState('drawer');
    }
    else if (!fromPop) {
        popModalState('drawer');
    }
    setOverlay(byId('drawer'), o, 'drawerClose');
}
function openHelp(o: boolean, fromPop = false) {
    if (o) {
        releaseLiveInput();
        kbdLayoutLabels();
        if (!fromPop)
            pushModalState('help');
    }
    else if (!fromPop) {
        popModalState('help');
    }
    setOverlay(byId('helpBox'), o, 'helpClose');
}
function applyNotation() {
    const refR = selectById('refRoot').value, kc = selectById('keyCtx').value, sr = selectById('song-root').value, pk = selectById('pr-key').value;
    fillRoots(byId('refRoot'), false);
    fillRoots(byId('song-root'), false);
    fillRoots(byId('pr-key'), true);
    fillKeyCtx();
    selectById('refRoot').value = String(refR || 0);
    selectById('song-root').value = String(sr || 0);
    selectById('pr-key').value = pk || 'all';
    selectById('keyCtx').value = kc || '-1';
    const ak = selectById('ac-key');
    if (ak) {
        const av = ak.value;
        fillRoots(ak, false);
        ak.value = String(av || accomp.key || 0);
    }
    renderCircle();
    buildKeyboard();
    repaintHeld();
    if (view0() === 'explore')
        updateExplore();
    if (view0() === 'songs')
        renderSongs();
    if (view0() === 'accompany')
        updateAccompChain();
    if (view0() === 'read' && SR.piece) {
        srStopAll();
        srDraw();
        srMeta();
    }
    anLocalize();
    if (view0() === 'analysis')
        anDraw();
    coachRefresh();
}
/* ---------- ACCOMPANIMENT UI ---------- */
/** A `<select>` whose options are built once; `_filled` marks it as built. */
type AccompFilledSelect = HTMLSelectElement & { _filled?: boolean };
function renderAccompany() {
    const ps: AccompFilledSelect = selectById('ac-prog');
    if (ps && !ps._filled) {
        ACCOMP_PROGS.forEach((p, i) => { const o = (document).createElement('option'); o.value = String(i); o.textContent = p.name; ps.appendChild(o); });
        ps._filled = true;
    }
    const pt: AccompFilledSelect = selectById('ac-pat');
    if (pt && !pt._filled) {
        Object.keys(ACCOMP_PATTERNS).forEach((k) => { const o = (document).createElement('option'); o.value = k; o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en; pt.appendChild(o); });
        pt._filled = true;
    }
    const ak = selectById('ac-key');
    if (ak && !ak.options.length) {
        fillRoots(ak, false);
        ak.value = String(accomp.key || 0);
    }
    updateAccompChain();
}
function updateAccompChain() { const el = byId('ac-chain'); if (!el)
    return; const prog = ACCOMP_PROGS[+(selectById('ac-prog').value || 0)]; if (!prog)
    return; const key = +(selectById('ac-key').value || 0); el.innerHTML = prog.chords.map((ch) => '<span class="ch">' + rootName(((key + ch[0]) % 12 + 12) % 12) + dispSym(ch[1]) + '</span>').join('<span class="sep" aria-hidden="true">·</span>'); }
function accompSync() { accomp.progIdx = +(selectById('ac-prog').value || 0); accomp.key = +(selectById('ac-key').value || 0); accomp.pattern = selectById('ac-pat').value || 'block'; accomp.bpm = +(inputById('ac-bpm').value || 90); const hb = queryHtml(byId('ac-hands'), '[aria-pressed="true"]'); accomp.hands = hb ? hb.dataset.v ?? accomp.hands : 'both'; accomp.click = inputById('ac-click').checked; }
function acPlayLabel() { byId('ac-play').textContent = accomp.on ? t('ac_stop') : t('ac_play'); }
function accompRestartIfPlaying() { if (accomp.on) {
    accompSync();
    accompStart();
} }
/** The text field, slider or select an input/change event fired on. */
function wiringField(e: Event): HTMLInputElement | HTMLSelectElement {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
        return el;
    throw new Error('Étude: expected an <input> or <select> event target');
}
/** The checkbox or file `<input>` a change event fired on. */
function wiringInput(e: Event): HTMLInputElement {
    const el = e.target;
    if (el instanceof HTMLInputElement)
        return el;
    throw new Error('Étude: expected an <input> event target');
}
/** The buttons of the segmented control a click was delegated to. */
function wiringSegment(e: Event): HTMLElement[] {
    return e.currentTarget instanceof Element ? [...e.currentTarget.children].filter((x): x is HTMLElement => x instanceof HTMLElement) : [];
}
function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
function initControls() {
    labelSettingsControls();
    byId('skipLink').addEventListener('click', (e) => { e.preventDefault(); byId('main').focus({ preventScroll: true }); });
    // nav
    byId('nav').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
        show(b.dataset.view); });
    byId('modeNav').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
        show(b.dataset.view); });
    document.querySelector('.brand')?.addEventListener('click', (e) => { e.preventDefault(); show('today'); });
    // midi chip + settings
    byId('midiChip').addEventListener('click', connectMidi);
    byId('audioLockBtn').addEventListener('click', audioUnlock);
    byId('syncNoteBtn').addEventListener('click', () => syncNote(false));
    byId('set-connect').addEventListener('click', connectMidi);
    byId('deviceSelect').addEventListener('change', (e) => attachInput(wiringField(e).value));
    byId('set-ble').addEventListener('click', bleClick);
    byId('set-ble-re').addEventListener('click', bleReconnect);
    // installed app & screen
    byId('set-wake').addEventListener('change', (e) => wakeSet(wiringInput(e).checked));
    byId('set-full').addEventListener('click', fsToggle);
    byId('set-install').addEventListener('click', pwaInstall);
    document.addEventListener('fullscreenchange', fsUi);
    byId('settingsBtn').addEventListener('click', () => openDrawer(true));
    byId('scrim').addEventListener('click', () => { openDrawer(false); openHelp(false); });
    byId('drawerClose').addEventListener('click', () => openDrawer(false));
    byId('helpBtn').addEventListener('click', () => openHelp(true));
    byId('helpClose').addEventListener('click', () => openHelp(false));
    byId('drawer').addEventListener('keydown', trapFocus);
    byId('helpBox').addEventListener('keydown', trapFocus);
    // learn: demo buttons + cross-links
    byId('learnBody').addEventListener('click', (e) => learnClick(e));
    // theme
    byId('set-theme').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !syncOneOf(SYNC_THEMES, v))
        return; theme = v; applyTheme(); saveAll(); });
    // mobile menu
    byId('menuBtn').addEventListener('click', () => {
        const mm = byId('mobileMenu');
        if (mm.hidden) {
            openMobileMenu();
        }
        else
            closeMobileMenu(true);
    });
    document.addEventListener('click', (e) => { const mm = byId('mobileMenu'), el = eventElement(e); if (mm && !mm.hidden && el && !el.closest('#mobileMenu') && !el.closest('#menuBtn'))
        closeMobileMenu(); });
    // backup export / import
    byId('exportBtn').addEventListener('click', () => {
        saveAll();
        const raw = readPttV3(localStorage, KEY)?.raw || '{}';
        const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
        trxDownload('etude-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', new Blob([raw], { type: 'application/json' }));
    });
    byId('importBtn').addEventListener('click', () => byId('importFile').click());
    byId('importFile').addEventListener('change', (e) => {
        const fi = wiringInput(e), f = fi.files?.[0];
        fi.value = '';
        if (!f)
            return;
        const rd = new FileReader();
        rd.onload = () => { try {
            const p = syncParseJson(String(rd.result));
            if (!isBackupPayload(p))
                throw 0;
            if (!confirm(t('import_confirm')))
                return;
            p.gen = syncGen();
            writePttV3(localStorage, p, KEY);
            location.reload();
        }
        catch (_) {
            alert(t('import_bad'));
        } };
        rd.readAsText(f);
    });
    // session
    byId('tools').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
        show(b.dataset.view); });
    byId('startBtn').addEventListener('click', () => startSession(null));
    byId('placeBtn').addEventListener('click', startPlacement);
    const goMethod = (e: Event) => { e.preventDefault(); show('method'); };
    byId('whyLink').addEventListener('click', goMethod);
    byId('footMethod').addEventListener('click', goMethod);
    byId('method-start').addEventListener('click', () => { show('today'); startSession(null); });
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
        if (!!data.settings.earKeys === on)
            return;
        data.settings.earKeys = on;
        saveAll();
        if (!q)
            return;
        if (SES.answered || q.mode !== 'ear') {
            ekToggleSync(q);
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
    byId('sum-done').addEventListener('click', () => { byId('summary').style.display = 'none'; show('today'); });
    // practice
    byId('pr-mode').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b || wiringDisabled(b))
        return; wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
    // Melodies are only ever answered on the keys: that topic locks the mode to "By ear, on keys".
    byId('pr-cat').addEventListener('change', (e) => {
        const mel = wiringField(e).value === 'melody', pm = byId('pr-mode');
        queryAllHtml(pm, ':scope > *').forEach((x) => { if (x instanceof HTMLButtonElement)
            x.disabled = mel && x.dataset.v !== 'keys'; if (mel)
            x.setAttribute('aria-pressed', x.dataset.v === 'keys' ? 'true' : 'false'); });
        if (!mel && !pm.querySelector('[aria-pressed="true"]'))
            pm.children[0].setAttribute('aria-pressed', 'true');
    });
    byId('pr-start').addEventListener('click', () => {
        const cat = selectById('pr-cat').value;
        const mb = queryHtml(byId('pr-mode'), '[aria-pressed="true"]');
        const v = cat === 'melody' ? 'keys' : (mb ? mb.dataset.v : 'play');
        const key = selectById('pr-key').value;
        if (v !== 'play' && cat !== 'melody') {
            data.settings.earKeys = v === 'keys';
            saveAll();
        }
        show('practice');
        startSession({ cat, mode: v === 'play' ? 'play' : 'ear', key });
    });
    // accompaniment
    byId('ac-hands').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
        return; wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); accompRestartIfPlaying(); });
    ['ac-prog', 'ac-pat', 'ac-key'].forEach((id) => byId(id).addEventListener('change', () => { updateAccompChain(); accompRestartIfPlaying(); }));
    byId('ac-bpm').addEventListener('input', (e) => { byId('ac-bpmLbl').textContent = wiringField(e).value; });
    byId('ac-bpm').addEventListener('change', accompRestartIfPlaying);
    byId('ac-click').addEventListener('change', accompRestartIfPlaying);
    byId('ac-play').addEventListener('click', () => { if (accomp.on) {
        accompStop();
    }
    else {
        accompSync();
        accompStart();
    } acPlayLabel(); });
    // read & play (sheet music)
    byId('rd-piece').addEventListener('change', (e) => srSelectPiece(wiringField(e).value));
    byId('rd-hands').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button');
        if (!b || wiringDisabled(b))
            return;
        SR.hands = b.dataset.v ?? SR.hands;
        wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        srStopAll();
        srStepsBuild();
        srPaintAll();
        byId('rd-verdict').textContent = '';
    });
    byId('rd-mode').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button');
        if (!b)
            return;
        SR.modeSel = b.dataset.v ?? SR.modeSel;
        wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        srStopAll();
        byId('rd-verdict').textContent = '';
    });
    byId('rd-names').addEventListener('change', (e) => { SR.names = wiringInput(e).checked; srStopAll(); srDraw(); });
    byId('rd-bpm').addEventListener('input', (e) => { if (SR.active || SR.listening) {
        wiringField(e).value = String(SR.bpm);
        return;
    } byId('rd-bpmLbl').textContent = wiringField(e).value; SR.bpm = +wiringField(e).value; });
    byId('rd-go').addEventListener('click', srGo);
    byId('rd-coach').addEventListener('click', (e) => { if (eventClosest(e, '#rd-coach-act') && SR.next && SR.next.act)
        SR.next.act.run(); });
    byId('rd-listen').addEventListener('click', srListen);
    // transcribe
    byId('tr-rec').addEventListener('click', () => { if (trx.on || trx.pending)
        trxStop();
    else
        trxStart(); });
    byId('tr-play').addEventListener('click', trxPlay);
    byId('tr-clear').addEventListener('click', trxClear);
    byId('tr-midi').addEventListener('click', trxExportMidi);
    byId('tr-txt').addEventListener('click', trxExportTxt);
    byId('tr-bpm').addEventListener('input', (e) => { byId('tr-bpmLbl').textContent = wiringField(e).value; });
    ['tr-snap', 'tr-skey', 'tr-sscale', 'tr-quant', 'tr-bpm', 'tr-gridSel'].forEach((id) => byId(id).addEventListener('change', () => { if (trx.notes && trx.notes.length)
        trxRender(); }));
    // sight-singing
    byId('si-mode').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
        return; singStopAll(); wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); sing.mode = b.dataset.v ?? sing.mode; ssModeUI(); byId('si-verdict').textContent = ''; byId('si-hint').textContent = ''; ssPaint(); });
    byId('si-level').addEventListener('change', (e) => { singStopAll(); sing.level = +wiringField(e).value; ssNewExercise(); });
    byId('si-clef').addEventListener('change', (e) => { singStopAll(); sing.clef = wiringField(e).value; ssNewExercise(); });
    byId('si-solf').addEventListener('change', () => { byId('si-staff').classList.toggle('nosolf', !inputById('si-solf').checked); });
    byId('si-new').addEventListener('click', () => { singStopAll(); ssNewExercise(); byId('si-verdict').textContent = ''; byId('si-hint').textContent = ''; });
    byId('si-go').addEventListener('click', singGo);
    byId('si-tonic').addEventListener('click', ssTonic);
    byId('si-playit').addEventListener('click', ssPlayIt);
    byId('si-drone').addEventListener('change', ssDrone);
    byId('si-bpm').addEventListener('input', (e) => { byId('si-bpmLbl').textContent = wiringField(e).value; sing.bpm = +wiringField(e).value; });
    // explore
    anInitControls();
    byId('refType').addEventListener('change', () => { fillRefNames(); const m = selectById('refType').value; if (isCofMode(m))
        cof.mode = m; cofInfo(); cofPaintDock(); });
    byId('refPlay').addEventListener('click', () => { if (selectById('refType').value === 'chord')
        playChordMidis(refMidis(), true);
    else
        playScaleNotes(60 + parseInt(selectById('refRoot').value, 10), SCALES[selectById('refName').value], true); });
    byId('refShow').addEventListener('click', () => { kbClear('target'); const ms = refMidis(); ms.forEach((m) => kbState(m, 'target', true)); exploreSequence([{ at: 0, notes: ms }, { at: 2600, notes: [] }]); exploreTimers.push(setTimeout(() => kbClear('target'), 2600)); });
    byId('keyCtx').addEventListener('change', () => { circleSel(); updateExplore(); });
    // songs
    byId('song-root').addEventListener('change', renderSongs);
    byId('sq-go').addEventListener('click', sqNew);
    byId('sq-again').addEventListener('click', () => { if (SQ.started)
        sqPlay(); });
    byId('sq-ans').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-semi]'); if (b)
        sqAnswer(Number(b.dataset.semi)); });
    byId('song-dir').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
        return; songDir = b.dataset.v ?? songDir; wiringSegment(e).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); renderSongs(); });
    // progress
    byId('prog-export').addEventListener('click', () => byId('exportBtn').click());
    byId('prog-import').addEventListener('click', () => byId('importBtn').click());
    byId('prog-start').addEventListener('click', () => { show('today'); startSession(null); });
    byId('resetBtn').addEventListener('click', () => { if (confirm(t('reset_confirm'))) {
        data = { srs: {}, streak: 0, bestStreak: 0, lastActive: 0, todayDay: 0, todayCount: 0, newToday: 0, totalReviews: 0, totalCorrect: 0, placed: false, history: {}, singCleared: {}, sheet: {}, learnDone: {}, learnSel: 0, settings: data.settings };
        renderLearn._init = false;
        learnSel = 0;
        SYNC.gen = syncGen();
        syncWrite();
        renderProgress();
        refreshToday();
    } }); // a new generation: other tabs adopt the reset instead of merging their copy back
    // keyboard dock
    byId('oct-down').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.max(BASE_LOW, view.low - 12); buildKeyboard(); repaintHeld(); });
    byId('oct-up').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.min(BASE_HIGH - view.oct * 12, view.low + 12); buildKeyboard(); repaintHeld(); });
    byId('panicBtn').addEventListener('click', panic);
    byId('dock-kb-toggle').addEventListener('click', () => dockSet(!dockOpen()));
    byId('kb-pan').addEventListener('input', (e) => { byId('dock-keys').scrollLeft = +wiringField(e).value; });
    byId('dock-keys').addEventListener('scroll', () => { inputById('kb-pan').value = String(byId('dock-keys').scrollLeft); });
    // settings: notation/tone/audio/learning
    byId('set-notation').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !syncOneOf(SYNC_NOTATIONS, v))
        return; notation = v; (document).querySelectorAll('#set-notation button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); applyNotation(); refreshToday(); saveAll(); });
    byId('set-lang').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
        setLang(b.dataset.v); });
    byId('toneSel').addEventListener('change', (e) => { releaseLiveInput(); stopPreviews(); stopDrone(); const v = wiringField(e).value; if (syncOneOf(SYNC_TONES, v))
        tone = v; ensureAudio(); pianoStatus(); saveAll(); });
    byId('volume').addEventListener('input', (e) => { masterVol = Number(wiringField(e).value) / 100; muted = false; masterRamp(masterVol); saveSoon(); }); // there is no mute toggle, so moving the slider must always be heard
    byId('set-synth').addEventListener('change', (e) => { localSynth = wiringInput(e).checked; if (!localSynth) {
        liveVoices.forEach((v) => v.stop());
        liveVoices.clear();
    } saveAll(); });
    byId('reverb').addEventListener('input', (e) => { reverbWet = Number(wiringField(e).value) / 100 * 0.5; if (reverbGain && actx)
        reverbGain.gain.setTargetAtTime(reverbWet, actx.currentTime, 0.05); saveSoon(); });
    byId('set-labels').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
        return; labelMode = b.dataset.v ?? labelMode; (document).querySelectorAll('#set-labels button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); buildKeyboard(); repaintHeld(); saveAll(); });
    byId('bpm').addEventListener('input', (e) => { metro.bpm = +wiringField(e).value; byId('bpmLbl').textContent = wiringField(e).value; saveSoon(); });
    byId('set-drone').addEventListener('change', (e) => { data.settings.drone = wiringInput(e).checked; saveAll(); });
    byId('set-metronome').addEventListener('change', (e) => { data.settings.metronome = wiringInput(e).checked; saveAll(); });
    byId('set-inv').addEventListener('change', (e) => { data.settings.allowInv = wiringInput(e).checked; saveAll(); });
    byId('set-goal').addEventListener('change', (e) => { data.settings.goal = +wiringField(e).value; saveAll(); refreshToday(); });
    byId('set-new').addEventListener('change', (e) => { data.settings.newPerDay = +wiringField(e).value; saveAll(); refreshToday(); });
    // global
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, function u() { ensureAudio(); }, { once: true }));
    // keyup/pointerup never reach an unfocused window, so focus loss only lets go of what the computer keyboard and pointer hold;
    // playback, recording, accompaniment and drills keep running
    window.addEventListener('blur', releaseFocusInput);
    // a hidden tab throttles timers and stops animation frames: timed playback, accompaniment, mic capture and drills stop cleanly (score playback pauses resumably)
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        panic(); });
    window.addEventListener('storage', (e) => { if (e.storageArea && e.storageArea !== localStorage || e.key !== null && e.key !== KEY)
        return; const got = syncPull(); if (got === 'old' || got === 'merge-save')
        syncWrite(); if (got)
        syncAfter(got); }); // another tab saved
    registerViewEvent('keydown', (e) => { if (e.key === 'Escape') {
        if (closeMobileMenu(true)) {
            e.preventDefault();
            return;
        }
        openDrawer(false);
        openHelp(false);
    } });
    let rz: ReturnType<typeof setTimeout> | null = null;
    function handleScreenChange() {
        clearTimeout(rz ?? undefined);
        rz = setTimeout(() => {
            if (!byId('mobileMenu').hidden && getComputedStyle(byId('menuBtn')).display === 'none') {
                const hadFocus = byId('mobileMenu').contains(document.activeElement);
                closeMobileMenu();
                if (hadFocus) {
                    const current = queryHtml(byId('nav'), '[aria-current="page"]');
                    if (current)
                        current.focus({ preventScroll: true });
                }
            }
            const o = view.oct;
            chooseView();
            if (view.oct !== o) {
                buildKeyboard();
                repaintHeld();
            }
            else
                positionBlacks();
            if (dockShown())
                reflowKeys();
            if (view0() === 'read' && SR.piece)
                srDraw();
            if (view0() === 'analysis') {
                anLayoutVars();
                anStageFit();
                // Re-align a visible score obscured by the dock, not a user reading elsewhere.
                const work = byId('an-work').getBoundingClientRect(), dock = byId('dock').getBoundingClientRect();
                if (AN.notes.length && document.body.classList.contains('kb') && work.top < dock.top && work.bottom > dock.top && work.bottom > 0)
                    anFocusStage();
            }
        }, 100);
    }
    window.addEventListener('resize', handleScreenChange);
    if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', handleScreenChange);
    }
    else {
        window.addEventListener('orientationchange', handleScreenChange);
    }
}
/* boot */
loadAll();
applyTheme();
fillRoots(byId('refRoot'), false);
fillRoots(byId('song-root'), false);
fillRoots(byId('pr-key'), true);
fillRefNames();
fillKeyCtx();
chooseView();
buildKeyboard();
initPointer();
initControls();
initExploreTabs();
reflectSettingsUI();
renderCircle();
applyI18n();
anLocalize();
show(viewFromHash(location.hash), false);
const bootHistoryState: unknown = history.state;
if (isRecord(bootHistoryState) && bootHistoryState.modal)
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
saveAll(); // Persist the one-time migration from legacy synthetic timbres.
autoReconnectMidi();
bleAutoReconnect();
pwaInit();
wakeInit();
kbdLayoutLabels();
// Decode embedded recordings ahead of the first note; AudioContext resumes on a gesture.
try {
    ensureAudio();
}
catch (err) {
    pianoBank.status = 'error';
    pianoStatus();
    console.warn(err);
}
/* @generated etude test surface */
const __etude: EtudeSurface = {};
Object.defineProperty(__etude, "LGEN", { configurable: true, get: () => LGEN });
Object.defineProperty(__etude, "LP", { configurable: true, get: () => LP });
Object.defineProperty(__etude, "LQ", { configurable: true, get: () => LQ });
Object.defineProperty(__etude, "_modalAfterBack", { configurable: true, get: () => _modalAfterBack });
Object.defineProperty(__etude, "_modalBackPending", { configurable: true, get: () => _modalBackPending });
Object.defineProperty(__etude, "_noiseBuf", { configurable: true, get: () => _noiseBuf });
Object.defineProperty(__etude, "_routed", { configurable: true, get: () => _routed });
Object.defineProperty(__etude, "_saveT", { configurable: true, get: () => _saveT });
Object.defineProperty(__etude, "_view", { configurable: true, get: () => _view });
Object.defineProperty(__etude, "acChainHL", { configurable: true, get: () => acChainHL });
Object.defineProperty(__etude, "acPlayLabel", { configurable: true, get: () => acPlayLabel });
Object.defineProperty(__etude, "accompHL", { configurable: true, get: () => accompHL });
Object.defineProperty(__etude, "accompRestartIfPlaying", { configurable: true, get: () => accompRestartIfPlaying });
Object.defineProperty(__etude, "accompStart", { configurable: true, get: () => accompStart });
Object.defineProperty(__etude, "accompStop", { configurable: true, get: () => accompStop });
Object.defineProperty(__etude, "accompSync", { configurable: true, get: () => accompSync });
Object.defineProperty(__etude, "accompTick", { configurable: true, get: () => accompTick });
Object.defineProperty(__etude, "accompTimer", { configurable: true, get: () => accompTimer });
Object.defineProperty(__etude, "accompVoicing", { configurable: true, get: () => accompVoicing });
Object.defineProperty(__etude, "activeInputId", { configurable: true, get: () => activeInputId });
Object.defineProperty(__etude, "actx", { configurable: true, get: () => actx });
Object.defineProperty(__etude, "anAccent", { configurable: true, get: () => anAccent });
Object.defineProperty(__etude, "anActiveChord", { configurable: true, get: () => anActiveChord });
Object.defineProperty(__etude, "anAnalyze", { configurable: true, get: () => anAnalyze });
Object.defineProperty(__etude, "anAssignHands", { configurable: true, get: () => anAssignHands });
Object.defineProperty(__etude, "anBarsLabel", { configurable: true, get: () => anBarsLabel });
Object.defineProperty(__etude, "anBeatText", { configurable: true, get: () => anBeatText });
Object.defineProperty(__etude, "anBeatUnit", { configurable: true, get: () => anBeatUnit });
Object.defineProperty(__etude, "anCadences", { configurable: true, get: () => anCadences });
Object.defineProperty(__etude, "anCands", { configurable: true, get: () => anCands });
Object.defineProperty(__etude, "anChipHTML", { configurable: true, get: () => anChipHTML });
Object.defineProperty(__etude, "anChordLabel", { configurable: true, get: () => anChordLabel });
Object.defineProperty(__etude, "anClassifyNonChord", { configurable: true, get: () => anClassifyNonChord });
Object.defineProperty(__etude, "anClearSelection", { configurable: true, get: () => anClearSelection });
Object.defineProperty(__etude, "anClock", { configurable: true, get: () => anClock });
Object.defineProperty(__etude, "anCoach", { configurable: true, get: () => anCoach });
Object.defineProperty(__etude, "anCommit", { configurable: true, get: () => anCommit });
Object.defineProperty(__etude, "anCommitFocus", { configurable: true, get: () => anCommitFocus });
Object.defineProperty(__etude, "anCompute", { configurable: true, get: () => anCompute });
Object.defineProperty(__etude, "anDetText", { configurable: true, get: () => anDetText });
Object.defineProperty(__etude, "anDiatonic", { configurable: true, get: () => anDiatonic });
Object.defineProperty(__etude, "anDockWanted", { configurable: true, get: () => anDockWanted });
Object.defineProperty(__etude, "anDraw", { configurable: true, get: () => anDraw });
Object.defineProperty(__etude, "anError", { configurable: true, get: () => anError });
Object.defineProperty(__etude, "anErrorKey", { configurable: true, get: () => anErrorKey });
Object.defineProperty(__etude, "anFillExamples", { configurable: true, get: () => anFillExamples });
Object.defineProperty(__etude, "anFit", { configurable: true, get: () => anFit });
Object.defineProperty(__etude, "anFitImplied", { configurable: true, get: () => anFitImplied });
Object.defineProperty(__etude, "anFnKey", { configurable: true, get: () => anFnKey });
Object.defineProperty(__etude, "anFocus", { configurable: true, get: () => anFocus });
Object.defineProperty(__etude, "anFocusNotes", { configurable: true, get: () => anFocusNotes });
Object.defineProperty(__etude, "anFocusStage", { configurable: true, get: () => anFocusStage });
Object.defineProperty(__etude, "anFunctionOf", { configurable: true, get: () => anFunctionOf });
Object.defineProperty(__etude, "anGrid", { configurable: true, get: () => anGrid });
Object.defineProperty(__etude, "anHandOf", { configurable: true, get: () => anHandOf });
Object.defineProperty(__etude, "anHandsSource", { configurable: true, get: () => anHandsSource });
Object.defineProperty(__etude, "anHandsText", { configurable: true, get: () => anHandsText });
Object.defineProperty(__etude, "anHarmony", { configurable: true, get: () => anHarmony });
Object.defineProperty(__etude, "anHasFinger", { configurable: true, get: () => anHasFinger });
Object.defineProperty(__etude, "anHover", { configurable: true, get: () => anHover });
Object.defineProperty(__etude, "anInView", { configurable: true, get: () => anInView });
Object.defineProperty(__etude, "anIndex", { configurable: true, get: () => anIndex });
Object.defineProperty(__etude, "anInflatedSize", { configurable: true, get: () => anInflatedSize });
Object.defineProperty(__etude, "anInitControls", { configurable: true, get: () => anInitControls });
Object.defineProperty(__etude, "anIntervalName", { configurable: true, get: () => anIntervalName });
Object.defineProperty(__etude, "anInv", { configurable: true, get: () => anInv });
Object.defineProperty(__etude, "anKeepPlace", { configurable: true, get: () => anKeepPlace });
Object.defineProperty(__etude, "anKeepVisible", { configurable: true, get: () => anKeepVisible });
Object.defineProperty(__etude, "anKeyAt", { configurable: true, get: () => anKeyAt });
Object.defineProperty(__etude, "anKeyInfo", { configurable: true, get: () => anKeyInfo });
Object.defineProperty(__etude, "anKeyName", { configurable: true, get: () => anKeyName });
Object.defineProperty(__etude, "anKeyRank", { configurable: true, get: () => anKeyRank });
Object.defineProperty(__etude, "anKeysCenter", { configurable: true, get: () => anKeysCenter });
Object.defineProperty(__etude, "anKeysClear", { configurable: true, get: () => anKeysClear });
Object.defineProperty(__etude, "anKeysPaint", { configurable: true, get: () => anKeysPaint });
Object.defineProperty(__etude, "anKeysShown", { configurable: true, get: () => anKeysShown });
Object.defineProperty(__etude, "anLayoutVars", { configurable: true, get: () => anLayoutVars });
Object.defineProperty(__etude, "anLoadExample", { configurable: true, get: () => anLoadExample });
Object.defineProperty(__etude, "anLoadedText", { configurable: true, get: () => anLoadedText });
Object.defineProperty(__etude, "anLocalize", { configurable: true, get: () => anLocalize });
Object.defineProperty(__etude, "anMarkActive", { configurable: true, get: () => anMarkActive });
Object.defineProperty(__etude, "anMeasureAt", { configurable: true, get: () => anMeasureAt });
Object.defineProperty(__etude, "anMeasures", { configurable: true, get: () => anMeasures });
Object.defineProperty(__etude, "anMotifs", { configurable: true, get: () => anMotifs });
Object.defineProperty(__etude, "anMxlPreflight", { configurable: true, get: () => anMxlPreflight });
Object.defineProperty(__etude, "anNarrow", { configurable: true, get: () => anNarrow });
Object.defineProperty(__etude, "anNctText", { configurable: true, get: () => anNctText });
Object.defineProperty(__etude, "anNoteInfo", { configurable: true, get: () => anNoteInfo });
Object.defineProperty(__etude, "anNowAnnounce", { configurable: true, get: () => anNowAnnounce });
Object.defineProperty(__etude, "anNowCard", { configurable: true, get: () => anNowCard });
Object.defineProperty(__etude, "anNum", { configurable: true, get: () => anNum });
Object.defineProperty(__etude, "anOpenFile", { configurable: true, get: () => anOpenFile });
Object.defineProperty(__etude, "anOpenTab", { configurable: true, get: () => anOpenTab });
Object.defineProperty(__etude, "anOriginText", { configurable: true, get: () => anOriginText });
Object.defineProperty(__etude, "anParse", { configurable: true, get: () => anParse });
Object.defineProperty(__etude, "anPcWeights", { configurable: true, get: () => anPcWeights });
Object.defineProperty(__etude, "anPieceMeta", { configurable: true, get: () => anPieceMeta });
Object.defineProperty(__etude, "anPieceToParsed", { configurable: true, get: () => anPieceToParsed });
Object.defineProperty(__etude, "anPinToolbar", { configurable: true, get: () => anPinToolbar });
Object.defineProperty(__etude, "anPinToolbarLater", { configurable: true, get: () => anPinToolbarLater });
Object.defineProperty(__etude, "anPoly", { configurable: true, get: () => anPoly });
Object.defineProperty(__etude, "anPop", { configurable: true, get: () => anPop });
Object.defineProperty(__etude, "anPractice", { configurable: true, get: () => anPractice });
Object.defineProperty(__etude, "anPracticeCheck", { configurable: true, get: () => anPracticeCheck });
Object.defineProperty(__etude, "anPracticeStart", { configurable: true, get: () => anPracticeStart });
Object.defineProperty(__etude, "anRate", { configurable: true, get: () => anRate });
Object.defineProperty(__etude, "anReadXml", { configurable: true, get: () => anReadXml });
Object.defineProperty(__etude, "anRebuild", { configurable: true, get: () => anRebuild });
Object.defineProperty(__etude, "anReconChange", { configurable: true, get: () => anReconChange });
Object.defineProperty(__etude, "anReconOpen", { configurable: true, get: () => anReconOpen });
Object.defineProperty(__etude, "anReconUI", { configurable: true, get: () => anReconUI });
Object.defineProperty(__etude, "anRenderEmpty", { configurable: true, get: () => anRenderEmpty });
Object.defineProperty(__etude, "anRenderNow", { configurable: true, get: () => anRenderNow });
Object.defineProperty(__etude, "anRenderPractice", { configurable: true, get: () => anRenderPractice });
Object.defineProperty(__etude, "anRenderSelection", { configurable: true, get: () => anRenderSelection });
Object.defineProperty(__etude, "anRenderWorkspace", { configurable: true, get: () => anRenderWorkspace });
Object.defineProperty(__etude, "anReset", { configurable: true, get: () => anReset });
Object.defineProperty(__etude, "anResolveKey", { configurable: true, get: () => anResolveKey });
Object.defineProperty(__etude, "anRevealPieceRow", { configurable: true, get: () => anRevealPieceRow });
Object.defineProperty(__etude, "anRoman", { configurable: true, get: () => anRoman });
Object.defineProperty(__etude, "anRove", { configurable: true, get: () => anRove });
Object.defineProperty(__etude, "anRowsHTML", { configurable: true, get: () => anRowsHTML });
Object.defineProperty(__etude, "anScopeNotes", { configurable: true, get: () => anScopeNotes });
Object.defineProperty(__etude, "anSegAt", { configurable: true, get: () => anSegAt });
Object.defineProperty(__etude, "anSegIndexAt", { configurable: true, get: () => anSegIndexAt });
Object.defineProperty(__etude, "anSelStart", { configurable: true, get: () => anSelStart });
Object.defineProperty(__etude, "anSelectChord", { configurable: true, get: () => anSelectChord });
Object.defineProperty(__etude, "anSelectNotes", { configurable: true, get: () => anSelectNotes });
Object.defineProperty(__etude, "anSelectionChanged", { configurable: true, get: () => anSelectionChanged });
Object.defineProperty(__etude, "anSetLoading", { configurable: true, get: () => anSetLoading });
Object.defineProperty(__etude, "anSheet", { configurable: true, get: () => anSheet });
Object.defineProperty(__etude, "anShortcut", { configurable: true, get: () => anShortcut });
Object.defineProperty(__etude, "anShowError", { configurable: true, get: () => anShowError });
Object.defineProperty(__etude, "anSideResizer", { configurable: true, get: () => anSideResizer });
Object.defineProperty(__etude, "anSideSet", { configurable: true, get: () => anSideSet });
Object.defineProperty(__etude, "anSideSync", { configurable: true, get: () => anSideSync });
Object.defineProperty(__etude, "anSideVisible", { configurable: true, get: () => anSideVisible });
Object.defineProperty(__etude, "anSpan", { configurable: true, get: () => anSpan });
Object.defineProperty(__etude, "anStageFit", { configurable: true, get: () => anStageFit });
Object.defineProperty(__etude, "anStatus", { configurable: true, get: () => anStatus });
Object.defineProperty(__etude, "anStatusPos", { configurable: true, get: () => anStatusPos });
Object.defineProperty(__etude, "anStatusSel", { configurable: true, get: () => anStatusSel });
Object.defineProperty(__etude, "anSyncTimeline", { configurable: true, get: () => anSyncTimeline });
Object.defineProperty(__etude, "anTab", { configurable: true, get: () => anTab });
Object.defineProperty(__etude, "anTempoAt", { configurable: true, get: () => anTempoAt });
Object.defineProperty(__etude, "anTlUpdate", { configurable: true, get: () => anTlUpdate });
Object.defineProperty(__etude, "anToReadPiece", { configurable: true, get: () => anToReadPiece });
Object.defineProperty(__etude, "anUnion", { configurable: true, get: () => anUnion });
Object.defineProperty(__etude, "anUnits", { configurable: true, get: () => anUnits });
Object.defineProperty(__etude, "anUpdateControls", { configurable: true, get: () => anUpdateControls });
Object.defineProperty(__etude, "anVoiceNeighbors", { configurable: true, get: () => anVoiceNeighbors });
Object.defineProperty(__etude, "anXmlKeyMap", { configurable: true, get: () => anXmlKeyMap });
Object.defineProperty(__etude, "anXmlTidy", { configurable: true, get: () => anXmlTidy });
Object.defineProperty(__etude, "anZoomNow", { configurable: true, get: () => anZoomNow });
Object.defineProperty(__etude, "answerEar", { configurable: true, get: () => answerEar });
Object.defineProperty(__etude, "applyI18n", { configurable: true, get: () => applyI18n });
Object.defineProperty(__etude, "applyNotation", { configurable: true, get: () => applyNotation });
Object.defineProperty(__etude, "applyTheme", { configurable: true, get: () => applyTheme });
Object.defineProperty(__etude, "attachInput", { configurable: true, get: () => attachInput });
Object.defineProperty(__etude, "audioLockCheck", { configurable: true, get: () => audioLockCheck });
Object.defineProperty(__etude, "audioLockSync", { configurable: true, get: () => audioLockSync });
Object.defineProperty(__etude, "audioLockT", { configurable: true, get: () => audioLockT });
Object.defineProperty(__etude, "audioNoteOff", { configurable: true, get: () => audioNoteOff });
Object.defineProperty(__etude, "audioNoteOn", { configurable: true, get: () => audioNoteOn });
Object.defineProperty(__etude, "audioUnlock", { configurable: true, get: () => audioUnlock });
Object.defineProperty(__etude, "autoReconnectMidi", { configurable: true, get: () => autoReconnectMidi });
Object.defineProperty(__etude, "bendSemitones", { configurable: true, get: () => bendSemitones });
Object.defineProperty(__etude, "bindKeyA11y", { configurable: true, get: () => bindKeyA11y });
Object.defineProperty(__etude, "bleAutoReconnect", { configurable: true, get: () => bleAutoReconnect });
Object.defineProperty(__etude, "bleCan", { configurable: true, get: () => bleCan });
Object.defineProperty(__etude, "bleChoose", { configurable: true, get: () => bleChoose });
Object.defineProperty(__etude, "bleClick", { configurable: true, get: () => bleClick });
Object.defineProperty(__etude, "bleData", { configurable: true, get: () => bleData });
Object.defineProperty(__etude, "bleDisconnect", { configurable: true, get: () => bleDisconnect });
Object.defineProperty(__etude, "bleErr", { configurable: true, get: () => bleErr });
Object.defineProperty(__etude, "bleLive", { configurable: true, get: () => bleLive });
Object.defineProperty(__etude, "bleMsg", { configurable: true, get: () => bleMsg });
Object.defineProperty(__etude, "bleName", { configurable: true, get: () => bleName });
Object.defineProperty(__etude, "bleOnGone", { configurable: true, get: () => bleOnGone });
Object.defineProperty(__etude, "bleOnValue", { configurable: true, get: () => bleOnValue });
Object.defineProperty(__etude, "bleOpen", { configurable: true, get: () => bleOpen });
Object.defineProperty(__etude, "bleParse", { configurable: true, get: () => bleParse });
Object.defineProperty(__etude, "bleParserReset", { configurable: true, get: () => bleParserReset });
Object.defineProperty(__etude, "bleReconnect", { configurable: true, get: () => bleReconnect });
Object.defineProperty(__etude, "bleReleaseInput", { configurable: true, get: () => bleReleaseInput });
Object.defineProperty(__etude, "bleRetry", { configurable: true, get: () => bleRetry });
Object.defineProperty(__etude, "bleSet", { configurable: true, get: () => bleSet });
Object.defineProperty(__etude, "bleStale", { configurable: true, get: () => bleStale });
Object.defineProperty(__etude, "bleStatus", { configurable: true, get: () => bleStatus });
Object.defineProperty(__etude, "bleUi", { configurable: true, get: () => bleUi });
Object.defineProperty(__etude, "bleUnhook", { configurable: true, get: () => bleUnhook });
Object.defineProperty(__etude, "boxOf", { configurable: true, get: () => boxOf });
Object.defineProperty(__etude, "buildAccomp", { configurable: true, get: () => buildAccomp });
Object.defineProperty(__etude, "buildKeyboard", { configurable: true, get: () => buildKeyboard });
Object.defineProperty(__etude, "buildQueue", { configurable: true, get: () => buildQueue });
Object.defineProperty(__etude, "catLabel", { configurable: true, get: () => catLabel });
Object.defineProperty(__etude, "chooseView", { configurable: true, get: () => chooseView });
Object.defineProperty(__etude, "chordDegreeMap", { configurable: true, get: () => chordDegreeMap });
Object.defineProperty(__etude, "chordDisp", { configurable: true, get: () => chordDisp });
Object.defineProperty(__etude, "chordEarOptions", { configurable: true, get: () => chordEarOptions });
Object.defineProperty(__etude, "chordFormula", { configurable: true, get: () => chordFormula });
Object.defineProperty(__etude, "chordTargetPcs", { configurable: true, get: () => chordTargetPcs });
Object.defineProperty(__etude, "circleSel", { configurable: true, get: () => circleSel });
Object.defineProperty(__etude, "clampPersistedNumber", { configurable: true, get: () => clampPersistedNumber });
Object.defineProperty(__etude, "clampTypeOctave", { configurable: true, get: () => clampTypeOctave });
Object.defineProperty(__etude, "clearExplorePreview", { configurable: true, get: () => clearExplorePreview });
Object.defineProperty(__etude, "closeMobileMenu", { configurable: true, get: () => closeMobileMenu });
Object.defineProperty(__etude, "coachHTML", { configurable: true, get: () => coachHTML });
Object.defineProperty(__etude, "coachList", { configurable: true, get: () => coachList });
Object.defineProperty(__etude, "coachRefresh", { configurable: true, get: () => coachRefresh });
Object.defineProperty(__etude, "cofData", { configurable: true, get: () => cofData });
Object.defineProperty(__etude, "cofDiagram", { configurable: true, get: () => cofDiagram });
Object.defineProperty(__etude, "cofInfo", { configurable: true, get: () => cofInfo });
Object.defineProperty(__etude, "cofKeyLabel", { configurable: true, get: () => cofKeyLabel });
Object.defineProperty(__etude, "cofName", { configurable: true, get: () => cofName });
Object.defineProperty(__etude, "cofNow", { configurable: true, get: () => cofNow });
Object.defineProperty(__etude, "cofPaintDock", { configurable: true, get: () => cofPaintDock });
Object.defineProperty(__etude, "cofParse", { configurable: true, get: () => cofParse });
Object.defineProperty(__etude, "cofPick", { configurable: true, get: () => cofPick });
Object.defineProperty(__etude, "cofPlay", { configurable: true, get: () => cofPlay });
Object.defineProperty(__etude, "cofPt", { configurable: true, get: () => cofPt });
Object.defineProperty(__etude, "cofRevealFingering", { configurable: true, get: () => cofRevealFingering });
Object.defineProperty(__etude, "cofSector", { configurable: true, get: () => cofSector });
Object.defineProperty(__etude, "cofSel", { configurable: true, get: () => cofSel });
Object.defineProperty(__etude, "cofSigList", { configurable: true, get: () => cofSigList });
Object.defineProperty(__etude, "cofSpell", { configurable: true, get: () => cofSpell });
Object.defineProperty(__etude, "cofSpellDegrees", { configurable: true, get: () => cofSpellDegrees });
Object.defineProperty(__etude, "cofSyncRef", { configurable: true, get: () => cofSyncRef });
Object.defineProperty(__etude, "cofText", { configurable: true, get: () => cofText });
Object.defineProperty(__etude, "cofTint", { configurable: true, get: () => cofTint });
Object.defineProperty(__etude, "cofTonicPc", { configurable: true, get: () => cofTonicPc });
Object.defineProperty(__etude, "comp", { configurable: true, get: () => comp });
Object.defineProperty(__etude, "connectMidi", { configurable: true, get: () => connectMidi });
Object.defineProperty(__etude, "currentStreak", { configurable: true, get: () => currentStreak });
Object.defineProperty(__etude, "data", { configurable: true, get: () => data });
Object.defineProperty(__etude, "demoBeat", { configurable: true, get: () => demoBeat });
Object.defineProperty(__etude, "dispSym", { configurable: true, get: () => dispSym });
Object.defineProperty(__etude, "dockKeepEnd", { configurable: true, get: () => dockKeepEnd });
Object.defineProperty(__etude, "dockLabels", { configurable: true, get: () => dockLabels });
Object.defineProperty(__etude, "dockOpen", { configurable: true, get: () => dockOpen });
Object.defineProperty(__etude, "dockReveal", { configurable: true, get: () => dockReveal });
Object.defineProperty(__etude, "dockSet", { configurable: true, get: () => dockSet });
Object.defineProperty(__etude, "dockShown", { configurable: true, get: () => dockShown });
Object.defineProperty(__etude, "dockSync", { configurable: true, get: () => dockSync });
Object.defineProperty(__etude, "dockWanted", { configurable: true, get: () => dockWanted });
Object.defineProperty(__etude, "drawExploreStaff", { configurable: true, get: () => drawExploreStaff });
Object.defineProperty(__etude, "droneVoices", { configurable: true, get: () => droneVoices });
Object.defineProperty(__etude, "dueItems", { configurable: true, get: () => dueItems });
Object.defineProperty(__etude, "earRoot", { configurable: true, get: () => earRoot });
Object.defineProperty(__etude, "ekBuild", { configurable: true, get: () => ekBuild });
Object.defineProperty(__etude, "ekCh", { configurable: true, get: () => ekCh });
Object.defineProperty(__etude, "ekElab", { configurable: true, get: () => ekElab });
Object.defineProperty(__etude, "ekFlash", { configurable: true, get: () => ekFlash });
Object.defineProperty(__etude, "ekFlat", { configurable: true, get: () => ekFlat });
Object.defineProperty(__etude, "ekForced", { configurable: true, get: () => ekForced });
Object.defineProperty(__etude, "ekIv", { configurable: true, get: () => ekIv });
Object.defineProperty(__etude, "ekMel", { configurable: true, get: () => ekMel });
Object.defineProperty(__etude, "ekMiss", { configurable: true, get: () => ekMiss });
Object.defineProperty(__etude, "ekName", { configurable: true, get: () => ekName });
Object.defineProperty(__etude, "ekOff", { configurable: true, get: () => ekOff });
Object.defineProperty(__etude, "ekOn", { configurable: true, get: () => ekOn });
Object.defineProperty(__etude, "ekPlay", { configurable: true, get: () => ekPlay });
Object.defineProperty(__etude, "ekProg", { configurable: true, get: () => ekProg });
Object.defineProperty(__etude, "ekReset", { configurable: true, get: () => ekReset });
Object.defineProperty(__etude, "ekSound", { configurable: true, get: () => ekSound });
Object.defineProperty(__etude, "ekStop", { configurable: true, get: () => ekStop });
Object.defineProperty(__etude, "ekToggleSync", { configurable: true, get: () => ekToggleSync });
Object.defineProperty(__etude, "ekUiReset", { configurable: true, get: () => ekUiReset });
Object.defineProperty(__etude, "ekWanted", { configurable: true, get: () => ekWanted });
Object.defineProperty(__etude, "ekWin", { configurable: true, get: () => ekWin });
Object.defineProperty(__etude, "endSession", { configurable: true, get: () => endSession });
Object.defineProperty(__etude, "ensureAudio", { configurable: true, get: () => ensureAudio });
Object.defineProperty(__etude, "evalTimer", { configurable: true, get: () => evalTimer });
Object.defineProperty(__etude, "exTab", { configurable: true, get: () => exTab });
Object.defineProperty(__etude, "exTabCur", { configurable: true, get: () => exTabCur });
Object.defineProperty(__etude, "explorePreview", { configurable: true, get: () => explorePreview });
Object.defineProperty(__etude, "exploreSequence", { configurable: true, get: () => exploreSequence });
Object.defineProperty(__etude, "exploreTimers", { configurable: true, get: () => exploreTimers });
Object.defineProperty(__etude, "fallBurst", { configurable: true, get: () => fallBurst });
Object.defineProperty(__etude, "fallData", { configurable: true, get: () => fallData });
Object.defineProperty(__etude, "fallDraw", { configurable: true, get: () => fallDraw });
Object.defineProperty(__etude, "fallEnd", { configurable: true, get: () => fallEnd });
Object.defineProperty(__etude, "fallHit", { configurable: true, get: () => fallHit });
Object.defineProperty(__etude, "fallHover", { configurable: true, get: () => fallHover });
Object.defineProperty(__etude, "fallKeyAt", { configurable: true, get: () => fallKeyAt });
Object.defineProperty(__etude, "fallKeyDown", { configurable: true, get: () => fallKeyDown });
Object.defineProperty(__etude, "fallKeyPath", { configurable: true, get: () => fallKeyPath });
Object.defineProperty(__etude, "fallKeyUp", { configurable: true, get: () => fallKeyUp });
Object.defineProperty(__etude, "fallKeyboard", { configurable: true, get: () => fallKeyboard });
Object.defineProperty(__etude, "fallKeys", { configurable: true, get: () => fallKeys });
Object.defineProperty(__etude, "fallMode", { configurable: true, get: () => fallMode });
Object.defineProperty(__etude, "fallName", { configurable: true, get: () => fallName });
Object.defineProperty(__etude, "fallParticles", { configurable: true, get: () => fallParticles });
Object.defineProperty(__etude, "fallRR", { configurable: true, get: () => fallRR });
Object.defineProperty(__etude, "fallRange", { configurable: true, get: () => fallRange });
Object.defineProperty(__etude, "fallReset", { configurable: true, get: () => fallReset });
Object.defineProperty(__etude, "fallSeek", { configurable: true, get: () => fallSeek });
Object.defineProperty(__etude, "fallSeekEnd", { configurable: true, get: () => fallSeekEnd });
Object.defineProperty(__etude, "fallSelect", { configurable: true, get: () => fallSelect });
Object.defineProperty(__etude, "fallTime", { configurable: true, get: () => fallTime });
Object.defineProperty(__etude, "feelDisp", { configurable: true, get: () => feelDisp });
Object.defineProperty(__etude, "fillKeyCtx", { configurable: true, get: () => fillKeyCtx });
Object.defineProperty(__etude, "fillPieces", { configurable: true, get: () => fillPieces });
Object.defineProperty(__etude, "fillRefNames", { configurable: true, get: () => fillRefNames });
Object.defineProperty(__etude, "fillRoots", { configurable: true, get: () => fillRoots });
Object.defineProperty(__etude, "focusView", { configurable: true, get: () => focusView });
Object.defineProperty(__etude, "foldToView", { configurable: true, get: () => foldToView });
Object.defineProperty(__etude, "freshData", { configurable: true, get: () => freshData });
Object.defineProperty(__etude, "fsCan", { configurable: true, get: () => fsCan });
Object.defineProperty(__etude, "fsToggle", { configurable: true, get: () => fsToggle });
Object.defineProperty(__etude, "fsUi", { configurable: true, get: () => fsUi });
Object.defineProperty(__etude, "gradeChord", { configurable: true, get: () => gradeChord });
Object.defineProperty(__etude, "gradeInterval", { configurable: true, get: () => gradeInterval });
Object.defineProperty(__etude, "gradeProgChord", { configurable: true, get: () => gradeProgChord });
Object.defineProperty(__etude, "gradeScaleNote", { configurable: true, get: () => gradeScaleNote });
Object.defineProperty(__etude, "greeting", { configurable: true, get: () => greeting });
Object.defineProperty(__etude, "handleNoteOff", { configurable: true, get: () => handleNoteOff });
Object.defineProperty(__etude, "handleNoteOn", { configurable: true, get: () => handleNoteOn });
Object.defineProperty(__etude, "heldMidis", { configurable: true, get: () => heldMidis });
Object.defineProperty(__etude, "heldPcs", { configurable: true, get: () => heldPcs });
Object.defineProperty(__etude, "identifyChord", { configurable: true, get: () => identifyChord });
Object.defineProperty(__etude, "inField", { configurable: true, get: () => inField });
Object.defineProperty(__etude, "initControls", { configurable: true, get: () => initControls });
Object.defineProperty(__etude, "initExploreTabs", { configurable: true, get: () => initExploreTabs });
Object.defineProperty(__etude, "initPointer", { configurable: true, get: () => initPointer });
Object.defineProperty(__etude, "intervalLabel", { configurable: true, get: () => intervalLabel });
Object.defineProperty(__etude, "invName", { configurable: true, get: () => invName });
Object.defineProperty(__etude, "inversionOf", { configurable: true, get: () => inversionOf });
Object.defineProperty(__etude, "isDue", { configurable: true, get: () => isDue });
Object.defineProperty(__etude, "isNew", { configurable: true, get: () => isNew });
Object.defineProperty(__etude, "isSubset", { configurable: true, get: () => isSubset });
Object.defineProperty(__etude, "itemLabel", { configurable: true, get: () => itemLabel });
Object.defineProperty(__etude, "ivName", { configurable: true, get: () => ivName });
Object.defineProperty(__etude, "kbClear", { configurable: true, get: () => kbClear });
Object.defineProperty(__etude, "kbClearAll", { configurable: true, get: () => kbClearAll });
Object.defineProperty(__etude, "kbDegSrc", { configurable: true, get: () => kbDegSrc });
Object.defineProperty(__etude, "kbDegrees", { configurable: true, get: () => kbDegrees });
Object.defineProperty(__etude, "kbPress", { configurable: true, get: () => kbPress });
Object.defineProperty(__etude, "kbState", { configurable: true, get: () => kbState });
Object.defineProperty(__etude, "kbdLayoutLabels", { configurable: true, get: () => kbdLayoutLabels });
Object.defineProperty(__etude, "keyAt", { configurable: true, get: () => keyAt });
Object.defineProperty(__etude, "keyFifths", { configurable: true, get: () => keyFifths });
Object.defineProperty(__etude, "keyFromFifths", { configurable: true, get: () => keyFromFifths });
Object.defineProperty(__etude, "lBarsHTML", { configurable: true, get: () => lBarsHTML });
Object.defineProperty(__etude, "lCofKey", { configurable: true, get: () => lCofKey });
Object.defineProperty(__etude, "lDots", { configurable: true, get: () => lDots });
Object.defineProperty(__etude, "lPitch", { configurable: true, get: () => lPitch });
Object.defineProperty(__etude, "lSel", { configurable: true, get: () => lSel });
Object.defineProperty(__etude, "lSeqLight", { configurable: true, get: () => lSeqLight });
Object.defineProperty(__etude, "lSp", { configurable: true, get: () => lSp });
Object.defineProperty(__etude, "lStaffHTML", { configurable: true, get: () => lStaffHTML });
Object.defineProperty(__etude, "lStaffNote", { configurable: true, get: () => lStaffNote });
Object.defineProperty(__etude, "lStaffPlay", { configurable: true, get: () => lStaffPlay });
Object.defineProperty(__etude, "lStaffSmall", { configurable: true, get: () => lStaffSmall });
Object.defineProperty(__etude, "lStaffSvg", { configurable: true, get: () => lStaffSvg });
Object.defineProperty(__etude, "lVel", { configurable: true, get: () => lVel });
Object.defineProperty(__etude, "labelMode", { configurable: true, get: () => labelMode });
Object.defineProperty(__etude, "labelSettingsControl", { configurable: true, get: () => labelSettingsControl });
Object.defineProperty(__etude, "labelSettingsControls", { configurable: true, get: () => labelSettingsControls });
Object.defineProperty(__etude, "lang", { configurable: true, get: () => lang });
Object.defineProperty(__etude, "learnBodyHTML", { configurable: true, get: () => learnBodyHTML });
Object.defineProperty(__etude, "learnClick", { configurable: true, get: () => learnClick });
Object.defineProperty(__etude, "learnComplete", { configurable: true, get: () => learnComplete });
Object.defineProperty(__etude, "learnData", { configurable: true, get: () => learnData });
Object.defineProperty(__etude, "learnDueDays", { configurable: true, get: () => learnDueDays });
Object.defineProperty(__etude, "learnDueList", { configurable: true, get: () => learnDueList });
Object.defineProperty(__etude, "learnGap", { configurable: true, get: () => learnGap });
Object.defineProperty(__etude, "learnGloss", { configurable: true, get: () => learnGloss });
Object.defineProperty(__etude, "learnGo", { configurable: true, get: () => learnGo });
Object.defineProperty(__etude, "learnGoId", { configurable: true, get: () => learnGoId });
Object.defineProperty(__etude, "learnHalt", { configurable: true, get: () => learnHalt });
Object.defineProperty(__etude, "learnInitSel", { configurable: true, get: () => learnInitSel });
Object.defineProperty(__etude, "learnInput", { configurable: true, get: () => learnInput });
Object.defineProperty(__etude, "learnLessonOpen", { configurable: true, get: () => learnLessonOpen });
Object.defineProperty(__etude, "learnLight", { configurable: true, get: () => learnLight });
Object.defineProperty(__etude, "learnMark", { configurable: true, get: () => learnMark });
Object.defineProperty(__etude, "learnNavRender", { configurable: true, get: () => learnNavRender });
Object.defineProperty(__etude, "learnPlanItems", { configurable: true, get: () => learnPlanItems });
Object.defineProperty(__etude, "learnRdLevel", { configurable: true, get: () => learnRdLevel });
Object.defineProperty(__etude, "learnReveal", { configurable: true, get: () => learnReveal });
Object.defineProperty(__etude, "learnSay", { configurable: true, get: () => learnSay });
Object.defineProperty(__etude, "learnSel", { configurable: true, get: () => learnSel });
Object.defineProperty(__etude, "learnSide", { configurable: true, get: () => learnSide });
Object.defineProperty(__etude, "learnTimer", { configurable: true, get: () => learnTimer });
Object.defineProperty(__etude, "learnTitle", { configurable: true, get: () => learnTitle });
Object.defineProperty(__etude, "learnUnitDone", { configurable: true, get: () => learnUnitDone });
Object.defineProperty(__etude, "learnUnitOf", { configurable: true, get: () => learnUnitOf });
Object.defineProperty(__etude, "learnUnitOpen", { configurable: true, get: () => learnUnitOpen });
Object.defineProperty(__etude, "learnWire", { configurable: true, get: () => learnWire });
Object.defineProperty(__etude, "lfo", { configurable: true, get: () => lfo });
Object.defineProperty(__etude, "lfoGain", { configurable: true, get: () => lfoGain });
Object.defineProperty(__etude, "lgFilter", { configurable: true, get: () => lgFilter });
Object.defineProperty(__etude, "lgHTML", { configurable: true, get: () => lgHTML });
Object.defineProperty(__etude, "lgNorm", { configurable: true, get: () => lgNorm });
Object.defineProperty(__etude, "listInputs", { configurable: true, get: () => listInputs });
Object.defineProperty(__etude, "lmDots", { configurable: true, get: () => lmDots });
Object.defineProperty(__etude, "lmMeter", { configurable: true, get: () => lmMeter });
Object.defineProperty(__etude, "lmStart", { configurable: true, get: () => lmStart });
Object.defineProperty(__etude, "lmStop", { configurable: true, get: () => lmStop });
Object.defineProperty(__etude, "lmTerm", { configurable: true, get: () => lmTerm });
Object.defineProperty(__etude, "loadAll", { configurable: true, get: () => loadAll });
Object.defineProperty(__etude, "localSynth", { configurable: true, get: () => localSynth });
Object.defineProperty(__etude, "lqAnswer", { configurable: true, get: () => lqAnswer });
Object.defineProperty(__etude, "lqFocus", { configurable: true, get: () => lqFocus });
Object.defineProperty(__etude, "lqLabel", { configurable: true, get: () => lqLabel });
Object.defineProperty(__etude, "lqMidis", { configurable: true, get: () => lqMidis });
Object.defineProperty(__etude, "lqNeed", { configurable: true, get: () => lqNeed });
Object.defineProperty(__etude, "lqNext", { configurable: true, get: () => lqNext });
Object.defineProperty(__etude, "lqPick", { configurable: true, get: () => lqPick });
Object.defineProperty(__etude, "lqRender", { configurable: true, get: () => lqRender });
Object.defineProperty(__etude, "lqShow", { configurable: true, get: () => lqShow });
Object.defineProperty(__etude, "lqStart", { configurable: true, get: () => lqStart });
Object.defineProperty(__etude, "lwChord", { configurable: true, get: () => lwChord });
Object.defineProperty(__etude, "lwChordData", { configurable: true, get: () => lwChordData });
Object.defineProperty(__etude, "lwChordPlay", { configurable: true, get: () => lwChordPlay });
Object.defineProperty(__etude, "lwClick", { configurable: true, get: () => lwClick });
Object.defineProperty(__etude, "lwCof", { configurable: true, get: () => lwCof });
Object.defineProperty(__etude, "lwInput", { configurable: true, get: () => lwInput });
Object.defineProperty(__etude, "lwMetro", { configurable: true, get: () => lwMetro });
Object.defineProperty(__etude, "lwMount", { configurable: true, get: () => lwMount });
Object.defineProperty(__etude, "lwRefocus", { configurable: true, get: () => lwRefocus });
Object.defineProperty(__etude, "lwScale", { configurable: true, get: () => lwScale });
Object.defineProperty(__etude, "lwScalePlay", { configurable: true, get: () => lwScalePlay });
Object.defineProperty(__etude, "lwStepLab", { configurable: true, get: () => lwStepLab });
Object.defineProperty(__etude, "makeIR", { configurable: true, get: () => makeIR });
Object.defineProperty(__etude, "makePianoVoice", { configurable: true, get: () => makePianoVoice });
Object.defineProperty(__etude, "makeQuestion", { configurable: true, get: () => makeQuestion });
Object.defineProperty(__etude, "makeVoice", { configurable: true, get: () => makeVoice });
Object.defineProperty(__etude, "markEarCorrect", { configurable: true, get: () => markEarCorrect });
Object.defineProperty(__etude, "master", { configurable: true, get: () => master });
Object.defineProperty(__etude, "masterFilter", { configurable: true, get: () => masterFilter });
Object.defineProperty(__etude, "masterRamp", { configurable: true, get: () => masterRamp });
Object.defineProperty(__etude, "masterVol", { configurable: true, get: () => masterVol });
Object.defineProperty(__etude, "masteredCount", { configurable: true, get: () => masteredCount });
Object.defineProperty(__etude, "metroClick", { configurable: true, get: () => metroClick });
Object.defineProperty(__etude, "metroSched", { configurable: true, get: () => metroSched });
Object.defineProperty(__etude, "midiAccess", { configurable: true, get: () => midiAccess });
Object.defineProperty(__etude, "midiChipSync", { configurable: true, get: () => midiChipSync });
Object.defineProperty(__etude, "midiIn", { configurable: true, get: () => midiIn });
Object.defineProperty(__etude, "midiMsg", { configurable: true, get: () => midiMsg });
Object.defineProperty(__etude, "muted", { configurable: true, get: () => muted });
Object.defineProperty(__etude, "neutral", { configurable: true, get: () => neutral });
Object.defineProperty(__etude, "newItemsAvail", { configurable: true, get: () => newItemsAvail });
Object.defineProperty(__etude, "newQuotaLeft", { configurable: true, get: () => newQuotaLeft });
Object.defineProperty(__etude, "nextQuestion", { configurable: true, get: () => nextQuestion });
Object.defineProperty(__etude, "noiseBuffer", { configurable: true, get: () => noiseBuffer });
Object.defineProperty(__etude, "notation", { configurable: true, get: () => notation });
Object.defineProperty(__etude, "noteName", { configurable: true, get: () => noteName });
Object.defineProperty(__etude, "onInputChange", { configurable: true, get: () => onInputChange });
Object.defineProperty(__etude, "onMidiMessage", { configurable: true, get: () => onMidiMessage });
Object.defineProperty(__etude, "onStateChange", { configurable: true, get: () => onStateChange });
Object.defineProperty(__etude, "openDrawer", { configurable: true, get: () => openDrawer });
Object.defineProperty(__etude, "openHelp", { configurable: true, get: () => openHelp });
Object.defineProperty(__etude, "openMobileMenu", { configurable: true, get: () => openMobileMenu });
Object.defineProperty(__etude, "openSessionUI", { configurable: true, get: () => openSessionUI });
Object.defineProperty(__etude, "overlaysOpen", { configurable: true, get: () => overlaysOpen });
Object.defineProperty(__etude, "panic", { configurable: true, get: () => panic });
Object.defineProperty(__etude, "pcName", { configurable: true, get: () => pcName });
Object.defineProperty(__etude, "pedalDown", { configurable: true, get: () => pedalDown });
Object.defineProperty(__etude, "pedalUp", { configurable: true, get: () => pedalUp });
Object.defineProperty(__etude, "physKey", { configurable: true, get: () => physKey });
Object.defineProperty(__etude, "pianoDecode", { configurable: true, get: () => pianoDecode });
Object.defineProperty(__etude, "pianoEnsure", { configurable: true, get: () => pianoEnsure });
Object.defineProperty(__etude, "pianoFail", { configurable: true, get: () => pianoFail });
Object.defineProperty(__etude, "pianoIdleWarm", { configurable: true, get: () => pianoIdleWarm });
Object.defineProperty(__etude, "pianoKeys", { configurable: true, get: () => pianoKeys });
Object.defineProperty(__etude, "pianoNearest", { configurable: true, get: () => pianoNearest });
Object.defineProperty(__etude, "pianoStatus", { configurable: true, get: () => pianoStatus });
Object.defineProperty(__etude, "pickArturia", { configurable: true, get: () => pickArturia });
Object.defineProperty(__etude, "pickTargetedItem", { configurable: true, get: () => pickTargetedItem });
Object.defineProperty(__etude, "playChordMidis", { configurable: true, get: () => playChordMidis });
Object.defineProperty(__etude, "playInterval", { configurable: true, get: () => playInterval });
Object.defineProperty(__etude, "playIvDir", { configurable: true, get: () => playIvDir });
Object.defineProperty(__etude, "playProg", { configurable: true, get: () => playProg });
Object.defineProperty(__etude, "playQuestionSound", { configurable: true, get: () => playQuestionSound });
Object.defineProperty(__etude, "playScaleNotes", { configurable: true, get: () => playScaleNotes });
Object.defineProperty(__etude, "popModalState", { configurable: true, get: () => popModalState });
Object.defineProperty(__etude, "positionBlacks", { configurable: true, get: () => positionBlacks });
Object.defineProperty(__etude, "prRecordDrill", { configurable: true, get: () => prRecordDrill });
Object.defineProperty(__etude, "pracAcc", { configurable: true, get: () => pracAcc });
Object.defineProperty(__etude, "pracBeats", { configurable: true, get: () => pracBeats });
Object.defineProperty(__etude, "pracClearAB", { configurable: true, get: () => pracClearAB });
Object.defineProperty(__etude, "pracFinish", { configurable: true, get: () => pracFinish });
Object.defineProperty(__etude, "pracFrame", { configurable: true, get: () => pracFrame });
Object.defineProperty(__etude, "pracHud", { configurable: true, get: () => pracHud });
Object.defineProperty(__etude, "pracInput", { configurable: true, get: () => pracInput });
Object.defineProperty(__etude, "pracJudge", { configurable: true, get: () => pracJudge });
Object.defineProperty(__etude, "pracLoad", { configurable: true, get: () => pracLoad });
Object.defineProperty(__etude, "pracLoopBars", { configurable: true, get: () => pracLoopBars });
Object.defineProperty(__etude, "pracMisses", { configurable: true, get: () => pracMisses });
Object.defineProperty(__etude, "pracNextBar", { configurable: true, get: () => pracNextBar });
Object.defineProperty(__etude, "pracNextRender", { configurable: true, get: () => pracNextRender });
Object.defineProperty(__etude, "pracNextStep", { configurable: true, get: () => pracNextStep });
Object.defineProperty(__etude, "pracPassEnd", { configurable: true, get: () => pracPassEnd });
Object.defineProperty(__etude, "pracRamp", { configurable: true, get: () => pracRamp });
Object.defineProperty(__etude, "pracRaw", { configurable: true, get: () => pracRaw });
Object.defineProperty(__etude, "pracRelease", { configurable: true, get: () => pracRelease });
Object.defineProperty(__etude, "pracSave", { configurable: true, get: () => pracSave });
Object.defineProperty(__etude, "pracSegAt", { configurable: true, get: () => pracSegAt });
Object.defineProperty(__etude, "pracSet", { configurable: true, get: () => pracSet });
Object.defineProperty(__etude, "pracSetAB", { configurable: true, get: () => pracSetAB });
Object.defineProperty(__etude, "pracStart", { configurable: true, get: () => pracStart });
Object.defineProperty(__etude, "pracStatsReset", { configurable: true, get: () => pracStatsReset });
Object.defineProperty(__etude, "pracSumClose", { configurable: true, get: () => pracSumClose });
Object.defineProperty(__etude, "pracSummary", { configurable: true, get: () => pracSummary });
Object.defineProperty(__etude, "pracTick", { configurable: true, get: () => pracTick });
Object.defineProperty(__etude, "pracWeakHand", { configurable: true, get: () => pracWeakHand });
Object.defineProperty(__etude, "preparePiano", { configurable: true, get: () => preparePiano });
Object.defineProperty(__etude, "presentEar", { configurable: true, get: () => presentEar });
Object.defineProperty(__etude, "presentEarKeys", { configurable: true, get: () => presentEarKeys });
Object.defineProperty(__etude, "presentPlay", { configurable: true, get: () => presentPlay });
Object.defineProperty(__etude, "presentQuestion", { configurable: true, get: () => presentQuestion });
Object.defineProperty(__etude, "previewNote", { configurable: true, get: () => previewNote });
Object.defineProperty(__etude, "previewVoices", { configurable: true, get: () => previewVoices });
Object.defineProperty(__etude, "progChordTpl", { configurable: true, get: () => progChordTpl });
Object.defineProperty(__etude, "pushModalState", { configurable: true, get: () => pushModalState });
Object.defineProperty(__etude, "pwaInit", { configurable: true, get: () => pwaInit });
Object.defineProperty(__etude, "pwaInstall", { configurable: true, get: () => pwaInstall });
Object.defineProperty(__etude, "pwaStandalone", { configurable: true, get: () => pwaStandalone });
Object.defineProperty(__etude, "pwaUi", { configurable: true, get: () => pwaUi });
Object.defineProperty(__etude, "randItem", { configurable: true, get: () => randItem });
Object.defineProperty(__etude, "rdAbort", { configurable: true, get: () => rdAbort });
Object.defineProperty(__etude, "rdAccSym", { configurable: true, get: () => rdAccSym });
Object.defineProperty(__etude, "rdAgg", { configurable: true, get: () => rdAgg });
Object.defineProperty(__etude, "rdAnsText", { configurable: true, get: () => rdAnsText });
Object.defineProperty(__etude, "rdAnswer", { configurable: true, get: () => rdAnswer });
Object.defineProperty(__etude, "rdBack", { configurable: true, get: () => rdBack });
Object.defineProperty(__etude, "rdBars", { configurable: true, get: () => rdBars });
Object.defineProperty(__etude, "rdBeatX", { configurable: true, get: () => rdBeatX });
Object.defineProperty(__etude, "rdBtn", { configurable: true, get: () => rdBtn });
Object.defineProperty(__etude, "rdCClef", { configurable: true, get: () => rdCClef });
Object.defineProperty(__etude, "rdChLabel", { configurable: true, get: () => rdChLabel });
Object.defineProperty(__etude, "rdClear", { configurable: true, get: () => rdClear });
Object.defineProperty(__etude, "rdClick", { configurable: true, get: () => rdClick });
Object.defineProperty(__etude, "rdClickAns", { configurable: true, get: () => rdClickAns });
Object.defineProperty(__etude, "rdCoach", { configurable: true, get: () => rdCoach });
Object.defineProperty(__etude, "rdCustomFill", { configurable: true, get: () => rdCustomFill });
Object.defineProperty(__etude, "rdCustomGo", { configurable: true, get: () => rdCustomGo });
Object.defineProperty(__etude, "rdCustomRead", { configurable: true, get: () => rdCustomRead });
Object.defineProperty(__etude, "rdData", { configurable: true, get: () => rdData });
Object.defineProperty(__etude, "rdEndClick", { configurable: true, get: () => rdEndClick });
Object.defineProperty(__etude, "rdEsc", { configurable: true, get: () => rdEsc });
Object.defineProperty(__etude, "rdFeedback", { configurable: true, get: () => rdFeedback });
Object.defineProperty(__etude, "rdFinish", { configurable: true, get: () => rdFinish });
Object.defineProperty(__etude, "rdFocus", { configurable: true, get: () => rdFocus });
Object.defineProperty(__etude, "rdFromStep", { configurable: true, get: () => rdFromStep });
Object.defineProperty(__etude, "rdGen", { configurable: true, get: () => rdGen });
Object.defineProperty(__etude, "rdGenMelody", { configurable: true, get: () => rdGenMelody });
Object.defineProperty(__etude, "rdHeat", { configurable: true, get: () => rdHeat });
Object.defineProperty(__etude, "rdHint", { configurable: true, get: () => rdHint });
Object.defineProperty(__etude, "rdHud", { configurable: true, get: () => rdHud });
Object.defineProperty(__etude, "rdInput", { configurable: true, get: () => rdInput });
Object.defineProperty(__etude, "rdIntro", { configurable: true, get: () => rdIntro });
Object.defineProperty(__etude, "rdIvName", { configurable: true, get: () => rdIvName });
Object.defineProperty(__etude, "rdKbMark", { configurable: true, get: () => rdKbMark });
Object.defineProperty(__etude, "rdKbRange", { configurable: true, get: () => rdKbRange });
Object.defineProperty(__etude, "rdKey", { configurable: true, get: () => rdKey });
Object.defineProperty(__etude, "rdKeyLabel", { configurable: true, get: () => rdKeyLabel });
Object.defineProperty(__etude, "rdKeyMinor", { configurable: true, get: () => rdKeyMinor });
Object.defineProperty(__etude, "rdKeyText", { configurable: true, get: () => rdKeyText });
Object.defineProperty(__etude, "rdKsSvg", { configurable: true, get: () => rdKsSvg });
Object.defineProperty(__etude, "rdLetter", { configurable: true, get: () => rdLetter });
Object.defineProperty(__etude, "rdLvDetail", { configurable: true, get: () => rdLvDetail });
Object.defineProperty(__etude, "rdLvName", { configurable: true, get: () => rdLvName });
Object.defineProperty(__etude, "rdLvNext", { configurable: true, get: () => rdLvNext });
Object.defineProperty(__etude, "rdLvPrev", { configurable: true, get: () => rdLvPrev });
Object.defineProperty(__etude, "rdLvSub", { configurable: true, get: () => rdLvSub });
Object.defineProperty(__etude, "rdMidi", { configurable: true, get: () => rdMidi });
Object.defineProperty(__etude, "rdMiniKb", { configurable: true, get: () => rdMiniKb });
Object.defineProperty(__etude, "rdName", { configurable: true, get: () => rdName });
Object.defineProperty(__etude, "rdNext", { configurable: true, get: () => rdNext });
Object.defineProperty(__etude, "rdNextRender", { configurable: true, get: () => rdNextRender });
Object.defineProperty(__etude, "rdNextStep", { configurable: true, get: () => rdNextStep });
Object.defineProperty(__etude, "rdNk", { configurable: true, get: () => rdNk });
Object.defineProperty(__etude, "rdOnLocale", { configurable: true, get: () => rdOnLocale });
Object.defineProperty(__etude, "rdOpen", { configurable: true, get: () => rdOpen });
Object.defineProperty(__etude, "rdP", { configurable: true, get: () => rdP });
Object.defineProperty(__etude, "rdPercClef", { configurable: true, get: () => rdPercClef });
Object.defineProperty(__etude, "rdPickFrom", { configurable: true, get: () => rdPickFrom });
Object.defineProperty(__etude, "rdPickW", { configurable: true, get: () => rdPickW });
Object.defineProperty(__etude, "rdPool", { configurable: true, get: () => rdPool });
Object.defineProperty(__etude, "rdQSvg", { configurable: true, get: () => rdQSvg });
Object.defineProperty(__etude, "rdRangeTxt", { configurable: true, get: () => rdRangeTxt });
Object.defineProperty(__etude, "rdRender", { configurable: true, get: () => rdRender });
Object.defineProperty(__etude, "rdRenderHome", { configurable: true, get: () => rdRenderHome });
Object.defineProperty(__etude, "rdRenderStats", { configurable: true, get: () => rdRenderStats });
Object.defineProperty(__etude, "rdRhDone", { configurable: true, get: () => rdRhDone });
Object.defineProperty(__etude, "rdRhGen", { configurable: true, get: () => rdRhGen });
Object.defineProperty(__etude, "rdRhGenLH", { configurable: true, get: () => rdRhGenLH });
Object.defineProperty(__etude, "rdRhGrade", { configurable: true, get: () => rdRhGrade });
Object.defineProperty(__etude, "rdRhGradeAll", { configurable: true, get: () => rdRhGradeAll });
Object.defineProperty(__etude, "rdRhGradeHand", { configurable: true, get: () => rdRhGradeHand });
Object.defineProperty(__etude, "rdRhHandLine", { configurable: true, get: () => rdRhHandLine });
Object.defineProperty(__etude, "rdRhKey", { configurable: true, get: () => rdRhKey });
Object.defineProperty(__etude, "rdRhMarks", { configurable: true, get: () => rdRhMarks });
Object.defineProperty(__etude, "rdRhNew", { configurable: true, get: () => rdRhNew });
Object.defineProperty(__etude, "rdRhNoteTip", { configurable: true, get: () => rdRhNoteTip });
Object.defineProperty(__etude, "rdRhOptsLock", { configurable: true, get: () => rdRhOptsLock });
Object.defineProperty(__etude, "rdRhPrefs", { configurable: true, get: () => rdRhPrefs });
Object.defineProperty(__etude, "rdRhPress", { configurable: true, get: () => rdRhPress });
Object.defineProperty(__etude, "rdRhRelease", { configurable: true, get: () => rdRhRelease });
Object.defineProperty(__etude, "rdRhRun", { configurable: true, get: () => rdRhRun });
Object.defineProperty(__etude, "rdRhStrokes", { configurable: true, get: () => rdRhStrokes });
Object.defineProperty(__etude, "rdScroll", { configurable: true, get: () => rdScroll });
Object.defineProperty(__etude, "rdSightDone", { configurable: true, get: () => rdSightDone });
Object.defineProperty(__etude, "rdSightGen", { configurable: true, get: () => rdSightGen });
Object.defineProperty(__etude, "rdSightStart", { configurable: true, get: () => rdSightStart });
Object.defineProperty(__etude, "rdSound", { configurable: true, get: () => rdSound });
Object.defineProperty(__etude, "rdSpell", { configurable: true, get: () => rdSpell });
Object.defineProperty(__etude, "rdSpellMidi", { configurable: true, get: () => rdSpellMidi });
Object.defineProperty(__etude, "rdStars", { configurable: true, get: () => rdStars });
Object.defineProperty(__etude, "rdStart", { configurable: true, get: () => rdStart });
Object.defineProperty(__etude, "rdStat", { configurable: true, get: () => rdStat });
Object.defineProperty(__etude, "rdStep", { configurable: true, get: () => rdStep });
Object.defineProperty(__etude, "rdSuggest", { configurable: true, get: () => rdSuggest });
Object.defineProperty(__etude, "rdSvg", { configurable: true, get: () => rdSvg });
Object.defineProperty(__etude, "rdTab", { configurable: true, get: () => rdTab });
Object.defineProperty(__etude, "rdTap", { configurable: true, get: () => rdTap });
Object.defineProperty(__etude, "rdTarget", { configurable: true, get: () => rdTarget });
Object.defineProperty(__etude, "rdU", { configurable: true, get: () => rdU });
Object.defineProperty(__etude, "rdUnlocked", { configurable: true, get: () => rdUnlocked });
Object.defineProperty(__etude, "rdWeight", { configurable: true, get: () => rdWeight });
Object.defineProperty(__etude, "refMidis", { configurable: true, get: () => refMidis });
Object.defineProperty(__etude, "reflectSettingsUI", { configurable: true, get: () => reflectSettingsUI });
Object.defineProperty(__etude, "reflowKeys", { configurable: true, get: () => reflowKeys });
Object.defineProperty(__etude, "refreshDeviceList", { configurable: true, get: () => refreshDeviceList });
Object.defineProperty(__etude, "refreshToday", { configurable: true, get: () => refreshToday });
Object.defineProperty(__etude, "releaseFocusInput", { configurable: true, get: () => releaseFocusInput });
Object.defineProperty(__etude, "releaseLiveInput", { configurable: true, get: () => releaseLiveInput });
Object.defineProperty(__etude, "releaseTypingKeys", { configurable: true, get: () => releaseTypingKeys });
Object.defineProperty(__etude, "renderAccompany", { configurable: true, get: () => renderAccompany });
Object.defineProperty(__etude, "renderCircle", { configurable: true, get: () => renderCircle });
Object.defineProperty(__etude, "renderLearn", { configurable: true, get: () => renderLearn });
Object.defineProperty(__etude, "renderModeNav", { configurable: true, get: () => renderModeNav });
Object.defineProperty(__etude, "renderPlan", { configurable: true, get: () => renderPlan });
Object.defineProperty(__etude, "renderPracticeLast", { configurable: true, get: () => renderPracticeLast });
Object.defineProperty(__etude, "renderProgress", { configurable: true, get: () => renderProgress });
Object.defineProperty(__etude, "renderRead", { configurable: true, get: () => renderRead });
Object.defineProperty(__etude, "renderSing", { configurable: true, get: () => renderSing });
Object.defineProperty(__etude, "renderSongs", { configurable: true, get: () => renderSongs });
Object.defineProperty(__etude, "renderTranscribe", { configurable: true, get: () => renderTranscribe });
Object.defineProperty(__etude, "repaintHeld", { configurable: true, get: () => repaintHeld });
Object.defineProperty(__etude, "resolve", { configurable: true, get: () => resolve });
Object.defineProperty(__etude, "revealAnswerKeys", { configurable: true, get: () => revealAnswerKeys });
Object.defineProperty(__etude, "reverbGain", { configurable: true, get: () => reverbGain });
Object.defineProperty(__etude, "reverbNode", { configurable: true, get: () => reverbNode });
Object.defineProperty(__etude, "reverbWet", { configurable: true, get: () => reverbWet });
Object.defineProperty(__etude, "reviewItem", { configurable: true, get: () => reviewItem });
Object.defineProperty(__etude, "romanFor", { configurable: true, get: () => romanFor });
Object.defineProperty(__etude, "runDemo", { configurable: true, get: () => runDemo });
Object.defineProperty(__etude, "sampledPianoVoice", { configurable: true, get: () => sampledPianoVoice });
Object.defineProperty(__etude, "saveAll", { configurable: true, get: () => saveAll });
Object.defineProperty(__etude, "saveSoon", { configurable: true, get: () => saveSoon });
Object.defineProperty(__etude, "savedDevice", { configurable: true, get: () => savedDevice });
Object.defineProperty(__etude, "scaleDisp", { configurable: true, get: () => scaleDisp });
Object.defineProperty(__etude, "scaleEarOptions", { configurable: true, get: () => scaleEarOptions });
Object.defineProperty(__etude, "scaleFormula", { configurable: true, get: () => scaleFormula });
Object.defineProperty(__etude, "scheduleAccompAt", { configurable: true, get: () => scheduleAccompAt });
Object.defineProperty(__etude, "scheduleEval", { configurable: true, get: () => scheduleEval });
Object.defineProperty(__etude, "scoreAnchorAt", { configurable: true, get: () => scoreAnchorAt });
Object.defineProperty(__etude, "scoreBeamGroups", { configurable: true, get: () => scoreBeamGroups });
Object.defineProperty(__etude, "scoreBeams", { configurable: true, get: () => scoreBeams });
Object.defineProperty(__etude, "scoreBeatAt", { configurable: true, get: () => scoreBeatAt });
Object.defineProperty(__etude, "scoreBind", { configurable: true, get: () => scoreBind });
Object.defineProperty(__etude, "scoreCoralBars", { configurable: true, get: () => scoreCoralBars });
Object.defineProperty(__etude, "scoreCursorAt", { configurable: true, get: () => scoreCursorAt });
Object.defineProperty(__etude, "scoreCursorEl", { configurable: true, get: () => scoreCursorEl });
Object.defineProperty(__etude, "scoreCursorFollow", { configurable: true, get: () => scoreCursorFollow });
Object.defineProperty(__etude, "scoreCursorUpdate", { configurable: true, get: () => scoreCursorUpdate });
Object.defineProperty(__etude, "scoreExtraBreaks", { configurable: true, get: () => scoreExtraBreaks });
Object.defineProperty(__etude, "scoreFitRender", { configurable: true, get: () => scoreFitRender });
Object.defineProperty(__etude, "scoreFixFingerings", { configurable: true, get: () => scoreFixFingerings });
Object.defineProperty(__etude, "scoreFixPedals", { configurable: true, get: () => scoreFixPedals });
Object.defineProperty(__etude, "scoreFollow", { configurable: true, get: () => scoreFollow });
Object.defineProperty(__etude, "scoreFromMidi", { configurable: true, get: () => scoreFromMidi });
Object.defineProperty(__etude, "scoreGeo", { configurable: true, get: () => scoreGeo });
Object.defineProperty(__etude, "scoreHalt", { configurable: true, get: () => scoreHalt });
Object.defineProperty(__etude, "scoreHome", { configurable: true, get: () => scoreHome });
Object.defineProperty(__etude, "scoreIdle", { configurable: true, get: () => scoreIdle });
Object.defineProperty(__etude, "scoreLayout", { configurable: true, get: () => scoreLayout });
Object.defineProperty(__etude, "scoreLoopStart", { configurable: true, get: () => scoreLoopStart });
Object.defineProperty(__etude, "scoreMarks", { configurable: true, get: () => scoreMarks });
Object.defineProperty(__etude, "scoreMeasureAt", { configurable: true, get: () => scoreMeasureAt });
Object.defineProperty(__etude, "scoreNightSweep", { configurable: true, get: () => scoreNightSweep });
Object.defineProperty(__etude, "scorePaint", { configurable: true, get: () => scorePaint });
Object.defineProperty(__etude, "scorePaintEl", { configurable: true, get: () => scorePaintEl });
Object.defineProperty(__etude, "scorePaintIdx", { configurable: true, get: () => scorePaintIdx });
Object.defineProperty(__etude, "scorePause", { configurable: true, get: () => scorePause });
Object.defineProperty(__etude, "scorePitch", { configurable: true, get: () => scorePitch });
Object.defineProperty(__etude, "scorePlay", { configurable: true, get: () => scorePlay });
Object.defineProperty(__etude, "scorePointer", { configurable: true, get: () => scorePointer });
Object.defineProperty(__etude, "scoreRender", { configurable: true, get: () => scoreRender });
Object.defineProperty(__etude, "scoreRingFit", { configurable: true, get: () => scoreRingFit });
Object.defineProperty(__etude, "scoreSeconds", { configurable: true, get: () => scoreSeconds });
Object.defineProperty(__etude, "scoreSeekBar", { configurable: true, get: () => scoreSeekBar });
Object.defineProperty(__etude, "scoreSeekTo", { configurable: true, get: () => scoreSeekTo });
Object.defineProperty(__etude, "scoreSelectMeasures", { configurable: true, get: () => scoreSelectMeasures });
Object.defineProperty(__etude, "scoreSelectRange", { configurable: true, get: () => scoreSelectRange });
Object.defineProperty(__etude, "scoreSetHl", { configurable: true, get: () => scoreSetHl });
Object.defineProperty(__etude, "scoreSetLook", { configurable: true, get: () => scoreSetLook });
Object.defineProperty(__etude, "scoreSetTempos", { configurable: true, get: () => scoreSetTempos });
Object.defineProperty(__etude, "scoreSetView", { configurable: true, get: () => scoreSetView });
Object.defineProperty(__etude, "scoreShiftY", { configurable: true, get: () => scoreShiftY });
Object.defineProperty(__etude, "scoreStateText", { configurable: true, get: () => scoreStateText });
Object.defineProperty(__etude, "scoreStop", { configurable: true, get: () => scoreStop });
Object.defineProperty(__etude, "scoreStyleHeader", { configurable: true, get: () => scoreStyleHeader });
Object.defineProperty(__etude, "scoreSymAt", { configurable: true, get: () => scoreSymAt });
Object.defineProperty(__etude, "scoreSymText", { configurable: true, get: () => scoreSymText });
Object.defineProperty(__etude, "scoreSyms", { configurable: true, get: () => scoreSyms });
Object.defineProperty(__etude, "scoreTermParts", { configurable: true, get: () => scoreTermParts });
Object.defineProperty(__etude, "scoreTip", { configurable: true, get: () => scoreTip });
Object.defineProperty(__etude, "scoreToUser", { configurable: true, get: () => scoreToUser });
Object.defineProperty(__etude, "scoreToggle", { configurable: true, get: () => scoreToggle });
Object.defineProperty(__etude, "scoreUnlight", { configurable: true, get: () => scoreUnlight });
Object.defineProperty(__etude, "scoreXLines", { configurable: true, get: () => scoreXLines });
Object.defineProperty(__etude, "scoreXmlEndings", { configurable: true, get: () => scoreXmlEndings });
Object.defineProperty(__etude, "scoreXmlLayout", { configurable: true, get: () => scoreXmlLayout });
Object.defineProperty(__etude, "scoreXmlNotes", { configurable: true, get: () => scoreXmlNotes });
Object.defineProperty(__etude, "scoreZoom", { configurable: true, get: () => scoreZoom });
Object.defineProperty(__etude, "seedPlacement", { configurable: true, get: () => seedPlacement });
Object.defineProperty(__etude, "sesHome", { configurable: true, get: () => sesHome });
Object.defineProperty(__etude, "sesInput", { configurable: true, get: () => sesInput });
Object.defineProperty(__etude, "sesPrompt", { configurable: true, get: () => sesPrompt });
Object.defineProperty(__etude, "sesStopPrompt", { configurable: true, get: () => sesStopPrompt });
Object.defineProperty(__etude, "setBendFromValue", { configurable: true, get: () => setBendFromValue });
Object.defineProperty(__etude, "setEq", { configurable: true, get: () => setEq });
Object.defineProperty(__etude, "setLang", { configurable: true, get: () => setLang });
Object.defineProperty(__etude, "setMidi", { configurable: true, get: () => setMidi });
Object.defineProperty(__etude, "setOverlay", { configurable: true, get: () => setOverlay });
Object.defineProperty(__etude, "shiftTypeOctave", { configurable: true, get: () => shiftTypeOctave });
Object.defineProperty(__etude, "show", { configurable: true, get: () => show });
Object.defineProperty(__etude, "showElaboration", { configurable: true, get: () => showElaboration });
Object.defineProperty(__etude, "showNotationReloadPrompt", { configurable: true, get: () => showNotationReloadPrompt });
Object.defineProperty(__etude, "showProgTarget", { configurable: true, get: () => showProgTarget });
Object.defineProperty(__etude, "showSummary", { configurable: true, get: () => showSummary });
Object.defineProperty(__etude, "shuffle", { configurable: true, get: () => shuffle });
Object.defineProperty(__etude, "singGo", { configurable: true, get: () => singGo });
Object.defineProperty(__etude, "singKeyInput", { configurable: true, get: () => singKeyInput });
Object.defineProperty(__etude, "singStopAll", { configurable: true, get: () => singStopAll });
Object.defineProperty(__etude, "slashLabel", { configurable: true, get: () => slashLabel });
Object.defineProperty(__etude, "songDir", { configurable: true, get: () => songDir });
Object.defineProperty(__etude, "songsFor", { configurable: true, get: () => songsFor });
Object.defineProperty(__etude, "spellMidi", { configurable: true, get: () => spellMidi });
Object.defineProperty(__etude, "spellName", { configurable: true, get: () => spellName });
Object.defineProperty(__etude, "spelledName", { configurable: true, get: () => spelledName });
Object.defineProperty(__etude, "sqAnswer", { configurable: true, get: () => sqAnswer });
Object.defineProperty(__etude, "sqNew", { configurable: true, get: () => sqNew });
Object.defineProperty(__etude, "sqPlay", { configurable: true, get: () => sqPlay });
Object.defineProperty(__etude, "sqRender", { configurable: true, get: () => sqRender });
Object.defineProperty(__etude, "srActiveHands", { configurable: true, get: () => srActiveHands });
Object.defineProperty(__etude, "srAssessFinish", { configurable: true, get: () => srAssessFinish });
Object.defineProperty(__etude, "srAssessLoop", { configurable: true, get: () => srAssessLoop });
Object.defineProperty(__etude, "srAssessStart", { configurable: true, get: () => srAssessStart });
Object.defineProperty(__etude, "srBeatToX", { configurable: true, get: () => srBeatToX });
Object.defineProperty(__etude, "srBest", { configurable: true, get: () => srBest });
Object.defineProperty(__etude, "srClef", { configurable: true, get: () => srClef });
Object.defineProperty(__etude, "srClick", { configurable: true, get: () => srClick });
Object.defineProperty(__etude, "srCoach", { configurable: true, get: () => srCoach });
Object.defineProperty(__etude, "srCount", { configurable: true, get: () => srCount });
Object.defineProperty(__etude, "srCursor", { configurable: true, get: () => srCursor });
Object.defineProperty(__etude, "srDraw", { configurable: true, get: () => srDraw });
Object.defineProperty(__etude, "srEvents", { configurable: true, get: () => srEvents });
Object.defineProperty(__etude, "srFocus", { configurable: true, get: () => srFocus });
Object.defineProperty(__etude, "srGo", { configurable: true, get: () => srGo });
Object.defineProperty(__etude, "srHandsAvail", { configurable: true, get: () => srHandsAvail });
Object.defineProperty(__etude, "srKeyInput", { configurable: true, get: () => srKeyInput });
Object.defineProperty(__etude, "srKeyName", { configurable: true, get: () => srKeyName });
Object.defineProperty(__etude, "srKeyNames", { configurable: true, get: () => srKeyNames });
Object.defineProperty(__etude, "srKeySigG", { configurable: true, get: () => srKeySigG });
Object.defineProperty(__etude, "srLearnFinish", { configurable: true, get: () => srLearnFinish });
Object.defineProperty(__etude, "srLearnStart", { configurable: true, get: () => srLearnStart });
Object.defineProperty(__etude, "srLedger2", { configurable: true, get: () => srLedger2 });
Object.defineProperty(__etude, "srListen", { configurable: true, get: () => srListen });
Object.defineProperty(__etude, "srMeta", { configurable: true, get: () => srMeta });
Object.defineProperty(__etude, "srNextAssess", { configurable: true, get: () => srNextAssess });
Object.defineProperty(__etude, "srNextLearn", { configurable: true, get: () => srNextLearn });
Object.defineProperty(__etude, "srPaintAll", { configurable: true, get: () => srPaintAll });
Object.defineProperty(__etude, "srPieceTitle", { configurable: true, get: () => srPieceTitle });
Object.defineProperty(__etude, "srPitch", { configurable: true, get: () => srPitch });
Object.defineProperty(__etude, "srPlayGap", { configurable: true, get: () => srPlayGap });
Object.defineProperty(__etude, "srRender", { configurable: true, get: () => srRender });
Object.defineProperty(__etude, "srRest", { configurable: true, get: () => srRest });
Object.defineProperty(__etude, "srScrollStep", { configurable: true, get: () => srScrollStep });
Object.defineProperty(__etude, "srScrollX", { configurable: true, get: () => srScrollX });
Object.defineProperty(__etude, "srSelectPiece", { configurable: true, get: () => srSelectPiece });
Object.defineProperty(__etude, "srSetBpm", { configurable: true, get: () => srSetBpm });
Object.defineProperty(__etude, "srSetMode", { configurable: true, get: () => srSetMode });
Object.defineProperty(__etude, "srShape", { configurable: true, get: () => srShape });
Object.defineProperty(__etude, "srSlip", { configurable: true, get: () => srSlip });
Object.defineProperty(__etude, "srSlipNote", { configurable: true, get: () => srSlipNote });
Object.defineProperty(__etude, "srStem2", { configurable: true, get: () => srStem2 });
Object.defineProperty(__etude, "srStemLine", { configurable: true, get: () => srStemLine });
Object.defineProperty(__etude, "srStepsBuild", { configurable: true, get: () => srStepsBuild });
Object.defineProperty(__etude, "srStopAll", { configurable: true, get: () => srStopAll });
Object.defineProperty(__etude, "srSvg", { configurable: true, get: () => srSvg });
Object.defineProperty(__etude, "srTargets", { configurable: true, get: () => srTargets });
Object.defineProperty(__etude, "srTimeSigG", { configurable: true, get: () => srTimeSigG });
Object.defineProperty(__etude, "srTol", { configurable: true, get: () => srTol });
Object.defineProperty(__etude, "srTopSlip", { configurable: true, get: () => srTopSlip });
Object.defineProperty(__etude, "srsOf", { configurable: true, get: () => srsOf });
Object.defineProperty(__etude, "ssAccGlyph", { configurable: true, get: () => ssAccGlyph });
Object.defineProperty(__etude, "ssBassClef", { configurable: true, get: () => ssBassClef });
Object.defineProperty(__etude, "ssBeatToX", { configurable: true, get: () => ssBeatToX });
Object.defineProperty(__etude, "ssBumpProgress", { configurable: true, get: () => ssBumpProgress });
Object.defineProperty(__etude, "ssClearTrail", { configurable: true, get: () => ssClearTrail });
Object.defineProperty(__etude, "ssCurNote", { configurable: true, get: () => ssCurNote });
Object.defineProperty(__etude, "ssCursorEl", { configurable: true, get: () => ssCursorEl });
Object.defineProperty(__etude, "ssDraw", { configurable: true, get: () => ssDraw });
Object.defineProperty(__etude, "ssDrawTrail", { configurable: true, get: () => ssDrawTrail });
Object.defineProperty(__etude, "ssDrone", { configurable: true, get: () => ssDrone });
Object.defineProperty(__etude, "ssFillLevels", { configurable: true, get: () => ssFillLevels });
Object.defineProperty(__etude, "ssFlash", { configurable: true, get: () => ssFlash });
Object.defineProperty(__etude, "ssFlat", { configurable: true, get: () => ssFlat });
Object.defineProperty(__etude, "ssFreeLoop", { configurable: true, get: () => ssFreeLoop });
Object.defineProperty(__etude, "ssFreeStart", { configurable: true, get: () => ssFreeStart });
Object.defineProperty(__etude, "ssGen", { configurable: true, get: () => ssGen });
Object.defineProperty(__etude, "ssHintBump", { configurable: true, get: () => ssHintBump });
Object.defineProperty(__etude, "ssKeyAcc", { configurable: true, get: () => ssKeyAcc });
Object.defineProperty(__etude, "ssKeySig", { configurable: true, get: () => ssKeySig });
Object.defineProperty(__etude, "ssLedger", { configurable: true, get: () => ssLedger });
Object.defineProperty(__etude, "ssMakeNote", { configurable: true, get: () => ssMakeNote });
Object.defineProperty(__etude, "ssMicMaybe", { configurable: true, get: () => ssMicMaybe });
Object.defineProperty(__etude, "ssMicStart", { configurable: true, get: () => ssMicStart });
Object.defineProperty(__etude, "ssMicStop", { configurable: true, get: () => ssMicStop });
Object.defineProperty(__etude, "ssMidiOf", { configurable: true, get: () => ssMidiOf });
Object.defineProperty(__etude, "ssModeUI", { configurable: true, get: () => ssModeUI });
Object.defineProperty(__etude, "ssMoveCursor", { configurable: true, get: () => ssMoveCursor });
Object.defineProperty(__etude, "ssNatural", { configurable: true, get: () => ssNatural });
Object.defineProperty(__etude, "ssNeed", { configurable: true, get: () => ssNeed });
Object.defineProperty(__etude, "ssNewExercise", { configurable: true, get: () => ssNewExercise });
Object.defineProperty(__etude, "ssNextDeg", { configurable: true, get: () => ssNextDeg });
Object.defineProperty(__etude, "ssNoteCorrect", { configurable: true, get: () => ssNoteCorrect });
Object.defineProperty(__etude, "ssNoteFinish", { configurable: true, get: () => ssNoteFinish });
Object.defineProperty(__etude, "ssNoteLoop", { configurable: true, get: () => ssNoteLoop });
Object.defineProperty(__etude, "ssNoteStart", { configurable: true, get: () => ssNoteStart });
Object.defineProperty(__etude, "ssNotehead", { configurable: true, get: () => ssNotehead });
Object.defineProperty(__etude, "ssPaint", { configurable: true, get: () => ssPaint });
Object.defineProperty(__etude, "ssPhraseGrade", { configurable: true, get: () => ssPhraseGrade });
Object.defineProperty(__etude, "ssPhraseLoop", { configurable: true, get: () => ssPhraseLoop });
Object.defineProperty(__etude, "ssPhraseStart", { configurable: true, get: () => ssPhraseStart });
Object.defineProperty(__etude, "ssPick", { configurable: true, get: () => ssPick });
Object.defineProperty(__etude, "ssPitchY", { configurable: true, get: () => ssPitchY });
Object.defineProperty(__etude, "ssPlayIt", { configurable: true, get: () => ssPlayIt });
Object.defineProperty(__etude, "ssReadPitch", { configurable: true, get: () => ssReadPitch });
Object.defineProperty(__etude, "ssRemoveCursor", { configurable: true, get: () => ssRemoveCursor });
Object.defineProperty(__etude, "ssRender", { configurable: true, get: () => ssRender });
Object.defineProperty(__etude, "ssScrollToCur", { configurable: true, get: () => ssScrollToCur });
Object.defineProperty(__etude, "ssScrollToX", { configurable: true, get: () => ssScrollToX });
Object.defineProperty(__etude, "ssSharp", { configurable: true, get: () => ssSharp });
Object.defineProperty(__etude, "ssStem", { configurable: true, get: () => ssStem });
Object.defineProperty(__etude, "ssStepOf", { configurable: true, get: () => ssStepOf });
Object.defineProperty(__etude, "ssSvg", { configurable: true, get: () => ssSvg });
Object.defineProperty(__etude, "ssTimeSig", { configurable: true, get: () => ssTimeSig });
Object.defineProperty(__etude, "ssTonic", { configurable: true, get: () => ssTonic });
Object.defineProperty(__etude, "ssTrebleClef", { configurable: true, get: () => ssTrebleClef });
Object.defineProperty(__etude, "startDrone", { configurable: true, get: () => startDrone });
Object.defineProperty(__etude, "startMetro", { configurable: true, get: () => startMetro });
Object.defineProperty(__etude, "startPlacement", { configurable: true, get: () => startPlacement });
Object.defineProperty(__etude, "startSession", { configurable: true, get: () => startSession });
Object.defineProperty(__etude, "statHTML", { configurable: true, get: () => statHTML });
Object.defineProperty(__etude, "stopDrone", { configurable: true, get: () => stopDrone });
Object.defineProperty(__etude, "stopMetro", { configurable: true, get: () => stopMetro });
Object.defineProperty(__etude, "stopPreviews", { configurable: true, get: () => stopPreviews });
Object.defineProperty(__etude, "syncAfter", { configurable: true, get: () => syncAfter });
Object.defineProperty(__etude, "syncBusy", { configurable: true, get: () => syncBusy });
Object.defineProperty(__etude, "syncCurrent", { configurable: true, get: () => syncCurrent });
Object.defineProperty(__etude, "syncData", { configurable: true, get: () => syncData });
Object.defineProperty(__etude, "syncGen", { configurable: true, get: () => syncGen });
Object.defineProperty(__etude, "syncId", { configurable: true, get: () => syncId });
Object.defineProperty(__etude, "syncIdle", { configurable: true, get: () => syncIdle });
Object.defineProperty(__etude, "syncInitial", { configurable: true, get: () => syncInitial });
Object.defineProperty(__etude, "syncInto", { configurable: true, get: () => syncInto });
Object.defineProperty(__etude, "syncKeyboardPan", { configurable: true, get: () => syncKeyboardPan });
Object.defineProperty(__etude, "syncNewCollisions", { configurable: true, get: () => syncNewCollisions });
Object.defineProperty(__etude, "syncNote", { configurable: true, get: () => syncNote });
Object.defineProperty(__etude, "syncPair", { configurable: true, get: () => syncPair });
Object.defineProperty(__etude, "syncPick", { configurable: true, get: () => syncPick });
Object.defineProperty(__etude, "syncPref", { configurable: true, get: () => syncPref });
Object.defineProperty(__etude, "syncPull", { configurable: true, get: () => syncPull });
Object.defineProperty(__etude, "syncRefresh", { configurable: true, get: () => syncRefresh });
Object.defineProperty(__etude, "syncRemember", { configurable: true, get: () => syncRemember });
Object.defineProperty(__etude, "syncSame", { configurable: true, get: () => syncSame });
Object.defineProperty(__etude, "syncScrim", { configurable: true, get: () => syncScrim });
Object.defineProperty(__etude, "syncSrs", { configurable: true, get: () => syncSrs });
Object.defineProperty(__etude, "syncSrsPair", { configurable: true, get: () => syncSrsPair });
Object.defineProperty(__etude, "syncWrite", { configurable: true, get: () => syncWrite });
Object.defineProperty(__etude, "t", { configurable: true, get: () => t });
Object.defineProperty(__etude, "tf", { configurable: true, get: () => tf });
Object.defineProperty(__etude, "theme", { configurable: true, get: () => theme });
Object.defineProperty(__etude, "tl", { configurable: true, get: () => tl });
Object.defineProperty(__etude, "tone", { configurable: true, get: () => tone });
Object.defineProperty(__etude, "toolName", { configurable: true, get: () => toolName });
Object.defineProperty(__etude, "touchDay", { configurable: true, get: () => touchDay });
Object.defineProperty(__etude, "trapFocus", { configurable: true, get: () => trapFocus });
Object.defineProperty(__etude, "trxAutoCorrelate", { configurable: true, get: () => trxAutoCorrelate });
Object.defineProperty(__etude, "trxBuildMidi", { configurable: true, get: () => trxBuildMidi });
Object.defineProperty(__etude, "trxClear", { configurable: true, get: () => trxClear });
Object.defineProperty(__etude, "trxCloseNote", { configurable: true, get: () => trxCloseNote });
Object.defineProperty(__etude, "trxDownload", { configurable: true, get: () => trxDownload });
Object.defineProperty(__etude, "trxDurLabel", { configurable: true, get: () => trxDurLabel });
Object.defineProperty(__etude, "trxExportMidi", { configurable: true, get: () => trxExportMidi });
Object.defineProperty(__etude, "trxExportTxt", { configurable: true, get: () => trxExportTxt });
Object.defineProperty(__etude, "trxFreqToMidi", { configurable: true, get: () => trxFreqToMidi });
Object.defineProperty(__etude, "trxLoop", { configurable: true, get: () => trxLoop });
Object.defineProperty(__etude, "trxMedian", { configurable: true, get: () => trxMedian });
Object.defineProperty(__etude, "trxPlay", { configurable: true, get: () => trxPlay });
Object.defineProperty(__etude, "trxPushVar", { configurable: true, get: () => trxPushVar });
Object.defineProperty(__etude, "trxRender", { configurable: true, get: () => trxRender });
Object.defineProperty(__etude, "trxSnap", { configurable: true, get: () => trxSnap });
Object.defineProperty(__etude, "trxStart", { configurable: true, get: () => trxStart });
Object.defineProperty(__etude, "trxStop", { configurable: true, get: () => trxStop });
Object.defineProperty(__etude, "typeOctave", { configurable: true, get: () => typeOctave });
Object.defineProperty(__etude, "updateAccompChain", { configurable: true, get: () => updateAccompChain });
Object.defineProperty(__etude, "updateExplore", { configurable: true, get: () => updateExplore });
Object.defineProperty(__etude, "view0", { configurable: true, get: () => view0 });
Object.defineProperty(__etude, "viewHigh", { configurable: true, get: () => viewHigh });
Object.defineProperty(__etude, "wakeArm", { configurable: true, get: () => wakeArm });
Object.defineProperty(__etude, "wakeCan", { configurable: true, get: () => wakeCan });
Object.defineProperty(__etude, "wakeDrop", { configurable: true, get: () => wakeDrop });
Object.defineProperty(__etude, "wakeGet", { configurable: true, get: () => wakeGet });
Object.defineProperty(__etude, "wakeInit", { configurable: true, get: () => wakeInit });
Object.defineProperty(__etude, "wakeOnGesture", { configurable: true, get: () => wakeOnGesture });
Object.defineProperty(__etude, "wakePing", { configurable: true, get: () => wakePing });
Object.defineProperty(__etude, "wakeSet", { configurable: true, get: () => wakeSet });
Object.defineProperty(__etude, "wakeUi", { configurable: true, get: () => wakeUi });
Object.defineProperty(__etude, "xmlEsc", { configurable: true, get: () => xmlEsc });
Object.defineProperty(__etude, "$", { configurable: true, get: () => maybeById });
Object.defineProperty(__etude, "ACCOMP_I18N", { configurable: true, get: () => ACCOMP_I18N });
Object.defineProperty(__etude, "ACCOMP_PATTERNS", { configurable: true, get: () => ACCOMP_PATTERNS });
Object.defineProperty(__etude, "ACCOMP_PROGS", { configurable: true, get: () => ACCOMP_PROGS });
Object.defineProperty(__etude, "AN", { configurable: true, get: () => AN });
Object.defineProperty(__etude, "AN_CHORDS", { configurable: true, get: () => AN_CHORDS });
Object.defineProperty(__etude, "AN_DIA", { configurable: true, get: () => AN_DIA });
Object.defineProperty(__etude, "AN_EXAMPLES", { configurable: true, get: () => AN_EXAMPLES });
Object.defineProperty(__etude, "AN_MAX_BYTES", { configurable: true, get: () => AN_MAX_BYTES });
Object.defineProperty(__etude, "AN_MAX_NOTES", { configurable: true, get: () => AN_MAX_NOTES });
Object.defineProperty(__etude, "AN_MAX_XML_CHARS", { configurable: true, get: () => AN_MAX_XML_CHARS });
Object.defineProperty(__etude, "AN_POPS", { configurable: true, get: () => AN_POPS });
Object.defineProperty(__etude, "AN_PRACTICE_BARS", { configurable: true, get: () => AN_PRACTICE_BARS });
Object.defineProperty(__etude, "AN_PROFILE", { configurable: true, get: () => AN_PROFILE });
Object.defineProperty(__etude, "AN_SMUFL_NOTES", { configurable: true, get: () => AN_SMUFL_NOTES });
Object.defineProperty(__etude, "AN_TABS", { configurable: true, get: () => AN_TABS });
Object.defineProperty(__etude, "BASE_HIGH", { configurable: true, get: () => BASE_HIGH });
Object.defineProperty(__etude, "BASE_LOW", { configurable: true, get: () => BASE_LOW });
Object.defineProperty(__etude, "BLACK_NUDGE", { configurable: true, get: () => BLACK_NUDGE });
Object.defineProperty(__etude, "BLE", { configurable: true, get: () => BLE });
Object.defineProperty(__etude, "BLE_MIDI_CHR", { configurable: true, get: () => BLE_MIDI_CHR });
Object.defineProperty(__etude, "BLE_MIDI_SVC", { configurable: true, get: () => BLE_MIDI_SVC });
Object.defineProperty(__etude, "CATS", { configurable: true, get: () => CATS });
Object.defineProperty(__etude, "CHORDS", { configurable: true, get: () => CHORDS });
Object.defineProperty(__etude, "CHORD_DEG", { configurable: true, get: () => CHORD_DEG });
Object.defineProperty(__etude, "CHORD_FEEL", { configurable: true, get: () => CHORD_FEEL });
Object.defineProperty(__etude, "CIRCLE", { configurable: true, get: () => CIRCLE });
Object.defineProperty(__etude, "CLEF_F", { configurable: true, get: () => CLEF_F });
Object.defineProperty(__etude, "CLEF_G", { configurable: true, get: () => CLEF_G });
Object.defineProperty(__etude, "CLEF_SCALE", { configurable: true, get: () => CLEF_SCALE });
Object.defineProperty(__etude, "COF_COL", { configurable: true, get: () => COF_COL });
Object.defineProperty(__etude, "COF_FING", { configurable: true, get: () => COF_FING });
Object.defineProperty(__etude, "COF_MAJ", { configurable: true, get: () => COF_MAJ });
Object.defineProperty(__etude, "COF_MIN", { configurable: true, get: () => COF_MIN });
Object.defineProperty(__etude, "COF_SCALE", { configurable: true, get: () => COF_SCALE });
Object.defineProperty(__etude, "COF_SOL", { configurable: true, get: () => COF_SOL });
Object.defineProperty(__etude, "COMPOUND", { configurable: true, get: () => COMPOUND });
Object.defineProperty(__etude, "DOCK", { configurable: true, get: () => DOCK });
Object.defineProperty(__etude, "EK_CHORD_GAP", { configurable: true, get: () => EK_CHORD_GAP });
Object.defineProperty(__etude, "EK_MEL_SCALES", { configurable: true, get: () => EK_MEL_SCALES });
Object.defineProperty(__etude, "EK_TRIES", { configurable: true, get: () => EK_TRIES });
Object.defineProperty(__etude, "EX_LEDGERS", { configurable: true, get: () => EX_LEDGERS });
Object.defineProperty(__etude, "FALL", { configurable: true, get: () => FALL });
Object.defineProperty(__etude, "FALL_BLACK", { configurable: true, get: () => FALL_BLACK });
Object.defineProperty(__etude, "FALL_COL", { configurable: true, get: () => FALL_COL });
Object.defineProperty(__etude, "FALL_FONT", { configurable: true, get: () => FALL_FONT });
Object.defineProperty(__etude, "FALL_NUDGE", { configurable: true, get: () => FALL_NUDGE });
Object.defineProperty(__etude, "FALL_PAL", { configurable: true, get: () => FALL_PAL });
Object.defineProperty(__etude, "FALL_SEC", { configurable: true, get: () => FALL_SEC });
Object.defineProperty(__etude, "FALL_SEL", { configurable: true, get: () => FALL_SEL });
Object.defineProperty(__etude, "FALL_YOU", { configurable: true, get: () => FALL_YOU });
Object.defineProperty(__etude, "INTERVALS", { configurable: true, get: () => INTERVALS });
Object.defineProperty(__etude, "INTRO_CH", { configurable: true, get: () => INTRO_CH });
Object.defineProperty(__etude, "INTRO_IV", { configurable: true, get: () => INTRO_IV });
Object.defineProperty(__etude, "INTRO_SC", { configurable: true, get: () => INTRO_SC });
Object.defineProperty(__etude, "INV_NAMES", { configurable: true, get: () => INV_NAMES });
Object.defineProperty(__etude, "ITEMS", { configurable: true, get: () => ITEMS });
Object.defineProperty(__etude, "ITEM_BY_ID", { configurable: true, get: () => ITEM_BY_ID });
Object.defineProperty(__etude, "IVL", { configurable: true, get: () => IVL });
Object.defineProperty(__etude, "KEYMAP", { configurable: true, get: () => KEYMAP });
Object.defineProperty(__etude, "KEY_MAJ_FIFTHS", { configurable: true, get: () => KEY_MAJ_FIFTHS });
Object.defineProperty(__etude, "LACC_CH", { configurable: true, get: () => LACC_CH });
Object.defineProperty(__etude, "LBLUES", { configurable: true, get: () => LBLUES });
Object.defineProperty(__etude, "LDUR", { configurable: true, get: () => LDUR });
Object.defineProperty(__etude, "LEARN_GAPS", { configurable: true, get: () => LEARN_GAPS });
Object.defineProperty(__etude, "LEARN_OLD_ORDER", { configurable: true, get: () => LEARN_OLD_ORDER });
Object.defineProperty(__etude, "LETTERS", { configurable: true, get: () => LETTERS });
Object.defineProperty(__etude, "LETTER_PC", { configurable: true, get: () => LETTER_PC });
Object.defineProperty(__etude, "LLET", { configurable: true, get: () => LLET });
Object.defineProperty(__etude, "LM", { configurable: true, get: () => LM });
Object.defineProperty(__etude, "LNAT", { configurable: true, get: () => LNAT });
Object.defineProperty(__etude, "LSPF", { configurable: true, get: () => LSPF });
Object.defineProperty(__etude, "LSPS", { configurable: true, get: () => LSPS });
Object.defineProperty(__etude, "LSR", { configurable: true, get: () => LSR });
Object.defineProperty(__etude, "LSTAVES", { configurable: true, get: () => LSTAVES });
Object.defineProperty(__etude, "LT", { configurable: true, get: () => LT });
Object.defineProperty(__etude, "LTEMPO", { configurable: true, get: () => LTEMPO });
Object.defineProperty(__etude, "LVEL", { configurable: true, get: () => LVEL });
Object.defineProperty(__etude, "LW_PRESETS", { configurable: true, get: () => LW_PRESETS });
Object.defineProperty(__etude, "LW_Q", { configurable: true, get: () => LW_Q });
Object.defineProperty(__etude, "LW_R", { configurable: true, get: () => LW_R });
Object.defineProperty(__etude, "LW_STEP", { configurable: true, get: () => LW_STEP });
Object.defineProperty(__etude, "MAJOR", { configurable: true, get: () => MAJOR });
Object.defineProperty(__etude, "NOTE_SYS", { configurable: true, get: () => NOTE_SYS });
Object.defineProperty(__etude, "PC_FLAT", { configurable: true, get: () => PC_FLAT });
Object.defineProperty(__etude, "PC_SHARP", { configurable: true, get: () => PC_SHARP });
Object.defineProperty(__etude, "PIANO_KEYS", { configurable: true, get: () => PIANO_KEYS });
Object.defineProperty(__etude, "PIANO_URLS", { configurable: true, get: () => PIANO_URLS });
Object.defineProperty(__etude, "PIANO_WARM", { configurable: true, get: () => PIANO_WARM });
Object.defineProperty(__etude, "PIECES", { configurable: true, get: () => PIECES });
Object.defineProperty(__etude, "PLACEMENT", { configurable: true, get: () => PLACEMENT });
Object.defineProperty(__etude, "PRAC", { configurable: true, get: () => PRAC });
Object.defineProperty(__etude, "PRAC_KEY", { configurable: true, get: () => PRAC_KEY });
Object.defineProperty(__etude, "PROGS", { configurable: true, get: () => PROGS });
Object.defineProperty(__etude, "PWA", { configurable: true, get: () => PWA });
Object.defineProperty(__etude, "RD", { configurable: true, get: () => RD });
Object.defineProperty(__etude, "RD_ALL", { configurable: true, get: () => RD_ALL });
Object.defineProperty(__etude, "RD_ALLIV", { configurable: true, get: () => RD_ALLIV });
Object.defineProperty(__etude, "RD_CDEF", { configurable: true, get: () => RD_CDEF });
Object.defineProperty(__etude, "RD_CHQ", { configurable: true, get: () => RD_CHQ });
Object.defineProperty(__etude, "RD_CLEFC", { configurable: true, get: () => RD_CLEFC });
Object.defineProperty(__etude, "RD_LH_PAT", { configurable: true, get: () => RD_LH_PAT });
Object.defineProperty(__etude, "RD_LM", { configurable: true, get: () => RD_LM });
Object.defineProperty(__etude, "RD_LV", { configurable: true, get: () => RD_LV });
Object.defineProperty(__etude, "RD_MAJ", { configurable: true, get: () => RD_MAJ });
Object.defineProperty(__etude, "RD_MIN", { configurable: true, get: () => RD_MIN });
Object.defineProperty(__etude, "RD_REF", { configurable: true, get: () => RD_REF });
Object.defineProperty(__etude, "RD_RHU", { configurable: true, get: () => RD_RHU });
Object.defineProperty(__etude, "RD_RUSH", { configurable: true, get: () => RD_RUSH });
Object.defineProperty(__etude, "RD_TARGET", { configurable: true, get: () => RD_TARGET });
Object.defineProperty(__etude, "RD_TESTN", { configurable: true, get: () => RD_TESTN });
Object.defineProperty(__etude, "RD_UNITS", { configurable: true, get: () => RD_UNITS });
Object.defineProperty(__etude, "ROMAN", { configurable: true, get: () => ROMAN });
Object.defineProperty(__etude, "ROOT_NAMES", { configurable: true, get: () => ROOT_NAMES });
Object.defineProperty(__etude, "SCALES", { configurable: true, get: () => SCALES });
Object.defineProperty(__etude, "SCALE_DEG", { configurable: true, get: () => SCALE_DEG });
Object.defineProperty(__etude, "SCALE_EAR_POOL", { configurable: true, get: () => SCALE_EAR_POOL });
Object.defineProperty(__etude, "SCORE", { configurable: true, get: () => SCORE });
Object.defineProperty(__etude, "SCORE_LOOK", { configurable: true, get: () => SCORE_LOOK });
Object.defineProperty(__etude, "SC_ARTS", { configurable: true, get: () => SC_ARTS });
Object.defineProperty(__etude, "SC_BASE", { configurable: true, get: () => SC_BASE });
Object.defineProperty(__etude, "SC_DYN", { configurable: true, get: () => SC_DYN });
Object.defineProperty(__etude, "SC_FIT", { configurable: true, get: () => SC_FIT });
Object.defineProperty(__etude, "SC_PAGE_W", { configurable: true, get: () => SC_PAGE_W });
Object.defineProperty(__etude, "SC_TERMS", { configurable: true, get: () => SC_TERMS });
Object.defineProperty(__etude, "SES", { configurable: true, get: () => SES });
Object.defineProperty(__etude, "SIDE", { configurable: true, get: () => SIDE });
Object.defineProperty(__etude, "SONGS", { configurable: true, get: () => SONGS });
Object.defineProperty(__etude, "SQ", { configurable: true, get: () => SQ });
Object.defineProperty(__etude, "SR", { configurable: true, get: () => SR });
Object.defineProperty(__etude, "SR_LET", { configurable: true, get: () => SR_LET });
Object.defineProperty(__etude, "SS_FLAT_ORDER", { configurable: true, get: () => SS_FLAT_ORDER });
Object.defineProperty(__etude, "SS_LETSEMI", { configurable: true, get: () => SS_LETSEMI });
Object.defineProperty(__etude, "SS_LEVELS", { configurable: true, get: () => SS_LEVELS });
Object.defineProperty(__etude, "SS_MAJ", { configurable: true, get: () => SS_MAJ });
Object.defineProperty(__etude, "SS_MIN", { configurable: true, get: () => SS_MIN });
Object.defineProperty(__etude, "SS_SHARP_ORDER", { configurable: true, get: () => SS_SHARP_ORDER });
Object.defineProperty(__etude, "SS_SYL_MAJ", { configurable: true, get: () => SS_SYL_MAJ });
Object.defineProperty(__etude, "SS_SYL_MIN", { configurable: true, get: () => SS_SYL_MIN });
Object.defineProperty(__etude, "SYNC", { configurable: true, get: () => SYNC });
Object.defineProperty(__etude, "SYNC_ADD", { configurable: true, get: () => SYNC_ADD });
Object.defineProperty(__etude, "SYNC_ID", { configurable: true, get: () => SYNC_ID });
Object.defineProperty(__etude, "SYNC_MAX", { configurable: true, get: () => SYNC_MAX });
Object.defineProperty(__etude, "SYNC_NONE", { configurable: true, get: () => SYNC_NONE });
Object.defineProperty(__etude, "SYNC_PREFS", { configurable: true, get: () => SYNC_PREFS });
Object.defineProperty(__etude, "TONES", { configurable: true, get: () => TONES });
Object.defineProperty(__etude, "TRX_VALS", { configurable: true, get: () => TRX_VALS });
Object.defineProperty(__etude, "WAKE", { configurable: true, get: () => WAKE });
Object.defineProperty(__etude, "WAKE_IDLE_MS", { configurable: true, get: () => WAKE_IDLE_MS });
Object.defineProperty(__etude, "_modalStack", { configurable: true, get: () => _modalStack });
Object.defineProperty(__etude, "accomp", { configurable: true, get: () => accomp });
Object.defineProperty(__etude, "anDomQ", { configurable: true, get: () => anDomQ });
Object.defineProperty(__etude, "blackEl", { configurable: true, get: () => blackEl });
Object.defineProperty(__etude, "coachText", { configurable: true, get: () => coachText });
Object.defineProperty(__etude, "cof", { configurable: true, get: () => cof });
Object.defineProperty(__etude, "cofMQ", { configurable: true, get: () => cofMQ });
Object.defineProperty(__etude, "held", { configurable: true, get: () => held });
Object.defineProperty(__etude, "heldOrder", { configurable: true, get: () => heldOrder });
Object.defineProperty(__etude, "inputOwners", { configurable: true, get: () => inputOwners });
Object.defineProperty(__etude, "isFlatKey", { configurable: true, get: () => isFlatKey });
Object.defineProperty(__etude, "keyEl", { configurable: true, get: () => keyEl });
Object.defineProperty(__etude, "liveVoices", { configurable: true, get: () => liveVoices });
Object.defineProperty(__etude, "metro", { configurable: true, get: () => metro });
Object.defineProperty(__etude, "midiToFreq", { configurable: true, get: () => midiToFreq });
Object.defineProperty(__etude, "overlayReturn", { configurable: true, get: () => overlayReturn });
Object.defineProperty(__etude, "pc", { configurable: true, get: () => pc });
Object.defineProperty(__etude, "pianoBank", { configurable: true, get: () => pianoBank });
Object.defineProperty(__etude, "pointerKey", { configurable: true, get: () => pointerKey });
Object.defineProperty(__etude, "pracFactor", { configurable: true, get: () => pracFactor });
Object.defineProperty(__etude, "pracMine", { configurable: true, get: () => pracMine });
Object.defineProperty(__etude, "pracSounds", { configurable: true, get: () => pracSounds });
Object.defineProperty(__etude, "rdS", { configurable: true, get: () => rdS });
Object.defineProperty(__etude, "reduceMotion", { configurable: true, get: () => reduceMotion });
Object.defineProperty(__etude, "rootName", { configurable: true, get: () => rootName });
Object.defineProperty(__etude, "sing", { configurable: true, get: () => sing });
Object.defineProperty(__etude, "srSlipNames", { configurable: true, get: () => srSlipNames });
Object.defineProperty(__etude, "srStepNo", { configurable: true, get: () => srStepNo });
Object.defineProperty(__etude, "sustained", { configurable: true, get: () => sustained });
Object.defineProperty(__etude, "themeMQ", { configurable: true, get: () => themeMQ });
Object.defineProperty(__etude, "todayN", { configurable: true, get: () => todayN });
Object.defineProperty(__etude, "trx", { configurable: true, get: () => trx });
Object.defineProperty(__etude, "typingDown", { configurable: true, get: () => typingDown });
Object.defineProperty(__etude, "view", { configurable: true, get: () => view });
Object.defineProperty(__etude, "whiteEl", { configurable: true, get: () => whiteEl });
// These hooks are intentionally mutable because a few browser regressions
// replace an app dependency in-place and verify the caller's behavior.
Object.defineProperty(__etude, "anInflatedSize", { configurable: true, get: () => anInflatedSize, set: (value) => { anInflatedSize = value; } });
Object.defineProperty(__etude, "makePianoVoice", { configurable: true, get: () => makePianoVoice, set: (value) => { makePianoVoice = value; } });
Object.defineProperty(__etude, "pianoDecode", { configurable: true, get: () => pianoDecode, set: (value) => { pianoDecode = value; } });
Object.defineProperty(__etude, "playInterval", { configurable: true, get: () => playInterval, set: (value) => { playInterval = value; } });
Object.defineProperty(__etude, "preparePiano", { configurable: true, get: () => preparePiano, set: (value) => { preparePiano = value; } });
Object.defineProperty(__etude, "previewNote", { configurable: true, get: () => previewNote, set: (value) => { previewNote = value; } });
Object.defineProperty(__etude, "scoreFixPedals", { configurable: true, get: () => scoreFixPedals, set: (value) => { scoreFixPedals = value; } });
Object.defineProperty(__etude, "syncPull", { configurable: true, get: () => syncPull, set: (value) => { syncPull = value; } });
Object.defineProperty(__etude, "actx", { configurable: true, get: () => actx, set: (value) => { actx = value; audioEngine.context = value; } });
Object.defineProperty(__etude, "localSynth", { configurable: true, get: () => localSynth, set: (value) => { localSynth = value; audioEngine.localSynth = value; } });
Object.defineProperty(__etude, "notation", { configurable: true, get: () => notation, set: (value) => { notation = value; } });
Object.defineProperty(__etude, "renderLearn", { configurable: true, get: () => renderLearn, set: (value) => { renderLearn = value; } });
Object.defineProperty(__etude, "show", { configurable: true, get: () => show, set: (value) => { show = value; } });
Object.defineProperty(__etude, "theme", { configurable: true, get: () => theme, set: (value) => { theme = value; } });
window.__etude = __etude;
__etude.loadOsmd = loadOsmd;
