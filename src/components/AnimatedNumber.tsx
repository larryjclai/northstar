import { useEffect, useRef, useState } from "react";

import { isPrivacyMaskOn } from "../domain/currency";

const DURATION_MS = 560;
/** Same fast-start/slow-settle character as --ns-ease-out-strong. */
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

export interface AnimatedNumberProps {
  /** Raw numeric value. null/NaN renders `fallback` with no animation. */
  value: number | null;
  /** Formats a frame's interpolated value (e.g. formatMoney). */
  format: (n: number) => string;
  /** Rendered when value is null/non-finite (e.g. "—"). */
  fallback?: string;
  /**
   * Identity of WHAT is being measured (e.g. `${metricKey}:${bookId}`).
   * When it changes, snap — a context switch is not a data change.
   */
  resetKey?: string;
}

/**
 * Tweens displayed numbers on value change (plan 246). Pure content tween via
 * rAF — CSS can't interpolate text. Snaps (no animation) on: first mount,
 * resetKey change, reduced motion, privacy mask, and null/non-finite values.
 * Interruptible: a new value mid-tween retargets from the currently shown
 * value. Render inside a tabular-nums container so digits don't shift layout.
 */
export function AnimatedNumber({ value, format, fallback = "—", resetKey }: AnimatedNumberProps) {
  const [text, setText] = useState<string>(() =>
    value != null && Number.isFinite(value) ? format(value) : fallback,
  );
  // The numeric value currently shown — the retarget starting point.
  const shownRef = useRef<number | null>(value != null && Number.isFinite(value) ? value : null);
  const rafRef = useRef<number>(0);
  const prevResetKeyRef = useRef(resetKey);
  const formatRef = useRef(format);
  // Written in an effect (not during render): a ref write during render is
  // unsafe under concurrent rendering — React may render and discard the
  // result (StrictMode double-render, an interrupted render), but the ref
  // mutation would still have happened (plan 274, react-hooks/refs).
  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const target = value != null && Number.isFinite(value) ? value : null;
    const resetChanged = prevResetKeyRef.current !== resetKey;
    prevResetKeyRef.current = resetKey;

    cancelAnimationFrame(rafRef.current);

    if (target == null) {
      shownRef.current = null;
      setText(fallback);
      return;
    }

    const from = shownRef.current;
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const snap = from == null || resetChanged || reduceMotion || isPrivacyMaskOn();

    if (snap || formatRef.current(from as number) === formatRef.current(target)) {
      shownRef.current = target;
      setText(formatRef.current(target));
      return;
    }

    const start = performance.now();
    const startValue = from as number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      const v = startValue + (target - startValue) * easeOutCubic(p);
      shownRef.current = v;
      setText(formatRef.current(v));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        shownRef.current = target;
        setText(formatRef.current(target));
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, resetKey, fallback]);

  return <>{text}</>;
}
