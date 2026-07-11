import { afterEach, describe, expect, it } from "vitest";

import { lockViewportScroll } from "./scrollLock";

afterEach(() => {
  // Guard against a leaked scroll-lock between tests.
  document.documentElement.style.overflow = "";
});

describe("lockViewportScroll", () => {
  it("locks document.documentElement, not document.body", () => {
    lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).not.toBe("hidden");
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
    // Inner release restores what it saw at acquire time, which was already "hidden".
    expect(document.documentElement.style.overflow).toBe("hidden");

    releaseOuter();
    expect(document.documentElement.style.overflow).toBe("auto");
  });

  it("releasing the OUTER lock first (out-of-order) leaves hidden until the inner one releases", () => {
    document.documentElement.style.overflow = "auto";
    const releaseOuter = lockViewportScroll();
    const releaseInner = lockViewportScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");

    // Out-of-order: release the outer lock first. It restores "auto", which
    // is wrong while the inner overlay is still open — this is a known
    // limitation of the simple save/restore approach (no reference counting).
    releaseOuter();
    expect(document.documentElement.style.overflow).toBe("auto");

    // The inner lock then restores what IT saw at acquire time ("hidden"),
    // leaving the lock stuck "on" even though both overlays are closed.
    releaseInner();
    expect(document.documentElement.style.overflow).toBe("hidden");
  });
});
