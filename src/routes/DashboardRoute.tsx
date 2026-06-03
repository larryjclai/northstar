import { ArrowDown, ArrowsClockwise, ArrowUp, Plus } from "@phosphor-icons/react";
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
import { useQuickAdd } from "../state/quickAdd";
import {
  assetTypeLabels,
  buildNetWorthBreakdown,
  buildCostBasisTimeline,
  buildCreditCardReminders,
  buildOutstandingSettlements,
  convertCurrency,
  createFxConverter,
  formatMoney,
  formatCompactMoney,
  formatNumber,
  type Account,
  type AppSettings,
  type DailyFxRate,
  type FinancialGoal,
  type InvestmentRecord,
  type LedgerTransaction,
  type PortfolioAsset,
  todayInTimezone,
} from "../domain";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";
import { useState } from "react";
import { MonthPicker } from "../components/ui/month-picker";
import { useUiPreferences } from "../state/uiPreferences";


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
  const { accounts, ledger, assets, quotes, settings, dailyFxRates, recurring, recurringInvestments, financialGoals, investments } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const timezone = useUiPreferences((state) => state.timezone);
  const queryClient = useQueryClient();
  const toast = useToast();
  const openQuickAdd = useQuickAdd((state) => state.setOpen);
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
  const recurringRows = recurring.data ?? [];
  const recurringInvestmentRows = recurringInvestments.data ?? [];
  const investmentRows = investments.data ?? [];
  const goalRows = financialGoals.data ?? [];

  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);
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
    <div style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}>
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
          <Link to="/cash-flow/categories" className="ns-btn ghost" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 12 }}>查看分類 →</Link>
        </div>
      ) : null}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Overview · {monthLabel}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 28, margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} />
          <MonthPicker value={monthKey} onChange={setMonthKey} triggerClassName="h-[36px] whitespace-nowrap" />
          <button className="ns-btn" style={{ height: 36, boxSizing: "border-box", whiteSpace: "nowrap" }} onClick={() => refreshQuotes.mutate(assetRows.map((a) => a.ticker))} disabled={refreshQuotes.isPending || assetRows.length === 0}>
            <ArrowsClockwise size={14} />{refreshQuotes.isPending ? "更新中" : "更新"}
          </button>
          <button type="button" className="ns-btn primary" style={{ height: 36, boxSizing: "border-box", whiteSpace: "nowrap" }} onClick={() => openQuickAdd(true)}><Plus size={14} weight="bold" />新增</button>
        </div>
      </div>

      {/* Row 1 · Net worth + KPI stack */}
      <div className="ns-dash-row1">
        <div className="ns-card" style={{ padding: 22, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="ns-eyebrow" style={{ marginBottom: 5 }}>Net worth · {primaryCurrency}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
              <span style={{ fontFamily: "var(--ns-font-mono)", fontVariantNumeric: "tabular-nums lining-nums",
                fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.025em", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                flexShrink: 1 }}>
                {formatMoney(netWorth, primaryCurrency)}
              </span>
              {trend.length >= 2 ? (
                <span className={"ns-pill " + (momChange >= 0 ? "solid-pos" : "solid-neg")}>
                  {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
                  <span className="num">{momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))} · {Math.abs(momPct).toFixed(2)}%</span>
                </span>
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
            <div style={{ flex: 1, minHeight: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
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
          ) : (
            // No meaningful trend yet → collapse to a slim hint instead of a tall
            // empty void, so the hero doesn't dominate the page.
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {hasAnyData ? "累積幾筆資料後會顯示淨值趨勢。" : "先建立第一個帳戶，Northstar 會開始計算總覽。"}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Link to={hasAnyData ? "/cash-flow" : "/accounts"} className="ns-btn primary" style={{ fontSize: 12 }}>{hasAnyData ? "去記帳" : "建立帳戶"}</Link>
                {!hasAnyData ? (
                  <button type="button" className="ns-btn" style={{ fontSize: 12 }} onClick={loadDemo} disabled={demoLoading}>
                    {demoLoading ? "載入中…" : "載入示範資料"}
                  </button>
                ) : null}
              </span>
            </div>
          )}
        </div>

        {/* KPI stack */}
        <div className="ns-dash-kpi-stack">
          <KpiCard label="投資" value={formatMoney(marketValue, primaryCurrency)} color="var(--ns-chart-1)" />
          <KpiCard label="現金 / 存款" value={formatMoney(availableCash, primaryCurrency)} color="var(--ns-chart-2)" />
          {alternativeAssets > 0 ? <KpiCard label="其他資產" value={formatMoney(alternativeAssets, primaryCurrency)} color="var(--ns-chart-4)" /> : null}
          <KpiCard label="負債" value={formatMoney(liabilities, primaryCurrency)} color="var(--ns-chart-5)" tone={liabilities > 0 ? "neg" : undefined} />
          <div className="ns-card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
          </div>
        </div>
      </div>

      {/* Row 2 · Budget + Upcoming */}
      <div className="ns-dash-row2">
        <div className="ns-card">
          <SectionHead eyebrow={`Budget · ${todayLabel.slice(0, todayLabel.indexOf("月") + 1) || "本月"}`} title="預算進度" action={<Link to="/cash-flow/categories" className="ns-btn ghost" style={{ fontSize: 12 }}>管理分類 →</Link>} />
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
        </div>

        <div className="ns-card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Upcoming</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>近期帳單 · 30 天</h3>
            </div>
            {upcoming.length ? <span className="ns-pill solid-neg" style={{ fontSize: 11 }}>NT${formatNumber(upcomingTotal)}</span> : null}
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
        </div>
      </div>

      {/* Credit-card payment reminders */}
      {creditReminders.length > 0 ? (
        <div className="ns-card" style={{ padding: 0, marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Credit cards</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>信用卡繳款提醒</h3>
            </div>
            <span className="ns-pill solid-neg" style={{ fontSize: 11 }}>NT${formatNumber(creditReminders.reduce((s, r) => s + r.outstanding, 0))}</span>
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
        </div>
      ) : null}

      {/* Outstanding receivables / payables */}
      {settlements.items.length > 0 ? (
        <div className="ns-card" style={{ padding: 0, marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Receivables &amp; payables</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>應收 / 應付未結清</h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {settlements.receivableTotal > 0 ? <span className="ns-pill" style={{ fontSize: 11, color: "var(--ns-chart-3)", borderColor: "var(--ns-chart-3)" }}>應收 NT${formatNumber(settlements.receivableTotal)}</span> : null}
              {settlements.payableTotal > 0 ? <span className="ns-pill" style={{ fontSize: 11, color: "var(--ns-chart-5)", borderColor: "var(--ns-chart-5)" }}>應付 NT${formatNumber(settlements.payableTotal)}</span> : null}
            </div>
          </div>
          {settlements.items.slice(0, 5).map((item, i) => (
            <Link key={item.id} to="/cash-flow" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
              <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px", color: item.kind === "receivable" ? "var(--ns-chart-3)" : "var(--ns-chart-5)", borderColor: item.kind === "receivable" ? "var(--ns-chart-3)" : "var(--ns-chart-5)" }}>{item.kind === "receivable" ? "應收" : "應付"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.counterparty || item.name}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{item.date.slice(0, 10)}</div>
              </div>
              <div className="num" style={{ fontSize: 13.5, color: item.kind === "receivable" ? "var(--ns-pos)" : "var(--ns-neg)" }}>
                {item.kind === "receivable" ? "+" : "−"}NT${formatNumber(toPrimary(item.amount, item.currency) ?? item.amount)}
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {/* Recurring investments due — top up the 交割款 */}
      {dueRecurringInvestments.length > 0 ? (
        <div className="ns-card" style={{ padding: 0, marginBottom: 16 }}>
          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recurring investments</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>定期定額提醒</h3>
            </div>
            <Link to="/investments" className="ns-btn ghost" style={{ fontSize: 12 }}>前往投資 →</Link>
          </div>
          {dueRecurringInvestments.map((r, i) => {
            const cash = (r.mode === "fixedShares" ? (r.quantity || 0) * (r.price || 0) : (r.amount || 0)) + (r.fee || 0);
            return (
              <Link key={r.id} to="/investments" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: i ? "1px solid var(--ns-border)" : "none", textDecoration: "none", color: "inherit" }}>
                <span className="ns-pill" style={{ fontSize: 10.5, padding: "2px 7px", color: "var(--ns-warn)", borderColor: "var(--ns-warn)" }}>{r.mode === "fixedShares" ? "定期定股" : "定期定額"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name || r.ticker}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{r.nextRunDate.slice(5)} 投入 · 請備妥交割款</div>
                </div>
                <div className="num" style={{ fontSize: 13.5, color: "var(--ns-neg)" }}>−NT${formatNumber(Math.round(cash))}</div>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Row 3 · Allocation + Goals + Market */}
      <div className="ns-dash-row3">
        {/* Allocation */}
        <div className="ns-card">
          <SectionHead eyebrow="Asset allocation" title="資產配置" />
          {allocation.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>尚無資產可顯示配置。</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 18, alignItems: "center" }}>
              <div style={{ width: 120, height: 120 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={42} outerRadius={60} stroke="none" paddingAngle={2}>
                      {allocation.map((a) => <Cell key={a.label} fill={a.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(value, primaryCurrency)} contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }} itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {allocation.map((a) => (
                  <div key={a.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, borderBottom: "1px solid var(--ns-border)", paddingBottom: 5 }}>
                    <span style={{ width: 8, height: 8, background: a.color, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</span>
                    {/* Compact (萬/億 · K/M) so the value never forces the label to
                        wrap vertically on a narrow card. */}
                    <span className="num muted" style={{ fontSize: 11, flexShrink: 0 }} title={formatMoney(a.value, primaryCurrency)}>{formatCompactMoney(a.value, primaryCurrency)}</span>
                    <span className="num" style={{ minWidth: 42, textAlign: "right", flexShrink: 0 }}>{a.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Goals */}
        <div className="ns-card">
          <SectionHead eyebrow="Goals" title={`${goals.length} active`} action={<Link to="/goals" className="ns-btn ghost" style={{ fontSize: 12 }}>全部 →</Link>} />
          {goals.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>還沒有設定目標。<Link to="/goals" style={{ color: "var(--ns-accent)" }}>建立 FIRE 目標 →</Link></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {goals.map((g) => (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                    {g.pct >= 100 ? <span className="ns-pill solid-pos" style={{ fontSize: 10 }}>達成</span> : null}
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
        </div>

        {/* Market FX */}
        <div className="ns-card" style={{ padding: 0 }}>
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
        </div>
      </div>

      {/* Row 4 · Recent activity */}
      <div className="ns-card" style={{ padding: 0 }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--ns-border)", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 4 }}>Recent activity</div>
            <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 16, fontWeight: 500 }}>最近交易</h3>
          </div>
          <Link to="/cash-flow" className="ns-btn ghost" style={{ fontSize: 12 }}>查看全部 →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: "18px 22px" }}>還沒有交易紀錄。</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
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
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, tone }: { label: string; value: string; color: string; tone?: "neg" }) {
  return (
    <div className="ns-card" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
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
    </div>
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

  // Cash side: opening balances + every settled ledger movement (which already
  // includes the cash leg of investment buys/sells).
  const cashDelta = new Map<string, number>();
  for (const account of accounts) {
    const joinedDate = dateOnly(account.createdAt);
    if (!joinedDate) continue;
    const key = monthKey(joinedDate);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(account.openingBalance, account.currency, joinedDate));
  }
  for (const row of settledRows) {
    const key = monthKey(row.date);
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + toPrimary(row.amount, row.currency, row.date));
  }

  // Holdings side: accrue cost basis over time so historical points include
  // investments (paired with the cash leg a buy nets to zero on its date; a
  // sell surfaces the realized gain). The final point swaps cost for market
  // value to capture unrealized gains, removing the old "flat then jump"
  // artifact where holdings only appeared at the very end.
  const currencyByAsset = new Map(assets.map((asset) => [asset.id, asset.currency]));
  const holdingsCostDelta = new Map<string, number>();
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of investments) {
    if (record.deletedAt !== null) continue;
    recordsByAsset.set(record.assetId, [...(recordsByAsset.get(record.assetId) ?? []), record]);
  }
  for (const [assetId, records] of recordsByAsset) {
    const currency = currencyByAsset.get(assetId) ?? "TWD";
    for (const { date, delta } of buildCostBasisTimeline(records)) {
      const key = monthKey(date);
      holdingsCostDelta.set(key, (holdingsCostDelta.get(key) ?? 0) + toPrimary(delta, currency, date));
    }
  }

  const startMonth = startCandidates.length
    ? monthKey([...startCandidates].sort()[0])
    : monthKey(settledRows[0].date);
  const orderedMonths = [...new Set([startMonth, ...cashDelta.keys(), ...holdingsCostDelta.keys()])].sort();

  let cashRunning = 0;
  let holdingsRunning = 0;
  const timeline: Array<{ date: string; value: number }> = [];
  for (const key of orderedMonths) {
    cashRunning += cashDelta.get(key) ?? 0;
    holdingsRunning += holdingsCostDelta.get(key) ?? 0;
    timeline.push({ date: formatMonth(key), value: cashRunning + holdingsRunning });
  }

  const quoteFor = (ticker: string) => quotes.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const currentHoldingsValue = assets.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    const value = quote ? quote.price * asset.totalQuantity : asset.averageCost * asset.totalQuantity;
    return sum + toPrimary(value, quote?.currency ?? asset.currency);
  }, 0);
  // Replace accrued cost with live market value at the current point so the last
  // reading matches the headline net worth (cash + market value of holdings).
  if (currentHoldingsValue > 0 || holdingsRunning > 0) {
    timeline.push({ date: "現在", value: cashRunning + currentHoldingsValue });
  }
  return timeline;
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 7);
  return date.toLocaleDateString("zh-TW", { year: "numeric", month: "short" });
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}
