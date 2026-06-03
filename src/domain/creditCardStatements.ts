/**
 * Split a credit-card account's transactions into statement (billing) cycles
 * based on its statement-closing day. Without this, transactions from a paid
 * prior cycle stay mixed in with the current one, making it impossible to
 * reconcile "this period" independently.
 *
 * A statement closes on `statementDay` each month. A transaction dated `T`
 * belongs to the statement whose closing date is the first `statementDay`
 * on-or-after `T`. The cycle it covers runs from the day after the previous
 * close through that closing date.
 */

export interface StatementRow {
  date: string;
  amount: number;
  isReviewed: boolean;
}

export interface StatementPeriod<T extends StatementRow> {
  /** Stable key — the closing date `YYYY-MM-DD`. */
  key: string;
  /** Human label, e.g. "2026/05/06 – 2026/06/05". */
  label: string;
  /** First day of the cycle (`YYYY-MM-DD`, inclusive). */
  start: string;
  /** Statement closing date (`YYYY-MM-DD`, inclusive). */
  end: string;
  /** Payment due date for this statement (`YYYY-MM-DD`), when known. */
  dueDate: string | null;
  rows: T[];
  /** Net of `amount` across the cycle (expenses negative, as stored). */
  total: number;
  /** Magnitude of spend (sum of |amount| of negative rows). */
  spend: number;
  reconciledCount: number;
  /** The open, not-yet-closed cycle that contains "today". */
  isCurrent: boolean;
  /** This statement's due date is covered by `creditPaymentPaidUntil`. */
  isPaid: boolean;
}

function daysInMonthUtc(year: number, zeroBasedMonth: number) {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}

function ymd(year: number, zeroBasedMonth: number, day: number): string {
  // Normalise overflow/underflow of month, then clamp the day to the month.
  const base = new Date(Date.UTC(year, zeroBasedMonth, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = Math.min(day, daysInMonthUtc(y, m));
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** The statement closing date (on `statementDay`) on-or-after `date`. */
function closingDateFor(date: string, statementDay: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number); // m 1-based
  const closeThis = Math.min(statementDay, daysInMonthUtc(y, m - 1));
  if (d <= closeThis) return ymd(y, m - 1, statementDay);
  return ymd(y, m, statementDay); // ymd normalises month 12 → next year
}

/** Next occurrence of `day` strictly after `date`. */
function nextDayOfMonthAfter(date: string, day: number): string {
  const candidate = closingDateForDay(date, day);
  return candidate > date ? candidate : ymd(...nextMonthParts(candidate), day);
}

function closingDateForDay(date: string, day: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const dThis = Math.min(day, daysInMonthUtc(y, m - 1));
  if (d <= dThis) return ymd(y, m - 1, day);
  return ymd(y, m, day);
}

function nextMonthParts(date: string): [number, number] {
  const [y, m] = date.split("-").map(Number);
  return [m === 12 ? y + 1 : y, m % 12]; // [year, zeroBasedMonth] of next month
}

export function buildStatementPeriods<T extends StatementRow>(
  rows: T[],
  options: {
    statementDay: number | null;
    paymentDueDay: number | null;
    creditPaymentPaidUntil: string | null;
    today: string;
  },
): StatementPeriod<T>[] {
  const { statementDay, paymentDueDay, creditPaymentPaidUntil, today } = options;
  const todayDate = today.slice(0, 10);

  // No statement day configured → a single "all transactions" bucket.
  if (!statementDay) {
    const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
    return [
      {
        key: "all",
        label: "全部交易",
        start: sorted.length ? sorted[sorted.length - 1].date.slice(0, 10) : todayDate,
        end: todayDate,
        dueDate: null,
        rows: sorted,
        total: sorted.reduce((s, r) => s + r.amount, 0),
        spend: sorted.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0),
        reconciledCount: sorted.filter((r) => r.isReviewed).length,
        isCurrent: true,
        isPaid: false,
      },
    ];
  }

  const byClose = new Map<string, T[]>();
  for (const row of rows) {
    const close = closingDateFor(row.date, statementDay);
    const bucket = byClose.get(close) ?? [];
    bucket.push(row);
    byClose.set(close, bucket);
  }

  // Always surface the current open cycle, even when it has no transactions yet.
  const currentClose = closingDateFor(todayDate, statementDay);
  if (!byClose.has(currentClose)) byClose.set(currentClose, []);

  const periods = [...byClose.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([close, bucket]): StatementPeriod<T> => {
      const start = addDays(ymd(...prevMonthParts(close), statementDay), 1);
      const dueDate = paymentDueDay ? nextDayOfMonthAfter(close, paymentDueDay) : null;
      const sorted = [...bucket].sort((a, b) => b.date.localeCompare(a.date));
      return {
        key: close,
        label: `${formatMd(start)} – ${formatMd(close)}`,
        start,
        end: close,
        dueDate,
        rows: sorted,
        total: sorted.reduce((s, r) => s + r.amount, 0),
        spend: sorted.reduce((s, r) => s + (r.amount < 0 ? -r.amount : 0), 0),
        reconciledCount: sorted.filter((r) => r.isReviewed).length,
        isCurrent: close === currentClose,
        isPaid: Boolean(dueDate && creditPaymentPaidUntil && creditPaymentPaidUntil >= dueDate),
      };
    });

  return periods;
}

function prevMonthParts(date: string): [number, number] {
  const [y, m] = date.split("-").map(Number); // m 1-based
  // Zero-based month of the previous month.
  return [m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2];
}

function formatMd(date: string): string {
  return date.replace(/^\d{4}-/, "").replace("-", "/");
}
