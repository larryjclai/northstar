import { ArrowClockwise, CloudSlash, CurrencyCircleDollar, ChartLineUp, PlusCircle, Wallet } from "@phosphor-icons/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { Metric } from "../components/Metric";
import { useFinanceData } from "../data/hooks";
import { createFxConverter, formatMoney, formatPrice, formatQuantity, type Account, type AppSettings, type DailyFxRate, type LedgerTransaction, type PortfolioAsset } from "../domain";
import type { StoredMarketQuote } from "../data/repositories";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";

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
  const cash = accountRows.reduce((sum, account) => sum + toPrimary(account.balance, account.currency), 0);
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
  const hasHoldings = assetRows.some((asset) => asset.totalQuantity > 0);

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="總覽"
        description="檢視現金、投資持倉與本月現金流，所有資料先保存在你的裝置上。"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Metric label="本機現金" value={formatMoney(cash, primaryCurrency)} />
        </Card>
        <Card>
          <Metric label="已快取持倉市值" value={marketValue ? formatMoney(marketValue, primaryCurrency) : "待更新"} tone={marketValue ? "positive" : "neutral"} />
        </Card>
        <Card>
          <Metric label="本月淨流入" value={formatMoney(monthlyIncome + monthlyExpense, primaryCurrency)} />
        </Card>
      </div>
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
            />
          )}
        </Card>
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
            <div className="rounded-md border p-3" style={{ borderColor: "var(--ns-border)" }}>
              <div className="flex justify-between gap-3"><span>應收</span><span className="tabular">{formatMoney(receivable, primaryCurrency)}</span></div>
              <div className="mt-1 flex justify-between gap-3"><span>應付</span><span className="tabular">{formatMoney(payable, primaryCurrency)}</span></div>
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
      </div>
      {hasHoldings ? (
        <Card title="持倉摘要" action={<PlusCircle size={20} weight="duotone" />}>
          <div className="grid gap-3 md:grid-cols-2">
            {assetRows.filter((asset) => asset.totalQuantity > 0).map((asset) => {
              const quote = quoteFor(asset.ticker);
              return (
                <div key={asset.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{asset.ticker}</div>
                      <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                    </div>
                    <div className="tabular text-right">
                      <div>{formatQuantity(asset.totalQuantity)}</div>
                      <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{quote ? `${formatPrice(quote.price)} ${quote.currency}` : asset.currency}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
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
  const opening = accounts.reduce((sum, account) => sum + toPrimary(account.openingBalance, account.currency), 0);
  const settledRows = ledgerRows
    .filter((row) => row.settlementStatus === "settled")
    .sort((a, b) => a.date.localeCompare(b.date));
  if (accounts.length === 0 && settledRows.length === 0) return [];

  let running = opening;
  const monthly = new Map<string, number>();
  if (accounts.length > 0) monthly.set("起始", running);
  for (const row of settledRows) {
    running += toPrimary(row.amount, row.currency, row.date);
    monthly.set(formatMonth(row.date), running);
  }

  const quoteFor = (ticker: string) => quotes.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const currentHoldingsValue = assets.reduce((sum, asset) => {
    const quote = quoteFor(asset.ticker);
    const value = quote ? quote.price * asset.totalQuantity : asset.averageCost * asset.totalQuantity;
    return sum + toPrimary(value, quote?.currency ?? asset.currency);
  }, 0);
  if (currentHoldingsValue > 0) monthly.set("現在", running + currentHoldingsValue);
  return [...monthly.entries()].map(([date, value]) => ({ date, value }));
}

function formatMonth(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 7);
  return date.toLocaleDateString("zh-TW", { month: "short" });
}
