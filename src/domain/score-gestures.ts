interface GesturePoint { x: number; y: number; }
export interface ScoreSelectionGesture {
  move: (event: PointerEvent) => void;
  finish: (event: PointerEvent) => void;
  cancel: () => void;
}
interface ScoreGestureOptions {
  selecting: (event: PointerEvent) => boolean;
  select: (event: PointerEvent) => ScoreSelectionGesture | undefined;
  getZoom: () => number;
  zoom: (value: number, anchor?: GesturePoint) => void;
  commitZoom?: () => void;
}

/** Own the whole gesture: a second contact cancels selection until all contacts lift. */
export function bindScoreGestures(box: HTMLElement, options: ScoreGestureOptions): () => void {
  const points = new Map<number, GesturePoint>();
  let selection: ScoreSelectionGesture | undefined;
  let start: GesturePoint | undefined;
  let activeSelecting = false;
  let navigating = false;
  let multi = false;
  let pinching = false;
  let previous: { x: number; y: number; distance: number } | undefined;
  let initialDistance = 0, initialZoom = 1;
  let vx = 0, vy = 0, lastMoveTime = 0, inertiaRaf = 0;
  const nowMs = (ts?: number) => (ts && ts > 0 ? ts : (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const stopInertia = () => {
    if (inertiaRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(inertiaRaf);
    inertiaRaf = 0;
  };
  const startInertia = (initVx: number, initVy: number) => {
    if (typeof requestAnimationFrame !== 'function') return;
    stopInertia();
    let curVx = initVx, curVy = initVy;
    let prevTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const step = (ts: number) => {
      const dt = Math.min(32, Math.max(1, ts - prevTs));
      prevTs = ts;
      const oldLeft = box.scrollLeft, oldTop = box.scrollTop;
      box.scrollLeft += curVx * dt;
      box.scrollTop += curVy * dt;
      if (Math.abs(box.scrollLeft - oldLeft) < 0.01) curVx = 0;
      if (Math.abs(box.scrollTop - oldTop) < 0.01) curVy = 0;
      const decay = Math.pow(0.92, dt / 16.67);
      curVx *= decay;
      curVy *= decay;
      if (Math.hypot(curVx, curVy) >= 0.03) inertiaRaf = requestAnimationFrame(step);
      else inertiaRaf = 0;
    };
    inertiaRaf = requestAnimationFrame(step);
  };
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
  const commitPinch = () => {
    if (!pinching) return;
    pinching = false;
    options.commitZoom?.();
  };
  const reset = () => {
    stopInertia();
    cancel();
    commitPinch();
    for (const id of points.keys()) if (box.hasPointerCapture(id)) box.releasePointerCapture(id);
    points.clear();
    start = previous = undefined;
    activeSelecting = multi = navigating = false;
    vx = vy = lastMoveTime = 0;
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
    if (!navigating && !activeSelecting && Math.hypot(current.x - start.x, current.y - start.y) >= 5) {
      navigating = true;
      cancel();
      vx = vy = 0;
    }
    if (navigating) {
      event.preventDefault();
      const dx = previous.x - current.x, dy = previous.y - current.y;
      box.scrollLeft += dx;
      box.scrollTop += dy;
      if (!multi) {
        const ts = nowMs(event.timeStamp);
        const dt = Math.max(1, ts - lastMoveTime);
        if (dt > 80) { vx = 0; vy = 0; }
        else { vx = vx * 0.4 + (dx / dt) * 0.6; vy = vy * 0.4 + (dy / dt) * 0.6; }
        lastMoveTime = ts;
      }
      if (multi && points.size >= 2 && initialDistance > 0) {
        pinching = true;
        options.zoom(initialZoom * current.distance / initialDistance, { x: current.x, y: current.y });
      }
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
    if (points.size < 2) commitPinch();
    previous = geometry();
    if (points.size >= 2) { initialDistance = previous?.distance ?? 0; initialZoom = options.getZoom(); }
    if (!points.size) {
      const ts = nowMs(event.timeStamp);
      const fling = navigating && !multi && lastMoveTime > 0 && (ts - lastMoveTime) <= 80 && Math.hypot(vx, vy) > 0.12
        ? { vx, vy } : null;
      reset();
      if (fling) startInertia(fling.vx, fling.vy);
    }
  };
  const cancelled = (event: PointerEvent) => { if (points.has(event.pointerId)) reset(); };
  box.addEventListener('lostpointercapture', cancelled);
  box.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !box.querySelector('svg') || (event.target instanceof Element && event.target.closest('.an-empty'))) return;
    if (event.target === box && (event.offsetX >= box.clientWidth || event.offsetY >= box.clientHeight)) return;
    event.preventDefault();
    stopInertia();
    if (!points.size) {
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancelled);
      window.addEventListener('blur', reset);
      window.addEventListener('pagehide', reset);
      start = { x: event.clientX, y: event.clientY };
      activeSelecting = options.selecting(event);
      vx = vy = 0;
      lastMoveTime = nowMs(event.timeStamp);
    }
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { box.setPointerCapture(event.pointerId); } catch {}
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
