import { describe, it, expect } from "vitest";
import { computeTradeFee, isTaiwanTicker, DEFAULT_TW_FEES, type TradingFeeConfig } from "./tradingFees";

describe("computeTradeFee", () => {
  const cfg = DEFAULT_TW_FEES;

  // ── Buy side ──────────────────────────────────────────────────────────────

  it("buy: brokerage = round(qty * price * rate), no sell tax", () => {
    // 1000 shares × 50 = 50,000; 50,000 × 0.001425 = 71.25 → round = 71
    const fee = computeTradeFee({ action: "buy", qty: 1000, price: 50, instrument: "stock", config: cfg });
    expect(fee).toBe(71);
  });

  it("buy: min-fee floor applies when consideration is tiny", () => {
    // 1 share × 1 = 1; 1 × 0.001425 = 0.001425 → round = 0, floor = 20
    const fee = computeTradeFee({ action: "buy", qty: 1, price: 1, instrument: "stock", config: cfg });
    expect(fee).toBe(20);
  });

  it("buy: ETF also uses brokerage only (no sell tax on buy side)", () => {
    // 100 shares × 100 = 10,000; 10,000 × 0.001425 = 14.25 → round = 14, floor = 20
    const fee = computeTradeFee({ action: "buy", qty: 100, price: 100, instrument: "etf", config: cfg });
    expect(fee).toBe(20);
  });

  // ── Sell side — stock ─────────────────────────────────────────────────────

  it("sell stock: brokerage + securities tax at 0.3%", () => {
    // 1000 × 50 = 50,000
    // brokerage: round(50,000 × 0.001425) = round(71.25) = 71
    // sell tax:  round(50,000 × 0.003)    = round(150)   = 150
    // total: 221
    const fee = computeTradeFee({ action: "sell", qty: 1000, price: 50, instrument: "stock", config: cfg });
    expect(fee).toBe(221);
  });

  it("sell stock: min-fee floor still applies to brokerage on small trades", () => {
    // 1 × 1 = 1; brokerage = max(20, round(0.001425)) = 20; tax = round(1 × 0.003) = 0
    const fee = computeTradeFee({ action: "sell", qty: 1, price: 1, instrument: "stock", config: cfg });
    expect(fee).toBe(20);
  });

  // ── Sell side — ETF ───────────────────────────────────────────────────────

  it("sell ETF: securities tax at 0.1% (not 0.3%)", () => {
    // 1000 × 50 = 50,000
    // brokerage: round(50,000 × 0.001425) = 71
    // sell tax:  round(50,000 × 0.001)    = 50
    // total: 121
    const fee = computeTradeFee({ action: "sell", qty: 1000, price: 50, instrument: "etf", config: cfg });
    expect(fee).toBe(121);
  });

  // ── Rounding ──────────────────────────────────────────────────────────────

  it("rounds to integer NTD (no fractional fees)", () => {
    const fee = computeTradeFee({ action: "buy", qty: 3, price: 17, instrument: "stock", config: cfg });
    expect(Number.isInteger(fee)).toBe(true);
  });

  it("rounds half-up: 0.5 rounds to 1", () => {
    // Need consideration where qty*price*0.001425 = 0.5 exactly → 351.12...
    // Pick consideration = 351.12...; use custom config to simplify:
    // rate = 0.5 / 1000 = 0.0005; qty=1, price=1000, rate=0.0005 → 0.5 → round = 1 (≥ min 20 check)
    // Actually min=20 would win; use min=0 to test rounding:
    const customCfg: TradingFeeConfig = { ...cfg, brokerFeeRate: 0.0005, minBrokerFee: 0 };
    // 1 × 1000 = 1000; 1000 × 0.0005 = 0.5 → Math.round(0.5) = 1
    const fee = computeTradeFee({ action: "buy", qty: 1, price: 1000, instrument: "stock", config: customCfg });
    expect(fee).toBe(1);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("returns 0 when qty is 0", () => {
    const fee = computeTradeFee({ action: "buy", qty: 0, price: 50, instrument: "stock", config: cfg });
    expect(fee).toBe(0);
  });

  it("returns 0 when price is 0", () => {
    const fee = computeTradeFee({ action: "sell", qty: 1000, price: 0, instrument: "stock", config: cfg });
    expect(fee).toBe(0);
  });

  it("enabled:false has no effect on the pure calculation", () => {
    const disabledCfg: TradingFeeConfig = { ...cfg, enabled: false };
    const fee = computeTradeFee({ action: "buy", qty: 1000, price: 50, instrument: "stock", config: disabledCfg });
    // Same result as enabled:true — caller gates, not this function
    expect(fee).toBe(71);
  });

  // ── Custom config ─────────────────────────────────────────────────────────

  it("respects a custom minBrokerFee of NT$1", () => {
    const customCfg: TradingFeeConfig = { ...cfg, minBrokerFee: 1 };
    // 1 × 10 = 10; 10 × 0.001425 = 0.01425 → round = 0, floor = 1
    const fee = computeTradeFee({ action: "buy", qty: 1, price: 10, instrument: "stock", config: customCfg });
    expect(fee).toBe(1);
  });

  it("respects a custom brokerFeeRate", () => {
    const customCfg: TradingFeeConfig = { ...cfg, brokerFeeRate: 0.001, minBrokerFee: 0 };
    // 500 × 100 = 50,000; 50,000 × 0.001 = 50
    const fee = computeTradeFee({ action: "buy", qty: 500, price: 100, instrument: "stock", config: customCfg });
    expect(fee).toBe(50);
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
