export interface HeroTrendPoint {
  /** Display label already formatted by formatDay (e.g. "7/30"); the X category. */
  date: string;
  value: number;
  /** YYYY-MM-DD. */
  iso: string;
}

export interface HeroTrendMeta {
  /** [min, max] with proportional headroom, snapped outward to the nearest
   *  yTicks boundary so the outermost ticks are never clipped. */
  yDomain: [number, number];
  /** Y-axis tick values, on a nice step; yDomain is snapped to match them so
   *  the outermost ticks are never clipped. Pass straight to <YAxis ticks>. */
  yTicks: number[];
  /** First point's value = the baseline the hero delta is measured from. */
  startValue: number;
  /** Last point's value — equals the hero headline number (plan-032 invariant). */
  endValue: number;
  /** endValue − startValue. */
  change: number;
  /** X-axis ticks: a de-duplicated subset of point.date, first and last always in. */
  ticks: string[];
}

/**
 * The "nice" step for an axis: 1, 2, 2.5 or 5 × a power of ten — the sequence
 * that reads cleanly once formatCompactNumber turns it into 萬/億 (20萬, 50萬,
 * 1億). Derived from the span the data actually occupies, never from zero.
 */
function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(1, targetTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/**
 * Chart geometry for the Overview hero net-worth trend.
 *
 * Y domain: padded by 15% of the visible range so the line sits inside the
 * frame. A flat series has zero range, so it falls back to 2% of the magnitude
 * (and a 1-unit floor at zero) — never a fixed absolute pad, which is what the
 * old `dataMin - 20000` did: invisible on a 13M portfolio, dominant on a 50k one.
 * Works for negative net worth (liabilities > assets) — the pad is applied to
 * min/max, not to |value|.
 *
 * Returns null when there is nothing to draw (fewer than 2 points); the caller
 * renders the "not enough data yet" hint instead.
 */
export function buildHeroTrendMeta(
  points: HeroTrendPoint[],
  options?: { maxTicks?: number; yTickCount?: number },
): HeroTrendMeta | null {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = range > 0 ? range * 0.15 : Math.max(Math.abs(max) * 0.02, 1);
  const paddedMin = min - pad;
  const paddedMax = max + pad;
  const step = niceStep(paddedMax - paddedMin, options?.yTickCount ?? 5);
  const niceMin = Math.floor(paddedMin / step) * step;
  const niceMax = Math.ceil(paddedMax / step) * step;
  const yDomain: [number, number] = [niceMin, niceMax];

  const yTicks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    // Kill float dust (0.1 + 0.2 style) so ticks land on exact multiples.
    yTicks.push(Math.round(v / step) * step);
  }

  const startValue = points[0].value;
  const endValue = points[points.length - 1].value;
  const change = endValue - startValue;

  const maxTicksRaw = options?.maxTicks ?? 6;
  const maxTicks = Math.max(2, maxTicksRaw);
  const tickCount = Math.min(maxTicks, points.length);

  const rawTicks: string[] = [];
  if (tickCount === 1) {
    rawTicks.push(points[0].date);
  } else {
    for (let i = 0; i < tickCount; i++) {
      const idx = Math.round((i * (points.length - 1)) / (tickCount - 1));
      rawTicks.push(points[idx].date);
    }
  }

  const ticks: string[] = [];
  for (const t of rawTicks) {
    if (!ticks.includes(t)) ticks.push(t);
  }

  return { yDomain, yTicks, startValue, endValue, change, ticks };
}
