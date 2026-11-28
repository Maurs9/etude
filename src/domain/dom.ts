/**
 * Checked DOM lookups for the view runtime. Each helper verifies what it
 * returns, so a missing or differently tagged element fails loudly at the
 * lookup instead of surfacing later as an unrelated property error.
 */

type ElementType<T extends Element> = abstract new (...args: never[]) => T;

/** An element the shell always contains. */
export function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Étude: missing element #${id}`);
  return el;
}

/** An element that may not exist yet (created later, or optional). */
export function maybeById(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** An element of a known type, such as an `<input>` or a `<select>`. */
export function byIdAs<T extends Element>(id: string, type: ElementType<T>): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Étude: #${id} is not a ${type.name}`);
  return el;
}

export const inputById = (id: string): HTMLInputElement => byIdAs(id, HTMLInputElement);
export const selectById = (id: string): HTMLSelectElement => byIdAs(id, HTMLSelectElement);
export const buttonById = (id: string): HTMLButtonElement => byIdAs(id, HTMLButtonElement);

/** The element an event started on, or null when it didn't start on one. */
export function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

/** The nearest HTML ancestor of an event's target that matches a selector. */
export function eventClosest(event: Event, selector: string): HTMLElement | null {
  const found = eventElement(event)?.closest(selector);
  return found instanceof HTMLElement ? found : null;
}

/** A document, fragment or element that can be searched with a selector. */
type QueryRoot = Document | DocumentFragment | Element;

/** An element's own HTML child or descendant matching a selector, if any. */
export function queryHtml(root: QueryRoot, selector: string): HTMLElement | null {
  const found = root.querySelector(selector);
  return found instanceof HTMLElement ? found : null;
}

/** Every HTML element under a root matching a selector. */
export function queryAllHtml(root: QueryRoot, selector: string): HTMLElement[] {
  return [...root.querySelectorAll(selector)].filter((el): el is HTMLElement => el instanceof HTMLElement);
}

/**
 * One Tab stop for a long list of controls (WAI-ARIA roving tabindex): the current item, else the first visible one, has
 * tabindex 0 and the others -1; the arrow keys, Home and End move focus between the visible items, and the item last
 * focused stays the Tab stop. Enter and Space keep doing what each item does. Call it again after the list is redrawn.
 */
export function rovingFocus(container: Element, itemSelector: string, isCurrent: (el: HTMLElement | SVGElement) => boolean = () => false): void {
  const visibleItems = () => [...container.querySelectorAll<HTMLElement | SVGElement>(itemSelector)].filter((el) => el.getClientRects().length > 0);
  const all = [...container.querySelectorAll<HTMLElement | SVGElement>(itemSelector)];
  const shown = visibleItems();
  const stop = shown.find(isCurrent) ?? shown[0] ?? all[0];
  all.forEach((el) => { el.tabIndex = el === stop ? 0 : -1; });
  if (!(container instanceof HTMLElement || container instanceof SVGElement) || container.dataset.roving) return;
  container.dataset.roving = '1';
  container.addEventListener('focusin', (e) => {
    const item = e.target instanceof Element ? e.target.closest<HTMLElement | SVGElement>(itemSelector) : null;
    if (!item || !container.contains(item)) return;
    container.querySelectorAll<HTMLElement | SVGElement>(itemSelector).forEach((el) => { el.tabIndex = el === item ? 0 : -1; });
  });
  container.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    const k = e.key;
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(k)) return;
    const list = visibleItems(), i = list.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = k === 'Home' ? 0 : k === 'End' ? list.length - 1 : (i + (k === 'ArrowDown' || k === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
    list[n].focus();
  });
}

type PageDocument = Pick<Document, 'visibilityState' | 'addEventListener'>;
type PageWindow = Pick<Window, 'addEventListener'>;

/** Runs `handler` when the page is shown again: the tab becomes visible, or the back/forward cache restores it. */
export function onPageReturn(handler: () => void, doc: PageDocument = document, win: PageWindow = window): void {
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') handler(); });
  win.addEventListener('pageshow', (event) => { if (event.persisted) handler(); });
}

/** Triggers a browser file download for a generated Blob and revokes the object URL afterwards. */
export function downloadBlob(name: string, blob: Blob | MediaSource): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
