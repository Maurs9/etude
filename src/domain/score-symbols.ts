import { recognizeScoreMarkings } from './score-markings.js';
import { scoreOctaveMark, scoreStructuralMarks } from './score-svg-markings.js';
import { isScoreOsmdSheet } from './score-svg-post.js';
import { scoreHasKey, type AnNote, type ScoreMeasure } from './score-types.js';

export interface ScoreGeoSystem { page: number; top: number; bottom: number }
export interface ScoreGeoMeasure { sys: number; x0: number; xn: number; x1: number; xs: number; cx: number; b0: number; b1: number }
export interface ScoreGeoAnchor { beat: number; x: number; sys: number; end?: boolean }
export interface ScoreGeometry { scale: number; pages: (HTMLElement | null)[]; systems: ScoreGeoSystem[]; measures: (ScoreGeoMeasure | undefined)[]; measureOrder?: number[]; anchors: ScoreGeoAnchor[] }

// The parts of OSMD's engraved sheet the score passes read. OSMD ships no types for these, so isScoreOsmdSheet checks the root.
// Every marking on the page that the hover can explain: its box (relative to its page, which only moves as a whole), kind and value.
export const SC_DYN = /^(ppp|pp|p|mp|mf|f|ff|fff|sfz|fz|rfz|fp|sf|sfp)$/;
// Keep the diagnostic surface derived from the same vocabulary as the parser.
export const SC_ARTS = { 'a.': 'staccato', 'av': 'staccatissimo', 'a>': 'accent', 'a^': 'marcato', 'a-': 'tenuto', 'a@a': 'fermata', 'a@u': 'fermata', 'a@s': 'fermata', 'a@l': 'fermata', 'a@as': 'fermata', 'a@us': 'fermata',
    tr: 'trill', mordent: 'mordent', mordent_inverted: 'mordent', turn: 'turn', turn_inverted: 'turn', prallprall: 'trill', upprall: 'trill' };
// A rest's value: its written length and dots.
interface ScoreRestSym { type: string; dots: number }
// A box given directly, where no element carries the marking (an arpeggio's wavy line).
type ScoreSymRect = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
// A marking the hover can explain: its element, kind and value, boxed relative to its page.
export interface ScoreSym { kind: string | undefined; val: string | ScoreRestSym; el: Element | null; loose: boolean; page: Element; x0: number; y0: number; x1: number; y1: number }
// A lookup-table key check, so a value read from the engraving can index one of the tables here.
type Translate = (key: string, ...values: (string | number | null | undefined)[]) => string;

interface ScoreSymbolContext {
    geometry: ScoreGeometry | null;
    notes: readonly AnNote[];
    heads: ReadonlyMap<number, readonly Element[]>;
    measures: readonly ScoreMeasure[];
    tempoWords: ReadonlySet<string> | null;
    keyNameAt: (beat: number) => string;
    language: string;
    t: Translate;
}

export function scoreSymbols(box: HTMLElement, sheet: unknown, context: ScoreSymbolContext): ScoreSym[] {
    box.querySelectorAll('[data-sym]').forEach(el => el.removeAttribute('data-sym'));
    if (!isScoreOsmdSheet(sheet)) return [];
    const list: ScoreSym[] = [];
    const { geometry, notes, heads, measures, tempoWords, keyNameAt, language, t } = context;
    const pageRects = new Map<Element, DOMRect>(), pageOf = (el: Element | null | undefined) => el && el.closest && el.closest('[id^="osmdCanvasPage"]');
    const symMarked = new Set<Element>();
    const hasSymAncestor = (el: Element) => {
        for (let cur: Element | null = el; cur && cur !== box; cur = cur.parentElement) {
            if (symMarked.has(cur) || cur.hasAttribute('data-sym')) return true;
        }
        return false;
    };
    const pendingSyms: { el: HTMLElement | SVGElement; idx: number; label: string }[] = [];
    const graceFixes: { el: SVGElement; tab: string | null; label: string }[] = [];
    const add = (el: Element | null, kind: string | undefined, val: string | ScoreRestSym = '', rect?: ScoreSymRect | null, loose = true, ref?: Element) => {
        const r = rect || (el && el.getBoundingClientRect()), page = pageOf(el || ref);
        if (!r || (!r.width && !r.height) || !page)
            return;
        let pr = pageRects.get(page);
        if (!pr) {
            pr = page.getBoundingClientRect();
            pageRects.set(page, pr);
        }
        const i = list.length;
        list.push({ kind, val, el, loose, page, x0: r.left - pr.left, y0: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top });
        if (el instanceof HTMLElement || el instanceof SVGElement) {
            symMarked.add(el);
            pendingSyms.push({ el, idx: i, label: scoreSymText({ kind, val }, t, language).line });
        }
    };
    const seen = new Set<Element>(); // the title block is not a marking
    (['title', 'subtitle', 'composer', 'lyricist', 'copyright'] as const).forEach((k) => { const n = sheet[k] && sheet[k].SVGNode; if (n) {
        seen.add(n);
        if (n.querySelectorAll)
            n.querySelectorAll('text').forEach((x) => seen.add(x));
    } });
    scoreStructuralMarks(sheet).forEach(mark => add(mark.element, mark.kind, mark.value));
    box.querySelectorAll('.vf-textbracket').forEach(element => {
        const kind = scoreOctaveMark(element);
        if (kind) add(element, kind);
    });
    sheet.MusicPages.forEach((pg) => pg.MusicSystems.forEach((sys) => sys.StaffLines.forEach((sl) => {
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
                    if (src?.IsGraceNote && src.PrintObject !== false) {
                        const heads = n.getNoteheadSVGs?.() ?? [], head = heads[n.vfnote?.[1] ?? 0] ?? n.getSVGGElement?.();
                        if (head) {
                            const tab = head.getAttribute('tabindex'), label = head.getAttribute('aria-label'), selectable = head.hasAttribute('data-i');
                            head.dataset.grace = 'yes';
                            add(head, 'grace');
                            if (selectable) {
                                graceFixes.push({ el: head, tab, label: (label ? label + ' · ' : '') + t('sym_grace') });
                            }
                        }
                    }
                    if (!src || !src.isRest() || src.PrintObject === false)
                        return;
                    const heads = n.getNoteheadSVGs ? n.getNoteheadSVGs() : [], g = heads[0] || (n.getSVGGElement && n.getSVGGElement());
                    if (!g)
                        return;
                    const restNames = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th', 128: '128th', 256: '256th', b: 'breve' }, dur = vf && vf.duration;
                    const type = src.TypeLength && src.TypeLength.RealValue === 0 ? 'measure' : ((dur != null && scoreHasKey(restNames, dur) ? restNames[dur] : undefined) || 'other');
                    add(g, 'rest', { type, dots: src.DotsXml || 0 });
                });
                if (!vf || !vf.modifiers || !vf.modifiers.length)
                    return;
                const mg = el && el.querySelector && el.querySelector('.vf-modifiers');
                if (!mg)
                    return;
                // Grace groups emit nested notes/ledgers, not one modifier path.
                // Exclude both sides of that structural group before pairing glyphs.
                const paths = [...mg.children].filter(child => !child.matches('.vf-stavenote,.vf-ledgers,.vf-stavetie'));
                const mods = vf.modifiers.filter(modifier => modifier.getCategory?.() !== 'gracenotegroups');
                const shown = paths.length === mods.length ? mods : mods.filter((m) => /articulation|ornament/i.test(m.getCategory ? m.getCategory() : ''));
                if (paths.length !== shown.length)
                    return;
                const accidentals = { '#': 'accidental_sharp', b: 'accidental_flat', n: 'accidental_natural', '##': 'accidental_doublesharp', bb: 'accidental_doubleflat' };
                shown.forEach((m, k) => {
                    const category = m.getCategory?.(), kind = category === 'dots' ? 'dot' : category === 'accidentals' && scoreHasKey(accidentals, m.type) ? accidentals[m.type] : scoreHasKey(SC_ARTS, m.type) ? SC_ARTS[m.type] : undefined;
                    if (kind) add(paths[k], kind, '');
                });
            });
        }));
    })));
    box.querySelectorAll('.vf-sc-pedal').forEach((g) => [...g.querySelectorAll('path')].forEach((p) => { const r = p.getBoundingClientRect(); if (r.width)
        add(p, r.width > r.height * 1.3 ? 'ped' : 'pedup', '', r); }));
    box.querySelectorAll('.sc-note-parentheses').forEach(group => add(group, 'parenthesized'));
    // A decimal metronome value can span multiple <text> children in OSMD.
    // Bind the whole semantic group, including its trailing fraction.
    box.querySelectorAll('.osmd-words,.osmd-tempo,.osmd-dynamic').forEach(element => {
        // Separate SVG text nodes have no intervening DOM whitespace, even when they are drawn
        // on different lines. Preserve that word boundary without separating a decimal suffix.
        const texts = [...element.querySelectorAll('text')];
        const s = (texts.length ? texts.map(text => text.textContent?.trim() ?? '').filter(Boolean).join(' ') : element.textContent ?? '').replace(/\s+/g, ' ').replace(/(\d)\s+([.,]\d)/g, '$1$2').trim();
        if (!s || hasSymAncestor(element)) return;
        texts.forEach(text => seen.add(text));
        if (SC_DYN.test(s)) add(element, 'dyn', s);
        else if (/^[A-G](?:[#♯b♭])?(?:m(?:aj)?|dim|aug|sus[24]?)?\d*(?:\/[A-G][#♯b♭]?)?$/.test(s) && element.classList.contains('osmd-words')) add(element, 'chord', s);
        else if (/^\d+:\d{2}$/.test(s)) add(element, 'timestamp', s);
        // OSMD separates tempo expressions from ordinary words. Pair that semantic
        // class with the MusicXML sound value, independent of layout adjustments.
        else if (element.classList.contains('osmd-tempo') && tempoWords?.has(s)) add(element, 'tempo', s);
        else add(element, scoreTermParts(s, t).length ? 'text' : 'direction', s);
    });
    box.querySelectorAll('svg text').forEach((x) => {
        if (seen.has(x) || hasSymAncestor(x) || x.closest('.measure-number,.osmd-measure-number,.osmd-lyrics'))
            return;
        const s = (x.textContent || '').replace(/\s+/g, ' ').trim();
        if (!s)
            return;
        const r = x.getBoundingClientRect();
        if (SC_DYN.test(s))
            add(x, 'dyn', s, r);
        else if (/^[A-Z][0-9]?$/.test(s) && x.closest('.vf-measure'))
            add(x, 'rehearsal', s, r);
        else if (scoreTermParts(s, t).length)
            add(x, 'text', s, r);
    });
    box.querySelectorAll('svg .vf-curve').forEach((g) => add(g, 'slur', '', null, false));
    box.querySelectorAll('svg .vf-stavetie').forEach((g) => add(g, 'tie', '', null, false));
    box.querySelectorAll('svg .sc-xline').forEach((p) => add(p, p instanceof SVGElement ? p.dataset.kind : undefined, '', null, false));
    box.querySelectorAll('svg .vf-clef').forEach((g) => { const r = g.getBoundingClientRect(), q = r.height / Math.max(1, r.width); add(g, q > 1.9 ? 'clef_g' : q < 1.25 ? 'clef_f' : 'clef_c', '', r); });
    const beatAt = (r: DOMRect) => {
        const g = geometry;
        if (!g)
            return null;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const m of g.measures) {
            if (!m)
                continue;
            const sy = g.systems[m.sys], pe = g.pages[sy.page];
            if (!pe)
                continue;
            let pr = pageRects.get(pe);
            if (!pr) {
                pr = pe.getBoundingClientRect();
                pageRects.set(pe, pr);
            }
            const ux = (cx - pr.left) / g.scale, uy = (cy - pr.top) / g.scale;
            if (ux >= m.x0 - .2 && ux <= m.x1 && uy >= sy.top - 3 && uy <= sy.bottom + 3)
                return m.b0;
        }
        return null;
    };
    box.querySelectorAll('svg .vf-keysignature').forEach((g) => { const r = g.getBoundingClientRect(), b = beatAt(r); if (b != null)
        add(g, 'key', keyNameAt(b + .001), r); });
    box.querySelectorAll('svg .vf-timesignature').forEach((g) => { const r = g.getBoundingClientRect(), b = beatAt(r); if (b == null)
        return; const m = measures.find((x) => x.start <= b + .001 && x.end > b + .001); if (m)
        add(g, 'time', m.num + '/' + m.den, r); });
    // An arpeggio's wavy line stands just left of its chord.
    const rolls = new Map<string, number[]>();
    notes.forEach((n, i) => { if (!n.arpeggiate)
        return; const k = n.staff + ':' + n.start; if (!rolls.has(k))
        rolls.set(k, []); (rolls.get(k) || []).push(i); });
    rolls.forEach((ix) => {
        const rs = ix.flatMap((i) => { const hs = heads.get(i) || []; return hs.map((g) => g.getBoundingClientRect()); }).filter((r) => r.width);
        if (!rs.length)
            return;
        const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), b = Math.max(...rs.map((r) => r.bottom)), w = rs[0].width, h0 = heads.get(ix[0]) || [];
        add(null, 'arpeggio', '', { left: l - w * 1.4, right: l - w * .15, top: t - w * .3, bottom: b + w * .3, width: w, height: b - t }, true, h0[0]);
    });
    for (const sym of pendingSyms) {
        sym.el.dataset.sym = String(sym.idx);
        sym.el.style.cursor = 'help';
        sym.el.tabIndex = 0;
        sym.el.setAttribute('aria-label', sym.label);
    }
    for (const fix of graceFixes) {
        fix.el.style.cursor = 'pointer';
        fix.el.setAttribute('tabindex', fix.tab ?? '-1');
        fix.el.setAttribute('aria-label', fix.label);
    }
    return list;
}
export function scoreTermParts(s: string, t: Translate) {
    return recognizeScoreMarkings(s, { context: 'direction' }).map(part => t(part.key, ...part.params));
}
// "Name — meaning": the tooltip heads with the symbol as printed (or its name) and #an-hover reads it as one line.
export function scoreSymText(sym: Pick<ScoreSym, 'kind' | 'val'>, t: Translate, language: string) {
    const split = (s: string) => { const i = s.indexOf(' — '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 3)]; };
    const k = sym.kind, v = sym.val;
    if (typeof v !== 'string') { // only a rest's value is not text
        const name = t('sym_rest_' + v.type), raw = v.dots === 1 ? t('sym_rest_dotted', name) : v.dots > 1 ? t('sym_rest_dots', name, v.dots) : name, head = raw[0].toLocaleUpperCase(language) + raw.slice(1);
        const body = t(v.type === 'measure' ? 'sym_rest_measure_body' : 'sym_rest_body');
        return { head, body, line: head + ' — ' + body };
    }
    if (k === 'text') {
        const parts = scoreTermParts(v, t);
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
    else if (k === 'timestamp')
        full = t('sym_timestamp', v);
    else if (k === 'tempo')
        full = t('sym_metro', v);
    else if (k === 'direction')
        full = t('sym_direction');
    else if (k === 'volta')
        full = t('sym_volta', v);
    else
        full = t('sym_' + k);
    const [name, body] = split(full), lit = k !== undefined && ['dyn', 'finger', 'rehearsal', 'time', 'chord', 'direction', 'volta'].includes(k) ? v : '';
    return { head: lit ? lit + ' · ' + name : name, body, line: (lit ? lit + ' · ' : '') + full };
}
