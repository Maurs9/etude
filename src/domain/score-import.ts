import { normalizeScoreMarkingText, recognizeScoreMarkings } from './score-markings.js';
import { normalizeScoreDirectionGlyphs, scoreDetectPartHands } from './score-xml-markings.js';
import {
  AN_MAX_NOTES,
  AN_MAX_XML_CHARS,
  SC_BASE,
  anError,
  type AnHand,
  type AnMidiMeta,
  type AnParsedMidi,
  type AnParsedNote,
  type ScoreFermata,
  type ScoreGraceNote,
  type ScoreMeasure,
  type ScoreOrnamentKind,
  type ScoreSlurSpan,
  type ScoreTempoModifier,
  type ScoreTextDynamic,
  type ScoreXmlExpression,
  type ScoreXmlHarmony,
  type ScoreXmlKey,
  type ScoreXmlLayout,
  type ScoreXmlLink,
  type ScoreXmlNote,
  type ScoreXmlRest,
} from './score-types.js';

interface MidiPedalEvent { beat: number; down: boolean; order: number; track: number; }

function applyMidiSustain(notes: AnParsedNote[], channels: Map<number, MidiPedalEvent[]>, releaseOrder: WeakMap<AnParsedNote, number>, end: number) {
    for (const [channel, events] of channels) {
        events.sort((a, b) => a.beat - b.beat);
        const releases = notes.filter(n => n.channel === channel).sort((a, b) => a.end - b.end);
        let cursor = 0;
        for (let i = 0; i < events.length; i++) {
            if (!events[i].down) continue;
            const start = events[i];
            while (events[i + 1]?.down) i++;
            const stop = events[i + 1]?.beat ?? end;
            while (cursor < releases.length && releases[cursor].end < stop) {
                const note = releases[cursor++];
                // Same-track events have a written order. Across tracks at the same tick,
                // treat the pedal-down as active for the release regardless of track serialization.
                if (note.end > start.beat || (note.end === start.beat &&
                    (note.track !== start.track || (releaseOrder.get(note) ?? Infinity) > start.order)))
                    note.soundEnd = stop;
            }
        }
    }
    // A retrigger replaces the earlier sound of the same key on the same channel.
    const nextAttacks = new Map<number, number>();
    for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i], key = note.channel * 128 + note.midi;
        const next = nextAttacks.get(key);
        if (note.soundEnd !== undefined && next !== undefined) {
            if (next <= note.end) delete note.soundEnd;
            else note.soundEnd = Math.min(note.soundEnd, next);
        }
        nextAttacks.set(key, note.start);
    }
}

export function anParse(buffer: ArrayBuffer) {
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
    const sustain = new Map<number, MidiPedalEvent[]>();
    const releaseOrder = new WeakMap<AnParsedNote, number>();
    const addNote = (note: AnParsedNote) => {
        releaseOrder.set(note, pos);
        notes.push(note);
    };
    let lastTick = 0;
    for (let ti = 0; ti < tracks; ti++) {
        if (tag() !== 'MTrk')
            throw anError('midi', 'track');
        const size = u32();
        need(size);
        const end = pos + size;
        let tick = 0, running = 0, activeCount = 0;
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
                if (ch !== 9 && cmd === 176 && d1 === 64) {
                    let events = sustain.get(ch);
                    if (!events) sustain.set(ch, events = []);
                    events.push({ beat: tick / ppq, down: d2 >= 64, order: pos, track: ti });
                }
                if (ch !== 9 && (cmd === 144 || cmd === 128)) {
                    const k = ch + ':' + d1;
                    if (cmd === 144 && d2 > 0) {
                        if (notes.length + activeCount >= AN_MAX_NOTES)
                            throw anError('notes');
                        let q = active.get(k);
                        if (!q) {
                            q = [];
                            active.set(k, q);
                        }
                        q.push({ start: tick, midi: d1, vel: d2 });
                        activeCount++;
                    }
                    else {
                        const q = active.get(k);
                        if (q && q.length) {
                            const n = q.shift();
                            activeCount--;
                            if (n && tick > n.start)
                                addNote({ midi: n.midi, start: n.start / ppq, end: tick / ppq, vel: n.vel, track: ti, channel: ch });
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
                if (tick > n.start) {
                    addNote({ midi: n.midi, start: n.start / ppq, end: tick / ppq, vel: n.vel, track: ti, channel: +k.split(':')[0] }); // note-on without note-off: close at track end
                    if (notes.length > AN_MAX_NOTES)
                        throw anError('notes');
                }
        lastTick = Math.max(lastTick, tick);
    }
    if (!notes.length)
        throw anError('nonotes');
    if (notes.length > AN_MAX_NOTES)
        throw anError('notes');
    notes.sort((x, y) => x.start - y.start || x.midi - y.midi);
    if (sustain.size) applyMidiSustain(notes, sustain, releaseOrder, lastTick / ppq);
    return { ppq, format, tracks, names, meta: meta.sort((a, b) => a.beat - b.beat), notes };
}

export interface ScoreXmlLevel { part: number; staff: number; beat: number; value: number; sequence: number; }
export interface ScoreXmlMark { part: number; staff: number; beat: number; type: string; number: string; sequence: number; }
export interface ScoreXmlLine extends ScoreXmlMark { kind: string; }
export interface ScoreXmlDynamic { value?: number | null; hit?: number; }
export const SCORE_STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const BEAT_UNIT_QUARTERS = new Map(Object.entries({
    maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: .5,
    '16th': .25, '32nd': .125, '64th': .0625, '128th': .03125, '256th': .015625,
    '512th': .0078125, '1024th': .00390625,
}));
const TEMPO_MODIFIER_TERMS: Readonly<Record<string, ScoreTempoModifier['kind']>> = {
    ritardando: 'rit',
    rallentando: 'rall',
    ritenuto: 'ritenuto',
    accelerando: 'accel',
    stringendo: 'stringendo',
    atempo: 'atempo',
    tempoprimo: 'atempo',
    menomosso: 'meno',
    slower: 'meno',
    piumosso: 'piu',
    calando: 'calando',
    smorzando: 'smorzando',
};
const TEXT_DYNAMIC_TERMS: Readonly<Record<string, ScoreTextDynamic['kind']>> = {
    crescendo: 'cresc',
    diminuendo: 'dim',
    morendo: 'morendo',
    calando: 'calando',
    smorzando: 'smorzando',
};
const ORNAMENT_KIND_MAP: Readonly<Record<string, ScoreOrnamentKind>> = {
    'trill-mark': 'trill',
    mordent: 'mordent',
    'inverted-mordent': 'inverted-mordent',
    turn: 'turn',
};
function positiveTempo(text: string | null): number | null {
    const bpm = Number(text);
    return bpm > 0 && Number.isFinite(bpm) ? bpm : null;
}
export function scoreXmlNotes(doc: Document, captureDifficulty = false) {
    const difficultyRests: ScoreXmlRest[] = [];
    const clefChangesByMeasure: number[] = [];
    const { hands: partHands, sisters: partSisterMap } = scoreDetectPartHands(doc);
    const notes: ScoreXmlNote[] = [], tempos: { beat: number; bpm: number; }[] = [], measures: ScoreMeasure[] = [], keys: ScoreXmlKey[] = [], harmoniesByPart: ScoreXmlHarmony[][] = [], dynamics: ScoreXmlLevel[] = [], transients: ScoreXmlLevel[] = [], wedgeEvents: ScoreXmlMark[] = [], pedalEvents: { part: number; staff: number; beat: number; type: string; sequence: number; }[] = [], dolces: { part: number; staff: number; beat: number; on: boolean; sequence: number; }[] = [], partEnds: number[] = [];
    const linkOpen = new Map<string, ScoreXmlNote>(), linkPairs: { kind: string; a: ScoreXmlNote; b: ScoreXmlNote; style: string; }[] = [], lineEvents: ScoreXmlLine[] = []; // slurs, glissandi and slides by note; dashes and brackets by beat
    const tempoModifiers: ScoreTempoModifier[] = [], textDynamics: ScoreTextDynamic[] = [], rawFermatas: ScoreFermata[] = [];
    let malformed = false;
    const lastNote = (match: (n: ScoreXmlNote) => boolean) => { for (let i = notes.length - 1; i >= 0; i--)
        if (match(notes[i]))
            return notes[i]; return undefined; };
    const DYN: Record<string, number> = { ppp: 28, pp: 42, p: 56, mp: 70, mf: 84, f: 98, ff: 112, fff: 122, sfz: 115, fz: 115, rfz: 115 };
    const direct = (node: Element, name: string) => [...node.children].filter((c) => c.localName === name), child = (node: Element, name: string): Element | null => direct(node, name)[0] || null;
    const writtenTempos: { beat: number; bpm: number }[] = [], tempoWords = new Set<string>();
    const metronomeTempo = (mark: Element) => {
        const perMinute = positiveTempo(child(mark, 'per-minute')?.textContent ?? null);
        const unit = BEAT_UNIT_QUARTERS.get(child(mark, 'beat-unit')?.textContent?.trim() ?? '');
        if (perMinute === null || unit === undefined) return null;
        const dots = direct(mark, 'beat-unit-dot').length;
        const bpm = perMinute * unit * (2 - 2 ** -dots);
        return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
    };
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
        const bpm = positiveTempo(sound.getAttribute('tempo'));
        if (bpm !== null)
            tempos.push({ beat: Math.max(0, beat), bpm });
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
        let groups: number[] | undefined;
        const clefs = new Map<number, { sign: string; line: number }>();
        const partHarmonies: ScoreXmlHarmony[] = [];
        harmoniesByPart.push(partHarmonies);
        const gracePending = new Map<string, ScoreGraceNote[]>();
        const graceKey = (staff: number, voice: number) => staff + ':' + voice;
        let mi = 0;
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
                        if (captureDifficulty) {
                            const beats = child(tm, 'beats')?.textContent?.trim() ?? '';
                            groups = /^\d+(?:\s*\+\s*\d+)+$/.test(beats) ? beats.split('+').map(Number) : undefined;
                            if (groups?.every(group => group > 0)) {
                                num = groups.reduce((sum, group) => sum + group, 0);
                                groups = groups.map(group => group * 4 / den);
                            } else groups = undefined;
                        }
                    }
                    if (captureDifficulty) for (const clef of direct(node, 'clef')) {
                        const staff = Number(clef.getAttribute('number')) || 1;
                        const sign = child(clef, 'sign')?.textContent?.trim() ?? '';
                        const line = number(child(clef, 'line'));
                        const prevClef = clefs.get(staff);
                        if (prevClef && (prevClef.sign !== sign || prevClef.line !== line)) {
                            clefChangesByMeasure[mi] = (clefChangesByMeasure[mi] ?? 0) + 1;
                        }
                        clefs.set(staff, { sign, line });
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
                if (name === 'harmony') {
                    const rootEl = child(node, 'root');
                    const rStep = (child(rootEl ?? node, 'root-step')?.textContent || '').trim().toUpperCase();
                    if (rootEl && rStep in SCORE_STEP) {
                        const rAlt = number(child(rootEl, 'root-alter'));
                        const root = ((SCORE_STEP[rStep] + rAlt) % 12 + 12) % 12;
                        const kindEl = child(node, 'kind');
                        const kind = (kindEl?.textContent || '').trim().toLowerCase();
                        const text = (kindEl?.getAttribute('text') || '').trim();
                        const bassEl = child(node, 'bass');
                        const bStep = bassEl ? (child(bassEl, 'bass-step')?.textContent || '').trim().toUpperCase() : '';
                        const bass = bassEl && bStep in SCORE_STEP ? ((SCORE_STEP[bStep] + number(child(bassEl, 'bass-alter'))) % 12 + 12) % 12 : null;
                        const offset = number(child(node, 'offset')) / division;
                        partHarmonies.push({ beat: Math.max(measureStart, at + offset), root, kind, bass, text });
                    }
                }
                if (name === 'direction') {
                    const offset = number(child(node, 'offset')) / division, beat = at + offset, staff = number(child(node, 'staff'));
                    const sounds = direct(node, 'sound'), playbackTempo = sounds.map(sound => positiveTempo(sound.getAttribute('tempo'))).find(bpm => bpm !== null);
                    direct(node, 'direction-type').forEach((dt) => {
                        for (const mark of direct(dt, 'metronome')) {
                            const bpm = metronomeTempo(mark);
                            if (bpm !== null) writtenTempos.push({ beat: Math.max(0, beat), bpm });
                        }
                        for (const word of direct(dt, 'words')) {
                            const text = word.textContent?.trim() ?? '';
                            if (playbackTempo !== undefined && /^\d+(?:[.,]\d+)?$/.test(text) && Number(text.replace(',', '.')) === playbackTempo)
                                tempoWords.add(text);
                        }
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
                        if (words.trim()) {
                            const dirBeat = Math.max(0, beat);
                            const normWords = normalizeScoreMarkingText(words);
                            const meanings = recognizeScoreMarkings(words, { context: 'direction', allowPartial: true });
                            const hasPoco = meanings.some((m) => m.term === 'poco');
                            const hasMolto = meanings.some((m) => m.term === 'molto');
                            const amount: ScoreTempoModifier['amount'] = hasMolto ? 'molto' : hasPoco ? 'poco' : undefined;
                            for (const m of meanings) {
                                const prefix = normWords.slice(Math.max(0, m.at - 5), m.at);
                                if (/\bnon\s+$/.test(prefix)) continue;
                                const modKind = TEMPO_MODIFIER_TERMS[m.term];
                                if (modKind)
                                    tempoModifiers.push(amount ? { beat: dirBeat, kind: modKind, amount } : { beat: dirBeat, kind: modKind });
                                const dynKind = TEXT_DYNAMIC_TERMS[m.term];
                                if (dynKind)
                                    textDynamics.push({ part: pi, staff: 0, beat: dirBeat, kind: dynKind });
                            }
                        }
                    });
                    sounds.forEach((sound) => addSound(sound, pi, 0, beat));
                }
                if (name === 'sound')
                    addSound(node, pi, 0, at);
                if (name === 'backup')
                    at -= span(child(node, 'duration')) / division;
                if (name === 'forward') {
                    at += span(child(node, 'duration')) / division;
                    max = Math.max(max, at);
                }
                if (name === 'note') {
                    const grace = !!child(node, 'grace'), duration = span(child(node, 'duration')) / division, chord = !!child(node, 'chord'), start = chord ? lastStart : at;
                    const voice = number(child(node, 'voice'), 1) || 1, staff = number(child(node, 'staff'), 1) || 1, pitch = child(node, 'pitch'), key = graceKey(staff, voice);
                    if (captureDifficulty && !pitch && child(node, 'rest') && duration > 0) {
                        const hand = staves >= 2 ? (staff === 1 ? 'rh' : 'lh') : (partHands.get(pi) ?? null);
                        difficultyRests.push({ start, end: start + duration, part: pi, staff, voice, hand });
                    }
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
                                const hand = staves >= 2 ? (staff === 1 ? 'rh' : 'lh') : (staff === 2 ? 'lh' : (partHands.get(pi) ?? null)), stop = [...node.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'stop');
                                const prev = stop && lastNote((n) => n.part === pi && n.staff === staff && n.voice === voice && n.midi === midi && Math.abs(n.end - start) < .001);
                                const fg = number(node.querySelector('fingering')), nd = [...node.querySelectorAll('notations > dynamics')].map(dynamicInfo).find(Boolean), attr = dynamicValue(node.getAttribute('dynamics'));
                                const arts = new Set([...node.querySelectorAll('notations > articulations > *')].map((a) => a.localName));
                                const ornamentEls = [...node.querySelectorAll('notations > ornaments > *')];
                                let ornament: ScoreOrnamentKind | undefined;
                                for (const el of ornamentEls) {
                                    const mapped = ORNAMENT_KIND_MAP[el.localName];
                                    if (mapped) {
                                        ornament = mapped;
                                        break;
                                    }
                                }
                                const hasFermata = !!node.querySelector('notations > fermata');
                                let own: ScoreXmlNote | null = null;
                                if (prev) {
                                    prev.end = start + duration;
                                    own = prev;
                                    if (hasFermata && duration > 0) {
                                        prev.fermata = true;
                                        rawFermatas.push({ beat: Math.max(0, start), duration });
                                    }
                                }
                                else if (duration > 0) {
                                    const n: ScoreXmlNote = { midi, start, end: start + duration, vel: 90, hand, part: pi, staff, voice, type: child(node, 'type')?.textContent || '', art: {
                                            staccato: arts.has('staccato'), staccatissimo: arts.has('staccatissimo'), accent: arts.has('accent'), strongAccent: arts.has('strong-accent'), tenuto: arts.has('tenuto')
                                        },
                                        arpeggiate: !!node.querySelector('notations > arpeggiate') };
                                    if (fg > 0 && fg < 6)
                                        n.finger = fg;
                                    if (ornament)
                                        n.ornament = ornament;
                                    if (hasFermata) {
                                        n.fermata = true;
                                        rawFermatas.push({ beat: Math.max(0, start), duration });
                                    }
                                    if (captureDifficulty) {
                                        const clef = clefs.get(staff), letter = step ? 'CDEFGAB'.indexOf(step) : -1;
                                        const center = clef?.sign === 'G' ? 4 * 7 + 4 : clef?.sign === 'F' ? 3 * 7 + 3 : clef?.sign === 'C' ? 4 * 7 : undefined;
                                        const bottom = center === undefined || !clef?.line ? undefined : center - (clef.line - 1) * 2;
                                        const staffStep = oct * 7 + letter;
                                        const trills = ornamentEls.filter(el => el.localName === 'trill-mark' || el.localName === 'tremolo').length;
                                        n.difficulty = {
                                            dotted: !!child(node, 'dot'), tuplet: !!child(node, 'time-modification'),
                                            accidentals: child(node, 'accidental') ? 1 : 0,
                                            ornaments: ornamentEls.length,
                                            ...(trills ? { trills } : {}),
                                            ledgerLines: bottom === undefined || letter < 0 ? undefined
                                                : Math.floor(Math.max(0, bottom - staffStep, staffStep - bottom - 8) / 2),
                                        };
                                    }
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
                                if (own && node.querySelector(':scope > notehead[parentheses="yes"]'))
                                    (own.parenthesizedAt ??= []).push(start);
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
                measures.push({ number: measure.getAttribute('number') || String(measures.length + 1), start: measureStart, end: max, num, den, ...(groups ? { groups } : {}) });
            measureStart = max;
            mi++;
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
        if (last === -Infinity) {
            const sister = partSisterMap.get(part);
            if (sister != null) {
                persistent.forEach((e) => {
                    if (e.part !== sister || e.beat > beat + .001)
                        return;
                    const spec = e.staff === 0 ? 1 : 0;
                    if (e.beat > last + .001 || (Math.abs(e.beat - last) < .001 && (spec > specificity || (spec === specificity && e.sequence > seq)))) {
                        value = e.value;
                        last = e.beat;
                        specificity = spec;
                        seq = e.sequence;
                    }
                });
            }
        }
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
        const sisterPart = partSisterMap.get(n.part);
        const hasPartWedges = wedges.some((w) => w.part === n.part);
        const wedge = wedges.filter((w) => (same(w, n) || (sisterPart != null && w.part === sisterPart && !hasPartWedges)) && n.start >= w.start - .001 && n.start <= w.end + .001).pop();
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
        const sister = partSisterMap.get(n.part);
        let soundEnd = n.start + (n.end - n.start) * (n.soundRatio ?? 1), pedal = pedalSegments.find((p) => (p.part === n.part || (sister != null && p.part === sister)) && (p.start <= n.start + .001 || p.start < soundEnd - .001) && p.end >= soundEnd - .001 && p.end > n.start + .001);
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
    const noteIndexMap = new Map<ScoreXmlNote, number>();
    sorted.forEach((n, index) => noteIndexMap.set(n, index));
    const links = linkPairs.filter((l) => l.a.staff !== l.b.staff).map((l) => ({ kind: l.kind, a: noteIndexMap.get(l.a) ?? -1, b: noteIndexMap.get(l.b) ?? -1, style: l.style })).filter((l) => l.a >= 0 && l.b >= 0);
    const slurs: ScoreSlurSpan[] = linkPairs
        .filter((l) => l.kind === 'slur')
        .map((l) => ({
            part: l.a.part,
            staff: l.a.staff,
            voice: l.a.voice,
            startBeat: l.a.start,
            endBeat: l.b.end,
            startNoteIndex: noteIndexMap.get(l.a) ?? -1,
            endNoteIndex: noteIndexMap.get(l.b) ?? -1,
        }))
        .filter((s) => s.startNoteIndex >= 0 && s.endNoteIndex >= 0 && s.endBeat > s.startBeat);
    const dedupedTempoModifiers: ScoreTempoModifier[] = [];
    tempoModifiers.slice().sort((a, b) => a.beat - b.beat).forEach((m) => {
        const last = dedupedTempoModifiers.find((existing) => existing.kind === m.kind && Math.abs(existing.beat - m.beat) <= 0.001);
        if (last) {
            if (!last.amount && m.amount) last.amount = m.amount;
            return;
        }
        dedupedTempoModifiers.push({ ...m });
    });
    const fermatas: ScoreFermata[] = [];
    rawFermatas.slice().sort((a, b) => a.beat - b.beat).forEach((f) => {
        const last = fermatas[fermatas.length - 1];
        if (last && Math.abs(last.beat - f.beat) <= 0.001) {
            last.duration = Math.max(last.duration, f.duration);
            return;
        }
        fermatas.push({ beat: f.beat, duration: Math.max(0.05, f.duration) });
    });
    const dedupedTextDynamics: ScoreTextDynamic[] = [];
    textDynamics.slice().sort((a, b) => a.beat - b.beat).forEach((d) => {
        if (dedupedTextDynamics.some((existing) => existing.part === d.part && existing.kind === d.kind && Math.abs(existing.beat - d.beat) <= 0.001))
            return;
        dedupedTextDynamics.push({ ...d });
    });
    const expression: ScoreXmlExpression = {
        slurs,
        tempoModifiers: dedupedTempoModifiers,
        fermatas,
        textDynamics: dedupedTextDynamics,
    };
    const harmonies = (harmoniesByPart.find((list) => list.length > 0) || []).slice().sort((a, b) => a.beat - b.beat);
    const explicitBeats = new Set(tempos.map(tempo => tempo.beat));
    tempos.push(...writtenTempos.filter(tempo => !explicitBeats.has(tempo.beat)));
    if (captureDifficulty) {
        measures.forEach((measure, index) => {
            if (clefChangesByMeasure[index]) measure.clefChanges = clefChangesByMeasure[index];
            const pedalCount = pedalEvents.filter(e => e.beat >= measure.start - 1e-6 &&
                (index === measures.length - 1 ? e.beat <= measure.end + 1e-6 : e.beat < measure.end - 1e-6)).length;
            if (pedalCount) measure.pedalChanges = pedalCount;
        });
    }
    return { notes: sorted, tempos: tempos.filter(e => Number.isFinite(e.beat)), measures, keys, harmonies, links, tempoWords, expression, ...(captureDifficulty ? { difficultyRests } : {}) };
}

interface AnZipEntry { method: number; C: number; U: number; off: number; }
interface AnZipEntryData extends AnZipEntry { data: Uint8Array<ArrayBuffer>; }
export async function anMxlPreflight(buf: ArrayBuffer, getInflatedSize: (bytes: Uint8Array<ArrayBuffer>, limit: number) => Promise<number | null> = defaultInflatedSize)  {
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
        const n = await getInflatedSize(e.data, e.U);
        if (n === null)
            throw anError('mxlbig'); // without a stream, this archive cannot be proven safe before JSZip inflates it
        if (n !== e.U)
            throw bad();
        left -= n;
    }
}

export async function defaultInflatedSize(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<number | null> {
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
}

// MusicXML distances are tenths of a staff space; OSMD distances are staff spaces.
// Keep physical page/staff sizing when supplied, with bounded fallbacks for incomplete or malformed layout hints.
export interface AnXmlTitleRun { text: string; style: string; weight: string; }
export interface AnXmlPageLayout {
    base: number; width: number; pageWidth: number; pageHeight: number;
    left?: number; right?: number; top?: number; bottom?: number;
    titleSize?: number; subtitleSize?: number; composerSize?: number;
    titleRuns?: AnXmlTitleRun[];
    staffGap?: number | null; systemGap?: number | null;
}
export function scoreXmlLayout(doc: Document): AnXmlPageLayout | null {
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
// Normalize engraving-only export artifacts without changing any note, direction, or repeat timing.
export function scoreXmlEngraving(doc: Document) {
    doc.querySelectorAll('direction').forEach((direction) => {
        const values = [...direction.querySelectorAll(':scope > direction-type > metronome > per-minute')];
        const suffixes = [...direction.querySelectorAll(':scope > direction-type > words')].filter((w) => /^\.\d+$/.test(w.textContent.trim()));
        if (values.length !== 1 || suffixes.length !== 1 || !/^\d+$/.test(values[0].textContent.trim()))
            return;
        // A decimal may be split into a metronome integer and bold words in the SAME direction.
        // Concatenate the written value, never infer it from <sound> (dotted-half beats have different BPM).
        values[0].textContent = values[0].textContent.trim() + suffixes[0].textContent.trim();
        const type = suffixes[0].parentElement;
        suffixes[0].remove();
        if (type && !type.children.length)
            type.remove();
    });
    const signature = (el: Element): string => JSON.stringify([el.localName, [...el.attributes].map((a) => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0])), [...el.children].map(signature), el.children.length ? '' : el.textContent.trim()]);
    doc.querySelectorAll('part').forEach((part) => {
        let divisions = 1;
        [...part.children].filter((n) => n.localName === 'measure').forEach((measure) => {
            let at = 0;
            const harmonies = new Set<string>();
            [...measure.children].forEach((node) => {
                if (node.localName === 'attributes')
                    divisions = Number(node.querySelector('divisions')?.textContent) || divisions;
                else if (node.localName === 'harmony') {
                    // Some exporters write the identical harmony twice before the same note (Ballade, bar 17).
                    // Compare the complete element, including staff and offset; repeats at later onsets stay intact.
                    const key = at + '|' + signature(node);
                    if (harmonies.has(key))
                        node.remove();
                    else
                        harmonies.add(key);
                }
                else if (node.localName === 'backup' || node.localName === 'forward')
                    at += Number(node.querySelector('duration')?.textContent || 0) / divisions * (node.localName === 'backup' ? -1 : 1);
                else if (node.localName === 'note' && !node.querySelector('chord,grace'))
                    at += Number(node.querySelector('duration')?.textContent || 0) / divisions;
            });
        });
    });
    doc.querySelectorAll('ending').forEach((ending) => {
        let label = ending.textContent;
        if (!/(?:&lt;|<)\/?(?:font|b|i|u|span)\b/i.test(label))
            return;
        const entities: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
        for (let i = 0; i < 3; i++) {
            const decoded = label.replace(/&([a-z]+|#x[\da-f]+|#\d+);/gi, (entity, key: string) => {
                if (key[0] !== '#')
                    return entities[key.toLowerCase()] ?? entity;
                const value = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
                return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
            });
            if (decoded === label)
                break;
            label = decoded;
        }
        // XML parsing is inert: neither markup nor event attributes enter the live document. Keep only text.
        const parsed = new DOMParser().parseFromString('<label>' + label + '</label>', 'application/xml');
        if (!parsed.querySelector('parsererror'))
            ending.textContent = parsed.documentElement.textContent;
    });
}
export async function anReadXml(file: File, title: string, deps: { captureDifficulty?: boolean; loadMxlToXml: (buf: ArrayBuffer) => Promise<string>; inflatedSize?: (bytes: Uint8Array<ArrayBuffer>, limit: number) => Promise<number | null> })  {
    let xml: string;
    if (/\.mxl$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        await anMxlPreflight(buf, deps.inflatedSize ?? defaultInflatedSize);
        try {
            xml = await deps.loadMxlToXml(buf);
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
    const layout = scoreXmlLayout(doc);
    scoreXmlEngraving(doc);
    const clean = anXmlTidy(doc, title);
    xml = new XMLSerializer().serializeToString(doc);
    const r = scoreXmlNotes(doc, deps.captureDifficulty);
    if (!r.notes.length)
        throw anError('nonotes');
    if (r.notes.length > AN_MAX_NOTES)
        throw anError('notes');
    return { kind: 'xml' as const, title: clean || title, label: file.name, xml, layout, ...r };
}
// MuseScore exports read cleanly in the engraver: real title and composer in the header (not the file name),
// no editorial footnotes over the first staff, SMuFL note glyphs readable in web fonts, no generic "Instr. P1"
// label and "Ped. … *" marks instead of pedal lines that collide with the left hand's fingering.
export const AN_SMUFL_NOTES = { '\uE1D2': '\uD834\uDD5D', '\uECA2': '\uD834\uDD5D', '\uE1D3': '\uD834\uDD5E', '\uECA3': '\uD834\uDD5E', '\uE1D5': '\u2669', '\uECA5': '\u2669',
    '\uE1D4': '\uD834\uDD5E', '\uECA4': '\uD834\uDD5E', '\uE1D6': '\u2669', '\uECA6': '\u2669',
    '\uE1D7': '\u266A', '\uECA7': '\u266A', '\uE1D8': '\u266A', '\uECA8': '\u266A', '\uE1D9': '\u266C', '\uECA9': '\u266C', '\uE1DA': '\u266C', '\uECAA': '\u266C', '\uE1E7': '.', '\uECB7': '.', '\uE520': 'p', '\uE522': 'f' };
// Some exports leave an open last ending before the next forward repeat. Do not let it span the next section.
// Explicit stop/discontinue pairs always win, including multi-measure endings crossing a repeat boundary.
export function scoreXmlEndings(doc: Document) {
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
export function anXmlTidy(doc: Document, fallback: string) {
    normalizeScoreDirectionGlyphs(doc);
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
        // Length/position alone must not delete a verified musical instruction (e.g. Beethoven's
        // complete "Si deve suonare..." direction). The recognizer rejects unknown editorial prose.
        if (!t || recognizeScoreMarkings(t, { context: 'direction' }).length || !(t.length >= 60 || editorial(t) || footnote(t, y <= -80) || (t.length >= 20 && y <= -90) || w.textContent.split('\n').filter((s: string) => s.trim()).length >= 3))
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
