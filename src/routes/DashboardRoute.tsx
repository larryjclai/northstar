import { ArrowClockwise, CloudSlash, CurrencyCircleDollar, TrendUp } from "@phosphor-icons/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ActionButton } from "../components/ActionButton";
import { PageHeader } from "../components/AppShell";
import { Card } from "../components/Card";
import { Metric } from "../components/Metric";
import { useFinanceData } from "../data/hooks";
import { useRefreshQuotes } from "../features/market-data/useMarketRefresh";

const trend = [
  { date: "Jan", value: 920000 },
  { date: "Feb", value: 956000 },
  { date: "Mar", value: 948000 },
  { date: "Apr", value: 1008000 },
  { date: "May", value: 1036000 },
];

export function DashboardRoute() {
  const { accounts, ledger, assets, quotes } = useFinanceData();
  const refreshQuotes = useRefreshQuotes();
  const accountRows = accounts.data ?? [];
  const ledgerRows = ledger.data ?? [];
  const assetRows = assets.data ?? [];
  const quoteRows = quotes.data ?? [];
  const cash = accountRows.reduce((sum, account) => sum + account.balance, 0);
  const monthlyIncome = ledgerRows.filter((row) => row.amount > 0 && !row.groupId).reduce((sum, row) => sum + row.amount, 0);
  const monthlyExpense = ledgerRows.filter((row) => row.amount < 0 && !row.groupId).reduce((sum, row) => sum + row.amount, 0);
  const quoteFor = (ticker: string) => quoteRows.find((quote) => quote.symbol.toUpperCase() === ticker.toUpperCase());
  const marketValue = assetRows.reduce((sum, asset) => sum + (quoteFor(asset.ticker)?.price ?? 0) * asset.totalQuantity, 0);
  const lastQuote = [...quoteRows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="財務北極星"
        description="Phase 1-6 已把本機資料庫、CRUD、CSV 與 Yahoo refresh 串起來；Connect 仍維持後續階段。"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Metric label="本機現金" value={`NT$${cash.toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`} />
        </Card>
        <Card>
          <Metric label="已快取持倉市值" value={marketValue ? marketValue.toLocaleString("zh-TW", { maximumFractionDigits: 0 }) : "待更新"} tone={marketValue ? "positive" : "neutral"} />
        </Card>
        <Card>
          <Metric label="本月淨流入" value={`NT$${(monthlyIncome + monthlyExpense).toLocaleString("zh-TW")}`} />
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title="淨值趨勢">
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
                <Tooltip formatter={(value) => `NT$${Number(value).toLocaleString("zh-TW")}`} />
                <Area type="monotone" dataKey="value" stroke="var(--ns-accent)" fill="url(#netWorth)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title="Market data"
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
                <div style={{ color: "var(--ns-muted)" }}>provider layer 具備快取 guard</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CloudSlash size={24} weight="duotone" style={{ color: "var(--ns-warn)" }} />
              <div>
                <div className="font-semibold">Local-only first</div>
                <div style={{ color: "var(--ns-muted)" }}>Connect remains optional and recovery-gated</div>
              </div>
            </div>
            {refreshQuotes.error ? <div style={{ color: "var(--ns-negative)" }}>{refreshQuotes.error.message}</div> : null}
          </div>
        </Card>
      </div>
      <Card title="持倉摘要" action={<TrendUp size={20} weight="duotone" />}>
        <div className="grid gap-3 md:grid-cols-2">
          {assetRows.map((asset) => {
            const quote = quoteFor(asset.ticker);
            return (
              <div key={asset.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{asset.ticker}</div>
                    <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                  </div>
                  <div className="tabular text-right">
                    <div>{asset.totalQuantity}</div>
                    <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{quote ? `${quote.price.toFixed(2)} ${quote.currency}` : asset.currency}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
