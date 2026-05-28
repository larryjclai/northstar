import { ArrowDown, ArrowsClockwise, ArrowsDownUp, ArrowUp, Bank, ChartLineUp, ListChecks, PencilSimple, PlusCircle, X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { Card } from "../components/Card";
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
  formatPrice,
  formatQuantity,
  resolveAssetName,
  todayInTimezone,
  type Account,
  type DailyPrice,
  type HoldingPosition,
  type InvestmentRecord,
  type ManualPriceSnapshot,
  type MarketQuote as DomainMarketQuote,
  type PortfolioAsset,
} from "../domain";
import { useBackfillAssetProfiles, useRefreshDailyPrices, useRefreshQuotes } from "../features/market-data/useMarketRefresh";
import { useUiPreferences, type NameLocalePreference } from "../state/uiPreferences";
import { InvestmentEntryDrawer } from "./InvestmentsAddSheet";

type InvestmentTab = "accounts" | "performance" | "holdings";

const tabOptions: { value: InvestmentTab; label: string; icon: React.ReactNode }[] = [
  { value: "accounts", label: "帳戶", icon: <Bank size={16} weight="duotone" /> },
  { value: "performance", label: "績效", icon: <ChartLineUp size={16} weight="duotone" /> },
  { value: "holdings", label: "持倉", icon: <ListChecks size={16} weight="duotone" /> },
];

export function InvestmentsRoute() {
  const [tab, setTab] = useState<InvestmentTab>("holdings");

  const { accounts, assets, investments, quotes, settings, dailyFxRates, dailyPrices, manualPriceSnapshots } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshDailyPrices = useRefreshDailyPrices();
  const backfillAssetProfiles = useBackfillAssetProfiles();
  const nameLocale = useUiPreferences((state) => state.nameLocale);
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
      map[quote.symbol.toUpperCase()] = {
        symbol: quote.symbol,
        price: quote.price,
        currency: quote.currency,
      };
    }
    return map;
  }, [quoteRows]);

  const accountMap = useMemo(() => new Map(accountRows.map((account) => [account.id, account])), [accountRows]);
  const investmentAccounts = useMemo(
    () => accountRows.filter((account) => account.type === "investment"),
    [accountRows],
  );

  const positions = useMemo(
    () => buildHoldingPositionsByAccount(assetRows, recordRows, quoteMap),
    [assetRows, recordRows, quoteMap],
  );

  const [statusMessage, setStatusMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function refreshLatestQuotes() {
    setStatusMessage("");
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

  async function backfillDailyPricesData() {
    setStatusMessage("");
    const tickers = [...new Set(assetRows.map((asset) => asset.ticker.trim().toUpperCase()).filter(Boolean))];
    if (tickers.length === 0) {
      toast.info("沒有需要回補的持倉");
      return;
    }
    
    const progressId = toast.info("回補歷史股價中", { description: "正在抓取 5Y 歷史價格資料…", durationMs: 0 });
    try {
      const result = await refreshDailyPrices.mutateAsync({ tickers, range: "5y" });
      toast.dismiss(progressId);
      if (result.failed.length) {
        toast.warning("部分股價未取得", { description: `已更新 ${result.saved} 筆股價資料。`, detail: result.failed.join("\n") });
        setStatusMessage(`已回補 ${result.saved} 筆股價，部分 ticker 失敗。`);
      } else {
        toast.success(`已回補歷史股價`, { description: `成功更新 ${result.saved} 筆日報價。` });
        setStatusMessage(`已回補 5 年歷史價格。`);
      }
    } catch (error) {
      toast.dismiss(progressId);
      const message = error instanceof Error ? error.message : "股價回補失敗。";
      toast.error("股價回補失敗", { description: message });
      setStatusMessage(message);
    }
  }

  function changeTab(next: InvestmentTab) {
    setTab(next);
  }

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Portfolio</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            持倉投資
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div className="ns-seg">
            {tabOptions.map((option) => (
              <button key={option.value} aria-selected={tab === option.value} onClick={() => changeTab(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <button className="ns-btn" onClick={refreshLatestQuotes} disabled={refreshQuotes.isPending}>
            <ArrowsClockwise size={14} />{refreshQuotes.isPending ? "更新中" : "更新報價"}
          </button>
          {tab === "holdings" && (
            <button className="ns-btn" onClick={backfillDailyPricesData} disabled={refreshDailyPrices.isPending}>
              <ArrowsClockwise size={14} />{refreshDailyPrices.isPending ? "回補中" : "回補資料"}
            </button>
          )}
          <button className="ns-btn primary" onClick={() => setAddOpen(true)}>
            <PlusCircle size={14} />新增部位
          </button>
        </div>
      </div>

      {statusMessage ? <div style={{ marginBottom: 12 }}><StatusText>{statusMessage}</StatusText></div> : null}

      {tab === "accounts" ? (
        <AccountsTab
          accounts={investmentAccounts}
          positions={positions}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
        />
      ) : null}
      {tab === "performance" ? (
        <PerformanceTab
          positions={positions}
          assets={assetRows}
          records={recordRows}
          primaryCurrency={primaryCurrency}
          toPrimary={toPrimary}
          dailyPrices={dailyPriceRows}
          manualPriceSnapshots={manualSnapshotRows}
          refreshing={refreshQuotes.isPending || refreshDailyPrices.isPending}
        />
      ) : null}
      {tab === "holdings" ? (
        <HoldingsTab
          positions={positions}
          accountMap={accountMap}
          accounts={investmentAccounts}
          nameLocale={nameLocale}
          assetsById={new Map(assetRows.map((asset) => [asset.id, asset]))}
          manualPriceSnapshots={manualSnapshotRows}
        />
      ) : null}

      <InvestmentEntryDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        accounts={accountRows}
        portfolioAssets={assetRows}
        title="新增部位"
        initialMode="snapshot"
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
          const pnlColor = aggregate.pnl >= 0 ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)";
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
            <div className="text-xs" style={{ color: pnl >= 0 ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)" }}>
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
  refreshing,
}: {
  positions: HoldingPosition[];
  assets: PortfolioAsset[];
  records: InvestmentRecord[];
  primaryCurrency: string;
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
  dailyPrices: DailyPrice[];
  manualPriceSnapshots: ManualPriceSnapshot[];
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
  
  const thisYear = new Date().getFullYear().toString();
  const totalDividends = records
    .filter((r) => r.action === "cashDividend" && r.date.startsWith(thisYear))
    .reduce((sum, r) => sum + r.price - r.fee, 0);

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
  });

  return (
    <div className="grid gap-4">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
        <div className="ns-card" style={{ padding: 18, minWidth: 0 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Market value</div>
          <div className="ns-num-md" style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`NT$${formatNumber(totalValue)}`}>NT${formatNumber(totalValue)}</div>
          <div className={"mono " + (totalPnL >= 0 ? "pos" : "neg")} style={{ fontSize: 11.5, marginTop: 4 }}>
            {totalPnL >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
          </div>
        </div>
        <div className="ns-card" style={{ padding: 18, minWidth: 0 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Cost basis</div>
          <div className="ns-num-md" style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`NT$${formatNumber(totalCost)}`}>NT${formatNumber(totalCost)}</div>
          <div className="mono muted" style={{ fontSize: 11.5, marginTop: 4 }}>−</div>
        </div>
        <div className="ns-card" style={{ padding: 18, minWidth: 0 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Unrealized P/L</div>
          <div className={"ns-num-md " + (totalPnL >= 0 ? "pos" : "neg")} style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${totalPnL >= 0 ? "+" : "−"}NT$${formatNumber(Math.abs(totalPnL))}`}>
            {totalPnL >= 0 ? "+" : "−"}NT${formatNumber(Math.abs(totalPnL))}
          </div>
          <div className={"mono " + (totalPnL >= 0 ? "pos" : "neg")} style={{ fontSize: 11.5, marginTop: 4 }}>
            {totalPnL >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
          </div>
        </div>
        <div className="ns-card" style={{ padding: 18, minWidth: 0 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Realized YTD</div>
          <div className="ns-num-md pos" style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+NT$0</div>
          <div className="mono pos" style={{ fontSize: 11.5, marginTop: 4 }}>0 closed lots</div>
        </div>
        <div className="ns-card" style={{ padding: 18, minWidth: 0 }}>
          <div className="ns-eyebrow" style={{ marginBottom: 8 }}>Dividends YTD</div>
          <div className="ns-num-md" style={{ fontSize: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`NT$${formatNumber(totalDividends)}`}>NT${formatNumber(totalDividends)}</div>
          <div className="mono pos" style={{ fontSize: 11.5, marginTop: 4 }}>+ NT$0 today</div>
        </div>
      </div>
      
      {refreshing ? (
          <div className="mt-3 text-xs" style={{ color: "var(--ns-muted)" }}>
            正在抓取最新報價…
          </div>
      ) : null}

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
        {trend.length > 1 ? (
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

function HoldingsTab({
  positions,
  accountMap,
  accounts,
  nameLocale,
  assetsById,
  manualPriceSnapshots,
}: {
  positions: HoldingPosition[];
  accountMap: Map<string, Account>;
  accounts: Account[];
  nameLocale: NameLocalePreference;
  assetsById: Map<string, PortfolioAsset>;
  manualPriceSnapshots: ManualPriceSnapshot[];
}) {
  const timezone = useUiPreferences((state) => state.timezone);
  const [editingAsset, setEditingAsset] = useState<PortfolioAsset | null>(null);
  const [editForm, setEditForm] = useState<PortfolioAssetDraft | null>(null);
  const [message, setMessage] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(() => todayDate());
  const [snapshotPrice, setSnapshotPrice] = useState(0);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [snapshotMessage, setSnapshotMessage] = useState("");
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

  const sorted = sortHoldings(positions, sort, accountMap, assetsById, nameLocale);

  const HOLDING_COLORS = [
    "var(--ns-chart-1)", "var(--ns-chart-2)", "var(--ns-chart-3)",
    "var(--ns-chart-4)", "var(--ns-chart-5)",
  ];

  return (
    <>
      <div className="ns-card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2.4fr 0.8fr 1fr 1fr 1.1fr 0.9fr 80px",
            padding: "10px 22px",
            borderBottom: "1px solid var(--ns-border)",
            fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
            color: "var(--ns-fg-dim)", fontFamily: "var(--ns-font-mono)",
          }}
        >
          {(["ticker", "quantity", "averageCost", "marketPrice", "marketValue", "unrealizedGainPercent"] as HoldingsSortKey[]).map((key, i) => {
            const labels: Record<string, string> = {
              ticker: "Symbol", quantity: "股數", averageCost: "均價",
              marketPrice: "現價", marketValue: "市值", unrealizedGainPercent: "報酬率",
            };
            const isActive = sort.key === key;
            const align = i === 0 ? "left" : "right";
            return (
              <button
                key={key}
                onClick={() => toggleSort(key)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  display: "inline-flex", alignItems: "center", gap: 4,
                  justifyContent: align === "right" ? "flex-end" : "flex-start",
                  color: isActive ? "var(--ns-accent)" : "var(--ns-fg-dim)",
                  fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit",
                  textTransform: "inherit",
                }}
              >
                {align === "right" && isActive && (
                  sort.direction === "asc" ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />
                )}
                {labels[key]}
                {align === "left" && isActive && (
                  sort.direction === "asc" ? <ArrowUp size={10} weight="bold" /> : <ArrowDown size={10} weight="bold" />
                )}
              </button>
            );
          })}
          <span />
        </div>

        {/* Rows */}
        {sorted.map((position, i) => {
          const account = position.accountId ? accountMap.get(position.accountId) : null;
          const asset = assetsById.get(position.assetId) ?? null;
          const displayName = asset ? resolveAssetName(asset, nameLocale) : position.name;
          const isPos = position.unrealizedGain >= 0;
          const color = HOLDING_COLORS[i % 5];
          const isTW = position.ticker.includes(".TW") || position.ticker.includes(".TWO");

          return (
            <Link
              to="/holdings/$ticker"
              params={{ ticker: position.ticker }}
              key={`${position.assetId}-${position.accountId ?? "none"}`}
              className="ns-row"
              style={{
                display: "grid",
                gridTemplateColumns: "2.4fr 0.8fr 1fr 1fr 1.1fr 0.9fr 80px",
                alignItems: "center",
                padding: "14px 22px",
                borderBottom: "1px solid var(--ns-border)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              {/* Symbol + name */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 32, height: 32, flexShrink: 0,
                    background: isTW ? "var(--ns-chart-1)" : color,
                    color: "var(--ns-bg)", borderRadius: "var(--ns-r-sm)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--ns-font-mono)", fontWeight: 600, fontSize: 10,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {position.ticker.slice(0, 4)}
                </div>
                <div>
                  <div className="mono" style={{ fontSize: 13.5, fontWeight: 500 }}>{position.ticker}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {displayName}{account ? ` · ${account.name}` : ""}
                  </div>
                </div>
              </div>

              {/* Qty */}
              <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>
                {formatQuantity(position.quantity)}
              </span>

              {/* Avg cost */}
              <span className="num muted" style={{ textAlign: "right", fontSize: 13 }}>
                {formatPrice(position.averageCost)}
              </span>

              {/* Last price */}
              <span className="num" style={{ textAlign: "right", fontSize: 13 }}>
                {position.marketPrice !== null ? formatPrice(position.marketPrice) : "—"}
              </span>

              {/* Market value */}
              <span className="num" style={{ textAlign: "right", fontSize: 14, fontWeight: 500 }}>
                {formatNumber(position.marketValue)}{" "}
                <span className="muted" style={{ fontSize: 11 }}>{position.currency}</span>
              </span>

              {/* P/L % */}
              <div style={{ textAlign: "right" }}>
                <div className={"num " + (isPos ? "pos" : "neg")} style={{ fontSize: 13, fontWeight: 500 }}>
                  {isPos ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%
                </div>
                <div className={"num " + (isPos ? "pos" : "neg")} style={{ fontSize: 11 }}>
                  {isPos ? "+" : ""}{formatNumber(position.unrealizedGain)}
                </div>
              </div>

              {/* Edit action */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                <button
                  className="ns-btn ghost"
                  style={{ padding: 6 }}
                  onClick={() => asset ? startEdit(asset) : undefined}
                  disabled={!asset}
                  title={asset?.holdingSource === "transactions" ? "編輯分類資料" : "編輯持倉"}
                >
                  <PencilSimple size={14} />
                </button>
              </div>
            </Link>
          );
        })}

        <div style={{ padding: "14px 22px" }}>
          <Link to="/transactions" className="muted" style={{ fontSize: 12, textDecoration: "none" }}>
            查看交易明細 →
          </Link>
        </div>
      </div>
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
): HoldingPosition[] {
  const multiplier = sort.direction === "asc" ? 1 : -1;
  const comparator = (a: HoldingPosition, b: HoldingPosition) => {
    const primary = comparePositions(a, b, sort.key, accountMap, assetsById, nameLocale);
    if (primary !== 0) return primary * multiplier;
    // Stable secondary key: bigger market value first, then ticker A→Z.
    const byValue = (b.marketValue ?? 0) - (a.marketValue ?? 0);
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
      return a.marketValue - b.marketValue;
    case "unrealizedGain":
      return a.unrealizedGain - b.unrealizedGain;
    case "unrealizedGainPercent":
      return a.unrealizedGainPercent - b.unrealizedGainPercent;
  }
}

function SummaryCell({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const color = tone === "positive"
    ? "var(--ns-positive, var(--ns-accent))"
    : tone === "negative"
      ? "var(--ns-danger, #c0392b)"
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
  // We want to track historical prices for ALL assets that have a ticker, regardless of holdingSource.
  const trackedTickers = new Set(
    positions.filter((p) => p.ticker.trim() !== "").map((p) => p.ticker.toUpperCase()),
  );
  const pricesByTicker = new Map<string, DailyPrice[]>();
  for (const price of dailyPrices) {
    const ticker = price.ticker.toUpperCase();
    if (!trackedTickers.has(ticker)) continue;
    // Do not filter out prices before `start` here! We need them for `latestPriceOnOrBefore`
    // to carry forward the last known price if there are gaps.
    if (price.date > end) continue;
    const bucket = pricesByTicker.get(ticker) ?? [];
    bucket.push(price);
    pricesByTicker.set(ticker, bucket);
  }
  for (const [ticker, rows] of pricesByTicker) {
    pricesByTicker.set(ticker, rows.sort((a, b) => a.date.localeCompare(b.date)));
  }

  // Collect dates from both sources, but only keep dates within the requested range for the X-axis.
  const trackedDates = [...pricesByTicker.values()].flat()
    .filter((p) => p.date >= start && p.date <= end)
    .map((p) => p.date);
  const manualDates = [...manualSnapshotsByAsset.values()].flat()
    .filter((s) => s.date >= start && s.date <= end)
    .map((s) => s.date);
  const dates = [...new Set([...trackedDates, ...manualDates])].sort();

  return dates.map((date) => {
    const value = positions.reduce((sum, position) => {
      const ticker = position.ticker.trim().toUpperCase();
      
      // If the asset has a ticker, try to use historical daily prices first.
      if (ticker) {
        const history = pricesByTicker.get(ticker) ?? [];
        const price = latestPriceOnOrBefore(history, date);
        if (price) {
          return sum + toPrimary(price.close * position.quantity, price.currency || position.currency, date);
        }
      }

      // Fallback to manual snapshots if no daily price is found (or no ticker)
      const snaps = manualSnapshotsByAsset.get(position.assetId) ?? [];
      const snap = latestSnapshotOnOrBefore(snaps, date);
      if (snap) {
        return sum + toPrimary(snap.price * position.quantity, position.currency, date);
      }

      return sum;
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
