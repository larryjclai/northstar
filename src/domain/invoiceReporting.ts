// 帳齡/DSO · 本期應繳營業稅 · 雙月 401 彙總 — plan 193 (帳本 Phase 2b-2), pure math
// only. All four functions read `invoices` rows alone (docs/ledger-books-plan.md
// §3 "帳齡 + 收款指標" / "Bimonthly 銷項稅額 summary") — no join back to the
// linked ledger row. `settledAt` is the authoritative "paid" signal, stamped
// explicitly by the settle flow and cleared on revert; it is never derived
// from `updatedAt` (§3 spells out why: `updatedAt` moves on unrelated edits).

import type { Invoice } from "./types";

const BIMONTHLY_PERIOD_LABELS = ["1-2月", "3-4月", "5-6月", "7-8月", "9-10月", "11-12月"] as const;

export type AgingBucketId = "notDue" | "d1_30" | "d31_60" | "d61_90" | "over90";

export interface AgingBucket {
  bucket: AgingBucketId;
  count: number;
  total: number;
}

export interface Bimonthly401Row {
  period: string;
  taxableSales: number;
  salesTax: number;
}

/**
 * Calendar-date diff in whole days, `to − from`. Reads only the `YYYY-MM-DD`
 * prefix of each input, so the mixed date formats already in play on an
 * `Invoice` row — `dueDate` ("YYYY-MM-DD"), `issueDate` (datetime-local,
 * "YYYY-MM-DDTHH:mm"), `settledAt` (full ISO, "YYYY-MM-DDTHH:mm:ss.sssZ") —
 * all diff correctly against each other and against a plain `todayIso`.
 */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = parseDateParts(fromIso);
  const [ty, tm, td] = parseDateParts(toIso);
  const from = Date.UTC(fy, fm, fd);
  const to = Date.UTC(ty, tm, td);
  return Math.round((to - from) / 86_400_000);
}

/** `[year, monthIndex0Based, day]` parsed from the leading `YYYY-MM-DD`. */
function parseDateParts(iso: string): [number, number, number] {
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  return [y, (m || 1) - 1, d || 1];
}

function subtractMonths(iso: string, months: number): string {
  const [year, monthIndex, day] = parseDateParts(iso);
  const shifted = new Date(Date.UTC(year, monthIndex - months, day));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The bimonthly (雙月) 401 filing period a date falls into: "1-2月" … "11-12月".
 * Shared by `outstandingSalesTax` (this period, relative to today) and
 * `bimonthly401Summary` (every period in a given year).
 */
function periodOf(iso: string): { year: number; period: string } {
  const [year, monthIndex] = parseDateParts(iso);
  const periodIndex = Math.floor(monthIndex / 2);
  return { year, period: BIMONTHLY_PERIOD_LABELS[periodIndex] };
}

/**
 * Aging buckets over unpaid invoices (`settledAt === null`), bucketing
 * `today − dueDate`. Settled invoices are excluded entirely — this is a
 * "what's still outstanding, and how overdue" view, not a settlement-history
 * report.
 *
 * The whole point of an AR aging report is to flag OVERDUE receivables, so
 * "not yet due" is a distinct bucket from "1–30 days overdue" (the latter is
 * the most-watched line — collections start there). Boundary scheme, by
 * `daysPastDue = today − dueDate`:
 *   `<= 0`  → notDue    (due today or in the future; also the no-`dueDate` fallback)
 *   `<= 30` → d1_30     (1–30 days overdue)
 *   `<= 60` → d31_60    (31–60 days overdue)
 *   `<= 90` → d61_90    (61–90 days overdue)
 *   `> 90`  → over90    (90+ days overdue)
 * All five buckets are always present in the output (count 0 when empty) so
 * callers can render a stable, fixed row order without special-casing a
 * missing key.
 *
 * Invoices with no `dueDate` fall back to `notDue`: we can't compute how
 * overdue an undated invoice is, and marking it overdue would be a false
 * alarm the operator can't act on.
 */
export function agingBuckets(invoices: Invoice[], todayIso: string): AgingBucket[] {
  const totals: Record<AgingBucketId, { count: number; total: number }> = {
    notDue: { count: 0, total: 0 },
    d1_30: { count: 0, total: 0 },
    d31_60: { count: 0, total: 0 },
    d61_90: { count: 0, total: 0 },
    over90: { count: 0, total: 0 },
  };

  for (const invoice of invoices) {
    if (invoice.settledAt !== null) continue; // paid — excluded from aging
    const bucket = bucketFor(invoice.dueDate, todayIso);
    totals[bucket].count += 1;
    totals[bucket].total += invoice.amount;
  }

  return (Object.keys(totals) as AgingBucketId[]).map((bucket) => ({ bucket, ...totals[bucket] }));
}

function bucketFor(dueDate: string | null, todayIso: string): AgingBucketId {
  if (dueDate === null) return "notDue";
  const daysPastDue = daysBetween(dueDate, todayIso);
  if (daysPastDue <= 0) return "notDue";
  if (daysPastDue <= 30) return "d1_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "over90";
}

/**
 * DSO (平均收款週期) — mean of `settledAt − issueDate` in days, over invoices
 * settled within a trailing window (default 12 months, ending `todayIso`).
 * `null` when no invoice settled inside the window (nothing to average).
 */
export function daysSalesOutstanding(
  invoices: Invoice[],
  options: { windowMonths?: number; todayIso: string },
): number | null {
  const windowMonths = options.windowMonths ?? 12;
  const cutoff = subtractMonths(options.todayIso, windowMonths);

  const settledInWindow = invoices.filter(
    (invoice): invoice is Invoice & { settledAt: string } =>
      invoice.settledAt !== null && daysBetween(cutoff, invoice.settledAt) >= 0,
  );
  if (settledInWindow.length === 0) return null;

  const totalDays = settledInWindow.reduce(
    (sum, invoice) => sum + daysBetween(invoice.issueDate, invoice.settledAt),
    0,
  );
  return totalDays / settledInWindow.length;
}

/**
 * 本期應繳營業稅 — `SUM(taxAmount)` over invoices issued in the current
 * bimonthly period, **issuance-based, not settle-based**: tax is owed on the
 * invoice date under 開立統一發票 timing, so unpaid invoices from this period
 * still count (§3 "Tax model" — the UI copy calling out this quirk lives with
 * the card, not here).
 */
export function outstandingSalesTax(invoices: Invoice[], todayIso: string): number {
  const current = periodOf(todayIso);
  return invoices
    .filter((invoice) => {
      const issued = periodOf(invoice.issueDate);
      return issued.year === current.year && issued.period === current.period;
    })
    .reduce((sum, invoice) => sum + invoice.taxAmount, 0);
}

/**
 * 雙月 401 彙總 (401 filing prep) — `taxExclusiveAmount`/`taxAmount` summed
 * per bimonthly period, for every invoice whose `issueDate` falls in `year`.
 * Issuance-based, same rationale as `outstandingSalesTax`. Always returns all
 * six periods in calendar order (zero-filled when a period has no invoices),
 * so callers can render a fixed 6-row table.
 */
export function bimonthly401Summary(invoices: Invoice[], year: number): Bimonthly401Row[] {
  const totals = new Map<string, { taxableSales: number; salesTax: number }>();
  for (const label of BIMONTHLY_PERIOD_LABELS) totals.set(label, { taxableSales: 0, salesTax: 0 });

  for (const invoice of invoices) {
    const issued = periodOf(invoice.issueDate);
    if (issued.year !== year) continue;
    const row = totals.get(issued.period)!;
    row.taxableSales += invoice.taxExclusiveAmount;
    row.salesTax += invoice.taxAmount;
  }

  return BIMONTHLY_PERIOD_LABELS.map((period) => ({ period, ...totals.get(period)! }));
}
