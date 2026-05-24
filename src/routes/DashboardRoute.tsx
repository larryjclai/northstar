import { ArrowClockwise, CloudSlash, CurrencyCircleDollar, TrendUp } from "@phosphor-icons/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { Metric } from "../components/Metric";
import { PageHeader } from "../components/AppShell";
import { seedAccounts, seedAssets, seedLedgerTransactions } from "../data/seed";

const trend = [
  { date: "Jan", value: 920000 },
  { date: "Feb", value: 956000 },
  { date: "Mar", value: 948000 },
  { date: "Apr", value: 1008000 },
  { date: "May", value: 1036000 },
];

export function DashboardRoute() {
  const cash = seedAccounts.reduce((sum, account) => sum + account.balance, 0);
  const monthlyIncome = seedLedgerTransactions.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const monthlyExpense = seedLedgerTransactions.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="mx-auto max-w-6xl p-5 lg:p-8">
      <PageHeader
        title="財務北極星"
        description="新的 Tauri 版本以 local-first SQLite 為中心，Connect 同步與家庭共享會在本機加密邊界穩定後接上。"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Metric label="估計淨值" value="NT$1,036,000" tone="positive" />
        </Card>
        <Card>
          <Metric label="本機現金" value={`NT$${cash.toLocaleString("zh-TW")}`} />
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
        <Card title="Market data">
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <CurrencyCircleDollar size={24} weight="duotone" style={{ color: "var(--ns-accent)" }} />
              <div>
                <div className="font-semibold">Yahoo Finance</div>
                <div style={{ color: "var(--ns-muted)" }}>v1 quote/history/FX provider</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ArrowClockwise size={24} weight="duotone" style={{ color: "var(--ns-accent)" }} />
              <div>
                <div className="font-semibold">60s quotes / 5m FX</div>
                <div style={{ color: "var(--ns-muted)" }}>local cache guard is encoded in provider layer</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CloudSlash size={24} weight="duotone" style={{ color: "var(--ns-warn)" }} />
              <div>
                <div className="font-semibold">Local-only first</div>
                <div style={{ color: "var(--ns-muted)" }}>Connect is optional and requires Recovery Kit</div>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <Card title="持倉摘要" action={<TrendUp size={20} weight="duotone" />} >
        <div className="grid gap-3 md:grid-cols-2">
          {seedAssets.map((asset) => (
            <div key={asset.id} className="rounded-md border p-4" style={{ borderColor: "var(--ns-border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{asset.ticker}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.name}</div>
                </div>
                <div className="tabular text-right">
                  <div>{asset.totalQuantity}</div>
                  <div className="text-sm" style={{ color: "var(--ns-muted)" }}>{asset.currency}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

