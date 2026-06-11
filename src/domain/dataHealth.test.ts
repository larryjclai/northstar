import { describe, expect, it } from "vitest";
import { buildDataHealthReport } from "./dataHealth";
import type { BuildDataHealthReportInput, QuoteForHealth } from "./dataHealth";
import type { Account, AppSettings, DailyFxRate, DailyPrice, LedgerTransaction, PortfolioAsset } from "./types";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeSettings(primaryCurrency = "TWD"): AppSettings {
  return { primaryCurrency, categories: [], merchants: [], exchangeRates: [] };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acct1",
    spaceId: "s",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    name: "現金帳戶",
    currency: "TWD",
    openingBalance: 0,
    balance: 1000,
    type: "cash",
    creditLimit: null,
    creditLimitGroup: "",
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
    statementDay: null,
    paymentDueDay: null,
    creditPaymentPaidUntil: null,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<PortfolioAsset> = {}): PortfolioAsset {
  return {
    id: "asset1",
    spaceId: "s",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ticker: "0050.TW",
    name: "元大台灣 50",
    nameZh: null,
    nameEn: null,
    currency: "TWD",
    totalQuantity: 10,
    averageCost: 100,
    holdingSource: "transactions",
    acquisitionDate: null,
    assetType: "etf",
    sector: null,
    industry: null,
    accountId: null,
    baseQuantity: null,
    ...overrides,
  };
}

function makeLedgerRow(overrides: Partial<LedgerTransaction> = {}): LedgerTransaction {
  return {
    id: "tx1",
    spaceId: "s",
    revision: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    accountId: "acct1",
    counterAccountId: null,
    date: "2026-06-01T00:00:00",
    name: "午餐",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "餐飲",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

function makeDailyPrice(overrides: Partial<DailyPrice> = {}): DailyPrice {
  return {
    ticker: "0050.TW",
    date: "2026-06-10",
    close: 120,
    currency: "TWD",
    source: "yahoo",
    updatedAt: "2026-06-10T12:00:00Z",
    ...overrides,
  };
}

function makeDailyFxRate(overrides: Partial<DailyFxRate> = {}): DailyFxRate {
  return {
    from: "USD",
    to: "TWD",
    date: "2026-06-10",
    rate: 32.5,
    source: "yahoo",
    updatedAt: "2026-06-10T12:00:00Z",
    ...overrides,
  };
}

function makeQuote(overrides: Partial<QuoteForHealth> = {}): QuoteForHealth {
  return {
    symbol: "0050.TW",
    updatedAt: "2026-06-10T12:00:00Z",
    ...overrides,
  };
}

/** Minimal fully-healthy input — no issues should fire. */
function healthyInput(): BuildDataHealthReportInput {
  return {
    accounts: [makeAccount()],
    ledger: [makeLedgerRow()],
    assets: [makeAsset()],
    quotes: [makeQuote()],
    dailyPrices: [makeDailyPrice()],
    dailyFxRates: [],
    settings: makeSettings(),
    todayIso: "2026-06-11",
  };
}

// ─── Rule: healthy baseline ───────────────────────────────────────────────────

describe("buildDataHealthReport — healthy baseline", () => {
  it("returns healthy=true and no issues when everything is fine", () => {
    const report = buildDataHealthReport(healthyInput());
    expect(report.healthy).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.errorCount).toBe(0);
    expect(report.warnCount).toBe(0);
  });
});

// ─── Rule 1: stale-quote ─────────────────────────────────────────────────────

describe("stale-quote", () => {
  it("triggers when a held ticker has a quote older than 5 days", () => {
    const input = healthyInput();
    input.quotes = [makeQuote({ symbol: "0050.TW", updatedAt: "2026-05-01T12:00:00Z" })];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "stale-quote");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warn");
    expect(issue!.affected).toContain("0050.TW");
  });

  it("triggers when there is no quote at all for a held ticker", () => {
    const input = healthyInput();
    input.quotes = []; // no quotes
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-quote")).toBeDefined();
  });

  it("does NOT trigger when quote is fresh (within 5 days)", () => {
    const input = healthyInput();
    // todayIso = 2026-06-11, quote from 2026-06-09 is 2 days old → OK
    input.quotes = [makeQuote({ symbol: "0050.TW", updatedAt: "2026-06-09T12:00:00Z" })];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-quote")).toBeUndefined();
  });

  it("does NOT trigger for assets with zero quantity", () => {
    const input = healthyInput();
    input.assets = [makeAsset({ totalQuantity: 0 })];
    input.quotes = []; // missing quote, but no holding
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-quote")).toBeUndefined();
  });

  it("does NOT trigger for deleted assets", () => {
    const input = healthyInput();
    input.assets = [makeAsset({ deletedAt: "2026-01-15T00:00:00Z" })];
    input.quotes = [];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-quote")).toBeUndefined();
  });
});

// ─── Rule 2: stale-fx ────────────────────────────────────────────────────────

describe("stale-fx", () => {
  it("triggers when a used foreign currency has daily FX older than 7 days", () => {
    const input = healthyInput();
    input.accounts = [
      makeAccount({ currency: "USD" }),
    ];
    input.settings = {
      ...makeSettings(),
      exchangeRates: [{ from: "USD", to: "TWD", rate: 32.5, updatedAt: "2026-05-01T00:00:00Z" }],
    };
    input.dailyFxRates = [makeDailyFxRate({ from: "USD", to: "TWD", date: "2026-05-01" })];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "stale-fx");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warn");
    expect(issue!.affected).toContain("USD");
  });

  it("does NOT trigger when daily FX is within 7 days", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ currency: "USD" })];
    input.settings = {
      ...makeSettings(),
      exchangeRates: [{ from: "USD", to: "TWD", rate: 32.5, updatedAt: "2026-06-10T00:00:00Z" }],
    };
    // 2026-06-07 is 4 days before 2026-06-11
    input.dailyFxRates = [makeDailyFxRate({ from: "USD", to: "TWD", date: "2026-06-07" })];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-fx")).toBeUndefined();
  });

  it("does NOT trigger when no foreign currencies are used", () => {
    const input = healthyInput();
    // all accounts, ledger, assets use TWD (the primary)
    input.dailyFxRates = [];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "stale-fx")).toBeUndefined();
  });
});

// ─── Rule 3: missing-fx ──────────────────────────────────────────────────────

describe("missing-fx", () => {
  it("triggers (error) when a used foreign currency has no FX rate at all", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ currency: "USD" })];
    // No exchangeRates, no dailyFxRates
    input.settings = makeSettings();
    input.dailyFxRates = [];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "missing-fx");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.affected!.some((a) => a.includes("USD"))).toBe(true);
  });

  it("does NOT trigger when exchangeRates in settings provides coverage", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ currency: "USD" })];
    input.settings = {
      ...makeSettings(),
      exchangeRates: [{ from: "USD", to: "TWD", rate: 32.5, updatedAt: "" }],
    };
    input.dailyFxRates = [];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "missing-fx")).toBeUndefined();
  });

  it("does NOT trigger when dailyFxRates provide coverage", () => {
    const input = healthyInput();
    input.assets = [makeAsset({ currency: "USD" })];
    input.settings = makeSettings();
    input.dailyFxRates = [makeDailyFxRate({ from: "USD", to: "TWD", date: "2026-06-11" })];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "missing-fx")).toBeUndefined();
  });
});

// ─── Rule 4: missing-price-history ───────────────────────────────────────────

describe("missing-price-history", () => {
  it("triggers when a transaction-based held ticker has no daily price rows", () => {
    const input = healthyInput();
    input.dailyPrices = []; // remove all price history
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "missing-price-history");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warn");
    expect(issue!.affected).toContain("0050.TW");
  });

  it("does NOT trigger for manual holdings", () => {
    const input = healthyInput();
    input.assets = [makeAsset({ holdingSource: "manual" })];
    input.dailyPrices = []; // no price history
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "missing-price-history")).toBeUndefined();
  });

  it("does NOT trigger when daily price rows exist for the ticker", () => {
    const report = buildDataHealthReport(healthyInput());
    expect(report.issues.find((i) => i.kind === "missing-price-history")).toBeUndefined();
  });

  it("does NOT trigger for zero-quantity holdings", () => {
    const input = healthyInput();
    input.assets = [makeAsset({ totalQuantity: 0 })];
    input.dailyPrices = [];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "missing-price-history")).toBeUndefined();
  });
});

// ─── Rule 5: negative-cash ───────────────────────────────────────────────────

describe("negative-cash", () => {
  it("triggers (error) when a cash account has negative balance", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ balance: -500, type: "cash" })];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "negative-cash");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.affected).toContain("現金帳戶");
  });

  it("triggers (error) when a depository account has negative balance", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ balance: -200, type: "depository", name: "銀行帳戶" })];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "negative-cash");
    expect(issue).toBeDefined();
    expect(issue!.affected).toContain("銀行帳戶");
  });

  it("does NOT trigger when cash account balance is zero", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ balance: 0 })];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "negative-cash")).toBeUndefined();
  });

  it("does NOT trigger for credit or loan accounts with negative balance", () => {
    const input = healthyInput();
    input.accounts = [
      makeAccount({ id: "credit1", balance: -8000, type: "credit" }),
      makeAccount({ id: "loan1", balance: -200000, type: "loan" }),
    ];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "negative-cash")).toBeUndefined();
  });

  it("does NOT trigger for deleted accounts", () => {
    const input = healthyInput();
    input.accounts = [makeAccount({ balance: -999, deletedAt: "2026-01-15T00:00:00Z" })];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "negative-cash")).toBeUndefined();
  });
});

// ─── Rule 6: overdue-settlement ──────────────────────────────────────────────

describe("overdue-settlement", () => {
  it("triggers when a receivable is older than 60 days", () => {
    const input = healthyInput();
    input.ledger = [
      makeLedgerRow({ id: "ar1", settlementStatus: "receivable", date: "2026-01-01T00:00:00" }),
    ];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "overdue-settlement");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warn");
    expect(issue!.message).toContain("應收 1 筆");
  });

  it("triggers when a payable is older than 60 days", () => {
    const input = healthyInput();
    input.ledger = [
      makeLedgerRow({ id: "ap1", settlementStatus: "payable", date: "2026-01-01T00:00:00" }),
    ];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "overdue-settlement");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("應付 1 筆");
  });

  it("aggregates both receivable and payable counts in one issue", () => {
    const input = healthyInput();
    input.ledger = [
      makeLedgerRow({ id: "ar1", settlementStatus: "receivable", date: "2026-01-01T00:00:00" }),
      makeLedgerRow({ id: "ar2", settlementStatus: "receivable", date: "2026-01-05T00:00:00" }),
      makeLedgerRow({ id: "ap1", settlementStatus: "payable", date: "2026-01-03T00:00:00" }),
    ];
    const report = buildDataHealthReport(input);
    const issue = report.issues.find((i) => i.kind === "overdue-settlement");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("應收 2 筆");
    expect(issue!.message).toContain("應付 1 筆");
  });

  it("does NOT trigger for recent unsettled rows (within 60 days)", () => {
    const input = healthyInput();
    // todayIso = 2026-06-11; 30 days back = 2026-05-12 → within 60 days
    input.ledger = [
      makeLedgerRow({ id: "ar_recent", settlementStatus: "receivable", date: "2026-05-12T00:00:00" }),
    ];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "overdue-settlement")).toBeUndefined();
  });

  it("does NOT trigger for settled rows", () => {
    const input = healthyInput();
    input.ledger = [
      makeLedgerRow({ id: "settled", settlementStatus: "settled", date: "2026-01-01T00:00:00" }),
    ];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "overdue-settlement")).toBeUndefined();
  });

  it("does NOT trigger for deleted ledger rows", () => {
    const input = healthyInput();
    input.ledger = [
      makeLedgerRow({ id: "del", settlementStatus: "receivable", date: "2026-01-01T00:00:00", deletedAt: "2026-02-01T00:00:00Z" }),
    ];
    const report = buildDataHealthReport(input);
    expect(report.issues.find((i) => i.kind === "overdue-settlement")).toBeUndefined();
  });
});

// ─── Report shape ─────────────────────────────────────────────────────────────

describe("report aggregates", () => {
  it("counts errors and warns correctly across multiple issues", () => {
    const input = healthyInput();
    // Trigger: negative-cash (error), stale-quote (warn), missing-price-history (warn)
    input.accounts = [makeAccount({ balance: -100 })]; // negative-cash
    input.quotes = [makeQuote({ updatedAt: "2026-01-01T00:00:00Z" })]; // stale-quote
    input.dailyPrices = []; // missing-price-history
    const report = buildDataHealthReport(input);
    expect(report.errorCount).toBeGreaterThanOrEqual(1);
    expect(report.warnCount).toBeGreaterThanOrEqual(1);
    expect(report.healthy).toBe(false);
  });
});
