import { ArrowClockwise, ChartLineUp, PlusCircle, Wallet } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "../components/EmptyState";
import { useFinanceData } from "../data/hooks";
import {
  buildTopHoldingSummaries,
  calculateAvailableCash,
  calculateLiabilities,
  createFxConverter,
  formatMoney,
  resolveAssetName,
  type Account,
  type AppSettings,
  type DailyFxRate,
  type LedgerTransaction,
  type PortfolioAsset,
} from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import type { StoredMarketQuote } from "../data/repositories";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";

const CHART_COLORS = [
  "var(--ns-chart-1)",
  "var(--ns-chart-2)",
  "var(--ns-chart-3)",
  "var(--ns-chart-4)",
  "var(--ns-chart-5)",
];

function Mark({
  label, color, size = 36, mono = false,
}: {
  label: string; color: string; size?: number; mono?: boolean;
}) {
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        background: color, color: "var(--ns-bg)",
        borderRadius: "var(--ns-r-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: mono ? "var(--ns-font-mono)" : "var(--ns-font-display)",
        fontWeight: 600, fontSize: size <= 28 ? 11 : 13, letterSpacing: "0.02em",
      }}
    >
      {label.slice(0, 4)}
    </div>
  );
}

export function DashboardRoute() {
  const { accounts, ledger, assets, quotes, settings, dailyFxRates } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const appSettings = settings.data;
  const fxHistory = dailyFxRates.data ?? [];
  const { primaryCurrency, toPrimary } = createFxConverter(appSettings, fxHistory);
  const availableCash = calculateAvailableCash(accountRows, toPrimary);
  const liabilities = calculateLiabilities(accountRows, toPrimary);
  const monthlyIncome = ledgerRows
    .filter((row) => row.amount > 0 && !row.groupId && row.settlementStatus === "settled")
    .reduce((sum, row) => sum + toPrimary(row.amount, row.currency, row.date), 0);
  const monthlyExpense = ledgerRows
    .filter((row) => row.amount < 0 && !row.groupId && row.settlementStatus === "settled")
    .reduce((sum, row) => sum + toPrimary(row.amount, row.currency, row.date), 0);
  const quoteFor = (ticker: string) =>
    quoteRows.find((q) => q.symbol.toUpperCase() === ticker.toUpperCase());
  const marketValue = assetRows.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    return sum + toPrimary((quote?.price ?? 0) * asset.totalQuantity, quote?.currency ?? asset.currency);
  }, 0);
  const trend = buildNetWorthTrend(accountRows, ledgerRows, assetRows, quoteRows, appSettings, fxHistory);
  const hasAnyData = accountRows.length > 0 || ledgerRows.length > 0 || assetRows.length > 0;
  const topHoldings = buildTopHoldingSummaries(assetRows, quoteRows, toPrimary, 5);
  const hasHoldings = topHoldings.length > 0;
  const nameLocale = useUiPreferences((state) => state.nameLocale);

  const netWorth = availableCash + marketValue - liabilities;
  const monthlyNet = monthlyIncome + monthlyExpense;
  const today = new Date().toLocaleDateString("zh-TW", { month: "long", day: "numeric" });
  const cashAccountCount = accountRows.filter((a) => ["depository", "cash"].includes(a.type)).length;

  const recentLedger = [...ledgerRows]
    .filter((row) => row.settlementStatus === "settled")
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <div style={{ padding: "24px 32px 100px", overflowY: "auto" }}>
      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div className="ns-eyebrow" style={{ marginBottom: 6 }}>Overview · {today}</div>
          <h1 style={{ fontFamily: "var(--ns-font-display)", fontSize: 30, margin: 0, letterSpacing: -0.5, fontWeight: 600 }}>
            總覽
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="ns-btn"
            onClick={() => refreshQuotes.mutate(assetRows.map((a) => a.ticker))}
            disabled={refreshQuotes.isPending || assetRows.length === 0}
          >
            <ArrowClockwise size={14} />
            {refreshQuotes.isPending ? "更新中…" : "更新報價"}
          </button>
          <Link
            to="/cash-flow"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            className="ns-btn primary"
          >
            <PlusCircle size={14} />記一筆
          </Link>
        </div>
      </div>

      {/* ── Hero: Net worth ── */}
      <div className="ns-card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div className="ns-eyebrow" style={{ marginBottom: 8 }}>淨值 · {primaryCurrency}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span className="ns-num-xl">{formatMoney(netWorth, primaryCurrency)}</span>
              {monthlyNet !== 0 && (
                <span
                  className={"ns-pill " + (monthlyNet >= 0 ? "solid-pos" : "solid-neg")}
                  style={{ fontSize: 13, padding: "5px 12px" }}
                >
                  {monthlyNet >= 0 ? "↑" : "↓"} {formatMoney(Math.abs(monthlyNet), primaryCurrency)} 本月
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              現金 {formatMoney(availableCash, primaryCurrency)} · 持倉 {formatMoney(marketValue, primaryCurrency)} · 負債 {formatMoney(liabilities, primaryCurrency)}
            </div>
          </div>
          <div className="ns-seg">
            <button>YTD</button>
            <button aria-selected>ALL</button>
          </div>
        </div>

        <div style={{ height: 240 }}>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--ns-accent)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--ns-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), primaryCurrency)}
                  contentStyle={{
                    background: "var(--ns-bg-card)",
                    border: "1px solid var(--ns-border)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontFamily: "var(--ns-font-mono)",
                  }}
                  labelStyle={{ color: "var(--ns-fg-dim)", fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--ns-accent)"
                  fill="url(#netWorthGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={hasAnyData ? <ChartLineUp size={24} weight="duotone" /> : <Wallet size={24} weight="duotone" />}
              title={hasAnyData ? "累積幾筆資料後會顯示趨勢" : "先建立你的第一個帳戶"}
              description={
                hasAnyData
                  ? "淨值趨勢只會使用實際帳戶、收支與持倉資料，不會用示意資料補線。"
                  : "新增銀行、現金或投資帳戶後，Northstar 會開始從你的本機資料計算總覽。"
              }
              action={
                <Link
                  to={hasAnyData ? "/cash-flow" : "/accounts"}
                  className="ns-btn primary"
                  style={{ textDecoration: "none" }}
                >
                  {hasAnyData ? "繼續記帳" : "建立帳戶"}
                </Link>
              }
              secondaryAction={
                !hasAnyData ? (
                  <Link to="/investments" className="ns-btn" style={{ textDecoration: "none" }}>
                    新增持倉
                  </Link>
                ) : undefined
              }
            />
          )}
        </div>

        {trend.length > 1 && (
          <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 2, background: "var(--ns-accent)", display: "inline-block" }} />
              <span className="muted">淨值</span>
            </span>
            <span className="dim" style={{ marginLeft: "auto" }}>懸停圖表查看任一時間點 →</span>
          </div>
        )}
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
        <KpiCard
          label="投資持倉"
          value={formatMoney(marketValue, primaryCurrency)}
          sub={`${assetRows.length} 個持倉 · 市價`}
        />
        <KpiCard
          label="可用現金"
          value={formatMoney(availableCash, primaryCurrency)}
          sub={`${cashAccountCount} 個帳戶`}
        />
        <KpiCard
          label="負債"
          value={formatMoney(liabilities, primaryCurrency)}
          sub="信用卡、貸款"
        />
        <KpiCard
          label="本月淨流入"
          value={formatMoney(monthlyNet, primaryCurrency)}
          sub={`收 ${formatMoney(monthlyIncome, primaryCurrency)} · 支 ${formatMoney(Math.abs(monthlyExpense), primaryCurrency)}`}
          accent={monthlyNet >= 0 ? "pos" : "neg"}
        />
      </div>

      {/* ── Two-up: Holdings + Recent activity ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        {/* Holdings summary */}
        <div className="ns-card">
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: hasHoldings ? 4 : 0,
            }}
          >
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>持倉摘要</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 500 }}>
                {hasHoldings ? `前 ${topHoldings.length} 大持倉` : "尚無持倉"}
              </h3>
            </div>
            <Link
              to="/investments"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              className="ns-btn"
            >
              查看全部 →
            </Link>
          </div>
          {hasHoldings ? (
            topHoldings.map((row, i) => {
              const pctOfTotal = marketValue > 0 ? (row.marketValuePrimary / marketValue) * 100 : 0;
              const isPos = !row.hasQuote || row.dayChangePercent === null || row.dayChangePercent >= 0;
              return (
                <div
                  key={row.asset.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 0",
                    borderTop: "1px solid var(--ns-border)",
                  }}
                >
                  <Mark label={row.asset.ticker.slice(0, 4)} color={CHART_COLORS[i % 5]} mono size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="mono"
                      style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {row.asset.ticker}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {resolveAssetName(row.asset, nameLocale)} · {pctOfTotal.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="num" style={{ fontSize: 14, fontWeight: 500 }}>
                      {formatMoney(row.marketValuePrimary, primaryCurrency)}
                    </div>
                    {row.hasQuote && row.dayChangePercent !== null ? (
                      <div className={"num " + (isPos ? "pos" : "neg")} style={{ fontSize: 12 }}>
                        {isPos ? "+" : ""}{row.dayChangePercent.toFixed(2)}%
                      </div>
                    ) : (
                      <div className="dim" style={{ fontSize: 12 }}>待更新</div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ marginTop: 16 }}>
              <EmptyState
                icon={<ChartLineUp size={24} weight="duotone" />}
                title="尚無持倉"
                description="在投資頁新增持倉後，這裡會顯示你的資產分配。"
                action={
                  <Link to="/investments" className="ns-btn primary" style={{ textDecoration: "none" }}>
                    新增持倉
                  </Link>
                }
              />
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="ns-card" style={{ padding: 0 }}>
          <div
            style={{
              padding: 20, paddingBottom: 14,
              display: "flex", alignItems: "baseline", justifyContent: "space-between",
            }}
          >
            <div>
              <div className="ns-eyebrow" style={{ marginBottom: 4 }}>最近動態</div>
              <h3 style={{ margin: 0, fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 500 }}>
                {recentLedger.length > 0 ? `最新 ${recentLedger.length} 筆` : "尚無記錄"}
              </h3>
            </div>
            <Link to="/cash-flow" className="muted" style={{ fontSize: 12.5, textDecoration: "none" }}>
              查看全部 →
            </Link>
          </div>
          {recentLedger.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}>
              <EmptyState
                icon={<Wallet size={22} weight="duotone" />}
                title="尚無交易"
                description="記錄第一筆收入或支出後，這裡會顯示最近動態。"
                action={
                  <Link to="/cash-flow" className="ns-btn primary" style={{ textDecoration: "none" }}>
                    記一筆
                  </Link>
                }
              />
            </div>
          ) : (
            recentLedger.map((row, i) => {
              const isIncome = row.amount > 0;
              const displayName = row.name || row.merchant || "—";
              const initials = displayName.replace(/\s+/g, "").slice(0, 2).toUpperCase();
              const amtInPrimary = toPrimary(row.amount, row.currency, row.date);
              return (
                <div key={row.id} className="ns-row" style={{ gap: 12 }}>
                  <Mark label={initials} color={CHART_COLORS[i % 5]} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5, fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {displayName}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {row.date.slice(0, 10)} · {row.category || row.currency}
                    </div>
                  </div>
                  <div
                    className={"num " + (isIncome ? "pos" : "")}
                    style={{ fontSize: 14, minWidth: 100, textAlign: "right" }}
                  >
                    {isIncome ? "+" : "−"}{formatMoney(Math.abs(amtInPrimary), primaryCurrency)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: "pos" | "neg";
}) {
  return (
    <div className="ns-card" style={{ padding: "var(--ns-pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="ns-eyebrow">{label}</span>
      <div className={"ns-num-md " + (accent ?? "")} style={accent ? { color: `var(--ns-${accent})` } : undefined}>
        {value}
      </div>
      {sub && <span className="muted" style={{ fontSize: 12 }}>{sub}</span>}
    </div>
  );
}

function buildNetWorthTrend(
  accounts: Account[],
  ledgerRows: LedgerTransaction[],
  assets: PortfolioAsset[],
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

  const monthDelta = new Map<string, number>();
  for (const account of accounts) {
    const joinedDate = dateOnly(account.createdAt);
    if (!joinedDate) continue;
    const key = monthKey(joinedDate);
    monthDelta.set(key, (monthDelta.get(key) ?? 0) + toPrimary(account.openingBalance, account.currency, joinedDate));
  }
  for (const row of settledRows) {
    const key = monthKey(row.date);
    monthDelta.set(key, (monthDelta.get(key) ?? 0) + toPrimary(row.amount, row.currency, row.date));
  }

  const startMonth = startCandidates.length
    ? monthKey([...startCandidates].sort()[0])
    : monthKey(settledRows[0].date);
  const orderedMonths = [...new Set([startMonth, ...monthDelta.keys()])].sort();

  let running = 0;
  const timeline: Array<{ date: string; value: number }> = [];
  for (const key of orderedMonths) {
    running += monthDelta.get(key) ?? 0;
    timeline.push({ date: formatMonth(key), value: running });
  }

  const quoteFor = (ticker: string) => quotes.find((q) => q.symbol.toUpperCase() === ticker.toUpperCase());
  const currentHoldingsValue = assets.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    const value = quote ? quote.price * asset.totalQuantity : asset.averageCost * asset.totalQuantity;
    return sum + toPrimary(value, quote?.currency ?? asset.currency);
  }, 0);
  if (currentHoldingsValue > 0) {
    timeline.push({ date: "現在", value: running + currentHoldingsValue });
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
