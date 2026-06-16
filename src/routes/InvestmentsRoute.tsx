import { ArrowDown, ArrowsClockwise, ArrowsDownUp, ArrowUp, Bank, ChartLineUp, ListChecks, PencilSimple, PlusCircle, Sliders, X, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { AccountFilter } from "../components/AccountFilter";
import { AssetLogo } from "../components/AssetLogo";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Button } from "../components/coss/button";
import { Card as CossCard } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import { EmptyState } from "../components/EmptyState";
import { Field, TextInput } from "../components/Field";
import { HoldingForm } from "../components/HoldingForm";
import { SegmentedControl } from "../components/SegmentedControl";
import { StatusText } from "../components/StatusText";
import { useToast } from "../components/Toast";
import { useFinanceData, useRepositoryMutation } from "../data/hooks";
import type { PortfolioAssetDraft } from "../data/repositories";
import {
  buildHoldingPositionsByAccount,
  createFxConverter,
  formatMoney,
  formatNumber,
  formatCompactNumber,
  formatPrice,
  formatQuantity,
  resolveAssetName,
  resolveSectorLabel,
  todayInTimezone,
  assetTypeLabels,
  type AnalyticsPosition,
  type Account,
  type DailyPrice,
  type HoldingPosition,
  type InvestmentRecord,
  type ManualPriceSnapshot,
  type MarketQuote as DomainMarketQuote,
  type PortfolioAsset,
} from "../domain";
import { useBackfillAssetProfiles, useRefreshDailyPrices, useRefreshQuotes, DEMO_MARKET_MESSAGE } from "../features/market-data/useMarketRefresh";
import { useDemoMode } from "../state/demoMode";
import { useUiPreferences, type NameLocalePreference, type HoldingsColumnKey } from "../state/uiPreferences";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";
import { InvestmentsAnalyticsTab } from "./InvestmentsAnalyticsTab";
import { RecurringInvestmentsTab } from "./RecurringInvestmentsTab";
import { TransactionsRoute } from "./TransactionsRoute";
import { quoteLookupKeys } from "../domain/marketSymbols";

export function InvestmentsRoute() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/investments" });
  const searchTab = search.tab as "portfolio" | "transactions" | "recurring" | "analytics" | undefined;
  const searchSector = search.sector as string | undefined;

  const [tab, setTabState] = useState<"portfolio" | "transactions" | "recurring" | "analytics">(
    searchTab && ["portfolio", "transactions", "recurring", "analytics"].includes(searchTab)
      ? searchTab
      : "portfolio",
  );

  function setTab(next: "portfolio" | "transactions" | "recurring" | "analytics") {
    setTabState(next);
    void navigate({ to: "/investments", search: (prev) => ({ ...prev, tab: next, sector: next === "portfolio" ? prev.sector : undefined }) });
  }

  const { accounts, assets, investments, quotes, settings, dailyFxRates, dailyPrices, manualPriceSnapshots, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const backfillAssetProfiles = useBackfillAssetProfiles();
  // "auto" follows the app UI language, which is Chinese-first (see i18n.ts:
  // auto → zh-TW). Resolve it to zh-Hant so holdings show Chinese names rather
  // than whatever the OS/browser locale happens to be.
  const nameLocale = useUiPreferences((state) => (state.nameLocale === "auto" ? "zh-Hant" : state.nameLocale));
  const benchmarkTicker = useUiPreferences((state) => state.benchmarkTicker);
  const toast = useToast();

  const accountRows = accounts.data ?? [];
  const assetRows = assets.data ?? [];
  const recordRows = investments.data ?? [];
  const quoteRows = quotes.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const manualSnapshotRows = manualPriceSnapshots.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);

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

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const investmentAccounts = useMemo(
    () => accountRows.filter((account) => account.type === "investment"),
    [accountRows],
  );

  const timezoneForDue = useUiPreferences((state) => state.timezone);

  // Shared valuation context so market value here matches the Dashboard / net
  // worth trend: live quote → latest daily close → average cost.
  const valuationToday = todayInTimezone(timezoneForDue);

  const positions = useMemo(
    () => buildHoldingPositionsByAccount(assetRows, recordRows, quoteMap, { dailyPrices: dailyPriceRows, asOf: valuationToday }),
    [assetRows, recordRows, quoteMap, dailyPriceRows, valuationToday],
  );

  // Current holdings in the shape the analytics engine consumes (fixed-basket).
  const analyticsPositions = useMemo<AnalyticsPosition[]>(
    () => assetRows
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
      })),
    [assetRows],
  );

  const allAssetMeta = useMemo(
    () => new Map(assetRows.map((a) => [a.id, { ticker: a.ticker, currency: a.currency }])),
    [assetRows],
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

  async function refreshLatestQuotes() {
    setStatusMessage("");
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: DEMO_MARKET_MESSAGE });
      setStatusMessage(DEMO_MARKET_MESSAGE);
      return;
    }
    const tickers = [...new Set(assetRows.map((asset) => asset.ticker.toUpperCase()).filter(Boolean))];
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
    const tickers = [...new Set(assetRows.filter((a) => a.ticker.trim() && !a.deletedAt).map((a) => a.ticker.trim().toUpperCase()))];
    if (tickers.length === 0) {
      toast.info("尚無持倉可回補");
      return;
    }
    const progressId = toast.info("回補歷史股價中", { description: `${tickers.length} 檔標的，${range} 資料`, durationMs: 0 });
    try {
      const result = await refreshDailyPrices.mutateAsync({ tickers, range });
      toast.dismiss(progressId);
      if (result.failed.length) {
        toast.warning("部分股價未取得", { description: `已儲存 ${result.saved} 筆。`, detail: result.failed.join("\n") });
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
      if (!asset.assetType) return true;
      return asset.assetType === "equity" && (!asset.sector || !asset.industry);
    });
    if (candidates.length === 0) {
      toast.info("沒有需要回補的持倉", { description: "所有持倉都已有類型與產業分類；個別調整可用持倉列的「編輯持倉」。" });
      setStatusMessage("所有持倉都已有類型與產業分類。");
      return;
    }
    // Two-click confirm — window.confirm is a no-op in the Tauri webview.
    if (!backfillArmed) {
      setBackfillArmed(true);
      toast.info(`將回補 ${candidates.length} 筆持倉分類`, {
        description: "資料來源：台股用證交所公司資料、其餘用 Yahoo Finance。再按一次「回補分類」確認執行。",
      });
      return;
    }
    setBackfillArmed(false);

    const progressId = toast.info("回補分類中", { description: `0 / ${candidates.length}`, durationMs: 0 });
    try {
      const result = await backfillAssetProfiles.mutateAsync({
        onProgress: (done, total) => {
          setStatusMessage(`回補分類中 ${done} / ${total}…`);
        },
      });
      toast.dismiss(progressId);
      if (result.failed.length) {
        toast.warning("部分分類未取得", { description: `已更新 ${result.updated} / ${result.total} 筆。`, detail: result.failed.join("\n") });
        setStatusMessage(`已回補 ${result.updated} / ${result.total} 筆分類，部分 ticker 需要手動填入。`);
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

  const totalValue = positions.reduce((sum, position) => sum + toPrimary(position.marketValue, position.currency), 0);
  const totalCost = positions.reduce((sum, position) => sum + toPrimary(position.costBasis, position.currency), 0);
  const totalPnL = totalValue - totalCost;
  const returnPct = totalCost === 0 ? 0 : (totalPnL / totalCost) * 100;

  const { realizedYTD, dividendsYTD } = useMemo(() => {
    const currentYearStr = new Date().getFullYear().toString();
    let rYTD = 0;
    let dYTD = 0;

    const buckets = new Map<string, { quantity: number; cost: number }>();
    const sortedRecords = [...recordRows].sort((a, b) => a.date.localeCompare(b.date));

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
  }, [recordRows, assetRows, toPrimary]);

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1" style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
        <Skeleton className="h-[200px]" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
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
          <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
            無法載入資料
          </h3>
          <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
          <Button className="mt-4" onClick={() => refetchAll()}>
            重新整理
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ns-invest-page" style={{ padding: '24px 32px 120px', maxWidth: 1180, margin: '0 auto' }}>
      {/* Header */}
      <div className="ns-invest-header" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 0 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>投資組合</div>
          <h1 className="text-[28px]" style={{ fontFamily: 'var(--ns-font-display)', margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>投資</h1>
        </div>
        <div className="ns-invest-header-actions" style={{ display: 'flex', gap: 8 }}>
          {/* Entry point restored — it was lost in the holdings→portfolio tab
              rename, leaving backfillClassifications unreachable. */}
          {tab === "portfolio" ? (
            <Button variant="outline" onClick={backfillClassifications} loading={backfillAssetProfiles.isPending}
              style={backfillArmed ? { borderColor: "var(--ns-warn)", color: "var(--ns-warn)" } : undefined}>
              <ArrowsClockwise size={14} />{backfillAssetProfiles.isPending ? "回補中" : backfillArmed ? "再按一次確認" : "回補分類"}
            </Button>
          ) : null}
          <Button variant="outline" onClick={refreshLatestQuotes} loading={refreshQuotes.isPending}>
            <ArrowsClockwise size={14} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <PlusCircle size={14} weight="bold" />新增交易
          </Button>
        </div>
      </div>

      {statusMessage ? <div className="mt-4"><StatusText>{statusMessage}</StatusText></div> : null}

      {/* Page-level tabs: 持倉 | 交易紀錄 | 分析.
          定期定額 (recurring DCA) is hidden until the workflow is finalised; the
          tab + dashboard reminder are removed while the underlying data and
          RecurringInvestmentsTab component stay intact for re-enabling later. */}
      <div className="ns-page-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--ns-border)', marginTop: 20, marginBottom: 22 }}>
        {[
          { id: 'portfolio', label: '持倉', active: tab === 'portfolio' },
          { id: 'transactions', label: '交易紀錄', active: tab === 'transactions' },
          { id: 'analytics', label: '分析', active: tab === 'analytics' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} className="text-sm" style={{
            padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: t.active ? 600 : 400,
            color: t.active ? 'var(--ns-fg)' : 'var(--ns-fg-muted)',
            borderBottom: t.active ? '2px solid var(--ns-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.12s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "portfolio" ? (
        <>
          {/* Top KPIs */}
          {/* 6 KPI tiles only split into 6 columns at 2xl (≥1536px); at 13"
              (~1280px) stay at 3 columns so compact values like "NT$2.43萬"
              never clip. */}
          <div className="ns-holdings-kpis ns-invest-kpi-grid mb-5">
            {([
              // [label, compact display, exact value (tooltip), pct, positive]
              ['目前市值', `NT$${formatCompactNumber(totalValue)}`, `NT$${formatNumber(totalValue)}`, '', true],
              ['未實現損益', `NT$${formatCompactNumber(Math.abs(totalPnL))}`, `NT$${formatNumber(Math.abs(totalPnL))}`, totalPnL >= 0 ? `+${returnPct.toFixed(2)}%` : `${returnPct.toFixed(2)}%`, totalPnL >= 0],
              ['今年已實現', `NT$${formatCompactNumber(Math.abs(realizedYTD))}`, `NT$${formatNumber(Math.abs(realizedYTD))}`, realizedYTD >= 0 ? '' : '虧損', realizedYTD >= 0],
              ['今年股利', `NT$${formatCompactNumber(dividendsYTD)}`, `NT$${formatNumber(dividendsYTD)}`, '', true],
            ] as const).map(([label, val, exact, pct, pos], i) => (
              <CossCard key={i} className="p-4 sm:p-5 min-w-0">
                <div className="ns-eyebrow" style={{ marginBottom: 8, flexShrink: 0 }}>{label}</div>
                {/* Value takes the full card width (compact 萬/億 keeps it short);
                    the % change sits on its own line so it never squeezes the
                    number into an ellipsis. */}
                <div className="num" style={{ fontSize: "clamp(14px, 1.7vw, 22px)", fontWeight: 500, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={exact}>{val}</div>
                {pct ? <div className="num text-xs" style={{ marginTop: 2, color: pos ? 'var(--ns-gain)' : 'var(--ns-loss)' }}>{pct}</div> : null}
              </CossCard>
            ))}
          </div>

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
            initialSector={searchSector ?? "all"}
            onSectorChange={(sector) => {
              void navigate({ to: "/investments", search: (prev) => ({ ...prev, tab: "portfolio", sector: sector === "all" ? undefined : sector }) });
            }}
          />
        </>
      ) : null}

      {tab === "transactions" ? <TransactionsRoute /> : null}

      {tab === "recurring" ? <RecurringInvestmentsTab /> : null}

      {tab === "analytics" ? (
        <InvestmentsAnalyticsTab
          positions={analyticsPositions}
          records={recordRows}
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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(() => accounts[0]?.id ?? null);
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

  const selected = aggregates.find((entry) => entry.account.id === selectedAccountId) ?? aggregates[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <AccountList aggregates={aggregates} selectedId={selected.account.id} onSelect={setSelectedAccountId} primaryCurrency={primaryCurrency} />
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
    <div className="rounded-lg border lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
      <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ns-muted)", borderColor: "var(--ns-border)" }}>
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
              <div className="grid size-9 shrink-0 place-items-center rounded-md" style={{ background: active ? "var(--ns-accent)" : "var(--ns-surface-strong)", color: active ? "white" : "var(--ns-muted)" }}>
                <Bank size={18} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{aggregate.account.name}</div>
                <div className="mt-0.5 text-xs" style={{ color: active ? "var(--ns-accent)" : "var(--ns-muted)" }}>
                  {aggregate.positions.length} 檔 · {aggregate.account.currency}
                </div>
              </div>
              <div className="text-right tabular">
                <div className="text-sm font-semibold">{formatMoney(aggregate.marketValue, primaryCurrency)}</div>
                <div className="text-[11px]" style={{ color: pnlColor }}>
                  {aggregate.pnl >= 0 ? "+" : ""}{aggregate.returnPercent.toFixed(2)}%
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
            <div className="text-xs" style={{ color: pnl >= 0 ? "var(--ns-gain)" : "var(--ns-loss)" }}>
              損益 {pnl >= 0 ? "+" : ""}{formatNumber(pnl)} {primaryCurrency}（{pnl >= 0 ? "+" : ""}{returnPercent.toFixed(2)}%）
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryCell label="持倉檔數" value={`${positions.length}`} />
          <SummaryCell label="成本" value={formatMoney(costBasis, primaryCurrency)} />
          <SummaryCell label="未實現損益" value={`${pnl >= 0 ? "+" : ""}${formatNumber(pnl)} ${primaryCurrency}`} tone={pnl >= 0 ? "positive" : "negative"} />
        </div>
      </Card>

      {sortedPositions.length === 0 ? (
        <Card title="持倉">
          <p className="text-sm" style={{ color: "var(--ns-muted)" }}>此帳戶尚無持倉。</p>
        </Card>
      ) : (
        <AllocationCard positions={sortedPositions} totalForAllocation={totalForAllocation} toPrimary={toPrimary} />
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
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
                <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--ns-accent)" }} />
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
  dailyPrices: DailyPrice[];
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
  const totalValue = positions.reduce((sum, position) => sum + toPrimary(position.marketValue, position.currency), 0);
  const totalCost = positions.reduce((sum, position) => sum + toPrimary(position.costBasis, position.currency), 0);
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
              options={performanceRangeOptions.map((option) => ({ value: option, label: option, icon: null }))}
            />
          </div>
        }
      >
        {range === "Custom" ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label="開始">
              <TextInput type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            </Field>
            <Field label="結束">
              <TextInput type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
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
                <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#portfolioPerformance)" strokeWidth={2} />
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
            .sort((a, b) => toPrimary(b.marketValue, b.currency) - toPrimary(a.marketValue, a.currency))
            .slice(0, 8)
            .map((position) => {
              const valueInBase = toPrimary(position.marketValue, position.currency);
              const ratio = totalValue === 0 ? 0 : valueInBase / totalValue;
              return (
                <div key={`${position.assetId}-${position.accountId ?? "none"}`} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{position.ticker}</span>
                    <span className="tabular">{(ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
                    <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--ns-accent)" }} />
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
  "var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)",
  "var(--ns-chart-4)", "var(--ns-chart-5)", "#2dd4bf", "#fb923c",
];

/** Portfolio composition donut (by holding, valued in base currency). */
function HoldingsAllocation({ positions, assetsById, nameLocale, toPrimary, primaryCurrency }: {
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

  return (
    <CossCard className="ns-holdings-allocation" style={{ padding: 20, marginBottom: 20 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 14 }}>持倉配置</div>
      <div className="ns-holdings-allocation-body">
        <div className="ns-holdings-allocation-chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={2} stroke="none">
                {data.map((_, i) => <Cell key={i} fill={ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(value) => formatMoney(Number(value), primaryCurrency)}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)", fontSize: 12 }}
                itemStyle={{ color: "var(--ns-fg)" }}
                labelStyle={{ color: "var(--ns-fg)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="ns-holdings-allocation-list">
          {data.map((d, i) => (
            <div key={i} className="text-xs" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.name}>{d.name}</span>
              <span className="mono dim" style={{ flexShrink: 0 }}>{d.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </CossCard>
  );
}

// Optional, user-toggleable holdings columns (B21). Ticker / 名稱 / 股數 / 市值 /
// 損益 / 報酬率 / 操作 are always shown.
const HOLDINGS_COLUMN_OPTIONS: { key: HoldingsColumnKey; label: string }[] = [
  { key: "account", label: "券商" },
  { key: "averageCost", label: "均價" },
  { key: "marketPrice", label: "現價" },
  { key: "assetType", label: "類型" },
  { key: "costBasis", label: "成本基礎" },
];

function HoldingsTab({
  positions,
  accountMap,
  accounts,
  nameLocale,
  assetsById,
  manualPriceSnapshots,
  toPrimary,
  initialSector,
  onSectorChange,
}: {
  positions: HoldingPosition[];
  accountMap: Map<string, Account>;
  accounts: Account[];
  nameLocale: NameLocalePreference;
  assetsById: Map<string, PortfolioAsset>;
  manualPriceSnapshots: ManualPriceSnapshot[];
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  initialSector?: string;
  onSectorChange?: (sector: string) => void;
}) {
  const navigate = useNavigate();
  const timezone = useUiPreferences((state) => state.timezone);
  const holdingsColumns = useUiPreferences((state) => state.holdingsColumns);
  const setHoldingsColumns = useUiPreferences((state) => state.setHoldingsColumns);
  const visibleCol = (key: HoldingsColumnKey) => holdingsColumns.includes(key);
  const toggleCol = (key: HoldingsColumnKey) =>
    setHoldingsColumns(holdingsColumns.includes(key) ? holdingsColumns.filter((k) => k !== key) : [...holdingsColumns, key]);
  const [editingAsset, setEditingAsset] = useState<PortfolioAsset | null>(null);
  const [editForm, setEditForm] = useState<PortfolioAssetDraft | null>(null);
  const [message, setMessage] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(() => todayDate());
  const [snapshotPrice, setSnapshotPrice] = useState(0);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshotMessage, setSnapshotMessage] = useState("");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterSector, setFilterSectorState] = useState<string>(initialSector ?? "all");

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

  useEffect(() => setPage(1), [filterAccount, filterSector]);

  // Default to descending market value — matches user expectation that the
  // biggest positions sit at the top until they explicitly sort otherwise.
  const [sort, setSort] = useState<HoldingsSortState>({ key: "marketValue", direction: "desc" });
  const updateHolding = useRepositoryMutation(
    (repository, input: PortfolioAssetDraft & { id: string }) => repository.updateManualHolding(input.id, input),
    ["assets"],
  );
  const updateClassification = useRepositoryMutation(
    (repository, input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry"> & { id: string }) => repository.updateAssetClassification(input.id, input),
    ["assets"],
  );
  const createSnapshot = useRepositoryMutation(
    (repository, input: { assetId: string; date: string; price: number; note: string }) =>
      repository.createManualPriceSnapshot(input),
    ["manualPriceSnapshots"],
  );
  const deleteSnapshot = useRepositoryMutation(
    (repository, id: string) => repository.deleteManualPriceSnapshot(id),
    ["manualPriceSnapshots"],
  );

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
    setEditForm({
      ticker: asset.ticker,
      name: asset.name,
      currency: asset.currency,
      totalQuantity: asset.totalQuantity,
      averageCost: asset.averageCost,
      acquisitionDate: asset.acquisitionDate ?? todayInTimezone(timezone),
      accountId: asset.accountId,
      assetType: asset.assetType,
      sector: asset.sector,
      industry: asset.industry,
    });
    setMessage("");
    setSnapshotDate(todayDate());
    setSnapshotPrice(0);
    setSnapshotNote("");
    setSnapshotMessage("");
  }

  async function submitSnapshot() {
    if (!editingAsset) return;
    setSnapshotMessage("");
    if (!snapshotDate) { setSnapshotMessage("請選擇日期。"); return; }
    if (snapshotPrice <= 0) { setSnapshotMessage("請輸入有效的價格。"); return; }
    try {
      await createSnapshot.mutateAsync({ assetId: editingAsset.id, date: snapshotDate, price: snapshotPrice, note: snapshotNote });
      setSnapshotDate(todayDate());
      setSnapshotPrice(0);
      setSnapshotNote("");
    } catch (error) {
      setSnapshotMessage(error instanceof Error ? error.message : "快照儲存失敗。");
    }
  }

  async function submitEdit() {
    if (!editingAsset || !editForm) return;
    setMessage("");
    try {
      if (editingAsset.holdingSource !== "manual") {
        await updateClassification.mutateAsync({ id: editingAsset.id, ...editForm });
        setEditingAsset(null);
        setEditForm(null);
        return;
      }
      if (!editForm.accountId) throw new Error("請選擇券商 / 帳戶。");
      await updateHolding.mutateAsync({ ...editForm, id: editingAsset.id });
      setEditingAsset(null);
      setEditForm(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "持倉儲存失敗。");
    }
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

  const filteredPositions = positions.filter((p) => {
    if (filterAccount !== "all" && p.accountId !== filterAccount) return false;
    if (filterSector !== "all") {
      const raw = assetsById.get(p.assetId)?.sector;
      const label = resolveSectorLabel(raw, nameLocale) ?? "未知";
      if (label !== filterSector) return false;
    }
    return true;
  });
  const sorted = sortHoldings(filteredPositions, sort, accountMap, assetsById, nameLocale, toPrimary);
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
  const filterControlStyle: React.CSSProperties = {
    height: 38,
    minHeight: 38,
    fontSize: 13,
    lineHeight: 1.2,
  };

  return (
    <>
      <Card>
        <div className="mb-4" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
              flex: "0 1 520px",
              maxWidth: "100%",
            }}
          >
            <div style={{ flex: "1 1 180px", minWidth: 148, maxWidth: 220 }}>
              <AccountFilter
                accounts={accounts}
                value={filterAccount}
                onChange={setFilterAccount}
                allLabel="所有券商"
                placeholder="選擇券商"
                mutedAllLabel={false}
                style={{ ...filterControlStyle, width: "100%", minWidth: 0, maxWidth: "none", padding: "0 12px" }}
              />
            </div>
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
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
                <Sliders size={14} />欄位
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44">
                <div className="mb-1 px-1 text-xs" style={{ color: "var(--ns-muted)" }}>顯示欄位</div>
                <div className="max-h-64 overflow-y-auto">
                  {HOLDINGS_COLUMN_OPTIONS.map((opt) => (
                    <label key={opt.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                      <input type="checkbox" checked={visibleCol(opt.key)} onChange={() => toggleCol(opt.key)} />
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
                onClick={() => navigate({ to: '/holdings/$ticker', params: { ticker: position.ticker } })}
                className="flex items-center gap-3 rounded-xl border p-3 text-left outline-none transition active:opacity-90"
                style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}
              >
                <AssetLogo ticker={position.ticker} name={position.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold whitespace-nowrap">{position.ticker}</span>
                    <span className="truncate text-xs" style={{ color: "var(--ns-muted)" }}>{displayName}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs tabular" style={{ color: "var(--ns-muted)" }}>
                    {formatQuantity(position.quantity)} 股 · {account ? account.name : "未指定"}
                  </div>
                </div>
                <div className="text-right tabular">
                  <div className="font-semibold whitespace-nowrap">
                    {formatCompactNumber(position.marketValue)} <span className="text-xs" style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
                  </div>
                  <div className="mt-0.5 whitespace-nowrap text-xs" style={{ color: pnlColor }}>
                    {pnlUp ? "+" : ""}{formatCompactNumber(position.unrealizedGain)} · {pnlUp ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-auto text-sm [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
                <SortableHeader label="代號" sortKey="ticker" sort={sort} onToggle={toggleSort} />
                <SortableHeader label="名稱" sortKey="name" sort={sort} onToggle={toggleSort} />
                {visibleCol("account") ? <SortableHeader label="券商" sortKey="account" sort={sort} onToggle={toggleSort} /> : null}
                <SortableHeader label="股數" sortKey="quantity" sort={sort} onToggle={toggleSort} align="right" />
                {visibleCol("averageCost") ? (
                  <th className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("averageCost")}
                      className="inline-flex items-center gap-1 select-none text-xs uppercase tracking-wide outline-none transition hover:opacity-80"
                      style={{ color: sort.key === "averageCost" ? "var(--ns-accent)" : "var(--ns-muted)" }}
                    >
                      <span>均價</span>
                      {sort.key === "averageCost"
                        ? (sort.direction === "asc" ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />)
                        : <ArrowsDownUp size={11} weight="bold" />}
                    </button>
                  </th>
                ) : null}
                {visibleCol("marketPrice") ? (
                  <th className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort("marketPrice")}
                      className="inline-flex items-center gap-1 select-none text-xs uppercase tracking-wide outline-none transition hover:opacity-80"
                      style={{ color: sort.key === "marketPrice" ? "var(--ns-accent)" : "var(--ns-muted)" }}
                    >
                      <span>現價</span>
                      {sort.key === "marketPrice"
                        ? (sort.direction === "asc" ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />)
                        : <ArrowsDownUp size={11} weight="bold" />}
                    </button>
                  </th>
                ) : null}
                {visibleCol("assetType") ? <th className="py-2 text-left">類型</th> : null}
                {visibleCol("costBasis") ? <th className="py-2 text-right">成本基礎</th> : null}
                <SortableHeader label="市值" sortKey="marketValue" sort={sort} onToggle={toggleSort} align="right" />
                <SortableHeader label="損益" sortKey="unrealizedGain" sort={sort} onToggle={toggleSort} align="right" />
                <SortableHeader label="報酬率" sortKey="unrealizedGainPercent" sort={sort} onToggle={toggleSort} align="right" />
                <th className="py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((position) => {
                const account = position.accountId ? accountMap.get(position.accountId) : null;
                const asset = assetsById.get(position.assetId) ?? null;
                const displayName = asset
                  ? resolveAssetName(asset, nameLocale)
                  : position.name;
                const pnlTone = position.unrealizedGain >= 0 ? "positive" : "negative";
                return (
                  <tr 
                    key={`${position.assetId}-${position.accountId ?? "none"}`} 
                    className="border-t cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" 
                    style={{ borderColor: "var(--ns-border)" }}
                    onClick={() => navigate({ to: '/holdings/$ticker', params: { ticker: position.ticker } })}
                  >
                    <td className="py-3 font-semibold whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <AssetLogo ticker={position.ticker} name={position.name} size={26} />
                        {position.ticker}
                      </span>
                    </td>
                    <td className="max-w-[14rem] py-3" title={displayName}>
                      <span className="block truncate">{displayName}</span>
                    </td>
                    {visibleCol("account") ? (
                      <td className="max-w-[11rem] py-3" title={account ? account.name : "未指定"}>
                        <span className="block truncate">{account ? account.name : "未指定"}</span>
                      </td>
                    ) : null}
                    <td className="py-3 text-right tabular whitespace-nowrap">{formatQuantity(position.quantity)}</td>
                    {visibleCol("averageCost") ? <td className="py-3 text-right tabular whitespace-nowrap">{formatPrice(position.averageCost)}</td> : null}
                    {visibleCol("marketPrice") ? (
                      <td className="py-3 text-right tabular whitespace-nowrap">
                        {position.marketPrice !== null ? formatPrice(position.marketPrice) : "—"}
                      </td>
                    ) : null}
                    {visibleCol("assetType") ? (
                      <td className="py-3 whitespace-nowrap" style={{ color: "var(--ns-muted)" }}>
                        {asset?.assetType ? assetTypeLabels[asset.assetType] : "—"}
                      </td>
                    ) : null}
                    {visibleCol("costBasis") ? (
                      <td className="py-3 text-right tabular whitespace-nowrap" title={`${formatNumber(position.costBasis)} ${position.currency}`}>
                        {formatCompactNumber(position.costBasis)} <span style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
                      </td>
                    ) : null}
                    <td className="py-3 text-right tabular whitespace-nowrap" title={`${formatNumber(position.marketValue)} ${position.currency}`}>
                      {formatCompactNumber(position.marketValue)} <span style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
                    </td>
                    <td
                      className="py-3 text-right tabular whitespace-nowrap"
                      style={{ color: pnlTone === "positive" ? "var(--ns-gain)" : "var(--ns-loss)" }}
                      title={`${position.unrealizedGain >= 0 ? "+" : ""}${formatNumber(position.unrealizedGain)} ${position.currency}`}
                    >
                      {position.unrealizedGain >= 0 ? "+" : ""}{formatCompactNumber(position.unrealizedGain)}
                    </td>
                    <td
                      className="py-3 text-right tabular whitespace-nowrap"
                      style={{ color: pnlTone === "positive" ? "var(--ns-gain)" : "var(--ns-loss)" }}
                    >
                      {position.unrealizedGainPercent >= 0 ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%
                    </td>
                    <td className="py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <ActionButton
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); if (asset) startEdit(asset); }}
                        disabled={!asset}
                        title={asset?.holdingSource === "transactions" ? "編輯分類資料" : "編輯持倉"}
                      >
                        <PencilSimple size={16} />編輯
                      </ActionButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--ns-border)' }}>
            <Button variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <CaretLeft size={16} />上一頁
            </Button>
            <div className="text-body" style={{ color: 'var(--ns-fg-muted)' }}>
              第 {page} 頁 / 共 {totalPages} 頁
            </div>
            <Button variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              下一頁<CaretRight size={16} />
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3 text-xs" style={{ color: "var(--ns-muted)" }}>
          <Link to="/transactions">查看交易明細</Link>
        </div>
      </Card>
      {editingAsset && editForm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEditingAsset(null)}>
          <div
            className="w-full max-w-2xl rounded-lg border shadow-xl"
            style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
              <h2 className="text-lg font-semibold">編輯持倉</h2>
              <button
                type="button"
                onClick={() => setEditingAsset(null)}
                className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
                aria-label="關閉"
              >
                <X size={18} />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-5 pb-5 pt-4">
              <HoldingForm
                value={editForm}
                onChange={setEditForm}
                onSubmit={submitEdit}
                submitLabel={updateHolding.isPending || updateClassification.isPending ? "儲存中…" : editingAsset.holdingSource === "manual" ? "儲存持倉" : "儲存分類"}
                accounts={accounts}
                classificationOnly={editingAsset.holdingSource !== "manual"}
              />
              {message ? <div className="mt-3"><StatusText>{message}</StatusText></div> : null}

              {editingAsset.holdingSource === "manual" ? (
                <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--ns-border)" }}>
                  <h3 className="mb-3 text-sm font-semibold">價格快照紀錄</h3>
                  {(() => {
                    const snapshots = manualPriceSnapshots
                      .filter((s) => s.assetId === editingAsset.id)
                      .sort((a, b) => b.date.localeCompare(a.date));
                    return snapshots.length === 0 ? (
                      <p className="mb-3 text-xs" style={{ color: "var(--ns-muted)" }}>尚無快照，新增第一筆後就能在績效圖中看到趨勢。</p>
                    ) : (
                      <div className="mb-4 space-y-1.5">
                        {snapshots.map((snap) => (
                          <div key={snap.id} className="flex items-center justify-between rounded-md px-3 py-2 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                            <div>
                              <span className="tabular font-semibold">{snap.date}</span>
                              <span className="ml-3 tabular">{formatPrice(snap.price)}</span>
                              {snap.note ? <span className="ml-2 text-xs" style={{ color: "var(--ns-muted)" }}>{snap.note}</span> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteSnapshot.mutateAsync(snap.id)}
                              disabled={deleteSnapshot.isPending}
                              className="ml-3 grid size-6 place-items-center rounded outline-none transition hover:opacity-70"
                              aria-label="刪除快照"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label="日期">
                      <TextInput type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
                    </Field>
                    <Field label="淨值 / 價格">
                      <TextInput type="number" value={snapshotPrice} onChange={(e) => setSnapshotPrice(Number(e.target.value))} />
                    </Field>
                    <div className="flex items-end">
                      <ActionButton onClick={() => void submitSnapshot()} disabled={createSnapshot.isPending}>
                        {createSnapshot.isPending ? "儲存中…" : "新增快照"}
                      </ActionButton>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Field label="備註（選填）">
                      <TextInput value={snapshotNote} onChange={(e) => setSnapshotNote(e.target.value)} placeholder="基金公告淨值 2026-05-26" />
                    </Field>
                  </div>
                  {snapshotMessage ? <div className="mt-2"><StatusText>{snapshotMessage}</StatusText></div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
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
  const icon = active
    ? sort.direction === "asc"
      ? <ArrowUp size={11} weight="bold" />
      : <ArrowDown size={11} weight="bold" />
    : <ArrowsDownUp size={11} weight="bold" />;
  return (
    <th className={`py-2 ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 select-none text-xs uppercase tracking-wide outline-none transition hover:opacity-80"
        style={{ color: active ? "var(--ns-accent)" : "var(--ns-muted)" }}
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      >
        {align === "right" ? <span>{icon}</span> : null}
        <span>{label}</span>
        {align !== "right" ? <span>{icon}</span> : null}
      </button>
    </th>
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
      const an = assetsById.get(a.assetId) ? resolveAssetName(assetsById.get(a.assetId)!, nameLocale) : a.name;
      const bn = assetsById.get(b.assetId) ? resolveAssetName(assetsById.get(b.assetId)!, nameLocale) : b.name;
      // Chinese collation via Intl so 台積 sorts predictably alongside ASCII.
      return an.localeCompare(bn, undefined, { numeric: true, sensitivity: "base" });
    }
    case "account": {
      const an = a.accountId ? accountMap.get(a.accountId)?.name ?? "" : "";
      const bn = b.accountId ? accountMap.get(b.accountId)?.name ?? "" : "";
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

function SummaryCell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const color = tone === "positive"
    ? "var(--ns-gain)"
    : tone === "negative"
      ? "var(--ns-loss)"
      : "var(--ns-fg)";
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
      <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{label}</div>
      <div className="mt-1 tabular text-base font-semibold" style={{ color }}>{value}</div>
    </div>
  );
}

const performanceRangeOptions = ["1D", "1W", "1M", "1Y", "3Y", "Custom"] as const;
type PerformanceRange = typeof performanceRangeOptions[number];

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
  dailyPrices: DailyPrice[];
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
    manualSnapshotsByAsset.set(assetId, snaps.sort((a, b) => a.date.localeCompare(b.date)));
  }

  // Identify which positions are manual (price from snapshots) vs tracked (price from daily_prices).
  const manualAssetIds = new Set(
    assets.filter((a) => a.holdingSource === "manual").map((a) => a.id),
  );

  // Collect price history for tracked (Yahoo) positions.
  const trackedTickers = new Set(
    positions.filter((p) => !manualAssetIds.has(p.assetId)).map((p) => p.ticker.toUpperCase()),
  );
  const pricesByTicker = new Map<string, DailyPrice[]>();
  for (const price of dailyPrices) {
    const ticker = price.ticker.toUpperCase();
    if (!trackedTickers.has(ticker)) continue;
    if (price.date < start || price.date > end) continue;
    const bucket = pricesByTicker.get(ticker) ?? [];
    bucket.push(price);
    pricesByTicker.set(ticker, bucket);
  }
  for (const [ticker, rows] of pricesByTicker) {
    pricesByTicker.set(ticker, rows.sort((a, b) => a.date.localeCompare(b.date)));
  }

  // Collect dates from both sources, plus today from live quotes when available.
  const trackedDates = [...pricesByTicker.values()].flat().map((p) => p.date);
  const manualDates = [...manualSnapshotsByAsset.values()].flat()
    .filter((s) => s.date >= start && s.date <= end)
    .map((s) => s.date);
  const today = todayDate();
  const hasLiveQuotes = positions.some((p) => quoteMap[p.ticker.toUpperCase()]);
  const quoteDates = (hasLiveQuotes && today >= start && today <= end) ? [today] : [];
  const dates = [...new Set([...trackedDates, ...manualDates, ...quoteDates])].sort();

  return dates.map((date) => {
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
          if (quote) return sum + toPrimary(quote.price * position.quantity, quote.currency || position.currency, date);
        }
        return sum;
      }

      const history = pricesByTicker.get(position.ticker.toUpperCase()) ?? [];
      const price = latestPriceOnOrBefore(history, date);
      // For today's date, fall back to live quote if no daily close exists yet.
      if (!price) {
        if (date === today) {
          const quote = quoteMap[position.ticker.toUpperCase()];
          if (quote) return sum + toPrimary(quote.price * position.quantity, quote.currency || position.currency, date);
        }
        return sum;
      }
      return sum + toPrimary(price.close * position.quantity, price.currency || position.currency, date);
    }, 0);
    return {
      date,
      label: compactDateLabel(date, range),
      value,
    };
  }).filter((point) => point.value > 0);
}

function latestSnapshotOnOrBefore(rows: ManualPriceSnapshot[], date: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].date <= date) return rows[index];
  }
  return null;
}

function latestPriceOnOrBefore(rows: DailyPrice[], date: string) {
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
