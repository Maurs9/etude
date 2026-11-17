import { afterEach, expect, test, vi } from 'vitest';
import { bindScoreGestures } from '../../src/domain/score-gestures.ts';

class Surface extends EventTarget {
  scrollLeft = 100;
  scrollTop = 100;
  clientWidth = 500;
  clientHeight = 500;
  captures = new Set();
  querySelector() { return {}; }
  closest() { return null; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}
function pointer(target, type, id, x, y, extra = {}) {
  const event = new Event(type, { cancelable: true });
  const { timeStamp, ...rest } = extra;
  Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y, offsetX: 1, offsetY: 1, pointerType: 'touch', ...rest });
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}
function setup(selecting = true) {
  const win = new EventTarget(), box = new Surface();
  vi.stubGlobal('window', win);
  vi.stubGlobal('Element', Surface);
  const cancel = vi.fn(), move = vi.fn(), finish = vi.fn();
  const select = vi.fn(() => ({ cancel, move, finish })), zoom = vi.fn(), commitZoom = vi.fn();
  const selectingFn = typeof selecting === 'function' ? selecting : () => selecting;
  const reset = bindScoreGestures(box, { selecting: selectingFn, select, zoom, commitZoom, getZoom: () => 1 });
  return { win, box, cancel, move, finish, select, zoom, commitZoom, reset };
}
afterEach(() => vi.unstubAllGlobals());

test.each([true, false])('single-contact tap finishes once with selecting=%s', (selecting) => {
  const { win, box, select, cancel, commitZoom } = setup(selecting);
  pointer(box, 'pointerdown', 1, 100, 100);
  const gesture = select.mock.results[0].value;
  pointer(win, 'pointerup', 99, 100, 100);
  expect(gesture.finish).not.toHaveBeenCalled();
  pointer(win, 'pointerup', 1, 100, 100);
  pointer(win, 'pointerup', 1, 100, 100);
  expect(gesture.finish).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
  expect(commitZoom).not.toHaveBeenCalled();
});

test('second pointer cancels selection, pans and zooms with anchor, commits once on lift, and never restarts selection until all lift', async () => {
  const { win, box, cancel, select, zoom, commitZoom } = setup();
  pointer(box, 'pointerdown', 1, 100, 100);
  pointer(box, 'pointerdown', 2, 200, 100);
  expect(cancel).toHaveBeenCalledTimes(1);
  pointer(win, 'pointermove', 2, 250, 100);
  expect(zoom).toHaveBeenLastCalledWith(1.5, { x: 175, y: 100 });
  expect(box.scrollLeft).toBe(75);
  expect(commitZoom).not.toHaveBeenCalled();
  pointer(win, 'pointerup', 2, 250, 100);
  expect(commitZoom).toHaveBeenCalledTimes(1);
  pointer(win, 'pointermove', 1, 100, 130);
  expect(box.scrollTop).toBe(70);
  expect(select).toHaveBeenCalledTimes(1);
  pointer(win, 'pointerup', 1, 100, 130);
  expect(commitZoom).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  pointer(box, 'pointerdown', 3, 100, 100);
  expect(select).toHaveBeenCalledTimes(2);
});

test('pointercancel while pinching commits zoom once', () => {
  const { win, box, zoom, commitZoom } = setup(false);
  pointer(box, 'pointerdown', 1, 100, 100);
  pointer(box, 'pointerdown', 2, 200, 100);
  pointer(win, 'pointermove', 2, 240, 100);
  expect(zoom).toHaveBeenCalled();
  expect(commitZoom).not.toHaveBeenCalled();
  pointer(win, 'pointercancel', 1, 100, 100);
  expect(commitZoom).toHaveBeenCalledTimes(1);
});

test('hand tool preserves taps but cancels selection when dragging; unrelated pointers do nothing', () => {
  const { win, box, cancel, zoom, commitZoom } = setup(false);
  pointer(box, 'pointerdown', 1, 100, 100);
  pointer(win, 'pointermove', 99, 100, 180);
  expect(cancel).not.toHaveBeenCalled();
  pointer(win, 'pointermove', 1, 100, 130);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(box.scrollTop).toBe(70);
  expect(zoom).not.toHaveBeenCalled();
  expect(commitZoom).not.toHaveBeenCalled();
});

test('stylus pen selects directly even when hand tool is active', () => {
  const { win, box, cancel, finish, move } = setup((e) => e.pointerType === 'pen');
  pointer(box, 'pointerdown', 1, 100, 100, { pointerType: 'pen' });
  pointer(win, 'pointermove', 1, 140, 140, { pointerType: 'pen' });
  expect(cancel).not.toHaveBeenCalled();
  expect(move).toHaveBeenCalledTimes(1);
  expect(box.scrollTop).toBe(100);
  pointer(win, 'pointerup', 1, 140, 140, { pointerType: 'pen' });
  expect(finish).toHaveBeenCalledTimes(1);

  pointer(box, 'pointerdown', 2, 100, 100, { pointerType: 'touch' });
  pointer(win, 'pointermove', 2, 100, 130, { pointerType: 'touch' });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(box.scrollTop).toBe(70);
});

test('inertial scroll continues after fast hand swipe, stops on new pointerdown, and skips after pause', () => {
  const frames = new Map();
  let nextId = 1;
  let now = 1000;
  const { win, box } = setup(false);
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (cb) => { const id = nextId++; frames.set(id, cb); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id) => { frames.delete(id); });

  box.scrollTop = 200;
  pointer(box, 'pointerdown', 1, 100, 200, { timeStamp: 1000 });
  pointer(win, 'pointermove', 1, 100, 150, { timeStamp: 1016 });
  pointer(win, 'pointermove', 1, 100, 100, { timeStamp: 1032 });
  const afterDrag = box.scrollTop;
  expect(afterDrag).toBe(300);
  pointer(win, 'pointerup', 1, 100, 100, { timeStamp: 1040 });
  expect(frames.size).toBe(1);

  now = 1056;
  const [, cb1] = [...frames.entries()][0];
  frames.clear();
  cb1(1056);
  expect(box.scrollTop).toBeGreaterThan(afterDrag);
  expect(frames.size).toBe(1);

  // New touch stops inertia immediately.
  pointer(box, 'pointerdown', 2, 100, 100, { timeStamp: 1060 });
  expect(frames.size).toBe(0);
  pointer(win, 'pointerup', 2, 100, 100, { timeStamp: 1070 });

  // Holding still (> 80ms) before lift triggers no inertia.
  pointer(box, 'pointerdown', 3, 100, 200, { timeStamp: 2000 });
  pointer(win, 'pointermove', 3, 100, 140, { timeStamp: 2016 });
  pointer(win, 'pointerup', 3, 100, 140, { timeStamp: 2150 });
  expect(frames.size).toBe(0);
});

test.each(['pointercancel', 'lostpointercapture', 'blur', 'pagehide'])('%s cleans up active selection and event handlers', (type) => {
  const { win, box, cancel, select } = setup();
  pointer(box, 'pointerdown', 1, 100, 100);
  if (type === 'lostpointercapture') pointer(box, type, 1, 100, 100);
  else if (type === 'pointercancel') pointer(win, type, 1, 100, 100);
  else win.dispatchEvent(new Event(type));
  expect(cancel).toHaveBeenCalledTimes(1);
  pointer(win, 'pointermove', 1, 100, 160);
  expect(box.scrollTop).toBe(100);
  pointer(box, 'pointerdown', 2, 100, 100);
  expect(select).toHaveBeenCalledTimes(2);
});
