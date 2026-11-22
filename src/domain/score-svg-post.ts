import type { ScoreRenderer } from './notation.js';
import { SC_BASE, type ScoreXmlLayout } from './score-types.js';

export function scoreStyleHeader(engine: ScoreRenderer, layout: ScoreXmlLayout | null) {
    const node = engine.getTitleNode(), runs = layout && layout.titleRuns;
    if (!node || !runs || !runs.length)
        return;
    const text = node.localName === 'text' ? node : node.querySelector('text');
    if (!text || (text.textContent || '').trim() !== runs.map((r) => r.text).join('').trim())
        return;
    const spans = runs.map((r) => { const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); span.textContent = r.text; span.setAttribute('font-style', r.style); span.setAttribute('font-weight', r.weight); return span; });
    text.replaceChildren(...spans);
}

export function scoreRingFit(z: number) { (document).querySelectorAll('.sc-defs feMorphology').forEach((f) => { if (f instanceof SVGElement)
    f.setAttribute('radius', (Number(f.dataset.px) / (z || SC_BASE)).toFixed(2)); }); }
const svgEpochs = new WeakMap<SVGSVGElement, number>();
export function bumpScoreSvgEpoch(svg: SVGSVGElement | null | undefined): void {
    if (svg) svgEpochs.set(svg, (svgEpochs.get(svg) ?? 0) + 1);
}
export function scoreNightSweep(box: HTMLElement, ink: string) {
    const black = /^(#000|#000000|black|rgb\(0,\s*0,\s*0\))$/i;
    box.querySelectorAll('svg').forEach(bumpScoreSvgEpoch);
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

export function scoreVendorField(v: unknown, k: string): unknown { return typeof v === 'object' && v !== null ? Reflect.get(v, k) : undefined; }
export function scoreVendorList(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }
export interface ScorePedalBox { left: number; right: number; top: number; bottom: number; group?: Element | null; press?: boolean; }
const pedalLayouts = new WeakMap<SVGSVGElement, string>();
function pedalLayoutSignature(svg: SVGSVGElement): string {
    const ctm = svg.getScreenCTM();
    return [ctm?.a, ctm?.b, ctm?.c, ctm?.d, svg.childElementCount, svgEpochs.get(svg) ?? 0].join('|');
}
export function rememberScorePedalLayout(box: HTMLElement): void {
    if (box.dataset.pedalUnresolved !== '0') return;
    box.querySelectorAll('svg').forEach(svg => {
        if (pedalLayouts.has(svg)) pedalLayouts.set(svg, pedalLayoutSignature(svg));
    });
}
export function scoreFixPedalsDefault(box: HTMLElement) {
    let unresolved = 0;
    box.querySelectorAll('svg').forEach((svg) => {
        const marks = [...svg.querySelectorAll('.vf-sc-pedal path')].filter((p) => p instanceof SVGElement), ctm = svg.getScreenCTM();
        if (!marks.length || !ctm || !ctm.d)
            return;
        const signature = () => pedalLayoutSignature(svg);
        // Keep an already solved, unchanged SVG exact. Measuring rounded transforms
        // again introduces subpixel drift; changed ink or scale still gets a fresh pass.
        if (pedalLayouts.get(svg) === signature()) return;
        const unresolvedBefore = unresolved;
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
        const gap = Math.max(1, Math.abs(ctm.d) * 2.5), limit = Math.abs(ctm.a) * 40, placed: ScorePedalBox[] = [];
        let page = svg.getBoundingClientRect();
        const expandPageBottom = (neededBottom: number) => {
            const extraPx = Math.ceil(neededBottom - page.bottom + gap);
            if (extraPx <= 0) return false;
            const extraSvg = extraPx / Math.abs(ctm.d);
            const vb = svg.getAttribute('viewBox');
            const hAttr = parseFloat(svg.getAttribute('height') || '');
            if (vb) {
                const parts = vb.trim().split(/[\s,]+/).map(Number);
                if (parts.length === 4 && parts.every(Number.isFinite) && parts[3] > 0) {
                    const nextVbH = parts[3] + extraSvg;
                    svg.setAttribute('viewBox', `${parts[0]} ${parts[1]} ${parts[2]} ${nextVbH.toFixed(3)}`);
                    if (Number.isFinite(hAttr) && hAttr > 0)
                        svg.setAttribute('height', (hAttr * (nextVbH / parts[3])).toFixed(3));
                    page = svg.getBoundingClientRect();
                    return true;
                }
            }
            if (Number.isFinite(hAttr) && hAttr > 0) {
                svg.setAttribute('height', (hAttr + extraSvg).toFixed(3));
                page = svg.getBoundingClientRect();
                return true;
            }
            return false;
        };
        const cross = (a: ScorePedalBox, b: ScorePedalBox, pad = gap) => a.right + pad > b.left && a.left - pad < b.right && a.bottom + pad > b.top && a.top - pad < b.bottom;
        const obstacles: ScorePedalBox[] = [...svg.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-ledgers path,.vf-ledgers line,.vf-modifiers path,.vf-stavetie path,path.vf-stavetie,.sc-xline,.sc-note-parentheses path,text')].filter((n) => !n.closest('.vf-sc-pedal')).flatMap((n) => {
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
        const inkBottoms = new Map<unknown, number>();
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
            const line = V(owner, 'staffLine'), local = measures.find((m) => V(m, 'parentSourceMeasure') === V(measure, 'parentSourceMeasure')) || measure;
            const lp = pos(line), staffHeight = Number(V(line, 'StaffHeight'));
            const staffBottom = lp && Number.isFinite(staffHeight) ? ctm.f + (lp.y + staffHeight) * 10 * ctm.d : null;
            let inkBottom = inkBottoms.get(local);
            if (staffBottom != null && inkBottom == null) {
                inkBottom = staffBottom;
                const nodes: SVGElement[] = [];
                scoreVendorList(V(local, 'staffEntries')).forEach((entry) => {
                    scoreVendorList(V(entry, 'FingeringEntries')).forEach((f) => { const n = V(f, 'SVGNode'); if (n instanceof SVGElement) nodes.push(n); });
                    scoreVendorList(V(entry, 'graphicalVoiceEntries')).forEach((voice) => {
                        const vf = V(voice, 'vfStaveNote') || V(voice, 'mVexFlowStaveNote'), get = V(vf, 'getAttribute');
                        const n: unknown = typeof get === 'function' ? get.call(vf, 'el') : null;
                        if (n instanceof SVGElement)
                            nodes.push(...n.querySelectorAll<SVGElement>('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-modifiers'));
                    });
                });
                nodes.forEach((n) => { const b = n.getBoundingClientRect(); if (b.width || b.height) inkBottom = Math.max(inkBottom ?? staffBottom, b.bottom); });
                inkBottoms.set(local, inkBottom);
            }
            // OSMD uses one skyline for the entire system, even when a low fingering is in another bar.
            // Anchor each endpoint to its own bass ink instead of preserving that unnecessarily distant row.
            // Keep the native press/release baseline difference and search only below the owning staff.
            const all = obstacles.concat(placed);
            let found = false;
            const tryPlace = (vLimit: number, hLimit: number, pad: number) => {
                const preferred = inkBottom == null ? 0 : inkBottom + pad + (release ? Math.abs(ctm.d) * 3 : 0) - r.top;
                const minY = Math.max(page.top + pad - r.top, -vLimit, staffBottom == null ? -Infinity : staffBottom + pad - r.top, sp ? ctm.f + sp.y * 10 * ctm.d - r.top : -Infinity);
                const maxY = Math.min(page.bottom - pad - r.bottom, vLimit, np ? ctm.f + np.y * 10 * ctm.d - pad - r.bottom : Infinity);
                if (minY > maxY) return false;
                const mlCur = mp ? ctm.e + mp.x * 10 * ctm.a - hLimit : -Infinity;
                const mrCur = mp ? ctm.e + (mp.x + Number(V(V(V(measure, 'PositionAndShape'), 'Size'), 'width'))) * 10 * ctm.a + hLimit : Infinity;
                const ys = [...new Set([preferred, 0, minY, maxY, ...all.flatMap((o) => [o.bottom + pad - r.top, o.top - pad - r.bottom])])].filter((y) => y >= minY && y <= maxY).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
                for (const y of ys) {
                    const row = all.filter((o) => r.bottom + y + pad > o.top && r.top + y - pad < o.bottom), afterPress = release && row.some((o) => o.group === group && o.press);
                    const xs = [...new Set([0, ...row.flatMap((o) => [o.right + pad - r.left, o.left - pad - r.right])])].filter((x) => Math.abs(x) <= hLimit && r.left + x >= page.left + pad && r.right + x <= page.right - pad && r.right + x >= mlCur && r.left + x <= mrCur && !row.some((o) => cross(rect(x, y), o, pad)));
                    xs.sort((a, b) => (Math.abs(a) + (afterPress && a < 0 ? hLimit + 1 : 0)) - (Math.abs(b) + (afterPress && b < 0 ? hLimit + 1 : 0)));
                    if (xs.length) {
                        dx = xs[0];
                        dy = y;
                        return true;
                    }
                }
                return false;
            };
            const vStrict = Math.abs(ctm.d) * 40;
            found = tryPlace(vStrict, limit, gap)
                || tryPlace(Infinity, limit * 3, Math.max(0.5, gap * 0.4));
            if (!found && owner && !next && staffBottom != null) {
                const neededBottom = Math.max(inkBottom ?? staffBottom, staffBottom, r.bottom) + gap * 2 + r.height;
                if (expandPageBottom(neededBottom)) {
                    found = tryPlace(vStrict, limit, gap)
                        || tryPlace(Infinity, limit * 3, Math.max(0.5, gap * 0.4));
                }
            }
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
        if (unresolved === unresolvedBefore) pedalLayouts.set(svg, signature());
    });
    box.dataset.pedalUnresolved = String(unresolved);
    return unresolved === 0;
}

export interface ScoreOsmdLabel { SVGNode?: SVGElement | null; Label?: { text?: string } }
export interface ScoreOsmdVexNote {
    getAttribute?(name: 'el'): SVGElement | undefined;
    duration?: string;
    modifiers?: { getCategory?(): string; type: string }[];
}
export interface ScoreOsmdNote {
    sourceNote?: { isRest(): boolean; PrintObject?: boolean; TypeLength?: { RealValue: number }; DotsXml?: number; IsGraceNote?: boolean };
    vfnote?: readonly [unknown, number];
    getNoteheadSVGs?(): SVGElement[];
    getSVGGElement?(): SVGElement;
}
export interface ScoreOsmdVoiceEntry { vfStaveNote?: ScoreOsmdVexNote; mVexFlowStaveNote?: ScoreOsmdVexNote; notes?: ScoreOsmdNote[] }
export interface ScoreOsmdStaffEntry { FingeringEntries?: ScoreOsmdLabel[]; graphicalChordContainers?: { GraphicalLabel?: ScoreOsmdLabel }[]; graphicalVoiceEntries?: ScoreOsmdVoiceEntry[] }
export interface ScoreOsmdMeasure {
    staffEntries?: ScoreOsmdStaffEntry[];
    ParentMusicSystem: ScoreOsmdSystem;
    parentSourceMeasure: { AbsoluteTimestamp: { RealValue: number }; Duration: { RealValue: number } };
    PositionAndShape: { AbsolutePosition: { x: number }; Size: { width: number } };
    beginInstructionsWidth?: number;
}
export interface ScoreOsmdStaffLine {
    Measures: ScoreOsmdMeasure[];
    AbstractExpressions?: { lines?: { SVGElement?: SVGElement }[]; expression?: { dynamicType?: number | null } }[];
    PositionAndShape: { RelativePosition: { y: number } };
    StaffHeight: number;
}
export interface ScoreOsmdSystem { StaffLines: ScoreOsmdStaffLine[]; PositionAndShape: { AbsolutePosition: { y: number } } }
export interface ScoreOsmdSheet {
    MusicPages: { PageNumber: number; MusicSystems: ScoreOsmdSystem[] }[];
    MeasureList: (ScoreOsmdMeasure | undefined)[][];
    title?: ScoreOsmdLabel; subtitle?: ScoreOsmdLabel; composer?: ScoreOsmdLabel; lyricist?: ScoreOsmdLabel; copyright?: ScoreOsmdLabel;
}
export function isScoreOsmdSheet(v: unknown): v is ScoreOsmdSheet {
    return typeof v === 'object' && v !== null && 'MusicPages' in v && Array.isArray(v.MusicPages) && 'MeasureList' in v && Array.isArray(v.MeasureList);
}
// A marking's inked area in screen pixels: left, right, top, bottom.
export interface ScoreInkBox { l: number; r: number; t: number; b: number }
// Chord fingerings stacked one above the other must never touch: each column is re-stacked from the notes outwards,
// clear of its noteheads, stems and the digits already placed on that staff, above or below as OSMD chose.
export function scoreFixFingerings(box: HTMLElement, engine: import('./notation.js').ScoreRenderer | null) {
    const sheet = engine && engine.readLayout().graphicSheet, gs = isScoreOsmdSheet(sheet) ? sheet : null;
    if (!gs || !box)
        return;
    const ink = (r: DOMRect): ScoreInkBox => ({ l: r.left + r.width * .08, r: r.right - r.width * .08, t: r.top + r.height * .18, b: r.bottom - r.height * .2 });
    const crossX = (a: ScoreInkBox, b: ScoreInkBox) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > .5;
    const shifts: { n: Element; dy: number }[] = [];
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
                        shifts.push({ n: it.n, dy: dy / ctm.d });
                    placed.push({ l: it.box.l, r: it.box.r, t: it.box.t + dy, b: it.box.b + dy });
                });
            }
        }));
    })));
    for (const s of shifts)
        scoreShiftY(s.n, s.dy);
    // A chord symbol raised over the upper staff must not sit on the words there ("dolce", "rit."):
    // the words move above it. Text equality is not semantic equality (harmony C and rehearsal C differ).
    const chords = new Set<Element>(), fings = new Set<Element>();
    gs.MeasureList.forEach((list) => (list || []).forEach((gm) => gm && (gm.staffEntries || []).forEach((gse) => { (gse.graphicalChordContainers || []).forEach((c) => { const n = c.GraphicalLabel && c.GraphicalLabel.SVGNode; if (n)
        chords.add(n); }); (gse.FingeringEntries || []).forEach((f) => { if (f.SVGNode)
        fings.add(f.SVGNode); }); })));
    const chordArr = [...chords], fingArr = [...fings];
    const svgs = [...box.querySelectorAll('svg')];
    if (chordArr.length) {
        const wordShifts: { n: Element; dy: number }[] = [];
        svgs.forEach((svg) => {
            const ctm = svg.getScreenCTM();
            if (!ctm || !ctm.d)
                return;
            const chordBoxes: ScoreInkBox[] = [], words: { x: SVGTextElement; b: ScoreInkBox; }[] = [];
            svg.querySelectorAll('text').forEach((x) => {
                const r = x.getBoundingClientRect(), s = (x.textContent ?? '').trim();
                if (!s || !r.width)
                    return;
                if (chordArr.some((c) => c === x || c.contains(x)))
                    chordBoxes.push(ink(r));
                else if (!fingArr.some((f) => f === x || f.contains(x)) && !x.closest('.measure-number,.osmd-measure-number,.vf-repetition,.vf-stavesection'))
                    words.push({ x, b: ink(r) });
            });
            words.forEach(({ x, b }) => {
                const hit = chordBoxes.find((c) => crossX(b, c) && b.b + ctm.d * 5 > c.t && b.t < c.b);
                if (!hit || b.t > hit.t)
                    return;
                wordShifts.push({ n: x, dy: (hit.t - ctm.d * 5 - b.b) / ctm.d });
            });
        });
        for (const s of wordShifts)
            scoreShiftY(s.n, s.dy);
    }
    // Repetition instructions combine text and a music glyph. OSMD's estimated skyline can miss
    // their actual ink (segno by high notes, D.S. al by a ledger note, Coda by a chord symbol).
    // Move the complete semantic group, never its glyph alone or the note it points to.
    const navigation = '.vf-repetition,.vf-stavesection,.osmd-tempo,.vf-stavetempo';
    const navShifts: { n: Element; dy: number }[] = [];
    svgs.forEach((svg) => {
        const ctm = svg.getScreenCTM();
        if (!ctm || !ctm.d)
            return;
        const marks = svg.querySelectorAll<SVGElement>(navigation);
        if (!marks.length)
            return;
        const obstacles = [...svg.querySelectorAll('.vf-notehead,.vf-stem,.vf-flag,.vf-beam,.vf-ledgers path,.osmd-fingering,.osmd-chord-symbol')].map((n) => ({ n, r: n.getBoundingClientRect() }));
        marks.forEach((mark) => {
            const r = mark.getBoundingClientRect(), gap = Math.abs(ctm.d) * 2.5;
            if (!r.width || !r.height)
                return;
            const blocks = obstacles.filter(({ n, r: o }) => !mark.contains(n) && !n.contains(mark) && o.width + o.height > 0 && r.right + gap > o.left && r.left - gap < o.right).map((o) => o.r);
            let dy = 0;
            for (let step = 0; step < blocks.length; step++) {
                const hits = blocks.filter((o) => r.bottom + dy + gap > o.top && r.top + dy - gap < o.bottom);
                if (!hits.length)
                    break;
                dy = Math.min(...hits.map((o) => o.top)) - gap - r.bottom - .01;
            }
            if (Math.abs(dy) > .1)
                navShifts.push({ n: mark, dy: dy / ctm.d });
        });
    });
    for (const s of navShifts)
        scoreShiftY(s.n, s.dy);
}
// Adds to any vertical shift already applied, so the pass can run again on a page it has already tidied.
export function scoreShiftY(n: Element, dy: number) {
    const m = /^translate\(0 (-?[\d.]+)\)$/.exec(n.getAttribute('transform') || '');
    n.setAttribute('transform', `translate(0 ${((m ? +m[1] : 0) + dy).toFixed(2)})`);
    if (n instanceof SVGElement) bumpScoreSvgEpoch(n.ownerSVGElement);
}
