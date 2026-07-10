import type { Account, AppSettings, DailyFxRate, DailyPrice, LedgerTransaction, ManualPriceSnapshot, PortfolioAsset } from "./types";
import { convertCurrency } from "./currency";

/**
 * Staleness threshold (days) for a custom asset's latest manual price snapshot.
 * 90 days ≈ a quarter: manually-priced assets (unlisted funds, real assets)
 * reprice slowly, so the 5-day stale-quote basis would be far too noisy here.
 * This constant is the tuning knob if FIRE/projection features later lean on
 * custom-asset values and demand fresher prices.
 */
const CUSTOM_PRICE_STALE_DAYS = 90;

// ─── Public types ─────────────────────────────────────────────────────────────

export type DataHealthSeverity = "warn" | "error";

export type DataHealthKind =
  | "stale-quote"
  | "stale-manual-price"
  | "stale-fx"
  | "missing-fx"
  | "missing-price-history"
  | "negative-cash"
  | "overdue-settlement"
  | "orphaned-row";

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

// ─── Custom-asset price staleness (shared banner + per-holding badge) ──────────

/**
 * Classification of a custom asset's manual-price freshness. `not-custom` is
 * returned for any non-custom asset so callers can branch uniformly.
 */
export type CustomPriceStaleness = "fresh" | "stale" | "missing" | "not-custom";

/**
 * Latest manual-price date (YYYY-MM-DD) for a set of snapshots, or `null` when
 * there are none. Uses string-date comparison — the same "latest snapshot" pick
 * the valuation path and the data-health banner use, so all three agree.
 */
export function latestManualPriceDate(snapshots: readonly ManualPriceSnapshot[]): string | null {
  let latest: string | null = null;
  for (const snap of snapshots) {
    const date = snap.date.slice(0, 10);
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

/**
 * Classify a custom asset's price freshness from its already-resolved latest
 * snapshot date. Non-custom assets are always `not-custom`; custom assets with
 * no snapshot are `missing`; otherwise `stale` past {@link CUSTOM_PRICE_STALE_DAYS},
 * else `fresh`. This is the single source of truth shared by the Dashboard
 * data-health banner (Rule 1b) and the per-holding badge, so the two never disagree.
 */
export function classifyCustomPriceStaleness(
  asset: Pick<PortfolioAsset, "assetType">,
  latestSnapshotDate: string | null,
  todayIso: string,
): CustomPriceStaleness {
  if (asset.assetType !== "custom") return "not-custom";
  if (latestSnapshotDate === null) return "missing";
  return daysBetween(latestSnapshotDate, todayIso) > CUSTOM_PRICE_STALE_DAYS ? "stale" : "fresh";
}

/**
 * Convenience wrapper: classify a custom asset's price freshness directly from
 * its manual snapshots. Pass only the snapshots for this asset (the caller
 * filters); the latest is picked internally via {@link latestManualPriceDate}.
 */
export function customPriceStaleness(
  asset: Pick<PortfolioAsset, "assetType">,
  snapshots: readonly ManualPriceSnapshot[],
  todayIso: string,
): CustomPriceStaleness {
  return classifyCustomPriceStaleness(asset, latestManualPriceDate(snapshots), todayIso);
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
  /** Manual price snapshots — used to flag stale prices on custom assets. */
  manualPriceSnapshots?: ManualPriceSnapshot[];
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
  const { accounts, ledger, assets, quotes, dailyPrices, dailyFxRates, manualPriceSnapshots, settings, todayIso } = input;
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

  // ── Rule 1b: stale-manual-price ────────────────────────────────────────────
  // Custom assets are valued at their latest manual ManualPriceSnapshot. If the
  // user stops logging prices the value silently drifts, so flag custom holdings
  // whose latest snapshot is older than the threshold, and — separately — those
  // that have never recorded a price at all. Uses string-date comparison for the
  // "latest snapshot" pick to stay consistent with the valuation path.
  const latestSnapshotDateByAsset = new Map<string, string>();
  for (const snap of manualPriceSnapshots ?? []) {
    const prev = latestSnapshotDateByAsset.get(snap.assetId);
    const date = snap.date.slice(0, 10);
    if (!prev || date > prev) latestSnapshotDateByAsset.set(snap.assetId, date);
  }
  const staleManualPriceNames: string[] = [];
  const noPriceCustomNames: string[] = [];
  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    if (asset.assetType !== "custom") continue;
    if (asset.totalQuantity <= 1e-9) continue;
    const label = asset.name || asset.ticker || asset.id;
    const latestDate = latestSnapshotDateByAsset.get(asset.id) ?? null;
    const staleness = classifyCustomPriceStaleness(asset, latestDate, todayIso);
    if (staleness === "missing") {
      noPriceCustomNames.push(label);
    } else if (staleness === "stale") {
      staleManualPriceNames.push(label);
    }
  }
  if (staleManualPriceNames.length > 0) {
    issues.push({
      id: "stale-manual-price",
      severity: "warn",
      kind: "stale-manual-price",
      message: `以下自訂資產的價格已超過 ${CUSTOM_PRICE_STALE_DAYS} 天未更新：${staleManualPriceNames.join("、")}`,
      affected: staleManualPriceNames,
    });
  }
  if (noPriceCustomNames.length > 0) {
    issues.push({
      id: "stale-manual-price-missing",
      severity: "warn",
      kind: "stale-manual-price",
      message: `以下自訂資產尚未記錄任何價格：${noPriceCustomNames.join("、")}`,
      affected: noPriceCustomNames,
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

  // ── Rule 7: orphaned-row — ledger rows referencing a deleted/missing account ──
  const validAccountIds = new Set(accounts.filter((a) => a.deletedAt === null).map((a) => a.id));
  const orphanRows: string[] = [];
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    const mainOrphan = row.accountId !== "" && !validAccountIds.has(row.accountId);
    const counterOrphan = row.counterAccountId != null && !validAccountIds.has(row.counterAccountId);
    if (mainOrphan || counterOrphan) {
      orphanRows.push(row.name || row.merchant || row.id);
    }
  }
  if (orphanRows.length > 0) {
    issues.push({
      id: "orphaned-row",
      severity: "error",
      kind: "orphaned-row",
      message: `以下交易連結到已刪除或不存在的帳戶，仍在影響餘額，請結清或刪除：${orphanRows.slice(0, 8).join("、")}${orphanRows.length > 8 ? ` 等 ${orphanRows.length} 筆` : ""}`,
      affected: orphanRows,
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
