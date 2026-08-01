import {
  ArrowDown,
  ArrowsClockwise,
  ArrowsDownUp,
  ArrowUp,
  Bank,
  ChartLineUp,
  DotsThree,
  ListChecks,
  PencilSimple,
  Plus,
  Sliders,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStickyChrome } from "../hooks/useStickyChrome";
import { AccountFilter } from "../components/AccountFilter";
import { AssetLogo } from "../components/AssetLogo";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card as CossCard } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { EmptyState } from "../components/EmptyState";
import { Field, TextInput } from "../components/Field";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { FilterPill } from "../components/FilterPill";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import {
  buildHoldingPositionsByAccount,
  buildManualPriceLookup,
  createFxConverter,
  dayChangeMovers,
  formatMoney,
  formatNumber,
  formatCompactNumber,
  formatPrice,
  formatQuantity,
  resolveAssetName,
  resolveSectorLabel,
  todayInTimezone,
  assetTypeLabels,
  loadEtfSectorFeed,
  sectorWeightsFor,
  type AnalyticsPosition,
  type LoadedFeed,
  type Account,
  type DailyPriceSeriesRow,
  type DayChangeQuote,
  type HoldingPosition,
  type InvestmentRecord,
  type ManualPriceSnapshot,
  type MarketQuote as DomainMarketQuote,
  type PortfolioAsset,
} from "../domain";
import {
  useBackfillAssetProfiles,
  useRefreshDailyPrices,
  useRefreshQuotes,
  DEMO_MARKET_MESSAGE,
} from "../features/market-data/useMarketRefresh";
import { useDemoMode } from "../state/demoMode";
import {
  useUiPreferences,
  type NameLocalePreference,
  type HoldingsColumnKey,
} from "../state/uiPreferences";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { HoldingEditModal } from "./HoldingEditModal";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";
import { InvestmentsAnalyticsTab } from "./InvestmentsAnalyticsTab";
import { RecurringInvestmentsTab } from "./RecurringInvestmentsTab";
import { TransactionsRoute } from "./TransactionsRoute";
import {
  InvestmentImportWizard,
  type InvestmentActivityImportPlan,
} from "./InvestmentImportWizard";
import { quoteLookupKeys } from "../domain/marketSymbols";
import { customPriceStaleness } from "../domain/dataHealth";
import { ALL_BOOKS, bookAccountIdSet } from "../domain/bookScope";

export function InvestmentsRoute() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/investments" });
  const searchTab = search.tab as
    "portfolio" | "transactions" | "recurring" | "analytics" | undefined;
  const searchSector = search.sector as string | undefined;
  const [importOpen, setImportOpen] = useState(false);

  const [tab, setTabState] = useState<"portfolio" | "transactions" | "recurring" | "analytics">(
    searchTab && ["portfolio", "transactions", "recurring", "analytics"].includes(searchTab)
      ? searchTab
      : "portfolio",
  );

  function setTab(next: "portfolio" | "transactions" | "recurring" | "analytics") {
    setTabState(next);
    void navigate({
      to: "/investments",
      search: (prev) => ({
        ...prev,
        tab: next,
        sector: next === "portfolio" ? prev.sector : undefined,
      }),
    });
  }

  const {
    accounts,
    assets,
    investments,
    quotes,
    settings,
    dailyFxRates,
    dailyPrices,
    manualPriceSnapshots,
    isInitialLoading,
    isError,
    error,
    refetchAll,
  } = useFinanceData();
  const importRecords = useRepositoryMutation(
    (repository, plan: InvestmentActivityImportPlan) => repository.importInvestmentActivity(plan),
    ["investments", "assets", "accounts", "ledger"],
  );
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const backfillAssetProfiles = useBackfillAssetProfiles();
  // "auto" follows the app UI language, which is Chinese-first (see i18n.ts:
  // auto → zh-TW). Resolve it to zh-Hant so holdings show Chinese names rather
  // than whatever the OS/browser locale happens to be.
  const nameLocale = useUiPreferences((state) =>
    state.nameLocale === "auto" ? "zh-Hant" : state.nameLocale,
  );
  const benchmarkTicker = useUiPreferences((state) => state.benchmarkTicker);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
  const toast = useToast();

  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const manualSnapshotRows = manualPriceSnapshots.data ?? [];
  const appSettings = settings.data;
  const { primaryCurrency, toPrimary } = useMemo(
    () => createFxConverter(appSettings, dailyFxRates.data ?? []),
    [appSettings, dailyFxRates.data],
  );

  // 帳本 (Books) switcher scope (plan 189 §1 #9): a company brokerage's
  // holdings must not blend into the personal portfolio / TWR. Investments are
  // owned via accounts (manual asset.accountId; transaction records'
  // linkedAccountId), so we scope holdings/records to the active book. In 總帳
  // (activeBookId "all") nothing is filtered → identical to pre-books; market-
  // data refresh keeps reading the full asset set (quotes are shared, not
  // book-scoped).
  const isAllBooks = activeBookId === ALL_BOOKS;
  const switcherAccountIds = useMemo(
    () => bookAccountIdSet(accountRows, activeBookId),
    [accountRows, activeBookId],
  );
  const bookRecordRows = useMemo(
    () =>
      isAllBooks
        ? recordRows
        : recordRows.filter(
            (r) => r.linkedAccountId != null && switcherAccountIds.has(r.linkedAccountId),
          ),
    [recordRows, isAllBooks, switcherAccountIds],
  );
  const bookAssetIds = useMemo(() => {
    const ids = new Set<string>();
    for (const a of assetRows) {
      if (a.accountId != null && switcherAccountIds.has(a.accountId)) ids.add(a.id);
    }
    for (const r of bookRecordRows) ids.add(r.assetId);
    return ids;
  }, [assetRows, bookRecordRows, switcherAccountIds]);
  const bookAssetRows = useMemo(
    () => (isAllBooks ? assetRows : assetRows.filter((a) => bookAssetIds.has(a.id))),
    [assetRows, bookAssetIds, isAllBooks],
  );

  const quoteMap = useMemo(() => {
    const map: Record<string, DomainMarketQuote | undefined> = {};
    for (const quote of quoteRows) {
      const normalizedQuote = {
        symbol: quote.symbol,
        price: quote.price,
        currency: quote.currency,
      };
      for (const key of quoteLookupKeys(quote.symbol)) {
        if (!map[key]) map[key] = normalizedQuote;
      }
    }
    return map;
  }, [quoteRows]);

  const accountMap = useMemo(
    () => new Map(accountRows.map((account) => [account.id, account])),
    [accountRows],
  );
  const investmentAccounts = useMemo(
    () => accountRows.filter((account) => account.type === "investment"),
    [accountRows],
  );

  const timezoneForDue = useUiPreferences((state) => state.timezone);

  // Shared valuation context so market value here matches the Dashboard / net
  // worth trend: live quote → latest daily close → average cost.
  const valuationToday = todayInTimezone(timezoneForDue);
  // Manual-price resolver for custom assets; keeps 投資 page value in lock-step
  // with the Dashboard for manually-priced holdings.
  const manualPriceLookup = useMemo(
    () => buildManualPriceLookup(manualSnapshotRows),
    [manualSnapshotRows],
  );

  const positions = useMemo(() => {
    const all = buildHoldingPositionsByAccount(assetRows, recordRows, quoteMap, {
      dailyPrices: dailyPriceRows,
      asOf: valuationToday,
      manualPriceLookup,
    });
    // Switcher-scoped by owning account (plan 189). Positions carry accountId,
    // so a ticker held in both books shows only the active book's lot. 總帳
    // shows everything (incl. null-account legacy positions) unchanged.
    return isAllBooks
      ? all
      : all.filter((p) => p.accountId != null && switcherAccountIds.has(p.accountId));
  }, [
    assetRows,
    recordRows,
    quoteMap,
    dailyPriceRows,
    valuationToday,
    manualPriceLookup,
    isAllBooks,
    switcherAccountIds,
  ]);

  // ETF sector feed (plan 071): bundled snapshot + on-demand public pull. Loaded
  // once; weights light up 068's dormant weighted sector split. Demo mode stays
  // bundled-only (no network). Best-effort — a miss just uses the 068 bucket.
  const demoActive = useDemoMode((state) => state.active);
  const [etfFeed, setEtfFeed] = useState<LoadedFeed | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadEtfSectorFeed({ bundledOnly: demoActive })
      .then((loaded) => {
        if (!cancelled) setEtfFeed(loaded);
      })
      .catch(() => {
        // No feed available — analytics falls back to the 068 ETF/fund bucket.
      });
    return () => {
      cancelled = true;
    };
  }, [demoActive]);

  // Current holdings in the shape the analytics engine consumes (fixed-basket).
  const analyticsPositions = useMemo<AnalyticsPosition[]>(
    () =>
      bookAssetRows
        .filter((a) => a.deletedAt === null && a.totalQuantity > 0)
        .map((a) => ({
          assetId: a.id,
          ticker: a.ticker,
          quantity: a.totalQuantity,
          currency: a.currency,
          averageCost: a.averageCost,
          isManual: a.holdingSource === "manual",
          assetClass: a.assetType ? assetTypeLabels[a.assetType] : undefined,
          sector: a.sector,
          sectorCanonical: a.sectorCanonical ?? null,
          industry: a.industry,
          assetType: a.assetType,
          classificationLocked: a.classificationLocked ?? false,
          // Fetched ETF weights (canonical, plan 070). buildSectorBreakdown applies
          // precedence manual(069) > fetched > bucket and only splits a fund whose
          // weights are trustworthy; a miss/empty → the 068 bucket.
          sectorWeights: etfFeed ? sectorWeightsFor(etfFeed, a.ticker) : null,
        })),
    [bookAssetRows, etfFeed],
  );

  const allAssetMeta = useMemo(
    () => new Map(bookAssetRows.map((a) => [a.id, { ticker: a.ticker, currency: a.currency }])),
    [bookAssetRows],
  );

  // Best-effort: pull the benchmark's 1Y daily history so the analytics tab can
  // draw the comparison line. Silent on failure — the chart degrades gracefully.
  async function ensureBenchmarkHistory(ticker: string) {
    if (useDemoMode.getState().active) return;
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    try {
      await refreshDailyPrices.mutateAsync({ tickers: [t], range: "1y" });
    } catch {
      // ignore — benchmark line is optional.
    }
  }

  const [statusMessage, setStatusMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [backfillArmed, setBackfillArmed] = useState(false);
  const {
    sentinelRef: chromeSentinelRef,
    chromeRef,
    condensed: chromeCondensed,
    height: chromeHeight,
  } = useStickyChrome();

  async function refreshLatestQuotes() {
    setStatusMessage("");
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: DEMO_MARKET_MESSAGE });
      setStatusMessage(DEMO_MARKET_MESSAGE);
      return;
    }
    const tickers = [
      ...new Set(assetRows.map((asset) => asset.ticker.toUpperCase()).filter(Boolean)),
    ];
    if (tickers.length === 0) {
      setStatusMessage("尚無持倉可以更新報價。");
      return;
    }
    try {
      await refreshQuotes.mutateAsync(tickers);
      setStatusMessage("已更新最新報價。");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "報價更新失敗。");
    }
  }

  async function backfillHistoricalPrices(range: "1y" | "5y") {
    setStatusMessage("");
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: DEMO_MARKET_MESSAGE });
      return;
    }
    const tickers = [
      ...new Set(
        assetRows
          .filter((a) => a.ticker.trim() && !a.deletedAt)
          .map((a) => a.ticker.trim().toUpperCase()),
      ),
    ];
    if (tickers.length === 0) {
      toast.info("尚無持倉可回補");
      return;
    }
    const progressId = toast.info("回補歷史股價中", {
      description: `${tickers.length} 檔標的，${range} 資料`,
      durationMs: 0,
    });
    try {
      const result = await refreshDailyPrices.mutateAsync({ tickers, range });
      toast.dismiss(progressId);
      if (result.failed.length) {
        toast.warning("部分股價未取得", {
          description: `已儲存 ${result.saved} 筆。`,
          detail: result.failed.join("\n"),
        });
      } else {
        toast.success(`已回補 ${result.saved} 筆歷史股價`);
      }
      setStatusMessage(`已回補 ${result.saved} 筆歷史股價。`);
    } catch (error) {
      toast.dismiss(progressId);
      const message = error instanceof Error ? error.message : "歷史股價回補失敗。";
      toast.error("歷史股價回補失敗", { description: message });
      setStatusMessage(message);
    }
  }

  async function backfillClassifications() {
    setStatusMessage("");
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: DEMO_MARKET_MESSAGE });
      return;
    }
    // Mirror useBackfillAssetProfiles' candidate rule — the old `!assetType`
    // gate reported「沒有需要回補」even when sector/industry were missing.
    const candidates = assetRows.filter((asset) => {
      if (!asset.ticker.trim()) return false;
      // User-locked rows are excluded from backfill — keep this count honest.
      if (asset.classificationLocked) return false;
      if (!asset.assetType) return true;
      return asset.assetType === "equity" && (!asset.sector || !asset.industry);
    });
    if (candidates.length === 0) {
      toast.info("沒有需要回補的持倉", {
        description: "所有持倉都已有類型與產業分類；個別調整可用持倉列的「編輯持倉」。",
      });
      setStatusMessage("所有持倉都已有類型與產業分類。");
      return;
    }
    // Two-click confirm — window.confirm is a no-op in the Tauri webview.
    if (!backfillArmed) {
      setBackfillArmed(true);
      toast.info(`將回補 ${candidates.length} 筆持倉分類`, {
        description:
          "資料來源：台股用證交所公司資料、其餘用 Yahoo Finance。再按一次「回補分類」確認執行。",
      });
      return;
    }
    setBackfillArmed(false);

    const progressId = toast.info("回補分類中", {
      description: `0 / ${candidates.length}`,
      durationMs: 0,
    });
    try {
      const result = await backfillAssetProfiles.mutateAsync({
        onProgress: (done, total) => {
          setStatusMessage(`回補分類中 ${done} / ${total}…`);
        },
      });
      toast.dismiss(progressId);
      if (result.failed.length) {
        toast.warning("部分分類未取得", {
          description: `已更新 ${result.updated} / ${result.total} 筆。`,
          detail: result.failed.join("\n"),
        });
        setStatusMessage(
          `已回補 ${result.updated} / ${result.total} 筆分類，部分 ticker 需要手動填入。`,
        );
      } else {
        toast.success(`已回補 ${result.updated} 筆分類`);
        setStatusMessage(`已回補 ${result.updated} 筆分類。`);
      }
    } catch (error) {
      toast.dismiss(progressId);
      const message = error instanceof Error ? error.message : "分類回補失敗。";
      toast.error("分類回補失敗", { description: message });
      setStatusMessage(message);
    }
  }

  const totalValue = positions.reduce(
    (sum, position) => sum + toPrimary(position.marketValue, position.currency),
    0,
  );
  const totalCost = positions.reduce(
    (sum, position) => sum + toPrimary(position.costBasis, position.currency),
    0,
  );
  const totalPnL = totalValue - totalCost;
  const returnPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;

  const { realizedYTD, dividendsYTD } = useMemo(() => {
    const currentYearStr = new Date().getFullYear().toString();
    let rYTD = 0;
    let dYTD = 0;

    const buckets = new Map<string, { quantity: number; cost: number }>();
    const sortedRecords = [...bookRecordRows].sort((a, b) => a.date.localeCompare(b.date));

    for (const record of sortedRecords) {
      if (record.deletedAt !== null) continue;
      const asset = assetRows.find((a) => a.id === record.assetId);
      if (!asset) continue;

      const key = `${record.assetId}-${record.linkedAccountId ?? "unassigned"}`;
      const bucket = buckets.get(key) ?? { quantity: 0, cost: 0 };
      const isCurrentYear = record.date.startsWith(currentYearStr);

      if (record.action === "buy") {
        bucket.quantity += record.quantity;
        bucket.cost += record.price * record.quantity + record.fee;
      } else if (record.action === "sell") {
        const avgCost = bucket.quantity === 0 ? 0 : bucket.cost / bucket.quantity;
        const saleProceeds = record.price * record.quantity - record.fee;
        const costOfSold = avgCost * record.quantity;
        const realized = saleProceeds - costOfSold;

        if (isCurrentYear) {
          rYTD += toPrimary(realized, asset.currency, record.date);
        }

        bucket.quantity -= record.quantity;
        bucket.cost -= costOfSold;
      } else if (record.action === "cashDividend") {
        if (isCurrentYear) {
          // New rows store the total in `price` (quantity 0); legacy rows used
          // 每股股利 × 股數. Net of any withholding fee.
          const gross = record.quantity > 0 ? record.price * record.quantity : record.price;
          dYTD += toPrimary(gross - record.fee, asset.currency, record.date);
        }
      } else if (record.action === "stockDividend") {
        bucket.quantity += record.quantity;
      } else if (record.action === "capitalReduction") {
        // Matches the engine: cancels shares and returns capital (lowers basis);
        // any cash above remaining basis is a realized gain.
        const cancelled = Math.min(record.quantity, bucket.quantity);
        const cashReturned = record.price * record.quantity;
        const basisReduced = Math.min(cashReturned, bucket.cost);
        if (isCurrentYear && cashReturned > basisReduced) {
          rYTD += toPrimary(cashReturned - basisReduced, asset.currency, record.date);
        }
        bucket.cost -= basisReduced;
        bucket.quantity -= cancelled;
      } else if (record.action === "stockSplit" && record.quantity > 0) {
        bucket.quantity *= record.quantity;
      }
      buckets.set(key, bucket);
    }
    return { realizedYTD: rYTD, dividendsYTD: dYTD };
  }, [bookRecordRows, assetRows, toPrimary]);

  if (isInitialLoading) {
    return (
      <div className="ns-page grid gap-5 pt-6 pb-[120px]">
        <Skeleton className="h-[200px]" />
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[320px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid min-h-[50vh] place-items-center p-6 text-center">
        <div className="max-w-md">
          <h3
            className="text-[17px] font-semibold"
            style={{ fontFamily: "var(--ns-font-display)" }}
          >
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">
            {error instanceof Error ? error.message : "請稍後再試。"}
          </p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ns-invest-page ns-page pt-6 pb-[120px]"
      style={{ ["--ns-page-chrome-h" as string]: `${chromeHeight}px` }}
    >
      <div
        ref={chromeSentinelRef}
        aria-hidden="true"
        style={{ position: "absolute", width: 1, height: 1 }}
      />
      <div
        ref={chromeRef}
        className="ns-page-chrome ns-scroll-edge"
        data-condensed={chromeCondensed}
        data-stuck={chromeCondensed}
      >
        <div className="ns-page-chrome-row">
          {/* Header */}
          <div className="ns-page-chrome-header-row ns-invest-header flex items-end justify-between mb-0">
            <div>
              <div className="text-xs ns-field-label ns-page-chrome-eyebrow">投資組合</div>
              <h1
                className="text-[28px] ns-page-chrome-title"
                style={{
                  fontFamily: "var(--ns-font-display)",
                  margin: 0,
                  letterSpacing: -0.02,
                  fontWeight: 600,
                }}
              >
                投資
              </h1>
            </div>
            <div className="ns-page-chrome-actions ns-invest-header-actions flex gap-2">
              {/* Entry point restored — it was lost in the holdings→portfolio tab
              rename, leaving backfillClassifications unreachable. Demoted into
              a ⋯ overflow menu (plan 165) since it's an infrequent action. */}
              {tab === "portfolio" ? (
                <Popover>
                  <PopoverTrigger
                    render={<Button variant="outline" size="icon" />}
                    aria-label="更多操作"
                    title="更多操作"
                  >
                    <DotsThree size={18} weight="bold" />
                  </PopoverTrigger>
                  <PopoverContent align="end" style={{ width: 200 }}>
                    <button
                      type="button"
                      onClick={backfillClassifications}
                      disabled={backfillAssetProfiles.isPending}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition hover:bg-black/5 dark:hover:bg-white/5"
                      style={backfillArmed ? { color: "var(--ns-warn)" } : undefined}
                    >
                      <ArrowsClockwise size={14} />
                      {backfillAssetProfiles.isPending
                        ? "回補中"
                        : backfillArmed
                          ? "再按一次確認"
                          : "回補分類"}
                    </button>
                  </PopoverContent>
                </Popover>
              ) : null}
              <Button
                variant="outline"
                onClick={refreshLatestQuotes}
                loading={refreshQuotes.isPending}
              >
                <ArrowsClockwise size={14} />
                {refreshQuotes.isPending ? "更新中" : "更新報價"}
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={14} weight="bold" />
                新增交易
              </Button>
            </div>
          </div>

          {statusMessage ? (
            <div className="mt-4">
              <StatusText>{statusMessage}</StatusText>
            </div>
          ) : null}

          {/* Page-level tabs: 持倉 | 交易紀錄 | 定期定額 | 分析. */}
          <div
            className="ns-page-chrome-tabs-row ns-page-tabs mt-5 mb-[22px] flex"
            style={{
              borderBottom: "1px solid var(--ns-border)",
            }}
          >
            {[
              { id: "portfolio", label: "持倉", active: tab === "portfolio" },
              { id: "transactions", label: "交易紀錄", active: tab === "transactions" },
              { id: "recurring", label: "定期定額", active: tab === "recurring" },
              { id: "analytics", label: "分析", active: tab === "analytics" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className="text-sm"
                style={{
                  padding: "10px 20px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontWeight: t.active ? 600 : 400,
                  color: t.active ? "var(--ns-fg)" : "var(--ns-fg-muted)",
                  borderBottom: t.active ? "2px solid var(--ns-accent)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 0.12s",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "portfolio" ? (
        <>
          {/* Top KPIs — one strip, 4 columns divided by a hairline, instead of
              4 separate cards (saves vertical space; plan 165). */}
          <CossCard className="ns-holdings-summary mb-5">
            {(
              [
                // [label, compact display, exact value (tooltip), pct, positive]
                [
                  "目前市值",
                  `NT$${formatCompactNumber(totalValue)}`,
                  `NT$${formatNumber(totalValue)}`,
                  "",
                  true,
                ],
                [
                  "未實現損益",
                  `NT$${formatCompactNumber(Math.abs(totalPnL))}`,
                  `NT$${formatNumber(Math.abs(totalPnL))}`,
                  totalPnL >= 0 ? `+${returnPct.toFixed(2)}%` : `${returnPct.toFixed(2)}%`,
                  totalPnL >= 0,
                ],
                [
                  "今年已實現",
                  `NT$${formatCompactNumber(Math.abs(realizedYTD))}`,
                  `NT$${formatNumber(Math.abs(realizedYTD))}`,
                  realizedYTD >= 0 ? "" : "虧損",
                  realizedYTD >= 0,
                ],
                [
                  "今年股利",
                  `NT$${formatCompactNumber(dividendsYTD)}`,
                  `NT$${formatNumber(dividendsYTD)}`,
                  "",
                  true,
                ],
              ] as const
            ).map(([label, val, exact, pct, pos], i) => (
              <div key={i} className="ns-holdings-summary-col min-w-0">
                <div
                  className="text-xs mb-2 shrink-0 font-medium"
                  style={{ color: "var(--ns-fg-muted)" }}
                >
                  {label}
                </div>
                {/* Value takes the full column width (compact 萬/億 keeps it
                    short); the % change sits on its own line so it never
                    squeezes the number into an ellipsis. */}
                <div
                  className="num"
                  style={{
                    fontSize: "clamp(14px, 1.7vw, 22px)",
                    fontWeight: 500,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={exact}
                >
                  {val}
                </div>
                {pct ? (
                  <div
                    className="num text-xs"
                    style={{ marginTop: 2, color: pos ? "var(--ns-gain)" : "var(--ns-loss)" }}
                  >
                    {pct}
                  </div>
                ) : null}
              </div>
            ))}
          </CossCard>

          <HoldingsAllocation
            positions={positions}
            assetsById={new Map(assetRows.map((asset) => [asset.id, asset]))}
            nameLocale={nameLocale}
            toPrimary={toPrimary}
            primaryCurrency={primaryCurrency}
          />

          <HoldingsTab
            positions={positions}
            accountMap={accountMap}
            accounts={investmentAccounts}
            nameLocale={nameLocale}
            assetsById={new Map(assetRows.map((asset) => [asset.id, asset]))}
            manualPriceSnapshots={manualSnapshotRows}
            toPrimary={toPrimary}
            primaryCurrency={primaryCurrency}
            dailyPrices={dailyPriceRows}
            quotes={quoteRows}
            records={bookRecordRows}
            initialSector={searchSector ?? "all"}
            onSectorChange={(sector) => {
              void navigate({
                to: "/investments",
                search: (prev) => ({
                  ...prev,
                  tab: "portfolio",
                  sector: sector === "all" ? undefined : sector,
                }),
              });
            }}
            onAddTransaction={() => setAddOpen(true)}
          />
        </>
      ) : null}

      {tab === "transactions" ? <TransactionsRoute /> : null}

      {tab === "recurring" ? <RecurringInvestmentsTab /> : null}

      {tab === "analytics" ? (
        <InvestmentsAnalyticsTab
          positions={analyticsPositions}
          records={bookRecordRows}
          dailyPrices={dailyPriceRows}
          manualSnapshots={manualSnapshotRows}
          toPrimary={toPrimary}
          allAssetMeta={allAssetMeta}
          benchmarkTicker={benchmarkTicker}
          primaryCurrency={primaryCurrency}
          onBackfillHoldings={backfillHistoricalPrices}
          onEnsureBenchmark={ensureBenchmarkHistory}
          backfilling={refreshDailyPrices.isPending}
          onSectorClick={(sector) => {
            setTab("portfolio");
            void navigate({ to: "/investments", search: { tab: "portfolio", sector } });
          }}
        />
      ) : null}

      <InvestmentEntryDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accountRows}
        portfolioAssets={assetRows}
        title="新增交易"
        initialMode="transaction"
        onOpenImport={() => setImportOpen(true)}
      />

      <InvestmentImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        accounts={accountRows}
        onImport={(input: InvestmentActivityImportPlan) => importRecords.mutateAsync(input)}
      />
    </div>
  );
}

interface AccountAggregate {
  account: Account;
  positions: HoldingPosition[];
  marketValue: number;
  costBasis: number;
  pnl: number;
  returnPercent: number;
}

function AccountsTab({
  accounts,
  positions,
  primaryCurrency,
  toPrimary,
}: {
  accounts: Account[];
  positions: HoldingPosition[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
}) {
  // Group positions by account once, then derive totals so the right pane
  // can read them in O(1) without recomputing on every selection change.
  const aggregates = useMemo<AccountAggregate[]>(() => {
    const byAccount = new Map<string, HoldingPosition[]>();
    for (const position of positions) {
      const key = position.accountId ?? "__unassigned__";
      const existing = byAccount.get(key) ?? [];
      existing.push(position);
      byAccount.set(key, existing);
    }
    return accounts.map((account) => {
      const accountPositions = byAccount.get(account.id) ?? [];
      const marketValue = accountPositions.reduce(
        (sum, position) => sum + toPrimary(position.marketValue, position.currency),
        0,
      );
      const costBasis = accountPositions.reduce(
        (sum, position) => sum + toPrimary(position.costBasis, position.currency),
        0,
      );
      const pnl = marketValue - costBasis;
      const returnPercent = costBasis === 0 ? 0 : (pnl / costBasis) * 100;
      return { account, positions: accountPositions, marketValue, costBasis, pnl, returnPercent };
    });
  }, [accounts, positions, toPrimary]);

  // Auto-select the first account on first render (or whenever the selected
  // one disappears) so the right pane always has something useful to show.
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    () => accounts[0]?.id ?? null,
  );
  useEffect(() => {
    if (accounts.length === 0) {
      if (selectedAccountId !== null) setSelectedAccountId(null);
      return;
    }
    if (!accounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<Bank size={24} weight="duotone" />}
        title="尚未設定券商帳戶"
        description="到「帳戶」分頁新增 Charles Schwab、Firstrade 等券商之後，這裡就會看到每家券商的持倉概況。"
      />
    );
  }

  const selected =
    aggregates.find((entry) => entry.account.id === selectedAccountId) ?? aggregates[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <AccountList
        aggregates={aggregates}
        selectedId={selected.account.id}
        onSelect={setSelectedAccountId}
        primaryCurrency={primaryCurrency}
      />
      <AccountDetail aggregate={selected} primaryCurrency={primaryCurrency} toPrimary={toPrimary} />
    </div>
  );
}

function AccountList({
  aggregates,
  selectedId,
  onSelect,
  primaryCurrency,
}: {
  aggregates: AccountAggregate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  primaryCurrency: string;
}) {
  // Aggregate-sorted by market value descending so the broker contributing the
  // most to your net worth shows up first. Tie-break by name for stability.
  const sorted = [...aggregates].sort((a, b) => {
    if (b.marketValue !== a.marketValue) return b.marketValue - a.marketValue;
    return a.account.name.localeCompare(b.account.name);
  });
  return (
    <div
      className="rounded-lg border lg:sticky lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto"
      style={{
        borderColor: "var(--ns-border)",
        background: "var(--ns-surface)",
        top: "calc(var(--ns-sticky-top) + var(--ns-demo-banner-h) + var(--ns-page-chrome-h) + 16px)",
      }}
    >
      <div
        className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--ns-muted)", borderColor: "var(--ns-border)" }}
      >
        我的券商（{aggregates.length}）
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {sorted.map((aggregate) => {
          const active = aggregate.account.id === selectedId;
          const pnlColor = aggregate.pnl >= 0 ? "var(--ns-gain)" : "var(--ns-loss)";
          return (
            <button
              key={aggregate.account.id}
              type="button"
              onClick={() => onSelect(aggregate.account.id)}
              aria-pressed={active}
              className="flex w-full items-start gap-3 border-b px-4 py-3 text-left outline-none transition hover:opacity-90"
              style={{
                borderColor: "var(--ns-border)",
                background: active ? "var(--ns-accent-soft)" : "transparent",
                color: active ? "var(--ns-accent)" : "var(--ns-fg)",
              }}
            >
              <div
                className="grid size-9 shrink-0 place-items-center rounded-md"
                style={{
                  background: active ? "var(--ns-accent)" : "var(--ns-surface-strong)",
                  color: active ? "white" : "var(--ns-muted)",
                }}
              >
                <Bank size={18} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{aggregate.account.name}</div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: active ? "var(--ns-accent)" : "var(--ns-muted)" }}
                >
                  {aggregate.positions.length} 檔 · {aggregate.account.currency}
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-sm font-semibold">
                  {formatMoney(aggregate.marketValue, primaryCurrency)}
                </div>
                <div className="text-[11px]" style={{ color: pnlColor }}>
                  {aggregate.pnl >= 0 ? "+" : ""}
                  {aggregate.returnPercent.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountDetail({
  aggregate,
  primaryCurrency,
  toPrimary,
}: {
  aggregate: AccountAggregate;
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
}) {
  const { account, positions, marketValue, costBasis, pnl, returnPercent } = aggregate;
  const sortedPositions = [...positions].sort(
    (a, b) => toPrimary(b.marketValue, b.currency) - toPrimary(a.marketValue, a.currency),
  );
  const totalForAllocation = sortedPositions.reduce(
    (sum, position) => sum + toPrimary(position.marketValue, position.currency),
    0,
  );

  return (
    <div className="grid gap-4">
      <Card title={account.name}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="text-sm" style={{ color: "var(--ns-muted)" }}>
            {account.type === "investment" ? "投資帳戶" : "存款帳戶"} · {account.currency}
          </div>
          <div className="tabular text-right">
            <div className="text-lg font-semibold">{formatMoney(marketValue, primaryCurrency)}</div>
            <div
              className="text-xs"
              style={{ color: pnl >= 0 ? "var(--ns-gain)" : "var(--ns-loss)" }}
            >
              損益 {pnl >= 0 ? "+" : ""}
              {formatNumber(pnl)} {primaryCurrency}（{pnl >= 0 ? "+" : ""}
              {returnPercent.toFixed(2)}%）
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryCell label="持倉檔數" value={`${positions.length}`} />
          <SummaryCell label="成本" value={formatMoney(costBasis, primaryCurrency)} />
          <SummaryCell
            label="未實現損益"
            value={`${pnl >= 0 ? "+" : ""}${formatNumber(pnl)} ${primaryCurrency}`}
            tone={pnl >= 0 ? "positive" : "negative"}
          />
        </div>
      </Card>

      {sortedPositions.length === 0 ? (
        <Card title="持倉">
          <p className="text-sm" style={{ color: "var(--ns-muted)" }}>
            此帳戶尚無持倉。
          </p>
        </Card>
      ) : (
        <AllocationCard
          positions={sortedPositions}
          totalForAllocation={totalForAllocation}
          toPrimary={toPrimary}
        />
      )}
    </div>
  );
}

function AllocationCard({
  positions,
  totalForAllocation,
  toPrimary,
}: {
  positions: HoldingPosition[];
  totalForAllocation: number;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
}) {
  const [expanded, setExpanded] = useState(false);
  const TOP = 10;
  const hasMore = positions.length > TOP;
  const visible = expanded || !hasMore ? positions : positions.slice(0, TOP);
  return (
    <Card
      title="庫存分布"
      action={
        hasMore ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-xs font-semibold outline-none transition hover:opacity-80"
            style={{ color: "var(--ns-accent)" }}
          >
            {expanded ? "收合" : `展開全部（${positions.length}）`}
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        {visible.map((position) => {
          const valueInBase = toPrimary(position.marketValue, position.currency);
          const ratio = totalForAllocation === 0 ? 0 : valueInBase / totalForAllocation;
          return (
            <div key={`${position.assetId}-allocation`} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{position.ticker}</span>
                <span className="tabular">{(ratio * 100).toFixed(1)}%</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full"
                style={{ background: "var(--ns-surface-strong)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${ratio * 100}%`, background: "var(--ns-accent)" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PerformanceTab({
  positions,
  assets,
  records,
  primaryCurrency,
  toPrimary,
  dailyPrices,
  manualPriceSnapshots,
  quoteMap,
  refreshing,
}: {
  positions: HoldingPosition[];
  assets: PortfolioAsset[];
  records: InvestmentRecord[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  dailyPrices: DailyPriceSeriesRow[];
  manualPriceSnapshots: ManualPriceSnapshot[];
  quoteMap: Record<string, DomainMarketQuote | undefined>;
  refreshing: boolean;
}) {
  const [range, setRange] = useState<PerformanceRange>("1Y");
  const [customStart, setCustomStart] = useState(() => dateDaysAgo(365));
  const [customEnd, setCustomEnd] = useState(() => todayDate());

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<ChartLineUp size={24} weight="duotone" />}
        title="尚無績效資料"
        description="新增持倉或交易紀錄後，這裡會顯示彙整後的市值、成本與未實現損益。"
      />
    );
  }
  const totalValue = positions.reduce(
    (sum, position) => sum + toPrimary(position.marketValue, position.currency),
    0,
  );
  const totalCost = positions.reduce(
    (sum, position) => sum + toPrimary(position.costBasis, position.currency),
    0,
  );
  const totalPnL = totalValue - totalCost;
  const returnPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;
  const trend = buildPerformanceTrend({
    positions,
    assets,
    records,
    dailyPrices,
    manualPriceSnapshots,
    toPrimary,
    range,
    customStart,
    customEnd,
    quoteMap,
  });

  return (
    <div className="grid gap-4">
      <Card title="總覽">
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCell label="市值" value={formatMoney(totalValue, primaryCurrency)} />
          <SummaryCell label="成本" value={formatMoney(totalCost, primaryCurrency)} />
          <SummaryCell
            label="未實現損益"
            value={`${totalPnL >= 0 ? "+" : ""}${formatNumber(totalPnL)} ${primaryCurrency} (${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%)`}
            tone={totalPnL >= 0 ? "positive" : "negative"}
          />
        </div>
        {refreshing ? (
          <div className="mt-3 text-xs" style={{ color: "var(--ns-muted)" }}>
            正在抓取最新報價…
          </div>
        ) : null}
      </Card>
      <Card
        title="績效趨勢"
        action={
          <div className="flex flex-wrap gap-2">
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={performanceRangeOptions.map((option) => ({
                value: option,
                label: option,
                icon: null,
              }))}
            />
          </div>
        }
      >
        {range === "Custom" ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="開始">
              <TextInput
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </Field>
            <Field label="結束">
              <TextInput
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        {trend.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="portfolioPerformance" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" stroke="var(--ns-muted)" minTickGap={24} />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), primaryCurrency)}
                  labelFormatter={(_, payload) => payload[0]?.payload?.date ?? ""}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--ns-accent)"
                  fill="url(#portfolioPerformance)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={<ChartLineUp size={24} weight="duotone" />}
            title="還沒有足夠的歷史股價"
            description="先用「更新報價」或在持倉頁回補 1Y / 5Y 歷史股價，這裡就會依所選區間畫出投資市值趨勢。"
          />
        )}
      </Card>
      <Card title="貢獻度（依市值）">
        <div className="space-y-3">
          {[...positions]
            .sort(
              (a, b) => toPrimary(b.marketValue, b.currency) - toPrimary(a.marketValue, a.currency),
            )
            .slice(0, 8)
            .map((position) => {
              const valueInBase = toPrimary(position.marketValue, position.currency);
              const ratio = totalValue === 0 ? 0 : valueInBase / totalValue;
              return (
                <div
                  key={`${position.assetId}-${position.accountId ?? "none"}`}
                  className="space-y-1"
                >
                  <div className="flex justify-between text-sm">
                    <span>{position.ticker}</span>
                    <span className="tabular">{(ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ background: "var(--ns-surface-strong)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${ratio * 100}%`, background: "var(--ns-accent)" }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </div>
  );
}

type HoldingsSortKey =
  | "ticker"
  | "name"
  | "account"
  | "quantity"
  | "averageCost"
  | "marketPrice"
  | "marketValue"
  | "unrealizedGain"
  | "unrealizedGainPercent";

type SortDirection = "asc" | "desc";

interface HoldingsSortState {
  key: HoldingsSortKey;
  direction: SortDirection;
}

// Donut palette — DS chart tokens plus two accents, matching the dashboard.
const ALLOCATION_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
  "var(--ns-chart-6)",
  "var(--ns-chart-7)",
];

/** Portfolio composition donut (by holding, valued in base currency). */
function HoldingsAllocation({
  positions,
  assetsById,
  nameLocale,
  toPrimary,
  primaryCurrency,
}: {
  positions: HoldingPosition[];
  assetsById: Map<string, PortfolioAsset>;
  nameLocale: NameLocalePreference;
  toPrimary: (value: number, currency: string) => number;
  primaryCurrency: string;
}) {
  const data = useMemo(() => {
    const byTicker = new Map<string, { value: number; assetId: string; ticker: string }>();
    for (const p of positions) {
      const value = toPrimary(p.marketValue, p.currency);
      if (value <= 0) continue;
      const cur = byTicker.get(p.ticker) ?? { value: 0, assetId: p.assetId, ticker: p.ticker };
      cur.value += value;
      byTicker.set(p.ticker, cur);
    }
    const all = [...byTicker.values()].sort((a, b) => b.value - a.value);
    const total = all.reduce((s, x) => s + x.value, 0) || 1;
    const top = all.slice(0, 6).map((x) => ({
      name: resolveAssetName(assetsById.get(x.assetId), nameLocale) || x.ticker,
      value: x.value,
      pct: (x.value / total) * 100,
    }));
    const restValue = all.slice(6).reduce((s, x) => s + x.value, 0);
    if (restValue > 0) top.push({ name: "其他", value: restValue, pct: (restValue / total) * 100 });
    return top;
  }, [positions, assetsById, nameLocale, toPrimary]);

  if (data.length === 0) return null;

  // Thin stacked bar instead of a donut (plan 165) — same top-6 + 其他 data,
  // ~360px shorter than the old chart+legend card.
  return (
    <CossCard className="ns-holdings-allocation p-5 mb-5">
      <div className="text-xs mb-3.5 font-medium" style={{ color: "var(--ns-fg-muted)" }}>
        持倉配置
      </div>
      <div
        className="ns-holdings-alloc-bar"
        title={data.map((d) => `${d.name} ${d.pct.toFixed(1)}%`).join(" · ")}
      >
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.name} · ${formatMoney(d.value, primaryCurrency)} (${d.pct.toFixed(1)}%)`}
            style={{
              width: `${d.pct}%`,
              background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
            }}
          />
        ))}
      </div>
      <div className="ns-holdings-allocation-list mt-3.5">
        {data.map((d, i) => (
          <div key={i} className="text-xs flex items-center gap-2 min-w-0">
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 2,
                background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
                flexShrink: 0,
              }}
            />
            <span className="flex-1 min-w-0 truncate" title={d.name}>
              {d.name}
            </span>
            <span className="mono dim shrink-0">{d.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </CossCard>
  );
}

// Optional, user-toggleable holdings columns (B21; slimmed for plan 165).
// 代號/名稱, 今日, 現價, 市值, 未實現損益 are the always-shown default 5 columns —
// 現價 moved out of this list since it's no longer optional. The rest push
// into the row expansion by default and only reappear as flattened columns
// when the user opts in via 「欄位」.
const HOLDINGS_COLUMN_OPTIONS: { key: HoldingsColumnKey; label: string; width: string }[] = [
  { key: "dayPnl", label: "當日損益", width: "96px" },
  { key: "account", label: "券商", width: "128px" },
  { key: "averageCost", label: "均價", width: "88px" },
  { key: "assetType", label: "類型", width: "72px" },
  { key: "costBasis", label: "成本基礎", width: "112px" },
];

function HoldingsTab({
  positions,
  accountMap,
  accounts,
  nameLocale,
  assetsById,
  manualPriceSnapshots,
  toPrimary,
  primaryCurrency,
  dailyPrices,
  quotes,
  records,
  initialSector,
  onSectorChange,
  onAddTransaction,
}: {
  positions: HoldingPosition[];
  accountMap: Map<string, Account>;
  accounts: Account[];
  nameLocale: NameLocalePreference;
  assetsById: Map<string, PortfolioAsset>;
  manualPriceSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  primaryCurrency: string;
  /** Daily closes + live quotes, for the row 「今日」 % and expansion sparkline. */
  dailyPrices: DailyPriceSeriesRow[];
  quotes: DayChangeQuote[];
  /** Investment records, for the expansion's 股利 YTD. */
  records: InvestmentRecord[];
  initialSector?: string;
  onSectorChange?: (sector: string) => void;
  /** Opens the shared 新增交易 drawer from the row expansion's quick-add button. */
  onAddTransaction?: () => void;
}) {
  const navigate = useNavigate();
  const timezone = useUiPreferences((state) => state.timezone);
  const holdingsColumns = useUiPreferences((state) => state.holdingsColumns);
  const setHoldingsColumns = useUiPreferences((state) => state.setHoldingsColumns);
  const visibleCol = (key: HoldingsColumnKey) => holdingsColumns.includes(key);
  const toggleCol = (key: HoldingsColumnKey) =>
    setHoldingsColumns(
      holdingsColumns.includes(key)
        ? holdingsColumns.filter((k) => k !== key)
        : [...holdingsColumns, key],
    );
  const [editingAsset, setEditingAsset] = useState<PortfolioAsset | null>(null);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterSector, setFilterSectorState] = useState<string>(initialSector ?? "all");
  const [searchTerm, setSearchTerm] = useState("");

  // Sync when the parent drives the sector via URL (e.g. from Analytics click).
  useEffect(() => {
    if (initialSector !== undefined && initialSector !== filterSector) {
      setFilterSectorState(initialSector);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSector]);

  function setFilterSector(next: string) {
    setFilterSectorState(next);
    onSectorChange?.(next);
  }

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Per-holding stale-price signal for custom assets (plan 150). Groups the
  // manual snapshots once, then classifies each row via the shared domain helper
  // so this badge and the Dashboard data-health banner never disagree.
  const snapshotsByAsset = useMemo(() => {
    const map = new Map<string, ManualPriceSnapshot[]>();
    for (const snap of manualPriceSnapshots) {
      const list = map.get(snap.assetId);
      if (list) list.push(snap);
      else map.set(snap.assetId, [snap]);
    }
    return map;
  }, [manualPriceSnapshots]);
  const todayIso = todayInTimezone(timezone);
  const customPriceBadge = (asset: PortfolioAsset | null) => {
    if (!asset) return null;
    const staleness = customPriceStaleness(asset, snapshotsByAsset.get(asset.id) ?? [], todayIso);
    if (staleness === "stale") {
      return (
        <Badge variant="warning" size="sm" title={`價格已超過 90 天未更新`}>
          價格過期
        </Badge>
      );
    }
    if (staleness === "missing") {
      return (
        <Badge variant="warning" size="sm" title="尚未記錄任何價格">
          未定價
        </Badge>
      );
    }
    return null;
  };

  // Unique resolved sector labels across all positions, for the sector filter dropdown
  const sectorOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of positions) {
      const raw = assetsById.get(p.assetId)?.sector;
      const label = resolveSectorLabel(raw, nameLocale) ?? "未知";
      seen.add(label);
    }
    return [...seen].sort();
  }, [positions, assetsById, nameLocale]);
  // Filter is only useful when at least one position resolves to a known
  // sector — if everything is 未知/空, the dropdown can't actually filter
  // anything and just adds noise, so hide it entirely.
  const hasKnownSectors = useMemo(
    () => sectorOptions.some((s) => s && s !== "未知"),
    [sectorOptions],
  );

  // Per-ticker day-change % for the 「今日」 column and 「今日影響」 in the row
  // expansion. Reuses dayChangeMovers (dashboard's mover logic) rather than
  // hand-rolling the quote-vs-close reference rule — see plan 165 Step 3.
  const dayChangeByTicker = useMemo(() => {
    const heldTickers = [...new Set(positions.map((p) => p.ticker.toUpperCase()))];
    if (heldTickers.length === 0) return new Map<string, number>();
    const movers = dayChangeMovers({ dailyPrices, quotes, heldTickers, limit: heldTickers.length });
    return new Map(movers.map((m) => [m.ticker, m.changePercent]));
  }, [positions, dailyPrices, quotes]);

  // Per-asset YTD cash dividends (net of fee), for the row expansion. Same
  // gross/net rule as the page-level 今年股利 KPI, scoped to one asset.
  const dividendsYtdByAsset = useMemo(() => {
    const map = new Map<string, number>();
    const currentYearStr = new Date().getFullYear().toString();
    for (const record of records) {
      if (record.deletedAt !== null) continue;
      if (record.action !== "cashDividend") continue;
      if (!record.date.startsWith(currentYearStr)) continue;
      const gross = record.quantity > 0 ? record.price * record.quantity : record.price;
      map.set(record.assetId, (map.get(record.assetId) ?? 0) + (gross - record.fee));
    }
    return map;
  }, [records]);

  // Which row's detail panel is open — ticker+account key, one at a time.
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => setPage(1), [filterAccount, filterSector, searchTerm]);

  // Default to descending market value — matches user expectation that the
  // biggest positions sit at the top until they explicitly sort otherwise.
  const [sort, setSort] = useState<HoldingsSortState>({ key: "marketValue", direction: "desc" });

  function toggleSort(key: HoldingsSortKey) {
    setSort((current) => {
      if (current.key !== key) {
        // First click on a new column picks the natural direction: descending
        // for numerics (most-to-least is what people scan for) and ascending
        // for text (A-Z reads naturally).
        const numeric: HoldingsSortKey[] = [
          "quantity",
          "averageCost",
          "marketPrice",
          "marketValue",
          "unrealizedGain",
          "unrealizedGainPercent",
        ];
        return { key, direction: numeric.includes(key) ? "desc" : "asc" };
      }
      return { key, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }

  function startEdit(asset: PortfolioAsset) {
    setEditingAsset(asset);
  }

  if (positions.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks size={24} weight="duotone" />}
        title="目前沒有持倉"
        description="點右上的「新增」按鈕，從券商開始記錄今天的部位或逐筆交易。"
      />
    );
  }

  const searchQuery = searchTerm.trim().toLowerCase();
  const filteredPositions = positions.filter((p) => {
    if (filterAccount !== "all" && p.accountId !== filterAccount) return false;
    if (filterSector !== "all") {
      const raw = assetsById.get(p.assetId)?.sector;
      const label = resolveSectorLabel(raw, nameLocale) ?? "未知";
      if (label !== filterSector) return false;
    }
    if (searchQuery) {
      const asset = assetsById.get(p.assetId);
      const name = asset ? resolveAssetName(asset, nameLocale) : p.name;
      if (!`${p.ticker} ${name ?? ""}`.toLowerCase().includes(searchQuery)) return false;
    }
    return true;
  });
  const sorted = sortHoldings(
    filteredPositions,
    sort,
    accountMap,
    assetsById,
    nameLocale,
    toPrimary,
  );
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const filterControlStyle: React.CSSProperties = {
    height: 38,
    minHeight: 38,
    fontSize: 13,
    lineHeight: 1.2,
  };

  // Default 5-column grid (代號/名稱, 今日, 現價, 市值, 未實現損益) + a 40px chevron
  // column; optional 「欄位」 columns append between 未實現損益 and the chevron.
  const optionalColumnsVisible = HOLDINGS_COLUMN_OPTIONS.filter((opt) => visibleCol(opt.key));
  // Optional columns use a fixed pixel track per column key (plan 187) rather
  // than `auto`: `auto` sizes to *that row's own* content, so a row whose
  // optional-column value happens to be wider/narrower than its siblings'
  // (e.g. 台積電's 均價 `1,019.46`) resolves a different track width than
  // every other row — since each row is its own independent `display: grid`
  // (`.ns-holdings-row`), that shifted the whole row's column boundaries out
  // of alignment with the rest of the table. A fixed track is identical for
  // every row regardless of content, so all rows (and the header) resolve
  // the same column edges. The five base columns keep the fr units and
  // absorb the remaining width.
  const gridTemplateColumns = [
    "2.2fr",
    "1fr",
    "1fr",
    "1.2fr",
    "1.3fr",
    ...optionalColumnsVisible.map((opt) => opt.width),
    "40px",
  ].join(" ");

  return (
    <>
      <Card>
        <div
          className="mb-4"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2
            className="text-[15px]"
            style={{
              fontFamily: "var(--ns-font-display)",
              fontWeight: 600,
              margin: 0,
              letterSpacing: -0.01,
              flex: "0 0 auto",
            }}
          >
            持倉 ({filteredPositions.length})
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              flexWrap: "wrap",
              // Grow to use the width between the 持倉 title and the right edge so
              // search / 券商 / 產業 / 欄位 sit on one row on normal screens; they
              // only wrap when the viewport is genuinely narrow (each keeps a
              // ~148px min-width and flex-wrap kicks in).
              flex: "1 1 auto",
              minWidth: 0,
              maxWidth: "100%",
            }}
          >
            {positions.length > 10 && (
              <input
                className="ns-input"
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜尋代號或名稱"
                aria-label="搜尋持倉"
                style={{
                  ...filterControlStyle,
                  flex: "1 1 180px",
                  minWidth: 148,
                  maxWidth: 220,
                  width: "auto",
                  padding: "0 12px",
                }}
              />
            )}
            <div style={{ flex: "1 1 180px", minWidth: 148, maxWidth: 220 }}>
              <AccountFilter
                accounts={accounts}
                value={filterAccount}
                onChange={setFilterAccount}
                allLabel="所有券商"
                placeholder="選擇券商"
                mutedAllLabel={false}
                style={{
                  ...filterControlStyle,
                  width: "100%",
                  minWidth: 0,
                  maxWidth: "none",
                  padding: "0 12px",
                }}
              />
            </div>
            {hasKnownSectors ? (
              <select
                className="ns-input"
                value={filterSector}
                onChange={(e) => setFilterSector(e.target.value)}
                style={{
                  ...filterControlStyle,
                  flex: "1 1 180px",
                  minWidth: 148,
                  maxWidth: 220,
                  width: "auto",
                  padding: "0 34px 0 12px",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <option value="all">所有產業</option>
                {sectorOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : null}
            <Popover>
              <PopoverTrigger
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 text-sm font-medium whitespace-nowrap"
                style={{
                  ...filterControlStyle,
                  boxSizing: "border-box",
                  flex: "0 0 auto",
                  borderColor: "var(--ns-border)",
                  background: "var(--ns-surface-elevated)",
                  color: "var(--ns-fg)",
                }}
                title="自訂顯示欄位"
              >
                <Sliders size={14} />
                欄位
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44">
                <div className="mb-1 px-1 text-xs" style={{ color: "var(--ns-muted)" }}>
                  顯示欄位
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {HOLDINGS_COLUMN_OPTIONS.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={visibleCol(opt.key)}
                        onChange={() => toggleCol(opt.key)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {/* Mobile: card stack — a 10-column table can't fit a phone, so each
            position becomes a tappable card showing the at-a-glance essentials
            (ticker, name, holdings, market value, P/L). Full per-column detail
            lives on the holding-detail page. The full table returns at sm+. */}
        <div className="flex flex-col gap-2 sm:hidden">
          {paginated.map((position) => {
            const account = position.accountId ? accountMap.get(position.accountId) : null;
            const asset = assetsById.get(position.assetId) ?? null;
            const displayName = asset ? resolveAssetName(asset, nameLocale) : position.name;
            const pnlUp = position.unrealizedGain >= 0;
            const pnlColor = pnlUp ? "var(--ns-gain)" : "var(--ns-loss)";
            return (
              <button
                type="button"
                key={`m-${position.assetId}-${position.accountId ?? "none"}`}
                onClick={() =>
                  navigate({ to: "/holdings/$ticker", params: { ticker: position.ticker } })
                }
                className="flex items-center gap-3 rounded-xl border p-3 text-left outline-none transition active:opacity-90"
                style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}
              >
                <AssetLogo ticker={position.ticker} name={position.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold whitespace-nowrap">{position.ticker}</span>
                    <span className="truncate text-xs" style={{ color: "var(--ns-muted)" }}>
                      {displayName}
                    </span>
                    {customPriceBadge(asset)}
                  </div>
                  <div
                    className="mt-0.5 truncate text-xs tabular"
                    style={{ color: "var(--ns-muted)" }}
                  >
                    {formatQuantity(position.quantity)} 股 · {account ? account.name : "未指定"}
                  </div>
                </div>
                <div className="text-right tabular">
                  <div className="font-semibold whitespace-nowrap">
                    {formatCompactNumber(position.marketValue)}{" "}
                    <span className="text-xs" style={{ color: "var(--ns-muted)" }}>
                      {position.currency}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-xs" style={{ color: pnlColor }}>
                    {pnlUp ? "+" : ""}
                    {formatCompactNumber(position.unrealizedGain)} · {pnlUp ? "+" : ""}
                    {position.unrealizedGainPercent.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Desktop: slim 5-column grid (代號/名稱, 今日, 現價, 市值, 未實現損益) with
            a chevron column; clicking a row expands the pushed-down detail
            (股數, 均價, 成本基礎, 券商, 今日影響, 股利 YTD, 持倉天數) inline instead
            of spreading everything across the table (plan 165). The 「欄位」
            toggle still appends flattened optional columns for power users. */}
        <div className="hidden overflow-x-auto sm:block">
          <div className="ns-holdings-table text-sm">
            <div className="ns-holdings-row ns-holdings-row-head" style={{ gridTemplateColumns }}>
              <SortableHeader
                label="代號/名稱"
                sortKey="ticker"
                sort={sort}
                onToggle={toggleSort}
              />
              <StaticHeader label="今日" align="right" />
              <SortableHeader
                label="現價"
                sortKey="marketPrice"
                sort={sort}
                onToggle={toggleSort}
                align="right"
              />
              <SortableHeader
                label="市值"
                sortKey="marketValue"
                sort={sort}
                onToggle={toggleSort}
                align="right"
              />
              <SortableHeader
                label="未實現損益"
                sortKey="unrealizedGain"
                sort={sort}
                onToggle={toggleSort}
                align="right"
              />
              {visibleCol("dayPnl") ? <StaticHeader label="當日損益" align="right" /> : null}
              {visibleCol("account") ? (
                <SortableHeader label="券商" sortKey="account" sort={sort} onToggle={toggleSort} />
              ) : null}
              {visibleCol("averageCost") ? (
                <SortableHeader
                  label="均價"
                  sortKey="averageCost"
                  sort={sort}
                  onToggle={toggleSort}
                  align="right"
                />
              ) : null}
              {visibleCol("assetType") ? <StaticHeader label="類型" /> : null}
              {visibleCol("costBasis") ? <StaticHeader label="成本基礎" align="right" /> : null}
              <div aria-hidden="true" />
            </div>
            {paginated.map((position) => {
              const rowKey = `${position.assetId}-${position.accountId ?? "none"}`;
              const account = position.accountId ? accountMap.get(position.accountId) : null;
              const asset = assetsById.get(position.assetId) ?? null;
              const displayName = asset ? resolveAssetName(asset, nameLocale) : position.name;
              const pnlTone = position.unrealizedGain >= 0 ? "positive" : "negative";
              const pnlColor = pnlTone === "positive" ? "var(--ns-gain)" : "var(--ns-loss)";
              const changePercent = dayChangeByTicker.get(position.ticker.toUpperCase()) ?? null;
              // 今日影響 = qty × (current − priorClose) × fx, derived algebraically
              // from marketPrice (current) and changePercent (from the same
              // dayChangeMovers source as the 「今日」 column) — see Step 3.
              const todayImpactPrimary =
                changePercent !== null && position.marketPrice !== null && changePercent > -100
                  ? toPrimary(
                      (position.quantity * position.marketPrice * changePercent) /
                        (100 + changePercent),
                      position.currency,
                    )
                  : null;
              const todayImpactLabel =
                todayImpactPrimary !== null
                  ? `${todayImpactPrimary >= 0 ? "+" : ""}${formatMoney(todayImpactPrimary, primaryCurrency)}`
                  : "—";
              const dividendsYtd = dividendsYtdByAsset.get(position.assetId) ?? 0;
              const holdingDays = asset?.acquisitionDate
                ? Math.max(
                    0,
                    Math.round(
                      (Date.parse(todayIso) - Date.parse(asset.acquisitionDate)) / 86_400_000,
                    ),
                  )
                : null;
              const isExpanded = expandedKey === rowKey;
              return (
                <Fragment key={rowKey}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    className="ns-holdings-row cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    style={{ gridTemplateColumns }}
                    onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedKey(isExpanded ? null : rowKey);
                      }
                    }}
                  >
                    <div className="py-3 font-semibold min-w-0">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <AssetLogo ticker={position.ticker} name={position.name} size={26} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="whitespace-nowrap">{position.ticker}</span>
                            {customPriceBadge(asset)}
                          </span>
                          <span
                            className="block truncate text-xs font-normal"
                            style={{ color: "var(--ns-muted)" }}
                            title={displayName}
                          >
                            {displayName}
                          </span>
                        </span>
                      </span>
                    </div>
                    <div
                      className="py-3 text-right tabular whitespace-nowrap"
                      style={{
                        color:
                          changePercent === null
                            ? "var(--ns-muted)"
                            : changePercent >= 0
                              ? "var(--ns-gain)"
                              : "var(--ns-loss)",
                      }}
                    >
                      {changePercent === null
                        ? "—"
                        : `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`}
                    </div>
                    <div className="py-3 text-right tabular whitespace-nowrap">
                      {position.marketPrice !== null ? formatPrice(position.marketPrice) : "—"}
                    </div>
                    <div
                      className="py-3 text-right tabular whitespace-nowrap"
                      title={`${formatNumber(position.marketValue)} ${position.currency}`}
                    >
                      {formatCompactNumber(position.marketValue)}
                      <span
                        className="inline-block w-9 text-left ml-1"
                        style={{ color: "var(--ns-muted)" }}
                      >
                        {position.currency}
                      </span>
                    </div>
                    <div
                      className="py-3 text-right tabular whitespace-nowrap"
                      style={{ color: pnlColor }}
                      title={`${position.unrealizedGain >= 0 ? "+" : ""}${formatNumber(position.unrealizedGain)} ${position.currency}`}
                    >
                      {position.unrealizedGain >= 0 ? "+" : ""}
                      {formatCompactNumber(position.unrealizedGain)}
                      <span className="block text-xs opacity-80">
                        {position.unrealizedGainPercent >= 0 ? "+" : ""}
                        {position.unrealizedGainPercent.toFixed(2)}%
                      </span>
                    </div>
                    {visibleCol("dayPnl") ? (
                      <div
                        className="py-3 text-right tabular whitespace-nowrap"
                        style={{
                          color:
                            todayImpactPrimary == null
                              ? "var(--ns-muted)"
                              : todayImpactPrimary >= 0
                                ? "var(--ns-gain)"
                                : "var(--ns-loss)",
                        }}
                        title={todayImpactLabel}
                      >
                        {todayImpactPrimary == null
                          ? "—"
                          : `${todayImpactPrimary >= 0 ? "+" : "−"}${formatCompactNumber(Math.abs(todayImpactPrimary))}`}
                      </div>
                    ) : null}
                    {visibleCol("account") ? (
                      <div className="max-w-[11rem] py-3" title={account ? account.name : "未指定"}>
                        <span className="block truncate">{account ? account.name : "未指定"}</span>
                      </div>
                    ) : null}
                    {visibleCol("averageCost") ? (
                      <div className="py-3 text-right tabular whitespace-nowrap">
                        {formatPrice(position.averageCost)}
                      </div>
                    ) : null}
                    {visibleCol("assetType") ? (
                      <div className="py-3 whitespace-nowrap" style={{ color: "var(--ns-muted)" }}>
                        {asset?.assetType ? assetTypeLabels[asset.assetType] : "—"}
                      </div>
                    ) : null}
                    {visibleCol("costBasis") ? (
                      <div
                        className="py-3 text-right tabular whitespace-nowrap"
                        title={`${formatNumber(position.costBasis)} ${position.currency}`}
                      >
                        {formatCompactNumber(position.costBasis)}
                        <span
                          className="inline-block w-9 text-left ml-1"
                          style={{ color: "var(--ns-muted)" }}
                        >
                          {position.currency}
                        </span>
                      </div>
                    ) : null}
                    <div className="py-3 flex items-center justify-center">
                      <CaretRight
                        size={14}
                        aria-hidden="true"
                        className="ns-caret-rotate"
                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                      />
                    </div>
                  </div>
                  {isExpanded ? (
                    <HoldingExpansion
                      position={position}
                      accountName={account ? account.name : "未指定"}
                      dailyPrices={dailyPrices}
                      todayImpactLabel={todayImpactLabel}
                      dividendsYtd={dividendsYtd}
                      holdingDays={holdingDays}
                      onEdit={asset ? () => startEdit(asset) : undefined}
                      editLabel={
                        asset?.holdingSource === "transactions" ? "編輯分類資料" : "編輯持倉"
                      }
                      onAddTransaction={onAddTransaction}
                      onViewDetail={() =>
                        navigate({ to: "/holdings/$ticker", params: { ticker: position.ticker } })
                      }
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </div>
        {filteredPositions.length === 0 && (
          <div className="muted text-body py-6 text-center">找不到符合的持倉</div>
        )}
        {totalPages > 1 && (
          <div
            className="flex justify-center items-center gap-4 mt-6 pt-4"
            style={{ borderTop: "1px solid var(--ns-border)" }}
          >
            <Button variant="ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <CaretLeft size={16} />
              上一頁
            </Button>
            <div className="text-body" style={{ color: "var(--ns-fg-muted)" }}>
              第 {page} 頁 / 共 {totalPages} 頁
            </div>
            <Button
              variant="ghost"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一頁
              <CaretRight size={16} />
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "var(--ns-muted)" }}>
          <Link to="/transactions">查看交易明細</Link>
        </div>
      </Card>
      <HoldingEditModal
        editingAsset={editingAsset}
        onClose={() => setEditingAsset(null)}
        accounts={accounts}
      />
    </>
  );
}

/**
 * Row expansion panel (plan 165) — the detail pushed down off the slim 5-column
 * table: a mini price sparkline plus 股數/均價/成本基礎/券商/今日影響/股利 YTD/持倉天數,
 * and the row's actions (編輯/新增交易/查看詳情). Purely a read-out of data the
 * page already loaded — no new queries, no valuation changes.
 */
function HoldingExpansion({
  position,
  accountName,
  dailyPrices,
  todayImpactLabel,
  dividendsYtd,
  holdingDays,
  onEdit,
  editLabel,
  onAddTransaction,
  onViewDetail,
}: {
  position: HoldingPosition;
  accountName: string;
  dailyPrices: DailyPriceSeriesRow[];
  todayImpactLabel: string;
  dividendsYtd: number;
  holdingDays: number | null;
  onEdit?: () => void;
  editLabel: string;
  onAddTransaction?: () => void;
  onViewDetail: () => void;
}) {
  const sparkline = useMemo(() => {
    const upperTicker = position.ticker.toUpperCase();
    return dailyPrices
      .filter((p) => p.ticker.toUpperCase() === upperTicker)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((p) => ({ date: p.date, close: p.close }));
  }, [dailyPrices, position.ticker]);
  const gradientId = `ns-holdings-spark-${position.assetId}-${position.accountId ?? "none"}`;

  return (
    <div className="ns-holdings-expansion ns-expand-in">
      <div className="ns-holdings-expansion-body">
        <div className="min-w-0">
          <div className="ns-holdings-expansion-spark">
            {sparkline.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkline}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke="var(--ns-accent)"
                    fill={`url(#${gradientId})`}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div
                className="flex h-full items-center justify-center text-xs"
                style={{ color: "var(--ns-muted)" }}
              >
                尚無足夠股價歷史
              </div>
            )}
          </div>
          {sparkline.length > 1 ? (
            <div className="mono mt-1" style={{ fontSize: 10, color: "var(--ns-fg-dim)" }}>
              近 3 個月 · {position.marketPrice !== null ? formatPrice(position.marketPrice) : "—"}{" "}
              {position.currency}
            </div>
          ) : null}
        </div>
        <div className="ns-holdings-expansion-grid">
          <ExpansionStat label="股數" value={formatQuantity(position.quantity)} />
          <ExpansionStat label="均價" value={formatPrice(position.averageCost)} />
          <ExpansionStat
            label="成本基礎"
            value={`${formatCompactNumber(position.costBasis)} ${position.currency}`}
          />
          <ExpansionStat label="券商" value={accountName} />
          <ExpansionStat label="今日影響" value={todayImpactLabel} />
          <ExpansionStat
            label="股利 YTD"
            value={
              dividendsYtd > 0 ? `${formatCompactNumber(dividendsYtd)} ${position.currency}` : "—"
            }
          />
          <ExpansionStat
            label="持倉天數"
            value={holdingDays !== null ? `${formatNumber(holdingDays)} 天` : "—"}
          />
        </div>
        <div className="ns-holdings-expansion-actions">
          {onAddTransaction ? (
            <Button size="sm" onClick={onAddTransaction}>
              <Plus size={14} weight="bold" />
              新增交易
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onViewDetail}>
            查看詳情
            <CaretRight />
          </Button>
          {onEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <PencilSimple size={14} />
              {editLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExpansionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
        {label}
      </div>
      <div className="num text-sm font-medium truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
}: {
  label: string;
  sortKey: HoldingsSortKey;
  sort: HoldingsSortState;
  onToggle: (key: HoldingsSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const icon = active ? (
    sort.direction === "asc" ? (
      <ArrowUp size={14} weight="bold" />
    ) : (
      <ArrowDown size={14} weight="bold" />
    )
  ) : (
    <ArrowsDownUp size={14} weight="bold" />
  );
  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 select-none text-xs uppercase tracking-wide outline-none transition hover:opacity-80"
        style={{ color: active ? "var(--ns-accent)" : "var(--ns-muted)" }}
      >
        {align === "right" ? <span>{icon}</span> : null}
        <span>{label}</span>
        {align !== "right" ? <span>{icon}</span> : null}
      </button>
    </div>
  );
}

/** Non-sortable grid header cell (plain label, e.g. 今日 / 類型). */
function StaticHeader({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <div
      role="columnheader"
      className={`py-2 text-xs uppercase tracking-wide ${align === "right" ? "text-right" : ""}`}
      style={{ color: "var(--ns-muted)" }}
    >
      {label}
    </div>
  );
}

/**
 * Sort holdings by the chosen column. Tie-breaks fall back to market value
 * (then ticker) so the order is stable even when, e.g., two positions both
 * lack a current market price.
 */
function sortHoldings(
  positions: HoldingPosition[],
  sort: HoldingsSortState,
  accountMap: Map<string, Account>,
  assetsById: Map<string, PortfolioAsset>,
  nameLocale: NameLocalePreference,
  toPrimary: (value: number, currency: string, asOfDate?: string) => number,
): HoldingPosition[] {
  // Compare market value in the base currency so a USD position is never ranked
  // below a TWD one just because its native number is smaller.
  const baseValue = (p: HoldingPosition) => toPrimary(p.marketValue ?? 0, p.currency);
  const multiplier = sort.direction === "asc" ? 1 : -1;
  const comparator = (a: HoldingPosition, b: HoldingPosition) => {
    const primary = comparePositions(a, b, sort.key, accountMap, assetsById, nameLocale, baseValue);
    if (primary !== 0) return primary * multiplier;
    // Stable secondary key: bigger market value first, then ticker A→Z.
    const byValue = baseValue(b) - baseValue(a);
    if (byValue !== 0) return byValue;
    return a.ticker.localeCompare(b.ticker);
  };
  return [...positions].sort(comparator);
}

function comparePositions(
  a: HoldingPosition,
  b: HoldingPosition,
  key: HoldingsSortKey,
  accountMap: Map<string, Account>,
  assetsById: Map<string, PortfolioAsset>,
  nameLocale: NameLocalePreference,
  baseValue: (p: HoldingPosition) => number,
): number {
  switch (key) {
    case "ticker":
      return a.ticker.localeCompare(b.ticker);
    case "name": {
      const an = assetsById.get(a.assetId)
        ? resolveAssetName(assetsById.get(a.assetId)!, nameLocale)
        : a.name;
      const bn = assetsById.get(b.assetId)
        ? resolveAssetName(assetsById.get(b.assetId)!, nameLocale)
        : b.name;
      // Chinese collation via Intl so 台積 sorts predictably alongside ASCII.
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    }
    case "account": {
      const an = a.accountId ? (accountMap.get(a.accountId)?.name ?? "") : "";
      const bn = b.accountId ? (accountMap.get(b.accountId)?.name ?? "") : "";
      // Push "未指定" (empty account name) to the end no matter the direction —
      // that's almost always less useful to surface.
      if (an === "" && bn !== "") return 1;
      if (bn === "" && an !== "") return -1;
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    }
    case "quantity":
      return a.quantity - b.quantity;
    case "averageCost":
      return a.averageCost - b.averageCost;
    case "marketPrice":
      // Null prices fall to the end regardless of direction.
      if (a.marketPrice === null && b.marketPrice === null) return 0;
      if (a.marketPrice === null) return 1;
      if (b.marketPrice === null) return -1;
      return a.marketPrice - b.marketPrice;
    case "marketValue":
      return baseValue(a) - baseValue(b);
    case "unrealizedGain":
      return a.unrealizedGain - b.unrealizedGain;
    case "unrealizedGainPercent":
      return a.unrealizedGainPercent - b.unrealizedGainPercent;
  }
}

function SummaryCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const color =
    tone === "positive"
      ? "var(--ns-gain)"
      : tone === "negative"
        ? "var(--ns-loss)"
        : "var(--ns-fg)";
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>
        {label}
      </div>
      <div className="mt-1 tabular text-base font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

const performanceRangeOptions = ["1D", "1W", "1M", "1Y", "3Y", "Custom"] as const;
type PerformanceRange = (typeof performanceRangeOptions)[number];

function buildPerformanceTrend({
  positions,
  assets,
  records,
  dailyPrices,
  manualPriceSnapshots,
  toPrimary,
  range,
  customStart,
  customEnd,
  quoteMap,
}: {
  positions: HoldingPosition[];
  assets: PortfolioAsset[];
  records: InvestmentRecord[];
  dailyPrices: DailyPriceSeriesRow[];
  manualPriceSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  range: PerformanceRange;
  customStart: string;
  customEnd: string;
  quoteMap: Record<string, DomainMarketQuote | undefined>;
}) {
  const end = range === "Custom" ? customEnd : todayDate();
  const start = range === "Custom" ? customStart : rangeStartDate(range, end);
  if (!start || !end || start > end) return [];

  // Build acquisition-date map: earliest date this position should appear in the chart.
  // Manual assets: use acquisitionDate field.
  // Transaction-based: use date of earliest buy record for that asset.
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const earliestBuyByAsset = new Map<string, string>();
  for (const record of records) {
    if (record.action !== "buy" || record.deletedAt !== null) continue;
    const current = earliestBuyByAsset.get(record.assetId);
    if (!current || record.date < current) earliestBuyByAsset.set(record.assetId, record.date);
  }
  function acquisitionDateFor(position: HoldingPosition): string | null {
    const asset = assetById.get(position.assetId);
    if (!asset) return null;
    if (asset.holdingSource === "manual") return asset.acquisitionDate ?? null;
    return earliestBuyByAsset.get(position.assetId) ?? null;
  }

  // Build manual-snapshot lookup: assetId → sorted snapshots
  const manualSnapshotsByAsset = new Map<string, ManualPriceSnapshot[]>();
  for (const snap of manualPriceSnapshots) {
    const bucket = manualSnapshotsByAsset.get(snap.assetId) ?? [];
    bucket.push(snap);
    manualSnapshotsByAsset.set(snap.assetId, bucket);
  }
  for (const [assetId, snaps] of manualSnapshotsByAsset) {
    manualSnapshotsByAsset.set(
      assetId,
      snaps.sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  // Identify which positions are manual (price from snapshots) vs tracked (price from daily_prices).
  const manualAssetIds = new Set(
    assets.filter((a) => a.holdingSource === "manual").map((a) => a.id),
  );

  // Collect price history for tracked (Yahoo) positions.
  const trackedTickers = new Set(
    positions.filter((p) => !manualAssetIds.has(p.assetId)).map((p) => p.ticker.toUpperCase()),
  );
  const pricesByTicker = new Map<string, DailyPriceSeriesRow[]>();
  for (const price of dailyPrices) {
    const ticker = price.ticker.toUpperCase();
    if (!trackedTickers.has(ticker)) continue;
    if (price.date < start || price.date > end) continue;
    const bucket = pricesByTicker.get(ticker) ?? [];
    bucket.push(price);
    pricesByTicker.set(ticker, bucket);
  }
  for (const [ticker, rows] of pricesByTicker) {
    pricesByTicker.set(
      ticker,
      rows.sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  // Collect dates from both sources, plus today from live quotes when available.
  const trackedDates = [...pricesByTicker.values()].flat().map((p) => p.date);
  const manualDates = [...manualSnapshotsByAsset.values()]
    .flat()
    .filter((s) => s.date >= start && s.date <= end)
    .map((s) => s.date);
  const today = todayDate();
  const hasLiveQuotes = positions.some((p) => quoteMap[p.ticker.toUpperCase()]);
  const quoteDates = hasLiveQuotes && today >= start && today <= end ? [today] : [];
  const dates = [...new Set([...trackedDates, ...manualDates, ...quoteDates])].sort();

  return dates
    .map((date) => {
      const value = positions.reduce((sum, position) => {
        const acqDate = acquisitionDateFor(position);
        if (acqDate && date < acqDate) return sum;

        if (manualAssetIds.has(position.assetId)) {
          const snaps = manualSnapshotsByAsset.get(position.assetId) ?? [];
          const snap = latestSnapshotOnOrBefore(snaps, date);
          if (snap) return sum + toPrimary(snap.price * position.quantity, position.currency, date);
          // For today with no manual snapshot, fall back to live quote.
          if (date === today) {
            const quote = quoteMap[position.ticker.toUpperCase()];
            if (quote)
              return (
                sum +
                toPrimary(
                  quote.price * position.quantity,
                  quote.currency || position.currency,
                  date,
                )
              );
          }
          return sum;
        }

        const history = pricesByTicker.get(position.ticker.toUpperCase()) ?? [];
        const price = latestPriceOnOrBefore(history, date);
        // For today's date, fall back to live quote if no daily close exists yet.
        if (!price) {
          if (date === today) {
            const quote = quoteMap[position.ticker.toUpperCase()];
            if (quote)
              return (
                sum +
                toPrimary(
                  quote.price * position.quantity,
                  quote.currency || position.currency,
                  date,
                )
              );
          }
          return sum;
        }
        return (
          sum +
          toPrimary(price.close * position.quantity, price.currency || position.currency, date)
        );
      }, 0);
      return {
        date,
        label: compactDateLabel(date, range),
        value,
      };
    })
    .filter((point) => point.value > 0);
}

function latestSnapshotOnOrBefore(rows: ManualPriceSnapshot[], date: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= date) return rows[index];
  }
  return null;
}

function latestPriceOnOrBefore(rows: DailyPriceSeriesRow[], date: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= date) return rows[index];
  }
  return null;
}

function rangeStartDate(range: PerformanceRange, end: string) {
  if (range === "Custom") return end;
  const days: Record<Exclude<PerformanceRange, "Custom">, number> = {
    "1D": 1,
    "1W": 7,
    "1M": 31,
    "1Y": 365,
    "3Y": 365 * 3,
  };
  return dateDaysAgo(days[range], end);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days: number, from = todayDate()) {
  const date = new Date(`${from}T00:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function compactDateLabel(value: string, range: PerformanceRange) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "1D" || range === "1W" || range === "1M") {
    return date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
  }
  return date.toLocaleDateString("zh-TW", { year: "2-digit", month: "numeric" });
}
