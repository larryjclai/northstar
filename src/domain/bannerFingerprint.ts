/**
 * Fingerprints for the Dashboard's dismissable top banners (plan 209).
 *
 * A dismissal is stored *with the state it dismissed* — the banner reappears
 * only when the live fingerprint differs from the stored one. Getting the
 * granularity right is the whole point:
 *
 * - Too fine (e.g. including a money amount) → the fingerprint drifts with
 *   every transaction and the banner returns constantly, making dismissal
 *   useless.
 * - Too coarse (e.g. just "something is wrong") → a genuinely new issue can
 *   get suppressed behind an old dismissal — a real alert hidden, which in a
 *   finance app is worse than the noise we started with.
 */

/**
 * Identity of the current data-health state. Dismissing stores this string;
 * the banner re-renders only when the live fingerprint differs.
 *
 * Keyed on `kind:id`, not `kind` alone: `dataHealth.ts`'s `stale-manual-price`
 * kind is shared by two distinct rules — `id: "stale-manual-price"` (a custom
 * asset's price has gone stale) and `id: "stale-manual-price-missing"` (a
 * custom asset has never had a price recorded). Keying on `kind` alone would
 * let one swap for the other, at the same issue count, without changing the
 * fingerprint — silently suppressing a genuinely different issue. Both `id`
 * and `kind` are stable hardcoded literals per rule (never regenerated per
 * render, never per-occurrence), so this stays a pure identity string with no
 * amounts or other drifting values in it.
 */
export function healthFingerprint(issues: Array<{ kind: string; id: string }>): string {
  if (issues.length === 0) return "ok";
  return issues
    .map((i) => `${i.kind}:${i.id}`)
    .sort()
    .join("|");
}

/**
 * Identity of the current overspend occurrence: month + WHICH categories.
 * Amount is deliberately excluded — it drifts with every transaction and
 * would resurrect the banner daily, making dismissal useless. A NEW category
 * overspending, or a new month, changes the fingerprint → banner returns.
 */
export function overBudgetFingerprint(monthKey: string, categoryNames: string[]): string {
  return `${monthKey}:${[...categoryNames].sort().join("|")}`;
}
