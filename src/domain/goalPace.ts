/**
 * goalPace — pace indicator for custom savings goals with a target date.
 *
 * Design decisions (Plan 028):
 * - Linear expected progress: expectedPct = clamp((now − startDate) / (targetDate − startDate), 0, 1) × 100
 * - delta = actualPct − expectedPct
 * - ahead: delta ≥ +2pp; behind: delta ≤ −2pp; onTrack otherwise
 * - Past targetDate & < 100% → behind
 * - null targetDate or startDate === targetDate → status "none"
 */

export type GoalPaceStatus = "ahead" | "behind" | "onTrack" | "none";

export interface GoalPace {
  status: GoalPaceStatus;
  /** Expected progress percentage at `now`, or null when status is "none". */
  expectedPct: number | null;
  /** actualPct − expectedPct in percentage points, or null when status is "none". */
  deltaPp: number | null;
}

const AHEAD_THRESHOLD = 2;
const BEHIND_THRESHOLD = -2;

function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

export function goalPace(opts: {
  startDate: string;
  targetDate: string | null;
  actualPct: number;
  /** ISO date string for "today"; defaults to new Date() */
  now?: string;
}): GoalPace {
  const { startDate, targetDate, actualPct } = opts;
  const nowStr = opts.now ?? new Date().toISOString().slice(0, 10);

  if (!targetDate) return { status: "none", expectedPct: null, deltaPp: null };

  const totalDays = daysBetween(startDate, targetDate);
  // Guard: zero-length range → no meaningful pace
  if (totalDays <= 0) return { status: "none", expectedPct: null, deltaPp: null };

  const elapsed = daysBetween(startDate, nowStr);
  const ratio = Math.max(0, Math.min(1, elapsed / totalDays));
  const expectedPct = ratio * 100;

  const deltaPp = actualPct - expectedPct;

  // Past deadline and not yet complete → behind regardless of delta
  if (elapsed >= totalDays && actualPct < 100) {
    return { status: "behind", expectedPct, deltaPp };
  }

  let status: GoalPaceStatus;
  if (deltaPp >= AHEAD_THRESHOLD) status = "ahead";
  else if (deltaPp <= BEHIND_THRESHOLD) status = "behind";
  else status = "onTrack";

  return { status, expectedPct, deltaPp };
}
