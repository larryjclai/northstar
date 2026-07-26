/**
 * Taiwan broker fee + securities transaction tax calculator.
 *
 * Rates (v1 defaults — TW regulatory norms as of 2026):
 *   Brokerage: 0.1425% of consideration (both buy and sell), min NT$20.
 *   Securities transaction tax (sell only): 0.3% stocks, 0.1% ETFs.
 *
 * Rounding: integer NTD (Math.round — rounds half-up for positive values,
 * consistent with the convention used throughout this codebase).
 *
 * NOTE: Day-trade reduced tax and futures/options are out of scope for v1.
 */

export interface TradingFeeConfig {
  /** Brokerage rate, e.g. 0.001425 for 0.1425%. */
  brokerFeeRate: number;
  /** Securities transaction tax rate for stocks on sells, e.g. 0.003. */
  sellTaxRateStock: number;
  /** Securities transaction tax rate for ETFs on sells, e.g. 0.001. */
  sellTaxRateEtf: number;
  /** Minimum brokerage per transaction in NTD, e.g. 20. */
  minBrokerFee: number;
  /** When false the auto-fill is disabled; the pure calc is still usable. */
  enabled: boolean;
  /** Per-account brokerage discount multiplier (折扣), keyed by account id.
   *  1 = no discount (full rate); 0.6 = 6 折. Absent/undefined = 1. The
   *  securities-transaction tax is statutory and is never discounted. */
  accountDiscounts?: Record<string, number>;
}

export const DEFAULT_TW_FEES: TradingFeeConfig = {
  brokerFeeRate: 0.001425,
  sellTaxRateStock: 0.003,
  sellTaxRateEtf: 0.001,
  minBrokerFee: 20,
  enabled: false,
};

export interface ComputeTradeFeeOpts {
  action: "buy" | "sell";
  qty: number;
  price: number;
  /** Determines the securities transaction tax rate on sells. */
  instrument: "stock" | "etf";
  config: TradingFeeConfig;
  /** Brokerage discount multiplier (0 < d <= 1). Default 1 (no discount). */
  brokerFeeDiscount?: number;
}

/**
 * Compute the total fee for a Taiwan stock/ETF trade.
 *
 * Formula:
 *   consideration = qty * price
 *   brokerage     = max(minBrokerFee, round(consideration * brokerFeeRate))
 *   sellTax       = round(consideration * sellTaxRate)  [sell only]
 *   total         = brokerage + sellTax (on sells) | brokerage (on buys)
 *
 * Returns an integer NTD amount. If qty or price are zero the result is zero.
 *
 * The `config.enabled` flag is intentionally ignored here — the caller is
 * responsible for gating; the pure calc is always available for testing.
 */
export function computeTradeFee(opts: ComputeTradeFeeOpts): number {
  const { action, qty, price, instrument, config } = opts;
  if (qty <= 0 || price <= 0) return 0;

  const consideration = qty * price;

  const discount =
    opts.brokerFeeDiscount == null ? 1 : Math.min(1, Math.max(0, opts.brokerFeeDiscount));
  const brokerage = Math.max(
    config.minBrokerFee,
    Math.round(consideration * config.brokerFeeRate * discount),
  );

  if (action === "sell") {
    const taxRate = instrument === "etf" ? config.sellTaxRateEtf : config.sellTaxRateStock;
    const sellTax = Math.round(consideration * taxRate);
    return brokerage + sellTax;
  }

  return brokerage;
}

/** Resolve an account's discount from config (1 when unset). */
export function brokerFeeDiscountFor(
  config: TradingFeeConfig,
  accountId: string | null | undefined,
): number {
  if (!accountId) return 1;
  const d = config.accountDiscounts?.[accountId];
  return d == null ? 1 : Math.min(1, Math.max(0, d));
}

/**
 * Returns true when a ticker suffix qualifies for TW auto-fill:
 *   ends with .TW or .TWO (TWSE / TPEx), case-insensitive.
 */
export function isTaiwanTicker(ticker: string): boolean {
  const upper = ticker.trim().toUpperCase();
  return upper.endsWith(".TW") || upper.endsWith(".TWO");
}
