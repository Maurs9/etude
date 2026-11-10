import { describe, expect, it, vi } from 'vitest';
import { onPageReturn } from '../../src/domain/dom.ts';

describe('page return', () => {
  it('calls the return handler only when the page becomes visible or is restored from the cache', () => {
    const doc = new EventTarget(), win = new EventTarget(), handler = vi.fn();
    doc.visibilityState = 'hidden';
    onPageReturn(handler, doc, win);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(handler).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(handler).toHaveBeenCalledTimes(1);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(handler).toHaveBeenCalledTimes(1);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
