import { afterEach, describe, expect, it } from "vitest";

import { lockViewportScroll } from "./scrollLock";

afterEach(() => {
  // Guard against a leaked scroll-lock between tests.
  document.documentElement.style.overflow = "";
});

describe("lockViewportScroll", () => {
  it("locks document.documentElement, not document.body", () => {
    const release = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).not.toBe("hidden");
    release();
  });

  it("release restores the prior inline value when it was empty", () => {
    document.documentElement.style.overflow = "";
    const release = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    release();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("release restores the prior inline value when it was set", () => {
    document.documentElement.style.overflow = "auto";
    const release = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    release();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("nested acquire/release in LIFO order restores the original value", () => {
    document.documentElement.style.overflow = "auto";
    const releaseOuter = lockViewportScroll();
    const releaseInner = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseInner();
    // Still locked: the outer handle's count hasn't been released yet.
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseOuter();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("releasing the OUTER lock first (out-of-order) stays locked until the inner one also releases", () => {
    document.documentElement.style.overflow = "auto";
    const releaseOuter = lockViewportScroll();
    const releaseInner = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    // Out-of-order: release the outer lock first. With ref-counting this
    // only decrements the count — the inner overlay is still open, so the
    // lock correctly stays engaged (fixed: previously this restored "auto"
    // early, then the inner release re-applied "hidden" and stranded it).
    releaseOuter();
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseInner();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("regression: interleaved close (A locks, B locks, A releases, B releases) still restores original", () => {
    // The 對帳→編輯交易 bug: an overlay's release ran while another overlay's
    // acquire/release interleaved with it, out of LIFO order. Old code left
    // the viewport stuck at "hidden"; ref-counting must not.
    const releaseA = lockViewportScroll();
    const releaseB = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseA();
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseB();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("release is idempotent: calling one handle's release twice only releases one count", () => {
    const releaseA = lockViewportScroll();
    const releaseB = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseA();
    releaseA(); // second call on the same handle must be a no-op
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseB();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("pre-existing inline value survives a lock/release cycle", () => {
    document.documentElement.style.overflow = "scroll";
    const release = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    release();
    expect(document.documentElement.style.overflow).toBe("scroll");
  });
});
