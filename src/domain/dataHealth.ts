import type { Account, AppSettings, DailyFxRate, DailyPrice, LedgerTransaction, PortfolioAsset } from "./types";
import { convertCurrency } from "./currency";

// ─── Public types ─────────────────────────────────────────────────────────────

export type DataHealthSeverity = "warn" | "error";

export type DataHealthKind =
  | "stale-quote"
  | "stale-fx"
  | "missing-fx"
  | "missing-price-history"
  | "negative-cash"
  | "overdue-settlement";

export interface DataHealthIssue {
  id: string;
  severity: DataHealthSeverity;
  kind: DataHealthKind;
  message: string;
  /** Tickers, currency pairs, account names, etc. that triggered the issue. */
  affected?: string[];
}

export interface DataHealthReport {
  issues: DataHealthIssue[];
  errorCount: number;
  warnCount: number;
  /** True when there are no issues at all. */
  healthy: boolean;
}

/**
 * Minimal quote shape the health engine needs — avoids importing data-layer
 * types into the domain module.
 */
export interface QuoteForHealth {
  symbol: string;
  updatedAt: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Days between two ISO date strings (YYYY-MM-DD). Always non-negative. */
function daysBetween(isoA: string, isoB: string): number {
  const msPerDay = 86_400_000;
  const a = new Date(`${isoA.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${isoB.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.abs(b - a) / msPerDay;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export interface BuildDataHealthReportInput {
  accounts: Account[];
  ledger: LedgerTransaction[];
  assets: PortfolioAsset[];
  /** Minimal quote info — pass { symbol, updatedAt } mappings only. */
  quotes: QuoteForHealth[];
  dailyPrices: DailyPrice[];
  dailyFxRates: DailyFxRate[];
  settings: AppSettings | undefined;
  /** Today's date as YYYY-MM-DD, used for staleness calculations. */
  todayIso: string;
}

/**
 * Inspect the user's financial data for common quality issues and return a
 * structured report. All logic is pure — no side effects, no network calls.
 *
 * Rules:
 * 1. **stale-quote** (warn) — held tickers with a quote older than 5 days.
 * 2. **stale-fx** (warn) — used foreign currencies whose latest daily FX rate
 *    is older than 7 days.
 * 3. **missing-fx** (error) — used foreign currencies with no FX rate at all
 *    (neither daily history nor settings.exchangeRates).
 * 4. **missing-price-history** (warn) — held transaction-based tickers with
 *    zero daily price rows (analytics won't compute). Manual holdings excluded.
 * 5. **negative-cash** (error) — cash/depository accounts with balance < 0.
 * 6. **overdue-settlement** (warn) — receivable/payable ledger rows older than
 *    60 days, summarised by type.
 */
export function buildDataHealthReport(input: BuildDataHealthReportInput): DataHealthReport {
  const { accounts, ledger, assets, quotes, dailyPrices, dailyFxRates, settings, todayIso } = input;
  const issues: DataHealthIssue[] = [];

  const primaryCurrency = settings?.primaryCurrency ?? "TWD";

  // ── Collect active foreign currencies ──────────────────────────────────────
  // A currency is "in use" if referenced by an active (non-deleted) account,
  // a non-deleted ledger row, or a non-deleted asset, and it differs from primary.
  const usedCurrencies = new Set<string>();
  for (const acct of accounts) {
    if (acct.deletedAt === null && acct.currency !== primaryCurrency) {
      usedCurrencies.add(acct.currency.toUpperCase());
    }
  }
  for (const row of ledger) {
    if (row.deletedAt === null && row.currency !== primaryCurrency) {
      usedCurrencies.add(row.currency.toUpperCase());
    }
  }
  for (const asset of assets) {
    if (asset.deletedAt === null && asset.currency !== primaryCurrency) {
      usedCurrencies.add(asset.currency.toUpperCase());
    }
  }

  // ── Rule 1: stale-quote ────────────────────────────────────────────────────
  const heldTickers = new Set(
    assets
      .filter((a) => a.deletedAt === null && a.totalQuantity > 1e-9)
      .map((a) => a.ticker.toUpperCase()),
  );
  const quoteBySymbol = new Map<string, QuoteForHealth>();
  for (const q of quotes) {
    quoteBySymbol.set(q.symbol.toUpperCase(), q);
  }

  const staleQuoteTickers: string[] = [];
  for (const ticker of heldTickers) {
    const quote = quoteBySymbol.get(ticker);
    if (!quote) {
      // No quote at all — treated as stale (day diff > threshold).
      staleQuoteTickers.push(ticker);
    } else {
      const updatedDate = quote.updatedAt.slice(0, 10);
      if (daysBetween(updatedDate, todayIso) > 5) {
        staleQuoteTickers.push(ticker);
      }
    }
  }
  if (staleQuoteTickers.length > 0) {
    issues.push({
      id: "stale-quote",
      severity: "warn",
      kind: "stale-quote",
      message: `以下持倉報價已超過 5 天未更新：${staleQuoteTickers.join("、")}`,
      affected: staleQuoteTickers,
    });
  }

  // ── Rule 2: stale-fx ───────────────────────────────────────────────────────
  // Find the most recent daily FX date per used currency (either direction).
  const staleFxCurrencies: string[] = [];
  for (const currency of usedCurrencies) {
    let latestDate: string | null = null;
    for (const row of dailyFxRates) {
      const from = row.from.toUpperCase();
      const to = row.to.toUpperCase();
      const cur = currency.toUpperCase();
      const pri = primaryCurrency.toUpperCase();
      if ((from === cur && to === pri) || (from === pri && to === cur)) {
        if (!latestDate || row.date > latestDate) latestDate = row.date;
      }
    }
    if (latestDate !== null && daysBetween(latestDate, todayIso) > 7) {
      staleFxCurrencies.push(currency);
    }
  }
  if (staleFxCurrencies.length > 0) {
    issues.push({
      id: "stale-fx",
      severity: "warn",
      kind: "stale-fx",
      message: `以下外幣匯率已超過 7 天未更新：${staleFxCurrencies.join("、")}`,
      affected: staleFxCurrencies,
    });
  }

  // ── Rule 3: missing-fx ─────────────────────────────────────────────────────
  const missingFxCurrencies: string[] = [];
  const today = todayIso;
  for (const currency of usedCurrencies) {
    const converted = convertCurrency(1, currency, primaryCurrency, settings, {
      dailyRates: dailyFxRates,
      asOfDate: today,
    });
    if (converted === null) {
      missingFxCurrencies.push(currency);
    }
  }
  if (missingFxCurrencies.length > 0) {
    issues.push({
      id: "missing-fx",
      severity: "error",
      kind: "missing-fx",
      message: `缺少匯率，無法換算：${missingFxCurrencies.map((c) => `${c}/${primaryCurrency}`).join("、")}`,
      affected: missingFxCurrencies.map((c) => `${c}/${primaryCurrency}`),
    });
  }

  // ── Rule 4: missing-price-history ─────────────────────────────────────────
  // Only applies to transaction-based (non-manual) holdings.
  const tickersWithPriceHistory = new Set(dailyPrices.map((p) => p.ticker.toUpperCase()));
  const missingPriceTickers: string[] = [];
  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    if (asset.totalQuantity <= 1e-9) continue;
    if (asset.holdingSource === "manual") continue;
    if (!tickersWithPriceHistory.has(asset.ticker.toUpperCase())) {
      missingPriceTickers.push(asset.ticker);
    }
  }
  if (missingPriceTickers.length > 0) {
    issues.push({
      id: "missing-price-history",
      severity: "warn",
      kind: "missing-price-history",
      message: `以下持倉缺少每日股價，分析功能將無法計算：${missingPriceTickers.join("、")}`,
      affected: missingPriceTickers,
    });
  }

  // ── Rule 5: negative-cash ─────────────────────────────────────────────────
  const negativeCashAccounts: string[] = [];
  for (const acct of accounts) {
    if (acct.deletedAt !== null) continue;
    if (acct.type !== "cash" && acct.type !== "depository") continue;
    if (acct.balance < 0) {
      negativeCashAccounts.push(acct.name || acct.id);
    }
  }
  if (negativeCashAccounts.length > 0) {
    issues.push({
      id: "negative-cash",
      severity: "error",
      kind: "negative-cash",
      message: `以下帳戶餘額為負數：${negativeCashAccounts.join("、")}`,
      affected: negativeCashAccounts,
    });
  }

  // ── Rule 6: overdue-settlement ────────────────────────────────────────────
  let overdueReceivableCount = 0;
  let overduePayableCount = 0;
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    if (row.settlementStatus !== "receivable" && row.settlementStatus !== "payable") continue;
    const rowDate = row.date.slice(0, 10);
    if (daysBetween(rowDate, todayIso) > 60) {
      if (row.settlementStatus === "receivable") overdueReceivableCount++;
      else overduePayableCount++;
    }
  }
  const overdueTotal = overdueReceivableCount + overduePayableCount;
  if (overdueTotal > 0) {
    const parts: string[] = [];
    if (overdueReceivableCount > 0) parts.push(`應收 ${overdueReceivableCount} 筆`);
    if (overduePayableCount > 0) parts.push(`應付 ${overduePayableCount} 筆`);
    issues.push({
      id: "overdue-settlement",
      severity: "warn",
      kind: "overdue-settlement",
      message: `逾期 60 天以上的待結清款項：${parts.join("、")}`,
    });
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;
  return {
    issues,
    errorCount,
    warnCount,
    healthy: issues.length === 0,
  };
}
