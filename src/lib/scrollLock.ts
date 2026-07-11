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
 * Re-entrant: nested overlays each get a release() that restores the value
 * saved at their own acquire time (same semantics the previous inline code
 * had). Returns the release function.
 */
export function lockViewportScroll(): () => void {
  const root = document.documentElement;
  const previous = root.style.overflow;
  root.style.overflow = "hidden";
  return () => {
    root.style.overflow = previous;
  };
}
