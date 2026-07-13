import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { noteLocalChange, setPushFlushHandler, _resetPushScheduler } from "./pushScheduler";

describe("pushScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetPushScheduler();
    setPushFlushHandler(null);
    vi.useRealTimers();
  });

  it("fires the handler once, 30s after the last noteLocalChange", () => {
    const flush = vi.fn();
    setPushFlushHandler(flush);

    noteLocalChange();
    // Multiple calls inside the quiet window coalesce; each restarts the timer.
    vi.advanceTimersByTime(10_000);
    noteLocalChange();
    vi.advanceTimersByTime(29_999);
    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not throw or fire when no handler is registered", () => {
    setPushFlushHandler(null);
    expect(() => {
      noteLocalChange();
      vi.advanceTimersByTime(30_000);
    }).not.toThrow();
  });

  it("does not fire after the handler is unregistered", () => {
    const flush = vi.fn();
    setPushFlushHandler(flush);

    noteLocalChange();
    setPushFlushHandler(null);
    vi.advanceTimersByTime(30_000);

    expect(flush).not.toHaveBeenCalled();
  });

  it("_resetPushScheduler clears a pending timer", () => {
    const flush = vi.fn();
    setPushFlushHandler(flush);

    noteLocalChange();
    _resetPushScheduler();
    vi.advanceTimersByTime(30_000);

    expect(flush).not.toHaveBeenCalled();
  });
});
