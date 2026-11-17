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
function pointer(target, type, id, x, y) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: id, button: 0, clientX: x, clientY: y, offsetX: 1, offsetY: 1 });
  target.dispatchEvent(event);
}
function setup(selecting = true) {
  const win = new EventTarget(), box = new Surface();
  vi.stubGlobal('window', win);
  vi.stubGlobal('Element', Surface);
  const cancel = vi.fn(), select = vi.fn(() => ({ cancel, move: vi.fn(), finish: vi.fn() })), zoom = vi.fn();
  const reset = bindScoreGestures(box, { selecting: () => selecting, select, zoom, getZoom: () => 1 });
  return { win, box, cancel, select, zoom, reset };
}
afterEach(() => vi.unstubAllGlobals());

test.each([true, false])('single-contact tap finishes once with selecting=%s', (selecting) => {
  const { win, box, select, cancel } = setup(selecting);
  pointer(box, 'pointerdown', 1, 100, 100);
  const gesture = select.mock.results[0].value;
  pointer(win, 'pointerup', 99, 100, 100);
  expect(gesture.finish).not.toHaveBeenCalled();
  pointer(win, 'pointerup', 1, 100, 100);
  pointer(win, 'pointerup', 1, 100, 100);
  expect(gesture.finish).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
});

test('second pointer cancels selection, pans and zooms, and never restarts selection until all lift', async () => {
  const { win, box, cancel, select, zoom } = setup();
  pointer(box, 'pointerdown', 1, 100, 100);
  pointer(box, 'pointerdown', 2, 200, 100);
  expect(cancel).toHaveBeenCalledTimes(1);
  pointer(win, 'pointermove', 2, 250, 100);
  expect(zoom).toHaveBeenLastCalledWith(1.5);
  expect(box.scrollLeft).toBe(75);
  pointer(win, 'pointerup', 2, 250, 100);
  pointer(win, 'pointermove', 1, 100, 130);
  expect(box.scrollTop).toBe(70);
  expect(select).toHaveBeenCalledTimes(1);
  pointer(win, 'pointerup', 1, 100, 130);
  await Promise.resolve();
  pointer(box, 'pointerdown', 3, 100, 100);
  expect(select).toHaveBeenCalledTimes(2);
});

test('hand tool preserves taps but cancels selection when dragging; unrelated pointers do nothing', () => {
  const { win, box, cancel, zoom } = setup(false);
  pointer(box, 'pointerdown', 1, 100, 100);
  pointer(win, 'pointermove', 99, 100, 180);
  expect(cancel).not.toHaveBeenCalled();
  pointer(win, 'pointermove', 1, 100, 130);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(box.scrollTop).toBe(70);
  expect(zoom).not.toHaveBeenCalled();
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
