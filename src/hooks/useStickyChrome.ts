import { useCallback, useEffect, useState } from "react";

/**
 * Wiring for a condensing page header (plan 284).
 *
 *   sentinelRef — a 1px out-of-flow marker rendered *just before* the chrome.
 *                 Its own position never changes, so "sentinel left the
 *                 viewport" is exactly "the chrome is now pinned". A plain
 *                 `scrollY > 0` check would be wrong: `.ns-page pt-6` puts the
 *                 chrome 24px down the page, so it would condense before it
 *                 actually sticks (same reasoning as the analytics nav's
 *                 sentinel, InvestmentsAnalyticsTab.tsx:690-712).
 *   chromeRef   — measured into --ns-page-chrome-h so descendants (the
 *                 analytics section nav, the desktop side columns) can pin
 *                 below the chrome instead of behind it.
 *   condensed   — drives both `data-stuck` (the .ns-scroll-edge hairline) and
 *                 the condensed layout state.
 *
 * Height is reported in both states on purpose: it is read by descendants that
 * only pin while scrolled, which is exactly when the condensed height is the
 * current one.
 *
 * Both refs are *callback* refs (state-backed), not plain `useRef` objects.
 * CashFlowRoute/InvestmentsRoute both render an `isInitialLoading`/`isError`
 * branch before the branch that contains the chrome — so on first mount the
 * sentinel/chrome nodes don't exist yet. A plain `useRef` + `useEffect(fn, [])`
 * reads `.current === null` on that first (and only) run and never attaches,
 * so condensing silently never engages once the real content mounts. This is
 * the same failure mode InvestmentsAnalyticsTab.tsx's own sentinel comment
 * calls out (there worked around with a `navCanRender` dependency); a callback
 * ref fixes it generally, without this hook needing to know each route's
 * particular gating condition.
 */
export function useStickyChrome() {
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => setSentinelEl(el), []);

  const [chromeEl, setChromeEl] = useState<HTMLDivElement | null>(null);
  const chromeRef = useCallback((el: HTMLDivElement | null) => setChromeEl(el), []);

  const [condensed, setCondensed] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(([entry]) => setCondensed(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl]);

  useEffect(() => {
    if (!chromeEl) return;
    const measure = () => setHeight(chromeEl.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    // ResizeObserver's default observed box is content-box, which does NOT
    // include padding — condensing animates `padding-block` (globals.css),
    // so a content-box-only observer never re-fires for that change and
    // --ns-page-chrome-h goes stale by exactly the padding amount, pulling
    // descendants (the analytics section nav) up into the chrome. Observe
    // border-box instead so padding/border changes are covered too.
    observer.observe(chromeEl, { box: "border-box" });
    return () => observer.disconnect();
  }, [chromeEl]);

  return { sentinelRef, chromeRef, condensed, height };
}
