/* The scale and arpeggio drill on the Practice page. It runs inside the targeted-practice session screen, so it never
   touches the review schedule, the daily goal or the streak. What it remembers (which exercises had a clean run, so their
   fingering is hidden) lasts for this visit only. */
import {
  ARPEGGIO_TONICS, TECHNIQUE_HANDS, TECHNIQUE_KINDS, techniqueGrade, techniqueKeyAllowed, techniqueNoteOn, techniqueSpecKey,
  techniqueSpellDegree, techniqueStart, techniqueSteps, techniqueTonicSpelling,
  type TechniqueHands, type TechniqueKind, type TechniqueRun, type TechniqueSpec, type TechniqueStep,
} from './technique.js';
import '../styles/technique.css';

/** The Practice topic value (the `pr-cat` option) that opens this drill. */
export const TECHNIQUE_TOPIC = 'technique';

/** What the drill needs from the app: strings, note names in the user's notation, and the keyboard dock. */
export interface TechniqueHost {
  t(key: string, ...args: (string | number)[]): string;
  /** A note name without octave, in the user's note names (C, Do, H …). */
  spell(letter: number, acc: number): string;
  /** Marks one key on the dock (null clears it). */
  mark(midi: number, state: 'target' | 'good' | 'bad' | null): void;
  clearMarks(): void;
  byId(id: string): HTMLElement;
  /** The setting Accept any octave: a key of the right note name counts in any octave. */
  anyOctave(): boolean;
}

interface DrillState {
  spec: TechniqueSpec;
  steps: TechniqueStep[];
  run: TechniqueRun;
  done: boolean;
  peek: boolean;
  runs: number;
  clean: number;
  keyChoice: string;
}
let state: DrillState | null = null;
let preferred: { kind: TechniqueKind; octaves: 1 | 2; hands: TechniqueHands } = { kind: 'major', octaves: 1, hands: 'rh' };
const cleared = new Set<string>();
let badTimer = 0;

const esc = (text: string) => text.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
const isKind = (value: string | undefined): value is TechniqueKind => TECHNIQUE_KINDS.some((kind) => kind === value);
const isHands = (value: string | undefined): value is TechniqueHands => TECHNIQUE_HANDS.some((hands) => hands === value);

export function techniqueDrillActive(): boolean { return state !== null; }

// A Practice key is '0'…'11' or 'all'.
function fixedKey(keyChoice: string): number | null { return /^\d+$/.test(keyChoice) ? Number(keyChoice) % 12 : null; }

// With a fixed key the exercise uses it (an arpeggio the key cannot use falls back to the major scale). With 'all' a key is
// drawn, or the current one is kept when it still fits.
function keyFor(kind: TechniqueKind, keyChoice: string, keep: number | null): { kind: TechniqueKind; tonicPc: number } {
  const fixed = fixedKey(keyChoice);
  if (fixed !== null) return techniqueKeyAllowed(kind, fixed) ? { kind, tonicPc: fixed } : { kind: 'major', tonicPc: fixed };
  if (keep !== null && techniqueKeyAllowed(kind, keep)) return { kind, tonicPc: keep };
  const pool = kind === 'major' || kind === 'minor' ? Array.from({ length: 12 }, (_, index) => index) : ARPEGGIO_TONICS[kind];
  return { kind, tonicPc: pool[Math.floor(Math.random() * pool.length)] };
}

function noteLabel(host: TechniqueHost, spec: TechniqueSpec, degree: number): string {
  const { letter, acc } = techniqueSpellDegree(spec.kind, spec.tonicPc, degree);
  return host.spell(letter, acc);
}

function title(host: TechniqueHost, spec: TechniqueSpec): string {
  const tonic = techniqueTonicSpelling(spec.kind, spec.tonicPc);
  return host.t('tq_title_' + spec.kind, host.spell(tonic.letter, tonic.acc));
}

function fingeringShown(s: DrillState): boolean { return s.peek || !cleared.has(techniqueSpecKey(s.spec)); }

function seg(host: TechniqueHost, name: string, label: string, options: readonly { value: string; text: string; on: boolean; disabled?: boolean }[]): string {
  return `<div class="seg tq-seg" role="group" aria-label="${esc(label)}" data-tq="${name}">${options.map((o) =>
    `<button type="button" data-v="${o.value}" aria-pressed="${o.on}"${o.disabled ? ' disabled' : ''}>${esc(o.text)}</button>`).join('')}</div>`;
}

function arpeggioKeys(host: TechniqueHost): string {
  const names = (kind: 'arpMajor' | 'arpMinor') => ARPEGGIO_TONICS[kind].map((pc) => {
    const tonic = techniqueTonicSpelling(kind, pc);
    return host.spell(tonic.letter, tonic.acc);
  }).join(', ');
  return host.t('tq_arp_keys', names('arpMajor'), names('arpMinor'));
}

function render(host: TechniqueHost): void {
  const s = state;
  if (!s) return;
  const fixed = fixedKey(s.keyChoice);
  host.byId('q-cat').textContent = host.t('cat_technique');
  host.byId('q-mode').textContent = host.t('tq_mode');
  host.byId('q-prompt').textContent = title(host, s.spec);
  host.byId('ses-count').textContent = '#' + (s.runs + 1) + (s.runs ? ' · ' + s.clean + '/' + s.runs + ' ✓' : '');
  const box = drillBox(host);
  const shown = fingeringShown(s);
  const ascending = s.steps.slice(0, (s.steps.length + 1) / 2);
  const cells = ascending.map((step, index) => {
    const rh = step.notes.find((note) => note.hand === 'rh'), lh = step.notes.find((note) => note.hand === 'lh');
    return `<li class="tq-cell" data-i="${index}" data-m="${step.notes.map((note) => note.midi).join(',')}">${rh ? `<b class="tq-f">${shown ? rh.finger : ''}</b>` : ''}<span>${esc(noteLabel(host, s.spec, step.notes[0].degree))}</span>${lh ? `<b class="tq-f tq-lh">${shown ? lh.finger : ''}</b>` : ''}</li>`;
  }).join('');
  box.innerHTML =
    `<div class="tq-opts">` +
    seg(host, 'kind', host.t('tq_kind'), TECHNIQUE_KINDS.map((kind) => ({ value: kind, text: host.t('tq_k_' + kind), on: kind === s.spec.kind, disabled: fixed !== null && !techniqueKeyAllowed(kind, fixed) }))) +
    seg(host, 'octaves', host.t('tq_octaves'), [1, 2].map((n) => ({ value: String(n), text: host.t('tq_oct' + n), on: n === s.spec.octaves }))) +
    seg(host, 'hands', host.t('tq_hands'), TECHNIQUE_HANDS.map((hands) => ({ value: hands, text: host.t('tq_h_' + hands), on: hands === s.spec.hands }))) +
    `</div>` +
    `<p class="tq-how">${esc(host.t('tq_how'))}${s.spec.kind === 'arpMajor' || s.spec.kind === 'arpMinor' ? ' ' + esc(arpeggioKeys(host)) : ''}</p>` +
    `<ol class="tq-strip${shown ? '' : ' tq-nofing'}" aria-label="${esc(host.t('tq_fing'))}">${cells}</ol>` +
    `<p class="tq-live" role="status" aria-live="polite">${shown ? '' : esc(host.t('tq_fing_hidden'))}</p>` +
    `<div class="tq-tools"><button type="button" class="btn sm ghost" data-tq-act="restart">${esc(host.t('tq_restart'))}</button>` +
    (cleared.has(techniqueSpecKey(s.spec)) ? `<button type="button" class="btn sm ghost" data-tq-act="peek" aria-pressed="${s.peek}">${esc(host.t('tq_fing_show'))}</button>` : '') +
    `</div>`;
  paintProgress(host);
}

// The drill's own block sits right under the prompt; other sessions never see it.
function drillBox(host: TechniqueHost): HTMLElement {
  let box = document.getElementById('tq-drill');
  if (!box) {
    box = document.createElement('div');
    box.id = 'tq-drill';
    box.className = 'tq';
    host.byId('q-prompt').after(box);
    box.addEventListener('click', (event) => onClick(host, event));
  }
  box.hidden = false;
  return box;
}

function cellOf(stepIndex: number, total: number): number {
  const top = (total - 1) / 2;
  return stepIndex <= top ? stepIndex : total - 1 - stepIndex;
}

function paintProgress(host: TechniqueHost): void {
  const s = state;
  const box = document.getElementById('tq-drill');
  if (!s || !box) return;
  const now = s.done ? -1 : cellOf(s.run.index, s.steps.length);
  const top = (s.steps.length - 1) / 2;
  box.querySelectorAll<HTMLElement>('.tq-cell').forEach((cell) => {
    const index = Number(cell.dataset.i);
    // Going up, a cell is done once played; coming down, the cells below the current one are still to come.
    const done = s.done || (s.run.index <= top ? index < s.run.index : index > now);
    cell.classList.toggle('done', done);
    cell.classList.toggle('now', index === now);
  });
  host.clearMarks();
  if (!s.done && fingeringShown(s)) s.steps[s.run.index]?.notes.forEach((note) => host.mark(note.midi, 'target'));
}

function restart(host: TechniqueHost, spec: TechniqueSpec): void {
  if (!state) return;
  const steps = techniqueSteps(spec);
  state.spec = spec;
  state.steps = steps;
  state.run = techniqueStart(steps);
  state.done = false;
  state.peek = false;
  host.byId('q-verdict').textContent = '';
  host.byId('q-verdict').className = 'verdict';
  host.byId('q-elab').textContent = '';
  host.byId('q-elab').classList.remove('show');
  host.byId('q-next').hidden = true;
  render(host);
}

function onClick(host: TechniqueHost, event: Event): void {
  const s = state;
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!s || !target || target.disabled) return;
  const act = target.getAttribute('data-tq-act');
  if (act === 'restart') {
    restart(host, s.spec);
    return;
  }
  if (act === 'peek') {
    s.peek = !s.peek;
    render(host);
    return;
  }
  const group = target.closest('[data-tq]')?.getAttribute('data-tq');
  const value = target.getAttribute('data-v') ?? undefined;
  let spec = s.spec;
  if (group === 'kind' && isKind(value)) spec = { ...spec, ...keyFor(value, s.keyChoice, spec.tonicPc) };
  else if (group === 'octaves' && (value === '1' || value === '2')) spec = { ...spec, octaves: value === '1' ? 1 : 2 };
  else if (group === 'hands' && isHands(value)) spec = { ...spec, hands: value };
  else return;
  preferred = { kind: spec.kind, octaves: spec.octaves, hands: spec.hands };
  restart(host, spec);
}

/** Opens the next exercise: the same kind, octaves and hands as last time, in the Practice key or, for all keys, a new one. */
export function techniquePresent(host: TechniqueHost, keyChoice: string): void {
  const previous = state;
  const spec: TechniqueSpec = { ...keyFor(preferred.kind, keyChoice, null), octaves: preferred.octaves, hands: preferred.hands };
  const steps = techniqueSteps(spec);
  state = { spec, steps, run: techniqueStart(steps), done: false, peek: false, runs: previous?.runs ?? 0, clean: previous?.clean ?? 0, keyChoice };
  host.byId('q-verdict').textContent = '';
  host.byId('q-verdict').className = 'verdict';
  host.byId('q-elab').textContent = '';
  host.byId('q-elab').classList.remove('show');
  host.byId('q-next').hidden = true;
  host.byId('q-answers').hidden = true;
  host.byId('q-answers').innerHTML = '';
  host.byId('q-ekhint').textContent = '';
  host.byId('q-ekprog').innerHTML = '';
  host.byId('q-reveal').hidden = true;
  host.byId('q-replay').hidden = true;
  host.byId('q-ansmode').hidden = true;
  render(host);
}

/** A key going down during the drill. */
export function techniqueInput(host: TechniqueHost, midi: number, timeMs: number): void {
  const s = state;
  if (!s || s.done) return;
  const expected = s.steps[s.run.index];
  const result = techniqueNoteOn(s.run, midi, timeMs, host.anyOctave());
  const live = document.querySelector<HTMLElement>('#tq-drill .tq-live');
  if (result === 'wrong') {
    host.mark(midi, 'bad');
    window.clearTimeout(badTimer);
    badTimer = window.setTimeout(() => paintProgress(host), 450);
    if (live && expected) live.textContent = host.t('tq_wrong', expected.notes.map((note) => noteLabel(host, s.spec, note.degree)).join(' + '));
    return;
  }
  if (result === 'step' || result === 'done') {
    // A right note clears the wrong-note hint and brings back the line's usual text.
    if (live) live.textContent = fingeringShown(s) ? '' : host.t('tq_fing_hidden');
    paintProgress(host);
  }
  if (result === 'done') finish(host);
}

function finish(host: TechniqueHost): void {
  const s = state;
  if (!s) return;
  s.done = true;
  s.runs += 1;
  const grade = techniqueGrade(s.run);
  if (grade.clean) {
    s.clean += 1;
    cleared.add(techniqueSpecKey(s.spec));
  }
  paintProgress(host);
  const verdict = host.byId('q-verdict');
  verdict.className = 'verdict ' + (grade.clean ? 'good' : grade.wrong === 0 ? 'neutral' : 'bad');
  verdict.textContent = host.t(grade.clean ? 'tq_res_clean' : 'tq_res_again');
  const lines = [
    host.t('tq_res_notes', grade.notes, grade.wrong, grade.accuracy + '%'),
    host.t('tq_res_even', host.t('tq_even_' + grade.evenness), grade.spreadMs, grade.meanIoiMs),
  ];
  if (grade.evenness !== 'steady') {
    const step = s.steps[grade.worstStep];
    if (step) lines.push(host.t('tq_res_gap', noteLabel(host, s.spec, step.notes[0].degree), step.notes.map((note) => note.finger).join('/')));
  }
  if (grade.handSyncMs !== null) lines.push(host.t('tq_res_sync', grade.handSyncMs));
  const elab = host.byId('q-elab');
  elab.innerHTML = lines.map((line) => `<div>${esc(line)}</div>`).join('');
  elab.classList.add('show');
  host.byId('ses-count').textContent = '#' + s.runs + ' · ' + s.clean + '/' + s.runs + ' ✓';
  const next = host.byId('q-next');
  next.hidden = false;
  next.focus();
}

/** Leaves the drill (the session ended or another topic started). Clean runs are kept for this visit. */
export function techniqueStop(host: TechniqueHost): void {
  if (!state) return;
  state = null;
  window.clearTimeout(badTimer);
  const box = document.getElementById('tq-drill');
  if (box) {
    box.hidden = true;
    box.innerHTML = '';
  }
  host.clearMarks();
}
