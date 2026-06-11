/**
 * Installment plans (信用卡分期).
 *
 * A purchase of `totalAmount` split into `periods` monthly rows. All rows
 * share an `installmentGroupId` and carry `installmentIndex`/`installmentTotal`
 * so the UI can render "3/12期" and the repo can scope deletes to "this and
 * later periods". Unlike `groupId` (fee/transfer legs that live and die
 * together), installment rows are individually deletable.
 */

export interface InstallmentPeriod {
  /** ISO date (time suffix of the start date preserved) for this period. */
  date: string;
  /** Signed amount for this period; all periods sum exactly to the total. */
  amount: number;
  /** 1-based period number. */
  index: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Add `months` to an ISO date, clamping the day-of-month to the target
 * month's end (01-31 + 1 month → 02-28). Anchored to the original day, not
 * chained — so 01-31 yields 02-28, 03-31, 04-30… Any time suffix after the
 * YYYY-MM-DD prefix is preserved unchanged.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const rest = iso.slice(10);
  const total = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}${rest}`;
}

/**
 * Split a signed total into monthly periods. Each period is rounded to 2
 * decimals; the rounding remainder folds into the first period so the
 * schedule always sums exactly to `totalAmount`.
 */
export function buildInstallmentSchedule(opts: {
  totalAmount: number;
  periods: number;
  startDate: string;
}): InstallmentPeriod[] {
  const { totalAmount, periods, startDate } = opts;
  if (!Number.isInteger(periods) || periods < 2) throw new Error("分期期數需為 2 期以上的整數");
  if (!Number.isFinite(totalAmount) || totalAmount === 0) throw new Error("分期金額不可為 0");
  const per = round2(totalAmount / periods);
  const first = round2(totalAmount - per * (periods - 1));
  return Array.from({ length: periods }, (_, i) => ({
    index: i + 1,
    amount: i === 0 ? first : per,
    date: i === 0 ? startDate : addMonthsClamped(startDate, i),
  }));
}

/** "3/12期" badge text for an installment row; null for normal rows. */
export function installmentLabel(row: { installmentIndex?: number | null; installmentTotal?: number | null }): string | null {
  if (row.installmentIndex == null || row.installmentTotal == null) return null;
  return `${row.installmentIndex}/${row.installmentTotal}期`;
}
