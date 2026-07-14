import { ArrowDown, ArrowsClockwise, ArrowUp, ChartBar } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useFinanceData } from "../data/hooks";
import { getFinanceRepository, type StoredMarketQuote } from "../data/repositories";
import { enterDemoMode } from "../data/demoData";
import { useDemoMode } from "../state/demoMode";
import { useToast } from "../components/Toast";
import { NotificationCenter } from "../components/NotificationCenter";
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
  buildPortfolioTwr,
  buildBenchmarkSeries,
  buildDailyPriceLookup,
  buildManualPriceLookup,
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
  type ManualPriceSnapshot,
  type PortfolioAsset,
  todayInTimezone,
} from "../domain";
import { calculateAvailableCash, changePctWithFloor } from "../domain/dashboardSummary";
import { bookAccountIdSet, fireMetricAccountIdSet, personalNetWorthAccountIdSet, scopeRows } from "../domain/bookScope";
import { stripStartDate, STRIP_PERIODS, type StripPeriod } from "../domain/dateScope";
import { trailingMonthlyNet } from "../domain/northstarMetrics";
import { smoothTrend } from "../domain/trendSmoothing";
import { NetWorthProjectionCard } from "../components/NetWorthProjectionCard";
import { useRefreshQuotes, useRefreshFxRates, useRefreshDailyPrices } from "../features/market-data/useMarketRefresh";
import { useState } from "react";
import { SegmentedControl } from "../components/SegmentedControl";
import { useUiPreferences } from "../state/uiPreferences";
import { buildQuoteLookup, findQuoteForTicker, quoteLookupKeys } from "../domain/marketSymbols";
import { Popover, PopoverTrigger, PopoverContent } from "../components/ui/popover";
import { SquaresFour } from "@phosphor-icons/react";
import { buildMonthlySummaryInput } from "../domain/monthlySummary";
import { isAvailable as isFmAvailable, generateMonthlySummary } from "../lib/foundationModels";
import { MarkdownText } from "../components/MarkdownText";

const STRIP_PERIOD_LABELS: Record<StripPeriod, string> = {
  "1D": "近 1 日",
  "1W": "近 1 週",
  "1M": "近 1 個月",
  "3M": "近 3 個月",
  "YTD": "今年以來",
  "1Y": "近 1 年",
  "5Y": "近 5 年",
  "All": "全期間",
};

/**
 * Long-view mode (Plan 040).
 * MILESTONE_TIERS: fixed TWD ladder in the user's primary currency (v1, not
 * user-editable). Compared against the existing headline `netWorth`.
 * LONG_VIEW_WINDOW: trailing moving-average window applied to the net-worth
 * trend when long-view mode is on (display-only; see domain/trendSmoothing).
 */
const MILESTONE_TIERS = [1_000_000, 3_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000];
const LONG_VIEW_WINDOW = 30;

/** Dashboard cards the user can hide via 編輯版面 (net-worth hero + KPI stay). */
const DASHBOARD_CARDS: Array<{ key: string; label: string }> = [
  { key: "budget", label: "預算進度" },
  { key: "todos", label: "待辦" },
  // 定期定額提醒 hidden until the DCA workflow is finalised (see InvestmentsRoute).
  { key: "allocation", label: "資產配置" },
  { key: "goals", label: "目標" },
  { key: "recentActivity", label: "最近交易" },
  { key: "topMovers", label: "今日漲跌" },
  { key: "netWorthTrend", label: "淨值趨勢" },
  { key: "projection", label: "30 年淨值預測" },
  // 本月摘要 (AI) moved inline under the greeting header (2026-07 · plan 116);
  // no longer a layout-toggle card — shows whenever FM is available and there's data.
];


const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
  "var(--ns-chart-6)",
  "var(--ns-chart-7)",
];

/**
 * 待辦 row (plan 164): a single date-sorted merge of upcoming bills,
 * credit-card payments due, and outstanding AR/AP — no new financial math,
 * just re-tagging the three existing sources for one combined card.
 */
type TodoRow = {
  key: string;
  type: "bill" | "card" | "recv" | "pay" | "income";
  name: string;
  sub: string;
  /** "MM-DD" for display. */
  date: string;
  /** Full ISO date used for sorting. */
  iso: string;
  /** Signed, primary-currency amount; negative = 待付. */
  amt: number;
  /** Present for "card" rows — links to the account's reconcile route. */
  linkAccountId?: string;
  /** Present for "recv"/"pay" rows — links to the cash-flow ledger entry. */
  linkTxId?: string;
};

const TODO_META: Record<TodoRow["type"], { label: string; color: string }> = {
  bill: { label: "帳單", color: "var(--ns-chart-3)" },
  card: { label: "信用卡", color: "var(--ns-chart-5)" },
  recv: { label: "應收", color: "var(--ns-chart-2)" },
  pay: { label: "應付", color: "var(--ns-chart-5)" },
  income: { label: "入帳", color: "var(--ns-pos)" },
};

export function DashboardRoute() {
  const { accounts, ledger, assets, quotes, settings, dailyFxRates, dailyPrices, manualPriceSnapshots, recurring, financialGoals, investments, books, isInitialLoading, isError, error, refetchAll } = useFinanceData();
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
  const longViewMode = useUiPreferences((state) => state.longViewMode);
  const toggleLongViewMode = useUiPreferences((state) => state.toggleLongViewMode);
  const milestoneReached = useUiPreferences((state) => state.milestoneReached);
  const setMilestoneReached = useUiPreferences((state) => state.setMilestoneReached);
  const activeBookId = useUiPreferences((state) => state.activeBookId);
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
  const monthKey = todayInTimezone(timezone).slice(0, 7);
  // Overview always aggregates every account; the per-account filter UI was
  // removed (redesign feedback). `selectedAccount` stays "all" so the existing
  // account-scoped memos below keep working unchanged.
  const [selectedAccount] = useState<string>("all");
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
  const bookRows = books.data ?? [];

  // 帳本 (Books) scoping — plan 189, docs/ledger-books-plan.md §5's two-axis rule:
  //  • switcher scope → general views (net worth, cash-flow KPI, budgets, trend,
  //    allocation, settlements). Follows the active book / 總帳.
  //  • fireMetric scope → FIRE-family (trailing expense/net, coverage, runway,
  //    projection). Switcher-INDEPENDENT: only books with includeInFireMetrics.
  //  • personalNetWorth scope → the FI-progress figure (goals). Switcher-
  //    INDEPENDENT: only books with includeInPersonalNetWorth.
  const switcherAccountIds = useMemo(() => bookAccountIdSet(accountRows, activeBookId), [accountRows, activeBookId]);
  const fireAccountIds = useMemo(() => fireMetricAccountIdSet(accountRows, bookRows), [accountRows, bookRows]);
  const personalAccountIds = useMemo(() => personalNetWorthAccountIdSet(accountRows, bookRows), [accountRows, bookRows]);
  const fireLedgerRows = useMemo(() => scopeRows(ledgerRows, fireAccountIds), [ledgerRows, fireAccountIds]);
  const fireAccounts = useMemo(() => accountRows.filter((a) => fireAccountIds.has(a.id)), [accountRows, fireAccountIds]);
  const fireInvestmentRows = useMemo(
    () => investmentRows.filter((r) => r.linkedAccountId != null && fireAccountIds.has(r.linkedAccountId)),
    [investmentRows, fireAccountIds],
  );

  const { primaryCurrency, toPrimary } = useMemo(
    () => createFxConverter(appSettings, dailyFxRates.data ?? []),
    [appSettings, dailyFxRates.data],
  );

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
  const todayIso = todayInTimezone(timezone);

  const dataHealthReport = useMemo(
    () =>
      buildDataHealthReport({
        accounts: accountRows,
        ledger: ledgerRows,
        assets: assetRows,
        quotes: quoteRows.map((q) => ({ symbol: q.symbol, updatedAt: q.updatedAt })),
        dailyPrices: dailyPriceRows,
        dailyFxRates: fxHistory,
        manualPriceSnapshots: manualSnapshotRows,
        settings: appSettings,
        todayIso: todayIso,
      }),
    [accountRows, ledgerRows, assetRows, quoteRows, dailyPriceRows, fxHistory, manualSnapshotRows, appSettings, todayIso],
  );
  // Switcher-scoped (plan 189): the general net-worth view honors the active
  // book / 總帳. In 總帳 (activeBookId "all") switcherAccountIds is every id, so
  // this is identical to pre-books behavior.
  const filteredAccounts = accountRows.filter((a) => switcherAccountIds.has(a.id) && (selectedAccount === "all" || a.id === selectedAccount));

  const quoteLookup = useMemo(() => buildQuoteLookup(quoteRows), [quoteRows]);
  const quoteFor = (ticker: string) => findQuoteForTicker(quoteLookup, ticker);
  const filteredAssets = assetRows.filter((a) => a.accountId != null && switcherAccountIds.has(a.accountId) && (selectedAccount === "all" || a.accountId === selectedAccount));

  // Single valuation context shared by the KPI market value, the allocation
  // donut, and the net-worth trend endpoint so all three agree: live quote →
  // latest daily close → average cost (see domain/valuation).
  // (todayIso is declared earlier, before dataHealthReport, so both can share it.)
  const dailyPriceLookup = useMemo(() => buildDailyPriceLookup(dailyPriceRows), [dailyPriceRows]);
  // Manual-price resolver for custom (manually-priced) assets; shared by the KPI
  // market value, the allocation donut, and the net-worth trend so all three value
  // custom assets identically (manual snapshot → average cost).
  const manualPriceLookup = useMemo(() => buildManualPriceLookup(manualSnapshotRows), [manualSnapshotRows]);
  const { total: marketValue } = holdingsMarketValue(filteredAssets, todayIso, toPrimary, {
    todayIso,
    dailyPriceLookup,
    quoteFor,
    manualPriceLookup,
  });

  // Reconciling partition: 資產 − 負債 = 淨值 always holds.
  const breakdown = buildNetWorthBreakdown(filteredAccounts, marketValue, toPrimary);
  const availableCash = breakdown.liquidCash;
  const alternativeAssets = breakdown.alternativeAssets;
  const liabilities = breakdown.liabilities;
  const netWorth = breakdown.netWorth;

  // Switcher-INDEPENDENT net worth for the FIRE / FI-progress surfaces (plan
  // 189). Computed the same way as the hero (accounts + holdings market value),
  // but over a fixed book set (personal or FIRE) so those metrics answer "the
  // user's personal financial independence" regardless of which book is being
  // viewed. For a single default 個人帳 (both toggles on) these equal `netWorth`.
  const computeScopedNetWorth = useCallback(
    (accountIds: Set<string>) => {
      const scopedAccounts = accountRows.filter((a) => accountIds.has(a.id));
      const scopedAssets = assetRows.filter((a) => a.accountId != null && accountIds.has(a.accountId));
      const { total } = holdingsMarketValue(scopedAssets, todayIso, toPrimary, {
        todayIso,
        dailyPriceLookup,
        quoteFor: (ticker: string) => findQuoteForTicker(quoteLookup, ticker),
        manualPriceLookup,
      });
      return buildNetWorthBreakdown(scopedAccounts, total, toPrimary).netWorth;
    },
    [accountRows, assetRows, todayIso, toPrimary, dailyPriceLookup, manualPriceLookup, quoteLookup],
  );
  const personalNetWorth = useMemo(() => computeScopedNetWorth(personalAccountIds), [computeScopedNetWorth, personalAccountIds]);
  const fireNetWorth = useMemo(() => computeScopedNetWorth(fireAccountIds), [computeScopedNetWorth, fireAccountIds]);

  const monthRows = ledgerRows.filter((row) => row.date.startsWith(monthKey) && row.settlementStatus === "settled" && !isNeutralLedgerRow(row) && switcherAccountIds.has(row.accountId) && (selectedAccount === "all" || row.accountId === selectedAccount));
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
  // FIRE-family (plan 189): scoped by fireMetricAccountIdSet, switcher-
  // INDEPENDENT — these answer the user's personal financial independence, one
  // answer regardless of which book is being viewed. A 公司帳 with
  // includeInFireMetrics off never feeds these even while viewing 總帳.
  // Trailing-3-month average monthly expense (settled, non-neutral).
  const trailingMonthlyExp = useMemo(
    () => trailingMonthlyExpense(fireLedgerRows, toPrimary, todayIso, 3),
    [fireLedgerRows, toPrimary, todayIso],
  );

  // Trailing-3-month average monthly net (income − expense) for the projection
  // contribution input.  Uses the same settled/non-neutral/!deleted convention.
  const trailingMonthlyNetContrib = useMemo(
    () => trailingMonthlyNet(fireLedgerRows, toPrimary, todayIso, 3),
    [fireLedgerRows, toPrimary, todayIso],
  );

  // TTM passive income (dividends) for coverage ratio — FIRE-scoped records so
  // company-book holdings don't inflate personal passive income.
  const dividendAnalysis = useMemo(() => {
    const assetMeta = new Map(assetRows.map((a) => [a.id, { ticker: a.ticker, currency: a.currency }]));
    return buildDividendAnalysis({
      records: fireInvestmentRows,
      assetMeta,
      toPrimary,
      currentMarketValue: marketValue,
      asOf: todayIso,
    });
  }, [fireInvestmentRows, assetRows, toPrimary, marketValue, todayIso]);

  const coveragePct = useMemo(
    () => coverageRatioPct(dividendAnalysis.ttmTotal, trailingMonthlyExp * 12),
    [dividendAnalysis.ttmTotal, trailingMonthlyExp],
  );

  // Liquid cash for runway: FIRE-scoped (switcher-independent). Runway is a
  // personal safety metric so it reflects the FIRE-included books' liquid cash.
  const fireLiquidCash = useMemo(
    () => calculateAvailableCash(fireAccounts, toPrimary),
    [fireAccounts, toPrimary],
  );

  const runwayMo = useMemo(
    () => runwayMonths(fireLiquidCash, trailingMonthlyExp),
    [fireLiquidCash, trailingMonthlyExp],
  );

  // FIRE progress: first active goal's percent (same as goals card logic).
  // Uses personalNetWorth (switcher-INDEPENDENT, plan 189) not the switcher-
  // scoped hero `netWorth`, so FI progress doesn't move when viewing 公司帳.
  const firstGoalPct = useMemo(() => {
    const activeGoal = goalRows.find((g) => g.deletedAt === null);
    if (!activeGoal) return null;
    const target = goalTarget(activeGoal);
    return target > 0 ? Math.min((personalNetWorth / target) * 100, 100) : null;
  }, [goalRows, personalNetWorth]);

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

  // ————————————————————————————————————————————————————————————————————————

  // Switcher-scoped (plan 189): the net-worth trend follows the active book /
  // 總帳 just like the hero. In 總帳 the sets are every id → identical to before.
  const trend = useMemo(
    () => buildNetWorthTrend(
      accountRows.filter((a) => switcherAccountIds.has(a.id) && (selectedAccount === "all" || a.id === selectedAccount)),
      ledgerRows.filter((r) => switcherAccountIds.has(r.accountId) && (selectedAccount === "all" || r.accountId === selectedAccount)),
      assetRows.filter((a) => a.accountId != null && switcherAccountIds.has(a.accountId) && (selectedAccount === "all" || a.accountId === selectedAccount)),
      investmentRows.filter((r) => r.linkedAccountId != null && switcherAccountIds.has(r.linkedAccountId) && (selectedAccount === "all" || r.linkedAccountId === selectedAccount)),
      quoteRows, dailyPriceRows, appSettings, fxHistory, manualSnapshotRows
    ),
    [accountRows, ledgerRows, assetRows, investmentRows, switcherAccountIds, selectedAccount, quoteRows, dailyPriceRows, appSettings, fxHistory, manualSnapshotRows],
  );
  // The headline net worth uses live quotes; the trend's "today" point uses daily
  // closes, so they can disagree by a small amount. Align ONLY the final (today)
  // point to the headline so the chart visibly ends on the big number. Historical
  // points keep their daily-close valuation. Both `netWorth` and `trend` are
  // filtered by selectedAccount, so this stays correct when an account is picked.
  const reconciledTrend = useMemo(() => {
    if (trend.length === 0) return trend;
    const last = trend[trend.length - 1];
    if (last.iso >= todayIso && Math.abs(last.value - netWorth) > 0.5) {
      return [...trend.slice(0, -1), { ...last, value: netWorth }];
    }
    return trend;
  }, [trend, netWorth, todayIso]);
  // The range control both slices the chart and drives the headline delta, so
  // the +/- figure next to net worth always reflects the *selected* window
  // (start-of-window → now) instead of a fixed month-over-month step. A synthetic
  // anchor point at the window start (carrying the last value before it) keeps
  // the line spanning the full range even across quiet stretches.
  const rangeView = useMemo(() => {
    if (reconciledTrend.length < 2) return { points: reconciledTrend, change: 0, pct: null as number | null };
    if (stripPeriod === "All") {
      const first = reconciledTrend[0].value;
      const last = reconciledTrend[reconciledTrend.length - 1].value;
      return { points: reconciledTrend, change: last - first, pct: changePctWithFloor(first, last) };
    }
    const startIso = stripStartDate(stripPeriod, todayIso);
    const within = reconciledTrend.filter((p) => p.iso >= startIso);

    // Value as of the window start = last point on/before startIso (carry-forward).
    let carried: number | null = null;
    for (let i = reconciledTrend.length - 1; i >= 0; i--) {
      if (reconciledTrend[i].iso <= startIso) { carried = reconciledTrend[i].value; break; }
    }

    let points = within;
    if (within.length > 0 && within[0].iso !== startIso && carried !== null) {
      points = [{ date: formatDay(startIso), value: carried, iso: startIso }, ...within];
    }
    if (points.length < 2) points = reconciledTrend.slice(-2);

    const startValue = points[0].value;
    const endValue = points[points.length - 1].value;
    const change = endValue - startValue;
    const pct = changePctWithFloor(startValue, endValue);
    return { points, change, pct };
  }, [reconciledTrend, stripPeriod, todayIso]);
  // Long-view mode (Plan 040, Decision C): when on, render the trend through a
  // trailing moving average and show the longer-period change (smoothed window
  // start → now) instead of the day delta. Display-only: smoothTrend preserves
  // the final point's real value, so the chart endpoint still equals the
  // headline (plan-032 invariant) and stored values are untouched.
  const longView = useMemo(() => {
    if (!longViewMode || rangeView.points.length < 2) {
      return { points: rangeView.points, change: rangeView.change, pct: rangeView.pct };
    }
    const smoothed = smoothTrend(rangeView.points, { window: LONG_VIEW_WINDOW });
    const startValue = smoothed[0].value;
    const endValue = smoothed[smoothed.length - 1].value;
    const change = endValue - startValue;
    const pct = changePctWithFloor(startValue, endValue);
    return { points: smoothed, change, pct };
  }, [longViewMode, rangeView]);
  const visibleTrend = longView.points;
  const momChange = longView.change;
  const momPct = longView.pct;

  const hasAnyData = accountRows.length > 0 || ledgerRows.length > 0 || assetRows.length > 0;

  // Milestone celebration (Plan 040, Decision B): once data is loaded, if net
  // worth has crossed the next tier above the persisted high-water mark, fire ONE
  // toast and advance `milestoneReached` to the highest tier now reached. Guarded
  // with a ran-once ref (mirrors useDailyLocalBackup) and skipped in demo mode so
  // the showcase data never trips a celebration. De-dup is the persisted mark, so
  // it fires once per tier — never on every render.
  const milestoneRanRef = useRef(false);
  useEffect(() => {
    if (milestoneRanRef.current) return;
    if (useDemoMode.getState().active) return;
    if (!hasAnyData) return; // wait until real data has loaded
    milestoneRanRef.current = true;
    // Milestone celebrations track personalNetWorth (switcher-independent, plan
    // 189) so switching to a 公司帳 view never trips a personal-wealth milestone.
    const crossed = MILESTONE_TIERS.filter((tier) => tier > milestoneReached && personalNetWorth >= tier);
    if (crossed.length === 0) return;
    const highest = crossed[crossed.length - 1];
    const label = highest === MILESTONE_TIERS[0] ? "第一桶金" : formatMoney(highest, primaryCurrency);
    toast.success(`🎉 達成里程碑：${label}`, {
      description: "淨值跨過新的里程碑，繼續穩穩前行。",
      durationMs: 8_000,
    });
    setMilestoneReached(highest);
  }, [hasAnyData, personalNetWorth, milestoneReached, primaryCurrency, setMilestoneReached, toast]);

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
    // Only categories with a configured budget — spend-only categories carry no
    // budget signal here (full spend ranking lives in 記帳 → 分類).
    return cats
      .filter((c): c is typeof c & { budget: number } => c.budget !== null && c.budget > 0)
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
      .slice(0, 5);
  }, [monthRows, appSettings, toPrimary]);
  const totalBudget = budgetCats.reduce((sum, c) => sum + (c.budget ?? 0), 0);
  const overBudget = budgetCats.filter((c) => c.budget && c.spent > c.budget);

  // Allocation by asset class (+ cash slice).
  const allocation = useMemo(() => {
    const byClass = new Map<string, number>();
    for (const asset of filteredAssets) {
      const price = priceAssetOnDate(asset, todayIso, { todayIso, dailyPriceLookup, quote: quoteFor(asset.ticker), manualPriceLookup });
      const value = toPrimary(price.value * asset.totalQuantity, price.currency, todayIso);
      if (value <= 0) continue;
      const label = asset.assetType ? assetTypeLabels[asset.assetType] : "其他";
      byClass.set(label, (byClass.get(label) ?? 0) + value);
    }
    if (availableCash > 0) byClass.set("現金", (byClass.get("現金") ?? 0) + availableCash);
    if (alternativeAssets > 0) byClass.set("實體資產", (byClass.get("實體資產") ?? 0) + alternativeAssets);
    const total = [...byClass.values()].reduce((s, v) => s + v, 0);
    return [...byClass.entries()]
      .map(([label, value], i) => ({
        label,
        value,
        color: label === "現金" ? "var(--ns-chart-2)" : CHART_COLORS[i % CHART_COLORS.length],
        pct: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredAssets, quoteRows, availableCash, alternativeAssets, toPrimary, dailyPriceLookup, manualPriceLookup, todayIso]);

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

  // Portfolio Strip: cumulative return of the current basket vs the benchmark
  // over the selected period. Prefers the true time-weighted series
  // (buildPortfolioTwr, plan 179) so the vs-benchmark gap matches the analytics
  // tab's honest 口徑; falls back to the unchanged fixed-basket calc when TWR is
  // unavailable (insufficient observations). `basis` discloses which was used.
  // Returns null fields when there isn't enough daily history (gated, like XIRR).
  const stripData = useMemo(() => {
    const end = todayInTimezone(timezone);
    const start = stripStartDate(stripPeriod, end);
    const twr = buildPortfolioTwr({
      positions: analyticsPositions,
      records: investmentRows,
      dailyPrices: dailyPriceRows,
      toPrimary,
      start,
      end,
    });
    if (twr.twrPct != null && twr.series.length >= 2) {
      // twr.series is ALREADY a cumulative-return (%) index — align with the
      // benchmark's shared dates and geometrically rebase both to the first
      // common date, mirroring the analytics tab's perf memo.
      const bench = buildBenchmarkSeries(dailyPriceRows, benchmarkTicker, start, end);
      if (bench.length >= 2) {
        const benchByDate = new Map(bench.map((p) => [p.date, p.value]));
        const alignedTwr = twr.series.filter((p) => benchByDate.has(p.date));
        if (alignedTwr.length >= 2) {
          const twrBase = 1 + alignedTwr[0].pct / 100;
          const benchBase = benchByDate.get(alignedTwr[0].date)!;
          if (twrBase > 0 && benchBase > 0) {
            const last = alignedTwr[alignedTwr.length - 1];
            const portfolio = ((1 + last.pct / 100) / twrBase - 1) * 100;
            const benchmark = (benchByDate.get(last.date)! / benchBase - 1) * 100;
            return { portfolio, benchmark, alpha: portfolio - benchmark, basis: "twr" as const };
          }
        }
      } else {
        // TWR usable but no benchmark history: TWR 口徑 for the portfolio figure.
        return {
          portfolio: twr.series[twr.series.length - 1].pct,
          benchmark: null as number | null,
          alpha: null as number | null,
          basis: "twr" as const,
        };
      }
    }
    // Fixed-basket fallback — unchanged from the pre-repoint behaviour.
    const { series } = buildPortfolioValueSeries({
      positions: analyticsPositions,
      dailyPrices: dailyPriceRows,
      manualSnapshots: manualSnapshotRows,
      toPrimary,
      start,
      end,
    });
    if (series.length < 2) return { portfolio: null as number | null, benchmark: null as number | null, alpha: null as number | null, basis: "fixed" as const };
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
    return { portfolio, benchmark, alpha, basis: "fixed" as const };
  }, [analyticsPositions, investmentRows, dailyPriceRows, manualSnapshotRows, toPrimary, stripPeriod, benchmarkTicker, timezone]);

  // Build the complete metric list now that stripData.alpha is available.
  const allMetrics = [
    ...METRIC_REGISTRY,
    {
      key: "benchmarkGap",
      label: `vs ${benchmarkTicker} 累積差距`,
      value: stripData.alpha,
      display: stripData.alpha != null ? `${stripData.alpha >= 0 ? "+" : ""}${stripData.alpha.toFixed(1)}%` : "—",
      sub: `投組相對 ${benchmarkTicker} 的期間累積報酬差距（${stripData.basis === "twr" ? "時間加權 TWR 口徑" : "固定權重近似"}）`,
    },
  ];
  const activeMetric = allMetrics.find((m) => m.key === northstarMetric) ?? allMetrics[0];

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

  // 投資今日 pulse cell (plan 164): signed day-over-day impact of every held
  // position, summed in the primary currency. Mirrors dayChangeMovers' current
  // vs. reference resolution exactly (live quote vs. prior session's close from
  // daily_prices; never a live quote's previousClose) but computed locally
  // instead of promoting dayChangeMovers to also return raw prices, per the
  // plan's escape hatch — this stays a pure read of already-fetched data with
  // no changes to domain/portfolioAnalytics.ts.
  const portfolioDayChange = useMemo(() => {
    const held = filteredAssets.filter((a) => a.deletedAt === null && a.totalQuantity > 0);
    let amount = 0;
    let matched = false;
    for (const asset of held) {
      let closes: DailyPrice[] = [];
      for (const key of quoteLookupKeys(asset.ticker)) {
        const bucket = dailyPriceLookup.get(key);
        if (bucket?.length) { closes = bucket; break; }
      }
      const lastClose = closes.length ? closes[closes.length - 1] : null;
      const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
      const quote = quoteFor(asset.ticker);

      let current: number | null = null;
      let reference: number | null = null;
      let currency = asset.currency;
      if (quote && lastClose) {
        current = quote.price;
        currency = quote.currency || lastClose.currency || asset.currency;
        const quoteDate = quote.marketTime ? quote.marketTime.slice(0, 10) : null;
        reference = quoteDate && quoteDate > lastClose.date ? lastClose.close : prevClose?.close ?? null;
      } else if (lastClose && prevClose) {
        current = lastClose.close;
        reference = prevClose.close;
        currency = lastClose.currency || asset.currency;
      }
      if (current == null || reference == null || reference <= 0) continue;
      amount += toPrimary(asset.totalQuantity * (current - reference), currency, todayIso);
      matched = true;
    }
    if (!matched) return { amount: null as number | null, pct: null as number | null };
    const priorMarketValue = marketValue - amount;
    const pct = priorMarketValue !== 0 ? (amount / priorMarketValue) * 100 : null;
    return { amount, pct };
  }, [filteredAssets, quoteRows, dailyPriceLookup, marketValue, toPrimary, todayIso]);

  // Goals — approximate progress = net worth / target (dashboard glance only).
  // personalNetWorth (switcher-independent, plan 189) so goal progress reflects
  // the user's personal wealth, not whichever book is being viewed.
  const goals = useMemo(() => {
    return goalRows
      .filter((g) => g.deletedAt === null)
      .map((g) => {
        const target = goalTarget(g);
        const pct = target > 0 ? Math.min((personalNetWorth / target) * 100, 100) : 0;
        return { id: g.id, name: g.name, target, pct };
      })
      .slice(0, 4);
  }, [goalRows, personalNetWorth]);

  // Upcoming bills (recurring, next 30 days or overdue).
  const accountMap = useMemo(() => new Map(accountRows.map((a) => [a.id, a])), [accountRows]);
  const upcoming = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const horizon = todayInTimezone(timezone, d);
    const today = todayInTimezone(timezone);
    return recurringRows
      .filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= horizon && switcherAccountIds.has(r.accountId))
      .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
      .slice(0, 5);
  }, [recurringRows, timezone, switcherAccountIds]);

  // Credit-card payments coming due (within ~45 days), soonest first.
  const creditReminders = useMemo(
    () => buildCreditCardReminders(filteredAccounts, todayInTimezone(timezone), (amount, currency) => toPrimary(amount, currency)).filter((r) => r.daysUntilDue <= 45),
    [filteredAccounts, timezone],
  );

  // Unsettled accounts receivable / payable — switcher-scoped (plan 189 §1 #4):
  // a company invoice receivable must not appear while viewing 個人帳.
  const settlements = useMemo(
    () => buildOutstandingSettlements(
      ledgerRows.filter((r) => switcherAccountIds.has(r.accountId) && (selectedAccount === "all" || r.accountId === selectedAccount)),
      (amount, currency) => toPrimary(amount, currency),
    ),
    [ledgerRows, switcherAccountIds, selectedAccount, toPrimary],
  );

  // Adjusted net worth (accrual view): headline net worth is cash-basis; this
  // layers in money owed to you (AR) and money you owe (AP). Shown as a
  // secondary figure so the headline stays clean and uninflated.
  const netSettlement = settlements.receivableTotal - settlements.payableTotal;
  const adjustedNetWorth = netWorth + netSettlement;

  // 待辦 (plan 164): merge upcoming bills, credit-card payments, and
  // outstanding AR/AP into a single date-sorted list. Reuses the three
  // already-computed sources above — no new financial math.
  const todoRows = useMemo<TodoRow[]>(() => {
    const rows: TodoRow[] = [];
    for (const b of upcoming) {
      const isIncome = b.entryType === "income";
      rows.push({
        key: `bill-${b.id}`,
        type: isIncome ? "income" : "bill",
        name: b.merchant || b.category,
        sub: accountMap.get(b.accountId)?.name ?? "",
        date: b.nextRunDate.slice(5),
        iso: b.nextRunDate,
        amt: isIncome ? Math.abs(b.amount) : -Math.abs(b.amount),
      });
    }
    for (const r of creditReminders) {
      rows.push({
        key: `card-${r.accountId}`,
        type: "card",
        name: r.name,
        sub: `繳款日 ${r.dueDate.slice(5)} · 還有 ${r.daysUntilDue} 天`,
        date: r.dueDate.slice(5),
        iso: r.dueDate,
        amt: -r.outstanding,
        linkAccountId: r.accountId,
      });
    }
    for (const item of settlements.items.slice(0, 5)) {
      const isRecv = item.kind === "receivable";
      const amount = toPrimary(item.amount, item.currency) ?? item.amount;
      rows.push({
        key: `settle-${item.id}`,
        type: isRecv ? "recv" : "pay",
        name: item.counterparty || item.name,
        sub: "",
        date: item.date.slice(5, 10),
        iso: item.date.slice(0, 10),
        amt: isRecv ? amount : -amount,
        linkTxId: item.id,
      });
    }
    return rows.sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 6);
  }, [upcoming, creditReminders, settlements, accountMap, toPrimary]);
  const todoTotalDue = todoRows.reduce((sum, r) => sum + (r.amt < 0 ? r.amt : 0), 0);

  // FX rates (latest + previous per pair) for the header FX one-liner.
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

  // Pulse strip (plan 164): 4-cell 一眼脈搏 summary — investment day change,
  // this month's cash flow, budget status, and the merged to-do list. budgetCats
  // is already sorted by spend/limit ratio (see its useMemo), so [0] is the
  // category nearest its limit.
  const topBudgetCat = budgetCats[0];
  const budgetSub = overBudget.length > 0
    ? `${overBudget.length} 個超支`
    : topBudgetCat && topBudgetCat.budget
      ? `${topBudgetCat.name} ${Math.round((topBudgetCat.spent / topBudgetCat.budget) * 100)}%`
      : "無超支";
  const soonestTodo = todoRows[0];
  const pulseCells: Array<{ label: string; value: string; sub: string; color?: string }> = [
    {
      label: "投資今日",
      value: portfolioDayChange.amount == null ? "—" : `${portfolioDayChange.amount >= 0 ? "+" : "−"}${formatNumber(Math.abs(portfolioDayChange.amount))}`,
      sub: portfolioDayChange.pct == null ? "" : `${portfolioDayChange.pct >= 0 ? "+" : "−"}${Math.abs(portfolioDayChange.pct).toFixed(2)}%`,
      color: portfolioDayChange.amount == null ? undefined : portfolioDayChange.amount >= 0 ? "var(--ns-gain)" : "var(--ns-loss)",
    },
    {
      label: "本月現金流",
      value: `${monthNet >= 0 ? "+" : "−"}${formatNumber(Math.abs(monthNet))}`,
      sub: monthIncome > 0 ? `儲蓄率 ${savingsRate.toFixed(0)}%` : "",
      color: monthNet >= 0 ? "var(--ns-pos)" : "var(--ns-neg)",
    },
    {
      label: "預算",
      value: budgetCats.length === 0 ? "尚無預算" : `${budgetCats.length} 分類`,
      sub: budgetCats.length === 0 ? "" : budgetSub,
      color: overBudget.length > 0 ? "var(--ns-neg)" : undefined,
    },
    {
      label: "待辦",
      value: `${todoRows.length} 件 · 30 天`,
      sub: soonestTodo ? `${soonestTodo.name} · ${soonestTodo.date}` : "目前沒有待辦",
    },
  ];

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
                <span className="ml-2 muted">{dataHealthReport.issues[0].message}</span>
              ) : null}
            </span>
            <span className="text-caption muted shrink-0">{healthExpanded ? "收合 ▲" : "展開 ▼"}</span>
          </div>
          {healthExpanded ? (
            <div className="mt-2 flex flex-col gap-1">
              {dataHealthReport.issues.map((issue) => (
                <div key={issue.id} className="text-xs" style={{ color: issue.severity === "error" ? "var(--ns-neg)" : "var(--ns-fg-muted)" }}>
                  {issue.severity === "error" ? "⚠ " : "· "}{issue.message}
                </div>
              ))}
              <div className="mt-1.5 flex gap-4 flex-wrap">
                {dataHealthReport.issues.some((i) => i.kind === "missing-fx" || i.kind === "stale-fx") ? (
                  <Link to="/settings" className="text-xs">前往更新匯率</Link>
                ) : null}
                {dataHealthReport.issues.some((i) => i.kind === "missing-price-history" || i.kind === "stale-quote" || i.kind === "stale-manual-price") ? (
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

      {/* Header — greeting/summary shrinks (min-w-0) so a long AI summary wraps
          in place; the FX one-liner + 更新行情 + 版面 + 通知 stay pinned top-right. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ marginBottom: 18 }}>
        <div className="min-w-0">
          <div className="text-xs ns-field-label">Overview · {monthLabel}</div>
          <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
          {hasAnyData ? (
            <MonthlySummaryInline
              monthKey={monthKey}
              income={monthIncome}
              expense={monthExpense}
              savingsRatePct={savingsRate}
              netWorthChange={momChange}
              currency={primaryCurrency}
              budgetCats={budgetCats}
            />
          ) : null}
        </div>
        {/* 匯率 one-liner sits inline with 更新行情 + 版面. The single time-range
            control lives on the net-worth card (the period segmented control). */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
            <FxInline rates={fxRates} />
            <Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" onClick={refreshMarket} loading={refreshingMarket} disabled={refreshingMarket || (assetRows.length === 0 && (appSettings?.exchangeRates?.length ?? 0) === 0)} title="更新持倉報價、匯率與每日歷史股價">
              <ArrowsClockwise size={14} />{refreshingMarket ? "更新中" : "更新行情"}
            </Button>
            {hasAnyData ? (
              <Popover>
                <PopoverTrigger render={<Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0 sm:h-9" />}>
                  <SquaresFour size={14} />版面
                </PopoverTrigger>
                <PopoverContent align="end" className="p-2" style={{ width: 220 }}>
                  <div className="text-xs muted font-medium pt-1.5 px-2 pb-2">編輯版面 · 顯示卡片</div>
                  <div className="flex flex-col">
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
            <NotificationCenter />
        </div>
      </div>

      {/* Row 1 · Northstar hero + pulse strip (Direction A, plan 164) */}
      <div className="ns-dash-row1">
        <Card className="flex flex-col min-w-0" style={{ padding: 22 }}>
          {/* ── Hero header: eyebrow + value + MoM badge (netWorth only) ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="min-w-0 flex-1">
              {/* Eyebrow: metric label + currency for money metrics */}
              <div className="flex items-center gap-2" style={{ marginBottom: 5 }}>
                <div className="text-xs muted font-medium">
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
                  <PopoverContent align="start" className="p-2" style={{ width: 200 }}>
                    <div className="text-xs muted font-medium pt-1.5 px-2 pb-2">選擇主要指標</div>
                    <div className="flex flex-col">
                      {allMetrics.map((m) => (
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
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {activeMetric.display}
                </span>
                {/* MoM trend badge — only for netWorth (has a history series) */}
                {activeMetric.key === "netWorth" && reconciledTrend.length >= 2 ? (
                  <>
                    <Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
                      {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                      <span className="num">
                        {momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))}
                        {momPct != null ? <> · {Math.abs(momPct).toFixed(2)}%</> : null}
                      </span>
                    </Badge>
                    <span className="muted text-xs">{STRIP_PERIOD_LABELS[stripPeriod]}</span>
                  </>
                ) : null}
              </div>

              {/* Adjusted net worth (only when netWorth hero) */}
              {activeMetric.key === "netWorth" && Math.abs(netSettlement) > 0.5 ? (
                <div className="muted text-xs mt-1" title="現金基礎淨值加計應收、減去應付">
                  調整後淨值（含應收應付）{" "}
                  <span className="num" style={{ color: "var(--ns-fg)" }}>{formatMoney(adjustedNetWorth, primaryCurrency)}</span>
                  <span className="ml-1.5">
                    ({netSettlement >= 0 ? "+" : "−"}{formatNumber(Math.abs(netSettlement))})
                  </span>
                </div>
              ) : null}

              {/* Caption for non-netWorth metrics */}
              {activeMetric.key !== "netWorth" && activeMetric.sub ? (
                <div className="muted text-xs mt-1.5">{activeMetric.sub}</div>
              ) : null}
            </div>

            {/* Period control + long-view toggle above a small sparkline — only
                for netWorth (drives the trend chart, still used by the demoted
                淨值趨勢 card too). */}
            {activeMetric.key === "netWorth" && reconciledTrend.length > 1 ? (
              <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className="ns-hscroll" style={{ maxWidth: "100%" }}>
                    <SegmentedControl
                      value={stripPeriod}
                      onChange={setStripPeriod}
                      options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={longViewMode ? "default" : "outline"}
                    onClick={toggleLongViewMode}
                    aria-pressed={longViewMode}
                    title="長期視角：以移動平均淡化每日波動"
                  >
                    長期視角
                  </Button>
                </div>
                <div style={{ width: 300, maxWidth: "100%", height: 64 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={visibleTrend}>
                      <defs>
                        <linearGradient id="netWorthMini" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
                      <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#netWorthMini)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </div>

          {/* No meaningful trend yet → a slim hint instead of the sparkline. */}
          {activeMetric.key === "netWorth" && reconciledTrend.length <= 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
          ) : null}

          {/* Pulse strip: 投資今日 / 本月現金流 / 預算 / 待辦 — only once there's
              data to summarize. */}
          {hasAnyData ? <PulseStrip cells={pulseCells} /> : null}
        </Card>
      </div>

      {/* Row 2 · 待辦 (bills + credit cards + AR/AP merged) + 今日漲跌 */}
      <div className={(cardVisible("todos") && cardVisible("topMovers") && heldAssetCount > 0 ? "ns-dash-activity-grid" : "") + " mb-4"}>
        {cardVisible("todos") ? <TodoCard rows={todoRows} totalDue={todoTotalDue} /> : null}
        {cardVisible("topMovers") && heldAssetCount > 0 ? <TopMoversCard gainers={movers.gainers} losers={movers.losers} /> : null}
      </div>

      {/* Row 3a · Budget */}
      {cardVisible("budget") ? (
      <div className="ns-dash-row2">
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow={`Budget · ${todayLabel.slice(0, todayLabel.indexOf("月") + 1) || "本月"}`} title="預算進度" action={<Button variant="ghost" size="xs" render={<Link to="/cash-flow/categories" />}>管理分類 →</Button>} />
          {budgetCats.length === 0 ? (
            <div className="muted text-body">尚未設定分類預算 — 到「管理分類」為分類設定每月預算後，這裡會顯示進度。</div>
          ) : (
            <div className="flex flex-col" style={{ gap: 9 }}>
              {budgetCats.map((c) => {
                const pct = Math.min(c.spent / c.budget, 1);
                const over = c.spent > c.budget;
                return (
                  <div key={c.name} style={{ display: "grid", gridTemplateColumns: "84px 1fr 132px", gap: 10, alignItems: "center" }}>
                    <span className="text-body truncate">{c.name}</span>
                    <div style={{ height: 7, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden" }}>
                      <div style={{ width: `${pct * 100}%`, height: "100%", background: over ? "var(--ns-neg)" : c.color, borderRadius: 99 }} />
                    </div>
                    <div className="text-xs text-right flex justify-end gap-1">
                      <span className={"num " + (over ? "neg" : "muted")}>{(pct * 100).toFixed(0)}%</span>
                      <span className="dim">·</span>
                      <span className={"num " + (over ? "neg" : "")}>NT${formatNumber(c.spent)}</span>
                    </div>
                  </div>
                );
              })}
              {totalBudget > 0 ? (
                <div className="muted text-xs mt-2 pt-2.5" style={{ borderTop: "1px solid var(--ns-border)" }}>
                  總預算 NT${formatNumber(totalBudget)}{overBudget.length ? ` · ${overBudget.length} 個分類超支` : ""}
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
      ) : null}

      {/* Row 3b · 淨值趨勢 (demoted; default-hidden, re-enableable from 版面) */}
      {cardVisible("netWorthTrend") ? (
        <Card className="mb-4" style={{ padding: 22 }}>
          <SectionHead eyebrow="Net worth trend" title="淨值趨勢" />
          {reconciledTrend.length > 1 ? (
            <div style={{ height: 280, position: "relative" }}>
              <div style={{ position: "absolute", inset: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleTrend}>
                    <defs>
                      <linearGradient id="netWorthTrendFull" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" stroke="var(--ns-fg-muted)" fontSize={11} minTickGap={24} />
                    <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
                    <Tooltip formatter={(value) => formatMoney(Number(value), primaryCurrency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }} itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg)" }} />
                    <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#netWorthTrendFull)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="muted text-body">累積幾筆資料後會顯示淨值趨勢。</div>
          )}
          {analyticsPositions.length > 0 ? (
            <PortfolioStrip period={stripPeriod} data={stripData} benchmarkTicker={benchmarkTicker} />
          ) : null}
          <div className="ns-dash-kpi-stack mt-4">
            <KpiCard label="投資" value={formatMoney(marketValue, primaryCurrency)} color="var(--ns-chart-1)" />
            <KpiCard label="現金 / 存款" value={formatMoney(availableCash, primaryCurrency)} color="var(--ns-chart-2)" />
            {alternativeAssets > 0 ? <KpiCard label="其他資產" value={formatMoney(alternativeAssets, primaryCurrency)} color="var(--ns-chart-4)" /> : null}
            <KpiCard label="負債" value={formatMoney(liabilities, primaryCurrency)} color="var(--ns-chart-5)" tone={liabilities > 0 ? "neg" : undefined} />
          </div>
        </Card>
      ) : null}

      {/* Row 4 · Allocation + Goals */}
      <div className="ns-dash-row3">
        {/* Allocation */}
        {cardVisible("allocation") ? (
        <Card style={{ padding: "var(--ns-pad-card)" }}>
          <SectionHead eyebrow="Asset allocation" title="資產配置" />
          {allocation.length === 0 ? (
            <div className="muted text-body">尚無資產可顯示配置。</div>
          ) : (
            <div className="flex flex-wrap gap-4 items-center">
              <div style={{ width: 120, height: 120, flexShrink: 0 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={42} outerRadius={60} stroke="none" paddingAngle={2}>
                      {allocation.map((a) => <Cell key={a.label} fill={a.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(Number(value), primaryCurrency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }} itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg)" }} />
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
                    <span className="flex-1 min-w-0 truncate" title={a.label}>{a.label}</span>
                    {/* Compact (萬/億 · K/M) so the value never forces the label to
                        wrap vertically on a narrow card. */}
                    <span className="num muted text-caption shrink-0" title={formatMoney(a.value, primaryCurrency)}>{formatCompactMoney(a.value, primaryCurrency)}</span>
                    <span className="num text-right shrink-0" style={{ minWidth: 42 }}>{a.pct.toFixed(1)}%</span>
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
          <SectionHead eyebrow="Goals" title={`${goals.length} 個進行中目標`} action={<Button variant="ghost" size="xs" render={<Link to="/goals" />}>全部 →</Button>} />
          {goals.length === 0 ? (
            <div className="muted text-body">還沒有設定目標。<Link to="/goals" className="accent">建立 FIRE 目標 →</Link></div>
          ) : (
            <div className="flex flex-col gap-4">
              {goals.map((g) => (
                <div key={g.id}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-body font-medium">{g.name}</span>
                    {g.pct >= 100 ? <Badge variant="success" size="sm" className="rounded-full px-2">達成</Badge> : null}
                  </div>
                  <div style={{ height: 8, borderRadius: 99, background: "var(--ns-bg-hover)", overflow: "hidden", marginBottom: 5 }}>
                    <div style={{ width: `${Math.min(g.pct, 100)}%`, height: "100%", background: "var(--ns-accent)", borderRadius: 99 }} />
                  </div>
                  <div className="text-caption flex justify-between">
                    <span className="mono accent">{g.pct.toFixed(1)}%</span>
                    <span className="mono muted">目標 {formatMoney(g.target, primaryCurrency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        ) : null}
      </div>

      {/* Row 5 · Recent activity (demoted; default-hidden, re-enableable from 版面) */}
      {cardVisible("recentActivity") ? (
      <Card className="mb-4">
        <div className="flex items-baseline justify-between" style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)" }}>
          <div>
            <div className="text-xs mb-1 muted font-medium">Recent activity</div>
            <h3 className="text-base m-0 font-medium" style={{ fontFamily: "var(--ns-font-display)" }}>最近交易</h3>
          </div>
          <Button variant="ghost" size="xs" render={<Link to="/cash-flow" />}>查看全部 →</Button>
        </div>
        {recent.length === 0 ? (
          <div className="muted text-body" style={{ padding: "18px 22px" }}>還沒有交易紀錄。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
            {recent.map((r, i) => (
              <div key={r.id} className="ns-row" style={{ gap: 12, paddingLeft: 22, paddingRight: 22, borderLeft: i % 2 === 1 ? "1px solid var(--ns-border)" : "none" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium truncate">{r.name || r.category || (r.entryType === "transfer" ? "轉帳" : "交易")}</div>
                  <div className="muted text-caption truncate">{r.date.slice(5).replace("T", " ")} · {accountMap.get(r.accountId)?.name ?? ""}</div>
                </div>
                <div className={"num text-sm text-right " + (r.amount >= 0 ? "pos" : "")} style={{ minWidth: 88 }}>
                  {r.amount >= 0 ? "+" : "−"}NT${formatNumber(Math.abs(r.amount))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      ) : null}

      {/* Row 6 · 30-year net-worth projection — FIRE-family (plan 189):
          fireNetWorth base + FIRE-scoped contribution, switcher-independent. */}
      {cardVisible("projection") ? (
        <NetWorthProjectionCard
          netWorth={fireNetWorth}
          annualContribution={Math.max(0, trailingMonthlyNetContrib * 12)}
          primaryCurrency={primaryCurrency}
        />
      ) : null}

    </div>
  );
}

/**
 * On-device AI monthly summary, rendered inline under the greeting header
 * (not a card — kept low-key/immersive). Renders only when Foundation
 * Models is available AND there is data. Uses aggregate numbers only — no
 * raw transactions/merchants/accounts/tickers.
 */
function MonthlySummaryInline({
  monthKey,
  income,
  expense,
  savingsRatePct,
  netWorthChange,
  currency,
  budgetCats,
}: {
  monthKey: string;
  income: number;
  expense: number;
  savingsRatePct: number;
  netWorthChange: number;
  currency: string;
  budgetCats: Array<{ name: string; spent: number }>;
}) {
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const ranRef = useRef(false);

  // Check FM availability once on mount.
  useEffect(() => {
    let cancelled = false;
    isFmAvailable().then((ok) => { if (!cancelled) setAvailable(ok); });
    return () => { cancelled = true; };
  }, []);

  const generate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const categorySpend = new Map<string, number>();
      for (const cat of budgetCats) {
        if (cat.spent > 0) categorySpend.set(cat.name, cat.spent);
      }
      const input = buildMonthlySummaryInput({
        month: monthKey,
        income,
        expense,
        savingsRatePct,
        netWorthChange,
        currency,
        categorySpend,
      });
      const text = await generateMonthlySummary(input);
      setSummaryText(text);
    } finally {
      setLoading(false);
    }
  }, [monthKey, income, expense, savingsRatePct, netWorthChange, currency, budgetCats, loading]);

  // Auto-generate once when data is ready and FM is available.
  useEffect(() => {
    if (ranRef.current || available !== true || income + expense === 0) return;
    ranRef.current = true;
    generate();
  }, [available, income, expense, generate]);

  // Don't render anything if FM is unavailable or still checking.
  if (available === false || available === null) return null;
  // Don't render if there's no month data yet.
  if (income + expense === 0) return null;
  // Don't render if generation failed with nothing to show — stay quiet.
  if (!loading && !summaryText) return null;

  return (
    <div className="mt-2 flex max-w-xl items-start gap-2">
      {loading ? (
        <Skeleton className="h-5 w-full" />
      ) : (
        <MarkdownText text={summaryText ?? ""} className="text-body muted leading-relaxed" />
      )}
      {!loading && summaryText ? (
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0"
          onClick={generate}
          title="由裝置端 AI 產生，不會上傳任何資料 · 重新產生"
          aria-label="重新產生本月摘要"
        >
          <ArrowsClockwise size={12} />
        </Button>
      ) : null}
    </div>
  );
}

/** Header one-liner: top FX pairs, replacing the standalone 匯率 card (plan 164). */
function FxInline({ rates }: { rates: Array<{ pair: string; rate: number; changePct: number | null }> }) {
  if (rates.length === 0) return null;
  return (
    <span className="mono" style={{ display: "inline-flex", gap: 14, alignItems: "center", fontSize: 11.5, color: "var(--ns-fg-dim)" }}>
      {rates.slice(0, 2).map((fx) => (
        <span key={fx.pair} style={{ display: "inline-flex", gap: 5, alignItems: "baseline" }}>
          <span>{fx.pair}</span>
          <span style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}>{fx.rate.toFixed(2)}</span>
          {fx.changePct != null ? (
            <span style={{ color: fx.changePct >= 0 ? "var(--ns-pos)" : "var(--ns-neg)", fontSize: 10.5 }}>
              {fx.changePct >= 0 ? "▲" : "▼"}{Math.abs(fx.changePct).toFixed(2)}%
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** 4-cell 一眼脈搏 strip under the net-worth hero (plan 164, Direction A). */
function PulseStrip({ cells }: { cells: Array<{ label: string; value: string; sub: string; color?: string }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", borderTop: "1px solid var(--ns-border)", marginTop: 16, paddingTop: 14 }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ paddingLeft: i ? 14 : 0, paddingRight: 14, borderLeft: i ? "1px solid var(--ns-border)" : "none", minWidth: 0 }}>
          <div className="text-xs muted font-medium truncate" style={{ fontSize: 10, marginBottom: 4 }}>{c.label}</div>
          <div className="num truncate" style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums", color: c.color ?? "var(--ns-fg)" }}>{c.value}</div>
          {c.sub ? <div className="muted text-caption truncate mt-0.5">{c.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

function KpiCard({ label, value, color, tone }: { label: string; value: string; color: string; tone?: "neg" }) {
  return (
    <Card className="flex flex-row items-center gap-2.5 min-w-0" style={{ padding: "13px 16px" }}>
      <div style={{ width: 4, height: 32, borderRadius: 99, background: color, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div className="text-xs muted font-medium" style={{ fontSize: 10 }}>{label}</div>
        <div className={"font-medium truncate " + (tone === "neg" ? "neg" : "")} style={{
          fontSize: "clamp(13px, 1.4vw, 18px)",
          fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums",
          marginTop: 1,
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
  data: { portfolio: number | null; benchmark: number | null; alpha: number | null; basis: "twr" | "fixed" };
  benchmarkTicker: string;
}) {
  const cells = [
    { label: "投資組合", val: data.portfolio, color: data.portfolio == null ? "var(--ns-fg-muted)" : data.portfolio >= 0 ? "var(--ns-gain)" : "var(--ns-loss)" },
    { label: `${benchmarkTicker} 指標`, val: data.benchmark, color: "var(--ns-fg-muted)" },
    { label: "超額報酬", val: data.alpha, color: data.alpha == null ? "var(--ns-fg-muted)" : data.alpha >= 0 ? "var(--ns-accent)" : "var(--ns-loss)" },
  ];
  return (
    <div className="mt-3.5">
      <div className="text-xs mb-2 muted font-medium">
        投資組合 vs Benchmark · {period} · {data.basis === "twr" ? "TWR 口徑" : "固定權重近似"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderRadius: "var(--ns-r-md)", border: "1px solid var(--ns-border)", overflow: "hidden" }}>
        {cells.map((c, i) => (
          <div key={c.label} style={{ padding: "10px 14px", borderLeft: i ? "1px solid var(--ns-border)" : "none", background: "var(--ns-bg-hover)", minWidth: 0 }}>
            <div className="text-xs muted font-medium truncate" style={{ fontSize: 10, marginBottom: 3 }}>{c.label}</div>
            <div className="num text-[19px]" style={{ fontWeight: 600, fontFamily: "var(--ns-font-num)", color: c.color, fontVariantNumeric: "tabular-nums" }}>{fmtPctSigned(c.val)}</div>
          </div>
        ))}
      </div>
      {data.portfolio == null ? (
        <div className="muted text-caption mt-1.5">
          需要更多每日股價才能計算期間報酬。<Link to="/investments" className="accent">前往回補 →</Link>
        </div>
      ) : data.benchmark == null ? (
        <div className="muted text-caption mt-1.5">
          尚無 {benchmarkTicker} 歷史股價，無法比較 benchmark。<Link to="/investments" className="accent">前往投資 →</Link>
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
      <div className="flex-1 min-w-0">
        <div className="mono text-xs font-semibold truncate">{mover.ticker}</div>
        <div className="muted text-micro truncate">{mover.name}</div>
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
    <div className="min-w-0">
      <div className="text-xs font-medium" style={{ fontSize: 10, marginBottom: 4, color: tone === "pos" ? "var(--ns-gain)" : "var(--ns-loss)" }}>
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

/** Merged 待辦 card: bills + credit cards + AR/AP, one date-sorted list (plan 164). */
function TodoCard({ rows, totalDue }: { rows: TodoRow[]; totalDue: number }) {
  return (
    <Card className="ns-dash-activity-card p-0">
      <div className="flex items-center justify-between pt-4 px-5 pb-3" style={{ borderBottom: "1px solid var(--ns-border)" }}>
        <div>
          <div className="text-xs mb-1 muted font-medium">To-do</div>
          <h3 className="text-base m-0 font-medium" style={{ fontFamily: "var(--ns-font-display)" }}>待辦 · 30 天</h3>
        </div>
        {totalDue < 0 ? <Badge variant="error" className="rounded-full px-2">NT${formatNumber(Math.abs(totalDue))}</Badge> : null}
      </div>
      {rows.length === 0 ? (
        <div className="muted text-body" style={{ padding: "18px 20px" }}>近期沒有待辦事項。</div>
      ) : (
        rows.map((row, i) => {
          const meta = TODO_META[row.type];
          const inner = (
            <>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: meta.color, flexShrink: 0 }} title={meta.label} />
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium truncate">{row.name}</div>
                {row.sub ? <div className="muted text-caption truncate">{row.sub}</div> : null}
              </div>
              <div className="text-right">
                <div className="num text-[13.5px]" style={{ color: row.amt >= 0 ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                  {row.amt >= 0 ? "+" : "−"}NT${formatNumber(Math.abs(row.amt))}
                </div>
                <div className="mono dim text-caption">{row.date}</div>
              </div>
            </>
          );
          const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none" };
          if (row.type === "card" && row.linkAccountId) {
            return (
              <Link key={row.key} to="/cash-flow/reconcile/$accountId" params={{ accountId: row.linkAccountId }} style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}>
                {inner}
              </Link>
            );
          }
          if ((row.type === "recv" || row.type === "pay") && row.linkTxId) {
            return (
              <Link key={row.key} to="/cash-flow" search={{ tx: row.linkTxId }} style={{ ...rowStyle, textDecoration: "none", color: "inherit" }}>
                {inner}
              </Link>
            );
          }
          return (
            <div key={row.key} style={rowStyle}>
              {inner}
            </div>
          );
        })
      )}
    </Card>
  );
}

function TopMoversCard({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  const empty = gainers.length === 0 && losers.length === 0;
  return (
    <Card className="ns-dash-activity-card p-0">
      <div className="flex items-baseline justify-between" style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--ns-border)" }}>
        <div>
          <div className="text-xs mb-1 muted font-medium">Today</div>
          <h3 className="text-base m-0 font-medium" style={{ fontFamily: "var(--ns-font-display)" }}>今日漲跌</h3>
        </div>
        <Button variant="ghost" size="xs" render={<Link to="/investments" />}>詳細 →</Button>
      </div>
      {empty ? (
        <div className="muted text-body" style={{ padding: "16px 18px" }}>回補歷史股價後顯示當日漲跌幅。</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 18px 16px" }}>
          {gainers.length > 0 ? <MoverColumn label="上漲" tone="pos" movers={gainers} /> : null}
          {losers.length > 0 ? <MoverColumn label="下跌" tone="neg" movers={losers} /> : null}
        </div>
      )}
    </Card>
  );
}

function SectionHead({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div className="text-xs mb-1 muted font-medium">{eyebrow}</div>
        <h3 className="text-base m-0 font-medium" style={{ fontFamily: "var(--ns-font-display)" }}>{title}</h3>
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
  manualPriceSnapshots: ManualPriceSnapshot[],
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
  const manualPriceLookup = buildManualPriceLookup(manualPriceSnapshots);
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
      const price = priceAssetOnDate(asset, valuationDate, { todayIso, dailyPriceLookup, quote, manualPriceLookup });
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
      const price = priceAssetOnDate(asset, todayIso, { todayIso, dailyPriceLookup, quote, manualPriceLookup });
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
