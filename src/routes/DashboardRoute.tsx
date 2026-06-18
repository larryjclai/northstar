import { ArrowDown, ArrowsClockwise, ArrowUp, ChartBar } from "@phosphor-icons/react";
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
import { openOnboarding } from "../components/OnboardingOverlay";
import { Badge } from "../components/coss/badge";
import { Button } from "../components/coss/button";
import { Card } from "../components/coss/card";
import { Skeleton } from "../components/coss/skeleton";
import {
  assetTypeLabels,
  buildDataHealthReport,
  buildNetWorthBreakdown,
  buildQuantityTimeline,
  buildCreditCardReminders,
  buildOutstandingSettlements,
  buildPortfolioValueSeries,
  buildBenchmarkSeries,
  buildDailyPriceLookup,
  priceAssetOnDate,
  holdingsMarketValue,
  alignByDate,
  cumulativeReturnPct,
  dayChangeMovers,
  resolveAssetName,
  buildDividendAnalysis,
  trailingMonthlyExpense,
  coverageRatioPct,
  runwayMonths,
  resolveTargetAmount,
  createFxConverter,
  formatMoney,
  formatCompactMoney,
  formatNumber,
  isNeutralLedgerRow,
  type AnalyticsPosition,
  type Mover,
  type Account,
  type AppSettings,
  type DailyPrice,
  type DailyFxRate,
  type FinancialGoal,
  type InvestmentRecord,
  type LedgerTransaction,
  type PortfolioAsset,
  todayInTimezone,
} from "../domain";
import { useRefreshQuotes, useRefreshFxRates, useRefreshDailyPrices } from "../features/market-data/useMarketRefresh";
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { useUiPreferences } from "../state/uiPreferences";
import { buildQuoteLookup, findQuoteForTicker, quoteLookupKeys } from "../domain/marketSymbols";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { SquaresFour } from "@phosphor-icons/react";

type StripPeriod = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y" | "All";
const STRIP_PERIODS: StripPeriod[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];

/** Dashboard cards the user can hide via 編輯版面 (net-worth hero + KPI stay). */
const DASHBOARD_CARDS: Array<{ key: string; label: string }> = [
  { key: "budget", label: "預算進度" },
  { key: "upcoming", label: "近期帳單" },
  { key: "creditCards", label: "信用卡繳款提醒" },
  { key: "settlements", label: "應收 / 應付" },
  // 定期定額提醒 hidden until the DCA workflow is finalised (see InvestmentsRoute).
  { key: "allocation", label: "資產配置" },
  { key: "goals", label: "目標" },
  { key: "market", label: "匯率" },
  { key: "recentActivity", label: "最近交易" },
  { key: "topMovers", label: "今日漲跌" },
];

/** Inclusive start date for a net-worth range, relative to `end` (today). */
function stripStartDate(period: StripPeriod, end: string): string {
  if (period === "All") return "1900-01-01";
  if (period === "YTD") return `${end.slice(0, 4)}-01-01`;
  const days: Record<Exclude<StripPeriod, "YTD" | "All">, number> = { "1D": 1, "1W": 7, "1M": 31, "3M": 92, "1Y": 365, "5Y": 1825 };
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
  const { accounts, ledger, assets, quotes, settings, dailyFxRates, dailyPrices, manualPriceSnapshots, recurring, financialGoals, investments, isInitialLoading, isError, error, refetchAll } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const refreshFxRates = useRefreshFxRates();
  const refreshDailyPrices = useRefreshDailyPrices();
  const timezone = useUiPreferences((state) => state.timezone);
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const benchmarkTicker = useUiPreferences((state) => state.benchmarkTicker);
  const dashboardHiddenCards = useUiPreferences((state) => state.dashboardHiddenCards);
  const setDashboardHiddenCards = useUiPreferences((state) => state.setDashboardHiddenCards);
  const northstarMetric = useUiPreferences((state) => state.northstarMetric);
  const setNorthstarMetric = useUiPreferences((state) => state.setNorthstarMetric);
  const cardVisible = (key: string) => !dashboardHiddenCards.includes(key);
  const toggleCard = (key: string) => {
    setDashboardHiddenCards(
      dashboardHiddenCards.includes(key)
        ? dashboardHiddenCards.filter((k) => k !== key)
        : [...dashboardHiddenCards, key],
    );
  };
  const [stripPeriod, setStripPeriod] = useState<StripPeriod>("1M");
  const queryClient = useQueryClient();
  const toast = useToast();
  // Current month for the cash-flow KPI and budget card. Recomputed each
  // render; there is intentionally no month switcher on the dashboard.
  const monthKey = new Date().toISOString().slice(0, 7);
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
  const investmentRows = investments.data ?? [];
  const goalRows = financialGoals.data ?? [];

  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);

  // "更新" refreshes stock quotes and FX rates together (B6).
  const refreshingMarket = refreshQuotes.isPending || refreshFxRates.isPending || refreshDailyPrices.isPending;
  async function refreshMarket() {
    if (useDemoMode.getState().active) {
      toast.info("示範模式使用內建行情", { description: "已略過線上更新；結束示範模式後會恢復自動更新。" });
      return;
    }
    const tickers = assetRows.map((a) => a.ticker);
    const pairs = (appSettings?.exchangeRates ?? []).map((r) => ({ from: r.from, to: r.to || primaryCurrency }));
    const tasks: Promise<unknown>[] = [];
    if (tickers.length) tasks.push(refreshQuotes.mutateAsync(tickers));
    if (tickers.length) tasks.push(refreshDailyPrices.mutateAsync({ tickers, range: "1y" }));
    if (pairs.length) tasks.push(refreshFxRates.mutateAsync({ pairs, range: "1y" }));
    if (!tasks.length) return;
    const results = await Promise.allSettled(tasks);
    if (results.some((r) => r.status === "rejected")) toast.error("部分更新失敗");
    else toast.success("已更新股價與匯率");
  }

  const [healthExpanded, setHealthExpanded] = useState(false);

  // Single source of truth for "today" used by valuations and health checks.
  // Declared here (before the useMemos that depend on it) so references are safe.
  const todayIso = new Date().toISOString().slice(0, 10);

  const dataHealthReport = useMemo(
    () =>
      buildDataHealthReport({
        accounts: accountRows,
        ledger: ledgerRows,
        assets: assetRows,
        quotes: quoteRows.map((q) => ({ symbol: q.symbol, updatedAt: q.updatedAt })),
        dailyPrices: dailyPriceRows,
        dailyFxRates: fxHistory,
        settings: appSettings,
        todayIso: todayIso,
      }),
    [accountRows, ledgerRows, assetRows, quoteRows, dailyPriceRows, fxHistory, appSettings, todayIso],
  );
  const filteredAccounts = selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount);

  const quoteLookup = useMemo(() => buildQuoteLookup(quoteRows), [quoteRows]);
  const quoteFor = (ticker: string) => findQuoteForTicker(quoteLookup, ticker);
  const filteredAssets = selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount);

  // Single valuation context shared by the KPI market value, the allocation
  // donut, and the net-worth trend endpoint so all three agree: live quote →
  // latest daily close → average cost (see domain/valuation).
  // (todayIso is declared earlier, before dataHealthReport, so both can share it.)
  const dailyPriceLookup = useMemo(() => buildDailyPriceLookup(dailyPriceRows), [dailyPriceRows]);
  const marketValue = holdingsMarketValue(filteredAssets, todayIso, toPrimary, {
    todayIso,
    dailyPriceLookup,
    quoteFor,
  });

  // Reconciling partition: 資產 − 負債 = 淨值 always holds.
  const breakdown = buildNetWorthBreakdown(filteredAccounts, marketValue, toPrimary);
  const availableCash = breakdown.liquidCash;
  const alternativeAssets = breakdown.alternativeAssets;
  const liabilities = breakdown.liabilities;
  const netWorth = breakdown.netWorth;

  const monthRows = ledgerRows.filter((row) => row.date.startsWith(monthKey) && row.settlementStatus === "settled" && !isNeutralLedgerRow(row) && (selectedAccount === "all" || row.accountId === selectedAccount));
  const monthIncome = monthRows.filter((row) => row.entryType === "income").reduce((sum, row) => sum + toPrimary(Math.max(0, row.amount), row.currency, row.date), 0);
  // Signed (−amount): expense amounts are negative → positive spend; a refund
  // (positive-amount expense) nets back out instead of inflating spend.
  const monthExpense = monthRows.filter((row) => row.entryType === "expense").reduce((sum, row) => sum + toPrimary(-row.amount, row.currency, row.date), 0);
  const monthNet = monthIncome - monthExpense;
  // Savings rate stays honest in deficit months: with no income but real
  // spending we surface a negative rate (net flow over spend) instead of a
  // flattering 0%.
  const savingsRate = monthIncome > 0
    ? (monthNet / monthIncome) * 100
    : monthExpense > 0
      ? (monthNet / monthExpense) * 100
      : 0;

  // Northstar bottom-line metrics —————————————————————————————————————————
  // Trailing-3-month average monthly expense (settled, non-neutral, all-account).
  // We use all ledgerRows (not filtered by selectedAccount) so the per-metric
  // denominators are portfolio-wide and comparable across account switches.
  const trailingMonthlyExp = useMemo(
    () => trailingMonthlyExpense(ledgerRows, toPrimary, todayIso, 3),
    [ledgerRows, toPrimary, todayIso],
  );

  // TTM passive income (dividends) for coverage ratio.
  const dividendAnalysis = useMemo(() => {
    const assetMeta = new Map(assetRows.map((a) => [a.id, { ticker: a.ticker, currency: a.currency }]));
    return buildDividendAnalysis({
      records: investmentRows,
      assetMeta,
      toPrimary,
      currentMarketValue: marketValue,
      asOf: todayIso,
    });
  }, [investmentRows, assetRows, toPrimary, marketValue, todayIso]);

  const coveragePct = useMemo(
    () => coverageRatioPct(dividendAnalysis.ttmTotal, trailingMonthlyExp * 12),
    [dividendAnalysis.ttmTotal, trailingMonthlyExp],
  );

  // Liquid cash for runway: use calculateAvailableCash-equivalent from breakdown
  // (breakdown.liquidCash already uses the same exclude-loan/credit/alternative logic
  // for positive balances, which is the same effective set as calculateAvailableCash
  // when all accounts are included). We use the all-account value regardless of
  // the account filter, since runway is a portfolio-wide safety metric.
  const allAccountsLiquidCash = useMemo(() => {
    return accountRows.reduce((sum: number, account) => {
      if (account.deletedAt !== null) return sum;
      if (account.type === "loan" || account.type === "credit" || account.type === "alternative") return sum;
      return sum + toPrimary(Math.max(0, account.balance), account.currency);
    }, 0);
  }, [accountRows, toPrimary]);

  const runwayMo = useMemo(
    () => runwayMonths(allAccountsLiquidCash, trailingMonthlyExp),
    [allAccountsLiquidCash, trailingMonthlyExp],
  );

  // FIRE progress: first active goal's percent (same as goals card logic).
  const firstGoalPct = useMemo(() => {
    const activeGoal = goalRows.find((g) => g.deletedAt === null);
    if (!activeGoal) return null;
    const target = goalTarget(activeGoal);
    return target > 0 ? Math.min((netWorth / target) * 100, 100) : null;
  }, [goalRows, netWorth]);

  // Metric registry — all values computed above, just assembled here.
  const METRIC_REGISTRY: Array<{
    key: string;
    label: string;
    value: number | null;
    display: string;
    sub: string;
  }> = [
    {
      key: "netWorth",
      label: "淨值",
      value: netWorth,
      display: formatMoney(netWorth, primaryCurrency),
      sub: "",
    },
    {
      key: "savingsRate",
      label: "儲蓄率",
      value: savingsRate,
      display: `${savingsRate.toFixed(1)}%`,
      sub: monthIncome > 0 ? `本月收入 ${formatMoney(monthIncome, primaryCurrency)}` : "本月尚無收入",
    },
    {
      key: "coverageRatio",
      label: "被動收入覆蓋率",
      value: coveragePct,
      display: coveragePct !== null ? `${coveragePct.toFixed(1)}%` : "—",
      sub: coveragePct !== null
        ? `被動收入已覆蓋 ${coveragePct.toFixed(1)}% 的年開支`
        : "尚無費用資料",
    },
    {
      key: "runway",
      label: "流動底氣",
      value: runwayMo,
      display: runwayMo !== null ? `${runwayMo.toFixed(1)} 個月` : "—",
      sub: runwayMo !== null
        ? `流動資產可支撐約 ${Math.floor(runwayMo)} 個月`
        : "尚無費用資料",
    },
    {
      key: "fireProgress",
      label: "FIRE 進度",
      value: firstGoalPct,
      display: firstGoalPct !== null ? `${firstGoalPct.toFixed(1)}%` : "—",
      sub: firstGoalPct !== null ? "相對於第一個 FIRE 目標" : "尚未設定 FIRE 目標",
    },
  ];

  const activeMetric = METRIC_REGISTRY.find((m) => m.key === northstarMetric) ?? METRIC_REGISTRY[0];
  // ————————————————————————————————————————————————————————————————————————

  const trend = useMemo(
    () => buildNetWorthTrend(
      selectedAccount === "all" ? accountRows : accountRows.filter(a => a.id === selectedAccount),
      selectedAccount === "all" ? ledgerRows : ledgerRows.filter(r => r.accountId === selectedAccount),
      selectedAccount === "all" ? assetRows : assetRows.filter(a => a.accountId === selectedAccount),
      selectedAccount === "all" ? investmentRows : investmentRows.filter(r => r.linkedAccountId === selectedAccount),
      quoteRows, dailyPriceRows, appSettings, fxHistory
    ),
    [accountRows, ledgerRows, assetRows, investmentRows, quoteRows, dailyPriceRows, appSettings, fxHistory],
  );
  // The range control both slices the chart and drives the headline delta, so
  // the +/- figure next to net worth always reflects the *selected* window
  // (start-of-window → now) instead of a fixed month-over-month step. A synthetic
  // anchor point at the window start (carrying the last value before it) keeps
  // the line spanning the full range even across quiet stretches.
  const rangeView = useMemo(() => {
    if (trend.length < 2) return { points: trend, change: 0, pct: 0 };
    if (stripPeriod === "All") {
      const first = trend[0].value;
      const last = trend[trend.length - 1].value;
      return { points: trend, change: last - first, pct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0 };
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const startIso = stripStartDate(stripPeriod, todayIso);
    const within = trend.filter((p) => p.iso >= startIso);

    // Value as of the window start = last point on/before startIso (carry-forward).
    let carried: number | null = null;
    for (let i = trend.length - 1; i >= 0; i--) {
      if (trend[i].iso <= startIso) { carried = trend[i].value; break; }
    }

    let points = within;
    if (within.length > 0 && within[0].iso !== startIso && carried !== null) {
      points = [{ date: formatDay(startIso), value: carried, iso: startIso }, ...within];
    }
    if (points.length < 2) points = trend.slice(-2);

    const startValue = points[0].value;
    const endValue = points[points.length - 1].value;
    const change = endValue - startValue;
    const pct = startValue !== 0 ? (change / Math.abs(startValue)) * 100 : 0;
    return { points, change, pct };
  }, [trend, stripPeriod]);
  const visibleTrend = rangeView.points;
  const momChange = rangeView.change;
  const momPct = rangeView.pct;

  const hasAnyData = accountRows.length > 0 || ledgerRows.length > 0 || assetRows.length > 0;

  // Budget health — current-month expense per category vs configured budget.
  const budgetCats = useMemo(() => {
    const spendByCat = new Map<string, number>();
    for (const row of monthRows) {
      if (row.entryType !== "expense" || !row.category) continue;
      // Signed (−amount): refunds reduce the category's spend against budget.
      spendByCat.set(row.category, (spendByCat.get(row.category) ?? 0) - toPrimary(row.amount, row.currency, row.date));
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
      const price = priceAssetOnDate(asset, todayIso, { todayIso, dailyPriceLookup, quote: quoteFor(asset.ticker) });
      const value = toPrimary(price.value * asset.totalQuantity, price.currency, todayIso);
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
  }, [filteredAssets, quoteRows, availableCash, alternativeAssets, toPrimary, dailyPriceLookup, todayIso]);

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

  // Today's Top Movers among held tickers. Intraday → live quote vs the prior
  // session's close; after close → today's close vs the prior session's. The
  // reference close always comes from daily_prices (reliable), never the live
  // quote's previousClose (which can be garbage for post-spinoff tickers).
  const heldAssetCount = useMemo(() => assetRows.filter((a) => a.deletedAt === null && a.totalQuantity > 0).length, [assetRows]);
  const movers = useMemo(() => {
    const assetByTicker = new Map(assetRows.map((a) => [a.ticker.toUpperCase(), a]));
    const heldTickers = assetRows.filter((a) => a.deletedAt === null && a.totalQuantity > 0).map((a) => a.ticker);
    const all = dayChangeMovers({
      dailyPrices: dailyPriceRows,
      quotes: quoteRows.map((q) => ({ symbol: q.symbol, price: q.price, marketTime: q.marketTime })),
      heldTickers,
      limit: 1000,
      nameFor: (t) => resolveAssetName(assetByTicker.get(t.toUpperCase()), nameLocale),
    });
    // Top 3 up / top 3 down (best → worst within each column).
    const gainers = all.filter((m) => m.changePercent > 0).slice(0, 3);
    const losers = all.filter((m) => m.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 3);
    return { gainers, losers, count: all.length };
  }, [dailyPriceRows, quoteRows, assetRows, nameLocale]);

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

  // FX rates (latest + previous per pair) for the Market card.
  const fxRates = useMemo(() => {
    const byPair = new Map<string, DailyFxRate[]>();
    for (const row of fxHistory) {
      const key = `${row.from}/${row.to}`;
      const arr = byPair.get(key) ?? [];
      arr.push(row);
      byPair.set(key, arr);
    }
    let rows = [...byPair.entries()].map(([pair, arr]) => {
      arr.sort((a, b) => a.date.localeCompare(b.date));
      const latest = arr[arr.length - 1];
      const prev = arr.length > 1 ? arr[arr.length - 2] : null;
      const changePct = prev && prev.rate ? ((latest.rate - prev.rate) / prev.rate) * 100 : null;
      return { pair, rate: latest.rate, changePct };
    });
    if (rows.length === 0 && appSettings) {
      rows = appSettings.exchangeRates.map((r) => ({ pair: `${r.from}/${r.to}`, rate: r.rate, changePct: null }));
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

  if (isInitialLoading) {
    return (
      <div className="grid gap-5 p-1">
        <Skeleton className="h-[320px]" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[260px]" />
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
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]" style={{ maxWidth: 1180, margin: "0 auto" }}>
      {!dataHealthReport.healthy ? (
        <div
          className="text-body"
          style={{
            padding: "10px 14px",
            borderRadius: "var(--ns-r-md)",
            background: dataHealthReport.errorCount > 0 ? "var(--ns-neg-soft)" : "var(--ns-warn-soft)",
            border: "1px solid var(--ns-border)",
            marginBottom: 14,
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", userSelect: "none" }}
            onClick={() => setHealthExpanded((v) => !v)}
          >
            <span>
              <strong>資料健康：{dataHealthReport.issues.length} 項提醒</strong>
              {!healthExpanded && dataHealthReport.issues.length > 0 ? (
                <span style={{ marginLeft: 8, color: "var(--ns-fg-muted)" }}>{dataHealthReport.issues[0].message}</span>
              ) : null}
            </span>
            <span className="text-caption" style={{ color: "var(--ns-fg-muted)", flexShrink: 0 }}>{healthExpanded ? "收合 ▲" : "展開 ▼"}</span>
          </div>
          {healthExpanded ? (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {dataHealthReport.issues.map((issue) => (
                <div key={issue.id} className="text-xs" style={{ color: issue.severity === "error" ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                  {issue.severity === "error" ? "⚠ " : "· "}{issue.message}
                </div>
              ))}
              <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
                {dataHealthReport.issues.some((i) => i.kind === "missing-fx" || i.kind === "stale-fx") ? (
                  <Link to="/settings" className="text-xs">前往更新匯率</Link>
                ) : null}
                {dataHealthReport.issues.some((i) => i.kind === "missing-price-history" || i.kind === "stale-quote") ? (
                  <Link to="/investments" className="text-xs">前往投資回補</Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : hasAnyData ? (
        // All green → collapse to one quiet line so the feature stays
        // discoverable instead of vanishing entirely.
        <div className="text-xs" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: "var(--ns-r-md)", background: "var(--ns-pos-soft, var(--ns-bg-hover))", border: "1px solid var(--ns-border)", marginBottom: 14, color: "var(--ns-fg-muted)" }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--ns-pos)", flexShrink: 0 }} />
          資料健康：報價、匯率與帳戶餘額都正常。
        </div>
      ) : null}
      {/* Over-budget alert */}
      {overBudget.length > 0 ? (
        <div className="text-body" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--ns-r-md)", background: "var(--ns-neg-soft)", border: "1px solid color-mix(in srgb, var(--ns-neg) 40%, transparent)", marginBottom: 14 }}>
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
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
        </div>
        {/* Account filter + 更新. The single time-range control lives on the net
            worth card (the period segmented control), matching the prototype. */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} style={{ maxWidth: "none" }} />
          <Button variant="outline" className="h-9 shrink-0 sm:h-9" onClick={refreshMarket} loading={refreshingMarket} disabled={refreshingMarket || (assetRows.length === 0 && (appSettings?.exchangeRates?.length ?? 0) === 0)} title="更新持倉報價、匯率與每日歷史股價">
            <ArrowsClockwise size={14} />{refreshingMarket ? "更新中" : "更新行情"}
          </Button>
          {hasAnyData ? (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" className="h-9 shrink-0 sm:h-9" />}>
                <SquaresFour size={14} />版面
              </PopoverTrigger>
              <PopoverContent align="end" style={{ width: 220, padding: 8 }}>
                <div className="ns-eyebrow" style={{ padding: "6px 8px 8px" }}>編輯版面 · 顯示卡片</div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {DASHBOARD_CARDS.map((c) => (
                    <label key={c.key} className="text-body" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: "var(--ns-r-sm)", cursor: "pointer" }}>
                      <input type="checkbox" checked={cardVisible(c.key)} onChange={() => toggleCard(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </div>

      {/* Row 1 · Northstar hero + KPI stack */}
      <div className="ns-dash-row1">
        <Card style={{ padding: 22, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* ── Hero header: eyebrow + value + MoM badge (netWorth only) ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Eyebrow: metric label + currency for money metrics */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div className="ns-eyebrow">
                  {activeMetric.key === "netWorth"
                    ? `Net worth · ${primaryCurrency}`
                    : activeMetric.label}
                </div>
                {/* Metric picker — small inline Popover */}
                <Popover>
                  <PopoverTrigger render={<button
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 7px", borderRadius: "var(--ns-r-sm)",
                      border: "1px solid var(--ns-border)",
                      background: "var(--ns-bg-hover)",
                      color: "var(--ns-fg-muted)",
                      fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    }}
                    title="選擇主要指標"
                  />}>
                    <ChartBar size={11} />北極星指標
                  </PopoverTrigger>
                  <PopoverContent align="start" style={{ width: 200, padding: 8 }}>
                    <div className="ns-eyebrow" style={{ padding: "6px 8px 8px" }}>選擇主要指標</div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {METRIC_REGISTRY.map((m) => (
                        <button
                          key={m.key}
                          className="text-body"
                          onClick={() => setNorthstarMetric(m.key)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            gap: 8, padding: "7px 8px",
                            borderRadius: "var(--ns-r-sm)", cursor: "pointer",
                            background: m.key === northstarMetric ? "var(--ns-bg-hover)" : "transparent",
                            border: "none", width: "100%", textAlign: "left",
                            color: "var(--ns-fg)", fontFamily: "inherit",
                          }}
                        >
                          <span>{m.label}</span>
                          {m.key === northstarMetric ? (
                            <span style={{ color: "var(--ns-accent)", fontSize: 10, fontWeight: 600 }}>✓</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Hero value */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{
                  fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums",
                  fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.025em", fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                  flexShrink: 1,
                }}>
                  {activeMetric.display}
                </span>
                {/* MoM trend badge — only for netWorth (has a history series) */}
                {activeMetric.key === "netWorth" && trend.length >= 2 ? (
                  <>
                    <Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
                      {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                      <span className="num">{momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))} · {Math.abs(momPct).toFixed(2)}%</span>
                    </Badge>
                    <span className="muted text-xs">較上月</span>
                  </>
                ) : null}
              </div>

              {/* Adjusted net worth (only when netWorth hero) */}
              {activeMetric.key === "netWorth" && Math.abs(netSettlement) > 0.5 ? (
                <div className="muted text-xs" style={{ marginTop: 4 }} title="現金基礎淨值加計應收、減去應付">
                  調整後淨值（含應收應付）{" "}
                  <span className="num" style={{ color: "var(--ns-fg)" }}>{formatMoney(adjustedNetWorth, primaryCurrency)}</span>
                  <span style={{ marginLeft: 6 }}>
                    ({netSettlement >= 0 ? "+" : "−"}{formatNumber(Math.abs(netSettlement))})
                  </span>
                </div>
              ) : null}

              {/* Caption for non-netWorth metrics */}
              {activeMetric.key !== "netWorth" && activeMetric.sub ? (
                <div className="muted text-xs" style={{ marginTop: 6 }}>{activeMetric.sub}</div>
              ) : null}
            </div>

            {/* Period control — only shown for netWorth (it drives the trend chart) */}
            {activeMetric.key === "netWorth" && trend.length > 1 ? (
              <SegmentedControl
                value={stripPeriod}
                onChange={setStripPeriod}
                options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
              />
            ) : null}
          </div>

          {/* Trend chart — only for netWorth */}
          {activeMetric.key === "netWorth" ? (
            trend.length > 1 ? (
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
                <span className="muted text-body">
                  {hasAnyData ? "累積幾筆資料後會顯示淨值趨勢。" : "先建立第一個帳戶，Northstar 會開始計算總覽。"}
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Button size="sm" render={<Link to={hasAnyData ? "/cash-flow" : "/accounts"} />}>{hasAnyData ? "去記帳" : "建立帳戶"}</Button>
                  {!hasAnyData ? (
                    <Button size="sm" variant="outline" onClick={loadDemo} loading={demoLoading}>
                      {demoLoading ? "載入中…" : "載入示範資料"}
                    </Button>
                  ) : null}
                  {!hasAnyData ? (
                    <Button size="sm" variant="outline" onClick={openOnboarding}>
                      新手導覽
                    </Button>
                  ) : null}
                </span>
              </div>
            )
          ) : null}

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
                fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums",
                fontWeight: 500, marginTop: 1,
                whiteSpace: "nowrap", overflow: "hidden",
              }}>
                {monthNet >= 0 ? "+" : "−"}{formatNumber(Math.abs(monthNet))}
              </div>
            </div>
            <div className="text-caption" style={{ textAlign: "right", flexShrink: 0 }}>
              <div className="muted">收 {formatNumber(monthIncome)}</div>
              <div className="muted">支 {formatNumber(monthExpense)}</div>
              {monthIncome > 0 ? <div className="pos mono text-caption">儲蓄率 {savingsRate.toFixed(0)}%</div> : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Row 2 · Budget + Upcoming */}
      <div className="ns-dash-row2">
        {cardVisible("budget") ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow={`Budget · ${todayLabel.slice(0, todayLabel.indexOf("月") + 1) || "本月"}`} title="預算進度" action={<Button variant="ghost" size="xs" render={<Link to="/cash-flow/categories" />}>管理分類 →</Button>} />
          {budgetCats.length === 0 ? (
            <div className="muted text-body">本月尚無支出或預算資料。</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {budgetCats.map((c) => {
                const pct = c.budget ? Math.min(c.spent / c.budget, 1) : 0;
                const over = c.budget ? c.spent > c.budget : false;
                return (
                  <div key={c.name} style={{ display: "grid", gridTemplateColumns: "84px 1fr 132px", gap: 10, alignItems: "center" }}>
                    <span className="text-body" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                    <div style={{ height: 7, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                      <div style={{ width: `${(c.budget ? pct : 0.5) * 100}%`, height: "100%", background: over ? "var(--ns-neg)" : c.color, borderRadius: 99 }} />
                    </div>
                    <div className="text-xs" style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 4 }}>
                      {c.budget ? <span className={"num " + (over ? "neg" : "muted")}>{(pct * 100).toFixed(0)}%</span> : <span className="dim">無上限</span>}
                      <span className="dim">·</span>
                      <span className={"num " + (over ? "neg" : "")}>NT${formatNumber(c.spent)}</span>
                    </div>
                  </div>
                );
              })}
              {totalBudget > 0 ? (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--ns-border)" }} className="muted text-xs">
                  總預算 NT${formatNumber(totalBudget)}{overBudget.length ? ` · ${overBudget.length} 個分類超支` : ""}
                </div>
              ) : null}
            </div>
          )}
        </Card>
        ) : null}

        {cardVisible("upcoming") ? (
        <Card>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
              <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>近期帳單 · 30 天</h3>
            </div>
            {upcoming.length ? <Badge variant="error" className="rounded-full px-2">NT${formatNumber(upcomingTotal)}</Badge> : null}
          </div>
          {upcoming.length === 0 ? (
            <div className="muted text-body" style={{ padding: "18px 20px" }}>近期沒有排定的週期收支。</div>
          ) : (
            upcoming.map((b, i) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-[13.5px]" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.merchant || b.category}</div>
                  <div className="muted text-caption" >{accountMap.get(b.accountId)?.name ?? ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num text-[13.5px]" style={{ color: b.entryType === "income" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                    {b.entryType === "income" ? "+" : "−"}NT${formatNumber(Math.abs(b.amount))}
                  </div>
                  <div className="mono dim text-caption">{b.nextRunDate.slice(5)}</div>
                </div>
              </div>
            ))
          )}
        </Card>
        ) : null}
      </div>

      {/* Credit-card payment reminders */}
      {cardVisible("creditCards") && creditReminders.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Credit cards</div>
              <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>信用卡繳款提醒</h3>
            </div>
            <Badge variant="error" className="rounded-full px-2">NT${formatNumber(creditReminders.reduce((s, r) => s + r.outstanding, 0))}</Badge>
          </div>
          {creditReminders.map((r, i) => {
            const soon = r.daysUntilDue <= 7;
            return (
              <Link key={r.accountId} to="/cash-flow/reconcile/$accountId" params={{ accountId: r.accountId }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-[13.5px]" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div className="muted text-caption">繳款日 {r.dueDate.slice(5)} · {r.daysUntilDue === 0 ? "今天到期" : `還有 ${r.daysUntilDue} 天`}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="num text-[13.5px]" style={{ color: "var(--ns-neg)" }}>−NT${formatNumber(r.outstanding)}</div>
                  <div className="mono text-caption" style={{ color: soon ? "var(--ns-neg)" : "var(--ns-fg-dim)" }}>{soon ? "即將到期" : "對帳 →"}</div>
                </div>
              </Link>
            );
          })}
        </Card>
      ) : null}

      {/* Outstanding receivables / payables */}
      {cardVisible("settlements") && settlements.items.length > 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Receivables &amp; payables</div>
              <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>應收 / 應付未結清</h3>
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
                <div className="text-[13.5px]" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.counterparty || item.name}</div>
                <div className="muted text-caption">{item.date.slice(0, 10)}</div>
              </div>
              <div className="num text-[13.5px]" style={{ color: item.kind === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                {item.kind === "receivable" ? "+" : "−"}NT${formatNumber(toPrimary(item.amount, item.currency) ?? item.amount)}
              </div>
            </Link>
          ))}
        </Card>
      ) : null}

      {/* Recurring investments due — top up the 交割款 */}
      {/* Row 3 · Allocation + Goals + Market */}
      <div className="ns-dash-row3">
        {/* Allocation */}
        {cardVisible("allocation") ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow="Asset allocation" title="資產配置" />
          {allocation.length === 0 ? (
            <div className="muted text-body">尚無資產可顯示配置。</div>
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
                  <div key={a.label} className="text-xs" style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--ns-border)", paddingBottom: 5 }}>
                    <span style={{ width: 8, height: 8, background: a.color, borderRadius: 2, flexShrink: 0 }} />
                    {/* Single-line with ellipsis; the legend now takes the card's
                        full width (wraps below the donut on narrow cards) so short
                        class labels never split mid-character. */}
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.label}>{a.label}</span>
                    {/* Compact (萬/億 · K/M) so the value never forces the label to
                        wrap vertically on a narrow card. */}
                    <span className="num muted text-caption" style={{ flexShrink: 0 }} title={formatMoney(a.value, primaryCurrency)}>{formatCompactMoney(a.value, primaryCurrency)}</span>
                    <span className="num" style={{ minWidth: 42, textAlign: "right", flexShrink: 0 }}>{a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
        ) : null}

        {/* Goals */}
        {cardVisible("goals") ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow="Goals" title={`${goals.length} active`} action={<Button variant="ghost" size="xs" render={<Link to="/goals" />}>全部 →</Button>} />
          {goals.length === 0 ? (
            <div className="muted text-body">還沒有設定目標。<Link to="/goals" style={{ color: "var(--ns-accent)" }}>建立 FIRE 目標 →</Link></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {goals.map((g) => (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="text-body" style={{ fontWeight: 500 }}>{g.name}</span>
                    {g.pct >= 100 ? <Badge variant="success" size="sm" className="rounded-full px-2">達成</Badge> : null}
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden", marginBottom: 5 }}>
                    <div style={{ width: `${Math.min(g.pct, 100)}%`, height: "100%", background: "var(--ns-accent)", borderRadius: 99 }} />
                  </div>
                  <div className="text-caption" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="mono" style={{ color: "var(--ns-accent)" }}>{g.pct.toFixed(1)}%</span>
                    <span className="mono muted">目標 {formatMoney(g.target, primaryCurrency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        ) : null}

        {/* Market FX */}
        {cardVisible("market") ? (
        <Card>
          <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--ns-border)" }}>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Market</div>
            <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>匯率</h3>
          </div>
          {fxRates.length === 0 ? (
            <div className="muted text-body" style={{ padding: "16px 18px" }}>尚無匯率資料。</div>
          ) : (
            fxRates.map((fx) => (
              <div key={fx.pair} style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--ns-border)" }}>
                <span className="mono text-xs" style={{ flex: 1 }}>{fx.pair}</span>
                <span className="num text-[13.5px]" style={{ fontWeight: 500 }}>{fx.rate.toFixed(4)}</span>
                {fx.changePct != null && Math.abs(fx.changePct) >= 0.005 ? (
                  <span className="num text-xs" style={{ color: fx.changePct >= 0 ? "var(--ns-pos)" : "var(--ns-neg)", minWidth: 58, textAlign: "right" }}>
                    {fx.changePct >= 0 ? "▲" : "▼"} {Math.abs(fx.changePct).toFixed(2)}%
                  </span>
                ) : null}
              </div>
            ))
          )}
        </Card>
        ) : null}
      </div>

      {/* Row 4 · Recent activity + Top Movers (shared row so neither is cramped) */}
      <div className={cardVisible("topMovers") && heldAssetCount > 0 ? "ns-dash-activity-grid" : ""} style={{ marginBottom: 16 }}>
      {cardVisible("recentActivity") ? (
      <Card className="ns-dash-activity-card">
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recent activity</div>
            <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>最近交易</h3>
          </div>
          <Button variant="ghost" size="xs" render={<Link to="/cash-flow" />}>查看全部 →</Button>
        </div>
        {recent.length === 0 ? (
          <div className="muted text-body" style={{ padding: "18px 22px" }}>還沒有交易紀錄。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
            {recent.map((r, i) => (
              <div key={r.id} className="ns-row" style={{ gap: 12, paddingLeft: 22, paddingRight: 22, borderLeft: i % 2 === 1 ? "1px solid var(--ns-border)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-[13.5px]" style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || r.category || (r.entryType === "transfer" ? "轉帳" : "交易")}</div>
                  <div className="muted text-caption" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.date.slice(5).replace("T", " ")} · {accountMap.get(r.accountId)?.name ?? ""}</div>
                </div>
                <div className={"num text-sm " + (r.amount >= 0 ? "pos" : "")} style={{ minWidth: 88, textAlign: "right" }}>
                  {r.amount >= 0 ? "+" : "−"}NT${formatNumber(Math.abs(r.amount))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      ) : null}
        {cardVisible("topMovers") && heldAssetCount > 0 ? <TopMoversCard gainers={movers.gainers} losers={movers.losers} /> : null}
      </div>
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
          fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums",
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
    { label: "投資組合", val: data.portfolio, color: data.portfolio == null ? "var(--ns-fg-muted)" : data.portfolio >= 0 ? "var(--ns-gain)" : "var(--ns-loss)" },
    { label: `${benchmarkTicker} 指標`, val: data.benchmark, color: "var(--ns-fg-muted)" },
    { label: "超額報酬", val: data.alpha, color: data.alpha == null ? "var(--ns-fg-muted)" : data.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-loss)" },
  ];
  return (
    <div style={{ marginTop: 14 }}>
      <div className="ns-eyebrow" style={{ marginBottom: 8 }}>投資組合 vs Benchmark · {period}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden" }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{ padding: "10px 14px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
            <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
            <div className="num text-[19px]" style={{ fontWeight: 600, fontFamily: "var(--ns-font-num)", color: c.color, fontVariantNumeric: "tabular-nums" }}>{fmtPctSigned(c.val)}</div>
          </div>
        ))}
      </div>
      {data.portfolio == null ? (
        <div className="muted text-caption" style={{ marginTop: 6 }}>
          需要更多每日股價才能計算期間報酬。<Link to="/investments" style={{ color: "var(--ns-accent)" }}>前往回補 →</Link>
        </div>
      ) : data.benchmark == null ? (
        <div className="muted text-caption" style={{ marginTop: 6 }}>
          尚無 {benchmarkTicker} 歷史股價，無法比較 benchmark。<Link to="/investments" style={{ color: "var(--ns-accent)" }}>前往投資 →</Link>
        </div>
      ) : null}
    </div>
  );
}

function MoverRow({ mover }: { mover: Mover }) {
  const isPos = mover.changePercent >= 0;
  return (
    <Link
      to="/holdings/$ticker"
      params={{ ticker: mover.ticker }}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", textDecoration: "none", color: "inherit", minWidth: 0 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono text-xs" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mover.ticker}</div>
        <div className="muted text-micro" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mover.name}</div>
      </div>
      <span
        className="num text-caption"
        style={{
          flexShrink: 0, fontWeight: 600, fontVariantNumeric: "tabular-nums",
          padding: "2px 7px", borderRadius: 999,
          color: isPos ? "var(--ns-gain)" : "var(--ns-loss)",
          background: `color-mix(in srgb, ${isPos ? "var(--ns-gain)" : "var(--ns-loss)"} 12%, transparent)`,
        }}
      >
        {isPos ? "+" : "−"}{Math.abs(mover.changePercent).toFixed(2)}%
      </span>
    </Link>
  );
}

function MoverColumn({ label, tone, movers }: { label: string; tone: "pos" | "neg"; movers: Mover[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="ns-eyebrow" style={{ fontSize: 10, marginBottom: 4, color: tone === "pos" ? "var(--ns-gain)" : "var(--ns-loss)" }}>
        {label}
      </div>
      {movers.length === 0 ? (
        <div className="dim text-xs" style={{ padding: "8px 0" }}>—</div>
      ) : (
        movers.map((m) => <MoverRow key={m.ticker} mover={m} />)
      )}
    </div>
  );
}

function TopMoversCard({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  const empty = gainers.length === 0 && losers.length === 0;
  return (
    <Card className="ns-dash-activity-card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Today</div>
          <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>Top Movers</h3>
        </div>
        <Button variant="ghost" size="xs" render={<Link to="/investments" />}>詳細 →</Button>
      </div>
      {empty ? (
        <div className="muted text-body" style={{ padding: "16px 18px" }}>回補歷史股價後顯示當日漲跌幅。</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: "12px 18px 16px" }}>
          <MoverColumn label="上漲" tone="pos" movers={gainers} />
          <MoverColumn label="下跌" tone="neg" movers={losers} />
        </div>
      )}
    </Card>
  );
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div className="ns-eyebrow" style={{ marginBottom: 4 }}>{eyebrow}</div>
        <h3 className="text-base" style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontWeight: 500 }}>{title}</h3>
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
  return resolveTargetAmount(goal);
}

function buildNetWorthTrend(
  accounts: Account[],
  ledgerRows: LedgerTransaction[],
  assets: PortfolioAsset[],
  investments: InvestmentRecord[],
  quotes: StoredMarketQuote[],
  dailyPrices: DailyPrice[],
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

  // Bucket by day across the whole history. Daily granularity is what lets the
  // net-worth range control (1D / 1W / …) slice a meaningful window — a monthly
  // series collapses short ranges to a single point. Points are only emitted at
  // event dates (cash moves, trades, daily-price updates), so a quiet stretch
  // stays sparse rather than ballooning to one point per calendar day.
  const earliest = (startCandidates.length ? [...startCandidates].sort()[0] : dateOnly(settledRows[0].date));
  const now = new Date();
  const keyOf = (date: string) => dateOnly(date);
  const labelOf = (key: string) => formatDay(key);
  // Sortable ISO date per bucket so the period control can slice the chart.
  const isoOf = (key: string) => key;
  const valuationDateOf = (key: string) => key;

  // Cash side: opening balances + every settled ledger movement (which already
  // includes the cash leg of investment buys/sells).
  const cashDelta = new Map<string, number>();
  for (const account of accounts) {
    const joinedDate = dateOnly(account.createdAt);
    if (!joinedDate) continue;
    const key = keyOf(joinedDate);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(account.openingBalance, account.currency, joinedDate));
  }
  for (const row of ledgerRows) {
    if (row.deletedAt !== null) continue;
    // Total account-cash delta of a row, honoring 代墊 pass-through: the counter
    // leg (-amount) posts immediately, the main leg (+amount) on settle. Over a
    // reimbursement's full lifecycle the two legs net to zero, so net worth dips
    // while the money is fronted and recovers once repaid.
    let delta = 0;
    if (row.counterAccountId) {
      delta = -row.amount + (row.settlementStatus === "settled" ? row.amount : 0);
    } else if (row.settlementStatus === "settled") {
      delta = row.amount;
    }
    if (delta === 0) continue;
    const key = keyOf(row.date);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(delta, row.currency, row.date));
  }

  // Holdings side: rebuild quantity by bucket, then mark that quantity using the
  // latest daily close available on/before that bucket. This is the missing piece
  // for a real net-worth curve; current quotes are only a fallback when no daily
  // snapshot exists for a symbol/date.
  const quoteLookup = buildQuoteLookup(quotes);
  const quoteFor = (ticker: string) => findQuoteForTicker(quoteLookup, ticker);
  const dailyPriceLookup = buildDailyPriceLookup(dailyPrices);
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of investments) {
    if (record.deletedAt !== null) continue;
    recordsByAsset.set(record.assetId, [...(recordsByAsset.get(record.assetId) ?? []), record]);
  }
  const quantityEvents = new Map<string, Map<string, number>>();
  const addQuantityEvent = (assetId: string, date: string, delta: number) => {
    if (delta === 0) return;
    const key = keyOf(date);
    const bucket = quantityEvents.get(key) ?? new Map<string, number>();
    bucket.set(assetId, (bucket.get(assetId) ?? 0) + delta);
    quantityEvents.set(key, bucket);
  };

  for (const asset of assets) {
    const qtyTimeline = buildQuantityTimeline(recordsByAsset.get(asset.id) ?? []);
    if (qtyTimeline.length > 0) {
      for (const { date, delta } of qtyTimeline) addQuantityEvent(asset.id, date, delta);
    } else if (asset.totalQuantity !== 0) {
      addQuantityEvent(asset.id, dateOnly(asset.acquisitionDate || asset.createdAt), asset.totalQuantity);
    }
  }

  const startKey = keyOf(earliest);
  const todayIso = dateOnly(now.toISOString());
  const todayKey = keyOf(todayIso);
  const relevantTickers = new Set(assets.flatMap((asset) => quoteLookupKeys(asset.ticker)));
  const priceKeys = dailyPrices
    .filter((row) => relevantTickers.has(row.ticker.trim().toUpperCase()))
    .map((row) => keyOf(row.date));
  const orderedKeys = [...new Set([startKey, todayKey, ...cashDelta.keys(), ...quantityEvents.keys(), ...priceKeys])].sort();

  let cashRunning = 0;
  const quantities = new Map<string, number>();
  const timeline: Array<{ date: string; value: number; iso: string }> = [];
  for (const key of orderedKeys) {
    cashRunning += cashDelta.get(key) ?? 0;
    const events = quantityEvents.get(key);
    if (events) {
      for (const [assetId, delta] of events) {
        quantities.set(assetId, (quantities.get(assetId) ?? 0) + delta);
      }
    }
    const valuationDate = valuationDateOf(key);
    const holdingsValue = assets.reduce((sum, asset) => {
      const quantity = quantities.get(asset.id) ?? 0;
      if (Math.abs(quantity) < 1e-9) return sum;
      const quote = quoteFor(asset.ticker);
      const price = priceAssetOnDate(asset, valuationDate, { todayIso, dailyPriceLookup, quote });
      return sum + toPrimary(price.value * quantity, price.currency, valuationDate);
    }, 0);
    timeline.push({ date: labelOf(key), value: cashRunning + holdingsValue, iso: isoOf(key) });
  }

  // The series already ends at today's net worth, so we don't bolt on a separate
  // "現在" point that would duplicate today's bucket. Only extend a flat segment
  // to "現在" when the last bucket predates today; a lone bucket gets a second
  // point so the chart still draws a line (B5).
  const lastKey = orderedKeys[orderedKeys.length - 1];
  if (timeline.length === 1 || (timeline.length > 1 && lastKey !== todayKey)) {
    const holdingsValue = assets.reduce((sum, asset) => {
      const quantity = quantities.get(asset.id) ?? 0;
      if (Math.abs(quantity) < 1e-9) return sum;
      const quote = quoteFor(asset.ticker);
      const price = priceAssetOnDate(asset, todayIso, { todayIso, dailyPriceLookup, quote });
      return sum + toPrimary(price.value * quantity, price.currency, todayIso);
    }, 0);
    timeline.push({ date: "現在", value: cashRunning + holdingsValue, iso: todayIso });
  }
  return timeline;
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
