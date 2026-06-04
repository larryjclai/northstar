import type { InvestmentRecord } from "./types";

/**
 * Canonical moving-average position engine. This is the single source of truth
 * for an asset's quantity, average cost, realized P/L, dividends, and the dated
 * cash-flow stream used to compute XIRR.
 *
 * The whole app uses *moving-average* cost (賣出按當下平均成本扣除). FIFO
 * (see `fifoCalculator`) is kept only for a future tax-lot view and must not be
 * used for day-to-day P/L, otherwise unrealized and realized gains disagree.
 */

const EPS = 1e-7;

export interface Cashflow {
  /** YYYY-MM-DD */
  date: string;
  /** Sign convention: negative = cash you put in (buy), positive = cash you took out (sell / dividend / return of capital). */
  amount: number;
}

export interface PositionMetrics {
  quantity: number;
  /** Moving-average cost per share, including buy-side fees. */
  averageCost: number;
  /** quantity × averageCost. */
  costBasis: number;
  /** Realized P/L to date (moving-average basis, net of fees). */
  realizedGain: number;
  /** Cash dividends received to date, net of any withholding fee. */
  totalDividends: number;
  /** Cash returned via capital reductions to date (return of capital). */
  totalReturnOfCapital: number;
  /** Dated cash-flow stream (buys negative, sells/dividends/RoC positive). */
  cashflows: Cashflow[];
}

const day = (s: string) => s.slice(0, 10);

/**
 * Walk an asset's records in date order applying moving-average accounting.
 *
 * Capital-reduction model (現金減資 / 彌補虧損減資): `quantity` = shares
 * cancelled, `price` = cash returned per cancelled share (0 for a
 * deficit-offset reduction that returns no cash). Cash reductions return
 * capital — they lower the cost basis; any excess over remaining basis becomes
 * a realized gain. Deficit-offset reductions cut share count while leaving
 * total cost untouched, so the per-share cost rises.
 */
export function buildPositionMetrics(records: InvestmentRecord[]): PositionMetrics {
  const sorted = records
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => a.date.localeCompare(b.date));

  let quantity = 0;
  let cost = 0;
  let realizedGain = 0;
  let totalDividends = 0;
  let totalReturnOfCapital = 0;
  const cashflows: Cashflow[] = [];

  const settle = () => {
    if (quantity <= EPS) {
      quantity = 0;
      cost = 0;
    }
  };

  for (const r of sorted) {
    if (r.action === "buy") {
      const outlay = r.price * r.quantity + r.fee;
      quantity += r.quantity;
      cost += outlay;
      cashflows.push({ date: day(r.date), amount: -outlay });
    } else if (r.action === "sell") {
      const avg = quantity === 0 ? 0 : cost / quantity;
      const soldQty = Math.min(r.quantity, quantity);
      const proceeds = r.price * r.quantity - r.fee;
      realizedGain += proceeds - avg * soldQty;
      quantity -= r.quantity;
      cost -= avg * soldQty;
      cashflows.push({ date: day(r.date), amount: proceeds });
      settle();
    } else if (r.action === "stockDividend") {
      // 配股：股數增加、總成本不變 → 平均成本下降。
      quantity += r.quantity;
    } else if (r.action === "stockSplit" && r.quantity > 0) {
      // 分割：股數 ×= 比例、總成本不變。
      quantity *= r.quantity;
    } else if (r.action === "cashDividend") {
      // 新列以 price 存總額(quantity=0)；舊列為「每股股利 × 股數」。
      const gross = r.quantity > 0 ? r.price * r.quantity : r.price;
      const net = gross - r.fee;
      totalDividends += net;
      cashflows.push({ date: day(r.date), amount: net });
    } else if (r.action === "capitalReduction") {
      const cancelled = Math.min(r.quantity, quantity);
      const cashReturned = r.price * r.quantity;
      quantity -= cancelled;
      if (cashReturned > 0) {
        const basisReduced = Math.min(cashReturned, cost);
        cost -= basisReduced;
        if (cashReturned > basisReduced) realizedGain += cashReturned - basisReduced;
        totalReturnOfCapital += cashReturned;
        cashflows.push({ date: day(r.date), amount: cashReturned });
      }
      settle();
    }
  }

  const averageCost = quantity === 0 ? 0 : cost / quantity;
  return {
    quantity,
    averageCost,
    costBasis: quantity === 0 ? 0 : cost,
    realizedGain,
    totalDividends,
    totalReturnOfCapital,
    cashflows,
  };
}

export interface CostBasisDelta {
  /** YYYY-MM-DD */
  date: string;
  /** Cost-basis change on this date (moving-average): buys +, sells −, RoC −. */
  delta: number;
}

/**
 * Dated cost-basis changes for an asset, so a historical net-worth series can
 * accrue holdings value at cost over time (paired with the cash side, a buy
 * nets to zero on its date and a sell surfaces the realized gain). Stock
 * dividends / splits never change total cost, so they emit nothing.
 */
export function buildCostBasisTimeline(records: InvestmentRecord[]): CostBasisDelta[] {
  const sorted = records
    .filter((r) => r.deletedAt === null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const deltas: CostBasisDelta[] = [];
  let quantity = 0;
  let cost = 0;
  for (const r of sorted) {
    if (r.action === "buy") {
      const outlay = r.price * r.quantity + r.fee;
      quantity += r.quantity;
      cost += outlay;
      deltas.push({ date: day(r.date), delta: outlay });
    } else if (r.action === "sell") {
      const avg = quantity === 0 ? 0 : cost / quantity;
      const soldQty = Math.min(r.quantity, quantity);
      const removed = avg * soldQty;
      quantity -= r.quantity;
      cost -= removed;
      if (quantity <= EPS) {
        quantity = 0;
        cost = 0;
      }
      deltas.push({ date: day(r.date), delta: -removed });
    } else if (r.action === "stockSplit" && r.quantity > 0) {
      // quantity scales but cost is unchanged.
      quantity *= r.quantity;
    } else if (r.action === "stockDividend") {
      quantity += r.quantity;
    } else if (r.action === "capitalReduction") {
      const cancelled = Math.min(r.quantity, quantity);
      const cashReturned = r.price * r.quantity;
      quantity -= cancelled;
      if (cashReturned > 0) {
        const reduced = Math.min(cashReturned, cost);
        cost -= reduced;
        deltas.push({ date: day(r.date), delta: -reduced });
      }
      if (quantity <= EPS) {
        quantity = 0;
        cost = 0;
      }
    }
  }
  return deltas;
}

/**
 * Minimum holding span before an annualized (XIRR) figure is shown. Below this,
 * annualizing a short period explodes into meaningless numbers (a few % over a
 * handful of days → thousands of %/yr), so callers display "—" instead. See B1.
 */
export const XIRR_MIN_DAYS = 30;

/**
 * Whole days between the earliest cash flow and `asOf` (today). Returns 0 when
 * there are no flows. Used to gate the annualized-return display.
 */
export function cashflowSpanDays(cashflows: Cashflow[], asOf: string): number {
  if (cashflows.length === 0) return 0;
  let earliest = cashflows[0].date;
  for (const f of cashflows) if (f.date < earliest) earliest = f.date;
  return Math.round((Date.parse(day(asOf)) - Date.parse(day(earliest))) / 86_400_000);
}

/**
 * Money-weighted annualized return (XIRR). Solves for the rate where the NPV of
 * all cash flows (plus an optional terminal market-value inflow) is zero.
 *
 * `cashflows` use the sign convention above. `terminal` is the position's
 * current market value valued as a positive inflow at `asOf` (as if liquidated
 * today). Returns a decimal (0.12 = 12%/yr) or null when undefined — i.e. when
 * there isn't at least one inflow and one outflow, or the solver can't bracket
 * a root.
 */
export function calculateXirr(
  cashflows: Cashflow[],
  terminal?: { date: string; amount: number },
): number | null {
  const flows = [...cashflows];
  if (terminal && Math.abs(terminal.amount) > EPS) flows.push({ date: day(terminal.date), amount: terminal.amount });
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount < -EPS) || !flows.some((f) => f.amount > EPS)) return null;

  flows.sort((a, b) => a.date.localeCompare(b.date));
  const t0 = Date.parse(flows[0].date);
  const yearsFrom = (d: string) => (Date.parse(d) - t0) / (365 * 86_400_000);

  const npv = (rate: number) =>
    flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, yearsFrom(f.date)), 0);

  // Newton–Raphson from a 10% guess.
  let rate = 0.1;
  for (let i = 0; i < 80; i += 1) {
    const value = npv(rate);
    if (Math.abs(value) < 1e-6) return rate;
    const derivative = flows.reduce((sum, f) => {
      const t = yearsFrom(f.date);
      return sum - (t * f.amount) / Math.pow(1 + rate, t + 1);
    }, 0);
    if (derivative === 0 || !Number.isFinite(derivative)) break;
    let next = rate - value / derivative;
    if (!Number.isFinite(next)) break;
    if (next <= -0.9999) next = -0.9999;
    if (Math.abs(next - rate) < 1e-9) {
      rate = next;
      return Math.abs(npv(rate)) < 1e-4 ? rate : bisectXirr(npv);
    }
    rate = next;
  }
  return bisectXirr(npv);
}

/** Bisection fallback on a wide bracket when Newton fails to converge. */
function bisectXirr(npv: (rate: number) => number): number | null {
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
