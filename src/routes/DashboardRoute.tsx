import { ArrowDown, ArrowsClockwise, ArrowUp } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useFinanceData } from "../data/hooks";
import { getFinanceRepository, type StoredMarketQuote } from "../data/repositories";
import { enterDemoMode } from "../data/demoData";
import { useDemoMode } from "../state/demoMode";
import { useToast } from "../components/Toast";
import { AccountFilter } from "../components/AccountFilter";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import {
  assetTypeLabels,
  buildNetWorthBreakdown,
  buildQuantityTimeline,
  buildCreditCardReminders,
  buildOutstandingSettlements,
  buildPortfolioValueSeries,
  buildBenchmarkSeries,
  alignByDate,
  cumulativeReturnPct,
  topMoversFromHistory,
  resolveAssetName,
  convertCurrency,
  createFxConverter,
  formatMoney,
  formatCompactMoney,
  formatNumber,
  type AnalyticsPosition,
  type Mover,
  type Account,
  type AppSettings,
  type DailyFxRate,
  type FinancialGoal,
  type InvestmentRecord,
  type LedgerTransaction,
  type PortfolioAsset,
  todayInTimezone,
} from "../domain";
import { useRefreshQuotes, useRefreshFxRates } from "../features/market-data/useMarketRefresh";
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { useUiPreferences } from "../state/uiPreferences";

type StripPeriod = "1W" | "1M" | "3M" | "YTD" | "1Y";

/** Inclusive start date for a Portfolio-Strip period, relative to `end` (today). */
function stripStartDate(period: StripPeriod, end: string): string {
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<StripPeriod, "YTD">, number> = { "1W": 7, "1M": 31, "3M": 92, "1Y": 365 };
  const d = new Date(`${end}T00:00:00`);
  d.setDate(d.getDate() - days[period]);
  return d.toISOString().slice(0, 10);
}


const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
  "#2dd4bf",
  "#fb923c",
];

export function DashboardRoute() {
  const { accounts, ledger, assets, quotes, settings, dailyFxRates, dailyPrices, manualPriceSnapshots, recurring, recurringInvestments, financialGoals, investments } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshFxRates = useRefreshFxRates();
  const timezone = useUiPreferences((state) => state.timezone);
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const benchmarkTicker = useUiPreferences((state) => state.benchmarkTicker);
  const [stripPeriod, setStripPeriod] = useState<StripPeriod>("1M");
  const queryClient = useQueryClient();
  const toast = useToast();
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [demoLoading, setDemoLoading] = useState(false);

  async function loadDemo() {
    setDemoLoading(true);
    try {
      await enterDemoMode(await getFinanceRepository()); // non-destructive
      useDemoMode.getState().set(true);
      await queryClient.invalidateQueries();
      toast.success("已進入示範模式");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "進入示範模式失敗");
    } finally {
      setDemoLoading(false);
    }
  }

  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const dailyPriceRows = dailyPrices.data ?? [];
  const manualSnapshotRows = manualPriceSnapshots.data ?? [];
  const recurringRows = recurring.data ?? [];
  const recurringInvestmentRows = recurringInvestments.data ?? [];
  const investmentRows = investments.data ?? [];
  const goalRows = financialGoals.data ?? [];

  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);

  // "更新" refreshes stock quotes and FX rates together (B6).
  const refreshingMarket = refreshQuotes.isPending || refreshFxRates.isPending;
  async function refreshMarket() {
    const tickers = assetRows.map((a) => a.ticker);
    const pairs = (appSettings?.exchangeRates ?? []).map((r) => ({ from: r.from, to: r.to || primaryCurrency }));
    const tasks: Promise<unknown>[] = [];
    if (tickers.length) tasks.push(refreshQuotes.mutateAsync(tickers));
    if (pairs.length) tasks.push(refreshFxRates.mutateAsync({ pairs, range: "1y" }));
    if (!tasks.length) return;
    const results = await Promise.allSettled(tasks);
    if (results.some((r) => r.status === "rejected")) toast.error("部分更新失敗");
    else toast.success("已更新股價與匯率");
  }

  const missingFxPairs = useMemo(() => {
    const currencies = new Set([
      ...accountRows.map((account) => account.currency),
      ...ledgerRows.map((row) => row.currency),
      ...assetRows.map((asset) => asset.currency),
      ...quoteRows.map((quote) => quote.currency),
    ]);
    return [...currencies]
      .filter((currency) => currency !== primaryCurrency && convertCurrency(1, currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: new Date().toISOString() }) === null)
      .map((currency) => `${currency}/${primaryCurrency}`);
  }, [accountRows, ledgerRows, assetRows, quoteRows, primaryCurrency, appSettings, fxHistory]);
  const filteredAccounts = selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount);

  const quoteFor = (ticker: string) => quoteRows.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const filteredAssets = selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount);
  const marketValue = filteredAssets.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    const value = quote ? quote.price * asset.totalQuantity : asset.averageCost * asset.totalQuantity;
    return sum + toPrimary(value, quote?.currency ?? asset.currency);
  }, 0);

  // Reconciling partition: 資產 − 負債 = 淨值 always holds.
  const breakdown = buildNetWorthBreakdown(filteredAccounts, marketValue, toPrimary);
  const availableCash = breakdown.liquidCash;
  const alternativeAssets = breakdown.alternativeAssets;
  const liabilities = breakdown.liabilities;
  const netWorth = breakdown.netWorth;

  const monthRows = ledgerRows.filter((row) => row.date.startsWith(monthKey) && row.settlementStatus === "settled" && (selectedAccount === "all" || row.accountId === selectedAccount));
  const monthIncome = monthRows.filter((row) => row.entryType === "income").reduce((sum, row) => sum + toPrimary(Math.max(0, row.amount), row.currency, row.date), 0);
  const monthExpense = monthRows.filter((row) => row.entryType === "expense").reduce((sum, row) => sum + toPrimary(Math.abs(row.amount), row.currency, row.date), 0);
  const monthNet = monthIncome - monthExpense;
  // Savings rate stays honest in deficit months: with no income but real
  // spending we surface a negative rate (net flow over spend) instead of a
  // flattering 0%.
  const savingsRate = monthIncome > 0
    ? (monthNet / monthIncome) * 100
    : monthExpense > 0
      ? (monthNet / monthExpense) * 100
      : 0;

  const trend = useMemo(
    () => buildNetWorthTrend(
      selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount),
      selectedAccount === "all" ? ledgerRows : ledgerRows.filter(r => r.accountId === selectedAccount),
      selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount),
      selectedAccount === "all" ? investmentRows : investmentRows.filter(r => r.linkedAccountId === selectedAccount),
      quoteRows, appSettings, fxHistory
    ),
    [accountRows, ledgerRows, assetRows, investmentRows, quoteRows, appSettings, fxHistory],
  );
  const prevValue = trend.length >= 2 ? trend[trend.length - 2].value : 0;
  const lastValue = trend.length >= 1 ? trend[trend.length - 1].value : netWorth;
  const momChange = lastValue - prevValue;
  const momPct = prevValue > 0 ? (momChange / prevValue) * 100 : 0;

  // The period control slices the net-worth chart to the selected range. The
  // headline month-over-month figures stay on the full trend; only the chart
  // view is scoped. Falls back to the full trend when a short range would leave
  // too few points to draw (e.g. monthly buckets + a 1W range).
  const visibleTrend = useMemo(() => {
    if (trend.length < 2) return trend;
    const startIso = stripStartDate(stripPeriod, new Date().toISOString().slice(0, 10));
    const filtered = trend.filter((p) => p.iso >= startIso);
    return filtered.length >= 2 ? filtered : trend;
  }, [trend, stripPeriod]);

  const hasAnyData = accountRows.length > 0 || ledgerRows.length > 0 || assetRows.length > 0;

  // Budget health — current-month expense per category vs configured budget.
  const budgetCats = useMemo(() => {
    const spendByCat = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense" || !row.category) continue;
      spendByCat.set(row.category, (spendByCat.get(row.category) ?? 0) + Math.abs(toPrimary(row.amount, row.currency, row.date)));
    }
    const cats = (appSettings?.categories ?? []).map((c, i) => ({
      name: c.name,
      budget: c.budget ?? null,
      color: c.color || CHART_COLORS[i % CHART_COLORS.length],
      spent: spendByCat.get(c.name) ?? 0,
    }));
    // Surface categories that have a budget or some spend; sort by usage.
    return cats
      .filter((c) => c.budget || c.spent > 0)
      .sort((a, b) => (b.spent / (b.budget || b.spent || 1)) - (a.spent / (a.budget || a.spent || 1)))
      .slice(0, 5);
  }, [monthRows, appSettings, toPrimary]);
  const totalBudget = budgetCats.reduce((sum, c) => sum + (c.budget ?? 0), 0);
  const overBudget = budgetCats.filter((c) => c.budget && c.spent > c.budget);

  // Allocation by asset class (+ cash slice).
  const allocation = useMemo(() => {
    const byClass = new Map<string, number>();
    for (const asset of filteredAssets) {
      const quote = quoteFor(asset.ticker);
      const value = toPrimary((quote ? quote.price : asset.averageCost) * asset.totalQuantity, quote?.currency ?? asset.currency);
      if (value <= 0) continue;
      const label = asset.assetType ? assetTypeLabels[asset.assetType] : "其他";
      byClass.set(label, (byClass.get(label) ?? 0) + value);
    }
    if (availableCash > 0) byClass.set("現金", (byClass.get("現金") ?? 0) + availableCash);
    if (alternativeAssets > 0) byClass.set("實體資產", (byClass.get("實體資產") ?? 0) + alternativeAssets);
    const total = [...byClass.values()].reduce((s, v) => s + v, 0);
    return [...byClass.entries()]
      .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length], pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAssets, quoteRows, availableCash, alternativeAssets, toPrimary]);

  // Investment positions (current holdings) for the fixed-basket analytics that
  // power the Portfolio Strip. Mirror the page's account filter so the strip
  // matches the rest of the dashboard.
  const analyticsPositions = useMemo<AnalyticsPosition[]>(() => {
    const list = selectedAccount === "all" ? assetRows : assetRows.filter((a) => a.accountId === selectedAccount);
    return list
      .filter((a) => a.deletedAt === null && a.totalQuantity > 0)
      .map((a) => ({
        assetId: a.id,
        ticker: a.ticker,
        quantity: a.totalQuantity,
        currency: a.currency,
        isManual: a.holdingSource === "manual",
        assetClass: a.assetType ? assetTypeLabels[a.assetType] : undefined,
      }));
  }, [assetRows, selectedAccount]);

  // Portfolio Strip: cumulative price return of the current basket vs the
  // benchmark over the selected period. Fixed-basket (see portfolioAnalytics) so
  // it reflects price moves, not contributions; Alpha is computed on the dates
  // both series share so the three figures stay internally consistent. Returns
  // null fields when there isn't enough daily history (gated, like XIRR).
  const stripData = useMemo(() => {
    const end = new Date().toISOString().slice(0, 10);
    const start = stripStartDate(stripPeriod, end);
    const { series } = buildPortfolioValueSeries({
      positions: analyticsPositions,
      dailyPrices: dailyPriceRows,
      manualSnapshots: manualSnapshotRows,
      toPrimary,
      start,
      end,
    });
    if (series.length < 2) return { portfolio: null as number | null, benchmark: null as number | null, alpha: null as number | null };
    let portfolio = cumulativeReturnPct(series.map((p) => p.value));
    let benchmark: number | null = null;
    let alpha: number | null = null;
    const bench = buildBenchmarkSeries(dailyPriceRows, benchmarkTicker, start, end);
    if (bench.length >= 2) {
      const aligned = alignByDate(series, bench);
      if (aligned.a.length >= 2 && aligned.b.length >= 2) {
        portfolio = cumulativeReturnPct(aligned.a.map((p) => p.value));
        benchmark = cumulativeReturnPct(aligned.b.map((p) => p.value));
        alpha = portfolio - benchmark;
      }
    }
    return { portfolio, benchmark, alpha };
  }, [analyticsPositions, dailyPriceRows, manualSnapshotRows, toPrimary, stripPeriod, benchmarkTicker]);

  // Today's Top Movers among held tickers, computed from the two most recent
  // daily closes ("vs 前一日") — robust against bad live-quote previous closes.
  const heldAssetCount = useMemo(() => assetRows.filter((a) => a.deletedAt === null && a.totalQuantity > 0).length, [assetRows]);
  const movers = useMemo(() => {
    const assetByTicker = new Map(assetRows.map((a) => [a.ticker.toUpperCase(), a]));
    const heldTickers = assetRows.filter((a) => a.deletedAt === null && a.totalQuantity > 0).map((a) => a.ticker);
    return topMoversFromHistory(dailyPriceRows, heldTickers, {
      limit: 7,
      nameFor: (t) => resolveAssetName(assetByTicker.get(t.toUpperCase()), nameLocale),
    });
  }, [dailyPriceRows, assetRows, nameLocale]);
  const moversMax = movers.reduce((mx, m) => Math.max(mx, Math.abs(m.changePercent)), 0) || 1;

  // Goals — approximate progress = net worth / target (dashboard glance only).
  const goals = useMemo(() => {
    return goalRows
      .filter((g) => g.deletedAt === null)
      .map((g) => {
        const target = goalTarget(g);
        const pct = target > 0 ? Math.min((netWorth / target) * 100, 100) : 0;
        return { id: g.id, name: g.name, target, pct };
      })
      .slice(0, 4);
  }, [goalRows, netWorth]);

  // Upcoming bills (recurring, next 30 days or overdue).
  const accountMap = useMemo(() => new Map(accountRows.map((a) => [a.id, a])), [accountRows]);
  const upcoming = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const horizon = todayInTimezone(timezone, d);
    const today = todayInTimezone(timezone);
    return recurringRows
      .filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= horizon)
      .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
      .slice(0, 5);
  }, [recurringRows, timezone]);
  const upcomingTotal = upcoming.reduce((sum, r) => sum + toPrimary(Math.abs(r.amount), r.currency, r.nextRunDate), 0);

  // Credit-card payments coming due (within ~45 days), soonest first.
  const creditReminders = useMemo(
    () => buildCreditCardReminders(filteredAccounts, todayInTimezone(timezone), (amount, currency) => toPrimary(amount, currency)).filter((r) => r.daysUntilDue <= 45),
    [filteredAccounts, timezone],
  );

  // Recurring investment plans due soon (next ~7 days or overdue) — a nudge to
  // top up the 交割款 before posting.
  const dueRecurringInvestments = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const horizon = todayInTimezone(timezone, d);
    return recurringInvestmentRows
      .filter((r) => r.isActive && r.nextRunDate <= horizon)
      .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));
  }, [recurringInvestmentRows, timezone]);

  // Unsettled accounts receivable / payable.
  const settlements = useMemo(
    () => buildOutstandingSettlements(
      selectedAccount === "all" ? ledgerRows : ledgerRows.filter((r) => r.accountId === selectedAccount),
      (amount, currency) => toPrimary(amount, currency),
    ),
    [ledgerRows, selectedAccount, toPrimary],
  );

  // Adjusted net worth (accrual view): headline net worth is cash-basis; this
  // layers in money owed to you (AR) and money you owe (AP). Shown as a
  // secondary figure so the headline stays clean and uninflated.
  const netSettlement = settlements.receivableTotal - settlements.payableTotal;
  const adjustedNetWorth = netWorth + netSettlement;

  // FX rates (latest per pair) for the Market card.
  const fxRates = useMemo(() => {
    const latest = new Map<string, DailyFxRate>();
    for (const row of fxHistory) {
      const key = `${row.from}/${row.to}`;
      const cur = latest.get(key);
      if (!cur || row.date > cur.date) latest.set(key, row);
    }
    let rows = [...latest.values()].map((r) => ({ pair: `${r.from}/${r.to}`, rate: r.rate }));
    if (rows.length === 0 && appSettings) {
      rows = appSettings.exchangeRates.map((r) => ({ pair: `${r.from}/${r.to}`, rate: r.rate }));
    }
    return rows.slice(0, 4);
  }, [fxHistory, appSettings]);

  // Recent activity.
  const recent = useMemo(
    () => [...ledgerRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [ledgerRows],
  );

  const greeting = greetingForHour(new Date().getHours());
  const todayLabel = new Date().toLocaleDateString("zh-TW", { month: "long", day: "numeric" });
  const monthLabel = monthKey.replace("-", " / ");

  return (
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {missingFxPairs.length ? (
        <div style={{ padding: "10px 14px", borderRadius: "var(--ns-r-md)", background: "var(--ns-warn-soft)", border: "1px solid var(--ns-border)", marginBottom: 14, fontSize: 13 }}>
          總額不完整：缺少 {missingFxPairs.join("、")} 匯率。<Link to="/settings" style={{ marginLeft: 8 }}>前往更新匯率</Link>
        </div>
      ) : null}
      {/* Over-budget alert */}
      {overBudget.length > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--ns-r-md)", background: "var(--ns-neg-soft)", border: "1px solid color-mix(in srgb, var(--ns-neg) 40%, transparent)", marginBottom: 14, fontSize: 13 }}>
          <span>
            <strong>{overBudget.map((c) => c.name).join("、")}</strong> 本月已超支
            &nbsp;·&nbsp; 超出 {formatMoney(overBudget.reduce((s, c) => s + (c.spent - (c.budget ?? 0)), 0), primaryCurrency)}
          </span>
          <Button variant="ghost" size="xs" className="ml-auto" render={<Link to="/cash-flow/categories" />}>查看分類 →</Button>
        </div>
      ) : null}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Overview · {monthLabel}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
        </div>
        {/* Account filter + 更新. The single time-range control lives on the net
            worth card (the period segmented control), matching the prototype. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} style={{ maxWidth: "none" }} />
          <Button variant="outline" className="h-9 shrink-0 sm:h-9" onClick={refreshMarket} loading={refreshingMarket} disabled={refreshingMarket || (assetRows.length === 0 && (appSettings?.exchangeRates?.length ?? 0) === 0)}>
            <ArrowsClockwise size={14} />{refreshingMarket ? "更新中" : "更新"}
          </Button>
        </div>
      </div>

      {/* Row 1 · Net worth + KPI stack */}
      <div className="ns-dash-row1">
        <Card style={{ padding: 22, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div className="ns-eyebrow" style={{ marginBottom: 5 }}>Net worth · {primaryCurrency}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums lining-nums",
                  fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.025em", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                  flexShrink: 1 }}>
                  {formatMoney(netWorth, primaryCurrency)}
                </span>
                {trend.length >= 2 ? (
                  <Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
                    {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                    <span className="num">{momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))} · {Math.abs(momPct).toFixed(2)}%</span>
                  </Badge>
                ) : null}
              </div>
              {Math.abs(netSettlement) > 0.5 ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }} title="現金基礎淨值加計應收、減去應付">
                  調整後淨值（含應收應付）{" "}
                  <span className="num" style={{ color: "var(--ns-fg)" }}>{formatMoney(adjustedNetWorth, primaryCurrency)}</span>
                  <span style={{ marginLeft: 6 }}>
                    ({netSettlement >= 0 ? "+" : "−"}{formatNumber(Math.abs(netSettlement))})
                  </span>
                </div>
              ) : null}
            </div>
            {trend.length > 1 ? (
              <SegmentedControl
                value={stripPeriod}
                onChange={setStripPeriod}
                options={(["1W", "1M", "3M", "YTD", "1Y"] as StripPeriod[]).map((v) => ({ value: v, label: v }))}
              />
            ) : null}
          </div>
          {trend.length > 1 ? (
            // position:relative + absolute inner so ResponsiveContainer gets a
            // definite height inside the flex column (otherwise it measures 0
            // and the area never draws).
            <div style={{ flex: 1, minHeight: 160, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visibleTrend}>
                  <defs>
                    <linearGradient id="netWorth" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={24} />
                  <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
                  <Tooltip formatter={(value) => formatMoney(Number(value), primaryCurrency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }} itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg)" }} />
                  <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#netWorth)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            </div>
          ) : (
            // No meaningful trend yet → collapse to a slim hint instead of a tall
            // empty void, so the hero doesn't dominate the page.
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {hasAnyData ? "累積幾筆資料後會顯示淨值趨勢。" : "先建立第一個帳戶，Northstar 會開始計算總覽。"}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Button size="sm" render={<Link to={hasAnyData ? "/cash-flow" : "/accounts"} />}>{hasAnyData ? "去記帳" : "建立帳戶"}</Button>
                {!hasAnyData ? (
                  <Button size="sm" variant="outline" onClick={loadDemo} loading={demoLoading}>
                    {demoLoading ? "載入中…" : "載入示範資料"}
                  </Button>
                ) : null}
              </span>
            </div>
          )}

          {analyticsPositions.length > 0 ? (
            <PortfolioStrip period={stripPeriod} data={stripData} benchmarkTicker={benchmarkTicker} />
          ) : null}
        </Card>

        {/* KPI stack */}
        <div className="ns-dash-kpi-stack">
          <KpiCard label="投資" value={formatMoney(marketValue, primaryCurrency)} color="var(--ns-chart-1)" />
          <KpiCard label="現金 / 存款" value={formatMoney(availableCash, primaryCurrency)} color="var(--ns-chart-2)" />
          {alternativeAssets > 0 ? <KpiCard label="其他資產" value={formatMoney(alternativeAssets, primaryCurrency)} color="var(--ns-chart-4)" /> : null}
          <KpiCard label="負債" value={formatMoney(liabilities, primaryCurrency)} color="var(--ns-chart-5)" tone={liabilities > 0 ? "neg" : undefined} />
          <Card style={{ padding: "13px 16px", display: "flex", flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 4, height: 32, borderRadius: 99, background: "var(--ns-chart-3)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ns-eyebrow" style={{ fontSize: 10 }}>本月現金流</div>
              <div className={monthNet >= 0 ? "pos" : "neg"} style={{
                fontSize: "clamp(13px, 1.4vw, 18px)",
                fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums",
                fontWeight: 500, marginTop: 1,
                whiteSpace: "nowrap", overflow: "hidden",
              }}>
                {monthNet >= 0 ? "+" : "−"}{formatNumber(Math.abs(monthNet))}
              </div>
            </div>
            <div style={{ fontSize: 11.5, textAlign: "right", flexShrink: 0 }}>
              <div className="muted">收 {formatNumber(monthIncome)}</div>
              <div className="muted">支 {formatNumber(monthExpense)}</div>
              {monthIncome > 0 ? <div className="pos mono" style={{ fontSize: 11 }}>儲蓄率 {savingsRate.toFixed(0)}%</div> : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2 · Budget + Upcoming */}
      <div className="ns-dash-row2">
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow={`Budget · ${todayLabel.slice(0, todayLabel.indexOf("月") + 1) || "本月"}`} title="預算進度" action={<Button variant="ghost" size="xs" render={<Link to="/cash-flow/categories" />}>管理分類 →</Button>} />
          {budgetCats.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>本月尚無支出或預算資料。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {budgetCats.map((c) => {
                const pct = c.budget ? Math.min(c.spent / c.budget, 1) : 0;
                const over = c.budget ? c.spent > c.budget : false;
                return (
                  <div key={c.name} style={{ display: "grid", gridTemplateColumns: "84px 1fr 132px", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <div style={{ height: 7, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                      <div style={{ width: `${(c.budget ? pct : 0.5) * 100}%`, height: "100%", background: over ? "var(--ns-neg)" : c.color, borderRadius: 99 }} />
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      {c.budget ? <span className={"num " + (over ? "neg" : "muted")}>{(pct * 100).toFixed(0)}%</span> : <span className="dim">無上限</span>}
                      <span className="dim">·</span>
                      <span className={"num " + (over ? "neg" : "")}>NT${formatNumber(c.spent)}</span>
                    </div>
                  </div>
                );
              })}
              {totalBudget > 0 ? (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--ns-border)", fontSize: 12 }} className="muted">
                  總預算 NT${formatNumber(totalBudget)}{overBudget.length ? ` · ${overBudget.length} 個分類超支` : ""}
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>近期帳單 · 30 天</h3>
            </div>
            {upcoming.length ? <Badge variant="error" className="rounded-full px-2">NT${formatNumber(upcomingTotal)}</Badge> : null}
          </div>
          {upcoming.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "18px 20px" }}>近期沒有排定的週期收支。</div>
          ) : (
            upcoming.map((b, i) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.merchant || b.category}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{accountMap.get(b.accountId)?.name ?? ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 13.5, color: b.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                    {b.entryType === "income" ? "+" : "−"}NT${formatNumber(Math.abs(b.amount))}
                  </div>
                  <div className="mono dim" style={{ fontSize: 11 }}>{b.nextRunDate.slice(5)}</div>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Credit-card payment reminders */}
      {creditReminders.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Credit cards</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>信用卡繳款提醒</h3>
            </div>
            <Badge variant="error" className="rounded-full px-2">NT${formatNumber(creditReminders.reduce((s, r) => s + r.outstanding, 0))}</Badge>
          </div>
          {creditReminders.map((r, i) => {
            const soon = r.daysUntilDue <= 7;
            return (
              <Link key={r.accountId} to="/cash-flow/reconcile/$accountId" params={{ accountId: r.accountId }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>繳款日 {r.dueDate.slice(5)} · {r.daysUntilDue === 0 ? "今天到期" : `還有 ${r.daysUntilDue} 天`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num" style={{ fontSize: 13.5, color: "var(--ns-neg)" }}>−NT${formatNumber(r.outstanding)}</div>
                  <div className="mono" style={{ fontSize: 11, color: soon ? "var(--ns-neg)" : "var(--ns-fg-dim)" }}>{soon ? "即將到期" : "對帳 →"}</div>
                </div>
              </Link>
            );
          })}
        </Card>
      ) : null}

      {/* Outstanding receivables / payables */}
      {settlements.items.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Receivables &amp; payables</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>應收 / 應付未結清</h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {settlements.receivableTotal > 0 ? <Badge variant="outline" className="rounded-full px-2" style={{ color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收 NT${formatNumber(settlements.receivableTotal)}</Badge> : null}
              {settlements.payableTotal > 0 ? <Badge variant="outline" className="rounded-full px-2" style={{ color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付 NT${formatNumber(settlements.payableTotal)}</Badge> : null}
            </div>
          </div>
          {settlements.items.slice(0, 5).map((item, i) => (
            <Link key={item.id} to="/cash-flow" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
              <Badge variant="outline" className="rounded-full" style={{ color: item.kind === "receivable" ? "var(--ns-chart-3)" : "var(--ns-chart-5)", borderColor: item.kind === "receivable" ? "var(--ns-chart-3)" : "var(--ns-chart-5)" }}>{item.kind === "receivable" ? "應收" : "應付"}</Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.counterparty || item.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{item.date.slice(0, 10)}</div>
              </div>
              <div className="num" style={{ fontSize: 13.5, color: item.kind === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                {item.kind === "receivable" ? "+" : "−"}NT${formatNumber(toPrimary(item.amount, item.currency) ?? item.amount)}
              </div>
            </Link>
          ))}
        </Card>
      ) : null}

      {/* Recurring investments due — top up the 交割款 */}
      {dueRecurringInvestments.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recurring investments</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>定期定額提醒</h3>
            </div>
            <Button variant="ghost" size="xs" render={<Link to="/investments" />}>前往投資 →</Button>
          </div>
          {dueRecurringInvestments.map((r, i) => {
            const cash = (r.mode === "fixedShares" ? (r.quantity || 0) * (r.price || 0) : (r.amount || 0)) + (r.fee || 0);
            return (
              <Link key={r.id} to="/investments" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
                <Badge variant="outline" className="rounded-full" style={{ color: "var(--ns-warn)", borderColor: "var(--ns-warn)" }}>{r.mode === "fixedShares" ? "定期定股" : "定期定額"}</Badge>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || r.ticker}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.nextRunDate.slice(5)} 投入 · 請備妥交割款</div>
                </div>
                <div className="num" style={{ fontSize: 13.5, color: "var(--ns-neg)" }}>−NT${formatNumber(Math.round(cash))}</div>
              </Link>
            );
          })}
        </Card>
      ) : null}

      {/* Row 3 · Allocation + Goals + Market */}
      <div className="ns-dash-row3">
        {/* Allocation */}
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow="Asset allocation" title="資產配置" />
          {allocation.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>尚無資產可顯示配置。</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={42} outerRadius={60} stroke="none" paddingAngle={2}>
                      {allocation.map((a) => <Cell key={a.label} fill={a.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(value, primaryCurrency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }} itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 6 }}>
                {allocation.map((a) => (
                  <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, borderBottom: "1px solid var(--ns-border)", paddingBottom: 5 }}>
                    <span style={{ width: 8, height: 8, background: a.color, borderRadius: 2, flexShrink: 0 }} />
                    {/* Single-line with ellipsis; the legend now takes the card's
                        full width (wraps below the donut on narrow cards) so short
                        class labels never split mid-character. */}
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.label}>{a.label}</span>
                    {/* Compact (萬/億 · K/M) so the value never forces the label to
                        wrap vertically on a narrow card. */}
                    <span className="num muted" style={{ fontSize: 11, flexShrink: 0 }} title={formatMoney(a.value, primaryCurrency)}>{formatCompactMoney(a.value, primaryCurrency)}</span>
                    <span className="num" style={{ minWidth: 42, textAlign: "right", flexShrink: 0 }}>{a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Goals */}
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow="Goals" title={`${goals.length} active`} action={<Button variant="ghost" size="xs" render={<Link to="/goals" />}>全部 →</Button>} />
          {goals.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>還沒有設定目標。<Link to="/goals" style={{ color: "var(--ns-accent)" }}>建立 FIRE 目標 →</Link></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {goals.map((g) => (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                    {g.pct >= 100 ? <Badge variant="success" size="sm" className="rounded-full px-2">達成</Badge> : null}
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden", marginBottom: 5 }}>
                    <div style={{ width: `${Math.min(g.pct, 100)}%`, height: "100%", background: "var(--ns-accent)", borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span className="mono" style={{ color: "var(--ns-accent)" }}>{g.pct.toFixed(1)}%</span>
                    <span className="mono muted">目標 {formatMoney(g.target, primaryCurrency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Market FX */}
        <Card>
          <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--ns-border)" }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Market</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>匯率</h3>
          </div>
          {fxRates.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, padding: "16px 18px" }}>尚無匯率資料。</div>
          ) : (
            fxRates.map((fx) => (
              <div key={fx.pair} style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--ns-border)" }}>
                <span className="mono" style={{ fontSize: 12.5, flex: 1 }}>{fx.pair}</span>
                <span className="num" style={{ fontSize: 13.5, fontWeight: 500 }}>{fx.rate.toFixed(4)}</span>
              </div>
            ))
          )}
        </Card>

        {/* Top Movers */}
        {heldAssetCount > 0 ? <TopMoversCard movers={movers} moversMax={moversMax} /> : null}
      </div>

      {/* Row 4 · Recent activity */}
      <Card>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recent activity</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>最近交易</h3>
          </div>
          <Button variant="ghost" size="xs" render={<Link to="/cash-flow" />}>查看全部 →</Button>
        </div>
        {recent.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: "18px 22px" }}>還沒有交易紀錄。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
            {recent.map((r, i) => (
              <div key={r.id} className="ns-row" style={{ gap: 12, paddingLeft: 22, paddingRight: 22, borderLeft: i % 2 === 1 ? "1px solid var(--ns-border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || r.category || (r.entryType === "transfer" ? "轉帳" : "交易")}</div>
                  <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.date.slice(5).replace("T", " ")} · {accountMap.get(r.accountId)?.name ?? ""}</div>
                </div>
                <div className={"num " + (r.amount >= 0 ? "pos" : "")} style={{ fontSize: 14, minWidth: 88, textAlign: "right" }}>
                  {r.amount >= 0 ? "+" : "−"}NT${formatNumber(Math.abs(r.amount))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function KpiCard({ label, value, color, tone }: { label: string; value: string; color: string; tone?: "neg" }) {
  return (
    <Card style={{ padding: "13px 16px", display: "flex", flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{ width: 4, height: 32, borderRadius: 99, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ns-eyebrow" style={{ fontSize: 10 }}>{label}</div>
        <div className={tone === "neg" ? "neg" : ""} style={{
          fontSize: "clamp(13px, 1.4vw, 18px)",
          fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums",
          fontWeight: 500, marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{value}</div>
      </div>
    </Card>
  );
}

function fmtPctSigned(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

function PortfolioStrip({ period, data, benchmarkTicker }: {
  period: StripPeriod;
  data: { portfolio: number | null; benchmark: number | null; alpha: number | null };
  benchmarkTicker: string;
}) {
  const cells = [
    { label: "投資組合", val: data.portfolio, color: data.portfolio == null ? "var(--ns-fg-muted)" : data.portfolio >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" },
    { label: `${benchmarkTicker} 指標`, val: data.benchmark, color: "var(--ns-fg-muted)" },
    { label: "Alpha", val: data.alpha, color: data.alpha == null ? "var(--ns-fg-muted)" : data.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-neg)" },
  ];
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>投資組合 vs Benchmark · {period}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden" }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{ padding: "10px 14px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
            <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
            <div className="num" style={{ fontSize: 19, fontWeight: 600, fontFamily: "var(--ns-font-mono)", color: c.color, fontVariantNumeric: "tabular-nums" }}>{fmtPctSigned(c.val)}</div>
          </div>
        ))}
      </div>
      {data.portfolio == null ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          需要更多每日股價才能計算期間報酬。<Link to="/investments" style={{ color: "var(--ns-accent)" }}>前往回補 →</Link>
        </div>
      ) : data.benchmark == null ? (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          尚無 {benchmarkTicker} 歷史股價，無法比較 benchmark。<Link to="/investments" style={{ color: "var(--ns-accent)" }}>前往投資 →</Link>
        </div>
      ) : null}
    </div>
  );
}

function TopMoversCard({ movers, moversMax }: { movers: Mover[]; moversMax: number }) {
  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Today</div>
          <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>Top Movers</h3>
        </div>
        <Button variant="ghost" size="xs" render={<Link to="/investments" />}>詳細 →</Button>
      </div>
      {movers.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: "16px 18px" }}>回補歷史股價後顯示當日漲跌幅。</div>
      ) : (
        movers.map((m, i) => {
          const isPos = m.changePercent >= 0;
          const barPct = (Math.abs(m.changePercent) / moversMax) * 100;
          return (
            <Link
              key={m.ticker}
              to="/holdings/$ticker"
              params={{ ticker: m.ticker }}
              style={{ display: "grid", gridTemplateColumns: "14px 1fr 56px", alignItems: "center", gap: 8, padding: "9px 14px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}
            >
              <span className="mono dim" style={{ fontSize: 10, textAlign: "right" }}>{i + 1}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ marginBottom: 3, display: "flex", justifyContent: "space-between", gap: 6, alignItems: "baseline" }}>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.ticker}</span>
                  <span className="muted" style={{ fontSize: 10.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 84 }}>{m.name}</span>
                </div>
                <div style={{ height: 3, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: isPos ? 0 : undefined, right: isPos ? undefined : 0, width: `${barPct}%`, height: "100%", borderRadius: 99, background: isPos ? "var(--ns-pos)" : "var(--ns-neg)" }} />
                </div>
              </div>
              <span className={"num " + (isPos ? "pos" : "neg")} style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right", fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums" }}>
                {isPos ? "+" : "−"}{Math.abs(m.changePercent).toFixed(2)}%
              </span>
            </Link>
          );
        })
      )}
    </Card>
  );
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>
        <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>{title}</h3>
      </div>
      {action ?? null}
    </div>
  );
}

function greetingForHour(hour: number) {
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早安";
  if (hour < 14) return "午安";
  if (hour < 18) return "下午好";
  return "晚安";
}

function goalTarget(goal: FinancialGoal): number {
  if (goal.targetAmount && goal.targetAmount > 0) return goal.targetAmount;
  if (goal.annualSpending > 0 && goal.withdrawalRate > 0) return goal.annualSpending / (goal.withdrawalRate / 100);
  return 0;
}

function buildNetWorthTrend(
  accounts: Account[],
  ledgerRows: LedgerTransaction[],
  assets: PortfolioAsset[],
  investments: InvestmentRecord[],
  quotes: StoredMarketQuote[],
  settings: AppSettings | undefined,
  dailyFxRates: DailyFxRate[],
) {
  const { toPrimary } = createFxConverter(settings, dailyFxRates);
  const settledRows = ledgerRows
    .filter((row) => row.settlementStatus === "settled")
    .sort((a, b) => a.date.localeCompare(b.date));
  const startCandidates = [
    ...accounts.map((account) => dateOnly(account.createdAt)),
    ...assets.map((asset) => dateOnly(asset.acquisitionDate || asset.createdAt)),
  ].filter(Boolean);
  if (startCandidates.length === 0 && settledRows.length === 0) return [];

  // Pick bucket granularity from the overall span: histories shorter than ~2
  // calendar months bucket by day, so a single month of activity still draws a
  // real curve instead of collapsing to one monthly point (B5). Longer
  // histories stay monthly to keep the point count sane.
  const earliest = (startCandidates.length ? [...startCandidates].sort()[0] : dateOnly(settledRows[0].date));
  const earliestDate = new Date(`${earliest}T00:00:00`);
  const now = new Date();
  const spanMonths = (now.getFullYear() - earliestDate.getFullYear()) * 12 + (now.getMonth() - earliestDate.getMonth());
  const granularity: "day" | "month" = spanMonths >= 2 ? "month" : "day";
  const keyOf = (date: string) => (granularity === "month" ? monthKey(date) : dateOnly(date));
  const labelOf = (key: string) => (granularity === "month" ? formatMonth(key) : formatDay(key));
  // Sortable ISO date per bucket so the period control can slice the chart.
  const isoOf = (key: string) => (granularity === "month" ? `${key}-01` : key);

  // Cash side: opening balances + every settled ledger movement (which already
  // includes the cash leg of investment buys/sells).
  const cashDelta = new Map<string, number>();
  for (const account of accounts) {
    const joinedDate = dateOnly(account.createdAt);
    if (!joinedDate) continue;
    const key = keyOf(joinedDate);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(account.openingBalance, account.currency, joinedDate));
  }
  for (const row of settledRows) {
    const key = keyOf(row.date);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(row.amount, row.currency, row.date));
  }

  // Holdings side: value every holding at its *current* market price across the
  // whole series (mark-to-market throughout). Paired with the cash leg of each
  // buy/sell, the running holdings line ends exactly at today's market value, so
  // the trend closes on the hero net-worth number with no "flat cost basis then
  // jump to market" spike. We lack historical prices, so older points apply
  // today's price retroactively — the standard, far-less-misleading fallback.
  const quoteFor = (ticker: string) => quotes.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of investments) {
    if (record.deletedAt !== null) continue;
    recordsByAsset.set(record.assetId, [...(recordsByAsset.get(record.assetId) ?? []), record]);
  }
  const holdingsValueDelta = new Map<string, number>();
  for (const asset of assets) {
    const quote = quoteFor(asset.ticker);
    const pricePerShare = quote ? quote.price : asset.averageCost;
    const currency = quote?.currency ?? asset.currency;
    const assetValue = toPrimary(pricePerShare * asset.totalQuantity, currency);

    const qtyTimeline = buildQuantityTimeline(recordsByAsset.get(asset.id) ?? []);
    let accrued = 0;
    let lastKey = keyOf(dateOnly(asset.acquisitionDate || asset.createdAt));
    for (const { date, delta } of qtyTimeline) {
      const key = keyOf(date);
      const valueDelta = toPrimary(delta * pricePerShare, currency);
      holdingsValueDelta.set(key, (holdingsValueDelta.get(key) ?? 0) + valueDelta);
      accrued += valueDelta;
      lastKey = key;
    }
    // Reconcile rounding and manual holdings (no records → empty timeline) so the
    // accrued series lands exactly on the asset's current market value.
    const residual = assetValue - accrued;
    if (Math.abs(residual) > 1e-6) {
      holdingsValueDelta.set(lastKey, (holdingsValueDelta.get(lastKey) ?? 0) + residual);
    }
  }

  const startKey = keyOf(earliest);
  const orderedKeys = [...new Set([startKey, ...cashDelta.keys(), ...holdingsValueDelta.keys()])].sort();

  let cashRunning = 0;
  let holdingsRunning = 0;
  const timeline: Array<{ date: string; value: number; iso: string }> = [];
  for (const key of orderedKeys) {
    cashRunning += cashDelta.get(key) ?? 0;
    holdingsRunning += holdingsValueDelta.get(key) ?? 0;
    timeline.push({ date: labelOf(key), value: cashRunning + holdingsRunning, iso: isoOf(key) });
  }

  // The series already ends at today's net worth, so we don't bolt on a separate
  // "現在" point that would duplicate today's bucket. Only extend a flat segment
  // to "現在" when the last bucket predates today; a lone bucket gets a second
  // point so the chart still draws a line (B5).
  const todayKey = keyOf(dateOnly(now.toISOString()));
  const lastKey = orderedKeys[orderedKeys.length - 1];
  if (timeline.length === 1 || (timeline.length > 1 && lastKey !== todayKey)) {
    timeline.push({ date: "現在", value: cashRunning + holdingsRunning, iso: dateOnly(now.toISOString()) });
  }
  return timeline;
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 7);
  return date.toLocaleDateString("zh-TW", { year: "numeric", month: "short" });
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(5, 10);
  return date.toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}
