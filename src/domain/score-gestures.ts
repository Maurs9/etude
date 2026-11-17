interface GesturePoint { x: number; y: number; }
export interface ScoreSelectionGesture {
  move: (event: PointerEvent) => void;
  finish: (event: PointerEvent) => void;
  cancel: () => void;
}
interface ScoreGestureOptions {
  selecting: () => boolean;
  select: (event: PointerEvent) => ScoreSelectionGesture | undefined;
  getZoom: () => number;
  zoom: (value: number) => void;
}

/** Own the whole gesture: a second contact cancels selection until all contacts lift. */
export function bindScoreGestures(box: HTMLElement, options: ScoreGestureOptions): () => void {
  const points = new Map<number, GesturePoint>();
  let selection: ScoreSelectionGesture | undefined;
  let start: GesturePoint | undefined;
  let navigating = false;
  let multi = false;
  let previous: { x: number; y: number; distance: number } | undefined;
  let initialDistance = 0, initialZoom = 1;
  const geometry = () => {
    const [a, b] = [...points.values()];
    if (!a) return undefined;
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) }
      : { ...a, distance: 0 };
  };
  const cancel = () => {
    selection?.cancel();
    selection = undefined;
  };
  const reset = () => {
    cancel();
    for (const id of points.keys()) if (box.hasPointerCapture(id)) box.releasePointerCapture(id);
    points.clear();
    start = previous = undefined;
    multi = navigating = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelled);
    window.removeEventListener('blur', reset);
    window.removeEventListener('pagehide', reset);
  };
  const move = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const current = geometry();
    if (!current || !previous || !start) return;
    if (!navigating && !options.selecting() && Math.hypot(current.x - start.x, current.y - start.y) >= 5) {
      navigating = true;
      cancel();
    }
    if (navigating) {
      event.preventDefault();
      box.scrollLeft += previous.x - current.x;
      box.scrollTop += previous.y - current.y;
      if (multi && points.size >= 2 && initialDistance > 0) options.zoom(initialZoom * current.distance / initialDistance);
    }
    if (!navigating) selection?.move(event);
    previous = current;
  };
  const up = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    // Finish only a single-contact tap or selection; navigation preserves the selection.
    if (navigating) cancel();
    else { selection?.finish(event); selection = undefined; }
    points.delete(event.pointerId);
    if (box.hasPointerCapture(event.pointerId)) box.releasePointerCapture(event.pointerId);
    previous = geometry();
    if (points.size >= 2) { initialDistance = previous?.distance ?? 0; initialZoom = options.getZoom(); }
    if (!points.size) reset();
  };
  const cancelled = (event: PointerEvent) => { if (points.has(event.pointerId)) reset(); };
  box.addEventListener('lostpointercapture', cancelled);
  box.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !box.querySelector('svg') || (event.target instanceof Element && event.target.closest('.an-empty'))) return;
    if (event.target === box && (event.offsetX >= box.clientWidth || event.offsetY >= box.clientHeight)) return;
    event.preventDefault();
    if (!points.size) {
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelled);
      window.addEventListener('blur', reset);
      window.addEventListener('pagehide', reset);
      start = { x: event.clientX, y: event.clientY };
    }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    box.setPointerCapture(event.pointerId);
    if (points.size > 1) {
      cancel();
      multi = navigating = true;
      initialDistance = geometry()?.distance ?? 0;
      initialZoom = options.getZoom();
    } else if (!multi) selection = options.select(event);
    previous = geometry();
  });
  return reset;
}
