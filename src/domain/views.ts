"use strict";
import * as locale from "../locales/index.js";
import * as content from "../locales/content.js";
import * as storage from "./storage.js";
import * as theory from "./theory.js";
import * as audio from "./audio.js";
import * as notationApi from "./notation.js";
import * as router from "./router.js";
const STRINGS: any = locale.STRINGS, I18N_MUSIC: any = locale.I18N_MUSIC, STEP_LABELS: any = locale.STEP_LABELS, LOCALE_TAGS: any = locale.LOCALE_TAGS;
const LESSONS: any = content.LESSONS, LEARN_UNITS: any = content.LEARN_UNITS, LQZ: any = content.LQZ, LSUM: any = content.LSUM, GLOSS: any = content.GLOSS;
const KEY: any = storage.PTT_KEY, isBackupPayload: any = storage.isBackupPayload, isRecord: any = storage.isRecord, legacySettings: any = storage.legacySettings, parsePttV3: any = storage.parsePttV3, readPttV3: any = storage.readPttV3, restoreSettings: any = storage.restoreSettings, writePttV3: any = storage.writePttV3;
const CHORD_DEGREE_LABELS: any = theory.CHORD_DEGREE_LABELS, SCALE_DEGREE_LABELS: any = theory.SCALE_DEGREE_LABELS, anFnKey: any = theory.analysisFunction, anDiatonic: any = theory.anDiatonic, anIntervalName: any = theory.anIntervalName, anKeyRank: any = theory.anKeyRank, anPcWeights: any = theory.anPcWeights, anResolveKey: any = theory.anResolveKey, CHORD_TEMPLATES: any = theory.CHORD_TEMPLATES, chordDegreeMap: any = theory.chordDegreeMap, chordInversion: any = theory.chordInversion, chordPitches: any = theory.chordPitches, srKeyName: any = theory.circleKeyPitchClass, formatChordFormula: any = theory.formatChordFormula, formatScaleFormula: any = theory.formatScaleFormula, identifyChordDomain: any = theory.identifyChord, keyFifths: any = theory.keyFifths, keyFromFifths: any = theory.keyFromFifths, midiToFrequency: any = theory.midiToFrequency, pitchClass: any = theory.pitchClass, PROGRESSION_TEMPLATES: any = theory.PROGRESSION_TEMPLATES, rdSpellMidi: any = theory.readingSpelling, romanFor: any = theory.romanFor, SCALE_DEFINITIONS: any = theory.SCALE_DEFINITIONS, scorePitch: any = theory.scorePitchXml, spellMidi: any = theory.spellMidi;
const AudioEngine: any = audio.AudioEngine;
const createScoreRenderer: any = notationApi.createScoreRenderer, loadOsmd: any = notationApi.loadOsmd, mxlToXml: any = notationApi.mxlToXml, notationReloadMessage: any = notationApi.notationReloadMessage, scorePatchOsmd: any = notationApi.scorePatchOsmd;
const NAV_GROUPS: any = router.NAV_GROUPS, navGroup: any = router.navGroup, viewFromHash: any = router.viewFromHash;
function t(k: any = undefined, ...args: any[]): any { const s: any = STRINGS[lang] || STRINGS.en; let v: any = (s[k] != null ? s[k] : (STRINGS.en ? STRINGS.en[k] : null)); if (v == null)
    return k; if (!args.length)
    return v; if (args[0] != null)
    v = v.replace('%a', args[0]); if (args[1] != null)
    v = v.replace('%b', args[1]); for (let i: any = 0; i < args.length; i++) {
    if (args[i] != null)
        v = v.replace('%s', args[i]);
} return v; }
/* ============================================================================
   ÉTUDE — V3.  Reuses the verified V2 theory/audio/MIDI engine; adds a
   spaced-repetition learning core and an editorial UI.
   ============================================================================ */
/* ---------- DATA ---------- */
const PC_SHARP: any = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC_FLAT: any = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROOT_NAMES: any = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_SYS: any = {
    letter: { sharp: PC_SHARP, flat: PC_FLAT, root: ROOT_NAMES },
    german: { sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'], flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'], root: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'B', 'H'] },
    solfege: { sharp: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
        flat: ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'],
        root: ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'] },
};
let notation: any = 'letter';
/* ---------- THEME ---------- */
let theme: any = 'auto';
const themeMQ: any = (window as any).matchMedia ? (window as any).matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme(): any {
    const dark: any = theme === 'dark' || (theme === 'auto' && themeMQ && themeMQ.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    (document as any).querySelectorAll('meta[name="theme-color"]').forEach((m: any = undefined) => m.setAttribute('content', dark ? '#171412' : '#f7f3ec')); // browser/app bar follows the chosen theme
    (document as any).querySelectorAll('#set-theme button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === theme ? 'true' : 'false'));
}
if (themeMQ && themeMQ.addEventListener)
    themeMQ.addEventListener('change', () => { if (theme === 'auto')
        applyTheme(); });
const INTERVALS: any = [
    { semi: 1, name: 'Minor 2nd', short: 'm2' }, { semi: 2, name: 'Major 2nd', short: 'M2' }, { semi: 3, name: 'Minor 3rd', short: 'm3' },
    { semi: 4, name: 'Major 3rd', short: 'M3' }, { semi: 5, name: 'Perfect 4th', short: 'P4' }, { semi: 6, name: 'Tritone', short: 'TT' },
    { semi: 7, name: 'Perfect 5th', short: 'P5' }, { semi: 8, name: 'Minor 6th', short: 'm6' }, { semi: 9, name: 'Major 6th', short: 'M6' },
    { semi: 10, name: 'Minor 7th', short: 'm7' }, { semi: 11, name: 'Major 7th', short: 'M7' }, { semi: 12, name: 'Octave', short: 'P8' },
];
const COMPOUND: any = { 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave', 13: 'Minor 9th', 14: 'Major 9th', 15: 'Minor 10th', 16: 'Major 10th', 17: 'Perfect 11th', 18: 'Augmented 11th', 19: 'Perfect 12th', 20: 'Minor 13th', 21: 'Major 13th', 22: 'Minor 14th', 23: 'Major 14th', 24: 'Two octaves' };
const RO_IV: any = COMPOUND;
const SONGS: any = {
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
const SCALES: any = SCALE_DEFINITIONS;
const CHORDS: any = CHORD_TEMPLATES;
const CHORD_FEEL: any = { maj: 'bright, resolved', m: 'darker, melancholy', dim: 'tense, unstable', aug: 'dreamlike', sus2: 'open, airy', sus4: 'suspended', maj7: 'lush, jazzy', '7': 'bluesy, wants to resolve', m7: 'smooth, mellow', 'm7♭5': 'dark, cinematic', dim7: 'very tense', mMaj7: 'noir', 6: 'sweet, vintage', m6: 'wistful', '9': 'funky', maj9: 'dreamy', m9: 'soulful' };
const INV_NAMES: any = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion'];
const SCALE_DEG: any = SCALE_DEGREE_LABELS;
const CHORD_DEG: any = CHORD_DEGREE_LABELS;
const MAJOR: any = [0, 2, 4, 5, 7, 9, 11], ROMAN: any = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const PROGS: any = PROGRESSION_TEMPLATES;
function progChordTpl(sym: any = undefined): any { return CHORDS.find((c: any = undefined) => c.symbol === sym); }
function dispSym(s: any = undefined): any { return s === 'maj' ? '' : s; }
/* Accompaniment: extra popular progressions + rhythmic playing patterns. */
const ACCOMP_PROGS: any = PROGS.concat([
    { name: 'I–V–vi–iii–IV–I (Pachelbel pop)', chords: [[0, 'maj', 'I'], [7, 'maj', 'V'], [9, 'm', 'vi'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [0, 'maj', 'I']] },
    { name: 'Andalusian i–♭VII–♭VI–V', chords: [[0, 'm', 'i'], [10, 'maj', '♭VII'], [8, 'maj', '♭VI'], [7, 'maj', 'V']] },
    { name: 'Jazz turnaround I–vi–ii–V', chords: [[0, 'maj7', 'I'], [9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V']] },
    { name: 'Circle of 5ths vi–ii–V–I', chords: [[9, 'm7', 'vi'], [2, 'm7', 'ii'], [7, '7', 'V'], [0, 'maj7', 'I']] },
    { name: 'Ballad I–iii–IV–V', chords: [[0, 'maj', 'I'], [4, 'm', 'iii'], [5, 'maj', 'IV'], [7, 'maj', 'V']] },
]);
const ACCOMP_PATTERNS: any = {
    block: { beats: 4, en: 'Block chords', ro: 'Acorduri bloc', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); c.right.forEach((m: any = undefined) => ev.push({ beat: b, midi: m, durB: 4, hand: 'R' })); } },
    arp: { beats: 4, en: 'Arpeggio (broken)', ro: 'Arpegiu (frânt)', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const up: any = c.right, seq: any = up.concat(up.slice(0, -1).reverse()); for (let i: any = 0; i < 8; i++)
            ev.push({ beat: b + i * 0.5, midi: seq[i % seq.length], durB: 0.55, hand: 'R' }); } },
    alberti: { beats: 4, en: 'Alberti bass', ro: 'Bas Alberti', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const r: any = c.right, fig: any = [r[0], r[r.length - 1], r[1] || r[0], r[r.length - 1]]; for (let i: any = 0; i < 8; i++)
            ev.push({ beat: b + i * 0.5, midi: fig[i % 4], durB: 0.55, hand: 'R' }); } },
    waltz: { beats: 3, en: 'Waltz (3/4)', ro: 'Vals (3/4)', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 1, hand: 'L' }); [1, 2].forEach((k: any = undefined) => c.right.forEach((m: any = undefined) => ev.push({ beat: b + k, midi: m, durB: 1, hand: 'R' }))); } },
    ballad: { beats: 4, en: 'Pop ballad', ro: 'Baladă pop', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 4, hand: 'L' }); const r: any = c.right; for (let i: any = 0; i < 4; i++)
            ev.push({ beat: b + i, midi: r[i % r.length], durB: 4 - i, hand: 'R' }); } },
    boomchick: { beats: 4, en: 'Boom-chick', ro: 'Boom-chick', gen(ev: any = undefined, b: any = undefined, c: any = undefined) { ev.push({ beat: b, midi: c.bass, durB: 1, hand: 'L' }); ev.push({ beat: b + 2, midi: c.fifth, durB: 1, hand: 'L' }); [1, 3].forEach((k: any = undefined) => c.right.forEach((m: any = undefined) => ev.push({ beat: b + k, midi: m, durB: 0.85, hand: 'R' }))); } },
};
const ACCOMP_I18N: any = {
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
const CIRCLE: any = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
/* ---------- i18n ---------- */
let lang: any = 'en';
function ivName(semi: any = undefined): any { const d: any = I18N_MUSIC.intervals[lang]; if (d && d[semi])
    return d[semi]; return (INTERVALS.find((x: any = undefined) => x.semi === semi) || {}).name || COMPOUND[semi] || '?'; }
function scaleDisp(n: any = undefined): any { const d: any = I18N_MUSIC.scales[lang]; return (d && d[n]) || n; }
function chordDisp(c: any = undefined): any { const sym: any = typeof c === 'string' ? c : c.symbol, name: any = typeof c === 'string' ? c : c.name, d: any = I18N_MUSIC.chords[lang]; return (d && d[sym]) || name; }
function catLabel(cat: any = undefined): any { const d: any = I18N_MUSIC.categories[lang]; return (d && d[cat]) || (CATS[cat] && CATS[cat].label) || cat; }
function invName(i: any = undefined): any { const d: any = I18N_MUSIC.inversions[lang]; return (d && d[i]) || INV_NAMES[i] || ''; }
function feelDisp(sym: any = undefined): any { const d: any = I18N_MUSIC.feels[lang]; return (d && d[sym]) || CHORD_FEEL[sym] || ''; }
function itemLabel(it: any = undefined): any { return it.cat === 'interval' ? ivName(it.semi) : it.cat === 'chord' ? chordDisp(it.ref) : it.cat === 'scale' ? scaleDisp(it.name) : it.ref.name; }
function songsFor(semi: any = undefined, dir: any = undefined): any { const src: any = (I18N_MUSIC.songs && I18N_MUSIC.songs[lang]) || SONGS; return (src[semi] || {})[dir] || []; }
/* V3 pages: strings for Today plan, Learn progress, Songs ear check, Progress, a11y labels */
/* V5: highlight toggle and contextual coaching (Reading focus · What to notice · Next step). %a %b %c are filled by tf(). */
/* Bluetooth MIDI, answering by ear on the keys, rhythm lengths & two hands, installed app & screen */
function applyI18n(): any {
    (document as any).querySelectorAll('[data-i18n]').forEach((el: any = undefined) => { el.textContent = t(el.dataset.i18n); });
    (document as any).querySelectorAll('[data-i18n-aria]').forEach((el: any = undefined) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    (document as any).querySelectorAll('[data-i18n-title]').forEach((el: any = undefined) => { el.title = t(el.dataset.i18nTitle); });
    if (!activeInputId) {
        midiMsg = null;
        const ss: any = $('set-midi-status');
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
function setLang(l: any = undefined): any {
    lang = l;
    (document as any).querySelectorAll('#set-lang button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === l ? 'true' : 'false'));
    applyI18n();
    const rr: any = $('refRoot').value, kc: any = $('keyCtx').value, sr: any = $('song-root').value, pk: any = $('pr-key').value, rn: any = $('refName').value; // re-fill selects so "All keys"/"none"/scale names re-localise
    fillRoots($('refRoot'), false);
    fillRoots($('song-root'), false);
    fillRoots($('pr-key'), true);
    fillRefNames();
    fillKeyCtx();
    $('refRoot').value = rr || 0;
    $('song-root').value = sr || 0;
    $('pr-key').value = pk || 'all';
    $('keyCtx').value = kc || '-1';
    if (rn)
        $('refName').value = rn;
    const ssc: any = $('tr-sscale');
    if (ssc && ssc._filled) {
        const v: any = ssc.value;
        ssc.innerHTML = '';
        Object.keys(SCALES).forEach((nm: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = nm; o.textContent = scaleDisp(nm); ssc.appendChild(o); });
        ssc.value = v || 'Major (Ionian)';
    }
    const ap: any = $('ac-pat');
    if (ap && ap._filled) {
        const v: any = ap.value;
        ap.innerHTML = '';
        Object.keys(ACCOMP_PATTERNS).forEach((k: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = k; o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en; ap.appendChild(o); });
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
const $: any = (id: any = undefined) => (document as any).getElementById(id);
const midiToFreq: any = midiToFrequency;
const pc: any = pitchClass;
const isFlatKey: any = (p: any = undefined) => [3, 5, 8, 10].includes(((p % 12) + 12) % 12);
const rootName: any = (p: any = undefined) => NOTE_SYS[notation].root[((p % 12) + 12) % 12];
function pcName(p: any = undefined, flat: any = undefined): any { return (flat ? NOTE_SYS[notation].flat : NOTE_SYS[notation].sharp)[((p % 12) + 12) % 12]; }
function noteName(m: any = undefined, flat: any = undefined): any { return pcName(pc(m), flat) + (Math.floor(m / 12) - 1); }
function setEq(a: any = undefined, b: any = undefined): any { if (a.length !== b.length)
    return false; for (let i: any = 0; i < a.length; i++)
    if (a[i] !== b[i])
        return false; return true; }
function isSubset(a: any = undefined, b: any = undefined): any { return a.every((x: any = undefined) => b.includes(x)); }
function randItem(a: any = undefined): any { return a[Math.floor(Math.random() * a.length)]; }
function shuffle(a: any = undefined): any { a = a.slice(); for (let i: any = a.length - 1; i > 0; i--) {
    const j: any = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
function intervalLabel(semi: any = undefined): any { const d: any = I18N_MUSIC.intervals[lang]; if (d && d[semi])
    return d[semi]; const C: any = lang === 'ro' ? RO_IV : COMPOUND; if (C[semi])
    return C[semi]; const oct: any = Math.floor(semi / 12), s: any = semi % 12; const base: any = s === 0 ? ivName(12) : ivName(s); return base + (lang === 'ro' ? (' + ' + oct + ' octav' + (oct > 1 ? 'e' : 'ă')) : (' + ' + oct + ' octave' + (oct > 1 ? 's' : ''))); }
function chordFormula(c: any = undefined): any { return formatChordFormula(c.intervals); }
function scaleFormula(offs: any = undefined): any { return formatScaleFormula(offs); }
const todayN: any = () => { const d: any = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
/* ---------- AUDIO ENGINE ---------- */
// Web Audio construction and voice ownership live in the typed audio domain.
const PIANO_KEYS: any = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];
const PIANO_URLS: any = Object.fromEntries(PIANO_KEYS.map((key: any = undefined) => [key, new URL(`../assets/piano/${key}.mp3`, import.meta.url).href]));
const PIANO_WARM: any = [48, 84];
const audioEngine: any = new AudioEngine({ pianoKeys: PIANO_KEYS, pianoUrls: PIANO_URLS, warmRange: PIANO_WARM, onPianoStatus: () => pianoStatus() });
let actx: any = null;
let master: any = null;
let masterFilter: any = null;
let comp: any = null;
let lfo: any = null;
let lfoGain: any = null;
let reverbNode: any = null;
let reverbGain: any = null;
let muted: any = false;
let masterVol: any = 0.72;
let bendSemitones: any = 0;
let localSynth: any = true;
let tone: any = 'piano';
let reverbWet: any = 0.125;
const liveVoices: any = audioEngine.liveVoices;
let previewVoices: any = audioEngine.previewVoices;
const pianoBank: any = audioEngine.pianoBank;
const metro: any = { on: false, bpm: 90, next: 0, beat: 0, timer: null };
function syncAudioState(): any {
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
}
function pianoStatus(): any {
    const message: any = t(pianoBank.status === 'ready' ? 'piano_ready' : pianoBank.status === 'error' ? 'piano_error' : 'piano_loading');
    const global: any = $('piano-global-status');
    if (global) global.textContent = message;
    const dock: any = $('piano-status');
    if (dock) { dock.hidden = pianoBank.status === 'ready'; dock.textContent = message; }
}
function pianoKeys(): any { return pianoBank.keys; }
function pianoNearest(midi: any = undefined): any { return pianoBank.keys.reduce((best: any = undefined, key: any = undefined) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best, pianoBank.keys[0] ?? 60); }
function pianoFail(error: any = undefined): any { pianoBank.fail(error); }
let pianoDecode: any = (key: any = undefined) => pianoBank.decode(key);
function pianoEnsure(midis: any = undefined): any { return audioEngine.pianoEnsure(midis); }
function pianoIdleWarm(): any { pianoBank.warmIdle(); }
let preparePiano: any = () => pianoBank.prepare(PIANO_WARM);
let makePianoVoice: any = (frequency: any = undefined, velocity: any = undefined, when: any = undefined, duration: any = undefined) => audioEngine.makePianoVoice(frequency, velocity, when, duration);
function sampledPianoVoice(frequency: any = undefined, velocity: any = undefined, when: any = undefined, duration: any = undefined, options: any = {}): any {
    ensureAudio();
    const voice: any = audioEngine.sampledPianoVoice(frequency, velocity, when, duration, options, { decode: pianoDecode, fallbackVoice: makePianoVoice });
    syncAudioState();
    return voice;
}
function makeVoice(frequency: any = undefined, velocity: any = undefined, when: any = undefined, duration: any = undefined): any {
    ensureAudio();
    const voice: any = audioEngine.makeVoice(frequency, velocity, when, duration);
    syncAudioState();
    return voice;
}
function ensureAudio(): any {
    const context: any = audioEngine.ensureAudio();
    syncAudioState();
    if (context) void preparePiano();
    return context;
}
let audioLockT: any = 0;
function audioLockSync(): any {
    if (!actx || actx.state !== 'running') return;
    clearTimeout(audioLockT); audioLockT = 0;
    const el: any = $('audioLock'); if (el) el.hidden = true;
}
function audioLockCheck(): any {
    if (!localSynth || !actx || actx.state === 'running' || audioLockT) return;
    audioLockT = setTimeout(() => { audioLockT = 0; const el: any = $('audioLock'); if (el && localSynth && actx && actx.state !== 'running') el.hidden = false; }, 300);
}
function audioUnlock(): any { ensureAudio(); const context: any = actx; if (context && context.state !== 'running') void context.resume().then(audioLockSync).catch(() => undefined); else audioLockSync(); }
function audioNoteOn(midi: any = undefined, velocity: any = undefined): any { syncAudioState(); audioEngine.noteOn(midi, velocity || 100, { decode: pianoDecode, fallbackVoice: makePianoVoice }); syncAudioState(); }
function audioNoteOff(midi: any = undefined): any { audioEngine.noteOff(midi); syncAudioState(); }
function stopPreviews(): any { clearExplorePreview(); audioEngine.stopPreviews(); syncAudioState(); }
function setBendFromValue(value: any = undefined): any { audioEngine.setBendFromValue(value); bendSemitones = audioEngine.bendSemitones; }
function masterRamp(value: any = undefined): any { audioEngine.masterRamp(value); syncAudioState(); }
function startDrone(rootPc: any = undefined): any { audioEngine.startDrone(rootPc); syncAudioState(); }
function stopDrone(): any { audioEngine.stopDrone(); syncAudioState(); }
function startMetro(): any { audioEngine.startMetro(metro.bpm); metro.on = true; metro.timer = true; }
function stopMetro(): any { audioEngine.stopMetro(); metro.on = false; metro.timer = null; }
function metroSched(): any { audioEngine.startMetro(metro.bpm); }
function metroClick(when: any = undefined, accent: any = undefined): any { audioEngine.metroClick(when, accent); }
let previewNote: any = function previewNote(midi: any = undefined, when: any = undefined, duration: any = undefined, velocity: any = undefined, options: any = {}): any { audioEngine.preview(midi, when, duration, velocity || 96, options); syncAudioState(); }
let playInterval: any = (rootMidi: any = undefined, semitones: any = undefined, style: any = undefined) => { audioEngine.playInterval(rootMidi, semitones, style || 'both'); syncAudioState(); };
function playIvDir(root: any = undefined, semitones: any = undefined, direction: any = undefined): any { if (direction === 'desc') playInterval(root + semitones, -semitones, 'both'); else playInterval(root, semitones, 'both'); }
function playChordMidis(midis: any = undefined, arpeggio: any = undefined): any {
    ensureAudio(); stopPreviews();
    exploreSequence(arpeggio ? midis.map((midi: any = undefined, index: any = undefined) => ({ at: index * 160, notes: [midi] })).concat([{ at: midis.length * 160 + 100, notes: midis }, { at: midis.length * 160 + 1200, notes: [] }]) : [{ at: 0, notes: midis }, { at: 1200, notes: [] }]);
    const start: any = actx?.currentTime ?? 0;
    if (arpeggio) { midis.forEach((midi: any = undefined, index: any = undefined) => previewNote(midi, start + index * 0.16, 0.4)); midis.forEach((midi: any = undefined) => previewNote(midi, start + midis.length * 0.16 + 0.1, 1.1)); }
    else midis.forEach((midi: any = undefined) => previewNote(midi, start, 1.2));
}
function playScaleNotes(rootMidi: any = undefined, offsets: any = undefined, ascending: any = undefined): any {
    ensureAudio(); stopPreviews();
    const start: any = actx?.currentTime ?? 0; let sequence: any = offsets.concat([12]);
    if (!ascending) sequence = sequence.slice().reverse();
    exploreSequence(sequence.map((offset: any = undefined, index: any = undefined) => ({ at: index * 270, notes: [rootMidi + offset] })).concat([{ at: sequence.length * 270, notes: [] }]));
    sequence.forEach((offset: any = undefined, index: any = undefined) => previewNote(rootMidi + offset, start + index * 0.27, 0.26));
}
const droneVoices: any = audioEngine.droneVoices;
const TONES: any = { soft: { w: ['triangle', 'sawtooth', 'sawtooth'], cut: 6 }, bright: { w: ['sawtooth', 'sawtooth', 'square'], cut: 9 }, organ: { w: ['sine', 'sine', 'sine'], cut: 14, oct: [0, 1200, 1902] }, mellow: { w: ['sine', 'triangle', 'sine'], cut: 3.2 }, glass: { w: ['sine', 'triangle', 'square'], cut: 11 } };
let _noiseBuf: any = null;
function noiseBuffer(): any { return _noiseBuf; }
function makeIR(): any { return null; }
/* ---------- ACCOMPANIMENT LOOP ---------- */
const accomp: any = { on: false, progIdx: 0, key: 0, pattern: 'block', bpm: 90, hands: 'both', click: false, timer: null, hlTimers: [], built: null, beatSec: .5, loopDur: 0, nextLoop: 0 };
function accompVoicing(ch: any = undefined): any {
    const rootPc: any = (((accomp.key + ch[0]) % 12) + 12) % 12, tpl: any = progChordTpl(ch[1]) || progChordTpl('maj');
    const ivs: any = tpl.intervals.filter((i: any = undefined) => i < 24);
    let rRoot: any = 60 + rootPc;
    if (rRoot > 71)
        rRoot -= 12; // right hand sits around C4
    return { bass: 36 + rootPc, fifth: 36 + ((rootPc + 7) % 12), right: ivs.map((i: any = undefined) => rRoot + i) };
}
;
function buildAccomp(): any {
    const prog: any = ACCOMP_PROGS[accomp.progIdx] || ACCOMP_PROGS[0];
    const pat: any = ACCOMP_PATTERNS[accomp.pattern] || ACCOMP_PATTERNS.block;
    const ev: any = [];
    let beat: any = 0;
    prog.chords.forEach((ch: any = undefined) => { pat.gen(ev, beat, accompVoicing(ch)); beat += pat.beats; });
    return { events: ev, beatsTotal: beat };
}
function accompTimer(fn: any = undefined, ms: any = undefined): any {
    const id: any = setTimeout(() => { const i: any = accomp.hlTimers.indexOf(id); if (i >= 0)
        accomp.hlTimers.splice(i, 1); fn(); }, Math.max(0, ms));
    accomp.hlTimers.push(id);
}
function accompHL(midi: any = undefined, st: any = undefined, onMs: any = undefined, offMs: any = undefined): any {
    accompTimer(() => { if (accomp.on)
        kbState(midi, st, true); }, onMs);
    accompTimer(() => { if (!accomp.on)
        return; const el: any = keyEl.get(foldToView(midi)); if (el && el.dataset.s === st)
        kbState(midi, null, true); }, offMs);
}
function scheduleAccompAt(t0: any = undefined): any {
    const bs: any = accomp.beatSec;
    accomp.built.events.forEach((e: any = undefined) => {
        if (accomp.hands !== 'both' && e.hand !== (accomp.hands === 'left' ? 'L' : 'R'))
            return;
        const when: any = t0 + e.beat * bs, dur: any = Math.max(.12, e.durB * bs * 0.95);
        previewNote(e.midi, when, dur, e.hand === 'L' ? 78 : 98);
        const onMs: any = (when - actx.currentTime) * 1000;
        accompHL(e.midi, e.hand === 'L' ? 'lh' : 'rh', onMs, onMs + Math.min(dur, 1.05) * 1000);
    });
    const n: any = (ACCOMP_PROGS[accomp.progIdx] || ACCOMP_PROGS[0]).chords.length, per: any = accomp.built.beatsTotal / Math.max(1, n);
    for (let i: any = 0; i < n; i++)
        accompTimer(() => { if (accomp.on)
            acChainHL(i); }, (t0 + i * per * bs - actx.currentTime) * 1000);
}
function acChainHL(i: any = undefined): any { (document as any).querySelectorAll('#ac-chain .ch').forEach((el: any = undefined, k: any = undefined) => el.classList.toggle('on', k === i)); }
function accompTick(): any { if (!accomp.on || !actx)
    return; while (accomp.nextLoop < actx.currentTime + 0.6) {
    scheduleAccompAt(accomp.nextLoop);
    accomp.nextLoop += accomp.loopDur;
} }
function accompStart(): any {
    ensureAudio();
    accompStop(true);
    accomp.on = true;
    accomp.built = buildAccomp();
    accomp.beatSec = 60 / accomp.bpm;
    accomp.loopDur = accomp.built.beatsTotal * accomp.beatSec;
    if (accomp.loopDur <= 0) {
        accomp.on = false;
        return;
    }
    accomp.nextLoop = actx.currentTime + 0.18;
    if (accomp.click) {
        metro.bpm = accomp.bpm;
        startMetro();
    }
    accomp.timer = setInterval(accompTick, 40);
    accompTick();
}
function accompStop(silent: any = undefined): any {
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
    const pb: any = (document as any).getElementById('ac-play');
    if (pb)
        pb.textContent = t('ac_play');
}
/* ---------- TRANSCRIBE (hum → notes) ---------- */
const trx: any = { on: false, pending: false, micRequest: 0, stream: null, src: null, analyser: null, buf: null, raf: 0, notes: [], display: null, curMidi: null, curStart: 0, lastVoice: 0, ring: [], hlTimers: [] };
function trxFreqToMidi(f: any = undefined): any { return Math.round(69 + 12 * Math.log2(f / 440)); }
function trxAutoCorrelate(buf: any = undefined, sr: any = undefined): any {
    let SIZE: any = buf.length, rms: any = 0;
    for (let i: any = 0; i < SIZE; i++)
        rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.012)
        return -1; // too quiet → silence
    let r1: any = 0, r2: any = SIZE - 1;
    const thr: any = 0.2;
    for (let i: any = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thr) {
            r1 = i;
            break;
        }
    }
    for (let i: any = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thr) {
            r2 = SIZE - i;
            break;
        }
    }
    const b: any = buf.subarray(r1, r2);
    SIZE = b.length;
    if (SIZE < 16)
        return -1;
    const c: any = new Float32Array(SIZE);
    for (let i: any = 0; i < SIZE; i++) {
        let s: any = 0;
        for (let j: any = 0; j < SIZE - i; j++)
            s += b[j] * b[j + i];
        c[i] = s;
    }
    let d: any = 0;
    while (d < SIZE - 1 && c[d] > c[d + 1])
        d++;
    let max: any = -1, pos: any = -1;
    for (let i: any = d; i < SIZE; i++) {
        if (c[i] > max) {
            max = c[i];
            pos = i;
        }
    }
    if (pos <= 0)
        return -1;
    const x1: any = c[pos - 1] || 0, x2: any = c[pos], x3: any = c[pos + 1] || 0, a: any = (x1 + x3 - 2 * x2) / 2, bb: any = (x3 - x1) / 2;
    let T: any = pos;
    if (a)
        T = pos - bb / (2 * a);
    const f: any = sr / T;
    return (f > 70 && f < 1300) ? f : -1;
}
async function trxStart() {
    if (trx.on || trx.pending)
        return;
    ensureAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        $('tr-msg').textContent = t('tr_micfail');
        return;
    }
    const request: any = ++trx.micRequest;
    trx.pending = true;
    $('tr-rec').textContent = t('tr_stop');
    try {
        const stream: any = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (request !== trx.micRequest || view0() !== 'transcribe') {
            stream.getTracks().forEach((t: any = undefined) => t.stop());
            return;
        }
        trx.stream = stream;
        trx.pending = false;
    }
    catch (e: any) {
        if (request === trx.micRequest) {
            trx.pending = false;
            $('tr-rec').textContent = t('tr_rec');
            $('tr-msg').textContent = t('tr_micfail');
        }
        return;
    }
    $('tr-msg').textContent = '';
    trx.src = actx.createMediaStreamSource(trx.stream);
    trx.analyser = actx.createAnalyser();
    trx.analyser.fftSize = 2048;
    trx.buf = new Float32Array(trx.analyser.fftSize);
    trx.src.connect(trx.analyser); // not connected to destination → no feedback
    trx.on = true;
    trx.notes = [];
    trx.display = null;
    trx.curMidi = null;
    trx.ring = [];
    trx.lastVoice = actx.currentTime;
    $('tr-rec').classList.add('rec-on');
    $('tr-rec').textContent = t('tr_stop');
    $('tr-live').classList.add('rec');
    $('tr-actions').style.display = 'none';
    $('tr-out').innerHTML = '';
    trxLoop();
}
function trxMedian(): any { const a: any = trx.ring.slice().sort((x: any = undefined, y: any = undefined) => x - y); return a[Math.floor(a.length / 2)]; }
function trxCloseNote(tEnd: any = undefined): any { if (trx.curMidi == null)
    return; const dur: any = tEnd - trx.curStart; if (dur >= 0.09)
    trx.notes.push({ midi: trx.curMidi, start: trx.curStart, dur }); trx.curMidi = null; }
function trxLoop(): any {
    if (!trx.on)
        return;
    trx.analyser.getFloatTimeDomainData(trx.buf);
    const f: any = trxAutoCorrelate(trx.buf, actx.sampleRate), now: any = actx.currentTime;
    if (f < 0) {
        if (trx.curMidi != null && now - trx.lastVoice > 0.12) {
            trxCloseNote(now);
            trx.ring = [];
        }
        $('tr-live').textContent = '—';
    }
    else {
        trx.lastVoice = now;
        let m: any = trxFreqToMidi(f);
        m = Math.max(36, Math.min(88, m));
        trx.ring.push(m);
        if (trx.ring.length > 5)
            trx.ring.shift();
        const sm: any = trxMedian(), cents: any = Math.round(1200 * Math.log2(f / midiToFreq(sm)));
        $('tr-live').innerHTML = noteName(sm, false) + '<small>' + (cents >= 0 ? '+' : '') + cents + '¢</small>';
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
function trxStop(): any {
    trx.micRequest++;
    trx.pending = false;
    $('tr-rec').textContent = t('tr_rec');
    if (!trx.on)
        return;
    trx.on = false;
    cancelAnimationFrame(trx.raf);
    trxCloseNote(actx ? actx.currentTime : 0);
    if (trx.src) {
        try {
            trx.src.disconnect();
        }
        catch (_: any) { }
        trx.src = null;
    }
    if (trx.stream) {
        trx.stream.getTracks().forEach((t: any = undefined) => t.stop());
        trx.stream = null;
    }
    $('tr-rec').classList.remove('rec-on');
    $('tr-rec').textContent = t('tr_rec');
    $('tr-live').classList.remove('rec');
    $('tr-live').textContent = '—';
    trxRender();
}
function trxSnap(midi: any = undefined): any {
    if (!$('tr-snap').checked)
        return midi;
    const root: any = +($('tr-skey').value || 0), scale: any = SCALES[$('tr-sscale').value] || SCALES['Major (Ionian)'], set: any = scale.map((s: any = undefined) => (root + s) % 12);
    let best: any = midi, bd: any = 99;
    for (let dd: any = -2; dd <= 2; dd++) {
        if (set.includes(((midi + dd) % 12 + 12) % 12) && Math.abs(dd) < bd) {
            bd = Math.abs(dd);
            best = midi + dd;
        }
    }
    return best;
}
const TRX_VALS: any = [{ b: 4, l: '1/1' }, { b: 3, l: '1/2.' }, { b: 2, l: '1/2' }, { b: 1.5, l: '1/4.' }, { b: 1, l: '1/4' }, { b: 0.75, l: '1/8.' }, { b: 0.5, l: '1/8' }, { b: 0.25, l: '1/16' }];
function trxDurLabel(beats: any = undefined): any { let best: any = TRX_VALS[0], bd: any = 1e9; TRX_VALS.forEach((v: any = undefined) => { const d: any = Math.abs(v.b - beats); if (d < bd) {
    bd = d;
    best = v;
} }); return best.l; }
function trxRender(): any {
    const out: any = $('tr-out');
    out.innerHTML = '';
    if (!trx.notes.length) {
        $('tr-msg').textContent = t('tr_none');
        $('tr-actions').style.display = 'none';
        return;
    }
    $('tr-msg').textContent = '';
    trx.bpm = +($('tr-bpm').value || 90);
    const beatSec: any = 60 / trx.bpm, quant: any = $('tr-quant').checked, step: any = 4 / (+($('tr-gridSel').value || 8)); // step in beats
    const base: any = trx.notes[0].start;
    trx.display = trx.notes.map((n: any = undefined) => {
        let sb: any = (n.start - base) / beatSec, db: any = n.dur / beatSec;
        if (quant) {
            sb = Math.round(sb / step) * step;
            db = Math.max(step, Math.round(db / step) * step);
        }
        return { midi: trxSnap(n.midi), sb, db, label: quant ? trxDurLabel(db) : '' };
    });
    const maxDb: any = Math.max(...trx.display.map((n: any = undefined) => n.db));
    trx.display.forEach((n: any = undefined) => {
        const w: any = Math.max(16, Math.round(120 * n.db / maxDb));
        const el: any = (document as any).createElement('div');
        el.className = 'tr-note';
        el.innerHTML = '<span class="nm">' + noteName(n.midi, false) + '</span><span class="bar" style="width:' + w + 'px"></span>' + (n.label ? '<span class="dl">' + n.label + '</span>' : '');
        out.appendChild(el);
    });
    $('tr-actions').style.display = 'flex';
}
function trxPlay(): any {
    if (!trx.display || !trx.display.length)
        return;
    ensureAudio();
    stopPreviews();
    trx.hlTimers.forEach(clearTimeout);
    trx.hlTimers = [];
    const beatSec: any = 60 / (trx.bpm || 90), t0: any = actx.currentTime + 0.12;
    trx.display.forEach((n: any = undefined) => {
        const when: any = t0 + n.sb * beatSec, dur: any = Math.max(0.12, n.db * beatSec * 0.95), onMs: any = (when - actx.currentTime) * 1000;
        previewNote(n.midi, when, dur, 100);
        trx.hlTimers.push(setTimeout(() => kbState(n.midi, 'rh', true), Math.max(0, onMs)));
        trx.hlTimers.push(setTimeout(() => { const el: any = keyEl.get(foldToView(n.midi)); if (el && el.dataset.s === 'rh')
            kbState(n.midi, null, true); }, Math.max(0, onMs + Math.min(dur, 1.0) * 1000)));
    });
}
/* MIDI / text export */
function trxPushVar(arr: any = undefined, v: any = undefined): any { v = Math.max(0, Math.round(v)); const b: any = [v & 0x7F]; v >>= 7; while (v > 0) {
    b.unshift((v & 0x7F) | 0x80);
    v >>= 7;
} b.forEach((x: any = undefined) => arr.push(x)); }
function trxBuildMidi(): any {
    const TPQN: any = 480, bpm: any = trx.bpm || 90, ev: any = [];
    trx.display.forEach((n: any = undefined) => { const on: any = Math.round(n.sb * TPQN), off: any = on + Math.max(1, Math.round(n.db * TPQN)); ev.push({ t: on, k: 1, m: n.midi }); ev.push({ t: off, k: 0, m: n.midi }); });
    ev.sort((a: any = undefined, b: any = undefined) => a.t - b.t || a.k - b.k);
    const trk: any = [], mpqn: any = Math.round(60000000 / bpm);
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x51, 0x03, (mpqn >> 16) & 255, (mpqn >> 8) & 255, mpqn & 255);
    let last: any = 0;
    ev.forEach((e: any = undefined) => { trxPushVar(trk, e.t - last); last = e.t; trk.push(e.k ? 0x90 : 0x80, e.m & 127, e.k ? 90 : 0); });
    trxPushVar(trk, 0);
    trk.push(0xFF, 0x2F, 0x00);
    const head: any = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQN >> 8) & 255, TPQN & 255];
    const L: any = trk.length, th: any = [0x4D, 0x54, 0x72, 0x6B, (L >> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255];
    const out: any = new Uint8Array(head.length + th.length + L);
    out.set(head, 0);
    out.set(th, head.length);
    out.set(trk, head.length + th.length);
    return out;
}
function trxDownload(name: any = undefined, blob: any = undefined): any { const url: any = URL.createObjectURL(blob), a: any = (document as any).createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
function trxExportMidi(): any { if (!trx.display || !trx.display.length)
    return; trxDownload('etude-melody.mid', new Blob([trxBuildMidi()], { type: 'audio/midi' })); }
function trxExportTxt(): any { if (!trx.display || !trx.display.length)
    return; const txt: any = 'Étude — melody\nTempo: ' + (trx.bpm || 90) + ' BPM\n\nNote\tValue\n' + trx.display.map((n: any = undefined) => noteName(n.midi, false) + '\t' + (n.label || '')).join('\n') + '\n'; trxDownload('etude-melody.txt', new Blob([txt], { type: 'text/plain' })); }
function trxClear(): any { trxStop(); trx.notes = []; trx.display = null; trx.hlTimers.forEach(clearTimeout); trx.hlTimers = []; kbClear('rh'); $('tr-out').innerHTML = ''; $('tr-actions').style.display = 'none'; $('tr-msg').textContent = ''; }
function renderTranscribe(): any {
    const ks: any = $('tr-skey');
    if (ks) {
        const v: any = ks.value;
        fillRoots(ks, false);
        ks.value = v || 0;
    }
    const ss: any = $('tr-sscale');
    if (ss && !ss._filled) {
        Object.keys(SCALES).forEach((nm: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = nm; o.textContent = scaleDisp(nm); ss.appendChild(o); });
        ss._filled = true;
    }
}
/* ============================================================================
   SIGHT-SINGING — pure-SVG staff engraver + on-demand exercise generator.
   Notes carry letter+octave so spelling/staff-position is exact. Offline.
   ============================================================================ */
const SS_LETSEMI: any = [0, 2, 4, 5, 7, 9, 11];
const SS_SYL_MAJ: any = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'], SS_SYL_MIN: any = ['la', 'ti', 'do', 're', 'mi', 'fa', 'sol'];
const SS_MAJ: any = { 0: { r: 0, n: 0 }, 7: { r: 4, n: 1 }, 2: { r: 1, n: 2 }, 9: { r: 5, n: 3 }, 4: { r: 2, n: 4 }, 11: { r: 6, n: 5 }, 5: { r: 3, n: -1 }, 10: { r: 6, n: -2 }, 3: { r: 2, n: -3 }, 8: { r: 5, n: -4 }, 1: { r: 1, n: -5 } };
const SS_MIN: any = { 9: 5, 4: 2, 2: 1, 11: 6, 7: 4, 0: 0, 5: 3 }; // minor tonic pc -> tonic letter index
const SS_SHARP_ORDER: any = [3, 0, 4, 1, 5, 2, 6], SS_FLAT_ORDER: any = [6, 2, 5, 1, 4, 0, 3];
function ssKeyAcc(n: any = undefined): any { const a: any = [0, 0, 0, 0, 0, 0, 0]; if (n > 0)
    for (let i: any = 0; i < n; i++)
        a[SS_SHARP_ORDER[i]] = 1;
else
    for (let i: any = 0; i < -n; i++)
        a[SS_FLAT_ORDER[i]] = -1; return a; }
function ssStepOf(li: any = undefined, oct: any = undefined): any { return oct * 7 + li; }
function ssMidiOf(li: any = undefined, oct: any = undefined, acc: any = undefined): any { return (oct + 1) * 12 + SS_LETSEMI[li] + (acc || 0); }
const SS_LEVELS: any = [
    { name: 'sol–mi', degs: [2, 4], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.85, bpm: 72 },
    { name: '+ la', degs: [2, 4, 5], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.8, bpm: 74 },
    { name: 'pentatonic', degs: [0, 1, 2, 4, 5], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7], step: 0.78, bpm: 76 },
    { name: 'major scale', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5], step: 0.75, bpm: 78, octaveUp: true },
    { name: 'triad leaps', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5, 2], step: 0.5, bpm: 80, octaveUp: true },
    { name: 'minor keys', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [9, 4, 2], step: 0.7, bpm: 80, minor: true, raise7: 0.5, octaveUp: true },
    { name: 'rhythm & meter', degs: [0, 1, 2, 3, 4, 5, 6], durs: [2, 1.5, 1, 0.5], ts: [[4, 4], [3, 4], [6, 8]], bars: 4, keys: [0, 7, 5, 2, 10], step: 0.62, bpm: 84, octaveUp: true },
];
function ssPick(a: any = undefined): any { return a[Math.floor(Math.random() * a.length)]; }
function ssNextDeg(prev: any = undefined, allowed: any = undefined, step: any = undefined): any {
    const w: any = allowed.map((p: any = undefined) => { const d: any = Math.abs(p - prev); return (d === 0 ? 0.12 : d <= 1 ? step : d <= 2 ? (1 - step) * 0.6 : (1 - step) * 0.3) + 0.01; });
    let tot: any = w.reduce((a: any = undefined, b: any = undefined) => a + b, 0), r: any = Math.random() * tot;
    for (let i: any = 0; i < allowed.length; i++) {
        r -= w[i];
        if (r <= 0)
            return allowed[i];
    }
    return allowed[0];
}
function ssMakeNote(p: any = undefined, tonicLi: any = undefined, baseOct: any = undefined, acc: any = undefined, minor: any = undefined, dur: any = undefined, raise7: any = undefined): any {
    const li: any = ((tonicLi + p) % 7 + 7) % 7, oct: any = baseOct + Math.floor((tonicLi + p) / 7);
    let a: any = acc[li];
    if (minor && (((p % 7) + 7) % 7) === 6 && Math.random() < (raise7 || 0))
        a = a + 1; // harmonic-minor raised 7th
    return { li, oct, acc: a, dur, p, midi: ssMidiOf(li, oct, a) };
}
function ssGen(level: any = undefined, clef: any = undefined, rangeShift: any = undefined): any {
    const L: any = SS_LEVELS[Math.max(0, Math.min(SS_LEVELS.length - 1, level))], minor: any = !!L.minor;
    const keyPc: any = ssPick(L.keys), tonicLi: any = minor ? SS_MIN[keyPc] : SS_MAJ[keyPc].r, n: any = minor ? SS_MAJ[(keyPc + 3) % 12].n : SS_MAJ[keyPc].n, acc: any = ssKeyAcc(n);
    const ts: any = ssPick(L.ts), cap: any = ts[1] === 8 ? ts[0] * 0.5 : ts[0];
    const allowed: any = L.degs.slice();
    if (L.octaveUp)
        allowed.push(7);
    let baseOct: any = (clef === 'bass' ? 3 : 4) + (rangeShift || 0);
    const measures: any = [];
    let prev: any = 0, beat: any = 0;
    for (let m: any = 0; m < L.bars; m++) {
        const notes: any = [];
        let rem: any = cap;
        while (rem > 1e-6) {
            const choices: any = L.durs.filter((d: any = undefined) => d <= rem + 1e-6);
            const dur: any = ssPick(choices.length ? choices : [rem]);
            const p: any = (m === 0 && !notes.length) ? 0 : ssNextDeg(prev, allowed, L.step);
            prev = p;
            const note: any = ssMakeNote(p, tonicLi, baseOct, acc, minor, dur, L.raise7);
            note.tBeat = beat;
            beat += dur;
            notes.push(note);
            rem -= dur;
        }
        measures.push(notes);
    }
    const lm: any = measures[measures.length - 1], lastN: any = lm[lm.length - 1];
    const repl: any = ssMakeNote(0, tonicLi, baseOct, acc, minor, lastN.dur, 0);
    repl.tBeat = lastN.tBeat;
    lm[lm.length - 1] = repl;
    return { clef, keyPc, minor, keyN: n, ts, cap, measures, bpm: L.bpm, level, totalBeats: beat, syl: minor ? SS_SYL_MIN : SS_SYL_MAJ, tonicMidi: ssMidiOf(tonicLi, baseOct, acc[tonicLi]) };
}
/* ---- SVG glyphs ---- */
// Clefs are drawn as outlines anchored to their staff line (G or F), so they look the same on every device instead of depending on a system font's music glyphs.
// Outlines: Bravura gClef/fClef, © Steinberg Media Technologies GmbH, SIL Open Font License 1.1. Font units: 250 per staff space, y up, origin on the clef's line.
const CLEF_G: any = 'M376 415C374 427 376 428 382 434C398 449 419 470 438 491C522 583 572 702 572 815C572 902 548 988 507 1048C492 1070 466 1098 455 1098C441 1098 410 1072 390 1050C316 968 292 843 292 739C292 681 299 616 306 575C308 563 309 561 297 551C233 498 164 437 112 373C43 287 0 194 0 87C0 -87 119 -252 364 -252C387 -252 413 -250 433 -246C444 -244 446 -243 448 -255C460 -322 475 -409 475 -456C475 -604 375 -622 316 -622C262 -622 236 -606 236 -593C236 -586 245 -583 268 -576C299 -567 335 -540 335 -482C335 -427 300 -380 239 -380C172 -380 132 -433 132 -495C132 -560 171 -658 322 -658C389 -658 519 -628 519 -458C519 -401 501 -306 490 -244C488 -232 489 -233 503 -227C604 -187 671 -102 671 11C671 139 577 252 430 252C404 252 404 252 401 270ZM470 943C503 943 530 916 530 861C530 792 497 728 419 650C403 634 379 611 356 591C349 585 345 586 343 599C339 625 337 659 337 691C337 847 409 943 470 943ZM361 262C364 243 364 244 346 238C258 208 201 129 201 44C201 -46 248 -110 316 -133C324 -136 336 -139 343 -139C351 -139 355 -134 355 -128C355 -121 347 -118 340 -115C298 -97 268 -54 268 -8C268 49 307 92 368 109C384 113 386 112 388 101L438 -197C440 -208 439 -208 424 -211C408 -214 388 -216 368 -216C193 -216 80 -119 80 20C80 79 90 158 173 252C233 319 279 356 326 394C336 402 338 401 340 390ZM430 103C428 115 429 118 441 117C522 110 589 42 589 -46C589 -109 551 -160 495 -188C483 -194 481 -194 479 -182Z';
const CLEF_F: any = 'M252 262C78 262 0 135 0 39C0 -41 42 -110 123 -110C186 -110 229 -66 229 -4C229 60 182 100 133 100C106 100 96 93 83 93C70 93 67 101 67 111C67 151 127 224 229 224C335 224 381 120 381 -37C381 -140 359 -260 297 -356C237 -449 134 -534 10 -605C1 -610 -5 -615 -5 -623C-5 -629 -1 -635 8 -635C13 -635 19 -633 25 -630C158 -565 286 -489 392 -375C479 -281 531 -159 531 -28C531 146 425 262 252 262ZM629 180C598 180 574 156 574 125C574 94 598 70 629 70C660 70 684 94 684 125C684 156 660 180 629 180ZM630 -71C599 -71 576 -94 576 -125C576 -156 599 -179 630 -179C661 -179 684 -156 684 -125C684 -94 661 -71 630 -71Z';
const CLEF_SCALE: any = 0.044;
function ssTrebleClef(x: any = undefined): any { return srClef('treble', x, 46); }
function ssBassClef(x: any = undefined): any { return srClef('bass', x, 46); }
function ssSharp(x: any = undefined, y: any = undefined): any { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 3.4}" y1="${y - 7}" x2="${x + 3.4}" y2="${y + 5}" stroke="#1a1714" stroke-width="1"/><line x1="${x - 2}" y1="${y - 2}" x2="${x + 5.4}" y2="${y - 3.2}" stroke="#1a1714" stroke-width="1.7"/><line x1="${x - 2}" y1="${y + 2.6}" x2="${x + 5.4}" y2="${y + 1.4}" stroke="#1a1714" stroke-width="1.7"/></g>`; }
function ssFlat(x: any = undefined, y: any = undefined): any { return `<path class="ss-glyph" fill="none" stroke="#1a1714" stroke-width="1.4" stroke-linecap="round" d="M ${x - 1},${y - 9} L ${x - 1},${y + 4} C ${x + 5},${y - 1} ${x + 4},${y - 5} ${x - 1},${y - 1.5}"/>`; }
function ssNatural(x: any = undefined, y: any = undefined): any { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 4}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 7}" stroke="#1a1714" stroke-width="1"/><line x1="${x}" y1="${y - 3.5}" x2="${x + 4}" y2="${y - 4.7}" stroke="#1a1714" stroke-width="1.5"/><line x1="${x}" y1="${y + 2.2}" x2="${x + 4}" y2="${y + 1}" stroke="#1a1714" stroke-width="1.5"/></g>`; }
function ssAccGlyph(a: any = undefined, k: any = undefined, x: any = undefined, y: any = undefined): any { return a > 0 ? ssSharp(x, y) : a < 0 ? ssFlat(x, y) : ssNatural(x, y); }
function ssNotehead(x: any = undefined, y: any = undefined, dur: any = undefined, onLine: any = undefined): any {
    const filled: any = dur < 2, rot: any = `rotate(-20 ${x} ${y})`;
    const e: any = `<ellipse class="ss-head${filled ? '' : ' ss-hollow'}" cx="${x}" cy="${y}" rx="6" ry="4.4" transform="${rot}"/>`;
    const dot: any = [0.375, 0.75, 1.5, 3].includes(dur) ? `<circle class="ss-head" cx="${x + 10}" cy="${onLine ? y - 6 : y - 1}" r="1.7"/>` : '';
    return e + dot;
}
function ssStem(x: any = undefined, y: any = undefined, dur: any = undefined): any {
    if (dur >= 4)
        return '';
    const up: any = y > 70, sx: any = up ? x + 5.6 : x - 5.6, ey: any = up ? y - 32 : y + 32;
    let s: any = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    if (dur <= 0.5)
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey + 5} ${sx + 9},${ey + 13} ${sx + 3},${ey + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey - 5} ${sx + 9},${ey - 13} ${sx + 3},${ey - 17}"/>`;
    return s;
}
function ssLedger(x: any = undefined, y: any = undefined): any { let s: any = ''; if (y > 94) {
    for (let ly: any = 106; ly <= y + 1; ly += 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} if (y < 46) {
    for (let ly: any = 34; ly >= y - 1; ly -= 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} return s; }
function ssKeySig(ex: any = undefined, x: any = undefined): any {
    const refStep: any = ex.clef === 'bass' ? 18 : 30, yOf: any = (li: any = undefined, oct: any = undefined) => 94 + (refStep - ssStepOf(li, oct)) * 6;
    const sT: any = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT: any = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB: any = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB: any = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const n: any = ex.keyN, cnt: any = Math.abs(n), list: any = n > 0 ? (ex.clef === 'bass' ? sB : sT) : (ex.clef === 'bass' ? fB : fT);
    let svg: any = '', xx: any = x;
    for (let i: any = 0; i < cnt; i++) {
        const y: any = yOf(list[i][0], list[i][1]);
        svg += n > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
function ssTimeSig(ts: any = undefined, x: any = undefined): any { return `<text class="ss-num" x="${x + 9}" y="64">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="90">${ts[1]}</text>`; }
function ssRender(ex: any = undefined): any {
    const refStep: any = ex.clef === 'bass' ? 18 : 30, yOf: any = (li: any = undefined, oct: any = undefined) => 94 + (refStep - ssStepOf(li, oct)) * 6, keyAcc: any = ssKeyAcc(ex.keyN);
    let x: any = 10, body: any = '', noteX: any = [], idx: any = 0;
    body += ex.clef === 'bass' ? ssBassClef(x) : ssTrebleClef(x);
    x += 30;
    const ks: any = ssKeySig(ex, x);
    body += ks.svg;
    x += ks.w;
    body += ssTimeSig(ex.ts, x);
    x += 26;
    ex.measures.forEach((meas: any = undefined) => {
        meas.forEach((note: any = undefined) => {
            const y: any = yOf(note.li, note.oct), nx: any = x + 10;
            let g: any = '';
            if (note.acc !== keyAcc[note.li])
                g += ssAccGlyph(note.acc, keyAcc[note.li], nx - 13, y);
            g += ssLedger(nx, y) + ssNotehead(nx, y, note.dur) + ssStem(nx, y, note.dur);
            const syl: any = ex.syl[((note.p % 7) + 7) % 7];
            body += `<g class="ss-n" data-i="${idx}"><rect class="ss-box" x="${nx - 12}" y="40" width="24" height="58" rx="4"/>${g}<text class="ss-syl" x="${nx}" y="126">${syl}</text></g>`;
            noteX.push({ x: nx, y, note, idx });
            x += 26 + note.dur * 15;
            idx++;
        });
        x += 6;
        body += `<line class="ss-line" x1="${x}" y1="46" x2="${x}" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
        x += 12;
    });
    const W: any = Math.max(x + 4, 360);
    let staff: any = '';
    [46, 58, 70, 82, 94].forEach((ly: any = undefined) => staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${W - 6}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`);
    staff += `<line class="ss-line" x1="8" y1="46" x2="8" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} 150" width="${W}" height="150" xmlns="http://www.w3.org/2000/svg">${staff}${body}</svg>`, W, noteX };
}
/* ---- state + draw ---- */
const sing: any = { ex: null, render: null, level: 0, clef: 'treble', mode: 'note', idx: 0, active: false, results: [], bpm: 80,
    runId: 0, micRequest: 0, analyser: null, stream: null, src: null, buf: null, raf: 0, ring: [], stable: 0, hint: 0, samples: [], keyEvents: [],
    hlTimers: [], playRaf: 0, playStart: 0, loopA: null, loopB: null };
function ssFillLevels(): any { const sel: any = $('si-level'); if (!sel || sel._filled)
    return; SS_LEVELS.forEach((L: any = undefined, i: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = i; o.textContent = (i + 1) + ' · ' + L.name; sel.appendChild(o); }); sel._filled = true; }
function ssDraw(): any { if (!sing.ex)
    return; const r: any = ssRender(sing.ex); sing.render = r; sing.flat = r.noteX.map((o: any = undefined) => o.note); const wrap: any = $('si-staff'); wrap.innerHTML = r.svg; wrap.classList.toggle('nosolf', !$('si-solf').checked); ssPaint(); }
function ssPaint(): any { const svg: any = $('si-staff').querySelector('svg'); if (!svg)
    return; svg.querySelectorAll('.ss-n').forEach((g: any = undefined) => { const i: any = +g.dataset.i, res: any = sing.results[i]; if ((sing.mode === 'note') && sing.active && i === sing.idx)
    g.dataset.s = 'now';
else if (res)
    g.dataset.s = res;
else
    g.removeAttribute('data-s'); }); }
function ssNewExercise(): any { sing.ex = ssGen(sing.level, sing.clef, 0); sing.idx = 0; sing.results = []; sing.active = false; sing.bpm = sing.ex.bpm; const bp: any = $('si-bpm'); if (bp) {
    bp.value = sing.ex.bpm;
    $('si-bpmLbl').textContent = sing.ex.bpm;
} ssDraw(); }
function renderSing(): any { ssFillLevels(); if (!sing.ex || sing.ex.clef !== sing.clef || sing.ex.level !== sing.level)
    ssNewExercise();
else
    ssDraw(); ssModeUI(); }
function singStopAll(): any {
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
    const g: any = $('si-go');
    if (g)
        g.textContent = t(sing.mode === 'free' ? 'si_play' : 'si_listen');
    const lv: any = $('si-live');
    if (lv) {
        lv.textContent = '—';
        lv.classList.remove('rec');
    }
}
function ssModeUI(): any { const m: any = sing.mode; const tw: any = $('si-tempo-wrap'); if (tw)
    tw.style.display = (m === 'note') ? 'none' : 'flex'; const go: any = $('si-go'); if (go)
    go.textContent = t(m === 'free' ? 'si_play' : 'si_listen'); }
/* ---- pitch input (mic, shared with Transcribe's autocorrelation) ---- */
function ssMicStart(): any {
    ensureAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
        return Promise.resolve(false);
    const request: any = ++sing.micRequest;
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then((st: any = undefined) => { if (request !== sing.micRequest || !sing.active || view0() !== 'sing') {
        st.getTracks().forEach((t: any = undefined) => t.stop());
        return false;
    } sing.stream = st; sing.src = actx.createMediaStreamSource(st); sing.analyser = actx.createAnalyser(); sing.analyser.fftSize = 2048; sing.buf = new Float32Array(sing.analyser.fftSize); sing.src.connect(sing.analyser); return true; }).catch(() => false);
}
function ssMicMaybe(): any { return sing.analyser ? Promise.resolve(true) : ssMicStart(); }
function ssMicStop(): any { sing.runId++; sing.micRequest++; if (sing.src) {
    try {
        sing.src.disconnect();
    }
    catch (_: any) { }
    sing.src = null;
} if (sing.stream) {
    sing.stream.getTracks().forEach((t: any = undefined) => t.stop());
    sing.stream = null;
} sing.analyser = null; }
function ssReadPitch(): any { if (!sing.analyser)
    return null; sing.analyser.getFloatTimeDomainData(sing.buf); const f: any = trxAutoCorrelate(sing.buf, actx.sampleRate); if (f < 0)
    return null; const midi: any = Math.round(69 + 12 * Math.log2(f / 440)), cents: any = Math.round(1200 * Math.log2(f / (440 * Math.pow(2, (midi - 69) / 12)))); return { f, midi, cents }; }
function ssNeed(targetPc: any = undefined, sungPc: any = undefined): any { let d: any = ((targetPc - sungPc) % 12 + 12) % 12; if (d > 6)
    d -= 12; return d; } // + → sing higher
function ssCurNote(): any { return sing.flat ? sing.flat[sing.idx] : null; }
/* ---- cursor + trail + scroll ---- */
function ssSvg(): any { return $('si-staff').querySelector('svg'); }
function ssCursorEl(): any { const svg: any = ssSvg(); if (!svg)
    return null; let c: any = svg.querySelector('.ss-playhead'); if (!c) {
    c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    c.setAttribute('class', 'ss-playhead');
    c.setAttribute('y1', '38');
    c.setAttribute('y2', '102');
    svg.appendChild(c);
} return c; }
function ssMoveCursor(x: any = undefined): any { const c: any = ssCursorEl(); if (c) {
    c.setAttribute('x1', x);
    c.setAttribute('x2', x);
} ssScrollToX(x); }
function ssRemoveCursor(): any { const svg: any = ssSvg(), c: any = svg && svg.querySelector('.ss-playhead'); if (c)
    c.remove(); }
function ssScrollToX(x: any = undefined): any { const w: any = $('si-staff'); if (w.scrollWidth > w.clientWidth + 4)
    w.scrollLeft = Math.max(0, x - w.clientWidth * 0.4); }
function ssScrollToCur(): any { const o: any = sing.render && sing.render.noteX[sing.idx]; if (o)
    ssScrollToX(o.x); }
function ssPitchY(f: any = undefined): any { const bottomMidi: any = sing.ex.clef === 'bass' ? 43 : 64, midi: any = 69 + 12 * Math.log2(f / 440); let y: any = 94 - (midi - bottomMidi) * 3.5; while (y > 142)
    y -= 42; while (y < 4)
    y += 42; return y; }
function ssDrawTrail(): any { const svg: any = ssSvg(); if (!svg)
    return; let pl: any = svg.querySelector('.ss-trail'); if (!pl) {
    pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('class', 'ss-trail');
    svg.appendChild(pl);
} pl.setAttribute('points', sing.trail.map((p: any = undefined) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')); }
function ssClearTrail(): any { const svg: any = ssSvg(), pl: any = svg && svg.querySelector('.ss-trail'); if (pl)
    pl.remove(); }
function ssBeatToX(beat: any = undefined): any {
    const ns: any = sing.render && sing.render.noteX;
    if (!ns || !ns.length)
        return 10;
    const pts: any = ns.map((o: any = undefined) => ({ b: o.note.tBeat, x: o.x }));
    pts.push({ b: sing.ex.totalBeats, x: sing.render.W - 12 });
    for (let i: any = 0; i < pts.length - 1; i++) {
        if (beat >= pts[i].b && beat <= pts[i + 1].b) {
            const f: any = (beat - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + f * (pts[i + 1].x - pts[i].x);
        }
    }
    return beat <= pts[0].b ? pts[0].x : pts[pts.length - 1].x;
}
/* ---- reference cues ---- */
function ssTonic(): any { if (!sing.ex)
    return; ensureAudio(); previewNote(sing.ex.tonicMidi, actx.currentTime + 0.02, 0.85, 92); }
// A pulse running along the staff while the melody plays; with reduced motion the notes simply stay as they are.
function ssFlash(i: any = undefined): any { if (reduceMotion())
    return; const svg: any = ssSvg(); if (!svg)
    return; const g: any = svg.querySelector('.ss-n[data-i="' + i + '"]'); if (!g)
    return; const prev: any = g.getAttribute('data-s'); g.dataset.s = 'now'; sing.hlTimers.push(setTimeout(() => { if (g.dataset.s === 'now') {
    if (prev && prev !== 'now')
        g.dataset.s = prev;
    else
        g.removeAttribute('data-s');
} }, 240)); }
function ssPlayIt(): any {
    if (!sing.ex || !sing.flat)
        return;
    ensureAudio();
    stopPreviews();
    sing.hlTimers.forEach(clearTimeout);
    sing.hlTimers = [];
    const beatSec: any = 60 / (sing.bpm || sing.ex.bpm), t0: any = actx.currentTime + 0.12;
    sing.flat.forEach((n: any = undefined, i: any = undefined) => { const when: any = t0 + n.tBeat * beatSec, dur: any = Math.max(0.18, n.dur * beatSec * 0.92); previewNote(n.midi, when, dur, 92); sing.hlTimers.push(setTimeout(() => ssFlash(i), Math.max(0, (when - actx.currentTime) * 1000))); });
}
function ssDrone(): any { if ($('si-drone').checked) {
    if (sing.ex) {
        ensureAudio();
        startDrone(pc(sing.ex.tonicMidi));
    }
}
else
    stopDrone(); }
/* ---- mode: note-by-note ---- */
function ssNoteStart(): any {
    sing.active = true;
    sing.idx = 0;
    sing.results = [];
    sing.hint = 0;
    sing.holdT = 0;
    sing.wrongT = 0;
    ssPaint();
    ssScrollToCur();
    $('si-verdict').className = 'verdict neutral';
    $('si-verdict').textContent = t('si_singit');
    ensureAudio();
    previewNote(sing.ex.tonicMidi, actx.currentTime + 0.02, 0.6, 85);
    const run: any = sing.runId;
    ssMicMaybe().then((ok: any = undefined) => { if (run === sing.runId && sing.active && sing.mode === 'note') {
        if (!ok)
            $('si-hint').textContent = t('si_nomic');
        sing.raf = requestAnimationFrame(ssNoteLoop);
    } });
}
function ssNoteLoop(ts: any = undefined): any {
    if (!sing.active || sing.mode !== 'note')
        return;
    const cur: any = ssCurNote(), tgt: any = cur ? pc(cur.midi) : -1, p: any = ssReadPitch(), lv: any = $('si-live');
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
function ssNoteCorrect(): any {
    if (!sing.active)
        return;
    sing.results[sing.idx] = 'good';
    sing.holdT = 0;
    sing.wrongT = 0;
    sing.hint = 0;
    $('si-hint').textContent = '';
    sing.idx++;
    ssPaint();
    ssScrollToCur();
    if (sing.idx >= sing.flat.length)
        ssNoteFinish();
}
function ssHintBump(am: any = undefined): any {
    const cur: any = ssCurNote();
    if (!cur)
        return;
    sing.hint++;
    const need: any = ssNeed(pc(cur.midi), pc(am)), syl: any = sing.ex.syl[((cur.p % 7) + 7) % 7];
    if (sing.hint === 1)
        $('si-hint').textContent = need > 0 ? t('si_hi_up') : t('si_hi_down');
    else {
        $('si-hint').textContent = t('si_hi_syl', syl);
        ensureAudio();
        previewNote(cur.midi, actx.currentTime + 0.02, 0.6, 80);
    }
}
function ssNoteFinish(): any {
    sing.active = false;
    if (sing.raf)
        cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssPaint();
    const tot: any = sing.flat.length;
    const v: any = $('si-verdict');
    v.className = 'verdict good';
    v.textContent = t('si_perfect');
    $('si-go').textContent = t('si_listen');
    $('si-live').textContent = '—';
    $('si-hint').textContent = '';
    ssBumpProgress(tot, tot);
}
/* ---- mode: phrase ---- */
function ssPhraseStart(): any {
    sing.active = true;
    sing.results = [];
    sing.samples = [];
    sing.keyEvents = [];
    ssPaint();
    $('si-hint').textContent = '';
    ensureAudio();
    const run: any = sing.runId;
    ssMicMaybe().then((ok: any = undefined) => {
        if (run !== sing.runId || !sing.active || sing.mode !== 'phrase')
            return;
        if (!ok)
            $('si-hint').textContent = t('si_nomic');
        const beatSec: any = 60 / sing.bpm, ci: any = sing.ex.ts[0];
        sing.countInMs = ci * beatSec * 1000;
        sing.phraseStartPN = performance.now() + 150;
        sing.phraseSingPN = sing.phraseStartPN + sing.countInMs;
        const t0: any = actx.currentTime + 0.15 + (sing.phraseStartPN - performance.now()) / 1000;
        for (let b: any = 0; b < ci; b++)
            metroClick(t0 + b * beatSec, b === 0); // audible count-in (best-effort)
        $('si-verdict').className = 'verdict neutral';
        $('si-verdict').textContent = t('si_count');
        sing.raf = requestAnimationFrame(ssPhraseLoop);
    });
}
function ssPhraseLoop(ts: any = undefined): any {
    if (!sing.active || sing.mode !== 'phrase')
        return;
    const beatSec: any = 60 / sing.bpm, dur: any = sing.ex.totalBeats * beatSec;
    if (ts < sing.phraseSingPN) {
        $('si-verdict').textContent = t('si_count');
        ssMoveCursor(ssBeatToX(0));
        sing.raf = requestAnimationFrame(ssPhraseLoop);
        return;
    }
    const tt: any = (ts - sing.phraseSingPN) / 1000;
    if (tt <= dur) {
        $('si-verdict').textContent = t('si_sing_now');
        const p: any = ssReadPitch();
        if (p)
            sing.samples.push({ t: tt, pc: pc(p.midi), cents: p.cents });
        const lv: any = $('si-live');
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
function ssPhraseGrade(): any {
    sing.active = false;
    if (sing.raf)
        cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssRemoveCursor();
    const beatSec: any = 60 / sing.bpm;
    sing.flat.forEach((n: any = undefined, i: any = undefined) => {
        const s: any = n.tBeat * beatSec, e: any = (n.tBeat + n.dur) * beatSec, tpc: any = pc(n.midi);
        const win: any = sing.samples.filter((x: any = undefined) => x.t >= s - 0.05 && x.t <= e), onp: any = win.filter((x: any = undefined) => x.pc === tpc), frac: any = win.length ? onp.length / win.length : 0;
        let verdict: any = frac > 0.55 ? 'good' : frac > 0.18 ? 'near' : 'bad';
        if (sing.keyEvents.some((k: any = undefined) => pc(k.midi) === tpc && k.t >= s - 0.18 && k.t <= e + 0.05) && verdict !== 'good')
            verdict = 'good';
        sing.results[i] = verdict;
    });
    ssPaint();
    const good: any = sing.results.filter((r: any = undefined) => r === 'good').length, tot: any = sing.flat.length;
    const v: any = $('si-verdict');
    v.className = 'verdict ' + (good === tot ? 'good' : 'neutral');
    v.textContent = good === tot ? t('si_perfect') : t('si_nicetry', good, tot);
    $('si-live').textContent = '—';
    $('si-go').textContent = t('si_listen');
    ssBumpProgress(good, tot);
}
/* ---- mode: free (follow-along scroll + pitch trail) ---- */
function ssFreeStart(): any {
    sing.active = true;
    sing.trail = [];
    ssClearTrail();
    ssPaint();
    ensureAudio();
    const run: any = sing.runId;
    ssMicMaybe().then((ok: any = undefined) => { if (run !== sing.runId || !sing.active || sing.mode !== 'free')
        return; if (!ok) {
        singStopAll();
        const v: any = $('si-verdict');
        v.className = 'verdict bad';
        v.textContent = t('tr_micfail');
        return;
    } if ($('si-drone').checked)
        startDrone(pc(sing.ex.tonicMidi)); sing.freePN = performance.now() + 100; $('si-verdict').className = 'verdict neutral'; $('si-verdict').textContent = t('si_freehint'); sing.raf = requestAnimationFrame(ssFreeLoop); });
}
function ssFreeLoop(ts: any = undefined): any {
    if (!sing.active || sing.mode !== 'free')
        return;
    const beatSec: any = 60 / sing.bpm, dur: any = sing.ex.totalBeats * beatSec;
    let tt: any = (ts - sing.freePN) / 1000;
    if (tt > dur + 0.4) {
        sing.freePN = ts;
        sing.trail = [];
        ssClearTrail();
        tt = 0;
    }
    const x: any = ssBeatToX(Math.min(Math.max(tt, 0), dur) / beatSec);
    ssMoveCursor(x);
    const p: any = ssReadPitch(), lv: any = $('si-live');
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
function singKeyInput(m: any = undefined): any { if (!sing.active)
    return; if (sing.mode === 'note') {
    const cur: any = ssCurNote();
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
function singGo(): any {
    if (!sing.ex)
        return;
    if (sing.active) {
        singStopAll();
        $('si-verdict').textContent = '';
        return;
    }
    $('si-hint').textContent = '';
    sing.bpm = +($('si-bpm').value || sing.ex.bpm);
    if (sing.mode === 'note')
        ssNoteStart();
    else if (sing.mode === 'phrase')
        ssPhraseStart();
    else
        ssFreeStart();
    $('si-go').textContent = t('si_stop');
}
function ssBumpProgress(good: any = undefined, tot: any = undefined): any { if (sing.mode !== 'free' && good === tot && tot > 0) {
    data.singCleared = data.singCleared || {};
    data.singCleared[sing.level] = true;
    saveAll();
} }
/* ---------- KEYBOARD ---------- */
const BASE_LOW: any = 24, BASE_HIGH: any = 96;
const view: any = { low: 48, oct: 4 };
let labelMode: any = 'c';
let typeOctave: any = 60;
function clampTypeOctave(): any { const lo: any = view.low, maxLo: any = Math.max(lo, viewHigh() - 12); typeOctave = Math.max(lo, Math.min(maxLo, Math.round(typeOctave / 12) * 12)); }
const whiteEl: any = new Map(), blackEl: any = new Map(), keyEl: any = new Map();
const BLACK_NUDGE: any = { 1: -.28, 3: .28, 6: -.30, 8: 0, 10: .30 };
function viewHigh(): any { return view.low + view.oct * 12; }
function chooseView(): any { const w: any = window.innerWidth; view.oct = w < 560 ? 2 : w < 900 ? 3 : 4; view.low = Math.max(BASE_LOW, Math.min(view.low, BASE_HIGH - view.oct * 12)); clampTypeOctave(); }
function buildKeyboard(): any {
    clampTypeOctave();
    const keys: any = $('keys');
    if (!keys)
        return;
    const active: any = document.activeElement, focused: any = keys.contains(active) ? Number(active.dataset.midi) : null;
    keys.innerHTML = '';
    whiteEl.clear();
    blackEl.clear();
    keyEl.clear();
    const lo: any = view.low, hi: any = viewHigh(), WHITE: any = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (let m: any = lo; m <= hi; m++) {
        if (!WHITE.has(pc(m)))
            continue;
        const b: any = (document as any).createElement('button');
        b.className = 'key white';
        b.dataset.midi = m;
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        if (m === 60)
            b.classList.add('midc');
        if (labelMode !== 'none' && (labelMode === 'all' || pc(m) === 0)) {
            const l: any = (document as any).createElement('span');
            l.className = 'lbl';
            l.textContent = pc(m) === 0 ? rootName(0) + (Math.floor(m / 12) - 1) : pcName(pc(m), false);
            b.appendChild(l);
        }
        const mk: any = (document as any).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg: any = (document as any).createElement('span');
        dg.className = 'dg';
        dg.setAttribute('aria-hidden', 'true');
        b.appendChild(dg);
        keys.appendChild(b);
        whiteEl.set(m, b);
        keyEl.set(m, b);
        bindKeyA11y(b, m);
    }
    for (let m: any = lo; m <= hi; m++) {
        if (WHITE.has(pc(m)))
            continue;
        const b: any = (document as any).createElement('button');
        b.className = 'key black';
        b.dataset.midi = m;
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        const mk: any = (document as any).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg: any = (document as any).createElement('span');
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
        const key: any = keyEl.get(Math.max(lo, Math.min(hi, focused)));
        if (key) {
            key.focus({ preventScroll: true });
            const scroll: any = $('dock-keys'), r: any = key.getBoundingClientRect(), s: any = scroll.getBoundingClientRect();
            if (r.left < s.left)
                scroll.scrollLeft += r.left - s.left;
            else if (r.right > s.right)
                scroll.scrollLeft += r.right - s.right;
        }
    }
    const oi: any = $('octInd');
    if (oi)
        oi.textContent = noteName(view.low, false) + '–' + noteName(viewHigh(), false);
    kbDegrees(kbDegSrc);
    if (view0() === 'analysis')
        anKeysPaint(true);
    cofPaintDock();
}
// Chord-member numbers (1 3 5 7 …) shown on keys; `src` maps sounding MIDI notes to labels and is folded into view.
let kbDegSrc: any = null;
function kbDegrees(src: any = undefined): any {
    kbDegSrc = src && src.size ? src : null;
    const folded: any = new Map();
    if (kbDegSrc)
        kbDegSrc.forEach((label: any = undefined, m: any = undefined) => folded.set(foldToView(m), label));
    keyEl.forEach((el: any = undefined, m: any = undefined) => {
        const label: any = folded.get(m) || '', d: any = el.querySelector('.dg');
        const degDesc: any = label ? (label === 'R' ? t('kb_deg_r') : t('kb_deg', label)) : '';
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
function positionBlacks(): any { blackEl.forEach((el: any = undefined, bm: any = undefined) => { const w: any = whiteEl.get(bm - 1); if (!w || !w.offsetWidth)
    return; const bw: any = w.offsetWidth * .62, seam: any = w.offsetLeft + w.offsetWidth, n: any = (BLACK_NUDGE[pc(bm)] || 0) * bw; el.style.width = bw + 'px'; el.style.left = (seam - bw / 2 + n) + 'px'; }); syncKeyboardPan(); }
function syncKeyboardPan(): any { const scroll: any = $('dock-keys'), pan: any = $('kb-pan'), max: any = Math.max(0, scroll.scrollWidth - scroll.clientWidth); pan.max = String(max); pan.value = String(scroll.scrollLeft); pan.hidden = !dockShown() || max < 1; }
function reflowKeys(): any { requestAnimationFrame(() => requestAnimationFrame(positionBlacks)); setTimeout(positionBlacks, 90); } // wait for the dock to lay out before measuring
function foldToView(m: any = undefined): any { const lo: any = view.low, hi: any = viewHigh(); let x: any = m; while (x < lo)
    x += 12; while (x > hi)
    x -= 12; return x; }
function kbState(midi: any = undefined, s: any = undefined, fold: any = undefined): any { const m: any = fold ? foldToView(midi) : midi, el: any = keyEl.get(m); if (!el)
    return; if (s)
    el.dataset.s = s;
else
    delete el.dataset.s; const mk: any = el.querySelector('.mk'); if (mk)
    mk.textContent = s === 'good' ? '✓' : s === 'bad' ? '✗' : ''; }
function kbClear(s: any = undefined): any { keyEl.forEach((el: any = undefined) => { if (el.dataset.s === s)
    delete el.dataset.s; const mk: any = el.querySelector('.mk'); if (mk && !el.dataset.s)
    mk.textContent = ''; }); }
function kbClearAll(): any { keyEl.forEach((el: any = undefined) => { delete el.dataset.s; const mk: any = el.querySelector('.mk'); if (mk)
    mk.textContent = ''; }); }
function kbPress(midi: any = undefined, on: any = undefined): any { const m: any = foldToView(midi), el: any = keyEl.get(m); if (!el)
    return; if (!on && [...held].some((n: any = undefined) => foldToView(n) === m))
    return; el.classList.toggle('pressed', on); if (on) {
    if (!el.dataset.s)
        el.dataset.s = 'active';
}
else if (el.dataset.s === 'active')
    delete el.dataset.s; }
function repaintHeld(): any { held.forEach((m: any = undefined) => kbPress(m, true)); }
const pointerKey: any = new Map();
function keyAt(x: any = undefined, y: any = undefined): any { const el: any = document.elementFromPoint(x, y); if (el) {
    const k: any = el.closest('.key');
    if (k)
        return +k.dataset.midi;
} return null; }
function initPointer(): any {
    const kb: any = $('keys');
    kb.addEventListener('pointerdown', (e: any = undefined) => { const m: any = keyAt(e.clientX, e.clientY); if (m == null)
        return; e.preventDefault(); try {
        kb.setPointerCapture(e.pointerId);
    }
    catch (_: any) { } ; pointerKey.set(e.pointerId, m); handleNoteOn(m, 100, 'pointer:' + e.pointerId); });
    kb.addEventListener('pointermove', (e: any = undefined) => { if (!pointerKey.has(e.pointerId))
        return; const cur: any = pointerKey.get(e.pointerId), m: any = keyAt(e.clientX, e.clientY); if (m !== cur) {
        if (cur != null)
            handleNoteOff(cur, 'pointer:' + e.pointerId);
        pointerKey.set(e.pointerId, m);
        if (m != null)
            handleNoteOn(m, 100, 'pointer:' + e.pointerId);
    } });
    const end: any = (e: any = undefined) => { if (pointerKey.has(e.pointerId)) {
        const m: any = pointerKey.get(e.pointerId);
        if (m != null)
            handleNoteOff(m, 'pointer:' + e.pointerId);
        pointerKey.delete(e.pointerId);
    } };
    kb.addEventListener('pointerup', end);
    kb.addEventListener('pointercancel', end);
    kb.addEventListener('lostpointercapture', end);
}
function bindKeyA11y(b: any = undefined, m: any = undefined): any { b.addEventListener('keydown', (e: any = undefined) => { if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!b._kd) {
        b._kd = true;
        handleNoteOn(m, 100, 'button:' + m);
    }
} }); b.addEventListener('keyup', (e: any = undefined) => { if (e.key === ' ' || e.key === 'Enter') {
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
const DOCK: any = { pref: null, auto: null, animT: 0 };
function dockWanted(v: any = view0()): any { return v === 'today' || v === 'explore' || v === 'accompany' || v === 'transcribe' || v === 'learn' || v === 'read' || v === 'sing' || (v === sesHome() && SES.active) || (v === 'analysis' && anDockWanted()); }
function dockOpen(v: any = view0()): any { if (DOCK.pref != null)
    return DOCK.pref; return false; }
function dockShown(): any { return document.body.classList.contains('kb') && !$('dock').classList.contains('is-rail'); }
// The dock's own button names the action it takes (Hide / Show keyboard).
function dockLabels(): any {
    const open: any = dockOpen(), act: any = t(open ? 'kb_hide' : 'kb_show'), dk: any = $('dock-kb-toggle');
    dk.setAttribute('aria-expanded', open ? 'true' : 'false');
    dk.title = act;
    dk.querySelector('.dock-kb-label').textContent = act;
}
function dockSync(): any {
    const dock: any = $('dock'), v: any = view0(), on: any = dockWanted(v), open: any = on && dockOpen(v), was: any = document.body.classList.contains('kb'), wasOpen: any = dockShown();
    dock.classList.toggle('compact', v === 'analysis');
    $('dock-kb-toggle').hidden = !on;
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
function dockReveal(): any { if (reduceMotion())
    return; const dock: any = $('dock'); dock.classList.add('is-opening'); clearTimeout(DOCK.animT); DOCK.animT = setTimeout(() => dock.classList.remove('is-opening'), 300); }
function dockSet(open: any = undefined): any {
    const keep: any = view0() === 'analysis' ? anKeepPlace() : dockKeepEnd(open);
    DOCK.pref = !!open;
    saveAll();
    if (view0() === 'analysis')
        anUpdateControls();
    else
        dockSync();
    keep();
}
// Other pages scroll under the dock: whoever is reading the end of a long page still sees it when the keys come back.
function dockKeepEnd(open: any = undefined): any {
    const root: any = document.scrollingElement || document.documentElement, end: any = open && root.scrollHeight > innerHeight + 2 && root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2;
    return () => { if (end)
        window.scrollTo(0, root.scrollHeight); };
}
/* ---------- INPUT ROUTING ---------- */
const held: any = new Set(), heldOrder: any = [], sustained: any = new Set(), inputOwners: any = new Map();
let pedalDown: any = false, evalTimer: any = null;
function handleNoteOn(midi: any = undefined, vel: any = undefined, source: any = 'midi'): any {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127)
        return;
    ensureAudio();
    const owners: any = inputOwners.get(midi) || new Set();
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
function handleNoteOff(midi: any = undefined, source: any = 'midi'): any {
    const owners: any = inputOwners.get(midi);
    if (!owners || !owners.delete(source))
        return;
    if (owners.size)
        return;
    inputOwners.delete(midi);
    if (!held.has(midi))
        return;
    held.delete(midi);
    const i: any = heldOrder.indexOf(midi);
    if (i >= 0)
        heldOrder.splice(i, 1);
    kbPress(midi, false);
    if (pedalDown)
        sustained.add(midi);
    else
        audioNoteOff(midi);
    onInputChange('off', midi);
}
function pedalUp(): any { sustained.forEach((m: any = undefined) => { if (!held.has(m))
    audioNoteOff(m); }); sustained.clear(); }
function heldMidis(): any { return [...held]; }
function heldPcs(): any { return [...new Set(heldMidis().map(pc))].sort((a: any = undefined, b: any = undefined) => a - b); }
function releaseLiveInput(): any {
    held.forEach((m: any = undefined) => audioNoteOff(m));
    sustained.forEach((m: any = undefined) => audioNoteOff(m));
    held.clear();
    heldOrder.length = 0;
    sustained.clear();
    inputOwners.clear();
    pointerKey.clear();
    typingDown.clear();
    pedalDown = false;
    keyEl.forEach((el: any = undefined) => { el._kd = false; el.classList.remove('pressed'); if (el.dataset.s === 'active')
        delete el.dataset.s; });
}
// Without focus no key-up or pointer-up arrives, so keys held from the computer keyboard, the screen or a rhythm pad are let go as if
// lifted (drills see an ordinary release). MIDI and Bluetooth go on reporting, so keys and pedal held on the instrument stay as they are.
function releaseFocusInput(): any {
    let fell: any = false;
    [...inputOwners.entries()].forEach(([m, o]: any = undefined) => [...o].forEach((s: any = undefined) => { if (s === 'midi' || s === 'ble')
        return; if (s.startsWith('fall:'))
        fell = true; handleNoteOff(m, s); }));
    pointerKey.clear();
    typingDown.clear();
    if (FALL.press)
        FALL.press.clear();
    RD.kbDown = null;
    keyEl.forEach((el: any = undefined) => { el._kd = false; });
    if (RD.rh)
        [...RD.rh.open.keys()].forEach((s: any = undefined) => { if (/^(k:|p\d)/.test(s))
            rdRhRelease(s); });
    if (fell && !FALL.raf)
        fallDraw();
}
function panic(): any { scorePause(); releaseLiveInput(); trxStop(); accompStop(); trx.hlTimers.forEach(clearTimeout); trx.hlTimers = []; singStopAll(); srStopAll(true); held.forEach((m: any = undefined) => audioNoteOff(m)); held.clear(); heldOrder.length = 0; sustained.forEach((m: any = undefined) => audioNoteOff(m)); sustained.clear(); liveVoices.forEach((v: any = undefined) => v.stop()); liveVoices.clear(); stopPreviews(); stopDrone(); pointerKey.clear(); typingDown.clear(); pedalDown = false; bendSemitones = 0; if (lfoGain && actx)
    lfoGain.gain.setTargetAtTime(0, actx.currentTime, .02); keyEl.forEach((el: any = undefined) => { el.classList.remove('pressed'); if (el.dataset.s === 'active')
    delete el.dataset.s; }); if (view0() === 'explore')
    updateExplore(); }
// midi is the key that just went down or (physically) came up; the sustain pedal never delays an 'off'.
function onInputChange(kind: any = undefined, midi: any = undefined): any {
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
        const m: any = heldOrder[heldOrder.length - 1];
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
        const m: any = heldOrder[heldOrder.length - 1];
        if (m != null)
            rdInput(m);
        return;
    }
    if (view0() === 'read' && SR.active && kind === 'on') {
        const m: any = heldOrder[heldOrder.length - 1];
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
function scheduleEval(fn: any = undefined, ms: any = undefined): any { clearTimeout(evalTimer); evalTimer = setTimeout(fn, ms); }
/* ---------- WEB MIDI ---------- */
let midiAccess: any = null, activeInputId: any = null, savedDevice: any = null, midiMsg: any = null;
function setMidi(text: any = undefined, cls: any = undefined): any { midiMsg = { text, cls }; const s: any = $('set-midi-status'); if (s)
    s.textContent = text; midiChipSync(); }
// The header chip names the Web MIDI input when one is live, else a live Bluetooth MIDI piano, else the Web MIDI status.
function midiChipSync(): any {
    const mt: any = $('midiText'), md: any = $('midiDot');
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
async function connectMidi() {
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
    catch (err: any) {
        console.error(err);
        setMidi(err && err.name === 'SecurityError' ? t('midi_blocked') : (err && err.name === 'NotAllowedError') ? t('midi_denied') : t('midi_unavail'), 'err');
    }
}
function listInputs(): any { return midiAccess ? [...midiAccess.inputs.values()] : []; }
function pickArturia(ins: any = undefined): any { const c: any = ins.filter((i: any = undefined) => /microlab|arturia/i.test(i.name)); if (!c.length)
    return null; const g: any = c.filter((i: any = undefined) => !/daw|midiin2|control|thru/i.test(i.name)); return g[0] || c[0]; }
function refreshDeviceList(autoPick: any = undefined): any {
    const sel: any = $('deviceSelect'), ins: any = listInputs();
    sel.innerHTML = '';
    if (!ins.length) {
        sel.innerHTML = '<option>—</option>';
        activeInputId = null;
        setMidi(t('midi_noinputs'), 'err');
        return;
    }
    ins.forEach((i: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = i.id; o.textContent = i.name; sel.appendChild(o); });
    const still: any = activeInputId && ins.some((i: any = undefined) => i.id === activeInputId);
    const remembered: any = !still && savedDevice && ins.find((i: any = undefined) => i.id === savedDevice); // reconnect the device used last time
    let chosen: any = still ? ins.find((i: any = undefined) => i.id === activeInputId) : (remembered || ((autoPick || !activeInputId) ? (pickArturia(ins) || ins[0]) : ins[0]));
    sel.value = chosen.id;
    attachInput(chosen.id);
}
function attachInput(id: any = undefined): any { if (activeInputId && activeInputId !== id)
    releaseLiveInput(); listInputs().forEach((i: any = undefined) => i.onmidimessage = null); const inp: any = listInputs().find((i: any = undefined) => i.id === id); if (!inp)
    return; inp.onmidimessage = onMidiMessage; activeInputId = id; savedDevice = id; setMidi(inp.name, 'on'); saveAll(); }
function autoReconnectMidi(): any {
    if (!navigator.permissions || !navigator.requestMIDIAccess)
        return;
    try {
        (navigator.permissions as any).query({ name: 'midi', sysex: false }).then((p: any = undefined) => { if (p.state === 'granted')
            connectMidi(); }).catch(() => { });
    }
    catch (_: any) { }
}
function onStateChange(): any { const was: any = activeInputId, ins: any = listInputs(), present: any = activeInputId && ins.some((i: any = undefined) => i.id === activeInputId); if (was && !present) {
    panic();
    activeInputId = null;
} refreshDeviceList(false); }
function onMidiMessage(e: any = undefined): any { const [st, d1, d2] = e.data; midiIn(st, d1, d2, 'midi'); }
// One decoder for every transport (Web MIDI, Bluetooth MIDI): notes, sustain (CC64), mod wheel (CC1) and pitch bend.
function midiIn(st: any = undefined, d1: any = undefined, d2: any = undefined, src: any = undefined): any {
    const cmd: any = st & 0xf0;
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
            const dn: any = d2 >= 64;
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
const BLE_MIDI_SVC: any = '03b80e5a-ede8-4b33-a751-6ce34ec4c700', BLE_MIDI_CHR: any = '7772e5db-3868-4112-a1a9-f2669d106bf3';
const BLE: any = { dev: null, chr: null, busy: false, want: false, gen: 0, tries: 0, retryT: 0, guardT: 0, timedOut: 0, msg: null, cls: '', arg: null, saved: null,
    run: 0, need: 0, n: 0, d1: 0, skip: 0, sysex: false, pedal: false, bend: false, mod: false };
function bleCan(): any { return !!((navigator as any).bluetooth && (navigator as any).bluetooth.requestDevice); }
function bleLive(): any { return !!(BLE.chr && BLE.dev && BLE.dev.gatt && BLE.dev.gatt.connected); }
function bleName(): any { return (BLE.dev && BLE.dev.name) || (BLE.saved && BLE.saved.name) || t('ble_dev'); }
function bleSet(key: any = undefined, cls: any = undefined, arg: any = undefined): any { BLE.msg = key; BLE.cls = cls || ''; BLE.arg = arg == null ? null : arg; bleUi(); }
function bleUi(): any {
    midiChipSync();
    const st: any = $('set-ble-status'), b: any = $('set-ble'), re: any = $('set-ble-re');
    if (!st || !b)
        return;
    const live: any = bleLive(), key: any = BLE.msg || (bleCan() ? (BLE.dev && !live ? 'ble_known' : 'ble_off') : 'ble_unsupported');
    st.textContent = t(key, BLE.msg && BLE.arg != null ? BLE.arg : bleName());
    st.dataset.s = live ? 'on' : (BLE.msg ? BLE.cls : (bleCan() ? '' : 'err'));
    b.textContent = t(live ? 'ble_disconnect' : BLE.busy ? 'ble_cancel_btn' : 'ble_connect');
    b.disabled = !bleCan();
    re.hidden = !(BLE.dev && !live && !BLE.busy);
}
function bleClick(): any { if (bleLive() || BLE.busy) {
    bleDisconnect();
    return;
} bleChoose(); }
async function bleChoose() {
    if (!bleCan()) {
        bleSet('ble_unsupported', 'err');
        return;
    }
    if (!window.isSecureContext) {
        bleSet('ble_insecure', 'err');
        return;
    }
    let req: any;
    try {
        req = (navigator as any).bluetooth.requestDevice({ filters: [{ services: [BLE_MIDI_SVC] }, ...['ES120', 'ES110', 'ES520', 'ES920', 'KAWAI', 'Kawai'].map((namePrefix: any = undefined) => ({ namePrefix }))], optionalServices: [BLE_MIDI_SVC] });
    }
    catch (err: any) {
        bleErr(err);
        return;
    }
    ensureAudio();
    bleSet('ble_choose');
    let dev: any;
    try {
        dev = await req;
    }
    catch (err: any) {
        bleErr(err);
        return;
    }
    BLE.tries = 0;
    bleOpen(dev, false);
}
function bleErr(err: any = undefined, quiet: any = undefined): any {
    const n: any = err && err.name, m: any = String((err && err.message) || '');
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
function bleStale(gen: any = undefined, dev: any = undefined): any { if (gen === BLE.gen)
    return false; if (!BLE.want || BLE.dev !== dev) {
    try {
        dev.gatt.disconnect();
    }
    catch (_: any) { }
} return true; }
// retrying: an automatic reconnect after the link dropped; quiet: the silent start-up attempt (no red errors if the piano is off).
async function bleOpen(dev: any = undefined, retrying: any = undefined, quiet: any = undefined) {
    if (BLE.busy && BLE.dev === dev)
        return;
    if (BLE.dev && BLE.dev !== dev)
        bleDisconnect(true); // switching pianos: drop the old link first
    clearTimeout(BLE.retryT);
    BLE.dev = dev;
    BLE.want = true;
    BLE.busy = true;
    const gen: any = ++BLE.gen;
    dev.removeEventListener('gattserverdisconnected', bleOnGone);
    dev.addEventListener('gattserverdisconnected', bleOnGone);
    if (!retrying)
        bleSet('ble_connecting');
    else
        bleUi();
    // gatt.connect() can wait a long time for a piano that is off; give up after 15 s so the button never hangs.
    clearTimeout(BLE.guardT);
    BLE.guardT = setTimeout(() => { if (BLE.busy && BLE.gen === gen) {
        BLE.timedOut = gen;
        try {
            dev.gatt.disconnect();
        }
        catch (_: any) { }
    } }, 15000);
    try {
        const server: any = await dev.gatt.connect();
        if (bleStale(gen, dev))
            return;
        const svc: any = await server.getPrimaryService(BLE_MIDI_SVC), chr: any = await svc.getCharacteristic(BLE_MIDI_CHR);
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
    catch (err: any) {
        if (gen !== BLE.gen)
            return;
        clearTimeout(BLE.guardT);
        BLE.busy = false;
        bleUnhook();
        if (err && err.name === 'NotFoundError' && /service|characteristic/i.test(String(err.message || ''))) {
            BLE.want = false;
            try {
                dev.gatt.disconnect();
            }
            catch (_: any) { }
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
function bleUnhook(): any { if (BLE.chr)
    BLE.chr.removeEventListener('characteristicvaluechanged', bleOnValue); BLE.chr = null; }
function bleOnGone(e: any = undefined): any {
    if (e.target !== BLE.dev)
        return;
    const was: any = !!BLE.chr;
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
function bleRetry(): any {
    const dev: any = BLE.dev;
    if (!dev || !BLE.want)
        return;
    if (BLE.tries >= 3) {
        BLE.want = false;
        bleSet('ble_gone', 'err');
        return;
    }
    const wait: any = [500, 2000, 5000][BLE.tries++];
    bleSet('ble_lost', 'err');
    clearTimeout(BLE.retryT);
    BLE.retryT = setTimeout(() => { if (BLE.want && BLE.dev === dev && !bleLive())
        bleOpen(dev, true); }, wait);
}
function bleReconnect(): any { const dev: any = BLE.dev; if (!dev || bleLive() || BLE.busy)
    return; ensureAudio(); BLE.tries = 0; bleOpen(dev, false); }
function bleDisconnect(keepMsg: any = undefined): any {
    const chr: any = BLE.chr, dev: any = BLE.dev;
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
        catch (_: any) { }
    }
    if (!keepMsg)
        bleSet('ble_off');
}
// Nothing may stay stuck when the link goes: keys held over Bluetooth, its sustain pedal, bend and mod wheel are let go.
function bleReleaseInput(): any {
    [...inputOwners.entries()].forEach(([m, o]: any = undefined) => { if (o.has('ble'))
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
async function bleAutoReconnect() {
    const s: any = BLE.saved;
    if (!s || !bleCan() || !window.isSecureContext || !(navigator as any).bluetooth.getDevices)
        return;
    try {
        const dev: any = (await (navigator as any).bluetooth.getDevices()).find((d: any = undefined) => d.id === s.id);
        if (!dev || BLE.dev)
            return;
        BLE.dev = dev;
        bleUi();
        if (s.auto)
            bleOpen(dev, false, true);
    }
    catch (err: any) {
        console.warn('Bluetooth MIDI:', err);
    }
}
function bleParserReset(): any { BLE.run = 0; BLE.need = 0; BLE.n = 0; BLE.skip = 0; BLE.sysex = false; }
function bleOnValue(e: any = undefined): any { const v: any = e.target.value; if (v && v.byteLength > 1)
    bleParse(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); }
/* BLE-MIDI packet: [header 10hhhhhh] then messages, each normally led by a timestamp byte [1lllllll]. A byte with bit 7 set that
   directly follows a timestamp is a status byte; any other byte with bit 7 set is the next timestamp. Within a packet a message may
   drop its status (running status) and then also its timestamp, so several notes can share one notification. SysEx may span
   packets (continuation packets carry only data after the header). Messages are dispatched as soon as their last byte is read;
   the timestamps carry no information we need, because the packet is played the moment it arrives. */
function bleParse(p: any = undefined): any {
    if ((p[0] & 0xC0) !== 0x80)
        return;
    let ts: any = false;
    for (let i: any = 1; i < p.length; i++) {
        const b: any = p[i];
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
function bleStatus(b: any = undefined): any {
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
function bleData(b: any = undefined): any {
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
function bleMsg(st: any = undefined, d1: any = undefined, d2: any = undefined): any {
    const cmd: any = st & 0xF0;
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
const PWA: any = { sw: '', err: '', prompt: null, installed: false };
function pwaStandalone(): any { return !!(((window as any).matchMedia && ((matchMedia as any)('(display-mode: standalone)').matches || (matchMedia as any)('(display-mode: fullscreen)').matches)) || (navigator as any).standalone === true); }
function pwaInit(): any {
    window.addEventListener('beforeinstallprompt', (e: any = undefined) => { e.preventDefault(); PWA.prompt = e; pwaUi(); });
    window.addEventListener('appinstalled', () => { PWA.prompt = null; PWA.installed = true; pwaUi(); });
    if (location.protocol === 'file:')
        PWA.sw = 'file';
    else if (!('serviceWorker' in navigator))
        PWA.sw = 'unsupported';
    else if (!window.isSecureContext)
        PWA.sw = 'file';
    else {
        const killed: any = new URL(location.href).searchParams.get('sw-kill-switch') === 'done';
        if (killed) {
            const clean: any = new URL(location.href);
            clean.searchParams.delete('sw-kill-switch');
            history.replaceState(null, '', clean.href);
            PWA.sw = 'unsupported';
            pwaUi();
            return;
        }
        PWA.sw = 'pending';
        const reg: any = () => navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
            .then(() => navigator.serviceWorker.ready).then(() => { PWA.sw = 'ready'; pwaUi(); })
            .catch((err: any = undefined) => { PWA.sw = 'error'; PWA.err = (err && (err.name || err.message)) || '?'; console.warn('Service worker:', err); pwaUi(); });
        if (document.readyState === 'complete')
            reg();
        else
            window.addEventListener('load', reg, { once: true });
    }
    pwaUi();
}
function pwaUi(): any {
    const st: any = $('set-pwa-status'), ib: any = $('set-install');
    if (!st || !ib)
        return;
    const k: any = (PWA.installed || pwaStandalone()) && PWA.sw !== 'file' ? 'pwa_installed' : ({ file: 'pwa_file', unsupported: 'pwa_unsupported', ready: 'pwa_ready', error: 'pwa_err' } as any)[PWA.sw] || 'pwa_pending';
    st.textContent = t(k, PWA.err);
    st.dataset.s = PWA.sw === 'error' ? 'err' : '';
    ib.hidden = !PWA.prompt;
}
async function pwaInstall() {
    const p: any = PWA.prompt;
    if (!p)
        return;
    PWA.prompt = null;
    pwaUi();
    try {
        await p.prompt();
        const c: any = await p.userChoice;
        if (c && c.outcome === 'accepted')
            PWA.installed = true;
    }
    catch (err: any) {
        console.warn('Install:', err);
    }
    pwaUi();
}
function fsCan(): any { return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen); }
function fsUi(): any { const b: any = $('set-full'); if (!b)
    return; const row: any = b.closest('.set-row'); if (row)
    row.hidden = !fsCan(); b.textContent = t(document.fullscreenElement ? 'full_exit' : 'full_enter'); }
function fsToggle(): any {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
        return;
    }
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((err: any = undefined) => console.warn('Full screen:', err));
}
// Screen Wake Lock: a remembered choice, held while the page is in front, given back after 30 minutes without playing or touching,
// taken again on the next note or tap. The browser drops the lock whenever the page is hidden; it is re-requested on return.
const WAKE: any = { want: false, lock: null, busy: false, err: '', fails: 0, idle: false, last: 0, idleT: 0, gest: false }, WAKE_IDLE_MS: any = 30 * 60 * 1000;
function wakeCan(): any { return !!(navigator.wakeLock && navigator.wakeLock.request); }
async function wakeGet() {
    if (!WAKE.want || WAKE.idle || WAKE.lock || WAKE.busy || !wakeCan() || document.visibilityState !== 'visible')
        return;
    WAKE.busy = true;
    try {
        const s: any = await navigator.wakeLock.request('screen');
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
    catch (err: any) {
        WAKE.busy = false;
        WAKE.err = (err && err.name) || 'Error';
        WAKE.fails++;
        if (WAKE.fails === 1)
            console.warn('Wake lock:', err);
        if (WAKE.fails < 3)
            wakeOnGesture();
    } // e.g. no user activation yet: one quiet retry on the next tap or key, never a loop
    wakeUi();
}
function wakeOnGesture(): any {
    if (WAKE.gest)
        return;
    WAKE.gest = true;
    const go: any = () => { WAKE.gest = false; ['pointerdown', 'keydown'].forEach((ev: any = undefined) => window.removeEventListener(ev, go, true)); wakeGet(); };
    ['pointerdown', 'keydown'].forEach((ev: any = undefined) => window.addEventListener(ev, go, true));
}
function wakeDrop(): any { const s: any = WAKE.lock; WAKE.lock = null; if (s)
    s.release().catch(() => { }); }
function wakeSet(on: any = undefined): any {
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
function wakePing(): any {
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
function wakeArm(ms: any = undefined): any {
    WAKE.idleT = setTimeout(() => {
        WAKE.idleT = 0;
        if (!WAKE.want)
            return;
        const left: any = WAKE_IDLE_MS - (performance.now() - WAKE.last);
        if (left > 1000) {
            wakeArm(left);
            return;
        }
        WAKE.idle = true;
        wakeDrop();
        wakeUi();
    }, ms);
}
function wakeUi(): any {
    const cb: any = $('set-wake'), st: any = $('set-wake-status');
    if (!cb || !st)
        return;
    const can: any = wakeCan();
    cb.checked = WAKE.want && can;
    cb.disabled = !can;
    st.textContent = !can ? t('wake_unsupported') : !WAKE.want ? t('wake_off') : WAKE.lock ? t('wake_on') : WAKE.idle ? t('wake_idle') : WAKE.err === 'NotAllowedError' ? t('wake_denied') : WAKE.err ? t('wake_err', WAKE.err) : t('wake_wait');
    st.dataset.s = WAKE.want && WAKE.lock ? 'on' : WAKE.want && WAKE.err ? 'err' : '';
}
function wakeInit(): any {
    ['pointerdown', 'keydown'].forEach((ev: any = undefined) => window.addEventListener(ev, wakePing, { capture: true, passive: true }));
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
const KEYMAP: any = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };
const typingDown: any = new Map();
function shiftTypeOctave(dir: any = undefined): any { releaseTypingKeys(); const next: any = typeOctave + dir * 12, minLow: any = BASE_LOW, maxLow: any = Math.max(BASE_LOW, BASE_HIGH - view.oct * 12); if (dir < 0) {
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
function physKey(e: any = undefined): any { return e.code || (/^[a-z]$/i.test(e.key || '') ? 'Key' + e.key.toUpperCase() : ''); } // some synthetic and virtual-keyboard events carry no code
// Name those physical keys as the user's layout prints them (Keyboard Map API, Chromium); elsewhere the QWERTY names stay.
function kbdLayoutLabels(): any {
    const kb: any = (navigator as any).keyboard;
    if (!kb || typeof kb.getLayoutMap !== 'function')
        return;
    try {
        kb.getLayoutMap().then((map: any = undefined) => (document as any).querySelectorAll('kbd[data-codes]').forEach((el: any = undefined) => {
            const ks: any = el.dataset.codes.split(' ').map((c: any = undefined) => map.get(c));
            if (ks.every((x: any = undefined) => typeof x === 'string' && x.trim()))
                el.textContent = ks.map((x: any = undefined) => x.toUpperCase()).join(el.dataset.sep || ' ');
        })).catch(() => { });
    }
    catch (_: any) { }
}
function releaseTypingKeys(): any { typingDown.forEach((m: any = undefined, k: any = undefined) => handleNoteOff(m, 'typing:' + k)); typingDown.clear(); }
function inField(): any { const a: any = document.activeElement; return a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable); }
document.addEventListener('keydown', (e: any = undefined) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') {
        releaseTypingKeys();
        return;
    }
    if (inField() || $('drawer').classList.contains('on') || $('helpBox').classList.contains('on') || e.repeat)
        return;
    const k: any = e.key.toLowerCase();
    if (e.key === '?') {
        e.preventDefault();
        openHelp(!$('helpBox').classList.contains('on'));
        return;
    }
    if (rdKey(e, k))
        return;
    if (SES.active && SES.q) { // session shortcuts: digits pick an answer, R replays, N advances
        if (/^[1-9]$/.test(k) && !SES.answered && SES.q.mode === 'ear') {
            const b: any = $('q-answers').children[+k - 1];
            if (b) {
                e.preventDefault();
                b.click();
                return;
            }
        }
        if (k === 'r' && !$('q-replay').hidden) {
            e.preventDefault();
            $('q-replay').click();
            return;
        }
        if (k === 'n' && !$('q-next').hidden) {
            e.preventDefault();
            $('q-next').click();
            return;
        }
    }
    if (view0() === 'analysis' && AN.notes.length && /^[lpmc]$/.test(k))
        return; // score shortcuts keep their letters wherever the layout puts them
    const c: any = physKey(e);
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
        const m: any = typeOctave + KEYMAP[c];
        if (!typingDown.has(c)) {
            e.preventDefault();
            typingDown.set(c, m);
            handleNoteOn(m, 100, 'typing:' + c);
        }
    }
});
document.addEventListener('keyup', (e: any = undefined) => { const c: any = physKey(e); if (typingDown.has(c)) {
    const m: any = typingDown.get(c);
    typingDown.delete(c);
    handleNoteOff(m, 'typing:' + c);
} });
/* ---------- GRADING CORE ---------- */
function chordTargetPcs(rootPc: any = undefined, tpl: any = undefined): any { return chordPitches(rootPc, tpl.intervals); }
function inversionOf(rootPc: any = undefined, tpl: any = undefined, bassMidi: any = undefined): any { return chordInversion(rootPc, tpl, bassMidi); }
function identifyChord(notes: any = undefined, expected: any = undefined): any { return identifyChordDomain(notes, CHORDS, expected); }
function slashLabel(id: any = undefined): any { return rootName(id.rootPc) + id.chord.symbol + (id.inversion > 0 ? '/' + rootName(id.bassPc) : ''); }
/* ============================================================================
   ITEM MODEL + SPACED REPETITION
   ============================================================================ */
const INTRO_IV: any = [7, 5, 4, 3, 12, 2, 9, 8, 11, 10, 1, 6];
const INTRO_CH: any = ['maj', 'm', 'dim', 'sus4', 'sus2', 'aug', 'maj7', '7', 'm7', '6', 'm6', 'm7♭5', 'dim7', 'mMaj7', 'add9', '9', 'maj9', 'm9', '7♯5', '7♭5', 'maj7♯11', '7♭9', '7♯9', '11', '13'];
const INTRO_SC: any = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic', 'Dorian', 'Mixolydian', 'Blues', 'Lydian', 'Phrygian', 'Harmonic minor', 'Melodic minor', 'Locrian', 'Harmonic major', 'Whole tone', 'Phrygian dominant', 'Hungarian minor', 'Diminished (W-H)', 'Diminished (H-W)', 'Chromatic'];
const CATS: any = { interval: { label: 'Intervals' }, chord: { label: 'Chords' }, scale: { label: 'Scales' }, prog: { label: 'Progressions' } };
const ITEMS: any = [];
const ITEM_BY_ID: any = {};
INTRO_IV.forEach((semi: any = undefined, i: any = undefined) => { const iv: any = INTERVALS.find((x: any = undefined) => x.semi === semi); ITEMS.push({ id: 'iv:' + semi, cat: 'interval', semi, label: iv.name, short: iv.short, intro: i }); });
INTRO_CH.forEach((sym: any = undefined, i: any = undefined) => { const c: any = CHORDS.find((x: any = undefined) => x.symbol === sym); if (c)
    ITEMS.push({ id: 'ch:' + sym, cat: 'chord', ref: c, label: c.name, short: sym, intro: 100 + i }); });
INTRO_SC.forEach((nm: any = undefined, i: any = undefined) => { if (SCALES[nm])
    ITEMS.push({ id: 'sc:' + nm, cat: 'scale', name: nm, label: nm, short: nm, intro: 200 + i }); });
PROGS.forEach((p: any = undefined, i: any = undefined) => { ITEMS.push({ id: 'pr:' + p.name, cat: 'prog', ref: p, label: p.name, short: p.name, intro: 300 + i }); });
ITEMS.forEach((it: any = undefined) => ITEM_BY_ID[it.id] = it);
function freshData(): any { return { srs: {}, streak: 0, bestStreak: 0, lastActive: 0, todayDay: 0, todayCount: 0, newToday: 0, totalReviews: 0, totalCorrect: 0, placed: false, history: {}, singCleared: {}, sheet: {}, settings: { goal: 12, newPerDay: 5, allowInv: false, metronome: false, drone: false } }; }
let data: any = freshData();
function currentStreak(): any { return (data.lastActive >= todayN() - 1) ? (data.streak || 0) : 0; } // a missed day shows as 0, not the stale count
function srsOf(id: any = undefined): any { return data.srs[id] || (data.srs[id] = { box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 }); }
const IVL: any = [0, 1, 2, 4, 9, 21, 45, 90];
function reviewItem(id: any = undefined, correct: any = undefined): any {
    const it: any = srsOf(id);
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
    const days: any = IVL[it.box] !== undefined ? IVL[it.box] : 120;
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
function touchDay(): any {
    const t: any = todayN();
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
    const h: any = data.history || (data.history = {});
    h[t] = (h[t] || 0) + 1;
    const keys: any = Object.keys(h);
    if (keys.length > 400)
        keys.sort((a: any = undefined, b: any = undefined) => a - b).slice(0, keys.length - 400).forEach((k: any = undefined) => delete h[k]);
}
function seedPlacement(id: any = undefined, known: any = undefined): any { if (known) {
    const it: any = srsOf(id);
    it.box = 4;
    it.ease = 2.4;
    it.reps = 1;
    it.lapses = 0;
    it.due = todayN() + Math.round(IVL[4] * (it.ease / 2.3));
    it.last = todayN();
} data.totalReviews++; if (known)
    data.totalCorrect++; touchDay(); saveAll(); }
const SCALE_EAR_POOL: any = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian', 'Major pentatonic', 'Minor pentatonic', 'Blues', 'Harmonic minor', 'Whole tone'];
function scaleEarOptions(correct: any = undefined): any { let pool: any = SCALE_EAR_POOL.filter((n: any = undefined) => n !== correct); pool = shuffle(pool).slice(0, 6); pool.push(correct); return shuffle(pool); }
function chordEarOptions(correctItem: any = undefined): any {
    const others: any = ITEMS.filter((x: any = undefined) => x.cat === 'chord' && x.short !== correctItem.short);
    const same: any = shuffle(others.filter((x: any = undefined) => x.ref.pcset.length === correctItem.ref.pcset.length));
    const rest: any = shuffle(others.filter((x: any = undefined) => x.ref.pcset.length !== correctItem.ref.pcset.length));
    return shuffle(same.concat(rest).slice(0, 7).concat([correctItem]));
}
const PLACEMENT: any = ['iv:7', 'iv:5', 'iv:4', 'iv:3', 'iv:12', 'ch:maj', 'ch:m', 'ch:maj7', 'ch:7', 'sc:Major (Ionian)', 'sc:Aeolian (Natural minor)', 'pr:I–IV–V'];
function boxOf(id: any = undefined): any { return data.srs[id] ? data.srs[id].box : 0; }
function isDue(id: any = undefined): any { const s: any = data.srs[id]; return s && s.reps > 0 && s.due <= todayN(); }
function isNew(id: any = undefined): any { const s: any = data.srs[id]; return !s || s.reps === 0; }
function dueItems(): any { return ITEMS.filter((it: any = undefined) => isDue(it.id)).sort((a: any = undefined, b: any = undefined) => data.srs[a.id].due - data.srs[b.id].due); }
function newItemsAvail(): any { return ITEMS.filter((it: any = undefined) => isNew(it.id)).sort((a: any = undefined, b: any = undefined) => a.intro - b.intro); }
// New concepts still allowed today: the daily quota minus those already introduced today (across sessions).
function newQuotaLeft(): any { const introduced: any = data.todayDay === todayN() ? (data.newToday || 0) : 0; return Math.max(0, data.settings.newPerDay - introduced); }
function masteredCount(): any { return ITEMS.filter((it: any = undefined) => boxOf(it.id) >= 4).length; }
/* ============================================================================
   SESSION ENGINE  (interleaved, adaptive, with feedback + elaboration)
   ============================================================================ */
const SES: any = { active: false, queue: [], idx: 0, correct: 0, total: 0, q: null, answered: false, targeted: null, placement: false, promptT: 0 };
function sesStopPrompt(): any { clearTimeout(SES.promptT); SES.promptT = 0; }
function sesPrompt(q: any = undefined, play: any = undefined): any { sesStopPrompt(); SES.promptT = setTimeout(() => { SES.promptT = 0; if (SES.active && SES.q === q && !SES.answered)
    play(); }, 250); }
function buildQueue(): any {
    const goal: any = data.settings.goal;
    const due: any = dueItems();
    const fresh: any = newItemsAvail().slice(0, newQuotaLeft());
    let pool: any = [...due];
    for (const f of fresh) {
        if (pool.length >= goal)
            break;
        pool.push(f);
    }
    if (pool.length < goal) { // top up with the weakest seen items for extra retrieval practice
        const weak: any = ITEMS.filter((it: any = undefined) => !isNew(it.id) && !isDue(it.id)).sort((a: any = undefined, b: any = undefined) => boxOf(a.id) - boxOf(b.id));
        for (const w of weak) {
            if (pool.length >= goal)
                break;
            if (!pool.includes(w))
                pool.push(w);
        }
    }
    if (pool.length < goal && ITEMS.filter((it: any = undefined) => !isNew(it.id)).length < goal) { // early days only: introduce extra new concepts so the session feels substantial
        for (const m of newItemsAvail()) {
            if (pool.length >= goal)
                break;
            if (!pool.includes(m))
                pool.push(m);
        }
    }
    if (!pool.length)
        pool = shuffle(ITEMS).slice(0, goal);
    let qs: any = shuffle(pool).map(makeQuestion);
    // interleave: avoid two same-category in a row when possible
    for (let i: any = 1; i < qs.length; i++) {
        if (qs[i].it.cat === qs[i - 1].it.cat) {
            const j: any = qs.findIndex((q: any = undefined, k: any = undefined) => k > i && q.it.cat !== qs[i - 1].it.cat);
            if (j > -1) {
                [qs[i], qs[j]] = [qs[j], qs[i]];
            }
        }
    }
    return qs;
}
function makeQuestion(it: any = undefined): any {
    const b: any = boxOf(it.id);
    const forced: any = SES.targeted && SES.targeted.mode;
    let mode: any;
    if (SES.placement)
        mode = 'ear'; // placement probes real by-ear knowledge
    else if (forced)
        mode = forced; // targeted practice honours the chosen mode
    else if (it.cat === 'scale' || it.cat === 'prog')
        mode = b >= 3 ? 'ear' : 'play';
    else
        mode = b >= 2 ? 'ear' : 'play'; // desirable difficulty: recall-by-sound once recognised-by-doing
    let key: any;
    if (SES.targeted && SES.targeted.key != null && SES.targeted.key !== 'all')
        key = (+SES.targeted.key) || 0; // honour the key picked in Practice
    else
        key = b < 1 ? randItem([0, 7, 5, 2, 9]) : Math.floor(Math.random() * 12); // start in friendly keys
    return { it, mode, key, idx: 0, anchor: null, missed: false, hinted: false };
}
function startSession(targeted: any = undefined): any {
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
function startPlacement(): any {
    ensureAudio();
    sesStopPrompt();
    SES.targeted = null;
    SES.placement = true;
    SES.queue = PLACEMENT.map((id: any = undefined) => ITEM_BY_ID[id]).filter(Boolean).map(makeQuestion);
    SES.idx = 0;
    SES.correct = 0;
    SES.total = 0;
    SES.active = true;
    openSessionUI();
    nextQuestion();
}
function sesHome(): any { return SES.targeted ? 'practice' : 'today'; }
function openSessionUI(): any {
    const ses: any = $('session');
    if (SES.targeted) {
        $('view-practice').appendChild(ses);
        $('pr-home').style.display = 'none';
    }
    else {
        $('view-today').insertBefore(ses, $('summary'));
        $('pr-home').style.display = '';
    }
    $('today-home').style.display = 'none';
    $('summary').style.display = 'none';
    ses.style.display = 'block';
    ses.classList.add('on');
    dockSync();
    reflowKeys();
    requestAnimationFrame(() => { if (SES.active)
        ses.scrollIntoView({ block: 'start', behavior: 'instant' }); });
}
function endSession(toSummary: any = undefined): any {
    const wasPlacement: any = SES.placement;
    if (wasPlacement) {
        data.placed = true;
        saveAll();
    }
    sesStopPrompt();
    ekStop(SES.q);
    SES.active = false;
    SES.placement = false;
    $('session').style.display = 'none';
    $('session').classList.remove('on');
    kbClearAll();
    held.forEach((m: any = undefined) => audioNoteOff(m));
    held.clear();
    heldOrder.length = 0;
    stopMetro();
    stopDrone();
    if (SES.targeted) {
        prRecordDrill();
        $('pr-home').style.display = '';
        renderPracticeLast();
        if (toSummary)
            $('pr-start').focus();
        return;
    }
    if (toSummary)
        showSummary(wasPlacement);
    else {
        $('today-home').style.display = 'block';
        refreshToday();
    }
}
function nextQuestion(): any {
    if (!SES.targeted && SES.idx >= SES.queue.length) {
        endSession(true);
        return;
    }
    sesStopPrompt();
    ekStop(SES.q);
    kbClearAll();
    SES.answered = false;
    const q: any = SES.targeted ? makeQuestion(pickTargetedItem()) : SES.queue[SES.idx];
    SES.q = q;
    $('ses-progress').style.width = SES.targeted ? '0%' : (100 * SES.idx / SES.queue.length) + '%';
    $('ses-count').textContent = SES.targeted ? ('#' + (SES.total + 1) + (SES.total ? ' · ' + SES.correct + '/' + SES.total + ' ✓' : '')) : ((SES.idx + 1) + '/' + SES.queue.length);
    $('q-verdict').textContent = '';
    $('q-verdict').className = 'verdict';
    $('q-elab').textContent = '';
    $('q-elab').classList.remove('show');
    $('q-next').hidden = true;
    $('q-reveal').hidden = false;
    $('q-answers').hidden = true;
    $('q-answers').innerHTML = '';
    presentQuestion(q);
}
function pickTargetedItem(): any {
    const c: any = SES.targeted.cat;
    const pool: any = c === 'melody' ? ITEMS.filter((it: any = undefined) => it.cat === 'scale' && EK_MEL_SCALES.includes(it.name)) : ITEMS.filter((it: any = undefined) => it.cat === c); // weakness-weighted
    const w: any = pool.map((it: any = undefined) => { const s: any = data.srs[it.id] || { box: 0 }; return 1 / (1 + s.box); });
    let tot: any = w.reduce((a: any = undefined, b: any = undefined) => a + b, 0), r: any = Math.random() * tot;
    for (let i: any = 0; i < pool.length; i++) {
        r -= w[i];
        if (r <= 0)
            return pool[i];
    }
    return pool[0];
}
function presentQuestion(q: any = undefined): any {
    const it: any = q.it;
    $('q-cat').textContent = catLabel(it.cat);
    const playLbl: any = { interval: t('play_interval'), chord: t('play_chord'), scale: t('play_scale'), prog: t('play_prog') };
    $('q-mode').textContent = q.mode === 'ear' ? t(ekWanted(q) ? 'ek_mode' : 'listen_answer') : playLbl[it.cat];
    $('q-replay').hidden = q.mode !== 'ear';
    ekToggleSync(q);
    if (q.mode === 'ear') {
        presentEar(q);
    }
    else {
        presentPlay(q);
    }
}
function earRoot(q: any = undefined): any { return 57 + (q.key % 12 <= 5 ? q.key : q.key - 12) + 5; } // mid register, kept playable
function presentPlay(q: any = undefined): any {
    const it: any = q.it;
    if (it.cat === 'interval') {
        $('q-prompt').innerHTML = ivName(it.semi) + ' <span class="sub">' + t('above') + ' ' + rootName(q.key) + '</span>';
    }
    else if (it.cat === 'chord') {
        $('q-prompt').innerHTML = rootName(q.key) + dispSym(it.short) + ' <span class="sub">' + chordDisp(it.ref) + '</span>';
    }
    else if (it.cat === 'scale') {
        q.offs = SCALES[it.name].concat([12]);
        q.anchor = null;
        q.idx = 0;
        $('q-prompt').innerHTML = rootName(q.key) + ' ' + scaleDisp(it.name) + ' <span class="sub">' + t('ascending') + '</span>';
        if (data.settings.metronome)
            startMetro();
        if (data.settings.drone)
            startDrone(q.key);
    }
    else if (it.cat === 'prog') {
        q.idx = 0;
        const chain: any = it.ref.chords.map((ch: any = undefined) => rootName((q.key + ch[0]) % 12) + dispSym(ch[1])).join('  ·  ');
        $('q-prompt').innerHTML = it.ref.name + ' <span class="sub">' + t('in_key') + ' ' + rootName(q.key) + '</span>';
        $('q-verdict').className = 'verdict neutral';
        $('q-verdict').textContent = chain;
        showProgTarget(q);
    }
}
function presentEar(q: any = undefined): any {
    ekStop(q);
    q.ek = null;
    ekUiReset();
    if (ekWanted(q)) {
        presentEarKeys(q);
        return;
    }
    const it: any = q.it;
    $('q-prompt').textContent = t('listen');
    $('q-answers').hidden = false;
    const box: any = $('q-answers');
    box.innerHTML = '';
    let opts: any = [];
    if (it.cat === 'interval') {
        opts = INTERVALS.map((iv: any = undefined) => ({ k: iv.semi, t: iv.short + ' · ' + ivName(iv.semi) }));
        sesPrompt(q, () => playInterval(earRoot(q), it.semi, 'both'));
    }
    else if (it.cat === 'chord') {
        opts = chordEarOptions(it).map((x: any = undefined) => ({ k: x.short, t: x.short + ' · ' + chordDisp(x.ref) }));
        sesPrompt(q, () => playChordMidis(it.ref.intervals.map((i: any = undefined) => 57 + q.key + i), true));
    }
    else if (it.cat === 'scale') {
        opts = scaleEarOptions(it.name).map((nm: any = undefined) => ({ k: nm, t: scaleDisp(nm) }));
        sesPrompt(q, () => playScaleNotes(60 + q.key, SCALES[it.name], true));
    }
    else if (it.cat === 'prog') {
        opts = PROGS.map((p: any = undefined) => ({ k: p.name, t: p.name }));
        sesPrompt(q, () => playProg(q.key, it.ref));
    }
    opts.forEach((o: any = undefined) => { const b: any = (document as any).createElement('button'); b.className = 'chip'; b.dataset.k = String(o.k); b.textContent = o.t; b.onclick = () => answerEar(q, o.k, b); box.appendChild(b); });
}
function playProg(rootPc: any = undefined, prog: any = undefined): any { ensureAudio(); stopPreviews(); const t: any = actx.currentTime; prog.chords.forEach((ch: any = undefined, i: any = undefined) => { const root: any = 60 + ((rootPc + ch[0]) % 12), tpl: any = progChordTpl(ch[1]); tpl.intervals.forEach((iv: any = undefined) => previewNote(root + iv, t + i * .9, .8)); }); }
function showProgTarget(q: any = undefined): any { kbClear('target'); const ch: any = q.it.ref.chords[q.idx], root: any = 60 + ((q.key + ch[0]) % 12), tpl: any = progChordTpl(ch[1]); tpl.intervals.forEach((iv: any = undefined) => kbState(root + iv, 'target', true)); }
function playQuestionSound(q: any = undefined): any {
    const it: any = q.it;
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
        playChordMidis(it.ref.intervals.map((i: any = undefined) => 57 + q.key + i), true);
    else if (it.cat === 'scale')
        playScaleNotes(60 + q.key, SCALES[it.name], true);
    else if (it.cat === 'prog')
        playProg(q.key, it.ref);
}
function answerEar(q: any = undefined, k: any = undefined, btn: any = undefined): any {
    if (SES.answered)
        return;
    const it: any = q.it;
    let ok: any;
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
function markEarCorrect(q: any = undefined): any { const it: any = q.it; const key: any = it.cat === 'interval' ? String(it.semi) : it.cat === 'chord' ? it.short : it.cat === 'scale' ? it.name : it.ref.name; [...$('q-answers').children].forEach((b: any = undefined) => { if (b.dataset.k === key)
    b.classList.add('correct'); }); }
/* ---------- BY EAR, ON THE KEYS: hear it, then play it back (intervals, chords in any inversion, short tonal melodies) ----------
   The prompt plays first; notes that arrive before it ends are ignored (armAt), so nothing the listener does while it sounds is
   graded. Octave policy: the start note may be played in any octave and everything after it is measured from it, so an interval
   keeps its exact size, a melody keeps its exact shape, and a chord keeps its pitch classes with the written lowest note.
   A wrong attempt is a lapse for the schedule but can be retried (up to EK_TRIES) after listening again. */
const EK_TRIES: any = 3, EK_MEL_SCALES: any = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Major pentatonic', 'Minor pentatonic'];
const EK_CHORD_GAP: any = 300; // ms: a key joins the chord if another chord key is still down or it lands this close to the previous one
function ekForced(): any { return !!(SES.targeted && SES.targeted.cat === 'melody'); }
function ekWanted(q: any = undefined): any { return !!q && q.mode === 'ear' && !SES.placement && q.it.cat !== 'prog' && (ekForced() || !!data.settings.earKeys); }
// Spell like the key: minor-flavoured chords and scales on D, G, C, F, B♭, E♭ use flats, as do the flat major keys and the flat intervals.
function ekFlat(q: any = undefined): any {
    const it: any = q.it, set: any = it.cat === 'chord' ? it.ref.pcset : it.cat === 'scale' ? SCALES[it.name] : null;
    if (set && set.includes(3) && !set.includes(4))
        return [0, 2, 3, 5, 7, 10].includes(q.key);
    return isFlatKey(q.key) || (it.cat === 'interval' && [1, 3, 8, 10].includes(it.semi));
}
function ekName(q: any = undefined, m: any = undefined): any { return noteName(m, ekFlat(q)); }
function ekToggleSync(q: any = undefined): any {
    const box: any = $('q-ansmode');
    box.hidden = !(q && q.mode === 'ear' && !SES.placement && q.it.cat !== 'prog' && !ekForced());
    box.querySelectorAll('button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', (b.dataset.v === 'keys') === !!data.settings.earKeys ? 'true' : 'false'));
}
function ekUiReset(): any { $('q-ekhint').textContent = ''; $('q-ekprog').innerHTML = ''; $('q-ekreset').hidden = true; }
function ekStop(q: any = undefined): any { if (q && q.ek)
    clearTimeout(q.ek.goT); }
function ekBuild(q: any = undefined): any {
    const it: any = q.it;
    if (it.cat === 'interval') {
        const r: any = earRoot(q);
        return { kind: 'iv', target: [r, r + it.semi], n: 2 };
    }
    if (it.cat === 'chord') {
        const ivs: any = [...new Set(it.ref.intervals)].sort((a: any = undefined, b: any = undefined) => a - b), n: any = ivs.length;
        const inv: any = n <= 4 && Math.random() < .6 ? 1 + Math.floor(Math.random() * (n - 1)) : 0; // triads and sevenths come in every inversion
        let ns: any = ivs.map((i: any = undefined) => 48 + q.key + i);
        for (let k: any = 0; k < inv; k++)
            ns.push(ns.shift() + 12);
        if (ns[0] < 52)
            ns = ns.map((m: any = undefined) => m + 12);
        if (ns[ns.length - 1] > 88)
            ns = ns.map((m: any = undefined) => m - 12);
        const pcs: any = [...new Set(ns.map(pc))].sort((a: any = undefined, b: any = undefined) => a - b);
        return { kind: 'ch', target: ns, inv, pcs, n: pcs.length };
    }
    // a short tonal melody in the item's scale: starts on the tonic, moves mostly by step, ends on a stable degree
    const offs: any = SCALES[it.name], N: any = offs.length, ton: any = 60 + (q.key <= 5 ? q.key : q.key - 12), len: any = 3 + Math.floor(Math.random() * 3);
    const at: any = (d: any = undefined) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N), stable: any = (d: any = undefined) => [0, 3, 4, 7].includes(pc(at(d) - ton));
    let d: any = 0;
    const ds: any = [0];
    for (let i: any = 1; i < len; i++) {
        const last: any = i === len - 1, opts: any = [];
        [-2, -1, 1, 2].forEach((s: any = undefined) => { const nd: any = d + s; if (nd < -2 || nd > N + 2 || (last && !stable(nd)))
            return; opts.push(nd); if (Math.abs(s) === 1)
            opts.push(nd, nd); });
        if (!opts.length)
            opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
        d = randItem(opts);
        ds.push(d);
    }
    const target: any = ds.map(at);
    return { kind: 'mel', target, n: target.length };
}
function presentEarKeys(q: any = undefined): any {
    const it: any = q.it, ek: any = q.ek = Object.assign(ekBuild(q), { tries: 0, seq: [], off: 0, armAt: Infinity, goT: 0, won: false, warned: false });
    $('q-answers').hidden = true;
    $('q-answers').innerHTML = '';
    const st: any = ekName(q, ek.target[0]), sub: any = ek.kind === 'iv' ? t('ek_sub_start', st) : ek.kind === 'ch' ? t('ek_sub_bass', st, ek.n) : t('ek_sub_mel', rootName(q.key) + ' ' + scaleDisp(it.name), ek.n);
    $('q-prompt').innerHTML = t('ek_p_' + ek.kind) + ' <span class="sub">' + sub + '</span>';
    if (ek.kind === 'mel')
        $('q-cat').textContent = t('ek_cat_mel');
    $('q-ekhint').textContent = t('ek_hint_' + ek.kind);
    $('q-ekreset').hidden = false;
    ekProg(q, 0);
    ekPlay(q);
}
// Plays the prompt and returns when (seconds after now) its last note starts.
function ekSound(q: any = undefined): any {
    const ek: any = q.ek;
    ensureAudio();
    if (!actx)
        return 0;
    stopPreviews();
    const t0: any = actx.currentTime + .25, ms: any = ek.target;
    let last: any;
    if (ek.kind === 'iv') {
        previewNote(ms[0], t0, .45);
        previewNote(ms[1], t0 + .5, .45);
        previewNote(ms[0], t0 + 1.15, .8);
        previewNote(ms[1], t0 + 1.15, .8);
        last = 1.15;
    }
    else if (ek.kind === 'ch') {
        ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, t0 + i * .16, .4));
        const bt: any = ms.length * .16 + .1;
        ms.forEach((m: any = undefined) => previewNote(m, t0 + bt, 1.1));
        previewNote(ms[0], t0 + bt + 1.35, .6);
        last = bt + 1.35;
    }
    else {
        previewNote(ms[0], t0, .5);
        ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, t0 + .85 + i * .5, .45));
        last = .85 + (ms.length - 1) * .5;
    }
    return .25 + last;
}
function ekPlay(q: any = undefined): any {
    const ek: any = q.ek;
    if (!ek || SES.answered)
        return;
    const wait: any = (ekSound(q) + .3) * 1000;
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
function ekProg(q: any = undefined, k: any = undefined): any { const ek: any = q.ek; $('q-ekprog').innerHTML = ek ? Array.from({ length: ek.n }, (_: any = undefined, i: any = undefined) => '<i' + (i < k ? ' class="on"' : '') + '></i>').join('') : ''; }
function ekFlash(ms: any = undefined, s: any = undefined): any { ms.forEach((m: any = undefined) => kbState(m, s, true)); }
function ekOn(q: any = undefined, m: any = undefined): any {
    const ek: any = q.ek;
    if (m == null)
        return;
    const now: any = performance.now();
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
        const prev: any = ek.seq[ek.seq.length - 1];
        if (prev && !ek.seq.some((x: any = undefined) => held.has(x.m) && x.m !== m) && now - prev.t > EK_CHORD_GAP)
            ek.seq = [];
    }
    ek.seq.push({ m, t: now });
    scheduleEval(() => ek.kind === 'iv' ? ekIv(q) : ekCh(q), ek.kind === 'iv' ? 90 : 140);
}
function ekOff(q: any = undefined, m: any = undefined): any { const ek: any = q.ek; if (!ek || SES.answered || ek.kind !== 'ch' || !ek.seq.length)
    return; scheduleEval(() => ekCh(q), 140); }
function ekIv(q: any = undefined): any {
    const ek: any = q.ek;
    if (SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const s: any = ek.seq, start: any = ek.target[0], semi: any = ek.target[1] - start;
    let a: any = s[0], b: any = s[1];
    if (b && Math.abs(b.t - a.t) <= 80 && b.m < a.m) {
        const x: any = a;
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
function ekCh(q: any = undefined): any {
    const ek: any = q.ek;
    if (SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const ms: any = [...new Set(ek.seq.map((x: any = undefined) => x.m))].sort((a: any = undefined, b: any = undefined) => a - b), pcs: any = [...new Set(ms.map(pc))].sort((a: any = undefined, b: any = undefined) => a - b), down: any = ms.some((m: any = undefined) => held.has(m));
    if (setEq(pcs, ek.pcs)) {
        if (pc(ms[0]) === pc(ek.target[0]))
            ekWin(q, ms);
        else
            ekMiss(q, [ms[0]], t('ek_wrong_inv', ekName(q, ek.target[0])));
        return;
    }
    if (!isSubset(pcs, ek.pcs)) {
        ekMiss(q, ms.filter((m: any = undefined) => !ek.pcs.includes(pc(m))), t('ek_wrong_ch'));
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
function ekMel(q: any = undefined, m: any = undefined): any {
    const ek: any = q.ek, tg: any = ek.target, i: any = ek.seq.length;
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
    const want: any = tg[i] + ek.off;
    if (m !== want) {
        ekMiss(q, [m], t('ek_wrong_mel', i + 1, t(m > want ? 'ek_high' : 'ek_low')));
        return;
    }
    ek.seq.push({ m, t: performance.now() });
    kbState(m, 'good', true);
    ekProg(q, ek.seq.length);
    if (ek.seq.length >= tg.length)
        ekWin(q, ek.seq.map((x: any = undefined) => x.m));
    else
        neutral(t('ek_progress', ek.seq.length, tg.length));
}
function ekWin(q: any = undefined, ms: any = undefined): any { q.ek.won = true; q.ek.played = ms; kbClear('target'); ekFlash(ms, 'good'); ekProg(q, q.ek.n); resolve(q, true); }
function ekMiss(q: any = undefined, bad: any = undefined, msg: any = undefined): any {
    const ek: any = q.ek;
    q.missed = true;
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
    const v: any = $('q-verdict');
    v.className = 'verdict bad';
    v.textContent = msg + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
}
function ekReset(): any { const q: any = SES.q; if (!q || !q.ek || SES.answered)
    return; q.ek.seq = []; kbClear('good'); kbClear('bad'); kbState(q.ek.target[0], 'target', true); ekProg(q, 0); neutral(t('ek_reset_msg')); }
function ekElab(q: any = undefined): any {
    const ek: any = q.ek, names: any = (ms: any = undefined) => ms.map((m: any = undefined) => ekName(q, m)).join(' ');
    if (ek.kind === 'iv')
        return t('ek_el_iv', ekName(q, ek.target[0])) + ' · ' + names(ek.target);
    if (ek.kind === 'ch')
        return t('ek_el_ch', invName(ek.inv), names(ek.target));
    return t('ek_el_mel', names(ek.target));
}
/* play-mode grading via held notes */
function sesInput(midi: any = undefined): any {
    const q: any = SES.q;
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
function gradeInterval(q: any = undefined): any {
    if (SES.answered)
        return;
    const ms: any = heldMidis().sort((a: any = undefined, b: any = undefined) => a - b);
    if (ms.length < 2)
        return;
    if (ms.length > 2) {
        neutral(t('just_two'));
        return;
    }
    const lo: any = ms[0], hi: any = ms[1];
    if (pc(lo) === q.key && hi - lo === q.it.semi) {
        [lo, hi].forEach((m: any = undefined) => kbState(m, 'good', true));
        resolve(q, true);
    }
    else {
        [lo, hi].forEach((m: any = undefined) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 500);
        q.missed = true;
        resolve(q, false);
    }
}
function gradeChord(q: any = undefined): any {
    if (SES.answered)
        return;
    const hp: any = heldPcs(), tpl: any = q.it.ref, target: any = chordTargetPcs(q.key, tpl);
    if (!hp.length)
        return;
    if (setEq(hp, target)) {
        const inv: any = inversionOf(q.key, tpl, Math.min(...heldMidis()));
        if (!data.settings.allowInv && inv !== 0) {
            neutral(t('root_pos', rootName(q.key)));
            return;
        }
        heldMidis().forEach((m: any = undefined) => kbState(m, 'good', true));
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
        heldMidis().forEach((m: any = undefined) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 500);
        q.missed = true;
        resolve(q, false);
    }
}
function gradeScaleNote(q: any = undefined, midi: any = undefined): any {
    if (SES.answered || midi == null)
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
    const want: any = q.anchor + q.offs[q.idx];
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
function gradeProgChord(q: any = undefined): any {
    if (SES.answered)
        return;
    const ch: any = q.it.ref.chords[q.idx], root: any = (q.key + ch[0]) % 12, tpl: any = progChordTpl(ch[1]);
    const target: any = chordTargetPcs(root, tpl), hp: any = heldPcs();
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
        heldMidis().forEach((m: any = undefined) => kbState(m, 'bad', true));
        setTimeout(() => kbClear('bad'), 420);
        q.missed = true;
        resolve(q, false);
    }
}
function neutral(msg: any = undefined): any { const v: any = $('q-verdict'); v.className = 'verdict neutral'; v.textContent = msg; }
function resolve(q: any = undefined, correct: any = undefined): any {
    if (SES.answered)
        return;
    SES.answered = true;
    stopMetro();
    stopDrone();
    const good: any = correct && !q.missed;
    if (SES.placement)
        seedPlacement(q.it.id, good);
    else if (!SES.targeted)
        reviewItem(q.it.id, good); // targeted drills are free practice: no schedule, daily-goal or streak change
    SES.total++;
    if (good)
        SES.correct++;
    const v: any = $('q-verdict');
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
        $('q-ekreset').hidden = true;
    }
    revealAnswerKeys(q);
    showElaboration(q);
    if (!good) {
        setTimeout(() => { if (SES.active && SES.q === q && SES.answered)
            playQuestionSound(q); }, 600);
    } // let the right answer be heard, not just seen
    $('q-reveal').hidden = true;
    $('q-next').hidden = false;
    $('q-next').focus();
}
function revealAnswerKeys(q: any = undefined): any {
    const it: any = q.it;
    if (q.ek) {
        if (!q.ek.won) {
            kbClear('target');
            kbClear('good');
            q.ek.target.forEach((m: any = undefined) => kbState(m, 'target', true));
        }
        return;
    }
    if (it.cat === 'interval') {
        const r: any = 60 + q.key;
        [r, r + it.semi].forEach((m: any = undefined) => kbState(m, 'target', true));
    }
    else if (it.cat === 'chord') {
        const r: any = 60 + q.key;
        it.ref.intervals.forEach((i: any = undefined) => kbState(r + i, 'target', true));
    }
    else if (it.cat === 'scale') {
        const r: any = 60 + q.key;
        SCALES[it.name].concat([12]).forEach((o: any = undefined) => kbState(r + o, 'target', true));
    }
}
function showElaboration(q: any = undefined): any {
    const it: any = q.it, e: any = $('q-elab');
    let html: any = '';
    if (it.cat === 'interval') {
        const s: any = songsFor(it.semi, 'asc');
        html = '<b>' + ivName(it.semi) + '</b> = ' + it.semi + ' ' + t('el_semitones') + (s.length && !/^\(/.test(s[0]) ? ' · ' + t('el_soundslike') + ' “' + s[0] + '”' : '');
    }
    else if (it.cat === 'chord') {
        const f: any = feelDisp(it.short);
        html = '<b>' + rootName(q.key) + dispSym(it.short) + '</b> = ' + chordFormula(it.ref) + (f ? ' · ' + f : '');
    }
    else if (it.cat === 'scale') {
        html = '<b>' + scaleDisp(it.name) + '</b> · ' + t('el_degrees') + ' ' + scaleFormula(SCALES[it.name]);
    }
    else if (it.cat === 'prog') {
        const chain: any = it.ref.chords.map((ch: any = undefined) => rootName((q.key + ch[0]) % 12) + dispSym(ch[1])).join(' · '), rom: any = it.ref.chords.map((ch: any = undefined) => ch[2]).join(' · ');
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
let _view: any = 'today';
function view0(): any { return _view; }
const _modalStack: any = [];
let _modalBackPending: any = false, _modalAfterBack: any = null;
function pushModalState(id: any = undefined): any {
    if (_modalBackPending) {
        _modalAfterBack = id;
        _modalStack.length = 0;
        _modalStack.push(id);
        return;
    }
    // Opening an overlay from the mobile menu replaces that temporary menu entry.
    if (id !== 'menu' && history.state && history.state.modal === 'menu' && !$('mobileMenu').hidden) {
        closeMobileMenu(false, true);
        _modalStack.length = 0;
        try {
            history.replaceState({ modal: id }, '', location.href);
            _modalStack.push(id);
        }
        catch (_: any) { }
        return;
    }
    if (!_modalStack.includes(id)) {
        _modalStack.push(id);
        try {
            history.pushState({ modal: id }, '', location.href);
        }
        catch (_: any) { }
    }
}
function popModalState(id: any = undefined): any {
    const idx: any = _modalStack.indexOf(id);
    if (idx !== -1) {
        _modalStack.splice(idx, 1);
        if (_modalBackPending && _modalAfterBack === id) {
            _modalAfterBack = null;
            return;
        }
        if (history.state && history.state.modal === id) {
            try {
                _modalBackPending = true;
                history.back();
            }
            catch (_: any) {
                _modalBackPending = false;
            }
        }
    }
}
function closeMobileMenu(returnFocus: any = false, fromPop: any = false): any {
    const menu: any = $('mobileMenu');
    if (!menu || menu.hidden)
        return false;
    menu.hidden = true;
    $('menuBtn').setAttribute('aria-expanded', 'false');
    if (!fromPop)
        popModalState('menu');
    if (returnFocus)
        $('menuBtn').focus();
    return true;
}
function openMobileMenu(fromPop: any = false): any {
    const mm: any = $('mobileMenu');
    if (!fromPop)
        pushModalState('menu');
    mm.innerHTML = '';
    (document as any).querySelectorAll('#nav button').forEach((b: any = undefined) => { const x: any = (document as any).createElement('button'); x.textContent = b.textContent; x.dataset.view = b.dataset.view; x.setAttribute('aria-current', b.getAttribute('aria-current') || 'false'); x.addEventListener('click', () => show(x.dataset.view)); mm.appendChild(x); });
    mm.hidden = false;
    $('menuBtn').setAttribute('aria-expanded', 'true');
    (mm.querySelector('[aria-current="page"]') || mm.querySelector('button')).focus();
}
function renderModeNav(): any {
    const group: any = navGroup(view0()), views: any = NAV_GROUPS[group] || [];
    $('modeBar').hidden = views.length < 2;
    $('modeNav').innerHTML = views.map((v: any = undefined) => `<button type="button" data-view="${v}" aria-current="${v === view0() ? 'page' : 'false'}">${t(v === 'practice' ? 'nav_drills' : 'nav_' + v)}</button>`).join('');
}
function focusView(v: any = undefined): any {
    const view: any = $('view-' + v);
    const target: any = [...view.querySelectorAll('h1,h2')].find((el: any = undefined) => el.getClientRects().length) || view;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
}
let show: any = function show(v: any = undefined, moveFocus: any = true) {
    if (!navGroup(v))
        return;
    const prev: any = _view;
    if (location.hash.slice(1) !== v) {
        const viaModal: any = _modalStack.length > 0;
        _modalStack.length = 0; // the modal's history entry becomes the new view's entry
        try {
            history[(_routed && !viaModal) ? 'pushState' : 'replaceState'](null, '', '#' + v);
        }
        catch (_: any) { }
    }
    _routed = true;
    if (v !== 'today') {
        data.lastTool = v;
        const tv: any = data.toolDay || (data.toolDay = {});
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
    (document as any).querySelectorAll('.view').forEach((s: any = undefined) => s.classList.toggle('active', s.id === 'view-' + v));
    (document as any).querySelectorAll('#nav button').forEach((b: any = undefined) => b.setAttribute('aria-current', b.dataset.view === navGroup(v) ? 'page' : 'false'));
    dockSync();
    if (dockShown())
        reflowKeys(); // reposition once the dock is laid out
    closeMobileMenu();
    if (SES.active && v !== sesHome()) { /* leaving mid-session */
        endSession(false);
    }
    if (v === 'today' && !SES.active) {
        $('today-home').style.display = 'block';
        $('summary').style.display = 'none';
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
    const active: any = document.activeElement;
    if (moveFocus && (!active || active === document.body || !active.isConnected || !active.getClientRects().length))
        focusView(v);
};
let _routed: any = false;
window.addEventListener('popstate', (e: any = undefined) => {
    // The destination history entry, not the previously visible overlay, determines the UI.
    if (_modalBackPending) {
        _modalBackPending = false;
        const next: any = _modalAfterBack;
        _modalAfterBack = null;
        if (next) {
            _modalStack.length = 0;
            try {
                history.pushState({ modal: next }, '', location.href);
                _modalStack.push(next);
            }
            catch (_: any) { }
            return;
        }
    }
    const modal: any = e.state && e.state.modal;
    _modalStack.length = 0;
    if (modal === 'menu' || modal === 'help' || modal === 'drawer')
        _modalStack.push(modal);
    if (modal !== 'menu') {
        const menu: any = $('mobileMenu'), returnFocus: any = !modal && menu.contains(document.activeElement) && location.hash.slice(1) === _view;
        closeMobileMenu(returnFocus, true);
    }
    if (modal !== 'help' && $('helpBox').classList.contains('on'))
        openHelp(false, true);
    if (modal !== 'drawer' && $('drawer').classList.contains('on'))
        openDrawer(false, true);
    const v: any = location.hash.slice(1);
    if (navGroup(v) && v !== _view) {
        _routed = false;
        show(v);
    }
    if (modal === 'menu' && getComputedStyle($('menuBtn')).display !== 'none' && $('mobileMenu').hidden)
        openMobileMenu(true);
    if (modal === 'help' && !$('helpBox').classList.contains('on'))
        openHelp(true, true);
    if (modal === 'drawer' && !$('drawer').classList.contains('on'))
        openDrawer(true, true);
});
/* ---------- TODAY ---------- */
function greeting(): any { const h: any = new Date().getHours(); return h < 5 ? t('g_late') : h < 12 ? t('g_morning') : h < 18 ? t('g_afternoon') : t('g_evening'); }
function refreshToday(): any {
    const gr: any = greeting();
    $('greet-title').textContent = /[.?!…]$/.test(gr) ? gr : gr + '.';
    const tn: any = todayN();
    $('streakN').textContent = currentStreak();
    const goal: any = data.settings.goal, done: any = Math.min(data.todayDay === tn ? data.todayCount : 0, goal);
    const gd: any = $('goaldots');
    gd.innerHTML = '';
    const dots: any = 5;
    for (let i: any = 0; i < dots; i++) {
        const x: any = (document as any).createElement('i');
        if (i < Math.round(dots * done / goal))
            x.className = 'on';
        gd.appendChild(x);
    }
    gd.setAttribute('aria-label', t('goal_aria', done, goal));
    $('goal-txt').textContent = t('goal_txt', done, goal);
    const due: any = dueItems().length, fresh: any = Math.min(newItemsAvail().length, newQuotaLeft());
    $('c-due').textContent = due;
    $('c-new').textContent = fresh;
    $('c-mastered').textContent = masteredCount();
    $('placeBtn').hidden = !(!data.placed && (data.totalReviews || 0) === 0); // offer placement only to brand-new users
    const next: any = dueItems()[0] || (fresh ? newItemsAvail()[0] : null);
    $('nextup').innerHTML = next ? (t('nextup') + ' <b>' + itemLabel(next) + '</b> · ' + catLabel(next.cat).toLowerCase()) : t('nextup_none');
    const caughtUp: any = due === 0 && fresh === 0;
    $('startBtn').textContent = caughtUp ? t('start_caught') : t('start');
    $('hero-title').textContent = caughtUp ? t('hero_caught') : t('hero_session');
    $('why-text').textContent = caughtUp ? t('why_caught') : t('why_due');
    // focus grid
    const fg: any = $('focusGrid');
    fg.innerHTML = '';
    Object.keys(CATS).forEach((cat: any = undefined) => {
        const items: any = ITEMS.filter((it: any = undefined) => it.cat === cat);
        const mastered: any = items.filter((it: any = undefined) => boxOf(it.id) >= 4).length;
        const seen: any = items.filter((it: any = undefined) => !isNew(it.id)).length;
        const card: any = (document as any).createElement('button');
        card.type = 'button';
        card.className = 'focus';
        card.onclick = () => { show('practice'); $('pr-cat').value = cat; $('pr-cat').dispatchEvent(new Event('change')); $('pr-start').focus(); };
        card.innerHTML = '<div class="k">' + catLabel(cat) + '</div><div class="m">' + mastered + ' ' + t('mastered_lc') + ' · ' + seen + '/' + items.length + ' ' + t('started') + '</div><div class="bar"><i style="width:' + Math.round(100 * mastered / items.length) + '%"></i></div>';
        fg.appendChild(card);
    });
    renderPlan();
}
/* ---------- EXPLORE ---------- */
let explorePreview: any = [], exploreTimers: any = [];
function clearExplorePreview(): any { exploreTimers.forEach(clearTimeout); exploreTimers = []; explorePreview = []; if (view0() === 'explore')
    updateExplore(); }
function exploreSequence(events: any = undefined): any {
    if (view0() !== 'explore')
        return;
    clearExplorePreview();
    if (reduceMotion() && events.length > 2) {
        const last: any = events[events.length - 1]; // reduced motion: one steady picture of every note instead of a light running across the keys
        events = [{ at: 0, notes: [...new Set(events.flatMap((e: any = undefined) => e.notes))].sort((a: any = undefined, b: any = undefined) => a - b) }].concat(last.notes.length ? [] : [last]);
    }
    events.forEach((e: any = undefined) => {
        const paint: any = () => { explorePreview = e.notes; updateExplore(); };
        if (e.at === 0)
            paint();
        else
            exploreTimers.push(setTimeout(paint, e.at));
    });
}
// Bass on the left and treble on the right, as on the keyboard. The frame never changes, so nothing moves while you play: each clef shows
// the exact sounding octave up to EX_LEDGERS ledger lines, and lists any note further away beside an arrow at its edge.
const EX_LEDGERS: any = 5;
function drawExploreStaff(midis: any = undefined, flat: any = undefined): any {
    const wrap: any = $('ex-staff');
    if (!wrap)
        return;
    const names: any = flat ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pitches: any = [...new Set(midis)].map((m: any = undefined) => {
        const name: any = names[pc(m)], li: any = 'CDEFGAB'.indexOf(name[0]), oct: any = Math.floor(m / 12) - 1;
        return { m, step: ssStepOf(li, oct), acc: name.slice(1) };
    }).sort((a: any = undefined, b: any = undefined) => a.step - b.step || a.m - b.m);
    const W: any = 520, H: any = 234, top: any = 94, room: any = EX_LEDGERS * 12 + 6;
    let body: any = '';
    [['bass', 16, 250], ['treble', 270, 504]].forEach(([clef, x0, x1]: any = undefined) => {
        const treble: any = clef === 'treble', ref: any = treble ? 30 : 18, x: any = x0 + 146, far: any = { up: [], down: [] };
        body += `<g class="ex-stave" data-clef="${clef}"><text class="ss-syl" x="${x0 + 24}" y="${top - 24}">${t(treble ? 'si_treble' : 'si_bass')}</text>`;
        for (let i: any = 0; i < 5; i++)
            body += `<line class="ss-line" x1="${x0}" y1="${top + i * 12}" x2="${x1}" y2="${top + i * 12}" stroke-width="1.2"/>`;
        body += srClef(clef, x0 + 16, top);
        // Adjacent pitches use alternating head columns; accidentals have collision-free lanes.
        let prevStep: any = -Infinity, prevLane: any = 0;
        const accLanes: any = [], heads: any = [];
        pitches.forEach((p: any = undefined) => {
            const y: any = top + 48 + (ref - p.step) * 6;
            if (y < top - room || y > top + 48 + room) {
                far[y < top ? 'up' : 'down'].push(noteName(p.m, flat));
                return;
            }
            const lane: any = p.step - prevStep <= 1 ? 1 - prevLane : 0;
            prevStep = p.step;
            prevLane = lane;
            heads.push({ p, y, lane });
        });
        // One set of ledger lines per chord, wide enough for whichever head columns need them.
        const ledgers: any = new Map();
        heads.forEach(({ y, lane }: any = undefined) => {
            for (let ly: any = top - 12; ly >= y - 1; ly -= 12)
                ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
            for (let ly: any = top + 60; ly <= y + 1; ly += 12)
                ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
        });
        ledgers.forEach((lane: any = undefined, ly: any = undefined) => { body += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9 + lane * 13}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`; });
        heads.forEach(({ p, y, lane }: any = undefined) => {
            let accidental: any = '';
            if (p.acc) {
                let a: any = accLanes.findIndex((last: any = undefined) => Math.abs(last - y) >= 24);
                if (a < 0)
                    a = accLanes.length;
                accLanes[a] = y;
                accidental = p.acc === '#' ? ssSharp(x - 20 - a * 11, y) : ssFlat(x - 20 - a * 11, y);
            }
            body += `<g class="ss-n" data-midi="${p.m}" data-clef="${clef}"><title>${noteName(p.m, flat)}</title>${accidental}${ssNotehead(x + lane * 13, y, 4)}</g>`;
        });
        // Listed far notes shrink rather than spill into the other staff; 7px a character overestimates 11px text.
        [['up', '↑', 14], ['down', '↓', H - 6]].forEach(([k, arrow, y]: any = undefined) => {
            if (!far[k].length)
                return;
            const s: any = `${arrow} ${far[k].join(' ')}`, max: any = x1 - x0 - 16, est: any = s.length * 7, w: any = Math.min(est, max), cx: any = Math.min(Math.max(x, x0 + 8 + w / 2), x1 - 8 - w / 2);
            body += `<text class="ss-syl ex-far" x="${cx}" y="${y}"${est > max ? ` style="font-size:${(11 * max / est).toFixed(1)}px"` : ''}>${s}</text>`;
        });
        body += '</g>';
    });
    if (!pitches.length)
        body += `<text class="ss-syl" x="${W / 2}" y="${top + 88}">${t('ex_staff_empty')}</text>`;
    const label: any = t('ex_staff_label') + (midis.length ? ': ' + midis.map((m: any = undefined) => noteName(m, flat)).join(', ') : '');
    wrap.setAttribute('aria-label', label);
    wrap.innerHTML = `<svg class="ss-svg" role="img" aria-label="${label}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:100%; height:auto; max-width:700px; margin:auto" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
function fillRoots(sel: any = undefined, withAll: any = undefined): any { sel.innerHTML = ''; if (withAll) {
    const o: any = (document as any).createElement('option');
    o.value = 'all';
    o.textContent = t('all_keys');
    sel.appendChild(o);
} NOTE_SYS[notation].root.forEach((n: any = undefined, i: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = i; o.textContent = n; sel.appendChild(o); }); }
function fillKeyCtx(): any { const sel: any = $('keyCtx'); sel.innerHTML = '<option value="-1">' + t('none_ctx') + '</option>'; NOTE_SYS[notation].root.forEach((n: any = undefined, i: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = i; o.textContent = t('key_major', n); sel.appendChild(o); }); }
function fillRefNames(): any {
    const rt: any = $('refType').value, sel: any = $('refName');
    sel.innerHTML = '';
    if (rt === 'chord') {
        CHORDS.forEach((c: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = c.symbol; o.textContent = c.symbol; sel.appendChild(o); });
    }
    else {
        Object.keys(SCALES).forEach((n: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = n; o.textContent = scaleDisp(n); sel.appendChild(o); });
    }
}
function refMidis(): any { const root: any = 60 + parseInt($('refRoot').value, 10); if ($('refType').value === 'chord') {
    const c: any = CHORDS.find((x: any = undefined) => x.symbol === $('refName').value);
    return c.intervals.map((i: any = undefined) => root + i);
} return SCALES[$('refName').value].concat([12]).map((i: any = undefined) => root + i); }
function updateExplore(): any {
    if (view0() !== 'explore')
        return;
    const notes: any = (held.size ? heldMidis() : explorePreview).slice().sort((a: any = undefined, b: any = undefined) => a - b);
    const keyCtx: any = parseInt($('keyCtx').value, 10);
    let nameLabel: any = '—', roman: any = '—', spell: any = notes.length ? isFlatKey(pc(notes[0])) : false;
    let degrees: any = null;
    if (notes.length >= 3) {
        const id: any = identifyChord(notes);
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
    $('ro-notes').textContent = notes.length ? notes.map((m: any = undefined) => noteName(m, spell)).join('  ') : '—';
    $('ro-name').textContent = nameLabel;
    $('ro-roman').textContent = roman;
    drawExploreStaff(notes, spell);
    cofNow(notes);
}
/* ---------- CIRCLE OF FIFTHS (Explore › Circle tab) ---------- */
// Standard one-octave fingerings, ascending, indexed by the tonic's pitch class (C=0 … B=11).
// Sources: pianoscales.org (major, natural & harmonic minor). Melodic minor (ascending) follows the harmonic
// fingering, except C♯/F♯/G♯ where the raised 6th/7th moves the thumb off a black key (ABRSM-style).
const COF_FING: any = {
    maj: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23412312', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '32143213', '54321321', '54321321', '43213214', '54321321', '32143213', '54321321', '32143213', '43214321'] },
    natural: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132132', '54321321', '21321432', '43214321'] },
    harmonic: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '23123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
    melodic: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23123412', '12312345', '34123123', '12312345', '21231234', '12312345'],
        lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
};
const COF_MAJ: any = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'], COF_MIN: any = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D'];
const COF_COL: any = ['#e8c160', '#ecae4c', '#e79443', '#df7a3b', '#d2623a', '#bd4834', null, '#355895', '#3b6fa2', '#3f86a6', '#4b9ea6', '#62b3a6'];
const COF_SCALE: any = { natural: 'Aeolian (Natural minor)', harmonic: 'Harmonic minor', melodic: 'Melodic minor' };
const cof: any = { i: 0, minor: false, mode: 'scale', flavor: 'natural', picked: false };
let exTabCur: any = 'free';
const COF_SOL: any = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
function cofSpell(letter: any = undefined, acc: any = undefined): any { return spelledName(notation, 'CDEFGAB'.indexOf(letter), acc); }
function cofParse(s: any = undefined): any { return { L: s[0], acc: s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0 }; }
function cofName(s: any = undefined): any { const p: any = cofParse(s); return cofSpell(p.L, p.acc); }
// Spell each degree with consecutive letter names so keys read correctly (e.g. G harmonic minor → F♯, D♯ minor → C𝄪).
function cofSpellDegrees(tonic: any = undefined, offs: any = undefined, degs: any = undefined): any {
    const LET: any = 'CDEFGAB', NAT: any = [0, 2, 4, 5, 7, 9, 11], p: any = cofParse(tonic), li: any = LET.indexOf(p.L), tp: any = NAT[li] + p.acc;
    return offs.map((o: any = undefined, k: any = undefined) => { const L: any = (li + degs[k]) % 7, d: any = ((tp + o - NAT[L]) % 12 + 12) % 12; return cofSpell(LET[L], d > 6 ? d - 12 : d); });
}
function cofTonicPc(): any { return cof.minor ? (CIRCLE[cof.i] + 9) % 12 : CIRCLE[cof.i]; }
function cofKeyLabel(i: any = undefined, minor: any = undefined): any { if (i === 6)
    return minor ? cofName('D#') + ' / ' + cofName('Eb') : cofName('F#') + ' / ' + cofName('Gb'); return cofName(minor ? COF_MIN[i] : COF_MAJ[i]); }
function cofSigList(i: any = undefined): any { const sh: any = 'FCGDAEB', fl: any = 'BEADGCF'; if (i === 0)
    return { n: 0, list: '' }; if (i <= 6)
    return { n: i, sharp: true, list: [...sh.slice(0, i)].map((L: any = undefined) => cofSpell(L, 1)).join(', ') }; const n: any = 12 - i; return { n, sharp: false, list: [...fl.slice(0, n)].map((L: any = undefined) => cofSpell(L, -1)).join(', ') }; }
function cofData(): any {
    const tp: any = cofTonicPc(), tonic: any = (cof.minor ? COF_MIN : COF_MAJ)[cof.i], root: any = 60 + tp;
    if (cof.mode === 'chord') {
        const offs: any = [0, cof.minor ? 3 : 4, 7];
        return { midis: offs.map((o: any = undefined) => root + o), names: cofSpellDegrees(tonic, offs, [0, 2, 4]), rh: [1, 3, 5], lh: [5, 3, 1] };
    }
    const tbl: any = cof.minor ? COF_FING[cof.flavor] : COF_FING.maj, offs: any = (cof.minor ? SCALES[COF_SCALE[cof.flavor]] : SCALES['Major (Ionian)']).concat([12]);
    return { midis: offs.map((o: any = undefined) => root + o), names: cofSpellDegrees(tonic, offs, [0, 1, 2, 3, 4, 5, 6, 7]), rh: [...tbl.rh[tp]].map(Number), lh: [...tbl.lh[tp]].map(Number) };
}
function cofPt(r: any = undefined, deg: any = undefined): any { const a: any = (deg - 90) * Math.PI / 180; return [(350 + r * Math.cos(a)).toFixed(2), (350 + r * Math.sin(a)).toFixed(2)]; }
function cofSector(r0: any = undefined, r1: any = undefined, d0: any = undefined, d1: any = undefined): any { const a: any = cofPt(r1, d0), b: any = cofPt(r1, d1), c: any = cofPt(r0, d1), d: any = cofPt(r0, d0); return 'M' + a + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + b + 'L' + c + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + d + 'Z'; }
function cofTint(i: any = undefined, pct: any = undefined): any { return 'fill:color-mix(in srgb, ' + (COF_COL[i] || '#6d4f7a') + ' ' + pct + '%, var(--card))'; }
function cofText(x: any = undefined, y: any = undefined, cls: any = undefined, lines: any = undefined, lh: any = undefined): any { return '<text class="' + cls + '" x="' + x + '" y="' + y + '">' + lines.map((s: any = undefined, k: any = undefined) => '<tspan x="' + x + '" dy="' + (k ? lh : -(lines.length - 1) * lh / 2) + '">' + s.replace(/([♯♭𝄪𝄫])/gu, '<tspan class="cof-g">$1</tspan>') + '</tspan>').join('') + '</text>'; }
const cofMQ: any = (window as any).matchMedia ? (matchMedia as any)('(max-width:560px)') : null;
if (cofMQ)
    (cofMQ.addEventListener ? cofMQ.addEventListener('change', () => renderCircle()) : cofMQ.addListener(() => renderCircle()));
function renderCircle(): any {
    const box: any = $('circle');
    if (!box)
        return;
    const compact: any = !!(cofMQ && cofMQ.matches);
    let s: any = '<svg class="cof-svg" viewBox="' + (compact ? '92 92 516 516' : '-12 -12 724 724') + '" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="' + t('aria_circle') + '"><defs>' +
        '<linearGradient id="cofSplit" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="400" y2="0"><stop offset="0" stop-color="#314e8c"/><stop offset=".5" stop-color="#314e8c"/><stop offset=".5" stop-color="#a8392f"/><stop offset="1" stop-color="#a8392f"/></linearGradient>' +
        '<marker id="cofAhUp" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#c96b3f"/></marker>' +
        '<marker id="cofAhDn" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#4a7fb0"/></marker>' +
        '<path id="cofArcS" d="M' + cofPt(334, 18) + 'A334 334 0 0 1 ' + cofPt(334, 72) + '"/><path id="cofArcF" d="M' + cofPt(334, 288) + 'A334 334 0 0 1 ' + cofPt(334, 342) + '"/></defs>';
    if (!compact)
        s += '<text class="cof-arc sharp"><textPath href="#cofArcS" startOffset="50%" text-anchor="middle">' + t('cof_sharps') + ' ♯</textPath></text>';
    if (!compact)
        s += '<text class="cof-arc flat"><textPath href="#cofArcF" startOffset="50%" text-anchor="middle">♭ ' + t('cof_flats') + '</textPath></text>';
    let maj: any = '', min: any = '', acc: any = '';
    CIRCLE.forEach((p: any = undefined, i: any = undefined) => {
        const d0: any = i * 30 - 15, d1: any = i * 30 + 15, sig: any = cofSigList(i), light: any = i <= 4 || i >= 10;
        const fill: any = i === 6 ? 'fill:url(#cofSplit)' : 'fill:' + COF_COL[i], txt: any = light ? '#1a1714' : '#fffaf2';
        const [mx, my] = cofPt(215, i * 30), [cx, cy] = cofPt(163, i * 30), [nx, ny] = cofPt(125, i * 30);
        const majL: any = i === 6 ? [cofName('F#'), cofName('Gb')] : [cofName(COF_MAJ[i])], minL: any = i === 6 ? [cofName('D#') + 'm', cofName('Eb') + 'm'] : [cofName(COF_MIN[i]) + 'm'];
        const cnt: any = i === 0 ? '0' : i < 6 ? i + '♯' : i === 6 ? '6♯ 6♭' : (12 - i) + '♭';
        maj += '<g class="cof-k" data-i="' + i + '" data-ring="maj" tabindex="0" role="button" aria-pressed="false" aria-label="' + t('cof_aria_maj', cofKeyLabel(i, false)) + (sig.n ? ', ' + sig.n + (sig.sharp ? '♯' : '♭') : '') + '">' +
            '<path class="cof-w" d="' + cofSector(176, 254, d0, d1) + '" style="' + fill + '"/><path class="cof-w" d="' + cofSector(150, 176, d0, d1) + '" style="' + cofTint(i, 44) + '"/>' +
            cofText(mx, my, 'cof-maj' + (i === 6 ? ' sm' : ''), majL, 28).replace('<text ', '<text style="fill:' + txt + '" ') +
            '<text class="cof-cnt" x="' + cx + '" y="' + cy + '">' + cnt + '</text></g>';
        min += '<g class="cof-k" data-i="' + i + '" data-ring="min" tabindex="0" role="button" aria-pressed="false" aria-label="' + t('cof_aria_min', cofKeyLabel(i, true)) + '">' +
            '<path class="cof-w" d="' + cofSector(100, 150, d0, d1) + '" style="' + cofTint(i, 24) + '"/>' + cofText(nx, ny, 'cof-min' + (i === 6 ? ' sm' : ''), minL, 17) + '</g>';
        if (sig.n && !compact) {
            const items: any = sig.list.split(', '), lines: any = [];
            for (let k: any = 0; k < items.length; k += 3)
                lines.push(items.slice(k, k + 3).join(' '));
            const a: any = i * 30, sx: any = Math.sin(a * Math.PI / 180), side: any = Math.abs(sx) > .35, [ax, ay] = cofPt(side ? 268 : 280, a);
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
    box.querySelectorAll('.cof-k').forEach((g: any = undefined) => {
        const pick: any = () => cofPick(+g.dataset.i, g.dataset.ring === 'min');
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e: any = undefined) => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            pick();
        } });
    });
    cofSel();
    cofInfo();
}
function cofSel(): any {
    const svg: any = (document as any).querySelector('#circle .cof-svg');
    if (!svg)
        return;
    svg.classList.toggle('has-sel', cof.picked);
    svg.querySelectorAll('.cof-k').forEach((g: any = undefined) => {
        const i: any = +g.dataset.i, mn: any = g.dataset.ring === 'min', on: any = i === cof.i && mn === cof.minor;
        g.classList.toggle('on', on);
        g.classList.toggle('rel', i === cof.i && !on);
        g.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const d0: any = cof.i * 30 - 15, d1: any = cof.i * 30 + 15, majD: any = cofSector(150, 254, d0, d1), minD: any = cofSector(100, 150, d0, d1);
    $('cof-sel').setAttribute('d', cof.minor ? minD : majD);
    $('cof-rel').setAttribute('d', cof.minor ? majD : minD);
}
// Keeps the circle in step with the "Key context" select from the Free-play tab (always a major key there).
function circleSel(): any { const k: any = parseInt($('keyCtx').value, 10); if (k >= 0) {
    cof.i = CIRCLE.indexOf(k);
    cof.minor = false;
    cof.picked = true;
} cofSel(); cofInfo(); cofPaintDock(); }
function cofPick(i: any = undefined, minor: any = undefined): any {
    cof.i = i;
    cof.minor = minor;
    cof.picked = true;
    $('keyCtx').value = CIRCLE[i];
    cofSyncRef();
    cofSel();
    cofInfo();
    cofPaintDock();
    cofRevealFingering();
    cofPlay();
}
function cofRevealFingering(): any {
    requestAnimationFrame(() => {
        const fing: any = (document as any).querySelector('#exp-circle .cof-fing');
        if (!fing || $('exp-circle').hidden)
            return;
        const dock: any = document.body.classList.contains('kb') ? $('dock') : null, dockH: any = dock ? dock.getBoundingClientRect().height : 0;
        const header: any = (document as any).querySelector('header'), top: any = (header ? header.getBoundingClientRect().bottom : 0) + 16, bottom: any = window.innerHeight - dockH - 24;
        const rect: any = fing.getBoundingClientRect(), available: any = Math.max(0, bottom - top);
        const delta: any = rect.height > available || rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
        if (Math.abs(delta) > 1)
            window.scrollBy({ top: delta, behavior: (matchMedia as any)('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
}
function cofSyncRef(): any {
    $('refType').value = cof.mode;
    fillRefNames();
    $('refRoot').value = cofTonicPc();
    $('refName').value = cof.mode === 'chord' ? (cof.minor ? 'm' : 'maj') : (cof.minor ? COF_SCALE[cof.flavor] : 'Major (Ionian)');
}
function cofPlay(): any {
    const tp: any = cofTonicPc(), d: any = cofData();
    if (cof.mode === 'chord')
        playChordMidis(d.midis, true);
    else
        playScaleNotes(60 + tp, (cof.minor ? SCALES[COF_SCALE[cof.flavor]] : SCALES['Major (Ionian)']), true);
}
function cofInfo(): any {
    if (!$('cof-key'))
        return;
    const i: any = cof.i, sig: any = cofSigList(i), rel: any = cofKeyLabel(i, !cof.minor);
    $('cof-key').textContent = t(cof.minor ? 'key_minor' : 'key_major', cofKeyLabel(i, cof.minor));
    const sigTxt: any = (g: any = undefined) => g.n ? t(g.sharp ? 'cof_sig_s' : 'cof_sig_f', String(g.n), '<b>' + g.list + '</b>') : t('cof_sig0');
    const fl6: any = { n: 6, sharp: false, list: [...'BEADGC'].map((L: any = undefined) => cofSpell(L, -1)).join(', ') };
    $('cof-sig').innerHTML = sigTxt(sig) + (i === 6 ? ' / ' + sigTxt(fl6) : '') + ' · ' + t(cof.minor ? 'cof_rel_maj' : 'cof_rel_min', t(cof.minor ? 'key_major' : 'key_minor', rel));
    (document as any).querySelectorAll('#cof-mode button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === cof.mode ? 'true' : 'false'));
    (document as any).querySelectorAll('#cof-flavor button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === cof.flavor ? 'true' : 'false'));
    $('cof-flavor').hidden = !(cof.minor && cof.mode === 'scale');
    const ch: any = cof.mode === 'chord';
    $('cof-fing-t').textContent = t(ch ? 'cof_fing_chord' : 'cof_fing_scale');
    $('cof-fing-s').textContent = '· ' + t(ch ? 'cof_fing_chord_s' : 'cof_fing_scale_s');
    $('cof-note').textContent = t(ch ? 'cof_note_chord' : 'cof_note_scale') + (!ch && cof.minor && cof.flavor === 'melodic' ? ' ' + t('cof_note_mel') : '');
    cofDiagram();
}
function cofDiagram(): any {
    const box: any = $('cof-kb');
    if (!box)
        return;
    const d: any = cofData(), WHITE: any = [0, 2, 4, 5, 7, 9, 11], isW: any = (m: any = undefined) => WHITE.includes(pc(m));
    let lo: any = d.midis[0], hi: any = d.midis[d.midis.length - 1];
    if (!isW(lo))
        lo--;
    if (!isW(hi))
        hi++;
    const WW: any = 44, WH: any = 124, BW: any = 26, BH: any = 78, X0: any = 34, TOP: any = 58, whites: any = [];
    for (let m: any = lo; m <= hi; m++)
        if (isW(m))
            whites.push(m);
    const W: any = X0 + whites.length * WW + 4, H: any = TOP + WH + 60, xOf: any = (m: any = undefined) => isW(m) ? X0 + whites.indexOf(m) * WW + WW / 2 : X0 + whites.indexOf(m + 1) * WW;
    const idx: any = new Map(d.midis.map((m: any = undefined, k: any = undefined) => [m, k]));
    let s: any = '<svg class="cof-kb" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t('cof_kb_aria', t('cof_rh_s') + ': ' + d.names.map((n: any = undefined, k: any = undefined) => n + ' ' + d.rh[k]).join(', ') + ' · ' + t('cof_lh_s') + ': ' + d.names.map((n: any = undefined, k: any = undefined) => n + ' ' + d.lh[k]).join(', ')) + '">';
    s += '<text class="ck-hand" x="2" y="32">' + t('cof_rh_s') + '</text><text class="ck-hand" x="2" y="' + (TOP + WH + 36) + '">' + t('cof_lh_s') + '</text>';
    whites.forEach((m: any = undefined, k: any = undefined) => {
        const on: any = idx.has(m);
        s += '<rect class="ck-w' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (X0 + k * WW) + '" y="' + TOP + '" width="' + WW + '" height="' + WH + '" rx="5"/>';
        if (on)
            s += '<text class="ck-n" x="' + (X0 + k * WW + WW / 2) + '" y="' + (TOP + WH - 12) + '">' + d.names[idx.get(m)] + '</text>';
    });
    for (let m: any = lo; m <= hi; m++) {
        if (isW(m))
            continue;
        const on: any = idx.has(m), x: any = xOf(m);
        s += '<rect class="ck-b' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (x - BW / 2) + '" y="' + TOP + '" width="' + BW + '" height="' + BH + '" rx="3"/>';
        if (on)
            s += '<text class="ck-n b" x="' + x + '" y="' + (TOP + BH - 11) + '" style="font-size:9.5px">' + d.names[idx.get(m)] + '</text>';
    }
    const badge: any = (cls: any = undefined, x: any = undefined, y: any = undefined, n: any = undefined) => '<g class="ck-f ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="11"/><text x="' + x + '" y="' + y + '">' + n + '</text></g>';
    d.midis.forEach((m: any = undefined, k: any = undefined) => { const x: any = xOf(m), w: any = isW(m); s += badge('rh', x, w ? 40 : 14, d.rh[k]) + badge('lh', x, w ? TOP + WH + 18 : TOP + WH + 44, d.lh[k]); });
    box.innerHTML = s + '</svg>';
}
function cofNow(notes: any = undefined): any { const box: any = $('cof-kb'); if (!box)
    return; const set: any = new Set(notes); box.querySelectorAll('[data-m]').forEach((r: any = undefined) => r.classList.toggle('now', set.has(+r.dataset.m))); }
function cofPaintDock(): any { if (view0() !== 'explore')
    return; kbClear('target'); if (exTabCur !== 'circle')
    return; cofData().midis.forEach((m: any = undefined) => kbState(m, 'target', true)); }
function exTab(tab: any = undefined, focus: any = undefined): any {
    exTabCur = tab === 'circle' ? 'circle' : 'free';
    (document as any).querySelectorAll('#ex-tabs [role="tab"]').forEach((b: any = undefined) => { const on: any = b.dataset.tab === exTabCur; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus)
        b.focus(); });
    $('exp-free').hidden = exTabCur !== 'free';
    $('exp-circle').hidden = exTabCur !== 'circle';
    cofPaintDock();
}
function initExploreTabs(): any {
    const tl: any = $('ex-tabs');
    if (!tl)
        return;
    tl.addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('[role="tab"]'); if (b)
        exTab(b.dataset.tab); });
    tl.addEventListener('keydown', (e: any = undefined) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')
            return;
        e.preventDefault();
        exTab(e.key === 'Home' ? 'free' : e.key === 'End' ? 'circle' : exTabCur === 'free' ? 'circle' : 'free', true);
    });
    $('cof-mode').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b || b.dataset.v === cof.mode)
        return; cof.mode = b.dataset.v; cofSyncRef(); cofInfo(); cofPaintDock(); cofPlay(); });
    $('cof-flavor').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b || b.dataset.v === cof.flavor)
        return; cof.flavor = b.dataset.v; cofSyncRef(); cofInfo(); cofPaintDock(); cofPlay(); });
    $('cof-play').addEventListener('click', () => { if (!cof.picked) {
        cof.picked = true;
        cofSel();
    } cofSyncRef(); cofPlay(); });
}
/* ---------- SONGS ---------- */
let songDir: any = 'asc';
function renderSongs(): any {
    const box: any = $('songsList');
    if (!box)
        return;
    box.innerHTML = '';
    const root: any = 60 + parseInt($('song-root').value || '0', 10);
    for (let semi: any = 1; semi <= 12; semi++) {
        const iv: any = INTERVALS.find((i: any = undefined) => i.semi === semi), list: any = songsFor(semi, songDir);
        const card: any = (document as any).createElement('div');
        card.className = 'songcard';
        card.dataset.semi = semi;
        if (SQ.answered && SQ.started && SQ.semi === semi)
            card.dataset.hl = 'true';
        card.innerHTML = '<div class="hd"><b>' + ivName(semi) + '</b><span class="sh">' + iv.short + '</span></div>';
        const play: any = (document as any).createElement('button');
        play.type = 'button';
        play.className = 'play';
        play.textContent = t('ex_hear');
        play.setAttribute('aria-label', t('ex_hear') + ' — ' + ivName(semi));
        play.onclick = () => playIvDir(root, semi, songDir);
        card.querySelector('.hd').appendChild(play);
        const ul: any = (document as any).createElement('div');
        ul.className = 'songlist';
        list.forEach((s: any = undefined) => { const b: any = (document as any).createElement('button'); b.type = 'button'; b.textContent = s; if (/^\(/.test(s))
            b.style.opacity = '.6'; b.onclick = () => playIvDir(root, semi, songDir); ul.appendChild(b); });
        card.appendChild(ul);
        box.appendChild(card);
    }
    sqRender();
}
/* interval ear check: a random interval in the chosen direction, answered from the 12 names */
const SQ: any = { started: false, answered: true, semi: 0, root: 60, dir: 'asc', pick: 0, right: 0, total: 0 };
function sqPlay(): any { ensureAudio(); playIvDir(SQ.root, SQ.semi, SQ.dir); }
function sqNew(): any {
    SQ.started = true;
    SQ.answered = false;
    SQ.pick = 0;
    SQ.semi = 1 + Math.floor(Math.random() * 12);
    SQ.root = 55 + Math.floor(Math.random() * 10);
    SQ.dir = songDir;
    (document as any).querySelectorAll('#songsList .songcard').forEach((c: any = undefined) => c.removeAttribute('data-hl'));
    $('sq-verdict').textContent = '';
    $('sq-verdict').className = 'verdict';
    sqRender();
    sqPlay();
    const f: any = $('sq-ans').querySelector('button');
    if (f)
        f.focus();
}
function sqRender(): any {
    const a: any = $('sq-ans');
    if (!a)
        return;
    a.hidden = !SQ.started;
    $('sq-again').hidden = !SQ.started;
    $('sq-go').textContent = t(SQ.started ? 'sq_next' : 'sq_start');
    $('sq-score').textContent = SQ.total ? t('sq_score', SQ.right, SQ.total) : '';
    if (!SQ.started)
        return;
    a.innerHTML = '';
    for (let n: any = 1; n <= 12; n++) {
        const b: any = (document as any).createElement('button');
        b.type = 'button';
        b.textContent = ivName(n);
        b.dataset.semi = n;
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
function sqAnswer(n: any = undefined): any {
    if (SQ.answered || !SQ.started)
        return;
    SQ.answered = true;
    SQ.pick = n;
    SQ.total++;
    const ok: any = n === SQ.semi;
    if (ok)
        SQ.right++;
    const hook: any = songsFor(SQ.semi, SQ.dir).find((x: any = undefined) => !/^\(/.test(x)), v: any = $('sq-verdict');
    v.className = 'verdict ' + (ok ? 'good' : 'bad');
    v.textContent = t(ok ? 'sq_good' : 'sq_bad', ivName(SQ.semi)) + (hook ? ' ' + t('sq_hook', hook) : '');
    if (data.earDay !== todayN()) {
        data.earDay = todayN();
        data.earToday = 0;
    }
    if (ok)
        data.earToday = (data.earToday || 0) + 1;
    saveAll();
    const card: any = (document as any).querySelector('#songsList .songcard[data-semi="' + SQ.semi + '"]');
    if (card)
        card.dataset.hl = 'true';
    sqRender();
    $('sq-go').focus();
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
const LT: any = (a: any = undefined) => Array.isArray(a) ? (lang === 'ro' ? a[1] : a[0]) : a;
const LEARN_OLD_ORDER: any = ['keys', 'iv', 'sc', 'ch', 'cof', 'pr', 'rh', 'notation', 'dyn', 'modes', 'how'];
const LEARN_GAPS: any = [3, 7, 16, 35, 90];
let learnSel: any = 0, LGEN: any = 0, LQ: any = null, learnGloss: any = false;
function learnTitle(L: any = undefined): any { return (L[lang] && L[lang].t) || L.en.t; }
function learnData(): any {
    if (!data.learnDone || typeof data.learnDone !== 'object')
        data.learnDone = {};
    if (!data.learnRev || typeof data.learnRev !== 'object') {
        data.learnRev = {};
        Object.keys(data.learnDone).forEach((id: any = undefined) => { data.learnRev[id] = { last: data.learnDone[id], n: 0 }; });
    }
    if (!data.learnUnlock || typeof data.learnUnlock !== 'object')
        data.learnUnlock = {};
    return data;
}
function learnUnitOf(id: any = undefined): any { return LEARN_UNITS.findIndex((u: any = undefined) => u.ls.includes(id)); }
function learnUnitDone(i: any = undefined): any { const u: any = LEARN_UNITS[i], d: any = learnData().learnDone; return u ? u.ls.filter((id: any = undefined) => d[id]).length : 0; }
function learnUnitOpen(i: any = undefined): any {
    if (i <= 0)
        return true;
    const u: any = LEARN_UNITS[i], D: any = learnData();
    if (!u)
        return true;
    if (D.learnUnlock[u.id] || u.ls.some((id: any = undefined) => D.learnDone[id]))
        return true;
    const p: any = LEARN_UNITS[i - 1];
    return learnUnitOpen(i - 1) && p.ls.every((id: any = undefined) => D.learnDone[id]);
}
function learnLessonOpen(L: any = undefined): any { return learnUnitOpen(learnUnitOf(L.id)); }
function learnGap(id: any = undefined): any { const r: any = learnData().learnRev[id]; return LEARN_GAPS[Math.min(r ? (r.n | 0) : 0, LEARN_GAPS.length - 1)]; }
function learnDueDays(id: any = undefined): any {
    const D: any = learnData();
    if (!D.learnDone[id])
        return null;
    const r: any = D.learnRev[id] || { last: D.learnDone[id], n: 0 };
    const age: any = todayN() - (r.last | 0);
    return age >= learnGap(id) ? age : null;
}
function learnDueList(): any { return LESSONS.filter((L: any = undefined) => learnDueDays(L.id) != null).sort((a: any = undefined, b: any = undefined) => learnDueDays(b.id) - learnDueDays(a.id)); }
function learnComplete(L: any = undefined, score: any = undefined): any {
    const D: any = learnData(), tn: any = todayN(), was: any = D.learnDone[L.id], due: any = learnDueDays(L.id) != null;
    const r: any = D.learnRev[L.id] || (D.learnRev[L.id] = { last: tn, n: 0 });
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
function learnMark(read: any = undefined): any {
    const L: any = LESSONS[learnSel], D: any = learnData();
    if (read)
        learnComplete(L, null);
    else {
        delete D.learnDone[L.id];
        delete D.learnRev[L.id];
    }
    saveAll();
}
function learnInitSel(): any {
    if (renderLearn._init)
        return;
    renderLearn._init = true;
    const D: any = learnData();
    let id: any = D.learnSelId;
    if (!id && Number.isInteger(D.learnSel))
        id = LEARN_OLD_ORDER[D.learnSel];
    const i: any = LESSONS.findIndex((L: any = undefined) => L.id === id);
    learnSel = i >= 0 ? i : 0;
}
function learnGo(i: any = undefined): any {
    learnSel = Math.max(0, Math.min(LESSONS.length - 1, i));
    learnData().learnSelId = LESSONS[learnSel].id;
    data.learnSel = learnSel;
    renderLearn._init = true;
    learnGloss = false;
    LQ = null;
    saveAll();
    renderLearn();
    const g: any = (document as any).querySelector('#view-learn .learn-grid');
    if (g && g.getBoundingClientRect().top < 70)
        g.scrollIntoView({ block: 'start' });
    const h: any = $('learnBody').querySelector('h3');
    if (h) {
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
    }
}
function learnGoId(id: any = undefined): any { const i: any = LESSONS.findIndex((L: any = undefined) => L.id === id); if (i >= 0) {
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
function learnSay(msg: any = undefined): any { const l: any = $('learnLive'); if (!l)
    return; l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 30); }
function learnHalt(): any {
    LGEN++;
    stopPreviews();
    kbClear('target');
    lmStop();
    (document as any).querySelectorAll('#learnBody [data-s="now"]').forEach((e: any = undefined) => delete e.dataset.s);
    (document as any).querySelectorAll('#learnBody .lbars .on, #learnBody .lbeat .on').forEach((e: any = undefined) => e.classList.remove('on'));
    (document as any).querySelectorAll('#learnBody [data-lplay][aria-pressed="true"]').forEach((b: any = undefined) => { b.setAttribute('aria-pressed', 'false'); b.textContent = t('lu_play_ex'); });
}
function learnTimer(fn: any = undefined, ms: any = undefined): any { const g: any = LGEN; setTimeout(() => { if (g !== LGEN || view0() !== 'learn')
    return; fn(); }, ms); }
function learnLight(ms: any = undefined, dur: any = undefined): any {
    const g: any = LGEN;
    kbClear('target');
    ms.forEach((m: any = undefined) => kbState(m, 'target', true));
    clearTimeout((learnLight as any)._t);
    (learnLight as any)._t = setTimeout(() => { if (g === LGEN)
        kbClear('target'); }, dur);
}
function learnPlanItems(tn: any = undefined): any {
    const D: any = learnData(), ld: any = D.learnDone;
    const nextL: any = LESSONS.find((L: any = undefined) => !ld[L.id] && learnLessonOpen(L)), learnToday: any = Object.keys(ld).some((k: any = undefined) => ld[k] === tn);
    const out: any = [{ id: 'learn', done: learnToday || !nextL, t: t('plan_learn'), d: nextL ? t('plan_learn_d', learnTitle(nextL)) : t('plan_learn_all'),
            go: () => { if (nextL)
                learnGoId(nextL.id);
            else
                show('learn'); } }];
    const due: any = learnDueList();
    if (due.length) {
        const L: any = due[0];
        out.push({ id: 'learnrev', done: false, t: t('plan_lrev'),
            d: t('plan_lrev_d', learnTitle(L), learnDueDays(L.id)) + (due.length > 1 ? t('plan_lrev_more', due.length - 1) : ''), go: () => learnGoId(L.id) });
    }
    else if (Object.keys(D.learnRev).some((k: any = undefined) => D.learnRev[k].rv === tn))
        out.push({ id: 'learnrev', done: true, t: t('plan_lrev'), d: t('plan_lrev_done'), go: () => show('learn') });
    return out;
}
/* quiz: o = options (first listed = correct unless a is given); hear = demo spec; pcs = play these pitch classes (any octave, any order); seq = play these pitch classes in order */
/* cheat sheets: rows of [label, value]; each may be a string or [en,ro] */
/* staff excerpts: compact note strings "C4q E4+G4h Rq" (w h q e s, d=dotted, t=triplet eighth) */
const LDUR: any = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, dh: 3, dq: 1.5, de: 0.75 };
function LP(s: any = undefined): any { return s.trim().split(/\s+/).filter((x: any = undefined) => x !== '|').map((tok: any = undefined) => { const m: any = tok.match(/^(.+?)(d?[whqest])$/); const d: any = LDUR[m[2]]; const p: any = m[1].split('+'); return [p[0] === 'R' ? 'R' : (p.length > 1 ? p : p[0]), d]; }); }
const LSTAVES: any = {
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
const LSR: any = {};
function lStaffSvg(key: any = undefined): any {
    const S: any = LSTAVES[key];
    const P: any = Object.assign({ noNames: true }, S.p);
    const r: any = srRender(P);
    LSR[key] = r;
    const lhTop: any = P.rh ? 150 : 46, botY: any = (P.lh ? lhTop : 46) + 48, dynY: any = 124, rnY: any = botY + 24;
    const top: any = (h: any = undefined) => h === 'lh' ? lhTop : 46;
    const bx: any = (b: any = undefined) => { const pts: any = r.beatX; for (let i: any = 0; i < pts.length - 1; i++) {
        if (b >= pts[i].b - 1e-3 && b <= pts[i + 1].b + 1e-3) {
            const f: any = (b - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + Math.min(1, Math.max(0, f)) * (pts[i + 1].x - pts[i].x);
        }
    } return pts[pts.length - 1].x; };
    const nAt: any = (b: any = undefined, h: any = undefined) => { const c: any = r.notes.filter((n: any = undefined) => Math.abs(n.beat - b) < 0.02 && (!h || n.hand === h)); return c.length ? c.reduce((a: any = undefined, n: any = undefined) => n.y < a.y ? n : a) : null; };
    const many: any = (b: any = undefined) => r.notes.filter((n: any = undefined) => Math.abs(n.beat - b) < 0.02).length > 1;
    const T: any = (x: any = undefined, y: any = undefined, s: any = undefined, c: any = undefined, anc: any = undefined) => '<text class="lm ' + (c || '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (anc ? ' text-anchor="' + anc + '"' : '') + '>' + s + '</text>';
    let out: any = '', needH: any = 0;
    (S.marks || []).forEach((mk: any = undefined) => {
        const k: any = mk[0], b: any = mk[1];
        if (k === 'dyn')
            out += T(bx(b) - 6, dynY, mk[2], 'lm-dyn');
        else if (k === 'cr' || k === 'dim') {
            const x1: any = bx(b), x2: any = bx(mk[2]), y: any = dynY - 5;
            out += '<path class="lm-ln" d="' + (k === 'cr' ? 'M' + x2 + ',' + (y - 5) + ' L' + x1 + ',' + y + ' L' + x2 + ',' + (y + 5) : 'M' + x1 + ',' + (y - 5) + ' L' + x2 + ',' + y + ' L' + x1 + ',' + (y + 5)) + '"/>';
        }
        else if (k === 'acc' || k === 'stac' || k === 'ten') {
            const n: any = nAt(b, mk[2]);
            if (!n)
                return;
            const up: any = !many(b) && n.y > top(n.hand) + 24, y: any = up ? n.y + 15 : n.y - 15, x: any = n.x;
            out += k === 'acc' ? '<path class="lm-ln" d="M' + (x - 5) + ',' + (y - 4) + ' L' + (x + 5) + ',' + y + ' L' + (x - 5) + ',' + (y + 4) + '"/>' : k === 'stac' ? '<circle class="lm-f" cx="' + x + '" cy="' + y + '" r="2"/>' : '<path class="lm-ln" d="M' + (x - 5) + ',' + y + ' L' + (x + 5) + ',' + y + '"/>';
        }
        else if (k === 'fer') {
            const n: any = nAt(b, mk[2]);
            if (!n)
                return;
            const y: any = Math.min(n.y - 16, top(n.hand) - 8), x: any = n.x;
            out += '<path class="lm-ln" d="M' + (x - 8) + ',' + y + ' A8,8 0 0 1 ' + (x + 8) + ',' + y + '"/><circle class="lm-f" cx="' + x + '" cy="' + (y - 2) + '" r="1.8"/>';
        }
        else if (k === 'tr') {
            const n: any = nAt(b, mk[2]);
            if (n)
                out += T(n.x - 5, Math.min(n.y - 16, top(n.hand) - 8), 'tr', 'lm-it');
        }
        else if (k === 'fing') {
            const n: any = nAt(b, mk[3]);
            if (n)
                out += T(n.x, top(n.hand) - 8, mk[2], 'lm-sm', 'middle');
        }
        else if (k === 'slur' || k === 'tie') {
            const n1: any = nAt(b, mk[3]), n2: any = nAt(mk[2], mk[3]);
            if (!n1 || !n2)
                return;
            const mid: any = top(n1.hand) + 24, below: any = n1.y > mid && n2.y > mid, s: any = below ? 1 : -1, x1: any = n1.x + (k === 'tie' ? 6 : 0), x2: any = n2.x - (k === 'tie' ? 6 : 0), y1: any = n1.y + s * (k === 'tie' ? 8 : 11), y2: any = n2.y + s * (k === 'tie' ? 8 : 11), cy: any = (below ? Math.max(y1, y2) : Math.min(y1, y2)) + s * (k === 'tie' ? 8 : 14);
            out += '<path class="lm-sl" d="M' + x1 + ',' + y1 + ' C' + (x1 + (x2 - x1) * 0.25) + ',' + cy + ' ' + (x1 + (x2 - x1) * 0.75) + ',' + cy + ' ' + x2 + ',' + y2 + '"/>';
        }
        else if (k === 'tri') {
            const x1: any = bx(b) - 4, x2: any = bx(mk[2]) + 4, y: any = 34;
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
            const y: any = P.lh ? botY + 22 : dynY;
            out += T(bx(b) - 8, y, 'Ped.', 'lm-it') + T(bx(mk[2]) + 4, y, '✱', 'lm-sm');
            if (P.lh)
                needH = Math.max(needH, y + 10);
        }
        else if (k === 'rs' || k === 're') {
            const end: any = k === 're' && b >= r.total - 1e-3, xb: any = end ? bx(r.total) : bx(b) - (b < 1e-3 ? 20 : 22), dir: any = k === 'rs' ? 1 : -1;
            out += '<rect class="lm-f" x="' + (xb - (k === 'rs' ? 0 : 3)) + '" y="46" width="3" height="' + (botY - 46) + '"/><line class="lm-ln" x1="' + (xb + dir * 6) + '" y1="46" x2="' + (xb + dir * 6) + '" y2="' + botY + '"/>';
            [46].concat(P.rh && P.lh ? [150] : []).forEach((st: any = undefined) => { out += '<circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 18) + '" r="2.2"/><circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 30) + '" r="2.2"/>'; });
        }
    });
    let svg: any = r.svg;
    if (needH)
        svg = svg.replace(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/, (m: any = undefined, w: any = undefined, h: any = undefined) => { const H: any = Math.max(+h, needH); return 'viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '"'; });
    svg = svg.replace(/<g class="ss-n" data-nid="(\d+)">/g, (m: any = undefined, id: any = undefined) => { const n: any = r.notes[+id]; return '<g class="ss-n" data-nid="' + id + '" tabindex="0" role="button" aria-label="' + t('lu_note_aria', noteName(n.midi, (P.keyN || 0) < 0), Math.floor(n.beat - (P.pickup || 0) + 1e-3) + 1) + '">'; });
    svg = svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="group" aria-label="' + LT(S.cap).replace(/"/g, '&quot;') + '"');
    return svg.replace('</svg>', out + '</svg>');
}
function lStaffHTML(key: any = undefined): any {
    const S: any = LSTAVES[key];
    if (!S)
        return '';
    return '<figure class="lstaff" data-lstaff="' + key + '"><div class="ss-wrap lstaff-svg">' + lStaffSvg(key) + '</div><figcaption><button type="button" class="btn ghost sm" data-lplay="' + key + '" aria-pressed="false">' + t('lu_play_ex') + '</button><span>' + LT(S.cap) + ' <em class="lstaff-hint">' + t('lu_staff_hint') + '</em></span></figcaption></figure>';
}
const LVEL: any = { pp: 40, p: 55, mp: 70, mf: 84, f: 100, ff: 112 };
function lVel(S: any = undefined, b: any = undefined): any {
    const M: any = S.marks || [];
    let base: any = 80, bb: any = -1;
    M.forEach((m: any = undefined) => { if (m[0] === 'dyn' && LVEL[m[2]] && m[1] <= b + 1e-3 && m[1] >= bb) {
        base = LVEL[m[2]];
        bb = m[1];
    } });
    M.forEach((m: any = undefined) => { if ((m[0] === 'cr' || m[0] === 'dim') && b >= m[1] && b <= m[2]) {
        const nx: any = M.filter((x: any = undefined) => x[0] === 'dyn' && LVEL[x[2]] && x[1] >= m[2] - 0.5).sort((a: any = undefined, c: any = undefined) => a[1] - c[1])[0];
        if (nx)
            base = base + (LVEL[nx[2]] - base) * (b - m[1]) / Math.max(0.5, nx[1] - m[1]);
    } });
    if (M.some((m: any = undefined) => m[0] === 'dyn' && m[2] === 'sfz' && Math.abs(m[1] - b) < 0.02))
        base = 118;
    if (M.some((m: any = undefined) => m[0] === 'acc' && Math.abs(m[1] - b) < 0.02))
        base = Math.min(124, base + 24);
    return Math.round(base);
}
async function lStaffPlay(key: any = undefined, btn: any = undefined) {
    const was: any = btn.getAttribute('aria-pressed') === 'true';
    learnHalt();
    if (was)
        return;
    ensureAudio();
    if (!await preparePiano())
        return;
    if (view0() !== 'learn')
        return;
    const g: any = LGEN;
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = t('lu_stop');
    const S: any = LSTAVES[key], r: any = LSR[key], spb: any = 60 / (S.bpm || 90), fig: any = btn.closest('.lstaff'), svg: any = fig.querySelector('svg'), wrap: any = fig.querySelector('.lstaff-svg');
    const M: any = S.marks || [], has: any = (k: any = undefined, b: any = undefined) => M.some((m: any = undefined) => m[0] === k && Math.abs(m[1] - b) < 0.02), ties: any = M.filter((m: any = undefined) => m[0] === 'tie');
    const cap: any = S.p.ts[1] === 8 ? S.p.ts[0] * 0.5 : S.p.ts[0], pk: any = S.p.pickup || 0, step: any = S.p.ts[1] === 8 ? 1.5 : 1;
    const t0: any = actx.currentTime + 0.15;
    let off: any = 0;
    (S.seq || [[0, r.total]]).forEach(([a, z]: any = undefined) => {
        r.notes.filter((n: any = undefined) => n.beat >= a - 1e-3 && n.beat < z - 1e-3).forEach((n: any = undefined) => {
            if (ties.some((m: any = undefined) => Math.abs(m[2] - n.beat) < 0.02 && r.notes.some((o: any = undefined) => o.midi === n.midi && Math.abs(o.beat - m[1]) < 0.02)))
                return;
            let dur: any = n.dur;
            const tie: any = ties.find((m: any = undefined) => Math.abs(m[1] - n.beat) < 0.02);
            if (tie) {
                const o: any = r.notes.find((x: any = undefined) => x.midi === n.midi && Math.abs(x.beat - tie[2]) < 0.02);
                if (o)
                    dur += o.dur;
            }
            if (has('fer', n.beat))
                dur *= 1.8;
            const snd: any = has('stac', n.beat) ? dur * 0.4 : dur * 0.95, at: any = off + n.beat - a, vel: any = lVel(S, n.beat);
            if (has('tr', n.beat)) {
                const up: any = [4, 11].includes(pc(n.midi)) ? 1 : 2, k: any = Math.max(2, Math.floor(dur / 0.125));
                for (let i: any = 0; i < k; i++)
                    previewNote(n.midi + (i % 2 ? up : 0), t0 + (at + i * dur / k) * spb, dur / k * spb, vel);
            }
            else
                previewNote(n.midi, t0 + at * spb, snd * spb, vel);
            const el: any = svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
            learnTimer(() => { if (el)
                el.dataset.s = 'now'; kbState(n.midi, 'target', true); if (wrap.scrollWidth > wrap.clientWidth + 4)
                wrap.scrollLeft = Math.max(0, n.x - wrap.clientWidth * 0.4); }, at * spb * 1000 + 150);
            learnTimer(() => { if (el)
                delete el.dataset.s; kbState(n.midi, null, true); }, (at + dur) * spb * 1000 + 120);
        });
        if (S.click) {
            for (let b: any = Math.ceil((a - pk) / step - 1e-3) * step + pk; b < z - 1e-3; b += step)
                metroClick(t0 + (off + b - a) * spb, Math.abs(((b - pk) % cap + cap) % cap) < 1e-3);
        }
        off += z - a;
    });
    learnTimer(() => { if (g !== LGEN)
        return; btn.setAttribute('aria-pressed', 'false'); btn.textContent = t('lu_play_ex'); kbClear('target'); }, off * spb * 1000 + 700);
}
async function lStaffNote(gEl: any = undefined) {
    const fig: any = gEl.closest('.lstaff');
    if (!fig)
        return;
    const key: any = fig.dataset.lstaff, n: any = LSR[key] && LSR[key].notes[+gEl.dataset.nid];
    if (!n)
        return;
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    previewNote(n.midi, actx.currentTime + 0.02, 0.9, 92);
    gEl.dataset.s = 'now';
    learnLight([n.midi], 1100);
    const g: any = LGEN;
    setTimeout(() => { if (g === LGEN)
        delete gEl.dataset.s; }, 700);
    learnSay(noteName(n.midi, (LSTAVES[key].p.keyN || 0) < 0));
}
function lqLabel(o: any = undefined): any { return LT(o); }
function lqStart(L: any = undefined): any {
    const qs: any = (LQZ[L.id] || []).map((q: any = undefined) => {
        const c: any = Object.assign({}, q);
        const locOpts: any = (q.i18n && q.i18n[lang] && q.i18n[lang].o) || null;
        if (q.o) {
            c.opts = shuffle(q.o.map((x: any = undefined, i: any = undefined) => ({ x: (locOpts && locOpts[i]) || x, ok: i === (q.a || 0) })));
        }
        c.got = [];
        c.ans = false;
        c.ok = false;
        return c;
    });
    LQ = { id: L.id, qs, i: 0, score: 0, done: false };
    lqRender();
}
function lqNeed(n: any = undefined): any { return Math.max(1, Math.round(n * 0.7)); }
function lqMidis(q: any = undefined): any { return (q.pcs || q.seq).map((p: any = undefined) => 60 + p); }
function lqRender(): any {
    const box: any = $('lq');
    if (!box)
        return;
    const L: any = LESSONS[learnSel], qz: any = LQZ[L.id] || [], D: any = learnData(), done: any = !!D.learnDone[L.id], rv: any = D.learnRev[L.id] || {};
    let h: any = '<h4 id="lq-h">✎ ' + t('lu_quiz') + '</h4>';
    if (!LQ || LQ.id !== L.id) {
        h += '<p class="lq-d">' + t('lu_quiz_d', qz.length, lqNeed(qz.length)) + '</p>';
        if (done)
            h += '<p class="lq-st">' + (learnDueDays(L.id) != null ? '<span class="lq-due">↻ ' + t('lu_due_now') + '</span>' : '<span class="read-ok">' + t('lu_complete_rev', Math.max(0, learnGap(L.id) - (todayN() - (rv.last | 0)))) + '</span>') + (rv.best != null ? ' · ' + t('lu_q_score', rv.best) : '') + '</p>';
        h += '<div class="lq-act"><button type="button" class="btn primary" data-lq="start">' + t('lu_q_start') + '</button>' + (done ? '' : '<button type="button" class="btn ghost sm" data-ln="mark">' + t('lu_mark_manual') + '</button>') + '</div>';
    }
    else if (LQ.done) {
        const n: any = LQ.qs.length, need: any = lqNeed(n), pass: any = LQ.score >= need, sc: any = LQ.score + '/' + n;
        h += '<p class="lq-res" data-r="' + (pass ? 'good' : 'bad') + '">' + (pass ? (LQ.rev ? t('lu_q_review', sc, learnGap(L.id)) : t('lu_q_pass', sc)) : t('lu_q_fail', sc, need)) + '</p>';
        h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="start">' + t('lu_q_retry') + '</button>' + (pass && learnSel < LESSONS.length - 1 ? '<button type="button" class="btn primary" data-ln="next">' + t('learn_next') + '</button>' : '') + '</div>';
    }
    else {
        const q: any = LQ.qs[LQ.i], play: any = !!(q.pcs || q.seq);
        h += '<p class="lq-n">' + t('lu_q_n', LQ.i + 1, LQ.qs.length) + '</p><p class="lq-q" id="lq-q">' + ((q.i18n && q.i18n[lang] && q.i18n[lang].q) || LT(q.q)) + '</p>';
        if (q.hear)
            h += '<p><button type="button" class="btn ghost sm demo" data-demo="' + q.hear + '">' + t('lu_q_hear') + '</button></p>';
        if (play) {
            const tot: any = (q.pcs || q.seq).length;
            h += '<p class="lq-play">🎹 ' + t('lu_q_play') + '</p><p class="lq-got" aria-hidden="true">' + Array.from({ length: tot }, (_: any = undefined, i: any = undefined) => '<i' + (i < q.got.length ? ' class="on"' : '') + '></i>').join('') + ' <span>' + t('lu_q_got', q.got.length, tot) + '</span></p>';
            if (!q.ans)
                h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="show">' + t('lu_q_show') + '</button></div>';
        }
        else
            h += '<div class="lq-opts" role="group" aria-labelledby="lq-q">' + q.opts.map((o: any = undefined, i: any = undefined) => '<button type="button" class="lq-o" data-lqo="' + i + '"' + (q.ans ? ' disabled' + (o.ok ? ' data-r="good"' : (q.pick === i ? ' data-r="bad"' : '')) : '') + '>' + lqLabel(o.x) + '</button>').join('') + '</div>';
        if (q.ans) {
            h += '<p class="lq-fb" data-r="' + (q.ok ? 'good' : 'bad') + '">' + q.fb + '</p><div class="lq-act"><button type="button" class="btn primary" data-lq="next">' + t(LQ.i < LQ.qs.length - 1 ? 'lu_q_next' : 'lu_q_finish') + '</button></div>';
        }
    }
    box.innerHTML = h;
}
function learnReveal(el: any = undefined): any {
    const d: any = $('dock'), dh: any = d && getComputedStyle(d).display !== 'none' ? d.getBoundingClientRect().height : 0, r: any = el.getBoundingClientRect(), lim: any = innerHeight - dh - 16;
    if (r.bottom > lim)
        scrollBy(0, r.bottom - lim);
    else if (r.top < 80)
        scrollBy(0, r.top - 80);
}
function lqFocus(sel: any = undefined): any { const el: any = $('lq') && $('lq').querySelector(sel); if (el) {
    el.focus({ preventScroll: true });
    learnReveal(el);
} }
function lqAnswer(ok: any = undefined, fb: any = undefined): any { const q: any = LQ.qs[LQ.i]; q.ans = true; q.ok = ok; if (ok)
    LQ.score++; q.fb = fb; lqRender(); learnSay(fb); lqFocus('[data-lq="next"]'); }
function lqPick(i: any = undefined): any {
    const q: any = LQ && LQ.qs[LQ.i];
    if (!q || q.ans || !q.opts)
        return;
    q.pick = i;
    const o: any = q.opts[i], right: any = q.opts.find((x: any = undefined) => x.ok);
    lqAnswer(o.ok, (o.ok ? t('lu_q_ok') : t('lu_q_no', lqLabel(right.x))) + ((q.i18n && q.i18n[lang] && q.i18n[lang].why) ? ' ' + q.i18n[lang].why : (q.why ? ' ' + LT(q.why) : '')));
}
function lqNext(): any {
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
    const L: any = LESSONS[learnSel], n: any = LQ.qs.length, pass: any = LQ.score >= lqNeed(n);
    if (pass) {
        const r: any = learnComplete(L, Math.round(100 * LQ.score / n));
        LQ.rev = r.review;
        learnSide();
        learnNavRender();
    }
    lqRender();
    learnSay($('lq').querySelector('.lq-res').textContent);
    lqFocus('.lq-act button');
}
function lqShow(): any {
    const q: any = LQ && LQ.qs[LQ.i];
    if (!q || q.ans)
        return;
    const ms: any = lqMidis(q);
    learnLight(ms, 4000);
    ensureAudio();
    preparePiano().then((ok: any = undefined) => { if (ok)
        ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, actx.currentTime + 0.05 + (q.seq ? i * 0.45 : 0), 0.9, 90)); });
    lqAnswer(false, t('lu_q_no', ms.map((m: any = undefined) => pcName(pc(m), false)).join(' – ')));
}
function learnInput(): any {
    const m: any = heldOrder[heldOrder.length - 1];
    if (m == null || !LQ || LQ.done)
        return;
    const q: any = LQ.qs[LQ.i];
    if (!q || q.ans || !(q.pcs || q.seq))
        return;
    const p: any = pc(m), tot: any = (q.pcs || q.seq).length;
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
        if (q.seq[q.got.length] === p)
            q.got.push(p);
        else {
            q.got = q.seq[0] === p ? [p] : [];
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
function learnRdLevel(u: any = undefined): any {
    const units: any = RD_UNITS.filter((x: any = undefined) => u.rd.includes(x.u));
    let pick: any = null;
    units.some((x: any = undefined) => x.lv.some((L: any = undefined) => { if (rdUnlocked(L) && ((rdData().lv[L.id] || {}).s || 0) < 1) {
        pick = L;
        return true;
    } return false; }));
    if (!pick) {
        const all: any = units.flatMap((x: any = undefined) => x.lv).filter(rdUnlocked);
        pick = all[all.length - 1] || (units[0] && units[0].lv[0]);
    }
    return pick;
}
function learnSide(): any {
    const toc: any = $('learnToc');
    if (!toc)
        return;
    const D: any = learnData(), done: any = D.learnDone, nDone: any = LESSONS.filter((L: any = undefined) => done[L.id]).length;
    $('learnMeta').textContent = t('learn_read_n', nDone, LESSONS.length);
    $('learnProg').style.width = Math.round(100 * nDone / LESSONS.length) + '%';
    let h: any = '', opt: any = '';
    LEARN_UNITS.forEach((u: any = undefined, ui: any = undefined) => {
        const open: any = learnUnitOpen(ui), nm: any = (u[lang] || u.en);
        h += '<div class="lu-h" data-open="' + open + '"><span aria-hidden="true">' + u.icon + '</span><span class="lu-nm">' + nm + '</span><span class="lu-c">' + (open ? t('lu_done_n', learnUnitDone(ui), u.ls.length) : '<span role="img" aria-label="' + t('lu_locked') + '">🔒</span>') + '</span></div>';
        opt += '<optgroup label="' + nm + (open ? '' : ' 🔒') + '">';
        u.ls.forEach((id: any = undefined) => {
            const i: any = LESSONS.findIndex((L: any = undefined) => L.id === id);
            if (i < 0)
                return;
            const L: any = LESSONS[i], due: any = learnDueDays(id) != null;
            h += '<button type="button" data-li="' + i + '" aria-current="' + (i === learnSel && !learnGloss) + '"' + (open ? '' : ' data-locked="true"') + '><span class="ic" aria-hidden="true">' + L.icon + '</span>' + learnTitle(L) +
                (due ? '<span class="due" role="img" aria-label="' + t('lu_due') + '">↻</span>' : done[id] ? '<span class="done" role="img" aria-label="' + t('learn_done_aria') + '">✓</span>' : '') + '</button>';
            opt += '<option value="' + i + '"' + (i === learnSel ? ' selected' : '') + '>' + learnTitle(L) + (done[id] ? ' ✓' : '') + '</option>';
        });
        opt += '</optgroup>';
    });
    toc.innerHTML = h;
    $('learnExtra').innerHTML = '<label class="learn-pick"><span>' + t('lu_pick') + '</span><select id="learnPick">' + opt + '</select></label><button type="button" class="btn ghost sm" id="learnGlossBtn" aria-pressed="' + learnGloss + '">📖 ' + t('lu_gloss') + '</button>';
}
function learnNavRender(): any {
    const nav: any = $('learnBody').querySelector('.learn-nav');
    if (!nav)
        return;
    const L: any = LESSONS[learnSel], D: any = learnData(), isRead: any = !!D.learnDone[L.id], last: any = learnSel === LESSONS.length - 1;
    nav.innerHTML = '<button type="button" class="btn ghost sm" data-ln="prev"' + (learnSel === 0 ? ' disabled' : '') + '>' + t('learn_prev') + '</button>' +
        '<div class="mid">' + (isRead ? '<span class="read-ok">✓ ' + t('lu_complete') + '</span><button type="button" class="btn ghost sm" data-ln="unmark">' + t('learn_unmark') + '</button>' : '') + '</div>' +
        '<button type="button" class="btn ghost sm" data-ln="next"' + (last ? ' disabled' : '') + '>' + t('learn_next') + '</button>';
}
function learnWire(): any {
    if ((learnWire as any)._ok)
        return;
    (learnWire as any)._ok = true;
    const side: any = (document as any).querySelector('#view-learn .learn-side'), toc: any = $('learnToc');
    const ex: any = (document as any).createElement('div');
    ex.id = 'learnExtra';
    ex.className = 'learn-extra';
    toc.after(ex);
    const live: any = (document as any).createElement('div');
    live.id = 'learnLive';
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    side.appendChild(live);
    toc.addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('[data-li]'); if (b)
        learnGo(+b.dataset.li); });
    ex.addEventListener('change', (e: any = undefined) => { if (e.target.id === 'learnPick')
        learnGo(+e.target.value); });
    ex.addEventListener('click', (e: any = undefined) => { if (e.target.closest('#learnGlossBtn')) {
        learnGloss = !learnGloss;
        LQ = null;
        renderLearn();
        const s: any = $('lg-q');
        if (s)
            s.focus();
    } });
    const body: any = $('learnBody');
    body.addEventListener('keydown', (e: any = undefined) => { const g: any = e.target.closest && e.target.closest('.lstaff .ss-n'); if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        lStaffNote(g);
    } });
    body.addEventListener('input', (e: any = undefined) => { if (e.target.id === 'lg-q')
        lgFilter();
    else
        lwInput(e); });
    body.addEventListener('change', (e: any = undefined) => lwInput(e));
}
function learnBodyHTML(L: any = undefined): any { return (L[lang] && L[lang].b) || L.en.b; }
let renderLearn: any = function renderLearn() {
    const body: any = $('learnBody');
    if (!body || !$('learnToc'))
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
    const L: any = LESSONS[learnSel], ui: any = learnUnitOf(L.id), u: any = LEARN_UNITS[ui], open: any = learnUnitOpen(ui), rl: any = u ? learnRdLevel(u) : null;
    let h: any = '<div class="lu-bar"><span class="lu-unit"><span aria-hidden="true">' + (u ? u.icon : '') + '</span> ' + t('lu_unit', ui + 1, LEARN_UNITS.length) + ' · <b>' + (u ? (u[lang] || u.en) : '') + '</b></span>' +
        (rl && open ? '<button type="button" class="btn ghost sm" data-rd="' + rl.id + '" aria-label="' + t('lu_practise_aria') + ': ' + rdLvName(rl) + '">' + t('lu_practise', rdLvName(rl)) + ' →</button>' : '') + '</div><h3>' + learnTitle(L) + '</h3>';
    if (!open) {
        const prev: any = LEARN_UNITS[ui - 1], firstOpen: any = LESSONS.findIndex((x: any = undefined) => prev.ls.includes(x.id) && !learnData().learnDone[x.id]);
        h += '<div class="lu-lock"><p class="lu-lock-t">🔒 ' + t('lu_locked_t') + '</p><p>' + t('lu_locked_d', (prev[lang] || prev.en)) + '</p><div class="lq-act">' +
            (firstOpen >= 0 ? '<button type="button" class="btn primary" data-li="' + firstOpen + '">' + t('lu_goto', learnTitle(LESSONS[firstOpen])) + '</button>' : '') +
            '<button type="button" class="btn ghost sm" data-ln="unlock">' + t('lu_unlock') + '</button></div></div><div class="learn-nav"></div>';
        body.innerHTML = h;
        learnNavRender();
        return;
    }
    h += '<div class="learn-content">' + learnBodyHTML(L) + '</div>';
    const sum: any = LSUM[L.id];
    if (sum)
        h += '<section class="lsum" aria-labelledby="lsum-h"><h4 id="lsum-h">📋 ' + t('lu_sum') + '</h4><dl>' + sum.map((r: any = undefined) => { const sRow: any = (r.i18n && r.i18n[lang]) || [LT(r[0]), LT(r[1])]; return '<div><dt>' + sRow[0] + '</dt><dd>' + sRow[1] + '</dd></div>'; }).join('') + '</dl></section>';
    if (LQZ[L.id])
        h += '<section class="lq" id="lq" aria-labelledby="lq-h"></section>';
    h += '<div class="learn-nav"></div>';
    body.innerHTML = h;
    body.querySelectorAll('[data-staff]').forEach((el: any = undefined) => { el.outerHTML = lStaffHTML(el.dataset.staff); });
    body.querySelectorAll('[data-widget]').forEach((el: any = undefined) => lwMount(el));
    body.querySelectorAll('[data-bars]').forEach((el: any = undefined) => { el.outerHTML = lBarsHTML(); });
    body.querySelectorAll('[data-an]').forEach((el: any = undefined) => { if (!el.textContent.trim())
        el.textContent = t('lu_an_btn'); });
    if (LQ && LQ.id !== L.id)
        LQ = null;
    lqRender();
    learnNavRender();
    const cur: any = $('learnToc').querySelector('[aria-current="true"]');
    const toc: any = $('learnToc');
    if (cur && toc.scrollHeight > toc.clientHeight)
        cur.scrollIntoView({ block: 'nearest' });
};
function learnClick(e: any = undefined): any {
    const g: any = e.target.closest('[data-go]');
    if (g) {
        e.preventDefault();
        const c: any = g.dataset.cat;
        show(g.dataset.go);
        if (g.dataset.extab)
            exTab(g.dataset.extab);
        if (c && $('pr-cat'))
            $('pr-cat').value = c;
        return;
    }
    if (e.target.closest('[data-lgback]')) {
        learnGloss = false;
        renderLearn();
        return;
    }
    const lg: any = e.target.closest('[data-lgo]');
    if (lg) {
        e.preventDefault();
        learnGloss = false;
        learnGoId(lg.dataset.lgo);
        return;
    }
    const li: any = e.target.closest('[data-li]');
    if (li) {
        learnGo(+li.dataset.li);
        return;
    }
    const ln: any = e.target.closest('[data-ln]');
    if (ln) {
        const a: any = ln.dataset.ln, L: any = LESSONS[learnSel];
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
            const u: any = LEARN_UNITS[learnUnitOf(L.id)];
            learnData().learnUnlock[u.id] = todayN();
            saveAll();
            renderLearn();
        }
        return;
    }
    const lq: any = e.target.closest('[data-lq]');
    if (lq) {
        const a: any = lq.dataset.lq;
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
    const lo: any = e.target.closest('[data-lqo]');
    if (lo) {
        lqPick(+lo.dataset.lqo);
        return;
    }
    const lp: any = e.target.closest('[data-lplay]');
    if (lp) {
        lStaffPlay(lp.dataset.lplay, lp);
        return;
    }
    const sn: any = e.target.closest('.lstaff .ss-n');
    if (sn) {
        lStaffNote(sn);
        return;
    }
    const rd: any = e.target.closest('[data-rd]');
    if (rd) {
        const L: any = RD_LV[rd.dataset.rd];
        show('read');
        rdTab('drills');
        if (L && rdUnlocked(L))
            rdOpen(L);
        return;
    }
    const an: any = e.target.closest('[data-an]');
    if (an) {
        show('analysis');
        anLoadExample(an.dataset.an);
        return;
    }
    const w: any = e.target.closest('[data-w]');
    if (w) {
        lwClick(w);
        return;
    }
    const d: any = e.target.closest('.demo');
    if (d)
        runDemo(d.dataset.demo, d);
}
function lSeqLight(chords: any = undefined, stepMs: any = undefined, holdMs: any = undefined): any {
    chords.forEach((ms: any = undefined, i: any = undefined) => learnTimer(() => { kbClear('target'); ms.forEach((m: any = undefined) => kbState(m, 'target', true)); }, i * stepMs));
    learnTimer(() => kbClear('target'), (chords.length - 1) * stepMs + (holdMs || stepMs));
}
const LBLUES: any = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7];
function lBarsHTML(): any {
    const rn: any = { 0: 'I7', 5: 'IV7', 7: 'V7' };
    return '<div class="lbars" role="list" aria-label="' + t('lw_blues') + '">' + LBLUES.map((d: any = undefined, i: any = undefined) => '<span role="listitem" data-bar="' + i + '"><b>' + rn[d] + '</b><small>' + pcName(d, d === 5) + '7</small></span>').join('') + '</div>';
}
const LACC_CH: any = [{ bass: 48, right: [60, 64, 67], fifth: 55 }, { bass: 45, right: [60, 64, 69], fifth: 52 }, { bass: 41, right: [60, 65, 69], fifth: 48 }, { bass: 43, right: [59, 62, 67], fifth: 50 }];
async function runDemo(spec: any = undefined, btn: any = undefined) {
    ensureAudio();
    learnHalt();
    const g: any = LGEN;
    const p: any = spec.split(':'), kind: any = p[0];
    if (kind !== 'beat' && !await preparePiano())
        return;
    if (g !== LGEN || view0() !== 'learn')
        return;
    const T0: any = actx.currentTime + 0.06;
    if (kind === 'n') {
        const m: any = +p[1];
        previewNote(m, T0, 0.9, 96);
        learnLight([m], 1300);
    }
    else if (kind === 'run') {
        const ms: any = p[1].split('.').map(Number);
        ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, T0 + i * 0.4, 0.38, 92));
        lSeqLight(ms.map((m: any = undefined) => [m]), 400, 700);
    }
    else if (kind === 'ms') {
        const ms: any = p[1].split('.').map(Number);
        playChordMidis(ms, true);
        learnLight(ms, ms.length * 160 + 1500);
    }
    else if (kind === 'iv') {
        const root: any = +p[1], semi: any = +p[2];
        playInterval(root, semi, 'both');
        learnLight([root, root + semi], 2300);
    }
    else if (kind === 'ch') {
        const c: any = CHORDS.find((x: any = undefined) => x.symbol === p.slice(2).join(':'));
        if (c) {
            const ms: any = c.intervals.map((i: any = undefined) => +p[1] + i);
            playChordMidis(ms, true);
            learnLight(ms, ms.length * 160 + 1500);
        }
    }
    else if (kind === 'sc') {
        const nm: any = p.slice(2).join(':'), o: any = SCALES[nm];
        if (o) {
            const root: any = +p[1];
            playScaleNotes(root, o, true);
            lSeqLight(o.concat([12]).map((x: any = undefined) => [root + x]), 270, 600);
        }
    }
    else if (kind === 'pr') {
        const nm: any = p.slice(2).join(':'), prog: any = PROGS.find((x: any = undefined) => x.name === nm) || ACCOMP_PROGS.find((x: any = undefined) => x.name === nm);
        if (prog) {
            const rp: any = +p[1];
            playProg(rp, prog);
            lSeqLight(prog.chords.map((ch: any = undefined) => { const r: any = 60 + ((rp + ch[0]) % 12), tp: any = progChordTpl(ch[1]); return tp ? tp.intervals.map((i: any = undefined) => r + i) : [r]; }), 900, 900);
        }
    }
    else if (kind === 'blues') {
        const rp: any = +p[1] || 0, spb: any = 0.3, bars: any = $('learnBody').querySelectorAll('.lbars [data-bar]');
        const chs: any = LBLUES.map((d: any = undefined) => { const r: any = (rp + d) % 12, root: any = 60 + r - (r > 7 ? 12 : 0); return { bass: 36 + r, ms: [root, root + 4, root + 7, root + 10] }; });
        chs.forEach((c: any = undefined, i: any = undefined) => {
            const b0: any = T0 + i * 4 * spb;
            previewNote(c.bass, b0, spb * 1.9, 84);
            previewNote(c.bass + 7, b0 + 2 * spb, spb * 1.9, 76);
            [0, 1.5, 2, 3.5].forEach((k: any = undefined, j: any = undefined) => c.ms.slice(1).forEach((m: any = undefined) => previewNote(m, b0 + k * spb, j % 2 ? spb * 0.45 : spb * 0.9, j % 2 ? 66 : 80)));
        });
        previewNote(36 + rp, T0 + 48 * spb, 1.4, 84);
        [60, 64, 67, 70].forEach((m: any = undefined) => previewNote(m + rp, T0 + 48 * spb, 1.4, 80));
        lSeqLight(chs.map((c: any = undefined) => [c.bass].concat(c.ms)), 4 * spb * 1000, 1600);
        chs.forEach((c: any = undefined, i: any = undefined) => learnTimer(() => { bars.forEach((b: any = undefined, j: any = undefined) => b.classList.toggle('on', j === i)); }, i * 4 * spb * 1000));
        learnTimer(() => bars.forEach((b: any = undefined) => b.classList.remove('on')), 48 * spb * 1000 + 1500);
    }
    else if (kind === 'vc') {
        const chs: any = p[1].split('|').map((s: any = undefined) => s.split('.').map(Number));
        chs.forEach((ms: any = undefined, i: any = undefined) => ms.forEach((m: any = undefined) => previewNote(m, T0 + i * 1.1, 1.05, m < 55 ? 80 : 88)));
        lSeqLight(chs, 1100, 1200);
    }
    else if (kind === 'acc') {
        const P: any = ACCOMP_PATTERNS[p[1]];
        if (!P)
            return;
        const spb: any = P.beats === 3 ? 0.45 : 0.55, ev: any = [];
        LACC_CH.forEach((c: any = undefined, i: any = undefined) => P.gen(ev, i * P.beats, c));
        previewNote(48, T0 + 4 * P.beats * spb, 1.6, 80);
        [60, 64, 67].forEach((m: any = undefined) => previewNote(m, T0 + 4 * P.beats * spb, 1.6, 80));
        ev.forEach((e: any = undefined) => previewNote(e.midi, T0 + e.beat * spb, Math.max(0.12, e.durB * spb * 0.95), e.hand === 'L' ? 78 : 86));
        lSeqLight(LACC_CH.map((c: any = undefined) => [c.bass].concat(c.right)).concat([[48, 60, 64, 67]]), P.beats * spb * 1000, 1600);
    }
    else if (kind === 'beat')
        demoBeat(p[1], btn);
}
function lDots(btn: any = undefined, n: any = undefined, strong: any = undefined): any {
    const row: any = btn && btn.closest('.demo-row');
    if (!row)
        return [];
    let bd: any = row.nextElementSibling;
    if (!bd || !bd.classList.contains('lbeat')) {
        bd = (document as any).createElement('div');
        bd.className = 'lbeat';
        bd.setAttribute('aria-hidden', 'true');
        row.after(bd);
    }
    bd.innerHTML = Array.from({ length: n }, (_: any = undefined, i: any = undefined) => '<span' + (strong(i) === 2 ? ' class="s"' : strong(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join('');
    return [...bd.children];
}
function demoBeat(kind: any = undefined, btn: any = undefined): any {
    const t0: any = actx.currentTime + 0.1;
    let n: any, step: any, total: any, lvl: any, lab: any;
    if (kind === '68') {
        n = 6;
        step = 0.21;
        total = 12;
        lvl = (i: any = undefined) => i === 0 ? 2 : i === 3 ? 1 : 0;
        lab = '6/8';
    }
    else if (kind === '3t') {
        n = 12;
        step = 60 / 80 / 3;
        total = 24;
        lvl = (i: any = undefined) => i === 0 ? 2 : i % 3 === 0 ? 1 : 0;
        lab = '4/4 ×3';
    }
    else {
        n = +kind || 4;
        step = 60 / 96;
        total = n * 2;
        lvl = (i: any = undefined) => i === 0 ? 2 : 0;
        lab = n + '/4';
    }
    const dots: any = lDots(btn, n, lvl);
    for (let i: any = 0; i < total; i++) {
        const k: any = i % n;
        metroClick(t0 + i * step, lvl(k) === 2 || (kind === '3t' && lvl(k) === 1));
        if (kind === '3t' && k % 3 === 0)
            previewNote(72, t0 + i * step, step * 2.6, 70);
        learnTimer(() => dots.forEach((d: any = undefined, j: any = undefined) => d.classList.toggle('on', j === k)), (i * step + 0.1) * 1000);
    }
    learnTimer(() => dots.forEach((d: any = undefined) => d.classList.remove('on')), (total * step + 0.4) * 1000);
    learnSay(t('lu_beat_say', lab));
}
const LM: any = { el: null, timer: 0, next: 0, i: 0 };
const LTEMPO: any = [[60, 'Largo'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [168, 'Allegro'], [999, 'Presto']];
function lmTerm(b: any = undefined): any { return LTEMPO.find((x: any = undefined) => b < x[0])[1]; }
function lmMeter(m: any = undefined): any { return m === '6/8' ? { n: 6, div: 3, lvl: (i: any = undefined) => i === 0 ? 2 : i === 3 ? 1 : 0 } : { n: +m[0], div: 1, lvl: (i: any = undefined) => i === 0 ? 2 : 0 }; }
function lmStop(): any {
    if (LM.timer) {
        clearInterval(LM.timer);
        LM.timer = 0;
    }
    const el: any = LM.el;
    LM.el = null;
    if (!el)
        return;
    const b: any = el.querySelector('[data-w="mstart"]');
    if (b) {
        b.setAttribute('aria-pressed', 'false');
        b.textContent = '▶ ' + t('lw_start');
    }
    el.querySelectorAll('.lbeat .on').forEach((d: any = undefined) => d.classList.remove('on'));
}
function lmDots(el: any = undefined): any { const s: any = el._s, M: any = lmMeter(s.meter); el.querySelector('.lbeat').innerHTML = Array.from({ length: M.n }, (_: any = undefined, i: any = undefined) => '<span' + (M.lvl(i) === 2 ? ' class="s"' : M.lvl(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join(''); }
function lmStart(el: any = undefined): any {
    ensureAudio();
    LM.el = el;
    LM.next = actx.currentTime + 0.1;
    LM.i = 0;
    const b: any = el.querySelector('[data-w="mstart"]');
    b.setAttribute('aria-pressed', 'true');
    b.textContent = '■ ' + t('lw_stop');
    LM.timer = setInterval(() => {
        if (!LM.el || !document.body.contains(el) || view0() !== 'learn') {
            lmStop();
            return;
        }
        const s: any = el._s, M: any = lmMeter(s.meter), dt: any = 60 / s.bpm / M.div, dots: any = el.querySelectorAll('.lbeat span');
        while (LM.next < actx.currentTime + 0.12) {
            const k: any = LM.i % M.n, lv: any = M.lvl(k);
            metroClick(LM.next, lv > 0);
            setTimeout(() => { if (LM.el === el)
                dots.forEach((d: any = undefined, j: any = undefined) => d.classList.toggle('on', j === k)); }, Math.max(0, (LM.next - actx.currentTime) * 1000));
            LM.i++;
            LM.next += dt;
        }
    }, 25);
}
function lwMetro(el: any = undefined): any {
    const s: any = el._s || (el._s = { bpm: 90, meter: '4/4' });
    el.innerHTML = '<h4>⏱ ' + t('lw_metro') + '</h4><div class="lw-row"><label class="lw-range"><span>' + t('lw_tempo') + '</span><input type="range" min="40" max="208" step="1" value="' + s.bpm + '" data-wi="bpm" aria-valuetext="' + t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm) + '"></label>' +
        '<output class="lw-bpm" aria-live="polite"><b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i></output></div>' +
        '<div class="lw-row"><label><span>' + t('lw_meter') + '</span><select data-wi="meter">' + ['2/4', '3/4', '4/4', '6/8'].map((m: any = undefined) => '<option' + (m === s.meter ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' +
        '<button type="button" class="btn primary sm" data-w="mstart" aria-pressed="false">▶ ' + t('lw_start') + '</button></div><div class="lbeat lbeat-lg" aria-hidden="true"></div>';
    lmDots(el);
}
const LLET: any = 'CDEFGAB', LNAT: any = [0, 2, 4, 5, 7, 9, 11];
const LSPF: any = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]], LSPS: any = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
function lSp(li: any = undefined, acc: any = undefined): any { return spelledName(notation, li, acc); }
function lPitch(li: any = undefined, acc: any = undefined, midi: any = undefined): any { return LLET[li] + (acc > 0 ? '#' : acc < 0 ? 'b' : '') + (Math.floor((midi - acc) / 12) - 1); }
function lStaffSmall(piece: any = undefined, label: any = undefined): any {
    const r: any = srRender(Object.assign({ ts: [4, 4], keyN: 0, noNames: true }, piece));
    return '<div class="ss-wrap lw-staff">' + r.svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"') + '</div>';
}
function lSel(wi: any = undefined, opts: any = undefined, cur: any = undefined, lab: any = undefined): any { return '<label><span>' + lab + '</span><select data-wi="' + wi + '">' + opts.map((o: any = undefined) => '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>'; }
const LW_PRESETS: any = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor', 'Dorian', 'Major pentatonic', 'Minor pentatonic', 'Blues'];
function lwStepLab(s: any = undefined): any { const d: any = STEP_LABELS[lang] || { 2: 'T', 1: 'S', 3: 'T+S' }; return d[s] || (s === 2 ? d[2] : s === 1 ? d[1] : d[3]); }
function lwScale(el: any = undefined): any {
    const s: any = el._s || (el._s = { root: 0, st: [2, 2, 1] }), cum: any = [0];
    s.st.forEach((x: any = undefined) => cum.push(cum[cum.length - 1] + x));
    const tot: any = cum[cum.length - 1], flat: any = [5, 10, 3, 8, 1].includes(s.root), offs: any = tot === 12 ? cum.slice(0, -1) : cum;
    const nm: any = tot === 12 ? Object.keys(SCALES).find((k: any = undefined) => SCALES[k].join() === offs.join()) : null;
    el.innerHTML = '<h4>🪜 ' + t('lw_scale') + '</h4><div class="lw-row">' + lSel('root', LSPF.map((x: any = undefined, i: any = undefined) => [i, lSp(x[0], x[1])]), s.root, t('lw_root')) +
        lSel('preset', [['', t('lw_presets') + '…']].concat(LW_PRESETS.map((k: any = undefined) => [k, scaleDisp(k)])), '', t('lw_presets')) + '</div>' +
        '<div class="lw-row" role="group" aria-label="' + t('lw_steps') + '">' + [['w', t('lw_w')], ['h', t('lw_h')], ['wh', t('lw_wh')]].map((b: any = undefined) => '<button type="button" class="btn sm" data-w="' + b[0] + '"' + (tot >= 12 ? ' disabled' : '') + '>+ ' + b[1] + '</button>').join('') +
        '<button type="button" class="btn ghost sm" data-w="undo"' + (s.st.length ? '' : ' disabled') + '>↶ ' + t('lw_undo') + '</button><button type="button" class="btn ghost sm" data-w="clear">' + t('lw_clear') + '</button>' +
        '<button type="button" class="btn primary sm" data-w="splay">▶ ' + t('lw_play') + '</button></div>' +
        '<div class="lw-steps" aria-label="' + t('lw_steps') + '">' + (s.st.length ? s.st.map((x: any = undefined) => '<span class="lw-st s' + x + '">' + lwStepLab(x) + '</span>').join('') : '<span class="lw-st">—</span>') + '</div>' +
        '<div class="lw-notes">' + cum.map((o: any = undefined, i: any = undefined) => '<span class="lw-chip' + (i === 0 || o === 12 ? ' t' : '') + '">' + pcName(s.root + o, flat) + '</span>').join('') + '</div>' +
        '<p class="lw-out" aria-live="polite">' + t('lw_total', tot) + ' · ' + (tot === 12 ? (nm ? t('lw_name', '<b>' + scaleDisp(nm) + '</b>') : t('lw_complete') + ' ' + t('lw_name_none')) : t('lw_name_none')) + '</p>';
}
const LW_Q: any = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'm7♭5', 'dim7', '6', 'add9'];
const LW_STEP: any = { 0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 14: 1 };
function lwChordData(s: any = undefined): any {
    const c: any = CHORDS.find((x: any = undefined) => x.symbol === s.q), rs: any = LSPF[s.root], base: any = 60 + s.root - (s.root > 6 ? 12 : 0);
    let tones: any = c.intervals.map((iv: any = undefined) => {
        let li: any = (rs[0] + (s.q === 'dim7' && iv === 9 ? 6 : LW_STEP[iv] || 0)) % 7, pcT: any = (s.root + iv) % 12, acc: any = ((pcT - LNAT[li]) % 12 + 18) % 12 - 6;
        if (Math.abs(acc) > 1) {
            li = LSPS[pcT][0];
            acc = LSPS[pcT][1];
        }
        return { li, acc, midi: base + iv, iv };
    });
    const inv: any = Math.min(s.inv, tones.length - 1);
    for (let k: any = 0; k < inv; k++)
        tones[k].midi += 12;
    tones.sort((a: any = undefined, b: any = undefined) => a.midi - b.midi);
    let b: any = tones[0];
    if (s.bass >= 0 && s.bass !== b.midi % 12) {
        const sp: any = (tones.find((x: any = undefined) => x.midi % 12 === s.bass)) || { li: LSPF[s.bass][0], acc: LSPF[s.bass][1] };
        b = { li: sp.li, acc: sp.acc, midi: 0 };
    }
    const bpc: any = s.bass >= 0 ? s.bass : tones[0].midi % 12;
    let bm: any = 36 + bpc;
    if (bm < 40)
        bm += 12;
    const root: any = tones.find((x: any = undefined) => x.iv === 0), sym: any = lSp(root.li, root.acc) + (s.q === 'maj' ? '' : s.q), slash: any = bpc !== s.root;
    return { c, tones, inv, bass: { li: b.li, acc: b.acc, midi: bm }, symbol: sym + (slash ? '/' + lSp(b.li, b.acc) : '') };
}
function lwChord(el: any = undefined): any {
    const s: any = el._s || (el._s = { root: 0, q: 'maj', inv: 0, bass: -1 }), D: any = lwChordData(s);
    el.innerHTML = '<h4>🧱 ' + t('lw_chord') + '</h4><div class="lw-row">' + lSel('root', LSPF.map((x: any = undefined, i: any = undefined) => [i, lSp(x[0], x[1])]), s.root, t('lw_root')) +
        lSel('q', LW_Q.map((q: any = undefined) => { const c: any = CHORDS.find((x: any = undefined) => x.symbol === q); return [q, (q === 'maj' ? '—' : q) + ' · ' + chordDisp(c)]; }), s.q, t('lw_quality')) +
        lSel('inv', Array.from({ length: D.tones.length }, (_: any = undefined, i: any = undefined) => [i, t('lw_inv' + i)]), D.inv, t('lw_inv')) +
        lSel('bass', [[-1, t('lw_none')]].concat(LSPF.map((x: any = undefined, i: any = undefined) => [i, lSp(x[0], x[1])])), s.bass, t('lw_bass')) + '</div>' +
        '<dl class="lw-dl"><div><dt>' + t('lw_symbol') + '</dt><dd><b>' + D.symbol + '</b></dd></div><div><dt>' + t('lw_formula') + '</dt><dd>' + D.c.intervals.map((i: any = undefined) => CHORD_DEG[i] || i).join(' – ') + '</dd></div>' +
        '<div><dt>' + t('lw_notes') + '</dt><dd>' + D.tones.map((x: any = undefined) => lSp(x.li, x.acc)).join(' – ') + '</dd></div></dl>' +
        lStaffSmall({ rh: [[D.tones.map((x: any = undefined) => lPitch(x.li, x.acc, x.midi)), 4]], lh: [[lPitch(D.bass.li, D.bass.acc, D.bass.midi), 4]] }, D.symbol) +
        '<div class="lw-row"><button type="button" class="btn primary sm" data-w="cplay">▶ ' + t('lw_play') + '</button></div>';
}
function lCofKey(i: any = undefined): any { const n: any = i <= 6 ? i : i - 12, ka: any = ssKeyAcc(n), li: any = n >= 0 ? (4 * n) % 7 : (3 * -n) % 7, mli: any = (li + 5) % 7; return { n, li, acc: ka[li], mli, macc: ka[mli], ka }; }
function lwCof(el: any = undefined): any {
    const s: any = el._s || (el._s = { i: 0 }), K: any = lCofKey(s.i), cnt: any = Math.abs(K.n), ord: any = (K.n >= 0 ? SS_SHARP_ORDER : SS_FLAT_ORDER).slice(0, cnt).map((li: any = undefined) => lSp(li, K.n > 0 ? 1 : -1));
    const tri: any = [0, 2, 4].map((d: any = undefined) => { const li: any = (K.li + d) % 7, acc: any = K.ka[li], midi: any = 60 + LNAT[li] + acc + (li < K.li ? 12 : 0) + (K.li >= 5 ? -12 : 0); return lPitch(li, acc, midi); });
    let btns: any = '';
    for (let i: any = 0; i < 12; i++) {
        const k: any = lCofKey(i), a: any = i * Math.PI / 6, x: any = 50 + 40 * Math.sin(a), y: any = 50 - 40 * Math.cos(a);
        btns += '<button type="button" data-w="cof" data-k="' + i + '" aria-pressed="' + (i === s.i) + '" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%"><b>' + lSp(k.li, k.acc) + (i === 6 ? '/' + lSp(4, -1) : '') + '</b><small>' + lSp(k.mli, k.macc) + 'm</small></button>';
    }
    const sig: any = cnt ? t(K.n > 0 ? 'lw_sig_s' : 'lw_sig_f', cnt, ord.join(' ')) : t('lw_sig0'), key: any = lSp(K.li, K.acc) + ' ' + (t('rd_maj') || 'major');
    el.innerHTML = '<h4>⭕ ' + t('lw_cof') + '</h4><p class="lw-hint">' + t('lw_cof_d') + '</p><div class="lw-cof-wrap"><div class="lw-cof" role="group" aria-label="' + t('lw_cof') + '">' + btns + '<div class="lw-cof-c" aria-hidden="true">' + (K.n > 0 ? '♯' : K.n < 0 ? '♭' : '♮') + '<br>' + cnt + '</div></div>' +
        '<div class="lw-cof-info" aria-live="polite"><p><b>' + key + '</b></p><p>' + sig + '</p><p>' + t('lw_rel', '<b>' + lSp(K.mli, K.macc) + ' minor</b>') + '</p>' +
        lStaffSmall({ rh: [[tri, 4]], keyN: K.n }, key + '. ' + sig) + '<button type="button" class="btn primary sm" data-w="cofplay">▶ ' + t('lw_play') + '</button></div></div>';
}
const LW_R: any = { scale: lwScale, chord: lwChord, cof: lwCof, metro: lwMetro };
function lwMount(el: any = undefined): any { el.classList.add('lw'); const f: any = LW_R[el.dataset.widget]; if (f)
    f(el); }
function lwRefocus(el: any = undefined, sel: any = undefined): any { (LW_R[el.dataset.widget] || (() => { }))(el); const f: any = el.querySelector(sel); const g: any = f && !f.disabled ? f : el.querySelector('[data-w="splay"],[data-w="clear"]'); if (g) {
    g.focus({ preventScroll: true });
    learnReveal(g);
} }
function lwInput(e: any = undefined): any {
    const x: any = e.target, wi: any = x.dataset && x.dataset.wi, el: any = x.closest && x.closest('[data-widget]');
    if (!wi || !el)
        return;
    const s: any = el._s;
    if (wi === 'bpm') {
        s.bpm = +x.value;
        x.setAttribute('aria-valuetext', t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm));
        el.querySelector('.lw-bpm').innerHTML = '<b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i>';
        return;
    }
    if (e.type !== 'change')
        return;
    if (wi === 'meter') {
        s.meter = x.value;
        LM.i = 0;
        lmDots(el);
        return;
    }
    if (wi === 'preset') {
        if (!x.value)
            return;
        const o: any = SCALES[x.value].concat([12]);
        s.st = o.slice(1).map((v: any = undefined, i: any = undefined) => v - o[i]);
    }
    else if (wi === 'root') {
        s.root = +x.value;
    }
    else if (wi === 'q') {
        s.q = x.value;
        s.inv = 0;
    }
    else if (wi === 'inv') {
        s.inv = +x.value;
    }
    else if (wi === 'bass') {
        s.bass = +x.value;
    }
    lwRefocus(el, '[data-wi="' + wi + '"]');
    if (el.dataset.widget === 'chord')
        lwChordPlay(el);
    else if (wi === 'preset')
        lwScalePlay(el);
}
async function lwScalePlay(el: any = undefined) {
    const s: any = el._s, cum: any = [0];
    s.st.forEach((x: any = undefined) => cum.push(cum[cum.length - 1] + x));
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    const r: any = 60 + s.root - (s.root > 6 ? 12 : 0), T0: any = actx.currentTime + 0.05;
    cum.forEach((o: any = undefined, i: any = undefined) => previewNote(r + o, T0 + i * 0.3, 0.3, 90));
    lSeqLight(cum.map((o: any = undefined) => [r + o]), 300, 600);
    const nm: any = el.querySelector('.lw-out');
    if (nm)
        learnSay(nm.textContent);
}
async function lwChordPlay(el: any = undefined) {
    const D: any = lwChordData(el._s), ms: any = [D.bass.midi].concat(D.tones.map((x: any = undefined) => x.midi));
    learnHalt();
    ensureAudio();
    if (!await preparePiano())
        return;
    const T0: any = actx.currentTime + 0.05;
    ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, T0 + i * 0.14, 0.4, 86));
    ms.forEach((m: any = undefined) => previewNote(m, T0 + ms.length * 0.14 + 0.1, 1.3, 84));
    learnLight(ms, ms.length * 140 + 1600);
    learnSay(D.symbol);
}
async function lwClick(w: any = undefined) {
    const el: any = w.closest('[data-widget]');
    if (!el)
        return;
    const s: any = el._s, a: any = w.dataset.w;
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
        if (a === 'cof') {
            s.i = +w.dataset.k;
            lwRefocus(el, '[data-w="cof"][data-k="' + s.i + '"]');
        }
        const K: any = lCofKey(s.i), r: any = 48 + ((K.n * 7) % 12 + 12) % 12;
        learnHalt();
        ensureAudio();
        if (!await preparePiano())
            return;
        playChordMidis([r, r + 4, r + 7, r + 12], true);
        learnLight([r, r + 4, r + 7, r + 12], 2200);
        return;
    }
    if (a === 'w' || a === 'h' || a === 'wh') {
        const st: any = ({ w: 2, h: 1, wh: 3 } as any)[a], tot: any = s.st.reduce((x: any = undefined, y: any = undefined) => x + y, 0);
        if (tot + st > 12) {
            learnSay(t('lw_over'));
            return;
        }
        s.st.push(st);
        lwRefocus(el, '[data-w="' + a + '"]');
        const m: any = 60 + s.root - (s.root > 6 ? 12 : 0) + tot + st;
        ensureAudio();
        if (await preparePiano()) {
            previewNote(m, actx.currentTime + 0.02, 0.5, 90);
            learnLight([m], 700);
        }
        if (tot + st === 12)
            learnSay(el.querySelector('.lw-out').textContent);
        return;
    }
    if (a === 'undo') {
        s.st.pop();
        lwRefocus(el, '[data-w="undo"]');
        return;
    }
    if (a === 'clear') {
        s.st = [];
        lwRefocus(el, '[data-w="clear"]');
    }
}
function lgNorm(s: any = undefined): any { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function lgHTML(): any {
    const k: any = (GLOSS[0] && GLOSS[0][lang]) ? lang : 'en', list: any = GLOSS.slice().sort((a: any = undefined, b: any = undefined) => ((a[k] ? a[k][0] : a.en[0])).localeCompare(b[k] ? b[k][0] : b.en[0], lang));
    return '<h3 tabindex="-1">📖 ' + t('lg_title') + '</h3><label class="lg-search"><span>' + t('lg_search') + '</span><input type="search" id="lg-q" placeholder="' + t('lg_ph') + '" autocomplete="off"></label>' +
        '<p class="lg-n" id="lg-n" aria-live="polite"></p><dl class="lg-list">' + list.map((g: any = undefined) => {
        const L: any = LESSONS.find((x: any = undefined) => x.id === g.l);
        const cur: any = g[k] || g.en;
        return '<div class="lg-it" data-k="' + lgNorm(cur[0] + ' ' + cur[1] + ' ' + g.en[0]).replace(/"/g, '') + '"><dt>' + cur[0] + '</dt><dd>' + cur[1] + (L ? ' <a href="#" data-lgo="' + L.id + '">' + L.icon + ' ' + learnTitle(L) + '</a>' : '') + '</dd></div>';
    }).join('') + '</dl>' +
        '<div class="learn-nav"><button type="button" class="btn ghost sm" data-lgback="1">' + t('lg_close') + '</button></div>';
}
function lgFilter(): any {
    const q: any = $('lg-q'), v: any = q ? lgNorm(q.value.trim()) : '';
    let n: any = 0;
    (document as any).querySelectorAll('#learnBody .lg-it').forEach((it: any = undefined) => { const on: any = !v || it.dataset.k.includes(v); it.hidden = !on; if (on)
        n++; });
    const o: any = $('lg-n');
    if (o)
        o.textContent = n ? t('lg_n', n) : t('lg_none', q.value.trim());
}
/* ============================================================================
   READ & PLAY — sheet-music trainer. Grand staff engraver (reuses the ss glyphs)
   + graded repertoire + step-by-step / assessment / listen modes.
   ============================================================================ */
const SR_LET: any = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
function srPitch(s: any = undefined): any { const m: any = /^([A-G])([#b]?)(\d)$/.exec(s); const li: any = SR_LET.indexOf(m[1]), acc: any = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, oct: any = +m[3]; return { li, oct, acc, midi: ssMidiOf(li, oct, acc) }; }
const PIECES: any = [
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
const SR: any = { piece: null, hands: 'both', modeSel: 'learn', names: false, active: false, assessOn: false,
    notes: [], steps: [], stepIdx: 0, hit: new Set(), results: {}, mistakes: 0, wrongExtra: 0, beatX: [], totalBeats: 0,
    render: null, raf: 0, timers: [], nodes: [], bpm: 90, t0: 0, next: null, errs: null, slipKey: null };
function srEvents(list: any = undefined): any { const ev: any = []; let beat: any = 0; (list || []).forEach((x: any = undefined) => { const d: any = x[1]; if (x[0] === 'R')
    ev.push({ rest: true, beat, dur: d });
else if (Array.isArray(x[0]))
    x[0].forEach((n: any = undefined) => ev.push(Object.assign(srPitch(n), { beat, dur: d, chord: x[0].length > 1 })));
else
    ev.push(Object.assign(srPitch(x[0]), { beat, dur: d })); beat += d; }); return { ev, total: beat }; }
function srClef(clef: any = undefined, x: any = undefined, top: any = undefined): any { const g: any = clef === 'treble'; return `<path class="ss-clef" d="${g ? CLEF_G : CLEF_F}" transform="translate(${g ? x - 2 : x} ${top + (g ? 36 : 12)}) scale(${CLEF_SCALE} ${-CLEF_SCALE})"/>`; }
function srKeySigG(clef: any = undefined, keyN: any = undefined, x: any = undefined, top: any = undefined): any {
    const refStep: any = clef === 'bass' ? 18 : 30, bot: any = top + 48, yOf: any = (li: any = undefined, oct: any = undefined) => bot + (refStep - ssStepOf(li, oct)) * 6;
    const sT: any = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT: any = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB: any = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB: any = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const cnt: any = Math.abs(keyN), list: any = keyN > 0 ? (clef === 'bass' ? sB : sT) : (clef === 'bass' ? fB : fT);
    let svg: any = '', xx: any = x;
    for (let i: any = 0; i < cnt; i++) {
        const y: any = yOf(list[i][0], list[i][1]);
        svg += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
function srTimeSigG(ts: any = undefined, x: any = undefined, top: any = undefined): any { return `<text class="ss-num" x="${x + 9}" y="${top + 18}">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="${top + 44}">${ts[1]}</text>`; }
function srStem2(x: any = undefined, y: any = undefined, dur: any = undefined, mid: any = undefined): any { if (dur >= 4)
    return ''; const up: any = y > mid, sx: any = up ? x + 5.6 : x - 5.6, ey: any = up ? y - 32 : y + 32; return srStemLine(sx, y, ey, dur, up); }
function srStemLine(sx: any = undefined, y: any = undefined, ey: any = undefined, dur: any = undefined, up: any = undefined): any {
    if (dur >= 4)
        return '';
    const base: any = [0.375, 0.75, 1.5, 3].includes(dur) ? dur / 1.5 : dur, flags: any = base <= 0.125 ? 3 : base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0;
    let s: any = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    for (let i: any = 0; i < flags; i++) {
        const fy: any = up ? ey + i * 7 : ey - i * 7;
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy + 5} ${sx + 9},${fy + 13} ${sx + 3},${fy + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy - 5} ${sx + 9},${fy - 13} ${sx + 3},${fy - 17}"/>`;
    }
    return s;
}
function srLedger2(x: any = undefined, y: any = undefined, top: any = undefined): any {
    const bot: any = top + 48;
    let s: any = '';
    if (y > bot) {
        for (let ly: any = bot + 12; ly <= y + 1; ly += 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    if (y < top) {
        for (let ly: any = top - 12; ly >= y - 1; ly -= 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    return s;
}
function srRest(x: any = undefined, top: any = undefined, dur: any = undefined): any {
    if (dur >= 4)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 12}" width="12" height="5"/>`;
    if (dur >= 2)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 19}" width="12" height="5"/>`;
    return `<text class="ss-clef" x="${x - 6}" y="${top + 34}" style="font-size:30px">${dur <= 0.125 ? '\u{1D140}' : dur <= 0.25 ? '\u{1D13F}' : dur <= 0.5 ? '\u{1D13E}' : '\u{1D13D}'}</text>`;
}
function srRender(piece: any = undefined): any {
    const staves: any = [];
    if (piece.rh)
        staves.push({ hand: 'rh', clef: 'treble', refStep: 30, top: 46 });
    if (piece.lh)
        staves.push({ hand: 'lh', clef: 'bass', refStep: 18, top: piece.rh ? 150 : 46 });
    staves.forEach((st: any = undefined) => { st.data = srEvents(piece[st.hand]); });
    const keyAcc: any = ssKeyAcc(piece.keyN || 0);
    const cap: any = piece.ts[1] === 8 ? piece.ts[0] * 0.5 : piece.ts[0], pickup: any = piece.pickup || 0;
    const total: any = Math.max(...staves.map((s: any = undefined) => s.data.total));
    const topY: any = staves[0].top, botY: any = staves[staves.length - 1].top + 48;
    let x: any = 10, head: any = '';
    staves.forEach((st: any = undefined) => { head += piece.perc ? rdPercClef(x + 4, st.top) : srClef(st.clef, x, st.top); });
    x += 30;
    let ksw: any = 6;
    staves.forEach((st: any = undefined) => { const ks: any = srKeySigG(st.clef, piece.keyN || 0, x, st.top); head += ks.svg; ksw = Math.max(ksw, ks.w); });
    x += ksw;
    staves.forEach((st: any = undefined) => { head += srTimeSigG(piece.ts, x, st.top); });
    x += 26;
    const bounds: any = [];
    {
        let b: any = pickup > 0 ? pickup : cap;
        while (b < total - 1e-4) {
            bounds.push(b);
            b += cap;
        }
    }
    const beatSet: any = new Set();
    staves.forEach((st: any = undefined) => st.data.ev.forEach((e: any = undefined) => beatSet.add(+e.beat.toFixed(4))));
    const beats: any = [...beatSet].sort((a: any = undefined, b: any = undefined) => a - b);
    const notes: any = [], beatX: any = [];
    let body: any = '', nid: any = 0;
    // Beam pairs of eighths that start on a beat (simple meters only).
    if (piece.ts[1] === 4)
        staves.forEach((st: any = undefined) => {
            const ev: any = st.data.ev;
            for (let i: any = 0; i + 1 < ev.length; i++) {
                const a: any = ev[i], b: any = ev[i + 1], rel: any = a.beat - (pickup % 1);
                if (!a.rest && !b.rest && !a.chord && !b.chord && a.dur === 0.5 && b.dur === 0.5 && Math.abs(rel - Math.round(rel)) < 1e-3 && Math.abs(b.beat - a.beat - 0.5) < 1e-3) {
                    a.beam = { first: true, mate: b };
                    b.beam = { first: false, mate: a };
                    i++;
                }
            }
        });
    beats.forEach((b: any = undefined) => {
        if (bounds.some((v: any = undefined) => Math.abs(v - b) < 1e-3)) {
            x += 6;
            body += `<line class="ss-line" x1="${x}" y1="${topY}" x2="${x}" y2="${botY}" stroke="#1a1714" stroke-width="1.3"/>`;
            x += 12;
        }
        const nx: any = x + 10;
        let minDur: any = 4;
        staves.forEach((st: any = undefined) => {
            const here: any = st.data.ev.filter((e: any = undefined) => Math.abs(e.beat - b) < 1e-3), chord: any = here.filter((e: any = undefined) => !e.rest && e.chord);
            if (chord.length) {
                const items: any = chord.map((e: any = undefined) => ({ e, step: ssStepOf(e.li, e.oct) })).sort((p: any = undefined, q: any = undefined) => p.step - q.step);
                items.forEach((it: any = undefined) => { it.y = st.top + 48 + (st.refStep - it.step) * 6; });
                const up: any = items.reduce((sum: any = undefined, it: any = undefined) => sum + it.y, 0) / items.length > st.top + 24, dur: any = items[0].e.dur;
                let prev: any = null;
                (up ? items : items.slice().reverse()).forEach((it: any = undefined) => { it.dx = prev && Math.abs(it.step - prev.step) === 1 && prev.dx === 0 ? (up ? 11.5 : -11.5) : 0; prev = it; });
                const lanes: any = [];
                items.slice().reverse().forEach((it: any = undefined) => {
                    if (it.e.acc === keyAcc[it.e.li])
                        return;
                    let a: any = lanes.findIndex((l: any = undefined) => l.every((y: any = undefined) => Math.abs(y - it.y) >= 14));
                    if (a < 0) {
                        a = lanes.length;
                        lanes.push([]);
                    }
                    lanes[a].push(it.y);
                    it.ax = nx - 13 - a * 10 - (it.dx < 0 ? 11.5 : 0);
                });
                const top: any = items[items.length - 1], bot: any = items[0], sx: any = up ? nx + 5.6 : nx - 5.6;
                const names: any = (SR.names && !piece.noNames) ? items.map((it: any = undefined) => pcName(pc(it.e.midi), (piece.keyN || 0) < 0)).join(' ') : '';
                items.forEach((it: any = undefined, k: any = undefined) => {
                    const e: any = it.e;
                    let g: any = k === 0 ? `<rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>` : '';
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
            here.forEach((e: any = undefined) => {
                minDur = Math.min(minDur, e.dur);
                if (e.rest) {
                    body += srRest(nx, st.top, e.dur);
                    return;
                }
                if (e.chord)
                    return;
                const y: any = st.top + 48 + (st.refStep - ssStepOf(e.li, e.oct)) * 6;
                let g: any = '';
                if (e.acc !== keyAcc[e.li])
                    g += ssAccGlyph(e.acc, keyAcc[e.li], nx - 13, y);
                g += srLedger2(nx, y, st.top) + ssNotehead(nx, y, e.dur, (st.refStep - ssStepOf(e.li, e.oct)) % 2 === 0) + (e.beam ? `@@B${nid}@@` : srStem2(nx, y, e.dur, st.top + 24));
                if (e.beam)
                    Object.assign(e, { nid, bx: nx, by: y, mid: st.top + 24 });
                const nm: any = (SR.names && !piece.noNames) ? `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${pcName(pc(e.midi), (piece.keyN || 0) < 0)}</text>` : '';
                body += `<g class="ss-n" data-nid="${nid}"><rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>${g}${nm}</g>`;
                notes.push({ nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y, li: e.li, oct: e.oct, acc: e.acc });
                nid++;
            });
        });
        beatX.push({ b, x: nx });
        x += 26 + Math.min(minDur, 4) * 14;
    });
    staves.forEach((st: any = undefined) => st.data.ev.forEach((a: any = undefined) => {
        if (!a.beam || !a.beam.first)
            return;
        const b: any = a.beam.mate, up: any = (a.by + b.by) / 2 > a.mid;
        let e1: any = up ? a.by - 32 : a.by + 32, e2: any = up ? b.by - 32 : b.by + 32;
        const d: any = e2 - e1;
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
        const s1: any = up ? a.bx + 5.6 : a.bx - 5.6, s2: any = up ? b.bx + 5.6 : b.bx - 5.6, th: any = up ? 5 : -5, stem: any = (sx: any = undefined, y: any = undefined, ey: any = undefined) => `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
        body = body.replace(`@@B${a.nid}@@`, stem(s1, a.by, e1)).replace(`@@B${b.nid}@@`, stem(s2, b.by, e2) + `<path class="ss-beam" d="M ${s1},${e1} L ${s2},${e2} L ${s2},${e2 + th} L ${s1},${e1 + th} Z"/>`);
    }));
    x += 8;
    body += `<line class="ss-line" x1="${x}" y1="${topY}" x2="${x}" y2="${botY}" stroke="#1a1714" stroke-width="3"/>`;
    x += 6;
    beatX.push({ b: total, x });
    const W: any = Math.max(x + 6, 420), H: any = Math.max(botY + ((SR.names && !piece.noNames) ? 38 : 22), 150);
    let staff: any = '';
    staves.forEach((st: any = undefined) => { for (let k: any = 0; k < 5; k++) {
        const ly: any = st.top + k * 12;
        staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${W - 6}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    } });
    staff += `<line class="ss-line" x1="8" y1="${topY}" x2="8" y2="${botY}" stroke="#1a1714" stroke-width="1.6"/>`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${staff}${head}${body}</svg>`, notes, beatX, total, W, yTop: topY - 8, yBot: botY + 8 };
}
/* ---- state, drawing, grading ---- */
function srSvg(): any { return $('rd-staff') ? $('rd-staff').querySelector('svg') : null; }
function srHandsAvail(): any { const p: any = SR.piece; return p.rh && p.lh ? 'both' : (p.rh ? 'rh' : 'lh'); }
function srActiveHands(): any { const a: any = srHandsAvail(); return a === 'both' ? SR.hands : a; }
function srStepsBuild(): any {
    const sel: any = srActiveHands();
    const ns: any = SR.notes.filter((n: any = undefined) => sel === 'both' || n.hand === sel);
    const map: any = new Map();
    ns.forEach((n: any = undefined) => { const k: any = n.beat.toFixed(3); if (!map.has(k))
        map.set(k, { beat: n.beat, notes: [] }); map.get(k).notes.push(n); });
    SR.steps = [...map.values()].sort((a: any = undefined, b: any = undefined) => a.beat - b.beat);
}
function srDraw(): any {
    if (!SR.piece)
        return;
    const r: any = srRender(SR.piece);
    SR.render = r;
    SR.notes = r.notes;
    SR.beatX = r.beatX;
    SR.totalBeats = r.total;
    $('rd-staff').innerHTML = r.svg;
    srStepsBuild();
    srPaintAll();
    srCoach();
}
function srPaintAll(): any {
    const svg: any = srSvg();
    if (!svg)
        return;
    const st: any = (SR.active && SR.modeSel === 'learn') ? SR.steps[SR.stepIdx] : null;
    svg.querySelectorAll('.ss-n').forEach((g: any = undefined) => {
        const id: any = +g.dataset.nid, r: any = SR.results[id];
        if (st && st.notes.some((n: any = undefined) => n.nid === id) && !SR.hit.has(id))
            g.dataset.s = 'now';
        else if (r)
            g.dataset.s = r;
        else
            g.removeAttribute('data-s');
    });
}
function srScrollX(x: any = undefined): any { const w: any = $('rd-staff'); if (w && w.scrollWidth > w.clientWidth + 4)
    w.scrollLeft = Math.max(0, x - w.clientWidth * 0.4); }
function srScrollStep(): any { const st: any = SR.steps[SR.stepIdx]; if (st)
    srScrollX(st.notes[0].x); }
function srBeatToX(beat: any = undefined): any {
    const pts: any = SR.beatX;
    if (!pts || !pts.length)
        return 10;
    for (let i: any = 0; i < pts.length - 1; i++) {
        if (beat >= pts[i].b && beat <= pts[i + 1].b) {
            const f: any = (beat - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
            return pts[i].x + f * (pts[i + 1].x - pts[i].x);
        }
    }
    return beat <= pts[0].b ? pts[0].x : pts[pts.length - 1].x;
}
function srCursor(x: any = undefined): any {
    const svg: any = srSvg();
    if (!svg)
        return;
    let c: any = svg.querySelector('.ss-playhead');
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        c.setAttribute('y1', SR.render ? SR.render.yTop : 38);
        c.setAttribute('y2', SR.render ? SR.render.yBot : 102);
        svg.appendChild(c);
    }
    c.setAttribute('x1', x);
    c.setAttribute('x2', x);
    srScrollX(x);
}
function srTargets(): any {
    kbClear('target');
    if (!(SR.active && SR.modeSel === 'learn'))
        return;
    const st: any = SR.steps[SR.stepIdx];
    if (st)
        st.notes.forEach((n: any = undefined) => { if (!SR.hit.has(n.nid))
            kbState(n.midi, 'target', true); });
}
function srClick(t: any = undefined, acc: any = undefined): any {
    const click: any = audioEngine.scheduleClick(t, acc);
    if (click?.oscs)
        SR.nodes.push(...click.oscs);
}
function srStopAll(keep: any = undefined): any {
    SR.active = false;
    SR.assessOn = false;
    if (SR.raf)
        cancelAnimationFrame(SR.raf);
    SR.raf = 0;
    SR.timers.forEach(clearTimeout);
    SR.timers = [];
    SR.nodes.forEach((n: any = undefined) => { try {
        n.stop(0);
    }
    catch (_: any) { } });
    SR.nodes = [];
    if (actx)
        stopPreviews();
    kbClear('target');
    kbClear('good');
    kbClear('bad');
    const svg: any = srSvg(), c: any = svg && svg.querySelector('.ss-playhead');
    if (c)
        c.remove();
    if (!keep) {
        SR.results = {};
        SR.stepIdx = 0;
        SR.hit.clear();
        SR.next = null;
        srPaintAll();
    }
    const go: any = $('rd-go');
    if (go)
        go.textContent = t('rd_start');
    SR.listening = false;
    const li: any = $('rd-listen');
    if (li)
        li.textContent = t('rd_listen');
    srCoach();
}
function srPlayGap(fromBeat: any = undefined, toBeat: any = undefined): any {
    const sel: any = srActiveHands();
    if (sel === 'both' || srHandsAvail() !== 'both')
        return;
    const bs: any = 60 / SR.bpm;
    SR.notes.filter((n: any = undefined) => n.hand !== sel && n.beat >= fromBeat - 1e-3 && n.beat < toBeat - 1e-3).forEach((n: any = undefined) => previewNote(n.midi, actx.currentTime + 0.02, Math.max(.15, n.dur * bs * .9), 78));
}
function srCount(): any { const v: any = $('rd-verdict'); v.className = 'verdict neutral'; v.textContent = SR.stepIdx + ' / ' + SR.steps.length + (SR.mistakes ? '  ·  ✗ ' + SR.mistakes : ''); }
function srLearnStart(): any {
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
    const v: any = $('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_learn_go');
    $('rd-go').textContent = t('rd_stop');
}
function srLearnFinish(): any {
    SR.next = srNextLearn();
    srStopAll(true);
    const v: any = $('rd-verdict');
    if (SR.mistakes === 0) {
        v.className = 'verdict good';
        v.textContent = t('rd_perfect');
    }
    else {
        v.className = 'verdict neutral';
        v.textContent = t('rd_done_learn', SR.mistakes);
    }
    v.textContent += rdSightDone('learn', SR.mistakes);
    if (!SR.piece.ephemeral) {
        const rec: any = data.sheet[SR.piece.id] || (data.sheet[SR.piece.id] = {});
        rec.learned = true;
    }
    touchDay();
    saveAll();
    srBest();
    fillPieces();
}
function srAssessStart(): any {
    SR.active = true;
    SR.results = {};
    SR.wrongExtra = 0;
    SR.next = null;
    srCoach();
    SR.steps.forEach((s: any = undefined) => s.closed = false);
    srPaintAll();
    const bs: any = 60 / SR.bpm, cap: any = SR.piece.ts[1] === 8 ? SR.piece.ts[0] * 0.5 : SR.piece.ts[0], ci: any = cap, pk: any = SR.piece.pickup || 0;
    const act0: any = actx.currentTime + 0.15, perf0: any = performance.now() + 150;
    for (let b: any = 0; b < ci; b++)
        srClick(act0 + b * bs, b === 0);
    for (let b: any = 0; b <= SR.totalBeats + 1e-3; b++) {
        const rel: any = b - pk;
        srClick(act0 + (ci + b) * bs, rel >= 0 && Math.abs(rel % cap) < 1e-3);
    }
    const sel: any = srActiveHands();
    if (sel !== 'both' && srHandsAvail() === 'both')
        SR.notes.filter((n: any = undefined) => n.hand !== sel).forEach((n: any = undefined) => previewNote(n.midi, act0 + (ci + n.beat) * bs, Math.max(.15, n.dur * bs * .9), 78));
    SR.t0 = perf0 + ci * bs * 1000;
    SR.assessOn = false;
    const v: any = $('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_count');
    $('rd-go').textContent = t('rd_stop');
    SR.raf = requestAnimationFrame(srAssessLoop);
}
function srTol(): any { return Math.min(0.55, 0.3 * SR.bpm / 60); }
function srAssessLoop(ts: any = undefined): any {
    if (!SR.active || SR.modeSel !== 'assess')
        return;
    const bs: any = 60 / SR.bpm, bNow: any = (ts - SR.t0) / 1000 / bs;
    if (bNow >= 0 && !SR.assessOn) {
        SR.assessOn = true;
        $('rd-verdict').textContent = t('rd_play');
    }
    srCursor(srBeatToX(Math.max(0, Math.min(bNow, SR.totalBeats))));
    let dirty: any = false;
    SR.steps.forEach((st: any = undefined) => { if (!st.closed && bNow > st.beat + srTol() + 0.05) {
        st.closed = true;
        st.notes.forEach((n: any = undefined) => { if (!SR.results[n.nid]) {
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
function srAssessFinish(): any {
    const totalN: any = SR.steps.reduce((s: any = undefined, st: any = undefined) => s + st.notes.length, 0);
    const good: any = Object.values(SR.results).filter((r: any = undefined) => r === 'good').length;
    const pct: any = totalN ? Math.round(100 * good / totalN) : 0, stars: any = pct >= 95 ? 3 : pct >= 80 ? 2 : pct >= 60 ? 1 : 0;
    SR.next = srNextAssess(pct);
    srStopAll(true);
    const v: any = $('rd-verdict');
    v.className = 'verdict ' + (stars >= 2 ? 'good' : stars ? 'neutral' : 'bad');
    v.textContent = t('rd_score', pct) + '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + (SR.wrongExtra ? '  ·  ' + t('rd_extra', SR.wrongExtra) : '') + rdSightDone('assess', pct);
    if (!SR.piece.ephemeral) {
        const rec: any = data.sheet[SR.piece.id] || (data.sheet[SR.piece.id] = {});
        if (!rec.best || pct > rec.best)
            rec.best = pct;
    }
    touchDay();
    saveAll();
    srBest();
    fillPieces();
}
function srKeyInput(m: any = undefined): any {
    if (!SR.active)
        return;
    if (SR.modeSel === 'learn') {
        const st: any = SR.steps[SR.stepIdx];
        if (!st)
            return;
        const need: any = st.notes.find((n: any = undefined) => !SR.hit.has(n.nid) && n.midi === m);
        if (need) {
            SR.hit.add(need.nid);
            SR.results[need.nid] = 'good';
            if (st.notes.every((n: any = undefined) => SR.hit.has(n.nid))) {
                const next: any = SR.steps[SR.stepIdx + 1];
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
            SR.timers.push(setTimeout(() => { const el: any = keyEl.get(foldToView(m)); if (el && el.dataset.s === 'bad')
                kbState(m, null, true); srTargets(); }, 320));
            srCount();
        }
    }
    else if (SR.modeSel === 'assess' && SR.assessOn) {
        const bs: any = 60 / SR.bpm, bNow: any = (performance.now() - SR.t0) / 1000 / bs;
        let best: any = null, bestD: any = Infinity;
        for (const st of SR.steps) {
            if (st.closed)
                continue;
            const dd: any = Math.abs(bNow - st.beat);
            if (dd <= srTol() && dd < bestD) {
                const cand: any = st.notes.find((n: any = undefined) => !SR.results[n.nid] && n.midi === m);
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
function srListen(): any {
    if (!SR.piece)
        return;
    if (SR.listening) {
        srStopAll(true);
        return;
    }
    ensureAudio();
    srStopAll(true);
    SR.bpm = +($('rd-bpm').value || SR.piece.bpm);
    const bs: any = 60 / SR.bpm, act0: any = actx.currentTime + 0.1, perf0: any = performance.now() + 100;
    SR.listening = true;
    $('rd-listen').textContent = t('rd_stop');
    const follow: any = () => { if (!SR.listening)
        return; const b: any = (performance.now() - perf0) / 1000 / bs; if (b >= 0)
        srCursor(srBeatToX(Math.min(b, SR.totalBeats))); SR.raf = requestAnimationFrame(follow); };
    SR.raf = requestAnimationFrame(follow);
    SR.timers.push(setTimeout(() => srStopAll(true), SR.totalBeats * bs * 1000 + 400));
    SR.notes.forEach((n: any = undefined) => {
        previewNote(n.midi, act0 + n.beat * bs, Math.max(.15, n.dur * bs * .92), n.hand === 'lh' ? 80 : 96);
        SR.timers.push(setTimeout(() => {
            const svg: any = srSvg(), g: any = svg && svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!g)
                return;
            const prev: any = g.getAttribute('data-s');
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
function srGo(): any {
    if (!SR.piece)
        return;
    if (SR.active) {
        srStopAll();
        $('rd-verdict').textContent = '';
        return;
    }
    srStopAll();
    ensureAudio();
    SR.bpm = +($('rd-bpm').value || SR.piece.bpm);
    if (SR.modeSel === 'learn')
        srLearnStart();
    else
        srAssessStart();
}
function srMeta(): any {
    const p: any = SR.piece;
    if (!p)
        return;
    const n: any = p.keyN || 0;
    const keyPc: any = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n), key: any = pcName(keyPc, n < 0) + ' ' + (p.minor ? t('rd_min') : t('rd_maj'));
    if (p.gen) {
        $('rd-meta').textContent = t('rdx_sr_meta', key, p.bpm) + ' · ' + p.ts[0] + '/' + p.ts[1];
        return;
    }
    if (p.ephemeral) {
        $('rd-meta').textContent = t('rd_excerpt_from', p.from.title) + ' · ' + p.from.bars + ' · ' + key + ' · ' + p.ts[0] + '/' + p.ts[1] + ' · ' + t('rd_excerpt_simpl');
        return;
    }
    $('rd-meta').textContent = t('rd_level') + ' ' + p.level + ' · ' + rootName(keyPc) + ' ' + (p.minor ? t('rd_min') : t('rd_maj')) + ' · ' + p.ts[0] + '/' + p.ts[1] + (p.comp ? (' · ' + p.comp) : '');
}
function srPieceTitle(p: any = undefined): any { return (p.t && (p.t[lang] || p.t.en)) || ''; }
function srBest(): any { const rec: any = SR.piece && !SR.piece.ephemeral && data.sheet[SR.piece.id]; $('rd-best').textContent = rec && rec.best ? (t('rd_best', rec.best) + (rec.learned ? ' · ✓ ' + t('rd_learned') : '')) : (rec && rec.learned ? ('✓ ' + t('rd_learned')) : ''); }
function fillPieces(): any {
    const sel: any = $('rd-piece');
    if (!sel)
        return;
    const cur: any = sel.value;
    sel.innerHTML = '';
    if (SR.excerpt) {
        const og: any = (document as any).createElement('optgroup');
        og.label = t('rd_excerpt_group');
        const o: any = (document as any).createElement('option');
        o.value = SR.excerpt.id;
        o.textContent = srPieceTitle(SR.excerpt);
        og.appendChild(o);
        sel.appendChild(og);
    }
    if (SR.gen) {
        const og: any = (document as any).createElement('optgroup');
        og.label = t('rdx_u_sr');
        const o: any = (document as any).createElement('option');
        o.value = SR.gen.id;
        o.textContent = srPieceTitle(SR.gen);
        og.appendChild(o);
        sel.appendChild(og);
    }
    const lv: any = {};
    PIECES.forEach((p: any = undefined) => { (lv[p.level] = lv[p.level] || []).push(p); });
    Object.keys(lv).sort().forEach((L: any = undefined) => {
        const og: any = (document as any).createElement('optgroup');
        og.label = t('rd_level') + ' ' + L;
        lv[L].forEach((p: any = undefined) => {
            const o: any = (document as any).createElement('option');
            o.value = p.id;
            const rec: any = data.sheet[p.id];
            o.textContent = srPieceTitle(p) + (rec && rec.best ? (' · ' + rec.best + '%') : (rec && rec.learned ? ' · ✓' : ''));
            og.appendChild(o);
        });
        sel.appendChild(og);
    });
    sel.value = (cur && (PIECES.some((p: any = undefined) => p.id === cur) || (SR.excerpt && SR.excerpt.id === cur) || (SR.gen && SR.gen.id === cur))) ? cur : PIECES[0].id;
}
function srSelectPiece(id: any = undefined): any {
    srStopAll();
    SR.piece = (SR.excerpt && SR.excerpt.id === id ? SR.excerpt : null) || (SR.gen && SR.gen.id === id ? SR.gen : null) || PIECES.find((p: any = undefined) => p.id === id) || PIECES[0];
    SR.bpm = SR.piece.bpm;
    $('rd-piece').value = SR.piece.id;
    const bp: any = $('rd-bpm');
    bp.value = SR.piece.bpm;
    $('rd-bpmLbl').textContent = SR.piece.bpm;
    const avail: any = srHandsAvail();
    [...$('rd-hands').children].forEach((b: any = undefined) => {
        b.disabled = avail !== 'both';
        b.setAttribute('aria-pressed', (avail === 'both' ? b.dataset.v === SR.hands : b.dataset.v === avail) ? 'true' : 'false');
    });
    srDraw();
    srMeta();
    srBest();
    $('rd-verdict').textContent = '';
    if (SR.piece.ephemeral && typeof rdTab === 'function')
        rdTab('pieces');
}
function renderRead(): any { fillPieces(); if (!SR.piece)
    srSelectPiece($('rd-piece').value);
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
const RD_REF: any = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const RD_CLEFC: any = { treble: 't', bass: 'b', alto: 'a', tenor: 'n' };
const RD_MAJ: any = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], RD_MIN: any = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
const RD_CHQ: any = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
const RD_TARGET: any = { name: 2500, play: 3500, k2s: 4000, iv: 3500, ch: 6000, ks: 5000 };
function rdData(): any {
    if (!data.reading || typeof data.reading !== 'object')
        data.reading = {};
    const r: any = data.reading;
    r.lv = r.lv || {};
    r.nt = r.nt || {};
    r.tot = Object.assign({ n: 0, ok: 0, ms: 0, sess: 0 }, r.tot || {});
    r.prefs = Object.assign({ tab: 'drills', sound: true, hints: false, last: null, custom: null, rhDur: false, rhHands: 1 }, r.prefs || {});
    return r;
}
function rdP(s: any = undefined): any { const p: any = srPitch(s); return { li: p.li, oct: p.oct, acc: p.acc }; }
function rdStep(n: any = undefined): any { return n.oct * 7 + n.li; }
function rdMidi(n: any = undefined): any { return ssMidiOf(n.li, n.oct, n.acc || 0); }
function rdFromStep(s: any = undefined, acc: any = undefined): any { return { li: ((s % 7) + 7) % 7, oct: Math.floor(s / 7), acc: acc || 0 }; }
function rdAccSym(a: any = undefined): any { return a > 0 ? '♯' : a < 0 ? '♭' : ''; }
function rdLetter(li: any = undefined): any { return (LETTERS[notation] || LETTERS.letter)[li]; }
function rdName(n: any = undefined, oct: any = undefined): any { return spelledName(notation, n.li, n.acc || 0) + (oct ? n.oct : ''); }
function rdSpell(s: any = undefined): any { const m: any = /^([A-G])([#b]?)$/.exec(s); return spelledName(notation, SR_LET.indexOf(m[1]), m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
function rdKeyLabel(k: any = undefined): any { return rdSpell(RD_MAJ[k + 7]) + ' ' + t('rd_maj'); }
function rdKeyMinor(k: any = undefined): any { return rdSpell(RD_MIN[k + 7]) + ' ' + t('rd_min'); }
function rdNk(clef: any = undefined, n: any = undefined): any { return RD_CLEFC[clef] + ':' + SR_LET[n.li] + ((n.acc || 0) > 0 ? '#' : (n.acc || 0) < 0 ? 'b' : '') + n.oct; }
function rdEsc(s: any = undefined): any { return String(s).replace(/[&<>"]/g, (c: any = undefined) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]); }
/* ---- curriculum ---- */
const RD_UNITS: any = [], RD_LV: any = {};
function rdU(u: any = undefined, icon: any = undefined, list: any = undefined): any { const lv: any = list.map((o: any = undefined, i: any = undefined) => Object.assign({ u, n: i + 1, id: u + (i + 1) }, o)); RD_UNITS.push({ u, icon, lv }); lv.forEach((L: any = undefined) => { RD_LV[L.id] = L; }); }
const rdS: any = (a: any = undefined) => a.split(' '), RD_ALLIV: any = [2, 3, 4, 5, 6, 7, 8];
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
const RD_ALL: any = RD_UNITS.flatMap((u: any = undefined) => u.lv);
/* ---- staff renderer for drills (whole-note columns, any clef, key signatures) ---- */
function rdCClef(x: any = undefined, cy: any = undefined): any {
    const p: any = (s: any = undefined) => `<path class="rdx-cc" d="M ${x + 9},${cy} C ${x + 13},${cy - 3 * s} ${x + 14},${cy - 8 * s} ${x + 15},${cy - 11 * s} C ${x + 18},${cy - 8 * s} ${x + 24},${cy - 10 * s} ${x + 24},${cy - 17 * s} C ${x + 24},${cy - 25 * s} ${x + 16},${cy - 26 * s} ${x + 12},${cy - 21 * s}"/>`;
    return `<g class="rdx-cclef"><rect x="${x}" y="${cy - 24}" width="4.5" height="48"/><rect x="${x + 6.5}" y="${cy - 24}" width="1.6" height="48"/>${p(1)}${p(-1)}</g>`;
}
function rdPercClef(x: any = undefined, top: any = undefined): any { return `<g class="rdx-cclef"><rect x="${x}" y="${top + 12}" width="4" height="24"/><rect x="${x + 8}" y="${top + 12}" width="4" height="24"/></g>`; }
function rdKsSvg(clef: any = undefined, keyN: any = undefined, x: any = undefined, top: any = undefined): any {
    const bot: any = top + 48, ref: any = RD_REF[clef], off: any = ({ treble: 0, bass: -2, alto: -1, tenor: -1 } as any)[clef];
    const sT: any = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT: any = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]], sTn: any = [[3, 4], [0, 5], [4, 4], [1, 5], [5, 4], [2, 5], [6, 4]];
    const list: any = keyN > 0 ? (clef === 'tenor' ? sTn : sT) : fT;
    let s: any = '', xx: any = x;
    for (let i: any = 0; i < Math.abs(keyN); i++) {
        const y: any = bot + (ref - ssStepOf(list[i][0], list[i][1] + off)) * 6;
        s += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg: s, w: keyN ? Math.abs(keyN) * 9 + 8 : 4 };
}
function rdSvg(o: any = undefined): any {
    const grand: any = o.clef === 'grand', clefs: any = grand ? ['treble', 'bass'] : [o.clef], tops: any = grand ? [40, 136] : [40];
    const keyN: any = o.keyN || 0, kA: any = ssKeyAcc(keyN), colW: any = o.colW || 64, L0: any = grand ? 18 : 8;
    let head: any = '', x: any = L0 + 4;
    clefs.forEach((c: any = undefined, i: any = undefined) => { head += (c === 'treble' || c === 'bass') ? srClef(c, x + 4, tops[i]) : rdCClef(x + 6, tops[i] + (c === 'alto' ? 24 : 12)); });
    x += 40;
    let ksw: any = 4;
    clefs.forEach((c: any = undefined, i: any = undefined) => { const k: any = rdKsSvg(c, keyN, x, tops[i]); head += k.svg; ksw = Math.max(ksw, k.w); });
    x += ksw + (o.cols.length ? 10 : 0);
    const x0: any = x, body: any = [], heads: any = [];
    let minY: any = tops[0], maxY: any = tops[tops.length - 1] + 48;
    o.cols.forEach((col: any = undefined, ci: any = undefined) => {
        const nx: any = x0 + ci * colW + colW / 2;
        const items: any = col.map((n: any = undefined, ii: any = undefined) => {
            const c: any = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : o.clef, top: any = tops[clefs.indexOf(c)], st: any = rdStep(n);
            return { n, ii, c, top, step: st, y: top + 48 + (RD_REF[c] - st) * 6 };
        }).sort((a: any = undefined, b: any = undefined) => a.step - b.step);
        let prev: any = null;
        items.forEach((it: any = undefined) => { it.dx = (prev && prev.c === it.c && it.step - prev.step === 1 && prev.dx === 0) ? 12 : 0; prev = it; });
        const lanes: any = [];
        items.slice().reverse().forEach((it: any = undefined) => {
            if ((it.n.acc || 0) === kA[it.n.li])
                return;
            let a: any = lanes.findIndex((l: any = undefined) => l.every((y: any = undefined) => Math.abs(y - it.y) >= 14));
            if (a < 0) {
                a = lanes.length;
                lanes.push([]);
            }
            lanes[a].push(it.y);
            it.ax = nx - 15 - a * 10;
        });
        items.forEach((it: any = undefined) => {
            let g: any = '';
            if (it.ax != null)
                g += ssAccGlyph(it.n.acc || 0, kA[it.n.li], it.ax, it.y);
            g += srLedger2(nx + it.dx, it.y, it.top) + ssNotehead(nx + it.dx, it.y, o.dur || 4, (RD_REF[it.c] - it.step) % 2 === 0);
            body.push(`<g class="ss-n" data-c="${ci}" data-i="${it.ii}"${it.n.s ? ` data-s="${it.n.s}"` : ''}${it.n.hc ? ` style="--hc:${it.n.hc}"` : ''}>${it.n.tip ? `<title>${rdEsc(it.n.tip)}</title>` : ''}${g}</g>`);
            heads.push({ c: ci, i: it.ii, x: nx + it.dx, y: it.y });
            minY = Math.min(minY, it.y);
            maxY = Math.max(maxY, it.y);
        });
    });
    const W: any = Math.max(o.minW || 0, x0 + o.cols.length * colW + 10), lblY: any = maxY + 24;
    if (o.lbl)
        o.cols.forEach((_: any = undefined, ci: any = undefined) => { if (o.lbl[ci] != null)
            body.push(`<text class="rdx-lbl${o.lblCls && o.lblCls[ci] ? ' ' + o.lblCls[ci] : ''}" x="${x0 + ci * colW + colW / 2}" y="${lblY}">${rdEsc(o.lbl[ci])}</text>`); });
    const yA: any = Math.min(tops[0] - 10, minY - 14), yB: any = (o.lbl ? lblY + 10 : maxY + 14);
    let staff: any = '';
    tops.forEach((tp: any = undefined) => { for (let k: any = 0; k < 5; k++)
        staff += `<line class="ss-line" x1="${L0}" y1="${tp + k * 12}" x2="${W - 4}" y2="${tp + k * 12}" stroke-width="1.2"/>`; });
    staff += `<line class="ss-line" x1="${L0}" y1="${tops[0]}" x2="${L0}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.6"/><line class="ss-line" x1="${W - 4}" y1="${tops[0]}" x2="${W - 4}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`;
    if (grand)
        staff += `<path class="rdx-brace" d="M ${L0 - 3},40 C ${L0 - 13},44 ${L0 - 3},100 ${L0 - 14},112 C ${L0 - 3},124 ${L0 - 13},180 ${L0 - 3},184"/>`;
    const sc: any = o.scale || 1.5, H: any = yB - yA;
    return { svg: `<svg class="rdx-svg" viewBox="0 ${yA} ${W} ${H}" width="${Math.round(W * sc)}" height="${Math.round(H * sc)}" xmlns="http://www.w3.org/2000/svg" role="img"${o.aria ? ` aria-label="${rdEsc(o.aria)}"` : ''}>${staff}${head}${body.join('')}</svg>`, heads, W };
}
/* ---- drill engine ---- */
const RD_TESTN: any = 20, RD_RUSH: any = 60;
const RD: any = { on: false, L: null, mode: 'practice', q: null, n: 0, ok: 0, ms: 0, streak: 0, best: 0, t0: 0, answered: false, timers: [], bag: [], bagSig: '', lastK: null, accSel: 0, miss: {}, rushEnd: 0, rushIv: 0, kbDown: null, rh: null };
function rdLvPrev(L: any = undefined): any { const u: any = RD_UNITS.find((x: any = undefined) => x.u === L.u); return u && L.n > 1 ? u.lv[L.n - 2] : null; }
function rdLvNext(L: any = undefined): any { const u: any = RD_UNITS.find((x: any = undefined) => x.u === L.u); return u ? u.lv[L.n] || null : null; }
function rdUnlocked(L: any = undefined): any { if (!L)
    return false; const p: any = rdLvPrev(L); return !p || ((rdData().lv[p.id] || {}).s || 0) >= 1; }
function rdTarget(L: any = undefined): any { return (RD_TARGET[L.ty] || 3000) + ((L.clef === 'grand' || L.clef === 'mix') ? 800 : 0) + ((L.acc || L.keys) ? 1000 : 0); }
function rdStat(k: any = undefined, ok: any = undefined, ms: any = undefined): any {
    const d: any = rdData(), s: any = d.nt[k] || (d.nt[k] = { n: 0, ok: 0, ms: 0, e: 0, t: 0 });
    s.e = s.n ? s.e * 0.7 + (ok ? 0 : 0.3) : (ok ? 0.1 : 1);
    s.t = s.n ? Math.round(s.t * 0.7 + ms * 0.3) : ms;
    s.n++;
    if (ok)
        s.ok++;
    s.ms += ms;
}
function rdWeight(k: any = undefined): any { const s: any = rdData().nt[k]; if (!s || !s.n)
    return 2.2; const slow: any = Math.min(2, Math.max(0, (s.t || 0) / rdTarget(RD.L) - 1)); return 1 + 6 * (s.e || 0) + 1.5 * slow + (s.n < 3 ? 0.8 : 0); }
function rdPickW(items: any = undefined, keyOf: any = undefined, avoid: any = undefined): any {
    let c: any = items.filter((x: any = undefined) => keyOf(x) !== avoid);
    if (!c.length)
        c = items;
    const w: any = c.map((x: any = undefined) => rdWeight(keyOf(x)));
    let r: any = Math.random() * w.reduce((a: any = undefined, b: any = undefined) => a + b, 0);
    for (let i: any = 0; i < c.length; i++) {
        r -= w[i];
        if (r <= 0)
            return c[i];
    }
    return c[c.length - 1];
}
function rdPickFrom(items: any = undefined, keyOf: any = undefined): any {
    let r: any;
    if (RD.mode === 'test') {
        const sig: any = items.map(keyOf).join('|');
        if (RD.bagSig !== sig || !RD.bag.length) {
            RD.bagSig = sig;
            RD.bag = shuffle(items);
        }
        let i: any = RD.bag.findIndex((x: any = undefined) => keyOf(x) !== RD.lastK);
        if (i < 0)
            i = 0;
        r = RD.bag.splice(i, 1)[0];
    }
    else
        r = rdPickW(items, keyOf, RD.lastK);
    RD.lastK = keyOf(r);
    return r;
}
function rdPool(L: any = undefined): any {
    if (L.set)
        return L.set.map(rdP);
    const lo: any = rdStep(rdP(L.lo)), hi: any = rdStep(rdP(L.hi)), out: any = [];
    for (let s: any = lo; s <= hi; s++) {
        const n: any = rdFromStep(s);
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
function rdIvName(n: any = undefined): any { return t('rdx_iv' + n); }
function rdChLabel(li: any = undefined, q: any = undefined): any { return rdLetter(li) + ' ' + t('rdx_q_' + q); }
function rdGen(L: any = undefined): any {
    const ty: any = L.ty;
    if (ty === 'ks') {
        const ks: any = [];
        for (let k: any = -L.kmax; k <= L.kmax; k++)
            ks.push(k);
        const k: any = rdPickFrom(ks, (v: any = undefined) => 'ks:' + v);
        const opts: any = shuffle(ks.filter((v: any = undefined) => v !== k)).slice(0, 5).concat([k]).sort((a: any = undefined, b: any = undefined) => a - b);
        return { ty, clef: L.clef, keyN: k, key: 'ks:' + k, ans: k, opts: opts.map((v: any = undefined) => ({ v, l: rdKeyLabel(v), s: rdKeyMinor(v) })) };
    }
    if (ty === 'iv') {
        const lo: any = rdStep(rdP(L.lo)), hi: any = rdStep(rdP(L.hi)), iv: any = rdPickFrom(L.ivs, (v: any = undefined) => 'iv:' + v);
        let a: any = lo, b: any = lo + iv - 1;
        for (let k: any = 0; k < 40; k++) {
            a = lo + Math.floor(Math.random() * (hi - lo + 1));
            b = a + (Math.random() < .5 ? 1 : -1) * (iv - 1);
            if (b < lo || b > hi)
                b = a - (b - a);
            if (b >= lo && b <= hi)
                break;
        }
        const harm: any = L.harm === 1 || (L.harm === 2 && Math.random() < .5);
        let na: any = rdFromStep(a), nb: any = rdFromStep(b);
        if (harm && a > b) {
            const x: any = na;
            na = nb;
            nb = x;
        }
        return { ty, clef: L.clef, key: 'iv:' + iv, ans: iv, a: na, b: nb, harm, opts: L.ivs.map((v: any = undefined) => ({ v, l: rdIvName(v), k: String(v) })), midis: [rdMidi(na), rdMidi(nb)] };
    }
    if (ty === 'ch') {
        const lo: any = rdStep(rdP(L.lo)), hi: any = rdStep(rdP(L.hi)), qual: any = rdPickFrom(L.q, (v: any = undefined) => 'ch:' + v);
        let notes: any = null, root: any = null, inv: any = 0;
        for (let k: any = 0; k < 80 && !notes; k++) {
            const rs: any = lo + Math.floor(Math.random() * Math.max(1, hi - lo - 3));
            root = rdFromStep(rs);
            const rm: any = rdMidi(root);
            const ns: any = [0, 1, 2].map((j: any = undefined) => { const n: any = rdFromStep(rs + 2 * j); n.acc = rm + RD_CHQ[qual][j] - rdMidi(n); return n; });
            if (ns.some((n: any = undefined) => Math.abs(n.acc) > 1))
                continue;
            inv = L.inv ? Math.floor(Math.random() * 3) : 0;
            for (let i: any = 0; i < inv; i++) {
                const x: any = ns.shift();
                x.oct++;
                ns.push(x);
            }
            notes = ns;
        }
        const ans: any = root.li + ':' + qual, set: any = new Set([ans]);
        L.q.forEach((q: any = undefined) => set.add(root.li + ':' + q));
        while (set.size < 6) {
            set.add(Math.floor(Math.random() * 7) + ':' + ssPick(L.q));
        }
        const opts: any = shuffle([...set]).map((v: any = undefined) => { const [li, q] = v.split(':'); return { v, l: rdChLabel(+li, q) }; });
        const midis: any = notes.map(rdMidi);
        return { ty, clef: L.clef, key: 'ch:' + qual, ans, root, qual, inv, notes, opts, midis, pcs: [...new Set(midis.map(pc))].sort((a: any = undefined, b: any = undefined) => a - b) };
    }
    let clef: any = L.clef, pool: any, keyN: any = 0;
    if (clef === 'mix') {
        clef = ssPick(['treble', 'bass', 'alto', 'tenor']);
        const r: any = RD_REF[clef];
        pool = [];
        for (let s: any = r - 2; s <= r + 10; s++)
            pool.push(rdFromStep(s));
    }
    else
        pool = rdPool(L);
    if (L.keys) {
        keyN = Math.floor(Math.random() * (2 * L.keys + 1)) - L.keys;
        const kA: any = ssKeyAcc(keyN);
        pool = pool.map((n: any = undefined) => Object.assign({}, n, { acc: kA[n.li] }));
    }
    const sc: any = (n: any = undefined) => clef === 'grand' ? (rdStep(n) >= 28 ? 'treble' : 'bass') : clef;
    const n: any = rdPickFrom(pool, (x: any = undefined) => rdNk(sc(x), x));
    const q: any = { ty, clef, keyN, note: n, sclef: sc(n), key: rdNk(sc(n), n), midi: rdMidi(n), midis: [rdMidi(n)], needAcc: !!(L.acc || L.keys) };
    if (ty === 'k2s') {
        const seen: any = new Set([q.midi]), opts: any = [n];
        for (const x of shuffle(pool)) {
            if (opts.length >= 4)
                break;
            const m: any = rdMidi(x);
            if (!seen.has(m)) {
                seen.add(m);
                opts.push(x);
            }
        }
        q.opts = shuffle(opts).map((x: any = undefined, i: any = undefined) => ({ v: i, n: x }));
        q.ans = q.opts.findIndex((o: any = undefined) => o.n === n);
    }
    return q;
}
function rdQSvg(q: any = undefined, extra: any = undefined): any {
    const st: any = q.state;
    if (q.ty === 'ks')
        return rdSvg({ clef: q.clef, keyN: q.keyN, cols: [], minW: 150, aria: t('rdx_p_ks') }).svg;
    if (q.ty === 'iv') {
        const a: any = Object.assign({ s: st }, q.a), b: any = Object.assign({ s: st }, q.b);
        return rdSvg({ clef: q.clef, cols: q.harm ? [[a, b]] : [[a], [b]], colW: q.harm ? 96 : 72 }).svg;
    }
    if (q.ty === 'ch')
        return rdSvg({ clef: q.clef, cols: [q.notes.map((n: any = undefined) => Object.assign({ s: st }, n))], colW: 100 }).svg;
    const col: any = [Object.assign({ s: q.ty === 'k2s' ? null : st }, q.note)];
    if (extra)
        col.push(extra);
    return rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, keyN: q.keyN, cols: [col], colW: 100, lbl: q.lbl ? [q.lbl] : null }).svg;
}
function rdKbRange(q: any = undefined): any {
    const L: any = RD.L;
    let lo: any = L.lo ? rdMidi(rdP(L.lo)) : 48, hi: any = L.hi ? rdMidi(rdP(L.hi)) : 71;
    lo = Math.min(lo, q.midi);
    hi = Math.max(hi, q.midi);
    return [lo - pc(lo), hi + (11 - pc(hi))];
}
function rdMiniKb(lo: any = undefined, hi: any = undefined, mark: any = undefined, inter: any = undefined): any {
    const whites: any = [];
    for (let m: any = lo; m <= hi; m++)
        if (![1, 3, 6, 8, 10].includes(pc(m)))
            whites.push(m);
    const ww: any = 100 / whites.length, tag: any = inter ? 'button' : 'span', keyAttrs: any = (m: any = undefined) => inter ? ` type="button" aria-label="${rdEsc(noteName(m, false))}"` : '';
    let w: any = '', bk: any = '';
    whites.forEach((m: any = undefined, i: any = undefined) => {
        w += `<${tag} class="rdx-w" data-m="${m}" style="left:${(i * ww).toFixed(3)}%;width:${ww.toFixed(3)}%"${keyAttrs(m)}${m === mark ? ' data-s="target"' : ''}>${pc(m) === 0 ? `<i>${rdLetter(0)}${Math.floor(m / 12) - 1}</i>` : ''}</${tag}>`;
        if ([0, 2, 5, 7, 9].includes(pc(m)) && m + 1 <= hi)
            bk += `<${tag} class="rdx-b" data-m="${m + 1}" style="left:${((i + 1) * ww - ww * 0.3).toFixed(3)}%;width:${(ww * 0.6).toFixed(3)}%"${keyAttrs(m + 1)}${m + 1 === mark ? ' data-s="target"' : ''}></${tag}>`;
    });
    return `<div class="rdx-kb${inter ? ' inter' : ''}" id="rdx-kb"${inter ? ` role="group" aria-label="${rdEsc(t('rdx_p_play'))}"` : ' aria-hidden="true"'}>${w}${bk}</div>`;
}
function rdKbMark(m: any = undefined, s: any = undefined): any { const el: any = (document as any).querySelector('#rdx-kb [data-m="' + m + '"]'); if (el) {
    if (s)
        el.dataset.s = s;
    else
        delete el.dataset.s;
} }
function rdBtn(o: any = undefined, i: any = undefined, cls: any = undefined): any { return `<button class="chip rdx-a${cls ? ' ' + cls : ''}" data-a="${rdEsc(o.v)}" data-k="${o.k || (i + 1)}">${o.html || rdEsc(o.l)}${o.s ? `<small>${rdEsc(o.s)}</small>` : ''}<kbd>${o.k || (i + 1)}</kbd></button>`; }
function rdNext(): any {
    clearTimeout(RD.hintT);
    RD.answered = false;
    RD.accSel = 0;
    const q: any = RD.q = rdGen(RD.L);
    q.hinted = false;
    q.state = null;
    let acc: any = '', ans: any = '', kb: any = '';
    if (q.ty === 'name') {
        if (q.needAcc)
            acc = `<div class="seg rdx-accs" id="rdx-accs" role="group" aria-label="${t('rdx_accl')}">${[-1, 0, 1].map((a: any = undefined, i: any = undefined) => `<button data-acc="${a}" aria-pressed="${a === 0}" title="${t('rdx_acc_t' + a)}">${a < 0 ? '♭' : a > 0 ? '♯' : '♮'}<kbd>${['-', '0', '='][i]}</kbd></button>`).join('')}</div>`;
        ans = [0, 1, 2, 3, 4, 5, 6].map((li: any = undefined) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
    }
    else if (q.ty === 'play') {
        const r: any = rdKbRange(q);
        kb = rdMiniKb(r[0], r[1], null, true);
    }
    else if (q.ty === 'k2s') {
        const r: any = rdKbRange(q);
        kb = rdMiniKb(r[0], r[1], q.midi, false);
        ans = q.opts.map((o: any = undefined, i: any = undefined) => rdBtn({ v: o.v, html: rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, cols: [[o.n]], colW: 56, scale: 0.8 }).svg }, i, 'rdx-opt')).join('');
    }
    else
        ans = q.opts.map((o: any = undefined, i: any = undefined) => rdBtn(o, i)).join('');
    const pr: any = RD.mode === 'practice';
    $('rdx-body').innerHTML = `<div class="rdx-q"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty)}</div>${q.ty === 'k2s' ? kb : ''}<div class="rdx-staff" id="rdx-staff">${q.ty === 'k2s' ? '' : rdQSvg(q)}</div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${q.ty === 'k2s' ? '' : kb}<div class="rdx-tools">${pr ? `<button class="btn ghost sm" id="rdx-hear">🔊 ${t('rdx_hear')}</button><button class="btn ghost sm" id="rdx-hintb">💡 ${t('rdx_hint')}</button>` : ''}<span class="rdx-kbd">${t('rdx_keys_' + q.ty) + (q.needAcc && q.ty === 'name' ? t('rdx_keys_acc') : '')}</span></div></div>`;
    if (q.ty === 'k2s' && rdData().prefs.sound)
        rdSound(q.midis);
    if (pr && rdData().prefs.hints)
        RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
            rdHint(); }, 4000);
    rdHud();
    RD.t0 = performance.now();
}
function rdSound(ms: any = undefined, arp: any = undefined): any { if (!ms || !ms.length)
    return; ensureAudio(); if (!actx)
    return; const t0: any = actx.currentTime + 0.03; ms.forEach((m: any = undefined, i: any = undefined) => previewNote(m, t0 + (arp ? i * 0.45 : 0), 0.9, 88)); }
const RD_LM: any = [14, 18, 21, 24, 28, 32, 35, 38, 42];
function rdHint(): any {
    const q: any = RD.q;
    if (!q || RD.answered)
        return;
    q.hinted = true;
    let s: any = '';
    if (q.ty === 'name' || q.ty === 'play') {
        const st: any = rdStep(q.note);
        let lm: any = RD_LM[0];
        RD_LM.forEach((x: any = undefined) => { if (Math.abs(x - st) < Math.abs(lm - st))
            lm = x; });
        const d: any = st - lm, nm: any = rdName(rdFromStep(lm), true);
        s = d === 0 ? t('rdx_hint_same', nm) : t(d > 0 ? 'rdx_hint_up' : 'rdx_hint_dn', Math.abs(d), nm);
        if (q.ty === 'play')
            rdKbMark(q.midi, 'target');
    }
    else if (q.ty === 'k2s')
        s = t('rdx_hint_k2s', rdName(q.note, true));
    else if (q.ty === 'iv') {
        const l1: any = (RD_REF[q.clef] - rdStep(q.a)) % 2 === 0, l2: any = (RD_REF[q.clef] - rdStep(q.b)) % 2 === 0;
        s = t(l1 === l2 ? 'rdx_hint_odd' : 'rdx_hint_even');
    }
    else if (q.ty === 'ch')
        s = t('rdx_hint_ch', rdLetter(q.root.li));
    else if (q.ty === 'ks')
        s = t(q.keyN > 0 ? 'rdx_hint_ks_s' : q.keyN < 0 ? 'rdx_hint_ks_f' : 'rdx_hint_ks_0');
    const f: any = $('rdx-fb');
    if (f) {
        f.className = 'rdx-fb hint';
        f.textContent = '💡 ' + s;
    }
}
function rdAnsText(q: any = undefined): any { if (q.ty === 'iv')
    return rdIvName(q.ans); if (q.ty === 'ch')
    return rdChLabel(q.root.li, q.qual); if (q.ty === 'ks')
    return rdKeyLabel(q.ans) + ' / ' + rdKeyMinor(q.ans); return rdName(q.note, true); }
function rdAnswer(ok: any = undefined, given: any = undefined): any {
    const q: any = RD.q;
    if (!q || RD.answered || !RD.on)
        return;
    RD.answered = true;
    clearTimeout(RD.hintT);
    const ms: any = Math.round(performance.now() - RD.t0);
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
        const tt: any = rdData().tot;
        tt.n++;
        if (ok)
            tt.ok++;
        tt.ms += ms;
    }
    rdFeedback(ok, given || {});
    rdHud();
    const done: any = RD.mode === 'test' && RD.n >= RD_TESTN;
    RD.timers.push(setTimeout(() => { if (!RD.on)
        return; if (done || (RD.mode === 'rush' && performance.now() >= RD.rushEnd))
        rdFinish();
    else
        rdNext(); }, ok ? (RD.mode === 'practice' ? 650 : 380) : (RD.mode === 'rush' ? 800 : 1500)));
}
function rdFeedback(ok: any = undefined, g: any = undefined): any {
    const q: any = RD.q;
    q.state = ok ? 'good' : 'bad';
    if (q.ty === 'name' && !ok)
        q.lbl = rdName(q.note, true);
    const extra: any = (q.ty === 'play' && !ok && g.midi != null) ? Object.assign(rdSpellMidi(g.midi, q.keyN), { s: 'bad' }) : null;
    if (extra)
        q.state = null;
    if (q.ty !== 'k2s')
        $('rdx-staff').innerHTML = rdQSvg(q, extra);
    const sv: any = $('rdx-staff');
    sv.classList.remove('flash-ok', 'flash-bad');
    void sv.offsetWidth;
    sv.classList.add(ok ? 'flash-ok' : 'flash-bad');
    $('rdx-ans').querySelectorAll('.rdx-a').forEach((b: any = undefined) => { b.disabled = true; if (b.dataset.a === String(q.ans) || (q.ty === 'name' && +b.dataset.a === q.note.li))
        b.classList.add('correct');
    else if (g.btn === b)
        b.classList.add('wrong'); });
    if (q.ty === 'play' || q.ty === 'k2s') {
        rdKbMark(q.midi, 'good');
        if (g.midi != null && g.midi !== q.midi)
            rdKbMark(g.midi, 'bad');
    }
    const f: any = $('rdx-fb'), msg: any = ok ? (t('rdx_ok') + (RD.streak >= 3 ? '  🔥 ' + RD.streak : '')) : t('rdx_wrong', rdAnsText(q)) + (extra ? ' · ' + t('rdx_played', rdName(extra, true)) : '');
    f.className = 'rdx-fb ' + (ok ? 'good' : 'bad');
    f.textContent = (ok ? '✓ ' : '✗ ') + msg;
    $('rdx-live').textContent = msg;
    if (rdData().prefs.sound && q.ty !== 'play' && !(q.ty === 'k2s') && q.midis)
        rdSound(q.midis, q.ty === 'iv' && !q.harm);
}
function rdClickAns(b: any = undefined): any {
    const q: any = RD.q;
    if (!q || RD.answered || !RD.on)
        return;
    const v: any = b.dataset.a;
    if (q.ty === 'name')
        return rdAnswer(+v === q.note.li && (!q.needAcc || RD.accSel === (q.note.acc || 0)), { btn: b });
    if (q.ty === 'k2s')
        return rdAnswer(+v === q.ans, { btn: b });
    rdAnswer(v === String(q.ans), { btn: b });
}
function rdInput(m: any = undefined): any {
    if (!RD.on)
        return;
    if (RD.L.ty === 'rh') {
        rdTap(m < 60 ? 'L' : 'R');
        return;
    }
    const q: any = RD.q;
    if (!q || RD.answered)
        return;
    const own: any = inputOwners.get(m), strict: any = !!own && [...own].some((s: any = undefined) => s === 'midi' || s === 'ble' || s === 'rdk');
    if (q.ty === 'play')
        return rdAnswer(strict ? m === q.midi : pc(m) === pc(q.midi), { midi: m });
    if (q.ty === 'name')
        return rdAnswer(pc(m) === pc(q.midi), { midi: m });
    if (q.ty === 'k2s') {
        const i: any = q.opts.findIndex((o: any = undefined) => strict ? rdMidi(o.n) === m : pc(rdMidi(o.n)) === pc(m));
        if (i >= 0)
            rdAnswer(i === q.ans, { btn: $('rdx-ans').querySelectorAll('.rdx-a')[i], midi: m });
        return;
    }
    if (q.ty === 'ch') {
        const hp: any = heldPcs();
        if (hp.length >= 3)
            rdAnswer(hp.join() === q.pcs.join(), {});
    }
}
function rdHud(): any {
    const h: any = $('rdx-hud'), mt: any = $('rdx-meter');
    if (!h)
        return;
    let s: any = '', f: any = null;
    if (RD.L && RD.L.ty === 'rh') {
        const n: any = (RD.rhP || []).length;
        s = n ? '⌀ ' + Math.round(RD.rhP.reduce((x: any = undefined, y: any = undefined) => x + y, 0) / n) + '% · ' + n + '×' : '';
        if (RD.mode === 'test')
            f = n / 4;
    }
    else if (RD.mode === 'test') {
        s = t('rdx_hud_q', Math.min(RD_TESTN, RD.n + (RD.answered ? 0 : 1)), RD_TESTN) + ' · ✓ ' + RD.ok;
        f = RD.n / RD_TESTN;
    }
    else if (RD.mode === 'rush') {
        const left: any = Math.max(0, Math.ceil((RD.rushEnd - performance.now()) / 1000));
        s = '⏱ ' + left + 's · ✓ ' + RD.ok;
        f = left / RD_RUSH;
    }
    else
        s = '✓ ' + RD.ok + '/' + RD.n + (RD.streak >= 2 ? ' · 🔥 ' + RD.streak : '');
    h.textContent = s;
    mt.hidden = f == null;
    if (f != null)
        mt.firstElementChild.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
}
/* ---- rhythm reading: tap the rhythm against a metronome ---- */
const RD_RHU: any = { '4': [[1]], '2': [[2]], '1': [[4]], '8': [[.5], [.5]], 'r4': [[1, 1]], 'd': [[1.5], [.5]], '16': [[.25], [.25], [.25], [.25]] };
function rdRhGen(L: any = undefined): any {
    let ev: any = [];
    for (let tries: any = 0; tries < 12; tries++) {
        ev = [];
        for (let bar: any = 0; bar < 2; bar++) {
            let pos: any = 0;
            while (pos < 4 - 1e-6) {
                const c: any = L.units.filter((u: any = undefined) => { const len: any = RD_RHU[u].reduce((a: any = undefined, x: any = undefined) => a + x[0], 0); return len <= 4 - pos + 1e-6 && !(u === '1' && pos > 0) && !(u === 'r4' && bar === 0 && pos === 0) && !(u === 'd' && pos % 2); });
                const u: any = c.length ? ssPick(c) : '4';
                RD_RHU[u].forEach((x: any = undefined) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1], u }); pos += x[0]; });
            }
        }
        const last: any = L.units[L.units.length - 1];
        if (ev.some((e: any = undefined) => e.u === last) && ev.filter((e: any = undefined) => !e.rest).length >= 4)
            break;
    }
    return ev;
}
function rdRhGrade(on: any = undefined, taps: any = undefined, bs: any = undefined): any {
    const used: any = new Set(), res: any = [];
    let minI: any = 4;
    for (let i: any = 1; i < on.length; i++)
        minI = Math.min(minI, on[i] - on[i - 1]);
    const win: any = Math.min(0.25, 0.5 * minI * bs);
    on.forEach((b: any = undefined) => {
        let bi: any = -1, bd: any = Infinity;
        taps.forEach((tb: any = undefined, j: any = undefined) => { if (used.has(j))
            return; const d: any = (tb - b) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        if (bi >= 0) {
            used.add(bi);
            const a: any = Math.abs(bd) * 1000;
            res.push({ s: a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad', off: bd * 1000 });
        }
        else
            res.push({ s: 'bad', off: null });
    });
    const extra: any = taps.length - used.size, good: any = res.filter((r: any = undefined) => r.s === 'good').length, near: any = res.filter((r: any = undefined) => r.s === 'near').length;
    const offs: any = res.filter((r: any = undefined) => r.off != null).map((r: any = undefined) => r.off), mean: any = offs.length ? offs.reduce((a: any = undefined, b: any = undefined) => a + b, 0) / offs.length : 0;
    return { res, extra, good, near, pct: Math.max(0, Math.round(100 * (good + 0.5 * near) / Math.max(1, on.length) - extra * 5)), mean: Math.round(mean) };
}
function rdClick(tm: any = undefined, acc: any = undefined): any {
    const click: any = audioEngine.scheduleClick(tm, acc);
    if (click?.oscs)
        (RD.nodes = RD.nodes || []).push(...click.oscs);
}
function rdBeatX(r: any = undefined, beat: any = undefined): any { const p: any = r.beatX; for (let i: any = 0; i < p.length - 1; i++) {
    if (beat >= p[i].b && beat <= p[i + 1].b) {
        const f: any = (beat - p[i].b) / Math.max(1e-3, p[i + 1].b - p[i].b);
        return p[i].x + f * (p[i + 1].x - p[i].x);
    }
} return beat <= p[0].b ? p[0].x : p[p.length - 1].x; }
// Options (remembered): grade how long each note is held, and/or a left-hand part on a second staff.
function rdRhPrefs(): any { const p: any = rdData().prefs; return { dur: !!p.rhDur, two: p.rhHands === 2 }; }
const RD_LH_PAT: any = { whole: [[4]], half: [[2], [2]], pulse: [[1], [1], [1], [1]], onethree: [[1], [1, 1], [1], [1, 1]], twofour: [[1, 1], [1], [1, 1], [1]] };
function rdRhGenLH(L: any = undefined): any {
    const pool: any = L.n <= 2 ? ['whole', 'half'] : L.n === 3 ? ['whole', 'half', 'pulse'] : ['half', 'pulse', 'onethree', 'twofour'], ev: any = [];
    for (let bar: any = 0; bar < 2; bar++) {
        let pos: any = 0;
        RD_LH_PAT[ssPick(pool)].forEach((x: any = undefined) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1] }); pos += x[0]; });
    }
    return ev;
}
// The anchors on the dock keyboard: C3 for the left hand, C5 for the right (any key below / from middle C counts for that hand).
function rdRhMarks(on: any = undefined): any { [48, 72].forEach((m: any = undefined) => kbState(m, on ? 'target' : null, false)); }
function rdRhNew(keep: any = undefined): any {
    const L: any = RD.L, pr: any = rdRhPrefs(), old: any = keep && RD.rh;
    const ev: any = old ? old.ev : rdRhGen(L), lh: any = pr.two ? ((old && old.lh) || rdRhGenLH(L)) : null;
    const piece: any = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: L.bpm, rh: ev.map((e: any = undefined) => [e.rest ? 'R' : 'B4', e.dur]) };
    if (lh)
        piece.lh = lh.map((e: any = undefined) => [e.rest ? 'R' : 'D3', e.dur]);
    const r: any = srRender(piece);
    RD.rh = { ev, lh, r, dur: pr.dur, two: pr.two, on: ev.filter((e: any = undefined) => !e.rest).map((e: any = undefined) => e.beat), taps: [], presses: [], open: new Map(), playing: false, graded: null, raf: 0 };
    const tst: any = RD.mode === 'test', pad: any = (h: any = undefined, lbl: any = undefined, k: any = undefined) => `<button class="rdx-tap" id="rdx-tap${h === 'L' ? 'L' : ''}" data-hand="${h}" aria-label="${rdEsc(lbl)}" aria-describedby="rdx-coach">${rdEsc(lbl)}<small>${rdEsc(k)}</small></button>`;
    const pads: any = pr.two ? pad('L', t('rdx_tap') + ' · ' + t('rdx_tap_l'), t('rdx_tap_lk')) + pad('R', t('rdx_tap') + ' · ' + t('rdx_tap_r'), t('rdx_tap_rk')) : pad('R', t('rdx_tap'), t('rdx_tap_k'));
    const hint: any = [pr.two ? t('rdx_rh_two_hint') : '', pr.dur ? t('rdx_rh_dur_hint') : ''].filter(Boolean).join(' ');
    $('rdx-body').innerHTML = `<div class="rdx-q rdx-rh"><div class="rdx-prompt">${t('rdx_p_rh')}${tst ? ' · ' + t('rdx_hud_q', RD.rhP.length + 1, 4) : ''}</div>
    <div class="rdx-rhopts" id="rdx-rhopts" role="group" aria-label="${t('rdx_rh_opts')}"><label class="switch-inline"><input type="checkbox" id="rdx-rhdur"${pr.dur ? ' checked' : ''}> <span>${t('rdx_rh_dur')}</span></label>
      <div class="seg" id="rdx-rhhands" role="group" aria-label="${t('rdx_rh_hands')}"><button type="button" data-hands="1" aria-pressed="${!pr.two}">${t('rdx_rh_one')}</button><button type="button" data-hands="2" aria-pressed="${pr.two}">${t('rdx_rh_two')}</button></div></div>
    <p class="rdx-rhhint" id="rdx-rhhint">${rdEsc(hint)}</p>
    <div class="rdx-staff ss-wrap" id="rdx-staff">${r.svg}</div><div class="rdx-fb" id="rdx-fb">${t('rdx_rh_bpm', (L as any)?.bpm)}</div><div class="rdx-rhdet" id="rdx-rhdet"></div>
    <div class="rdx-rhbar"><button class="btn primary" id="rdx-rhgo">● ${t('rdx_rh_start')}</button>${tst ? '' : `<button class="btn ghost" id="rdx-rhlisten">▶ ${t('rd_listen')}</button>`}${pads}</div>
    <div class="rdx-tools" id="rdx-rhnext"></div></div>`;
    rdRhMarks(pr.two);
    rdHud();
}
function rdRhOptsLock(on: any = undefined): any { (document as any).querySelectorAll('#rdx-rhopts input,#rdx-rhopts button').forEach((x: any = undefined) => { x.disabled = on; }); }
function rdRhRun(listen: any = undefined): any {
    const R: any = RD.rh;
    if (!R || R.playing)
        return;
    ensureAudio();
    if (!actx)
        return;
    const bs: any = 60 / RD.L.bpm;
    R.taps = [];
    R.presses = [];
    R.open.clear();
    R.graded = null;
    R.playing = true;
    R.listen = !!listen;
    rdRhOptsLock(true);
    $('rdx-rhdet').innerHTML = '';
    $('rdx-staff').querySelectorAll('.ss-n').forEach((g: any = undefined) => { g.removeAttribute('data-s'); g.removeAttribute('data-d'); const tt: any = g.querySelector('title.rdx-tt'); if (tt)
        tt.remove(); });
    const act0: any = actx.currentTime + 0.2, beat0: any = act0 + 4 * bs;
    R.t0 = performance.now() + 200 + 4 * bs * 1000;
    for (let b: any = 0; b < 4; b++)
        rdClick(act0 + b * bs, b === 0);
    for (let b: any = 0; b < 8; b++)
        rdClick(beat0 + b * bs, b % 4 === 0);
    if (listen) {
        const k: any = R.dur ? .92 : .8;
        R.ev.forEach((e: any = undefined) => { if (!e.rest)
            previewNote(72, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 90); });
        if (R.lh)
            R.lh.forEach((e: any = undefined) => { if (!e.rest)
                previewNote(48, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 80); });
    }
    const f: any = $('rdx-fb');
    f.className = 'rdx-fb';
    f.textContent = t('rdx_rh_count');
    const svg: any = $('rdx-staff').querySelector('svg');
    let c: any = svg.querySelector('.ss-playhead');
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        c.setAttribute('y1', R.r.yTop);
        c.setAttribute('y2', R.r.yBot);
        svg.appendChild(c);
    }
    const loop: any = () => {
        if (!R.playing)
            return;
        const b: any = (performance.now() - R.t0) / 1000 / bs;
        if (b >= 0 && f.textContent === t('rdx_rh_count'))
            f.textContent = listen ? t('rdx_rh_listening') : t('rdx_rh_tapnow');
        const x: any = rdBeatX(R.r, Math.max(0, Math.min(8, b)));
        c.setAttribute('x1', x);
        c.setAttribute('x2', x);
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
function rdRhPress(src: any = undefined, hand: any = undefined): any {
    const R: any = RD.rh;
    if (!R || !R.playing || R.listen)
        return;
    if (R.open.has(src))
        rdRhRelease(src);
    const b: any = (performance.now() - R.t0) / 1000 / (60 / RD.L.bpm);
    const p: any = { src, hand: R.two && hand === 'L' ? 'L' : 'R', on: b, off: null };
    R.presses.push(p);
    R.open.set(src, p);
    R.taps.push(b);
    const el: any = (document as any).querySelector('#rdx-body .rdx-tap[data-hand="' + p.hand + '"]');
    if (el) {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
    }
}
function rdRhRelease(src: any = undefined): any { const R: any = RD.rh; if (!R)
    return; const p: any = R.open.get(src); if (!p)
    return; R.open.delete(src); if (R.playing)
    p.off = (performance.now() - R.t0) / 1000 / (60 / RD.L.bpm); }
function rdRhKey(kind: any = undefined, m: any = undefined): any { if (kind === 'on')
    rdRhPress('m' + m, m < 60 ? 'L' : 'R');
else
    rdRhRelease('m' + m); }
function rdTap(hand: any = undefined): any { const src: any = 'tap' + performance.now(); rdRhPress(src, hand || 'R'); rdRhRelease(src); } // a click without press/release (assistive tech)
/* Lengths: each written note is paired with one stroke of its hand (keys struck within 70 ms are one stroke, e.g. a held chord, and it
   ends when its last key lifts). The release is compared with the written end of the note; the windows scale with the note's length
   and are clamped to practical limits, so at any tempo a held half note and a quarter followed by a rest are told apart, while normal
   articulation stays "good". Keys still down when the exercise ends count as released at that moment. */
function rdRhStrokes(ps: any = undefined, end: any = undefined, gap: any = undefined): any {
    const out: any = [];
    ps.slice().sort((a: any = undefined, b: any = undefined) => a.on - b.on).forEach((p: any = undefined) => {
        const off: any = p.off == null ? end : p.off, l: any = out[out.length - 1];
        if (l && p.on - l.on <= gap)
            l.off = Math.max(l.off, off);
        else
            out.push({ on: p.on, off });
    });
    return out;
}
function rdRhGradeHand(ev: any = undefined, ps: any = undefined, bs: any = undefined, dur: any = undefined, end: any = undefined): any {
    const tg: any = ev.filter((e: any = undefined) => !e.rest), st: any = rdRhStrokes(ps.filter((p: any = undefined) => p.on > -0.5), end, 0.07 / bs), used: any = new Set(), res: any = [];
    let minI: any = 4;
    for (let i: any = 1; i < tg.length; i++)
        minI = Math.min(minI, tg[i].beat - tg[i - 1].beat);
    const win: any = Math.min(0.25, 0.5 * minI * bs), cl: any = (x: any = undefined, lo: any = undefined, hi: any = undefined) => Math.max(lo, Math.min(hi, x));
    tg.forEach((e: any = undefined) => {
        let bi: any = -1, bd: any = Infinity;
        st.forEach((s: any = undefined, j: any = undefined) => { if (used.has(j))
            return; const d: any = (s.on - e.beat) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        const r: any = { e, s: 'bad', off: null, rs: null, roff: null };
        if (bi >= 0) {
            used.add(bi);
            const a: any = Math.abs(bd) * 1000;
            r.s = a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad';
            r.off = bd * 1000;
            if (dur) {
                const sec: any = e.dur * bs, d: any = (st[bi].off - (e.beat + e.dur)) * bs, eG: any = cl(.25 * sec, .1, .4), eN: any = cl(.45 * sec, .18, .8), lG: any = cl(.15 * sec, .1, .25), lN: any = cl(.3 * sec, .18, .45);
                r.roff = Math.round(d * 1000);
                r.rs = d < -eN ? 'early' : d > lN ? 'late' : (d < -eG || d > lG) ? 'near' : 'good';
            }
        }
        res.push(r);
    });
    const N: any = tg.length, good: any = res.filter((r: any = undefined) => r.s === 'good').length, near: any = res.filter((r: any = undefined) => r.s === 'near').length, extra: any = st.length - used.size;
    const att: any = good + 0.5 * near, len: any = res.reduce((a: any = undefined, r: any = undefined) => a + (r.rs === 'good' ? 1 : r.rs === 'near' ? .5 : 0), 0), score: any = dur ? (att + len) / 2 : att;
    const offs: any = res.filter((r: any = undefined) => r.off != null).map((r: any = undefined) => r.off);
    return { res, N, good, near, extra, score, dur, lenOk: res.filter((r: any = undefined) => r.rs === 'good' || r.rs === 'near').length, early: res.filter((r: any = undefined) => r.rs === 'early').length, late: res.filter((r: any = undefined) => r.rs === 'late').length,
        mean: offs.length ? Math.round(offs.reduce((a: any = undefined, b: any = undefined) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * score / Math.max(1, N) - extra * 5)) };
}
function rdRhGradeAll(R: any = undefined, bs: any = undefined, end: any = undefined): any {
    const hands: any = R.two ? ['R', 'L'] : ['R'], by: any = {};
    hands.forEach((h: any = undefined) => { by[h] = rdRhGradeHand(h === 'R' ? R.ev : R.lh, R.presses.filter((p: any = undefined) => p.hand === h), bs, R.dur, end); });
    const all: any = hands.map((h: any = undefined) => by[h]), sum: any = (k: any = undefined) => all.reduce((a: any = undefined, g: any = undefined) => a + g[k], 0), N: any = sum('N'), offs: any = all.flatMap((g: any = undefined) => g.res.filter((r: any = undefined) => r.off != null).map((r: any = undefined) => r.off));
    return { by, N, good: sum('good'), near: sum('near'), extra: sum('extra'), lenOk: sum('lenOk'), early: sum('early'), late: sum('late'), res: all.flatMap((g: any = undefined) => g.res),
        mean: offs.length ? Math.round(offs.reduce((a: any = undefined, b: any = undefined) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * sum('score') / Math.max(1, N) - sum('extra') * 5)) };
}
function rdRhNoteTip(r: any = undefined): any {
    if (r.off == null)
        return t('rdx_rh_n_miss');
    const p: any = [];
    if (r.rs === 'early')
        p.push(t('rdx_rh_n_early', -r.roff));
    else if (r.rs === 'late')
        p.push(t('rdx_rh_n_late', r.roff));
    else if (r.rs === 'near')
        p.push(t(r.roff < 0 ? 'rdx_rh_n_short' : 'rdx_rh_n_long'));
    if (Math.abs(r.off) > 100)
        p.push(Math.round(r.off) + ' ms');
    return p.join(' · ');
}
function rdRhHandLine(name: any = undefined, g: any = undefined): any {
    const p: any = [t('rdx_rh_att', (g.good + g.near) + '/' + g.N)];
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
function rdRhDone(endBeat: any = undefined): any {
    const R: any = RD.rh, bs: any = 60 / RD.L.bpm, plain: any = !R.dur && !R.two;
    let g: any, msg: any;
    const det: any = $('rdx-rhdet');
    if (plain) {
        g = rdRhGrade(R.on, R.taps.filter((x: any = undefined) => x > -0.5), bs); // the original tap-only grading
        const gs: any = $('rdx-staff').querySelectorAll('.ss-n');
        g.res.forEach((r: any = undefined, i: any = undefined) => { if (gs[i])
            gs[i].dataset.s = r.s; });
    }
    else {
        g = rdRhGradeAll(R, bs, endBeat || 8.6);
        Object.entries(g.by).forEach(([h, hg]: any = undefined) => hg.res.forEach((r: any = undefined) => {
            const n: any = R.r.notes.find((x: any = undefined) => x.hand === (h === 'L' ? 'lh' : 'rh') && Math.abs(x.beat - r.e.beat) < 1e-3), el: any = n && $('rdx-staff').querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!el)
                return;
            el.dataset.s = r.s;
            if (r.rs && r.rs !== 'good')
                el.dataset.d = r.rs;
            const tip: any = rdRhNoteTip(r);
            if (tip) {
                const tt: any = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                tt.setAttribute('class', 'rdx-tt');
                tt.textContent = tip;
                el.appendChild(tt);
            }
        }));
    }
    R.graded = g;
    RD.rhP.push(g.pct);
    if (g.res.some((r: any = undefined) => r.off != null))
        RD.rhM.push(g.mean);
    RD.n++;
    RD.ok += g.pct;
    const tm: any = Math.abs(g.mean) < 25 ? t('rdx_rh_ontime') : g.mean < 0 ? t('rdx_rh_rush', -g.mean) : t('rdx_rh_drag', g.mean);
    if (plain)
        msg = t('rdx_rh_res', g.pct, (g.good + g.near) + '/' + R.on.length) + ' · ' + tm + (g.extra ? ' · ' + t('rdx_rh_extra', g.extra) : '');
    else if (!R.two)
        msg = t('rdx_rh_score', g.pct) + ' · ' + rdRhHandLine('', g.by.R) + ' · ' + tm;
    else
        msg = t('rdx_rh_score', g.pct) + ' · ' + tm;
    if (det)
        det.innerHTML = R.two ? ['R', 'L'].map((h: any = undefined) => `<div>${rdEsc(rdRhHandLine(t(h === 'R' ? 'rdx_rh_hand_r' : 'rdx_rh_hand_l'), g.by[h]))}</div>`).join('') : '';
    const f: any = $('rdx-fb');
    f.className = 'rdx-fb ' + (g.pct >= 75 ? 'good' : g.pct >= 50 ? '' : 'bad');
    f.textContent = msg;
    $('rdx-live').textContent = [msg].concat(det ? [...det.children].map((x: any = undefined) => x.textContent) : []).join('. ');
    rdStat('rh:' + RD.L.id, g.pct >= 75, 0);
    if (RD.mode === 'test') {
        if (RD.rhP.length >= 4) {
            RD.timers.push(setTimeout(() => { if (RD.on)
                rdFinish(); }, 1600));
        }
        else
            $('rdx-rhnext').innerHTML = `<button class="btn primary" data-act="rhnew">${t('rdx_next_ex')} →</button>`;
    }
    else
        $('rdx-rhnext').innerHTML = `<button class="btn ghost" data-act="rhagain">↺ ${t('rdx_again_same')}</button><button class="btn primary" data-act="rhnew">🎲 ${t('rdx_new_rh')}</button>`;
    rdHud();
}
/* ---- generated sight-reading melodies (played in the Read & play engine) ---- */
function rdSightGen(L: any = undefined): any {
    const keyN: any = ssPick(L.keys), kA: any = ssKeyAcc(keyN), lo: any = rdStep(rdP(L.lo)), hi: any = rdStep(rdP(L.hi));
    const tonLi: any = SR_LET.indexOf(RD_MAJ[keyN + 7][0]);
    let ton: any = lo;
    while (((ton % 7) + 7) % 7 !== tonLi)
        ton++;
    if (ton > hi)
        ton -= 7;
    const nm: any = (s: any = undefined) => { const n: any = rdFromStep(s); return SR_LET[n.li] + (kA[n.li] > 0 ? '#' : kA[n.li] < 0 ? 'b' : '') + n.oct; };
    let cur: any = ton;
    const mel: any = [];
    const mv: any = () => { const near: any = [-2, -1, -1, 1, 1, 2, 0], far: any = [3, -3, 4, -4]; for (let k: any = 0; k < 24; k++) {
        const s: any = cur + ssPick(k < 12 && Math.random() < .8 ? near : far);
        if (s >= Math.max(lo, ton - 4) && s <= hi)
            return s;
    } return ton; };
    for (let bar: any = 0; bar < 4; bar++) {
        let pos: any = 0;
        const end: any = bar === 3 ? 2 : 4;
        while (pos < end - 1e-6) {
            const c: any = L.durs.filter((d: any = undefined) => (d === 1.5 ? 2 : d === 0.5 ? 1 : d) <= end - pos + 1e-6 && !(d === 1.5 && pos % 1));
            const d: any = c.length ? ssPick(c) : end - pos;
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
    const p: any = { id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN, ts: [4, 4], bpm: L.bpm,
        t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) } };
    if (L.clef === 'bass')
        p.lh = mel;
    else
        p.rh = mel;
    if (L.clef === 'grand') {
        const b: any = SR_LET.indexOf(RD_MAJ[keyN + 7][0]), deg: any = [0, ssPick([3, 4]), 4, 0];
        p.lh = deg.map((dg: any = undefined) => { let s: any = 14 + 7 + b + dg; if (s >= 28)
            s -= 7; return [nm(s), 4]; });
    }
    return p;
}
function rdSightStart(mode: any = undefined): any {
    const L: any = RD.L;
    rdData().prefs.srLv = L.id;
    SR.gen = rdSightGen(L);
    RD.on = false;
    rdTab('pieces');
    fillPieces();
    SR.modeSel = mode === 'test' ? 'assess' : 'learn';
    [...$('rd-mode').children].forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === SR.modeSel ? 'true' : 'false'));
    srSelectPiece('gen');
    const v: any = $('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rdx_sr_ready');
    const g: any = $('rd-go');
    if (g)
        g.focus();
}
function rdGenMelody(): any { const L: any = RD_LV[rdData().prefs.srLv] || RD_LV.sr1; RD.L = L; rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice'); }
function rdSightDone(kind: any = undefined, val: any = undefined): any {
    const p: any = SR.piece;
    if (!p || !p.gen)
        return '';
    const L: any = RD_LV[p.gen];
    if (!L)
        return '';
    const steps: any = SR.steps.length || 1, acc: any = kind === 'assess' ? val : Math.max(0, Math.round(100 * (1 - val / steps)));
    const stars: any = kind === 'assess' ? (val >= 95 ? 3 : val >= 80 ? 2 : val >= 60 ? 1 : 0) : (val === 0 ? 2 : val <= Math.max(1, steps * 0.15) ? 1 : 0);
    const d: any = rdData(), nx: any = rdLvNext(L), was: any = rdUnlocked(nx), rec: any = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
    rec.n++;
    rec.s = Math.max(rec.s, stars);
    rec.acc = Math.max(rec.acc, acc);
    d.tot.sess++;
    return (kind === 'assess' ? '' : ' · ' + '★'.repeat(stars) + '☆'.repeat(3 - stars)) + (nx && !was && rdUnlocked(nx) ? ' · 🔓 ' + t('rdx_unlocked', rdLvName(nx)) : '');
}
/* ---- sessions: intro → questions → summary ---- */
function rdLvName(L: any = undefined): any { return L.custom ? t('rdx_custom') : t('rdx_u_' + L.u) + ' · ' + L.n; }
function rdRangeTxt(L: any = undefined): any { if (L.set)
    return L.set.map((s: any = undefined) => rdName(rdP(s), true)).join(' · '); if (L.lo)
    return rdName(rdP(L.lo), true) + '–' + rdName(rdP(L.hi), true); return ''; }
function rdLvDetail(L: any = undefined): any {
    const p: any = [t('rdx_ty_' + L.ty)];
    if (L.ty === 'rh')
        p.push(L.units.map((u: any = undefined) => t('rdx_rhu_' + u)).join(', '));
    else if (L.ty === 'ks') {
        p.push(t('rdx_kmax', L.kmax));
        if (L.clef === 'grand')
            p.push(t('rdx_clef_grand'));
    }
    else {
        if (L.tag)
            p.push(t('rdx_tag_' + L.tag));
        if (L.clef !== 'mix' && (L.custom || !['tr', 'ba', 'cc'].includes(L.u)))
            p.push(t('rdx_clef_' + L.clef));
        const r: any = rdRangeTxt(L);
        if (r)
            p.push(r);
    }
    if (L.acc)
        p.push(t('rdx_acc' + L.acc));
    if (L.keys)
        p.push(t('rdx_inkeys', L.keys));
    if (L.harm)
        p.push(t(L.harm === 1 ? 'rdx_harm' : 'rdx_harmmix'));
    if (L.ty === 'iv' && L.ivs.length < 7)
        p.push(rdIvName(L.ivs[0]) + '–' + rdIvName(L.ivs[L.ivs.length - 1]));
    if (L.q)
        p.push(L.q.map((q: any = undefined) => t('rdx_q_' + q)).join(' / '));
    if (L.inv)
        p.push(t('rdx_inv'));
    if (L.ty === 'sr' || L.ty === 'rh')
        p.push(L.bpm + ' BPM');
    return p.join(' · ');
}
function rdLvSub(L: any = undefined): any { return rdLvDetail(L).split(' · ').slice(1).join(' · '); }
function rdStars(s: any = undefined): any { return `<span class="rdx-stars" role="img" aria-label="${t('rdx_stars_n', s)}">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span>`; }
function rdKeyText(k: any = undefined): any {
    let m: any = /^([tban]):([A-G])([#b]?)(\d)$/.exec(k);
    if (m)
        return rdName({ li: SR_LET.indexOf(m[2]), acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0, oct: +m[4] }, true) + ' (' + t('rdx_clef_' + ({ t: 'treble', b: 'bass', a: 'alto', n: 'tenor' } as any)[m[1]]) + ')';
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
function rdScroll(): any { const tb: any = $('rd-tabs'); if (!tb)
    return; const hd: any = (document as any).querySelector('header'), y: any = tb.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 10; if (window.scrollY > y + 4 || tb.getBoundingClientRect().top > window.innerHeight * 0.3)
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }
function rdOpen(L: any = undefined): any { rdAbort(); RD.L = L; if (!L.custom)
    rdData().prefs.last = L.id; $('rdx-home').hidden = true; $('rdx-stage').hidden = false; rdIntro(); rdScroll(); const b: any = $('rdx-back'); if (b)
    b.focus({ preventScroll: true }); }
function rdIntro(): any {
    const L: any = RD.L, r: any = L.custom ? {} : (rdData().lv[L.id] || {});
    RD.on = false;
    $('rdx-title').textContent = rdLvName(L);
    $('rdx-sub').textContent = rdLvDetail(L);
    $('rdx-hud').textContent = '';
    $('rdx-meter').hidden = true;
    $('rdx-end').hidden = true;
    const modes: any = (L.ty === 'rh' || L.ty === 'sr') ? ['practice', 'test'] : ['practice', 'test', 'rush'], ic: any = { practice: '🎯', test: '📝', rush: '⚡' };
    let prev: any = '';
    if (['name', 'play', 'k2s'].includes(L.ty) && L.clef !== 'mix') {
        const pool: any = rdPool(L).filter((n: any = undefined) => !n.acc).sort((a: any = undefined, b: any = undefined) => rdStep(a) - rdStep(b));
        prev = `<div class="rdx-staff rdx-preview" aria-hidden="true">${rdSvg({ clef: L.clef, cols: pool.map((n: any = undefined) => [n]), colW: pool.length > 16 ? 22 : 28, dur: 1, scale: 1.1, lbl: pool.map((n: any = undefined) => rdName(n)) }).svg}</div>`;
    }
    const rec: any = L.custom ? '' : `<div class="rdx-rec">${rdStars(r.s || 0)}${r.acc ? `<span>${t('rdx_best_acc', r.acc)}</span>` : ''}${r.t ? `<span>${t('rdx_best_t', (r.t / 1000).toFixed(1))}</span>` : ''}${r.rush ? `<span>⚡ ${t('rdx_best_rush', r.rush)}</span>` : ''}</div>`;
    const sfx: any = (L.ty === 'rh' || L.ty === 'sr') ? '_' + L.ty : '';
    $('rdx-body').innerHTML = `<div class="rdx-intro"><p class="rdx-desc">${t('rdx_d_' + L.ty)}</p>${prev}${rec}<div class="rdx-modes">${modes.map((m: any = undefined) => `<button class="rdx-mode" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m + sfx)}</span></button>`).join('')}</div></div>`;
    rdCoach(true);
}
function rdStart(mode: any = undefined): any {
    const L: any = RD.L;
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
    const e: any = $('rdx-end');
    e.hidden = false;
    e.textContent = t(mode === 'practice' ? 'rdx_end' : 'rdx_quit');
    if (mode === 'rush') {
        RD.rushEnd = performance.now() + RD_RUSH * 1000;
        RD.rushIv = setInterval(() => { if (!RD.on)
            return; rdHud(); if (performance.now() >= RD.rushEnd && !RD.answered)
            rdFinish(); }, 250);
    }
    if (L.ty === 'rh')
        rdRhNew();
    else
        rdNext();
}
function rdClear(): any {
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
    (RD.nodes || []).forEach((n: any = undefined) => { try {
        n.stop(0);
    }
    catch (_: any) { } });
    RD.nodes = [];
    if (RD.kbDown != null) {
        const m: any = RD.kbDown;
        RD.kbDown = null;
        handleNoteOff(m, 'rdk');
    }
}
function rdAbort(): any { rdClear(); RD.on = false; }
function rdEndClick(): any { if (RD.on && RD.mode === 'practice' && RD.n > 0)
    rdFinish();
else {
    rdAbort();
    rdIntro();
} }
function rdBack(): any { rdAbort(); $('rdx-stage').hidden = true; $('rdx-home').hidden = false; rdRenderHome(); }
function rdFinish(): any {
    const L: any = RD.L, mode: any = RD.mode;
    rdClear();
    RD.on = false;
    $('rdx-end').hidden = true;
    $('rdx-meter').hidden = true;
    let acc: any = 0, avg: any = 0, stars: any = 0;
    const score: any = RD.ok;
    if (L.ty === 'rh') {
        acc = RD.rhP.length ? Math.round(RD.rhP.reduce((a: any = undefined, b: any = undefined) => a + b, 0) / RD.rhP.length) : 0;
        if (mode === 'test')
            stars = acc >= 90 ? 3 : acc >= 75 ? 2 : acc >= 60 ? 1 : 0;
    }
    else {
        acc = RD.n ? Math.round(100 * RD.ok / RD.n) : 0;
        avg = RD.n ? RD.ms / RD.n : 0;
        const tg: any = rdTarget(L);
        if (mode === 'test')
            stars = acc >= 95 && avg <= tg ? 3 : acc >= 90 && avg <= tg * 1.6 ? 2 : acc >= 80 ? 1 : 0;
    }
    const d: any = rdData();
    d.tot.sess++;
    let unl: any = null, newBest: any = false;
    if (!L.custom) {
        const nx: any = rdLvNext(L), was: any = rdUnlocked(nx), rec: any = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
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
    const weak: any = Object.entries(RD.miss).sort((a: any = undefined, b: any = undefined) => b[1] - a[1]).slice(0, 8);
    const tiles: any = L.ty === 'rh' ? [[acc + '%', t('rdx_st_rh')], [RD.rhP.length, t('rdx_st_ex')]]
        : [[acc + '%', t('rdx_st_acc')], [(avg / 1000).toFixed(1) + 's', t('rdx_st_time')], [mode === 'rush' ? score : RD.best, mode === 'rush' ? t('rdx_st_rush') : t('rdx_st_streak')], [RD.ok + '/' + RD.n, t('rdx_st_ans')]];
    const head: any = mode === 'test' ? `<div class="rdx-sum-stars">${rdStars(stars)}</div><p class="rdx-sum-msg">${t(stars === 3 ? 'rdx_s3' : stars === 2 ? 'rdx_s2' : stars === 1 ? 'rdx_s1' : 'rdx_s0')}</p>`
        : mode === 'rush' ? `<p class="rdx-sum-msg">⚡ ${t('rdx_rush_score', score)}${newBest ? ' · 🏆 ' + t('rdx_newbest') : ''}</p>` : `<p class="rdx-sum-msg">${t('rdx_sum_practice')}</p>`;
    const nx: any = rdLvNext(L);
    RD.next = rdNextStep(L, mode, acc, avg, stars, weak);
    rdCoach(false);
    $('rdx-body').innerHTML = `<div class="rdx-sum" tabindex="-1" id="rdx-sum"${(RD as any).next ? ' aria-describedby="rdx-next"' : ''}><h2>${t('rdx_sum_title')}</h2>${head}${unl ? `<p class="rdx-unl">🔓 ${t('rdx_unlocked', rdEsc(rdLvName(unl)))}</p>` : ''}
    <div class="rdx-tiles">${tiles.map((x: any = undefined) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    ${weak.length ? `<div class="rdx-weak"><span>${t('rdx_review')}</span>${(weak as Array<[string, number]>).map(([k, c]: any = undefined) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))}${c > 1 ? ' ×' + c : ''}</i>`).join('')}</div>` : ''}
    ${(RD as any).next ? `<div class="coach rdx-coach" id="rdx-next" data-kind="next">${coachHTML(t('coach_next'), (RD as any).next, 'rdx-next-act')}</div>` : ''}
    <div class="row rdx-sum-btns"><button class="btn primary" data-act="again">↺ ${t('rdx_again')}</button>${!(L as any)?.custom && nx && rdUnlocked(nx) ? `<button class="btn" data-act="next">${t('rdx_next_lv')} →</button>` : ''}<button class="btn ghost" data-act="levels">${t('rdx_levels')}</button></div></div>`;
    $('rdx-live').textContent = t('rdx_sum_title') + ': ' + acc + '%' + (mode === 'test' ? ' · ' + t('rdx_stars_n', stars) : '') + ((RD as any).next ? '. ' + t('coach_next') + ' ' + coachText((RD as any).next) : '');
    $('rdx-hud').textContent = '';
    $('rdx-meter').hidden = true;
    const s: any = $('rdx-sum');
    if (s)
        s.focus({ preventScroll: true });
}
/* ---- home: progress hero, level ladder, custom drill ---- */
function rdSuggest(): any {
    const d: any = rdData(), last: any = RD_LV[d.prefs.last];
    if (last && rdUnlocked(last) && ((d.lv[last.id] || {}).s || 0) < 2)
        return last;
    return RD_ALL.find((L: any = undefined) => rdUnlocked(L) && !((d.lv[L.id] || {}).s)) || last || RD_ALL[0];
}
function rdRenderHome(): any {
    const d: any = rdData(), tot: any = d.tot, st: any = RD_ALL.reduce((a: any = undefined, L: any = undefined) => a + ((d.lv[L.id] || {}).s || 0), 0), cont: any = rdSuggest();
    $('rdx-hero').innerHTML = `<div class="rdx-hero-l"><div class="rdx-big">★ ${st}<small> / ${RD_ALL.length * 3}</small></div><div class="rdx-hero-s">${t('rdx_hero_stars')}</div></div>
    <div class="rdx-hero-m"><div><b>${tot.n}</b><span>${t('rdx_st_ans')}</span></div><div><b>${tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—'}</b><span>${t('rdx_st_acc')}</span></div><div><b>${tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—'}</b><span>${t('rdx_st_time')}</span></div></div>
    <div class="rdx-hero-r"><button class="btn primary" data-lv="${cont.id}" id="rdx-cont">▶ ${t(d.prefs.last ? 'rdx_continue' : 'rdx_begin')}<small>${rdEsc(rdLvName(cont) + ' · ' + t('rdx_ty_' + cont.ty))}</small></button>
      <label class="switch-inline"><input type="checkbox" id="rdx-snd"${d.prefs.sound ? ' checked' : ''}> <span>${t('rdx_sound')}</span></label><label class="switch-inline"><input type="checkbox" id="rdx-hints"${d.prefs.hints ? ' checked' : ''}> <span>${t('rdx_hints')}</span></label></div>`;
    $('rdx-ladder').innerHTML = RD_UNITS.map((u: any = undefined) => {
        const done: any = u.lv.filter((L: any = undefined) => ((d.lv[L.id] || {}).s || 0) > 0).length;
        return `<section class="rdx-unit"><h3><span class="ic" aria-hidden="true">${u.icon}</span><span>${t('rdx_u_' + u.u)}</span><small>${done}/${u.lv.length}</small></h3><p>${t('rdx_ud_' + u.u)}</p><div class="rdx-lvs">${u.lv.map((L: any = undefined) => {
            const r: any = d.lv[L.id] || {}, ok: any = rdUnlocked(L), s: any = r.s || 0;
            return `<button class="rdx-lv${s ? ' s' + s : ''}" data-lv="${L.id}"${ok ? '' : ' aria-disabled="true"'} title="${rdEsc(rdLvDetail(L))}" aria-label="${rdEsc(rdLvName(L) + ': ' + rdLvDetail(L) + (ok ? '' : ' — ' + t('rdx_locked')) + (s ? ' — ' + t('rdx_stars_n', s) : ''))}"><span class="n">${ok ? L.n : '🔒'}</span><span class="d"><b>${t('rdx_ty_' + L.ty)}</b><i>${rdEsc(rdLvSub(L))}</i></span><span class="st" aria-hidden="true">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span></button>`;
        }).join('')}</div></section>`;
    }).join('');
    rdCustomFill();
}
const RD_CDEF: any = { treble: ['C4', 'G5'], bass: ['F2', 'C4'], grand: ['C3', 'C5'], alto: ['D3', 'B4'], tenor: ['A2', 'G4'] };
function rdCustomFill(): any {
    const lo: any = $('rdx-c-lo'), hi: any = $('rdx-c-hi');
    if (!lo)
        return;
    const c: any = rdData().prefs.custom || { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 0, keys: 0, land: false };
    let opts: any = '';
    for (let s: any = 7; s <= 52; s++) {
        const n: any = rdFromStep(s);
        opts += `<option value="${SR_LET[n.li] + n.oct}">${rdName(n, true)}</option>`;
    }
    lo.innerHTML = opts;
    hi.innerHTML = opts;
    lo.value = c.lo;
    hi.value = c.hi;
    $('rdx-c-ty').value = c.ty;
    $('rdx-c-clef').value = c.clef;
    $('rdx-c-acc').value = String(c.acc);
    $('rdx-c-keys').value = String(c.keys);
    $('rdx-c-land').checked = !!c.land;
}
function rdCustomRead(): any {
    let lo: any = $('rdx-c-lo').value, hi: any = $('rdx-c-hi').value;
    if (rdStep(rdP(lo)) > rdStep(rdP(hi))) {
        const x: any = lo;
        lo = hi;
        hi = x;
    }
    const c: any = { ty: $('rdx-c-ty').value, clef: $('rdx-c-clef').value, lo, hi, acc: +$('rdx-c-acc').value, keys: +$('rdx-c-keys').value, land: $('rdx-c-land').checked };
    rdData().prefs.custom = c;
    return c;
}
function rdCustomGo(): any {
    const c: any = rdCustomRead();
    saveAll();
    const L: any = { custom: true, id: 'custom', u: 'custom', n: 0, ty: c.ty, clef: c.clef, lo: c.lo, hi: c.hi, acc: c.keys ? 0 : c.acc, keys: c.keys || 0 };
    if (c.land) {
        const a: any = rdStep(rdP(c.lo)), b: any = rdStep(rdP(c.hi)), set: any = RD_LM.filter((s: any = undefined) => s >= a && s <= b).map((s: any = undefined) => { const n: any = rdFromStep(s); return SR_LET[n.li] + n.oct; });
        if (set.length >= 2)
            L.set = set;
    }
    rdOpen(L);
}
/* ---- statistics: per-note heatmap on the staff, skills, weakest items ---- */
function rdAgg(c: any = undefined, li: any = undefined, oct: any = undefined): any {
    let n: any = 0, ok: any = 0, ms: any = 0;
    const re: any = /^([tban]):([A-G])([#b]?)(\d)$/;
    for (const [k, s] of Object.entries((rdData().nt as any)) as any) {
        const m: any = re.exec(k);
        if (m && m[1] === c && SR_LET.indexOf(m[2]) === li && +m[4] === oct) {
            n += s.n;
            ok += s.ok;
            ms += s.ms;
        }
    }
    return { n, ok, ms };
}
function rdHeat(clef: any = undefined, lo: any = undefined, hi: any = undefined): any {
    const c: any = RD_CLEFC[clef], cols: any = [], lbl: any = [], cls: any = [];
    for (let s: any = rdStep(rdP(lo)); s <= rdStep(rdP(hi)); s++) {
        const n: any = rdFromStep(s), a: any = rdAgg(c, n.li, n.oct), acc: any = a.n ? Math.round(100 * a.ok / a.n) : null;
        cols.push([Object.assign(n, { hc: acc == null ? null : `hsl(${Math.round(acc * 1.2)},58%,44%)`, tip: rdName(n, true) + (a.n ? `: ${acc}% · ${(a.ms / a.n / 1000).toFixed(1)} s · ${a.n}×` : ': —') })]);
        lbl.push(acc == null ? '·' : acc);
        cls.push(acc == null ? 'none' : acc >= 90 ? 'hi' : acc >= 70 ? 'mid' : 'lo');
    }
    return rdSvg({ clef, cols, colW: 24, dur: 1, scale: 1.2, lbl, lblCls: cls, aria: t('rdx_heat_aria', t('rdx_clef_' + clef)) }).svg;
}
function rdBars(rows: any = undefined): any { return rows.map((r: any = undefined) => `<div class="rdx-bar"><span>${rdEsc(r.l)}</span><div class="rdx-bar-t"><i style="width:${r.n ? Math.round(100 * r.ok / r.n) : 0}%"></i></div><em>${r.n ? Math.round(100 * r.ok / r.n) + '% · ' + r.n + '×' : '—'}</em></div>`).join(''); }
function rdRenderStats(): any {
    const d: any = rdData(), tot: any = d.tot, nt: any = d.nt, g: any = (k: any = undefined) => nt[k] || { n: 0, ok: 0 };
    const lvDone: any = RD_ALL.filter((L: any = undefined) => ((d.lv[L.id] || {}).s || 0) > 0).length, st: any = RD_ALL.reduce((a: any = undefined, L: any = undefined) => a + ((d.lv[L.id] || {}).s || 0), 0);
    const weak: any = Object.entries(nt).filter(([k, s]: any = undefined) => s.n >= 3 && !/^rh:/.test(k)).sort((a: any = undefined, b: any = undefined) => (b[1].e - a[1].e) || (b[1].t - a[1].t)).slice(0, 10);
    const ks: any = [];
    for (let k: any = -7; k <= 7; k++)
        if (g('ks:' + k).n)
            ks.push({ l: rdKeyLabel(k), ...g('ks:' + k) });
    const rh: any = RD_UNITS.find((u: any = undefined) => u.u === 'rh').lv.filter((L: any = undefined) => g('rh:' + L.id).n).map((L: any = undefined) => ({ l: rdLvName(L), ...g('rh:' + L.id) }));
    const extra: any = ['alto', 'tenor'].filter((c: any = undefined) => Object.keys(nt).some((k: any = undefined) => k[0] === RD_CLEFC[c]));
    $('rdx-stats').innerHTML = `<div class="rdx-tiles rdx-tiles-lg">${[[tot.n, t('rdx_st_ans')], [tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—', t('rdx_st_acc')], [tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—', t('rdx_st_time')], [tot.sess, t('rdx_st_sess')], ['★ ' + st, t('rdx_hero_stars')], [lvDone + '/' + RD_ALL.length, t('rdx_st_lv')]].map((x: any = undefined) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_heat')}</h3><p class="rdx-desc">${t('rdx_heat_d')}</p>
      <div class="rdx-staff rdx-heat">${rdHeat('treble', 'A3', 'C6')}</div><div class="rdx-staff rdx-heat">${rdHeat('bass', 'C2', 'E4')}</div>
      ${extra.map((c: any = undefined) => `<div class="rdx-staff rdx-heat">${rdHeat(c, c === 'alto' ? 'C3' : 'A2', c === 'alto' ? 'D5' : 'B4')}</div>`).join('')}</div>
    <div class="rdx-stat-grid"><div class="panel rdx-stat-p"><h3>${t('rdx_u_iv')}</h3>${rdBars(RD_ALLIV.map((v: any = undefined) => ({ l: rdIvName(v), ...g('iv:' + v) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ch')}</h3>${rdBars(['maj', 'min', 'dim', 'aug'].map((q: any = undefined) => ({ l: t('rdx_q_' + q), ...g('ch:' + q) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ks')}</h3>${ks.length ? rdBars(ks) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_rh')}</h3>${rh.length ? rdBars(rh) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div></div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_weakest')}</h3>${weak.length ? `<div class="rdx-weak">${(weak as Array<[string, { ok: number; n: number; t?: number }]>).map(([k, s]: any = undefined) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))} · ${Math.round(100 * s.ok / s.n)}% · ${((s.t || 0) / 1000).toFixed(1)}s</i>`).join('')}</div>` : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}
      <div class="row" style="margin-top:14px"><button class="btn ghost sm" id="rdx-reset">${t('rdx_reset')}</button></div></div>`;
}
/* ---- tabs, wiring, locale ---- */
function rdTab(tab: any = undefined): any {
    if (!['drills', 'pieces', 'stats'].includes(tab))
        tab = 'drills';
    rdData().prefs.tab = tab;
    (document as any).querySelectorAll('#rd-tabs [role=tab]').forEach((b: any = undefined) => { const on: any = b.dataset.tab === tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    ['drills', 'pieces', 'stats'].forEach((x: any = undefined) => { const p: any = $('rdp-' + x); if (p)
        p.hidden = x !== tab; });
    if (tab !== 'drills' && RD.on) {
        rdAbort();
        rdIntro();
    }
    if (tab !== 'pieces' && (SR.active || SR.listening))
        srStopAll(true);
    if (tab === 'stats')
        rdRenderStats();
    else if (tab === 'drills' && $('rdx-stage').hidden)
        rdRenderHome();
}
function rdRender(): any { rdTab(rdData().prefs.tab); }
function rdKey(e: any = undefined, k: any = undefined): any {
    if (view0() !== 'read' || $('rdp-drills').hidden || !RD.on)
        return false;
    if (RD.L.ty === 'rh') {
        const R: any = RD.rh;
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
        const b: any = (document as any).querySelector('#rdx-ans .rdx-a[data-k="' + k + '"]');
        if (b && !b.disabled) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    if (k === '-' || k === '0' || k === '=') {
        const b: any = (document as any).querySelector('#rdx-accs [data-acc="' + (({ '-': -1, '0': 0, '=': 1 } as any)[k]) + '"]');
        if (b) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    return false;
}
function rdOnLocale(): any {
    if (!$('view-read'))
        return;
    if (SR.active) {
        const g: any = $('rd-go');
        if (g)
            g.textContent = t('rd_stop');
    }
    if (SR.listening) {
        const l: any = $('rd-listen');
        if (l)
            l.textContent = t('rd_stop');
    }
    if (SR.gen) {
        SR.gen.t = { en: tl('en', 'rdx_sr_title', SR.gen.level), ro: tl('ro', 'rdx_sr_title', SR.gen.level) };
        fillPieces();
        if (SR.piece)
            $('rd-piece').value = SR.piece.id;
    }
    if (!$('rdx-stage').hidden && RD.L) {
        $('rdx-title').textContent = rdLvName(RD.L);
        $('rdx-sub').textContent = rdLvDetail(RD.L);
        if (!RD.on && !$('rdx-body').querySelector('.rdx-sum'))
            rdIntro();
        else if (RD.on && RD.q && RD.q.ty === 'name')
            $('rdx-ans').querySelectorAll('.rdx-a').forEach((b: any = undefined) => { b.firstChild.textContent = rdLetter(+b.dataset.a); });
        if (RD.on) {
            $('rdx-end').textContent = t(RD.mode === 'practice' ? 'rdx_end' : 'rdx_quit');
            rdHud();
        }
    }
    if (view0() === 'read')
        rdRender();
    else
        rdCustomFill();
}
(function rdInit() {
    const dr: any = $('rdp-drills');
    if (!dr)
        return;
    $('rd-tabs').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('[role=tab]'); if (b) {
        rdTab(b.dataset.tab);
        saveAll();
    } });
    $('rd-tabs').addEventListener('keydown', (e: any = undefined) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
            return;
        const tabs: any = [...$('rd-tabs').querySelectorAll('[role=tab]')], i: any = tabs.indexOf(document.activeElement);
        if (i < 0)
            return;
        e.preventDefault();
        const n: any = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        n.focus();
        rdTab(n.dataset.tab);
    });
    dr.addEventListener('click', (e: any = undefined) => {
        const lv: any = e.target.closest('[data-lv]');
        if (lv) {
            const L: any = RD_LV[lv.dataset.lv];
            if (!L)
                return;
            if (lv.getAttribute('aria-disabled') === 'true') {
                $('rdx-live').textContent = t('rdx_locked_msg');
                lv.classList.remove('shake');
                void lv.offsetWidth;
                lv.classList.add('shake');
                return;
            }
            rdOpen(L);
            return;
        }
        const md: any = e.target.closest('[data-mode]');
        if (md) {
            rdStart(md.dataset.mode);
            return;
        }
        const a: any = e.target.closest('.rdx-a');
        if (a) {
            rdClickAns(a);
            return;
        }
        const ac: any = e.target.closest('[data-acc]');
        if (ac) {
            RD.accSel = +ac.dataset.acc;
            ac.parentNode.querySelectorAll('[data-acc]').forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === ac ? 'true' : 'false'));
            return;
        }
        const key: any = e.target.closest('.rdx-kb.inter button[data-m]');
        if (key && e.detail === 0) {
            const m: any = +key.dataset.m;
            handleNoteOn(m, 96, 'rdk');
            handleNoteOff(m, 'rdk');
            return;
        }
        if (e.target.closest('#rdx-next-act')) {
            if (RD.next && RD.next.act)
                RD.next.act.run();
            return;
        }
        const act: any = e.target.closest('[data-act]');
        if (act) {
            const k: any = act.dataset.act;
            if (k === 'again')
                rdStart(RD.mode);
            else if (k === 'next') {
                const nx: any = rdLvNext(RD.L);
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
        const hb: any = e.target.closest('[data-hands]');
        if (hb) {
            if (hb.disabled || (RD.rh && RD.rh.playing))
                return;
            rdData().prefs.rhHands = +hb.dataset.hands === 2 ? 2 : 1;
            saveAll();
            rdRhNew(true);
            return;
        }
        const b: any = e.target.closest('button'), id: any = b && b.id;
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
    dr.addEventListener('pointerdown', (e: any = undefined) => {
        const pad: any = e.target.closest('.rdx-tap');
        if (pad) {
            e.preventDefault();
            rdRhPress('p' + e.pointerId, pad.dataset.hand || 'R');
            return;
        }
        const k: any = e.target.closest('.rdx-kb.inter [data-m]');
        if (k) {
            e.preventDefault();
            if (RD.kbDown != null)
                handleNoteOff(RD.kbDown, 'rdk');
            const m: any = +k.dataset.m;
            RD.kbDown = m;
            handleNoteOn(m, 96, 'rdk');
        }
    });
    const up: any = (e: any = undefined) => { rdRhRelease('p' + e.pointerId); if (RD.kbDown != null) {
        const m: any = RD.kbDown;
        RD.kbDown = null;
        handleNoteOff(m, 'rdk');
    } };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('keyup', (e: any = undefined) => { const k: any = e.key.toLowerCase(); if (k === ' ' || k === 'enter' || k === 'f' || k === 'j')
        rdRhRelease('k:' + k); });
    dr.addEventListener('change', (e: any = undefined) => {
        const id: any = e.target.id, p: any = rdData().prefs;
        if (id === 'rdx-snd') {
            p.sound = e.target.checked;
            saveAll();
        }
        else if (id === 'rdx-hints') {
            p.hints = e.target.checked;
            saveAll();
        }
        else if (id === 'rdx-rhdur') {
            if (RD.rh && RD.rh.playing) {
                e.target.checked = !e.target.checked;
                return;
            }
            p.rhDur = e.target.checked;
            saveAll();
            rdRhNew(true);
        }
        else if (id === 'rdx-c-clef') {
            const d: any = RD_CDEF[e.target.value];
            $('rdx-c-lo').value = d[0];
            $('rdx-c-hi').value = d[1];
            rdCustomRead();
        }
        else if (/^rdx-c-/.test(id))
            rdCustomRead();
    });
    $('rdp-stats').addEventListener('click', (e: any = undefined) => { if (e.target.id === 'rdx-reset' && confirm(t('rdx_reset_q'))) {
        const d: any = rdData();
        d.nt = {};
        d.tot = { n: 0, ok: 0, ms: 0, sess: 0 };
        saveAll();
        rdRenderStats();
    } });
    const g: any = $('rd-gen');
    if (g)
        g.addEventListener('click', rdGenMelody);
    ['set-lang', 'set-notation'].forEach((id: any = undefined) => { const el: any = $(id); if (el)
        el.addEventListener('click', () => setTimeout(rdOnLocale, 0)); });
})();
/* ---------- COACHING: one short tip per surface, chosen from what is on screen and how the last attempt went ----------
   Read & play keeps a "Reading focus" line under the score (piece, mode, hands and the slips made so far) that becomes a
   "Next step" when a run ends; reading drills get a focus line for the drill type and a next step in their summary; Score &
   analysis gets "What to notice" in Now and a next step in the practice summary. A tip keeps the facts it was chosen from
   and is re-worded after a language or notation change. */
function tf(k: any = undefined, ...a: any[]): any { let s: any = t(k); ['%a', '%b', '%c'].forEach((p: any = undefined, i: any = undefined) => { if (a[i] != null)
    s = s.split(p).join(String(a[i])); }); return s; }
function coachList(xs: any = undefined): any { try {
    return new Intl.ListFormat(lang, { type: 'conjunction' }).format(xs);
}
catch (e: any) {
    return xs.join(', ');
} }
const coachText: any = (c: any = undefined) => tf(c.k, ...(c.args ? c.args() : []));
// The lead ("Reading focus:", "Next step:"), the tip, and an optional button that does what the tip suggests.
function coachHTML(lead: any = undefined, c: any = undefined, actId: any = undefined): any {
    const e: any = xmlEsc, act: any = c.act ? tf(c.act.k, ...(c.act.args ? c.act.args() : [])) : '';
    return `<span class="coach-k">${e(lead)}</span> <span class="coach-t">${e(coachText(c))}</span>` + (act ? `<span class="coach-act"><button type="button" class="btn sm" id="${actId}">${e(act)}</button></span>` : '');
}
/* Read & play */
const srStepNo: any = (n: any = undefined) => n.oct * 7 + n.li;
function srKeyNames(keyN: any = undefined): any { return (keyN > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3]).slice(0, Math.abs(keyN)).map((li: any = undefined) => spelledName(notation, li, keyN > 0 ? 1 : -1)); }
// The active hands as onsets per hand: melodic moves, leaps (a third or wider), chords, and whether the rhythm goes beyond whole beats.
function srShape(): any {
    const sel: any = srActiveHands(), f: any = { moves: 0, leaps: 0, chords: 0, hands: 0, rhythm: false };
    ['rh', 'lh'].forEach((h: any = undefined) => {
        if (sel !== 'both' && sel !== h)
            return;
        const by: any = new Map();
        SR.notes.forEach((n: any = undefined) => { if (n.hand !== h)
            return; const k: any = n.beat.toFixed(3); if (!by.has(k))
            by.set(k, []); by.get(k).push(n); });
        if (!by.size)
            return;
        f.hands++;
        let prev: any = null;
        [...by.values()].sort((a: any = undefined, b: any = undefined) => a[0].beat - b[0].beat).forEach((g: any = undefined) => {
            if (g.length > 1)
                f.chords++;
            else if (prev && prev.length === 1) {
                f.moves++;
                if (Math.abs(srStepNo(g[0]) - srStepNo(prev[0])) >= 2)
                    f.leaps++;
            }
            if (g.some((n: any = undefined) => n.dur % 1))
                f.rhythm = true;
            prev = g;
        });
    });
    return f;
}
// A wrong key in Step by step: the right note in another octave, the natural instead of a sharp or flat, a slip inside a chord,
// the wrong way from the previous note, or the right way but the wrong distance.
function srSlip(st: any = undefined, m: any = undefined): any {
    const want: any = st.notes.filter((n: any = undefined) => !SR.hit.has(n.nid));
    if (!want.length)
        return null;
    const n: any = want.reduce((a: any = undefined, b: any = undefined) => Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a);
    if (pc(n.midi) === pc(m))
        return { k: 'oct', n, m };
    if (n.acc && m === n.midi - n.acc)
        return { k: 'key', n, m };
    if (st.notes.filter((x: any = undefined) => x.hand === n.hand).length > 1)
        return { k: 'chord', n, m };
    const prev: any = (SR.steps[SR.stepIdx - 1] || { notes: [] }).notes.filter((x: any = undefined) => x.hand === n.hand);
    if (!prev.length)
        return { k: 'other', n, m };
    const p: any = prev.reduce((a: any = undefined, b: any = undefined) => Math.abs(b.midi - n.midi) < Math.abs(a.midi - n.midi) ? b : a);
    return { k: Math.sign(n.midi - p.midi) !== Math.sign(m - p.midi) ? 'dir' : 'dist', n, m };
}
function srSlipNote(st: any = undefined, m: any = undefined): any { const s: any = srSlip(st, m); if (!s)
    return; const E: any = SR.errs || (SR.errs = {}); E[s.k] = (E[s.k] || 0) + 1; if (s.k === 'key')
    SR.slipKey = s; srCoach(); }
function srTopSlip(): any { const E: any = SR.errs || {}; let top: any = null; ['key', 'oct', 'chord', 'dir', 'dist'].forEach((k: any = undefined) => { if ((E[k] || 0) >= 2 && (!top || E[k] > E[top]))
    top = k; }); return top; }
const srSlipNames: any = (s: any = undefined) => [rdLetter(s.n.li), spelledName(notation, s.n.li, s.n.acc)]; // what was played (the natural), what is written
// Reading focus: the slip being repeated right now, else what this piece asks for in this mode.
function srFocus(): any {
    const p: any = SR.piece;
    if (!p)
        return null;
    const rec: any = p.ephemeral ? null : data.sheet[p.id];
    if (SR.modeSel === 'assess')
        return { k: srShape().rhythm && !(rec && rec.best) ? 'rc_rhythm' : 'rc_ahead' };
    const top: any = SR.active && srTopSlip();
    if (top === 'key' && SR.slipKey) {
        const s: any = SR.slipKey;
        return { k: 'rc_e_key', args: () => srSlipNames(s) };
    }
    if (top)
        return { k: 'rc_e_' + top };
    const f: any = srShape();
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
function srNextLearn(): any {
    const E: any = SR.errs || {}, top: any = srTopSlip();
    if (!SR.mistakes)
        return { k: 'rn_clean', act: { k: 'rn_act_assess', run: () => srSetMode('assess') } };
    if (top === 'key' && SR.slipKey) {
        const s: any = SR.slipKey;
        return { k: 'rn_key', args: () => srSlipNames(s) };
    }
    if (top)
        return { k: 'rn_' + top, args: () => [E[top]] };
    return { k: 'rn_again' };
}
// After Assessment: the score, extra notes, and where the misses were — leaps, chords or altered notes — compared with the rest.
function srNextAssess(pct: any = undefined): any {
    const p: any = SR.piece, bpm: any = SR.bpm, rec: any = p.ephemeral ? null : data.sheet[p.id], bad: any = (n: any = undefined) => SR.results[n.nid] !== 'good';
    if (pct >= 95)
        return bpm <= 150 ? { k: 'rn_a_clean', args: () => [pct, bpm + 10], act: { k: 'rn_act_bpm', args: () => [bpm + 10], run: () => srSetBpm(bpm + 10) } } : { k: 'rn_a_top' };
    const cat: any = { leaps: [0, 0], chords: [0, 0], acc: [0, 0] }, last: any = {};
    let all: any = 0, miss: any = 0;
    SR.steps.forEach((st: any = undefined) => ['rh', 'lh'].forEach((h: any = undefined) => {
        const g: any = st.notes.filter((n: any = undefined) => n.hand === h);
        if (!g.length)
            return;
        const prev: any = last[h];
        last[h] = g;
        g.forEach((n: any = undefined) => {
            const b: any = bad(n) ? 1 : 0;
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
    const rate: any = miss / Math.max(1, all);
    let top: any = null, best: any = 0;
    Object.entries(cat).forEach(([k, [b, n]]: any = undefined) => { const r: any = n ? b / n : 0; if (b >= 2 && r >= Math.max(.34, rate * 1.5) && r > best) {
        top = k;
        best = r;
    } });
    if (top)
        return { k: 'rn_a_' + top };
    if (pct < 80) {
        const v: any = Math.max(40, bpm - 10);
        return { k: 'rn_a_slow', args: () => [v], act: { k: 'rn_act_bpm', args: () => [v], run: () => srSetBpm(v) } };
    }
    return { k: 'rn_a_good' };
}
function srSetMode(v: any = undefined): any { SR.modeSel = v; [...$('rd-mode').children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false')); srStopAll(); $('rd-verdict').textContent = ''; $('rd-go').focus(); }
function srSetBpm(v: any = undefined): any { if (SR.active || SR.listening)
    return; const b: any = $('rd-bpm'); b.value = v; $('rd-bpmLbl').textContent = v; SR.bpm = v; SR.next = null; srCoach(); $('rd-go').focus(); }
// One line under the score; it is a polite live region, so it is only rewritten when the tip itself changes.
function srCoach(): any {
    const box: any = $('rd-coach');
    if (!box)
        return;
    const c: any = SR.piece ? (SR.next || srFocus()) : null, html: any = c ? coachHTML(t(SR.next ? 'coach_next' : 'coach_focus'), c, 'rd-coach-act') : '';
    box.dataset.kind = SR.next ? 'next' : 'focus';
    if (box._html !== html) {
        box._html = html;
        box.innerHTML = html;
    }
}
/* Reading drills */
function rdFocus(L: any = undefined): any {
    if (!L)
        return null;
    const x: any = rdLetter, c: any = L.clef;
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
        return { k: 'rdc_' + L.tag, args: () => [L.set.map((s: any = undefined) => rdName(rdP(s))).join(' ')] };
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
function rdCoach(show: any = undefined): any { const box: any = $('rdx-coach'); if (!box)
    return; const c: any = show ? rdFocus(RD.L) : null; box.hidden = !c; box.innerHTML = c ? coachHTML(t('coach_focus'), c) : ''; }
// The session's next step: accuracy first, then the notes missed most, then speed; rhythm drills look at the average timing.
function rdNextStep(L: any = undefined, mode: any = undefined, acc: any = undefined, avg: any = undefined, stars: any = undefined, weak: any = undefined): any {
    if (L.ty === 'rh') {
        const m: any = RD.rhM || [], mean: any = m.length ? m.reduce((a: any = undefined, b: any = undefined) => a + b, 0) / m.length : 0;
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
    const tg: any = rdTarget(L) / 1000, sec: any = avg / 1000;
    if (mode === 'rush')
        return RD.n - RD.ok >= 3 ? { k: 'rdn_rush' } : { k: 'rdn_ok' };
    if (acc < 80)
        return { k: 'rdn_hints', act: { k: 'rdn_act_hints', run: () => { rdData().prefs.hints = true; saveAll(); rdStart('practice'); } } };
    if (weak.length && acc < 95)
        return { k: 'rdn_weak', args: () => [weak.slice(0, 3).map(([k]: any = undefined) => rdKeyText(k)).join(', ')], act: mode === 'practice' ? null : { k: 'rdn_act_practice', run: () => rdStart('practice') } };
    if (sec > tg)
        return { k: 'rdn_speed', args: () => [anNum(sec, 1), anNum(tg, 1)], act: { k: 'rdn_act_rush', run: () => rdStart('rush') } };
    if (mode === 'practice')
        return { k: 'rdn_test', act: { k: 'rdn_act_test', run: () => rdStart('test') } };
    if (stars < 3)
        return { k: 'rdn_star', args: () => [stars >= 2 ? 95 : 90, anNum(stars >= 2 ? tg : tg * 1.6, 1)] };
    const nx: any = rdLvNext(L);
    if (!L.custom && nx && rdUnlocked(nx))
        return { k: 'rdn_next', args: () => [rdLvName(nx)] };
    return { k: 'rdn_ok' };
}
function rdNextRender(): any { const box: any = $('rdx-next'); if (box && RD.next)
    box.innerHTML = coachHTML(t('coach_next'), RD.next, 'rdx-next-act'); }
/* Score & analysis · Now: one thing worth noticing in the bar (or passage, or selection) on show, from its own analysis */
function anCoach(f: any = undefined, segs: any = undefined, notes: any = undefined): any {
    if (!f || !AN.view || !notes.length)
        return null;
    const v: any = AN.view, one: any = f.a === f.b, fall: any = FALL.mode === 'fall', K: any = (s: any = undefined) => anKeyAt(s.start), lab: any = (s: any = undefined) => anChordLabel(s, K(s)), rn: any = (s: any = undefined) => anRoman(K(s), s);
    const tip: any = (k: any = undefined, ...a: any[]) => ({ h: t(f.kind === 'sel' ? 'coach_sel' : one ? 'coach_bar' : 'coach_pass'), text: tf(k, ...a) });
    const cadTip: any = (s: any = undefined) => { const a: any = v.segs[v.segs.indexOf(s) - 1]; return tip('cn_cad_' + s.cad, s.cad === 'half' || !a ? rn(s) : rn(a) + ' → ' + rn(s)); };
    const nct: any = segs.flatMap((s: any = undefined) => (s.nct || []).filter((x: any = undefined) => x.type !== 'other').map((x: any = undefined) => ({ x, s }))), nctNames: any = () => [...new Set(nct.map(({ x, s }: any = undefined) => spellName(x.note.midi, K(s), true)))];
    if (!segs.length)
        return fall ? tip('cn_fall') : null;
    if (!one) {
        const info: any = anKeyInfo(notes), main: any = v.mainKey;
        if (info.conf !== 'low' && (info.best.root !== main.root || !!info.best.minor !== !!main.minor))
            return tip('cn_key', anKeyName(info.best), anKeyName(main));
        const cad: any = segs.filter((s: any = undefined) => s.cad).pop();
        if (cad)
            return cadTip(cad);
        if (nct.length >= 2) {
            const ns: any = nctNames();
            return tip('cn_nct_pass', ns.slice(0, 3).join(', ') + (ns.length > 3 ? ' …' : ''));
        }
        return tip(fall ? 'cn_fall' : 'cn_bass');
    }
    const cad: any = segs.find((s: any = undefined) => s.cad);
    if (cad)
        return cadTip(cad);
    if (nct.length)
        return tip('cn_nct', coachList(nctNames().slice(0, 3)), [...new Set(nct.map(({ x }: any = undefined) => t('an_nct_' + x.type)))].join(', '));
    const sec: any = segs.find((s: any = undefined) => rn(s).includes('/'));
    if (sec)
        return tip('cn_sec', lab(sec), rn(sec));
    const inv: any = !v.implied && segs.find((s: any = undefined) => anInv(s) > 0);
    if (inv) {
        const k: any = K(inv);
        return tip('cn_inv', spellName(60 + inv.bass, k), spellName(60 + inv.ch.root, k) + inv.ch.c.s + ', ' + invName(anInv(inv)));
    }
    const amb: any = segs.find((s: any = undefined) => s.ch.conf === 'low');
    if (amb)
        return tip('cn_amb', [lab(amb), ...amb.ch.alts.map((a: any = undefined) => spellName(60 + a.root, K(amb)) + a.c.s)].slice(0, 3).join(' / '));
    if (v.implied)
        return tip('cn_implied', lab(segs[0]));
    if (fall)
        return tip('cn_fall');
    const s: any = segs[0];
    return tip('cn_' + anFnKey(K(s), s, rn(s)), lab(s));
}
/* Score & analysis · practice summary: the next step from how the run went — clean, slips bunched in a bar or two, missed notes,
   wrong keys, or loose timing — with a button that sets it up and plays the same passage again. */
function pracWeakHand(): any { let rh: any = 0, lh: any = 0; PRAC.res.forEach((r: any = undefined, i: any = undefined) => { if (r !== 'miss')
    return; const n: any = AN.notes[i]; if (n && anHandOf(n) === 'lh')
    lh++;
else
    rh++; }); return lh > rh ? 'lh' : 'rh'; }
function pracLoopBars(i: any = undefined, j: any = undefined): any {
    const ms: any = anMeasures(), lo: any = ms[i].start, hi: any = ms[j].end, g: any = SCORE.geo, gi: any = (b: any = undefined) => g ? g.measures.findIndex((m: any = undefined) => m && b >= m.b0 - 1e-6 && b < m.b1 - 1e-6) : -1, a: any = gi(lo + 1e-4), b: any = gi(hi - 1e-4);
    if (a >= 0 && b >= 0)
        scoreSelectRange(a, b);
    else
        anSelectNotes(AN.notes.filter((n: any = undefined) => n.start >= lo - 1e-6 && n.start < hi - 1e-6));
    if (AN.selected.size)
        scoreLoopStart();
}
function pracNextStep(R: any = undefined): any {
    const st: any = PRAC.stats, acc: any = st && pracAcc(st);
    if (acc == null)
        return null;
    const f: any = (R.segs && R.segs[0] && R.segs[0].f) || pracFactor(), both: any = new Set(AN.notes.map(anHandOf)).size > 1;
    const again: any = () => { pracSumClose(); if (R.sel && AN.selected.size)
        scorePlay(true);
    else
        scorePlay(false, R.from); };
    if (acc >= .95 && st.wrong <= 1) {
        const sel: any = $('score-speed'), next: any = [...sel.options].map((o: any = undefined) => +o.value).find((v: any = undefined) => v > Math.round(f * 100) && v <= 100);
        if (next)
            return { k: 'pn_clean_tempo', args: () => [Math.round(f * 100) + '%'], act: { k: 'pn_act_faster', args: () => [next + '%'], run: () => { sel.value = String(next); pracHud(); anUpdateControls(); again(); } } };
        if (PRAC.hands !== 'both' && both)
            return { k: 'pn_clean_hands', act: { k: 'rd_both', run: () => { pracSet('hands', 'both'); again(); } } };
        if (PRAC.wait)
            return { k: 'pn_clean_wait', act: { k: 'pn_act_time', run: () => { pracSet('wait', false); again(); } } };
        return { k: 'pn_clean' };
    }
    const ms: any = anMeasures(), bar: any = (b: any = undefined) => { let i: any = 0; for (let j: any = 0; j < ms.length; j++) {
        if (ms[j].start <= b + 1e-6)
            i = j;
        else
            break;
    } return i; };
    const misses: any = [...PRAC.res].filter(([, r]: any = undefined) => r === 'miss').map(([i]: any = undefined) => AN.notes[i]).filter(Boolean);
    if (misses.length >= 3 && bar(scoreBeatAt(R.b) - 1e-4) - bar(scoreBeatAt(R.a)) >= 3) {
        const per: any = new Map();
        misses.forEach((n: any = undefined) => { const i: any = bar(n.start); per.set(i, (per.get(i) || 0) + 1); });
        let best: any = null;
        per.forEach((c: any = undefined, i: any = undefined) => { const two: any = c + (per.get(i + 1) || 0); if (!best || two > best.c)
            best = { i, j: per.has(i + 1) ? i + 1 : i, c: two }; });
        if (best.c >= misses.length * .6) {
            const label: any = () => anBarsLabel(AN.notes.filter((n: any = undefined) => { const i: any = bar(n.start); return i >= best.i && i <= best.j; }));
            return { k: 'pn_bars', args: () => [label()], act: { k: 'pn_act_loop', args: () => [label()], run: () => { pracSumClose(); pracLoopBars(best.i, best.j); } } };
        }
    }
    if (st.miss >= 3 && st.miss >= st.wrong && !PRAC.wait)
        return { k: 'pn_wait', args: () => [st.miss], act: { k: 'pr_wait', run: () => { pracSet('wait', true); again(); } } };
    if (st.wrong >= 3 && st.wrong > st.miss) {
        const h: any = PRAC.hands === 'both' && both ? pracWeakHand() : null;
        return { k: 'pn_wrong', args: () => [st.wrong], act: h ? { k: h === 'lh' ? 'rd_lh' : 'rd_rh', run: () => { pracSet('hands', h); again(); } } : null };
    }
    if (st.good > st.perfect && st.good >= 4)
        return { k: FALL.mode === 'fall' ? 'pn_loose_fall' : 'pn_loose' };
    return { k: acc < .7 ? 'pn_slower' : 'pn_ok' };
}
function pracNextRender(): any { const box: any = $('pr-sum-next'), n: any = PRAC.next; if (!box)
    return; box.hidden = !n; box.innerHTML = n ? coachHTML(t('coach_next'), n, 'pr-next-act') : ''; }
// Language or note names changed: re-word every tip on show.
function coachRefresh(): any { srCoach(); if (RD.L && !$('rdx-coach').hidden)
    rdCoach(true); rdNextRender(); if (!$('pr-sum').hidden)
    pracNextRender(); }
/* ---------- SCORE & ANALYSIS ---------- */
const AN: any = { notes: [], selected: new Set(), active: null, source: null, recon: { hands: 'auto', grid: 4, key: 'auto' }, hands: null, keyMap: [], keyOrigin: 'auto',
    index: new Map(), version: 0, cache: new Map(), view: null, wsSig: '', rove: 0, playSeg: -1, playSig: '', kbCenter: false, kbApplied: new Map(), error: null, loading: false, loadToken: 0 };
const AN_MAX_XML_CHARS: any = 33554432, AN_MAX_BYTES: any = 2097152, AN_MAX_NOTES: any = 5000, AN_PRACTICE_BARS: any = 32, AN_EXAMPLES: any = ['minuet', 'elise', 'ode', 'twinkle', 'jingle'];
function anError(code: any = undefined, detail: any = undefined): any { const e: any = new Error(detail || code); e.code = code; return e; }
function tl(L: any = undefined, k: any = undefined, a: any = undefined, b: any = undefined): any { let v: any = (STRINGS[L] && STRINGS[L][k] != null) ? STRINGS[L][k] : STRINGS.en[k]; if (v == null)
    return k; if (a != null)
    v = v.replace('%s', a).replace('%a', a); if (b != null)
    v = v.replace('%b', b); return v; }
function anParse(buffer: any = undefined): any {
    const a: any = new Uint8Array(buffer), v: any = new DataView(buffer);
    let pos: any = 0;
    const need: any = (n: any = undefined) => { if (n < 0 || pos + n > a.length)
        throw anError('midi', 'truncated'); };
    const u8: any = () => { need(1); return a[pos++]; }, u16: any = () => { need(2); const n: any = v.getUint16(pos); pos += 2; return n; }, u32: any = () => { need(4); const n: any = v.getUint32(pos); pos += 4; return n; };
    const tag: any = () => String.fromCharCode(u8(), u8(), u8(), u8());
    const vlq: any = () => { let n: any = 0; for (let i: any = 0; i < 4; i++) {
        const b: any = u8();
        n = n * 128 + (b & 127);
        if (!(b & 128))
            return n;
    } throw anError('midi', 'VLQ'); };
    if (tag() !== 'MThd')
        throw anError('midi', 'header');
    const len: any = u32();
    if (len < 6)
        throw anError('midi', 'header');
    const format: any = u16(), tracks: any = u16(), ppq: any = u16();
    if (format > 1 || !tracks || tracks > 128 || !ppq || (ppq & 0x8000))
        throw anError('midi', 'format');
    need(len - 6);
    pos += len - 6;
    const notes: any = [], meta: any = [], names: any = [];
    for (let ti: any = 0; ti < tracks; ti++) {
        if (tag() !== 'MTrk')
            throw anError('midi', 'track');
        const size: any = u32();
        need(size);
        const end: any = pos + size;
        let tick: any = 0, running: any = 0;
        const active: any = new Map();
        while (pos < end) {
            tick += vlq();
            let status: any = u8(), first: any = null;
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
                const type: any = u8(), n: any = vlq();
                need(n);
                const beat: any = tick / ppq;
                if (type === 3 && n && names[ti] == null)
                    names[ti] = String.fromCharCode(...a.subarray(pos, pos + Math.min(n, 64))).trim();
                if (type === 81 && n === 3) {
                    const us: any = a[pos] * 65536 + a[pos + 1] * 256 + a[pos + 2];
                    if (us)
                        meta.push({ type: 'tempo', beat, bpm: 60000000 / us });
                }
                if (type === 88 && n >= 2 && a[pos] > 0 && a[pos + 1] <= 5)
                    meta.push({ type: 'time', beat, num: a[pos], den: 2 ** a[pos + 1] });
                if (type === 89 && n >= 2) {
                    const fifths: any = (a[pos] << 24) >> 24;
                    if (Math.abs(fifths) <= 7)
                        meta.push({ type: 'key', beat, fifths, minor: a[pos + 1] === 1 });
                }
                pos += n;
            }
            else if (status === 240 || status === 247) {
                const n: any = vlq();
                need(n);
                pos += n;
            }
            else if (status >= 240)
                throw anError('midi', 'system');
            else {
                const cmd: any = status & 240, ch: any = status & 15, d1: any = first === null ? u8() : first, d2: any = (cmd === 192 || cmd === 208) ? 0 : u8();
                if (d1 > 127 || d2 > 127)
                    throw anError('midi', 'data');
                if (ch !== 9 && (cmd === 144 || cmd === 128)) {
                    const k: any = ch + ':' + d1;
                    if (cmd === 144 && d2 > 0) {
                        if (!active.has(k))
                            active.set(k, []);
                        active.get(k).push({ start: tick, midi: d1, vel: d2 });
                    }
                    else {
                        const q: any = active.get(k);
                        if (q && q.length) {
                            const n: any = q.shift();
                            if (tick > n.start)
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
    return { ppq, format, tracks, names, meta: meta.sort((a: any = undefined, b: any = undefined) => a.beat - b.beat), notes: notes.sort((x: any = undefined, y: any = undefined) => x.start - y.start || x.midi - y.midi) };
}
// Built-in pieces become the same parsed structure as a MIDI file: one "track" per hand, beats in quarter notes.
function anPieceToParsed(p: any = undefined): any {
    const cap: any = p.ts[1] === 8 ? p.ts[0] * 0.5 : p.ts[0] * 4 / p.ts[1], shift: any = p.pickup ? (cap - p.pickup) % cap : 0, notes: any = [];
    [['rh', 0], ['lh', 1]].forEach(([hand, track]: any = undefined) => { if (!p[hand])
        return; srEvents(p[hand]).ev.forEach((e: any = undefined) => { if (!e.rest)
        notes.push({ midi: e.midi, start: e.beat + shift, end: e.beat + shift + e.dur, vel: hand === 'rh' ? 92 : 74, track, channel: track, srcHand: hand }); }); });
    notes.sort((x: any = undefined, y: any = undefined) => x.start - y.start || x.midi - y.midi);
    return { ppq: 480, format: 1, tracks: notes.some((n: any = undefined) => n.track === 1) ? 2 : 1, names: ['Right hand', 'Left hand'], notes,
        meta: [{ type: 'tempo', beat: 0, bpm: p.bpm }, { type: 'time', beat: 0, num: p.ts[0], den: p.ts[1] }, { type: 'key', beat: 0, fifths: p.keyN || 0, minor: !!p.minor }] };
}
/* keys, spelling */
const KEY_MAJ_FIFTHS: any = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 }, LETTER_PC: any = [0, 2, 4, 5, 7, 9, 11];
const LETTERS: any = { letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], solfege: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], german: ['C', 'D', 'E', 'F', 'G', 'A', 'H'] };
// B-flat is B in German; B-natural and other alterations use H.
function spelledName(sys: any = undefined, li: any = undefined, acc: any = undefined, ascii: any = false): any { if (sys === 'german' && li === 6 && acc === -1)
    return 'B'; const symbols: any = ascii ? ['bb', 'b', '', '#', '##'] : ['𝄫', '♭', '', '♯', '𝄪']; return LETTERS[sys][li] + (symbols[acc + 2] || ''); }
function anKeyName(k: any = undefined): any { const f: any = k.fifths != null ? k.fifths : keyFifths(k.root, k.minor), s: any = spellMidi(60 + k.root, f, k.minor); return spelledName(notation, s.li, s.acc, true) + ' ' + t(k.minor ? 'an_minor' : 'an_major'); }
// Key-aware spelling: diatonic notes follow the signature, minor keys raise 6/7 on their own letters, other notes take the key's accidental direction.
function anKeyAt(beat: any = undefined): any { const ks: any = AN.keyMap; if (!ks.length)
    return { root: 0, minor: false, fifths: 0 }; let k: any = ks[0]; for (const x of ks)
    if (x.beat <= beat + 1e-6)
        k = x; return k; }
function spellName(m: any = undefined, key: any = undefined, withOct: any = undefined): any { const k: any = key || anKeyAt(0), s: any = spellMidi(m, k.fifths, k.minor); return spelledName(notation, s.li, s.acc, true) + (withOct ? s.oct : ''); }
// Krumhansl–Kessler key profiles: unlike plain scale coverage, they tell a major key from its relative minor.
const AN_PROFILE: any = { maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
function anKeyInfo(ns: any = undefined): any {
    const ranks: any = anKeyRank(ns), best: any = ranks[0], margin: any = best.score - ranks[1].score;
    const conf: any = ns.length < 12 ? 'low' : best.score >= 0.75 && margin >= 0.08 ? 'high' : best.score >= 0.6 && margin >= 0.03 ? 'medium' : 'low';
    return { best, alts: ranks.slice(1, 4), conf };
}
/* harmony */
// Chord templates. p: intervals above the root, p[1] the tone that fixes the quality (the third, the suspended tone, or the fifth of
// a power chord); x: a seventh chord (figures ⁷ ⁶₅ ⁴₃ ⁴₂); dom: the dominant-seventh family; ext: tones that must clearly sound for
// the richer reading (a sixth chord needs its fifth as well, or it is a triad in first inversion); cx: a small cost of the richer
// reading; rn: suffix after the Roman numeral; n9: a ninth chord.
const AN_CHORDS: any = [{ s: '', q: 'M', p: [0, 4, 7] }, { s: 'm', q: 'm', p: [0, 3, 7] }, { s: '°', q: 'd', p: [0, 3, 6], cx: .05 }, { s: '+', q: 'A', p: [0, 4, 8], cx: .1 },
    { s: 'sus2', q: 'S', p: [0, 2, 7], cx: .1, rn: 'sus2' }, { s: 'sus4', q: 'S', p: [0, 5, 7], cx: .08, rn: 'sus4' }, { s: '5', q: 'P', p: [0, 7], cx: .06, rn: '5' },
    { s: '6', q: 'M', p: [0, 4, 7, 9], ext: [9, 7], cx: .09, rn: 'add6' }, { s: 'm6', q: 'm', p: [0, 3, 7, 9], ext: [9, 7], cx: .11, rn: 'add6' },
    { s: '7', q: 'M', p: [0, 4, 7, 10], x: 1, dom: 1, ext: [10], cx: .04 }, { s: 'maj7', q: 'M', p: [0, 4, 7, 11], x: 1, ext: [11], cx: .07 }, { s: 'm7', q: 'm', p: [0, 3, 7, 10], x: 1, ext: [10], cx: .05 },
    { s: 'm(maj7)', q: 'm', p: [0, 3, 7, 11], x: 1, ext: [11], cx: .13 }, { s: 'ø7', q: 'h', p: [0, 3, 6, 10], x: 1, ext: [10], cx: .06 }, { s: '°7', q: 'd', p: [0, 3, 6, 9], x: 1, ext: [9], cx: .06 },
    { s: '7sus4', q: 'S', p: [0, 5, 7, 10], x: 1, ext: [10], cx: .11, rn: 'sus4' }, { s: 'add9', q: 'M', p: [0, 4, 7, 2], ext: [2], cx: .12, rn: 'add9' },
    { s: '9', q: 'M', p: [0, 4, 7, 10, 2], x: 1, dom: 1, ext: [10, 2], cx: .11, n9: 1 }, { s: 'm9', q: 'm', p: [0, 3, 7, 10, 2], x: 1, ext: [10, 2], cx: .13, n9: 1 },
    { s: 'maj9', q: 'M', p: [0, 4, 7, 11, 2], x: 1, ext: [11, 2], cx: .14, n9: 1 }, { s: '7♭5', q: 'M', p: [0, 4, 6, 10], x: 1, dom: 1, ext: [6, 10], cx: .15, rn: '♭5' },
    { s: '7♯5', q: 'A', p: [0, 4, 8, 10], x: 1, dom: 1, ext: [8, 10], cx: .15 }];
const anDomQ: any = (c: any = undefined) => !!c.dom || c.q === 'M' && !/maj|6/.test(c.s); // can act as V or V/x: a major triad, add9 or the dominant family
// The chord member in the bass: 1 third, 2 fifth, 3 seventh; suspended and power chords, and an added tone in the bass, count as 0.
function anInv(seg: any = undefined): any { const c: any = seg.ch.c, iv: any = ((seg.bass - seg.ch.root) % 12 + 12) % 12; return c.q === 'S' || c.q === 'P' ? 0 : iv === c.p[1] ? 1 : iv === c.p[2] ? 2 : c.x && iv === c.p[3] ? 3 : 0; }
// The key's diatonic triads (with V and vii° in minor) and V7.
function anMeasures(): any { if (SCORE.measures && SCORE.measures.length)
    return SCORE.measures; const end: any = AN.notes.length ? Math.max(...AN.notes.map((n: any = undefined) => n.end)) : 0, out: any = []; for (let s: any = 0, i: any = 1; s < end; s += 4, i++)
    out.push({ number: String(i), start: s, end: s + 4, num: 4, den: 4 }); return out; }
function anBeatUnit(m: any = undefined): any { return m.den === 8 && m.num % 3 === 0 ? 1.5 : 4 / m.den; }
function anMeasureAt(beat: any = undefined): any { const ms: any = anMeasures(); let m: any = ms[0]; for (const x of ms) {
    if (x.start <= beat + 1e-6)
        m = x;
    else
        break;
} return m; }
// Time-weighted texture: how many notes sound together while anything sounds, and the peak.
function anPoly(ns: any = undefined): any {
    const ev: any = [];
    ns.forEach((n: any = undefined) => { ev.push([n.start, 1]); ev.push([n.end, -1]); });
    ev.sort((a: any = undefined, b: any = undefined) => a[0] - b[0] || a[1] - b[1]);
    let c: any = 0, last: any = null, area: any = 0, on: any = 0, max: any = 0;
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
function anVoiceNeighbors(ns: any = undefined): any {
    const groups: any = new Map(), out: any = new Map(), key: any = (n: any = undefined) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n);
    ns.forEach((n: any = undefined) => { const k: any = key(n); if (!groups.has(k))
        groups.set(k, []); groups.get(k).push(n); });
    groups.forEach((notes: any = undefined) => {
        const onsets: any = [];
        notes.slice().sort((a: any = undefined, b: any = undefined) => a.start - b.start || a.midi - b.midi).forEach((n: any = undefined) => { let g: any = onsets[onsets.length - 1]; if (!g || Math.abs(g.start - n.start) > .001) {
            g = { start: n.start, notes: [] };
            onsets.push(g);
        } g.notes.push(n); });
        onsets.forEach((g: any = undefined, i: any = undefined) => g.notes.forEach((n: any = undefined) => {
            const nearest: any = (a: any = undefined) => a && a.notes.reduce((best: any = undefined, x: any = undefined) => !best || Math.abs(x.midi - n.midi) < Math.abs(best.midi - n.midi) ? x : best, null);
            out.set(n, { prev: nearest(onsets[i - 1]), next: nearest(onsets[i + 1]) });
        }));
    });
    return out;
}
function anClassifyNonChord(ns: any = undefined, segs: any = undefined): any {
    const around: any = anVoiceNeighbors(ns), eps: any = 1e-6, step: any = (a: any = undefined, b: any = undefined) => a && b && Math.abs(a.midi - b.midi) > 0 && Math.abs(a.midi - b.midi) <= 2;
    segs.forEach((seg: any = undefined, si: any = undefined) => {
        const tones: any = new Set(seg.ch.tones), nextSeg: any = segs[si + 1], nextTones: any = nextSeg && new Set(nextSeg.ch.tones), span: any = seg.end - seg.start, seen: any = new Set();
        seg.nct = [];
        seg.notes.forEach((n: any = undefined) => {
            const idx: any = AN.index.get(n);
            if (tones.has(pc(n.midi)) || seen.has(idx))
                return;
            seen.add(idx);
            const ctx: any = around.get(n) || {}, prev: any = ctx.prev, next: any = ctx.next, prevTone: any = prev && tones.has(pc(prev.midi)), nextTone: any = next && tones.has(pc(next.midi));
            let type: any = 'other';
            if (n.start < seg.start - eps && next && next.start >= seg.start - eps && next.start < seg.end + eps && step(n, next) && nextTone)
                type = 'suspension';
            else if (nextSeg && n.start >= seg.end - Math.max(.25, span * .45) && nextTones.has(pc(n.midi)) && (n.end > seg.end + eps || (next && pc(next.midi) === pc(n.midi))))
                type = 'anticipation';
            else if (prev && next && step(prev, n) && step(n, next) && prevTone && nextTone) {
                if (prev.midi === next.midi)
                    type = 'neighbor';
                else if (Math.sign(n.midi - prev.midi) === Math.sign(next.midi - n.midi))
                    type = 'passing';
            }
            seg.nct.push({ note: n, index: idx, type });
        });
    });
}
// Harmony is read in spans of one beat up to a whole bar. Each bar is cut into beat units (half bars for a single line), every
// run of units is matched against the chord templates, and dynamic programming picks the best sequence through the piece: a
// chord change must earn its cost, which is lower on the downbeat and the half bar and higher when the chords share tones. So
// an arpeggio or Alberti bar stays one chord, while a real change on a beat still splits the bar.
// Metric weight of a time point: the downbeat, the middle of an even bar, other beats, half beats, anything shorter.
function anAccent(m: any = undefined, u: any = undefined, x: any = undefined): any {
    const b: any = (x - m.start) / u, n: any = Math.round((m.end - m.start) / u), k: any = Math.round(b);
    return b < 1e-4 ? 1 : Math.abs(b - k) < 1e-4 ? (n % 2 === 0 && 2 * k === n ? .85 : .7) : Math.abs(2 * b - Math.round(2 * b)) < 1e-4 ? .55 : .45;
}
// Where a chord may change in a bar: on its beats (at least an eighth note apart); for a single line only at the half bar.
function anGrid(m: any = undefined, implied: any = undefined): any {
    const len: any = m.end - m.start, u: any = anBeatUnit(m), eps: any = 1e-6;
    if (implied) {
        const half: any = len / 2;
        return len > 3 + eps && Math.abs(half / u - Math.round(half / u)) < eps ? [m.start, m.start + half, m.end] : [m.start, m.end];
    }
    const step: any = Math.max(.5, u), g: any = [m.start];
    for (let b: any = m.start + step; m.end - b >= step - eps; b += step)
        g.push(b);
    g.push(m.end);
    return g;
}
// Per note: the metric weight of its onset, and less weight for a probable passing or neighbour note (a short note alone in its
// voice, approached and left by step, off the strong beats). res: when a melodic note moves on by step. A step only counts when
// one note gives way to the next (not two voices of a held chord), and a figure like the G–F–G of a G7 Alberti bass, framed by
// leaps, is a broken chord rather than a neighbour note.
function anNoteInfo(sorted: any = undefined): any {
    const around: any = anVoiceNeighbors(sorted), ms: any = anMeasures(), out: any = new Map(), count: any = new Map(), eps: any = 1e-6;
    const vk: any = (n: any = undefined) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n) + '|' + n.start.toFixed(3), d: any = (a: any = undefined, b: any = undefined) => a && b ? Math.abs(a.midi - b.midi) : 0;
    const step: any = (a: any = undefined, b: any = undefined) => d(a, b) > 0 && d(a, b) <= 2 && a.end <= b.start + .125 && b.start > a.start;
    sorted.forEach((n: any = undefined) => count.set(vk(n), (count.get(vk(n)) || 0) + 1));
    let j: any = 0;
    for (const n of sorted) {
        while (j + 1 < ms.length && ms[j + 1].start <= n.start + eps)
            j++;
        const m: any = ms[j], { prev, next } = around.get(n) || {}, alone: any = count.get(vk(n)) === 1;
        if (!m) {
            out.set(n, { acc: 1, emb: 1, res: Infinity });
            continue;
        }
        const fig: any = prev && next && prev.midi === next.midi && d((around.get(prev) || {}).prev, prev) > 2 && d(next, (around.get(next) || {}).next) > 2;
        const u: any = anBeatUnit(m), acc: any = anAccent(m, u, n.start), on: any = alone && !fig && step(n, next);
        out.set(n, { acc, emb: on && acc < .85 && n.end - n.start <= u + eps && step(prev, n) ? .4 : 1, res: on ? next.start : Infinity });
    }
    return out;
}
// Weighted pitch classes per grid unit: sounding time × the metric weight of the onset (of the unit start for a held note) × the
// passing-note factor. low: the bass at the start of the unit; held: pitch classes held over into it.
function anUnits(m: any = undefined, grid: any = undefined, here: any = undefined, info: any = undefined): any {
    const U: any = [], u: any = anBeatUnit(m), eps: any = 1e-6;
    for (let i: any = 0; i + 1 < grid.length; i++) {
        const s: any = grid[i], e: any = grid[i + 1], w: any = Array(12).fill(0), res: any = [], acc: any = anAccent(m, u, s);
        let T: any = 0, low: any = null, any: any = null, held: any = 0;
        for (const n of here) {
            const d: any = Math.min(n.end, e) - Math.max(n.start, s);
            if (d <= eps)
                continue;
            const f: any = info.get(n), p: any = pc(n.midi), x: any = d * (n.start < s - eps ? acc : f.acc) * f.emb;
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
function anSpan(U: any = undefined, a: any = undefined, b: any = undefined): any {
    const w: any = Array(12).fill(0), sw: any = Array(12).fill(0), e: any = U[b - 1].e;
    let T: any = 0, bass: any = null;
    for (let i: any = a; i < b; i++) {
        const u: any = U[i];
        T += u.T;
        for (let p: any = 0; p < 12; p++)
            w[p] += u.w[p];
        if (bass == null && u.low != null)
            bass = pc(u.low);
        for (const [p, x, r] of u.res)
            if (r < e - 1e-6)
                sw[p] -= x;
    }
    for (let p: any = 0; p < 12; p++)
        sw[p] += w[p];
    return { a, b, s: U[a].s, e, w, sw, T, bass };
}
// How well one template explains a span; cover is the share of the weighted notes that are chord tones. The root must sound
// clearly, the tone that fixes the quality must sound and colour tones must sound clearly; of the rest only a triad's fifth may be
// missing. Suspended and power chords need the third to be absent. complete: every chord tone sounds.
function anFit(S: any = undefined, root: any = undefined, c: any = undefined, dia: any = undefined): any {
    const w: any = S.w, T: any = S.T, tones: any = c.p.map((i: any = undefined) => (root + i) % 12);
    if (!(w[root] >= .05 * T && w[tones[1]] > 0))
        return null;
    if ((c.q === 'S' || c.q === 'P') && (Math.max(w[(root + 3) % 12], w[(root + 4) % 12]) > .03 * T || c.q === 'S' && S.sw[tones[1]] < .04 * T))
        return null;
    if (c.ext)
        for (const i of c.ext)
            if (S.sw[(root + i) % 12] < (i === 2 ? .08 : .04) * T)
                return null;
    let miss: any = 0;
    for (let k: any = 2; k < tones.length; k++)
        if (!(w[tones[k]] > 0)) {
            if (c.p[k] === 7 && (c.q === 'M' || c.q === 'm'))
                miss = .08;
            else
                return null;
        }
    let cw: any = 0;
    tones.forEach((p: any = undefined) => { cw += w[p]; });
    const cover: any = cw / T;
    if (cover < .5)
        return null;
    return { root, c, tones, cover, complete: !miss, fit: 2 * cover - 1 - (c.cx || 0) - miss + (S.bass === root ? .06 : tones.includes(S.bass) ? 0 : -.06) + (dia.has(root + ':' + c.s) ? .02 : 0) };
}
// A single line only implies harmony, so it is matched against the key's chords (with V and vii° in minor).
function anFitImplied(S: any = undefined, key: any = undefined): any {
    const out: any = [];
    if (!(S.T > 0))
        return out;
    for (const d of anDiatonic(key, AN_CHORDS)) {
        const tones: any = d.c.p.map((i: any = undefined) => (d.root + i) % 12);
        if (!(S.w[d.root] > 0) || tones.filter((p: any = undefined) => S.w[p] > 0).length < 2 || d.c.x && !(S.w[tones[3]] > 0))
            continue;
        let cw: any = 0;
        tones.forEach((p: any = undefined) => { cw += S.w[p]; });
        const cover: any = cw / S.T;
        if (cover < .5)
            continue;
        out.push({ root: d.root, c: d.c, tones, cover, complete: tones.every((p: any = undefined) => S.w[p] > 0), fit: 2 * cover - 1 + .2 * S.w[d.root] / S.T + 2 * (d.pref || 0) - (d.c.x ? .06 : 0) });
    }
    return out.sort((a: any = undefined, b: any = undefined) => b.fit - a.fit);
}
function anCands(S: any = undefined, implied: any = undefined): any {
    const key: any = anKeyAt(S.s);
    if (implied)
        return anFitImplied(S, key);
    const dia: any = new Set(anDiatonic(key, AN_CHORDS).map((d: any = undefined) => d.root + ':' + d.c.s)), out: any = [];
    if (S.T > 0)
        for (let r: any = 0; r < 12; r++)
            if (S.w[r] > 0)
                for (const c of AN_CHORDS) {
                    const x: any = anFit(S, r, c, dia);
                    if (x)
                        out.push(x);
                }
    return out.sort((a: any = undefined, b: any = undefined) => b.fit - a.fit);
}
// A rich chord over a long span may be two harmonies in a row (C then G reads as Cmaj9). When the span splits into two parts whose
// best readings are complete chords, neither holding the other, the rich reading loses the weight of the smaller part. A part that
// already reads as the rich chord, and the upper three notes of a dominant seventh (B–D–F of G7), do not count as another chord.
function anUnion(sp: any = undefined, a: any = undefined, b: any = undefined): any {
    const S: any = sp[a][b], id: any = (tones: any = undefined) => tones.slice().sort((p: any = undefined, q: any = undefined) => p - q).join(), within: any = (y: any = undefined, x: any = undefined) => y.tones.every((p: any = undefined) => x.tones.includes(p));
    let hit: any = false;
    for (const X of S.all) {
        if (X.tones.length < 4)
            continue;
        const up: any = X.c.dom ? id(X.tones.slice(1)) : '', top: any = (Z: any = undefined) => { const y: any = Z.all[0]; return y && y.complete && y.cover >= .75 && !within(X, y) && id(y.tones) !== up ? y : null; };
        let pen: any = 0;
        for (let k: any = a + 1; k < b; k++) {
            const y: any = top(sp[a][k]), z: any = top(sp[k][b]);
            if (y && z && !within(y, z) && !within(z, y))
                pen = Math.max(pen, Math.min(sp[a][k].T, sp[k][b].T));
        }
        if (pen) {
            X.fit -= pen / S.T;
            hit = true;
        }
    }
    if (hit)
        S.all.sort((x: any = undefined, y: any = undefined) => y.fit - x.fit);
}
// How sure a reading is. exact: every chord tone sounds, little else does and no other chord comes close. likely: the best
// reading, though a tone is missing, other notes sound or a rival is near. suggested: ambiguous, or implied by a single line.
function anRate(x: any = undefined, all: any = undefined, implied: any = undefined): any {
    const id: any = (y: any = undefined) => y.tones.slice().sort((p: any = undefined, q: any = undefined) => p - q).join(), own: any = id(x), rival: any = all.find((y: any = undefined) => id(y) !== own), margin: any = rival ? x.fit - rival.fit : 1;
    const det: any = implied ? 'suggested' : x.complete && x.cover >= .8 && margin >= .1 ? 'exact' : x.cover >= .6 && margin >= .04 ? 'likely' : 'suggested';
    return { root: x.root, c: x.c, tones: x.tones, cover: x.cover, fit: x.fit, complete: x.complete, margin, det,
        conf: det === 'exact' ? 'high' : det === 'likely' || implied && x.cover >= .75 && margin >= .1 ? 'medium' : 'low',
        alts: all.filter((y: any = undefined) => !(y.root === x.root && y.c === x.c) && y.fit >= x.fit - .08).slice(0, 2) };
}
function anHarmony(ns: any = undefined, implied: any = undefined): any {
    const out: any = [];
    if (!ns.length)
        return out;
    const eps: any = 1e-6, sorted: any = ns.slice().sort((a: any = undefined, b: any = undefined) => a.start - b.start || a.midi - b.midi), info: any = anNoteInfo(sorted), lo: any = sorted[0].start, hi: any = Math.max(...ns.map((n: any = undefined) => n.end));
    const bars: any = [], active: any = [];
    let k: any = 0;
    for (const m of anMeasures()) {
        if (m.end <= lo + eps || m.start >= hi - eps)
            continue;
        while (k < sorted.length && sorted[k].start < m.end - eps)
            active.push(sorted[k++]);
        for (let i: any = active.length - 1; i >= 0; i--)
            if (active[i].end <= m.start + eps)
                active.splice(i, 1);
        const here: any = active.filter((n: any = undefined) => n.end > m.start + eps);
        if (!here.length)
            continue;
        const U: any = anUnits(m, anGrid(m, implied), here, info), n: any = U.length, Lmax: any = n > 12 ? 8 : n, sp: any = U.map(() => []);
        for (let L: any = 1; L <= Lmax; L++)
            for (let a: any = 0; a + L <= n; a++) {
                const S: any = anSpan(U, a, a + L);
                S.all = anCands(S, implied);
                sp[a][a + L] = S;
                if (L > 1 && !implied)
                    anUnion(sp, a, a + L);
            }
        bars.push({ m, here, U, n, Lmax, sp, M: U.reduce((s: any = undefined, x: any = undefined) => s + x.T, 0) / n });
    }
    // Viterbi over spans. A state is the chord in force; a span either names a chord (scored by its weight × fit) or is left without
    // one, which scores like a very poor fit. A change costs a share of the bar's mean unit weight: least on the downbeat, then the
    // half bar, then other beats, and more when the chords share tones, or a shared tone is held across the change.
    const same: any = (x: any = undefined, y: any = undefined) => x && y && x.root === y.root && x.c === y.c;
    const cost: any = (B: any = undefined, a: any = undefined, y: any = undefined, x: any = undefined) => {
        const common: any = x.tones.filter((p: any = undefined) => y.tones.includes(p)), held: any = common.some((p: any = undefined) => B.U[a].held >> p & 1);
        return (a === 0 ? .2 : 2 * a === B.n ? .4 : .55) * B.M * (1 + .25 * common.length + (held ? .25 : 0));
    };
    let states: any = [{ v: 0, cur: null, back: null, pick: null }];
    for (const B of bars) {
        const at: any = [states];
        for (let b: any = 1; b <= B.n; b++) {
            const best: any = new Map();
            for (let a: any = Math.max(0, b - B.Lmax); a < b; a++) {
                const S: any = B.sp[a][b], opts: any = [null, ...S.all.slice(0, 6)];
                for (const st of at[a])
                    for (const x of opts) {
                        const cur: any = x || st.cur, id: any = cur ? cur.root + ':' + cur.c.s : '';
                        const v: any = st.v + (x ? S.T * x.fit - 1e-4 * B.M - (st.cur && !same(st.cur, x) ? cost(B, a, st.cur, x) : 0) : -.5 * S.T), old: any = best.get(id);
                        if (!old || v > old.v)
                            best.set(id, { v, cur, back: st, pick: x && { B, a, b, x } });
                    }
            }
            at.push([...best.values()].sort((p: any = undefined, q: any = undefined) => q.v - p.v).slice(0, 24));
        }
        states = at[B.n];
    }
    let end: any = states[0];
    states.forEach((st: any = undefined) => { if (st.v > end.v)
        end = st; });
    const picks: any = [];
    for (let st: any = end; st; st = st.back)
        if (st.pick)
            picks.push(st.pick);
    picks.reverse();
    const segs: any = [];
    picks.forEach((p: any = undefined) => { const last: any = segs[segs.length - 1]; if (last && last.B === p.B && same(last.x, p.x))
        last.b = p.b;
    else
        segs.push({ ...p }); });
    for (const g of segs) {
        const U: any = g.B.U;
        while (g.b - g.a > 1 && U[g.a].low == null)
            g.a++;
        while (g.b - g.a > 1 && U[g.b - 1].low == null)
            g.b--;
        const S: any = g.B.sp[g.a][g.b] || anSpan(U, g.a, g.b), all: any = S.all || (S.all = anCands(S, implied)), x: any = all.find((y: any = undefined) => same(y, g.x)) || g.x;
        out.push({ start: S.s, end: S.e, measure: g.B.m, unit: anBeatUnit(g.B.m), bass: implied ? x.root : S.bass, ch: anRate(x, all, implied), notes: g.B.here.filter((n: any = undefined) => n.start < S.e - eps && n.end > S.s + eps) });
    }
    anClassifyNonChord(ns, out);
    return out;
}
// Minor-aware Roman numerals with inversion figures and secondary dominants (V/x).
const AN_DIA: any = { maj: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], min: ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'] };
function anRoman(key: any = undefined, seg: any = undefined): any {
    const ch: any = seg.ch, c: any = ch.c, rel: any = ((ch.root - key.root) % 12 + 12) % 12, minor: any = key.minor, scale: any = minor ? [0, 2, 3, 5, 7, 8, 10] : MAJOR, q: any = c.q, inv: any = anInv(seg);
    const fig: any = c.x ? (c.n9 && !inv ? '⁹' : ['⁷', '⁶₅', '⁴₃', '⁴₂'][inv]) : ['', '⁶', '⁶₄'][inv] || '', mark: any = q === 'd' ? '°' : q === 'h' ? 'ø' : q === 'A' ? '+' : '', sfx: any = c.rn || '';
    const secondary: any = anDomQ(c) && (minor ? (rel === 2 || (rel === 0 && c.x)) : ([2, 4, 9, 11].includes(rel) || (rel === 0 && c.x)));
    if (secondary) {
        const target: any = scale.indexOf((rel + 5) % 12);
        if (target > 0)
            return 'V' + mark + fig + sfx + '/' + AN_DIA[minor ? 'min' : 'maj'][target].replace('°', '');
    }
    let deg: any, acc: any = '';
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
            const up: any = scale.indexOf((rel + 1) % 12);
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
    let num: any = ROMAN[deg];
    // a power chord has no third, so its numeral follows the key's own chord on that degree (V stays major in minor)
    if (q === 'm' || q === 'd' || q === 'h' || q === 'P' && !acc && !(minor && rel === 7) && (scale[(deg + 2) % 7] - scale[deg] + 12) % 12 === 3)
        num = num.toLowerCase();
    return acc + num + mark + fig + sfx;
}
// Possible cadences: dominant or subdominant resolving onto a downbeat, or a dominant closing the passage.
function anCadences(segs: any = undefined): any {
    segs.forEach((b: any = undefined, i: any = undefined) => {
        const a: any = segs[i - 1];
        if (!b.ch)
            return;
        const key: any = anKeyAt(b.start), rb: any = ((b.ch.root - key.root) % 12 + 12) % 12;
        const down: any = Math.abs(b.start - b.measure.start) < 1e-6, isDom: any = (s: any = undefined) => s && s.ch && ((s.ch.root - key.root) % 12 + 12) % 12 === 7 && anDomQ(s.ch.c);
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
function anMotifs(ns: any = undefined): any {
    const tops: any = new Map();
    ns.forEach((n: any = undefined) => { const k: any = n.start.toFixed(3), cur: any = tops.get(k); if (!cur || n.midi > cur.midi)
        tops.set(k, n); });
    const a: any = [...tops.values()].sort((x: any = undefined, y: any = undefined) => x.start - y.start);
    if (a.length < 8)
        return [];
    const map: any = new Map();
    for (let i: any = 0; i + 3 < a.length; i++) {
        const iv: any = [1, 2, 3].map((j: any = undefined) => a[i + j].midi - a[i + j - 1].midi);
        if (iv.every((v: any = undefined) => !v))
            continue;
        const key: any = iv.join(',');
        let hit: any = map.get(key);
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
    return [...map.values()].filter((v: any = undefined) => v.count >= 2).sort((x: any = undefined, y: any = undefined) => y.count - x.count).slice(0, 4);
}
function anHandOf(n: any = undefined): any { return n.hand || (n.midi >= 60 ? 'rh' : 'lh'); }
// Everything the workspace shows for one scope; strings are produced at render time so language and notation can change.
function anCompute(ns: any = undefined, scopeKey: any = undefined): any {
    const ck: any = AN.version + '|' + scopeKey;
    if (AN.cache.has(ck))
        return AN.cache.get(ck);
    const lo: any = Math.min(...ns.map((n: any = undefined) => n.start)), hi: any = Math.max(...ns.map((n: any = undefined) => n.end)), pitches: any = [...new Set(ns.map((n: any = undefined) => n.midi))].sort((a: any = undefined, b: any = undefined) => a - b);
    const poly: any = anPoly(ns), implied: any = poly.avg < 1.25, segs: any = anHarmony(ns, implied);
    anCadences(segs);
    const ms: any = anMeasures().filter((m: any = undefined) => m.end > lo + 1e-6 && m.start < hi - 1e-6);
    let beats: any = 0;
    ms.forEach((m: any = undefined) => { const s: any = Math.max(lo, m.start), e: any = Math.min(hi, m.end); if (e > s)
        beats += (e - s) / anBeatUnit(m); });
    const starts: any = ns.map((n: any = undefined) => n.start).sort((a: any = undefined, b: any = undefined) => a - b);
    let onsets: any = 0, prev: any = -Infinity;
    starts.forEach((s: any = undefined) => { if (s - prev > 0.06)
        onsets++; prev = s; });
    const tAt: any = (b: any = undefined) => { let bpm: any = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
        if (e.beat <= b + 1e-6)
            bpm = e.bpm;
        else
            break;
    } return bpm; };
    const tempos: any = [tAt(lo), ...SCORE.tempoList.filter((e: any = undefined) => e.beat > lo + 1e-6 && e.beat < hi - 1e-6).map((e: any = undefined) => e.bpm)];
    const hands: any = ns.some((n: any = undefined) => n.hand) ? 'hands' : 'register', rh: any = ns.filter((n: any = undefined) => anHandOf(n) === 'rh').length;
    const model: any = { ns, lo, hi, pitches, poly, implied, segs, ms, beats: Math.max(beats, 1e-6), onsets, tempos, hands, rh, lh: ns.length - rh,
        key: anKeyInfo(ns), mainKey: anKeyAt(lo), motifs: anMotifs(ns), seconds: scoreSeconds(hi) - scoreSeconds(lo) };
    if (AN.cache.size > 16)
        AN.cache.clear();
    AN.cache.set(ck, model);
    return model;
}
/* notation import / generation */
const SCORE: any = { xml: '', engine: null, version: 0, playGen: 0, timers: [], playing: false, sel: false, loop: null, tempos: [{ beat: 0, bpm: 120 }], tempoList: [{ beat: 0, bpm: 120 }], tempoFromFile: false,
    measures: [], midiGrid: 0, lit: new Set(), heads: new Map(), followRaf: 0, zoom: window.innerWidth < 560 ? 0.9 : 1, look: 'paper', layout: 'page', stale: false, layoutWidth: 0,
    geo: null, mrange: null, resume: null, paused: false, cursorEl: null, followSys: -1, panAt: 0, hl: false };
// sel: a note picked by hand (blue, like the playback line); lit: a sounding note, gold, only with "Highlight sounding notes" on
const SCORE_LOOK: any = { paper: { bg: '#fffefa', ink: '#000000', staff: undefined, sel: '#1a6fe0', lit: '#a47720', ok: '#1b8f4c', bad: '#d22f2f', dim: '#b9b2a6' }, night: { bg: '#1d1a17', ink: '#ece5d8', staff: '#a1988a', sel: '#7fb2ff', lit: '#e8bb5c', ok: '#6fdc9a', bad: '#ff7a7a', dim: '#5d574f' } }; // MuseScore-blue selection
function scoreSetTempos(list: any = undefined): any { SCORE.tempos = list.length ? list : [{ beat: 0, bpm: 120 }]; SCORE.tempoList = SCORE.tempos.slice().sort((a: any = undefined, b: any = undefined) => a.beat - b.beat); if (SCORE.tempoList[0].beat > 0)
    SCORE.tempoList.unshift({ beat: 0, bpm: SCORE.tempoList[0].bpm }); }
function scoreSeconds(beat: any = undefined): any { let sec: any = 0, last: any = 0, bpm: any = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    if (e.beat > beat)
        break;
    sec += (e.beat - last) * 60 / bpm;
    last = e.beat;
    bpm = e.bpm;
} return sec + (beat - last) * 60 / bpm; }
function scoreBeatAt(sec: any = undefined): any { let acc: any = 0, last: any = 0, bpm: any = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    const d: any = (e.beat - last) * 60 / bpm;
    if (acc + d > sec)
        break;
    acc += d;
    last = e.beat;
    bpm = e.bpm;
} return last + (sec - acc) * bpm / 60; }
function scoreXmlNotes(doc: any = undefined): any {
    const notes: any = [], tempos: any = [], measures: any = [], keys: any = [], dynamics: any = [], transients: any = [], wedgeEvents: any = [], pedalEvents: any = [], dolces: any = [], partEnds: any = [];
    const linkOpen: any = new Map(), linkPairs: any = [], lineEvents: any = []; // slurs, glissandi and slides by note; dashes and brackets by beat
    let malformed: any = false;
    const DYN: any = { ppp: 28, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 122, sfz: 115, fz: 115, rfz: 115 };
    const direct: any = (node: any = undefined, name: any = undefined) => [...node.children].filter((c: any = undefined) => c.localName === name), child: any = (node: any = undefined, name: any = undefined) => direct(node, name)[0] || null;
    const number: any = (node: any = undefined, fallback: any = 0) => { const n: any = +(node?.textContent || ''); return Number.isFinite(n) ? n : fallback; };
    const span: any = (node: any = undefined) => { const n: any = +(node?.textContent || 0); if (!Number.isFinite(n))
        malformed = true; return n; }; // durations must be numbers
    const clamp: any = (n: any = undefined, lo: any = undefined, hi: any = undefined) => Math.max(lo, Math.min(hi, n));
    const dynamicValue: any = (value: any = undefined, percent: any = false) => { if (value == null || value === '')
        return null; const n: any = +value; return Number.isFinite(n) ? clamp(percent && n <= 100 ? n * .9 : n, 1, 127) : null; };
    const dynamicInfo: any = (box: any = undefined) => {
        const named: any = [...box.children].find((el: any = undefined) => DYN[el.localName?.toLowerCase()] != null || el.localName === 'other-dynamics');
        const name: any = ((named?.localName === 'other-dynamics' ? named.textContent : named?.localName) || '').trim().toLowerCase();
        if (name === 'fp')
            return { value: 56, hit: 105 };
        if (['sfz', 'fz', 'rfz'].includes(name))
            return { hit: DYN[name] };
        return DYN[name] != null ? { value: DYN[name] } : null;
    };
    let sequence: any = 0;
    const pushDynamic: any = (part: any = undefined, staff: any = undefined, beat: any = undefined, info: any = undefined) => {
        if (!info)
            return;
        if (info.value != null)
            dynamics.push({ part, staff, beat, value: info.value, sequence: sequence++ });
        if (info.hit != null)
            transients.push({ part, staff, beat, value: info.hit, sequence: sequence++ });
    };
    const addSound: any = (sound: any = undefined, part: any = undefined, staff: any = undefined, beat: any = undefined) => {
        if (sound.hasAttribute('tempo')) {
            const bpm: any = +sound.getAttribute('tempo');
            if (bpm > 0 && Number.isFinite(bpm))
                tempos.push({ beat: Math.max(0, beat), bpm });
        }
        if (sound.hasAttribute('dynamics'))
            pushDynamic(part, staff, beat, { value: dynamicValue(sound.getAttribute('dynamics'), true) });
        const damper: any = (sound.getAttribute('damper-pedal') || '').toLowerCase();
        if (['yes', 'on', '1'].includes(damper))
            pedalEvents.push({ part, staff, beat, type: 'start', sequence: sequence++ });
        if (['no', 'off', '0'].includes(damper))
            pedalEvents.push({ part, staff, beat, type: 'stop', sequence: sequence++ });
    };
    [...doc.querySelectorAll('score-partwise > part')].forEach((part: any = undefined, pi: any = undefined) => {
        let measureStart: any = 0, num: any = 4, den: any = 4, staves: any = 1, division: any = 1;
        const gracePending: any = new Map();
        const graceKey: any = (staff: any = undefined, voice: any = undefined) => staff + ':' + voice;
        for (const measure of part.children) {
            if (measure.localName !== 'measure')
                continue;
            let at: any = measureStart, lastStart: any = at, max: any = at;
            for (const node of measure.children) {
                const name: any = node.localName;
                if (name === 'attributes') {
                    const d: any = child(node, 'divisions');
                    if (d) {
                        division = number(d, 1) || 1;
                        if (!(division > 0))
                            malformed = true;
                    }
                    const tm: any = child(node, 'time');
                    if (tm) {
                        num = number(child(tm, 'beats'), num) || num;
                        den = number(child(tm, 'beat-type'), den) || den;
                    }
                    const st: any = child(node, 'staves');
                    if (st)
                        staves = number(st, staves) || staves;
                    const key: any = child(node, 'key');
                    if (key && pi === 0 && child(key, 'fifths')) {
                        const f: any = number(child(key, 'fifths'));
                        const mode: any = (child(key, 'mode')?.textContent || '').trim();
                        if (Math.abs(f) <= 7)
                            keys.push({ beat: at, fifths: f, mode: mode === 'major' || mode === 'minor' ? mode : null });
                    }
                }
                if (name === 'direction') {
                    const offset: any = number(child(node, 'offset')) / division, beat: any = at + offset, staff: any = number(child(node, 'staff'));
                    direct(node, 'direction-type').forEach((dt: any = undefined) => {
                        direct(dt, 'dynamics').forEach((d: any = undefined) => pushDynamic(pi, 0, beat, dynamicInfo(d)));
                        direct(dt, 'wedge').forEach((w: any = undefined) => { const type: any = (w.getAttribute('type') || '').toLowerCase(); if (['crescendo', 'diminuendo', 'stop'].includes(type))
                            wedgeEvents.push({ part: pi, staff: 0, beat, type, number: w.getAttribute('number') || '1', sequence: sequence++ }); });
                        direct(dt, 'pedal').forEach((p: any = undefined) => { const type: any = (p.getAttribute('type') || '').toLowerCase(); if (['start', 'change', 'stop'].includes(type))
                            pedalEvents.push({ part: pi, staff, beat, type, sequence: sequence++ }); });
                        for (const kind of ['dashes', 'bracket'])
                            direct(dt, kind).forEach((l: any = undefined) => { const type: any = (l.getAttribute('type') || '').toLowerCase(); if (type === 'start' || type === 'stop')
                                lineEvents.push({ part: pi, staff: staff || 1, beat, kind, type, number: l.getAttribute('number') || '1', sequence: sequence++ }); });
                        const words: any = direct(dt, 'words').map((w: any = undefined) => w.textContent).join(' ');
                        if (/\bdolce|dolcissimo/i.test(words))
                            dolces.push({ part: pi, staff: 0, beat, on: !/\bnon\s+dolce/i.test(words), sequence: sequence++ });
                    });
                    direct(node, 'sound').forEach((sound: any = undefined) => addSound(sound, pi, 0, beat));
                }
                if (name === 'sound')
                    addSound(node, pi, 0, at);
                if (name === 'backup')
                    at -= span(child(node, 'duration')) / division;
                if (name === 'forward')
                    at += span(child(node, 'duration')) / division;
                if (name === 'note') {
                    const grace: any = !!child(node, 'grace'), duration: any = span(child(node, 'duration')) / division, chord: any = !!child(node, 'chord'), start: any = chord ? lastStart : at;
                    const voice: any = number(child(node, 'voice'), 1) || 1, staff: any = number(child(node, 'staff'), 1) || 1, pitch: any = child(node, 'pitch'), key: any = graceKey(staff, voice);
                    if (pitch) {
                        const step: any = child(pitch, 'step')?.textContent, oct: any = number(child(pitch, 'octave')), alter: any = number(child(pitch, 'alter')), midi: any = (oct + 1) * 12 + (({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as any)[step]) + alter;
                        if (Number.isFinite(midi)) {
                            if (grace) {
                                const list: any = gracePending.get(key) || [], g: any = { midi, vel: 84 };
                                if ([...node.querySelectorAll('tie')].some((t: any = undefined) => t.getAttribute('type') === 'start'))
                                    g.tieStart = true;
                                list.push(g);
                                gracePending.set(key, list);
                            }
                            else {
                                const hand: any = staves >= 2 ? (staff === 1 ? 'rh' : 'lh') : null, stop: any = [...node.querySelectorAll('tie')].some((t: any = undefined) => t.getAttribute('type') === 'stop');
                                const prev: any = stop && notes.findLast((n: any = undefined) => n.part === pi && n.staff === staff && n.voice === voice && n.midi === midi && Math.abs(n.end - start) < .001);
                                const fg: any = number(node.querySelector('fingering')), nd: any = [...node.querySelectorAll('notations > dynamics')].map(dynamicInfo).find(Boolean), attr: any = dynamicValue(node.getAttribute('dynamics'));
                                const arts: any = new Set([...node.querySelectorAll('notations > articulations > *')].map((a: any = undefined) => a.localName));
                                let own: any = null;
                                if (prev) {
                                    prev.end = start + duration;
                                    own = prev;
                                }
                                else if (duration > 0) {
                                    const n: any = { midi, start, end: start + duration, vel: 90, hand, part: pi, staff, voice, type: child(node, 'type')?.textContent || '', art: {
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
                                    if (!chord && gracePending.has(key)) {
                                        n.graces = gracePending.get(key);
                                        gracePending.delete(key);
                                        const last: any = n.graces[n.graces.length - 1];
                                        if (stop && last.tieStart && last.midi === midi)
                                            last.tiedToPrincipal = true;
                                    }
                                    notes.push(n);
                                    own = n;
                                }
                                if (own)
                                    node.querySelectorAll('notations > slur, notations > glissando, notations > slide').forEach((l: any = undefined) => {
                                        const type: any = (l.getAttribute('type') || '').toLowerCase(), key: any = pi + ':' + l.localName + ':' + (l.getAttribute('number') || '1');
                                        if (type === 'start')
                                            linkOpen.set(key, own);
                                        else if (type === 'stop' && linkOpen.has(key)) {
                                            const a: any = linkOpen.get(key);
                                            linkOpen.delete(key);
                                            if (a !== own)
                                                linkPairs.push({ kind: l.localName, a, b: own, style: l.getAttribute('line-type') || '' });
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
    if (malformed || notes.some((n: any = undefined) => !Number.isFinite(n.start) || !Number.isFinite(n.end)) || measures.some((m: any = undefined) => !Number.isFinite(m.start) || !Number.isFinite(m.end) || !(m.num > 0 && Number.isInteger(m.num)) || !(m.den > 0 && Number.isInteger(m.den))))
        throw anError('xml');
    const sorted: any = notes.sort((a: any = undefined, b: any = undefined) => a.start - b.start || a.midi - b.midi), byTime: any = (a: any = undefined, b: any = undefined) => a.beat - b.beat || a.sequence - b.sequence;
    const same: any = (event: any = undefined, n: any = undefined) => event.part === n.part && (event.staff === 0 || event.staff === n.staff);
    const persistent: any = dynamics.slice().sort(byTime), explicit: any = persistent.slice();
    const levelAt: any = (part: any = undefined, staff: any = undefined, beat: any = undefined) => {
        let value: any = 90, last: any = -Infinity, specificity: any = -1, seq: any = -1;
        persistent.forEach((e: any = undefined) => {
            if (e.part !== part || (e.staff !== 0 && e.staff !== staff) || e.beat > beat + .001)
                return;
            const spec: any = e.staff === staff ? 2 : 1;
            if (e.beat > last + .001 || (Math.abs(e.beat - last) < .001 && (spec > specificity || (spec === specificity && e.sequence > seq)))) {
                value = e.value;
                last = e.beat;
                specificity = spec;
                seq = e.sequence;
            }
        });
        return value;
    };
    const open: any = new Map(), wedges: any = [];
    wedgeEvents.sort(byTime).forEach((e: any = undefined) => {
        const key: any = e.part + ':' + e.staff + ':' + e.number;
        if (e.type === 'crescendo' || e.type === 'diminuendo')
            open.set(key, e);
        else {
            let begin: any = open.get(key);
            if (!begin)
                begin = [...open.values()].reverse().find((x: any = undefined) => x.part === e.part && x.number === e.number && (x.staff === e.staff || x.staff === 0 || e.staff === 0));
            if (!begin || e.beat <= begin.beat + .001)
                return;
            open.delete(begin.part + ':' + begin.staff + ':' + begin.number);
            const target: any = explicit.find((d: any = undefined) => d.part === begin.part && (d.staff === 0 || d.staff === begin.staff) && d.beat >= e.beat - .001 && d.beat <= e.beat + 4);
            const from: any = levelAt(begin.part, begin.staff, begin.beat), to: any = target ? target.value : clamp(from + (begin.type === 'crescendo' ? 16 : -16), 1, 127);
            wedges.push({ part: begin.part, staff: begin.staff, start: begin.beat, end: e.beat, from, to });
            persistent.push({ part: begin.part, staff: begin.staff, beat: e.beat, value: to, sequence: sequence++ });
        }
    });
    persistent.sort(byTime);
    const pedalSegments: any = [];
    for (const part of [...new Set(pedalEvents.map((e: any = undefined) => e.part))]) {
        let active: any = null;
        pedalEvents.filter((e: any = undefined) => e.part === part).sort(byTime).forEach((e: any = undefined) => {
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
        });
        if (active && (partEnds as any)[part as any] > active.start + .001)
            pedalSegments.push({ part, start: active.start, end: (partEnds as any)[part as any] });
    }
    const topAt: any = new Map(), sizeAt: any = new Map();
    sorted.forEach((n: any = undefined) => { const key: any = n.part + ':' + n.staff + ':' + n.start, top: any = topAt.get(key); if (top == null || n.midi > top)
        topAt.set(key, n.midi); sizeAt.set(key, (sizeAt.get(key) || 0) + 1); });
    const measureAt: any = (beat: any = undefined) => measures.find((m: any = undefined) => beat >= m.start - .001 && beat < m.end - .001);
    const dolceAt: any = (n: any = undefined) => { let on: any = false, last: any = -Infinity, seq: any = -1; dolces.forEach((d: any = undefined) => { if (!same(d, n) || d.beat > n.start + .001)
        return; if (d.beat > last + .001 || (Math.abs(d.beat - last) < .001 && d.sequence > seq)) {
        on = d.on;
        last = d.beat;
        seq = d.sequence;
    } }); return on; };
    const transientAt: any = (n: any = undefined) => { let hit: any = n.dynamicHit, last: any = -Infinity, seq: any = -1; transients.forEach((e: any = undefined) => { if (!same(e, n) || Math.abs(e.beat - n.start) > .012)
        return; if (e.beat > last + .001 || (Math.abs(e.beat - last) < .001 && e.sequence > seq)) {
        hit = e.value;
        last = e.beat;
        seq = e.sequence;
    } }); return hit; };
    sorted.forEach((n: any = undefined) => {
        const key: any = n.part + ':' + n.staff + ':' + n.start, right: any = n.hand === 'rh' || (!n.hand && n.staff === 1), chordSize: any = sizeAt.get(key) || 1;
        const melody: any = right && (n.midi === topAt.get(key) || (n.voice === 1 && chordSize === 1)), accompaniment: any = n.hand === 'lh' || n.staff === 2 || n.voice > 1 || (n.type === '16th' && !melody);
        const wedge: any = wedges.filter((w: any = undefined) => same(w, n) && n.start >= w.start - .001 && n.start <= w.end + .001).pop();
        let vel: any = n.explicitVel ?? transientAt(n) ?? levelAt(n.part, n.staff, n.start);
        if (wedge && n.explicitVel == null && n.dynamicHit == null && transientAt(n) == null) {
            const f: any = clamp((n.start - wedge.start) / (wedge.end - wedge.start), 0, 1);
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
            const m: any = measureAt(n.start), unit: any = m ? 4 / m.den : 1, beat: any = (n.start - (m?.start || 0)) / unit;
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
    const arpeggios: any = new Map();
    sorted.forEach((n: any = undefined) => { if (n.arpeggiate) {
        const key: any = n.part + ':' + n.staff + ':' + n.voice + ':' + n.start;
        arpeggios.set(key, true);
    } });
    sorted.forEach((n: any = undefined) => { const key: any = n.part + ':' + n.staff + ':' + n.voice + ':' + n.start; if (arpeggios.has(key))
        n.roll = 0; });
    [...arpeggios.keys()].forEach((key: any = undefined) => sorted.filter((n: any = undefined) => n.part + ':' + n.staff + ':' + n.voice + ':' + n.start === key).sort((a: any = undefined, b: any = undefined) => a.midi - b.midi).forEach((n: any = undefined, i: any = undefined) => n.roll = i * .022));
    const nextSame: any = new Map();
    for (let i: any = sorted.length - 1; i >= 0; i--) {
        const n: any = sorted[i], key: any = n.part + ':' + n.midi;
        n.nextSame = nextSame.get(key);
        nextSame.set(key, n.start);
    }
    sorted.forEach((n: any = undefined) => {
        let soundEnd: any = n.start + (n.end - n.start) * n.soundRatio, pedal: any = pedalSegments.find((p: any = undefined) => p.part === n.part && p.start <= n.start + .001 && p.end > n.start + .001);
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
    const lineOpen: any = new Map();
    lineEvents.sort(byTime).forEach((e: any = undefined) => {
        const key: any = e.part + ':' + e.kind + ':' + e.number;
        if (e.type === 'start') {
            lineOpen.set(key, e);
            return;
        }
        const a0: any = lineOpen.get(key);
        lineOpen.delete(key);
        if (!a0 || a0.staff === e.staff)
            return;
        const a: any = sorted.find((n: any = undefined) => n.part === a0.part && n.staff === a0.staff && n.start >= a0.beat - .001), b: any = sorted.filter((n: any = undefined) => n.part === e.part && n.staff === e.staff && n.start <= e.beat + .001 && n.start >= a0.beat - .001).pop();
        if (a && b && a !== b)
            linkPairs.push({ kind: e.kind, a, b, style: 'dashed' });
    });
    const links: any = linkPairs.filter((l: any = undefined) => l.a.staff !== l.b.staff).map((l: any = undefined) => ({ kind: l.kind, a: sorted.indexOf(l.a), b: sorted.indexOf(l.b), style: l.style })).filter((l: any = undefined) => l.a >= 0 && l.b >= 0);
    return { notes: sorted, tempos: tempos.filter((e: any = undefined) => e.bpm > 0 && Number.isFinite(e.bpm) && Number.isFinite(e.beat)), measures, keys, links };
}
function xmlEsc(s: any = undefined): any { return String(s).replace(/[<>&"']/g, (c: any = undefined) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as any)[c]); }
// MIDI (or a built-in piece) → MusicXML. `opt.grid` is the quantization per quarter note (2, 4 or 8); divisions grow when a meter needs finer units.
function scoreFromMidi(parsed: any = undefined, title: any = undefined, opt: any = undefined): any {
    const grid: any = opt.grid || 4, events: any = parsed.meta || [], timeEvents: any = events.filter((e: any = undefined) => e.type === 'time');
    let div: any = grid;
    while (timeEvents.some((e: any = undefined) => (4 * div) % e.den) && div < grid * 64)
        div *= 2;
    const k: any = div / grid;
    SCORE.midiGrid = grid;
    SCORE.measures = [];
    const tempos: any = events.filter((e: any = undefined) => e.type === 'tempo').map((e: any = undefined) => ({ beat: e.beat, bpm: e.bpm }));
    scoreSetTempos(tempos);
    SCORE.tempoFromFile = tempos.length > 0;
    const notes: any = parsed.notes.map((n: any = undefined) => { const s: any = Math.round(n.start * grid) * k; return { ...n, start: s, end: Math.max(s + k, Math.round(n.end * grid) * k), staff: n.hand === 'lh' ? 2 : 1 }; }).sort((a: any = undefined, b: any = undefined) => a.start - b.start || a.midi - b.midi);
    const end: any = Math.max(...notes.map((n: any = undefined) => n.end));
    if (end > 200000)
        throw anError('long');
    // Played legato overlaps of up to a sixteenth would spawn extra voices; trim them for the engraving only.
    const trim: any = k * Math.max(1, grid / 4);
    for (const staff of [1, 2]) {
        const own: any = notes.filter((n: any = undefined) => n.staff === staff), onsets: any = [...new Set(own.map((n: any = undefined) => n.start))].sort((a: any = undefined, b: any = undefined) => a - b);
        let j: any = 0;
        for (const n of own) {
            while (j < onsets.length && onsets[j] <= n.start)
                j++;
            const next: any = onsets[j];
            if (next != null && n.end > next && n.end - next <= trim)
                n.end = next;
        }
    }
    const groups: any = new Map();
    for (const n of notes) {
        const key: any = n.staff + ':' + n.start + ':' + n.end;
        if (!groups.has(key))
            groups.set(key, { staff: n.staff, start: n.start, end: n.end, notes: [] });
        groups.get(key).notes.push(n);
    }
    // The highest lane becomes the stem-up main voice so a melody is never engraved underneath its accompaniment.
    const used: any = [...new Set(notes.map((n: any = undefined) => n.staff))], single: any = used.length === 1, staves: any = single ? used : [1, 2]; // one hand only → one staff
    const globalVoices: any = [];
    for (const staff of staves) {
        const lanes: any = [];
        for (const group of [...groups.values()].filter((g: any = undefined) => g.staff === staff)) {
            let lane: any = lanes.find((l: any = undefined) => l.end <= group.start);
            if (!lane) {
                lane = { end: 0, groups: [], staff };
                lanes.push(lane);
            }
            lane.groups.push(group);
            lane.end = group.end;
        }
        const avg: any = (l: any = undefined) => { let s: any = 0, c: any = 0; l.groups.forEach((g: any = undefined) => g.notes.forEach((n: any = undefined) => { s += n.midi; c++; })); return c ? s / c : 0; };
        lanes.sort((a: any = undefined, b: any = undefined) => avg(b) - avg(a));
        lanes.forEach((l: any = undefined, i: any = undefined) => { l.secondary = i > 0; l.stem = lanes.length > 1 ? (i ? 'down' : 'up') : ''; });
        if (!lanes.length)
            lanes.push({ groups: [], staff, secondary: false, stem: '' });
        globalVoices.push(...lanes);
    }
    const VALUES: any = [[4, 'whole', 0], [3, 'half', 1], [2, 'half', 0], [1.5, 'quarter', 1], [1, 'quarter', 0], [0.75, 'eighth', 1], [0.5, 'eighth', 0], [0.375, '16th', 1], [0.25, '16th', 0], [0.1875, '32nd', 1], [0.125, '32nd', 0], [0.0625, '64th', 0], [0.03125, '128th', 0], [0.015625, '256th', 0]]
        .map(([q, type, dot]: any = undefined) => [q * div, type, dot]).filter(([d]: any = undefined) => Number.isInteger(d) && d >= 1);
    const changes: any = events.filter((e: any = undefined) => e.type === 'time').map((e: any = undefined) => ({ ...e })).concat((opt.keys || []).map((e: any = undefined) => ({ type: 'key', beat: e.beat, fifths: e.fifths, minor: !!e.minor })))
        .map((e: any = undefined) => ({ ...e, pos: Math.round(e.beat * div) })).sort((a: any = undefined, b: any = undefined) => a.pos - b.pos);
    let at: any = 0, number: any = 1, xml: any = '', fifths: any = 0, minor: any = false, num: any = 4, den: any = 4, ci: any = 0;
    while (at < end) {
        const beat: any = at / div;
        let keyChanged: any = number === 1, timeChanged: any = number === 1;
        while (ci < changes.length && changes[ci].pos <= at) {
            const e: any = changes[ci++];
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
        const next: any = changes[ci], length: any = Math.min(num * 4 * div / den, next ? next.pos - at : Infinity);
        if (length <= 0 || !Number.isInteger(length))
            throw anError('meter');
        const stop: any = at + length;
        SCORE.measures.push({ number: String(number), start: at / div, end: stop / div, num, den });
        xml += '<measure number="' + number + '">';
        if (number === 1 || keyChanged || timeChanged)
            xml += '<attributes>' + (number === 1 ? '<divisions>' + div + '</divisions>' : '') + (keyChanged ? '<key><fifths>' + fifths + '</fifths><mode>' + (minor ? 'minor' : 'major') + '</mode></key>' : '') + (timeChanged ? '<time><beats>' + num + '</beats><beat-type>' + den + '</beat-type></time>' : '') + (number === 1 ? (single ? (used[0] === 2 ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>') : '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>') : '') + '</attributes>';
        for (const t of SCORE.tempos.filter((e: any = undefined) => e.beat >= beat - 1e-9 && e.beat < stop / div))
            xml += '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + Math.round(t.bpm) + '</per-minute></metronome></direction-type><offset>' + Math.round((t.beat - beat) * div) + '</offset><sound tempo="' + (Math.round(t.bpm * 100) / 100) + '"/></direction>';
        const beamLen: any = den === 8 && num % 3 === 0 ? 1.5 * div : den === 2 ? 2 * div : div; // beam per beat: a dotted quarter in compound meters, a half in x/2
        globalVoices.forEach((voice: any = undefined, vi: any = undefined) => {
            if (vi)
                xml += '<backup><duration>' + length + '</duration></backup>';
            let cursor: any = at;
            const evs: any = [];
            const emit: any = (group: any = undefined, start: any = undefined, duration: any = undefined) => { let left: any = duration, offset: any = 0; while (left > 0) {
                const [d, type, dot] = VALUES.find((v: any = undefined) => v[0] <= left);
                evs.push({ group, pos: start + offset, d, type, dot, from: !!group && start + offset > group.start, to: !!group && start + offset + d < group.end });
                left -= d;
                offset += d;
            } };
            for (const group of voice.groups.filter((g: any = undefined) => g.start < stop && g.end > at)) {
                const start: any = Math.max(at, group.start), finish: any = Math.min(stop, group.end);
                if (start > cursor)
                    emit(null, cursor, start - cursor);
                emit(group, start, finish - start);
                cursor = finish;
            }
            if (cursor < stop)
                emit(null, cursor, stop - cursor);
            scoreBeams(evs, at, beamLen);
            evs.forEach(({ group, d, type, dot, from, to, beam }: any = undefined) => { const chord: any = group ? group.notes : [null]; chord.forEach((n: any = undefined, index: any = undefined) => { xml += '<note' + (!group && voice.secondary ? ' print-object="no" print-spacing="yes"' : '') + '>' + (index ? '<chord/>' : '') + (n ? scorePitch(n.midi, fifths, minor) : '<rest/>') + '<duration>' + d + '</duration>' + (from ? '<tie type="stop"/>' : '') + (to ? '<tie type="start"/>' : '') + '<voice>' + (vi + 1) + '</voice><type>' + type + '</type>' + (dot ? '<dot/>' : '') + (n && voice.stem ? '<stem>' + voice.stem + '</stem>' : '') + '<staff>' + (single ? 1 : voice.staff) + '</staff>' + (beam && !index ? '<beam number="1">' + beam + '</beam>' : '') + (from || to ? '<notations>' + (from ? '<tied type="stop"/>' : '') + (to ? '<tied type="start"/>' : '') + '</notations>' : '') + '</note>'; }); });
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
function scoreBeams(evs: any = undefined, at: any = undefined, len: any = undefined): any {
    let run: any = [];
    const flush: any = () => { if (run.length > 1)
        run.forEach((e: any = undefined, i: any = undefined) => { e.beam = i ? (i === run.length - 1 ? 'end' : 'continue') : 'begin'; }); run = []; };
    evs.forEach((e: any = undefined) => {
        const g0: any = Math.floor((e.pos - at) / len), prev: any = run[run.length - 1];
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
function anAssignHands(notes: any = undefined, mode: any = undefined): any {
    const split: any = (s: any = undefined) => notes.map((n: any = undefined) => n.midi >= s ? 'rh' : 'lh');
    if (/^\d+$/.test(mode))
        return { of: split(+mode), how: 'split', split: +mode };
    if (mode === 'auto' && notes.every((n: any = undefined) => n.srcHand))
        return { of: notes.map((n: any = undefined) => n.srcHand), how: 'piece' };
    const field: any = new Set(notes.map((n: any = undefined) => n.track)).size > 1 ? 'track' : new Set(notes.map((n: any = undefined) => n.channel)).size > 1 ? 'channel' : null;
    if (!field)
        return { of: split(60), how: 'one', split: 60 };
    const groups: any = new Map();
    notes.forEach((n: any = undefined) => { const g: any = n[field]; if (!groups.has(g))
        groups.set(g, []); groups.get(g).push(n.midi); });
    const list: any = [...groups].map(([g, ms]: any = undefined) => { const s: any = ms.slice().sort((a: any = undefined, b: any = undefined) => a - b); return { g, count: ms.length, median: s[s.length >> 1] }; }).sort((a: any = undefined, b: any = undefined) => b.median - a.median);
    let cut: any = 1, gap: any = -1;
    for (let i: any = 1; i < list.length; i++) {
        const d: any = list[i - 1].median - list[i].median;
        if (d > gap) {
            gap = d;
            cut = i;
        }
    }
    const upper: any = new Set(list.slice(0, cut).map((x: any = undefined) => x.g)), share: any = list.slice(0, cut).reduce((s: any = undefined, x: any = undefined) => s + x.count, 0) / notes.length;
    if (mode === 'auto' && !(gap >= 5 && share >= 0.05 && share <= 0.95))
        return { of: split(60), how: 'fallback', split: 60 };
    return { of: notes.map((n: any = undefined) => upper.has(n[field]) ? 'rh' : 'lh'), how: 'tracks', groups: list.length };
}
// Rebuild notes + notation from the stored MIDI/example source; analysis timing stays the unquantized source timing.
function anRebuild(): any {
    const src: any = AN.source, parsed: any = src.parsed, hands: any = anAssignHands(parsed.notes, AN.recon.hands);
    const notes: any = parsed.notes.map((n: any = undefined, i: any = undefined) => ({ midi: n.midi, start: n.start, end: n.end, vel: n.vel, track: n.track, channel: n.channel, hand: hands.of[i] }));
    const key: any = anResolveKey(parsed, AN.recon.key, notes);
    const xml: any = scoreFromMidi({ meta: parsed.meta, notes }, src.title, { grid: AN.recon.grid, keys: key.events, composer: src.comp });
    AN.notes = notes;
    SCORE.xml = xml;
    AN.hands = hands;
    AN.keyOrigin = key.origin;
    AN.keyMap = key.events.map((e: any = undefined) => ({ ...keyFromFifths(e.fifths, e.minor), beat: e.beat }));
}
function anXmlKeyMap(src: any = undefined): any {
    if (!src.keys.length) {
        const best: any = anKeyRank(src.notes)[0];
        AN.keyOrigin = 'auto';
        return [{ beat: 0, root: best.root, minor: best.minor, fifths: keyFifths(best.root, best.minor) }];
    }
    const ranks: any = anKeyRank(src.notes);
    let guessed: any = false;
    const map: any = src.keys.map((k: any = undefined) => {
        let minor: any = k.mode === 'minor';
        if (!k.mode) {
            guessed = true;
            const maj: any = keyFromFifths(k.fifths, false), mi: any = keyFromFifths(k.fifths, true);
            minor = ranks.find((r: any = undefined) => r.root === mi.root && r.minor).score > ranks.find((r: any = undefined) => r.root === maj.root && !r.minor).score;
        }
        return { ...keyFromFifths(k.fifths, minor), beat: k.beat };
    });
    AN.keyOrigin = guessed ? 'mode' : 'file';
    return map;
}
/* rendering, selection painting, transport */
const SC_PAGE_W: any = 794, SC_BASE: any = 0.75; // an A4 page is 794 CSS px wide at 100%; OSMD draws 10 px per staff space at zoom 1, so 0.75 ≈ MuseScore's default staff size
// Beam groups for OSMD's auto-beaming (only used for MusicXML written without beams): one beat, or a dotted quarter in compound meters.
function scoreBeamGroups(): any { const m: any = (SCORE.measures || [])[0] || { num: 4, den: 4 }; return m.den === 8 && m.num % 3 === 0 ? [[3, 8]] : m.den === 2 ? [[2, 4]] : [[1, 4]]; }
async function scoreRender() {
    const version: any = ++SCORE.version, box: any = $('an-roll');
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
    await new Promise((r: any = undefined) => requestAnimationFrame(() => setTimeout(r, 0))); // let the loading state paint before the engraver blocks
    if (version !== SCORE.version)
        return false;
    try {
        await loadOsmd();
    }
    catch (err: any) {
        showNotationReloadPrompt();
        console.error('OSMD:', err);
        throw err;
    }
    const isXml: any = !!AN.source && AN.source.kind === 'xml', autoBeam: any = isXml && !/<beam[\s>]/.test(SCORE.xml); // generated scores already carry <beam> groups per voice
    const oneStaffPart: any = (SCORE.xml.match(/<score-part[\s>]/g) || []).length <= 1; // a lone piano needs no "Instr. P1" at the left
    const engine: any = await createScoreRenderer(box.firstElementChild, { autoResize: false, backend: 'svg', drawTitle: true, drawComposer: true, drawPartNames: !oneStaffPart, drawPartAbbreviations: false, drawMeasureNumbers: true,
        autoBeam, autoBeamOptions: { beam_rests: false, beam_middle_rests_only: false, maintain_stem_directions: true, groups: scoreBeamGroups() } });
    const R: any = {}; // MuseScore-like page: wider margins, title block, measure numbers only at system starts
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
    const layout: any = isXml && AN.source.layout;
    if (layout) {
        for (const kind of ['title', 'subtitle', 'composer'])
            if (layout[kind + 'Size'])
                R[({ title: 'SheetTitleHeight', subtitle: 'SheetSubtitleHeight', composer: 'SheetComposerHeight' } as any)[kind]] = layout[kind + 'Size'] * 96 / 72 / (10 * layout.base);
        for (const side of ['Left', 'Right', 'Top', 'Bottom'])
            if (layout[side.toLowerCase()] != null)
                R['Page' + side + 'Margin'] = layout[side.toLowerCase()];
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
    const source: any = SCORE.xml.trim();
    await engine.load(source.startsWith('<?xml') ? source : '<?xml version="1.0" encoding="utf-8"?>' + source);
    if (version !== SCORE.version)
        return false;
    SCORE.engine = engine;
    return scoreLayout() !== false;
}
// View, zoom and appearance only need a new layout, not a new load; selection, cursor and highlights are repainted afterwards.
// Page view: A4 sheets on the desk, as wide as 794 px × zoom but never wider than the desk (the music reflows instead of panning).
function scoreLayout(): any {
    const engine: any = SCORE.engine, box: any = $('an-roll');
    if (!engine)
        return;
    box.hidden = false;
    if (!box.clientWidth) {
        SCORE.stale = true;
        box.hidden = FALL.mode !== 'score';
        return;
    }
    const look: any = SCORE_LOOK[SCORE.look], cont: any = SCORE.layout === 'cont', R: any = {}, sheet: any = box.querySelector('.an-sheet'), cs: any = getComputedStyle(box);
    box.dataset.layout = SCORE.layout;
    const avail: any = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const sourceLayout: any = AN.source && AN.source.kind === 'xml' && AN.source.layout, pageW: any = sourceLayout ? sourceLayout.width : SC_PAGE_W, base: any = sourceLayout ? sourceLayout.base : SC_BASE;
    const sheetW: any = Math.max(240, Math.round(Math.min(pageW * SCORE.zoom, avail)));
    sheet.style.width = cont ? '' : sheetW + 'px';
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
    const pedalsOk: any = scoreFixPedals(box);
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
function scoreStyleHeader(engine: any = undefined, layout: any = undefined): any {
    const node: any = engine.getTitleNode(), runs: any = layout && layout.titleRuns;
    if (!node || !runs || !runs.length)
        return;
    const text: any = node.localName === 'text' ? node : node.querySelector('text');
    if (!text || text.textContent.trim() !== runs.map((r: any = undefined) => r.text).join('').trim())
        return;
    const spans: any = runs.map((r: any = undefined) => { const span: any = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); span.textContent = r.text; span.setAttribute('font-style', r.style); span.setAttribute('font-weight', r.weight); return span; });
    text.replaceChildren(...spans);
}
// Page view of an imported file keeps its own <print new-system / new-page> breaks (MuseScore's 3–4 bars a line).
// Those breaks only help while the bars fit: note spacing tightens a step at a time until the engraver needs no
// extra break; past the last step it fills the lines itself rather than leave a lone bar after every forced break.
const SC_FIT: any = [[.85, 3, 2], [.7, 2.2, 1.6], [.58, 1.6, 1.3], [.48, 1.2, 1.1]]; // VexFlow spacing multiplier, addend, min note distance
function scoreFitRender(engine: any = undefined, xmlBreaks: any = undefined, key: any = undefined): any {
    const set: any = (i: any = undefined, on: any = undefined) => {
        const f: any = SC_FIT[i];
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
    const known: any = SCORE.fit && SCORE.fit.key === key ? SCORE.fit : null; // look changes re-render at the step already found
    if (known) {
        set(known.step, known.on);
        engine.render();
        return;
    }
    for (let i: any = 0; i < SC_FIT.length; i++) {
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
function scoreExtraBreaks(engine: any = undefined): any {
    return engine.hasExtraBreaks();
}
// Anything OSMD still draws in pure black (connectors, brackets, text without a colour rule) follows the night ink too.
// The keyboard-focus ring around a notehead is measured in the score's own units: about 1 px of page colour, then 1.6 px of blue.
function scoreRingFit(z: any = undefined): any { (document as any).querySelectorAll('.sc-defs feMorphology').forEach((f: any = undefined) => f.setAttribute('radius', (+f.dataset.px / (z || SC_BASE)).toFixed(2))); }
function scoreNightSweep(box: any = undefined, ink: any = undefined): any {
    const black: any = /^(#000|#000000|black|rgb\(0,\s*0,\s*0\))$/i;
    box.querySelectorAll('svg *').forEach((el: any = undefined) => {
        for (const a of ['fill', 'stroke']) {
            const v: any = el.getAttribute(a);
            if (v && black.test(v.trim()))
                el.setAttribute(a, ink);
            if (el.style[a] && black.test(el.style[a].trim()))
                el.style[a] = ink;
        }
        if (el.localName === 'text' && !el.getAttribute('fill'))
            el.setAttribute('fill', ink);
    });
}
// Bind each source note to its rendered notehead, retaining individual selection in chords. One tab stop; arrows move between notes.
function scoreBind(engine: any = undefined): any {
    SCORE.heads = new Map();
    let first: any = null;
    const grid: any = SCORE.midiGrid || 0, startOf: any = (n: any = undefined) => grid ? Math.round(n.start * grid) / grid : n.start, endOf: any = (n: any = undefined) => grid ? Math.max(startOf(n) + 1 / grid, Math.round(n.end * grid) / grid) : n.end;
    const byMidi: any = new Map();
    AN.notes.forEach((n: any = undefined, i: any = undefined) => { if (!byMidi.has(n.midi))
        byMidi.set(n.midi, []); byMidi.get(n.midi).push(i); });
    let bound: any = new Set(), boundBeat: any = null;
    engine.forEachRenderedNote(({ midi, beat, part, staff, voice, element: g }: any = undefined) => {
        if (boundBeat !== beat) {
            boundBeat = beat;
            bound = new Set();
        }
        const cands: any = byMidi.get(midi);
        if (!cands)
            return;
        const same: any = (j: any = undefined) => { const n: any = AN.notes[j]; return (n.part == null || n.part === part) && (n.staff == null || n.staff === staff) && (n.voice == null || n.voice === voice); };
        const match: any = (pred: any = undefined) => { const a: any = cands.filter(pred); return a.find((j: any = undefined) => same(j) && !bound.has(j)) ?? a.find((j: any = undefined) => !bound.has(j)) ?? a.find(same) ?? a[0]; };
        const exact: any = (j: any = undefined) => Math.abs(startOf(AN.notes[j]) - beat) < .01, sustained: any = (j: any = undefined) => startOf(AN.notes[j]) <= beat + .001 && endOf(AN.notes[j]) > beat + .001;
        // A tied continuation belongs to its own voice, even when another voice starts the same pitch here.
        const i: any = match((j: any = undefined) => same(j) && exact(j)) ?? match((j: any = undefined) => same(j) && sustained(j)) ?? match(exact) ?? match(sustained);
        if (i == null)
            return;
        bound.add(i);
        g.dataset.i = i;
        g.style.cursor = 'pointer';
        g.style.pointerEvents = 'all';
        g.setAttribute('tabindex', '-1');
        g.setAttribute('role', 'button');
        g.setAttribute('aria-label', spellName(AN.notes[i].midi, anKeyAt(AN.notes[i].start), true));
        if (!SCORE.heads.has(i))
            SCORE.heads.set(i, []);
        SCORE.heads.get(i).push(g);
        if (!first)
            first = g;
    });
    if (first)
        first.setAttribute('tabindex', '0');
}
function scorePaintEl(g: any = undefined): any { const i: any = +g.dataset.i, look: any = SCORE_LOOK[SCORE.look], selected: any = AN.selected.has(i), res: any = PRAC.res.get(i), n: any = AN.notes[i], color: any = SCORE.hl && SCORE.lit.has(i) ? look.lit : selected ? look.sel : res === 'hit' ? look.ok : res === 'miss' ? look.bad : n && !pracMine(n) ? look.dim : null; for (const shape of [g, ...g.querySelectorAll('path,ellipse,circle')]) {
    if (!shape.hasAttribute('data-original-fill')) {
        shape.dataset.originalFill = shape.style.fill || '';
        shape.dataset.originalStroke = shape.style.stroke || '';
    }
    shape.style.fill = color || shape.dataset.originalFill;
    shape.style.stroke = color || shape.dataset.originalStroke;
} g.setAttribute('aria-pressed', selected ? 'true' : 'false'); }
function scorePaintIdx(i: any = undefined): any { (SCORE.heads.get(i) || []).forEach(scorePaintEl); }
function scorePaint(): any { SCORE.heads.forEach((list: any = undefined) => list.forEach(scorePaintEl)); scoreMarks(); scoreCursorUpdate(false); anAnalyze(); }
// OSMD draws each pedal mark straight onto the page; a group per mark lets the hover explain "Ped." and "*".
function showNotationReloadPrompt(): any {
    const copy: any = notationReloadMessage(lang), box: any = (document as any).createElement('div');
    box.setAttribute('role', 'alert');
    box.className = 'notation-reload';
    box.innerHTML = '<p></p><button type="button"></button>';
    box.querySelector('p').textContent = copy.message;
    box.querySelector('button').textContent = copy.button;
    box.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(box);
}
// Text-pedal skylines can miss ledger notes, and a release with no staff entry can land on its press glyph.
// Place actual glyph ink without changing event timing. Recompute from native positions on every call.
let scoreFixPedals: any = function scoreFixPedals(box: any = undefined) {
    let unresolved: any = 0;
    box.querySelectorAll('svg').forEach((svg: any = undefined) => {
        const marks: any = [...svg.querySelectorAll('.vf-sc-pedal path')], ctm: any = svg.getScreenCTM();
        if (!marks.length || !ctm || !ctm.d)
            return;
        marks.forEach((p: any = undefined) => {
            if (p.dataset.pedalUnresolved) {
                p.style.visibility = '';
                delete p.dataset.pedalUnresolved;
            }
            if (!p.hasAttribute('data-pedal-base-transform'))
                p.dataset.pedalBaseTransform = p.getAttribute('transform') || '';
            const base: any = p.dataset.pedalBaseTransform;
            if (base)
                p.setAttribute('transform', base);
            else
                p.removeAttribute('transform');
        });
        const gap: any = Math.max(1, Math.abs(ctm.d) * 2.5), limit: any = Math.abs(ctm.a) * 40, page: any = svg.getBoundingClientRect(), placed: any = [];
        const cross: any = (a: any = undefined, b: any = undefined, pad: any = gap) => a.right + pad > b.left && a.left - pad < b.right && a.bottom + pad > b.top && a.top - pad < b.bottom;
        const obstacles: any = [...svg.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-ledgers path,.vf-ledgers line,.vf-modifiers path,.vf-stavetie path,path.vf-stavetie,.sc-xline,text')].filter((n: any = undefined) => !n.closest('.vf-sc-pedal')).flatMap((n: any = undefined) => {
            const r: any = n.getBoundingClientRect(), s: any = getComputedStyle(n), pad: any = s.stroke !== 'none' ? Math.max(.5, parseFloat(s.strokeWidth) * Math.abs(ctm.d) / 2 || .5) : 0;
            if (n.matches('.sc-xline,.vf-stavetie path,path.vf-stavetie') && n.getTotalLength) {
                const len: any = n.getTotalLength(), m: any = n.getScreenCTM(), out: any = [];
                let a: any = n.getPointAtLength(0);
                a = new DOMPoint(a.x, a.y).matrixTransform(m);
                for (let i: any = 1, count: any = Math.max(1, Math.ceil(len / 2)); i <= count; i++) {
                    const q: any = n.getPointAtLength(len * i / count), z: any = new DOMPoint(q.x, q.y).matrixTransform(m);
                    out.push({ left: Math.min(a.x, z.x) - pad, right: Math.max(a.x, z.x) + pad, top: Math.min(a.y, z.y) - pad, bottom: Math.max(a.y, z.y) + pad });
                    a = z;
                }
                return out;
            }
            return [{ left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad }];
        });
        marks.forEach((p: any = undefined) => {
            const r: any = p.getBoundingClientRect();
            if (r.width < .1)
                return;
            const group: any = p.closest('.vf-sc-pedal'), release: any = r.width < r.height * 1.3, rect: any = (x: any = undefined, y: any = undefined) => ({ left: r.left + x, right: r.right + x, top: r.top + y, bottom: r.bottom + y });
            let dx: any = 0, dy: any = 0;
            const owner: any = group.scPedalOwner, sys: any = owner && owner.staffLine.ParentMusicSystem, pos: any = (s: any = undefined) => s && s.PositionAndShape && s.PositionAndShape.AbsolutePosition;
            const systems: any = sys && sys.Parent && sys.Parent.MusicSystems || [], next: any = systems[systems.indexOf(sys) + 1];
            const pedal: any = owner && owner.pedal, endpoint: any = pedal && (release ? pedal.endMeasure || pedal.endVfVoiceEntry?.parentStaffEntry.parentMeasure : pedal.startVfVoiceEntry?.parentStaffEntry.parentMeasure);
            const measures: any = owner && owner.staffLine.Measures || [], measure: any = endpoint && endpoint.ParentStaffLine?.ParentMusicSystem === sys ? endpoint : (release ? measures[measures.length - 1] : measures[0]);
            const ml: any = pos(measure) ? ctm.e + pos(measure).x * 10 * ctm.a - limit : -Infinity, mr: any = pos(measure) ? ctm.e + (pos(measure).x + measure.PositionAndShape.Size.width) * 10 * ctm.a + limit : Infinity;
            const minY: any = Math.max(page.top + gap - r.top, -Math.abs(ctm.d) * 40, pos(sys) ? ctm.f + pos(sys).y * 10 * ctm.d - r.top : -Infinity);
            const maxY: any = Math.min(page.bottom - gap - r.bottom, Math.abs(ctm.d) * 40, pos(next) ? ctm.f + pos(next).y * 10 * ctm.d - gap - r.bottom : Infinity);
            const all: any = obstacles.concat(placed), ys: any = [...new Set([0, minY, maxY, ...all.flatMap((o: any = undefined) => [o.bottom + gap - r.top, o.top - gap - r.bottom])])].filter((y: any = undefined) => y >= minY && y <= maxY).sort((a: any = undefined, b: any = undefined) => Math.abs(a) - Math.abs(b));
            let found: any = false;
            for (const y of ys) {
                const row: any = all.filter((o: any = undefined) => r.bottom + y + gap > o.top && r.top + y - gap < o.bottom), afterPress: any = release && row.some((o: any = undefined) => o.group === group && o.press);
                const xs: any = [...new Set([0, ...row.flatMap((o: any = undefined) => [o.right + gap - r.left, o.left - gap - r.right])])].filter((x: any = undefined) => Math.abs(x) <= limit && r.left + x >= page.left + gap && r.right + x <= page.right - gap && r.right + x >= ml && r.left + x <= mr && !row.some((o: any = undefined) => cross(rect(x, y), o)));
                xs.sort((a: any = undefined, b: any = undefined) => (Math.abs(a) + (afterPress && a < 0 ? limit + 1 : 0)) - (Math.abs(b) + (afterPress && b < 0 ? limit + 1 : 0)));
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
            const base: any = p.dataset.pedalBaseTransform;
            if (Math.abs(dx) > .1 || Math.abs(dy) > .1)
                p.setAttribute('transform', (base ? base + ' ' : '') + 'translate(' + (dx / ctm.a).toFixed(3) + ' ' + (dy / ctm.d).toFixed(3) + ')');
            placed.push({ ...rect(dx, dy), group, press: !release });
        });
    });
    box.dataset.pedalUnresolved = String(unresolved);
    return unresolved === 0;
};
// SVG user units of the page a node sits on, from screen pixels (OSMD draws 10 units per staff space).
function scoreToUser(svg: any = undefined, x: any = undefined, y: any = undefined): any { const m: any = svg.getScreenCTM(); if (!m)
    return null; const p: any = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m.inverse()); }
// Lines between the hands that OSMD leaves out: cross-staff slurs, glissandi and slides, dashed voice-leading lines.
function scoreXLines(): any {
    const links: any = (AN.source && AN.source.links) || [], ink: any = SCORE_LOOK[SCORE.look].ink, NS: any = 'http://www.w3.org/2000/svg';
    links.forEach((l: any = undefined) => {
        const ga: any = (SCORE.heads.get(l.a) || [])[0], gb: any = (SCORE.heads.get(l.b) || [])[0];
        if (!ga || !gb)
            return;
        const svg: any = ga.ownerSVGElement;
        if (!svg || svg !== gb.ownerSVGElement)
            return;
        const ra: any = ga.getBoundingClientRect(), rb: any = gb.getBoundingClientRect(), A: any = scoreToUser(svg, ra.left + ra.width / 2, ra.top + ra.height / 2), B: any = scoreToUser(svg, rb.left + rb.width / 2, rb.top + rb.height / 2);
        if (!A || !B)
            return;
        const sp: any = 10, hw: any = Math.max(.5, scoreToUser(svg, ra.right, 0).x - scoreToUser(svg, ra.left, 0).x) / 2;
        if (B.x < A.x + hw || Math.abs(B.y - A.y) > sp * 24)
            return; // the far end is on another system
        const el: any = document.createElementNS(NS, 'path');
        el.setAttribute('class', 'sc-xline');
        el.dataset.kind = l.kind === 'slur' ? 'slur' : l.kind === 'glissando' || l.kind === 'slide' ? 'gliss' : 'line';
        if (l.kind === 'slur') { // a crescent bowing over the top, from just above one notehead to just above the other
            const x0: any = A.x + hw * .4, y0: any = A.y - sp * .9, x1: any = B.x - hw * .4, y1: any = B.y - sp * .9, len: any = Math.hypot(x1 - x0, y1 - y0), h: any = Math.min(sp * 2.4, Math.max(sp * .8, len * .2)), th: any = sp * .22;
            const nx: any = (y1 - y0) / len, ny: any = -(x1 - x0) / len, s: any = ny > 0 ? -1 : 1, c: any = (f: any = undefined, k: any = undefined) => [x0 + (x1 - x0) * f + nx * s * k, y0 + (y1 - y0) * f + ny * s * k].map((v: any = undefined) => v.toFixed(2)).join(' ');
            el.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} C${c(.25, h)} ${c(.75, h)} ${x1.toFixed(2)} ${y1.toFixed(2)} C${c(.75, h + th)} ${c(.25, h + th)} ${x0.toFixed(2)} ${y0.toFixed(2)}Z`);
            el.setAttribute('fill', ink);
            el.setAttribute('stroke', ink);
            el.setAttribute('stroke-width', '.4');
        }
        else {
            const x0: any = A.x + hw * 1.4, x1: any = B.x - hw * 1.4;
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
// Chord fingerings stacked one above the other must never touch: each column is re-stacked from the notes outwards,
// clear of its noteheads, stems and the digits already placed on that staff, above or below as OSMD chose.
function scoreFixFingerings(box: any = undefined, engine: any = undefined): any {
    const gs: any = engine && engine.readLayout().graphicSheet;
    if (!gs || !box)
        return;
    const ink: any = (r: any = undefined) => ({ l: r.left + r.width * .08, r: r.right - r.width * .08, t: r.top + r.height * .18, b: r.bottom - r.height * .2 });
    const crossX: any = (a: any = undefined, b: any = undefined) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > .5;
    gs.MusicPages.forEach((pg: any = undefined) => pg.MusicSystems.forEach((sys: any = undefined) => sys.StaffLines.forEach((sl: any = undefined) => {
        const placed: any = [];
        sl.Measures.forEach((gm: any = undefined) => (gm.staffEntries || []).forEach((gse: any = undefined) => {
            const labels: any = (gse.FingeringEntries || []).map((f: any = undefined) => f.SVGNode).filter((n: any = undefined) => n && n.ownerSVGElement);
            if (!labels.length)
                return;
            const obstacles: any = [];
            let mid: any = 0, nh: any = 0;
            (gse.graphicalVoiceEntries || []).forEach((gve: any = undefined) => {
                const vf: any = gve.vfStaveNote || gve.mVexFlowStaveNote, g: any = (vf && vf.getAttribute && vf.getAttribute('el')) || (gve.notes || []).map((n: any = undefined) => n.getSVGGElement && n.getSVGGElement()).find(Boolean);
                if (!g || !g.querySelectorAll)
                    return;
                g.querySelectorAll('.vf-notehead').forEach((h: any = undefined) => { const r: any = h.getBoundingClientRect(); if (!r.width)
                    return; obstacles.push({ l: r.left, r: r.right, t: r.top, b: r.bottom }); mid += r.top + r.height / 2; nh++; });
                g.querySelectorAll('.vf-stem').forEach((s: any = undefined) => { const r: any = s.getBoundingClientRect(); if (r.height)
                    obstacles.push({ l: r.left - 1, r: r.right + 1, t: r.top, b: r.bottom }); });
            });
            if (!nh)
                return;
            mid /= nh;
            const svg: any = labels[0].ownerSVGElement, ctm: any = svg.getScreenCTM();
            if (!ctm || !ctm.d)
                return;
            const gap: any = Math.max(1, ctm.d * 2.5), cap: any = ctm.d * 40; // about 0.25 and 4 staff spaces in screen pixels
            const items: any = labels.map((n: any = undefined) => { const r: any = n.getBoundingClientRect(); return { n, box: ink(r), up: r.top + r.height / 2 < mid }; });
            for (const up of [true, false]) {
                items.filter((it: any = undefined) => it.up === up).sort((a: any = undefined, b: any = undefined) => up ? b.box.b - a.box.b : a.box.t - b.box.t).forEach((it: any = undefined) => {
                    let dy: any = 0;
                    for (let k: any = 0; k < 16; k++) {
                        const bx: any = { l: it.box.l, r: it.box.r, t: it.box.t + dy, b: it.box.b + dy };
                        const hit: any = [...obstacles, ...placed].find((o: any = undefined) => crossX(bx, o) && bx.b + gap > o.t && bx.t - gap < o.b);
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
    const chords: any = new Set(), fings: any = new Set();
    gs.MeasureList.forEach((list: any = undefined) => (list || []).forEach((gm: any = undefined) => gm && (gm.staffEntries || []).forEach((gse: any = undefined) => { (gse.graphicalChordContainers || []).forEach((c: any = undefined) => { const n: any = c.GraphicalLabel && c.GraphicalLabel.SVGNode; if (n)
        chords.add(n); }); (gse.FingeringEntries || []).forEach((f: any = undefined) => { if (f.SVGNode)
        fings.add(f.SVGNode); }); })));
    box.querySelectorAll('svg').forEach((svg: any = undefined) => {
        const ctm: any = svg.getScreenCTM();
        if (!ctm || !ctm.d)
            return;
        const kept: any = [], chordBoxes: any = [], words: any = [];
        svg.querySelectorAll('text').forEach((x: any = undefined) => {
            const r: any = x.getBoundingClientRect(), s: any = x.textContent.trim();
            if (!s || !r.width)
                return;
            if (kept.some((k: any = undefined) => k.s === s && Math.abs(k.r.left - r.left) < 3 && Math.abs(k.r.top - r.top) < 3)) {
                x.remove();
                return;
            }
            kept.push({ s, r });
            if ([...chords].some((c: any = undefined) => c === x || c.contains(x)))
                chordBoxes.push(ink(r));
            else if (![...fings].some((f: any = undefined) => f === x || f.contains(x)) && !x.closest('.measure-number'))
                words.push({ x, b: ink(r) });
        });
        words.forEach(({ x, b }: any = undefined) => {
            const hit: any = chordBoxes.find((c: any = undefined) => crossX(b, c) && b.b + ctm.d * 5 > c.t && b.t < c.b);
            if (!hit || b.t > hit.t)
                return;
            scoreShiftY(x, (hit.t - ctm.d * 5 - b.b) / ctm.d);
        });
    });
}
// Adds to any vertical shift already applied, so the pass can run again on a page it has already tidied.
function scoreShiftY(n: any = undefined, dy: any = undefined): any { const m: any = /^translate\(0 (-?[\d.]+)\)$/.exec(n.getAttribute('transform') || ''); n.setAttribute('transform', `translate(0 ${((m ? +m[1] : 0) + dy).toFixed(2)})`); }
// Every marking on the page that the hover can explain: its box (relative to its page, which only moves as a whole), kind and value.
const SC_DYN: any = /^(ppp|pp|p|mp|mf|f|ff|fff|sfz|fz|rfz|fp|sf|sfp)$/;
const SC_TERMS: any = [['dolcissimo'], ['dolce'], ['espressivo', 'espress\\.?', 'espr\\.'], ['cantabile'], ['legato'], ['leggiero', 'leggero'], ['sostenuto', 'sost\\.'],
    ['ritardando', 'ritard\\.', 'rit\\.?'], ['rallentando', 'rall\\.'], ['accelerando', 'accel\\.'], ['atempo', 'a tempo'], ['rubato'], ['crescendo', 'cresc\\.'], ['diminuendo', 'decrescendo', 'dim\\.', 'decresc\\.'],
    ['poco'], ['piu', 'più'], ['molto'], ['sempre'], ['sim', 'simile', 'sim\\.'], ['grave'], ['largo'], ['larghetto'], ['lento'], ['adagio'], ['andantino'], ['andante'], ['moderato'], ['allegretto'], ['allegro'], ['vivace'], ['presto']]
    .map(([k, ...alts]: any = undefined) => ({ k, re: new RegExp('(^|[^\\p{L}])(' + (alts.length ? alts : [k]).join('|') + ')(?=$|[^\\p{L}])', 'iu') }));
const SC_ARTS: any = { 'a.': 'staccato', 'av': 'staccatissimo', 'a>': 'accent', 'a^': 'marcato', 'a-': 'tenuto', 'a@a': 'fermata', 'a@u': 'fermata', 'a@s': 'fermata', 'a@l': 'fermata', 'a@as': 'fermata', 'a@us': 'fermata',
    tr: 'trill', mordent: 'mordent', mordent_inverted: 'mordent', turn: 'turn', turn_inverted: 'turn', prallprall: 'trill', upprall: 'trill' };
function scoreSyms(engine: any = undefined): any {
    const box: any = $('an-roll'), list: any = [], gs: any = engine && engine.readLayout().graphicSheet;
    SCORE.syms = list;
    scoreTip(null);
    if (!gs)
        return;
    const pageRects: any = new Map(), pageOf: any = (el: any = undefined) => el && el.closest && el.closest('[id^="osmdCanvasPage"]');
    const add: any = (el: any = undefined, kind: any = undefined, val: any = undefined, rect: any = undefined, loose: any = true, ref: any = undefined) => {
        const r: any = rect || el.getBoundingClientRect(), page: any = pageOf(el || ref);
        if ((!r.width && !r.height) || !page)
            return;
        if (!pageRects.has(page))
            pageRects.set(page, page.getBoundingClientRect());
        const pr: any = pageRects.get(page);
        const i: any = list.length;
        list.push({ kind, val, el, loose, page, x0: r.left - pr.left, y0: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top });
        if (el) {
            el.dataset.sym = i;
            el.style.cursor = 'help';
            el.tabIndex = 0;
            el.setAttribute('aria-label', scoreSymText({ kind, val }).line);
        }
    };
    const seen: any = new Set(); // the title block is not a marking
    ['title', 'subtitle', 'composer', 'lyricist', 'copyright'].forEach((k: any = undefined) => { const n: any = gs[k] && gs[k].SVGNode; if (n) {
        seen.add(n);
        if (n.querySelectorAll)
            n.querySelectorAll('text').forEach((x: any = undefined) => seen.add(x));
    } });
    gs.MusicPages.forEach((pg: any = undefined) => pg.MusicSystems.forEach((sys: any = undefined) => sys.StaffLines.forEach((sl: any = undefined) => {
        (sl.AbstractExpressions || []).forEach((e: any = undefined) => (e.lines || []).forEach((l: any = undefined) => { const g: any = l.SVGElement; if (!g || !e.expression || e.expression.dynamicType == null)
            return; seen.add(g); add(g, e.expression.dynamicType === 0 ? 'cresc' : 'dim'); }));
        sl.Measures.forEach((gm: any = undefined) => (gm.staffEntries || []).forEach((gse: any = undefined) => {
            (gse.FingeringEntries || []).forEach((f: any = undefined) => { const n: any = f.SVGNode; if (!n)
                return; n.querySelectorAll('text').forEach((x: any = undefined) => seen.add(x)); add(n, 'finger', (f.Label && f.Label.text || n.textContent || '').trim()); });
            (gse.graphicalChordContainers || []).forEach((c: any = undefined) => { const lb: any = c.GraphicalLabel, n: any = lb && lb.SVGNode; if (!n)
                return; n.querySelectorAll('text').forEach((x: any = undefined) => seen.add(x)); if (n.localName === 'text')
                seen.add(n); add(n, 'chord', (lb.Label && lb.Label.text || n.textContent || '').trim()); });
            (gse.graphicalVoiceEntries || []).forEach((gve: any = undefined) => {
                const vf: any = gve.vfStaveNote || gve.mVexFlowStaveNote, el: any = vf && vf.getAttribute && vf.getAttribute('el');
                // Rests are notation, not playable notes: bind their glyphs here, never in AN.notes or scoreBind.
                (gve.notes || []).forEach((n: any = undefined) => {
                    const src: any = n.sourceNote;
                    if (!src || !src.isRest() || src.PrintObject === false)
                        return;
                    const heads: any = n.getNoteheadSVGs ? n.getNoteheadSVGs() : [], g: any = heads[0] || (n.getSVGGElement && n.getSVGGElement());
                    if (!g)
                        return;
                    const type: any = src.TypeLength && src.TypeLength.RealValue === 0 ? 'measure' : (({ w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th', 128: '128th', 256: '256th', b: 'breve' } as any)[vf && vf.duration] || 'other');
                    add(g, 'rest', { type, dots: src.DotsXml || 0 });
                });
                const mg: any = el && el.querySelector && el.querySelector('.vf-modifiers');
                if (!mg || !vf.modifiers)
                    return;
                const paths: any = [...mg.children], mods: any = vf.modifiers, shown: any = paths.length === mods.length ? mods : mods.filter((m: any = undefined) => /articulation|ornament/i.test(m.getCategory ? m.getCategory() : ''));
                if (paths.length !== shown.length)
                    return;
                shown.forEach((m: any = undefined, k: any = undefined) => { const kind: any = SC_ARTS[m.type]; if (kind)
                    add(paths[k], kind, ''); });
            });
        }));
    })));
    box.querySelectorAll('.vf-sc-pedal').forEach((g: any = undefined) => [...g.querySelectorAll('path')].forEach((p: any = undefined) => { const r: any = p.getBoundingClientRect(); if (r.width)
        add(p, r.width > r.height * 1.3 ? 'ped' : 'pedup', '', r); }));
    box.querySelectorAll('svg text').forEach((x: any = undefined) => {
        if (seen.has(x) || x.closest('.measure-number'))
            return;
        const s: any = (x.textContent || '').replace(/\s+/g, ' ').trim();
        if (!s)
            return;
        const r: any = x.getBoundingClientRect();
        if (SC_DYN.test(s))
            add(x, 'dyn', s, r);
        else if (/^[A-Z][0-9]?$/.test(s) && x.closest('.vf-measure'))
            add(x, 'rehearsal', s, r);
        else if (scoreTermParts(s).length)
            add(x, 'text', s, r);
    });
    box.querySelectorAll('svg .vf-curve').forEach((g: any = undefined) => add(g, 'slur', '', null, false));
    box.querySelectorAll('svg .vf-stavetie').forEach((g: any = undefined) => add(g, 'tie', '', null, false));
    box.querySelectorAll('svg .sc-xline').forEach((p: any = undefined) => add(p, p.dataset.kind, '', null, false));
    box.querySelectorAll('svg .vf-clef').forEach((g: any = undefined) => { const r: any = g.getBoundingClientRect(), q: any = r.height / Math.max(1, r.width); add(g, q > 1.9 ? 'clef_g' : q < 1.25 ? 'clef_f' : 'clef_c', '', r); });
    const beatAt: any = (r: any = undefined) => {
        const g: any = SCORE.geo;
        if (!g)
            return null;
        const cx: any = r.left + r.width / 2, cy: any = r.top + r.height / 2;
        for (const m of g.measures) {
            if (!m)
                continue;
            const sy: any = g.systems[m.sys], pe: any = g.pages[sy.page];
            if (!pe)
                continue;
            const pr: any = pe.getBoundingClientRect(), ux: any = (cx - pr.left) / g.scale, uy: any = (cy - pr.top) / g.scale;
            if (ux >= m.x0 - .2 && ux <= m.x1 && uy >= sy.top - 3 && uy <= sy.bottom + 3)
                return m.b0;
        }
        return null;
    };
    box.querySelectorAll('svg .vf-keysignature').forEach((g: any = undefined) => { const r: any = g.getBoundingClientRect(), b: any = beatAt(r); if (b != null)
        add(g, 'key', anKeyName(anKeyAt(b + .001)), r); });
    box.querySelectorAll('svg .vf-timesignature').forEach((g: any = undefined) => { const r: any = g.getBoundingClientRect(), b: any = beatAt(r); if (b == null)
        return; const m: any = anMeasures().find((x: any = undefined) => x.start <= b + .001 && x.end > b + .001); if (m)
        add(g, 'time', m.num + '/' + m.den, r); });
    // An arpeggio's wavy line stands just left of its chord.
    const rolls: any = new Map();
    AN.notes.forEach((n: any = undefined, i: any = undefined) => { if (!n.arpeggiate)
        return; const k: any = n.staff + ':' + n.start; if (!rolls.has(k))
        rolls.set(k, []); rolls.get(k).push(i); });
    rolls.forEach((ix: any = undefined) => {
        const rs: any = ix.flatMap((i: any = undefined) => (SCORE.heads.get(i) || []).map((g: any = undefined) => g.getBoundingClientRect())).filter((r: any = undefined) => r.width);
        if (!rs.length)
            return;
        const l: any = Math.min(...rs.map((r: any = undefined) => r.left)), t: any = Math.min(...rs.map((r: any = undefined) => r.top)), b: any = Math.max(...rs.map((r: any = undefined) => r.bottom)), w: any = rs[0].width;
        add(null, 'arpeggio', '', { left: l - w * 1.4, right: l - w * .15, top: t - w * .3, bottom: b + w * .3, width: w, height: b - t }, true, (SCORE.heads.get(ix[0]) || [])[0]);
    });
}
function scoreTermParts(s: any = undefined): any {
    const out: any = [];
    SC_TERMS.forEach(({ k, re }: any = undefined) => { const m: any = re.exec(s); if (m)
        out.push({ at: m.index + m[1].length, k }); });
    const metro: any = /[\u2669\u266A\u266B\u266C\uD834]\S*\s*\.?\s*=\s*(\d+)/.exec(s);
    if (metro)
        out.push({ at: metro.index, k: 'metro', n: metro[1] });
    return out.sort((a: any = undefined, b: any = undefined) => a.at - b.at).filter((p: any = undefined, i: any = undefined, a: any = undefined) => !(p.k === 'dolce' && a.some((q: any = undefined) => q.k === 'dolcissimo'))).map((p: any = undefined) => p.k === 'metro' ? t('sym_metro', p.n) : t('sym_t_' + p.k));
}
// "Name — meaning": the tooltip heads with the symbol as printed (or its name) and #an-hover reads it as one line.
function scoreSymText(sym: any = undefined): any {
    const split: any = (s: any = undefined) => { const i: any = s.indexOf(' — '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 3)]; };
    const k: any = sym.kind, v: any = sym.val;
    if (k === 'rest') {
        const name: any = t('sym_rest_' + v.type), raw: any = v.dots === 1 ? t('sym_rest_dotted', name) : v.dots > 1 ? t('sym_rest_dots', name, v.dots) : name, head: any = raw[0].toLocaleUpperCase(lang) + raw.slice(1);
        const body: any = t(v.type === 'measure' ? 'sym_rest_measure_body' : 'sym_rest_body');
        return { head, body, line: head + ' — ' + body };
    }
    if (k === 'text') {
        const parts: any = scoreTermParts(v);
        return { head: v, body: parts.join(' · '), line: v + ' · ' + parts.join(' · ') };
    }
    let full: any;
    if (k === 'dyn')
        full = t('sym_dyn_' + (v === 'sf' ? 'sfz' : v === 'sfp' ? 'fp' : v));
    else if (k === 'finger') {
        const ds: any = (v.match(/[1-5]/g) || []);
        full = ds.length > 1 ? t('sym_finger_sub', ds.join(', '), ds.map((d: any = undefined) => d + ' = ' + t('sym_f' + d)).join(', ')) : ds.length ? t('sym_finger', ds[0], t('sym_f' + ds[0])) : t('sym_finger', '?', '?');
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
    const [name, body] = split(full), lit: any = ['dyn', 'finger', 'rehearsal', 'time', 'chord'].includes(k) ? v : '';
    return { head: lit ? lit + ' · ' + name : name, body, line: (lit ? lit + ' · ' : '') + full };
}
function scoreSymAt(e: any = undefined): any {
    const box: any = $('an-roll'), list: any = SCORE.syms || [], el: any = e.target && e.target.closest && e.target.closest('#an-roll [data-sym]');
    if (el && list[+el.dataset.sym] && list[+el.dataset.sym].el === el)
        return list[+el.dataset.sym];
    if (e.clientX == null || !list.length)
        return null;
    const rects: any = new Map(), pad: any = 3;
    let best: any = null, area: any = Infinity;
    list.forEach((s: any = undefined) => {
        if (!s.loose)
            return;
        if (!rects.has(s.page))
            rects.set(s.page, s.page.getBoundingClientRect());
        const pr: any = rects.get(s.page), x: any = e.clientX - pr.left, y: any = e.clientY - pr.top;
        if (x < s.x0 - pad || x > s.x1 + pad || y < s.y0 - pad || y > s.y1 + pad)
            return;
        const a: any = (s.x1 - s.x0) * (s.y1 - s.y0);
        if (a < area) {
            area = a;
            best = s;
        }
    });
    return best;
}
// A small tooltip under the marking, inside the score panel; it never takes the pointer.
function scoreTip(sym: any = undefined, txt: any = undefined): any {
    const box: any = $('an-roll');
    let tip: any = box && box.querySelector(':scope > .sc-tip');
    if (!sym) {
        if (tip)
            tip.hidden = true;
        return;
    }
    if (!tip) {
        tip = (document as any).createElement('div');
        tip.className = 'sc-tip';
        tip.setAttribute('role', 'tooltip');
        tip.id = 'sc-tip';
        box.appendChild(tip);
    }
    tip.replaceChildren(Object.assign((document as any).createElement('b'), { textContent: txt.head }), Object.assign((document as any).createElement('span'), { textContent: txt.body }));
    tip.hidden = false;
    tip.dataset.kind = sym.kind;
    const br: any = box.getBoundingClientRect(), pr: any = sym.page.getBoundingClientRect(), ox: any = pr.left - br.left - box.clientLeft + box.scrollLeft, oy: any = pr.top - br.top - box.clientTop + box.scrollTop;
    const w: any = tip.offsetWidth, h: any = tip.offsetHeight, minX: any = box.scrollLeft + 4, maxX: any = box.scrollLeft + box.clientWidth - w - 4;
    let top: any = oy + sym.y1 + 8;
    if (top + h > box.scrollTop + box.clientHeight - 4)
        top = Math.max(box.scrollTop + 4, oy + sym.y0 - h - 8);
    tip.style.left = Math.round(Math.max(minX, Math.min(maxX, ox + (sym.x0 + sym.x1) / 2 - w / 2))) + 'px';
    tip.style.top = Math.round(top) + 'px';
}
// Geometry in OSMD units (one staff space) relative to each page: systems, measures and the onset anchors the cursor moves between.
function scoreGeo(engine: any = undefined): any {
    const gs: any = engine.readLayout().graphicSheet, geo: any = { scale: 10 * engine.getZoom(), pages: [], systems: [], measures: [], anchors: [] }, sysIdx: any = new Map();
    gs.MusicPages.forEach((pg: any = undefined, pi: any = undefined) => {
        geo.pages[pi] = (document as any).getElementById('osmdCanvasPage' + pg.PageNumber);
        pg.MusicSystems.forEach((sys: any = undefined) => {
            const lines: any = sys.StaffLines;
            if (!lines || !lines.length)
                return;
            const y: any = sys.PositionAndShape.AbsolutePosition.y, last: any = lines[lines.length - 1];
            sysIdx.set(sys, geo.systems.length);
            geo.systems.push({ page: pi, top: y + lines[0].PositionAndShape.RelativePosition.y, bottom: y + last.PositionAndShape.RelativePosition.y + last.StaffHeight });
        });
    });
    gs.MeasureList.forEach((list: any = undefined, mi: any = undefined) => {
        const gm: any = (list || []).find((m: any = undefined) => m && sysIdx.has(m.ParentMusicSystem));
        if (!gm)
            return;
        const sm: any = gm.parentSourceMeasure, ps: any = gm.PositionAndShape, x0: any = ps.AbsolutePosition.x, b0: any = sm.AbsoluteTimestamp.RealValue * 4;
        geo.measures[mi] = { sys: sysIdx.get(gm.ParentMusicSystem), x0, xn: x0 + (gm.beginInstructionsWidth || 0), x1: x0 + ps.Size.width, b0, b1: b0 + sm.Duration.RealValue * 4 };
    });
    // Where a bar's music begins (xs): right after the clef, key and time signature drawn at its start (system starts, changes),
    // else at its barline. Measured on the drawn glyphs; OSMD's begin-instruction width reaches past the first notes.
    const glyphs: any = [];
    geo.pages.forEach((el: any = undefined, pi: any = undefined) => {
        if (!el)
            return;
        const pr: any = el.getBoundingClientRect();
        el.querySelectorAll('.vf-clef,.vf-keysignature,.vf-timesignature').forEach((gl: any = undefined) => { const r: any = gl.getBoundingClientRect(); if (r.width > 0)
            glyphs.push({ page: pi, l: (r.left - pr.left) / geo.scale, r: (r.right - pr.left) / geo.scale, y: (r.top + r.height / 2 - pr.top) / geo.scale }); });
    });
    geo.measures.forEach((m: any = undefined) => {
        if (!m)
            return;
        const s: any = geo.systems[m.sys];
        let end: any = -Infinity;
        glyphs.forEach((gl: any = undefined) => { if (gl.page === s.page && gl.y >= s.top - 4 && gl.y <= s.bottom + 4 && gl.l >= m.x0 - .5 && gl.l < m.x1)
            end = Math.max(end, gl.r); });
        m.xs = end > -Infinity ? Math.min(m.xn, end + .6) : m.x0;
    });
    const cur: any = engine.readCursor();
    if (cur) {
        cur.reset();
        const it: any = cur.Iterator;
        let guard: any = 0;
        while (!it.EndReached && guard++ < 40000) {
            let x: any = Infinity, sys: any = null;
            for (const ve of it.CurrentVisibleVoiceEntries()) {
                const gse: any = cur.getStaffEntryFromVoiceEntry(ve), ax: any = gse && gse.PositionAndShape.AbsolutePosition.x;
                if (gse && ax < x) {
                    x = ax;
                    sys = gse.parentMeasure.ParentMusicSystem;
                }
            }
            if (sysIdx.has(sys))
                geo.anchors.push({ beat: it.CurrentSourceTimestamp.RealValue * 4, x, sys: sysIdx.get(sys) });
            it.moveToNext();
        }
        cur.reset();
    }
    // A measure's rail starts at its first onset when present, otherwise just after its instructions.
    // This preserves the downbeat connection while the cursor advances at one steady visual pace within the bar.
    const onsetX: any = new Map();
    geo.anchors.forEach((a: any = undefined) => { const key: any = a.sys + ':' + Math.round(a.beat * 960), old: any = onsetX.get(key); if (old == null || a.x < old)
        onsetX.set(key, a.x); });
    geo.measures.forEach((m: any = undefined) => { if (m)
        m.cx = onsetX.get(m.sys + ':' + Math.round(m.b0 * 960)) ?? m.xs; });
    // Within a system the line finishes at the next bar's first onset; at a system break it reaches the final barline first.
    geo.measures.forEach((m: any = undefined, mi: any = undefined) => { const n: any = geo.measures[mi + 1]; if (m && !(n && n.sys === m.sys && onsetX.has(m.sys + ':' + Math.round(m.b1 * 960))))
        geo.anchors.push({ beat: m.b1, x: m.x1 - 0.9, sys: m.sys, end: true }); });
    geo.anchors.sort((a: any = undefined, b: any = undefined) => a.beat - b.beat || (a.end ? 0 : 1) - (b.end ? 0 : 1));
    SCORE.geo = geo;
    SCORE.followSys = -1;
    if (SCORE.layout !== 'cont')
        geo.pages.forEach((el: any = undefined, i: any = undefined) => { if (!el || !i)
            return; const n: any = (document as any).createElement('span'); n.className = 'sc-pnum' + (i % 2 ? ' is-left' : ''); n.textContent = String(i + 1); n.style.fontSize = (1.7 * geo.scale).toFixed(1) + 'px'; n.setAttribute('aria-hidden', 'true'); el.appendChild(n); });
}
// Playback position: a thin blue line over the whole system. Its speed follows the tempo map.
// Fixed-width bars use one steady rail per bar; natural-width bars move between the drawn note onsets.
function scoreCursorEl(): any { if (!SCORE.cursorEl) {
    const el: any = (document as any).createElement('div');
    el.className = 'sc-cursor';
    el.setAttribute('aria-hidden', 'true');
    SCORE.cursorEl = el;
} return SCORE.cursorEl; }
function scoreCursorAt(beat: any = undefined): any {
    const g: any = SCORE.geo, M: any = g && g.measures;
    if (!M || !M.length)
        return null;
    let i: any = M.findIndex((m: any = undefined) => m && beat < m.b1 - 1e-9);
    if (i < 0)
        i = M.length - 1;
    const m: any = M[i];
    if (!m)
        return null;
    if (!SCORE.fixedWidth) {
        const p: any = scoreAnchorAt(g.anchors, beat, m.sys);
        if (p)
            return p;
    }
    const n: any = M[i + 1], x0: any = m.cx ?? m.xs, x1: any = n && n.sys === m.sys ? (n.cx ?? n.xs) : m.x1 - .9;
    const t0: any = scoreSeconds(m.b0), t1: any = scoreSeconds(m.b1), at: any = Math.min(t1, Math.max(t0, scoreSeconds(beat)));
    const f: any = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
    return { x: x0 + (x1 - x0) * f, sys: m.sys };
}
// Between the last onset at or before the beat and the next one on the same system, timed by the tempo map.
function scoreAnchorAt(A: any = undefined, beat: any = undefined, sys: any = undefined): any {
    if (!A || !A.length)
        return null;
    let lo: any = 0, hi: any = A.length - 1, k: any = -1;
    while (lo <= hi) {
        const mid: any = (lo + hi) >> 1;
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
    const a: any = A[k];
    let b: any = null;
    for (let j: any = k + 1; j < A.length; j++) {
        if (A[j].beat > a.beat + 1e-9) {
            if (A[j].sys === sys)
                b = A[j];
            break;
        }
    }
    if (!b)
        return null;
    const t0: any = scoreSeconds(a.beat), t1: any = scoreSeconds(b.beat), at: any = Math.min(t1, Math.max(t0, scoreSeconds(beat))), f: any = t1 > t0 ? (at - t0) / (t1 - t0) : 0;
    return { x: a.x + (b.x - a.x) * f, sys };
}
function scoreCursorUpdate(follow: any = undefined): any {
    const el: any = scoreCursorEl(), g: any = SCORE.geo, p: any = g && AN.notes.length && FALL.mode === 'score' ? scoreCursorAt(scoreBeatAt(fallTime())) : null, s: any = p && g.systems[p.sys], page: any = s && g.pages[s.page];
    if (!page) {
        el.remove();
        return;
    }
    if (el.parentNode !== page)
        page.appendChild(el);
    const w: any = Math.max(1.5, Math.min(3, 2 * SCORE.zoom)), pad: any = 2 * g.scale; // 2 px at 100%
    el.style.width = w.toFixed(1) + 'px';
    el.style.borderLeftWidth = w.toFixed(1) + 'px';
    el.style.height = ((s.bottom - s.top) * g.scale + 2 * pad).toFixed(1) + 'px';
    el.style.transform = 'translate(' + (p.x * g.scale - w / 2).toFixed(1) + 'px,' + (s.top * g.scale - pad).toFixed(1) + 'px)';
    el.classList.toggle('is-playing', SCORE.playing);
    if (follow)
        scoreCursorFollow(p, s, page, g);
}
// Keep the cursor in view: vertically by system in page view, horizontally in continuous view.
function scoreCursorFollow(p: any = undefined, s: any = undefined, page: any = undefined, g: any = undefined): any {
    const box: any = $('an-roll'), b: any = box.getBoundingClientRect(), r: any = page.getBoundingClientRect(), now: any = performance.now(), behavior: any = reduceMotion() ? 'auto' : 'smooth';
    if (!b.height)
        return;
    if (SCORE.layout === 'cont') {
        const x: any = r.left + p.x * g.scale;
        if ((x < b.left + b.width * 0.08 || x > b.right - b.width * 0.3) && now - SCORE.panAt > 500) {
            SCORE.panAt = now;
            box.scrollTo({ left: box.scrollLeft + (x - b.left) - b.width * 0.15, behavior });
        }
        return;
    }
    const top: any = r.top + (s.top - 4) * g.scale, bottom: any = r.top + (s.bottom + 4) * g.scale, inView: any = top >= b.top && bottom <= b.bottom;
    if (!inView && (SCORE.followSys !== p.sys || now - SCORE.panAt > 800)) {
        SCORE.panAt = now;
        box.scrollTo({ top: box.scrollTop + (top - b.top) - Math.max(10, b.height * 0.12), behavior });
    }
    SCORE.followSys = p.sys;
}
// Coral bars: the selected bars, else the bars a running loop or the A–B range covers (score measure indices).
function scoreCoralBars(): any {
    const g: any = SCORE.geo;
    if (!g)
        return null;
    const R: any = SCORE.mrange;
    if (R)
        return { a: R.a, b: R.b };
    const L: any = SCORE.loop, ab: any = PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A, lo: any = L ? L.a : ab ? PRAC.A : null, hi: any = L ? L.b : PRAC.B;
    if (lo == null)
        return null;
    const b0: any = scoreBeatAt(lo), b1: any = scoreBeatAt(hi), idx: any = [];
    g.measures.forEach((m: any = undefined, i: any = undefined) => { if (m && m.b1 > b0 + 1e-6 && m.b0 < b1 - 1e-6)
        idx.push(i); });
    return idx.length ? { a: idx[0], b: idx[idx.length - 1] } : null;
}
// Like MuseScore's range selection: one coral band per system, over every staff (top line of the top staff to the bottom
// line of the bottom one), from where the first bar's notes begin (after a system's clef, key and time) to the last barline.
function scoreMarks(): any {
    const g: any = SCORE.geo, C: any = g && FALL.mode === 'score' ? scoreCoralBars() : null, sig: any = C ? C.a + ':' + C.b : '';
    if (sig === SCORE.markSig && g === SCORE.markGeo && (!C || (document as any).querySelector('#an-roll .sc-mrect')))
        return;
    SCORE.markSig = sig;
    SCORE.markGeo = g;
    (document as any).querySelectorAll('#an-roll .sc-mrect').forEach((e: any = undefined) => e.remove());
    if (!C)
        return;
    const by: any = new Map();
    for (let mi: any = C.a; mi <= C.b; mi++) {
        const m: any = g.measures[mi];
        if (!m)
            continue;
        const r: any = by.get(m.sys) || { x0: Infinity, x1: -Infinity };
        r.x0 = Math.min(r.x0, by.has(m.sys) ? m.x0 : m.xs);
        r.x1 = Math.max(r.x1, m.x1);
        by.set(m.sys, r);
    }
    by.forEach((r: any = undefined, si: any = undefined) => {
        const s: any = g.systems[si], page: any = g.pages[s.page];
        if (!page)
            return;
        const el: any = (document as any).createElement('div'), pad: any = 0.9 * g.scale;
        el.className = 'sc-mrect';
        el.setAttribute('aria-hidden', 'true');
        Object.assign(el.style, { left: (r.x0 * g.scale).toFixed(1) + 'px', top: (s.top * g.scale - pad).toFixed(1) + 'px', width: ((r.x1 - r.x0) * g.scale).toFixed(1) + 'px', height: ((s.bottom - s.top) * g.scale + 2 * pad).toFixed(1) + 'px' });
        page.appendChild(el);
    });
}
// Hit-test a click against the bars: inside a bar's box (system height) selects the bar, like clicking empty space in a MuseScore measure.
function scoreMeasureAt(cx: any = undefined, cy: any = undefined): any {
    const g: any = SCORE.geo;
    if (!g)
        return -1;
    for (let pi: any = 0; pi < g.pages.length; pi++) {
        const el: any = g.pages[pi];
        if (!el)
            continue;
        const r: any = el.getBoundingClientRect();
        if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom)
            continue;
        const ux: any = (cx - r.left) / g.scale, uy: any = (cy - r.top) / g.scale;
        for (let mi: any = 0; mi < g.measures.length; mi++) {
            const m: any = g.measures[mi];
            if (!m)
                continue;
            const s: any = g.systems[m.sys];
            if (s.page === pi && ux >= m.xs && ux <= m.x1 && uy >= s.top - 2 && uy <= s.bottom + 2)
                return mi;
        }
    }
    return -1;
}
function scoreSelectMeasures(mi: any = undefined, extend: any = undefined): any {
    const g: any = SCORE.geo;
    if (!g || !g.measures[mi])
        return;
    scoreSelectRange(extend && SCORE.mrange ? SCORE.mrange.anchor : mi, mi);
}
function scoreSelectRange(anchor: any = undefined, mi: any = undefined): any {
    const g: any = SCORE.geo;
    if (!g || !g.measures[anchor] || !g.measures[mi])
        return;
    const a: any = Math.min(anchor, mi), b: any = Math.max(anchor, mi), lo: any = g.measures[a].b0, hi: any = (g.measures[b] || g.measures[a]).b1;
    const grid: any = SCORE.midiGrid || 0, q: any = (n: any = undefined) => grid ? Math.round(n.start * grid) / grid : n.start, idx: any = [];
    AN.notes.forEach((n: any = undefined, i: any = undefined) => { const s: any = q(n); if (s >= lo - 1e-6 && s < hi - 1e-6)
        idx.push(i); });
    AN.selected = new Set(idx);
    SCORE.mrange = { anchor, a, b, sig: idx.join() };
    anSelectionChanged();
}
function scoreUnlight(): any { if (!SCORE.lit.size)
    return; const old: any = SCORE.lit; SCORE.lit = new Set(); old.forEach(scorePaintIdx); }
const reduceMotion: any = () => (window as any).matchMedia && (window as any).matchMedia('(prefers-reduced-motion: reduce)').matches;
function anKeepVisible(g: any = undefined, smooth: any = undefined): any {
    const box: any = $('an-roll'), r: any = g.getBoundingClientRect(), b: any = box.getBoundingClientRect();
    let top: any = box.scrollTop, left: any = box.scrollLeft;
    if (r.top < b.top + 16 || r.bottom > b.bottom - 16)
        top += r.top - b.top - b.height * .3;
    if (r.left < b.left + 16 || r.right > b.right - 16)
        left += r.left - b.left - b.width * .3;
    if (top !== box.scrollTop || left !== box.scrollLeft)
        box.scrollTo({ top, left, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
}
function scoreStateText(): any { $('score-state').textContent = SCORE.run && SCORE.run.waitShown ? t('sc_state_wait') : SCORE.loop ? (SCORE.loop.ab ? t('sc_state_ab') : t('sc_state_loop', SCORE.loop.bars)) : SCORE.playing ? t(SCORE.sel ? 'sc_state_sel' : 'sc_state_play') : SCORE.paused ? t('sc_state_paused') : ''; }
// Halt sound, timers and animation; the playback position (FALL.position) is left where it is.
function scoreHalt(): any {
    SCORE.playing = false;
    SCORE.sel = false;
    SCORE.paused = false;
    SCORE.loop = null;
    if (SCORE.run) {
        clearInterval(SCORE.run.timer);
        SCORE.run = null;
    }
    PRAC.bar = null;
    $('pr-count').hidden = true;
    $('pr-hud').hidden = true;
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
function scoreIdle(): any { scoreStateText(); anUpdateControls(); anKeysPaint(); fallDraw(); scoreCursorUpdate(true); anStatusPos(); }
// Where Stop returns to: the start of the selected bars or notes, else the beginning.
function anSelStart(): any {
    const g: any = SCORE.geo, R: any = SCORE.mrange;
    if (R && g && g.measures[R.a])
        return scoreSeconds(g.measures[R.a].b0);
    return AN.selected.size ? Math.min(...[...AN.selected].map((i: any = undefined) => scoreSeconds(AN.notes[i].start))) : 0;
}
function scoreStop(): any { scoreHalt(); SCORE.resume = null; FALL.position = AN.notes.length ? anSelStart() : 0; scoreIdle(); }
function scorePause(): any { if (!SCORE.playing)
    return; const at: any = fallTime(), sel: any = SCORE.sel && !SCORE.loop; scoreHalt(); SCORE.paused = true; SCORE.resume = { sel }; FALL.position = at; scoreIdle(); }
// Space / ▶: pause while playing, otherwise resume from the cursor (a paused selection resumes as a selection).
function scoreToggle(): any {
    if (!AN.notes.length || AN.loading)
        return;
    if (SCORE.playing) {
        scorePause();
        return;
    }
    const r: any = SCORE.resume;
    SCORE.resume = null;
    scorePlay(!!(r && r.sel && AN.selected.size), FALL.position);
}
function scoreHome(): any {
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
        $('an-roll').scrollTo({ top: 0, left: 0, behavior: 'auto' });
}
/* practice engine: playback runs on audio-clock segments, score time t = t0 + (now − a0)·f.
   A loop queues its next pass as a new segment ahead of time; "Wait for me" freezes the clock at a barrier (the next note of
   the practised hand) until those keys are played. Notes are scheduled ~0.3 s ahead by a 25 ms tick. */
const PRAC: any = { hands: 'both', wait: false, metro: false, countIn: false, acc: true, hear: true, ramp: false, A: null, B: null, labels: 'letter', pal: 'etude', range: 'fit', fx: true,
    bar: null, active: false, stats: null, res: new Map(), judge: '', judgeT: 0, next: null };
const PRAC_KEY: any = 'etude-practice-v3';
function pracSave(): any { try {
    const { hands, wait, metro, countIn, acc, hear, ramp, labels, pal, range, fx } = PRAC;
    localStorage.setItem(PRAC_KEY, JSON.stringify({ hands, wait, metro, countIn, acc, hear, ramp, labels, pal, range, fx, zoom: FALL.zoom }));
}
catch (e: any) { } }
function pracLoad(): any {
    try {
        const r: any = JSON.parse(localStorage.getItem(PRAC_KEY) || 'null');
        if (!r)
            return;
        if (['both', 'rh', 'lh'].includes(r.hands))
            PRAC.hands = r.hands;
        ['wait', 'metro', 'countIn', 'acc', 'hear', 'ramp', 'fx'].forEach((k: any = undefined) => { if (typeof r[k] === 'boolean')
            PRAC[k] = r[k]; });
        if (['none', 'letter', 'solfege', 'finger'].includes(r.labels))
            PRAC.labels = r.labels;
        if (FALL_PAL[r.pal])
            PRAC.pal = r.pal;
        if (r.range === 'fit' || r.range === 'full')
            PRAC.range = r.range;
        if (typeof r.zoom === 'number' && r.zoom >= .4 && r.zoom <= 2.5)
            FALL.zoom = r.zoom;
    }
    catch (e: any) { }
}
const pracMine: any = (n: any = undefined) => PRAC.hands === 'both' || anHandOf(n) === PRAC.hands;
// My part sounds only when I am not being waited for; the other hand is the accompaniment (or muted).
const pracSounds: any = (n: any = undefined) => pracMine(n) ? PRAC.hear && !PRAC.wait : PRAC.acc;
const pracFactor: any = () => +($('score-speed').value || 100) / 100;
function pracSegAt(R: any = undefined, now: any = undefined): any { let s: any = R.segs[0]; for (const x of R.segs)
    if (x.a0 <= now + 1e-9)
        s = x; return s; }
function pracRaw(R: any = undefined, now: any = undefined): any { const s: any = pracSegAt(R, now); return { s, t: s.t0 + Math.max(0, now - s.a0) * s.f }; }
function pracBeats(): any {
    if (FALL.beatSrc === fallData() && FALL.beatTempo === SCORE.tempoList)
        return FALL.beats;
    const out: any = [];
    for (const m of anMeasures()) {
        const u: any = anBeatUnit(m);
        let k: any = 0;
        for (let b: any = m.start; b < m.end - 1e-6; b += u, k++)
            out.push({ t: scoreSeconds(b), acc: k === 0 });
    }
    FALL.beatSrc = fallData();
    FALL.beatTempo = SCORE.tempoList;
    FALL.beats = out;
    return out;
}
function pracStatsReset(): any {
    PRAC.stats = { perfect: 0, good: 0, miss: 0, wrong: 0, streak: 0, best: 0, passHit: 0, passAll: 0, lastPass: null };
    PRAC.active = PRAC.wait;
    PRAC.judge = '';
    const old: any = [...PRAC.res.keys()];
    PRAC.res = new Map();
    old.forEach(scorePaintIdx);
    pracHud();
}
function pracAcc(st: any = undefined): any { const all: any = st.perfect + st.good + st.miss + st.wrong; return all ? (st.perfect + st.good) / all : null; }
async function pracStart(o: any = undefined) {
    scoreHalt();
    SCORE.resume = null;
    ensureAudio();
    const gen: any = SCORE.playGen;
    FALL.position = o.from;
    scoreIdle();
    const soundMidis: any = [...new Set(o.notes.flatMap((d: any = undefined) => [d.n.midi, ...(d.n.graces || []).map((g: any = undefined) => g.midi)]))];
    if (!await pianoEnsure(soundMidis) || gen !== SCORE.playGen)
        return;
    const f: any = pracFactor(), now: any = actx.currentTime + .1;
    let a0: any = now, ci: any = null;
    if (PRAC.countIn) {
        const beat: any = scoreBeatAt(o.from), m: any = anMeasureAt(beat) || { num: 4, den: 4 }, u: any = anBeatUnit(m), n: any = Math.max(2, Math.round(m.num * 4 / m.den / u)), sec: any = u * 60 / anTempoAt(beat) / f;
        for (let k: any = 0; k < n; k++)
            metroClick(now + k * sec, k === 0);
        ci = { t: now, n, sec };
        a0 = now + n * sec;
    }
    const beats: any = pracBeats(), first: any = (t: any = undefined) => { const i: any = beats.findIndex((b: any = undefined) => b.t >= t - 1e-6); return i < 0 ? beats.length : i; };
    const mine: any = o.notes.filter((d: any = undefined) => pracMine(d.n));
    const R: any = { ...o, segs: [{ a0, t0: o.from, t1: o.b, f, first: true }], ni: 0, beats, bi: first(o.from), beat0: first(o.a), wt: o.from, pass: 1, mine, mi: Math.max(0, mine.findIndex((d: any = undefined) => d.start >= o.from - 1e-6)), judged: new Map(), gen, ci, timer: 0 };
    if (R.mi < 0 || !mine.some((d: any = undefined) => d.start >= o.from - 1e-6))
        R.mi = mine.length;
    SCORE.run = R;
    SCORE.playing = true;
    SCORE.sel = o.sel;
    SCORE.loop = o.loop ? { a: o.a, b: o.b, bars: o.bars, ab: !!o.ab, pass: 1, notes: o.notes, next: a0 + (o.b - o.a) / f } : null;
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
function pracTick(): any {
    const R: any = SCORE.run;
    if (!R || !SCORE.playing || !actx || R.gen !== SCORE.playGen)
        return;
    const now: any = actx.currentTime, H: any = now + .3;
    for (let guard: any = 0; guard < 4; guard++) {
        const s: any = R.segs[R.segs.length - 1];
        if (PRAC.wait && !PRAC.bar && R.wt !== Infinity)
            pracNextBar(R, s);
        const B: any = PRAC.bar && PRAC.bar.seg === s ? PRAC.bar : null, at: any = (x: any = undefined) => s.a0 + (x - s.t0) / s.f;
        const horizon: any = s.t0 + Math.max(0, H - s.a0) * s.f, lim: any = Math.min(horizon, s.t1, B ? B.t : Infinity);
        while (R.ni < R.notes.length) {
            const d: any = R.notes[R.ni];
            if (d.start >= lim)
                break;
            R.ni++;
            const sound: any = d.sound ?? d.finish;
            if (d.start < s.t0 - 1e-6 && (!s.first || sound <= s.t0 + .05))
                continue; // a note already sounding when playback starts plays its remainder
            if (!pracSounds(d.n))
                continue;
            const st: any = Math.max(d.start, s.t0), en: any = R.loop ? Math.min(sound, s.t1) : sound, roll: any = d.n.roll || 0, onset: any = at(st) + roll;
            const opt: any = { warm: !!d.n.warm, hold: !!d.n.pedalEnd && d.n.soundEnd > d.n.end + .001 }, graces: any = st > d.start + 1e-6 ? [] : (d.n.graces || []), duration: any = Math.max(.05, (en - st) / s.f - roll);
            let carried: any = false;
            graces.forEach((g: any = undefined, i: any = undefined) => {
                const when: any = onset - (graces.length - i) * .07, start: any = Math.max(now, when), carry: any = i === graces.length - 1 && g.tiedToPrincipal && g.midi === d.n.midi;
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
            const b: any = R.beats[R.bi++];
            if (PRAC.metro && b.t >= s.t0 - 1e-6 && b.t < s.t1 - 1e-6)
                metroClick(Math.max(now, at(b.t)), b.acc);
        }
        if (R.loop && !B && horizon >= s.t1) {
            const next: any = { a0: at(s.t1), t0: R.a, t1: R.b, f: pracRamp(R, s), first: false };
            R.segs.push(next);
            if (SCORE.loop)
                SCORE.loop.next = next.a0 + (R.b - R.a) / next.f;
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
    const time: any = fallTime();
    if (PRAC.active && !PRAC.wait)
        pracMisses(R, time);
    const s0: any = R.segs[0];
    if (!R.loop && time >= R.b - 1e-6 && now >= s0.a0 + (R.b - s0.t0) / s0.f + .3)
        pracFinish(R);
}
// Loop: the next pass is 1 step faster (up to 100%) when the pass was clean, or always when no one is playing along.
function pracRamp(R: any = undefined, s: any = undefined): any {
    if (!PRAC.ramp)
        return s.f;
    const st: any = PRAC.stats, acc: any = st.passAll ? st.passHit / st.passAll : null;
    if (PRAC.active && (acc == null || acc < .8))
        return s.f;
    const sel: any = $('score-speed'), cur: any = Math.round(s.f * 100), next: any = [...sel.options].map((o: any = undefined) => +o.value).find((v: any = undefined) => v > cur && v <= 100);
    if (!next)
        return s.f;
    sel.value = String(next);
    return next / 100;
}
function pracPassEnd(R: any = undefined): any {
    const st: any = PRAC.stats;
    R.pass++;
    st.lastPass = st.passAll ? st.passHit / st.passAll : null;
    st.passHit = 0;
    st.passAll = 0;
    if (SCORE.loop)
        SCORE.loop.pass = R.pass;
    FALL.factor = R.segs[0].f;
    R.mi = 0;
    R.judged = new Map();
    R.waitShown = false;
    const old: any = [...PRAC.res.keys()];
    PRAC.res = new Map();
    if (FALL.mode === 'score')
        old.forEach(scorePaintIdx);
    pracHud();
}
function pracNextBar(R: any = undefined, s: any = undefined): any {
    const from: any = Math.max(R.wt, s.t0);
    const d: any = R.mine.find((x: any = undefined) => x.start >= from - 1e-6 && x.start < s.t1 - 1e-6 && !(s.first && x.start < R.from - 1e-6));
    if (!d) {
        R.wt = Infinity;
        return;
    }
    const group: any = R.mine.filter((x: any = undefined) => Math.abs(x.start - d.start) < .03);
    PRAC.bar = { t: d.start, need: new Set(group.map((x: any = undefined) => x.n.midi)), got: new Set(), group, seg: s, since: 0 };
}
function pracRelease(R: any = undefined, B: any = undefined, now: any = undefined): any {
    const s: any = B.seg, t: any = s.t0 + Math.max(0, now - s.a0) * s.f;
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
function pracMisses(R: any = undefined, time: any = undefined): any {
    const tol: any = .22 * (R.segs[0].f || 1);
    while (R.mi < R.mine.length && R.mine[R.mi].start < time - tol) {
        const d: any = R.mine[R.mi++];
        if (!R.judged.has(d.i))
            pracJudge(R, d, 'miss');
    }
}
function pracJudge(R: any = undefined, d: any = undefined, j: any = undefined): any {
    const st: any = PRAC.stats;
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
function pracInput(kind: any = undefined): any {
    const R: any = SCORE.run;
    if (kind === 'on' && R && SCORE.playing && actx) {
        const m: any = heldOrder[heldOrder.length - 1], now: any = actx.currentTime;
        if (m != null && now >= R.segs[0].a0 - .05) {
            PRAC.active = true;
            const { s, t } = pracRaw(R, now), B: any = PRAC.bar;
            if (B && B.seg === s && t >= B.t - .3 * s.f && B.need.has(m)) {
                if (!B.got.has(m)) {
                    B.got.add(m);
                    const late: any = Math.max(0, t - B.t) / s.f;
                    B.group.filter((x: any = undefined) => x.n.midi === m).forEach((x: any = undefined) => pracJudge(R, x, late < .15 ? 'perfect' : 'good'));
                }
                if ([...B.need].every((x: any = undefined) => B.got.has(x)))
                    pracRelease(R, B, now);
            }
            else {
                const time: any = fallTime(), tol: any = .22 * s.f;
                let best: any = null;
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
function pracHud(): any {
    const hud: any = $('pr-hud'), st: any = PRAC.stats;
    if (!hud)
        return;
    const show: any = !!st && PRAC.active && AN.notes.length > 0 && (SCORE.playing || !!SCORE.run);
    hud.hidden = !show;
    if (!show)
        return;
    const acc: any = pracAcc(st);
    $('pr-acc-v').textContent = acc == null ? '–' : Math.round(acc * 100) + '%';
    $('pr-streak').textContent = st.streak;
    $('pr-pass').textContent = SCORE.run ? SCORE.run.pass : 1;
    $('pr-tempo').textContent = Math.round(((SCORE.run && SCORE.run.segs[0].f) || pracFactor()) * 100) + '%';
    const j: any = $('pr-judge'), fresh: any = PRAC.judge && performance.now() - PRAC.judgeT < 900;
    j.dataset.j = fresh ? PRAC.judge : '';
    j.textContent = fresh ? t('pr_' + (PRAC.judge === 'miss' ? 'miss' : PRAC.judge)) : '';
}
function pracFinish(R: any = undefined): any {
    const sel: any = R.sel, a: any = R.a, end: any = R.b;
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
    $('pr-hud').hidden = true;
    if (PRAC.active && PRAC.stats)
        pracSummary(R);
}
function pracSummary(R: any = undefined): any {
    const st: any = PRAC.stats, acc: any = pracAcc(st);
    PRAC.next = pracNextStep(R);
    pracNextRender();
    $('pr-sum-acc').textContent = acc == null ? '–' : Math.round(acc * 100) + '%';
    ['perfect', 'good', 'miss', 'wrong'].forEach((k: any = undefined) => { $('pr-sum-' + k).textContent = st[k]; });
    $('pr-sum-note').textContent = t('pr_sum_note', st.best, Math.round(pracFactor() * 100) + '%');
    $('pr-sum').hidden = false;
    anSideSync();
    $('pr-again').focus({ preventScroll: true });
}
function pracSumClose(): any { $('pr-sum').hidden = true; PRAC.next = null; anSideSync(); }
// Count-in digits, the waiting state and the HUD's fading judgement follow the animation frame.
function pracFrame(): any {
    const R: any = SCORE.run, c: any = $('pr-count');
    if (!R) {
        if (!c.hidden)
            c.hidden = true;
        return;
    }
    const now: any = actx.currentTime, ci: any = R.ci;
    let txt: any = '';
    if (ci && now < R.segs[0].a0)
        txt = String(Math.min(ci.n, Math.floor((now - ci.t) / ci.sec) + 1));
    if (c.textContent !== txt)
        c.textContent = txt;
    c.hidden = !txt;
    const B: any = PRAC.bar, waiting: any = !!B && B.seg === pracSegAt(R, now) && pracRaw(R, now).t >= B.t;
    if (waiting !== !!R.waitShown) {
        R.waitShown = waiting;
        scoreStateText();
    }
    if (PRAC.judge && performance.now() - PRAC.judgeT > 900 && $('pr-judge').textContent)
        pracHud();
}
function pracSet(k: any = undefined, v: any = undefined): any {
    PRAC[k] = v;
    pracSave();
    if (k === 'hands') {
        SCORE.heads.forEach((l: any = undefined) => l.forEach(scorePaintEl));
        anKeysPaint();
    }
    if (SCORE.playing && ['hands', 'wait', 'acc', 'hear'].includes(k)) {
        const at: any = fallTime();
        if (SCORE.loop)
            scoreLoopStart();
        else
            scorePlay(SCORE.sel, at);
    }
    anUpdateControls();
    if (FALL.mode === 'fall')
        fallDraw();
}
function pracSetAB(which: any = undefined): any {
    if (!AN.notes.length)
        return;
    const t0: any = SCORE.playing ? fallTime() : FALL.position, ms: any = anMeasures(), m: any = anMeasureAt(scoreBeatAt(t0));
    // snap to the bar line: A to the start of the current bar, B to its end
    const x: any = which === 'A' ? scoreSeconds(m.start) : scoreSeconds(m.end);
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
function pracClearAB(): any { PRAC.A = PRAC.B = null; if (SCORE.loop && SCORE.loop.ab)
    scoreStop(); anUpdateControls(); anTlUpdate(); }
async function scorePlay(selection: any = false, from: any = null) {
    if (!AN.notes.length)
        return;
    const all: any = fallData(), chosen: any = selection ? all.filter((d: any = undefined) => AN.selected.has(d.i)) : all;
    if (!chosen.length)
        return;
    const a: any = selection ? Math.min(...chosen.map((d: any = undefined) => d.start)) : 0, b: any = selection ? Math.max(...chosen.map((d: any = undefined) => d.finish)) : fallEnd();
    let position: any = from != null ? from : selection ? a : FALL.position;
    if (position >= b - .05 || position < a - 1e-6)
        position = a; // at the end, or outside the selection: start over
    const notes: any = chosen.filter((d: any = undefined) => d.finish > position).sort((x: any = undefined, y: any = undefined) => x.start - y.start || x.n.midi - y.n.midi);
    if (!notes.length) {
        scoreHalt();
        scoreIdle();
        return;
    }
    await pracStart({ notes, a, b, loop: false, sel: selection, from: position });
}
// Loop the selected notes, else the A–B range (whole bars).
async function scoreLoopStart() {
    const all: any = fallData();
    let notes: any = null, a: any = 0, b: any = 0, bars: any = '', ab: any = false;
    if (AN.selected.size) {
        notes = all.filter((d: any = undefined) => AN.selected.has(d.i));
        if (notes.length) {
            a = Math.min(...notes.map((d: any = undefined) => d.start));
            b = Math.max(...notes.map((d: any = undefined) => d.finish));
            bars = anBarsLabel(notes.map((d: any = undefined) => d.n));
        }
    }
    else if (PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A) {
        a = PRAC.A;
        b = PRAC.B;
        ab = true;
        notes = all.filter((d: any = undefined) => d.start >= a - 1e-6 && d.start < b - 1e-6);
    }
    if (!notes || !notes.length || !(b > a)) {
        scoreStop();
        return;
    }
    notes.sort((x: any = undefined, y: any = undefined) => x.start - y.start || x.n.midi - y.n.midi);
    await pracStart({ notes, a, b, loop: true, sel: !ab, ab, from: a, bars });
}
// Follow playback: move the cursor (keeping it in view), light the sounding keys (and noteheads, if asked) and refresh the status bar.
function scoreFollow(): any {
    SCORE.followRaf = 0;
    if (!SCORE.playing) {
        scoreUnlight();
        anKeysPaint();
        return;
    }
    const time: any = fallTime(), now: any = new Set(), sel: any = SCORE.sel ? AN.selected : null;
    fallData().forEach(({ i, start, finish }: any = undefined) => { if (time >= start && time < finish && (!sel || sel.has(i)))
        now.add(i); });
    if (now.size !== SCORE.lit.size || [...now].some((i: any = undefined) => !SCORE.lit.has(i))) {
        const old: any = SCORE.lit;
        SCORE.lit = now;
        if (FALL.mode === 'score' && SCORE.hl) {
            old.forEach((i: any = undefined) => { if (!now.has(i))
                scorePaintIdx(i); });
            now.forEach((i: any = undefined) => { if (!old.has(i))
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
function anZoomNow(): any { return FALL.mode === 'fall' ? FALL.zoom : SCORE.zoom; }
function scoreZoom(z: any = undefined): any {
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
function scoreSetLook(v: any = undefined): any { SCORE.look = v === 'night' ? 'night' : 'paper'; $('an-roll').dataset.look = SCORE.look; anUpdateControls(); if (SCORE.engine)
    scoreLayout(); saveAll(); }
// "Highlight sounding notes": off by default, so the notes stay black while the blue line plays through them.
function scoreSetHl(on: any = undefined): any { SCORE.hl = !!on; SCORE.heads.forEach((l: any = undefined) => l.forEach(scorePaintEl)); anUpdateControls(); saveAll(); }
// Page | Continuous | Falling notes; the choice is remembered like the appearance.
function scoreSetView(v: any = undefined): any {
    if (v === 'fall') {
        if (FALL.mode !== 'fall')
            fallMode('fall');
        saveAll();
        return;
    }
    const lay: any = v === 'cont' ? 'cont' : 'page';
    if (lay !== SCORE.layout) {
        SCORE.layout = lay;
        $('an-roll').dataset.layout = lay;
        SCORE.stale = !!SCORE.engine;
        $('an-roll').scrollTo({ top: 0, left: 0 });
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
function anDockWanted(): any { return AN.notes.length > 0 && FALL.mode !== 'fall'; }
function anKeysShown(): any { return view0() === 'analysis' && dockShown(); }
// The score's height follows the dock (and the page's bottom padding follows it the other way, so the page keeps its length).
// Keep still what is being read: the score's top edge while the score fills the upper half of the view (it simply grows or
// shrinks at the bottom), otherwise what follows it.
function anKeepPlace(): any {
    const stage: any = $('an-stage'), r: any = stage.getBoundingClientRect(), root: any = document.documentElement;
    const below: any = r.height > 0 && r.bottom < ((document as any).querySelector('header').getBoundingClientRect().bottom + innerHeight) / 2; // same split in both states, so a round trip returns to the same place
    root.style.overflowAnchor = 'none'; // the browser's own scroll anchoring would hold the score and push what follows down
    return () => { const now: any = stage.getBoundingClientRect(), d: any = below ? now.bottom - r.bottom : now.top - r.top; if (Math.abs(d) >= .5)
        window.scrollBy(0, d); requestAnimationFrame(() => { root.style.overflowAnchor = ''; }); };
}
// The score viewport is sized in CSS from these: 100dvh − header − toolbar − status bar − dock (when shown).
function anLayoutVars(): any {
    const st: any = document.documentElement.style, h: any = (el: any = undefined) => el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0, dock: any = $('dock');
    st.setProperty('--hdr-h', h((document as any).querySelector('header')) + 'px');
    st.setProperty('--dock-h', (document.body.classList.contains('kb') ? h(dock) : 0) + 'px');
    st.setProperty('--an-tb-h', h($('an-tbwrap')) + 'px');
    st.setProperty('--an-sb-h', h($('an-status')) + 'px');
    st.setProperty('--an-low', h(SIDE.sheet && anNarrow() ? $('an-side') : $('an-status')) + 'px');
    anPinToolbarLater();
}
// Keep transport reachable while the page is scrolled below the score card's title row.
function anPinToolbar(): any {
    AN.pinRaf = 0;
    const tb: any = $('an-tbwrap');
    const active: any = view0() === 'analysis' && AN.notes.length && !tb.hidden;
    if (!active) {
        tb.classList.remove('is-floating');
        return;
    }
    const header: any = (document as any).querySelector('header'), headBottom: any = header.getBoundingClientRect().bottom;
    const source: any = $('an-src').getBoundingClientRect(), section: any = $('view-analysis').getBoundingClientRect();
    const pin: any = source.bottom <= headBottom + 1 && section.bottom > headBottom + tb.offsetHeight + 12;
    if (pin) {
        const r: any = $('an-panel').getBoundingClientRect();
        tb.style.setProperty('--an-pin-x', Math.round(r.left) + 'px');
        tb.style.setProperty('--an-pin-w', Math.round(r.width) + 'px');
    }
    tb.classList.toggle('is-floating', pin);
}
function anPinToolbarLater(): any { if (!AN.pinRaf)
    AN.pinRaf = requestAnimationFrame(anPinToolbar); }
// After opening a score, line the viewport up under the toolbar so it sits fully between the header and the dock.
function anFocusStage(smooth: any = false): any {
    if (view0() !== 'analysis' || !AN.notes.length)
        return;
    anLayoutVars();
    const y: any = $('an-stage').getBoundingClientRect().top + window.scrollY - (document as any).querySelector('header').getBoundingClientRect().height - $('an-tbwrap').getBoundingClientRect().height;
    if (Math.abs(window.scrollY - y) > 1)
        window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
}
/* status bar: the position text is not a live region (no announcements while playing); selection changes are announced once, debounced */
function anTempoAt(beat: any = undefined): any { let bpm: any = SCORE.tempoList[0].bpm; for (const e of SCORE.tempoList) {
    if (e.beat <= beat + 1e-6)
        bpm = e.bpm;
    else
        break;
} return bpm; }
function anStatusPos(time: any = undefined): any {
    if (!AN.notes.length)
        return;
    const t0: any = time != null ? time : fallTime(), beat: any = scoreBeatAt(t0), m: any = anMeasureAt(beat) || { number: '1', start: 0, num: 4, den: 4 }, u: any = anBeatUnit(m);
    const beats: any = Math.max(1, Math.round(m.num * 4 / m.den / u)), bt: any = Math.min(beats, Math.max(1, Math.floor((beat - m.start) / u + 1e-6) + 1));
    const set: any = (id: any = undefined, v: any = undefined) => { const el: any = $(id); if (el.textContent !== v)
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
function anStatusSel(): any {
    const el: any = $('st-sel'), n: any = AN.selected.size, R: any = SCORE.mrange, ms: any = anMeasures(), num: any = (i: any = undefined) => (ms[i] || { number: String(i + 1) }).number;
    const txt: any = R ? t('st_msel', R.a === R.b ? t('an_bar1', num(R.a)) : t('an_bars', num(R.a), num(R.b)), n) : n ? (n === 1 ? t('st_sel1') : t('st_sel', n)) : '';
    if (el.textContent === txt)
        return;
    el.textContent = txt;
    clearTimeout(AN.liveT);
    AN.liveT = setTimeout(() => { $('st-live').textContent = txt; }, 500);
}
function anActiveChord(sel: any = undefined): any {
    if (AN.active && AN.active.kind === 'chord' && AN.view) {
        const seg: any = AN.view.segs[AN.active.k];
        if (seg)
            return { root: seg.ch.root, pcs: seg.ch.c.p };
    }
    const id: any = identifyChord([...new Set(sel.map((n: any = undefined) => n.midi))]);
    return id ? { root: id.rootPc, pcs: id.chord.pcset } : null;
}
function anSegAt(beat: any = undefined): any {
    const all: any = AN.notes.length ? anCompute(AN.notes, 'all').segs : [];
    let lo: any = 0, hi: any = all.length - 1;
    while (lo <= hi) {
        const mid: any = (lo + hi) >> 1, s: any = all[mid];
        if (beat < s.start - 1e-6)
            hi = mid - 1;
        else if (beat >= s.end - 1e-6)
            lo = mid + 1;
        else
            return s;
    }
    return null;
}
function anKeysPaint(force: any = undefined): any {
    if (force)
        AN.kbApplied = new Map();
    if (!anKeysShown()) {
        if (AN.kbApplied.size)
            anKeysClear();
        return;
    }
    const want: any = new Map();
    let deg: any = null;
    if (SCORE.playing) {
        const lit: any = [...SCORE.lit].map((i: any = undefined) => AN.notes[i]).filter(Boolean);
        lit.forEach((n: any = undefined) => want.set(foldToView(n.midi), anHandOf(n)));
        const seg: any = lit.length && anSegAt(scoreBeatAt(fallTime()));
        if (seg)
            deg = chordDegreeMap(lit.map((n: any = undefined) => n.midi), seg.ch.root, seg.ch.c.p);
    }
    else if (AN.selected.size) {
        const sel: any = [...AN.selected].map((i: any = undefined) => AN.notes[i]).filter(Boolean);
        sel.forEach((n: any = undefined) => want.set(foldToView(n.midi), 'target'));
        const ch: any = anActiveChord(sel);
        if (ch)
            deg = chordDegreeMap(sel.map((n: any = undefined) => n.midi), ch.root, ch.pcs);
    }
    AN.kbApplied.forEach((s: any = undefined, m: any = undefined) => { if (want.get(m) !== s) {
        const el: any = keyEl.get(m);
        if (el && el.dataset.s === s)
            kbState(m, null, false);
    } });
    want.forEach((s: any = undefined, m: any = undefined) => { const el: any = keyEl.get(m); if (el && el.dataset.s !== s)
        kbState(m, s, false); });
    AN.kbApplied = want;
    kbDegrees(deg);
}
function anKeysClear(): any { AN.kbApplied.forEach((s: any = undefined, m: any = undefined) => { const el: any = keyEl.get(m); if (el && el.dataset.s === s)
    kbState(m, null, false); }); AN.kbApplied = new Map(); kbDegrees(null); }
// Centre the dock on the music the first time its keys are shown for a score, so lit keys are rarely folded.
function anKeysCenter(): any {
    AN.kbCenter = false;
    if (!AN.notes.length)
        return;
    const ms: any = AN.notes.map((n: any = undefined) => n.midi).sort((a: any = undefined, b: any = undefined) => a - b), med: any = ms[ms.length >> 1];
    const low: any = Math.max(BASE_LOW, Math.min(BASE_HIGH - view.oct * 12, Math.round((med - view.oct * 6) / 12) * 12));
    if (low !== view.low) {
        view.low = low;
        buildKeyboard();
        repaintHeld();
    }
}
/* analysis workspace */
function anOriginText(): any { const o: any = AN.keyOrigin; return t(o === 'file' ? (AN.source && AN.source.kind === 'example' ? 'an_origin_piece' : 'an_origin_file') : o === 'manual' ? 'an_origin_manual' : o === 'mode' ? 'an_origin_mode' : 'an_origin_auto'); }
// The passage the Practice tab and Read & Play work on: the selected bars or notes, else the whole piece.
function anScopeNotes(): any { const f: any = anFocus(false); return f && f.kind !== 'cursor' ? anFocusNotes(f) : AN.notes; }
function anBarsLabel(ns: any = undefined, L: any = undefined): any {
    const a: any = anMeasureAt(Math.min(...ns.map((n: any = undefined) => n.start))).number, b: any = anMeasureAt(Math.max(...ns.map((n: any = undefined) => n.start))).number;
    return a === b ? tl(L || lang, 'an_bar1', a) : tl(L || lang, 'an_bars', a, b);
}
function anNum(x: any = undefined, d: any = undefined): any { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(LOCALE_TAGS[lang] || lang); }
function anClock(sec: any = undefined): any { const s: any = Math.max(0, sec); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function anChordLabel(seg: any = undefined, key: any = undefined): any { const ch: any = seg.ch; return spellName(60 + ch.root, key) + ch.c.s + (seg.bass !== ch.root ? '/' + spellName(60 + seg.bass, key) : ''); }
function anBeatText(seg: any = undefined): any {
    const m: any = seg.measure, u: any = seg.unit, b1: any = 1 + (seg.start - m.start) / u, b2: any = (seg.end - m.start) / u, f: any = (x: any = undefined) => anNum(x, 1);
    return b2 - b1 < 1e-6 ? t('an_beat', f(b1)) : t('an_beats', f(b1) + '–' + f(b2));
}
function anDetText(ch: any = undefined): any { return t('an_det_' + ch.det); }
// What each hand plays in a chord span, low to high, each pitch class once: "RH E G C · LH C G".
function anHandsText(seg: any = undefined, key: any = undefined): any {
    const by: any = { rh: [], lh: [] };
    seg.notes.slice().sort((a: any = undefined, b: any = undefined) => a.midi - b.midi).forEach((n: any = undefined) => { const h: any = by[anHandOf(n)], p: any = pc(n.midi); if (!h.some((m: any = undefined) => pc(m) === p))
        h.push(n.midi); });
    return ['rh', 'lh'].filter((h: any = undefined) => by[h].length).map((h: any = undefined) => t('an_' + h) + ' ' + by[h].slice(0, 6).map((m: any = undefined) => spellName(m, key)).join(' ') + (by[h].length > 6 ? ' …' : '')).join(' · ');
}
// Where the hands come from: the two staves, MIDI tracks, the piece's own parts, or the register.
function anHandsSource(): any {
    const h: any = AN.hands, at: any = (m: any = undefined) => spellName(m, null, true);
    if (!h)
        return AN.notes.some((n: any = undefined) => n.hand) ? t('an_hsrc_staves') : t('an_hsrc_est', at(60));
    return h.how === 'tracks' ? t('an_hsrc_tracks') : h.how === 'piece' ? t('an_hsrc_piece') : t(h.how === 'split' ? 'an_hsrc_split' : 'an_hsrc_est', at(h.split));
}
function anNctText(seg: any = undefined, key: any = undefined): any {
    if (!seg || !seg.nct || !seg.nct.length)
        return '';
    return ['suspension', 'anticipation', 'passing', 'neighbor', 'other'].map((type: any = undefined) => {
        const names: any = [...new Set(seg.nct.filter((x: any = undefined) => x.type === type).map((x: any = undefined) => spellName(x.note.midi, key, true)))];
        return names.length ? t('an_nct_' + type) + ': ' + names.join(', ') : '';
    }).filter(Boolean).join(' · ');
}
function anSegIndexAt(segs: any = undefined, beat: any = undefined): any { let lo: any = 0, hi: any = segs.length - 1; while (lo <= hi) {
    const mid: any = (lo + hi) >> 1, s: any = segs[mid];
    if (beat < s.start - 1e-6)
        hi = mid - 1;
    else if (beat >= s.end - 1e-6)
        lo = mid + 1;
    else
        return mid;
} return -1; }
function anInView(el: any = undefined, box: any = undefined): any { const r: any = el.getBoundingClientRect(), p: any = box.getBoundingClientRect(); return r.bottom > p.top + 4 && r.top < p.bottom - 4; }
// The sounding chord is marked in both tabs. The Piece tab scrolls along only while its reader is following: the previous
// chord was on screen and the list has not been scrolled by hand for a few seconds.
function anSyncTimeline(time: any = undefined, follow: any = undefined): any {
    const side: any = $('an-side'), v: any = AN.view;
    if (!side || side.hidden || !v)
        return;
    const idx: any = anSegIndexAt(v.segs, scoreBeatAt(time != null ? time : fallTime())), sig: any = AN.wsSig + '|' + SIDE.nowSig + '|' + idx;
    if (AN.playSig === sig)
        return;
    AN.playSig = sig;
    AN.playSeg = idx;
    const ws: any = $('an-ws'), prev: any = ws.querySelector('.an-ch.is-current'), seen: any = !!prev && !ws.hidden && anInView(prev, ws);
    side.querySelectorAll('.an-ch.is-current').forEach((el: any = undefined) => { el.classList.remove('is-current'); el.removeAttribute('aria-current'); });
    side.querySelectorAll('.an-prog-row.is-current').forEach((el: any = undefined) => el.classList.remove('is-current'));
    if (idx < 0)
        return;
    side.querySelectorAll((SCORE.playing ? '' : '#an-ws ') + '.an-ch[data-k="' + idx + '"]').forEach((el: any = undefined) => { el.classList.add('is-current'); el.setAttribute('aria-current', 'true'); const row: any = el.closest('.an-prog-row'); if (row)
        row.classList.add('is-current'); });
    const cur: any = ws.querySelector('.an-ch[data-k="' + idx + '"]');
    if (follow && SCORE.playing && cur && seen && !anInView(cur, ws) && performance.now() - SIDE.handScroll > 3000) {
        const r: any = cur.getBoundingClientRect(), p: any = ws.getBoundingClientRect();
        ws.scrollTo({ top: ws.scrollTop + (r.top - p.top) - p.height * .35, behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
}
function anUpdateControls(): any {
    const has: any = AN.notes.length > 0, sel: any = AN.selected.size > 0, busy: any = AN.loading, fall: any = FALL.mode === 'fall', sheet: any = has && !fall, playing: any = SCORE.playing;
    $('an-tbwrap').hidden = !has;
    $('an-status').hidden = !has;
    $('an-stage').dataset.mode = fall && has ? 'fall' : 'score';
    $('an-roll').hidden = fall && has;
    $('fall-wrap').hidden = !fall || !has;
    const pb: any = $('score-play'), pk: any = playing ? 'sc_pause_k' : 'sc_play_k';
    pb.disabled = !has || busy;
    pb.dataset.state = playing ? 'pause' : 'play';
    pb.setAttribute('aria-label', t(pk));
    pb.title = t(pk);
    [['sc-start', 'sc_start_k'], ['score-stop', 'sc_stop_k'], ['an-play', 'an_play'], ['an-loop', 'an_loop_k'], ['an-clear', 'an_clear_k'], ['an-recon-btn', 'an_recon_k']].forEach(([id, k]: any = undefined) => { $(id).setAttribute('aria-label', t(k)); $(id).title = t(k); });
    $('sc-start').disabled = !has;
    $('score-stop').disabled = !has;
    $('score-speed').disabled = !has;
    const ab: any = PRAC.A != null && PRAC.B != null;
    $('an-play').disabled = !sel || busy;
    $('an-loop').disabled = (!sel && !ab && !SCORE.loop) || busy;
    $('an-clear').disabled = !sel && !SCORE.mrange;
    $('an-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
    (document as any).querySelectorAll('#an-mode button').forEach((b: any = undefined) => { const v: any = b.dataset.scoreMode; b.disabled = !has; b.setAttribute('aria-pressed', (v === 'fall' ? fall : !fall && SCORE.layout === v) ? 'true' : 'false'); });
    const z: any = anZoomNow(), zs: any = Math.round(z * 100) + '%';
    $('sc-zoom-out').disabled = !has || z <= 0.5 + 1e-6;
    $('sc-zoom-in').disabled = !has || z >= 2 - 1e-6;
    $('sc-zoom-reset').disabled = !has;
    $('sc-zoom-reset').textContent = zs;
    $('sc-zoom-reset').setAttribute('aria-label', t('sc_zoom_reset', zs));
    $('sc-zoom-reset').title = t(fall ? 'fall_zoom_t' : 'sc_zoom_reset', zs);
    (document as any).querySelectorAll('#sc-look button').forEach((b: any = undefined) => { b.disabled = !sheet; b.setAttribute('aria-pressed', b.dataset.v === SCORE.look ? 'true' : 'false'); });
    const hl: any = $('sc-hl');
    hl.disabled = !sheet;
    hl.setAttribute('aria-pressed', SCORE.hl ? 'true' : 'false');
    hl.setAttribute('aria-label', t('sc_hl'));
    hl.title = t('sc_hl_t');
    // The toolbar toggle is named Keyboard and reports expanded or collapsed; the dock's own button names the action it takes.
    const open: any = sheet && dockOpen(), kb: any = $('an-kb');
    kb.disabled = !sheet;
    kb.setAttribute('aria-expanded', open ? 'true' : 'false');
    kb.title = fall && has ? t('an_kb_fall') : t(open ? 'kb_hide' : 'kb_show');
    const ron: any = !!AN.source && AN.source.kind !== 'xml';
    $('an-recon-btn').hidden = !ron;
    if (!ron)
        anReconOpen(false);
    $('score-credit').hidden = !has || fall;
    $('st-hint').textContent = t(fall ? 'fall_hint' : 'an_hint');
    // toolbar per view: sheet-only controls (zoom, paper/night, docked keyboard) give way to the falling-notes display options
    (document as any).querySelectorAll('#an-toolbar .an-zoom,#sc-look,#sc-hl,#an-kb,.tb-sep-sheet').forEach((el: any = undefined) => { el.hidden = fall && has; });
    $('fall-opt').hidden = !(fall && has);
    if (fall && has)
        $('an-kb').setAttribute('aria-expanded', 'false');
    if (!(fall && has))
        anPop('fall-pop', false);
    $('an-tl').hidden = !has;
    $('an-loop').title = $('an-loop').getAttribute('aria-label') + (ab && !sel ? ' · A–B' : '');
    $('an-metro').setAttribute('aria-pressed', PRAC.metro ? 'true' : 'false');
    $('an-metro').title = t('an_metro_t');
    $('an-metro').setAttribute('aria-label', t('an_metro_t'));
    (document as any).querySelectorAll('#pr-hands button,#pt-hands button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.h === PRAC.hands ? 'true' : 'false'));
    $('pr-wait').setAttribute('aria-pressed', PRAC.wait ? 'true' : 'false');
    $('pr-wait').title = t('pr_wait_t');
    $('pt-wait').checked = PRAC.wait;
    $('pt-metro').checked = PRAC.metro;
    $('pr-countin').checked = PRAC.countIn;
    $('pt-speed').value = $('score-speed').value;
    $('pt-speed').disabled = !has;
    $('pr-opt').title = t('pr_opt_t');
    $('pr-opt').setAttribute('aria-label', t('pr_opt_t'));
    $('fall-opt').title = t('fall_disp_t');
    $('pr-clrab').disabled = PRAC.A == null && PRAC.B == null;
    $('fall-finger-note').textContent = t(has && !anHasFinger() ? 'fall_finger_none' : 'fall_finger_note');
    dockSync();
    anSideSync();
    scoreMarks();
    $('an-now-loop').setAttribute('aria-pressed', SCORE.loop ? 'true' : 'false');
    $('pt-start').textContent = t(playing ? 'pt_stop' : 'pt_start');
    $('pt-start').disabled = !has || busy;
    $('an-example').disabled = busy;
    (document as any).querySelectorAll('#an-roll .an-ex,#an-roll [data-an-open]').forEach((b: any = undefined) => { b.disabled = busy; });
    if (has) {
        anStatusSel();
        anRenderPractice();
    }
}
function anReconOpen(open: any = undefined): any { const b: any = $('an-recon-btn'), p: any = $('an-recon'), on: any = !!open && !b.hidden; p.hidden = !on; b.setAttribute('aria-expanded', on ? 'true' : 'false'); }
function anAnalyze(): any {
    anUpdateControls();
    if (!AN.notes.length) {
        $('an-ws').innerHTML = '';
        AN.view = null;
        AN.wsSig = '';
        anRenderNow();
        anRenderSelection();
        anKeysPaint();
        return;
    }
    const sig: any = [AN.version, lang, notation].join('|');
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
const SIDE: any = { open: true, tab: 'now', w: 340, sheet: false, drag: false, nowSig: '', ptSig: '', liveT: 0, handScroll: 0, deferred: false };
const AN_TABS: any = ['now', 'piece', 'practice'];
function anNarrow(): any { return (window as any).matchMedia('(max-width: 999px)').matches; }
function anSideVisible(tab: any = undefined): any { const side: any = $('an-side'); return !!side && !side.hidden && (anNarrow() ? SIDE.sheet : SIDE.open) && (!tab || SIDE.tab === tab); }
function anSideSync(): any {
    const side: any = $('an-side'), work: any = $('an-work'), btn: any = $('an-side-btn'), fab: any = $('an-fab'), has: any = AN.notes.length > 0, narrow: any = anNarrow(), open: any = has && (narrow ? SIDE.sheet : SIDE.open);
    side.hidden = !has || (!narrow && !SIDE.open);
    side.classList.toggle('is-open', narrow && open);
    work.classList.toggle('has-sheet', narrow && open);
    work.classList.toggle('no-side', !has || narrow || !SIDE.open);
    work.style.setProperty('--an-side-w', SIDE.w + 'px');
    $('an-side-resize').setAttribute('aria-valuenow', String(SIDE.w));
    btn.hidden = !has;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.title = t(open ? 'an_side_hide' : 'an_side_show');
    fab.hidden = !has || !narrow || SIDE.sheet || !$('pr-sum').hidden;
    fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    const pt: any = $('pr-opt');
    pt.setAttribute('aria-expanded', open && SIDE.tab === 'practice' ? 'true' : 'false');
}
function anSideSet(open: any = undefined): any { SIDE.open = !!open; saveAll(); anSideSync(); }
// The sheet is not modal: the score above it stays live. Opening moves focus to the active tab; closing returns it to the button.
// While it is open the score viewport ends where the sheet begins, so everything in the score can still be scrolled to.
function anSheet(open: any = undefined, quiet: any = undefined): any {
    const want: any = !!open && AN.notes.length > 0;
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
        const tab: any = (document as any).querySelector('#an-tabs [aria-selected="true"]');
        if (tab)
            tab.focus({ preventScroll: true });
    }
    else if ($('an-side').contains(document.activeElement) && !$('an-fab').hidden)
        $('an-fab').focus({ preventScroll: true });
}
function anTab(tab: any = undefined, focus: any = undefined): any {
    SIDE.tab = AN_TABS.includes(tab) ? tab : 'now';
    (document as any).querySelectorAll('#an-tabs [role="tab"]').forEach((b: any = undefined) => { const on: any = b.dataset.tab === SIDE.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus)
        b.focus({ preventScroll: true }); });
    $('an-now').hidden = SIDE.tab !== 'now';
    $('an-ws').hidden = SIDE.tab !== 'piece';
    $('an-pt').hidden = SIDE.tab !== 'practice';
    $('pr-opt').setAttribute('aria-expanded', anSideVisible('practice') ? 'true' : 'false');
    if (SIDE.tab === 'piece')
        anRevealPieceRow(false);
    saveAll();
}
// Toolbar shortcuts into the panel (Practice options): show the tab, open the panel or sheet if needed, focus its first control.
function anOpenTab(tab: any = undefined): any {
    AN_POPS.forEach(([p]: any = undefined) => anPop(p, false));
    anReconOpen(false);
    anTab(tab);
    if (anNarrow())
        anSheet(true);
    else if (!SIDE.open)
        anSideSet(true);
    anSideSync();
    const panel: any = $(tab === 'practice' ? 'an-pt' : tab === 'piece' ? 'an-ws' : 'an-now'), first: any = panel.querySelector('button:not([disabled]):not([hidden]),input,select');
    (first || panel).focus({ preventScroll: true });
}
// What Now is about: the bar being played (while playing), else the selected bars, else the bars of the selected notes, else
// the bar under the cursor. a/b index anMeasures(); lo/hi are beats.
function anFocus(follow: any = true): any {
    const ms: any = anMeasures();
    if (!AN.notes.length || !ms.length)
        return null;
    const at: any = (beat: any = undefined) => { let i: any = 0; for (let j: any = 0; j < ms.length; j++) {
        if (ms[j].start <= beat + 1e-6)
            i = j;
        else
            break;
    } return i; };
    const span: any = (a: any = undefined, b: any = undefined, kind: any = undefined) => ({ kind, a, b, lo: ms[a].start, hi: ms[b].end });
    if (follow && SCORE.playing) {
        const i: any = at(scoreBeatAt(fallTime()));
        return span(i, i, 'play');
    }
    const R: any = SCORE.mrange, g: any = SCORE.geo;
    if (R && g && g.measures[R.a])
        return span(at(g.measures[R.a].b0 + 1e-4), at((g.measures[R.b] || g.measures[R.a]).b1 - 1e-4), 'bars');
    const sel: any = [...AN.selected].map((i: any = undefined) => AN.notes[i]).filter(Boolean);
    if (sel.length) {
        const s: any = sel.map((n: any = undefined) => n.start);
        return span(at(Math.min(...s)), at(Math.max(...s)), 'sel');
    }
    const i: any = at(scoreBeatAt(FALL.position));
    return span(i, i, 'cursor');
}
function anFocusNotes(f: any = undefined): any {
    if (!f)
        return [];
    if (f.kind === 'sel')
        return [...AN.selected].sort((a: any = undefined, b: any = undefined) => a - b).map((i: any = undefined) => AN.notes[i]).filter(Boolean);
    const grid: any = SCORE.midiGrid || 0, q: any = (n: any = undefined) => grid ? Math.round(n.start * grid) / grid : n.start;
    return AN.notes.filter((n: any = undefined) => { const s: any = q(n); return s >= f.lo - 1e-6 && s < f.hi - 1e-6; });
}
// Listen, Loop and Practice play exactly what the coral band shows: whole bars (or the selected notes), which become the selection.
function anCommitFocus(): any {
    const f: any = anFocus();
    if (!f)
        return false;
    if (f.kind === 'sel')
        return AN.selected.size > 0;
    const g: any = SCORE.geo;
    if (!g)
        return false;
    const gi: any = (beat: any = undefined) => g.measures.findIndex((m: any = undefined) => m && beat >= m.b0 - 1e-6 && beat < m.b1 - 1e-6), a: any = gi(f.lo), b: any = gi(f.hi - 1e-4);
    if (a < 0 || b < 0)
        return false;
    const R: any = SCORE.mrange;
    if (!(R && R.a === a && R.b === b && !AN.active))
        scoreSelectRange(a, b);
    return AN.selected.size > 0;
}
// Harmonic function from the scale degree (Riemann-style T / S / D); secondary dominants name their target.
function anFunctionOf(key: any = undefined, seg: any = undefined, rn: any = undefined): any {
    if (rn.includes('/'))
        return t('an_fn_sec', rn.slice(rn.indexOf('/') + 1));
    const rel: any = ((seg.ch.root - key.root) % 12 + 12) % 12, f: any = (key.minor ? ({ 0: 'T', 3: 'T', 8: 'T', 2: 'S', 5: 'S', 7: 'D', 10: 'D', 11: 'D' } as any) : ({ 0: 'T', 4: 'T', 9: 'T', 2: 'S', 5: 'S', 7: 'D', 11: 'D' } as any))[rel];
    return t(f ? 'an_fn_' + f : 'an_fn_chr');
}
// One chord of the progression: symbol, Roman numeral, beats and how sure the reading is; the full reading, with what each hand
// plays, is its accessible name.
function anChipHTML(s: any = undefined, i: any = undefined, rove: any = undefined): any {
    const esc: any = xmlEsc, key: any = anKeyAt(s.start), lab: any = anChordLabel(s, key), rn: any = anRoman(key, s), beats: any = anBeatText(s), conf: any = s.ch.conf;
    const alts: any = s.ch.alts.map((a: any = undefined) => spellName(60 + a.root, key) + a.c.s).join(', '), cad: any = s.cad ? t('an_cad_' + s.cad) : '', det: any = anDetText(s.ch), nct: any = anNctText(s, key);
    const label: any = [t('an_bar') + ' ' + s.measure.number, beats, lab, rn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), anHandsText(s, key), nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
    const time: any = anClock(scoreSeconds(s.start)) + '–' + anClock(scoreSeconds(s.end));
    return `<button type="button" class="an-ch" data-k="${i}" data-conf="${conf}"${rove == null ? '' : ` tabindex="${rove ? 0 : -1}"`} aria-pressed="false" aria-label="${esc(label)}" title="${esc(label + ' · ' + time)}"><span class="an-ch-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-ch-rn">${esc(rn)}</span><span class="an-ch-t">${esc(beats + ' · ' + det)}</span>${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>`
        + (cad ? `<span class="an-cad" title="${esc(t('an_cad_title'))}">${esc(cad)}</span>` : '');
}
// Chords grouped by bar; each row carries its bar index so the selected bars can be marked.
function anRowsHTML(list: any = undefined, rove: any = undefined): any {
    const ms: any = anMeasures();
    let html: any = '', bar: any = null;
    list.forEach(({ s, k }: any = undefined) => {
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
function anNowCard({ s, k }: any = undefined, implied: any = undefined): any {
    const esc: any = xmlEsc, key: any = anKeyAt(s.start), lab: any = anChordLabel(s, key), rn: any = anRoman(key, s), conf: any = s.ch.conf, open: any = s.ch.c.q === 'S' || s.ch.c.q === 'P';
    const inv: any = implied ? 0 : anInv(s), slash: any = !implied && s.bass !== s.ch.root;
    const fn: any = [anFunctionOf(key, s, rn), implied ? t('an_implied') : open || slash && !inv ? '' : invName(inv), slash ? t('an_bass', spellName(60 + s.bass, key)) : ''].filter(Boolean).join(' · ');
    const alts: any = s.ch.alts.map((a: any = undefined) => spellName(60 + a.root, key) + a.c.s).join(', '), det: any = anDetText(s.ch), hands: any = anHandsText(s, key);
    const meta: any = anBeatText(s) + ' · ' + det + (alts ? ' (' + t('an_or', alts) + ')' : ''), nct: any = anNctText(s, key), cad: any = s.cad ? t('an_cad_' + s.cad) : '';
    const label: any = [t('an_bar') + ' ' + s.measure.number, anBeatText(s), lab, rn, fn, det + (alts ? ' (' + t('an_or', alts) + ')' : ''), hands, nct && t('an_nct_label') + ': ' + nct, cad].filter(Boolean).join(', ');
    return `<li><button type="button" class="an-ch an-nc" data-k="${k}" data-conf="${conf}" aria-pressed="false" aria-label="${esc(label)}"><span class="an-nc-sym">${esc(lab)}${conf === 'low' ? '?' : ''}</span><span class="an-nc-rn">${esc(rn)}</span><span class="an-nc-fn">${esc(fn)}</span><span class="an-ch-t an-nc-meta">${esc(meta)}</span>${hands ? `<span class="an-ch-hands">${esc(hands)}</span>` : ''}${nct ? `<span class="an-ch-nct"><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>` : ''}</button>${cad ? `<span class="an-cad" title="${esc(t('an_cad_title'))}">${esc(cad)}</span>` : ''}</li>`;
}
// Now: rebuilt only when its bar(s) change. While playing it follows the music, but never pulls the content from under a
// focused control (it catches up when focus leaves) and never scrolls the panel.
function anRenderNow(): any {
    const body: any = $('an-now-body');
    if (!body)
        return;
    const f: any = AN.view ? anFocus() : null, h: any = $('an-now-h'), sub: any = $('an-now-sub'), acts: any = [$('an-now-listen'), $('an-now-loop'), ...$('an-now-hands').children];
    if (!f) {
        SIDE.nowSig = '';
        h.textContent = '';
        sub.textContent = '';
        body.innerHTML = '';
        $('an-now-mark').hidden = true;
        $('an-now-pill').hidden = true;
        $('an-coach').hidden = true;
        $('an-coach').innerHTML = '';
        acts.forEach((b: any = undefined) => { b.disabled = true; });
        return;
    }
    const sig: any = [AN.wsSig, f.kind, f.a, f.b, f.kind === 'sel' ? [...AN.selected].sort((x: any = undefined, y: any = undefined) => x - y).join() : '', SCORE.loop ? 'L' : '', FALL.mode].join('|');
    if (sig === SIDE.nowSig)
        return;
    if (SCORE.playing && body.contains(document.activeElement)) {
        SIDE.deferred = true;
        return;
    }
    SIDE.deferred = false;
    const esc: any = xmlEsc, v: any = AN.view, ms: any = anMeasures(), num: any = (i: any = undefined) => ms[i].number, one: any = f.a === f.b, notes: any = anFocusNotes(f), key: any = anKeyAt(f.lo);
    const count: any = notes.length === 1 ? t('an_note1') : t('an_sel_notes', notes.length), bars: any = one ? t('an_bar1', num(f.a)) : t('an_bars', num(f.a), num(f.b));
    const head: any = f.kind === 'sel' ? t('an_sel_h') : one ? t('st_bar', num(f.a)) : t('an_now_passage', bars);
    h.textContent = head;
    sub.textContent = (f.kind === 'sel' ? [count, bars, anKeyName(key)] : [anKeyName(key), ms[f.a].num + '/' + ms[f.a].den, count]).join(' · ');
    $('an-now-mark').hidden = !(f.kind === 'bars' || (f.kind === 'play' && SCORE.loop));
    $('an-now-pill').hidden = f.kind !== 'play';
    $('an-now-hint').textContent = t(f.kind === 'play' ? 'an_now_follow' : FALL.mode === 'fall' ? 'an_now_hint_fall' : (window as any).matchMedia('(pointer: coarse)').matches ? 'an_now_hint_touch' : 'an_now_hint');
    const segs: any = v.segs.map((s: any = undefined, k: any = undefined) => ({ s, k })).filter(({ s }: any = undefined) => s.end > f.lo + 1e-6 && s.start < f.hi - 1e-6);
    let html: any = '';
    if (!one) {
        const info: any = anKeyInfo(notes);
        if (info.conf !== 'low')
            html += `<p class="an-small">${esc(t('an_now_est', anKeyName(info.best), t('an_conf_' + info.conf)))}</p>`;
    } // a passage's own key, when the notes say so clearly
    if (!segs.length)
        html += `<p class="an-small">${esc(t(!notes.length ? 'an_now_empty' : one ? 'an_now_none' : 'an_harm_none'))}</p>`;
    else if (one)
        html += `<ul class="an-nlist" aria-label="${esc(t('an_prog_label'))}">${segs.map((x: any = undefined) => anNowCard(x, v.implied)).join('')}</ul><p class="an-small an-hsrc">${esc(anHandsSource())}</p>`;
    else
        html += `<div class="an-prog" role="group" aria-label="${esc(t('an_prog_label'))}">${anRowsHTML(segs)}</div>`;
    const fe: any = document.activeElement, k: any = body.contains(fe) && fe.dataset.k;
    body.innerHTML = html;
    SIDE.nowSig = sig;
    AN.playSig = '';
    const coach: any = anCoach(f, segs.map((x: any = undefined) => x.s), notes), cb: any = $('an-coach');
    cb.hidden = !coach;
    cb.innerHTML = coach ? `<span class="coach-k">${esc(coach.h)}</span><span class="coach-t">${esc(coach.text)}</span>` : '';
    if (k) {
        const el: any = body.querySelector('.an-ch[data-k="' + k + '"]');
        (el || $('an-now')).focus({ preventScroll: true });
    }
    const both: any = new Set(notes.map(anHandOf)).size > 1, hb: any = $('an-now-hands').children;
    acts.forEach((b: any = undefined) => { b.disabled = !notes.length; });
    [...hb].forEach((b: any = undefined) => { b.hidden = !both && b.dataset.h !== 'both'; });
    hb[0].textContent = t(both ? 'pr_both' : 'an_practice_b');
    $('an-now-pr-l').hidden = !both;
    anMarkActive();
    anSyncTimeline(fallTime(), false);
    anNowAnnounce(f, head, segs);
}
// Spoken once, a moment after the user picks bars or a chord; never while playing, so playback makes no announcements.
function anNowAnnounce(f: any = undefined, head: any = undefined, segs: any = undefined): any {
    clearTimeout(SIDE.liveT);
    if (SCORE.playing || f.kind === 'play' || f.kind === 'cursor' || !anSideVisible('now'))
        return;
    const s: any = segs.length ? segs[0].s : null, key: any = s && anKeyAt(s.start), rn: any = s && anRoman(key, s);
    const txt: any = head + (s ? ': ' + [anChordLabel(s, key), rn, anFunctionOf(key, s, rn)].join(', ') + (segs.length > 1 ? ' …' : '') : '');
    SIDE.liveT = setTimeout(() => { $('an-now-live').textContent = txt; }, 900);
}
// Practice: what Start will play, the A–B range and whether the passage fits Read & Play.
function anRenderPractice(): any {
    if (!AN.notes.length)
        return;
    const f: any = anFocus(false), ms: any = anMeasures(), sel: any = !!f && f.kind !== 'cursor', ab: any = PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A;
    const at: any = (beat: any = undefined) => { let i: any = 0; for (let j: any = 0; j < ms.length; j++) {
        if (ms[j].start <= beat + 1e-6)
            i = j;
        else
            break;
    } return i; };
    const range: any = (a: any = undefined, b: any = undefined) => a === b ? t('an_bar1', ms[a].number) : t('an_bars', ms[a].number, ms[b].number), Range: any = (a: any = undefined, b: any = undefined) => a === b ? t('st_bar', ms[a].number) : t('an_h_bars', ms[a].number, ms[b].number);
    const abBars: any = ab ? [at(scoreBeatAt(PRAC.A)), at(scoreBeatAt(PRAC.B) - 1e-4)] : null;
    $('an-pt-scope').textContent = sel ? (f.kind === 'sel' ? t('an_sel_h') + ' · ' + range(f.a, f.b) : Range(f.a, f.b)) : ab ? t('pt_scope_ab', range(...abBars)) : t('pt_scope_all');
    $('an-pt-sub').textContent = t(sel ? 'pt_sub_loop' : ab ? 'pt_sub_ab' : 'pt_sub_all');
    $('pt-abv').textContent = ab ? t('pt_ab_v', range(...abBars)) : t('pt_ab_none');
    const ns: any = anScopeNotes(), sig: any = [AN.version, lang, ns.length, AN.index.get(ns[0]), AN.index.get(ns[ns.length - 1])].join('|');
    if (SIDE.ptSig !== sig) {
        SIDE.ptSig = sig;
        const chk: any = anPracticeCheck(ns);
        $('an-practice').disabled = !chk.ok;
        $('an-practice-note').textContent = chk.ok ? t('an_practice_hint') : chk.msg;
    }
}
// Start in the Practice tab: the selection (or A–B) loops with the practice settings; otherwise the piece plays from the cursor.
function anPracticeStart(): any {
    if (SCORE.playing) {
        scoreStop();
        return;
    }
    if (AN.selected.size || (PRAC.A != null && PRAC.B != null && PRAC.B > PRAC.A))
        scoreLoopStart();
    else
        scorePlay(false);
}
function anRevealPieceRow(smooth: any = true): any {
    const ws: any = $('an-ws');
    if (ws.hidden || !anSideVisible('piece'))
        return;
    const row: any = ws.querySelector('.an-prog-row.is-sel');
    if (row && !anInView(row, ws)) {
        const r: any = row.getBoundingClientRect(), p: any = ws.getBoundingClientRect();
        ws.scrollTo({ top: ws.scrollTop + (r.top - p.top) - p.height * .25, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
    }
}
function anRenderWorkspace(v: any = undefined): any {
    const ws: any = $('an-ws'), esc: any = xmlEsc, k: any = v.key, main: any = v.mainKey;
    const focused: any = ws.contains(document.activeElement) ? document.activeElement : null, refocus: any = focused && (focused.dataset.k != null ? '[data-k="' + focused.dataset.k + '"]' : focused.dataset.motif != null ? '[data-motif="' + focused.dataset.motif + '"]' : null);
    // key
    const origin: any = anOriginText();
    const differs: any = (main.root !== k.best.root || main.minor !== k.best.minor) && k.conf !== 'low';
    let html: any = `<p class="an-scope">${esc(t('an_scope_all', v.ns.length))}</p>
  <div class="an-grid"><section class="an-facts" aria-labelledby="an-h-key">
  <h3 id="an-h-key">${esc(t('an_key_h'))}</h3><p class="an-keybig">${esc(anKeyName(main))}</p>
  <p class="an-small">${esc(t('an_key_used', origin))}</p>
  <p class="an-small">${esc(t('an_est', anKeyName(k.best) + ' — ' + t('an_conf_' + k.conf), anNum(k.best.score, 2)))}</p>
  <p class="an-small">${esc(t('an_alts', k.alts.map((a: any) => anKeyName(a) + ' ' + anNum(a.score, 2)).join(' · ')))}</p>${differs ? `<p class="an-small an-warn">${esc(t('an_key_differs'))}</p>` : ''}</section>`;
    let facts: any = `<section class="an-over" aria-labelledby="an-h-over"><h3 id="an-h-over">${esc(t('an_overview'))}</h3><dl class="an-dl">`;
    const row: any = (dt: any = undefined, dd: any = undefined, sub: any = undefined) => { facts += `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}${sub ? `<small>${esc(sub)}</small>` : ''}</dd></div>`; };
    const metersSet: any = [...new Set(v.ms.map((m: any = undefined) => m.num + '/' + m.den))], unit: any = anBeatUnit(v.ms[0] || { num: 4, den: 4 });
    const tMin: any = Math.min(...v.tempos), tMax: any = Math.max(...v.tempos), changes: any = v.tempos.length - 1;
    row(t('an_f_duration'), anClock(v.seconds), t('an_at_speed'));
    row(t('an_f_meter'), metersSet.join(', '), t('an_beat_unit', t(unit === 1.5 ? 'an_unit_dq' : unit === 2 ? 'an_unit_h' : unit === 0.5 ? 'an_unit_e' : 'an_unit_q')));
    row(t('an_f_tempo'), '♩ = ' + (tMin === tMax ? Math.round(tMin) : Math.round(tMin) + '–' + Math.round(tMax)), !SCORE.tempoFromFile ? t('an_tempo_default') : changes > 0 ? t('an_tempo_changes', changes) : '');
    row(t('an_f_notes'), String(v.ns.length), t('an_pitches', v.pitches.length));
    const lo: any = v.pitches[0], hi: any = v.pitches[v.pitches.length - 1];
    row(t('an_f_range'), spellName(lo, main, true) + ' – ' + spellName(hi, main, true), t('an_semis', hi - lo, anNum((hi - lo) / 12, 1)));
    const npb: any = v.ns.length / v.beats, opb: any = v.onsets / v.beats;
    row(t('an_f_npb'), anNum(npb, 1), t('an_dens_' + (opb < 0.75 ? 1 : opb < 1.25 ? 2 : opb < 2.25 ? 3 : opb < 4.5 ? 4 : 5)));
    row(t('an_f_opb'), anNum(opb, 1));
    row(t('an_f_poly'), t('an_poly', anNum(v.poly.avg, 1), v.poly.max), t('an_tex_' + (v.poly.avg < 1.25 ? 1 : v.poly.avg < 2.25 ? 2 : v.poly.avg < 3.25 ? 3 : 4)));
    const pct: any = (x: any = undefined) => Math.round(100 * x / v.ns.length) + '%';
    if (v.hands === 'hands') {
        const how: any = AN.hands ? (AN.hands.how === 'tracks' ? t('an_hands_tracks') : AN.hands.how === 'piece' ? t('an_from_piece') : t('an_split_at', spellName(AN.hands.split, null, true))) : t('an_staff_hands');
        row(t('an_f_hands'), `${t('an_rh')} ${v.rh} (${pct(v.rh)}) · ${t('an_lh')} ${v.lh} (${pct(v.lh)})`, how);
    }
    else
        row(t('an_f_register'), `${t('an_upper')} ${v.rh} (${pct(v.rh)}) · ${t('an_lower')} ${v.lh} (${pct(v.lh)})`, t('an_split_at', spellName(60, null, true)));
    facts += '</dl></section>';
    html += `<section class="an-harm" aria-labelledby="an-h-harm"><h3 id="an-h-harm">${esc(t('an_harm_h'))}</h3>`;
    // progression summary: consecutive repeats merged
    const seq: any = [];
    v.segs.forEach((s: any = undefined, i: any = undefined) => { const key: any = anKeyAt(s.start), lab: any = anChordLabel(s, key), rn: any = anRoman(key, s), last: any = seq[seq.length - 1]; if (!last || last.lab !== lab)
        seq.push({ lab, rn, i }); });
    if (seq.length) {
        const shown: any = seq.slice(0, 14), more: any = seq.length - shown.length;
        html += `<p class="an-sum">${esc(shown.map((x: any = undefined) => x.lab).join(' → '))}${more ? ' ' + esc(t('an_more', more)) : ''}</p><p class="an-sum-rn">${esc(shown.map((x: any = undefined) => x.rn).join(' – '))}</p>`;
    }
    html += `<p class="an-small">${esc(seq.length ? t(v.implied ? 'an_harm_implied' : 'an_harm_note') : t('an_harm_none'))}</p>`;
    if (v.segs.length) {
        AN.rove = Math.min(AN.rove, v.segs.length - 1);
        html += `<div class="an-prog" role="toolbar" aria-orientation="vertical" aria-label="${esc(t('an_prog_label'))}" aria-describedby="an-prog-hint">${anRowsHTML(v.segs.map((s: any = undefined, i: any = undefined) => ({ s, k: i })), AN.rove)}</div><p class="an-legend" id="an-prog-hint">${esc(t('an_prog_hint'))}</p>`;
    }
    html += `<h3 style="margin-top:18px">${esc(t('an_motifs_h'))}</h3>`;
    if (v.motifs.length)
        html += `<div class="an-chips">${v.motifs.map((m: any = undefined, i: any = undefined) => { const steps: any = m.iv.map((n: any = undefined) => (n > 0 ? '+' : '') + n).join(' '); return `<button type="button" class="an-chip" data-motif="${i}" aria-pressed="false" title="${esc(t('an_motif_title', steps))}"><span>${esc(steps)}</span><small>× ${m.count}</small></button>`; }).join('')}</div>`;
    else
        html += `<p class="an-small">${esc(t('an_motif_none'))}</p>`;
    html += '</section>' + facts + '</div>';
    ws.innerHTML = html;
    AN.playSig = '';
    anSyncTimeline(fallTime(), false);
    if (refocus) {
        const el: any = ws.querySelector(refocus);
        if (el)
            el.focus({ preventScroll: true });
    }
}
// The selection strip under Now: chosen notes (or a chosen chord), with the interval or chord they spell.
function anRenderSelection(): any {
    const box: any = $('an-sel');
    if (!box)
        return;
    const sel: any = [...AN.selected].sort((a: any = undefined, b: any = undefined) => a - b).map((i: any = undefined) => AN.notes[i]).filter(Boolean);
    if (!sel.length || (SCORE.mrange && !AN.active)) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    } // whole bars: the chord cards above say it all
    const key: any = anKeyAt(sel[0].start), pitches: any = [...new Set(sel.map((n: any = undefined) => n.midi))].sort((a: any = undefined, b: any = undefined) => a - b), esc: any = xmlEsc, parts: any = [];
    parts.push(`<span><b>${esc(t('an_sel_h'))}</b> · ${esc(sel.length === 1 ? t('an_note1') : t('an_sel_notes', sel.length))} · ${esc(anBarsLabel(sel))}</span>`);
    parts.push(`<span>${esc(pitches.slice(0, 16).map((m: any = undefined) => spellName(m, key, true)).join(' · '))}${pitches.length > 16 ? ' …' : ''}</span>`);
    const seg: any = AN.active && AN.active.kind === 'chord' && AN.view ? AN.view.segs[AN.active.k] : null;
    if (seg) {
        if (pitches.length === 2)
            parts.push(`<span><b>${esc(t('an_interval'))}:</b> ${esc(anIntervalName(pitches[1] - pitches[0]))}</span>`);
        parts.push(`<span><b>${esc(t('an_chord'))}:</b> ${esc(anChordLabel(seg, key))} · ${esc(anRoman(key, seg))}</span>`);
        const nct: any = anNctText(seg, key);
        if (nct)
            parts.push(`<span><b>${esc(t('an_nct_label'))}:</b> ${esc(nct)}</span>`);
    }
    else if (pitches.length === 2)
        parts.push(`<span><b>${esc(t('an_interval'))}:</b> ${esc(anIntervalName(pitches[1] - pitches[0]))}</span>`);
    else if (pitches.length >= 3) {
        const id: any = identifyChord(pitches);
        parts.push(`<span><b>${esc(t('an_chord'))}:</b> ${esc(id ? spellName(60 + id.rootPc, key) + id.chord.symbol + (id.inversion > 0 ? '/' + spellName(60 + id.bassPc, key) + ' · ' + invName(id.inversion) : '') : t('an_none'))}</span>`);
    }
    box.innerHTML = parts.join('');
    box.hidden = false;
}
function anMarkActive(): any {
    const a: any = AN.active, side: any = $('an-side');
    if (!side)
        return;
    side.querySelectorAll('.an-ch').forEach((b: any = undefined) => b.setAttribute('aria-pressed', a && a.kind === 'chord' && +b.dataset.k === a.k ? 'true' : 'false'));
    side.querySelectorAll('.an-chip[data-motif]').forEach((b: any = undefined) => b.setAttribute('aria-pressed', a && a.kind === 'motif' && +b.dataset.motif === a.k ? 'true' : 'false'));
    const f: any = AN.notes.length ? anFocus(false) : null, on: any = !!f && f.kind !== 'cursor';
    $('an-ws').querySelectorAll('.an-prog-row[data-bar]').forEach((r: any = undefined) => { const i: any = +r.dataset.bar; r.classList.toggle('is-sel', on && i >= f.a && i <= f.b); });
}
/* opening files and examples */
function anStatus(msg: any = undefined, isError: any = undefined): any { const el: any = $('an-msg'); el.textContent = msg || ''; el.classList.toggle('is-error', !!isError); }
function anLoadedText(): any {
    const src: any = AN.source;
    if (!src)
        return '';
    const g: any = '1/' + (AN.recon.grid * 4);
    if (src.kind === 'xml')
        return t('an_loaded_xml');
    if (src.kind === 'example')
        return t('an_loaded_example', g);
    const tracks: any = new Set(src.parsed.notes.map((n: any = undefined) => n.track)).size;
    return t('an_loaded_midi', tracks === 1 ? t('an_track1') : t('an_tracks', tracks), g);
}
function anShowError(k: any = undefined, a: any = undefined): any { AN.error = { k, a }; anStatus(t(k, a), true); if (!SCORE.xml)
    anRenderEmpty(); }
function anSetLoading(on: any = undefined, msg: any = undefined): any { AN.loading = on; if (on) {
    scoreStop();
    AN.error = null;
    anStatus(msg);
} anUpdateControls(); }
function anErrorKey(err: any = undefined, fallback: any = undefined): any { if (!err || !err.code)
    console.error(err); const code: any = err && err.code; return 'an_err_' + (code && STRINGS.en['an_err_' + code] ? code : fallback); }
function anPieceMeta(p: any = undefined): any {
    const n: any = p.keyN || 0, keyPc: any = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n);
    return [p.comp, anKeyName({ root: keyPc, minor: !!p.minor, fifths: n }), p.ts[0] + '/' + p.ts[1]].filter(Boolean).join(' · ');
}
function anRenderEmpty(): any {
    const box: any = $('an-roll');
    box.classList.add('is-empty');
    box.classList.remove('is-loading', 'is-over');
    box.setAttribute('aria-busy', 'false');
    box.hidden = FALL.mode !== 'score' && AN.notes.length > 0;
    const esc: any = xmlEsc, ex: any = AN_EXAMPLES.map((id: any = undefined) => PIECES.find((p: any = undefined) => p.id === id)).filter(Boolean);
    box.innerHTML = `<div class="an-empty"><div class="an-drop" id="an-drop"><p class="an-drop-t" id="an-drop-t">${esc(t('an_drop_t'))}</p><p class="an-drop-s">${esc(t('an_drop_s'))}</p>
  <button type="button" class="btn primary" data-an-open>${esc(t('an_open'))}</button><p class="an-drop-err" role="alert">${esc(AN.error ? t((AN.error as any).k, (AN.error as any).a) : '')}</p></div>
  <div class="an-exlist"><h2>${esc(t('an_examples'))}</h2><ul>${(ex as any[]).map((p: any) => `<li><button type="button" class="an-ex" data-piece="${p.id}"><span class="an-ex-t">${esc(srPieceTitle(p))}</span><span class="an-ex-m">${esc(anPieceMeta(p))}</span></button></li>`).join('')}</ul></div></div>`;
    anUpdateControls();
}
function anFillExamples(): any {
    const sel: any = $('an-example'), cur: any = AN.source && AN.source.kind === 'example' ? AN.source.id : '';
    sel.innerHTML = `<option value="">${xmlEsc(t('an_example_pick'))}</option>` + AN_EXAMPLES.map((id: any = undefined) => PIECES.find((p: any = undefined) => p.id === id)).filter(Boolean).map((p: any = undefined) => `<option value="${p.id}">${xmlEsc(srPieceTitle(p))}</option>`).join('');
    sel.value = cur;
}
function anReconUI(): any {
    const src: any = AN.source, on: any = !!src && src.kind !== 'xml';
    $('an-recon-btn').hidden = !on;
    if (!on) {
        anReconOpen(false);
        return;
    }
    const opt: any = (v: any = undefined, l: any = undefined) => `<option value="${v}">${xmlEsc(l)}</option>`;
    $('an-hands').innerHTML = opt('auto', t('an_hands_auto')) + opt('tracks', t('an_hands_tracks')) + [59, 60, 64].map((m: any = undefined) => opt(String(m), t('an_hands_split', noteName(m, false)))).join('');
    $('an-hands').value = AN.recon.hands;
    $('an-grid').value = String(AN.recon.grid);
    const keys: any = (minor: any = undefined) => [...Array(12).keys()].map((r: any = undefined) => { const f: any = keyFifths(r, minor); return opt(f + ':' + (minor ? 1 : 0), anKeyName({ root: r, minor, fifths: f })); }).join('');
    $('an-keysel').innerHTML = opt('auto', t('an_key_auto')) + `<optgroup label="${xmlEsc(t('an_keys_major'))}">${keys(false)}</optgroup><optgroup label="${xmlEsc(t('an_keys_minor'))}">${keys(true)}</optgroup>`;
    $('an-keysel').value = AN.recon.key;
    const h: any = AN.hands, k: any = AN.keyMap[0], parts: any = [];
    if (h)
        parts.push(h.how === 'tracks' ? t('an_rn_hands_tracks', h.groups) : h.how === 'piece' ? t('an_rn_hands_piece') : t(h.how === 'fallback' ? 'an_rn_hands_fallback' : h.how === 'one' ? 'an_rn_hands_one' : 'an_rn_hands_split', noteName(h.split, false)));
    if (k)
        parts.push(t('an_rn_key', anKeyName(k), anOriginText()));
    $('an-recon-note').textContent = parts.join(' ');
}
function anIndex(): any { AN.index = new Map(AN.notes.map((n: any = undefined, i: any = undefined) => [n, i])); AN.version++; AN.cache.clear(); AN.wsSig = ''; }
function anReset(): any {
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
    $('an-name').textContent = '';
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
async function anMxlPreflight(buf: any = undefined) {
    const u: any = new Uint8Array(buf), N: any = u.length, CAP: any = AN_MAX_XML_CHARS, bad: any = () => anError('mxl');
    let zero: any = 0;
    const fits: any = (i: any = undefined, n: any = undefined) => i >= 0 && n >= 0 && zero + i + n <= N;
    const int: any = (i: any = undefined, n: any = undefined) => { if (!fits(i, n))
        throw bad(); let v: any = 0; for (let k: any = n - 1; k >= 0; k--)
        v = (v << 8) + u[zero + i + k]; return v; };
    const int8: any = (i: any = undefined) => { const lo: any = int(i, 4); if (int(i + 4, 4))
        throw bad(); return lo; }; // JSZip drops the high half of 64-bit fields
    const sig: any = (i: any = undefined, c: any = undefined, d: any = undefined) => fits(i, 4) && u[zero + i] === 80 && u[zero + i + 1] === 75 && u[zero + i + 2] === c && u[zero + i + 3] === d;
    const last: any = (c: any = undefined, d: any = undefined) => { for (let r: any = N - 4; r >= 0; r--)
        if (u[r] === 80 && u[r + 1] === 75 && u[r + 2] === c && u[r + 3] === d)
            return r - zero; return -1; };
    const eocd: any = last(5, 6);
    if (eocd < 0)
        throw bad();
    const recs16: any = [int(eocd + 4, 2), int(eocd + 6, 2), int(eocd + 8, 2), int(eocd + 10, 2)];
    let cdSize: any = int(eocd + 12, 4), cdOff: any = int(eocd + 16, 4), expected: any = 0;
    if (!fits(eocd + 22, int(eocd + 20, 2)))
        throw bad();
    if (recs16.includes(65535) || cdSize === -1 || cdOff === -1) {
        const loc: any = last(6, 7);
        if (loc < 0 || int(loc + 16, 4) > 1)
            throw bad();
        let z: any = int8(loc + 8);
        if (!fits(z, 4))
            throw bad();
        if (!sig(z, 6, 6)) {
            z = last(6, 6);
            if (z < 0)
                throw bad();
        }
        const size: any = int8(z + 4);
        if (size < 0 || size > 44)
            throw bad(); // JSZip cannot read zip64 extensible data
        cdSize = int8(z + 40);
        cdOff = int8(z + 48);
        expected = 32 + size;
    }
    if (cdSize < 0 || cdOff < 0)
        throw bad();
    const extra: any = eocd - (cdOff + cdSize + expected);
    if (extra < 0)
        throw bad();
    if (extra > 0)
        zero = extra; // bytes prepended to the archive shift every offset
    const ents: any = [];
    let p: any = cdOff;
    if (!fits(p, 0))
        throw bad();
    for (;;) {
        if (!fits(p, 4))
            throw bad();
        if (!sig(p, 1, 2))
            break;
        const flag: any = int(p + 8, 2), method: any = int(p + 10, 2), nl: any = int(p + 28, 2), xl: any = int(p + 30, 2), cl: any = int(p + 32, 2);
        let C: any = int(p + 20, 4), U: any = int(p + 24, 4), off: any = int(p + 42, 4), i: any = p + 46 + nl, z64: any = null;
        if (flag & 1 || !fits(i, 0))
            throw bad();
        const xend: any = i + xl;
        while (i + 4 < xend) {
            const id: any = int(i, 2), l: any = int(i + 2, 2);
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
            const r8: any = () => { if (z64.i + 8 > z64.end)
                throw bad(); const v: any = int8(z64.i); z64.i += 8; return v; };
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
        ents.push({ method, C, U, off });
    }
    if (!ents.length)
        throw bad();
    for (const e of ents) {
        if (!sig(e.off, 3, 4) || e.C < 0 || e.U < 0 || (e.method !== 0 && e.method !== 8))
            throw bad();
        const nl: any = int(e.off + 26, 2), start: any = e.off + 30 + nl + int(e.off + 28, 2);
        if (!fits(e.off + 30, nl) || !fits(start, e.C))
            throw bad();
        e.data = u.subarray(zero + start, zero + start + e.C);
    }
    const TOTAL_CAP: any = 4 * CAP;
    let declared: any = 0, possible: any = 0;
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
    const countAll: any = possible > TOTAL_CAP;
    let left: any = TOTAL_CAP;
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
        const n: any = await anInflatedSize(e.data, e.U);
        if (n === null)
            throw anError('mxlbig'); // without a stream, this archive cannot be proven safe before JSZip inflates it
        if (n !== e.U)
            throw bad();
        left -= n;
    }
}
// Inflates raw-deflate bytes as a stream, counting and discarding the output; stops as soon as it passes `limit`.
// Resolves to the byte count (limit+something when over), or null when this browser has no raw-deflate stream.
let anInflatedSize: any = async function anInflatedSize(bytes: any = undefined, limit: any = undefined) {
    let ds: any;
    try {
        ds = new DecompressionStream('deflate-raw');
    }
    catch (_: any) {
        return null;
    }
    const w: any = ds.writable.getWriter(), r: any = ds.readable.getReader();
    let n: any = 0, stop: any = false;
    (async () => { for (let i: any = 0; i < bytes.length && !stop; i += 4096)
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
    catch (_: any) {
        stop = true;
    } // corrupt data or junk after the end: the count so far decides
    return n;
};
// MusicXML distances are tenths of a staff space; OSMD distances are staff spaces.
// Keep physical page/staff sizing when supplied, with bounded fallbacks for incomplete or malformed layout hints.
function scoreXmlLayout(doc: any = undefined): any {
    const root: any = doc.documentElement, defaults: any = root.querySelector(':scope > defaults');
    if (!defaults)
        return null;
    const number: any = (el: any = undefined, selector: any = undefined, min: any = undefined, max: any = undefined) => { const node: any = el && el.querySelector(selector), value: any = node && parseFloat(node.textContent); return Number.isFinite(value) && value >= min && value <= max ? value : null; };
    const mm: any = number(defaults, 'scaling > millimeters', .1, 100), tenths: any = number(defaults, 'scaling > tenths', 1, 1000), unit: any = mm && tenths ? mm / tenths : null;
    const base: any = unit && unit * 96 / 25.4 >= .3 && unit * 96 / 25.4 <= 1.5 ? unit * 96 / 25.4 : SC_BASE;
    const pw: any = number(defaults, 'page-layout > page-width', 100, 10000), ph: any = number(defaults, 'page-layout > page-height', 100, 20000);
    const width: any = unit && pw ? pw * unit : 210, height: any = unit && ph ? ph * unit : 297;
    const pageWidth: any = width >= 50 && width <= 600 ? width : 210, pageHeight: any = height >= 50 && height <= 1200 ? height : 297;
    const margins: any = defaults.querySelector('page-margins[type="both"],page-margins[type="odd"]') || defaults.querySelector('page-margins'), out: any = { base, width: pageWidth * 96 / 25.4, pageWidth, pageHeight };
    for (const side of ['Left', 'Right', 'Top', 'Bottom']) {
        const value: any = number(margins, side.toLowerCase() + '-margin', 0, 400);
        if (value != null && value < (side === 'Left' || side === 'Right' ? pw : ph) / 3)
            out[side.toLowerCase()] = value / 10;
    }
    for (const kind of ['title', 'subtitle', 'composer']) {
        const credit: any = [...root.querySelectorAll(':scope > credit')].find((c: any = undefined) => c.querySelector('credit-type')?.textContent.trim() === kind && (c.getAttribute('page') || '1') === '1');
        const words: any = credit && [...credit.querySelectorAll('credit-words')], size: any = words && words[0] && parseFloat(words[0].getAttribute('font-size'));
        if (Number.isFinite(size) && size >= 6 && size <= 48)
            out[kind + 'Size'] = size;
        if (kind === 'title' && words) {
            let style: any = 'normal', weight: any = 'normal';
            out.titleRuns = words.map((w: any = undefined) => { if (['normal', 'italic'].includes(w.getAttribute('font-style')))
                style = w.getAttribute('font-style'); if (['normal', 'bold'].includes(w.getAttribute('font-weight')))
                weight = w.getAttribute('font-weight'); return { text: w.textContent, style, weight }; });
        }
    }
    // These rules are global minima, not a command to repeat the first system's (often unusually large) spacing.
    const minimum: any = (selector: any = undefined, max: any = undefined) => { const values: any = [...root.querySelectorAll(selector)].map((n: any = undefined) => Number(n.textContent)).filter((v: any = undefined) => Number.isFinite(v) && v >= 10 && v <= max); return values.length ? Math.min(...values) / 10 : null; };
    out.staffGap = minimum('part > measure > print > staff-layout > staff-distance', 200);
    out.systemGap = minimum('part > measure > print > system-layout > system-distance', 400);
    return out;
}
async function anReadXml(file: any = undefined, title: any = undefined) {
    let xml: any;
    if (/\.mxl$/i.test(file.name)) {
        const buf: any = await file.arrayBuffer();
        await anMxlPreflight(buf);
        await loadOsmd();
        try {
            xml = await mxlToXml(buf);
        }
        catch (err: any) {
            console.error(err);
            throw anError('mxl');
        }
        if (xml.length > AN_MAX_XML_CHARS)
            throw anError('mxlbig');
    }
    else
        xml = await file.text();
    const doc: any = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'score-partwise' || doc.querySelector('script'))
        throw anError('xml');
    const layout: any = scoreXmlLayout(doc), clean: any = anXmlTidy(doc, title);
    xml = new XMLSerializer().serializeToString(doc);
    const r: any = scoreXmlNotes(doc);
    if (!r.notes.length)
        throw anError('nonotes');
    if (r.notes.length > AN_MAX_NOTES)
        throw anError('notes');
    return { kind: 'xml', title: clean || title, label: file.name, xml, layout, ...r };
}
// MuseScore exports read cleanly in the engraver: real title and composer in the header (not the file name),
// no editorial footnotes over the first staff, SMuFL note glyphs readable in web fonts, no generic "Instr. P1"
// label and "Ped. … *" marks instead of pedal lines that collide with the left hand's fingering.
const AN_SMUFL_NOTES: any = { '\uE1D2': '\uD834\uDD5D', '\uECA2': '\uD834\uDD5D', '\uE1D3': '\uD834\uDD5E', '\uECA3': '\uD834\uDD5E', '\uE1D5': '\u2669', '\uECA5': '\u2669',
    '\uE1D4': '\uD834\uDD5E', '\uECA4': '\uD834\uDD5E', '\uE1D6': '\u2669', '\uECA6': '\u2669',
    '\uE1D7': '\u266A', '\uECA7': '\u266A', '\uE1D8': '\u266A', '\uECA8': '\u266A', '\uE1D9': '\u266C', '\uECA9': '\u266C', '\uE1DA': '\u266C', '\uECAA': '\u266C', '\uE1E7': '.', '\uECB7': '.', '\uE520': 'p', '\uE522': 'f' };
// Some exports leave an open last ending before the next forward repeat. Do not let it span the next section.
// Explicit stop/discontinue pairs always win, including multi-measure endings crossing a repeat boundary.
function scoreXmlEndings(doc: any = undefined): any {
    doc.querySelectorAll('score-partwise > part').forEach((part: any = undefined) => {
        const endings: any = [...part.querySelectorAll('barline > ending')], open: any = new Map(), unclosed: any = new Set();
        endings.forEach((e: any = undefined) => {
            const key: any = e.getAttribute('number') || '1';
            if (e.getAttribute('type') === 'start') {
                open.set(key, e);
                unclosed.add(e);
            }
            else if (open.has(key)) {
                unclosed.delete(open.get(key));
                open.delete(key);
            }
        });
        open.clear();
        const measures: any = [...part.children].filter((e: any = undefined) => e.localName === 'measure');
        measures.forEach((m: any = undefined, i: any = undefined) => {
            if (i && m.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')) {
                open.forEach((e: any = undefined, key: any = undefined) => {
                    const prev: any = measures[i - 1];
                    let bar: any = prev.querySelector(':scope > barline[location="right"], :scope > barline:not([location])');
                    if (!bar) {
                        bar = doc.createElementNS(part.namespaceURI, 'barline');
                        bar.setAttribute('location', 'right');
                        prev.appendChild(bar);
                    }
                    const stop: any = doc.createElementNS(part.namespaceURI, 'ending');
                    stop.setAttribute('number', key);
                    stop.setAttribute('type', 'discontinue');
                    bar.insertBefore(stop, bar.querySelector('repeat'));
                });
                open.clear();
            }
            m.querySelectorAll(':scope > barline > ending').forEach((e: any = undefined) => { if (unclosed.has(e))
                open.set(e.getAttribute('number') || '1', e); });
        });
    });
}
function anXmlTidy(doc: any = undefined, fallback: any = undefined): any {
    const root: any = doc.documentElement, kids: any = (el: any = undefined) => [...el.children], one: any = (el: any = undefined, name: any = undefined) => kids(el).find((c: any = undefined) => c.localName === name);
    const text: any = (el: any = undefined) => (el && el.textContent || '').replace(/\s+/g, ' ').trim(), same: any = (a: any = undefined, b: any = undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
    // 1. Note glyphs in tempo and credit text; "Lento ( = 60 bpm)" gains its missing quarter note.
    //    A text split over several <words> ("Lento (", glyph, " = 60 bpm)") is one line in MuseScore, not a stack.
    doc.querySelectorAll('direction').forEach((dir: any = undefined) => {
        const dts: any = kids(dir).filter((c: any = undefined) => c.localName === 'direction-type');
        if (dts.length < 2 || !dts.every((dt: any = undefined) => dt.children.length && kids(dt).every((c: any = undefined) => c.localName === 'words')))
            return;
        const ws: any = dts.flatMap((dt: any = undefined) => kids(dt)), first: any = ws[0];
        first.textContent = ws.map((w: any = undefined) => w.textContent).reduce((t: any = undefined, u: any = undefined) => t + (/[^\s(\uE000-\uF8FF\u2669\u266A\u266C]$/.test(t) && /^[\p{L}\d]/u.test(u) ? ' ' : '') + u);
        dts.slice(1).forEach((dt: any = undefined) => dt.remove());
        kids(dts[0]).slice(1).forEach((w: any = undefined) => w.remove());
    });
    doc.querySelectorAll('words,credit-words,rehearsal').forEach((w: any = undefined) => {
        let t: any = w.textContent, u: any = t.replace(/[\uE1D2-\uE1E7\uECA2-\uECB7\uE520\uE522]/g, (c: any = undefined) => AN_SMUFL_NOTES[c] ?? '');
        u = u.replace(/\(\s*=\s*(\d)/g, '(\u2669 = $1');
        if (/^\s*=\s*\d/.test(u)) {
            const prev: any = w.closest('direction-type')?.previousElementSibling, pt: any = prev?.querySelector('words')?.textContent || '';
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
    const credits: any = kids(root).filter((c: any = undefined) => c.localName === 'credit'), ctype: any = (c: any = undefined) => text(one(c, 'credit-type')).toLowerCase(), cwords: any = (c: any = undefined) => [...c.querySelectorAll('credit-words')].map(text).filter(Boolean).join(' ');
    const workEl: any = one(root, 'work'), workTitle: any = workEl && one(workEl, 'work-title'), mvt: any = one(root, 'movement-title');
    let title: any = text(workTitle) || text(mvt);
    if (!title) {
        const typed: any = credits.find((c: any = undefined) => ctype(c) === 'title');
        if (typed)
            title = cwords(typed);
    }
    if (!title) {
        let best: any = null, size: any = -1, y: any = -1;
        credits.filter((c: any = undefined) => (c.getAttribute('page') || '1') === '1' && !ctype(c)).forEach((c: any = undefined) => {
            const w: any = c.querySelector('credit-words');
            if (!w)
                return;
            const t: any = text(w);
            if (!t || t.length > 80)
                return;
            const fs: any = parseFloat(w.getAttribute('font-size')) || 0, dy: any = parseFloat(w.getAttribute('default-y')) || 0;
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
    const ident: any = one(root, 'identification'), creator: any = ident && [...ident.children].find((c: any = undefined) => c.localName === 'creator' && c.getAttribute('type') === 'composer');
    let composer: any = text(creator), composerFromSubtitle: any = false;
    // Identification often flattens a printed two-line composer credit. Prefer its line structure when the text agrees.
    const composerCredit: any = credits.find((c: any = undefined) => ctype(c) === 'composer'), printedComposer: any = composerCredit && [...composerCredit.querySelectorAll('credit-words')].map((w: any = undefined) => w.textContent.trim()).filter(Boolean).join('\n');
    if (printedComposer && (!composer || printedComposer.replace(/\s/g, '').toLowerCase() === composer.replace(/\s/g, '').toLowerCase()))
        composer = printedComposer;
    if (!composer) {
        const typed: any = credits.find((c: any = undefined) => ctype(c) === 'composer');
        if (typed)
            composer = cwords(typed);
    }
    if (!composer) {
        const sub: any = credits.find((c: any = undefined) => ctype(c) === 'subtitle');
        if (sub && /\b(m[uú]si(c|k|que|ca)|music|by|von|de|di|composed|compos)/i.test(cwords(sub))) {
            composer = cwords(sub);
            composerFromSubtitle = true;
        }
    }
    const before: any = (names: any = undefined) => kids(root).find((c: any = undefined) => names.includes(c.localName)) || null;
    let work: any = workEl;
    if (!work) {
        work = doc.createElement('work');
        root.insertBefore(work, root.firstElementChild);
    }
    let wt: any = one(work, 'work-title');
    if (!wt) {
        wt = doc.createElement('work-title');
        work.insertBefore(wt, one(work, 'opus') || null);
    }
    wt.textContent = title;
    if (mvt && (same(text(mvt), title) || !text(mvt)))
        mvt.remove(); // a repeated movement title would print as a subtitle
    if (composer) {
        let id: any = one(root, 'identification');
        if (!id) {
            id = doc.createElement('identification');
            root.insertBefore(id, before(['defaults', 'credit', 'part-list']));
        }
        let cr: any = [...id.children].find((c: any = undefined) => c.localName === 'creator' && c.getAttribute('type') === 'composer');
        if (!cr) {
            cr = doc.createElement('creator');
            cr.setAttribute('type', 'composer');
            id.insertBefore(cr, id.firstElementChild);
        }
        cr.textContent = composer;
    }
    // 3. Credits the header already shows, and long editorial notes, leave the page; so do long words over the staves.
    const editorial: any = (t: any = undefined) => t.length >= 90 || /(^|\s)(edi[cç][aã]o|edici[oó]n|edition|correc[cç]|correction|nota(s)? d[aoe]|editor'?s note|note de l'[ée]diteur)/i.test(t);
    //    Version, arrangement and transcription notes ("Versão revista…", "arr. de…") go too when they read as a
    //    footnote: a sentence rather than a label, or set low on the page / far under the bass staff, where they
    //    would push the "Ped. … *" marks down.
    const versionNote: any = /(^|(?:\s|\(|\[))(vers[aã]o|versi[oó]n|version|vers\.|arr\.|arranj|arranged by|arrangement|transcr|adapt\.|adapta[cç]|adapted|revis[aã]o|revisi[oó]n|revised|revision)/i;
    const yOf: any = (el: any = undefined) => { for (const a of ['default-y', 'relative-y']) {
        const v: any = parseFloat(el && el.getAttribute(a));
        if (!isNaN(v))
            return v;
    } return NaN; };
    const footnote: any = (t: any = undefined, low: any = undefined) => versionNote.test(t) && (t.length >= 24 || low);
    credits.forEach((c: any = undefined) => {
        const ty: any = ctype(c), t: any = cwords(c), raw: any = [...c.querySelectorAll('credit-words')].map((w: any = undefined) => w.textContent).join('\n'), cy: any = yOf(c.querySelector('credit-words'));
        if (ty === 'title' || (ty !== 'composer' && (same(t, title) || same(t, composer))) || (composerFromSubtitle && ty === 'subtitle') || editorial(t) || footnote(t, cy < 200) || raw.split('\n').filter((s: any = undefined) => s.trim()).length >= 3)
            c.remove();
    });
    doc.querySelectorAll('direction > direction-type > words').forEach((w: any = undefined) => {
        const t: any = text(w), y: any = yOf(w);
        if (!t || !(t.length >= 60 || editorial(t) || footnote(t, y <= -80) || (t.length >= 20 && y <= -90) || w.textContent.split('\n').filter((s: any = undefined) => s.trim()).length >= 3))
            return;
        const dt: any = w.parentElement, dir: any = dt.parentElement;
        w.remove();
        if (dt.children.length)
            return;
        if ([...dir.children].some((c: any = undefined) => c !== dt && c.localName === 'direction-type'))
            dt.remove();
        else if (dir.querySelector(':scope > sound'))
            dt.appendChild(doc.createElement('words'));
        else
            dir.remove();
    });
    // 4. Chord symbols sit above the upper staff: a <harmony> tied to the left hand would print between the staves,
    //    on top of the dynamics and hairpins.
    doc.querySelectorAll('harmony > staff').forEach((st: any = undefined) => { if ((parseInt(text(st)) || 1) > 1)
        st.textContent = '1'; });
    // 5. A lone piano part, or a generic label, needs no instrument name at the left of the system.
    const parts: any = [...root.querySelectorAll('part-list > score-part')], generic: any = /^(p\s*\d*|instr\.?\s*p?\s*\d*|piano(forte)?|pian|pianoforte|klavier|grand piano|acoustic grand piano)$/i;
    parts.forEach((p: any = undefined) => {
        const pn: any = one(p, 'part-name'), pa: any = one(p, 'part-abbreviation');
        if (pn && (parts.length === 1 || !text(pn) || generic.test(text(pn)))) {
            pn.setAttribute('print-object', 'no');
            if (pa)
                pa.setAttribute('print-object', 'no');
        }
    });
    // 6. Pedal marks as "Ped. … *": OSMD draws line="yes" as a bracket under the bass staff, where fingering lives.
    //    It drops type="change" on text pedals, so a change becomes a release and a new press at the same moment.
    doc.querySelectorAll('direction-type > pedal').forEach((p: any = undefined) => {
        const ty: any = p.getAttribute('type');
        if (ty === 'continue')
            return;
        p.setAttribute('line', 'no');
        p.setAttribute('sign', 'yes');
        if (ty === 'change') {
            p.setAttribute('type', 'stop');
            const dt: any = p.parentElement, dir: any = dt.parentElement, again: any = dir.cloneNode(false);
            [...dir.children].forEach((c: any = undefined) => { if (c === dt)
                again.appendChild(c.cloneNode(true));
            else if (['offset', 'voice', 'staff'].includes(c.localName))
                again.appendChild(c.cloneNode(true)); });
            again.querySelector('pedal').setAttribute('type', 'start');
            dir.after(again);
        }
    });
    scoreXmlEndings(doc);
    return title;
}
// The single entry point for the file input and drag & drop.
async function anOpenFile(file: any = undefined) {
    if (!file)
        return;
    const name: any = file.name || '';
    if (!/\.(mid|midi|xml|musicxml|mxl)$/i.test(name))
        return anShowError('an_err_type', name);
    if (file.size > AN_MAX_BYTES)
        return anShowError('an_err_size', name);
    if (!file.size)
        return anShowError('an_err_empty', name);
    const token: any = ++AN.loadToken, title: any = name.replace(/\.[^.]+$/, ''), kind: any = /\.mxl$/i.test(name) ? 'mxl' : /\.(xml|musicxml)$/i.test(name) ? 'xml' : 'midi';
    anSetLoading(true, t('an_loading', name));
    let src: any;
    try {
        src = kind === 'midi' ? { kind: 'midi', title, label: name, parsed: anParse(await file.arrayBuffer()) } : await anReadXml(file, title);
    }
    catch (err: any) {
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
async function anLoadExample(id: any = undefined) {
    const p: any = PIECES.find((x: any = undefined) => x.id === id);
    if (!p)
        return;
    const token: any = ++AN.loadToken;
    anSetLoading(true, t('an_loading', srPieceTitle(p)));
    await anCommit({ kind: 'example', id, title: srPieceTitle(p), label: srPieceTitle(p), comp: p.comp, parsed: anPieceToParsed(p) }, token);
}
async function anCommit(src: any = undefined, token: any = undefined) {
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
        catch (err: any) {
            anSetLoading(false);
            anReset();
            anShowError(anErrorKey(err, 'midi'));
            return;
        }
    }
    anIndex();
    anReconUI();
    anFillExamples();
    $('an-name').textContent = src.label || src.title;
    let ok: any = false;
    try {
        ok = await scoreRender();
    }
    catch (err: any) {
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
async function anReconChange() {
    if (!AN.source || AN.source.kind === 'xml')
        return;
    const prev: any = { ...AN.recon };
    AN.recon = { hands: $('an-hands').value, grid: +$('an-grid').value, key: $('an-keysel').value };
    scoreStop();
    try {
        anRebuild();
    }
    catch (err: any) {
        if (!err.code)
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
    const token: any = ++AN.loadToken;
    try {
        await scoreRender();
    }
    catch (err: any) {
        console.error(err);
        if (token === AN.loadToken) {
            anReset();
            anShowError('an_err_render');
        }
    }
}
// Language or notation changed: localise generated controls, and re-title a built-in example.
function anLocalize(): any {
    anFillExamples();
    anReconUI();
    const src: any = AN.source;
    // Examples are re-titled and MIDI scores get the localized part name ("Piano"/"Pian"): both need a rebuild.
    if (src && src.kind !== 'xml') {
        const p: any = src.kind === 'example' ? PIECES.find((x: any = undefined) => x.id === src.id) : null, title: any = p ? srPieceTitle(p) : src.title, part: any = '<part-name>' + xmlEsc(t('sc_part')) + '</part-name>';
        if (title !== src.title || (SCORE.xml && !SCORE.xml.includes(part))) {
            if (p) {
                src.title = src.label = title;
                $('an-name').textContent = title;
            }
            anRebuild();
            anIndex();
            scoreRender().catch((err: any = undefined) => { console.error(err); anReset(); anShowError('an_err_render'); });
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
function anSelectionChanged(): any {
    AN.active = null;
    const R: any = SCORE.mrange;
    if (R && R.sig !== [...AN.selected].sort((a: any = undefined, b: any = undefined) => a - b).join())
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
function anSelectNotes(list: any = undefined, active: any = undefined, bars: any = undefined): any {
    AN.selected = new Set(list.map((n: any = undefined) => AN.index.get(n)).filter((i: any = undefined) => i != null));
    AN.active = active || null;
    SCORE.mrange = bars && AN.selected.size ? { anchor: bars.a, a: bars.a, b: bars.b, sig: [...AN.selected].sort((x: any = undefined, y: any = undefined) => x - y).join() } : null;
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
    const g: any = AN.selected.size && (SCORE.heads.get(Math.min(...AN.selected)) || [])[0];
    if (g && FALL.mode === 'score')
        anKeepVisible(g, true);
}
function anSelectChord(k: any = undefined): any {
    const seg: any = AN.view && AN.view.segs[k];
    if (!seg)
        return;
    const g: any = SCORE.geo, mi: any = g ? g.measures.findIndex((m: any = undefined) => m && Math.abs(m.b0 - seg.measure.start) < 1e-3) : -1;
    anSelectNotes(seg.notes, { kind: 'chord', k }, mi >= 0 ? { a: mi, b: mi } : null);
}
function anClearSelection(): any { if (!AN.selected.size && !SCORE.mrange)
    return false; AN.selected.clear(); SCORE.mrange = null; anSelectionChanged(); return true; }
function anDraw(): any { if (!SCORE.xml)
    anRenderEmpty();
else if (SCORE.stale)
    scoreLayout();
else
    scorePaint(); if (FALL.mode === 'fall')
    fallDraw(); anUpdateControls(); anLayoutVars(); }
// Hover (or focus) explains what is under the pointer: a note with its chord, or any other marking on the page.
function anHover(e: any = undefined): any {
    const g: any = e.target.closest && e.target.closest('#an-roll [data-i]');
    if (!g) {
        const sym: any = scoreSymAt(e);
        if (!sym) {
            $('an-hover').textContent = '';
            scoreTip(null);
            return;
        }
        const txt: any = scoreSymText(sym);
        $('an-hover').textContent = txt.line;
        scoreTip(sym, txt);
        return;
    }
    scoreTip(null);
    const n: any = AN.notes[+g.dataset.i];
    if (!n)
        return;
    const key: any = anKeyAt(n.start), group: any = AN.notes.filter((a: any = undefined) => a.start <= n.start + 0.001 && a.end > n.start + 0.001), chord: any = identifyChord(group.map((a: any = undefined) => a.midi)), seg: any = anSegAt(n.start), nct: any = seg && seg.nct && seg.nct.find((x: any = undefined) => x.note === n);
    $('an-hover').textContent = spellName(n.midi, key, true) + ' · ' + t('an_bar') + ' ' + anMeasureAt(n.start).number + ' · ' + group.map((a: any = undefined) => spellName(a.midi, key, true)).join(' ') + ' · ' + (chord ? spellName(60 + chord.rootPc, key) + chord.chord.symbol + (chord.inversion > 0 ? '/' + spellName(60 + chord.bassPc, key) : '') : t('an_none')) + (nct ? ' · ' + t('an_nct_' + nct.type) : '');
}
// Click a notehead to select it (Shift/Ctrl adds), click empty space in a bar to select the bar (Shift extends the range),
// drag for a marquee; a click outside every bar clears the selection.
function scorePointer(e: any = undefined): any {
    const box: any = $('an-roll');
    if (e.button !== 0 || !SCORE.xml || !box.querySelector('svg') || e.target.closest('.an-empty'))
        return;
    if (e.target === box && (e.offsetX >= box.clientWidth || e.offsetY >= box.clientHeight))
        return; // scrollbar
    const target: any = e.target.closest('[data-i]'), x: any = e.clientX, y: any = e.clientY, add: any = e.shiftKey || e.ctrlKey || e.metaKey;
    e.preventDefault();
    let marquee: any = null;
    const move: any = (ev: any = undefined) => { if (!marquee && Math.hypot(ev.clientX - x, ev.clientY - y) < 5)
        return; if (!marquee) {
        marquee = (document as any).createElement('div');
        marquee.className = 'an-marquee';
        document.body.appendChild(marquee);
    } Object.assign(marquee.style, { left: Math.min(x, ev.clientX) + 'px', top: Math.min(y, ev.clientY) + 'px', width: Math.abs(ev.clientX - x) + 'px', height: Math.abs(ev.clientY - y) + 'px' }); };
    const done: any = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', done); if (marquee)
        marquee.remove(); };
    const finish: any = (ev: any = undefined) => {
        done();
        if (Math.hypot(ev.clientX - x, ev.clientY - y) < 5) {
            if (target) {
                const i: any = +target.dataset.i;
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
            const mi: any = scoreMeasureAt(x, y);
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
        SCORE.heads.forEach((list: any = undefined, i: any = undefined) => list.forEach((g: any = undefined) => { const r: any = g.getBoundingClientRect(), cx: any = r.x + r.width / 2, cy: any = r.y + r.height / 2; if (cx >= Math.min(x, ev.clientX) && cx <= Math.max(x, ev.clientX) && cy >= Math.min(y, ev.clientY) && cy <= Math.max(y, ev.clientY))
            AN.selected.add(i); }));
        anSelectionChanged();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', done);
}
function anRove(g: any = undefined): any { $('an-roll').querySelectorAll('[data-i][tabindex="0"]').forEach((x: any = undefined) => x.setAttribute('tabindex', '-1')); g.setAttribute('tabindex', '0'); }
/* practice transfer: an ephemeral Read & Play piece (one line or chord stack per hand, bars kept, rhythm on a 16th grid) */
function anToReadPiece(ns: any = undefined): any {
    if (!ns.length)
        return { error: 'none' };
    const notes: any = ns.slice().sort((a: any = undefined, b: any = undefined) => a.start - b.start || a.midi - b.midi), meas: any = anMeasures(), A: any = notes[0].start;
    const m0: any = anMeasureAt(A), m1: any = anMeasureAt(notes[notes.length - 1].start), i0: any = meas.indexOf(m0), i1: any = meas.indexOf(m1);
    if (i1 - i0 + 1 > AN_PRACTICE_BARS || notes.length > 600)
        return { error: 'long' };
    let ts: any = [m0.num, m0.den];
    if (![4, 8].includes(m0.den)) {
        const q: any = m0.num * 4 / m0.den;
        ts = Number.isInteger(q) ? [q, 4] : [Math.round(q * 2), 8];
    }
    const cap: any = ts[1] === 8 ? ts[0] * 0.5 : ts[0], grid: any = SCORE.midiGrid === 8 ? 8 : 4, q: any = (v: any = undefined) => Math.round(v * grid) / grid;
    const origin: any = q(A), offset: any = q(origin - m0.start), pickup: any = offset > 1e-6 && offset < cap - 1e-6 ? q(cap - offset) : 0, total: any = q(m1.end - origin);
    if (total <= 0)
        return { error: 'none' };
    const key: any = anKeyAt(A), spellSR: any = (m: any = undefined) => { const s: any = spellMidi(m, key.fifths, key.minor); return s.oct < 0 || s.oct > 9 ? null : SR_LET[s.li] + (s.acc > 0 ? '#' : s.acc < 0 ? 'b' : '') + s.oct; };
    const VAL: any = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125].filter((v: any = undefined) => v * grid >= 1 - 1e-9), RVAL: any = [4, 2, 1, 0.5, 0.25, 0.125].filter((v: any = undefined) => v * grid >= 1 - 1e-9);
    const nextBar: any = (p: any = undefined) => { let b: any = pickup > 0 ? pickup : cap; while (b <= p + 1e-6)
        b += cap; return b; };
    const rests: any = (list: any = undefined, from: any = undefined, to: any = undefined) => { let p: any = from; while (p < to - 1e-6) {
        const len: any = Math.min(to, nextBar(p)) - p, v: any = RVAL.find((x: any = undefined) => x <= len + 1e-6) || 1 / grid;
        list.push(['R', v]);
        p = q(p + v);
    } };
    let bad: any = false;
    const build: any = (hand: any = undefined) => {
        const own: any = notes.filter((n: any = undefined) => anHandOf(n) === hand);
        if (!own.length)
            return null;
        const on: any = new Map();
        own.forEach((n: any = undefined) => { const s: any = q(n.start - origin); if (s < 0 || s >= total - 1e-6)
            return; const k: any = s.toFixed(4); if (!on.has(k))
            on.set(k, { s, ms: new Set(), end: 0 }); const o: any = on.get(k); o.ms.add(n.midi); o.end = Math.max(o.end, Math.min(total, Math.max(s + 1 / grid, q(n.end - origin)))); });
        const list: any = [], os: any = [...on.values()].sort((a: any = undefined, b: any = undefined) => a.s - b.s);
        let p: any = 0;
        os.forEach((o: any = undefined, i: any = undefined) => {
            if (o.s > p + 1e-6)
                rests(list, p, o.s);
            const len: any = Math.min(o.end, i + 1 < os.length ? os[i + 1].s : total, nextBar(o.s)) - o.s, v: any = VAL.find((x: any = undefined) => x <= len + 1e-6) || 1 / grid;
            const ps: any = [...o.ms].sort((a: any = undefined, b: any = undefined) => a - b).map(spellSR);
            if (ps.some((x: any = undefined) => !x))
                bad = true;
            list.push([ps.length === 1 ? ps[0] : ps, v]);
            p = q(o.s + v);
        });
        if (p < total - 1e-6)
            rests(list, p, total);
        return list;
    };
    const rh: any = build('rh'), lh: any = build('lh');
    if (bad)
        return { error: 'range' };
    if (!rh && !lh)
        return { error: 'none' };
    const src: any = AN.source, titles: any = { en: src.kind === 'example' ? PIECES.find((p: any = undefined) => p.id === src.id).t.en : src.title, ro: src.kind === 'example' ? PIECES.find((p: any = undefined) => p.id === src.id).t.ro : src.title, [lang]: src.kind === 'example' ? srPieceTitle(PIECES.find((p: any = undefined) => p.id === src.id)) : src.title };
    const bars: any = { en: anBarsLabel(notes, 'en'), ro: anBarsLabel(notes, 'ro'), [lang]: anBarsLabel(notes, lang) }, tempoAt: any = SCORE.tempoList.filter((e: any = undefined) => e.beat <= A + 1e-6).pop() || SCORE.tempoList[0];
    const piece: any = { id: 'excerpt', ephemeral: true, t: { en: tl('en', 'rd_excerpt', titles.en, bars.en), ro: tl('ro', 'rd_excerpt', titles.ro, bars.ro), [lang]: tl(lang, 'rd_excerpt', titles[lang] || titles.en, bars[lang] || bars.en) }, comp: '', level: 0, keyN: key.fifths, minor: key.minor, ts,
        bpm: Math.max(40, Math.min(160, Math.round(tempoAt.bpm))), from: { title: titles[lang] || titles.en, bars: bars[lang] || bars.en } };
    if (pickup)
        piece.pickup = pickup;
    if (rh)
        piece.rh = rh;
    if (lh)
        piece.lh = lh;
    return { piece };
}
function anPracticeCheck(ns: any = undefined): any {
    const r: any = anToReadPiece(ns);
    if (r.piece)
        return { ok: true, piece: r.piece };
    return { ok: false, msg: r.error === 'long' ? t('an_practice_long', AN_PRACTICE_BARS) : r.error === 'range' ? t('an_practice_range') : '' };
}
function anPractice(): any {
    const chk: any = anPracticeCheck(anScopeNotes());
    if (!chk.ok) {
        const note: any = $('an-practice-note');
        if (note)
            note.textContent = chk.msg;
        return;
    }
    scoreStop();
    SR.excerpt = chk.piece;
    SR.modeSel = 'learn';
    SR.hands = 'both';
    [...$('rd-mode').children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x.dataset.v === 'learn' ? 'true' : 'false'));
    show('read');
    fillPieces();
    srSelectPiece(SR.excerpt.id);
    const v: any = $('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_excerpt_ready');
    $('rd-go').focus({ preventScroll: true }); // bring the staff and Start above the keyboard dock
    window.scrollTo({ top: Math.max(0, $('rd-meta').getBoundingClientRect().top + window.scrollY - 80), behavior: 'auto' });
}
/* falling notes: a dark stage with lanes, bar lines and an integrated keyboard; notes coloured by hand */
const FALL: any = { mode: 'score', raf: 0, position: 0, origin: 0, audioStart: 0, factor: 1, notes: [], hits: [], zoom: 1, geo: null, particles: [], flashes: [], lastT: null, lastFrame: 0, resume: null };
const FALL_SEC: any = 3.2, FALL_FONT: any = '"Hanken Grotesk",system-ui,sans-serif', FALL_SEL: any = '#6aa8ff', FALL_BLACK: any = new Set([1, 3, 6, 8, 10]), FALL_NUDGE: any = { 1: -.12, 3: .12, 6: -.16, 8: 0, 10: .16 };
// Right hand: warm coral from the app's accent family; left hand: cool teal. lit = sounding.
const FALL_COL: any = { rh: { a: '#ffb38f', b: '#e65f3c', lit: ['#ffdccb', '#ff8257'], rgb: '255,128,92', key: ['#ffd0b8', '#f2774e'], ink: 'rgba(72,20,6,.8)' },
    lh: { a: '#8de5f2', b: '#2a96d2', lit: ['#cdf7fd', '#46c2ef'], rgb: '72,196,240', key: ['#c0f1f9', '#3caee1'], ink: 'rgba(4,36,58,.8)' } };
// Colour palettes for the two hands (RH first). "classic" is the familiar green/blue; "contrast" stays distinct for most colour-vision types.
const FALL_PAL: any = { etude: FALL_COL,
    classic: { rh: { a: '#9be38f', b: '#3fa83a', lit: ['#d6f8cf', '#68d35e'], rgb: '110,220,96', key: ['#c9f2c0', '#55c04a'], ink: 'rgba(8,48,6,.82)' },
        lh: { a: '#9ab8ff', b: '#3a6fe0', lit: ['#d5e2ff', '#6d97ff'], rgb: '110,150,255', key: ['#c5d6ff', '#5a85f0'], ink: 'rgba(6,22,70,.85)' } },
    contrast: { rh: { a: '#ffe27a', b: '#f2b400', lit: ['#fff4c4', '#ffcf33'], rgb: '255,205,40', key: ['#ffeaa0', '#f5c020'], ink: 'rgba(66,42,0,.85)' },
        lh: { a: '#c9a2ff', b: '#7f3ff0', lit: ['#e8d8ff', '#a173ff'], rgb: '160,110,255', key: ['#dcc5ff', '#9460f5'], ink: 'rgba(40,6,86,.85)' } } };
const FALL_YOU: any = ['#ffe9a8', '#f5bd3c'];
function anHasFinger(): any { if (FALL.fingerSrc !== AN.notes) {
    FALL.fingerSrc = AN.notes;
    FALL.hasFinger = AN.notes.some((n: any = undefined) => n.finger);
} return FALL.hasFinger; }
function fallData(): any { if (FALL.source !== AN.notes || FALL.tempoSource !== SCORE.tempoList) {
    FALL.source = AN.notes;
    FALL.tempoSource = SCORE.tempoList;
    FALL.notes = AN.notes.map((n: any = undefined, i: any = undefined) => ({ n, i, start: scoreSeconds(n.start), finish: scoreSeconds(n.end), sound: scoreSeconds(n.soundEnd ?? n.end) }));
    FALL.end = FALL.notes.length ? Math.max(...FALL.notes.map((n: any = undefined) => n.finish)) : 0;
} return FALL.notes; }
function fallEnd(): any { fallData(); return FALL.end; }
function fallTime(): any {
    const R: any = SCORE.run;
    if (!SCORE.playing || !actx || !R)
        return FALL.position;
    const { s, t } = pracRaw(R, actx.currentTime), B: any = PRAC.bar;
    let x: any = Math.min(t, s.t1);
    if (B && B.seg === s && x > B.t)
        x = B.t;
    return x;
}
function fallMode(mode: any = undefined): any {
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
function fallReset(): any { cancelAnimationFrame(FALL.raf); FALL.raf = 0; FALL.position = 0; FALL.particles = []; FALL.flashes = []; FALL.lastT = null; FALL.geo = null; fallDraw(); scoreCursorUpdate(false); anStatusPos(); }
// Keyboard range: the piece ±2 semitones, whole octaves from C to C, responsive minimum width (4 octaves desktop, 3 tablet, 2 mobile), never beyond the 88 keys.
function fallRange(W: any = undefined): any {
    const ns: any = AN.notes;
    if (!ns.length)
        return (!W || W >= 900) ? [48, 96] : W >= 600 ? [48, 84] : [48, 72];
    let lo: any = Infinity, hi: any = -Infinity;
    ns.forEach((n: any = undefined) => { if (n.midi < lo)
        lo = n.midi; if (n.midi > hi)
        hi = n.midi; });
    const mid: any = (lo + hi) / 2;
    lo = Math.max(21, lo - 2);
    hi = Math.min(108, hi + 2);
    lo -= pc(lo);
    hi += (12 - pc(hi)) % 12;
    const minSpan: any = (!W || W >= 900) ? 48 : W >= 600 ? 36 : 24;
    while (hi - lo < minSpan) {
        if ((mid - lo <= hi - mid && lo >= 24) || hi + 12 > 108)
            lo -= 12;
        else
            hi += 12;
    }
    return [Math.max(21, lo), hi];
}
function fallKeys(lo: any = undefined, hi: any = undefined, W: any = undefined): any {
    const whites: any = [], keys: any = new Map();
    for (let m: any = lo; m <= hi; m++)
        if (!FALL_BLACK.has(pc(m)))
            whites.push(m);
    const kw: any = W / whites.length, bw: any = kw * .6;
    whites.forEach((m: any = undefined, i: any = undefined) => keys.set(m, { x: i * kw, w: kw, black: false }));
    for (let m: any = lo; m <= hi; m++)
        if (FALL_BLACK.has(pc(m))) {
            const l: any = keys.get(m - 1);
            if (l)
                keys.set(m, { x: l.x + kw - bw / 2 + FALL_NUDGE[pc(m)] * bw, w: bw, black: true });
        }
    return { lo, hi, W, keys, whites, kw, bw };
}
function fallRR(ctx: any = undefined, x: any = undefined, y: any = undefined, w: any = undefined, h: any = undefined, r: any = undefined): any { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fallKeyPath(ctx: any = undefined, x: any = undefined, y: any = undefined, w: any = undefined, h: any = undefined, r: any = undefined): any { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.closePath(); }
// Crisp at any devicePixelRatio; animates only while playing (or while a burst fades), otherwise redraws on demand.
function fallName(n: any = undefined): any {
    const mode: any = PRAC.labels;
    if (mode === 'none')
        return '';
    if (mode === 'finger' && anHasFinger())
        return n.finger ? String(n.finger) : '';
    const k: any = anKeyAt(n.start), sp: any = spellMidi(n.midi, k.fifths, k.minor), sys: any = mode === 'solfege' ? 'solfege' : mode === 'letter' ? 'letter' : notation;
    return spelledName(sys, sp.li, sp.acc);
}
function fallDraw(): any {
    cancelAnimationFrame(FALL.raf);
    FALL.raf = 0;
    if (FALL.mode !== 'fall' || !AN.notes.length)
        return;
    const canvas: any = $('fall-canvas'), W: any = canvas.clientWidth, H: any = canvas.clientHeight;
    if (!W || !H)
        return;
    const ctx: any = canvas.getContext('2d'), dpr: any = window.devicePixelRatio || 1, bw: any = Math.round(W * dpr), bh: any = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [lo, hi] = PRAC.range === 'full' ? [21, 108] : fallRange(W);
    let G: any = FALL.geo;
    if (!G || G.lo !== lo || G.hi !== hi || G.W !== W)
        G = FALL.geo = fallKeys(lo, hi, W);
    const kh: any = Math.round(Math.min(H * .24, Math.max(56, G.kw * 4.4))), hitY: any = H - kh, span: any = FALL_SEC / FALL.zoom, pps: any = hitY / span;
    G.hitY = hitY;
    G.kh = kh;
    const time: any = fallTime(), rm: any = reduceMotion(), fx: any = PRAC.fx && !rm, P: any = FALL_PAL[PRAC.pal] || FALL_COL, solo: any = PRAC.hands !== 'both';
    const ms: any = performance.now(), dt: any = FALL.lastFrame ? Math.min(.05, (ms - FALL.lastFrame) / 1000) : 0;
    FALL.lastFrame = ms;
    // stage: deep gradient, lanes for the pitches this piece uses, brighter guides at every C, bar lines with numbered pills, faint beats
    const bg: any = ctx.createLinearGradient(0, 0, 0, hitY);
    bg.addColorStop(0, '#050811');
    bg.addColorStop(.6, '#0a1120');
    bg.addColorStop(1, '#131c31');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, hitY);
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    G.keys.forEach((k: any = undefined) => { if (k.black)
        ctx.fillRect(k.x, 0, k.w, hitY); });
    if (FALL.laneSrc !== AN.notes) {
        FALL.laneSrc = AN.notes;
        FALL.lanes = new Set(AN.notes.map((n: any = undefined) => n.midi));
    }
    ctx.fillStyle = 'rgba(140,170,255,.035)';
    FALL.lanes.forEach((m: any = undefined) => { const k: any = G.keys.get(m); if (k)
        ctx.fillRect(k.x, 0, k.w, hitY); });
    ctx.fillStyle = 'rgba(150,175,235,.17)';
    G.keys.forEach((k: any = undefined, m: any = undefined) => { if (!k.black && pc(m) === 0)
        ctx.fillRect(Math.round(k.x), 0, 1, hitY); });
    const bars: any = [];
    for (const m of anMeasures()) {
        const s0: any = scoreSeconds(m.start);
        if (s0 > time + span)
            break;
        if (scoreSeconds(m.end) < time)
            continue;
        const u: any = anBeatUnit(m);
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let b: any = m.start + u; b < m.end - 1e-6; b += u) {
            const y: any = hitY - (scoreSeconds(b) - time) * pps;
            if (y > 0 && y < hitY)
                ctx.fillRect(0, Math.round(y), W, 1);
        }
        const y: any = Math.round(hitY - (s0 - time) * pps);
        if (y >= 0 && y <= hitY) {
            ctx.fillStyle = 'rgba(200,212,240,.22)';
            ctx.fillRect(0, y, W, 1);
            bars.push([m.number, y]);
        }
    }
    // A–B loop: shade outside the loop range
    const L: any = SCORE.loop || (PRAC.A != null && PRAC.B != null ? { a: PRAC.A, b: PRAC.B } : null);
    if (L) {
        const ya: any = hitY - (L.a - time) * pps, yb: any = hitY - (L.b - time) * pps;
        ctx.fillStyle = 'rgba(106,168,255,.08)';
        const top: any = Math.max(0, yb), bot: any = Math.min(hitY, ya);
        if (bot > top)
            ctx.fillRect(0, top, W, bot - top);
        ctx.fillStyle = 'rgba(143,184,255,.7)';
        [ya, yb].forEach((y: any = undefined) => { if (y >= 0 && y <= hitY)
            ctx.fillRect(0, Math.round(y) - 1, W, 2); });
    }
    // notes: rounded bars with a gap above each, so repeated notes stay apart; the practised hand is bright, the other dimmed
    const sel: any = SCORE.playing && SCORE.sel ? AN.selected : null, active: any = new Map(), soon: any = new Map();
    let from: any = FALL.lastT;
    if (from != null && from > time)
        from = SCORE.loop ? SCORE.loop.a - 1e-3 : null; // the loop wrapped around
    FALL.hits = [];
    for (const d of fallData()) {
        if (d.start > time + span)
            break;
        if (d.finish <= time)
            continue;
        const k: any = G.keys.get(d.n.midi);
        if (!k)
            continue;
        const hand: any = anHandOf(d.n), c: any = P[hand], mine: any = !solo || hand === PRAC.hands, on: any = time >= d.start && (!sel || sel.has(d.i));
        if (on) {
            active.set(d.n.midi, hand);
            if (from != null && d.start > from && fx)
                fallBurst(k, hitY, c);
        }
        else if (mine && d.start - time < .6 * span / FALL_SEC * FALL.zoom && !soon.has(d.n.midi))
            soon.set(d.n.midi, { k, c, a: 1 - (d.start - time) / (.6) });
        const yb: any = Math.min(hitY, hitY - (d.start - time) * pps), yt0: any = hitY - (d.finish - time) * pps, gap: any = yb - yt0 > 10 ? 3 : 1, yt: any = yt0 + gap;
        if (yb - yt < 1)
            continue;
        const pad: any = k.black ? Math.max(1, k.w * .06) : Math.max(1.5, k.w * .1), x: any = k.x + pad, w: any = k.w - 2 * pad, h: any = yb - yt, r: any = Math.min(6, w * .32, h / 2);
        ctx.save();
        ctx.globalAlpha = (mine ? 1 : .3) * (.78 + .22 * Math.min(1, (d.n.vel || 96) / 110));
        const g: any = ctx.createLinearGradient(0, yt, 0, yb);
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
        const res: any = PRAC.res.get(d.i);
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
        const nm: any = mine ? fallName(d.n) : '';
        if (nm && w >= 11 && h >= 16) {
            const fs: any = Math.round(Math.min(13, Math.max(9, w * .46)));
            ctx.font = '800 ' + fs + 'px ' + FALL_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            const ty: any = yb - Math.max(5, Math.min(8, h * .2));
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
        const tw: any = Math.max(18, ctx.measureText(num).width + 10), py: any = Math.max(9, Math.min(hitY - 9, y - 9));
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
        soon.forEach(({ k, c, a }: any = undefined) => { const lg: any = ctx.createLinearGradient(0, hitY - 70, 0, hitY); lg.addColorStop(0, 'rgba(' + c.rgb + ',0)'); lg.addColorStop(1, 'rgba(' + c.rgb + ',' + (.28 * Math.max(0, Math.min(1, a))).toFixed(3) + ')'); ctx.fillStyle = lg; ctx.fillRect(k.x, hitY - 70, k.w, 70); });
    // hit line: soft glow band, note-on bursts, the keyboard, then the bright line on top
    const hg: any = ctx.createLinearGradient(0, hitY - 34, 0, hitY);
    hg.addColorStop(0, 'rgba(120,160,255,0)');
    hg.addColorStop(1, 'rgba(150,185,255,.24)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hitY - 34, W, 34);
    if (FALL.flashes.length || FALL.particles.length)
        fallParticles(ctx, dt);
    const B: any = PRAC.bar && SCORE.run && time >= PRAC.bar.t - 1e-6 ? PRAC.bar : null, need: any = B ? [...B.need].filter((m: any = undefined) => !B.got.has(m)) : [];
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
    let msg: any = '';
    if (need.length)
        msg = t('pr_waiting', need.slice().sort((a: any = undefined, b: any = undefined) => a - b).map((m: any = undefined) => spellName(m, anKeyAt(B.group[0].n.start), true)).join(' '));
    else if (!SCORE.playing && time <= .01)
        msg = t('sc_press_start');
    if (msg) {
        ctx.font = '700 14px ' + FALL_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw: any = ctx.measureText(msg).width + 28, y: any = need.length ? hitY - 30 : hitY * .42;
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
function fallBurst(k: any = undefined, y: any = undefined, c: any = undefined): any {
    const x: any = k.x + k.w / 2;
    FALL.flashes.push({ x, y, w: k.w, rgb: c.rgb, life: .3, max: .3 });
    for (let i: any = 0; i < 8; i++) {
        const a: any = -Math.PI / 2 + (Math.random() - .5) * 1.6, v: any = 70 + Math.random() * 130;
        FALL.particles.push({ x: x + (Math.random() - .5) * k.w * .6, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: .8 + Math.random() * 1.7, life: .35 + Math.random() * .3, max: .65, col: c.lit[0] });
    }
    if (FALL.particles.length > 300)
        FALL.particles.splice(0, FALL.particles.length - 300);
}
function fallParticles(ctx: any = undefined, dt: any = undefined): any {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    FALL.flashes = FALL.flashes.filter((f: any = undefined) => (f.life -= dt) > 0);
    for (const f of FALL.flashes) {
        const a: any = f.life / f.max, rad: any = f.w * .8 + 22 * (1 - a), g: any = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        g.addColorStop(0, 'rgba(' + f.rgb + ',' + (.7 * a).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + f.rgb + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(f.x - rad, f.y - rad, rad * 2, rad);
    }
    FALL.particles = FALL.particles.filter((p: any = undefined) => (p.life -= dt) > 0);
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
function fallKeyboard(ctx: any = undefined, G: any = undefined, y: any = undefined, kh: any = undefined, W: any = undefined, active: any = undefined, P: any = undefined, need: any = undefined, ms: any = undefined): any {
    P = P || FALL_COL;
    const mineHeld: any = new Set(held.keys ? held.keys() : held), pulse: any = .55 + .45 * Math.sin((ms || 0) / 170), wait: any = new Set(need || []);
    const tint: any = (m: any = undefined) => { const h: any = active.get(m); if (h)
        return P[h].key; if (mineHeld.has(m))
        return FALL_YOU; return null; };
    ctx.fillStyle = '#110e0c';
    ctx.fillRect(0, y, W, kh);
    const r: any = Math.min(4, G.kw * .12), lab: any = labelMode !== 'none', dark: any = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const m of G.whites) {
        const k: any = G.keys.get(m), c: any = tint(m), dip: any = c ? 3.5 : 0, x: any = k.x + .75, w: any = k.w - 1.5, h: any = kh - 1 - dip, g: any = ctx.createLinearGradient(0, y + dip, 0, y + dip + h);
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
        const lip: any = ctx.createLinearGradient(0, y + dip + h - 7, 0, y + dip + h);
        lip.addColorStop(0, 'rgba(0,0,0,0)');
        lip.addColorStop(1, dark ? 'rgba(85,75,65,.35)' : 'rgba(180,165,140,.35)');
        ctx.fillStyle = lip;
        ctx.fillRect(x + 1, y + dip + h - 7, w - 2, 7);
        if (lab && (pc(m) === 0 || labelMode === 'all') && k.w >= 14) {
            const nm: any = noteName(m, false);
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
        const c: any = tint(m), dip: any = c ? 4 : 0, bh: any = Math.round(kh * .62) - dip, x: any = k.x, w: any = k.w, br: any = Math.min(3, w * .15);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3.5;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        fallKeyPath(ctx, x - 1, y + dip, w + 2, bh, br);
        ctx.fill();
        ctx.restore();
        const g: any = ctx.createLinearGradient(0, y + dip, 0, y + dip + bh);
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
    const felt: any = ctx.createLinearGradient(0, y, 0, y + 3.5);
    felt.addColorStop(0, '#621919');
    felt.addColorStop(.5, '#8d2525');
    felt.addColorStop(1, '#461212');
    ctx.fillStyle = felt;
    ctx.fillRect(0, y, W, 3.5);
    const feltShadow: any = ctx.createLinearGradient(0, y + 3.5, 0, y + 7.5);
    feltShadow.addColorStop(0, 'rgba(0,0,0,.45)');
    feltShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = feltShadow;
    ctx.fillRect(0, y + 3.5, W, 4);
}
// Timeline under the stage: clock, bar ticks, loop region, A/B markers, seek slider and the current bar.
function anTlUpdate(time: any = undefined): any {
    const tl: any = $('an-tl');
    if (!tl || tl.hidden || !AN.notes.length)
        return;
    const end: any = fallEnd(), pos: any = Math.max(0, Math.min(end, time != null ? time : fallTime())), seek: any = $('fall-seek'), pct: any = (x: any = undefined) => (end > 0 ? Math.max(0, Math.min(1, x / end)) * 100 : 0).toFixed(3) + '%';
    const mx: any = String(Math.max(.1, end));
    if (seek.max !== mx)
        seek.max = mx;
    if (document.activeElement !== seek || SCORE.playing)
        seek.value = pos;
    seek.style.setProperty('--p', pct(pos));
    seek.setAttribute('aria-valuetext', t('fall_valtext', anClock(pos), anClock(end)));
    const set: any = (id: any = undefined, v: any = undefined) => { const el: any = $(id); if (el.textContent !== v)
        el.textContent = v; };
    set('fall-clock', anClock(pos));
    set('fall-total', anClock(end));
    const ms: any = anMeasures(), m: any = anMeasureAt(scoreBeatAt(pos));
    set('tl-bar', m && ms.length ? t('tl_bar', m.number, ms[ms.length - 1].number) : '');
    if (FALL.tickSrc !== fallData() || FALL.tickTempo !== SCORE.tempoList || FALL.tickEnd !== end) {
        FALL.tickSrc = fallData();
        FALL.tickTempo = SCORE.tempoList;
        FALL.tickEnd = end;
        const step: any = ms.length > 240 ? 8 : ms.length > 120 ? 4 : ms.length > 60 ? 2 : 1, major: any = ms.length > 60 ? Math.max(8, step * 4) : 4;
        $('tl-ticks').innerHTML = ms.map((x: any = undefined, i: any = undefined) => i % step ? '' : `<i${i % major === 0 ? ' class="is-major"' : ''} style="left:${pct(scoreSeconds(x.start))}"></i>`).join('');
    }
    const L: any = SCORE.loop, lp: any = $('tl-loop'), A: any = PRAC.A, B: any = PRAC.B, la: any = L ? L.a : A != null && B != null ? A : null, lb: any = L ? L.b : A != null && B != null ? B : null;
    lp.hidden = la == null;
    if (la != null) {
        lp.style.left = pct(la);
        lp.style.width = (end > 0 ? (lb - la) / end * 100 : 0).toFixed(3) + '%';
    }
    [['tl-a', A], ['tl-b', B]].forEach(([id, v]: any = undefined) => { const el: any = $(id); el.hidden = v == null; if (v != null)
        el.style.left = pct(v); });
}
// Seeking pauses while the slider moves and resumes on release if it was playing.
function fallSeek(): any { const pos: any = +$('fall-seek').value; if (SCORE.playing) {
    FALL.resume = SCORE.loop ? null : { sel: SCORE.sel };
    scoreHalt();
} SCORE.resume = null; FALL.position = pos; scoreIdle(); }
function fallSeekEnd(): any { const r: any = FALL.resume; FALL.resume = null; if (r)
    scorePlay(r.sel, FALL.position); }
function fallHit(e: any = undefined): any { const r: any = e.currentTarget.getBoundingClientRect(), x: any = e.clientX - r.left, y: any = e.clientY - r.top; return FALL.hits.findLast((h: any = undefined) => x >= h.x - 2 && x <= h.x + h.w + 2 && y >= h.y && y <= h.y + h.h); }
// The integrated keyboard is playable by mouse or touch.
function fallKeyAt(e: any = undefined): any {
    const G: any = FALL.geo;
    if (!G || !G.hitY)
        return null;
    const r: any = e.currentTarget.getBoundingClientRect(), x: any = e.clientX - r.left, y: any = e.clientY - r.top;
    if (y < G.hitY)
        return null;
    const bh: any = G.hitY + G.kh * .62;
    if (y <= bh)
        for (const [m, k] of G.keys)
            if (k.black && x >= k.x && x <= k.x + k.w)
                return m;
    for (const m of G.whites) {
        const k: any = G.keys.get(m);
        if (x >= k.x && x < k.x + k.w)
            return m;
    }
    return null;
}
function fallKeyDown(e: any = undefined): any {
    const m: any = fallKeyAt(e);
    if (m == null)
        return;
    e.preventDefault();
    ensureAudio();
    FALL.press = FALL.press || new Map();
    FALL.press.set(e.pointerId, m);
    try {
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    catch (_: any) { }
    handleNoteOn(m, 96, 'fall:' + e.pointerId);
    if (!FALL.raf)
        fallDraw();
}
function fallKeyUp(e: any = undefined): any { const P: any = FALL.press, m: any = P && P.get(e.pointerId); if (m == null)
    return; P.delete(e.pointerId); handleNoteOff(m, 'fall:' + e.pointerId); if (!FALL.raf)
    fallDraw(); }
function fallSelect(e: any = undefined): any {
    if (fallKeyAt(e) != null)
        return;
    const hit: any = fallHit(e), add: any = e.shiftKey || e.ctrlKey || e.metaKey;
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
function fallHover(e: any = undefined): any { e.currentTarget.style.cursor = fallHit(e) || fallKeyAt(e) != null ? 'pointer' : ''; }
/* wiring */
// Score shortcuts, only in this view and never while typing or choosing in a form field:
// Space play/pause, Home go to start, Esc close the settings or clear the selection, + / − zoom.
function anShortcut(e: any = undefined): any {
    if (view0() !== 'analysis' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || inField() || $('drawer').classList.contains('on') || $('helpBox').classList.contains('on'))
        return;
    const k: any = e.key;
    if (k === 'Escape') {
        if (!$('pr-sum').hidden) {
            e.preventDefault();
            pracSumClose();
            return;
        }
        for (const [p, b] of AN_POPS)
            if (!$(p).hidden) {
                e.preventDefault();
                anPop(p, false);
                $(b).focus();
                return;
            }
        if (!$('an-recon').hidden) {
            e.preventDefault();
            anReconOpen(false);
            $('an-recon-btn').focus();
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
        if (e.target.closest && e.target.closest('button,a[href],summary,[role="button"],input,select,textarea'))
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
        if (e.target.closest && e.target.closest('[data-i],.an-ch,input,select'))
            return;
        e.preventDefault();
        scoreSeekBar(k === 'ArrowRight' ? 1 : -1);
        return;
    }
    const K: any = k.length === 1 ? k.toLowerCase() : k;
    if (K === 'l') {
        e.preventDefault();
        $('an-loop').click();
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
        $('pr-countin').checked = PRAC.countIn;
        pracSave();
        return;
    }
    if (k === '1' || k === '2' || k === '3') {
        e.preventDefault();
        pracSet('hands', ['both', 'rh', 'lh'][+k - 1]);
    }
}
// Seek to a time (keeps playing if it was playing) and step bar by bar.
function scoreSeekTo(x: any = undefined): any {
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
function scoreSeekBar(d: any = undefined): any {
    const ms: any = anMeasures();
    if (!ms.length)
        return;
    const now: any = SCORE.playing ? fallTime() : FALL.position, beat: any = scoreBeatAt(now);
    let i: any = ms.findIndex((m: any = undefined) => beat < m.end - 1e-6);
    if (i < 0)
        i = ms.length - 1;
    if (d < 0 && beat - ms[i].start > .5 && !(SCORE.playing && scoreSeconds(beat) - scoreSeconds(ms[i].start) > .6))
        d = 0; // first press goes back to this bar's start
    i = Math.max(0, Math.min(ms.length - 1, i + d));
    scoreSeekTo(scoreSeconds(ms[i].start));
}
// Popovers under the toolbar: one open at a time, placed under their button, closed by Esc or a click outside.
const AN_POPS: any = [['fall-pop', 'fall-opt'], ['an-keys-pop', 'an-keys-btn']];
function anPop(id: any = undefined, open: any = undefined): any {
    const pair: any = AN_POPS.find((x: any = undefined) => x[0] === id), p: any = $(id), b: any = $(pair[1]);
    open = !!open && !b.hidden;
    if (open) {
        AN_POPS.forEach(([q]: any = undefined) => { if (q !== id)
            anPop(q, false); });
        anReconOpen(false);
    }
    p.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && id !== 'an-keys-pop') {
        const host: any = p.offsetParent || p.parentElement, hr: any = host.getBoundingClientRect(), br: any = b.getBoundingClientRect(), w: any = p.offsetWidth;
        p.style.left = Math.max(8, Math.min(hr.width - w - 8, br.left - hr.left + br.width / 2 - w / 2)) + 'px';
        p.style.right = 'auto';
    }
    if (open) {
        const f: any = p.querySelector('input,select,button');
        if (f)
            f.focus({ preventScroll: true });
    }
}
// The score keeps its engraving while the viewport changes size, unless the page no longer fits (or could be wider again).
function anStageFit(): any {
    if (view0() !== 'analysis' || SIDE.drag)
        return;
    if (FALL.mode === 'fall') {
        fallDraw();
        return;
    }
    const box: any = $('an-roll'), sheet: any = box.querySelector('.an-sheet');
    if (!SCORE.engine || !box.clientWidth || !sheet)
        return;
    if (SCORE.layout === 'cont') {
        if (Math.abs(box.clientWidth - SCORE.layoutWidth) > 40)
            scoreLayout();
        return;
    }
    const cs: any = getComputedStyle(box), avail: any = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (Math.abs(sheet.offsetWidth - Math.max(240, Math.round(Math.min(SC_PAGE_W * SCORE.zoom, avail)))) > 2)
        scoreLayout();
}
// The panel's left edge resizes it: drag, or arrow keys on the focused separator (Home / End for the narrowest / widest).
function anSideResizer(): any {
    const h: any = $('an-side-resize'), work: any = $('an-work'), MIN: any = 280, MAX: any = 560;
    const apply: any = (w: any = undefined, save: any = undefined) => { SIDE.w = Math.round(Math.max(MIN, Math.min(MAX, work.clientWidth * .5, w))); work.style.setProperty('--an-side-w', SIDE.w + 'px'); h.setAttribute('aria-valuenow', String(SIDE.w)); if (save) {
        saveAll();
        anStageFit();
    } };
    h.addEventListener('pointerdown', (e: any = undefined) => {
        if (e.button !== 0)
            return;
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        SIDE.drag = true;
        h.classList.add('is-drag');
        const right: any = work.getBoundingClientRect().right, move: any = (ev: any = undefined) => apply(right - ev.clientX, false);
        const up: any = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up); SIDE.drag = false; h.classList.remove('is-drag'); apply(SIDE.w, true); };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
        h.addEventListener('pointercancel', up);
    });
    h.addEventListener('keydown', (e: any = undefined) => {
        const d: any = ({ ArrowLeft: 16, ArrowRight: -16 } as any)[e.key];
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
function anInitControls(): any {
    $('an-file').addEventListener('change', (e: any = undefined) => { const f: any = e.target.files[0]; e.target.value = ''; if (f)
        anOpenFile(f); });
    $('an-roll').addEventListener('click', (e: any = undefined) => { if (e.target.closest('[data-an-open]')) {
        $('an-file').click();
        return;
    } const ex: any = e.target.closest('.an-ex'); if (ex && !ex.disabled)
        anLoadExample(ex.dataset.piece); });
    $('an-example').addEventListener('change', (e: any = undefined) => { if (e.target.value)
        anLoadExample(e.target.value); });
    ['an-hands', 'an-grid', 'an-keysel'].forEach((id: any = undefined) => $(id).addEventListener('change', anReconChange));
    $('an-recon-btn').addEventListener('click', () => anReconOpen($('an-recon').hidden));
    document.addEventListener('pointerdown', (e: any = undefined) => {
        if (!$('an-recon').hidden && !e.target.closest('#an-recon,#an-recon-btn'))
            anReconOpen(false);
        AN_POPS.forEach(([p, b]: any = undefined) => { if (!$(p).hidden && !e.target.closest('#' + p + ',#' + b))
            anPop(p, false); });
    });
    $('an-recon-btn').addEventListener('click', () => AN_POPS.forEach(([p]: any = undefined) => anPop(p, false)));
    AN_POPS.forEach(([p, b]: any = undefined) => $(b).addEventListener('click', () => anPop(p, $(p).hidden)));
    pracLoad();
    const ck: any = { 'pr-countin': 'countIn', 'pr-acc': 'acc', 'pr-hear': 'hear', 'pr-ramp': 'ramp', 'fall-fx': 'fx' };
    Object.entries(ck).forEach(([id, k]: any = undefined) => { $(id).checked = PRAC[k]; $(id).addEventListener('change', (e: any = undefined) => pracSet(k, e.target.checked)); });
    [['fall-labels', 'labels'], ['fall-pal', 'pal'], ['fall-range', 'range']].forEach(([id, k]: any = undefined) => { $(id).value = PRAC[k]; $(id).addEventListener('change', (e: any = undefined) => pracSet(k, e.target.value)); });
    const look: any = $('fall-look'), lookOut: any = () => { $('fall-look-v').textContent = (+look.value).toFixed(1) + ' s'; };
    look.value = String(Math.round(FALL_SEC / FALL.zoom * 5) / 5);
    lookOut();
    look.addEventListener('input', () => { FALL.zoom = FALL_SEC / +look.value; lookOut(); pracSave(); anUpdateControls(); fallDraw(); });
    $('pr-hands').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-h]'); if (b)
        pracSet('hands', b.dataset.h); });
    $('pr-wait').addEventListener('click', () => pracSet('wait', !PRAC.wait));
    $('an-metro').addEventListener('click', () => pracSet('metro', !PRAC.metro));
    $('pr-seta').addEventListener('click', () => pracSetAB('A'));
    $('pr-setb').addEventListener('click', () => pracSetAB('B'));
    $('pr-clrab').addEventListener('click', pracClearAB);
    $('pr-again').addEventListener('click', () => { pracSumClose(); scorePlay(false, 0); });
    $('pr-slower').addEventListener('click', () => { pracSumClose(); const sel: any = $('score-speed'), o: any = [...sel.options].map((x: any = undefined) => +x.value), cur: any = +sel.value, v: any = o.filter((x: any = undefined) => x < cur).pop(); if (v)
        sel.value = String(v); pracHud(); scorePlay(false, 0); });
    $('pr-close').addEventListener('click', pracSumClose);
    $('pr-sum-next').addEventListener('click', (e: any = undefined) => { if (e.target.closest('#pr-next-act') && PRAC.next && PRAC.next.act)
        PRAC.next.act.run(); });
    $('pr-sum').addEventListener('pointerdown', (e: any = undefined) => { if (e.target === e.currentTarget)
        pracSumClose(); });
    $('an-clear').addEventListener('click', anClearSelection);
    $('an-play').addEventListener('click', () => scorePlay(true));
    $('an-loop').addEventListener('click', () => { if (SCORE.loop)
        scoreStop();
    else
        scoreLoopStart(); });
    $('score-play').addEventListener('click', scoreToggle);
    $('score-stop').addEventListener('click', scoreStop);
    $('sc-start').addEventListener('click', scoreHome);
    const speed: any = () => { pracHud(); anUpdateControls(); if (!SCORE.playing)
        return; if (SCORE.loop)
        scoreLoopStart();
    else
        scorePlay(SCORE.sel, fallTime()); };
    $('score-speed').addEventListener('change', speed);
    (document as any).querySelectorAll('[data-score-mode]').forEach((b: any = undefined) => b.addEventListener('click', () => { if (!b.disabled)
        scoreSetView(b.dataset.scoreMode); }));
    $('sc-zoom-out').addEventListener('click', () => scoreZoom(anZoomNow() - 0.1));
    $('sc-zoom-in').addEventListener('click', () => scoreZoom(anZoomNow() + 0.1));
    $('sc-zoom-reset').addEventListener('click', () => scoreZoom(1));
    $('sc-look').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-v]'); if (b && !b.disabled)
        scoreSetLook(b.dataset.v); });
    $('sc-hl').addEventListener('click', () => scoreSetHl(!SCORE.hl));
    $('an-kb').addEventListener('click', () => dockSet(!dockOpen()));
    const seek: any = $('fall-seek');
    seek.addEventListener('input', fallSeek);
    seek.addEventListener('change', fallSeekEnd);
    const fc: any = $('fall-canvas');
    fc.addEventListener('click', fallSelect);
    fc.addEventListener('pointermove', fallHover);
    fc.addEventListener('pointerdown', fallKeyDown);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev: any = undefined) => fc.addEventListener(ev, fallKeyUp));
    const roll: any = $('an-roll');
    roll.addEventListener('pointerdown', scorePointer);
    roll.addEventListener('pointerover', anHover);
    roll.addEventListener('pointerleave', () => { $('an-hover').textContent = ''; scoreTip(null); });
    let hoverRaf: any = 0, hoverEv: any = null;
    roll.addEventListener('pointermove', (e: any = undefined) => { if (e.buttons)
        return; hoverEv = e; if (!hoverRaf)
        hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (hoverEv)
            anHover(hoverEv); }); });
    roll.addEventListener('focusin', anHover);
    roll.addEventListener('keydown', (e: any = undefined) => {
        const g: any = e.target.closest('[data-i]');
        if (!g)
            return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const i: any = +g.dataset.i, add: any = e.shiftKey || e.ctrlKey || e.metaKey;
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
            const d: any = e.key === 'ArrowRight' ? 1 : -1;
            for (let j: any = +g.dataset.i + d; j >= 0 && j < AN.notes.length; j += d) {
                const n: any = (SCORE.heads.get(j) || [])[0];
                if (n) {
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
    const side: any = $('an-side'), ws: any = $('an-ws');
    side.addEventListener('click', (e: any = undefined) => {
        const ch: any = e.target.closest('.an-ch');
        if (ch && AN.view) {
            const k: any = +ch.dataset.k, seg: any = AN.view.segs[k];
            if (ws.contains(ch)) {
                AN.rove = k;
                ws.querySelectorAll('.an-ch').forEach((b: any = undefined) => b.tabIndex = b === ch ? 0 : -1);
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
        const mo: any = e.target.closest('.an-chip[data-motif]');
        if (mo && AN.view) {
            const k: any = +mo.dataset.motif, m: any = AN.view.motifs[k];
            if (m)
                anSelectNotes(m.notes, { kind: 'motif', k });
        }
    });
    ws.addEventListener('keydown', (e: any = undefined) => {
        const ch: any = e.target.closest('.an-ch');
        if (!ch)
            return;
        const all: any = [...ws.querySelectorAll('.an-ch')], i: any = all.indexOf(ch);
        const j: any = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null;
        if (j == null)
            return;
        e.preventDefault();
        const n: any = all[Math.max(0, Math.min(all.length - 1, j))];
        all.forEach((b: any = undefined) => b.tabIndex = b === n ? 0 : -1);
        AN.rove = +n.dataset.k;
        n.focus();
    });
    ['wheel', 'touchmove'].forEach((ev: any = undefined) => ws.addEventListener(ev, () => { SIDE.handScroll = performance.now(); }, { passive: true }));
    ws.addEventListener('keydown', (e: any = undefined) => { if (/^(Page|Arrow|Home|End)/.test(e.key))
        SIDE.handScroll = performance.now(); });
    // tabs: click, or Left/Right/Home/End with automatic activation; the choice is remembered
    $('an-tabs').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('[role="tab"]'); if (b)
        anTab(b.dataset.tab); });
    $('an-tabs').addEventListener('keydown', (e: any = undefined) => {
        const i: any = AN_TABS.indexOf(SIDE.tab), j: any = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? AN_TABS.length - 1 : null;
        if (j == null)
            return;
        e.preventDefault();
        anTab(AN_TABS[(j + AN_TABS.length) % AN_TABS.length], true);
    });
    $('an-side-btn').addEventListener('click', () => { if (anNarrow())
        anSheet(!SIDE.sheet);
    else
        anSideSet(!SIDE.open); });
    $('an-side-close').addEventListener('click', () => { if (anNarrow()) {
        anSheet(false);
        return;
    } anSideSet(false); $('an-side-btn').focus({ preventScroll: true }); });
    $('an-fab').addEventListener('click', () => anSheet(true));
    $('pr-opt').addEventListener('click', () => anOpenTab('practice'));
    $('an-now').addEventListener('focusout', (e: any = undefined) => { if (SIDE.deferred && !$('an-now-body').contains(e.relatedTarget))
        requestAnimationFrame(anRenderNow); });
    // Now: the passage actions
    $('an-now-listen').addEventListener('click', () => { if (anCommitFocus())
        scorePlay(true); });
    $('an-now-loop').addEventListener('click', () => { if (SCORE.loop) {
        scoreStop();
        return;
    } if (anCommitFocus())
        scoreLoopStart(); });
    $('an-now-hands').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-h]'); if (!b || b.disabled)
        return; if (PRAC.hands !== b.dataset.h)
        pracSet('hands', b.dataset.h); if (anCommitFocus())
        scoreLoopStart(); });
    // Practice: the same settings as the toolbar
    $('pt-speed').innerHTML = $('score-speed').innerHTML;
    $('pt-speed').value = $('score-speed').value;
    $('pt-speed').addEventListener('change', (e: any = undefined) => { $('score-speed').value = e.target.value; speed(); });
    $('pt-hands').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-h]'); if (b && !b.disabled)
        pracSet('hands', b.dataset.h); });
    $('pt-wait').addEventListener('change', (e: any = undefined) => pracSet('wait', e.target.checked));
    $('pt-metro').addEventListener('change', (e: any = undefined) => pracSet('metro', e.target.checked));
    $('pt-start').addEventListener('click', anPracticeStart);
    $('an-practice').addEventListener('click', anPractice);
    anSideResizer();
    anTab(SIDE.tab);
    (window as any).matchMedia('(max-width: 999px)').addEventListener('change', () => { SIDE.sheet = false; anSideSync(); anLayoutVars(); });
    // drag & drop: anywhere on the analysis view; the drop zone (or the score) shows the target state
    let depth: any = 0;
    const files: any = (e: any = undefined) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const over: any = (on: any = undefined) => { const drop: any = $('an-drop'), tt: any = $('an-drop-t'); $('an-roll').classList.toggle('is-over', on && !!SCORE.xml); if (drop)
        drop.classList.toggle('is-over', on); if (tt)
        tt.textContent = t(on ? 'an_drop_over' : 'an_drop_t'); };
    window.addEventListener('dragenter', (e: any = undefined) => { if (view0() !== 'analysis' || !files(e))
        return; e.preventDefault(); depth++; over(true); });
    window.addEventListener('dragover', (e: any = undefined) => { if (view0() !== 'analysis' || !files(e))
        return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', (e: any = undefined) => { if (view0() !== 'analysis' || !files(e))
        return; depth = Math.max(0, depth - 1); if (!depth)
        over(false); });
    window.addEventListener('drop', (e: any = undefined) => { if (view0() !== 'analysis' || !files(e))
        return; e.preventDefault(); depth = 0; over(false); const list: any = [...e.dataTransfer.files]; if (list.length !== 1) {
        anShowError('an_err_many');
        return;
    } anOpenFile(list[0]); });
    // Header, toolbar, status bar and dock sizes feed the viewport height; the viewport size drives redraws and re-layout.
    let rq: any = 0;
    const vars: any = () => { cancelAnimationFrame(rq); rq = requestAnimationFrame(anLayoutVars); };
    // border-box: a safe-area inset only changes padding, which a content-box observer would miss
    const ro: any = new ResizeObserver(vars);
    [(document as any).querySelector('header'), $('dock'), $('an-tbwrap'), $('an-status')].forEach((el: any = undefined) => ro.observe(el, { box: 'border-box' }));
    let lastW: any = 0, lastH: any = 0;
    new ResizeObserver((entries: any = undefined) => { const r: any = entries[0].contentRect, w: any = Math.round(r.width), h: any = Math.round(r.height); if (w === lastW && h === lastH)
        return; lastW = w; lastH = h; anStageFit(); }).observe($('an-stage'));
    window.addEventListener('resize', vars);
    window.addEventListener('scroll', anPinToolbarLater, { passive: true });
    const dpr: any = () => (matchMedia as any)('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)').addEventListener('change', () => { if (FALL.mode === 'fall')
        fallDraw(); dpr(); }, { once: true });
    dpr();
    anLayoutVars();
}
/* ---------- PROGRESS ---------- */
function renderProgress(): any {
    const acc: any = data.totalReviews ? Math.round(100 * data.totalCorrect / data.totalReviews) : 0;
    $('prog-empty').hidden = (data.totalReviews || 0) > 0;
    $('progStats').innerHTML =
        statHTML(currentStreak(), t('st_streak')) + statHTML(data.bestStreak || 0, t('st_best')) +
            statHTML(masteredCount() + ' / ' + ITEMS.length, t('st_mastered')) +
            statHTML(data.totalReviews || 0, t('st_reviews')) + statHTML(acc + '%', t('st_acc'));
    // mastery rows + answer accuracy per topic (from each concept's review history)
    const mr: any = $('masteryRows');
    mr.innerHTML = '';
    Object.keys(CATS).forEach((cat: any = undefined) => {
        const items: any = ITEMS.filter((it: any = undefined) => it.cat === cat);
        const score: any = items.reduce((s: any = undefined, it: any = undefined) => s + Math.min(boxOf(it.id), 6), 0);
        const max: any = items.length * 6;
        const pct: any = Math.round(100 * score / max);
        const mastered: any = items.filter((it: any = undefined) => boxOf(it.id) >= 4).length;
        let reps: any = 0, lapses: any = 0;
        items.forEach((it: any = undefined) => { const r: any = data.srs[it.id]; if (r) {
            reps += r.reps || 0;
            lapses += r.lapses || 0;
        } });
        const accLine: any = reps ? t('cat_acc_line', Math.round(100 * Math.max(0, reps - lapses) / reps), reps) : t('cat_acc_none');
        const row: any = (document as any).createElement('div');
        row.className = 'mrow';
        row.innerHTML = '<div class="top"><b>' + catLabel(cat) + '</b><span>' + mastered + '/' + items.length + ' ' + t('mastered_of') + '</span></div><div class="mbar" role="img" aria-label="' + catLabel(cat) + ': ' + pct + '%"><i style="width:' + pct + '%"></i></div><div class="acc">' + accLine + '</div>';
        mr.appendChild(row);
    });
    // weakest concepts → one click to drill that topic
    const weak: any = ITEMS.map((it: any = undefined) => ({ it, r: data.srs[it.id] })).filter((x: any = undefined) => x.r && x.r.reps >= 2 && x.r.lapses > 0).sort((a: any = undefined, b: any = undefined) => (b.r.lapses / b.r.reps) - (a.r.lapses / a.r.reps) || a.r.box - b.r.box).slice(0, 6);
    $('weak-wrap').hidden = !weak.length;
    const wl: any = $('weakList');
    wl.innerHTML = '';
    weak.forEach(({ it, r }: any = undefined) => { const b: any = (document as any).createElement('button'); b.type = 'button'; b.innerHTML = itemLabel(it) + '<small>' + catLabel(it.cat) + ' · ' + t('weak_acc', Math.round(100 * Math.max(0, r.reps - r.lapses) / r.reps), r.reps) + '</small>'; b.addEventListener('click', () => { show('practice'); $('pr-cat').value = it.cat; $('pr-start').focus(); }); wl.appendChild(b); });
    // forecast next 7 days
    const fc: any = $('forecast');
    fc.innerHTML = '';
    const counts: any = [0, 0, 0, 0, 0, 0, 0];
    const tn: any = todayN();
    ITEMS.forEach((it: any = undefined) => { const s: any = data.srs[it.id]; if (s && s.reps > 0) {
        const d: any = Math.max(0, s.due - tn);
        if (d < 7)
            counts[d]++;
    } });
    const maxc: any = Math.max(1, ...counts);
    const loc: any = LOCALE_TAGS[lang] || lang;
    const names: any = counts.map((_: any = undefined, i: any = undefined) => i === 0 ? t('fc_today') : new Date((tn + i) * 86400000).toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }));
    counts.forEach((c: any = undefined, i: any = undefined) => { const day: any = (document as any).createElement('div'); day.className = 'day'; day.innerHTML = '<i style="height:' + (c / maxc * 60 + 3) + 'px" title="' + c + '"></i><span>' + names[i] + '</span><span class="num" style="color:var(--ink)">' + c + '</span>'; fc.appendChild(day); });
    const fcAny: any = counts.some((c: any = undefined) => c > 0);
    fc.hidden = !fcAny;
    $('fc-none').hidden = fcAny;
    // practice heatmap — last 12 weeks
    const hm: any = $('heatmap');
    if (hm) {
        hm.innerHTML = '';
        const h: any = data.history || {};
        const days: any = 84, start: any = tn - days + 1;
        let active: any = 0, sum: any = 0;
        const pad: any = new Date(start * 86400000).getUTCDay(); // day numbers are UTC-based
        for (let i: any = 0; i < pad; i++) {
            const x: any = (document as any).createElement('i');
            x.style.visibility = 'hidden';
            hm.appendChild(x);
        }
        for (let d: any = start; d <= tn; d++) {
            const c: any = h[d] || 0;
            const x: any = (document as any).createElement('i');
            if (c) {
                active++;
                sum += c;
            }
            x.dataset.l = c === 0 ? 0 : c < 5 ? 1 : c < 12 ? 2 : c < 20 ? 3 : 4;
            x.title = new Date(d * 86400000).toLocaleDateString(loc, { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' · ' + c + ' ' + t('reviews_word');
            hm.appendChild(x);
        }
        const meta: any = t('heat_meta', active, sum);
        hm.setAttribute('aria-label', t('heat_aria') + ' — ' + meta);
        const sw: any = ['var(--line)', '#d8c79a', 'var(--gold)', '#7fae8b', 'var(--good)'].map((c: any = undefined) => '<i style="background:' + c + '"></i>').join('');
        $('heat-meta').innerHTML = '<span>' + meta + '</span><span class="hm-key" aria-hidden="true">' + t('heat_less') + ' ' + sw + ' ' + t('heat_more') + '</span>';
    }
    // every concept, grouped by topic
    const g: any = $('itemGrid');
    g.innerHTML = '';
    Object.keys(CATS).forEach((cat: any = undefined) => {
        const sec: any = (document as any).createElement('div');
        sec.className = 'ig-cat';
        sec.innerHTML = '<h3>' + catLabel(cat) + '</h3>';
        const grid: any = (document as any).createElement('div');
        grid.className = 'grid-items';
        ITEMS.filter((it: any = undefined) => it.cat === cat).forEach((it: any = undefined) => {
            const b: any = boxOf(it.id);
            const c: any = (document as any).createElement('div');
            c.className = 'cell';
            c.dataset.b = b;
            const lbl: any = itemLabel(it);
            const st: any = isNew(it.id) ? t('grid_new') : (t('grid_box') + ' ' + b);
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
function statHTML(v: any = undefined, l: any = undefined): any { return '<div class="s"><b class="num">' + v + '</b><span>' + l + '</span></div>'; }
/* ---------- TODAY: daily plan ---------- */
function toolName(v: any = undefined): any { return t(v === 'practice' ? 'nav_drills' : 'nav_' + v); }
function renderPlan(): any {
    const list: any = $('plan-list');
    if (!list)
        return;
    const tn: any = todayN();
    const goal: any = data.settings.goal, done: any = data.todayDay === tn ? (data.todayCount || 0) : 0;
    const td: any = data.toolDay || {}, ear: any = data.earDay === tn ? (data.earToday || 0) : 0;
    const items: any = [
        { id: 'review', done: done >= goal, partial: done > 0 && done < goal, prog: goal ? Math.min(1, done / goal) : 0, pill: Math.min(done, goal) + '/' + goal, t: t('plan_review'), d: done >= goal ? t('plan_review_done') : t('plan_review_d', done, goal), go: () => { if (!SES.active)
                startSession(null); } },
        ...learnPlanItems(tn),
        { id: 'read', done: td.read === tn, t: t('plan_read'), d: t('plan_read_d'), go: () => show('read') },
        { id: 'ear', done: ear >= 5, partial: ear > 0 && ear < 5, prog: Math.min(1, ear / 5), pill: Math.min(ear, 5) + '/5', t: t('plan_ear'), d: ear ? t('plan_ear_dn', Math.min(ear, 5)) : t('plan_ear_d'), go: () => { show('songs'); $('sq-go').focus(); } },
    ];
    const nextIdx: any = items.findIndex((i: any = undefined) => !i.done);
    list.innerHTML = '';
    items.forEach((it: any = undefined, idx: any = undefined) => {
        const li: any = (document as any).createElement('li'), b: any = (document as any).createElement('button'), isNext: any = idx === nextIdx, isPart: any = !it.done && !!it.partial;
        b.type = 'button';
        b.className = 'plan-item';
        b.dataset.plan = it.id;
        b.dataset.done = it.done ? 'true' : 'false';
        if (isNext)
            b.dataset.next = 'true';
        if (isPart)
            b.dataset.partial = 'true';
        const ckTxt: any = it.done ? '✓' : String(idx + 1);
        const pillHtml: any = it.pill ? '<span class="plan-pill">' + it.pill + '</span>' : '';
        const barHtml: any = (isPart && it.prog > 0) ? '<span class="plan-bar" aria-hidden="true"><i style="width:' + Math.round(it.prog * 100) + '%"></i></span>' : '';
        b.innerHTML = '<span class="ck" aria-hidden="true">' + ckTxt + '</span><span class="pt">' + it.t + (it.done ? '<span class="visually-hidden"> — ' + t('done_today') + '</span>' : '') + '</span><span class="pd">' + it.d + '</span><span class="plan-end" aria-hidden="true">' + pillHtml + '<span class="plan-go">→</span></span>' + barHtml;
        b.addEventListener('click', it.go);
        li.appendChild(b);
        list.appendChild(li);
    });
    $('plan-sub').textContent = t('plan_sub', items.filter((i: any = undefined) => i.done).length, items.length);
    const segs: any = $('plan-segs');
    if (segs) {
        segs.innerHTML = items.map((it: any = undefined, idx: any = undefined) => '<i data-state="' + (it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo') + '"></i>').join('');
    }
    const nextIt: any = nextIdx >= 0 ? items[nextIdx] : null, lt: any = data.lastTool, cb: any = $('plan-continue');
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
function prRecordDrill(): any { if (!SES.targeted || !SES.total)
    return; const tg: any = SES.targeted; data.lastDrill = { cat: tg.cat, mode: tg.mode, keys: tg.mode === 'ear' && (tg.cat === 'melody' || !!data.settings.earKeys), key: tg.key, c: SES.correct, n: SES.total, day: todayN() }; saveAll(); }
function renderPracticeLast(): any {
    const el: any = $('pr-last');
    if (!el)
        return;
    const d: any = data.lastDrill;
    if (!d || !d.n || (!CATS[d.cat] && d.cat !== 'melody')) {
        el.hidden = true;
        return;
    }
    const pct: any = Math.round(100 * d.c / d.n);
    el.hidden = false;
    el.className = 'verdict ' + (pct >= 80 ? 'good' : 'neutral');
    el.textContent = t('pr_last', (d.cat === 'melody' ? t('cat_melody') : catLabel(d.cat)) + ' · ' + t(d.keys ? 'pr_onkeys' : d.mode === 'ear' ? 'pr_byear' : 'pr_playit')) + ' — ' + t('pr_last_res', d.c, d.n) + ' (' + pct + '%)';
}
/* ---------- SUMMARY ---------- */
function showSummary(..._args: any[]): any {
    $('summary').style.display = 'block';
    $('today-home').style.display = 'none';
    const acc: any = SES.total ? Math.round(100 * SES.correct / SES.total) : 0;
    $('sum-acc').textContent = acc + '%';
    $('sum-rev').textContent = SES.total;
    $('sum-streak').textContent = currentStreak();
    const r: any = $('sum-ring');
    const C: any = 2 * Math.PI * 52;
    r.innerHTML = '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - acc / 100)) + '" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" dy=".35em" font-family="var(--serif)" font-weight="900" font-size="26" fill="var(--ink)">' + acc + '%</text>';
    if (SES.placement || arguments[0]) {
        $('sum-title').textContent = t('sum_place');
        $('sum-note').textContent = t('sum_placenote', SES.correct, SES.total);
    }
    else {
        $('sum-title').textContent = t('sum_welldone');
        const dueLeft: any = dueItems().length;
        $('sum-note').textContent = dueLeft ? t('sum_more', dueLeft) : t('sum_caught');
    }
}
/* ============================================================================
   PERSISTENCE  (versioned, migrates V2)
   ============================================================================ */
function clampPersistedNumber(v: any = undefined, min: any = undefined, max: any = undefined, fallback: any = undefined): any { return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback; }
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
const SYNC: any = { raw: null, gen: '', id: '', known: new Map(), merge: null, pend: {}, t: 0, w: 0 }, SYNC_NONE: any = {}, SYNC_ID: any = /^[a-z0-9_-]{1,48}$/i; // SYNC_NONE: no shared base, so counters keep the larger side instead of adding
const SYNC_ADD: any = /^(totalReviews|totalCorrect|history\.\d+|reading\.tot\.\w+|reading\.nt\..+\.(n|ok|ms)|reading\.lv\..+\.n|learnRev\..+\.n)$/;
const SYNC_MAX: any = /^(bestStreak|placed|singCleared\..+|sheet\..+\.(best|learned)|learnDone\..+|learnRev\..+\.(last|rv)|learnUnlock\..+|toolDay\..+|reading\.lv\..+\.(s|acc|rush))$/;
const SYNC_PREFS: any = { theme: [() => theme, (v: any = undefined) => { if (['auto', 'light', 'dark'].includes(v)) {
            theme = v;
            applyTheme();
        } }],
    lang: [() => lang, (v: any = undefined) => { if (STRINGS[v]) {
            setLang(v);
            setTimeout(rdOnLocale, 0);
        } }, 1],
    notation: [() => notation, (v: any = undefined) => { if (['letter', 'solfege', 'german'].includes(v)) {
            notation = v;
            applyNotation();
            refreshToday();
            setTimeout(rdOnLocale, 0);
        } }, 1],
    labels: [() => labelMode, (v: any = undefined) => { if (['c', 'all', 'none'].includes(v)) {
            labelMode = v;
            buildKeyboard();
            repaintHeld();
        } }, 1] };
function syncGen(): any { return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8); } // sorts by time
function syncId(p: any = undefined, raw: any = undefined): any {
    if (p && typeof p.syncId === 'string' && SYNC_ID.test(p.syncId))
        return p.syncId;
    const s: any = typeof raw === 'string' ? raw : JSON.stringify(p || {});
    let h: any = 2166136261;
    for (let i: any = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return 'h' + (h >>> 0).toString(36);
}
function syncRemember(id: any = undefined, p: any = undefined): any {
    if (!id || !isBackupPayload(p))
        return;
    SYNC.known.delete(id);
    SYNC.known.set(id, p);
    while (SYNC.known.size > 16)
        SYNC.known.delete(SYNC.known.keys().next().value);
}
function syncCurrent(raw: any = undefined): any { const p: any = JSON.parse(raw); SYNC.raw = raw; SYNC.id = syncId(p, raw); syncRemember(SYNC.id, p); } // its own copy: data may share objects with the record it was read from
function syncPair(a: any = undefined, b: any = undefined): any { return 'merge:' + [a, b].sort().join('+'); }
function syncInitial(): any {
    const p: any = { v: 3, gen: SYNC.gen, data: JSON.parse(JSON.stringify(data)) };
    SYNC.id = 'init';
    SYNC.raw = null;
    syncRemember(SYNC.id, p);
}
function syncSame(a: any = undefined, b: any = undefined): any {
    if (a === b)
        return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object')
        return false;
    const k: any = Object.keys(a);
    return k.length === Object.keys(b).length && k.every((x: any = undefined) => Object.prototype.hasOwnProperty.call(b, x) && syncSame(a[x], b[x]));
}
function syncSrsPair(b: any = undefined, l: any = undefined, r: any = undefined): any {
    if (b === SYNC_NONE || !isRecord(l) || !isRecord(r))
        return null;
    const base: any = isRecord(b) ? b : { box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 }, reps: any = (x: any = undefined) => Math.max(0, Math.floor(+x.reps || 0)), lapses: any = (x: any = undefined) => Math.max(0, Math.floor(+x.lapses || 0));
    const br: any = reps(base), bl: any = lapses(base), lr: any = reps(l), rr: any = reps(r), wrong: any = (x: any = undefined) => lapses(x) === bl ? false : lapses(x) === bl + 1 ? true : null, lw: any = wrong(l), rw: any = wrong(r);
    if (lr !== br + 1 || rr !== br + 1 || lw === null || rw === null)
        return null;
    return { base: { ...base, box: Math.max(0, Math.min(7, Math.round(+base.box || 0))), ease: Math.max(1.6, Math.min(2.9, +base.ease || 2.3)), reps: br, lapses: bl }, baseReps: br, wrong: [lw, rw], day: Math.max(+base.last || 0, +l.last || 0, +r.last || 0) || todayN() };
}
function syncSrs(b: any = undefined, l: any = undefined, r: any = undefined): any {
    const pair: any = syncSrsPair(b, l, r);
    if (!pair) {
        if (!isRecord(l) || !isRecord(r))
            return isRecord(l) ? l : r;
        return (+r.reps || 0) > (+l.reps || 0) || (+r.reps || 0) === (+l.reps || 0) && (+r.last || 0) > (+l.last || 0) ? r : l;
    }
    const out: any = { ...pair.base };
    pair.wrong.sort((a: any = undefined, b: any = undefined) => Number(b) - Number(a)).forEach((wrong: any = undefined) => { out.reps++; if (!wrong) {
        out.box = Math.min(7, out.box + 1);
        out.ease = Math.min(2.9, out.ease + .05);
    }
    else {
        out.box = 1;
        out.lapses++;
        out.ease = Math.max(1.6, out.ease - .2);
    } const days: any = IVL[out.box] !== undefined ? IVL[out.box] : 120; out.due = pair.day + Math.max(0, Math.round(days * (out.ease / 2.3))); out.last = pair.day; });
    return out;
}
function syncNewCollisions(b: any = undefined, l: any = undefined, r: any = undefined): any {
    if (b === SYNC_NONE || !isRecord(l) || !isRecord(r))
        return [];
    const bs: any = isRecord(b.srs) ? b.srs : {}, ls: any = isRecord(l.srs) ? l.srs : {}, rs: any = isRecord(r.srs) ? r.srs : {};
    return [...new Set([...Object.keys(ls), ...Object.keys(rs)])].flatMap((k: any = undefined) => { const pair: any = syncSrsPair(bs[k], ls[k], rs[k]); return pair && pair.baseReps === 0 ? [pair.day] : []; });
}
function syncPick(b: any = undefined, l: any = undefined, r: any = undefined, p: any = undefined): any {
    if (l === undefined || r === undefined)
        return l === undefined ? r : l; // one tab deleted what the other changed: keep the data
    if (p.startsWith('srs.'))
        return syncSrs(b, l, r);
    if (p === 'lastDrill')
        return (+r.day || 0) > (+l.day || 0) ? r : l;
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
function syncInto(l: any = undefined, b: any = undefined, r: any = undefined, p: any = undefined): any {
    new Set([...Object.keys(l), ...Object.keys(r)]).forEach((k: any = undefined) => {
        const q: any = p ? p + '.' + k : k, none: any = b === SYNC_NONE, bk: any = none ? b : isRecord(b) ? b[k] : undefined, lv: any = l[k], rv: any = r[k], srs: any = /^srs\./.test(q);
        if (!none && syncSame(rv, bk))
            return; // the other tab left it alone
        if (isRecord(lv) && isRecord(rv) && !/^srs\.|^lastDrill$/.test(q)) {
            syncInto(lv, bk, rv, q);
            return;
        } // field by field, keeping this tab's objects
        const v: any = !none && syncSame(lv, bk) ? rv : // only the other tab changed it
            syncSame(lv, rv) && !SYNC_ADD.test(q) && !srs ? lv : syncPick(bk, lv, rv, q); // both did
        if (v === undefined)
            delete l[k];
        else
            l[k] = v;
    });
}
// todayCount/newToday count the day in todayDay (earToday the day in earDay): only the later day's counts survive, and same-day counts add up.
function syncData(b: any = undefined, l: any = undefined, r: any = undefined): any {
    const day: any = {}, repeatedNew: any = syncNewCollisions(b, l, r);
    [['todayDay', 'todayCount', 'newToday'], ['earDay', 'earToday']].forEach(([dk, ...ks]: any = undefined) => {
        if (l[dk] === undefined && r[dk] === undefined)
            return;
        const d: any = Math.max(+l[dk] || 0, +r[dk] || 0), on: any = (x: any = undefined) => x !== SYNC_NONE && isRecord(x) && (+x[dk] || 0) === d;
        day[dk] = d;
        ks.forEach((k: any = undefined) => { const n: any = (x: any = undefined) => on(x) ? (+x[k] || 0) : 0; day[k] = b === SYNC_NONE ? Math.max(n(l), n(r)) : Math.max(0, n(l) + n(r) - n(b)); });
    });
    if (repeatedNew.length && day.todayDay !== undefined)
        day.newToday = Math.max(0, (+day.newToday || 0) - repeatedNew.filter((d: any = undefined) => d === day.todayDay).length);
    day.streak = Math.max(0, ...[l, r].filter((x: any = undefined) => (+x.todayDay || 0) === day.todayDay).map((x: any = undefined) => +x.streak || 0));
    day.lastActive = Math.max(+l.lastActive || 0, +r.lastActive || 0);
    syncInto(l, b, r, '');
    Object.assign(l, day);
}
function syncPref(f: any = undefined, v: any = undefined): any { const p: any = SYNC.pend[f]; return p && p.from === v ? p.v : v; } // another tab's choice that is still waiting here is what gets saved
// Folds in what another tab stored since SYNC.raw. Returns '' (nothing new), 'merge', 'merge-save' (the merged state must
// be persisted), 'swap' (that tab reset or imported the record) or 'old' (it saved over this tab's newer reset or import).
let syncPull: any = function syncPull() {
    let stored: any = null;
    try {
        stored = readPttV3(localStorage, KEY);
    }
    catch (_: any) { }
    const cur: any = stored?.raw || null;
    if (cur === null || cur === SYNC.raw)
        return '';
    let rp: any = null, bp: any = SYNC_NONE, lp: any = null;
    rp = stored?.payload || null;
    if (!isBackupPayload(rp))
        return '';
    const gen: any = typeof rp.gen === 'string' ? rp.gen : '', swap: any = gen > SYNC.gen;
    if (gen < SYNC.gen)
        return 'old';
    lp = parsePttV3(SYNC.raw);
    if (lp) {
        syncRemember(syncId(lp, SYNC.raw), lp);
        bp = lp;
    }
    const parent: any = typeof rp.syncParent === 'string' ? rp.syncParent : '', pair: any = parent && typeof rp.syncMerge === 'string' && SYNC_ID.test(rp.syncMerge) ? syncPair(parent, rp.syncMerge) : '';
    const ancestor: any = pair && SYNC.known.get(pair) || parent && SYNC.known.get(parent); // a merge of the same pair made or taken in here is the real shared base
    if (ancestor && (typeof ancestor.gen === 'string' ? ancestor.gen : '') === gen)
        bp = ancestor;
    const lid: any = SYNC.id, sibling: any = !swap && parent && lp && lp.syncParent === parent && lid !== syncId(rp, cur), sameData: any = !swap && syncSame(data, rp.data) && !sibling;
    if (swap) {
        data = Object.assign(freshData(), rp.data);
        SYNC.gen = gen;
        SYNC.known.clear();
        SYNC.merge = null;
    }
    else if (!sameData)
        syncData(bp === SYNC_NONE ? bp : bp.data, data, rp.data);
    data.settings = restoreSettings(data.settings);
    if (!isRecord(data.srs))
        data.srs = {};
    if (bp !== SYNC_NONE)
        Object.keys(SYNC_PREFS).forEach((f: any = undefined) => {
            const [get, set, later] = SYNC_PREFS[f], v: any = rp[f];
            if (v === undefined || v === bp[f] || syncPref(f, get()) !== bp[f])
                return; // the other tab did not change it, or this tab changed it too
            if (v === get())
                delete SYNC.pend[f];
            else if (later)
                SYNC.pend[f] = { v, from: get() };
            else
                set(v);
        });
    const needsWrite: any = !swap && !syncSame(data, rp.data);
    syncCurrent(cur);
    if (needsWrite && isBackupPayload(lp) && parent !== lid) { // theirs lacks this tab's record: keep the plain merge of the two for the save that follows
        const merged: any = { v: 3, gen, data: JSON.parse(JSON.stringify(lp.data)) };
        syncData(bp.data, merged.data, rp.data);
        Object.keys(SYNC_PREFS).forEach((f: any = undefined) => { merged[f] = syncPref(f, SYNC_PREFS[f][0]()); });
        syncRemember(syncPair(SYNC.id, lid), merged);
        SYNC.merge = { into: SYNC.id, id: lid };
    }
    if (pair && !SYNC.known.has(pair))
        syncRemember(pair, SYNC.known.get(SYNC.id));
    return swap ? 'swap' : needsWrite ? 'merge-save' : 'merge';
};
function syncBusy(): any { return SES.active || sing.active || SR.active || RD.on || accomp.on || trx.on || SCORE.playing; }
function syncIdle(): any {
    clearTimeout(SYNC.w);
    if (!Object.keys(SYNC.pend).length)
        return;
    if (syncBusy()) {
        SYNC.w = setTimeout(syncIdle, 1500);
        return;
    }
    Object.keys(SYNC.pend).forEach((f: any = undefined) => { const p: any = SYNC.pend[f]; if (!p)
        return; delete SYNC.pend[f]; if (SYNC_PREFS[f][0]() === p.from)
        SYNC_PREFS[f][1](p.v); });
}
function syncNote(on: any = undefined): any { const n: any = $('syncNote'); if (n)
    n.hidden = !on; }
// Re-rendering waits for a fresh task, so a save made in the middle of drawing something is never re-entered.
function syncAfter(got: any = undefined): any { if (got === 'swap')
    syncNote(true); clearTimeout(SYNC.t); SYNC.t = setTimeout(syncRefresh, 0); }
function syncRefresh(): any {
    syncIdle();
    reflectSettingsUI();
    if (view0() === 'today' && !SES.active)
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'practice' && !SES.active)
        renderPracticeLast();
}
function saveAll(): any { const got: any = syncPull(); syncWrite(); if (got === 'merge' || got === 'merge-save' || got === 'swap')
    syncAfter(got); }
function syncWrite(): any { try {
    const p: any = { v: 3, gen: SYNC.gen, syncId: syncGen(), syncParent: SYNC.id, ...SYNC.merge && SYNC.merge.into === SYNC.id ? { syncMerge: SYNC.merge.id } : {}, audioEngine: 'recorded-piano-v2', lang: syncPref('lang', lang), theme, data, notation: syncPref('notation', notation), tone, masterVol, muted, localSynth, reverb: reverbWet, labels: syncPref('labels', labelMode), bpm: metro.bpm, drone: !!data.settings.drone, device: activeInputId || savedDevice, scoreLook: SCORE.look, scoreHl: SCORE.hl, scoreView: FALL.mode === 'fall' ? 'fall' : SCORE.layout, kbDock: DOCK.pref, anSide: { open: SIDE.open, tab: SIDE.tab, w: SIDE.w }, wake: WAKE.want, ble: BLE.saved };
    const s: any = writePttV3(localStorage, p);
    SYNC.merge = null;
    syncCurrent(s);
}
catch (e: any) {
    console.warn('save failed', e);
} }
let _saveT: any = null;
function saveSoon(): any { clearTimeout(_saveT); _saveT = setTimeout(saveAll, 400); } // for sliders — avoid a localStorage write per pixel
function loadAll(): any {
    try {
        SYNC.known.clear();
        SYNC.id = '';
        SYNC.merge = null;
        const stored: any = readPttV3(localStorage), raw: any = stored?.payload;
        if (raw) {
            SYNC.gen = typeof raw.gen === 'string' ? raw.gen : '';
            syncCurrent(stored.raw);
            if (raw.data) {
                data = Object.assign(data, raw.data);
                data.settings = restoreSettings(raw.data.settings);
                data.srs = raw.data.srs || {};
            }
            if (raw.lang && STRINGS[raw.lang])
                lang = raw.lang;
            if (raw.theme)
                theme = raw.theme;
            if (['letter', 'solfege', 'german'].includes(raw.notation))
                notation = raw.notation;
            tone = raw.audioEngine === 'recorded-piano-v2' && raw.tone ? raw.tone : 'piano';
            masterVol = clampPersistedNumber(raw.masterVol, 0, 1, masterVol);
            if (raw.muted === true)
                muted = true;
            if (typeof raw.localSynth === 'boolean')
                localSynth = raw.localSynth;
            reverbWet = clampPersistedNumber(raw.reverb, 0, 0.5, reverbWet);
            if (raw.labels)
                labelMode = raw.labels;
            metro.bpm = Math.round(clampPersistedNumber(raw.bpm, 50, 180, metro.bpm));
            if (raw.device)
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
            const bl: any = raw.ble;
            if (bl && typeof bl.id === 'string' && bl.id)
                BLE.saved = { id: bl.id, name: typeof bl.name === 'string' ? bl.name : '', auto: bl.auto !== false };
            const sd: any = raw.anSide;
            if (sd && typeof sd === 'object') {
                if (typeof sd.open === 'boolean')
                    SIDE.open = sd.open;
                if (AN_TABS.includes(sd.tab))
                    SIDE.tab = sd.tab;
                if (Number.isFinite(sd.w))
                    SIDE.w = Math.max(280, Math.min(560, Math.round(sd.w)));
            }
            return;
        }
        // migrate from V2 settings (notation/tone) if present
        const v2s: any = legacySettings(localStorage);
        if (v2s) {
            if (['letter', 'solfege', 'german'].includes(v2s.noteSys))
                notation = v2s.noteSys;
            tone = 'piano';
            masterVol = clampPersistedNumber(v2s.vol, 0, 1, masterVol);
        }
        const v2st: any = JSON.parse(localStorage.getItem('ptt-stats-v2') || 'null');
        if (v2st && v2st.items) { // seed SRS boxes from V2 per-item accuracy
            const map: any = { iv: 'iv', ch: 'ch', sc: 'sc', pr: 'pr' };
            Object.keys(map).forEach((mode: any = undefined) => { const it: any = v2st.items[mode] || {}; Object.keys(it).forEach((k: any = undefined) => { const rec: any = it[k]; const id: any = (mode === 'iv' ? 'iv:' : mode === 'ch' ? 'ch:' : mode === 'sc' ? 'sc:' : 'pr:') + k; if (ITEM_BY_ID[id] && rec.seen >= 2) {
                const acc: any = 1 - (rec.miss / rec.seen);
                const box: any = acc > .85 ? 3 : acc > .6 ? 2 : 1;
                data.srs[id] = { box, ease: 2.3, reps: rec.seen, lapses: rec.miss, due: todayN() + (box >= 3 ? 4 : 1), last: todayN() };
            } }); });
        }
        if (navigator.language && /^ro/i.test(navigator.language))
            lang = 'ro'; // first-time Romanian browser → Romanian UI
        syncInitial();
    }
    catch (e: any) {
        console.warn('load failed', e);
    }
}
/* ============================================================================
   WIRING + BOOT
   ============================================================================ */
function labelSettingsControl(controlId: any = undefined, labelKey: any = undefined, helpKey: any = undefined): any {
    const control: any = $(controlId), label: any = (document as any).querySelector('[data-i18n="' + labelKey + '"]');
    if (!control || !label)
        return;
    label.id = controlId + '-label';
    control.setAttribute('aria-labelledby', label.id);
    if (helpKey) {
        const help: any = (document as any).querySelector('[data-i18n="' + helpKey + '"]');
        if (help) {
            help.id = controlId + '-help';
            control.setAttribute('aria-describedby', help.id);
        }
    }
}
function labelSettingsControls(): any {
    [['deviceSelect', 'set_input'], ['toneSel', 'set_tone'], ['set-goal', 'set_sessionlen'], ['set-new', 'set_newperday', 'set_newperday_s'],
        ['set-wake', 'set_wake'], ['set-synth', 'set_localsynth'], ['set-drone', 'set_drone'], ['set-metronome', 'set_metronome'], ['set-inv', 'set_allowinv']]
        .forEach((args: any = undefined) => labelSettingsControl(...args));
}
function reflectSettingsUI(): any {
    $('volume').value = Math.round(masterVol * 100);
    $('toneSel').value = tone;
    $('bpm').value = metro.bpm;
    $('bpmLbl').textContent = metro.bpm;
    $('reverb').value = Math.round(reverbWet / 0.5 * 100);
    (document as any).querySelectorAll('#set-labels button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === labelMode ? 'true' : 'false'));
    $('set-synth').checked = localSynth;
    $('set-drone').checked = !!data.settings.drone;
    $('set-inv').checked = !!data.settings.allowInv;
    $('set-metronome').checked = !!data.settings.metronome;
    $('set-goal').value = String(data.settings.goal);
    $('set-new').value = String(data.settings.newPerDay);
    (document as any).querySelectorAll('#set-notation button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === notation ? 'true' : 'false'));
    (document as any).querySelectorAll('#set-lang button').forEach((b: any = undefined) => b.setAttribute('aria-pressed', b.dataset.v === lang ? 'true' : 'false'));
}
function overlaysOpen(): any { return $('drawer').classList.contains('on') || $('helpBox').classList.contains('on'); }
function syncScrim(): any {
    const open: any = overlaysOpen();
    $('scrim').classList.toggle('on', open);
    (document as any).querySelectorAll('body > #skipLink, body > header, body > main, body > #dock, body > details.osmd-lic, body > footer').forEach((el: any = undefined) => { el.inert = open; });
}
// Closed overlays are only moved/faded out by CSS, so `inert` keeps their controls out of the Tab order;
// opening moves focus inside, closing returns it to whatever opened the overlay.
const overlayReturn: any = new Map();
function setOverlay(el: any = undefined, o: any = undefined, firstId: any = undefined): any {
    const was: any = el.classList.contains('on'), hadFocus: any = el.contains(document.activeElement);
    el.classList.toggle('on', o);
    el.setAttribute('aria-hidden', o ? 'false' : 'true');
    el.inert = !o;
    syncScrim();
    if (o && !was) {
        overlayReturn.set(el, document.activeElement);
        $(firstId).focus();
        requestAnimationFrame(() => { if (el.classList.contains('on'))
            $(firstId).focus(); });
    }
    else if (!o && was) {
        const r: any = overlayReturn.get(el);
        overlayReturn.delete(el);
        if (!overlaysOpen() && hadFocus && r && r.isConnected && typeof r.focus === 'function')
            r.focus();
    }
}
function trapFocus(e: any = undefined): any {
    if (e.key !== 'Tab')
        return;
    const f: any = [...e.currentTarget.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x: any = undefined) => !x.disabled && x.getClientRects().length);
    if (!f.length)
        return;
    const a: any = f[0], z: any = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
    }
    else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
    }
}
function openDrawer(o: any = undefined, fromPop: any = false): any {
    if (o) {
        releaseLiveInput();
        if (!fromPop)
            pushModalState('drawer');
    }
    else if (!fromPop) {
        popModalState('drawer');
    }
    setOverlay($('drawer'), o, 'drawerClose');
}
function openHelp(o: any = undefined, fromPop: any = false): any {
    if (o) {
        releaseLiveInput();
        kbdLayoutLabels();
        if (!fromPop)
            pushModalState('help');
    }
    else if (!fromPop) {
        popModalState('help');
    }
    setOverlay($('helpBox'), o, 'helpClose');
}
function applyNotation(): any {
    const refR: any = $('refRoot').value, kc: any = $('keyCtx').value, sr: any = $('song-root').value, pk: any = $('pr-key').value;
    fillRoots($('refRoot'), false);
    fillRoots($('song-root'), false);
    fillRoots($('pr-key'), true);
    fillKeyCtx();
    $('refRoot').value = refR || 0;
    $('song-root').value = sr || 0;
    $('pr-key').value = pk || 'all';
    $('keyCtx').value = kc || '-1';
    const ak: any = $('ac-key');
    if (ak) {
        const av: any = ak.value;
        fillRoots(ak, false);
        ak.value = av || accomp.key || 0;
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
function renderAccompany(): any {
    const ps: any = $('ac-prog');
    if (ps && !ps._filled) {
        ACCOMP_PROGS.forEach((p: any = undefined, i: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = i; o.textContent = p.name; ps.appendChild(o); });
        ps._filled = true;
    }
    const pt: any = $('ac-pat');
    if (pt && !pt._filled) {
        Object.keys(ACCOMP_PATTERNS).forEach((k: any = undefined) => { const o: any = (document as any).createElement('option'); o.value = k; o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en; pt.appendChild(o); });
        pt._filled = true;
    }
    const ak: any = $('ac-key');
    if (ak && !ak.options.length) {
        fillRoots(ak, false);
        ak.value = accomp.key || 0;
    }
    updateAccompChain();
}
function updateAccompChain(): any { const el: any = $('ac-chain'); if (!el)
    return; const prog: any = ACCOMP_PROGS[+($('ac-prog').value || 0)]; if (!prog)
    return; const key: any = +($('ac-key').value || 0); el.innerHTML = prog.chords.map((ch: any = undefined) => '<span class="ch">' + rootName(((key + ch[0]) % 12 + 12) % 12) + dispSym(ch[1]) + '</span>').join('<span class="sep" aria-hidden="true">·</span>'); }
function accompSync(): any { accomp.progIdx = +($('ac-prog').value || 0); accomp.key = +($('ac-key').value || 0); accomp.pattern = $('ac-pat').value || 'block'; accomp.bpm = +($('ac-bpm').value || 90); const hb: any = $('ac-hands').querySelector('[aria-pressed="true"]'); accomp.hands = hb ? hb.dataset.v : 'both'; accomp.click = $('ac-click').checked; }
function acPlayLabel(): any { $('ac-play').textContent = accomp.on ? t('ac_stop') : t('ac_play'); }
function accompRestartIfPlaying(): any { if (accomp.on) {
    accompSync();
    accompStart();
} }
function initControls(): any {
    labelSettingsControls();
    $('skipLink').addEventListener('click', (e: any = undefined) => { e.preventDefault(); $('main').focus({ preventScroll: true }); });
    // nav
    $('nav').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (b)
        show(b.dataset.view); });
    $('modeNav').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-view]'); if (b)
        show(b.dataset.view); });
    (document as any).querySelector('.brand').addEventListener('click', (e: any = undefined) => { e.preventDefault(); show('today'); });
    // midi chip + settings
    $('midiChip').addEventListener('click', connectMidi);
    $('audioLockBtn').addEventListener('click', audioUnlock);
    $('syncNoteBtn').addEventListener('click', () => syncNote(false));
    $('set-connect').addEventListener('click', connectMidi);
    $('deviceSelect').addEventListener('change', (e: any = undefined) => attachInput(e.target.value));
    $('set-ble').addEventListener('click', bleClick);
    $('set-ble-re').addEventListener('click', bleReconnect);
    // installed app & screen
    $('set-wake').addEventListener('change', (e: any = undefined) => wakeSet(e.target.checked));
    $('set-full').addEventListener('click', fsToggle);
    $('set-install').addEventListener('click', pwaInstall);
    document.addEventListener('fullscreenchange', fsUi);
    $('settingsBtn').addEventListener('click', () => openDrawer(true));
    $('scrim').addEventListener('click', () => { openDrawer(false); openHelp(false); });
    $('drawerClose').addEventListener('click', () => openDrawer(false));
    $('helpBtn').addEventListener('click', () => openHelp(true));
    $('helpClose').addEventListener('click', () => openHelp(false));
    $('drawer').addEventListener('keydown', trapFocus);
    $('helpBox').addEventListener('keydown', trapFocus);
    // learn: demo buttons + cross-links
    $('learnBody').addEventListener('click', (e: any = undefined) => learnClick(e));
    // theme
    $('set-theme').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; theme = b.dataset.v; applyTheme(); saveAll(); });
    // mobile menu
    $('menuBtn').addEventListener('click', () => {
        const mm: any = $('mobileMenu');
        if (mm.hidden) {
            openMobileMenu();
        }
        else
            closeMobileMenu(true);
    });
    document.addEventListener('click', (e: any = undefined) => { const mm: any = $('mobileMenu'); if (mm && !mm.hidden && !e.target.closest('#mobileMenu') && !e.target.closest('#menuBtn'))
        closeMobileMenu(); });
    // backup export / import
    $('exportBtn').addEventListener('click', () => {
        saveAll();
        const raw: any = readPttV3(localStorage, KEY)?.raw || '{}';
        const d: any = new Date(), p2: any = (n: any = undefined) => String(n).padStart(2, '0');
        trxDownload('etude-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', new Blob([raw], { type: 'application/json' }));
    });
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', (e: any = undefined) => {
        const f: any = e.target.files[0];
        e.target.value = '';
        if (!f)
            return;
        const rd: any = new FileReader();
        rd.onload = () => { try {
            const p: any = JSON.parse(String(rd.result));
            if (!isBackupPayload(p))
                throw 0;
            if (!confirm(t('import_confirm')))
                return;
            p.gen = syncGen();
            writePttV3(localStorage, p, KEY);
            location.reload();
        }
        catch (_: any) {
            alert(t('import_bad'));
        } };
        rd.readAsText(f);
    });
    // session
    $('tools').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-view]'); if (b)
        show(b.dataset.view); });
    $('startBtn').addEventListener('click', () => startSession(null));
    $('placeBtn').addEventListener('click', startPlacement);
    const goMethod: any = (e: any = undefined) => { e.preventDefault(); show('method'); };
    $('whyLink').addEventListener('click', goMethod);
    $('footMethod').addEventListener('click', goMethod);
    $('method-start').addEventListener('click', () => { show('today'); startSession(null); });
    $('ses-end').addEventListener('click', () => endSession(true));
    $('q-next').addEventListener('click', () => { if (!SES.targeted)
        SES.idx++; nextQuestion(); });
    $('q-reveal').addEventListener('click', () => { const q: any = SES.q; if (!q || SES.answered)
        return; q.missed = true; revealAnswerKeys(q); if (q.mode === 'ear')
        markEarCorrect(q); resolve(q, false); });
    $('q-replay').addEventListener('click', () => { const q: any = SES.q; if (q)
        playQuestionSound(q); });
    $('q-ekreset').addEventListener('click', ekReset);
    $('q-ansmode').addEventListener('click', (e: any = undefined) => {
        const b: any = e.target.closest('button[data-v]'), q: any = SES.q;
        if (!b)
            return;
        const on: any = b.dataset.v === 'keys';
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
        $('q-verdict').textContent = '';
        $('q-verdict').className = 'verdict';
        presentQuestion(q);
    });
    $('sum-again').addEventListener('click', () => { $('summary').style.display = 'none'; startSession(null); });
    $('sum-done').addEventListener('click', () => { $('summary').style.display = 'none'; show('today'); });
    // practice
    $('pr-mode').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b || b.disabled)
        return; [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); });
    // Melodies are only ever answered on the keys: that topic locks the mode to "By ear, on keys".
    $('pr-cat').addEventListener('change', (e: any = undefined) => {
        const mel: any = e.target.value === 'melody', pm: any = $('pr-mode');
        [...pm.children].forEach((x: any = undefined) => { x.disabled = mel && x.dataset.v !== 'keys'; if (mel)
            x.setAttribute('aria-pressed', x.dataset.v === 'keys' ? 'true' : 'false'); });
        if (!mel && !pm.querySelector('[aria-pressed="true"]'))
            pm.children[0].setAttribute('aria-pressed', 'true');
    });
    $('pr-start').addEventListener('click', () => {
        const cat: any = $('pr-cat').value;
        const mb: any = $('pr-mode').querySelector('[aria-pressed="true"]');
        const v: any = cat === 'melody' ? 'keys' : (mb ? mb.dataset.v : 'play');
        const key: any = $('pr-key').value;
        if (v !== 'play' && cat !== 'melody') {
            data.settings.earKeys = v === 'keys';
            saveAll();
        }
        show('practice');
        startSession({ cat, mode: v === 'play' ? 'play' : 'ear', key });
    });
    // accompaniment
    $('ac-hands').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); accompRestartIfPlaying(); });
    ['ac-prog', 'ac-pat', 'ac-key'].forEach((id: any = undefined) => $(id).addEventListener('change', () => { updateAccompChain(); accompRestartIfPlaying(); }));
    $('ac-bpm').addEventListener('input', (e: any = undefined) => { $('ac-bpmLbl').textContent = e.target.value; });
    $('ac-bpm').addEventListener('change', accompRestartIfPlaying);
    $('ac-click').addEventListener('change', accompRestartIfPlaying);
    $('ac-play').addEventListener('click', () => { if (accomp.on) {
        accompStop();
    }
    else {
        accompSync();
        accompStart();
    } acPlayLabel(); });
    // read & play (sheet music)
    $('rd-piece').addEventListener('change', (e: any = undefined) => srSelectPiece(e.target.value));
    $('rd-hands').addEventListener('click', (e: any = undefined) => {
        const b: any = e.target.closest('button');
        if (!b || b.disabled)
            return;
        SR.hands = b.dataset.v;
        [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        srStopAll();
        srStepsBuild();
        srPaintAll();
        $('rd-verdict').textContent = '';
    });
    $('rd-mode').addEventListener('click', (e: any = undefined) => {
        const b: any = e.target.closest('button');
        if (!b)
            return;
        SR.modeSel = b.dataset.v;
        [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        srStopAll();
        $('rd-verdict').textContent = '';
    });
    $('rd-names').addEventListener('change', (e: any = undefined) => { SR.names = e.target.checked; srStopAll(); srDraw(); });
    $('rd-bpm').addEventListener('input', (e: any = undefined) => { if (SR.active || SR.listening) {
        e.target.value = SR.bpm;
        return;
    } $('rd-bpmLbl').textContent = e.target.value; SR.bpm = +e.target.value; });
    $('rd-go').addEventListener('click', srGo);
    $('rd-coach').addEventListener('click', (e: any = undefined) => { if (e.target.closest('#rd-coach-act') && SR.next && SR.next.act)
        SR.next.act.run(); });
    $('rd-listen').addEventListener('click', srListen);
    // transcribe
    $('tr-rec').addEventListener('click', () => { if (trx.on || trx.pending)
        trxStop();
    else
        trxStart(); });
    $('tr-play').addEventListener('click', trxPlay);
    $('tr-clear').addEventListener('click', trxClear);
    $('tr-midi').addEventListener('click', trxExportMidi);
    $('tr-txt').addEventListener('click', trxExportTxt);
    $('tr-bpm').addEventListener('input', (e: any = undefined) => { $('tr-bpmLbl').textContent = e.target.value; });
    ['tr-snap', 'tr-skey', 'tr-sscale', 'tr-quant', 'tr-bpm', 'tr-gridSel'].forEach((id: any = undefined) => $(id).addEventListener('change', () => { if (trx.notes && trx.notes.length)
        trxRender(); }));
    // sight-singing
    $('si-mode').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; singStopAll(); [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); sing.mode = b.dataset.v; ssModeUI(); $('si-verdict').textContent = ''; $('si-hint').textContent = ''; ssPaint(); });
    $('si-level').addEventListener('change', (e: any = undefined) => { singStopAll(); sing.level = +e.target.value; ssNewExercise(); });
    $('si-clef').addEventListener('change', (e: any = undefined) => { singStopAll(); sing.clef = e.target.value; ssNewExercise(); });
    $('si-solf').addEventListener('change', () => { $('si-staff').classList.toggle('nosolf', !$('si-solf').checked); });
    $('si-new').addEventListener('click', () => { singStopAll(); ssNewExercise(); $('si-verdict').textContent = ''; $('si-hint').textContent = ''; });
    $('si-go').addEventListener('click', singGo);
    $('si-tonic').addEventListener('click', ssTonic);
    $('si-playit').addEventListener('click', ssPlayIt);
    $('si-drone').addEventListener('change', ssDrone);
    $('si-bpm').addEventListener('input', (e: any = undefined) => { $('si-bpmLbl').textContent = e.target.value; sing.bpm = +e.target.value; });
    // explore
    anInitControls();
    $('refType').addEventListener('change', () => { fillRefNames(); cof.mode = $('refType').value; cofInfo(); cofPaintDock(); });
    $('refPlay').addEventListener('click', () => { if ($('refType').value === 'chord')
        playChordMidis(refMidis(), true);
    else
        playScaleNotes(60 + parseInt($('refRoot').value, 10), SCALES[$('refName').value], true); });
    $('refShow').addEventListener('click', () => { kbClear('target'); const ms: any = refMidis(); ms.forEach((m: any = undefined) => kbState(m, 'target', true)); exploreSequence([{ at: 0, notes: ms }, { at: 2600, notes: [] }]); exploreTimers.push(setTimeout(() => kbClear('target'), 2600)); });
    $('keyCtx').addEventListener('change', () => { circleSel(); updateExplore(); });
    // songs
    $('song-root').addEventListener('change', renderSongs);
    $('sq-go').addEventListener('click', sqNew);
    $('sq-again').addEventListener('click', () => { if (SQ.started)
        sqPlay(); });
    $('sq-ans').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button[data-semi]'); if (b)
        sqAnswer(+b.dataset.semi); });
    $('song-dir').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; songDir = b.dataset.v; [...e.currentTarget.children].forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); renderSongs(); });
    // progress
    $('prog-export').addEventListener('click', () => $('exportBtn').click());
    $('prog-import').addEventListener('click', () => $('importBtn').click());
    $('prog-start').addEventListener('click', () => { show('today'); startSession(null); });
    $('resetBtn').addEventListener('click', () => { if (confirm(t('reset_confirm'))) {
        data = { srs: {}, streak: 0, bestStreak: 0, lastActive: 0, todayDay: 0, todayCount: 0, newToday: 0, totalReviews: 0, totalCorrect: 0, placed: false, history: {}, singCleared: {}, sheet: {}, learnDone: {}, learnSel: 0, settings: data.settings };
        renderLearn._init = false;
        learnSel = 0;
        SYNC.gen = syncGen();
        syncWrite();
        renderProgress();
        refreshToday();
    } }); // a new generation: other tabs adopt the reset instead of merging their copy back
    // keyboard dock
    $('oct-down').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.max(BASE_LOW, view.low - 12); buildKeyboard(); repaintHeld(); });
    $('oct-up').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.min(BASE_HIGH - view.oct * 12, view.low + 12); buildKeyboard(); repaintHeld(); });
    $('panicBtn').addEventListener('click', panic);
    $('dock-kb-toggle').addEventListener('click', () => dockSet(!dockOpen()));
    $('kb-pan').addEventListener('input', (e: any = undefined) => { $('dock-keys').scrollLeft = +e.target.value; });
    $('dock-keys').addEventListener('scroll', () => { $('kb-pan').value = String($('dock-keys').scrollLeft); });
    // settings: notation/tone/audio/learning
    $('set-notation').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; notation = b.dataset.v; (document as any).querySelectorAll('#set-notation button').forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); applyNotation(); refreshToday(); saveAll(); });
    $('set-lang').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (b)
        setLang(b.dataset.v); });
    $('toneSel').addEventListener('change', (e: any = undefined) => { releaseLiveInput(); stopPreviews(); stopDrone(); tone = e.target.value; ensureAudio(); pianoStatus(); saveAll(); });
    $('volume').addEventListener('input', (e: any = undefined) => { masterVol = e.target.value / 100; muted = false; masterRamp(masterVol); saveSoon(); }); // there is no mute toggle, so moving the slider must always be heard
    $('set-synth').addEventListener('change', (e: any = undefined) => { localSynth = e.target.checked; if (!localSynth) {
        liveVoices.forEach((v: any = undefined) => v.stop());
        liveVoices.clear();
    } saveAll(); });
    $('reverb').addEventListener('input', (e: any = undefined) => { reverbWet = e.target.value / 100 * 0.5; if (reverbGain && actx)
        reverbGain.gain.setTargetAtTime(reverbWet, actx.currentTime, 0.05); saveSoon(); });
    $('set-labels').addEventListener('click', (e: any = undefined) => { const b: any = e.target.closest('button'); if (!b)
        return; labelMode = b.dataset.v; (document as any).querySelectorAll('#set-labels button').forEach((x: any = undefined) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); buildKeyboard(); repaintHeld(); saveAll(); });
    $('bpm').addEventListener('input', (e: any = undefined) => { metro.bpm = +e.target.value; $('bpmLbl').textContent = e.target.value; saveSoon(); });
    $('set-drone').addEventListener('change', (e: any = undefined) => { data.settings.drone = e.target.checked; saveAll(); });
    $('set-metronome').addEventListener('change', (e: any = undefined) => { data.settings.metronome = e.target.checked; saveAll(); });
    $('set-inv').addEventListener('change', (e: any = undefined) => { data.settings.allowInv = e.target.checked; saveAll(); });
    $('set-goal').addEventListener('change', (e: any = undefined) => { data.settings.goal = +e.target.value; saveAll(); refreshToday(); });
    $('set-new').addEventListener('change', (e: any = undefined) => { data.settings.newPerDay = +e.target.value; saveAll(); refreshToday(); });
    // global
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev: any = undefined) => window.addEventListener(ev, function u() { ensureAudio(); }, { once: true }));
    // keyup/pointerup never reach an unfocused window, so focus loss only lets go of what the computer keyboard and pointer hold;
    // playback, recording, accompaniment and drills keep running
    window.addEventListener('blur', releaseFocusInput);
    // a hidden tab throttles timers and stops animation frames: timed playback, accompaniment, mic capture and drills stop cleanly (score playback pauses resumably)
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        panic(); });
    window.addEventListener('storage', (e: any = undefined) => { if (e.storageArea && e.storageArea !== localStorage || e.key !== null && e.key !== KEY)
        return; const got: any = syncPull(); if (got === 'old' || got === 'merge-save')
        syncWrite(); if (got)
        syncAfter(got); }); // another tab saved
    document.addEventListener('keydown', (e: any = undefined) => { if (e.key === 'Escape') {
        if (closeMobileMenu(true)) {
            e.preventDefault();
            return;
        }
        openDrawer(false);
        openHelp(false);
    } });
    let rz: any = null;
    function handleScreenChange(): any {
        clearTimeout(rz);
        rz = setTimeout(() => {
            if (!$('mobileMenu').hidden && getComputedStyle($('menuBtn')).display === 'none') {
                const hadFocus: any = $('mobileMenu').contains(document.activeElement);
                closeMobileMenu();
                if (hadFocus) {
                    const current: any = $('nav').querySelector('[aria-current="page"]');
                    if (current)
                        current.focus({ preventScroll: true });
                }
            }
            const o: any = view.oct;
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
                const work: any = $('an-work').getBoundingClientRect(), dock: any = $('dock').getBoundingClientRect();
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
fillRoots($('refRoot'), false);
fillRoots($('song-root'), false);
fillRoots($('pr-key'), true);
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
if (history.state && history.state.modal)
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
catch (err: any) {
    pianoBank.status = 'error';
    pianoStatus();
    console.warn(err);
}
/* @generated etude test surface */
const __etude: any = {};
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
Object.defineProperty(__etude, "$", { configurable: true, get: () => $ });
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
Object.defineProperty(__etude, "anInflatedSize", { configurable: true, get: () => anInflatedSize, set: (value: any = undefined) => { anInflatedSize = value; } });
Object.defineProperty(__etude, "makePianoVoice", { configurable: true, get: () => makePianoVoice, set: (value: any = undefined) => { makePianoVoice = value; } });
Object.defineProperty(__etude, "pianoDecode", { configurable: true, get: () => pianoDecode, set: (value: any = undefined) => { pianoDecode = value; } });
Object.defineProperty(__etude, "playInterval", { configurable: true, get: () => playInterval, set: (value: any = undefined) => { playInterval = value; } });
Object.defineProperty(__etude, "preparePiano", { configurable: true, get: () => preparePiano, set: (value: any = undefined) => { preparePiano = value; } });
Object.defineProperty(__etude, "previewNote", { configurable: true, get: () => previewNote, set: (value: any = undefined) => { previewNote = value; } });
Object.defineProperty(__etude, "scoreFixPedals", { configurable: true, get: () => scoreFixPedals, set: (value: any = undefined) => { scoreFixPedals = value; } });
Object.defineProperty(__etude, "syncPull", { configurable: true, get: () => syncPull, set: (value: any = undefined) => { syncPull = value; } });
Object.defineProperty(__etude, "actx", { configurable: true, get: () => actx, set: (value: any = undefined) => { actx = value; audioEngine.context = value; } });
Object.defineProperty(__etude, "localSynth", { configurable: true, get: () => localSynth, set: (value: any = undefined) => { localSynth = value; audioEngine.localSynth = value; } });
Object.defineProperty(__etude, "notation", { configurable: true, get: () => notation, set: (value: any = undefined) => { notation = value; } });
Object.defineProperty(__etude, "renderLearn", { configurable: true, get: () => renderLearn, set: (value: any = undefined) => { renderLearn = value; } });
Object.defineProperty(__etude, "show", { configurable: true, get: () => show, set: (value: any = undefined) => { show = value; } });
Object.defineProperty(__etude, "theme", { configurable: true, get: () => theme, set: (value: any = undefined) => { theme = value; } });
window.__etude = __etude;
__etude.loadOsmd = loadOsmd;
export { LGEN, LP, LQ, _modalAfterBack, _modalBackPending, _noiseBuf, _routed, _saveT, _view, acChainHL, acPlayLabel, accompHL, accompRestartIfPlaying, accompStart, accompStop, accompSync, accompTick, accompTimer, accompVoicing, activeInputId, actx, anAccent, anActiveChord, anAnalyze, anAssignHands, anBarsLabel, anBeatText, anBeatUnit, anCadences, anCands, anChipHTML, anChordLabel, anClassifyNonChord, anClearSelection, anClock, anCoach, anCommit, anCommitFocus, anCompute, anDetText, anDiatonic, anDockWanted, anDraw, anError, anErrorKey, anFillExamples, anFit, anFitImplied, anFnKey, anFocus, anFocusNotes, anFocusStage, anFunctionOf, anGrid, anHandOf, anHandsSource, anHandsText, anHarmony, anHasFinger, anHover, anInView, anIndex, anInflatedSize, anInitControls, anIntervalName, anInv, anKeepPlace, anKeepVisible, anKeyAt, anKeyInfo, anKeyName, anKeyRank, anKeysCenter, anKeysClear, anKeysPaint, anKeysShown, anLayoutVars, anLoadExample, anLoadedText, anLocalize, anMarkActive, anMeasureAt, anMeasures, anMotifs, anMxlPreflight, anNarrow, anNctText, anNoteInfo, anNowAnnounce, anNowCard, anNum, anOpenFile, anOpenTab, anOriginText, anParse, anPcWeights, anPieceMeta, anPieceToParsed, anPinToolbar, anPinToolbarLater, anPoly, anPop, anPractice, anPracticeCheck, anPracticeStart, anRate, anReadXml, anRebuild, anReconChange, anReconOpen, anReconUI, anRenderEmpty, anRenderNow, anRenderPractice, anRenderSelection, anRenderWorkspace, anReset, anResolveKey, anRevealPieceRow, anRoman, anRove, anRowsHTML, anScopeNotes, anSegAt, anSegIndexAt, anSelStart, anSelectChord, anSelectNotes, anSelectionChanged, anSetLoading, anSheet, anShortcut, anShowError, anSideResizer, anSideSet, anSideSync, anSideVisible, anSpan, anStageFit, anStatus, anStatusPos, anStatusSel, anSyncTimeline, anTab, anTempoAt, anTlUpdate, anToReadPiece, anUnion, anUnits, anUpdateControls, anVoiceNeighbors, anXmlKeyMap, anXmlTidy, anZoomNow, answerEar, applyI18n, applyNotation, applyTheme, attachInput, audioLockCheck, audioLockSync, audioLockT, audioNoteOff, audioNoteOn, audioUnlock, autoReconnectMidi, bendSemitones, bindKeyA11y, bleAutoReconnect, bleCan, bleChoose, bleClick, bleData, bleDisconnect, bleErr, bleLive, bleMsg, bleName, bleOnGone, bleOnValue, bleOpen, bleParse, bleParserReset, bleReconnect, bleReleaseInput, bleRetry, bleSet, bleStale, bleStatus, bleUi, bleUnhook, boxOf, buildAccomp, buildKeyboard, buildQueue, catLabel, chooseView, chordDegreeMap, chordDisp, chordEarOptions, chordFormula, chordTargetPcs, circleSel, clampPersistedNumber, clampTypeOctave, clearExplorePreview, closeMobileMenu, coachHTML, coachList, coachRefresh, cofData, cofDiagram, cofInfo, cofKeyLabel, cofName, cofNow, cofPaintDock, cofParse, cofPick, cofPlay, cofPt, cofRevealFingering, cofSector, cofSel, cofSigList, cofSpell, cofSpellDegrees, cofSyncRef, cofText, cofTint, cofTonicPc, comp, connectMidi, currentStreak, data, demoBeat, dispSym, dockKeepEnd, dockLabels, dockOpen, dockReveal, dockSet, dockShown, dockSync, dockWanted, drawExploreStaff, droneVoices, dueItems, earRoot, ekBuild, ekCh, ekElab, ekFlash, ekFlat, ekForced, ekIv, ekMel, ekMiss, ekName, ekOff, ekOn, ekPlay, ekProg, ekReset, ekSound, ekStop, ekToggleSync, ekUiReset, ekWanted, ekWin, endSession, ensureAudio, evalTimer, exTab, exTabCur, explorePreview, exploreSequence, exploreTimers, fallBurst, fallData, fallDraw, fallEnd, fallHit, fallHover, fallKeyAt, fallKeyDown, fallKeyPath, fallKeyUp, fallKeyboard, fallKeys, fallMode, fallName, fallParticles, fallRR, fallRange, fallReset, fallSeek, fallSeekEnd, fallSelect, fallTime, feelDisp, fillKeyCtx, fillPieces, fillRefNames, fillRoots, focusView, foldToView, freshData, fsCan, fsToggle, fsUi, gradeChord, gradeInterval, gradeProgChord, gradeScaleNote, greeting, handleNoteOff, handleNoteOn, heldMidis, heldPcs, identifyChord, inField, initControls, initExploreTabs, initPointer, intervalLabel, invName, inversionOf, isDue, isNew, isSubset, itemLabel, ivName, kbClear, kbClearAll, kbDegSrc, kbDegrees, kbPress, kbState, kbdLayoutLabels, keyAt, keyFifths, keyFromFifths, lBarsHTML, lCofKey, lDots, lPitch, lSel, lSeqLight, lSp, lStaffHTML, lStaffNote, lStaffPlay, lStaffSmall, lStaffSvg, lVel, labelMode, labelSettingsControl, labelSettingsControls, lang, learnBodyHTML, learnClick, learnComplete, learnData, learnDueDays, learnDueList, learnGap, learnGloss, learnGo, learnGoId, learnHalt, learnInitSel, learnInput, learnLessonOpen, learnLight, learnMark, learnNavRender, learnPlanItems, learnRdLevel, learnReveal, learnSay, learnSel, learnSide, learnTimer, learnTitle, learnUnitDone, learnUnitOf, learnUnitOpen, learnWire, lfo, lfoGain, lgFilter, lgHTML, lgNorm, listInputs, lmDots, lmMeter, lmStart, lmStop, lmTerm, loadAll, localSynth, lqAnswer, lqFocus, lqLabel, lqMidis, lqNeed, lqNext, lqPick, lqRender, lqShow, lqStart, lwChord, lwChordData, lwChordPlay, lwClick, lwCof, lwInput, lwMetro, lwMount, lwRefocus, lwScale, lwScalePlay, lwStepLab, makeIR, makePianoVoice, makeQuestion, makeVoice, markEarCorrect, master, masterFilter, masterRamp, masterVol, masteredCount, metroClick, metroSched, midiAccess, midiChipSync, midiIn, midiMsg, muted, neutral, newItemsAvail, newQuotaLeft, nextQuestion, noiseBuffer, notation, noteName, onInputChange, onMidiMessage, onStateChange, openDrawer, openHelp, openMobileMenu, openSessionUI, overlaysOpen, panic, pcName, pedalDown, pedalUp, physKey, pianoDecode, pianoEnsure, pianoFail, pianoIdleWarm, pianoKeys, pianoNearest, pianoStatus, pickArturia, pickTargetedItem, playChordMidis, playInterval, playIvDir, playProg, playQuestionSound, playScaleNotes, popModalState, positionBlacks, prRecordDrill, pracAcc, pracBeats, pracClearAB, pracFinish, pracFrame, pracHud, pracInput, pracJudge, pracLoad, pracLoopBars, pracMisses, pracNextBar, pracNextRender, pracNextStep, pracPassEnd, pracRamp, pracRaw, pracRelease, pracSave, pracSegAt, pracSet, pracSetAB, pracStart, pracStatsReset, pracSumClose, pracSummary, pracTick, pracWeakHand, preparePiano, presentEar, presentEarKeys, presentPlay, presentQuestion, previewNote, previewVoices, progChordTpl, pushModalState, pwaInit, pwaInstall, pwaStandalone, pwaUi, randItem, rdAbort, rdAccSym, rdAgg, rdAnsText, rdAnswer, rdBack, rdBars, rdBeatX, rdBtn, rdCClef, rdChLabel, rdClear, rdClick, rdClickAns, rdCoach, rdCustomFill, rdCustomGo, rdCustomRead, rdData, rdEndClick, rdEsc, rdFeedback, rdFinish, rdFocus, rdFromStep, rdGen, rdGenMelody, rdHeat, rdHint, rdHud, rdInput, rdIntro, rdIvName, rdKbMark, rdKbRange, rdKey, rdKeyLabel, rdKeyMinor, rdKeyText, rdKsSvg, rdLetter, rdLvDetail, rdLvName, rdLvNext, rdLvPrev, rdLvSub, rdMidi, rdMiniKb, rdName, rdNext, rdNextRender, rdNextStep, rdNk, rdOnLocale, rdOpen, rdP, rdPercClef, rdPickFrom, rdPickW, rdPool, rdQSvg, rdRangeTxt, rdRender, rdRenderHome, rdRenderStats, rdRhDone, rdRhGen, rdRhGenLH, rdRhGrade, rdRhGradeAll, rdRhGradeHand, rdRhHandLine, rdRhKey, rdRhMarks, rdRhNew, rdRhNoteTip, rdRhOptsLock, rdRhPrefs, rdRhPress, rdRhRelease, rdRhRun, rdRhStrokes, rdScroll, rdSightDone, rdSightGen, rdSightStart, rdSound, rdSpell, rdSpellMidi, rdStars, rdStart, rdStat, rdStep, rdSuggest, rdSvg, rdTab, rdTap, rdTarget, rdU, rdUnlocked, rdWeight, refMidis, reflectSettingsUI, reflowKeys, refreshDeviceList, refreshToday, releaseFocusInput, releaseLiveInput, releaseTypingKeys, renderAccompany, renderCircle, renderLearn, renderModeNav, renderPlan, renderPracticeLast, renderProgress, renderRead, renderSing, renderSongs, renderTranscribe, repaintHeld, resolve, revealAnswerKeys, reverbGain, reverbNode, reverbWet, reviewItem, romanFor, runDemo, sampledPianoVoice, saveAll, saveSoon, savedDevice, scaleDisp, scaleEarOptions, scaleFormula, scheduleAccompAt, scheduleEval, scoreAnchorAt, scoreBeamGroups, scoreBeams, scoreBeatAt, scoreBind, scoreCoralBars, scoreCursorAt, scoreCursorEl, scoreCursorFollow, scoreCursorUpdate, scoreExtraBreaks, scoreFitRender, scoreFixFingerings, scoreFixPedals, scoreFollow, scoreFromMidi, scoreGeo, scoreHalt, scoreHome, scoreIdle, scoreLayout, scoreLoopStart, scoreMarks, scoreMeasureAt, scoreNightSweep, scorePaint, scorePaintEl, scorePaintIdx, scorePause, scorePitch, scorePlay, scorePointer, scoreRender, scoreRingFit, scoreSeconds, scoreSeekBar, scoreSeekTo, scoreSelectMeasures, scoreSelectRange, scoreSetHl, scoreSetLook, scoreSetTempos, scoreSetView, scoreShiftY, scoreStateText, scoreStop, scoreStyleHeader, scoreSymAt, scoreSymText, scoreSyms, scoreTermParts, scoreTip, scoreToUser, scoreToggle, scoreUnlight, scoreXLines, scoreXmlEndings, scoreXmlLayout, scoreXmlNotes, scoreZoom, seedPlacement, sesHome, sesInput, sesPrompt, sesStopPrompt, setBendFromValue, setEq, setLang, setMidi, setOverlay, shiftTypeOctave, show, showElaboration, showNotationReloadPrompt, showProgTarget, showSummary, shuffle, singGo, singKeyInput, singStopAll, slashLabel, songDir, songsFor, spellMidi, spellName, spelledName, sqAnswer, sqNew, sqPlay, sqRender, srActiveHands, srAssessFinish, srAssessLoop, srAssessStart, srBeatToX, srBest, srClef, srClick, srCoach, srCount, srCursor, srDraw, srEvents, srFocus, srGo, srHandsAvail, srKeyInput, srKeyName, srKeyNames, srKeySigG, srLearnFinish, srLearnStart, srLedger2, srListen, srMeta, srNextAssess, srNextLearn, srPaintAll, srPieceTitle, srPitch, srPlayGap, srRender, srRest, srScrollStep, srScrollX, srSelectPiece, srSetBpm, srSetMode, srShape, srSlip, srSlipNote, srStem2, srStemLine, srStepsBuild, srStopAll, srSvg, srTargets, srTimeSigG, srTol, srTopSlip, srsOf, ssAccGlyph, ssBassClef, ssBeatToX, ssBumpProgress, ssClearTrail, ssCurNote, ssCursorEl, ssDraw, ssDrawTrail, ssDrone, ssFillLevels, ssFlash, ssFlat, ssFreeLoop, ssFreeStart, ssGen, ssHintBump, ssKeyAcc, ssKeySig, ssLedger, ssMakeNote, ssMicMaybe, ssMicStart, ssMicStop, ssMidiOf, ssModeUI, ssMoveCursor, ssNatural, ssNeed, ssNewExercise, ssNextDeg, ssNoteCorrect, ssNoteFinish, ssNoteLoop, ssNoteStart, ssNotehead, ssPaint, ssPhraseGrade, ssPhraseLoop, ssPhraseStart, ssPick, ssPitchY, ssPlayIt, ssReadPitch, ssRemoveCursor, ssRender, ssScrollToCur, ssScrollToX, ssSharp, ssStem, ssStepOf, ssSvg, ssTimeSig, ssTonic, ssTrebleClef, startDrone, startMetro, startPlacement, startSession, statHTML, stopDrone, stopMetro, stopPreviews, syncAfter, syncBusy, syncCurrent, syncData, syncGen, syncId, syncIdle, syncInitial, syncInto, syncKeyboardPan, syncNewCollisions, syncNote, syncPair, syncPick, syncPref, syncPull, syncRefresh, syncRemember, syncSame, syncScrim, syncSrs, syncSrsPair, syncWrite, t, tf, theme, tl, tone, toolName, touchDay, trapFocus, trxAutoCorrelate, trxBuildMidi, trxClear, trxCloseNote, trxDownload, trxDurLabel, trxExportMidi, trxExportTxt, trxFreqToMidi, trxLoop, trxMedian, trxPlay, trxPushVar, trxRender, trxSnap, trxStart, trxStop, typeOctave, updateAccompChain, updateExplore, view0, viewHigh, wakeArm, wakeCan, wakeDrop, wakeGet, wakeInit, wakeOnGesture, wakePing, wakeSet, wakeUi, xmlEsc, $, ACCOMP_I18N, ACCOMP_PATTERNS, ACCOMP_PROGS, AN, AN_CHORDS, AN_DIA, AN_EXAMPLES, AN_MAX_BYTES, AN_MAX_NOTES, AN_MAX_XML_CHARS, AN_POPS, AN_PRACTICE_BARS, AN_PROFILE, AN_SMUFL_NOTES, AN_TABS, BASE_HIGH, BASE_LOW, BLACK_NUDGE, BLE, BLE_MIDI_CHR, BLE_MIDI_SVC, CATS, CHORDS, CHORD_DEG, CHORD_FEEL, CIRCLE, CLEF_F, CLEF_G, CLEF_SCALE, COF_COL, COF_FING, COF_MAJ, COF_MIN, COF_SCALE, COF_SOL, COMPOUND, DOCK, EK_CHORD_GAP, EK_MEL_SCALES, EK_TRIES, EX_LEDGERS, FALL, FALL_BLACK, FALL_COL, FALL_FONT, FALL_NUDGE, FALL_PAL, FALL_SEC, FALL_SEL, FALL_YOU, INTERVALS, INTRO_CH, INTRO_IV, INTRO_SC, INV_NAMES, ITEMS, ITEM_BY_ID, IVL, KEYMAP, KEY_MAJ_FIFTHS, LACC_CH, LBLUES, LDUR, LEARN_GAPS, LEARN_OLD_ORDER, LETTERS, LETTER_PC, LLET, LM, LNAT, LSPF, LSPS, LSR, LSTAVES, LT, LTEMPO, LVEL, LW_PRESETS, LW_Q, LW_R, LW_STEP, MAJOR, NOTE_SYS, PC_FLAT, PC_SHARP, PIANO_KEYS, PIANO_URLS, PIANO_WARM, PIECES, PLACEMENT, PRAC, PRAC_KEY, PROGS, PWA, RD, RD_ALL, RD_ALLIV, RD_CDEF, RD_CHQ, RD_CLEFC, RD_LH_PAT, RD_LM, RD_LV, RD_MAJ, RD_MIN, RD_REF, RD_RHU, RD_RUSH, RD_TARGET, RD_TESTN, RD_UNITS, ROMAN, ROOT_NAMES, SCALES, SCALE_DEG, SCALE_EAR_POOL, SCORE, SCORE_LOOK, SC_ARTS, SC_BASE, SC_DYN, SC_FIT, SC_PAGE_W, SC_TERMS, SES, SIDE, SONGS, SQ, SR, SR_LET, SS_FLAT_ORDER, SS_LETSEMI, SS_LEVELS, SS_MAJ, SS_MIN, SS_SHARP_ORDER, SS_SYL_MAJ, SS_SYL_MIN, SYNC, SYNC_ADD, SYNC_ID, SYNC_MAX, SYNC_NONE, SYNC_PREFS, TONES, TRX_VALS, WAKE, WAKE_IDLE_MS, _modalStack, accomp, anDomQ, blackEl, coachText, cof, cofMQ, held, heldOrder, inputOwners, isFlatKey, keyEl, liveVoices, metro, midiToFreq, overlayReturn, pc, pianoBank, pointerKey, pracFactor, pracMine, pracSounds, rdS, reduceMotion, rootName, sing, srSlipNames, srStepNo, sustained, themeMQ, todayN, trx, typingDown, view, whiteEl };
