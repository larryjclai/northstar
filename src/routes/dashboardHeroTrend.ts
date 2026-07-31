export interface HeroTrendPoint {
  /** Display label already formatted by formatDay (e.g. "7/30"); the X category. */
  date: string;
  value: number;
  /** YYYY-MM-DD. */
  iso: string;
}

export interface HeroTrendMeta {
  /** [min, max] with proportional headroom so the line never touches the frame. */
  yDomain: [number, number];
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
  options?: { maxTicks?: number },
): HeroTrendMeta | null {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = range > 0 ? range * 0.15 : Math.max(Math.abs(max) * 0.02, 1);
  const yDomain: [number, number] = [min - pad, max + pad];

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

  return { yDomain, startValue, endValue, change, ticks };
}
