import { ArrowClockwise, CalendarBlank, CloudSlash, CurrencyCircleDollar, ChartLineUp, PlusCircle, Wallet } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Metric } from "../components/Metric";
import { useFinanceData } from "../data/hooks";
import { buildTopHoldingSummaries, calculateAvailableCash, calculateLiabilities, createFxConverter, formatMoney, formatNumber, formatPrice, resolveAssetName, type Account, type AppSettings, type DailyFxRate, type LedgerTransaction, type PortfolioAsset, type RecurringTransaction } from "../domain";
import { useUiPreferences } from "../state/uiPreferences";
import type { StoredMarketQuote } from "../data/repositories";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";

export function DashboardRoute() {
  const { accounts, ledger, assets, quotes, settings, dailyFxRates, recurring } = useFinanceData();
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
  const monthlyIncome = ledgerRows.filter((row) => row.amount > 0 && !row.groupId && row.settlementStatus === "settled").reduce((sum, row) => sum + toPrimary(row.amount, row.currency, row.date), 0);
  const monthlyExpense = ledgerRows.filter((row) => row.amount < 0 && !row.groupId && row.settlementStatus === "settled").reduce((sum, row) => sum + toPrimary(row.amount, row.currency, row.date), 0);
  const receivable = ledgerRows.filter((row) => row.settlementStatus === "receivable").reduce((sum, row) => sum + toPrimary(Math.abs(row.amount), row.currency, row.date), 0);
  const payable = ledgerRows.filter((row) => row.settlementStatus === "payable").reduce((sum, row) => sum + toPrimary(Math.abs(row.amount), row.currency, row.date), 0);
  const quoteFor = (ticker: string) => quoteRows.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const marketValue = assetRows.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    return sum + toPrimary((quote?.price ?? 0) * asset.totalQuantity, quote?.currency ?? asset.currency);
  }, 0);
  const lastQuote = [...quoteRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const trend = buildNetWorthTrend(accountRows, ledgerRows, assetRows, quoteRows, appSettings, fxHistory);
  const hasAnyData = accountRows.length > 0 || ledgerRows.length > 0 || assetRows.length > 0;
  const topHoldings = buildTopHoldingSummaries(assetRows, quoteRows, toPrimary, 5);
  const hasHoldings = topHoldings.length > 0;
  const nameLocale = useUiPreferences((state) => state.nameLocale);
  const recurringRows = recurring.data ?? [];
  const accountMap = new Map(accountRows.map((a) => [a.id, a]));
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksLater = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); })();
  const upcomingPayments = recurringRows
    .filter((row) => row.isActive && row.nextRunDate >= today && row.nextRunDate <= twoWeeksLater)
    .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="總覽"
        description="檢視現金、投資持倉與本月現金流，所有資料先保存在你的裝置上。"
        action={
          <Link
            to="/cash-flow"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold"
            style={{ background: "var(--ns-accent)", color: "var(--ns-on-accent)", borderColor: "var(--ns-accent)", boxShadow: "var(--ns-shadow)" }}
          >
            <PlusCircle size={16} />記第一筆
          </Link>
        }
        meta={
          <>
            <span className="inline-flex rounded-full border px-2 py-1 text-xs font-medium" style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)" }}>
              Local-first
            </span>
            <span className="inline-flex rounded-full border px-2 py-1 text-xs font-medium" style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)" }}>
              Privacy mode ready
            </span>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Metric label="可用現金" value={formatMoney(availableCash, primaryCurrency)} />
        </Card>
        <Card>
          <Metric label="負債" value={formatMoney(liabilities, primaryCurrency)} tone={liabilities > 0 ? "negative" : "neutral"} />
        </Card>
        <Card>
          <Metric label="已快取持倉市值" value={marketValue ? formatMoney(marketValue, primaryCurrency) : "待更新"} tone={marketValue ? "positive" : "neutral"} />
        </Card>
        <Card>
          <Metric label="本月淨流入" value={formatMoney(monthlyIncome + monthlyExpense, primaryCurrency)} />
        </Card>
      </div>
      {upcomingPayments.length > 0 ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
          <div className="mb-3 flex items-center gap-2">
            <CalendarBlank size={16} weight="duotone" style={{ color: "var(--ns-accent)" }} />
            <span className="text-sm font-semibold">即將到來的付款（近 2 週）</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingPayments.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm" style={{ background: "var(--ns-surface-strong)" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{row.merchant || row.category}{row.subcategory ? ` / ${row.subcategory}` : ""}</div>
                  <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{row.nextRunDate} · {accountMap.get(row.accountId)?.name ?? row.accountId}</div>
                </div>
                <div className="tabular shrink-0 font-semibold" style={{ color: row.entryType === "income" ? "var(--ns-positive, var(--ns-accent))" : "var(--ns-danger, #c0392b)" }}>
                  {row.entryType === "income" ? "+" : "-"}{formatNumber(Math.abs(row.amount))} {row.currency}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title="淨值趨勢">
          {trend.length > 1 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="netWorth" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="var(--ns-muted)" />
                  <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
                  <Tooltip formatter={(value) => formatMoney(Number(value), primaryCurrency)} />
                  <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#netWorth)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={hasAnyData ? <ChartLineUp size={24} weight="duotone" /> : <Wallet size={24} weight="duotone" />}
              title={hasAnyData ? "累積幾筆資料後會顯示趨勢" : "先建立你的第一個帳戶"}
              description={hasAnyData ? "淨值趨勢只會使用實際帳戶、收支與持倉資料，不會用示意資料補線。" : "新增銀行、現金或投資帳戶後，Northstar 會開始從你的本機資料計算總覽。"}
              action={
                <Link
                  to={hasAnyData ? "/cash-flow" : "/accounts"}
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--ns-accent)", color: "var(--ns-on-accent)", borderColor: "var(--ns-accent)" }}
                >
                  {hasAnyData ? "繼續記帳" : "建立帳戶"}
                </Link>
              }
              secondaryAction={
                <Link
                  to="/investments"
                  className="inline-flex min-h-8 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--ns-surface-elevated)", color: "var(--ns-text)", borderColor: "var(--ns-border)" }}
                >
                  新增持倉
                </Link>
              }
            />
          )}
        </Card>
        <div className="grid gap-4">
          <Card
            title="報價"
            action={<ActionButton onClick={() => refreshQuotes.mutate(assetRows.map((asset) => asset.ticker))} disabled={refreshQuotes.isPending || assetRows.length === 0}><ArrowClockwise size={16} />更新</ActionButton>}
          >
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <CurrencyCircleDollar size={24} weight="duotone" style={{ color: "var(--ns-accent)" }} />
                <div>
                  <div className="font-semibold">Yahoo Finance</div>
                  <div style={{ color: "var(--ns-muted)" }}>{lastQuote ? `更新於 ${new Date(lastQuote.updatedAt).toLocaleString("zh-TW")}` : "尚未更新報價"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ArrowClockwise size={24} weight="duotone" style={{ color: "var(--ns-accent)" }} />
                <div>
                  <div className="font-semibold">60s quotes / 5m FX</div>
                  <div style={{ color: "var(--ns-muted)" }}>短時間重複更新會使用快取</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CloudSlash size={24} weight="duotone" style={{ color: "var(--ns-warn)" }} />
                <div>
                  <div className="font-semibold">本機優先</div>
                  <div style={{ color: "var(--ns-muted)" }}>同步功能啟用前會先建立救援金鑰</div>
                </div>
              </div>
              {refreshQuotes.error ? <div style={{ color: "var(--ns-negative)" }}>{refreshQuotes.error.message}</div> : null}
            </div>
          </Card>
          <Card title="待收付">
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>應收</span><span className="tabular font-semibold">{formatMoney(receivable, primaryCurrency)}</span></div>
              <div className="flex justify-between gap-3"><span style={{ color: "var(--ns-muted)" }}>應付</span><span className="tabular font-semibold">{formatMoney(payable, primaryCurrency)}</span></div>
            </div>
          </Card>
        </div>
      </div>
      {hasHoldings ? (
        <div className="mt-4">
          <Card
          title="持倉摘要"
          action={(
            <Link
              to="/investments"
              className="inline-flex min-h-8 items-center justify-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
              style={{ borderColor: "var(--ns-border)", color: "var(--ns-accent)", background: "var(--ns-accent-soft)" }}
            >
              <PlusCircle size={14} weight="duotone" />前往投資
            </Link>
          )}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {topHoldings.map((row) => {
                const asset = row.asset;
                return (
                  <div key={asset.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{asset.ticker}</div>
                        <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{resolveAssetName(asset, nameLocale)}</div>
                      </div>
                      <div className="tabular text-right">
                        <div>{formatMoney(row.marketValuePrimary, primaryCurrency)}</div>
                        {row.hasQuote && row.dayChangePrimary !== null && row.dayChangePercent !== null ? (
                          <div
                            className="text-sm"
                            style={{ color: row.dayChangePrimary >= 0 ? "var(--ns-positive)" : "var(--ns-negative)" }}
                          >
                            {formatSignedMoney(row.dayChangePrimary, primaryCurrency)} ({row.dayChangePercent >= 0 ? "+" : ""}{row.dayChangePercent.toFixed(2)}%)
                          </div>
                        ) : (
                          <div className="text-sm" style={{ color: "var(--ns-muted)" }}>待更新</div>
                        )}
                        <div className="text-xs" style={{ color: "var(--ns-muted)" }}>{row.hasQuote ? `${formatPrice(row.marketValue / asset.totalQuantity)} ${row.currency}` : asset.currency}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}
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

  const quoteFor = (ticker: string) => quotes.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
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

function formatSignedMoney(value: number, currency: string) {
  return `${value >= 0 ? "+" : ""}${formatMoney(value, currency)}`;
}

function dateOnly(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}
