/**
 * Lock viewport scrolling while an overlay is open.
 *
 * The lock goes on <html>, NOT <body>: globals.css sets
 * `html { overflow-x: clip }`, and per the CSS overflow spec a body
 * `overflow: hidden` only propagates to the viewport when the ROOT element's
 * overflow is fully `visible`. A body-level lock therefore (a) fails to stop
 * the page from scrolling and (b) turns <body> into a clip container, which
 * silently disables every `position: sticky` descendant — the app sidebar
 * scrolled away behind open drawers (plan 155).
 *
 * Ref-counted: the first acquire saves the pre-existing inline value and
 * locks; the last release restores it. Release handles are idempotent (each
 * releases its own count at most once), and release order does not matter —
 * unlike a naive save/restore-per-handle scheme, where an overlay opening
 * while an outer overlay was still mid-exit-animation could capture that
 * outer overlay's `"hidden"` as its own "previous" value, and later restore
 * `"hidden"` instead of the original value, stranding the page unscrollable
 * (the 對帳→編輯交易 regression). Returns the release function.
 */
let lockCount = 0;
let savedOverflow = "";

export function lockViewportScroll(): () => void {
  const root = document.documentElement;
  if (lockCount === 0) {
    savedOverflow = root.style.overflow; // whatever inline value predates ALL overlays
    root.style.overflow = "hidden";
  }
  lockCount += 1;
  let released = false; // each handle releases at most once
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) root.style.overflow = savedOverflow;
  };
}
