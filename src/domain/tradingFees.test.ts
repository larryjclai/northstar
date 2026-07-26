import { describe, it, expect } from "vitest";
import {
  computeTradeFee,
  brokerFeeDiscountFor,
  isTaiwanTicker,
  DEFAULT_TW_FEES,
  type TradingFeeConfig,
} from "./tradingFees";

describe("computeTradeFee", () => {
  const cfg = DEFAULT_TW_FEES;

  // ── Buy side ──────────────────────────────────────────────────────────────

  it("buy: brokerage = round(qty * price * rate), no sell tax", () => {
    // 1000 shares × 50 = 50,000; 50,000 × 0.001425 = 71.25 → round = 71
    const fee = computeTradeFee({
      action: "buy",
      qty: 1000,
      price: 50,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(71);
  });

  it("buy: min-fee floor applies when consideration is tiny", () => {
    // 1 share × 1 = 1; 1 × 0.001425 = 0.001425 → round = 0, floor = 20
    const fee = computeTradeFee({
      action: "buy",
      qty: 1,
      price: 1,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(20);
  });

  it("buy: ETF also uses brokerage only (no sell tax on buy side)", () => {
    // 100 shares × 100 = 10,000; 10,000 × 0.001425 = 14.25 → round = 14, floor = 20
    const fee = computeTradeFee({
      action: "buy",
      qty: 100,
      price: 100,
      instrument: "etf",
      config: cfg,
    });
    expect(fee).toBe(20);
  });

  // ── Sell side — stock ─────────────────────────────────────────────────────

  it("sell stock: brokerage + securities tax at 0.3%", () => {
    // 1000 × 50 = 50,000
    // brokerage: round(50,000 × 0.001425) = round(71.25) = 71
    // sell tax:  round(50,000 × 0.003)    = round(150)   = 150
    // total: 221
    const fee = computeTradeFee({
      action: "sell",
      qty: 1000,
      price: 50,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(221);
  });

  it("sell stock: min-fee floor still applies to brokerage on small trades", () => {
    // 1 × 1 = 1; brokerage = max(20, round(0.001425)) = 20; tax = round(1 × 0.003) = 0
    const fee = computeTradeFee({
      action: "sell",
      qty: 1,
      price: 1,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(20);
  });

  // ── Sell side — ETF ───────────────────────────────────────────────────────

  it("sell ETF: securities tax at 0.1% (not 0.3%)", () => {
    // 1000 × 50 = 50,000
    // brokerage: round(50,000 × 0.001425) = 71
    // sell tax:  round(50,000 × 0.001)    = 50
    // total: 121
    const fee = computeTradeFee({
      action: "sell",
      qty: 1000,
      price: 50,
      instrument: "etf",
      config: cfg,
    });
    expect(fee).toBe(121);
  });

  // ── Rounding ──────────────────────────────────────────────────────────────

  it("rounds to integer NTD (no fractional fees)", () => {
    const fee = computeTradeFee({
      action: "buy",
      qty: 3,
      price: 17,
      instrument: "stock",
      config: cfg,
    });
    expect(Number.isInteger(fee)).toBe(true);
  });

  it("rounds half-up: 0.5 rounds to 1", () => {
    // Need consideration where qty*price*0.001425 = 0.5 exactly → 351.12...
    // Pick consideration = 351.12...; use custom config to simplify:
    // rate = 0.5 / 1000 = 0.0005; qty=1, price=1000, rate=0.0005 → 0.5 → round = 1 (≥ min 20 check)
    // Actually min=20 would win; use min=0 to test rounding:
    const customCfg: TradingFeeConfig = { ...cfg, brokerFeeRate: 0.0005, minBrokerFee: 0 };
    // 1 × 1000 = 1000; 1000 × 0.0005 = 0.5 → Math.round(0.5) = 1
    const fee = computeTradeFee({
      action: "buy",
      qty: 1,
      price: 1000,
      instrument: "stock",
      config: customCfg,
    });
    expect(fee).toBe(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("returns 0 when qty is 0", () => {
    const fee = computeTradeFee({
      action: "buy",
      qty: 0,
      price: 50,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(0);
  });

  it("returns 0 when price is 0", () => {
    const fee = computeTradeFee({
      action: "sell",
      qty: 1000,
      price: 0,
      instrument: "stock",
      config: cfg,
    });
    expect(fee).toBe(0);
  });

  it("enabled:false has no effect on the pure calculation", () => {
    const disabledCfg: TradingFeeConfig = { ...cfg, enabled: false };
    const fee = computeTradeFee({
      action: "buy",
      qty: 1000,
      price: 50,
      instrument: "stock",
      config: disabledCfg,
    });
    // Same result as enabled:true — caller gates, not this function
    expect(fee).toBe(71);
  });

  // ── Custom config ─────────────────────────────────────────────────────────

  it("respects a custom minBrokerFee of NT$1", () => {
    const customCfg: TradingFeeConfig = { ...cfg, minBrokerFee: 1 };
    // 1 × 10 = 10; 10 × 0.001425 = 0.01425 → round = 0, floor = 1
    const fee = computeTradeFee({
      action: "buy",
      qty: 1,
      price: 10,
      instrument: "stock",
      config: customCfg,
    });
    expect(fee).toBe(1);
  });

  it("respects a custom brokerFeeRate", () => {
    const customCfg: TradingFeeConfig = { ...cfg, brokerFeeRate: 0.001, minBrokerFee: 0 };
    // 500 × 100 = 50,000; 50,000 × 0.001 = 50
    const fee = computeTradeFee({
      action: "buy",
      qty: 500,
      price: 100,
      instrument: "stock",
      config: customCfg,
    });
    expect(fee).toBe(50);
  });
});

describe("computeTradeFee — brokerage discount (折扣)", () => {
  const cfg = DEFAULT_TW_FEES;

  it("buy: applies discount to brokerage when above the min-fee floor", () => {
    // 1000 × 50 = 50,000; 50,000 × 0.001425 × 0.6 = 42.75 → round = 43
    const fee = computeTradeFee({
      action: "buy",
      qty: 1000,
      price: 50,
      instrument: "stock",
      config: cfg,
      brokerFeeDiscount: 0.6,
    });
    expect(fee).toBe(43);
  });

  it("buy: discount that drives the rate-based fee below min still floors at minBrokerFee", () => {
    // 100 × 100 = 10,000; 10,000 × 0.001425 × 0.6 = 8.55 → round = 9, floor = 20
    const fee = computeTradeFee({
      action: "buy",
      qty: 100,
      price: 100,
      instrument: "stock",
      config: cfg,
      brokerFeeDiscount: 0.6,
    });
    expect(fee).toBe(20);
  });

  it("sell: tax is computed on the UNDISCOUNTED consideration; only brokerage is discounted", () => {
    // 1000 × 50 = 50,000
    // discounted brokerage: round(50,000 × 0.001425 × 0.6) = round(42.75) = 43
    // full tax:             round(50,000 × 0.003)          = 150
    const discountedBrokerage = 43;
    const fullTax = 150;
    const fee = computeTradeFee({
      action: "sell",
      qty: 1000,
      price: 50,
      instrument: "stock",
      config: cfg,
      brokerFeeDiscount: 0.6,
    });
    expect(fee).toBe(discountedBrokerage + fullTax);
  });
});

describe("brokerFeeDiscountFor", () => {
  const cfg: TradingFeeConfig = { ...DEFAULT_TW_FEES, accountDiscounts: { acc1: 0.6 } };

  it("returns 1 for a null account id", () => {
    expect(brokerFeeDiscountFor(cfg, null)).toBe(1);
  });
  it("returns 1 for an unset account id", () => {
    expect(brokerFeeDiscountFor(cfg, "unknown")).toBe(1);
  });
  it("returns the configured value for a known account id", () => {
    expect(brokerFeeDiscountFor(cfg, "acc1")).toBe(0.6);
  });
  it("clamps out-of-range values (1.5 → 1, -0.2 → 0)", () => {
    expect(brokerFeeDiscountFor({ ...DEFAULT_TW_FEES, accountDiscounts: { hi: 1.5 } }, "hi")).toBe(
      1,
    );
    expect(brokerFeeDiscountFor({ ...DEFAULT_TW_FEES, accountDiscounts: { lo: -0.2 } }, "lo")).toBe(
      0,
    );
  });
});

describe("isTaiwanTicker", () => {
  it("matches .TW suffix", () => expect(isTaiwanTicker("2330.TW")).toBe(true));
  it("matches .TWO suffix", () => expect(isTaiwanTicker("3008.TWO")).toBe(true));
  it("is case-insensitive", () => {
    expect(isTaiwanTicker("2330.tw")).toBe(true);
    expect(isTaiwanTicker("3008.two")).toBe(true);
  });
  it("rejects foreign tickers", () => {
    expect(isTaiwanTicker("AAPL")).toBe(false);
    expect(isTaiwanTicker("AAPL.US")).toBe(false);
    expect(isTaiwanTicker("0050.HK")).toBe(false);
  });
  it("rejects empty string", () => expect(isTaiwanTicker("")).toBe(false));
});
