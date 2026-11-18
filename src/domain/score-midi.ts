import { scorePitchXml } from './theory.js';
import {
  anError,
  xmlEsc,
  type AnHand,
  type AnHandAssignment,
  type AnMidiMeta,
  type AnParsedNote,
  type ScoreMeasure,
} from './score-types.js';

const scorePitch = scorePitchXml;

export interface ScoreMidiNote { midi: number; start: number; end: number; vel: number; track: number; channel: number; hand: AnHand; }
export type ScoreMidiTime = Extract<AnMidiMeta, { type: 'time' }>;
export type ScoreMidiChange = ScoreMidiTime | { type: 'key'; beat: number; fifths: number; minor: boolean; };
export interface ScoreEngraveGroup { staff: number; start: number; end: number; notes: (ScoreMidiNote & { staff: number; })[]; }
export interface ScoreEngraveVoice { groups: ScoreEngraveGroup[]; staff: number; secondary: boolean; stem: string; }
export interface ScoreEngraveEvent { group: ScoreEngraveGroup | null; pos: number; d: number; type: string; dot: number; from: boolean; to: boolean; beam?: string; }
export interface ScoreFromMidiResult { xml: string; midiGrid: number; measures: ScoreMeasure[]; tempos: { beat: number; bpm: number }[]; tempoFromFile: boolean; }
export function scoreMidiToXml(parsed: { meta: AnMidiMeta[]; notes: ScoreMidiNote[]; }, title: string, opt: { grid: number; keys: { beat: number; fifths: number; minor: boolean; }[]; composer?: string; pickup?: number; }, partLabel: string): ScoreFromMidiResult {
    const isTime = (e: AnMidiMeta): e is ScoreMidiTime => e.type === 'time';
    const grid = opt.grid || 4, events = parsed.meta || [], timeEvents = events.filter(isTime);
    let div = grid;
    while (timeEvents.some((e) => (4 * div) % e.den) && div < grid * 64)
        div *= 2;
    const k = div / grid;
    const outMeasures: ScoreMeasure[] = [];
    const tempos = events.filter((e): e is Extract<AnMidiMeta, { type: 'tempo' }> => e.type === 'tempo').map((e) => ({ beat: e.beat, bpm: e.bpm }));
    const tempoFromFile = tempos.length > 0;
    const rawTempos = tempos.sort((a, b) => a.beat - b.beat);
    if (!rawTempos.length || rawTempos[0].beat > 0)
        rawTempos.unshift({ beat: 0, bpm: 120 });
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
    const upbeat = opt.pickup && opt.pickup > 0 ? Math.round(opt.pickup * div) : 0;
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
        const bar = upbeat && number === 1 ? Math.min(upbeat, num * 4 * div / den) : num * 4 * div / den;
        const next = changes[ci], length = Math.min(bar, next ? next.pos - at : Infinity), label = upbeat ? number - 1 : number;
        if (length <= 0 || !Number.isInteger(length))
            throw anError('meter');
        const stop = at + length;
        outMeasures.push({ number: String(label), start: at / div, end: stop / div, num, den });
        xml += '<measure number="' + label + '"' + (upbeat && number === 1 ? ' implicit="yes"' : '') + '>';
        if (number === 1 || keyChanged || timeChanged)
            xml += '<attributes>' + (number === 1 ? '<divisions>' + div + '</divisions>' : '') + (keyChanged ? '<key><fifths>' + fifths + '</fifths><mode>' + (minor ? 'minor' : 'major') + '</mode></key>' : '') + (timeChanged ? '<time><beats>' + num + '</beats><beat-type>' + den + '</beat-type></time>' : '') + (number === 1 ? (single ? (used[0] === 2 ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line></clef>') : '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>') : '') + '</attributes>';
        for (const t of rawTempos.filter((e) => e.beat >= beat - 1e-9 && e.beat < stop / div))
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
    const xmlOut = '<?xml version="1.0"?><score-partwise version="3.1">' + (title ? '<work><work-title>' + xmlEsc(title) + '</work-title></work>' : '') + (opt.composer ? '<identification><creator type="composer">' + xmlEsc(opt.composer) + '</creator></identification>' : '') + '<part-list><score-part id="P1"><part-name>' + xmlEsc(partLabel) + '</part-name></score-part></part-list><part id="P1">' + xml + '</part></score-partwise>';
    return { xml: xmlOut, midiGrid: grid, measures: outMeasures, tempos: rawTempos, tempoFromFile };
}
// Beam runs of eighths and shorter inside one beat group of the bar; rests and longer values break a run.
export function scoreBeams(evs: ScoreEngraveEvent[], at: number, len: number) {
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
export function anAssignHands(notes: AnParsedNote[], mode: string): AnHandAssignment {
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
